extends RefCounted

## Pure fixture/model for the owner-facing combat-audio review movie.
##
## The model declares what each numbered segment means and creates ordinary
## BattleModel events. It does not play audio, advance animation, touch player
## profiles, or write evidence. The QA presenter owns those side effects.

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const ALLY_FORM_ID := "bui_novice_sprout_earth5_wind5"
const ENEMY_FORM_ID := "wuli_normal_orange_fire10"

const ALLY_PET_ID := BattleModel.PLAYER_PET_ID
const ALLY_PLAYER_ID := BattleModel.PLAYER_ACTOR_ID
const ALLY_COMBO_LEFT_ID := "audio_review_ally_combo_left"
const ALLY_COMBO_RIGHT_ID := "audio_review_ally_combo_right"
const ENEMY_FOCUS_ID := "audio_review_enemy_focus"
const ENEMY_MIX_DODGE_ID := "audio_review_enemy_mix_dodge"
const ENEMY_MIX_GUARD_ID := "audio_review_enemy_mix_guard"
const ENEMY_MIX_SOLID_ID := "audio_review_enemy_mix_solid"

const EXECUTION_BATTLE_EVENTS := "battle_events"
const EXECUTION_CUE_ONLY := "cue_only"
const EXECUTION_REVIVE_PREVIEW := "revive_preview"
const EXECUTION_OUTCOME := "outcome"

const SECTION_ISOLATED := "isolated"
const SECTION_LOW_BGM := "low_bgm"

const ISOLATED_STEP_COUNT := 18
const LOW_BGM_STEP_COUNT := 4


static func isolated_steps() -> Array[Dictionary]:
	return [
		_step(
			"01_character_hit",
			"01 / 18",
			"人物普通命中",
			EXECUTION_BATTLE_EVENTS,
			[_attack_event(
				ALLY_PLAYER_ID,
				ENEMY_FOCUS_ID,
				BattleModel.SIDE_ENEMY,
				24,
				101
			)]
		),
		_step(
			"02_pet_hit",
			"02 / 18",
			"宠物普通命中",
			EXECUTION_BATTLE_EVENTS,
			[_attack_event(
				ALLY_PET_ID,
				ENEMY_FOCUS_ID,
				BattleModel.SIDE_ENEMY,
				22,
				102
			)]
		),
		_step(
			"03_heavy_hit",
			"03 / 18",
			"重击",
			EXECUTION_BATTLE_EVENTS,
			[_heavy_attack_event(
				ALLY_PLAYER_ID,
				ENEMY_FOCUS_ID,
				BattleModel.SIDE_ENEMY,
				38,
				103
			)]
		),
		_step(
			"04_critical_hit",
			"04 / 18",
			"暴击",
			EXECUTION_BATTLE_EVENTS,
			[_critical_attack_event(
				ALLY_PLAYER_ID,
				ENEMY_FOCUS_ID,
				BattleModel.SIDE_ENEMY,
				28,
				104
			)]
		),
		_step(
			"05_guard_ready",
			"05 / 18",
			"防御姿态",
			EXECUTION_BATTLE_EVENTS,
			[_defend_event(ALLY_PLAYER_ID, 105)]
		),
		_step(
			"06_block",
			"06 / 18",
			"格挡受击",
			EXECUTION_BATTLE_EVENTS,
			[
				_defend_event(ENEMY_FOCUS_ID, 106),
				_attack_event(
					ALLY_PLAYER_ID,
					ENEMY_FOCUS_ID,
					BattleModel.SIDE_ENEMY,
					30,
					107
				),
			]
		),
		_step(
			"07_dodge",
			"07 / 18",
			"闪避",
			EXECUTION_BATTLE_EVENTS,
			[_dodge_event(
				ENEMY_FOCUS_ID,
				ALLY_PET_ID,
				BattleModel.SIDE_ALLY,
				108
			)]
		),
		_step(
			"08_counter",
			"08 / 18",
			"反击",
			EXECUTION_BATTLE_EVENTS,
			[_counter_trigger_event(
				ALLY_PET_ID,
				ENEMY_FOCUS_ID,
				BattleModel.SIDE_ENEMY,
				18,
				109
			)]
		),
		_step(
			"09_skill",
			"09 / 18",
			"技能起手与命中",
			EXECUTION_BATTLE_EVENTS,
			[_skill_event(110)]
		),
		_step(
			"10_combo",
			"10 / 18",
			"三宠合击",
			EXECUTION_BATTLE_EVENTS,
			[_combo_event(111)],
			"依次听合击起手、三名参与者的轻动作/接触和最终主冲击。"
		),
		_step(
			"11_multi_mixed",
			"11 / 18",
			"多目标混合命中",
			EXECUTION_BATTLE_EVENTS,
			[_multi_mixed_event(112)],
			"同一次群攻包含闪避、格挡与暴击命中；声音应有界，不应叠成爆音。"
		),
		_reserved_step(
			"12_knockback_reserved",
			"12 / 18",
			"非致死击退（预留）",
			EXECUTION_CUE_ONLY,
			"combat.knockback",
			"当前权威战斗尚无非致死击退结果；这里只试听预留音效，不代表玩法已实装。"
		),
		_step(
			"13_launch_straight",
			"13 / 18",
			"直线击飞",
			EXECUTION_BATTLE_EVENTS,
			[_launch_event("straight", 113)]
		),
		_step(
			"14_launch_bounce",
			"14 / 18",
			"反弹撞边",
			EXECUTION_BATTLE_EVENTS,
			[_launch_event("bounce", 114)],
			"依次听命中、起飞和撞边尾音。"
		),
		_step(
			"15_down",
			"15 / 18",
			"倒地",
			EXECUTION_BATTLE_EVENTS,
			[_down_event(115)]
		),
		_reserved_step(
			"16_revive_reserved",
			"16 / 18",
			"复苏（预留）",
			EXECUTION_REVIVE_PREVIEW,
			"combat.revive",
			"当前权威玩法尚未开放战斗复苏；这里只用正式复苏动作试听预留音效，不代表玩法已实装。"
		),
		_outcome_step(
			"17_victory",
			"17 / 18",
			"胜利",
			"victory",
			"只调用正式结果音入口，不结算奖励或写入档案。"
		),
		_outcome_step(
			"18_defeat",
			"18 / 18",
			"失败",
			"defeat",
			"只调用正式结果音入口，不结算奖励或写入档案。"
		),
	]


static func low_bgm_steps() -> Array[Dictionary]:
	return [
		_mix_step("mix_a_character_hit", "A / D", "人物普通命中", "01_character_hit"),
		_mix_step("mix_b_skill", "B / D", "技能起手与命中", "09_skill"),
		_mix_step("mix_c_combo", "C / D", "三宠合击", "10_combo"),
		_mix_step("mix_d_bounce", "D / D", "反弹撞边", "14_launch_bounce"),
	]


static func step_by_id(step_id: String) -> Dictionary:
	for step in isolated_steps():
		if str(step.get("id", "")) == step_id:
			return step.duplicate(true)
	return {}


static func source_step_for_mix(step: Dictionary) -> Dictionary:
	var source_id := str(step.get("sourceStepId", "")).strip_edges()
	return step_by_id(source_id) if source_id != "" else {}


static func build_review_state() -> Dictionary:
	var state := BattleModel.create_wild_battle({
		"id": "audio_impact_review_zone",
		"name": "战斗音效验收场",
		"selectedWildPet": {
			"formId": ENEMY_FORM_ID,
			"name": "试听靶乌力",
			"level": 50,
			"battleStats": {
				"maxHp": 240,
				"attack": 20,
				"defense": 10,
				"agility": 54,
			},
			"catchable": false,
		},
	})
	var player := BattleModel.actor_by_id(state, ALLY_PLAYER_ID).duplicate(true)
	player["name"] = "见习猎人"
	player["hp"] = 240
	player["maxHp"] = 240
	player["attack"] = 28
	player["defense"] = 12
	player["quick"] = 78
	player["slotId"] = "ally.back.3"
	player["actionState"] = "idle"
	player["counterRateOverride"] = 0.0
	player["dodgeRateOverride"] = 0.0
	player["criticalRateOverride"] = 0.0

	var ally_focus := _pet_actor(
		ALLY_PET_ID,
		"芽耳布伊",
		BattleModel.SIDE_ALLY,
		"pet",
		"ally.front.3",
		ALLY_FORM_ID,
		78
	)
	var actors: Array[Dictionary] = [
		_pet_actor(
			ENEMY_MIX_DODGE_ID,
			"闪避靶乌力",
			BattleModel.SIDE_ENEMY,
			"wild_pet",
			"enemy.front.2",
			ENEMY_FORM_ID,
			62
		),
		_pet_actor(
			ENEMY_FOCUS_ID,
			"主试听靶乌力",
			BattleModel.SIDE_ENEMY,
			"wild_pet",
			"enemy.front.3",
			ENEMY_FORM_ID,
			56
		),
		_pet_actor(
			ENEMY_MIX_GUARD_ID,
			"格挡靶乌力",
			BattleModel.SIDE_ENEMY,
			"wild_pet",
			"enemy.front.4",
			ENEMY_FORM_ID,
			52
		),
		_pet_actor(
			ENEMY_MIX_SOLID_ID,
			"命中靶乌力",
			BattleModel.SIDE_ENEMY,
			"wild_pet",
			"enemy.back.3",
			ENEMY_FORM_ID,
			48
		),
		_pet_actor(
			ALLY_COMBO_LEFT_ID,
			"芽耳布伊·左",
			BattleModel.SIDE_ALLY,
			"pet",
			"ally.front.2",
			ALLY_FORM_ID,
			72
		),
		ally_focus,
		_pet_actor(
			ALLY_COMBO_RIGHT_ID,
			"芽耳布伊·右",
			BattleModel.SIDE_ALLY,
			"pet",
			"ally.front.4",
			ALLY_FORM_ID,
			68
		),
		player,
	]
	state["id"] = "local_audio_impact_review"
	state["targetSeed"] = "audio_impact_review_v2"
	state["forcedTargetSeed"] = state["targetSeed"]
	state["formationTemplate"] = ""
	state["phase"] = "command"
	state["message"] = "战斗音效集中验收。"
	state["reviewLab"] = true
	state["reviewMode"] = "audio_impact"
	state["reviewTopInset"] = 100.0
	state["guardingActorIds"] = []
	state["actors"] = actors
	state["petParty"] = BattleModel.default_player_pet_party(ally_focus)
	return state


static func prepared_state_for_step(baseline: Dictionary, step: Dictionary) -> Dictionary:
	var state := baseline.duplicate(true)
	var source_step := source_step_for_mix(step)
	var effective_step := source_step if not source_step.is_empty() else step
	var step_id := str(effective_step.get("id", ""))
	state["phase"] = "command"
	state["guardingActorIds"] = []
	state.erase("reviewVisualOnly")
	state.erase("reviewVisualActorId")
	state.erase("reviewVisualAction")
	state.erase("reviewVisualPhase")
	state = BattleModel.reset_action_states(state)
	match step_id:
		"06_block":
			state["guardingActorIds"] = [ENEMY_FOCUS_ID]
		"08_counter":
			state = _with_actor_fields(state, ENEMY_FOCUS_ID, {
				"counterRateOverride": 1.0,
				"attack": 30,
			})
		"11_multi_mixed":
			state["guardingActorIds"] = [ENEMY_MIX_GUARD_ID]
			state = _with_actor_fields(state, ENEMY_MIX_DODGE_ID, {
				"dodgeRateOverride": 1.0,
			})
			state = _with_actor_fields(state, ENEMY_MIX_GUARD_ID, {
				"dodgeRateOverride": 0.0,
			})
			state = _with_actor_fields(state, ENEMY_MIX_SOLID_ID, {
				"dodgeRateOverride": 0.0,
			})
		"13_launch_straight", "14_launch_bounce":
			state = BattleModel.set_actor_hp(state, ENEMY_FOCUS_ID, 24)
		"15_down":
			state = BattleModel.set_actor_hp(state, ENEMY_FOCUS_ID, 26)
		"16_revive_reserved":
			state = _with_actor_fields(state, ENEMY_FOCUS_ID, {
				"hp": 0,
				"actionState": "down",
				"petBattleState": "battle",
				"revivable": true,
			})
			state["reviewVisualOnly"] = true
			state["reviewVisualActorId"] = ENEMY_FOCUS_ID
			state["reviewVisualAction"] = "revive"
			state["reviewVisualPhase"] = "down_hold"
	return state


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var isolated := isolated_steps()
	var mixed := low_bgm_steps()
	if isolated.size() != ISOLATED_STEP_COUNT:
		errors.append("无背景音乐试听必须正好有18段")
	if mixed.size() != LOW_BGM_STEP_COUNT:
		errors.append("低背景音乐复测必须正好有4段")

	var ids := {}
	var numbers := {}
	for step in isolated + mixed:
		var step_id := str(step.get("id", "")).strip_edges()
		var number := str(step.get("number", "")).strip_edges()
		var label := str(step.get("label", "")).strip_edges()
		var execution := str(step.get("execution", "")).strip_edges()
		if step_id == "" or ids.has(step_id):
			errors.append("试听段落ID为空或重复：%s" % step_id)
		ids[step_id] = true
		if number == "" or numbers.has(number):
			errors.append("试听编号为空或重复：%s" % number)
		numbers[number] = true
		if label == "":
			errors.append("试听段落缺少中文名称：%s" % step_id)
		if not [
			EXECUTION_BATTLE_EVENTS,
			EXECUTION_CUE_ONLY,
			EXECUTION_REVIVE_PREVIEW,
			EXECUTION_OUTCOME,
		].has(execution):
			errors.append("试听段落执行类型无效：%s" % step_id)
		if execution == EXECUTION_BATTLE_EVENTS and (
			not (step.get("events", []) is Array)
			or (step.get("events", []) as Array).is_empty()
		):
			errors.append("真实战斗试听段落没有事件：%s" % step_id)
		if bool(step.get("reserved", false)) and str(step.get("note", "")).find("预留") < 0:
			errors.append("预留试听段落没有诚实说明：%s" % step_id)

	for step in mixed:
		var source_id := str(step.get("sourceStepId", "")).strip_edges()
		if step_by_id(source_id).is_empty():
			errors.append("低背景音乐复测引用了不存在的段落：%s" % source_id)

	var review_state := build_review_state()
	for actor_id in [
		ALLY_PLAYER_ID,
		ALLY_PET_ID,
		ALLY_COMBO_LEFT_ID,
		ALLY_COMBO_RIGHT_ID,
		ENEMY_FOCUS_ID,
		ENEMY_MIX_DODGE_ID,
		ENEMY_MIX_GUARD_ID,
		ENEMY_MIX_SOLID_ID,
	]:
		if BattleModel.actor_by_id(review_state, actor_id).is_empty():
			errors.append("试听战场缺少单位：%s" % actor_id)
	if (review_state.get("actors", []) as Array).size() != 8:
		errors.append("试听战场必须正好有8个单位")
	return _unique_strings(errors)


static func _step(
	step_id: String,
	number: String,
	label: String,
	execution: String,
	events: Array,
	note: String = ""
) -> Dictionary:
	return {
		"id": step_id,
		"number": number,
		"label": label,
		"section": SECTION_ISOLATED,
		"execution": execution,
		"events": events.duplicate(true),
		"note": note,
		"reserved": false,
		"settleSeconds": 0.62,
	}


static func _reserved_step(
	step_id: String,
	number: String,
	label: String,
	execution: String,
	cue_id: String,
	note: String
) -> Dictionary:
	return {
		"id": step_id,
		"number": number,
		"label": label,
		"section": SECTION_ISOLATED,
		"execution": execution,
		"events": [],
		"cueId": cue_id,
		"note": note,
		"reserved": true,
		"settleSeconds": 1.05,
	}


static func _outcome_step(
	step_id: String,
	number: String,
	label: String,
	result: String,
	note: String
) -> Dictionary:
	return {
		"id": step_id,
		"number": number,
		"label": label,
		"section": SECTION_ISOLATED,
		"execution": EXECUTION_OUTCOME,
		"events": [],
		"result": result,
		"note": note,
		"reserved": false,
		"settleSeconds": 1.05,
	}


static func _mix_step(
	step_id: String,
	number: String,
	label: String,
	source_step_id: String
) -> Dictionary:
	var source := step_by_id(source_step_id)
	return {
		"id": step_id,
		"number": number,
		"label": label,
		"section": SECTION_LOW_BGM,
		"execution": str(source.get("execution", "")),
		"events": (source.get("events", []) as Array).duplicate(true),
		"sourceStepId": source_step_id,
		"note": "低音量战斗音乐下复测动作与冲击的可读性。",
		"reserved": false,
		"settleSeconds": float(source.get("settleSeconds", 0.62)),
	}


static func _attack_event(
	attacker_id: String,
	target_id: String,
	target_side: String,
	damage: int,
	sequence: int
) -> Dictionary:
	return {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": target_side,
		"damage": damage,
		"speed": 90,
		"sequence": sequence,
		"movementStyle": "melee",
		"canLaunch": false,
		"canCounter": false,
		"forceDodge": false,
		"forceCritical": false,
	}


static func _heavy_attack_event(
	attacker_id: String,
	target_id: String,
	target_side: String,
	damage: int,
	sequence: int
) -> Dictionary:
	var event := _attack_event(attacker_id, target_id, target_side, damage, sequence)
	# Presentation-only. Battle authority still resolves an ordinary attack;
	# the audio cue model may select the reviewed heavy contact family.
	event["audioImpactClass"] = "heavy"
	return event


static func _critical_attack_event(
	attacker_id: String,
	target_id: String,
	target_side: String,
	damage: int,
	sequence: int
) -> Dictionary:
	var event := _attack_event(attacker_id, target_id, target_side, damage, sequence)
	event["forceCritical"] = true
	return event


static func _counter_trigger_event(
	attacker_id: String,
	target_id: String,
	target_side: String,
	damage: int,
	sequence: int
) -> Dictionary:
	var event := _attack_event(attacker_id, target_id, target_side, damage, sequence)
	event["canCounter"] = true
	return event


static func _dodge_event(
	attacker_id: String,
	target_id: String,
	target_side: String,
	sequence: int
) -> Dictionary:
	var event := _attack_event(attacker_id, target_id, target_side, 20, sequence)
	event["forceDodge"] = true
	return event


static func _defend_event(actor_id: String, sequence: int) -> Dictionary:
	return {
		"type": "defend",
		"attackerId": actor_id,
		"speed": 90,
		"sequence": sequence,
	}


static func _skill_event(sequence: int) -> Dictionary:
	return {
		"type": "skill_attack",
		"attackerId": ALLY_PET_ID,
		"targetId": ENEMY_FOCUS_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 30,
		"speed": 92,
		"sequence": sequence,
		"skillId": BattleModel.PET_SKILL_BUI_CHARGE,
		"skillName": "芽突猛冲",
		"movementStyle": "melee",
		"canLaunch": false,
		"canCounter": false,
		"forceDodge": false,
		"forceCritical": false,
	}


static func _combo_event(sequence: int) -> Dictionary:
	return {
		"type": "combo_attack",
		"attackerId": ALLY_PET_ID,
		"participantIds": [
			ALLY_COMBO_LEFT_ID,
			ALLY_PET_ID,
			ALLY_COMBO_RIGHT_ID,
		],
		"targetId": ENEMY_FOCUS_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 54,
		"speed": 94,
		"sequence": sequence,
		"movementStyle": "melee_combo",
		"canLaunch": false,
		"canCounter": false,
	}


static func _multi_mixed_event(sequence: int) -> Dictionary:
	return {
		"type": "multi_attack",
		"attackerId": ALLY_PLAYER_ID,
		"targetId": ENEMY_MIX_DODGE_ID,
		"targetIds": [
			ENEMY_MIX_DODGE_ID,
			ENEMY_MIX_GUARD_ID,
			ENEMY_MIX_SOLID_ID,
		],
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 0,
		"speed": 90,
		"sequence": sequence,
		"actionId": "weapon_shadow_group_shot",
		"skillName": "玄影连射",
		"movementStyle": "ranged_multi",
		"canDodge": true,
		"canCritical": true,
		"canCounter": false,
		"canLaunch": false,
		"forceCritical": true,
	}


static func _launch_event(mode: String, sequence: int) -> Dictionary:
	var event := _attack_event(
		ALLY_PET_ID,
		ENEMY_FOCUS_ID,
		BattleModel.SIDE_ENEMY,
		96,
		sequence
	)
	event["canLaunch"] = true
	event["launchMode"] = "bounce" if mode == "bounce" else "straight"
	return event


static func _down_event(sequence: int) -> Dictionary:
	return _attack_event(
		ALLY_PET_ID,
		ENEMY_FOCUS_ID,
		BattleModel.SIDE_ENEMY,
		42,
		sequence
	)


static func _pet_actor(
	actor_id: String,
	actor_name: String,
	side: String,
	kind: String,
	slot_id: String,
	form_id: String,
	quick: int
) -> Dictionary:
	var actor := PetTemplateCatalog.actor_from_form(
		form_id,
		actor_id,
		side,
		kind,
		slot_id,
		actor_name,
		{
			"hp": 240,
			"maxHp": 240,
			"quick": quick,
			"attack": 28,
			"defense": 10,
		}
	)
	if actor.is_empty():
		return {}
	actor["hp"] = 240
	actor["maxHp"] = 240
	actor["quick"] = quick
	actor["attack"] = 28
	actor["defense"] = 10
	actor["actionState"] = "idle"
	actor["petBattleState"] = "battle"
	actor["catchable"] = false
	actor["counterRateOverride"] = 0.0
	actor["dodgeRateOverride"] = 0.0
	actor["criticalRateOverride"] = 0.0
	actor["comboBaseRateOverride"] = 1.0 if [
		ALLY_PET_ID,
		ALLY_COMBO_LEFT_ID,
		ALLY_COMBO_RIGHT_ID,
	].has(actor_id) else 0.0
	return actor


static func _with_actor_fields(
	state: Dictionary,
	actor_id: String,
	fields: Dictionary
) -> Dictionary:
	var result := state.duplicate(true)
	var actors: Array = result.get("actors", [])
	var actor_index := BattleModel.actor_index(result, actor_id)
	if actor_index < 0:
		return result
	var actor := (actors[actor_index] as Dictionary).duplicate(true)
	for key in fields.keys():
		actor[str(key)] = fields[key]
	actors[actor_index] = actor
	result["actors"] = actors
	return result


static func _unique_strings(values: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for value in values:
		if value != "" and not result.has(value):
			result.append(value)
	return result
