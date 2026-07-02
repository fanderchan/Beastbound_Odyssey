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
const ServerBattleCoordinator := preload("res://scripts/battle/server_battle_coordinator.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")
const ServerSyncCoordinator := preload("res://scripts/net/server_sync_coordinator.gd")
const AccountAuthModel := preload("res://scripts/progression/account_auth_model.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const BattleResultReceiptModel := preload("res://scripts/progression/battle_result_receipt_model.gd")
const AutoBattleSettingsModel := preload("res://scripts/progression/auto_battle_settings_model.gd")
const AutoCaptureSettingsModel := preload("res://scripts/progression/auto_capture_settings_model.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const CombatFormulaCandidateModel := preload("res://scripts/progression/combat_formula_candidate_model.gd")
const CombatFormulaDriverABModel := preload("res://scripts/progression/combat_formula_driver_ab_model.gd")
const CombatFormulaShadowModel := preload("res://scripts/progression/combat_formula_shadow_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const EquipmentSynthesisModel := preload("res://scripts/progression/equipment_synthesis_model.gd")
const GmToolRuntimeModel := preload("res://scripts/progression/gm_tool_runtime_model.gd")
const HangSettingsModel := preload("res://scripts/progression/hang_settings_model.gd")
const MapRegionCatalog := preload("res://scripts/world/map_region_catalog.gd")
const NumericBalanceGateModel := preload("res://scripts/progression/numeric_balance_gate_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")
const NumericEconomyLedgerModel := preload("res://scripts/progression/numeric_economy_ledger_model.gd")
const NumericExperimentModel := preload("res://scripts/progression/numeric_experiment_model.gd")
const NumericWorkbenchModel := preload("res://scripts/progression/numeric_workbench_model.gd")
const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")
const PetGrowthRadarControl := preload("res://scripts/ui/pet_growth_radar_control.gd")
const BackpackPanelPresenter := preload("res://scripts/ui/backpack_panel_presenter.gd")
const PanelRegistry := preload("res://scripts/ui/panel_registry.gd")
const QaPanelCatalog := preload("res://scripts/ui/qa_panel_catalog.gd")
const QaPanelPresenter := preload("res://scripts/ui/qa_panel_presenter.gd")
const DialogQuestCoordinator := preload("res://scripts/ui/dialog_quest_coordinator.gd")
const AutoCheckCoordinator := preload("res://scripts/qa/auto_check_coordinator.gd")
const PetGrowthSpeciesSimulationModel := preload("res://scripts/progression/pet_growth_species_simulation_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetRebirthMmModel := preload("res://scripts/progression/pet_rebirth_mm_model.gd")
const PetSkillTrainingModel := preload("res://scripts/progression/pet_skill_training_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const QuestModel := preload("res://scripts/progression/quest_model.gd")
const RebirthModel := preload("res://scripts/progression/rebirth_model.gd")
const RebirthTrialModel := preload("res://scripts/progression/rebirth_trial_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")
const ServerAuthContractModel := preload("res://scripts/progression/server_auth_contract_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")
const AUTH_SERVER_ONLY := true
const START_MAP_ID := "firebud_training_yard"
const GM_10V10_MAP_ID := "gm_10v10_training_ground"
const GM_TOOL_EXTRA_COMMAND_IDS: Array[String] = ["gm_grant_pet", "gm_level_pet"]
const FIREBUD_EQUIPMENT_SHOP_ID := "firebud_equipment_shop"
const EQUIP_FRAG_WOOD_BASIC_ID := "equip_frag_wood_basic"
const EQUIP_FRAG_HIDE_BASIC_ID := "equip_frag_hide_basic"
const MAP_DATA_PATHS := {
	"firebud_training_yard": "res://data/firebud_training_map.json",
	"firebud_village_gate": "res://data/firebud_village_gate_map.json",
	"earth_vein_cave": "res://data/earth_vein_cave_map.json",
	"earth_vein_cave_f2": "res://data/earth_vein_cave_f2_map.json",
	"earth_vein_cave_f3": "res://data/earth_vein_cave_f3_map.json",
	"earth_vein_cave_f4": "res://data/earth_vein_cave_f4_map.json",
	"tide_echo_cave": "res://data/tide_echo_cave_map.json",
	"tide_echo_cave_f2": "res://data/tide_echo_cave_f2_map.json",
	"tide_echo_cave_f3": "res://data/tide_echo_cave_f3_map.json",
	"tide_echo_cave_f4": "res://data/tide_echo_cave_f4_map.json",
	"ember_core_cave": "res://data/ember_core_cave_map.json",
	"ember_core_cave_f2": "res://data/ember_core_cave_f2_map.json",
	"ember_core_cave_f3": "res://data/ember_core_cave_f3_map.json",
	"ember_core_cave_f4": "res://data/ember_core_cave_f4_map.json",
	"gale_breath_cave": "res://data/gale_breath_cave_map.json",
	"gale_breath_cave_f2": "res://data/gale_breath_cave_f2_map.json",
	"gale_breath_cave_f3": "res://data/gale_breath_cave_f3_map.json",
	"gale_breath_cave_f4": "res://data/gale_breath_cave_f4_map.json",
	"shadow_oath_cavern": "res://data/shadow_oath_cavern_map.json",
	"shadow_oath_cavern_f2": "res://data/shadow_oath_cavern_f2_map.json",
	"shadow_oath_cavern_f3": "res://data/shadow_oath_cavern_f3_map.json",
	"shadow_oath_cavern_f4": "res://data/shadow_oath_cavern_f4_map.json",
	"shadow_oath_cavern_f5": "res://data/shadow_oath_cavern_f5_map.json",
	"level_grass_trial_ground": "res://data/level_grass_trial_ground_map.json",
	"gm_10v10_training_ground": "res://data/gm_10v10_training_ground_map.json",
}
const MIN_TOUCH_BUTTON_SIZE := Vector2(64, 64)
const ACTION_BAR_SIZE := Vector2(566, 86)
const DIALOG_PANEL_HEIGHT := 214.0
const PET_PANEL_MIN_SIZE := Vector2(560.0, 360.0)
const PET_PANEL_MAX_SIZE := Vector2(760.0, 468.0)
const PET_MANAGEMENT_PANEL_MAX_SIZE := Vector2(980.0, 560.0)
const WORLD_LOG_MAX_LINES := 80
const CHAT_MAX_MESSAGES := 120
const CHAT_CHANNEL_SYSTEM := "system"
const CHAT_CHANNEL_NEARBY := "nearby"
const CHAT_CHANNEL_TEAM := "team"
const ONLINE_POSITION_SYNC_INTERVAL_SECONDS := 1.2
const ONLINE_POSITION_MAX_REMOTE_PLAYERS := 24
const ONLINE_POSITION_AOI_RADIUS_CELLS := 18
const SERVER_STEP_MOVE_MAX_SYNC_RETRIES := 2
const SERVER_EVENT_RECONNECT_SECONDS := 3.0
const SERVER_EVENT_MAX_PACKETS_PER_FRAME := 8
const SERVER_EVENT_SEEN_MAX := 40
const SERVER_BATTLE_WAITING_POLL_SECONDS := 1.0
const SERVER_BATTLE_ROOM_RESTORE_POLL_SECONDS := 1.0
const PET_REST_RECOVER_INTERVAL_SECONDS := 5.0
const PET_DETAIL_MODE_INSTANCE := "instance"
const PET_DETAIL_MODE_CODEX := "codex"
const PET_DETAIL_MODE_GROWTH := "growth"
const PET_FILTER_ALL := "all"
const PET_FILTER_PARTY := "party"
const PET_FILTER_STORAGE := "storage"
const PET_FILTER_LEVEL_ONE := "level_one"
const PET_FILTER_LOW_POWER := "low_power"
const PET_FILTER_NEW := "new"
const BACKPACK_FILTER_ALL := BackpackPanelPresenter.FILTER_ALL
const BACKPACK_FILTER_WORLD := BackpackPanelPresenter.FILTER_WORLD
const BACKPACK_FILTER_BATTLE := BackpackPanelPresenter.FILTER_BATTLE
const BACKPACK_FILTER_CAPTURE := BackpackPanelPresenter.FILTER_CAPTURE
const BACKPACK_FILTER_EQUIPMENT := BackpackPanelPresenter.FILTER_EQUIPMENT
const PET_SORT_DEFAULT := "default"
const PET_SORT_LEVEL := "level"
const PET_SORT_POWER := "power"
const PET_SORT_SPECIES := "species"
const PET_SORT_CAPTURED := "captured"
const PET_LOW_POWER_FILTER_THRESHOLD := 31
const BATTLE_COMMAND_PLAYER_SIZE := Vector2(390.0, 170.0)
const BATTLE_COMMAND_MENU_SIZE := Vector2(300.0, 440.0)
const BATTLE_COMMAND_BUTTON_ORDER: Array[String] = ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run", "help"]
const BATTLE_COMMAND_COUNTDOWN_SECONDS := 99.0
const BATTLE_TEAM_COMPANION_SLOT_NUMBERS: Array[int] = [1, 2, 4, 5]
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
const GM_BATTLE_SPEED_MIN := 1
const GM_BATTLE_SPEED_MAX := 10
const ENCOUNTER_POST_BATTLE_GRACE_SECONDS := 1.0
const ENCOUNTER_SAFE_STEPS := 2
const ENCOUNTER_STONE_LOW_ID := "encounter_stone_low"
const ENCOUNTER_STONE_MID_ID := "encounter_stone_mid"
const ENCOUNTER_STONE_HIGH_ID := "encounter_stone_high"
const HANG_WALK_COOLDOWN_SECONDS := 0.14
const EQUIPMENT_COMPARE_GAIN_COLOR := "#79d982"
const EQUIPMENT_COMPARE_LOSS_COLOR := "#ff746a"
const ACTIVE_TARGET_FPS := 60
const IDLE_TARGET_FPS := 30
const WORLD_HUD_REFRESH_INTERVAL_SECONDS := 0.20
const CLICK_MOVE_REPATH_INTERVAL_SECONDS := 0.10
const BACKPACK_HEAL_POPUP_DURATION_SECONDS := 2.0
const DIALOG_ACTION_ACK := "ack"
const DIALOG_ACTION_CLAIM_QUEST := "claim_quest"
const DIALOG_ACTION_TALK_QUEST := "talk_quest"
const DIALOG_ACTION_CLAIM_OPTIONAL_QUEST := "claim_optional_quest"
const DIALOG_ACTION_TALK_OPTIONAL_QUEST := "talk_optional_quest"
const DIALOG_ACTION_HEAL := "heal"
const DIALOG_ACTION_RECORD_POINT := "record_point"
const DIALOG_ACTION_PET_SKILL_TRAIN := "pet_skill_train"
const DIALOG_ACTION_PET_SKILL_OVERWRITE := "pet_skill_overwrite"
const DIALOG_ACTION_STABLE := "stable"
const DIALOG_ACTION_SHOP := "shop"
const DIALOG_ACTION_OPEN_QUEST := "open_quest"
const DIALOG_ACTION_REBIRTH := "rebirth"
const DIALOG_ACTION_BACKPACK_UNLOCK := "backpack_unlock"
const DIALOG_ACTION_GUARDIAN_BATTLE := "guardian_battle"
const DIALOG_ACTION_CLAIM_MM_STAGE2 := "claim_mm_stage2"
const DIALOG_ACTION_START_MM_GUIDE := "start_mm_guide"
const QUEST_MARKER_NONE := ""
const QUEST_MARKER_AVAILABLE := "available"
const QUEST_MARKER_BLOCKED := "blocked"
const QUEST_MARKER_IN_PROGRESS := "in_progress"
const QUEST_MARKER_READY := "ready"
const QUEST_MARKER_REBIRTH_AVAILABLE := "rebirth_available"
const QUEST_MARKER_REBIRTH_READY := "rebirth_ready"
const QUEST_MARKER_REPEATABLE := "repeatable"
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
var path_line_node: Line2D
var hud_root: Control
var panel_registry
var top_panel: PanelContainer
var side_panel: PanelContainer
var action_bar: PanelContainer
var dialog_panel: PanelContainer
var status_label: Label
var detail_label: Label
var task_route_button: Button
var dialog_name_label: Label
var dialog_body_label: Label
var dialog_button_row: HBoxContainer
var dialog_option_button: Button
var dialog_close_button: Button
var dialog_secondary_buttons: Array[Button] = []
var encounter_panel: PanelContainer
var encounter_title_label: Label
var encounter_body_label: Label
var encounter_enter_button: Button
var encounter_retreat_button: Button
var battle_command_panel: PanelContainer
var battle_command_title_label: Label
var battle_round_panel: PanelContainer
var battle_round_label: Label
var battle_timer_panel: PanelContainer
var battle_timer_label: Label
var battle_auto_button: Button
var battle_auto_stop_button: Button
var battle_command_button_grid: GridContainer
var battle_passive_panel: Panel
var battle_passive_label: Label
var battle_message_panel: PanelContainer
var battle_log_label: RichTextLabel
var battle_message_expand_button: Button
var battle_message_clear_button: Button
var battle_command_buttons: Dictionary = {}
var stop_button: Button
var ring_button: Button
var quick_slot_buttons: Array[Button] = []
var player_status_menu_button: Button
var bag_menu_button: Button
var equipment_menu_button: Button
var pet_menu_button: Button
var codex_menu_button: Button
var quest_menu_button: Button
var map_menu_button: Button
var chat_menu_button: Button
var party_menu_button: Button
var mailbox_menu_button: Button
var training_partner_menu_button: Button
var auto_settings_menu_button: Button
var account_menu_button: Button
var qa_menu_button: Button
var auth_panel: PanelContainer
var auth_title_label: Label
var auth_message_label: Label
var auth_username_input: LineEdit
var auth_password_input: LineEdit
var auth_display_name_input: LineEdit
var auth_source_option: OptionButton
var auth_server_url_input: LineEdit
var auth_remember_check: CheckBox
var auth_login_tab_button: Button
var auth_register_tab_button: Button
var auth_submit_button: Button
var auth_http_request: HTTPRequest
var profile_sync_http_request: HTTPRequest
var server_sync_coordinator
var account_panel: PanelContainer
var account_info_label: Label
var account_switch_button: Button
var account_close_button: Button
var backpack_panel: PanelContainer
var backpack_grid: GridContainer
var backpack_detail_label: RichTextLabel
var backpack_use_button: Button
var backpack_quick_bind_row: HBoxContainer
var backpack_quick_bind_buttons: Array[Button] = []
var backpack_target_scroll: ScrollContainer
var backpack_target_container: VBoxContainer
var backpack_close_button: Button
var backpack_equip_button: Button
var backpack_slot_buttons: Array[Button] = []
var backpack_filter_buttons: Dictionary = {}
var backpack_selected_slot_index: int = 0
var backpack_filter: String = BACKPACK_FILTER_ALL
var backpack_pending_use_item_id: String = ""
var player_status_panel: PanelContainer
var player_status_detail_label: RichTextLabel
var player_status_points_label: Label
var player_status_stat_point_buttons: Dictionary = {}
var player_status_rebirth_button: Button
var player_status_equipment_button: Button
var player_status_close_button: Button
var player_rebirth_preview_panel: PanelContainer
var player_rebirth_preview_label: RichTextLabel
var player_rebirth_execute_button: Button
var player_rebirth_preview_close_button: Button
var player_rebirth_confirm_pending: bool = false
var player_rebirth_request_pending: bool = false
var quest_action_request_pending: bool = false
var server_quest_record_event_queue: Array[Dictionary] = []
var server_quest_record_event_queue_running: bool = false
var profile_action_request_pending: bool = false
var equipment_panel: PanelContainer
var equipment_grid: Control
var equipment_stats_label: Label
var equipment_detail_label: Label
var equipment_unequip_button: Button
var equipment_enhance_button: Button
var equipment_synthesis_open_button: Button
var equipment_close_button: Button
var equipment_slot_buttons: Dictionary = {}
var equipment_selected_slot_id: String = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
var equipment_action_request_pending: bool = false
var equipment_synthesis_panel: PanelContainer
var equipment_synthesis_list_container: VBoxContainer
var equipment_synthesis_detail_label: RichTextLabel
var equipment_synthesis_action_button: Button
var equipment_synthesis_back_button: Button
var equipment_synthesis_close_button: Button
var equipment_synthesis_recipe_buttons: Dictionary = {}
var equipment_synthesis_selected_recipe_id: String = ""
var shop_panel: PanelContainer
var shop_title_label: Label
var shop_coin_label: Label
var shop_buy_button: Button
var shop_sell_button: Button
var shop_list_container: VBoxContainer
var shop_detail_label: RichTextLabel
var shop_quantity_minus_button: Button
var shop_quantity_spinbox: SpinBox
var shop_quantity_plus_button: Button
var shop_quantity_max_button: Button
var shop_equip_after_buy_button: Button
var shop_action_button: Button
var shop_repair_button: Button
var shop_close_button: Button
var shop_item_buttons: Dictionary = {}
var shop_active_id: String = ShopCatalogModel.DEFAULT_SHOP_ID
var shop_mode: String = "buy"
var shop_selected_item_id: String = ""
var shop_quantity: int = 1
var shop_equip_after_buy: bool = false
var shop_action_request_pending: bool = false
var shop_cached_backpack_slots: Array[Dictionary] = []
var shop_cached_backpack_counts: Dictionary = {}
var shop_detail_text_cache: Dictionary = {}
var shop_equip_check_cache: Dictionary = {}
var shop_quantity_max_cache: Dictionary = {}
var shop_detail_update_queued: bool = false
var shop_pending_detail_bbcode_enabled: bool = false
var shop_pending_detail_item_id: String = ""
var shop_pending_detail_count: int = 0
var pet_panel: PanelContainer
var pet_filter_option: OptionButton
var pet_sort_option: OptionButton
var pet_sort_direction_button: Button
var pet_list_container: VBoxContainer
var pet_detail_scroll: ScrollContainer
var pet_detail_label: Label
var pet_detail_instance_button: Button
var pet_detail_codex_button: Button
var pet_detail_growth_button: Button
var pet_growth_stage_row: HBoxContainer
var pet_growth_stage_buttons: Dictionary = {}
var pet_growth_stage: int = 0
var pet_growth_table_grid: GridContainer
var pet_growth_radar: Control
var pet_state_cycle_button: Button
var pet_stable_button: Button
var pet_party_up_button: Button
var pet_party_down_button: Button
var pet_lock_button: Button
var pet_batch_store_button: Button
var pet_batch_standby_button: Button
var pet_batch_rest_button: Button
var pet_rename_button: Button
var pet_cultivation_button: Button
var pet_drop_button: Button
var pet_rename_panel: PanelContainer
var pet_rename_title_label: Label
var pet_rename_input: LineEdit
var pet_rename_confirm_button: Button
var pet_rename_cancel_button: Button
var pet_cultivation_panel: PanelContainer
var pet_cultivation_title_label: Label
var pet_cultivation_preview_label: Label
var pet_cultivation_confirm_button: Button
var pet_cultivation_close_button: Button
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
var pet_panel_stable_access_override: bool = false
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
var quest_reward_choice_option: OptionButton
var quest_claim_button: Button
var quest_route_button: Button
var quest_close_button: Button
var quest_selected_reward_choice_id: String = ""
var map_panel: PanelContainer
var map_texture_rect: TextureRect
var map_detail_label: Label
var map_marker_container: VBoxContainer
var map_close_button: Button
var map_marker_buttons: Dictionary = {}
var chat_panel: PanelContainer
var chat_system_button: Button
var chat_nearby_button: Button
var chat_team_button: Button
var chat_log_label: RichTextLabel
var chat_input: LineEdit
var chat_send_button: Button
var chat_refresh_button: Button
var chat_status_label: Label
var chat_close_button: Button
var chat_http_request: HTTPRequest
var chat_active_channel: String = "system"
var chat_messages: Array[Dictionary] = []
var chat_request_pending: bool = false
var chat_pending_kind: String = ""
var mailbox_panel: PanelContainer
var mailbox_list_container: VBoxContainer
var mailbox_detail_label: RichTextLabel
var mailbox_claim_button: Button
var mailbox_refresh_button: Button
var mailbox_recipient_input: LineEdit
var mailbox_title_input: LineEdit
var mailbox_body_input: TextEdit
var mailbox_send_button: Button
var mailbox_status_label: Label
var mailbox_close_button: Button
var mailbox_http_request: HTTPRequest
var mailbox_message_buttons: Dictionary = {}
var mailbox_selected_mail_id: String = ""
var mailbox_selected_source: String = "server"
var mailbox_server_messages: Array[Dictionary] = []
var mailbox_request_pending: bool = false
var mailbox_pending_kind: String = ""
var party_panel: PanelContainer
var party_status_label: Label
var party_members_container: VBoxContainer
var party_invites_container: VBoxContainer
var party_online_container: VBoxContainer
var party_refresh_button: Button
var party_leave_button: Button
var party_close_button: Button
var party_http_request: HTTPRequest
var party_current_state: Dictionary = {}
var party_online_players: Array[Dictionary] = []
var party_request_pending: bool = false
var party_pending_kind: String = ""
var online_position_http_request: HTTPRequest
var online_position_timer: Timer
var online_position_request_pending: bool = false
var online_position_remote_players: Array[Dictionary] = []
var online_position_draw_signature_cache: String = ""
var server_event_socket: WebSocketPeer
var server_event_state: String = "off"
var server_event_reconnect_remaining: float = 0.0
var server_event_seen: Array[Dictionary] = []
var server_event_last_seq: int = 0
var server_battle_state: Dictionary = {}
var server_party_encounter_request_pending: bool = false
var server_battle_waiting_poll_elapsed: float = 0.0
var server_battle_room_restore_poll_elapsed: float = 0.0
var server_battle_state_poll_request_active: bool = false
var server_battle_coordinator
var dialog_quest_coordinator
var auto_check_coordinator
var player_action_panel: PanelContainer
var player_action_title_label: Label
var player_action_detail_label: Label
var player_action_status_label: Label
var player_action_battle_button: Button
var player_action_record_button: Button
var player_action_party_apply_button: Button
var player_action_party_invite_button: Button
var player_action_close_button: Button
var player_action_http_request: HTTPRequest
var player_action_target: Dictionary = {}
var player_action_request_pending: bool = false
var player_action_pending_kind: String = ""
var battle_result_panel: PanelContainer
var battle_result_title_label: Label
var battle_result_detail_label: Label
var battle_result_close_button: Button
var battle_invite_panel: PanelContainer
var battle_invite_title_label: Label
var battle_invite_detail_label: Label
var battle_invite_status_label: Label
var battle_invite_accept_button: Button
var battle_invite_decline_button: Button
var battle_invite_close_button: Button
var battle_invite_http_request: HTTPRequest
var battle_invite_current: Dictionary = {}
var battle_invite_request_pending: bool = false
var battle_invite_pending_kind: String = ""
var server_battle_command_request_active: bool = false
var server_battle_last_playback_turn_key: String = ""
var server_battle_pending_closed_room: Dictionary = {}
var training_partner_panel: PanelContainer
var training_partner_scroll: ScrollContainer
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
var qa_panel: PanelContainer
var qa_entry_scroll: ScrollContainer
var qa_entry_container: VBoxContainer
var qa_detail_scroll: ScrollContainer
var qa_detail_label: RichTextLabel
var qa_close_button: Button
var qa_entry_buttons: Dictionary = {}
var qa_pet_species_option: OptionButton
var qa_pet_target_option: OptionButton
var qa_pet_grant_button: Button
var qa_pet_level_up_button: Button
var qa_pet_growth_profile_id: String = ""
var qa_pet_level_instance_id: String = ""
var numeric_workbench_panel: PanelContainer
var numeric_workbench_profile_option: OptionButton
var numeric_workbench_sample_option: OptionButton
var numeric_workbench_level_option: OptionButton
var numeric_workbench_stage_option: OptionButton
var numeric_workbench_stone_option: OptionButton
var numeric_workbench_growth_button: Button
var numeric_workbench_mm_button: Button
var numeric_workbench_compare_button: Button
var numeric_workbench_battle_button: Button
var numeric_workbench_output_button: Button
var numeric_workbench_close_button: Button
var numeric_workbench_result_label: RichTextLabel
var numeric_workbench_profile_id: String = ""
var numeric_workbench_stone_plan_id: String = ""
var game_camera: Camera2D
var auto_movement_check: bool = false
var movement_perf_check: bool = false
var movement_spam_click_check: bool = false
var shop_select_perf_check: bool = false
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
var auto_facility_dialog_options_check: bool = false
var auto_npc_quest_marker_check: bool = false
var auto_stable_facility_check: bool = false
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
var auto_level_grass_trial_map_check: bool = false
var auto_battle_formation_check: bool = false
var auto_battle_target_check: bool = false
var auto_battle_round_check: bool = false
var auto_battle_command_timer_check: bool = false
var auto_battle_speed_check: bool = false
var auto_battle_feedback_check: bool = false
var auto_battle_combo_check: bool = false
var auto_battle_capture_check: bool = false
var auto_capture_tools_check: bool = false
var auto_battle_spirit_check: bool = false
var auto_battle_spirit_source_check: bool = false
var auto_battle_pet_command_check: bool = false
var auto_battle_pet_target_check: bool = false
var auto_battle_spirit_four_check: bool = false
var auto_battle_action_catalog_check: bool = false
var auto_battle_action_system_check: bool = false
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
var auto_battle_knockaway_result_check: bool = false
var auto_pet_management_check: bool = false
var auto_pet_growth_check: bool = false
var auto_pet_individual_growth_check: bool = false
var auto_pet_cultivation_check: bool = false
var auto_pet_rebirth_mm_check: bool = false
var auto_pet_rebirth_mm_formula_check: bool = false
var auto_pet_rename_check: bool = false
var auto_pet_order_check: bool = false
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
var auto_exp_pill_check: bool = false
var auto_mailbox_check: bool = false
var auto_riding_system_check: bool = false
var auto_backpack_filter_check: bool = false
var auto_quick_slot_check: bool = false
var auto_shop_check: bool = false
var auto_battle_reward_check: bool = false
var auto_equipment_drop_check: bool = false
var auto_quest_chain_check: bool = false
var auto_quest_ui_check: bool = false
var auto_quest_reward_choice_check: bool = false
var auto_quest_equipment_reward_check: bool = false
var auto_task_tracker_route_check: bool = false
var auto_map_panel_check: bool = false
var auto_facility_marker_check: bool = false
var auto_qa_panel_check: bool = false
var auto_auth_check: bool = false
var auto_auth_server_client_check: bool = false
var auto_auth_server_live_check: bool = false
var auto_startup_login_check: bool = false
var auto_server_mail_live_check: bool = false
var auto_party_live_check: bool = false
var auto_party_member_follow_check: bool = false
var auto_player_interaction_live_check: bool = false
var auto_chat_live_check: bool = false
var auto_online_position_live_check: bool = false
var auto_server_movement_live_check: bool = false
var auto_server_click_move_live_check: bool = false
var auto_server_click_move_reject_live_check: bool = false
var auto_online_aoi_live_check: bool = false
var auto_server_event_live_check: bool = false
var auto_server_event_replay_live_check: bool = false
var auto_battle_room_live_check: bool = false
var auto_server_battle_turn_live_check: bool = false
var auto_server_battle_reconnect_live_check: bool = false
var auto_server_battle_close_live_check: bool = false
var auto_server_battle_return_check: bool = false
var auto_server_battle_pet_snapshot_live_check: bool = false
var auto_server_battle_leave_ui_live_check: bool = false
var auto_server_battle_pet_command_live_check: bool = false
var auto_server_battle_switch_pet_live_check: bool = false
var auto_server_battle_item_live_check: bool = false
var auto_server_battle_target_mapping_check: bool = false
var auto_server_battle_stale_room_check: bool = false
var auto_server_solo_pve_live_check: bool = false
var auto_server_party_pve_sync_live_check: bool = false
var auto_server_profile_sync_check: bool = false
var auth_ux_preview: bool = false
var auto_panel_registry_check: bool = false
var auto_chat_panel_check: bool = false
var auto_world_log_panel_check: bool = false
var auto_equipment_check: bool = false
var auto_equipment_shop_preview_check: bool = false
var auto_player_status_check: bool = false
var auto_player_stat_points_check: bool = false
var auto_player_stat_spam_perf_check: bool = false
var auto_player_rebirth_preview_check: bool = false
var auto_player_rebirth_execute_check: bool = false
var auto_player_rebirth_chain_check: bool = false
var auto_remote_stable_unlock_check: bool = false
var auto_rebirth_task_tracker_check: bool = false
var auto_rebirth_trial_contract_check: bool = false
var auto_rebirth_cave_guardian_check: bool = false
var auto_shadow_oath_cavern_check: bool = false
var auto_rebirth_trial_execute_check: bool = false
var auto_equipment_requirement_check: bool = false
var auto_equipment_inactive_after_rebirth_check: bool = false
var auto_equipment_status_closure_check: bool = false
var auto_equipment_durability_check: bool = false
var auto_equipment_durability_visual_check: bool = false
var auto_equipment_slot_detail_check: bool = false
var auto_equipment_synthesis_check: bool = false
var auto_equipment_growth_check: bool = false
var auto_equipment_instance_check: bool = false
var auto_quest_objective_templates_check: bool = false
var auto_map_region_contract_check: bool = false
var auto_reward_grant_check: bool = false
var auto_reward_mail_fallback_check: bool = false
var auto_encounter_loop_check: bool = false
var auto_hang_loop_closure_check: bool = false
var auto_hang_supply_closure_check: bool = false
var auto_pet_management_safety_check: bool = false
var auto_player_growth_contract_check: bool = false
var auto_server_profile_contract_check: bool = false
var auto_server_auth_contract_check: bool = false
var auto_balance_version_receipt_check: bool = false
var auto_balance_snapshot_digest_check: bool = false
var auto_balance_catalog_check: bool = false
var auto_pet_growth_threshold_check: bool = false
var auto_pet_growth_observation_check: bool = false
var auto_pet_growth_species_simulation_check: bool = false
var auto_pet_growth_starter_profiles_check: bool = false
var auto_numeric_experiment_report_check: bool = false
var auto_numeric_workbench_check: bool = false
var auto_combat_formula_parity_check: bool = false
var auto_combat_v2_shadow_check: bool = false
var auto_combat_formula_driver_ab_check: bool = false
var auto_numeric_battle_simulation_check: bool = false
var auto_economy_ledger_check: bool = false
var auto_numeric_balance_gate_check: bool = false
var numeric_experiment_report: bool = false
var backpack_preview: bool = false
var backpack_world_use_preview: bool = false
var backpack_filter_preview: bool = false
var quick_slot_preview: bool = false
var player_status_preview: bool = false
var player_stat_points_preview: bool = false
var player_rebirth_preview: bool = false
var player_rebirth_chain_preview: bool = false
var remote_stable_unlock_preview: bool = false
var equipment_requirement_preview: bool = false
var equipment_rebirth_requirement_preview: bool = false
var equipment_inactive_after_rebirth_preview: bool = false
var equipment_status_closure_preview: bool = false
var equipment_shop_preview: bool = false
var equipment_durability_preview: bool = false
var equipment_durability_visual_preview: bool = false
var equipment_slot_detail_preview: bool = false
var equipment_synthesis_preview: bool = false
var shop_preview: bool = false
var battle_reward_preview: bool = false
var equipment_drop_preview: bool = false
var quest_preview: bool = false
var quest_ui_preview: bool = false
var quest_reward_choice_preview: bool = false
var quest_equipment_tutorial_preview: bool = false
var task_tracker_route_preview: bool = false
var map_panel_preview: bool = false
var facility_marker_preview: bool = false
var npc_quest_marker_preview: bool = false
var qa_panel_preview: bool = false
var chat_panel_preview: bool = false
var world_log_panel_preview: bool = false
var equipment_quest_preview: bool = false
var equipment_swap_preview: bool = false
var equipment_spirit_preview: bool = false
var equipment_compare_preview: bool = false
var pet_management_preview: bool = false
var pet_rename_preview: bool = false
var pet_order_preview: bool = false
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
var battle_spirit_source_preview: bool = false
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
var account_authenticated: bool = false
var auth_auto_bypass: bool = false
var auth_mode_register: bool = false
var auth_server_mode: bool = false
var auth_request_pending: bool = false
var startup_auth_username: String = ""
var startup_auth_password: String = ""
var startup_auth_base_url: String = ""
var current_account_session: Dictionary = {}
var server_profile_sync_state: String = "off"
var server_profile_sync_pending_kind: String = ""
var server_profile_sync_dirty: bool = false
var server_profile_sync_pull_queued: bool = false
var server_profile_sync_deferred_pull_result: Dictionary = {}
var server_profile_sync_expected_revision: int = 0
var server_profile_sync_message: String = ""
var profile_save_enabled: bool = true
var profile_save_pending: bool = false
var profile_save_debounce_remaining: float = 0.0
var profile_save_dry_run: bool = false
var profile_save_debug_count: int = 0
var player_status_refresh_debug_count: int = 0
var player_status_refresh_pending: bool = false
var world_log_message: String = ""
var world_log_history: Array[String] = []
var battle_message_expanded: bool = false
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
var click_move_repath_cooldown: float = 0.0
var click_move_repath_apply_count: int = 0
var click_move_screen_resolve_count: int = 0
var has_pending_click_screen_point: bool = false
var pending_click_screen_point := Vector2.ZERO
var has_pending_click_move_target: bool = false
var pending_click_move_goal_cell := Vector2i.ZERO
var pending_click_move_marker_cell := Vector2i.ZERO
var pending_click_move_marker_point := Vector2.ZERO
var server_step_move_active: bool = false
var server_step_move_request_pending: bool = false
var server_step_move_waiting_for_visual: bool = false
var server_step_move_plan_id: int = 0
var server_step_move_path_cells: Array[Vector2i] = []
var server_step_move_path_index: int = 0
var server_step_move_goal_cell := Vector2i.ZERO
var server_step_move_marker_cell := Vector2i.ZERO
var server_step_move_marker_point := Vector2.ZERO
var server_step_move_visual_target_cell := Vector2i.ZERO
var server_step_move_authority_cell := Vector2i.ZERO
var server_step_move_authority_valid: bool = false
var server_step_move_request_count: int = 0
var server_step_move_ack_count: int = 0
var server_step_move_last_error_code: String = ""
var server_step_move_sync_retry_count: int = 0
var server_step_world_move_enabled: bool = false
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
var battle_command_countdown_remaining: float = 99.0
var battle_command_countdown_last_second: int = -1
var battle_round_display_last_text: String = ""
var battle_timer_display_last_text: String = ""
var battle_trace_path: String = ""
var gm_battle_speed_multiplier: int = GM_BATTLE_SPEED_MIN
var last_checked_player_cell: Vector2i = Vector2i.ZERO
var encounter_zone_step_count: int = 0
var encounter_grace_remaining: float = 0.0
var hang_mode_active: bool = false
var hang_walk_direction_index: int = 0
var hang_walk_cooldown: float = 0.0
var hang_heal_resume_active: bool = false
var hang_heal_resume_mode: String = ""
var hang_heal_resume_map_id: String = ""
var hang_heal_resume_cell: Vector2i = Vector2i.ZERO
var hang_session_request_active: bool = false
var encounter_stone_item_id: String = ""
var encounter_stone_interval: float = 0.0
var encounter_stone_remaining: float = 0.0
var encounter_stone_elapsed: float = 0.0
var battle_auto_attack_enabled: bool = false
var battle_auto_attack_delay: float = 0.0
var battle_auto_attack_player_submissions: int = 0
var battle_auto_attack_pet_submissions: int = 0
var encounter_rng := RandomNumberGenerator.new()
var hud_status_text_cache: String = ""
var hud_detail_text_cache: String = ""
var hud_task_route_signature_cache: String = ""
var quick_bar_signature_cache: String = ""
var world_draw_signature_cache: String = ""
var world_hud_signature_cache: String = ""
var quest_marker_source_signature_cache: String = ""
var quest_marker_signature_cache: String = ""
var quest_marker_state_cache: Dictionary = {}
var quest_marker_cache_dirty: bool = true
var current_task_text_signature_cache: String = ""
var current_task_text_cache: String = ""
var task_tracker_cache_dirty: bool = true
var task_tracker_source_signature_cache: String = ""
var task_tracker_text_cache: String = "当前没有任务"
var task_tracker_target_cache: Dictionary = {}
var task_tracker_has_target_cache: bool = false
var world_hud_refresh_elapsed: float = WORLD_HUD_REFRESH_INTERVAL_SECONDS
var map_world_bounds_cache := Rect2()
var map_world_bounds_cache_valid: bool = false
var runtime_target_fps_cache: int = 0
var canvas_text_font: Font
var perf_probe_enabled: bool = false
var perf_probe_elapsed: float = 0.0
var perf_probe_frames: int = 0
var perf_probe_totals: Dictionary = {}


func _bootstrap_auth_state() -> void:
	if auth_auto_bypass:
		account_authenticated = true
		current_account_session = AccountAuthModel.dev_gm_session()
		PlayerProgressModel.reset_active_save_path()
	else:
		account_authenticated = false
		current_account_session = {}
		PlayerProgressModel.reset_active_save_path()


func _server_sync():
	if server_sync_coordinator == null:
		server_sync_coordinator = ServerSyncCoordinator.new(self)
	return server_sync_coordinator


func _server_battle():
	if server_battle_coordinator == null:
		server_battle_coordinator = ServerBattleCoordinator.new(self)
	return server_battle_coordinator


func _dialog_quest():
	if dialog_quest_coordinator == null:
		dialog_quest_coordinator = DialogQuestCoordinator.new(self)
	return dialog_quest_coordinator


func _auto_checks():
	if auto_check_coordinator == null:
		auto_check_coordinator = AutoCheckCoordinator.new(self)
	return auto_check_coordinator


func _ready() -> void:
	_configure_runtime_performance()
	_apply_preview_window_args()
	_bootstrap_auth_state()
	player_profile = PlayerProgressModel.load_profile() if account_authenticated else PlayerProgressModel.default_profile()
	_load_map(startup_map_id, startup_spawn_name)
	get_tree().root.size_changed.connect(_layout_hud)
	encounter_rng.randomize()
	_spawn_player()
	_spawn_pet()
	_build_path_line_overlay()
	_build_camera()
	_build_hud()
	_build_online_position_sync()
	if account_authenticated:
		_save_profile_after_exp_pill_starter_update()
		_show_exp_pill_starter_notice_if_needed()
		_refresh_mailbox_menu_button()
	else:
		_open_auth_panel(false)
	_refresh_gm_visibility()
	_layout_hud()
	set_process(true)
	if _startup_auth_login_requested() and not account_authenticated:
		call_deferred("_apply_startup_auth_login")
	if auto_auth_check:
		call_deferred("_run_auto_auth_check")
	elif auto_auth_server_live_check:
		call_deferred("_run_auto_auth_server_live_check")
	elif auto_startup_login_check:
		call_deferred("_run_auto_startup_login_check")
	elif auto_server_mail_live_check:
		call_deferred("_run_auto_server_mail_live_check")
	elif auto_party_live_check:
		call_deferred("_run_auto_party_live_check")
	elif auto_party_member_follow_check:
		call_deferred("_run_auto_party_member_follow_check")
	elif auto_player_interaction_live_check:
		call_deferred("_run_auto_player_interaction_live_check")
	elif auto_chat_live_check:
		call_deferred("_run_auto_chat_live_check")
	elif auto_online_position_live_check:
		call_deferred("_run_auto_online_position_live_check")
	elif auto_server_movement_live_check:
		call_deferred("_run_auto_server_movement_live_check")
	elif auto_server_click_move_live_check:
		call_deferred("_run_auto_server_click_move_live_check")
	elif auto_server_click_move_reject_live_check:
		call_deferred("_run_auto_server_click_move_reject_live_check")
	elif auto_online_aoi_live_check:
		call_deferred("_run_auto_online_aoi_live_check")
	elif auto_server_event_live_check:
		call_deferred("_run_auto_server_event_live_check")
	elif auto_server_event_replay_live_check:
		call_deferred("_run_auto_server_event_replay_live_check")
	elif auto_battle_room_live_check:
		call_deferred("_run_auto_battle_room_live_check")
	elif auto_server_battle_turn_live_check:
		call_deferred("_run_auto_server_battle_turn_live_check")
	elif auto_server_battle_reconnect_live_check:
		call_deferred("_run_auto_server_battle_reconnect_live_check")
	elif auto_server_battle_close_live_check:
		call_deferred("_run_auto_server_battle_close_live_check")
	elif auto_server_battle_return_check:
		call_deferred("_run_auto_server_battle_return_check")
	elif auto_server_battle_pet_snapshot_live_check:
		call_deferred("_run_auto_server_battle_pet_snapshot_live_check")
	elif auto_server_battle_leave_ui_live_check:
		call_deferred("_run_auto_server_battle_leave_ui_live_check")
	elif auto_server_battle_pet_command_live_check:
		call_deferred("_run_auto_server_battle_pet_command_live_check")
	elif auto_server_battle_switch_pet_live_check:
		call_deferred("_run_auto_server_battle_switch_pet_live_check")
	elif auto_server_battle_item_live_check:
		call_deferred("_run_auto_server_battle_item_live_check")
	elif auto_server_battle_target_mapping_check:
		call_deferred("_run_auto_server_battle_target_mapping_check")
	elif auto_server_battle_stale_room_check:
		call_deferred("_run_auto_server_battle_stale_room_check")
	elif auto_server_solo_pve_live_check:
		call_deferred("_run_auto_server_solo_pve_live_check")
	elif auto_server_party_pve_sync_live_check:
		call_deferred("_run_auto_server_party_pve_sync_live_check")
	elif auto_auth_server_client_check:
		call_deferred("_run_auto_auth_server_client_check")
	elif auto_server_profile_sync_check:
		call_deferred("_run_auto_server_profile_sync_check")
	elif auth_ux_preview:
		call_deferred("_run_auth_ux_preview")
	elif auto_encounter_check:
		call_deferred("_run_auto_encounter_check")
	elif auto_battle_action_catalog_check:
		call_deferred("_run_auto_battle_action_catalog_check")
	elif auto_battle_action_system_check:
		call_deferred("_run_auto_battle_action_system_check")
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
	elif auto_level_grass_trial_map_check:
		call_deferred("_run_auto_level_grass_trial_map_check")
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
	elif auto_battle_command_timer_check:
		call_deferred("_run_auto_battle_command_timer_check")
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
	elif auto_battle_knockaway_result_check:
		call_deferred("_run_auto_battle_knockaway_result_check")
	elif auto_pet_management_check:
		call_deferred("_run_auto_pet_management_check")
	elif auto_pet_growth_check:
		call_deferred("_run_auto_pet_growth_check")
	elif auto_pet_individual_growth_check:
		call_deferred("_run_auto_pet_individual_growth_check")
	elif auto_pet_cultivation_check:
		call_deferred("_run_auto_pet_cultivation_check")
	elif auto_pet_rebirth_mm_check:
		call_deferred("_run_auto_pet_rebirth_mm_check")
	elif auto_pet_rebirth_mm_formula_check:
		call_deferred("_run_auto_pet_rebirth_mm_formula_check")
	elif auto_pet_rename_check:
		call_deferred("_run_auto_pet_rename_check")
	elif auto_pet_order_check:
		call_deferred("_run_auto_pet_order_check")
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
	elif auto_exp_pill_check:
		call_deferred("_run_auto_exp_pill_check")
	elif auto_mailbox_check:
		call_deferred("_run_auto_mailbox_check")
	elif auto_riding_system_check:
		call_deferred("_run_auto_riding_system_check")
	elif auto_backpack_filter_check:
		call_deferred("_run_auto_backpack_filter_check")
	elif auto_quick_slot_check:
		call_deferred("_run_auto_quick_slot_check")
	elif auto_shop_check:
		call_deferred("_run_auto_shop_check")
	elif auto_battle_reward_check:
		call_deferred("_run_auto_battle_reward_check")
	elif auto_equipment_drop_check:
		call_deferred("_run_auto_equipment_drop_check")
	elif auto_quest_chain_check:
		call_deferred("_run_auto_quest_chain_check")
	elif auto_quest_ui_check:
		call_deferred("_run_auto_quest_ui_check")
	elif auto_quest_reward_choice_check:
		call_deferred("_run_auto_quest_reward_choice_check")
	elif auto_quest_equipment_reward_check:
		call_deferred("_run_auto_quest_equipment_reward_check")
	elif auto_task_tracker_route_check:
		call_deferred("_run_auto_task_tracker_route_check")
	elif auto_map_panel_check:
		call_deferred("_run_auto_map_panel_check")
	elif auto_facility_marker_check:
		call_deferred("_run_auto_facility_marker_check")
	elif auto_qa_panel_check:
		call_deferred("_run_auto_qa_panel_check")
	elif auto_panel_registry_check:
		call_deferred("_run_auto_panel_registry_check")
	elif auto_chat_panel_check:
		call_deferred("_run_auto_chat_panel_check")
	elif auto_world_log_panel_check:
		call_deferred("_run_auto_world_log_panel_check")
	elif auto_equipment_check:
		call_deferred("_run_auto_equipment_check")
	elif auto_equipment_shop_preview_check:
		call_deferred("_run_auto_equipment_shop_preview_check")
	elif auto_player_status_check:
		call_deferred("_run_auto_player_status_check")
	elif auto_player_stat_points_check:
		call_deferred("_run_auto_player_stat_points_check")
	elif auto_player_stat_spam_perf_check:
		call_deferred("_run_auto_player_stat_spam_perf_check")
	elif auto_player_rebirth_preview_check:
		call_deferred("_run_auto_player_rebirth_preview_check")
	elif auto_player_rebirth_execute_check:
		call_deferred("_run_auto_player_rebirth_execute_check")
	elif auto_player_rebirth_chain_check:
		call_deferred("_run_auto_player_rebirth_chain_check")
	elif auto_remote_stable_unlock_check:
		call_deferred("_run_auto_remote_stable_unlock_check")
	elif auto_rebirth_task_tracker_check:
		call_deferred("_run_auto_rebirth_task_tracker_check")
	elif auto_rebirth_trial_contract_check:
		call_deferred("_run_auto_rebirth_trial_contract_check")
	elif auto_rebirth_cave_guardian_check:
		call_deferred("_run_auto_rebirth_cave_guardian_check")
	elif auto_shadow_oath_cavern_check:
		call_deferred("_run_auto_shadow_oath_cavern_check")
	elif auto_rebirth_trial_execute_check:
		call_deferred("_run_auto_rebirth_trial_execute_check")
	elif auto_equipment_requirement_check:
		call_deferred("_run_auto_equipment_requirement_check")
	elif auto_equipment_inactive_after_rebirth_check:
		call_deferred("_run_auto_equipment_inactive_after_rebirth_check")
	elif auto_equipment_status_closure_check:
		call_deferred("_run_auto_equipment_status_closure_check")
	elif auto_equipment_durability_check:
		call_deferred("_run_auto_equipment_durability_check")
	elif auto_equipment_durability_visual_check:
		call_deferred("_run_auto_equipment_durability_visual_check")
	elif auto_equipment_slot_detail_check:
		call_deferred("_run_auto_equipment_slot_detail_check")
	elif auto_equipment_synthesis_check:
		call_deferred("_run_auto_equipment_synthesis_check")
	elif auto_equipment_growth_check:
		call_deferred("_run_auto_equipment_growth_check")
	elif auto_equipment_instance_check:
		call_deferred("_run_auto_equipment_instance_check")
	elif auto_quest_objective_templates_check:
		call_deferred("_run_auto_quest_objective_templates_check")
	elif auto_map_region_contract_check:
		call_deferred("_run_auto_map_region_contract_check")
	elif auto_reward_grant_check:
		call_deferred("_run_auto_reward_grant_check")
	elif auto_reward_mail_fallback_check:
		call_deferred("_run_auto_reward_mail_fallback_check")
	elif auto_encounter_loop_check:
		call_deferred("_run_auto_encounter_loop_check")
	elif auto_hang_loop_closure_check:
		call_deferred("_run_auto_hang_loop_closure_check")
	elif auto_hang_supply_closure_check:
		call_deferred("_run_auto_hang_supply_closure_check")
	elif auto_pet_management_safety_check:
		call_deferred("_run_auto_pet_management_safety_check")
	elif auto_player_growth_contract_check:
		call_deferred("_run_auto_player_growth_contract_check")
	elif auto_server_profile_contract_check:
		call_deferred("_run_auto_server_profile_contract_check")
	elif auto_server_auth_contract_check:
		call_deferred("_run_auto_server_auth_contract_check")
	elif auto_balance_version_receipt_check:
		call_deferred("_run_auto_balance_version_receipt_check")
	elif auto_balance_snapshot_digest_check:
		call_deferred("_run_auto_balance_snapshot_digest_check")
	elif auto_balance_catalog_check:
		call_deferred("_run_auto_balance_catalog_check")
	elif auto_pet_growth_threshold_check:
		call_deferred("_run_auto_pet_growth_threshold_check")
	elif auto_pet_growth_observation_check:
		call_deferred("_run_auto_pet_growth_observation_check")
	elif auto_pet_growth_species_simulation_check:
		call_deferred("_run_auto_pet_growth_species_simulation_check")
	elif auto_pet_growth_starter_profiles_check:
		call_deferred("_run_auto_pet_growth_starter_profiles_check")
	elif auto_numeric_experiment_report_check:
		call_deferred("_run_numeric_experiment_report", true)
	elif auto_numeric_workbench_check:
		call_deferred("_run_auto_numeric_workbench_check")
	elif auto_combat_formula_parity_check:
		call_deferred("_run_auto_combat_formula_parity_check")
	elif auto_combat_v2_shadow_check:
		call_deferred("_run_auto_combat_v2_shadow_check")
	elif auto_combat_formula_driver_ab_check:
		call_deferred("_run_auto_combat_formula_driver_ab_check")
	elif auto_numeric_battle_simulation_check:
		call_deferred("_run_auto_numeric_battle_simulation_check")
	elif auto_economy_ledger_check:
		call_deferred("_run_auto_economy_ledger_check")
	elif auto_numeric_balance_gate_check:
		call_deferred("_run_auto_numeric_balance_gate_check")
	elif numeric_experiment_report:
		call_deferred("_run_numeric_experiment_report", false)
	elif backpack_preview:
		call_deferred("_run_backpack_preview")
	elif backpack_world_use_preview:
		call_deferred("_run_backpack_world_use_preview")
	elif backpack_filter_preview:
		call_deferred("_run_backpack_filter_preview")
	elif quick_slot_preview:
		call_deferred("_run_quick_slot_preview")
	elif player_status_preview:
		call_deferred("_run_player_status_preview")
	elif player_stat_points_preview:
		call_deferred("_run_player_stat_points_preview")
	elif player_rebirth_preview:
		call_deferred("_run_player_rebirth_preview")
	elif player_rebirth_chain_preview:
		call_deferred("_run_player_rebirth_chain_preview")
	elif remote_stable_unlock_preview:
		call_deferred("_run_remote_stable_unlock_preview")
	elif equipment_requirement_preview:
		call_deferred("_run_equipment_requirement_preview")
	elif equipment_rebirth_requirement_preview:
		call_deferred("_run_equipment_rebirth_requirement_preview")
	elif equipment_inactive_after_rebirth_preview:
		call_deferred("_run_equipment_inactive_after_rebirth_preview")
	elif equipment_status_closure_preview:
		call_deferred("_run_equipment_status_closure_preview")
	elif equipment_shop_preview:
		call_deferred("_run_equipment_shop_preview")
	elif equipment_durability_preview:
		call_deferred("_run_equipment_durability_preview")
	elif equipment_durability_visual_preview:
		call_deferred("_run_equipment_durability_visual_preview")
	elif equipment_slot_detail_preview:
		call_deferred("_run_equipment_slot_detail_preview")
	elif equipment_synthesis_preview:
		call_deferred("_run_equipment_synthesis_preview")
	elif shop_preview:
		call_deferred("_run_shop_preview")
	elif battle_reward_preview:
		call_deferred("_run_battle_reward_preview")
	elif equipment_drop_preview:
		call_deferred("_run_equipment_drop_preview")
	elif quest_preview:
		call_deferred("_run_quest_preview")
	elif quest_ui_preview:
		call_deferred("_run_quest_ui_preview")
	elif quest_reward_choice_preview:
		call_deferred("_run_quest_reward_choice_preview")
	elif quest_equipment_tutorial_preview:
		call_deferred("_run_quest_equipment_tutorial_preview")
	elif task_tracker_route_preview:
		call_deferred("_run_task_tracker_route_preview")
	elif map_panel_preview:
		call_deferred("_run_map_panel_preview")
	elif facility_marker_preview:
		call_deferred("_run_facility_marker_preview")
	elif npc_quest_marker_preview:
		call_deferred("_run_npc_quest_marker_preview")
	elif qa_panel_preview:
		call_deferred("_run_qa_panel_preview")
	elif chat_panel_preview:
		call_deferred("_run_chat_panel_preview")
	elif world_log_panel_preview:
		call_deferred("_run_world_log_panel_preview")
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
	elif pet_order_preview:
		call_deferred("_run_pet_order_preview")
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
	elif auto_battle_spirit_source_check:
		call_deferred("_run_auto_battle_spirit_source_check")
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
	elif auto_facility_dialog_options_check:
		call_deferred("_run_auto_facility_dialog_options_check")
	elif auto_npc_quest_marker_check:
		call_deferred("_run_auto_npc_quest_marker_check")
	elif auto_stable_facility_check:
		call_deferred("_run_auto_stable_facility_check")
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
	elif shop_select_perf_check:
		call_deferred("_run_shop_select_perf_check")
	elif movement_spam_click_check:
		call_deferred("_run_movement_spam_click_check")
	elif movement_perf_check:
		call_deferred("_run_movement_perf_check")
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
	elif battle_spirit_source_preview:
		call_deferred("_run_battle_spirit_source_preview")
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


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		_flush_profile_save_now()


func _configure_runtime_performance() -> void:
	_set_runtime_target_fps(ACTIVE_TARGET_FPS)
	Engine.physics_ticks_per_second = 60
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED)


func _set_runtime_target_fps(target_fps: int) -> void:
	if runtime_target_fps_cache == target_fps:
		return
	Engine.max_fps = target_fps
	runtime_target_fps_cache = target_fps


func _update_runtime_frame_budget() -> void:
	_set_runtime_target_fps(ACTIVE_TARGET_FPS if _world_needs_active_fps() else IDLE_TARGET_FPS)


func _world_needs_active_fps() -> bool:
	if battle_active or encounter_active:
		return true
	if hang_mode_active or _encounter_stone_active():
		return true
	if has_target_marker or has_pending_interaction or not current_path_cells.is_empty():
		return true
	if player != null and (player.is_auto_moving() or player.is_moving()):
		return true
	if pet != null and pet.has_method("is_moving") and bool(pet.call("is_moving")):
		return true
	return false


func _apply_preview_window_args() -> void:
	var args := OS.get_cmdline_user_args()
	for index in range(args.size()):
		var arg := str(args[index])
		if (
			arg.begins_with("--auto-")
			or arg.ends_with("-check")
			or arg.ends_with("-preview")
			or arg.ends_with("-demo")
			or arg.ends_with("-test")
			or arg == "--perf-probe"
			or arg == "--numeric-experiment-report"
		):
			profile_save_enabled = false
			if arg != "--auto-auth-check" and arg != "--auto-auth-server-live-check" and arg != "--auto-startup-login-check":
				auth_auto_bypass = true
		if arg == "--preview-mobile":
			pass
		elif arg == "--login" or arg == "--server-login":
			startup_auth_username = _cmdline_user_arg_at(args, index + 1)
			startup_auth_password = _cmdline_user_arg_at(args, index + 2)
		elif arg == "--login-username" or arg == "--auth-username" or arg == "--auth-user":
			startup_auth_username = _cmdline_user_arg_at(args, index + 1)
		elif arg.begins_with("--login-username="):
			startup_auth_username = arg.substr("--login-username=".length())
		elif arg.begins_with("--auth-username="):
			startup_auth_username = arg.substr("--auth-username=".length())
		elif arg == "--login-password" or arg == "--auth-password" or arg == "--auth-pass":
			startup_auth_password = _cmdline_user_arg_at(args, index + 1)
		elif arg.begins_with("--login-password="):
			startup_auth_password = arg.substr("--login-password=".length())
		elif arg.begins_with("--auth-password="):
			startup_auth_password = arg.substr("--auth-password=".length())
		elif arg == "--server-url" or arg == "--auth-server-url":
			startup_auth_base_url = _cmdline_user_arg_at(args, index + 1)
		elif arg.begins_with("--server-url="):
			startup_auth_base_url = arg.substr("--server-url=".length())
		elif arg.begins_with("--auth-server-url="):
			startup_auth_base_url = arg.substr("--auth-server-url=".length())
		elif arg == "--server-step-world-move":
			server_step_world_move_enabled = true
		elif arg == "--preview-mobile-portrait":
			pass
		elif arg == "--full-client-preview":
			pass
		elif arg == "--gm-10v10-map":
			startup_map_id = GM_10V10_MAP_ID
			startup_spawn_name = "default"
		elif arg == "--movement-perf-check":
			movement_perf_check = true
		elif arg == "--movement-spam-click-check":
			movement_spam_click_check = true
		elif arg == "--shop-select-perf-check":
			shop_select_perf_check = true
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
		elif arg == "--auto-facility-dialog-options-check":
			auto_facility_dialog_options_check = true
		elif arg == "--auto-stable-facility-check":
			auto_stable_facility_check = true
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
		elif arg == "--auto-level-grass-trial-map-check":
			auto_level_grass_trial_map_check = true
		elif arg == "--auto-battle-formation-check":
			auto_battle_formation_check = true
		elif arg == "--auto-battle-target-check":
			auto_battle_target_check = true
		elif arg == "--auto-battle-round-check":
			auto_battle_round_check = true
		elif arg == "--auto-battle-command-timer-check":
			auto_battle_command_timer_check = true
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
		elif arg == "--auto-battle-spirit-source-check":
			auto_battle_spirit_source_check = true
		elif arg == "--auto-battle-pet-command-check":
			auto_battle_pet_command_check = true
		elif arg == "--auto-battle-pet-target-check":
			auto_battle_pet_target_check = true
		elif arg == "--auto-battle-spirit-four-check":
			auto_battle_spirit_four_check = true
		elif arg == "--auto-battle-action-catalog-check":
			auto_battle_action_catalog_check = true
		elif arg == "--auto-battle-action-system-check":
			auto_battle_action_system_check = true
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
		elif arg == "--auto-battle-knockaway-result-check":
			auto_battle_knockaway_result_check = true
		elif arg == "--auto-pet-management-check":
			auto_pet_management_check = true
		elif arg == "--auto-pet-growth-check":
			auto_pet_growth_check = true
		elif arg == "--auto-pet-individual-growth-check":
			auto_pet_individual_growth_check = true
		elif arg == "--auto-pet-cultivation-check":
			auto_pet_cultivation_check = true
		elif arg == "--auto-pet-rebirth-mm-check":
			auto_pet_rebirth_mm_check = true
		elif arg == "--auto-pet-rebirth-mm-formula-check":
			auto_pet_rebirth_mm_formula_check = true
		elif arg == "--auto-pet-rename-check":
			auto_pet_rename_check = true
		elif arg == "--auto-pet-order-check":
			auto_pet_order_check = true
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
		elif arg == "--auto-exp-pill-check":
			auto_exp_pill_check = true
		elif arg == "--auto-mailbox-check":
			auto_mailbox_check = true
		elif arg == "--auto-riding-system-check":
			auto_riding_system_check = true
		elif arg == "--auto-backpack-filter-check":
			auto_backpack_filter_check = true
		elif arg == "--auto-quick-slot-check":
			auto_quick_slot_check = true
		elif arg == "--auto-shop-check":
			auto_shop_check = true
		elif arg == "--auto-battle-reward-check":
			auto_battle_reward_check = true
		elif arg == "--auto-equipment-drop-check":
			auto_equipment_drop_check = true
		elif arg == "--auto-quest-chain-check":
			auto_quest_chain_check = true
		elif arg == "--auto-quest-ui-check":
			auto_quest_ui_check = true
		elif arg == "--auto-quest-reward-choice-check":
			auto_quest_reward_choice_check = true
		elif arg == "--auto-quest-equipment-reward-check":
			auto_quest_equipment_reward_check = true
		elif arg == "--auto-task-tracker-route-check":
			auto_task_tracker_route_check = true
		elif arg == "--auto-map-panel-check":
			auto_map_panel_check = true
		elif arg == "--auto-facility-marker-check":
			auto_facility_marker_check = true
		elif arg == "--auto-npc-quest-marker-check":
			auto_npc_quest_marker_check = true
		elif arg == "--auto-qa-panel-check":
			auto_qa_panel_check = true
		elif arg == "--auto-auth-check":
			auto_auth_check = true
			auth_auto_bypass = false
		elif arg == "--auto-auth-server-client-check":
			auto_auth_server_client_check = true
		elif arg == "--auto-auth-server-live-check":
			auto_auth_server_live_check = true
		elif arg == "--auto-startup-login-check":
			auto_startup_login_check = true
		elif arg == "--auto-server-mail-live-check":
			auto_server_mail_live_check = true
		elif arg == "--auto-party-live-check":
			auto_party_live_check = true
		elif arg == "--auto-party-member-follow-check":
			auto_party_member_follow_check = true
		elif arg == "--auto-player-interaction-live-check":
			auto_player_interaction_live_check = true
		elif arg == "--auto-chat-live-check":
			auto_chat_live_check = true
		elif arg == "--auto-online-position-live-check":
			auto_online_position_live_check = true
		elif arg == "--auto-server-movement-live-check":
			auto_server_movement_live_check = true
		elif arg == "--auto-server-click-move-live-check":
			auto_server_click_move_live_check = true
		elif arg == "--auto-server-click-move-reject-live-check":
			auto_server_click_move_reject_live_check = true
		elif arg == "--auto-online-aoi-live-check":
			auto_online_aoi_live_check = true
		elif arg == "--auto-server-event-live-check":
			auto_server_event_live_check = true
		elif arg == "--auto-server-event-replay-live-check":
			auto_server_event_replay_live_check = true
		elif arg == "--auto-battle-room-live-check":
			auto_battle_room_live_check = true
		elif arg == "--auto-server-battle-turn-live-check":
			auto_server_battle_turn_live_check = true
		elif arg == "--auto-server-battle-reconnect-live-check":
			auto_server_battle_reconnect_live_check = true
		elif arg == "--auto-server-battle-close-live-check":
			auto_server_battle_close_live_check = true
		elif arg == "--auto-server-battle-return-check":
			auto_server_battle_return_check = true
		elif arg == "--auto-server-battle-pet-snapshot-live-check":
			auto_server_battle_pet_snapshot_live_check = true
		elif arg == "--auto-server-battle-leave-ui-live-check":
			auto_server_battle_leave_ui_live_check = true
		elif arg == "--auto-server-battle-pet-command-live-check":
			auto_server_battle_pet_command_live_check = true
		elif arg == "--auto-server-battle-switch-pet-live-check":
			auto_server_battle_switch_pet_live_check = true
		elif arg == "--auto-server-battle-item-live-check":
			auto_server_battle_item_live_check = true
		elif arg == "--auto-server-battle-target-mapping-check":
			auto_server_battle_target_mapping_check = true
		elif arg == "--auto-server-battle-stale-room-check":
			auto_server_battle_stale_room_check = true
		elif arg == "--auto-server-solo-pve-live-check":
			auto_server_solo_pve_live_check = true
		elif arg == "--auto-server-party-pve-sync-live-check":
			auto_server_party_pve_sync_live_check = true
		elif arg == "--auto-server-profile-sync-check":
			auto_server_profile_sync_check = true
		elif arg == "--auth-ux-preview":
			auth_ux_preview = true
			auth_auto_bypass = false
		elif arg == "--auto-panel-registry-check":
			auto_panel_registry_check = true
		elif arg == "--auto-chat-panel-check":
			auto_chat_panel_check = true
		elif arg == "--auto-world-log-panel-check":
			auto_world_log_panel_check = true
		elif arg == "--auto-equipment-check":
			auto_equipment_check = true
		elif arg == "--auto-equipment-shop-preview-check":
			auto_equipment_shop_preview_check = true
		elif arg == "--auto-player-status-check":
			auto_player_status_check = true
		elif arg == "--auto-player-stat-points-check":
			auto_player_stat_points_check = true
		elif arg == "--auto-player-stat-spam-perf-check":
			auto_player_stat_spam_perf_check = true
		elif arg == "--auto-player-rebirth-preview-check":
			auto_player_rebirth_preview_check = true
		elif arg == "--auto-player-rebirth-execute-check":
			auto_player_rebirth_execute_check = true
		elif arg == "--auto-player-rebirth-chain-check":
			auto_player_rebirth_chain_check = true
		elif arg == "--auto-remote-stable-unlock-check":
			auto_remote_stable_unlock_check = true
		elif arg == "--auto-rebirth-task-tracker-check":
			auto_rebirth_task_tracker_check = true
		elif arg == "--auto-rebirth-trial-contract-check":
			auto_rebirth_trial_contract_check = true
		elif arg == "--auto-rebirth-cave-guardian-check":
			auto_rebirth_cave_guardian_check = true
		elif arg == "--auto-shadow-oath-cavern-check":
			auto_shadow_oath_cavern_check = true
		elif arg == "--auto-rebirth-trial-execute-check":
			auto_rebirth_trial_execute_check = true
		elif arg == "--auto-equipment-requirement-check":
			auto_equipment_requirement_check = true
		elif arg == "--auto-equipment-inactive-after-rebirth-check":
			auto_equipment_inactive_after_rebirth_check = true
		elif arg == "--auto-equipment-status-closure-check":
			auto_equipment_status_closure_check = true
		elif arg == "--auto-equipment-durability-check":
			auto_equipment_durability_check = true
		elif arg == "--auto-equipment-durability-visual-check":
			auto_equipment_durability_visual_check = true
		elif arg == "--auto-equipment-slot-detail-check":
			auto_equipment_slot_detail_check = true
		elif arg == "--auto-equipment-synthesis-check":
			auto_equipment_synthesis_check = true
		elif arg == "--auto-equipment-growth-check":
			auto_equipment_growth_check = true
		elif arg == "--auto-equipment-instance-check":
			auto_equipment_instance_check = true
		elif arg == "--auto-quest-objective-templates-check":
			auto_quest_objective_templates_check = true
		elif arg == "--auto-map-region-contract-check":
			auto_map_region_contract_check = true
		elif arg == "--auto-reward-grant-check":
			auto_reward_grant_check = true
		elif arg == "--auto-reward-mail-fallback-check":
			auto_reward_mail_fallback_check = true
		elif arg == "--auto-encounter-loop-check":
			auto_encounter_loop_check = true
		elif arg == "--auto-hang-loop-closure-check":
			auto_hang_loop_closure_check = true
		elif arg == "--auto-hang-supply-closure-check":
			auto_hang_supply_closure_check = true
		elif arg == "--auto-pet-management-safety-check":
			auto_pet_management_safety_check = true
		elif arg == "--auto-player-growth-contract-check":
			auto_player_growth_contract_check = true
		elif arg == "--auto-server-profile-contract-check":
			auto_server_profile_contract_check = true
		elif arg == "--auto-server-auth-contract-check":
			auto_server_auth_contract_check = true
		elif arg == "--auto-balance-version-receipt-check":
			auto_balance_version_receipt_check = true
		elif arg == "--auto-balance-snapshot-digest-check":
			auto_balance_snapshot_digest_check = true
		elif arg == "--auto-balance-catalog-check":
			auto_balance_catalog_check = true
		elif arg == "--auto-pet-growth-threshold-check":
			auto_pet_growth_threshold_check = true
		elif arg == "--auto-pet-growth-observation-check":
			auto_pet_growth_observation_check = true
		elif arg == "--auto-pet-growth-species-simulation-check":
			auto_pet_growth_species_simulation_check = true
		elif arg == "--auto-pet-growth-starter-profiles-check":
			auto_pet_growth_starter_profiles_check = true
		elif arg == "--auto-numeric-experiment-report-check":
			auto_numeric_experiment_report_check = true
		elif arg == "--auto-numeric-workbench-check":
			auto_numeric_workbench_check = true
		elif arg == "--auto-combat-formula-parity-check":
			auto_combat_formula_parity_check = true
		elif arg == "--auto-combat-v2-shadow-check":
			auto_combat_v2_shadow_check = true
		elif arg == "--auto-combat-formula-driver-ab-check":
			auto_combat_formula_driver_ab_check = true
		elif arg == "--auto-numeric-battle-simulation-check":
			auto_numeric_battle_simulation_check = true
		elif arg == "--auto-economy-ledger-check":
			auto_economy_ledger_check = true
		elif arg == "--auto-numeric-balance-gate-check":
			auto_numeric_balance_gate_check = true
		elif arg == "--numeric-experiment-report":
			numeric_experiment_report = true
		elif arg == "--backpack-preview":
			backpack_preview = true
		elif arg == "--backpack-world-use-preview":
			backpack_world_use_preview = true
		elif arg == "--backpack-filter-preview":
			backpack_filter_preview = true
		elif arg == "--quick-slot-preview":
			quick_slot_preview = true
		elif arg == "--player-status-preview":
			player_status_preview = true
		elif arg == "--player-stat-points-preview":
			player_stat_points_preview = true
		elif arg == "--player-rebirth-preview":
			player_rebirth_preview = true
		elif arg == "--player-rebirth-chain-preview":
			player_rebirth_chain_preview = true
		elif arg == "--remote-stable-unlock-preview":
			remote_stable_unlock_preview = true
		elif arg == "--equipment-requirement-preview":
			equipment_requirement_preview = true
		elif arg == "--equipment-rebirth-requirement-preview":
			equipment_rebirth_requirement_preview = true
		elif arg == "--equipment-inactive-after-rebirth-preview":
			equipment_inactive_after_rebirth_preview = true
		elif arg == "--equipment-status-closure-preview":
			equipment_status_closure_preview = true
		elif arg == "--equipment-shop-preview":
			equipment_shop_preview = true
		elif arg == "--equipment-durability-preview":
			equipment_durability_preview = true
		elif arg == "--equipment-durability-visual-preview":
			equipment_durability_visual_preview = true
		elif arg == "--equipment-slot-detail-preview":
			equipment_slot_detail_preview = true
		elif arg == "--equipment-synthesis-preview":
			equipment_synthesis_preview = true
		elif arg == "--shop-preview":
			shop_preview = true
		elif arg == "--battle-reward-preview":
			battle_reward_preview = true
		elif arg == "--equipment-drop-preview":
			equipment_drop_preview = true
		elif arg == "--quest-preview":
			quest_preview = true
		elif arg == "--quest-ui-preview":
			quest_ui_preview = true
		elif arg == "--quest-reward-choice-preview":
			quest_reward_choice_preview = true
		elif arg == "--quest-equipment-tutorial-preview":
			quest_equipment_tutorial_preview = true
		elif arg == "--task-tracker-route-preview":
			task_tracker_route_preview = true
		elif arg == "--map-panel-preview":
			map_panel_preview = true
		elif arg == "--facility-marker-preview":
			facility_marker_preview = true
		elif arg == "--npc-quest-marker-preview":
			npc_quest_marker_preview = true
		elif arg == "--qa-panel-preview":
			qa_panel_preview = true
		elif arg == "--chat-panel-preview":
			chat_panel_preview = true
		elif arg == "--world-log-panel-preview":
			world_log_panel_preview = true
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
		elif arg == "--pet-order-preview":
			pet_order_preview = true
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
		elif arg == "--battle-spirit-source-preview":
			battle_spirit_source_preview = true
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
		elif arg == "--perf-probe":
			perf_probe_enabled = true


func _cmdline_user_arg_at(args: PackedStringArray, index: int) -> String:
	if index < 0 or index >= args.size():
		return ""
	return str(args[index]).strip_edges()


func _startup_auth_login_requested() -> bool:
	return startup_auth_username.strip_edges() != "" or startup_auth_password != ""


func _apply_startup_auth_login() -> void:
	if account_authenticated or auth_request_pending:
		return
	if auth_username_input == null or auth_password_input == null:
		return
	var username := startup_auth_username.strip_edges()
	if username == "" or startup_auth_password == "":
		if auth_message_label != null:
			auth_message_label.text = "启动登录参数缺少账号或密码。"
		return
	_set_auth_server_mode(true, false)
	_set_auth_mode(false)
	if startup_auth_base_url.strip_edges() != "" and auth_server_url_input != null:
		auth_server_url_input.text = startup_auth_base_url.strip_edges()
	auth_username_input.text = username
	auth_password_input.text = startup_auth_password
	if auth_remember_check != null:
		auth_remember_check.button_pressed = true
	_open_auth_panel(false)
	_submit_server_auth_request(username, startup_auth_password)


func _load_map(map_id: String, spawn_name: String = "default") -> bool:
	var map_path := str(MAP_DATA_PATHS.get(map_id, ""))
	if map_path == "":
		return false
	var loaded_map := IsoMapModel.load_map(map_path)
	if loaded_map.is_empty():
		return false

	map_data = loaded_map
	current_map_id = str(map_data.get("id", map_id))
	map_world_bounds_cache_valid = false
	_mark_progress_ui_caches_dirty()
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
	_refresh_quick_bar()
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


func _encounter_zone_for_group(loaded_map: Dictionary, group_id: String) -> Dictionary:
	if group_id == "":
		return {}
	for value in EncounterModel.encounter_zones(loaded_map):
		if not (value is Dictionary):
			continue
		var zone := value as Dictionary
		if str(zone.get("encounterGroupId", "")) == group_id:
			return zone
	return {}


func _interaction_for_encounter_group(loaded_map: Dictionary, group_id: String) -> Dictionary:
	if group_id == "":
		return {}
	for value in InteractionModel.interaction_points(loaded_map):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if str(item.get("encounterGroupId", "")) == group_id:
			return item
	return {}


func _map_has_encounter_group(loaded_map: Dictionary, group_id: String) -> bool:
	return not _encounter_zone_for_group(loaded_map, group_id).is_empty()


func _map_has_encounter_group_interaction(loaded_map: Dictionary, group_id: String) -> bool:
	return not _interaction_for_encounter_group(loaded_map, group_id).is_empty()


func _map_has_warp_to_map(loaded_map: Dictionary, map_id: String) -> bool:
	for value in InteractionModel.interaction_points(loaded_map):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if InteractionModel.is_warp(item) and str(item.get("toMap", "")) == map_id:
			return true
	return false


func _run_auto_movement_check() -> void:
	await _auto_checks()._run_auto_movement_check()


func _run_movement_perf_check() -> void:
	var start_cell := IsoMapModel.spawn_cell(map_data)
	var size := IsoMapModel.grid_size(map_data)
	var target_cell := Vector2i(
		clampi(start_cell.x + 10, 1, maxi(1, size.x - 2)),
		clampi(start_cell.y - 8, 1, maxi(1, size.y - 2))
	)
	target_cell = IsoMapModel.nearest_walkable_cell(map_data, target_cell)
	var cells: Array[Vector2i] = [start_cell, target_cell]
	var next_index := 1
	var start_position := player.global_position
	for frame_index in range(540):
		if not player.is_auto_moving():
			var cell := cells[next_index]
			_set_move_target_cell(cell, IsoMapModel.grid_to_world(map_data, cell), cell)
			next_index = 1 - next_index
		await get_tree().physics_frame
	var end_position := player.global_position
	var moved := end_position.distance_to(start_position) > 16.0
	print("movement perf check ready: status=%s start=%s end=%s target=%s path_len=%d" % [
		"ok" if moved else "failed",
		str(start_position),
		str(end_position),
		str(target_cell),
		current_path_cells.size(),
	])
	get_tree().quit(0 if moved else 1)


func _run_auto_party_member_follow_check() -> void:
	await _auto_checks()._run_auto_party_member_follow_check()


func _run_movement_spam_click_check() -> void:
	var start_cell := IsoMapModel.spawn_cell(map_data)
	var start_position := player.global_position
	var before_apply_count := click_move_repath_apply_count
	var before_resolve_count := click_move_screen_resolve_count
	var last_cell := start_cell
	var click_count := 0
	var input_elapsed_usec := 0
	var max_input_usec := 0
	for frame_index in range(120):
		for burst_index in range(3):
			var index := frame_index * 3 + burst_index
			var offset := Vector2i(4 + (index % 9), -4 - (index % 7))
			var candidate := IsoMapModel.nearest_walkable_cell(map_data, start_cell + offset)
			if not IsoMapModel.is_inside(map_data, candidate):
				continue
			last_cell = candidate
			var event := InputEventMouseButton.new()
			event.button_index = MOUSE_BUTTON_LEFT
			event.pressed = true
			event.position = _world_to_screen(IsoMapModel.grid_to_world(map_data, candidate))
			var started_usec := Time.get_ticks_usec()
			_input(event)
			var elapsed_usec := Time.get_ticks_usec() - started_usec
			input_elapsed_usec += elapsed_usec
			max_input_usec = maxi(max_input_usec, elapsed_usec)
			click_count += 1
		await get_tree().physics_frame
	for _step in range(60):
		await get_tree().physics_frame
	var applied_count := click_move_repath_apply_count - before_apply_count
	var resolved_count := click_move_screen_resolve_count - before_resolve_count
	var moved := player.global_position.distance_to(start_position) > 16.0
	var avg_input_usec := int(round(float(input_elapsed_usec) / maxf(1.0, float(click_count))))
	var input_fast := avg_input_usec <= 250 and max_input_usec <= 12000
	var coalesced := resolved_count <= 70 and applied_count <= 70
	var settled := not has_pending_click_screen_point and not has_pending_click_move_target
	var final_target_matches := has_target_cell and target_cell == last_cell
	var status := "ok" if moved and coalesced and input_fast and settled and final_target_matches else "failed"
	print("movement spam click check ready: status=%s clicks=%d resolved=%d applied=%d avg_input_us=%d max_input_us=%d moved=%s coalesced=%s settled=%s final_match=%s final_target=%s expected=%s" % [
		status,
		click_count,
		resolved_count,
		applied_count,
		avg_input_usec,
		max_input_usec,
		str(moved),
		str(coalesced),
		str(settled),
		str(final_target_matches),
		str(target_cell),
		str(last_cell),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_shop_select_perf_check() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 999)
	var item_elapsed_samples: Array[int] = []
	var equipment_elapsed_samples: Array[int] = []
	var item_flush_samples: Array[int] = []
	var equipment_flush_samples: Array[int] = []
	var item_count := 0
	var equipment_count := 0
	var item_shop_ok := true
	var equipment_shop_ok := true
	for sample_index in range(3):
		var item_sample: Dictionary = await _shop_select_perf_sample(ShopCatalogModel.DEFAULT_SHOP_ID, 180)
		item_elapsed_samples.append(int(item_sample.get("elapsedUsec", 0)))
		item_flush_samples.append(int(item_sample.get("flushUsec", 0)))
		item_count = int(item_sample.get("itemCount", item_count))
		item_shop_ok = item_shop_ok and bool(item_sample.get("ok", false))
		var equipment_sample: Dictionary = await _shop_select_perf_sample(FIREBUD_EQUIPMENT_SHOP_ID, 120)
		equipment_elapsed_samples.append(int(equipment_sample.get("elapsedUsec", 0)))
		equipment_flush_samples.append(int(equipment_sample.get("flushUsec", 0)))
		equipment_count = int(equipment_sample.get("itemCount", equipment_count))
		equipment_shop_ok = equipment_shop_ok and bool(equipment_sample.get("ok", false))
	var item_shop_elapsed_usec := _median_int(item_elapsed_samples)
	var equipment_shop_elapsed_usec := _median_int(equipment_elapsed_samples)
	var status := "ok" if item_shop_ok and equipment_shop_ok else "failed"
	print("shop select perf check ready: status=%s item_us=%d equipment_us=%d item_flush_us=%d equipment_flush_us=%d item_min_us=%d item_max_us=%d equipment_min_us=%d equipment_max_us=%d item_count=%d equipment_count=%d selected=%s samples=%d" % [
		status,
		item_shop_elapsed_usec,
		equipment_shop_elapsed_usec,
		_median_int(item_flush_samples),
		_median_int(equipment_flush_samples),
		_min_int(item_elapsed_samples),
		_max_int(item_elapsed_samples),
		_min_int(equipment_elapsed_samples),
		_max_int(equipment_elapsed_samples),
		item_count,
		equipment_count,
		shop_selected_item_id,
		item_elapsed_samples.size(),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _shop_select_perf_sample(shop_id: String, select_count: int) -> Dictionary:
	_open_shop_panel(shop_id)
	await get_tree().process_frame
	var item_ids := _shop_item_ids_for_mode("buy")
	if item_ids.is_empty():
		return {"ok": false, "elapsedUsec": 0, "itemCount": 0}
	var started_usec := Time.get_ticks_usec()
	for index in range(select_count):
		_select_shop_item(str(item_ids[index % item_ids.size()]), true)
	var elapsed_usec := Time.get_ticks_usec() - started_usec
	var expected_selected := str(item_ids[(select_count - 1) % item_ids.size()])
	var flush_started_usec := Time.get_ticks_usec()
	await get_tree().process_frame
	var flush_usec := Time.get_ticks_usec() - flush_started_usec
	var expected_detail := _shop_detail_text_cached(expected_selected, _backpack_item_count_for_ui(expected_selected))
	return {
		"ok": shop_selected_item_id == expected_selected and shop_detail_label != null and shop_detail_label.text == expected_detail,
		"elapsedUsec": elapsed_usec,
		"flushUsec": flush_usec,
		"itemCount": item_ids.size(),
	}


func _median_int(values: Array[int]) -> int:
	if values.is_empty():
		return 0
	var sorted_values := values.duplicate()
	sorted_values.sort()
	return int(sorted_values[sorted_values.size() / 2])


func _min_int(values: Array[int]) -> int:
	if values.is_empty():
		return 0
	var result := int(values[0])
	for value in values:
		result = mini(result, int(value))
	return result


func _max_int(values: Array[int]) -> int:
	if values.is_empty():
		return 0
	var result := int(values[0])
	for value in values:
		result = maxi(result, int(value))
	return result


func _run_auto_mouse_click_check() -> void:
	await _auto_checks()._run_auto_mouse_click_check()


func _run_auto_pathfinding_check() -> void:
	await _auto_checks()._run_auto_pathfinding_check()


func _run_auto_camera_check() -> void:
	await _auto_checks()._run_auto_camera_check()


func _run_auto_camera_click_check() -> void:
	await _auto_checks()._run_auto_camera_click_check()


func _run_auto_animation_state_check() -> void:
	await _auto_checks()._run_auto_animation_state_check()


func _run_auto_pet_follow_check() -> void:
	await _auto_checks()._run_auto_pet_follow_check()


func _run_auto_npc_interaction_check() -> void:
	await _auto_checks()._run_auto_npc_interaction_check()


func _run_auto_facility_dialog_options_check() -> void:
	await _auto_checks()._run_auto_facility_dialog_options_check()


func _run_auto_stable_facility_check() -> void:
	await _auto_checks()._run_auto_stable_facility_check()


func _run_auto_npc_collision_check() -> void:
	await _auto_checks()._run_auto_npc_collision_check()


func _run_auto_map_transfer_check() -> void:
	await _auto_checks()._run_auto_map_transfer_check()


func _run_auto_encounter_check() -> void:
	await _auto_checks()._run_auto_encounter_check()


func _run_auto_gm_10v10_map_check() -> void:
	await _auto_checks()._run_auto_gm_10v10_map_check()


func _run_auto_level_grass_trial_map_check() -> void:
	await _auto_checks()._run_auto_level_grass_trial_map_check()


func _run_auto_battle_check() -> void:
	await _auto_checks()._run_auto_battle_check()


func _run_auto_battle_auto_attack_check() -> void:
	await _auto_checks()._run_auto_battle_auto_attack_check()


func _run_auto_battle_auto_10v10_check() -> void:
	await _auto_checks()._run_auto_battle_auto_10v10_check()


func _run_auto_battle_settings_check() -> void:
	await _auto_checks()._run_auto_battle_settings_check()


func _run_auto_capture_settings_check() -> void:
	await _auto_checks()._run_auto_capture_settings_check()


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
	await _auto_checks()._run_auto_training_partner_check()


func _run_auto_battle_formation_check() -> void:
	await _auto_checks()._run_auto_battle_formation_check()


func _run_auto_battle_target_check() -> void:
	await _auto_checks()._run_auto_battle_target_check()


func _run_auto_battle_round_check() -> void:
	await _auto_checks()._run_auto_battle_round_check()


func _run_auto_battle_command_timer_check() -> void:
	await _auto_checks()._run_auto_battle_command_timer_check()


func _run_auto_battle_speed_check() -> void:
	await _auto_checks()._run_auto_battle_speed_check()


func _run_auto_battle_feedback_check() -> void:
	await _auto_checks()._run_auto_battle_feedback_check()


func _run_auto_battle_combo_check() -> void:
	await _auto_checks()._run_auto_battle_combo_check()


func _run_auto_battle_capture_check() -> void:
	await _auto_checks()._run_auto_battle_capture_check()


func _run_auto_capture_tools_check() -> void:
	await _auto_checks()._run_auto_capture_tools_check()


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
	await _auto_checks()._run_auto_battle_spirit_check()


func _run_auto_battle_spirit_source_check() -> void:
	await _auto_checks()._run_auto_battle_spirit_source_check()


func _option_button_has_item_text(option: OptionButton, needle: String) -> bool:
	if option == null:
		return false
	for index in range(option.item_count):
		if option.get_item_text(index).find(needle) >= 0:
			return true
	return false


func _option_button_has_metadata(option: OptionButton, metadata_text: String) -> bool:
	if option == null:
		return false
	for index in range(option.get_item_count()):
		if str(option.get_item_metadata(index)) == metadata_text:
			return true
	return false


func _run_auto_balance_catalog_check() -> void:
	await _auto_checks()._run_auto_balance_catalog_check()


func _run_numeric_experiment_report(check_only: bool = false) -> void:
	var report := NumericExperimentModel.build_report()
	var write_result := NumericExperimentModel.write_report(report)
	var errors := NumericExperimentModel.validation_errors(report)
	if not bool(write_result.get("ok", false)):
		errors.append(str(write_result.get("error", "报告写入失败")))
	var anchors: Array = report.get("levelCurve", {}).get("anchors", [])
	var pet_growth_samples: Array = report.get("petGrowth", {}).get("growthSamples", [])
	var reward_samples: Array = report.get("battleRewards", {}).get("samples", [])
	var progression_samples: Array = report.get("progressionZones", {}).get("samples", [])
	var progression_summary := report.get("progressionZones", {}).get("summary", {}) as Dictionary
	var combat_shadow_samples: Array = report.get("combatFormulaShadow", {}).get("samples", [])
	var combat_v2_shadow_samples: Array = report.get("combatV2Shadow", {}).get("samples", [])
	var combat_v2_shadow_summary := report.get("combatV2Shadow", {}).get("summary", {}) as Dictionary
	var combat_driver_ab_samples: Array = report.get("combatFormulaDriverAB", {}).get("samples", [])
	var combat_driver_ab_summary := report.get("combatFormulaDriverAB", {}).get("summary", {}) as Dictionary
	var battle_simulation_samples: Array = report.get("battleSimulation", {}).get("samples", [])
	var battle_simulation_summary := report.get("battleSimulation", {}).get("summary", {}) as Dictionary
	var economy_ledger_samples: Array = report.get("economyLedger", {}).get("samples", [])
	var economy_ledger_summary := report.get("economyLedger", {}).get("summary", {}) as Dictionary
	var capture_rows: Array = report.get("captureMatrix", {}).get("rows", [])
	var status := "ok" if errors.is_empty() else "failed"
	print("numeric experiment report ready: status=%s check=%s output=%s anchors=%d pet_growth_samples=%d reward_samples=%d progression_samples=%d progression_exp_ok=%d progression_battle_ok=%d combat_shadow_samples=%d combat_v2_samples=%d combat_v2_criteria=%d/%d driver_ab_samples=%d driver_ab_identical=%d battle_simulation_samples=%d battle_simulation_ok=%d economy_samples=%d economy_net_ok=%d capture_rows=%d errors=%s" % [
		status,
		str(check_only),
		str(write_result.get("path", "")),
		anchors.size(),
		pet_growth_samples.size(),
		reward_samples.size(),
		progression_samples.size(),
		int(progression_summary.get("expOk", 0)),
		int(progression_summary.get("battleCountOk", 0)),
		combat_shadow_samples.size(),
		combat_v2_shadow_samples.size(),
		int(combat_v2_shadow_summary.get("criteriaPassed", 0)),
		int(combat_v2_shadow_summary.get("criteriaTotal", 0)),
		combat_driver_ab_samples.size(),
		int(combat_driver_ab_summary.get("identicalCount", 0)),
		battle_simulation_samples.size(),
		int(battle_simulation_summary.get("expectationOk", 0)),
		economy_ledger_samples.size(),
		int(economy_ledger_summary.get("repeatableNetPositive", 0)),
		capture_rows.size(),
		";".join(errors),
	])
	get_tree().quit(0 if status == "ok" else 1)


func _run_auto_pet_growth_observation_check() -> void:
	await _auto_checks()._run_auto_pet_growth_observation_check()


func _run_auto_pet_growth_threshold_check() -> void:
	await _auto_checks()._run_auto_pet_growth_threshold_check()


func _run_auto_pet_growth_species_simulation_check() -> void:
	await _auto_checks()._run_auto_pet_growth_species_simulation_check()


func _run_auto_pet_growth_starter_profiles_check() -> void:
	await _auto_checks()._run_auto_pet_growth_starter_profiles_check()


func _run_auto_combat_formula_parity_check() -> void:
	await _auto_checks()._run_auto_combat_formula_parity_check()


func _run_auto_combat_v2_shadow_check() -> void:
	await _auto_checks()._run_auto_combat_v2_shadow_check()


func _run_auto_combat_formula_driver_ab_check() -> void:
	await _auto_checks()._run_auto_combat_formula_driver_ab_check()


func _run_auto_numeric_battle_simulation_check() -> void:
	await _auto_checks()._run_auto_numeric_battle_simulation_check()


func _run_auto_numeric_workbench_check() -> void:
	await _auto_checks()._run_auto_numeric_workbench_check()


func _run_auto_economy_ledger_check() -> void:
	await _auto_checks()._run_auto_economy_ledger_check()


func _run_auto_numeric_balance_gate_check() -> void:
	await _auto_checks()._run_auto_numeric_balance_gate_check()


func _run_auto_battle_action_catalog_check() -> void:
	await _auto_checks()._run_auto_battle_action_catalog_check()


func _run_auto_battle_action_system_check() -> void:
	await _auto_checks()._run_auto_battle_action_system_check()


func _run_auto_battle_pet_command_check() -> void:
	await _auto_checks()._run_auto_battle_pet_command_check()


func _run_auto_battle_pet_target_check() -> void:
	await _auto_checks()._run_auto_battle_pet_target_check()


func _run_auto_battle_switch_pet_check() -> void:
	await _auto_checks()._run_auto_battle_switch_pet_check()


func _run_auto_battle_retarget_visual_check() -> void:
	await _auto_checks()._run_auto_battle_retarget_visual_check()


func _run_auto_battle_visual_timing_check() -> void:
	await _auto_checks()._run_auto_battle_visual_timing_check()


func _run_auto_battle_label_check() -> void:
	await _auto_checks()._run_auto_battle_label_check()


func _run_auto_battle_event_ledger_check() -> void:
	await _auto_checks()._run_auto_battle_event_ledger_check()


func _run_auto_battle_reaction_check() -> void:
	await _auto_checks()._run_auto_battle_reaction_check()


func _run_auto_battle_result_check() -> void:
	await _auto_checks()._run_auto_battle_result_check()


func _run_auto_battle_knockaway_result_check() -> void:
	await _auto_checks()._run_auto_battle_knockaway_result_check()


func _run_auto_pet_management_check() -> void:
	await _auto_checks()._run_auto_pet_management_check()


func _party_order_ids() -> Array[String]:
	var result: Array[String] = []
	for instance in PlayerProgressModel.party_pet_instances(player_profile):
		result.append(str(instance.get("instanceId", "")))
	return result


func _run_auto_pet_order_check() -> void:
	await _auto_checks()._run_auto_pet_order_check()


func _run_auto_pet_growth_check() -> void:
	await _auto_checks()._run_auto_pet_growth_check()


func _pet_stats_differ(first: Dictionary, second: Dictionary) -> bool:
	return (
		int(first.get("maxHp", 0)) != int(second.get("maxHp", 0))
		or int(first.get("attack", 0)) != int(second.get("attack", 0))
		or int(first.get("defense", 0)) != int(second.get("defense", 0))
		or int(first.get("quick", 0)) != int(second.get("quick", 0))
		or int(first.get("combatPower", 0)) != int(second.get("combatPower", 0))
	)


func _run_auto_pet_individual_growth_check() -> void:
	await _auto_checks()._run_auto_pet_individual_growth_check()


func _run_auto_pet_cultivation_check() -> void:
	await _auto_checks()._run_auto_pet_cultivation_check()


func _run_auto_pet_rebirth_mm_check() -> void:
	await _auto_checks()._run_auto_pet_rebirth_mm_check()


func _run_auto_pet_rebirth_mm_formula_check() -> void:
	await _auto_checks()._run_auto_pet_rebirth_mm_formula_check()


func _run_auto_pet_rename_check() -> void:
	await _auto_checks()._run_auto_pet_rename_check()


func _run_auto_pet_recovery_check() -> void:
	await _auto_checks()._run_auto_pet_recovery_check()


func _run_auto_village_healer_check() -> void:
	await _auto_checks()._run_auto_village_healer_check()


func _run_auto_record_point_check() -> void:
	await _auto_checks()._run_auto_record_point_check()


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
	await _auto_checks()._run_auto_pet_stable_check()


func _run_auto_pet_drop_pickup_check() -> void:
	await _auto_checks()._run_auto_pet_drop_pickup_check()


func _run_auto_pet_codex_detail_check() -> void:
	await _auto_checks()._run_auto_pet_codex_detail_check()


func _run_auto_pet_codex_list_check() -> void:
	await _auto_checks()._run_auto_pet_codex_list_check()


func _run_auto_pet_encounter_table_check() -> void:
	await _auto_checks()._run_auto_pet_encounter_table_check()


func _run_auto_pet_storage_capture_check() -> void:
	await _auto_checks()._run_auto_pet_storage_capture_check()


func _run_pet_management_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_selected_instance_id = "pet_bui_speed"
	_open_pet_panel()
	_select_pet_instance("pet_bui_speed")


func _run_pet_order_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	pet_filter_mode = PET_FILTER_ALL
	pet_sort_mode = PET_SORT_DEFAULT
	pet_sort_descending = true
	pet_selected_instance_id = "pet_bui_speed"
	_open_pet_panel()
	_select_pet_instance("pet_bui_speed")
	_set_world_log_message("Phase79：队伍宠物可调整上移 / 下移。")


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
	var base_profile := PlayerProgressModel.default_profile()
	var base_pet := PlayerProgressModel.pet_instance_by_id(base_profile, "pet_bui_main")
	player_profile = _profile_with_pet_hp(base_profile, "pet_bui_main", maxi(1, int(base_pet.get("maxHp", 1))))
	backpack_selected_slot_index = 0
	_open_backpack_panel()
	_on_backpack_use_pressed()
	await get_tree().process_frame
	_use_backpack_item_on_pet(BattleModel.ITEM_MEAT_SMALL, "pet_bui_main")


func _run_backpack_filter_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _backpack_filter_test_profile()
	backpack_selected_slot_index = 0
	_set_world_log_message("Phase82：随身包可按用途筛选。")
	_open_backpack_panel()
	_set_backpack_filter(BACKPACK_FILTER_WORLD)


func _run_battle_reward_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var reward_state := _battle_reward_test_state("battle_reward_preview", player_profile)
	var result := PlayerProgressModel.apply_battle_result(player_profile, reward_state, "victory")
	player_profile = result.get("profile", player_profile)
	_set_world_log_message(_battle_result_log_text(result))
	backpack_selected_slot_index = 0
	_open_backpack_panel()


func _run_equipment_drop_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var drop_case := _equipment_drop_case_for_profile(player_profile, "equipment_drop_preview")
	if drop_case.is_empty():
		_load_map("firebud_village_gate", "from_training_yard")
		_set_world_log_message("未找到装备碎片掉落种子。")
		return
	var result := drop_case.get("result", {}) as Dictionary
	player_profile = result.get("profile", player_profile) as Dictionary
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message(_battle_result_log_text(result))
	var fragment_id := str(drop_case.get("fragmentId", EQUIP_FRAG_WOOD_BASIC_ID))
	backpack_selected_slot_index = _backpack_slot_index_for_item(fragment_id)
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
	await _auto_checks()._run_auto_backpack_check()


func _run_auto_backpack_world_use_check() -> void:
	await _auto_checks()._run_auto_backpack_world_use_check()


func _run_auto_exp_pill_check() -> void:
	await _auto_checks()._run_auto_exp_pill_check()


func _run_auto_mailbox_check() -> void:
	await _auto_checks()._run_auto_mailbox_check()


func _run_auto_riding_system_check() -> void:
	await _auto_checks()._run_auto_riding_system_check()


func _backpack_filter_test_profile() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var add_result := BackpackModel.add_items(PlayerProgressModel.backpack_slots(profile), [
		{"itemId": "weapon_wooden_club", "count": 1},
		{"itemId": ENCOUNTER_STONE_LOW_ID, "count": 1},
		{"itemId": BattleModel.CAPTURE_TOOL_NET_REINFORCED, "count": 1},
	])
	return PlayerProgressModel.with_backpack_slots(profile, add_result.get("slots", []))


func _run_auto_backpack_filter_check() -> void:
	await _auto_checks()._run_auto_backpack_filter_check()


func _run_shop_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_open_shop_panel(ShopCatalogModel.DEFAULT_SHOP_ID)


func _run_auto_shop_check() -> void:
	await _auto_checks()._run_auto_shop_check()


func _run_auto_equipment_shop_preview_check() -> void:
	await _auto_checks()._run_auto_equipment_shop_preview_check()


func _run_auto_equipment_check() -> void:
	await _auto_checks()._run_auto_equipment_check()


func _run_auto_equipment_synthesis_check() -> void:
	await _auto_checks()._run_auto_equipment_synthesis_check()


func _run_equipment_synthesis_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	player_profile = _profile_with_item_count(player_profile, EQUIP_FRAG_WOOD_BASIC_ID, 3)
	player_profile = _profile_with_item_count(player_profile, EQUIP_FRAG_HIDE_BASIC_ID, 3)
	player_profile = PlayerProgressModel.with_stone_coins(player_profile, 80)
	equipment_synthesis_selected_recipe_id = "craft_hardwood_club"
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("装备合成材料已准备。")
	_open_equipment_synthesis_panel()


func _profile_with_item_count(profile: Dictionary, item_id: String, count: int) -> Dictionary:
	var slots := BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(profile), item_id, count)
	return PlayerProgressModel.with_backpack_slots(profile, slots)


func _run_auto_player_status_check() -> void:
	await _auto_checks()._run_auto_player_status_check()


func _run_auto_player_stat_points_check() -> void:
	await _auto_checks()._run_auto_player_stat_points_check()


func _run_auto_player_stat_spam_perf_check() -> void:
	await _auto_checks()._run_auto_player_stat_spam_perf_check()


func _run_auto_player_rebirth_preview_check() -> void:
	await _auto_checks()._run_auto_player_rebirth_preview_check()


func _run_auto_player_rebirth_execute_check() -> void:
	await _auto_checks()._run_auto_player_rebirth_execute_check()


func _profile_with_rebirth_test_level(profile: Dictionary, level: int = 80) -> Dictionary:
	var next_profile := PlayerProgressModel.normalize_profile(profile)
	var player := next_profile.get("player", {}) as Dictionary
	var target := PlayerProgressModel.rebirth_count(next_profile) + 1
	player["level"] = maxi(1, level)
	player["exp"] = 0
	player["nextExp"] = PlayerProgressModel.exp_to_next_level(maxi(1, level))
	player["baseStats"] = {
		"maxHp": 220 + target * 8,
		"attack": 45 + target * 2,
		"defense": 30 + target,
		"quick": 90 + target * 2,
	}
	player["hp"] = int((player["baseStats"] as Dictionary).get("maxHp", 220))
	next_profile["player"] = player
	return PlayerProgressModel.normalize_profile(next_profile)


func _profile_with_rebirth_trial_resources_for_test(profile: Dictionary, target_count: int = 0) -> Dictionary:
	var next_profile := PlayerProgressModel.normalize_profile(profile)
	var target := target_count if target_count > 0 else PlayerProgressModel.rebirth_count(next_profile) + 1
	target = clampi(target, 1, 6)
	var reward_entries: Array[Dictionary] = []
	for ring_id in RebirthTrialModel.stage_required_ring_ids(target):
		reward_entries.append({
			"itemId": ring_id,
			"count": 1,
		})
	var add_result := BackpackModel.add_items(BackpackModel.slots_from_counts({}), reward_entries)
	next_profile = PlayerProgressModel.with_backpack_slots(next_profile, add_result.get("slots", []))
	var instances: Array = next_profile.get("petInstances", [])
	var serial := maxi(int(next_profile.get("nextPetInstanceSerial", 1)), _next_pet_instance_serial_for_test(instances))
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target):
		var instance := PlayerProgressModel.create_pet_instance_from_form(
			"pet_rebirth_trial_%d_%d" % [target, serial],
			"",
			form_id,
			PlayerProgressModel.PET_STATE_STORAGE,
			50
		)
		serial += 1
		if not instance.is_empty():
			instances.append(instance)
	next_profile["petInstances"] = instances
	next_profile["nextPetInstanceSerial"] = serial
	next_profile = PlayerProgressModel.with_rebirth_trial_proof_count(next_profile, PlayerProgressModel.REBIRTH_FINAL_BOSS_PROOF_ID, PlayerProgressModel.rebirth_trial_proof_count(next_profile, PlayerProgressModel.REBIRTH_FINAL_BOSS_PROOF_ID) + 1)
	return PlayerProgressModel.normalize_profile(next_profile)


func _next_pet_instance_serial_for_test(instances: Array) -> int:
	var max_serial := 0
	for value in instances:
		if not (value is Dictionary):
			continue
		var instance_id := str((value as Dictionary).get("instanceId", ""))
		var parts := instance_id.split("_")
		if parts.is_empty():
			continue
		max_serial = maxi(max_serial, int(parts[parts.size() - 1]))
	return max_serial + 1


func _profile_has_pet_form(profile: Dictionary, form_id: String) -> bool:
	for instance in PlayerProgressModel.all_pet_instances(profile):
		if str(instance.get("formId", instance.get("templateId", ""))) == form_id:
			return true
	return false


func _complete_active_rebirth_quest_for_test(profile: Dictionary) -> Dictionary:
	var event_result := PlayerProgressModel.record_quest_event(profile, {
		"type": "talk",
		"targetId": "firebud_rebirth_mentor",
	})
	var event_profile := event_result.get("profile", profile) as Dictionary
	var claim_result := PlayerProgressModel.claim_active_quest(event_profile)
	return {
		"event": event_result,
		"claim": claim_result,
		"profile": claim_result.get("profile", event_profile),
	}


func _run_auto_player_rebirth_chain_check() -> void:
	await _auto_checks()._run_auto_player_rebirth_chain_check()


func _profile_after_rebirths_for_test(count: int) -> Dictionary:
	var profile := _profile_with_active_quest("quest_rebirth_1_guidance")
	for target in range(1, clampi(count, 0, 6) + 1):
		var expected_quest_id := "quest_rebirth_%d_guidance" % target
		if PlayerProgressModel.active_quest_id(profile) != expected_quest_id:
			break
		var completion := _complete_active_rebirth_quest_for_test(profile)
		profile = completion.get("profile", profile) as Dictionary
		profile = _profile_with_rebirth_test_level(profile, 80)
		profile = _profile_with_rebirth_trial_resources_for_test(profile, target)
		var execute_result := PlayerProgressModel.execute_rebirth(profile)
		if not bool(execute_result.get("ok", false)):
			break
		profile = execute_result.get("profile", profile) as Dictionary
	return PlayerProgressModel.normalize_profile(profile)


func _profile_after_six_rebirths_for_test() -> Dictionary:
	return _profile_after_rebirths_for_test(6)


func _run_auto_remote_stable_unlock_check() -> void:
	await _auto_checks()._run_auto_remote_stable_unlock_check()


func _run_auto_rebirth_trial_contract_check() -> void:
	await _auto_checks()._run_auto_rebirth_trial_contract_check()


func _run_auto_rebirth_cave_guardian_check() -> void:
	await _auto_checks()._run_auto_rebirth_cave_guardian_check()


func _run_auto_shadow_oath_cavern_check() -> void:
	await _auto_checks()._run_auto_shadow_oath_cavern_check()


func _run_auto_rebirth_trial_execute_check() -> void:
	await _auto_checks()._run_auto_rebirth_trial_execute_check()


func _run_auto_equipment_requirement_check() -> void:
	await _auto_checks()._run_auto_equipment_requirement_check()


func _run_auto_equipment_inactive_after_rebirth_check() -> void:
	await _auto_checks()._run_auto_equipment_inactive_after_rebirth_check()


func _profile_ready_to_rebirth_with_bone_blade_for_ui() -> Dictionary:
	var profile := PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 500)
	var player_dict := profile.get("player", {}) as Dictionary
	player_dict["level"] = 80
	player_dict["exp"] = 0
	player_dict["nextExp"] = PlayerProgressModel.exp_to_next_level(80)
	player_dict["baseStats"] = {
		"maxHp": 220,
		"attack": 45,
		"defense": 30,
		"quick": 90,
	}
	player_dict["hp"] = 220
	profile["player"] = player_dict
	profile = PlayerProgressModel.normalize_profile(profile)
	profile = PlayerProgressModel.with_rebirth_quest_completed(profile, 1, true)
	profile = _profile_with_rebirth_trial_resources_for_test(profile, 1)
	profile = PlayerProgressModel.buy_shop_item(profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_bone_blade").get("profile", profile) as Dictionary
	profile = PlayerProgressModel.equip_item(profile, "weapon_bone_blade").get("profile", profile) as Dictionary
	return PlayerProgressModel.normalize_profile(profile)


func _run_auto_equipment_status_closure_check() -> void:
	await _auto_checks()._run_auto_equipment_status_closure_check()


func _run_auto_equipment_durability_check() -> void:
	await _auto_checks()._run_auto_equipment_durability_check()


func _run_auto_equipment_growth_check() -> void:
	await _auto_checks()._run_auto_equipment_growth_check()


func _run_auto_equipment_instance_check() -> void:
	await _auto_checks()._run_auto_equipment_instance_check()


func _run_auto_reward_grant_check() -> void:
	await _auto_checks()._run_auto_reward_grant_check()


func _run_auto_quest_objective_templates_check() -> void:
	await _auto_checks()._run_auto_quest_objective_templates_check()


func _run_auto_map_region_contract_check() -> void:
	await _auto_checks()._run_auto_map_region_contract_check()


func _run_auto_equipment_durability_visual_check() -> void:
	await _auto_checks()._run_auto_equipment_durability_visual_check()


func _run_auto_equipment_slot_detail_check() -> void:
	await _auto_checks()._run_auto_equipment_slot_detail_check()


func _run_auto_encounter_loop_check() -> void:
	await _auto_checks()._run_auto_encounter_loop_check()


func _run_auto_reward_mail_fallback_check() -> void:
	await _auto_checks()._run_auto_reward_mail_fallback_check()


func _full_backpack_slots_for_reward_mail_check() -> Array[Dictionary]:
	var fill_counts := {}
	var filled := 0
	for item in BackpackModel.items():
		if filled >= BackpackModel.BASE_SLOT_LIMIT:
			break
		var item_id := str(item.get("id", ""))
		if item_id == "":
			continue
		fill_counts[item_id] = BackpackModel.stack_limit_for(item_id)
		filled += 1
	return BackpackModel.slots_from_counts(fill_counts, BackpackModel.BASE_SLOT_LIMIT)


func _run_auto_hang_loop_closure_check() -> void:
	await _auto_checks()._run_auto_hang_loop_closure_check()


func _run_auto_hang_supply_closure_check() -> void:
	await _auto_checks()._run_auto_hang_supply_closure_check()


func _run_auto_pet_management_safety_check() -> void:
	await _auto_checks()._run_auto_pet_management_safety_check()


func _run_auto_player_growth_contract_check() -> void:
	await _auto_checks()._run_auto_player_growth_contract_check()


func _run_auto_server_profile_contract_check() -> void:
	await _auto_checks()._run_auto_server_profile_contract_check()


func _run_auto_server_auth_contract_check() -> void:
	await _auto_checks()._run_auto_server_auth_contract_check()


func _run_auto_balance_version_receipt_check() -> void:
	await _auto_checks()._run_auto_balance_version_receipt_check()


func _run_auto_balance_snapshot_digest_check() -> void:
	await _auto_checks()._run_auto_balance_snapshot_digest_check()


func _run_auto_battle_reward_check() -> void:
	await _auto_checks()._run_auto_battle_reward_check()


func _run_auto_equipment_drop_check() -> void:
	await _auto_checks()._run_auto_equipment_drop_check()


func _equipment_drop_case_for_profile(profile: Dictionary, seed_prefix: String) -> Dictionary:
	for index in range(400):
		var seed := "%s_%03d" % [seed_prefix, index]
		var state := _battle_reward_test_state(seed, profile)
		var result := PlayerProgressModel.apply_battle_result(profile, state, "victory")
		var rewards: Array = result.get("itemRewards", [])
		var fragment_id := _first_equipment_fragment_id(rewards)
		if fragment_id != "":
			return {
			"seed": seed,
			"state": state,
			"result": result,
			"fragmentId": fragment_id,
			}
	return {}


func _first_equipment_fragment_id(rewards: Array) -> String:
	for reward in rewards:
		if not (reward is Dictionary):
			continue
		var item_id := str((reward as Dictionary).get("itemId", ""))
		if _is_equipment_fragment_id(item_id):
			return item_id
	return ""


func _equipment_fragment_count(value) -> int:
	var total := 0
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry := entry_value as Dictionary
			var item_id := str(entry.get("itemId", ""))
			if _is_equipment_fragment_id(item_id):
				total += maxi(0, int(entry.get("count", 0)))
	return total


func _is_equipment_fragment_id(item_id: String) -> bool:
	return item_id == EQUIP_FRAG_WOOD_BASIC_ID or item_id == EQUIP_FRAG_HIDE_BASIC_ID


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


func _run_quest_reward_choice_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _quest_reward_choice_ready_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase75：任务已完成，请选择一份奖励。")
	_open_quest_panel()
	if status_label != null:
		_update_hud_text()


func _run_quest_equipment_tutorial_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _quest_equipment_tutorial_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase87：换装后进入战斗，使用装备提供的毒精灵1。")
	_open_quest_panel()
	if status_label != null:
		_update_hud_text()


func _profile_with_active_quest(quest_id: String) -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var states := {}
	for quest in QuestModel.quests():
		var current_quest_id := str(quest.get("id", ""))
		if current_quest_id == "":
			continue
		if current_quest_id == quest_id:
			states[current_quest_id] = {
			"status": QuestModel.STATUS_ACTIVE,
			"progress": 0,
			}
			break
		states[current_quest_id] = {
			"status": QuestModel.STATUS_CLAIMED,
			"progress": QuestModel.objective_required_count(quest),
		}
	profile[PlayerProgressModel.QUEST_STATES_KEY] = states
	profile[PlayerProgressModel.ACTIVE_QUEST_ID_KEY] = quest_id
	return PlayerProgressModel.normalize_profile(profile)


func _quest_equipment_tutorial_profile() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var states := {}
	for quest_id in [
		"quest_intro_talk",
		"quest_buy_supply",
		"quest_use_meat",
		"quest_buy_weapon",
		"quest_equip_weapon",
		"quest_buy_spirit_armor",
		"quest_equip_spirit_armor",
	]:
		var quest := QuestModel.quest_for_id(quest_id)
		states[quest_id] = {
			"status": QuestModel.STATUS_CLAIMED,
			"progress": QuestModel.objective_required_count(quest),
		}
	states["quest_use_poison_spirit"] = {
		"status": QuestModel.STATUS_ACTIVE,
		"progress": 0,
	}
	profile[PlayerProgressModel.QUEST_STATES_KEY] = states
	profile[PlayerProgressModel.ACTIVE_QUEST_ID_KEY] = "quest_use_poison_spirit"
	return PlayerProgressModel.normalize_profile(profile)


func _run_task_tracker_route_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_training_yard")
	_set_world_log_message("Phase80：右上任务追踪可直接寻路。")
	if status_label != null:
		_update_hud_text()


func _run_map_panel_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase76：打开地图，选择标记可自动寻路。")
	_open_map_panel()
	if status_label != null:
		_update_hud_text()


func _run_facility_marker_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _profile_with_active_quest("quest_buy_weapon")
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase91：设施已用短标签标记，任务寻路优先指向对应设施。")
	_open_map_panel()
	if status_label != null:
		_update_hud_text()


func _run_npc_quest_marker_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_rebirth_count(PlayerProgressModel.default_profile(), 4)
	_load_map("firebud_village_gate", "from_training_yard")
	var stable_keeper := InteractionModel.find_by_id(map_data, "firebud_stable_keeper")
	if player != null and not stable_keeper.is_empty():
		var focus_cell := IsoMapModel.nearest_walkable_cell(map_data, InteractionModel.cell_for(stable_keeper) + Vector2i(3, 2))
		player.global_position = IsoMapModel.grid_to_world(map_data, focus_cell)
		player.clear_move_target()
		last_checked_player_cell = focus_cell
		_update_camera_position(true)
	_set_world_log_message("Phase100：黄色叹号表示有可接任务；灰白问号为已接未完成，黄色问号为可提交。")
	if status_label != null:
		_update_hud_text()


func _run_qa_panel_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map(GM_10V10_MAP_ID, "default")
	_set_world_log_message("Phase92：GM/QA 面板集中整理手测入口和自测命令。")
	_open_qa_panel()
	if status_label != null:
		_update_hud_text()


func _run_chat_panel_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	chat_messages.clear()
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase77：聊天系统频道与世界日志分离。")
	_append_chat_message(CHAT_CHANNEL_NEARBY, "附近频道测试消息。", "见习猎人")
	_append_chat_message(CHAT_CHANNEL_TEAM, "队伍频道测试消息。", "陪练伙伴1")
	_open_chat_panel()
	if status_label != null:
		_update_hud_text()


func _run_world_log_panel_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	_load_map("firebud_village_gate", "from_training_yard")
	for index in range(18):
		_set_world_log_message("Phase83 历史消息%d：战斗、奖励和任务提示可展开查看。" % [index + 1])
	battle_message_expanded = true
	_refresh_battle_message_controls()
	_layout_hud()
	if status_label != null:
		_update_hud_text()


func _run_quick_slot_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _quick_slot_test_profile(true)
	_load_map("firebud_village_gate", "from_training_yard")
	_move_player_to_encounter_cell(Vector2i(11, 15))
	_set_world_log_message("Phase78：底部快捷槽可直接使用世界道具。")
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _run_auto_battle_settings_preview() -> void:
	await _auto_checks()._run_auto_battle_settings_preview()


func _run_battle_spirit_source_preview() -> void:
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
		_set_battle_message("Phase86：精灵按钮显示来源装备。")
	else:
		_set_world_log_message("精灵来源预览：地图或遇敌区未找到。")
	await get_tree().create_timer(1.0).timeout


func _run_auto_capture_settings_preview() -> void:
	await _auto_checks()._run_auto_capture_settings_preview()


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
	await _auto_checks()._run_auto_hang_settings_check()


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


func _run_equipment_shop_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 300)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("目标Phase72：装备商店显示换装预览，可选择购买后装备。")
	_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
	_select_shop_item("weapon_stone_axe")
	if shop_equip_after_buy_button != null:
		shop_equip_after_buy_button.button_pressed = true
	_on_shop_equip_after_buy_pressed()
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


func _run_player_rebirth_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var player_dict := player_profile.get("player", {}) as Dictionary
	player_dict["level"] = 80
	player_dict["exp"] = 0
	player_dict["nextExp"] = PlayerProgressModel.exp_to_next_level(80)
	player_dict["baseStats"] = {
		"maxHp": 220,
		"attack": 45,
		"defense": 30,
		"quick": 90,
	}
	player_dict["hp"] = 220
	player_profile["player"] = player_dict
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	player_profile = PlayerProgressModel.with_rebirth_quest_completed(player_profile, 1, true)
	player_profile = _profile_with_rebirth_trial_resources_for_test(player_profile, 1)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase94C：转生预览与二次确认。")
	_open_player_rebirth_preview_panel()
	await get_tree().create_timer(1.0).timeout


func _run_player_rebirth_chain_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_rebirth_count(PlayerProgressModel.default_profile(), 5)
	player_profile = PlayerProgressModel.with_rebirth_quest_completed(player_profile, 6, true)
	player_profile = _profile_with_rebirth_test_level(player_profile, 80)
	player_profile = _profile_with_rebirth_trial_resources_for_test(player_profile, 6)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase98：二转到六转使用同一套转生预览和执行流程。")
	_open_player_rebirth_preview_panel()
	await get_tree().create_timer(1.0).timeout


func _run_remote_stable_unlock_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _profile_after_six_rebirths_for_test()
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase99：六转后可向兽栏管理员学习远程兽栏。")
	var stable_keeper := InteractionModel.find_by_id(map_data, "firebud_stable_keeper")
	_open_interaction_dialog(stable_keeper)
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


func _run_equipment_rebirth_requirement_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 500)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase95：转纹骨斧需要一转后才能装备。")
	_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
	_select_shop_item("weapon_rebirth_bone_axe")
	await get_tree().create_timer(1.0).timeout


func _run_equipment_inactive_after_rebirth_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	var profile := PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 500)
	var player_dict := profile.get("player", {}) as Dictionary
	player_dict["level"] = 80
	player_dict["exp"] = 0
	player_dict["nextExp"] = PlayerProgressModel.exp_to_next_level(80)
	player_dict["baseStats"] = {
		"maxHp": 220,
		"attack": 45,
		"defense": 30,
		"quick": 90,
	}
	player_dict["hp"] = 220
	profile["player"] = player_dict
	profile = PlayerProgressModel.with_rebirth_quest_completed(profile, 1, true)
	profile = _profile_with_rebirth_trial_resources_for_test(profile, 1)
	profile = PlayerProgressModel.buy_shop_item(profile, FIREBUD_EQUIPMENT_SHOP_ID, "weapon_bone_blade").get("profile", profile) as Dictionary
	profile = PlayerProgressModel.equip_item(profile, "weapon_bone_blade").get("profile", profile) as Dictionary
	player_profile = PlayerProgressModel.execute_rebirth(profile).get("profile", profile) as Dictionary
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase96：转生后未满足需求的装备保留在槽位，但暂不生效。")
	equipment_selected_slot_id = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	_open_equipment_panel()
	await get_tree().create_timer(1.0).timeout


func _run_equipment_status_closure_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	var ready_profile := _profile_ready_to_rebirth_with_bone_blade_for_ui()
	player_profile = PlayerProgressModel.execute_rebirth(ready_profile).get("profile", ready_profile) as Dictionary
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("Phase97：状态总览会汇总装备生效/未生效。")
	_open_player_status_panel()
	await get_tree().process_frame
	var status_scroll := player_status_detail_label.get_parent() as ScrollContainer if player_status_detail_label != null else null
	if status_scroll != null:
		status_scroll.scroll_vertical = 250
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


func _run_equipment_durability_visual_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.default_profile()
	var durability := PlayerProgressModel.equipment_durability(player_profile)
	durability[EquipmentModel.SLOT_RIGHT_HAND_WEAPON] = 0
	durability[EquipmentModel.SLOT_BODY] = 12
	player_profile[PlayerProgressModel.EQUIPMENT_DURABILITY_KEY] = durability
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_load_map("firebud_village_gate", "from_training_yard")
	equipment_selected_slot_id = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	_set_world_log_message("Phase81：装备格直接显示耐久，损坏红字、磨损黄字。")
	_open_equipment_panel()
	await get_tree().create_timer(1.0).timeout


func _run_equipment_slot_detail_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = PlayerProgressModel.without_equipment(PlayerProgressModel.default_profile())
	var slots := PlayerProgressModel.backpack_slots(player_profile)
	var add_result := BackpackModel.add_items(slots, [
		{"itemId": "weapon_wooden_club", "count": 1},
		{"itemId": "weapon_blessed_club", "count": 1},
	])
	player_profile = PlayerProgressModel.with_backpack_slots(player_profile, add_result.get("slots", slots))
	_load_map("firebud_village_gate", "from_training_yard")
	equipment_selected_slot_id = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	_set_world_log_message("Phase85：空装备槽会推荐背包里的可装备物品。")
	_open_equipment_panel()
	await get_tree().create_timer(1.0).timeout


func _run_auto_quest_chain_check() -> void:
	await _auto_checks()._run_auto_quest_chain_check()


func _run_auto_quest_ui_check() -> void:
	await _auto_checks()._run_auto_quest_ui_check()


func _quest_reward_choice_ready_profile() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var states := {}
	for quest in QuestModel.quests():
		var quest_id := str(quest.get("id", ""))
		if quest_id == "" or quest_id == "quest_capture_wuli" or quest_id == "quest_rebirth_1_guidance":
			continue
		states[quest_id] = {
			"status": QuestModel.STATUS_CLAIMED,
			"progress": QuestModel.objective_required_count(quest),
		}
	var capture_quest := QuestModel.quest_for_id("quest_capture_wuli")
	states["quest_capture_wuli"] = {
		"status": QuestModel.STATUS_READY,
		"progress": QuestModel.objective_required_count(capture_quest),
	}
	profile["activeQuestId"] = "quest_capture_wuli"
	profile["questStates"] = states
	return PlayerProgressModel.normalize_profile(profile)


func _run_auto_quest_reward_choice_check() -> void:
	await _auto_checks()._run_auto_quest_reward_choice_check()


func _run_auto_quest_equipment_reward_check() -> void:
	await _auto_checks()._run_auto_quest_equipment_reward_check()


func _run_auto_task_tracker_route_check() -> void:
	await _auto_checks()._run_auto_task_tracker_route_check()


func _run_auto_rebirth_task_tracker_check() -> void:
	await _auto_checks()._run_auto_rebirth_task_tracker_check()


func _run_auto_map_panel_check() -> void:
	await _auto_checks()._run_auto_map_panel_check()


func _run_auto_facility_marker_check() -> void:
	await _auto_checks()._run_auto_facility_marker_check()


func _run_auto_npc_quest_marker_check() -> void:
	await _auto_checks()._run_auto_npc_quest_marker_check()


func _run_auto_panel_registry_check() -> void:
	await _auto_checks()._run_auto_panel_registry_check()


func _run_auth_ux_preview() -> void:
	profile_save_enabled = false
	account_authenticated = true
	current_account_session = {
		"username": "preview_player",
		"displayName": "预览猎人",
		"role": AccountAuthModel.ROLE_PLAYER,
		"effectiveRole": AccountAuthModel.EFFECTIVE_ROLE_PLAYER,
		"gmPluginInstalled": false,
		"profileSavePath": "",
	}
	player_profile = PlayerProgressModel.default_profile()
	_apply_auth_profile_metadata("预览猎人")
	_close_auth_panel(false)
	_refresh_gm_visibility()
	_open_account_panel()


func _run_auto_auth_check() -> void:
	await _auto_checks()._run_auto_auth_check()


func _run_auto_auth_server_client_check() -> void:
	await _auto_checks()._run_auto_auth_server_client_check()


func _run_auto_auth_server_live_check() -> void:
	await _auto_checks()._run_auto_auth_server_live_check()


func _run_auto_startup_login_check() -> void:
	await _auto_checks()._run_auto_startup_login_check()


func _run_auto_server_mail_live_check() -> void:
	await _auto_checks()._run_auto_server_mail_live_check()


func _run_auto_party_live_check() -> void:
	await _auto_checks()._run_auto_party_live_check()


func _run_auto_player_interaction_live_check() -> void:
	await _auto_checks()._run_auto_player_interaction_live_check()


func _run_auto_chat_live_check() -> void:
	await _auto_checks()._run_auto_chat_live_check()


func _run_auto_online_position_live_check() -> void:
	await _auto_checks()._run_auto_online_position_live_check()


func _live_check_username(prefix: String) -> String:
	var clean_prefix := prefix.to_lower().substr(0, mini(6, prefix.length()))
	var seed := "%s:%s:%d:%d:%d" % [clean_prefix, str(Time.get_unix_time_from_system()), OS.get_process_id(), Time.get_ticks_usec(), randi()]
	return ("%s%s" % [clean_prefix, seed.sha256_text().substr(0, 14)]).substr(0, 20)


func _run_auto_server_movement_live_check() -> void:
	await _auto_checks()._run_auto_server_movement_live_check()


func _run_auto_server_click_move_live_check() -> void:
	await _auto_checks()._run_auto_server_click_move_live_check()


func _run_auto_server_click_move_reject_live_check() -> void:
	await _auto_checks()._run_auto_server_click_move_reject_live_check()


func _run_auto_online_aoi_live_check() -> void:
	await _auto_checks()._run_auto_online_aoi_live_check()


func _run_auto_server_event_live_check() -> void:
	await _auto_checks()._run_auto_server_event_live_check()


func _run_auto_server_event_replay_live_check() -> void:
	await _auto_checks()._run_auto_server_event_replay_live_check()


func _run_auto_battle_room_live_check() -> void:
	await _auto_checks()._run_auto_battle_room_live_check()


func _auto_server_battle_duel_actor_ids(room: Dictionary, challenger_username: String, opponent_username: String) -> Dictionary:
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	var ids := {
		"challengerPlayer": "",
		"challengerPet": "",
		"opponentPlayer": "",
		"opponentPet": "",
	}
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var actor_id := str(actor.get("actorId", ""))
		if str(actor.get("username", "")) == challenger_username and str(actor.get("kind", "")) == "player":
			ids["challengerPlayer"] = actor_id
		elif str(actor.get("username", "")) == challenger_username and str(actor.get("kind", "")) == "pet":
			ids["challengerPet"] = actor_id
		elif str(actor.get("username", "")) == opponent_username and str(actor.get("kind", "")) == "player":
			ids["opponentPlayer"] = actor_id
		elif str(actor.get("username", "")) == opponent_username and str(actor.get("kind", "")) == "pet":
			ids["opponentPet"] = actor_id
	return ids


func _run_auto_server_battle_turn_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_turn_live_check()


func _run_auto_server_battle_reconnect_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_reconnect_live_check()


func _run_auto_server_battle_close_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_close_live_check()


func _run_auto_server_battle_return_check() -> void:
	await _auto_checks()._run_auto_server_battle_return_check()


func _run_auto_server_battle_leave_ui_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_leave_ui_live_check()


func _run_auto_server_battle_target_mapping_check() -> void:
	await _auto_checks()._run_auto_server_battle_target_mapping_check()


func _auto_fetch_server_profile_for_session(session: Dictionary) -> Dictionary:
	var response := await _auto_http_request_spec(ServerAuthClientModel.profile_request(
		ServerAuthClientModel.DEFAULT_BASE_URL,
		str(session.get("serverSessionToken", ""))
	))
	return ServerAuthClientModel.parse_profile_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)


func _auto_server_profile_pet_ids(profile_response: Dictionary) -> Dictionary:
	var profile := profile_response.get("profile", {}) as Dictionary if profile_response.get("profile", {}) is Dictionary else {}
	var active_pet_id := str(profile.get("activePetInstanceId", "")).strip_edges()
	var standby_pet_id := ""
	var pets: Array = profile.get("petInstances", []) if profile.get("petInstances", []) is Array else []
	for value in pets:
		if not (value is Dictionary):
			continue
		var pet := value as Dictionary
		var pet_id := str(pet.get("instanceId", pet.get("petId", pet.get("id", "")))).strip_edges()
		if pet_id == "":
			continue
		var state := str(pet.get("state", pet.get("status", pet.get("battleState", "")))).strip_edges()
		if active_pet_id == "" and state == BattleModel.PET_STATE_BATTLE:
			active_pet_id = pet_id
		if standby_pet_id == "" and state == BattleModel.PET_STATE_STANDBY:
			standby_pet_id = pet_id
	return {
		"activePetId": active_pet_id,
		"standbyPetId": standby_pet_id,
	}


func _auto_server_profile_has_battle_pet(profile_response: Dictionary) -> bool:
	var ids := _auto_server_profile_pet_ids(profile_response)
	return str(ids.get("activePetId", "")).strip_edges() != ""


func _auto_server_profile_learn_pet_skill(session: Dictionary, pet_id: String, skill_id: String, slot: int = 3) -> bool:
	if pet_id.strip_edges() == "" or skill_id.strip_edges() == "":
		return false
	var response := await _auto_http_request_spec(ServerAuthClientModel.profile_action_request(
		ServerAuthClientModel.DEFAULT_BASE_URL,
		str(session.get("serverSessionToken", "")),
		"pet_skill_set_slot",
		{
			"instanceId": pet_id,
			"skillId": skill_id,
			"slot": slot,
			"trainerId": "firebud_pet_skill_trainer",
		}
	))
	var parsed := ServerAuthClientModel.parse_profile_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	return bool(parsed.get("ok", false))


func _run_auto_server_solo_pve_live_check() -> void:
	await _auto_checks()._run_auto_server_solo_pve_live_check()


func _run_auto_server_party_pve_sync_live_check() -> void:
	await _auto_checks()._run_auto_server_party_pve_sync_live_check()


func _run_auto_server_battle_stale_room_check() -> void:
	await _auto_checks()._run_auto_server_battle_stale_room_check()


func _run_auto_server_battle_pet_snapshot_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_pet_snapshot_live_check()


func _run_auto_server_battle_pet_command_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_pet_command_live_check()


func _run_auto_server_battle_switch_pet_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_switch_pet_live_check()


func _run_auto_server_battle_item_live_check() -> void:
	await _auto_checks()._run_auto_server_battle_item_live_check()


func _online_remote_player_at(username: String, map_id: String, cell: Vector2i) -> bool:
	for value in online_position_remote_players:
		if not (value is Dictionary):
			continue
		var online_player := value as Dictionary
		if str(online_player.get("username", "")) != username:
			continue
		var position := online_player.get("position", {}) as Dictionary if online_player.get("position", {}) is Dictionary else {}
		if str(position.get("mapId", "")) != map_id:
			continue
		if int(position.get("cellX", 0)) == cell.x and int(position.get("cellY", 0)) == cell.y:
			return true
	return false


func _chat_message_text_seen(text: String) -> bool:
	for value in chat_messages:
		if value is Dictionary and str((value as Dictionary).get("text", "")) == text:
			return true
	return false


func _chat_message_list_contains(messages: Array, text: String) -> bool:
	for value in messages:
		if value is Dictionary and str((value as Dictionary).get("text", "")) == text:
			return true
	return false


func _auto_http_request_spec(spec: Dictionary) -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = 15.0
	add_child(request)
	var err := request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		request.queue_free()
		return {"ok": false, "result": -1, "error": err, "responseCode": 0, "body": PackedByteArray()}
	var completed = await request.request_completed
	request.queue_free()
	return {
		"ok": int(completed[0]) == HTTPRequest.RESULT_SUCCESS,
		"result": int(completed[0]),
		"responseCode": int(completed[1]),
		"headers": completed[2],
		"body": completed[3],
	}


func _run_auto_server_profile_sync_check() -> void:
	await _auto_checks()._run_auto_server_profile_sync_check()


func _restore_auth_check_account_store(existed: bool, text: String) -> void:
	var absolute_path := ProjectSettings.globalize_path(AccountAuthModel.ACCOUNT_STORE_PATH)
	if existed:
		var dir_path := AccountAuthModel.ACCOUNT_STORE_PATH.get_base_dir()
		if dir_path != "":
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
		var file := FileAccess.open(AccountAuthModel.ACCOUNT_STORE_PATH, FileAccess.WRITE)
		if file != null:
			file.store_string(text)
			file.close()
	else:
		if FileAccess.file_exists(AccountAuthModel.ACCOUNT_STORE_PATH):
			DirAccess.remove_absolute(absolute_path)


func _restore_auth_check_plugin(existed: bool, text: String) -> void:
	var absolute_path := ProjectSettings.globalize_path(AccountAuthModel.GM_PLUGIN_PATH)
	if existed:
		var file := FileAccess.open(AccountAuthModel.GM_PLUGIN_PATH, FileAccess.WRITE)
		if file != null:
			file.store_string(text)
			file.close()
	else:
		if FileAccess.file_exists(AccountAuthModel.GM_PLUGIN_PATH):
			DirAccess.remove_absolute(absolute_path)


func _restore_auth_check_audit_log(existed: bool, text: String) -> void:
	var absolute_path := ProjectSettings.globalize_path(GmToolRuntimeModel.AUDIT_PATH)
	if existed:
		var dir_path := GmToolRuntimeModel.AUDIT_PATH.get_base_dir()
		if dir_path != "":
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
		var file := FileAccess.open(GmToolRuntimeModel.AUDIT_PATH, FileAccess.WRITE)
		if file != null:
			file.store_string(text)
			file.close()
	else:
		if FileAccess.file_exists(GmToolRuntimeModel.AUDIT_PATH):
			DirAccess.remove_absolute(absolute_path)


func _run_auto_qa_panel_check() -> void:
	await _auto_checks()._run_auto_qa_panel_check()


func _run_auto_chat_panel_check() -> void:
	await _auto_checks()._run_auto_chat_panel_check()


func _run_auto_world_log_panel_check() -> void:
	await _auto_checks()._run_auto_world_log_panel_check()


func _quick_slot_test_profile(with_quick_slots: bool = true) -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var slots := PlayerProgressModel.backpack_slots(profile)
	slots = BackpackModel.set_item_count(slots, BattleModel.ITEM_MEAT_SMALL, 2)
	slots = BackpackModel.set_item_count(slots, "encounter_stone_high", 1)
	profile = PlayerProgressModel.with_backpack_slots(profile, slots)
	var instances: Array = profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) == "pet_bui_main":
			var max_hp := maxi(1, int(instance.get("maxHp", 100)))
			instance["hp"] = maxi(1, max_hp - 35)
			instances[index] = instance
			break
	profile["petInstances"] = instances
	if with_quick_slots:
		profile = PlayerProgressModel.with_quick_slot_item(profile, 0, BattleModel.ITEM_MEAT_SMALL)
		profile = PlayerProgressModel.with_quick_slot_item(profile, 1, "encounter_stone_high")
	return PlayerProgressModel.normalize_profile(profile)


func _move_player_to_encounter_cell(cell: Vector2i) -> void:
	if player == null or map_data.is_empty():
		return
	var target_cell := cell
	var zone := EncounterModel.zone_for_cell(map_data, target_cell)
	if zone.is_empty():
		for value in EncounterModel.encounter_zones(map_data):
			if value is Dictionary:
				var candidate := EncounterModel.first_walkable_cell(map_data, value as Dictionary)
				if IsoMapModel.is_inside(map_data, candidate):
					target_cell = candidate
					break
	player.global_position = IsoMapModel.grid_to_world(map_data, target_cell)
	player.clear_move_target()


func _run_auto_quick_slot_check() -> void:
	await _auto_checks()._run_auto_quick_slot_check()


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
	await _auto_checks()._run_auto_pet_capture_feedback_check()


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
	await _auto_checks()._run_auto_battle_status_check()


func _run_auto_battle_status_skill_check() -> void:
	await _auto_checks()._run_auto_battle_status_skill_check()


func _run_auto_battle_status_hit_check() -> void:
	await _auto_checks()._run_auto_battle_status_hit_check()


func _run_auto_battle_status_rule_check() -> void:
	await _auto_checks()._run_auto_battle_status_rule_check()


func _run_auto_battle_passive_hover_check() -> void:
	await _auto_checks()._run_auto_battle_passive_hover_check()


func _run_auto_pet_template_catalog_check() -> void:
	await _auto_checks()._run_auto_pet_template_catalog_check()


func _run_auto_pet_skill_training_check() -> void:
	await _auto_checks()._run_auto_pet_skill_training_check()


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
	pet_skill_selected_slot = 6
	_refresh_pet_skill_panel()
	await get_tree().create_timer(0.85).timeout
	if pet_skill_learn_option != null:
		for index in range(pet_skill_learn_option.get_item_count()):
			if str(pet_skill_learn_option.get_item_metadata(index)) == BattleModel.PET_SKILL_FOCUS_BITE:
				pet_skill_learn_option.select(index)
				break
	_on_pet_skill_learn_pressed()
	await get_tree().create_timer(0.75).timeout
	if _dialog_is_open() and str(active_dialog_interaction.get("actionType", "")) == DIALOG_ACTION_PET_SKILL_OVERWRITE:
		_confirm_dialog_action()
	await get_tree().create_timer(0.95).timeout
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
	await _auto_checks()._run_auto_battle_spirit_four_check()


func _run_auto_battle_item_check() -> void:
	await _auto_checks()._run_auto_battle_item_check()


func _run_auto_battle_item_count_check() -> void:
	await _auto_checks()._run_auto_battle_item_count_check()


func _run_auto_battle_stat_formula_check() -> void:
	await _auto_checks()._run_auto_battle_stat_formula_check()


func _run_auto_battle_defense_check() -> void:
	await _auto_checks()._run_auto_battle_defense_check()


func _run_auto_battle_launch_check() -> void:
	await _auto_checks()._run_auto_battle_launch_check()


func _run_auto_battle_melee_motion_check() -> void:
	await _auto_checks()._run_auto_battle_melee_motion_check()


func _run_auto_battle_combo_motion_check() -> void:
	await _auto_checks()._run_auto_battle_combo_motion_check()


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


func _battle_player_run_label() -> String:
	if _battle_is_server_authority() and not _current_server_battle_is_party_pve():
		return "离开"
	return "逃跑"


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
			"run": _battle_player_run_label(),
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
	if _battle_is_server_authority() and _sync_server_battle_command_owner_from_room():
		return
	if battle_auto_attack_delay > 0.0:
		battle_auto_attack_delay = maxf(0.0, battle_auto_attack_delay - _scaled_battle_delta(delta))
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
	if _battle_is_server_authority():
		if not _current_server_battle_is_party_pve():
			_set_battle_auto_attack_enabled(false, false)
			_set_battle_message("自动捉宠：切磋中不会自动离开，已停止自动战斗。")
			return
		_leave_server_battle_room()
		return
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
	if not _battle_item_supported_in_combat(item_id):
		return false
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
		labels[command_id] = _equipment_spirit_label_with_source(spirit_id)
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
	await _auto_checks()._run_auto_direct_line_check()


func _run_auto_facing_check() -> void:
	await _auto_checks()._run_auto_facing_check()


func _run_auto_eight_direction_check() -> void:
	await _auto_checks()._run_auto_eight_direction_check()


func _path_has_same_screen_y(path_cells: Array[Vector2i]) -> bool:
	if path_cells.is_empty():
		return false
	var first_y := IsoMapModel.grid_to_world(map_data, path_cells[0]).y
	for cell in path_cells:
		if absf(IsoMapModel.grid_to_world(map_data, cell).y - first_y) > 0.1:
			return false
	return true


func _process(delta: float) -> void:
	var frame_start := _perf_now()
	_update_runtime_frame_budget()
	_flush_profile_save_if_due(delta)
	if battle_active:
		var battle_start := _perf_now()
		_update_path_line_overlay()
		_update_battle_command_countdown(delta)
		_update_battle_animation(delta)
		_update_battle_auto_attack(delta)
		if _is_server_account_session() or server_event_state != "off":
			var server_event_start := _perf_now()
			_poll_server_event_stream(delta)
			_perf_add("server_event", server_event_start)
		var server_battle_poll_start := _perf_now()
		_update_server_battle_waiting_state_poll(delta)
		_perf_add("server_battle_poll", server_battle_poll_start)
		_update_hud_text()
		_update_battle_debug_window()
		queue_redraw()
		_perf_add("battle_process", battle_start)
		_perf_add("process_total", frame_start)
		_perf_report(delta)
		return
	var section_start := _perf_now()
	_update_pet_follow()
	_perf_add("pet_follow", section_start)
	section_start = _perf_now()
	_update_camera_position(false)
	_perf_add("camera", section_start)
	section_start = _perf_now()
	_update_pending_click_move(delta)
	_perf_add("click_move", section_start)
	section_start = _perf_now()
	_update_pending_interaction()
	_update_hang_heal_resume_route()
	_update_encounter_grace(delta)
	_update_hang_walk(delta)
	_update_stationary_encounter_stone(delta)
	_update_encounter_zone_check()
	_perf_add("encounter_move", section_start)
	section_start = _perf_now()
	_update_pet_rest_recovery(delta)
	_update_ground_pet_drop_expiration(delta)
	_perf_add("timed_profile", section_start)
	section_start = _perf_now()
	_poll_server_event_stream(delta)
	_perf_add("server_event", section_start)
	section_start = _perf_now()
	_update_server_battle_room_restore_poll(delta)
	_perf_add("server_battle_restore_poll", section_start)
	section_start = _perf_now()
	if has_target_marker and not player.is_auto_moving() and player.global_position.distance_to(target_marker) <= 6.0:
		has_target_marker = false
		has_target_cell = false
		current_path_is_direct = false
		current_path_cells.clear()
	_perf_add("hud_marker", section_start)
	section_start = _perf_now()
	_sync_hang_button_text()
	_perf_add("hud_button", section_start)
	section_start = _perf_now()
	_update_path_line_overlay()
	_perf_add("path_line", section_start)
	section_start = _perf_now()
	_update_world_hud_if_needed(delta)
	_perf_add("hud_update", section_start)
	section_start = _perf_now()
	_update_battle_debug_window()
	_perf_add("hud_debug", section_start)
	section_start = _perf_now()
	_queue_world_redraw_if_needed()
	_perf_add("redraw_check", section_start)
	_perf_add("process_total", frame_start)
	_perf_report(delta)


func _perf_now() -> int:
	return Time.get_ticks_usec() if perf_probe_enabled else 0


func _perf_add(label: String, start_usec: int) -> void:
	if not perf_probe_enabled:
		return
	var duration := Time.get_ticks_usec() - start_usec
	perf_probe_totals[label] = int(perf_probe_totals.get(label, 0)) + duration


func _perf_report(delta: float) -> void:
	if not perf_probe_enabled:
		return
	perf_probe_elapsed += delta
	perf_probe_frames += 1
	if perf_probe_elapsed < 1.0:
		return
	var parts: Array[String] = []
	var labels := perf_probe_totals.keys()
	labels.sort()
	for label in labels:
		parts.append("%s=%.2fms" % [str(label), float(perf_probe_totals[label]) / 1000.0 / maxf(1.0, float(perf_probe_frames))])
	print("perf probe: fps=%.1f frames=%d %s" % [
		float(perf_probe_frames) / maxf(0.001, perf_probe_elapsed),
		perf_probe_frames,
		" ".join(parts),
	])
	perf_probe_elapsed = 0.0
	perf_probe_frames = 0
	perf_probe_totals.clear()


func _request_profile_save(delay_seconds: float = 0.3) -> void:
	_mark_progress_ui_caches_dirty()
	if not profile_save_enabled:
		return
	profile_save_pending = true
	profile_save_debounce_remaining = maxf(profile_save_debounce_remaining, delay_seconds)


func _save_player_profile_now() -> bool:
	_mark_progress_ui_caches_dirty()
	return PlayerProgressModel.save_profile(player_profile)


func _mark_progress_ui_caches_dirty() -> void:
	world_draw_signature_cache = ""
	world_hud_signature_cache = ""
	hud_task_route_signature_cache = ""
	current_task_text_signature_cache = ""
	current_task_text_cache = ""
	task_tracker_cache_dirty = true
	task_tracker_source_signature_cache = ""
	task_tracker_text_cache = "当前没有任务"
	task_tracker_target_cache = {}
	task_tracker_has_target_cache = false
	quest_marker_cache_dirty = true
	quest_marker_source_signature_cache = ""
	quest_marker_signature_cache = ""
	quest_marker_state_cache.clear()


func _flush_profile_save_if_due(delta: float) -> void:
	if not profile_save_pending:
		return
	profile_save_debounce_remaining = maxf(0.0, profile_save_debounce_remaining - maxf(0.0, delta))
	if profile_save_debounce_remaining <= 0.0:
		_flush_profile_save_now()


func _flush_profile_save_now() -> bool:
	if not profile_save_pending:
		return false
	profile_save_pending = false
	profile_save_debounce_remaining = 0.0
	if not profile_save_enabled:
		return false
	if profile_save_dry_run:
		profile_save_debug_count += 1
		return true
	var saved := _save_player_profile_now()
	if saved:
		profile_save_debug_count += 1
	return saved


func _input(event: InputEvent) -> void:
	if not account_authenticated and not auth_auto_bypass:
		return
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if (mouse_event.button_index == MOUSE_BUTTON_LEFT or mouse_event.button_index == MOUSE_BUTTON_RIGHT) and mouse_event.pressed:
			if battle_active:
				_select_battle_target_at_screen_point(mouse_event.position)
				return
			var remote_player := _online_remote_player_at_screen_point(mouse_event.position)
			if not remote_player.is_empty():
				_open_player_action_panel(remote_player)
				return
			if mouse_event.button_index == MOUSE_BUTTON_RIGHT:
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
			var remote_player := _online_remote_player_at_screen_point(touch_event.position)
			if not remote_player.is_empty():
				_open_player_action_panel(remote_player)
				return
			_set_click_move_target(touch_event.position)


func _queue_world_redraw_if_needed() -> void:
	var signature := _world_draw_signature()
	var should_redraw := signature != world_draw_signature_cache
	if not should_redraw:
		return
	world_draw_signature_cache = signature
	queue_redraw()


func _world_draw_signature() -> String:
	var ground_drops = player_profile.get("groundPetDrops", [])
	var ground_drop_count := (ground_drops as Array).size() if ground_drops is Array else 0
	return "%s|%s|%s|%s|%d|%s|%d|%s|%s" % [
		current_map_id,
		str(has_target_marker),
		str(target_marker),
		str(current_path_is_direct),
		current_path_cells.size(),
		str(has_pending_interaction),
		ground_drop_count,
		_quest_marker_signature(),
		online_position_draw_signature_cache,
	]


func _update_world_hud_if_needed(delta: float, force: bool = false) -> void:
	world_hud_refresh_elapsed += delta
	var signature_start := _perf_now()
	var signature := _world_hud_signature()
	_perf_add("hud_signature", signature_start)
	if not force and signature == world_hud_signature_cache:
		return
	if not force and _world_needs_active_fps() and world_hud_refresh_elapsed < WORLD_HUD_REFRESH_INTERVAL_SECONDS:
		return
	world_hud_signature_cache = signature
	world_hud_refresh_elapsed = 0.0
	var apply_start := _perf_now()
	_update_hud_text(force)
	_perf_add("hud_apply", apply_start)


func _world_hud_signature() -> String:
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position) if player != null and not map_data.is_empty() else Vector2i.ZERO
	var partners = player_profile.get("trainingPartners", [])
	var partner_count := (partners as Array).size() if partners is Array else 0
	var party_other_count := _current_party_other_members_for_battle().size()
	return "%s|%s|%s|%s|%s|%s|%d,%d|%d|%d|%s|%s|%s" % [
		current_map_id,
		_movement_status_name(),
		str(battle_active),
		str(encounter_active),
		str(has_pending_interaction),
		str(has_target_cell),
		player_cell.x,
		player_cell.y,
		partner_count,
		party_other_count,
		_task_tracker_signature_for_hud(),
		str(_world_menu_is_open()),
		str(_dialog_is_open()),
	]


func _active_quest_signature() -> String:
	var active_quest_id := str(player_profile.get("activeQuestId", ""))
	var quest_states = player_profile.get("questStates", {})
	var quest_state: Dictionary = {}
	if quest_states is Dictionary:
		var value = (quest_states as Dictionary).get(active_quest_id, {})
		if value is Dictionary:
			quest_state = value
	var progress = quest_state.get("progress", {})
	var progress_signature := ""
	if progress is Dictionary:
		var progress_parts: Array[String] = []
		for key in (progress as Dictionary).keys():
			progress_parts.append("%s:%s" % [str(key), str((progress as Dictionary).get(key))])
		progress_parts.sort()
		progress_signature = ",".join(progress_parts)
	else:
		progress_signature = str(progress)
	return "%s:%s:%s|states:%s|tracker:%s" % [
		active_quest_id,
		str(quest_state.get("status", "")),
		progress_signature,
		_quest_states_light_signature(),
		_task_tracker_light_signature(),
	]


func _quest_states_light_signature() -> String:
	var quest_states = player_profile.get(PlayerProgressModel.QUEST_STATES_KEY, {})
	if not (quest_states is Dictionary):
		return ""
	var parts: Array[String] = []
	var keys := (quest_states as Dictionary).keys()
	keys.sort()
	for key in keys:
		var state_value = (quest_states as Dictionary).get(key, {})
		if state_value is Dictionary:
			var state := state_value as Dictionary
			parts.append("%s:%s:%s" % [
				str(key),
				str(state.get("status", "")),
				str(state.get("progress", "")),
			])
		else:
			parts.append("%s:%s" % [str(key), str(state_value)])
	return ",".join(parts)


func _task_tracker_light_signature() -> String:
	var target_count := maxi(0, int(player_profile.get(PlayerProgressModel.REBIRTH_COUNT_KEY, 0))) + 1
	var player := player_profile.get("player", {}) as Dictionary
	var parts: Array[String] = [
		str(target_count),
		"lv:%d" % maxi(1, int(player.get("level", 1))),
		"complete:%s" % str(_rebirth_quest_completed_for_target(player_profile, target_count)),
	]
	for ring_id in RebirthTrialModel.stage_required_ring_ids(target_count):
		parts.append("%s:%d" % [ring_id, _raw_backpack_item_count(ring_id)])
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target_count):
		parts.append("%s:%s" % [form_id, str(_profile_has_pet_form_raw(player_profile, form_id))])
	var proofs = player_profile.get(PlayerProgressModel.REBIRTH_TRIAL_PROOFS_KEY, {})
	var proof_count := int((proofs as Dictionary).get(PlayerProgressModel.REBIRTH_FINAL_BOSS_PROOF_ID, 0)) if proofs is Dictionary else 0
	parts.append("proof:%d" % maxi(0, proof_count))
	var abilities = player_profile.get(PlayerProgressModel.UNLOCKED_ABILITIES_KEY, [])
	parts.append("abilities:%d" % ((abilities as Array).size() if abilities is Array else 0))
	parts.append("mmGuide:%s" % PlayerProgressModel.pet_rebirth_mm_guide_signature(player_profile))
	return ";".join(parts)


func _raw_backpack_item_count(item_id: String) -> int:
	var slots = player_profile.get(PlayerProgressModel.BACKPACK_SLOTS_KEY, [])
	if not (slots is Array):
		return 0
	var total := 0
	for value in slots:
		if not (value is Dictionary):
			continue
		var slot := value as Dictionary
		if str(slot.get("itemId", "")) == item_id:
			total += maxi(0, int(slot.get("count", 0)))
	return total


func _profile_has_pet_form_raw(profile: Dictionary, form_id: String) -> bool:
	var instances = profile.get("petInstances", [])
	if not (instances is Array):
		return false
	for value in instances:
		if not (value is Dictionary):
			continue
		var instance := value as Dictionary
		if str(instance.get("formId", instance.get("templateId", ""))) == form_id:
			return true
	return false


func _quest_marker_signature() -> String:
	if quest_marker_cache_dirty or quest_marker_signature_cache == "":
		_refresh_quest_marker_cache_if_needed()
	return quest_marker_signature_cache


func _refresh_quest_marker_cache_if_needed(force: bool = false) -> void:
	if not force and not quest_marker_cache_dirty and quest_marker_signature_cache != "":
		return
	var source_signature := _quest_marker_source_signature()
	if not force and source_signature == quest_marker_source_signature_cache and quest_marker_signature_cache != "":
		quest_marker_cache_dirty = false
		return
	quest_marker_source_signature_cache = source_signature
	quest_marker_state_cache.clear()
	var available_quest := _first_available_unfinished_quest_for_marker()
	var blocked_quest := _first_blocked_unfinished_quest_for_marker()
	quest_marker_signature_cache = "%s|blocked:%s" % [
		source_signature,
		str(blocked_quest.get("id", "")),
	]
	var points: Array = map_data.get("interactionPoints", [])
	for point_value in points:
		if not (point_value is Dictionary):
			continue
		var item := point_value as Dictionary
		var item_id := str(item.get("id", ""))
		if item_id == "":
			continue
		quest_marker_state_cache[item_id] = _compute_quest_marker_state_for_item(item, available_quest, blocked_quest)
	quest_marker_cache_dirty = false


func _quest_marker_source_signature() -> String:
	var abilities = player_profile.get(PlayerProgressModel.UNLOCKED_ABILITIES_KEY, [])
	var ability_parts: Array[String] = []
	if abilities is Array:
		for ability in abilities:
			ability_parts.append(str(ability))
	ability_parts.sort()
	var quest_state_parts: Array[String] = []
	var quest_states = player_profile.get(PlayerProgressModel.QUEST_STATES_KEY, {})
	if quest_states is Dictionary:
		var quest_ids := (quest_states as Dictionary).keys()
		quest_ids.sort()
		for quest_id_value in quest_ids:
			var quest_id := str(quest_id_value)
			var raw_state = (quest_states as Dictionary).get(quest_id_value, {})
			if raw_state is Dictionary:
				var state := raw_state as Dictionary
				quest_state_parts.append("%s:%s:%s" % [
					quest_id,
					str(state.get("status", "")),
					str(state.get("progress", {})),
				])
			else:
				quest_state_parts.append("%s:%s" % [quest_id, str(raw_state)])
	return "%s|rebirth:%d|mm2:%d|mmGuide:%s|abilities:%s|states:%s|map:%s" % [
		_active_quest_signature(),
		maxi(0, int(player_profile.get(PlayerProgressModel.REBIRTH_COUNT_KEY, 0))),
		1 if bool(player_profile.get(PlayerProgressModel.PET_REBIRTH_MM_STAGE2_CLAIMED_KEY, false)) else 0,
		PlayerProgressModel.pet_rebirth_mm_guide_signature(player_profile),
		",".join(ability_parts),
		",".join(quest_state_parts),
		current_map_id,
	]


func _draw() -> void:
	var draw_start := _perf_now()
	var viewport_size := get_viewport_rect().size
	var background_rect := _world_background_rect(viewport_size)
	draw_rect(background_rect, Color(0.085, 0.13, 0.14), true)
	if battle_active:
		_draw_battle_scene()
		_perf_add("draw_battle", draw_start)
		return
	_draw_isometric_map()
	_draw_online_remote_players()
	if has_target_marker:
		_draw_target_marker(target_marker)
	_perf_add("draw_world", draw_start)


func _spawn_player() -> void:
	player = PLAYER_SCENE.instantiate()
	add_child(player)
	if map_data.is_empty():
		player.global_position = _layout_size() * 0.5
	else:
		player.global_position = IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data))
	player.set_movement_bounds(_player_movement_bounds())
	_sync_gm_speed_multiplier()


func _spawn_pet() -> void:
	pet = PET_SCENE.instantiate()
	add_child(pet)
	pet.visible = false
	pet.global_position = player.global_position + Vector2(-56, 36)
	_sync_gm_speed_multiplier()


func _build_path_line_overlay() -> void:
	path_line_node = Line2D.new()
	path_line_node.name = "PathLine"
	path_line_node.z_index = -1
	path_line_node.width = 3.0
	path_line_node.default_color = Color(1.0, 0.78, 0.24, 0.62)
	path_line_node.joint_mode = Line2D.LINE_JOINT_ROUND
	path_line_node.begin_cap_mode = Line2D.LINE_CAP_ROUND
	path_line_node.end_cap_mode = Line2D.LINE_CAP_ROUND
	path_line_node.visible = false
	add_child(path_line_node)


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

	battle_round_panel = _panel_container("BattleRoundPanel")
	battle_round_panel.visible = false
	battle_round_panel.z_index = 28
	battle_round_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	battle_round_panel.add_theme_stylebox_override("panel", _battle_indicator_panel_style())
	battle_round_label = Label.new()
	battle_round_label.name = "BattleRoundLabel"
	battle_round_label.text = "第 1 回合"
	battle_round_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	battle_round_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	battle_round_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	battle_round_label.add_theme_font_size_override("font_size", 17)
	battle_round_panel.add_child(battle_round_label)
	hud_root.add_child(battle_round_panel)

	battle_timer_panel = _panel_container("BattleTimerPanel")
	battle_timer_panel.visible = false
	battle_timer_panel.z_index = 28
	battle_timer_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	battle_timer_panel.add_theme_stylebox_override("panel", _battle_indicator_panel_style())
	battle_timer_label = Label.new()
	battle_timer_label.name = "BattleTimerLabel"
	battle_timer_label.text = "99秒"
	battle_timer_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	battle_timer_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	battle_timer_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	battle_timer_label.add_theme_font_size_override("font_size", 19)
	battle_timer_panel.add_child(battle_timer_label)
	hud_root.add_child(battle_timer_panel)

	side_panel = _panel_container("SidePanel")
	var side_column := VBoxContainer.new()
	side_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side_column.add_theme_constant_override("separation", 6)
	side_panel.add_child(side_column)
	detail_label = Label.new()
	detail_label.name = "DetailLabel"
	detail_label.add_theme_font_size_override("font_size", 17)
	detail_label.text = "伙伴  -  待加入\n任务  -  火芽营地\n阶段  -  初次移动"
	detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side_column.add_child(detail_label)
	task_route_button = Button.new()
	task_route_button.text = "寻路"
	task_route_button.custom_minimum_size = Vector2(0, 38)
	task_route_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	task_route_button.pressed.connect(_on_task_tracker_route_pressed)
	side_column.add_child(task_route_button)
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
	quick_slot_buttons.clear()
	for index in range(PlayerProgressModel.QUICK_SLOT_COUNT):
		var quick_button := Button.new()
		quick_button.custom_minimum_size = Vector2(72, MIN_TOUCH_BUTTON_SIZE.y)
		quick_button.add_theme_font_size_override("font_size", 13)
		var quick_index := index
		quick_button.pressed.connect(func() -> void:
			_on_quick_slot_pressed(quick_index)
		)
		action_row.add_child(quick_button)
		quick_slot_buttons.append(quick_button)
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
	pet_menu_button.pressed.connect(func() -> void:
		_open_pet_panel(false)
	)
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
	map_menu_button = Button.new()
	map_menu_button.text = "地图"
	map_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	map_menu_button.pressed.connect(_open_map_panel)
	action_row.add_child(map_menu_button)
	chat_menu_button = Button.new()
	chat_menu_button.text = "聊天"
	chat_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	chat_menu_button.pressed.connect(_open_chat_panel)
	action_row.add_child(chat_menu_button)
	party_menu_button = Button.new()
	party_menu_button.text = "队伍"
	party_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	party_menu_button.pressed.connect(_open_party_panel)
	action_row.add_child(party_menu_button)
	mailbox_menu_button = Button.new()
	mailbox_menu_button.text = "邮箱"
	mailbox_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	mailbox_menu_button.pressed.connect(_open_mailbox_panel)
	action_row.add_child(mailbox_menu_button)
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
	account_menu_button = Button.new()
	account_menu_button.text = "账号"
	account_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	account_menu_button.pressed.connect(_open_account_panel)
	action_row.add_child(account_menu_button)
	qa_menu_button = Button.new()
	qa_menu_button.text = "GM"
	qa_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	qa_menu_button.pressed.connect(_open_qa_panel)
	action_row.add_child(qa_menu_button)
	hud_root.add_child(action_bar)
	_build_auth_panel()
	_build_account_panel()

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

	player_status_rebirth_button = Button.new()
	player_status_rebirth_button.text = "转生预览"
	player_status_rebirth_button.custom_minimum_size = Vector2(0, 44)
	player_status_rebirth_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_rebirth_button.pressed.connect(_open_player_rebirth_preview_panel)
	player_status_column.add_child(player_status_rebirth_button)

	player_status_equipment_button = Button.new()
	player_status_equipment_button.text = "装备"
	player_status_equipment_button.custom_minimum_size = Vector2(0, 44)
	player_status_equipment_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_equipment_button.pressed.connect(_on_player_status_equipment_pressed)
	player_status_column.add_child(player_status_equipment_button)
	hud_root.add_child(player_status_panel)

	player_rebirth_preview_panel = _panel_container("PlayerRebirthPreviewPanel")
	player_rebirth_preview_panel.visible = false
	player_rebirth_preview_panel.z_index = 25
	var rebirth_preview_column := VBoxContainer.new()
	rebirth_preview_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebirth_preview_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rebirth_preview_column.add_theme_constant_override("separation", 8)
	player_rebirth_preview_panel.add_child(rebirth_preview_column)
	var rebirth_preview_header := HBoxContainer.new()
	rebirth_preview_header.add_theme_constant_override("separation", 10)
	rebirth_preview_column.add_child(rebirth_preview_header)
	var rebirth_preview_title := Label.new()
	rebirth_preview_title.text = "转生预览"
	rebirth_preview_title.add_theme_font_size_override("font_size", 21)
	rebirth_preview_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebirth_preview_header.add_child(rebirth_preview_title)
	player_rebirth_preview_close_button = Button.new()
	player_rebirth_preview_close_button.text = "关闭"
	player_rebirth_preview_close_button.custom_minimum_size = Vector2(92, 44)
	player_rebirth_preview_close_button.pressed.connect(_close_player_rebirth_preview_panel)
	rebirth_preview_header.add_child(player_rebirth_preview_close_button)
	var rebirth_preview_scroll := ScrollContainer.new()
	rebirth_preview_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebirth_preview_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rebirth_preview_column.add_child(rebirth_preview_scroll)
	player_rebirth_preview_label = RichTextLabel.new()
	player_rebirth_preview_label.bbcode_enabled = true
	player_rebirth_preview_label.fit_content = true
	player_rebirth_preview_label.scroll_active = false
	player_rebirth_preview_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	player_rebirth_preview_label.add_theme_font_size_override("font_size", 17)
	player_rebirth_preview_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebirth_preview_scroll.add_child(player_rebirth_preview_label)
	player_rebirth_execute_button = Button.new()
	player_rebirth_execute_button.text = "执行转生"
	player_rebirth_execute_button.custom_minimum_size = Vector2(0, 48)
	player_rebirth_execute_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_rebirth_execute_button.pressed.connect(_on_player_rebirth_execute_pressed)
	rebirth_preview_column.add_child(player_rebirth_execute_button)
	hud_root.add_child(player_rebirth_preview_panel)

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

	var backpack_filter_row := HBoxContainer.new()
	backpack_filter_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_filter_row.add_theme_constant_override("separation", 6)
	backpack_column.add_child(backpack_filter_row)
	backpack_filter_buttons.clear()
	for option in _backpack_filter_options():
		var filter_id := str(option.get("id", BACKPACK_FILTER_ALL))
		var filter_button := Button.new()
		filter_button.text = str(option.get("label", filter_id))
		filter_button.toggle_mode = true
		filter_button.custom_minimum_size = Vector2(0, 34)
		filter_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		filter_button.add_theme_font_size_override("font_size", 14)
		filter_button.pressed.connect(func() -> void:
			_set_backpack_filter(filter_id)
		)
		backpack_filter_row.add_child(filter_button)
		backpack_filter_buttons[filter_id] = filter_button

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
	backpack_equip_button = Button.new()
	backpack_equip_button.text = "装备"
	backpack_equip_button.visible = false
	backpack_equip_button.custom_minimum_size = Vector2(0, 40)
	backpack_equip_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_equip_button.pressed.connect(_on_backpack_equip_pressed)
	backpack_column.add_child(backpack_equip_button)
	backpack_quick_bind_row = HBoxContainer.new()
	backpack_quick_bind_row.visible = false
	backpack_quick_bind_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_quick_bind_row.add_theme_constant_override("separation", 8)
	backpack_column.add_child(backpack_quick_bind_row)
	backpack_quick_bind_buttons.clear()
	for index in range(PlayerProgressModel.QUICK_SLOT_COUNT):
		var quick_bind_button := Button.new()
		quick_bind_button.text = "快捷%d" % [index + 1]
		quick_bind_button.custom_minimum_size = Vector2(0, 40)
		quick_bind_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		quick_bind_button.add_theme_font_size_override("font_size", 15)
		var quick_bind_index := index
		quick_bind_button.pressed.connect(func() -> void:
			_on_backpack_quick_bind_pressed(quick_bind_index)
		)
		backpack_quick_bind_row.add_child(quick_bind_button)
		backpack_quick_bind_buttons.append(quick_bind_button)
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
	var equipment_action_row := HBoxContainer.new()
	equipment_action_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_action_row.add_theme_constant_override("separation", 8)
	equipment_column.add_child(equipment_action_row)
	equipment_unequip_button = Button.new()
	equipment_unequip_button.text = "卸下"
	equipment_unequip_button.visible = false
	equipment_unequip_button.custom_minimum_size = Vector2(0, 44)
	equipment_unequip_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_unequip_button.pressed.connect(_on_equipment_unequip_pressed)
	equipment_action_row.add_child(equipment_unequip_button)
	equipment_enhance_button = Button.new()
	equipment_enhance_button.text = "强化"
	equipment_enhance_button.visible = false
	equipment_enhance_button.custom_minimum_size = Vector2(0, 44)
	equipment_enhance_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_enhance_button.pressed.connect(_on_equipment_enhance_pressed)
	equipment_action_row.add_child(equipment_enhance_button)
	equipment_synthesis_open_button = Button.new()
	equipment_synthesis_open_button.text = "合成"
	equipment_synthesis_open_button.custom_minimum_size = Vector2(0, 44)
	equipment_synthesis_open_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_synthesis_open_button.pressed.connect(_open_equipment_synthesis_panel)
	equipment_action_row.add_child(equipment_synthesis_open_button)
	hud_root.add_child(equipment_panel)

	equipment_synthesis_panel = _panel_container("EquipmentSynthesisPanel")
	equipment_synthesis_panel.visible = false
	equipment_synthesis_panel.z_index = 24
	var synthesis_column := VBoxContainer.new()
	synthesis_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_column.add_theme_constant_override("separation", 8)
	equipment_synthesis_panel.add_child(synthesis_column)

	var synthesis_header := HBoxContainer.new()
	synthesis_header.add_theme_constant_override("separation", 10)
	synthesis_column.add_child(synthesis_header)
	var synthesis_title := Label.new()
	synthesis_title.text = "装备合成"
	synthesis_title.add_theme_font_size_override("font_size", 21)
	synthesis_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_header.add_child(synthesis_title)
	equipment_synthesis_close_button = Button.new()
	equipment_synthesis_close_button.text = "关闭"
	equipment_synthesis_close_button.custom_minimum_size = Vector2(92, 44)
	equipment_synthesis_close_button.pressed.connect(_close_equipment_synthesis_panel)
	synthesis_header.add_child(equipment_synthesis_close_button)

	var synthesis_body := HBoxContainer.new()
	synthesis_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_body.add_theme_constant_override("separation", 10)
	synthesis_column.add_child(synthesis_body)

	var synthesis_list_scroll := ScrollContainer.new()
	synthesis_list_scroll.custom_minimum_size = Vector2(236, 0)
	synthesis_list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_body.add_child(synthesis_list_scroll)
	equipment_synthesis_list_container = VBoxContainer.new()
	equipment_synthesis_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_synthesis_list_container.add_theme_constant_override("separation", 7)
	synthesis_list_scroll.add_child(equipment_synthesis_list_container)

	var synthesis_detail_column := VBoxContainer.new()
	synthesis_detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_detail_column.add_theme_constant_override("separation", 8)
	synthesis_body.add_child(synthesis_detail_column)
	var synthesis_detail_scroll := ScrollContainer.new()
	synthesis_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_detail_column.add_child(synthesis_detail_scroll)
	equipment_synthesis_detail_label = RichTextLabel.new()
	equipment_synthesis_detail_label.bbcode_enabled = true
	equipment_synthesis_detail_label.fit_content = true
	equipment_synthesis_detail_label.scroll_active = false
	equipment_synthesis_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	equipment_synthesis_detail_label.add_theme_font_size_override("font_size", 16)
	equipment_synthesis_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_detail_scroll.add_child(equipment_synthesis_detail_label)

	var synthesis_button_row := HBoxContainer.new()
	synthesis_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_button_row.add_theme_constant_override("separation", 8)
	synthesis_detail_column.add_child(synthesis_button_row)
	equipment_synthesis_back_button = Button.new()
	equipment_synthesis_back_button.text = "装备栏"
	equipment_synthesis_back_button.custom_minimum_size = Vector2(0, 46)
	equipment_synthesis_back_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_synthesis_back_button.pressed.connect(_open_equipment_panel)
	synthesis_button_row.add_child(equipment_synthesis_back_button)
	equipment_synthesis_action_button = Button.new()
	equipment_synthesis_action_button.text = "合成"
	equipment_synthesis_action_button.custom_minimum_size = Vector2(0, 46)
	equipment_synthesis_action_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_synthesis_action_button.pressed.connect(_on_equipment_synthesis_pressed)
	synthesis_button_row.add_child(equipment_synthesis_action_button)
	hud_root.add_child(equipment_synthesis_panel)

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

	shop_detail_label = RichTextLabel.new()
	shop_detail_label.bbcode_enabled = true
	shop_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	shop_detail_label.fit_content = false
	shop_detail_label.scroll_active = true
	shop_detail_label.custom_minimum_size = Vector2(0, 126)
	shop_detail_label.add_theme_font_size_override("font_size", 16)
	shop_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_column.add_child(shop_detail_label)
	shop_equip_after_buy_button = Button.new()
	shop_equip_after_buy_button.text = "购买后装备"
	shop_equip_after_buy_button.toggle_mode = true
	shop_equip_after_buy_button.visible = false
	shop_equip_after_buy_button.custom_minimum_size = Vector2(0, 40)
	shop_equip_after_buy_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_equip_after_buy_button.pressed.connect(_on_shop_equip_after_buy_pressed)
	shop_column.add_child(shop_equip_after_buy_button)
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
	pet_body.add_theme_constant_override("separation", 8)
	pet_column.add_child(pet_body)

	var pet_left_column := VBoxContainer.new()
	pet_left_column.custom_minimum_size = Vector2(220, 0)
	pet_left_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_left_column.add_theme_constant_override("separation", 6)
	pet_body.add_child(pet_left_column)
	var pet_manage_row := HBoxContainer.new()
	pet_manage_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_manage_row.add_theme_constant_override("separation", 6)
	pet_left_column.add_child(pet_manage_row)
	pet_filter_option = _pet_management_option(_pet_filter_options(), pet_filter_mode)
	pet_filter_option.custom_minimum_size = Vector2(0, 36)
	pet_filter_option.item_selected.connect(func(index: int) -> void:
		pet_filter_mode = str(pet_filter_option.get_item_metadata(index))
		pet_clear_confirm_instance_id = ""
		_refresh_pet_panel()
	)
	pet_manage_row.add_child(pet_filter_option)
	pet_sort_option = _pet_management_option(_pet_sort_options(), pet_sort_mode)
	pet_sort_option.custom_minimum_size = Vector2(0, 36)
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
	pet_sort_direction_button.custom_minimum_size = Vector2(40, 36)
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
	pet_detail_column.add_theme_constant_override("separation", 6)
	pet_body.add_child(pet_detail_column)
	var pet_detail_mode_row := HBoxContainer.new()
	pet_detail_mode_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_mode_row.add_theme_constant_override("separation", 8)
	pet_detail_column.add_child(pet_detail_mode_row)
	pet_detail_instance_button = Button.new()
	pet_detail_instance_button.text = "个体"
	pet_detail_instance_button.toggle_mode = true
	pet_detail_instance_button.button_pressed = true
	pet_detail_instance_button.custom_minimum_size = Vector2(0, 36)
	pet_detail_instance_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_instance_button.pressed.connect(func() -> void:
		_set_pet_detail_mode(PET_DETAIL_MODE_INSTANCE)
	)
	pet_detail_mode_row.add_child(pet_detail_instance_button)
	pet_detail_codex_button = Button.new()
	pet_detail_codex_button.text = "图鉴"
	pet_detail_codex_button.toggle_mode = true
	pet_detail_codex_button.custom_minimum_size = Vector2(0, 36)
	pet_detail_codex_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_codex_button.pressed.connect(func() -> void:
		_set_pet_detail_mode(PET_DETAIL_MODE_CODEX)
	)
	pet_detail_mode_row.add_child(pet_detail_codex_button)
	pet_detail_growth_button = Button.new()
	pet_detail_growth_button.text = "成长"
	pet_detail_growth_button.toggle_mode = true
	pet_detail_growth_button.custom_minimum_size = Vector2(0, 36)
	pet_detail_growth_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_growth_button.pressed.connect(func() -> void:
		_set_pet_detail_mode(PET_DETAIL_MODE_GROWTH)
	)
	pet_detail_mode_row.add_child(pet_detail_growth_button)
	pet_detail_scroll = ScrollContainer.new()
	pet_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_detail_column.add_child(pet_detail_scroll)
	var pet_detail_content := VBoxContainer.new()
	pet_detail_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_content.add_theme_constant_override("separation", 6)
	pet_detail_scroll.add_child(pet_detail_content)
	pet_growth_stage_row = HBoxContainer.new()
	pet_growth_stage_row.visible = false
	pet_growth_stage_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_growth_stage_row.add_theme_constant_override("separation", 6)
	pet_detail_content.add_child(pet_growth_stage_row)
	for stage in [0, 1, 2]:
		var stage_button := Button.new()
		var stage_index := int(stage)
		stage_button.text = "%d转成长" % stage_index
		stage_button.toggle_mode = true
		stage_button.custom_minimum_size = Vector2(0, 30)
		stage_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stage_button.pressed.connect(func() -> void:
			_set_pet_growth_stage(stage_index)
		)
		pet_growth_stage_row.add_child(stage_button)
		pet_growth_stage_buttons[stage_index] = stage_button
	pet_growth_table_grid = GridContainer.new()
	pet_growth_table_grid.columns = 6
	pet_growth_table_grid.visible = false
	pet_growth_table_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_growth_table_grid.add_theme_constant_override("h_separation", 5)
	pet_growth_table_grid.add_theme_constant_override("v_separation", 5)
	pet_detail_content.add_child(pet_growth_table_grid)
	pet_growth_radar = PetGrowthRadarControl.new()
	pet_growth_radar.visible = false
	pet_growth_radar.custom_minimum_size = Vector2(0, 150)
	pet_growth_radar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_content.add_child(pet_growth_radar)
	pet_detail_label = Label.new()
	pet_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pet_detail_label.add_theme_font_size_override("font_size", 14)
	pet_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	pet_detail_content.add_child(pet_detail_label)
	var pet_manage_action_row := HBoxContainer.new()
	pet_manage_action_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_manage_action_row.add_theme_constant_override("separation", 8)
	pet_detail_column.add_child(pet_manage_action_row)
	pet_party_up_button = Button.new()
	pet_party_up_button.text = "上移"
	pet_party_up_button.custom_minimum_size = Vector2(0, 38)
	pet_party_up_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_party_up_button.pressed.connect(func() -> void:
		_on_pet_party_move_pressed(-1)
	)
	pet_manage_action_row.add_child(pet_party_up_button)
	pet_party_down_button = Button.new()
	pet_party_down_button.text = "下移"
	pet_party_down_button.custom_minimum_size = Vector2(0, 38)
	pet_party_down_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_party_down_button.pressed.connect(func() -> void:
		_on_pet_party_move_pressed(1)
	)
	pet_manage_action_row.add_child(pet_party_down_button)
	pet_lock_button = Button.new()
	pet_lock_button.text = "锁定"
	pet_lock_button.custom_minimum_size = Vector2(0, 38)
	pet_lock_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_lock_button.pressed.connect(_on_pet_lock_pressed)
	pet_manage_action_row.add_child(pet_lock_button)
	pet_batch_store_button = Button.new()
	pet_batch_store_button.text = "批存"
	pet_batch_store_button.custom_minimum_size = Vector2(0, 38)
	pet_batch_store_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_batch_store_button.pressed.connect(_on_pet_batch_store_pressed)
	pet_manage_action_row.add_child(pet_batch_store_button)
	pet_batch_standby_button = Button.new()
	pet_batch_standby_button.text = "批待"
	pet_batch_standby_button.custom_minimum_size = Vector2(0, 38)
	pet_batch_standby_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_batch_standby_button.pressed.connect(func() -> void:
		_on_pet_batch_state_pressed(PlayerProgressModel.PET_STATE_STANDBY)
	)
	pet_manage_action_row.add_child(pet_batch_standby_button)
	pet_batch_rest_button = Button.new()
	pet_batch_rest_button.text = "批休"
	pet_batch_rest_button.custom_minimum_size = Vector2(0, 38)
	pet_batch_rest_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_batch_rest_button.pressed.connect(func() -> void:
		_on_pet_batch_state_pressed(PlayerProgressModel.PET_STATE_REST)
	)
	pet_manage_action_row.add_child(pet_batch_rest_button)
	var pet_button_row := HBoxContainer.new()
	pet_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_button_row.add_theme_constant_override("separation", 8)
	pet_detail_column.add_child(pet_button_row)
	pet_state_cycle_button = Button.new()
	pet_state_cycle_button.text = "休息"
	pet_state_cycle_button.custom_minimum_size = Vector2(0, 42)
	pet_state_cycle_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_state_cycle_button.pressed.connect(_on_pet_state_cycle_pressed)
	pet_button_row.add_child(pet_state_cycle_button)
	pet_stable_button = Button.new()
	pet_stable_button.text = "存入"
	pet_stable_button.custom_minimum_size = Vector2(0, 42)
	pet_stable_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_stable_button.pressed.connect(_on_pet_stable_pressed)
	pet_button_row.add_child(pet_stable_button)
	pet_rename_button = Button.new()
	pet_rename_button.text = "改名"
	pet_rename_button.custom_minimum_size = Vector2(0, 42)
	pet_rename_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_rename_button.pressed.connect(_on_pet_rename_pressed)
	pet_button_row.add_child(pet_rename_button)
	pet_skill_button = Button.new()
	pet_skill_button.text = "宠技"
	pet_skill_button.custom_minimum_size = Vector2(0, 42)
	pet_skill_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_button.pressed.connect(func() -> void:
		_open_pet_skill_panel(false)
	)
	pet_button_row.add_child(pet_skill_button)
	pet_cultivation_button = Button.new()
	pet_cultivation_button.text = "转强"
	pet_cultivation_button.custom_minimum_size = Vector2(0, 42)
	pet_cultivation_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_cultivation_button.pressed.connect(_on_pet_cultivation_pressed)
	pet_button_row.add_child(pet_cultivation_button)
	pet_drop_button = Button.new()
	pet_drop_button.text = "丢弃"
	pet_drop_button.custom_minimum_size = Vector2(0, 42)
	pet_drop_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_drop_button.pressed.connect(_on_pet_drop_pressed)
	pet_button_row.add_child(pet_drop_button)
	hud_root.add_child(pet_panel)
	_create_pet_skill_panel()
	_create_pet_cultivation_panel()

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

	quest_reward_choice_option = OptionButton.new()
	quest_reward_choice_option.visible = false
	quest_reward_choice_option.custom_minimum_size = Vector2(0, 44)
	quest_reward_choice_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_reward_choice_option.item_selected.connect(_on_quest_reward_choice_selected)
	quest_column.add_child(quest_reward_choice_option)

	quest_claim_button = Button.new()
	quest_claim_button.text = "领取奖励"
	quest_claim_button.visible = false
	quest_claim_button.custom_minimum_size = Vector2(0, 48)
	quest_claim_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_claim_button.pressed.connect(_on_quest_claim_pressed)
	quest_column.add_child(quest_claim_button)

	quest_route_button = Button.new()
	quest_route_button.text = "自动寻路"
	quest_route_button.custom_minimum_size = Vector2(0, 48)
	quest_route_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_route_button.pressed.connect(_on_quest_route_pressed)
	quest_column.add_child(quest_route_button)
	hud_root.add_child(quest_panel)

	map_panel = _panel_container("MapPanel")
	map_panel.visible = false
	map_panel.z_index = 24
	var map_column := VBoxContainer.new()
	map_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_column.add_theme_constant_override("separation", 8)
	map_panel.add_child(map_column)

	var map_header := HBoxContainer.new()
	map_header.add_theme_constant_override("separation", 10)
	map_column.add_child(map_header)
	var map_title_label := Label.new()
	map_title_label.text = "地图"
	map_title_label.add_theme_font_size_override("font_size", 21)
	map_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_header.add_child(map_title_label)
	map_close_button = Button.new()
	map_close_button.text = "关闭"
	map_close_button.custom_minimum_size = Vector2(92, 44)
	map_close_button.pressed.connect(_close_map_panel)
	map_header.add_child(map_close_button)

	map_texture_rect = TextureRect.new()
	map_texture_rect.custom_minimum_size = Vector2(0, 210)
	map_texture_rect.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	map_column.add_child(map_texture_rect)

	map_detail_label = Label.new()
	map_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	map_detail_label.add_theme_font_size_override("font_size", 15)
	map_detail_label.custom_minimum_size = Vector2(0, 58)
	map_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_column.add_child(map_detail_label)

	var map_marker_scroll := ScrollContainer.new()
	map_marker_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_marker_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_column.add_child(map_marker_scroll)
	map_marker_container = VBoxContainer.new()
	map_marker_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_marker_container.add_theme_constant_override("separation", 7)
	map_marker_scroll.add_child(map_marker_container)
	hud_root.add_child(map_panel)

	chat_panel = _panel_container("ChatPanel")
	chat_panel.visible = false
	chat_panel.z_index = 24
	var chat_column := VBoxContainer.new()
	chat_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_column.add_theme_constant_override("separation", 8)
	chat_panel.add_child(chat_column)

	var chat_header := HBoxContainer.new()
	chat_header.add_theme_constant_override("separation", 10)
	chat_column.add_child(chat_header)
	var chat_title_label := Label.new()
	chat_title_label.text = "聊天"
	chat_title_label.add_theme_font_size_override("font_size", 21)
	chat_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_header.add_child(chat_title_label)
	chat_refresh_button = Button.new()
	chat_refresh_button.text = "刷新"
	chat_refresh_button.custom_minimum_size = Vector2(80, 44)
	chat_refresh_button.pressed.connect(_request_chat_messages)
	chat_header.add_child(chat_refresh_button)
	chat_close_button = Button.new()
	chat_close_button.text = "关闭"
	chat_close_button.custom_minimum_size = Vector2(92, 44)
	chat_close_button.pressed.connect(_close_chat_panel)
	chat_header.add_child(chat_close_button)

	var chat_tab_row := HBoxContainer.new()
	chat_tab_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_tab_row.add_theme_constant_override("separation", 8)
	chat_column.add_child(chat_tab_row)
	chat_system_button = _chat_channel_button("系统", CHAT_CHANNEL_SYSTEM)
	chat_tab_row.add_child(chat_system_button)
	chat_nearby_button = _chat_channel_button("附近", CHAT_CHANNEL_NEARBY)
	chat_tab_row.add_child(chat_nearby_button)
	chat_team_button = _chat_channel_button("队伍", CHAT_CHANNEL_TEAM)
	chat_tab_row.add_child(chat_team_button)
	chat_status_label = Label.new()
	chat_status_label.text = ""
	chat_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	chat_status_label.add_theme_font_size_override("font_size", 14)
	chat_status_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	chat_status_label.custom_minimum_size = Vector2(0, 28)
	chat_column.add_child(chat_status_label)

	var chat_scroll := ScrollContainer.new()
	chat_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_column.add_child(chat_scroll)
	chat_log_label = RichTextLabel.new()
	chat_log_label.bbcode_enabled = false
	chat_log_label.fit_content = true
	chat_log_label.scroll_active = false
	chat_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	chat_log_label.add_theme_font_size_override("font_size", 16)
	chat_log_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_scroll.add_child(chat_log_label)

	var chat_input_row := HBoxContainer.new()
	chat_input_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_input_row.add_theme_constant_override("separation", 8)
	chat_column.add_child(chat_input_row)
	chat_input = LineEdit.new()
	chat_input.placeholder_text = "输入消息"
	chat_input.max_length = 80
	chat_input.custom_minimum_size = Vector2(0, 44)
	chat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_input.text_submitted.connect(func(_text: String) -> void:
		_on_chat_send_pressed()
	)
	chat_input_row.add_child(chat_input)
	chat_send_button = Button.new()
	chat_send_button.text = "发送"
	chat_send_button.custom_minimum_size = Vector2(92, 44)
	chat_send_button.pressed.connect(_on_chat_send_pressed)
	chat_input_row.add_child(chat_send_button)
	chat_http_request = HTTPRequest.new()
	chat_http_request.timeout = 8.0
	chat_http_request.request_completed.connect(_on_chat_http_request_completed)
	chat_panel.add_child(chat_http_request)
	hud_root.add_child(chat_panel)

	party_panel = _panel_container("PartyPanel")
	party_panel.visible = false
	party_panel.z_index = 24
	var party_column := VBoxContainer.new()
	party_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	party_column.add_theme_constant_override("separation", 8)
	party_panel.add_child(party_column)

	var party_header := HBoxContainer.new()
	party_header.add_theme_constant_override("separation", 10)
	party_column.add_child(party_header)
	var party_title_label := Label.new()
	party_title_label.text = "队伍"
	party_title_label.add_theme_font_size_override("font_size", 21)
	party_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_header.add_child(party_title_label)
	party_refresh_button = Button.new()
	party_refresh_button.text = "刷新"
	party_refresh_button.custom_minimum_size = Vector2(80, 44)
	party_refresh_button.pressed.connect(_request_party_state)
	party_header.add_child(party_refresh_button)
	party_leave_button = Button.new()
	party_leave_button.text = "离队"
	party_leave_button.custom_minimum_size = Vector2(80, 44)
	party_leave_button.pressed.connect(_on_party_leave_pressed)
	party_header.add_child(party_leave_button)
	party_close_button = Button.new()
	party_close_button.text = "关闭"
	party_close_button.custom_minimum_size = Vector2(92, 44)
	party_close_button.pressed.connect(_close_party_panel)
	party_header.add_child(party_close_button)

	party_status_label = Label.new()
	party_status_label.text = ""
	party_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	party_status_label.add_theme_font_size_override("font_size", 15)
	party_status_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	party_status_label.custom_minimum_size = Vector2(0, 30)
	party_column.add_child(party_status_label)

	var party_scroll := ScrollContainer.new()
	party_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	party_column.add_child(party_scroll)
	var party_content := VBoxContainer.new()
	party_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_content.add_theme_constant_override("separation", 10)
	party_scroll.add_child(party_content)

	var party_members_title := Label.new()
	party_members_title.text = "成员"
	party_members_title.add_theme_font_size_override("font_size", 17)
	party_content.add_child(party_members_title)
	party_members_container = VBoxContainer.new()
	party_members_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_members_container.add_theme_constant_override("separation", 7)
	party_content.add_child(party_members_container)

	var party_invites_title := Label.new()
	party_invites_title.text = "邀请"
	party_invites_title.add_theme_font_size_override("font_size", 17)
	party_content.add_child(party_invites_title)
	party_invites_container = VBoxContainer.new()
	party_invites_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_invites_container.add_theme_constant_override("separation", 7)
	party_content.add_child(party_invites_container)

	var party_online_title := Label.new()
	party_online_title.text = "在线玩家"
	party_online_title.add_theme_font_size_override("font_size", 17)
	party_content.add_child(party_online_title)
	party_online_container = VBoxContainer.new()
	party_online_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_online_container.add_theme_constant_override("separation", 7)
	party_content.add_child(party_online_container)

	party_http_request = HTTPRequest.new()
	party_http_request.timeout = 8.0
	party_http_request.request_completed.connect(_on_party_http_request_completed)
	party_panel.add_child(party_http_request)
	hud_root.add_child(party_panel)

	player_action_panel = _panel_container("PlayerActionPanel")
	player_action_panel.visible = false
	player_action_panel.z_index = 26
	var player_action_column := VBoxContainer.new()
	player_action_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_column.add_theme_constant_override("separation", 8)
	player_action_panel.add_child(player_action_column)
	var player_action_header := HBoxContainer.new()
	player_action_header.add_theme_constant_override("separation", 8)
	player_action_column.add_child(player_action_header)
	player_action_title_label = Label.new()
	player_action_title_label.text = "玩家互动"
	player_action_title_label.add_theme_font_size_override("font_size", 20)
	player_action_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_header.add_child(player_action_title_label)
	player_action_close_button = Button.new()
	player_action_close_button.text = "关闭"
	player_action_close_button.custom_minimum_size = Vector2(82, 40)
	player_action_close_button.pressed.connect(_close_player_action_panel)
	player_action_header.add_child(player_action_close_button)
	player_action_detail_label = Label.new()
	player_action_detail_label.text = ""
	player_action_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	player_action_detail_label.add_theme_font_size_override("font_size", 15)
	player_action_detail_label.custom_minimum_size = Vector2(0, 42)
	player_action_column.add_child(player_action_detail_label)
	player_action_battle_button = Button.new()
	player_action_battle_button.text = "发起切磋"
	player_action_battle_button.custom_minimum_size = Vector2(0, 46)
	player_action_battle_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_battle_button.pressed.connect(_on_player_action_battle_pressed)
	player_action_column.add_child(player_action_battle_button)
	player_action_record_button = Button.new()
	player_action_record_button.text = "查询战绩"
	player_action_record_button.custom_minimum_size = Vector2(0, 46)
	player_action_record_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_record_button.pressed.connect(_on_player_action_record_pressed)
	player_action_column.add_child(player_action_record_button)
	player_action_party_apply_button = Button.new()
	player_action_party_apply_button.text = "加入队伍"
	player_action_party_apply_button.custom_minimum_size = Vector2(0, 46)
	player_action_party_apply_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_party_apply_button.pressed.connect(_on_player_action_party_apply_pressed)
	player_action_column.add_child(player_action_party_apply_button)
	player_action_party_invite_button = Button.new()
	player_action_party_invite_button.text = "邀请入队"
	player_action_party_invite_button.custom_minimum_size = Vector2(0, 46)
	player_action_party_invite_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_party_invite_button.pressed.connect(_on_player_action_party_invite_pressed)
	player_action_column.add_child(player_action_party_invite_button)
	player_action_status_label = Label.new()
	player_action_status_label.text = ""
	player_action_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	player_action_status_label.add_theme_font_size_override("font_size", 14)
	player_action_status_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	player_action_status_label.custom_minimum_size = Vector2(0, 32)
	player_action_column.add_child(player_action_status_label)
	player_action_http_request = HTTPRequest.new()
	player_action_http_request.timeout = 8.0
	player_action_http_request.request_completed.connect(_on_player_action_http_request_completed)
	player_action_panel.add_child(player_action_http_request)
	hud_root.add_child(player_action_panel)

	battle_result_panel = _panel_container("BattleResultPanel")
	battle_result_panel.visible = false
	battle_result_panel.z_index = 31
	var battle_result_column := VBoxContainer.new()
	battle_result_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_result_column.add_theme_constant_override("separation", 10)
	battle_result_panel.add_child(battle_result_column)
	battle_result_title_label = Label.new()
	battle_result_title_label.text = "切磋结算"
	battle_result_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	battle_result_title_label.add_theme_font_size_override("font_size", 22)
	battle_result_column.add_child(battle_result_title_label)
	battle_result_detail_label = Label.new()
	battle_result_detail_label.text = ""
	battle_result_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	battle_result_detail_label.add_theme_font_size_override("font_size", 16)
	battle_result_detail_label.custom_minimum_size = Vector2(0, 74)
	battle_result_column.add_child(battle_result_detail_label)
	battle_result_close_button = Button.new()
	battle_result_close_button.text = "确定"
	battle_result_close_button.custom_minimum_size = Vector2(0, 46)
	battle_result_close_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_result_close_button.pressed.connect(_close_battle_result_panel)
	battle_result_column.add_child(battle_result_close_button)
	hud_root.add_child(battle_result_panel)

	battle_invite_panel = _panel_container("BattleInvitePanel")
	battle_invite_panel.visible = false
	battle_invite_panel.z_index = 27
	var battle_invite_column := VBoxContainer.new()
	battle_invite_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_invite_column.add_theme_constant_override("separation", 8)
	battle_invite_panel.add_child(battle_invite_column)
	battle_invite_title_label = Label.new()
	battle_invite_title_label.text = "切磋邀请"
	battle_invite_title_label.add_theme_font_size_override("font_size", 20)
	battle_invite_column.add_child(battle_invite_title_label)
	battle_invite_detail_label = Label.new()
	battle_invite_detail_label.text = ""
	battle_invite_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	battle_invite_detail_label.add_theme_font_size_override("font_size", 15)
	battle_invite_detail_label.custom_minimum_size = Vector2(0, 42)
	battle_invite_column.add_child(battle_invite_detail_label)
	var battle_invite_button_row := HBoxContainer.new()
	battle_invite_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_invite_button_row.add_theme_constant_override("separation", 8)
	battle_invite_column.add_child(battle_invite_button_row)
	battle_invite_accept_button = Button.new()
	battle_invite_accept_button.text = "接受"
	battle_invite_accept_button.custom_minimum_size = Vector2(92, 44)
	battle_invite_accept_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_invite_accept_button.pressed.connect(_on_battle_invite_accept_pressed)
	battle_invite_button_row.add_child(battle_invite_accept_button)
	battle_invite_decline_button = Button.new()
	battle_invite_decline_button.text = "拒绝"
	battle_invite_decline_button.custom_minimum_size = Vector2(92, 44)
	battle_invite_decline_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_invite_decline_button.pressed.connect(_on_battle_invite_decline_pressed)
	battle_invite_button_row.add_child(battle_invite_decline_button)
	battle_invite_close_button = Button.new()
	battle_invite_close_button.text = "稍后"
	battle_invite_close_button.custom_minimum_size = Vector2(92, 44)
	battle_invite_close_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_invite_close_button.pressed.connect(_close_battle_invite_panel)
	battle_invite_button_row.add_child(battle_invite_close_button)
	battle_invite_status_label = Label.new()
	battle_invite_status_label.text = ""
	battle_invite_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	battle_invite_status_label.add_theme_font_size_override("font_size", 14)
	battle_invite_status_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	battle_invite_status_label.custom_minimum_size = Vector2(0, 30)
	battle_invite_column.add_child(battle_invite_status_label)
	battle_invite_http_request = HTTPRequest.new()
	battle_invite_http_request.timeout = 8.0
	battle_invite_http_request.request_completed.connect(_on_battle_invite_http_request_completed)
	battle_invite_panel.add_child(battle_invite_http_request)
	hud_root.add_child(battle_invite_panel)

	mailbox_panel = _panel_container("MailboxPanel")
	mailbox_panel.visible = false
	mailbox_panel.z_index = 24
	var mailbox_column := VBoxContainer.new()
	mailbox_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_column.add_theme_constant_override("separation", 8)
	mailbox_panel.add_child(mailbox_column)

	var mailbox_header := HBoxContainer.new()
	mailbox_header.add_theme_constant_override("separation", 10)
	mailbox_column.add_child(mailbox_header)
	var mailbox_title_label := Label.new()
	mailbox_title_label.text = "邮箱"
	mailbox_title_label.add_theme_font_size_override("font_size", 21)
	mailbox_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_header.add_child(mailbox_title_label)
	mailbox_refresh_button = Button.new()
	mailbox_refresh_button.text = "刷新"
	mailbox_refresh_button.custom_minimum_size = Vector2(80, 44)
	mailbox_refresh_button.pressed.connect(_request_server_mailbox_inbox)
	mailbox_header.add_child(mailbox_refresh_button)
	mailbox_close_button = Button.new()
	mailbox_close_button.text = "关闭"
	mailbox_close_button.custom_minimum_size = Vector2(92, 44)
	mailbox_close_button.pressed.connect(_close_mailbox_panel)
	mailbox_header.add_child(mailbox_close_button)

	var mailbox_body := HBoxContainer.new()
	mailbox_body.add_theme_constant_override("separation", 10)
	mailbox_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_column.add_child(mailbox_body)

	var mailbox_list_scroll := ScrollContainer.new()
	mailbox_list_scroll.custom_minimum_size = Vector2(230, 0)
	mailbox_list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_body.add_child(mailbox_list_scroll)
	mailbox_list_container = VBoxContainer.new()
	mailbox_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_list_container.add_theme_constant_override("separation", 7)
	mailbox_list_scroll.add_child(mailbox_list_container)

	var mailbox_detail_column := VBoxContainer.new()
	mailbox_detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.add_theme_constant_override("separation", 8)
	mailbox_body.add_child(mailbox_detail_column)
	var mailbox_detail_scroll := ScrollContainer.new()
	mailbox_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.add_child(mailbox_detail_scroll)
	mailbox_detail_label = RichTextLabel.new()
	mailbox_detail_label.bbcode_enabled = false
	mailbox_detail_label.fit_content = true
	mailbox_detail_label.scroll_active = false
	mailbox_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mailbox_detail_label.add_theme_font_size_override("font_size", 16)
	mailbox_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_detail_scroll.add_child(mailbox_detail_label)
	mailbox_claim_button = Button.new()
	mailbox_claim_button.text = "领取附件"
	mailbox_claim_button.custom_minimum_size = Vector2(0, 48)
	mailbox_claim_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_claim_button.pressed.connect(_on_mailbox_claim_pressed)
	mailbox_detail_column.add_child(mailbox_claim_button)

	var mailbox_compose_title := Label.new()
	mailbox_compose_title.text = "写信"
	mailbox_compose_title.add_theme_font_size_override("font_size", 17)
	mailbox_detail_column.add_child(mailbox_compose_title)
	mailbox_recipient_input = LineEdit.new()
	mailbox_recipient_input.placeholder_text = "收件账号"
	mailbox_recipient_input.max_length = 20
	mailbox_recipient_input.custom_minimum_size = Vector2(0, 40)
	mailbox_recipient_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.add_child(mailbox_recipient_input)
	mailbox_title_input = LineEdit.new()
	mailbox_title_input.placeholder_text = "标题"
	mailbox_title_input.max_length = 40
	mailbox_title_input.custom_minimum_size = Vector2(0, 40)
	mailbox_title_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.add_child(mailbox_title_input)
	mailbox_body_input = TextEdit.new()
	mailbox_body_input.placeholder_text = "正文"
	mailbox_body_input.custom_minimum_size = Vector2(0, 88)
	mailbox_body_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_body_input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	mailbox_detail_column.add_child(mailbox_body_input)
	mailbox_send_button = Button.new()
	mailbox_send_button.text = "发送"
	mailbox_send_button.custom_minimum_size = Vector2(0, 46)
	mailbox_send_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_send_button.pressed.connect(_on_mailbox_send_pressed)
	mailbox_detail_column.add_child(mailbox_send_button)
	mailbox_status_label = Label.new()
	mailbox_status_label.text = ""
	mailbox_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mailbox_status_label.add_theme_font_size_override("font_size", 14)
	mailbox_status_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	mailbox_status_label.custom_minimum_size = Vector2(0, 32)
	mailbox_detail_column.add_child(mailbox_status_label)
	mailbox_http_request = HTTPRequest.new()
	mailbox_http_request.timeout = 8.0
	mailbox_http_request.request_completed.connect(_on_mailbox_http_request_completed)
	mailbox_panel.add_child(mailbox_http_request)
	hud_root.add_child(mailbox_panel)

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
	training_partner_scroll = ScrollContainer.new()
	training_partner_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	training_partner_column.add_child(training_partner_scroll)
	training_partner_label = Label.new()
	training_partner_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	training_partner_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_label.add_theme_font_size_override("font_size", 16)
	training_partner_scroll.add_child(training_partner_label)
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

	qa_panel = _panel_container("QAPanel")
	qa_panel.visible = false
	qa_panel.z_index = 24
	var qa_column := VBoxContainer.new()
	qa_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	qa_column.add_theme_constant_override("separation", 8)
	qa_panel.add_child(qa_column)

	var qa_header := HBoxContainer.new()
	qa_header.add_theme_constant_override("separation", 10)
	qa_column.add_child(qa_header)
	var qa_title := Label.new()
	qa_title.text = "GM/QA"
	qa_title.add_theme_font_size_override("font_size", 21)
	qa_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_header.add_child(qa_title)
	qa_close_button = Button.new()
	qa_close_button.text = "关闭"
	qa_close_button.custom_minimum_size = Vector2(92, 44)
	qa_close_button.pressed.connect(_close_qa_panel)
	qa_header.add_child(qa_close_button)

	var qa_pet_tool_column := VBoxContainer.new()
	qa_pet_tool_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_pet_tool_column.add_theme_constant_override("separation", 6)
	qa_column.add_child(qa_pet_tool_column)
	var qa_pet_tool_label := Label.new()
	qa_pet_tool_label.text = "GM宠物测试"
	qa_pet_tool_label.add_theme_font_size_override("font_size", 15)
	qa_pet_tool_label.add_theme_color_override("font_color", Color(0.91, 0.80, 0.43, 0.98))
	qa_pet_tool_column.add_child(qa_pet_tool_label)
	var qa_pet_grant_row := HBoxContainer.new()
	qa_pet_grant_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_pet_grant_row.add_theme_constant_override("separation", 8)
	qa_pet_tool_column.add_child(qa_pet_grant_row)
	qa_pet_species_option = OptionButton.new()
	qa_pet_species_option.custom_minimum_size = Vector2(0, 38)
	qa_pet_species_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_pet_species_option.item_selected.connect(func(index: int) -> void:
		qa_pet_growth_profile_id = str(qa_pet_species_option.get_item_metadata(index))
	)
	qa_pet_grant_row.add_child(qa_pet_species_option)
	qa_pet_grant_button = Button.new()
	qa_pet_grant_button.text = "获取Lv1"
	qa_pet_grant_button.custom_minimum_size = Vector2(104, 38)
	qa_pet_grant_button.pressed.connect(_on_qa_pet_grant_pressed)
	qa_pet_grant_row.add_child(qa_pet_grant_button)
	var qa_pet_level_row := HBoxContainer.new()
	qa_pet_level_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_pet_level_row.add_theme_constant_override("separation", 8)
	qa_pet_tool_column.add_child(qa_pet_level_row)
	qa_pet_target_option = OptionButton.new()
	qa_pet_target_option.custom_minimum_size = Vector2(0, 38)
	qa_pet_target_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_pet_target_option.item_selected.connect(func(index: int) -> void:
		qa_pet_level_instance_id = str(qa_pet_target_option.get_item_metadata(index))
	)
	qa_pet_level_row.add_child(qa_pet_target_option)
	qa_pet_level_up_button = Button.new()
	qa_pet_level_up_button.text = "升1级"
	qa_pet_level_up_button.custom_minimum_size = Vector2(104, 38)
	qa_pet_level_up_button.pressed.connect(_on_qa_pet_level_up_pressed)
	qa_pet_level_row.add_child(qa_pet_level_up_button)

	qa_entry_scroll = ScrollContainer.new()
	qa_entry_scroll.custom_minimum_size = Vector2(0, 260)
	qa_entry_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_entry_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	qa_column.add_child(qa_entry_scroll)
	qa_entry_container = VBoxContainer.new()
	qa_entry_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_entry_container.add_theme_constant_override("separation", 7)
	qa_entry_scroll.add_child(qa_entry_container)
	qa_detail_scroll = ScrollContainer.new()
	qa_detail_scroll.custom_minimum_size = Vector2(0, 110)
	qa_detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_detail_scroll.size_flags_vertical = Control.SIZE_SHRINK_END
	qa_column.add_child(qa_detail_scroll)
	qa_detail_label = RichTextLabel.new()
	qa_detail_label.bbcode_enabled = true
	qa_detail_label.fit_content = true
	qa_detail_label.scroll_active = false
	qa_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	qa_detail_label.add_theme_font_size_override("font_size", 14)
	qa_detail_label.custom_minimum_size = Vector2(0, 0)
	qa_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_detail_scroll.add_child(qa_detail_label)
	hud_root.add_child(qa_panel)

	numeric_workbench_panel = _panel_container("NumericWorkbenchPanel")
	numeric_workbench_panel.visible = false
	numeric_workbench_panel.z_index = 25
	var numeric_column := VBoxContainer.new()
	numeric_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	numeric_column.add_theme_constant_override("separation", 9)
	numeric_workbench_panel.add_child(numeric_column)

	var numeric_header := HBoxContainer.new()
	numeric_header.add_theme_constant_override("separation", 10)
	numeric_column.add_child(numeric_header)
	var numeric_title := Label.new()
	numeric_title.text = "数值实验"
	numeric_title.add_theme_font_size_override("font_size", 21)
	numeric_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_header.add_child(numeric_title)
	numeric_workbench_close_button = Button.new()
	numeric_workbench_close_button.text = "关闭"
	numeric_workbench_close_button.custom_minimum_size = Vector2(92, 44)
	numeric_workbench_close_button.pressed.connect(_close_numeric_workbench_panel)
	numeric_header.add_child(numeric_workbench_close_button)

	var numeric_param_grid := GridContainer.new()
	numeric_param_grid.columns = 2
	numeric_param_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_param_grid.add_theme_constant_override("h_separation", 8)
	numeric_param_grid.add_theme_constant_override("v_separation", 8)
	numeric_column.add_child(numeric_param_grid)

	numeric_workbench_profile_option = OptionButton.new()
	numeric_workbench_profile_option.custom_minimum_size = Vector2(0, 42)
	numeric_workbench_profile_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_profile_option.item_selected.connect(func(index: int) -> void:
		numeric_workbench_profile_id = str(numeric_workbench_profile_option.get_item_metadata(index))
	)
	numeric_param_grid.add_child(numeric_workbench_profile_option)

	numeric_workbench_sample_option = OptionButton.new()
	numeric_workbench_sample_option.custom_minimum_size = Vector2(0, 42)
	numeric_workbench_sample_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_param_grid.add_child(numeric_workbench_sample_option)

	numeric_workbench_level_option = OptionButton.new()
	numeric_workbench_level_option.custom_minimum_size = Vector2(0, 42)
	numeric_workbench_level_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_param_grid.add_child(numeric_workbench_level_option)

	numeric_workbench_stage_option = OptionButton.new()
	numeric_workbench_stage_option.custom_minimum_size = Vector2(0, 42)
	numeric_workbench_stage_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_param_grid.add_child(numeric_workbench_stage_option)

	numeric_workbench_stone_option = OptionButton.new()
	numeric_workbench_stone_option.custom_minimum_size = Vector2(0, 42)
	numeric_workbench_stone_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_stone_option.item_selected.connect(func(index: int) -> void:
		numeric_workbench_stone_plan_id = str(numeric_workbench_stone_option.get_item_metadata(index))
	)
	numeric_param_grid.add_child(numeric_workbench_stone_option)

	var numeric_hint := Label.new()
	numeric_hint.text = "结果会写到 .run/godot"
	numeric_hint.add_theme_font_size_override("font_size", 14)
	numeric_hint.add_theme_color_override("font_color", Color(0.78, 0.78, 0.72, 0.92))
	numeric_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	numeric_param_grid.add_child(numeric_hint)

	var numeric_button_row := HBoxContainer.new()
	numeric_button_row.add_theme_constant_override("separation", 8)
	numeric_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_column.add_child(numeric_button_row)
	numeric_workbench_growth_button = Button.new()
	numeric_workbench_growth_button.text = "成长模拟"
	numeric_workbench_growth_button.custom_minimum_size = Vector2(0, 44)
	numeric_workbench_growth_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_growth_button.pressed.connect(_on_numeric_workbench_growth_pressed)
	numeric_button_row.add_child(numeric_workbench_growth_button)
	numeric_workbench_mm_button = Button.new()
	numeric_workbench_mm_button.text = "MM转宠"
	numeric_workbench_mm_button.custom_minimum_size = Vector2(0, 44)
	numeric_workbench_mm_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_mm_button.pressed.connect(_on_numeric_workbench_mm_pressed)
	numeric_button_row.add_child(numeric_workbench_mm_button)
	numeric_workbench_compare_button = Button.new()
	numeric_workbench_compare_button.text = "方案对比"
	numeric_workbench_compare_button.custom_minimum_size = Vector2(0, 44)
	numeric_workbench_compare_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_compare_button.pressed.connect(_on_numeric_workbench_compare_pressed)
	numeric_button_row.add_child(numeric_workbench_compare_button)
	numeric_workbench_battle_button = Button.new()
	numeric_workbench_battle_button.text = "战斗模拟"
	numeric_workbench_battle_button.custom_minimum_size = Vector2(0, 44)
	numeric_workbench_battle_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_battle_button.pressed.connect(_on_numeric_workbench_battle_pressed)
	numeric_button_row.add_child(numeric_workbench_battle_button)
	numeric_workbench_output_button = Button.new()
	numeric_workbench_output_button.text = "输出目录"
	numeric_workbench_output_button.custom_minimum_size = Vector2(0, 44)
	numeric_workbench_output_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_workbench_output_button.pressed.connect(_on_numeric_workbench_output_pressed)
	numeric_button_row.add_child(numeric_workbench_output_button)

	var numeric_result_scroll := ScrollContainer.new()
	numeric_result_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_result_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	numeric_result_scroll.custom_minimum_size = Vector2(0, 260)
	numeric_column.add_child(numeric_result_scroll)
	numeric_workbench_result_label = RichTextLabel.new()
	numeric_workbench_result_label.bbcode_enabled = true
	numeric_workbench_result_label.fit_content = true
	numeric_workbench_result_label.scroll_active = false
	numeric_workbench_result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	numeric_workbench_result_label.add_theme_font_size_override("font_size", 15)
	numeric_workbench_result_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_result_scroll.add_child(numeric_workbench_result_label)
	hud_root.add_child(numeric_workbench_panel)

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
	dialog_panel.z_index = 48
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
	dialog_button_row = HBoxContainer.new()
	dialog_button_row.alignment = BoxContainer.ALIGNMENT_END
	dialog_button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dialog_button_row.size_flags_vertical = Control.SIZE_SHRINK_END
	dialog_button_row.add_theme_constant_override("separation", 10)
	dialog_column.add_child(dialog_button_row)
	dialog_option_button = Button.new()
	dialog_option_button.custom_minimum_size = Vector2(128, 48)
	dialog_option_button.pressed.connect(_confirm_dialog_action)
	dialog_button_row.add_child(dialog_option_button)
	dialog_close_button = Button.new()
	dialog_close_button.text = "离开"
	dialog_close_button.custom_minimum_size = Vector2(96, 48)
	dialog_close_button.pressed.connect(_close_dialog)
	dialog_button_row.add_child(dialog_close_button)
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
	battle_message_box.add_theme_constant_override("separation", 4)
	battle_message_panel.add_child(battle_message_box)
	var battle_message_header := HBoxContainer.new()
	battle_message_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_message_header.add_theme_constant_override("separation", 6)
	battle_message_box.add_child(battle_message_header)
	var battle_message_title := Label.new()
	battle_message_title.text = "消息"
	battle_message_title.add_theme_font_size_override("font_size", 13)
	battle_message_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_message_header.add_child(battle_message_title)
	battle_message_expand_button = Button.new()
	battle_message_expand_button.text = "展开"
	battle_message_expand_button.custom_minimum_size = Vector2(54, 28)
	battle_message_expand_button.add_theme_font_size_override("font_size", 13)
	battle_message_expand_button.pressed.connect(_toggle_battle_message_expanded)
	battle_message_header.add_child(battle_message_expand_button)
	battle_message_clear_button = Button.new()
	battle_message_clear_button.text = "清空"
	battle_message_clear_button.custom_minimum_size = Vector2(54, 28)
	battle_message_clear_button.add_theme_font_size_override("font_size", 13)
	battle_message_clear_button.pressed.connect(_clear_world_log_panel)
	battle_message_header.add_child(battle_message_clear_button)
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
	_register_hud_panels()


func _build_online_position_sync() -> void:
	online_position_http_request = HTTPRequest.new()
	online_position_http_request.timeout = 8.0
	online_position_http_request.request_completed.connect(_on_online_position_http_request_completed)
	add_child(online_position_http_request)
	online_position_timer = Timer.new()
	online_position_timer.wait_time = ONLINE_POSITION_SYNC_INTERVAL_SECONDS
	online_position_timer.one_shot = false
	online_position_timer.autostart = false
	online_position_timer.timeout.connect(_on_online_position_timer_timeout)
	add_child(online_position_timer)
	_start_online_position_sync_if_needed()


func _build_auth_panel() -> void:
	auth_panel = _panel_container("AuthPanel")
	auth_panel.visible = false
	auth_panel.z_index = 90
	auth_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var outer := VBoxContainer.new()
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 12)
	auth_panel.add_child(outer)

	auth_title_label = Label.new()
	auth_title_label.text = "万兽纪元"
	auth_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	auth_title_label.add_theme_font_size_override("font_size", 26)
	outer.add_child(auth_title_label)

	var subtitle := Label.new()
	subtitle.text = "登录后进入火芽村"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 15)
	subtitle.add_theme_color_override("font_color", Color(0.86, 0.82, 0.70, 0.92))
	outer.add_child(subtitle)

	auth_source_option = OptionButton.new()
	auth_source_option.custom_minimum_size = Vector2(0, 40)
	auth_source_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auth_source_option.add_item("服务器", 0)
	auth_source_option.visible = false
	auth_source_option.item_selected.connect(_on_auth_source_selected)
	outer.add_child(auth_source_option)

	auth_server_url_input = LineEdit.new()
	auth_server_url_input.placeholder_text = "服务器"
	auth_server_url_input.text = ServerAuthClientModel.DEFAULT_BASE_URL
	auth_server_url_input.custom_minimum_size = Vector2(0, 40)
	auth_server_url_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(auth_server_url_input)

	var tab_row := HBoxContainer.new()
	tab_row.add_theme_constant_override("separation", 8)
	tab_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(tab_row)
	auth_login_tab_button = Button.new()
	auth_login_tab_button.text = "登录"
	auth_login_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auth_login_tab_button.custom_minimum_size = Vector2(0, 44)
	auth_login_tab_button.pressed.connect(func() -> void:
		_set_auth_mode(false)
	)
	tab_row.add_child(auth_login_tab_button)
	auth_register_tab_button = Button.new()
	auth_register_tab_button.text = "注册"
	auth_register_tab_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auth_register_tab_button.custom_minimum_size = Vector2(0, 44)
	auth_register_tab_button.pressed.connect(func() -> void:
		_set_auth_mode(true)
	)
	tab_row.add_child(auth_register_tab_button)

	auth_username_input = LineEdit.new()
	auth_username_input.placeholder_text = "账号"
	auth_username_input.custom_minimum_size = Vector2(0, 44)
	auth_username_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(auth_username_input)

	auth_password_input = LineEdit.new()
	auth_password_input.placeholder_text = "密码"
	auth_password_input.secret = true
	auth_password_input.custom_minimum_size = Vector2(0, 44)
	auth_password_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auth_password_input.text_submitted.connect(func(_text: String) -> void:
		_on_auth_submit_pressed()
	)
	outer.add_child(auth_password_input)

	auth_display_name_input = LineEdit.new()
	auth_display_name_input.placeholder_text = "昵称"
	auth_display_name_input.custom_minimum_size = Vector2(0, 44)
	auth_display_name_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(auth_display_name_input)

	auth_remember_check = CheckBox.new()
	auth_remember_check.text = "记住账号"
	auth_remember_check.button_pressed = true
	auth_remember_check.custom_minimum_size = Vector2(0, 32)
	outer.add_child(auth_remember_check)

	auth_message_label = Label.new()
	auth_message_label.text = ""
	auth_message_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	auth_message_label.add_theme_font_size_override("font_size", 14)
	auth_message_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	auth_message_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auth_message_label.custom_minimum_size = Vector2(0, 44)
	outer.add_child(auth_message_label)

	auth_submit_button = Button.new()
	auth_submit_button.custom_minimum_size = Vector2(0, 52)
	auth_submit_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auth_submit_button.pressed.connect(_on_auth_submit_pressed)
	outer.add_child(auth_submit_button)

	auth_http_request = HTTPRequest.new()
	auth_http_request.timeout = 8.0
	auth_http_request.request_completed.connect(_on_auth_http_request_completed)
	auth_panel.add_child(auth_http_request)

	profile_sync_http_request = HTTPRequest.new()
	profile_sync_http_request.timeout = 10.0
	profile_sync_http_request.request_completed.connect(_on_profile_sync_http_request_completed)
	auth_panel.add_child(profile_sync_http_request)

	hud_root.add_child(auth_panel)
	_set_auth_server_mode(true, false)
	_set_auth_mode(false)
	_prefill_auth_last_username()


func _build_account_panel() -> void:
	account_panel = _panel_container("AccountPanel")
	account_panel.visible = false
	account_panel.z_index = 82
	account_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var outer := VBoxContainer.new()
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 12)
	account_panel.add_child(outer)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(header)
	var title := Label.new()
	title.text = "账号"
	title.add_theme_font_size_override("font_size", 24)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	account_close_button = Button.new()
	account_close_button.text = "关闭"
	account_close_button.custom_minimum_size = Vector2(96, 44)
	account_close_button.pressed.connect(_close_account_panel)
	header.add_child(account_close_button)

	account_info_label = Label.new()
	account_info_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	account_info_label.clip_text = true
	account_info_label.add_theme_font_size_override("font_size", 17)
	account_info_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	account_info_label.custom_minimum_size = Vector2(0, 108)
	outer.add_child(account_info_label)

	account_switch_button = Button.new()
	account_switch_button.text = "切换账号"
	account_switch_button.custom_minimum_size = Vector2(0, 48)
	account_switch_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	account_switch_button.pressed.connect(_switch_account_to_login)
	outer.add_child(account_switch_button)
	hud_root.add_child(account_panel)


func _set_auth_mode(register_mode: bool) -> void:
	auth_mode_register = register_mode
	if auth_login_tab_button != null:
		auth_login_tab_button.disabled = not auth_mode_register
	if auth_register_tab_button != null:
		auth_register_tab_button.disabled = auth_mode_register
	if auth_display_name_input != null:
		auth_display_name_input.visible = auth_mode_register
	if auth_submit_button != null:
		auth_submit_button.text = "注册并连接" if auth_mode_register else "登录服务器"
		auth_submit_button.disabled = auth_request_pending
	if auth_message_label != null:
		auth_message_label.text = ""


func _set_auth_server_mode(server_mode: bool, update_layout: bool = true) -> void:
	auth_server_mode = true if AUTH_SERVER_ONLY else server_mode
	if auth_source_option != null:
		auth_source_option.select(0)
		auth_source_option.visible = not AUTH_SERVER_ONLY
	if auth_server_url_input != null:
		auth_server_url_input.visible = true if AUTH_SERVER_ONLY else auth_server_mode
	if auth_message_label != null:
		auth_message_label.text = ""
	if update_layout:
		_layout_hud()


func _on_auth_source_selected(_index: int) -> void:
	_set_auth_server_mode(true)


func _prefill_auth_last_username() -> void:
	if auth_username_input == null:
		return
	var last_username := AccountAuthModel.last_username()
	if auth_username_input.text.strip_edges() == "":
		auth_username_input.text = last_username
	if auth_remember_check != null:
		auth_remember_check.button_pressed = last_username != ""


func _open_auth_panel(update_layout: bool = true) -> void:
	if auth_panel == null:
		return
	_close_account_panel(false)
	auth_panel.visible = true
	_prefill_auth_last_username()
	if auth_username_input != null:
		auth_username_input.grab_focus()
	if update_layout:
		_layout_hud()


func _close_auth_panel(update_layout: bool = true) -> void:
	_hide_control(auth_panel, update_layout)


func _remember_auth_session(session: Dictionary) -> void:
	var remember := auth_remember_check == null or auth_remember_check.button_pressed
	if remember:
		AccountAuthModel.set_last_username(str(session.get("username", "")))
	else:
		AccountAuthModel.set_last_username("")


func _on_auth_submit_pressed() -> void:
	if auth_username_input == null or auth_password_input == null:
		return
	if auth_request_pending:
		return
	var username := auth_username_input.text
	var password := auth_password_input.text
	if AUTH_SERVER_ONLY or auth_server_mode:
		_submit_server_auth_request(username, password)
		return
	var result := {}
	if auth_mode_register:
		var display_name := auth_display_name_input.text if auth_display_name_input != null else ""
		result = AccountAuthModel.register_player_account(username, password, display_name)
	else:
		result = AccountAuthModel.login(username, password)
	if not bool(result.get("ok", false)):
		if auth_message_label != null:
			auth_message_label.text = str(result.get("message", "登录失败。"))
		return
	var migrate_legacy := auth_mode_register and bool(result.get("firstAccount", false))
	var session := result.get("session", {}) as Dictionary
	_remember_auth_session(session)
	_apply_authenticated_session(session, migrate_legacy)
	if auth_message_label != null:
		auth_message_label.text = str(result.get("message", "已进入游戏。"))


func _submit_server_auth_request(username: String, password: String) -> void:
	if auth_http_request == null:
		return
	var base_url := auth_server_url_input.text if auth_server_url_input != null else ServerAuthClientModel.DEFAULT_BASE_URL
	var request_spec := {}
	if auth_mode_register:
		var display_name := auth_display_name_input.text if auth_display_name_input != null else ""
		request_spec = ServerAuthClientModel.register_request(base_url, username, password, display_name)
	else:
		request_spec = ServerAuthClientModel.login_request(base_url, username, password)
	auth_request_pending = true
	if auth_submit_button != null:
		auth_submit_button.disabled = true
	if auth_message_label != null:
		auth_message_label.text = "正在连接服务器..."
	var err := auth_http_request.request(
		str(request_spec.get("url", "")),
		_packed_string_array(request_spec.get("headers", [])),
		int(request_spec.get("method", HTTPClient.METHOD_POST)),
		str(request_spec.get("body", ""))
	)
	if err != OK:
		auth_request_pending = false
		if auth_submit_button != null:
			auth_submit_button.disabled = false
		if auth_message_label != null:
			auth_message_label.text = "无法发起服务器请求。"


func _on_auth_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	auth_request_pending = false
	if auth_submit_button != null:
		auth_submit_button.disabled = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if auth_message_label != null:
			auth_message_label.text = "服务器连接失败。"
		return
	var parsed := ServerAuthClientModel.parse_auth_response(response_code, body)
	if not bool(parsed.get("ok", false)):
		if auth_message_label != null:
			auth_message_label.text = str(parsed.get("message", "服务器登录失败。"))
		return
	var session := parsed.get("session", {}) as Dictionary
	session["serverBaseUrl"] = ServerAuthClientModel.normalized_base_url(auth_server_url_input.text if auth_server_url_input != null else ServerAuthClientModel.DEFAULT_BASE_URL)
	_remember_auth_session(session)
	_apply_authenticated_session(session, false)
	if auth_message_label != null:
		auth_message_label.text = str(parsed.get("message", "已连接服务器。"))


func _packed_string_array(value) -> PackedStringArray:
	var result := PackedStringArray()
	if value is PackedStringArray:
		return value as PackedStringArray
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


func _is_server_account_session() -> bool:
	return (
		str(current_account_session.get("authSource", "")) == ServerAuthClientModel.SOURCE_SERVER
		and str(current_account_session.get("serverSessionToken", "")).strip_edges() != ""
	)


func _local_profile_mutation_blocked_for_server_only(action_label: String, emit_message: bool = true) -> bool:
	if not AUTH_SERVER_ONLY:
		return false
	if _is_server_account_session():
		return false
	if auth_auto_bypass or not profile_save_enabled:
		return false
	if emit_message:
		var label := action_label.strip_edges()
		if label == "":
			label = "该操作"
		_set_world_log_message("%s 需要连接服务器后执行，服务器版不会本地改档。" % label)
	return true


func _server_profile_base_url() -> String:
	var base_url := str(current_account_session.get("serverBaseUrl", "")).strip_edges()
	if base_url == "" and auth_server_url_input != null:
		base_url = auth_server_url_input.text
	return ServerAuthClientModel.normalized_base_url(base_url)


func _server_profile_token() -> String:
	return str(current_account_session.get("serverSessionToken", "")).strip_edges()


func _server_battle_should_poll_waiting_state() -> bool:
	return _server_battle().should_poll_waiting_state()


func _update_server_battle_waiting_state_poll(delta: float) -> void:
	_server_battle().update_waiting_state_poll(delta)


func _server_battle_should_poll_room_restore() -> bool:
	return _server_battle().should_poll_room_restore()


func _update_server_battle_room_restore_poll(delta: float) -> void:
	_server_battle().update_room_restore_poll(delta)


func _request_server_battle_room_restore_poll() -> void:
	await _server_battle().request_room_restore_poll()


func _request_server_battle_waiting_state_poll() -> void:
	await _server_battle().request_waiting_state_poll()


func _apply_polled_server_battle_room(room: Dictionary, expected_room_id: String = "") -> void:
	_server_battle().apply_polled_room(room, expected_room_id)


func _request_server_battle_state_restore() -> void:
	await _server_battle().request_state_restore()


func _start_server_event_stream_if_needed() -> void:
	if not _is_server_account_session():
		_stop_server_event_stream()
		return
	if server_event_socket != null:
		var state := server_event_socket.get_ready_state()
		if state == WebSocketPeer.STATE_CONNECTING or state == WebSocketPeer.STATE_OPEN:
			return
	server_event_socket = WebSocketPeer.new()
	var err := server_event_socket.connect_to_url(ServerAuthClientModel.event_stream_url(_server_profile_base_url(), _server_profile_token(), server_event_last_seq))
	if err == OK:
		server_event_state = "connecting"
		server_event_reconnect_remaining = 0.0
	else:
		server_event_socket = null
		server_event_state = "error"
		server_event_reconnect_remaining = SERVER_EVENT_RECONNECT_SECONDS


func _stop_server_event_stream() -> void:
	if server_event_socket != null:
		server_event_socket.close()
	server_event_socket = null
	server_event_state = "off"
	server_event_reconnect_remaining = 0.0
	server_event_seen.clear()


func _poll_server_event_stream(delta: float) -> void:
	if not _is_server_account_session():
		if server_event_state != "off":
			_stop_server_event_stream()
		return
	if server_event_socket == null:
		server_event_reconnect_remaining = maxf(0.0, server_event_reconnect_remaining - maxf(0.0, delta))
		if server_event_reconnect_remaining <= 0.0:
			_start_server_event_stream_if_needed()
		return
	server_event_socket.poll()
	var state := server_event_socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		server_event_state = "open"
		var packet_count := 0
		while server_event_socket.get_available_packet_count() > 0 and packet_count < SERVER_EVENT_MAX_PACKETS_PER_FRAME:
			packet_count += 1
			var parsed := ServerAuthClientModel.parse_event_stream_message(server_event_socket.get_packet())
			if bool(parsed.get("ok", false)):
				_handle_server_event(parsed.get("event", {}) as Dictionary if parsed.get("event", {}) is Dictionary else {})
	elif state == WebSocketPeer.STATE_CLOSED:
		server_event_socket = null
		server_event_state = "closed"
		server_event_reconnect_remaining = SERVER_EVENT_RECONNECT_SECONDS


func _handle_server_event(event: Dictionary) -> void:
	var event_type := str(event.get("type", "")).strip_edges()
	if event_type == "":
		return
	var event_seq := int(event.get("eventSeq", 0))
	if event_seq > 0 and event_seq <= server_event_last_seq:
		return
	if event_seq > 0:
		server_event_last_seq = event_seq
	_record_server_event_seen(event)
	match event_type:
		"events.ready":
			server_event_state = "open"
		"online.snapshot", "online.position":
			_apply_online_position_players(event.get("players", []))
		"chat.message":
			_apply_chat_message_event(event)
		"party.invite", "party.update", "party.invite_declined":
			_apply_party_event(event)
		"battle.invite", "battle.room_ready", "battle.invite_declined", "battle.invite_cancelled", "battle.invite_expired", "battle.command_submitted", "battle.turn_resolved", "battle.room_closed":
			_apply_battle_event(event)


func _record_server_event_seen(event: Dictionary) -> void:
	server_event_seen.append(event.duplicate(true))
	while server_event_seen.size() > SERVER_EVENT_SEEN_MAX:
		server_event_seen.pop_front()


func _server_event_type_seen(event_type: String) -> bool:
	for value in server_event_seen:
		if value is Dictionary and str((value as Dictionary).get("type", "")) == event_type:
			return true
	return false


func _apply_chat_message_event(event: Dictionary) -> void:
	var message := event.get("message", {}) as Dictionary if event.get("message", {}) is Dictionary else {}
	var channel := str(event.get("channel", message.get("channel", CHAT_CHANNEL_NEARBY)))
	if message.is_empty() or not _chat_channel_is_valid(channel):
		return
	var message_id := str(message.get("messageId", "")).strip_edges()
	if message_id != "" and _chat_message_id_exists(message_id):
		return
	chat_messages.append(_chat_message_from_server(message, channel))
	while chat_messages.size() > CHAT_MAX_MESSAGES:
		chat_messages.pop_front()
	if chat_panel != null and chat_panel.visible and chat_active_channel == channel:
		_refresh_chat_panel()


func _chat_message_id_exists(message_id: String) -> bool:
	for value in chat_messages:
		if value is Dictionary and str((value as Dictionary).get("messageId", "")) == message_id:
			return true
	return false


func _party_invite_is_for_current(invite: Dictionary) -> bool:
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	if current_username == "":
		return false
	return str(invite.get("toUsername", "")).strip_edges() == current_username


func _battle_invite_is_for_current(invite: Dictionary) -> bool:
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	if current_username == "":
		return false
	return str(invite.get("toUsername", "")).strip_edges() == current_username


func _battle_invite_is_from_current(invite: Dictionary) -> bool:
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	if current_username == "":
		return false
	return str(invite.get("fromUsername", "")).strip_edges() == current_username


func _latest_incoming_battle_invite() -> Dictionary:
	var invites: Array = server_battle_state.get("incomingInvites", []) if server_battle_state.get("incomingInvites", []) is Array else []
	for value in invites:
		if value is Dictionary and str((value as Dictionary).get("status", "")) == "pending" and _battle_invite_is_for_current(value as Dictionary):
			return (value as Dictionary).duplicate(true)
	return {}


func _apply_party_event(event: Dictionary) -> void:
	var was_party_member := _current_player_is_party_member()
	if event.has("party"):
		party_current_state["party"] = event.get("party", null)
	if not party_current_state.has("incomingInvites"):
		party_current_state["incomingInvites"] = []
	if not party_current_state.has("maxMembers"):
		party_current_state["maxMembers"] = 5
	if event.has("invite"):
		var invite := event.get("invite", {}) as Dictionary if event.get("invite", {}) is Dictionary else {}
		if not invite.is_empty():
			var invites: Array = party_current_state.get("incomingInvites", []) if party_current_state.get("incomingInvites", []) is Array else []
			var invite_id := str(invite.get("inviteId", ""))
			if str(invite.get("status", "")) == "pending" and _party_invite_is_for_current(invite):
				var exists := false
				for value in invites:
					if value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id:
						exists = true
						break
				if not exists:
					invites.append(invite)
			else:
				invites = invites.filter(func(value) -> bool:
					return not (value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id)
				)
			party_current_state["incomingInvites"] = invites
	if _current_player_is_party_member() and not was_party_member:
		_stop_party_member_local_movement(false)
	if party_panel != null and party_panel.visible:
		_refresh_party_panel()
	if training_partner_panel != null and training_partner_panel.visible:
		_refresh_training_partner_panel()
	_update_hud_text(true)


func _apply_battle_event(event: Dictionary) -> void:
	_server_battle().apply_battle_event(event)


func _apply_server_battle_room_state(room: Dictionary, force_start: bool = false) -> bool:
	return _server_battle().apply_room_state(room, force_start)


func _apply_server_battle_room_closed(room: Dictionary) -> void:
	_server_battle().apply_room_closed(room)


func _server_battle_closed_room_has_unplayed_turn(room: Dictionary) -> bool:
	if room.is_empty() or not _battle_is_server_authority():
		return false
	if str(room.get("status", "")).strip_edges() != "closed":
		return false
	var room_id := str(room.get("roomId", "")).strip_edges()
	if room_id == "" or room_id != str(battle_state.get("serverRoomId", "")).strip_edges():
		return false
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var last_event_list := battle.get("lastEventList", {}) as Dictionary if battle.get("lastEventList", {}) is Dictionary else {}
	if str(last_event_list.get("kind", "")).strip_edges() != "battle_event_list":
		return false
	var turn_key := _server_battle_turn_key(last_event_list)
	if turn_key == "":
		return false
	if _server_battle_event_playback_active():
		return true
	return turn_key != server_battle_last_playback_turn_key


func _server_battle_closed_room_from_state() -> Dictionary:
	if not server_battle_pending_closed_room.is_empty():
		return server_battle_pending_closed_room.duplicate(true)
	var state_room := battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	if str(state_room.get("status", "")).strip_edges() == "closed":
		return state_room.duplicate(true)
	var room := server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	var room_id := str(room.get("roomId", "")).strip_edges()
	var active_room_id := str(battle_state.get("serverRoomId", "")).strip_edges()
	if str(room.get("status", "")).strip_edges() == "closed" and (active_room_id == "" or active_room_id == room_id):
		return room.duplicate(true)
	var last_event_list := battle_state.get("lastServerEventList", {}) as Dictionary if battle_state.get("lastServerEventList", {}) is Dictionary else {}
	var result := last_event_list.get("result", {}) as Dictionary if last_event_list.get("result", {}) is Dictionary else {}
	if result.is_empty():
		return {}
	var synthesized := state_room.duplicate(true) if not state_room.is_empty() else room.duplicate(true)
	if synthesized.is_empty():
		synthesized = {"roomId": active_room_id}
	synthesized["status"] = "closed"
	synthesized["closeReason"] = str(result.get("reason", synthesized.get("closeReason", "battle_result")))
	var battle := synthesized.get("battle", {}) as Dictionary if synthesized.get("battle", {}) is Dictionary else {}
	battle["result"] = result.duplicate(true)
	synthesized["battle"] = battle
	return synthesized


func _finish_server_battle_from_closed_room(room: Dictionary = {}) -> Dictionary:
	var closed_room := room.duplicate(true)
	if closed_room.is_empty():
		closed_room = _server_battle_closed_room_from_state()
	var is_party_pve := _server_battle_room_is_party_pve(closed_room)
	var message := _server_party_pve_result_message(closed_room) if is_party_pve else _server_battle_result_message(closed_room)
	if message == "":
		message = "战斗已结束。" if is_party_pve else "切磋已结束。"
	var log_message := _server_party_pve_result_log_message(closed_room, message) if is_party_pve else message
	var result_key := _server_battle_result_key(closed_room)
	var hang_result := _apply_server_battle_hang_writeback(closed_room)
	server_battle_pending_closed_room.clear()
	server_battle_command_request_active = false
	server_battle_state_poll_request_active = false
	server_battle_waiting_poll_elapsed = 0.0
	server_battle_room_restore_poll_elapsed = 0.0
	server_battle_last_playback_turn_key = ""
	server_battle_state["room"] = null
	_end_battle(true)
	var returned_to_record_point := _apply_server_battle_return(closed_room)
	if returned_to_record_point:
		log_message = _server_battle_return_message(log_message)
		message = _server_battle_return_message(message)
	var writeback_warning_lines := _server_battle_writeback_warning_lines_for_current_account(closed_room)
	if not writeback_warning_lines.is_empty():
		log_message = _append_unique_message_lines(log_message, writeback_warning_lines)
		message = _append_unique_message_lines(message, writeback_warning_lines)
	_set_world_log_message(log_message)
	if not is_party_pve:
		_open_battle_result_panel(closed_room, result_key, message)
	else:
		_open_battle_result_panel(closed_room, result_key, log_message, "战斗", false)
	_queue_server_profile_pull()
	if bool(hang_result.get("routeToHealer", false)):
		call_deferred("_route_to_hang_healer")
	return {
		"result": result_key,
		"message": log_message,
		"room": closed_room,
	}


func _server_battle_room_missing_error(parsed: Dictionary) -> bool:
	return str(parsed.get("code", "")).strip_edges() == "battle_room_missing"


func _clear_stale_server_battle_room(message: String = "切磋房间已失效，已回到地图。") -> void:
	server_battle_command_request_active = false
	server_battle_state_poll_request_active = false
	server_battle_waiting_poll_elapsed = 0.0
	server_battle_room_restore_poll_elapsed = 0.0
	server_battle_pending_closed_room.clear()
	server_battle_last_playback_turn_key = ""
	server_battle_state["room"] = null
	if battle_active and bool(battle_state.get("serverAuthority", false)):
		_end_battle(true)
	_set_world_log_message(message)
	_sync_battle_buttons()
	_layout_hud()


func _server_battle_result_payload(room: Dictionary) -> Dictionary:
	var result := room.get("result", {}) as Dictionary if room.get("result", {}) is Dictionary else {}
	if not result.is_empty():
		return result
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	return battle.get("result", {}) as Dictionary if battle.get("result", {}) is Dictionary else {}


func _server_battle_room_mode(room: Dictionary) -> String:
	var mode := str(room.get("mode", "")).strip_edges()
	if mode != "":
		return mode
	var state_room := battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	return str(state_room.get("mode", battle_state.get("serverRoomMode", ""))).strip_edges()


func _server_battle_room_is_party_pve(room: Dictionary) -> bool:
	return _server_battle_room_mode(room) == "party_pve"


func _current_server_battle_is_party_pve() -> bool:
	var state_room := battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	if _server_battle_room_is_party_pve(state_room):
		return true
	var server_room := server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if _server_battle_room_is_party_pve(server_room):
		return true
	return str(battle_state.get("serverRoomMode", "")).strip_edges() == "party_pve"


func _server_battle_stale_room_message() -> String:
	return "队伍战斗已结束，已回到地图。" if _current_server_battle_is_party_pve() else "切磋房间已失效，已回到地图。"


func _server_battle_result_key(room: Dictionary) -> String:
	var result := _server_battle_result_payload(room)
	var winner_account_id := str(result.get("winnerAccountId", "")).strip_edges()
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	if winner_account_id != "" and self_account_id != "":
		return "victory" if winner_account_id == self_account_id else "defeat"
	var reason := str(result.get("reason", room.get("closeReason", ""))).strip_edges()
	if reason == "leave" and str(result.get("closedByAccountId", room.get("closedByAccountId", ""))).strip_edges() == self_account_id:
		return "defeat"
	if reason == "timeout" and _server_battle_result_loser_contains_self(result):
		return "timeout"
	return "server"


func _server_battle_result_loser_contains_self(result: Dictionary) -> bool:
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return false
	var loser_ids: Array = result.get("loserAccountIds", []) if result.get("loserAccountIds", []) is Array else []
	for value in loser_ids:
		if str(value) == self_account_id:
			return true
	return false


func _server_battle_result_message(room: Dictionary) -> String:
	var result := _server_battle_result_payload(room)
	var reason := str(result.get("reason", room.get("closeReason", ""))).strip_edges()
	var winner_account_id := str(result.get("winnerAccountId", "")).strip_edges()
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	var closed_by_account_id := str(result.get("closedByAccountId", room.get("closedByAccountId", ""))).strip_edges()
	if reason == "leave":
		if self_account_id != "" and closed_by_account_id == self_account_id:
			return "你已离开切磋，本场落败。"
		if self_account_id != "" and winner_account_id == self_account_id:
			return "对方已离开切磋，你获胜。"
		return "切磋已结束。"
	if reason == "timeout":
		if self_account_id != "" and winner_account_id == self_account_id:
			return "对方超时，切磋获胜。"
		if _server_battle_result_loser_contains_self(result) or (self_account_id != "" and closed_by_account_id == self_account_id):
			return "指令超时，切磋结束。"
		return "切磋因超时结束。"
	if reason == "defeat" or reason == "battle_result":
		if self_account_id != "" and winner_account_id == self_account_id:
			return "切磋胜利。"
		if winner_account_id != "":
			return "切磋落败。"
	return "切磋已结束。"


func _server_party_pve_result_message(room: Dictionary) -> String:
	var result := _server_battle_result_payload(room)
	var reason := str(result.get("reason", room.get("closeReason", ""))).strip_edges()
	if reason == "escape":
		return "已逃离战斗。"
	if reason == "leave":
		return "你已离开队伍战斗。"
	if reason == "timeout" or reason == "disconnect_timeout":
		return "队伍战斗超时结束。"
	if _server_battle_result_loser_contains_self(result):
		return "战斗失败。"
	if _server_party_pve_has_living_enemy(room):
		return "战斗失败。"
	return "战斗胜利。"


func _server_party_pve_result_log_message(room: Dictionary, base_message: String) -> String:
	var lines: Array[String] = []
	var base_text := base_message.strip_edges()
	if base_text != "":
		lines.append(base_text)
	for line in _server_battle_exp_log_lines_for_current_account(room):
		if line != "" and not lines.has(line):
			lines.append(line)
	for line in _server_battle_reward_log_lines_for_current_account(room):
		if line != "" and not lines.has(line):
			lines.append(line)
	return "\n".join(lines)


func _server_battle_exp_log_lines_for_current_account(room: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var profile_entry := _server_battle_profile_writeback_for_current_account(room)
	var exp := profile_entry.get("exp", {}) as Dictionary if profile_entry.get("exp", {}) is Dictionary else {}
	if exp.is_empty():
		return lines
	var fallback_amount := maxi(0, int(exp.get("amount", 0)))
	var player := exp.get("player", {}) as Dictionary if exp.get("player", {}) is Dictionary else {}
	if not player.is_empty():
		var player_line := _server_battle_exp_log_line("人物", player, "人物", fallback_amount)
		if player_line != "":
			lines.append(player_line)
	var ride_pets: Array = exp.get("ridePets", []) if exp.get("ridePets", []) is Array else []
	for value in ride_pets:
		if value is Dictionary:
			var ride_line := _server_battle_exp_log_line("骑宠", value as Dictionary, "骑宠", fallback_amount)
			if ride_line != "":
				lines.append(ride_line)
	var pets: Array = exp.get("pets", []) if exp.get("pets", []) is Array else []
	for value in pets:
		if value is Dictionary:
			var pet_line := _server_battle_exp_log_line("宠物", value as Dictionary, "宠物", fallback_amount)
			if pet_line != "":
				lines.append(pet_line)
	var partners: Array = exp.get("trainingPartners", []) if exp.get("trainingPartners", []) is Array else []
	for value in partners:
		if not (value is Dictionary):
			continue
		var partner := value as Dictionary
		var partner_player := partner.get("player", {}) as Dictionary if partner.get("player", {}) is Dictionary else {}
		if not partner_player.is_empty():
			var partner_line := _server_battle_exp_log_line("伙伴", partner_player, "伙伴", fallback_amount)
			if partner_line != "":
				lines.append(partner_line)
		var partner_pet := partner.get("pet", {}) as Dictionary if partner.get("pet", {}) is Dictionary else {}
		if not partner_pet.is_empty():
			var partner_pet_line := _server_battle_exp_log_line("伙伴宠", partner_pet, "伙伴宠", fallback_amount)
			if partner_pet_line != "":
				lines.append(partner_pet_line)
	return lines


func _server_battle_exp_log_line(role_name: String, entry: Dictionary, fallback_name: String, fallback_amount: int = -1) -> String:
	var amount := maxi(0, int(entry.get("amount", fallback_amount)))
	var display_name := _server_battle_exp_entry_name(entry, fallback_name)
	if amount <= 0:
		var kill_count := maxi(0, int(entry.get("killCount", 0)))
		if kill_count <= 0:
			return "%s %s 获得 0 点经验（未击倒怪物）。" % [role_name, display_name]
		return "%s %s 获得 0 点经验。" % [role_name, display_name]
	var base_amount := amount
	if entry.has("baseAmount"):
		base_amount = maxi(0, int(entry.get("baseAmount", amount)))
	elif entry.has("scaledAmount"):
		base_amount = maxi(0, int(entry.get("scaledAmount", amount)))
	if base_amount <= 0:
		base_amount = amount
	var bonus_percent := maxi(0, int(entry.get("partyBonusPercent", 0)))
	if bonus_percent <= 0:
		bonus_percent = maxi(0, int(round(float(entry.get("partyBonusRate", 0.0)) * 100.0)))
	if bonus_percent > 0:
		return "%s %s 获得 %d 点经验（基础%d，组队+%d%%）。" % [role_name, display_name, amount, base_amount, bonus_percent]
	return "%s %s 获得 %d 点经验。" % [role_name, display_name, amount]


func _server_battle_profile_writeback_for_current_account(room: Dictionary) -> Dictionary:
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return {}
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var writeback := battle.get("profileWriteback", {}) as Dictionary if battle.get("profileWriteback", {}) is Dictionary else {}
	var profiles: Array = writeback.get("profiles", []) if writeback.get("profiles", []) is Array else []
	for value in profiles:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == self_account_id:
			return (value as Dictionary).duplicate(true)
	return {}


func _server_battle_profile_writeback_skips_for_current_account(room: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return result
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var writeback := battle.get("profileWriteback", {}) as Dictionary if battle.get("profileWriteback", {}) is Dictionary else {}
	var skipped_profiles: Array = writeback.get("skippedProfiles", []) if writeback.get("skippedProfiles", []) is Array else []
	for value in skipped_profiles:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == self_account_id:
			result.append((value as Dictionary).duplicate(true))
	return result


func _server_battle_writeback_warning_lines_for_current_account(room: Dictionary) -> Array[String]:
	var skipped_profiles := _server_battle_profile_writeback_skips_for_current_account(room)
	var lines: Array[String] = []
	if skipped_profiles.is_empty():
		return lines
	var profile_missing := false
	var pet_missing := false
	var other_skip := false
	for entry in skipped_profiles:
		match str(entry.get("reason", "")).strip_edges():
			"profile_binding_missing", "profile_document_missing":
				profile_missing = true
			"pet_instance_missing":
				pet_missing = true
			_:
				other_skip = true
	if profile_missing:
		lines.append("本次战斗结果未写入服务器，请重新登录后确认。")
	if pet_missing:
		lines.append("部分宠物战斗状态未写入服务器，请打开宠物面板确认。")
	if other_skip:
		lines.append("部分战斗结果未写入服务器，请重新登录后确认。")
	return lines


func _append_unique_message_lines(message: String, extra_lines: Array[String]) -> String:
	var lines: Array[String] = []
	for value in message.split("\n", false):
		var text := str(value).strip_edges()
		if text != "" and not lines.has(text):
			lines.append(text)
	for value in extra_lines:
		var text := str(value).strip_edges()
		if text != "" and not lines.has(text):
			lines.append(text)
	return "\n".join(lines)


func _apply_server_battle_hang_writeback(room: Dictionary) -> Dictionary:
	var profile_entry := _server_battle_profile_writeback_for_current_account(room)
	var hang := profile_entry.get("hang", {}) as Dictionary if profile_entry.get("hang", {}) is Dictionary else {}
	if hang.is_empty():
		return {}
	var stopped := bool(hang.get("stopped", false))
	var reason := str(hang.get("lastStopReason", hang.get("stopReason", ""))).strip_edges()
	var pending_resume := bool(hang.get("pendingResume", false))
	if stopped:
		_set_hang_mode(false)
		if _encounter_stone_active():
			_clear_encounter_stone_effect(false, false)
		var session := PlayerProgressModel.hang_session(player_profile)
		session[HangSettingsModel.SESSION_ENABLED_KEY] = false
		session[HangSettingsModel.SESSION_PENDING_RESUME_KEY] = pending_resume
		session[HangSettingsModel.SESSION_LAST_STOP_REASON_KEY] = reason
		if hang.has("battleCount"):
			session[HangSettingsModel.SESSION_BATTLE_COUNT_KEY] = maxi(0, int(hang.get("battleCount", session.get(HangSettingsModel.SESSION_BATTLE_COUNT_KEY, 0))))
		if hang.has("captureSuccessCount"):
			session[HangSettingsModel.SESSION_CAPTURE_SUCCESS_COUNT_KEY] = maxi(0, int(hang.get("captureSuccessCount", session.get(HangSettingsModel.SESSION_CAPTURE_SUCCESS_COUNT_KEY, 0))))
		player_profile = PlayerProgressModel.with_hang_session(player_profile, session)
	else:
		var current_session := PlayerProgressModel.hang_session(player_profile)
		if hang.has("battleCount"):
			current_session[HangSettingsModel.SESSION_BATTLE_COUNT_KEY] = maxi(0, int(hang.get("battleCount", current_session.get(HangSettingsModel.SESSION_BATTLE_COUNT_KEY, 0))))
		if hang.has("captureSuccessCount"):
			current_session[HangSettingsModel.SESSION_CAPTURE_SUCCESS_COUNT_KEY] = maxi(0, int(hang.get("captureSuccessCount", current_session.get(HangSettingsModel.SESSION_CAPTURE_SUCCESS_COUNT_KEY, 0))))
		player_profile = PlayerProgressModel.with_hang_session(player_profile, current_session)
	return {
		"stopped": stopped,
		"reason": reason,
		"routeToHealer": stopped and pending_resume and ["low_hp", "player_defeated"].has(reason),
	}


func _server_battle_exp_entry_name(entry: Dictionary, fallback: String) -> String:
	var display_name := str(entry.get("name", entry.get("displayName", ""))).strip_edges()
	if display_name != "":
		return display_name
	return fallback


func _server_battle_reward_log_lines_for_current_account(room: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var profile_entry := _server_battle_profile_writeback_for_current_account(room)
	var rewards := profile_entry.get("rewards", {}) as Dictionary if profile_entry.get("rewards", {}) is Dictionary else {}
	if not rewards.is_empty():
		var stone_coins := maxi(0, int(rewards.get("stoneCoins", 0)))
		if stone_coins > 0:
			lines.append("获得 %d 石币。" % stone_coins)
		var added_text := BackpackModel.item_amounts_text(_server_battle_item_amounts(rewards.get("addedItems", [])))
		if added_text != "":
			lines.append("获得 %s。" % added_text)
		var lost_text := BackpackModel.item_amounts_text(_server_battle_item_amounts(rewards.get("lostItems", [])))
		if lost_text != "":
			lines.append("背包已满，%s 未进入背包。" % lost_text)
	var quests := profile_entry.get("quests", {}) as Dictionary if profile_entry.get("quests", {}) is Dictionary else {}
	var quest_messages: Array = quests.get("messages", []) if quests.get("messages", []) is Array else []
	for value in quest_messages:
		var message := str(value).strip_edges()
		if message != "":
			lines.append(message)
	var hang := profile_entry.get("hang", {}) as Dictionary if profile_entry.get("hang", {}) is Dictionary else {}
	if bool(hang.get("stopped", false)):
		var hang_reason := str(hang.get("lastStopReason", hang.get("stopReason", ""))).strip_edges()
		match hang_reason:
			"capture_target":
				lines.append("捕捉目标已完成，挂机已停止。")
			"player_defeated":
				lines.append("人物倒下过，正在回村治疗。" if bool(hang.get("pendingResume", false)) else "人物倒下过，挂机已停止。")
			"low_hp":
				lines.append("人物生命偏低，正在回村治疗。" if bool(hang.get("pendingResume", false)) else "人物生命偏低，挂机已停止。")
	return lines


func _server_battle_item_amounts(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for entry_value in value:
		if not (entry_value is Dictionary):
			continue
		var entry := entry_value as Dictionary
		var item_id := str(entry.get("itemId", "")).strip_edges()
		var count := maxi(0, int(entry.get("count", 0)))
		if item_id != "" and count > 0:
			result.append({
				"itemId": item_id,
				"count": count,
			})
	return result


func _server_party_pve_has_living_enemy(room: Dictionary) -> bool:
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if str(actor.get("side", "")).strip_edges() == BattleModel.SIDE_ENEMY and int(actor.get("hp", 0)) > 0:
			return true
	return false


func _open_battle_result_panel(room: Dictionary, result_key: String, message: String, title_prefix: String = "切磋", include_opponent: bool = true) -> void:
	if battle_result_panel == null:
		return
	if battle_result_title_label != null:
		battle_result_title_label.text = _battle_result_title(result_key, title_prefix)
	if battle_result_detail_label != null:
		var details: Array[String] = []
		if message.strip_edges() != "":
			details.append(message.strip_edges())
		var opponent_text := _battle_result_opponent_text(room) if include_opponent else ""
		if include_opponent and opponent_text != "":
			details.append("对手：%s" % opponent_text)
		battle_result_detail_label.text = "\n".join(details)
	battle_result_panel.visible = true
	_layout_hud()


func _close_battle_result_panel(update_layout: bool = true) -> void:
	_hide_control(battle_result_panel, update_layout)


func _battle_result_title(result_key: String, prefix: String = "切磋") -> String:
	var safe_prefix := prefix.strip_edges()
	if safe_prefix == "":
		safe_prefix = "战斗"
	match result_key:
		"victory":
			return "%s胜利" % safe_prefix
		"defeat":
			return "%s落败" % safe_prefix if safe_prefix == "切磋" else "%s失败" % safe_prefix
		"timeout":
			return "%s超时" % safe_prefix
		_:
			return "%s结束" % safe_prefix


func _battle_result_opponent_text(room: Dictionary) -> String:
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	var participants: Array = room.get("participants", []) if room.get("participants", []) is Array else []
	for value in participants:
		if not (value is Dictionary):
			continue
		var participant := value as Dictionary
		if str(participant.get("accountId", "")).strip_edges() == self_account_id:
			continue
		var display_name := str(participant.get("displayName", "")).strip_edges()
		var username := str(participant.get("username", "")).strip_edges()
		if display_name != "":
			return display_name
		if username != "":
			return username
	var result := _server_battle_result_payload(room)
	var result_participants: Array = result.get("participants", []) if result.get("participants", []) is Array else []
	for value in result_participants:
		if not (value is Dictionary):
			continue
		var participant := value as Dictionary
		if str(participant.get("accountId", "")).strip_edges() == self_account_id:
			continue
		var display_name := str(participant.get("displayName", "")).strip_edges()
		var username := str(participant.get("username", "")).strip_edges()
		if display_name != "":
			return display_name
		if username != "":
			return username
	return ""


func _server_battle_return_for_self(room: Dictionary) -> Dictionary:
	var result := _server_battle_result_payload(room)
	var returns: Array = result.get("battleReturns", []) if result.get("battleReturns", []) is Array else []
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return {}
	for value in returns:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == self_account_id:
			return (value as Dictionary).duplicate(true)
	return {}


func _apply_server_battle_return(room: Dictionary) -> bool:
	var battle_return := _server_battle_return_for_self(room)
	if battle_return.is_empty():
		return false
	var record_point := battle_return.get("recordPoint", {}) as Dictionary if battle_return.get("recordPoint", {}) is Dictionary else {}
	var position := battle_return.get("position", {}) as Dictionary if battle_return.get("position", {}) is Dictionary else {}
	var map_id := str(record_point.get("mapId", position.get("mapId", ""))).strip_edges()
	var spawn_name := str(record_point.get("spawnName", PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME)).strip_edges()
	if map_id == "":
		return false
	if spawn_name == "":
		spawn_name = PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME
	if not _load_map(map_id, spawn_name):
		return false
	if not position.is_empty():
		_apply_server_step_move_authority_position(position, true)
	return true


func _server_battle_return_message(message: String) -> String:
	var text := message.strip_edges()
	if text.ends_with("。"):
		text = text.substr(0, text.length() - 1)
	if text == "":
		text = "切磋已结束"
	return "%s，已回到记录点。" % text


func _sync_server_battle_room_scene(force_start: bool = false) -> bool:
	return _server_battle().sync_room_scene(force_start)


func _battle_is_server_authority() -> bool:
	return (
		battle_active
		and bool(battle_state.get("serverAuthority", false))
		and str(battle_state.get("serverRoomId", "")).strip_edges() != ""
	)


func _battle_invite_seen(invite_id: String) -> bool:
	var invites: Array = server_battle_state.get("incomingInvites", []) if server_battle_state.get("incomingInvites", []) is Array else []
	for value in invites:
		if value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id:
			return true
	return false


func _battle_outgoing_invite_seen(invite_id: String) -> bool:
	var invites: Array = server_battle_state.get("outgoingInvites", []) if server_battle_state.get("outgoingInvites", []) is Array else []
	for value in invites:
		if value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id:
			return true
	return false


func _battle_room_ready(room_id: String = "") -> bool:
	var room := server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if str(room.get("status", "")) != "ready":
		return false
	if room_id.strip_edges() == "":
		return str(room.get("roomId", "")).strip_edges() != ""
	return str(room.get("roomId", "")) == room_id


func _battle_turn_resolved(room_id: String = "", round_number: int = 0) -> bool:
	var room := server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if room_id.strip_edges() != "" and str(room.get("roomId", "")) != room_id:
		return false
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var event_list := battle.get("lastEventList", {}) as Dictionary if battle.get("lastEventList", {}) is Dictionary else {}
	if str(event_list.get("kind", "")) != "battle_event_list":
		return false
	if round_number > 0 and int(event_list.get("round", 0)) != round_number:
		return false
	var events: Array = event_list.get("events", []) if event_list.get("events", []) is Array else []
	return events.size() > 0


func _server_battle_turn_key(event_list: Dictionary) -> String:
	if str(event_list.get("kind", "")) != "battle_event_list":
		return ""
	var room_id := str(event_list.get("roomId", battle_state.get("serverRoomId", ""))).strip_edges()
	if room_id == "":
		return ""
	return "%s:r%d:t%d" % [
		room_id,
		maxi(1, int(event_list.get("round", 1))),
		maxi(0, int(event_list.get("turnSeq", 0))),
	]


func _server_battle_event_playback_active() -> bool:
	return (
		_battle_is_server_authority()
		and str(battle_state.get("phase", "")) == "round_events"
		and (
			battle_action_timer > 0.0
			or battle_event_advance_pending
			or not battle_current_event.is_empty()
			or not battle_event_queue.is_empty()
		)
	)


func _sync_server_battle_snapshot_fields_during_playback(room: Dictionary) -> void:
	if room.is_empty() or battle_state.is_empty():
		return
	battle_state["serverRoom"] = room.duplicate(true)
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	if not battle.is_empty():
		battle_state["serverBattle"] = battle.duplicate(true)
		var last_event_list = battle.get("lastEventList", null)
		if last_event_list is Dictionary:
			battle_state["lastServerEventList"] = (last_event_list as Dictionary).duplicate(true)


func _play_server_battle_event_list(event_list: Dictionary) -> bool:
	return _server_battle().play_event_list(event_list)


func _start_online_position_sync_if_needed() -> void:
	if online_position_timer == null:
		return
	if _is_server_account_session():
		if online_position_timer.is_stopped():
			online_position_timer.start()
		_request_online_position_snapshot()
	else:
		_stop_online_position_sync()


func _stop_online_position_sync() -> void:
	if online_position_timer != null:
		online_position_timer.stop()
	if online_position_http_request != null and online_position_request_pending:
		online_position_http_request.cancel_request()
	online_position_request_pending = false
	online_position_remote_players.clear()
	online_position_draw_signature_cache = ""
	queue_redraw()


func _on_online_position_timer_timeout() -> void:
	_request_online_position_snapshot()


func _request_online_position_snapshot() -> void:
	if online_position_http_request == null or online_position_request_pending:
		return
	if not _is_server_account_session() or player == null or map_data.is_empty():
		return
	var spec := ServerAuthClientModel.player_position_update_request(
		_server_profile_base_url(),
		_server_profile_token(),
		_current_online_position_payload()
	)
	online_position_request_pending = true
	var err := online_position_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_POST)),
		str(spec.get("body", ""))
	)
	if err != OK:
		online_position_request_pending = false


func _current_online_position_payload() -> Dictionary:
	var use_server_step_cell := _server_step_move_should_report_authority_cell()
	var cell: Vector2i = Vector2i.ZERO
	var moving: bool = false
	if use_server_step_cell:
		cell = server_step_move_authority_cell
		moving = server_step_move_active or server_step_move_request_pending or server_step_move_waiting_for_visual
	elif player != null and not map_data.is_empty():
		cell = IsoMapModel.world_to_grid(map_data, player.global_position)
		moving = player.is_auto_moving() if player.has_method("is_auto_moving") else false
	return {
		"mapId": current_map_id,
		"cellX": cell.x,
		"cellY": cell.y,
		"facing": player.get_facing_key() if player != null and player.has_method("get_facing_key") else "south",
		"moving": moving,
		"aoiRadius": ONLINE_POSITION_AOI_RADIUS_CELLS,
	}


func _on_online_position_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	online_position_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		return
	var parsed := ServerAuthClientModel.parse_player_position_update_response(response_code, body)
	if not bool(parsed.get("ok", false)):
		return
	var own_position := parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if _should_apply_online_self_position(own_position):
		_apply_server_step_move_authority_position(own_position, true)
	elif _server_step_move_should_report_authority_cell():
		_apply_server_step_move_authority_position(own_position)
	_apply_online_position_players(parsed.get("players", []))


func _apply_online_position_players(players) -> void:
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	var current_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	var next_remote_players: Array[Dictionary] = []
	if players is Array:
		for value in players:
			if not (value is Dictionary):
				continue
			var online_player := (value as Dictionary).duplicate(true)
			var username := str(online_player.get("username", "")).strip_edges()
			var account_id := str(online_player.get("accountId", "")).strip_edges()
			if (current_username != "" and username == current_username) or (current_account_id != "" and account_id == current_account_id):
				var self_position := online_player.get("position", {}) as Dictionary if online_player.get("position", {}) is Dictionary else {}
				if _should_apply_online_self_position(self_position):
					_apply_server_step_move_authority_position(self_position, true)
				continue
			var position = online_player.get("position", null)
			if not (position is Dictionary):
				continue
			next_remote_players.append(online_player)
			if next_remote_players.size() >= ONLINE_POSITION_MAX_REMOTE_PLAYERS:
				break
	online_position_remote_players = next_remote_players
	var next_signature := _online_position_draw_signature(next_remote_players)
	if next_signature != online_position_draw_signature_cache:
		online_position_draw_signature_cache = next_signature
		queue_redraw()


func _online_position_draw_signature(players: Array[Dictionary]) -> String:
	var parts: Array[String] = []
	for value in players:
		var position := value.get("position", {}) as Dictionary if value.get("position", {}) is Dictionary else {}
		parts.append("%s:%s:%d,%d:%s:%s" % [
			str(value.get("accountId", value.get("username", ""))),
			str(position.get("mapId", "")),
			int(position.get("cellX", 0)),
			int(position.get("cellY", 0)),
			str(position.get("facing", "")),
			str(position.get("moving", false)),
		])
	parts.sort()
	return "|".join(parts)


func _request_server_profile_pull() -> void:
	_server_sync().request_profile_pull()


func _queue_server_profile_pull() -> void:
	_server_sync().queue_profile_pull()


func _queue_server_profile_upload() -> void:
	_server_sync().queue_profile_upload()


func _start_server_profile_sync_request(kind: String, spec: Dictionary) -> void:
	_server_sync().start_server_profile_sync_request(kind, spec)


func _on_profile_sync_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_server_sync().on_profile_sync_http_request_completed(result, response_code, _headers, body)


func _apply_server_profile_pull_result(parsed: Dictionary, allow_defer: bool = true) -> void:
	_server_sync().apply_server_profile_pull_result(parsed, allow_defer)


func _apply_server_profile_upload_result(parsed: Dictionary) -> void:
	_server_sync().apply_server_profile_upload_result(parsed)


func _continue_pending_server_profile_sync() -> void:
	_server_sync().continue_pending_server_profile_sync()


func _server_profile_pull_should_wait_for_profile_panel() -> bool:
	return _server_sync().server_profile_pull_should_wait_for_profile_panel()


func _defer_server_profile_pull_result(parsed: Dictionary) -> void:
	_server_sync().defer_server_profile_pull_result(parsed)


func _apply_deferred_server_profile_pull_if_idle() -> void:
	_server_sync().apply_deferred_server_profile_pull_if_idle()


func _apply_server_profile_summary(summary: Dictionary) -> void:
	_server_sync().apply_server_profile_summary(summary)


func _apply_server_profile_payload(parsed: Dictionary) -> bool:
	return _server_sync().apply_server_profile_payload(parsed)


func _apply_auth_profile_metadata_fields(display_name: String) -> void:
	var name := display_name.strip_edges()
	if name == "":
		name = str(current_account_session.get("username", "玩家"))
	var player := player_profile.get("player", {}) as Dictionary if player_profile.get("player", {}) is Dictionary else {}
	var current_name := str(player.get("name", player_profile.get("playerName", ""))).strip_edges()
	if current_name == "" or current_name == "见习猎人":
		player["name"] = name
		player_profile["playerName"] = name
	player_profile["player"] = player
	player_profile["accountUsername"] = str(current_account_session.get("username", ""))
	player_profile["accountRole"] = str(current_account_session.get("role", AccountAuthModel.ROLE_PLAYER))
	player_profile["effectiveAccountRole"] = str(current_account_session.get("effectiveRole", AccountAuthModel.EFFECTIVE_ROLE_PLAYER))
	if current_account_session.has("serverProfileSummary"):
		player_profile["serverProfileSummary"] = current_account_session.get("serverProfileSummary", {})


func _apply_authenticated_session(session: Dictionary, migrate_legacy: bool = false) -> void:
	if session.is_empty():
		return
	var previous_server_token := _server_profile_token()
	var next_server_token := str(session.get("serverSessionToken", "")).strip_edges()
	if previous_server_token != next_server_token:
		server_event_last_seq = 0
		server_event_seen.clear()
		server_battle_pending_closed_room.clear()
		server_battle_state_poll_request_active = false
		server_battle_waiting_poll_elapsed = 0.0
		server_battle_room_restore_poll_elapsed = 0.0
	current_account_session = session
	account_authenticated = true
	server_profile_sync_state = "loading" if _is_server_account_session() else "off"
	server_profile_sync_dirty = false
	server_profile_sync_pull_queued = false
	server_profile_sync_deferred_pull_result.clear()
	server_profile_sync_message = ""
	server_profile_sync_expected_revision = int((session.get("serverProfileSummary", {}) as Dictionary).get("profileRevision", 0)) if session.get("serverProfileSummary", {}) is Dictionary else 0
	profile_save_pending = false
	profile_save_debounce_remaining = 0.0
	PlayerProgressModel.set_active_save_path(str(session.get("profileSavePath", "")))
	var migrated := false
	if migrate_legacy:
		migrated = PlayerProgressModel.copy_legacy_save_to_active_if_missing()
	player_profile = PlayerProgressModel.load_profile()
	if _is_server_account_session():
		_apply_auth_profile_metadata_fields(str(session.get("displayName", "")))
		player_profile = PlayerProgressModel.normalize_profile(player_profile)
	else:
		_apply_auth_profile_metadata(str(session.get("displayName", "")))
	_close_auth_panel(false)
	_close_account_panel(false)
	_refresh_gm_visibility()
	_save_profile_after_exp_pill_starter_update()
	_show_exp_pill_starter_notice_if_needed()
	if migrated:
		_set_world_log_message("已导入旧本地存档。")
	elif world_log_message == "":
		_set_world_log_message("已进入游戏。")
	_refresh_mailbox_menu_button()
	_mark_progress_ui_caches_dirty()
	_update_hud_text(true)
	_layout_hud()
	if _is_server_account_session():
		_start_server_event_stream_if_needed()
		_start_online_position_sync_if_needed()
		_request_server_profile_pull()
		_request_server_battle_state_restore()
	else:
		_stop_server_event_stream()
		_stop_online_position_sync()


func _apply_auth_profile_metadata(display_name: String) -> void:
	_apply_auth_profile_metadata_fields(display_name)
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	if profile_save_enabled:
		_request_profile_save()


func _can_use_gm_tools() -> bool:
	return auth_auto_bypass or GmToolRuntimeModel.session_can_open_tools(current_account_session)


func _refresh_gm_visibility() -> void:
	if account_menu_button != null:
		account_menu_button.visible = account_authenticated
	if qa_menu_button != null:
		qa_menu_button.visible = _can_use_gm_tools()
	if not _can_use_gm_tools():
		_close_qa_panel(false)
		_close_numeric_workbench_panel(false)


func _open_account_panel() -> void:
	if not account_authenticated:
		_open_auth_panel()
		return
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_party_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	_close_numeric_workbench_panel(false)
	if account_panel != null:
		account_panel.visible = true
	_refresh_account_panel()
	_layout_hud()


func _close_account_panel(update_layout: bool = true) -> void:
	_hide_control(account_panel, update_layout)


func _refresh_account_panel() -> void:
	if account_info_label == null:
		return
	var display_name := str(current_account_session.get("displayName", "玩家")).strip_edges()
	var username := str(current_account_session.get("username", "")).strip_edges()
	var source := str(current_account_session.get("authSource", ServerAuthClientModel.SOURCE_SERVER))
	var source_label := "服务器" if AUTH_SERVER_ONLY or source == ServerAuthClientModel.SOURCE_SERVER else "本地"
	if display_name == "":
		display_name = username if username != "" else "玩家"
	var profile_line := "档案：等待服务器绑定"
	if AUTH_SERVER_ONLY or source == ServerAuthClientModel.SOURCE_SERVER:
		var summary := current_account_session.get("serverProfileSummary", {}) as Dictionary if current_account_session.get("serverProfileSummary", {}) is Dictionary else {}
		var player_id := str(summary.get("playerId", "")).strip_edges()
		var revision := int(summary.get("profileRevision", 0))
		var sync_label := "同步中" if server_profile_sync_state == "loading" or server_profile_sync_state == "uploading" else ("冲突" if server_profile_sync_state == "conflict" else "已连接")
		profile_line = "档案：%s r%d %s" % [player_id if player_id != "" else "服务器绑定", revision, sync_label]
	account_info_label.text = "当前角色：%s\n账号：%s\n通道：%s\n%s\n切换账号前会保存本地缓存，进度以服务器为准。" % [
		display_name,
		username if username != "" else "-",
		source_label,
		profile_line,
	]


func _switch_account_to_login() -> void:
	if profile_save_enabled:
		_flush_profile_save_now()
		_save_player_profile_now()
	account_authenticated = false
	current_account_session = {}
	server_profile_sync_state = "off"
	server_profile_sync_pending_kind = ""
	server_profile_sync_dirty = false
	server_profile_sync_pull_queued = false
	server_profile_sync_deferred_pull_result.clear()
	server_profile_sync_expected_revision = 0
	server_profile_sync_message = ""
	server_battle_state.clear()
	server_battle_pending_closed_room.clear()
	server_battle_state_poll_request_active = false
	server_battle_waiting_poll_elapsed = 0.0
	server_battle_room_restore_poll_elapsed = 0.0
	server_event_last_seq = 0
	_stop_server_event_stream()
	_stop_online_position_sync()
	PlayerProgressModel.reset_active_save_path()
	player_profile = PlayerProgressModel.default_profile()
	if auth_password_input != null:
		auth_password_input.text = ""
	if auth_display_name_input != null:
		auth_display_name_input.text = ""
	_set_auth_mode(false)
	_close_account_panel(false)
	_refresh_gm_visibility()
	_mark_progress_ui_caches_dirty()
	_update_hud_text(true)
	_open_auth_panel(false)
	_layout_hud()


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


func _update_battle_debug_window(_force: bool = false) -> void:
	# 兼容旧参数名；当前旁路验证只写 .run/battle_trace/latest.jsonl，不打开游戏窗口。
	return


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


func _build_cjk_system_font() -> SystemFont:
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
	return font


func _canvas_text_font() -> Font:
	if canvas_text_font == null:
		canvas_text_font = _build_cjk_system_font()
	return canvas_text_font


func _build_theme() -> Theme:
	var theme := Theme.new()
	var font := _build_cjk_system_font()
	theme.default_font = font
	theme.default_font_size = 18
	return theme


func _register_hud_panels() -> void:
	panel_registry = PanelRegistry.new()
	panel_registry.set_input_blockers([
		top_panel,
		side_panel,
		action_bar,
		player_status_panel,
		player_rebirth_preview_panel,
		backpack_panel,
		equipment_panel,
		equipment_synthesis_panel,
		shop_panel,
		pet_panel,
		pet_skill_panel,
		pet_cultivation_panel,
		codex_panel,
		quest_panel,
			map_panel,
			chat_panel,
			party_panel,
			player_action_panel,
			battle_invite_panel,
			mailbox_panel,
		training_partner_panel,
		auto_settings_panel,
		auth_panel,
		account_panel,
		qa_panel,
		numeric_workbench_panel,
		pet_rename_panel,
		dialog_panel,
		encounter_panel,
		battle_command_panel,
		battle_auto_stop_button,
		battle_passive_panel,
		battle_message_panel,
	])
	panel_registry.set_world_menu_panels([
		player_status_panel,
		player_rebirth_preview_panel,
		backpack_panel,
		equipment_panel,
		equipment_synthesis_panel,
		shop_panel,
		pet_panel,
		pet_skill_panel,
		pet_cultivation_panel,
		codex_panel,
		quest_panel,
			map_panel,
			chat_panel,
			party_panel,
			player_action_panel,
			battle_invite_panel,
			mailbox_panel,
		training_partner_panel,
		auto_settings_panel,
		auth_panel,
		account_panel,
		qa_panel,
		numeric_workbench_panel,
		pet_rename_panel,
	])


func _panel_container(node_name: String) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	panel.add_theme_stylebox_override("panel", _panel_style())
	return panel


func _hide_control(control: Control, update_layout: bool = true) -> bool:
	if control == null or not control.visible:
		return false
	control.visible = false
	if update_layout and hud_root != null:
		_layout_hud()
	return true


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


func _battle_indicator_panel_style() -> StyleBoxFlat:
	var style := _panel_style()
	style.bg_color = Color(0.08, 0.11, 0.11, 0.72)
	style.border_color = Color(0.72, 0.56, 0.32, 0.66)
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
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

	if hang_mode_active:
		_set_hang_mode(false)
	if _should_defer_click_screen_point():
		_queue_click_screen_point(screen_point)
		return
	_resolve_click_screen_point(screen_point)


func _should_defer_click_screen_point() -> bool:
	return click_move_repath_cooldown > 0.0 or has_pending_click_move_target or has_pending_click_screen_point


func _queue_click_screen_point(screen_point: Vector2) -> void:
	pending_click_screen_point = screen_point
	has_pending_click_screen_point = true


func _resolve_pending_click_screen_point() -> void:
	if not has_pending_click_screen_point:
		return
	var screen_point := pending_click_screen_point
	has_pending_click_screen_point = false
	_resolve_click_screen_point(screen_point)


func _resolve_click_screen_point(screen_point: Vector2) -> void:
	click_move_screen_resolve_count += 1
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
	_close_map_panel()
	_close_chat_panel()
	_close_player_action_panel(false)
	var clicked_cell := IsoMapModel.world_to_grid(map_data, world_point)
	if not IsoMapModel.is_inside(map_data, clicked_cell):
		return
	_request_click_move_target(clicked_cell, IsoMapModel.grid_to_world(map_data, clicked_cell), clicked_cell)


func _request_click_move_target(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> void:
	if _click_move_target_matches_current(goal_cell, marker_cell):
		return
	pending_click_move_goal_cell = goal_cell
	pending_click_move_marker_cell = marker_cell
	pending_click_move_marker_point = marker_point
	has_pending_click_move_target = true
	if click_move_repath_cooldown <= 0.0:
		_apply_pending_click_move_target()


func _update_pending_click_move(delta: float) -> void:
	if click_move_repath_cooldown > 0.0:
		click_move_repath_cooldown = maxf(0.0, click_move_repath_cooldown - delta)
	if has_pending_click_screen_point and click_move_repath_cooldown <= 0.0:
		_resolve_pending_click_screen_point()
	if has_pending_click_move_target and click_move_repath_cooldown <= 0.0:
		_apply_pending_click_move_target()
	_update_server_step_move()


func _apply_pending_click_move_target() -> void:
	if not has_pending_click_move_target:
		return
	var goal_cell := pending_click_move_goal_cell
	var marker_cell := pending_click_move_marker_cell
	var marker_point := pending_click_move_marker_point
	has_pending_click_move_target = false
	if _click_move_target_matches_current(goal_cell, marker_cell):
		return
	click_move_repath_apply_count += 1
	_set_click_move_target_cell(goal_cell, marker_point, marker_cell)
	click_move_repath_cooldown = CLICK_MOVE_REPATH_INTERVAL_SECONDS


func _click_move_target_matches_current(goal_cell: Vector2i, marker_cell: Vector2i) -> bool:
	if has_pending_click_move_target and pending_click_move_goal_cell == goal_cell and pending_click_move_marker_cell == marker_cell:
		return true
	return has_target_cell and target_cell == marker_cell and not current_path_cells.is_empty()


func _clear_pending_click_move_target(reset_cooldown: bool = true) -> void:
	has_pending_click_screen_point = false
	has_pending_click_move_target = false
	if reset_cooldown:
		click_move_repath_cooldown = 0.0


func _set_click_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	if _current_player_is_party_member():
		_stop_party_member_local_movement(true)
		return false
	if _should_use_server_step_movement():
		return _set_server_step_move_target_cell(goal_cell, marker_point, marker_cell)
	return _set_move_target_cell(goal_cell, marker_point, marker_cell)


func _should_use_server_step_movement() -> bool:
	return (
		server_step_world_move_enabled
		and _is_server_account_session()
		and player != null
		and not map_data.is_empty()
		and not battle_active
		and not encounter_active
		and not hang_mode_active
	)


func _set_server_step_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	_clear_pending_click_move_target(false)
	if not IsoMapModel.is_inside(map_data, goal_cell):
		return false
	var had_authority := server_step_move_authority_valid
	var start_cell := _server_step_move_current_cell()
	var safe_goal_cell := IsoMapModel.nearest_walkable_cell(map_data, goal_cell)
	server_step_move_plan_id += 1
	server_step_move_last_error_code = ""
	server_step_move_request_count = 0
	server_step_move_ack_count = 0
	server_step_move_sync_retry_count = 0
	if start_cell == safe_goal_cell:
		_cancel_server_step_move(false)
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
	if path_cells.size() < 2:
		_cancel_server_step_move(false)
		player.clear_move_target()
		current_path_cells.clear()
		has_target_marker = false
		has_target_cell = false
		current_path_is_direct = false
		return false
	server_step_move_active = true
	server_step_move_request_pending = false
	server_step_move_waiting_for_visual = false
	server_step_move_path_cells.clear()
	for cell in path_cells:
		server_step_move_path_cells.append(cell)
	server_step_move_path_index = 0
	server_step_move_goal_cell = safe_goal_cell
	server_step_move_marker_cell = marker_cell
	server_step_move_marker_point = marker_point
	server_step_move_visual_target_cell = start_cell
	server_step_move_authority_cell = start_cell
	server_step_move_authority_valid = had_authority
	player.clear_move_target()
	current_path_cells.clear()
	for cell in path_cells:
		current_path_cells.append(cell)
	current_path_is_direct = IsoMapModel.is_direct_path_clear(map_data, start_cell, safe_goal_cell)
	target_cell = marker_cell
	has_target_cell = true
	target_marker = marker_point
	has_target_marker = true
	_request_next_server_step_move(server_step_move_plan_id)
	return true


func _update_server_step_move() -> void:
	if not server_step_move_active:
		return
	if server_step_move_request_pending:
		return
	if server_step_move_waiting_for_visual:
		if player != null and player.is_auto_moving():
			return
		server_step_move_waiting_for_visual = false
		if server_step_move_path_index >= server_step_move_path_cells.size() - 1:
			_finish_server_step_move()
			return
	if server_step_move_path_index < server_step_move_path_cells.size() - 1:
		_request_next_server_step_move(server_step_move_plan_id)
	else:
		_finish_server_step_move()


func _request_next_server_step_move(plan_id: int) -> void:
	if plan_id != server_step_move_plan_id or not server_step_move_active or server_step_move_request_pending:
		return
	if not _is_server_account_session() or server_step_move_path_index >= server_step_move_path_cells.size() - 1:
		return
	if not server_step_move_authority_valid:
		var seeded := await _seed_server_step_move_position(plan_id)
		if not seeded:
			return
	var from_cell := server_step_move_authority_cell
	if server_step_move_path_cells[server_step_move_path_index] != from_cell:
		if not _rebuild_server_step_move_path_from_authority():
			return
	var to_cell := server_step_move_path_cells[server_step_move_path_index + 1]
	server_step_move_request_pending = true
	server_step_move_request_count += 1
	var response := await _auto_http_request_spec(ServerAuthClientModel.movement_step_request(
		_server_profile_base_url(),
		_server_profile_token(),
		{
			"mapId": current_map_id,
			"fromCellX": from_cell.x,
			"fromCellY": from_cell.y,
			"toCellX": to_cell.x,
			"toCellY": to_cell.y,
			"facing": _facing_for_grid_step(from_cell, to_cell),
			"moving": true,
			"aoiRadius": ONLINE_POSITION_AOI_RADIUS_CELLS,
		}
	))
	if plan_id != server_step_move_plan_id:
		return
	server_step_move_request_pending = false
	var parsed := ServerAuthClientModel.parse_movement_step_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		_handle_server_step_move_failure(parsed)
		return
	var position := parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if not _apply_server_step_move_authority_position(position):
		_handle_server_step_move_failure({"code": "movement_position_missing", "message": "服务器位置缺失。"})
		return
	_apply_online_position_players(parsed.get("players", []))
	server_step_move_ack_count += 1
	server_step_move_last_error_code = ""
	var ack_cell := server_step_move_authority_cell
	server_step_move_path_index = mini(server_step_move_path_index + 1, server_step_move_path_cells.size() - 1)
	server_step_move_visual_target_cell = ack_cell
	server_step_move_waiting_for_visual = true
	if player != null:
		var step_points: Array[Vector2] = [IsoMapModel.grid_to_world(map_data, ack_cell)]
		player.set_path(step_points)
	_sync_server_step_current_path_cells()
	queue_redraw()


func _seed_server_step_move_position(plan_id: int) -> bool:
	if not _is_server_account_session() or player == null or map_data.is_empty():
		_cancel_server_step_move()
		return false
	var cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var response := await _auto_http_request_spec(ServerAuthClientModel.player_position_update_request(
		_server_profile_base_url(),
		_server_profile_token(),
		{
			"mapId": current_map_id,
			"cellX": cell.x,
			"cellY": cell.y,
			"facing": player.get_facing_key() if player.has_method("get_facing_key") else "south",
			"moving": false,
			"aoiRadius": ONLINE_POSITION_AOI_RADIUS_CELLS,
		}
	))
	if plan_id != server_step_move_plan_id:
		return false
	var parsed := ServerAuthClientModel.parse_player_position_update_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		server_step_move_last_error_code = str(parsed.get("code", "movement_seed_failed"))
		_cancel_server_step_move()
		return false
	var position := parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	_apply_online_position_players(parsed.get("players", []))
	if not _apply_server_step_move_authority_position(position):
		server_step_move_last_error_code = "movement_seed_missing_position"
		_cancel_server_step_move()
		return false
	return _rebuild_server_step_move_path_from_authority()


func _handle_server_step_move_failure(parsed: Dictionary) -> void:
	server_step_move_last_error_code = str(parsed.get("code", "movement_step_failed"))
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	var movement := parsed.get("movement", {}) as Dictionary if parsed.get("movement", {}) is Dictionary else {}
	var position := parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if position.is_empty():
		position = response.get("position", {}) as Dictionary if response.get("position", {}) is Dictionary else {}
	var synced_position := false
	if not position.is_empty():
		synced_position = _apply_server_step_move_authority_position(position, true)
	var retryable := bool(movement.get("retryable", server_step_move_last_error_code == "movement_origin_mismatch"))
	if (
		retryable
		and synced_position
		and server_step_move_sync_retry_count < SERVER_STEP_MOVE_MAX_SYNC_RETRIES
	):
		server_step_move_sync_retry_count += 1
		if _rebuild_server_step_move_path_from_authority():
			_request_next_server_step_move(server_step_move_plan_id)
			return
	_cancel_server_step_move()
	if player != null:
		player.clear_move_target()
	current_path_cells.clear()
	has_target_marker = false
	has_target_cell = false
	current_path_is_direct = false
	_set_world_log_message(_server_step_move_failure_message(server_step_move_last_error_code, parsed))
	queue_redraw()


func _finish_server_step_move() -> void:
	if not server_step_move_active:
		return
	server_step_move_active = false
	server_step_move_request_pending = false
	server_step_move_waiting_for_visual = false
	server_step_move_path_index = maxi(0, server_step_move_path_cells.size() - 1)
	_sync_server_step_current_path_cells()
	_publish_server_step_move_stop(server_step_move_plan_id)


func _publish_server_step_move_stop(plan_id: int) -> void:
	if not _is_server_account_session() or not server_step_move_authority_valid:
		return
	var cell := server_step_move_authority_cell
	var response := await _auto_http_request_spec(ServerAuthClientModel.player_position_update_request(
		_server_profile_base_url(),
		_server_profile_token(),
		{
			"mapId": current_map_id,
			"cellX": cell.x,
			"cellY": cell.y,
			"facing": player.get_facing_key() if player != null and player.has_method("get_facing_key") else "south",
			"moving": false,
			"aoiRadius": ONLINE_POSITION_AOI_RADIUS_CELLS,
		}
	))
	if plan_id != server_step_move_plan_id:
		return
	var parsed := ServerAuthClientModel.parse_player_position_update_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		_apply_server_step_move_authority_position(parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {})
		_apply_online_position_players(parsed.get("players", []))


func _cancel_server_step_move(invalidate_plan: bool = true) -> void:
	if invalidate_plan:
		server_step_move_plan_id += 1
	server_step_move_active = false
	server_step_move_request_pending = false
	server_step_move_waiting_for_visual = false
	server_step_move_path_cells.clear()
	server_step_move_path_index = 0
	server_step_move_sync_retry_count = 0


func _server_step_move_current_cell() -> Vector2i:
	if server_step_move_authority_valid and current_map_id != "":
		return server_step_move_authority_cell
	if player != null and not map_data.is_empty():
		return IsoMapModel.world_to_grid(map_data, player.global_position)
	return Vector2i.ZERO


func _server_step_move_should_report_authority_cell() -> bool:
	return (
		_is_server_account_session()
		and server_step_move_authority_valid
		and (
			server_step_move_active
			or server_step_move_request_pending
			or server_step_move_waiting_for_visual
		)
	)


func _apply_server_step_move_authority_position(position: Dictionary, snap_player_to_authority: bool = false) -> bool:
	if position.is_empty():
		return false
	var map_id := str(position.get("mapId", current_map_id))
	var authority := str(position.get("authority", "")).strip_edges()
	var changed_map := map_id != current_map_id
	if changed_map:
		if authority != "party_follow" or not snap_player_to_authority:
			return false
		if not _load_map(map_id):
			return false
		_set_world_log_message("已跟随队长切换地图。")
	server_step_move_authority_cell = Vector2i(int(position.get("cellX", 0)), int(position.get("cellY", 0)))
	server_step_move_authority_valid = true
	if snap_player_to_authority:
		if authority == "party_follow" and not changed_map:
			_set_party_follow_move_target(server_step_move_authority_cell)
		else:
			_snap_player_to_server_step_authority()
	return true


func _snap_player_to_server_step_authority() -> void:
	if player == null or map_data.is_empty() or not server_step_move_authority_valid:
		return
	player.clear_move_target()
	player.global_position = IsoMapModel.grid_to_world(map_data, server_step_move_authority_cell)


func _set_party_follow_move_target(authority_cell: Vector2i) -> void:
	if player == null or map_data.is_empty():
		return
	var target_cell := IsoMapModel.nearest_walkable_cell(map_data, authority_cell)
	var target_point := IsoMapModel.grid_to_world(map_data, target_cell)
	var start_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	if start_cell == target_cell or player.global_position.distance_to(target_point) <= 4.0:
		player.global_position = target_point
		player.clear_move_target()
		current_path_cells.clear()
		current_path_is_direct = false
		has_target_marker = false
		has_target_cell = false
		_clear_pending_click_move_target()
		queue_redraw()
		return
	var path_cells: Array[Vector2i] = IsoMapModel.find_path(map_data, start_cell, target_cell)
	var path_points: Array[Vector2] = IsoMapModel.path_to_world_points(map_data, path_cells, false)
	if path_points.is_empty():
		player.global_position = target_point
		player.clear_move_target()
		current_path_cells.clear()
		current_path_is_direct = false
		has_target_marker = false
		has_target_cell = false
		_clear_pending_click_move_target()
		queue_redraw()
		return
	player.set_path(path_points)
	current_path_cells = path_cells
	current_path_is_direct = IsoMapModel.is_direct_path_clear(map_data, start_cell, target_cell)
	has_target_marker = false
	has_target_cell = false
	_clear_pending_click_move_target()
	queue_redraw()


func _server_step_move_failure_message(code: String, parsed: Dictionary) -> String:
	match code:
		"movement_battle_locked":
			return "切磋中不能移动。"
		"movement_party_member_locked":
			return "队伍中由队长带队移动。"
		"movement_position_missing", "movement_map_missing":
			return "位置待同步，请重新点击。"
		"movement_map_mismatch":
			return "地图已同步，请重新点击。"
		"movement_noop":
			return "已经在目标位置。"
		"movement_origin_mismatch", "movement_step_too_far":
			return "位置已同步，请重新点击。"
	var message := str(parsed.get("message", ""))
	if message != "":
		return message
	return "移动未完成，请重新点击。"


func _rebuild_server_step_move_path_from_authority() -> bool:
	if not server_step_move_active or not server_step_move_authority_valid:
		_cancel_server_step_move()
		return false
	var path_cells: Array[Vector2i] = IsoMapModel.find_path(map_data, server_step_move_authority_cell, server_step_move_goal_cell)
	if path_cells.size() < 2:
		_cancel_server_step_move()
		return false
	server_step_move_path_cells.clear()
	for cell in path_cells:
		server_step_move_path_cells.append(cell)
	server_step_move_path_index = 0
	current_path_cells.clear()
	for cell in path_cells:
		current_path_cells.append(cell)
	current_path_is_direct = IsoMapModel.is_direct_path_clear(map_data, server_step_move_authority_cell, server_step_move_goal_cell)
	return true


func _sync_server_step_current_path_cells() -> void:
	current_path_cells.clear()
	for index in range(server_step_move_path_index, server_step_move_path_cells.size()):
		current_path_cells.append(server_step_move_path_cells[index])


func _facing_for_grid_step(from_cell: Vector2i, to_cell: Vector2i) -> String:
	var delta := to_cell - from_cell
	if delta.x > 0 and delta.y < 0:
		return "northeast"
	if delta.x > 0 and delta.y > 0:
		return "southeast"
	if delta.x < 0 and delta.y < 0:
		return "northwest"
	if delta.x < 0 and delta.y > 0:
		return "southwest"
	if delta.x > 0:
		return "east"
	if delta.x < 0:
		return "west"
	if delta.y < 0:
		return "north"
	if delta.y > 0:
		return "south"
	return player.get_facing_key() if player != null and player.has_method("get_facing_key") else "south"


func _set_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	_cancel_server_step_move()
	_clear_pending_click_move_target(false)
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
	_close_map_panel()
	_close_chat_panel()
	pending_interaction = item.duplicate(true)
	has_pending_interaction = true
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	pending_interaction_approach_cell = InteractionModel.interaction_goal_cell_for(map_data, player_cell, item)
	var marker_point := InteractionModel.marker_world_position(map_data, item)
	var moved := _set_move_target_cell(pending_interaction_approach_cell, marker_point, InteractionModel.cell_for(item))
	if not moved:
		_complete_interaction(item)


func _clear_pending_interaction() -> void:
	var had_pending := has_pending_interaction or not pending_interaction.is_empty() or pending_interaction_approach_cell != Vector2i.ZERO
	has_pending_interaction = false
	pending_interaction.clear()
	pending_interaction_approach_cell = Vector2i.ZERO
	if had_pending:
		_refresh_task_route_button()


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
	if hang_heal_resume_active:
		call_deferred("_update_hang_heal_resume_route")


func _start_guardian_battle_from_dialog() -> void:
	if active_dialog_interaction.is_empty():
		return
	var interaction := active_dialog_interaction.duplicate(true)
	var zone := _guardian_zone_for_interaction(interaction)
	if zone.is_empty():
		_set_world_log_message("暂时无法挑战%s。" % str(interaction.get("name", "守护兽")))
		_update_dialog_text()
		return
	var route := _guardian_battle_route_for_current_session()
	if route == "server_member_block":
		_set_world_log_message("队伍挑战由队长发起。")
		_update_dialog_text()
		return
	if route == "login_required":
		_set_world_log_message("请先登录服务器账号。")
		_update_dialog_text()
		return
	_close_dialog()
	if player != null:
		player.clear_move_target()
	_clear_navigation_state()
	active_encounter_zone.clear()
	encounter_active = false
	var source_name := str(interaction.get("name", "守护兽")).strip_edges()
	if source_name == "":
		source_name = "守护兽"
	zone["sourceInteractionId"] = str(interaction.get("id", ""))
	zone["sourceInteractionName"] = source_name
	zone["interactionId"] = str(interaction.get("id", ""))
	if route == "server":
		_start_server_party_encounter(
			zone,
			"挑战%s，正在同步。" % source_name,
			"%s挑战开始。" % source_name,
			"挑战同步失败，请重试。"
		)
		return
	var enemy_count := EncounterModel.enemy_count(zone, _encounter_enemy_count_fallback())
	var selected_zone := EncounterModel.zone_with_selected_wild_pet(zone, encounter_rng, enemy_count)
	var guardian_state := _battle_state_for_encounter_zone(selected_zone)
	guardian_state["sourceInteractionId"] = str(interaction.get("id", ""))
	guardian_state["sourceInteractionName"] = source_name
	_start_battle(guardian_state)


func _guardian_battle_route_for_current_session() -> String:
	if _should_start_server_party_encounter():
		return "server"
	if _is_server_account_session():
		return "server_member_block"
	if not _can_start_local_encounter_model():
		return "login_required"
	return "local"


func _guardian_zone_for_interaction(item: Dictionary) -> Dictionary:
	var zone_id := str(item.get("encounterZoneId", "")).strip_edges()
	if zone_id != "":
		var zone := _encounter_zone_by_id(zone_id)
		if not zone.is_empty():
			return zone
	var group_id := str(item.get("encounterGroupId", "")).strip_edges()
	if group_id != "":
		var group_zone := _encounter_zone_for_group(map_data, group_id)
		if not group_zone.is_empty():
			return group_zone
	if item.has("fixedWildPets") or item.has("wildPetPool") or item.has("wildPetPoolSource"):
		return item.duplicate(true)
	return {}


func _update_encounter_zone_check() -> void:
	if player == null or map_data.is_empty() or encounter_active or battle_active or server_party_encounter_request_pending or _dialog_is_open() or has_pending_interaction or _world_menu_is_open():
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
	if encounter_active or battle_active or server_party_encounter_request_pending or zone.is_empty():
		return
	player.clear_move_target()
	_clear_navigation_state()
	if _should_start_server_party_encounter():
		_start_server_party_encounter(zone)
		return
	if _is_server_account_session():
		_set_world_log_message(_server_encounter_block_message())
		return
	if not _can_start_local_encounter_model():
		_set_world_log_message("请先登录服务器账号。")
		return
	active_encounter_zone = EncounterModel.zone_with_selected_wild_pet(zone, encounter_rng, _encounter_enemy_count_fallback())
	encounter_active = true
	_start_battle(_battle_state_for_encounter_zone(active_encounter_zone))


func _should_start_server_party_encounter() -> bool:
	if not _is_server_account_session():
		return false
	var party_value = party_current_state.get("party", null)
	if not (party_value is Dictionary):
		return true
	return _current_party_role() == "leader"


func _can_start_local_encounter_model() -> bool:
	var party_value = party_current_state.get("party", null)
	if party_value is Dictionary:
		return false
	if _is_server_account_session():
		return false
	return auth_auto_bypass or account_authenticated


func _server_encounter_block_message() -> String:
	if _current_player_is_party_member():
		return "队伍中只有队长可以触发遇敌。"
	if party_current_state.get("party", null) is Dictionary:
		return "队伍状态未同步，暂不能触发遇敌。"
	return "当前状态不能触发遇敌，请稍后再试。"


func _start_server_party_encounter(zone: Dictionary, pending_message: String = "遭遇野生宠物，正在同步。", success_message: String = "", failure_message: String = "遇敌同步失败，请重试。") -> void:
	if server_party_encounter_request_pending or battle_active or zone.is_empty():
		return
	active_encounter_zone = EncounterModel.zone_with_selected_wild_pet(zone, encounter_rng, _encounter_enemy_count_fallback())
	var enemy_count := EncounterModel.enemy_count(active_encounter_zone, _encounter_enemy_count_fallback())
	server_party_encounter_request_pending = true
	_set_world_log_message(pending_message)
	var response := await _auto_http_request_spec(ServerAuthClientModel.party_battle_encounter_request(
		_server_profile_base_url(),
		_server_profile_token(),
		active_encounter_zone,
		enemy_count
	))
	server_party_encounter_request_pending = false
	if battle_active:
		active_encounter_zone.clear()
		return
	var parsed := ServerAuthClientModel.parse_battle_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		var room = parsed.get("room", null)
		active_encounter_zone.clear()
		if room is Dictionary:
			var message := success_message.strip_edges()
			if message == "":
				message = str(parsed.get("message", "遭遇了野生宠物。"))
			_set_world_log_message(message)
			_apply_server_battle_room_state(room as Dictionary, true)
		else:
			_set_world_log_message("战斗房间缺失，请重试。")
		return
	active_encounter_zone.clear()
	_set_world_log_message(str(parsed.get("message", failure_message)))


func _encounter_enemy_count_fallback() -> int:
	return 10 if _effective_battle_team_character_count() > 1 else 1


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
	if bool(next_battle_state.get("serverAuthority", false)):
		battle_state = next_battle_state.duplicate(true)
		server_battle_pending_closed_room.clear()
	else:
		battle_state = _local_battle_state_with_current_team(next_battle_state.duplicate(true))
	_refresh_battle_target_seed()
	battle_active = true
	server_battle_command_request_active = false
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
	if not battle_state.has("guardingActorIds"):
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
	_reset_battle_command_countdown()
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
	server_battle_command_request_active = false
	server_battle_pending_closed_room.clear()
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
	battle_command_countdown_remaining = BATTLE_COMMAND_COUNTDOWN_SECONDS
	battle_command_countdown_last_second = -1
	_sync_battle_round_timer_labels(true)
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
	if bool(battle_state.get("serverAuthority", false)):
		return _finish_server_battle_from_closed_room(_server_battle_closed_room_from_state())
	if _server_account_local_battle_writeback_blocked():
		return _finish_local_battle_without_profile_writeback_for_server_account()
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
	var captured_count := _captured_pet_count_from_battle_result(result)
	var route_to_healer_after_battle := false
	if _hang_activity_active() or bool(PlayerProgressModel.hang_session(player_profile).get(HangSettingsModel.SESSION_ENABLED_KEY, false)):
		player_profile = PlayerProgressModel.record_hang_battle_finished(player_profile, captured_count)
		if PlayerProgressModel.hang_capture_target_reached(player_profile):
			_stop_hang_activity("", true)
			player_profile = PlayerProgressModel.stop_hang_session(player_profile, "capture_target")
			log_lines.append("捕宠目标已完成，挂机停止。")
	var quest_lines := _quest_messages_for_battle_result(ended_state, result)
	for line in quest_lines:
		log_lines.append(line)
	if hang_stop_message != "":
		var hang_settings := PlayerProgressModel.hang_settings(player_profile)
		var low_hp_action := str(hang_settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP))
		var resume_after_heal := bool(hang_settings.get(HangSettingsModel.RESUME_AFTER_HEAL_KEY, true))
		_stop_hang_activity("", true)
		if low_hp_action == HangSettingsModel.LOW_HP_ACTION_TOWN_HEAL:
			var session := PlayerProgressModel.hang_session(player_profile)
			session = HangSettingsModel.session_with_pending_resume(session, resume_after_heal)
			player_profile = PlayerProgressModel.with_hang_session(player_profile, session)
			route_to_healer_after_battle = true
		log_lines.append(hang_stop_message)
	if profile_save_enabled:
		_save_player_profile_now()
	if bool(result.get("returnToRecordPoint", player_knocked_away)):
		_return_player_to_record_point_after_knockaway(log_lines)
	else:
		_end_battle(true)
	_set_world_log_message("\n".join(log_lines))
	if route_to_healer_after_battle:
		call_deferred("_route_to_hang_healer")
	return result


func _server_account_local_battle_writeback_blocked() -> bool:
	return _is_server_account_session() and not auth_auto_bypass


func _finish_local_battle_without_profile_writeback_for_server_account() -> Dictionary:
	var message := "服务器账号战斗需由服务器结算，本地战斗结果未写入档案。"
	_end_battle(true)
	_set_world_log_message(message)
	_queue_server_profile_pull()
	return {
		"ok": false,
		"blocked": true,
		"code": "server_local_battle_writeback_blocked",
		"profile": player_profile,
		"logLines": [message],
		"message": message,
	}


func _captured_pet_count_from_battle_result(result: Dictionary) -> int:
	var captured_values = result.get("capturedPets", [])
	return (captured_values as Array).size() if captured_values is Array else 0


func _route_to_hang_healer() -> void:
	if battle_active:
		return
	var target := _navigation_target_for_interaction_id("firebud_doctor")
	if target.is_empty():
		_set_world_log_message("暂时找不到村医，挂机已停止。")
		return
	_route_to_quest_target(target)


func _return_player_to_record_point_after_knockaway(log_lines: Array[String]) -> void:
	var returned := _return_player_to_record_point()
	log_lines.append("见习猎人被击飞，回到记录点「%s」。" % str(returned.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL)))


func _return_player_to_record_point() -> Dictionary:
	var point := PlayerProgressModel.record_point(player_profile)
	var map_id := str(point.get("mapId", PlayerProgressModel.DEFAULT_RECORD_POINT_MAP_ID))
	var spawn_name := str(point.get("spawnName", PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME))
	var label := str(point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	if not _load_map(map_id, spawn_name):
		map_id = PlayerProgressModel.DEFAULT_RECORD_POINT_MAP_ID
		spawn_name = PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME
		label = PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL
		_load_map(map_id, spawn_name)
	return {
		"mapId": map_id,
		"spawnName": spawn_name,
		"label": label,
	}


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
		if battle_player_zero_hp_seen or player_hp <= 0:
			var death_settings := PlayerProgressModel.hang_settings(player_profile)
			if str(death_settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP)) == HangSettingsModel.LOW_HP_ACTION_TOWN_HEAL:
				return "人物倒下过，正在回村治疗。"
			return "人物倒下过，挂机已停止。"
		return ""
	var hp_percent := float(maxi(0, player_hp)) / float(player_max_hp) * 100.0
	if hp_percent < float(threshold):
		var low_hp_settings := PlayerProgressModel.hang_settings(player_profile)
		if str(low_hp_settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP)) == HangSettingsModel.LOW_HP_ACTION_TOWN_HEAL:
			return "人物生命低于%d%%，正在回村治疗。" % threshold
		return "人物生命低于%d%%，挂机已停止。" % threshold
	return ""


func _sync_profile_capture_tools_from_battle_state(save_after: bool = true) -> void:
	if battle_state.is_empty():
		return
	player_profile = PlayerProgressModel.with_capture_tool_inventory(player_profile, BattleModel.capture_tool_inventory(battle_state))
	if save_after and profile_save_enabled:
		_save_player_profile_now()


func _sync_profile_battle_items_from_battle_state(save_after: bool = true) -> void:
	if battle_state.is_empty():
		return
	var bag = battle_state.get("itemBag", {})
	if not (bag is Dictionary):
		return
	player_profile = PlayerProgressModel.with_battle_item_inventory(player_profile, bag as Dictionary)
	if save_after and profile_save_enabled:
		_save_player_profile_now()


func _quest_messages_for_battle_result(ended_state: Dictionary, result: Dictionary) -> Array[String]:
	var messages: Array[String] = []
	if str(result.get("result", "")) == "victory":
		var group_id := str(ended_state.get("sourceEncounterGroupId", ended_state.get("encounterGroupId", "")))
		var interaction_id := str(ended_state.get("sourceInteractionId", ""))
		messages.append_array(_record_quest_event_and_maybe_claim({
			"type": "battle_victory",
			"encounterGroupId": group_id,
			"interactionId": interaction_id,
		}))
		if interaction_id != "":
			messages.append_array(_record_quest_event_and_maybe_claim({
				"type": "defeat_npc",
				"encounterGroupId": group_id,
				"interactionId": interaction_id,
				"targetId": interaction_id,
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
	if _is_server_account_session() and not auth_auto_bypass:
		_queue_server_quest_record_event(event)
		return messages
	if _local_profile_mutation_blocked_for_server_only("任务进度", false):
		messages.append("任务进度需要连接服务器后同步。")
		return messages
	var progress_result := PlayerProgressModel.record_quest_event(player_profile, event)
	player_profile = progress_result.get("profile", player_profile)
	if not bool(progress_result.get("changed", false)):
		return messages
	_mark_progress_ui_caches_dirty()
	if bool(progress_result.get("ready", false)) and PlayerProgressModel.active_quest_auto_claim(player_profile):
		var claim_result := PlayerProgressModel.claim_active_quest(player_profile)
		player_profile = claim_result.get("profile", player_profile)
		_mark_progress_ui_caches_dirty()
		messages.append(str(claim_result.get("message", "")))
	else:
		messages.append(str(progress_result.get("message", "")))
	var filtered: Array[String] = []
	for message in messages:
		var text := message.strip_edges()
		if text != "":
			filtered.append(text)
	return filtered


func _queue_server_quest_record_event(event: Dictionary, quest_id: String = "") -> void:
	_server_sync().queue_server_quest_record_event(event, quest_id)


func _process_server_quest_record_event_queue() -> void:
	await _server_sync().process_server_quest_record_event_queue()


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
	_refresh_battle_message_controls()
	if hud_root != null:
		_layout_hud()
	queue_redraw()


func _show_exp_pill_starter_notice_if_needed() -> void:
	var notice := PlayerProgressModel.exp_pill_starter_notice(player_profile)
	if notice != "" and world_log_message != notice:
		_set_world_log_message(notice)


func _save_profile_after_exp_pill_starter_update() -> void:
	# Startup normalization must never rewrite the live save by itself.
	# Real player actions persist explicitly through their own save paths.
	return


func _toggle_battle_message_expanded() -> void:
	battle_message_expanded = not battle_message_expanded
	_refresh_battle_message_controls()
	_layout_hud()


func _clear_world_log_panel() -> void:
	world_log_history.clear()
	world_log_message = ""
	if battle_log_label != null:
		battle_log_label.text = ""
	if battle_message_panel != null:
		battle_message_panel.visible = battle_active
	_refresh_battle_message_controls()
	_layout_hud()


func _refresh_battle_message_controls() -> void:
	if battle_message_expand_button != null:
		battle_message_expand_button.text = "收起" if battle_message_expanded else "展开"
	if battle_message_clear_button != null:
		battle_message_clear_button.disabled = world_log_history.is_empty()


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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	backpack_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_save_profile_after_exp_pill_starter_update()
	_show_exp_pill_starter_notice_if_needed()
	_refresh_backpack_panel()
	_layout_hud()


func _close_backpack_panel() -> void:
	backpack_pending_use_item_id = ""
	var changed := _hide_control(backpack_panel)
	if changed:
		_apply_deferred_server_profile_pull_if_idle()


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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_equipment_synthesis_panel(false)
	equipment_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_equipment_panel()
	_layout_hud()


func _close_equipment_panel() -> void:
	var changed := _hide_control(equipment_panel, false)
	changed = _hide_control(equipment_synthesis_panel, false) or changed
	if changed and hud_root != null:
		_layout_hud()


func _open_equipment_synthesis_panel() -> void:
	if battle_active:
		return
	_set_hang_mode(false)
	_close_dialog()
	_close_encounter()
	_close_player_status_panel()
	_close_backpack_panel()
	if equipment_panel != null:
		equipment_panel.visible = false
	_close_shop_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	if equipment_synthesis_panel != null:
		equipment_synthesis_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_equipment_synthesis_panel()
	_layout_hud()


func _close_equipment_synthesis_panel(update_layout: bool = true) -> void:
	_hide_control(equipment_synthesis_panel, update_layout)


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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_player_rebirth_preview_panel(false)
	player_status_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_player_status_panel()
	_layout_hud()


func _close_player_status_panel() -> void:
	_flush_profile_save_now()
	player_status_refresh_pending = false
	_hide_control(player_status_panel)


func _open_player_rebirth_preview_panel() -> void:
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if player_rebirth_preview_panel != null:
		player_rebirth_preview_panel.visible = true
	player_rebirth_confirm_pending = false
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_player_rebirth_preview_panel()
	_layout_hud()


func _close_player_rebirth_preview_panel(update_layout: bool = true) -> void:
	player_rebirth_confirm_pending = false
	_hide_control(player_rebirth_preview_panel, update_layout)


func _on_player_status_equipment_pressed() -> void:
	_close_player_status_panel()
	_open_equipment_panel()


func _on_player_status_allocate_pressed(stat_key: String) -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("player_stat_allocate", {"statKey": stat_key}, "分配属性点失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_request_player_status_refresh()
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("分配属性点"):
		return
	var result := PlayerProgressModel.allocate_player_stat_point_fast(player_profile, stat_key)
	player_profile = result.get("profile", player_profile)
	var ok := bool(result.get("ok", false))
	if ok and profile_save_enabled:
		_request_profile_save(0.35)
	_request_player_status_refresh()
	if not ok:
		_set_world_log_message(str(result.get("message", "")))
		_update_hud_text()


func _request_player_status_refresh() -> void:
	if player_status_panel == null or not player_status_panel.visible:
		return
	if player_status_refresh_pending:
		return
	player_status_refresh_pending = true
	call_deferred("_flush_player_status_refresh")


func _flush_player_status_refresh() -> void:
	if not player_status_refresh_pending:
		return
	player_status_refresh_pending = false
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()


func _refresh_player_status_panel() -> void:
	if player_status_panel == null or player_status_detail_label == null:
		return
	player_status_refresh_pending = false
	player_status_refresh_debug_count += 1
	var player_dict := player_profile.get("player", {}) as Dictionary
	var raw_base := player_dict.get("baseStats", {}) as Dictionary
	var base := {}
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		base[stat_key] = maxi(1, int(raw_base.get(stat_key, PlayerProgressModel.DEFAULT_PLAYER_BATTLE_STATS.get(stat_key, 1))))
	var slots := _equipment_slots_for_ui()
	var durability := _equipment_durability_for_ui()
	var bonus := _equipment_stat_bonus_for_ui(slots, durability)
	var current := {}
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		current[stat_key] = maxi(1, int(base.get(stat_key, 1)) + int(bonus.get(stat_key, 0)))
	var current_max_hp := maxi(1, int(current.get("maxHp", player_dict.get("maxHp", 1))))
	var current_hp := clampi(int(player_dict.get("hp", current_max_hp)), 0, current_max_hp)
	var level := maxi(1, int(player_dict.get("level", 1)))
	var exp := maxi(0, int(player_dict.get("exp", 0)))
	var next_exp := maxi(1, int(player_dict.get("nextExp", PlayerProgressModel.exp_to_next_level(level))))
	var stat_points := maxi(0, int(player_dict.get("statPoints", 0)))
	var lines: Array[String] = [
		"[color=#d7c36a]%s  Lv%d[/color]" % [_bbcode_escape(str(player_dict.get("name", "见习猎人"))), level],
		"生命: %d/%d    经验: %d/%d" % [current_hp, current_max_hp, exp, next_exp],
		"转生: %d转" % _player_rebirth_for_ui(),
		"",
		"[color=#d7c36a]四维[/color]",
		_player_status_stat_line("maxHp", base, bonus, current),
		_player_status_stat_line("attack", base, bonus, current),
		_player_status_stat_line("defense", base, bonus, current),
		_player_status_stat_line("quick", base, bonus, current),
		"",
		"[color=#d7c36a]装备加成[/color]",
		_player_status_bonus_line(bonus),
	]
	lines.append_array(_equipment_effect_summary_lines_for_ui(true, slots, durability))
	lines.append("")
	lines.append("[color=#d7c36a]可用精灵[/color]")
	var spirit_entries := _equipment_spirit_source_entries_for_ui(slots, durability)
	if spirit_entries.is_empty():
		lines.append("无")
	else:
		for entry in spirit_entries:
			lines.append("%s：%s" % [
			_bbcode_escape(str(entry.get("spiritLabel", "精灵"))),
			_bbcode_escape(_equipment_spirit_sources_text(entry)),
			])
	lines.append("")
	for growth_line in PlayerProgressModel.player_growth_summary_lines(player_profile):
		lines.append(str(growth_line))
	var point_value = player_profile.get(PlayerProgressModel.RECORD_POINT_KEY, {})
	var point := point_value as Dictionary if point_value is Dictionary else {}
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
	if player_status_rebirth_button != null:
		player_status_rebirth_button.text = "转生预览"
		player_status_rebirth_button.disabled = false


func _refresh_player_rebirth_preview_panel() -> void:
	if player_rebirth_preview_panel == null or player_rebirth_preview_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var raw_lines := PlayerProgressModel.rebirth_preview_lines(player_profile)
	var lines: Array[String] = []
	for raw_line in raw_lines:
		var line := str(raw_line)
		var escaped := _bbcode_escape(line)
		if line == "转生预览":
			lines.append("[color=#d7c36a]%s[/color]" % escaped)
		elif line == "资格: 可转生":
			lines.append("[color=#84d46b]%s[/color]" % escaped)
		elif line == "资格: 未满足":
			lines.append("[color=#d96b6b]%s[/color]" % escaped)
		else:
			lines.append(escaped)
	var equipment_warning_lines := _rebirth_equipment_warning_lines_for_ui()
	if not equipment_warning_lines.is_empty():
		lines.append("")
		lines.append_array(equipment_warning_lines)
	player_rebirth_preview_label.text = "\n".join(lines)
	if player_rebirth_execute_button != null:
		var preview := PlayerProgressModel.rebirth_preview(player_profile)
		var can_execute := bool(preview.get("ok", false))
		player_rebirth_execute_button.disabled = player_rebirth_request_pending or not can_execute
		if player_rebirth_request_pending:
			player_rebirth_execute_button.text = "转生中"
		else:
			player_rebirth_execute_button.text = "确认转生" if player_rebirth_confirm_pending and can_execute else "执行转生"


func _on_player_rebirth_execute_pressed() -> void:
	if player_rebirth_request_pending:
		return
	var preview := PlayerProgressModel.rebirth_preview(player_profile)
	if not bool(preview.get("ok", false)):
		player_rebirth_confirm_pending = false
		_refresh_player_rebirth_preview_panel()
		return
	if not player_rebirth_confirm_pending:
		player_rebirth_confirm_pending = true
		_refresh_player_rebirth_preview_panel()
		_set_world_log_message("再次点击确认转生。")
		return
	if _is_server_account_session():
		await _submit_server_player_rebirth()
		return
	if _local_profile_mutation_blocked_for_server_only("人物转生"):
		player_rebirth_confirm_pending = false
		_refresh_player_rebirth_preview_panel()
		return
	var result := PlayerProgressModel.execute_rebirth(player_profile)
	player_profile = result.get("profile", player_profile)
	player_rebirth_confirm_pending = false
	var log_text := str(result.get("message", ""))
	if bool(result.get("ok", false)):
		var returned := _return_player_to_record_point()
		if log_text != "":
			log_text += "\n"
		log_text += "转生后已回到记录点「%s」。" % str(returned.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	_set_world_log_message(log_text)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_refresh_player_rebirth_preview_panel()
	_update_hud_text()


func _submit_server_player_rebirth() -> void:
	if not _is_server_account_session():
		return
	player_rebirth_request_pending = true
	_refresh_player_rebirth_preview_panel()
	var response := await _auto_http_request_spec(ServerAuthClientModel.player_rebirth_request(
		_server_profile_base_url(),
		_server_profile_token()
	))
	player_rebirth_request_pending = false
	if not _is_server_account_session():
		return
	var parsed := ServerAuthClientModel.parse_player_rebirth_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "转生失败。"))]
	if bool(parsed.get("ok", false)):
		player_rebirth_confirm_pending = false
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			var return_entry := parsed.get("returnEntry", {}) as Dictionary if parsed.get("returnEntry", {}) is Dictionary else {}
			var record_point := return_entry.get("recordPoint", {}) as Dictionary if return_entry.get("recordPoint", {}) is Dictionary else {}
			var point_label := str(record_point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
			if point_label != "":
				log_lines.append("转生后已回到记录点「%s」。" % point_label)
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			_mark_progress_ui_caches_dirty()
			_queue_server_profile_pull()
		else:
			log_lines = ["转生成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		player_rebirth_confirm_pending = false
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_refresh_player_rebirth_preview_panel()
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()
	_refresh_quick_bar()
	_set_world_log_message("\n".join(log_lines))
	if status_label != null:
		_update_hud_text()


func _submit_server_quest_record(event: Dictionary, quest_id: String = "") -> Dictionary:
	return await _server_sync().submit_server_quest_record(event, quest_id)


func _submit_server_quest_claim(quest_id: String = "", reward_choice_id: String = "") -> Dictionary:
	return await _server_sync().submit_server_quest_claim(quest_id, reward_choice_id)


func _apply_server_quest_action_result(parsed: Dictionary, fallback_message: String) -> Dictionary:
	return _server_sync().apply_server_quest_action_result(parsed, fallback_message)


func _submit_server_profile_action(action: String, payload: Dictionary = {}, fallback_message: String = "档案操作失败。") -> Dictionary:
	return await _server_sync().submit_server_profile_action(action, payload, fallback_message)


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


func _equipment_spirit_sources_for_id(spirit_id: String) -> String:
	for entry in PlayerProgressModel.equipment_spirit_source_entries(player_profile):
		if str(entry.get("spiritId", "")) == spirit_id:
			return _equipment_spirit_sources_text(entry as Dictionary)
	return ""


func _equipment_spirit_label_with_source(spirit_id: String) -> String:
	var label := BattleActionCatalog.label_for(spirit_id, spirit_id)
	var source_text := _equipment_spirit_sources_for_id(spirit_id)
	if source_text == "" or source_text == "未知装备":
		return label
	return "%s（%s）" % [label, source_text]


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
		button.add_theme_font_size_override("font_size", 14)
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
			_equipment_slot_button_item_text(slot_id, item_id),
		]
		_apply_equipment_slot_button_color(button, slot_id, item_id)
		var selected_slot_id := slot_id
		button.pressed.connect(func() -> void:
			_select_equipment_slot(selected_slot_id)
		)
		equipment_grid.add_child(button)
		equipment_slot_buttons[slot_id] = button
	_refresh_equipment_detail()


func _equipment_slot_button_item_text(slot_id: String, item_id: String) -> String:
	if item_id == "":
		return "-"
	if slot_id == EquipmentModel.SLOT_EXP_PILL:
		var charge := PlayerProgressModel.equipped_exp_pill_charge(player_profile)
		var level := int(charge.get("level", EquipmentModel.exp_pill_level_for(item_id)))
		return "%s Lv%d" % [EquipmentModel.menu_label_for(item_id, "-"), level]
	var item_label := EquipmentModel.menu_label_for(item_id, "-")
	var enhance_level := PlayerProgressModel.equipment_enhance_level(player_profile, slot_id)
	if enhance_level > 0:
		item_label += " +%d" % enhance_level
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return item_label
	var current := clampi(int(PlayerProgressModel.equipment_durability(player_profile).get(slot_id, max_durability)), 0, max_durability)
	return "%s %s%d/%d" % [
		item_label,
		"损" if current <= 0 else "",
		current,
		max_durability,
	]


func _apply_equipment_slot_button_color(button: Button, slot_id: String, item_id: String) -> void:
	if item_id == "":
		return
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return
	var current := clampi(int(PlayerProgressModel.equipment_durability(player_profile).get(slot_id, max_durability)), 0, max_durability)
	if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
		var inactive_color := Color(1.0, 0.54, 0.42, 1.0)
		button.add_theme_color_override("font_color", inactive_color)
		button.add_theme_color_override("font_hover_color", inactive_color.lightened(0.10))
		button.add_theme_color_override("font_pressed_color", inactive_color)
	elif current <= 0:
		var broken_color := Color(1.0, 0.36, 0.30, 1.0)
		button.add_theme_color_override("font_color", broken_color)
		button.add_theme_color_override("font_hover_color", broken_color.lightened(0.10))
		button.add_theme_color_override("font_pressed_color", broken_color)
	elif current < max_durability:
		var worn_color := Color(1.0, 0.86, 0.42, 1.0)
		button.add_theme_color_override("font_color", worn_color)
		button.add_theme_color_override("font_hover_color", worn_color.lightened(0.08))
		button.add_theme_color_override("font_pressed_color", worn_color)


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
		EquipmentModel.SLOT_EXP_PILL:
			return Rect2(0.05, 0.72, 0.24, 0.24)
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
		lines.append_array(_equipment_slot_recommendation_lines(equipment_selected_slot_id))
	else:
		lines.append(EquipmentModel.label_for(item_id))
		var enhance_text := PlayerProgressModel.equipment_enhance_text(player_profile, equipment_selected_slot_id)
		if enhance_text != "":
			lines.append(enhance_text)
		var durability_text := PlayerProgressModel.equipment_slot_durability_text(player_profile, equipment_selected_slot_id)
		if durability_text != "":
			lines.append(durability_text)
		if not _equipment_slot_meets_requirements_for_ui(equipment_selected_slot_id, item_id):
			lines.append("需求未满足，装备暂不生效。")
		lines.append_array(_equipment_detail_lines_with_requirement_status(item_id, false))
		if equipment_selected_slot_id == EquipmentModel.SLOT_EXP_PILL:
			lines.append_array(_equipment_exp_pill_charge_lines())
		lines.append_array(_equipment_current_spirit_source_lines(equipment_selected_slot_id, item_id))
		lines.append_array(_equipment_unequip_impact_lines(equipment_selected_slot_id))
	equipment_detail_label.text = "\n".join(lines)
	if equipment_unequip_button != null:
		equipment_unequip_button.visible = item_id != ""
		equipment_unequip_button.disabled = item_id == "" or _equipment_slot_unequip_locked(equipment_selected_slot_id)
	if equipment_enhance_button != null:
		var quote := PlayerProgressModel.equipment_enhance_quote(player_profile, equipment_selected_slot_id)
		var can_show_enhance := item_id != "" and EquipmentModel.enhance_max_for(item_id) > 0
		equipment_enhance_button.visible = can_show_enhance
		equipment_enhance_button.disabled = equipment_action_request_pending or not can_show_enhance or not bool(quote.get("ok", false))
		if bool(quote.get("ok", false)):
			equipment_enhance_button.text = "强化中" if equipment_action_request_pending else "强化 +%d" % maxi(1, int(quote.get("nextLevel", 1)))
			equipment_enhance_button.tooltip_text = "%s x%d，%d石币" % [
				BackpackModel.label_for(str(quote.get("materialId", ""))),
				maxi(1, int(quote.get("materialCount", 1))),
				maxi(0, int(quote.get("stoneCost", 0))),
			]
		else:
			equipment_enhance_button.text = "强化"
			equipment_enhance_button.tooltip_text = str(quote.get("message", ""))


func _equipment_slot_recommendation_lines(slot_id: String) -> Array[String]:
	var lines: Array[String] = [
		"",
		"推荐可装备:",
	]
	var counts := _backpack_counts_for_ui()
	var candidates: Array[Dictionary] = []
	for item_id_value in counts.keys():
		var item_id := str(item_id_value)
		var count := int(counts.get(item_id_value, 0))
		if count <= 0:
			continue
		if not EquipmentModel.is_equipment(item_id) or EquipmentModel.slot_for(item_id) != slot_id:
			continue
		var equip_check := _can_equip_item_for_ui(item_id)
		if not bool(equip_check.get("ok", false)):
			continue
		candidates.append({
			"itemId": item_id,
			"count": count,
			"label": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
			"score": _equipment_recommendation_score(item_id),
		})
	if candidates.is_empty():
		lines.append("背包中没有可装备的推荐物品。")
		return lines
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var a_score := int(a.get("score", 0))
		var b_score := int(b.get("score", 0))
		if a_score != b_score:
			return a_score > b_score
		return str(a.get("label", "")).naturalnocasecmp_to(str(b.get("label", ""))) < 0
	)
	var limit := mini(4, candidates.size())
	for index in range(limit):
		var candidate := candidates[index]
		var item_id := str(candidate.get("itemId", ""))
		lines.append("- %s x%d：%s" % [
			str(candidate.get("label", "装备")),
			int(candidate.get("count", 0)),
			_equipment_plain_change_text_for(item_id),
		])
	if candidates.size() > limit:
		lines.append("还有%d件可装备物品。" % (candidates.size() - limit))
	return lines


func _equipment_recommendation_score(item_id: String) -> int:
	var stats := EquipmentModel.stats_for(item_id)
	var score := 0
	for stat_key in EquipmentModel.STAT_KEYS:
		score += int(stats.get(stat_key, 0))
	score += EquipmentModel.spirit_ids_for(item_id).size() * 20
	return score


func _equipment_plain_change_text_for(item_id: String) -> String:
	var preview := _equipment_change_preview_for_ui(item_id)
	if preview.is_empty():
		return "无变化"
	if bool(preview.get("unchanged", false)):
		return "已装备"
	var parts: Array[String] = []
	for change_value in preview.get("statChanges", []):
		if not (change_value is Dictionary):
			continue
		var change := change_value as Dictionary
		var delta := int(change.get("delta", 0))
		if delta == 0:
			continue
		parts.append("%s %s%d" % [
			str(change.get("label", "")),
			"+" if delta > 0 else "",
			delta,
		])
	for spirit_id in preview.get("gainedSpiritIds", []):
		parts.append("获得 %s" % BattleActionCatalog.label_for(str(spirit_id), str(spirit_id)))
	for spirit_id in preview.get("lostSpiritIds", []):
		parts.append("失去 %s" % BattleActionCatalog.label_for(str(spirit_id), str(spirit_id)))
	return "无变化" if parts.is_empty() else "、".join(parts)


func _equipment_current_spirit_source_lines(slot_id: String, item_id: String) -> Array[String]:
	var spirit_ids := EquipmentModel.spirit_ids_for(item_id)
	if spirit_ids.is_empty():
		return []
	if _equipment_slot_is_broken(slot_id, item_id):
		return ["来源精灵: 装备已损坏，精灵暂不可用。"]
	if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
		return ["来源精灵: 需求未满足，精灵暂不可用。"]
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	var parts: Array[String] = []
	for spirit_id in spirit_ids:
		parts.append("%s（%s）" % [
			BattleActionCatalog.label_for(str(spirit_id), str(spirit_id)),
			item_label,
		])
	return ["来源精灵: %s" % "、".join(parts)]


func _equipment_exp_pill_charge_lines() -> Array[String]:
	var charge := PlayerProgressModel.equipped_exp_pill_charge(player_profile)
	if charge.is_empty():
		return []
	var level := int(charge.get("level", 1))
	var exp := int(charge.get("exp", 0))
	var next_exp := int(charge.get("nextExp", PlayerProgressModel.exp_to_next_level(level)))
	if level >= PlayerProgressModel.MAX_PLAYER_LEVEL:
		return ["储存进度: Lv%d 已满" % level]
	return ["储存进度: Lv%d  %d/%d" % [level, exp, next_exp]]


func _equipment_slot_unequip_locked(slot_id: String) -> bool:
	if slot_id != EquipmentModel.SLOT_EXP_PILL:
		return false
	var item_id := PlayerProgressModel.equipped_item_id(player_profile, slot_id)
	if item_id == "":
		return false
	var charge := PlayerProgressModel.equipped_exp_pill_charge(player_profile)
	if charge.is_empty():
		return false
	var base_level := BackpackModel.world_exp_level_for(item_id)
	return int(charge.get("level", base_level)) > base_level or int(charge.get("exp", 0)) > 0


func _equipment_unequip_impact_lines(slot_id: String) -> Array[String]:
	if slot_id == EquipmentModel.SLOT_EXP_PILL:
		var lines := [
			"",
			"经验丹: 人物满级后的溢出经验会存入这里。",
		]
		if _equipment_slot_unequip_locked(slot_id):
			lines.append("已储存经验，暂不能卸下或替换。")
		return lines
	var after_profile := _equipment_profile_without_slot(player_profile, slot_id)
	var before_summary := PlayerProgressModel.player_stat_summary(player_profile)
	var after_summary := PlayerProgressModel.player_stat_summary(after_profile)
	var before_bonus := before_summary.get("bonus", {}) as Dictionary
	var after_bonus := after_summary.get("bonus", {}) as Dictionary
	var stat_parts: Array[String] = []
	for stat_key in EquipmentModel.STAT_KEYS:
		var delta := int(after_bonus.get(stat_key, 0)) - int(before_bonus.get(stat_key, 0))
		if delta == 0:
			continue
		stat_parts.append("%s %s%d" % [
			EquipmentModel.stat_label_for(stat_key),
			"+" if delta > 0 else "",
			delta,
		])
	var before_spirits := PlayerProgressModel.equipment_spirit_ids(player_profile)
	var after_spirits := PlayerProgressModel.equipment_spirit_ids(after_profile)
	var spirit_parts: Array[String] = []
	for spirit_id in before_spirits:
		if not after_spirits.has(spirit_id):
			spirit_parts.append("失去 %s" % BattleActionCatalog.label_for(spirit_id, spirit_id))
	return [
		"",
		"卸下影响",
		"属性: %s" % ("无变化" if stat_parts.is_empty() else "、".join(stat_parts)),
		"精灵: %s" % ("无变化" if spirit_parts.is_empty() else "、".join(spirit_parts)),
	]


func _equipment_profile_without_slot(profile: Dictionary, slot_id: String) -> Dictionary:
	var normalized := PlayerProgressModel.normalize_profile(profile)
	var slots := PlayerProgressModel.equipment_slots(normalized)
	var durability := PlayerProgressModel.equipment_durability(normalized)
	slots.erase(slot_id)
	durability.erase(slot_id)
	normalized[PlayerProgressModel.EQUIPMENT_SLOTS_KEY] = slots
	normalized[PlayerProgressModel.EQUIPMENT_DURABILITY_KEY] = durability
	return PlayerProgressModel.normalize_profile(normalized)


func _equipment_slot_is_broken(slot_id: String, item_id: String) -> bool:
	return _equipment_slot_is_broken_for_ui(slot_id, item_id, _equipment_durability_for_ui())


func _equipment_slot_meets_requirements_for_ui(_slot_id: String, item_id: String) -> bool:
	return (
		_player_level_for_ui() >= EquipmentModel.required_level_for(item_id)
		and _player_rebirth_for_ui() >= EquipmentModel.required_rebirth_for(item_id)
	)


func _equipment_effect_summary_lines_for_ui(use_bbcode: bool = false, slots: Dictionary = {}, durability: Dictionary = {}) -> Array[String]:
	var effective_slots := slots if not slots.is_empty() else _equipment_slots_for_ui()
	var effective_durability := durability if not durability.is_empty() else _equipment_durability_for_ui()
	var active_count := 0
	var inactive_count := 0
	var inactive_parts: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		if slot_id == EquipmentModel.SLOT_EXP_PILL:
			continue
		var item_id := str(effective_slots.get(slot_id, ""))
		if item_id == "":
			continue
		var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
		if _equipment_slot_is_broken_for_ui(slot_id, item_id, effective_durability):
			inactive_count += 1
			inactive_parts.append("%s（已损坏）" % item_label)
		elif not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			inactive_count += 1
			inactive_parts.append("%s（需求未满足）" % item_label)
		else:
			active_count += 1
	var summary := "装备: %d件生效 / %d件未生效" % [active_count, inactive_count]
	var lines: Array[String] = []
	if use_bbcode and inactive_count > 0:
		lines.append("[color=%s]%s[/color]" % [EQUIPMENT_COMPARE_LOSS_COLOR, _bbcode_escape(summary)])
	else:
		lines.append(_bbcode_escape(summary) if use_bbcode else summary)
	if not inactive_parts.is_empty():
		var inactive_text := "未生效: %s" % "、".join(inactive_parts)
		if use_bbcode:
			inactive_text = "[color=%s]%s[/color]" % [EQUIPMENT_COMPARE_LOSS_COLOR, _bbcode_escape(inactive_text)]
		lines.append(inactive_text)
	return lines


func _rebirth_equipment_warning_lines_for_ui() -> Array[String]:
	var preview := PlayerProgressModel.rebirth_preview(player_profile)
	if not bool(preview.get("ok", false)):
		return []
	var after_level := maxi(1, int(preview.get("afterLevel", 1)))
	var after_rebirth := maxi(0, int(preview.get("targetCount", PlayerProgressModel.rebirth_count(player_profile) + 1)))
	var slots := PlayerProgressModel.equipment_slots(player_profile)
	var affected: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		var will_meet := (
			after_level >= EquipmentModel.required_level_for(item_id)
			and after_rebirth >= EquipmentModel.required_rebirth_for(item_id)
		)
		if will_meet:
			continue
		affected.append(EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)))
	if affected.is_empty():
		return []
	return [
		"[color=%s]%s[/color]" % [
			EQUIPMENT_COMPARE_LOSS_COLOR,
			_bbcode_escape("装备影响: 转生后部分装备可能暂不生效。"),
		],
		_bbcode_escape("可能暂不生效: %s" % "、".join(affected)),
	]


func _select_equipment_slot(slot_id: String) -> void:
	equipment_selected_slot_id = slot_id
	_refresh_equipment_panel()


func _on_equipment_unequip_pressed() -> void:
	if _local_profile_mutation_blocked_for_server_only("卸下装备"):
		return
	var result := PlayerProgressModel.unequip_slot(player_profile, equipment_selected_slot_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_panel()
	if status_label != null:
		_update_hud_text()


func _on_equipment_enhance_pressed() -> void:
	if equipment_action_request_pending:
		return
	if _is_server_account_session():
		await _submit_server_equipment_enhance(equipment_selected_slot_id)
		return
	if _local_profile_mutation_blocked_for_server_only("装备强化"):
		return
	var result := PlayerProgressModel.enhance_equipment_slot(player_profile, equipment_selected_slot_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_panel()
	_refresh_backpack_panel()
	if status_label != null:
		_update_hud_text()


func _submit_server_equipment_enhance(slot_id: String) -> void:
	if slot_id == "" or not _is_server_account_session():
		return
	equipment_action_request_pending = true
	_refresh_equipment_panel()
	var response := await _auto_http_request_spec(ServerAuthClientModel.equipment_enhance_request(
		_server_profile_base_url(),
		_server_profile_token(),
		slot_id
	))
	equipment_action_request_pending = false
	if not _is_server_account_session():
		return
	var parsed := ServerAuthClientModel.parse_equipment_enhance_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "强化失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message := str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			_mark_progress_ui_caches_dirty()
		else:
			log_lines = ["强化成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_set_world_log_message("\n".join(log_lines))
	_refresh_equipment_panel()
	_refresh_backpack_panel()
	if status_label != null:
		_update_hud_text()


func _refresh_equipment_synthesis_panel() -> void:
	if equipment_synthesis_panel == null or equipment_synthesis_list_container == null or equipment_synthesis_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var recipes := EquipmentSynthesisModel.recipes()
	if equipment_synthesis_selected_recipe_id == "" or EquipmentSynthesisModel.recipe_for_id(equipment_synthesis_selected_recipe_id).is_empty():
		equipment_synthesis_selected_recipe_id = str(recipes[0].get("id", "")) if not recipes.is_empty() else ""
	for child in equipment_synthesis_list_container.get_children():
		child.queue_free()
	equipment_synthesis_recipe_buttons.clear()
	if recipes.is_empty():
		var empty_label := Label.new()
		empty_label.text = "暂无合成配方"
		empty_label.add_theme_font_size_override("font_size", 16)
		equipment_synthesis_list_container.add_child(empty_label)
	else:
		for recipe in recipes:
			var recipe_id := str(recipe.get("id", ""))
			var button := Button.new()
			button.toggle_mode = true
			button.button_pressed = recipe_id == equipment_synthesis_selected_recipe_id
			button.text = "%s\n%s" % [
			EquipmentSynthesisModel.output_label_for_recipe(recipe),
			EquipmentSynthesisModel.material_text(recipe),
			]
			button.custom_minimum_size = Vector2(0, 62)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			button.add_theme_font_size_override("font_size", 15)
			button.pressed.connect(func() -> void:
				_select_equipment_synthesis_recipe(recipe_id)
			)
			equipment_synthesis_list_container.add_child(button)
			equipment_synthesis_recipe_buttons[recipe_id] = button
	var selected_recipe := EquipmentSynthesisModel.recipe_for_id(equipment_synthesis_selected_recipe_id)
	equipment_synthesis_detail_label.text = _equipment_synthesis_detail_text(selected_recipe)
	if equipment_synthesis_action_button != null:
		var can_synthesize := false
		if not selected_recipe.is_empty():
			can_synthesize = bool(PlayerProgressModel.can_synthesize_equipment(player_profile, equipment_synthesis_selected_recipe_id).get("ok", false))
		equipment_synthesis_action_button.disabled = equipment_action_request_pending or not can_synthesize
		equipment_synthesis_action_button.text = "合成中" if equipment_action_request_pending else "合成"


func _select_equipment_synthesis_recipe(recipe_id: String) -> void:
	equipment_synthesis_selected_recipe_id = recipe_id
	_refresh_equipment_synthesis_panel()


func _equipment_synthesis_detail_text(recipe: Dictionary) -> String:
	if recipe.is_empty():
		return "请选择配方。"
	var recipe_id := str(recipe.get("id", ""))
	var output_item_id := EquipmentSynthesisModel.output_item_id(recipe)
	var check := PlayerProgressModel.can_synthesize_equipment(player_profile, recipe_id)
	var lines: Array[String] = []
	lines.append("[color=#d7c36a]配方[/color] %s" % _bbcode_escape(str(recipe.get("label", EquipmentSynthesisModel.output_label_for_recipe(recipe)))))
	lines.append("成品: %s" % _bbcode_escape(EquipmentSynthesisModel.output_text(recipe)))
	lines.append("成功率: %d%%" % int(roundf(EquipmentSynthesisModel.success_rate(recipe) * 100.0)))
	var description := str(recipe.get("description", "")).strip_edges()
	if description != "":
		lines.append("说明: %s" % _bbcode_escape(description))
	lines.append("")
	lines.append("[color=#d7c36a]材料[/color]")
	for material in EquipmentSynthesisModel.material_entries(recipe):
		var item_id := str(material.get("itemId", ""))
		var need_count := maxi(0, int(material.get("count", 0)))
		var held_count := PlayerProgressModel.backpack_item_count(player_profile, item_id)
		var color := EQUIPMENT_COMPARE_GAIN_COLOR if held_count >= need_count else EQUIPMENT_COMPARE_LOSS_COLOR
		lines.append("[color=%s]%s %d/%d[/color]" % [
			color,
			_bbcode_escape(BackpackModel.label_for(item_id, item_id)),
			held_count,
			need_count,
		])
	var cost := EquipmentSynthesisModel.stone_cost(recipe)
	var coins := PlayerProgressModel.stone_coins(player_profile)
	var coin_color := EQUIPMENT_COMPARE_GAIN_COLOR if coins >= cost else EQUIPMENT_COMPARE_LOSS_COLOR
	lines.append("[color=%s]石币 %d/%d[/color]" % [coin_color, coins, cost])
	lines.append("")
	lines.append("[color=#d7c36a]成品详情[/color]")
	for detail_line in EquipmentModel.detail_lines_for_item(output_item_id):
		lines.append(_bbcode_escape(detail_line))
	lines.append("")
	lines.append_array(_equipment_compare_detail_lines(output_item_id))
	lines.append("")
	var status_color := EQUIPMENT_COMPARE_GAIN_COLOR if bool(check.get("ok", false)) else EQUIPMENT_COMPARE_LOSS_COLOR
	lines.append("[color=%s]%s[/color]" % [status_color, _bbcode_escape(str(check.get("message", "")))])
	return "\n".join(lines)


func _on_equipment_synthesis_pressed() -> void:
	if equipment_synthesis_selected_recipe_id == "" or equipment_action_request_pending:
		return
	if _is_server_account_session():
		await _submit_server_equipment_synthesis(equipment_synthesis_selected_recipe_id)
		return
	if _local_profile_mutation_blocked_for_server_only("装备合成"):
		return
	var result := PlayerProgressModel.synthesize_equipment(player_profile, equipment_synthesis_selected_recipe_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_synthesis_panel()
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _submit_server_equipment_synthesis(recipe_id: String) -> void:
	if recipe_id == "" or not _is_server_account_session():
		return
	equipment_action_request_pending = true
	_refresh_equipment_synthesis_panel()
	var response := await _auto_http_request_spec(ServerAuthClientModel.equipment_synthesize_request(
		_server_profile_base_url(),
		_server_profile_token(),
		recipe_id
	))
	equipment_action_request_pending = false
	if not _is_server_account_session():
		return
	var parsed := ServerAuthClientModel.parse_equipment_synthesize_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "合成失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message := str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			_mark_progress_ui_caches_dirty()
		else:
			log_lines = ["合成成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_set_world_log_message("\n".join(log_lines))
	_refresh_equipment_synthesis_panel()
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _refresh_backpack_panel() -> void:
	if backpack_panel == null or backpack_grid == null or backpack_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var slots := _backpack_slots_for_ui()
	var visible_indices := _backpack_visible_slot_indices(slots)
	if visible_indices.is_empty():
		backpack_selected_slot_index = 0
	elif not visible_indices.has(backpack_selected_slot_index):
		backpack_selected_slot_index = int(visible_indices[0])
	else:
		backpack_selected_slot_index = clampi(backpack_selected_slot_index, 0, maxi(0, slots.size() - 1))
	_refresh_backpack_filter_buttons()
	backpack_grid.columns = _backpack_grid_columns()
	for child in backpack_grid.get_children():
		child.queue_free()
	backpack_slot_buttons.clear()
	if visible_indices.is_empty():
		backpack_grid.columns = 1
		var empty_label := Label.new()
		empty_label.text = "没有符合筛选的道具"
		empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		empty_label.custom_minimum_size = Vector2(0, 62)
		backpack_grid.add_child(empty_label)
	else:
		for index in visible_indices:
			var slot := slots[index] if index < slots.size() else {}
			var button := Button.new()
			var locked := bool(slot.get("locked", false))
			button.text = _backpack_locked_slot_label(index) if locked else BackpackModel.slot_label(slot)
			button.toggle_mode = not locked
			button.button_pressed = (not locked) and index == backpack_selected_slot_index
			button.custom_minimum_size = Vector2(0, 62)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			if locked:
				button.add_theme_font_size_override("font_size", 14)
			var slot_index := index
			button.pressed.connect(func() -> void:
				_select_backpack_slot(slot_index)
			)
			backpack_grid.add_child(button)
			backpack_slot_buttons.append(button)
		var selected_slot := {}
		if not visible_indices.is_empty() and backpack_selected_slot_index < slots.size():
			selected_slot = slots[backpack_selected_slot_index]
		var selected_item_id := str(selected_slot.get("itemId", ""))
		if visible_indices.is_empty():
			backpack_detail_label.text = "当前筛选：%s\n没有符合条件的道具。" % _backpack_filter_label_for(backpack_filter)
			if backpack_use_button != null:
				backpack_use_button.visible = false
			if backpack_equip_button != null:
				backpack_equip_button.visible = false
			if backpack_quick_bind_row != null:
				backpack_quick_bind_row.visible = false
			backpack_pending_use_item_id = ""
			_clear_backpack_target_buttons()
			if backpack_target_scroll != null:
				backpack_target_scroll.visible = false
			return
		if bool(selected_slot.get("locked", false)):
			backpack_detail_label.text = "\n".join(_backpack_locked_slot_detail_lines(backpack_selected_slot_index))
			if backpack_use_button != null:
				backpack_use_button.visible = false
			if backpack_equip_button != null:
				backpack_equip_button.visible = false
			if backpack_quick_bind_row != null:
				backpack_quick_bind_row.visible = false
			backpack_pending_use_item_id = ""
			_clear_backpack_target_buttons()
			if backpack_target_scroll != null:
				backpack_target_scroll.visible = false
			return
		var is_selected_equipment := EquipmentModel.is_equipment(selected_item_id)
		var equipment_requirement_lines: Array[String] = []
		var equipment_compare_lines: Array[String] = []
		if is_selected_equipment:
			equipment_requirement_lines = _equipment_detail_lines_with_requirement_status(selected_item_id, true)
			equipment_compare_lines = _equipment_compare_detail_lines(selected_item_id)
		var detail_lines := BackpackPanelPresenter.detail_lines_for_slot(selected_slot, equipment_requirement_lines, equipment_compare_lines)
		backpack_detail_label.text = "\n".join(detail_lines)
		var equip_check := _can_equip_item_for_ui(selected_item_id) if is_selected_equipment else {}
		var item_actions := BackpackPanelPresenter.selected_item_actions(selected_slot, slots, equip_check)
		if backpack_use_button != null:
			backpack_use_button.visible = bool(item_actions.get("useButtonVisible", false))
			backpack_use_button.disabled = bool(item_actions.get("useButtonDisabled", true))
			backpack_use_button.text = str(item_actions.get("useButtonText", "使用"))
		if backpack_equip_button != null:
			backpack_equip_button.visible = bool(item_actions.get("equipButtonVisible", false))
			backpack_equip_button.disabled = equipment_action_request_pending or bool(item_actions.get("equipButtonDisabled", true))
		if backpack_quick_bind_row != null:
			backpack_quick_bind_row.visible = bool(item_actions.get("quickBindVisible", false))
		for index in range(backpack_quick_bind_buttons.size()):
			var quick_bind_button := backpack_quick_bind_buttons[index]
			quick_bind_button.disabled = not bool(item_actions.get("canQuickBind", false))
			quick_bind_button.text = "快捷%d" % [index + 1]
		if not bool(item_actions.get("targetSelectionAllowed", false)) or backpack_pending_use_item_id != selected_item_id:
			backpack_pending_use_item_id = ""
			_clear_backpack_target_buttons()
			if backpack_target_scroll != null:
				backpack_target_scroll.visible = false
		else:
			_refresh_backpack_target_buttons(selected_item_id)


func _backpack_filter_options() -> Array[Dictionary]:
	return BackpackPanelPresenter.filter_options()


func _backpack_filter_ids() -> Array[String]:
	return BackpackPanelPresenter.filter_ids()


func _backpack_filter_label_for(filter_id: String) -> String:
	return BackpackPanelPresenter.filter_label(filter_id)


func _refresh_backpack_filter_buttons() -> void:
	if not _backpack_filter_ids().has(backpack_filter):
		backpack_filter = BACKPACK_FILTER_ALL
	for option in _backpack_filter_options():
		var filter_id := str(option.get("id", ""))
		var button := backpack_filter_buttons.get(filter_id, null) as Button
		if button == null:
			continue
		button.button_pressed = filter_id == backpack_filter


func _set_backpack_filter(filter_id: String) -> void:
	if not _backpack_filter_ids().has(filter_id):
		filter_id = BACKPACK_FILTER_ALL
	if backpack_filter == filter_id:
		_refresh_backpack_filter_buttons()
		return
	backpack_filter = filter_id
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()


func _backpack_button_texts() -> String:
	var parts: Array[String] = []
	for button in backpack_slot_buttons:
		if button != null:
			parts.append(button.text)
	return "\n".join(parts)


func _backpack_unlocked_slot_count_for_ui() -> int:
	return BackpackModel.unlocked_slot_count(
		clampi(int(player_profile.get(PlayerProgressModel.BACKPACK_EXTRA_SLOTS_KEY, 0)), 0, BackpackModel.EXTRA_SLOT_LIMIT)
	)


func _backpack_locked_slot_cost(slot_index: int) -> int:
	var extra_index := slot_index - BackpackModel.BASE_SLOT_LIMIT
	return BackpackModel.unlock_cost_for_extra_slot(extra_index)


func _backpack_locked_slot_label(slot_index: int) -> String:
	var cost := _backpack_locked_slot_cost(slot_index)
	return "锁\n%d钻石" % cost if cost > 0 else "锁"


func _backpack_locked_slot_detail_lines(slot_index: int) -> Array[String]:
	var cost := _backpack_locked_slot_cost(slot_index)
	var lines: Array[String] = [
		"扩展背包位",
		"费用：%d 钻石" % cost,
		"当前钻石：%d" % _profile_diamonds_for_ui(),
	]
	if slot_index > _backpack_unlocked_slot_count_for_ui():
		lines.append("请先解锁前一个背包位。")
	return lines


func _backpack_slot_is_locked_index(slot_index: int) -> bool:
	return slot_index >= _backpack_unlocked_slot_count_for_ui() and slot_index < BackpackModel.SLOT_LIMIT


func _backpack_visible_slot_indices(slots: Array[Dictionary]) -> Array[int]:
	var result: Array[int] = []
	for index in range(BackpackModel.SLOT_LIMIT):
		var slot := slots[index] if index < slots.size() else {}
		if _backpack_slot_matches_filter(slot):
			result.append(index)
	return result


func _backpack_slot_matches_filter(slot: Dictionary) -> bool:
	return BackpackPanelPresenter.slot_matches_filter(slot, backpack_filter)


func _backpack_grid_columns() -> int:
	return 3 if _is_phone_shape(_layout_size()) else 5


func _select_backpack_slot(slot_index: int) -> void:
	backpack_selected_slot_index = clampi(slot_index, 0, BackpackModel.SLOT_LIMIT - 1)
	backpack_pending_use_item_id = ""
	if _backpack_slot_is_locked_index(backpack_selected_slot_index):
		_open_backpack_unlock_dialog(backpack_selected_slot_index)
		return
	_refresh_backpack_panel()


func _open_backpack_unlock_dialog(slot_index: int) -> void:
	var unlocked_count := _backpack_unlocked_slot_count_for_ui()
	if slot_index > unlocked_count:
		_set_world_log_message("请先解锁前一个扩展背包位。")
		_refresh_backpack_panel()
		return
	var extra_index := slot_index - BackpackModel.BASE_SLOT_LIMIT
	var cost := _backpack_locked_slot_cost(slot_index)
	active_dialog_interaction = {
		"id": "backpack_unlock_%d" % slot_index,
		"name": "扩展背包",
		"actionType": DIALOG_ACTION_BACKPACK_UNLOCK,
		"slotIndex": slot_index,
		"extraSlotIndex": extra_index,
		"option": "同意",
		"dialog": [
			"是否消耗 %d 钻石解锁这个背包位？" % cost,
			"当前钻石：%d" % _profile_diamonds_for_ui(),
		],
	}
	_update_dialog_text()
	dialog_panel.move_to_front()
	dialog_panel.visible = true
	_layout_hud()


func _unlock_backpack_slot_from_dialog() -> void:
	if active_dialog_interaction.is_empty():
		return
	var extra_index := int(active_dialog_interaction.get("extraSlotIndex", -1))
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("backpack_unlock_slot", {"extraSlotIndex": extra_index}, "解锁背包位失败。")
		var message := "\n".join(_string_array_values(parsed.get("logLines", [])))
		_set_world_log_message(message)
		if bool(parsed.get("ok", false)):
			_close_dialog()
			_refresh_backpack_panel()
			_refresh_quick_bar()
			if status_label != null:
				_update_hud_text()
			return
		active_dialog_interaction["dialog"] = [message, "当前钻石：%d" % _profile_diamonds_for_ui()]
		_update_dialog_text()
		return
	if _local_profile_mutation_blocked_for_server_only("背包扩容"):
		return
	var result := PlayerProgressModel.unlock_backpack_slot(player_profile, extra_index)
	player_profile = result.get("profile", player_profile)
	var message := str(result.get("message", ""))
	_set_world_log_message(message)
	if bool(result.get("ok", false)):
		if profile_save_enabled:
			_save_player_profile_now()
		_close_dialog()
		_refresh_backpack_panel()
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		return
	active_dialog_interaction["dialog"] = [message, "当前钻石：%d" % _profile_diamonds_for_ui()]
	_update_dialog_text()


func _refresh_quick_bar(force: bool = false) -> void:
	if quick_slot_buttons.is_empty():
		return
	var slots := _quick_slots_for_hud()
	var states: Array[Dictionary] = []
	var signature_parts: Array[String] = [str(battle_active), str(encounter_active)]
	for index in range(quick_slot_buttons.size()):
		var item_id := slots[index] if index < slots.size() else ""
		var text := "快%d\n-" % [index + 1]
		var disabled := true
		if item_id == "":
			signature_parts.append("%d:-:0:1" % index)
		else:
			var count := _backpack_item_count_for_hud(item_id)
			text = "%s\nx%d" % [BackpackModel.menu_label_for(item_id), count]
			disabled = battle_active or encounter_active or count <= 0
			signature_parts.append("%d:%s:%d:%d" % [index, item_id, count, 1 if disabled else 0])
		states.append({
			"text": text,
			"disabled": disabled,
		})
	var signature := "|".join(signature_parts)
	if not force and signature == quick_bar_signature_cache:
		return
	quick_bar_signature_cache = signature
	for index in range(quick_slot_buttons.size()):
		var button := quick_slot_buttons[index]
		var state := states[index]
		var next_text := str(state.get("text", ""))
		var next_disabled := bool(state.get("disabled", true))
		if button.text != next_text:
			button.text = next_text
		if button.disabled != next_disabled:
			button.disabled = next_disabled


func _quick_slots_for_hud() -> Array[String]:
	var result: Array[String] = []
	var raw_slots = player_profile.get("quickSlots", [])
	if raw_slots is Array:
		var quick_values := raw_slots as Array
		for raw_item_id in quick_values:
			var item_id := str(raw_item_id).strip_edges()
			result.append(item_id if PlayerProgressModel.item_can_quick_use(item_id) else "")
			if result.size() >= quick_slot_buttons.size():
				break
	while result.size() < quick_slot_buttons.size():
		result.append("")
	return result


func _backpack_item_count_for_hud(item_id: String) -> int:
	return _backpack_item_count_for_ui(item_id)


func _profile_stone_coins_for_ui() -> int:
	return maxi(0, int(player_profile.get(PlayerProgressModel.STONE_COINS_KEY, PlayerProgressModel.DEFAULT_STONE_COINS)))


func _profile_diamonds_for_ui() -> int:
	return maxi(0, int(player_profile.get(PlayerProgressModel.DIAMONDS_KEY, PlayerProgressModel.DEFAULT_DIAMONDS)))


func _profile_currency_amount_for_ui(currency: String) -> int:
	match currency:
		ShopCatalogModel.CURRENCY_DIAMONDS:
			return _profile_diamonds_for_ui()
	return _profile_stone_coins_for_ui()


func _backpack_slots_for_ui() -> Array[Dictionary]:
	var unlocked_count := _backpack_unlocked_slot_count_for_ui()
	var result := BackpackModel.normalize_slots(player_profile.get("backpackSlots", []), unlocked_count)
	var slots = player_profile.get("backpackSlots", [])
	if slots is Array:
		result = BackpackModel.normalize_slots(slots, unlocked_count)
	while result.size() < BackpackModel.SLOT_LIMIT:
		var extra_index := result.size() - BackpackModel.BASE_SLOT_LIMIT
		result.append({
			"locked": true,
			"unlockCost": BackpackModel.unlock_cost_for_extra_slot(extra_index),
		})
	return result


func _backpack_item_count_for_ui(item_id: String) -> int:
	if item_id == "":
		return 0
	return int(_backpack_counts_from_slots_for_ui(_backpack_slots_for_ui()).get(item_id, 0))


func _backpack_counts_from_slots_for_ui(slots: Array[Dictionary]) -> Dictionary:
	var counts := {}
	for slot in slots:
		var slot_item_id := str(slot.get("itemId", ""))
		if slot_item_id != "":
			counts[slot_item_id] = int(counts.get(slot_item_id, 0)) + maxi(0, int(slot.get("count", 0)))
	return counts


func _backpack_counts_for_ui() -> Dictionary:
	return _backpack_counts_from_slots_for_ui(_backpack_slots_for_ui())


func _backpack_available_capacity_for_ui(item_id: String, slots: Array[Dictionary] = []) -> int:
	if item_id == "" or BackpackModel.item_for_id(item_id).is_empty():
		return 0
	var total := 0
	var stack_limit := BackpackModel.stack_limit_for(item_id)
	var effective_slots := slots if not slots.is_empty() else _backpack_slots_for_ui()
	for slot in effective_slots:
		if bool(slot.get("locked", false)):
			continue
		var slot_item_id := str(slot.get("itemId", ""))
		if slot_item_id == item_id:
			total += maxi(0, stack_limit - maxi(0, int(slot.get("count", 0))))
		elif slot_item_id == "":
			total += stack_limit
	return total


func _on_backpack_quick_bind_pressed(slot_index: int) -> void:
	var item_id := _selected_backpack_item_id()
	if item_id == "" or not PlayerProgressModel.item_can_quick_use(item_id):
		return
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		_set_world_log_message("%s 不够了。" % BackpackModel.label_for(item_id))
		return
	player_profile = PlayerProgressModel.with_quick_slot_item(player_profile, slot_index, item_id)
	if profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message("%s 已绑定到快捷%d。" % [BackpackModel.label_for(item_id), slot_index + 1])
	_refresh_backpack_panel()
	_refresh_quick_bar()


func _on_quick_slot_pressed(slot_index: int) -> void:
	if battle_active or encounter_active:
		return
	var slots := PlayerProgressModel.quick_slots(player_profile)
	if slot_index < 0 or slot_index >= slots.size():
		return
	var item_id := str(slots[slot_index])
	if item_id == "":
		return
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		player_profile = PlayerProgressModel.clear_quick_slot(player_profile, slot_index)
		if profile_save_enabled:
			_save_player_profile_now()
		_set_world_log_message("快捷%d没有可用道具。" % [slot_index + 1])
		_refresh_quick_bar()
		return
	if BackpackModel.item_can_world_encounter_stone(item_id):
		await _use_backpack_encounter_stone(item_id)
		_clear_empty_quick_slot_item(item_id)
		_refresh_quick_bar()
		return
	if BackpackModel.item_can_world_pet_heal(item_id):
		var target_id := _quick_pet_heal_target_id(item_id)
		if target_id == "":
			_set_world_log_message("队伍宠物生命已满。")
			return
		await _use_world_pet_heal_item_and_log(item_id, target_id)
		_clear_empty_quick_slot_item(item_id)
		_refresh_quick_bar()


func _quick_pet_heal_target_id(item_id: String) -> String:
	if not BackpackModel.item_can_world_pet_heal(item_id):
		return ""
	var allow_full_hp_use := BackpackModel.world_pet_heal_allows_full_hp_use(item_id)
	var party := PlayerProgressModel.party_pet_instances(player_profile)
	var active_id := str(player_profile.get("activePetInstanceId", ""))
	for pet in party:
		if str(pet.get("instanceId", "")) != active_id:
			continue
		var active_max_hp := maxi(1, int(pet.get("maxHp", 1)))
		var active_hp := clampi(int(pet.get("hp", active_max_hp)), 0, active_max_hp)
		if active_hp < active_max_hp or allow_full_hp_use:
			return active_id
	for pet in party:
		var max_hp := maxi(1, int(pet.get("maxHp", 1)))
		var hp := clampi(int(pet.get("hp", max_hp)), 0, max_hp)
		if hp < max_hp or allow_full_hp_use:
			return str(pet.get("instanceId", ""))
	return ""


func _clear_empty_quick_slot_item(item_id: String) -> void:
	if item_id == "" or PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0:
		return
	var slots := PlayerProgressModel.quick_slots(player_profile)
	var changed := false
	for index in range(slots.size()):
		if slots[index] == item_id:
			slots[index] = ""
			changed = true
	if not changed:
		return
	var normalized := PlayerProgressModel.normalize_profile(player_profile)
	normalized[PlayerProgressModel.QUICK_SLOTS_KEY] = slots
	player_profile = PlayerProgressModel.normalize_profile(normalized)
	if profile_save_enabled:
		_save_player_profile_now()


func _player_level_for_ui() -> int:
	var player_value = player_profile.get("player", {})
	var player_dict := player_value as Dictionary if player_value is Dictionary else {}
	return maxi(1, int(player_dict.get("level", 1)))


func _player_rebirth_for_ui() -> int:
	return maxi(0, int(player_profile.get(PlayerProgressModel.REBIRTH_COUNT_KEY, 0)))


func _equipment_slots_for_ui() -> Dictionary:
	var result := {}
	var slots_value = player_profile.get(PlayerProgressModel.EQUIPMENT_SLOTS_KEY, {})
	if slots_value is Dictionary:
		var slots_dict := slots_value as Dictionary
		for slot_id in EquipmentModel.slot_ids():
			var item_id := str(slots_dict.get(slot_id, ""))
			if item_id != "":
				result[slot_id] = item_id
	return result


func _equipment_durability_for_ui() -> Dictionary:
	var result := {}
	var durability_value = player_profile.get(PlayerProgressModel.EQUIPMENT_DURABILITY_KEY, {})
	if durability_value is Dictionary:
		var durability_dict := durability_value as Dictionary
		for slot_id in EquipmentModel.slot_ids():
			if durability_dict.has(slot_id):
				result[slot_id] = maxi(0, int(durability_dict.get(slot_id, 0)))
	return result


func _equipment_enhancement_for_ui() -> Dictionary:
	var result := {}
	var slots := _equipment_slots_for_ui()
	var enhancement_value = player_profile.get(PlayerProgressModel.EQUIPMENT_ENHANCEMENT_KEY, {})
	if not (enhancement_value is Dictionary):
		return result
	var enhancement := enhancement_value as Dictionary
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var record_value = enhancement.get(slot_id, {})
		if not (record_value is Dictionary):
			continue
		var record := record_value as Dictionary
		if str(record.get("itemId", "")) != item_id:
			continue
		var level := clampi(int(record.get("level", 0)), 0, EquipmentModel.enhance_max_for(item_id))
		if level > 0:
			result[slot_id] = {
				"itemId": item_id,
				"level": level,
			}
	return result


func _equipment_enhance_level_for_ui(slot_id: String, item_id: String, enhancement: Dictionary) -> int:
	var record_value = enhancement.get(slot_id, {})
	if not (record_value is Dictionary):
		return 0
	var record := record_value as Dictionary
	if str(record.get("itemId", "")) != item_id:
		return 0
	return clampi(int(record.get("level", 0)), 0, EquipmentModel.enhance_max_for(item_id))


func _equipment_slot_is_broken_for_ui(slot_id: String, item_id: String, durability: Dictionary) -> bool:
	var max_durability := EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return false
	return clampi(int(durability.get(slot_id, max_durability)), 0, max_durability) <= 0


func _equipment_stat_bonus_for_ui(slots: Dictionary, durability: Dictionary, enhancement: Dictionary = {}) -> Dictionary:
	var result := {}
	var effective_enhancement := enhancement if not enhancement.is_empty() else _equipment_enhancement_for_ui()
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "" or _equipment_slot_is_broken_for_ui(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		var stats := EquipmentModel.stats_for(item_id)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(stats.get(key, 0))
		var enhance_level := _equipment_enhance_level_for_ui(slot_id, item_id, effective_enhancement)
		var enhance_stats := EquipmentModel.enhance_stat_bonus_for(item_id, enhance_level)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(enhance_stats.get(key, 0))
	return result


func _equipment_spirit_ids_for_ui(slots: Dictionary, durability: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "" or _equipment_slot_is_broken_for_ui(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if spirit_id != "" and not result.has(spirit_id):
				result.append(spirit_id)
	return result


func _equipment_spirit_source_entries_for_ui(slots: Dictionary, durability: Dictionary) -> Array[Dictionary]:
	var source_lookup := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "" or _equipment_slot_is_broken_for_ui(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			var normalized_spirit_id := str(spirit_id)
			if normalized_spirit_id == "":
				continue
			if not source_lookup.has(normalized_spirit_id):
				source_lookup[normalized_spirit_id] = []
			var sources := source_lookup[normalized_spirit_id] as Array
			sources.append({
				"slotId": slot_id,
				"slotLabel": EquipmentModel.slot_label_for(slot_id),
				"itemId": item_id,
				"itemLabel": EquipmentModel.label_for(item_id, item_id),
			})
			source_lookup[normalized_spirit_id] = sources
	var spirit_ids: Array[String] = []
	for value in source_lookup.keys():
		spirit_ids.append(str(value))
	spirit_ids.sort()
	var result: Array[Dictionary] = []
	for spirit_id in spirit_ids:
		result.append({
			"spiritId": spirit_id,
			"spiritLabel": BattleActionCatalog.label_for(spirit_id, spirit_id),
			"sources": source_lookup.get(spirit_id, []),
		})
	return result


func _equipment_change_preview_for_ui(item_id: String) -> Dictionary:
	if not EquipmentModel.is_equipment(item_id):
		return {}
	var slot_id := EquipmentModel.slot_for(item_id)
	if slot_id == "":
		return {}
	var before_slots := _equipment_slots_for_ui()
	var current_item_id := str(before_slots.get(slot_id, ""))
	var after_slots := before_slots.duplicate(true)
	after_slots[slot_id] = item_id
	var durability := _equipment_durability_for_ui()
	var enhancement := _equipment_enhancement_for_ui()
	var before_bonus := _equipment_stat_bonus_for_ui(before_slots, durability, enhancement)
	var after_bonus := _equipment_stat_bonus_for_ui(after_slots, durability, enhancement)
	var stat_changes: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		var before_value := int(before_bonus.get(key, 0))
		var after_value := int(after_bonus.get(key, 0))
		var delta := after_value - before_value
		if delta == 0:
			continue
		stat_changes.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"before": before_value,
			"after": after_value,
			"delta": delta,
		})
	var before_spirits := _equipment_spirit_ids_for_ui(before_slots, durability)
	var after_spirits := _equipment_spirit_ids_for_ui(after_slots, durability)
	var gained_spirits: Array[String] = []
	for spirit_id in after_spirits:
		if not before_spirits.has(spirit_id):
			gained_spirits.append(spirit_id)
	var lost_spirits: Array[String] = []
	for spirit_id in before_spirits:
		if not after_spirits.has(spirit_id):
			lost_spirits.append(spirit_id)
	return {
		"slot": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"currentItemId": current_item_id,
		"currentItemLabel": EquipmentModel.label_for(current_item_id, "无") if current_item_id != "" else "无",
		"newItemId": item_id,
		"newItemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		"statChanges": stat_changes,
		"gainedSpiritIds": gained_spirits,
		"lostSpiritIds": lost_spirits,
		"unchanged": current_item_id == item_id and stat_changes.is_empty() and gained_spirits.is_empty() and lost_spirits.is_empty(),
	}


func _equipment_repair_quote_for_ui() -> Dictionary:
	var slots := _equipment_slots_for_ui()
	var durability := _equipment_durability_for_ui()
	var missing := 0
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var max_durability := EquipmentModel.max_durability_for(item_id)
		if max_durability <= 0:
			continue
		var current := clampi(int(durability.get(slot_id, max_durability)), 0, max_durability)
		missing += maxi(0, max_durability - current)
	return {
		"missingDurability": missing,
		"cost": PlayerProgressModel.equipment_repair_cost_for_missing(missing),
		"stoneCoins": _profile_stone_coins_for_ui(),
	}


func _can_equip_item_for_ui(item_id: String) -> Dictionary:
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"message": "%s 不能装备。" % item_label,
		}
	var player_level := _player_level_for_ui()
	var required_level := EquipmentModel.required_level_for(item_id)
	var player_rebirth := _player_rebirth_for_ui()
	var required_rebirth := EquipmentModel.required_rebirth_for(item_id)
	if player_level < required_level:
		return {
			"ok": false,
			"message": "%s 需要 Lv%d 才能装备。" % [item_label, required_level],
			"requiredLevel": required_level,
			"playerLevel": player_level,
			"requiredRebirth": required_rebirth,
			"playerRebirth": player_rebirth,
		}
	if player_rebirth < required_rebirth:
		return {
			"ok": false,
			"message": "%s 需要 %s 才能装备。" % [item_label, EquipmentModel.rebirth_label_for(required_rebirth)],
			"requiredLevel": required_level,
			"playerLevel": player_level,
			"requiredRebirth": required_rebirth,
			"playerRebirth": player_rebirth,
		}
	return {
		"ok": true,
		"message": "%s 可以装备。" % item_label,
		"requiredLevel": required_level,
		"playerLevel": player_level,
		"requiredRebirth": required_rebirth,
		"playerRebirth": player_rebirth,
	}


func _equipment_compare_detail_lines(item_id: String) -> Array[String]:
	var preview := _equipment_change_preview_for_ui(item_id)
	if preview.is_empty():
		return []
	var lines: Array[String] = [
		"[color=#d7c36a]换装预览[/color]",
		"当前: %s -> %s" % [
			_bbcode_escape(str(preview.get("currentItemLabel", "无"))),
			_bbcode_escape(str(preview.get("newItemLabel", "装备"))),
		],
	]
	if not _equipment_slot_meets_requirements_for_ui(str(preview.get("slot", "")), item_id):
		lines.append("[color=%s]%s[/color]" % [
			EQUIPMENT_COMPARE_LOSS_COLOR,
			_bbcode_escape("需求未满足，装备后暂不生效。"),
		])
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
			insert_index = index
			break
	if insert_index < 0:
		lines.append_array(status_lines)
	else:
		var status_text_parts: Array[String] = []
		for status_line in status_lines:
			status_text_parts.append(str(status_line).replace("需求状态: ", ""))
		lines[insert_index] = "%s（%s）" % [requirement_text, "；".join(status_text_parts)]
	return lines


func _equipment_requirement_status_lines(item_id: String, use_bbcode: bool = false) -> Array[String]:
	if not EquipmentModel.is_equipment(item_id):
		return []
	var required_level := EquipmentModel.required_level_for(item_id)
	var required_rebirth := EquipmentModel.required_rebirth_for(item_id)
	if required_level <= 1 and required_rebirth <= 0:
		return []
	var parts: Array[String] = []
	var player_level := _player_level_for_ui()
	if required_level > 1:
		var level_met := player_level >= required_level
		var level_text := "当前 Lv%d：%s" % [player_level, "已满足" if level_met else "未满足"]
		if use_bbcode:
			var level_color := EQUIPMENT_COMPARE_GAIN_COLOR if level_met else EQUIPMENT_COMPARE_LOSS_COLOR
			level_text = "[color=%s]%s[/color]" % [level_color, _bbcode_escape(level_text)]
		parts.append(level_text)
	var player_rebirth := _player_rebirth_for_ui()
	if required_rebirth > 0:
		var rebirth_met := player_rebirth >= required_rebirth
		var rebirth_text := "当前 %s：%s" % [
			EquipmentModel.rebirth_label_for(player_rebirth),
			"已满足" if rebirth_met else "未满足",
		]
		if use_bbcode:
			var rebirth_color := EQUIPMENT_COMPARE_GAIN_COLOR if rebirth_met else EQUIPMENT_COMPARE_LOSS_COLOR
			rebirth_text = "[color=%s]%s[/color]" % [rebirth_color, _bbcode_escape(rebirth_text)]
		parts.append(rebirth_text)
	return ["需求状态: %s" % "；".join(parts)]


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
	if BackpackModel.item_can_world_player_exp(item_id):
		if BackpackModel.item_can_world_pet_exp(item_id):
			backpack_pending_use_item_id = item_id
			_refresh_backpack_panel()
			return
		_use_backpack_player_exp_item(item_id)
		return
	if BackpackModel.item_can_world_pet_egg(item_id):
		_use_backpack_pet_egg_item(item_id)
		return
	if EquipmentModel.is_equipment(item_id):
		_equip_selected_backpack_item(item_id)
		return
	if BackpackModel.item_can_world_encounter_stone(item_id):
		_use_backpack_encounter_stone(item_id)
		return
	if not (
		BackpackModel.item_can_world_pet_heal(item_id)
		or BackpackModel.item_can_world_player_exp(item_id)
		or BackpackModel.item_can_world_pet_exp(item_id)
		or BackpackModel.item_can_world_mm_stone(item_id)
	):
		return
	backpack_pending_use_item_id = item_id
	_refresh_backpack_panel()


func _on_backpack_equip_pressed() -> void:
	_equip_selected_backpack_item(_selected_backpack_item_id())


func _equip_selected_backpack_item(item_id: String) -> void:
	if item_id == "" or not EquipmentModel.is_equipment(item_id) or equipment_action_request_pending:
		return
	if _is_server_account_session():
		await _submit_server_equipment_equip(item_id)
		return
	if _local_profile_mutation_blocked_for_server_only("装备更换"):
		return
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
		_save_player_profile_now()
	_set_world_log_message("\n".join(log_lines))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	if status_label != null:
		_update_hud_text()


func _submit_server_equipment_equip(item_id: String) -> void:
	if item_id == "" or not EquipmentModel.is_equipment(item_id) or not _is_server_account_session():
		return
	var parsed := await _request_server_equipment_equip(item_id, true)
	var log_lines: Array[String] = _string_array_values(parsed.get("logLines", []))
	_set_world_log_message("\n".join(log_lines))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	if status_label != null:
		_update_hud_text()


func _request_server_equipment_equip(item_id: String, refresh_backpack_before: bool = true) -> Dictionary:
	if item_id == "" or not EquipmentModel.is_equipment(item_id) or not _is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "logLines": ["请先登录服务器。"]}
	equipment_action_request_pending = true
	if refresh_backpack_before:
		_refresh_backpack_panel()
	var response := await _auto_http_request_spec(ServerAuthClientModel.equipment_equip_request(
		_server_profile_base_url(),
		_server_profile_token(),
		item_id
	))
	equipment_action_request_pending = false
	if not _is_server_account_session():
		return {"ok": false, "message": "装备同步已取消。", "logLines": ["装备同步已取消。"]}
	var parsed := ServerAuthClientModel.parse_equipment_equip_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	return _apply_server_equipment_equip_result(parsed)


func _apply_server_equipment_equip_result(parsed: Dictionary) -> Dictionary:
	var log_lines: Array[String] = [str(parsed.get("message", "装备失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message := str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			_mark_progress_ui_caches_dirty()
		else:
			log_lines = ["装备成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	parsed["logLines"] = log_lines
	return parsed


func _use_backpack_player_exp_item(item_id: String) -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("world_item_use", {"itemId": item_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		_refresh_equipment_panel()
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return
	var result := PlayerProgressModel.use_world_player_exp_item(player_profile, item_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _use_backpack_encounter_stone(item_id: String) -> void:
	var item_label := BackpackModel.label_for(item_id)
	if hang_session_request_active:
		_set_world_log_message("挂机同步中，请稍候。")
		return
	if _current_player_is_party_member():
		_set_world_log_message("队伍中只有队长可以使用%s。" % item_label)
		return
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		_set_world_log_message("%s 不够了。" % item_label)
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone := EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		_set_world_log_message("需要站在遇敌区域，才能使用%s。" % item_label)
		return
	if _server_hang_session_enabled():
		var server_started := await _request_server_hang_session_start("encounter_stone", player_cell, item_id)
		if not server_started:
			return
		_activate_encounter_stone(item_id)
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		return
	var slots := BackpackModel.consume(PlayerProgressModel.backpack_slots(player_profile), item_id, 1)
	player_profile = PlayerProgressModel.with_backpack_slots(player_profile, slots)
	_activate_encounter_stone(item_id)
	if profile_save_enabled:
		_save_player_profile_now()
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _activate_encounter_stone(item_id: String) -> void:
	encounter_stone_item_id = item_id
	encounter_stone_interval = BackpackModel.world_encounter_interval_for(item_id)
	encounter_stone_remaining = BackpackModel.world_encounter_duration_for(item_id)
	encounter_stone_elapsed = 0.0
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position) if player != null and not map_data.is_empty() else Vector2i.ZERO
	player_profile = PlayerProgressModel.start_hang_session(player_profile, "encounter_stone", current_map_id, player_cell)
	_set_hang_mode(false)
	_sync_hang_button_text()
	_set_world_log_message("%s 已生效，站在遇敌区域每%d秒遇敌。" % [
		BackpackModel.label_for(item_id),
		int(roundf(encounter_stone_interval)),
	])


func _encounter_stone_active() -> bool:
	return encounter_stone_item_id != "" and encounter_stone_interval > 0.0 and encounter_stone_remaining > 0.0


func _clear_encounter_stone_effect(show_message: bool = false, sync_server: bool = true) -> void:
	var item_label := BackpackModel.label_for(encounter_stone_item_id, "遇敌石")
	var was_active := _encounter_stone_active()
	if was_active:
		player_profile = PlayerProgressModel.stop_hang_session(player_profile, "encounter_stone_end")
	encounter_stone_item_id = ""
	encounter_stone_interval = 0.0
	encounter_stone_remaining = 0.0
	encounter_stone_elapsed = 0.0
	_sync_hang_button_text()
	if was_active and sync_server:
		_request_server_hang_session_stop("encounter_stone_end")
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
	var target_count := 0
	if BackpackModel.item_can_world_player_exp(item_id):
		var player_value = player_profile.get("player", {})
		var player_dict := player_value as Dictionary if player_value is Dictionary else {}
		var player_button := Button.new()
		player_button.text = "%s\nLv%d 经验 %d/%d" % [
			str(player_dict.get("name", "见习猎人")),
			int(player_dict.get("level", 1)),
			int(player_dict.get("exp", 0)),
			int(player_dict.get("nextExp", PlayerProgressModel.exp_to_next_level(int(player_dict.get("level", 1))))),
		]
		player_button.custom_minimum_size = Vector2(0, 52)
		player_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		player_button.pressed.connect(func() -> void:
			_use_backpack_player_exp_item(item_id)
		)
		backpack_target_container.add_child(player_button)
		target_count += 1
	var pets := PlayerProgressModel.party_pet_instances(player_profile)
	for pet in pets:
		var max_hp := maxi(1, int(pet.get("maxHp", 1)))
		var hp := clampi(int(pet.get("hp", max_hp)), 0, max_hp)
		var button := Button.new()
		if BackpackModel.item_can_world_pet_exp(item_id):
			button.text = "%s\nLv%d 经验 %d/%d" % [
				str(pet.get("name", "宠物")),
				int(pet.get("level", 1)),
				int(pet.get("exp", 0)),
				int(pet.get("nextExp", PlayerProgressModel.exp_to_next_level(int(pet.get("level", 1))))),
			]
		elif BackpackModel.item_can_world_mm_stone(item_id):
			var stat_key := PetRebirthMmModel.normalized_stat_key(BackpackModel.world_mm_stone_stat_for(item_id))
			var stage := PetRebirthMmModel.helper_stage_for_pet(pet)
			var helper_record := PetRebirthMmModel.normalized_helper_record(pet.get("petRebirthHelper", {}), stage)
			var points := PetRebirthMmModel.normalized_stone_points(helper_record.get("stonePoints", {}))
			var current_points := int(points.get(stat_key, 0)) if stat_key != "" else 0
			button.text = "%s\n%s石 %d/%d" % [
				str(pet.get("name", "宠物")),
				PetRebirthMmModel.stat_label(stat_key),
				current_points,
				PetRebirthMmModel.STONE_CAPACITY,
			]
		else:
			button.text = "%s\n生命 %d/%d" % [str(pet.get("name", "宠物")), hp, max_hp]
		button.custom_minimum_size = Vector2(0, 52)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var allow_full_hp_use := BackpackModel.world_pet_heal_allows_full_hp_use(item_id)
		if BackpackModel.item_can_world_pet_exp(item_id):
			button.disabled = int(pet.get("level", 1)) >= PlayerProgressModel.MAX_PET_LEVEL
		elif BackpackModel.item_can_world_mm_stone(item_id):
			var stone_stat_key := PetRebirthMmModel.normalized_stat_key(BackpackModel.world_mm_stone_stat_for(item_id))
			var helper_stage := PetRebirthMmModel.helper_stage_for_pet(pet)
			var target_record := PetRebirthMmModel.normalized_helper_record(pet.get("petRebirthHelper", {}), helper_stage)
			var target_points := PetRebirthMmModel.normalized_stone_points(target_record.get("stonePoints", {}))
			button.disabled = (
				helper_stage <= 0
				or int(pet.get("level", 1)) >= 74
				or stone_stat_key == ""
				or int(target_points.get(stone_stat_key, 0)) >= PetRebirthMmModel.STONE_CAPACITY
			)
		else:
			button.disabled = (hp >= max_hp and not allow_full_hp_use) or not BackpackModel.item_can_world_pet_heal(item_id)
		var instance_id := str(pet.get("instanceId", ""))
		button.set_meta("pet_instance_id", instance_id)
		button.pressed.connect(func() -> void:
			_use_backpack_item_on_pet(item_id, instance_id)
		)
		backpack_target_container.add_child(button)
		target_count += 1
	if target_count <= 0:
		var empty_label := Label.new()
		empty_label.text = "没有可用目标"
		empty_label.add_theme_font_size_override("font_size", 15)
		backpack_target_container.add_child(empty_label)


func _use_backpack_item_on_pet(item_id: String, instance_id: String) -> void:
	if BackpackModel.item_can_world_pet_exp(item_id):
		await _use_world_pet_exp_item_and_log(item_id, instance_id)
		backpack_pending_use_item_id = item_id if PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0 else ""
		_refresh_backpack_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if BackpackModel.item_can_world_mm_stone(item_id):
		await _use_world_mm_stone_item_and_log(item_id, instance_id)
		backpack_pending_use_item_id = item_id if PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0 else ""
		_refresh_backpack_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	var result := await _use_world_pet_heal_item_and_log(item_id, instance_id)
	var used := bool(result.get("ok", false))
	var healed := maxi(0, int(result.get("heal", 0)))
	backpack_pending_use_item_id = item_id if PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0 else ""
	_refresh_backpack_panel()
	if used:
		_show_backpack_pet_heal_popup(instance_id, healed)
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _use_world_pet_heal_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("world_item_use", {"itemId": item_id, "instanceId": instance_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_quick_bar()
		var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		result["ok"] = bool(parsed.get("ok", false))
		return result
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return {"ok": false, "message": "使用物品需要连接服务器后执行。"}
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
		_save_player_profile_now()
	_set_world_log_message("\n".join(log_lines))
	_refresh_quick_bar()
	return result


func _use_world_pet_exp_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("world_item_use", {"itemId": item_id, "instanceId": instance_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		result["ok"] = bool(parsed.get("ok", false))
		return result
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return {"ok": false, "message": "使用物品需要连接服务器后执行。"}
	var result := PlayerProgressModel.use_world_pet_exp_item(player_profile, item_id, instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()
	return result


func _use_world_mm_stone_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("world_item_use", {"itemId": item_id, "instanceId": instance_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		result["ok"] = bool(parsed.get("ok", false))
		return result
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return {"ok": false, "message": "使用物品需要连接服务器后执行。"}
	var result := PlayerProgressModel.use_world_mm_stone_item(player_profile, item_id, instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()
	return result


func _use_backpack_pet_egg_item(item_id: String) -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("world_item_use", {"itemId": item_id}, "使用宠物蛋失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		_refresh_pet_panel()
		_refresh_quick_bar()
		if status_label != null:
			_update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("使用宠物蛋"):
		return
	var result := PlayerProgressModel.use_world_pet_egg_item(player_profile, item_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_pet_panel()
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _show_backpack_pet_heal_popup(instance_id: String, healed_amount: int) -> void:
	var target_button = _backpack_target_button_for_pet(instance_id)
	if target_button == null:
		return
	_spawn_backpack_heal_popup(target_button, healed_amount)


func _backpack_target_button_for_pet(instance_id: String):
	if backpack_target_container == null:
		return null
	for child in backpack_target_container.get_children():
		if child.is_queued_for_deletion():
			continue
		if child is Button and str(child.get_meta("pet_instance_id", "")) == instance_id:
			return child
	return null


func _backpack_heal_popup_text_for_pet(instance_id: String) -> String:
	var target_button = _backpack_target_button_for_pet(instance_id)
	if target_button == null:
		return ""
	for child in target_button.get_children():
		if child is Label and child.has_meta("backpack_heal_popup"):
			return (child as Label).text
	return ""


func _spawn_backpack_heal_popup(target: Control, healed_amount: int) -> void:
	for child in target.get_children():
		if child.is_queued_for_deletion():
			continue
		if child.has_meta("backpack_heal_popup"):
			child.queue_free()
	var label := Label.new()
	label.set_meta("backpack_heal_popup", true)
	label.text = "+%d" % maxi(0, healed_amount)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 24)
	label.add_theme_color_override("font_color", Color(0.48, 1.0, 0.58, 1.0))
	label.add_theme_color_override("font_outline_color", Color(0.02, 0.10, 0.04, 0.90))
	label.add_theme_constant_override("outline_size", 4)
	label.z_index = 20
	label.anchor_left = 1.0
	label.anchor_right = 1.0
	label.anchor_top = 0.5
	label.anchor_bottom = 0.5
	label.offset_left = -92.0
	label.offset_right = -12.0
	label.offset_top = -23.0
	label.offset_bottom = 13.0
	label.pivot_offset = Vector2(40.0, 18.0)
	target.add_child(label)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "modulate:a", 0.0, BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.tween_property(label, "scale", Vector2(0.72, 0.72), BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "offset_top", -43.0, BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "offset_bottom", -7.0, BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.chain().tween_callback(Callable(label, "queue_free"))


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
	if _hide_control(shop_panel):
		shop_selected_item_id = ""
		shop_detail_update_queued = false
		_apply_deferred_server_profile_pull_if_idle()
	_clear_shop_refresh_cache()


func _clear_shop_refresh_cache() -> void:
	shop_cached_backpack_slots.clear()
	shop_cached_backpack_counts.clear()
	shop_detail_text_cache.clear()
	shop_equip_check_cache.clear()
	shop_quantity_max_cache.clear()


func _shop_cached_backpack_slots_for_ui() -> Array[Dictionary]:
	if shop_cached_backpack_slots.is_empty():
		shop_cached_backpack_slots = _backpack_slots_for_ui()
	return shop_cached_backpack_slots


func _shop_cached_backpack_counts_for_ui(slots: Array[Dictionary]) -> Dictionary:
	if shop_cached_backpack_counts.is_empty():
		shop_cached_backpack_counts = _backpack_counts_from_slots_for_ui(slots)
	return shop_cached_backpack_counts


func _shop_detail_text_cached(item_id: String, count: int) -> String:
	var cache_key := "%s|%s|%s|%d" % [shop_active_id, shop_mode, item_id, count]
	if not shop_detail_text_cache.has(cache_key):
		shop_detail_text_cache[cache_key] = _shop_detail_text(item_id, count)
	return str(shop_detail_text_cache.get(cache_key, ""))


func _shop_can_equip_item_cached(item_id: String) -> Dictionary:
	if not shop_equip_check_cache.has(item_id):
		shop_equip_check_cache[item_id] = _can_equip_item_for_ui(item_id)
	return (shop_equip_check_cache.get(item_id, {}) as Dictionary).duplicate(true)


func _shop_quantity_max_cached(item_id: String, slots: Array[Dictionary], counts: Dictionary) -> int:
	if not shop_quantity_max_cache.has(item_id):
		shop_quantity_max_cache[item_id] = _shop_quantity_max(item_id, slots, counts)
	return int(shop_quantity_max_cache.get(item_id, 0))


func _set_shop_mode(next_mode: String) -> void:
	shop_mode = "sell" if next_mode == "sell" else "buy"
	shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_quantity = 1
	shop_equip_after_buy = false
	_refresh_shop_panel()


func _apply_shop_detail_text(bbcode_enabled: bool, detail_text: String) -> void:
	if shop_detail_label == null:
		return
	if shop_detail_label.bbcode_enabled != bbcode_enabled:
		shop_detail_label.bbcode_enabled = bbcode_enabled
	if shop_detail_label.text != detail_text:
		shop_detail_label.text = detail_text


func _queue_shop_detail_item(bbcode_enabled: bool, item_id: String, count: int) -> void:
	shop_pending_detail_bbcode_enabled = bbcode_enabled
	shop_pending_detail_item_id = item_id
	shop_pending_detail_count = count
	if not shop_detail_update_queued:
		shop_detail_update_queued = true
		call_deferred("_apply_queued_shop_detail_item")


func _apply_queued_shop_detail_item() -> void:
	shop_detail_update_queued = false
	if shop_panel == null or not shop_panel.visible:
		return
	var detail_text := _shop_detail_text_cached(shop_pending_detail_item_id, shop_pending_detail_count)
	_apply_shop_detail_text(shop_pending_detail_bbcode_enabled, detail_text)


func _select_shop_item(item_id: String, defer_detail_update: bool = false) -> void:
	if shop_selected_item_id == item_id:
		return
	var previous_selected_item_id := shop_selected_item_id
	shop_selected_item_id = item_id
	shop_quantity = 1
	shop_equip_after_buy = false
	_refresh_shop_panel(false, previous_selected_item_id, defer_detail_update)


func _refresh_shop_panel(rebuild_list: bool = true, previous_selected_item_id: String = "", defer_detail_update: bool = false) -> void:
	if shop_panel == null or shop_list_container == null or shop_detail_label == null:
		return
	if rebuild_list:
		player_profile = PlayerProgressModel.normalize_profile(player_profile)
		_clear_shop_refresh_cache()
		if shop_title_label != null:
			shop_title_label.text = ShopCatalogModel.label_for(shop_active_id)
		if shop_coin_label != null:
			var currency := ShopCatalogModel.currency_for(shop_active_id)
			shop_coin_label.text = "%s %d" % [ShopCatalogModel.currency_label(currency), _profile_currency_amount_for_ui(currency)]
		if shop_buy_button != null:
			shop_buy_button.button_pressed = shop_mode == "buy"
		if shop_sell_button != null:
			shop_sell_button.button_pressed = shop_mode == "sell"
	if shop_buy_button != null:
		shop_buy_button.disabled = shop_action_request_pending
	if shop_sell_button != null:
		shop_sell_button.disabled = shop_action_request_pending
	var backpack_slots_cache := _shop_cached_backpack_slots_for_ui()
	var backpack_counts_cache := _shop_cached_backpack_counts_for_ui(backpack_slots_cache)
	var valid_ids: Array[String] = []
	if rebuild_list or shop_item_buttons.is_empty() or shop_selected_item_id == "" or not shop_item_buttons.has(shop_selected_item_id):
		valid_ids = _shop_item_ids_for_mode(shop_mode, backpack_counts_cache)
		if shop_selected_item_id == "" or not valid_ids.has(shop_selected_item_id):
			shop_selected_item_id = valid_ids[0] if not valid_ids.is_empty() else ""
			rebuild_list = true
	if not rebuild_list and shop_item_buttons.is_empty() and not valid_ids.is_empty():
		rebuild_list = true
	if rebuild_list:
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
				button.text = _shop_item_button_text(item_id, int(backpack_counts_cache.get(item_id, 0)))
				button.disabled = shop_action_request_pending
				button.custom_minimum_size = Vector2(0, 58)
				button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				button.pressed.connect(func() -> void:
					_select_shop_item(item_id, true)
				)
				shop_list_container.add_child(button)
				shop_item_buttons[item_id] = button
	else:
		if previous_selected_item_id != "":
			var previous_button = shop_item_buttons.get(previous_selected_item_id)
			if previous_button is Button:
				(previous_button as Button).set_pressed_no_signal(false)
				(previous_button as Button).disabled = shop_action_request_pending
			var current_button = shop_item_buttons.get(shop_selected_item_id)
			if current_button is Button:
				(current_button as Button).set_pressed_no_signal(true)
				(current_button as Button).disabled = shop_action_request_pending
		else:
			for item_id in shop_item_buttons.keys():
					var button = shop_item_buttons.get(str(item_id))
					if button is Button:
						(button as Button).set_pressed_no_signal(str(item_id) == shop_selected_item_id)
						(button as Button).disabled = shop_action_request_pending
	var quantity_max := _shop_quantity_max_cached(shop_selected_item_id, backpack_slots_cache, backpack_counts_cache)
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id, quantity_max)
	var selected_is_equipment := EquipmentModel.is_equipment(shop_selected_item_id)
	if defer_detail_update and not rebuild_list:
		_queue_shop_detail_item(selected_is_equipment, shop_selected_item_id, int(backpack_counts_cache.get(shop_selected_item_id, 0)))
	else:
		var next_detail_text := _shop_detail_text_cached(shop_selected_item_id, int(backpack_counts_cache.get(shop_selected_item_id, 0)))
		_apply_shop_detail_text(selected_is_equipment, next_detail_text)
	_refresh_shop_quantity_controls(quantity_max)
	if selected_is_equipment or (shop_equip_after_buy_button != null and shop_equip_after_buy_button.visible):
		_refresh_shop_equip_after_buy_button(quantity_max)
	if shop_action_button != null:
		var next_action_text := _shop_action_text()
		if shop_action_button.text != next_action_text:
			shop_action_button.text = next_action_text
		var next_disabled := shop_action_request_pending or shop_selected_item_id == "" or quantity_max <= 0
		if shop_action_button.disabled != next_disabled:
			shop_action_button.disabled = next_disabled
	if rebuild_list and shop_repair_button != null:
		shop_repair_button.visible = shop_active_id == FIREBUD_EQUIPMENT_SHOP_ID
	if shop_repair_button != null:
		if shop_repair_button.visible:
			var repair_quote := _equipment_repair_quote_for_ui()
			var missing_durability := int(repair_quote.get("missingDurability", 0))
			var repair_cost := int(repair_quote.get("cost", 0))
			var next_repair_text := "修理中" if shop_action_request_pending else ("修理 %d石币" % repair_cost if missing_durability > 0 else "修理")
			if shop_repair_button.text != next_repair_text:
				shop_repair_button.text = next_repair_text
			var next_repair_disabled := shop_action_request_pending or missing_durability <= 0 or _profile_stone_coins_for_ui() < repair_cost
			if shop_repair_button.disabled != next_repair_disabled:
				shop_repair_button.disabled = next_repair_disabled
		else:
			if shop_repair_button.text != "修理":
				shop_repair_button.text = "修理"
			if not shop_repair_button.disabled:
				shop_repair_button.disabled = true


func _shop_item_ids_for_mode(mode: String, counts: Dictionary = {}) -> Array[String]:
	var result: Array[String] = []
	if mode == "sell":
		var effective_counts := counts if not counts.is_empty() else _backpack_counts_for_ui()
		for entry in ShopCatalogModel.entries_for(shop_active_id):
			var item_id := str(entry.get("itemId", ""))
			if item_id != "" and ShopCatalogModel.is_sellable(shop_active_id, item_id) and int(effective_counts.get(item_id, 0)) > 0:
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


func _shop_item_button_text(item_id: String, count: int = -1) -> String:
	var effective_count := count if count >= 0 else _backpack_item_count_for_ui(item_id)
	var currency_label := ShopCatalogModel.currency_label_for(shop_active_id)
	if shop_mode == "sell":
		return "%s\n可卖 %d%s    持有 %d" % [
			BackpackModel.menu_label_for(item_id),
			ShopCatalogModel.sell_price_for(shop_active_id, item_id),
			currency_label,
			effective_count,
		]
	return "%s\n%d%s    持有 %d" % [
		BackpackModel.menu_label_for(item_id),
		ShopCatalogModel.buy_price_for(shop_active_id, item_id),
		currency_label,
		effective_count,
	]


func _shop_detail_text(item_id: String, count: int = -1) -> String:
	if item_id == "":
		return "请选择道具。"
	var effective_count := count if count >= 0 else _backpack_item_count_for_ui(item_id)
	var lines: Array[String] = []
	lines.append("%s x%d" % [BackpackModel.label_for(item_id), effective_count])
	lines.append(ShopCatalogModel.price_line_for(shop_active_id, item_id))
	if EquipmentModel.is_equipment(item_id):
		lines.append_array(_equipment_compare_detail_lines(item_id))
		lines.append_array(_equipment_detail_lines_with_requirement_status(item_id, true))
	return "\n".join(lines)


func _shop_quantity_max(item_id: String, slots: Array[Dictionary] = [], counts: Dictionary = {}) -> int:
	if item_id == "":
		return 0
	if shop_mode == "sell":
		return int(counts.get(item_id, _backpack_item_count_for_ui(item_id)))
	var buy_price := ShopCatalogModel.buy_price_for(shop_active_id, item_id)
	if buy_price <= 0:
		return 0
	var currency := ShopCatalogModel.currency_for(shop_active_id)
	var affordable := int(floor(float(_profile_currency_amount_for_ui(currency)) / float(buy_price)))
	var capacity := _backpack_available_capacity_for_ui(item_id, slots)
	return mini(999, mini(affordable, capacity))


func _clamped_shop_quantity(value: int, item_id: String, max_quantity: int = -1) -> int:
	var effective_max := max_quantity if max_quantity >= 0 else _shop_quantity_max(item_id)
	if effective_max <= 0:
		return 1
	return clampi(value, 1, effective_max)


func _set_shop_quantity(value: int) -> void:
	shop_quantity = _clamped_shop_quantity(value, shop_selected_item_id)
	_refresh_shop_panel(false)


func _refresh_shop_quantity_controls(max_quantity: int = -1) -> void:
	var effective_max := max_quantity if max_quantity >= 0 else _shop_quantity_max(shop_selected_item_id)
	var controls_enabled := shop_selected_item_id != "" and effective_max > 0 and not shop_action_request_pending
	if shop_quantity_spinbox != null:
		shop_quantity_spinbox.set_block_signals(true)
		if shop_quantity_spinbox.min_value != 1:
			shop_quantity_spinbox.min_value = 1
		var next_max := maxf(1.0, float(effective_max))
		if shop_quantity_spinbox.max_value != next_max:
			shop_quantity_spinbox.max_value = next_max
		var next_value := float(shop_quantity)
		if shop_quantity_spinbox.value != next_value:
			shop_quantity_spinbox.value = next_value
		if shop_quantity_spinbox.editable != controls_enabled:
			shop_quantity_spinbox.editable = controls_enabled
		shop_quantity_spinbox.set_block_signals(false)
	if shop_quantity_minus_button != null:
		var minus_disabled := not controls_enabled or shop_quantity <= 1
		if shop_quantity_minus_button.disabled != minus_disabled:
			shop_quantity_minus_button.disabled = minus_disabled
	if shop_quantity_plus_button != null:
		var plus_disabled := not controls_enabled or shop_quantity >= effective_max
		if shop_quantity_plus_button.disabled != plus_disabled:
			shop_quantity_plus_button.disabled = plus_disabled
	if shop_quantity_max_button != null:
		var max_disabled := not controls_enabled or shop_quantity >= effective_max
		if shop_quantity_max_button.disabled != max_disabled:
			shop_quantity_max_button.disabled = max_disabled


func _refresh_shop_equip_after_buy_button(quantity_max: int = -1) -> void:
	if shop_equip_after_buy_button == null:
		return
	var is_buy_equipment := shop_mode == "buy" and EquipmentModel.is_equipment(shop_selected_item_id)
	shop_equip_after_buy_button.visible = is_buy_equipment
	if not is_buy_equipment:
		shop_equip_after_buy = false
		shop_equip_after_buy_button.button_pressed = false
		shop_equip_after_buy_button.disabled = true
		return
	var equip_check := _shop_can_equip_item_cached(shop_selected_item_id)
	var can_buy := (quantity_max if quantity_max >= 0 else _shop_quantity_max(shop_selected_item_id)) > 0
	var can_equip := bool(equip_check.get("ok", false))
	if not can_buy or not can_equip:
		shop_equip_after_buy = false
	shop_equip_after_buy_button.disabled = shop_action_request_pending or not can_buy or not can_equip
	shop_equip_after_buy_button.button_pressed = shop_equip_after_buy
	shop_equip_after_buy_button.text = "购买后装备" if can_equip else "购买后装备（未满足）"


func _on_shop_equip_after_buy_pressed() -> void:
	if shop_equip_after_buy_button == null or shop_equip_after_buy_button.disabled:
		shop_equip_after_buy = false
	else:
		shop_equip_after_buy = shop_equip_after_buy_button.button_pressed
	_refresh_shop_equip_after_buy_button()
	if shop_action_button != null:
		shop_action_button.text = _shop_action_text()


func _shop_action_text() -> String:
	if shop_selected_item_id == "":
		return "出售" if shop_mode == "sell" else "购买"
	var unit_price := ShopCatalogModel.sell_price_for(shop_active_id, shop_selected_item_id) if shop_mode == "sell" else ShopCatalogModel.buy_price_for(shop_active_id, shop_selected_item_id)
	var total_price := unit_price * shop_quantity
	var currency_label := ShopCatalogModel.currency_label_for(shop_active_id)
	if shop_mode == "sell":
		return "出售 x%d（%d%s）" % [shop_quantity, total_price, currency_label]
	if shop_equip_after_buy and EquipmentModel.is_equipment(shop_selected_item_id):
		return "购买并装备 x%d（%d%s）" % [shop_quantity, total_price, currency_label]
	return "购买 x%d（%d%s）" % [shop_quantity, total_price, currency_label]


func _on_shop_action_pressed() -> void:
	if shop_selected_item_id == "" or shop_action_request_pending:
		return
	if _is_server_account_session():
		await _submit_server_shop_action()
		return
	if _local_profile_mutation_blocked_for_server_only("商店交易"):
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
		if shop_equip_after_buy and EquipmentModel.is_equipment(shop_selected_item_id):
			var equip_result := PlayerProgressModel.equip_item(player_profile, shop_selected_item_id)
			player_profile = equip_result.get("profile", player_profile)
			log_lines.append(str(equip_result.get("message", "")))
			if bool(equip_result.get("ok", false)):
				log_lines.append_array(_record_quest_event_and_maybe_claim({
					"type": "equip_item",
					"itemId": str(equip_result.get("itemId", shop_selected_item_id)),
					"slot": str(equip_result.get("slot", "")),
					"amount": 1,
				}))
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message("\n".join(log_lines))
	if shop_mode == "sell" and _backpack_item_count_for_ui(shop_selected_item_id) <= 0:
		shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id)
	if shop_mode != "buy" or not EquipmentModel.is_equipment(shop_selected_item_id):
		shop_equip_after_buy = false
	_refresh_shop_panel()
	if status_label != null:
		_update_hud_text()


func _submit_server_shop_action() -> void:
	if shop_selected_item_id == "" or not _is_server_account_session():
		return
	var request_mode := shop_mode
	var request_shop_id := shop_active_id
	var request_item_id := shop_selected_item_id
	var request_amount := shop_quantity
	var requested_equip_after_buy := shop_equip_after_buy and request_mode == "buy" and EquipmentModel.is_equipment(request_item_id)
	shop_action_request_pending = true
	_refresh_shop_panel(false)
	var response := await _auto_http_request_spec(ServerAuthClientModel.shop_transaction_request(
		_server_profile_base_url(),
		_server_profile_token(),
		request_mode,
		request_shop_id,
		request_item_id,
		request_amount
	))
	if not _is_server_account_session():
		shop_action_request_pending = false
		return
	var parsed := ServerAuthClientModel.parse_shop_transaction_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "商店交易失败。"))]
	var should_equip_after_buy := false
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message := str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			if requested_equip_after_buy:
				should_equip_after_buy = true
			_mark_progress_ui_caches_dirty()
		else:
			log_lines = [str(parsed.get("message", "商店交易成功。")), "正在读取服务器档案。"]
			for message in parsed.get("questMessages", []):
				var quest_message := str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			_set_world_log_message("\n".join(log_lines))
			var recovery_parsed := await _pull_server_profile_after_authoritative_shop_action()
			if not _is_server_account_session():
				shop_action_request_pending = false
				return
			if bool(recovery_parsed.get("ok", false)) and recovery_parsed.get("profile", null) is Dictionary:
				log_lines = [str(parsed.get("message", "商店交易成功。")), "已刷新服务器档案。"]
				for message in parsed.get("questMessages", []):
					var recovery_quest_message := str(message)
					if recovery_quest_message != "":
						log_lines.append(recovery_quest_message)
				if requested_equip_after_buy:
					should_equip_after_buy = true
			else:
				log_lines = ["商店交易成功，但服务器没有返回档案，请重新拉取。"]
				_queue_server_profile_pull()
	else:
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	if should_equip_after_buy:
		var equip_parsed := await _request_server_equipment_equip(request_item_id, false)
		log_lines.append_array(_string_array_values(equip_parsed.get("logLines", [])))
	shop_action_request_pending = false
	_refresh_shop_after_action(request_mode, request_item_id)
	_set_world_log_message("\n".join(log_lines))
	if status_label != null:
		_update_hud_text()


func _pull_server_profile_after_authoritative_shop_action() -> Dictionary:
	if not _is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "code": "not_server_session"}
	server_profile_sync_state = "loading"
	server_profile_sync_message = "正在读取服务器档案。"
	var response := await _auto_http_request_spec(ServerAuthClientModel.profile_request(
		_server_profile_base_url(),
		_server_profile_token()
	))
	if not _is_server_account_session():
		return {"ok": false, "message": "服务器档案同步已取消。", "code": "session_cancelled"}
	var parsed: Dictionary
	if bool(response.get("ok", false)):
		parsed = ServerAuthClientModel.parse_profile_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	else:
		parsed = {"ok": false, "message": "服务器档案连接失败。", "code": "connection_failed"}
	_apply_server_profile_pull_result(parsed, false)
	return parsed


func _refresh_shop_after_action(previous_mode: String, previous_item_id: String) -> void:
	if previous_mode == "sell" and _backpack_item_count_for_ui(previous_item_id) <= 0:
		shop_selected_item_id = _first_shop_item_id_for_mode(previous_mode)
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id)
	if previous_mode != "buy" or not EquipmentModel.is_equipment(previous_item_id):
		shop_equip_after_buy = false
	_refresh_shop_panel()


func _on_shop_repair_pressed() -> void:
	if shop_action_request_pending:
		return
	if _is_server_account_session():
		await _submit_server_equipment_repair_all()
		return
	if _local_profile_mutation_blocked_for_server_only("装备修理"):
		return
	var result := PlayerProgressModel.repair_all_equipment(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_shop_panel()
	if equipment_panel != null and equipment_panel.visible:
		_refresh_equipment_panel()
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()
	_refresh_quick_bar()
	if status_label != null:
		_update_hud_text()


func _submit_server_equipment_repair_all() -> void:
	if not _is_server_account_session():
		return
	shop_action_request_pending = true
	_refresh_shop_panel()
	var response := await _auto_http_request_spec(ServerAuthClientModel.equipment_repair_all_request(
		_server_profile_base_url(),
		_server_profile_token()
	))
	shop_action_request_pending = false
	if not _is_server_account_session():
		return
	var parsed := ServerAuthClientModel.parse_equipment_repair_all_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "修理失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			_mark_progress_ui_caches_dirty()
		else:
			log_lines = ["修理成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_set_world_log_message("\n".join(log_lines))
	_refresh_shop_panel()
	if equipment_panel != null and equipment_panel.visible:
		_refresh_equipment_panel()
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()
	_refresh_quick_bar()
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


func _create_pet_cultivation_panel() -> void:
	pet_cultivation_panel = _panel_container("PetCultivationPanel")
	pet_cultivation_panel.visible = false
	pet_cultivation_panel.z_index = 37
	pet_cultivation_panel.add_theme_stylebox_override("panel", _pet_rename_panel_style())
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	pet_cultivation_panel.add_child(column)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 10)
	column.add_child(header)
	pet_cultivation_title_label = Label.new()
	pet_cultivation_title_label.text = "宠物培养"
	pet_cultivation_title_label.add_theme_font_size_override("font_size", 20)
	pet_cultivation_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(pet_cultivation_title_label)
	pet_cultivation_close_button = Button.new()
	pet_cultivation_close_button.text = "关闭"
	pet_cultivation_close_button.custom_minimum_size = Vector2(92, 44)
	pet_cultivation_close_button.pressed.connect(_close_pet_cultivation_panel)
	header.add_child(pet_cultivation_close_button)

	var preview_scroll := ScrollContainer.new()
	preview_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(preview_scroll)
	pet_cultivation_preview_label = Label.new()
	pet_cultivation_preview_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pet_cultivation_preview_label.add_theme_font_size_override("font_size", 16)
	pet_cultivation_preview_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview_scroll.add_child(pet_cultivation_preview_label)

	pet_cultivation_confirm_button = Button.new()
	pet_cultivation_confirm_button.text = "确认"
	pet_cultivation_confirm_button.custom_minimum_size = Vector2(0, 46)
	pet_cultivation_confirm_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_cultivation_confirm_button.pressed.connect(_on_pet_cultivation_confirm_pressed)
	column.add_child(pet_cultivation_confirm_button)
	hud_root.add_child(pet_cultivation_panel)


func _open_pet_panel(stable_access_override: bool = false) -> void:
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	pet_panel_stable_access_override = stable_access_override
	pet_panel.visible = true
	var active := PlayerProgressModel.active_pet(player_profile)
	if pet_selected_instance_id == "" or PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id).is_empty():
		pet_selected_instance_id = str(active.get("instanceId", ""))
	_refresh_pet_panel()
	_layout_hud()


func _close_pet_panel() -> void:
	var changed := _hide_control(pet_panel, false)
	pet_panel_stable_access_override = false
	_close_pet_rename_panel()
	_close_pet_cultivation_panel()
	if changed and hud_root != null:
		_layout_hud()


func _pet_panel_has_stable_access() -> bool:
	return pet_panel_stable_access_override or PlayerProgressModel.has_remote_stable(player_profile)


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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
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
	_hide_control(pet_skill_panel)


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


func _sync_pet_skill_move_buttons(_selected: Dictionary, _skill_id: String) -> void:
	if pet_skill_move_up_button != null:
		pet_skill_move_up_button.visible = false
	if pet_skill_move_down_button != null:
		pet_skill_move_down_button.visible = false
	if pet_skill_forget_button != null:
		pet_skill_forget_button.visible = false


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
		pet_skill_learn_option.add_item("空技能  0石币", learnable_count)
		pet_skill_learn_option.set_item_metadata(learnable_count, "")
		learnable_count += 1
		for option in PlayerProgressModel.learnable_pet_skill_options(player_profile, pet_selected_instance_id, pet_skill_trainer_id):
			var skill_id := str(option.get("id", ""))
			if skill_id == "":
				continue
			var cost := int(option.get("cost", PetSkillTrainingModel.DEFAULT_COST))
			var label := "%s  已学" % str(option.get("label", skill_id)) if bool(option.get("learned", false)) else "%s  %d石币" % [str(option.get("label", skill_id)), cost]
			pet_skill_learn_option.add_item(label, learnable_count)
			pet_skill_learn_option.set_item_metadata(learnable_count, skill_id)
			learnable_count += 1
	if learnable_count == 0:
		pet_skill_learn_option.add_item("请选择宠物", 0)
		pet_skill_learn_option.set_item_metadata(0, "")
		pet_skill_learn_button.disabled = true
	else:
		pet_skill_learn_option.select(0)
		pet_skill_learn_button.disabled = selected.is_empty()


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
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_skill_move_slot", {
			"instanceId": pet_selected_instance_id,
			"slot": pet_skill_selected_slot,
			"direction": direction,
		}, "移动宠物技能失败。")
		var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		if bool(parsed.get("ok", false)):
			pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_skill_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("宠物技能调整"):
		return
	var result := PlayerProgressModel.move_pet_skill_slot(player_profile, pet_selected_instance_id, pet_skill_selected_slot, direction)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		if profile_save_enabled:
			_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _on_pet_skill_learn_pressed() -> void:
	if pet_skill_learn_option == null or pet_skill_learn_option.get_item_count() <= 0:
		return
	var index := pet_skill_learn_option.selected
	var skill_id := str(pet_skill_learn_option.get_item_metadata(index))
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var existing_skill_id := _pet_skill_id_for_selected_slot(selected)
	if existing_skill_id != "" and existing_skill_id != skill_id:
		_open_pet_skill_overwrite_dialog(skill_id)
		return
	_apply_pet_skill_to_selected_slot(skill_id)


func _pet_skill_id_for_selected_slot(instance: Dictionary) -> String:
	var slots := PlayerProgressModel.pet_skill_slots_for_instance(instance)
	var slot := clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	return str(slots[slot - 1]) if slot - 1 < slots.size() else ""


func _apply_pet_skill_to_selected_slot(skill_id: String) -> void:
	var slot := clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_skill_set_slot", {
			"instanceId": pet_selected_instance_id,
			"skillId": skill_id,
			"slot": slot,
			"trainerId": pet_skill_trainer_id,
		}, "学习宠物技能失败。")
		var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		if bool(parsed.get("ok", false)):
			pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_skill_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("宠物技能学习"):
		return
	var result := PlayerProgressModel.learn_pet_skill_to_slot(player_profile, pet_selected_instance_id, skill_id, slot, pet_skill_trainer_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		if profile_save_enabled:
			_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _open_pet_skill_overwrite_dialog(skill_id: String) -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var slot := clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var existing_skill_id := _pet_skill_id_for_selected_slot(selected)
	if existing_skill_id == "":
		_apply_pet_skill_to_selected_slot(skill_id)
		return
	var existing_label := BattleActionCatalog.label_for(existing_skill_id, existing_skill_id)
	var next_label := "空技能" if skill_id == "" else BattleActionCatalog.label_for(skill_id, skill_id)
	active_dialog_interaction = {
		"id": "pet_skill_overwrite_%s_%d" % [pet_selected_instance_id, slot],
		"name": "确认覆盖",
		"actionType": DIALOG_ACTION_PET_SKILL_OVERWRITE,
		"instanceId": pet_selected_instance_id,
		"trainerId": pet_skill_trainer_id,
		"slot": slot,
		"skillId": skill_id,
		"option": "覆盖",
		"dialog": [
			"%s 的技%d 当前是%s。" % [str(selected.get("name", "宠物")), slot, existing_label],
			"是否覆盖为%s？" % next_label,
		],
	}
	_update_dialog_text()
	dialog_panel.move_to_front()
	dialog_panel.visible = true
	_layout_hud()


func _apply_pet_skill_overwrite_from_dialog() -> void:
	if active_dialog_interaction.is_empty():
		return
	pet_selected_instance_id = str(active_dialog_interaction.get("instanceId", pet_selected_instance_id))
	pet_skill_trainer_id = str(active_dialog_interaction.get("trainerId", pet_skill_trainer_id))
	pet_skill_selected_slot = clampi(int(active_dialog_interaction.get("slot", pet_skill_selected_slot)), 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var skill_id := str(active_dialog_interaction.get("skillId", ""))
	_close_dialog()
	_apply_pet_skill_to_selected_slot(skill_id)


func _on_pet_skill_forget_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var slots := PlayerProgressModel.pet_skill_slots_for_instance(selected)
	var slot := clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var skill_id := str(slots[slot - 1]) if slot - 1 < slots.size() else ""
	if skill_id == "":
		return
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_skill_forget", {
			"instanceId": pet_selected_instance_id,
			"skillId": skill_id,
		}, "遗忘宠物技能失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_skill_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("宠物技能遗忘"):
		return
	var result := PlayerProgressModel.forget_pet_skill(player_profile, pet_selected_instance_id, skill_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	codex_panel.visible = true
	_refresh_codex_panel()
	_layout_hud()


func _close_codex_panel() -> void:
	_hide_control(codex_panel)


func _open_quest_panel() -> void:
	_dialog_quest()._open_quest_panel()


func _close_quest_panel() -> void:
	_dialog_quest()._close_quest_panel()


func _open_map_panel() -> void:
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
	_close_chat_panel()
	_close_mailbox_panel()
	map_panel.visible = true
	_refresh_map_panel()
	_layout_hud()


func _close_map_panel() -> void:
	_hide_control(map_panel)


func _open_chat_panel() -> void:
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
	_close_map_panel()
	_close_party_panel()
	_close_mailbox_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	chat_panel.visible = true
	_refresh_chat_panel()
	_request_chat_messages()
	_layout_hud()


func _close_chat_panel() -> void:
	_hide_control(chat_panel)


func _chat_channel_button(label: String, channel: String) -> Button:
	var button := Button.new()
	button.text = label
	button.toggle_mode = true
	button.custom_minimum_size = Vector2(0, 42)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.add_theme_font_size_override("font_size", 16)
	button.pressed.connect(func() -> void:
		_set_chat_channel(channel)
	)
	return button


func _chat_channel_is_valid(channel: String) -> bool:
	return channel == CHAT_CHANNEL_SYSTEM or channel == CHAT_CHANNEL_NEARBY or channel == CHAT_CHANNEL_TEAM


func _set_chat_channel(channel: String) -> void:
	chat_active_channel = channel if _chat_channel_is_valid(channel) else CHAT_CHANNEL_SYSTEM
	_refresh_chat_panel()
	if chat_panel != null and chat_panel.visible:
		_request_chat_messages()


func _append_chat_message(channel: String, text: String, author: String = "") -> void:
	var stripped := text.strip_edges()
	if stripped == "":
		return
	var normalized_channel := channel if _chat_channel_is_valid(channel) else CHAT_CHANNEL_SYSTEM
	chat_messages.append({
		"channel": normalized_channel,
		"author": author.strip_edges(),
		"text": stripped,
		"createdAt": "",
		"messageId": "",
	})
	while chat_messages.size() > CHAT_MAX_MESSAGES:
		chat_messages.pop_front()
	if chat_panel != null and chat_panel.visible:
		_refresh_chat_panel()


func _refresh_chat_panel() -> void:
	if chat_panel == null:
		return
	if chat_system_button != null:
		chat_system_button.button_pressed = chat_active_channel == CHAT_CHANNEL_SYSTEM
	if chat_nearby_button != null:
		chat_nearby_button.button_pressed = chat_active_channel == CHAT_CHANNEL_NEARBY
	if chat_team_button != null:
		chat_team_button.button_pressed = chat_active_channel == CHAT_CHANNEL_TEAM
	var lines: Array[String] = []
	for value in chat_messages:
		if not (value is Dictionary):
			continue
		var message := value as Dictionary
		if str(message.get("channel", "")) != chat_active_channel:
			continue
		var author := str(message.get("author", "")).strip_edges()
		var text := str(message.get("text", "")).strip_edges()
		if text == "":
			continue
		lines.append("%s：%s" % [author, text] if author != "" else text)
	if lines.is_empty():
		lines.append("暂无消息。")
	if chat_log_label != null:
		chat_log_label.text = "\n".join(lines)
	if chat_input != null:
		var can_send := chat_active_channel != CHAT_CHANNEL_SYSTEM and _is_server_account_session() and not chat_request_pending
		chat_input.editable = can_send
		if chat_active_channel == CHAT_CHANNEL_SYSTEM:
			chat_input.placeholder_text = "系统频道不可输入"
		elif not _is_server_account_session():
			chat_input.placeholder_text = "需要服务器账号"
		else:
			chat_input.placeholder_text = "输入消息"
	if chat_send_button != null:
		chat_send_button.disabled = chat_active_channel == CHAT_CHANNEL_SYSTEM or not _is_server_account_session() or chat_request_pending
	if chat_refresh_button != null:
		chat_refresh_button.disabled = chat_active_channel == CHAT_CHANNEL_SYSTEM or not _is_server_account_session() or chat_request_pending
	if chat_status_label != null:
		if chat_active_channel == CHAT_CHANNEL_SYSTEM:
			chat_status_label.text = ""
		elif not _is_server_account_session():
			chat_status_label.text = "需要服务器账号登录。"
		elif chat_status_label.text.strip_edges() == "":
			chat_status_label.text = "聊天已同步。"


func _on_chat_send_pressed() -> void:
	if chat_active_channel == CHAT_CHANNEL_SYSTEM or chat_input == null:
		return
	var text := chat_input.text.strip_edges()
	if text == "":
		return
	if not _is_server_account_session():
		if chat_status_label != null:
			chat_status_label.text = "需要服务器账号登录。"
		_refresh_chat_panel()
		return
	_start_chat_request("send", ServerAuthClientModel.chat_send_request(_server_profile_base_url(), _server_profile_token(), chat_active_channel, text))


func _request_chat_messages() -> void:
	if chat_active_channel == CHAT_CHANNEL_SYSTEM:
		_refresh_chat_panel()
		return
	if not _is_server_account_session():
		if chat_status_label != null:
			chat_status_label.text = "需要服务器账号登录。"
		_refresh_chat_panel()
		return
	_start_chat_request("messages", ServerAuthClientModel.chat_messages_request(_server_profile_base_url(), _server_profile_token(), chat_active_channel, CHAT_MAX_MESSAGES))


func _start_chat_request(kind: String, spec: Dictionary) -> void:
	if chat_http_request == null or chat_request_pending:
		return
	chat_pending_kind = kind
	chat_request_pending = true
	if chat_status_label != null:
		chat_status_label.text = "正在发送..." if kind == "send" else "正在读取..."
	_refresh_chat_panel()
	var err := chat_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		chat_request_pending = false
		chat_pending_kind = ""
		if chat_status_label != null:
			chat_status_label.text = "无法发起聊天请求。"
		_refresh_chat_panel()


func _on_chat_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := chat_pending_kind
	chat_pending_kind = ""
	chat_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if chat_status_label != null:
			chat_status_label.text = "聊天服务器连接失败。"
		_refresh_chat_panel()
		return
	if kind == "messages":
		var parsed_messages := ServerAuthClientModel.parse_chat_messages_response(response_code, body)
		if bool(parsed_messages.get("ok", false)):
			var channel := str(parsed_messages.get("channel", chat_active_channel))
			_replace_chat_channel_messages(channel, parsed_messages.get("messages", []))
			if chat_status_label != null:
				chat_status_label.text = "聊天已同步。"
		elif chat_status_label != null:
			chat_status_label.text = str(parsed_messages.get("message", "聊天读取失败。"))
	elif kind == "send":
		var parsed_send := ServerAuthClientModel.parse_chat_send_response(response_code, body)
		if bool(parsed_send.get("ok", false)):
			if chat_input != null:
				chat_input.text = ""
			if chat_status_label != null:
				chat_status_label.text = "消息已发送。"
			_request_chat_messages()
			return
		elif chat_status_label != null:
			chat_status_label.text = str(parsed_send.get("message", "消息发送失败。"))
	_refresh_chat_panel()


func _replace_chat_channel_messages(channel: String, server_messages) -> void:
	var normalized_channel := channel if _chat_channel_is_valid(channel) else CHAT_CHANNEL_NEARBY
	var retained: Array[Dictionary] = []
	for value in chat_messages:
		if value is Dictionary and str((value as Dictionary).get("channel", "")) != normalized_channel:
			retained.append((value as Dictionary).duplicate(true))
	chat_messages = retained
	if server_messages is Array:
		for value in server_messages:
			if value is Dictionary:
				chat_messages.append(_chat_message_from_server(value as Dictionary, normalized_channel))
	while chat_messages.size() > CHAT_MAX_MESSAGES:
		chat_messages.pop_front()


func _chat_message_from_server(message: Dictionary, channel: String) -> Dictionary:
	var author := str(message.get("senderDisplayName", message.get("senderUsername", ""))).strip_edges()
	if author == "":
		author = str(message.get("senderUsername", "")).strip_edges()
	return {
		"channel": channel,
		"author": author,
		"text": str(message.get("text", "")),
		"createdAt": str(message.get("createdAt", "")),
		"messageId": str(message.get("messageId", "")),
	}


func _open_party_panel() -> void:
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if party_panel != null:
		party_panel.visible = true
	_refresh_party_panel()
	_request_party_state()
	_layout_hud()


func _close_party_panel(update_layout: bool = true) -> void:
	_hide_control(party_panel, update_layout)


func _refresh_party_panel() -> void:
	if party_panel == null or party_members_container == null or party_invites_container == null or party_online_container == null:
		return
	_clear_container_children(party_members_container)
	_clear_container_children(party_invites_container)
	_clear_container_children(party_online_container)
	var party_value = party_current_state.get("party", null)
	var party := party_value as Dictionary if party_value is Dictionary else {}
	var members: Array = party.get("members", []) if party.get("members", []) is Array else []
	if party.is_empty() or members.is_empty():
		party_members_container.add_child(_party_info_label("当前没有队伍。"))
	else:
		for value in members:
			if not (value is Dictionary):
				continue
			var member := value as Dictionary
			var role := "队长" if str(member.get("role", "")) == "leader" else "队员"
			party_members_container.add_child(_party_info_label("%s  %s" % [role, _party_player_text(member)]))
	var invites: Array = party_current_state.get("incomingInvites", []) if party_current_state.get("incomingInvites", []) is Array else []
	if invites.is_empty():
		party_invites_container.add_child(_party_info_label("暂无邀请。"))
	else:
		for value in invites:
			if not (value is Dictionary):
				continue
				var invite := value as Dictionary
				var invite_id := str(invite.get("inviteId", ""))
				var invite_kind := str(invite.get("kind", "invite"))
				var row := HBoxContainer.new()
				row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				row.add_theme_constant_override("separation", 8)
				var label := Label.new()
				var invite_player_text := _party_player_text({
					"username": str(invite.get("fromUsername", "")),
					"displayName": str(invite.get("fromDisplayName", "")),
				})
				label.text = "%s 申请加入队伍" % invite_player_text if invite_kind == "application" else "%s 邀请你加入队伍" % invite_player_text
				label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				label.add_theme_font_size_override("font_size", 15)
				row.add_child(label)
				var accept_button := Button.new()
				accept_button.text = "同意" if invite_kind == "application" else "加入"
				accept_button.custom_minimum_size = Vector2(72, 42)
				accept_button.disabled = party_request_pending
				accept_button.pressed.connect(func() -> void:
					_on_party_accept_pressed(invite_id)
				)
				row.add_child(accept_button)
				var decline_button := Button.new()
				decline_button.text = "拒绝"
				decline_button.custom_minimum_size = Vector2(72, 42)
				decline_button.disabled = party_request_pending
				decline_button.pressed.connect(func() -> void:
					_on_party_decline_pressed(invite_id)
				)
				row.add_child(decline_button)
				party_invites_container.add_child(row)
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	var has_online_rows := false
	for value in party_online_players:
		var player := value as Dictionary
		var username := str(player.get("username", "")).strip_edges()
		if username == "":
			continue
		has_online_rows = true
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		var label := Label.new()
		label.text = _party_online_player_text(player)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.add_theme_font_size_override("font_size", 15)
		row.add_child(label)
		var invite_button := Button.new()
		invite_button.custom_minimum_size = Vector2(78, 42)
		var player_party_role := str(player.get("partyRole", "")).strip_edges()
		if username == current_username:
			invite_button.text = "自己"
			invite_button.disabled = true
		elif player_party_role != "":
			invite_button.text = "组队中"
			invite_button.disabled = true
		elif not _party_can_invite():
			invite_button.text = "邀请"
			invite_button.disabled = true
		else:
			invite_button.text = "邀请"
			invite_button.disabled = party_request_pending
			invite_button.pressed.connect(func() -> void:
				_on_party_invite_pressed(username)
			)
		row.add_child(invite_button)
		party_online_container.add_child(row)
	if not has_online_rows:
		party_online_container.add_child(_party_info_label("暂无在线玩家。"))
	_refresh_party_request_controls()


func _clear_container_children(container: Container) -> void:
	for child in container.get_children():
		child.queue_free()


func _party_info_label(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", 15)
	return label


func _party_player_text(player: Dictionary) -> String:
	var display_name := str(player.get("displayName", "")).strip_edges()
	var username := str(player.get("username", "")).strip_edges()
	if display_name == "":
		display_name = username if username != "" else "玩家"
	return "%s（%s）" % [display_name, username] if username != "" and username != display_name else display_name


func _current_party_members() -> Array[Dictionary]:
	var party_value = party_current_state.get("party", null)
	if not (party_value is Dictionary):
		return []
	var party := party_value as Dictionary
	var values: Array = party.get("members", []) if party.get("members", []) is Array else []
	var result: Array[Dictionary] = []
	for value in values:
		if value is Dictionary:
			result.append((value as Dictionary).duplicate(true))
	return result


func _current_account_id_for_party() -> String:
	var account_id := str(current_account_session.get("accountId", "")).strip_edges()
	if account_id != "":
		return account_id
	var summary_value = current_account_session.get("serverProfileSummary", {})
	if summary_value is Dictionary:
		return str((summary_value as Dictionary).get("accountId", "")).strip_edges()
	return ""


func _party_member_is_current_player(member: Dictionary) -> bool:
	var current_account_id := _current_account_id_for_party()
	var member_account_id := str(member.get("accountId", "")).strip_edges()
	if current_account_id != "" and member_account_id == current_account_id:
		return true
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	var username := str(member.get("username", "")).strip_edges()
	return current_username != "" and username == current_username


func _current_party_other_members_for_battle() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for member in _current_party_members():
		if _party_member_is_current_player(member):
			continue
		result.append(member)
		if result.size() >= BATTLE_TEAM_COMPANION_SLOT_NUMBERS.size():
			break
	return result


func _training_partner_raw_count() -> int:
	var partners = player_profile.get("trainingPartners", [])
	if not (partners is Array):
		return 0
	return (partners as Array).size()


func _training_partner_available_slots() -> int:
	return maxi(0, BATTLE_TEAM_COMPANION_SLOT_NUMBERS.size() - _current_party_other_members_for_battle().size())


func _effective_training_partner_count() -> int:
	return mini(_training_partner_raw_count(), _training_partner_available_slots())


func _effective_battle_team_character_count() -> int:
	return 1 + _current_party_other_members_for_battle().size() + _effective_training_partner_count()


func _profile_with_effective_training_partners(limit: int) -> Dictionary:
	var normalized := PlayerProgressModel.normalize_profile(player_profile)
	var partners := PlayerProgressModel.training_partners(normalized)
	var limited: Array[Dictionary] = []
	var count := mini(partners.size(), maxi(0, limit))
	for index in range(count):
		limited.append((partners[index] as Dictionary).duplicate(true))
	normalized["trainingPartners"] = limited
	return PlayerProgressModel.normalize_profile(normalized)


func _local_battle_state_with_current_team(base_state: Dictionary) -> Dictionary:
	var next_state := base_state.duplicate(true)
	var members := _current_party_other_members_for_battle()
	var used_member_slots := mini(members.size(), BATTLE_TEAM_COMPANION_SLOT_NUMBERS.size())
	for index in range(used_member_slots):
		var slot_number := BATTLE_TEAM_COMPANION_SLOT_NUMBERS[index]
		next_state = _battle_state_with_actor(next_state, _party_member_battle_player_actor(members[index], index, slot_number))
		next_state = _battle_state_with_actor(next_state, _party_member_battle_pet_actor(members[index], index, slot_number))
	var partner_slots: Array[int] = []
	for index in range(used_member_slots, BATTLE_TEAM_COMPANION_SLOT_NUMBERS.size()):
		partner_slots.append(BATTLE_TEAM_COMPANION_SLOT_NUMBERS[index])
	next_state["trainingPartnerSlotNumbers"] = partner_slots
	next_state["partyRealMemberActorCount"] = used_member_slots
	next_state["partyTrainingPartnerSlotCount"] = partner_slots.size()
	var battle_profile := _profile_with_effective_training_partners(partner_slots.size())
	return PlayerProgressModel.apply_profile_to_battle_state(battle_profile, next_state)


func _battle_state_with_actor(state: Dictionary, actor: Dictionary) -> Dictionary:
	if actor.is_empty():
		return state
	var next_state := state.duplicate(true)
	var actors: Array = next_state.get("actors", []) if next_state.get("actors", []) is Array else []
	var actor_id := str(actor.get("id", "")).strip_edges()
	if actor_id == "":
		return state
	var replaced := false
	for index in range(actors.size()):
		if actors[index] is Dictionary and str((actors[index] as Dictionary).get("id", "")) == actor_id:
			actors[index] = actor
			replaced = true
			break
	if not replaced:
		actors.append(actor)
	next_state["actors"] = actors
	return next_state


func _party_member_team_snapshot(member: Dictionary) -> Dictionary:
	var snapshot = member.get("teamSnapshot", {})
	return (snapshot as Dictionary).duplicate(true) if snapshot is Dictionary else {}


func _party_member_battle_player_actor(member: Dictionary, index: int, slot_number: int) -> Dictionary:
	var snapshot := _party_member_team_snapshot(member)
	var player_value = snapshot.get("player", {})
	var player_snapshot := player_value as Dictionary if player_value is Dictionary else {}
	var max_hp := maxi(1, int(player_snapshot.get("maxHp", 120)))
	var display_name := str(player_snapshot.get("name", "")).strip_edges()
	if display_name == "":
		display_name = _party_player_text(member)
	return {
		"id": "ally_party_member_%d" % [index + 1],
		"partyMemberUsername": str(member.get("username", "")),
		"accountId": str(member.get("accountId", "")),
		"name": display_name,
		"side": BattleModel.SIDE_ALLY,
		"kind": "player",
		"slotId": BattleModel.slot_id(BattleModel.SIDE_ALLY, BattleModel.ROW_BACK, slot_number),
		"level": maxi(1, int(player_snapshot.get("level", snapshot.get("playerLevel", 1)))),
		"hp": clampi(int(player_snapshot.get("hp", max_hp)), 1, max_hp),
		"maxHp": max_hp,
		"attack": maxi(1, int(player_snapshot.get("attack", 18))),
		"defense": maxi(1, int(player_snapshot.get("defense", 6))),
		"quick": maxi(1, int(player_snapshot.get("quick", player_snapshot.get("speed", 70)))),
		"actionState": "idle",
		"statuses": BattleStatusModel.empty_statuses(),
		"statusResist": {},
		"statusImmune": {},
	}


func _party_member_active_battle_pet(member: Dictionary) -> Dictionary:
	var snapshot := _party_member_team_snapshot(member)
	var pets: Array = snapshot.get("battlePets", []) if snapshot.get("battlePets", []) is Array else []
	var first_pet: Dictionary = {}
	for value in pets:
		if not (value is Dictionary):
			continue
		var pet := value as Dictionary
		if first_pet.is_empty():
			first_pet = pet.duplicate(true)
		if bool(pet.get("activeInBattle", false)) or str(pet.get("state", "")) == BattleModel.PET_STATE_BATTLE:
			return pet.duplicate(true)
	return first_pet


func _party_member_battle_pet_actor(member: Dictionary, index: int, slot_number: int) -> Dictionary:
	var pet := _party_member_active_battle_pet(member)
	if pet.is_empty():
		return {}
	var max_hp := maxi(1, int(pet.get("maxHp", 90)))
	var form_id := str(pet.get("formId", pet.get("speciesId", ""))).strip_edges()
	var actor_id := "ally_party_member_pet_%d" % [index + 1]
	var stat_overrides := {
		"hp": clampi(int(pet.get("hp", max_hp)), 1, max_hp),
		"maxHp": max_hp,
		"quick": maxi(1, int(pet.get("quick", pet.get("speed", 50)))),
		"attack": maxi(1, int(pet.get("attack", 12))),
		"defense": maxi(1, int(pet.get("defense", 6))),
	}
	var actor := PetTemplateCatalog.actor_from_form(
		form_id,
		actor_id,
		BattleModel.SIDE_ALLY,
		"pet",
		BattleModel.slot_id(BattleModel.SIDE_ALLY, BattleModel.ROW_FRONT, slot_number),
		str(pet.get("name", "队友宠物")),
		stat_overrides
	)
	if actor.is_empty():
		actor = {
			"id": actor_id,
			"name": str(pet.get("name", "队友宠物")),
			"side": BattleModel.SIDE_ALLY,
			"kind": "pet",
			"slotId": BattleModel.slot_id(BattleModel.SIDE_ALLY, BattleModel.ROW_FRONT, slot_number),
			"hp": stat_overrides.get("hp", max_hp),
			"maxHp": max_hp,
			"quick": stat_overrides.get("quick", 50),
			"attack": stat_overrides.get("attack", 12),
			"defense": stat_overrides.get("defense", 6),
			"actionState": "idle",
			"petBattleState": BattleModel.PET_STATE_BATTLE,
			"statuses": BattleStatusModel.empty_statuses(),
			"statusResist": {},
			"statusImmune": {},
		}
	actor["partyMemberUsername"] = str(member.get("username", ""))
	actor["accountId"] = str(member.get("accountId", ""))
	actor["petId"] = str(pet.get("petId", pet.get("instanceId", "")))
	actor["instanceId"] = str(pet.get("petId", pet.get("instanceId", "")))
	actor["level"] = maxi(1, int(pet.get("level", 1)))
	actor["activeSkillIds"] = _string_array_values(pet.get("activeSkillIds", []))
	actor["petSkillSlots"] = _string_array_values(pet.get("petSkillSlots", []))
	actor["passiveSkillIds"] = _string_array_values(pet.get("passiveSkillIds", []))
	actor["petBattleState"] = BattleModel.PET_STATE_BATTLE
	return BattlePassiveCatalog.apply_actor_passive_effects(actor)


func _string_array_values(value) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for item in value:
		var text := str(item).strip_edges()
		if text != "":
			result.append(text)
	return result


func _battle_record_summary_text(summary: Dictionary) -> String:
	var target := _party_player_text({
		"username": str(summary.get("targetUsername", "")),
		"displayName": str(summary.get("targetDisplayName", "")),
	})
	var total := maxi(0, int(summary.get("total", 0)))
	var wins := maxi(0, int(summary.get("wins", 0)))
	var losses := maxi(0, int(summary.get("losses", 0)))
	var draws := maxi(0, int(summary.get("draws", 0)))
	if total <= 0:
		return "与%s暂无切磋战绩。" % target
	var draw_text := "，平 %d" % draws if draws > 0 else ""
	return "与%s：共 %d 场，胜 %d，负 %d%s。" % [target, total, wins, losses, draw_text]


func _current_party_role() -> String:
	var party_value = party_current_state.get("party", null)
	if not (party_value is Dictionary):
		return ""
	var party := party_value as Dictionary
	var current_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	if current_account_id != "" and str(party.get("leaderAccountId", "")).strip_edges() == current_account_id:
		return "leader"
	var members: Array = party.get("members", []) if party.get("members", []) is Array else []
	for value in members:
		if not (value is Dictionary):
			continue
		var member := value as Dictionary
		var account_id := str(member.get("accountId", "")).strip_edges()
		var username := str(member.get("username", "")).strip_edges()
		if (current_account_id != "" and account_id == current_account_id) or (current_username != "" and username == current_username):
			return str(member.get("role", "")).strip_edges()
	return ""


func _current_player_is_party_member() -> bool:
	return _current_party_role() == "member"


func _stop_party_member_local_movement(show_message: bool = false) -> void:
	_cancel_server_step_move()
	if player != null:
		player.clear_move_target()
	current_path_cells.clear()
	has_target_marker = false
	has_target_cell = false
	current_path_is_direct = false
	_clear_pending_click_move_target()
	if show_message:
		_set_world_log_message("队伍中由队长带队移动。")
	queue_redraw()


func _should_apply_online_self_position(position: Dictionary) -> bool:
	if position.is_empty():
		return false
	var authority := str(position.get("authority", "")).strip_edges()
	return authority == "party_follow" or (_current_player_is_party_member() and str(position.get("mapId", "")).strip_edges() != "")


func _party_online_player_text(player: Dictionary) -> String:
	var role := str(player.get("partyRole", "")).strip_edges()
	var suffix := ""
	if role == "leader":
		suffix = "  队长"
	elif role == "member":
		suffix = "  队员"
	return "%s%s" % [_party_player_text(player), suffix]


func _party_can_invite() -> bool:
	if not _is_server_account_session() or party_request_pending:
		return false
	var party_value = party_current_state.get("party", null)
	if not (party_value is Dictionary):
		return true
	var party := party_value as Dictionary
	var leader_account_id := str(party.get("leaderAccountId", ""))
	var summary_value = current_account_session.get("serverProfileSummary", {})
	var current_account_id := ""
	if summary_value is Dictionary:
		current_account_id = str((summary_value as Dictionary).get("accountId", ""))
	if current_account_id != "":
		return leader_account_id == current_account_id
	var current_username := str(current_account_session.get("username", "")).strip_edges()
	var members: Array = party.get("members", []) if party.get("members", []) is Array else []
	for value in members:
		if value is Dictionary:
			var member := value as Dictionary
			if str(member.get("username", "")) == current_username:
				return str(member.get("role", "")) == "leader"
	return false


func _refresh_party_request_controls() -> void:
	var has_server_session := _is_server_account_session()
	if party_refresh_button != null:
		party_refresh_button.disabled = party_request_pending or not has_server_session
	if party_leave_button != null:
		party_leave_button.disabled = party_request_pending or not has_server_session or not (party_current_state.get("party", null) is Dictionary)
	if party_status_label != null:
		if not has_server_session:
			party_status_label.text = "需要服务器账号登录。"
		elif party_status_label.text.strip_edges() == "":
			party_status_label.text = "队伍状态已同步。" if not party_request_pending else "正在同步..."


func _request_party_state() -> void:
	if not _is_server_account_session():
		if party_status_label != null:
			party_status_label.text = "需要服务器账号登录。"
		_refresh_party_request_controls()
		return
	_start_party_request("state", ServerAuthClientModel.party_state_request(_server_profile_base_url(), _server_profile_token()))


func _request_party_online() -> void:
	if not _is_server_account_session():
		return
	_start_party_request("online", ServerAuthClientModel.online_players_request(_server_profile_base_url(), _server_profile_token()))


func _on_party_invite_pressed(username: String) -> void:
	if username.strip_edges() == "" or not _is_server_account_session():
		return
	_start_party_request("invite", ServerAuthClientModel.party_invite_request(_server_profile_base_url(), _server_profile_token(), username))


func _on_party_accept_pressed(invite_id: String) -> void:
	if invite_id.strip_edges() == "" or not _is_server_account_session():
		return
	_start_party_request("accept", ServerAuthClientModel.party_invite_accept_request(_server_profile_base_url(), _server_profile_token(), invite_id))


func _on_party_decline_pressed(invite_id: String) -> void:
	if invite_id.strip_edges() == "" or not _is_server_account_session():
		return
	_start_party_request("decline", ServerAuthClientModel.party_invite_decline_request(_server_profile_base_url(), _server_profile_token(), invite_id))


func _on_party_leave_pressed() -> void:
	if not _is_server_account_session():
		return
	_start_party_request("leave", ServerAuthClientModel.party_leave_request(_server_profile_base_url(), _server_profile_token()))


func _start_party_request(kind: String, spec: Dictionary) -> void:
	if party_http_request == null or party_request_pending:
		return
	party_pending_kind = kind
	party_request_pending = true
	_refresh_party_request_controls()
	if party_status_label != null:
		match kind:
			"online":
				party_status_label.text = "正在读取在线玩家..."
			"invite":
				party_status_label.text = "正在发送邀请..."
			"accept":
				party_status_label.text = "正在加入队伍..."
			"decline":
				party_status_label.text = "正在拒绝邀请..."
			"leave":
				party_status_label.text = "正在离开队伍..."
			_:
				party_status_label.text = "正在同步队伍..."
	var err := party_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		party_request_pending = false
		party_pending_kind = ""
		if party_status_label != null:
			party_status_label.text = "无法发起队伍请求。"
		_refresh_party_request_controls()


func _on_party_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := party_pending_kind
	party_pending_kind = ""
	party_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if party_status_label != null:
			party_status_label.text = "队伍服务器连接失败。"
		_refresh_party_request_controls()
		return
	if kind == "state":
		var parsed_state := ServerAuthClientModel.parse_party_state_response(response_code, body)
		if bool(parsed_state.get("ok", false)):
			party_current_state = {
				"party": parsed_state.get("party", null),
				"incomingInvites": parsed_state.get("incomingInvites", []),
				"maxMembers": int(parsed_state.get("maxMembers", 5)),
			}
			if party_status_label != null:
				party_status_label.text = "队伍状态已同步。"
			_refresh_party_panel()
			if training_partner_panel != null and training_partner_panel.visible:
				_refresh_training_partner_panel()
			_update_hud_text(true)
			_request_party_online()
			return
		elif party_status_label != null:
			party_status_label.text = str(parsed_state.get("message", "队伍状态读取失败。"))
	elif kind == "online":
		var parsed_online := ServerAuthClientModel.parse_online_players_response(response_code, body)
		if bool(parsed_online.get("ok", false)):
			party_online_players.clear()
			var raw_players = parsed_online.get("players", [])
			if raw_players is Array:
				for value in raw_players:
					if value is Dictionary:
						party_online_players.append((value as Dictionary).duplicate(true))
			if party_status_label != null:
				party_status_label.text = "在线玩家已刷新。"
		elif party_status_label != null:
			party_status_label.text = str(parsed_online.get("message", "在线玩家读取失败。"))
	else:
		var parsed_action := ServerAuthClientModel.parse_party_action_response(response_code, body)
		if bool(parsed_action.get("ok", false)):
			if party_status_label != null:
				party_status_label.text = str(parsed_action.get("message", "队伍已更新。"))
			_request_party_state()
			return
		elif party_status_label != null:
			party_status_label.text = str(parsed_action.get("message", "队伍操作失败。"))
	_refresh_party_panel()
	_refresh_party_request_controls()


func _open_player_action_panel(target: Dictionary) -> void:
	if battle_active or target.is_empty():
		return
	var username := str(target.get("username", "")).strip_edges()
	if username == "" or username == str(current_account_session.get("username", "")).strip_edges():
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
	_close_map_panel()
	_close_chat_panel()
	_close_party_panel(false)
	_close_mailbox_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	player_action_target = target.duplicate(true)
	if player_action_status_label != null:
		player_action_status_label.text = ""
	if player_action_panel != null:
		player_action_panel.visible = true
	_refresh_player_action_panel()
	_layout_hud()


func _close_player_action_panel(update_layout: bool = true) -> void:
	player_action_target.clear()
	player_action_request_pending = false
	player_action_pending_kind = ""
	_hide_control(player_action_panel, update_layout)


func _refresh_player_action_panel() -> void:
	if player_action_panel == null:
		return
	var has_session := _is_server_account_session()
	var username := str(player_action_target.get("username", "")).strip_edges()
	var target_name := _party_player_text(player_action_target)
	var position := player_action_target.get("position", {}) as Dictionary if player_action_target.get("position", {}) is Dictionary else {}
	var target_party_id := str(player_action_target.get("partyId", "")).strip_edges()
	var target_party_role := str(player_action_target.get("partyRole", "")).strip_edges()
	var current_party_value = party_current_state.get("party", null)
	var current_has_party := current_party_value is Dictionary
	var distance_text := ""
	if player != null and not map_data.is_empty() and str(position.get("mapId", "")) == current_map_id:
		var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
		var target_cell := Vector2i(int(position.get("cellX", 0)), int(position.get("cellY", 0)))
		var distance := maxi(abs(player_cell.x - target_cell.x), abs(player_cell.y - target_cell.y))
		distance_text = "距离%d格" % distance
	if player_action_title_label != null:
		player_action_title_label.text = "玩家互动"
	if player_action_detail_label != null:
		var party_text := "有队伍" if target_party_id != "" else "未组队"
		if target_party_role == "leader":
			party_text = "队长"
		elif target_party_role == "member":
			party_text = "队员"
		player_action_detail_label.text = "%s\n%s%s" % [
			target_name,
			party_text,
			"  %s" % distance_text if distance_text != "" else "",
		]
	var disabled := player_action_request_pending or not has_session or username == ""
	if player_action_battle_button != null:
		player_action_battle_button.disabled = disabled
	if player_action_record_button != null:
		player_action_record_button.disabled = disabled
	if player_action_party_apply_button != null:
		player_action_party_apply_button.disabled = disabled or current_has_party or target_party_id == ""
		player_action_party_apply_button.text = "加入队伍" if target_party_id != "" else "对方未组队"
	if player_action_party_invite_button != null:
		player_action_party_invite_button.disabled = disabled or target_party_role != "" or not _party_can_invite()
		player_action_party_invite_button.text = "邀请入队" if target_party_role == "" else "对方已组队"
	if player_action_close_button != null:
		player_action_close_button.disabled = player_action_request_pending
	if player_action_status_label != null and not has_session:
		player_action_status_label.text = "需要服务器账号登录。"


func _on_player_action_battle_pressed() -> void:
	var username := str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("battle_invite", ServerAuthClientModel.battle_invite_request(_server_profile_base_url(), _server_profile_token(), username))


func _on_player_action_record_pressed() -> void:
	var username := str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("battle_record", ServerAuthClientModel.battle_record_summary_request(_server_profile_base_url(), _server_profile_token(), username))


func _on_player_action_party_apply_pressed() -> void:
	var username := str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("party_apply", ServerAuthClientModel.party_apply_request(_server_profile_base_url(), _server_profile_token(), username))


func _on_player_action_party_invite_pressed() -> void:
	var username := str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("party_invite", ServerAuthClientModel.party_invite_request(_server_profile_base_url(), _server_profile_token(), username))


func _start_player_action_request(kind: String, spec: Dictionary) -> void:
	if player_action_http_request == null or player_action_request_pending:
		return
	player_action_pending_kind = kind
	player_action_request_pending = true
	if player_action_status_label != null:
		match kind:
			"battle_invite":
				player_action_status_label.text = "正在发起切磋..."
			"battle_record":
				player_action_status_label.text = "正在查询战绩..."
			"party_apply":
				player_action_status_label.text = "正在申请入队..."
			"party_invite":
				player_action_status_label.text = "正在邀请入队..."
			_:
				player_action_status_label.text = "正在请求..."
	_refresh_player_action_panel()
	var err := player_action_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		player_action_request_pending = false
		player_action_pending_kind = ""
		if player_action_status_label != null:
			player_action_status_label.text = "请求发送失败。"
		_refresh_player_action_panel()


func _on_player_action_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := player_action_pending_kind
	player_action_pending_kind = ""
	player_action_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if player_action_status_label != null:
			player_action_status_label.text = "服务器连接失败。"
		_refresh_player_action_panel()
		return
	if kind == "battle_invite":
		var parsed_battle := ServerAuthClientModel.parse_battle_action_response(response_code, body)
		if bool(parsed_battle.get("ok", false)):
			if player_action_status_label != null:
				player_action_status_label.text = str(parsed_battle.get("message", "切磋邀请已发送。"))
			_set_world_log_message(str(parsed_battle.get("message", "切磋邀请已发送。")))
		elif player_action_status_label != null:
			player_action_status_label.text = str(parsed_battle.get("message", "切磋发起失败。"))
	elif kind == "battle_record":
		var parsed_record := ServerAuthClientModel.parse_battle_record_summary_response(response_code, body)
		if bool(parsed_record.get("ok", false)):
			var summary := parsed_record.get("summary", {}) as Dictionary if parsed_record.get("summary", {}) is Dictionary else {}
			var record_text := _battle_record_summary_text(summary)
			if player_action_status_label != null:
				player_action_status_label.text = record_text
			_set_world_log_message(record_text)
		elif player_action_status_label != null:
			player_action_status_label.text = str(parsed_record.get("message", "战绩查询失败。"))
	else:
		var parsed_party := ServerAuthClientModel.parse_party_action_response(response_code, body)
		if bool(parsed_party.get("ok", false)):
			if player_action_status_label != null:
				player_action_status_label.text = str(parsed_party.get("message", "队伍请求已发送。"))
			_request_party_state()
		elif player_action_status_label != null:
			player_action_status_label.text = str(parsed_party.get("message", "队伍请求失败。"))
	_refresh_player_action_panel()


func _open_battle_invite_panel(invite: Dictionary) -> void:
	if battle_active or invite.is_empty() or not _battle_invite_is_for_current(invite):
		return
	battle_invite_current = invite.duplicate(true)
	if battle_invite_status_label != null:
		battle_invite_status_label.text = ""
	if battle_invite_panel != null:
		battle_invite_panel.visible = true
	_refresh_battle_invite_panel()
	_layout_hud()


func _close_battle_invite_panel(update_layout: bool = true) -> void:
	battle_invite_current.clear()
	battle_invite_request_pending = false
	battle_invite_pending_kind = ""
	_hide_control(battle_invite_panel, update_layout)


func _refresh_battle_invite_panel() -> void:
	if battle_invite_panel == null:
		return
	var from_player := {
		"username": str(battle_invite_current.get("fromUsername", "")),
		"displayName": str(battle_invite_current.get("fromDisplayName", "")),
	}
	if battle_invite_detail_label != null:
		battle_invite_detail_label.text = "%s 向你发起切磋。" % _party_player_text(from_player)
	var disabled := battle_invite_request_pending or not _is_server_account_session() or str(battle_invite_current.get("inviteId", "")).strip_edges() == ""
	if battle_invite_accept_button != null:
		battle_invite_accept_button.disabled = disabled
	if battle_invite_decline_button != null:
		battle_invite_decline_button.disabled = disabled
	if battle_invite_close_button != null:
		battle_invite_close_button.disabled = battle_invite_request_pending
	if battle_invite_status_label != null and not _is_server_account_session():
		battle_invite_status_label.text = "需要服务器账号登录。"


func _on_battle_invite_accept_pressed() -> void:
	var invite_id := str(battle_invite_current.get("inviteId", "")).strip_edges()
	if invite_id == "" or not _is_server_account_session():
		return
	_start_battle_invite_request("accept", ServerAuthClientModel.battle_invite_accept_request(_server_profile_base_url(), _server_profile_token(), invite_id))


func _on_battle_invite_decline_pressed() -> void:
	var invite_id := str(battle_invite_current.get("inviteId", "")).strip_edges()
	if invite_id == "" or not _is_server_account_session():
		return
	_start_battle_invite_request("decline", ServerAuthClientModel.battle_invite_decline_request(_server_profile_base_url(), _server_profile_token(), invite_id))


func _start_battle_invite_request(kind: String, spec: Dictionary) -> void:
	if battle_invite_http_request == null or battle_invite_request_pending:
		return
	battle_invite_pending_kind = kind
	battle_invite_request_pending = true
	if battle_invite_status_label != null:
		battle_invite_status_label.text = "正在接受切磋..." if kind == "accept" else "正在拒绝切磋..."
	_refresh_battle_invite_panel()
	var err := battle_invite_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		battle_invite_request_pending = false
		battle_invite_pending_kind = ""
		if battle_invite_status_label != null:
			battle_invite_status_label.text = "切磋请求发送失败。"
		_refresh_battle_invite_panel()


func _on_battle_invite_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := battle_invite_pending_kind
	battle_invite_pending_kind = ""
	battle_invite_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if battle_invite_status_label != null:
			battle_invite_status_label.text = "切磋服务器连接失败。"
		_refresh_battle_invite_panel()
		return
	var parsed := ServerAuthClientModel.parse_battle_action_response(response_code, body)
	if bool(parsed.get("ok", false)):
		if kind == "accept":
			var room := parsed.get("room", {}) as Dictionary if parsed.get("room", {}) is Dictionary else {}
			if not room.is_empty():
				_apply_server_battle_room_state(room, true)
			_close_battle_invite_panel()
		else:
			_close_battle_invite_panel()
		_set_world_log_message(str(parsed.get("message", "切磋状态已更新。")))
	elif battle_invite_status_label != null:
		battle_invite_status_label.text = str(parsed.get("message", "切磋操作失败。"))
	_refresh_battle_invite_panel()


func _party_panel_layout_is_usable() -> bool:
	if party_panel == null or not party_panel.visible:
		return false
	var viewport_size := _layout_size()
	var margin := 18.0
	var bottom := party_panel.position.y + party_panel.size.y
	return (
		party_panel.position.x >= -1.0
		and party_panel.position.y >= margin
		and party_panel.size.x <= viewport_size.x - margin * 2.0 + 1.0
		and party_panel.size.y <= viewport_size.y - margin * 2.0 + 1.0
		and bottom <= viewport_size.y - margin + 1.0
	)


func _open_mailbox_panel() -> void:
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
	_close_map_panel()
	_close_chat_panel()
	_close_party_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if mailbox_panel != null:
		mailbox_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_save_profile_after_exp_pill_starter_update()
	_refresh_mailbox_menu_button()
	_refresh_mailbox_panel()
	if _is_server_account_session():
		_request_server_mailbox_inbox()
	_layout_hud()


func _close_mailbox_panel(update_layout: bool = true) -> void:
	_hide_control(mailbox_panel, update_layout)


func _refresh_mailbox_panel() -> void:
	if mailbox_panel == null or mailbox_list_container == null or mailbox_detail_label == null or mailbox_claim_button == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_mailbox_menu_button()
	var messages := _mailbox_combined_entries()
	var selected_exists := false
	for entry in messages:
		if str(entry.get("key", "")) == mailbox_selected_mail_id:
			selected_exists = true
			break
	if not selected_exists:
		mailbox_selected_mail_id = str(messages[0].get("key", "")) if not messages.is_empty() else ""
		mailbox_selected_source = str(messages[0].get("source", "server")) if not messages.is_empty() else "server"
	for child in mailbox_list_container.get_children():
		child.queue_free()
	mailbox_message_buttons.clear()
	if messages.is_empty():
		var empty_label := Label.new()
		empty_label.text = "没有邮件。" if not mailbox_request_pending else "正在读取..."
		empty_label.add_theme_font_size_override("font_size", 16)
		mailbox_list_container.add_child(empty_label)
	else:
		for entry in messages:
			var key := str(entry.get("key", ""))
			var source := str(entry.get("source", "server"))
			var button := Button.new()
			button.text = _mailbox_entry_button_text(entry)
			button.toggle_mode = true
			button.button_pressed = key == mailbox_selected_mail_id
			button.custom_minimum_size = Vector2(0, 72)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			button.add_theme_font_size_override("font_size", 14)
			var captured_key := key
			var captured_source := source
			button.pressed.connect(func() -> void:
				_select_mailbox_message(captured_key, captured_source)
			)
			mailbox_list_container.add_child(button)
			mailbox_message_buttons[key] = button
	var selected := _mailbox_entry_by_key(mailbox_selected_mail_id)
	if selected.is_empty():
		mailbox_detail_label.text = "没有邮件。"
		mailbox_claim_button.disabled = true
		mailbox_claim_button.visible = true
		mailbox_claim_button.tooltip_text = ""
		_refresh_mailbox_request_controls()
		return
	var selected_source := str(selected.get("source", "server"))
	var selected_message := selected.get("message", {}) as Dictionary if selected.get("message", {}) is Dictionary else {}
	if selected_source == "server":
		mailbox_detail_label.text = _server_mailbox_detail_text(selected_message)
		var server_items := _mailbox_item_entries(selected_message)
		mailbox_claim_button.disabled = mailbox_request_pending or server_items.is_empty()
		mailbox_claim_button.visible = true
		mailbox_claim_button.tooltip_text = "附件会放入背包。背包空间不足时，剩余附件会保留在邮箱。" if not server_items.is_empty() else ""
		_refresh_mailbox_request_controls()
		return
	var items := _mailbox_item_entries(selected_message)
	var lines: Array[String] = []
	lines.append(str(selected_message.get("title", "系统邮件")))
	lines.append("来自：%s" % str(selected_message.get("sender", "系统")))
	lines.append("到期：%s" % PlayerProgressModel.mailbox_expiry_text(selected_message))
	var body := str(selected_message.get("body", "")).strip_edges()
	if body != "":
		lines.append("")
		lines.append(body)
	lines.append("")
	lines.append("附件：%s" % BackpackModel.item_amounts_text(items))
	mailbox_detail_label.text = "\n".join(lines)
	mailbox_claim_button.disabled = mailbox_request_pending or items.is_empty()
	mailbox_claim_button.tooltip_text = "附件会放入背包。背包空间不足时，剩余附件会保留在邮箱。"
	_refresh_mailbox_request_controls()


func _select_mailbox_message(mail_id: String, source: String = "local") -> void:
	mailbox_selected_mail_id = mail_id
	mailbox_selected_source = source
	if source == "server":
		var server_mail := _server_mailbox_message_by_key(mail_id)
		if not server_mail.is_empty() and str(server_mail.get("readAt", "")).strip_edges() == "":
			_request_server_mailbox_read(str(server_mail.get("mailId", "")))
	_refresh_mailbox_panel()


func _on_mailbox_claim_pressed() -> void:
	if mailbox_selected_mail_id == "":
		return
	if mailbox_selected_source == "server":
		var server_mail_id := _mailbox_key_id(mailbox_selected_mail_id, "server:")
		if server_mail_id != "":
			_request_server_mailbox_claim(server_mail_id)
		return
	var local_mail_id := _mailbox_key_id(mailbox_selected_mail_id, "local:")
	var result := PlayerProgressModel.mailbox_claim_message(player_profile, local_mail_id)
	player_profile = result.get("profile", player_profile)
	if profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_mailbox_panel()
	_refresh_mailbox_menu_button()
	if backpack_panel != null and backpack_panel.visible:
		_refresh_backpack_panel()
	_update_hud_text(true)


func _refresh_mailbox_menu_button() -> void:
	if mailbox_menu_button == null:
		return
	var count := PlayerProgressModel.mailbox_unclaimed_count(player_profile) + _server_mailbox_unread_count()
	mailbox_menu_button.text = "邮箱" if count <= 0 else "邮箱%d" % count


func _mailbox_combined_entries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for message in mailbox_server_messages:
		var mail_id := str(message.get("mailId", "")).strip_edges()
		if mail_id == "":
			continue
		result.append({
			"key": "server:%s" % mail_id,
			"source": "server",
			"message": message,
		})
	for message in PlayerProgressModel.mailbox_messages(player_profile):
		var mail_id := str(message.get("mailId", "")).strip_edges()
		if mail_id == "":
			continue
		result.append({
			"key": "local:%s" % mail_id,
			"source": "local",
			"message": message,
		})
	return result


func _mailbox_entry_by_key(key: String) -> Dictionary:
	for entry in _mailbox_combined_entries():
		if str(entry.get("key", "")) == key:
			return entry
	return {}


func _mailbox_entry_button_text(entry: Dictionary) -> String:
	var source := str(entry.get("source", "server"))
	var message := entry.get("message", {}) as Dictionary if entry.get("message", {}) is Dictionary else {}
	if source == "server":
		var status := "未读" if str(message.get("readAt", "")).strip_edges() == "" else "已读"
		var title := str(message.get("title", "玩家邮件"))
		var sender := str(message.get("senderDisplayName", message.get("senderUsername", "玩家")))
		return "%s\n%s  %s" % [title, sender, status]
	return PlayerProgressModel.mailbox_message_button_text(message)


func _server_mailbox_detail_text(message: Dictionary) -> String:
	var lines: Array[String] = []
	lines.append(str(message.get("title", "玩家邮件")))
	var sender := str(message.get("senderDisplayName", message.get("senderUsername", "玩家"))).strip_edges()
	if sender == "":
		sender = "玩家"
	lines.append("来自：%s" % sender)
	var created_at := str(message.get("createdAt", "")).strip_edges()
	if created_at != "":
		lines.append("时间：%s" % created_at)
	lines.append("状态：%s" % ("未读" if str(message.get("readAt", "")).strip_edges() == "" else "已读"))
	var body := str(message.get("body", "")).strip_edges()
	if body != "":
		lines.append("")
		lines.append(body)
	var items := _mailbox_item_entries(message)
	lines.append("")
	lines.append("附件：无" if items.is_empty() else "附件：%s" % BackpackModel.item_amounts_text(items))
	return "\n".join(lines)


func _server_mailbox_message_by_key(key: String) -> Dictionary:
	var mail_id := _mailbox_key_id(key, "server:")
	for message in mailbox_server_messages:
		if str(message.get("mailId", "")) == mail_id:
			return message
	return {}


func _server_mailbox_unread_count() -> int:
	var count := 0
	for message in mailbox_server_messages:
		if str(message.get("readAt", "")).strip_edges() == "":
			count += 1
	return count


func _mailbox_key_id(key: String, prefix: String) -> String:
	return key.substr(prefix.length()) if key.begins_with(prefix) else key


func _refresh_mailbox_request_controls() -> void:
	if mailbox_refresh_button != null:
		mailbox_refresh_button.disabled = mailbox_request_pending or not _is_server_account_session()
	if mailbox_send_button != null:
		mailbox_send_button.disabled = mailbox_request_pending or not _is_server_account_session()
	if mailbox_status_label != null and not _is_server_account_session():
		mailbox_status_label.text = "需要服务器账号登录。"


func _request_server_mailbox_inbox() -> void:
	if not _is_server_account_session():
		if mailbox_status_label != null:
			mailbox_status_label.text = "需要服务器账号登录。"
		_refresh_mailbox_request_controls()
		return
	_start_mailbox_request("inbox", ServerAuthClientModel.mail_inbox_request(_server_profile_base_url(), _server_profile_token()))


func _request_server_mailbox_read(mail_id: String) -> void:
	if mail_id.strip_edges() == "" or not _is_server_account_session():
		return
	_start_mailbox_request("read", ServerAuthClientModel.mail_read_request(_server_profile_base_url(), _server_profile_token(), mail_id))


func _request_server_mailbox_claim(mail_id: String) -> void:
	if mail_id.strip_edges() == "" or not _is_server_account_session():
		return
	_start_mailbox_request("claim", ServerAuthClientModel.mail_claim_request(_server_profile_base_url(), _server_profile_token(), mail_id))


func _on_mailbox_send_pressed() -> void:
	if not _is_server_account_session():
		if mailbox_status_label != null:
			mailbox_status_label.text = "需要服务器账号登录。"
		return
	if mailbox_recipient_input == null or mailbox_title_input == null or mailbox_body_input == null:
		return
	var recipient := mailbox_recipient_input.text.strip_edges()
	var title := mailbox_title_input.text.strip_edges()
	var body := mailbox_body_input.text.strip_edges()
	if recipient == "" or title == "" or body == "":
		if mailbox_status_label != null:
			mailbox_status_label.text = "收件账号、标题和正文都要填写。"
		return
	_start_mailbox_request("send", ServerAuthClientModel.mail_send_request(_server_profile_base_url(), _server_profile_token(), recipient, title, body))


func _start_mailbox_request(kind: String, spec: Dictionary) -> void:
	if mailbox_http_request == null:
		return
	if mailbox_request_pending:
		return
	mailbox_pending_kind = kind
	mailbox_request_pending = true
	_refresh_mailbox_request_controls()
	if mailbox_status_label != null:
		mailbox_status_label.text = "正在发送..." if kind == "send" else "正在读取..."
	var err := mailbox_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		mailbox_request_pending = false
		mailbox_pending_kind = ""
		if mailbox_status_label != null:
			mailbox_status_label.text = "无法发起邮箱请求。"
		_refresh_mailbox_request_controls()


func _on_mailbox_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := mailbox_pending_kind
	mailbox_pending_kind = ""
	mailbox_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if mailbox_status_label != null:
			mailbox_status_label.text = "邮箱服务器连接失败。"
		_refresh_mailbox_request_controls()
		return
	if kind == "inbox":
		var parsed_inbox := ServerAuthClientModel.parse_mail_inbox_response(response_code, body)
		if bool(parsed_inbox.get("ok", false)):
			mailbox_server_messages.clear()
			var raw_messages = parsed_inbox.get("messages", [])
			if raw_messages is Array:
				for value in raw_messages:
					if value is Dictionary:
						mailbox_server_messages.append((value as Dictionary).duplicate(true))
			if mailbox_status_label != null:
				mailbox_status_label.text = "邮箱已刷新。"
		elif mailbox_status_label != null:
			mailbox_status_label.text = str(parsed_inbox.get("message", "邮箱读取失败。"))
	elif kind == "send":
		var parsed_send := ServerAuthClientModel.parse_mail_send_response(response_code, body)
		if bool(parsed_send.get("ok", false)):
			if mailbox_title_input != null:
				mailbox_title_input.text = ""
			if mailbox_body_input != null:
				mailbox_body_input.text = ""
			if mailbox_status_label != null:
				mailbox_status_label.text = "邮件已发送。"
			_request_server_mailbox_inbox()
			return
		elif mailbox_status_label != null:
			mailbox_status_label.text = str(parsed_send.get("message", "邮件发送失败。"))
		elif kind == "read":
			var parsed_read := ServerAuthClientModel.parse_mail_read_response(response_code, body)
			if bool(parsed_read.get("ok", false)):
				var read_mail := parsed_read.get("mail", {}) as Dictionary if parsed_read.get("mail", {}) is Dictionary else {}
				for index in range(mailbox_server_messages.size()):
					if str(mailbox_server_messages[index].get("mailId", "")) == str(read_mail.get("mailId", "")):
						mailbox_server_messages[index] = read_mail
						break
			elif mailbox_status_label != null:
				mailbox_status_label.text = str(parsed_read.get("message", "邮件标记失败。"))
		elif kind == "claim":
			var parsed_claim := ServerAuthClientModel.parse_mail_claim_response(response_code, body)
			if bool(parsed_claim.get("ok", false)):
				var server_profile = parsed_claim.get("profile", null)
				if server_profile is Dictionary:
					player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
					if profile_save_enabled:
						PlayerProgressModel.save_profile(player_profile)
				var summary = parsed_claim.get("profileSummary", {})
				if summary is Dictionary:
					_apply_server_profile_summary(summary as Dictionary)
				var claim_mail_id := _mailbox_key_id(mailbox_selected_mail_id, "server:")
				var claim_mail = parsed_claim.get("mail", null)
				var replaced := false
				if claim_mail is Dictionary:
					for index in range(mailbox_server_messages.size()):
						if str(mailbox_server_messages[index].get("mailId", "")) == str((claim_mail as Dictionary).get("mailId", "")):
							mailbox_server_messages[index] = (claim_mail as Dictionary).duplicate(true)
							replaced = true
							break
					if not replaced:
						mailbox_server_messages.append((claim_mail as Dictionary).duplicate(true))
				else:
					for index in range(mailbox_server_messages.size() - 1, -1, -1):
						if str(mailbox_server_messages[index].get("mailId", "")) == claim_mail_id:
							mailbox_server_messages.remove_at(index)
				if mailbox_status_label != null:
					mailbox_status_label.text = str(parsed_claim.get("message", "邮件附件已领取。"))
				_set_world_log_message(str(parsed_claim.get("message", "邮件附件已领取。")))
				if backpack_panel != null and backpack_panel.visible:
					_refresh_backpack_panel()
				_update_hud_text(true)
			elif mailbox_status_label != null:
				mailbox_status_label.text = str(parsed_claim.get("message", "邮件附件领取失败。"))
	_refresh_mailbox_panel()
	_refresh_mailbox_menu_button()
	_refresh_mailbox_request_controls()


func _mailbox_item_entries(message: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_items = message.get("items", [])
	if raw_items is Array:
		for raw_item in raw_items:
			if not (raw_item is Dictionary):
				continue
			var entry := raw_item as Dictionary
			var item_id := str(entry.get("itemId", ""))
			var count := maxi(0, int(entry.get("count", 0)))
			if item_id != "" and count > 0:
				result.append({"itemId": item_id, "count": count})
	return BackpackModel.merge_item_amounts(result)


func _local_player_name() -> String:
	var player_value = player_profile.get("player", {})
	if player_value is Dictionary:
		return str((player_value as Dictionary).get("name", "见习猎人"))
	return "见习猎人"


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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_party_panel()
	_close_auto_settings_panel()
	training_partner_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_layout_hud()
	_refresh_training_partner_panel()
	_layout_hud()
	call_deferred("_layout_hud")


func _close_training_partner_panel() -> void:
	_hide_control(training_partner_panel)


func _refresh_training_partner_panel() -> void:
	if training_partner_panel == null or training_partner_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var count := PlayerProgressModel.training_partner_count(player_profile)
	var real_member_count := _current_party_other_members_for_battle().size()
	var available_slots := _training_partner_available_slots()
	var active_count := mini(count, available_slots)
	var lines: Array[String] = []
	lines.append("队伍：自己 1 / 真人队友 %d / 伙伴 %d，最多 5 人。" % [real_member_count, active_count])
	lines.append("伙伴槽位：%d/%d" % [count, available_slots])
	lines.append("草丛遇敌时，真人队友优先占位，伙伴补满剩余位置。")
	lines.append("陪练会复制加入时的人物和出战宠属性，之后独立获得经验。")
	if count > available_slots:
		lines.append("当前真人队友已占位，本场只会上阵前 %d 个伙伴。" % active_count)
	lines.append("")
	lines.append_array(PlayerProgressModel.training_partner_summary_lines(player_profile))
	training_partner_label.text = "\n".join(lines)
	if training_partner_scroll != null:
		training_partner_scroll.scroll_vertical = 0
	var server_request_pending := _is_server_account_session() and profile_action_request_pending
	if training_partner_add_button != null:
		training_partner_add_button.disabled = server_request_pending or count >= available_slots
	if training_partner_remove_button != null:
		training_partner_remove_button.disabled = server_request_pending or count <= 0
	if training_partner_fill_button != null:
		training_partner_fill_button.disabled = server_request_pending or count >= available_slots
	if training_partner_clear_button != null:
		training_partner_clear_button.disabled = server_request_pending or count <= 0


func _training_partner_panel_layout_is_usable() -> bool:
	if training_partner_panel == null or training_partner_scroll == null or not training_partner_panel.visible:
		return false
	var viewport_size := _layout_size()
	var margin := 18.0
	var bottom := training_partner_panel.position.y + training_partner_panel.size.y
	return (
		training_partner_panel.position.x >= -1.0
		and training_partner_panel.position.y >= margin
		and training_partner_panel.size.x <= viewport_size.x - margin * 2.0 + 1.0
		and training_partner_panel.size.y <= viewport_size.y - margin * 2.0 + 1.0
		and bottom <= viewport_size.y + 1.0
		and training_partner_scroll.size.y >= 80.0
	)


func _set_training_partner_count(count: int) -> void:
	var available_slots := _training_partner_available_slots()
	var target_count := clampi(count, 0, available_slots)
	if _is_server_account_session():
		_refresh_training_partner_panel()
		var parsed := await _submit_server_profile_action("training_partner_set_count", {"count": target_count}, "设置陪练伙伴失败。")
		var log_lines := _string_array_values(parsed.get("logLines", []))
		if log_lines.is_empty():
			var fallback_count := PlayerProgressModel.training_partner_count(player_profile)
			log_lines.append("队伍伙伴 %d/%d。" % [fallback_count, _training_partner_available_slots()])
		_set_world_log_message("\n".join(log_lines))
		_refresh_training_partner_panel()
		_update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("设置陪练伙伴"):
		_refresh_training_partner_panel()
		return
	player_profile = PlayerProgressModel.with_training_partner_count(player_profile, target_count)
	if profile_save_enabled:
		_save_player_profile_now()
	var next_count := PlayerProgressModel.training_partner_count(player_profile)
	_set_world_log_message("队伍伙伴 %d/%d。" % [next_count, available_slots])
	_refresh_training_partner_panel()
	_update_hud_text()


func _on_training_partner_add_pressed() -> void:
	if PlayerProgressModel.training_partner_count(player_profile) >= _training_partner_available_slots():
		_set_world_log_message("队伍槽位已满，请先离队或移除伙伴。")
		_refresh_training_partner_panel()
		return
	await _set_training_partner_count(PlayerProgressModel.training_partner_count(player_profile) + 1)


func _on_training_partner_remove_pressed() -> void:
	await _set_training_partner_count(PlayerProgressModel.training_partner_count(player_profile) - 1)


func _on_training_partner_fill_pressed() -> void:
	await _set_training_partner_count(_training_partner_available_slots())


func _on_training_partner_clear_pressed() -> void:
	await _set_training_partner_count(0)


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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_party_panel()
	auto_settings_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_auto_settings_panel()
	_layout_hud()


func _close_auto_settings_panel() -> void:
	_hide_control(auto_settings_panel)


func _open_qa_panel() -> void:
	if not _can_use_gm_tools():
		_set_world_log_message("当前账号没有GM权限。")
		return
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_party_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_numeric_workbench_panel(false)
	if qa_panel != null:
		qa_panel.visible = true
	_refresh_qa_panel()
	_reset_qa_panel_scrolls()
	_layout_hud()


func _close_qa_panel(update_layout: bool = true) -> void:
	_hide_control(qa_panel, update_layout)


func _open_numeric_workbench_panel() -> void:
	if not _can_use_gm_tools():
		_set_world_log_message("当前账号没有GM权限。")
		return
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
	_close_map_panel()
	_close_chat_panel()
	_close_mailbox_panel()
	_close_party_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if numeric_workbench_panel != null:
		numeric_workbench_panel.visible = true
	_refresh_numeric_workbench_panel()
	_layout_hud()


func _close_numeric_workbench_panel(update_layout: bool = true) -> void:
	_hide_control(numeric_workbench_panel, update_layout)


func _refresh_numeric_workbench_panel() -> void:
	if numeric_workbench_panel == null or numeric_workbench_profile_option == null:
		return
	_refresh_numeric_workbench_profile_options()
	_refresh_numeric_workbench_sample_options()
	_refresh_numeric_workbench_level_options()
	_refresh_numeric_workbench_stage_options()
	_refresh_numeric_workbench_stone_options()
	if numeric_workbench_result_label != null and numeric_workbench_result_label.text.strip_edges() == "":
		numeric_workbench_result_label.text = "[color=#d7c36a]数值实验工作台[/color]\n选择参数后点击模拟。成长和MM转宠会导出CSV，战斗模拟会导出JSON。"


func _refresh_numeric_workbench_profile_options() -> void:
	if numeric_workbench_profile_option == null:
		return
	var previous := numeric_workbench_profile_id
	numeric_workbench_profile_option.clear()
	var selected_index := -1
	for option in NumericWorkbenchModel.pet_growth_profile_options():
		var profile_id := str(option.get("id", ""))
		numeric_workbench_profile_option.add_item(str(option.get("label", profile_id)))
		var index := numeric_workbench_profile_option.get_item_count() - 1
		numeric_workbench_profile_option.set_item_metadata(index, profile_id)
		if profile_id == previous or selected_index < 0:
			selected_index = index
	if selected_index >= 0:
		numeric_workbench_profile_option.select(selected_index)
		numeric_workbench_profile_id = str(numeric_workbench_profile_option.get_item_metadata(selected_index))


func _refresh_numeric_workbench_sample_options() -> void:
	if numeric_workbench_sample_option == null or numeric_workbench_sample_option.get_item_count() > 0:
		return
	for sample_count in [20, 100, 200, 500]:
		numeric_workbench_sample_option.add_item("样本 %d" % sample_count)
		numeric_workbench_sample_option.set_item_metadata(numeric_workbench_sample_option.get_item_count() - 1, sample_count)
	numeric_workbench_sample_option.select(1)


func _refresh_numeric_workbench_level_options() -> void:
	if numeric_workbench_level_option == null or numeric_workbench_level_option.get_item_count() > 0:
		return
	for target_level in [80, 131, 140]:
		numeric_workbench_level_option.add_item("目标 Lv%d" % target_level)
		numeric_workbench_level_option.set_item_metadata(numeric_workbench_level_option.get_item_count() - 1, target_level)
	numeric_workbench_level_option.select(2)


func _refresh_numeric_workbench_stage_options() -> void:
	if numeric_workbench_stage_option == null or numeric_workbench_stage_option.get_item_count() > 0:
		return
	for stage in [PetRebirthMmModel.STAGE_ONE, PetRebirthMmModel.STAGE_TWO]:
		numeric_workbench_stage_option.add_item("%s" % PetRebirthMmModel.helper_name_for_stage(stage))
		numeric_workbench_stage_option.set_item_metadata(numeric_workbench_stage_option.get_item_count() - 1, stage)
	numeric_workbench_stage_option.select(0)


func _refresh_numeric_workbench_stone_options() -> void:
	if numeric_workbench_stone_option == null:
		return
	var previous := numeric_workbench_stone_plan_id
	numeric_workbench_stone_option.clear()
	var selected_index := -1
	for option in NumericWorkbenchModel.stone_plan_options():
		var plan_id := str(option.get("id", ""))
		numeric_workbench_stone_option.add_item(str(option.get("label", plan_id)))
		var index := numeric_workbench_stone_option.get_item_count() - 1
		numeric_workbench_stone_option.set_item_metadata(index, plan_id)
		if plan_id == previous or selected_index < 0:
			selected_index = index
	if selected_index >= 0:
		numeric_workbench_stone_option.select(selected_index)
		numeric_workbench_stone_plan_id = str(numeric_workbench_stone_option.get_item_metadata(selected_index))


func _numeric_workbench_profile_id() -> String:
	if numeric_workbench_profile_id == "" and numeric_workbench_profile_option != null and numeric_workbench_profile_option.get_item_count() > 0:
		return str(numeric_workbench_profile_option.get_item_metadata(numeric_workbench_profile_option.selected))
	return numeric_workbench_profile_id


func _numeric_workbench_sample_count() -> int:
	if numeric_workbench_sample_option == null or numeric_workbench_sample_option.get_item_count() <= 0:
		return NumericWorkbenchModel.DEFAULT_SAMPLE_COUNT
	return int(numeric_workbench_sample_option.get_item_metadata(numeric_workbench_sample_option.selected))


func _numeric_workbench_target_level() -> int:
	if numeric_workbench_level_option == null or numeric_workbench_level_option.get_item_count() <= 0:
		return NumericWorkbenchModel.DEFAULT_TARGET_LEVEL
	return int(numeric_workbench_level_option.get_item_metadata(numeric_workbench_level_option.selected))


func _numeric_workbench_stage() -> int:
	if numeric_workbench_stage_option == null or numeric_workbench_stage_option.get_item_count() <= 0:
		return PetRebirthMmModel.STAGE_ONE
	return int(numeric_workbench_stage_option.get_item_metadata(numeric_workbench_stage_option.selected))


func _numeric_workbench_stone_plan_id() -> String:
	if numeric_workbench_stone_plan_id == "" and numeric_workbench_stone_option != null and numeric_workbench_stone_option.get_item_count() > 0:
		return str(numeric_workbench_stone_option.get_item_metadata(numeric_workbench_stone_option.selected))
	return numeric_workbench_stone_plan_id


func _on_numeric_workbench_growth_pressed() -> void:
	var result := NumericWorkbenchModel.build_pet_growth_report(
		_numeric_workbench_profile_id(),
		_numeric_workbench_sample_count(),
		_numeric_workbench_target_level(),
		true
	)
	_set_numeric_workbench_result(result)


func _on_numeric_workbench_mm_pressed() -> void:
	var result := NumericWorkbenchModel.build_mm_rebirth_report(
		_numeric_workbench_profile_id(),
		_numeric_workbench_sample_count(),
		_numeric_workbench_stage(),
		_numeric_workbench_stone_plan_id(),
		true
	)
	_set_numeric_workbench_result(result)


func _on_numeric_workbench_compare_pressed() -> void:
	var result := NumericWorkbenchModel.build_mm_stone_comparison_report(
		_numeric_workbench_profile_id(),
		_numeric_workbench_sample_count(),
		_numeric_workbench_stage(),
		true
	)
	_set_numeric_workbench_result(result)


func _on_numeric_workbench_battle_pressed() -> void:
	var result := NumericWorkbenchModel.build_battle_report(true)
	_set_numeric_workbench_result(result)


func _on_numeric_workbench_output_pressed() -> void:
	var output_dir := NumericWorkbenchModel.output_dir_path()
	if not DirAccess.dir_exists_absolute(output_dir):
		DirAccess.make_dir_recursive_absolute(output_dir)
	var open_error := OS.shell_open(output_dir)
	if open_error == OK:
		_set_world_log_message("已打开数值实验输出目录。")
	else:
		_set_world_log_message("无法打开输出目录：%s。" % output_dir)


func _set_numeric_workbench_result(result: Dictionary) -> void:
	var lines: Array = result.get("lines", [])
	var text_lines: Array[String] = []
	text_lines.append("[color=#d7c36a]%s[/color]" % str(result.get("title", "数值实验")))
	for line in lines:
		text_lines.append(str(line))
	var output_path := str(result.get("csvPath", result.get("jsonPath", "")))
	if output_path != "":
		text_lines.append("")
		text_lines.append("[color=#9fd7a0]最近输出[/color] %s" % output_path)
	if numeric_workbench_result_label != null:
		numeric_workbench_result_label.text = "\n".join(text_lines)
	var ok := bool(result.get("ok", false))
	_set_world_log_message("%s：%s。" % [str(result.get("title", "数值实验")), "完成" if ok else "失败"])


func _refresh_qa_panel() -> void:
	if qa_panel == null or qa_entry_container == null or qa_detail_label == null:
		return
	QaPanelPresenter.rebuild_entry_buttons(
		qa_entry_container,
		qa_entry_buttons,
		_qa_entry_definitions(),
		Callable(self, "_on_qa_entry_pressed")
	)
	_refresh_qa_pet_tool_controls()
	qa_detail_label.text = _qa_command_summary_text()


func _refresh_qa_pet_tool_controls() -> void:
	var result := QaPanelPresenter.refresh_pet_tool_controls(
		qa_pet_species_option,
		qa_pet_target_option,
		qa_pet_grant_button,
		qa_pet_level_up_button,
		player_profile,
		qa_pet_growth_profile_id,
		qa_pet_level_instance_id
	)
	qa_pet_growth_profile_id = str(result.get("profileId", qa_pet_growth_profile_id))
	qa_pet_level_instance_id = str(result.get("instanceId", qa_pet_level_instance_id))


func _reset_qa_panel_scrolls() -> void:
	QaPanelPresenter.reset_scrolls(qa_entry_scroll, qa_detail_scroll)


func _qa_panel_layout_is_usable() -> bool:
	return QaPanelPresenter.layout_is_usable(qa_panel, qa_entry_scroll, qa_detail_scroll)


func _qa_entry_definitions() -> Array[Dictionary]:
	return QaPanelCatalog.entry_definitions(_gm_battle_speed_multiplier())


func _qa_command_summary_text() -> String:
	return QaPanelCatalog.command_summary_text()


func _gm_allowed_command_ids() -> Array[String]:
	var command_ids := GmToolRuntimeModel.command_ids_from_entries(_qa_entry_definitions())
	for command_id in GM_TOOL_EXTRA_COMMAND_IDS:
		if not command_ids.has(command_id):
			command_ids.append(command_id)
	return command_ids


func _authorize_gm_command(command_id: String) -> bool:
	if auth_auto_bypass:
		return true
	var result := GmToolRuntimeModel.authorize_command(current_account_session, command_id, _gm_allowed_command_ids())
	var ok := bool(result.get("ok", false))
	if not ok:
		_set_world_log_message(str(result.get("message", "当前账号没有GM权限。")))
	GmToolRuntimeModel.audit_command(current_account_session, command_id, ok, str(result.get("message", "")))
	return ok


func _on_qa_entry_pressed(entry_id: String) -> void:
	if not _authorize_gm_command(entry_id):
		return
	match entry_id:
		"gm_map":
			_qa_load_map(GM_10V10_MAP_ID, "default", "已进入GM练级测试场。")
		"gm_10v10_grass":
			_qa_route_to_gm_zone("gm_10v10_grass")
		"gm_capture_grass":
			_qa_route_to_gm_zone("gm_codex_capture_grass")
		"gm_knockaway_grass":
			_qa_route_to_gm_zone("gm_high_knockaway_grass")
		"firebud_village":
			_qa_load_map("firebud_village_gate", "from_training_yard", "已回到火芽村入口。")
		"gm_battle_speed_gear":
			_cycle_gm_battle_speed_gear()
		"open_numeric_workbench":
			_open_numeric_workbench_panel()
		"open_backpack":
			_close_qa_panel(false)
			_open_backpack_panel()
		"open_item_shop":
			_close_qa_panel(false)
			_open_shop_panel(ShopCatalogModel.DEFAULT_SHOP_ID)
		"open_equipment_shop":
			_close_qa_panel(false)
			_open_shop_panel(FIREBUD_EQUIPMENT_SHOP_ID)
		"open_equipment":
			_close_qa_panel(false)
			_open_equipment_panel()
		"open_quest":
			_close_qa_panel(false)
			_open_quest_panel()
		"open_auto_battle":
			_qa_open_auto_settings("battle")
		"open_auto_capture":
			_qa_open_auto_settings("capture")
		"open_partner":
			_close_qa_panel(false)
			_open_training_partner_panel()
		"open_pet":
			_close_qa_panel(false)
			_open_pet_panel(false)
		"open_stable":
			_close_qa_panel(false)
			_open_pet_panel(true)
			_set_world_log_message("GM测试：已打开兽栏。")
		"open_rebirth_preview":
			_close_qa_panel(false)
			_open_player_rebirth_preview_panel()
		"open_codex":
			_close_qa_panel(false)
			_open_codex_panel()


func _on_qa_pet_grant_pressed() -> void:
	if not _authorize_gm_command("gm_grant_pet"):
		return
	var profile_id := qa_pet_growth_profile_id
	if profile_id == "" and qa_pet_species_option != null and qa_pet_species_option.get_item_count() > 0:
		profile_id = str(qa_pet_species_option.get_item_metadata(qa_pet_species_option.selected))
	var result := PlayerProgressModel.gm_grant_growth_pet(player_profile, profile_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		qa_pet_level_instance_id = str(result.get("instanceId", qa_pet_level_instance_id))
		pet_selected_instance_id = qa_pet_level_instance_id
		pet_detail_mode = PET_DETAIL_MODE_GROWTH
		if profile_save_enabled:
			_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_qa_pet_tool_controls()
	_refresh_qa_panel()


func _on_qa_pet_level_up_pressed() -> void:
	if not _authorize_gm_command("gm_level_pet"):
		return
	if qa_pet_level_instance_id == "":
		_set_world_log_message("请选择要升级的宠物。")
		return
	var result := PlayerProgressModel.gm_level_up_pet_once(player_profile, qa_pet_level_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = qa_pet_level_instance_id
		var updated = result.get("pet", {})
		pet_detail_mode = PET_DETAIL_MODE_GROWTH if updated is Dictionary and str((updated as Dictionary).get("growthSpeciesProfileId", "")).strip_edges() != "" else PET_DETAIL_MODE_INSTANCE
		if profile_save_enabled:
			_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_qa_pet_tool_controls()
	_refresh_qa_panel()


func _qa_open_auto_settings(tab_id: String) -> void:
	auto_settings_active_tab = tab_id
	_close_qa_panel(false)
	_open_auto_settings_panel()


func _gm_battle_speed_multiplier() -> int:
	return clampi(gm_battle_speed_multiplier, GM_BATTLE_SPEED_MIN, GM_BATTLE_SPEED_MAX)


func _set_gm_speed_multiplier(value: int) -> void:
	gm_battle_speed_multiplier = clampi(value, GM_BATTLE_SPEED_MIN, GM_BATTLE_SPEED_MAX)
	_sync_gm_speed_multiplier()


func _sync_gm_speed_multiplier() -> void:
	var multiplier := float(_gm_battle_speed_multiplier())
	if player != null and player.has_method("set_speed_multiplier"):
		player.set_speed_multiplier(multiplier)
	if pet != null and pet.has_method("set_speed_multiplier"):
		pet.set_speed_multiplier(multiplier)


func _scaled_battle_delta(delta: float) -> float:
	return delta * float(_gm_battle_speed_multiplier())


func _cycle_gm_battle_speed_gear() -> void:
	var current := _gm_battle_speed_multiplier()
	_set_gm_speed_multiplier(GM_BATTLE_SPEED_MIN if current >= GM_BATTLE_SPEED_MAX else maxi(2, current + 1))
	_refresh_qa_panel()
	_set_world_log_message("GM变速齿轮：测试速度 x%d。" % _gm_battle_speed_multiplier())
	_layout_hud()


func _qa_load_map(map_id: String, spawn_name: String, message: String) -> void:
	_close_qa_panel(false)
	if _load_map(map_id, spawn_name):
		_set_world_log_message(message)
	else:
		_set_world_log_message("GM入口暂时无法载入地图。")
	_layout_hud()


func _qa_route_to_gm_zone(zone_id: String) -> void:
	_close_qa_panel(false)
	if current_map_id != GM_10V10_MAP_ID:
		if not _load_map(GM_10V10_MAP_ID, "default"):
			_set_world_log_message("GM测试场暂时无法载入。")
			return
	var zone := _encounter_zone_by_id(zone_id)
	if zone.is_empty():
		_set_world_log_message("GM测试草丛不存在：%s。" % zone_id)
		return
	var cell := EncounterModel.first_walkable_cell(map_data, zone)
	if _set_move_target_cell(cell, IsoMapModel.grid_to_world(map_data, cell), cell):
		_set_world_log_message("正在前往%s。" % str(zone.get("name", "GM草丛")))
	else:
		_set_world_log_message("暂时无法前往%s。" % str(zone.get("name", "GM草丛")))
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
	_add_auto_settings_option(
		"低血动作",
		HangSettingsModel.LOW_HP_ACTION_KEY,
		HangSettingsModel.low_hp_action_options(),
		str(settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP))
	)
	_add_auto_settings_checkbox(
		"治疗后继续",
		HangSettingsModel.RESUME_AFTER_HEAL_KEY,
		bool(settings.get(HangSettingsModel.RESUME_AFTER_HEAL_KEY, true))
	)
	_add_auto_settings_int_spinbox(
		"捕宠目标",
		HangSettingsModel.CAPTURE_TARGET_COUNT_KEY,
		int(settings.get(HangSettingsModel.CAPTURE_TARGET_COUNT_KEY, 0)),
		0,
		HangSettingsModel.MAX_CAPTURE_TARGET_COUNT,
		"只"
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
			_save_player_profile_now()
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
			"label": _equipment_spirit_label_with_source(spirit_id),
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
		if not action.is_empty() and str(action.get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT:
			if not equipped_spirits.has(option_id):
				continue
			options.append({
			"id": option_id,
			"label": _equipment_spirit_label_with_source(option_id),
			})
		else:
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
	if _hang_settings_keys().has(key):
		_set_hang_settings_value(key, value)
		return
	if _auto_capture_settings_keys().has(key):
		_set_auto_capture_settings_value(key, value)
		return
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	settings[key] = int(value) if key == AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY or key == AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY else value
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	if profile_save_enabled:
		_save_player_profile_now()


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


func _hang_settings_keys() -> Array[String]:
	return [
		HangSettingsModel.LOW_HP_STOP_PERCENT_KEY,
		HangSettingsModel.LOW_HP_ACTION_KEY,
		HangSettingsModel.RESUME_AFTER_HEAL_KEY,
		HangSettingsModel.CAPTURE_TARGET_COUNT_KEY,
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
		_save_player_profile_now()


func _set_hang_settings_value(key: String, value) -> void:
	var settings := PlayerProgressModel.hang_settings(player_profile)
	match key:
		HangSettingsModel.LOW_HP_STOP_PERCENT_KEY:
			settings[key] = HangSettingsModel.normalized_low_hp_stop_percent(value)
		HangSettingsModel.LOW_HP_ACTION_KEY:
			settings[key] = HangSettingsModel.normalized_low_hp_action(value)
		HangSettingsModel.RESUME_AFTER_HEAL_KEY:
			settings[key] = bool(value)
		HangSettingsModel.CAPTURE_TARGET_COUNT_KEY:
			settings[key] = clampi(int(value), 0, HangSettingsModel.MAX_CAPTURE_TARGET_COUNT)
	player_profile = PlayerProgressModel.with_hang_settings(player_profile, settings)
	if profile_save_enabled:
		_save_player_profile_now()


func _set_auto_settings_heal_priority(index: int, source_id: String) -> void:
	var settings := PlayerProgressModel.auto_battle_settings(player_profile)
	var priority := _auto_settings_heal_priority_slots(settings)
	if index >= 0 and index < priority.size():
		priority[index] = AutoBattleSettingsModel.normalized_heal_source(source_id)
	settings[AutoBattleSettingsModel.HEAL_PRIORITY_KEY] = priority
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	if profile_save_enabled:
		_save_player_profile_now()
	_refresh_auto_settings_panel()


func _refresh_quest_panel() -> void:
	_dialog_quest()._refresh_quest_panel()


func _set_quest_reward_controls(quest: Dictionary, status: String) -> void:
	_dialog_quest()._set_quest_reward_controls(quest, status)


func _on_quest_reward_choice_selected(index: int) -> void:
	_dialog_quest()._on_quest_reward_choice_selected(index)


func _on_quest_claim_pressed() -> void:
	await _dialog_quest()._on_quest_claim_pressed()


func _on_quest_route_pressed() -> void:
	_dialog_quest()._on_quest_route_pressed()


func _on_task_tracker_route_pressed() -> void:
	_dialog_quest()._on_task_tracker_route_pressed()


func _refresh_task_route_button() -> void:
	_dialog_quest()._refresh_task_route_button()


func _current_task_navigation_target() -> Dictionary:
	_refresh_task_tracker_cache_if_needed(true)
	return task_tracker_target_cache.duplicate(true)


func _current_task_navigation_target_cached() -> Dictionary:
	_refresh_task_tracker_cache_if_needed(false)
	return task_tracker_target_cache.duplicate(true)


func _task_tracker_has_navigation_target_cached() -> bool:
	_refresh_task_tracker_cache_if_needed(false)
	return task_tracker_has_target_cache


func _current_task_navigation_target_uncached() -> Dictionary:
	var quest := PlayerProgressModel.active_quest(player_profile)
	if not quest.is_empty():
		return _navigation_target_for_quest(quest)
	var available_quest := _first_available_unfinished_quest_for_tracker()
	if not available_quest.is_empty():
		return _navigation_target_for_interaction_id(QuestModel.giver_id_for(available_quest))
	var mm_guide := _pet_rebirth_mm_guide_task_info(true)
	if not mm_guide.is_empty():
		var mm_target_value = mm_guide.get("target", {})
		return mm_target_value as Dictionary if mm_target_value is Dictionary else {}
	var trial := _rebirth_trial_task_info(true)
	var target_value = trial.get("target", {})
	return target_value as Dictionary if target_value is Dictionary else {}


func _navigation_target_for_quest(quest: Dictionary) -> Dictionary:
	if quest.is_empty():
		return {}
	var quest_id := str(quest.get("id", ""))
	if quest_id != "" and quest_id == PlayerProgressModel.active_quest_id(player_profile) and PlayerProgressModel.can_claim_active_quest(player_profile):
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
		"use_spirit":
			return _navigation_target_for_encounter_group(str(objective.get("encounterGroupId", "")))
		"battle_victory":
			return _navigation_target_for_encounter_group(str(objective.get("encounterGroupId", "")))
		"capture_pet":
			return _navigation_target_for_capture_objective(objective)
	return {}


func _first_available_unfinished_quest_for_tracker() -> Dictionary:
	var normalized := PlayerProgressModel.normalize_profile(player_profile)
	for quest in QuestModel.quests():
		if QuestModel.is_optional(quest):
			continue
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := PlayerProgressModel.quest_state_for_id(normalized, quest_id)
		if str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			continue
		if PlayerProgressModel.quest_available_for_profile(normalized, quest):
			return quest
	return {}


func _pet_rebirth_mm_guide_task_info(include_target: bool = false) -> Dictionary:
	var info := PlayerProgressModel.pet_rebirth_mm_guide_info(player_profile)
	var status := str(info.get("status", ""))
	if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED:
		return {}
	var result := info.duplicate(true)
	if include_target:
		result["target"] = _pet_rebirth_mm_guide_navigation_target(info)
	return result


func _pet_rebirth_mm_guide_navigation_target(info: Dictionary) -> Dictionary:
	match str(info.get("step", "")):
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_START, PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_CLAIM_MM:
			return _navigation_target_for_interaction_id("firebud_pet_mm_trial_mentor")
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_WITHDRAW_MM:
			return _navigation_target_for_interaction_id("firebud_stable_keeper")
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_FEED_MM, PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_LEVEL_MM:
			return _navigation_target_for_shop("firebud_diamond_shop")
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_PREPARE_TARGET:
			return _navigation_target_for_interaction_id("firebud_stable_keeper")
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_REBIRTH:
			return _navigation_target_for_pet_panel("打开宠物界面执行转强")
	return {}


func _rebirth_trial_task_info(include_target: bool = false) -> Dictionary:
	var normalized := PlayerProgressModel.normalize_profile(player_profile)
	var target_count := PlayerProgressModel.rebirth_count(normalized) + 1
	var max_target := RebirthTrialModel.stages().size()
	if target_count < 1 or target_count > max_target:
		return {}
	if not _rebirth_quest_completed_for_target(normalized, target_count):
		return {}
	var stage_label := _rebirth_target_label(target_count)
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	if player_level < 80:
		var low_level_info := {
			"title": "%s试炼：提升等级" % stage_label,
			"taskText": "%s试炼 - 人物需要 Lv80" % stage_label,
			"detailLines": [
				"转生阶段：%s" % stage_label,
				"目标：人物达到 Lv80。",
				"当前：Lv%d。" % player_level,
			],
		}
		if include_target:
			low_level_info["target"] = _navigation_target_for_interaction_id("trainer")
		return low_level_info
	var missing_ring := _first_missing_rebirth_ring(normalized, target_count)
	if not missing_ring.is_empty():
		var ring_name := str(missing_ring.get("ringName", BackpackModel.label_for(str(missing_ring.get("ringItemId", "")), "元素戒指")))
		var cave_name := str(missing_ring.get("caveName", "元素洞穴"))
		var owned_rings := _owned_rebirth_ring_count(normalized, target_count)
		var guardian_group_value = missing_ring.get("guardianGroup", {})
		var guardian_group := guardian_group_value as Dictionary if guardian_group_value is Dictionary else {}
		var ring_info := {
			"title": "%s试炼：%s" % [stage_label, ring_name],
			"taskText": "%s试炼 - 取得%s" % [stage_label, ring_name],
			"detailLines": [
				"转生阶段：%s" % stage_label,
				"目标：取得%s。" % ring_name,
				"地点：%s，进入后到最后一层击败守护兽。" % cave_name,
				"进度：元素戒指 %d/4。" % owned_rings,
			],
		}
		if include_target:
			ring_info["target"] = _navigation_target_for_cave_progress(
				RebirthTrialModel.floor_map_ids_for_cave(missing_ring),
				RebirthTrialModel.guardian_floor_map_id_for_cave(missing_ring),
				str(guardian_group.get("id", "")),
				"%s入口" % cave_name,
				str(guardian_group.get("centerName", "%s守护兽" % cave_name))
			)
		return ring_info
	var missing_beast := _first_missing_rebirth_beast(normalized, target_count)
	if not missing_beast.is_empty():
		var beast_name := str(missing_beast.get("name", "转生兽"))
		var final_cave := RebirthTrialModel.final_cave()
		var final_cave_name := str(final_cave.get("name", "玄影洞窟"))
		var beast_info := {
			"title": "%s试炼：%s" % [stage_label, beast_name],
			"taskText": "%s试炼 - 捕捉%s" % [stage_label, beast_name],
			"detailLines": [
				"转生阶段：%s" % stage_label,
				"目标：捕捉%s Lv50。" % beast_name,
				"地点：%s前三层。" % final_cave_name,
			],
		}
		if include_target:
			var capture_objective := {
				"formId": str(missing_beast.get("formId", "")),
			}
			beast_info["target"] = _navigation_target_for_capture_objective_in_cave(
				RebirthTrialModel.floor_map_ids_for_final_cave(),
				RebirthTrialModel.capture_floor_map_ids_for_final_cave(),
				capture_objective,
				"%s入口" % final_cave_name
			)
		return beast_info
	if PlayerProgressModel.rebirth_trial_proof_count(normalized, PlayerProgressModel.REBIRTH_FINAL_BOSS_PROOF_ID) <= 0:
		var final_cave := RebirthTrialModel.final_cave()
		var final_cave_name := str(final_cave.get("name", "玄影洞窟"))
		var boss_group_value = final_cave.get("rebirthBossGroup", {})
		var boss_group := boss_group_value as Dictionary if boss_group_value is Dictionary else {}
		var boss_info := {
			"title": "%s试炼：玄影守护" % stage_label,
			"taskText": "%s试炼 - 挑战%s顶层" % [stage_label, final_cave_name],
			"detailLines": [
				"转生阶段：%s" % stage_label,
				"目标：登上%s第5层，击败顶层守护。" % final_cave_name,
				"完成后会记录玄影守护证明。",
			],
		}
		if include_target:
			boss_info["target"] = _navigation_target_for_cave_progress(
				RebirthTrialModel.floor_map_ids_for_final_cave(),
				RebirthTrialModel.boss_floor_map_id_for_final_cave(),
				str(boss_group.get("id", "")),
				"%s入口" % final_cave_name,
				"%s顶层" % final_cave_name
			)
		return boss_info
	var ready_info := {
		"title": "%s试炼：找导师转生" % stage_label,
		"taskText": "%s试炼已完成 - 找导师转生" % stage_label,
		"detailLines": [
			"转生阶段：%s" % stage_label,
			"四枚元素戒指、转生兽、玄影守护证明都已满足。",
			"目标：回到转生导师阿岚处执行转生。",
		],
	}
	if include_target:
		ready_info["target"] = _navigation_target_for_interaction_id("firebud_rebirth_mentor")
	return ready_info


func _rebirth_quest_completed_for_target(profile: Dictionary, target_count: int) -> bool:
	var quest_id := "rebirth_%d" % clampi(target_count, 1, 6)
	var completions = profile.get("rebirthQuestCompletions", [])
	if not (completions is Array):
		return false
	for value in completions:
		if str(value) == quest_id:
			return true
	return false


func _first_missing_rebirth_ring(profile: Dictionary, target_count: int) -> Dictionary:
	for cave in RebirthTrialModel.element_caves():
		var ring_id := str(cave.get("ringItemId", ""))
		if ring_id != "" and RebirthTrialModel.stage_required_ring_ids(target_count).has(ring_id) and PlayerProgressModel.backpack_item_count(profile, ring_id) <= 0:
			return cave
	return {}


func _owned_rebirth_ring_count(profile: Dictionary, target_count: int) -> int:
	var count := 0
	for ring_id in RebirthTrialModel.stage_required_ring_ids(target_count):
		if PlayerProgressModel.backpack_item_count(profile, ring_id) > 0:
			count += 1
	return count


func _first_missing_rebirth_beast(profile: Dictionary, target_count: int) -> Dictionary:
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target_count):
		if not _profile_has_pet_form(profile, form_id):
			var beast := _rebirth_beast_for_form_id(form_id)
			if not beast.is_empty():
				return beast
			return {
				"formId": form_id,
				"name": str(PetTemplateCatalog.runtime_template_for_form(form_id).get("formName", "转生兽")),
			}
	return {}


func _rebirth_beast_for_form_id(form_id: String) -> Dictionary:
	for beast in RebirthTrialModel.rebirth_beasts():
		if str(beast.get("formId", "")) == form_id:
			return beast
	return {}


func _rebirth_target_label(target_count: int) -> String:
	match clampi(target_count, 1, 6):
		1:
			return "一转"
		2:
			return "二转"
		3:
			return "三转"
		4:
			return "四转"
		5:
			return "五转"
		_:
			return "六转"


func _refresh_map_panel() -> void:
	if map_panel == null or map_texture_rect == null or map_detail_label == null or map_marker_container == null:
		return
	map_texture_rect.texture = _map_minimap_texture()
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var target_text := "无"
	if has_target_cell:
		target_text = "%d,%d" % [target_cell.x, target_cell.y]
	map_detail_label.text = "地图：%s\n坐标：%d,%d    目标：%s" % [
		str(map_data.get("name", "未知地图")),
		player_cell.x,
		player_cell.y,
		target_text,
	]
	for child in map_marker_container.get_children():
		child.queue_free()
	map_marker_buttons.clear()
	for target in _map_targets_for_current_map():
		var captured_target := target.duplicate(true)
		var button := Button.new()
		button.text = _map_target_button_text(captured_target)
		button.custom_minimum_size = Vector2(0, 42)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 15)
		button.pressed.connect(func() -> void:
			_on_map_marker_pressed(captured_target)
		)
		map_marker_container.add_child(button)
		map_marker_buttons[str(captured_target.get("id", captured_target.get("label", "")))] = button
	if map_marker_buttons.is_empty():
		var empty_label := Label.new()
		empty_label.text = "当前地图暂无可寻路标记。"
		empty_label.add_theme_font_size_override("font_size", 15)
		map_marker_container.add_child(empty_label)


func _map_targets_for_current_map() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for value in InteractionModel.interaction_points(map_data):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		var item_id := str(item.get("id", ""))
		if item_id == "":
			continue
		result.append(_navigation_target_from_interaction(current_map_id, item))
	for value in EncounterModel.encounter_zones(map_data):
		if not (value is Dictionary):
			continue
		var zone := value as Dictionary
		if EncounterModel.is_manual_only(zone):
			continue
		var zone_id := str(zone.get("id", ""))
		if zone_id == "":
			continue
		result.append({
			"id": "zone:%s" % zone_id,
			"kind": "encounter_zone",
			"mapId": current_map_id,
			"label": str(zone.get("name", "野外")),
			"zone": zone,
			"cell": EncounterModel.first_walkable_cell(map_data, zone),
			"sortRank": 90,
		})
	result.sort_custom(_map_target_less)
	return result


func _map_target_less(a: Dictionary, b: Dictionary) -> bool:
	var rank_a := int(a.get("sortRank", 99))
	var rank_b := int(b.get("sortRank", 99))
	if rank_a != rank_b:
		return rank_a < rank_b
	var label_a := str(a.get("label", ""))
	var label_b := str(b.get("label", ""))
	if label_a != label_b:
		return label_a < label_b
	return str(a.get("id", "")) < str(b.get("id", ""))


func _map_target_button_text(target: Dictionary) -> String:
	var kind := str(target.get("kind", ""))
	var label := str(target.get("label", "目标"))
	var facility_label := str(target.get("facilityLabel", ""))
	var prefix := "【%s】" % facility_label if facility_label != "" else ""
	match kind:
		"interaction":
			var interaction = target.get("interaction", {})
			if interaction is Dictionary:
				var action := str((interaction as Dictionary).get("action", ""))
				return "%s%s%s" % [prefix, label, " / %s" % action if action != "" else ""]
		"encounter_zone":
			return "%s / 草丛" % label
	return label


func _on_map_marker_pressed(target: Dictionary) -> void:
	if target.is_empty():
		return
	_close_map_panel()
	_route_to_quest_target(target)


func _map_minimap_texture() -> Texture2D:
	var image_width := 420
	var image_height := 220
	var image := Image.create(image_width, image_height, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.05, 0.08, 0.08, 0.92))
	var grid := IsoMapModel.grid_size(map_data)
	if grid.x <= 0 or grid.y <= 0:
		return ImageTexture.create_from_image(image)
	var margin := 10
	var cell_size := maxi(4, mini(int(floor(float(image_width - margin * 2) / float(grid.x))), int(floor(float(image_height - margin * 2) / float(grid.y)))))
	var map_pixel_size := Vector2i(cell_size * grid.x, cell_size * grid.y)
	var origin_pixel := Vector2i(
		int(floor(float(image_width - map_pixel_size.x) * 0.5)),
		int(floor(float(image_height - map_pixel_size.y) * 0.5))
	)
	var blocked := IsoMapModel.blocked_lookup(map_data)
	var interaction_blocked := IsoMapModel.interaction_blocked_lookup(map_data)
	var decor := _map_decor_lookup()
	var zone_lookup := _map_encounter_zone_lookup()
	for y in range(grid.y):
		for x in range(grid.x):
			var cell := Vector2i(x, y)
			var key := IsoMapModel.cell_key(cell)
			var color := Color(0.19, 0.30, 0.27, 0.96)
			if zone_lookup.has(key):
				color = Color(0.28, 0.45, 0.25, 0.98)
			if decor.has(key):
				color = Color(0.25, 0.42, 0.30, 0.98)
			if blocked.has(key) or interaction_blocked.has(key):
				color = Color(0.12, 0.13, 0.12, 0.98)
			_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, cell), color)
	for target in _map_targets_for_current_map():
		var marker_cell := _map_target_cell(target)
		if IsoMapModel.is_inside(map_data, marker_cell):
			_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, marker_cell), _map_target_minimap_color(target))
	if has_target_cell and IsoMapModel.is_inside(map_data, target_cell):
		_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, target_cell), Color(1.0, 0.88, 0.20, 1.0))
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	if IsoMapModel.is_inside(map_data, player_cell):
		_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, player_cell), Color(0.24, 0.56, 0.95, 1.0))
	return ImageTexture.create_from_image(image)


func _map_target_minimap_color(target: Dictionary) -> Color:
	match str(target.get("facilityType", "")):
		InteractionModel.FACILITY_HEALER:
			return Color(0.48, 0.92, 0.66, 1.0)
		InteractionModel.FACILITY_ITEM_SHOP:
			return Color(1.0, 0.80, 0.36, 1.0)
		InteractionModel.FACILITY_EQUIPMENT_SHOP:
			return Color(0.90, 0.62, 0.32, 1.0)
		InteractionModel.FACILITY_RECORD_POINT:
			return Color(0.58, 0.80, 1.0, 1.0)
		InteractionModel.FACILITY_TRAINER:
			return Color(0.76, 0.66, 1.0, 1.0)
		InteractionModel.FACILITY_GUARDIAN:
			return Color(1.0, 0.46, 0.34, 1.0)
	match str(target.get("kind", "")):
		"encounter_zone":
			return Color(0.48, 0.72, 0.32, 1.0)
	return Color(0.90, 0.70, 0.32, 1.0)


func _map_target_cell(target: Dictionary) -> Vector2i:
	match str(target.get("kind", "")):
		"interaction":
			var interaction = target.get("interaction", {})
			if interaction is Dictionary:
				return InteractionModel.cell_for(interaction as Dictionary)
		"encounter_zone":
			return target.get("cell", IsoMapModel.spawn_cell(map_data)) as Vector2i
	return IsoMapModel.spawn_cell(map_data)


func _map_decor_lookup() -> Dictionary:
	var lookup := {}
	var decor_cells: Array = map_data.get("decorCells", [])
	for value in decor_cells:
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		var cell_array: Array = item.get("cell", [0, 0])
		lookup[IsoMapModel.cell_key(Vector2i(int(cell_array[0]), int(cell_array[1])))] = true
	return lookup


func _map_encounter_zone_lookup() -> Dictionary:
	var lookup := {}
	for value in EncounterModel.encounter_zones(map_data):
		if not (value is Dictionary):
			continue
		if EncounterModel.is_manual_only(value as Dictionary):
			continue
		for cell in EncounterModel.cells_for_zone(value as Dictionary):
			lookup[IsoMapModel.cell_key(cell)] = true
	return lookup


func _map_cell_rect(origin_pixel: Vector2i, cell_size: int, cell: Vector2i) -> Rect2i:
	return Rect2i(origin_pixel + Vector2i(cell.x * cell_size, cell.y * cell_size), Vector2i(maxi(1, cell_size - 1), maxi(1, cell_size - 1)))


func _fill_image_rect(image: Image, rect: Rect2i, color: Color) -> void:
	var start_x := clampi(rect.position.x, 0, image.get_width())
	var start_y := clampi(rect.position.y, 0, image.get_height())
	var end_x := clampi(rect.position.x + rect.size.x, 0, image.get_width())
	var end_y := clampi(rect.position.y + rect.size.y, 0, image.get_height())
	for y in range(start_y, end_y):
		for x in range(start_x, end_x):
			image.set_pixel(x, y, color)


func _active_quest_navigation_target() -> Dictionary:
	return _current_task_navigation_target()


func _quest_route_hint(quest: Dictionary, _objective: Dictionary) -> String:
	var target := _navigation_target_for_quest(quest)
	if target.is_empty():
		return ""
	var map_id := str(target.get("mapId", ""))
	var map_name := _map_name_for_id(map_id)
	var label := _navigation_target_display_label(target)
	if map_name == "":
		return label
	return "%s / %s" % [map_name, label]


func _route_to_quest_target(target: Dictionary) -> void:
	var target_map_id := str(target.get("mapId", ""))
	var label := _navigation_target_display_label(target)
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
		"pet_panel":
			_open_pet_panel()
			_set_world_log_message("请在宠物界面完成：%s。" % label)


func _navigation_target_display_label(target: Dictionary) -> String:
	var label := str(target.get("label", "目标"))
	var facility_label := str(target.get("facilityLabel", ""))
	if facility_label != "":
		return "【%s】%s" % [facility_label, label]
	return label


func _navigation_target_from_interaction(map_id: String, item: Dictionary) -> Dictionary:
	var facility_type := InteractionModel.facility_type_for(item)
	var facility_label := InteractionModel.facility_label_for(item)
	var item_id := str(item.get("id", ""))
	return {
		"id": "interaction:%s" % item_id,
		"kind": "interaction",
		"mapId": map_id,
		"label": str(item.get("name", "目标")),
		"facilityType": facility_type,
		"facilityLabel": facility_label,
		"interaction": item,
		"sortRank": InteractionModel.facility_sort_rank_for(item),
	}


func _navigation_target_for_interaction_id(interaction_id: String) -> Dictionary:
	if interaction_id == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		var item := InteractionModel.find_by_id(loaded_map, interaction_id)
		if not item.is_empty():
			return _navigation_target_from_interaction(str(map_id), item)
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
				return _navigation_target_from_interaction(str(map_id), item)
	return {}


func _navigation_target_for_map_entrance(destination_map_id: String, label: String = "") -> Dictionary:
	var normalized_destination := destination_map_id.strip_edges()
	if normalized_destination == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		for value in InteractionModel.interaction_points(loaded_map):
			if not (value is Dictionary):
				continue
			var item := value as Dictionary
			if not InteractionModel.is_warp(item) or str(item.get("toMap", "")) != normalized_destination:
				continue
			var target := _navigation_target_from_interaction(str(map_id), item)
			if label != "":
				target["label"] = label
			return target
	return {}


func _navigation_target_for_direct_warp(from_map_id: String, destination_map_id: String, label: String = "") -> Dictionary:
	var loaded_map := _map_data_for_id(from_map_id)
	for value in InteractionModel.interaction_points(loaded_map):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if not InteractionModel.is_warp(item) or str(item.get("toMap", "")) != destination_map_id:
			continue
		var target := _navigation_target_from_interaction(from_map_id, item)
		if label != "":
			target["label"] = label
		return target
	return {}


func _navigation_target_for_encounter_group_on_map(map_id: String, group_id: String, label: String = "") -> Dictionary:
	var loaded_map := _map_data_for_id(map_id)
	var interaction := _interaction_for_encounter_group(loaded_map, group_id)
	if not interaction.is_empty():
		var interaction_target := _navigation_target_from_interaction(map_id, interaction)
		if label != "":
			interaction_target["label"] = label
		return interaction_target
	var zone := _encounter_zone_for_group(loaded_map, group_id)
	if zone.is_empty():
		return {}
	var cell := EncounterModel.first_walkable_cell(loaded_map, zone)
	return {
		"kind": "encounter_zone",
		"mapId": map_id,
		"label": label if label != "" else str(zone.get("name", "野外")),
		"zone": zone,
		"cell": cell,
	}


func _navigation_target_for_cave_progress(floor_ids: Array[String], goal_map_id: String, encounter_group_id: String, entrance_label: String, goal_label: String) -> Dictionary:
	if floor_ids.is_empty():
		return {}
	var first_floor_id := floor_ids[0]
	var current_index := floor_ids.find(current_map_id)
	if current_index < 0:
		return _navigation_target_for_map_entrance(first_floor_id, entrance_label)

	if current_map_id == goal_map_id:
		return _navigation_target_for_encounter_group_on_map(current_map_id, encounter_group_id, goal_label)

	var goal_index := floor_ids.find(goal_map_id)
	if goal_index < 0:
		goal_index = floor_ids.size() - 1
	var step := 1 if current_index < goal_index else -1
	var next_index := clampi(current_index + step, 0, floor_ids.size() - 1)
	if next_index == current_index:
		return {}
	var next_map_id := floor_ids[next_index]
	return _navigation_target_for_direct_warp(
		current_map_id,
		next_map_id,
		"前往%s" % _map_name_for_id(next_map_id)
	)


func _navigation_target_for_capture_objective_in_cave(floor_ids: Array[String], capture_floor_ids: Array[String], objective: Dictionary, entrance_label: String) -> Dictionary:
	var current_target := _navigation_target_for_capture_objective_on_current_map(objective)
	if not current_target.is_empty():
		return current_target
	if floor_ids.is_empty():
		return {}
	var first_floor_id := floor_ids[0]
	var current_index := floor_ids.find(current_map_id)
	if current_index < 0:
		return _navigation_target_for_map_entrance(first_floor_id, entrance_label)

	var goal_index := -1
	var best_distance := 1000000
	for capture_map_id in capture_floor_ids:
		var floor_index := floor_ids.find(capture_map_id)
		if floor_index < 0:
			continue
		if not _map_has_capture_objective(_map_data_for_id(capture_map_id), objective):
			continue
		var distance: int = abs(floor_index - current_index)
		if distance < best_distance:
			best_distance = distance
			goal_index = floor_index
	if goal_index < 0:
		return _navigation_target_for_map_entrance(first_floor_id, entrance_label)
	if goal_index == current_index:
		return {}

	var step := 1 if current_index < goal_index else -1
	var next_index := clampi(current_index + step, 0, floor_ids.size() - 1)
	if next_index == current_index:
		return {}
	var next_map_id := floor_ids[next_index]
	return _navigation_target_for_direct_warp(
		current_map_id,
		next_map_id,
		"前往%s" % _map_name_for_id(next_map_id)
	)


func _navigation_target_for_backpack(label: String) -> Dictionary:
	return {
		"kind": "backpack",
		"mapId": "",
		"label": label if label != "" else "随身包",
	}


func _navigation_target_for_pet_panel(label: String) -> Dictionary:
	return {
		"kind": "pet_panel",
		"mapId": "",
		"label": label if label != "" else "宠物",
	}


func _navigation_target_for_encounter_group(group_id: String) -> Dictionary:
	if group_id == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map := _map_data_for_id(str(map_id))
		var interaction := _interaction_for_encounter_group(loaded_map, group_id)
		if not interaction.is_empty():
			return _navigation_target_from_interaction(str(map_id), interaction)
		for value in EncounterModel.encounter_zones(loaded_map):
			if not (value is Dictionary):
				continue
			var zone := value as Dictionary
			if EncounterModel.is_manual_only(zone):
				continue
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


func _navigation_target_for_capture_objective_on_current_map(objective: Dictionary) -> Dictionary:
	var loaded_map := _map_data_for_id(current_map_id)
	for value in EncounterModel.encounter_zones(loaded_map):
		if not (value is Dictionary):
			continue
		var zone := value as Dictionary
		if not _zone_matches_capture_objective(zone, objective):
			continue
		var cell := EncounterModel.first_walkable_cell(loaded_map, zone)
		return {
			"kind": "encounter_zone",
			"mapId": current_map_id,
			"label": str(zone.get("name", "野外")),
			"zone": zone,
			"cell": cell,
		}
	return {}


func _map_has_capture_objective(loaded_map: Dictionary, objective: Dictionary) -> bool:
	for value in EncounterModel.encounter_zones(loaded_map):
		if not (value is Dictionary):
			continue
		if _zone_matches_capture_objective(value as Dictionary, objective):
			return true
	return false


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


func _refresh_pet_growth_table(instance: Dictionary) -> void:
	if pet_growth_table_grid == null:
		return
	for child in pet_growth_table_grid.get_children():
		child.queue_free()
	if instance.is_empty() or str(instance.get("growthSpeciesProfileId", "")) == "":
		pet_growth_table_grid.visible = false
		return
	pet_growth_table_grid.visible = pet_detail_mode == PET_DETAIL_MODE_GROWTH
	for header in ["属性", "初始", "当前", "预测140", "成长/级", "评级"]:
		pet_growth_table_grid.add_child(_pet_growth_table_cell(header, true, ""))
	for row in PetGrowthObservationModel.attribute_table_rows_for_stage(instance, pet_growth_stage, 140):
		var grade := str(row.get("grade", ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("label", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("initial", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("current", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("target", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("growth", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(_pet_growth_grade_text(row), false, grade))


func _pet_growth_grade_text(row: Dictionary) -> String:
	var grade := str(row.get("grade", ""))
	var percentile = row.get("percentile", "")
	if grade == "" or grade == "未观察":
		return "未观察"
	if percentile is int or percentile is float:
		return "%s %.0f%%" % [grade, float(percentile)]
	return grade


func _pet_growth_table_cell(text: String, is_header: bool, grade: String) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	label.custom_minimum_size = Vector2(62, 26)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", _pet_growth_table_color(grade, is_header))
	if is_header:
		label.add_theme_color_override("font_outline_color", Color(0.02, 0.03, 0.03, 0.72))
		label.add_theme_constant_override("outline_size", 1)
	return label


func _pet_growth_table_color(grade: String, is_header: bool) -> Color:
	if is_header:
		return Color(0.96, 0.86, 0.48, 1.0)
	match grade:
		"S":
			return Color(1.0, 0.88, 0.24, 1.0)
		"A":
			return Color(0.48, 1.0, 0.58, 1.0)
		"B":
			return Color(0.72, 0.94, 1.0, 1.0)
		"C":
			return Color(0.93, 0.90, 0.78, 1.0)
		"D":
			return Color(1.0, 0.58, 0.48, 1.0)
	return Color(0.94, 0.94, 0.90, 1.0)


func _set_pet_growth_stage(stage: int) -> void:
	pet_growth_stage = clampi(stage, 0, 2)
	_refresh_pet_panel()


func _sync_pet_growth_stage_tabs(instance: Dictionary) -> void:
	if pet_growth_stage_row == null:
		return
	var has_growth := not instance.is_empty() and str(instance.get("growthSpeciesProfileId", "")).strip_edges() != ""
	pet_growth_stage_row.visible = pet_detail_mode == PET_DETAIL_MODE_GROWTH and has_growth
	if not has_growth:
		pet_growth_stage = 0
		return
	var options := PetGrowthObservationModel.growth_stage_options(instance)
	var enabled_stages := {}
	for entry in options:
		if bool(entry.get("enabled", false)):
			enabled_stages[int(entry.get("stage", 0))] = true
	if not enabled_stages.has(pet_growth_stage):
		pet_growth_stage = 0
	for entry in options:
		var stage := int(entry.get("stage", 0))
		var button = pet_growth_stage_buttons.get(stage, null)
		if button == null or not (button is Button):
			continue
		var stage_button := button as Button
		var enabled := bool(entry.get("enabled", false))
		stage_button.text = str(entry.get("label", "%d转成长" % stage))
		stage_button.disabled = not enabled
		stage_button.button_pressed = enabled and pet_growth_stage == stage
		stage_button.modulate = Color(1, 1, 1, 1) if enabled else Color(0.58, 0.58, 0.58, 0.72)


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
		_sync_pet_growth_stage_tabs(selected)
		if pet_growth_radar != null:
			pet_growth_radar.visible = pet_detail_mode == PET_DETAIL_MODE_GROWTH and not selected.is_empty() and str(selected.get("growthSpeciesProfileId", "")) != ""
		if pet_growth_table_grid != null:
			pet_growth_table_grid.visible = pet_detail_mode == PET_DETAIL_MODE_GROWTH and not selected.is_empty() and str(selected.get("growthSpeciesProfileId", "")) != ""
		if pet_detail_mode == PET_DETAIL_MODE_CODEX:
			pet_detail_label.text = "\n".join(PlayerProgressModel.pet_codex_detail_lines(selected))
		elif pet_detail_mode == PET_DETAIL_MODE_GROWTH:
			if selected.is_empty():
				pet_detail_label.text = "请选择宠物。"
				_refresh_pet_growth_table({})
			elif str(selected.get("growthSpeciesProfileId", "")) == "":
				pet_detail_label.text = "这只宠物暂无成长观察档。"
				_refresh_pet_growth_table({})
				if pet_growth_radar != null and pet_growth_radar.has_method("set_growth_data"):
					pet_growth_radar.call("set_growth_data", {}, {})
			else:
				_refresh_pet_growth_table(selected)
				pet_detail_label.text = "\n".join(PetGrowthObservationModel.detail_lines_for_stage(selected, pet_growth_stage))
				var observation = PetGrowthObservationModel.evaluate_pet_for_stage(selected, pet_growth_stage)
				var grades := {}
				if observation is Dictionary:
					var raw_grades = (observation as Dictionary).get("statGrades", {})
					if raw_grades is Dictionary:
						grades = raw_grades as Dictionary
				if pet_growth_radar != null and pet_growth_radar.has_method("set_growth_data"):
					pet_growth_radar.call("set_growth_data", PetGrowthObservationModel.radar_values_for_stage(selected, pet_growth_stage), grades)
		else:
			_sync_pet_growth_stage_tabs({})
			_refresh_pet_growth_table({})
			pet_detail_label.text = "\n".join(PlayerProgressModel.pet_detail_lines(selected))
	if pet_detail_instance_button != null:
		pet_detail_instance_button.visible = not selected.is_empty()
		pet_detail_instance_button.disabled = selected.is_empty()
		pet_detail_instance_button.button_pressed = pet_detail_mode == PET_DETAIL_MODE_INSTANCE
	if pet_detail_codex_button != null:
		pet_detail_codex_button.visible = not selected.is_empty()
		pet_detail_codex_button.disabled = selected.is_empty()
		pet_detail_codex_button.button_pressed = pet_detail_mode == PET_DETAIL_MODE_CODEX
	if pet_detail_growth_button != null:
		pet_detail_growth_button.visible = not selected.is_empty()
		pet_detail_growth_button.disabled = selected.is_empty()
		pet_detail_growth_button.button_pressed = pet_detail_mode == PET_DETAIL_MODE_GROWTH
	if pet_state_cycle_button != null:
		var target_state := PlayerProgressModel.cycled_pet_state_for_profile(player_profile, pet_selected_instance_id)
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
			pet_stable_button.tooltip_text = ""
		else:
			pet_stable_button.visible = true
			var has_stable_access := _pet_panel_has_stable_access()
			pet_stable_button.disabled = not has_stable_access
			var stable_state := str(selected.get("state", ""))
			pet_stable_button.text = "取出" if stable_state == PlayerProgressModel.PET_STATE_STORAGE else "存入"
			pet_stable_button.tooltip_text = "" if has_stable_access else "需要学会远程兽栏，或前往村内兽栏。"
	if pet_party_up_button != null and pet_party_down_button != null:
		var can_show_order := not selected.is_empty()
		var can_edit_order := (
			can_show_order
			and pet_sort_mode == PET_SORT_DEFAULT
			and (pet_filter_mode == PET_FILTER_ALL or pet_filter_mode == PET_FILTER_PARTY)
			and str(selected.get("state", "")) != PlayerProgressModel.PET_STATE_STORAGE
		)
		var up_check := PlayerProgressModel.can_move_party_pet(player_profile, pet_selected_instance_id, -1) if can_edit_order else {}
		var down_check := PlayerProgressModel.can_move_party_pet(player_profile, pet_selected_instance_id, 1) if can_edit_order else {}
		pet_party_up_button.visible = can_show_order
		pet_party_down_button.visible = can_show_order
		pet_party_up_button.disabled = not can_edit_order or not bool(up_check.get("ok", false))
		pet_party_down_button.disabled = not can_edit_order or not bool(down_check.get("ok", false))
		pet_party_up_button.tooltip_text = "" if can_edit_order else "默认队伍顺序下可调整"
		pet_party_down_button.tooltip_text = "" if can_edit_order else "默认队伍顺序下可调整"
	if pet_lock_button != null:
		pet_lock_button.visible = not selected.is_empty()
		pet_lock_button.disabled = selected.is_empty()
		pet_lock_button.text = "解锁" if bool(selected.get("locked", false)) else "锁定"
	var party_count := PlayerProgressModel.party_pet_instances(player_profile).size()
	var has_batch_stable_access := _pet_panel_has_stable_access()
	if pet_batch_store_button != null:
		pet_batch_store_button.visible = true
		pet_batch_store_button.disabled = not has_batch_stable_access or party_count <= 0 or PlayerProgressModel.storage_pet_instances(player_profile).size() >= PlayerProgressModel.STORAGE_LIMIT
		pet_batch_store_button.tooltip_text = "" if has_batch_stable_access else "需要学会远程兽栏，或前往村内兽栏。"
	if pet_batch_standby_button != null:
		pet_batch_standby_button.visible = true
		pet_batch_standby_button.disabled = party_count <= 0
	if pet_batch_rest_button != null:
		pet_batch_rest_button.visible = true
		pet_batch_rest_button.disabled = party_count <= 0
	if pet_rename_button != null:
		pet_rename_button.visible = not selected.is_empty()
		pet_rename_button.disabled = selected.is_empty()
	if pet_skill_button != null:
		pet_skill_button.visible = not selected.is_empty()
		pet_skill_button.disabled = selected.is_empty()
	if pet_cultivation_button != null:
		pet_cultivation_button.visible = not selected.is_empty()
		pet_cultivation_button.disabled = selected.is_empty()
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
		PlayerProgressModel.PET_STATE_RIDING:
			return 1
		PlayerProgressModel.PET_STATE_STANDBY:
			return 2
		PlayerProgressModel.PET_STATE_REST:
			return 3
		PlayerProgressModel.PET_STATE_STORAGE:
			return 4
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
		PlayerProgressModel.PET_STATE_RIDING:
			return "骑乘"
		_:
			return ""


func _set_pet_detail_mode(mode: String) -> void:
	if mode != PET_DETAIL_MODE_INSTANCE and mode != PET_DETAIL_MODE_CODEX and mode != PET_DETAIL_MODE_GROWTH:
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
	var lock_marker := "锁 " if bool(instance.get("locked", false)) else ""
	button.text = "%s%s%s%s%s\nLv%d  %s  战力%d" % [
		marker,
		active_marker,
		new_marker,
		lock_marker,
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
		if _is_server_account_session():
			await _submit_server_profile_action("pet_mark_seen", {"instanceId": instance_id}, "")
			selected = PlayerProgressModel.pet_instance_by_id(player_profile, instance_id)
		else:
			player_profile = PlayerProgressModel.mark_pet_seen(player_profile, instance_id)
			if profile_save_enabled:
				_save_player_profile_now()
	_refresh_pet_panel()
	if pet_cultivation_panel != null and pet_cultivation_panel.visible:
		_refresh_pet_cultivation_panel()


func _on_pet_state_cycle_pressed() -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_state_cycle", {"instanceId": pet_selected_instance_id}, "切换宠物状态失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.cycle_pet_state(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_stable_pressed() -> void:
	if not _pet_panel_has_stable_access():
		_set_world_log_message("需要学会远程兽栏，或前往村内兽栏。")
		_refresh_pet_panel()
		return
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_stable_toggle", {"instanceId": pet_selected_instance_id}, "兽栏操作失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := {}
	if str(selected.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE:
		result = PlayerProgressModel.withdraw_pet(player_profile, pet_selected_instance_id)
	else:
		result = PlayerProgressModel.store_pet(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_party_move_pressed(direction: int) -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_party_move", {
			"instanceId": pet_selected_instance_id,
			"direction": direction,
		}, "调整宠物位置失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.move_party_pet(player_profile, pet_selected_instance_id, direction)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_lock_pressed() -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_lock_toggle", {"instanceId": pet_selected_instance_id}, "宠物锁定失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.toggle_pet_locked(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_batch_store_pressed() -> void:
	if not _pet_panel_has_stable_access():
		_set_world_log_message("需要学会远程兽栏，或前往村内兽栏。")
		_refresh_pet_panel()
		return
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_batch_store", {}, "批量存入失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.batch_store_standby_pets(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_batch_state_pressed(target_state: String) -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_batch_state", {"targetState": target_state}, "批量切换状态失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.batch_set_party_pet_state(player_profile, target_state)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_gm_grant_blue_pressed() -> void:
	var result := PlayerProgressModel.gm_grant_blue_man_dragon(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = str(result.get("instanceId", pet_selected_instance_id))
		pet_detail_mode = PET_DETAIL_MODE_GROWTH
		if profile_save_enabled:
			_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()


func _on_pet_gm_level_up_pressed() -> void:
	if pet_selected_instance_id == "":
		_set_world_log_message("请选择要升级的宠物。")
		return
	var result := PlayerProgressModel.gm_level_up_pet_once(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		var updated = result.get("pet", {})
		pet_detail_mode = PET_DETAIL_MODE_GROWTH if updated is Dictionary and str((updated as Dictionary).get("growthSpeciesProfileId", "")).strip_edges() != "" else PET_DETAIL_MODE_INSTANCE
		if profile_save_enabled:
			_save_player_profile_now()
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
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_rename", {
			"instanceId": pet_selected_instance_id,
			"name": pet_rename_input.text,
		}, "宠物改名失败。")
		if bool(parsed.get("ok", false)):
			_close_pet_rename_panel()
			_refresh_pet_panel()
		else:
			pet_rename_input.grab_focus()
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		return
	var result := PlayerProgressModel.rename_pet(player_profile, pet_selected_instance_id, pet_rename_input.text)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		if profile_save_enabled:
			_save_player_profile_now()
		_close_pet_rename_panel()
		_refresh_pet_panel()
	else:
		pet_rename_input.text = str(result.get("name", pet_rename_input.text))
		pet_rename_input.grab_focus()
	_set_world_log_message(str(result.get("message", "")))


func _on_pet_cultivation_pressed() -> void:
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty() or pet_cultivation_panel == null:
		return
	pet_cultivation_panel.visible = true
	_refresh_pet_cultivation_panel()
	_layout_hud()


func _refresh_pet_cultivation_panel() -> void:
	if pet_cultivation_panel == null or pet_cultivation_preview_label == null:
		return
	var selected := PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	var preview := PlayerProgressModel.pet_cultivation_preview(player_profile, pet_selected_instance_id)
	var lines: Array[String] = []
	if not selected.is_empty():
		lines.append("%s  Lv%d  %s" % [
			str(selected.get("name", "宠物")),
			int(selected.get("level", 1)),
			PlayerProgressModel.state_label(str(selected.get("state", PlayerProgressModel.PET_STATE_STANDBY))),
		])
	var raw_preview_lines = preview.get("lines", [])
	if raw_preview_lines is Array:
		for line_value in raw_preview_lines:
			lines.append(str(line_value))
	if lines.is_empty():
		lines.append(str(preview.get("message", "请选择宠物。")))
	if pet_cultivation_title_label != null:
		pet_cultivation_title_label.text = str(preview.get("title", "宠物培养"))
	pet_cultivation_preview_label.text = "\n".join(lines)
	if pet_cultivation_confirm_button != null:
		var mode := str(preview.get("mode", ""))
		pet_cultivation_confirm_button.text = "确认转生" if mode == "rebirth" else "确认强化"
		pet_cultivation_confirm_button.disabled = not bool(preview.get("ok", false))
		pet_cultivation_confirm_button.tooltip_text = str(preview.get("message", ""))


func _on_pet_cultivation_confirm_pressed() -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_cultivation_apply", {"instanceId": pet_selected_instance_id}, "宠物培养失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		_refresh_pet_cultivation_panel()
		return
	var result := PlayerProgressModel.apply_pet_cultivation(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()
	_refresh_pet_cultivation_panel()


func _close_pet_cultivation_panel() -> void:
	_hide_control(pet_cultivation_panel, false)


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
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_drop", {
			"instanceId": pet_selected_instance_id,
			"mapId": current_map_id,
			"cell": [drop_cell.x, drop_cell.y],
			"nowSec": int(Time.get_unix_time_from_system()),
		}, "丢弃宠物失败。")
		if bool(parsed.get("ok", false)):
			pet_selected_instance_id = ""
		_close_pet_rename_panel()
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
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
			_save_player_profile_now()
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
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_clear_storage", {"instanceId": pet_selected_instance_id}, "清理宠物失败。")
		if bool(parsed.get("ok", false)):
			pet_selected_instance_id = ""
		pet_clear_confirm_instance_id = ""
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result := PlayerProgressModel.clear_storage_pet(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = ""
		if profile_save_enabled:
			_save_player_profile_now()
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
	for drop in _ground_pet_drops_on_map_fast(map_id):
		var cell := PlayerProgressModel.ground_pet_drop_cell(drop)
		lookup[IsoMapModel.cell_key(cell)] = true
	return lookup


func _ground_pet_drop_for_instance_id(instance_id: String) -> Dictionary:
	for drop in _ground_pet_drops_on_map_fast(current_map_id):
		var pet_instance := PlayerProgressModel.ground_pet_drop_pet(drop)
		if str(pet_instance.get("instanceId", "")) == instance_id:
			return drop
	return {}


func _ground_pet_drops_on_map_fast(map_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_drops = player_profile.get("groundPetDrops", [])
	if not (raw_drops is Array):
		return result
	for value in raw_drops:
		if not (value is Dictionary):
			continue
		var drop := value as Dictionary
		if str(drop.get("mapId", "")) == map_id:
			result.append(drop)
	return result


func _find_ground_pet_drop_at_world_point(world_point: Vector2, hit_radius: float = 34.0) -> Dictionary:
	var clicked_cell := IsoMapModel.world_to_grid(map_data, world_point)
	var best_drop: Dictionary = {}
	var best_distance := INF
	for drop in _ground_pet_drops_on_map_fast(current_map_id):
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
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_pickup_drop", {
			"dropId": drop_id,
			"nowSec": int(Time.get_unix_time_from_system()),
		}, "拾取宠物失败。")
		var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		if bool(parsed.get("ok", false)):
			pet_selected_instance_id = str(result.get("instanceId", pet_selected_instance_id))
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		return
	var result := PlayerProgressModel.pickup_ground_pet(player_profile, drop_id, int(Time.get_unix_time_from_system()))
	player_profile = result.get("profile", player_profile)
	if (bool(result.get("ok", false)) or bool(result.get("changed", false))) and profile_save_enabled:
		_save_player_profile_now()
	if bool(result.get("ok", false)):
		pet_selected_instance_id = str(result.get("instanceId", pet_selected_instance_id))
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()
	_set_world_log_message(str(result.get("message", "")))


func _close_pet_rename_panel() -> void:
	_hide_control(pet_rename_panel, false)


func _update_pet_rest_recovery(delta: float) -> void:
	if delta <= 0.0 or player_profile.is_empty():
		return
	if _is_server_account_session():
		pet_rest_recovery_elapsed = 0.0
		return
	if not _has_recovering_rest_pet():
		pet_rest_recovery_elapsed = 0.0
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
			_save_player_profile_now()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()


func _apply_pet_rest_recovery_tick(save_after: bool = true, refresh_panel: bool = true) -> Dictionary:
	var result := PlayerProgressModel.apply_rest_recovery_tick(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		if save_after and profile_save_enabled:
			_save_player_profile_now()
		if refresh_panel and pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
	return result


func _has_recovering_rest_pet() -> bool:
	var instances = player_profile.get("petInstances", [])
	if not (instances is Array):
		return false
	var instance_values := instances as Array
	for value in instance_values:
		if not (value is Dictionary):
			continue
		var instance := value as Dictionary
		if str(instance.get("state", PlayerProgressModel.PET_STATE_STANDBY)) != PlayerProgressModel.PET_STATE_REST:
			continue
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		if hp < max_hp:
			return true
	return false


func _update_ground_pet_drop_expiration(delta: float) -> void:
	if delta <= 0.0 or player_profile.is_empty():
		return
	if not _has_ground_pet_drops():
		pet_drop_expire_elapsed = 0.0
		return
	pet_drop_expire_elapsed += delta
	if pet_drop_expire_elapsed < 1.0:
		return
	pet_drop_expire_elapsed = 0.0
	var now_sec := int(Time.get_unix_time_from_system())
	if not _has_expired_ground_pet_drop(now_sec):
		return
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_expire_drops", {"nowSec": now_sec}, "")
		if bool(parsed.get("ok", false)):
			if pet_panel != null and pet_panel.visible:
				_refresh_pet_panel()
			_set_world_log_message("地上的宠物离开了。")
		return
	var result := PlayerProgressModel.expire_ground_pet_drops(player_profile, now_sec)
	if not bool(result.get("ok", false)):
		return
	player_profile = result.get("profile", player_profile)
	if profile_save_enabled:
		_save_player_profile_now()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()
	_set_world_log_message("地上的宠物离开了。")


func _has_ground_pet_drops() -> bool:
	var drops = player_profile.get("groundPetDrops", [])
	if not (drops is Array):
		return false
	return not (drops as Array).is_empty()


func _has_expired_ground_pet_drop(now_sec: int) -> bool:
	var drops = player_profile.get("groundPetDrops", [])
	if not (drops is Array):
		return false
	var drop_values := drops as Array
	for drop_value in drop_values:
		if not (drop_value is Dictionary):
			continue
		var expires_at := int((drop_value as Dictionary).get("expiresAtSec", 0))
		if expires_at > 0 and now_sec >= expires_at:
			return true
	return false


func _on_battle_command_pressed(command_id: String) -> void:
	if not battle_active:
		return
	if _battle_commands_locked():
		return
	if _battle_is_server_authority():
		var leave_label := _battle_player_run_label()
		if battle_command_owner == "pet":
			_on_pet_battle_command_pressed(command_id)
			return
		if battle_command_owner == "switch_pet":
			_on_switch_pet_battle_command_pressed(command_id)
			return
		if battle_command_owner == "item":
			_on_item_battle_command_pressed(command_id)
			return
		if battle_command_owner == "spirit":
			_on_spirit_battle_command_pressed(command_id)
			return
		if battle_command_owner == "capture":
			_on_capture_battle_command_pressed(command_id)
			return
		if battle_command_owner != "player":
			_set_battle_message("联网战斗暂只支持攻击、防御、物品、精灵、捕捉、换宠、宠物指令和%s。" % leave_label)
			return
		if command_id == "run":
			_leave_server_battle_room()
			return
		if command_id == "switch_pet":
			_open_switch_pet_command_menu()
			return
		if command_id == "item":
			_open_item_command_menu()
			return
		if command_id == "spirit":
			_open_spirit_command_menu()
			return
		if command_id == "capture":
			_open_capture_command_menu()
			return
		if not ["attack", "defend", "help"].has(command_id):
			_set_battle_message("联网战斗暂只支持攻击、防御、物品、精灵、捕捉、换宠和%s。" % leave_label)
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
			if _battle_is_server_authority():
				_set_battle_message("选择攻击、防御、物品、精灵、捕捉、换宠或%s。" % _battle_player_run_label())
			else:
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
	if _battle_is_server_authority():
		_submit_server_battle_player_command(command_id, battle_selected_target_id)
		return
	battle_pending_player_command = {
		"command": command_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	if command_id == "capture":
		battle_pending_player_command["captureToolId"] = CaptureToolCatalog.normalized_tool_id(battle_pending_capture_tool_id)
	_open_pet_command_or_start_round()


func _submit_server_battle_player_command(command_id: String, target_id: String = "", pet_id: String = "", item_id: String = "") -> void:
	await _server_battle().submit_player_command(command_id, target_id, pet_id, item_id)


func _server_battle_needs_self_pet_command() -> bool:
	return _server_battle().needs_self_pet_command()


func _server_battle_current_account_submitted() -> bool:
	return _server_battle().current_account_submitted()


func _server_battle_actor_submitted(actor_id: String) -> bool:
	return _server_battle().actor_submitted(actor_id)


func _server_battle_self_player_submitted() -> bool:
	return _server_battle().self_player_submitted()


func _sync_server_battle_command_owner_from_room() -> bool:
	return _server_battle().sync_command_owner_from_room()


func _server_battle_command_error_should_sync(parsed: Dictionary) -> bool:
	var code := str(parsed.get("code", "")).strip_edges()
	return [
		"battle_command_actor_missing",
		"battle_command_duplicate",
		"battle_command_phase_invalid",
		"battle_command_round_mismatch",
	].has(code)


func _apply_server_battle_command_error_room(parsed: Dictionary) -> bool:
	return _server_battle().apply_command_error_room(parsed)


func _open_server_battle_pet_command() -> void:
	_server_battle().open_pet_command()


func _submit_server_battle_pet_command(command_id: String, target_id: String = "", skill_id: String = "") -> void:
	await _server_battle().submit_pet_command(command_id, target_id, skill_id)


func _leave_server_battle_room() -> void:
	await _server_battle().leave_room()


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
	if _battle_is_server_authority():
		var server_target_id := target_id
		if BattleActionCatalog.action_is_all(spirit_id):
			if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY):
				server_target_id = player_id
			elif BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ENEMY):
				server_target_id = BattleModel.living_enemy_id(battle_state)
		_submit_server_battle_player_command("spirit", server_target_id, "", spirit_id)
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
	if not _battle_item_supported_in_combat(item_id):
		_set_battle_message("这个物品暂时无法在战斗中使用。")
		_set_battle_command_owner("player")
		return
	if _battle_is_server_authority():
		if not BattleModel.has_item(battle_state, item_id):
			_set_battle_message("%s 不够了。" % BattleActionCatalog.label_for(item_id, "物品"))
			_set_battle_command_owner("player")
			return
		var server_target_id := target_id.strip_edges()
		if server_target_id == "" and BattleActionCatalog.action_is_all(item_id):
			server_target_id = _battle_item_anchor_target_id(item_id)
		if server_target_id == "":
			_set_battle_message("请选择物品目标。")
			return
		if BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ALLY):
			battle_selected_ally_target_id = server_target_id
		elif BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ENEMY):
			battle_selected_target_id = server_target_id
		_submit_server_battle_player_command("item", server_target_id, "", item_id)
		return
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
	if _battle_is_server_authority():
		_submit_server_battle_player_command("switch_pet", "", pet_id)
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


func _battle_item_id_for_command(command_id: String) -> String:
	match command_id:
		"attack":
			return BattleModel.ITEM_HEAL_ALL
		"spirit":
			return BattleModel.ITEM_HEAL_SINGLE
		"capture":
			return BattleModel.ITEM_POISON_SINGLE
		"defend":
			return BattleModel.ITEM_POISON_ALL
		"item":
			return BattleModel.ITEM_CLEANSE_SINGLE
		"switch_pet":
			return BattleModel.ITEM_MEAT_SMALL
		_:
			return ""


func _battle_item_supported_in_combat(item_id: String) -> bool:
	match item_id.strip_edges():
		BattleModel.ITEM_MEAT_SMALL, BattleModel.ITEM_HEAL_SINGLE, BattleModel.ITEM_HEAL_ALL, BattleModel.ITEM_POISON_SINGLE, BattleModel.ITEM_POISON_ALL, BattleModel.ITEM_CLEANSE_SINGLE:
			return true
		_:
			return false


func _battle_item_anchor_target_id(item_id: String) -> String:
	if BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ALLY):
		return BattleModel.player_actor_id(battle_state)
	if BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ENEMY):
		return BattleModel.living_enemy_id(battle_state)
	return ""


func _battle_item_can_use_now(item_id: String, can_command: bool, has_ally: bool, has_enemy: bool) -> bool:
	if item_id == "" or not can_command or not _battle_item_supported_in_combat(item_id) or not BattleModel.has_item(battle_state, item_id):
		return false
	if BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ALLY) and not has_ally:
		return false
	if BattleActionCatalog.action_can_target_side(item_id, BattleModel.SIDE_ENEMY) and not has_enemy:
		return false
	return true


func _battle_has_usable_item(can_command: bool, has_ally: bool, has_enemy: bool) -> bool:
	for command_id in ["attack", "spirit", "capture", "defend", "item", "switch_pet"]:
		if _battle_item_can_use_now(_battle_item_id_for_command(command_id), can_command, has_ally, has_enemy):
			return true
	return false


func _on_item_battle_command_pressed(command_id: String) -> void:
	if command_id == "help":
		battle_pending_item_id = ""
		battle_pending_spirit_id = ""
		battle_target_mode = "enemy"
		battle_selected_target_id = ""
		battle_selected_ally_target_id = ""
		battle_hover_target_id = ""
		battle_hover_ally_target_id = ""
		_set_battle_command_owner("player")
		_set_battle_message("重新选择人物指令。")
		return
	var item_id := _battle_item_id_for_command(command_id)
	if item_id == "":
		_set_battle_message("这个物品栏位暂未开放。")
		return
	if not _battle_item_supported_in_combat(item_id):
		_set_battle_message("这个物品暂时无法在战斗中使用。")
		return
	if not BattleModel.has_item(battle_state, item_id):
		_set_battle_message("%s 不够了。" % BattleActionCatalog.label_for(item_id, "物品"))
		_sync_battle_buttons()
		return
	if BattleActionCatalog.action_is_all(item_id):
		_submit_item_player_command(item_id)
	else:
		_begin_single_item_target_selection(item_id)


func _begin_pet_skill_target_selection(skill_id: String) -> void:
	battle_pending_pet_skill_id = skill_id
	battle_target_mode = "pet_enemy_skill"
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	_set_battle_message("%s：请选择敌方目标。" % BattleActionCatalog.label_for(skill_id, "宠物技能"))
	_sync_battle_buttons()
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
	if _battle_is_server_authority():
		battle_pending_pet_skill_id = ""
		_submit_server_battle_pet_command(command_id, battle_selected_target_id, skill_id)
		return
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
	if battle_state.is_empty() or _battle_state_should_end(battle_state):
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
				if not _battle_is_server_authority():
					_sync_profile_capture_tools_from_battle_state()
			elif _battle_event_consumes_item(str(event.get("type", ""))):
				if not _battle_is_server_authority():
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
		if _battle_state_should_end(battle_state):
			battle_event_queue.clear()
			battle_end_pending = true
		battle_current_event_actor_snapshots = actor_snapshots
		battle_action_timer = _battle_event_duration(battle_current_event)
		battle_current_event_duration = battle_action_timer
		_sync_battle_buttons()
		queue_redraw()
		return

	if _battle_state_should_end(battle_state):
		battle_end_pending = true
		battle_action_timer = 0.2
		_sync_battle_buttons()
		queue_redraw()
		return
	if _start_round_end_status_events_if_needed():
		return
	_finish_battle_round_and_open_commands()


func _battle_state_should_end(state: Dictionary) -> bool:
	return (
		PlayerProgressModel.battle_actor_knocked_away(state, BattleModel.PLAYER_ACTOR_ID)
		or BattleModel.living_enemy_id(state) == ""
		or BattleModel.living_ally_id(state) == ""
	)


func _finish_battle_round_and_open_commands() -> void:
	if bool(battle_state.get("serverAuthority", false)):
		var last_server_event_list := battle_state.get("lastServerEventList", {}) as Dictionary if battle_state.get("lastServerEventList", {}) is Dictionary else {}
		if str(last_server_event_list.get("kind", "")) == "battle_event_list":
			battle_state = ServerBattleRoomModel.state_with_server_event_actor_snapshot(battle_state, last_server_event_list)
		var closed_room := _server_battle_closed_room_from_state()
		if not closed_room.is_empty():
			_finish_server_battle_from_closed_room(closed_room)
			return
	battle_state["phase"] = "command"
	battle_state = BattleModel.decrement_field_effects(battle_state)
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
	_reset_battle_command_countdown()
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
	_record_quest_spirit_event_from_battle(event, ledger, event_type)
	_update_battle_debug_window(true)


func _record_quest_spirit_event_from_battle(event: Dictionary, ledger: Dictionary, event_type: String) -> void:
	if not event_type.begins_with("spirit_"):
		return
	var attacker_id := str(ledger.get("attackerId", event.get("attackerId", "")))
	if attacker_id != BattleModel.player_actor_id(battle_state):
		return
	var spirit_id := str(ledger.get("spiritId", event.get("spiritId", "")))
	if spirit_id == "":
		return
	var quest_messages := _record_quest_event_and_maybe_claim({
		"type": "use_spirit",
		"spiritId": spirit_id,
		"eventType": event_type,
		"amount": 1,
	})
	if quest_messages.is_empty():
		return
	if profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message("\n".join(quest_messages))


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
	if event_type == "multi_attack":
		var multi_effects := ledger.get("effectPerTarget", {}) as Dictionary
		var multi_ride_effects := ledger.get("rideDamagePerTarget", {}) as Dictionary
		var dodge_map := ledger.get("dodgePerTarget", {}) as Dictionary
		var critical_map := ledger.get("criticalPerTarget", {}) as Dictionary
		var multi_delay := _battle_event_duration(event) * _battle_event_result_reveal_progress(event) if _battle_event_delays_result(event) else 0.0
		for multi_target_id in ledger.get("targetIds", []):
			var resolved_multi_target_id := str(multi_target_id)
			if bool(dodge_map.get(resolved_multi_target_id, false)):
				_add_battle_float_text(resolved_multi_target_id, "回避", Color(0.62, 0.88, 1.0, 0.98), multi_delay)
				continue
			var multi_damage := int(multi_effects.get(resolved_multi_target_id, 0))
			if multi_damage <= 0:
				continue
			var multi_text := "-%d" % multi_damage
			if bool(critical_map.get(resolved_multi_target_id, false)):
				multi_text = "暴击 %s" % multi_text
			_add_battle_float_text(resolved_multi_target_id, multi_text, Color(1.0, 0.82, 0.30, 0.98), multi_delay)
			var ride_damage := int(multi_ride_effects.get(resolved_multi_target_id, 0))
			if ride_damage > 0:
				_add_battle_float_text(resolved_multi_target_id, "骑 -%d" % ride_damage, Color(0.50, 0.86, 1.0, 0.98), multi_delay + 0.10)
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
	var ride_damage_map := ledger.get("rideDamagePerTarget", {}) as Dictionary
	var ride_damage := int(ride_damage_map.get(target_id, 0))
	if ride_damage > 0:
		_add_battle_float_text(target_id, "骑 -%d" % ride_damage, Color(0.50, 0.86, 1.0, 0.98), feedback_delay + 0.10)


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
		"multi_attack":
			return 0.72
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
	return ["attack", "skill_attack", "combo_attack", "counter_attack", "multi_attack"].has(str(event.get("type", "")))


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
	if event_type == "multi_attack":
		return 0.42
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
	if _battle_state_should_end(battle_state):
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
		var pending_enemy_item_id := battle_pending_item_id if battle_pending_item_id != "" else BattleModel.ITEM_POISON_SINGLE
		var pending_enemy_item_label := BattleActionCatalog.label_for(pending_enemy_item_id, "物品")
		var item_enemy_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ENEMY)
		if item_enemy_target_id == "":
			var item_ally_target_id := _battle_actor_id_at_screen_point(screen_point, BattleModel.SIDE_ALLY)
			if item_ally_target_id != "":
				_set_battle_message("%s只能选择敌方单体。" % pending_enemy_item_label)
			return false
		battle_selected_target_id = item_enemy_target_id
		battle_hover_info_actor_id = item_enemy_target_id
		_update_battle_passive_panel()
		var item_enemy_target := BattleModel.actor_by_id(battle_state, item_enemy_target_id)
		_set_battle_message("%s：%s" % [
			pending_enemy_item_label,
			str(item_enemy_target.get("name", "敌人")),
		])
		_submit_item_player_command(pending_enemy_item_id, item_enemy_target_id)
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
	if battle_command_owner == "player" and battle_command_buttons.has("run"):
		var run_button := battle_command_buttons["run"] as Button
		if run_button != null:
			run_button.text = _battle_player_run_label()
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
					"help":
						button.disabled = not can_command
					_:
						button.disabled = not _battle_item_can_use_now(_battle_item_id_for_command(str(command_id)), can_command, has_ally, has_enemy)
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
				if _battle_is_server_authority():
					match str(command_id):
						"attack":
							button.disabled = not has_enemy
						"capture":
							button.disabled = not has_enemy
						"defend", "run", "help":
							button.disabled = not can_command
						"item":
							button.disabled = not _battle_has_usable_item(can_command, has_ally, has_enemy)
						"spirit":
							var has_usable_spirit := false
							for spirit_id in _player_spirit_ids_for_battle():
								if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ALLY) and has_ally:
									has_usable_spirit = true
									break
								if BattleActionCatalog.action_can_target_side(spirit_id, BattleModel.SIDE_ENEMY) and has_enemy:
									has_usable_spirit = true
									break
							button.disabled = not has_usable_spirit
						"switch_pet":
							button.disabled = BattleModel.switchable_pet_entries(battle_state).is_empty()
						_:
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


func _reset_battle_command_countdown() -> void:
	battle_command_countdown_remaining = BATTLE_COMMAND_COUNTDOWN_SECONDS
	battle_command_countdown_last_second = -1
	_sync_battle_round_timer_labels(true)


func _update_battle_command_countdown(delta: float) -> void:
	if not battle_active:
		return
	if str(battle_state.get("phase", "command")) != "command" or _battle_commands_locked():
		_sync_battle_round_timer_labels(false)
		return
	battle_command_countdown_remaining = maxf(0.0, battle_command_countdown_remaining - delta)
	_sync_battle_round_timer_labels(false)
	if battle_command_countdown_remaining <= 0.001:
		_submit_battle_timeout_default_commands()


func _sync_battle_round_timer_labels(force: bool = false) -> void:
	if battle_round_panel != null:
		battle_round_panel.visible = battle_active
	if battle_timer_panel != null:
		battle_timer_panel.visible = battle_active
	if not battle_active:
		battle_round_display_last_text = ""
		battle_timer_display_last_text = ""
		return
	var round_text := "第 %d 回合" % maxi(1, int(battle_state.get("round", 1)))
	if force or round_text != battle_round_display_last_text:
		battle_round_display_last_text = round_text
		if battle_round_label != null:
			battle_round_label.text = round_text
	var second := clampi(int(ceilf(battle_command_countdown_remaining)), 0, int(BATTLE_COMMAND_COUNTDOWN_SECONDS))
	if not force and second == battle_command_countdown_last_second:
		return
	battle_command_countdown_last_second = second
	var timer_text := "%d秒" % second
	battle_timer_display_last_text = timer_text
	if battle_timer_label != null:
		battle_timer_label.text = timer_text


func _submit_battle_timeout_default_commands() -> void:
	if not battle_active or _battle_commands_locked():
		return
	var added_default := false
	if battle_pending_player_command.is_empty():
		battle_pending_player_command = {
			"command": "defend",
			"targetId": "",
			"allyTargetId": "",
			"timeoutDefault": true,
		}
		added_default = true
	var player_command_id := str(battle_pending_player_command.get("command", ""))
	if player_command_id != "switch_pet" and battle_pending_pet_command.is_empty() and BattleModel.controlled_pet_id(battle_state) != "":
		battle_pending_pet_command = {
			"command": "defend",
			"targetId": "",
			"skillId": BattleModel.PET_SKILL_DEFEND,
			"timeoutDefault": true,
		}
		added_default = true
	if added_default:
		_set_battle_message("本回合倒计时结束，未下达的指令自动防御。")
	_battle_start_pending_round()


func _update_battle_animation(delta: float) -> void:
	var scaled_delta := _scaled_battle_delta(delta)
	_update_battle_float_texts(scaled_delta)
	if battle_event_advance_pending:
		battle_event_advance_pending = false
		_advance_battle_after_current_event()
		return
	if battle_action_timer <= 0.0:
		if str(battle_state.get("phase", "command")) == "round_events":
			_advance_battle_after_current_event()
		return
	battle_action_timer = maxf(0.0, battle_action_timer - scaled_delta)
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
	_dialog_quest()._open_interaction_dialog(item)


func _close_dialog() -> void:
	_dialog_quest()._close_dialog()


func _dialog_is_open() -> bool:
	return _dialog_quest()._dialog_is_open()


func _confirm_dialog_action() -> void:
	_dialog_quest()._confirm_dialog_action()


func _perform_dialog_action(action_id: String) -> void:
	_dialog_quest()._perform_dialog_action(action_id)


func _run_server_dialog_quest_claim(quest_id: String = "") -> void:
	await _dialog_quest()._run_server_dialog_quest_claim(quest_id)


func _run_server_dialog_quest_record(event: Dictionary, quest_id: String = "") -> void:
	await _dialog_quest()._run_server_dialog_quest_record(event, quest_id)


func _claim_dialog_quest_reward() -> void:
	await _dialog_quest()._claim_dialog_quest_reward()


func _claim_dialog_optional_quest_reward() -> void:
	await _dialog_quest()._claim_dialog_optional_quest_reward()


func _complete_dialog_talk_quest() -> void:
	await _dialog_quest()._complete_dialog_talk_quest()


func _complete_dialog_optional_talk_quest() -> void:
	await _dialog_quest()._complete_dialog_optional_talk_quest()


func _apply_dialog_healer(from_hang_auto: bool = false) -> void:
	var was_hang_pending_resume := _hang_pending_healer_resume()
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("village_heal", {}, "村医治疗失败。")
		var heal_result := {"ok": bool(parsed.get("ok", false)), "message": str(parsed.get("message", ""))}
		var message := "\n".join(_string_array_values(parsed.get("logLines", [])))
		if was_hang_pending_resume:
			var hang_message := _handle_hang_healer_result(heal_result, from_hang_auto)
			if hang_message != "":
				message = "%s\n%s" % [message, hang_message]
		_set_world_log_message(message.strip_edges())
		_update_dialog_text()
		if status_label != null:
			_update_hud_text()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("村医治疗"):
		return
	var heal_result := PlayerProgressModel.apply_village_healer(player_profile)
	player_profile = heal_result.get("profile", player_profile)
	var message := str(heal_result.get("message", ""))
	if was_hang_pending_resume:
		var hang_message := _handle_hang_healer_result(heal_result, from_hang_auto)
		if hang_message != "":
			message = "%s\n%s" % [message, hang_message]
	if (bool(heal_result.get("ok", false)) or was_hang_pending_resume) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(message)
	_update_dialog_text()
	if status_label != null:
		_update_hud_text()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _hang_pending_healer_resume() -> bool:
	var session := PlayerProgressModel.hang_session(player_profile)
	return bool(session.get(HangSettingsModel.SESSION_PENDING_RESUME_KEY, false))


func _auto_apply_hang_healer_if_open() -> void:
	if not _hang_pending_healer_resume():
		return
	if not _dialog_is_open() or not _active_dialog_is_healer():
		return
	_apply_dialog_healer(true)


func _handle_hang_healer_result(heal_result: Dictionary, from_hang_auto: bool) -> String:
	var healed_or_full := bool(heal_result.get("ok", false)) or str(heal_result.get("message", "")) == "队伍生命已满。"
	if not healed_or_full:
		_clear_hang_heal_resume_route()
		player_profile = PlayerProgressModel.stop_hang_session(player_profile, "heal_failed")
		return "挂机补给失败，已停止。"
	var session := PlayerProgressModel.hang_session(player_profile)
	session = HangSettingsModel.session_with_pending_resume(session, false)
	player_profile = PlayerProgressModel.with_hang_session(player_profile, session)
	if from_hang_auto:
		_close_dialog()
	return _start_hang_heal_resume_route(session)


func _start_hang_heal_resume_route(session: Dictionary) -> String:
	var origin_map_id := str(session.get(HangSettingsModel.SESSION_ORIGIN_MAP_ID_KEY, ""))
	var origin_cell := _hang_origin_cell_from_session(session)
	if origin_map_id == "":
		_clear_hang_heal_resume_route()
		player_profile = PlayerProgressModel.stop_hang_session(player_profile, "heal_resume_no_origin")
		return "没有记录挂机点，挂机已停止。"
	hang_heal_resume_active = true
	hang_heal_resume_mode = str(session.get(HangSettingsModel.SESSION_MODE_KEY, "walk"))
	hang_heal_resume_map_id = origin_map_id
	hang_heal_resume_cell = origin_cell
	call_deferred("_update_hang_heal_resume_route")
	return "治疗完成，正在返回挂机点。"


func _hang_origin_cell_from_session(session: Dictionary) -> Vector2i:
	var cell_value = session.get(HangSettingsModel.SESSION_ORIGIN_CELL_KEY, [0, 0])
	if cell_value is Array and (cell_value as Array).size() >= 2:
		return Vector2i(int((cell_value as Array)[0]), int((cell_value as Array)[1]))
	return Vector2i.ZERO


func _update_hang_heal_resume_route() -> void:
	if not hang_heal_resume_active:
		return
	if battle_active or encounter_active or player == null or map_data.is_empty():
		return
	if _dialog_is_open() or _world_menu_is_open() or player.is_auto_moving() or has_pending_interaction:
		return
	if current_map_id != hang_heal_resume_map_id:
		var warp := _warp_to_map(current_map_id, hang_heal_resume_map_id)
		if warp.is_empty():
			_stop_hang_heal_resume_route("找不到回挂机点通路，挂机已停止。")
			return
		_set_interaction_target(warp)
		return
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	if (
		player_cell == hang_heal_resume_cell
		or player.global_position.distance_to(IsoMapModel.grid_to_world(map_data, hang_heal_resume_cell)) <= 8.0
	):
		_complete_hang_heal_resume()
		return
	var target_point := IsoMapModel.grid_to_world(map_data, hang_heal_resume_cell)
	if not _set_move_target_cell(hang_heal_resume_cell, target_point, hang_heal_resume_cell):
		_stop_hang_heal_resume_route("找不到回挂机点通路，挂机已停止。")


func _complete_hang_heal_resume() -> void:
	var resume_mode := hang_heal_resume_mode
	_clear_hang_heal_resume_route()
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position) if player != null and not map_data.is_empty() else Vector2i.ZERO
	if resume_mode == "walk" or resume_mode == "":
		var zone := EncounterModel.zone_for_cell(map_data, player_cell)
		if zone.is_empty():
			player_profile = PlayerProgressModel.stop_hang_session(player_profile, "heal_resume_no_zone")
			_request_server_hang_session_stop("heal_resume_no_zone")
			_set_world_log_message("已回到挂机点附近，但这里不是遇敌区域，挂机已停止。")
			if profile_save_enabled:
				_save_player_profile_now()
			return
		if _server_hang_session_enabled():
			var server_started := await _request_server_hang_session_start("walk", player_cell)
			if not server_started:
				player_profile = PlayerProgressModel.stop_hang_session(player_profile, "heal_resume_server_failed")
				_set_world_log_message("治疗完成，但服务器恢复挂机失败，挂机已停止。")
				return
		player_profile = PlayerProgressModel.start_hang_session(player_profile, "walk", current_map_id, player_cell)
		_set_hang_mode(true)
		_set_world_log_message("治疗完成，已回到挂机点，继续挂机。")
		if profile_save_enabled:
			_save_player_profile_now()
		return
	player_profile = PlayerProgressModel.stop_hang_session(player_profile, "heal_resume_encounter_stone_ended")
	_request_server_hang_session_stop("heal_resume_encounter_stone_ended")
	_set_world_log_message("治疗完成，已回到挂机点；遇敌石效果已结束，请重新使用。")
	if profile_save_enabled:
		_save_player_profile_now()


func _stop_hang_heal_resume_route(message: String) -> void:
	_clear_hang_heal_resume_route()
	player_profile = PlayerProgressModel.stop_hang_session(player_profile, "heal_resume_route_failed")
	_request_server_hang_session_stop("heal_resume_route_failed")
	_set_world_log_message(message)
	if profile_save_enabled:
		_save_player_profile_now()


func _clear_hang_heal_resume_route() -> void:
	hang_heal_resume_active = false
	hang_heal_resume_mode = ""
	hang_heal_resume_map_id = ""
	hang_heal_resume_cell = Vector2i.ZERO


func _claim_pet_rebirth_mm_stage2_from_dialog() -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_rebirth_mm_stage2_claim", {}, "领取2转小MM失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		if bool(parsed.get("ok", false)):
			_close_dialog()
		else:
			_update_dialog_text()
		if status_label != null:
			_update_hud_text()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("领取宠物转生奖励"):
		return
	var result := PlayerProgressModel.claim_pet_rebirth_mm_stage2(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	if bool(result.get("ok", false)):
		_close_dialog()
	else:
		_update_dialog_text()
	if status_label != null:
		_update_hud_text()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()


func _start_pet_rebirth_mm_guide_from_dialog() -> void:
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("pet_rebirth_mm_guide_start", {}, "开始宠物转生教学失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_update_dialog_text()
		if status_label != null:
			_update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("宠物转生教学"):
		return
	var result := PlayerProgressModel.start_pet_rebirth_mm_guide(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_update_dialog_text()
	if status_label != null:
		_update_hud_text()


func _dialog_primary_action_id(item: Dictionary) -> String:
	return _dialog_quest()._dialog_primary_action_id(item)


func _dialog_action_label(item: Dictionary, action_id: String) -> String:
	return _dialog_quest()._dialog_action_label(item, action_id)


func _dialog_action_options(item: Dictionary) -> Array[Dictionary]:
	return _dialog_quest()._dialog_action_options(item)


func _dialog_should_offer_quest_button(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_should_offer_quest_button(item)


func _refresh_dialog_action_buttons(item: Dictionary) -> void:
	_dialog_quest()._refresh_dialog_action_buttons(item)


func _dialog_secondary_button_texts() -> Array[String]:
	return _dialog_quest()._dialog_secondary_button_texts()


func _update_dialog_text() -> void:
	_dialog_quest()._update_dialog_text()


func _dialog_body_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_body_for(item)


func _dialog_option_text(item: Dictionary) -> String:
	return _dialog_quest()._dialog_option_text(item)


func _active_dialog_is_healer() -> bool:
	return _dialog_quest()._active_dialog_is_healer()


func _dialog_item_is_healer(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_healer(item)


func _active_dialog_is_record_point() -> bool:
	return _dialog_quest()._active_dialog_is_record_point()


func _dialog_item_is_record_point(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_record_point(item)


func _active_dialog_is_pet_skill_trainer() -> bool:
	return _dialog_quest()._active_dialog_is_pet_skill_trainer()


func _dialog_item_is_pet_skill_trainer(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_pet_skill_trainer(item)


func _dialog_item_is_pet_skill_overwrite(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_pet_skill_overwrite(item)


func _active_dialog_is_stable() -> bool:
	return _dialog_quest()._active_dialog_is_stable()


func _dialog_item_is_stable(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_stable(item)


func _dialog_item_is_rebirth(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_rebirth(item)


func _dialog_item_is_backpack_unlock(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_backpack_unlock(item)


func _dialog_item_is_guardian_battle(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_guardian_battle(item)


func _dialog_item_is_pet_rebirth_mm_trial(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_pet_rebirth_mm_trial(item)


func _dialog_item_is_pet_rebirth_mm_stage2_claim(item: Dictionary) -> bool:
	return _dialog_quest()._dialog_item_is_pet_rebirth_mm_stage2_claim(item)


func _dialog_pet_rebirth_mm_stage2_hint_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_pet_rebirth_mm_stage2_hint_for(item)


func _dialog_pet_rebirth_mm_guide_hint_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_pet_rebirth_mm_guide_hint_for(item)


func _dialog_record_point_hint_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_record_point_hint_for(item)


func _record_point_data_for_dialog(item: Dictionary) -> Dictionary:
	return _dialog_quest()._record_point_data_for_dialog(item)


func _save_record_point_from_dialog() -> void:
	var point := _record_point_data_for_dialog(active_dialog_interaction)
	if _is_server_account_session():
		var parsed := await _submit_server_profile_action("record_point_save", {"recordPoint": point}, "保存记录点失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_update_dialog_text()
		if status_label != null:
			_update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("保存记录点"):
		return
	player_profile = PlayerProgressModel.with_record_point(
		player_profile,
		str(point.get("mapId", current_map_id)),
		str(point.get("spawnName", "default")),
		str(point.get("label", "记录点"))
	)
	if profile_save_enabled:
		_save_player_profile_now()
	_set_world_log_message("记录点已保存：%s。" % str(PlayerProgressModel.record_point(player_profile).get("label", "记录点")))
	_update_dialog_text()
	if status_label != null:
		_update_hud_text()


func _dialog_healer_hint_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_healer_hint_for(item)


func _active_dialog_can_claim_quest() -> bool:
	return _dialog_quest()._active_dialog_can_claim_quest()


func _active_dialog_matches_talk_quest(item: Dictionary) -> bool:
	return _dialog_quest()._active_dialog_matches_talk_quest(item)


func _optional_dialog_quest(item: Dictionary) -> Dictionary:
	return _dialog_quest()._optional_dialog_quest(item)


func _optional_dialog_can_claim_quest(item: Dictionary) -> bool:
	return _dialog_quest()._optional_dialog_can_claim_quest(item)


func _optional_dialog_matches_talk_quest(item: Dictionary) -> bool:
	return _dialog_quest()._optional_dialog_matches_talk_quest(item)


func _dialog_quest_hint_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_quest_hint_for(item)


func _dialog_optional_quest_hint_for(item: Dictionary) -> String:
	return _dialog_quest()._dialog_optional_quest_hint_for(item)


func _current_task_text() -> String:
	_refresh_task_tracker_cache_if_needed(false)
	return task_tracker_text_cache


func _refresh_task_tracker_cache_if_needed(force: bool = false) -> void:
	if not force and not task_tracker_cache_dirty and task_tracker_text_cache != "":
		return
	var signature := _active_quest_signature()
	if not force and signature == task_tracker_source_signature_cache and task_tracker_text_cache != "":
		task_tracker_cache_dirty = false
		return
	task_tracker_source_signature_cache = signature
	current_task_text_signature_cache = signature
	current_task_text_cache = _current_task_text_uncached()
	task_tracker_text_cache = current_task_text_cache
	task_tracker_target_cache = _current_task_navigation_target_uncached()
	task_tracker_has_target_cache = not task_tracker_target_cache.is_empty()
	task_tracker_cache_dirty = false


func _task_tracker_signature_for_hud() -> String:
	if task_tracker_cache_dirty:
		return "dirty"
	return task_tracker_source_signature_cache


func _current_task_text_uncached() -> String:
	var quest_id := str(player_profile.get("activeQuestId", ""))
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		var available_quest := _first_available_unfinished_quest_for_tracker()
		if not available_quest.is_empty():
			return "可接任务 - %s" % QuestModel.title_for(available_quest)
		var mm_guide := _pet_rebirth_mm_guide_task_info(false)
		if not mm_guide.is_empty():
			return str(mm_guide.get("taskText", mm_guide.get("title", "宠物转生教学")))
		var trial := _rebirth_trial_task_info(false)
		if not trial.is_empty():
			return str(trial.get("taskText", trial.get("title", "转生试炼")))
		return "当前没有任务"
	var quest_states = player_profile.get("questStates", {})
	var quest_state := {}
	if quest_states is Dictionary:
		var state_value = (quest_states as Dictionary).get(quest_id, {})
		if state_value is Dictionary:
			quest_state = state_value
	return QuestModel.progress_text_for_state(quest, quest_state)


func _training_partner_count() -> int:
	var partners = player_profile.get("trainingPartners", [])
	if not (partners is Array):
		return 0
	return (partners as Array).size()


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


func _server_hang_session_enabled() -> bool:
	return _server_sync().server_hang_session_enabled()


func _request_server_hang_session_start(mode: String, cell: Vector2i, item_id: String = "") -> bool:
	return await _server_sync().request_server_hang_session_start(mode, cell, item_id)


func _request_server_hang_session_stop(reason: String = "manual", pending_resume: bool = false) -> void:
	await _server_sync().request_server_hang_session_stop(reason, pending_resume)


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
	if hang_session_request_active:
		_set_world_log_message("挂机同步中，请稍候。")
		return
	if _current_player_is_party_member():
		_set_world_log_message("队伍中只有队长可以开始挂机。")
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
	if _server_hang_session_enabled():
		var server_started := await _request_server_hang_session_start("walk", player_cell)
		if not server_started:
			return
		_set_hang_mode(true)
		_set_world_log_message("开始挂机，会在遇敌区域内来回走动。")
		return
	player_profile = PlayerProgressModel.start_hang_session(player_profile, "walk", current_map_id, player_cell)
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
	var next_text := "挂机"
	if battle_active:
		next_text = "停"
	elif hang_mode_active or _encounter_stone_active() or (player != null and player.is_auto_moving()):
		next_text = "停"
	if stop_button.text != next_text:
		stop_button.text = next_text


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
	hang_walk_cooldown = HANG_WALK_COOLDOWN_SECONDS / float(_gm_battle_speed_multiplier())


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


func _stop_hang_activity(message: String = "", clear_stone: bool = true, sync_server: bool = true) -> void:
	var was_active := _hang_activity_active() or bool(PlayerProgressModel.hang_session(player_profile).get(HangSettingsModel.SESSION_ENABLED_KEY, false))
	_set_hang_mode(false)
	player_profile = PlayerProgressModel.stop_hang_session(player_profile, message)
	if player != null:
		player.clear_move_target()
	_clear_navigation_state()
	if clear_stone:
		_clear_encounter_stone_effect(false, false)
	_sync_hang_button_text()
	if was_active and sync_server:
		_request_server_hang_session_stop("manual" if message == "" else message)
	if message != "":
		_set_world_log_message(message)


func _clear_navigation_state() -> void:
	_cancel_server_step_move()
	_clear_pending_click_move_target()
	current_path_cells.clear()
	current_path_is_direct = false
	has_target_marker = false
	has_target_cell = false
	_clear_pending_interaction()


func _is_ui_point(point: Vector2) -> bool:
	if panel_registry == null:
		return false
	return panel_registry.point_hits_visible_panel(point)


func _world_menu_is_open() -> bool:
	if panel_registry == null:
		return false
	return panel_registry.any_world_menu_visible()


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
	top_panel.visible = true
	if battle_round_panel != null:
		var round_size := Vector2(128.0, 40.0)
		var round_y := top_panel.position.y + top_panel.size.y + 8.0
		var timer_size := Vector2(112.0, 44.0)
		var timer_y := margin
		if viewport_size.x < 720.0:
			timer_y = round_y
			round_y = timer_y + timer_size.y + 8.0
		battle_round_panel.position = Vector2(margin, round_y)
		battle_round_panel.size = round_size
		battle_round_panel.visible = battle_active
		if battle_round_label != null:
			battle_round_label.size = round_size - Vector2(20.0, 12.0)
	if battle_timer_panel != null:
		var timer_size := Vector2(112.0, 44.0)
		var timer_y := margin
		if viewport_size.x < 720.0:
			timer_y = top_panel.position.y + top_panel.size.y + 8.0
		battle_timer_panel.position = Vector2((viewport_size.x - timer_size.x) * 0.5, timer_y)
		battle_timer_panel.size = timer_size
		battle_timer_panel.visible = battle_active
		if battle_timer_label != null:
			battle_timer_label.size = timer_size - Vector2(20.0, 12.0)

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
		side_panel.size = Vector2(268, 168)
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

	player_rebirth_preview_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	player_rebirth_preview_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		player_rebirth_preview_panel.visible = false
	if player_rebirth_preview_panel.visible and action_bar != null:
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

	equipment_synthesis_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_height) * 0.5))
	equipment_synthesis_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		equipment_synthesis_panel.visible = false
	if equipment_synthesis_panel.visible and action_bar != null:
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

	var pet_management_width: float = minf(viewport_size.x - margin * 2.0, PET_MANAGEMENT_PANEL_MAX_SIZE.x)
	var pet_management_height: float = minf(viewport_size.y - margin * 2.0 - 70.0, PET_MANAGEMENT_PANEL_MAX_SIZE.y)
	pet_management_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), pet_management_width)
	pet_management_height = maxf(minf(PET_PANEL_MIN_SIZE.y, viewport_size.y - margin * 2.0), pet_management_height)
	pet_panel.position = Vector2((viewport_size.x - pet_management_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_management_height) * 0.5))
	pet_panel.size = Vector2(pet_management_width, pet_management_height)
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

	var pet_cultivation_width: float = minf(viewport_size.x - margin * 2.0, 560.0)
	var pet_cultivation_height: float = minf(viewport_size.y - margin * 2.0 - 80.0, 320.0)
	pet_cultivation_panel.position = Vector2((viewport_size.x - pet_cultivation_width) * 0.5, maxf(margin + 92.0, (viewport_size.y - pet_cultivation_height) * 0.5))
	pet_cultivation_panel.size = Vector2(pet_cultivation_width, pet_cultivation_height)
	if battle_active:
		pet_cultivation_panel.visible = false
	if pet_cultivation_panel.visible and action_bar != null:
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

	map_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	map_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		map_panel.visible = false
	if map_panel.visible and action_bar != null:
		action_bar.visible = false

	chat_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	chat_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		chat_panel.visible = false
	if chat_panel.visible and action_bar != null:
		action_bar.visible = false

	party_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	party_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		party_panel.visible = false
	if party_panel.visible and action_bar != null:
		action_bar.visible = false

	var player_action_width: float = minf(viewport_size.x - margin * 2.0, 360.0)
	var player_action_height := minf(viewport_size.y - margin * 2.0, 346.0)
	player_action_panel.position = Vector2(
		(viewport_size.x - player_action_width) * 0.5,
		minf(viewport_size.y - player_action_height - margin, maxf(margin + 78.0, viewport_size.y - player_action_height - 120.0))
	)
	player_action_panel.size = Vector2(player_action_width, player_action_height)
	if battle_active:
		player_action_panel.visible = false
	if player_action_panel.visible and action_bar != null:
		action_bar.visible = false

	var battle_invite_width: float = minf(viewport_size.x - margin * 2.0, 390.0)
	var battle_invite_height := 184.0
	battle_invite_panel.position = Vector2((viewport_size.x - battle_invite_width) * 0.5, maxf(margin + 72.0, (viewport_size.y - battle_invite_height) * 0.32))
	battle_invite_panel.size = Vector2(battle_invite_width, battle_invite_height)
	if battle_active:
		battle_invite_panel.visible = false
	if battle_invite_panel.visible and action_bar != null:
		action_bar.visible = false

	if battle_result_panel != null:
		var battle_result_width: float = minf(viewport_size.x - margin * 2.0, 420.0)
		var battle_result_height := 184.0
		battle_result_panel.position = Vector2(
			(viewport_size.x - battle_result_width) * 0.5,
			maxf(margin + 72.0, (viewport_size.y - battle_result_height) * 0.34)
		)
		battle_result_panel.size = Vector2(battle_result_width, battle_result_height)
		if battle_result_panel.visible and action_bar != null:
			action_bar.visible = false

	mailbox_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	mailbox_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		mailbox_panel.visible = false
	if mailbox_panel.visible and action_bar != null:
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

	qa_panel.position = Vector2((viewport_size.x - pet_management_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_management_height) * 0.5))
	qa_panel.size = Vector2(pet_management_width, pet_management_height)
	if battle_active:
		qa_panel.visible = false
	if qa_panel.visible and action_bar != null:
		action_bar.visible = false

	numeric_workbench_panel.position = Vector2((viewport_size.x - pet_management_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - pet_management_height) * 0.5))
	numeric_workbench_panel.size = Vector2(pet_management_width, pet_management_height)
	if battle_active:
		numeric_workbench_panel.visible = false
	if numeric_workbench_panel.visible and action_bar != null:
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
	if battle_message_expanded:
		message_width = minf(viewport_size.x - margin * 2.0, 520.0 if is_phone_shape else 760.0)
		message_height = minf(viewport_size.y - margin * 2.0, 260.0 if is_phone_shape else 330.0)
	var message_y := viewport_size.y - message_height - margin
	if is_phone_shape and action_bar != null and action_bar.visible:
		message_y = action_bar.position.y - message_height - 8.0
	battle_message_panel.position = Vector2(margin, maxf(margin + 68.0, message_y))
	battle_message_panel.size = Vector2(message_width, message_height)
	battle_message_panel.visible = (battle_active or world_log_message != "" or not world_log_history.is_empty()) and (battle_active or not world_menu_open)

	if account_panel != null:
		var account_width: float = minf(viewport_size.x - margin * 2.0, 440.0)
		var account_height: float = minf(viewport_size.y - margin * 2.0, 284.0)
		account_panel.position = Vector2((viewport_size.x - account_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - account_height) * 0.5))
		account_panel.size = Vector2(account_width, account_height)
		if battle_active:
			account_panel.visible = false
		if account_panel.visible:
			top_panel.visible = false
			side_panel.visible = false
			action_bar.visible = false
			battle_message_panel.visible = false

	if auth_panel != null:
		var auth_width: float = minf(viewport_size.x - margin * 2.0, 460.0)
		var auth_height: float = minf(viewport_size.y - margin * 2.0, 560.0)
		auth_panel.position = Vector2((viewport_size.x - auth_width) * 0.5, maxf(margin, (viewport_size.y - auth_height) * 0.5))
		auth_panel.size = Vector2(auth_width, auth_height)
		if auth_panel.visible:
			top_panel.visible = false
			side_panel.visible = false
			action_bar.visible = false
			battle_message_panel.visible = false
			if battle_round_panel != null:
				battle_round_panel.visible = false
			if battle_timer_panel != null:
				battle_timer_panel.visible = false

	if player != null:
		player.set_movement_bounds(_player_movement_bounds())
	if game_camera != null:
		_update_camera_limits()
		_update_camera_position(true)
	queue_redraw()


func _update_hud_text(force: bool = false) -> void:
	if status_label == null or player == null:
		return
	var build_start := _perf_now()
	var viewport_size := _layout_size()
	var is_phone_shape := _is_phone_shape(viewport_size)
	var layout_name := "手机" if is_phone_shape else "PC"
	var move_name := _movement_status_name()
	var player_cell := IsoMapModel.world_to_grid(map_data, player.global_position)
	var target_text := "无"
	if has_target_cell:
		target_text = "%d,%d" % [target_cell.x, target_cell.y]
	var status_text := ""
	var detail_text := ""
	if battle_active:
		status_text = "万兽纪元  |  %s" % [move_name]
	elif is_phone_shape:
		status_text = "万兽纪元  |  %s" % [move_name]
	else:
		status_text = "万兽纪元  |  %s  |  %s  |  %s" % [str(map_data.get("name", "未知地图")), layout_name, move_name]
		if has_pending_interaction:
			target_text = str(pending_interaction.get("name", "交互点"))
		detail_text = "坐标  %d,%d\n目标  %s\n伙伴  %d/%d\n任务  -  %s" % [
			player_cell.x,
			player_cell.y,
			target_text,
			_effective_training_partner_count(),
			_training_partner_available_slots(),
			_current_task_text(),
			]
	_perf_add("hud_text_build", build_start)
	var label_start := _perf_now()
	if force or status_text != hud_status_text_cache:
		status_label.text = status_text
		hud_status_text_cache = status_text
	if detail_label != null and (force or detail_text != hud_detail_text_cache):
		detail_label.text = detail_text
		hud_detail_text_cache = detail_text
	_perf_add("hud_label_apply", label_start)
	var route_start := _perf_now()
	var route_signature := "%s|%s|%s|%s|%s|%s|%s" % [
		str(battle_active),
		str(encounter_active),
		str(has_pending_interaction),
		str(_dialog_is_open()),
		str(_world_menu_is_open()),
		current_map_id,
		_task_tracker_signature_for_hud(),
	]
	if force or route_signature != hud_task_route_signature_cache:
		hud_task_route_signature_cache = route_signature
		_refresh_task_route_button()
	_perf_add("hud_route", route_start)


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
	var next_position := _clamped_camera_center(player.global_position)
	if force or game_camera.global_position.distance_to(next_position) > 0.1:
		game_camera.global_position = next_position
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


func _draw_online_remote_players() -> void:
	if online_position_remote_players.is_empty() or map_data.is_empty():
		return
	var font := _canvas_text_font()
	for value in online_position_remote_players:
		var position := value.get("position", {}) as Dictionary if value.get("position", {}) is Dictionary else {}
		if str(position.get("mapId", "")) != current_map_id:
			continue
		var cell := Vector2i(int(position.get("cellX", 0)), int(position.get("cellY", 0)))
		if not IsoMapModel.is_inside(map_data, cell):
			continue
		var center := IsoMapModel.grid_to_world(map_data, cell)
		var moving := bool(position.get("moving", false))
		var body_color := Color(0.20, 0.66, 0.72, 0.92) if not moving else Color(0.27, 0.76, 0.82, 0.96)
		draw_circle(center + Vector2(0, 23), 19.0, Color(0.02, 0.04, 0.04, 0.32))
		draw_rect(Rect2(center + Vector2(-15, -22), Vector2(30, 38)), body_color, true)
		draw_circle(center + Vector2(0, -35), 9.0, Color(0.98, 0.75, 0.46, 0.96))
		var facing_offset := _online_facing_offset(str(position.get("facing", "south")))
		var marker_center := center + facing_offset * 18.0 + Vector2(0, -6)
		draw_circle(marker_center, 4.0, Color(1.0, 0.88, 0.38, 0.96))
		var label := _online_player_label(value)
		if label != "":
				var font_size := 14
				var label_width := clampf(float(label.length()) * 16.0 + 22.0, 56.0, 168.0)
				var rect := Rect2(center + Vector2(-label_width * 0.5, -66.0), Vector2(label_width, 22.0))
				draw_rect(rect, Color(0.04, 0.07, 0.06, 0.70), true)
				draw_string(font, rect.position + Vector2(0.0, 16.0), label, HORIZONTAL_ALIGNMENT_CENTER, rect.size.x, font_size, Color(0.94, 0.98, 0.90, 0.96))


func _online_remote_player_at_screen_point(screen_point: Vector2) -> Dictionary:
	if not _is_server_account_session() or online_position_remote_players.is_empty() or map_data.is_empty() or _is_ui_point(screen_point):
		return {}
	var world_point := _screen_to_world(screen_point)
	for index in range(online_position_remote_players.size() - 1, -1, -1):
		var value = online_position_remote_players[index]
		if not (value is Dictionary):
			continue
		var player_info := value as Dictionary
		var username := str(player_info.get("username", "")).strip_edges()
		if username == "" or username == str(current_account_session.get("username", "")).strip_edges():
			continue
		var position := player_info.get("position", {}) as Dictionary if player_info.get("position", {}) is Dictionary else {}
		if str(position.get("mapId", "")) != current_map_id:
			continue
		var cell := Vector2i(int(position.get("cellX", 0)), int(position.get("cellY", 0)))
		if not IsoMapModel.is_inside(map_data, cell):
			continue
		var center := IsoMapModel.grid_to_world(map_data, cell)
		var label := _online_player_label(player_info)
		var label_width := clampf(float(label.length()) * 16.0 + 22.0, 56.0, 168.0)
		var label_rect := Rect2(center + Vector2(-label_width * 0.5, -70.0), Vector2(label_width, 30.0))
		var body_rect := Rect2(center + Vector2(-28.0, -50.0), Vector2(56.0, 92.0))
		if label_rect.has_point(world_point) or body_rect.has_point(world_point) or world_point.distance_to(center + Vector2(0.0, -14.0)) <= 52.0:
			return player_info.duplicate(true)
	return {}


func _online_facing_offset(facing: String) -> Vector2:
	match facing:
		"east":
			return Vector2.RIGHT
		"southeast":
			return Vector2(1, 1).normalized()
		"south":
			return Vector2.DOWN
		"southwest":
			return Vector2(-1, 1).normalized()
		"west":
			return Vector2.LEFT
		"northwest":
			return Vector2(-1, -1).normalized()
		"north":
			return Vector2.UP
		"northeast":
			return Vector2(1, -1).normalized()
	return Vector2.DOWN


func _online_player_label(player_info: Dictionary) -> String:
	var display_name := str(player_info.get("displayName", "")).strip_edges()
	var username := str(player_info.get("username", "")).strip_edges()
	if display_name == "":
		display_name = username
	return display_name


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
		if _battle_actor_has_active_ride(actor):
			_draw_battle_mount_actor(actor, pos, visual_scale, alpha, side, launch_rotation)
			_draw_battle_rider_actor(actor, pos + Vector2(0, -25) * visual_scale, visual_scale, alpha, body_color, trim_color)
		else:
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
		if _battle_actor_has_active_ride(actor):
			var ride_hp_actor := {
				"hp": int(actor.get("ridePetHp", 0)),
				"maxHp": maxi(1, int(actor.get("ridePetMaxHp", 1))),
			}
			_draw_battle_hp_bar(
				ride_hp_actor,
				pos + Vector2(0, hp_offset + 10.0 * visual_scale),
				alpha,
				visual_scale,
				Color(0.38, 0.74, 1.0, 0.94),
				Color(0.06, 0.09, 0.12, 0.82),
				Color(0.58, 0.88, 1.0, 0.82)
			)
	if show_actor_name:
		_draw_battle_actor_label(actor, pos + Vector2(0, name_offset), visual_scale, alpha, compact_labels)
	if int(actor.get("hp", 0)) > 0:
		_draw_battle_status_badges(actor, pos + Vector2(0, hp_offset - 17.0 * visual_scale), visual_scale, alpha)


func _battle_actor_has_active_ride(actor: Dictionary) -> bool:
	return (
		str(actor.get("kind", "")) == "player"
		and str(actor.get("ridePetInstanceId", "")).strip_edges() != ""
		and int(actor.get("ridePetHp", 0)) > 0
		and int(actor.get("ridePetMaxHp", 0)) > 0
	)


func _draw_battle_rider_actor(actor: Dictionary, pos: Vector2, visual_scale: float, alpha: float, body_color: Color, trim_color: Color) -> void:
	var rider_body := body_color
	if str(actor.get("id", "")) == BattleModel.PLAYER_ACTOR_ID:
		rider_body = Color(0.78, 0.24, 0.23, alpha)
	var rider_scale := visual_scale * 0.82
	draw_rect(Rect2(pos + Vector2(-14, -37) * rider_scale, Vector2(28, 42) * rider_scale), rider_body, true)
	draw_circle(pos + Vector2(0, -45) * rider_scale, 10.5 * rider_scale, Color(0.96, 0.72, 0.46, alpha))
	draw_line(pos + Vector2(-13, -13) * rider_scale, pos + Vector2(13, -13) * rider_scale, trim_color, 3.0 * visual_scale, true)


func _draw_battle_mount_actor(actor: Dictionary, pos: Vector2, visual_scale: float, alpha: float, side: String, launch_rotation: float) -> void:
	var form_id := str(actor.get("ridePetFormId", "")).to_lower()
	if form_id.find("dragon") >= 0:
		_draw_battle_dragon_mount(pos, visual_scale, alpha, side, launch_rotation)
	else:
		_draw_battle_tiger_mount(pos, visual_scale, alpha, side, launch_rotation)


func _draw_battle_tiger_mount(pos: Vector2, visual_scale: float, alpha: float, side: String, launch_rotation: float) -> void:
	var facing := -1.0 if side == BattleModel.SIDE_ALLY else 1.0
	var body_center := pos + Vector2(0, -16) * visual_scale
	var head_center := pos + Vector2(30.0 * facing, -24) * visual_scale
	var body_color := Color(0.88, 0.56, 0.22, alpha)
	var stripe_color := Color(0.22, 0.13, 0.08, 0.82 * alpha)
	var body_points := _battle_ellipse_points(body_center, Vector2(42, 21) * visual_scale, launch_rotation)
	var head_points := _battle_ellipse_points(head_center, Vector2(17, 14) * visual_scale, launch_rotation)
	draw_polygon(body_points, _battle_solid_colors(body_points.size(), body_color))
	draw_polygon(head_points, _battle_solid_colors(head_points.size(), body_color.lightened(0.08)))
	draw_polygon(PackedVector2Array([
		head_center + _battle_rotated_visual_offset(Vector2(-9 * facing, -12), visual_scale, launch_rotation),
		head_center + _battle_rotated_visual_offset(Vector2(-1 * facing, -25), visual_scale, launch_rotation),
		head_center + _battle_rotated_visual_offset(Vector2(4 * facing, -10), visual_scale, launch_rotation),
	]), PackedColorArray([body_color.lightened(0.18), body_color.lightened(0.18), body_color.lightened(0.18)]))
	for stripe_index in range(3):
		var x := (-20.0 + float(stripe_index) * 17.0) * visual_scale
		draw_line(
			body_center + _battle_rotated_visual_offset(Vector2(x / visual_scale, -14), visual_scale, launch_rotation),
			body_center + _battle_rotated_visual_offset(Vector2((x + 8.0 * visual_scale) / visual_scale, -1), visual_scale, launch_rotation),
			stripe_color,
			2.2 * visual_scale,
			true
		)
	draw_circle(head_center + _battle_rotated_visual_offset(Vector2(7 * facing, -3), visual_scale, launch_rotation), 3.0 * visual_scale, Color(0.06, 0.08, 0.07, alpha))
	draw_line(pos + Vector2(-27, 5) * visual_scale, pos + Vector2(25, 5) * visual_scale, Color(0.16, 0.10, 0.06, 0.68 * alpha), 4.0 * visual_scale, true)


func _draw_battle_dragon_mount(pos: Vector2, visual_scale: float, alpha: float, side: String, launch_rotation: float) -> void:
	var facing := -1.0 if side == BattleModel.SIDE_ALLY else 1.0
	var body_center := pos + Vector2(0, -15) * visual_scale
	var head_center := pos + Vector2(34.0 * facing, -26) * visual_scale
	var body_color := Color(0.42, 0.72, 0.48, alpha)
	var trim := Color(0.86, 0.96, 0.50, alpha)
	var body_points := _battle_ellipse_points(body_center, Vector2(46, 24) * visual_scale, launch_rotation)
	var head_points := _battle_ellipse_points(head_center, Vector2(19, 15) * visual_scale, launch_rotation)
	draw_polygon(body_points, _battle_solid_colors(body_points.size(), body_color))
	draw_polygon(head_points, _battle_solid_colors(head_points.size(), body_color.lightened(0.10)))
	for spike_index in range(3):
		var x := (-22.0 + float(spike_index) * 20.0) * visual_scale
		draw_polygon(PackedVector2Array([
			body_center + _battle_rotated_visual_offset(Vector2(x / visual_scale, -18), visual_scale, launch_rotation),
			body_center + _battle_rotated_visual_offset(Vector2((x + 7.0 * visual_scale) / visual_scale, -36), visual_scale, launch_rotation),
			body_center + _battle_rotated_visual_offset(Vector2((x + 14.0 * visual_scale) / visual_scale, -18), visual_scale, launch_rotation),
		]), PackedColorArray([trim, trim, trim]))
	draw_circle(head_center + _battle_rotated_visual_offset(Vector2(8 * facing, -3), visual_scale, launch_rotation), 3.3 * visual_scale, Color(0.06, 0.08, 0.07, alpha))
	draw_line(pos + Vector2(-30, 6) * visual_scale, pos + Vector2(28, 6) * visual_scale, Color(0.12, 0.20, 0.13, 0.68 * alpha), 4.5 * visual_scale, true)


func _battle_ellipse_points(center: Vector2, radius: Vector2, rotation: float = 0.0, segments: int = 24) -> PackedVector2Array:
	var points := PackedVector2Array()
	var count := maxi(8, segments)
	for index in range(count):
		var angle := TAU * float(index) / float(count)
		var local := Vector2(cos(angle) * radius.x, sin(angle) * radius.y)
		if absf(rotation) > 0.001:
			local = local.rotated(rotation)
		points.append(center + local)
	return points


func _battle_solid_colors(count: int, color: Color) -> PackedColorArray:
	var colors := PackedColorArray()
	for _index in range(maxi(0, count)):
		colors.append(color)
	return colors


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
	var plan := _battle_actor_label_draw_plan(actor, visual_scale, compact)
	var label := str(plan.get("label", ""))
	if label == "":
		return
	var font := _canvas_text_font()
	var label_width := float(plan.get("width", (112.0 if compact else 132.0) * visual_scale))
	var font_size := int(plan.get("fontSize", maxi(9, int(round((11.0 if compact else 15.0) * visual_scale)))))
	var origin := center + Vector2(-label_width * 0.5, 0)
	draw_string(font, origin + Vector2(1, 1), label, HORIZONTAL_ALIGNMENT_CENTER, label_width, font_size, Color(0.05, 0.06, 0.05, 0.72 * alpha))
	draw_string(font, origin, label, HORIZONTAL_ALIGNMENT_CENTER, label_width, font_size, Color(0.96, 0.93, 0.80, alpha))


func _battle_actor_label_draw_plan(actor: Dictionary, visual_scale: float, compact: bool) -> Dictionary:
	var full_label := _battle_actor_label(actor)
	if full_label == "":
		return {"label": "", "width": 0.0, "fontSize": 0, "fits": true, "fullLabel": true}
	var font := _canvas_text_font()
	var font_size := maxi(9, int(round((11.0 if compact else 15.0) * visual_scale)))
	var min_font_size := 8
	var base_width := (112.0 if compact else 132.0) * visual_scale
	var max_width := maxf((176.0 if compact else 240.0) * visual_scale, 128.0 if compact else 168.0)
	var label := full_label
	var text_width := _font_text_width(font, label, font_size)
	while font_size > min_font_size and text_width + 8.0 > max_width:
		font_size -= 1
		text_width = _font_text_width(font, label, font_size)
	if text_width + 8.0 > max_width:
		label = _battle_actor_label_trimmed_to_width(actor, font, font_size, max_width - 8.0)
		text_width = _font_text_width(font, label, font_size)
	var label_width := clampf(maxf(base_width, text_width + 8.0), base_width, max_width)
	return {
		"label": label,
		"width": label_width,
		"fontSize": font_size,
		"fits": text_width <= label_width + 0.5,
		"fullLabel": label == full_label,
	}


func _battle_actor_label_trimmed_to_width(actor: Dictionary, font: Font, font_size: int, max_text_width: float) -> String:
	var actor_name := str(actor.get("name", "")).strip_edges()
	var level := maxi(1, int(actor.get("level", 1)))
	var suffix := " Lv%d" % level
	var label := "%s%s" % [actor_name, suffix]
	if _font_text_width(font, label, font_size) <= max_text_width:
		return label
	var suffix_width := _font_text_width(font, suffix, font_size)
	var marker := "..."
	var marker_width := _font_text_width(font, marker, font_size)
	var available_name_width := maxf(0.0, max_text_width - suffix_width - marker_width)
	var trimmed_name := actor_name
	while trimmed_name.length() > 1 and _font_text_width(font, trimmed_name, font_size) > available_name_width:
		trimmed_name = trimmed_name.left(trimmed_name.length() - 1)
	return "%s%s%s" % [trimmed_name, marker, suffix]


func _font_text_width(font: Font, text: String, font_size: int) -> float:
	return font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1.0, font_size).x


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
	var font := _canvas_text_font()
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
	var font := _canvas_text_font()
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


func _draw_battle_hp_bar(actor: Dictionary, center: Vector2, alpha: float, visual_scale: float, fill_color: Color = Color(0.74, 0.92, 0.35, 0.95), background_color: Color = Color(0.08, 0.10, 0.09, 0.78), border_color: Color = Color(0.97, 0.82, 0.44, 0.82)) -> void:
	var max_hp := maxf(1.0, float(actor.get("maxHp", 1)))
	var hp := clampf(float(actor.get("hp", 0)), 0.0, max_hp)
	var pct := hp / max_hp
	var size := Vector2(74, 8) * visual_scale
	var origin := center - size * 0.5
	draw_rect(Rect2(origin, size), Color(background_color.r, background_color.g, background_color.b, background_color.a * alpha), true)
	draw_rect(Rect2(origin, Vector2(size.x * pct, size.y)), Color(fill_color.r, fill_color.g, fill_color.b, fill_color.a * alpha), true)
	draw_rect(Rect2(origin, size), Color(border_color.r, border_color.g, border_color.b, border_color.a * alpha), false, 1.2 * visual_scale, true)


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
		if EncounterModel.is_manual_only(zone):
			continue
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
		elif item_kind == "sign":
			var board_rect := Rect2(marker + Vector2(-26, -47), Vector2(52, 28))
			draw_line(marker + Vector2(0, 16), marker + Vector2(0, -18), Color(0.42, 0.27, 0.14, 0.98), 5.0)
			draw_rect(board_rect, Color(0.05, 0.04, 0.03, 0.55), true)
			draw_rect(board_rect.grow(-2.0), Color(0.58, 0.38, 0.18, 0.97), true)
			draw_line(board_rect.position + Vector2(5, 8), board_rect.position + Vector2(47, 8), Color(0.82, 0.62, 0.30, 0.95), 2.0)
			draw_line(board_rect.position + Vector2(5, 20), board_rect.position + Vector2(47, 20), Color(0.32, 0.20, 0.10, 0.55), 2.0)
		else:
			var blocks_movement := InteractionModel.blocks_movement(item)
			var body_color := Color(0.74, 0.36, 0.25, 0.98) if blocks_movement else Color(0.22, 0.58, 0.66, 0.98)
			var trim_color := Color(0.99, 0.82, 0.45, 0.95) if blocks_movement else Color(0.58, 0.89, 0.78, 0.95)
			draw_circle(marker + Vector2(0, -9), 8.0, Color(0.99, 0.76, 0.46, 0.98))
			draw_rect(Rect2(marker + Vector2(-8, -1), Vector2(16, 20)), body_color, true)
			draw_line(marker + Vector2(-13, 8), marker + Vector2(13, 8), trim_color, 3.0)
		_draw_npc_quest_marker(item, marker)
		_draw_facility_marker_label(item, marker, selected)


func _draw_npc_quest_marker(item: Dictionary, marker: Vector2) -> void:
	var state := _quest_marker_state_for_item(item, false)
	if state == QUEST_MARKER_NONE:
		return
	var visual := _quest_marker_visual_for_state(state)
	if visual.is_empty():
		return
	var fill: Color = visual.get("fill", Color(1.0, 0.82, 0.18, 0.98))
	var border: Color = visual.get("border", Color(1.0, 0.95, 0.54, 0.98))
	var text_color: Color = visual.get("textColor", Color(0.16, 0.12, 0.04, 0.98))
	var glyph := str(visual.get("glyph", "!"))
	var center := marker + Vector2(0, -86)
	draw_circle(center + Vector2(1, 2), 12.5, Color(0.03, 0.04, 0.03, 0.58))
	draw_circle(center, 12.0, fill)
	draw_arc(center, 13.0, 0.0, TAU, 28, border, 2.2, true)
	var font := _canvas_text_font()
	draw_string(font, center + Vector2(-9, 7), glyph, HORIZONTAL_ALIGNMENT_CENTER, 18.0, 22, text_color)


func _quest_marker_visual_for_state(state: String) -> Dictionary:
	match state:
		QUEST_MARKER_AVAILABLE:
			return {
				"glyph": "!",
				"tone": "yellow",
				"fill": Color(1.0, 0.82, 0.18, 0.98),
				"border": Color(1.0, 0.95, 0.54, 0.98),
				"textColor": Color(0.16, 0.12, 0.04, 0.98),
			}
		QUEST_MARKER_BLOCKED:
			return {
				"glyph": "!",
				"tone": "red",
				"fill": Color(0.88, 0.18, 0.13, 0.98),
				"border": Color(1.0, 0.48, 0.40, 0.98),
				"textColor": Color(1.0, 0.94, 0.86, 0.98),
			}
		QUEST_MARKER_IN_PROGRESS:
			return {
				"glyph": "?",
				"tone": "gray",
				"fill": Color(0.84, 0.84, 0.78, 0.94),
				"border": Color(1.0, 1.0, 0.94, 0.92),
				"textColor": Color(0.18, 0.19, 0.17, 0.96),
			}
		QUEST_MARKER_READY:
			return {
				"glyph": "?",
				"tone": "yellow",
				"fill": Color(1.0, 0.82, 0.18, 0.98),
				"border": Color(1.0, 0.95, 0.54, 0.98),
				"textColor": Color(0.16, 0.12, 0.04, 0.98),
			}
		QUEST_MARKER_REBIRTH_AVAILABLE:
			return {
				"glyph": "!",
				"tone": "gray",
				"fill": Color(0.84, 0.84, 0.78, 0.94),
				"border": Color(1.0, 1.0, 0.94, 0.92),
				"textColor": Color(0.18, 0.19, 0.17, 0.96),
			}
		QUEST_MARKER_REBIRTH_READY:
			return {
				"glyph": "!",
				"tone": "yellow",
				"fill": Color(1.0, 0.82, 0.18, 0.98),
				"border": Color(1.0, 0.95, 0.54, 0.98),
				"textColor": Color(0.16, 0.12, 0.04, 0.98),
			}
		QUEST_MARKER_REPEATABLE:
			return {
				"glyph": "!",
				"tone": "blue",
				"fill": Color(0.20, 0.62, 1.0, 0.98),
				"border": Color(0.62, 0.86, 1.0, 0.98),
				"textColor": Color(0.04, 0.10, 0.18, 0.98),
			}
	return {}


func _quest_marker_state_for_item(item: Dictionary, force_refresh: bool = true) -> String:
	_refresh_quest_marker_cache_if_needed(force_refresh)
	var item_id := str(item.get("id", ""))
	if item_id == "":
		return QUEST_MARKER_NONE
	return str(quest_marker_state_cache.get(item_id, QUEST_MARKER_NONE))


func _compute_quest_marker_state_for_item(item: Dictionary, available_quest: Dictionary = {}, blocked_quest: Dictionary = {}) -> String:
	var item_id := str(item.get("id", ""))
	if item_id == "":
		return QUEST_MARKER_NONE
	var mm_guide_marker := _pet_rebirth_mm_guide_marker_state_for_item(item_id)
	if mm_guide_marker != QUEST_MARKER_NONE:
		return mm_guide_marker
	if item_id == "firebud_pet_mm_stage2_keeper":
		return QUEST_MARKER_NONE if PlayerProgressModel.pet_rebirth_mm_stage2_claimed(player_profile) else QUEST_MARKER_AVAILABLE
	var rebirth_marker_state := _rebirth_mentor_marker_state(item_id)
	if rebirth_marker_state != QUEST_MARKER_NONE:
		return rebirth_marker_state
	var quest := PlayerProgressModel.active_quest(player_profile)
	if not quest.is_empty():
		var state := PlayerProgressModel.active_quest_state(player_profile)
		var status := str(state.get("status", QuestModel.STATUS_ACTIVE))
		if status == QuestModel.STATUS_READY and QuestModel.turn_in_id_for(quest) == item_id:
			return QUEST_MARKER_READY
		if status == QuestModel.STATUS_ACTIVE:
			var objective := QuestModel.objective_for(quest)
			if str(objective.get("type", "")) == "talk" and str(objective.get("targetId", QuestModel.turn_in_id_for(quest))) == item_id:
				return QUEST_MARKER_IN_PROGRESS
			if QuestModel.turn_in_id_for(quest) == item_id:
				return QUEST_MARKER_IN_PROGRESS
	var optional_state := _optional_quest_marker_state_for_item(item)
	if optional_state != QUEST_MARKER_NONE:
		return optional_state
	if not quest.is_empty():
		return QUEST_MARKER_NONE
	if not available_quest.is_empty() and QuestModel.giver_id_for(available_quest) == item_id:
		return QUEST_MARKER_AVAILABLE
	if not blocked_quest.is_empty() and QuestModel.giver_id_for(blocked_quest) == item_id:
		return QUEST_MARKER_BLOCKED
	return QUEST_MARKER_NONE


func _pet_rebirth_mm_guide_marker_state_for_item(item_id: String) -> String:
	var info := PlayerProgressModel.pet_rebirth_mm_guide_info(player_profile)
	var status := str(info.get("status", ""))
	var step := str(info.get("step", ""))
	if item_id == "firebud_pet_mm_trial_mentor":
		if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED:
			return QUEST_MARKER_REPEATABLE
		if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE:
			return QUEST_MARKER_AVAILABLE
		if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE and step == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_CLAIM_MM:
			return QUEST_MARKER_IN_PROGRESS
	if status != PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE:
		return QUEST_MARKER_NONE
	match step:
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_WITHDRAW_MM, PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_PREPARE_TARGET:
			return QUEST_MARKER_IN_PROGRESS if item_id == "firebud_stable_keeper" else QUEST_MARKER_NONE
		PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_FEED_MM, PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_LEVEL_MM:
			return QUEST_MARKER_IN_PROGRESS if item_id == "firebud_diamond_keeper" else QUEST_MARKER_NONE
	return QUEST_MARKER_NONE


func _rebirth_mentor_marker_state(item_id: String) -> String:
	if item_id != "firebud_rebirth_mentor":
		return QUEST_MARKER_NONE
	var current_rebirth := maxi(0, int(player_profile.get(PlayerProgressModel.REBIRTH_COUNT_KEY, 0)))
	if current_rebirth >= RebirthModel.MAX_REBIRTH_COUNT:
		return QUEST_MARKER_NONE
	var target_count := current_rebirth + 1
	if target_count > RebirthTrialModel.stages().size():
		return QUEST_MARKER_NONE
	var active_quest_id := str(player_profile.get(PlayerProgressModel.ACTIVE_QUEST_ID_KEY, ""))
	var expected_quest_id := "quest_rebirth_%d_guidance" % target_count
	if active_quest_id == expected_quest_id:
		return QUEST_MARKER_IN_PROGRESS
	var player := player_profile.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	var quest_completed := _rebirth_quest_completed_for_target(player_profile, target_count)
	if not quest_completed:
		return QUEST_MARKER_REBIRTH_AVAILABLE if player_level >= RebirthModel.MIN_REBIRTH_LEVEL else QUEST_MARKER_BLOCKED
	if _rebirth_trial_ready_for_target_raw(target_count):
		return QUEST_MARKER_REBIRTH_READY
	return QUEST_MARKER_IN_PROGRESS


func _rebirth_trial_ready_for_target_raw(target_count: int) -> bool:
	var player := player_profile.get("player", {}) as Dictionary
	if maxi(1, int(player.get("level", 1))) < RebirthModel.MIN_REBIRTH_LEVEL:
		return false
	if not _rebirth_quest_completed_for_target(player_profile, target_count):
		return false
	for ring_id in RebirthTrialModel.stage_required_ring_ids(target_count):
		if _raw_backpack_item_count(ring_id) <= 0:
			return false
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target_count):
		if not _profile_has_pet_form_raw(player_profile, form_id):
			return false
	var proofs = player_profile.get(PlayerProgressModel.REBIRTH_TRIAL_PROOFS_KEY, {})
	var proof_count := int((proofs as Dictionary).get(PlayerProgressModel.REBIRTH_FINAL_BOSS_PROOF_ID, 0)) if proofs is Dictionary else 0
	return proof_count > 0


func _optional_quest_marker_state_for_item(item: Dictionary) -> String:
	var item_id := str(item.get("id", ""))
	if item_id == "":
		return QUEST_MARKER_NONE
	var optional_quest := PlayerProgressModel.optional_quest_for_interaction(player_profile, item_id)
	if not optional_quest.is_empty():
		var quest_id := str(optional_quest.get("id", ""))
		var raw_states = player_profile.get(PlayerProgressModel.QUEST_STATES_KEY, {})
		var has_quest_state := raw_states is Dictionary and (raw_states as Dictionary).has(quest_id)
		if not has_quest_state:
			return QUEST_MARKER_AVAILABLE
		var state := PlayerProgressModel.quest_state_for_id(player_profile, quest_id)
		var status := str(state.get("status", QuestModel.STATUS_ACTIVE))
		if status == QuestModel.STATUS_READY and QuestModel.turn_in_id_for(optional_quest) == item_id:
			return QUEST_MARKER_READY
		if status == QuestModel.STATUS_ACTIVE:
			var objective := QuestModel.objective_for(optional_quest)
			if str(objective.get("type", "")) == "talk" and str(objective.get("targetId", QuestModel.turn_in_id_for(optional_quest))) == item_id:
				return QUEST_MARKER_IN_PROGRESS
			if QuestModel.turn_in_id_for(optional_quest) == item_id:
				return QUEST_MARKER_IN_PROGRESS
	var blocked_quest := PlayerProgressModel.blocked_optional_quest_for_interaction(player_profile, item_id)
	if not blocked_quest.is_empty():
		return QUEST_MARKER_BLOCKED
	return QUEST_MARKER_NONE


func _first_available_unfinished_quest_for_marker() -> Dictionary:
	var states = player_profile.get(PlayerProgressModel.QUEST_STATES_KEY, {})
	var state_map := states as Dictionary if states is Dictionary else {}
	for quest in QuestModel.quests():
		if QuestModel.is_optional(quest):
			continue
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := QuestModel.normalize_state(state_map.get(quest_id, {}), quest_id)
		if state_map.has(quest_id) and str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			continue
		if PlayerProgressModel.quest_available_for_profile(player_profile, quest):
			return quest
	return {}


func _first_blocked_unfinished_quest_for_marker() -> Dictionary:
	var states = player_profile.get(PlayerProgressModel.QUEST_STATES_KEY, {})
	var state_map := states as Dictionary if states is Dictionary else {}
	for quest in QuestModel.quests():
		if QuestModel.is_optional(quest):
			continue
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := QuestModel.normalize_state(state_map.get(quest_id, {}), quest_id)
		if state_map.has(quest_id) and str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			continue
		if not PlayerProgressModel.quest_available_for_profile(player_profile, quest):
			if _quest_should_show_blocked_marker(quest):
				return quest
			continue
		return {}
	return {}


func _quest_should_show_blocked_marker(quest: Dictionary) -> bool:
	var required_missing_ability := str(quest.get("requiredMissingAbility", quest.get("requiresMissingAbility", ""))).strip_edges()
	if required_missing_ability != "":
		var abilities := PlayerProgressModel.unlocked_abilities(player_profile)
		if abilities.has(required_missing_ability):
			return false
	var current_rebirth := PlayerProgressModel.rebirth_count(player_profile)
	var rebirth_target := QuestModel.rebirth_completion_target(quest)
	if rebirth_target > 0:
		return rebirth_target > current_rebirth + 1
	var required_rebirth := maxi(0, int(quest.get("requiredRebirthCount", quest.get("requiresRebirthCount", 0))))
	if required_rebirth > 0:
		return current_rebirth < required_rebirth
	return true


func _draw_facility_marker_label(item: Dictionary, marker: Vector2, selected: bool) -> void:
	var facility_label := InteractionModel.facility_label_for(item)
	if facility_label == "":
		return
	var font := _canvas_text_font()
	var font_size := 14
	var label_width := maxf(42.0, float(facility_label.length()) * 18.0 + 18.0)
	var label_rect := Rect2(marker + Vector2(-label_width * 0.5, -62.0), Vector2(label_width, 22.0))
	var fill_color := _facility_marker_color(InteractionModel.facility_type_for(item), selected)
	draw_rect(label_rect, Color(0.04, 0.07, 0.06, 0.72), true)
	draw_rect(label_rect.grow(-2.0), fill_color, true)
	draw_string(font, label_rect.position + Vector2(0.0, 16.0), facility_label, HORIZONTAL_ALIGNMENT_CENTER, label_rect.size.x, font_size, Color(0.98, 0.96, 0.86, 0.98))


func _facility_marker_color(facility_type: String, selected: bool = false) -> Color:
	var color := Color(0.42, 0.42, 0.36, 0.86)
	match facility_type:
		InteractionModel.FACILITY_HEALER:
			color = Color(0.18, 0.52, 0.30, 0.88)
		InteractionModel.FACILITY_ITEM_SHOP:
			color = Color(0.58, 0.38, 0.12, 0.88)
		InteractionModel.FACILITY_EQUIPMENT_SHOP:
			color = Color(0.56, 0.28, 0.13, 0.88)
		InteractionModel.FACILITY_STABLE:
			color = Color(0.18, 0.45, 0.50, 0.88)
		InteractionModel.FACILITY_RECORD_POINT:
			color = Color(0.24, 0.42, 0.64, 0.88)
		InteractionModel.FACILITY_TRAINER:
			color = Color(0.40, 0.30, 0.62, 0.88)
		InteractionModel.FACILITY_REBIRTH:
			color = Color(0.52, 0.38, 0.68, 0.88)
		InteractionModel.FACILITY_GUARDIAN:
			color = Color(0.58, 0.26, 0.18, 0.88)
	if selected:
		color = color.lightened(0.22)
	return color


func _draw_ground_pet_drops() -> void:
	var font := _canvas_text_font()
	for drop in _ground_pet_drops_on_map_fast(current_map_id):
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


func _update_path_line_overlay() -> void:
	if path_line_node == null:
		return
	if battle_active or encounter_active or player == null or not has_target_marker or current_path_cells.size() < 2:
		if path_line_node.visible:
			path_line_node.visible = false
			path_line_node.clear_points()
		return
	var points := PackedVector2Array()
	if current_path_is_direct:
		points.append(player.global_position)
		points.append(target_marker)
	else:
		for cell in current_path_cells:
			points.append(IsoMapModel.grid_to_world(map_data, cell))
	path_line_node.points = points
	if not path_line_node.visible:
		path_line_node.visible = true


func _player_movement_bounds() -> Rect2:
	if map_data.is_empty():
		return Rect2(Vector2.ZERO, _layout_size())
	return _map_world_bounds().grow(120.0)


func _map_world_bounds() -> Rect2:
	if map_world_bounds_cache_valid:
		return map_world_bounds_cache
	var size := IsoMapModel.grid_size(map_data)
	var tile := IsoMapModel.tile_size(map_data)
	var min_point := Vector2(INF, INF)
	var max_point := Vector2(-INF, -INF)
	for y in range(size.y):
		for x in range(size.x):
			var center := IsoMapModel.grid_to_world(map_data, Vector2i(x, y))
			min_point = min_point.min(center - tile * 0.5)
			max_point = max_point.max(center + tile * 0.5)
	map_world_bounds_cache = Rect2(min_point, max_point - min_point)
	map_world_bounds_cache_valid = true
	return map_world_bounds_cache


func _draw_target_marker(point: Vector2) -> void:
	var color := Color(1.0, 0.74, 0.16, 0.95)
	var size := 22.0
	draw_line(point + Vector2(0, -size), point + Vector2(size, 0), color, 5.0)
	draw_line(point + Vector2(size, 0), point + Vector2(0, size), color, 5.0)
	draw_line(point + Vector2(0, size), point + Vector2(-size, 0), color, 5.0)
	draw_line(point + Vector2(-size, 0), point + Vector2(0, -size), color, 5.0)
	draw_circle(point, 5.0, Color(1.0, 0.92, 0.38, 0.95))
