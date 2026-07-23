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
		if ["skill_attack", "combo_attack", "counter_attack", "multi_attack"].has(event_type):
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
		and _context_has_pet_target(actor_context)
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
	var has_per_target_facts := (
		not target_ids.is_empty()
		and (
			not dodge_map.is_empty()
			or not block_map.is_empty()
			or not critical_map.is_empty()
		)
	)
	if has_per_target_facts:
		var any_dodge := false
		var any_block := false
		var any_solid_hit := false
		var any_critical_solid_hit := false
		for target_id in target_ids:
			var dodged := bool(dodge_map.get(target_id, false))
			var blocked := bool(block_map.get(target_id, false))
			var critical := bool(critical_map.get(target_id, false))
			any_dodge = any_dodge or dodged
			any_block = any_block or (blocked and not dodged)
			if not dodged and not blocked:
				any_solid_hit = true
				any_critical_solid_hit = any_critical_solid_hit or critical
		return {
			"anyDodge": any_dodge,
			"anyBlock": any_block,
			"anySolidHit": any_solid_hit,
			"anyCriticalSolidHit": any_critical_solid_hit,
		}

	var dodged := bool(event.get("dodged", false))
	var blocked := bool(event.get("blocked", event.get("serverBlocked", false))) and not dodged
	var has_contact_damage := int(event.get("damage", 0)) > 0
	var solid_hit := not dodged and not blocked and has_contact_damage
	return {
		"anyDodge": dodged,
		"anyBlock": blocked,
		"anySolidHit": solid_hit,
		"anyCriticalSolidHit": solid_hit and bool(event.get("critical", false)),
	}


static func _target_ids_for_contact(event: Dictionary) -> Array[String]:
	var target_ids: Array[String] = []
	for value in event.get("targetIds", []):
		var target_id := str(value)
		if target_id != "" and not target_ids.has(target_id):
			target_ids.append(target_id)
	for source_key in ["dodgePerTarget", "blockedPerTarget", "criticalPerTarget"]:
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
