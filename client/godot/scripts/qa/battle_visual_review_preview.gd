extends RefCounted

const FORM_ID := "bui_novice_sprout_earth5_wind5"
const ALLY_ID := "ally_visual_review_pet"
const ENEMY_ID := "enemy_visual_review_pet"
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")

const SUPPORTED_SCENARIOS: Array[String] = [
	"formation_10v10",
	"formation_10v10_mixed",
	"counter",
	"counter_ko",
	"counter_launch",
	"knockaway",
	"knockaway_bounce",
	"defend",
	"defend_hit",
	"attack",
	"skill_attack",
	"combo",
	"hurt_recovery",
	"down_exit",
	"dodge",
]

var host
var scenario: String


func _init(host_node, requested_scenario: String) -> void:
	host = host_node
	scenario = requested_scenario if SUPPORTED_SCENARIOS.has(requested_scenario) else "attack"


func run() -> void:
	host.profile_save_enabled = false
	host.player_profile = PlayerProgressModel.default_profile()
	host._start_battle(_formation_state() if scenario.begins_with("formation_10v10") else _action_state())
	await host.get_tree().process_frame
	host.battle_pet_art_elapsed = 0.0
	host._set_battle_message(_intro_message())
	host.queue_redraw()
	await _wait(1.0)

	match scenario:
		"formation_10v10", "formation_10v10_mixed":
			await _wait(5.0)
		"counter":
			await _play_and_settle(_attack_event(ENEMY_ID, ALLY_ID, BattleModel.SIDE_ALLY, 16, true), 1.25)
			_restore_actor_hp(ALLY_ID)
			_restore_actor_hp(ENEMY_ID)
			await _wait(0.45)
			await _play_and_settle(_attack_event(ENEMY_ID, ALLY_ID, BattleModel.SIDE_ALLY, 16, true), 1.0)
		"counter_ko":
			_prepare_counter_target(12)
			await _play_and_settle(_attack_event(ALLY_ID, ENEMY_ID, BattleModel.SIDE_ENEMY, 16, true), 1.2)
		"counter_launch":
			_prepare_counter_target(2)
			await _play_and_settle(_attack_event(ALLY_ID, ENEMY_ID, BattleModel.SIDE_ENEMY, 16, true), 1.2)
		"knockaway":
			_prepare_knockaway_target()
			await _play_and_settle(_knockaway_event("straight"), 1.2)
		"knockaway_bounce":
			_prepare_knockaway_target()
			await _play_and_settle(_knockaway_event("bounce"), 1.2)
		"defend":
			await _play_and_settle(_defend_event(), 0.65)
			await _wait(0.45)
			await _play_and_settle(_defend_event(), 0.9)
		"defend_hit":
			await _play_sequence_and_settle([
				_defend_event(),
				_attack_event(ENEMY_ID, ALLY_ID, BattleModel.SIDE_ALLY, 30, false),
			], 1.0)
			_restore_actor_hp(ALLY_ID)
			_restore_actor_hp(ENEMY_ID)
			await _wait(0.45)
			await _play_sequence_and_settle([
				_defend_event(),
				_attack_event(ENEMY_ID, ALLY_ID, BattleModel.SIDE_ALLY, 30, false),
			], 1.0)
		"attack":
			await _play_twice(_attack_event(ALLY_ID, ENEMY_ID, BattleModel.SIDE_ENEMY, 18, false))
		"skill_attack":
			await _play_twice(_skill_event())
		"combo":
			await _play_twice(_combo_event(), 1.45)
		"hurt_recovery":
			await _play_twice(_attack_event(ENEMY_ID, ALLY_ID, BattleModel.SIDE_ALLY, 20, false), 1.0)
		"down_exit":
			_prepare_down_target()
			await _play_and_settle(_down_event(), 2.0)
		"dodge":
			await _play_twice(_dodge_event(), 1.0)

	if host.game_audio_manager != null:
		host.game_audio_manager.stop_all()
	# AudioServer releases active playback objects asynchronously. Let the
	# stopped streams drain before the MovieWriter/QA process exits.
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	host.get_tree().quit(0)


func _play_twice(event: Dictionary, settle_seconds: float = 1.0) -> void:
	await _play_and_settle(event, settle_seconds)
	_restore_actor_hp(ALLY_ID)
	_restore_actor_hp(ENEMY_ID)
	await _wait(0.45)
	await _play_and_settle(event, settle_seconds)


func _play_and_settle(event: Dictionary, settle_seconds: float) -> void:
	await _play_sequence_and_settle([event], settle_seconds)


func _play_sequence_and_settle(events: Array, settle_seconds: float) -> void:
	var queued_events: Array[Dictionary] = []
	var guarding_ids: Array[String] = []
	for value in events:
		if value is Dictionary:
			var event := (value as Dictionary).duplicate(true)
			queued_events.append(event)
			if str(event.get("type", "")) == "defend":
				var defender_id := str(event.get("attackerId", ""))
				if defender_id != "" and not guarding_ids.has(defender_id):
					guarding_ids.append(defender_id)
	if not guarding_ids.is_empty():
		host.battle_state["guardingActorIds"] = guarding_ids
	host.battle_event_queue = queued_events
	host.battle_state["phase"] = "round_events"
	host.battle_round_end_status_processed = true
	host._play_next_battle_event()
	var elapsed := 0.0
	while elapsed < 6.0 and (
		not host.battle_current_event.is_empty()
		or not host.battle_event_queue.is_empty()
		or str(host.battle_state.get("phase", "")) == "round_events"
	):
		await host.get_tree().process_frame
		elapsed += host.get_process_delta_time()
	await _wait(settle_seconds)


func _wait(seconds: float) -> void:
	await host.get_tree().create_timer(seconds).timeout


func _formation_state() -> Dictionary:
	var state := BattleModel.create_formation_preview_battle({
		"id": "battle_visual_review_formation_zone",
		"name": "阵型演练场",
	})
	state["id"] = "local_battle_visual_review_formation"
	state["targetSeed"] = "battle_visual_review_formation"
	state["phase"] = "command"
	state["message"] = "双方 10V10 阵型展开。"
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var previous := actors[index] as Dictionary
		if str(previous.get("kind", "")) == "player":
			actors[index] = previous.duplicate(true)
			continue
		var side := str(previous.get("side", BattleModel.SIDE_ENEMY))
		var row_label := "前" if str(previous.get("slotId", "")).contains(".front.") else "后"
		var side_label := "我" if side == BattleModel.SIDE_ALLY else "敌"
		actors[index] = _review_actor(
			str(previous.get("id", "review_actor_%d" % index)),
			"%s%s%d" % [side_label, row_label, (index % BattleModel.SLOTS_PER_ROW) + 1],
			side,
			str(previous.get("slotId", "enemy.front.3")),
			180,
			55 + index
		)
	state["actors"] = actors
	return state


func _action_state() -> Dictionary:
	var state := BattleModel.create_wild_battle({
		"id": "battle_visual_review_action_zone",
		"name": "动作演练场",
	})
	state["id"] = "local_battle_visual_review_%s" % scenario
	state["targetSeed"] = "battle_visual_review_%s" % scenario
	state["formationTemplate"] = ""
	state["phase"] = "command"
	state["message"] = _intro_message()
	var ally_max_hp := 40 if scenario == "counter_ko" or scenario == "counter_launch" else 220
	var actors: Array = [
		_review_actor(ENEMY_ID, "训练幻影·芽耳布伊", BattleModel.SIDE_ENEMY, "enemy.front.3", 220, 54),
		_review_actor(ALLY_ID, "芽耳布伊", BattleModel.SIDE_ALLY, "ally.front.3", ally_max_hp, 72),
	]
	if scenario == "counter_ko" or scenario == "counter_launch":
		actors[0]["counterRateOverride"] = 1.0
		actors[1]["counterRateOverride"] = 0.0
	if scenario == "combo":
		actors.append(_review_actor("ally_combo_left", "芽耳布伊·左", BattleModel.SIDE_ALLY, "ally.front.2", 220, 68))
		actors.append(_review_actor("ally_combo_back", "芽耳布伊·后", BattleModel.SIDE_ALLY, "ally.back.3", 220, 64))
	if scenario == "knockaway" or scenario == "knockaway_bounce" or scenario == "down_exit":
		actors.append(_review_actor("enemy_observer", "观战幻影", BattleModel.SIDE_ENEMY, "enemy.back.1", 220, 42))
	state["actors"] = actors
	return state


func _review_actor(actor_id: String, actor_name: String, side: String, slot_id: String, max_hp: int, quick: int) -> Dictionary:
	var kind := "pet" if side == BattleModel.SIDE_ALLY else "wild_pet"
	var actor := PetTemplateCatalog.actor_from_form(
		FORM_ID,
		actor_id,
		side,
		kind,
		slot_id,
		actor_name,
		{
			"hp": max_hp,
			"maxHp": max_hp,
			"quick": quick,
			"attack": 24,
			"defense": 10,
		}
	)
	actor["hp"] = max_hp
	actor["maxHp"] = max_hp
	actor["quick"] = quick
	actor["attack"] = 24
	actor["defense"] = 10
	actor["actionState"] = "idle"
	actor["catchable"] = false
	actor["counterRateOverride"] = 1.0 if actor_id == ALLY_ID else 0.0
	actor["dodgeRateOverride"] = 0.0
	actor["criticalRateOverride"] = 0.0
	return actor


func _attack_event(attacker_id: String, target_id: String, target_side: String, damage: int, can_counter: bool) -> Dictionary:
	return {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": target_side,
		"damage": damage,
		"speed": 90,
		"sequence": 1,
		"movementStyle": "melee",
		"canLaunch": false,
		"canCounter": can_counter,
		"forceDodge": false,
		"forceCritical": false,
	}


func _skill_event() -> Dictionary:
	return {
		"type": "skill_attack",
		"attackerId": ALLY_ID,
		"targetId": ENEMY_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 24,
		"speed": 92,
		"sequence": 2,
		"skillId": BattleModel.PET_SKILL_BUI_CHARGE,
		"skillName": "芽突猛冲",
		"movementStyle": "melee",
		"canLaunch": false,
		"canCounter": false,
		"forceDodge": false,
		"forceCritical": false,
	}


func _combo_event() -> Dictionary:
	return {
		"type": "combo_attack",
		"attackerId": ALLY_ID,
		"participantIds": [ALLY_ID, "ally_combo_left", "ally_combo_back"],
		"targetId": ENEMY_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 42,
		"speed": 94,
		"sequence": 3,
		"movementStyle": "melee_combo",
		"canLaunch": false,
		"canCounter": false,
	}


func _defend_event() -> Dictionary:
	return {
		"type": "defend",
		"attackerId": ALLY_ID,
		"speed": 90,
		"sequence": 4,
	}


func _knockaway_event(mode: String) -> Dictionary:
	return {
		"type": "attack",
		"attackerId": ALLY_ID,
		"targetId": ENEMY_ID,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 96,
		"speed": 96,
		"sequence": 5,
		"movementStyle": "melee",
		"canLaunch": true,
		"launchMode": mode,
		"forceDodge": false,
		"forceCritical": false,
	}


func _down_event() -> Dictionary:
	var event := _attack_event(ALLY_ID, ENEMY_ID, BattleModel.SIDE_ENEMY, 42, false)
	event["sequence"] = 6
	event["canLaunch"] = false
	return event


func _dodge_event() -> Dictionary:
	var event := _attack_event(ENEMY_ID, ALLY_ID, BattleModel.SIDE_ALLY, 18, false)
	event["sequence"] = 7
	event["forceDodge"] = true
	return event


func _prepare_knockaway_target() -> void:
	host.battle_state = BattleModel.set_actor_hp(host.battle_state, ENEMY_ID, 24)


func _prepare_down_target() -> void:
	host.battle_state = BattleModel.set_actor_hp(host.battle_state, ENEMY_ID, 26)


func _prepare_counter_target(hp: int) -> void:
	host.battle_state = BattleModel.set_actor_hp(host.battle_state, ALLY_ID, hp)


func _restore_actor_hp(actor_id: String) -> void:
	var actor := BattleModel.actor_by_id(host.battle_state, actor_id)
	if actor.is_empty():
		return
	host.battle_state = BattleModel.set_actor_hp(host.battle_state, actor_id, int(actor.get("maxHp", 1)))
	host.battle_state = BattleModel.reset_action_states(host.battle_state)
	host.queue_redraw()


func _intro_message() -> String:
	match scenario:
		"formation_10v10":
			return "双方前排宠物、后排人物的 10V10 阵型展开。"
		"formation_10v10_mixed":
			return "双方前排宠物、后排人物的 10V10 阵型展开。"
		"counter":
			return "受到近身攻击后，芽耳布伊准备反击。"
		"counter_ko":
			return "芽耳布伊近身攻击后遭到致命反击。"
		"counter_launch":
			return "芽耳布伊近身攻击后遭到重伤反击并被击飞。"
		"knockaway":
			return "芽耳布伊准备把目标直线击飞。"
		"knockaway_bounce":
			return "芽耳布伊准备把目标撞向场边。"
		"defend":
			return "芽耳布伊准备进入防御姿态。"
		"defend_hit":
			return "芽耳布伊防御时承受攻击，观察盾面命中与承压。"
		"attack":
			return "芽耳布伊准备发动普通攻击。"
		"skill_attack":
			return "芽耳布伊准备使用芽突猛冲。"
		"combo":
			return "三只芽耳布伊准备发动合击。"
		"hurt_recovery":
			return "观察受击、停顿与重新站稳的衔接。"
		"down_exit":
			return "观察目标倒地后的战场表达。"
		"dodge":
			return "观察近身攻击被闪避时的表达。"
	return "战斗动作演练。"
