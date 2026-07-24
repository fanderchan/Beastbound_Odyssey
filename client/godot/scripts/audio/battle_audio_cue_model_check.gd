extends SceneTree

const BattleAudioCueModel := preload("res://scripts/audio/battle_audio_cue_model.gd")


func _initialize() -> void:
	var errors: Array[String] = []
	_expect_cues(
		"character attack start",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 12},
			BattleAudioCueModel.PHASE_ACTION_START,
			{"attackerKind": "player"}
		),
		["combat.motion_character"],
		errors
	)
	_expect_cues(
		"pet attack start",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 12},
			BattleAudioCueModel.PHASE_ACTION_START,
			{"attackerKind": "wild_pet"}
		),
		["combat.motion_pet", "creature.pet_effort"],
		errors
	)
	_expect_cues(
		"pet skill start",
		BattleAudioCueModel.requests_for_phase(
			{"type": "skill_attack", "damage": 24},
			BattleAudioCueModel.PHASE_ACTION_START
		),
		["combat.cast_skill", "creature.pet_effort"],
		errors
	)
	_expect_cues(
		"healer cast start",
		BattleAudioCueModel.requests_for_phase(
			{"type": "spirit_heal_all", "heal": 320},
			BattleAudioCueModel.PHASE_ACTION_START,
			{"attackerKind": "player"}
		),
		["combat.cast_skill"],
		errors
	)
	_expect_cues(
		"defend stance start",
		BattleAudioCueModel.requests_for_phase(
			{"type": "defend"},
			BattleAudioCueModel.PHASE_ACTION_START,
			{"attackerKind": "pet"}
		),
		["combat.motion_pet"],
		errors
	)
	_expect_cues(
		"dodge replaces contact",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 0, "dodged": true, "critical": true},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.evade"],
		errors
	)
	_expect_cues(
		"single target ledger preserves global dodge with partial maps",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "attack",
				"damage": 0,
				"targetIds": ["enemy"],
				"effectPerTarget": {"enemy": 0},
				"blockedPerTarget": {"enemy": false},
				"dodged": true,
			},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.evade"],
		errors
	)
	_expect_cues(
		"block replaces contact",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 8, "blocked": true},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.block"],
		errors
	)
	_expect_cues(
		"critical attack contact",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 28, "critical": true},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.hit_light", "combat.critical"],
		errors
	)
	_expect_cues(
		"single target ledger preserves global critical with partial maps",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "attack",
				"damage": 28,
				"targetIds": ["enemy"],
				"effectPerTarget": {"enemy": 28},
				"blockedPerTarget": {"enemy": false},
				"critical": true,
			},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.hit_light", "combat.critical"],
		errors
	)
	_expect_cues(
		"skill uses dedicated contact",
		BattleAudioCueModel.requests_for_phase(
			{"type": "skill_attack", "damage": 28},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.hit_skill"],
		errors
	)
	_expect_cues(
		"explicit heavy impact class",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 28, "audioImpactClass": "heavy"},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.hit_heavy"],
		errors
	)
	_expect_cues(
		"mixed multi target stays bounded",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "multi_attack",
				"damage": 42,
				"targetIds": ["dodged", "blocked", "critical"],
				"dodgePerTarget": {"dodged": true, "blocked": false, "critical": false},
				"blockedPerTarget": {"dodged": false, "blocked": true, "critical": false},
				"criticalPerTarget": {"dodged": false, "blocked": false, "critical": true},
			},
			BattleAudioCueModel.PHASE_CONTACT
		),
		["combat.evade", "combat.block", "combat.hit_heavy", "combat.critical"],
		errors
	)
	_expect_cues(
		"counter is its own action",
		BattleAudioCueModel.requests_for_phase(
			{"type": "counter_attack", "damage": 19},
			BattleAudioCueModel.PHASE_ACTION_START,
			{"attackerKind": "player"}
		),
		["combat.counter", "combat.motion_character"],
		errors
	)
	_expect_cues(
		"straight launch reaction",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "launch": true, "launchMode": "straight"},
			BattleAudioCueModel.PHASE_REACTION
		),
		["combat.launch"],
		errors
	)
	_expect_cues(
		"bounce launch reaction",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "launch": true, "launchMode": "bounce"},
			BattleAudioCueModel.PHASE_REACTION
		),
		["combat.knockback"],
		errors
	)
	_expect_cues(
		"pet hurt reaction",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 16},
			BattleAudioCueModel.PHASE_REACTION,
			{"targetKinds": {"enemy_0": "wild_pet"}}
		),
		["creature.pet_hurt"],
		errors
	)
	_expect_cues(
		"single targetKind pet hurt compatibility",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "attack",
				"targetId": "pet_target",
				"effectPerTarget": {"pet_target": 16},
			},
			BattleAudioCueModel.PHASE_REACTION,
			{"targetKind": "pet"}
		),
		["creature.pet_hurt"],
		errors
	)
	_expect_cues(
		"mixed targets do not hurt a dodging pet",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "multi_attack",
				"targetIds": ["pet_target", "human_target"],
				"effectPerTarget": {
					"pet_target": 0,
					"human_target": 18,
				},
				"dodgePerTarget": {
					"pet_target": true,
					"human_target": false,
				},
			},
			BattleAudioCueModel.PHASE_REACTION,
			{
				"targetKinds": {
					"pet_target": "wild_pet",
					"human_target": "player",
				},
			}
		),
		[],
		errors
	)
	_expect_cues(
		"mixed targets hurt the solid-hit pet",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "multi_attack",
				"targetIds": ["pet_target", "human_target"],
				"effectPerTarget": {
					"pet_target": 15,
					"human_target": 0,
				},
				"dodgePerTarget": {
					"pet_target": false,
					"human_target": true,
				},
			},
			BattleAudioCueModel.PHASE_REACTION,
			{
				"targetKinds": {
					"pet_target": "pet",
					"human_target": "player",
				},
			}
		),
		["creature.pet_hurt"],
		errors
	)
	_expect_cues(
		"ledger down transition",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "attack",
				"targets": [{
					"targetId": "enemy_0",
					"hpBefore": 12,
					"hpAfter": 0,
					"stateBefore": "idle",
					"stateAfter": "down",
				}],
			},
			BattleAudioCueModel.PHASE_DOWN
		),
		["combat.down"],
		errors
	)
	_expect_cues(
		"launched defeat is not down",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "attack",
				"launch": true,
				"serverDefeated": true,
				"targets": [{
					"targetId": "enemy_0",
					"hpBefore": 12,
					"hpAfter": 0,
					"stateBefore": "idle",
					"stateAfter": "launched",
				}],
			},
			BattleAudioCueModel.PHASE_DOWN
		),
		[],
		errors
	)
	_expect_cues(
		"ledger revive transition",
		BattleAudioCueModel.requests_for_phase(
			{
				"type": "item_heal",
				"targets": [{
					"targetId": "ally_pet",
					"hpBefore": 0,
					"hpAfter": 24,
					"stateBefore": "down",
					"stateAfter": "idle",
				}],
			},
			BattleAudioCueModel.PHASE_ACTION_START
		),
		["combat.revive"],
		errors
	)
	_expect_cues(
		"victory outcome",
		BattleAudioCueModel.requests_for_phase(
			{"result": "victory"},
			BattleAudioCueModel.PHASE_OUTCOME
		),
		["outcome.victory"],
		errors
	)
	_expect_cues(
		"defeat outcome",
		BattleAudioCueModel.requests_for_phase(
			{"result": "defeat"},
			BattleAudioCueModel.PHASE_OUTCOME
		),
		["outcome.defeat"],
		errors
	)
	_expect_cues(
		"unknown phase",
		BattleAudioCueModel.requests_for_phase(
			{"type": "attack", "damage": 10},
			"packet_arrival"
		),
		[],
		errors
	)

	var timeline_event := {
		"type": "attack",
		"timeline": {"damageRevealProgress": 0.52},
	}
	if not is_equal_approx(BattleAudioCueModel.damage_reveal_progress(timeline_event), 0.52):
		errors.append("timeline damage reveal progress was not preserved")
	var clamped_timeline := {"timeline": {"damageRevealProgress": 1.5}}
	if not is_equal_approx(BattleAudioCueModel.damage_reveal_progress(clamped_timeline), 1.0):
		errors.append("timeline damage reveal progress was not clamped")

	var defend_markers := BattleAudioCueModel.timed_markers({
		"type": "defend",
		"timeline": {"guardReadyProgress": 0.24},
	}, {
		"attackerKind": "pet",
		"attackerSpatialPosition": Vector2(120.0, 80.0),
		"cueOptions": {
			"combat.guard_ready": {
				"gainDbOffset": -2.5,
				"pitchScale": 0.94,
				"unsupported": "must not leak",
			},
		},
	})
	_expect_marker_cues(
		"defend marker schedule",
		defend_markers,
		["combat.motion_pet", "combat.guard_ready"],
		errors
	)
	var guard_marker := _marker_by_id(defend_markers, "guard_ready")
	if (
		not is_equal_approx(float(guard_marker.get("progress", -1.0)), 0.24)
		or float(
			(guard_marker.get("options", {}) as Dictionary).get("gainDbOffset", 0.0)
		) != -2.5
		or float(
			(guard_marker.get("options", {}) as Dictionary).get("pitchScale", 0.0)
		) != 0.94
		or (
			(guard_marker.get("options", {}) as Dictionary).get(
				"spatialPosition",
				Vector2.ZERO
			) as Vector2
		) != Vector2(120.0, 80.0)
		or (guard_marker.get("options", {}) as Dictionary).has("unsupported")
	):
		errors.append(
			"guard marker did not preserve the allow-listed options: %s"
			% JSON.stringify(guard_marker)
		)

	var combo_markers := BattleAudioCueModel.timed_markers({
		"type": "combo_attack",
		"attackerId": "ally_a",
		"participantIds": ["ally_a", "ally_b", "ally_pet"],
		"damage": 72,
		"critical": true,
		"timeline": {
			"durationSeconds": 1.56,
			"damageRevealProgress": 0.55,
			"comboStartProgress": 0.04,
			"comboContactProgresses": [0.23, 0.39, 0.55],
		},
	}, {
		"attackerKind": "player",
		"targetSpatialPosition": Vector2(930.0, 320.0),
		"participantSpatialPositions": {
			"ally_a": Vector2(220.0, 410.0),
			"ally_b": Vector2(270.0, 450.0),
			"ally_pet": Vector2(180.0, 470.0),
		},
	})
	_expect_marker_cues(
		"three actor combo marker schedule",
		combo_markers,
		[
			"combat.combo_start",
			"combat.hit_light",
			"combat.hit_light",
			"combat.hit_light",
			"combat.hit_combo",
			"combat.critical",
		],
		errors
	)
	var combo_contacts := _markers_by_cue(combo_markers, "combat.hit_light")
	if combo_contacts.size() != 3:
		errors.append("combo did not create one light contact per participant")
	else:
		var expected_progresses: Array[float] = [0.23, 0.39, 0.55]
		for index in range(combo_contacts.size()):
			var marker := combo_contacts[index]
			if not is_equal_approx(
				float(marker.get("progress", -1.0)),
				expected_progresses[index]
			):
				errors.append("combo contact %d did not keep the visual marker" % index)
			var options := marker.get("options", {}) as Dictionary
			if (
				not options.has("cooldownKey")
				or not options.has("gainDbOffset")
				or not options.has("pitchScale")
				or not options.has("spatialPosition")
			):
				errors.append("combo contact %d options are incomplete" % index)
	var combo_impact := _marker_by_id(combo_markers, "combo_impact")
	if (
		str(combo_impact.get("cueId", "")) != "combat.hit_combo"
		or not is_equal_approx(float(combo_impact.get("progress", -1.0)), 0.55)
		or (
			(combo_impact.get("options", {}) as Dictionary).get(
				"spatialPosition",
				Vector2.ZERO
			) as Vector2
		) != Vector2(930.0, 320.0)
	):
		errors.append(
			"combo convergence impact was not bound to the final visible contact"
		)

	var combo_fallback := BattleAudioCueModel.timed_markers({
		"type": "combo_attack",
		"participantIds": ["a", "b", "c"],
		"damage": 40,
		"timeline": {
			"durationSeconds": 1.56,
			"damageRevealProgress": 0.55,
		},
	})
	var fallback_contacts := _markers_by_cue(combo_fallback, "combat.hit_light")
	if (
		fallback_contacts.size() != 3
		or float(fallback_contacts[0].get("progress", 1.0))
			>= float(fallback_contacts[1].get("progress", 0.0))
		or float(fallback_contacts[1].get("progress", 1.0))
			>= float(fallback_contacts[2].get("progress", 0.0))
		or not is_equal_approx(
			float(fallback_contacts[2].get("progress", -1.0)),
			0.55
		)
	):
		errors.append("combo fallback contacts were not staggered toward final impact")

	var bounce_markers := BattleAudioCueModel.timed_markers({
		"type": "attack",
		"damage": 36,
		"launch": true,
		"launchMode": "bounce",
		"timeline": {
			"damageRevealProgress": 0.30,
			"launchSoundProgress": 0.30,
			"bounceImpactProgress": 0.31,
		},
	})
	_expect_marker_cues(
		"bounce marker schedule",
		bounce_markers,
		[
			"combat.motion_character",
			"combat.hit_light",
			"combat.launch",
			"combat.bounce_edge",
		],
		errors
	)
	if (
		not is_equal_approx(
			float(_marker_by_id(bounce_markers, "launch").get("progress", -1.0)),
			0.33
		)
		or not is_equal_approx(
			float(
				_marker_by_id(bounce_markers, "bounce_edge").get(
					"progress",
					-1.0
				)
			),
			0.36
		)
		or not _markers_by_cue(bounce_markers, "combat.knockback").is_empty()
	):
		errors.append(
			"bounce marker timing did not preserve contact < launch < bounce"
		)

	var guarded_down_markers := BattleAudioCueModel.timed_markers({
		"type": "attack",
		"damage": 36,
		"timeline": {
			"damageRevealProgress": 0.50,
			"downSoundProgress": 0.51,
		},
		"targets": [{
			"targetId": "enemy_0",
			"hpBefore": 36,
			"hpAfter": 0,
			"stateBefore": "idle",
			"stateAfter": "down",
		}],
	})
	var guarded_down_matches := _markers_by_cue(
		guarded_down_markers,
		"combat.down"
	)
	if (
		guarded_down_matches.size() != 1
		or not is_equal_approx(
			float(guarded_down_matches[0].get("progress", -1.0)),
			0.66
		)
	):
		errors.append(
			"down marker accepted an inaudibly crowded post-contact timeline"
		)

	var late_bounce_markers := BattleAudioCueModel.timed_markers({
		"type": "attack",
		"damage": 36,
		"launch": true,
		"launchMode": "bounce",
		"timeline": {
			"damageRevealProgress": 0.99,
			"launchSoundProgress": 0.99,
			"bounceImpactProgress": 0.99,
		},
	})
	var late_contact_progress := float(
		_markers_by_cue(late_bounce_markers, "combat.hit_light")[0].get(
			"progress",
			-1.0
		)
	)
	var late_launch_progress := float(
		_marker_by_id(late_bounce_markers, "launch").get("progress", -1.0)
	)
	var late_bounce_progress := float(
		_marker_by_id(late_bounce_markers, "bounce_edge").get("progress", -1.0)
	)
	if not (
		is_equal_approx(late_contact_progress, 0.93)
		and is_equal_approx(late_launch_progress, 0.96)
		and is_equal_approx(late_bounce_progress, 0.99)
		and late_contact_progress < late_launch_progress
		and late_launch_progress < late_bounce_progress
	):
		errors.append(
			"late explicit timeline reversed contact, launch, or bounce ordering"
		)

	var late_combo_bounce_markers := BattleAudioCueModel.timed_markers({
		"type": "combo_attack",
		"participantIds": ["a", "b", "c"],
		"damage": 36,
		"launch": true,
		"launchMode": "bounce",
		"timeline": {
			"comboContactProgresses": [0.97, 0.98, 0.99],
			"launchSoundProgress": 0.99,
			"bounceImpactProgress": 0.99,
		},
	})
	var late_combo_contact_progress := float(
		_marker_by_id(late_combo_bounce_markers, "combo_impact").get(
			"progress",
			-1.0
		)
	)
	var late_combo_launch_progress := float(
		_marker_by_id(late_combo_bounce_markers, "launch").get("progress", -1.0)
	)
	var late_combo_bounce_progress := float(
		_marker_by_id(late_combo_bounce_markers, "bounce_edge").get(
			"progress",
			-1.0
		)
	)
	if not (
		is_equal_approx(late_combo_contact_progress, 0.93)
		and is_equal_approx(late_combo_launch_progress, 0.96)
		and is_equal_approx(late_combo_bounce_progress, 0.99)
		and late_combo_contact_progress < late_combo_launch_progress
		and late_combo_launch_progress < late_combo_bounce_progress
	):
		errors.append(
			"late explicit combo timeline reversed contact, launch, or bounce ordering"
		)

	var late_down_markers := BattleAudioCueModel.timed_markers({
		"type": "attack",
		"damage": 36,
		"timeline": {
			"damageRevealProgress": 0.99,
			"downSoundProgress": 0.99,
		},
		"targets": [{
			"targetId": "enemy_0",
			"hpBefore": 36,
			"hpAfter": 0,
			"stateBefore": "idle",
			"stateAfter": "down",
		}],
	})
	var late_down_contact_progress := float(
		_markers_by_cue(late_down_markers, "combat.hit_light")[0].get(
			"progress",
			-1.0
		)
	)
	var late_down_progress := float(
		_markers_by_cue(late_down_markers, "combat.down")[0].get(
			"progress",
			-1.0
		)
	)
	if not (
		is_equal_approx(late_down_contact_progress, 0.80)
		and is_equal_approx(late_down_progress, 0.96)
		and late_down_contact_progress < late_down_progress
	):
		errors.append(
			"late explicit timeline reversed contact and down ordering"
		)

	var source_event := {
		"type": "multi_attack",
		"damage": 30,
		"targetIds": ["enemy_1", "enemy_2"],
		"dodgePerTarget": {"enemy_1": false, "enemy_2": true},
	}
	var before := source_event.duplicate(true)
	var first := BattleAudioCueModel.requests_for_phase(
		source_event,
		BattleAudioCueModel.PHASE_CONTACT
	)
	var second := BattleAudioCueModel.requests_for_phase(
		source_event,
		BattleAudioCueModel.PHASE_CONTACT
	)
	if source_event != before:
		errors.append("cue model mutated the source event")
	if first != second:
		errors.append("cue model is not idempotent")
	var first_markers := BattleAudioCueModel.timed_markers(source_event)
	var second_markers := BattleAudioCueModel.timed_markers(source_event)
	if first_markers != second_markers:
		errors.append("timed cue model is not idempotent")
	for request in first:
		if (
			str(request.get("cueId", "")) == ""
			or str(request.get("phase", "")) != BattleAudioCueModel.PHASE_CONTACT
			or typeof(request.get("priority")) != TYPE_INT
		):
			errors.append("cue request schema is incomplete: %s" % JSON.stringify(request))

	_finish(errors)


static func _expect_cues(
	label: String,
	requests: Array[Dictionary],
	expected: Array[String],
	errors: Array[String]
) -> void:
	var actual: Array[String] = []
	for request in requests:
		actual.append(str(request.get("cueId", "")))
	if actual != expected:
		errors.append("%s expected=%s actual=%s" % [label, expected, actual])


func _finish(errors: Array[String]) -> void:
	if errors.is_empty():
		print(
			"battle audio cue model check ready: status=ok "
			+ "attack=true skill=true dodge=true block=true critical=true "
			+ "counter=true launch=true knockback=true down=true revive=true "
			+ "victory=true defeat=true guard_marker=true combo_markers=true "
			+ "bounce_markers=true marker_options=true idempotent=true"
		)
		quit(0)
		return
	for error in errors:
		push_error(error)
	print(
		"battle audio cue model check ready: status=failed errors=%s"
		% "；".join(errors)
	)
	quit(1)


static func _expect_marker_cues(
	label: String,
	markers: Array[Dictionary],
	expected: Array[String],
	errors: Array[String]
) -> void:
	var actual: Array[String] = []
	for marker in markers:
		actual.append(str(marker.get("cueId", "")))
	if actual != expected:
		errors.append("%s expected=%s actual=%s" % [label, expected, actual])


static func _marker_by_id(
	markers: Array[Dictionary],
	marker_id: String
) -> Dictionary:
	for marker in markers:
		if str(marker.get("markerId", "")) == marker_id:
			return marker
	return {}


static func _markers_by_cue(
	markers: Array[Dictionary],
	cue_id: String
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for marker in markers:
		if str(marker.get("cueId", "")) == cue_id:
			result.append(marker)
	return result
