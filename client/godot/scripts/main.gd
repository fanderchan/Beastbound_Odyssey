extends Node2D

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")
const PET_SCENE := preload("res://scenes/pet/Pet.tscn")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const BattleEventLedger := preload("res://scripts/battle/battle_event_ledger.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const AutoBattleSettingsModel := preload("res://scripts/progression/auto_battle_settings_model.gd")
const AutoCaptureSettingsModel := preload("res://scripts/progression/auto_capture_settings_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const HangSettingsModel := preload("res://scripts/progression/hang_settings_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetSkillTrainingModel := preload("res://scripts/progression/pet_skill_training_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const QuestModel := preload("res://scripts/progression/quest_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")
const START_MAP_ID := "firebud_training_yard"
const GM_10V10_MAP_ID := "gm_10v10_training_ground"
const FIREBUD_EQUIPMENT_SHOP_ID := "firebud_equipment_shop"
const MAP_DATA_PATHS := {
	"firebud_training_yard": "res://data/firebud_training_map.json",
	"firebud_village_gate": "res://data/firebud_village_gate_map.json",
	"gm_10v10_training_ground": "res://data/gm_10v10_training_ground_map.json",
}
const MIN_TOUCH_BUTTON_SIZE := Vector2(64, 64)
const ACTION_BAR_SIZE := Vector2(566, 86)
const DIALOG_PANEL_HEIGHT := 214.0
const PET_PANEL_MIN_SIZE := Vector2(560.0, 360.0)
const PET_PANEL_MAX_SIZE := Vector2(760.0, 468.0)
const WORLD_LOG_MAX_LINES := 80
const PET_REST_RECOVER_INTERVAL_SECONDS := 5.0
const PET_DETAIL_MODE_INSTANCE := "instance"
const PET_DETAIL_MODE_CODEX := "codex"
const PET_FILTER_ALL := "all"
const PET_FILTER_PARTY := "party"
const PET_FILTER_STORAGE := "storage"
const PET_FILTER_LEVEL_ONE := "level_one"
const PET_FILTER_LOW_POWER := "low_power"
const PET_FILTER_NEW := "new"
const PET_SORT_DEFAULT := "default"
const PET_SORT_LEVEL := "level"
const PET_SORT_POWER := "power"
const PET_SORT_SPECIES := "species"
const PET_SORT_CAPTURED := "captured"
const PET_LOW_POWER_FILTER_THRESHOLD := 31
const BATTLE_COMMAND_PLAYER_SIZE := Vector2(390.0, 170.0)
const BATTLE_COMMAND_MENU_SIZE := Vector2(300.0, 440.0)
const BATTLE_COMMAND_BUTTON_ORDER: Array[String] = ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run", "help"]
const BATTLE_AUTO_ATTACK_STEP_DELAY := 0.16
const BATTLE_PASSIVE_LABEL_FONT_SIZE := 15
const BATTLE_PASSIVE_MAX_LINES := 2
const BATTLE_PASSIVE_PANEL_HEIGHT := 64.0
const BATTLE_PASSIVE_PANEL_COMPACT_HEIGHT := 58.0
const BATTLE_PASSIVE_PANEL_PADDING := Vector2(14.0, 6.0)
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
const BATTLE_LAUNCH_STRAIGHT_SECONDS := 1.45
const BATTLE_LAUNCH_BOUNCE_SECONDS := 1.95
const BATTLE_LAUNCH_FINISH_HOLD_RATIO := 0.86
const BATTLE_AUTO_ROUND_SETTLE_DELAY := 0.24
const ENCOUNTER_POST_BATTLE_GRACE_SECONDS := 1.0
const ENCOUNTER_SAFE_STEPS := 2
const ENCOUNTER_STONE_LOW_ID := "encounter_stone_low"
const ENCOUNTER_STONE_MID_ID := "encounter_stone_mid"
const ENCOUNTER_STONE_HIGH_ID := "encounter_stone_high"
const HANG_WALK_COOLDOWN_SECONDS := 0.14
const EQUIPMENT_COMPARE_GAIN_COLOR := "#79d982"
const EQUIPMENT_COMPARE_LOSS_COLOR := "#ff746a"
const HANG_WALK_DIRECTIONS: Array[Vector2i] = [
	Vector2i(1, -1),
	Vector2i(-1, 1),
	Vector2i(1, 0),
	Vector2i(-1, 0),
	Vector2i(0, 1),
	Vector2i(0, -1),
]

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
var battle_auto_button: Button
var battle_auto_stop_button: Button
var battle_command_button_grid: GridContainer
var battle_passive_panel: Panel
var battle_passive_label: Label
var battle_message_panel: PanelContainer
var battle_log_label: RichTextLabel
var battle_command_buttons: Dictionary = {}
var stop_button: Button
var ring_button: Button
var player_status_menu_button: Button
var bag_menu_button: Button
var equipment_menu_button: Button
var pet_menu_button: Button
var codex_menu_button: Button
var quest_menu_button: Button
var training_partner_menu_button: Button
var auto_settings_menu_button: Button
var backpack_panel: PanelContainer
var backpack_grid: GridContainer
var backpack_detail_label: RichTextLabel
var backpack_use_button: Button
var backpack_target_scroll: ScrollContainer
var backpack_target_container: VBoxContainer
var backpack_close_button: Button
var backpack_slot_buttons: Array[Button] = []
var backpack_selected_slot_index: int = 0
var backpack_pending_use_item_id: String = ""
var player_status_panel: PanelContainer
var player_status_detail_label: RichTextLabel
var player_status_points_label: Label
var player_status_stat_point_buttons: Dictionary = {}
var player_status_equipment_button: Button
var player_status_close_button: Button
var equipment_panel: PanelContainer
var equipment_grid: Control
var equipment_stats_label: Label
var equipment_detail_label: Label
var equipment_unequip_button: Button
var equipment_close_button: Button
var equipment_slot_buttons: Dictionary = {}
var equipment_selected_slot_id: String = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
var shop_panel: PanelContainer
var shop_title_label: Label
var shop_coin_label: Label
var shop_buy_button: Button
var shop_sell_button: Button
var shop_list_container: VBoxContainer
var shop_detail_label: Label
var shop_quantity_minus_button: Button
var shop_quantity_spinbox: SpinBox
var shop_quantity_plus_button: Button
var shop_quantity_max_button: Button
var shop_action_button: Button
var shop_repair_button: Button
var shop_close_button: Button
var shop_item_buttons: Dictionary = {}
var shop_active_id: String = ShopCatalogModel.DEFAULT_SHOP_ID
var shop_mode: String = "buy"
var shop_selected_item_id: String = ""
var shop_quantity: int = 1
var pet_panel: PanelContainer
var pet_filter_option: OptionButton
var pet_sort_option: OptionButton
var pet_sort_direction_button: Button
var pet_list_container: VBoxContainer
var pet_detail_scroll: ScrollContainer
var pet_detail_label: Label
var pet_detail_instance_button: Button
var pet_detail_codex_button: Button
var pet_state_cycle_button: Button
var pet_stable_button: Button
var pet_rename_button: Button
var pet_drop_button: Button
var pet_rename_panel: PanelContainer
var pet_rename_title_label: Label
var pet_rename_input: LineEdit
var pet_rename_confirm_button: Button
var pet_rename_cancel_button: Button
var pet_close_button: Button
var pet_skill_button: Button
var pet_skill_panel: PanelContainer
var pet_skill_title_label: Label
var pet_skill_pet_option: OptionButton
var pet_skill_slot_grid: GridContainer
var pet_skill_detail_label: Label
var pet_skill_move_up_button: Button
var pet_skill_move_down_button: Button
var pet_skill_forget_button: Button
var pet_skill_learn_option: OptionButton
var pet_skill_learn_button: Button
var pet_skill_close_button: Button
var pet_skill_slot_buttons: Dictionary = {}
var pet_skill_selected_slot: int = 1
var pet_skill_training_mode: bool = false
var pet_skill_trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID
var pet_selected_instance_id: String = ""
var pet_detail_mode: String = PET_DETAIL_MODE_INSTANCE
var pet_filter_mode: String = PET_FILTER_ALL
var pet_sort_mode: String = PET_SORT_DEFAULT
var pet_sort_descending: bool = true
var pet_clear_confirm_instance_id: String = ""
var pet_list_buttons: Dictionary = {}
var codex_panel: PanelContainer
var codex_list_container: VBoxContainer
var codex_detail_label: Label
var codex_close_button: Button
var codex_selected_form_id: String = ""
var codex_list_buttons: Dictionary = {}
var quest_panel: PanelContainer
var quest_title_label: Label
var quest_detail_label: Label
var quest_route_button: Button
var quest_close_button: Button
var training_partner_panel: PanelContainer
var training_partner_label: Label
var training_partner_add_button: Button
var training_partner_remove_button: Button
var training_partner_fill_button: Button
var training_partner_clear_button: Button
var training_partner_close_button: Button
var auto_settings_panel: PanelContainer
var auto_settings_battle_tab_button: Button
var auto_settings_hang_tab_button: Button
var auto_settings_capture_tab_button: Button
var auto_settings_content: VBoxContainer
var auto_settings_close_button: Button
var auto_settings_controls: Dictionary = {}
var auto_settings_active_tab: String = "battle"
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
var auto_battle_auto_attack_check: bool = false
var auto_battle_auto_10v10_check: bool = false
var auto_battle_settings_check: bool = false
var auto_capture_settings_check: bool = false
var auto_training_partner_check: bool = false
var auto_hang_settings_check: bool = false
var auto_gm_10v10_map_check: bool = false
var auto_battle_formation_check: bool = false
var auto_battle_target_check: bool = false
var auto_battle_round_check: bool = false
var auto_battle_speed_check: bool = false
var auto_battle_feedback_check: bool = false
var auto_battle_combo_check: bool = false
var auto_battle_capture_check: bool = false
var auto_capture_tools_check: bool = false
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
var auto_battle_label_check: bool = false
var auto_battle_event_ledger_check: bool = false
var auto_battle_status_check: bool = false
var auto_battle_status_skill_check: bool = false
var auto_battle_status_hit_check: bool = false
var auto_battle_status_rule_check: bool = false
var auto_battle_passive_hover_check: bool = false
var auto_battle_reaction_check: bool = false
var auto_battle_result_check: bool = false
var auto_pet_management_check: bool = false
var auto_pet_rename_check: bool = false
var auto_pet_recovery_check: bool = false
var auto_pet_stable_check: bool = false
var auto_pet_drop_pickup_check: bool = false
var auto_pet_codex_detail_check: bool = false
var auto_pet_codex_list_check: bool = false
var auto_pet_encounter_table_check: bool = false
var auto_pet_capture_feedback_check: bool = false
var auto_pet_storage_capture_check: bool = false
var auto_pet_template_catalog_check: bool = false
var auto_pet_skill_training_check: bool = false
var auto_village_healer_check: bool = false
var auto_record_point_check: bool = false
var auto_backpack_check: bool = false
var auto_backpack_world_use_check: bool = false
var auto_shop_check: bool = false
var auto_battle_reward_check: bool = false
var auto_quest_chain_check: bool = false
var auto_quest_ui_check: bool = false
var auto_equipment_check: bool = false
var auto_player_status_check: bool = false
var auto_player_stat_points_check: bool = false
var auto_equipment_requirement_check: bool = false
var auto_equipment_durability_check: bool = false
var auto_encounter_loop_check: bool = false
var backpack_preview: bool = false
var backpack_world_use_preview: bool = false
var player_status_preview: bool = false
var player_stat_points_preview: bool = false
var equipment_requirement_preview: bool = false
var equipment_durability_preview: bool = false
var shop_preview: bool = false
var battle_reward_preview: bool = false
var quest_preview: bool = false
var quest_ui_preview: bool = false
var equipment_quest_preview: bool = false
var equipment_swap_preview: bool = false
var equipment_spirit_preview: bool = false
var equipment_compare_preview: bool = false
var pet_management_preview: bool = false
var pet_rename_preview: bool = false
var pet_drop_preview: bool = false
var pet_codex_preview: bool = false
var pet_codex_list_preview: bool = false
var pet_encounter_table_preview: bool = false
var pet_capture_feedback_preview: bool = false
var pet_skill_training_preview: bool = false
var capture_tools_preview: bool = false
var battle_preview: bool = false
var battle_formation_preview: bool = false
var battle_auto_10v10_preview: bool = false
var auto_battle_settings_preview: bool = false
var auto_capture_settings_preview: bool = false
var training_partner_demo: bool = false
var hang_settings_preview: bool = false
var record_point_knockaway_demo: bool = false
var battle_stat_test: bool = false
var battle_status_test: bool = false
var battle_status_skill_test: bool = false
var battle_status_hit_test: bool = false
var battle_status_rule_test: bool = false
var battle_combo_motion_preview: bool = false
var battle_launch_preview_mode: String = ""
var battle_label_preview: bool = false
var battle_debug_window_enabled: bool = false
var current_map_id: String = START_MAP_ID
var startup_map_id: String = START_MAP_ID
var startup_spawn_name: String = "default"
var map_data: Dictionary = {}
var player_profile: Dictionary = {}
var profile_save_enabled: bool = true
var world_log_message: String = ""
var world_log_history: Array[String] = []
var pet_rest_recovery_elapsed: float = 0.0
var pet_drop_expire_elapsed: float = 0.0
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
var battle_hover_info_actor_id: String = ""
var battle_target_mode: String = "enemy"
var battle_command_owner: String = "player"
var battle_pending_spirit_id: String = ""
var battle_pending_item_id: String = ""
var battle_pending_capture_tool_id: String = ""
var battle_pending_pet_skill_id: String = ""
var battle_switch_pet_button_pet_ids: Dictionary = {}
var battle_spirit_button_spirit_ids: Dictionary = {}
var battle_pending_player_command: Dictionary = {}
var battle_pending_pet_command: Dictionary = {}
var battle_event_queue: Array[Dictionary] = []
var battle_current_event: Dictionary = {}
var battle_current_event_duration: float = 0.0
var battle_current_event_actor_snapshots: Dictionary = {}
var battle_event_advance_pending: bool = false
var battle_round_end_status_processed: bool = false
var battle_player_zero_hp_seen: bool = false
var battle_auto_capture_success_seen: bool = false
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
var battle_last_event_ledger: Dictionary = {}
var battle_recorded_event_sequence: int = 0
var battle_float_texts: Array[Dictionary] = []
var battle_debug_window: Window
var battle_debug_text: TextEdit
var battle_debug_last_text: String = ""
var battle_trace_path: String = ""
var last_checked_player_cell: Vector2i = Vector2i.ZERO
var encounter_zone_step_count: int = 0
var encounter_grace_remaining: float = 0.0
var hang_mode_active: bool = false
var hang_walk_direction_index: int = 0
var hang_walk_cooldown: float = 0.0
var encounter_stone_item_id: String = ""
var encounter_stone_interval: float = 0.0
var encounter_stone_remaining: float = 0.0
var encounter_stone_elapsed: float = 0.0
var battle_auto_attack_enabled: bool = false
var battle_auto_attack_delay: float = 0.0
var battle_auto_attack_player_submissions: int = 0
var battle_auto_attack_pet_submissions: int = 0
var encounter_rng := RandomNumberGenerator.new()


func _ready() -> void:
	_apply_preview_window_args()
	player_profile = PlayerProgressModel.load_profile()
	_load_map(startup_map_id, startup_spawn_name)
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
	elif auto_battle_auto_attack_check:
		call_deferred("_run_auto_battle_auto_attack_check")
	elif auto_battle_auto_10v10_check:
		call_deferred("_run_auto_battle_auto_10v10_check")
	elif auto_battle_settings_check:
		call_deferred("_run_auto_battle_settings_check")
	elif auto_capture_settings_check:
		call_deferred("_run_auto_capture_settings_check")
	elif auto_training_partner_check:
		call_deferred("_run_auto_training_partner_check")
	elif auto_hang_settings_check:
		call_deferred("_run_auto_hang_settings_check")
	elif auto_gm_10v10_map_check:
		call_deferred("_run_auto_gm_10v10_map_check")
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
	elif auto_battle_label_check:
		call_deferred("_run_auto_battle_label_check")
	elif auto_battle_event_ledger_check:
		call_deferred("_run_auto_battle_event_ledger_check")
	elif auto_battle_status_check:
		call_deferred("_run_auto_battle_status_check")
	elif auto_battle_status_skill_check:
		call_deferred("_run_auto_battle_status_skill_check")
	elif auto_battle_status_hit_check:
		call_deferred("_run_auto_battle_status_hit_check")
	elif auto_battle_status_rule_check:
		call_deferred("_run_auto_battle_status_rule_check")
	elif auto_battle_passive_hover_check:
		call_deferred("_run_auto_battle_passive_hover_check")
	elif auto_battle_reaction_check:
		call_deferred("_run_auto_battle_reaction_check")
	elif auto_battle_result_check:
		call_deferred("_run_auto_battle_result_check")
	elif auto_pet_management_check:
		call_deferred("_run_auto_pet_management_check")
	elif auto_pet_rename_check:
		call_deferred("_run_auto_pet_rename_check")
	elif auto_pet_recovery_check:
		call_deferred("_run_auto_pet_recovery_check")
	elif auto_pet_stable_check:
		call_deferred("_run_auto_pet_stable_check")
	elif auto_pet_drop_pickup_check:
		call_deferred("_run_auto_pet_drop_pickup_check")
	elif auto_pet_codex_detail_check:
		call_deferred("_run_auto_pet_codex_detail_check")
	elif auto_pet_codex_list_check:
		call_deferred("_run_auto_pet_codex_list_check")
	elif auto_pet_encounter_table_check:
		call_deferred("_run_auto_pet_encounter_table_check")
	elif auto_pet_capture_feedback_check:
		call_deferred("_run_auto_pet_capture_feedback_check")
	elif auto_pet_storage_capture_check:
		call_deferred("_run_auto_pet_storage_capture_check")
	elif auto_pet_template_catalog_check:
		call_deferred("_run_auto_pet_template_catalog_check")
	elif auto_pet_skill_training_check:
		call_deferred("_run_auto_pet_skill_training_check")
	elif auto_village_healer_check:
		call_deferred("_run_auto_village_healer_check")
	elif auto_record_point_check:
		call_deferred("_run_auto_record_point_check")
	elif auto_backpack_check:
		call_deferred("_run_auto_backpack_check")
	elif auto_backpack_world_use_check:
		call_deferred("_run_auto_backpack_world_use_check")
	elif auto_shop_check:
		call_deferred("_run_auto_shop_check")
	elif auto_battle_reward_check:
		call_deferred("_run_auto_battle_reward_check")
	elif auto_quest_chain_check:
		call_deferred("_run_auto_quest_chain_check")
	elif auto_quest_ui_check:
		call_deferred("_run_auto_quest_ui_check")
	elif auto_equipment_check:
		call_deferred("_run_auto_equipment_check")
	elif auto_player_status_check:
		call_deferred("_run_auto_player_status_check")
	elif auto_player_stat_points_check:
		call_deferred("_run_auto_player_stat_points_check")
	elif auto_equipment_requirement_check:
		call_deferred("_run_auto_equipment_requirement_check")
	elif auto_equipment_durability_check:
		call_deferred("_run_auto_equipment_durability_check")
	elif auto_encounter_loop_check:
		call_deferred("_run_auto_encounter_loop_check")
	elif backpack_preview:
		call_deferred("_run_backpack_preview")
	elif backpack_world_use_preview:
		call_deferred("_run_backpack_world_use_preview")
	elif player_status_preview:
		call_deferred("_run_player_status_preview")
	elif player_stat_points_preview:
		call_deferred("_run_player_stat_points_preview")
	elif equipment_requirement_preview:
		call_deferred("_run_equipment_requirement_preview")
	elif equipment_durability_preview:
		call_deferred("_run_equipment_durability_preview")
	elif shop_preview:
		call_deferred("_run_shop_preview")
	elif battle_reward_preview:
		call_deferred("_run_battle_reward_preview")
	elif quest_preview:
		call_deferred("_run_quest_preview")
	elif quest_ui_preview:
		call_deferred("_run_quest_ui_preview")
	elif equipment_quest_preview:
		call_deferred("_run_equipment_quest_preview")
	elif equipment_swap_preview:
		call_deferred("_run_equipment_swap_preview")
	elif equipment_spirit_preview:
		call_deferred("_run_equipment_spirit_preview")
	elif equipment_compare_preview:
		call_deferred("_run_equipment_compare_preview")
	elif pet_management_preview:
		call_deferred("_run_pet_management_preview")
	elif pet_rename_preview:
		call_deferred("_run_pet_rename_preview")
	elif pet_drop_preview:
		call_deferred("_run_pet_drop_preview")
	elif pet_codex_preview:
		call_deferred("_run_pet_codex_preview")
	elif pet_codex_list_preview:
		call_deferred("_run_pet_codex_list_preview")
	elif pet_encounter_table_preview:
		call_deferred("_run_pet_encounter_table_preview")
	elif pet_capture_feedback_preview:
		call_deferred("_run_pet_capture_feedback_preview")
	elif pet_skill_training_preview:
		call_deferred("_run_pet_skill_training_preview")
	elif capture_tools_preview:
		call_deferred("_run_capture_tools_preview")
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
	elif auto_capture_tools_check:
		call_deferred("_run_auto_capture_tools_check")
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
	elif battle_auto_10v10_preview:
		call_deferred("_open_battle_auto_10v10_preview")
	elif auto_battle_settings_preview:
		call_deferred("_run_auto_battle_settings_preview")
	elif auto_capture_settings_preview:
		call_deferred("_run_auto_capture_settings_preview")
	elif training_partner_demo:
		call_deferred("_run_training_partner_demo")
	elif hang_settings_preview:
		call_deferred("_run_hang_settings_preview")
	elif record_point_knockaway_demo:
		call_deferred("_run_record_point_knockaway_demo")
	elif battle_label_preview:
		call_deferred("_open_battle_label_preview")
	elif battle_stat_test:
		call_deferred("_open_battle_stat_test")
	elif battle_status_test:
		call_deferred("_open_battle_status_test")
	elif battle_status_skill_test:
		call_deferred("_open_battle_status_skill_test")
	elif battle_status_hit_test:
		call_deferred("_open_battle_status_hit_test")
	elif battle_status_rule_test:
		call_deferred("_open_battle_status_rule_test")
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
		elif arg == "--full-client-preview":
			pass
		elif arg == "--gm-10v10-map":
			startup_map_id = GM_10V10_MAP_ID
			startup_spawn_name = "default"
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
		elif arg == "--auto-battle-auto-attack-check":
			auto_battle_auto_attack_check = true
		elif arg == "--auto-battle-auto-10v10-check":
			auto_battle_auto_10v10_check = true
		elif arg == "--auto-battle-settings-check":
			auto_battle_settings_check = true
		elif arg == "--auto-capture-settings-check":
			auto_capture_settings_check = true
		elif arg == "--auto-training-partner-check":
			auto_training_partner_check = true
		elif arg == "--auto-hang-settings-check":
			auto_hang_settings_check = true
		elif arg == "--auto-gm-10v10-map-check":
			auto_gm_10v10_map_check = true
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
		elif arg == "--auto-capture-tools-check":
			auto_capture_tools_check = true
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
		elif arg == "--auto-battle-label-check":
			auto_battle_label_check = true
		elif arg == "--auto-battle-event-ledger-check":
			auto_battle_event_ledger_check = true
		elif arg == "--auto-battle-status-check":
			auto_battle_status_check = true
		elif arg == "--auto-battle-status-skill-check":
			auto_battle_status_skill_check = true
		elif arg == "--auto-battle-status-hit-check":
			auto_battle_status_hit_check = true
		elif arg == "--auto-battle-status-rule-check":
			auto_battle_status_rule_check = true
		elif arg == "--auto-battle-passive-hover-check":
			auto_battle_passive_hover_check = true
		elif arg == "--auto-battle-reaction-check":
			auto_battle_reaction_check = true
		elif arg == "--auto-battle-result-check":
			auto_battle_result_check = true
		elif arg == "--auto-pet-management-check":
			auto_pet_management_check = true
		elif arg == "--auto-pet-rename-check":
			auto_pet_rename_check = true
		elif arg == "--auto-pet-recovery-check":
			auto_pet_recovery_check = true
		elif arg == "--auto-pet-stable-check":
			auto_pet_stable_check = true
		elif arg == "--auto-pet-drop-pickup-check":
			auto_pet_drop_pickup_check = true
		elif arg == "--auto-pet-codex-detail-check":
			auto_pet_codex_detail_check = true
		elif arg == "--auto-pet-codex-list-check":
			auto_pet_codex_list_check = true
		elif arg == "--auto-pet-encounter-table-check":
			auto_pet_encounter_table_check = true
		elif arg == "--auto-pet-capture-feedback-check":
			auto_pet_capture_feedback_check = true
		elif arg == "--auto-pet-storage-capture-check":
			auto_pet_storage_capture_check = true
		elif arg == "--auto-pet-template-catalog-check":
			auto_pet_template_catalog_check = true
		elif arg == "--auto-pet-skill-training-check":
			auto_pet_skill_training_check = true
		elif arg == "--auto-village-healer-check":
			auto_village_healer_check = true
		elif arg == "--auto-record-point-check":
			auto_record_point_check = true
		elif arg == "--auto-backpack-check":
			auto_backpack_check = true
		elif arg == "--auto-backpack-world-use-check":
			auto_backpack_world_use_check = true
		elif arg == "--auto-shop-check":
			auto_shop_check = true
		elif arg == "--auto-battle-reward-check":
			auto_battle_reward_check = true
		elif arg == "--auto-quest-chain-check":
			auto_quest_chain_check = true
		elif arg == "--auto-quest-ui-check":
			auto_quest_ui_check = true
		elif arg == "--auto-equipment-check":
			auto_equipment_check = true
		elif arg == "--auto-player-status-check":
			auto_player_status_check = true
		elif arg == "--auto-player-stat-points-check":
			auto_player_stat_points_check = true
		elif arg == "--auto-equipment-requirement-check":
			auto_equipment_requirement_check = true
		elif arg == "--auto-equipment-durability-check":
			auto_equipment_durability_check = true
		elif arg == "--auto-encounter-loop-check":
			auto_encounter_loop_check = true
		elif arg == "--backpack-preview":
			backpack_preview = true
		elif arg == "--backpack-world-use-preview":
			backpack_world_use_preview = true
		elif arg == "--player-status-preview":
			player_status_preview = true
		elif arg == "--player-stat-points-preview":
			player_stat_points_preview = true
		elif arg == "--equipment-requirement-preview":
			equipment_requirement_preview = true
		elif arg == "--equipment-durability-preview":
			equipment_durability_preview = true
		elif arg == "--shop-preview":
			shop_preview = true
		elif arg == "--battle-reward-preview":
			battle_reward_preview = true
		elif arg == "--quest-preview":
			quest_preview = true
		elif arg == "--quest-ui-preview":
			quest_ui_preview = true
		elif arg == "--equipment-quest-preview":
			equipment_quest_preview = true
		elif arg == "--equipment-swap-preview":
			equipment_swap_preview = true
		elif arg == "--equipment-spirit-preview":
			equipment_spirit_preview = true
		elif arg == "--equipment-compare-preview":
			equipment_compare_preview = true
		elif arg == "--pet-management-preview":
			pet_management_preview = true
		elif arg == "--pet-rename-preview":
			pet_rename_preview = true
		elif arg == "--pet-drop-preview":
			pet_drop_preview = true
		elif arg == "--pet-codex-preview":
			pet_codex_preview = true
		elif arg == "--pet-codex-list-preview":
			pet_codex_list_preview = true
		elif arg == "--pet-encounter-table-preview":
			pet_encounter_table_preview = true
		elif arg == "--pet-capture-feedback-preview":
			pet_capture_feedback_preview = true
		elif arg == "--pet-skill-training-preview":
			pet_skill_training_preview = true
		elif arg == "--capture-tools-preview":
			capture_tools_preview = true
		elif arg == "--battle-preview":
			battle_preview = true
		elif arg == "--battle-preview-10v10":
			battle_formation_preview = true
		elif arg == "--battle-auto-10v10-preview":
			battle_auto_10v10_preview = true
		elif arg == "--auto-battle-settings-preview":
			auto_battle_settings_preview = true
		elif arg == "--auto-capture-settings-preview":
			auto_capture_settings_preview = true
		elif arg == "--training-partner-demo":
			training_partner_demo = true
		elif arg == "--hang-settings-preview":
			hang_settings_preview = true
		elif arg == "--record-point-knockaway-demo":
			record_point_knockaway_demo = true
		elif arg == "--battle-label-preview":
			battle_label_preview = true
		elif arg == "--battle-stat-test":
			battle_stat_test = true
		elif arg == "--battle-status-test":
			battle_status_test = true
		elif arg == "--battle-status-skill-test":
			battle_status_skill_test = true
		elif arg == "--battle-status-hit-test":
			battle_status_hit_test = true
		elif arg == "--battle-status-rule-test":
			battle_status_rule_test = true
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
	_set_hang_mode(false)
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


func _encounter_zone_by_id(zone_id: String) -> Dictionary:
	for value in EncounterModel.encounter_zones(map_data):
		if not (value is Dictionary):
			continue
		var zone := value as Dictionary
		if str(zone.get("id", "")) == zone_id:
			return zone
	return {}


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
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	if status_label != null:
		_update_hud_text()
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
	var quest_was_intro := PlayerProgressModel.active_quest_id(player_profile) == "quest_intro_talk"
	_confirm_dialog_action()
	await get_tree().process_frame
	var quest_advanced := PlayerProgressModel.active_quest_id(player_profile) == "quest_buy_supply"
	var quest_log_ok := world_log_message.find("完成任务「认识训练师」") >= 0
	var player_close := false
	if trainer_found:
		var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
		var trainer_cell := InteractionModel.cell_for(trainer)
		player_close = maxi(absi(player_cell.x - trainer_cell.x), absi(player_cell.y - trainer_cell.y)) <= 2
	var trainer_blocks := trainer_found and InteractionModel.blocks_movement(trainer)
	var not_on_trainer := true
	if trainer_found:
		not_on_trainer = IsoMapModel.world_to_grid(map_data, player.global_position) != InteractionModel.cell_for(trainer)
	var status := "ok" if trainer_found and clicked_trainer and dialog_opened and quest_was_intro and quest_advanced and quest_log_ok and player_close and trainer_blocks and not_on_trainer else "failed"
	print("npc interaction check ready: status=%s trainer_found=%s clicked_trainer=%s dialog_opened=%s quest_intro=%s quest_advanced=%s quest_log=%s player_close=%s trainer_blocks=%s not_on_trainer=%s" % [
		status,
		str(trainer_found),
		str(clicked_trainer),
		str(dialog_opened),
		str(quest_was_intro),
		str(quest_advanced),
		str(quest_log_ok),
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
	var no_prompt: bool = not encounter_active and encounter_panel != null and not encounter_panel.visible
	var movement_stopped: bool = not player.is_auto_moving()
	var battle_started: bool = battle_active and battle_command_panel.visible and not encounter_panel.visible
	_end_battle(true)
	await get_tree().process_frame
	var closed: bool = not encounter_active and not encounter_panel.visible and not battle_active
	var grace_started := encounter_grace_remaining > 0.0 and encounter_grace_remaining <= ENCOUNTER_POST_BATTLE_GRACE_SECONDS
	var status := "ok" if loaded and zone_found and target_in_zone and arrived_zone and no_prompt and movement_stopped and battle_started and closed and grace_started else "failed"
	print("encounter check ready: status=%s loaded=%s zone_found=%s target_in_zone=%s arrived_zone=%s no_prompt=%s movement_stopped=%s battle_started=%s closed=%s grace=%.2f zone_id=%s final_cell=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(target_in_zone),
		str(arrived_zone),
		str(no_prompt),
		str(movement_stopped),
		str(battle_started),
		str(closed),
		encounter_grace_remaining,
		str(zone.get("id", "")),
		str(player_cell),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_gm_10v10_map_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded: bool = _load_map(GM_10V10_MAP_ID)
	await get_tree().process_frame
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	var zone: Dictionary = zones[0] as Dictionary if zone_found else {}
	var enemy_count_rule := EncounterModel.enemy_count(zone, 1) if zone_found else 0
	var rate_ok := zone_found and EncounterModel.encounter_rate(zone) >= 0.999
	var spawn_cell := IsoMapModel.spawn_cell(map_data) if loaded else Vector2i.ZERO
	var spawn_in_zone := zone_found and EncounterModel.zone_contains_cell(zone, spawn_cell)
	if zone_found:
		_trigger_encounter(zone)
	await get_tree().process_frame
	var no_partner_enemy_count := BattleModel.side_actor_count(battle_state, BattleModel.SIDE_ENEMY) if battle_active else 0
	var no_partner_ally_count := BattleModel.side_actor_count(battle_state, BattleModel.SIDE_ALLY) if battle_active else 0
	var no_partner_ok := battle_active and no_partner_enemy_count == 10 and no_partner_ally_count == 2
	_end_battle(true)
	await get_tree().process_frame
	player_profile = PlayerProgressModel.with_training_partner_count(PlayerProgressModel.default_profile(), 4)
	if zone_found:
		_trigger_encounter(zone)
	await get_tree().process_frame
	var partner_enemy_count := BattleModel.side_actor_count(battle_state, BattleModel.SIDE_ENEMY) if battle_active else 0
	var partner_ally_count := BattleModel.side_actor_count(battle_state, BattleModel.SIDE_ALLY) if battle_active else 0
	var partner_ok := battle_active and partner_enemy_count == 10 and partner_ally_count == 10
	var source_group_ok := str(battle_state.get("sourceEncounterGroupId", "")) == "gm_10v10_grass" if battle_active else false
	var random_zone := _encounter_zone_by_id("gm_codex_capture_grass")
	var random_pool := EncounterModel.wild_pet_pool(random_zone) if not random_zone.is_empty() else []
	var random_selected_zone := EncounterModel.zone_with_selected_wild_pet(random_zone, encounter_rng) if not random_zone.is_empty() else {}
	var random_selected_pets: Array = random_selected_zone.get("selectedWildPets", [])
	var random_count := EncounterModel.enemy_count(random_selected_zone, 1) if not random_selected_zone.is_empty() else 0
	var random_levels_ok := random_count >= 1 and random_count <= 5 and random_selected_pets.size() == random_count
	for selected_pet_value in random_selected_pets:
		var selected_pet := selected_pet_value as Dictionary if selected_pet_value is Dictionary else {}
		var selected_level := int(selected_pet.get("level", 0))
		if selected_level < 1 or selected_level > 10:
			random_levels_ok = false
	var random_battle_state := BattleModel.create_training_partner_battle(random_selected_zone, random_count) if random_count >= 1 else {}
	var random_battle_count_ok := BattleModel.side_actor_count(random_battle_state, BattleModel.SIDE_ENEMY) == random_count
	var random_formation_ok := not random_battle_state.is_empty() and BattleModel.uses_10v10_formation(random_battle_state)
	var random_two_slot_state := BattleModel.create_training_partner_battle(random_zone, 2) if not random_zone.is_empty() else {}
	var random_two_slot_ok := (
		not random_two_slot_state.is_empty()
		and BattleModel.uses_10v10_formation(random_two_slot_state)
		and str(BattleModel.actor_by_id(random_two_slot_state, "enemy_front_1").get("slotId", "")) == "enemy.front.1"
		and str(BattleModel.actor_by_id(random_two_slot_state, "enemy_front_2").get("slotId", "")) == "enemy.front.2"
		and BattleModel.actor_by_id(random_two_slot_state, "enemy_front_3").is_empty()
	)
	var random_zone_ok := (
		not random_zone.is_empty()
		and int(random_zone.get("enemyCountMin", 0)) == 1
		and int(random_zone.get("enemyCountMax", 0)) == 5
		and str(random_zone.get("formationTemplate", "")) == BattleModel.FORMATION_TEMPLATE_10V10
		and bool(random_zone.get("individualWildPets", false))
		and random_pool.size() >= PetTemplateCatalog.forms().size()
		and random_levels_ok
		and random_battle_count_ok
		and random_formation_ok
		and random_two_slot_ok
	)
	var status := "ok" if loaded and current_map_id == GM_10V10_MAP_ID and zone_found and enemy_count_rule == 10 and rate_ok and spawn_in_zone and no_partner_ok and partner_ok and source_group_ok and random_zone_ok else "failed"
	print("gm 10v10 map check ready: status=%s loaded=%s map=%s zone=%s enemy_rule=%d rate_ok=%s spawn_in_zone=%s no_partner=%d/%d partner=%d/%d source_group=%s random_zone=%s random_pool=%d random_count=%d random_levels=%s random_battle_count=%s random_formation=%s random_two_slots=%s" % [
		status,
		str(loaded),
		current_map_id,
		str(zone.get("id", "")),
		enemy_count_rule,
		str(rate_ok),
		str(spawn_in_zone),
		no_partner_ally_count,
		no_partner_enemy_count,
		partner_ally_count,
		partner_enemy_count,
		str(source_group_ok),
		str(random_zone_ok),
		random_pool.size(),
		random_count,
		str(random_levels_ok),
		str(random_battle_count_ok),
		str(random_formation_ok),
		str(random_two_slot_ok),
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
	var no_prompt: bool = encounter_panel != null and not encounter_panel.visible and not encounter_active
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
	var enemy_after := enemy_before
	var ally_hp_after := ally_hp_before
	var attack_state_seen := false
	for _frame in range(480):
		await get_tree().process_frame
		enemy_after = int(BattleModel.actor_by_id(battle_state, enemy_id).get("hp", 0)) if enemy_id != "" else enemy_after
		ally_hp_after = _battle_side_total_hp(BattleModel.SIDE_ALLY)
		attack_state_seen = attack_state_seen or battle_action_timer > 0.0
		if enemy_after < enemy_before and ally_hp_after < ally_hp_before:
			break
	var attack_reduced_hp := enemy_before > 0 and enemy_after < enemy_before
	var player_attacked := attack_reduced_hp
	for _frame in range(480):
		await get_tree().process_frame
		ally_hp_after = _battle_side_total_hp(BattleModel.SIDE_ALLY)
		if (battle_active and not _battle_commands_locked()) or not battle_active:
			break
	var round_resolved := (battle_active and not _battle_commands_locked()) or not battle_active
	var enemy_countered := ally_hp_after < ally_hp_before
	_on_battle_command_pressed("run")
	await get_tree().process_frame
	var escaped := not battle_active and player.visible and not battle_command_panel.visible
	if zone_found:
		_trigger_encounter(zone)
	await get_tree().process_frame
	var victory_target_id := BattleModel.living_enemy_id(battle_state)
	if victory_target_id != "":
		battle_state = BattleModel.set_actor_hp(battle_state, victory_target_id, 1)
	_on_battle_command_pressed("attack")
	_auto_click_enemy_target(victory_target_id)
	_auto_submit_pet_attack_if_needed()
	for _frame in range(260):
		await get_tree().process_frame
		if not battle_active:
			break
	var victory_exited := not battle_active and player.visible and not battle_command_panel.visible
	var status := "ok" if loaded and zone_found and no_prompt and battle_started and buttons_ok and command_top_right and formation_ok and attack_reduced_hp and attack_state_seen and player_attacked and round_resolved and escaped and victory_exited else "failed"
	print("battle check ready: status=%s loaded=%s zone_found=%s no_prompt=%s battle_started=%s buttons_ok=%s command_top_right=%s formation_ok=%s enemy_before=%d enemy_after=%d ally_hp_before=%d ally_hp_after=%d attack_state_seen=%s player_attacked=%s round_resolved=%s enemy_countered=%s escaped=%s victory_exited=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(no_prompt),
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
		str(round_resolved),
		str(enemy_countered),
		str(escaped),
		str(victory_exited),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_auto_attack_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_trigger_encounter(zones[0] as Dictionary)
	await get_tree().process_frame
	var battle_started := battle_active and battle_command_panel != null and battle_command_panel.visible
	var target_id := BattleModel.living_enemy_id(battle_state)
	var target_found := target_id != ""
	if target_found:
		battle_state = _set_battle_actor_fields(battle_state, target_id, {"maxHp": 220, "hp": 220, "actionState": "idle"})
	var enemy_before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0)) if target_found else 0
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	_set_battle_auto_attack_enabled(true, false)
	var auto_button_on := battle_auto_button != null and battle_auto_button.visible and battle_auto_button.button_pressed and battle_auto_button.text == "停止"
	var player_submitted := false
	var pet_submitted := false
	var round_events_seen := false
	var enemy_damaged_seen := false
	var stop_button_seen := false
	for _frame in range(900):
		await get_tree().process_frame
		player_submitted = player_submitted or battle_auto_attack_player_submissions > 0
		pet_submitted = pet_submitted or battle_auto_attack_pet_submissions > 0
		round_events_seen = round_events_seen or battle_last_round_applied_events > 0 or battle_last_round_actor_order.has(BattleModel.PLAYER_ACTOR_ID) or battle_last_round_actor_order.has(BattleModel.PLAYER_PET_ID)
		stop_button_seen = stop_button_seen or (battle_auto_stop_button != null and battle_auto_stop_button.visible and battle_auto_stop_button.text == "停止")
		if target_found:
			enemy_damaged_seen = enemy_damaged_seen or int(BattleModel.actor_by_id(battle_state, target_id).get("hp", enemy_before)) < enemy_before
		if player_submitted and pet_submitted and round_events_seen and enemy_damaged_seen:
			break
	var enemy_after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", enemy_before)) if target_found else enemy_before
	_set_battle_auto_attack_enabled(false, false)
	var player_submissions_after_off := battle_auto_attack_player_submissions
	var pet_submissions_after_off := battle_auto_attack_pet_submissions
	for _frame in range(360):
		await get_tree().process_frame
		if battle_active and not _battle_commands_locked():
			break
	var no_new_after_off := (
		battle_auto_attack_player_submissions == player_submissions_after_off
		and battle_auto_attack_pet_submissions == pet_submissions_after_off
	)
	var auto_button_off := battle_auto_button != null and not battle_auto_button.button_pressed
	var auto_damaged_enemy := target_found and enemy_after < enemy_before
	var status := "ok" if loaded and zone_found and battle_started and target_found and auto_button_on and stop_button_seen and player_submitted and pet_submitted and round_events_seen and auto_damaged_enemy and auto_button_off and no_new_after_off else "failed"
	print("battle auto attack check ready: status=%s loaded=%s zone_found=%s battle_started=%s target=%s button_on=%s stop_button=%s player_submitted=%s pet_submitted=%s round_events=%s enemy_before=%d enemy_after=%d button_off=%s no_new_after_off=%s player_submissions=%d pet_submissions=%d" % [
		status,
		str(loaded),
		str(zone_found),
		str(battle_started),
		target_id,
		str(auto_button_on),
		str(stop_button_seen),
		str(player_submitted),
		str(pet_submitted),
		str(round_events_seen),
		enemy_before,
		enemy_after,
		str(auto_button_off),
		str(no_new_after_off),
		battle_auto_attack_player_submissions,
		battle_auto_attack_pet_submissions,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_auto_10v10_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(_create_auto_10v10_observation_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var ally_count := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ALLY)
	var enemy_count := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ENEMY)
	var formation_ok := battle_active and ally_count == 10 and enemy_count == 10
	var target_id := BattleModel.living_enemy_id(battle_state)
	var planned_events := BattleModel.build_player_pet_round_events(
		battle_state.duplicate(true),
		{"command": "attack", "targetId": target_id, "allyTargetId": BattleModel.PLAYER_ACTOR_ID},
		{"command": "attack", "targetId": target_id}
	)
	var planned_combo := false
	var planned_npc_allies: Array[String] = []
	for event_value in planned_events:
		var event := event_value as Dictionary
		if str(event.get("type", "")) == "combo_attack":
			planned_combo = true
		var participants: Array = event.get("participantIds", [])
		if participants.is_empty():
			participants = [str(event.get("attackerId", ""))]
		for participant_value in participants:
			var actor_id := str(participant_value)
			var actor := BattleModel.actor_by_id(battle_state, actor_id)
			if not actor.is_empty() and str(actor.get("side", "")) == BattleModel.SIDE_ALLY and actor_id != BattleModel.PLAYER_ACTOR_ID and actor_id != BattleModel.PLAYER_PET_ID and not planned_npc_allies.has(actor_id):
				planned_npc_allies.append(actor_id)
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	_set_battle_auto_attack_enabled(true, false)
	var auto_button_on := battle_auto_button != null and battle_auto_button.visible and battle_auto_button.button_pressed
	var stop_button_seen := false
	var seen_combo := false
	var seen_npc_allies: Array[String] = []
	var seen_player := false
	var seen_pet := false
	for _frame in range(1800):
		await get_tree().process_frame
		stop_button_seen = stop_button_seen or (battle_auto_stop_button != null and battle_auto_stop_button.visible and battle_auto_stop_button.text == "停止")
		seen_combo = seen_combo or battle_last_round_event_types.has("combo_attack") or battle_last_event_type == "combo_attack"
		seen_player = seen_player or battle_last_round_actor_order.has(BattleModel.PLAYER_ACTOR_ID)
		seen_pet = seen_pet or battle_last_round_actor_order.has(BattleModel.PLAYER_PET_ID)
		for actor_id_value in battle_last_round_actor_order:
			var actor_id := str(actor_id_value)
			var actor := BattleModel.actor_by_id(battle_state, actor_id)
			if not actor.is_empty() and str(actor.get("side", "")) == BattleModel.SIDE_ALLY and actor_id != BattleModel.PLAYER_ACTOR_ID and actor_id != BattleModel.PLAYER_PET_ID and not seen_npc_allies.has(actor_id):
				seen_npc_allies.append(actor_id)
		if seen_combo and seen_player and seen_pet and seen_npc_allies.size() >= 3:
			break
	var status := "ok" if loaded and zone_found and formation_ok and target_id != "" and planned_combo and planned_npc_allies.size() >= 3 and auto_button_on and stop_button_seen and seen_combo and seen_player and seen_pet and seen_npc_allies.size() >= 3 else "failed"
	print("battle auto 10v10 check ready: status=%s loaded=%s zone_found=%s formation=%s target=%s planned_combo=%s planned_npc_allies=%d button_on=%s stop_button=%s seen_combo=%s seen_player=%s seen_pet=%s seen_npc_allies=%d actor_order=%s events=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(formation_ok),
		target_id,
		str(planned_combo),
		planned_npc_allies.size(),
		str(auto_button_on),
		str(stop_button_seen),
		str(seen_combo),
		str(seen_player),
		str(seen_pet),
		seen_npc_allies.size(),
		",".join(battle_last_round_actor_order),
		",".join(battle_last_round_event_types),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_settings_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	var default_ok := (
		str(settings.get(AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY, "")) == AutoBattleSettingsModel.ACTION_ATTACK
		and int(settings.get(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY, 0)) == 1
		and bool(settings.get(AutoBattleSettingsModel.HEALING_ENABLED_KEY, false))
	)
	settings[AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY] = AutoBattleSettingsModel.ACTION_SPIRIT_POISON_ALL_1
	settings[AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY] = AutoBattleSettingsModel.ACTION_ATTACK
	settings[AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY] = 3
	settings[AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY] = 1
	settings[AutoBattleSettingsModel.TARGET_MODE_KEY] = AutoBattleSettingsModel.TARGET_LOWEST_HP
	settings[AutoBattleSettingsModel.HEALING_ENABLED_KEY] = false
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	_open_auto_settings_panel()
	await get_tree().process_frame
	var panel_ok := (
		auto_settings_panel != null
		and auto_settings_panel.visible
		and auto_settings_controls.has(AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY)
		and auto_settings_controls.has(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY)
		and auto_settings_controls.has("healPriority0")
	)
	_close_auto_settings_panel()

	var started := _start_stat_formula_test_battle()
	if started:
		var target_id := BattleModel.living_enemy_id(battle_state)
		if target_id != "":
			battle_state = _set_battle_actor_fields(battle_state, target_id, {"maxHp": 520, "hp": 520, "actionState": "idle"})
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	_set_battle_auto_attack_enabled(true, false)
	var saw_first_spirit := false
	var saw_first_pet_skill := false
	for _frame in range(1200):
		await get_tree().process_frame
		saw_first_spirit = saw_first_spirit or battle_last_round_event_types.has("spirit_poison_all") or battle_last_event_type == "spirit_poison_all"
		saw_first_pet_skill = saw_first_pet_skill or battle_last_round_event_types.has("skill_attack") or battle_last_event_type == "skill_attack"
		if saw_first_spirit and saw_first_pet_skill:
			break
	_set_battle_auto_attack_enabled(false, false)

	var normal_started := _start_stat_formula_test_battle()
	if normal_started:
		battle_state["round"] = 2
		var normal_target_id := BattleModel.living_enemy_id(battle_state)
		if normal_target_id != "":
			battle_state = _set_battle_actor_fields(battle_state, normal_target_id, {"maxHp": 520, "hp": 520, "actionState": "idle"})
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	_set_battle_auto_attack_enabled(true, false)
	var saw_normal_round := false
	var saw_normal_player := false
	var saw_normal_pet := false
	for _frame in range(1200):
		await get_tree().process_frame
		if int(battle_state.get("round", 1)) >= 2:
			saw_normal_round = true
			saw_normal_player = saw_normal_player or battle_auto_attack_player_submissions >= 1
			saw_normal_pet = saw_normal_pet or battle_auto_attack_pet_submissions >= 1
		if saw_normal_round and saw_normal_player and saw_normal_pet:
			break
	_set_battle_auto_attack_enabled(false, false)
	var strategy_ok := started and normal_started and saw_first_spirit and saw_first_pet_skill and saw_normal_round and saw_normal_player and saw_normal_pet

	player_profile = PlayerProgressModel.default_profile()
	settings = PlayerProgressModel.auto_battle_settings(player_profile)
	settings[AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY] = AutoBattleSettingsModel.ACTION_SPIRIT_GRACE_1
	settings[AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY] = AutoBattleSettingsModel.ACTION_ATTACK
	settings[AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY] = 1
	settings[AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY] = 1
	settings[AutoBattleSettingsModel.HEALING_ENABLED_KEY] = false
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	var first_once_loaded := _load_map("firebud_village_gate", "from_training_yard")
	var first_once_zones := EncounterModel.encounter_zones(map_data)
	var first_once_started := first_once_loaded and not first_once_zones.is_empty()
	if first_once_started:
		_start_battle(BattleModel.create_wild_battle(first_once_zones[0] as Dictionary))
		var once_target_id := BattleModel.living_enemy_id(battle_state)
		if once_target_id != "":
			battle_state = _set_battle_actor_fields(battle_state, once_target_id, {"maxHp": 960, "hp": 960, "actionState": "idle"})
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 80)
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	var first_once_last_sequence := battle_recorded_event_sequence
	var first_once_grace_count := 0
	var first_once_round_advanced := false
	var first_once_player_attack_after_grace := false
	_set_battle_auto_attack_enabled(true, false)
	for _frame in range(2600):
		await get_tree().process_frame
		if int(battle_state.get("round", 1)) >= 2:
			first_once_round_advanced = true
		if battle_recorded_event_sequence != first_once_last_sequence:
			first_once_last_sequence = battle_recorded_event_sequence
			var once_event_type := str(battle_last_event_ledger.get("type", battle_last_event_type))
			var once_attacker_id := str(battle_last_event_ledger.get("attackerId", ""))
			var once_round := int(battle_last_event_ledger.get("round", int(battle_state.get("round", 1))))
			if once_attacker_id == BattleModel.PLAYER_ACTOR_ID:
				if once_event_type == "spirit_heal_all":
					first_once_grace_count += 1
				elif once_event_type == "attack" and once_round >= 2:
					first_once_player_attack_after_grace = true
		if first_once_round_advanced and first_once_player_attack_after_grace and first_once_grace_count >= 1:
			break
	_set_battle_auto_attack_enabled(false, false)
	var first_once_ok := first_once_started and first_once_round_advanced and first_once_grace_count == 1 and first_once_player_attack_after_grace
	var first_once_final_phase := str(battle_state.get("phase", ""))
	var first_once_final_round := int(battle_state.get("round", 0))
	var first_once_final_timer := battle_action_timer
	var first_once_final_queue := battle_event_queue.size()
	var first_once_final_event := str(battle_last_event_ledger.get("type", battle_last_event_type))

	player_profile = PlayerProgressModel.default_profile()
	settings = PlayerProgressModel.auto_battle_settings(player_profile)
	settings[AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY] = AutoBattleSettingsModel.ACTION_ATTACK
	settings[AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY] = AutoBattleSettingsModel.ACTION_ATTACK
	settings[AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY] = 1
	settings[AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY] = 1
	settings[AutoBattleSettingsModel.HEALING_ENABLED_KEY] = true
	settings[AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY] = 90
	settings[AutoBattleSettingsModel.PET_HP_PERCENT_KEY] = 40
	settings[AutoBattleSettingsModel.HEAL_PRIORITY_KEY] = [
		AutoBattleSettingsModel.HEAL_ITEM_MEAT,
		AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE,
		AutoBattleSettingsModel.HEAL_SPIRIT_MOIST_1,
		AutoBattleSettingsModel.HEAL_SPIRIT_GRACE_1,
		AutoBattleSettingsModel.HEAL_ITEM_HEAL_ALL,
	]
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	var heal_started := _start_stat_formula_test_battle()
	if heal_started:
		battle_state = BattleModel.set_item_count(battle_state, BattleModel.ITEM_MEAT_SMALL, 0)
		battle_state = BattleModel.set_item_count(battle_state, BattleModel.ITEM_HEAL_SINGLE, 1)
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 30)
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	var heal_item_before := BattleModel.item_count(battle_state, BattleModel.ITEM_HEAL_SINGLE)
	_set_battle_auto_attack_enabled(true, false)
	var saw_item_heal: bool = await _auto_wait_for_event_type("item_heal", 1200)
	_set_battle_auto_attack_enabled(false, false)
	var heal_item_after := BattleModel.item_count(battle_state, BattleModel.ITEM_HEAL_SINGLE)
	var heal_ok := heal_started and saw_item_heal and heal_item_before == 1 and heal_item_after == 0

	var status := "ok" if default_ok and panel_ok and strategy_ok and first_once_ok and heal_ok else "failed"
	print("battle auto settings check ready: status=%s default=%s panel=%s strategy=%s first_spirit=%s first_pet_skill=%s normal_round=%s normal_player=%s normal_pet=%s first_once=%s first_once_grace_count=%d first_once_round=%s first_once_attack=%s first_once_final_phase=%s first_once_final_round=%d first_once_final_timer=%.3f first_once_final_queue=%d first_once_final_event=%s heal=%s heal_item_before=%d heal_item_after=%d" % [
		status,
		str(default_ok),
		str(panel_ok),
		str(strategy_ok),
		str(saw_first_spirit),
		str(saw_first_pet_skill),
		str(saw_normal_round),
		str(saw_normal_player),
		str(saw_normal_pet),
		str(first_once_ok),
		first_once_grace_count,
		str(first_once_round_advanced),
		str(first_once_player_attack_after_grace),
		first_once_final_phase,
		first_once_final_round,
		first_once_final_timer,
		first_once_final_queue,
		first_once_final_event,
		str(heal_ok),
		heal_item_before,
		heal_item_after,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_capture_settings_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	settings[AutoCaptureSettingsModel.ENABLED_KEY] = true
	settings[AutoCaptureSettingsModel.TARGET_MODE_KEY] = AutoCaptureSettingsModel.TARGET_ALL
	settings[AutoCaptureSettingsModel.HP_PERCENT_KEY] = 100
	settings[AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY] = AutoCaptureSettingsModel.COMPARATOR_LT
	settings[AutoCaptureSettingsModel.LEVEL_VALUE_KEY] = 999
	settings[AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY] = BattleModel.CAPTURE_TOOL_NET_REINFORCED
	settings[AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY] = AutoCaptureSettingsModel.NO_TARGET_ESCAPE
	settings[AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY] = AutoCaptureSettingsModel.DEFAULT_CAPTURE_PET_SLOT
	settings[AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY] = true
	settings[AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY] = 31
	player_profile = PlayerProgressModel.with_auto_capture_settings(player_profile, settings)
	settings = PlayerProgressModel.auto_capture_settings(player_profile)

	var normalized_ok := (
		bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false))
		and str(settings.get(AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY, "")) == AutoCaptureSettingsModel.COMPARATOR_LT
		and int(settings.get(AutoCaptureSettingsModel.LEVEL_VALUE_KEY, 0)) == 999
		and str(settings.get(AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY, "")) == BattleModel.CAPTURE_TOOL_NET_REINFORCED
		and str(settings.get(AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY, "")) == AutoCaptureSettingsModel.NO_TARGET_ESCAPE
		and int(settings.get(AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY, 0)) == AutoCaptureSettingsModel.DEFAULT_CAPTURE_PET_SLOT
	)
	var power_ok := (
		CaptureToolCatalog.capture_power_for(BattleModel.CAPTURE_TOOL_EMPTY_HAND) == 1
		and CaptureToolCatalog.capture_power_for(BattleModel.CAPTURE_TOOL_ROPE_BASIC) == 3
		and CaptureToolCatalog.capture_power_for(BattleModel.CAPTURE_TOOL_NET) == 6
		and CaptureToolCatalog.capture_power_for(BattleModel.CAPTURE_TOOL_NET_REINFORCED) == 10
	)
	var fallback_tool := CaptureToolCatalog.best_available_fallback_tool(BattleModel.CAPTURE_TOOL_NET_REINFORCED, {
		BattleModel.CAPTURE_TOOL_ROPE_BASIC: 2,
		BattleModel.CAPTURE_TOOL_NET: 1,
		BattleModel.CAPTURE_TOOL_NET_REINFORCED: 0,
	})
	var fallback_ok := fallback_tool == BattleModel.CAPTURE_TOOL_NET
	var combat_power := PetPowerModel.combat_power_for_stats({
		"maxHp": 80,
		"attack": 10,
		"defense": 6,
		"agility": 48,
	})
	var power_formula_ok := combat_power == 84

	var auto_zone := {
		"id": "auto_capture_test",
		"name": "自动捕捉测试",
		"enemyCount": 1,
		"wildPetPoolSource": "codex_catchable",
		"levelMin": 1,
		"levelMax": 10,
	}
	var selected_auto_zone := EncounterModel.zone_with_selected_wild_pet(auto_zone, encounter_rng)
	_start_battle(BattleModel.create_wild_battle(selected_auto_zone))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	var target_actor := BattleModel.actor_by_id(battle_state, target_id)
	var target_match_ok := _battle_auto_capture_actor_matches(target_actor, settings)
	var space_ok := _battle_auto_has_capture_space()
	var chosen_tool := CaptureToolCatalog.best_available_fallback_tool(
		str(settings.get(AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY, CaptureToolCatalog.EMPTY_HAND_ID)),
		BattleModel.capture_tool_inventory(battle_state)
	)
	var submit_pet_actor_id := BattleModel.controlled_pet_id(battle_state)
	var submit_ok := false
	var submit_last_sequence := battle_recorded_event_sequence
	if target_id != "":
		submit_ok = _battle_auto_try_submit_capture()
	var submit_capture_seen := false
	var submit_capture_tool_ok := false
	var submit_pet_defend_seen := submit_pet_actor_id == ""
	for _frame in range(900):
		if battle_recorded_event_sequence != submit_last_sequence:
			submit_last_sequence = battle_recorded_event_sequence
			var event_type := str(battle_last_event_ledger.get("type", battle_last_event_type))
			var attacker_id := str(battle_last_event_ledger.get("attackerId", ""))
			if event_type == "capture":
				submit_capture_seen = true
				submit_capture_tool_ok = str(battle_state.get("lastCaptureToolId", "")) == chosen_tool
			if event_type == "defend" and attacker_id == submit_pet_actor_id:
				submit_pet_defend_seen = true
			if submit_capture_seen and submit_pet_defend_seen:
				break
		await get_tree().process_frame
	var pending_capture_ok := (
		submit_ok
		and submit_capture_seen
		and submit_capture_tool_ok
		and submit_pet_defend_seen
	)
	_end_battle(true)
	await get_tree().process_frame

	var capture_partner_profile := PlayerProgressModel.with_training_partner_count(player_profile, 4)
	var capture_partner_state := PlayerProgressModel.apply_profile_to_battle_state(
		capture_partner_profile,
		BattleModel.create_training_partner_battle(selected_auto_zone, 2)
	)
	var capture_partner_target_id := BattleModel.living_enemy_id(capture_partner_state)
	var capture_partner_events := BattleModel.build_player_pet_round_events(
		capture_partner_state,
		{
			"command": "capture",
			"targetId": capture_partner_target_id,
			"captureToolId": BattleModel.CAPTURE_TOOL_EMPTY_HAND,
		},
		{
			"command": "defend",
			"targetId": "",
			"skillId": BattleModel.PET_SKILL_DEFEND,
		}
	)
	var capture_partner_defend_count := 0
	var capture_partner_hold_ok := capture_partner_target_id != "" and BattleModel.uses_10v10_formation(capture_partner_state)
	for capture_event_value in capture_partner_events:
		var capture_event := capture_event_value as Dictionary
		var event_type := str(capture_event.get("type", ""))
		var attacker := BattleModel.actor_by_id(capture_partner_state, str(capture_event.get("attackerId", "")))
		var attacker_side := str(attacker.get("side", ""))
		if attacker_side == BattleModel.SIDE_ALLY and event_type == "defend":
			capture_partner_defend_count += 1
		if attacker_side == BattleModel.SIDE_ALLY and str(capture_event.get("targetSide", "")) == BattleModel.SIDE_ENEMY and ["attack", "skill_attack", "combo_attack"].has(event_type):
			capture_partner_hold_ok = false
	capture_partner_hold_ok = capture_partner_hold_ok and capture_partner_defend_count >= 9

	var heal_hold_profile := PlayerProgressModel.with_training_partner_count(player_profile, 4)
	var heal_settings := PlayerProgressModel.auto_battle_settings(heal_hold_profile)
	heal_settings[AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY] = 90
	heal_settings[AutoBattleSettingsModel.HEAL_PRIORITY_KEY] = [
		AutoBattleSettingsModel.HEAL_SPIRIT_MOIST_1,
		AutoBattleSettingsModel.HEAL_ITEM_MEAT,
		AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE,
	]
	heal_hold_profile = PlayerProgressModel.with_auto_battle_settings(heal_hold_profile, heal_settings)
	player_profile = heal_hold_profile
	var heal_hold_state := PlayerProgressModel.apply_profile_to_battle_state(
		heal_hold_profile,
		BattleModel.create_training_partner_battle(selected_auto_zone, 3)
	)
	_start_battle(heal_hold_state)
	await get_tree().process_frame
	battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 20)
	var heal_hold_submit := _submit_battle_auto_player_action()
	var heal_hold_marked := (
		heal_hold_submit
		and bool(battle_pending_player_command.get("captureHold", false))
		and str(battle_pending_player_command.get("command", "")) != "capture"
	)
	var heal_hold_pet_submit := _submit_battle_auto_pet_action()
	var heal_hold_events: Array[Dictionary] = []
	if not battle_current_event.is_empty():
		heal_hold_events.append(battle_current_event.duplicate(true))
	for heal_event_value in battle_event_queue:
		if heal_event_value is Dictionary:
			heal_hold_events.append((heal_event_value as Dictionary).duplicate(true))
	var heal_hold_no_ally_attack_ok := heal_hold_submit and heal_hold_marked and heal_hold_pet_submit
	var heal_hold_pet_defend_seen := BattleModel.controlled_pet_id(battle_state) == ""
	var heal_hold_partner_defend_count := 0
	for heal_event_value in heal_hold_events:
		var heal_event := heal_event_value as Dictionary
		var heal_event_type := str(heal_event.get("type", ""))
		var heal_attacker_id := str(heal_event.get("attackerId", ""))
		var heal_attacker := BattleModel.actor_by_id(battle_state, heal_attacker_id)
		var heal_attacker_side := str(heal_attacker.get("side", ""))
		if heal_attacker_id == BattleModel.controlled_pet_id(battle_state) and heal_event_type == "defend":
			heal_hold_pet_defend_seen = true
		if heal_attacker_side == BattleModel.SIDE_ALLY and heal_event_type == "defend" and heal_attacker_id != BattleModel.PLAYER_ACTOR_ID and heal_attacker_id != BattleModel.controlled_pet_id(battle_state):
			heal_hold_partner_defend_count += 1
		if heal_attacker_side == BattleModel.SIDE_ALLY and str(heal_event.get("targetSide", "")) == BattleModel.SIDE_ENEMY and ["attack", "skill_attack", "combo_attack"].has(heal_event_type):
			heal_hold_no_ally_attack_ok = false
	heal_hold_no_ally_attack_ok = heal_hold_no_ally_attack_ok and heal_hold_pet_defend_seen and heal_hold_partner_defend_count >= 8
	_end_battle(true)
	await get_tree().process_frame

	var no_target_settings := settings.duplicate(true)
	no_target_settings[AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY] = AutoCaptureSettingsModel.COMPARATOR_EQ
	no_target_settings[AutoCaptureSettingsModel.LEVEL_VALUE_KEY] = 999
	no_target_settings[AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY] = AutoCaptureSettingsModel.NO_TARGET_ESCAPE
	player_profile = PlayerProgressModel.with_auto_capture_settings(player_profile, no_target_settings)
	_start_battle(BattleModel.create_wild_battle(EncounterModel.zone_with_selected_wild_pet(auto_zone, encounter_rng)))
	await get_tree().process_frame
	var no_target_submit := _submit_battle_auto_player_action()
	await get_tree().process_frame
	var no_target_escape_ok := no_target_submit and not battle_active
	await get_tree().process_frame

	var success_message_settings := settings.duplicate(true)
	success_message_settings[AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY] = AutoCaptureSettingsModel.COMPARATOR_EQ
	success_message_settings[AutoCaptureSettingsModel.LEVEL_VALUE_KEY] = 1
	success_message_settings[AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY] = AutoCaptureSettingsModel.NO_TARGET_ESCAPE
	player_profile = PlayerProgressModel.with_auto_capture_settings(PlayerProgressModel.default_profile(), success_message_settings)
	_start_battle(BattleModel.create_training_partner_battle(EncounterModel.zone_with_selected_wild_pet(auto_zone, encounter_rng), 2))
	await get_tree().process_frame
	var success_enemy_ids := BattleModel.living_actor_ids(battle_state, BattleModel.SIDE_ENEMY)
	if success_enemy_ids.size() >= 2:
		battle_state = _set_battle_actor_fields(battle_state, str(success_enemy_ids[0]), {
			"level": 1,
			"hp": 1,
			"maxHp": 170,
			"captured": false,
		})
		battle_state = _set_battle_actor_fields(battle_state, str(success_enemy_ids[1]), {
			"level": 5,
			"hp": 170,
			"maxHp": 170,
			"captured": false,
		})
	var success_escape_target_id := str(success_enemy_ids[0]) if not success_enemy_ids.is_empty() else ""
	if success_escape_target_id != "":
		battle_state = BattleModel.apply_battle_event(battle_state, {
			"type": "capture",
			"attackerId": BattleModel.PLAYER_ACTOR_ID,
			"targetId": success_escape_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"captureToolId": BattleModel.CAPTURE_TOOL_EMPTY_HAND,
			"success": true,
			"sequence": 2,
			"speed": 100,
		})
	battle_auto_capture_success_seen = bool(battle_state.get("lastCaptureSuccess", false))
	battle_state["phase"] = "command"
	battle_event_queue.clear()
	battle_action_timer = 0.0
	battle_end_pending = false
	_set_battle_command_owner("player")
	var success_no_target_submit := _submit_battle_auto_player_action()
	await get_tree().process_frame
	var success_no_target_message_ok := (
		success_no_target_submit
		and not battle_active
		and world_log_message.find("捕获成功。没有符合条件的捕捉目标，自动逃跑。") >= 0
		and world_log_message.find("成功逃跑。") >= 0
		and world_log_message.find("捕获") >= 0
		and world_log_message.find("战力") >= 0
	)
	await get_tree().process_frame

	var full_profile := _auto_capture_full_pet_profile()
	var full_state := PlayerProgressModel.apply_profile_to_battle_state(full_profile, BattleModel.create_wild_battle(EncounterModel.zone_with_selected_wild_pet(auto_zone, encounter_rng)))
	var full_target_id := BattleModel.living_enemy_id(full_state)
	if full_target_id != "":
		full_state = BattleModel.apply_battle_event(full_state, {
			"type": "capture",
			"attackerId": BattleModel.PLAYER_ACTOR_ID,
			"targetId": full_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"captureToolId": BattleModel.CAPTURE_TOOL_EMPTY_HAND,
			"success": true,
			"sequence": 1,
			"speed": 100,
		})
	var full_result := PlayerProgressModel.apply_battle_result(full_profile, full_state, "victory")
	var full_log_text := "\n".join(full_result.get("logLines", []))
	var full_message_ok := (
		(full_result.get("lostCapturedPets", []) as Array).size() == 1
		and full_log_text.find("捕获") >= 0
		and full_log_text.find("战力") >= 0
		and full_log_text.find("兽栏和宠物栏满，请清理") >= 0
	)

	var discard_profile := PlayerProgressModel.with_auto_capture_settings(PlayerProgressModel.default_profile(), {
		AutoCaptureSettingsModel.ENABLED_KEY: true,
		AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY: true,
		AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY: 9999,
	})
	var discard_state := PlayerProgressModel.apply_profile_to_battle_state(discard_profile, BattleModel.create_wild_battle(EncounterModel.zone_with_selected_wild_pet(auto_zone, encounter_rng)))
	var discard_target_id := BattleModel.living_enemy_id(discard_state)
	if discard_target_id != "":
		discard_state = BattleModel.apply_battle_event(discard_state, {
			"type": "capture",
			"attackerId": BattleModel.PLAYER_ACTOR_ID,
			"targetId": discard_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"captureToolId": BattleModel.CAPTURE_TOOL_EMPTY_HAND,
			"success": true,
			"sequence": 1,
			"speed": 100,
		})
	var discard_result := PlayerProgressModel.apply_battle_result(discard_profile, discard_state, "victory")
	var discard_log_text := "\n".join(discard_result.get("logLines", []))
	var discard_ok := (
		(discard_result.get("autoDiscardedPets", []) as Array).size() == 1
		and (discard_result.get("capturedPets", []) as Array).is_empty()
		and discard_log_text.find("捕获") >= 0
		and discard_log_text.find("战力") >= 0
		and discard_log_text.find("已自动丢弃") >= 0
	)

	var loaded_gm := _load_map(GM_10V10_MAP_ID)
	var gm_random_zone := _encounter_zone_by_id("gm_codex_capture_grass")
	var gm_pool := EncounterModel.wild_pet_pool(gm_random_zone) if not gm_random_zone.is_empty() else []
	var gm_selected_zone := EncounterModel.zone_with_selected_wild_pet(gm_random_zone, encounter_rng) if not gm_random_zone.is_empty() else {}
	var gm_selected_pets: Array = gm_selected_zone.get("selectedWildPets", [])
	var gm_random_count := EncounterModel.enemy_count(gm_selected_zone, 1) if not gm_selected_zone.is_empty() else 0
	var gm_random_levels_ok := gm_random_count >= 1 and gm_random_count <= 5 and gm_selected_pets.size() == gm_random_count
	for selected_pet_value in gm_selected_pets:
		var selected_pet := selected_pet_value as Dictionary if selected_pet_value is Dictionary else {}
		var selected_level := int(selected_pet.get("level", 0))
		if selected_level < 1 or selected_level > 10:
			gm_random_levels_ok = false
	var gm_random_battle_state := BattleModel.create_training_partner_battle(gm_selected_zone, gm_random_count) if gm_random_count >= 1 else {}
	var gm_random_battle_count_ok := BattleModel.side_actor_count(gm_random_battle_state, BattleModel.SIDE_ENEMY) == gm_random_count
	var gm_random_formation_ok := BattleModel.uses_10v10_formation(gm_random_battle_state)
	var gm_two_slot_state := BattleModel.create_training_partner_battle(gm_random_zone, 2) if not gm_random_zone.is_empty() else {}
	var gm_two_slot_ok := (
		not gm_two_slot_state.is_empty()
		and BattleModel.uses_10v10_formation(gm_two_slot_state)
		and str(BattleModel.actor_by_id(gm_two_slot_state, "enemy_front_1").get("slotId", "")) == "enemy.front.1"
		and str(BattleModel.actor_by_id(gm_two_slot_state, "enemy_front_2").get("slotId", "")) == "enemy.front.2"
		and BattleModel.actor_by_id(gm_two_slot_state, "enemy_front_3").is_empty()
	)
	var gm_random_ok := (
		loaded_gm
		and not gm_random_zone.is_empty()
		and int(gm_random_zone.get("enemyCountMin", 0)) == 1
		and int(gm_random_zone.get("enemyCountMax", 0)) == 5
		and str(gm_random_zone.get("formationTemplate", "")) == BattleModel.FORMATION_TEMPLATE_10V10
		and bool(gm_random_zone.get("individualWildPets", false))
		and gm_pool.size() >= PetTemplateCatalog.forms().size()
		and gm_random_levels_ok
		and gm_random_battle_count_ok
		and gm_random_formation_ok
		and gm_two_slot_ok
	)
	var status := "ok" if normalized_ok and power_ok and fallback_ok and power_formula_ok and pending_capture_ok and capture_partner_hold_ok and heal_hold_no_ally_attack_ok and no_target_escape_ok and success_no_target_message_ok and full_message_ok and discard_ok and gm_random_ok else "failed"
	print("auto capture settings check ready: status=%s normalized=%s powers=%s fallback=%s formula=%s submit=%s capture_seen=%s capture_tool=%s capture_pet_defend=%s partner_hold=%s heal_hold=%s heal_pet_defend=%s no_target_escape=%s success_no_target_msg=%s target=%s match=%s catchable=%s hp=%d/%d level=%d space=%s tool=%s full_msg=%s discard=%s gm_random=%s pool=%d random_count=%d random_levels=%s random_battle_count=%s random_formation=%s two_slots=%s" % [
		status,
		str(normalized_ok),
		str(power_ok),
		str(fallback_ok),
		str(power_formula_ok),
		str(pending_capture_ok),
		str(submit_capture_seen),
		str(submit_capture_tool_ok),
		str(submit_pet_defend_seen),
		str(capture_partner_hold_ok),
		str(heal_hold_no_ally_attack_ok),
		str(heal_hold_pet_defend_seen),
		str(no_target_escape_ok),
		str(success_no_target_message_ok),
		target_id,
		str(target_match_ok),
		str(target_actor.get("catchable", false)),
		int(target_actor.get("hp", 0)),
		int(target_actor.get("maxHp", 0)),
		int(target_actor.get("level", 0)),
		str(space_ok),
		chosen_tool,
		str(full_message_ok),
		str(discard_ok),
		str(gm_random_ok),
		gm_pool.size(),
		gm_random_count,
		str(gm_random_levels_ok),
		str(gm_random_battle_count_ok),
		str(gm_random_formation_ok),
		str(gm_two_slot_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _auto_capture_full_pet_profile() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var base_pet := PlayerProgressModel.pet_instance_by_id(profile, "pet_bui_main")
	var instances: Array = []
	for index in range(PlayerProgressModel.PARTY_LIMIT):
		var pet_instance := base_pet.duplicate(true)
		pet_instance["instanceId"] = "auto_full_party_%d" % index
		pet_instance["petId"] = pet_instance["instanceId"]
		pet_instance["name"] = "满队布伊%d" % [index + 1]
		pet_instance["state"] = PlayerProgressModel.PET_STATE_BATTLE if index == 0 else PlayerProgressModel.PET_STATE_STANDBY
		instances.append(pet_instance)
	for index in range(PlayerProgressModel.STORAGE_LIMIT):
		var storage_pet := base_pet.duplicate(true)
		storage_pet["instanceId"] = "auto_full_storage_%d" % index
		storage_pet["petId"] = storage_pet["instanceId"]
		storage_pet["name"] = "满栏布伊%d" % [index + 1]
		storage_pet["state"] = PlayerProgressModel.PET_STATE_STORAGE
		instances.append(storage_pet)
	profile["petInstances"] = instances
	profile["activePetInstanceId"] = "auto_full_party_0"
	profile["nextPetInstanceSerial"] = 1000
	return PlayerProgressModel.normalize_profile(profile)


func _run_auto_training_partner_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	player_profile = PlayerProgressModel.with_training_partner_count(player_profile, 4)
	var partner_count_ok := PlayerProgressModel.training_partner_count(player_profile) == 4
	var initial_partners := PlayerProgressModel.training_partners(player_profile)
	var clone_attack := int((initial_partners[0] as Dictionary).get("attack", 0)) if not initial_partners.is_empty() else 0
	var changed_player_profile := player_profile.duplicate(true)
	var changed_player = changed_player_profile.get("player", {}) as Dictionary
	changed_player["level"] = 8
	changed_player_profile["player"] = changed_player
	changed_player_profile = PlayerProgressModel.normalize_profile(changed_player_profile)
	var cloned_independent_ok := not initial_partners.is_empty() and int((PlayerProgressModel.training_partners(changed_player_profile)[0] as Dictionary).get("attack", -1)) == clone_attack
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found := not zones.is_empty()
	if loaded and zone_found:
		active_encounter_zone = EncounterModel.zone_with_selected_wild_pet(zones[0] as Dictionary, encounter_rng, _encounter_enemy_count_fallback())
		_start_battle(_battle_state_for_encounter_zone(active_encounter_zone))
		battle_state["comboBonusRateBySide"] = {BattleModel.SIDE_ALLY: 1.0}
		var actors: Array = battle_state.get("actors", [])
		for actor_index in range(actors.size()):
			if not (actors[actor_index] is Dictionary):
				continue
			var actor := (actors[actor_index] as Dictionary).duplicate(true)
			if str(actor.get("side", "")) == BattleModel.SIDE_ENEMY:
				actor["quick"] = 1
				actor["maxHp"] = maxi(460, int(actor.get("maxHp", 80)))
				actor["hp"] = int(actor.get("maxHp", 460))
				actors[actor_index] = actor
		battle_state["actors"] = actors
	var ally_count_ok := battle_active and BattleModel.side_actor_count(battle_state, BattleModel.SIDE_ALLY) == 10
	var enemy_count_ok := battle_active and BattleModel.side_actor_count(battle_state, BattleModel.SIDE_ENEMY) == 10
	var slots_ok := battle_active and BattleModel.occupied_slots_are_unique(battle_state)
	var enemy_order := BattleModel.living_actor_ids(battle_state, BattleModel.SIDE_ENEMY)
	var expected_enemy_order: Array[String] = [
		"enemy_front_1",
		"enemy_front_2",
		"enemy_front_3",
		"enemy_front_4",
		"enemy_front_5",
		"enemy_back_1",
		"enemy_back_2",
		"enemy_back_3",
		"enemy_back_4",
		"enemy_back_5",
	]
	var target_order_ok := enemy_order == expected_enemy_order and BattleModel.living_enemy_id(battle_state) == "enemy_front_1"
	var expected_actor_ids: Array[String] = []
	for index in range(4):
		expected_actor_ids.append("ally_training_partner_%d" % [index + 1])
		expected_actor_ids.append("ally_training_partner_pet_%d" % [index + 1])
	var actors_present := true
	for actor_id in expected_actor_ids:
		if BattleModel.actor_by_id(battle_state, actor_id).is_empty():
			actors_present = false
	var target_id := BattleModel.living_enemy_id(battle_state)
	var planned_actor_ids: Array[String] = []
	if target_id != "":
		var planned_events := BattleModel.build_player_pet_round_events(
			battle_state,
			{"command": "attack", "targetId": target_id},
			{"command": "attack", "targetId": target_id}
		)
		for event in planned_events:
			if str(event.get("type", "")) == "combo_attack":
				for participant_id in event.get("participantIds", []):
					planned_actor_ids.append(str(participant_id))
			else:
				planned_actor_ids.append(str(event.get("attackerId", "")))
	var planned_ai_ok := planned_actor_ids.has(BattleModel.PLAYER_ACTOR_ID) and planned_actor_ids.has(BattleModel.PLAYER_PET_ID)
	for actor_id in expected_actor_ids:
		planned_ai_ok = planned_ai_ok and planned_actor_ids.has(actor_id)
	battle_auto_attack_player_submissions = 0
	battle_auto_attack_pet_submissions = 0
	_set_battle_auto_attack_enabled(true, false)
	var seen_combo := false
	var seen_partner_actor := false
	var seen_partner_pet := false
	for _frame in range(1600):
		await get_tree().process_frame
		seen_combo = seen_combo or battle_last_round_event_types.has("combo_attack") or battle_last_event_type == "combo_attack"
		for actor_id in battle_last_round_actor_order:
			var actor_id_text := str(actor_id)
			seen_partner_actor = seen_partner_actor or (actor_id_text.begins_with("ally_training_partner_") and not actor_id_text.begins_with("ally_training_partner_pet_"))
			seen_partner_pet = seen_partner_pet or actor_id_text.begins_with("ally_training_partner_pet_")
		if seen_combo and seen_partner_actor and seen_partner_pet:
			break
	_set_battle_auto_attack_enabled(false, false)
	var battle_auto_ok := battle_auto_attack_player_submissions >= 1 and battle_auto_attack_pet_submissions >= 1
	var reward_state := battle_state.duplicate(true)
	var reward_actors: Array = reward_state.get("actors", [])
	for actor_index in range(reward_actors.size()):
		if not (reward_actors[actor_index] is Dictionary):
			continue
		var actor := (reward_actors[actor_index] as Dictionary).duplicate(true)
		if str(actor.get("side", "")) == BattleModel.SIDE_ENEMY:
			actor["hp"] = 0
		reward_actors[actor_index] = actor
	reward_state["actors"] = reward_actors
	var reward_result := PlayerProgressModel.apply_battle_result(player_profile, reward_state, "victory")
	var reward_profile := reward_result.get("profile", player_profile) as Dictionary
	var reward_partners := PlayerProgressModel.training_partners(reward_profile)
	var partner_exp_ok := reward_partners.size() == 4
	for partner in reward_partners:
		partner_exp_ok = partner_exp_ok and int(partner.get("level", 1)) > 1
		var pet = partner.get("pet", {})
		partner_exp_ok = partner_exp_ok and pet is Dictionary and int((pet as Dictionary).get("level", 1)) > 1
	var status := "ok" if partner_count_ok and cloned_independent_ok and loaded and zone_found and ally_count_ok and enemy_count_ok and slots_ok and target_order_ok and actors_present and planned_ai_ok and battle_auto_ok and seen_combo and seen_partner_actor and seen_partner_pet and partner_exp_ok else "failed"
	print("training partner check ready: status=%s count=%s clone_independent=%s loaded=%s zone=%s ally10=%s enemy10=%s slots=%s target_order=%s actors=%s planned_ai=%s auto=%s combo=%s partner_actor=%s partner_pet=%s partner_exp=%s planned=%s" % [
		status,
		str(partner_count_ok),
		str(cloned_independent_ok),
		str(loaded),
		str(zone_found),
		str(ally_count_ok),
		str(enemy_count_ok),
		str(slots_ok),
		str(target_order_ok),
		str(actors_present),
		str(planned_ai_ok),
		str(battle_auto_ok),
		str(seen_combo),
		str(seen_partner_actor),
		str(seen_partner_pet),
		str(partner_exp_ok),
		",".join(planned_actor_ids),
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
	battle_state = _set_battle_actor_fields(battle_state, BattleModel.PLAYER_ACTOR_ID, {"comboRateOverride": 1.0})
	battle_state = _set_battle_actor_fields(battle_state, BattleModel.PLAYER_PET_ID, {"comboRateOverride": 1.0})
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
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	player_profile = PlayerProgressModel.with_backpack_slots(
		player_profile,
		BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(player_profile), BattleModel.CAPTURE_TOOL_NET_REINFORCED, 1)
	)
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	if target_id != "":
		battle_state = BattleModel.set_actor_hp(battle_state, target_id, 12)
		battle_state = BattleModel.set_actor_status(battle_state, target_id, BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
		_force_capture_seed_for_result(BattleModel.CAPTURE_TOOL_NET_REINFORCED, true)
	_on_battle_command_pressed("capture")
	_on_battle_command_pressed("defend")
	_auto_click_enemy_target(target_id)
	_auto_submit_pet_defend_if_needed()
	var capture_event_seen := false
	var capture_event_type := ""
	var capture_success := false
	var popup_created := false
	for _frame in range(360):
		if battle_last_event_type == "capture":
			capture_event_seen = true
			capture_event_type = battle_last_event_type
			capture_success = bool(battle_state.get("lastCaptureSuccess", false))
			popup_created = battle_float_texts.size() > 0
			break
		await get_tree().process_frame
	if not capture_event_seen and battle_last_round_event_types.has("capture"):
		capture_event_seen = true
		capture_event_type = "capture"
		var captured_actor := BattleModel.actor_by_id(battle_state, target_id)
		capture_success = bool(captured_actor.get("captured", false))
		popup_created = battle_float_texts.size() > 0
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


func _run_auto_capture_tools_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	player_profile = PlayerProgressModel.with_backpack_slots(
		player_profile,
		BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(player_profile), BattleModel.CAPTURE_TOOL_NET_REINFORCED, 1)
	)
	var loaded: bool = _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found: bool = loaded and not zones.is_empty()
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	var menu_open_ok := false
	if target_id != "":
		_on_battle_command_pressed("capture")
		var empty_button := battle_command_buttons.get("attack") as Button
		var rope_button := battle_command_buttons.get("spirit") as Button
		var net_button := battle_command_buttons.get("capture") as Button
		var reinforced_button := battle_command_buttons.get("defend") as Button
		menu_open_ok = (
			battle_command_owner == "capture"
			and empty_button != null and empty_button.text == "空手"
			and rope_button != null and rope_button.text == "初级绳 x5"
			and net_button != null and net_button.text == "捕捉网 x3"
			and reinforced_button != null and reinforced_button.text == "强化网 x1"
		)

	var model_state := PlayerProgressModel.apply_profile_to_battle_state(
		PlayerProgressModel.default_profile(),
		BattleModel.create_wild_battle({"id": "capture_tools_model", "name": "捕捉道具模型"})
	)
	var model_target_id := BattleModel.living_enemy_id(model_state)
	var before_empty := BattleModel.capture_tool_inventory(model_state).duplicate(true)
	var empty_event := {
		"type": "capture",
		"attackerId": BattleModel.PLAYER_ACTOR_ID,
		"targetId": model_target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"captureToolId": BattleModel.CAPTURE_TOOL_EMPTY_HAND,
		"success": false,
		"speed": 100,
		"sequence": 1,
	}
	var empty_after_state := BattleModel.apply_battle_event(model_state.duplicate(true), empty_event)
	var empty_no_consume_ok := BattleModel.capture_tool_inventory(empty_after_state) == before_empty

	var rope_before := BattleModel.capture_tool_count(model_state, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
	var rope_event := empty_event.duplicate(true)
	rope_event["captureToolId"] = BattleModel.CAPTURE_TOOL_ROPE_BASIC
	rope_event["success"] = false
	var rope_after_state := BattleModel.apply_battle_event(model_state.duplicate(true), rope_event)
	var rope_fail_consumes_ok := BattleModel.capture_tool_count(rope_after_state, BattleModel.CAPTURE_TOOL_ROPE_BASIC) == rope_before - 1

	var low_state := model_state.duplicate(true)
	low_state = BattleModel.set_actor_hp(low_state, model_target_id, 10)
	var empty_chance := BattleModel.capture_chance(low_state, BattleModel.PLAYER_ACTOR_ID, model_target_id, BattleModel.CAPTURE_TOOL_EMPTY_HAND)
	var rope_chance := BattleModel.capture_chance(low_state, BattleModel.PLAYER_ACTOR_ID, model_target_id, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
	var net_chance := BattleModel.capture_chance(low_state, BattleModel.PLAYER_ACTOR_ID, model_target_id, BattleModel.CAPTURE_TOOL_NET)
	var reinforced_chance := BattleModel.capture_chance(low_state, BattleModel.PLAYER_ACTOR_ID, model_target_id, BattleModel.CAPTURE_TOOL_NET_REINFORCED)
	var sleep_state := BattleModel.set_actor_status(low_state.duplicate(true), model_target_id, BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	var sleep_chance := BattleModel.capture_chance(sleep_state, BattleModel.PLAYER_ACTOR_ID, model_target_id, BattleModel.CAPTURE_TOOL_NET_REINFORCED)
	var chance_order_ok := empty_chance < rope_chance and rope_chance < net_chance and net_chance < reinforced_chance and sleep_chance > reinforced_chance

	if target_id != "":
		battle_state = BattleModel.set_actor_hp(battle_state, target_id, 8)
		battle_state = BattleModel.set_actor_status(battle_state, target_id, BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
		_force_capture_seed_for_result(BattleModel.CAPTURE_TOOL_NET_REINFORCED, true)
		_on_battle_command_pressed("defend")
		_auto_click_enemy_target(target_id)
		_auto_submit_pet_defend_if_needed()
	var saw_capture: bool = await _auto_wait_for_event_type("capture", 1200)
	var ui_success_ok := saw_capture and bool(battle_state.get("lastCaptureSuccess", false)) and str(battle_state.get("lastCaptureToolId", "")) == BattleModel.CAPTURE_TOOL_NET_REINFORCED
	var reinforced_consumed_ok := PlayerProgressModel.capture_tool_count(player_profile, BattleModel.CAPTURE_TOOL_NET_REINFORCED) == 0
	var status := "ok" if loaded and zone_found and menu_open_ok and empty_no_consume_ok and rope_fail_consumes_ok and chance_order_ok and ui_success_ok and reinforced_consumed_ok else "failed"
	print("capture tools check ready: status=%s menu=%s empty_no_consume=%s rope_fail_consumes=%s chance_order=%s ui_success=%s reinforced_consumed=%s empty=%.3f rope=%.3f net=%.3f reinforced=%.3f sleep=%.3f roll=%.3f log=%s" % [
		status,
		str(menu_open_ok),
		str(empty_no_consume_ok),
		str(rope_fail_consumes_ok),
		str(chance_order_ok),
		str(ui_success_ok),
		str(reinforced_consumed_ok),
		empty_chance,
		rope_chance,
		net_chance,
		reinforced_chance,
		sleep_chance,
		float(battle_state.get("lastCaptureRoll", -1.0)),
		str(battle_state.get("message", "")).replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_capture_tools_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	if target_id != "":
		battle_state = BattleModel.set_actor_hp(battle_state, target_id, 22)
	_open_capture_command_menu()


func _force_capture_seed_for_result(tool_id: String, expected_success: bool) -> void:
	var target_id := BattleModel.living_enemy_id(battle_state)
	var player_id := BattleModel.player_actor_id(battle_state)
	if target_id == "" or player_id == "":
		return
	for index in range(80):
		var seed := "phase48_capture_%s_%d" % [tool_id, index]
		battle_state["targetSeed"] = seed
		var succeeds := BattleModel.capture_would_succeed(battle_state, player_id, target_id, tool_id, 0)
		if succeeds == expected_success:
			battle_state["forcedTargetSeed"] = seed
			return


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
	errors.append_array(BattlePassiveCatalog.validation_errors())
	errors.append_array(PetSkillTrainingModel.validation_errors())
	errors.append_array(PetTemplateCatalog.validation_errors())
	var grace_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_GRACE_1)
	var moist_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_MOIST_1)
	var poison_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_POISON_1)
	var poison_all_rule := BattleActionCatalog.target_rule_for(BattleModel.SPIRIT_POISON_MIST_1)
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
	var pet_slot_ok := (
		str(BattleActionCatalog.pet_skill_action_for_slot(3).get("id", "")) == BattleModel.PET_SKILL_BUI_CHARGE
		and str(BattleActionCatalog.pet_skill_action_for_slot(7).get("id", "")) == BattleModel.PET_SKILL_FOCUS_BITE
	)
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
	var pet_panel_open := battle_command_owner == "pet" and battle_command_title_label.text == "宠物"
	var pet_labels_ok := false
	if battle_command_buttons.has("attack") and battle_command_buttons.has("capture") and battle_command_buttons.has("switch_pet") and battle_command_buttons.has("run"):
		var skill_one := battle_command_buttons["attack"] as Button
		var skill_three := battle_command_buttons["capture"] as Button
		var skill_six := battle_command_buttons["switch_pet"] as Button
		var skill_seven := battle_command_buttons["run"] as Button
		pet_labels_ok = (
			skill_one != null
			and skill_three != null
			and skill_six != null
			and skill_seven != null
			and skill_one.text == "技1 攻击"
			and skill_three.text == "技3 布伊冲撞"
			and skill_six.text == "技6 石化凝视"
			and skill_seven.text == "技7"
			and skill_seven.disabled
		)
	for _frame in range(12):
		await get_tree().process_frame
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
	var standby_entry := BattleModel.pet_party_entry_by_id(battle_state, standby_pet_id)
	_on_battle_command_pressed("spirit")
	var saw_switch: bool = await _auto_wait_for_event_type("switch_pet", 900)
	var active_actor := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID)
	var active_after := BattleModel.active_pet_party_entry(battle_state)
	var old_entry := BattleModel.pet_party_entry_by_id(battle_state, str(initial_active.get("petId", "")))
	var switched_name_ok := str(active_actor.get("name", "")) == str(standby_entry.get("name", "")) and str(active_after.get("petId", "")) == standby_pet_id
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
				"forceDodge": false,
				"forceCritical": false,
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
				"forceDodge": false,
				"forceCritical": false,
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
				"forceDodge": false,
				"forceCritical": false,
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
			"canCounter": false,
			"forceDodge": false,
			"forceCritical": false,
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
	var combo_participant := BattleModel.actor_by_id(battle_state, "ally_speed_fast")
	var combo_home_start := _battle_slot_world_position(str(combo_participant.get("slotId", "")))
	battle_action_timer = battle_current_event_duration * 0.50
	var combo_home_mid := _battle_slot_world_position(str(combo_participant.get("slotId", "")))
	var combo_offset_mid := _battle_actor_event_offset(combo_participant, combo_home_mid, _battle_actor_visual_scale())
	battle_action_timer = battle_current_event_duration * 0.18
	var combo_home_late := _battle_slot_world_position(str(combo_participant.get("slotId", "")))
	var slot_stable_ok := combo_home_start.distance_to(combo_home_mid) <= 0.01 and combo_home_start.distance_to(combo_home_late) <= 0.01 and combo_offset_mid.length() > 2.0
	var no_fixed_lunge_ok := (
		_battle_actor_state_offset("attack", BattleModel.SIDE_ALLY, _battle_actor_visual_scale()).length() <= 0.01
		and _battle_actor_state_offset("combo", BattleModel.SIDE_ALLY, _battle_actor_visual_scale()).length() <= 0.01
		and _battle_actor_state_offset("skill", BattleModel.SIDE_ALLY, _battle_actor_visual_scale()).length() <= 0.01
	)
	var combo_reveal := _battle_event_result_reveal_progress(battle_current_event)
	var waits_at_old_launch_time := _battle_launch_target_progress(BATTLE_LAUNCH_TARGET_START_RATIO + 0.03) <= 0.0
	var waits_before_combo_hit := _battle_launch_target_progress(maxf(0.0, combo_reveal - 0.02)) <= 0.0
	var flies_after_combo_hit := _battle_launch_target_progress(minf(0.98, combo_reveal + 0.08)) > 0.0
	var finishes_before_event_end := _battle_launch_target_progress(0.96) >= 0.99
	var holds_until_event_end := _battle_launch_target_progress(0.995) >= 0.99
	var combo_target_after := BattleModel.actor_by_id(battle_state, target_id)
	battle_action_timer = battle_current_event_duration * minf(1.0, 1.0 - combo_reveal + 0.02)
	var combo_visual_before_hit := _battle_actor_for_visual_draw(combo_target_after)
	var combo_launch_timing_ok := combo_reveal > BATTLE_LAUNCH_TARGET_START_RATIO and waits_at_old_launch_time and waits_before_combo_hit and flies_after_combo_hit and finishes_before_event_end and holds_until_event_end and int(combo_visual_before_hit.get("hp", 0)) == 18
	battle_action_timer = 0.01
	battle_event_advance_pending = false
	_update_battle_animation(0.02)
	var final_frame_hold_ok := battle_event_advance_pending and not battle_current_event.is_empty() and _battle_current_event_progress() >= 0.99
	_update_battle_animation(0.0)
	var advances_after_final_frame := not battle_event_advance_pending and battle_current_event.is_empty() and str(battle_state.get("phase", "")) == "command"
	battle_auto_attack_enabled = true
	battle_auto_attack_delay = 0.0
	_finish_battle_round_and_open_commands()
	var auto_settle_ok := battle_auto_attack_delay >= BATTLE_AUTO_ROUND_SETTLE_DELAY - 0.001
	battle_auto_attack_enabled = false

	var status := "ok" if delayed_hp_ok and combo_launch_timing_ok and slot_stable_ok and no_fixed_lunge_ok and final_frame_hold_ok and advances_after_final_frame and auto_settle_ok else "failed"
	print("battle visual timing check ready: status=%s delayed_hp=%s combo_launch=%s slot_stable=%s no_fixed_lunge=%s final_frame=%s advance_after_final=%s auto_settle=%s reveal=%.2f combo_reveal=%.2f waits_old=%s waits_before=%s flies_after=%s finish_before_end=%s hold_end=%s" % [
		status,
		str(delayed_hp_ok),
		str(combo_launch_timing_ok),
		str(slot_stable_ok),
		str(no_fixed_lunge_ok),
		str(final_frame_hold_ok),
		str(advances_after_final_frame),
		str(auto_settle_ok),
		reveal_progress,
		combo_reveal,
		str(waits_at_old_launch_time),
		str(waits_before_combo_hit),
		str(flies_after_combo_hit),
		str(finishes_before_event_end),
		str(holds_until_event_end),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_label_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found := loaded and not zones.is_empty()
	var zone := (zones[0] as Dictionary).duplicate(true) if zone_found else {}
	if zone_found:
		zone["selectedWildPet"] = {
			"formId": "wuli_normal_fast_wind10",
			"name": "高速乌力",
			"level": 3,
			"levelMin": 1,
			"levelMax": 3,
			"battleStats": {
				"maxHp": 92,
				"attack": 11,
				"defense": 6,
				"agility": 88,
			},
		}
		_start_battle(BattleModel.create_wild_battle(zone))
	await get_tree().process_frame
	var player_actor := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_ACTOR_ID)
	var pet_actor := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID)
	var enemy_actor := BattleModel.actor_by_id(battle_state, "enemy_0")
	var player_ok := (
		str(player_actor.get("name", "")) == "见习猎人"
		and int(player_actor.get("level", 0)) == 1
		and _battle_actor_label(player_actor) == "见习猎人 Lv1"
	)
	var pet_ok := (
		str(pet_actor.get("name", "")) == "我的布伊"
		and int(pet_actor.get("level", 0)) == 1
		and _battle_actor_label(pet_actor) == "我的布伊 Lv1"
	)
	var enemy_ok := (
		str(enemy_actor.get("name", "")) == "高速乌力"
		and int(enemy_actor.get("level", 0)) == 3
		and _battle_actor_label(enemy_actor) == "高速乌力 Lv3"
	)
	player_profile = PlayerProgressModel.with_training_partner_count(PlayerProgressModel.default_profile(), 4)
	if zone_found:
		_start_battle(_battle_state_for_encounter_zone(zone))
	await get_tree().process_frame
	var large_actors: Array = battle_state.get("actors", []) if battle_active else []
	var large_count_ok := large_actors.size() == 20
	var large_labels_ok := large_count_ok
	var large_visible_ok := large_count_ok
	for value in large_actors:
		if not (value is Dictionary):
			large_labels_ok = false
			large_visible_ok = false
			continue
		var large_actor := value as Dictionary
		var label := _battle_actor_label(large_actor)
		large_labels_ok = large_labels_ok and label != "" and label.find(" Lv") >= 0
		large_visible_ok = large_visible_ok and _battle_should_show_actor_label(large_actor)
	var status := "ok" if loaded and zone_found and battle_active and player_ok and pet_ok and enemy_ok and large_count_ok and large_labels_ok and large_visible_ok else "failed"
	print("battle label check ready: status=%s player=%s pet=%s enemy=%s large_count=%s large_labels=%s large_visible=%s player_label=%s pet_label=%s enemy_label=%s" % [
		status,
		str(player_ok),
		str(pet_ok),
		str(enemy_ok),
		str(large_count_ok),
		str(large_labels_ok),
		str(large_visible_ok),
		_battle_actor_label(player_actor),
		_battle_actor_label(pet_actor),
		_battle_actor_label(enemy_actor),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_event_ledger_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle event ledger check ready: status=failed started=false")
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
			"speed": 100,
				"sequence": 0,
				"movementStyle": "melee",
				"canLaunch": false,
				"forceDodge": false,
				"forceCritical": false,
			},
		{
			"type": "attack",
			"attackerId": "ally_speed_normal",
			"targetId": original_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"damage": 99,
			"speed": 90,
				"sequence": 1,
				"movementStyle": "melee",
				"canLaunch": false,
				"forceDodge": false,
				"forceCritical": false,
			},
		{
			"type": "attack",
			"attackerId": "ally_speed_slow",
			"targetId": original_target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"damage": 99,
			"speed": 80,
				"sequence": 2,
				"movementStyle": "melee",
				"canLaunch": false,
				"forceDodge": false,
				"forceCritical": false,
			},
	]
	battle_last_round_applied_events = 0
	battle_last_round_event_types.clear()
	battle_last_round_actor_order.clear()
	battle_last_round_speeds.clear()
	battle_last_round_enemy_target_ids.clear()
	battle_state["phase"] = "round_events"
	_play_next_battle_event()
	var first_ledger := battle_last_event_ledger.duplicate(true)
	var first_display_target := str(battle_current_event.get("targetId", ""))
	var expected_second_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_speed_normal", second_target_id)

	battle_action_timer = 0.01
	_update_battle_animation(0.02)
	await get_tree().process_frame
	var second_ledger := battle_last_event_ledger.duplicate(true)
	var second_display_target := str(battle_current_event.get("targetId", ""))
	var expected_third_target := BattleModel.living_enemy_id(battle_state)

	battle_action_timer = 0.01
	_update_battle_animation(0.02)
	await get_tree().process_frame
	var third_ledger := battle_last_event_ledger.duplicate(true)
	var third_display_target := str(battle_current_event.get("targetId", ""))

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle event ledger check ready: status=failed restarted=false")
		get_tree().quit(1)
		return
	var combo_target_id := "enemy_front_3"
	battle_state = BattleModel.set_actor_hp(battle_state, combo_target_id, 18)
	battle_event_queue = [{
		"type": "combo_attack",
		"attackerId": "ally_speed_fast",
		"participantIds": ["ally_speed_fast", "ally_attack_high"],
		"targetId": combo_target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 96,
		"speed": 120,
		"sequence": 3,
		"movementStyle": "melee_combo",
		"canLaunch": true,
		"launchMode": "bounce",
	}]
	battle_state["phase"] = "round_events"
	_play_next_battle_event()
	var combo_ledger := battle_last_event_ledger.duplicate(true)
	var combo_timeline := combo_ledger.get("timeline", {}) as Dictionary
	var trace_has_ledger := false
	if battle_trace_path != "":
		var trace_file := FileAccess.open(battle_trace_path, FileAccess.READ)
		if trace_file != null:
			var trace_text := trace_file.get_as_text()
			trace_file.close()
			trace_has_ledger = trace_text.find("\"kind\":\"battle_event_ledger\"") >= 0

	var first_ok := int(first_ledger.get("schemaVersion", 0)) == 1 and str(first_ledger.get("declaredTargetId", "")) == original_target_id and str(first_ledger.get("resolvedTargetId", "")) == original_target_id and first_display_target == original_target_id
	var second_ok := bool(second_ledger.get("retargeted", false)) and str(second_ledger.get("declaredTargetId", "")) == original_target_id and str(second_ledger.get("resolvedTargetId", "")) == second_target_id and second_display_target == second_target_id and int(second_ledger.get("damage", 0)) == expected_second_damage
	var third_ok := bool(third_ledger.get("retargeted", false)) and str(third_ledger.get("resolvedTargetId", "")) == expected_third_target and third_display_target == expected_third_target and expected_third_target != "" and expected_third_target != original_target_id and expected_third_target != second_target_id
	var combo_ok := bool(combo_ledger.get("launch", false)) and str(combo_ledger.get("launchMode", "")) == "bounce" and float(combo_timeline.get("damageRevealProgress", 0.0)) > BATTLE_LAUNCH_TARGET_START_RATIO and float(combo_timeline.get("launchStartProgress", 0.0)) >= float(combo_timeline.get("damageRevealProgress", 0.0))
	var status := "ok" if first_ok and second_ok and third_ok and combo_ok and trace_has_ledger else "failed"
	print("battle event ledger check ready: status=%s first=%s second=%s third=%s combo=%s trace=%s second_damage=%d expected_second=%d third_target=%s reveal=%.2f launch_start=%.2f" % [
		status,
		str(first_ok),
		str(second_ok),
		str(third_ok),
		str(combo_ok),
		str(trace_has_ledger),
		int(second_ledger.get("damage", 0)),
		expected_second_damage,
		expected_third_target,
		float(combo_timeline.get("damageRevealProgress", 0.0)),
		float(combo_timeline.get("launchStartProgress", 0.0)),
		])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_reaction_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle reaction check ready: status=failed started=false")
		get_tree().quit(1)
		return

	var attacker_id := BattleModel.PLAYER_ACTOR_ID
	var target_id := "enemy_front_3"
	battle_state = _set_battle_actor_fields(battle_state, target_id, {
		"dodgeRateOverride": 1.0,
		"counterRateOverride": 1.0,
	})
	var target_hp_before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	battle_state = BattleModel.apply_battle_event(battle_state, {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": BattleModel.attack_damage_preview_for(battle_state, attacker_id, target_id),
		"speed": 100,
		"sequence": 10,
		"movementStyle": "melee",
		"canLaunch": true,
	})
	var dodge_target_hp_after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	var counter_event = battle_state.get("lastCounterEvent", {})
	var dodge_ok := bool(battle_state.get("lastDodged", false)) and dodge_target_hp_after == target_hp_before and counter_event is Dictionary and not (counter_event as Dictionary).is_empty()

	battle_state = _set_battle_actor_fields(battle_state, attacker_id, {
		"dodgeRateOverride": 1.0,
		"counterRateOverride": 1.0,
	})
	if counter_event is Dictionary:
		battle_state = BattleModel.apply_battle_event(battle_state, (counter_event as Dictionary))
	var counter_no_chain_ok := bool(battle_state.get("lastDodged", false)) and not bool(battle_state.get("lastCounterTriggered", false)) and int(battle_state.get("lastDamage", 0)) == 0

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	var critical_target_id := "enemy_front_4"
	var normal_damage := BattleModel.attack_damage_preview_for(battle_state, attacker_id, critical_target_id)
	battle_state = BattleModel.apply_battle_event(battle_state, {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": critical_target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": normal_damage,
		"speed": 100,
		"sequence": 20,
		"movementStyle": "melee",
		"canLaunch": false,
		"forceDodge": false,
		"forceCritical": true,
	})
	var critical_damage := int(battle_state.get("lastDamage", 0))
	var critical_ok := bool(battle_state.get("lastCritical", false)) and critical_damage > normal_damage

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	battle_state = _set_battle_actor_fields(battle_state, target_id, {
		"dodgeRateOverride": 1.0,
	})
	var combo_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_speed_fast", target_id) + BattleModel.attack_damage_preview_for(battle_state, "ally_attack_high", target_id) + 8
	battle_state = BattleModel.apply_battle_event(battle_state, {
		"type": "combo_attack",
		"attackerId": "ally_speed_fast",
		"participantIds": ["ally_speed_fast", "ally_attack_high"],
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": combo_damage,
		"speed": 130,
		"sequence": 30,
		"movementStyle": "melee_combo",
		"canLaunch": false,
	})
	var combo_unavoidable_ok := not bool(battle_state.get("lastDodged", false)) and int(battle_state.get("lastDamage", 0)) == combo_damage

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	var wild_combo_event := {
		"type": "attack",
		"attackerId": target_id,
		"targetId": attacker_id,
		"targetSide": BattleModel.SIDE_ALLY,
	}
	var wild_combo_chance := BattleModel.combo_chance_for_event(battle_state, wild_combo_event)
	battle_state = _set_battle_actor_fields(battle_state, target_id, {"kind": "pet"})
	var pvp_combo_chance := BattleModel.combo_chance_for_event(battle_state, wild_combo_event)
	battle_state = _set_battle_actor_fields(battle_state, target_id, {"comboBonusRate": 0.15})
	var bonus_combo_chance := BattleModel.combo_chance_for_event(battle_state, wild_combo_event)
	var combo_rate_ok := absf(wild_combo_chance - 0.20) < 0.001 and absf(pvp_combo_chance - 0.50) < 0.001 and absf(bonus_combo_chance - 0.65) < 0.001

	var status := "ok" if dodge_ok and counter_no_chain_ok and critical_ok and combo_unavoidable_ok and combo_rate_ok else "failed"
	print("battle reaction check ready: status=%s dodge=%s counter_no_chain=%s critical=%s combo_unavoidable=%s combo_rate=%s wild_rate=%.2f pvp_rate=%.2f bonus_rate=%.2f normal_damage=%d critical_damage=%d combo_damage=%d" % [
		status,
		str(dodge_ok),
		str(counter_no_chain_ok),
		str(critical_ok),
		str(combo_unavoidable_ok),
		str(combo_rate_ok),
		wild_combo_chance,
		pvp_combo_chance,
		bonus_combo_chance,
		normal_damage,
		critical_damage,
		combo_damage,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_result_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var profile_player := player_profile.get("player", {}) as Dictionary
	var before_exp := int(profile_player.get("exp", 0))
	var before_pet_count := 0
	var before_instances = player_profile.get("petInstances", [])
	if before_instances is Array:
		before_pet_count = (before_instances as Array).size()
	_start_battle(BattleModel.create_wild_battle({
		"id": "battle_result_check",
		"name": "结算验证",
	}))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	var target_actor := BattleModel.actor_by_id(battle_state, target_id)
	var started := battle_active and target_id != "" and not target_actor.is_empty()
	if started:
		battle_state = BattleModel.apply_battle_event(battle_state, {
			"type": "capture",
			"attackerId": BattleModel.PLAYER_ACTOR_ID,
			"targetId": target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"success": true,
			"speed": 100,
			"sequence": 1,
		})
	var result := _finish_battle_and_return_to_world()
	await get_tree().process_frame
	var after_player := player_profile.get("player", {}) as Dictionary
	var after_instances = player_profile.get("petInstances", [])
	var after_pet_count := (after_instances as Array).size() if after_instances is Array else 0
	var captured_instance_ok := false
	if after_instances is Array:
		for value in after_instances:
			if not (value is Dictionary):
				continue
			var instance := value as Dictionary
			if str(instance.get("instanceId", "")).begins_with("pet_captured_") and str(instance.get("formId", "")).begins_with("wuli_"):
				captured_instance_ok = true
				break
	var log_text := battle_log_label.text if battle_log_label != null else ""
	var result_ok := str(result.get("result", "")) == "victory"
	var exited_ok := not battle_active and player != null and player.visible
	var log_ok := (
		world_log_message.find("获得") >= 0
		and world_log_message.find("捕获") >= 0
		and world_log_message.find("战力") >= 0
		and log_text == world_log_message
	)
	var exp_ok := int(after_player.get("exp", 0)) > before_exp or int(after_player.get("level", 1)) > int(profile_player.get("level", 1))
	var pet_count_ok := after_pet_count == before_pet_count + 1
	var panel_ok := battle_message_panel != null and battle_message_panel.visible and not battle_command_panel.visible
	var status := "ok" if started and result_ok and exited_ok and log_ok and exp_ok and pet_count_ok and captured_instance_ok and panel_ok else "failed"
	print("battle result check ready: status=%s started=%s result=%s exited=%s log=%s exp=%s pet_count=%s captured=%s panel=%s before_exp=%d after_exp=%d before_pets=%d after_pets=%d log_text=%s" % [
		status,
		str(started),
		str(result_ok),
		str(exited_ok),
		str(log_ok),
		str(exp_ok),
		str(pet_count_ok),
		str(captured_instance_ok),
		str(panel_ok),
		before_exp,
		int(after_player.get("exp", 0)),
		before_pet_count,
		after_pet_count,
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_management_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = ""
	_open_pet_panel()
	await get_tree().process_frame
	var opened := pet_panel != null and pet_panel.visible
	var selected_default := pet_selected_instance_id == "pet_bui_main"
	_select_pet_instance("pet_bui_rest")
	await get_tree().process_frame
	var rest_detail := pet_detail_label.text if pet_detail_label != null else ""
	var button_y_rest := pet_state_cycle_button.global_position.y if pet_state_cycle_button != null else -1.0
	var rest_to_battle_ready := pet_state_cycle_button != null and not pet_state_cycle_button.disabled and pet_state_cycle_button.text == "战斗" and rest_detail.find("当前不会参加战斗") < 0
	_on_pet_state_cycle_pressed()
	await get_tree().process_frame
	var rest_battle := (
		str(player_profile.get("activePetInstanceId", "")) == "pet_bui_rest"
		and str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_rest").get("state", "")) == PlayerProgressModel.PET_STATE_BATTLE
	)
	var button_y_battle := pet_state_cycle_button.global_position.y if pet_state_cycle_button != null else -2.0
	var battle_to_standby_ready := pet_state_cycle_button != null and not pet_state_cycle_button.disabled and pet_state_cycle_button.text == "待机"
	_on_pet_state_cycle_pressed()
	await get_tree().process_frame
	var rest_standby := (
		str(player_profile.get("activePetInstanceId", "")) == ""
		and str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_rest").get("state", "")) == PlayerProgressModel.PET_STATE_STANDBY
	)
	var no_pet_battle_state := PlayerProgressModel.apply_profile_to_battle_state(player_profile, BattleModel.create_wild_battle({
		"id": "pet_management_no_pet_check",
		"name": "无宠出战验证",
	}))
	var no_pet_battle_ok := BattleModel.actor_by_id(no_pet_battle_state, BattleModel.PLAYER_PET_ID).is_empty() and BattleModel.controlled_pet_id(no_pet_battle_state) == ""
	var button_y_standby := pet_state_cycle_button.global_position.y if pet_state_cycle_button != null else -3.0
	_select_pet_instance("pet_bui_speed")
	await get_tree().process_frame
	var detail_text := pet_detail_label.text if pet_detail_label != null else ""
	var detail_ok := detail_text.find("黄色普通布伊") >= 0 and detail_text.find("10风") >= 0 and detail_text.find("成长") < 0
	var standby_to_rest_ready := pet_state_cycle_button != null and not pet_state_cycle_button.disabled and pet_state_cycle_button.text == "休息"
	_on_pet_state_cycle_pressed()
	await get_tree().process_frame
	var speed_rest := str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_speed").get("state", "")) == PlayerProgressModel.PET_STATE_REST
	var speed_rest_to_battle_ready := pet_state_cycle_button != null and not pet_state_cycle_button.disabled and pet_state_cycle_button.text == "战斗"
	_on_pet_state_cycle_pressed()
	await get_tree().process_frame
	var active_after := PlayerProgressModel.active_pet(player_profile)
	var switched := str(player_profile.get("activePetInstanceId", "")) == "pet_bui_speed" and str(active_after.get("name", "")) == "黄色普通布伊"
	var button_text_clean := ["战斗", "待机", "休息"].has(pet_state_cycle_button.text if pet_state_cycle_button != null else "")
	var button_y_stable := absf(button_y_rest - button_y_battle) < 1.0 and absf(button_y_rest - button_y_standby) < 1.0
	_start_battle(BattleModel.create_wild_battle({
		"id": "pet_management_check",
		"name": "宠物管理验证",
	}))
	await get_tree().process_frame
	var battle_pet := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID)
	var battle_reads_active := str(battle_pet.get("name", "")) == "黄色普通布伊" and str(battle_pet.get("instanceId", "")) == "pet_bui_speed"
	_end_battle(true)

	var enhancement_profile := PlayerProgressModel.default_profile()
	var enhancement_instances: Array = enhancement_profile.get("petInstances", [])
	var new_storage_pet := PlayerProgressModel.create_pet_instance_from_form("pet_manage_new", "新乌力", "wuli_normal_orange_fire10", PlayerProgressModel.PET_STATE_STORAGE, 1, {
		"hp": 20,
		"maxHp": 20,
		"attack": 3,
		"defense": 2,
		"quick": 4,
	})
	new_storage_pet["isNew"] = true
	new_storage_pet["capturedSerial"] = 20
	var low_storage_pet := PlayerProgressModel.create_pet_instance_from_form("pet_manage_low", "低战乌力", "wuli_normal_orange_fire10", PlayerProgressModel.PET_STATE_STORAGE, 1, {
		"hp": 24,
		"maxHp": 24,
		"attack": 4,
		"defense": 2,
		"quick": 5,
	})
	low_storage_pet["capturedSerial"] = 19
	var high_storage_pet := PlayerProgressModel.create_pet_instance_from_form("pet_manage_high", "强乌力", "wuli_normal_fast_wind10", PlayerProgressModel.PET_STATE_STORAGE, 2, {
		"hp": 180,
		"maxHp": 180,
		"attack": 30,
		"defense": 24,
		"quick": 70,
	})
	high_storage_pet["capturedSerial"] = 18
	enhancement_instances.append(new_storage_pet)
	enhancement_instances.append(low_storage_pet)
	enhancement_instances.append(high_storage_pet)
	enhancement_profile["petInstances"] = enhancement_instances
	player_profile = PlayerProgressModel.normalize_profile(enhancement_profile)
	pet_selected_instance_id = ""
	pet_filter_mode = PET_FILTER_ALL
	pet_sort_mode = PET_SORT_POWER
	_open_pet_panel()
	await get_tree().process_frame
	var sorted_visible := _pet_panel_visible_instances()
	var power_sort_ok := sorted_visible.size() >= 2 and PetPowerModel.combat_power_for_pet(sorted_visible[0]) >= PetPowerModel.combat_power_for_pet(sorted_visible[sorted_visible.size() - 1])
	var direction_initial_ok := pet_sort_direction_button != null and pet_sort_direction_button.text == "降"
	_on_pet_sort_direction_pressed()
	await get_tree().process_frame
	var sorted_visible_asc := _pet_panel_visible_instances()
	var power_sort_asc_ok := sorted_visible_asc.size() >= 2 and PetPowerModel.combat_power_for_pet(sorted_visible_asc[0]) <= PetPowerModel.combat_power_for_pet(sorted_visible_asc[sorted_visible_asc.size() - 1])
	var direction_toggle_ok := pet_sort_direction_button != null and pet_sort_direction_button.text == "升"
	var sort_direction_ok := direction_initial_ok and power_sort_asc_ok and direction_toggle_ok
	var enhancement_list_text := ""
	for child in pet_list_container.get_children():
		if child is Button:
			enhancement_list_text += (child as Button).text + "\n"
	var list_power_new_ok := enhancement_list_text.find("战力") >= 0 and enhancement_list_text.find("新 新乌力") >= 0
	var detail_power_ok := (pet_detail_label.text if pet_detail_label != null else "").find("战力") >= 0
	pet_filter_mode = PET_FILTER_STORAGE
	pet_sort_mode = PET_SORT_DEFAULT
	_refresh_pet_panel()
	await get_tree().process_frame
	var storage_filter_ok := _pet_panel_visible_instances().size() == 3
	_select_pet_instance("pet_manage_new")
	await get_tree().process_frame
	var new_seen_ok := not bool(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_manage_new").get("isNew", true))
	_on_pet_drop_pressed()
	await get_tree().process_frame
	var storage_clear_confirm_ok := not PlayerProgressModel.pet_instance_by_id(player_profile, "pet_manage_new").is_empty() and pet_drop_button != null and pet_drop_button.text == "确认"
	_on_pet_drop_pressed()
	await get_tree().process_frame
	var storage_clear_ok := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_manage_new").is_empty()
	var management_enhanced_ok := power_sort_ok and sort_direction_ok and list_power_new_ok and detail_power_ok and storage_filter_ok and new_seen_ok and storage_clear_confirm_ok and storage_clear_ok

	var status := "ok" if opened and selected_default and rest_to_battle_ready and rest_battle and battle_to_standby_ready and rest_standby and no_pet_battle_ok and detail_ok and standby_to_rest_ready and speed_rest and speed_rest_to_battle_ready and button_text_clean and button_y_stable and switched and battle_reads_active and management_enhanced_ok else "failed"
	print("pet management check ready: status=%s opened=%s selected=%s rest_to_battle=%s rest_battle=%s battle_to_standby=%s rest_standby=%s no_pet_battle=%s detail=%s standby_to_rest=%s speed_rest=%s speed_rest_to_battle=%s button_text=%s button_y=%s switched=%s battle_active_pet=%s enhanced=%s sort=%s sort_direction=%s list_power_new=%s detail_power=%s storage_filter=%s new_seen=%s clear_confirm=%s clear=%s active=%s" % [
		status,
		str(opened),
		str(selected_default),
		str(rest_to_battle_ready),
		str(rest_battle),
		str(battle_to_standby_ready),
		str(rest_standby),
		str(no_pet_battle_ok),
		str(detail_ok),
		str(standby_to_rest_ready),
		str(speed_rest),
		str(speed_rest_to_battle_ready),
		str(button_text_clean),
		str(button_y_stable),
		str(switched),
		str(battle_reads_active),
		str(management_enhanced_ok),
		str(power_sort_ok),
		str(sort_direction_ok),
		str(list_power_new_ok),
		str(detail_power_ok),
		str(storage_filter_ok),
		str(new_seen_ok),
		str(storage_clear_confirm_ok),
		str(storage_clear_ok),
		str(player_profile.get("activePetInstanceId", "")),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_rename_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = ""
	_open_pet_panel()
	await get_tree().process_frame
	_select_pet_instance("pet_bui_speed")
	await get_tree().process_frame
	var rename_button_ready := pet_rename_button != null and pet_rename_button.visible and not pet_rename_button.disabled and pet_rename_button.text == "改名"
	_on_pet_rename_pressed()
	await get_tree().process_frame
	var rename_panel_open := (
		pet_rename_panel != null
		and pet_rename_panel.visible
		and pet_rename_input != null
		and pet_rename_input.text == "黄色普通布伊"
		and pet_rename_input.max_length == PlayerProgressModel.PET_NAME_MAX_LENGTH
	)
	if pet_rename_input != null:
		pet_rename_input.text = "小风布伊"
	_on_pet_rename_confirmed()
	await get_tree().process_frame
	var speed := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_speed")
	var list_text := ""
	var speed_button = pet_list_buttons.get("pet_bui_speed", null)
	if speed_button is Button:
		list_text = (speed_button as Button).text
	var renamed_speed := (
		str(speed.get("name", "")) == "小风布伊"
		and pet_rename_panel != null
		and not pet_rename_panel.visible
		and pet_detail_label != null
		and pet_detail_label.text.find("小风布伊") >= 0
		and str(list_text).find("小风布伊") >= 0
	)
	_on_pet_rename_pressed()
	await get_tree().process_frame
	if pet_rename_input != null:
		pet_rename_input.text = "   "
	_on_pet_rename_confirmed()
	await get_tree().process_frame
	var blank_blocked := (
		str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_speed").get("name", "")) == "小风布伊"
		and pet_rename_panel != null
		and pet_rename_panel.visible
		and world_log_message == "名字不能为空。"
	)
	var long_check := PlayerProgressModel.can_rename_pet(player_profile, "pet_bui_speed", "一二三四五六七八九")
	var long_blocked := not bool(long_check.get("ok", false)) and str(long_check.get("message", "")) == "名字最多 %d 个字。" % PlayerProgressModel.PET_NAME_MAX_LENGTH
	_close_pet_rename_panel()
	_select_pet_instance("pet_bui_main")
	await get_tree().process_frame
	_on_pet_rename_pressed()
	await get_tree().process_frame
	if pet_rename_input != null:
		pet_rename_input.text = "小火布伊"
	_on_pet_rename_confirmed()
	await get_tree().process_frame
	_start_battle(BattleModel.create_wild_battle({
		"id": "pet_rename_battle_check",
		"name": "宠物改名验证",
	}))
	await get_tree().process_frame
	var battle_pet := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID)
	var battle_reads_rename := str(battle_pet.get("name", "")) == "小火布伊" and str(battle_pet.get("instanceId", "")) == "pet_bui_main"
	_end_battle(true)
	var status := "ok" if rename_button_ready and rename_panel_open and renamed_speed and blank_blocked and long_blocked and battle_reads_rename else "failed"
	print("pet rename check ready: status=%s button=%s panel=%s renamed=%s blank_blocked=%s long_blocked=%s battle_name=%s log=%s" % [
		status,
		str(rename_button_ready),
		str(rename_panel_open),
		str(renamed_speed),
		str(blank_blocked),
		str(long_blocked),
		str(battle_reads_rename),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_recovery_check() -> void:
	profile_save_enabled = false
	pet_rest_recovery_elapsed = 0.0
	world_log_message = ""
	world_log_history.clear()
	player_profile = PlayerProgressModel.default_profile()
	var instances: Array = player_profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		match str(instance.get("instanceId", "")):
			"pet_bui_speed":
				instance["state"] = PlayerProgressModel.PET_STATE_STORAGE
				instance["hp"] = 30
			"pet_bui_rest":
				instance["state"] = PlayerProgressModel.PET_STATE_REST
				instance["hp"] = 20
			"pet_bui_tough":
				instance["state"] = PlayerProgressModel.PET_STATE_STANDBY
				instance["hp"] = 20
		instances[index] = instance
	player_profile["petInstances"] = instances
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	pet_selected_instance_id = "pet_bui_speed"
	_open_pet_panel()
	_select_pet_instance("pet_bui_speed")
	await get_tree().process_frame
	var pet_heal_removed := pet_panel != null and not _node_tree_has_button_text(pet_panel, "治疗")
	var storage_before_rest := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_speed")
	var storage_still_damaged := (
		str(storage_before_rest.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and int(storage_before_rest.get("hp", 0)) == 30
	)
	var heal_log := world_log_message

	_select_pet_instance("pet_bui_rest")
	await get_tree().process_frame
	var rest_before := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_rest")
	var rest_before_hp := int(rest_before.get("hp", 0))
	var rest_expected_heal := PlayerProgressModel.rest_recovery_amount_for_instance(rest_before)
	var tick_result := _apply_pet_rest_recovery_tick(false, true)
	await get_tree().process_frame
	var rest_after := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_rest")
	var speed_after_tick := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_speed")
	var tough_after_tick := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_tough")
	var rest_expected_hp := mini(int(rest_before.get("maxHp", 1)), rest_before_hp + rest_expected_heal)
	var rest_recovered := (
		bool(tick_result.get("ok", false))
		and int(tick_result.get("healedCount", 0)) == 1
		and int(rest_after.get("hp", 0)) == rest_expected_hp
		and str(rest_after.get("state", "")) == PlayerProgressModel.PET_STATE_REST
	)
	var storage_no_recover := (
		str(speed_after_tick.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and int(speed_after_tick.get("hp", 0)) == 30
	)
	var standby_no_recover := (
		str(tough_after_tick.get("state", "")) == PlayerProgressModel.PET_STATE_STANDBY
		and int(tough_after_tick.get("hp", 0)) == 20
	)
	var detail_refreshed := pet_detail_label != null and pet_detail_label.text.find("生命：%d/" % rest_expected_hp) >= 0
	var no_recovery_log := world_log_message == heal_log
	var timer_before_hp := int(rest_after.get("hp", 0))
	_update_pet_rest_recovery(PET_REST_RECOVER_INTERVAL_SECONDS)
	await get_tree().process_frame
	var timer_after := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_rest")
	var timer_recovered := int(timer_after.get("hp", 0)) > timer_before_hp
	var status := "ok" if pet_heal_removed and storage_still_damaged and rest_recovered and storage_no_recover and standby_no_recover and detail_refreshed and no_recovery_log and timer_recovered else "failed"
	print("pet recovery check ready: status=%s heal_removed=%s storage_damaged=%s rest_recovered=%s storage_no_recover=%s standby_no_recover=%s detail=%s quiet=%s timer=%s rest_hp=%d timer_hp=%d log=%s" % [
		status,
		str(pet_heal_removed),
		str(storage_still_damaged),
		str(rest_recovered),
		str(storage_no_recover),
		str(standby_no_recover),
		str(detail_refreshed),
		str(no_recovery_log),
		str(timer_recovered),
		rest_expected_hp,
		int(timer_after.get("hp", 0)),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_village_healer_check() -> void:
	profile_save_enabled = false
	var loaded := _load_map("firebud_village_gate")
	var healer := InteractionModel.find_by_id(map_data, "firebud_doctor")
	var npc_found := loaded and not healer.is_empty() and _dialog_item_is_healer(healer)

	var damaged_profile := _village_healer_check_profile(120)
	var quote := PlayerProgressModel.village_healer_quote(damaged_profile)
	var missing := int(quote.get("missingHp", 0))
	var cost := int(quote.get("cost", 0))
	var before_coins := PlayerProgressModel.stone_coins(damaged_profile)
	var model_result := PlayerProgressModel.apply_village_healer(damaged_profile)
	var healed_profile := model_result.get("profile", damaged_profile) as Dictionary
	var player_full := PlayerProgressModel.player_hp(healed_profile) == PlayerProgressModel.player_max_hp(healed_profile)
	var party_full := true
	for instance in PlayerProgressModel.party_pet_instances(healed_profile):
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		if int(instance.get("hp", max_hp)) != max_hp:
			party_full = false
			break
	var storage_pet := PlayerProgressModel.pet_instance_by_id(healed_profile, "pet_bui_tough")
	var storage_untouched := (
		str(storage_pet.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and int(storage_pet.get("hp", 0)) == 12
	)
	var cost_ok := cost > 0 and PlayerProgressModel.stone_coins(healed_profile) == before_coins - cost
	var model_message_ok := str(model_result.get("message", "")).find("村医治疗完成") >= 0
	var model_ok := bool(model_result.get("ok", false)) and missing > 0 and player_full and party_full and storage_untouched and cost_ok and model_message_ok

	var full_result := PlayerProgressModel.apply_village_healer(healed_profile)
	var full_no_charge := (
		not bool(full_result.get("ok", false))
		and PlayerProgressModel.stone_coins(full_result.get("profile", healed_profile) as Dictionary) == PlayerProgressModel.stone_coins(healed_profile)
		and str(full_result.get("message", "")).find("生命已满") >= 0
	)
	var poor_profile := _village_healer_check_profile(0)
	var poor_before_hp := PlayerProgressModel.player_hp(poor_profile)
	var poor_result := PlayerProgressModel.apply_village_healer(poor_profile)
	var poor_fail := (
		not bool(poor_result.get("ok", false))
		and PlayerProgressModel.player_hp(poor_result.get("profile", poor_profile) as Dictionary) == poor_before_hp
		and str(poor_result.get("message", "")).find("石币不足") >= 0
	)

	player_profile = _village_healer_check_profile(120)
	if npc_found:
		_open_interaction_dialog(healer)
	await get_tree().process_frame
	var dialog_opened := _dialog_is_open() and str(active_dialog_interaction.get("id", "")) == "firebud_doctor"
	var dialog_text := dialog_body_label.text if dialog_body_label != null else ""
	var dialog_shows_cost := dialog_text.find("预计费用") >= 0 and dialog_text.find("石币") >= 0
	var dialog_button_ok := dialog_option_button != null and dialog_option_button.text == "治疗队伍"
	_confirm_dialog_action()
	await get_tree().process_frame
	var dialog_healed := (
		world_log_message.find("村医治疗完成") >= 0
		and PlayerProgressModel.player_hp(player_profile) == PlayerProgressModel.player_max_hp(player_profile)
		and (dialog_body_label.text if dialog_body_label != null else "").find("队伍生命已满") >= 0
	)

	var status := "ok" if npc_found and model_ok and full_no_charge and poor_fail and dialog_opened and dialog_shows_cost and dialog_button_ok and dialog_healed else "failed"
	print("village healer check ready: status=%s npc=%s model=%s full=%s poor=%s dialog=%s cost_text=%s button=%s dialog_healed=%s missing=%d cost=%d coins_before=%d coins_after=%d log=%s" % [
		status,
		str(npc_found),
		str(model_ok),
		str(full_no_charge),
		str(poor_fail),
		str(dialog_opened),
		str(dialog_shows_cost),
		str(dialog_button_ok),
		str(dialog_healed),
		missing,
		cost,
		before_coins,
		PlayerProgressModel.stone_coins(healed_profile),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_record_point_check() -> void:
	profile_save_enabled = false
	var loaded := _load_map("firebud_village_gate")
	player_profile = PlayerProgressModel.default_profile()
	var record_item := InteractionModel.find_by_id(map_data, "firebud_record_pillar")
	var record_found := loaded and not record_item.is_empty() and _dialog_item_is_record_point(record_item)
	if record_found:
		_open_interaction_dialog(record_item)
	await get_tree().process_frame
	var dialog_opened := _dialog_is_open() and str(active_dialog_interaction.get("id", "")) == "firebud_record_pillar"
	var dialog_text := dialog_body_label.text if dialog_body_label != null else ""
	var dialog_hint_ok := dialog_text.find("当前记录点") >= 0
	var dialog_button_ok := dialog_option_button != null and dialog_option_button.text == "保存"
	if dialog_opened:
		_confirm_dialog_action()
	await get_tree().process_frame
	var saved_point := PlayerProgressModel.record_point(player_profile)
	var saved_ok := (
		str(saved_point.get("mapId", "")) == "firebud_village_gate"
		and str(saved_point.get("spawnName", "")) == "doctor_record"
		and str(saved_point.get("label", "")) == "火芽村医旁记录点"
		and world_log_message.find("记录点已保存") >= 0
	)

	var normal_state := _record_point_test_battle_state(false)
	var normal_result := _finish_record_point_test_battle(normal_state)
	var normal_no_return := (
		str(normal_result.get("result", "")) == "defeat"
		and current_map_id == GM_10V10_MAP_ID
		and str(normal_result.get("log", "")).find("回到记录点") < 0
	)

	var knocked_state := _record_point_test_battle_state(true)
	var knocked_result := _finish_record_point_test_battle(knocked_state)
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position) if player != null else Vector2i.ZERO
	var knocked_return := (
		str(knocked_result.get("result", "")) == "defeat"
		and current_map_id == "firebud_village_gate"
		and player_cell == Vector2i(10, 17)
		and str(knocked_result.get("log", "")).find("回到记录点") >= 0
	)

	var high_zone := _encounter_zone_by_id("gm_high_knockaway_grass")
	if high_zone.is_empty():
		_load_map(GM_10V10_MAP_ID)
		high_zone = _encounter_zone_by_id("gm_high_knockaway_grass")
	var high_selected := EncounterModel.zone_with_selected_wild_pet(high_zone, encounter_rng) if not high_zone.is_empty() else {}
	var high_pets: Array = high_selected.get("selectedWildPets", [])
	var high_count := EncounterModel.enemy_count(high_selected, 1) if not high_selected.is_empty() else 0
	var high_ok := (
		not high_zone.is_empty()
		and high_count >= 1
		and high_count <= 5
		and high_pets.size() == high_count
	)
	for pet_value in high_pets:
		var selected_pet := pet_value as Dictionary if pet_value is Dictionary else {}
		var selected_level := int(selected_pet.get("level", 0))
		if selected_level < 120 or selected_level > 140:
			high_ok = false

	var status := "ok" if record_found and dialog_opened and dialog_hint_ok and dialog_button_ok and saved_ok and normal_no_return and knocked_return and high_ok else "failed"
	print("record point check ready: status=%s record=%s dialog=%s hint=%s button=%s saved=%s normal_no_return=%s knocked_return=%s high=%s high_count=%d cell=%s log=%s" % [
		status,
		str(record_found),
		str(dialog_opened),
		str(dialog_hint_ok),
		str(dialog_button_ok),
		str(saved_ok),
		str(normal_no_return),
		str(knocked_return),
		str(high_ok),
		high_count,
		str(player_cell),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _record_point_test_battle_state(knocked: bool) -> Dictionary:
	var state := {
		"id": "record_point_test_battle",
		"round": 1,
		"phase": "command",
		"message": "记录点测试战斗。",
		"actors": [
			{
				"id": BattleModel.PLAYER_ACTOR_ID,
				"name": "见习猎人",
				"side": BattleModel.SIDE_ALLY,
				"kind": "player",
				"slotId": "ally.back.3",
				"hp": 0,
				"maxHp": 120,
				"quick": 70,
				"attack": 18,
				"defense": 6,
				"actionState": "launched" if knocked else "down",
				"launched": knocked,
				"revivable": not knocked,
				"statuses": BattleStatusModel.empty_statuses(),
			},
			{
				"id": "enemy_front_1",
				"name": "高级乌力",
				"side": BattleModel.SIDE_ENEMY,
				"kind": "wild_pet",
				"slotId": "enemy.front.1",
				"hp": 999,
				"maxHp": 999,
				"quick": 120,
				"attack": 400,
				"defense": 50,
				"actionState": "idle",
				"statuses": BattleStatusModel.empty_statuses(),
			},
		],
	}
	if knocked:
		state["lastLaunch"] = true
	return state


func _finish_record_point_test_battle(state: Dictionary) -> Dictionary:
	_load_map(GM_10V10_MAP_ID)
	battle_state = state.duplicate(true)
	battle_active = true
	var result := _finish_battle_and_return_to_world()
	result["log"] = world_log_message
	return result


func _village_healer_check_profile(coins: int) -> Dictionary:
	var profile := PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), coins)
	profile = PlayerProgressModel.with_player_hp(profile, 10)
	var instances: Array = profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		match str(instance.get("instanceId", "")):
			"pet_bui_main":
				instance["hp"] = 30
			"pet_bui_speed":
				instance["state"] = PlayerProgressModel.PET_STATE_STANDBY
				instance["hp"] = 40
			"pet_bui_rest":
				instance["state"] = PlayerProgressModel.PET_STATE_REST
				instance["hp"] = 20
			"pet_bui_tough":
				instance["state"] = PlayerProgressModel.PET_STATE_STORAGE
				instance["hp"] = 12
		instances[index] = instance
	profile["petInstances"] = instances
	return PlayerProgressModel.normalize_profile(profile)


func _run_auto_pet_stable_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = ""
	_open_pet_panel()
	await get_tree().process_frame
	_select_pet_instance("pet_bui_tough")
	await get_tree().process_frame
	var before_party := PlayerProgressModel.party_pet_instances(player_profile).size()
	var store_button_ready := pet_stable_button != null and pet_stable_button.visible and not pet_stable_button.disabled and pet_stable_button.text == "存入"
	_on_pet_stable_pressed()
	await get_tree().process_frame
	var tough_stored := (
		str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_tough").get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and PlayerProgressModel.party_pet_instances(player_profile).size() == before_party - 1
		and pet_stable_button != null
		and pet_stable_button.text == "取出"
	)
	_on_pet_stable_pressed()
	await get_tree().process_frame
	var tough_withdrawn := (
		str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_tough").get("state", "")) == PlayerProgressModel.PET_STATE_STANDBY
		and PlayerProgressModel.party_pet_instances(player_profile).size() == before_party
		and pet_stable_button != null
		and pet_stable_button.text == "存入"
	)
	_select_pet_instance("pet_bui_main")
	await get_tree().process_frame
	_on_pet_stable_pressed()
	await get_tree().process_frame
	var main_stored := (
		str(player_profile.get("activePetInstanceId", "")) == ""
		and str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main").get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and pet_stable_button != null
		and pet_stable_button.text == "取出"
	)
	var no_pet_state := PlayerProgressModel.apply_profile_to_battle_state(player_profile, BattleModel.create_wild_battle({
		"id": "pet_stable_no_pet_check",
		"name": "兽栏无宠验证",
	}))
	var no_pet_battle_ok := BattleModel.actor_by_id(no_pet_state, BattleModel.PLAYER_PET_ID).is_empty() and BattleModel.controlled_pet_id(no_pet_state) == ""
	_on_pet_stable_pressed()
	await get_tree().process_frame
	var main_withdrawn_standby := (
		str(player_profile.get("activePetInstanceId", "")) == ""
		and str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main").get("state", "")) == PlayerProgressModel.PET_STATE_STANDBY
		and pet_stable_button != null
		and pet_stable_button.text == "存入"
	)

	player_profile = PlayerProgressModel.default_profile()
	var instances: Array = player_profile.get("petInstances", [])
	instances.append(PlayerProgressModel.create_pet_instance_from_form(
		"pet_bui_extra",
		"备用布伊",
		"bui_normal_red_fire10",
		PlayerProgressModel.PET_STATE_STANDBY,
		1
	))
	instances.append(PlayerProgressModel.create_pet_instance_from_form(
		"pet_bui_full_storage",
		"兽栏布伊",
		"bui_normal_yellow_wind10",
		PlayerProgressModel.PET_STATE_STORAGE,
		1
	))
	player_profile["petInstances"] = instances
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	pet_selected_instance_id = "pet_bui_full_storage"
	_open_pet_panel()
	_select_pet_instance("pet_bui_full_storage")
	await get_tree().process_frame
	var full_before_party := PlayerProgressModel.party_pet_instances(player_profile).size()
	var full_button_ready := pet_stable_button != null and pet_stable_button.visible and not pet_stable_button.disabled and pet_stable_button.text == "取出"
	_on_pet_stable_pressed()
	await get_tree().process_frame
	var full_blocked := (
		str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_full_storage").get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and PlayerProgressModel.party_pet_instances(player_profile).size() == full_before_party
		and world_log_message == "队伍已满。"
		and pet_stable_button != null
		and pet_stable_button.text == "取出"
	)
	var status := "ok" if store_button_ready and tough_stored and tough_withdrawn and main_stored and no_pet_battle_ok and main_withdrawn_standby and full_button_ready and full_blocked else "failed"
	print("pet stable check ready: status=%s store_button=%s tough_stored=%s tough_withdrawn=%s main_stored=%s no_pet_battle=%s main_withdrawn=%s full_button=%s full_blocked=%s before_party=%d full_party=%d log=%s" % [
		status,
		str(store_button_ready),
		str(tough_stored),
		str(tough_withdrawn),
		str(main_stored),
		str(no_pet_battle_ok),
		str(main_withdrawn_standby),
		str(full_button_ready),
		str(full_blocked),
		before_party,
		full_before_party,
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_drop_pickup_check() -> void:
	profile_save_enabled = false
	pet_drop_expire_elapsed = 0.0
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = ""
	_open_pet_panel()
	await get_tree().process_frame
	_select_pet_instance("pet_bui_main")
	await get_tree().process_frame
	var before_pet := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main")
	var drop_button_ready := pet_drop_button != null and pet_drop_button.visible and not pet_drop_button.disabled and pet_drop_button.text == "丢弃"
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	_on_pet_drop_pressed()
	await get_tree().process_frame
	var dropped := _ground_pet_drop_for_instance_id("pet_bui_main")
	var dropped_pet := PlayerProgressModel.ground_pet_drop_pet(dropped)
	var dropped_cell := PlayerProgressModel.ground_pet_drop_cell(dropped) if not dropped.is_empty() else Vector2i.ZERO
	var drop_near := maxi(absi(dropped_cell.x - player_cell.x), absi(dropped_cell.y - player_cell.y)) == 1
	var drop_public := str(dropped.get("pickupMode", "")) == PlayerProgressModel.PET_DROP_PICKUP_PUBLIC
	var drop_ttl := int(dropped.get("expiresAtSec", 0)) - int(dropped.get("createdAtSec", 0)) == PlayerProgressModel.PET_DROP_TTL_SECONDS
	var drop_preserved_id := str(dropped_pet.get("instanceId", "")) == str(before_pet.get("instanceId", ""))
	var active_cleared := str(player_profile.get("activePetInstanceId", "")) == ""
	var removed_from_team := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main").is_empty()
	var drop_log_ok := world_log_message.find("被丢在地上") >= 0
	_pickup_ground_pet_drop(str(dropped.get("dropId", "")))
	await get_tree().process_frame
	var picked_pet := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main")
	var pickup_ok := (
		not picked_pet.is_empty()
		and str(picked_pet.get("instanceId", "")) == "pet_bui_main"
		and str(picked_pet.get("state", "")) == PlayerProgressModel.PET_STATE_STANDBY
		and str(player_profile.get("activePetInstanceId", "")) == ""
		and _ground_pet_drop_for_instance_id("pet_bui_main").is_empty()
		and world_log_message.find("回到队伍") >= 0
	)

	player_profile = PlayerProgressModel.default_profile()
	var high_instances: Array = []
	high_instances.append(PlayerProgressModel.create_pet_instance_from_form(
		"pet_high_level",
		"高阶布伊",
		"bui_normal_red_fire10",
		PlayerProgressModel.PET_STATE_STANDBY,
		7
	))
	player_profile["petInstances"] = high_instances
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var check_now := int(Time.get_unix_time_from_system())
	var high_drop_result := PlayerProgressModel.drop_pet(player_profile, "pet_high_level", current_map_id, player_cell + Vector2i(1, 0), check_now)
	player_profile = high_drop_result.get("profile", player_profile)
	var high_drop_id := str(high_drop_result.get("dropId", ""))
	_pickup_ground_pet_drop(high_drop_id)
	await get_tree().process_frame
	var high_blocked := (
		PlayerProgressModel.pet_instance_by_id(player_profile, "pet_high_level").is_empty()
		and not PlayerProgressModel.ground_pet_drop_by_id(player_profile, high_drop_id).is_empty()
		and world_log_message == "不能拾取超过自己5级以上的宠物。"
	)

	player_profile = PlayerProgressModel.default_profile()
	var full_drop_result := PlayerProgressModel.drop_pet(player_profile, "pet_bui_speed", current_map_id, player_cell + Vector2i(0, 1), check_now)
	player_profile = full_drop_result.get("profile", player_profile)
	var full_drop_id := str(full_drop_result.get("dropId", ""))
	var full_instances: Array = player_profile.get("petInstances", [])
	full_instances.append(PlayerProgressModel.create_pet_instance_from_form("pet_full_a", "满队布伊甲", "bui_normal_red_fire10", PlayerProgressModel.PET_STATE_STANDBY, 1))
	full_instances.append(PlayerProgressModel.create_pet_instance_from_form("pet_full_b", "满队布伊乙", "bui_normal_yellow_wind10", PlayerProgressModel.PET_STATE_STANDBY, 1))
	player_profile["petInstances"] = full_instances
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_pickup_ground_pet_drop(full_drop_id)
	await get_tree().process_frame
	var full_blocked := (
		PlayerProgressModel.party_pet_instances(player_profile).size() == PlayerProgressModel.PARTY_LIMIT
		and not PlayerProgressModel.ground_pet_drop_by_id(player_profile, full_drop_id).is_empty()
		and world_log_message == "队伍已满。"
	)

	var expire_profile := PlayerProgressModel.default_profile()
	var expire_drop_result := PlayerProgressModel.drop_pet(expire_profile, "pet_bui_tough", current_map_id, player_cell + Vector2i(-1, 0), 1000)
	var expire_result := PlayerProgressModel.expire_ground_pet_drops(expire_drop_result.get("profile", expire_profile), 1600)
	var expire_ok := (
		bool(expire_result.get("ok", false))
		and int(expire_result.get("expiredCount", 0)) == 1
		and PlayerProgressModel.ground_pet_drops(expire_result.get("profile", {})).is_empty()
	)

	player_profile = PlayerProgressModel.default_profile()
	var fill_drops: Array = []
	var fill_serial := 1
	var fill_now := int(Time.get_unix_time_from_system())
	for offset in IsoMapModel.NEIGHBORS_8:
		var fill_cell: Vector2i = player_cell + offset
		if not IsoMapModel.is_walkable(map_data, fill_cell):
			continue
		var fill_pet := PlayerProgressModel.create_pet_instance_from_form(
			"pet_floor_%d" % fill_serial,
			"地面布伊%d" % fill_serial,
			"bui_normal_red_fire10",
			PlayerProgressModel.PET_STATE_STANDBY,
			1
		)
		fill_drops.append({
			"dropId": "ground_fill_%d" % fill_serial,
			"ownerId": PlayerProgressModel.LOCAL_PLAYER_ID,
			"pickupMode": PlayerProgressModel.PET_DROP_PICKUP_PUBLIC,
			"mapId": current_map_id,
			"cell": [fill_cell.x, fill_cell.y],
			"createdAtSec": fill_now,
			"expiresAtSec": fill_now + PlayerProgressModel.PET_DROP_TTL_SECONDS,
			"pet": fill_pet,
		})
		fill_serial += 1
	player_profile["groundPetDrops"] = fill_drops
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	pet_selected_instance_id = "pet_bui_tough"
	_open_pet_panel()
	_select_pet_instance("pet_bui_tough")
	await get_tree().process_frame
	_on_pet_drop_pressed()
	await get_tree().process_frame
	var floor_full_blocked := (
		fill_drops.size() > 0
		and world_log_message == "地面太满了"
		and not PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_tough").is_empty()
	)

	var status := "ok" if drop_button_ready and drop_near and drop_public and drop_ttl and drop_preserved_id and active_cleared and removed_from_team and drop_log_ok and pickup_ok and high_blocked and full_blocked and expire_ok and floor_full_blocked else "failed"
	print("pet drop pickup check ready: status=%s button=%s near=%s public=%s ttl=%s id=%s active_clear=%s removed=%s drop_log=%s pickup=%s high_block=%s full_block=%s expire=%s floor_full=%s log=%s" % [
		status,
		str(drop_button_ready),
		str(drop_near),
		str(drop_public),
		str(drop_ttl),
		str(drop_preserved_id),
		str(active_cleared),
		str(removed_from_team),
		str(drop_log_ok),
		str(pickup_ok),
		str(high_blocked),
		str(full_blocked),
		str(expire_ok),
		str(floor_full_blocked),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_codex_detail_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = ""
	pet_detail_mode = PET_DETAIL_MODE_INSTANCE
	_open_pet_panel()
	await get_tree().process_frame
	_select_pet_instance("pet_bui_speed")
	await get_tree().process_frame
	var instance_text := pet_detail_label.text if pet_detail_label != null else ""
	var instance_button_y := pet_state_cycle_button.global_position.y if pet_state_cycle_button != null else -1.0
	var tabs_ready := (
		pet_detail_instance_button != null
		and pet_detail_codex_button != null
		and pet_detail_instance_button.visible
		and pet_detail_codex_button.visible
		and pet_detail_instance_button.text == "个体"
		and pet_detail_codex_button.text == "图鉴"
		and pet_detail_instance_button.button_pressed
		and not pet_detail_codex_button.button_pressed
	)
	var instance_ok := (
		instance_text.find("黄色普通布伊") >= 0
		and instance_text.find("Lv1") >= 0
		and instance_text.find("生命：130/130") >= 0
		and instance_text.find("经验：0/120") >= 0
		and instance_text.find("成长") < 0
	)

	_set_pet_detail_mode(PET_DETAIL_MODE_CODEX)
	await get_tree().process_frame
	var codex_text := pet_detail_label.text if pet_detail_label != null else ""
	var codex_button_y := pet_state_cycle_button.global_position.y if pet_state_cycle_button != null else -2.0
	var codex_buttons_ok := (
		pet_detail_instance_button != null
		and pet_detail_codex_button != null
		and not pet_detail_instance_button.button_pressed
		and pet_detail_codex_button.button_pressed
	)
	var codex_ok := (
		codex_text.find("图鉴：黄色普通布伊") >= 0
		and codex_text.find("种系：布伊系") >= 0
		and codex_text.find("亚种：普通布伊") >= 0
		and codex_text.find("形态：黄色普通布伊") >= 0
		and codex_text.find("属性：10风") >= 0
		and codex_text.find("成长倾向：敏捷") >= 0
		and codex_text.find("基础能力：生命 130") >= 0
		and codex_text.find("捕捉：可捕捉") >= 0
		and codex_text.find("可用技能：攻击、防御") >= 0
		and codex_text.find("被动技能: [抗性皮肤]") >= 0
	)
	var raw_hidden := codex_text.find("bui_normal_yellow_wind10") < 0 and codex_text.find("agility_high") < 0
	var action_y_stable := absf(instance_button_y - codex_button_y) < 1.0

	_set_pet_detail_mode(PET_DETAIL_MODE_INSTANCE)
	await get_tree().process_frame
	var returned_text := pet_detail_label.text if pet_detail_label != null else ""
	var returned_ok := (
		pet_detail_instance_button != null
		and pet_detail_codex_button != null
		and pet_detail_instance_button.button_pressed
		and not pet_detail_codex_button.button_pressed
		and returned_text == instance_text
	)
	var growth_mix_label_ok := PlayerProgressModel.growth_profile_label("attack_agility") == "攻击 / 敏捷"
	var status := "ok" if tabs_ready and instance_ok and codex_buttons_ok and codex_ok and raw_hidden and action_y_stable and returned_ok and growth_mix_label_ok else "failed"
	print("pet codex detail check ready: status=%s tabs=%s instance=%s codex_buttons=%s codex=%s raw_hidden=%s action_y=%s returned=%s mixed_growth=%s" % [
		status,
		str(tabs_ready),
		str(instance_ok),
		str(codex_buttons_ok),
		str(codex_ok),
		str(raw_hidden),
		str(action_y_stable),
		str(returned_ok),
		str(growth_mix_label_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_codex_list_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	codex_selected_form_id = ""
	_open_codex_panel()
	await get_tree().process_frame
	var entries := PlayerProgressModel.codex_entries(player_profile)
	var buttons_ready := (
		codex_menu_button != null
		and codex_menu_button.text == "图鉴"
		and codex_panel != null
		and codex_panel.visible
		and codex_list_buttons.size() == entries.size()
		and entries.size() == PetTemplateCatalog.forms().size()
	)
	var default_entry := PlayerProgressModel.codex_entry_for_form(player_profile, "bui_normal_red_fire10")
	var default_owned_ok := (
		bool(default_entry.get("seen", false))
		and bool(default_entry.get("captured", false))
		and int(default_entry.get("ownedCount", 0)) == 2
	)

	_select_codex_form("bui_normal_yellow_wind10")
	await get_tree().process_frame
	var yellow_text := codex_detail_label.text if codex_detail_label != null else ""
	var yellow_ok := (
		yellow_text.find("图鉴：黄色普通布伊") >= 0
		and yellow_text.find("记录：已捕捉") >= 0
		and yellow_text.find("持有 1") >= 0
		and yellow_text.find("成长倾向：敏捷") >= 0
		and yellow_text.find("bui_normal_yellow_wind10") < 0
		and yellow_text.find("agility_high") < 0
	)
	var unseen_button = codex_list_buttons.get("wuli_normal_fast_wind10", null)
	var unseen_button_text := (unseen_button as Button).text if unseen_button is Button else ""
	var unseen_button_ok := unseen_button_text.find("？？？") >= 0 and unseen_button_text.find("高速乌力") < 0

	var empty_profile := PlayerProgressModel.default_profile()
	empty_profile["petInstances"] = []
	empty_profile["activePetInstanceId"] = ""
	empty_profile[PlayerProgressModel.PET_CODEX_SEEN_FORM_IDS_KEY] = []
	empty_profile[PlayerProgressModel.PET_CODEX_CAPTURED_FORM_IDS_KEY] = []
	player_profile = PlayerProgressModel.normalize_profile(empty_profile)
	codex_selected_form_id = "wuli_normal_fast_wind10"
	_refresh_codex_panel()
	await get_tree().process_frame
	var hidden_text := codex_detail_label.text if codex_detail_label != null else ""
	var hidden_ok := (
		hidden_text.find("图鉴：？？？") >= 0
		and hidden_text.find("记录：未遇见") >= 0
		and hidden_text.find("高速乌力") < 0
		and hidden_text.find("wuli_normal_fast_wind10") < 0
	)

	player_profile = PlayerProgressModel.record_codex_seen(player_profile, "wuli_normal_fast_wind10")
	_refresh_codex_panel()
	await get_tree().process_frame
	var seen_text := codex_detail_label.text if codex_detail_label != null else ""
	var seen_ok := (
		seen_text.find("图鉴：高速乌力") >= 0
		and seen_text.find("记录：已遇见") >= 0
		and seen_text.find("已捕捉") < 0
		and seen_text.find("wuli_normal_fast_wind10") < 0
	)

	var seen_result := PlayerProgressModel.apply_battle_result(PlayerProgressModel.default_profile(), BattleModel.create_wild_battle({
		"id": "codex_seen_check",
		"name": "图鉴遇见验证",
	}), "escape")
	var seen_profile := seen_result.get("profile", {}) as Dictionary
	var wild_seen_entry := PlayerProgressModel.codex_entry_for_form(seen_profile, "wuli_normal_orange_fire10")
	var battle_seen_ok := bool(wild_seen_entry.get("seen", false)) and not bool(wild_seen_entry.get("captured", false))

	var capture_state := BattleModel.create_wild_battle({
		"id": "codex_capture_check",
		"name": "图鉴捕捉验证",
	})
	var actors: Array = capture_state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := actors[index] as Dictionary
		if str(actor.get("id", "")) == "enemy_0":
			actor["captured"] = true
			actor["hp"] = 0
			actors[index] = actor
	capture_state["actors"] = actors
	var capture_result := PlayerProgressModel.apply_battle_result(PlayerProgressModel.default_profile(), capture_state, "victory")
	var capture_profile := capture_result.get("profile", {}) as Dictionary
	var wild_capture_entry := PlayerProgressModel.codex_entry_for_form(capture_profile, "wuli_normal_orange_fire10")
	var battle_capture_ok := (
		bool(wild_capture_entry.get("seen", false))
		and bool(wild_capture_entry.get("captured", false))
		and int(wild_capture_entry.get("ownedCount", 0)) == 1
	)

	var status := "ok" if buttons_ready and default_owned_ok and yellow_ok and unseen_button_ok and hidden_ok and seen_ok and battle_seen_ok and battle_capture_ok else "failed"
	print("pet codex list check ready: status=%s buttons=%s default_owned=%s yellow=%s unseen_button=%s hidden=%s seen=%s battle_seen=%s battle_capture=%s" % [
		status,
		str(buttons_ready),
		str(default_owned_ok),
		str(yellow_ok),
		str(unseen_button_ok),
		str(hidden_ok),
		str(seen_ok),
		str(battle_seen_ok),
		str(battle_capture_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_encounter_table_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found := loaded and not zones.is_empty()
	var zone: Dictionary = zones[0] as Dictionary if zone_found else {}
	var pool := EncounterModel.wild_pet_pool(zone) if zone_found else []
	var form_ids: Array[String] = []
	for entry in pool:
		form_ids.append(str((entry as Dictionary).get("formId", "")))
	var pool_ok := (
		form_ids.has("wuli_normal_orange_fire10")
		and form_ids.has("wuli_normal_fast_wind10")
		and form_ids.has("wuli_normal_tough_earth10")
	)

	var default_state := BattleModel.create_wild_battle(zone)
	var default_enemy := BattleModel.actor_by_id(default_state, "enemy_0")
	var default_ok := (
		str(default_enemy.get("formId", "")) == "wuli_normal_orange_fire10"
		and str(default_enemy.get("name", "")) == "野生乌力"
		and int(default_enemy.get("maxHp", 0)) == 80
		and str(default_state.get("message", "")).find("野生乌力") >= 0
	)

	var forced_fast_zone := zone.duplicate(true)
	forced_fast_zone["selectedWildPet"] = {
		"formId": "wuli_normal_fast_wind10",
		"name": "高速乌力",
		"level": 3,
		"levelMin": 1,
		"levelMax": 3,
		"battleStats": {
			"maxHp": 92,
			"attack": 11,
			"defense": 6,
			"agility": 88,
		},
	}
	var forced_fast_state := BattleModel.create_wild_battle(forced_fast_zone)
	var forced_fast_enemy := BattleModel.actor_by_id(forced_fast_state, "enemy_0")
	var forced_fast_ok := (
		str(forced_fast_enemy.get("formId", "")) == "wuli_normal_fast_wind10"
		and str(forced_fast_enemy.get("name", "")) == "高速乌力"
		and int(forced_fast_enemy.get("level", 0)) == 3
		and int(forced_fast_enemy.get("quick", 0)) == 88
	)

	var seeded_rng := RandomNumberGenerator.new()
	seeded_rng.seed = 45
	var rolled_ids: Array[String] = []
	for _index in range(160):
		var selected_zone := EncounterModel.zone_with_selected_wild_pet(zone, seeded_rng)
		var selected = selected_zone.get("selectedWildPet", {})
		if selected is Dictionary:
			var selected_id := str((selected as Dictionary).get("formId", ""))
			if selected_id != "" and not rolled_ids.has(selected_id):
				rolled_ids.append(selected_id)
	var rng_pool_ok := (
		rolled_ids.has("wuli_normal_orange_fire10")
		and rolled_ids.has("wuli_normal_fast_wind10")
		and rolled_ids.has("wuli_normal_tough_earth10")
	)

	var forced_tough_zone := zone.duplicate(true)
	forced_tough_zone["selectedWildPet"] = {
		"formId": "wuli_normal_tough_earth10",
		"name": "高防乌力",
		"level": 2,
		"levelMin": 2,
		"levelMax": 3,
		"battleStats": {
			"maxHp": 110,
			"attack": 9,
			"defense": 18,
			"agility": 36,
		},
	}
	_trigger_encounter(forced_tough_zone)
	await get_tree().process_frame
	_start_battle_from_encounter()
	await get_tree().process_frame
	var battle_enemy := BattleModel.actor_by_id(battle_state, "enemy_0")
	var battle_forced_ok := battle_active and str(battle_enemy.get("formId", "")) == "wuli_normal_tough_earth10"
	var battle_result := _finish_battle_and_return_to_world("escape")
	await get_tree().process_frame
	var codex_entry := PlayerProgressModel.codex_entry_for_form(player_profile, "wuli_normal_tough_earth10")
	var codex_seen_ok := (
		str(battle_result.get("result", "")) == "escape"
		and bool(codex_entry.get("seen", false))
		and not bool(codex_entry.get("captured", false))
	)

	var status := "ok" if loaded and zone_found and pool_ok and default_ok and forced_fast_ok and rng_pool_ok and battle_forced_ok and codex_seen_ok else "failed"
	print("pet encounter table check ready: status=%s loaded=%s zone=%s pool=%s default=%s forced_fast=%s rng_pool=%s battle_forced=%s codex_seen=%s rolled=%s log=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(pool_ok),
		str(default_ok),
		str(forced_fast_ok),
		str(rng_pool_ok),
		str(battle_forced_ok),
		str(codex_seen_ok),
		",".join(rolled_ids),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_storage_capture_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var instances: Array = player_profile.get("petInstances", [])
	instances.append(PlayerProgressModel.create_pet_instance_from_form(
		"pet_bui_extra",
		"备用布伊",
		"bui_normal_red_fire10",
		PlayerProgressModel.PET_STATE_STANDBY,
		1
	))
	player_profile["petInstances"] = instances
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var before_party := PlayerProgressModel.party_pet_instances(player_profile).size()
	var before_storage := PlayerProgressModel.storage_pet_instances(player_profile).size()
	_start_battle(BattleModel.create_wild_battle({
		"id": "pet_storage_capture_check",
		"name": "兽栏捕捉验证",
	}))
	await get_tree().process_frame
	var target_id := BattleModel.living_enemy_id(battle_state)
	var target_actor := BattleModel.actor_by_id(battle_state, target_id)
	var started := battle_active and target_id != "" and not target_actor.is_empty()
	if started:
		battle_state = BattleModel.apply_battle_event(battle_state, {
			"type": "capture",
			"attackerId": BattleModel.PLAYER_ACTOR_ID,
			"targetId": target_id,
			"targetSide": BattleModel.SIDE_ENEMY,
			"success": true,
			"speed": 100,
			"sequence": 1,
		})
	var result := _finish_battle_and_return_to_world()
	await get_tree().process_frame
	var after_party := PlayerProgressModel.party_pet_instances(player_profile).size()
	var after_storage := PlayerProgressModel.storage_pet_instances(player_profile)
	var storage_count_ok := before_party == PlayerProgressModel.PARTY_LIMIT and after_party == PlayerProgressModel.PARTY_LIMIT and after_storage.size() == before_storage + 1
	var captured_storage_ok := false
	for instance in after_storage:
		if str(instance.get("instanceId", "")).begins_with("pet_captured_") and str(instance.get("formId", "")).begins_with("wuli_"):
			captured_storage_ok = true
			break
	var result_ok := str(result.get("result", "")) == "victory" and world_log_message.find("捕捉") >= 0
	var exited_ok := not battle_active and player != null and player.visible
	var status := "ok" if started and storage_count_ok and captured_storage_ok and result_ok and exited_ok else "failed"
	print("pet storage capture check ready: status=%s started=%s storage_count=%s captured_storage=%s result=%s exited=%s before_party=%d after_party=%d before_storage=%d after_storage=%d log=%s" % [
		status,
		str(started),
		str(storage_count_ok),
		str(captured_storage_ok),
		str(result_ok),
		str(exited_ok),
		before_party,
		after_party,
		before_storage,
		after_storage.size(),
		world_log_message.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_pet_management_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = "pet_bui_speed"
	_open_pet_panel()
	_select_pet_instance("pet_bui_speed")


func _run_pet_rename_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = "pet_bui_speed"
	_open_pet_panel()
	_select_pet_instance("pet_bui_speed")
	_on_pet_rename_pressed()


func _run_pet_drop_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var drop_cell := player_cell + Vector2i(1, 0)
	var result := PlayerProgressModel.drop_pet(player_profile, "pet_bui_speed", current_map_id, drop_cell, int(Time.get_unix_time_from_system()))
	player_profile = result.get("profile", player_profile)
	_set_world_log_message(str(result.get("message", "")))


func _run_pet_codex_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = "pet_bui_speed"
	pet_detail_mode = PET_DETAIL_MODE_CODEX
	_open_pet_panel()
	_select_pet_instance("pet_bui_speed")


func _run_pet_codex_list_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	player_profile = PlayerProgressModel.record_codex_seen(player_profile, "wuli_normal_fast_wind10")
	codex_selected_form_id = "wuli_normal_fast_wind10"
	_open_codex_panel()
	_select_codex_form("wuli_normal_fast_wind10")


func _run_backpack_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	backpack_selected_slot_index = 0
	_open_backpack_panel()


func _run_backpack_world_use_preview() -> void:
	profile_save_enabled = false
	player_profile = _profile_with_pet_hp(PlayerProgressModel.default_profile(), "pet_bui_main", 68)
	backpack_selected_slot_index = 0
	_open_backpack_panel()
	_on_backpack_use_pressed()


func _run_battle_reward_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var reward_state := _battle_reward_test_state("battle_reward_preview", player_profile)
	var result := PlayerProgressModel.apply_battle_result(player_profile, reward_state, "victory")
	player_profile = result.get("profile", player_profile)
	_set_world_log_message(_battle_result_log_text(result))
	backpack_selected_slot_index = 0
	_open_backpack_panel()


func _profile_with_pet_hp(profile: Dictionary, instance_id: String, hp: int) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances: Array = next_profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) == instance_id:
			instance["hp"] = hp
		instances[index] = instance
	next_profile["petInstances"] = instances
	return PlayerProgressModel.normalize_profile(next_profile)


func _run_auto_backpack_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var slots := PlayerProgressModel.backpack_slots(player_profile)
	var slot_limit_ok := slots.size() == BackpackModel.SLOT_LIMIT
	var meat_default_ok := PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_MEAT_SMALL) == 6
	var stacked_slots := BackpackModel.set_item_count(slots, BattleModel.ITEM_MEAT_SMALL, 25)
	var meat_stack_slots := 0
	for slot in stacked_slots:
		if str(slot.get("itemId", "")) == BattleModel.ITEM_MEAT_SMALL:
			meat_stack_slots += 1
	var stack_ok := meat_stack_slots == 2 and BackpackModel.item_count(stacked_slots, BattleModel.ITEM_MEAT_SMALL) == 25
	var battle_counts := PlayerProgressModel.backpack_counts_for_context(player_profile, BackpackModel.CONTEXT_BATTLE_ITEM)
	var capture_counts := PlayerProgressModel.backpack_counts_for_context(player_profile, BackpackModel.CONTEXT_CAPTURE)
	var context_ok := (
		int(battle_counts.get(BattleModel.ITEM_MEAT_SMALL, 0)) == 6
		and not battle_counts.has(BattleModel.CAPTURE_TOOL_NET_REINFORCED)
		and int(capture_counts.get(BattleModel.CAPTURE_TOOL_NET_REINFORCED, 0)) == 1
		and not capture_counts.has(BattleModel.ITEM_MEAT_SMALL)
	)

	_open_backpack_panel()
	await get_tree().process_frame
	var panel_ok := (
		backpack_panel != null
		and backpack_panel.visible
		and backpack_slot_buttons.size() == BackpackModel.SLOT_LIMIT
		and not backpack_slot_buttons.is_empty()
		and backpack_slot_buttons[0].text.find("肉") >= 0
	)
	_close_backpack_panel()

	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found := loaded and not zones.is_empty()
	var item_menu_ok := false
	var capture_menu_ok := false
	var meat_consumed_ok := false
	if zone_found:
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
		await get_tree().process_frame
		_on_battle_command_pressed("item")
		var item_texts := _battle_visible_button_texts()
		item_menu_ok = (
			battle_command_owner == "item"
			and _button_text_for_battle_command("switch_pet").find("肉 x6") >= 0
			and not _texts_contain(item_texts, "强化网")
		)
		_on_battle_command_pressed("help")
		_on_battle_command_pressed("capture")
		var capture_texts := _battle_visible_button_texts()
		capture_menu_ok = (
			battle_command_owner == "capture"
			and _button_text_for_battle_command("defend").find("强化网 x1") >= 0
			and not _texts_contain(capture_texts, "肉")
		)
		_on_battle_command_pressed("help")
		_auto_injure_living_side(BattleModel.SIDE_ALLY, 36)
		var before_meat := BattleModel.item_count(battle_state, BattleModel.ITEM_MEAT_SMALL)
		_on_battle_command_pressed("item")
		_on_battle_command_pressed("switch_pet")
		var meat_mode_ok := battle_target_mode == "ally_item_single"
		var target_actor := BattleModel.actor_by_id(battle_state, "ally_back_2")
		var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(target_actor.get("slotId", "")))))
		_auto_submit_pet_defend_if_needed()
		var saw_meat_event: bool = await _auto_wait_for_event_type("item_heal", 1200)
		var after_meat := BattleModel.item_count(battle_state, BattleModel.ITEM_MEAT_SMALL)
		var profile_meat := PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_MEAT_SMALL)
		meat_consumed_ok = meat_mode_ok and selected and saw_meat_event and before_meat == 6 and after_meat == 5 and profile_meat == 5
	var status := "ok" if slot_limit_ok and meat_default_ok and stack_ok and context_ok and panel_ok and loaded and zone_found and item_menu_ok and capture_menu_ok and meat_consumed_ok else "failed"
	print("backpack check ready: status=%s slots=%s meat_default=%s stack=%s context=%s panel=%s item_menu=%s capture_menu=%s meat_consumed=%s" % [
		status,
		str(slot_limit_ok),
		str(meat_default_ok),
		str(stack_ok),
		str(context_ok),
		str(panel_ok),
		str(item_menu_ok),
		str(capture_menu_ok),
		str(meat_consumed_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_backpack_world_use_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var base_pet := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main")
	var max_hp := maxi(1, int(base_pet.get("maxHp", 1)))
	var start_hp := maxi(1, max_hp - 60)
	player_profile = _profile_with_pet_hp(player_profile, "pet_bui_main", start_hp)
	var start_state := str(PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main").get("state", ""))
	var context_ok := (
		BackpackModel.item_has_context(BattleModel.ITEM_MEAT_SMALL, BackpackModel.CONTEXT_BATTLE_ITEM)
		and BackpackModel.item_has_context(BattleModel.ITEM_MEAT_SMALL, BackpackModel.CONTEXT_WORLD_PET_HEAL)
		and BackpackModel.item_has_context(BattleModel.ITEM_HEAL_SINGLE, BackpackModel.CONTEXT_WORLD_PET_HEAL)
		and not BackpackModel.item_has_context(BattleModel.CAPTURE_TOOL_NET, BackpackModel.CONTEXT_WORLD_PET_HEAL)
	)

	backpack_selected_slot_index = 0
	_open_backpack_panel()
	await get_tree().process_frame
	var detail_ok := (
		backpack_detail_label != null
		and backpack_detail_label.text.find("战斗可用") >= 0
		and backpack_detail_label.text.find("世界可用") >= 0
	)
	var use_button_ok := backpack_use_button != null and backpack_use_button.visible and not backpack_use_button.disabled and backpack_use_button.text == "使用"
	_on_backpack_use_pressed()
	await get_tree().process_frame
	var target_ok := (
		backpack_target_scroll != null
		and backpack_target_scroll.visible
		and backpack_target_container != null
		and backpack_target_container.get_child_count() >= PlayerProgressModel.party_pet_instances(player_profile).size()
	)
	var before_meat := PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_MEAT_SMALL)
	_use_backpack_item_on_pet(BattleModel.ITEM_MEAT_SMALL, "pet_bui_main")
	await get_tree().process_frame
	var after_pet := PlayerProgressModel.pet_instance_by_id(player_profile, "pet_bui_main")
	var expected_hp := mini(max_hp, start_hp + BackpackModel.world_heal_amount_for(BattleModel.ITEM_MEAT_SMALL))
	var world_use_ok := (
		PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_MEAT_SMALL) == before_meat - 1
		and int(after_pet.get("hp", 0)) == expected_hp
		and str(after_pet.get("state", "")) == start_state
		and world_log_message.find("恢复") >= 0
	)

	player_profile = _profile_with_pet_hp(player_profile, "pet_bui_main", max_hp)
	var before_medicine := PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_HEAL_SINGLE)
	var full_result := PlayerProgressModel.use_world_pet_heal_item(player_profile, BattleModel.ITEM_HEAL_SINGLE, "pet_bui_main")
	player_profile = full_result.get("profile", player_profile)
	var full_block_ok := (
		not bool(full_result.get("ok", false))
		and PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_HEAL_SINGLE) == before_medicine
		and str(full_result.get("message", "")).find("生命已满") >= 0
	)

	_select_backpack_slot(7)
	await get_tree().process_frame
	var capture_hidden_ok := backpack_use_button != null and not backpack_use_button.visible and backpack_detail_label.text.find("捕捉") >= 0
	_close_backpack_panel()
	var status := "ok" if context_ok and detail_ok and use_button_ok and target_ok and world_use_ok and full_block_ok and capture_hidden_ok else "failed"
	print("backpack world use check ready: status=%s context=%s detail=%s use_button=%s targets=%s world_use=%s full_block=%s capture_hidden=%s hp=%d/%d meat=%d" % [
		status,
		str(context_ok),
		str(detail_ok),
		str(use_button_ok),
		str(target_ok),
		str(world_use_ok),
		str(full_block_ok),
		str(capture_hidden_ok),
		int(after_pet.get("hp", 0)),
		max_hp,
		PlayerProgressModel.backpack_item_count(player_profile, BattleModel.ITEM_MEAT_SMALL),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_shop_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_shop_panel(ShopCatalogModel.DEFAULT_SHOP_ID)


func _run_auto_shop_check() -> void:
	profile_save_enabled = false
	var shop_id := ShopCatalogModel.DEFAULT_SHOP_ID
	var base_profile := PlayerProgressModel.default_profile()
	var catalog_ok := (
		not ShopCatalogModel.shop_for_id(shop_id).is_empty()
		and ShopCatalogModel.buy_price_for(shop_id, BattleModel.ITEM_MEAT_SMALL) == 8
		and ShopCatalogModel.sell_price_for(shop_id, BattleModel.ITEM_MEAT_SMALL) == 4
		and ShopCatalogModel.is_sellable(shop_id, BattleModel.ITEM_POISON_ALL)
		and ShopCatalogModel.buy_price_for(shop_id, "encounter_stone_low") == 24
	)
	var default_coin_ok := PlayerProgressModel.stone_coins(base_profile) == PlayerProgressModel.DEFAULT_STONE_COINS

	var before_buy_coins := PlayerProgressModel.stone_coins(base_profile)
	var before_buy_meat := PlayerProgressModel.backpack_item_count(base_profile, BattleModel.ITEM_MEAT_SMALL)
	var buy_result := PlayerProgressModel.buy_shop_item(base_profile, shop_id, BattleModel.ITEM_MEAT_SMALL, 3)
	var buy_profile := buy_result.get("profile", {}) as Dictionary
	var buy_ok := (
		bool(buy_result.get("ok", false))
		and int(buy_result.get("amount", 0)) == 3
		and PlayerProgressModel.stone_coins(buy_profile) == before_buy_coins - ShopCatalogModel.buy_price_for(shop_id, BattleModel.ITEM_MEAT_SMALL) * 3
		and PlayerProgressModel.backpack_item_count(buy_profile, BattleModel.ITEM_MEAT_SMALL) == before_buy_meat + 3
		and str(buy_result.get("message", "")).find("x3") >= 0
	)

	var bulk_buy_profile := PlayerProgressModel.with_stone_coins(base_profile, 999)
	var bulk_buy_result := PlayerProgressModel.buy_shop_item(bulk_buy_profile, shop_id, BattleModel.ITEM_MEAT_SMALL, 99)
	var bulk_buy_after := bulk_buy_result.get("profile", {}) as Dictionary
	var bulk_buy_ok := (
		bool(bulk_buy_result.get("ok", false))
		and int(bulk_buy_result.get("amount", 0)) == 99
		and PlayerProgressModel.backpack_item_count(bulk_buy_after, BattleModel.ITEM_MEAT_SMALL) == PlayerProgressModel.backpack_item_count(bulk_buy_profile, BattleModel.ITEM_MEAT_SMALL) + 99
		and PlayerProgressModel.stone_coins(bulk_buy_after) == 999 - ShopCatalogModel.buy_price_for(shop_id, BattleModel.ITEM_MEAT_SMALL) * 99
	)

	var no_money_profile := PlayerProgressModel.with_stone_coins(base_profile, 0)
	var no_money_result := PlayerProgressModel.buy_shop_item(no_money_profile, shop_id, BattleModel.CAPTURE_TOOL_NET_REINFORCED)
	var no_money_ok := (
		not bool(no_money_result.get("ok", false))
		and str(no_money_result.get("message", "")) == "石币不够。"
		and PlayerProgressModel.stone_coins(no_money_result.get("profile", {}) as Dictionary) == 0
	)

	var full_profile := PlayerProgressModel.with_stone_coins(base_profile, 999)
	var full_slots := BackpackModel.set_item_count(
		PlayerProgressModel.backpack_slots(full_profile),
		BattleModel.ITEM_MEAT_SMALL,
		BackpackModel.SLOT_LIMIT * BackpackModel.stack_limit_for(BattleModel.ITEM_MEAT_SMALL)
	)
	full_profile = PlayerProgressModel.with_backpack_slots(full_profile, full_slots)
	var full_result := PlayerProgressModel.buy_shop_item(full_profile, shop_id, BattleModel.CAPTURE_TOOL_NET)
	var full_ok := not bool(full_result.get("ok", false)) and str(full_result.get("message", "")) == "背包已满。"

	var before_sell_coins := PlayerProgressModel.stone_coins(base_profile)
	var before_sell_meat := PlayerProgressModel.backpack_item_count(base_profile, BattleModel.ITEM_MEAT_SMALL)
	var sell_result := PlayerProgressModel.sell_shop_item(base_profile, shop_id, BattleModel.ITEM_MEAT_SMALL, 2)
	var sell_profile := sell_result.get("profile", {}) as Dictionary
	var sell_ok := (
		bool(sell_result.get("ok", false))
		and int(sell_result.get("amount", 0)) == 2
		and PlayerProgressModel.stone_coins(sell_profile) == before_sell_coins + ShopCatalogModel.sell_price_for(shop_id, BattleModel.ITEM_MEAT_SMALL) * 2
		and PlayerProgressModel.backpack_item_count(sell_profile, BattleModel.ITEM_MEAT_SMALL) == before_sell_meat - 2
		and str(sell_result.get("message", "")).find("x2") >= 0
	)

	var bulk_sell_profile := PlayerProgressModel.with_stone_coins(base_profile, 0)
	bulk_sell_profile = PlayerProgressModel.with_backpack_slots(
		bulk_sell_profile,
		BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(bulk_sell_profile), BattleModel.ITEM_MEAT_SMALL, 120)
	)
	var bulk_sell_result := PlayerProgressModel.sell_shop_item(bulk_sell_profile, shop_id, BattleModel.ITEM_MEAT_SMALL, 99)
	var bulk_sell_after := bulk_sell_result.get("profile", {}) as Dictionary
	var bulk_sell_ok := (
		bool(bulk_sell_result.get("ok", false))
		and int(bulk_sell_result.get("amount", 0)) == 99
		and PlayerProgressModel.backpack_item_count(bulk_sell_after, BattleModel.ITEM_MEAT_SMALL) == 21
		and PlayerProgressModel.stone_coins(bulk_sell_after) == ShopCatalogModel.sell_price_for(shop_id, BattleModel.ITEM_MEAT_SMALL) * 99
	)

	var empty_sell_profile := PlayerProgressModel.with_backpack_slots(
		base_profile,
		BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(base_profile), BattleModel.ITEM_MEAT_SMALL, 0)
	)
	var empty_sell_result := PlayerProgressModel.sell_shop_item(empty_sell_profile, shop_id, BattleModel.ITEM_MEAT_SMALL)
	var empty_sell_ok := (
		not bool(empty_sell_result.get("ok", false))
		and str(empty_sell_result.get("message", "")).find("数量不够") >= 0
		and PlayerProgressModel.backpack_item_count(empty_sell_result.get("profile", {}) as Dictionary, BattleModel.ITEM_MEAT_SMALL) == 0
	)

	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var shopkeeper := InteractionModel.find_by_id(map_data, "firebud_shopkeeper")
	var npc_found := loaded and not shopkeeper.is_empty()
	if npc_found:
		_open_interaction_dialog(shopkeeper)
		await get_tree().process_frame
		_confirm_dialog_action()
		await get_tree().process_frame
	var meat_button_text := str((shop_item_buttons.get(BattleModel.ITEM_MEAT_SMALL, null) as Button).text) if shop_item_buttons.get(BattleModel.ITEM_MEAT_SMALL, null) is Button else ""
	var shop_panel_ok := (
		npc_found
		and shop_panel != null
		and shop_panel.visible
		and shop_buy_button != null
		and shop_buy_button.button_pressed
		and shop_action_button != null
		and shop_action_button.text.begins_with("购买 x1")
		and shop_coin_label != null
		and shop_coin_label.text.find("石币") >= 0
		and meat_button_text.find("8石币") >= 0
		and meat_button_text.find("买 ") < 0
	)
	_set_shop_quantity(3)
	await get_tree().process_frame
	var quantity_ui_ok := (
		shop_quantity_spinbox != null
		and int(shop_quantity_spinbox.value) == 3
		and shop_action_button != null
		and shop_action_button.text.find("购买 x3") >= 0
		and shop_action_button.text.find("24石币") >= 0
	)
	_set_shop_mode("sell")
	await get_tree().process_frame
	var sell_meat_button_text := str((shop_item_buttons.get(BattleModel.ITEM_MEAT_SMALL, null) as Button).text) if shop_item_buttons.get(BattleModel.ITEM_MEAT_SMALL, null) is Button else ""
	var sell_tab_ok := (
		shop_sell_button != null
		and shop_sell_button.button_pressed
		and shop_action_button != null
		and shop_action_button.text.begins_with("出售 x1")
		and sell_meat_button_text.find("可卖 4石币") >= 0
	)
	_close_shop_panel()

	var reward_state := _battle_reward_test_state("battle_reward_check", base_profile)
	var reward_result := PlayerProgressModel.apply_battle_result(base_profile, reward_state, "victory")
	var reward_profile := reward_result.get("profile", {}) as Dictionary
	var stone_reward := maxi(0, int(reward_result.get("stoneCoinsReward", 0)))
	var reward_log := _battle_result_log_text(reward_result)
	var reward_coin_ok := (
		stone_reward > 0
		and PlayerProgressModel.stone_coins(reward_profile) == PlayerProgressModel.stone_coins(base_profile) + stone_reward
		and reward_log.find("石币") >= 0
	)

	var status := "ok" if catalog_ok and default_coin_ok and buy_ok and bulk_buy_ok and no_money_ok and full_ok and sell_ok and bulk_sell_ok and empty_sell_ok and shop_panel_ok and quantity_ui_ok and sell_tab_ok and reward_coin_ok else "failed"
	print("shop check ready: status=%s catalog=%s default_coin=%s buy=%s bulk_buy=%s no_money=%s full=%s sell=%s bulk_sell=%s empty_sell=%s panel=%s quantity_ui=%s sell_tab=%s reward_coin=%s coins=%d reward=%d" % [
		status,
		str(catalog_ok),
		str(default_coin_ok),
		str(buy_ok),
		str(bulk_buy_ok),
		str(no_money_ok),
		str(full_ok),
		str(sell_ok),
		str(bulk_sell_ok),
		str(empty_sell_ok),
		str(shop_panel_ok),
		str(quantity_ui_ok),
		str(sell_tab_ok),
		str(reward_coin_ok),
		PlayerProgressModel.stone_coins(reward_profile),
		stone_reward,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_equipment_check() -> void:
	profile_save_enabled = false
	var validation_ok := EquipmentModel.validation_errors().is_empty()
	var starter_profile := PlayerProgressModel.default_profile()
	var starter_slots := PlayerProgressModel.equipment_slots(starter_profile)
	var starter_spirits := PlayerProgressModel.equipment_spirit_ids(starter_profile)
	var starter_equipment_ok := (
		starter_slots.size() == EquipmentModel.slot_ids().size()
		and str(starter_slots.get(EquipmentModel.SLOT_ACCESSORY_LEFT, "")) == "accessory_firebud_charm"
		and str(starter_slots.get(EquipmentModel.SLOT_ACCESSORY_RIGHT, "")) == "accessory_wind_ring"
		and str(starter_slots.get(EquipmentModel.SLOT_HEAD, "")) == "helm_leather_cap"
		and str(starter_slots.get(EquipmentModel.SLOT_LEFT_HAND_WEAPON, "")) == "weapon_training_spear"
		and str(starter_slots.get(EquipmentModel.SLOT_BODY, "")) == "armor_moist_cloth"
		and str(starter_slots.get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, "")) == "weapon_stone_dagger"
		and str(starter_slots.get(EquipmentModel.SLOT_HANDS, "")) == "gloves_hide"
		and str(starter_slots.get(EquipmentModel.SLOT_FEET, "")) == "boots_grass"
		and starter_spirits.has(BattleModel.SPIRIT_GRACE_1)
		and starter_spirits.has(BattleModel.SPIRIT_MOIST_1)
		and starter_spirits.has(BattleModel.SPIRIT_POISON_1)
		and starter_spirits.has(BattleModel.SPIRIT_POISON_MIST_1)
	)
	var starter_battle_state := _battle_reward_test_state("equipment_spirit_check", starter_profile)
	var starter_player_actor := BattleModel.actor_by_id(starter_battle_state, BattleModel.PLAYER_ACTOR_ID)
	var starter_actor_spirits := BattleModel.actor_spirit_ids(starter_battle_state, BattleModel.PLAYER_ACTOR_ID)
	var starter_battle_spirit_ok := (
		not starter_player_actor.is_empty()
		and starter_actor_spirits.has(BattleModel.SPIRIT_GRACE_1)
		and starter_actor_spirits.has(BattleModel.SPIRIT_MOIST_1)
		and starter_actor_spirits.has(BattleModel.SPIRIT_POISON_1)
		and starter_actor_spirits.has(BattleModel.SPIRIT_POISON_MIST_1)
	)
	var base_profile := PlayerProgressModel.without_equipment(starter_profile)
	var catalog_ok := (
		EquipmentModel.is_equipment("weapon_wooden_club")
		and EquipmentModel.slot_for("weapon_wooden_club") == EquipmentModel.SLOT_RIGHT_HAND_WEAPON
		and EquipmentModel.stat_bonus_text_for("weapon_wooden_club").find("攻击 +6") >= 0
		and not ShopCatalogModel.shop_for_id(FIREBUD_EQUIPMENT_SHOP_ID).is_empty()
		and ShopCatalogModel.buy_price_for(FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club") == 45
	)

	var buy_result := PlayerProgressModel.buy_shop_item(base_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	var buy_profile := buy_result.get("profile", {}) as Dictionary
	var buy_ok := (
		bool(buy_result.get("ok", false))
		and PlayerProgressModel.backpack_item_count(buy_profile, "weapon_wooden_club") == 1
		and PlayerProgressModel.stone_coins(buy_profile) == PlayerProgressModel.DEFAULT_STONE_COINS - 45
	)
	var equip_result := PlayerProgressModel.equip_item(buy_profile, "weapon_wooden_club")
	var equip_profile := equip_result.get("profile", {}) as Dictionary
	var bonus := PlayerProgressModel.equipment_stat_bonus(equip_profile)
	var wood_stat_summary := PlayerProgressModel.player_stat_summary(equip_profile)
	var wood_stat_base := wood_stat_summary.get("base", {}) as Dictionary
	var wood_stat_bonus := wood_stat_summary.get("bonus", {}) as Dictionary
	var wood_stat_current := wood_stat_summary.get("current", {}) as Dictionary
	var equip_ok := (
		bool(equip_result.get("ok", false))
		and PlayerProgressModel.equipped_item_id(equip_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_wooden_club"
		and PlayerProgressModel.backpack_item_count(equip_profile, "weapon_wooden_club") == 0
		and int(bonus.get("attack", 0)) == 6
		and int(wood_stat_base.get("attack", 0)) == 18
		and int(wood_stat_bonus.get("attack", 0)) == 6
		and int(wood_stat_current.get("attack", 0)) == 24
	)
	var equipped_state := _battle_reward_test_state("equipment_battle_check", equip_profile)
	var player_actor := BattleModel.actor_by_id(equipped_state, BattleModel.PLAYER_ACTOR_ID)
	var battle_summary := player_actor.get("equipmentStatSummary", {}) as Dictionary
	var battle_current := battle_summary.get("current", {}) as Dictionary
	var battle_bonus_ok := (
		not player_actor.is_empty()
		and int(player_actor.get("attack", 0)) == 24
		and int(battle_current.get("attack", 0)) == 24
		and str((player_actor.get("equipmentSlots", {}) as Dictionary).get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, "")) == "weapon_wooden_club"
	)

	var axe_buy_base_profile := PlayerProgressModel.with_stone_coins(equip_profile, 200)
	var axe_buy_result := PlayerProgressModel.buy_shop_item(axe_buy_base_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_stone_axe")
	var axe_buy_profile := axe_buy_result.get("profile", {}) as Dictionary
	var swap_result := PlayerProgressModel.equip_item(axe_buy_profile, "weapon_stone_axe")
	var swap_profile := swap_result.get("profile", {}) as Dictionary
	var swap_stat_summary := PlayerProgressModel.player_stat_summary(swap_profile)
	var swap_stat_bonus := swap_stat_summary.get("bonus", {}) as Dictionary
	var swap_stat_current := swap_stat_summary.get("current", {}) as Dictionary
	var swap_ok := (
		bool(axe_buy_result.get("ok", false))
		and bool(swap_result.get("ok", false))
		and PlayerProgressModel.equipped_item_id(swap_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_stone_axe"
		and PlayerProgressModel.backpack_item_count(swap_profile, "weapon_stone_axe") == 0
		and PlayerProgressModel.backpack_item_count(swap_profile, "weapon_wooden_club") == 1
		and int(swap_stat_bonus.get("attack", 0)) == 11
		and int(swap_stat_bonus.get("quick", 0)) == -2
		and int(swap_stat_current.get("attack", 0)) == 29
		and int(swap_stat_current.get("quick", 0)) == 68
		and str(swap_result.get("message", "")).find("换下木棒") >= 0
	)

	var unequip_result := PlayerProgressModel.unequip_slot(equip_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON)
	var unequip_profile := unequip_result.get("profile", {}) as Dictionary
	var sell_after_result := PlayerProgressModel.sell_shop_item(unequip_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	var sell_after_profile := sell_after_result.get("profile", {}) as Dictionary
	var sell_after_ok := (
		bool(unequip_result.get("ok", false))
		and PlayerProgressModel.equipped_item_id(unequip_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == ""
		and PlayerProgressModel.backpack_item_count(unequip_profile, "weapon_wooden_club") == 1
		and bool(sell_after_result.get("ok", false))
		and PlayerProgressModel.backpack_item_count(sell_after_profile, "weapon_wooden_club") == 0
	)

	player_profile = buy_profile
	_load_map("firebud_village_gate", "from_training_yard")
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_wooden_club")
	_open_backpack_panel()
	await get_tree().process_frame
	var ui_detail_ok := (
		backpack_detail_label != null
		and backpack_detail_label.text.find("装备槽: 右手武器") >= 0
		and backpack_detail_label.text.find("攻击 +6") >= 0
		and backpack_detail_label.text.find("[color=%s]攻击 +6[/color]" % EQUIPMENT_COMPARE_GAIN_COLOR) >= 0
		and backpack_use_button != null
		and backpack_use_button.visible
		and backpack_use_button.text == "装备"
	)
	_on_backpack_use_pressed()
	await get_tree().process_frame
	var ui_equip_ok := (
		PlayerProgressModel.equipped_item_id(player_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_wooden_club"
		and PlayerProgressModel.backpack_item_count(player_profile, "weapon_wooden_club") == 0
		and backpack_use_button != null
		and not backpack_use_button.visible
		and world_log_message.find("装备木棒") >= 0
	)
	_close_backpack_panel()

	var compare_gain_profile := PlayerProgressModel.without_equipment(starter_profile)
	compare_gain_profile = PlayerProgressModel.with_stone_coins(compare_gain_profile, 300)
	compare_gain_profile = (PlayerProgressModel.buy_shop_item(compare_gain_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_blessed_club").get("profile", compare_gain_profile) as Dictionary)
	player_profile = compare_gain_profile
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_blessed_club")
	_open_backpack_panel()
	await get_tree().process_frame
	var compare_gain_text := backpack_detail_label.text if backpack_detail_label != null else ""
	var compare_gain_ok := (
		compare_gain_text.find("换装预览") >= 0
		and compare_gain_text.find("[color=%s]攻击 +4[/color]" % EQUIPMENT_COMPARE_GAIN_COLOR) >= 0
		and compare_gain_text.find("获得 恩惠精灵1") >= 0
	)
	_close_backpack_panel()

	var compare_loss_profile := PlayerProgressModel.with_stone_coins(starter_profile, 300)
	compare_loss_profile = (PlayerProgressModel.buy_shop_item(compare_loss_profile, FIREBUD_EQUIPMENT_SHOP_ID, "armor_toxin_wrap").get("profile", compare_loss_profile) as Dictionary)
	player_profile = compare_loss_profile
	backpack_selected_slot_index = _backpack_slot_index_for_item("armor_toxin_wrap")
	_open_backpack_panel()
	await get_tree().process_frame
	var compare_loss_text := backpack_detail_label.text if backpack_detail_label != null else ""
	var compare_loss_ok := (
		compare_loss_text.find("换装预览") >= 0
		and compare_loss_text.find("[color=%s]防御 -2[/color]" % EQUIPMENT_COMPARE_LOSS_COLOR) >= 0
		and compare_loss_text.find("失去 滋润精灵1") >= 0
	)
	_close_backpack_panel()

	player_profile = equip_profile
	_open_equipment_panel()
	await get_tree().process_frame
	var equipment_panel_ok := (
		equipment_panel != null
		and equipment_panel.visible
		and equipment_slot_buttons.has(EquipmentModel.SLOT_RIGHT_HAND_WEAPON)
		and (equipment_slot_buttons.get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON) as Button).text.find("木棒") >= 0
		and equipment_stats_label != null
		and equipment_stats_label.text.find("攻击 18+6=24") >= 0
		and equipment_detail_label != null
		and equipment_detail_label.text.find("攻击 +6") >= 0
		and equipment_unequip_button != null
		and equipment_unequip_button.visible
	)
	_on_equipment_unequip_pressed()
	await get_tree().process_frame
	var equipment_unequip_ui_ok := (
		PlayerProgressModel.equipped_item_id(player_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == ""
		and PlayerProgressModel.backpack_item_count(player_profile, "weapon_wooden_club") == 1
		and equipment_unequip_button != null
		and not equipment_unequip_button.visible
	)
	_close_equipment_panel()

	player_profile = swap_profile
	_open_equipment_panel()
	await get_tree().process_frame
	var equipment_swap_panel_ok := (
		equipment_panel != null
		and equipment_panel.visible
		and equipment_slot_buttons.has(EquipmentModel.SLOT_RIGHT_HAND_WEAPON)
		and (equipment_slot_buttons.get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON) as Button).text.find("石斧") >= 0
		and equipment_stats_label != null
		and equipment_stats_label.text.find("攻击 18+11=29") >= 0
		and equipment_stats_label.text.find("敏捷 70-2=68") >= 0
		and PlayerProgressModel.backpack_item_count(player_profile, "weapon_wooden_club") == 1
	)
	_close_equipment_panel()

	var extra_buy_profile := PlayerProgressModel.with_stone_coins(base_profile, 200)
	extra_buy_profile = (PlayerProgressModel.buy_shop_item(extra_buy_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club", 2).get("profile", extra_buy_profile) as Dictionary)
	var extra_equip_profile := PlayerProgressModel.equip_item(extra_buy_profile, "weapon_wooden_club").get("profile", {}) as Dictionary
	var extra_sell_result := PlayerProgressModel.sell_shop_item(extra_equip_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	var extra_sell_profile := extra_sell_result.get("profile", {}) as Dictionary
	var extra_sell_ok := (
		PlayerProgressModel.equipped_item_id(extra_equip_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_wooden_club"
		and PlayerProgressModel.backpack_item_count(extra_equip_profile, "weapon_wooden_club") == 1
		and bool(extra_sell_result.get("ok", false))
		and PlayerProgressModel.equipped_item_id(extra_sell_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_wooden_club"
		and PlayerProgressModel.backpack_item_count(extra_sell_profile, "weapon_wooden_club") == 0
	)

	var status := "ok" if validation_ok and starter_equipment_ok and starter_battle_spirit_ok and catalog_ok and buy_ok and equip_ok and battle_bonus_ok and swap_ok and sell_after_ok and ui_detail_ok and ui_equip_ok and compare_gain_ok and compare_loss_ok and equipment_panel_ok and equipment_unequip_ui_ok and equipment_swap_panel_ok and extra_sell_ok else "failed"
	print("equipment check ready: status=%s validation=%s starter=%s starter_spirits=%s catalog=%s buy=%s equip=%s battle_bonus=%s swap=%s sell_after=%s ui_detail=%s ui_equip=%s compare_gain=%s compare_loss=%s panel=%s panel_unequip=%s swap_panel=%s extra_sell=%s attack=%d coins=%d" % [
		status,
		str(validation_ok),
		str(starter_equipment_ok),
		str(starter_battle_spirit_ok),
		str(catalog_ok),
		str(buy_ok),
		str(equip_ok),
		str(battle_bonus_ok),
		str(swap_ok),
		str(sell_after_ok),
		str(ui_detail_ok),
		str(ui_equip_ok),
		str(compare_gain_ok),
		str(compare_loss_ok),
		str(equipment_panel_ok),
		str(equipment_unequip_ui_ok),
		str(equipment_swap_panel_ok),
		str(extra_sell_ok),
		int(player_actor.get("attack", 0)),
		PlayerProgressModel.stone_coins(sell_after_profile),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_player_status_check() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_player_status_panel()
	await get_tree().process_frame
	var text := player_status_detail_label.text if player_status_detail_label != null else ""
	var menu_ok := player_status_menu_button != null and player_status_menu_button.text == "状态"
	var panel_ok := player_status_panel != null and player_status_panel.visible
	var stats_ok := (
		text.find("见习猎人") >= 0
		and text.find("Lv1") >= 0
		and text.find("生命: 120/128") >= 0
		and text.find("生命 120+8=128") >= 0
		and text.find("攻击 18+14=32") >= 0
		and text.find("防御 6+6=12") >= 0
		and text.find("敏捷 70+7=77") >= 0
	)
	var bonus_ok := (
		text.find("生命 +8") >= 0
		and text.find("攻击 +14") >= 0
		and text.find("防御 +6") >= 0
		and text.find("敏捷 +7") >= 0
	)
	var spirits_ok := (
		text.find("恩惠精灵1") >= 0
		and text.find("练习长枪") >= 0
		and text.find("滋润精灵1") >= 0
		and text.find("水纹衣") >= 0
		and text.find("毒精灵1") >= 0
		and text.find("火芽护符") >= 0
		and text.find("毒雾精灵1") >= 0
		and text.find("风纹戒指") >= 0
	)
	var record_ok := text.find("火芽村出生点") >= 0
	_on_player_status_equipment_pressed()
	await get_tree().process_frame
	var equipment_route_ok := (
		player_status_panel != null
		and not player_status_panel.visible
		and equipment_panel != null
		and equipment_panel.visible
		and equipment_stats_label != null
		and equipment_stats_label.text.find("攻击 18+14=32") >= 0
	)
	var status := "ok" if menu_ok and panel_ok and stats_ok and bonus_ok and spirits_ok and record_ok and equipment_route_ok else "failed"
	print("player status check ready: status=%s menu=%s panel=%s stats=%s bonus=%s spirits=%s record=%s equipment_route=%s" % [
		status,
		str(menu_ok),
		str(panel_ok),
		str(stats_ok),
		str(bonus_ok),
		str(spirits_ok),
		str(record_ok),
		str(equipment_route_ok),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_player_stat_points_check() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	var profile := PlayerProgressModel.default_profile()
	var player := profile.get("player", {}) as Dictionary
	player["exp"] = PlayerProgressModel.exp_to_next_level(1) - 1
	profile["player"] = player
	var reward_state := _battle_reward_test_state("player_stat_points_check", profile)
	var reward_result := PlayerProgressModel.apply_battle_result(profile, reward_state, "victory")
	var leveled_profile := reward_result.get("profile", {}) as Dictionary
	var leveled_player := leveled_profile.get("player", {}) as Dictionary
	var level_ok := (
		int(leveled_player.get("level", 1)) == 2
		and PlayerProgressModel.player_stat_points(leveled_profile) == PlayerProgressModel.PLAYER_STAT_POINTS_PER_LEVEL
		and _battle_result_log_text(reward_result).find("属性点") >= 0
	)
	var attack_result := PlayerProgressModel.allocate_player_stat_point(leveled_profile, "attack")
	var after_attack := attack_result.get("profile", {}) as Dictionary
	var hp_result := PlayerProgressModel.allocate_player_stat_point(after_attack, "maxHp")
	var after_hp := hp_result.get("profile", {}) as Dictionary
	var defense_result := PlayerProgressModel.allocate_player_stat_point(after_hp, "defense")
	var allocated_profile := defense_result.get("profile", {}) as Dictionary
	var allocated_summary := PlayerProgressModel.player_stat_summary(allocated_profile)
	var allocated_base := allocated_summary.get("base", {}) as Dictionary
	var allocated_current := allocated_summary.get("current", {}) as Dictionary
	var allocated_player := allocated_profile.get("player", {}) as Dictionary
	var allocation_ok := (
		bool(attack_result.get("ok", false))
		and bool(hp_result.get("ok", false))
		and bool(defense_result.get("ok", false))
		and PlayerProgressModel.player_stat_points(allocated_profile) == 0
		and int(allocated_base.get("attack", 0)) == 19
		and int(allocated_current.get("attack", 0)) == 33
		and int(allocated_base.get("maxHp", 0)) == 124
		and int(allocated_current.get("maxHp", 0)) == 132
		and int(allocated_player.get("hp", 0)) == 124
		and int(allocated_base.get("defense", 0)) == 7
		and int(allocated_current.get("defense", 0)) == 13
	)
	var battle_state := _battle_reward_test_state("player_stat_points_battle", allocated_profile)
	var player_actor := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_ACTOR_ID)
	var battle_ok := (
		int(player_actor.get("attack", 0)) == 33
		and int(player_actor.get("maxHp", 0)) == 132
		and int(player_actor.get("defense", 0)) == 13
	)
	player_profile = after_hp
	_load_map("firebud_village_gate", "from_training_yard")
	_open_player_status_panel()
	await get_tree().process_frame
	var status_text := player_status_detail_label.text if player_status_detail_label != null else ""
	var attack_button := player_status_stat_point_buttons.get("attack") as Button
	var hp_button := player_status_stat_point_buttons.get("maxHp") as Button
	var points_label_ok := player_status_points_label != null and player_status_points_label.text == "可分配属性点：1"
	var before_ui_ok := (
		points_label_ok
		and status_text.find("生命: 124/132") >= 0
		and status_text.find("生命 124+8=132") >= 0
		and status_text.find("攻击 19+14=33") >= 0
		and attack_button != null
		and attack_button.text == "攻击 +1"
		and not attack_button.disabled
		and hp_button != null
		and hp_button.text == "生命 +4"
	)
	_on_player_status_allocate_pressed("defense")
	await get_tree().process_frame
	var final_text := player_status_detail_label.text if player_status_detail_label != null else ""
	var defense_button := player_status_stat_point_buttons.get("defense") as Button
	var final_points_label_ok := player_status_points_label != null and player_status_points_label.text == "可分配属性点：0"
	var final_ui_ok := (
		final_points_label_ok
		and final_text.find("防御 7+6=13") >= 0
		and defense_button != null
		and defense_button.disabled
	)
	var status := "ok" if level_ok and allocation_ok and battle_ok and before_ui_ok and final_ui_ok else "failed"
	print("player stat points check ready: status=%s level=%s allocation=%s battle=%s before_ui=%s final_ui=%s points=%d attack=%d max_hp=%d defense=%d" % [
		status,
		str(level_ok),
		str(allocation_ok),
		str(battle_ok),
		str(before_ui_ok),
		str(final_ui_ok),
		PlayerProgressModel.player_stat_points(player_profile),
		int(allocated_current.get("attack", 0)),
		int(allocated_current.get("maxHp", 0)),
		int(allocated_current.get("defense", 0)),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_equipment_requirement_check() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	var bone_item := BackpackModel.item_for_id("weapon_bone_blade")
	var bone_contexts: Array = bone_item.get("useContexts", [])
	var catalog_ok: bool = (
		EquipmentModel.required_level_for("weapon_bone_blade") == 3
		and EquipmentModel.detail_lines_for_item("weapon_bone_blade").has("需求: Lv3")
		and ShopCatalogModel.buy_price_for(FIREBUD_EQUIPMENT_SHOP_ID, "weapon_bone_blade") == 110
		and bone_contexts.has(BackpackModel.CONTEXT_EQUIPMENT)
	)
	var low_profile := PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 300)
	var buy_result := PlayerProgressModel.buy_shop_item(low_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_bone_blade")
	var bought_profile := buy_result.get("profile", {}) as Dictionary
	var low_check := PlayerProgressModel.can_equip_item(bought_profile, "weapon_bone_blade")
	var low_equip_result := PlayerProgressModel.equip_item(bought_profile, "weapon_bone_blade")
	var low_block_ok: bool = (
		bool(buy_result.get("ok", false))
		and not bool(low_check.get("ok", true))
		and int(low_check.get("requiredLevel", 0)) == 3
		and int(low_check.get("playerLevel", 0)) == 1
		and str(low_equip_result.get("message", "")).find("Lv3") >= 0
		and not bool(low_equip_result.get("ok", true))
		and PlayerProgressModel.backpack_item_count(low_equip_result.get("profile", bought_profile), "weapon_bone_blade") == 1
		and PlayerProgressModel.equipped_item_id(low_equip_result.get("profile", bought_profile), EquipmentModel.SLOT_RIGHT_HAND_WEAPON) != "weapon_bone_blade"
	)
	var high_profile := bought_profile.duplicate(true)
	var high_player := high_profile.get("player", {}) as Dictionary
	high_player["level"] = 3
	high_player["nextExp"] = PlayerProgressModel.exp_to_next_level(3)
	high_profile["player"] = high_player
	high_profile = PlayerProgressModel.normalize_profile(high_profile)
	var high_equip_result := PlayerProgressModel.equip_item(high_profile, "weapon_bone_blade")
	var high_equip_profile := high_equip_result.get("profile", {}) as Dictionary
	var high_summary := PlayerProgressModel.player_stat_summary(high_equip_profile)
	var high_current := high_summary.get("current", {}) as Dictionary
	var high_ok: bool = (
		bool(high_equip_result.get("ok", false))
		and PlayerProgressModel.equipped_item_id(high_equip_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_bone_blade"
		and PlayerProgressModel.backpack_item_count(high_equip_profile, "weapon_bone_blade") == 0
		and PlayerProgressModel.backpack_item_count(high_equip_profile, "weapon_stone_dagger") == 1
		and int(high_current.get("attack", 0)) == 43
	)

	player_profile = bought_profile
	_load_map("firebud_village_gate", "from_training_yard")
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_bone_blade")
	_open_backpack_panel()
	await get_tree().process_frame
	var bag_text := backpack_detail_label.text if backpack_detail_label != null else ""
	var bag_button_ok: bool = (
		backpack_use_button != null
		and backpack_use_button.visible
		and backpack_use_button.disabled
		and backpack_use_button.text == "装备"
	)
	var bag_detail_ok: bool = bag_text.find("需求: Lv3") >= 0 and bag_text.find("未满足") >= 0
	_close_backpack_panel()
	_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
	_select_shop_item("weapon_bone_blade")
	await get_tree().process_frame
	var shop_text := shop_detail_label.text if shop_detail_label != null else ""
	var shop_detail_ok: bool = shop_text.find("骨刃") >= 0 and shop_text.find("需求: Lv3") >= 0 and shop_text.find("当前 Lv1：未满足") >= 0
	var status := "ok" if catalog_ok and low_block_ok and high_ok and bag_button_ok and bag_detail_ok and shop_detail_ok else "failed"
	print("equipment requirement check ready: status=%s catalog=%s low_block=%s high=%s bag_button=%s bag_detail=%s shop_detail=%s attack=%d low_message=%s" % [
		status,
		str(catalog_ok),
		str(low_block_ok),
		str(high_ok),
		str(bag_button_ok),
		str(bag_detail_ok),
		str(shop_detail_ok),
		int(high_current.get("attack", 0)),
		str(low_equip_result.get("message", "")),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_equipment_durability_check() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	var base_profile := PlayerProgressModel.default_profile()
	var base_durability := PlayerProgressModel.equipment_durability(base_profile)
	var default_durability_ok := int(base_durability.get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, 0)) == EquipmentModel.DEFAULT_DURABILITY_MAX
	var wear_result := PlayerProgressModel.apply_equipment_wear(base_profile, 1)
	var worn_profile := wear_result.get("profile", {}) as Dictionary
	var worn_durability := PlayerProgressModel.equipment_durability(worn_profile)
	var wear_ok := (
		bool(wear_result.get("changed", false))
		and int(worn_durability.get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, 0)) == EquipmentModel.DEFAULT_DURABILITY_MAX - 1
	)
	var broken_profile := base_profile.duplicate(true)
	var broken_durability := PlayerProgressModel.equipment_durability(broken_profile)
	broken_durability[EquipmentModel.SLOT_RIGHT_HAND_WEAPON] = 0
	broken_profile[PlayerProgressModel.EQUIPMENT_DURABILITY_KEY] = broken_durability
	broken_profile = PlayerProgressModel.normalize_profile(broken_profile)
	var broken_summary := PlayerProgressModel.player_stat_summary(broken_profile)
	var broken_current := broken_summary.get("current", {}) as Dictionary
	var broken_ok := (
		int(broken_current.get("attack", 0)) == 27
		and PlayerProgressModel.equipment_slot_durability_text(broken_profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON).find("已损坏") >= 0
	)
	var quote := PlayerProgressModel.equipment_repair_quote(broken_profile)
	var repair_result := PlayerProgressModel.repair_all_equipment(broken_profile)
	var repaired_profile := repair_result.get("profile", {}) as Dictionary
	var repaired_summary := PlayerProgressModel.player_stat_summary(repaired_profile)
	var repaired_current := repaired_summary.get("current", {}) as Dictionary
	var repair_ok := (
		int(quote.get("missingDurability", 0)) == EquipmentModel.DEFAULT_DURABILITY_MAX
		and int(quote.get("cost", 0)) == 6
		and bool(repair_result.get("ok", false))
		and PlayerProgressModel.stone_coins(repaired_profile) == PlayerProgressModel.DEFAULT_STONE_COINS - 6
		and int(PlayerProgressModel.equipment_durability(repaired_profile).get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, 0)) == EquipmentModel.DEFAULT_DURABILITY_MAX
		and int(repaired_current.get("attack", 0)) == 32
	)
	var battle_state := _battle_reward_test_state("equipment_durability_battle", base_profile)
	var battle_result := PlayerProgressModel.apply_battle_result(base_profile, battle_state, "victory")
	var battle_profile := battle_result.get("profile", {}) as Dictionary
	var battle_durability_ok := int(PlayerProgressModel.equipment_durability(battle_profile).get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, 0)) == EquipmentModel.DEFAULT_DURABILITY_MAX - 1

	player_profile = broken_profile
	_load_map("firebud_village_gate", "from_training_yard")
	_open_equipment_panel()
	equipment_selected_slot_id = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	_refresh_equipment_panel()
	await get_tree().process_frame
	var equipment_detail := equipment_detail_label.text if equipment_detail_label != null else ""
	var equipment_ui_ok := (
		equipment_detail.find("耐久: 0/30") >= 0
		and equipment_detail.find("已损坏") >= 0
		and equipment_stats_label != null
		and equipment_stats_label.text.find("攻击 18+9=27") >= 0
	)
	_close_equipment_panel()
	_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
	await get_tree().process_frame
	var repair_button_ready := (
		shop_repair_button != null
		and shop_repair_button.visible
		and not shop_repair_button.disabled
		and shop_repair_button.text == "修理 6石币"
	)
	_on_shop_repair_pressed()
	await get_tree().process_frame
	var repair_button_done := (
		world_log_message.find("装备修理完成") >= 0
		and shop_repair_button != null
		and shop_repair_button.visible
		and shop_repair_button.disabled
		and int(PlayerProgressModel.equipment_durability(player_profile).get(EquipmentModel.SLOT_RIGHT_HAND_WEAPON, 0)) == EquipmentModel.DEFAULT_DURABILITY_MAX
	)
	var status := "ok" if default_durability_ok and wear_ok and broken_ok and repair_ok and battle_durability_ok and equipment_ui_ok and repair_button_ready and repair_button_done else "failed"
	print("equipment durability check ready: status=%s default=%s wear=%s broken=%s repair=%s battle=%s equipment_ui=%s repair_ready=%s repair_done=%s attack_broken=%d coins=%d" % [
		status,
		str(default_durability_ok),
		str(wear_ok),
		str(broken_ok),
		str(repair_ok),
		str(battle_durability_ok),
		str(equipment_ui_ok),
		str(repair_button_ready),
		str(repair_button_done),
		int(broken_current.get("attack", 0)),
		PlayerProgressModel.stone_coins(player_profile),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_encounter_loop_check() -> void:
	profile_save_enabled = false
	encounter_rng.seed = 57057
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found := loaded and not zones.is_empty()
	var zone: Dictionary = zones[0] as Dictionary if zone_found else {}
	var cells := EncounterModel.cells_for_zone(zone) if zone_found else []
	var cells_ok := cells.size() >= ENCOUNTER_SAFE_STEPS + 3
	var rate_ok := zone_found and absf(EncounterModel.encounter_rate(zone) - 0.09) < 0.001
	var encounter_stone_data_ok := (
		BackpackModel.item_can_world_encounter_stone(ENCOUNTER_STONE_LOW_ID)
		and BackpackModel.item_can_world_encounter_stone(ENCOUNTER_STONE_MID_ID)
		and BackpackModel.item_can_world_encounter_stone(ENCOUNTER_STONE_HIGH_ID)
		and is_equal_approx(BackpackModel.world_encounter_interval_for(ENCOUNTER_STONE_LOW_ID), 3.0)
		and is_equal_approx(BackpackModel.world_encounter_interval_for(ENCOUNTER_STONE_MID_ID), 2.0)
		and is_equal_approx(BackpackModel.world_encounter_interval_for(ENCOUNTER_STONE_HIGH_ID), 1.0)
		and is_equal_approx(BackpackModel.world_encounter_duration_for(ENCOUNTER_STONE_LOW_ID), 600.0)
	)
	var shop_ok := (
		ShopCatalogModel.buy_price_for(ShopCatalogModel.DEFAULT_SHOP_ID, ENCOUNTER_STONE_LOW_ID) == 24
		and ShopCatalogModel.buy_price_for(ShopCatalogModel.DEFAULT_SHOP_ID, ENCOUNTER_STONE_MID_ID) == 42
		and ShopCatalogModel.buy_price_for(ShopCatalogModel.DEFAULT_SHOP_ID, ENCOUNTER_STONE_HIGH_ID) == 72
	)

	var hang_started := false
	var hang_stopped := false
	if cells_ok:
		player.global_position = IsoMapModel.grid_to_world(map_data, cells[0] as Vector2i)
		last_checked_player_cell = cells[0] as Vector2i
		encounter_grace_remaining = 999.0
		_start_hang_walk()
		_update_hang_walk(1.0)
		hang_started = hang_mode_active and player.is_auto_moving() and stop_button != null and stop_button.text == "停"
		_stop_auto_move()
		hang_stopped = not hang_mode_active and not player.is_auto_moving() and stop_button != null and stop_button.text == "挂机"

	var natural_direct := false
	var natural_no_prompt := false
	var grace_started := false
	var grace_blocks := false
	var grace_one_second := false
	if cells_ok:
		loaded = _load_map("firebud_village_gate", "from_training_yard")
		var forced_zones: Array = map_data.get("encounterZones", [])
		var forced_zone := (forced_zones[0] as Dictionary).duplicate(true)
		forced_zone["encounterRate"] = 1.0
		forced_zones[0] = forced_zone
		map_data["encounterZones"] = forced_zones
		zone = forced_zone
		cells = EncounterModel.cells_for_zone(zone)
		player.global_position = IsoMapModel.grid_to_world(map_data, cells[0] as Vector2i)
		last_checked_player_cell = cells[0] as Vector2i
		encounter_zone_step_count = 0
		encounter_grace_remaining = 0.0
		for index in range(1, ENCOUNTER_SAFE_STEPS + 2):
			player.global_position = IsoMapModel.grid_to_world(map_data, cells[index] as Vector2i)
			_update_encounter_zone_check()
			await get_tree().process_frame
			if battle_active:
				break
		natural_direct = battle_active and battle_command_panel != null and battle_command_panel.visible
		natural_no_prompt = natural_direct and encounter_panel != null and not encounter_panel.visible and not encounter_active
		_end_battle(true)
		await get_tree().process_frame
		grace_started = encounter_grace_remaining > 0.0 and encounter_grace_remaining <= ENCOUNTER_POST_BATTLE_GRACE_SECONDS
		player.global_position = IsoMapModel.grid_to_world(map_data, cells[ENCOUNTER_SAFE_STEPS + 2] as Vector2i)
		_update_encounter_zone_check()
		await get_tree().process_frame
		grace_blocks = not battle_active
		encounter_grace_remaining = ENCOUNTER_POST_BATTLE_GRACE_SECONDS
		_update_encounter_grace(0.99)
		var grace_before_finish := encounter_grace_remaining > 0.0
		_update_encounter_grace(0.02)
		grace_one_second = grace_before_finish and encounter_grace_remaining <= 0.0

	var stone_consumed := false
	var stone_effect := false
	var stone_wait := false
	var stone_triggered := false
	if zone_found:
		_load_map("firebud_village_gate", "from_training_yard")
		zones = EncounterModel.encounter_zones(map_data)
		zone = zones[0] as Dictionary
		cells = EncounterModel.cells_for_zone(zone)
		player_profile = PlayerProgressModel.default_profile()
		player_profile = PlayerProgressModel.with_backpack_slots(
			player_profile,
			BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(player_profile), ENCOUNTER_STONE_LOW_ID, 1)
		)
		player.global_position = IsoMapModel.grid_to_world(map_data, cells[0] as Vector2i)
		last_checked_player_cell = cells[0] as Vector2i
		encounter_grace_remaining = 0.0
		var before_stones := PlayerProgressModel.backpack_item_count(player_profile, ENCOUNTER_STONE_LOW_ID)
		_use_backpack_encounter_stone(ENCOUNTER_STONE_LOW_ID)
		stone_consumed = PlayerProgressModel.backpack_item_count(player_profile, ENCOUNTER_STONE_LOW_ID) == before_stones - 1
		stone_effect = _encounter_stone_active() and is_equal_approx(encounter_stone_interval, 3.0)
		_update_stationary_encounter_stone(2.99)
		stone_wait = not battle_active
		_update_stationary_encounter_stone(0.02)
		await get_tree().process_frame
		stone_triggered = battle_active and encounter_panel != null and not encounter_panel.visible

	var status := "ok" if loaded and zone_found and cells_ok and rate_ok and encounter_stone_data_ok and shop_ok and hang_started and hang_stopped and natural_direct and natural_no_prompt and grace_started and grace_blocks and grace_one_second and stone_consumed and stone_effect and stone_wait and stone_triggered else "failed"
	print("encounter loop check ready: status=%s loaded=%s zone=%s cells=%s rate=%s stones=%s shop=%s hang_start=%s hang_stop=%s natural=%s no_prompt=%s grace_start=%s grace_blocks=%s grace_1s=%s stone_consume=%s stone_effect=%s stone_wait=%s stone_trigger=%s" % [
		status,
		str(loaded),
		str(zone_found),
		str(cells_ok),
		str(rate_ok),
		str(encounter_stone_data_ok),
		str(shop_ok),
		str(hang_started),
		str(hang_stopped),
		str(natural_direct),
		str(natural_no_prompt),
		str(grace_started),
		str(grace_blocks),
		str(grace_one_second),
		str(stone_consumed),
		str(stone_effect),
		str(stone_wait),
		str(stone_triggered),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_reward_check() -> void:
	profile_save_enabled = false
	var base_profile := PlayerProgressModel.default_profile()
	var reward_state := _battle_reward_test_state("battle_reward_check", base_profile)
	var before_meat := PlayerProgressModel.backpack_item_count(base_profile, BattleModel.ITEM_MEAT_SMALL)
	var before_rope := PlayerProgressModel.backpack_item_count(base_profile, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
	var before_coins := PlayerProgressModel.stone_coins(base_profile)
	var result := PlayerProgressModel.apply_battle_result(base_profile, reward_state, "victory")
	var result_profile := result.get("profile", {}) as Dictionary
	var rewards: Array = result.get("itemRewards", [])
	var lost_rewards: Array = result.get("lostItemRewards", [])
	var reward_meat := _item_amount_count(rewards, BattleModel.ITEM_MEAT_SMALL)
	var reward_rope := _item_amount_count(rewards, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
	var reward_coins := maxi(0, int(result.get("stoneCoinsReward", 0)))
	var after_meat := PlayerProgressModel.backpack_item_count(result_profile, BattleModel.ITEM_MEAT_SMALL)
	var after_rope := PlayerProgressModel.backpack_item_count(result_profile, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
	var after_coins := PlayerProgressModel.stone_coins(result_profile)
	var log_text := _battle_result_log_text(result)
	var reward_ok := (
		str(result.get("result", "")) == "victory"
		and reward_meat >= 1
		and reward_rope == 1
		and reward_coins > 0
		and after_meat == before_meat + reward_meat
		and after_rope == before_rope + reward_rope
		and after_coins == before_coins + reward_coins
		and lost_rewards is Array
		and (lost_rewards as Array).is_empty()
		and log_text.find("获得 肉") >= 0
		and log_text.find("初级捕捉绳") >= 0
		and log_text.find("石币") >= 0
	)

	var full_profile := PlayerProgressModel.default_profile()
	var full_slots := BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(full_profile), BattleModel.ITEM_MEAT_SMALL, BackpackModel.SLOT_LIMIT * BackpackModel.stack_limit_for(BattleModel.ITEM_MEAT_SMALL))
	full_profile = PlayerProgressModel.with_backpack_slots(full_profile, full_slots)
	var full_reward_state := _battle_reward_test_state("battle_reward_check", full_profile)
	var full_result := PlayerProgressModel.apply_battle_result(full_profile, full_reward_state, "victory")
	var full_lost: Array = full_result.get("lostItemRewards", [])
	var full_log := _battle_result_log_text(full_result)
	var full_block_ok := (
		full_lost is Array
		and not (full_lost as Array).is_empty()
		and _item_amount_count(full_lost, BattleModel.ITEM_MEAT_SMALL) >= 1
		and _item_amount_count(full_lost, BattleModel.CAPTURE_TOOL_ROPE_BASIC) == 1
		and full_log.find("背包已满，未获得") >= 0
	)

	var escape_result := PlayerProgressModel.apply_battle_result(base_profile, reward_state, "escape")
	var escape_rewards: Array = escape_result.get("itemRewards", [])
	var escape_profile := escape_result.get("profile", {}) as Dictionary
	var escape_ok := (
		escape_rewards is Array
		and (escape_rewards as Array).is_empty()
		and PlayerProgressModel.backpack_item_count(escape_profile, BattleModel.ITEM_MEAT_SMALL) == before_meat
		and int(escape_result.get("stoneCoinsReward", 0)) == 0
		and PlayerProgressModel.stone_coins(escape_profile) == before_coins
	)

	var status := "ok" if reward_ok and full_block_ok and escape_ok else "failed"
	print("battle reward check ready: status=%s reward=%s full=%s escape=%s meat=%d rope=%d coins=%d log=%s full_log=%s" % [
		status,
		str(reward_ok),
		str(full_block_ok),
		str(escape_ok),
		reward_meat,
		reward_rope,
		reward_coins,
		log_text.replace("\n", " / "),
		full_log.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_quest_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_training_yard")
	var trainer := InteractionModel.find_by_id(map_data, "trainer")
	if not trainer.is_empty():
		_open_interaction_dialog(trainer)
	if status_label != null:
		_update_hud_text()


func _run_quest_ui_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_training_yard")
	for index in range(10):
		_set_world_log_message("历史消息%d：战斗、奖励和任务提示会保留在这里。" % [index + 1])
	_open_quest_panel()
	if status_label != null:
		_update_hud_text()


func _run_auto_battle_settings_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	settings[AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY] = AutoBattleSettingsModel.ACTION_SPIRIT_POISON_ALL_1
	settings[AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY] = AutoBattleSettingsModel.ACTION_ATTACK
	settings[AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY] = 3
	settings[AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY] = 1
	settings[AutoBattleSettingsModel.TARGET_MODE_KEY] = AutoBattleSettingsModel.TARGET_LOWEST_HP_PERCENT
	settings[AutoBattleSettingsModel.HEALING_ENABLED_KEY] = true
	settings[AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY] = 70
	settings[AutoBattleSettingsModel.PET_HP_PERCENT_KEY] = 55
	settings[AutoBattleSettingsModel.HEAL_PRIORITY_KEY] = [
		AutoBattleSettingsModel.HEAL_ITEM_MEAT,
		AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE,
		AutoBattleSettingsModel.HEAL_SPIRIT_MOIST_1,
		AutoBattleSettingsModel.HEAL_SPIRIT_GRACE_1,
		AutoBattleSettingsModel.HEAL_ITEM_HEAL_ALL,
	]
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	_open_auto_settings_panel()
	if status_label != null:
		_update_hud_text()


func _run_auto_capture_settings_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	settings[AutoCaptureSettingsModel.ENABLED_KEY] = true
	settings[AutoCaptureSettingsModel.TARGET_MODE_KEY] = AutoCaptureSettingsModel.TARGET_ALL
	settings[AutoCaptureSettingsModel.HP_PERCENT_KEY] = 100
	settings[AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY] = AutoCaptureSettingsModel.COMPARATOR_LT
	settings[AutoCaptureSettingsModel.LEVEL_VALUE_KEY] = 999
	settings[AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY] = BattleModel.CAPTURE_TOOL_NET_REINFORCED
	settings[AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY] = AutoCaptureSettingsModel.NO_TARGET_ESCAPE
	settings[AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY] = AutoCaptureSettingsModel.DEFAULT_CAPTURE_PET_SLOT
	settings[AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY] = true
	settings[AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY] = 31
	player_profile = PlayerProgressModel.with_auto_capture_settings(player_profile, settings)
	auto_settings_active_tab = "capture"
	_open_auto_settings_panel()
	_set_world_log_message("自动捉宠设置已打开。")
	if status_label != null:
		_update_hud_text()


func _run_hang_settings_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	auto_settings_active_tab = "hang"
	_open_auto_settings_panel()
	_set_world_log_message("挂机设置已打开。")
	if status_label != null:
		_update_hud_text()


func _run_auto_hang_settings_check() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var default_settings := PlayerProgressModel.hang_settings(player_profile)
	var default_ok := int(default_settings.get(HangSettingsModel.LOW_HP_STOP_PERCENT_KEY, -99)) == HangSettingsModel.STOP_ON_DEATH
	var custom_settings := default_settings.duplicate(true)
	custom_settings[HangSettingsModel.LOW_HP_STOP_PERCENT_KEY] = 30
	player_profile = PlayerProgressModel.with_hang_settings(player_profile, custom_settings)
	var custom_ok := int(PlayerProgressModel.hang_settings(player_profile).get(HangSettingsModel.LOW_HP_STOP_PERCENT_KEY, 0)) == 30

	auto_settings_active_tab = "hang"
	_open_auto_settings_panel()
	await get_tree().process_frame
	var panel_ok := (
		auto_settings_panel != null
		and auto_settings_panel.visible
		and auto_settings_hang_tab_button != null
		and auto_settings_hang_tab_button.button_pressed
		and auto_settings_controls.has(HangSettingsModel.LOW_HP_STOP_PERCENT_KEY)
		and auto_settings_controls.has("hangStartButton")
		and not auto_settings_controls.has(AutoBattleSettingsModel.HEALING_ENABLED_KEY)
	)
	_close_auto_settings_panel()

	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	var zone_found := loaded and not zones.is_empty()
	var zone := zones[0] as Dictionary if zone_found else {}
	var cells := EncounterModel.cells_for_zone(zone) if zone_found else []
	if not cells.is_empty() and player != null:
		player.global_position = IsoMapModel.grid_to_world(map_data, cells[0] as Vector2i)
		last_checked_player_cell = cells[0] as Vector2i

	player_profile = PlayerProgressModel.default_profile()
	_set_hang_mode(true)
	encounter_stone_item_id = ENCOUNTER_STONE_LOW_ID
	encounter_stone_interval = 3.0
	encounter_stone_remaining = 100.0
	encounter_stone_elapsed = 1.0
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zone))
		battle_player_zero_hp_seen = true
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 0)
		_finish_battle_and_return_to_world("defeat")
	var death_stop_ok := (
		zone_found
		and not hang_mode_active
		and not _encounter_stone_active()
		and PlayerProgressModel.player_hp(player_profile) == 1
		and world_log_message.find("人物倒下过，挂机已停止。") >= 0
	)

	player_profile = PlayerProgressModel.with_hang_settings(PlayerProgressModel.default_profile(), {
		HangSettingsModel.LOW_HP_STOP_PERCENT_KEY: 30,
	})
	_set_hang_mode(true)
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zone))
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 100)
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_PET_ID, 1)
		_finish_battle_and_return_to_world("victory")
	var pet_ignored_ok := (
		zone_found
		and hang_mode_active
		and world_log_message.find("挂机已停止") < 0
	)
	_stop_hang_activity("", true)

	player_profile = PlayerProgressModel.with_hang_settings(PlayerProgressModel.default_profile(), {
		HangSettingsModel.LOW_HP_STOP_PERCENT_KEY: 30,
	})
	_set_hang_mode(true)
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zone))
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 20)
		_finish_battle_and_return_to_world("victory")
	var low_stop_ok := (
		zone_found
		and not hang_mode_active
		and world_log_message.find("人物生命低于30%，挂机已停止。") >= 0
	)

	player_profile = PlayerProgressModel.with_hang_settings(PlayerProgressModel.default_profile(), {
		HangSettingsModel.LOW_HP_STOP_PERCENT_KEY: HangSettingsModel.STOP_NEVER,
	})
	encounter_stone_item_id = ENCOUNTER_STONE_LOW_ID
	encounter_stone_interval = 3.0
	encounter_stone_remaining = 100.0
	encounter_stone_elapsed = 1.0
	if zone_found:
		_start_battle(BattleModel.create_wild_battle(zone))
		battle_player_zero_hp_seen = true
		battle_state = BattleModel.set_actor_hp(battle_state, BattleModel.PLAYER_ACTOR_ID, 0)
		_finish_battle_and_return_to_world("defeat")
	var never_ok := (
		zone_found
		and _encounter_stone_active()
		and PlayerProgressModel.player_hp(player_profile) == 1
		and world_log_message.find("挂机已停止") < 0
	)
	_stop_hang_activity("", true)

	encounter_stone_item_id = ENCOUNTER_STONE_LOW_ID
	encounter_stone_interval = 3.0
	encounter_stone_remaining = 100.0
	encounter_stone_elapsed = 1.0
	_on_hang_button_pressed()
	var manual_stop_ok := not _encounter_stone_active() and not hang_mode_active and stop_button != null and stop_button.text == "挂机"

	var status := "ok" if default_ok and custom_ok and panel_ok and zone_found and death_stop_ok and pet_ignored_ok and low_stop_ok and never_ok and manual_stop_ok else "failed"
	print("hang settings check ready: status=%s default=%s custom=%s panel=%s zone=%s death_stop=%s pet_ignored=%s low_stop=%s never=%s manual_stop=%s hp=%d" % [
		status,
		str(default_ok),
		str(custom_ok),
		str(panel_ok),
		str(zone_found),
		str(death_stop_ok),
		str(pet_ignored_ok),
		str(low_stop_ok),
		str(never_ok),
		str(manual_stop_ok),
		PlayerProgressModel.player_hp(player_profile),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_training_partner_demo() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	_load_map("firebud_village_gate", "from_training_yard")
	player_profile = PlayerProgressModel.with_training_partner_count(PlayerProgressModel.default_profile(), 4)
	battle_auto_attack_enabled = true
	_set_world_log_message("已加入4个陪练伙伴。进入草丛遇敌后，可点战斗里的自动观察练级。")
	_open_training_partner_panel()
	if status_label != null:
		_update_hud_text()


func _run_record_point_knockaway_demo() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	encounter_rng.seed = 67067
	player_profile = PlayerProgressModel.with_record_point(
		PlayerProgressModel.default_profile(),
		"firebud_village_gate",
		"doctor_record",
		"火芽村医旁记录点"
	)
	player_profile = _profile_without_active_battle_pet(player_profile)
	var loaded := _load_map(GM_10V10_MAP_ID)
	var zone := _encounter_zone_by_id("gm_high_knockaway_grass")
	if not loaded or zone.is_empty():
		_set_world_log_message("GM高级击飞草丛未找到。")
		await get_tree().create_timer(1.2).timeout
		get_tree().quit(1)
		return
	var cell := EncounterModel.first_walkable_cell(map_data, zone)
	if player != null:
		player.global_position = IsoMapModel.grid_to_world(map_data, cell)
		player.clear_move_target()
	last_checked_player_cell = cell
	_update_camera_position(true)
	_set_world_log_message("GM高级击飞草丛：等待怪物击飞并回到记录点。")
	queue_redraw()
	await get_tree().create_timer(0.8).timeout
	_trigger_encounter(zone)
	await get_tree().process_frame
	var elapsed := 0.0
	while battle_active and elapsed < 12.0:
		if not _battle_commands_locked() and battle_command_owner == "player":
			_submit_player_battle_command("defend")
		await get_tree().create_timer(0.1).timeout
		elapsed += 0.1
	await get_tree().create_timer(2.0).timeout
	get_tree().quit(0 if current_map_id == "firebud_village_gate" else 1)


func _profile_without_active_battle_pet(profile: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances: Array = next_profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("state", PlayerProgressModel.PET_STATE_STANDBY)) == PlayerProgressModel.PET_STATE_BATTLE:
			instance["state"] = PlayerProgressModel.PET_STATE_STANDBY
		instances[index] = instance
	next_profile["petInstances"] = instances
	next_profile["activePetInstanceId"] = ""
	return PlayerProgressModel.normalize_profile(next_profile)


func _run_equipment_quest_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase55：装备铺、木棒装备、买肉后使用肉任务链。")
	_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
	await get_tree().create_timer(0.8).timeout
	var buy_result := PlayerProgressModel.buy_shop_item(player_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	player_profile = buy_result.get("profile", player_profile)
	_set_world_log_message(str(buy_result.get("message", "")))
	_close_shop_panel()
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_wooden_club")
	_open_backpack_panel()
	await get_tree().create_timer(0.8).timeout
	_on_backpack_use_pressed()
	await get_tree().create_timer(0.8).timeout
	_close_backpack_panel()
	_open_equipment_panel()
	await get_tree().create_timer(1.0).timeout


func _run_equipment_swap_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 300)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("装备交换预览：木棒先装备，石斧再换上。")
	var wood_buy_result := PlayerProgressModel.buy_shop_item(player_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	player_profile = wood_buy_result.get("profile", player_profile)
	var axe_buy_result := PlayerProgressModel.buy_shop_item(player_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_stone_axe")
	player_profile = axe_buy_result.get("profile", player_profile)
	_set_world_log_message("%s\n%s" % [str(wood_buy_result.get("message", "")), str(axe_buy_result.get("message", ""))])

	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_wooden_club")
	_open_backpack_panel()
	await get_tree().create_timer(0.8).timeout
	_on_backpack_use_pressed()
	await get_tree().create_timer(0.7).timeout
	_close_backpack_panel()
	_open_equipment_panel()
	await get_tree().create_timer(0.9).timeout

	_close_equipment_panel()
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_stone_axe")
	_open_backpack_panel()
	await get_tree().create_timer(0.8).timeout
	_on_backpack_use_pressed()
	await get_tree().create_timer(0.8).timeout
	_close_backpack_panel()
	_open_equipment_panel()
	await get_tree().create_timer(0.9).timeout

	_close_equipment_panel()
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_wooden_club")
	_open_backpack_panel()
	await get_tree().create_timer(1.0).timeout


func _run_equipment_spirit_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if loaded and not zones.is_empty():
		_start_battle(BattleModel.create_stat_formula_test_battle(zones[0] as Dictionary))
		await get_tree().process_frame
		_open_spirit_command_menu()
		_set_battle_message("当前装备提供的精灵。")
	else:
		_set_world_log_message("装备精灵预览：地图或遇敌区未找到。")
	await get_tree().create_timer(1.0).timeout


func _run_equipment_compare_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 300)
	_load_map("firebud_village_gate", "from_training_yard")
	var buy_result := PlayerProgressModel.buy_shop_item(player_profile, FIREBUD_EQUIPMENT_SHOP_ID, "armor_toxin_wrap")
	player_profile = buy_result.get("profile", player_profile)
	_set_world_log_message("换装预览：毒藤布衣会替换水纹衣，红色表示减少或失去。")
	backpack_selected_slot_index = _backpack_slot_index_for_item("armor_toxin_wrap")
	_open_backpack_panel()
	await get_tree().create_timer(1.0).timeout


func _run_player_status_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase71：人物状态总览。")
	_open_player_status_panel()
	await get_tree().create_timer(1.0).timeout


func _run_player_stat_points_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var player := player_profile.get("player", {}) as Dictionary
	player["level"] = 2
	player["exp"] = 24
	player["nextExp"] = PlayerProgressModel.exp_to_next_level(2)
	player["statPoints"] = 1
	player["baseStats"] = {
		"maxHp": 124,
		"attack": 19,
		"defense": 6,
		"quick": 70,
	}
	player["hp"] = 124
	player_profile["player"] = player
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase72：升级属性点与手动加点。")
	_open_player_status_panel()
	await get_tree().create_timer(1.0).timeout


func _run_equipment_requirement_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 300)
	var buy_result := PlayerProgressModel.buy_shop_item(player_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_bone_blade")
	player_profile = buy_result.get("profile", player_profile)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase73：骨刃需要 Lv3 才能装备。")
	backpack_selected_slot_index = _backpack_slot_index_for_item("weapon_bone_blade")
	_open_backpack_panel()
	await get_tree().create_timer(1.0).timeout


func _run_equipment_durability_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var durability := PlayerProgressModel.equipment_durability(player_profile)
	durability[EquipmentModel.SLOT_RIGHT_HAND_WEAPON] = 0
	player_profile[PlayerProgressModel.EQUIPMENT_DURABILITY_KEY] = durability
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase74：右手武器损坏，可在装备铺修理。")
	_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
	await get_tree().create_timer(1.0).timeout


func _run_auto_quest_chain_check() -> void:
	profile_save_enabled = false
	var validation_ok := QuestModel.validation_errors().is_empty()
	var profile := PlayerProgressModel.default_profile()
	var start_ok := (
		PlayerProgressModel.active_quest_id(profile) == "quest_intro_talk"
		and PlayerProgressModel.quest_progress_text(profile).find("认识训练师") >= 0
	)

	var before_intro_coins := PlayerProgressModel.stone_coins(profile)
	var before_intro_meat := PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL)
	var talk_result := PlayerProgressModel.record_quest_event(profile, {
		"type": "talk",
		"targetId": "trainer",
	})
	profile = talk_result.get("profile", profile)
	var talk_ready_ok := bool(talk_result.get("changed", false)) and bool(talk_result.get("ready", false)) and PlayerProgressModel.can_claim_active_quest(profile)
	var talk_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = talk_claim.get("profile", profile)
	var talk_claim_ok := (
		bool(talk_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == "quest_buy_supply"
		and PlayerProgressModel.stone_coins(profile) == before_intro_coins + 20
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL) == before_intro_meat + 2
	)

	var before_rope := PlayerProgressModel.backpack_item_count(profile, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
	var before_buy_meat := PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL)
	var before_buy_coins := PlayerProgressModel.stone_coins(profile)
	var buy_result := PlayerProgressModel.buy_shop_item(profile, ShopCatalogModel.DEFAULT_SHOP_ID, BattleModel.ITEM_MEAT_SMALL)
	profile = buy_result.get("profile", profile)
	var buy_event := PlayerProgressModel.record_quest_event(profile, {
		"type": "buy_item",
		"shopId": ShopCatalogModel.DEFAULT_SHOP_ID,
		"itemId": BattleModel.ITEM_MEAT_SMALL,
		"amount": 1,
	})
	profile = buy_event.get("profile", profile)
	var buy_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = buy_claim.get("profile", profile)
	var buy_ok := (
		bool(buy_result.get("ok", false))
		and bool(buy_event.get("ready", false))
		and bool(buy_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == "quest_use_meat"
		and PlayerProgressModel.stone_coins(profile) == before_buy_coins - ShopCatalogModel.buy_price_for(ShopCatalogModel.DEFAULT_SHOP_ID, BattleModel.ITEM_MEAT_SMALL)
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL) == before_buy_meat + 1
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.CAPTURE_TOOL_ROPE_BASIC) == before_rope + 1
	)

	var before_use_coins := PlayerProgressModel.stone_coins(profile)
	var before_use_meat := PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL)
	var use_result := PlayerProgressModel.use_world_pet_heal_item(profile, BattleModel.ITEM_MEAT_SMALL, "pet_bui_main")
	profile = use_result.get("profile", profile)
	var use_event := PlayerProgressModel.record_quest_event(profile, {
		"type": "use_world_item",
		"itemId": BattleModel.ITEM_MEAT_SMALL,
		"targetType": "pet",
		"amount": 1,
	})
	profile = use_event.get("profile", profile)
	var use_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = use_claim.get("profile", profile)
	var use_ok := (
		bool(use_result.get("ok", false))
		and bool(use_event.get("ready", false))
		and bool(use_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == "quest_buy_weapon"
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL) == before_use_meat - 1
		and PlayerProgressModel.stone_coins(profile) == before_use_coins + 15
	)

	var before_weapon_coins := PlayerProgressModel.stone_coins(profile)
	var buy_weapon_result := PlayerProgressModel.buy_shop_item(profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	profile = buy_weapon_result.get("profile", profile)
	var buy_weapon_event := PlayerProgressModel.record_quest_event(profile, {
		"type": "buy_item",
		"shopId": FIREBUD_EQUIPMENT_SHOP_ID,
		"itemId": "weapon_wooden_club",
		"amount": 1,
	})
	profile = buy_weapon_event.get("profile", profile)
	var buy_weapon_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = buy_weapon_claim.get("profile", profile)
	var buy_weapon_ok := (
		bool(buy_weapon_result.get("ok", false))
		and bool(buy_weapon_event.get("ready", false))
		and bool(buy_weapon_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == "quest_equip_weapon"
		and PlayerProgressModel.backpack_item_count(profile, "weapon_wooden_club") == 1
		and PlayerProgressModel.stone_coins(profile) == before_weapon_coins - ShopCatalogModel.buy_price_for(FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	)

	var before_equip_medicine := PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_HEAL_SINGLE)
	var equip_result := PlayerProgressModel.equip_item(profile, "weapon_wooden_club")
	profile = equip_result.get("profile", profile)
	var equip_event := PlayerProgressModel.record_quest_event(profile, {
		"type": "equip_item",
		"itemId": "weapon_wooden_club",
		"slot": EquipmentModel.SLOT_RIGHT_HAND_WEAPON,
		"amount": 1,
	})
	profile = equip_event.get("profile", profile)
	var equip_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = equip_claim.get("profile", profile)
	var equip_ok := (
		bool(equip_result.get("ok", false))
		and bool(equip_event.get("ready", false))
		and bool(equip_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == "quest_first_victory"
		and PlayerProgressModel.equipped_item_id(profile, EquipmentModel.SLOT_RIGHT_HAND_WEAPON) == "weapon_wooden_club"
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_HEAL_SINGLE) == before_equip_medicine + 1
	)

	var before_victory_coins := PlayerProgressModel.stone_coins(profile)
	var before_medicine := PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_HEAL_SINGLE)
	var victory_event := PlayerProgressModel.record_quest_event(profile, {
		"type": "battle_victory",
		"encounterGroupId": "firebud_grass_01",
	})
	profile = victory_event.get("profile", profile)
	var victory_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = victory_claim.get("profile", profile)
	var victory_ok := (
		bool(victory_event.get("ready", false))
		and bool(victory_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == "quest_capture_wuli"
		and PlayerProgressModel.stone_coins(profile) == before_victory_coins + 30
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_HEAL_SINGLE) == before_medicine + 1
	)

	var before_capture_coins := PlayerProgressModel.stone_coins(profile)
	var before_net := PlayerProgressModel.backpack_item_count(profile, BattleModel.CAPTURE_TOOL_NET)
	var capture_event := PlayerProgressModel.record_quest_event(profile, {
		"type": "capture_pet",
		"formId": "wuli_normal_orange_fire10",
		"lineId": "wuli",
		"amount": 1,
	})
	profile = capture_event.get("profile", profile)
	var capture_claim := PlayerProgressModel.claim_active_quest(profile)
	profile = capture_claim.get("profile", profile)
	var capture_ok := (
		bool(capture_event.get("ready", false))
		and bool(capture_claim.get("ok", false))
		and PlayerProgressModel.active_quest_id(profile) == ""
		and PlayerProgressModel.stone_coins(profile) == before_capture_coins + 60
		and PlayerProgressModel.backpack_item_count(profile, BattleModel.CAPTURE_TOOL_NET) == before_net + 1
	)

	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_training_yard")
	var trainer := InteractionModel.find_by_id(map_data, "trainer")
	var ui_open_ok := false
	var ui_advance_ok := false
	if loaded and not trainer.is_empty():
		_open_interaction_dialog(trainer)
		await get_tree().process_frame
		ui_open_ok = (
			_dialog_is_open()
			and dialog_option_button != null
			and dialog_option_button.text == "完成"
			and dialog_body_label != null
			and dialog_body_label.text.find("任务：认识训练师") >= 0
		)
		_confirm_dialog_action()
		await get_tree().process_frame
		ui_advance_ok = (
			PlayerProgressModel.active_quest_id(player_profile) == "quest_buy_supply"
			and world_log_message.find("完成任务「认识训练师」") >= 0
			and _current_task_text().find("补给准备") >= 0
		)
	var status := "ok" if validation_ok and start_ok and talk_ready_ok and talk_claim_ok and buy_ok and use_ok and buy_weapon_ok and equip_ok and victory_ok and capture_ok and ui_open_ok and ui_advance_ok else "failed"
	print("quest chain check ready: status=%s validation=%s start=%s talk_ready=%s talk_claim=%s buy=%s use_meat=%s buy_weapon=%s equip=%s victory=%s capture=%s ui_open=%s ui_advance=%s final_task=%s coins=%d meat=%d rope=%d net=%d weapon=%d" % [
		status,
		str(validation_ok),
		str(start_ok),
		str(talk_ready_ok),
		str(talk_claim_ok),
		str(buy_ok),
		str(use_ok),
		str(buy_weapon_ok),
		str(equip_ok),
		str(victory_ok),
		str(capture_ok),
		str(ui_open_ok),
		str(ui_advance_ok),
		PlayerProgressModel.quest_progress_text(profile),
		PlayerProgressModel.stone_coins(profile),
		PlayerProgressModel.backpack_item_count(profile, BattleModel.ITEM_MEAT_SMALL),
		PlayerProgressModel.backpack_item_count(profile, BattleModel.CAPTURE_TOOL_ROPE_BASIC),
		PlayerProgressModel.backpack_item_count(profile, BattleModel.CAPTURE_TOOL_NET),
		PlayerProgressModel.backpack_item_count(profile, "weapon_wooden_club"),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_quest_ui_check() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	var panel_ok := (
		loaded
		and quest_panel != null
		and quest_panel.visible
		and quest_menu_button != null
		and quest_menu_button.text == "任务"
		and quest_title_label != null
		and quest_title_label.text == "认识训练师"
		and quest_detail_label != null
		and quest_detail_label.text.find("和训练师阿土对话") >= 0
		and quest_detail_label.text.find("奖励") >= 0
		and quest_route_button != null
		and not quest_route_button.disabled
	)
	_on_quest_route_pressed()
	await get_tree().process_frame
	var trainer_route_ok := (
		has_pending_interaction
		and str(pending_interaction.get("id", "")) == "trainer"
		and quest_panel != null
		and not quest_panel.visible
		and world_log_message.find("训练师阿土") >= 0
	)

	var intro_event := PlayerProgressModel.record_quest_event(PlayerProgressModel.default_profile(), {
		"type": "talk",
		"targetId": "trainer",
	})
	var buy_profile: Dictionary = PlayerProgressModel.claim_active_quest(intro_event.get("profile", {}) as Dictionary).get("profile", {})
	player_profile = buy_profile
	_clear_navigation_state()
	_load_map("firebud_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	var buy_detail_ok := quest_detail_label != null and quest_detail_label.text.find("火芽杂货铺") >= 0
	_on_quest_route_pressed()
	await get_tree().process_frame
	var cross_map_route_ok := (
		has_pending_interaction
		and str(pending_interaction.get("id", "")) == "warp_to_village_gate"
		and world_log_message.find("村口木门") >= 0
	)
	_load_map("firebud_village_gate", "from_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	_on_quest_route_pressed()
	await get_tree().process_frame
	var shop_route_ok := has_pending_interaction and str(pending_interaction.get("id", "")) == "firebud_shopkeeper"

	var buy_action := PlayerProgressModel.buy_shop_item(buy_profile, ShopCatalogModel.DEFAULT_SHOP_ID, BattleModel.ITEM_MEAT_SMALL)
	var bought_profile := buy_action.get("profile", buy_profile) as Dictionary
	var buy_event := PlayerProgressModel.record_quest_event(bought_profile, {
		"type": "buy_item",
		"shopId": ShopCatalogModel.DEFAULT_SHOP_ID,
		"itemId": BattleModel.ITEM_MEAT_SMALL,
		"amount": 1,
	})
	var use_profile: Dictionary = PlayerProgressModel.claim_active_quest(buy_event.get("profile", {}) as Dictionary).get("profile", {})
	player_profile = use_profile
	_clear_navigation_state()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	_on_quest_route_pressed()
	await get_tree().process_frame
	var use_route_ok := (
		backpack_panel != null
		and backpack_panel.visible
		and world_log_message.find("随身包") >= 0
		and _current_task_text().find("给宠物喂肉") >= 0
	)

	var use_action := PlayerProgressModel.use_world_pet_heal_item(use_profile, BattleModel.ITEM_MEAT_SMALL, "pet_bui_main")
	var used_profile := use_action.get("profile", use_profile) as Dictionary
	var use_event := PlayerProgressModel.record_quest_event(used_profile, {
		"type": "use_world_item",
		"itemId": BattleModel.ITEM_MEAT_SMALL,
		"targetType": "pet",
		"amount": 1,
	})
	var weapon_profile: Dictionary = PlayerProgressModel.claim_active_quest(use_event.get("profile", {}) as Dictionary).get("profile", {})
	player_profile = weapon_profile
	_clear_navigation_state()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	_on_quest_route_pressed()
	await get_tree().process_frame
	var equipment_shop_route_ok := (
		has_pending_interaction
		and str(pending_interaction.get("id", "")) == "firebud_equipment_keeper"
		and _current_task_text().find("准备武器") >= 0
	)

	var buy_weapon_action := PlayerProgressModel.buy_shop_item(weapon_profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_wooden_club")
	var bought_weapon_profile := buy_weapon_action.get("profile", weapon_profile) as Dictionary
	var buy_weapon_event := PlayerProgressModel.record_quest_event(bought_weapon_profile, {
		"type": "buy_item",
		"shopId": FIREBUD_EQUIPMENT_SHOP_ID,
		"itemId": "weapon_wooden_club",
		"amount": 1,
	})
	var equip_profile: Dictionary = PlayerProgressModel.claim_active_quest(buy_weapon_event.get("profile", {}) as Dictionary).get("profile", {})
	player_profile = equip_profile
	_clear_navigation_state()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	_on_quest_route_pressed()
	await get_tree().process_frame
	var equip_route_ok := (
		backpack_panel != null
		and backpack_panel.visible
		and world_log_message.find("随身包") >= 0
		and _current_task_text().find("装备木棒") >= 0
	)

	var equip_action := PlayerProgressModel.equip_item(equip_profile, "weapon_wooden_club")
	var equipped_profile := equip_action.get("profile", equip_profile) as Dictionary
	var equip_event := PlayerProgressModel.record_quest_event(equipped_profile, {
		"type": "equip_item",
		"itemId": "weapon_wooden_club",
		"slot": EquipmentModel.SLOT_RIGHT_HAND_WEAPON,
		"amount": 1,
	})
	var battle_profile: Dictionary = PlayerProgressModel.claim_active_quest(equip_event.get("profile", {}) as Dictionary).get("profile", {})
	player_profile = battle_profile
	_clear_navigation_state()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_quest_panel()
	await get_tree().process_frame
	_on_quest_route_pressed()
	await get_tree().process_frame
	var battle_route_ok := (
		has_target_cell
		and EncounterModel.zone_contains_cell(EncounterModel.zone_for_cell(map_data, target_cell), target_cell)
		and _current_task_text().find("村外试炼") >= 0
	)

	world_log_history.clear()
	world_log_message = ""
	for index in range(14):
		_set_world_log_message("历史记录%d" % index)
	await get_tree().process_frame
	var log_text := battle_log_label.text if battle_log_label != null else ""
	var log_scroll_ok := (
		battle_message_panel != null
		and battle_message_panel.visible
		and battle_log_label != null
		and battle_log_label.scroll_active
		and battle_log_label.scroll_following
		and log_text.find("历史记录0") >= 0
		and log_text.find("历史记录13") >= 0
		and world_log_message == "历史记录13"
	)

	var status := "ok" if panel_ok and trainer_route_ok and buy_detail_ok and cross_map_route_ok and shop_route_ok and use_route_ok and equipment_shop_route_ok and equip_route_ok and battle_route_ok and log_scroll_ok else "failed"
	print("quest ui check ready: status=%s panel=%s trainer_route=%s buy_detail=%s cross_map=%s shop_route=%s use_route=%s equipment_shop=%s equip_route=%s battle_route=%s log_scroll=%s current_task=%s latest_log=%s" % [
		status,
		str(panel_ok),
		str(trainer_route_ok),
		str(buy_detail_ok),
		str(cross_map_route_ok),
		str(shop_route_ok),
		str(use_route_ok),
		str(equipment_shop_route_ok),
		str(equip_route_ok),
		str(battle_route_ok),
		str(log_scroll_ok),
		_current_task_text(),
		world_log_message,
	])
	get_tree().quit(0 if status == "ok" else 1)


func _battle_reward_test_state(zone_id: String, profile: Dictionary = {}) -> Dictionary:
	var reward_state := BattleModel.create_wild_battle({
		"id": zone_id,
		"name": "奖励验证",
		"encounterGroupId": "firebud_grass_01",
		"selectedWildPet": {
			"formId": "wuli_normal_orange_fire10",
			"name": "野生乌力",
			"level": 1,
			"battleStats": {
				"maxHp": 80,
				"attack": 10,
				"defense": 6,
				"agility": 48,
			},
		},
	})
	if not profile.is_empty():
		reward_state = PlayerProgressModel.apply_profile_to_battle_state(profile, reward_state)
	reward_state["targetSeed"] = zone_id
	var actors: Array = reward_state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := actors[index] as Dictionary
		if str(actor.get("side", "")) == BattleModel.SIDE_ENEMY:
			actor["hp"] = 0
			actors[index] = actor
	reward_state["actors"] = actors
	return reward_state


func _item_amount_count(value, item_id: String) -> int:
	var total := 0
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry := entry_value as Dictionary
			if str(entry.get("itemId", "")) == item_id:
				total += maxi(0, int(entry.get("count", 0)))
	return total


func _run_pet_encounter_table_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	if not _load_map("firebud_village_gate", "from_training_yard"):
		return
	var zones := EncounterModel.encounter_zones(map_data)
	if zones.is_empty():
		return
	var zone := (zones[0] as Dictionary).duplicate(true)
	zone["selectedWildPet"] = {
		"formId": "wuli_normal_fast_wind10",
		"name": "高速乌力",
		"level": 3,
		"levelMin": 1,
		"levelMax": 3,
		"battleStats": {
			"maxHp": 92,
			"attack": 11,
			"defense": 6,
			"agility": 88,
		},
	}
	var preview_cell := EncounterModel.first_walkable_cell(map_data, zone)
	player.global_position = IsoMapModel.grid_to_world(map_data, preview_cell)
	last_checked_player_cell = preview_cell
	_update_camera_position(true)
	_trigger_encounter(zone)


func _run_auto_pet_capture_feedback_check() -> void:
	profile_save_enabled = false
	var standby_profile := PlayerProgressModel.default_profile()
	var standby_before_party := PlayerProgressModel.party_pet_instances(standby_profile).size()
	var standby_result := _pet_capture_feedback_result(standby_profile, "pet_capture_feedback_party")
	var standby_after_profile := standby_result.get("profile", {}) as Dictionary
	var standby_captured := _first_captured_pet_from_result(standby_result)
	var standby_log := _battle_result_log_text(standby_result)
	var standby_join_ok := (
		not standby_captured.is_empty()
		and str(standby_captured.get("state", "")) == PlayerProgressModel.PET_STATE_STANDBY
		and PlayerProgressModel.party_pet_instances(standby_after_profile).size() == standby_before_party + 1
		and standby_log.find("捕获野生乌力 Lv1，战力84，已加入队伍。") >= 0
	)

	var storage_profile := PlayerProgressModel.default_profile()
	var storage_instances: Array = storage_profile.get("petInstances", [])
	storage_instances.append(PlayerProgressModel.create_pet_instance_from_form(
		"pet_bui_feedback_extra",
		"备用布伊",
		"bui_normal_red_fire10",
		PlayerProgressModel.PET_STATE_STANDBY,
		1
	))
	storage_profile["petInstances"] = storage_instances
	storage_profile = PlayerProgressModel.normalize_profile(storage_profile)
	var storage_before_party := PlayerProgressModel.party_pet_instances(storage_profile).size()
	var storage_before_storage := PlayerProgressModel.storage_pet_instances(storage_profile).size()
	var storage_result := _pet_capture_feedback_result(storage_profile, "pet_capture_feedback_storage")
	var storage_after_profile := storage_result.get("profile", {}) as Dictionary
	var storage_captured := _first_captured_pet_from_result(storage_result)
	var storage_log := _battle_result_log_text(storage_result)
	var storage_destination_ok := (
		not storage_captured.is_empty()
		and str(storage_captured.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		and PlayerProgressModel.party_pet_instances(storage_after_profile).size() == PlayerProgressModel.PARTY_LIMIT
		and PlayerProgressModel.storage_pet_instances(storage_after_profile).size() == storage_before_storage + 1
		and storage_log.find("捕获野生乌力 Lv1，战力84，队伍已满，已送入兽栏。") >= 0
	)
	var status := "ok" if standby_join_ok and storage_destination_ok else "failed"
	print("pet capture feedback check ready: status=%s standby=%s storage=%s standby_before_party=%d storage_before_party=%d storage_before_storage=%d standby_log=%s storage_log=%s" % [
		status,
		str(standby_join_ok),
		str(storage_destination_ok),
		standby_before_party,
		storage_before_party,
		storage_before_storage,
		standby_log.replace("\n", " / "),
		storage_log.replace("\n", " / "),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_pet_capture_feedback_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var result := _pet_capture_feedback_result(player_profile, "pet_capture_feedback_preview")
	player_profile = result.get("profile", player_profile)
	_set_world_log_message(_battle_result_log_text(result))
	_update_hud_text()


func _pet_capture_feedback_result(profile: Dictionary, zone_id: String) -> Dictionary:
	var capture_state := _pet_capture_feedback_state(zone_id)
	capture_state = PlayerProgressModel.apply_profile_to_battle_state(profile, capture_state)
	return PlayerProgressModel.apply_battle_result(profile, capture_state, "victory")


func _pet_capture_feedback_state(zone_id: String) -> Dictionary:
	var capture_state := BattleModel.create_wild_battle({
		"id": zone_id,
		"name": "捕捉反馈验证",
		"selectedWildPet": {
			"formId": "wuli_normal_orange_fire10",
			"name": "野生乌力",
			"level": 1,
			"battleStats": {
				"maxHp": 80,
				"attack": 10,
				"defense": 6,
				"agility": 48,
			},
		},
	})
	var actors: Array = capture_state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := (actors[index] as Dictionary).duplicate(true)
		if str(actor.get("id", "")) != "enemy_0":
			continue
		actor["captured"] = true
		actor["hp"] = 0
		actors[index] = actor
		break
	capture_state["actors"] = actors
	return capture_state


func _first_captured_pet_from_result(result: Dictionary) -> Dictionary:
	var captured_values = result.get("capturedPets", [])
	if not (captured_values is Array):
		return {}
	for value in captured_values:
		if value is Dictionary:
			return value as Dictionary
	return {}


func _battle_result_log_text(result: Dictionary) -> String:
	var log_lines: Array[String] = []
	for line in result.get("logLines", []):
		log_lines.append(str(line))
	return "\n".join(log_lines)


func _run_auto_battle_status_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle status check ready: status=failed started=false")
		get_tree().quit(1)
		return

	battle_state = BattleModel.set_actor_status(battle_state, "enemy_front_3", BattleModel.STATUS_POISON, 3, 7, BattleModel.PLAYER_ACTOR_ID)
	var poison_events := BattleModel.build_round_end_status_events(battle_state)
	var poison_event := {}
	for value in poison_events:
		var candidate := value as Dictionary
		if str(candidate.get("targetId", "")) == "enemy_front_3":
			poison_event = candidate
			break
	var poison_before_hp := int(BattleModel.actor_by_id(battle_state, "enemy_front_3").get("hp", 0))
	var poison_before_snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, poison_event)
	var poison_ledger := BattleEventLedger.build_from_applied_state(battle_state, poison_event, poison_before_snapshots, _battle_event_timeline_for_applied_event(poison_event))
	var poison_after := BattleModel.actor_by_id(battle_state, "enemy_front_3")
	var poison_ok := (
		str(poison_ledger.get("type", "")) == "status_tick"
		and str(poison_ledger.get("statusId", "")) == BattleModel.STATUS_POISON
		and int(poison_after.get("hp", 0)) == poison_before_hp - 7
		and BattleStatusModel.status_turns(poison_after, BattleModel.STATUS_POISON) == 2
	)

	battle_state = BattleModel.set_actor_status(battle_state, "enemy_back_1", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	var sleep_before_hp := int(BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_ACTOR_ID).get("hp", 0))
	var sleep_event := {
		"type": "attack",
		"attackerId": "enemy_back_1",
		"targetId": BattleModel.PLAYER_ACTOR_ID,
		"targetSide": BattleModel.SIDE_ALLY,
		"damage": 20,
		"speed": 80,
			"sequence": 1,
			"movementStyle": "melee",
			"canLaunch": true,
			"forceDodge": false,
			"forceCritical": false,
		}
	var sleep_before_snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, sleep_event)
	var sleep_ledger := BattleEventLedger.build_from_applied_state(battle_state, sleep_event, sleep_before_snapshots, _battle_event_timeline_for_applied_event(sleep_event))
	var sleep_after_actor := BattleModel.actor_by_id(battle_state, "enemy_back_1")
	var sleep_ok := (
		str(sleep_ledger.get("type", "")) == "status_skip"
		and str(sleep_ledger.get("statusId", "")) == BattleModel.STATUS_SLEEP
		and int(BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_ACTOR_ID).get("hp", 0)) == sleep_before_hp
		and BattleStatusModel.status_turns(sleep_after_actor, BattleModel.STATUS_SLEEP) == 1
	)

	var plain_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_attack_high", "enemy_back_4")
	battle_state = BattleModel.set_actor_status(battle_state, "enemy_back_4", BattleModel.STATUS_STONE, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	var stone_damage := BattleModel.attack_damage_preview_for(battle_state, "ally_attack_high", "enemy_back_4")
	var stone_ok := stone_damage < plain_damage

	battle_state = BattleModel.set_actor_status(battle_state, "ally_speed_fast", BattleModel.STATUS_CONFUSION, 2, 0, "enemy_back_2")
	var confusion_event := {
		"type": "attack",
		"attackerId": "ally_speed_fast",
		"targetId": "enemy_front_1",
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 18,
		"speed": 120,
			"sequence": 2,
			"movementStyle": "melee",
			"canLaunch": false,
			"forceDodge": false,
			"forceCritical": false,
		}
	var confusion_before_snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, confusion_event)
	var confusion_ledger := BattleEventLedger.build_from_applied_state(battle_state, confusion_event, confusion_before_snapshots, _battle_event_timeline_for_applied_event(confusion_event))
	var confused_target := BattleModel.actor_by_id(battle_state, str(confusion_ledger.get("resolvedTargetId", "")))
	var confusion_ok := (
		str(confusion_ledger.get("statusResult", "")) == "confused_retarget"
		and bool(confusion_ledger.get("retargeted", false))
		and str(confused_target.get("side", "")) == BattleModel.SIDE_ALLY
		and BattleStatusModel.status_turns(BattleModel.actor_by_id(battle_state, "ally_speed_fast"), BattleModel.STATUS_CONFUSION) == 1
	)

	battle_state = BattleModel.set_actor_status(battle_state, "enemy_front_2", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	var wake_event := {
		"type": "attack",
		"attackerId": BattleModel.PLAYER_ACTOR_ID,
		"targetId": "enemy_front_2",
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 1,
		"speed": 100,
			"sequence": 3,
			"movementStyle": "melee",
			"canLaunch": false,
			"forceDodge": false,
			"forceCritical": false,
		}
	battle_state = BattleModel.apply_battle_event(battle_state, wake_event)
	var wake_target := BattleModel.actor_by_id(battle_state, "enemy_front_2")
	var wake_ok := not BattleStatusModel.has_status(wake_target, BattleModel.STATUS_SLEEP)

	var status := "ok" if poison_ok and sleep_ok and stone_ok and confusion_ok and wake_ok else "failed"
	print("battle status check ready: status=%s poison=%s sleep=%s stone=%s confusion=%s wake=%s poison_hp=%d poison_turns=%d plain=%d stone=%d confused_target=%s" % [
		status,
		str(poison_ok),
		str(sleep_ok),
		str(stone_ok),
		str(confusion_ok),
		str(wake_ok),
		int(poison_after.get("hp", 0)),
		BattleStatusModel.status_turns(poison_after, BattleModel.STATUS_POISON),
		plain_damage,
		stone_damage,
		str(confusion_ledger.get("resolvedTargetId", "")),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_status_skill_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle status skill check ready: status=failed started=false")
		get_tree().quit(1)
		return
	_set_battle_command_owner("pet")
	var labels_ok := false
	if battle_command_buttons.has("defend") and battle_command_buttons.has("item") and battle_command_buttons.has("switch_pet"):
		var sleep_button := battle_command_buttons["defend"] as Button
		var confuse_button := battle_command_buttons["item"] as Button
		var stone_button := battle_command_buttons["switch_pet"] as Button
		labels_ok = (
			sleep_button != null
			and confuse_button != null
			and stone_button != null
			and sleep_button.text == "技4 催眠粉"
			and confuse_button.text == "技5 迷惑吼"
			and stone_button.text == "技6 石化凝视"
		)
	var sleep_result := _auto_apply_pet_status_skill_for_check(BattleModel.PET_SKILL_SLEEP_POWDER, "enemy_back_1", BattleModel.STATUS_SLEEP)
	var confusion_result := _auto_apply_pet_status_skill_for_check(BattleModel.PET_SKILL_CONFUSE_CRY, "enemy_back_2", BattleModel.STATUS_CONFUSION)
	var stone_result := _auto_apply_pet_status_skill_for_check(BattleModel.PET_SKILL_STONE_GAZE, "enemy_back_3", BattleModel.STATUS_STONE)
	var sleep_ok := bool(sleep_result.get("ok", false))
	var confusion_ok := bool(confusion_result.get("ok", false))
	var stone_ok := bool(stone_result.get("ok", false))
	var status := "ok" if labels_ok and sleep_ok and confusion_ok and stone_ok else "failed"
	print("battle status skill check ready: status=%s labels=%s sleep=%s confusion=%s stone=%s sleep_event=%s confusion_event=%s stone_event=%s" % [
		status,
		str(labels_ok),
		str(sleep_ok),
		str(confusion_ok),
		str(stone_ok),
		str(sleep_result.get("eventType", "")),
		str(confusion_result.get("eventType", "")),
		str(stone_result.get("eventType", "")),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_status_hit_check() -> void:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle status hit check ready: status=failed started=false")
		get_tree().quit(1)
		return
	var applied_result := _auto_apply_pet_status_hit_case(
		BattleModel.PET_SKILL_SLEEP_POWDER,
		"enemy_back_1",
		BattleModel.STATUS_SLEEP,
		0.0,
		1.0,
		"applied"
	)
	var resisted_result := _auto_apply_pet_status_hit_case(
		BattleModel.PET_SKILL_CONFUSE_CRY,
		"enemy_back_4",
		BattleModel.STATUS_CONFUSION,
		1.0,
		BattleActionCatalog.effect_status_hit_rate_for(BattleModel.PET_SKILL_CONFUSE_CRY, 0.78),
		"resisted"
	)
	var poison_result := _auto_apply_poison_resist_case()
	var status := "ok" if bool(applied_result.get("ok", false)) and bool(resisted_result.get("ok", false)) and bool(poison_result.get("ok", false)) else "failed"
	print("battle status hit check ready: status=%s applied=%s resisted=%s poison_resisted=%s applied_chance=%.2f resisted_chance=%.2f poison_chance=%.2f" % [
		status,
		str(applied_result.get("result", "")),
		str(resisted_result.get("result", "")),
		str(poison_result.get("result", "")),
		float(applied_result.get("chance", -1.0)),
		float(resisted_result.get("chance", -1.0)),
		float(poison_result.get("chance", -1.0)),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_status_rule_check() -> void:
	var cleanse_ok := await _auto_check_status_cleanse_item()
	var overwrite_result := _auto_check_status_overwrite()
	var immune_result := _auto_check_status_immunity()
	var status := "ok" if cleanse_ok and bool(overwrite_result.get("ok", false)) and bool(immune_result.get("ok", false)) else "failed"
	print("battle status rule check ready: status=%s cleanse=%s overwrite=%s immune=%s overwrite_result=%s immune_result=%s" % [
		status,
		str(cleanse_ok),
		str(overwrite_result.get("ok", false)),
		str(immune_result.get("ok", false)),
		str(overwrite_result.get("result", "")),
		str(immune_result.get("result", "")),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_battle_passive_hover_check() -> void:
	var catalog_errors := BattlePassiveCatalog.validation_errors()
	catalog_errors.append_array(PetTemplateCatalog.validation_errors())
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		print("battle passive hover check ready: status=failed started=false")
		get_tree().quit(1)
		return

	var passive_actor := BattleModel.actor_by_id(battle_state, "ally_front_4")
	var hover_screen := _world_to_screen(_battle_slot_world_position(str(passive_actor.get("slotId", ""))))
	_update_battle_hover_at_screen_point(hover_screen)
	await get_tree().process_frame
	var passive_text := battle_passive_label.text if battle_passive_label != null else ""
	var passive_visible := battle_passive_panel != null and battle_passive_panel.visible
	var passive_text_fit_ok := (
		battle_passive_label != null
		and battle_passive_label.clip_text
		and battle_passive_label.max_lines_visible == BATTLE_PASSIVE_MAX_LINES
		and battle_passive_label.text_overrun_behavior == TextServer.OVERRUN_TRIM_ELLIPSIS
		and battle_passive_label.get_theme_font_size("font_size") <= BATTLE_PASSIVE_LABEL_FONT_SIZE
		and battle_passive_panel != null
		and battle_passive_panel.size.y >= BATTLE_PASSIVE_PANEL_COMPACT_HEIGHT
		and battle_passive_label.size.y >= BATTLE_PASSIVE_PANEL_COMPACT_HEIGHT - BATTLE_PASSIVE_PANEL_PADDING.y * 2.0
	)
	var passive_ok := (
		catalog_errors.is_empty()
		and passive_visible
		and passive_text_fit_ok
		and passive_text.find("被动技能: [抗性皮肤] 根据地水火风属性分别获得石化、中毒、混乱、睡眠抗性。") >= 0
		and battle_passive_panel.z_index < battle_command_panel.z_index
		and BattleModel.actor_passive_skill_ids_for_trace(passive_actor).has("bui_resistant_skin")
	)

	var command_visible_before := battle_command_panel != null and battle_command_panel.visible and not _battle_commands_locked()
	var player_size_before := battle_command_panel.size
	var player_columns_before := battle_command_button_grid.columns if battle_command_button_grid != null else 0
	_on_battle_command_pressed("attack")
	var selected_for_pet_menu := _auto_click_enemy_target("enemy_front_4")
	await get_tree().process_frame
	var pet_owner_at_menu := battle_command_owner
	var pet_columns_at_menu := battle_command_button_grid.columns if battle_command_button_grid != null else -1
	var pet_size_at_menu := battle_command_panel.size
	var expected_pet_size_at_menu := _battle_command_panel_size(_layout_size())
	var pet_position_at_menu := battle_command_panel.position
	var pet_menu_layout_ok := (
		selected_for_pet_menu
		and battle_command_owner == "pet"
		and battle_command_button_grid != null
		and battle_command_button_grid.columns == 1
		and pet_size_at_menu.distance_to(expected_pet_size_at_menu) < 1.0
		and battle_command_panel.position.x + battle_command_panel.size.x <= _layout_size().x - 17.0
	)
	_on_battle_command_pressed("help")
	await get_tree().process_frame
	var player_return_layout_ok := (
		battle_command_owner == "player"
		and battle_command_button_grid != null
		and battle_command_button_grid.columns == player_columns_before
		and battle_command_panel.size.distance_to(player_size_before) < 1.0
	)

	_on_battle_command_pressed("defend")
	var pet_command_open := battle_command_owner == "pet" and battle_command_panel != null and battle_command_panel.visible
	_auto_submit_pet_defend_if_needed()
	await get_tree().process_frame
	var hidden_during_action := battle_command_panel != null and not battle_command_panel.visible and _battle_commands_locked()
	var guard := 0
	while guard < 2400 and battle_active and (_battle_commands_locked() or battle_command_panel == null or not battle_command_panel.visible):
		guard += 1
		await get_tree().process_frame
	var visible_after_action := battle_active and battle_command_panel != null and battle_command_panel.visible and not _battle_commands_locked()
	var status := "ok" if passive_ok and command_visible_before and pet_menu_layout_ok and player_return_layout_ok and pet_command_open and hidden_during_action and visible_after_action else "failed"
	print("battle passive hover check ready: status=%s passive=%s text_fit=%s before=%s pet_layout=%s player_return=%s pet_menu=%s hidden_action=%s visible_after=%s pet_owner=%s pet_columns=%d pet_size=%s expected_pet_size=%s pet_pos=%s viewport=%s selected=%s label_size=%s text=%s errors=%s" % [
		status,
		str(passive_ok),
		str(passive_text_fit_ok),
		str(command_visible_before),
		str(pet_menu_layout_ok),
		str(player_return_layout_ok),
		str(pet_command_open),
		str(hidden_during_action),
		str(visible_after_action),
		pet_owner_at_menu,
		pet_columns_at_menu,
		str(pet_size_at_menu),
		str(expected_pet_size_at_menu),
		str(pet_position_at_menu),
		str(_layout_size()),
		str(selected_for_pet_menu),
		str(battle_passive_label.size if battle_passive_label != null else Vector2.ZERO),
		passive_text,
		str(catalog_errors),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_template_catalog_check() -> void:
	var catalog_errors := BattleActionCatalog.validation_errors()
	catalog_errors.append_array(BattlePassiveCatalog.validation_errors())
	catalog_errors.append_array(PetSkillTrainingModel.validation_errors())
	catalog_errors.append_array(PetTemplateCatalog.validation_errors())
	var bui_actor := BattlePassiveCatalog.apply_actor_passive_effects(PetTemplateCatalog.actor_from_form(
		"bui_normal_red_fire10",
		BattleModel.PLAYER_PET_ID,
		BattleModel.SIDE_ALLY,
		"pet",
		"ally.front.3"
	))
	var tough_bui_actor := BattlePassiveCatalog.apply_actor_passive_effects(PetTemplateCatalog.actor_from_form(
		"bui_normal_thick_earth10",
		"test_tough_bui",
		BattleModel.SIDE_ALLY,
		"pet",
		"ally.front.4"
	))
	var wuli_actor := BattlePassiveCatalog.apply_actor_passive_effects(PetTemplateCatalog.actor_from_form(
		"wuli_normal_orange_fire10",
		"test_wuli",
		BattleModel.SIDE_ALLY,
		"pet",
		"ally.front.5"
	))
	var tough_wuli_actor := BattlePassiveCatalog.apply_actor_passive_effects(PetTemplateCatalog.actor_from_form(
		"wuli_normal_tough_earth10",
		"test_tough_wuli",
		BattleModel.SIDE_ENEMY,
		"wild_pet",
		"enemy.front.4"
	))
	var bui_skill_ids := PetTemplateCatalog.active_skill_ids_for_actor(bui_actor)
	var wuli_skill_ids := PetTemplateCatalog.active_skill_ids_for_actor(wuli_actor)
	var bui_skills_ok := (
		bui_skill_ids.has(BattleModel.PET_SKILL_ATTACK)
		and bui_skill_ids.has(BattleModel.PET_SKILL_DEFEND)
		and bui_skill_ids.has(BattleModel.PET_SKILL_BUI_CHARGE)
		and bui_skill_ids.has(BattleModel.PET_SKILL_SLEEP_POWDER)
		and bui_skill_ids.has(BattleModel.PET_SKILL_CONFUSE_CRY)
		and bui_skill_ids.has(BattleModel.PET_SKILL_STONE_GAZE)
		and str(PetTemplateCatalog.pet_skill_action_for_actor_slot(bui_actor, 6).get("id", "")) == BattleModel.PET_SKILL_STONE_GAZE
		and PetTemplateCatalog.pet_skill_action_for_actor_slot(bui_actor, 7).is_empty()
	)
	var wuli_skills_ok := (
		wuli_skill_ids == [BattleModel.PET_SKILL_ATTACK, BattleModel.PET_SKILL_DEFEND]
		and PetTemplateCatalog.pet_skill_action_for_actor_slot(wuli_actor, 3).is_empty()
	)
	var bui_resist = bui_actor.get("statusResist", {})
	var bui_resist_dict := bui_resist as Dictionary if bui_resist is Dictionary else {}
	var tough_bui_resist = tough_bui_actor.get("statusResist", {})
	var tough_bui_resist_dict := tough_bui_resist as Dictionary if tough_bui_resist is Dictionary else {}
	var tough_wuli_resist = tough_wuli_actor.get("statusResist", {})
	var tough_wuli_resist_dict := tough_wuli_resist as Dictionary if tough_wuli_resist is Dictionary else {}
	var tough_wuli_immune = tough_wuli_actor.get("statusImmune", {})
	var tough_wuli_immune_dict := tough_wuli_immune as Dictionary if tough_wuli_immune is Dictionary else {}
	var resist_ok := (
		is_equal_approx(float(bui_resist_dict.get(BattleModel.STATUS_CONFUSION, 0.0)), 0.1)
		and is_equal_approx(float(tough_bui_resist_dict.get(BattleModel.STATUS_STONE, 0.0)), 0.1)
		and is_equal_approx(float(tough_wuli_resist_dict.get(BattleModel.STATUS_STONE, 0.0)), 1.0)
		and bool(tough_wuli_immune_dict.get(BattleModel.STATUS_STONE, false))
	)
	var state := BattleModel.create_stat_formula_test_battle({"id": "pet_template_check", "name": "模板验证"})
	var battle_bui := BattleModel.actor_by_id(state, "ally_front_4")
	var battle_wuli := BattleModel.actor_by_id(state, "enemy_front_4")
	var battle_actor_ok := (
		str(battle_bui.get("formId", "")) == "bui_normal_thick_earth10"
		and str(battle_bui.get("lineName", "")) == "布伊系"
		and str(battle_bui.get("subtypeName", "")) == "普通布伊"
		and BattleModel.actor_passive_skill_ids_for_trace(battle_bui).has("bui_resistant_skin")
		and str(battle_wuli.get("formId", "")) == "wuli_normal_tough_earth10"
		and str(battle_wuli.get("lineName", "")) == "乌力系"
		and bool((battle_wuli.get("statusImmune", {}) as Dictionary).get(BattleModel.STATUS_STONE, false))
	)
	var party := BattleModel.player_pet_party(state)
	var party_ok := party.size() >= 4
	if party_ok:
		var standby_speed := BattleModel.pet_party_entry_by_id(state, "pet_bui_speed")
		var standby_tough := BattleModel.pet_party_entry_by_id(state, "pet_bui_tough")
		party_ok = (
			str(standby_speed.get("formId", "")) == "bui_normal_yellow_wind10"
			and str(standby_speed.get("lineName", "")) == "布伊系"
			and int((standby_speed.get("elements", {}) as Dictionary).get("wind", 0)) == 10
			and str(standby_tough.get("formId", "")) == "bui_normal_thick_earth10"
			and int((standby_tough.get("elements", {}) as Dictionary).get("earth", 0)) == 10
		)
	var status := "ok" if catalog_errors.is_empty() and bui_skills_ok and wuli_skills_ok and resist_ok and battle_actor_ok and party_ok else "failed"
	print("pet template catalog check ready: status=%s errors=%d bui_skills=%s wuli_skills=%s resist=%s battle_actor=%s party=%s bui=%s wuli=%s" % [
		status,
		catalog_errors.size(),
		str(bui_skills_ok),
		str(wuli_skills_ok),
		str(resist_ok),
		str(battle_actor_ok),
		str(party_ok),
		str(bui_skill_ids),
		str(wuli_skill_ids),
	])
	if not catalog_errors.is_empty():
		print("pet template catalog errors: %s" % str(catalog_errors))
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_skill_training_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	player_profile[PlayerProgressModel.STONE_COINS_KEY] = 200
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	pet_selected_instance_id = "pet_bui_main"
	var catalog_errors := BattleActionCatalog.validation_errors()
	catalog_errors.append_array(PetSkillTrainingModel.validation_errors())
	catalog_errors.append_array(PetTemplateCatalog.validation_errors())
	var trainer_found := not InteractionModel.find_by_id(IsoMapModel.load_map(MAP_DATA_PATHS["firebud_village_gate"]), "firebud_pet_skill_trainer").is_empty()
	var before_pet := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	var default_slots := PlayerProgressModel.pet_skill_slots_for_instance(before_pet)
	var default_slots_ok := (
		default_slots.size() == PetTemplateCatalog.MAX_PET_SKILL_SLOTS
		and str(default_slots[0]) == BattleModel.PET_SKILL_ATTACK
		and str(default_slots[1]) == BattleModel.PET_SKILL_DEFEND
		and str(default_slots[5]) == BattleModel.PET_SKILL_STONE_GAZE
		and str(default_slots[6]) == ""
	)
	var before_coins := PlayerProgressModel.stone_coins(player_profile)
	var learn_result := PlayerProgressModel.learn_pet_skill(player_profile, pet_selected_instance_id, BattleModel.PET_SKILL_FOCUS_BITE, PetSkillTrainingModel.DEFAULT_TRAINER_ID)
	player_profile = learn_result.get("profile", player_profile)
	var after_learn_pet := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	var after_learn_slots := PlayerProgressModel.pet_skill_slots_for_instance(after_learn_pet)
	var after_learn_skills = after_learn_pet.get("activeSkillIds", [])
	var learned_focus := after_learn_skills is Array and (after_learn_skills as Array).has(BattleModel.PET_SKILL_FOCUS_BITE)
	var learn_ok := (
		bool(learn_result.get("ok", false))
		and PlayerProgressModel.stone_coins(player_profile) == before_coins - PetSkillTrainingModel.skill_cost(BattleModel.PET_SKILL_FOCUS_BITE)
		and learned_focus
		and str(after_learn_slots[6]) == BattleModel.PET_SKILL_FOCUS_BITE
	)
	var move_result := PlayerProgressModel.move_pet_skill_slot(player_profile, pet_selected_instance_id, 7, -1)
	player_profile = move_result.get("profile", player_profile)
	var after_move_pet := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	var after_move_slots := PlayerProgressModel.pet_skill_slots_for_instance(after_move_pet)
	var move_ok := (
		bool(move_result.get("ok", false))
		and str(after_move_slots[5]) == BattleModel.PET_SKILL_FOCUS_BITE
		and str(after_move_slots[6]) == BattleModel.PET_SKILL_STONE_GAZE
	)
	var actor := PlayerProgressModel.actor_from_pet_instance(after_move_pet, BattleModel.PLAYER_PET_ID, BattleModel.SIDE_ALLY, "ally.front.3")
	var actor_slot_ok := str(PetTemplateCatalog.pet_skill_action_for_actor_slot(actor, 6).get("id", "")) == BattleModel.PET_SKILL_FOCUS_BITE
	pet_skill_selected_slot = 6
	_open_pet_skill_panel(true, PetSkillTrainingModel.DEFAULT_TRAINER_ID)
	var panel_ok := (
		pet_skill_panel != null
		and pet_skill_panel.visible
		and pet_skill_learn_button != null
		and pet_skill_forget_button != null
		and pet_skill_forget_button.visible
		and not pet_skill_forget_button.disabled
	)
	_close_pet_skill_panel()
	var battle_slot_ok := false
	var button_label_ok := false
	var loaded := _load_map("firebud_village_gate", "doctor_record")
	var zones := EncounterModel.encounter_zones(map_data)
	if loaded and not zones.is_empty():
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
		var battle_pet := BattleModel.actor_by_id(battle_state, BattleModel.PLAYER_PET_ID)
		battle_slot_ok = str(PetTemplateCatalog.pet_skill_action_for_actor_slot(battle_pet, 6).get("id", "")) == BattleModel.PET_SKILL_FOCUS_BITE
		_set_battle_command_owner("pet")
		button_label_ok = _button_text_for_battle_command("switch_pet").find("集中咬击") >= 0
	var forget_result := PlayerProgressModel.forget_pet_skill(player_profile, pet_selected_instance_id, BattleModel.PET_SKILL_FOCUS_BITE)
	player_profile = forget_result.get("profile", player_profile)
	var after_forget_pet := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	var after_forget_slots := PlayerProgressModel.pet_skill_slots_for_instance(after_forget_pet)
	var after_forget_skills = after_forget_pet.get("activeSkillIds", [])
	var forgotten_skills = after_forget_pet.get("forgottenSkillIds", [])
	var forget_ok := (
		bool(forget_result.get("ok", false))
		and after_forget_skills is Array
		and not (after_forget_skills as Array).has(BattleModel.PET_SKILL_FOCUS_BITE)
		and forgotten_skills is Array
		and (forgotten_skills as Array).has(BattleModel.PET_SKILL_FOCUS_BITE)
		and not after_forget_slots.has(BattleModel.PET_SKILL_FOCUS_BITE)
		and str(after_forget_slots[5]) == ""
	)
	var status := "ok" if catalog_errors.is_empty() and trainer_found and default_slots_ok and learn_ok and move_ok and actor_slot_ok and battle_slot_ok and button_label_ok and panel_ok and forget_ok else "failed"
	print("pet skill training check ready: status=%s errors=%d trainer=%s default=%s learn=%s move=%s forget=%s actor_slot=%s battle_slot=%s button=%s panel=%s slots=%s afterForgetSlots=%s" % [
		status,
		catalog_errors.size(),
		str(trainer_found),
		str(default_slots_ok),
		str(learn_ok),
		str(move_ok),
		str(forget_ok),
		str(actor_slot_ok),
		str(battle_slot_ok),
		str(button_label_ok),
		str(panel_ok),
		str(after_move_slots),
		str(after_forget_slots),
	])
	if not catalog_errors.is_empty():
		print("pet skill training errors: %s" % str(catalog_errors))
	get_tree().quit(0 if status == "ok" else 1)


func _run_pet_skill_training_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	player_profile[PlayerProgressModel.STONE_COINS_KEY] = 200
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	pet_selected_instance_id = "pet_bui_main"
	_load_map("firebud_village_gate", "doctor_record")
	_set_world_log_message("Phase68：宠技训练。")
	await get_tree().create_timer(0.45).timeout
	_open_pet_skill_panel(true, PetSkillTrainingModel.DEFAULT_TRAINER_ID)
	pet_skill_selected_slot = 7
	_refresh_pet_skill_panel()
	await get_tree().create_timer(0.85).timeout
	var learn_result := PlayerProgressModel.learn_pet_skill(player_profile, pet_selected_instance_id, BattleModel.PET_SKILL_FOCUS_BITE, PetSkillTrainingModel.DEFAULT_TRAINER_ID)
	player_profile = learn_result.get("profile", player_profile)
	pet_skill_selected_slot = int(learn_result.get("slot", 7))
	_set_world_log_message(str(learn_result.get("message", "")))
	_refresh_pet_skill_panel()
	await get_tree().create_timer(0.95).timeout
	var move_result := PlayerProgressModel.move_pet_skill_slot(player_profile, pet_selected_instance_id, pet_skill_selected_slot, -1)
	player_profile = move_result.get("profile", player_profile)
	pet_skill_selected_slot = int(move_result.get("slot", pet_skill_selected_slot))
	_set_world_log_message(str(move_result.get("message", "")))
	_refresh_pet_skill_panel()
	await get_tree().create_timer(0.9).timeout
	_close_pet_skill_panel()
	var zones := EncounterModel.encounter_zones(map_data)
	if not zones.is_empty():
		_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))
		await get_tree().create_timer(0.45).timeout
		_submit_player_battle_command("defend")
		await get_tree().create_timer(1.8).timeout
	get_tree().quit(0)


func _auto_apply_pet_status_skill_for_check(skill_id: String, target_id: String, expected_status_id: String) -> Dictionary:
	var events := BattleModel.build_player_pet_round_events(
		battle_state,
		{"command": "defend"},
		{"command": "pet_skill", "targetId": target_id, "skillId": skill_id}
	)
	var skill_event := {}
	for value in events:
		var event := value as Dictionary
		if str(event.get("type", "")) == "skill_status" and str(event.get("skillId", "")) == skill_id:
			skill_event = event
			break
	if skill_event.is_empty():
		return {"ok": false, "eventType": ""}
	skill_event["statusHitRate"] = 1.0
	var snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, skill_event)
	var ledger := BattleEventLedger.build_from_applied_state(battle_state, skill_event, snapshots, _battle_event_timeline_for_applied_event(skill_event))
	var target := BattleModel.actor_by_id(battle_state, target_id)
	var applied_ok := (
		str(ledger.get("type", "")) == "skill_status"
		and str(ledger.get("statusId", "")) == expected_status_id
		and str(ledger.get("statusResult", "")) == "applied"
		and BattleStatusModel.has_status(target, expected_status_id)
		and BattleStatusModel.status_turns(target, expected_status_id) == BattleActionCatalog.effect_status_turns_for(skill_id, 2)
	)
	return {
		"ok": applied_ok,
		"eventType": str(ledger.get("type", "")),
	}


func _auto_check_status_cleanse_item() -> bool:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		return false
	var target_id := "ally_speed_normal"
	battle_state = BattleModel.set_actor_status(battle_state, target_id, BattleModel.STATUS_POISON, 3, 6, "enemy_back_1")
	battle_state = BattleModel.set_actor_status(battle_state, target_id, BattleModel.STATUS_SLEEP, 2, 0, "enemy_back_1")
	var before_count := BattleModel.item_count(battle_state, BattleModel.ITEM_CLEANSE_SINGLE)
	_on_battle_command_pressed("item")
	var menu_open := battle_command_owner == "item"
	var button_label_ok := false
	if battle_command_buttons.has("item"):
		var cleanse_button := battle_command_buttons["item"] as Button
		button_label_ok = cleanse_button != null and cleanse_button.text.begins_with("净化草5")
	_on_battle_command_pressed("item")
	var mode_ok := battle_target_mode == "ally_item_single" and battle_pending_item_id == BattleModel.ITEM_CLEANSE_SINGLE
	var actor := BattleModel.actor_by_id(battle_state, target_id)
	var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(actor.get("slotId", "")))))
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("item_cleanse", 1200)
	var target := BattleModel.actor_by_id(battle_state, target_id)
	var after_count := BattleModel.item_count(battle_state, BattleModel.ITEM_CLEANSE_SINGLE)
	return (
		menu_open
		and button_label_ok
		and mode_ok
		and selected
		and pet_panel_open
		and saw_event
		and after_count == before_count - 1
		and not BattleStatusModel.has_status(target, BattleModel.STATUS_POISON)
		and not BattleStatusModel.has_status(target, BattleModel.STATUS_SLEEP)
		and str(battle_last_event_ledger.get("statusResult", "")) == "cleansed"
	)


func _auto_check_status_overwrite() -> Dictionary:
	if not _start_stat_formula_test_battle():
		return {"ok": false, "result": "not_started"}
	battle_state = BattleModel.set_actor_status(battle_state, "enemy_back_1", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_PET_ID)
	var event := _status_rule_skill_event(BattleModel.PET_SKILL_STONE_GAZE, "enemy_back_1", BattleModel.STATUS_STONE, 1, 1.0)
	var snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, event)
	var ledger := BattleEventLedger.build_from_applied_state(battle_state, event, snapshots, _battle_event_timeline_for_applied_event(event))
	var target := BattleModel.actor_by_id(battle_state, "enemy_back_1")
	var saw_overwrite := false
	for change_value in ledger.get("statusChanges", []):
		var change := change_value as Dictionary
		if str(change.get("statusId", "")) == BattleModel.STATUS_SLEEP and str(change.get("change", "")) == "remove_overwritten":
			saw_overwrite = true
	return {
		"ok": str(ledger.get("statusResult", "")) == "applied"
			and BattleStatusModel.has_status(target, BattleModel.STATUS_STONE)
			and not BattleStatusModel.has_status(target, BattleModel.STATUS_SLEEP)
			and saw_overwrite,
		"result": str(ledger.get("statusResult", "")),
	}


func _auto_check_status_immunity() -> Dictionary:
	if not _start_stat_formula_test_battle():
		return {"ok": false, "result": "not_started"}
	var passive_ids := BattleModel.actor_passive_skill_ids_for_trace(BattleModel.actor_by_id(battle_state, "enemy_front_4"))
	var event := _status_rule_skill_event(BattleModel.PET_SKILL_STONE_GAZE, "enemy_front_4", BattleModel.STATUS_STONE, 2, 1.0)
	var snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, event)
	var ledger := BattleEventLedger.build_from_applied_state(battle_state, event, snapshots, _battle_event_timeline_for_applied_event(event))
	var target := BattleModel.actor_by_id(battle_state, "enemy_front_4")
	return {
		"ok": str(ledger.get("statusResult", "")) == "immune"
			and passive_ids.has("wuli_hard_shell")
			and not BattleStatusModel.has_status(target, BattleModel.STATUS_STONE),
		"result": str(ledger.get("statusResult", "")),
	}


func _status_rule_skill_event(skill_id: String, target_id: String, status_id: String, sequence: int, hit_rate: float) -> Dictionary:
	return {
		"type": "skill_status",
		"attackerId": BattleModel.PLAYER_PET_ID,
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"speed": 120,
		"sequence": sequence,
		"skillId": skill_id,
		"skillName": BattleActionCatalog.label_for(skill_id, "宠物技能"),
		"statusId": status_id,
		"statusTurns": 2,
		"statusPotency": 0,
		"statusHitRate": hit_rate,
		"movementStyle": "ranged_status",
		"canLaunch": false,
	}


func _auto_apply_pet_status_hit_case(skill_id: String, target_id: String, expected_status_id: String, resistance: float, hit_rate: float, expected_result: String) -> Dictionary:
	battle_state = BattleModel.set_actor_status_resist(battle_state, target_id, expected_status_id, resistance)
	var events := BattleModel.build_player_pet_round_events(
		battle_state,
		{"command": "defend"},
		{"command": "pet_skill", "targetId": target_id, "skillId": skill_id}
	)
	var skill_event := {}
	for value in events:
		var event := value as Dictionary
		if str(event.get("type", "")) == "skill_status" and str(event.get("skillId", "")) == skill_id:
			skill_event = event
			break
	if skill_event.is_empty():
		return {"ok": false, "result": "missing_event"}
	skill_event["statusHitRate"] = hit_rate
	var snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, skill_event)
	var ledger := BattleEventLedger.build_from_applied_state(battle_state, skill_event, snapshots, _battle_event_timeline_for_applied_event(skill_event))
	var target := BattleModel.actor_by_id(battle_state, target_id)
	var has_status := BattleStatusModel.has_status(target, expected_status_id)
	var result := str(ledger.get("statusResult", ""))
	var ok := (
		str(ledger.get("type", "")) == "skill_status"
		and str(ledger.get("statusId", "")) == expected_status_id
		and result == expected_result
		and has_status == (expected_result == "applied")
	)
	return {
		"ok": ok,
		"result": result,
		"chance": float(ledger.get("statusChance", -1.0)),
		"roll": float(ledger.get("statusRoll", -1.0)),
	}


func _auto_apply_poison_resist_case() -> Dictionary:
	var target_id := "enemy_back_5"
	battle_state = BattleModel.set_actor_status_resist(battle_state, target_id, BattleModel.STATUS_POISON, 1.0)
	var before_hp := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	var poison_event := {
		"type": "spirit_poison",
		"attackerId": BattleModel.PLAYER_ACTOR_ID,
		"targetId": target_id,
		"targetSide": BattleModel.SIDE_ENEMY,
		"damage": 8,
		"speed": 100,
		"sequence": 77,
		"skillName": BattleActionCatalog.label_for(BattleModel.SPIRIT_POISON_1, "毒精灵1"),
		"spiritId": BattleModel.SPIRIT_POISON_1,
		"statusId": BattleModel.STATUS_POISON,
		"statusTurns": 3,
		"statusPotency": 4,
		"statusHitRate": 0.6,
	}
	var snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, poison_event)
	var ledger := BattleEventLedger.build_from_applied_state(battle_state, poison_event, snapshots, _battle_event_timeline_for_applied_event(poison_event))
	var target := BattleModel.actor_by_id(battle_state, target_id)
	var after_hp := int(target.get("hp", 0))
	var result := str(ledger.get("statusResult", ""))
	var ok := (
		str(ledger.get("type", "")) == "spirit_poison"
		and result == "resisted"
		and after_hp < before_hp
		and not BattleStatusModel.has_status(target, BattleModel.STATUS_POISON)
	)
	return {
		"ok": ok,
		"result": result,
		"chance": float(ledger.get("statusChance", -1.0)),
		"roll": float(ledger.get("statusRoll", -1.0)),
	}


func _run_auto_battle_spirit_four_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
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
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
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
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
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
	var straight_event := {
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
		"forceDodge": false,
		"forceCritical": false,
	}
	battle_state = BattleModel.apply_battle_event(battle_state, straight_event)
	var straight_target := BattleModel.actor_by_id(battle_state, target_id)
	var straight_launch := bool(battle_state.get("lastLaunch", false)) and str(straight_target.get("actionState", "")) == "launched" and not bool(straight_target.get("revivable", true)) and str(battle_state.get("lastLaunchMode", "")) == "straight" and str(straight_target.get("petBattleState", "")) == "rest"
	var straight_duration_ok := _battle_event_duration(straight_event) >= BATTLE_LAUNCH_STRAIGHT_SECONDS - 0.001

	started = _start_stat_formula_test_battle()
	await get_tree().process_frame
	battle_state = BattleModel.set_actor_hp(battle_state, target_id, 18)
	var bounce_event := {
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
		"forceDodge": false,
		"forceCritical": false,
	}
	battle_state = BattleModel.apply_battle_event(battle_state, bounce_event)
	var bounce_target := BattleModel.actor_by_id(battle_state, target_id)
	var bounce_launch := bool(battle_state.get("lastLaunch", false)) and str(bounce_target.get("actionState", "")) == "launched" and not bool(bounce_target.get("revivable", true)) and str(battle_state.get("lastLaunchMode", "")) == "bounce" and str(bounce_target.get("petBattleState", "")) == "rest"
	var bounce_duration_ok := _battle_event_duration(bounce_event) >= BATTLE_LAUNCH_BOUNCE_SECONDS - 0.001

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
	var target_finishes_before_end := _battle_launch_target_progress(0.96) >= 0.99
	var target_holds_until_end := _battle_launch_target_progress(0.995) >= 0.99
	var attacker_reaches_contact := _battle_launch_attacker_lunge(BATTLE_LAUNCH_HIT_RATIO) >= 0.99
	var previous_launch_mode := battle_last_event_launch_mode
	battle_last_event_launch_mode = "bounce"
	var bounce_rotation_ok := absf(_battle_launch_rotation_for_progress(0.86)) > TAU * 1.8
	battle_last_event_launch_mode = previous_launch_mode
	var timeline_ok := target_waits_for_hit and target_moves_after_hit and target_finishes_before_end and target_holds_until_end and attacker_reaches_contact and bounce_rotation_ok
	var duration_ok := straight_duration_ok and bounce_duration_ok
	var status := "ok" if straight_launch and bounce_launch and poison_no_launch and timeline_ok and duration_ok else "failed"
	print("battle launch check ready: status=%s straight=%s bounce=%s poison_no_launch=%s timeline=%s duration=%s finish_before_end=%s hold_end=%s straight_state=%s bounce_state=%s poison_state=%s" % [
		status,
		str(straight_launch),
		str(bounce_launch),
		str(poison_no_launch),
		str(timeline_ok),
		str(duration_ok),
		str(target_finishes_before_end),
		str(target_holds_until_end),
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
	var command_id := _battle_command_id_for_spirit_id(BattleModel.SPIRIT_GRACE_1)
	if command_id != "":
		_on_battle_command_pressed(command_id)
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_heal_all", 1200)
	var healed_count := 0
	for target_id in battle_last_event_target_ids:
		if int((battle_state.get("lastEffectPerTarget", {}) as Dictionary).get(target_id, 0)) > 0:
			healed_count += 1
	return menu_open and command_id != "" and pet_panel_open and saw_event and battle_last_event_target_ids.size() >= 6 and healed_count >= 6


func _auto_check_moist_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	var target_ally_id := "ally_speed_normal"
	var target_actor := BattleModel.actor_by_id(battle_state, target_ally_id)
	battle_state = BattleModel.set_actor_hp(battle_state, target_ally_id, maxi(1, int(target_actor.get("maxHp", 120)) - 60))
	var before := int(BattleModel.actor_by_id(battle_state, target_ally_id).get("hp", 0))
	_on_battle_command_pressed("spirit")
	var command_id := _battle_command_id_for_spirit_id(BattleModel.SPIRIT_MOIST_1)
	if command_id != "":
		_on_battle_command_pressed(command_id)
	var mode_ok := battle_target_mode == "ally_spirit_single"
	if command_id != "" and mode_ok:
		_submit_spirit_player_command(BattleModel.SPIRIT_MOIST_1, target_ally_id)
	var selected := command_id != "" and mode_ok
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_heal", 1200)
	var after := int(BattleModel.actor_by_id(battle_state, target_ally_id).get("hp", 0))
	return command_id != "" and mode_ok and selected and pet_panel_open and saw_event and battle_last_event_target_id == target_ally_id and after > before


func _auto_check_poison_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	var target_id := "enemy_back_2"
	var before := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	_on_battle_command_pressed("spirit")
	var command_id := _battle_command_id_for_spirit_id(BattleModel.SPIRIT_POISON_1)
	if command_id != "":
		_on_battle_command_pressed(command_id)
	var mode_ok := battle_target_mode == "enemy_spirit_single"
	var actor := BattleModel.actor_by_id(battle_state, target_id)
	var selected := _select_battle_target_at_screen_point(_world_to_screen(_battle_slot_world_position(str(actor.get("slotId", "")))))
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_poison", 1200)
	var after := int(BattleModel.actor_by_id(battle_state, target_id).get("hp", 0))
	return command_id != "" and mode_ok and selected and pet_panel_open and saw_event and battle_last_event_target_id == target_id and after < before


func _auto_check_poison_all_spirit(zone: Dictionary) -> bool:
	_start_battle(BattleModel.create_stat_formula_test_battle(zone))
	await get_tree().process_frame
	var before_count := BattleModel.living_actor_count(battle_state, BattleModel.SIDE_ENEMY)
	_on_battle_command_pressed("spirit")
	var command_id := _battle_command_id_for_spirit_id(BattleModel.SPIRIT_POISON_MIST_1)
	if command_id != "":
		_on_battle_command_pressed(command_id)
	var pet_panel_open := battle_command_owner == "pet"
	_auto_submit_pet_defend_if_needed()
	var saw_event: bool = await _auto_wait_for_event_type("spirit_poison_all", 1200)
	var damaged_count := 0
	for target_id in battle_last_event_target_ids:
		if int((battle_state.get("lastEffectPerTarget", {}) as Dictionary).get(target_id, 0)) > 0:
			damaged_count += 1
	return command_id != "" and pet_panel_open and saw_event and battle_last_event_target_ids.size() == before_count and damaged_count == before_count


func _battle_command_id_for_spirit_id(spirit_id: String) -> String:
	for command_id in battle_spirit_button_spirit_ids.keys():
		if str(battle_spirit_button_spirit_ids.get(command_id, "")) == spirit_id:
			return str(command_id)
	return ""


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


func _open_battle_label_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	var zone := (zones[0] as Dictionary).duplicate(true)
	zone["selectedWildPet"] = {
		"formId": "wuli_normal_fast_wind10",
		"name": "高速乌力",
		"level": 3,
		"levelMin": 1,
		"levelMax": 3,
		"battleStats": {
			"maxHp": 92,
			"attack": 11,
			"defense": 6,
			"agility": 88,
		},
	}
	_start_battle(BattleModel.create_wild_battle(zone))


func _open_battle_formation_preview() -> void:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(BattleModel.create_formation_preview_battle(zones[0] as Dictionary))


func _open_battle_auto_10v10_preview() -> void:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(_create_auto_10v10_observation_battle(zones[0] as Dictionary))
	_set_battle_auto_attack_enabled(true, false)


func _create_auto_10v10_observation_battle(zone: Dictionary) -> Dictionary:
	var state := BattleModel.create_formation_preview_battle(zone)
	state["id"] = "local_auto_10v10_observation_battle"
	state["targetSeed"] = "local_auto_10v10_observation_battle"
	state["message"] = "10v10练级观察。"
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		if str(actor.get("side", "")) == BattleModel.SIDE_ENEMY:
			var max_hp := 520
			actor["maxHp"] = max_hp
			actor["hp"] = max_hp
			actor["attack"] = maxi(6, int(actor.get("attack", 5)))
			actor["defense"] = maxi(8, int(actor.get("defense", 6)))
			actors[index] = actor
	state["actors"] = actors
	return state


func _open_battle_stat_test() -> void:
	_start_stat_formula_test_battle()


func _open_battle_status_test() -> void:
	var started := _start_stat_formula_test_battle()
	if not started:
		return
	battle_state = BattleModel.set_actor_status(battle_state, "enemy_front_3", BattleModel.STATUS_POISON, 3, 7, BattleModel.PLAYER_ACTOR_ID)
	battle_state = BattleModel.set_actor_status(battle_state, "enemy_back_1", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	battle_state = BattleModel.set_actor_status(battle_state, "enemy_back_2", BattleModel.STATUS_STONE, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	battle_state = BattleModel.set_actor_status(battle_state, "ally_speed_fast", BattleModel.STATUS_CONFUSION, 2, 0, "enemy_back_1")
	_set_battle_message("异常状态测试战斗。")
	_update_battle_debug_window(true)
	queue_redraw()


func _open_battle_status_skill_test() -> void:
	var started := _start_stat_formula_test_battle()
	if not started:
		return
	_set_battle_message("状态技能测试战斗。")
	queue_redraw()


func _open_battle_status_hit_test() -> void:
	var started := _start_stat_formula_test_battle()
	if not started:
		return
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_back_2", BattleModel.STATUS_SLEEP, 0.0)
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_back_4", BattleModel.STATUS_SLEEP, 1.0)
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_front_1", BattleModel.STATUS_CONFUSION, 0.0)
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_front_4", BattleModel.STATUS_CONFUSION, 1.0)
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_back_2", BattleModel.STATUS_STONE, 0.0)
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_front_5", BattleModel.STATUS_STONE, 1.0)
	battle_state = BattleModel.set_actor_status_resist(battle_state, "enemy_back_5", BattleModel.STATUS_POISON, 1.0)
	_set_battle_message("状态命中测试战斗。")
	queue_redraw()


func _open_battle_status_rule_test() -> void:
	var started := _start_stat_formula_test_battle()
	if not started:
		return
	battle_state = BattleModel.set_actor_status(battle_state, "ally_speed_normal", BattleModel.STATUS_POISON, 3, 6, "enemy_back_1")
	battle_state = BattleModel.set_actor_status(battle_state, "ally_speed_normal", BattleModel.STATUS_SLEEP, 2, 0, "enemy_back_1")
	battle_state = BattleModel.set_actor_status(battle_state, "enemy_back_1", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_PET_ID)
	_set_battle_message("状态规则测试战斗。")
	queue_redraw()


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
		"duration": _battle_launch_duration_for_mode(mode),
		"forceDodge": false,
		"forceCritical": false,
	}
	var actor_snapshots := _battle_actor_snapshots_by_id()
	battle_state = BattleModel.apply_battle_event(battle_state, event)
	if not bool(battle_state.get("lastEventApplied", false)):
		return
	var event_timeline := _battle_event_timeline_for_applied_event(event)
	var ledger := BattleEventLedger.build_from_applied_state(battle_state, event, actor_snapshots, event_timeline)
	battle_state["lastEventLedger"] = ledger
	battle_last_round_applied_events = 1
	_record_battle_event(event, ledger)
	battle_current_event = BattleEventLedger.playback_event(event, ledger)
	battle_current_event_actor_snapshots = actor_snapshots
	_add_battle_event_feedback(battle_current_event, ledger)
	_set_battle_message(str(battle_state.get("message", "")))
	battle_action_timer = _battle_event_duration(battle_current_event)
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
			actor["comboRateOverride"] = 1.0
			actors[index] = actor
		elif actor_id == BattleModel.PLAYER_PET_ID:
			actor["quick"] = 179
			actor["comboRateOverride"] = 1.0
			actors[index] = actor
	battle_state["actors"] = actors


func _start_stat_formula_test_battle() -> bool:
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return false
	var previous_profile := player_profile.duplicate(true)
	player_profile = PlayerProgressModel.default_profile()
	_start_battle(BattleModel.create_stat_formula_test_battle(zones[0] as Dictionary))
	player_profile = previous_profile
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
	battle_spirit_button_spirit_ids.clear()
	if battle_command_title_label == null:
		return
	if owner == "pet":
		battle_command_title_label.text = "宠物"
		_apply_battle_button_labels({
			"attack": _pet_skill_button_label(1),
			"spirit": _pet_skill_button_label(2),
			"capture": _pet_skill_button_label(3),
			"help": "返回",
			"defend": _pet_skill_button_label(4),
			"item": _pet_skill_button_label(5),
			"switch_pet": _pet_skill_button_label(6),
			"run": _pet_skill_button_label(7),
		})
	elif owner == "spirit":
		battle_command_title_label.text = "精灵"
		_apply_spirit_button_labels()
	elif owner == "item":
		battle_command_title_label.text = "物品"
		_apply_battle_button_labels({
			"attack": _battle_item_label(BattleModel.ITEM_HEAL_ALL, "群体草药5"),
			"spirit": _battle_item_label(BattleModel.ITEM_HEAL_SINGLE, "回复药5"),
			"capture": _battle_item_label(BattleModel.ITEM_POISON_SINGLE, "毒粉5"),
			"help": "返回",
			"defend": _battle_item_label(BattleModel.ITEM_POISON_ALL, "毒雾粉5"),
			"item": _battle_item_label(BattleModel.ITEM_CLEANSE_SINGLE, "净化草5"),
			"switch_pet": _battle_item_label(BattleModel.ITEM_MEAT_SMALL, "肉"),
			"run": "",
		})
	elif owner == "capture":
		battle_command_title_label.text = "捕捉"
		_apply_battle_button_labels({
			"attack": _capture_tool_button_label(BattleModel.CAPTURE_TOOL_EMPTY_HAND),
			"spirit": _capture_tool_button_label(BattleModel.CAPTURE_TOOL_ROPE_BASIC),
			"capture": _capture_tool_button_label(BattleModel.CAPTURE_TOOL_NET),
			"help": "返回",
			"defend": _capture_tool_button_label(BattleModel.CAPTURE_TOOL_NET_REINFORCED),
			"item": "",
			"switch_pet": "",
			"run": "",
		})
	elif owner == "switch_pet":
		battle_command_title_label.text = "换宠"
		_apply_switch_pet_button_labels()
	else:
		battle_command_title_label.text = "人物"
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
	_sync_battle_command_layout()
	_sync_battle_buttons()
	_layout_hud()


func _on_battle_auto_button_pressed() -> void:
	if battle_auto_button == null:
		return
	_set_battle_auto_attack_enabled(battle_auto_button.button_pressed)


func _on_battle_auto_stop_button_pressed() -> void:
	_set_battle_auto_attack_enabled(false)


func _set_battle_auto_attack_enabled(enabled: bool, show_message: bool = true) -> void:
	battle_auto_attack_enabled = enabled
	battle_auto_attack_delay = 0.0
	if show_message and battle_active:
		_set_battle_message("自动攻击开启。" if battle_auto_attack_enabled else "自动攻击关闭。")
	_sync_battle_auto_button()
	_sync_battle_buttons()


func _sync_battle_auto_button() -> void:
	if battle_auto_button != null:
		battle_auto_button.visible = battle_active
		battle_auto_button.disabled = not battle_active
		battle_auto_button.text = "停止" if battle_auto_attack_enabled else "自动"
		battle_auto_button.button_pressed = battle_auto_attack_enabled
	if battle_auto_stop_button != null:
		var command_panel_visible := battle_command_panel != null and battle_command_panel.visible
		battle_auto_stop_button.visible = battle_active and battle_auto_attack_enabled and not command_panel_visible
		battle_auto_stop_button.disabled = not battle_active


func _update_battle_auto_attack(delta: float) -> void:
	if not battle_auto_attack_enabled or not battle_active:
		return
	if _battle_commands_locked():
		return
	if battle_auto_attack_delay > 0.0:
		battle_auto_attack_delay = maxf(0.0, battle_auto_attack_delay - delta)
		return
	if battle_command_owner == "player":
		_submit_battle_auto_player_action()
	elif battle_command_owner == "pet":
		_submit_battle_auto_pet_action()


func _submit_battle_auto_player_action() -> bool:
	if not battle_active or battle_command_owner != "player" or _battle_commands_locked():
		return false
	var settings := _battle_auto_settings()
	var capture_settings := PlayerProgressModel.auto_capture_settings(player_profile)
	var capture_hold_target_id := _battle_auto_capture_hold_target_id(capture_settings)
	if _battle_auto_try_submit_heal(settings):
		_battle_mark_pending_capture_hold(capture_hold_target_id)
		battle_auto_attack_player_submissions += 1
		battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
		return true
	if _battle_auto_try_submit_capture():
		battle_auto_attack_player_submissions += 1
		battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
		return true
	if _battle_auto_capture_no_target_action() == AutoCaptureSettingsModel.NO_TARGET_ESCAPE:
		_battle_auto_capture_escape_without_target()
		battle_auto_attack_player_submissions += 1
		battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
		return true
	var action_key := AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY if _battle_auto_is_first_round() else AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY
	var action_id := str(settings.get(action_key, AutoBattleSettingsModel.ACTION_ATTACK))
	if not _battle_auto_submit_player_action_id(action_id, settings):
		if not _battle_auto_submit_player_action_id(AutoBattleSettingsModel.ACTION_ATTACK, settings):
			return false
	battle_auto_attack_player_submissions += 1
	battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
	return true


func _submit_battle_auto_pet_action() -> bool:
	if not battle_active or battle_command_owner != "pet" or _battle_commands_locked():
		return false
	if _battle_auto_capture_enabled() and (str(battle_pending_player_command.get("command", "")) == "capture" or bool(battle_pending_player_command.get("captureHold", false))):
		var capture_settings := PlayerProgressModel.auto_capture_settings(player_profile)
		if not _battle_auto_submit_capture_pet_action(capture_settings):
			return false
		battle_auto_attack_pet_submissions += 1
		battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
		return true
	var settings := _battle_auto_settings()
	var slot_key := AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY if _battle_auto_is_first_round() else AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY
	var slot := AutoBattleSettingsModel.normalized_pet_skill_slot(settings.get(slot_key, 1))
	var skill_action := _controlled_pet_skill_action_for_slot(slot)
	if skill_action.is_empty():
		skill_action = _controlled_pet_skill_action_for_slot(1)
	var skill_id := str(skill_action.get("id", ""))
	if skill_id == "":
		skill_id = BattleModel.PET_SKILL_ATTACK
	var command_id := str(skill_action.get("command", "attack"))
	match command_id:
		"defend":
			_submit_pet_battle_command("defend", "", skill_id)
		"pet_skill":
			var skill_target_id := _battle_auto_enemy_target_id(settings)
			if skill_target_id == "":
				return false
			_submit_pet_battle_command("pet_skill", skill_target_id, skill_id)
		_:
			var target_id := _battle_auto_enemy_target_id(settings)
			if target_id == "":
				return false
			_submit_pet_battle_command("attack", target_id, skill_id)
	battle_auto_attack_pet_submissions += 1
	battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
	return true


func _battle_auto_settings() -> Dictionary:
	return PlayerProgressModel.auto_battle_settings(player_profile)


func _battle_player_has_spirit_id(spirit_id: String) -> bool:
	var player_id := BattleModel.player_actor_id(battle_state)
	return BattleModel.actor_has_spirit(battle_state, player_id, spirit_id) if player_id != "" else false


func _battle_auto_submit_spirit_action(spirit_id: String, target_id: String = "") -> bool:
	if not _battle_player_has_spirit_id(spirit_id):
		return false
	if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY) and not BattleActionCatalog.action_is_all(spirit_id) and target_id == "":
		return false
	if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ENEMY) and not BattleActionCatalog.action_is_all(spirit_id) and target_id == "":
		return false
	_submit_spirit_player_command(spirit_id, target_id)
	return true


func _battle_auto_is_first_round() -> bool:
	return int(battle_state.get("round", 1)) <= 1


func _battle_auto_submit_player_action_id(action_id: String, settings: Dictionary) -> bool:
	var normalized_action_id := AutoBattleSettingsModel.normalized_player_action_id(action_id)
	if str(BattleActionCatalog.action_by_id(normalized_action_id).get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT:
		if not _battle_player_has_spirit_id(normalized_action_id):
			return false
		var spirit_target_id := ""
		if not BattleActionCatalog.action_is_all(normalized_action_id):
			if BattleActionCatalog.action_can_target_side(normalized_action_id, BattleModel.SIDE_ALLY):
				spirit_target_id = _battle_auto_best_ally_target_id()
			elif BattleActionCatalog.action_can_target_side(normalized_action_id, BattleModel.SIDE_ENEMY):
				spirit_target_id = _battle_auto_enemy_target_id(settings)
			if spirit_target_id == "":
				return false
		return _battle_auto_submit_spirit_action(normalized_action_id, spirit_target_id)
	match normalized_action_id:
		AutoBattleSettingsModel.ACTION_DEFEND:
			_submit_player_battle_command("defend")
			return true
		AutoBattleSettingsModel.ACTION_ITEM_MEAT:
			return _battle_auto_submit_item_action(BattleModel.ITEM_MEAT_SMALL, _battle_auto_best_ally_target_id())
		AutoBattleSettingsModel.ACTION_ITEM_HEAL_SINGLE:
			return _battle_auto_submit_item_action(BattleModel.ITEM_HEAL_SINGLE, _battle_auto_best_ally_target_id())
		AutoBattleSettingsModel.ACTION_ITEM_HEAL_ALL:
			return _battle_auto_submit_item_action(BattleModel.ITEM_HEAL_ALL)
		AutoBattleSettingsModel.ACTION_ITEM_POISON:
			return _battle_auto_submit_item_action(BattleModel.ITEM_POISON_SINGLE, _battle_auto_enemy_target_id(settings))
		AutoBattleSettingsModel.ACTION_ITEM_POISON_ALL:
			return _battle_auto_submit_item_action(BattleModel.ITEM_POISON_ALL)
		AutoBattleSettingsModel.ACTION_ITEM_CLEANSE:
			return _battle_auto_submit_item_action(BattleModel.ITEM_CLEANSE_SINGLE, _battle_auto_best_ally_target_id())
		_:
			var target_id := _battle_auto_enemy_target_id(settings)
			if target_id == "":
				return false
			_submit_player_battle_command("attack", target_id)
			return true


func _battle_auto_try_submit_heal(settings: Dictionary) -> bool:
	if not bool(settings.get(AutoBattleSettingsModel.HEALING_ENABLED_KEY, true)):
		return false
	var target_id := _battle_auto_heal_target_id(settings)
	if target_id == "":
		return false
	for source_id in AutoBattleSettingsModel.normalized_heal_priority(settings.get(AutoBattleSettingsModel.HEAL_PRIORITY_KEY, [])):
		var source_id_text := str(source_id)
		if (
			str(BattleActionCatalog.action_by_id(source_id_text).get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT
			and BattleActionCatalog.effect_type_for(source_id_text) == "heal"
		):
			var spirit_target_id := "" if BattleActionCatalog.action_is_all(source_id_text) else target_id
			if _battle_auto_submit_spirit_action(source_id_text, spirit_target_id):
				return true
			continue
		match source_id_text:
			AutoBattleSettingsModel.HEAL_ITEM_MEAT:
				if _battle_auto_submit_item_action(BattleModel.ITEM_MEAT_SMALL, target_id):
					return true
			AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE:
				if _battle_auto_submit_item_action(BattleModel.ITEM_HEAL_SINGLE, target_id):
					return true
			AutoBattleSettingsModel.HEAL_ITEM_HEAL_ALL:
				if _battle_auto_submit_item_action(BattleModel.ITEM_HEAL_ALL):
					return true
	return false


func _battle_auto_try_submit_capture() -> bool:
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	if not bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false)):
		return false
	var target_id := _battle_auto_capture_target_id(settings)
	if target_id == "":
		return false
	var target := BattleModel.actor_by_id(battle_state, target_id)
	if not _battle_auto_has_capture_space():
		_set_battle_message("兽栏和宠物栏满，请清理")
		return false
	var inventory := BattleModel.capture_tool_inventory(battle_state)
	var preferred_tool_id := str(settings.get(AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY, CaptureToolCatalog.EMPTY_HAND_ID))
	var tool_id := CaptureToolCatalog.best_available_fallback_tool(preferred_tool_id, inventory)
	if not BattleModel.has_capture_tool(battle_state, tool_id):
		_set_battle_message("%s 不够了。" % CaptureToolCatalog.full_name_for(tool_id))
		return false
	battle_pending_capture_tool_id = tool_id
	battle_selected_target_id = target_id
	var chance := BattleModel.capture_chance(battle_state, BattleModel.player_actor_id(battle_state), target_id, tool_id)
	_set_battle_message("自动捕捉：%s 捕捉%s，机会：%s。" % [
		CaptureToolCatalog.full_name_for(tool_id),
		str(target.get("name", "敌人")),
		CaptureToolCatalog.chance_tier(chance),
	])
	_submit_player_battle_command("capture", target_id)
	if _battle_auto_capture_enabled() and battle_command_owner == "pet":
		_battle_auto_submit_capture_pet_action(settings)
	return true


func _battle_auto_capture_hold_target_id(settings: Dictionary) -> String:
	if not bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false)):
		return ""
	if not _battle_auto_has_capture_space():
		return ""
	return _battle_auto_capture_target_id(settings)


func _battle_mark_pending_capture_hold(target_id: String) -> void:
	if target_id == "" or battle_pending_player_command.is_empty():
		return
	battle_pending_player_command["captureHold"] = true
	battle_pending_player_command["captureHoldTargetId"] = target_id
	if str(battle_pending_player_command.get("targetId", "")) == "":
		battle_pending_player_command["targetId"] = target_id


func _battle_auto_submit_capture_pet_action(settings: Dictionary) -> bool:
	var slot := AutoCaptureSettingsModel.normalized_pet_skill_slot(settings.get(AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY, AutoCaptureSettingsModel.DEFAULT_CAPTURE_PET_SLOT))
	var skill_action := _controlled_pet_skill_action_for_slot(slot)
	if skill_action.is_empty():
		skill_action = _controlled_pet_skill_action_for_slot(AutoCaptureSettingsModel.DEFAULT_CAPTURE_PET_SLOT)
	if skill_action.is_empty():
		_submit_pet_battle_command("defend", "", BattleModel.PET_SKILL_DEFEND)
		return true
	var skill_id := str(skill_action.get("id", ""))
	if skill_id == "":
		skill_id = BattleModel.PET_SKILL_DEFEND
	match str(skill_action.get("command", "defend")):
		"defend":
			_submit_pet_battle_command("defend", "", skill_id)
			return true
		"pet_skill":
			var skill_target_id := _battle_auto_enemy_target_id(_battle_auto_settings())
			if skill_target_id == "":
				return false
			_submit_pet_battle_command("pet_skill", skill_target_id, skill_id)
			return true
		_:
			var target_id := _battle_auto_enemy_target_id(_battle_auto_settings())
			if target_id == "":
				return false
			_submit_pet_battle_command("attack", target_id, skill_id)
			return true


func _battle_auto_capture_enabled() -> bool:
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	return bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false))


func _battle_auto_capture_no_target_action() -> String:
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	if not bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false)):
		return AutoCaptureSettingsModel.NO_TARGET_BATTLE
	return AutoCaptureSettingsModel.normalized_no_target_action(str(settings.get(AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY, AutoCaptureSettingsModel.NO_TARGET_ESCAPE)))


func _battle_auto_capture_escape_without_target() -> void:
	var message := "捕获成功。没有符合条件的捕捉目标，自动逃跑。" if battle_auto_capture_success_seen else "自动捉宠：没有符合条件目标，自动逃跑。"
	_set_battle_message(message)
	_battle_escape()
	if world_log_message != "":
		_set_world_log_message("%s\n%s" % [message, world_log_message])
	else:
		_set_world_log_message(message)


func _battle_auto_capture_target_id(settings: Dictionary) -> String:
	for actor_id in BattleModel.living_actor_ids(battle_state, BattleModel.SIDE_ENEMY):
		var actor := BattleModel.actor_by_id(battle_state, actor_id)
		if _battle_auto_capture_actor_matches(actor, settings):
			return actor_id
	return ""


func _battle_auto_capture_actor_matches(actor: Dictionary, settings: Dictionary) -> bool:
	if actor.is_empty():
		return false
	if not bool(actor.get("catchable", false)) or bool(actor.get("captured", false)):
		return false
	var hp := clampi(int(actor.get("hp", 0)), 0, maxi(1, int(actor.get("maxHp", 1))))
	if hp <= 0:
		return false
	var max_hp := maxi(1, int(actor.get("maxHp", 1)))
	var hp_percent := int(ceil(float(hp) / float(max_hp) * 100.0))
	var threshold_percent := clampi(int(settings.get(AutoCaptureSettingsModel.HP_PERCENT_KEY, AutoCaptureSettingsModel.MAX_HP_PERCENT)), AutoCaptureSettingsModel.MIN_HP_PERCENT, AutoCaptureSettingsModel.MAX_HP_PERCENT)
	if hp_percent > threshold_percent:
		return false
	var level := maxi(1, int(actor.get("level", 1)))
	if not AutoCaptureSettingsModel.level_matches(
		level,
		str(settings.get(AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY, AutoCaptureSettingsModel.COMPARATOR_EQ)),
		int(settings.get(AutoCaptureSettingsModel.LEVEL_VALUE_KEY, AutoCaptureSettingsModel.MIN_LEVEL))
	):
		return false
	if str(settings.get(AutoCaptureSettingsModel.TARGET_MODE_KEY, AutoCaptureSettingsModel.TARGET_ALL)) == AutoCaptureSettingsModel.TARGET_ALL:
		return true
	var target_form_id := str(settings.get(AutoCaptureSettingsModel.TARGET_FORM_ID_KEY, ""))
	var manual_text := AutoCaptureSettingsModel.clean_manual_text(str(settings.get(AutoCaptureSettingsModel.TARGET_MANUAL_TEXT_KEY, "")))
	if target_form_id == "" and manual_text == "":
		return false
	if target_form_id != "" and str(actor.get("formId", actor.get("templateId", ""))) == target_form_id:
		return true
	if manual_text == "":
		return false
	var needle := manual_text.to_lower()
	for key in ["name", "formName", "formId", "templateId", "lineName", "subtypeName"]:
		if str(actor.get(key, "")).to_lower().find(needle) >= 0:
			return true
	return false


func _battle_auto_has_capture_space() -> bool:
	return (
		PlayerProgressModel.party_pet_instances(player_profile).size() < PlayerProgressModel.PARTY_LIMIT
		or PlayerProgressModel.storage_pet_instances(player_profile).size() < PlayerProgressModel.STORAGE_LIMIT
	)


func _battle_auto_submit_item_action(item_id: String, target_id: String = "") -> bool:
	if not BattleModel.has_item(battle_state, item_id):
		return false
	var requires_selection := BattleActionCatalog.action_requires_selection(item_id)
	if requires_selection and target_id == "":
		return false
	_submit_item_player_command(item_id, target_id)
	return true


func _battle_auto_heal_target_id(settings: Dictionary) -> String:
	var candidates: Array[Dictionary] = []
	_append_battle_auto_heal_candidate(candidates, BattleModel.player_actor_id(battle_state), int(settings.get(AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY, 45)))
	_append_battle_auto_heal_candidate(candidates, BattleModel.controlled_pet_id(battle_state), int(settings.get(AutoBattleSettingsModel.PET_HP_PERCENT_KEY, 45)))
	if candidates.is_empty():
		return ""
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_percent := float(a.get("hpPercent", 1.0))
		var b_percent := float(b.get("hpPercent", 1.0))
		if not is_equal_approx(a_percent, b_percent):
			return a_percent < b_percent
		return int(a.get("missingHp", 0)) > int(b.get("missingHp", 0))
	)
	return str(candidates[0].get("actorId", ""))


func _append_battle_auto_heal_candidate(candidates: Array[Dictionary], actor_id: String, threshold_percent: int) -> void:
	if actor_id == "":
		return
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	if actor.is_empty():
		return
	var max_hp := maxi(1, int(actor.get("maxHp", 1)))
	var hp := clampi(int(actor.get("hp", max_hp)), 0, max_hp)
	if hp <= 0 or hp >= max_hp:
		return
	var hp_percent := float(hp) / float(max_hp)
	if hp_percent > float(clampi(threshold_percent, 1, 100)) / 100.0:
		return
	candidates.append({
		"actorId": actor_id,
		"hpPercent": hp_percent,
		"missingHp": max_hp - hp,
	})


func _battle_auto_best_ally_target_id() -> String:
	var target_id := BattleModel.best_ally_heal_target_id(battle_state)
	if target_id != "":
		return target_id
	return BattleModel.player_actor_id(battle_state)


func _battle_auto_enemy_target_id(settings: Dictionary) -> String:
	var target_mode := str(settings.get(AutoBattleSettingsModel.TARGET_MODE_KEY, AutoBattleSettingsModel.TARGET_FIRST_LIVING))
	match AutoBattleSettingsModel.normalized_target_mode(target_mode):
		AutoBattleSettingsModel.TARGET_LOWEST_HP:
			return _battle_auto_lowest_enemy_target_id(false)
		AutoBattleSettingsModel.TARGET_LOWEST_HP_PERCENT:
			return _battle_auto_lowest_enemy_target_id(true)
		_:
			return BattleModel.living_enemy_id(battle_state)


func _battle_auto_lowest_enemy_target_id(by_percent: bool) -> String:
	var best_id := ""
	var best_score := INF
	for actor_id in BattleModel.living_actor_ids(battle_state, BattleModel.SIDE_ENEMY):
		var actor := BattleModel.actor_by_id(battle_state, actor_id)
		if actor.is_empty():
			continue
		var hp := maxi(0, int(actor.get("hp", 0)))
		var max_hp := maxi(1, int(actor.get("maxHp", 1)))
		var score := float(hp) / float(max_hp) if by_percent else float(hp)
		if score < best_score:
			best_score = score
			best_id = actor_id
	return best_id


func _controlled_pet_actor() -> Dictionary:
	if battle_state.is_empty():
		return {}
	var pet_id := BattleModel.controlled_pet_id(battle_state)
	if pet_id == "":
		return {}
	return BattleModel.actor_by_id(battle_state, pet_id)


func _controlled_pet_skill_action_for_slot(slot: int) -> Dictionary:
	return PetTemplateCatalog.pet_skill_action_for_actor_slot(_controlled_pet_actor(), slot)


func _pet_skill_button_label(slot: int) -> String:
	var action := _controlled_pet_skill_action_for_slot(slot)
	var label := str(action.get("label", ""))
	return "技%d %s" % [slot, label] if label != "" else "技%d" % slot


func _pet_skill_slot_for_command(command_id: String) -> int:
	match command_id:
		"attack":
			return 1
		"spirit":
			return 2
		"capture":
			return 3
		"defend":
			return 4
		"item":
			return 5
		"switch_pet":
			return 6
		"run":
			return 7
		_:
			return 0


func _player_spirit_ids_for_battle() -> Array[String]:
	var player_id := BattleModel.player_actor_id(battle_state)
	return BattleModel.actor_spirit_ids(battle_state, player_id) if player_id != "" else []


func _apply_spirit_button_labels() -> void:
	var command_slots: Array[String] = ["attack", "spirit", "capture", "defend"]
	var labels := {
		"attack": "",
		"spirit": "",
		"capture": "",
		"help": "返回",
		"defend": "",
		"item": "",
		"switch_pet": "",
		"run": "",
	}
	var spirit_ids := _player_spirit_ids_for_battle()
	for index in range(mini(command_slots.size(), spirit_ids.size())):
		var command_id := str(command_slots[index])
		var spirit_id := str(spirit_ids[index])
		battle_spirit_button_spirit_ids[command_id] = spirit_id
		labels[command_id] = BattleActionCatalog.label_for(spirit_id, spirit_id)
	if spirit_ids.is_empty():
		labels["attack"] = "无精灵"
	_apply_battle_button_labels(labels)


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


func _capture_tool_button_label(tool_id: String) -> String:
	var label := CaptureToolCatalog.menu_label_for(tool_id)
	if not CaptureToolCatalog.is_consumable(tool_id):
		return label
	return "%s x%d" % [label, BattleModel.capture_tool_count(battle_state, tool_id)]


func _button_text_for_battle_command(command_id: String) -> String:
	var button = battle_command_buttons.get(command_id, null)
	if button is Button:
		return (button as Button).text
	return ""


func _battle_visible_button_texts() -> Array[String]:
	var result: Array[String] = []
	for command_id in _battle_command_visible_ids():
		var text := _button_text_for_battle_command(command_id)
		if text != "":
			result.append(text)
	return result


func _texts_contain(texts: Array[String], needle: String) -> bool:
	for text in texts:
		if text.find(needle) >= 0:
			return true
	return false


func _apply_battle_button_labels(labels: Dictionary) -> void:
	for command_id in labels.keys():
		if not battle_command_buttons.has(command_id):
			continue
		var button := battle_command_buttons[command_id] as Button
		if button != null:
			button.text = str(labels[command_id])
	_sync_battle_command_layout()


func _sync_battle_command_layout() -> void:
	if battle_command_button_grid == null:
		return
	var list_mode := battle_command_owner != "player"
	battle_command_button_grid.columns = 1 if list_mode else 4
	var visible_ids := _battle_command_visible_ids()
	var ordered_ids := _battle_command_order_for_owner()
	var button_size := _battle_command_button_size()
	var child_index := 0
	for command_id in ordered_ids:
		if not battle_command_buttons.has(command_id):
			continue
		var ordered_button := battle_command_buttons[command_id] as Button
		if ordered_button != null:
			battle_command_button_grid.move_child(ordered_button, child_index)
			child_index += 1
	for command_id in BATTLE_COMMAND_BUTTON_ORDER:
		if not battle_command_buttons.has(command_id):
			continue
		var button := battle_command_buttons[command_id] as Button
		if button == null:
			continue
		button.visible = visible_ids.has(command_id)
		button.custom_minimum_size = button_size
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if battle_command_panel != null:
		battle_command_panel.custom_minimum_size = _battle_command_panel_size(_layout_size())


func _battle_command_order_for_owner() -> Array[String]:
	match battle_command_owner:
		"pet":
			return ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run", "help"]
		"spirit":
			return ["attack", "spirit", "capture", "defend", "help", "item", "switch_pet", "run"]
		"item":
			return ["attack", "spirit", "capture", "defend", "item", "switch_pet", "help", "run"]
		"capture":
			return ["attack", "spirit", "capture", "defend", "help", "item", "switch_pet", "run"]
		"switch_pet":
			return ["attack", "spirit", "capture", "help", "defend", "item", "switch_pet", "run"]
		_:
			return ["attack", "spirit", "capture", "help", "defend", "item", "switch_pet", "run"]


func _battle_command_visible_ids() -> Array[String]:
	match battle_command_owner:
		"pet":
			return ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run", "help"]
		"spirit":
			var visible: Array[String] = []
			for command_id in ["attack", "spirit", "capture", "defend"]:
				if battle_spirit_button_spirit_ids.has(command_id):
					visible.append(command_id)
			if visible.is_empty():
				visible.append("attack")
			visible.append("help")
			return visible
		"item":
			return ["attack", "spirit", "capture", "defend", "item", "switch_pet", "help"]
		"capture":
			return ["attack", "spirit", "capture", "defend", "help"]
		"switch_pet":
			return ["attack", "spirit", "capture", "help", "defend", "item", "switch_pet", "run"]
		_:
			return ["attack", "spirit", "capture", "help", "defend", "item", "switch_pet", "run"]


func _battle_command_button_size() -> Vector2:
	return Vector2(70.0, 42.0) if battle_command_owner == "player" else Vector2(0.0, 40.0)


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
	for control in [battle_command_panel, battle_auto_stop_button, battle_passive_panel, battle_message_panel, top_panel]:
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
		_update_battle_auto_attack(delta)
		_update_hud_text()
		_update_battle_debug_window()
		queue_redraw()
		return
	_update_pet_follow()
	_update_camera_position(false)
	_update_pending_interaction()
	_update_encounter_grace(delta)
	_update_hang_walk(delta)
	_update_stationary_encounter_stone(delta)
	_update_encounter_zone_check()
	_update_pet_rest_recovery(delta)
	_update_ground_pet_drop_expiration(delta)
	if has_target_marker and not player.is_auto_moving() and player.global_position.distance_to(target_marker) <= 6.0:
		has_target_marker = false
		has_target_cell = false
		current_path_is_direct = false
		current_path_cells.clear()
	_sync_hang_button_text()
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
	var action_scroll := ScrollContainer.new()
	action_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	action_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	action_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	action_bar.add_child(action_scroll)
	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 6)
	action_scroll.add_child(action_row)
	stop_button = Button.new()
	stop_button.text = "挂机"
	stop_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	stop_button.pressed.connect(_on_hang_button_pressed)
	action_row.add_child(stop_button)
	ring_button = Button.new()
	ring_button.text = "驯宠戒"
	ring_button.custom_minimum_size = Vector2(76, MIN_TOUCH_BUTTON_SIZE.y)
	ring_button.pressed.connect(_toggle_pet_ring)
	action_row.add_child(ring_button)
	player_status_menu_button = Button.new()
	player_status_menu_button.text = "状态"
	player_status_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	player_status_menu_button.pressed.connect(_open_player_status_panel)
	action_row.add_child(player_status_menu_button)
	bag_menu_button = Button.new()
	bag_menu_button.text = "背包"
	bag_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	bag_menu_button.pressed.connect(_open_backpack_panel)
	action_row.add_child(bag_menu_button)
	equipment_menu_button = Button.new()
	equipment_menu_button.text = "装备"
	equipment_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	equipment_menu_button.pressed.connect(_open_equipment_panel)
	action_row.add_child(equipment_menu_button)
	pet_menu_button = Button.new()
	pet_menu_button.text = "宠物"
	pet_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	pet_menu_button.pressed.connect(_open_pet_panel)
	action_row.add_child(pet_menu_button)
	codex_menu_button = Button.new()
	codex_menu_button.text = "图鉴"
	codex_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	codex_menu_button.pressed.connect(_open_codex_panel)
	action_row.add_child(codex_menu_button)
	quest_menu_button = Button.new()
	quest_menu_button.text = "任务"
	quest_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	quest_menu_button.pressed.connect(_open_quest_panel)
	action_row.add_child(quest_menu_button)
	training_partner_menu_button = Button.new()
	training_partner_menu_button.text = "伙伴"
	training_partner_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	training_partner_menu_button.pressed.connect(_open_training_partner_panel)
	action_row.add_child(training_partner_menu_button)
	auto_settings_menu_button = Button.new()
	auto_settings_menu_button.text = "内挂"
	auto_settings_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	auto_settings_menu_button.pressed.connect(_open_auto_settings_panel)
	action_row.add_child(auto_settings_menu_button)
	hud_root.add_child(action_bar)

	player_status_panel = _panel_container("PlayerStatusPanel")
	player_status_panel.visible = false
	player_status_panel.z_index = 24
	var player_status_column := VBoxContainer.new()
	player_status_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	player_status_column.add_theme_constant_override("separation", 8)
	player_status_panel.add_child(player_status_column)

	var player_status_header := HBoxContainer.new()
	player_status_header.add_theme_constant_override("separation", 10)
	player_status_column.add_child(player_status_header)
	var player_status_title := Label.new()
	player_status_title.text = "人物状态"
	player_status_title.add_theme_font_size_override("font_size", 21)
	player_status_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_header.add_child(player_status_title)
	player_status_close_button = Button.new()
	player_status_close_button.text = "关闭"
	player_status_close_button.custom_minimum_size = Vector2(92, 44)
	player_status_close_button.pressed.connect(_close_player_status_panel)
	player_status_header.add_child(player_status_close_button)

	var player_status_scroll := ScrollContainer.new()
	player_status_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	player_status_column.add_child(player_status_scroll)
	player_status_detail_label = RichTextLabel.new()
	player_status_detail_label.bbcode_enabled = true
	player_status_detail_label.fit_content = true
	player_status_detail_label.scroll_active = false
	player_status_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	player_status_detail_label.add_theme_font_size_override("font_size", 16)
	player_status_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_scroll.add_child(player_status_detail_label)

	player_status_points_label = Label.new()
	player_status_points_label.text = "可分配属性点：0"
	player_status_points_label.add_theme_font_size_override("font_size", 15)
	player_status_points_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_column.add_child(player_status_points_label)

	var player_status_point_grid := GridContainer.new()
	player_status_point_grid.columns = 2
	player_status_point_grid.add_theme_constant_override("h_separation", 8)
	player_status_point_grid.add_theme_constant_override("v_separation", 8)
	player_status_point_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_column.add_child(player_status_point_grid)
	player_status_stat_point_buttons.clear()
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		var stat_button := Button.new()
		stat_button.custom_minimum_size = Vector2(0, 40)
		stat_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stat_button.add_theme_font_size_override("font_size", 15)
		var captured_key := stat_key
		stat_button.pressed.connect(func() -> void:
			_on_player_status_allocate_pressed(captured_key)
		)
		player_status_point_grid.add_child(stat_button)
		player_status_stat_point_buttons[stat_key] = stat_button

	player_status_equipment_button = Button.new()
	player_status_equipment_button.text = "装备"
	player_status_equipment_button.custom_minimum_size = Vector2(0, 44)
	player_status_equipment_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_equipment_button.pressed.connect(_on_player_status_equipment_pressed)
	player_status_column.add_child(player_status_equipment_button)
	hud_root.add_child(player_status_panel)

	backpack_panel = _panel_container("BackpackPanel")
	backpack_panel.visible = false
	backpack_panel.z_index = 24
	var backpack_column := VBoxContainer.new()
	backpack_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	backpack_column.add_theme_constant_override("separation", 8)
	backpack_panel.add_child(backpack_column)

	var backpack_header := HBoxContainer.new()
	backpack_header.add_theme_constant_override("separation", 10)
	backpack_column.add_child(backpack_header)
	var backpack_title := Label.new()
	backpack_title.text = "随身包"
	backpack_title.add_theme_font_size_override("font_size", 21)
	backpack_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_header.add_child(backpack_title)
	backpack_close_button = Button.new()
	backpack_close_button.text = "关闭"
	backpack_close_button.custom_minimum_size = Vector2(92, 44)
	backpack_close_button.pressed.connect(_close_backpack_panel)
	backpack_header.add_child(backpack_close_button)

	var backpack_scroll := ScrollContainer.new()
	backpack_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	backpack_column.add_child(backpack_scroll)
	backpack_grid = GridContainer.new()
	backpack_grid.columns = 5
	backpack_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_grid.add_theme_constant_override("h_separation", 7)
	backpack_grid.add_theme_constant_override("v_separation", 7)
	backpack_scroll.add_child(backpack_grid)
	backpack_detail_label = RichTextLabel.new()
	backpack_detail_label.bbcode_enabled = true
	backpack_detail_label.fit_content = false
	backpack_detail_label.scroll_active = true
	backpack_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	backpack_detail_label.add_theme_font_size_override("font_size", 16)
	backpack_detail_label.custom_minimum_size = Vector2(0, 122)
	backpack_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_column.add_child(backpack_detail_label)
	backpack_use_button = Button.new()
	backpack_use_button.text = "使用"
	backpack_use_button.visible = false
	backpack_use_button.custom_minimum_size = Vector2(0, 44)
	backpack_use_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_use_button.pressed.connect(_on_backpack_use_pressed)
	backpack_column.add_child(backpack_use_button)
	backpack_target_scroll = ScrollContainer.new()
	backpack_target_scroll.visible = false
	backpack_target_scroll.custom_minimum_size = Vector2(0, 112)
	backpack_target_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_column.add_child(backpack_target_scroll)
	backpack_target_container = VBoxContainer.new()
	backpack_target_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_target_container.add_theme_constant_override("separation", 6)
	backpack_target_scroll.add_child(backpack_target_container)
	hud_root.add_child(backpack_panel)

	equipment_panel = _panel_container("EquipmentPanel")
	equipment_panel.visible = false
	equipment_panel.z_index = 24
	var equipment_column := VBoxContainer.new()
	equipment_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	equipment_column.add_theme_constant_override("separation", 8)
	equipment_panel.add_child(equipment_column)

	var equipment_header := HBoxContainer.new()
	equipment_header.add_theme_constant_override("separation", 10)
	equipment_column.add_child(equipment_header)
	var equipment_title := Label.new()
	equipment_title.text = "装备"
	equipment_title.add_theme_font_size_override("font_size", 21)
	equipment_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_header.add_child(equipment_title)
	equipment_close_button = Button.new()
	equipment_close_button.text = "关闭"
	equipment_close_button.custom_minimum_size = Vector2(92, 44)
	equipment_close_button.pressed.connect(_close_equipment_panel)
	equipment_header.add_child(equipment_close_button)

	equipment_stats_label = Label.new()
	equipment_stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	equipment_stats_label.add_theme_font_size_override("font_size", 15)
	equipment_stats_label.custom_minimum_size = Vector2(0, 64)
	equipment_stats_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_column.add_child(equipment_stats_label)
	equipment_grid = Control.new()
	equipment_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_grid.custom_minimum_size = Vector2(0, 196)
	equipment_column.add_child(equipment_grid)
	equipment_detail_label = Label.new()
	equipment_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	equipment_detail_label.add_theme_font_size_override("font_size", 16)
	equipment_detail_label.custom_minimum_size = Vector2(0, 88)
	equipment_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_column.add_child(equipment_detail_label)
	equipment_unequip_button = Button.new()
	equipment_unequip_button.text = "卸下"
	equipment_unequip_button.visible = false
	equipment_unequip_button.custom_minimum_size = Vector2(0, 44)
	equipment_unequip_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_unequip_button.pressed.connect(_on_equipment_unequip_pressed)
	equipment_column.add_child(equipment_unequip_button)
	hud_root.add_child(equipment_panel)

	shop_panel = _panel_container("ShopPanel")
	shop_panel.visible = false
	shop_panel.z_index = 24
	var shop_column := VBoxContainer.new()
	shop_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shop_column.add_theme_constant_override("separation", 8)
	shop_panel.add_child(shop_column)

	var shop_header := HBoxContainer.new()
	shop_header.add_theme_constant_override("separation", 10)
	shop_column.add_child(shop_header)
	shop_title_label = Label.new()
	shop_title_label.text = "道具店"
	shop_title_label.add_theme_font_size_override("font_size", 21)
	shop_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_header.add_child(shop_title_label)
	shop_coin_label = Label.new()
	shop_coin_label.text = "石币 0"
	shop_coin_label.add_theme_font_size_override("font_size", 17)
	shop_coin_label.custom_minimum_size = Vector2(112, 0)
	shop_header.add_child(shop_coin_label)
	shop_close_button = Button.new()
	shop_close_button.text = "关闭"
	shop_close_button.custom_minimum_size = Vector2(92, 44)
	shop_close_button.pressed.connect(_close_shop_panel)
	shop_header.add_child(shop_close_button)

	var shop_tabs := HBoxContainer.new()
	shop_tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_tabs.add_theme_constant_override("separation", 8)
	shop_column.add_child(shop_tabs)
	shop_buy_button = Button.new()
	shop_buy_button.text = "购买"
	shop_buy_button.toggle_mode = true
	shop_buy_button.custom_minimum_size = Vector2(0, 42)
	shop_buy_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_buy_button.pressed.connect(func() -> void:
		_set_shop_mode("buy")
	)
	shop_tabs.add_child(shop_buy_button)
	shop_sell_button = Button.new()
	shop_sell_button.text = "出售"
	shop_sell_button.toggle_mode = true
	shop_sell_button.custom_minimum_size = Vector2(0, 42)
	shop_sell_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_sell_button.pressed.connect(func() -> void:
		_set_shop_mode("sell")
	)
	shop_tabs.add_child(shop_sell_button)
	shop_repair_button = Button.new()
	shop_repair_button.text = "修理"
	shop_repair_button.visible = false
	shop_repair_button.custom_minimum_size = Vector2(0, 42)
	shop_repair_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_repair_button.pressed.connect(_on_shop_repair_pressed)
	shop_tabs.add_child(shop_repair_button)

	var shop_scroll := ScrollContainer.new()
	shop_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shop_column.add_child(shop_scroll)
	shop_list_container = VBoxContainer.new()
	shop_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_list_container.add_theme_constant_override("separation", 7)
	shop_scroll.add_child(shop_list_container)

	shop_detail_label = Label.new()
	shop_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	shop_detail_label.custom_minimum_size = Vector2(0, 78)
	shop_detail_label.add_theme_font_size_override("font_size", 16)
	shop_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_column.add_child(shop_detail_label)
	var shop_quantity_row := HBoxContainer.new()
	shop_quantity_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_quantity_row.add_theme_constant_override("separation", 8)
	shop_column.add_child(shop_quantity_row)
	shop_quantity_minus_button = Button.new()
	shop_quantity_minus_button.text = "-"
	shop_quantity_minus_button.custom_minimum_size = Vector2(56, 44)
	shop_quantity_minus_button.pressed.connect(func() -> void:
		_set_shop_quantity(shop_quantity - 1)
	)
	shop_quantity_row.add_child(shop_quantity_minus_button)
	shop_quantity_spinbox = SpinBox.new()
	shop_quantity_spinbox.min_value = 1
	shop_quantity_spinbox.max_value = 999
	shop_quantity_spinbox.step = 1
	shop_quantity_spinbox.value = 1
	shop_quantity_spinbox.rounded = true
	shop_quantity_spinbox.custom_minimum_size = Vector2(118, 44)
	shop_quantity_spinbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_quantity_spinbox.value_changed.connect(func(value: float) -> void:
		_set_shop_quantity(int(value))
	)
	shop_quantity_row.add_child(shop_quantity_spinbox)
	shop_quantity_plus_button = Button.new()
	shop_quantity_plus_button.text = "+"
	shop_quantity_plus_button.custom_minimum_size = Vector2(56, 44)
	shop_quantity_plus_button.pressed.connect(func() -> void:
		_set_shop_quantity(shop_quantity + 1)
	)
	shop_quantity_row.add_child(shop_quantity_plus_button)
	shop_quantity_max_button = Button.new()
	shop_quantity_max_button.text = "最大"
	shop_quantity_max_button.custom_minimum_size = Vector2(86, 44)
	shop_quantity_max_button.pressed.connect(func() -> void:
		_set_shop_quantity(_shop_quantity_max(shop_selected_item_id))
	)
	shop_quantity_row.add_child(shop_quantity_max_button)
	shop_action_button = Button.new()
	shop_action_button.text = "购买"
	shop_action_button.custom_minimum_size = Vector2(0, 46)
	shop_action_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_action_button.pressed.connect(_on_shop_action_pressed)
	shop_column.add_child(shop_action_button)
	hud_root.add_child(shop_panel)

	pet_panel = _panel_container("PetPanel")
	pet_panel.visible = false
	pet_panel.z_index = 24
	var pet_column := VBoxContainer.new()
	pet_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_column.add_theme_constant_override("separation", 8)
	pet_panel.add_child(pet_column)

	var pet_header := HBoxContainer.new()
	pet_header.add_theme_constant_override("separation", 10)
	pet_column.add_child(pet_header)
	var pet_title := Label.new()
	pet_title.text = "宠物"
	pet_title.add_theme_font_size_override("font_size", 21)
	pet_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_header.add_child(pet_title)
	pet_close_button = Button.new()
	pet_close_button.text = "关闭"
	pet_close_button.custom_minimum_size = Vector2(92, 44)
	pet_close_button.pressed.connect(_close_pet_panel)
	pet_header.add_child(pet_close_button)

	var pet_body := HBoxContainer.new()
	pet_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_body.add_theme_constant_override("separation", 10)
	pet_column.add_child(pet_body)

	var pet_left_column := VBoxContainer.new()
	pet_left_column.custom_minimum_size = Vector2(232, 0)
	pet_left_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_left_column.add_theme_constant_override("separation", 7)
	pet_body.add_child(pet_left_column)
	var pet_manage_row := HBoxContainer.new()
	pet_manage_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_manage_row.add_theme_constant_override("separation", 6)
	pet_left_column.add_child(pet_manage_row)
	pet_filter_option = _pet_management_option(_pet_filter_options(), pet_filter_mode)
	pet_filter_option.custom_minimum_size = Vector2(0, 40)
	pet_filter_option.item_selected.connect(func(index: int) -> void:
		pet_filter_mode = str(pet_filter_option.get_item_metadata(index))
		pet_clear_confirm_instance_id = ""
		_refresh_pet_panel()
	)
	pet_manage_row.add_child(pet_filter_option)
	pet_sort_option = _pet_management_option(_pet_sort_options(), pet_sort_mode)
	pet_sort_option.custom_minimum_size = Vector2(0, 40)
	pet_sort_option.item_selected.connect(func(index: int) -> void:
		var next_sort_mode := str(pet_sort_option.get_item_metadata(index))
		if next_sort_mode != pet_sort_mode:
			pet_sort_mode = next_sort_mode
			pet_sort_descending = _pet_default_sort_descending(pet_sort_mode)
		else:
			pet_sort_mode = next_sort_mode
		pet_clear_confirm_instance_id = ""
		_refresh_pet_panel()
	)
	pet_manage_row.add_child(pet_sort_option)
	pet_sort_direction_button = Button.new()
	pet_sort_direction_button.custom_minimum_size = Vector2(42, 40)
	pet_sort_direction_button.add_theme_font_size_override("font_size", 15)
	pet_sort_direction_button.pressed.connect(_on_pet_sort_direction_pressed)
	pet_manage_row.add_child(pet_sort_direction_button)
	var pet_scroll := ScrollContainer.new()
	pet_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_left_column.add_child(pet_scroll)
	pet_list_container = VBoxContainer.new()
	pet_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_list_container.add_theme_constant_override("separation", 7)
	pet_scroll.add_child(pet_list_container)

	var pet_detail_column := VBoxContainer.new()
	pet_detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_detail_column.add_theme_constant_override("separation", 8)
	pet_body.add_child(pet_detail_column)
	var pet_detail_mode_row := HBoxContainer.new()
	pet_detail_mode_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_mode_row.add_theme_constant_override("separation", 8)
	pet_detail_column.add_child(pet_detail_mode_row)
	pet_detail_instance_button = Button.new()
	pet_detail_instance_button.text = "个体"
	pet_detail_instance_button.toggle_mode = true
	pet_detail_instance_button.button_pressed = true
	pet_detail_instance_button.custom_minimum_size = Vector2(0, 40)
	pet_detail_instance_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_instance_button.pressed.connect(func() -> void:
		_set_pet_detail_mode(PET_DETAIL_MODE_INSTANCE)
	)
	pet_detail_mode_row.add_child(pet_detail_instance_button)
	pet_detail_codex_button = Button.new()
	pet_detail_codex_button.text = "图鉴"
	pet_detail_codex_button.toggle_mode = true
	pet_detail_codex_button.custom_minimum_size = Vector2(0, 40)
	pet_detail_codex_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_codex_button.pressed.connect(func() -> void:
		_set_pet_detail_mode(PET_DETAIL_MODE_CODEX)
	)
	pet_detail_mode_row.add_child(pet_detail_codex_button)
	pet_detail_scroll = ScrollContainer.new()
	pet_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_detail_column.add_child(pet_detail_scroll)
	pet_detail_label = Label.new()
	pet_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pet_detail_label.add_theme_font_size_override("font_size", 16)
	pet_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	pet_detail_scroll.add_child(pet_detail_label)
	var pet_button_row := HBoxContainer.new()
	pet_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_button_row.add_theme_constant_override("separation", 8)
	pet_detail_column.add_child(pet_button_row)
	pet_state_cycle_button = Button.new()
	pet_state_cycle_button.text = "休息"
	pet_state_cycle_button.custom_minimum_size = Vector2(0, 48)
	pet_state_cycle_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_state_cycle_button.pressed.connect(_on_pet_state_cycle_pressed)
	pet_button_row.add_child(pet_state_cycle_button)
	pet_stable_button = Button.new()
	pet_stable_button.text = "存入"
	pet_stable_button.custom_minimum_size = Vector2(0, 48)
	pet_stable_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_stable_button.pressed.connect(_on_pet_stable_pressed)
	pet_button_row.add_child(pet_stable_button)
	pet_rename_button = Button.new()
	pet_rename_button.text = "改名"
	pet_rename_button.custom_minimum_size = Vector2(0, 48)
	pet_rename_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_rename_button.pressed.connect(_on_pet_rename_pressed)
	pet_button_row.add_child(pet_rename_button)
	pet_skill_button = Button.new()
	pet_skill_button.text = "宠技"
	pet_skill_button.custom_minimum_size = Vector2(0, 48)
	pet_skill_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_button.pressed.connect(func() -> void:
		_open_pet_skill_panel(false)
	)
	pet_button_row.add_child(pet_skill_button)
	pet_drop_button = Button.new()
	pet_drop_button.text = "丢弃"
	pet_drop_button.custom_minimum_size = Vector2(0, 48)
	pet_drop_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_drop_button.pressed.connect(_on_pet_drop_pressed)
	pet_button_row.add_child(pet_drop_button)
	hud_root.add_child(pet_panel)
	_create_pet_skill_panel()

	codex_panel = _panel_container("CodexPanel")
	codex_panel.visible = false
	codex_panel.z_index = 24
	var codex_column := VBoxContainer.new()
	codex_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_column.add_theme_constant_override("separation", 8)
	codex_panel.add_child(codex_column)

	var codex_header := HBoxContainer.new()
	codex_header.add_theme_constant_override("separation", 10)
	codex_column.add_child(codex_header)
	var codex_title := Label.new()
	codex_title.text = "图鉴"
	codex_title.add_theme_font_size_override("font_size", 21)
	codex_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_header.add_child(codex_title)
	codex_close_button = Button.new()
	codex_close_button.text = "关闭"
	codex_close_button.custom_minimum_size = Vector2(92, 44)
	codex_close_button.pressed.connect(_close_codex_panel)
	codex_header.add_child(codex_close_button)

	var codex_body := HBoxContainer.new()
	codex_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_body.add_theme_constant_override("separation", 10)
	codex_column.add_child(codex_body)

	var codex_scroll := ScrollContainer.new()
	codex_scroll.custom_minimum_size = Vector2(236, 0)
	codex_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_body.add_child(codex_scroll)
	codex_list_container = VBoxContainer.new()
	codex_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_list_container.add_theme_constant_override("separation", 7)
	codex_scroll.add_child(codex_list_container)

	var codex_detail_scroll := ScrollContainer.new()
	codex_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_body.add_child(codex_detail_scroll)
	codex_detail_label = Label.new()
	codex_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	codex_detail_label.add_theme_font_size_override("font_size", 16)
	codex_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_detail_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	codex_detail_scroll.add_child(codex_detail_label)
	hud_root.add_child(codex_panel)

	quest_panel = _panel_container("QuestPanel")
	quest_panel.visible = false
	quest_panel.z_index = 24
	var quest_column := VBoxContainer.new()
	quest_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	quest_column.add_theme_constant_override("separation", 10)
	quest_panel.add_child(quest_column)

	var quest_header := HBoxContainer.new()
	quest_header.add_theme_constant_override("separation", 10)
	quest_column.add_child(quest_header)
	quest_title_label = Label.new()
	quest_title_label.text = "任务"
	quest_title_label.add_theme_font_size_override("font_size", 21)
	quest_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_header.add_child(quest_title_label)
	quest_close_button = Button.new()
	quest_close_button.text = "关闭"
	quest_close_button.custom_minimum_size = Vector2(92, 44)
	quest_close_button.pressed.connect(_close_quest_panel)
	quest_header.add_child(quest_close_button)

	var quest_detail_scroll := ScrollContainer.new()
	quest_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	quest_column.add_child(quest_detail_scroll)
	quest_detail_label = Label.new()
	quest_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	quest_detail_label.add_theme_font_size_override("font_size", 17)
	quest_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_detail_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	quest_detail_scroll.add_child(quest_detail_label)

	quest_route_button = Button.new()
	quest_route_button.text = "自动寻路"
	quest_route_button.custom_minimum_size = Vector2(0, 48)
	quest_route_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_route_button.pressed.connect(_on_quest_route_pressed)
	quest_column.add_child(quest_route_button)
	hud_root.add_child(quest_panel)

	training_partner_panel = _panel_container("TrainingPartnerPanel")
	training_partner_panel.visible = false
	training_partner_panel.z_index = 24
	var training_partner_column := VBoxContainer.new()
	training_partner_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	training_partner_column.add_theme_constant_override("separation", 10)
	training_partner_panel.add_child(training_partner_column)
	var training_partner_header := HBoxContainer.new()
	training_partner_header.add_theme_constant_override("separation", 10)
	training_partner_column.add_child(training_partner_header)
	var training_partner_title := Label.new()
	training_partner_title.text = "练级伙伴"
	training_partner_title.add_theme_font_size_override("font_size", 21)
	training_partner_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_header.add_child(training_partner_title)
	training_partner_close_button = Button.new()
	training_partner_close_button.text = "关闭"
	training_partner_close_button.custom_minimum_size = Vector2(92, 44)
	training_partner_close_button.pressed.connect(_close_training_partner_panel)
	training_partner_header.add_child(training_partner_close_button)
	training_partner_label = Label.new()
	training_partner_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	training_partner_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	training_partner_label.add_theme_font_size_override("font_size", 16)
	training_partner_column.add_child(training_partner_label)
	var training_partner_button_row := HBoxContainer.new()
	training_partner_button_row.add_theme_constant_override("separation", 8)
	training_partner_column.add_child(training_partner_button_row)
	training_partner_add_button = Button.new()
	training_partner_add_button.text = "加入"
	training_partner_add_button.custom_minimum_size = Vector2(0, 46)
	training_partner_add_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_add_button.pressed.connect(_on_training_partner_add_pressed)
	training_partner_button_row.add_child(training_partner_add_button)
	training_partner_remove_button = Button.new()
	training_partner_remove_button.text = "移除"
	training_partner_remove_button.custom_minimum_size = Vector2(0, 46)
	training_partner_remove_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_remove_button.pressed.connect(_on_training_partner_remove_pressed)
	training_partner_button_row.add_child(training_partner_remove_button)
	training_partner_fill_button = Button.new()
	training_partner_fill_button.text = "加满"
	training_partner_fill_button.custom_minimum_size = Vector2(0, 46)
	training_partner_fill_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_fill_button.pressed.connect(_on_training_partner_fill_pressed)
	training_partner_button_row.add_child(training_partner_fill_button)
	training_partner_clear_button = Button.new()
	training_partner_clear_button.text = "清空"
	training_partner_clear_button.custom_minimum_size = Vector2(0, 46)
	training_partner_clear_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_clear_button.pressed.connect(_on_training_partner_clear_pressed)
	training_partner_button_row.add_child(training_partner_clear_button)
	hud_root.add_child(training_partner_panel)

	auto_settings_panel = _panel_container("AutoBattleSettingsPanel")
	auto_settings_panel.visible = false
	auto_settings_panel.z_index = 24
	var auto_settings_column := VBoxContainer.new()
	auto_settings_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	auto_settings_column.add_theme_constant_override("separation", 8)
	auto_settings_panel.add_child(auto_settings_column)

	var auto_settings_header := HBoxContainer.new()
	auto_settings_header.add_theme_constant_override("separation", 10)
	auto_settings_column.add_child(auto_settings_header)
	var auto_settings_title := Label.new()
	auto_settings_title.text = "内挂设置"
	auto_settings_title.add_theme_font_size_override("font_size", 21)
	auto_settings_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_header.add_child(auto_settings_title)
	auto_settings_close_button = Button.new()
	auto_settings_close_button.text = "关闭"
	auto_settings_close_button.custom_minimum_size = Vector2(92, 44)
	auto_settings_close_button.pressed.connect(_close_auto_settings_panel)
	auto_settings_header.add_child(auto_settings_close_button)

	var auto_settings_tab_row := HBoxContainer.new()
	auto_settings_tab_row.add_theme_constant_override("separation", 8)
	auto_settings_column.add_child(auto_settings_tab_row)
	auto_settings_battle_tab_button = Button.new()
	auto_settings_battle_tab_button.text = "战斗"
	auto_settings_battle_tab_button.toggle_mode = true
	auto_settings_battle_tab_button.custom_minimum_size = Vector2(0, 42)
	auto_settings_battle_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_battle_tab_button.pressed.connect(func() -> void:
		_set_auto_settings_tab("battle")
	)
	auto_settings_tab_row.add_child(auto_settings_battle_tab_button)
	auto_settings_hang_tab_button = Button.new()
	auto_settings_hang_tab_button.text = "挂机"
	auto_settings_hang_tab_button.toggle_mode = true
	auto_settings_hang_tab_button.custom_minimum_size = Vector2(0, 42)
	auto_settings_hang_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_hang_tab_button.pressed.connect(func() -> void:
		_set_auto_settings_tab("hang")
	)
	auto_settings_tab_row.add_child(auto_settings_hang_tab_button)
	auto_settings_capture_tab_button = Button.new()
	auto_settings_capture_tab_button.text = "捕捉"
	auto_settings_capture_tab_button.toggle_mode = true
	auto_settings_capture_tab_button.custom_minimum_size = Vector2(0, 42)
	auto_settings_capture_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_capture_tab_button.pressed.connect(func() -> void:
		_set_auto_settings_tab("capture")
	)
	auto_settings_tab_row.add_child(auto_settings_capture_tab_button)

	var auto_settings_scroll := ScrollContainer.new()
	auto_settings_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	auto_settings_column.add_child(auto_settings_scroll)
	auto_settings_content = VBoxContainer.new()
	auto_settings_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_content.add_theme_constant_override("separation", 8)
	auto_settings_scroll.add_child(auto_settings_content)
	hud_root.add_child(auto_settings_panel)

	pet_rename_panel = _panel_container("PetRenamePanel")
	pet_rename_panel.visible = false
	pet_rename_panel.z_index = 36
	pet_rename_panel.add_theme_stylebox_override("panel", _pet_rename_panel_style())
	var rename_column := VBoxContainer.new()
	rename_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rename_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rename_column.add_theme_constant_override("separation", 10)
	pet_rename_panel.add_child(rename_column)
	pet_rename_title_label = Label.new()
	pet_rename_title_label.text = "宠物改名"
	pet_rename_title_label.add_theme_font_size_override("font_size", 20)
	rename_column.add_child(pet_rename_title_label)
	pet_rename_input = LineEdit.new()
	pet_rename_input.placeholder_text = "新名字"
	pet_rename_input.max_length = PlayerProgressModel.PET_NAME_MAX_LENGTH
	pet_rename_input.custom_minimum_size = Vector2(0, 46)
	pet_rename_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_rename_input.text_submitted.connect(func(_submitted_text: String) -> void:
		_on_pet_rename_confirmed()
	)
	rename_column.add_child(pet_rename_input)
	var rename_button_row := HBoxContainer.new()
	rename_button_row.alignment = BoxContainer.ALIGNMENT_END
	rename_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rename_button_row.add_theme_constant_override("separation", 8)
	rename_column.add_child(rename_button_row)
	pet_rename_cancel_button = Button.new()
	pet_rename_cancel_button.text = "取消"
	pet_rename_cancel_button.custom_minimum_size = Vector2(96, 44)
	pet_rename_cancel_button.pressed.connect(_close_pet_rename_panel)
	rename_button_row.add_child(pet_rename_cancel_button)
	pet_rename_confirm_button = Button.new()
	pet_rename_confirm_button.text = "确定"
	pet_rename_confirm_button.custom_minimum_size = Vector2(96, 44)
	pet_rename_confirm_button.pressed.connect(_on_pet_rename_confirmed)
	rename_button_row.add_child(pet_rename_confirm_button)
	hud_root.add_child(pet_rename_panel)

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
	battle_command_panel.z_index = 30
	battle_command_panel.add_theme_stylebox_override("panel", _battle_command_panel_style())
	var battle_column := VBoxContainer.new()
	battle_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_column.add_theme_constant_override("separation", 8)
	battle_command_panel.add_child(battle_column)
	var battle_header := HBoxContainer.new()
	battle_header.name = "BattleCommandHeader"
	battle_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_header.add_theme_constant_override("separation", 8)
	battle_column.add_child(battle_header)
	var battle_auto_left_spacer := Control.new()
	battle_auto_left_spacer.custom_minimum_size = Vector2(70, 30)
	battle_header.add_child(battle_auto_left_spacer)
	battle_command_title_label = Label.new()
	battle_command_title_label.name = "BattleCommandTitle"
	battle_command_title_label.text = "人物"
	battle_command_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	battle_command_title_label.add_theme_font_size_override("font_size", 18)
	battle_command_title_label.custom_minimum_size = Vector2(0, 24)
	battle_command_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_header.add_child(battle_command_title_label)
	battle_auto_button = Button.new()
	battle_auto_button.name = "BattleAutoButton"
	battle_auto_button.text = "自动"
	battle_auto_button.toggle_mode = true
	battle_auto_button.custom_minimum_size = Vector2(70, 30)
	battle_auto_button.clip_text = true
	battle_auto_button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	battle_auto_button.add_theme_font_size_override("font_size", 15)
	battle_auto_button.add_theme_stylebox_override("normal", _battle_command_button_style(Color(0.07, 0.09, 0.09, 0.54)))
	battle_auto_button.add_theme_stylebox_override("hover", _battle_command_button_style(Color(0.12, 0.16, 0.16, 0.70)))
	battle_auto_button.add_theme_stylebox_override("pressed", _battle_command_button_style(Color(0.22, 0.28, 0.24, 0.82)))
	battle_auto_button.add_theme_stylebox_override("disabled", _battle_command_button_style(Color(0.05, 0.06, 0.06, 0.30)))
	battle_auto_button.pressed.connect(_on_battle_auto_button_pressed)
	battle_header.add_child(battle_auto_button)
	battle_command_button_grid = GridContainer.new()
	battle_command_button_grid.name = "BattleCommandButtonGrid"
	battle_command_button_grid.columns = 4
	battle_command_button_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_command_button_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_command_button_grid.add_theme_constant_override("h_separation", 8)
	battle_command_button_grid.add_theme_constant_override("v_separation", 8)
	battle_column.add_child(battle_command_button_grid)
	_add_battle_buttons([
		{"id": "attack", "label": "攻击"},
		{"id": "spirit", "label": "精灵"},
		{"id": "capture", "label": "捕捉"},
		{"id": "defend", "label": "防御"},
		{"id": "item", "label": "物品"},
		{"id": "switch_pet", "label": "换宠"},
		{"id": "run", "label": "逃跑"},
		{"id": "help", "label": "help"},
	])
	hud_root.add_child(battle_command_panel)
	battle_auto_stop_button = Button.new()
	battle_auto_stop_button.name = "BattleAutoStopButton"
	battle_auto_stop_button.text = "停止"
	battle_auto_stop_button.visible = false
	battle_auto_stop_button.z_index = 31
	battle_auto_stop_button.custom_minimum_size = Vector2(86, 44)
	battle_auto_stop_button.clip_text = true
	battle_auto_stop_button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	battle_auto_stop_button.add_theme_font_size_override("font_size", 17)
	battle_auto_stop_button.add_theme_stylebox_override("normal", _battle_command_button_style(Color(0.20, 0.08, 0.07, 0.82)))
	battle_auto_stop_button.add_theme_stylebox_override("hover", _battle_command_button_style(Color(0.28, 0.10, 0.08, 0.90)))
	battle_auto_stop_button.add_theme_stylebox_override("pressed", _battle_command_button_style(Color(0.34, 0.13, 0.10, 0.95)))
	battle_auto_stop_button.add_theme_stylebox_override("disabled", _battle_command_button_style(Color(0.05, 0.06, 0.06, 0.30)))
	battle_auto_stop_button.pressed.connect(_on_battle_auto_stop_button_pressed)
	hud_root.add_child(battle_auto_stop_button)

	battle_passive_panel = Panel.new()
	battle_passive_panel.name = "BattlePassivePanel"
	battle_passive_panel.visible = false
	battle_passive_panel.z_index = 10
	battle_passive_panel.clip_contents = true
	battle_passive_panel.size = Vector2(560, BATTLE_PASSIVE_PANEL_HEIGHT)
	battle_passive_panel.add_theme_stylebox_override("panel", _battle_passive_panel_style())
	battle_passive_label = Label.new()
	battle_passive_label.name = "BattlePassiveLabel"
	battle_passive_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	battle_passive_label.clip_text = true
	battle_passive_label.max_lines_visible = BATTLE_PASSIVE_MAX_LINES
	battle_passive_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	battle_passive_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	battle_passive_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	battle_passive_label.add_theme_font_size_override("font_size", BATTLE_PASSIVE_LABEL_FONT_SIZE)
	battle_passive_label.add_theme_color_override("font_color", Color(0.96, 0.9, 0.55, 1.0))
	battle_passive_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_passive_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_passive_panel.add_child(battle_passive_label)
	hud_root.add_child(battle_passive_panel)

	battle_message_panel = _panel_container("BattleMessagePanel")
	battle_message_panel.visible = false
	battle_message_panel.z_index = 20
	var battle_message_box := VBoxContainer.new()
	battle_message_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_message_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_message_panel.add_child(battle_message_box)
	battle_log_label = RichTextLabel.new()
	battle_log_label.name = "BattleLog"
	battle_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	battle_log_label.scroll_active = true
	battle_log_label.scroll_following = true
	battle_log_label.fit_content = false
	battle_log_label.selection_enabled = false
	battle_log_label.add_theme_font_size_override("font_size", 18)
	battle_log_label.add_theme_color_override("default_color", Color(0.95, 0.86, 0.28, 1.0))
	battle_log_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_log_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_log_label.custom_minimum_size = Vector2(0, 42)
	battle_message_box.add_child(battle_log_label)
	hud_root.add_child(battle_message_panel)


func _add_battle_buttons(specs: Array) -> void:
	for value in specs:
		var spec := value as Dictionary
		var button := Button.new()
		var command_id := str(spec.get("id", ""))
		button.text = str(spec.get("label", command_id))
		button.custom_minimum_size = _battle_command_button_size()
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.clip_text = true
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.add_theme_stylebox_override("normal", _battle_command_button_style(Color(0.07, 0.09, 0.09, 0.54)))
		button.add_theme_stylebox_override("hover", _battle_command_button_style(Color(0.12, 0.16, 0.16, 0.70)))
		button.add_theme_stylebox_override("pressed", _battle_command_button_style(Color(0.16, 0.20, 0.19, 0.76)))
		button.add_theme_stylebox_override("disabled", _battle_command_button_style(Color(0.05, 0.06, 0.06, 0.30)))
		button.pressed.connect(_on_battle_command_pressed.bind(command_id))
		battle_command_button_grid.add_child(button)
		battle_command_buttons[command_id] = button
	_sync_battle_command_layout()


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
	return battle_stat_test or battle_status_test or battle_status_skill_test or battle_status_hit_test or battle_status_rule_test or auto_battle_stat_formula_check or auto_battle_event_ledger_check or auto_battle_status_check or auto_battle_status_skill_check or auto_battle_status_hit_check or auto_battle_status_rule_check or auto_battle_passive_hover_check or battle_debug_window_enabled


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
		"statuses": BattleModel.actor_statuses_for_trace(actor),
		"statusResist": BattleModel.actor_status_resist_for_trace(actor),
		"statusImmune": BattleModel.actor_status_immune_for_trace(actor),
		"passiveSkillIds": BattleModel.actor_passive_skill_ids_for_trace(actor),
	}


func _build_theme() -> Theme:
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray([
		"Heiti SC",
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


func _pet_rename_panel_style() -> StyleBoxFlat:
	var style := _panel_style()
	style.bg_color = Color(0.10, 0.14, 0.14, 0.96)
	style.border_color = Color(0.84, 0.62, 0.32, 0.96)
	return style


func _battle_command_panel_style() -> StyleBoxFlat:
	var style := _panel_style()
	style.bg_color = Color(0.10, 0.14, 0.14, 0.68)
	style.border_color = Color(0.72, 0.56, 0.32, 0.82)
	return style


func _battle_passive_panel_style() -> StyleBoxFlat:
	var style := _panel_style()
	style.bg_color = Color(0.10, 0.14, 0.14, 0.50)
	style.border_color = Color(0.72, 0.56, 0.32, 0.45)
	style.set_border_width_all(1)
	return style


func _battle_command_button_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0.72, 0.56, 0.32, 0.18)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 6
	style.content_margin_bottom = 6
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

	_set_hang_mode(false)
	var world_point := _screen_to_world(screen_point)
	var ground_drop := _find_ground_pet_drop_at_world_point(world_point)
	if not ground_drop.is_empty():
		_set_interaction_target(_ground_pet_interaction_for_drop(ground_drop))
		return
	var interaction := InteractionModel.find_at_world_point(map_data, world_point)
	if not interaction.is_empty():
		_set_interaction_target(interaction)
		return

	_clear_pending_interaction()
	_close_dialog()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
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
	_set_hang_mode(false)
	_close_dialog()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
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
	if str(item.get("kind", "")) == "ground_pet_drop":
		_pickup_ground_pet_drop(str(item.get("dropId", "")))
		return
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
	if player == null or map_data.is_empty() or encounter_active or battle_active or _dialog_is_open() or has_pending_interaction or _world_menu_is_open():
		return
	if encounter_grace_remaining > 0.0:
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	if player_cell == last_checked_player_cell:
		return
	last_checked_player_cell = player_cell
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		encounter_zone_step_count = 0
		return
	encounter_zone_step_count += 1
	if encounter_zone_step_count <= ENCOUNTER_SAFE_STEPS:
		return
	if encounter_rng.randf() <= EncounterModel.encounter_rate(zone):
		_trigger_encounter(zone)


func _trigger_encounter(zone: Dictionary) -> void:
	if encounter_active or battle_active or zone.is_empty():
		return
	player.clear_move_target()
	_clear_navigation_state()
	active_encounter_zone = EncounterModel.zone_with_selected_wild_pet(zone, encounter_rng, _encounter_enemy_count_fallback())
	encounter_active = true
	_start_battle(_battle_state_for_encounter_zone(active_encounter_zone))


func _encounter_enemy_count_fallback() -> int:
	return 10 if PlayerProgressModel.training_partner_count(player_profile) > 0 else 1


func _battle_state_for_encounter_zone(zone: Dictionary) -> Dictionary:
	var enemy_count := EncounterModel.enemy_count(zone, _encounter_enemy_count_fallback())
	if enemy_count > 1 or str(zone.get("formationTemplate", "")) == BattleModel.FORMATION_TEMPLATE_10V10:
		return BattleModel.create_training_partner_battle(zone, enemy_count)
	return BattleModel.create_wild_battle(zone)


func _update_encounter_grace(delta: float) -> void:
	if encounter_grace_remaining <= 0.0:
		return
	encounter_grace_remaining = maxf(0.0, encounter_grace_remaining - delta)


func _begin_post_battle_encounter_grace() -> void:
	encounter_grace_remaining = ENCOUNTER_POST_BATTLE_GRACE_SECONDS
	encounter_zone_step_count = 0
	encounter_stone_elapsed = 0.0
	if player != null and not map_data.is_empty():
		last_checked_player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)


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
	var zone := EncounterModel.zone_with_selected_wild_pet(active_encounter_zone, encounter_rng, _encounter_enemy_count_fallback())
	_start_battle(_battle_state_for_encounter_zone(zone))


func _refresh_battle_target_seed() -> void:
	if battle_state.is_empty():
		return
	var forced_seed := str(battle_state.get("forcedTargetSeed", ""))
	if forced_seed != "":
		battle_state["targetSeed"] = forced_seed
		battle_state.erase("forcedTargetSeed")
		return
	battle_state["targetSeed"] = "%s:%d:%d" % [
		str(battle_state.get("id", "battle")),
		int(battle_state.get("round", 1)),
		encounter_rng.randi(),
	]


func _start_battle(next_battle_state: Dictionary) -> void:
	_clear_navigation_state()
	_close_dialog()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_encounter()
	world_log_message = ""
	battle_state = PlayerProgressModel.apply_profile_to_battle_state(player_profile, next_battle_state.duplicate(true))
	_refresh_battle_target_seed()
	battle_active = true
	battle_action_timer = 0.0
	battle_auto_attack_delay = 0.0
	battle_end_pending = false
	battle_enemy_response_pending = false
	battle_command_owner = "player"
	battle_target_mode = "enemy"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_hover_info_actor_id = ""
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	battle_selected_ally_target_id = ""
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_event_queue.clear()
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	battle_event_advance_pending = false
	battle_round_end_status_processed = false
	battle_player_zero_hp_seen = false
	battle_auto_capture_success_seen = false
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
	battle_last_event_ledger.clear()
	battle_recorded_event_sequence = 0
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
		battle_command_panel.visible = _battle_command_panel_should_be_visible()
	if battle_passive_panel != null:
		battle_passive_panel.visible = false
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
	var was_battle_active := battle_active
	battle_active = false
	battle_state.clear()
	battle_action_timer = 0.0
	battle_end_pending = false
	battle_enemy_response_pending = false
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_hover_info_actor_id = ""
	battle_target_mode = "enemy"
	battle_command_owner = "player"
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_event_queue.clear()
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	battle_event_advance_pending = false
	battle_round_end_status_processed = false
	battle_player_zero_hp_seen = false
	battle_auto_capture_success_seen = false
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
	battle_last_event_ledger.clear()
	battle_recorded_event_sequence = 0
	battle_float_texts.clear()
	_set_battle_command_owner("player")
	if battle_command_panel != null:
		battle_command_panel.visible = false
	if battle_passive_panel != null:
		battle_passive_panel.visible = false
	if battle_passive_label != null:
		battle_passive_label.text = ""
	if battle_message_panel != null:
		battle_message_panel.visible = world_log_message != ""
	if battle_log_label != null and world_log_message != "":
		battle_log_label.text = world_log_message
	if action_bar != null:
		action_bar.visible = true
	_sync_hang_button_text()
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
	if _restore_world and was_battle_active:
		_begin_post_battle_encounter_grace()
	_update_battle_debug_window(true)
	queue_redraw()


func _finish_battle_and_return_to_world(result_override: String = "") -> Dictionary:
	if battle_state.is_empty():
		_end_battle(true)
		_set_world_log_message("战斗结束。")
		return {}
	_sync_profile_battle_items_from_battle_state(false)
	_sync_profile_capture_tools_from_battle_state(false)
	_update_battle_player_zero_hp_seen()
	var ended_state := battle_state.duplicate(true)
	var hang_stop_message := _hang_stop_message_for_battle_result(ended_state)
	var player_knocked_away := PlayerProgressModel.battle_actor_knocked_away(ended_state, BattleModel.PLAYER_ACTOR_ID)
	var result := PlayerProgressModel.apply_battle_result(player_profile, ended_state, result_override)
	player_profile = result.get("profile", player_profile)
	var log_lines: Array[String] = []
	for line in result.get("logLines", []):
		log_lines.append(str(line))
	var quest_lines := _quest_messages_for_battle_result(ended_state, result)
	for line in quest_lines:
		log_lines.append(line)
	if hang_stop_message != "":
		_stop_hang_activity("", true)
		log_lines.append(hang_stop_message)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	if player_knocked_away:
		_return_player_to_record_point_after_knockaway(log_lines)
	else:
		_end_battle(true)
	_set_world_log_message("\n".join(log_lines))
	return result


func _return_player_to_record_point_after_knockaway(log_lines: Array[String]) -> void:
	var point := PlayerProgressModel.record_point(player_profile)
	var map_id := str(point.get("mapId", PlayerProgressModel.DEFAULT_RECORD_POINT_MAP_ID))
	var spawn_name := str(point.get("spawnName", PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME))
	var label := str(point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	if not _load_map(map_id, spawn_name):
		map_id = PlayerProgressModel.DEFAULT_RECORD_POINT_MAP_ID
		spawn_name = PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME
		label = PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL
		_load_map(map_id, spawn_name)
	log_lines.append("见习猎人被击飞，回到记录点「%s」。" % label)


func _battle_player_actor_from_state(state: Dictionary) -> Dictionary:
	return BattleModel.actor_by_id(state, BattleModel.PLAYER_ACTOR_ID)


func _battle_player_hp_from_state(state: Dictionary) -> int:
	var actor := _battle_player_actor_from_state(state)
	return int(actor.get("hp", 0)) if not actor.is_empty() else 0


func _battle_player_max_hp_from_state(state: Dictionary) -> int:
	var actor := _battle_player_actor_from_state(state)
	return maxi(1, int(actor.get("maxHp", 1))) if not actor.is_empty() else 1


func _update_battle_player_zero_hp_seen() -> void:
	if battle_state.is_empty():
		return
	if _battle_player_hp_from_state(battle_state) <= 0:
		battle_player_zero_hp_seen = true


func _hang_activity_active() -> bool:
	return hang_mode_active or _encounter_stone_active()


func _hang_stop_message_for_battle_result(ended_state: Dictionary) -> String:
	if not _hang_activity_active():
		return ""
	var settings := PlayerProgressModel.hang_settings(player_profile)
	var threshold := int(settings.get(HangSettingsModel.LOW_HP_STOP_PERCENT_KEY, HangSettingsModel.STOP_ON_DEATH))
	if threshold == HangSettingsModel.STOP_NEVER:
		return ""
	var player_hp := _battle_player_hp_from_state(ended_state)
	var player_max_hp := _battle_player_max_hp_from_state(ended_state)
	if threshold == HangSettingsModel.STOP_ON_DEATH:
		return "人物倒下过，挂机已停止。" if battle_player_zero_hp_seen or player_hp <= 0 else ""
	var hp_percent := float(maxi(0, player_hp)) / float(player_max_hp) * 100.0
	if hp_percent < float(threshold):
		return "人物生命低于%d%%，挂机已停止。" % threshold
	return ""


func _sync_profile_capture_tools_from_battle_state(save_after: bool = true) -> void:
	if battle_state.is_empty():
		return
	player_profile = PlayerProgressModel.with_capture_tool_inventory(player_profile, BattleModel.capture_tool_inventory(battle_state))
	if save_after and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)


func _sync_profile_battle_items_from_battle_state(save_after: bool = true) -> void:
	if battle_state.is_empty():
		return
	var bag = battle_state.get("itemBag", {})
	if not (bag is Dictionary):
		return
	player_profile = PlayerProgressModel.with_battle_item_inventory(player_profile, bag as Dictionary)
	if save_after and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)


func _quest_messages_for_battle_result(ended_state: Dictionary, result: Dictionary) -> Array[String]:
	var messages: Array[String] = []
	if str(result.get("result", "")) == "victory":
		var group_id := str(ended_state.get("sourceEncounterGroupId", ended_state.get("encounterGroupId", "")))
		messages.append_array(_record_quest_event_and_maybe_claim({
			"type": "battle_victory",
			"encounterGroupId": group_id,
		}))
	var captured_values = result.get("capturedPets", [])
	if captured_values is Array:
		for value in captured_values:
			if not (value is Dictionary):
				continue
			var captured := value as Dictionary
			messages.append_array(_record_quest_event_and_maybe_claim({
				"type": "capture_pet",
				"formId": str(captured.get("formId", "")),
				"lineId": str(captured.get("lineId", "")),
				"amount": 1,
			}))
	return messages


func _record_quest_event_and_maybe_claim(event: Dictionary) -> Array[String]:
	var messages: Array[String] = []
	var progress_result := PlayerProgressModel.record_quest_event(player_profile, event)
	player_profile = progress_result.get("profile", player_profile)
	if not bool(progress_result.get("changed", false)):
		return messages
	if bool(progress_result.get("ready", false)) and PlayerProgressModel.active_quest_auto_claim(player_profile):
		var claim_result := PlayerProgressModel.claim_active_quest(player_profile)
		player_profile = claim_result.get("profile", player_profile)
		messages.append(str(claim_result.get("message", "")))
	else:
		messages.append(str(progress_result.get("message", "")))
	var filtered: Array[String] = []
	for message in messages:
		var text := message.strip_edges()
		if text != "":
			filtered.append(text)
	return filtered


func _set_world_log_message(text: String) -> void:
	var stripped := text.strip_edges()
	world_log_message = stripped
	if stripped != "":
		for raw_line in stripped.split("\n", false):
			var line := str(raw_line).strip_edges()
			if line != "":
				world_log_history.append(line)
	while world_log_history.size() > WORLD_LOG_MAX_LINES:
		world_log_history.pop_front()
	var display_text := "\n".join(world_log_history)
	if battle_log_label != null:
		battle_log_label.text = display_text
		battle_log_label.scroll_following = true
		battle_log_label.call_deferred("scroll_to_line", maxi(0, battle_log_label.get_line_count() - 1))
	if battle_message_panel != null:
		battle_message_panel.visible = display_text != "" or battle_active
	if hud_root != null:
		_layout_hud()
	queue_redraw()


func _open_backpack_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_shop_panel()
	_close_equipment_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	backpack_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_backpack_panel()
	_layout_hud()


func _close_backpack_panel() -> void:
	backpack_pending_use_item_id = ""
	if backpack_panel != null:
		backpack_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _open_equipment_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	equipment_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_equipment_panel()
	_layout_hud()


func _close_equipment_panel() -> void:
	if equipment_panel != null:
		equipment_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _open_player_status_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	player_status_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_player_status_panel()
	_layout_hud()


func _close_player_status_panel() -> void:
	if player_status_panel != null:
		player_status_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _on_player_status_equipment_pressed() -> void:
	_close_player_status_panel()
	_open_equipment_panel()


func _on_player_status_allocate_pressed(stat_key: String) -> void:
	var result := PlayerProgressModel.allocate_player_stat_point(player_profile, stat_key)
	player_profile = result.get("profile", player_profile)
	_set_world_log_message(str(result.get("message", "")))
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_refresh_player_status_panel()
	_update_hud_text()


func _refresh_player_status_panel() -> void:
	if player_status_panel == null or player_status_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var player_dict := player_profile.get("player", {}) as Dictionary
	var summary := PlayerProgressModel.player_stat_summary(player_profile)
	var base := summary.get("base", {}) as Dictionary
	var bonus := summary.get("bonus", {}) as Dictionary
	var current := summary.get("current", {}) as Dictionary
	var current_max_hp := maxi(1, int(current.get("maxHp", player_dict.get("maxHp", 1))))
	var current_hp := clampi(int(player_dict.get("hp", current_max_hp)), 0, current_max_hp)
	var level := maxi(1, int(player_dict.get("level", 1)))
	var exp := maxi(0, int(player_dict.get("exp", 0)))
	var next_exp := maxi(1, int(player_dict.get("nextExp", PlayerProgressModel.exp_to_next_level(level))))
	var stat_points := PlayerProgressModel.player_stat_points(player_profile)
	var lines: Array[String] = [
		"[color=#d7c36a]%s  Lv%d[/color]" % [_bbcode_escape(str(player_dict.get("name", "见习猎人"))), level],
		"生命: %d/%d    经验: %d/%d" % [current_hp, current_max_hp, exp, next_exp],
		"",
		"[color=#d7c36a]四维[/color]",
		_player_status_stat_line("maxHp", base, bonus, current),
		_player_status_stat_line("attack", base, bonus, current),
		_player_status_stat_line("defense", base, bonus, current),
		_player_status_stat_line("quick", base, bonus, current),
		"",
		"[color=#d7c36a]装备加成[/color]",
		_player_status_bonus_line(bonus),
		"",
		"[color=#d7c36a]可用精灵[/color]",
	]
	var spirit_entries := PlayerProgressModel.equipment_spirit_source_entries(player_profile)
	if spirit_entries.is_empty():
		lines.append("无")
	else:
		for entry in spirit_entries:
			lines.append("%s：%s" % [
				_bbcode_escape(str(entry.get("spiritLabel", "精灵"))),
				_bbcode_escape(_equipment_spirit_sources_text(entry)),
			])
	var point := PlayerProgressModel.record_point(player_profile)
	lines.append("")
	lines.append("[color=#d7c36a]记录点[/color]")
	lines.append(str(point.get("label", "记录点")))
	player_status_detail_label.text = "\n".join(lines)
	if player_status_points_label != null:
		player_status_points_label.text = "可分配属性点：%d" % stat_points
	for stat_key in player_status_stat_point_buttons.keys():
		var button := player_status_stat_point_buttons.get(stat_key) as Button
		if button == null:
			continue
		button.text = "%s +%d" % [
			EquipmentModel.stat_label_for(str(stat_key)),
			PlayerProgressModel.player_stat_point_gain_for(str(stat_key)),
		]
		button.disabled = stat_points <= 0


func _player_status_stat_line(stat_key: String, base: Dictionary, bonus: Dictionary, current: Dictionary) -> String:
	var base_value := int(base.get(stat_key, 0))
	var bonus_value := int(bonus.get(stat_key, 0))
	var label := EquipmentModel.stat_label_for(stat_key)
	if bonus_value == 0:
		return "%s %d" % [label, base_value]
	return "%s %d%s%d=%d" % [
		label,
		base_value,
		"+" if bonus_value > 0 else "",
		bonus_value,
		int(current.get(stat_key, base_value + bonus_value)),
	]


func _player_status_bonus_line(bonus: Dictionary) -> String:
	var parts: Array[String] = []
	for stat_key in EquipmentModel.STAT_KEYS:
		var bonus_value := int(bonus.get(stat_key, 0))
		if bonus_value == 0:
			continue
		parts.append("%s %s%d" % [
			EquipmentModel.stat_label_for(stat_key),
			"+" if bonus_value > 0 else "",
			bonus_value,
		])
	return "无" if parts.is_empty() else "    ".join(parts)


func _equipment_spirit_sources_text(entry: Dictionary) -> String:
	var parts: Array[String] = []
	var sources: Array = entry.get("sources", [])
	for source_value in sources:
		if not (source_value is Dictionary):
			continue
		var source := source_value as Dictionary
		var item_label := str(source.get("itemLabel", "装备"))
		if item_label != "" and not parts.has(item_label):
			parts.append(item_label)
	return "未知装备" if parts.is_empty() else "、".join(parts)


func _refresh_equipment_panel() -> void:
	if equipment_panel == null or equipment_grid == null or equipment_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var equipped := PlayerProgressModel.equipment_slots(player_profile)
	_refresh_equipment_stats()
	if equipment_selected_slot_id == "" or not EquipmentModel.slot_ids().has(equipment_selected_slot_id):
		equipment_selected_slot_id = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	for child in equipment_grid.get_children():
		child.queue_free()
	equipment_slot_buttons.clear()
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(equipped.get(slot_id, ""))
		var button := Button.new()
		button.toggle_mode = true
		button.button_pressed = slot_id == equipment_selected_slot_id
		button.add_theme_font_size_override("font_size", 15)
		var slot_rect := _equipment_slot_anchor_rect(slot_id)
		button.anchor_left = slot_rect.position.x
		button.anchor_top = slot_rect.position.y
		button.anchor_right = slot_rect.position.x + slot_rect.size.x
		button.anchor_bottom = slot_rect.position.y + slot_rect.size.y
		button.offset_left = 0
		button.offset_top = 0
		button.offset_right = 0
		button.offset_bottom = 0
		button.text = "%s\n%s" % [
			EquipmentModel.slot_label_for(slot_id),
			EquipmentModel.menu_label_for(item_id, "-") if item_id != "" else "-",
		]
		var selected_slot_id := slot_id
		button.pressed.connect(func() -> void:
			_select_equipment_slot(selected_slot_id)
		)
		equipment_grid.add_child(button)
		equipment_slot_buttons[slot_id] = button
	_refresh_equipment_detail()


func _refresh_equipment_stats() -> void:
	if equipment_stats_label == null:
		return
	var summary := PlayerProgressModel.player_stat_summary(player_profile)
	var base := summary.get("base", {}) as Dictionary
	var bonus := summary.get("bonus", {}) as Dictionary
	var current := summary.get("current", {}) as Dictionary
	equipment_stats_label.text = "人物属性\n%s    %s\n%s    %s" % [
		_equipment_stat_line_for("maxHp", base, bonus, current),
		_equipment_stat_line_for("attack", base, bonus, current),
		_equipment_stat_line_for("defense", base, bonus, current),
		_equipment_stat_line_for("quick", base, bonus, current),
	]


func _equipment_stat_line_for(stat_key: String, base: Dictionary, bonus: Dictionary, current: Dictionary) -> String:
	var base_value := int(base.get(stat_key, 0))
	var bonus_value := int(bonus.get(stat_key, 0))
	if bonus_value == 0:
		return "%s %d" % [EquipmentModel.stat_label_for(stat_key), base_value]
	return "%s %d%s%d=%d" % [
		EquipmentModel.stat_label_for(stat_key),
		base_value,
		"+" if bonus_value > 0 else "",
		bonus_value,
		int(current.get(stat_key, base_value + bonus_value)),
	]


func _equipment_slot_anchor_rect(slot_id: String) -> Rect2:
	match slot_id:
		EquipmentModel.SLOT_ACCESSORY_LEFT:
			return Rect2(0.02, 0.02, 0.27, 0.24)
		EquipmentModel.SLOT_ACCESSORY_RIGHT:
			return Rect2(0.32, 0.02, 0.27, 0.24)
		EquipmentModel.SLOT_HEAD:
			return Rect2(0.62, 0.16, 0.27, 0.24)
		EquipmentModel.SLOT_LEFT_HAND_WEAPON:
			return Rect2(0.22, 0.43, 0.24, 0.24)
		EquipmentModel.SLOT_BODY:
			return Rect2(0.48, 0.43, 0.24, 0.24)
		EquipmentModel.SLOT_RIGHT_HAND_WEAPON:
			return Rect2(0.74, 0.43, 0.24, 0.24)
		EquipmentModel.SLOT_HANDS:
			return Rect2(0.38, 0.72, 0.24, 0.24)
		EquipmentModel.SLOT_FEET:
			return Rect2(0.67, 0.72, 0.24, 0.24)
	return Rect2(0.0, 0.0, 0.24, 0.24)


func _refresh_equipment_detail() -> void:
	if equipment_detail_label == null:
		return
	var equipped := PlayerProgressModel.equipment_slots(player_profile)
	var item_id := str(equipped.get(equipment_selected_slot_id, ""))
	var lines: Array[String] = [
		"%s" % EquipmentModel.slot_label_for(equipment_selected_slot_id),
	]
	if item_id == "":
		lines.append("未装备")
	else:
		lines.append(EquipmentModel.label_for(item_id))
		var durability_text := PlayerProgressModel.equipment_slot_durability_text(player_profile, equipment_selected_slot_id)
		if durability_text != "":
			lines.append(durability_text)
		lines.append_array(EquipmentModel.detail_lines_for_item(item_id))
	equipment_detail_label.text = "\n".join(lines)
	if equipment_unequip_button != null:
		equipment_unequip_button.visible = item_id != ""
		equipment_unequip_button.disabled = item_id == ""


func _select_equipment_slot(slot_id: String) -> void:
	equipment_selected_slot_id = slot_id
	_refresh_equipment_panel()


func _on_equipment_unequip_pressed() -> void:
	var result := PlayerProgressModel.unequip_slot(player_profile, equipment_selected_slot_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_panel()
	if status_label != null:
		_update_hud_text()


func _refresh_backpack_panel() -> void:
	if backpack_panel == null or backpack_grid == null or backpack_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var slots := PlayerProgressModel.backpack_slots(player_profile)
	backpack_selected_slot_index = clampi(backpack_selected_slot_index, 0, maxi(0, slots.size() - 1))
	backpack_grid.columns = _backpack_grid_columns()
	for child in backpack_grid.get_children():
		child.queue_free()
	backpack_slot_buttons.clear()
	for index in range(BackpackModel.SLOT_LIMIT):
		var slot := slots[index] if index < slots.size() else {}
		var button := Button.new()
		button.text = BackpackModel.slot_label(slot)
		button.toggle_mode = true
		button.button_pressed = index == backpack_selected_slot_index
		button.custom_minimum_size = Vector2(0, 62)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var slot_index := index
		button.pressed.connect(func() -> void:
			_select_backpack_slot(slot_index)
		)
		backpack_grid.add_child(button)
		backpack_slot_buttons.append(button)
	var selected_slot := slots[backpack_selected_slot_index] if backpack_selected_slot_index < slots.size() else {}
	var selected_item_id := str(selected_slot.get("itemId", ""))
	var detail_lines := BackpackModel.detail_lines_for_slot(selected_slot)
	if EquipmentModel.is_equipment(selected_item_id):
		detail_lines.append_array(_equipment_detail_lines_with_requirement_status(selected_item_id, true))
		detail_lines.append_array(_equipment_compare_detail_lines(selected_item_id))
	backpack_detail_label.text = "\n".join(detail_lines)
	var is_selected_equipment := EquipmentModel.is_equipment(selected_item_id)
	var equip_check := PlayerProgressModel.can_equip_item(player_profile, selected_item_id) if is_selected_equipment else {}
	var can_world_use := (
		selected_item_id != ""
		and BackpackModel.item_can_world_pet_heal(selected_item_id)
		and BackpackModel.item_count(slots, selected_item_id) > 0
	)
	var can_world_encounter_stone := (
		selected_item_id != ""
		and BackpackModel.item_can_world_encounter_stone(selected_item_id)
		and BackpackModel.item_count(slots, selected_item_id) > 0
	)
	var can_equip := (
		selected_item_id != ""
		and is_selected_equipment
		and BackpackModel.item_count(slots, selected_item_id) > 0
		and bool(equip_check.get("ok", false))
	)
	if backpack_use_button != null:
		backpack_use_button.visible = can_world_use or can_world_encounter_stone or is_selected_equipment
		backpack_use_button.disabled = not (can_world_use or can_world_encounter_stone or can_equip)
		if is_selected_equipment:
			backpack_use_button.text = "装备"
		else:
			backpack_use_button.text = "使用"
	if not can_world_use or backpack_pending_use_item_id != selected_item_id:
		backpack_pending_use_item_id = ""
		_clear_backpack_target_buttons()
		if backpack_target_scroll != null:
			backpack_target_scroll.visible = false
	else:
		_refresh_backpack_target_buttons(selected_item_id)


func _backpack_grid_columns() -> int:
	return 3 if _is_phone_shape(_layout_size()) else 5


func _select_backpack_slot(slot_index: int) -> void:
	backpack_selected_slot_index = clampi(slot_index, 0, BackpackModel.SLOT_LIMIT - 1)
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()


func _equipment_compare_detail_lines(item_id: String) -> Array[String]:
	var preview := PlayerProgressModel.equipment_change_preview(player_profile, item_id)
	if preview.is_empty():
		return []
	var lines: Array[String] = [
		"[color=#d7c36a]换装预览[/color]",
		"当前: %s -> %s" % [
			_bbcode_escape(str(preview.get("currentItemLabel", "无"))),
			_bbcode_escape(str(preview.get("newItemLabel", "装备"))),
		],
	]
	if bool(preview.get("unchanged", false)):
		lines.append("已装备，无变化。")
		return lines
	var stat_changes: Array = preview.get("statChanges", [])
	var impact_parts: Array[String] = []
	if stat_changes.is_empty():
		impact_parts.append("属性: 无变化")
	else:
		var stat_parts: Array[String] = []
		for change_value in stat_changes:
			if not (change_value is Dictionary):
				continue
			var change := change_value as Dictionary
			var delta := int(change.get("delta", 0))
			if delta == 0:
				continue
			stat_parts.append(_colored_equipment_delta("%s %s%d" % [
				str(change.get("label", "")),
				"+" if delta > 0 else "",
				delta,
			], delta))
		if stat_parts.is_empty():
			impact_parts.append("属性: 无变化")
		else:
			impact_parts.append("属性: %s" % "、".join(stat_parts))
	var spirit_parts: Array[String] = []
	for spirit_id in preview.get("gainedSpiritIds", []):
		spirit_parts.append(_colored_equipment_delta("获得 %s" % _bbcode_escape(BattleActionCatalog.label_for(str(spirit_id), str(spirit_id))), 1))
	for spirit_id in preview.get("lostSpiritIds", []):
		spirit_parts.append(_colored_equipment_delta("失去 %s" % _bbcode_escape(BattleActionCatalog.label_for(str(spirit_id), str(spirit_id))), -1))
	impact_parts.append("精灵: %s" % ("无变化" if spirit_parts.is_empty() else "、".join(spirit_parts)))
	lines.append("影响: %s" % "；".join(impact_parts))
	return lines


func _equipment_detail_lines_with_requirement_status(item_id: String, use_bbcode: bool = false) -> Array[String]:
	var lines := EquipmentModel.detail_lines_for_item(item_id)
	var status_lines := _equipment_requirement_status_lines(item_id, use_bbcode)
	if status_lines.is_empty():
		return lines
	var requirement_text := EquipmentModel.requirement_text_for(item_id)
	var insert_index := -1
	for index in range(lines.size()):
		if str(lines[index]) == requirement_text:
			insert_index = index + 1
			break
	if insert_index < 0:
		lines.append_array(status_lines)
	else:
		for offset in range(status_lines.size()):
			lines.insert(insert_index + offset, status_lines[offset])
	return lines


func _equipment_requirement_status_lines(item_id: String, use_bbcode: bool = false) -> Array[String]:
	if not EquipmentModel.is_equipment(item_id):
		return []
	var required_level := EquipmentModel.required_level_for(item_id)
	if required_level <= 1:
		return []
	var player_dict := PlayerProgressModel.normalize_profile(player_profile).get("player", {}) as Dictionary
	var player_level := maxi(1, int(player_dict.get("level", 1)))
	var met := player_level >= required_level
	var text := "当前 Lv%d：%s" % [player_level, "已满足" if met else "未满足"]
	if use_bbcode:
		var color := EQUIPMENT_COMPARE_GAIN_COLOR if met else EQUIPMENT_COMPARE_LOSS_COLOR
		text = "[color=%s]%s[/color]" % [color, _bbcode_escape(text)]
	return ["需求状态: %s" % text]


func _colored_equipment_delta(text: String, delta: int) -> String:
	var color := EQUIPMENT_COMPARE_GAIN_COLOR if delta > 0 else EQUIPMENT_COMPARE_LOSS_COLOR
	return "[color=%s]%s[/color]" % [color, text]


func _bbcode_escape(text: String) -> String:
	return text.replace("[", "[lb]").replace("]", "[rb]")


func _selected_backpack_slot() -> Dictionary:
	var slots := PlayerProgressModel.backpack_slots(player_profile)
	if backpack_selected_slot_index < 0 or backpack_selected_slot_index >= slots.size():
		return {}
	return slots[backpack_selected_slot_index]


func _selected_backpack_item_id() -> String:
	return str(_selected_backpack_slot().get("itemId", ""))


func _backpack_slot_index_for_item(item_id: String) -> int:
	var slots := PlayerProgressModel.backpack_slots(player_profile)
	for index in range(slots.size()):
		if str((slots[index] as Dictionary).get("itemId", "")) == item_id:
			return index
	return -1


func _on_backpack_use_pressed() -> void:
	var item_id := _selected_backpack_item_id()
	if EquipmentModel.is_equipment(item_id):
		var result := PlayerProgressModel.equip_item(player_profile, item_id)
		player_profile = result.get("profile", player_profile)
		var log_lines: Array[String] = [str(result.get("message", ""))]
		if bool(result.get("ok", false)):
			log_lines.append_array(_record_quest_event_and_maybe_claim({
				"type": "equip_item",
				"itemId": str(result.get("itemId", item_id)),
				"slot": str(result.get("slot", "")),
				"amount": 1,
			}))
		if bool(result.get("ok", false)) and profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		_set_world_log_message("\n".join(log_lines))
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		if status_label != null:
			_update_hud_text()
		return
	if BackpackModel.item_can_world_encounter_stone(item_id):
		_use_backpack_encounter_stone(item_id)
		return
	if not BackpackModel.item_can_world_pet_heal(item_id):
		return
	backpack_pending_use_item_id = item_id
	_refresh_backpack_panel()


func _use_backpack_encounter_stone(item_id: String) -> void:
	var item_label := BackpackModel.label_for(item_id)
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		_set_world_log_message("%s 不够了。" % item_label)
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		_set_world_log_message("需要站在遇敌区域，才能使用%s。" % item_label)
		return
	var slots := BackpackModel.consume(PlayerProgressModel.backpack_slots(player_profile), item_id, 1)
	player_profile = PlayerProgressModel.with_backpack_slots(player_profile, slots)
	_activate_encounter_stone(item_id)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	if status_label != null:
		_update_hud_text()


func _activate_encounter_stone(item_id: String) -> void:
	encounter_stone_item_id = item_id
	encounter_stone_interval = BackpackModel.world_encounter_interval_for(item_id)
	encounter_stone_remaining = BackpackModel.world_encounter_duration_for(item_id)
	encounter_stone_elapsed = 0.0
	_set_hang_mode(false)
	_sync_hang_button_text()
	_set_world_log_message("%s 已生效，站在遇敌区域每%d秒遇敌。" % [
		BackpackModel.label_for(item_id),
		int(roundf(encounter_stone_interval)),
	])


func _encounter_stone_active() -> bool:
	return encounter_stone_item_id != "" and encounter_stone_interval > 0.0 and encounter_stone_remaining > 0.0


func _clear_encounter_stone_effect(show_message: bool = false) -> void:
	var item_label := BackpackModel.label_for(encounter_stone_item_id, "遇敌石")
	encounter_stone_item_id = ""
	encounter_stone_interval = 0.0
	encounter_stone_remaining = 0.0
	encounter_stone_elapsed = 0.0
	_sync_hang_button_text()
	if show_message:
		_set_world_log_message("%s 效果结束。" % item_label)


func _update_stationary_encounter_stone(delta: float) -> void:
	if not _encounter_stone_active():
		return
	if encounter_active or battle_active:
		return
	encounter_stone_remaining = maxf(0.0, encounter_stone_remaining - delta)
	if encounter_stone_remaining <= 0.0:
		_clear_encounter_stone_effect(true)
		return
	if player == null or map_data.is_empty() or player.is_auto_moving() or _dialog_is_open() or has_pending_interaction or _world_menu_is_open():
		encounter_stone_elapsed = 0.0
		return
	if encounter_grace_remaining > 0.0:
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		encounter_stone_elapsed = 0.0
		return
	encounter_stone_elapsed += delta
	if encounter_stone_elapsed >= encounter_stone_interval:
		encounter_stone_elapsed = 0.0
		_trigger_encounter(zone)


func _clear_backpack_target_buttons() -> void:
	if backpack_target_container == null:
		return
	for child in backpack_target_container.get_children():
		child.queue_free()


func _refresh_backpack_target_buttons(item_id: String) -> void:
	if backpack_target_scroll == null or backpack_target_container == null:
		return
	_clear_backpack_target_buttons()
	backpack_target_scroll.visible = true
	var pets := PlayerProgressModel.party_pet_instances(player_profile)
	if pets.is_empty():
		var empty_label := Label.new()
		empty_label.text = "没有队伍宠物"
		empty_label.add_theme_font_size_override("font_size", 15)
		backpack_target_container.add_child(empty_label)
		return
	for pet in pets:
		var max_hp := maxi(1, int(pet.get("maxHp", 1)))
		var hp := clampi(int(pet.get("hp", max_hp)), 0, max_hp)
		var button := Button.new()
		button.text = "%s\n生命 %d/%d" % [str(pet.get("name", "宠物")), hp, max_hp]
		button.custom_minimum_size = Vector2(0, 52)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.disabled = hp >= max_hp or not BackpackModel.item_can_world_pet_heal(item_id)
		var instance_id := str(pet.get("instanceId", ""))
		button.pressed.connect(func() -> void:
			_use_backpack_item_on_pet(item_id, instance_id)
		)
		backpack_target_container.add_child(button)


func _use_backpack_item_on_pet(item_id: String, instance_id: String) -> void:
	var result := PlayerProgressModel.use_world_pet_heal_item(player_profile, item_id, instance_id)
	player_profile = result.get("profile", player_profile)
	var log_lines: Array[String] = [str(result.get("message", ""))]
	if bool(result.get("ok", false)):
		log_lines.append_array(_record_quest_event_and_maybe_claim({
			"type": "use_world_item",
			"itemId": str(result.get("itemId", item_id)),
			"targetType": "pet",
			"amount": 1,
		}))
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message("\n".join(log_lines))
	backpack_pending_use_item_id = item_id if PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0 else ""
	_refresh_backpack_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _open_shop_panel(next_shop_id: String = "") -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	var resolved_shop_id := next_shop_id if next_shop_id != "" else ShopCatalogModel.DEFAULT_SHOP_ID
	if ShopCatalogModel.shop_for_id(resolved_shop_id).is_empty():
		resolved_shop_id = ShopCatalogModel.DEFAULT_SHOP_ID
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	shop_active_id = resolved_shop_id
	shop_mode = "buy"
	shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_shop_panel()
	_layout_hud()


func _close_shop_panel() -> void:
	if shop_panel != null:
		shop_panel.visible = false
	shop_selected_item_id = ""
	if hud_root != null:
		_layout_hud()


func _set_shop_mode(next_mode: String) -> void:
	shop_mode = "sell" if next_mode == "sell" else "buy"
	shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_quantity = 1
	_refresh_shop_panel()


func _select_shop_item(item_id: String) -> void:
	shop_selected_item_id = item_id
	shop_quantity = 1
	_refresh_shop_panel()


func _refresh_shop_panel() -> void:
	if shop_panel == null or shop_list_container == null or shop_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	if shop_title_label != null:
		shop_title_label.text = ShopCatalogModel.label_for(shop_active_id)
	if shop_coin_label != null:
		shop_coin_label.text = "石币 %d" % PlayerProgressModel.stone_coins(player_profile)
	if shop_buy_button != null:
		shop_buy_button.button_pressed = shop_mode == "buy"
	if shop_sell_button != null:
		shop_sell_button.button_pressed = shop_mode == "sell"
	var valid_ids := _shop_item_ids_for_mode(shop_mode)
	if shop_selected_item_id == "" or not valid_ids.has(shop_selected_item_id):
		shop_selected_item_id = valid_ids[0] if not valid_ids.is_empty() else ""
	for child in shop_list_container.get_children():
		child.queue_free()
	shop_item_buttons.clear()
	if valid_ids.is_empty():
		var empty_label := Label.new()
		empty_label.text = "暂无可%s的道具" % ("出售" if shop_mode == "sell" else "购买")
		empty_label.add_theme_font_size_override("font_size", 16)
		shop_list_container.add_child(empty_label)
	else:
		for item_id in valid_ids:
			var button := Button.new()
			button.toggle_mode = true
			button.button_pressed = item_id == shop_selected_item_id
			button.text = _shop_item_button_text(item_id)
			button.custom_minimum_size = Vector2(0, 58)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			button.pressed.connect(func() -> void:
				_select_shop_item(item_id)
			)
			shop_list_container.add_child(button)
			shop_item_buttons[item_id] = button
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id)
	shop_detail_label.text = _shop_detail_text(shop_selected_item_id)
	_refresh_shop_quantity_controls()
	if shop_action_button != null:
		shop_action_button.text = _shop_action_text()
		shop_action_button.disabled = shop_selected_item_id == "" or _shop_quantity_max(shop_selected_item_id) <= 0
	if shop_repair_button != null:
		var repair_quote := PlayerProgressModel.equipment_repair_quote(player_profile)
		var missing_durability := int(repair_quote.get("missingDurability", 0))
		var repair_cost := int(repair_quote.get("cost", 0))
		shop_repair_button.visible = shop_active_id == FIREBUD_EQUIPMENT_SHOP_ID
		shop_repair_button.text = "修理 %d石币" % repair_cost if missing_durability > 0 else "修理"
		shop_repair_button.disabled = missing_durability <= 0 or PlayerProgressModel.stone_coins(player_profile) < repair_cost


func _shop_item_ids_for_mode(mode: String) -> Array[String]:
	var result: Array[String] = []
	if mode == "sell":
		var counts := BackpackModel.counts_by_item(PlayerProgressModel.backpack_slots(player_profile))
		for entry in ShopCatalogModel.entries_for(shop_active_id):
			var item_id := str(entry.get("itemId", ""))
			if item_id != "" and ShopCatalogModel.is_sellable(shop_active_id, item_id) and int(counts.get(item_id, 0)) > 0:
				result.append(item_id)
	else:
		for entry in ShopCatalogModel.buyable_entries_for(shop_active_id):
			var item_id := str(entry.get("itemId", ""))
			if item_id != "":
				result.append(item_id)
	return result


func _first_shop_item_id_for_mode(mode: String) -> String:
	var ids := _shop_item_ids_for_mode(mode)
	return ids[0] if not ids.is_empty() else ""


func _shop_item_button_text(item_id: String) -> String:
	var count := PlayerProgressModel.backpack_item_count(player_profile, item_id)
	if shop_mode == "sell":
		return "%s\n可卖 %d石币    持有 %d" % [
			BackpackModel.menu_label_for(item_id),
			ShopCatalogModel.sell_price_for(shop_active_id, item_id),
			count,
		]
	return "%s\n%d石币    持有 %d" % [
		BackpackModel.menu_label_for(item_id),
		ShopCatalogModel.buy_price_for(shop_active_id, item_id),
		count,
	]


func _shop_detail_text(item_id: String) -> String:
	if item_id == "":
		return "请选择道具。"
	var count := PlayerProgressModel.backpack_item_count(player_profile, item_id)
	var lines: Array[String] = []
	lines.append("%s x%d" % [BackpackModel.label_for(item_id), count])
	lines.append("购买单价: %d石币    出售单价: %d石币" % [
		ShopCatalogModel.buy_price_for(shop_active_id, item_id),
		ShopCatalogModel.sell_price_for(shop_active_id, item_id),
	])
	if EquipmentModel.is_equipment(item_id):
		lines.append_array(_equipment_detail_lines_with_requirement_status(item_id, false))
	return "\n".join(lines)


func _shop_quantity_max(item_id: String) -> int:
	if item_id == "":
		return 0
	if shop_mode == "sell":
		return PlayerProgressModel.backpack_item_count(player_profile, item_id)
	var buy_price := ShopCatalogModel.buy_price_for(shop_active_id, item_id)
	if buy_price <= 0:
		return 0
	var affordable := int(floor(float(PlayerProgressModel.stone_coins(player_profile)) / float(buy_price)))
	var capacity := BackpackModel.available_capacity_for(PlayerProgressModel.backpack_slots(player_profile), item_id)
	return mini(999, mini(affordable, capacity))


func _clamped_shop_quantity(value: int, item_id: String) -> int:
	var max_quantity := _shop_quantity_max(item_id)
	if max_quantity <= 0:
		return 1
	return clampi(value, 1, max_quantity)


func _set_shop_quantity(value: int) -> void:
	shop_quantity = _clamped_shop_quantity(value, shop_selected_item_id)
	_refresh_shop_panel()


func _refresh_shop_quantity_controls() -> void:
	var max_quantity := _shop_quantity_max(shop_selected_item_id)
	var controls_enabled := shop_selected_item_id != "" and max_quantity > 0
	if shop_quantity_spinbox != null:
		shop_quantity_spinbox.set_block_signals(true)
		shop_quantity_spinbox.min_value = 1
		shop_quantity_spinbox.max_value = maxf(1.0, float(max_quantity))
		shop_quantity_spinbox.value = float(shop_quantity)
		shop_quantity_spinbox.editable = controls_enabled
		shop_quantity_spinbox.set_block_signals(false)
	if shop_quantity_minus_button != null:
		shop_quantity_minus_button.disabled = not controls_enabled or shop_quantity <= 1
	if shop_quantity_plus_button != null:
		shop_quantity_plus_button.disabled = not controls_enabled or shop_quantity >= max_quantity
	if shop_quantity_max_button != null:
		shop_quantity_max_button.disabled = not controls_enabled or shop_quantity >= max_quantity


func _shop_action_text() -> String:
	if shop_selected_item_id == "":
		return "出售" if shop_mode == "sell" else "购买"
	var unit_price := ShopCatalogModel.sell_price_for(shop_active_id, shop_selected_item_id) if shop_mode == "sell" else ShopCatalogModel.buy_price_for(shop_active_id, shop_selected_item_id)
	var total_price := unit_price * shop_quantity
	if shop_mode == "sell":
		return "出售 x%d（%d石币）" % [shop_quantity, total_price]
	return "购买 x%d（%d石币）" % [shop_quantity, total_price]


func _on_shop_action_pressed() -> void:
	if shop_selected_item_id == "":
		return
	var result := PlayerProgressModel.sell_shop_item(player_profile, shop_active_id, shop_selected_item_id, shop_quantity) if shop_mode == "sell" else PlayerProgressModel.buy_shop_item(player_profile, shop_active_id, shop_selected_item_id, shop_quantity)
	player_profile = result.get("profile", player_profile)
	var log_lines: Array[String] = [str(result.get("message", ""))]
	if bool(result.get("ok", false)) and shop_mode == "buy":
		log_lines.append_array(_record_quest_event_and_maybe_claim({
			"type": "buy_item",
			"shopId": shop_active_id,
			"itemId": str(result.get("itemId", shop_selected_item_id)),
			"amount": maxi(1, int(result.get("amount", shop_quantity))),
		}))
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message("\n".join(log_lines))
	if shop_mode == "sell" and PlayerProgressModel.backpack_item_count(player_profile, shop_selected_item_id) <= 0:
		shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id)
	_refresh_shop_panel()
	if status_label != null:
		_update_hud_text()


func _on_shop_repair_pressed() -> void:
	var result := PlayerProgressModel.repair_all_equipment(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_shop_panel()
	if equipment_panel != null and equipment_panel.visible:
		_refresh_equipment_panel()
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()
	if status_label != null:
		_update_hud_text()


func _create_pet_skill_panel() -> void:
	pet_skill_panel = _panel_container("PetSkillPanel")
	pet_skill_panel.visible = false
	pet_skill_panel.z_index = 25
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	pet_skill_panel.add_child(column)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	column.add_child(header)
	pet_skill_title_label = Label.new()
	pet_skill_title_label.text = "宠物技能"
	pet_skill_title_label.add_theme_font_size_override("font_size", 21)
	pet_skill_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(pet_skill_title_label)
	pet_skill_close_button = Button.new()
	pet_skill_close_button.text = "关闭"
	pet_skill_close_button.custom_minimum_size = Vector2(92, 44)
	pet_skill_close_button.pressed.connect(_close_pet_skill_panel)
	header.add_child(pet_skill_close_button)

	var selector_row := HBoxContainer.new()
	selector_row.add_theme_constant_override("separation", 8)
	column.add_child(selector_row)
	var selector_label := Label.new()
	selector_label.text = "宠物"
	selector_label.custom_minimum_size = Vector2(52, 40)
	selector_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	selector_row.add_child(selector_label)
	pet_skill_pet_option = OptionButton.new()
	pet_skill_pet_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_pet_option.custom_minimum_size = Vector2(0, 40)
	pet_skill_pet_option.item_selected.connect(_on_pet_skill_pet_selected)
	selector_row.add_child(pet_skill_pet_option)

	var body := HBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	column.add_child(body)

	pet_skill_slot_grid = GridContainer.new()
	pet_skill_slot_grid.columns = 2
	pet_skill_slot_grid.custom_minimum_size = Vector2(250, 0)
	pet_skill_slot_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_skill_slot_grid.add_theme_constant_override("h_separation", 8)
	pet_skill_slot_grid.add_theme_constant_override("v_separation", 8)
	body.add_child(pet_skill_slot_grid)
	for slot in range(1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS + 1):
		var button := Button.new()
		button.toggle_mode = true
		button.custom_minimum_size = Vector2(118, 54)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 15)
		button.pressed.connect(_select_pet_skill_slot.bind(slot))
		pet_skill_slot_grid.add_child(button)
		pet_skill_slot_buttons[slot] = button

	var detail_column := VBoxContainer.new()
	detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_column.add_theme_constant_override("separation", 8)
	body.add_child(detail_column)
	var detail_scroll := ScrollContainer.new()
	detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_column.add_child(detail_scroll)
	pet_skill_detail_label = Label.new()
	pet_skill_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pet_skill_detail_label.add_theme_font_size_override("font_size", 16)
	pet_skill_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.add_child(pet_skill_detail_label)

	var move_row := HBoxContainer.new()
	move_row.add_theme_constant_override("separation", 8)
	detail_column.add_child(move_row)
	pet_skill_move_up_button = Button.new()
	pet_skill_move_up_button.text = "上移"
	pet_skill_move_up_button.custom_minimum_size = Vector2(0, 44)
	pet_skill_move_up_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_move_up_button.pressed.connect(func() -> void:
		_on_pet_skill_move_pressed(-1)
	)
	move_row.add_child(pet_skill_move_up_button)
	pet_skill_move_down_button = Button.new()
	pet_skill_move_down_button.text = "下移"
	pet_skill_move_down_button.custom_minimum_size = Vector2(0, 44)
	pet_skill_move_down_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_move_down_button.pressed.connect(func() -> void:
		_on_pet_skill_move_pressed(1)
	)
	move_row.add_child(pet_skill_move_down_button)
	pet_skill_forget_button = Button.new()
	pet_skill_forget_button.text = "遗忘"
	pet_skill_forget_button.custom_minimum_size = Vector2(0, 44)
	pet_skill_forget_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_forget_button.pressed.connect(_on_pet_skill_forget_pressed)
	move_row.add_child(pet_skill_forget_button)

	var learn_row := HBoxContainer.new()
	learn_row.add_theme_constant_override("separation", 8)
	detail_column.add_child(learn_row)
	pet_skill_learn_option = OptionButton.new()
	pet_skill_learn_option.custom_minimum_size = Vector2(0, 44)
	pet_skill_learn_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	learn_row.add_child(pet_skill_learn_option)
	pet_skill_learn_button = Button.new()
	pet_skill_learn_button.text = "学习"
	pet_skill_learn_button.custom_minimum_size = Vector2(96, 44)
	pet_skill_learn_button.pressed.connect(_on_pet_skill_learn_pressed)
	learn_row.add_child(pet_skill_learn_button)
	hud_root.add_child(pet_skill_panel)


func _open_pet_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	pet_panel.visible = true
	var active := PlayerProgressModel.active_pet(player_profile)
	if pet_selected_instance_id == "" or PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id).is_empty():
		pet_selected_instance_id = str(active.get("instanceId", ""))
	_refresh_pet_panel()
	_layout_hud()


func _close_pet_panel() -> void:
	if pet_panel != null:
		pet_panel.visible = false
	_close_pet_rename_panel()
	if hud_root != null:
		_layout_hud()


func _open_pet_skill_panel(training_mode: bool = false, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	pet_skill_training_mode = training_mode
	pet_skill_trainer_id = trainer_id if trainer_id != "" else PetSkillTrainingModel.DEFAULT_TRAINER_ID
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	if pet_selected_instance_id == "" or PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id).is_empty():
		var active := PlayerProgressModel.active_pet(player_profile)
		if not active.is_empty():
			pet_selected_instance_id = str(active.get("instanceId", ""))
		else:
			for instance in PlayerProgressModel.all_pet_instances(player_profile):
				pet_selected_instance_id = str(instance.get("instanceId", ""))
				break
	pet_skill_selected_slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	pet_skill_panel.visible = true
	_refresh_pet_skill_panel()
	_layout_hud()


func _close_pet_skill_panel() -> void:
	if pet_skill_panel != null:
		pet_skill_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _refresh_pet_skill_panel() -> void:
	if pet_skill_panel == null or pet_skill_pet_option == null or pet_skill_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var all_instances := PlayerProgressModel.all_pet_instances(player_profile)
	if pet_selected_instance_id != "" and PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id).is_empty():
		pet_selected_instance_id = ""
	if pet_selected_instance_id == "" and not all_instances.is_empty():
		pet_selected_instance_id = str(all_instances[0].get("instanceId", ""))
	if pet_skill_title_label != null:
		pet_skill_title_label.text = "%s：%s" % ["宠技训练" if pet_skill_training_mode else "宠物技能", PetSkillTrainingModel.trainer_label(pet_skill_trainer_id) if pet_skill_training_mode else "技能槽"]
	_sync_pet_skill_pet_option(all_instances)
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	_refresh_pet_skill_slots(selected)
	_refresh_pet_skill_detail(selected)
	_refresh_pet_skill_learn_controls(selected)


func _sync_pet_skill_pet_option(instances: Array[Dictionary]) -> void:
	pet_skill_pet_option.clear()
	var selected_index := 0
	for index in range(instances.size()):
		var instance := instances[index]
		var instance_id := str(instance.get("instanceId", ""))
		var label := "%s Lv%d %s" % [
			str(instance.get("name", "宠物")),
			int(instance.get("level", 1)),
			PlayerProgressModel.state_label(str(instance.get("state", PlayerProgressModel.PET_STATE_STANDBY))),
		]
		pet_skill_pet_option.add_item(label, index)
		pet_skill_pet_option.set_item_metadata(index, instance_id)
		if instance_id == pet_selected_instance_id:
			selected_index = index
	if pet_skill_pet_option.get_item_count() > 0:
		pet_skill_pet_option.select(selected_index)
	pet_skill_pet_option.disabled = pet_skill_pet_option.get_item_count() <= 1


func _refresh_pet_skill_slots(selected: Dictionary) -> void:
	var options := PlayerProgressModel.pet_skill_slot_options_for_instance(selected) if not selected.is_empty() else []
	for slot in range(1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS + 1):
		var button = pet_skill_slot_buttons.get(slot, null)
		if button == null:
			continue
		var button_ref := button as Button
		var label := "未配置"
		var skill_id := ""
		if slot - 1 < options.size():
			var option := options[slot - 1] as Dictionary
			label = str(option.get("label", "未配置"))
			skill_id = str(option.get("skillId", ""))
		button_ref.text = "技%d\n%s" % [slot, label]
		button_ref.disabled = selected.is_empty()
		button_ref.button_pressed = slot == pet_skill_selected_slot
		button_ref.tooltip_text = label if skill_id != "" else "空技能位"


func _refresh_pet_skill_detail(selected: Dictionary) -> void:
	if selected.is_empty():
		pet_skill_detail_label.text = "请选择宠物。"
		_sync_pet_skill_move_buttons(selected, "")
		return
	var slot := clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var slots := PlayerProgressModel.pet_skill_slots_for_instance(selected)
	var skill_id := str(slots[slot - 1]) if slot - 1 < slots.size() else ""
	var lines: Array[String] = []
	lines.append("%s  Lv%d  %s" % [
		str(selected.get("name", "宠物")),
		int(selected.get("level", 1)),
		PlayerProgressModel.state_label(str(selected.get("state", PlayerProgressModel.PET_STATE_STANDBY))),
	])
	lines.append("当前：技%d" % slot)
	if skill_id == "":
		lines.append("技能：未配置")
	else:
		lines.append("技能：%s" % BattleActionCatalog.label_for(skill_id, skill_id))
		lines.append("说明：%s" % PetSkillTrainingModel.skill_description(skill_id))
		var effect_type := BattleActionCatalog.effect_type_for(skill_id)
		if effect_type == "damage":
			lines.append("效果：物理伤害 +%d" % BattleActionCatalog.effect_amount_bonus_for(skill_id, 0))
		elif effect_type == "status":
			lines.append("效果：异常状态，命中率约%d%%" % int(round(BattleActionCatalog.effect_status_hit_rate_for(skill_id, 1.0) * 100.0)))
		elif effect_type == "defend":
			lines.append("效果：本回合防御。")
	lines.append("石币：%d" % PlayerProgressModel.stone_coins(player_profile))
	pet_skill_detail_label.text = "\n".join(lines)
	_sync_pet_skill_move_buttons(selected, skill_id)


func _sync_pet_skill_move_buttons(selected: Dictionary, skill_id: String) -> void:
	var has_skill := not selected.is_empty() and skill_id != ""
	if pet_skill_move_up_button != null:
		pet_skill_move_up_button.disabled = not has_skill or pet_skill_selected_slot <= 1
	if pet_skill_move_down_button != null:
		pet_skill_move_down_button.disabled = not has_skill or pet_skill_selected_slot >= PetTemplateCatalog.MAX_PET_SKILL_SLOTS
	if pet_skill_forget_button != null:
		pet_skill_forget_button.visible = pet_skill_training_mode
		var forget_check := PlayerProgressModel.can_forget_pet_skill(player_profile, pet_selected_instance_id, skill_id) if pet_skill_training_mode and has_skill else {"ok": false, "message": "请选择要遗忘的技能。"}
		pet_skill_forget_button.disabled = not bool(forget_check.get("ok", false))
		pet_skill_forget_button.tooltip_text = str(forget_check.get("message", ""))


func _refresh_pet_skill_learn_controls(selected: Dictionary) -> void:
	if pet_skill_learn_option == null or pet_skill_learn_button == null:
		return
	pet_skill_learn_option.visible = pet_skill_training_mode
	pet_skill_learn_button.visible = pet_skill_training_mode
	if not pet_skill_training_mode:
		return
	pet_skill_learn_option.clear()
	var learnable_count := 0
	if not selected.is_empty():
		for option in PlayerProgressModel.learnable_pet_skill_options(player_profile, pet_selected_instance_id, pet_skill_trainer_id):
			if bool(option.get("learned", false)):
				continue
			var skill_id := str(option.get("id", ""))
			if skill_id == "":
				continue
			var cost := int(option.get("cost", PetSkillTrainingModel.DEFAULT_COST))
			pet_skill_learn_option.add_item("%s  %d石币" % [str(option.get("label", skill_id)), cost], learnable_count)
			pet_skill_learn_option.set_item_metadata(learnable_count, skill_id)
			learnable_count += 1
	if learnable_count == 0:
		pet_skill_learn_option.add_item("没有可学技能", 0)
		pet_skill_learn_option.set_item_metadata(0, "")
		pet_skill_learn_button.disabled = true
	else:
		pet_skill_learn_option.select(0)
		pet_skill_learn_button.disabled = selected.is_empty() or not _pet_skill_has_empty_slot(selected)


func _pet_skill_has_empty_slot(instance: Dictionary) -> bool:
	for option in PlayerProgressModel.pet_skill_slot_options_for_instance(instance):
		if str(option.get("skillId", "")) == "":
			return true
	return false


func _on_pet_skill_pet_selected(index: int) -> void:
	if pet_skill_pet_option == null or index < 0 or index >= pet_skill_pet_option.get_item_count():
		return
	pet_selected_instance_id = str(pet_skill_pet_option.get_item_metadata(index))
	pet_skill_selected_slot = 1
	_refresh_pet_skill_panel()


func _select_pet_skill_slot(slot: int) -> void:
	pet_skill_selected_slot = clampi(slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	_refresh_pet_skill_panel()


func _on_pet_skill_move_pressed(direction: int) -> void:
	var result := PlayerProgressModel.move_pet_skill_slot(player_profile, pet_selected_instance_id, pet_skill_selected_slot, direction)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _on_pet_skill_learn_pressed() -> void:
	if pet_skill_learn_option == null or pet_skill_learn_option.get_item_count() <= 0:
		return
	var index := pet_skill_learn_option.selected
	var skill_id := str(pet_skill_learn_option.get_item_metadata(index))
	if skill_id == "":
		return
	var result := PlayerProgressModel.learn_pet_skill(player_profile, pet_selected_instance_id, skill_id, pet_skill_trainer_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _on_pet_skill_forget_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var slots := PlayerProgressModel.pet_skill_slots_for_instance(selected)
	var slot := clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var skill_id := str(slots[slot - 1]) if slot - 1 < slots.size() else ""
	if skill_id == "":
		return
	var result := PlayerProgressModel.forget_pet_skill(player_profile, pet_selected_instance_id, skill_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _open_codex_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	codex_panel.visible = true
	_refresh_codex_panel()
	_layout_hud()


func _close_codex_panel() -> void:
	if codex_panel != null:
		codex_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _open_quest_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	quest_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_quest_panel()
	_layout_hud()


func _close_quest_panel() -> void:
	if quest_panel != null:
		quest_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _open_training_partner_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_auto_settings_panel()
	training_partner_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_training_partner_panel()
	_layout_hud()


func _close_training_partner_panel() -> void:
	if training_partner_panel != null:
		training_partner_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _refresh_training_partner_panel() -> void:
	if training_partner_panel == null or training_partner_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var count := PlayerProgressModel.training_partner_count(player_profile)
	var lines: Array[String] = []
	lines.append("队伍：%d/4" % count)
	lines.append("草丛遇敌时，会组成最多 5 人 5 宠的练级队。")
	lines.append("陪练会复制加入时的人物和出战宠属性，之后独立获得经验。")
	lines.append("")
	lines.append_array(PlayerProgressModel.training_partner_summary_lines(player_profile))
	training_partner_label.text = "\n".join(lines)
	if training_partner_add_button != null:
		training_partner_add_button.disabled = count >= 4
	if training_partner_remove_button != null:
		training_partner_remove_button.disabled = count <= 0
	if training_partner_fill_button != null:
		training_partner_fill_button.disabled = count >= 4
	if training_partner_clear_button != null:
		training_partner_clear_button.disabled = count <= 0


func _set_training_partner_count(count: int) -> void:
	player_profile = PlayerProgressModel.with_training_partner_count(player_profile, count)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	var next_count := PlayerProgressModel.training_partner_count(player_profile)
	_set_world_log_message("练级伙伴 %d/4。" % next_count)
	_refresh_training_partner_panel()
	_update_hud_text()


func _on_training_partner_add_pressed() -> void:
	_set_training_partner_count(PlayerProgressModel.training_partner_count(player_profile) + 1)


func _on_training_partner_remove_pressed() -> void:
	_set_training_partner_count(PlayerProgressModel.training_partner_count(player_profile) - 1)


func _on_training_partner_fill_pressed() -> void:
	_set_training_partner_count(4)


func _on_training_partner_clear_pressed() -> void:
	_set_training_partner_count(0)


func _open_auto_settings_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_training_partner_panel()
	auto_settings_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_auto_settings_panel()
	_layout_hud()


func _close_auto_settings_panel() -> void:
	if auto_settings_panel != null:
		auto_settings_panel.visible = false
	if hud_root != null:
		_layout_hud()


func _refresh_auto_settings_panel() -> void:
	if auto_settings_panel == null or auto_settings_content == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	auto_settings_controls.clear()
	for child in auto_settings_content.get_children():
		child.queue_free()
	_apply_auto_settings_tab_buttons()
	if auto_settings_active_tab == "hang":
		_refresh_hang_settings_tab()
	elif auto_settings_active_tab == "capture":
		_refresh_auto_capture_settings_tab()
	else:
		_refresh_auto_battle_settings_tab()


func _refresh_auto_battle_settings_tab() -> void:
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	var player_action_options := _auto_settings_player_action_options()
	_add_auto_settings_section("人物动作")
	_add_auto_settings_option(
		"首回合",
		AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY,
		player_action_options,
		str(settings.get(AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY, AutoBattleSettingsModel.ACTION_ATTACK))
	)
	_add_auto_settings_option(
		"一般回合",
		AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY,
		player_action_options,
		str(settings.get(AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY, AutoBattleSettingsModel.ACTION_ATTACK))
	)
	_add_auto_settings_section("宠物动作")
	_add_auto_settings_pet_slot_option(
		"首回合",
		AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY,
		int(settings.get(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY, 1))
	)
	_add_auto_settings_pet_slot_option(
		"一般回合",
		AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY,
		int(settings.get(AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY, 1))
	)
	_add_auto_settings_section("目标与回血")
	_add_auto_settings_option(
		"攻击目标",
		AutoBattleSettingsModel.TARGET_MODE_KEY,
		AutoBattleSettingsModel.target_mode_options(),
		str(settings.get(AutoBattleSettingsModel.TARGET_MODE_KEY, AutoBattleSettingsModel.TARGET_FIRST_LIVING))
	)
	_add_auto_settings_checkbox(
		"自动回血",
		AutoBattleSettingsModel.HEALING_ENABLED_KEY,
		bool(settings.get(AutoBattleSettingsModel.HEALING_ENABLED_KEY, true))
	)
	_add_auto_settings_spinbox(
		"人物血线",
		AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY,
		int(settings.get(AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY, 45)),
		"%"
	)
	_add_auto_settings_spinbox(
		"宠物血线",
		AutoBattleSettingsModel.PET_HP_PERCENT_KEY,
		int(settings.get(AutoBattleSettingsModel.PET_HP_PERCENT_KEY, 45)),
		"%"
	)
	_add_auto_settings_section("回血优先级")
	var heal_priority := _auto_settings_heal_priority_slots(settings)
	for index in range(AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS):
		_add_auto_settings_heal_option(index, str(heal_priority[index]))


func _refresh_hang_settings_tab() -> void:
	var settings := PlayerProgressModel.hang_settings(player_profile)
	_add_auto_settings_section("挂机")
	_add_auto_settings_option(
		"低血停止",
		HangSettingsModel.LOW_HP_STOP_PERCENT_KEY,
		HangSettingsModel.low_hp_stop_options(),
		str(settings.get(HangSettingsModel.LOW_HP_STOP_PERCENT_KEY, HangSettingsModel.STOP_ON_DEATH))
	)
	var button_row := HBoxContainer.new()
	button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button_row.add_theme_constant_override("separation", 8)
	auto_settings_content.add_child(button_row)
	var save_button := Button.new()
	save_button.text = "保存"
	save_button.custom_minimum_size = Vector2(0, 44)
	save_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	save_button.pressed.connect(func() -> void:
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		_set_world_log_message("挂机设置已保存。")
	)
	button_row.add_child(save_button)
	auto_settings_controls["hangSaveButton"] = save_button
	var start_button := Button.new()
	start_button.text = "开始挂机"
	start_button.custom_minimum_size = Vector2(0, 44)
	start_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start_button.pressed.connect(func() -> void:
		_close_auto_settings_panel()
		_start_hang_walk()
	)
	button_row.add_child(start_button)
	auto_settings_controls["hangStartButton"] = start_button
	var close_button := Button.new()
	close_button.text = "关闭"
	close_button.custom_minimum_size = Vector2(0, 44)
	close_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	close_button.pressed.connect(_close_auto_settings_panel)
	button_row.add_child(close_button)
	auto_settings_controls["hangCloseButton"] = close_button


func _refresh_auto_capture_settings_tab() -> void:
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	_add_auto_settings_section("自动捉宠")
	_add_auto_settings_checkbox(
		"自动捉宠",
		AutoCaptureSettingsModel.ENABLED_KEY,
		bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false))
	)
	_add_auto_settings_option(
		"目标",
		AutoCaptureSettingsModel.TARGET_MODE_KEY,
		AutoCaptureSettingsModel.target_mode_options(),
		str(settings.get(AutoCaptureSettingsModel.TARGET_MODE_KEY, AutoCaptureSettingsModel.TARGET_ALL))
	)
	_add_auto_settings_option(
		"图鉴",
		AutoCaptureSettingsModel.TARGET_FORM_ID_KEY,
		_auto_capture_form_options(),
		str(settings.get(AutoCaptureSettingsModel.TARGET_FORM_ID_KEY, ""))
	)
	_add_auto_settings_line_edit(
		"手动输入",
		AutoCaptureSettingsModel.TARGET_MANUAL_TEXT_KEY,
		str(settings.get(AutoCaptureSettingsModel.TARGET_MANUAL_TEXT_KEY, ""))
	)
	_add_auto_settings_section("捕捉条件")
	_add_auto_settings_int_spinbox(
		"血量低于",
		AutoCaptureSettingsModel.HP_PERCENT_KEY,
		int(settings.get(AutoCaptureSettingsModel.HP_PERCENT_KEY, AutoCaptureSettingsModel.MAX_HP_PERCENT)),
		AutoCaptureSettingsModel.MIN_HP_PERCENT,
		AutoCaptureSettingsModel.MAX_HP_PERCENT,
		"%"
	)
	var level_row := _auto_settings_row("等级")
	var comparator := OptionButton.new()
	comparator.custom_minimum_size = Vector2(86, 40)
	comparator.add_theme_font_size_override("font_size", 15)
	var comparator_options := AutoCaptureSettingsModel.level_comparator_options()
	var selected_comparator := str(settings.get(AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY, AutoCaptureSettingsModel.COMPARATOR_EQ))
	var selected_comparator_index := 0
	for index in range(comparator_options.size()):
		var option_entry := comparator_options[index] as Dictionary
		var option_id := str(option_entry.get("id", ""))
		comparator.add_item(str(option_entry.get("label", option_id)), index)
		comparator.set_item_metadata(index, option_id)
		if option_id == selected_comparator:
			selected_comparator_index = index
	comparator.select(selected_comparator_index)
	comparator.item_selected.connect(func(index: int) -> void:
		_set_auto_settings_value(AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY, str(comparator.get_item_metadata(index)))
	)
	level_row.add_child(comparator)
	auto_settings_controls[AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY] = comparator
	var level_spinbox := SpinBox.new()
	level_spinbox.min_value = AutoCaptureSettingsModel.MIN_LEVEL
	level_spinbox.max_value = AutoCaptureSettingsModel.MAX_LEVEL
	level_spinbox.step = 1
	level_spinbox.rounded = true
	level_spinbox.prefix = "Lv"
	level_spinbox.value = float(clampi(int(settings.get(AutoCaptureSettingsModel.LEVEL_VALUE_KEY, AutoCaptureSettingsModel.MIN_LEVEL)), AutoCaptureSettingsModel.MIN_LEVEL, AutoCaptureSettingsModel.MAX_LEVEL))
	level_spinbox.custom_minimum_size = Vector2(0, 40)
	level_spinbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	level_spinbox.add_theme_font_size_override("font_size", 15)
	level_spinbox.value_changed.connect(func(next_value: float) -> void:
		_set_auto_settings_value(AutoCaptureSettingsModel.LEVEL_VALUE_KEY, int(next_value))
	)
	level_row.add_child(level_spinbox)
	auto_settings_controls[AutoCaptureSettingsModel.LEVEL_VALUE_KEY] = level_spinbox
	_add_auto_settings_section("工具与筛选")
	_add_auto_settings_option(
		"工具优先",
		AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY,
		AutoCaptureSettingsModel.capture_tool_options(),
		str(settings.get(AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY, CaptureToolCatalog.EMPTY_HAND_ID))
	)
	_add_auto_settings_option(
		"无匹配时",
		AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY,
		AutoCaptureSettingsModel.no_target_action_options(),
		str(settings.get(AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY, AutoCaptureSettingsModel.NO_TARGET_ESCAPE))
	)
	_add_auto_settings_pet_slot_option(
		"宠物技能",
		AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY,
		int(settings.get(AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY, AutoCaptureSettingsModel.DEFAULT_CAPTURE_PET_SLOT))
	)
	_add_auto_settings_checkbox(
		"低战力丢弃",
		AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY,
		bool(settings.get(AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY, true))
	)
	_add_auto_settings_int_spinbox(
		"丢弃低于",
		AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY,
		int(settings.get(AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY, AutoCaptureSettingsModel.DEFAULT_LOW_POWER_THRESHOLD)),
		AutoCaptureSettingsModel.MIN_POWER,
		AutoCaptureSettingsModel.MAX_POWER,
		"战力"
	)


func _set_auto_settings_tab(tab: String) -> void:
	auto_settings_active_tab = tab if ["battle", "hang", "capture"].has(tab) else "battle"
	_refresh_auto_settings_panel()


func _apply_auto_settings_tab_buttons() -> void:
	if auto_settings_battle_tab_button != null:
		auto_settings_battle_tab_button.button_pressed = auto_settings_active_tab == "battle"
	if auto_settings_hang_tab_button != null:
		auto_settings_hang_tab_button.button_pressed = auto_settings_active_tab == "hang"
	if auto_settings_capture_tab_button != null:
		auto_settings_capture_tab_button.button_pressed = auto_settings_active_tab == "capture"


func _add_auto_settings_section(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color(0.95, 0.86, 0.48, 1.0))
	label.custom_minimum_size = Vector2(0, 26)
	auto_settings_content.add_child(label)


func _add_auto_settings_option(label_text: String, key: String, options: Array[Dictionary], selected_id: String) -> OptionButton:
	var row := _auto_settings_row(label_text)
	var option := OptionButton.new()
	option.custom_minimum_size = Vector2(0, 40)
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 15)
	var selected_index := 0
	for index in range(options.size()):
		var option_entry := options[index] as Dictionary
		var option_id := str(option_entry.get("id", ""))
		option.add_item(str(option_entry.get("label", option_id)), index)
		option.set_item_metadata(index, option_id)
		if option_id == selected_id:
			selected_index = index
	option.select(selected_index)
	option.item_selected.connect(func(index: int) -> void:
		_set_auto_settings_value(key, str(option.get_item_metadata(index)))
	)
	row.add_child(option)
	auto_settings_controls[key] = option
	return option


func _add_auto_settings_pet_slot_option(label_text: String, key: String, selected_slot: int) -> OptionButton:
	var options := _auto_settings_pet_slot_options()
	var selected_id := str(AutoBattleSettingsModel.normalized_pet_skill_slot(selected_slot))
	return _add_auto_settings_option(label_text, key, options, selected_id)


func _add_auto_settings_checkbox(label_text: String, key: String, value: bool) -> CheckBox:
	var row := _auto_settings_row(label_text)
	var checkbox := CheckBox.new()
	checkbox.text = "开启"
	checkbox.button_pressed = value
	checkbox.custom_minimum_size = Vector2(0, 40)
	checkbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	checkbox.add_theme_font_size_override("font_size", 15)
	checkbox.toggled.connect(func(pressed: bool) -> void:
		_set_auto_settings_value(key, pressed)
	)
	row.add_child(checkbox)
	auto_settings_controls[key] = checkbox
	return checkbox


func _add_auto_settings_spinbox(label_text: String, key: String, value: int, suffix: String = "") -> SpinBox:
	return _add_auto_settings_int_spinbox(label_text, key, value, AutoBattleSettingsModel.MIN_HP_PERCENT, AutoBattleSettingsModel.MAX_HP_PERCENT, suffix)


func _add_auto_settings_int_spinbox(label_text: String, key: String, value: int, min_value: int, max_value: int, suffix: String = "") -> SpinBox:
	var row := _auto_settings_row(label_text)
	var spinbox := SpinBox.new()
	spinbox.min_value = min_value
	spinbox.max_value = max_value
	spinbox.step = 1
	spinbox.rounded = true
	spinbox.value = float(clampi(value, min_value, max_value))
	spinbox.suffix = suffix
	spinbox.custom_minimum_size = Vector2(0, 40)
	spinbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spinbox.add_theme_font_size_override("font_size", 15)
	spinbox.value_changed.connect(func(next_value: float) -> void:
		_set_auto_settings_value(key, int(next_value))
	)
	row.add_child(spinbox)
	auto_settings_controls[key] = spinbox
	return spinbox


func _add_auto_settings_line_edit(label_text: String, key: String, value: String) -> LineEdit:
	var row := _auto_settings_row(label_text)
	var line_edit := LineEdit.new()
	line_edit.text = value
	line_edit.placeholder_text = "可输入名字或图鉴ID"
	line_edit.custom_minimum_size = Vector2(0, 40)
	line_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line_edit.add_theme_font_size_override("font_size", 15)
	line_edit.text_changed.connect(func(next_text: String) -> void:
		_set_auto_settings_value(key, next_text)
	)
	row.add_child(line_edit)
	auto_settings_controls[key] = line_edit
	return line_edit


func _add_auto_settings_heal_option(index: int, selected_source_id: String) -> OptionButton:
	var options := _auto_settings_heal_source_options()
	var row_label := "优先%d" % [index + 1]
	var row := _auto_settings_row(row_label)
	var option := OptionButton.new()
	option.custom_minimum_size = Vector2(0, 40)
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 15)
	var selected_index := 0
	for option_index in range(options.size()):
		var option_entry := options[option_index] as Dictionary
		var option_id := str(option_entry.get("id", ""))
		option.add_item(str(option_entry.get("label", option_id)), option_index)
		option.set_item_metadata(option_index, option_id)
		if option_id == selected_source_id:
			selected_index = option_index
	option.select(selected_index)
	option.item_selected.connect(func(option_index: int) -> void:
		_set_auto_settings_heal_priority(index, str(option.get_item_metadata(option_index)))
	)
	row.add_child(option)
	auto_settings_controls["healPriority%d" % index] = option
	return option


func _auto_settings_row(label_text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	auto_settings_content.add_child(row)
	var label := Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(96, 40)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 15)
	row.add_child(label)
	return row


func _auto_settings_pet_slot_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	var active_pet := PlayerProgressModel.active_pet(player_profile)
	for slot in range(AutoBattleSettingsModel.MIN_PET_SKILL_SLOT, AutoBattleSettingsModel.MAX_PET_SKILL_SLOT + 1):
		var label := PlayerProgressModel.pet_skill_slot_label_for_instance(active_pet, slot, "未配置") if not active_pet.is_empty() else BattleActionCatalog.pet_skill_label_for_slot(slot, "未配置")
		options.append({
			"id": str(slot),
			"label": "技%d %s" % [slot, label],
		})
	return options


func _auto_settings_player_action_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = [
		{"id": AutoBattleSettingsModel.ACTION_ATTACK, "label": "攻击"},
		{"id": AutoBattleSettingsModel.ACTION_DEFEND, "label": "防御"},
	]
	for spirit_id in PlayerProgressModel.equipment_spirit_ids(player_profile):
		options.append({
			"id": spirit_id,
			"label": BattleActionCatalog.label_for(spirit_id, spirit_id),
		})
	for option in AutoBattleSettingsModel.player_action_options():
		var option_id := str(option.get("id", ""))
		if option_id.begins_with("item_"):
			options.append(option)
	return options


func _auto_settings_heal_source_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	var equipped_spirits := PlayerProgressModel.equipment_spirit_ids(player_profile)
	for option in AutoBattleSettingsModel.heal_source_options():
		var option_id := str(option.get("id", ""))
		if option_id == AutoBattleSettingsModel.HEAL_NONE:
			continue
		var action := BattleActionCatalog.action_by_id(option_id)
		if not action.is_empty() and str(action.get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT and not equipped_spirits.has(option_id):
			continue
		options.append(option)
	return options


func _auto_settings_heal_priority_slots(settings: Dictionary) -> Array[String]:
	var priority := AutoBattleSettingsModel.normalized_heal_priority(settings.get(AutoBattleSettingsModel.HEAL_PRIORITY_KEY, []))
	while priority.size() < AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS:
		priority.append(AutoBattleSettingsModel.HEAL_ITEM_MEAT)
	return priority.slice(0, AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS)


func _auto_capture_form_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = [{
		"id": "",
		"label": "未指定",
	}]
	for form in PetTemplateCatalog.forms():
		var form_id := str(form.get("formId", ""))
		if form_id == "":
			continue
		options.append({
			"id": form_id,
			"label": str(form.get("formName", form_id)),
		})
	return options


func _set_auto_settings_value(key: String, value) -> void:
	if key == HangSettingsModel.LOW_HP_STOP_PERCENT_KEY:
		_set_hang_settings_value(key, value)
		return
	if _auto_capture_settings_keys().has(key):
		_set_auto_capture_settings_value(key, value)
		return
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	settings[key] = int(value) if key == AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY or key == AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY else value
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)


func _auto_capture_settings_keys() -> Array[String]:
	return [
		AutoCaptureSettingsModel.ENABLED_KEY,
		AutoCaptureSettingsModel.TARGET_MODE_KEY,
		AutoCaptureSettingsModel.TARGET_FORM_ID_KEY,
		AutoCaptureSettingsModel.TARGET_MANUAL_TEXT_KEY,
		AutoCaptureSettingsModel.HP_PERCENT_KEY,
		AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY,
		AutoCaptureSettingsModel.LEVEL_VALUE_KEY,
		AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY,
		AutoCaptureSettingsModel.NO_TARGET_ACTION_KEY,
		AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY,
		AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY,
		AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY,
	]


func _set_auto_capture_settings_value(key: String, value) -> void:
	var settings := PlayerProgressModel.auto_capture_settings(player_profile)
	match key:
		AutoCaptureSettingsModel.ENABLED_KEY, AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY:
			settings[key] = bool(value)
		AutoCaptureSettingsModel.HP_PERCENT_KEY, AutoCaptureSettingsModel.LEVEL_VALUE_KEY, AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY, AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY:
			settings[key] = int(value)
		_:
			settings[key] = str(value)
	player_profile = PlayerProgressModel.with_auto_capture_settings(player_profile, settings)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)


func _set_hang_settings_value(key: String, value) -> void:
	var settings := PlayerProgressModel.hang_settings(player_profile)
	if key == HangSettingsModel.LOW_HP_STOP_PERCENT_KEY:
		settings[key] = HangSettingsModel.normalized_low_hp_stop_percent(value)
	player_profile = PlayerProgressModel.with_hang_settings(player_profile, settings)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)


func _set_auto_settings_heal_priority(index: int, source_id: String) -> void:
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	var priority := _auto_settings_heal_priority_slots(settings)
	if index >= 0 and index < priority.size():
		priority[index] = AutoBattleSettingsModel.normalized_heal_source(source_id)
	settings[AutoBattleSettingsModel.HEAL_PRIORITY_KEY] = priority
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_refresh_auto_settings_panel()


func _refresh_quest_panel() -> void:
	if quest_panel == null or quest_title_label == null or quest_detail_label == null:
		return
	var quest := PlayerProgressModel.active_quest(player_profile)
	if quest.is_empty():
		quest_title_label.text = "任务"
		quest_detail_label.text = "当前没有任务。\n可以继续探索、捕捉宠物，或等待新的任务链开放。"
		if quest_route_button != null:
			quest_route_button.text = "自动寻路"
			quest_route_button.disabled = true
		return
	quest_title_label.text = QuestModel.title_for(quest)
	var objective := QuestModel.objective_for(quest)
	var state := PlayerProgressModel.active_quest_state(player_profile)
	var reward_text := PlayerProgressModel.quest_reward_text(player_profile)
	var progress := int(state.get("progress", 0))
	var required := QuestModel.objective_required_count(quest)
	var status := str(state.get("status", QuestModel.STATUS_ACTIVE))
	var status_text := "进行中"
	if status == QuestModel.STATUS_READY:
		status_text = "可领取"
	elif status == QuestModel.STATUS_CLAIMED:
		status_text = "已完成"
	var lines: Array[String] = [
		"任务：%s" % QuestModel.title_for(quest),
		"状态：%s" % status_text,
		"目标：%s" % QuestModel.objective_text_for(quest),
		"进度：%d/%d" % [progress, required],
	]
	if reward_text != "":
		lines.append("奖励：%s" % reward_text)
	var route_hint := _quest_route_hint(quest, objective)
	if route_hint != "":
		lines.append("地点：%s" % route_hint)
	quest_detail_label.text = "\n".join(lines)
	if quest_route_button != null:
		quest_route_button.text = "自动寻路"
		quest_route_button.disabled = _active_quest_navigation_target().is_empty()


func _on_quest_route_pressed() -> void:
	var target := _active_quest_navigation_target()
	if target.is_empty():
		_set_world_log_message("当前任务没有可寻路目标。")
		return
	_close_quest_panel()
	_route_to_quest_target(target)


func _active_quest_navigation_target() -> Dictionary:
	var quest := PlayerProgressModel.active_quest(player_profile)
	if quest.is_empty():
		return {}
	if PlayerProgressModel.can_claim_active_quest(player_profile):
		return _navigation_target_for_interaction_id(QuestModel.turn_in_id_for(quest))
	var objective := QuestModel.objective_for(quest)
	match str(objective.get("type", "")):
		"talk":
			return _navigation_target_for_interaction_id(str(objective.get("targetId", QuestModel.turn_in_id_for(quest))))
		"buy_item":
			return _navigation_target_for_shop(str(objective.get("shopId", "")))
		"use_world_item":
			return _navigation_target_for_backpack(QuestModel.objective_text_for(quest))
		"equip_item":
			return _navigation_target_for_backpack(QuestModel.objective_text_for(quest))
		"battle_victory":
			return _navigation_target_for_encounter_group(str(objective.get("encounterGroupId", "")))
		"capture_pet":
			return _navigation_target_for_capture_objective(objective)
	return {}


func _quest_route_hint(quest: Dictionary, objective: Dictionary) -> String:
	var target := _active_quest_navigation_target()
	if target.is_empty():
		return ""
	var map_id := str(target.get("mapId", ""))
	var map_name := _map_name_for_id(map_id)
	var label := str(target.get("label", "目标"))
	if map_name == "":
		return label
	return "%s / %s" % [map_name, label]


func _route_to_quest_target(target: Dictionary) -> void:
	var target_map_id := str(target.get("mapId", ""))
	var label := str(target.get("label", "目标"))
	if target_map_id != "" and target_map_id != current_map_id:
		var warp := _warp_to_map(current_map_id, target_map_id)
		if warp.is_empty():
			_set_world_log_message("目标在%s，当前地图暂时找不到通路。" % _map_name_for_id(target_map_id))
			return
		_set_interaction_target(warp)
		_set_world_log_message("正在前往%s。" % str(warp.get("name", label)))
		return
	match str(target.get("kind", "")):
		"interaction":
			var interaction = target.get("interaction", {})
			if interaction is Dictionary and not (interaction as Dictionary).is_empty():
				_set_interaction_target(interaction as Dictionary)
				_set_world_log_message("正在前往%s。" % label)
		"encounter_zone":
			var cell: Vector2i = target.get("cell", IsoMapModel.spawn_cell(map_data))
			_close_dialog()
			_close_encounter()
			_close_player_status_panel()
			_close_backpack_panel()
			_close_equipment_panel()
			_close_shop_panel()
			_close_pet_panel()
			_close_codex_panel()
			_close_quest_panel()
			if _set_move_target_cell(cell, IsoMapModel.grid_to_world(map_data, cell), cell):
				_set_world_log_message("正在前往%s。" % label)
			else:
				_set_world_log_message("暂时无法前往%s。" % label)
		"backpack":
			_open_backpack_panel()
			_set_world_log_message("请在随身包完成：%s。" % label)


func _navigation_target_for_interaction_id(interaction_id: String) -> Dictionary:
	if interaction_id == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		var item := InteractionModel.find_by_id(loaded_map, interaction_id)
		if not item.is_empty():
			return {
				"kind": "interaction",
				"mapId": str(map_id),
				"label": str(item.get("name", "目标")),
				"interaction": item,
			}
	return {}


func _navigation_target_for_shop(shop_id: String) -> Dictionary:
	if shop_id == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		for value in InteractionModel.interaction_points(loaded_map):
			if not (value is Dictionary):
				continue
			var item := value as Dictionary
			if str(item.get("shopId", "")) == shop_id:
				return {
					"kind": "interaction",
					"mapId": str(map_id),
					"label": str(item.get("name", "商店")),
					"interaction": item,
				}
	return {}


func _navigation_target_for_backpack(label: String) -> Dictionary:
	return {
		"kind": "backpack",
		"mapId": "",
		"label": label if label != "" else "随身包",
	}


func _navigation_target_for_encounter_group(group_id: String) -> Dictionary:
	if group_id == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		for value in EncounterModel.encounter_zones(loaded_map):
			if not (value is Dictionary):
				continue
			var zone := value as Dictionary
			if str(zone.get("encounterGroupId", "")) != group_id:
				continue
			var cell := EncounterModel.first_walkable_cell(loaded_map, zone)
			return {
				"kind": "encounter_zone",
				"mapId": str(map_id),
				"label": str(zone.get("name", "野外")),
				"zone": zone,
				"cell": cell,
			}
	return {}


func _navigation_target_for_capture_objective(objective: Dictionary) -> Dictionary:
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		for value in EncounterModel.encounter_zones(loaded_map):
			if not (value is Dictionary):
				continue
			var zone := value as Dictionary
			if not _zone_matches_capture_objective(zone, objective):
				continue
			var cell := EncounterModel.first_walkable_cell(loaded_map, zone)
			return {
				"kind": "encounter_zone",
				"mapId": str(map_id),
				"label": str(zone.get("name", "野外")),
				"zone": zone,
				"cell": cell,
			}
	return {}


func _zone_matches_capture_objective(zone: Dictionary, objective: Dictionary) -> bool:
	var required_line_id := str(objective.get("lineId", ""))
	var required_form_id := str(objective.get("formId", ""))
	var required_prefix := str(objective.get("formIdPrefix", ""))
	var pool = zone.get("wildPetPool", [])
	if not (pool is Array):
		return false
	for value in pool:
		if not (value is Dictionary):
			continue
		var entry := value as Dictionary
		var form_id := str(entry.get("formId", ""))
		if form_id == "":
			continue
		if required_form_id != "" and form_id != required_form_id:
			continue
		if required_prefix != "" and not form_id.begins_with(required_prefix):
			continue
		if required_line_id != "":
			var template := PetTemplateCatalog.runtime_template_for_form(form_id)
			if str(template.get("lineId", "")) != required_line_id:
				continue
		return true
	return false


func _warp_to_map(from_map_id: String, to_map_id: String) -> Dictionary:
	var loaded_map := _map_data_for_id(from_map_id)
	for value in InteractionModel.interaction_points(loaded_map):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if InteractionModel.is_warp(item) and str(item.get("toMap", "")) == to_map_id:
			return item
	return {}


func _map_data_for_id(map_id: String) -> Dictionary:
	if map_id == current_map_id and not map_data.is_empty():
		return map_data
	var map_path := str(MAP_DATA_PATHS.get(map_id, ""))
	if map_path == "":
		return {}
	return IsoMapModel.load_map(map_path)


func _map_name_for_id(map_id: String) -> String:
	var loaded_map := _map_data_for_id(map_id)
	return str(loaded_map.get("name", map_id))


func _refresh_codex_panel() -> void:
	if codex_panel == null or codex_list_container == null or codex_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var entries := PlayerProgressModel.codex_entries(player_profile)
	for child in codex_list_container.get_children():
		child.queue_free()
	codex_list_buttons.clear()

	var selected_exists := false
	for entry in entries:
		if str(entry.get("formId", "")) == codex_selected_form_id:
			selected_exists = true
			break
	if not selected_exists:
		codex_selected_form_id = _preferred_codex_form_id(entries)

	for entry in entries:
		_add_codex_list_button(entry)
	codex_detail_label.text = "\n".join(PlayerProgressModel.pet_codex_detail_lines_for_form(player_profile, codex_selected_form_id))


func _preferred_codex_form_id(entries: Array[Dictionary]) -> String:
	var first_form_id := ""
	for entry in entries:
		var form_id := str(entry.get("formId", ""))
		if first_form_id == "":
			first_form_id = form_id
		if bool(entry.get("captured", false)):
			return form_id
	for entry in entries:
		if bool(entry.get("seen", false)):
			return str(entry.get("formId", ""))
	return first_form_id


func _add_codex_list_button(entry: Dictionary) -> void:
	var form_id := str(entry.get("formId", ""))
	if form_id == "":
		return
	var button := Button.new()
	var marker := "▶ " if form_id == codex_selected_form_id else ""
	var display_name := str(entry.get("formName", "宠物")) if bool(entry.get("seen", false)) else "？？？"
	button.text = "%s%s\n%s" % [
		marker,
		display_name,
		str(entry.get("recordLabel", "未遇见")),
	]
	button.custom_minimum_size = Vector2(214, 58)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.pressed.connect(func() -> void:
		_select_codex_form(form_id)
	)
	codex_list_container.add_child(button)
	codex_list_buttons[form_id] = button


func _select_codex_form(form_id: String) -> void:
	if PlayerProgressModel.codex_entry_for_form(player_profile, form_id).is_empty():
		return
	codex_selected_form_id = form_id
	_refresh_codex_panel()


func _refresh_pet_panel() -> void:
	if pet_panel == null or pet_list_container == null or pet_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	for child in pet_list_container.get_children():
		child.queue_free()
	pet_list_buttons.clear()
	_sync_pet_management_options()

	var visible_instances := _pet_panel_visible_instances()
	if visible_instances.is_empty():
		_add_pet_section_label("没有符合条件的宠物。")
	if pet_selected_instance_id != "" and not _pet_panel_has_instance(visible_instances, pet_selected_instance_id):
		pet_selected_instance_id = ""

	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		var active := PlayerProgressModel.active_pet(player_profile)
		if not active.is_empty() and _pet_panel_has_instance(visible_instances, str(active.get("instanceId", ""))):
			pet_selected_instance_id = str(active.get("instanceId", ""))
			selected = active
	if selected.is_empty():
		for instance in visible_instances:
			pet_selected_instance_id = str(instance.get("instanceId", ""))
			selected = instance
			break
	if pet_sort_mode == PET_SORT_DEFAULT and pet_filter_mode == PET_FILTER_ALL:
		_add_pet_section_label("队伍")
		for instance in PlayerProgressModel.party_pet_instances(player_profile):
			if _pet_panel_instance_passes_filter(instance):
				_add_pet_list_button(instance)
		var storage := PlayerProgressModel.storage_pet_instances(player_profile)
		if not storage.is_empty():
			_add_pet_section_label("兽栏")
			for instance in storage:
				if _pet_panel_instance_passes_filter(instance):
					_add_pet_list_button(instance)
	else:
		for instance in visible_instances:
			_add_pet_list_button(instance)
	if pet_detail_mode == PET_DETAIL_MODE_CODEX:
		pet_detail_label.text = "\n".join(PlayerProgressModel.pet_codex_detail_lines(selected))
	else:
		pet_detail_label.text = "\n".join(PlayerProgressModel.pet_detail_lines(selected))
	if pet_detail_instance_button != null:
		pet_detail_instance_button.visible = not selected.is_empty()
		pet_detail_instance_button.disabled = selected.is_empty()
		pet_detail_instance_button.button_pressed = pet_detail_mode == PET_DETAIL_MODE_INSTANCE
	if pet_detail_codex_button != null:
		pet_detail_codex_button.visible = not selected.is_empty()
		pet_detail_codex_button.disabled = selected.is_empty()
		pet_detail_codex_button.button_pressed = pet_detail_mode == PET_DETAIL_MODE_CODEX
	if pet_state_cycle_button != null:
		var selected_state := str(selected.get("state", ""))
		var target_state := PlayerProgressModel.cycled_pet_state(selected_state)
		if target_state == "":
			pet_state_cycle_button.disabled = true
			pet_state_cycle_button.visible = false
		else:
			pet_state_cycle_button.visible = true
			var state_check := PlayerProgressModel.can_cycle_pet_state(player_profile, pet_selected_instance_id)
			pet_state_cycle_button.disabled = not bool(state_check.get("ok", false))
			pet_state_cycle_button.text = _pet_state_button_label(target_state)
	if pet_stable_button != null:
		if selected.is_empty():
			pet_stable_button.visible = false
			pet_stable_button.disabled = true
		else:
			pet_stable_button.visible = true
			pet_stable_button.disabled = false
			var stable_state := str(selected.get("state", ""))
			pet_stable_button.text = "取出" if stable_state == PlayerProgressModel.PET_STATE_STORAGE else "存入"
	if pet_rename_button != null:
		pet_rename_button.visible = not selected.is_empty()
		pet_rename_button.disabled = selected.is_empty()
	if pet_skill_button != null:
		pet_skill_button.visible = not selected.is_empty()
		pet_skill_button.disabled = selected.is_empty()
	if pet_drop_button != null:
		pet_drop_button.visible = not selected.is_empty()
		var selected_state := str(selected.get("state", ""))
		if selected_state == PlayerProgressModel.PET_STATE_STORAGE:
			pet_drop_button.disabled = selected.is_empty()
			pet_drop_button.text = "确认" if pet_clear_confirm_instance_id == pet_selected_instance_id else "清理"
		else:
			var drop_check := PlayerProgressModel.can_drop_pet(player_profile, pet_selected_instance_id)
			pet_drop_button.disabled = selected.is_empty() or not bool(drop_check.get("ok", false))
			pet_drop_button.text = "丢弃"


func _pet_filter_options() -> Array[Dictionary]:
	return [
		{"id": PET_FILTER_ALL, "label": "全部"},
		{"id": PET_FILTER_PARTY, "label": "队伍"},
		{"id": PET_FILTER_STORAGE, "label": "兽栏"},
		{"id": PET_FILTER_LEVEL_ONE, "label": "Lv1"},
		{"id": PET_FILTER_LOW_POWER, "label": "低战力"},
		{"id": PET_FILTER_NEW, "label": "新"},
	]


func _pet_sort_options() -> Array[Dictionary]:
	return [
		{"id": PET_SORT_DEFAULT, "label": "默认"},
		{"id": PET_SORT_LEVEL, "label": "等级"},
		{"id": PET_SORT_POWER, "label": "战力"},
		{"id": PET_SORT_SPECIES, "label": "种类"},
		{"id": PET_SORT_CAPTURED, "label": "捕获"},
	]


func _pet_management_option(options: Array[Dictionary], selected_id: String) -> OptionButton:
	var option := OptionButton.new()
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 15)
	var selected_index := 0
	for index in range(options.size()):
		var entry := options[index] as Dictionary
		var option_id := str(entry.get("id", ""))
		option.add_item(str(entry.get("label", option_id)), index)
		option.set_item_metadata(index, option_id)
		if option_id == selected_id:
			selected_index = index
	option.select(selected_index)
	return option


func _sync_pet_management_options() -> void:
	_select_option_by_metadata(pet_filter_option, pet_filter_mode)
	_select_option_by_metadata(pet_sort_option, pet_sort_mode)
	_sync_pet_sort_direction_button()


func _sync_pet_sort_direction_button() -> void:
	if pet_sort_direction_button == null:
		return
	pet_sort_direction_button.disabled = pet_sort_mode == PET_SORT_DEFAULT
	pet_sort_direction_button.text = "降" if pet_sort_descending else "升"
	pet_sort_direction_button.tooltip_text = "降序" if pet_sort_descending else "升序"


func _pet_default_sort_descending(sort_mode: String) -> bool:
	return sort_mode != PET_SORT_SPECIES


func _on_pet_sort_direction_pressed() -> void:
	if pet_sort_mode == PET_SORT_DEFAULT:
		return
	pet_sort_descending = not pet_sort_descending
	pet_clear_confirm_instance_id = ""
	_refresh_pet_panel()


func _select_option_by_metadata(option: OptionButton, selected_id: String) -> void:
	if option == null:
		return
	for index in range(option.get_item_count()):
		if str(option.get_item_metadata(index)) == selected_id:
			option.select(index)
			return


func _node_tree_has_button_text(root: Node, button_text: String) -> bool:
	if root == null:
		return false
	if root is Button and (root as Button).text == button_text:
		return true
	for child in root.get_children():
		if _node_tree_has_button_text(child, button_text):
			return true
	return false


func _pet_panel_visible_instances() -> Array[Dictionary]:
	var instances: Array[Dictionary] = []
	for instance in PlayerProgressModel.all_pet_instances(player_profile):
		if _pet_panel_instance_passes_filter(instance):
			instances.append(instance)
	if pet_sort_mode == PET_SORT_DEFAULT:
		return instances
	instances.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _pet_panel_sort_before(a, b)
	)
	return instances


func _pet_panel_instance_passes_filter(instance: Dictionary) -> bool:
	match pet_filter_mode:
		PET_FILTER_PARTY:
			return str(instance.get("state", "")) != PlayerProgressModel.PET_STATE_STORAGE
		PET_FILTER_STORAGE:
			return str(instance.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE
		PET_FILTER_LEVEL_ONE:
			return int(instance.get("level", 1)) == 1
		PET_FILTER_LOW_POWER:
			return PetPowerModel.combat_power_for_pet(instance) < PET_LOW_POWER_FILTER_THRESHOLD
		PET_FILTER_NEW:
			return bool(instance.get("isNew", false))
		_:
			return true


func _pet_panel_sort_before(a: Dictionary, b: Dictionary) -> bool:
	var result := false
	match pet_sort_mode:
		PET_SORT_LEVEL:
			var a_level := int(a.get("level", 1))
			var b_level := int(b.get("level", 1))
			if a_level != b_level:
				result = a_level > b_level
				return result if pet_sort_descending else not result
		PET_SORT_POWER:
			var a_power := PetPowerModel.combat_power_for_pet(a)
			var b_power := PetPowerModel.combat_power_for_pet(b)
			if a_power != b_power:
				result = a_power > b_power
				return result if pet_sort_descending else not result
		PET_SORT_SPECIES:
			var a_species := "%s:%s:%s" % [str(a.get("lineName", "")), str(a.get("subtypeName", "")), str(a.get("formName", ""))]
			var b_species := "%s:%s:%s" % [str(b.get("lineName", "")), str(b.get("subtypeName", "")), str(b.get("formName", ""))]
			if a_species != b_species:
				result = a_species > b_species
				return result if pet_sort_descending else not result
		PET_SORT_CAPTURED:
			var a_serial := int(a.get("capturedSerial", 0))
			var b_serial := int(b.get("capturedSerial", 0))
			if a_serial != b_serial:
				result = a_serial > b_serial
				return result if pet_sort_descending else not result
	var a_state_order := _pet_panel_state_order(str(a.get("state", "")))
	var b_state_order := _pet_panel_state_order(str(b.get("state", "")))
	if a_state_order != b_state_order:
		return a_state_order < b_state_order
	return str(a.get("name", "")) < str(b.get("name", ""))


func _pet_panel_state_order(state: String) -> int:
	match state:
		PlayerProgressModel.PET_STATE_BATTLE:
			return 0
		PlayerProgressModel.PET_STATE_STANDBY:
			return 1
		PlayerProgressModel.PET_STATE_REST:
			return 2
		PlayerProgressModel.PET_STATE_STORAGE:
			return 3
		_:
			return 9


func _pet_panel_has_instance(instances: Array[Dictionary], instance_id: String) -> bool:
	for instance in instances:
		if str(instance.get("instanceId", "")) == instance_id:
			return true
	return false


func _pet_state_button_label(state: String) -> String:
	match state:
		PlayerProgressModel.PET_STATE_BATTLE:
			return "战斗"
		PlayerProgressModel.PET_STATE_STANDBY:
			return "待机"
		PlayerProgressModel.PET_STATE_REST:
			return "休息"
		_:
			return ""


func _set_pet_detail_mode(mode: String) -> void:
	if mode != PET_DETAIL_MODE_INSTANCE and mode != PET_DETAIL_MODE_CODEX:
		return
	pet_detail_mode = mode
	_refresh_pet_panel()


func _add_pet_section_label(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 16)
	pet_list_container.add_child(label)


func _add_pet_list_button(instance: Dictionary) -> void:
	var instance_id := str(instance.get("instanceId", ""))
	if instance_id == "":
		return
	var button := Button.new()
	var marker := "▶ " if instance_id == pet_selected_instance_id else ""
	var active_marker := "主 " if str(instance.get("state", "")) == PlayerProgressModel.PET_STATE_BATTLE else ""
	var new_marker := "新 " if bool(instance.get("isNew", false)) else ""
	button.text = "%s%s%s%s\nLv%d  %s  战力%d" % [
		marker,
		active_marker,
		new_marker,
		str(instance.get("name", "宠物")),
		int(instance.get("level", 1)),
		PlayerProgressModel.state_label(str(instance.get("state", ""))),
		PetPowerModel.combat_power_for_pet(instance),
	]
	button.custom_minimum_size = Vector2(196, 58)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.pressed.connect(func() -> void:
		_select_pet_instance(instance_id)
	)
	pet_list_container.add_child(button)
	pet_list_buttons[instance_id] = button


func _select_pet_instance(instance_id: String) -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, instance_id)
	if selected.is_empty():
		return
	pet_selected_instance_id = instance_id
	pet_clear_confirm_instance_id = ""
	if bool(selected.get("isNew", false)):
		player_profile = PlayerProgressModel.mark_pet_seen(player_profile, instance_id)
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
	_refresh_pet_panel()


func _on_pet_state_cycle_pressed() -> void:
	var result := PlayerProgressModel.cycle_pet_state(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_stable_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var result := {}
	if str(selected.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE:
		result = PlayerProgressModel.withdraw_pet(player_profile, pet_selected_instance_id)
	else:
		result = PlayerProgressModel.store_pet(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_rename_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if pet_rename_panel == null or pet_rename_input == null:
		return
	pet_rename_title_label.text = "宠物改名"
	pet_rename_input.text = str(selected.get("name", "宠物"))
	pet_rename_panel.visible = true
	_layout_hud()
	pet_rename_input.grab_focus()
	pet_rename_input.select_all()


func _on_pet_rename_confirmed() -> void:
	if pet_rename_panel == null or pet_rename_input == null:
		return
	var result := PlayerProgressModel.rename_pet(player_profile, pet_selected_instance_id, pet_rename_input.text)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		_close_pet_rename_panel()
		_refresh_pet_panel()
	else:
		pet_rename_input.text = str(result.get("name", pet_rename_input.text))
		pet_rename_input.grab_focus()
	_set_world_log_message(str(result.get("message", "")))


func _on_pet_drop_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if str(selected.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE:
		_on_pet_clear_storage_pressed()
		return
	var cell_result := _available_pet_drop_cell_result()
	if not bool(cell_result.get("ok", false)):
		_set_world_log_message("地面太满了")
		return
	var drop_cell := cell_result.get("cell", Vector2i.ZERO) as Vector2i
	var result := PlayerProgressModel.drop_pet(
		player_profile,
		pet_selected_instance_id,
		current_map_id,
		drop_cell,
		int(Time.get_unix_time_from_system())
	)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = ""
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
	_close_pet_rename_panel()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_clear_storage_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if str(selected.get("state", "")) != PlayerProgressModel.PET_STATE_STORAGE:
		return
	if pet_clear_confirm_instance_id != pet_selected_instance_id:
		pet_clear_confirm_instance_id = pet_selected_instance_id
		_set_world_log_message("再点一次清理 %s。" % str(selected.get("name", "宠物")))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.clear_storage_pet(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = ""
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
	pet_clear_confirm_instance_id = ""
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _available_pet_drop_cell_result() -> Dictionary:
	if player == null or map_data.is_empty():
		return {"ok": false}
	var candidates: Array[Vector2i] = []
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var occupied := _ground_pet_occupied_cell_lookup(current_map_id)
	for offset in IsoMapModel.NEIGHBORS_8:
		var cell: Vector2i = player_cell + offset
		if not IsoMapModel.is_walkable(map_data, cell):
			continue
		if occupied.has(IsoMapModel.cell_key(cell)):
			continue
		candidates.append(cell)
	if candidates.is_empty():
		return {"ok": false}
	return {
		"ok": true,
		"cell": candidates[encounter_rng.randi_range(0, candidates.size() - 1)],
	}


func _ground_pet_occupied_cell_lookup(map_id: String) -> Dictionary:
	var lookup: Dictionary = {}
	for drop in PlayerProgressModel.ground_pet_drops_on_map(player_profile, map_id):
		var cell := PlayerProgressModel.ground_pet_drop_cell(drop)
		lookup[IsoMapModel.cell_key(cell)] = true
	return lookup


func _ground_pet_drop_for_instance_id(instance_id: String) -> Dictionary:
	for drop in PlayerProgressModel.ground_pet_drops_on_map(player_profile, current_map_id):
		var pet_instance := PlayerProgressModel.ground_pet_drop_pet(drop)
		if str(pet_instance.get("instanceId", "")) == instance_id:
			return drop
	return {}


func _find_ground_pet_drop_at_world_point(world_point: Vector2, hit_radius: float = 34.0) -> Dictionary:
	var clicked_cell := IsoMapModel.world_to_grid(map_data, world_point)
	var best_drop: Dictionary = {}
	var best_distance := INF
	for drop in PlayerProgressModel.ground_pet_drops_on_map(player_profile, current_map_id):
		var cell := PlayerProgressModel.ground_pet_drop_cell(drop)
		var marker_point := _ground_pet_marker_world_position(drop)
		var distance := world_point.distance_to(marker_point)
		if cell == clicked_cell:
			distance = minf(distance, hit_radius * 0.5)
		if distance <= hit_radius and distance < best_distance:
			best_drop = drop
			best_distance = distance
	return best_drop


func _ground_pet_interaction_for_drop(drop: Dictionary) -> Dictionary:
	var cell := PlayerProgressModel.ground_pet_drop_cell(drop)
	var pet_instance := PlayerProgressModel.ground_pet_drop_pet(drop)
	return {
		"id": "ground_pet:%s" % str(drop.get("dropId", "")),
		"dropId": str(drop.get("dropId", "")),
		"kind": "ground_pet_drop",
		"name": str(pet_instance.get("name", "宠物")),
		"cell": [cell.x, cell.y],
		"blocksMovement": false,
	}


func _ground_pet_marker_world_position(drop: Dictionary) -> Vector2:
	return IsoMapModel.grid_to_world(map_data, PlayerProgressModel.ground_pet_drop_cell(drop)) + Vector2(0, -16)


func _pickup_ground_pet_drop(drop_id: String) -> void:
	var result := PlayerProgressModel.pickup_ground_pet(player_profile, drop_id, int(Time.get_unix_time_from_system()))
	player_profile = result.get("profile", player_profile)
	if (bool(result.get("ok", false)) or bool(result.get("changed", false))) and profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = str(result.get("instanceId", pet_selected_instance_id))
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()
	_set_world_log_message(str(result.get("message", "")))


func _close_pet_rename_panel() -> void:
	if pet_rename_panel != null:
		pet_rename_panel.visible = false


func _update_pet_rest_recovery(delta: float) -> void:
	if delta <= 0.0 or player_profile.is_empty():
		return
	pet_rest_recovery_elapsed += delta
	if pet_rest_recovery_elapsed < PET_REST_RECOVER_INTERVAL_SECONDS:
		return
	var tick_count := mini(3, int(floor(pet_rest_recovery_elapsed / PET_REST_RECOVER_INTERVAL_SECONDS)))
	pet_rest_recovery_elapsed = fmod(pet_rest_recovery_elapsed, PET_REST_RECOVER_INTERVAL_SECONDS)
	var recovered := false
	for _tick in range(tick_count):
		var result := _apply_pet_rest_recovery_tick(false, false)
		recovered = recovered or bool(result.get("ok", false))
	if recovered:
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()


func _apply_pet_rest_recovery_tick(save_after: bool = true, refresh_panel: bool = true) -> Dictionary:
	var result := PlayerProgressModel.apply_rest_recovery_tick(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		if save_after and profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		if refresh_panel and pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
	return result


func _update_ground_pet_drop_expiration(delta: float) -> void:
	if delta <= 0.0 or player_profile.is_empty():
		return
	pet_drop_expire_elapsed += delta
	if pet_drop_expire_elapsed < 1.0:
		return
	pet_drop_expire_elapsed = 0.0
	var result := PlayerProgressModel.expire_ground_pet_drops(player_profile, int(Time.get_unix_time_from_system()))
	if not bool(result.get("ok", false)):
		return
	player_profile = result.get("profile", player_profile)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()
	_set_world_log_message("地上的宠物离开了。")


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
	if battle_command_owner == "capture":
		_on_capture_battle_command_pressed(command_id)
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
			_open_capture_command_menu()
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
	if command_id == "capture":
		battle_pending_player_command["captureToolId"] = CaptureToolCatalog.normalized_tool_id(battle_pending_capture_tool_id)
	_open_pet_command_or_start_round()


func _submit_spirit_player_command(spirit_id: String, target_id: String = "") -> void:
	battle_target_mode = "enemy"
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_pending_capture_tool_id = ""
	var player_id := BattleModel.player_actor_id(battle_state)
	if not BattleModel.actor_has_spirit(battle_state, player_id, spirit_id):
		_set_battle_message("当前装备没有提供%s。" % BattleActionCatalog.label_for(spirit_id, "精灵"))
		_set_battle_command_owner("player")
		return
	var command := {
		"command": "spirit",
		"spiritId": spirit_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY):
		command["targetSide"] = BattleModel.SIDE_ALLY
		if BattleActionCatalog.action_is_all(spirit_id):
			command["targetScope"] = "all"
		else:
			command["targetScope"] = "single"
			command["allyTargetId"] = target_id
	elif BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ENEMY):
		command["targetSide"] = BattleModel.SIDE_ENEMY
		if BattleActionCatalog.action_is_all(spirit_id):
			command["targetScope"] = "all"
		else:
			command["targetScope"] = "single"
			command["targetId"] = target_id
			battle_selected_target_id = target_id
	battle_pending_player_command = command
	_open_pet_command_or_start_round()


func _submit_item_player_command(item_id: String, target_id: String = "") -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	battle_pending_capture_tool_id = ""
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
		BattleModel.ITEM_MEAT_SMALL:
			command["targetSide"] = BattleModel.SIDE_ALLY
			command["targetScope"] = "single"
			command["allyTargetId"] = target_id
		BattleModel.ITEM_CLEANSE_SINGLE:
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
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	_set_battle_command_owner("spirit")
	_set_battle_message("选择要使用的精灵。")


func _open_item_command_menu() -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	_set_battle_command_owner("item")
	_set_battle_message("选择要使用的物品。")


func _open_capture_command_menu() -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_command_owner("capture")
	_set_battle_message("选择捕捉方式。")


func _open_switch_pet_command_menu() -> void:
	battle_target_mode = "enemy"
	battle_pending_item_id = ""
	battle_pending_spirit_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_command_owner("switch_pet")
	_set_battle_message("选择待机宠物。")


func _capture_tool_id_for_command(command_id: String) -> String:
	match command_id:
		"attack":
			return BattleModel.CAPTURE_TOOL_EMPTY_HAND
		"spirit":
			return BattleModel.CAPTURE_TOOL_ROPE_BASIC
		"capture":
			return BattleModel.CAPTURE_TOOL_NET
		"defend":
			return BattleModel.CAPTURE_TOOL_NET_REINFORCED
		_:
			return ""


func _on_capture_battle_command_pressed(command_id: String) -> void:
	if command_id == "help":
		battle_pending_capture_tool_id = ""
		battle_target_mode = "enemy"
		battle_selected_target_id = ""
		battle_selected_ally_target_id = ""
		battle_hover_target_id = ""
		battle_hover_ally_target_id = ""
		_set_battle_command_owner("player")
		_set_battle_message("重新选择人物指令。")
		return
	var tool_id := _capture_tool_id_for_command(command_id)
	if tool_id == "":
		_set_battle_message("这个捕捉方式暂未开放。")
		return
	if not BattleModel.has_capture_tool(battle_state, tool_id):
		_set_battle_message("%s 不够了。" % CaptureToolCatalog.full_name_for(tool_id))
		_sync_battle_buttons()
		return
	_begin_capture_target_selection(tool_id)


func _begin_capture_target_selection(tool_id: String) -> void:
	if BattleModel.living_enemy_id(battle_state) == "":
		_set_battle_message("没有可选择的目标。")
		return
	battle_pending_capture_tool_id = CaptureToolCatalog.normalized_tool_id(tool_id)
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_target_mode = "player_capture_target"
	var target_id := BattleModel.living_enemy_id(battle_state)
	var chance := BattleModel.capture_chance(battle_state, BattleModel.player_actor_id(battle_state), target_id, battle_pending_capture_tool_id)
	_set_battle_message("%s：请选择目标。机会：%s。" % [
		CaptureToolCatalog.full_name_for(battle_pending_capture_tool_id),
		CaptureToolCatalog.chance_tier(chance),
	])
	_sync_battle_buttons()
	queue_redraw()


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
	if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY):
		battle_target_mode = "ally_spirit_single"
		_set_battle_message("%s：请选择我方单体。" % spirit_label)
	else:
		battle_target_mode = "enemy_spirit_single"
		_set_battle_message("%s：请选择敌方单体。" % spirit_label)
	_sync_battle_buttons()
	queue_redraw()


func _on_spirit_battle_command_pressed(command_id: String) -> void:
	if command_id == "help":
		battle_pending_spirit_id = ""
		battle_pending_item_id = ""
		battle_target_mode = "enemy"
		battle_selected_target_id = ""
		battle_selected_ally_target_id = ""
		battle_hover_target_id = ""
		battle_hover_ally_target_id = ""
		_set_battle_command_owner("player")
		_set_battle_message("重新选择人物指令。")
		return
	var spirit_id := str(battle_spirit_button_spirit_ids.get(command_id, ""))
	if spirit_id == "":
		_set_battle_message("当前装备没有提供这个精灵。")
		return
	var player_id := BattleModel.player_actor_id(battle_state)
	if not BattleModel.actor_has_spirit(battle_state, player_id, spirit_id):
		_set_battle_message("当前装备没有提供%s。" % BattleActionCatalog.label_for(spirit_id, "精灵"))
		_sync_battle_buttons()
		return
	if BattleActionCatalog.action_is_all(spirit_id):
		_submit_spirit_player_command(spirit_id)
	elif BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY) or BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ENEMY):
		_begin_single_spirit_target_selection(spirit_id)
	else:
		_set_battle_message("这个精灵暂时无法使用。")


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
		"item":
			_begin_single_item_target_selection(BattleModel.ITEM_CLEANSE_SINGLE)
		"switch_pet":
			_begin_single_item_target_selection(BattleModel.ITEM_MEAT_SMALL)
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


func _begin_pet_skill_target_selection(skill_id: String) -> void:
	battle_pending_pet_skill_id = skill_id
	battle_target_mode = "pet_enemy_skill"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_message("%s：请选择敌方目标。" % BattleActionCatalog.label_for(skill_id, "宠物技能"))
	queue_redraw()


func _begin_pet_attack_target_selection(skill_id: String = BattleModel.PET_SKILL_ATTACK) -> void:
	if BattleModel.living_enemy_id(battle_state) == "":
		_set_battle_message("没有可选择的目标。")
		return
	battle_pending_pet_skill_id = skill_id
	battle_target_mode = "pet_enemy_attack"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_message("%s：请选择敌方目标。" % BattleActionCatalog.label_for(skill_id, "攻击"))
	_sync_battle_buttons()
	queue_redraw()


func _begin_spirit_target_selection() -> void:
	battle_target_mode = "ally_spirit_single"
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_pending_spirit_id = BattleModel.SPIRIT_MOIST_1
	battle_pending_item_id = ""
	_set_battle_message("%s：请选择我方单体。" % BattleActionCatalog.label_for(BattleModel.SPIRIT_MOIST_1, "滋润精灵1"))
	_sync_battle_buttons()
	queue_redraw()


func _on_pet_battle_command_pressed(command_id: String) -> void:
	if command_id == "help":
		battle_pending_spirit_id = ""
		battle_pending_item_id = ""
		battle_pending_capture_tool_id = ""
		battle_pending_pet_skill_id = ""
		battle_pending_player_command.clear()
		battle_pending_pet_command.clear()
		battle_selected_target_id = ""
		battle_selected_ally_target_id = ""
		battle_hover_target_id = ""
		battle_hover_ally_target_id = ""
		_set_battle_command_owner("player")
		_set_battle_message("重新选择人物指令。")
		return
	var skill_action := _controlled_pet_skill_action_for_slot(_pet_skill_slot_for_command(command_id))
	var skill_id := str(skill_action.get("id", ""))
	if skill_id == "":
		_set_battle_message("这个宠物技能栏暂未开放。")
		return
	match str(skill_action.get("command", "")):
		"attack":
			_begin_pet_attack_target_selection(skill_id)
		"defend":
			_submit_pet_battle_command("defend", "", skill_id)
		"pet_skill":
			_begin_pet_skill_target_selection(skill_id)
		_:
			_set_battle_message("这个宠物技能栏暂未开放。")


func _submit_pet_battle_command(command_id: String, target_id: String = "", skill_id: String = "") -> void:
	if command_id == "attack" or command_id == "pet_skill":
		battle_selected_target_id = target_id
		if battle_selected_target_id == "":
			_set_battle_message("没有可选择的目标。")
			return
	if skill_id == "":
		skill_id = battle_pending_pet_skill_id
	battle_pending_pet_command = {
		"command": command_id,
		"targetId": battle_selected_target_id,
		"skillId": skill_id,
	}
	battle_pending_pet_skill_id = ""
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
		if bool(battle_pending_player_command.get("captureHold", false)):
			battle_pending_pet_command = {
				"command": "defend",
				"targetId": "",
				"skillId": BattleModel.PET_SKILL_DEFEND,
				"captureHold": true,
			}
		else:
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
	battle_round_end_status_processed = false
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
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
	battle_state["phase"] = "round_events"
	_set_battle_command_owner("player")
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
	battle_round_end_status_processed = false
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


func _start_round_end_status_events_if_needed() -> bool:
	if battle_round_end_status_processed:
		return false
	if battle_state.is_empty() or BattleModel.living_enemy_id(battle_state) == "" or BattleModel.living_ally_id(battle_state) == "":
		return false
	battle_round_end_status_processed = true
	var status_events := BattleModel.build_round_end_status_events(battle_state)
	if status_events.is_empty():
		return false
	battle_event_queue = status_events
	battle_state["phase"] = "round_events"
	_play_next_battle_event()
	return true


func _play_next_battle_event() -> void:
	battle_event_advance_pending = false
	while battle_active and not battle_event_queue.is_empty():
		var event := battle_event_queue.pop_front() as Dictionary
		var actor_snapshots := _battle_actor_snapshots_by_id()
		battle_state = BattleModel.apply_battle_event(battle_state, event)
		_update_battle_player_zero_hp_seen()
		battle_state["phase"] = "round_events"
		if bool(battle_state.get("lastEventApplied", false)):
			if str(event.get("type", "")) == "capture":
				if bool(battle_state.get("lastCaptureSuccess", false)):
					battle_auto_capture_success_seen = true
				_sync_profile_capture_tools_from_battle_state()
			elif _battle_event_consumes_item(str(event.get("type", ""))):
				_sync_profile_battle_items_from_battle_state()
		if not bool(battle_state.get("lastEventApplied", false)):
			battle_current_event_actor_snapshots.clear()
			continue
		var event_timeline := _battle_event_timeline_for_applied_event(event)
		var ledger := BattleEventLedger.build_from_applied_state(battle_state, event, actor_snapshots, event_timeline)
		battle_state["lastEventLedger"] = ledger
		battle_last_round_applied_events += 1
		_record_battle_event(event, ledger)
		var counter_event = battle_state.get("lastCounterEvent", {})
		if counter_event is Dictionary and not (counter_event as Dictionary).is_empty():
			battle_event_queue.push_front((counter_event as Dictionary).duplicate(true))
		battle_current_event = BattleEventLedger.playback_event(event, ledger)
		_add_battle_event_feedback(battle_current_event, ledger)
		_set_battle_message(str(battle_state.get("message", "")))
		_sync_battle_target_selection()
		if BattleModel.living_enemy_id(battle_state) == "" or BattleModel.living_ally_id(battle_state) == "":
			battle_event_queue.clear()
			battle_end_pending = true
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
	if _start_round_end_status_events_if_needed():
		return
	_finish_battle_round_and_open_commands()


func _finish_battle_round_and_open_commands() -> void:
	battle_state["phase"] = "command"
	battle_state["round"] = int(battle_state.get("round", 1)) + 1
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	battle_event_advance_pending = false
	_set_battle_command_owner("player")
	battle_target_mode = "enemy"
	battle_pending_player_command.clear()
	battle_pending_pet_command.clear()
	battle_pending_spirit_id = ""
	battle_pending_item_id = ""
	battle_pending_capture_tool_id = ""
	battle_pending_pet_skill_id = ""
	battle_state["guardingActorIds"] = []
	battle_selected_target_id = ""
	battle_selected_ally_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_sync_battle_target_selection()
	if battle_auto_attack_enabled:
		battle_auto_attack_delay = maxf(battle_auto_attack_delay, BATTLE_AUTO_ROUND_SETTLE_DELAY)
	_sync_battle_buttons()
	queue_redraw()


func _battle_actor_snapshots_by_id() -> Dictionary:
	var snapshots := {}
	for value in battle_state.get("actors", []):
		var actor := value as Dictionary
		var actor_id := str(actor.get("id", ""))
		if actor_id != "":
			snapshots[actor_id] = actor.duplicate(true)
	return snapshots


func _set_battle_actor_fields(state: Dictionary, actor_id: String, fields: Dictionary) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var actor_index := BattleModel.actor_index(state, actor_id)
	if actor_index < 0:
		return state
	var actor := actors[actor_index] as Dictionary
	for key in fields.keys():
		actor[str(key)] = fields[key]
	actors[actor_index] = actor
	state["actors"] = actors
	return state


func _record_battle_event(event: Dictionary, ledger: Dictionary = {}) -> void:
	if ledger.is_empty():
		ledger = BattleEventLedger.build_from_applied_state(battle_state, event, {}, _battle_event_timeline_for_applied_event(event))
	battle_recorded_event_sequence += 1
	battle_last_event_ledger = ledger.duplicate(true)
	var event_type := str(ledger.get("type", event.get("type", "")))
	battle_last_event_type = event_type
	battle_last_event_target_id = str(ledger.get("resolvedTargetId", ""))
	battle_last_event_target_ids.clear()
	for target_id_value in ledger.get("targetIds", []):
		var target_id := str(target_id_value)
		if target_id != "":
			battle_last_event_target_ids.append(target_id)
	battle_last_event_damage = int(ledger.get("damage", 0))
	battle_last_event_heal = int(ledger.get("heal", 0))
	battle_last_event_launch = bool(ledger.get("launch", false))
	battle_last_event_launch_mode = str(ledger.get("launchMode", ""))
	battle_last_round_event_types.append(event_type)
	battle_last_round_speeds.append(int(ledger.get("speed", event.get("speed", 0))))
	var attacker_actor := BattleModel.actor_by_id(battle_state, str(event.get("attackerId", "")))
	if not attacker_actor.is_empty() and str(attacker_actor.get("side", "")) == BattleModel.SIDE_ENEMY and str(event.get("targetSide", "")) == BattleModel.SIDE_ALLY:
		var enemy_target_id := str(ledger.get("resolvedTargetId", event.get("targetId", "")))
		if enemy_target_id != "":
			battle_last_round_enemy_target_ids.append(enemy_target_id)
	var participants: Array = ledger.get("participantIds", [])
	if participants.is_empty():
		participants = [str(event.get("attackerId", ""))]
	for participant_id in participants:
		var actor_id := str(participant_id)
		if actor_id != "":
			battle_last_round_actor_order.append(actor_id)
	var trace_entry := ledger.duplicate(true)
	trace_entry["attackerName"] = str(attacker_actor.get("name", ""))
	var target_actor := BattleModel.actor_by_id(battle_state, battle_last_event_target_id)
	trace_entry["targetName"] = str(target_actor.get("name", ""))
	_append_battle_trace(trace_entry)
	_update_battle_debug_window(true)


func _add_battle_event_feedback(event: Dictionary, ledger: Dictionary = {}) -> void:
	if ledger.is_empty():
		ledger = battle_last_event_ledger
	var event_type := str(ledger.get("type", event.get("type", "")))
	var target_id := str(ledger.get("resolvedTargetId", ""))
	if target_id == "":
		return
	if event_type == "capture":
		var success := bool(battle_state.get("lastCaptureSuccess", false))
		_add_battle_float_text(target_id, "捕获" if success else "挣脱", Color(0.56, 0.95, 1.0, 0.96) if success else Color(0.95, 0.88, 0.36, 0.96))
		return
	if event_type == "status_tick":
		var status_id := str(ledger.get("statusId", event.get("statusId", "")))
		var tick_damage := int(ledger.get("damage", 0))
		if status_id == BattleModel.STATUS_POISON and tick_damage > 0:
			_add_battle_float_text(target_id, "毒 -%d" % tick_damage, Color(0.68, 0.95, 0.34, 0.98))
		return
	if event_type == "status_skip":
		var skip_status_id := str(ledger.get("statusId", event.get("statusId", "")))
		var skip_text := BattleStatusModel.status_label(skip_status_id)
		if skip_text != "":
			_add_battle_float_text(target_id, skip_text, Color(0.72, 0.82, 1.0, 0.98))
		return
	if event_type == "skill_status":
		var skill_status_id := str(ledger.get("statusId", event.get("statusId", "")))
		var skill_status_text := BattleStatusModel.status_label(skill_status_id)
		var skill_status_result := str(ledger.get("statusResult", event.get("statusResult", "")))
		if skill_status_result == "immune":
			_add_battle_float_text(target_id, "免疫", Color(0.84, 0.88, 0.98, 0.98))
		elif skill_status_result == "resisted":
			_add_battle_float_text(target_id, "抵抗", Color(0.76, 0.84, 0.92, 0.98))
		elif skill_status_text != "":
			_add_battle_float_text(target_id, skill_status_text, _battle_status_badge_color(skill_status_id))
		return
	if event_type == "spirit_heal":
		var healed := int(ledger.get("heal", 0))
		if healed > 0:
			_add_battle_float_text(target_id, "+%d" % healed, Color(0.56, 1.0, 0.66, 0.98))
		return
	if event_type == "item_heal":
		var item_healed := int(ledger.get("heal", 0))
		if item_healed > 0:
			_add_battle_float_text(target_id, "药 +%d" % item_healed, Color(0.62, 0.98, 0.72, 0.98))
		return
	if event_type == "item_cleanse":
		var cleanse_text := "净化" if str(ledger.get("statusResult", "")) == "cleansed" else "无异常"
		_add_battle_float_text(target_id, cleanse_text, Color(0.68, 0.96, 1.0, 0.98))
		return
	if event_type == "spirit_heal_all":
		var heal_effects := ledger.get("effectPerTarget", {}) as Dictionary
		for heal_target_id in ledger.get("targetIds", []):
			var heal_value := int(heal_effects.get(str(heal_target_id), 0))
			if heal_value > 0:
				_add_battle_float_text(str(heal_target_id), "+%d" % heal_value, Color(0.56, 1.0, 0.66, 0.98))
		return
	if event_type == "item_heal_all":
		var item_heal_effects := ledger.get("effectPerTarget", {}) as Dictionary
		for item_heal_target_id in ledger.get("targetIds", []):
			var item_heal_value := int(item_heal_effects.get(str(item_heal_target_id), 0))
			if item_heal_value > 0:
				_add_battle_float_text(str(item_heal_target_id), "药 +%d" % item_heal_value, Color(0.62, 0.98, 0.72, 0.98))
		return
	if event_type == "spirit_poison":
		var poison_damage := int(ledger.get("damage", 0))
		if poison_damage > 0:
			var poison_status_result := str(ledger.get("statusResult", ""))
			var poison_text := "中毒 -%d" % poison_damage if poison_status_result == "applied" else (("免疫 -%d" % poison_damage) if poison_status_result == "immune" else "抵抗 -%d" % poison_damage)
			_add_battle_float_text(target_id, poison_text, Color(0.72, 0.95, 0.36, 0.98))
		return
	if event_type == "item_poison":
		var item_poison_damage := int(ledger.get("damage", 0))
		if item_poison_damage > 0:
			var item_poison_status_result := str(ledger.get("statusResult", ""))
			var item_poison_text := "毒粉 -%d" % item_poison_damage if item_poison_status_result == "applied" else (("免疫 -%d" % item_poison_damage) if item_poison_status_result == "immune" else "抵抗 -%d" % item_poison_damage)
			_add_battle_float_text(target_id, item_poison_text, Color(0.80, 0.92, 0.34, 0.98))
		return
	if event_type == "spirit_poison_all":
		var poison_effects := ledger.get("effectPerTarget", {}) as Dictionary
		var poison_results := ledger.get("statusResultPerTarget", {}) as Dictionary
		for poison_target_id in ledger.get("targetIds", []):
			var poison_value := int(poison_effects.get(str(poison_target_id), 0))
			if poison_value > 0:
				var poison_result := str(poison_results.get(str(poison_target_id), "applied"))
				var poison_all_text := "中毒 -%d" % poison_value if poison_result == "applied" else (("免疫 -%d" % poison_value) if poison_result == "immune" else "抵抗 -%d" % poison_value)
				_add_battle_float_text(str(poison_target_id), poison_all_text, Color(0.72, 0.95, 0.36, 0.98))
		return
	if event_type == "item_poison_all":
		var item_poison_effects := ledger.get("effectPerTarget", {}) as Dictionary
		var item_poison_results := ledger.get("statusResultPerTarget", {}) as Dictionary
		for item_poison_target_id in ledger.get("targetIds", []):
			var item_poison_value := int(item_poison_effects.get(str(item_poison_target_id), 0))
			if item_poison_value > 0:
				var item_poison_result := str(item_poison_results.get(str(item_poison_target_id), "applied"))
				var item_poison_all_text := "毒粉 -%d" % item_poison_value if item_poison_result == "applied" else (("免疫 -%d" % item_poison_value) if item_poison_result == "immune" else "抵抗 -%d" % item_poison_value)
				_add_battle_float_text(str(item_poison_target_id), item_poison_all_text, Color(0.80, 0.92, 0.34, 0.98))
		return
	if event_type == "defend":
		return
	if bool(ledger.get("dodged", false)):
		var dodge_delay := _battle_event_duration(event) * _battle_event_result_reveal_progress(event) if _battle_event_delays_result(event) else 0.0
		_add_battle_float_text(target_id, "回避", Color(0.62, 0.88, 1.0, 0.98), dodge_delay)
		return
	var damage := int(ledger.get("damage", 0))
	if damage <= 0:
		return
	var text := "-%d" % damage
	var feedback_delay := _battle_event_duration(event) * _battle_event_result_reveal_progress(event) if _battle_event_delays_result(event) else 0.0
	if bool(ledger.get("launch", false)):
		text = "击飞 %s" % text
	if event_type == "combo_attack":
		text = "合击 %s" % text
	elif event_type == "skill_attack":
		text = "技能 %s" % text
	elif event_type == "counter_attack":
		text = "反击 %s" % text
	if bool(ledger.get("critical", false)):
		text = "暴击 %s" % text
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


func _battle_event_timeline_for_applied_event(event: Dictionary) -> Dictionary:
	var duration := _battle_event_duration(event)
	var delays_result := _battle_event_delays_result(event)
	var reveal_progress := _battle_event_result_reveal_progress(event) if delays_result else 0.0
	var launch_start := reveal_progress
	return {
		"durationSeconds": duration,
		"delaysResult": delays_result,
		"damageRevealProgress": reveal_progress,
		"launchStartProgress": launch_start,
	}


func _battle_event_consumes_item(event_type: String) -> bool:
	return [
		"item_heal",
		"item_heal_all",
		"item_poison",
		"item_poison_all",
		"item_cleanse",
	].has(event_type)


func _battle_launch_duration_for_mode(launch_mode: String) -> float:
	return BATTLE_LAUNCH_BOUNCE_SECONDS if launch_mode == "bounce" else BATTLE_LAUNCH_STRAIGHT_SECONDS


func _battle_combo_last_hit_seconds(participant_count: int) -> float:
	return BATTLE_COMBO_STAGGER_SECONDS * float(maxi(1, participant_count) - 1) + BATTLE_COMBO_ACTION_SECONDS * BATTLE_COMBO_APPROACH_RATIO + 0.06


func _battle_event_duration(event: Dictionary) -> float:
	var timeline = event.get("timeline", {})
	if timeline is Dictionary and (timeline as Dictionary).has("durationSeconds"):
		return maxf(0.12, float((timeline as Dictionary).get("durationSeconds", 0.46)))
	if event.has("duration"):
		return maxf(0.12, float(event.get("duration", 0.46)))
	match str(event.get("type", "")):
		"combo_attack":
			var participant_ids: Array = event.get("participantIds", [str(event.get("attackerId", ""))])
			var participant_count := maxi(1, participant_ids.size())
			var duration := BATTLE_COMBO_ACTION_SECONDS + BATTLE_COMBO_STAGGER_SECONDS * float(participant_count - 1) + BATTLE_COMBO_RETURN_PADDING_SECONDS
			if bool(battle_state.get("lastLaunch", false)) and bool(event.get("canLaunch", false)):
				var launch_mode := str(event.get("launchMode", battle_state.get("lastLaunchMode", battle_last_event_launch_mode)))
				var launch_tail_seconds := _battle_launch_duration_for_mode(launch_mode) * (1.0 - BATTLE_LAUNCH_TARGET_START_RATIO)
				duration = maxf(duration, _battle_combo_last_hit_seconds(participant_count) + launch_tail_seconds)
			return duration
		"skill_attack":
			return 0.74
		"counter_attack":
			return 0.62
		"skill_status":
			return 0.58
		"spirit_heal":
			return 0.54
		"item_heal":
			return 0.54
		"item_cleanse":
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
		"status_tick":
			return 0.48
		"status_skip":
			return 0.36
		"attack":
			if bool(battle_state.get("lastLaunch", false)) and bool(event.get("canLaunch", false)):
				var launch_mode := str(event.get("launchMode", battle_state.get("lastLaunchMode", battle_last_event_launch_mode)))
				return _battle_launch_duration_for_mode(launch_mode)
			return 0.62
		_:
			if bool(battle_state.get("lastLaunch", false)) and bool(event.get("canLaunch", false)):
				var launch_mode := str(event.get("launchMode", battle_state.get("lastLaunchMode", battle_last_event_launch_mode)))
				return _battle_launch_duration_for_mode(launch_mode)
			return 0.46


func _battle_event_delays_result(event: Dictionary) -> bool:
	var timeline = event.get("timeline", {})
	if timeline is Dictionary and (timeline as Dictionary).has("delaysResult"):
		return bool((timeline as Dictionary).get("delaysResult", false))
	return ["attack", "skill_attack", "combo_attack", "counter_attack"].has(str(event.get("type", "")))


func _battle_event_result_reveal_progress(event: Dictionary) -> float:
	var timeline = event.get("timeline", {})
	if timeline is Dictionary and (timeline as Dictionary).has("damageRevealProgress"):
		return clampf(float((timeline as Dictionary).get("damageRevealProgress", 0.0)), 0.0, 1.0)
	var event_type := str(event.get("type", ""))
	if event_type == "combo_attack":
		var participant_ids: Array = event.get("participantIds", [str(event.get("attackerId", ""))])
		var participant_count := maxi(1, participant_ids.size())
		var duration := _battle_event_duration(event)
		return clampf(_battle_combo_last_hit_seconds(participant_count) / maxf(0.01, duration), 0.18, 0.88)
	if bool(event.get("canLaunch", false)):
		return BATTLE_LAUNCH_TARGET_START_RATIO
	if event_type == "attack" or event_type == "skill_attack" or event_type == "counter_attack":
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
	_finish_battle_and_return_to_world("escape")


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
		battle_hover_info_actor_id = player_target_id
		_update_battle_passive_panel()
		var player_target := BattleModel.actor_by_id(battle_state, player_target_id)
		var command_id := "capture" if battle_target_mode == "player_capture_target" else "attack"
		if command_id == "capture":
			var chance := BattleModel.capture_chance(battle_state, BattleModel.player_actor_id(battle_state), player_target_id, battle_pending_capture_tool_id)
			_set_battle_message("%s：%s，机会：%s。" % [
				CaptureToolCatalog.full_name_for(battle_pending_capture_tool_id),
				str(player_target.get("name", "敌人")),
				CaptureToolCatalog.chance_tier(chance),
			])
		else:
			_set_battle_message("攻击：%s" % str(player_target.get("name", "敌人")))
		_submit_player_battle_command(command_id, player_target_id)
		queue_redraw()
		return true
	if battle_target_mode == "pet_enemy_skill":
		var pet_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if pet_target_id == "":
			return false
		battle_selected_target_id = pet_target_id
		battle_hover_info_actor_id = pet_target_id
		_update_battle_passive_panel()
		var pet_target := BattleModel.actor_by_id(battle_state, pet_target_id)
		var pet_skill_id := battle_pending_pet_skill_id if battle_pending_pet_skill_id != "" else BattleModel.PET_SKILL_BUI_CHARGE
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(pet_skill_id, "宠物技能"),
			str(pet_target.get("name", "敌人")),
		])
		_submit_pet_battle_command("pet_skill", pet_target_id, pet_skill_id)
		queue_redraw()
		return true
	if battle_target_mode == "pet_enemy_attack":
		var pet_attack_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if pet_attack_target_id == "":
			return false
		battle_selected_target_id = pet_attack_target_id
		battle_hover_target_id = pet_attack_target_id
		battle_hover_info_actor_id = pet_attack_target_id
		_update_battle_passive_panel()
		var pet_attack_target := BattleModel.actor_by_id(battle_state, pet_attack_target_id)
		var pet_attack_skill_id := battle_pending_pet_skill_id if battle_pending_pet_skill_id != "" else BattleModel.PET_SKILL_ATTACK
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(pet_attack_skill_id, "攻击"),
			str(pet_attack_target.get("name", "敌人")),
		])
		_submit_pet_battle_command("attack", pet_attack_target_id, pet_attack_skill_id)
		queue_redraw()
		return true
	if battle_target_mode == "ally_spirit_single":
		var ally_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
		if ally_id == "":
			var enemy_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
			if enemy_id != "":
				_set_battle_message("%s只能选择我方单体。" % BattleActionCatalog.label_for(battle_pending_spirit_id, "精灵"))
			return false
		battle_selected_ally_target_id = ally_id
		battle_hover_info_actor_id = ally_id
		_update_battle_passive_panel()
		var ally_actor := BattleModel.actor_by_id(battle_state, ally_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(battle_pending_spirit_id, "精灵"),
			str(ally_actor.get("name", "我方")),
		])
		_submit_spirit_player_command(battle_pending_spirit_id, ally_id)
		queue_redraw()
		return true
	if battle_target_mode == "enemy_spirit_single":
		var poison_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if poison_target_id == "":
			var ally_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
			if ally_target_id != "":
				_set_battle_message("%s只能选择敌方单体。" % BattleActionCatalog.label_for(battle_pending_spirit_id, "精灵"))
			return false
		battle_selected_target_id = poison_target_id
		battle_hover_info_actor_id = poison_target_id
		_update_battle_passive_panel()
		var poison_target := BattleModel.actor_by_id(battle_state, poison_target_id)
		_set_battle_message("%s：%s" % [
			BattleActionCatalog.label_for(battle_pending_spirit_id, "精灵"),
			str(poison_target.get("name", "敌人")),
		])
		_submit_spirit_player_command(battle_pending_spirit_id, poison_target_id)
		queue_redraw()
		return true
	if battle_target_mode == "ally_item_single":
		var pending_item_id := battle_pending_item_id if battle_pending_item_id != "" else BattleModel.ITEM_HEAL_SINGLE
		var pending_item_label := BattleActionCatalog.label_for(pending_item_id, "物品")
		var item_ally_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
		if item_ally_id == "":
			var item_enemy_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
			if item_enemy_id != "":
				_set_battle_message("%s只能选择我方单体。" % pending_item_label)
			return false
		battle_selected_ally_target_id = item_ally_id
		battle_hover_info_actor_id = item_ally_id
		_update_battle_passive_panel()
		var item_ally_actor := BattleModel.actor_by_id(battle_state, item_ally_id)
		_set_battle_message("%s：%s" % [
			pending_item_label,
			str(item_ally_actor.get("name", "我方")),
		])
		_submit_item_player_command(pending_item_id, item_ally_id)
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
		battle_hover_info_actor_id = item_enemy_target_id
		_update_battle_passive_panel()
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
	battle_hover_info_actor_id = actor_id
	_update_battle_passive_panel()
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	_set_battle_message("目标：%s" % str(actor.get("name", "敌人")))
	_sync_battle_buttons()
	queue_redraw()
	return true


func _update_battle_hover_at_screen_point(screen_point: Vector2) -> void:
	var next_enemy_id := ""
	var next_ally_id := ""
	var next_info_id := ""
	if battle_active and not _battle_point_overlaps_panel(screen_point):
		next_info_id = _battle_actor_id_at_screen_point(screen_point, "")
	if battle_active and not _battle_commands_locked() and not _battle_point_overlaps_panel(screen_point):
		if _battle_target_mode_selects_enemy():
			next_enemy_id = _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		elif _battle_target_mode_selects_ally():
			next_ally_id = _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
	if next_info_id != battle_hover_info_actor_id:
		battle_hover_info_actor_id = next_info_id
		_update_battle_passive_panel()
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
		if side_filter != "" and str(actor.get("side", "")) != side_filter:
			continue
		if int(actor.get("hp", 0)) <= 0:
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


func _battle_actor_is_living(actor_id: String) -> bool:
	if actor_id == "":
		return false
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	return not actor.is_empty() and int(actor.get("hp", 0)) > 0


func _update_battle_passive_panel() -> void:
	if battle_passive_panel == null or battle_passive_label == null:
		return
	if not battle_active or battle_hover_info_actor_id == "":
		battle_passive_panel.visible = false
		battle_passive_label.text = ""
		return
	var actor := BattleModel.actor_by_id(battle_state, battle_hover_info_actor_id)
	var text := BattlePassiveCatalog.display_text_for_actor(actor)
	battle_passive_label.text = text
	battle_passive_panel.visible = false
	_layout_hud()
	battle_passive_panel.visible = text != ""


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
		battle_hover_info_actor_id = ""
		_update_battle_passive_panel()
		return
	if not _battle_selected_target_is_valid():
		battle_selected_target_id = ""
	if not _battle_selected_ally_target_is_valid():
		battle_selected_ally_target_id = ""
	if battle_hover_target_id != "" and not _battle_actor_is_living_side(battle_hover_target_id, BattleModel.SIDE_ENEMY):
		battle_hover_target_id = ""
	if battle_hover_ally_target_id != "" and not _battle_actor_is_living_side(battle_hover_ally_target_id, BattleModel.SIDE_ALLY):
		battle_hover_ally_target_id = ""
	if battle_hover_info_actor_id != "" and not _battle_actor_is_living(battle_hover_info_actor_id):
		battle_hover_info_actor_id = ""
	_update_battle_passive_panel()


func _set_battle_message(text: String) -> void:
	if battle_state.is_empty():
		return
	battle_state["message"] = text
	if battle_log_label != null:
		battle_log_label.text = text


func _sync_battle_buttons() -> void:
	if battle_command_panel != null:
		battle_command_panel.visible = _battle_command_panel_should_be_visible()
	_sync_battle_auto_button()
	if battle_message_panel != null:
		battle_message_panel.visible = battle_active or world_log_message != ""
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
				if str(command_id) == "help":
					button.disabled = not can_command
				else:
					var pet_slot := _pet_skill_slot_for_command(str(command_id))
					var pet_action := _controlled_pet_skill_action_for_slot(pet_slot)
					var pet_action_id := str(pet_action.get("id", ""))
					if pet_action_id == "" or battle_target_mode == "pet_enemy_skill" or battle_target_mode == "pet_enemy_attack":
						button.disabled = true
					elif BattleActionCatalog.action_can_target_side(pet_action_id, BattleModel.SIDE_ENEMY):
						button.disabled = not has_enemy
					else:
						button.disabled = not can_command
			elif battle_command_owner == "spirit":
				if str(command_id) == "help":
					button.disabled = not can_command
				else:
					var spirit_id := str(battle_spirit_button_spirit_ids.get(str(command_id), ""))
					if spirit_id == "":
						button.disabled = true
					elif BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY):
						button.disabled = not has_ally
					elif BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ENEMY):
						button.disabled = not has_enemy
					else:
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
					"item":
						button.disabled = not has_ally or not BattleModel.has_item(battle_state, BattleModel.ITEM_CLEANSE_SINGLE)
					"switch_pet":
						button.disabled = not has_ally or not BattleModel.has_item(battle_state, BattleModel.ITEM_MEAT_SMALL)
					"help":
						button.disabled = not can_command
					_:
						button.disabled = true
			elif battle_command_owner == "capture":
				match str(command_id):
					"attack":
						button.disabled = not has_enemy
					"spirit":
						button.disabled = not has_enemy or not BattleModel.has_capture_tool(battle_state, BattleModel.CAPTURE_TOOL_ROPE_BASIC)
					"capture":
						button.disabled = not has_enemy or not BattleModel.has_capture_tool(battle_state, BattleModel.CAPTURE_TOOL_NET)
					"defend":
						button.disabled = not has_enemy or not BattleModel.has_capture_tool(battle_state, BattleModel.CAPTURE_TOOL_NET_REINFORCED)
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


func _battle_command_panel_should_be_visible() -> bool:
	return battle_active and not _battle_commands_locked()


func _battle_commands_locked() -> bool:
	if not battle_active:
		return true
	return battle_action_timer > 0.0 or not battle_event_queue.is_empty() or battle_enemy_response_pending or battle_end_pending or str(battle_state.get("phase", "command")) != "command"


func _update_battle_animation(delta: float) -> void:
	_update_battle_float_texts(delta)
	if battle_event_advance_pending:
		battle_event_advance_pending = false
		_advance_battle_after_current_event()
		return
	if battle_action_timer <= 0.0:
		if str(battle_state.get("phase", "command")) == "round_events":
			_advance_battle_after_current_event()
		return
	battle_action_timer = maxf(0.0, battle_action_timer - delta)
	if battle_action_timer <= 0.001:
		battle_action_timer = 0.0
		if battle_current_event.is_empty():
			_advance_battle_after_current_event()
			return
		battle_event_advance_pending = true
		queue_redraw()


func _advance_battle_after_current_event() -> void:
	battle_state = BattleModel.reset_action_states(battle_state)
	battle_current_event.clear()
	battle_current_event_duration = 0.0
	battle_current_event_actor_snapshots.clear()
	_sync_battle_target_selection()
	if battle_end_pending:
		_finish_battle_and_return_to_world()
		return
	if not battle_event_queue.is_empty():
		_play_next_battle_event()
		return
	if battle_enemy_response_pending:
		battle_enemy_response_pending = false
		_battle_enemy_response()
		return
	if _start_round_end_status_events_if_needed():
		return
	_finish_battle_round_and_open_commands()


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
	if _active_dialog_can_claim_quest():
		var claim_result := PlayerProgressModel.claim_active_quest(player_profile)
		player_profile = claim_result.get("profile", player_profile)
		if bool(claim_result.get("ok", false)) and profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		_set_world_log_message(str(claim_result.get("message", "")))
		if bool(claim_result.get("ok", false)):
			_close_dialog()
		else:
			_update_dialog_text()
		if status_label != null:
			_update_hud_text()
		return
	var quest_messages := _record_quest_event_and_maybe_claim({
		"type": "talk",
		"targetId": str(active_dialog_interaction.get("id", "")),
	})
	if not quest_messages.is_empty():
		if profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		_set_world_log_message("\n".join(quest_messages))
		_close_dialog()
		if status_label != null:
			_update_hud_text()
		return
	if _active_dialog_is_healer():
		var heal_result := PlayerProgressModel.apply_village_healer(player_profile)
		player_profile = heal_result.get("profile", player_profile)
		if bool(heal_result.get("ok", false)) and profile_save_enabled:
			PlayerProgressModel.save_profile(player_profile)
		_set_world_log_message(str(heal_result.get("message", "")))
		_update_dialog_text()
		if status_label != null:
			_update_hud_text()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _active_dialog_is_record_point():
		_save_record_point_from_dialog()
		return
	if _active_dialog_is_pet_skill_trainer():
		var trainer_id := str(active_dialog_interaction.get("trainerId", PetSkillTrainingModel.DEFAULT_TRAINER_ID))
		_close_dialog()
		_open_pet_skill_panel(true, trainer_id)
		return
	if str(active_dialog_interaction.get("shopId", "")) != "":
		var next_shop_id := str(active_dialog_interaction.get("shopId", ""))
		_close_dialog()
		_open_shop_panel(next_shop_id)
	else:
		_close_dialog()


func _update_dialog_text() -> void:
	if active_dialog_interaction.is_empty():
		return
	dialog_name_label.text = str(active_dialog_interaction.get("name", "交互"))
	dialog_body_label.text = _dialog_body_for(active_dialog_interaction)
	dialog_option_button.text = _dialog_option_text(active_dialog_interaction)


func _dialog_body_for(item: Dictionary) -> String:
	var lines: Array = item.get("dialog", [])
	if lines.is_empty():
		return "%s：暂时没有更多内容。" % str(item.get("name", "这里"))
	var text_parts: Array[String] = []
	for line in lines:
		text_parts.append(str(line))
	var healer_hint := _dialog_healer_hint_for(item)
	if healer_hint != "":
		text_parts.append("")
		text_parts.append(healer_hint)
	var record_hint := _dialog_record_point_hint_for(item)
	if record_hint != "":
		text_parts.append("")
		text_parts.append(record_hint)
	var quest_hint := _dialog_quest_hint_for(item)
	if quest_hint != "":
		text_parts.append("")
		text_parts.append(quest_hint)
	return "\n".join(text_parts)


func _dialog_option_text(item: Dictionary) -> String:
	if _active_dialog_can_claim_quest():
		return "领取奖励"
	if _active_dialog_matches_talk_quest(item):
		return "完成"
	if _dialog_item_is_healer(item):
		return str(item.get("option", "治疗队伍"))
	if _dialog_item_is_record_point(item):
		return str(item.get("option", "保存"))
	if _dialog_item_is_pet_skill_trainer(item):
		return str(item.get("option", "训练"))
	if str(item.get("shopId", "")) != "":
		return str(item.get("option", "买卖"))
	return str(item.get("option", "知道了"))


func _active_dialog_is_healer() -> bool:
	return _dialog_item_is_healer(active_dialog_interaction)


func _dialog_item_is_healer(item: Dictionary) -> bool:
	return bool(item.get("healer", false)) or str(item.get("actionType", "")) == "healer"


func _active_dialog_is_record_point() -> bool:
	return _dialog_item_is_record_point(active_dialog_interaction)


func _dialog_item_is_record_point(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == "record_point" or str(item.get("kind", "")) == "record_point"


func _active_dialog_is_pet_skill_trainer() -> bool:
	return _dialog_item_is_pet_skill_trainer(active_dialog_interaction)


func _dialog_item_is_pet_skill_trainer(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == "pet_skill_trainer"


func _dialog_record_point_hint_for(item: Dictionary) -> String:
	if not _dialog_item_is_record_point(item):
		return ""
	var current_point := PlayerProgressModel.record_point(player_profile)
	var current_label := str(current_point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	var next_point := _record_point_data_for_dialog(item)
	var next_label := str(next_point.get("label", "记录点"))
	return "当前记录点：%s\n保存为：%s" % [current_label, next_label]


func _record_point_data_for_dialog(item: Dictionary) -> Dictionary:
	var data = item.get("recordPoint", {})
	if data is Dictionary:
		var value := data as Dictionary
		return {
			"mapId": str(value.get("mapId", current_map_id)),
			"spawnName": str(value.get("spawnName", "default")),
			"label": str(value.get("label", item.get("name", "记录点"))),
		}
	return {
		"mapId": current_map_id,
		"spawnName": "default",
		"label": str(item.get("name", "记录点")),
	}


func _save_record_point_from_dialog() -> void:
	var point := _record_point_data_for_dialog(active_dialog_interaction)
	player_profile = PlayerProgressModel.with_record_point(
		player_profile,
		str(point.get("mapId", current_map_id)),
		str(point.get("spawnName", "default")),
		str(point.get("label", "记录点"))
	)
	if profile_save_enabled:
		PlayerProgressModel.save_profile(player_profile)
	_set_world_log_message("记录点已保存：%s。" % str(PlayerProgressModel.record_point(player_profile).get("label", "记录点")))
	_update_dialog_text()
	if status_label != null:
		_update_hud_text()


func _dialog_healer_hint_for(item: Dictionary) -> String:
	if not _dialog_item_is_healer(item):
		return ""
	var quote := PlayerProgressModel.village_healer_quote(player_profile)
	var missing := int(quote.get("missingHp", 0))
	var cost := int(quote.get("cost", 0))
	var coins := int(quote.get("stoneCoins", 0))
	if missing <= 0:
		return "队伍生命已满。\n石币 %d" % coins
	if coins < cost:
		return "需恢复 %d 生命。\n预计费用 %d 石币\n石币不足" % [missing, cost]
	return "需恢复 %d 生命。\n预计费用 %d 石币\n石币 %d" % [missing, cost, coins]


func _active_dialog_can_claim_quest() -> bool:
	if active_dialog_interaction.is_empty():
		return false
	if not PlayerProgressModel.can_claim_active_quest(player_profile):
		return false
	return PlayerProgressModel.active_quest_turn_in_id(player_profile) == str(active_dialog_interaction.get("id", ""))


func _active_dialog_matches_talk_quest(item: Dictionary) -> bool:
	var quest := PlayerProgressModel.active_quest(player_profile)
	if quest.is_empty():
		return false
	var state := PlayerProgressModel.active_quest_state(player_profile)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_ACTIVE:
		return false
	return QuestModel.progress_amount_for_event(quest, {
		"type": "talk",
		"targetId": str(item.get("id", "")),
	}) > 0


func _dialog_quest_hint_for(item: Dictionary) -> String:
	var quest := PlayerProgressModel.active_quest(player_profile)
	if quest.is_empty():
		return ""
	var item_id := str(item.get("id", ""))
	var objective := QuestModel.objective_for(quest)
	var relevant := false
	if item_id == QuestModel.giver_id_for(quest) or item_id == QuestModel.turn_in_id_for(quest):
		relevant = true
	if str(objective.get("targetId", "")) == item_id:
		relevant = true
	if str(item.get("shopId", "")) != "" and str(objective.get("shopId", "")) == str(item.get("shopId", "")):
		relevant = true
	if not relevant:
		return ""
	var lines: Array[String] = []
	if PlayerProgressModel.can_claim_active_quest(player_profile) and item_id == QuestModel.turn_in_id_for(quest):
		lines.append("任务完成：%s" % QuestModel.title_for(quest))
	else:
		lines.append("任务：%s" % QuestModel.title_for(quest))
		lines.append(QuestModel.objective_text_for(quest))
	var reward_text := PlayerProgressModel.quest_reward_text(player_profile)
	if reward_text != "":
		lines.append("奖励：%s" % reward_text)
	return "\n".join(lines)


func _current_task_text() -> String:
	return PlayerProgressModel.quest_progress_text(player_profile)


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


func _on_hang_button_pressed() -> void:
	if player == null:
		return
	if hang_mode_active or player.is_auto_moving() or _encounter_stone_active():
		_stop_hang_activity("挂机已停止。")
		return
	_start_hang_walk()


func _start_hang_walk() -> void:
	if player == null or map_data.is_empty() or battle_active or encounter_active:
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		_set_world_log_message("需要站在遇敌区域，才能开始挂机。")
		return
	_close_dialog()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_shop_panel()
	_close_pet_panel()
	_close_codex_panel()
	_close_quest_panel()
	_clear_encounter_stone_effect(false)
	_set_hang_mode(true)
	_set_world_log_message("开始挂机，会在遇敌区域内来回走动。")


func _set_hang_mode(enabled: bool) -> void:
	hang_mode_active = enabled
	hang_walk_cooldown = 0.0
	if not enabled:
		hang_walk_direction_index = 0
	_sync_hang_button_text()


func _sync_hang_button_text() -> void:
	if stop_button == null:
		return
	if battle_active:
		stop_button.text = "停"
	elif hang_mode_active or _encounter_stone_active() or (player != null and player.is_auto_moving()):
		stop_button.text = "停"
	else:
		stop_button.text = "挂机"


func _update_hang_walk(delta: float) -> void:
	if not hang_mode_active or player == null or map_data.is_empty() or battle_active or encounter_active:
		return
	if has_pending_interaction or _dialog_is_open() or _world_menu_is_open():
		return
	if player.is_auto_moving():
		return
	hang_walk_cooldown = maxf(0.0, hang_walk_cooldown - delta)
	if hang_walk_cooldown > 0.0:
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		_stop_hang_activity("已离开遇敌区域，挂机停止。", false)
		return
	var next_cell := _next_hang_walk_cell(player_cell, zone)
	if next_cell == player_cell:
		_stop_hang_activity("附近没有可走的遇敌格，挂机停止。", false)
		return
	_set_move_target_cell(next_cell, IsoMapModel.grid_to_world(map_data, next_cell), next_cell)
	has_target_marker = false
	has_target_cell = false
	hang_walk_cooldown = HANG_WALK_COOLDOWN_SECONDS


func _next_hang_walk_cell(player_cell: Vector2i, zone: Dictionary) -> Vector2i:
	for attempt in range(HANG_WALK_DIRECTIONS.size()):
		var direction_index := (hang_walk_direction_index + attempt) % HANG_WALK_DIRECTIONS.size()
		var candidate := player_cell + HANG_WALK_DIRECTIONS[direction_index]
		if (
			IsoMapModel.can_step(map_data, player_cell, candidate)
			and EncounterModel.zone_contains_cell(zone, candidate)
		):
			hang_walk_direction_index = (direction_index + 1) % HANG_WALK_DIRECTIONS.size()
			return candidate
	return player_cell


func _stop_auto_move() -> void:
	_stop_hang_activity("", false)


func _stop_hang_activity(message: String = "", clear_stone: bool = true) -> void:
	_set_hang_mode(false)
	if player != null:
		player.clear_move_target()
	_clear_navigation_state()
	if clear_stone:
		_clear_encounter_stone_effect(false)
	_sync_hang_button_text()
	if message != "":
		_set_world_log_message(message)


func _clear_navigation_state() -> void:
	current_path_cells.clear()
	current_path_is_direct = false
	has_target_marker = false
	has_target_cell = false
	_clear_pending_interaction()


func _is_ui_point(point: Vector2) -> bool:
	for control in [top_panel, side_panel, action_bar, player_status_panel, backpack_panel, equipment_panel, shop_panel, pet_panel, pet_skill_panel, codex_panel, quest_panel, training_partner_panel, auto_settings_panel, pet_rename_panel, dialog_panel, encounter_panel, battle_command_panel, battle_auto_stop_button, battle_passive_panel, battle_message_panel]:
		if control != null and control.visible:
			var rect := Rect2(control.global_position, control.size)
			if rect.has_point(point):
				return true
	return false


func _world_menu_is_open() -> bool:
	for control in [player_status_panel, backpack_panel, equipment_panel, shop_panel, pet_panel, pet_skill_panel, codex_panel, quest_panel, training_partner_panel, auto_settings_panel, pet_rename_panel]:
		if control != null and control.visible:
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
	var action_width: float = minf(viewport_size.x - margin * 2.0, ACTION_BAR_SIZE.x)
	var action_size := Vector2(action_width, ACTION_BAR_SIZE.y)
	var top_max_width := 300.0 if battle_active else 520.0
	var top_width: float = minf(viewport_size.x - margin * 2.0, top_max_width)
	var world_menu_open := _world_menu_is_open()
	top_panel.position = Vector2(margin, margin)
	top_panel.size = Vector2(top_width, 56)

	if battle_active:
		side_panel.visible = false
		action_bar.visible = false
	elif is_phone_shape or world_menu_open:
		side_panel.visible = false
		action_bar.visible = not world_menu_open
		if viewport_size.y > viewport_size.x:
			action_bar.position = Vector2(maxf(margin, (viewport_size.x - action_width) * 0.5), viewport_size.y - 104.0)
		else:
			action_bar.position = Vector2(margin, viewport_size.y - 104.0)
		action_bar.size = action_size
	else:
		side_panel.visible = true
		action_bar.visible = true
		side_panel.position = Vector2(viewport_size.x - 286.0, margin)
		side_panel.size = Vector2(268, 128)
		action_bar.position = Vector2(viewport_size.x - action_width - margin, viewport_size.y - 104.0)
		action_bar.size = action_size

	var dialog_width: float = minf(viewport_size.x - margin * 2.0, 560.0)
	var dialog_height := DIALOG_PANEL_HEIGHT
	var reserved_bottom := 160.0 if (is_phone_shape or (action_bar != null and action_bar.visible)) else 24.0
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

	var pet_width: float = minf(viewport_size.x - margin * 2.0, PET_PANEL_MAX_SIZE.x)
	var pet_height: float = minf(viewport_size.y - margin * 2.0 - 70.0, PET_PANEL_MAX_SIZE.y)
	pet_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), pet_width)
	pet_height = maxf(minf(PET_PANEL_MIN_SIZE.y, viewport_size.y - margin * 2.0), pet_height)
	player_status_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	player_status_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		player_status_panel.visible = false
	if player_status_panel.visible and action_bar != null:
		action_bar.visible = false

	backpack_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	backpack_panel.size = Vector2(pet_width, pet_height)
	if backpack_grid != null:
		backpack_grid.columns = _backpack_grid_columns()
	if battle_active:
		backpack_panel.visible = false
	if backpack_panel.visible and action_bar != null:
		action_bar.visible = false

	equipment_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	equipment_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		equipment_panel.visible = false
	if equipment_panel.visible and action_bar != null:
		action_bar.visible = false

	var shop_width: float = minf(viewport_size.x - margin * 2.0, 940.0)
	var shop_height: float = minf(viewport_size.y - margin * 2.0 - 70.0, 620.0)
	shop_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), shop_width)
	shop_height = maxf(minf(PET_PANEL_MIN_SIZE.y, viewport_size.y - margin * 2.0), shop_height)
	shop_panel.position = Vector2((viewport_size.x - shop_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - shop_height) * 0.5))
	shop_panel.size = Vector2(shop_width, shop_height)
	if battle_active:
		shop_panel.visible = false
	if shop_panel.visible and action_bar != null:
		action_bar.visible = false

	pet_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	pet_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		pet_panel.visible = false
	if pet_panel.visible and action_bar != null:
		action_bar.visible = false

	pet_skill_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	pet_skill_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		pet_skill_panel.visible = false
	if pet_skill_panel.visible and action_bar != null:
		action_bar.visible = false

	var codex_width := pet_width
	var codex_height := pet_height
	codex_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	codex_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		codex_panel.visible = false
	if codex_panel.visible and action_bar != null:
		action_bar.visible = false

	quest_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	quest_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		quest_panel.visible = false
	if quest_panel.visible and action_bar != null:
		action_bar.visible = false

	training_partner_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	training_partner_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		training_partner_panel.visible = false
	if training_partner_panel.visible and action_bar != null:
		action_bar.visible = false

	auto_settings_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	auto_settings_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		auto_settings_panel.visible = false
	if auto_settings_panel.visible and action_bar != null:
		action_bar.visible = false

	var rename_width: float = minf(viewport_size.x - margin * 2.0, 390.0)
	var rename_height := 162.0
	pet_rename_panel.position = Vector2((viewport_size.x - rename_width) * 0.5, maxf(margin + 92.0, (viewport_size.y - rename_height) * 0.5))
	pet_rename_panel.size = Vector2(rename_width, rename_height)
	if battle_active:
		pet_rename_panel.visible = false

	var battle_panel_size := _battle_command_panel_size(viewport_size)
	var battle_width := battle_panel_size.x
	var battle_height := battle_panel_size.y
	var battle_x := viewport_size.x - battle_width - margin
	var battle_y := margin
	if battle_x < top_panel.position.x + top_panel.size.x + margin:
		battle_y = top_panel.position.y + top_panel.size.y + 10.0
	battle_command_panel.position = Vector2(
		maxf(margin, battle_x),
		battle_y
	)
	battle_command_panel.size = Vector2(battle_width, battle_height)
	battle_command_panel.visible = _battle_command_panel_should_be_visible()
	if battle_auto_stop_button != null:
		var stop_size := Vector2(86.0, 44.0)
		battle_auto_stop_button.position = Vector2(viewport_size.x - stop_size.x - margin, margin)
		battle_auto_stop_button.size = stop_size
	_sync_battle_auto_button()

	var passive_width: float = minf(viewport_size.x - margin * 2.0, 560.0)
	var passive_height := BATTLE_PASSIVE_PANEL_HEIGHT if viewport_size.y >= 460.0 else BATTLE_PASSIVE_PANEL_COMPACT_HEIGHT
	var passive_y := margin
	if viewport_size.x < 980.0:
		passive_y = top_panel.position.y + top_panel.size.y + 8.0
	battle_passive_panel.position = Vector2((viewport_size.x - passive_width) * 0.5, passive_y)
	battle_passive_panel.size = Vector2(passive_width, passive_height)
	battle_passive_label.position = BATTLE_PASSIVE_PANEL_PADDING
	battle_passive_label.size = Vector2(
		maxf(0.0, passive_width - BATTLE_PASSIVE_PANEL_PADDING.x * 2.0),
		maxf(0.0, passive_height - BATTLE_PASSIVE_PANEL_PADDING.y * 2.0)
	)
	if battle_passive_panel.visible and battle_passive_label != null and battle_passive_label.text == "":
		battle_passive_panel.visible = false

	var message_width: float = minf(viewport_size.x - margin * 2.0, 390.0 if is_phone_shape else 560.0)
	var message_height := 112.0 if is_phone_shape else 126.0
	var message_y := viewport_size.y - message_height - margin
	if is_phone_shape and action_bar != null and action_bar.visible:
		message_y = action_bar.position.y - message_height - 8.0
	battle_message_panel.position = Vector2(margin, maxf(margin + 68.0, message_y))
	battle_message_panel.size = Vector2(message_width, message_height)
	battle_message_panel.visible = battle_active or world_log_message != ""

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
		detail_label.text = "坐标  %d,%d\n目标  %s\n伙伴  %d/4\n任务  -  %s" % [
			player_cell.x,
			player_cell.y,
			target_text,
			PlayerProgressModel.training_partner_count(player_profile),
			_current_task_text(),
		]
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()


func _layout_size() -> Vector2:
	return get_viewport_rect().size


func _is_phone_shape(size: Vector2) -> bool:
	return minf(size.x, size.y) < 520.0 or size.x < 760.0 or size.y > size.x


func _battle_command_panel_height(size: Vector2) -> float:
	return _battle_command_panel_size(size).y


func _battle_command_panel_size(size: Vector2) -> Vector2:
	var target_size := BATTLE_COMMAND_PLAYER_SIZE if battle_command_owner == "player" else BATTLE_COMMAND_MENU_SIZE
	var width := minf(size.x - 36.0, target_size.x)
	var height := minf(size.y - 36.0, target_size.y)
	if battle_command_owner == "player" and size.y < 460.0:
		height = minf(size.y - 36.0, 158.0)
	return Vector2(maxf(248.0, width), maxf(158.0, height))


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
	_draw_ground_pet_drops()
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
	var home_pos := _battle_slot_world_position(str(actor.get("slotId", "")))
	var pos := home_pos
	var actor_id := str(actor.get("id", ""))
	var side := str(actor.get("side", ""))
	var kind := str(actor.get("kind", ""))
	var state := str(actor.get("actionState", "idle"))
	var launched_active := state == "launched" and _battle_actor_is_current_launch_target(actor_id)
	if state == "launched" and not launched_active:
		return
	var visual_scale := _battle_actor_visual_scale()
	var launch_rotation := _battle_launched_actor_rotation(actor_id) if launched_active else 0.0
	var large_formation := _battle_uses_10v10_formation_template()
	var event_offset := _battle_actor_event_offset(actor, home_pos, visual_scale)
	pos += event_offset
	if large_formation and event_offset.length() > 2.0 and int(actor.get("hp", 0)) > 0:
		_draw_battle_actor_home_shadow(actor, home_pos, visual_scale, side, kind)
	var show_actor_name := _battle_should_show_actor_label(actor)
	var compact_labels := large_formation or _layout_size().y < 460.0
	var hp_offset := (-42.0 if large_formation else (-54.0 if compact_labels else -82.0)) * visual_scale
	var name_offset := (-62.0 if large_formation else (-70.0 if compact_labels else -94.0)) * visual_scale
	pos += _battle_actor_state_offset(state, side, visual_scale)
	if state == "launched":
		pos += _battle_launched_actor_offset(actor, visual_scale)
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
		_draw_battle_actor_label(actor, pos + Vector2(0, name_offset), visual_scale, alpha, compact_labels)
	if int(actor.get("hp", 0)) > 0:
		_draw_battle_status_badges(actor, pos + Vector2(0, hp_offset - 17.0 * visual_scale), visual_scale, alpha)


func _draw_battle_actor_home_shadow(actor: Dictionary, home_pos: Vector2, visual_scale: float, side: String, kind: String) -> void:
	var alpha := 0.34
	var color := Color(0.40, 0.74, 1.0, alpha)
	if kind == "pet":
		color = Color(0.54, 0.95, 0.58, alpha)
	elif kind == "wild_pet":
		color = Color(1.0, 0.62, 0.34, alpha)
	elif side == BattleModel.SIDE_ALLY:
		color = Color(0.45, 0.78, 1.0, alpha)
	var center := home_pos + Vector2(0, 28.0) * visual_scale
	var radius := 20.0 * visual_scale
	draw_circle(center, radius, Color(0.02, 0.03, 0.03, 0.14))
	draw_circle(center, radius * 0.62, Color(color.r, color.g, color.b, 0.10))
	draw_arc(center, radius, 0.0, PI * 2.0, 28, color, maxf(1.5, 2.4 * visual_scale), true)


func _draw_battle_actor_label(actor: Dictionary, center: Vector2, visual_scale: float, alpha: float, compact: bool) -> void:
	var label := _battle_actor_label(actor)
	if label == "":
		return
	var font := ThemeDB.fallback_font
	var label_width := (112.0 if compact else 132.0) * visual_scale
	var font_size := maxi(9, int(round((11.0 if compact else 15.0) * visual_scale)))
	var origin := center + Vector2(-label_width * 0.5, 0)
	draw_string(font, origin + Vector2(1, 1), label, HORIZONTAL_ALIGNMENT_CENTER, label_width, font_size, Color(0.05, 0.06, 0.05, 0.72 * alpha))
	draw_string(font, origin, label, HORIZONTAL_ALIGNMENT_CENTER, label_width, font_size, Color(0.96, 0.93, 0.80, alpha))


func _battle_actor_label(actor: Dictionary) -> String:
	var actor_name := str(actor.get("name", "")).strip_edges()
	if actor_name == "":
		return ""
	var level := maxi(1, int(actor.get("level", 1)))
	return "%s Lv%d" % [actor_name, level]


func _battle_should_show_actor_label(actor: Dictionary) -> bool:
	return _battle_actor_label(actor) != ""


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


func _draw_battle_status_badges(actor: Dictionary, origin: Vector2, visual_scale: float, alpha: float) -> void:
	var status_ids := BattleStatusModel.active_status_ids(actor)
	if status_ids.is_empty():
		return
	var font := ThemeDB.fallback_font
	var badge_size := maxf(15.0, 18.0 * visual_scale)
	var spacing := badge_size + 2.0 * visual_scale
	var start_x := -spacing * float(status_ids.size() - 1) * 0.5
	for index in range(status_ids.size()):
		var status_id := status_ids[index]
		var badge_center := origin + Vector2(start_x + spacing * float(index), 0)
		var fill := _battle_status_badge_color(status_id)
		fill.a *= alpha
		draw_circle(badge_center, badge_size * 0.5, Color(0.05, 0.07, 0.06, 0.72 * alpha))
		draw_circle(badge_center, badge_size * 0.42, fill)
		var text := _battle_status_badge_text(status_id)
		draw_string(font, badge_center + Vector2(-badge_size * 0.48, badge_size * 0.25), text, HORIZONTAL_ALIGNMENT_CENTER, badge_size, maxi(9, int(round(12.0 * visual_scale))), Color(0.08, 0.08, 0.06, 0.95 * alpha))


func _battle_status_badge_text(status_id: String) -> String:
	match status_id:
		BattleModel.STATUS_POISON:
			return "毒"
		BattleModel.STATUS_SLEEP:
			return "眠"
		BattleModel.STATUS_CONFUSION:
			return "乱"
		BattleModel.STATUS_STONE:
			return "石"
		_:
			return "?"


func _battle_status_badge_color(status_id: String) -> Color:
	match status_id:
		BattleModel.STATUS_POISON:
			return Color(0.62, 0.90, 0.28, 0.95)
		BattleModel.STATUS_SLEEP:
			return Color(0.48, 0.68, 1.0, 0.95)
		BattleModel.STATUS_CONFUSION:
			return Color(0.96, 0.55, 0.85, 0.95)
		BattleModel.STATUS_STONE:
			return Color(0.72, 0.75, 0.70, 0.95)
		_:
			return Color(0.95, 0.88, 0.36, 0.95)


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


func _battle_actor_state_offset(state: String, side: String, visual_scale: float) -> Vector2:
	match state:
		"spirit":
			return Vector2(-18, -18) * visual_scale
		"capture":
			return Vector2(-14, -20) * visual_scale
		"hit":
			return Vector2(sin(battle_action_timer * 80.0) * 5.0 * visual_scale, 0)
		"dodge":
			return (Vector2(18, -8) if side == BattleModel.SIDE_ALLY else Vector2(-18, 8)) * visual_scale
		"down", "captured":
			return Vector2(0, 16) * visual_scale
		_:
			return Vector2.ZERO


func _battle_rotated_visual_offset(offset: Vector2, visual_scale: float, rotation_angle: float) -> Vector2:
	return offset.rotated(rotation_angle) * visual_scale


func _battle_actor_event_offset(actor: Dictionary, base_pos: Vector2, visual_scale: float) -> Vector2:
	if battle_current_event.is_empty():
		return Vector2.ZERO
	var event_type := str(battle_current_event.get("type", ""))
	if not ["attack", "skill_attack", "combo_attack", "counter_attack"].has(event_type):
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
	var timeline = battle_current_event.get("timeline", {}) if not battle_current_event.is_empty() else {}
	if timeline is Dictionary and (timeline as Dictionary).has("launchStartProgress"):
		launch_start = clampf(float((timeline as Dictionary).get("launchStartProgress", launch_start)), 0.0, 1.0)
	if progress <= launch_start:
		return 0.0
	var remaining_progress := (progress - launch_start) / maxf(0.01, 1.0 - launch_start)
	return clampf(remaining_progress / BATTLE_LAUNCH_FINISH_HOLD_RATIO, 0.0, 1.0)


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
	var scale := 1.0
	if _battle_uses_10v10_formation_template():
		scale = 0.74
	if _layout_size().y < 460.0:
		scale *= 0.84
	return scale


func _battle_uses_10v10_formation_template() -> bool:
	return BattleModel.uses_10v10_formation(battle_state)


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
	var large_formation := _battle_uses_10v10_formation_template()
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
		elif item_kind == "record_point":
			draw_rect(Rect2(marker + Vector2(-7, -26), Vector2(14, 36)), Color(0.56, 0.62, 0.66, 0.98), true)
			draw_line(marker + Vector2(-13, -18), marker + Vector2(13, -18), Color(0.95, 0.82, 0.46, 0.95), 4.0)
			draw_circle(marker + Vector2(0, -31), 9.0, Color(0.98, 0.78, 0.34, 0.98))
			draw_arc(marker + Vector2(0, -31), 13.0, 0.0, TAU, 24, Color(0.55, 0.79, 1.0, 0.76), 2.0, true)
		else:
			var blocks_movement := InteractionModel.blocks_movement(item)
			var body_color := Color(0.74, 0.36, 0.25, 0.98) if blocks_movement else Color(0.22, 0.58, 0.66, 0.98)
			var trim_color := Color(0.99, 0.82, 0.45, 0.95) if blocks_movement else Color(0.58, 0.89, 0.78, 0.95)
			draw_circle(marker + Vector2(0, -9), 8.0, Color(0.99, 0.76, 0.46, 0.98))
			draw_rect(Rect2(marker + Vector2(-8, -1), Vector2(16, 20)), body_color, true)
			draw_line(marker + Vector2(-13, 8), marker + Vector2(13, 8), trim_color, 3.0)


func _draw_ground_pet_drops() -> void:
	var font := ThemeDB.fallback_font
	for drop in PlayerProgressModel.ground_pet_drops_on_map(player_profile, current_map_id):
		var cell := PlayerProgressModel.ground_pet_drop_cell(drop)
		var center := IsoMapModel.grid_to_world(map_data, cell)
		var marker := _ground_pet_marker_world_position(drop)
		var selected := (
			has_pending_interaction
			and str(pending_interaction.get("kind", "")) == "ground_pet_drop"
			and str(pending_interaction.get("dropId", "")) == str(drop.get("dropId", ""))
		)
		if selected:
			_draw_iso_tile(center, Color(0.97, 0.75, 0.22, 0.18), Color(0.98, 0.80, 0.28, 0.7))
			draw_arc(marker + Vector2(0, 12), 24.0, 0.0, TAU, 32, Color(1.0, 0.82, 0.25, 0.95), 3.0, true)
		var pet_instance := PlayerProgressModel.ground_pet_drop_pet(drop)
		var body_color := _ground_pet_body_color(pet_instance)
		var trim_color := Color(1.0, 0.86, 0.42, 0.96)
		draw_circle(marker + Vector2(0, 22), 20.0, Color(0.0, 0.0, 0.0, 0.22))
		draw_circle(marker + Vector2(0, 0), 17.0, body_color)
		draw_polygon(PackedVector2Array([
			marker + Vector2(-10, -12),
			marker + Vector2(-2, -29),
			marker + Vector2(3, -12),
		]), PackedColorArray([trim_color, trim_color, trim_color]))
		draw_circle(marker + Vector2(-6, -3), 3.0, Color(0.08, 0.10, 0.09, 0.95))
		draw_line(marker + Vector2(-11, 12), marker + Vector2(11, 12), trim_color, 3.0, true)
		var name := str(pet_instance.get("name", "宠物"))
		draw_string(font, marker + Vector2(-48, -38), name, HORIZONTAL_ALIGNMENT_CENTER, 96.0, 14, Color(0.07, 0.09, 0.08, 0.72))
		draw_string(font, marker + Vector2(-48, -39), name, HORIZONTAL_ALIGNMENT_CENTER, 96.0, 14, Color(0.98, 0.92, 0.72, 0.96))


func _ground_pet_body_color(instance: Dictionary) -> Color:
	var elements = instance.get("elements", {})
	if elements is Dictionary:
		var element_dict := elements as Dictionary
		if int(element_dict.get("fire", 0)) >= 5:
			return Color(0.84, 0.37, 0.25, 0.98)
		if int(element_dict.get("water", 0)) >= 5:
			return Color(0.28, 0.55, 0.86, 0.98)
		if int(element_dict.get("earth", 0)) >= 5:
			return Color(0.62, 0.50, 0.28, 0.98)
		if int(element_dict.get("wind", 0)) >= 5:
			return Color(0.45, 0.76, 0.43, 0.98)
	return Color(0.72, 0.58, 0.38, 0.98)


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
