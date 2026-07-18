extends RefCounted

const FORM_ID := "bui_novice_sprout_earth5_wind5"
const INSTANCE_ID := "pet_art_preview_novice_sprout_bui"
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")

var host


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	host.profile_save_enabled = false
	host.player_profile = _preview_profile()
	host._set_pet_follow_enabled(true, INSTANCE_ID)
	host._update_hud_text(true)
	host._set_world_log_message("芽耳布伊已加入队伍。")
	await host.get_tree().create_timer(0.9).timeout
	await _walk_world_path(Vector2i(7, -4), 2.1)
	await _walk_world_path(Vector2i(-4, 6), 2.1)
	await host.get_tree().create_timer(0.45).timeout

	host._start_battle(_preview_battle_state())
	await host.get_tree().create_timer(0.85).timeout
	await _show_battle_action("idle", 1.0, "芽耳布伊正在观察对手。")
	await _show_battle_action("defend", 1.3, "芽耳布伊摆出防御架势。")
	await _show_battle_action("attack", 1.35, "芽耳布伊发起攻击。")
	await _show_battle_action("hit", 1.2, "芽耳布伊受到冲击。")
	await _show_battle_action("idle", 0.9, "芽耳布伊重新站稳。")
	host.get_tree().quit(0)


func _preview_profile() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var instance := PlayerProgressModel.create_pet_instance_from_form(
		INSTANCE_ID,
		"芽耳布伊",
		FORM_ID,
		PlayerProgressModel.PET_STATE_BATTLE,
		1,
		{
			"individualSeed": "pet_art_preview_novice_sprout_bui",
			"binding": "bound",
		}
	)
	profile["petInstances"] = [instance]
	profile["activePetInstanceId"] = INSTANCE_ID
	profile["nextPetInstanceSerial"] = 2
	return PlayerProgressModel.normalize_profile(profile)


func _walk_world_path(offset: Vector2i, max_seconds: float) -> void:
	var start_cell := IsoMapModel.world_to_grid(host.map_data, host.player.global_position)
	var target_cell := IsoMapModel.nearest_walkable_cell(host.map_data, start_cell + offset)
	host._set_move_target_cell(target_cell, IsoMapModel.grid_to_world(host.map_data, target_cell), target_cell)
	var elapsed := 0.0
	while elapsed < max_seconds and host.player.is_auto_moving():
		await host.get_tree().process_frame
		elapsed += host.get_process_delta_time()


func _preview_battle_state() -> Dictionary:
	var zones := EncounterModel.encounter_zones(host.map_data)
	var zone := zones[0] as Dictionary if not zones.is_empty() and zones[0] is Dictionary else {
		"id": "pet_art_preview_zone",
		"name": "训练场",
	}
	var state := BattleModel.create_wild_battle(zone)
	state["id"] = "local_pet_action_art_preview_battle"
	state["phase"] = "command"
	state["message"] = "芽耳布伊与训练幻影进入战斗。"
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := (actors[index] as Dictionary).duplicate(true)
		var actor_id := str(actor.get("id", ""))
		if not [BattleModel.PLAYER_PET_ID, "enemy_0"].has(actor_id):
			continue
		actor = _with_preview_pet_identity(actor, actor_id == "enemy_0")
		actors[index] = actor
	state["actors"] = actors
	return state


func _with_preview_pet_identity(actor: Dictionary, enemy: bool) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(FORM_ID)
	var stats := template.get("baseStats", {}) as Dictionary if template.get("baseStats", {}) is Dictionary else {}
	actor["name"] = "训练幻影·芽耳布伊" if enemy else "芽耳布伊"
	actor["formId"] = FORM_ID
	actor["templateId"] = FORM_ID
	actor["maxHp"] = int(stats.get("maxHp", 80))
	actor["hp"] = int(stats.get("maxHp", 80))
	actor["attack"] = int(stats.get("attack", 11))
	actor["defense"] = int(stats.get("defense", 9))
	actor["quick"] = int(stats.get("agility", 46))
	actor["actionState"] = "idle"
	actor["catchable"] = false
	actor["passiveSkillIds"] = PetTemplateCatalog.passive_ids_for_form(FORM_ID)
	return actor


func _show_battle_action(action_state: String, seconds: float, message: String) -> void:
	var actors: Array = host.battle_state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := (actors[index] as Dictionary).duplicate(true)
		if str(actor.get("formId", actor.get("templateId", ""))) == FORM_ID:
			actor["actionState"] = action_state
			actors[index] = actor
	host.battle_state["actors"] = actors
	host.battle_state["phase"] = "command"
	host.battle_current_event.clear()
	host.battle_current_event_duration = 0.0
	host.battle_action_timer = 0.0
	host.battle_pet_art_elapsed = 0.0
	host._set_battle_message(message)
	host.queue_redraw()
	await host.get_tree().create_timer(seconds).timeout
