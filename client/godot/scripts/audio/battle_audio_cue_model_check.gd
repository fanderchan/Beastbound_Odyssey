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
		"skill uses heavy contact",
		BattleAudioCueModel.requests_for_phase(
			{"type": "skill_attack", "damage": 28},
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
			+ "victory=true defeat=true idempotent=true"
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
