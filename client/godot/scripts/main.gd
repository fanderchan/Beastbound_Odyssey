extends Node2D

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")
const PET_SCENE := preload("res://scenes/pet/Pet.tscn")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const START_MAP_ID := "firebud_training_yard"
const MAP_DATA_PATHS := {
	"firebud_training_yard": "res://data/firebud_training_map.json",
	"firebud_village_gate": "res://data/firebud_village_gate_map.json",
}
const MIN_TOUCH_BUTTON_SIZE := Vector2(64, 64)
const ACTION_BAR_SIZE := Vector2(218, 86)
const DIALOG_PANEL_HEIGHT := 214.0
const BATTLE_GRID_TEMPLATE_SIZE := Vector2(1280.0, 720.0)
const BATTLE_GRID_TEMPLATE_ORIGIN := Vector2(128.0, 338.4)
const BATTLE_GRID_TEMPLATE_LANE_STEP := Vector2(152.0, 52.0)
const BATTLE_GRID_TEMPLATE_RANK_STEP := Vector2(76.0, -48.0)
const BATTLE_MELEE_CONTACT_DISTANCE := 34.0
const BATTLE_COMBO_STAGGER_SECONDS := 0.24
const BATTLE_COMBO_ACTION_SECONDS := 0.92
const BATTLE_COMBO_RETURN_PADDING_SECONDS := 0.16
const BATTLE_COMBO_APPROACH_RATIO := 0.34
const BATTLE_COMBO_HOLD_RATIO := 0.58
const BATTLE_LAUNCH_HIT_RATIO := 0.24
const BATTLE_LAUNCH_TARGET_START_RATIO := 0.30
const BATTLE_LAUNCH_ATTACK_RETURN_RATIO := 0.58
const BATTLE_BOUNCE_EDGE_RATIO := 0.42
const BATTLE_BOUNCE_ROLL_RATIO := 0.76

var player: CharacterBody2D
var pet
var hud_root: Control
var top_panel: PanelContainer
var side_panel: PanelContainer
var action_bar: PanelContainer
var dialog_panel: PanelContainer
var status_label: Label
var detail_label: Label
var dialog_name_label: Label
var dialog_body_label: Label
var dialog_option_button: Button
var dialog_close_button: Button
var encounter_panel: PanelContainer
var encounter_title_label: Label
var encounter_body_label: Label
var encounter_enter_button: Button
var encounter_retreat_button: Button
var battle_command_panel: PanelContainer
var battle_command_title_label: Label
var battle_message_panel: PanelContainer
var battle_log_label: Label
var battle_command_buttons: Dictionary = {}
var stop_button: Button
var ring_button: Button
var game_camera: Camera2D
var auto_movement_check: bool = false
var auto_mouse_click_check: bool = false
var auto_pathfinding_check: bool = false
var auto_eight_direction_check: bool = false
var auto_direct_line_check: bool = false
var auto_facing_check: bool = false
var auto_camera_check: bool = false
var auto_camera_click_check: bool = false
var auto_animation_state_check: bool = false
var auto_pet_follow_check: bool = false
var auto_npc_interaction_check: bool = false
var auto_npc_collision_check: bool = false
var auto_map_transfer_check: bool = false
var auto_encounter_check: bool = false
var auto_battle_check: bool = false
var auto_battle_formation_check: bool = false
var auto_battle_target_check: bool = false
var auto_battle_round_check: bool = false
var auto_battle_speed_check: bool = false
var auto_battle_feedback_check: bool = false
var auto_battle_combo_check: bool = false
var auto_battle_capture_check: bool = false
var auto_battle_spirit_check: bool = false
var auto_battle_pet_command_check: bool = false
var auto_battle_pet_target_check: bool = false
var auto_battle_spirit_four_check: bool = false
var auto_battle_action_catalog_check: bool = false
var auto_battle_item_check: bool = false
var auto_battle_item_count_check: bool = false
var auto_battle_stat_formula_check: bool = false
var auto_battle_defense_check: bool = false
var auto_battle_launch_check: bool = false
var auto_battle_melee_motion_check: bool = false
var auto_battle_combo_motion_check: bool = false
var auto_battle_switch_pet_check: bool = false
var auto_battle_retarget_visual_check: bool = false
var auto_battle_visual_timing_check: bool = false
var battle_preview: bool = false
var battle_formation_preview: bool = false
var battle_stat_test: bool = false
var battle_combo_motion_preview: bool = false
var battle_launch_preview_mode: String = ""
var battle_debug_window_enabled: bool = false
var current_map_id: String = START_MAP_ID
var map_data: Dictionary = {}
var current_path_cells: Array[Vector2i] = []
var current_path_is_direct: bool = false
var pet_follow_enabled: bool = false
var pet_follow_points: Array[Vector2] = []
var pet_follow_index: int = 0
var target_marker: Vector2 = Vector2.ZERO
var has_target_marker: bool = false
var target_cell: Vector2i = Vector2i.ZERO
var has_target_cell: bool = false
var has_pending_interaction: bool = false
var pending_interaction: Dictionary = {}
var pending_interaction_approach_cell: Vector2i = Vector2i.ZERO
var active_dialog_interaction: Dictionary = {}
var active_encounter_zone: Dictionary = {}
var encounter_active: bool = false
var battle_active: bool = false
var battle_state: Dictionary = {}
var battle_action_timer: float = 0.0
var battle_end_pending: bool = false
var battle_enemy_response_pending: bool = false
var battle_selected_target_id: String = ""
var battle_selected_ally_target_id: String = ""
var battle_hover_target_id: String = ""
var battle_hover_ally_target_id: String = ""
var battle_target_mode: String = "enemy"
var battle_command_owner: String = "player"
var battle_pending_spirit_id: String = ""
var battle_pending_item_id: String = ""
var battle_switch_pet_button_pet_ids: Dictionary = {}
var battle_pending_player_command: Dictionary = {}
var battle_pending_pet_command: Dictionary = {}
var battle_event_queue: Array[Dictionary] = []
var battle_current_event: Dictionary = {}
var battle_current_event_duration: float = 0.0
var battle_current_event_actor_snapshots: Dictionary = {}
var battle_last_round_applied_events: int = 0
var battle_last_round_event_types: Array[String] = []
var battle_last_round_actor_order: Array[String] = []
var battle_last_round_speeds: Array[int] = []
var battle_last_round_enemy_target_ids: Array[String] = []
var battle_last_event_type: String = ""
var battle_last_event_target_id: String = ""
var battle_last_event_target_ids: Array[String] = []
var battle_last_event_damage: int = 0
var battle_last_event_heal: int = 0
var battle_last_event_launch: bool = false
var battle_last_event_launch_mode: String = ""
var battle_float_texts: Array[Dictionary] = []
var battle_debug_window: Window
var battle_debug_text: TextEdit
var battle_debug_last_text: String = ""
var battle_trace_path: String = ""
var last_checked_player_cell: Vector2i = Vector2i.ZERO
var encounter_rng := RandomNumberGenerator.new()
var task_flags: Dictionary = {}


func _ready() -> void:
	_apply_preview_window_args()
	_load_map(START_MAP_ID)
	get_tree().root.size_changed.connect(_layout_hud)
	encounter_rng.randomize()
	_spawn_player()
	_spawn_pet()
	_build_camera()
	_build_hud()
	_layout_hud()
	set_process(true)
	if auto_encounter_check:
		call_deferred("_run_auto_encounter_check")
	elif auto_battle_action_catalog_check:
		call_deferred("_run_auto_battle_action_catalog_check")
	elif auto_battle_item_check:
		call_deferred("_run_auto_battle_item_check")
	elif auto_battle_item_count_check:
		call_deferred("_run_auto_battle_item_count_check")
	elif auto_battle_stat_formula_check:
		call_deferred("_run_auto_battle_stat_formula_check")
	elif auto_battle_defense_check:
		call_deferred("_run_auto_battle_defense_check")
	elif auto_battle_launch_check:
		call_deferred("_run_auto_battle_launch_check")
	elif auto_battle_melee_motion_check:
		call_deferred("_run_auto_battle_melee_motion_check")
	elif auto_battle_combo_motion_check:
		call_deferred("_run_auto_battle_combo_motion_check")
	elif auto_battle_switch_pet_check:
		call_deferred("_run_auto_battle_switch_pet_check")
	elif auto_battle_retarget_visual_check:
		call_deferred("_run_auto_battle_retarget_visual_check")
	elif auto_battle_visual_timing_check:
		call_deferred("_run_auto_battle_visual_timing_check")
	elif auto_map_transfer_check:
		call_deferred("_run_auto_map_transfer_check")
	elif auto_battle_formation_check:
		call_deferred("_run_auto_battle_formation_check")
	elif auto_battle_target_check:
		call_deferred("_run_auto_battle_target_check")
	elif auto_battle_round_check:
		call_deferred("_run_auto_battle_round_check")
	elif auto_battle_speed_check:
		call_deferred("_run_auto_battle_speed_check")
	elif auto_battle_feedback_check:
		call_deferred("_run_auto_battle_feedback_check")
	elif auto_battle_combo_check:
		call_deferred("_run_auto_battle_combo_check")
	elif auto_battle_capture_check:
		call_deferred("_run_auto_battle_capture_check")
	elif auto_battle_spirit_check:
		call_deferred("_run_auto_battle_spirit_check")
	elif auto_battle_pet_command_check:
		call_deferred("_run_auto_battle_pet_command_check")
	elif auto_battle_pet_target_check:
		call_deferred("_run_auto_battle_pet_target_check")
	elif auto_battle_spirit_four_check:
		call_deferred("_run_auto_battle_spirit_four_check")
	elif auto_battle_check:
		call_deferred("_run_auto_battle_check")
	elif auto_npc_collision_check:
		call_deferred("_run_auto_npc_collision_check")
	elif auto_npc_interaction_check:
		call_deferred("_run_auto_npc_interaction_check")
	elif auto_pet_follow_check:
		call_deferred("_run_auto_pet_follow_check")
	elif auto_animation_state_check:
		call_deferred("_run_auto_animation_state_check")
	elif auto_camera_click_check:
		call_deferred("_run_auto_camera_click_check")
	elif auto_camera_check:
		call_deferred("_run_auto_camera_check")
	elif auto_facing_check:
		call_deferred("_run_auto_facing_check")
	elif auto_direct_line_check:
		call_deferred("_run_auto_direct_line_check")
	elif auto_eight_direction_check:
		call_deferred("_run_auto_eight_direction_check")
	elif auto_pathfinding_check:
		call_deferred("_run_auto_pathfinding_check")
	elif auto_movement_check:
		call_deferred("_run_auto_movement_check")
	elif auto_mouse_click_check:
		call_deferred("_run_auto_mouse_click_check")
	elif battle_preview:
		call_deferred("_open_battle_preview")
	elif battle_formation_preview:
		call_deferred("_open_battle_formation_preview")
	elif battle_stat_test:
		call_deferred("_open_battle_stat_test")
	elif battle_combo_motion_preview:
		call_deferred("_open_battle_combo_motion_preview")
	elif battle_launch_preview_mode != "":
		call_deferred("_open_battle_launch_preview", battle_launch_preview_mode)


func _apply_preview_window_args() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg == "--preview-mobile":
			pass
		elif arg == "--preview-mobile-portrait":
			pass
		elif arg == "--auto-movement-check":
			auto_movement_check = true
		elif arg == "--auto-mouse-click-check":
			auto_mouse_click_check = true
		elif arg == "--auto-pathfinding-check":
			auto_pathfinding_check = true
		elif arg == "--auto-eight-direction-check":
			auto_eight_direction_check = true
		elif arg == "--auto-direct-line-check":
			auto_direct_line_check = true
		elif arg == "--auto-facing-check":
			auto_facing_check = true
		elif arg == "--auto-camera-check":
			auto_camera_check = true
		elif arg == "--auto-camera-click-check":
			auto_camera_click_check = true
		elif arg == "--auto-animation-state-check":
			auto_animation_state_check = true
		elif arg == "--auto-pet-follow-check":
			auto_pet_follow_check = true
		elif arg == "--auto-npc-interaction-check":
			auto_npc_interaction_check = true
		elif arg == "--auto-npc-collision-check":
			auto_npc_collision_check = true
		elif arg == "--auto-map-transfer-check":
			auto_map_transfer_check = true
		elif arg == "--auto-encounter-check":
			auto_encounter_check = true
		elif arg == "--auto-battle-check":
			auto_battle_check = true
		elif arg == "--auto-battle-formation-check":
			auto_battle_formation_check = true
		elif arg == "--auto-battle-target-check":
			auto_battle_target_check = true
		elif arg == "--auto-battle-round-check":
			auto_battle_round_check = true
		elif arg == "--auto-battle-speed-check":
			auto_battle_speed_check = true
		elif arg == "--auto-battle-feedback-check":
			auto_battle_feedback_check = true
		elif arg == "--auto-battle-combo-check":
			auto_battle_combo_check = true
		elif arg == "--auto-battle-capture-check":
			auto_battle_capture_check = true
		elif arg == "--auto-battle-spirit-check":
			auto_battle_spirit_check = true
		elif arg == "--auto-battle-pet-command-check":
			auto_battle_pet_command_check = true
		elif arg == "--auto-battle-pet-target-check":
			auto_battle_pet_target_check = true
		elif arg == "--auto-battle-spirit-four-check":
			auto_battle_spirit_four_check = true
		elif arg == "--auto-battle-action-catalog-check":
			auto_battle_action_catalog_check = true
		elif arg == "--auto-battle-item-check":
			auto_battle_item_check = true
		elif arg == "--auto-battle-item-count-check":
			auto_battle_item_count_check = true
		elif arg == "--auto-battle-stat-formula-check":
			auto_battle_stat_formula_check = true
		elif arg == "--auto-battle-defense-check":
			auto_battle_defense_check = true
		elif arg == "--auto-battle-launch-check":
			auto_battle_launch_check = true
		elif arg == "--auto-battle-melee-motion-check":
			auto_battle_melee_motion_check = true
		elif arg == "--auto-battle-combo-motion-check":
			auto_battle_combo_motion_check = true
		elif arg == "--auto-battle-switch-pet-check":
			auto_battle_switch_pet_check = true
		elif arg == "--auto-battle-retarget-visual-check":
			auto_battle_retarget_visual_check = true
		elif arg == "--auto-battle-visual-timing-check":
			auto_battle_visual_timing_check = true
		elif arg == "--battle-preview":
			battle_preview = true
		elif arg == "--battle-preview-10v10":
			battle_formation_preview = true
		elif arg == "--battle-stat-test":
			battle_stat_test = true
		elif arg == "--battle-combo-motion-preview":
			battle_combo_motion_preview = true
		elif arg == "--battle-launch-straight-preview":
			battle_launch_preview_mode = "straight"
		elif arg == "--battle-launch-bounce-preview":
			battle_launch_preview_mode = "bounce"
		elif arg == "--battle-debug-window":
			battle_debug_window_enabled = true


func _load_map(map_id: String, spawn_name: String = "default") -> bool:
	var map_path := str(MAP_DATA_PATHS.get(map_id, ""))
	if map_path == "":
		return false
	var loaded_map := IsoMapModel.load_map(map_path)
	if loaded_map.is_empty():
		return false

	map_data = loaded_map
	current_map_id = str(map_data.get("id", map_id))
	_clear_navigation_state()
	_close_dialog()
	_close_encounter()
	_end_battle(false)

	if player != null:
		var spawn := IsoMapModel.spawn_cell(map_data, spawn_name)
		player.global_position = IsoMapModel.grid_to_world(map_data, spawn)
		player.clear_move_target()
		player.set_movement_bounds(_player_movement_bounds())
		last_checked_player_cell = spawn
	if pet != null:
		pet.clear_follow_target()
		pet.global_position = player.global_position + Vector2(-56, 36)
		pet_follow_points.clear()
		pet_follow_index = 0
		if pet_follow_enabled:
			pet_follow_points.append(pet.global_position)
			pet_follow_points.append(player.global_position)
			pet.set_follow_target(pet.global_position)
	if game_camera != null:
		_update_camera_limits()
		_update_camera_position(true)
	if status_label != null:
		_update_hud_text()
	queue_redraw()
	return true


func _run_auto_movement_check() -> void:
	var start_position := player.global_position
	var target := IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data) + Vector2i(2, -2))
	_set_click_move_target(_world_to_screen(target))
	for _step in range(18):
		await get_tree().physics_frame
	var end_position := player.global_position
	var moved_right := end_position.x > start_position.x
	var status := "ok" if moved_right else "failed"
	print("click movement check ready: status=%s start_x=%.2f end_x=%.2f target_x=%.2f path_len=%d click_input=true" % [
		status,
		start_position.x,
		end_position.x,
		target.x,
		current_path_cells.size(),
	])
	get_tree().quit(0 if moved_right else 1)


func _run_auto_mouse_click_check() -> void:
	var start_position := player.global_position
	var target := IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data) + Vector2i(2, -2))
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = _world_to_screen(target)
	_input(event)
	for _step in range(18):
		await get_tree().physics_frame
	var end_position := player.global_position
	var moved_right := end_position.x > start_position.x
	var status := "ok" if moved_right else "failed"
	print("mouse click check ready: status=%s start_x=%.2f end_x=%.2f target_x=%.2f path_len=%d marker=%s" % [
		status,
		start_position.x,
		end_position.x,
		target.x,
		current_path_cells.size(),
		str(has_target_marker),
	])
	get_tree().quit(0 if moved_right else 1)


func _run_auto_pathfinding_check() -> void:
	var start_cell := IsoMapModel.spawn_cell(map_data)
	var clicked_blocked_cell := Vector2i(8, 4)
	var goal_cell := IsoMapModel.nearest_walkable_cell(map_data, clicked_blocked_cell)
	var path_cells: Array[Vector2i] = IsoMapModel.find_path(map_data, start_cell, goal_cell)
	var avoids_blocked := not path_cells.is_empty()
	for cell in path_cells:
		if not IsoMapModel.is_walkable(map_data, cell):
			avoids_blocked = false
	var reaches_goal := not path_cells.is_empty() and path_cells[path_cells.size() - 1] == goal_cell
	var status := "ok" if avoids_blocked and reaches_goal and path_cells.size() > 1 else "failed"
	print("pathfinding check ready: status=%s start=%s clicked=%s goal=%s path_len=%d avoids_blocked=%s" % [
		status,
		str(start_cell),
		str(clicked_blocked_cell),
		str(goal_cell),
		path_cells.size(),
		str(avoids_blocked),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_camera_check() -> void:
	var left_cell := Vector2i(0, 33)
	var right_cell := Vector2i(35, 0)
	var top_cell := Vector2i(0, 0)
	var bottom_cell := Vector2i(35, 33)

	player.global_position = IsoMapModel.grid_to_world(map_data, left_cell)
	_update_camera_position(true)
	var left_camera := game_camera.global_position
	player.global_position = IsoMapModel.grid_to_world(map_data, right_cell)
	_update_camera_position(true)
	var right_camera := game_camera.global_position

	player.global_position = IsoMapModel.grid_to_world(map_data, top_cell)
	_update_camera_position(true)
	var top_camera := game_camera.global_position
	player.global_position = IsoMapModel.grid_to_world(map_data, bottom_cell)
	_update_camera_position(true)
	var bottom_camera := game_camera.global_position

	var moved_horizontal := absf(right_camera.x - left_camera.x) > 240.0
	var moved_vertical := absf(bottom_camera.y - top_camera.y) > 160.0
	var inside_limits := _camera_center_is_inside_limits(right_camera) and _camera_center_is_inside_limits(bottom_camera)
	var player_on_map := IsoMapModel.is_inside(map_data, IsoMapModel.world_to_grid(map_data, player.global_position))
	var status := "ok" if moved_horizontal and moved_vertical and inside_limits and player_on_map else "failed"
	print("camera check ready: status=%s left_camera=%s right_camera=%s top_camera=%s bottom_camera=%s moved_horizontal=%s moved_vertical=%s inside_limits=%s player_on_map=%s" % [
		status,
		str(left_camera),
		str(right_camera),
		str(top_camera),
		str(bottom_camera),
		str(moved_horizontal),
		str(moved_vertical),
		str(inside_limits),
		str(player_on_map),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_camera_click_check() -> void:
	var camera_anchor_cell := Vector2i(30, 28)
	var expected_cell := Vector2i(27, 26)
	player.global_position = IsoMapModel.grid_to_world(map_data, camera_anchor_cell)
	_update_camera_position(true)
	var world_point := IsoMapModel.grid_to_world(map_data, expected_cell)
	var screen_point := _world_to_screen(world_point)
	_set_click_move_target(screen_point)
	var screen_center := get_viewport_rect().size * 0.5
	var center_world := _screen_to_world(screen_center)
	var displayed_center := game_camera.get_screen_center_position()
	var matched_cell := has_target_cell and target_cell == expected_cell
	var matched_world := target_marker.distance_to(world_point) <= 0.1
	var center_matches_camera := center_world.distance_to(displayed_center) <= 0.1
	var screen_inside := Rect2(Vector2.ZERO, get_viewport_rect().size).has_point(screen_point)
	var status := "ok" if matched_cell and matched_world and center_matches_camera and screen_inside else "failed"
	print("camera click check ready: status=%s camera_target=%s displayed_center=%s center_world=%s screen=%s expected_cell=%s target_cell=%s matched_world=%s center_matches_camera=%s screen_inside=%s" % [
		status,
		str(game_camera.global_position),
		str(displayed_center),
		str(center_world),
		str(screen_point),
		str(expected_cell),
		str(target_cell),
		str(matched_world),
		str(center_matches_camera),
		str(screen_inside),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_animation_state_check() -> void:
	var initial_idle: bool = player.get_animation_state() == "idle"
	var initial_clip: String = player.get_animation_clip_key()
	var target := IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data) + Vector2i(2, -2))
	_set_click_move_target(_world_to_screen(target))
	for _step in range(8):
		await get_tree().physics_frame
	var switched_to_walk: bool = player.get_animation_state() == "walk"
	var walk_clip: String = player.get_animation_clip_key()
	var guard := 0
	while player.is_auto_moving() and guard < 100:
		guard += 1
		await get_tree().physics_frame
	await get_tree().process_frame
	var returned_to_idle: bool = player.get_animation_state() == "idle"
	var final_clip: String = player.get_animation_clip_key()
	var clip_keys_ok := initial_clip == "idle_south" and walk_clip == "walk_east" and final_clip == "idle_east"
	var status := "ok" if initial_idle and switched_to_walk and returned_to_idle and clip_keys_ok else "failed"
	print("animation state check ready: status=%s initial_idle=%s switched_to_walk=%s returned_to_idle=%s initial_clip=%s walk_clip=%s final_clip=%s" % [
		status,
		str(initial_idle),
		str(switched_to_walk),
		str(returned_to_idle),
		initial_clip,
		walk_clip,
		final_clip,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_follow_check() -> void:
	var hidden_by_default: bool = not pet_follow_enabled and not pet.visible
	_set_pet_follow_enabled(true)
	var visible_after_ring: bool = pet_follow_enabled and pet.visible
	var start_pet_position: Vector2 = pet.global_position
	var target := IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data) + Vector2i(5, -5))
	_set_click_move_target(_world_to_screen(target))
	for _step in range(50):
		await get_tree().physics_frame
	var pet_moved: bool = pet.global_position.distance_to(start_pet_position) > 12.0
	var pet_walking: bool = pet.get_animation_state() == "walk"
	var pet_clip: String = pet.get_animation_clip_key()
	var follows_player: bool = pet.global_position.distance_to(player.global_position) < 260.0
	var pet_clip_ok := pet_clip.begins_with("walk_")
	var status := "ok" if hidden_by_default and visible_after_ring and pet_moved and pet_walking and pet_clip_ok and follows_player else "failed"
	print("pet follow check ready: status=%s hidden_by_default=%s visible_after_ring=%s pet_moved=%s pet_walking=%s pet_clip=%s follows_player=%s" % [
		status,
		str(hidden_by_default),
		str(visible_after_ring),
		str(pet_moved),
		str(pet_walking),
		pet_clip,
		str(follows_player),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_npc_interaction_check() -> void:
	var trainer := InteractionModel.find_by_id(map_data, "trainer")
	var trainer_found := not trainer.is_empty()
	var clicked_trainer := false
	if trainer_found:
		_set_click_move_target(_world_to_screen(InteractionModel.marker_world_position(map_data, trainer)))
		clicked_trainer = has_pending_interaction and str(pending_interaction.get("id", "")) == "trainer"
	var guard := 0
	while guard < 260 and not _dialog_is_open():
		guard += 1
		await get_tree().physics_frame
	var dialog_opened := _dialog_is_open() and str(active_dialog_interaction.get("id", "")) == "trainer"
	var task_was_incomplete := trainer_found and not _is_task_completed(trainer)
	_confirm_dialog_action()
	await get_tree().process_frame
	var task_complete := trainer_found and _is_task_completed(trainer)
	var player_close := false
	if trainer_found:
		var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
		var trainer_cell := InteractionModel.cell_for(trainer)
		player_close = maxi(absi(player_cell.x - trainer_cell.x), absi(player_cell.y - trainer_cell.y)) <= 2
	var trainer_blocks := trainer_found and InteractionModel.blocks_movement(trainer)
	var not_on_trainer := true
	if trainer_found:
		not_on_trainer = IsoMapModel.world_to_grid(map_data, player.global_position) != InteractionModel.cell_for(trainer)
	var status := "ok" if trainer_found and clicked_trainer and dialog_opened and task_was_incomplete and task_complete and player_close and trainer_blocks and not_on_trainer else "failed"
	print("npc interaction check ready: status=%s trainer_found=%s clicked_trainer=%s dialog_opened=%s task_complete=%s player_close=%s trainer_blocks=%s not_on_trainer=%s" % [
		status,
		str(trainer_found),
		str(clicked_trainer),
		str(dialog_opened),
		str(task_complete),
		str(player_close),
		str(trainer_blocks),
		str(not_on_trainer),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_npc_collision_check() -> void:
	var overlap_item := InteractionModel.find_by_id(map_data, "overlap_tester")
	var block_item := InteractionModel.find_by_id(map_data, "block_tester")
	var overlap_found := not overlap_item.is_empty()
	var block_found := not block_item.is_empty()
	var overlap_cell := InteractionModel.cell_for(overlap_item) if overlap_found else Vector2i.ZERO
	var block_cell := InteractionModel.cell_for(block_item) if block_found else Vector2i.ZERO
	var overlap_is_default := overlap_found and not overlap_item.has("movementCollision")
	var overlap_walkable := overlap_found and not InteractionModel.blocks_movement(overlap_item) and IsoMapModel.is_walkable(map_data, overlap_cell)
	var block_unwalkable := block_found and InteractionModel.blocks_movement(block_item) and not IsoMapModel.is_walkable(map_data, block_cell)

	player.global_position = IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data))
	_update_camera_position(true)
	if overlap_found:
		_set_click_move_target(_world_to_screen(InteractionModel.marker_world_position(map_data, overlap_item)))
	var overlap_guard := 0
	while overlap_guard < 120 and not _dialog_is_open():
		overlap_guard += 1
		await get_tree().physics_frame
	var overlap_dialog := _dialog_is_open() and str(active_dialog_interaction.get("id", "")) == "overlap_tester"
	var player_on_overlap := IsoMapModel.world_to_grid(map_data, player.global_position) == overlap_cell
	_close_dialog()

	if block_found:
		_set_click_move_target(_world_to_screen(InteractionModel.marker_world_position(map_data, block_item)))
	var block_guard := 0
	while block_guard < 160 and not _dialog_is_open():
		block_guard += 1
		await get_tree().physics_frame
	var block_dialog := _dialog_is_open() and str(active_dialog_interaction.get("id", "")) == "block_tester"
	var player_cell_after_block := IsoMapModel.world_to_grid(map_data, player.global_position)
	var player_not_on_block := player_cell_after_block != block_cell
	var player_next_to_block := maxi(absi(player_cell_after_block.x - block_cell.x), absi(player_cell_after_block.y - block_cell.y)) <= 1
	var status := "ok" if overlap_is_default and overlap_walkable and block_unwalkable and overlap_dialog and player_on_overlap and block_dialog and player_not_on_block and player_next_to_block else "failed"
	print("npc collision check ready: status=%s overlap_found=%s block_found=%s overlap_default=%s overlap_walkable=%s player_on_overlap=%s block_unwalkable=%s player_not_on_block=%s player_next_to_block=%s overlap_cell=%s block_cell=%s final_cell=%s" % [
		status,
		str(overlap_found),
		str(block_found),
		str(overlap_is_default),
		str(overlap_walkable),
		str(player_on_overlap),
		str(block_unwalkable),
		str(player_not_on_block),
		str(player_next_to_block),
		str(overlap_cell),
		str(block_cell),
		str(player_cell_after_block),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_map_transfer_check() -> void:
	var start_ok := current_map_id == "firebud_training_yard"
	var outbound_warp := InteractionModel.find_by_id(map_data, "warp_to_village_gate")
	var outbound_found := not outbound_warp.is_empty()
	var outbound_overlap := outbound_found and not InteractionModel.blocks_movement(outbound_warp)
	if outbound_found:
		_set_click_move_target(_world_to_screen(InteractionModel.marker_world_position(map_data, outbound_warp)))
	var outbound_guard := 0
	while outbound_guard < 320 and current_map_id != "firebud_village_gate":
		outbound_guard += 1
		await get_tree().physics_frame
	var arrived_village := current_map_id == "firebud_village_gate"
	var village_spawn_ok := false
	if arrived_village:
		village_spawn_ok = IsoMapModel.world_to_grid(map_data, player.global_position) == IsoMapModel.spawn_cell(map_data, "from_training_yard")

	var return_warp := InteractionModel.find_by_id(map_data, "warp_to_training_yard")
	var return_found := arrived_village and not return_warp.is_empty()
	var return_overlap := return_found and not InteractionModel.blocks_movement(return_warp)
	if return_found:
		_set_click_move_target(_world_to_screen(InteractionModel.marker_world_position(map_data, return_warp)))
	var return_guard := 0
	while return_guard < 220 and current_map_id != "firebud_training_yard":
		return_guard += 1
		await get_tree().physics_frame
	var returned_training := current_map_id == "firebud_training_yard"
	var return_spawn_ok := false
	if returned_training:
		return_spawn_ok = IsoMapModel.world_to_grid(map_data, player.global_position) == IsoMapModel.spawn_cell(map_data, "from_village_gate")
	var status := "ok" if start_ok and outbound_found and outbound_overlap and arrived_village and village_spawn_ok and return_found and return_overlap and returned_training and return_spawn_ok else "failed"
	print("map transfer check ready: status=%s start_ok=%s outbound_found=%s outbound_overlap=%s arrived_village=%s village_spawn_ok=%s return_found=%s return_overlap=%s returned_training=%s return_spawn_ok=%s final_map=%s final_cell=%s" % [
		status,
		str(start_ok),
		str(outbound_found),
		str(outbound_overlap),
		str(arrived_village),
		str(village_spawn_ok),
		str(return_found),
		str(return_overlap),
		str(returned_training),
		str(return_spawn_ok),
		current_map_id,
		str(IsoMapModel.world_to_grid(map_data, player.global_position)),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_encounter_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	var zone: Dictionary = zones[0] as Dictionary if zone_found else {}
	var target_cell := EncounterModel.first_walkable_cell(map_data, zone) if zone_found else Vector2i.ZERO
	var target_in_zone: bool = zone_found and EncounterModel.zone_contains_cell(zone, target_cell)
	if zone_found:
		player.global_position = IsoMapModel.grid_to_world(map_data, Vector2i(8, 15))
		last_checked_player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
		_update_camera_position(true)
		_set_click_move_target(_world_to_screen(IsoMapModel.grid_to_world(map_data, target_cell)))
	var guard := 0
	while guard < 160 and player.is_auto_moving():
		guard += 1
		await get_tree().physics_frame
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var arrived_zone: bool = zone_found and EncounterModel.zone_contains_cell(zone, player_cell)
	if arrived_zone and not encounter_active:
		_trigger_encounter(zone)
	await get_tree().process_frame
	var prompt_open: bool = encounter_active and encounter_panel.visible and str(active_encounter_zone.get("id", "")) == str(zone.get("id", ""))
	var movement_stopped: bool = not player.is_auto_moving()
	_start_battle_from_encounter()
	await get_tree().process_frame
	var battle_started: bool = battle_active and battle_command_panel.visible and not encounter_panel.visible
	_end_battle(true)
	await get_tree().process_frame
	var closed: bool = not encounter_active and not encounter_panel.visible and not battle_active
	var status := "ok" if loaded and zone_found and target_in_zone and arrived_zone and prompt_open and movement_stopped and battle_started and closed else "failed"
	print("encounter check ready: status=%s loaded=%s zone_found=%s target_in_zone=%s arrived_zone=%s prompt_open=%s movement_stopped=%s battle_started=%s closed=%s zone_id=%s final_cell=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(target_in_zone),
		str(arrived_zone),
		str(prompt_open),
		str(movement_stopped),
		str(battle_started),
		str(closed),
		str(zone.get("id", "")),
		str(player_cell),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	var zone: Dictionary = zones[0] as Dictionary if zone_found else {}
	if zone_found:
		_trigger_encounter(zone)
	await get_tree().process_frame
	var prompt_open: bool = encounter_active and encounter_panel.visible
	_start_battle_from_encounter()
	await get_tree().process_frame
	var battle_started: bool = battle_active and battle_command_panel.visible and not encounter_panel.visible
	var buttons_ok := _battle_buttons_match_request()
	var command_top_right := _battle_command_panel_is_top_right()
	var formation_ok := _battle_formation_matches_reference()
	var enemy_id := BattleModel.living_enemy_id(battle_state)
	var enemy_before := int(BattleModel.actor_by_id(battle_state, enemy_id).get("hp", 0)) if enemy_id != "" else 0
	var ally_hp_before := _battle_side_total_hp(BattleModel.SIDE_ALLY)
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(enemy_id)
	_auto_submit_pet_attack_if_needed()
	await get_tree().process_frame
	var enemy_after := int(BattleModel.actor_by_id(battle_state, enemy_id).get("hp", 0)) if enemy_id != "" else 0
	var attack_reduced_hp := enemy_before > 0 and enemy_after < enemy_before
	var attack_state_seen := battle_action_timer > 0.0
	var player_state := str(BattleModel.actor_by_id(battle_state, "ally_player").get("actionState", ""))
	var player_attacked := player_state == "attack" or player_state == "combo"
	for _frame in range(480):
		await get_tree().process_frame
		if battle_active and not _battle_commands_locked():
			break
	var ally_hp_after := _battle_side_total_hp(BattleModel.SIDE_ALLY)
	var enemy_countered := ally_hp_after < ally_hp_before
	_on_battle_command_pressed("run")
	await get_tree().process_frame
	var escaped := not battle_active and player.visible and not battle_command_panel.visible
	if zone_found:
		_trigger_encounter(zone)
	await get_tree().process_frame
	_start_battle_from_encounter()
	await get_tree().process_frame
	var victory_target_id := BattleModel.living_enemy_id(battle_state)
	if victory_target_id != "":
		battle_state = BattleModel.set_actor_hp(battle_state, victory_target_id, 18)
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(victory_target_id)
	_auto_submit_pet_attack_if_needed()
	for _frame in range(260):
		await get_tree().process_frame
		if not battle_active:
			break
	var victory_exited := not battle_active and player.visible and not battle_command_panel.visible
	var status := "ok" if loaded and zone_found and prompt_open and battle_started and buttons_ok and command_top_right and formation_ok and attack_reduced_hp and attack_state_seen and player_attacked and enemy_countered and escaped and victory_exited else "failed"
	print("battle check ready: status=%s loaded=%s zone_found=%s prompt_open=%s battle_started=%s buttons_ok=%s command_top_right=%s formation_ok=%s enemy_before=%d enemy_after=%d ally_hp_before=%d ally_hp_after=%d attack_state_seen=%s player_attacked=%s enemy_countered=%s escaped=%s victory_exited=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(prompt_open),
		str(battle_started),
		str(buttons_ok),
		str(command_top_right),
		str(formation_ok),
		enemy_before,
		enemy_after,
		ally_hp_before,
		ally_hp_after,
		str(attack_state_seen),
		str(player_attacked),
		str(enemy_countered),
		str(escaped),
		str(victory_exited),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_formation_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var full_formation := battle_active and BattleModel.fills_full_formation(battle_state)
	var slots_unique := BattleModel.occupied_slots_are_unique(battle_state)
	var layout_ok := _battle_full_formation_screen_layout_ok()
	var command_top_right := _battle_command_panel_is_top_right()
	var status := "ok" if loaded and zone_found and full_formation and slots_unique and layout_ok and command_top_right else "failed"
	print("battle formation check ready: status=%s loaded=%s zone_found=%s full_formation=%s slots_unique=%s layout_ok=%s command_top_right=%s actors=%d" % [
		status,
		str(loaded),
		str(zone_found),
		str(full_formation),
		str(slots_unique),
		str(layout_ok),
		str(command_top_right),
		battle_state.get("actors", []).size(),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_target_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := "enemy_front_5"
	var target_actor := BattleModel.actor_by_id(battle_state, target_id)
	var target_screen := _world_to_screen(_battle_slot_world_position(str(target_actor.get("slotId", "")))) if not target_actor.is_empty() else Vector2.ZERO
	var initially_unselected := battle_selected_target_id == "" and battle_hover_target_id == ""
	_on_battle_command_pressed("attack")
	_update_battle_hover_at_screen_point(target_screen)
	var hover_ok := battle_hover_target_id == target_id
	var selected_by_tap := _select_battle_target_at_screen_point(target_screen)
	var selection_ok := str(battle_pending_player_command.get("targetId", "")) == target_id
	var target_before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	var first_id := "enemy_back_1"
	var first_before := int(BattleModel.actor_by_id(battle_state, first_id).get("hp", 0))
	_auto_submit_pet_attack_if_needed()
	var guard := 0
	var target_after := target_before
	while guard < 300 and battle_active:
		guard += 1
		await get_tree().process_frame
		target_after = int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
		if target_after < target_before:
			break
	var first_after := int(BattleModel.actor_by_id(battle_state, first_id).get("hp", 0))
	var selected_damaged := target_before > 0 and target_after < target_before
	var first_unchanged := first_after == first_before
	var status := "ok" if loaded and zone_found and initially_unselected and hover_ok and selected_by_tap and selection_ok and selected_damaged and first_unchanged else "failed"
	print("battle target check ready: status=%s loaded=%s zone_found=%s initially_unselected=%s hover_ok=%s selected_by_tap=%s selection_ok=%s selected=%s target_before=%d target_after=%d first_before=%d first_after=%d" % [
		status,
		str(loaded),
		str(zone_found),
		str(initially_unselected),
		str(hover_ok),
		str(selected_by_tap),
		str(selection_ok),
		str(battle_pending_player_command.get("targetId", "")),
		target_before,
		target_after,
		first_before,
		first_after,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_round_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := "enemy_front_5"
	var target_actor := BattleModel.actor_by_id(battle_state, target_id)
	var target_screen := _world_to_screen(_battle_slot_world_position(str(target_actor.get("slotId", "")))) if not target_actor.is_empty() else Vector2.ZERO
	_on_battle_command_pressed("attack")
	_update_battle_hover_at_screen_point(target_screen)
	var selected_by_tap := _select_battle_target_at_screen_point(target_screen)
	var target_before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	var enemy_count_before := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ENEMY)
	var ally_hp_before := _battle_side_total_hp(BattleModel.SIDE_ALLY)
	_auto_submit_pet_attack_if_needed()
	await get_tree().process_frame
	var locked_after_attack := _battle_commands_locked()
	var guard := 0
	while guard < 2400 and battle_active and _battle_commands_locked():
		guard += 1
		await get_tree().process_frame
	var target_after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	var enemy_count_after := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ENEMY)
	var ally_hp_after := _battle_side_total_hp(BattleModel.SIDE_ALLY)
	var returned_to_command := battle_active and not _battle_commands_locked()
	var target_was_hit := target_before > 0 and target_after < target_before
	var enemy_removed_or_damaged := target_was_hit or enemy_count_after < enemy_count_before
	var ally_was_hit := ally_hp_after < ally_hp_before
	var enemy_target_spread := _unique_string_count(battle_last_round_enemy_target_ids) > 1
	var enough_events := battle_last_round_applied_events >= 12
	var status := "ok" if loaded and zone_found and selected_by_tap and locked_after_attack and returned_to_command and enemy_removed_or_damaged and ally_was_hit and enemy_target_spread and enough_events else "failed"
	print("battle round check ready: status=%s loaded=%s zone_found=%s selected_by_tap=%s locked_after_attack=%s returned_to_command=%s target_before=%d target_after=%d enemy_count_before=%d enemy_count_after=%d ally_hp_before=%d ally_hp_after=%d enemy_target_spread=%s applied_events=%d" % [
		status,
		str(loaded),
		str(zone_found),
		str(selected_by_tap),
		str(locked_after_attack),
		str(returned_to_command),
		target_before,
		target_after,
		enemy_count_before,
		enemy_count_after,
		ally_hp_before,
		ally_hp_after,
		str(enemy_target_spread),
		battle_last_round_applied_events,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_speed_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var events := BattleModel.build_command_round_events(battle_state, "attack", "enemy_front_5")
	var sorted := not events.is_empty()
	var saw_ally := false
	var saw_enemy := false
	var mixed_opening := false
	var previous_speed := 100000
	var order: Array[String] = []
	var enemy_target_ids: Array[String] = []
	for event in events:
		var speed := int(event.get("speed", 0))
		if speed > previous_speed:
			sorted = false
		previous_speed = speed
		var actor_id := str(event.get("attackerId", ""))
		var actor := BattleModel.actor_by_id(battle_state, actor_id)
		var side := str(actor.get("side", ""))
		order.append("%s:%d" % [actor_id, speed])
		if side == BattleModel.SIDE_ALLY:
			saw_ally = true
			if saw_enemy:
				mixed_opening = true
		elif side == BattleModel.SIDE_ENEMY:
			saw_enemy = true
			enemy_target_ids.append(str(event.get("targetId", "")))
			if saw_ally:
				mixed_opening = true
	var enemy_targets_spread := _unique_string_count(enemy_target_ids) > 1
	var status := "ok" if loaded and zone_found and sorted and saw_ally and saw_enemy and mixed_opening and enemy_targets_spread else "failed"
	print("battle speed check ready: status=%s loaded=%s zone_found=%s sorted=%s saw_ally=%s saw_enemy=%s mixed=%s enemy_targets_spread=%s order=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(sorted),
		str(saw_ally),
		str(saw_enemy),
		str(mixed_opening),
		str(enemy_targets_spread),
		",".join(order),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_feedback_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	_auto_submit_pet_attack_if_needed()
	await get_tree().process_frame
	var popup_created := battle_float_texts.size() > 0
	var damage_recorded := battle_last_event_damage > 0
	var feedback_type_ok := battle_last_event_type == "attack" or battle_last_event_type == "combo_attack"
	var target_state := str(BattleModel.actor_by_id(battle_state, battle_last_event_target_id).get("actionState", ""))
	var target_reacted := target_state == "hit" or target_state == "down"
	var status := "ok" if loaded and zone_found and popup_created and damage_recorded and feedback_type_ok and target_reacted else "failed"
	print("battle feedback check ready: status=%s popup=%s damage=%d event=%s target=%s target_state=%s" % [
		status,
		str(popup_created),
		battle_last_event_damage,
		battle_last_event_type,
		battle_last_event_target_id,
		target_state,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_combo_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	var target_before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	_auto_submit_pet_attack_if_needed()
	await get_tree().process_frame
	var target_after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	var participants_ok := battle_last_round_actor_order.has("ally_player") and battle_last_round_actor_order.has("ally_pet")
	var combo_ok := battle_last_event_type == "combo_attack"
	var damage_ok := target_after < target_before and battle_last_event_damage >= 36
	var status := "ok" if loaded and zone_found and combo_ok and participants_ok and damage_ok else "failed"
	print("battle combo check ready: status=%s event=%s participants=%s target_before=%d target_after=%d damage=%d" % [
		status,
		battle_last_event_type,
		",".join(battle_last_round_actor_order),
		target_before,
		target_after,
		battle_last_event_damage,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_capture_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	if target_id != "":
		battle_state = BattleModel.set_actor_hp(battle_state, target_id, 12)
	_on_battle_command_pressed("capture")
	_auto_click_enemy_target(target_id)
	_auto_submit_pet_defend_if_needed()
	await get_tree().process_frame
	var capture_event_seen := battle_last_event_type == "capture"
	var capture_event_type := battle_last_event_type
	var capture_success := bool(battle_state.get("lastCaptureSuccess", false))
	var popup_created := battle_float_texts.size() > 0
	var guard := 0
	while guard < 220 and battle_active:
		guard += 1
		await get_tree().process_frame
	var returned_to_map := not battle_active and player.visible and not battle_command_panel.visible
	var status := "ok" if loaded and zone_found and capture_event_seen and capture_success and popup_created and returned_to_map else "failed"
	print("battle capture check ready: status=%s event=%s success=%s popup=%s returned_to_map=%s" % [
		status,
		capture_event_type,
		str(capture_success),
		str(popup_created),
		str(returned_to_map),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_spirit_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_stat_formula_test_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_ally_id := "ally_speed_normal"
	battle_state = BattleModel.set_actor_hp(battle_state, target_ally_id, 110)
	var ally_before := int(BattleModel.actor_by_id(battle_state, target_ally_id).get("hp", 0))
	_on_battle_command_pressed("spirit")
	var spirit_menu_open := battle_command_owner == "spirit"
	_on_battle_command_pressed("spirit")
	var selecting_ally := battle_target_mode == "ally_spirit_single"
	var ally_actor := BattleModel.actor_by_id(battle_state, target_ally_id)
	var ally_screen := _world_to_screen(_battle_slot_world_position(str(ally_actor.get("slotId", "")))) if not ally_actor.is_empty() else Vector2.ZERO
	var selected_by_tap := _select_battle_target_at_screen_point(ally_screen)
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_heal: bool = await _auto_wait_for_event_type("spirit_heal", 900)
	var ally_after := int(BattleModel.actor_by_id(battle_state, target_ally_id).get("hp", 0))
	var event_ok := saw_heal and battle_last_event_type == "spirit_heal"
	var heal_ok := ally_after > ally_before and battle_last_event_heal > 0
	var status := "ok" if loaded and zone_found and spirit_menu_open and selecting_ally and selected_by_tap and pet_panel_open and event_ok and heal_ok else "failed"
	print("battle spirit check ready: status=%s menu=%s selecting_ally=%s selected_by_tap=%s pet_panel=%s event=%s heal=%d ally_before=%d ally_after=%d" % [
		status,
		str(spirit_menu_open),
		str(selecting_ally),
		str(selected_by_tap),
		str(pet_panel_open),
		battle_last_event_type,
		battle_last_event_heal,
		ally_before,
		ally_after,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_action_catalog_check() -> void:
	var errors := BattleActionCatalog.validation_errors()
	var grace_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_GRACE_ALL)
	var moist_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_MOIST_SINGLE)
	var poison_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_POISON_SINGLE)
	var poison_all_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_POISON_ALL)
	var pet_skill_rule := BattleActionCatalog.target_rule_for(BattleModel.PET_SKILL_BUI_CHARGE)
	var item_heal_all_rule := BattleActionCatalog.target_rule_for(BattleModel.ITEM_HEAL_ALL)
	var item_heal_rule := BattleActionCatalog.target_rule_for(BattleModel.ITEM_HEAL_SINGLE)
	var item_poison_rule := BattleActionCatalog.target_rule_for(BattleModel.ITEM_POISON_SINGLE)
	var item_poison_all_rule := BattleActionCatalog.target_rule_for(BattleModel.ITEM_POISON_ALL)
	var spirit_rules_ok := bool(grace_rule.get("isAll", false)) and bool(grace_rule.get("canTargetAlly", false)) and not bool(grace_rule.get("canTargetEnemy", true))
	spirit_rules_ok = spirit_rules_ok and bool(moist_rule.get("requiresSelection", false)) and bool(moist_rule.get("canTargetAlly", false)) and not bool(moist_rule.get("canTargetEnemy", true))
	spirit_rules_ok = spirit_rules_ok and bool(poison_rule.get("requiresSelection", false)) and bool(poison_rule.get("canTargetEnemy", false)) and not bool(poison_rule.get("canTargetAlly", true))
	spirit_rules_ok = spirit_rules_ok and bool(poison_all_rule.get("isAll", false)) and bool(poison_all_rule.get("canTargetEnemy", false)) and not bool(poison_all_rule.get("canTargetAlly", true))
	var pet_rules_ok := bool(pet_skill_rule.get("requiresSelection", false)) and bool(pet_skill_rule.get("canTargetEnemy", false)) and not bool(pet_skill_rule.get("canTargetAlly", true))
	var item_rules_ok := bool(item_heal_all_rule.get("isAll", false)) and bool(item_heal_all_rule.get("canTargetAlly", false)) and not bool(item_heal_all_rule.get("canTargetEnemy", true))
	item_rules_ok = item_rules_ok and bool(item_heal_rule.get("requiresSelection", false)) and bool(item_heal_rule.get("canTargetAlly", false)) and not bool(item_heal_rule.get("canTargetEnemy", true))
	item_rules_ok = item_rules_ok and bool(item_poison_rule.get("requiresSelection", false)) and bool(item_poison_rule.get("canTargetEnemy", false)) and not bool(item_poison_rule.get("canTargetAlly", true))
	item_rules_ok = item_rules_ok and bool(item_poison_all_rule.get("isAll", false)) and bool(item_poison_all_rule.get("canTargetEnemy", false)) and not bool(item_poison_all_rule.get("canTargetAlly", true))
	var pet_slot_ok := str(BattleActionCatalog.pet_skill_action_for_slot(3).get("id", "")) == BattleModel.PET_SKILL_BUI_CHARGE
	var status := "ok" if errors.is_empty() and spirit_rules_ok and pet_rules_ok and item_rules_ok and pet_slot_ok else "failed"
	print("battle action catalog check ready: status=%s errors=%d spirit_rules=%s pet_rules=%s item_rules=%s pet_slot=%s" % [
		status,
		errors.size(),
		str(spirit_rules_ok),
		str(pet_rules_ok),
		str(item_rules_ok),
		str(pet_slot_ok),
	])
	if not errors.is_empty():
		print("battle action catalog errors: %s" % "; ".join(errors))
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_pet_command_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	var target_before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0)) if target_id != "" else 0
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	var pet_panel_open := battle_command_owner == "pet" and battle_command_title_label.text == "PET"
	var pet_labels_ok := false
	if battle_command_buttons.has("attack") and battle_command_buttons.has("capture"):
		var skill_one := battle_command_buttons["attack"] as Button
		var skill_three := battle_command_buttons["capture"] as Button
		pet_labels_ok = skill_one != null and skill_three != null and skill_one.text == "技1 攻击" and skill_three.text == "技3 布伊冲撞"
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	var pet_attack_seen: bool = await _auto_wait_for_actor_action("ally_pet", 1200)
	var target_after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0)) if target_id != "" else 0
	var status := "ok" if loaded and zone_found and pet_panel_open and pet_labels_ok and pet_attack_seen else "failed"
	print("battle pet command check ready: status=%s pet_panel=%s labels=%s pet_attack=%s target_before=%d target_after=%d" % [
		status,
		str(pet_panel_open),
		str(pet_labels_ok),
		str(pet_attack_seen),
		target_before,
		target_after,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_pet_target_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var initial_target_id := "enemy_front_5"
	var pet_skill_target_id := "enemy_back_1"
	var initial_actor := BattleModel.actor_by_id(battle_state, initial_target_id)
	var initial_screen := _world_to_screen(_battle_slot_world_position(str(initial_actor.get("slotId", "")))) if not initial_actor.is_empty() else Vector2.ZERO
	_on_battle_command_pressed("attack")
	_update_battle_hover_at_screen_point(initial_screen)
	var initial_selected := _select_battle_target_at_screen_point(initial_screen)
	var skill_target_before := int(BattleModel.actor_by_id(battle_state, pet_skill_target_id).get("hp", 0))
	var pet_panel_open := battle_command_owner == "pet"
	_on_battle_command_pressed("capture")
	var pet_target_mode := battle_target_mode == "pet_enemy_skill"
	var skill_actor := BattleModel.actor_by_id(battle_state, pet_skill_target_id)
	var skill_screen := _world_to_screen(_battle_slot_world_position(str(skill_actor.get("slotId", "")))) if not skill_actor.is_empty() else Vector2.ZERO
	_update_battle_hover_at_screen_point(skill_screen)
	var skill_selected := _select_battle_target_at_screen_point(skill_screen)
	var saw_skill: bool = await _auto_wait_for_event_type("skill_attack", 1200)
	var skill_target_after := int(BattleModel.actor_by_id(battle_state, pet_skill_target_id).get("hp", 0))
	var target_ok := battle_last_event_target_id == pet_skill_target_id
	var npc_ai_present := false
	for _frame in range(1800):
		await get_tree().process_frame
		npc_ai_present = battle_last_round_actor_order.has("ally_front_1") or battle_last_round_actor_order.has("ally_back_1")
		if battle_active and not _battle_commands_locked():
			break
	var status := "ok" if loaded and zone_found and initial_selected and pet_panel_open and pet_target_mode and skill_selected and saw_skill and target_ok and skill_target_after < skill_target_before and npc_ai_present else "failed"
	print("battle pet target check ready: status=%s initial_selected=%s pet_panel=%s target_mode=%s skill_selected=%s saw_skill=%s target_ok=%s before=%d after=%d npc_ai=%s" % [
		status,
		str(initial_selected),
		str(pet_panel_open),
		str(pet_target_mode),
		str(skill_selected),
		str(saw_skill),
		str(target_ok),
		skill_target_before,
		skill_target_after,
		str(npc_ai_present),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_switch_pet_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var party := BattleModel.player_pet_party(battle_state)
	var initial_active := BattleModel.active_pet_party_entry(battle_state)
	var initial_active_name := str(BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID).get("name", ""))
	_on_battle_command_pressed("switch_pet")
	var menu_open := battle_command_owner == "switch_pet"
	var active_button := battle_command_buttons["attack"] as Button
	var standby_button := battle_command_buttons["spirit"] as Button
	var rest_button := battle_command_buttons["help"] as Button
	var active_disabled := active_button != null and active_button.disabled
	var standby_enabled := standby_button != null and not standby_button.disabled
	var rest_disabled := rest_button != null and rest_button.disabled
	var standby_pet_id := str(battle_switch_pet_button_pet_ids.get("spirit", ""))
	_on_battle_command_pressed("spirit")
	var saw_switch: bool = await _auto_wait_for_event_type("switch_pet", 900)
	var active_actor := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID)
	var active_after := BattleModel.active_pet_party_entry(battle_state)
	var old_entry := BattleModel.pet_party_entry_by_id(battle_state, str(initial_active.get("petId", "")))
	var switched_name_ok := str(active_actor.get("name", "")) == "迅捷布伊" and str(active_after.get("petId", "")) == standby_pet_id
	var old_pet_standby := str(old_entry.get("state", "")) == BattleModel.PET_STATE_STANDBY and str(old_entry.get("name", "")) == initial_active_name
	var no_pet_command := not battle_last_round_actor_order.has(BattleModel.PLAYER_PET_ID)
	var status := "ok" if loaded and zone_found and party.size() >= 4 and menu_open and active_disabled and standby_enabled and rest_disabled and saw_switch and switched_name_ok and old_pet_standby and no_pet_command else "failed"
	print("battle switch pet check ready: status=%s menu=%s active_disabled=%s standby_enabled=%s rest_disabled=%s saw_switch=%s active_after=%s old_state=%s no_pet_command=%s" % [
		status,
		str(menu_open),
		str(active_disabled),
		str(standby_enabled),
		str(rest_disabled),
		str(saw_switch),
		str(active_actor.get("name", "")),
		str(old_entry.get("state", "")),
		str(no_pet_command),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_retarget_visual_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle retarget visual check ready: status=failed started=false")
		get_tree().quit(1)
		return
	var original_target_id := "enemy_front_3"
	var second_target_id := "enemy_back_1"
	battle_state = BattleModel.set_actor_hp(battle_state, original_target_id, 1)
	battle_state = BattleModel.set_actor_hp(battle_state, second_target_id, 1)
	battle_event_queue = [
		{
			"type": "attack",
			"attackerId": "ally_attack_high",
			"targetId": original_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"damage": 20,
			"speed": 90,
			"sequence": 0,
			"movementStyle": "melee",
			"canLaunch": false,
		},
		{
			"type": "attack",
			"attackerId": "ally_speed_normal",
			"targetId": original_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"damage": 10,
			"speed": 80,
			"sequence": 1,
			"movementStyle": "melee",
			"canLaunch": false,
		},
		{
			"type": "attack",
			"attackerId": "ally_speed_slow",
			"targetId": original_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"damage": 10,
			"speed": 70,
			"sequence": 2,
			"movementStyle": "melee",
			"canLaunch": false,
		},
	]
	battle_last_round_applied_events = 0
	battle_last_round_event_types.clear()
	battle_last_round_actor_order.clear()
	battle_last_round_speeds.clear()
	battle_last_round_enemy_target_ids.clear()
	battle_state["phase"] = "round_events"
	_play_next_battle_event()
	var first_actual := battle_last_event_target_id
	var first_display := str(battle_current_event.get("targetId", ""))
	battle_action_timer = 0.01
	_update_battle_animation(0.02)
	await get_tree().process_frame
	var second_actual := battle_last_event_target_id
	var second_display := str(battle_current_event.get("targetId", ""))
	battle_action_timer = 0.01
	_update_battle_animation(0.02)
	await get_tree().process_frame
	var third_actual := battle_last_event_target_id
	var third_display := str(battle_current_event.get("targetId", ""))
	var original_hp := int(BattleModel.actor_by_id(battle_state, original_target_id).get("hp", -1))
	var second_hp := int(BattleModel.actor_by_id(battle_state, second_target_id).get("hp", -1))
	var second_matches_actual := second_display == second_actual and second_actual == second_target_id
	var third_matches_actual := third_display == third_actual and third_actual != "" and third_actual != original_target_id and third_actual != second_target_id
	var status := "ok" if first_actual == original_target_id and first_display == original_target_id and original_hp <= 0 and second_hp <= 0 and second_matches_actual and third_matches_actual else "failed"
	print("battle retarget visual check ready: status=%s first_actual=%s first_display=%s second_actual=%s second_display=%s third_actual=%s third_display=%s original_hp=%d second_hp=%d" % [
		status,
		first_actual,
		first_display,
		second_actual,
		second_display,
		third_actual,
		third_display,
		original_hp,
		second_hp,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_visual_timing_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle visual timing check ready: status=failed started=false")
		get_tree().quit(1)
		return
	var target_id := "enemy_front_3"
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 40)
	battle_event_queue = [{
		"type": "attack",
		"attackerId": "ally_attack_high",
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 16,
		"speed": 90,
		"sequence": 0,
		"movementStyle": "melee",
		"canLaunch": false,
	}]
	battle_state["phase"] = "round_events"
	_play_next_battle_event()
	var actual_after_hit := BattleModel.actor_by_id(battle_state, target_id)
	var visual_before_hit := _battle_actor_for_visual_draw(actual_after_hit)
	var reveal_progress := _battle_event_result_reveal_progress(battle_current_event)
	battle_action_timer = battle_current_event_duration * maxf(0.0, 1.0 - reveal_progress - 0.03)
	var visual_after_hit := _battle_actor_for_visual_draw(actual_after_hit)
	var delayed_hp_ok := int(actual_after_hit.get("hp", 0)) == 24 and int(visual_before_hit.get("hp", 0)) == 40 and int(visual_after_hit.get("hp", 0)) == 24

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle visual timing check ready: status=failed restarted=false")
		get_tree().quit(1)
		return
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 18)
	var combo_event := {
		"type": "combo_attack",
		"attackerId": "ally_speed_fast",
		"participantIds": ["ally_speed_fast", "ally_attack_high"],
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 96,
		"speed": 120,
		"sequence": 0,
		"movementStyle": "melee_combo",
		"canLaunch": true,
		"launchMode": "straight",
	}
	battle_event_queue = [combo_event]
	battle_state["phase"] = "round_events"
	_play_next_battle_event()
	var combo_reveal := _battle_event_result_reveal_progress(battle_current_event)
	var waits_at_old_launch_time := _battle_launch_target_progress(BATTLE_LAUNCH_TARGET_START_RATIO + 0.03) <= 0.0
	var waits_before_combo_hit := _battle_launch_target_progress(maxf(0.0, combo_reveal - 0.02)) <= 0.0
	var flies_after_combo_hit := _battle_launch_target_progress(minf(0.98, combo_reveal + 0.08)) > 0.0
	var combo_target_after := BattleModel.actor_by_id(battle_state, target_id)
	var combo_visual_before_hit := _battle_actor_for_visual_draw(combo_target_after)
	var combo_launch_timing_ok := combo_reveal > BATTLE_LAUNCH_TARGET_START_RATIO and waits_at_old_launch_time and waits_before_combo_hit and flies_after_combo_hit and int(combo_visual_before_hit.get("hp", 0)) == 18

	var status := "ok" if delayed_hp_ok and combo_launch_timing_ok else "failed"
	print("battle visual timing check ready: status=%s delayed_hp=%s combo_launch=%s reveal=%.2f combo_reveal=%.2f waits_old=%s waits_before=%s flies_after=%s" % [
		status,
		str(delayed_hp_ok),
		str(combo_launch_timing_ok),
		reveal_progress,
		combo_reveal,
		str(waits_at_old_launch_time),
		str(waits_before_combo_hit),
		str(flies_after_combo_hit),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_spirit_four_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if not loaded or not zone_found:
		print("battle spirit four check ready: status=failed loaded=%s zone_found=%s" % [str(loaded), str(zone_found)])
		get_tree().quit(1)
		return
	var zone := zones[0] as Dictionary
	var grace_ok: bool = await _auto_check_grace_spirit(zone)
	var moist_ok: bool = await _auto_check_moist_spirit(zone)
	var poison_ok: bool = await _auto_check_poison_spirit(zone)
	var poison_all_ok: bool = await _auto_check_poison_all_spirit(zone)
	var status := "ok" if grace_ok and moist_ok and poison_ok and poison_all_ok else "failed"
	print("battle spirit four check ready: status=%s grace=%s moist=%s poison=%s poison_all=%s" % [
		status,
		str(grace_ok),
		str(moist_ok),
		str(poison_ok),
		str(poison_all_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_item_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if not loaded or not zone_found:
		print("battle item check ready: status=failed loaded=%s zone_found=%s" % [str(loaded), str(zone_found)])
		get_tree().quit(1)
		return
	var zone := zones[0] as Dictionary
	var heal_all_ok: bool = await _auto_check_item_heal_all(zone)
	var heal_single_ok: bool = await _auto_check_item_heal_single(zone)
	var poison_single_ok: bool = await _auto_check_item_poison_single(zone)
	var poison_all_ok: bool = await _auto_check_item_poison_all(zone)
	var status := "ok" if heal_all_ok and heal_single_ok and poison_single_ok and poison_all_ok else "failed"
	print("battle item check ready: status=%s heal_all=%s heal_single=%s poison_single=%s poison_all=%s" % [
		status,
		str(heal_all_ok),
		str(heal_single_ok),
		str(poison_single_ok),
		str(poison_all_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_item_count_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	_auto_injure_living_side(BattleModel.SIDE_ALLY, 36)
	var before_count := BattleModel.item_count(battle_state, BattleModel.ITEM_HEAL_ALL)
	_on_battle_command_pressed("item")
	var item_menu_open := battle_command_owner == "item"
	var label_ok := false
	if battle_command_buttons.has("attack"):
		var item_button := battle_command_buttons["attack"] as Button
		label_ok = item_button != null and item_button.text.find("x%d" % before_count) >= 0
	_on_battle_command_pressed("attack")
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("item_heal_all", 1200)
	var after_count := BattleModel.item_count(battle_state, BattleModel.ITEM_HEAL_ALL)
	var returned_to_command := false
	for _frame in range(1800):
		await get_tree().process_frame
		if battle_active and not _battle_commands_locked():
			returned_to_command = true
			break
	battle_state = BattleModel.set_item_count(battle_state, BattleModel.ITEM_HEAL_ALL, 0)
	_set_battle_command_owner("item")
	_sync_battle_buttons()
	var zero_disabled := false
	if battle_command_buttons.has("attack"):
		var zero_button := battle_command_buttons["attack"] as Button
		zero_disabled = zero_button != null and zero_button.disabled and zero_button.text.find("x0") >= 0
	var count_consumed := before_count == 2 and after_count == 1
	var status := "ok" if loaded and zone_found and item_menu_open and label_ok and saw_event and count_consumed and returned_to_command and zero_disabled else "failed"
	print("battle item count check ready: status=%s menu=%s label=%s event=%s before=%d after=%d returned=%s zero_disabled=%s" % [
		status,
		str(item_menu_open),
		str(label_ok),
		str(saw_event),
		before_count,
		after_count,
		str(returned_to_command),
		str(zero_disabled),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_stat_formula_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle stat formula check ready: status=failed started=false")
		get_tree().quit(1)
		return

	var fast_speed := BattleModel.action_speed_for(battle_state, "ally_speed_fast", "attack")
	var normal_speed := BattleModel.action_speed_for(battle_state, "ally_speed_normal", "attack")
	var slow_speed := BattleModel.action_speed_for(battle_state, "ally_speed_slow", "attack")
	var speed_order_ok := fast_speed > normal_speed and normal_speed > slow_speed
	var item_speed_ok := BattleModel.action_speed_for(battle_state, BattleModel.PLAYER_ACTOR_ID, "item") > BattleModel.action_speed_for(battle_state, BattleModel.PLAYER_ACTOR_ID, "attack")

	var high_attack_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_attack_high", "enemy_front_3")
	var normal_attack_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_speed_normal", "enemy_front_3")
	var attack_damage_ok := high_attack_damage > normal_attack_damage

	var low_def_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_speed_normal", "enemy_front_3")
	var high_def_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_speed_normal", "enemy_front_4")
	var defense_damage_ok := low_def_damage > high_def_damage

	var pet_attack_damage := BattleModel.attack_damage_preview_for(battle_state, BattleModel.PLAYER_PET_ID, "enemy_front_3")
	var pet_skill_damage := BattleModel.pet_skill_damage_preview_for(battle_state, BattleModel.PLAYER_PET_ID, "enemy_front_3")
	var pet_skill_ok := pet_skill_damage > pet_attack_damage

	var events := BattleModel.build_player_pet_round_events(
		battle_state,
		{"command": "attack", "targetId": "enemy_front_3", "allyTargetId": BattleModel.PLAYER_ACTOR_ID},
		{"command": "defend", "targetId": "enemy_front_3"}
	)
	var sorted := true
	var previous_speed := 100000
	var enemy_target_ids: Array[String] = []
	for event in events:
		var speed := int((event as Dictionary).get("speed", 0))
		if speed > previous_speed:
			sorted = false
		previous_speed = speed
		var attacker_id := str((event as Dictionary).get("attackerId", ""))
		var attacker := BattleModel.actor_by_id(battle_state, attacker_id)
		if str(attacker.get("side", "")) == BattleModel.SIDE_ENEMY:
			enemy_target_ids.append(str((event as Dictionary).get("targetId", "")))
	var enemy_targets_spread := _unique_string_count(enemy_target_ids) > 1

	_append_battle_trace({
		"kind": "formula_check",
		"battleId": str(battle_state.get("id", "")),
		"speedOrderOk": speed_order_ok,
		"fastSpeed": fast_speed,
		"normalSpeed": normal_speed,
		"slowSpeed": slow_speed,
		"itemSpeedOk": item_speed_ok,
		"attackDamageOk": attack_damage_ok,
		"highAttackDamage": high_attack_damage,
		"normalAttackDamage": normal_attack_damage,
		"defenseDamageOk": defense_damage_ok,
		"lowDefenseDamage": low_def_damage,
		"highDefenseDamage": high_def_damage,
		"petSkillOk": pet_skill_ok,
		"petAttackDamage": pet_attack_damage,
		"petSkillDamage": pet_skill_damage,
		"eventOrderSorted": sorted,
		"enemyTargetsSpread": enemy_targets_spread,
	})

	var status := "ok" if speed_order_ok and item_speed_ok and attack_damage_ok and defense_damage_ok and pet_skill_ok and sorted and enemy_targets_spread else "failed"
	print("battle stat formula check ready: status=%s speed_order=%s fast=%d normal=%d slow=%d item_speed=%s attack_damage=%s high_attack=%d normal_attack=%d defense_damage=%s low_def=%d high_def=%d pet_skill=%s pet_attack=%d pet_skill_damage=%d sorted=%s enemy_targets_spread=%s" % [
		status,
		str(speed_order_ok),
		fast_speed,
		normal_speed,
		slow_speed,
		str(item_speed_ok),
		str(attack_damage_ok),
		high_attack_damage,
		normal_attack_damage,
		str(defense_damage_ok),
		low_def_damage,
		high_def_damage,
		str(pet_skill_ok),
		pet_attack_damage,
		pet_skill_damage,
		str(sorted),
		str(enemy_targets_spread),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_defense_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle defense check ready: status=failed started=false")
		get_tree().quit(1)
		return
	var attacker_id := "enemy_back_1"
	var defender_id := BattleModel.PLAYER_ACTOR_ID
	battle_state["guardingActorIds"] = []
	var normal_damage := BattleModel.attack_damage_preview_for(battle_state, attacker_id, defender_id)
	var attacker_speed := BattleModel.action_speed_for(battle_state, attacker_id, "attack")
	var defender_speed := BattleModel.action_speed_for(battle_state, defender_id, "defend")
	var events := BattleModel.build_player_pet_round_events(
		battle_state,
		{"command": "defend", "targetId": "", "allyTargetId": defender_id},
		{"command": "defend", "targetId": ""}
	)
	var guard_active := BattleModel.is_actor_guarding(battle_state, defender_id)
	var guarded_damage := BattleModel.attack_damage_preview_for(battle_state, attacker_id, defender_id)
	var speed_gap_ok := attacker_speed > defender_speed
	var damage_reduced := guarded_damage < normal_damage
	var event_sorted := true
	var previous_speed := 100000
	for event_value in events:
		var event := event_value as Dictionary
		var speed := int(event.get("speed", 0))
		if speed > previous_speed:
			event_sorted = false
		previous_speed = speed
	var status := "ok" if guard_active and speed_gap_ok and damage_reduced and event_sorted else "failed"
	print("battle defense check ready: status=%s guard_active=%s attacker_speed=%d defender_speed=%d normal_damage=%d guarded_damage=%d event_sorted=%s" % [
		status,
		str(guard_active),
		attacker_speed,
		defender_speed,
		normal_damage,
		guarded_damage,
		str(event_sorted),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_launch_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle launch check ready: status=failed started=false")
		get_tree().quit(1)
		return
	var target_id := "enemy_front_3"
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 18)
	battle_state = BattleModel.apply_battle_event(battle_state, {
		"type": "attack",
		"attackerId": "ally_attack_high",
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 86,
		"speed": 90,
		"sequence": 0,
		"movementStyle": "melee",
		"canLaunch": true,
		"launchMode": "straight",
	})
	var straight_target := BattleModel.actor_by_id(battle_state, target_id)
	var straight_launch := bool(battle_state.get("lastLaunch", false)) and str(straight_target.get("actionState", "")) == "launched" and not bool(straight_target.get("revivable", true)) and str(battle_state.get("lastLaunchMode", "")) == "straight" and str(straight_target.get("petBattleState", "")) == "rest"

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 18)
	battle_state = BattleModel.apply_battle_event(battle_state, {
		"type": "attack",
		"attackerId": "ally_attack_high",
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 86,
		"speed": 90,
		"sequence": 0,
		"movementStyle": "melee",
		"canLaunch": true,
		"launchMode": "bounce",
	})
	var bounce_target := BattleModel.actor_by_id(battle_state, target_id)
	var bounce_launch := bool(battle_state.get("lastLaunch", false)) and str(bounce_target.get("actionState", "")) == "launched" and not bool(bounce_target.get("revivable", true)) and str(battle_state.get("lastLaunchMode", "")) == "bounce" and str(bounce_target.get("petBattleState", "")) == "rest"

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 18)
	battle_state = BattleModel.apply_battle_event(battle_state, {
		"type": "spirit_poison",
		"attackerId": BattleModel.PLAYER_ACTOR_ID,
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 86,
		"speed": 90,
		"sequence": 0,
		"skillName": "毒精灵5",
		"canLaunch": false,
	})
	var poison_target := BattleModel.actor_by_id(battle_state, target_id)
	var poison_no_launch := not bool(battle_state.get("lastLaunch", false)) and str(poison_target.get("actionState", "")) != "launched"
	var target_waits_for_hit := _battle_launch_target_progress(BATTLE_LAUNCH_TARGET_START_RATIO - 0.02) <= 0.0
	var target_moves_after_hit := _battle_launch_target_progress(BATTLE_LAUNCH_TARGET_START_RATIO + 0.08) > 0.05
	var attacker_reaches_contact := _battle_launch_attacker_lunge(BATTLE_LAUNCH_HIT_RATIO) >= 0.99
	var previous_launch_mode := battle_last_event_launch_mode
	battle_last_event_launch_mode = "bounce"
	var bounce_rotation_ok := absf(_battle_launch_rotation_for_progress(0.86)) > TAU * 1.8
	battle_last_event_launch_mode = previous_launch_mode
	var timeline_ok := target_waits_for_hit and target_moves_after_hit and attacker_reaches_contact and bounce_rotation_ok
	var status := "ok" if straight_launch and bounce_launch and poison_no_launch and timeline_ok else "failed"
	print("battle launch check ready: status=%s straight=%s bounce=%s poison_no_launch=%s timeline=%s straight_state=%s bounce_state=%s poison_state=%s" % [
		status,
		str(straight_launch),
		str(bounce_launch),
		str(poison_no_launch),
		str(timeline_ok),
		str(straight_target.get("actionState", "")),
		str(bounce_target.get("actionState", "")),
		str(poison_target.get("actionState", "")),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_melee_motion_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var attacker := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_ACTOR_ID)
	var target := BattleModel.actor_by_id(battle_state, "enemy_front_5")
	var visual_scale := _battle_actor_visual_scale()
	var attacker_pos := _battle_slot_world_position(str(attacker.get("slotId", ""))) if not attacker.is_empty() else Vector2.ZERO
	var target_pos := _battle_slot_world_position(str(target.get("slotId", ""))) if not target.is_empty() else Vector2.ZERO
	var contact_offset := _battle_melee_contact_offset(attacker_pos, target_pos, visual_scale)
	var peak_pos := attacker_pos + contact_offset
	var target_distance := peak_pos.distance_to(target_pos)
	var contact_ok := target_distance <= BATTLE_MELEE_CONTACT_DISTANCE * visual_scale + 2.0
	var front_spacing_ok := _battle_front_row_min_spacing(BattleModel.SIDE_ALLY) >= 76.0 and _battle_front_row_min_spacing(BattleModel.SIDE_ENEMY) >= 76.0
	var status := "ok" if loaded and zone_found and contact_ok and front_spacing_ok else "failed"
	print("battle melee motion check ready: status=%s contact_ok=%s distance=%.2f front_spacing=%s ally=%.2f enemy=%.2f" % [
		status,
		str(contact_ok),
		target_distance,
		str(front_spacing_ok),
		_battle_front_row_min_spacing(BattleModel.SIDE_ALLY),
		_battle_front_row_min_spacing(BattleModel.SIDE_ENEMY),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_combo_motion_check() -> void:
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	_prepare_combo_motion_preview_order()
	var target_id := "enemy_front_5"
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	await get_tree().process_frame
	var combo_event := _current_or_queued_combo_event()
	var participant_ids: Array = combo_event.get("participantIds", [])
	var combo_ok := str(combo_event.get("type", "")) == "combo_attack" and participant_ids.size() >= 2
	var duration := _battle_event_duration(combo_event)
	var overlap_elapsed := BATTLE_COMBO_STAGGER_SECONDS + BATTLE_COMBO_ACTION_SECONDS * BATTLE_COMBO_APPROACH_RATIO * 0.38
	var second_hit_elapsed := BATTLE_COMBO_STAGGER_SECONDS + BATTLE_COMBO_ACTION_SECONDS * BATTLE_COMBO_APPROACH_RATIO
	var first_overlap := _battle_combo_lunge_for_index(0, overlap_elapsed)
	var second_overlap := _battle_combo_lunge_for_index(1, overlap_elapsed)
	var first_at_second_hit := _battle_combo_lunge_for_index(0, second_hit_elapsed)
	var second_at_second_hit := _battle_combo_lunge_for_index(1, second_hit_elapsed)
	var overlap_ok := first_overlap > 0.55 and second_overlap > 0.06 and first_at_second_hit > 0.70 and second_at_second_hit > 0.92
	var duration_ok := duration >= BATTLE_COMBO_ACTION_SECONDS + BATTLE_COMBO_STAGGER_SECONDS
	var status := "ok" if loaded and zone_found and combo_ok and overlap_ok and duration_ok else "failed"
	print("battle combo motion check ready: status=%s combo=%s participants=%d duration=%.2f first_overlap=%.2f second_overlap=%.2f first_at_second_hit=%.2f second_at_second_hit=%.2f" % [
		status,
		str(combo_ok),
		participant_ids.size(),
		duration,
		first_overlap,
		second_overlap,
		first_at_second_hit,
		second_at_second_hit,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _current_or_queued_combo_event() -> Dictionary:
	if str(battle_current_event.get("type", "")) == "combo_attack":
		return battle_current_event
	for value in battle_event_queue:
		var event := value as Dictionary
		if str(event.get("type", "")) == "combo_attack":
			return event
	return {}


func _battle_front_row_min_spacing(side: String) -> float:
	var min_spacing := INF
	var previous := Vector2.ZERO
	var has_previous := false
	for slot in range(1, BattleModel.SLOTS_PER_ROW + 1):
		var pos := _world_to_screen(_battle_slot_world_position(BattleModel.slot_id(side, BattleModel.ROW_FRONT, slot)))
		if has_previous:
			min_spacing = minf(min_spacing, pos.distance_to(previous))
		previous = pos
		has_previous = true
	return min_spacing if min_spacing < INF else 0.0


func _auto_check_item_heal_all(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_formation_preview_battle(zone))
	await get_tree().process_frame
	_auto_injure_living_side(BattleModel.SIDE_ALLY, 36)
	_on_battle_command_pressed("item")
	var menu_open := battle_command_owner == "item"
	_on_battle_command_pressed("attack")
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("item_heal_all", 1200)
	var healed_count := 0
	for target_id in battle_last_event_target_ids:
		if int((battle_state.get("lastEffectPerTarget", {}) as Dictionary).get(target_id, 0)) > 0:
			healed_count += 1
	return menu_open and pet_panel_open and saw_event and battle_last_event_target_ids.size() >= 6 and healed_count >= 6


func _auto_check_item_heal_single(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_formation_preview_battle(zone))
	await get_tree().process_frame
	battle_state = BattleModel.set_actor_hp(battle_state, "ally_back_2", 58)
	var before := int(BattleModel.actor_by_id(battle_state, "ally_back_2").get("hp", 0))
	_on_battle_command_pressed("item")
	_on_battle_command_pressed("spirit")
	var mode_ok := battle_target_mode == "ally_item_single"
	var actor := BattleModel.actor_by_id(battle_state, "ally_back_2")
	var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(actor.get("slotId", "")))))
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("item_heal", 1200)
	var after := int(BattleModel.actor_by_id(battle_state, "ally_back_2").get("hp", 0))
	return mode_ok and selected and pet_panel_open and saw_event and battle_last_event_target_id == "ally_back_2" and after > before


func _auto_check_item_poison_single(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_formation_preview_battle(zone))
	await get_tree().process_frame
	var target_id := "enemy_back_2"
	var before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	_on_battle_command_pressed("item")
	_on_battle_command_pressed("capture")
	var mode_ok := battle_target_mode == "enemy_item_single"
	var actor := BattleModel.actor_by_id(battle_state, target_id)
	var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(actor.get("slotId", "")))))
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("item_poison", 1200)
	var after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	return mode_ok and selected and pet_panel_open and saw_event and battle_last_event_target_id == target_id and after < before


func _auto_check_item_poison_all(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_formation_preview_battle(zone))
	await get_tree().process_frame
	var before_count := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ENEMY)
	_on_battle_command_pressed("item")
	_on_battle_command_pressed("defend")
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("item_poison_all", 1200)
	var damaged_count := 0
	for target_id in battle_last_event_target_ids:
		if int((battle_state.get("lastEffectPerTarget", {}) as Dictionary).get(target_id, 0)) > 0:
			damaged_count += 1
	return pet_panel_open and saw_event and battle_last_event_target_ids.size() == before_count and damaged_count == before_count


func _auto_check_grace_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	_auto_injure_living_side(BattleModel.SIDE_ALLY, 44)
	_on_battle_command_pressed("spirit")
	var menu_open := battle_command_owner == "spirit"
	_on_battle_command_pressed("attack")
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_heal_all", 1200)
	var healed_count := 0
	for target_id in battle_last_event_target_ids:
		if int((battle_state.get("lastEffectPerTarget", {}) as Dictionary).get(target_id, 0)) > 0:
			healed_count += 1
	return menu_open and pet_panel_open and saw_event and battle_last_event_target_ids.size() >= 6 and healed_count >= 6


func _auto_check_moist_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	var target_ally_id := "ally_speed_normal"
	battle_state = BattleModel.set_actor_hp(battle_state, target_ally_id, 110)
	var before := int(BattleModel.actor_by_id(battle_state, target_ally_id).get("hp", 0))
	_on_battle_command_pressed("spirit")
	_on_battle_command_pressed("spirit")
	var mode_ok := battle_target_mode == "ally_spirit_single"
	var actor := BattleModel.actor_by_id(battle_state, target_ally_id)
	var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(actor.get("slotId", "")))))
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_heal", 1200)
	var after := int(BattleModel.actor_by_id(battle_state, target_ally_id).get("hp", 0))
	return mode_ok and selected and pet_panel_open and saw_event and battle_last_event_target_id == target_ally_id and after > before


func _auto_check_poison_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	var target_id := "enemy_back_2"
	var before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	_on_battle_command_pressed("spirit")
	_on_battle_command_pressed("capture")
	var mode_ok := battle_target_mode == "enemy_spirit_single"
	var actor := BattleModel.actor_by_id(battle_state, target_id)
	var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(actor.get("slotId", "")))))
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_poison", 1200)
	var after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	return mode_ok and selected and pet_panel_open and saw_event and battle_last_event_target_id == target_id and after < before


func _auto_check_poison_all_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	var before_count := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ENEMY)
	_on_battle_command_pressed("spirit")
	_on_battle_command_pressed("defend")
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_poison_all", 1200)
	var damaged_count := 0
	for target_id in battle_last_event_target_ids:
		if int((battle_state.get("lastEffectPerTarget", {}) as Dictionary).get(target_id, 0)) > 0:
			damaged_count += 1
	return pet_panel_open and saw_event and battle_last_event_target_ids.size() == before_count and damaged_count == before_count


func _auto_injure_living_side(side: String, missing_hp: int) -> void:
	for actor_id in BattleModel.living_actor_ids(battle_state, side):
		var actor := BattleModel.actor_by_id(battle_state, actor_id)
		var next_hp := maxi(1, int(actor.get("maxHp", 1)) - missing_hp)
		battle_state = BattleModel.set_actor_hp(battle_state, actor_id, next_hp)


func _auto_wait_for_event_type(event_type: String, max_frames: int = 900) -> bool:
	for _frame in range(max_frames):
		if battle_last_event_type == event_type or battle_last_round_event_types.has(event_type):
			return true
		await get_tree().process_frame
	return battle_last_event_type == event_type or battle_last_round_event_types.has(event_type)


func _auto_wait_for_actor_action(actor_id: String, max_frames: int = 900) -> bool:
	for _frame in range(max_frames):
		if battle_last_round_actor_order.has(actor_id):
			return true
		await get_tree().process_frame
	return battle_last_round_actor_order.has(actor_id)


func _battle_side_total_hp(side: String) -> int:
	var total := 0
	for actor_id in BattleModel.living_actor_ids(battle_state, side):
		total += int(BattleModel.actor_by_id(battle_state, actor_id).get("hp", 0))
	return total


func _unique_string_count(values: Array[String]) -> int:
	var seen := {}
	for value in values:
		if value != "":
			seen[value] = true
	return seen.size()


func _auto_submit_pet_attack_if_needed() -> void:
	if battle_active and battle_command_owner == "pet" and not _battle_commands_locked():
		_on_battle_command_pressed("attack")
		if battle_target_mode == "pet_enemy_attack":
			_auto_click_enemy_target()


func _auto_click_enemy_target(actor_id: String = "") -> bool:
	var target_id := actor_id if actor_id != "" else BattleModel.living_enemy_id(battle_state)
	var target := BattleModel.actor_by_id(battle_state, target_id)
	if target.is_empty():
		return false
	var screen_point := _world_to_screen(_battle_slot_world_position(str(target.get("slotId", ""))))
	_update_battle_hover_at_screen_point(screen_point)
	return _select_battle_target_at_screen_point(screen_point)


func _auto_submit_pet_defend_if_needed() -> void:
	if battle_active and battle_command_owner == "pet" and not _battle_commands_locked():
		_on_battle_command_pressed("spirit")


func _open_battle_preview() -> void:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))


func _open_battle_formation_preview() -> void:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))


func _open_battle_stat_test() -> void:
	_start_stat_formula_test_battle()


func _open_battle_combo_motion_preview() -> void:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	_prepare_combo_motion_preview_order()
	var target_id := "enemy_front_5"
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(target_id)


func _open_battle_launch_preview(mode: String) -> void:
	if mode != "straight" and mode != "bounce":
		return
	var started := _start_stat_formula_test_battle()
	if not started:
		return
	await get_tree().process_frame
	var target_id := "enemy_front_1" if mode == "bounce" else "enemy_front_3"
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 18)
	var event := {
		"type": "attack",
		"attackerId": "ally_attack_high",
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 86,
		"speed": 90,
		"sequence": 0,
		"movementStyle": "melee",
		"canLaunch": true,
		"launchMode": mode,
		"duration": 1.46 if mode == "bounce" else 1.08,
	}
	battle_state = BattleModel.apply_battle_event(battle_state, event)
	if not bool(battle_state.get("lastEventApplied", false)):
		return
	battle_last_round_applied_events = 1
	_record_battle_event(event)
	_add_battle_event_feedback(event)
	_set_battle_message(str(battle_state.get("message", "")))
	battle_current_event = event.duplicate(true)
	battle_action_timer = _battle_event_duration(event)
	battle_current_event_duration = battle_action_timer
	_sync_battle_buttons()
	queue_redraw()


func _prepare_combo_motion_preview_order() -> void:
	var actors: Array = battle_state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		var actor_id := str(actor.get("id", ""))
		if actor_id == BattleModel.PLAYER_ACTOR_ID:
			actor["quick"] = 180
			actors[index] = actor
		elif actor_id == BattleModel.PLAYER_PET_ID:
			actor["quick"] = 179
			actors[index] = actor
	battle_state["actors"] = actors


func _start_stat_formula_test_battle() -> bool:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return false
	_start_battle(BattleModel.create_stat_formula_test_battle(zones[0] as Dictionary))
	return true


func _battle_buttons_match_request() -> bool:
	var expected := {
		"attack": "攻击",
		"spirit": "精灵",
		"capture": "捕捉",
		"help": "help",
		"defend": "防御",
		"item": "物品",
		"switch_pet": "换宠",
		"run": "逃跑",
	}
	for command_id in expected.keys():
		if not battle_command_buttons.has(command_id):
			return false
		var button := battle_command_buttons[command_id] as Button
		if button == null or button.text != str(expected[command_id]):
			return false
	return true


func _set_battle_command_owner(owner: String) -> void:
	battle_command_owner = owner
	battle_switch_pet_button_pet_ids.clear()
	if battle_command_title_label == null:
		return
	if owner == "pet":
		battle_command_title_label.text = "PET"
		_apply_battle_button_labels({
			"attack": "技1 %s" % BattleActionCatalog.pet_skill_label_for_slot(1, "攻击"),
			"spirit": "技2 %s" % BattleActionCatalog.pet_skill_label_for_slot(2, "防御"),
			"capture": "技3 %s" % BattleActionCatalog.pet_skill_label_for_slot(3, "布伊冲撞"),
			"help": "返回",
			"defend": "技4",
			"item": "技5",
			"switch_pet": "技6",
			"run": "技7",
		})
	elif owner == "spirit":
		battle_command_title_label.text = "精灵"
		_apply_battle_button_labels({
			"attack": BattleActionCatalog.label_for(BattleModel.SPIRIT_GRACE_ALL, "恩惠精灵5"),
			"spirit": BattleActionCatalog.label_for(BattleModel.SPIRIT_MOIST_SINGLE, "滋润精灵5"),
			"capture": BattleActionCatalog.label_for(BattleModel.SPIRIT_POISON_SINGLE, "毒精灵5"),
			"help": "返回",
			"defend": BattleActionCatalog.label_for(BattleModel.SPIRIT_POISON_ALL, "毒雾精灵5"),
			"item": "",
			"switch_pet": "",
			"run": "",
		})
	elif owner == "item":
		battle_command_title_label.text = "物品"
		_apply_battle_button_labels({
			"attack": _battle_item_label(BattleModel.ITEM_HEAL_ALL, "群体草药5"),
			"spirit": _battle_item_label(BattleModel.ITEM_HEAL_SINGLE, "回复药5"),
			"capture": _battle_item_label(BattleModel.ITEM_POISON_SINGLE, "毒粉5"),
			"help": "返回",
			"defend": _battle_item_label(BattleModel.ITEM_POISON_ALL, "毒雾粉5"),
			"item": "",
			"switch_pet": "",
			"run": "",
		})
	elif owner == "switch_pet":
		battle_command_title_label.text = "换宠"
		_apply_switch_pet_button_labels()
	else:
		battle_command_title_label.text = "PLAYER"
		_apply_battle_button_labels({
			"attack": "攻击",
			"spirit": "精灵",
			"capture": "捕捉",
			"help": "help",
			"defend": "防御",
			"item": "物品",
			"switch_pet": "换宠",
			"run": "逃跑",
		})
	_sync_battle_buttons()


func _apply_switch_pet_button_labels() -> void:
	var command_slots := ["attack", "spirit", "capture", "help", "defend", "item", "switch_pet"]
	var labels := {
		"attack": "",
		"spirit": "",
		"capture": "",
		"help": "",
		"defend": "",
		"item": "",
		"switch_pet": "",
		"run": "返回",
	}
	var party := BattleModel.player_pet_party(battle_state)
	for index in range(mini(command_slots.size(), party.size())):
		var entry := party[index] as Dictionary
		var command_id := str(command_slots[index])
		labels[command_id] = _battle_pet_party_button_label(entry)
		battle_switch_pet_button_pet_ids[command_id] = str(entry.get("petId", ""))
	_apply_battle_button_labels(labels)


func _battle_pet_party_button_label(entry: Dictionary) -> String:
	var pet_name := str(entry.get("name", "宠物"))
	match str(entry.get("state", "")):
		BattleModel.PET_STATE_BATTLE:
			return "%s 出战中" % pet_name
		BattleModel.PET_STATE_REST:
			return "%s 休息" % pet_name
		_:
			return "%s 待机" % pet_name


func _battle_item_label(item_id: String, fallback: String) -> String:
	return "%s x%d" % [
		BattleActionCatalog.label_for(item_id, fallback),
		BattleModel.item_count(battle_state, item_id),
	]


func _apply_battle_button_labels(labels: Dictionary) -> void:
	for command_id in labels.keys():
		if not battle_command_buttons.has(command_id):
			continue
		var button := battle_command_buttons[command_id] as Button
		if button != null:
			button.text = str(labels[command_id])


func _battle_command_panel_is_top_right() -> bool:
	if battle_command_panel == null or not battle_command_panel.visible:
		return false
	var viewport_size := _layout_size()
	return battle_command_panel.position.x + battle_command_panel.size.x > viewport_size.x - 28.0 and battle_command_panel.position.y <= 90.0


func _battle_formation_matches_reference() -> bool:
	var ally_front := _world_to_screen(_battle_slot_world_position("ally.front.3"))
	var ally_back := _world_to_screen(_battle_slot_world_position("ally.back.3"))
	var enemy_front := _world_to_screen(_battle_slot_world_position("enemy.front.3"))
	return ally_front.x > enemy_front.x and ally_front.y > enemy_front.y and ally_back.x > ally_front.x and ally_back.y > ally_front.y


func _battle_full_formation_screen_layout_ok() -> bool:
	if not BattleModel.fills_full_formation(battle_state):
		return false
	var viewport_rect := Rect2(Vector2.ZERO, _layout_size())
	var screen_points: Array[Vector2] = []
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		var screen_point := _world_to_screen(_battle_slot_world_position(str(actor.get("slotId", ""))))
		if not viewport_rect.grow(-12.0).has_point(screen_point):
			return false
		if _battle_point_overlaps_panel(screen_point):
			return false
		for previous in screen_points:
			if screen_point.distance_to(previous) < 24.0:
				return false
		screen_points.append(screen_point)
	return _battle_formation_matches_reference()


func _battle_point_overlaps_panel(point: Vector2) -> bool:
	for control in [battle_command_panel, battle_message_panel, top_panel]:
		if control != null and control.visible:
			if Rect2(control.global_position, control.size).has_point(point):
				return true
	return false


func _run_auto_direct_line_check() -> void:
	var start_cell := IsoMapModel.spawn_cell(map_data)
	var goal_cell := start_cell + Vector2i(5, 4)
	var direct_path: Array[Vector2i] = IsoMapModel.direct_path(map_data, start_cell, goal_cell)
	var found_path: Array[Vector2i] = IsoMapModel.find_path(map_data, start_cell, goal_cell)
	_set_click_move_target(_world_to_screen(IsoMapModel.grid_to_world(map_data, goal_cell)))
	for _step in range(18):
		await get_tree().physics_frame
	var uses_direct_path := current_path_is_direct and found_path == direct_path
	var moved := player.global_position.distance_to(IsoMapModel.grid_to_world(map_data, start_cell)) > 8.0
	var status := "ok" if uses_direct_path and moved else "failed"
	print("direct line check ready: status=%s start=%s goal=%s path=%s uses_direct=%s moved=%s" % [
		status,
		str(start_cell),
		str(goal_cell),
		str(found_path),
		str(current_path_is_direct),
		str(moved),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_facing_check() -> void:
	var cases := {
		"east": Vector2.RIGHT,
		"southeast": Vector2(1, 1),
		"south": Vector2.DOWN,
		"southwest": Vector2(-1, 1),
		"west": Vector2.LEFT,
		"northwest": Vector2(-1, -1),
		"north": Vector2.UP,
		"northeast": Vector2(1, -1),
	}
	var all_ok := true
	for expected in cases.keys():
		player.face_direction(cases[expected])
		if player.get_facing_key() != expected:
			all_ok = false
	var start_cell := IsoMapModel.spawn_cell(map_data)
	_set_click_move_target(_world_to_screen(IsoMapModel.grid_to_world(map_data, start_cell + Vector2i(2, -2))))
	for _step in range(6):
		await get_tree().physics_frame
	var movement_updates_facing: bool = player.get_facing_key() == "east"
	var status := "ok" if all_ok and movement_updates_facing else "failed"
	print("facing check ready: status=%s all_directions=%s moving_east=%s final=%s" % [
		status,
		str(all_ok),
		str(movement_updates_facing),
		player.get_facing_key(),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_eight_direction_check() -> void:
	var start_cell := IsoMapModel.spawn_cell(map_data)
	var right_goal := start_cell + Vector2i(2, -2)
	var left_goal := start_cell + Vector2i(-2, 2)
	var right_path: Array[Vector2i] = IsoMapModel.find_path(map_data, start_cell, right_goal)
	var left_path: Array[Vector2i] = IsoMapModel.find_path(map_data, start_cell, left_goal)
	var right_direct := right_path.size() == 3 and right_path[1] == start_cell + Vector2i(1, -1) and right_path[2] == right_goal
	var left_direct := left_path.size() == 3 and left_path[1] == start_cell + Vector2i(-1, 1) and left_path[2] == left_goal
	var right_flat := _path_has_same_screen_y(right_path)
	var left_flat := _path_has_same_screen_y(left_path)
	var status := "ok" if right_direct and left_direct and right_flat and left_flat else "failed"
	print("eight direction check ready: status=%s start=%s right_path=%s left_path=%s right_flat=%s left_flat=%s" % [
		status,
		str(start_cell),
		str(right_path),
		str(left_path),
		str(right_flat),
		str(left_flat),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _path_has_same_screen_y(path_cells: Array[Vector2i]) -> bool:
	if path_cells.is_empty():
		return false
	var first_y := IsoMapModel.grid_to_world(map_data, path_cells[0]).y
	for cell in path_cells:
		if absf(IsoMapModel.grid_to_world(map_data, cell).y - first_y) > 0.1:
			return false
	return true


func _process(delta: float) -> void:
	if battle_active:
		_update_battle_animation(delta)
		_update_hud_text()
		_update_battle_debug_window()
		queue_redraw()
		return
	_update_pet_follow()
	_update_camera_position(false)
	_update_pending_interaction()
	_update_encounter_zone_check()
	if has_target_marker and not player.is_auto_moving() and player.global_position.distance_to(target_marker) <= 6.0:
		has_target_marker = false
		has_target_cell = false
		current_path_is_direct = false
		current_path_cells.clear()
	_update_hud_text()
	_update_battle_debug_window()
	queue_redraw()


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.pressed:
			if battle_active:
				_select_battle_target_at_screen_point(mouse_event.position)
				return
			_set_click_move_target(mouse_event.position)
	elif event is InputEventMouseMotion:
		var motion_event := event as InputEventMouseMotion
		if battle_active:
			_update_battle_hover_at_screen_point(motion_event.position)
	elif event is InputEventScreenTouch:
		var touch_event := event as InputEventScreenTouch
		if touch_event.pressed:
			if battle_active:
				_select_battle_target_at_screen_point(touch_event.position)
				return
			_set_click_move_target(touch_event.position)


func _draw() -> void:
	var viewport_size := get_viewport_rect().size
	var background_rect := _world_background_rect(viewport_size)
	draw_rect(background_rect, Color(0.085, 0.13, 0.14), true)
	if battle_active:
		_draw_battle_scene()
		return
	_draw_isometric_map()
	if has_target_marker:
		_draw_target_marker(target_marker)
	if player != null:
		draw_circle(player.global_position + Vector2(0, 22), 22, Color(0.0, 0.0, 0.0, 0.24))


func _spawn_player() -> void:
	player = PLAYER_SCENE.instantiate()
	add_child(player)
	if map_data.is_empty():
		player.global_position = _layout_size() * 0.5
	else:
		player.global_position = IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data))
	player.set_movement_bounds(_player_movement_bounds())


func _spawn_pet() -> void:
	pet = PET_SCENE.instantiate()
	add_child(pet)
	pet.visible = false
	pet.global_position = player.global_position + Vector2(-56, 36)


func _build_camera() -> void:
	game_camera = Camera2D.new()
	game_camera.name = "WorldCamera"
	game_camera.position_smoothing_enabled = true
	game_camera.position_smoothing_speed = 7.0
	add_child(game_camera)
	game_camera.make_current()
	_update_camera_limits()
	_update_camera_position(true)
	game_camera.enabled = true


func _build_hud() -> void:
	var canvas_layer := CanvasLayer.new()
	add_child(canvas_layer)

	hud_root = Control.new()
	hud_root.name = "Hud"
	hud_root.theme = _build_theme()
	hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas_layer.add_child(hud_root)

	top_panel = _panel_container("TopPanel")
	status_label = Label.new()
	status_label.name = "StatusLabel"
	status_label.add_theme_font_size_override("font_size", 18)
	top_panel.add_child(status_label)
	hud_root.add_child(top_panel)

	side_panel = _panel_container("SidePanel")
	detail_label = Label.new()
	detail_label.name = "DetailLabel"
	detail_label.add_theme_font_size_override("font_size", 17)
	detail_label.text = "伙伴  -  待加入\n任务  -  火芽营地\n阶段  -  初次移动"
	side_panel.add_child(detail_label)
	hud_root.add_child(side_panel)

	action_bar = _panel_container("ActionBar")
	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 10)
	action_bar.add_child(action_row)
	stop_button = Button.new()
	stop_button.text = "停"
	stop_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	stop_button.pressed.connect(_stop_auto_move)
	action_row.add_child(stop_button)
	ring_button = Button.new()
	ring_button.text = "驯宠戒"
	ring_button.custom_minimum_size = Vector2(98, MIN_TOUCH_BUTTON_SIZE.y)
	ring_button.pressed.connect(_toggle_pet_ring)
	action_row.add_child(ring_button)
	hud_root.add_child(action_bar)

	dialog_panel = _panel_container("DialogPanel")
	dialog_panel.visible = false
	var dialog_column := VBoxContainer.new()
	dialog_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dialog_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dialog_column.add_theme_constant_override("separation", 8)
	dialog_panel.add_child(dialog_column)
	dialog_name_label = Label.new()
	dialog_name_label.name = "DialogName"
	dialog_name_label.add_theme_font_size_override("font_size", 20)
	dialog_column.add_child(dialog_name_label)
	dialog_body_label = Label.new()
	dialog_body_label.name = "DialogBody"
	dialog_body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dialog_body_label.custom_minimum_size = Vector2(0, 72)
	dialog_body_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	dialog_column.add_child(dialog_body_label)
	var dialog_buttons := HBoxContainer.new()
	dialog_buttons.alignment = BoxContainer.ALIGNMENT_END
	dialog_buttons.size_flags_vertical = Control.SIZE_SHRINK_END
	dialog_buttons.add_theme_constant_override("separation", 10)
	dialog_column.add_child(dialog_buttons)
	dialog_option_button = Button.new()
	dialog_option_button.custom_minimum_size = Vector2(128, 48)
	dialog_option_button.pressed.connect(_confirm_dialog_action)
	dialog_buttons.add_child(dialog_option_button)
	dialog_close_button = Button.new()
	dialog_close_button.text = "离开"
	dialog_close_button.custom_minimum_size = Vector2(96, 48)
	dialog_close_button.pressed.connect(_close_dialog)
	dialog_buttons.add_child(dialog_close_button)
	hud_root.add_child(dialog_panel)

	encounter_panel = _panel_container("EncounterPanel")
	encounter_panel.visible = false
	var encounter_column := VBoxContainer.new()
	encounter_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	encounter_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	encounter_column.add_theme_constant_override("separation", 10)
	encounter_panel.add_child(encounter_column)
	encounter_title_label = Label.new()
	encounter_title_label.name = "EncounterTitle"
	encounter_title_label.text = "发现野生宠物！"
	encounter_title_label.add_theme_font_size_override("font_size", 22)
	encounter_column.add_child(encounter_title_label)
	encounter_body_label = Label.new()
	encounter_body_label.name = "EncounterBody"
	encounter_body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	encounter_body_label.custom_minimum_size = Vector2(0, 70)
	encounter_column.add_child(encounter_body_label)
	var encounter_buttons := HBoxContainer.new()
	encounter_buttons.alignment = BoxContainer.ALIGNMENT_END
	encounter_buttons.size_flags_vertical = Control.SIZE_SHRINK_END
	encounter_buttons.add_theme_constant_override("separation", 10)
	encounter_column.add_child(encounter_buttons)
	encounter_enter_button = Button.new()
	encounter_enter_button.text = "进入战斗"
	encounter_enter_button.custom_minimum_size = Vector2(128, 48)
	encounter_enter_button.pressed.connect(_start_battle_from_encounter)
	encounter_buttons.add_child(encounter_enter_button)
	encounter_retreat_button = Button.new()
	encounter_retreat_button.text = "先撤退"
	encounter_retreat_button.custom_minimum_size = Vector2(112, 48)
	encounter_retreat_button.pressed.connect(_retreat_from_encounter)
	encounter_buttons.add_child(encounter_retreat_button)
	hud_root.add_child(encounter_panel)

	battle_command_panel = _panel_container("BattleCommandPanel")
	battle_command_panel.visible = false
	var battle_column := VBoxContainer.new()
	battle_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_column.add_theme_constant_override("separation", 8)
	battle_command_panel.add_child(battle_column)
	battle_command_title_label = Label.new()
	battle_command_title_label.name = "BattleCommandTitle"
	battle_command_title_label.text = "PLAYER"
	battle_command_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	battle_command_title_label.add_theme_font_size_override("font_size", 18)
	battle_command_title_label.custom_minimum_size = Vector2(0, 24)
	battle_column.add_child(battle_command_title_label)
	_add_battle_button_row(battle_column, [
		{"id": "attack", "label": "攻击"},
		{"id": "spirit", "label": "精灵"},
		{"id": "capture", "label": "捕捉"},
		{"id": "help", "label": "help"},
	])
	_add_battle_button_row(battle_column, [
		{"id": "defend", "label": "防御"},
		{"id": "item", "label": "物品"},
		{"id": "switch_pet", "label": "换宠"},
		{"id": "run", "label": "逃跑"},
	])
	hud_root.add_child(battle_command_panel)

	battle_message_panel = _panel_container("BattleMessagePanel")
	battle_message_panel.visible = false
	var battle_message_box := VBoxContainer.new()
	battle_message_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_message_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_message_panel.add_child(battle_message_box)
	battle_log_label = Label.new()
	battle_log_label.name = "BattleLog"
	battle_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	battle_log_label.add_theme_font_size_override("font_size", 18)
	battle_log_label.add_theme_color_override("font_color", Color(0.95, 0.86, 0.28, 1.0))
	battle_log_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_log_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_log_label.custom_minimum_size = Vector2(0, 42)
	battle_message_box.add_child(battle_log_label)
	hud_root.add_child(battle_message_panel)


func _add_battle_button_row(parent: VBoxContainer, specs: Array) -> void:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	parent.add_child(row)
	for value in specs:
		var spec := value as Dictionary
		var button := Button.new()
		var command_id := str(spec.get("id", ""))
		button.text = str(spec.get("label", command_id))
		button.custom_minimum_size = Vector2(70, 46)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_battle_command_pressed.bind(command_id))
		row.add_child(button)
		battle_command_buttons[command_id] = button


func _open_battle_debug_window() -> void:
	if battle_debug_window != null:
		battle_debug_window.visible = true
		_update_battle_debug_window(true)
		return
	battle_debug_window = Window.new()
	battle_debug_window.title = "战斗工程验证"
	battle_debug_window.size = Vector2i(760, 620)
	battle_debug_window.close_requested.connect(_on_battle_debug_window_close_requested)
	add_child(battle_debug_window)

	battle_debug_text = TextEdit.new()
	battle_debug_text.editable = false
	battle_debug_text.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	battle_debug_text.set_anchors_preset(Control.PRESET_FULL_RECT)
	battle_debug_text.add_theme_font_size_override("font_size", 15)
	battle_debug_window.add_child(battle_debug_text)
	battle_debug_window.popup_centered(Vector2i(760, 620))
	_update_battle_debug_window(true)


func _on_battle_debug_window_close_requested() -> void:
	battle_debug_window_enabled = false
	if battle_debug_window != null:
		battle_debug_window.hide()


func _update_battle_debug_window(_force: bool = false) -> void:
	# 兼容旧参数名；当前旁路验证只写 .run/battle_trace/latest.jsonl，不打开游戏窗口。
	return


func _battle_debug_report_text() -> String:
	var lines: Array[String] = []
	lines.append("战斗工程验证日志")
	lines.append("说明：当前旁路验证写入 .run/battle_trace/latest.jsonl。")
	lines.append("")
	if battle_state.is_empty():
		lines.append("当前没有战斗。")
		return "\n".join(lines)
	lines.append("战斗：%s  回合：%d  阶段：%s" % [
		str(battle_state.get("id", "")),
		int(battle_state.get("round", 1)),
		str(battle_state.get("phase", "")),
	])
	lines.append("消息：%s" % str(battle_state.get("message", "")))
	lines.append("")
	lines.append("一、角色属性")
	lines.append("名字 | 阵营 | 位置 | HP | 攻击 | 防御 | 敏捷")
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		lines.append("%s | %s | %s | %d/%d | %d | %d | %d" % [
			str(actor.get("name", "")),
			"我方" if str(actor.get("side", "")) == BattleModel.SIDE_ALLY else "敌方",
			str(actor.get("slotId", "")),
			int(actor.get("hp", 0)),
			int(actor.get("maxHp", 0)),
			int(actor.get("attack", 0)),
			int(actor.get("defense", 0)),
			int(actor.get("quick", 0)),
		])
	lines.append("")
	_append_battle_debug_speed_lines(lines)
	lines.append("")
	_append_battle_debug_formula_probe_lines(lines)
	lines.append("")
	_append_battle_debug_event_preview_lines(lines)
	lines.append("")
	lines.append("手工验证要点：高速猎人 > 普通猎人 > 慢速猎人；物品 speed 高于普通攻击；高攻伤害更高；高防受到伤害更低。")
	return "\n".join(lines)


func _append_battle_debug_speed_lines(lines: Array[String]) -> void:
	lines.append("二、基础攻击速度排序")
	var rows: Array[Dictionary] = []
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		if int(actor.get("hp", 0)) <= 0:
			continue
		var actor_id := str(actor.get("id", ""))
		rows.append({
			"name": str(actor.get("name", "")),
			"side": str(actor.get("side", "")),
			"quick": int(actor.get("quick", 0)),
			"speed": BattleModel.action_speed_for(battle_state, actor_id, "attack"),
		})
	for index in range(rows.size()):
		for next_index in range(index + 1, rows.size()):
			if int((rows[next_index] as Dictionary).get("speed", 0)) > int((rows[index] as Dictionary).get("speed", 0)):
				var next_row := rows[next_index]
				rows[next_index] = rows[index]
				rows[index] = next_row
	for row in rows:
		var speed_row := row as Dictionary
		lines.append("%s | %s | 敏捷=%d | attack speed=%d" % [
			str(speed_row.get("name", "")),
			"我方" if str(speed_row.get("side", "")) == BattleModel.SIDE_ALLY else "敌方",
			int(speed_row.get("quick", 0)),
			int(speed_row.get("speed", 0)),
		])


func _append_battle_debug_formula_probe_lines(lines: Array[String]) -> void:
	lines.append("三、关键公式探针")
	_append_damage_probe_line(lines, "高攻 vs 低防", "ally_attack_high", "enemy_front_3", "attack")
	_append_damage_probe_line(lines, "普通攻 vs 低防", "ally_speed_normal", "enemy_front_3", "attack")
	_append_damage_probe_line(lines, "普通攻 vs 高防", "ally_speed_normal", "enemy_front_4", "attack")
	_append_damage_probe_line(lines, "宠物普攻 vs 低防", BattleModel.PLAYER_PET_ID, "enemy_front_3", "attack")
	_append_damage_probe_line(lines, "宠物布伊冲撞 vs 低防", BattleModel.PLAYER_PET_ID, "enemy_front_3", "pet_skill")
	var player_id := BattleModel.PLAYER_ACTOR_ID
	lines.append("我本人速度：普通攻击 speed=%d；物品 speed=%d" % [
		BattleModel.action_speed_for(battle_state, player_id, "attack"),
		BattleModel.action_speed_for(battle_state, player_id, "item"),
	])


func _append_damage_probe_line(lines: Array[String], label: String, attacker_id: String, target_id: String, command_id: String) -> void:
	var attacker := BattleModel.actor_by_id(battle_state, attacker_id)
	var target := BattleModel.actor_by_id(battle_state, target_id)
	if attacker.is_empty() or target.is_empty():
		return
	var damage := BattleModel.pet_skill_damage_preview_for(battle_state, attacker_id, target_id) if command_id == "pet_skill" else BattleModel.attack_damage_preview_for(battle_state, attacker_id, target_id)
	lines.append("%s：%s 攻击=%d -> %s 防御=%d，damage=%d，speed=%d" % [
		label,
		str(attacker.get("name", "")),
		int(attacker.get("attack", 0)),
		str(target.get("name", "")),
		int(target.get("defense", 0)),
		damage,
		BattleModel.action_speed_for(battle_state, attacker_id, command_id),
	])


func _append_battle_debug_event_preview_lines(lines: Array[String]) -> void:
	lines.append("四、下一轮事件预览")
	lines.append("假设：人物攻击低防乌力，宠物防御，其他友方 NPC 自动攻击。")
	var events := BattleModel.build_player_pet_round_events(
		battle_state,
		{"command": "attack", "targetId": "enemy_front_3", "allyTargetId": BattleModel.PLAYER_ACTOR_ID},
		{"command": "defend", "targetId": "enemy_front_3"}
	)
	var order := 1
	for event_value in events:
		var event := event_value as Dictionary
		var attacker_id := str(event.get("attackerId", ""))
		var target_id := str(event.get("targetId", ""))
		var attacker := BattleModel.actor_by_id(battle_state, attacker_id)
		var target := BattleModel.actor_by_id(battle_state, target_id)
		var attacker_name := str(attacker.get("name", attacker_id))
		if str(event.get("type", "")) == "combo_attack":
			var names: Array[String] = []
			for participant_value in event.get("participantIds", []):
				var participant := BattleModel.actor_by_id(battle_state, str(participant_value))
				names.append(str(participant.get("name", participant_value)))
			attacker_name = "、".join(names)
		lines.append("%02d. %s | %s -> %s | speed=%d | damage=%d" % [
			order,
			str(event.get("type", "")),
			attacker_name,
			str(target.get("name", target_id)),
			int(event.get("speed", 0)),
			int(event.get("damage", 0)),
		])
		order += 1


func _battle_trace_enabled() -> bool:
	return battle_stat_test or auto_battle_stat_formula_check or battle_debug_window_enabled


func _reset_battle_trace_file() -> void:
	battle_trace_path = ""
	if not _battle_trace_enabled() or battle_state.is_empty():
		return
	var trace_dir := ProjectSettings.globalize_path("res://../../.run/battle_trace")
	DirAccess.make_dir_recursive_absolute(trace_dir)
	battle_trace_path = trace_dir + "/latest.jsonl"
	var file := FileAccess.open(battle_trace_path, FileAccess.WRITE)
	if file == null:
		battle_trace_path = ""
		return
	file.store_line(JSON.stringify({
		"kind": "battle_start",
		"battleId": str(battle_state.get("id", "")),
		"round": int(battle_state.get("round", 1)),
		"phase": str(battle_state.get("phase", "")),
		"actors": _battle_trace_actor_snapshots(),
	}))
	file.close()


func _append_battle_trace(entry: Dictionary) -> void:
	if battle_trace_path == "":
		return
	var file := FileAccess.open(battle_trace_path, FileAccess.READ_WRITE)
	if file == null:
		return
	file.seek_end()
	file.store_line(JSON.stringify(entry))
	file.close()


func _battle_trace_actor_snapshots() -> Array[Dictionary]:
	var snapshots: Array[Dictionary] = []
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		snapshots.append(_battle_trace_actor_snapshot(actor))
	return snapshots


func _battle_trace_actor_snapshot(actor: Dictionary) -> Dictionary:
	return {
		"id": str(actor.get("id", "")),
		"name": str(actor.get("name", "")),
		"side": str(actor.get("side", "")),
		"kind": str(actor.get("kind", "")),
		"slotId": str(actor.get("slotId", "")),
		"hp": int(actor.get("hp", 0)),
		"maxHp": int(actor.get("maxHp", 0)),
		"attack": int(actor.get("attack", 0)),
		"defense": int(actor.get("defense", 0)),
		"agility": int(actor.get("quick", 0)),
	}


func _build_theme() -> Theme:
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray([
		"PingFang SC",
		"STHeiti",
		"Hiragino Sans GB",
		"Microsoft YaHei",
		"Noto Sans CJK SC",
		"Noto Sans",
		"Arial Unicode MS",
	])
	theme.default_font = font
	theme.default_font_size = 18
	return theme


func _panel_container(node_name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	panel.add_theme_stylebox_override("panel", _panel_style())
	return panel


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.13, 0.17, 0.17, 0.86)
	style.border_color = Color(0.72, 0.56, 0.32, 0.9)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style


func _button_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0.94, 0.78, 0.42, 0.95)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	return style


func _set_click_move_target(screen_point: Vector2) -> void:
	if _is_ui_point(screen_point):
		return
	if encounter_active or battle_active:
		return

	var world_point := _screen_to_world(screen_point)
	var interaction := InteractionModel.find_at_world_point(map_data, world_point)
	if not interaction.is_empty():
		_set_interaction_target(interaction)
		return

	_clear_pending_interaction()
	_close_dialog()
	var clicked_cell := IsoMapModel.world_to_grid(map_data, world_point)
	if not IsoMapModel.is_inside(map_data, clicked_cell):
		return
	_set_move_target_cell(clicked_cell, IsoMapModel.grid_to_world(map_data, clicked_cell), clicked_cell)


func _set_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	if not IsoMapModel.is_inside(map_data, goal_cell):
		return false
	var start_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var safe_goal_cell := IsoMapModel.nearest_walkable_cell(map_data, goal_cell)
	if start_cell == safe_goal_cell:
		player.clear_move_target()
		current_path_cells.clear()
		current_path_cells.append(safe_goal_cell)
		current_path_is_direct = true
		target_cell = marker_cell
		has_target_cell = true
		target_marker = marker_point
		has_target_marker = true
		return true
	var path_cells: Array[Vector2i] = IsoMapModel.find_path(map_data, start_cell, safe_goal_cell)
	var is_direct_path := IsoMapModel.is_direct_path_clear(map_data, start_cell, safe_goal_cell)
	var path_points: Array[Vector2] = IsoMapModel.path_to_world_points(map_data, path_cells, false)
	if is_direct_path:
		path_points = [IsoMapModel.grid_to_world(map_data, safe_goal_cell)]
	if path_points.is_empty():
		player.clear_move_target()
		current_path_cells.clear()
		has_target_marker = false
		has_target_cell = false
		current_path_is_direct = false
		return false

	player.set_path(path_points)
	current_path_cells = path_cells
	current_path_is_direct = is_direct_path
	target_cell = marker_cell
	has_target_cell = true
	target_marker = marker_point
	has_target_marker = true
	return true


func _set_interaction_target(item: Dictionary) -> void:
	_close_dialog()
	pending_interaction = item.duplicate(true)
	has_pending_interaction = true
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	pending_interaction_approach_cell = InteractionModel.interaction_goal_cell_for(map_data, player_cell, item)
	var marker_point := InteractionModel.marker_world_position(map_data, item)
	var moved := _set_move_target_cell(pending_interaction_approach_cell, marker_point, InteractionModel.cell_for(item))
	if not moved:
		_complete_interaction(item)


func _clear_pending_interaction() -> void:
	has_pending_interaction = false
	pending_interaction.clear()
	pending_interaction_approach_cell = Vector2i.ZERO


func _update_pending_interaction() -> void:
	if not has_pending_interaction or player.is_auto_moving():
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	if player_cell == pending_interaction_approach_cell or player.global_position.distance_to(IsoMapModel.grid_to_world(map_data, pending_interaction_approach_cell)) <= 8.0:
		var item := pending_interaction.duplicate(true)
		_clear_pending_interaction()
		_complete_interaction(item)


func _complete_interaction(item: Dictionary) -> void:
	if InteractionModel.is_warp(item):
		_transfer_from_warp(item)
		return
	_open_interaction_dialog(item)


func _transfer_from_warp(item: Dictionary) -> void:
	var to_map := str(item.get("toMap", ""))
	var to_spawn := str(item.get("toSpawn", "default"))
	if to_map == "":
		_open_interaction_dialog(item)
		return
	_load_map(to_map, to_spawn)


func _update_encounter_zone_check() -> void:
	if player == null or map_data.is_empty() or encounter_active or battle_active or _dialog_is_open() or has_pending_interaction:
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	if player.is_auto_moving():
		return
	if player_cell == last_checked_player_cell:
		return
	last_checked_player_cell = player_cell
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		return
	if encounter_rng.randf() <= EncounterModel.encounter_rate(zone):
		_trigger_encounter(zone)


func _trigger_encounter(zone: Dictionary) -> void:
	if encounter_active or battle_active:
		return
	player.clear_move_target()
	_clear_navigation_state()
	if player.has_method("set_controls_enabled"):
		player.set_controls_enabled(false)
	active_encounter_zone = zone.duplicate(true)
	encounter_active = true
	encounter_title_label.text = "发现野生宠物！"
	var zone_name := str(zone.get("name", "野外"))
	var preview_text := str(zone.get("previewText", "附近有野生宠物出现。"))
	encounter_body_label.text = "%s\n%s" % [zone_name, preview_text]
	encounter_enter_button.text = "进入战斗"
	encounter_enter_button.disabled = false
	encounter_retreat_button.text = "先撤退"
	encounter_panel.visible = true
	_layout_hud()


func _retreat_from_encounter() -> void:
	_close_encounter()


func _close_encounter() -> void:
	encounter_active = false
	active_encounter_zone.clear()
	if encounter_panel != null:
		encounter_panel.visible = false
	if not battle_active and player != null and player.has_method("set_controls_enabled"):
		player.set_controls_enabled(true)


func _start_battle_from_encounter() -> void:
	if not encounter_active or active_encounter_zone.is_empty():
		return
	var zone := active_encounter_zone.duplicate(true)
	_start_battle(BattleModel.create_wild_battle(zone))


func _refresh_battle_target_seed() -> void:
	if battle_state.is_empty():
		return
	battle_state["targetSeed"] = "%s:%d:%d" % [
		str(battle_state.get("id", "battle")),
		int(battle_state.get("round", 1)),
		encounter_rng.randi(),
	]


func _start_battle(next_battle_state: Dictionary) -> void:
	_clear_navigation_state()
	_close_dialog()
	_close_encounter()
	battle_state = next_battle_state.duplicate(true)
	_refresh_battle_target_seed()
	battle_active = true
	battle_action_timer = 0.0
	battle_end_pending = false
	battle_enemy_response_pending = false
	battle_command_owner = "player"
	battle_target_mode = "enemy"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_selected_ally_target_id = ""
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_event_queue.clear()
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	battle_state["guardingActorIds"] = []
	battle_last_round_applied_events = 0
	battle_last_round_event_types.clear()
	battle_last_round_actor_order.clear()
	battle_last_round_speeds.clear()
	battle_last_round_enemy_target_ids.clear()
	battle_last_event_type = ""
	battle_last_event_target_id = ""
	battle_last_event_target_ids.clear()
	battle_last_event_damage = 0
	battle_last_event_heal = 0
	battle_last_event_launch = false
	battle_last_event_launch_mode = ""
	battle_float_texts.clear()
	_set_battle_command_owner("player")
	if player != null:
		player.visible = false
		if player.has_method("set_controls_enabled"):
			player.set_controls_enabled(false)
	if pet != null:
		pet.clear_follow_target()
		pet.visible = false
	if battle_command_panel != null:
		battle_command_panel.visible = true
	if battle_message_panel != null:
		battle_message_panel.visible = true
	if action_bar != null:
		action_bar.visible = false
	_reset_battle_trace_file()
	_set_battle_message(str(battle_state.get("message", "进入战斗。")))
	_sync_battle_buttons()
	_layout_hud()
	_update_battle_debug_window(true)
	queue_redraw()


func _end_battle(_restore_world: bool = true) -> void:
	battle_active = false
	battle_state.clear()
	battle_action_timer = 0.0
	battle_end_pending = false
	battle_enemy_response_pending = false
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_target_mode = "enemy"
	battle_command_owner = "player"
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_event_queue.clear()
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	battle_last_round_applied_events = 0
	battle_last_round_event_types.clear()
	battle_last_round_actor_order.clear()
	battle_last_round_speeds.clear()
	battle_last_round_enemy_target_ids.clear()
	battle_last_event_type = ""
	battle_last_event_target_id = ""
	battle_last_event_target_ids.clear()
	battle_last_event_damage = 0
	battle_last_event_heal = 0
	battle_last_event_launch = false
	battle_last_event_launch_mode = ""
	battle_float_texts.clear()
	_set_battle_command_owner("player")
	if battle_command_panel != null:
		battle_command_panel.visible = false
	if battle_message_panel != null:
		battle_message_panel.visible = false
	if action_bar != null:
		action_bar.visible = true
	if player != null:
		player.visible = true
		if player.has_method("set_controls_enabled"):
			player.set_controls_enabled(true)
	if pet != null:
		pet.visible = pet_follow_enabled
		if pet_follow_enabled:
			pet.set_follow_target(pet.global_position)
	if hud_root != null:
		_layout_hud()
	if status_label != null:
		_update_hud_text()
	_update_battle_debug_window(true)
	queue_redraw()


func _on_battle_command_pressed(command_id: String) -> void:
	if not battle_active:
		return
	if _battle_commands_locked() and command_id != "run":
		return
	if battle_command_owner == "pet":
		_on_pet_battle_command_pressed(command_id)
		return
	if battle_command_owner == "spirit":
		_on_spirit_battle_command_pressed(command_id)
		return
	if battle_command_owner == "item":
		_on_item_battle_command_pressed(command_id)
		return
	if battle_command_owner == "switch_pet":
		_on_switch_pet_battle_command_pressed(command_id)
		return
	match command_id:
		"attack":
			_begin_player_enemy_target_selection("attack")
		"defend":
			_submit_player_battle_command("defend")
		"run":
			_battle_escape()
		"spirit":
			_open_spirit_command_menu()
		"capture":
			_begin_player_enemy_target_selection("capture")
		"item":
			_open_item_command_menu()
		"switch_pet":
			_open_switch_pet_command_menu()
		"help":
			_set_battle_message("选择攻击或逃跑。")
		_:
			_set_battle_message("这个指令稍后开放。")


func _battle_attack() -> void:
	_battle_start_round("attack")


func _begin_player_enemy_target_selection(command_id: String) -> void:
	if BattleModel.living_enemy_id(battle_state) == "":
		_set_battle_message("没有可选择的目标。")
		return
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_target_mode = "player_capture_target" if command_id == "capture" else "player_attack_target"
	_set_battle_message("请选择%s目标。" % ("捕捉" if command_id == "capture" else "攻击"))
	_sync_battle_buttons()
	queue_redraw()


func _submit_player_battle_command(command_id: String, target_id: String = "") -> void:
	battle_target_mode = "enemy"
	if command_id == "attack" or command_id == "capture":
		battle_selected_target_id = target_id
		if battle_selected_target_id == "":
			_set_battle_message("没有可选择的目标。")
			return
	battle_pending_player_command = {
		"command": command_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	_open_pet_command_or_start_round()


func _submit_spirit_player_command(spirit_id: String, target_id: String = "") -> void:
	battle_target_mode = "enemy"
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	var command := {
		"command": "spirit",
		"spiritId": spirit_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	match spirit_id:
		BattleModel.SPIRIT_GRACE_ALL:
			command["targetSide"] = BattleModel.SIDE_ALLY
			command["targetScope"] = "all"
		BattleModel.SPIRIT_MOIST_SINGLE:
			command["targetSide"] = BattleModel.SIDE_ALLY
			command["targetScope"] = "single"
			command["allyTargetId"] = target_id
		BattleModel.SPIRIT_POISON_SINGLE:
			command["targetSide"] = BattleModel.SIDE_ENEMY
			command["targetScope"] = "single"
			command["targetId"] = target_id
			battle_selected_target_id = target_id
		BattleModel.SPIRIT_POISON_ALL:
			command["targetSide"] = BattleModel.SIDE_ENEMY
			command["targetScope"] = "all"
	battle_pending_player_command = command
	_open_pet_command_or_start_round()


func _submit_item_player_command(item_id: String, target_id: String = "") -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	var command := {
		"command": "item",
		"itemId": item_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	match item_id:
		BattleModel.ITEM_HEAL_ALL:
			command["targetSide"] = BattleModel.SIDE_ALLY
			command["targetScope"] = "all"
		BattleModel.ITEM_HEAL_SINGLE:
			command["targetSide"] = BattleModel.SIDE_ALLY
			command["targetScope"] = "single"
			command["allyTargetId"] = target_id
		BattleModel.ITEM_POISON_SINGLE:
			command["targetSide"] = BattleModel.SIDE_ENEMY
			command["targetScope"] = "single"
			command["targetId"] = target_id
			battle_selected_target_id = target_id
		BattleModel.ITEM_POISON_ALL:
			command["targetSide"] = BattleModel.SIDE_ENEMY
			command["targetScope"] = "all"
	battle_pending_player_command = command
	_open_pet_command_or_start_round()


func _open_spirit_command_menu() -> void:
	battle_target_mode = "enemy"
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	_set_battle_command_owner("spirit")
	_set_battle_message("选择要使用的精灵。")


func _open_item_command_menu() -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	_set_battle_command_owner("item")
	_set_battle_message("选择要使用的物品。")


func _open_switch_pet_command_menu() -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_command_owner("switch_pet")
	_set_battle_message("选择待机宠物。")


func _on_switch_pet_battle_command_pressed(command_id: String) -> void:
	if command_id == "run":
		battle_target_mode = "enemy"
		_set_battle_command_owner("player")
		_set_battle_message("重新选择人物指令。")
		return
	var pet_id := str(battle_switch_pet_button_pet_ids.get(command_id, ""))
	if pet_id == "":
		_set_battle_message("这个栏位没有宠物。")
		return
	if not BattleModel.is_pet_switchable(battle_state, pet_id):
		var entry := BattleModel.pet_party_entry_by_id(battle_state, pet_id)
		match str(entry.get("state", "")):
			BattleModel.PET_STATE_BATTLE:
				_set_battle_message("%s 已经在战斗中。" % str(entry.get("name", "宠物")))
			BattleModel.PET_STATE_REST:
				_set_battle_message("%s 正在休息，不能出战。" % str(entry.get("name", "宠物")))
			_:
				_set_battle_message("%s 不能出战。" % str(entry.get("name", "宠物")))
		return
	_submit_switch_pet_player_command(pet_id)


func _submit_switch_pet_player_command(pet_id: String) -> void:
	battle_target_mode = "enemy"
	battle_pending_player_command = {
		"command": "switch_pet",
		"petId": pet_id,
	}
	battle_pending_pet_command.clear()
	_battle_start_pending_round()


func _begin_single_spirit_target_selection(spirit_id: String) -> void:
	battle_pending_spirit_id = spirit_id
	battle_pending_item_id = ""
	var spirit_label := BattleActionCatalog.label_for(spirit_id, "精灵")
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	if spirit_id == BattleModel.SPIRIT_MOIST_SINGLE:
		battle_target_mode = "ally_spirit_single"
		_set_battle_message("%s：请选择我方单体。" % spirit_label)
	else:
		battle_target_mode = "enemy_spirit_single"
		_set_battle_message("%s：请选择敌方单体。" % spirit_label)
	_sync_battle_buttons()
	queue_redraw()


func _on_spirit_battle_command_pressed(command_id: String) -> void:
	match command_id:
		"attack":
			_submit_spirit_player_command(BattleModel.SPIRIT_GRACE_ALL)
		"spirit":
			_begin_single_spirit_target_selection(BattleModel.SPIRIT_MOIST_SINGLE)
		"capture":
			_begin_single_spirit_target_selection(BattleModel.SPIRIT_POISON_SINGLE)
		"defend":
			_submit_spirit_player_command(BattleModel.SPIRIT_POISON_ALL)
		"help":
			battle_pending_spirit_id = ""
			battle_pending_item_id = ""
			battle_target_mode = "enemy"
			battle_selected_target_id = ""
			battle_selected_ally_target_id = ""
			battle_hover_target_id = ""
			battle_hover_ally_target_id = ""
			_set_battle_command_owner("player")
			_set_battle_message("重新选择人物指令。")
		_:
			_set_battle_message("这个精灵栏位暂未开放。")


func _begin_single_item_target_selection(item_id: String) -> void:
	battle_pending_item_id = item_id
	battle_pending_spirit_id = ""
	var item_label := BattleActionCatalog.label_for(item_id, "物品")
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	if BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ALLY):
		battle_target_mode = "ally_item_single"
		_set_battle_message("%s：请选择我方单体。" % item_label)
	else:
		battle_target_mode = "enemy_item_single"
		_set_battle_message("%s：请选择敌方单体。" % item_label)
	_sync_battle_buttons()
	queue_redraw()


func _on_item_battle_command_pressed(command_id: String) -> void:
	match command_id:
		"attack":
			_submit_item_player_command(BattleModel.ITEM_HEAL_ALL)
		"spirit":
			_begin_single_item_target_selection(BattleModel.ITEM_HEAL_SINGLE)
		"capture":
			_begin_single_item_target_selection(BattleModel.ITEM_POISON_SINGLE)
		"defend":
			_submit_item_player_command(BattleModel.ITEM_POISON_ALL)
		"help":
			battle_pending_item_id = ""
			battle_pending_spirit_id = ""
			battle_target_mode = "enemy"
			battle_selected_target_id = ""
			battle_selected_ally_target_id = ""
			battle_hover_target_id = ""
			battle_hover_ally_target_id = ""
			_set_battle_command_owner("player")
			_set_battle_message("重新选择人物指令。")
		_:
			_set_battle_message("这个物品栏位暂未开放。")


func _begin_pet_skill_target_selection() -> void:
	battle_target_mode = "pet_enemy_skill"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_message("%s：请选择敌方目标。" % BattleActionCatalog.label_for(BattleModel.PET_SKILL_BUI_CHARGE, "布伊冲撞"))
	queue_redraw()


func _begin_pet_attack_target_selection() -> void:
	if BattleModel.living_enemy_id(battle_state) == "":
		_set_battle_message("没有可选择的目标。")
		return
	battle_target_mode = "pet_enemy_attack"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_message("%s：请选择敌方目标。" % BattleActionCatalog.label_for(BattleModel.PET_SKILL_ATTACK, "攻击"))
	_sync_battle_buttons()
	queue_redraw()


func _begin_spirit_target_selection() -> void:
	battle_target_mode = "ally_spirit_single"
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_pending_spirit_id = BattleModel.SPIRIT_MOIST_SINGLE
	battle_pending_item_id = ""
	_set_battle_message("%s：请选择我方单体。" % BattleActionCatalog.label_for(BattleModel.SPIRIT_MOIST_SINGLE, "滋润精灵5"))
	_sync_battle_buttons()
	queue_redraw()


func _on_pet_battle_command_pressed(command_id: String) -> void:
	match command_id:
		"attack":
			_begin_pet_attack_target_selection()
		"spirit":
			_submit_pet_battle_command("defend")
		"capture":
			_begin_pet_skill_target_selection()
		"help":
			battle_pending_spirit_id = ""
			battle_pending_item_id = ""
			battle_pending_player_command.clear()
			battle_pending_pet_command.clear()
			battle_selected_target_id = ""
			battle_selected_ally_target_id = ""
			battle_hover_target_id = ""
			battle_hover_ally_target_id = ""
			_set_battle_command_owner("player")
			_set_battle_message("重新选择人物指令。")
		_:
			_set_battle_message("这个宠物技能栏暂未开放。")


func _submit_pet_battle_command(command_id: String, target_id: String = "") -> void:
	if command_id == "attack" or command_id == "pet_skill":
		battle_selected_target_id = target_id
		if battle_selected_target_id == "":
			_set_battle_message("没有可选择的目标。")
			return
	battle_pending_pet_command = {
		"command": command_id,
		"targetId": battle_selected_target_id,
	}
	_battle_start_pending_round()


func _open_pet_command_or_start_round() -> void:
	if BattleModel.controlled_pet_id(battle_state) != "":
		_set_battle_command_owner("pet")
		var pet_actor := BattleModel.actor_by_id(battle_state, BattleModel.controlled_pet_id(battle_state))
		_set_battle_message("%s 要做什么？" % str(pet_actor.get("name", "宠物")))
		return
	battle_pending_pet_command.clear()
	_battle_start_pending_round()


func _battle_start_pending_round() -> void:
	battle_target_mode = "enemy"
	if battle_pending_player_command.is_empty():
		_set_battle_message("请先选择人物指令。")
		_set_battle_command_owner("player")
		return
	var player_command_id := str(battle_pending_player_command.get("command", ""))
	if player_command_id != "switch_pet" and battle_pending_pet_command.is_empty() and BattleModel.controlled_pet_id(battle_state) != "":
		battle_pending_pet_command = {
			"command": "attack",
			"targetId": battle_selected_target_id,
		}
	_refresh_battle_target_seed()
	battle_event_queue = BattleModel.build_player_pet_round_events(
		battle_state,
		battle_pending_player_command,
		battle_pending_pet_command
	)
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_last_round_applied_events = 0
	battle_last_round_event_types.clear()
	battle_last_round_actor_order.clear()
	battle_last_round_speeds.clear()
	battle_last_round_enemy_target_ids.clear()
	if battle_event_queue.is_empty():
		_set_battle_command_owner("player")
		_set_battle_message("没有可行动的单位。")
		return
	_set_battle_command_owner("player")
	battle_state["phase"] = "round_events"
	_play_next_battle_event()


func _battle_start_round(command_id: String) -> void:
	_sync_battle_target_selection()
	if battle_selected_target_id == "":
		_set_battle_message("没有可选择的目标。")
		return
	var player_command := {
		"command": command_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	var pet_command := {
		"command": "attack",
		"targetId": battle_selected_target_id,
	}
	_refresh_battle_target_seed()
	battle_event_queue = BattleModel.build_player_pet_round_events(battle_state, player_command, pet_command)
	battle_last_round_applied_events = 0
	battle_last_round_event_types.clear()
	battle_last_round_actor_order.clear()
	battle_last_round_speeds.clear()
	battle_last_round_enemy_target_ids.clear()
	if battle_event_queue.is_empty():
		_set_battle_message("没有可行动的单位。")
		return
	battle_state["phase"] = "round_events"
	_play_next_battle_event()


func _play_next_battle_event() -> void:
	while battle_active and not battle_event_queue.is_empty():
		var event := battle_event_queue.pop_front() as Dictionary
		var actor_snapshots := _battle_actor_snapshots_by_id()
		battle_state = BattleModel.apply_battle_event(battle_state, event)
		battle_state["phase"] = "round_events"
		if not bool(battle_state.get("lastEventApplied", false)):
			battle_current_event_actor_snapshots.clear()
			continue
		battle_last_round_applied_events += 1
		_record_battle_event(event)
		_add_battle_event_feedback(event)
		_set_battle_message(str(battle_state.get("message", "")))
		_sync_battle_target_selection()
		if BattleModel.living_enemy_id(battle_state) == "" or BattleModel.living_ally_id(battle_state) == "":
			battle_event_queue.clear()
			battle_end_pending = true
		battle_current_event = _battle_display_event_for_applied_event(event)
		battle_current_event_actor_snapshots = actor_snapshots
		battle_action_timer = _battle_event_duration(battle_current_event)
		battle_current_event_duration = battle_action_timer
		_sync_battle_buttons()
		queue_redraw()
		return

	if BattleModel.living_enemy_id(battle_state) == "" or BattleModel.living_ally_id(battle_state) == "":
		battle_end_pending = true
		battle_action_timer = 0.2
		_sync_battle_buttons()
		queue_redraw()
		return
	battle_state["phase"] = "command"
	battle_state["round"] = int(battle_state.get("round", 1)) + 1
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	_set_battle_command_owner("player")
	battle_target_mode = "enemy"
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_pending_item_id = ""
	battle_state["guardingActorIds"] = []
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_sync_battle_target_selection()
	_sync_battle_buttons()
	queue_redraw()


func _battle_display_event_for_applied_event(event: Dictionary) -> Dictionary:
	var display_event := event.duplicate(true)
	var actual_target_id := str(battle_state.get("lastTargetId", ""))
	if actual_target_id != "":
		display_event["targetId"] = actual_target_id
	return display_event


func _battle_actor_snapshots_by_id() -> Dictionary:
	var snapshots := {}
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		var actor_id := str(actor.get("id", ""))
		if actor_id != "":
			snapshots[actor_id] = actor.duplicate(true)
	return snapshots


func _record_battle_event(event: Dictionary) -> void:
	var event_type := str(battle_state.get("lastEventType", event.get("type", "")))
	battle_last_event_type = event_type
	battle_last_event_target_id = str(battle_state.get("lastTargetId", ""))
	battle_last_event_target_ids.clear()
	for target_id_value in battle_state.get("lastTargetIds", []):
		var target_id := str(target_id_value)
		if target_id != "":
			battle_last_event_target_ids.append(target_id)
	battle_last_event_damage = int(battle_state.get("lastDamage", 0))
	battle_last_event_heal = int(battle_state.get("lastHeal", 0))
	battle_last_event_launch = bool(battle_state.get("lastLaunch", false))
	battle_last_event_launch_mode = str(battle_state.get("lastLaunchMode", ""))
	battle_last_round_event_types.append(event_type)
	battle_last_round_speeds.append(int(event.get("speed", 0)))
	var attacker_actor := BattleModel.actor_by_id(battle_state, str(event.get("attackerId", "")))
	if not attacker_actor.is_empty() and str(attacker_actor.get("side", "")) == BattleModel.SIDE_ENEMY and str(event.get("targetSide", "")) == BattleModel.SIDE_ALLY:
		var enemy_target_id := str(battle_state.get("lastTargetId", event.get("targetId", "")))
		if enemy_target_id != "":
			battle_last_round_enemy_target_ids.append(enemy_target_id)
	var participants: Array = battle_state.get("lastParticipants", [])
	if participants.is_empty():
		participants = [str(event.get("attackerId", ""))]
	for participant_id in participants:
		var actor_id := str(participant_id)
		if actor_id != "":
			battle_last_round_actor_order.append(actor_id)
	var target_actor := BattleModel.actor_by_id(battle_state, battle_last_event_target_id)
	_append_battle_trace({
		"kind": "battle_event",
		"battleId": str(battle_state.get("id", "")),
		"round": int(battle_state.get("round", 1)),
		"type": event_type,
		"attackerId": str(event.get("attackerId", "")),
		"attackerName": str(attacker_actor.get("name", "")),
		"targetId": battle_last_event_target_id,
		"targetName": str(target_actor.get("name", "")),
		"targetIds": battle_last_event_target_ids,
		"speed": int(event.get("speed", 0)),
		"damage": battle_last_event_damage,
		"heal": battle_last_event_heal,
		"launch": battle_last_event_launch,
		"launchMode": battle_last_event_launch_mode,
		"participants": battle_last_round_actor_order,
	})
	_update_battle_debug_window(true)


func _add_battle_event_feedback(event: Dictionary) -> void:
	var event_type := str(battle_state.get("lastEventType", event.get("type", "")))
	var target_id := str(battle_state.get("lastTargetId", ""))
	if target_id == "":
		return
	if event_type == "capture":
		var success := bool(battle_state.get("lastCaptureSuccess", false))
		_add_battle_float_text(target_id, "捕获" if success else "挣脱", Color(0.56, 0.95, 1.0, 0.96) if success else Color(0.95, 0.88, 0.36, 0.96))
		return
	if event_type == "spirit_heal":
		var healed := int(battle_state.get("lastHeal", 0))
		if healed > 0:
			_add_battle_float_text(target_id, "+%d" % healed, Color(0.56, 1.0, 0.66, 0.98))
		return
	if event_type == "item_heal":
		var item_healed := int(battle_state.get("lastHeal", 0))
		if item_healed > 0:
			_add_battle_float_text(target_id, "药 +%d" % item_healed, Color(0.62, 0.98, 0.72, 0.98))
		return
	if event_type == "spirit_heal_all":
		var heal_effects := battle_state.get("lastEffectPerTarget", {}) as Dictionary
		for heal_target_id in battle_state.get("lastTargetIds", []):
			var heal_value := int(heal_effects.get(str(heal_target_id), 0))
			if heal_value > 0:
				_add_battle_float_text(str(heal_target_id), "+%d" % heal_value, Color(0.56, 1.0, 0.66, 0.98))
		return
	if event_type == "item_heal_all":
		var item_heal_effects := battle_state.get("lastEffectPerTarget", {}) as Dictionary
		for item_heal_target_id in battle_state.get("lastTargetIds", []):
			var item_heal_value := int(item_heal_effects.get(str(item_heal_target_id), 0))
			if item_heal_value > 0:
				_add_battle_float_text(str(item_heal_target_id), "药 +%d" % item_heal_value, Color(0.62, 0.98, 0.72, 0.98))
		return
	if event_type == "spirit_poison":
		var poison_damage := int(battle_state.get("lastDamage", 0))
		if poison_damage > 0:
			_add_battle_float_text(target_id, "中毒 -%d" % poison_damage, Color(0.72, 0.95, 0.36, 0.98))
		return
	if event_type == "item_poison":
		var item_poison_damage := int(battle_state.get("lastDamage", 0))
		if item_poison_damage > 0:
			_add_battle_float_text(target_id, "毒粉 -%d" % item_poison_damage, Color(0.80, 0.92, 0.34, 0.98))
		return
	if event_type == "spirit_poison_all":
		var poison_effects := battle_state.get("lastEffectPerTarget", {}) as Dictionary
		for poison_target_id in battle_state.get("lastTargetIds", []):
			var poison_value := int(poison_effects.get(str(poison_target_id), 0))
			if poison_value > 0:
				_add_battle_float_text(str(poison_target_id), "中毒 -%d" % poison_value, Color(0.72, 0.95, 0.36, 0.98))
		return
	if event_type == "item_poison_all":
		var item_poison_effects := battle_state.get("lastEffectPerTarget", {}) as Dictionary
		for item_poison_target_id in battle_state.get("lastTargetIds", []):
			var item_poison_value := int(item_poison_effects.get(str(item_poison_target_id), 0))
			if item_poison_value > 0:
				_add_battle_float_text(str(item_poison_target_id), "毒粉 -%d" % item_poison_value, Color(0.80, 0.92, 0.34, 0.98))
		return
	if event_type == "defend":
		return
	var damage := int(battle_state.get("lastDamage", 0))
	if damage <= 0:
		return
	var text := "-%d" % damage
	var feedback_delay := _battle_event_duration(event) * _battle_event_result_reveal_progress(event) if _battle_event_delays_result(event) else 0.0
	if battle_last_event_launch:
		text = "击飞 %s" % text
	if event_type == "combo_attack":
		text = "合击 %s" % text
	elif event_type == "skill_attack":
		text = "技能 %s" % text
	_add_battle_float_text(target_id, text, Color(1.0, 0.82, 0.30, 0.98), feedback_delay)


func _add_battle_float_text(actor_id: String, text: String, color: Color, delay: float = 0.0) -> void:
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	if actor.is_empty():
		return
	var origin := _battle_slot_world_position(str(actor.get("slotId", ""))) + Vector2(0, -64.0 * _battle_actor_visual_scale())
	battle_float_texts.append({
		"text": text,
		"position": origin,
		"age": -maxf(0.0, delay),
		"duration": 0.95,
		"color": color,
	})
	if battle_float_texts.size() > 16:
		battle_float_texts.pop_front()


func _battle_event_duration(event: Dictionary) -> float:
	if event.has("duration"):
		return maxf(0.12, float(event.get("duration", 0.46)))
	if bool(battle_state.get("lastLaunch", false)) and bool(event.get("canLaunch", false)):
		return 1.42 if battle_last_event_launch_mode == "bounce" else 1.08
	match str(event.get("type", "")):
		"combo_attack":
			var participant_ids: Array = event.get("participantIds", [str(event.get("attackerId", ""))])
			var participant_count := maxi(1, participant_ids.size())
			return BATTLE_COMBO_ACTION_SECONDS + BATTLE_COMBO_STAGGER_SECONDS * float(participant_count - 1) + BATTLE_COMBO_RETURN_PADDING_SECONDS
		"skill_attack":
			return 0.74
		"spirit_heal":
			return 0.54
		"item_heal":
			return 0.54
		"spirit_heal_all", "spirit_poison_all":
			return 0.66
		"item_heal_all", "item_poison_all":
			return 0.66
		"spirit_poison":
			return 0.58
		"item_poison":
			return 0.58
		"capture":
			return 0.74
		"switch_pet":
			return 0.42
		"defend":
			return 0.40
		"attack":
			return 0.62
		_:
			return 0.46


func _battle_event_delays_result(event: Dictionary) -> bool:
	return ["attack", "skill_attack", "combo_attack"].has(str(event.get("type", "")))


func _battle_event_result_reveal_progress(event: Dictionary) -> float:
	var event_type := str(event.get("type", ""))
	if event_type == "combo_attack":
		var participant_ids: Array = event.get("participantIds", [str(event.get("attackerId", ""))])
		var participant_count := maxi(1, participant_ids.size())
		var last_hit_seconds := BATTLE_COMBO_STAGGER_SECONDS * float(participant_count - 1) + BATTLE_COMBO_ACTION_SECONDS * BATTLE_COMBO_APPROACH_RATIO
		var duration := _battle_event_duration(event)
		return clampf((last_hit_seconds + 0.06) / maxf(0.01, duration), 0.18, 0.88)
	if bool(event.get("canLaunch", false)):
		return BATTLE_LAUNCH_TARGET_START_RATIO
	if event_type == "attack" or event_type == "skill_attack":
		return 0.50
	return 0.0


func _battle_current_event_result_revealed() -> bool:
	if battle_current_event.is_empty() or not _battle_event_delays_result(battle_current_event):
		return true
	return _battle_current_event_progress() >= _battle_event_result_reveal_progress(battle_current_event)


func _battle_enemy_response() -> void:
	var attacker_id := BattleModel.living_enemy_id(battle_state)
	var target_id := BattleModel.random_living_ally_target_id(battle_state, attacker_id, 0)
	if attacker_id == "" or target_id == "":
		battle_state["phase"] = "command"
		_sync_battle_buttons()
		return
	battle_state = BattleModel.apply_attack(battle_state, attacker_id, target_id, 10)
	battle_state["phase"] = "enemy_action"
	battle_action_timer = 0.52
	_set_battle_message(str(battle_state.get("message", "")))
	if BattleModel.living_ally_id(battle_state) == "":
		battle_end_pending = true
		battle_action_timer = 0.72
	_sync_battle_buttons()
	queue_redraw()


func _battle_escape() -> void:
	_end_battle(true)


func _select_battle_target_at_screen_point(screen_point: Vector2) -> bool:
	if not battle_active or _battle_commands_locked() or _battle_point_overlaps_panel(screen_point):
		return false
	if not _battle_target_mode_accepts_click():
		return false
	if battle_target_mode == "player_attack_target" or battle_target_mode == "player_capture_target":
		var player_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if player_target_id == "":
			return false
		battle_selected_target_id = player_target_id
		battle_hover_target_id = player_target_id
		var player_target := BattleModel.actor_by_id(battle_state, player_target_id)
		var command_id := "capture" if battle_target_mode == "player_capture_target" else "attack"
		_set_battle_message("%s：%s" % [
			"捕捉" if command_id == "capture" else "攻击",
			str(player_target.get("name", "敌人")),
		])
		_submit_player_battle_command(command_id, player_target_id)
		queue_redraw()
		return true
	if battle_target_mode == "pet_enemy_skill":
		var pet_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if pet_target_id == "":
			return false
		battle_selected_target_id = pet_target_id
		var pet_target := BattleModel.actor_by_id(battle_state, pet_target_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(BattleModel.PET_SKILL_BUI_CHARGE, "布伊冲撞"),
			str(pet_target.get("name", "敌人")),
		])
		_submit_pet_battle_command("pet_skill", pet_target_id)
		queue_redraw()
		return true
	if battle_target_mode == "pet_enemy_attack":
		var pet_attack_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if pet_attack_target_id == "":
			return false
		battle_selected_target_id = pet_attack_target_id
		battle_hover_target_id = pet_attack_target_id
		var pet_attack_target := BattleModel.actor_by_id(battle_state, pet_attack_target_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(BattleModel.PET_SKILL_ATTACK, "攻击"),
			str(pet_attack_target.get("name", "敌人")),
		])
		_submit_pet_battle_command("attack", pet_attack_target_id)
		queue_redraw()
		return true
	if battle_target_mode == "ally_spirit_single":
		var ally_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
		if ally_id == "":
			var enemy_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
			if enemy_id != "":
				_set_battle_message("%s只能选择我方单体。" % BattleActionCatalog.label_for(BattleModel.SPIRIT_MOIST_SINGLE, "滋润精灵5"))
			return false
		battle_selected_ally_target_id = ally_id
		var ally_actor := BattleModel.actor_by_id(battle_state, ally_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(BattleModel.SPIRIT_MOIST_SINGLE, "滋润精灵5"),
			str(ally_actor.get("name", "我方")),
		])
		_submit_spirit_player_command(BattleModel.SPIRIT_MOIST_SINGLE, ally_id)
		queue_redraw()
		return true
	if battle_target_mode == "enemy_spirit_single":
		var poison_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if poison_target_id == "":
			var ally_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
			if ally_target_id != "":
				_set_battle_message("%s只能选择敌方单体。" % BattleActionCatalog.label_for(BattleModel.SPIRIT_POISON_SINGLE, "毒精灵5"))
			return false
		battle_selected_target_id = poison_target_id
		var poison_target := BattleModel.actor_by_id(battle_state, poison_target_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(BattleModel.SPIRIT_POISON_SINGLE, "毒精灵5"),
			str(poison_target.get("name", "敌人")),
		])
		_submit_spirit_player_command(BattleModel.SPIRIT_POISON_SINGLE, poison_target_id)
		queue_redraw()
		return true
	if battle_target_mode == "ally_item_single":
		var item_ally_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
		if item_ally_id == "":
			var item_enemy_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
			if item_enemy_id != "":
				_set_battle_message("%s只能选择我方单体。" % BattleActionCatalog.label_for(BattleModel.ITEM_HEAL_SINGLE, "回复药5"))
			return false
		battle_selected_ally_target_id = item_ally_id
		var item_ally_actor := BattleModel.actor_by_id(battle_state, item_ally_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(BattleModel.ITEM_HEAL_SINGLE, "回复药5"),
			str(item_ally_actor.get("name", "我方")),
		])
		_submit_item_player_command(BattleModel.ITEM_HEAL_SINGLE, item_ally_id)
		queue_redraw()
		return true
	if battle_target_mode == "enemy_item_single":
		var item_enemy_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if item_enemy_target_id == "":
			var item_ally_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
			if item_ally_target_id != "":
				_set_battle_message("%s只能选择敌方单体。" % BattleActionCatalog.label_for(BattleModel.ITEM_POISON_SINGLE, "毒粉5"))
			return false
		battle_selected_target_id = item_enemy_target_id
		var item_enemy_target := BattleModel.actor_by_id(battle_state, item_enemy_target_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(BattleModel.ITEM_POISON_SINGLE, "毒粉5"),
			str(item_enemy_target.get("name", "敌人")),
		])
		_submit_item_player_command(BattleModel.ITEM_POISON_SINGLE, item_enemy_target_id)
		queue_redraw()
		return true
	var actor_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
	if actor_id == "":
		return false
	battle_selected_target_id = actor_id
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	_set_battle_message("目标：%s" % str(actor.get("name", "敌人")))
	_sync_battle_buttons()
	queue_redraw()
	return true


func _update_battle_hover_at_screen_point(screen_point: Vector2) -> void:
	var next_enemy_id := ""
	var next_ally_id := ""
	if battle_active and not _battle_commands_locked() and not _battle_point_overlaps_panel(screen_point):
		if _battle_target_mode_selects_enemy():
			next_enemy_id = _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		elif _battle_target_mode_selects_ally():
			next_ally_id = _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
	if next_enemy_id != battle_hover_target_id or next_ally_id != battle_hover_ally_target_id:
		battle_hover_target_id = next_enemy_id
		battle_hover_ally_target_id = next_ally_id
		queue_redraw()


func _battle_actor_id_at_screen_point(screen_point: Vector2, side_filter: String = BattleModel.SIDE_ENEMY) -> String:
	var actors := _battle_actors_sorted_by_depth()
	var visual_scale := _battle_actor_visual_scale()
	var hit_radius := maxf(32.0, 48.0 * visual_scale)
	for index in range(actors.size() - 1, -1, -1):
		var actor := actors[index] as Dictionary
		if str(actor.get("side", "")) != side_filter or int(actor.get("hp", 0)) <= 0:
			continue
		var actor_screen := _world_to_screen(_battle_slot_world_position(str(actor.get("slotId", ""))))
		var hit_center := actor_screen + Vector2(0, -18.0 * visual_scale)
		if screen_point.distance_to(hit_center) <= hit_radius:
			return str(actor.get("id", ""))
	return ""


func _battle_selected_target_is_valid() -> bool:
	if battle_selected_target_id == "":
		return false
	var actor := BattleModel.actor_by_id(battle_state, battle_selected_target_id)
	return not actor.is_empty() and str(actor.get("side", "")) == BattleModel.SIDE_ENEMY and int(actor.get("hp", 0)) > 0


func _battle_selected_ally_target_is_valid() -> bool:
	if battle_selected_ally_target_id == "":
		return false
	var actor := BattleModel.actor_by_id(battle_state, battle_selected_ally_target_id)
	return not actor.is_empty() and str(actor.get("side", "")) == BattleModel.SIDE_ALLY and int(actor.get("hp", 0)) > 0


func _battle_actor_is_living_side(actor_id: String, side: String) -> bool:
	if actor_id == "":
		return false
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	return not actor.is_empty() and str(actor.get("side", "")) == side and int(actor.get("hp", 0)) > 0


func _battle_target_mode_selects_enemy() -> bool:
	return [
		"player_attack_target",
		"player_capture_target",
		"pet_enemy_attack",
		"pet_enemy_skill",
		"enemy_spirit_single",
		"enemy_item_single",
	].has(battle_target_mode)


func _battle_target_mode_selects_ally() -> bool:
	return [
		"ally_spirit_single",
		"ally_item_single",
	].has(battle_target_mode)


func _battle_target_mode_accepts_click() -> bool:
	return _battle_target_mode_selects_enemy() or _battle_target_mode_selects_ally()


func _sync_battle_target_selection() -> void:
	if not battle_active:
		battle_selected_target_id = ""
		battle_selected_ally_target_id = ""
		battle_hover_target_id = ""
		battle_hover_ally_target_id = ""
		return
	if not _battle_selected_target_is_valid():
		battle_selected_target_id = ""
	if not _battle_selected_ally_target_is_valid():
		battle_selected_ally_target_id = ""
	if battle_hover_target_id != "" and not _battle_actor_is_living_side(battle_hover_target_id, BattleModel.SIDE_ENEMY):
		battle_hover_target_id = ""
	if battle_hover_ally_target_id != "" and not _battle_actor_is_living_side(battle_hover_ally_target_id, BattleModel.SIDE_ALLY):
		battle_hover_ally_target_id = ""


func _set_battle_message(text: String) -> void:
	if battle_state.is_empty():
		return
	battle_state["message"] = text
	if battle_log_label != null:
		battle_log_label.text = text


func _sync_battle_buttons() -> void:
	if battle_command_panel != null:
		battle_command_panel.visible = battle_active
	if battle_message_panel != null:
		battle_message_panel.visible = battle_active
	if action_bar != null:
		action_bar.visible = not battle_active
	var can_command := battle_active and not _battle_commands_locked()
	if battle_active:
		_sync_battle_target_selection()
	var has_enemy := can_command and BattleModel.living_enemy_id(battle_state) != ""
	var has_ally := can_command and BattleModel.living_ally_id(battle_state) != ""
	for command_id in battle_command_buttons.keys():
		var button := battle_command_buttons[command_id] as Button
		if button != null:
			button.disabled = not can_command
			if battle_command_owner == "pet":
				match str(command_id):
					"attack":
						button.disabled = not has_enemy or battle_target_mode == "pet_enemy_skill"
					"spirit":
						button.disabled = not can_command or battle_target_mode == "pet_enemy_skill"
					"capture":
						button.disabled = not has_enemy
					"help":
						button.disabled = not can_command
					_:
						button.disabled = true
			elif battle_command_owner == "spirit":
				match str(command_id):
					"attack":
						button.disabled = not has_ally
					"spirit":
						button.disabled = not has_ally
					"capture":
						button.disabled = not has_enemy
					"defend":
						button.disabled = not has_enemy
					"help":
						button.disabled = not can_command
					_:
						button.disabled = true
			elif battle_command_owner == "item":
				match str(command_id):
					"attack":
						button.disabled = not has_ally or not BattleModel.has_item(battle_state, BattleModel.ITEM_HEAL_ALL)
					"spirit":
						button.disabled = not has_ally or not BattleModel.has_item(battle_state, BattleModel.ITEM_HEAL_SINGLE)
					"capture":
						button.disabled = not has_enemy or not BattleModel.has_item(battle_state, BattleModel.ITEM_POISON_SINGLE)
					"defend":
						button.disabled = not has_enemy or not BattleModel.has_item(battle_state, BattleModel.ITEM_POISON_ALL)
					"help":
						button.disabled = not can_command
					_:
						button.disabled = true
			elif battle_command_owner == "switch_pet":
				if str(command_id) == "run":
					button.disabled = not can_command
				elif battle_switch_pet_button_pet_ids.has(command_id):
					var pet_id := str(battle_switch_pet_button_pet_ids.get(command_id, ""))
					button.disabled = not BattleModel.is_pet_switchable(battle_state, pet_id)
				else:
					button.disabled = true
			else:
				match str(command_id):
					"attack", "capture":
						button.disabled = not has_enemy
					"spirit":
						button.disabled = not has_ally
					"switch_pet":
						button.disabled = BattleModel.switchable_pet_entries(battle_state).is_empty()


func _battle_commands_locked() -> bool:
	if not battle_active:
		return true
	return battle_action_timer > 0.0 or not battle_event_queue.is_empty() or battle_enemy_response_pending or battle_end_pending or str(battle_state.get("phase", "command")) != "command"


func _update_battle_animation(delta: float) -> void:
	_update_battle_float_texts(delta)
	if battle_action_timer <= 0.0:
		return
	battle_action_timer = maxf(0.0, battle_action_timer - delta)
	if battle_action_timer <= 0.0:
		battle_state = BattleModel.reset_action_states(battle_state)
		battle_current_event.clear()
		battle_current_event_duration = 0.0
		battle_current_event_actor_snapshots.clear()
		_sync_battle_target_selection()
		if battle_end_pending:
			_end_battle(true)
			return
		if not battle_event_queue.is_empty():
			_play_next_battle_event()
			return
		if battle_enemy_response_pending:
			battle_enemy_response_pending = false
			_battle_enemy_response()
			return
		battle_state["phase"] = "command"
		_set_battle_command_owner("player")
		battle_target_mode = "enemy"
		battle_pending_player_command.clear()
		battle_pending_pet_command.clear()
		battle_pending_item_id = ""
		battle_state["guardingActorIds"] = []
		battle_selected_target_id = ""
		battle_selected_ally_target_id = ""
		battle_hover_target_id = ""
		battle_hover_ally_target_id = ""
		_sync_battle_buttons()


func _update_battle_float_texts(delta: float) -> void:
	for index in range(battle_float_texts.size() - 1, -1, -1):
		var item := battle_float_texts[index] as Dictionary
		item["age"] = float(item.get("age", 0.0)) + delta
		if float(item.get("age", 0.0)) >= float(item.get("duration", 0.95)):
			battle_float_texts.remove_at(index)
		else:
			battle_float_texts[index] = item


func _open_interaction_dialog(item: Dictionary) -> void:
	active_dialog_interaction = item.duplicate(true)
	if player != null:
		player.face_direction(InteractionModel.marker_world_position(map_data, item) - player.global_position)
	_update_dialog_text()
	dialog_panel.visible = true
	_layout_hud()


func _close_dialog() -> void:
	if dialog_panel != null:
		dialog_panel.visible = false
	active_dialog_interaction.clear()


func _dialog_is_open() -> bool:
	return dialog_panel != null and dialog_panel.visible


func _confirm_dialog_action() -> void:
	if active_dialog_interaction.is_empty():
		return
	if _has_incomplete_task(active_dialog_interaction):
		_mark_task_completed(active_dialog_interaction)
		_update_dialog_text()
	else:
		_close_dialog()


func _update_dialog_text() -> void:
	if active_dialog_interaction.is_empty():
		return
	dialog_name_label.text = str(active_dialog_interaction.get("name", "交互"))
	dialog_body_label.text = _dialog_body_for(active_dialog_interaction)
	dialog_option_button.text = str(active_dialog_interaction.get("option", "知道了"))
	if not _has_incomplete_task(active_dialog_interaction):
		dialog_option_button.text = "知道了"


func _dialog_body_for(item: Dictionary) -> String:
	var field := "completedDialog" if _is_task_completed(item) else "dialog"
	var lines: Array = item.get(field, item.get("dialog", []))
	if lines.is_empty():
		return "%s：暂时没有更多内容。" % str(item.get("name", "这里"))
	var text_parts: Array[String] = []
	for line in lines:
		text_parts.append(str(line))
	return "\n".join(text_parts)


func _has_incomplete_task(item: Dictionary) -> bool:
	var task_key := str(item.get("taskKey", ""))
	return task_key != "" and not bool(task_flags.get(task_key, false))


func _is_task_completed(item: Dictionary) -> bool:
	var task_key := str(item.get("taskKey", ""))
	return task_key != "" and bool(task_flags.get(task_key, false))


func _mark_task_completed(item: Dictionary) -> void:
	var task_key := str(item.get("taskKey", ""))
	if task_key != "":
		task_flags[task_key] = true


func _current_task_text() -> String:
	for value in InteractionModel.interaction_points(map_data):
		var item := value as Dictionary
		var task_key := str(item.get("taskKey", ""))
		if task_key == "":
			continue
		if bool(task_flags.get(task_key, false)):
			return str(item.get("completedTaskText", "已完成"))
		return str(item.get("taskText", "继续探索"))
	return "探索%s" % str(map_data.get("name", "当前地图"))


func _toggle_pet_ring() -> void:
	_set_pet_follow_enabled(not pet_follow_enabled)


func _set_pet_follow_enabled(enabled: bool) -> void:
	pet_follow_enabled = enabled
	if pet == null:
		return
	pet.visible = enabled
	if enabled:
		pet.global_position = player.global_position + Vector2(-56, 36)
		pet_follow_points.clear()
		pet_follow_points.append(pet.global_position)
		pet_follow_points.append(player.global_position)
		pet_follow_index = 0
		pet.set_follow_target(pet.global_position)
		if ring_button != null:
			ring_button.text = "收宠"
	else:
		pet.clear_follow_target()
		pet_follow_points.clear()
		pet_follow_index = 0
		if ring_button != null:
			ring_button.text = "驯宠戒"


func _update_pet_follow() -> void:
	if not pet_follow_enabled or pet == null:
		return
	if pet_follow_points.is_empty() or player.global_position.distance_to(pet_follow_points[pet_follow_points.size() - 1]) > 10.0:
		pet_follow_points.append(player.global_position)
	var max_follow_index: int = maxi(0, pet_follow_points.size() - 8)
	if pet_follow_index > max_follow_index:
		pet_follow_index = max_follow_index
	if pet.global_position.distance_to(pet_follow_points[pet_follow_index]) < 8.0 and pet_follow_index < max_follow_index:
		pet_follow_index += 1
	pet.set_follow_target(pet_follow_points[pet_follow_index])
	if pet_follow_index > 12:
		var remove_count: int = mini(pet_follow_index - 6, pet_follow_points.size() - 8)
		for _i in range(remove_count):
			pet_follow_points.pop_front()
		pet_follow_index -= remove_count


func _screen_to_world(screen_point: Vector2) -> Vector2:
	if game_camera == null:
		return screen_point
	var center := game_camera.get_screen_center_position()
	var offset := screen_point - get_viewport_rect().size * 0.5
	return center + Vector2(
		offset.x * game_camera.zoom.x,
		offset.y * game_camera.zoom.y
	)


func _world_to_screen(world_point: Vector2) -> Vector2:
	if game_camera == null:
		return world_point
	var center := game_camera.get_screen_center_position()
	var offset := world_point - center
	return get_viewport_rect().size * 0.5 + Vector2(
		offset.x / game_camera.zoom.x,
		offset.y / game_camera.zoom.y
	)


func _stop_auto_move() -> void:
	player.clear_move_target()
	_clear_navigation_state()


func _clear_navigation_state() -> void:
	current_path_cells.clear()
	current_path_is_direct = false
	has_target_marker = false
	has_target_cell = false
	_clear_pending_interaction()


func _is_ui_point(point: Vector2) -> bool:
	for control in [top_panel, side_panel, action_bar, dialog_panel, encounter_panel, battle_command_panel, battle_message_panel]:
		if control != null and control.visible:
			var rect := Rect2(control.global_position, control.size)
			if rect.has_point(point):
				return true
	return false


func _layout_hud() -> void:
	if hud_root == null:
		return

	var viewport_size := _layout_size()
	hud_root.position = Vector2.ZERO
	hud_root.size = viewport_size

	var is_phone_shape := _is_phone_shape(viewport_size)
	var margin := 18.0
	var top_max_width := 300.0 if battle_active else 520.0
	var top_width: float = minf(viewport_size.x - margin * 2.0, top_max_width)
	top_panel.position = Vector2(margin, margin)
	top_panel.size = Vector2(top_width, 56)

	if battle_active:
		side_panel.visible = false
		action_bar.visible = false
	elif is_phone_shape:
		side_panel.visible = false
		action_bar.visible = true
		if viewport_size.y > viewport_size.x:
			action_bar.position = Vector2(maxf(margin, (viewport_size.x - ACTION_BAR_SIZE.x) * 0.5), viewport_size.y - 104.0)
		else:
			action_bar.position = Vector2(margin, viewport_size.y - 104.0)
		action_bar.size = ACTION_BAR_SIZE
	else:
		side_panel.visible = true
		action_bar.visible = true
		side_panel.position = Vector2(viewport_size.x - 286.0, margin)
		side_panel.size = Vector2(268, 128)
		action_bar.position = Vector2(viewport_size.x - 224.0, viewport_size.y - 104.0)
		action_bar.size = ACTION_BAR_SIZE

	var dialog_width: float = minf(viewport_size.x - margin * 2.0, 560.0)
	var dialog_height := DIALOG_PANEL_HEIGHT
	var reserved_bottom := 116.0 if is_phone_shape else 24.0
	dialog_panel.position = Vector2(
		(viewport_size.x - dialog_width) * 0.5,
		maxf(margin + 68.0, viewport_size.y - dialog_height - reserved_bottom)
	)
	dialog_panel.size = Vector2(dialog_width, dialog_height)

	encounter_panel.position = Vector2(
		(viewport_size.x - dialog_width) * 0.5,
		maxf(margin + 68.0, viewport_size.y - dialog_height - reserved_bottom)
	)
	encounter_panel.size = Vector2(dialog_width, dialog_height)

	var battle_width: float = minf(viewport_size.x - margin * 2.0, 390.0)
	var battle_height := _battle_command_panel_height(viewport_size)
	var battle_x := viewport_size.x - battle_width - margin
	var battle_y := margin
	if battle_x < top_panel.position.x + top_panel.size.x + margin:
		battle_y = top_panel.position.y + top_panel.size.y + 10.0
	battle_command_panel.position = Vector2(
		maxf(margin, battle_x),
		battle_y
	)
	battle_command_panel.size = Vector2(battle_width, battle_height)
	battle_command_panel.visible = battle_active

	var message_width: float = minf(viewport_size.x - margin * 2.0, 390.0 if is_phone_shape else 560.0)
	var message_height := 66.0
	battle_message_panel.position = Vector2(margin, viewport_size.y - message_height - margin)
	battle_message_panel.size = Vector2(message_width, message_height)
	battle_message_panel.visible = battle_active

	if player != null:
		player.set_movement_bounds(_player_movement_bounds())
	if game_camera != null:
		_update_camera_limits()
		_update_camera_position(true)
	queue_redraw()


func _update_hud_text() -> void:
	var viewport_size := _layout_size()
	var is_phone_shape := _is_phone_shape(viewport_size)
	var layout_name := "手机" if is_phone_shape else "PC"
	var move_name := _movement_status_name()
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var target_text := "无"
	if has_target_cell:
		target_text = "%d,%d" % [target_cell.x, target_cell.y]
	if battle_active:
		status_label.text = "万兽纪元  |  %s" % [move_name]
	elif is_phone_shape:
		status_label.text = "万兽纪元  |  %s" % [move_name]
	else:
		status_label.text = "万兽纪元  |  %s  |  %s  |  %s" % [str(map_data.get("name", "未知地图")), layout_name, move_name]
	if has_pending_interaction:
		target_text = str(pending_interaction.get("name", "交互点"))
	detail_label.text = "坐标  %d,%d\n目标  %s\n任务  -  %s" % [player_cell.x, player_cell.y, target_text, _current_task_text()]


func _layout_size() -> Vector2:
	return get_viewport_rect().size


func _is_phone_shape(size: Vector2) -> bool:
	return minf(size.x, size.y) < 520.0 or size.x < 760.0 or size.y > size.x


func _battle_command_panel_height(size: Vector2) -> float:
	return 170.0 if size.y >= 460.0 else 158.0


func _movement_status_name() -> String:
	if battle_active:
		return "战斗中"
	if encounter_active:
		return "遭遇中"
	if _dialog_is_open():
		return "对话中"
	if has_pending_interaction:
		return "前往%s" % str(pending_interaction.get("name", "目标"))
	if not player.is_auto_moving():
		return "点击地图移动"
	if current_path_is_direct:
		return "移动中"
	return "自动寻路中"


func _update_camera_limits() -> void:
	if game_camera == null or map_data.is_empty():
		return
	game_camera.limit_left = -10000000
	game_camera.limit_top = -10000000
	game_camera.limit_right = 10000000
	game_camera.limit_bottom = 10000000


func _update_camera_position(force: bool) -> void:
	if game_camera == null or player == null:
		return
	game_camera.global_position = _clamped_camera_center(player.global_position)
	if force:
		game_camera.reset_smoothing()


func _clamped_camera_center(target: Vector2) -> Vector2:
	if map_data.is_empty():
		return target
	var bounds := _camera_limit_bounds()
	var half_view := get_viewport_rect().size * 0.5
	var min_center := bounds.position + half_view
	var max_center := bounds.position + bounds.size - half_view
	var center := target
	if min_center.x <= max_center.x:
		center.x = clampf(target.x, min_center.x, max_center.x)
	else:
		center.x = bounds.get_center().x
	if min_center.y <= max_center.y:
		center.y = clampf(target.y, min_center.y, max_center.y)
	else:
		center.y = bounds.get_center().y
	return center


func _camera_center_is_inside_limits(center: Vector2) -> bool:
	var expected := _clamped_camera_center(center)
	return center.distance_to(expected) <= 0.1


func _camera_limit_bounds() -> Rect2:
	return _map_world_bounds().grow(80.0)


func _world_background_rect(viewport_size: Vector2) -> Rect2:
	if map_data.is_empty():
		return Rect2(Vector2.ZERO, viewport_size)
	return _map_world_bounds().grow(maxf(viewport_size.x, viewport_size.y))


func _draw_isometric_map() -> void:
	if map_data.is_empty():
		return

	var size := IsoMapModel.grid_size(map_data)
	for y in range(size.y):
		for x in range(size.x):
			var cell := Vector2i(x, y)
			var center := IsoMapModel.grid_to_world(map_data, cell)
			var is_walkable := IsoMapModel.is_walkable(map_data, cell)
			var parity := float((x + y) % 2) * 0.035
			var fill := Color(0.25 + parity, 0.36 + parity, 0.31 + parity, 0.94)
			var border := Color(0.12, 0.19, 0.17, 0.75)
			if not is_walkable:
				fill = Color(0.18, 0.19, 0.18, 0.96)
				border = Color(0.50, 0.43, 0.32, 0.85)
			_draw_iso_tile(center, fill, border)

		for cell in current_path_cells:
			_draw_iso_tile(IsoMapModel.grid_to_world(map_data, cell), Color(0.96, 0.75, 0.25, 0.24), Color(0.98, 0.82, 0.32, 0.38))

	_draw_encounter_zones()
	_draw_decor_cells()
	_draw_interaction_points()
	_draw_path_line()


func _draw_battle_scene() -> void:
	var rect := _viewport_world_rect()
	draw_rect(rect, Color(0.32, 0.36, 0.32), true)
	_draw_battle_floor_noise(rect)
	if _battle_should_draw_formation_grid():
		_draw_battle_formation_grid(rect)
	var launched_draw_queue: Array[Dictionary] = []
	for value in _battle_actors_sorted_by_depth():
		var actor := value as Dictionary
		if _battle_actor_is_current_launch_target(str(actor.get("id", ""))):
			launched_draw_queue.append(actor)
		else:
			_draw_battle_actor(actor)
	for launched_actor in launched_draw_queue:
		_draw_battle_actor(launched_actor)
	_draw_battle_float_texts()
	if _battle_should_draw_formation_grid():
		_draw_battle_formation_slot_anchors()


func _battle_actors_sorted_by_depth() -> Array:
	var actors: Array = battle_state.get("actors", []).duplicate(true)
	for index in range(actors.size()):
		for next_index in range(index + 1, actors.size()):
			var current := actors[index] as Dictionary
			var next := actors[next_index] as Dictionary
			var current_y := _battle_slot_world_position(str(current.get("slotId", ""))).y
			var next_y := _battle_slot_world_position(str(next.get("slotId", ""))).y
			if next_y < current_y:
				actors[index] = next
				actors[next_index] = current
	return actors


func _draw_battle_floor_noise(rect: Rect2) -> void:
	var floor_rect := rect
	var spots := [
		Vector2(0.07, 0.17),
		Vector2(0.16, 0.54),
		Vector2(0.24, 0.34),
		Vector2(0.34, 0.78),
		Vector2(0.46, 0.22),
		Vector2(0.54, 0.58),
		Vector2(0.64, 0.38),
		Vector2(0.74, 0.70),
		Vector2(0.84, 0.18),
		Vector2(0.92, 0.52),
	]
	for index in range(spots.size()):
		var spot := spots[index] as Vector2
		var point := floor_rect.position + Vector2(floor_rect.size.x * spot.x, floor_rect.size.y * spot.y)
		var radius := 2.0 + float(index % 3)
		draw_circle(point, radius, Color(0.18, 0.24, 0.21, 0.18))
	var crack_color := Color(0.20, 0.25, 0.22, 0.14)
	for index in range(5):
		var start := floor_rect.position + Vector2(floor_rect.size.x * (0.10 + float(index) * 0.18), floor_rect.size.y * 0.10)
		var end := start + Vector2(floor_rect.size.x * 0.18, floor_rect.size.y * 0.30)
		draw_line(start, end, crack_color, 1.0, true)


func _battle_should_draw_formation_grid() -> bool:
	return battle_active and [
		"local_formation_preview_battle",
		"local_stat_formula_test_battle",
	].has(str(battle_state.get("id", "")))


func _draw_battle_formation_grid(rect: Rect2) -> void:
	var viewport_size := _layout_size()
	var origin := _battle_grid_origin(viewport_size)
	var lane_step := _battle_grid_lane_step(viewport_size)
	var rank_step := _battle_grid_rank_step(viewport_size)
	var line_alpha := 0.22
	var lane_color := Color(0.93, 0.75, 0.35, line_alpha)
	var rank_color := Color(0.48, 0.68, 0.62, line_alpha * 0.75)
	for rank in range(-3, 8):
		var start := _screen_to_world(origin + rank_step * float(rank) + lane_step * -1.0)
		var end := _screen_to_world(origin + rank_step * float(rank) + lane_step * 7.0)
		draw_line(start, end, lane_color, 1.0, true)
	for lane in range(-1, 8):
		var start := _screen_to_world(origin + lane_step * float(lane) + rank_step * -3.0)
		var end := _screen_to_world(origin + lane_step * float(lane) + rank_step * 7.0)
		draw_line(start, end, rank_color, 1.0, true)


func _draw_battle_formation_slot_anchors() -> void:
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		var anchor := _battle_slot_world_position(str(actor.get("slotId", "")))
		draw_circle(anchor, 5.0, Color(0.08, 0.10, 0.08, 0.72))
		draw_circle(anchor, 3.0, Color(1.0, 0.88, 0.25, 0.94))


func _draw_battle_actor(actor: Dictionary) -> void:
	actor = _battle_actor_for_visual_draw(actor)
	var pos := _battle_slot_world_position(str(actor.get("slotId", "")))
	var actor_id := str(actor.get("id", ""))
	var side := str(actor.get("side", ""))
	var kind := str(actor.get("kind", ""))
	var state := str(actor.get("actionState", "idle"))
	var launched_active := state == "launched" and _battle_actor_is_current_launch_target(actor_id)
	if state == "launched" and not launched_active:
		return
	var visual_scale := _battle_actor_visual_scale()
	var launch_rotation := _battle_launched_actor_rotation(actor_id) if launched_active else 0.0
	pos += _battle_actor_event_offset(actor, pos, visual_scale)
	var large_formation: bool = (battle_state.get("actors", []) as Array).size() > 10
	var show_actor_name := not large_formation or str(battle_state.get("id", "")) == "local_stat_formula_test_battle"
	var compact_labels := _layout_size().y < 460.0
	var hp_offset := (-42.0 if large_formation else (-54.0 if compact_labels else -82.0)) * visual_scale
	var name_offset := (-70.0 if compact_labels else -94.0) * visual_scale
	if state == "attack":
		pos += (Vector2(-22, -12) if side == BattleModel.SIDE_ALLY else Vector2(22, 12)) * visual_scale
	elif state == "combo":
		pos += (Vector2(-30, -18) if side == BattleModel.SIDE_ALLY else Vector2(30, 18)) * visual_scale
	elif state == "skill":
		pos += (Vector2(-36, -22) if side == BattleModel.SIDE_ALLY else Vector2(36, 22)) * visual_scale
	elif state == "spirit":
		pos += Vector2(-18, -18) * visual_scale
	elif state == "capture":
		pos += Vector2(-14, -20) * visual_scale
	elif state == "hit":
		pos += Vector2(sin(battle_action_timer * 80.0) * 5.0 * visual_scale, 0)
	elif state == "launched":
		pos += _battle_launched_actor_offset(actor, visual_scale)
	elif state == "down" or state == "captured":
		pos += Vector2(0, 16) * visual_scale
	var alpha := 1.0 if launched_active else (0.26 if state == "captured" else (0.32 if state == "down" else 1.0))
	draw_circle(pos + Vector2(0, 28) * visual_scale, 28.0 * visual_scale, Color(0.0, 0.0, 0.0, 0.20 * alpha))
	if _battle_target_mode_selects_enemy() and str(actor.get("id", "")) == battle_hover_target_id and str(actor.get("side", "")) == BattleModel.SIDE_ENEMY and int(actor.get("hp", 0)) > 0:
		_draw_battle_target_ring(pos, visual_scale)
	if _battle_target_mode_selects_ally() and str(actor.get("id", "")) == battle_hover_ally_target_id and str(actor.get("side", "")) == BattleModel.SIDE_ALLY and int(actor.get("hp", 0)) > 0:
		_draw_battle_target_ring(pos, visual_scale, Color(0.50, 1.0, 0.58, 0.96))
	if BattleModel.is_actor_guarding(battle_state, actor_id) and int(actor.get("hp", 0)) > 0:
		_draw_battle_guard_ring(pos, visual_scale)
	var body_color := Color(0.20, 0.53, 0.85, alpha)
	var trim_color := Color(1.0, 0.86, 0.40, alpha)
	if kind == "pet":
		body_color = Color(0.45, 0.77, 0.48, alpha)
		trim_color = Color(0.88, 1.0, 0.58, alpha)
	elif kind == "wild_pet":
		body_color = Color(0.89, 0.48, 0.28, alpha)
		trim_color = Color(1.0, 0.78, 0.36, alpha)
	elif kind == "player" and actor_id == BattleModel.PLAYER_ACTOR_ID:
		body_color = Color(0.78, 0.24, 0.23, alpha)
		trim_color = Color(1.0, 0.88, 0.32, alpha)
	if kind == "player":
		draw_rect(Rect2(pos + Vector2(-19, -38) * visual_scale, Vector2(38, 56) * visual_scale), body_color, true)
		draw_circle(pos + Vector2(0, -48) * visual_scale, 13.0 * visual_scale, Color(0.96, 0.72, 0.46, alpha))
		draw_line(pos + Vector2(-18, -8) * visual_scale, pos + Vector2(18, -8) * visual_scale, trim_color, 4.0 * visual_scale, true)
	elif kind == "pet":
		var pet_body_center := pos + Vector2(0, -14) * visual_scale
		draw_circle(pet_body_center, 25.0 * visual_scale, body_color)
		draw_polygon(PackedVector2Array([
			pet_body_center + _battle_rotated_visual_offset(Vector2(-16, -21), visual_scale, launch_rotation),
			pet_body_center + _battle_rotated_visual_offset(Vector2(-4, -44), visual_scale, launch_rotation),
			pet_body_center + _battle_rotated_visual_offset(Vector2(4, -21), visual_scale, launch_rotation),
		]), PackedColorArray([trim_color, trim_color, trim_color]))
		var pet_eye := Vector2(-12, -18) if side == BattleModel.SIDE_ALLY else Vector2(12, -18)
		draw_circle(pet_body_center + _battle_rotated_visual_offset(pet_eye - Vector2(0, -14), visual_scale, launch_rotation), 4.0 * visual_scale, Color(0.10, 0.16, 0.14, alpha))
	else:
		var wild_body_center := pos + Vector2(0, -18) * visual_scale
		draw_circle(wild_body_center, 27.0 * visual_scale, body_color)
		draw_circle(wild_body_center + _battle_rotated_visual_offset(Vector2(-10, -5), visual_scale, launch_rotation), 4.0 * visual_scale, Color(0.10, 0.13, 0.12, alpha))
		draw_circle(wild_body_center + _battle_rotated_visual_offset(Vector2(10, -5), visual_scale, launch_rotation), 4.0 * visual_scale, Color(0.10, 0.13, 0.12, alpha))
		draw_line(
			wild_body_center + _battle_rotated_visual_offset(Vector2(-20, 18), visual_scale, launch_rotation),
			wild_body_center + _battle_rotated_visual_offset(Vector2(20, 18), visual_scale, launch_rotation),
			trim_color,
			4.0 * visual_scale,
			true
		)
	if int(actor.get("hp", 0)) > 0 or launched_active:
		var hp_actor := actor
		if launched_active:
			hp_actor = actor.duplicate(true)
			hp_actor["hp"] = maxi(1, int(actor.get("launchHpBefore", actor.get("maxHp", 1))))
		_draw_battle_hp_bar(hp_actor, pos + Vector2(0, hp_offset), alpha, visual_scale)
	if show_actor_name:
		var font := ThemeDB.fallback_font
		draw_string(font, pos + Vector2(-46.0 * visual_scale, name_offset), str(actor.get("name", "")), HORIZONTAL_ALIGNMENT_CENTER, 92.0 * visual_scale, maxi(10, int(round(15.0 * visual_scale))), Color(0.96, 0.93, 0.80, alpha))


func _battle_actor_for_visual_draw(actor: Dictionary) -> Dictionary:
	if _battle_current_event_result_revealed() or not _battle_event_delays_result(battle_current_event):
		return actor
	var actor_id := str(actor.get("id", ""))
	if actor_id == "" or actor_id != str(battle_current_event.get("targetId", "")):
		return actor
	var snapshot = battle_current_event_actor_snapshots.get(actor_id, {})
	if snapshot is Dictionary:
		var snapshot_actor := snapshot as Dictionary
		if not snapshot_actor.is_empty():
			return snapshot_actor.duplicate(true)
	return actor


func _draw_battle_float_texts() -> void:
	var font := ThemeDB.fallback_font
	for value in battle_float_texts:
		var item := value as Dictionary
		var age := float(item.get("age", 0.0))
		if age < 0.0:
			continue
		var duration := maxf(0.01, float(item.get("duration", 0.95)))
		var progress := clampf(age / duration, 0.0, 1.0)
		var color := item.get("color", Color(1.0, 0.85, 0.25, 1.0)) as Color
		color.a *= 1.0 - progress * 0.82
		var position := item.get("position", Vector2.ZERO) as Vector2
		position += Vector2(0, -38.0 * progress)
		var text := str(item.get("text", ""))
		draw_string(font, position + Vector2(-44, 0), text, HORIZONTAL_ALIGNMENT_CENTER, 88.0, 21, Color(0.08, 0.08, 0.06, color.a * 0.85))
		draw_string(font, position + Vector2(-45, -1), text, HORIZONTAL_ALIGNMENT_CENTER, 90.0, 21, color)


func _draw_battle_target_ring(pos: Vector2, visual_scale: float, color: Color = Color(1.0, 0.78, 0.20, 0.96)) -> void:
	var center := pos + Vector2(0, 28) * visual_scale
	var radius := 32.0 * visual_scale
	draw_arc(center, radius, 0.0, PI * 2.0, 48, color, maxf(2.0, 3.0 * visual_scale), true)
	draw_arc(center, radius + 6.0 * visual_scale, -0.70, 0.70, 12, color, maxf(2.0, 2.5 * visual_scale), true)
	draw_arc(center, radius + 6.0 * visual_scale, PI - 0.70, PI + 0.70, 12, color, maxf(2.0, 2.5 * visual_scale), true)


func _draw_battle_guard_ring(pos: Vector2, visual_scale: float) -> void:
	var center := pos + Vector2(0, -10) * visual_scale
	var radius := 36.0 * visual_scale
	var color := Color(0.48, 0.82, 1.0, 0.56)
	draw_arc(center, radius, -0.2, PI + 0.2, 24, color, maxf(2.0, 4.0 * visual_scale), true)
	draw_line(center + Vector2(-22, 6) * visual_scale, center + Vector2(22, 6) * visual_scale, color, maxf(2.0, 3.0 * visual_scale), true)


func _battle_actor_is_current_launch_target(actor_id: String) -> bool:
	return battle_last_event_launch and not battle_current_event.is_empty() and actor_id == str(battle_current_event.get("targetId", ""))


func _battle_rotated_visual_offset(offset: Vector2, visual_scale: float, rotation_angle: float) -> Vector2:
	return offset.rotated(rotation_angle) * visual_scale


func _battle_actor_event_offset(actor: Dictionary, base_pos: Vector2, visual_scale: float) -> Vector2:
	if battle_current_event.is_empty():
		return Vector2.ZERO
	var event_type := str(battle_current_event.get("type", ""))
	if not ["attack", "skill_attack", "combo_attack"].has(event_type):
		return Vector2.ZERO
	var actor_id := str(actor.get("id", ""))
	var participant_ids: Array = battle_current_event.get("participantIds", [str(battle_current_event.get("attackerId", ""))])
	if participant_ids.is_empty():
		participant_ids = [str(battle_current_event.get("attackerId", ""))]
	if not participant_ids.has(actor_id):
		return Vector2.ZERO
	var target := BattleModel.actor_by_id(battle_state, str(battle_current_event.get("targetId", "")))
	if target.is_empty():
		return Vector2.ZERO
	var progress := _battle_current_event_progress()
	var lunge := sin(progress * PI)
	if battle_last_event_launch and event_type != "combo_attack":
		lunge = _battle_launch_attacker_lunge(progress)
	elif event_type == "combo_attack":
		lunge = _battle_combo_participant_lunge(actor_id, participant_ids, progress)
		if lunge <= 0.0:
			return Vector2.ZERO
	var target_pos := _battle_slot_world_position(str(target.get("slotId", "")))
	var contact_offset := _battle_melee_contact_offset(base_pos, target_pos, visual_scale)
	return contact_offset * lunge


func _battle_launched_actor_offset(actor: Dictionary, visual_scale: float) -> Vector2:
	if battle_current_event.is_empty() or str(actor.get("id", "")) != str(battle_current_event.get("targetId", "")):
		return Vector2.ZERO
	var progress := _battle_launch_target_progress(_battle_current_event_progress())
	if progress <= 0.0:
		return Vector2.ZERO
	var attacker := BattleModel.actor_by_id(battle_state, str(battle_current_event.get("attackerId", "")))
	var target_pos := _battle_slot_world_position(str(actor.get("slotId", "")))
	var attacker_pos := _battle_slot_world_position(str(attacker.get("slotId", ""))) if not attacker.is_empty() else target_pos + Vector2(-1, -1)
	var direction := (target_pos - attacker_pos).normalized()
	if direction.length() <= 0.01:
		direction = Vector2(-1, -0.4).normalized()
	if battle_last_event_launch_mode == "bounce":
		return _battle_bounce_launch_offset(target_pos, direction, progress, visual_scale)
	return _battle_straight_launch_offset(direction, progress, visual_scale)


func _battle_launched_actor_rotation(actor_id: String) -> float:
	if not _battle_actor_is_current_launch_target(actor_id):
		return 0.0
	var progress := _battle_launch_target_progress(_battle_current_event_progress())
	return _battle_launch_rotation_for_progress(progress)


func _battle_launch_rotation_for_progress(progress: float) -> float:
	if progress <= 0.0:
		return 0.0
	if battle_last_event_launch_mode == "bounce":
		return -TAU * 3.4 * _smooth_unit(progress)
	return -0.24 * sin(progress * PI)


func _battle_straight_launch_offset(direction: Vector2, progress: float, visual_scale: float) -> Vector2:
	var distance := _battle_launch_exit_distance() * _smooth_unit(progress)
	var lift := -76.0 * visual_scale * sin(progress * PI)
	return direction * distance + Vector2(0, lift)


func _battle_bounce_launch_offset(target_pos: Vector2, direction: Vector2, progress: float, visual_scale: float) -> Vector2:
	var edge_distance := maxf(190.0, _battle_distance_to_viewport_edge(target_pos, direction) - 28.0 * visual_scale)
	var roll_direction := _battle_launch_edge_roll_direction(target_pos, direction, edge_distance)
	var roll_distance := 430.0 * visual_scale
	var exit_direction := (direction * 0.82 + roll_direction * 0.46).normalized()
	var exit_distance := _battle_launch_exit_distance() * 0.66
	if progress < BATTLE_BOUNCE_EDGE_RATIO:
		var edge_progress := _smooth_unit(progress / BATTLE_BOUNCE_EDGE_RATIO)
		var first_arc := -64.0 * visual_scale * sin(edge_progress * PI)
		return direction * edge_distance * edge_progress + Vector2(0, first_arc)
	if progress < BATTLE_BOUNCE_ROLL_RATIO:
		var roll_progress := _smooth_unit((progress - BATTLE_BOUNCE_EDGE_RATIO) / (BATTLE_BOUNCE_ROLL_RATIO - BATTLE_BOUNCE_EDGE_RATIO))
		var edge_offset := direction * edge_distance
		var edge_scrape := direction * 16.0 * visual_scale * absf(sin(roll_progress * PI * 3.0))
		var roll_hop := Vector2(0, 54.0 * visual_scale * absf(sin(roll_progress * PI * 4.0)) * (1.0 - roll_progress * 0.18))
		return edge_offset + roll_direction * roll_distance * roll_progress + edge_scrape + roll_hop
	var exit_progress := _smooth_unit((progress - BATTLE_BOUNCE_ROLL_RATIO) / (1.0 - BATTLE_BOUNCE_ROLL_RATIO))
	var final_hop := Vector2(0, 38.0 * visual_scale * absf(sin(exit_progress * PI * 3.0)) * (1.0 - exit_progress))
	return direction * edge_distance + roll_direction * roll_distance + exit_direction * exit_distance * exit_progress + final_hop


func _battle_launch_edge_roll_direction(target_pos: Vector2, direction: Vector2, edge_distance: float) -> Vector2:
	var viewport_rect := _viewport_world_rect()
	var hit_pos := target_pos + direction * edge_distance
	var center := viewport_rect.get_center()
	var distance_to_vertical_edge := minf(absf(hit_pos.x - viewport_rect.position.x), absf(viewport_rect.position.x + viewport_rect.size.x - hit_pos.x))
	var distance_to_horizontal_edge := minf(absf(hit_pos.y - viewport_rect.position.y), absf(viewport_rect.position.y + viewport_rect.size.y - hit_pos.y))
	if distance_to_horizontal_edge <= distance_to_vertical_edge:
		return Vector2(1.0 if hit_pos.x < center.x else -1.0, 0.0)
	return Vector2(0.0, 1.0 if hit_pos.y < center.y else -1.0)


func _battle_launch_exit_distance() -> float:
	var viewport_rect := _viewport_world_rect()
	return maxf(viewport_rect.size.x, viewport_rect.size.y) + 360.0


func _battle_distance_to_viewport_edge(from_pos: Vector2, direction: Vector2) -> float:
	var viewport_rect := _viewport_world_rect()
	var margin := 12.0
	var candidates: Array[float] = []
	if absf(direction.x) > 0.001:
		var x_edge := viewport_rect.position.x + margin if direction.x < 0.0 else viewport_rect.position.x + viewport_rect.size.x - margin
		var x_distance := (x_edge - from_pos.x) / direction.x
		if x_distance > 0.0:
			candidates.append(x_distance)
	if absf(direction.y) > 0.001:
		var y_edge := viewport_rect.position.y + margin if direction.y < 0.0 else viewport_rect.position.y + viewport_rect.size.y - margin
		var y_distance := (y_edge - from_pos.y) / direction.y
		if y_distance > 0.0:
			candidates.append(y_distance)
	if candidates.is_empty():
		return maxf(viewport_rect.size.x, viewport_rect.size.y) * 0.35
	var result := candidates[0]
	for value in candidates:
		result = minf(result, value)
	return result


func _battle_current_event_progress() -> float:
	if battle_current_event_duration <= 0.0:
		return 1.0
	return clampf(1.0 - battle_action_timer / battle_current_event_duration, 0.0, 1.0)


func _battle_melee_contact_offset(from_pos: Vector2, target_pos: Vector2, visual_scale: float) -> Vector2:
	var toward := target_pos - from_pos
	var distance := toward.length()
	if distance <= 0.01:
		return Vector2.ZERO
	var stop_distance := maxf(18.0, BATTLE_MELEE_CONTACT_DISTANCE * visual_scale)
	var travel_distance := maxf(0.0, distance - stop_distance)
	return toward.normalized() * travel_distance


func _battle_launch_attacker_lunge(progress: float) -> float:
	if progress < BATTLE_LAUNCH_HIT_RATIO:
		return _smooth_unit(progress / BATTLE_LAUNCH_HIT_RATIO)
	if progress < BATTLE_LAUNCH_TARGET_START_RATIO:
		return 1.0
	if progress < BATTLE_LAUNCH_ATTACK_RETURN_RATIO:
		return 1.0 - _smooth_unit((progress - BATTLE_LAUNCH_TARGET_START_RATIO) / (BATTLE_LAUNCH_ATTACK_RETURN_RATIO - BATTLE_LAUNCH_TARGET_START_RATIO))
	return 0.0


func _battle_launch_target_progress(progress: float) -> float:
	var launch_start := _battle_event_result_reveal_progress(battle_current_event) if not battle_current_event.is_empty() else BATTLE_LAUNCH_TARGET_START_RATIO
	if progress <= launch_start:
		return 0.0
	return clampf((progress - launch_start) / maxf(0.01, 1.0 - launch_start), 0.0, 1.0)


func _battle_combo_participant_lunge(actor_id: String, participant_ids: Array, progress: float) -> float:
	var participant_index := participant_ids.find(actor_id)
	if participant_index < 0:
		return 0.0
	var elapsed := progress * maxf(0.01, battle_current_event_duration)
	return _battle_combo_lunge_for_index(participant_index, elapsed)


func _battle_combo_lunge_for_index(participant_index: int, elapsed_seconds: float) -> float:
	if participant_index < 0:
		return 0.0
	var local_seconds := elapsed_seconds - BATTLE_COMBO_STAGGER_SECONDS * float(participant_index)
	if local_seconds < 0.0 or local_seconds > BATTLE_COMBO_ACTION_SECONDS:
		return 0.0
	var local_progress := clampf(local_seconds / BATTLE_COMBO_ACTION_SECONDS, 0.0, 1.0)
	if local_progress < BATTLE_COMBO_APPROACH_RATIO:
		return _smooth_unit(local_progress / BATTLE_COMBO_APPROACH_RATIO)
	if local_progress < BATTLE_COMBO_HOLD_RATIO:
		return 1.0
	return 1.0 - _smooth_unit((local_progress - BATTLE_COMBO_HOLD_RATIO) / (1.0 - BATTLE_COMBO_HOLD_RATIO))


func _smooth_unit(value: float) -> float:
	var t := clampf(value, 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


func _battle_actor_visual_scale() -> float:
	var actors: Array = battle_state.get("actors", [])
	var scale := 1.0
	if actors.size() > 10:
		scale = 0.74
	if _layout_size().y < 460.0:
		scale *= 0.84
	return scale


func _draw_battle_hp_bar(actor: Dictionary, center: Vector2, alpha: float, visual_scale: float) -> void:
	var max_hp := maxf(1.0, float(actor.get("maxHp", 1)))
	var hp := clampf(float(actor.get("hp", 0)), 0.0, max_hp)
	var pct := hp / max_hp
	var size := Vector2(74, 8) * visual_scale
	var origin := center - size * 0.5
	draw_rect(Rect2(origin, size), Color(0.08, 0.10, 0.09, 0.78 * alpha), true)
	draw_rect(Rect2(origin, Vector2(size.x * pct, size.y)), Color(0.74, 0.92, 0.35, 0.95 * alpha), true)
	draw_rect(Rect2(origin, size), Color(0.97, 0.82, 0.44, 0.82 * alpha), false, 1.2 * visual_scale, true)


func _battle_slot_world_position(slot_id: String) -> Vector2:
	var viewport_size := _layout_size()
	var parts := slot_id.split(".")
	var side := str(parts[0]) if parts.size() > 0 else "ally"
	var row := str(parts[1]) if parts.size() > 1 else "front"
	var slot_index := int(parts[2]) if parts.size() > 2 else 3
	var slot_offset := clampi(slot_index - 1, 0, 4)
	var message_top := viewport_size.y - 66.0 - 18.0
	var safe_bottom := message_top - 26.0
	var large_formation: bool = (battle_state.get("actors", []) as Array).size() > 10
	var step_x := 54.0 if large_formation else 34.0
	var step_y := 28.0 if large_formation else 18.0
	if viewport_size.y < 460.0:
		step_x = 42.0 if large_formation else 30.0
		step_y = 16.0 if large_formation else 14.0
		if large_formation:
			step_x = 38.0
			step_y = 12.0
	var max_ally_back_y := safe_bottom - step_y * 2.0 - 12.0
	var max_ally_front_y := max_ally_back_y - 72.0
	var base := Vector2(viewport_size.x * 0.70, minf(viewport_size.y * 0.64, max_ally_front_y))
	if large_formation and side == "enemy":
		return _screen_to_world(_battle_enemy_slot_screen_position(row, slot_offset, viewport_size))
	if large_formation and side == "ally":
		return _screen_to_world(_battle_ally_slot_screen_position(row, slot_offset, viewport_size))
	if large_formation and viewport_size.y < 460.0 and side == "ally" and row == "back":
		base = Vector2(viewport_size.x * 0.76, 272.0)
	elif large_formation and viewport_size.y < 460.0 and side == "ally" and row == "front":
		base = Vector2(viewport_size.x * 0.62, 236.0)
	elif side == "ally" and row == "back":
		base = Vector2(viewport_size.x * 0.82, minf(viewport_size.y * 0.70, max_ally_back_y))
	elif side == "ally" and row == "front":
		base = Vector2(viewport_size.x * 0.70, minf(viewport_size.y * 0.58, max_ally_front_y))
	elif side == "enemy" and row == "front":
		base = Vector2(viewport_size.x * 0.32, viewport_size.y * 0.42)
	elif side == "enemy" and row == "back":
		base = Vector2(viewport_size.x * 0.20, viewport_size.y * 0.32)
	var offset_direction := -1.0 if side == "ally" else 1.0
	var offset := Vector2(float(slot_index - 3) * step_x * offset_direction, float(slot_index - 3) * step_y)
	return _screen_to_world(base + offset)


func _battle_enemy_slot_screen_position(row: String, slot_offset: int, viewport_size: Vector2) -> Vector2:
	var lane := 0
	var rank := slot_offset
	if row == "front":
		lane = 1
	return _battle_grid_screen_position(lane, rank, viewport_size)


func _battle_ally_slot_screen_position(row: String, slot_offset: int, viewport_size: Vector2) -> Vector2:
	var lane := 4
	var rank := 4 - slot_offset
	if row == "back":
		lane = 5
	return _battle_grid_screen_position(lane, rank, viewport_size)


func _battle_grid_screen_position(lane: int, rank: int, viewport_size: Vector2) -> Vector2:
	return _battle_grid_origin(viewport_size) + _battle_grid_lane_step(viewport_size) * float(lane) + _battle_grid_rank_step(viewport_size) * float(rank)


func _battle_grid_origin(viewport_size: Vector2) -> Vector2:
	return _battle_grid_template_offset(viewport_size) + BATTLE_GRID_TEMPLATE_ORIGIN * _battle_grid_template_scale(viewport_size)


func _battle_grid_lane_step(viewport_size: Vector2) -> Vector2:
	return BATTLE_GRID_TEMPLATE_LANE_STEP * _battle_grid_template_scale(viewport_size)


func _battle_grid_rank_step(viewport_size: Vector2) -> Vector2:
	return BATTLE_GRID_TEMPLATE_RANK_STEP * _battle_grid_template_scale(viewport_size)


func _battle_grid_template_scale(viewport_size: Vector2) -> float:
	return minf(viewport_size.x / BATTLE_GRID_TEMPLATE_SIZE.x, viewport_size.y / BATTLE_GRID_TEMPLATE_SIZE.y)


func _battle_grid_template_offset(viewport_size: Vector2) -> Vector2:
	var scale := _battle_grid_template_scale(viewport_size)
	return (viewport_size - BATTLE_GRID_TEMPLATE_SIZE * scale) * 0.5


func _viewport_world_rect() -> Rect2:
	var viewport_size := get_viewport_rect().size
	var center := viewport_size * 0.5
	var zoom := Vector2.ONE
	if game_camera != null:
		center = game_camera.get_screen_center_position()
		zoom = game_camera.zoom
	var half_view := Vector2(viewport_size.x * zoom.x * 0.5, viewport_size.y * zoom.y * 0.5)
	return Rect2(center - half_view, half_view * 2.0)


func _draw_iso_tile(center: Vector2, fill: Color, border: Color) -> void:
	var tile := IsoMapModel.tile_size(map_data)
	var points := PackedVector2Array([
		center + Vector2(0, -tile.y * 0.5),
		center + Vector2(tile.x * 0.5, 0),
		center + Vector2(0, tile.y * 0.5),
		center + Vector2(-tile.x * 0.5, 0),
	])
	draw_colored_polygon(points, fill)
	draw_polyline(points + PackedVector2Array([points[0]]), border, 1.3, true)


func _draw_decor_cells() -> void:
	var decor_cells: Array = map_data.get("decorCells", [])
	for decor_value in decor_cells:
		var decor := decor_value as Dictionary
		var cell_value: Array = decor.get("cell", [0, 0])
		var cell := Vector2i(int(cell_value[0]), int(cell_value[1]))
		var center := IsoMapModel.grid_to_world(map_data, cell)
		var kind := str(decor.get("kind", "grass"))
		if kind == "flower":
			draw_circle(center + Vector2(-8, 3), 4.0, Color(0.95, 0.55, 0.38, 0.95))
			draw_circle(center + Vector2(7, -2), 3.0, Color(0.92, 0.83, 0.34, 0.95))
		else:
			draw_line(center + Vector2(-12, 8), center + Vector2(-6, -3), Color(0.37, 0.65, 0.35, 0.9), 2.0)
			draw_line(center + Vector2(7, 7), center + Vector2(12, -4), Color(0.36, 0.62, 0.32, 0.9), 2.0)


func _draw_encounter_zones() -> void:
	for zone_value in EncounterModel.encounter_zones(map_data):
		var zone := zone_value as Dictionary
		for cell in EncounterModel.cells_for_zone(zone):
			if IsoMapModel.is_inside(map_data, cell) and IsoMapModel.is_walkable(map_data, cell):
				_draw_iso_tile(IsoMapModel.grid_to_world(map_data, cell), Color(0.34, 0.58, 0.34, 0.22), Color(0.55, 0.82, 0.42, 0.34))


func _draw_interaction_points() -> void:
	var points: Array = map_data.get("interactionPoints", [])
	for point_value in points:
		var item := point_value as Dictionary
		var cell := InteractionModel.cell_for(item)
		var center := IsoMapModel.grid_to_world(map_data, cell)
		var marker := InteractionModel.marker_world_position(map_data, item)
		var selected := has_pending_interaction and str(pending_interaction.get("id", "")) == str(item.get("id", ""))
		selected = selected or (_dialog_is_open() and str(active_dialog_interaction.get("id", "")) == str(item.get("id", "")))
		if selected:
			_draw_iso_tile(center, Color(0.97, 0.75, 0.22, 0.18), Color(0.98, 0.80, 0.28, 0.7))
			draw_arc(marker, 24.0, 0.0, TAU, 32, Color(1.0, 0.82, 0.25, 0.95), 3.0, true)
		var item_kind := str(item.get("kind", ""))
		if item_kind == "warp":
			draw_arc(marker, 18.0, 0.0, TAU, 28, Color(0.48, 0.83, 1.0, 0.95), 4.0, true)
			draw_arc(marker, 10.0, 0.0, TAU, 24, Color(1.0, 0.88, 0.35, 0.92), 3.0, true)
			draw_line(marker + Vector2(-16, 12), marker + Vector2(16, 12), Color(0.36, 0.56, 0.70, 0.9), 3.0)
		elif item_kind == "gate":
			draw_line(marker + Vector2(-14, 14), marker + Vector2(-14, -10), Color(0.73, 0.54, 0.34, 0.95), 5.0)
			draw_line(marker + Vector2(14, 14), marker + Vector2(14, -10), Color(0.73, 0.54, 0.34, 0.95), 5.0)
			draw_line(marker + Vector2(-14, -10), marker + Vector2(14, -10), Color(0.90, 0.72, 0.43, 0.95), 5.0)
			draw_circle(marker + Vector2(0, 4), 4.0, Color(1.0, 0.86, 0.42, 0.95))
		else:
			var blocks_movement := InteractionModel.blocks_movement(item)
			var body_color := Color(0.74, 0.36, 0.25, 0.98) if blocks_movement else Color(0.22, 0.58, 0.66, 0.98)
			var trim_color := Color(0.99, 0.82, 0.45, 0.95) if blocks_movement else Color(0.58, 0.89, 0.78, 0.95)
			draw_circle(marker + Vector2(0, -9), 8.0, Color(0.99, 0.76, 0.46, 0.98))
			draw_rect(Rect2(marker + Vector2(-8, -1), Vector2(16, 20)), body_color, true)
			draw_line(marker + Vector2(-13, 8), marker + Vector2(13, 8), trim_color, 3.0)


func _draw_path_line() -> void:
	if current_path_cells.size() < 2:
		return
	var color := Color(1.0, 0.78, 0.24, 0.62)
	if current_path_is_direct:
		draw_line(player.global_position, target_marker, color, 3.0, true)
		return
	for index in range(current_path_cells.size() - 1):
		var from_point := IsoMapModel.grid_to_world(map_data, current_path_cells[index])
		var to_point := IsoMapModel.grid_to_world(map_data, current_path_cells[index + 1])
		draw_line(from_point, to_point, color, 3.0, true)


func _player_movement_bounds() -> Rect2:
	if map_data.is_empty():
		return Rect2(Vector2.ZERO, _layout_size())
	return _map_world_bounds().grow(120.0)


func _map_world_bounds() -> Rect2:
	var size := IsoMapModel.grid_size(map_data)
	var tile := IsoMapModel.tile_size(map_data)
	var min_point := Vector2(INF, INF)
	var max_point := Vector2(-INF, -INF)
	for y in range(size.y):
		for x in range(size.x):
			var center := IsoMapModel.grid_to_world(map_data, Vector2i(x, y))
			min_point = min_point.min(center - tile * 0.5)
			max_point = max_point.max(center + tile * 0.5)
	return Rect2(min_point, max_point - min_point)


func _draw_target_marker(point: Vector2) -> void:
	var color := Color(1.0, 0.74, 0.16, 0.95)
	var size := 22.0
	draw_line(point + Vector2(0, -size), point + Vector2(size, 0), color, 5.0)
	draw_line(point + Vector2(size, 0), point + Vector2(0, size), color, 5.0)
	draw_line(point + Vector2(0, size), point + Vector2(-size, 0), color, 5.0)
	draw_line(point + Vector2(-size, 0), point + Vector2(0, -size), color, 5.0)
	draw_circle(point, 5.0, Color(1.0, 0.92, 0.38, 0.95))
