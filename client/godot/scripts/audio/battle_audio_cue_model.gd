extends RefCounted

## Pure mapping from the already-resolved battle playback facts to semantic
## audio requests. This model never reads battle state, loads resources, or
## remembers which requests were played; the caller owns timing and de-duping.

const PHASE_ACTION_START := "action_start"
const PHASE_CONTACT := "contact"
const PHASE_REACTION := "reaction"
const PHASE_DOWN := "down"
const PHASE_OUTCOME := "outcome"

const PRIORITY_OUTCOME := 100
const PRIORITY_REACTION := 90
const PRIORITY_EMPHASIS := 80
const PRIORITY_CONTACT := 60
const PRIORITY_MOTION := 40
const PRIORITY_VOICE := 30

const COMBO_STAGGER_SECONDS := 0.24
const COMBO_DEFAULT_CONTACT_PROGRESS := 0.56
const COMBO_MIN_CONTACT_SPACING := 0.06
const COMBO_MAX_CONTACT_SPACING := 0.18
const GUARD_READY_DEFAULT_PROGRESS := 0.18
const REACTION_PROGRESS_AFTER_CONTACT := 0.08
const DOWN_PROGRESS_FLOOR := 0.74
const DOWN_PROGRESS_AFTER_CONTACT := 0.28
const BOUNCE_EDGE_FRACTION_AFTER_LAUNCH := 0.36
const LAUNCH_MIN_PROGRESS_AFTER_CONTACT := 0.03
const BOUNCE_MIN_PROGRESS_AFTER_LAUNCH := 0.03
const DOWN_MIN_PROGRESS_AFTER_CONTACT := 0.16
const LAUNCH_PROGRESS_MAX := 0.97
const BOUNCE_LAUNCH_PROGRESS_MAX := 0.96
const BOUNCE_PROGRESS_MAX := 0.99
const DOWN_PROGRESS_MAX := 0.96

const MARKER_OPTION_KEYS: Array[String] = [
	"cooldownKey",
	"gainDbOffset",
	"pitchScale",
	"spatialPosition",
]

const DAMAGE_EVENT_TYPES: Array[String] = [
	"attack",
	"skill_attack",
	"combo_attack",
	"counter_attack",
	"multi_attack",
]
const SKILL_EVENT_TYPES: Array[String] = [
	"skill_attack",
	"skill_status",
	"multi_attack",
	"spirit_heal",
	"spirit_heal_all",
]
const PET_KINDS: Array[String] = ["pet", "wild_pet"]


static func requests_for_phase(
	event: Dictionary,
	phase: String,
	actor_context: Dictionary = {}
) -> Array[Dictionary]:
	match phase:
		PHASE_ACTION_START:
			return _action_start_requests(event, actor_context)
		PHASE_CONTACT:
			return _contact_requests(event)
		PHASE_REACTION:
			return _reaction_requests(event, actor_context)
		PHASE_DOWN:
			return _down_requests(event)
		PHASE_OUTCOME:
			return _outcome_requests(event)
		_:
			return []


static func damage_reveal_progress(event: Dictionary) -> float:
	var timeline = event.get("timeline", {})
	if not (timeline is Dictionary):
		return 0.0
	var typed_timeline := timeline as Dictionary
	if not typed_timeline.has("damageRevealProgress"):
		return 0.0
	var value = typed_timeline.get("damageRevealProgress")
	if typeof(value) != TYPE_FLOAT and typeof(value) != TYPE_INT:
		return 0.0
	return clampf(float(value), 0.0, 1.0)


## Builds a complete, progress-keyed audio schedule without mutating the event.
##
## `requests_for_phase()` remains the compatibility contract for the v1 phase
## controller. New playback should consume this marker contract instead:
## {
##   "markerId": String,
##   "cueId": String,
##   "phase": String,
##   "progress": float in [0, 0.99],
##   "priority": int,
##   "options": {
##     "gainDbOffset"?: float,
##     "pitchScale"?: float,
##     "spatialPosition"?: Vector2,
##   },
## }
##
## Optional actor-context fields are presentation-only:
## - attackerSpatialPosition / targetSpatialPosition: Vector2
## - participantSpatialPositions: participant id -> Vector2
## - cueOptions: cue id -> the three allow-listed marker options
static func timed_markers(
	event: Dictionary,
	actor_context: Dictionary = {}
) -> Array[Dictionary]:
	var event_type := str(event.get("type", ""))
	if event_type == "combo_attack":
		return _combo_timed_markers(event, actor_context)

	var markers: Array[Dictionary] = []
	_append_phase_markers(
		markers,
		requests_for_phase(event, PHASE_ACTION_START, actor_context),
		0.0,
		actor_context,
		"attacker"
	)
	if event_type == "defend":
		var guard_progress := _timeline_progress(
			event,
			"guardReadyProgress",
			GUARD_READY_DEFAULT_PROGRESS
		)
		_append_timed_marker(
			markers,
			"guard_ready",
			"combat.guard_ready",
			PHASE_ACTION_START,
			guard_progress,
			PRIORITY_CONTACT,
			_options_for(
				"combat.guard_ready",
				actor_context,
				_spatial_position(actor_context, "attacker")
			)
		)

	var contact_progress := _safe_contact_progress(
		event,
		damage_reveal_progress(event)
	)
	_append_phase_markers(
		markers,
		requests_for_phase(event, PHASE_CONTACT, actor_context),
		contact_progress,
		actor_context,
		"target"
	)

	var reaction_progress := minf(
		0.94,
		contact_progress + REACTION_PROGRESS_AFTER_CONTACT
	)
	if bool(event.get("launch", event.get("serverLaunched", false))):
		reaction_progress = _launch_sound_progress(event, contact_progress)
		if str(event.get("launchMode", "")) == "bounce":
			_append_timed_marker(
				markers,
				"launch",
				"combat.launch",
				PHASE_REACTION,
				reaction_progress,
				PRIORITY_REACTION,
				_options_for(
					"combat.launch",
					actor_context,
					_spatial_position(actor_context, "target")
				)
			)
			_append_timed_marker(
				markers,
				"bounce_edge",
				"combat.bounce_edge",
				PHASE_REACTION,
				_bounce_impact_progress(event, reaction_progress),
				PRIORITY_REACTION,
				_options_for(
					"combat.bounce_edge",
					actor_context,
					_spatial_position(actor_context, "target")
				)
			)
			_append_non_launch_reaction_markers(
				markers,
				event,
				actor_context,
				reaction_progress
			)
		else:
			_append_phase_markers(
				markers,
				requests_for_phase(event, PHASE_REACTION, actor_context),
				reaction_progress,
				actor_context,
				"target"
			)
	else:
		_append_phase_markers(
			markers,
			requests_for_phase(event, PHASE_REACTION, actor_context),
			reaction_progress,
			actor_context,
			"target"
		)

	var down_progress := minf(
		DOWN_PROGRESS_MAX,
		maxf(DOWN_PROGRESS_FLOOR, contact_progress + DOWN_PROGRESS_AFTER_CONTACT)
	)
	down_progress = _timeline_progress(event, "downSoundProgress", down_progress)
	down_progress = clampf(
		maxf(down_progress, contact_progress + DOWN_MIN_PROGRESS_AFTER_CONTACT),
		0.0,
		DOWN_PROGRESS_MAX
	)
	_append_phase_markers(
		markers,
		requests_for_phase(event, PHASE_DOWN, actor_context),
		down_progress,
		actor_context,
		"target"
	)
	_append_phase_markers(
		markers,
		requests_for_phase(event, PHASE_OUTCOME, actor_context),
		0.0,
		actor_context,
		"target"
	)
	return markers


static func _combo_timed_markers(
	event: Dictionary,
	actor_context: Dictionary
) -> Array[Dictionary]:
	var markers: Array[Dictionary] = []
	var combo_start_progress := _timeline_progress(event, "comboStartProgress", 0.0)
	_append_timed_marker(
		markers,
		"combo_start",
		"combat.combo_start",
		PHASE_ACTION_START,
		combo_start_progress,
		PRIORITY_MOTION,
		_options_for(
			"combat.combo_start",
			actor_context,
			_spatial_position(actor_context, "attacker")
		)
	)

	var participant_ids := _participant_ids(event)
	var contact_progresses := _combo_contact_progresses(event, participant_ids.size())
	var contact_facts := _contact_facts(event)
	if bool(contact_facts.get("anySolidHit", false)):
		for index in range(contact_progresses.size()):
			var participant_id := participant_ids[index]
			var light_options := {
				"cooldownKey": "combat.hit_light.combo.%d" % index,
				"gainDbOffset": -8.0 + minf(1.5, float(index) * 0.5),
				"pitchScale": 0.96 + 0.03 * float(index % 3),
			}
			var participant_position = _participant_spatial_position(
				actor_context,
				participant_id
			)
			light_options = _options_for(
				"combat.hit_light",
				actor_context,
				participant_position,
				light_options
			)
			_append_timed_marker(
				markers,
				"combo_contact_%d" % index,
				"combat.hit_light",
				PHASE_CONTACT,
				contact_progresses[index],
				PRIORITY_CONTACT,
				light_options
			)

	var final_contact_progress := (
		contact_progresses[contact_progresses.size() - 1]
		if not contact_progresses.is_empty()
		else COMBO_DEFAULT_CONTACT_PROGRESS
	)
	if bool(contact_facts.get("anyDodge", false)):
		_append_timed_marker(
			markers,
			"combo_evade",
			"combat.evade",
			PHASE_CONTACT,
			final_contact_progress,
			PRIORITY_EMPHASIS,
			_options_for(
				"combat.evade",
				actor_context,
				_spatial_position(actor_context, "target")
			)
		)
	if bool(contact_facts.get("anyBlock", false)):
		_append_timed_marker(
			markers,
			"combo_block",
			"combat.block",
			PHASE_CONTACT,
			final_contact_progress,
			PRIORITY_EMPHASIS,
			_options_for(
				"combat.block",
				actor_context,
				_spatial_position(actor_context, "target")
			)
		)
	if bool(contact_facts.get("anySolidHit", false)):
		_append_timed_marker(
			markers,
			"combo_impact",
			"combat.hit_combo",
			PHASE_CONTACT,
			final_contact_progress,
			PRIORITY_EMPHASIS,
			_options_for(
				"combat.hit_combo",
				actor_context,
				_spatial_position(actor_context, "target"),
				{
					"gainDbOffset": minf(
						1.5,
						0.5 * float(maxi(0, participant_ids.size() - 2))
					),
					"pitchScale": 0.98,
				}
			)
		)
	if bool(contact_facts.get("anyCriticalSolidHit", false)):
		_append_timed_marker(
			markers,
			"combo_critical",
			"combat.critical",
			PHASE_CONTACT,
			final_contact_progress,
			PRIORITY_EMPHASIS,
			_options_for(
				"combat.critical",
				actor_context,
				_spatial_position(actor_context, "target")
			)
		)

	var reaction_progress := minf(
		0.94,
		final_contact_progress + REACTION_PROGRESS_AFTER_CONTACT
	)
	if bool(event.get("launch", event.get("serverLaunched", false))):
		reaction_progress = _launch_sound_progress(event, final_contact_progress)
		_append_timed_marker(
			markers,
			"launch",
			"combat.launch",
			PHASE_REACTION,
			reaction_progress,
			PRIORITY_REACTION,
			_options_for(
				"combat.launch",
				actor_context,
				_spatial_position(actor_context, "target")
			)
		)
		if str(event.get("launchMode", "")) == "bounce":
			_append_timed_marker(
				markers,
				"bounce_edge",
				"combat.bounce_edge",
				PHASE_REACTION,
				_bounce_impact_progress(event, reaction_progress),
				PRIORITY_REACTION,
				_options_for(
					"combat.bounce_edge",
					actor_context,
					_spatial_position(actor_context, "target")
				)
			)
	_append_non_launch_reaction_markers(
		markers,
		event,
		actor_context,
		reaction_progress
	)

	var down_progress := minf(
		DOWN_PROGRESS_MAX,
		maxf(DOWN_PROGRESS_FLOOR, final_contact_progress + DOWN_PROGRESS_AFTER_CONTACT)
	)
	down_progress = _timeline_progress(event, "downSoundProgress", down_progress)
	down_progress = clampf(
		maxf(
			down_progress,
			final_contact_progress + DOWN_MIN_PROGRESS_AFTER_CONTACT
		),
		0.0,
		DOWN_PROGRESS_MAX
	)
	_append_phase_markers(
		markers,
		requests_for_phase(event, PHASE_DOWN, actor_context),
		down_progress,
		actor_context,
		"target"
	)
	return markers


static func _action_start_requests(
	event: Dictionary,
	actor_context: Dictionary
) -> Array[Dictionary]:
	var requests: Array[Dictionary] = []
	var event_type := str(event.get("type", ""))
	if _has_revive_transition(event):
		_append_request(requests, "combat.revive", PHASE_ACTION_START, PRIORITY_REACTION)
		return requests
	if event_type == "counter_attack":
		_append_request(requests, "combat.counter", PHASE_ACTION_START, PRIORITY_REACTION)
	if SKILL_EVENT_TYPES.has(event_type):
		_append_request(requests, "combat.cast_skill", PHASE_ACTION_START, PRIORITY_MOTION)
	elif DAMAGE_EVENT_TYPES.has(event_type) or event_type == "defend":
		_append_request(
			requests,
			_motion_cue_for_kind(_attacker_kind(event_type, actor_context)),
			PHASE_ACTION_START,
			PRIORITY_MOTION
		)
	if (
		DAMAGE_EVENT_TYPES.has(event_type)
		and _kind_is_pet(_attacker_kind(event_type, actor_context))
	):
		_append_request(
			requests,
			"creature.pet_effort",
			PHASE_ACTION_START,
			PRIORITY_VOICE
		)
	return requests


static func _contact_requests(event: Dictionary) -> Array[Dictionary]:
	var requests: Array[Dictionary] = []
	var event_type := str(event.get("type", ""))
	if not DAMAGE_EVENT_TYPES.has(event_type):
		return requests
	var contact_facts := _contact_facts(event)
	if bool(contact_facts.get("anyDodge", false)):
		_append_request(requests, "combat.evade", PHASE_CONTACT, PRIORITY_EMPHASIS)
	if bool(contact_facts.get("anyBlock", false)):
		_append_request(requests, "combat.block", PHASE_CONTACT, PRIORITY_EMPHASIS)
	if bool(contact_facts.get("anySolidHit", false)):
		var hit_cue := "combat.hit_light"
		if event_type == "skill_attack":
			hit_cue = "combat.hit_skill"
		elif (
			["combo_attack", "counter_attack", "multi_attack"].has(event_type)
			or str(event.get("audioImpactClass", "")).strip_edges().to_lower() == "heavy"
		):
			hit_cue = "combat.hit_heavy"
		_append_request(requests, hit_cue, PHASE_CONTACT, PRIORITY_CONTACT)
	if bool(contact_facts.get("anyCriticalSolidHit", false)):
		_append_request(requests, "combat.critical", PHASE_CONTACT, PRIORITY_EMPHASIS)
	return requests


static func _reaction_requests(
	event: Dictionary,
	actor_context: Dictionary
) -> Array[Dictionary]:
	var requests: Array[Dictionary] = []
	if bool(event.get("launch", event.get("serverLaunched", false))):
		var launch_mode := str(event.get("launchMode", ""))
		var launch_cue := "combat.knockback" if launch_mode == "bounce" else "combat.launch"
		_append_request(requests, launch_cue, PHASE_REACTION, PRIORITY_REACTION)
	var contact_facts := _contact_facts(event)
	if (
		bool(contact_facts.get("anySolidHit", false))
		and _solid_hit_has_pet_target(contact_facts, actor_context)
	):
		_append_request(
			requests,
			"creature.pet_hurt",
			PHASE_REACTION,
			PRIORITY_VOICE
		)
	return requests


static func _down_requests(event: Dictionary) -> Array[Dictionary]:
	var requests: Array[Dictionary] = []
	if _has_down_transition(event):
		_append_request(requests, "combat.down", PHASE_DOWN, PRIORITY_REACTION)
	return requests


static func _outcome_requests(event: Dictionary) -> Array[Dictionary]:
	var requests: Array[Dictionary] = []
	var result := str(event.get("result", "")).strip_edges()
	if result == "victory":
		_append_request(requests, "outcome.victory", PHASE_OUTCOME, PRIORITY_OUTCOME)
	elif result == "defeat":
		_append_request(requests, "outcome.defeat", PHASE_OUTCOME, PRIORITY_OUTCOME)
	return requests


static func _contact_facts(event: Dictionary) -> Dictionary:
	var target_ids := _target_ids_for_contact(event)
	var dodge_map := _bool_map(event.get("dodgePerTarget", {}))
	var block_map := _bool_map(event.get("blockedPerTarget", {}))
	var critical_map := _bool_map(event.get("criticalPerTarget", {}))
	var effect_map := _int_map(event.get("effectPerTarget", {}))
	var has_per_target_facts := (
		not target_ids.is_empty()
		and (
			not dodge_map.is_empty()
			or not block_map.is_empty()
			or not critical_map.is_empty()
			or not effect_map.is_empty()
		)
	)
	if has_per_target_facts:
		var any_dodge := false
		var any_block := false
		var any_solid_hit := false
		var any_critical_solid_hit := false
		var solid_hit_target_ids: Array[String] = []
		# Local single-target ledgers always include effect/block maps, but the
		# current BattleModel stores dodge/critical only in their legacy global
		# fields. Fall back per missing key only for that unambiguous shape.
		# Multi-target events must keep using explicit per-target facts so one
		# target's global summary cannot be projected onto every target.
		var use_global_single_target_fallback := target_ids.size() == 1
		var global_dodged := bool(event.get("dodged", false))
		var global_blocked := bool(
			event.get("blocked", event.get("serverBlocked", false))
		)
		var global_critical := bool(event.get("critical", false))
		for target_id in target_ids:
			var dodged := (
				bool(dodge_map.get(target_id, false))
				if dodge_map.has(target_id)
				else (
					global_dodged
					if use_global_single_target_fallback
					else false
				)
			)
			var blocked := (
				bool(block_map.get(target_id, false))
				if block_map.has(target_id)
				else (
					global_blocked
					if use_global_single_target_fallback
					else false
				)
			)
			var critical := (
				bool(critical_map.get(target_id, false))
				if critical_map.has(target_id)
				else (
					global_critical
					if use_global_single_target_fallback
					else false
				)
			)
			var has_positive_effect := (
				int(effect_map.get(target_id, 0)) > 0
				if not effect_map.is_empty()
				else true
			)
			any_dodge = any_dodge or dodged
			any_block = any_block or (blocked and not dodged)
			if not dodged and not blocked and has_positive_effect:
				any_solid_hit = true
				any_critical_solid_hit = any_critical_solid_hit or critical
				solid_hit_target_ids.append(target_id)
		return {
			"anyDodge": any_dodge,
			"anyBlock": any_block,
			"anySolidHit": any_solid_hit,
			"anyCriticalSolidHit": any_critical_solid_hit,
			"solidHitTargetIds": solid_hit_target_ids,
		}

	var dodged := bool(event.get("dodged", false))
	var blocked := bool(event.get("blocked", event.get("serverBlocked", false))) and not dodged
	var has_contact_damage := int(event.get("damage", 0)) > 0
	var solid_hit := not dodged and not blocked and has_contact_damage
	var resolved_target_id := str(
		event.get("resolvedTargetId", event.get("targetId", ""))
	).strip_edges()
	var solid_hit_target_ids: Array[String] = []
	if solid_hit and resolved_target_id != "":
		solid_hit_target_ids.append(resolved_target_id)
	return {
		"anyDodge": dodged,
		"anyBlock": blocked,
		"anySolidHit": solid_hit,
		"anyCriticalSolidHit": solid_hit and bool(event.get("critical", false)),
		"solidHitTargetIds": solid_hit_target_ids,
	}


static func _target_ids_for_contact(event: Dictionary) -> Array[String]:
	var target_ids: Array[String] = []
	var resolved_target_id := str(
		event.get("resolvedTargetId", event.get("targetId", ""))
	).strip_edges()
	if resolved_target_id != "":
		target_ids.append(resolved_target_id)
	for value in event.get("targetIds", []):
		var target_id := str(value)
		if target_id != "" and not target_ids.has(target_id):
			target_ids.append(target_id)
	for source_key in [
		"dodgePerTarget",
		"blockedPerTarget",
		"criticalPerTarget",
		"effectPerTarget",
	]:
		var source = event.get(source_key, {})
		if not (source is Dictionary):
			continue
		for key in (source as Dictionary).keys():
			var target_id := str(key)
			if target_id != "" and not target_ids.has(target_id):
				target_ids.append(target_id)
	return target_ids


static func _has_down_transition(event: Dictionary) -> bool:
	if bool(event.get("serverDefeated", false)) and not bool(
		event.get("launch", event.get("serverLaunched", false))
	):
		return true
	for value in event.get("targets", []):
		if not (value is Dictionary):
			continue
		var target := value as Dictionary
		if str(target.get("stateAfter", "")) == "down":
			return true
	return false


static func _has_revive_transition(event: Dictionary) -> bool:
	for value in event.get("targets", []):
		if not (value is Dictionary):
			continue
		var target := value as Dictionary
		if (
			str(target.get("stateBefore", "")) == "down"
			and str(target.get("stateAfter", "")) != "down"
			and int(target.get("hpAfter", 0)) > 0
		):
			return true
	return false


static func _attacker_kind(event_type: String, actor_context: Dictionary) -> String:
	var context_kind := str(actor_context.get("attackerKind", "")).strip_edges()
	if context_kind != "":
		return context_kind
	# Current BattleModel creates skill_attack/skill_status only for pet commands.
	# Other event types need the explicit context because actor ids do not encode kind.
	if event_type == "skill_attack" or event_type == "skill_status":
		return "pet"
	return "player"


static func _context_has_pet_target(actor_context: Dictionary) -> bool:
	if _kind_is_pet(str(actor_context.get("targetKind", ""))):
		return true
	var target_kinds = actor_context.get("targetKinds", {})
	if target_kinds is Dictionary:
		for value in (target_kinds as Dictionary).values():
			if _kind_is_pet(str(value)):
				return true
	elif target_kinds is Array:
		for value in target_kinds:
			if _kind_is_pet(str(value)):
				return true
	return false


static func _solid_hit_has_pet_target(
	contact_facts: Dictionary,
	actor_context: Dictionary
) -> bool:
	var solid_target_ids: Array[String] = []
	for value in contact_facts.get("solidHitTargetIds", []):
		var target_id := str(value).strip_edges()
		if target_id != "" and not solid_target_ids.has(target_id):
			solid_target_ids.append(target_id)
	var target_kinds = actor_context.get("targetKinds", {})
	if (
		not solid_target_ids.is_empty()
		and target_kinds is Dictionary
		and not (target_kinds as Dictionary).is_empty()
	):
		for target_id in solid_target_ids:
			if _kind_is_pet(str((target_kinds as Dictionary).get(target_id, ""))):
				return true
		return false
	if solid_target_ids.size() == 1 and _kind_is_pet(
		str(actor_context.get("targetKind", ""))
	):
		return true
	return _context_has_pet_target(actor_context)


static func _kind_is_pet(kind: String) -> bool:
	return PET_KINDS.has(kind.strip_edges().to_lower())


static func _motion_cue_for_kind(kind: String) -> String:
	return "combat.motion_pet" if _kind_is_pet(kind) else "combat.motion_character"


static func _bool_map(value) -> Dictionary:
	var result := {}
	if not (value is Dictionary):
		return result
	for key in (value as Dictionary).keys():
		result[str(key)] = bool((value as Dictionary).get(key, false))
	return result


static func _int_map(value) -> Dictionary:
	var result := {}
	if not (value is Dictionary):
		return result
	for key in (value as Dictionary).keys():
		result[str(key)] = int((value as Dictionary).get(key, 0))
	return result


static func _participant_ids(event: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for value in event.get("participantIds", []):
		var participant_id := str(value).strip_edges()
		if participant_id != "" and not result.has(participant_id):
			result.append(participant_id)
	if result.is_empty():
		var attacker_id := str(event.get("attackerId", "")).strip_edges()
		result.append(attacker_id if attacker_id != "" else "attacker")
	return result


static func _combo_contact_progresses(
	event: Dictionary,
	participant_count: int
) -> Array[float]:
	var count := maxi(1, participant_count)
	var timeline = event.get("timeline", {})
	if timeline is Dictionary:
		var explicit = (timeline as Dictionary).get("comboContactProgresses", [])
		if explicit is Array and (explicit as Array).size() == count:
			var normalized: Array[float] = []
			for value in explicit:
				if typeof(value) != TYPE_FLOAT and typeof(value) != TYPE_INT:
					normalized.clear()
					break
				normalized.append(clampf(float(value), 0.0, 0.99))
			if normalized.size() == count:
				normalized.sort()
				var requested_final := normalized[normalized.size() - 1]
				var safe_final := _safe_contact_progress(event, requested_final)
				var overflow := requested_final - safe_final
				if overflow > 0.0:
					for index in range(normalized.size()):
						normalized[index] = maxf(
							0.0,
							normalized[index] - overflow
						)
				return normalized

	var final_progress := _safe_contact_progress(
		event,
		damage_reveal_progress(event)
	)
	if final_progress <= 0.0:
		final_progress = COMBO_DEFAULT_CONTACT_PROGRESS
	var duration_seconds := 1.0
	if timeline is Dictionary:
		duration_seconds = maxf(
			0.12,
			float((timeline as Dictionary).get("durationSeconds", duration_seconds))
		)
	var spacing := clampf(
		COMBO_STAGGER_SECONDS / duration_seconds,
		COMBO_MIN_CONTACT_SPACING,
		COMBO_MAX_CONTACT_SPACING
	)
	var first_progress := maxf(0.08, final_progress - spacing * float(count - 1))
	var result: Array[float] = []
	if count == 1:
		result.append(final_progress)
		return result
	var resolved_spacing := (final_progress - first_progress) / float(count - 1)
	for index in range(count):
		result.append(clampf(first_progress + resolved_spacing * float(index), 0.0, 0.99))
	return result


static func _launch_sound_progress(event: Dictionary, contact_progress: float) -> float:
	var launch_default := maxf(contact_progress, 0.30)
	var resolved := launch_default
	var timeline = event.get("timeline", {})
	if timeline is Dictionary:
		if (timeline as Dictionary).has("launchSoundProgress"):
			resolved = _timeline_progress(
				event,
				"launchSoundProgress",
				launch_default
			)
		elif (timeline as Dictionary).has("launchStartProgress"):
			resolved = _timeline_progress(
				event,
				"launchStartProgress",
				launch_default
			)
	var progress_max := (
		BOUNCE_LAUNCH_PROGRESS_MAX
		if str(event.get("launchMode", "")) == "bounce"
		else LAUNCH_PROGRESS_MAX
	)
	return clampf(
		maxf(resolved, contact_progress + LAUNCH_MIN_PROGRESS_AFTER_CONTACT),
		0.0,
		progress_max
	)


static func _bounce_impact_progress(
	event: Dictionary,
	launch_progress: float
) -> float:
	var fallback := launch_progress + (
		1.0 - launch_progress
	) * BOUNCE_EDGE_FRACTION_AFTER_LAUNCH
	var resolved := _timeline_progress(event, "bounceImpactProgress", fallback)
	return clampf(
		maxf(
			resolved,
			launch_progress + BOUNCE_MIN_PROGRESS_AFTER_LAUNCH
		),
		0.0,
		BOUNCE_PROGRESS_MAX
	)


static func _safe_contact_progress(event: Dictionary, requested: float) -> float:
	var progress_max := BOUNCE_PROGRESS_MAX
	if bool(event.get("launch", event.get("serverLaunched", false))):
		var launch_progress_max := (
			BOUNCE_LAUNCH_PROGRESS_MAX
			if str(event.get("launchMode", "")) == "bounce"
			else LAUNCH_PROGRESS_MAX
		)
		progress_max = minf(
			progress_max,
			launch_progress_max - LAUNCH_MIN_PROGRESS_AFTER_CONTACT
		)
	if _has_down_transition(event):
		progress_max = minf(
			progress_max,
			DOWN_PROGRESS_MAX - DOWN_MIN_PROGRESS_AFTER_CONTACT
		)
	return clampf(requested, 0.0, progress_max)


static func _timeline_progress(
	event: Dictionary,
	key: String,
	fallback: float
) -> float:
	var timeline = event.get("timeline", {})
	if not (timeline is Dictionary) or not (timeline as Dictionary).has(key):
		return clampf(fallback, 0.0, 0.99)
	var value = (timeline as Dictionary).get(key)
	if typeof(value) != TYPE_FLOAT and typeof(value) != TYPE_INT:
		return clampf(fallback, 0.0, 0.99)
	return clampf(float(value), 0.0, 0.99)


static func _append_non_launch_reaction_markers(
	markers: Array[Dictionary],
	event: Dictionary,
	actor_context: Dictionary,
	progress: float
) -> void:
	for request in requests_for_phase(event, PHASE_REACTION, actor_context):
		var cue_id := str(request.get("cueId", ""))
		if cue_id == "combat.launch" or cue_id == "combat.knockback":
			continue
		_append_request_marker(
			markers,
			request,
			progress,
			actor_context,
			"target"
		)


static func _append_phase_markers(
	markers: Array[Dictionary],
	requests: Array[Dictionary],
	progress: float,
	actor_context: Dictionary,
	spatial_role: String
) -> void:
	for request in requests:
		_append_request_marker(
			markers,
			request,
			progress,
			actor_context,
			spatial_role
		)


static func _append_request_marker(
	markers: Array[Dictionary],
	request: Dictionary,
	progress: float,
	actor_context: Dictionary,
	spatial_role: String
) -> void:
	var cue_id := str(request.get("cueId", ""))
	if cue_id == "":
		return
	_append_timed_marker(
		markers,
		"%s_%d" % [str(request.get("phase", "")), markers.size()],
		cue_id,
		str(request.get("phase", "")),
		progress,
		int(request.get("priority", 0)),
		_options_for(
			cue_id,
			actor_context,
			_spatial_position(actor_context, spatial_role)
		)
	)


static func _append_timed_marker(
	markers: Array[Dictionary],
	marker_id: String,
	cue_id: String,
	phase: String,
	progress: float,
	priority: int,
	options: Dictionary = {}
) -> void:
	markers.append({
		"markerId": marker_id,
		"cueId": cue_id,
		"phase": phase,
		"progress": clampf(progress, 0.0, 0.99),
		"priority": priority,
		"options": _sanitize_options(options),
	})


static func _options_for(
	cue_id: String,
	actor_context: Dictionary,
	spatial_position,
	defaults: Dictionary = {}
) -> Dictionary:
	var result := _sanitize_options(defaults)
	if spatial_position != null:
		result["spatialPosition"] = spatial_position
	var cue_options = actor_context.get("cueOptions", {})
	if cue_options is Dictionary:
		var override = (cue_options as Dictionary).get(cue_id, {})
		if override is Dictionary:
			result.merge(_sanitize_options(override as Dictionary), true)
	return result


static func _sanitize_options(value: Dictionary) -> Dictionary:
	var result := {}
	for key in MARKER_OPTION_KEYS:
		if not value.has(key):
			continue
		var option = value.get(key)
		match key:
			"cooldownKey":
				if typeof(option) == TYPE_STRING and str(option).strip_edges() != "":
					result[key] = str(option).strip_edges()
			"gainDbOffset", "pitchScale":
				if typeof(option) == TYPE_FLOAT or typeof(option) == TYPE_INT:
					result[key] = float(option)
			"spatialPosition":
				if typeof(option) == TYPE_VECTOR2:
					result[key] = option
				elif typeof(option) == TYPE_VECTOR2I:
					result[key] = Vector2(option)
	return result


static func _spatial_position(actor_context: Dictionary, role: String):
	var key := "%sSpatialPosition" % role
	var value = actor_context.get(key)
	if typeof(value) == TYPE_VECTOR2:
		return value
	if typeof(value) == TYPE_VECTOR2I:
		return Vector2(value)
	return null


static func _participant_spatial_position(
	actor_context: Dictionary,
	participant_id: String
):
	var positions = actor_context.get("participantSpatialPositions", {})
	if positions is Dictionary:
		var value = (positions as Dictionary).get(participant_id)
		if typeof(value) == TYPE_VECTOR2:
			return value
		if typeof(value) == TYPE_VECTOR2I:
			return Vector2(value)
	return _spatial_position(actor_context, "attacker")


static func _append_request(
	requests: Array[Dictionary],
	cue_id: String,
	phase: String,
	priority: int
) -> void:
	for request in requests:
		if str(request.get("cueId", "")) == cue_id:
			return
	requests.append({
		"cueId": cue_id,
		"phase": phase,
		"priority": priority,
	})
