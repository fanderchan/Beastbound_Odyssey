extends RefCounted

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
	"mistcap_marsh": "res://data/mistcap_marsh_map.json",
	"suncrack_badlands": "res://data/suncrack_badlands_map.json",
	"windglass_highlands": "res://data/windglass_highlands_map.json",
	"firebud_manor": "res://data/firebud_manor_map.json",
	"earth_vein_manor": "res://data/earth_vein_manor_map.json",
	"tide_echo_manor": "res://data/tide_echo_manor_map.json",
	"ember_core_manor": "res://data/ember_core_manor_map.json",
	"gale_breath_manor": "res://data/gale_breath_manor_map.json",
	"shadow_oath_manor": "res://data/shadow_oath_manor_map.json",
	"beast_pen_manor": "res://data/beast_pen_manor_map.json",
	"artisan_manor": "res://data/artisan_manor_map.json",
	"training_manor": "res://data/training_manor_map.json",
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
const DIALOG_ACTION_FAMILY_MANOR := "family_manor"
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

var host

var player:
	get:
		return host.player
	set(value):
		host.player = value

var pet:
	get:
		return host.pet
	set(value):
		host.pet = value

var path_line_node:
	get:
		return host.path_line_node
	set(value):
		host.path_line_node = value

var hud_root:
	get:
		return host.hud_root
	set(value):
		host.hud_root = value

var panel_registry:
	get:
		return host.panel_registry
	set(value):
		host.panel_registry = value

var top_panel:
	get:
		return host.top_panel
	set(value):
		host.top_panel = value

var side_panel:
	get:
		return host.side_panel
	set(value):
		host.side_panel = value

var action_bar:
	get:
		return host.action_bar
	set(value):
		host.action_bar = value

var dialog_panel:
	get:
		return host.dialog_panel
	set(value):
		host.dialog_panel = value

var status_label:
	get:
		return host.status_label
	set(value):
		host.status_label = value

var version_label:
	get:
		return host.version_label
	set(value):
		host.version_label = value

var detail_label:
	get:
		return host.detail_label
	set(value):
		host.detail_label = value

var task_route_button:
	get:
		return host.task_route_button
	set(value):
		host.task_route_button = value

var dialog_name_label:
	get:
		return host.dialog_name_label
	set(value):
		host.dialog_name_label = value

var dialog_body_label:
	get:
		return host.dialog_body_label
	set(value):
		host.dialog_body_label = value

var dialog_button_row:
	get:
		return host.dialog_button_row
	set(value):
		host.dialog_button_row = value

var dialog_option_button:
	get:
		return host.dialog_option_button
	set(value):
		host.dialog_option_button = value

var dialog_close_button:
	get:
		return host.dialog_close_button
	set(value):
		host.dialog_close_button = value

var dialog_secondary_buttons:
	get:
		return host.dialog_secondary_buttons
	set(value):
		host.dialog_secondary_buttons = value

var encounter_panel:
	get:
		return host.encounter_panel
	set(value):
		host.encounter_panel = value

var encounter_title_label:
	get:
		return host.encounter_title_label
	set(value):
		host.encounter_title_label = value

var encounter_body_label:
	get:
		return host.encounter_body_label
	set(value):
		host.encounter_body_label = value

var encounter_enter_button:
	get:
		return host.encounter_enter_button
	set(value):
		host.encounter_enter_button = value

var encounter_retreat_button:
	get:
		return host.encounter_retreat_button
	set(value):
		host.encounter_retreat_button = value

var battle_command_panel:
	get:
		return host.battle_command_panel
	set(value):
		host.battle_command_panel = value

var battle_command_title_label:
	get:
		return host.battle_command_title_label
	set(value):
		host.battle_command_title_label = value

var battle_round_panel:
	get:
		return host.battle_round_panel
	set(value):
		host.battle_round_panel = value

var battle_round_label:
	get:
		return host.battle_round_label
	set(value):
		host.battle_round_label = value

var battle_timer_panel:
	get:
		return host.battle_timer_panel
	set(value):
		host.battle_timer_panel = value

var battle_timer_label:
	get:
		return host.battle_timer_label
	set(value):
		host.battle_timer_label = value

var battle_auto_button:
	get:
		return host.battle_auto_button
	set(value):
		host.battle_auto_button = value

var battle_auto_stop_button:
	get:
		return host.battle_auto_stop_button
	set(value):
		host.battle_auto_stop_button = value

var battle_command_button_grid:
	get:
		return host.battle_command_button_grid
	set(value):
		host.battle_command_button_grid = value

var battle_passive_panel:
	get:
		return host.battle_passive_panel
	set(value):
		host.battle_passive_panel = value

var battle_passive_label:
	get:
		return host.battle_passive_label
	set(value):
		host.battle_passive_label = value

var battle_message_panel:
	get:
		return host.battle_message_panel
	set(value):
		host.battle_message_panel = value

var battle_log_label:
	get:
		return host.battle_log_label
	set(value):
		host.battle_log_label = value

var battle_message_expand_button:
	get:
		return host.battle_message_expand_button
	set(value):
		host.battle_message_expand_button = value

var battle_message_clear_button:
	get:
		return host.battle_message_clear_button
	set(value):
		host.battle_message_clear_button = value

var battle_command_buttons:
	get:
		return host.battle_command_buttons
	set(value):
		host.battle_command_buttons = value

var stop_button:
	get:
		return host.stop_button
	set(value):
		host.stop_button = value

var ring_button:
	get:
		return host.ring_button
	set(value):
		host.ring_button = value

var quick_slot_buttons:
	get:
		return host.quick_slot_buttons
	set(value):
		host.quick_slot_buttons = value

var player_status_menu_button:
	get:
		return host.player_status_menu_button
	set(value):
		host.player_status_menu_button = value

var bag_menu_button:
	get:
		return host.bag_menu_button
	set(value):
		host.bag_menu_button = value

var equipment_menu_button:
	get:
		return host.equipment_menu_button
	set(value):
		host.equipment_menu_button = value

var pet_menu_button:
	get:
		return host.pet_menu_button
	set(value):
		host.pet_menu_button = value

var codex_menu_button:
	get:
		return host.codex_menu_button
	set(value):
		host.codex_menu_button = value

var quest_menu_button:
	get:
		return host.quest_menu_button
	set(value):
		host.quest_menu_button = value

var map_menu_button:
	get:
		return host.map_menu_button
	set(value):
		host.map_menu_button = value

var chat_menu_button:
	get:
		return host.chat_menu_button
	set(value):
		host.chat_menu_button = value

var party_menu_button:
	get:
		return host.party_menu_button
	set(value):
		host.party_menu_button = value

var family_menu_button:
	get:
		return host.family_menu_button
	set(value):
		host.family_menu_button = value

var mailbox_menu_button:
	get:
		return host.mailbox_menu_button
	set(value):
		host.mailbox_menu_button = value

var training_partner_menu_button:
	get:
		return host.training_partner_menu_button
	set(value):
		host.training_partner_menu_button = value

var auto_settings_menu_button:
	get:
		return host.auto_settings_menu_button
	set(value):
		host.auto_settings_menu_button = value

var account_menu_button:
	get:
		return host.account_menu_button
	set(value):
		host.account_menu_button = value

var qa_menu_button:
	get:
		return host.qa_menu_button
	set(value):
		host.qa_menu_button = value

var auth_panel:
	get:
		return host.auth_panel
	set(value):
		host.auth_panel = value

var auth_title_label:
	get:
		return host.auth_title_label
	set(value):
		host.auth_title_label = value

var auth_message_label:
	get:
		return host.auth_message_label
	set(value):
		host.auth_message_label = value

var auth_version_label:
	get:
		return host.auth_version_label
	set(value):
		host.auth_version_label = value

var auth_username_input:
	get:
		return host.auth_username_input
	set(value):
		host.auth_username_input = value

var auth_password_input:
	get:
		return host.auth_password_input
	set(value):
		host.auth_password_input = value

var auth_display_name_input:
	get:
		return host.auth_display_name_input
	set(value):
		host.auth_display_name_input = value

var auth_source_option:
	get:
		return host.auth_source_option
	set(value):
		host.auth_source_option = value

var auth_server_url_input:
	get:
		return host.auth_server_url_input
	set(value):
		host.auth_server_url_input = value

var auth_remember_check:
	get:
		return host.auth_remember_check
	set(value):
		host.auth_remember_check = value

var auth_login_tab_button:
	get:
		return host.auth_login_tab_button
	set(value):
		host.auth_login_tab_button = value

var auth_register_tab_button:
	get:
		return host.auth_register_tab_button
	set(value):
		host.auth_register_tab_button = value

var auth_submit_button:
	get:
		return host.auth_submit_button
	set(value):
		host.auth_submit_button = value

var auth_http_request:
	get:
		return host.auth_http_request
	set(value):
		host.auth_http_request = value

var profile_sync_http_request:
	get:
		return host.profile_sync_http_request
	set(value):
		host.profile_sync_http_request = value

var server_sync_coordinator:
	get:
		return host.server_sync_coordinator
	set(value):
		host.server_sync_coordinator = value

var account_panel:
	get:
		return host.account_panel
	set(value):
		host.account_panel = value

var account_info_label:
	get:
		return host.account_info_label
	set(value):
		host.account_info_label = value

var account_switch_button:
	get:
		return host.account_switch_button
	set(value):
		host.account_switch_button = value

var account_close_button:
	get:
		return host.account_close_button
	set(value):
		host.account_close_button = value

var backpack_panel:
	get:
		return host.backpack_panel
	set(value):
		host.backpack_panel = value

var backpack_grid:
	get:
		return host.backpack_grid
	set(value):
		host.backpack_grid = value

var backpack_detail_label:
	get:
		return host.backpack_detail_label
	set(value):
		host.backpack_detail_label = value

var backpack_use_button:
	get:
		return host.backpack_use_button
	set(value):
		host.backpack_use_button = value

var backpack_quick_bind_row:
	get:
		return host.backpack_quick_bind_row
	set(value):
		host.backpack_quick_bind_row = value

var backpack_quick_bind_buttons:
	get:
		return host.backpack_quick_bind_buttons
	set(value):
		host.backpack_quick_bind_buttons = value

var backpack_target_scroll:
	get:
		return host.backpack_target_scroll
	set(value):
		host.backpack_target_scroll = value

var backpack_target_container:
	get:
		return host.backpack_target_container
	set(value):
		host.backpack_target_container = value

var backpack_close_button:
	get:
		return host.backpack_close_button
	set(value):
		host.backpack_close_button = value

var backpack_equip_button:
	get:
		return host.backpack_equip_button
	set(value):
		host.backpack_equip_button = value

var backpack_slot_buttons:
	get:
		return host.backpack_slot_buttons
	set(value):
		host.backpack_slot_buttons = value

var backpack_filter_buttons:
	get:
		return host.backpack_filter_buttons
	set(value):
		host.backpack_filter_buttons = value

var backpack_selected_slot_index:
	get:
		return host.backpack_selected_slot_index
	set(value):
		host.backpack_selected_slot_index = value

var backpack_filter:
	get:
		return host.backpack_filter
	set(value):
		host.backpack_filter = value

var backpack_pending_use_item_id:
	get:
		return host.backpack_pending_use_item_id
	set(value):
		host.backpack_pending_use_item_id = value

var player_status_panel:
	get:
		return host.player_status_panel
	set(value):
		host.player_status_panel = value

var player_status_detail_label:
	get:
		return host.player_status_detail_label
	set(value):
		host.player_status_detail_label = value

var player_status_points_label:
	get:
		return host.player_status_points_label
	set(value):
		host.player_status_points_label = value

var player_status_stat_point_buttons:
	get:
		return host.player_status_stat_point_buttons
	set(value):
		host.player_status_stat_point_buttons = value

var player_status_rebirth_button:
	get:
		return host.player_status_rebirth_button
	set(value):
		host.player_status_rebirth_button = value

var player_status_equipment_button:
	get:
		return host.player_status_equipment_button
	set(value):
		host.player_status_equipment_button = value

var player_status_close_button:
	get:
		return host.player_status_close_button
	set(value):
		host.player_status_close_button = value

var player_rebirth_preview_panel:
	get:
		return host.player_rebirth_preview_panel
	set(value):
		host.player_rebirth_preview_panel = value

var player_rebirth_preview_label:
	get:
		return host.player_rebirth_preview_label
	set(value):
		host.player_rebirth_preview_label = value

var player_rebirth_execute_button:
	get:
		return host.player_rebirth_execute_button
	set(value):
		host.player_rebirth_execute_button = value

var player_rebirth_preview_close_button:
	get:
		return host.player_rebirth_preview_close_button
	set(value):
		host.player_rebirth_preview_close_button = value

var player_rebirth_confirm_pending:
	get:
		return host.player_rebirth_confirm_pending
	set(value):
		host.player_rebirth_confirm_pending = value

var player_rebirth_request_pending:
	get:
		return host.player_rebirth_request_pending
	set(value):
		host.player_rebirth_request_pending = value

var quest_action_request_pending:
	get:
		return host.quest_action_request_pending
	set(value):
		host.quest_action_request_pending = value

var server_quest_record_event_queue:
	get:
		return host.server_quest_record_event_queue
	set(value):
		host.server_quest_record_event_queue = value

var server_quest_record_event_queue_running:
	get:
		return host.server_quest_record_event_queue_running
	set(value):
		host.server_quest_record_event_queue_running = value

var profile_action_request_pending:
	get:
		return host.profile_action_request_pending
	set(value):
		host.profile_action_request_pending = value

var equipment_panel:
	get:
		return host.equipment_panel
	set(value):
		host.equipment_panel = value

var equipment_grid:
	get:
		return host.equipment_grid
	set(value):
		host.equipment_grid = value

var equipment_stats_label:
	get:
		return host.equipment_stats_label
	set(value):
		host.equipment_stats_label = value

var equipment_detail_label:
	get:
		return host.equipment_detail_label
	set(value):
		host.equipment_detail_label = value

var equipment_unequip_button:
	get:
		return host.equipment_unequip_button
	set(value):
		host.equipment_unequip_button = value

var equipment_enhance_button:
	get:
		return host.equipment_enhance_button
	set(value):
		host.equipment_enhance_button = value

var equipment_synthesis_open_button:
	get:
		return host.equipment_synthesis_open_button
	set(value):
		host.equipment_synthesis_open_button = value

var equipment_close_button:
	get:
		return host.equipment_close_button
	set(value):
		host.equipment_close_button = value

var equipment_slot_buttons:
	get:
		return host.equipment_slot_buttons
	set(value):
		host.equipment_slot_buttons = value

var equipment_selected_slot_id:
	get:
		return host.equipment_selected_slot_id
	set(value):
		host.equipment_selected_slot_id = value

var equipment_action_request_pending:
	get:
		return host.equipment_action_request_pending
	set(value):
		host.equipment_action_request_pending = value

var equipment_synthesis_panel:
	get:
		return host.equipment_synthesis_panel
	set(value):
		host.equipment_synthesis_panel = value

var equipment_synthesis_list_container:
	get:
		return host.equipment_synthesis_list_container
	set(value):
		host.equipment_synthesis_list_container = value

var equipment_synthesis_detail_label:
	get:
		return host.equipment_synthesis_detail_label
	set(value):
		host.equipment_synthesis_detail_label = value

var equipment_synthesis_action_button:
	get:
		return host.equipment_synthesis_action_button
	set(value):
		host.equipment_synthesis_action_button = value

var equipment_synthesis_back_button:
	get:
		return host.equipment_synthesis_back_button
	set(value):
		host.equipment_synthesis_back_button = value

var equipment_synthesis_close_button:
	get:
		return host.equipment_synthesis_close_button
	set(value):
		host.equipment_synthesis_close_button = value

var equipment_synthesis_recipe_buttons:
	get:
		return host.equipment_synthesis_recipe_buttons
	set(value):
		host.equipment_synthesis_recipe_buttons = value

var equipment_synthesis_selected_recipe_id:
	get:
		return host.equipment_synthesis_selected_recipe_id
	set(value):
		host.equipment_synthesis_selected_recipe_id = value

var shop_panel:
	get:
		return host.shop_panel
	set(value):
		host.shop_panel = value

var shop_title_label:
	get:
		return host.shop_title_label
	set(value):
		host.shop_title_label = value

var shop_coin_label:
	get:
		return host.shop_coin_label
	set(value):
		host.shop_coin_label = value

var shop_buy_button:
	get:
		return host.shop_buy_button
	set(value):
		host.shop_buy_button = value

var shop_sell_button:
	get:
		return host.shop_sell_button
	set(value):
		host.shop_sell_button = value

var shop_list_container:
	get:
		return host.shop_list_container
	set(value):
		host.shop_list_container = value

var shop_detail_label:
	get:
		return host.shop_detail_label
	set(value):
		host.shop_detail_label = value

var shop_quantity_minus_button:
	get:
		return host.shop_quantity_minus_button
	set(value):
		host.shop_quantity_minus_button = value

var shop_quantity_spinbox:
	get:
		return host.shop_quantity_spinbox
	set(value):
		host.shop_quantity_spinbox = value

var shop_quantity_plus_button:
	get:
		return host.shop_quantity_plus_button
	set(value):
		host.shop_quantity_plus_button = value

var shop_quantity_max_button:
	get:
		return host.shop_quantity_max_button
	set(value):
		host.shop_quantity_max_button = value

var shop_equip_after_buy_button:
	get:
		return host.shop_equip_after_buy_button
	set(value):
		host.shop_equip_after_buy_button = value

var shop_action_button:
	get:
		return host.shop_action_button
	set(value):
		host.shop_action_button = value

var shop_repair_button:
	get:
		return host.shop_repair_button
	set(value):
		host.shop_repair_button = value

var shop_close_button:
	get:
		return host.shop_close_button
	set(value):
		host.shop_close_button = value

var shop_item_buttons:
	get:
		return host.shop_item_buttons
	set(value):
		host.shop_item_buttons = value

var shop_active_id:
	get:
		return host.shop_active_id
	set(value):
		host.shop_active_id = value

var shop_mode:
	get:
		return host.shop_mode
	set(value):
		host.shop_mode = value

var shop_selected_item_id:
	get:
		return host.shop_selected_item_id
	set(value):
		host.shop_selected_item_id = value

var shop_quantity:
	get:
		return host.shop_quantity
	set(value):
		host.shop_quantity = value

var shop_equip_after_buy:
	get:
		return host.shop_equip_after_buy
	set(value):
		host.shop_equip_after_buy = value

var shop_action_request_pending:
	get:
		return host.shop_action_request_pending
	set(value):
		host.shop_action_request_pending = value

var shop_cached_backpack_slots:
	get:
		return host.shop_cached_backpack_slots
	set(value):
		host.shop_cached_backpack_slots = value

var shop_cached_backpack_counts:
	get:
		return host.shop_cached_backpack_counts
	set(value):
		host.shop_cached_backpack_counts = value

var shop_detail_text_cache:
	get:
		return host.shop_detail_text_cache
	set(value):
		host.shop_detail_text_cache = value

var shop_equip_check_cache:
	get:
		return host.shop_equip_check_cache
	set(value):
		host.shop_equip_check_cache = value

var shop_quantity_max_cache:
	get:
		return host.shop_quantity_max_cache
	set(value):
		host.shop_quantity_max_cache = value

var shop_detail_update_queued:
	get:
		return host.shop_detail_update_queued
	set(value):
		host.shop_detail_update_queued = value

var shop_pending_detail_bbcode_enabled:
	get:
		return host.shop_pending_detail_bbcode_enabled
	set(value):
		host.shop_pending_detail_bbcode_enabled = value

var shop_pending_detail_item_id:
	get:
		return host.shop_pending_detail_item_id
	set(value):
		host.shop_pending_detail_item_id = value

var shop_pending_detail_count:
	get:
		return host.shop_pending_detail_count
	set(value):
		host.shop_pending_detail_count = value

var pet_panel:
	get:
		return host.pet_panel
	set(value):
		host.pet_panel = value

var pet_filter_option:
	get:
		return host.pet_filter_option
	set(value):
		host.pet_filter_option = value

var pet_sort_option:
	get:
		return host.pet_sort_option
	set(value):
		host.pet_sort_option = value

var pet_sort_direction_button:
	get:
		return host.pet_sort_direction_button
	set(value):
		host.pet_sort_direction_button = value

var pet_list_container:
	get:
		return host.pet_list_container
	set(value):
		host.pet_list_container = value

var pet_detail_scroll:
	get:
		return host.pet_detail_scroll
	set(value):
		host.pet_detail_scroll = value

var pet_detail_label:
	get:
		return host.pet_detail_label
	set(value):
		host.pet_detail_label = value

var pet_detail_instance_button:
	get:
		return host.pet_detail_instance_button
	set(value):
		host.pet_detail_instance_button = value

var pet_detail_codex_button:
	get:
		return host.pet_detail_codex_button
	set(value):
		host.pet_detail_codex_button = value

var pet_detail_growth_button:
	get:
		return host.pet_detail_growth_button
	set(value):
		host.pet_detail_growth_button = value

var pet_growth_stage_row:
	get:
		return host.pet_growth_stage_row
	set(value):
		host.pet_growth_stage_row = value

var pet_growth_stage_buttons:
	get:
		return host.pet_growth_stage_buttons
	set(value):
		host.pet_growth_stage_buttons = value

var pet_growth_stage:
	get:
		return host.pet_growth_stage
	set(value):
		host.pet_growth_stage = value

var pet_growth_table_grid:
	get:
		return host.pet_growth_table_grid
	set(value):
		host.pet_growth_table_grid = value

var pet_growth_radar:
	get:
		return host.pet_growth_radar
	set(value):
		host.pet_growth_radar = value

var pet_state_cycle_button:
	get:
		return host.pet_state_cycle_button
	set(value):
		host.pet_state_cycle_button = value

var pet_stable_button:
	get:
		return host.pet_stable_button
	set(value):
		host.pet_stable_button = value

var pet_party_up_button:
	get:
		return host.pet_party_up_button
	set(value):
		host.pet_party_up_button = value

var pet_party_down_button:
	get:
		return host.pet_party_down_button
	set(value):
		host.pet_party_down_button = value

var pet_lock_button:
	get:
		return host.pet_lock_button
	set(value):
		host.pet_lock_button = value

var pet_batch_store_button:
	get:
		return host.pet_batch_store_button
	set(value):
		host.pet_batch_store_button = value

var pet_batch_standby_button:
	get:
		return host.pet_batch_standby_button
	set(value):
		host.pet_batch_standby_button = value

var pet_batch_rest_button:
	get:
		return host.pet_batch_rest_button
	set(value):
		host.pet_batch_rest_button = value

var pet_rename_button:
	get:
		return host.pet_rename_button
	set(value):
		host.pet_rename_button = value

var pet_cultivation_button:
	get:
		return host.pet_cultivation_button
	set(value):
		host.pet_cultivation_button = value

var pet_drop_button:
	get:
		return host.pet_drop_button
	set(value):
		host.pet_drop_button = value

var pet_rename_panel:
	get:
		return host.pet_rename_panel
	set(value):
		host.pet_rename_panel = value

var pet_rename_title_label:
	get:
		return host.pet_rename_title_label
	set(value):
		host.pet_rename_title_label = value

var pet_rename_input:
	get:
		return host.pet_rename_input
	set(value):
		host.pet_rename_input = value

var pet_rename_confirm_button:
	get:
		return host.pet_rename_confirm_button
	set(value):
		host.pet_rename_confirm_button = value

var pet_rename_cancel_button:
	get:
		return host.pet_rename_cancel_button
	set(value):
		host.pet_rename_cancel_button = value

var pet_cultivation_panel:
	get:
		return host.pet_cultivation_panel
	set(value):
		host.pet_cultivation_panel = value

var pet_cultivation_title_label:
	get:
		return host.pet_cultivation_title_label
	set(value):
		host.pet_cultivation_title_label = value

var pet_cultivation_preview_label:
	get:
		return host.pet_cultivation_preview_label
	set(value):
		host.pet_cultivation_preview_label = value

var pet_cultivation_confirm_button:
	get:
		return host.pet_cultivation_confirm_button
	set(value):
		host.pet_cultivation_confirm_button = value

var pet_cultivation_close_button:
	get:
		return host.pet_cultivation_close_button
	set(value):
		host.pet_cultivation_close_button = value

var pet_close_button:
	get:
		return host.pet_close_button
	set(value):
		host.pet_close_button = value

var pet_skill_button:
	get:
		return host.pet_skill_button
	set(value):
		host.pet_skill_button = value

var pet_skill_panel:
	get:
		return host.pet_skill_panel
	set(value):
		host.pet_skill_panel = value

var pet_skill_title_label:
	get:
		return host.pet_skill_title_label
	set(value):
		host.pet_skill_title_label = value

var pet_skill_pet_option:
	get:
		return host.pet_skill_pet_option
	set(value):
		host.pet_skill_pet_option = value

var pet_skill_slot_grid:
	get:
		return host.pet_skill_slot_grid
	set(value):
		host.pet_skill_slot_grid = value

var pet_skill_detail_label:
	get:
		return host.pet_skill_detail_label
	set(value):
		host.pet_skill_detail_label = value

var pet_skill_move_up_button:
	get:
		return host.pet_skill_move_up_button
	set(value):
		host.pet_skill_move_up_button = value

var pet_skill_move_down_button:
	get:
		return host.pet_skill_move_down_button
	set(value):
		host.pet_skill_move_down_button = value

var pet_skill_forget_button:
	get:
		return host.pet_skill_forget_button
	set(value):
		host.pet_skill_forget_button = value

var pet_skill_learn_option:
	get:
		return host.pet_skill_learn_option
	set(value):
		host.pet_skill_learn_option = value

var pet_skill_learn_button:
	get:
		return host.pet_skill_learn_button
	set(value):
		host.pet_skill_learn_button = value

var pet_skill_close_button:
	get:
		return host.pet_skill_close_button
	set(value):
		host.pet_skill_close_button = value

var pet_skill_slot_buttons:
	get:
		return host.pet_skill_slot_buttons
	set(value):
		host.pet_skill_slot_buttons = value

var pet_skill_selected_slot:
	get:
		return host.pet_skill_selected_slot
	set(value):
		host.pet_skill_selected_slot = value

var pet_skill_training_mode:
	get:
		return host.pet_skill_training_mode
	set(value):
		host.pet_skill_training_mode = value

var pet_skill_trainer_id:
	get:
		return host.pet_skill_trainer_id
	set(value):
		host.pet_skill_trainer_id = value

var pet_selected_instance_id:
	get:
		return host.pet_selected_instance_id
	set(value):
		host.pet_selected_instance_id = value

var pet_detail_mode:
	get:
		return host.pet_detail_mode
	set(value):
		host.pet_detail_mode = value

var pet_filter_mode:
	get:
		return host.pet_filter_mode
	set(value):
		host.pet_filter_mode = value

var pet_sort_mode:
	get:
		return host.pet_sort_mode
	set(value):
		host.pet_sort_mode = value

var pet_sort_descending:
	get:
		return host.pet_sort_descending
	set(value):
		host.pet_sort_descending = value

var pet_clear_confirm_instance_id:
	get:
		return host.pet_clear_confirm_instance_id
	set(value):
		host.pet_clear_confirm_instance_id = value

var pet_panel_stable_access_override:
	get:
		return host.pet_panel_stable_access_override
	set(value):
		host.pet_panel_stable_access_override = value

var pet_list_buttons:
	get:
		return host.pet_list_buttons
	set(value):
		host.pet_list_buttons = value

var codex_panel:
	get:
		return host.codex_panel
	set(value):
		host.codex_panel = value

var codex_list_container:
	get:
		return host.codex_list_container
	set(value):
		host.codex_list_container = value

var codex_detail_label:
	get:
		return host.codex_detail_label
	set(value):
		host.codex_detail_label = value

var codex_close_button:
	get:
		return host.codex_close_button
	set(value):
		host.codex_close_button = value

var codex_selected_form_id:
	get:
		return host.codex_selected_form_id
	set(value):
		host.codex_selected_form_id = value

var codex_list_buttons:
	get:
		return host.codex_list_buttons
	set(value):
		host.codex_list_buttons = value

var quest_panel:
	get:
		return host.quest_panel
	set(value):
		host.quest_panel = value

var quest_title_label:
	get:
		return host.quest_title_label
	set(value):
		host.quest_title_label = value

var quest_detail_label:
	get:
		return host.quest_detail_label
	set(value):
		host.quest_detail_label = value

var quest_reward_choice_option:
	get:
		return host.quest_reward_choice_option
	set(value):
		host.quest_reward_choice_option = value

var quest_claim_button:
	get:
		return host.quest_claim_button
	set(value):
		host.quest_claim_button = value

var quest_route_button:
	get:
		return host.quest_route_button
	set(value):
		host.quest_route_button = value

var quest_close_button:
	get:
		return host.quest_close_button
	set(value):
		host.quest_close_button = value

var quest_selected_reward_choice_id:
	get:
		return host.quest_selected_reward_choice_id
	set(value):
		host.quest_selected_reward_choice_id = value

var map_panel:
	get:
		return host.map_panel
	set(value):
		host.map_panel = value

var map_texture_rect:
	get:
		return host.map_texture_rect
	set(value):
		host.map_texture_rect = value

var map_detail_label:
	get:
		return host.map_detail_label
	set(value):
		host.map_detail_label = value

var map_marker_container:
	get:
		return host.map_marker_container
	set(value):
		host.map_marker_container = value

var map_close_button:
	get:
		return host.map_close_button
	set(value):
		host.map_close_button = value

var map_marker_buttons:
	get:
		return host.map_marker_buttons
	set(value):
		host.map_marker_buttons = value

var chat_panel:
	get:
		return host.chat_panel
	set(value):
		host.chat_panel = value

var chat_system_button:
	get:
		return host.chat_system_button
	set(value):
		host.chat_system_button = value

var chat_nearby_button:
	get:
		return host.chat_nearby_button
	set(value):
		host.chat_nearby_button = value

var chat_team_button:
	get:
		return host.chat_team_button
	set(value):
		host.chat_team_button = value

var chat_log_label:
	get:
		return host.chat_log_label
	set(value):
		host.chat_log_label = value

var chat_input:
	get:
		return host.chat_input
	set(value):
		host.chat_input = value

var chat_send_button:
	get:
		return host.chat_send_button
	set(value):
		host.chat_send_button = value

var chat_refresh_button:
	get:
		return host.chat_refresh_button
	set(value):
		host.chat_refresh_button = value

var chat_status_label:
	get:
		return host.chat_status_label
	set(value):
		host.chat_status_label = value

var chat_close_button:
	get:
		return host.chat_close_button
	set(value):
		host.chat_close_button = value

var chat_http_request:
	get:
		return host.chat_http_request
	set(value):
		host.chat_http_request = value

var chat_active_channel:
	get:
		return host.chat_active_channel
	set(value):
		host.chat_active_channel = value

var chat_messages:
	get:
		return host.chat_messages
	set(value):
		host.chat_messages = value

var chat_request_pending:
	get:
		return host.chat_request_pending
	set(value):
		host.chat_request_pending = value

var chat_pending_kind:
	get:
		return host.chat_pending_kind
	set(value):
		host.chat_pending_kind = value

var mailbox_panel:
	get:
		return host.mailbox_panel
	set(value):
		host.mailbox_panel = value

var mailbox_list_container:
	get:
		return host.mailbox_list_container
	set(value):
		host.mailbox_list_container = value

var mailbox_detail_label:
	get:
		return host.mailbox_detail_label
	set(value):
		host.mailbox_detail_label = value

var mailbox_claim_button:
	get:
		return host.mailbox_claim_button
	set(value):
		host.mailbox_claim_button = value

var mailbox_refresh_button:
	get:
		return host.mailbox_refresh_button
	set(value):
		host.mailbox_refresh_button = value

var mailbox_recipient_input:
	get:
		return host.mailbox_recipient_input
	set(value):
		host.mailbox_recipient_input = value

var mailbox_title_input:
	get:
		return host.mailbox_title_input
	set(value):
		host.mailbox_title_input = value

var mailbox_body_input:
	get:
		return host.mailbox_body_input
	set(value):
		host.mailbox_body_input = value

var mailbox_send_button:
	get:
		return host.mailbox_send_button
	set(value):
		host.mailbox_send_button = value

var mailbox_status_label:
	get:
		return host.mailbox_status_label
	set(value):
		host.mailbox_status_label = value

var mailbox_close_button:
	get:
		return host.mailbox_close_button
	set(value):
		host.mailbox_close_button = value

var mailbox_http_request:
	get:
		return host.mailbox_http_request
	set(value):
		host.mailbox_http_request = value

var mailbox_message_buttons:
	get:
		return host.mailbox_message_buttons
	set(value):
		host.mailbox_message_buttons = value

var mailbox_selected_mail_id:
	get:
		return host.mailbox_selected_mail_id
	set(value):
		host.mailbox_selected_mail_id = value

var mailbox_selected_source:
	get:
		return host.mailbox_selected_source
	set(value):
		host.mailbox_selected_source = value

var mailbox_server_messages:
	get:
		return host.mailbox_server_messages
	set(value):
		host.mailbox_server_messages = value

var mailbox_request_pending:
	get:
		return host.mailbox_request_pending
	set(value):
		host.mailbox_request_pending = value

var mailbox_pending_kind:
	get:
		return host.mailbox_pending_kind
	set(value):
		host.mailbox_pending_kind = value

var party_panel:
	get:
		return host.party_panel
	set(value):
		host.party_panel = value

var party_status_label:
	get:
		return host.party_status_label
	set(value):
		host.party_status_label = value

var party_members_container:
	get:
		return host.party_members_container
	set(value):
		host.party_members_container = value

var party_invites_container:
	get:
		return host.party_invites_container
	set(value):
		host.party_invites_container = value

var party_online_container:
	get:
		return host.party_online_container
	set(value):
		host.party_online_container = value

var party_refresh_button:
	get:
		return host.party_refresh_button
	set(value):
		host.party_refresh_button = value

var party_leave_button:
	get:
		return host.party_leave_button
	set(value):
		host.party_leave_button = value

var party_close_button:
	get:
		return host.party_close_button
	set(value):
		host.party_close_button = value

var party_http_request:
	get:
		return host.party_http_request
	set(value):
		host.party_http_request = value

var party_current_state:
	get:
		return host.party_current_state
	set(value):
		host.party_current_state = value

var party_online_players:
	get:
		return host.party_online_players
	set(value):
		host.party_online_players = value

var party_request_pending:
	get:
		return host.party_request_pending
	set(value):
		host.party_request_pending = value

var party_pending_kind:
	get:
		return host.party_pending_kind
	set(value):
		host.party_pending_kind = value

var family_panel:
	get:
		return host.family_panel
	set(value):
		host.family_panel = value

var family_status_label:
	get:
		return host.family_status_label
	set(value):
		host.family_status_label = value

var family_name_input:
	get:
		return host.family_name_input
	set(value):
		host.family_name_input = value

var family_create_button:
	get:
		return host.family_create_button
	set(value):
		host.family_create_button = value

var family_refresh_button:
	get:
		return host.family_refresh_button
	set(value):
		host.family_refresh_button = value

var family_leave_button:
	get:
		return host.family_leave_button
	set(value):
		host.family_leave_button = value

var family_list_container:
	get:
		return host.family_list_container
	set(value):
		host.family_list_container = value

var manor_list_container:
	get:
		return host.manor_list_container
	set(value):
		host.manor_list_container = value

var family_http_request:
	get:
		return host.family_http_request
	set(value):
		host.family_http_request = value

var family_current_state:
	get:
		return host.family_current_state
	set(value):
		host.family_current_state = value

var family_list:
	get:
		return host.family_list
	set(value):
		host.family_list = value

var family_manors:
	get:
		return host.family_manors
	set(value):
		host.family_manors = value

var family_request_pending:
	get:
		return host.family_request_pending
	set(value):
		host.family_request_pending = value

var family_pending_kind:
	get:
		return host.family_pending_kind
	set(value):
		host.family_pending_kind = value

var family_focus_manor_id: String:
	get:
		return host.family_focus_manor_id
	set(value):
		host.family_focus_manor_id = value

var online_position_http_request:
	get:
		return host.online_position_http_request
	set(value):
		host.online_position_http_request = value

var online_position_timer:
	get:
		return host.online_position_timer
	set(value):
		host.online_position_timer = value

var online_position_request_pending:
	get:
		return host.online_position_request_pending
	set(value):
		host.online_position_request_pending = value

var online_position_queued_payload:
	get:
		return host.online_position_queued_payload
	set(value):
		host.online_position_queued_payload = value

var online_position_remote_players:
	get:
		return host.online_position_remote_players
	set(value):
		host.online_position_remote_players = value

var online_position_draw_signature_cache:
	get:
		return host.online_position_draw_signature_cache
	set(value):
		host.online_position_draw_signature_cache = value

var server_event_socket:
	get:
		return host.server_event_socket
	set(value):
		host.server_event_socket = value

var server_event_state:
	get:
		return host.server_event_state
	set(value):
		host.server_event_state = value

var server_event_reconnect_remaining:
	get:
		return host.server_event_reconnect_remaining
	set(value):
		host.server_event_reconnect_remaining = value

var server_event_seen:
	get:
		return host.server_event_seen
	set(value):
		host.server_event_seen = value

var server_event_last_seq:
	get:
		return host.server_event_last_seq
	set(value):
		host.server_event_last_seq = value

var server_battle_state:
	get:
		return host.server_battle_state
	set(value):
		host.server_battle_state = value

var server_party_encounter_request_pending:
	get:
		return host.server_party_encounter_request_pending
	set(value):
		host.server_party_encounter_request_pending = value

var server_battle_waiting_poll_elapsed:
	get:
		return host.server_battle_waiting_poll_elapsed
	set(value):
		host.server_battle_waiting_poll_elapsed = value

var server_battle_room_restore_poll_elapsed:
	get:
		return host.server_battle_room_restore_poll_elapsed
	set(value):
		host.server_battle_room_restore_poll_elapsed = value

var server_battle_state_poll_request_active:
	get:
		return host.server_battle_state_poll_request_active
	set(value):
		host.server_battle_state_poll_request_active = value

var server_battle_coordinator:
	get:
		return host.server_battle_coordinator
	set(value):
		host.server_battle_coordinator = value

var dialog_quest_coordinator:
	get:
		return host.dialog_quest_coordinator
	set(value):
		host.dialog_quest_coordinator = value

var auto_check_coordinator:
	get:
		return host.auto_check_coordinator
	set(value):
		host.auto_check_coordinator = value

var player_action_panel:
	get:
		return host.player_action_panel
	set(value):
		host.player_action_panel = value

var player_action_title_label:
	get:
		return host.player_action_title_label
	set(value):
		host.player_action_title_label = value

var player_action_detail_label:
	get:
		return host.player_action_detail_label
	set(value):
		host.player_action_detail_label = value

var player_action_status_label:
	get:
		return host.player_action_status_label
	set(value):
		host.player_action_status_label = value

var player_action_battle_button:
	get:
		return host.player_action_battle_button
	set(value):
		host.player_action_battle_button = value

var player_action_record_button:
	get:
		return host.player_action_record_button
	set(value):
		host.player_action_record_button = value

var player_action_party_apply_button:
	get:
		return host.player_action_party_apply_button
	set(value):
		host.player_action_party_apply_button = value

var player_action_party_invite_button:
	get:
		return host.player_action_party_invite_button
	set(value):
		host.player_action_party_invite_button = value

var player_action_close_button:
	get:
		return host.player_action_close_button
	set(value):
		host.player_action_close_button = value

var player_action_http_request:
	get:
		return host.player_action_http_request
	set(value):
		host.player_action_http_request = value

var player_action_target:
	get:
		return host.player_action_target
	set(value):
		host.player_action_target = value

var player_action_request_pending:
	get:
		return host.player_action_request_pending
	set(value):
		host.player_action_request_pending = value

var player_action_pending_kind:
	get:
		return host.player_action_pending_kind
	set(value):
		host.player_action_pending_kind = value

var battle_result_panel:
	get:
		return host.battle_result_panel
	set(value):
		host.battle_result_panel = value

var battle_result_title_label:
	get:
		return host.battle_result_title_label
	set(value):
		host.battle_result_title_label = value

var battle_result_detail_label:
	get:
		return host.battle_result_detail_label
	set(value):
		host.battle_result_detail_label = value

var battle_result_close_button:
	get:
		return host.battle_result_close_button
	set(value):
		host.battle_result_close_button = value

var battle_invite_panel:
	get:
		return host.battle_invite_panel
	set(value):
		host.battle_invite_panel = value

var battle_invite_title_label:
	get:
		return host.battle_invite_title_label
	set(value):
		host.battle_invite_title_label = value

var battle_invite_detail_label:
	get:
		return host.battle_invite_detail_label
	set(value):
		host.battle_invite_detail_label = value

var battle_invite_status_label:
	get:
		return host.battle_invite_status_label
	set(value):
		host.battle_invite_status_label = value

var battle_invite_accept_button:
	get:
		return host.battle_invite_accept_button
	set(value):
		host.battle_invite_accept_button = value

var battle_invite_decline_button:
	get:
		return host.battle_invite_decline_button
	set(value):
		host.battle_invite_decline_button = value

var battle_invite_close_button:
	get:
		return host.battle_invite_close_button
	set(value):
		host.battle_invite_close_button = value

var battle_invite_http_request:
	get:
		return host.battle_invite_http_request
	set(value):
		host.battle_invite_http_request = value

var battle_invite_current:
	get:
		return host.battle_invite_current
	set(value):
		host.battle_invite_current = value

var battle_invite_request_pending:
	get:
		return host.battle_invite_request_pending
	set(value):
		host.battle_invite_request_pending = value

var battle_invite_pending_kind:
	get:
		return host.battle_invite_pending_kind
	set(value):
		host.battle_invite_pending_kind = value

var server_battle_command_request_active:
	get:
		return host.server_battle_command_request_active
	set(value):
		host.server_battle_command_request_active = value

var server_battle_last_playback_turn_key:
	get:
		return host.server_battle_last_playback_turn_key
	set(value):
		host.server_battle_last_playback_turn_key = value

var server_battle_pending_closed_room:
	get:
		return host.server_battle_pending_closed_room
	set(value):
		host.server_battle_pending_closed_room = value

var training_partner_panel:
	get:
		return host.training_partner_panel
	set(value):
		host.training_partner_panel = value

var training_partner_scroll:
	get:
		return host.training_partner_scroll
	set(value):
		host.training_partner_scroll = value

var training_partner_label:
	get:
		return host.training_partner_label
	set(value):
		host.training_partner_label = value

var training_partner_add_button:
	get:
		return host.training_partner_add_button
	set(value):
		host.training_partner_add_button = value

var training_partner_remove_button:
	get:
		return host.training_partner_remove_button
	set(value):
		host.training_partner_remove_button = value

var training_partner_fill_button:
	get:
		return host.training_partner_fill_button
	set(value):
		host.training_partner_fill_button = value

var training_partner_clear_button:
	get:
		return host.training_partner_clear_button
	set(value):
		host.training_partner_clear_button = value

var training_partner_close_button:
	get:
		return host.training_partner_close_button
	set(value):
		host.training_partner_close_button = value

var auto_settings_panel:
	get:
		return host.auto_settings_panel
	set(value):
		host.auto_settings_panel = value

var auto_settings_battle_tab_button:
	get:
		return host.auto_settings_battle_tab_button
	set(value):
		host.auto_settings_battle_tab_button = value

var auto_settings_hang_tab_button:
	get:
		return host.auto_settings_hang_tab_button
	set(value):
		host.auto_settings_hang_tab_button = value

var auto_settings_capture_tab_button:
	get:
		return host.auto_settings_capture_tab_button
	set(value):
		host.auto_settings_capture_tab_button = value

var auto_settings_content:
	get:
		return host.auto_settings_content
	set(value):
		host.auto_settings_content = value

var auto_settings_close_button:
	get:
		return host.auto_settings_close_button
	set(value):
		host.auto_settings_close_button = value

var auto_settings_controls:
	get:
		return host.auto_settings_controls
	set(value):
		host.auto_settings_controls = value

var auto_settings_active_tab:
	get:
		return host.auto_settings_active_tab
	set(value):
		host.auto_settings_active_tab = value

var qa_panel:
	get:
		return host.qa_panel
	set(value):
		host.qa_panel = value

var qa_entry_scroll:
	get:
		return host.qa_entry_scroll
	set(value):
		host.qa_entry_scroll = value

var qa_entry_container:
	get:
		return host.qa_entry_container
	set(value):
		host.qa_entry_container = value

var qa_detail_scroll:
	get:
		return host.qa_detail_scroll
	set(value):
		host.qa_detail_scroll = value

var qa_detail_label:
	get:
		return host.qa_detail_label
	set(value):
		host.qa_detail_label = value

var qa_close_button:
	get:
		return host.qa_close_button
	set(value):
		host.qa_close_button = value

var qa_entry_buttons:
	get:
		return host.qa_entry_buttons
	set(value):
		host.qa_entry_buttons = value

var qa_pet_species_option:
	get:
		return host.qa_pet_species_option
	set(value):
		host.qa_pet_species_option = value

var qa_pet_target_option:
	get:
		return host.qa_pet_target_option
	set(value):
		host.qa_pet_target_option = value

var qa_pet_grant_button:
	get:
		return host.qa_pet_grant_button
	set(value):
		host.qa_pet_grant_button = value

var qa_pet_level_up_button:
	get:
		return host.qa_pet_level_up_button
	set(value):
		host.qa_pet_level_up_button = value

var qa_pet_growth_profile_id:
	get:
		return host.qa_pet_growth_profile_id
	set(value):
		host.qa_pet_growth_profile_id = value

var qa_pet_level_instance_id:
	get:
		return host.qa_pet_level_instance_id
	set(value):
		host.qa_pet_level_instance_id = value

var numeric_workbench_panel:
	get:
		return host.numeric_workbench_panel
	set(value):
		host.numeric_workbench_panel = value

var numeric_workbench_profile_option:
	get:
		return host.numeric_workbench_profile_option
	set(value):
		host.numeric_workbench_profile_option = value

var numeric_workbench_sample_option:
	get:
		return host.numeric_workbench_sample_option
	set(value):
		host.numeric_workbench_sample_option = value

var numeric_workbench_level_option:
	get:
		return host.numeric_workbench_level_option
	set(value):
		host.numeric_workbench_level_option = value

var numeric_workbench_stage_option:
	get:
		return host.numeric_workbench_stage_option
	set(value):
		host.numeric_workbench_stage_option = value

var numeric_workbench_stone_option:
	get:
		return host.numeric_workbench_stone_option
	set(value):
		host.numeric_workbench_stone_option = value

var numeric_workbench_growth_button:
	get:
		return host.numeric_workbench_growth_button
	set(value):
		host.numeric_workbench_growth_button = value

var numeric_workbench_mm_button:
	get:
		return host.numeric_workbench_mm_button
	set(value):
		host.numeric_workbench_mm_button = value

var numeric_workbench_compare_button:
	get:
		return host.numeric_workbench_compare_button
	set(value):
		host.numeric_workbench_compare_button = value

var numeric_workbench_battle_button:
	get:
		return host.numeric_workbench_battle_button
	set(value):
		host.numeric_workbench_battle_button = value

var numeric_workbench_output_button:
	get:
		return host.numeric_workbench_output_button
	set(value):
		host.numeric_workbench_output_button = value

var numeric_workbench_close_button:
	get:
		return host.numeric_workbench_close_button
	set(value):
		host.numeric_workbench_close_button = value

var numeric_workbench_result_label:
	get:
		return host.numeric_workbench_result_label
	set(value):
		host.numeric_workbench_result_label = value

var numeric_workbench_profile_id:
	get:
		return host.numeric_workbench_profile_id
	set(value):
		host.numeric_workbench_profile_id = value

var numeric_workbench_stone_plan_id:
	get:
		return host.numeric_workbench_stone_plan_id
	set(value):
		host.numeric_workbench_stone_plan_id = value

var game_camera:
	get:
		return host.game_camera
	set(value):
		host.game_camera = value

var auto_movement_check:
	get:
		return host.auto_movement_check
	set(value):
		host.auto_movement_check = value

var movement_perf_check:
	get:
		return host.movement_perf_check
	set(value):
		host.movement_perf_check = value

var movement_spam_click_check:
	get:
		return host.movement_spam_click_check
	set(value):
		host.movement_spam_click_check = value

var shop_select_perf_check:
	get:
		return host.shop_select_perf_check
	set(value):
		host.shop_select_perf_check = value

var auto_mouse_click_check:
	get:
		return host.auto_mouse_click_check
	set(value):
		host.auto_mouse_click_check = value

var auto_pathfinding_check:
	get:
		return host.auto_pathfinding_check
	set(value):
		host.auto_pathfinding_check = value

var auto_eight_direction_check:
	get:
		return host.auto_eight_direction_check
	set(value):
		host.auto_eight_direction_check = value

var auto_direct_line_check:
	get:
		return host.auto_direct_line_check
	set(value):
		host.auto_direct_line_check = value

var auto_facing_check:
	get:
		return host.auto_facing_check
	set(value):
		host.auto_facing_check = value

var auto_camera_check:
	get:
		return host.auto_camera_check
	set(value):
		host.auto_camera_check = value

var auto_camera_click_check:
	get:
		return host.auto_camera_click_check
	set(value):
		host.auto_camera_click_check = value

var auto_animation_state_check:
	get:
		return host.auto_animation_state_check
	set(value):
		host.auto_animation_state_check = value

var auto_pet_follow_check:
	get:
		return host.auto_pet_follow_check
	set(value):
		host.auto_pet_follow_check = value

var auto_npc_interaction_check:
	get:
		return host.auto_npc_interaction_check
	set(value):
		host.auto_npc_interaction_check = value

var auto_npc_collision_check:
	get:
		return host.auto_npc_collision_check
	set(value):
		host.auto_npc_collision_check = value

var auto_facility_dialog_options_check:
	get:
		return host.auto_facility_dialog_options_check
	set(value):
		host.auto_facility_dialog_options_check = value

var auto_npc_quest_marker_check:
	get:
		return host.auto_npc_quest_marker_check
	set(value):
		host.auto_npc_quest_marker_check = value

var auto_stable_facility_check:
	get:
		return host.auto_stable_facility_check
	set(value):
		host.auto_stable_facility_check = value

var auto_map_transfer_check:
	get:
		return host.auto_map_transfer_check
	set(value):
		host.auto_map_transfer_check = value

var auto_encounter_check:
	get:
		return host.auto_encounter_check
	set(value):
		host.auto_encounter_check = value

var auto_battle_check:
	get:
		return host.auto_battle_check
	set(value):
		host.auto_battle_check = value

var auto_battle_auto_attack_check:
	get:
		return host.auto_battle_auto_attack_check
	set(value):
		host.auto_battle_auto_attack_check = value

var auto_battle_auto_10v10_check:
	get:
		return host.auto_battle_auto_10v10_check
	set(value):
		host.auto_battle_auto_10v10_check = value

var auto_battle_settings_check:
	get:
		return host.auto_battle_settings_check
	set(value):
		host.auto_battle_settings_check = value

var auto_capture_settings_check:
	get:
		return host.auto_capture_settings_check
	set(value):
		host.auto_capture_settings_check = value

var auto_training_partner_check:
	get:
		return host.auto_training_partner_check
	set(value):
		host.auto_training_partner_check = value

var auto_hang_settings_check:
	get:
		return host.auto_hang_settings_check
	set(value):
		host.auto_hang_settings_check = value

var auto_gm_10v10_map_check:
	get:
		return host.auto_gm_10v10_map_check
	set(value):
		host.auto_gm_10v10_map_check = value

var auto_level_grass_trial_map_check:
	get:
		return host.auto_level_grass_trial_map_check
	set(value):
		host.auto_level_grass_trial_map_check = value

var auto_battle_formation_check:
	get:
		return host.auto_battle_formation_check
	set(value):
		host.auto_battle_formation_check = value

var auto_battle_target_check:
	get:
		return host.auto_battle_target_check
	set(value):
		host.auto_battle_target_check = value

var auto_battle_round_check:
	get:
		return host.auto_battle_round_check
	set(value):
		host.auto_battle_round_check = value

var auto_battle_command_timer_check:
	get:
		return host.auto_battle_command_timer_check
	set(value):
		host.auto_battle_command_timer_check = value

var auto_battle_speed_check:
	get:
		return host.auto_battle_speed_check
	set(value):
		host.auto_battle_speed_check = value

var auto_battle_feedback_check:
	get:
		return host.auto_battle_feedback_check
	set(value):
		host.auto_battle_feedback_check = value

var auto_battle_combo_check:
	get:
		return host.auto_battle_combo_check
	set(value):
		host.auto_battle_combo_check = value

var auto_battle_capture_check:
	get:
		return host.auto_battle_capture_check
	set(value):
		host.auto_battle_capture_check = value

var auto_capture_tools_check:
	get:
		return host.auto_capture_tools_check
	set(value):
		host.auto_capture_tools_check = value

var auto_battle_spirit_check:
	get:
		return host.auto_battle_spirit_check
	set(value):
		host.auto_battle_spirit_check = value

var auto_battle_spirit_source_check:
	get:
		return host.auto_battle_spirit_source_check
	set(value):
		host.auto_battle_spirit_source_check = value

var auto_battle_pet_command_check:
	get:
		return host.auto_battle_pet_command_check
	set(value):
		host.auto_battle_pet_command_check = value

var auto_battle_pet_target_check:
	get:
		return host.auto_battle_pet_target_check
	set(value):
		host.auto_battle_pet_target_check = value

var auto_battle_spirit_four_check:
	get:
		return host.auto_battle_spirit_four_check
	set(value):
		host.auto_battle_spirit_four_check = value

var auto_battle_action_catalog_check:
	get:
		return host.auto_battle_action_catalog_check
	set(value):
		host.auto_battle_action_catalog_check = value

var auto_battle_action_system_check:
	get:
		return host.auto_battle_action_system_check
	set(value):
		host.auto_battle_action_system_check = value

var auto_battle_item_check:
	get:
		return host.auto_battle_item_check
	set(value):
		host.auto_battle_item_check = value

var auto_battle_item_count_check:
	get:
		return host.auto_battle_item_count_check
	set(value):
		host.auto_battle_item_count_check = value

var auto_battle_stat_formula_check:
	get:
		return host.auto_battle_stat_formula_check
	set(value):
		host.auto_battle_stat_formula_check = value

var auto_battle_defense_check:
	get:
		return host.auto_battle_defense_check
	set(value):
		host.auto_battle_defense_check = value

var auto_battle_launch_check:
	get:
		return host.auto_battle_launch_check
	set(value):
		host.auto_battle_launch_check = value

var auto_battle_melee_motion_check:
	get:
		return host.auto_battle_melee_motion_check
	set(value):
		host.auto_battle_melee_motion_check = value

var auto_battle_combo_motion_check:
	get:
		return host.auto_battle_combo_motion_check
	set(value):
		host.auto_battle_combo_motion_check = value

var auto_battle_switch_pet_check:
	get:
		return host.auto_battle_switch_pet_check
	set(value):
		host.auto_battle_switch_pet_check = value

var auto_battle_retarget_visual_check:
	get:
		return host.auto_battle_retarget_visual_check
	set(value):
		host.auto_battle_retarget_visual_check = value

var auto_battle_visual_timing_check:
	get:
		return host.auto_battle_visual_timing_check
	set(value):
		host.auto_battle_visual_timing_check = value

var auto_battle_label_check:
	get:
		return host.auto_battle_label_check
	set(value):
		host.auto_battle_label_check = value

var auto_battle_event_ledger_check:
	get:
		return host.auto_battle_event_ledger_check
	set(value):
		host.auto_battle_event_ledger_check = value

var auto_battle_status_check:
	get:
		return host.auto_battle_status_check
	set(value):
		host.auto_battle_status_check = value

var auto_battle_status_skill_check:
	get:
		return host.auto_battle_status_skill_check
	set(value):
		host.auto_battle_status_skill_check = value

var auto_battle_status_hit_check:
	get:
		return host.auto_battle_status_hit_check
	set(value):
		host.auto_battle_status_hit_check = value

var auto_battle_status_rule_check:
	get:
		return host.auto_battle_status_rule_check
	set(value):
		host.auto_battle_status_rule_check = value

var auto_battle_passive_hover_check:
	get:
		return host.auto_battle_passive_hover_check
	set(value):
		host.auto_battle_passive_hover_check = value

var auto_battle_reaction_check:
	get:
		return host.auto_battle_reaction_check
	set(value):
		host.auto_battle_reaction_check = value

var auto_battle_result_check:
	get:
		return host.auto_battle_result_check
	set(value):
		host.auto_battle_result_check = value

var auto_battle_knockaway_result_check:
	get:
		return host.auto_battle_knockaway_result_check
	set(value):
		host.auto_battle_knockaway_result_check = value

var auto_pet_management_check:
	get:
		return host.auto_pet_management_check
	set(value):
		host.auto_pet_management_check = value

var auto_pet_growth_check:
	get:
		return host.auto_pet_growth_check
	set(value):
		host.auto_pet_growth_check = value

var auto_pet_individual_growth_check:
	get:
		return host.auto_pet_individual_growth_check
	set(value):
		host.auto_pet_individual_growth_check = value

var auto_pet_cultivation_check:
	get:
		return host.auto_pet_cultivation_check
	set(value):
		host.auto_pet_cultivation_check = value

var auto_pet_rebirth_mm_check:
	get:
		return host.auto_pet_rebirth_mm_check
	set(value):
		host.auto_pet_rebirth_mm_check = value

var auto_pet_rebirth_mm_formula_check:
	get:
		return host.auto_pet_rebirth_mm_formula_check
	set(value):
		host.auto_pet_rebirth_mm_formula_check = value

var auto_pet_rename_check:
	get:
		return host.auto_pet_rename_check
	set(value):
		host.auto_pet_rename_check = value

var auto_pet_order_check:
	get:
		return host.auto_pet_order_check
	set(value):
		host.auto_pet_order_check = value

var auto_pet_recovery_check:
	get:
		return host.auto_pet_recovery_check
	set(value):
		host.auto_pet_recovery_check = value

var auto_pet_stable_check:
	get:
		return host.auto_pet_stable_check
	set(value):
		host.auto_pet_stable_check = value

var auto_pet_drop_pickup_check:
	get:
		return host.auto_pet_drop_pickup_check
	set(value):
		host.auto_pet_drop_pickup_check = value

var auto_pet_codex_detail_check:
	get:
		return host.auto_pet_codex_detail_check
	set(value):
		host.auto_pet_codex_detail_check = value

var auto_pet_codex_list_check:
	get:
		return host.auto_pet_codex_list_check
	set(value):
		host.auto_pet_codex_list_check = value

var auto_pet_encounter_table_check:
	get:
		return host.auto_pet_encounter_table_check
	set(value):
		host.auto_pet_encounter_table_check = value

var auto_pet_capture_feedback_check:
	get:
		return host.auto_pet_capture_feedback_check
	set(value):
		host.auto_pet_capture_feedback_check = value

var auto_pet_storage_capture_check:
	get:
		return host.auto_pet_storage_capture_check
	set(value):
		host.auto_pet_storage_capture_check = value

var auto_pet_template_catalog_check:
	get:
		return host.auto_pet_template_catalog_check
	set(value):
		host.auto_pet_template_catalog_check = value

var auto_pet_skill_training_check:
	get:
		return host.auto_pet_skill_training_check
	set(value):
		host.auto_pet_skill_training_check = value

var auto_village_healer_check:
	get:
		return host.auto_village_healer_check
	set(value):
		host.auto_village_healer_check = value

var auto_record_point_check:
	get:
		return host.auto_record_point_check
	set(value):
		host.auto_record_point_check = value

var auto_backpack_check:
	get:
		return host.auto_backpack_check
	set(value):
		host.auto_backpack_check = value

var auto_backpack_world_use_check:
	get:
		return host.auto_backpack_world_use_check
	set(value):
		host.auto_backpack_world_use_check = value

var auto_exp_pill_check:
	get:
		return host.auto_exp_pill_check
	set(value):
		host.auto_exp_pill_check = value

var auto_mailbox_check:
	get:
		return host.auto_mailbox_check
	set(value):
		host.auto_mailbox_check = value

var auto_riding_system_check:
	get:
		return host.auto_riding_system_check
	set(value):
		host.auto_riding_system_check = value

var auto_backpack_filter_check:
	get:
		return host.auto_backpack_filter_check
	set(value):
		host.auto_backpack_filter_check = value

var auto_quick_slot_check:
	get:
		return host.auto_quick_slot_check
	set(value):
		host.auto_quick_slot_check = value

var auto_shop_check:
	get:
		return host.auto_shop_check
	set(value):
		host.auto_shop_check = value

var auto_battle_reward_check:
	get:
		return host.auto_battle_reward_check
	set(value):
		host.auto_battle_reward_check = value

var auto_equipment_drop_check:
	get:
		return host.auto_equipment_drop_check
	set(value):
		host.auto_equipment_drop_check = value

var auto_quest_chain_check:
	get:
		return host.auto_quest_chain_check
	set(value):
		host.auto_quest_chain_check = value

var auto_quest_ui_check:
	get:
		return host.auto_quest_ui_check
	set(value):
		host.auto_quest_ui_check = value

var auto_quest_reward_choice_check:
	get:
		return host.auto_quest_reward_choice_check
	set(value):
		host.auto_quest_reward_choice_check = value

var auto_quest_equipment_reward_check:
	get:
		return host.auto_quest_equipment_reward_check
	set(value):
		host.auto_quest_equipment_reward_check = value

var auto_task_tracker_route_check:
	get:
		return host.auto_task_tracker_route_check
	set(value):
		host.auto_task_tracker_route_check = value

var auto_map_panel_check:
	get:
		return host.auto_map_panel_check
	set(value):
		host.auto_map_panel_check = value

var auto_facility_marker_check:
	get:
		return host.auto_facility_marker_check
	set(value):
		host.auto_facility_marker_check = value

var auto_qa_panel_check:
	get:
		return host.auto_qa_panel_check
	set(value):
		host.auto_qa_panel_check = value

var auto_auth_check:
	get:
		return host.auto_auth_check
	set(value):
		host.auto_auth_check = value

var auto_auth_server_client_check:
	get:
		return host.auto_auth_server_client_check
	set(value):
		host.auto_auth_server_client_check = value

var auto_auth_server_live_check:
	get:
		return host.auto_auth_server_live_check
	set(value):
		host.auto_auth_server_live_check = value

var auto_startup_login_check:
	get:
		return host.auto_startup_login_check
	set(value):
		host.auto_startup_login_check = value

var auto_server_mail_live_check:
	get:
		return host.auto_server_mail_live_check
	set(value):
		host.auto_server_mail_live_check = value

var auto_party_live_check:
	get:
		return host.auto_party_live_check
	set(value):
		host.auto_party_live_check = value

var auto_party_member_follow_check:
	get:
		return host.auto_party_member_follow_check
	set(value):
		host.auto_party_member_follow_check = value

var auto_player_interaction_live_check:
	get:
		return host.auto_player_interaction_live_check
	set(value):
		host.auto_player_interaction_live_check = value

var auto_chat_live_check:
	get:
		return host.auto_chat_live_check
	set(value):
		host.auto_chat_live_check = value

var auto_online_position_live_check:
	get:
		return host.auto_online_position_live_check
	set(value):
		host.auto_online_position_live_check = value

var auto_server_movement_live_check:
	get:
		return host.auto_server_movement_live_check
	set(value):
		host.auto_server_movement_live_check = value

var auto_server_click_move_live_check:
	get:
		return host.auto_server_click_move_live_check
	set(value):
		host.auto_server_click_move_live_check = value

var auto_server_click_move_reject_live_check:
	get:
		return host.auto_server_click_move_reject_live_check
	set(value):
		host.auto_server_click_move_reject_live_check = value

var auto_online_aoi_live_check:
	get:
		return host.auto_online_aoi_live_check
	set(value):
		host.auto_online_aoi_live_check = value

var auto_server_event_live_check:
	get:
		return host.auto_server_event_live_check
	set(value):
		host.auto_server_event_live_check = value

var auto_server_event_replay_live_check:
	get:
		return host.auto_server_event_replay_live_check
	set(value):
		host.auto_server_event_replay_live_check = value

var auto_battle_room_live_check:
	get:
		return host.auto_battle_room_live_check
	set(value):
		host.auto_battle_room_live_check = value

var auto_server_battle_turn_live_check:
	get:
		return host.auto_server_battle_turn_live_check
	set(value):
		host.auto_server_battle_turn_live_check = value

var auto_server_battle_reconnect_live_check:
	get:
		return host.auto_server_battle_reconnect_live_check
	set(value):
		host.auto_server_battle_reconnect_live_check = value

var auto_server_battle_close_live_check:
	get:
		return host.auto_server_battle_close_live_check
	set(value):
		host.auto_server_battle_close_live_check = value

var auto_server_battle_return_check:
	get:
		return host.auto_server_battle_return_check
	set(value):
		host.auto_server_battle_return_check = value

var auto_server_battle_pet_snapshot_live_check:
	get:
		return host.auto_server_battle_pet_snapshot_live_check
	set(value):
		host.auto_server_battle_pet_snapshot_live_check = value

var auto_server_battle_leave_ui_live_check:
	get:
		return host.auto_server_battle_leave_ui_live_check
	set(value):
		host.auto_server_battle_leave_ui_live_check = value

var auto_server_battle_pet_command_live_check:
	get:
		return host.auto_server_battle_pet_command_live_check
	set(value):
		host.auto_server_battle_pet_command_live_check = value

var auto_server_battle_switch_pet_live_check:
	get:
		return host.auto_server_battle_switch_pet_live_check
	set(value):
		host.auto_server_battle_switch_pet_live_check = value

var auto_server_battle_item_live_check:
	get:
		return host.auto_server_battle_item_live_check
	set(value):
		host.auto_server_battle_item_live_check = value

var auto_server_battle_target_mapping_check:
	get:
		return host.auto_server_battle_target_mapping_check
	set(value):
		host.auto_server_battle_target_mapping_check = value

var auto_server_battle_stale_room_check:
	get:
		return host.auto_server_battle_stale_room_check
	set(value):
		host.auto_server_battle_stale_room_check = value

var auto_server_solo_pve_live_check:
	get:
		return host.auto_server_solo_pve_live_check
	set(value):
		host.auto_server_solo_pve_live_check = value

var auto_server_party_pve_sync_live_check:
	get:
		return host.auto_server_party_pve_sync_live_check
	set(value):
		host.auto_server_party_pve_sync_live_check = value

var auto_server_profile_sync_check:
	get:
		return host.auto_server_profile_sync_check
	set(value):
		host.auto_server_profile_sync_check = value

var auth_ux_preview:
	get:
		return host.auth_ux_preview
	set(value):
		host.auth_ux_preview = value

var auto_panel_registry_check:
	get:
		return host.auto_panel_registry_check
	set(value):
		host.auto_panel_registry_check = value

var auto_chat_panel_check:
	get:
		return host.auto_chat_panel_check
	set(value):
		host.auto_chat_panel_check = value

var auto_world_log_panel_check:
	get:
		return host.auto_world_log_panel_check
	set(value):
		host.auto_world_log_panel_check = value

var auto_equipment_check:
	get:
		return host.auto_equipment_check
	set(value):
		host.auto_equipment_check = value

var auto_equipment_shop_preview_check:
	get:
		return host.auto_equipment_shop_preview_check
	set(value):
		host.auto_equipment_shop_preview_check = value

var auto_player_status_check:
	get:
		return host.auto_player_status_check
	set(value):
		host.auto_player_status_check = value

var auto_player_stat_points_check:
	get:
		return host.auto_player_stat_points_check
	set(value):
		host.auto_player_stat_points_check = value

var auto_player_stat_spam_perf_check:
	get:
		return host.auto_player_stat_spam_perf_check
	set(value):
		host.auto_player_stat_spam_perf_check = value

var auto_player_rebirth_preview_check:
	get:
		return host.auto_player_rebirth_preview_check
	set(value):
		host.auto_player_rebirth_preview_check = value

var auto_player_rebirth_execute_check:
	get:
		return host.auto_player_rebirth_execute_check
	set(value):
		host.auto_player_rebirth_execute_check = value

var auto_player_rebirth_chain_check:
	get:
		return host.auto_player_rebirth_chain_check
	set(value):
		host.auto_player_rebirth_chain_check = value

var auto_remote_stable_unlock_check:
	get:
		return host.auto_remote_stable_unlock_check
	set(value):
		host.auto_remote_stable_unlock_check = value

var auto_rebirth_task_tracker_check:
	get:
		return host.auto_rebirth_task_tracker_check
	set(value):
		host.auto_rebirth_task_tracker_check = value

var auto_rebirth_trial_contract_check:
	get:
		return host.auto_rebirth_trial_contract_check
	set(value):
		host.auto_rebirth_trial_contract_check = value

var auto_rebirth_cave_guardian_check:
	get:
		return host.auto_rebirth_cave_guardian_check
	set(value):
		host.auto_rebirth_cave_guardian_check = value

var auto_shadow_oath_cavern_check:
	get:
		return host.auto_shadow_oath_cavern_check
	set(value):
		host.auto_shadow_oath_cavern_check = value

var auto_rebirth_trial_execute_check:
	get:
		return host.auto_rebirth_trial_execute_check
	set(value):
		host.auto_rebirth_trial_execute_check = value

var auto_equipment_requirement_check:
	get:
		return host.auto_equipment_requirement_check
	set(value):
		host.auto_equipment_requirement_check = value

var auto_equipment_inactive_after_rebirth_check:
	get:
		return host.auto_equipment_inactive_after_rebirth_check
	set(value):
		host.auto_equipment_inactive_after_rebirth_check = value

var auto_equipment_status_closure_check:
	get:
		return host.auto_equipment_status_closure_check
	set(value):
		host.auto_equipment_status_closure_check = value

var auto_equipment_durability_check:
	get:
		return host.auto_equipment_durability_check
	set(value):
		host.auto_equipment_durability_check = value

var auto_equipment_durability_visual_check:
	get:
		return host.auto_equipment_durability_visual_check
	set(value):
		host.auto_equipment_durability_visual_check = value

var auto_equipment_slot_detail_check:
	get:
		return host.auto_equipment_slot_detail_check
	set(value):
		host.auto_equipment_slot_detail_check = value

var auto_equipment_synthesis_check:
	get:
		return host.auto_equipment_synthesis_check
	set(value):
		host.auto_equipment_synthesis_check = value

var auto_equipment_growth_check:
	get:
		return host.auto_equipment_growth_check
	set(value):
		host.auto_equipment_growth_check = value

var auto_equipment_instance_check:
	get:
		return host.auto_equipment_instance_check
	set(value):
		host.auto_equipment_instance_check = value

var auto_quest_objective_templates_check:
	get:
		return host.auto_quest_objective_templates_check
	set(value):
		host.auto_quest_objective_templates_check = value

var auto_map_region_contract_check:
	get:
		return host.auto_map_region_contract_check
	set(value):
		host.auto_map_region_contract_check = value

var auto_reward_grant_check:
	get:
		return host.auto_reward_grant_check
	set(value):
		host.auto_reward_grant_check = value

var auto_reward_mail_fallback_check:
	get:
		return host.auto_reward_mail_fallback_check
	set(value):
		host.auto_reward_mail_fallback_check = value

var auto_encounter_loop_check:
	get:
		return host.auto_encounter_loop_check
	set(value):
		host.auto_encounter_loop_check = value

var auto_hang_loop_closure_check:
	get:
		return host.auto_hang_loop_closure_check
	set(value):
		host.auto_hang_loop_closure_check = value

var auto_hang_supply_closure_check:
	get:
		return host.auto_hang_supply_closure_check
	set(value):
		host.auto_hang_supply_closure_check = value

var auto_pet_management_safety_check:
	get:
		return host.auto_pet_management_safety_check
	set(value):
		host.auto_pet_management_safety_check = value

var auto_player_growth_contract_check:
	get:
		return host.auto_player_growth_contract_check
	set(value):
		host.auto_player_growth_contract_check = value

var auto_server_profile_contract_check:
	get:
		return host.auto_server_profile_contract_check
	set(value):
		host.auto_server_profile_contract_check = value

var auto_server_auth_contract_check:
	get:
		return host.auto_server_auth_contract_check
	set(value):
		host.auto_server_auth_contract_check = value

var auto_balance_version_receipt_check:
	get:
		return host.auto_balance_version_receipt_check
	set(value):
		host.auto_balance_version_receipt_check = value

var auto_balance_snapshot_digest_check:
	get:
		return host.auto_balance_snapshot_digest_check
	set(value):
		host.auto_balance_snapshot_digest_check = value

var auto_balance_catalog_check:
	get:
		return host.auto_balance_catalog_check
	set(value):
		host.auto_balance_catalog_check = value

var auto_pet_growth_threshold_check:
	get:
		return host.auto_pet_growth_threshold_check
	set(value):
		host.auto_pet_growth_threshold_check = value

var auto_pet_growth_observation_check:
	get:
		return host.auto_pet_growth_observation_check
	set(value):
		host.auto_pet_growth_observation_check = value

var auto_pet_growth_species_simulation_check:
	get:
		return host.auto_pet_growth_species_simulation_check
	set(value):
		host.auto_pet_growth_species_simulation_check = value

var auto_pet_growth_starter_profiles_check:
	get:
		return host.auto_pet_growth_starter_profiles_check
	set(value):
		host.auto_pet_growth_starter_profiles_check = value

var auto_numeric_experiment_report_check:
	get:
		return host.auto_numeric_experiment_report_check
	set(value):
		host.auto_numeric_experiment_report_check = value

var auto_numeric_workbench_check:
	get:
		return host.auto_numeric_workbench_check
	set(value):
		host.auto_numeric_workbench_check = value

var auto_combat_formula_parity_check:
	get:
		return host.auto_combat_formula_parity_check
	set(value):
		host.auto_combat_formula_parity_check = value

var auto_combat_v2_shadow_check:
	get:
		return host.auto_combat_v2_shadow_check
	set(value):
		host.auto_combat_v2_shadow_check = value

var auto_combat_formula_driver_ab_check:
	get:
		return host.auto_combat_formula_driver_ab_check
	set(value):
		host.auto_combat_formula_driver_ab_check = value

var auto_numeric_battle_simulation_check:
	get:
		return host.auto_numeric_battle_simulation_check
	set(value):
		host.auto_numeric_battle_simulation_check = value

var auto_economy_ledger_check:
	get:
		return host.auto_economy_ledger_check
	set(value):
		host.auto_economy_ledger_check = value

var auto_numeric_balance_gate_check:
	get:
		return host.auto_numeric_balance_gate_check
	set(value):
		host.auto_numeric_balance_gate_check = value

var numeric_experiment_report:
	get:
		return host.numeric_experiment_report
	set(value):
		host.numeric_experiment_report = value

var backpack_preview:
	get:
		return host.backpack_preview
	set(value):
		host.backpack_preview = value

var backpack_world_use_preview:
	get:
		return host.backpack_world_use_preview
	set(value):
		host.backpack_world_use_preview = value

var backpack_filter_preview:
	get:
		return host.backpack_filter_preview
	set(value):
		host.backpack_filter_preview = value

var quick_slot_preview:
	get:
		return host.quick_slot_preview
	set(value):
		host.quick_slot_preview = value

var player_status_preview:
	get:
		return host.player_status_preview
	set(value):
		host.player_status_preview = value

var player_stat_points_preview:
	get:
		return host.player_stat_points_preview
	set(value):
		host.player_stat_points_preview = value

var player_rebirth_preview:
	get:
		return host.player_rebirth_preview
	set(value):
		host.player_rebirth_preview = value

var player_rebirth_chain_preview:
	get:
		return host.player_rebirth_chain_preview
	set(value):
		host.player_rebirth_chain_preview = value

var remote_stable_unlock_preview:
	get:
		return host.remote_stable_unlock_preview
	set(value):
		host.remote_stable_unlock_preview = value

var equipment_requirement_preview:
	get:
		return host.equipment_requirement_preview
	set(value):
		host.equipment_requirement_preview = value

var equipment_rebirth_requirement_preview:
	get:
		return host.equipment_rebirth_requirement_preview
	set(value):
		host.equipment_rebirth_requirement_preview = value

var equipment_inactive_after_rebirth_preview:
	get:
		return host.equipment_inactive_after_rebirth_preview
	set(value):
		host.equipment_inactive_after_rebirth_preview = value

var equipment_status_closure_preview:
	get:
		return host.equipment_status_closure_preview
	set(value):
		host.equipment_status_closure_preview = value

var equipment_shop_preview:
	get:
		return host.equipment_shop_preview
	set(value):
		host.equipment_shop_preview = value

var equipment_durability_preview:
	get:
		return host.equipment_durability_preview
	set(value):
		host.equipment_durability_preview = value

var equipment_durability_visual_preview:
	get:
		return host.equipment_durability_visual_preview
	set(value):
		host.equipment_durability_visual_preview = value

var equipment_slot_detail_preview:
	get:
		return host.equipment_slot_detail_preview
	set(value):
		host.equipment_slot_detail_preview = value

var equipment_synthesis_preview:
	get:
		return host.equipment_synthesis_preview
	set(value):
		host.equipment_synthesis_preview = value

var shop_preview:
	get:
		return host.shop_preview
	set(value):
		host.shop_preview = value

var battle_reward_preview:
	get:
		return host.battle_reward_preview
	set(value):
		host.battle_reward_preview = value

var equipment_drop_preview:
	get:
		return host.equipment_drop_preview
	set(value):
		host.equipment_drop_preview = value

var quest_preview:
	get:
		return host.quest_preview
	set(value):
		host.quest_preview = value

var quest_ui_preview:
	get:
		return host.quest_ui_preview
	set(value):
		host.quest_ui_preview = value

var quest_reward_choice_preview:
	get:
		return host.quest_reward_choice_preview
	set(value):
		host.quest_reward_choice_preview = value

var quest_equipment_tutorial_preview:
	get:
		return host.quest_equipment_tutorial_preview
	set(value):
		host.quest_equipment_tutorial_preview = value

var task_tracker_route_preview:
	get:
		return host.task_tracker_route_preview
	set(value):
		host.task_tracker_route_preview = value

var map_panel_preview:
	get:
		return host.map_panel_preview
	set(value):
		host.map_panel_preview = value

var facility_marker_preview:
	get:
		return host.facility_marker_preview
	set(value):
		host.facility_marker_preview = value

var npc_quest_marker_preview:
	get:
		return host.npc_quest_marker_preview
	set(value):
		host.npc_quest_marker_preview = value

var qa_panel_preview:
	get:
		return host.qa_panel_preview
	set(value):
		host.qa_panel_preview = value

var chat_panel_preview:
	get:
		return host.chat_panel_preview
	set(value):
		host.chat_panel_preview = value

var world_log_panel_preview:
	get:
		return host.world_log_panel_preview
	set(value):
		host.world_log_panel_preview = value

var equipment_quest_preview:
	get:
		return host.equipment_quest_preview
	set(value):
		host.equipment_quest_preview = value

var equipment_swap_preview:
	get:
		return host.equipment_swap_preview
	set(value):
		host.equipment_swap_preview = value

var equipment_spirit_preview:
	get:
		return host.equipment_spirit_preview
	set(value):
		host.equipment_spirit_preview = value

var equipment_compare_preview:
	get:
		return host.equipment_compare_preview
	set(value):
		host.equipment_compare_preview = value

var pet_management_preview:
	get:
		return host.pet_management_preview
	set(value):
		host.pet_management_preview = value

var pet_rename_preview:
	get:
		return host.pet_rename_preview
	set(value):
		host.pet_rename_preview = value

var pet_order_preview:
	get:
		return host.pet_order_preview
	set(value):
		host.pet_order_preview = value

var pet_drop_preview:
	get:
		return host.pet_drop_preview
	set(value):
		host.pet_drop_preview = value

var pet_codex_preview:
	get:
		return host.pet_codex_preview
	set(value):
		host.pet_codex_preview = value

var pet_codex_list_preview:
	get:
		return host.pet_codex_list_preview
	set(value):
		host.pet_codex_list_preview = value

var pet_encounter_table_preview:
	get:
		return host.pet_encounter_table_preview
	set(value):
		host.pet_encounter_table_preview = value

var pet_capture_feedback_preview:
	get:
		return host.pet_capture_feedback_preview
	set(value):
		host.pet_capture_feedback_preview = value

var pet_skill_training_preview:
	get:
		return host.pet_skill_training_preview
	set(value):
		host.pet_skill_training_preview = value

var capture_tools_preview:
	get:
		return host.capture_tools_preview
	set(value):
		host.capture_tools_preview = value

var battle_preview:
	get:
		return host.battle_preview
	set(value):
		host.battle_preview = value

var battle_formation_preview:
	get:
		return host.battle_formation_preview
	set(value):
		host.battle_formation_preview = value

var battle_auto_10v10_preview:
	get:
		return host.battle_auto_10v10_preview
	set(value):
		host.battle_auto_10v10_preview = value

var auto_battle_settings_preview:
	get:
		return host.auto_battle_settings_preview
	set(value):
		host.auto_battle_settings_preview = value

var battle_spirit_source_preview:
	get:
		return host.battle_spirit_source_preview
	set(value):
		host.battle_spirit_source_preview = value

var auto_capture_settings_preview:
	get:
		return host.auto_capture_settings_preview
	set(value):
		host.auto_capture_settings_preview = value

var training_partner_demo:
	get:
		return host.training_partner_demo
	set(value):
		host.training_partner_demo = value

var hang_settings_preview:
	get:
		return host.hang_settings_preview
	set(value):
		host.hang_settings_preview = value

var record_point_knockaway_demo:
	get:
		return host.record_point_knockaway_demo
	set(value):
		host.record_point_knockaway_demo = value

var battle_stat_test:
	get:
		return host.battle_stat_test
	set(value):
		host.battle_stat_test = value

var battle_status_test:
	get:
		return host.battle_status_test
	set(value):
		host.battle_status_test = value

var battle_status_skill_test:
	get:
		return host.battle_status_skill_test
	set(value):
		host.battle_status_skill_test = value

var battle_status_hit_test:
	get:
		return host.battle_status_hit_test
	set(value):
		host.battle_status_hit_test = value

var battle_status_rule_test:
	get:
		return host.battle_status_rule_test
	set(value):
		host.battle_status_rule_test = value

var battle_combo_motion_preview:
	get:
		return host.battle_combo_motion_preview
	set(value):
		host.battle_combo_motion_preview = value

var battle_launch_preview_mode:
	get:
		return host.battle_launch_preview_mode
	set(value):
		host.battle_launch_preview_mode = value

var battle_label_preview:
	get:
		return host.battle_label_preview
	set(value):
		host.battle_label_preview = value

var battle_debug_window_enabled:
	get:
		return host.battle_debug_window_enabled
	set(value):
		host.battle_debug_window_enabled = value

var current_map_id:
	get:
		return host.current_map_id
	set(value):
		host.current_map_id = value

var startup_map_id:
	get:
		return host.startup_map_id
	set(value):
		host.startup_map_id = value

var startup_spawn_name:
	get:
		return host.startup_spawn_name
	set(value):
		host.startup_spawn_name = value

var map_data:
	get:
		return host.map_data
	set(value):
		host.map_data = value

var player_profile:
	get:
		return host.player_profile
	set(value):
		host.player_profile = value

var account_authenticated:
	get:
		return host.account_authenticated
	set(value):
		host.account_authenticated = value

var auth_auto_bypass:
	get:
		return host.auth_auto_bypass
	set(value):
		host.auth_auto_bypass = value

var auth_mode_register:
	get:
		return host.auth_mode_register
	set(value):
		host.auth_mode_register = value

var auth_server_mode:
	get:
		return host.auth_server_mode
	set(value):
		host.auth_server_mode = value

var auth_request_pending:
	get:
		return host.auth_request_pending
	set(value):
		host.auth_request_pending = value

var startup_auth_username:
	get:
		return host.startup_auth_username
	set(value):
		host.startup_auth_username = value

var startup_auth_password:
	get:
		return host.startup_auth_password
	set(value):
		host.startup_auth_password = value

var startup_auth_base_url:
	get:
		return host.startup_auth_base_url
	set(value):
		host.startup_auth_base_url = value

var current_account_session:
	get:
		return host.current_account_session
	set(value):
		host.current_account_session = value

var server_profile_sync_state:
	get:
		return host.server_profile_sync_state
	set(value):
		host.server_profile_sync_state = value

var server_profile_sync_pending_kind:
	get:
		return host.server_profile_sync_pending_kind
	set(value):
		host.server_profile_sync_pending_kind = value

var server_profile_sync_dirty:
	get:
		return host.server_profile_sync_dirty
	set(value):
		host.server_profile_sync_dirty = value

var server_profile_sync_pull_queued:
	get:
		return host.server_profile_sync_pull_queued
	set(value):
		host.server_profile_sync_pull_queued = value

var server_profile_sync_deferred_pull_result:
	get:
		return host.server_profile_sync_deferred_pull_result
	set(value):
		host.server_profile_sync_deferred_pull_result = value

var server_profile_sync_deferred_pull_elapsed:
	get:
		return host.server_profile_sync_deferred_pull_elapsed
	set(value):
		host.server_profile_sync_deferred_pull_elapsed = value

var server_profile_sync_expected_revision:
	get:
		return host.server_profile_sync_expected_revision
	set(value):
		host.server_profile_sync_expected_revision = value

var server_profile_sync_message:
	get:
		return host.server_profile_sync_message
	set(value):
		host.server_profile_sync_message = value

var profile_save_enabled:
	get:
		return host.profile_save_enabled
	set(value):
		host.profile_save_enabled = value

var profile_save_pending:
	get:
		return host.profile_save_pending
	set(value):
		host.profile_save_pending = value

var profile_save_debounce_remaining:
	get:
		return host.profile_save_debounce_remaining
	set(value):
		host.profile_save_debounce_remaining = value

var profile_save_dry_run:
	get:
		return host.profile_save_dry_run
	set(value):
		host.profile_save_dry_run = value

var profile_save_debug_count:
	get:
		return host.profile_save_debug_count
	set(value):
		host.profile_save_debug_count = value

var player_status_refresh_debug_count:
	get:
		return host.player_status_refresh_debug_count
	set(value):
		host.player_status_refresh_debug_count = value

var player_status_refresh_pending:
	get:
		return host.player_status_refresh_pending
	set(value):
		host.player_status_refresh_pending = value

var world_log_message:
	get:
		return host.world_log_message
	set(value):
		host.world_log_message = value

var world_log_history:
	get:
		return host.world_log_history
	set(value):
		host.world_log_history = value

var battle_message_expanded:
	get:
		return host.battle_message_expanded
	set(value):
		host.battle_message_expanded = value

var pet_rest_recovery_elapsed:
	get:
		return host.pet_rest_recovery_elapsed
	set(value):
		host.pet_rest_recovery_elapsed = value

var pet_drop_expire_elapsed:
	get:
		return host.pet_drop_expire_elapsed
	set(value):
		host.pet_drop_expire_elapsed = value

var current_path_cells:
	get:
		return host.current_path_cells
	set(value):
		host.current_path_cells = value

var current_path_is_direct:
	get:
		return host.current_path_is_direct
	set(value):
		host.current_path_is_direct = value

var pet_follow_enabled:
	get:
		return host.pet_follow_enabled
	set(value):
		host.pet_follow_enabled = value

var pet_follow_points:
	get:
		return host.pet_follow_points
	set(value):
		host.pet_follow_points = value

var pet_follow_index:
	get:
		return host.pet_follow_index
	set(value):
		host.pet_follow_index = value

var target_marker:
	get:
		return host.target_marker
	set(value):
		host.target_marker = value

var has_target_marker:
	get:
		return host.has_target_marker
	set(value):
		host.has_target_marker = value

var target_cell:
	get:
		return host.target_cell
	set(value):
		host.target_cell = value

var has_target_cell:
	get:
		return host.has_target_cell
	set(value):
		host.has_target_cell = value

var click_move_repath_cooldown:
	get:
		return host.click_move_repath_cooldown
	set(value):
		host.click_move_repath_cooldown = value

var click_move_repath_apply_count:
	get:
		return host.click_move_repath_apply_count
	set(value):
		host.click_move_repath_apply_count = value

var click_move_screen_resolve_count:
	get:
		return host.click_move_screen_resolve_count
	set(value):
		host.click_move_screen_resolve_count = value

var has_pending_click_screen_point:
	get:
		return host.has_pending_click_screen_point
	set(value):
		host.has_pending_click_screen_point = value

var pending_click_screen_point:
	get:
		return host.pending_click_screen_point
	set(value):
		host.pending_click_screen_point = value

var has_pending_click_move_target:
	get:
		return host.has_pending_click_move_target
	set(value):
		host.has_pending_click_move_target = value

var pending_click_move_goal_cell:
	get:
		return host.pending_click_move_goal_cell
	set(value):
		host.pending_click_move_goal_cell = value

var pending_click_move_marker_cell:
	get:
		return host.pending_click_move_marker_cell
	set(value):
		host.pending_click_move_marker_cell = value

var pending_click_move_marker_point:
	get:
		return host.pending_click_move_marker_point
	set(value):
		host.pending_click_move_marker_point = value

var server_step_move_active:
	get:
		return host.server_step_move_active
	set(value):
		host.server_step_move_active = value

var server_step_move_request_pending:
	get:
		return host.server_step_move_request_pending
	set(value):
		host.server_step_move_request_pending = value

var server_step_move_waiting_for_visual:
	get:
		return host.server_step_move_waiting_for_visual
	set(value):
		host.server_step_move_waiting_for_visual = value

var server_step_move_plan_id:
	get:
		return host.server_step_move_plan_id
	set(value):
		host.server_step_move_plan_id = value

var server_step_move_path_cells:
	get:
		return host.server_step_move_path_cells
	set(value):
		host.server_step_move_path_cells = value

var server_step_move_path_index:
	get:
		return host.server_step_move_path_index
	set(value):
		host.server_step_move_path_index = value

var server_step_move_goal_cell:
	get:
		return host.server_step_move_goal_cell
	set(value):
		host.server_step_move_goal_cell = value

var server_step_move_marker_cell:
	get:
		return host.server_step_move_marker_cell
	set(value):
		host.server_step_move_marker_cell = value

var server_step_move_marker_point:
	get:
		return host.server_step_move_marker_point
	set(value):
		host.server_step_move_marker_point = value

var server_step_move_visual_target_cell:
	get:
		return host.server_step_move_visual_target_cell
	set(value):
		host.server_step_move_visual_target_cell = value

var server_step_move_authority_cell:
	get:
		return host.server_step_move_authority_cell
	set(value):
		host.server_step_move_authority_cell = value

var server_step_move_authority_valid:
	get:
		return host.server_step_move_authority_valid
	set(value):
		host.server_step_move_authority_valid = value

var server_step_move_request_count:
	get:
		return host.server_step_move_request_count
	set(value):
		host.server_step_move_request_count = value

var server_step_move_ack_count:
	get:
		return host.server_step_move_ack_count
	set(value):
		host.server_step_move_ack_count = value

var server_step_move_last_error_code:
	get:
		return host.server_step_move_last_error_code
	set(value):
		host.server_step_move_last_error_code = value

var server_step_move_sync_retry_count:
	get:
		return host.server_step_move_sync_retry_count
	set(value):
		host.server_step_move_sync_retry_count = value

var server_step_world_move_enabled:
	get:
		return host.server_step_world_move_enabled
	set(value):
		host.server_step_world_move_enabled = value

var has_pending_interaction:
	get:
		return host.has_pending_interaction
	set(value):
		host.has_pending_interaction = value

var pending_interaction:
	get:
		return host.pending_interaction
	set(value):
		host.pending_interaction = value

var pending_interaction_approach_cell:
	get:
		return host.pending_interaction_approach_cell
	set(value):
		host.pending_interaction_approach_cell = value

var active_dialog_interaction:
	get:
		return host.active_dialog_interaction
	set(value):
		host.active_dialog_interaction = value

var active_encounter_zone:
	get:
		return host.active_encounter_zone
	set(value):
		host.active_encounter_zone = value

var encounter_active:
	get:
		return host.encounter_active
	set(value):
		host.encounter_active = value

var battle_active:
	get:
		return host.battle_active
	set(value):
		host.battle_active = value

var battle_state:
	get:
		return host.battle_state
	set(value):
		host.battle_state = value

var battle_action_timer:
	get:
		return host.battle_action_timer
	set(value):
		host.battle_action_timer = value

var battle_end_pending:
	get:
		return host.battle_end_pending
	set(value):
		host.battle_end_pending = value

var battle_enemy_response_pending:
	get:
		return host.battle_enemy_response_pending
	set(value):
		host.battle_enemy_response_pending = value

var battle_selected_target_id:
	get:
		return host.battle_selected_target_id
	set(value):
		host.battle_selected_target_id = value

var battle_selected_ally_target_id:
	get:
		return host.battle_selected_ally_target_id
	set(value):
		host.battle_selected_ally_target_id = value

var battle_hover_target_id:
	get:
		return host.battle_hover_target_id
	set(value):
		host.battle_hover_target_id = value

var battle_hover_ally_target_id:
	get:
		return host.battle_hover_ally_target_id
	set(value):
		host.battle_hover_ally_target_id = value

var battle_hover_info_actor_id:
	get:
		return host.battle_hover_info_actor_id
	set(value):
		host.battle_hover_info_actor_id = value

var battle_target_mode:
	get:
		return host.battle_target_mode
	set(value):
		host.battle_target_mode = value

var battle_command_owner:
	get:
		return host.battle_command_owner
	set(value):
		host.battle_command_owner = value

var battle_pending_spirit_id:
	get:
		return host.battle_pending_spirit_id
	set(value):
		host.battle_pending_spirit_id = value

var battle_pending_item_id:
	get:
		return host.battle_pending_item_id
	set(value):
		host.battle_pending_item_id = value

var battle_pending_capture_tool_id:
	get:
		return host.battle_pending_capture_tool_id
	set(value):
		host.battle_pending_capture_tool_id = value

var battle_pending_pet_skill_id:
	get:
		return host.battle_pending_pet_skill_id
	set(value):
		host.battle_pending_pet_skill_id = value

var battle_switch_pet_button_pet_ids:
	get:
		return host.battle_switch_pet_button_pet_ids
	set(value):
		host.battle_switch_pet_button_pet_ids = value

var battle_spirit_button_spirit_ids:
	get:
		return host.battle_spirit_button_spirit_ids
	set(value):
		host.battle_spirit_button_spirit_ids = value

var battle_pending_player_command:
	get:
		return host.battle_pending_player_command
	set(value):
		host.battle_pending_player_command = value

var battle_pending_pet_command:
	get:
		return host.battle_pending_pet_command
	set(value):
		host.battle_pending_pet_command = value

var battle_event_queue:
	get:
		return host.battle_event_queue
	set(value):
		host.battle_event_queue = value

var battle_current_event:
	get:
		return host.battle_current_event
	set(value):
		host.battle_current_event = value

var battle_current_event_duration:
	get:
		return host.battle_current_event_duration
	set(value):
		host.battle_current_event_duration = value

var battle_current_event_actor_snapshots:
	get:
		return host.battle_current_event_actor_snapshots
	set(value):
		host.battle_current_event_actor_snapshots = value

var battle_event_advance_pending:
	get:
		return host.battle_event_advance_pending
	set(value):
		host.battle_event_advance_pending = value

var battle_round_end_status_processed:
	get:
		return host.battle_round_end_status_processed
	set(value):
		host.battle_round_end_status_processed = value

var battle_player_zero_hp_seen:
	get:
		return host.battle_player_zero_hp_seen
	set(value):
		host.battle_player_zero_hp_seen = value

var battle_auto_capture_success_seen:
	get:
		return host.battle_auto_capture_success_seen
	set(value):
		host.battle_auto_capture_success_seen = value

var battle_last_round_applied_events:
	get:
		return host.battle_last_round_applied_events
	set(value):
		host.battle_last_round_applied_events = value

var battle_last_round_event_types:
	get:
		return host.battle_last_round_event_types
	set(value):
		host.battle_last_round_event_types = value

var battle_last_round_actor_order:
	get:
		return host.battle_last_round_actor_order
	set(value):
		host.battle_last_round_actor_order = value

var battle_last_round_speeds:
	get:
		return host.battle_last_round_speeds
	set(value):
		host.battle_last_round_speeds = value

var battle_last_round_enemy_target_ids:
	get:
		return host.battle_last_round_enemy_target_ids
	set(value):
		host.battle_last_round_enemy_target_ids = value

var battle_last_event_type:
	get:
		return host.battle_last_event_type
	set(value):
		host.battle_last_event_type = value

var battle_last_event_target_id:
	get:
		return host.battle_last_event_target_id
	set(value):
		host.battle_last_event_target_id = value

var battle_last_event_target_ids:
	get:
		return host.battle_last_event_target_ids
	set(value):
		host.battle_last_event_target_ids = value

var battle_last_event_damage:
	get:
		return host.battle_last_event_damage
	set(value):
		host.battle_last_event_damage = value

var battle_last_event_heal:
	get:
		return host.battle_last_event_heal
	set(value):
		host.battle_last_event_heal = value

var battle_last_event_launch:
	get:
		return host.battle_last_event_launch
	set(value):
		host.battle_last_event_launch = value

var battle_last_event_launch_mode:
	get:
		return host.battle_last_event_launch_mode
	set(value):
		host.battle_last_event_launch_mode = value

var battle_last_event_ledger:
	get:
		return host.battle_last_event_ledger
	set(value):
		host.battle_last_event_ledger = value

var battle_recorded_event_sequence:
	get:
		return host.battle_recorded_event_sequence
	set(value):
		host.battle_recorded_event_sequence = value

var battle_float_texts:
	get:
		return host.battle_float_texts
	set(value):
		host.battle_float_texts = value

var battle_command_countdown_remaining:
	get:
		return host.battle_command_countdown_remaining
	set(value):
		host.battle_command_countdown_remaining = value

var battle_command_countdown_last_second:
	get:
		return host.battle_command_countdown_last_second
	set(value):
		host.battle_command_countdown_last_second = value

var battle_round_display_last_text:
	get:
		return host.battle_round_display_last_text
	set(value):
		host.battle_round_display_last_text = value

var battle_timer_display_last_text:
	get:
		return host.battle_timer_display_last_text
	set(value):
		host.battle_timer_display_last_text = value

var battle_trace_path:
	get:
		return host.battle_trace_path
	set(value):
		host.battle_trace_path = value

var gm_battle_speed_multiplier:
	get:
		return host.gm_battle_speed_multiplier
	set(value):
		host.gm_battle_speed_multiplier = value

var last_checked_player_cell:
	get:
		return host.last_checked_player_cell
	set(value):
		host.last_checked_player_cell = value

var encounter_zone_step_count:
	get:
		return host.encounter_zone_step_count
	set(value):
		host.encounter_zone_step_count = value

var encounter_grace_remaining:
	get:
		return host.encounter_grace_remaining
	set(value):
		host.encounter_grace_remaining = value

var hang_mode_active:
	get:
		return host.hang_mode_active
	set(value):
		host.hang_mode_active = value

var hang_walk_direction_index:
	get:
		return host.hang_walk_direction_index
	set(value):
		host.hang_walk_direction_index = value

var hang_walk_cooldown:
	get:
		return host.hang_walk_cooldown
	set(value):
		host.hang_walk_cooldown = value

var hang_heal_resume_active:
	get:
		return host.hang_heal_resume_active
	set(value):
		host.hang_heal_resume_active = value

var hang_heal_resume_mode:
	get:
		return host.hang_heal_resume_mode
	set(value):
		host.hang_heal_resume_mode = value

var hang_heal_resume_map_id:
	get:
		return host.hang_heal_resume_map_id
	set(value):
		host.hang_heal_resume_map_id = value

var hang_heal_resume_cell:
	get:
		return host.hang_heal_resume_cell
	set(value):
		host.hang_heal_resume_cell = value

var hang_session_request_active:
	get:
		return host.hang_session_request_active
	set(value):
		host.hang_session_request_active = value

var encounter_stone_item_id:
	get:
		return host.encounter_stone_item_id
	set(value):
		host.encounter_stone_item_id = value

var encounter_stone_interval:
	get:
		return host.encounter_stone_interval
	set(value):
		host.encounter_stone_interval = value

var encounter_stone_remaining:
	get:
		return host.encounter_stone_remaining
	set(value):
		host.encounter_stone_remaining = value

var encounter_stone_elapsed:
	get:
		return host.encounter_stone_elapsed
	set(value):
		host.encounter_stone_elapsed = value

var battle_auto_attack_enabled:
	get:
		return host.battle_auto_attack_enabled
	set(value):
		host.battle_auto_attack_enabled = value

var battle_auto_attack_delay:
	get:
		return host.battle_auto_attack_delay
	set(value):
		host.battle_auto_attack_delay = value

var battle_auto_attack_player_submissions:
	get:
		return host.battle_auto_attack_player_submissions
	set(value):
		host.battle_auto_attack_player_submissions = value

var battle_auto_attack_pet_submissions:
	get:
		return host.battle_auto_attack_pet_submissions
	set(value):
		host.battle_auto_attack_pet_submissions = value

var encounter_rng:
	get:
		return host.encounter_rng
	set(value):
		host.encounter_rng = value

var hud_status_text_cache:
	get:
		return host.hud_status_text_cache
	set(value):
		host.hud_status_text_cache = value

var hud_detail_text_cache:
	get:
		return host.hud_detail_text_cache
	set(value):
		host.hud_detail_text_cache = value

var hud_task_route_signature_cache:
	get:
		return host.hud_task_route_signature_cache
	set(value):
		host.hud_task_route_signature_cache = value

var quick_bar_signature_cache:
	get:
		return host.quick_bar_signature_cache
	set(value):
		host.quick_bar_signature_cache = value

var world_draw_signature_cache:
	get:
		return host.world_draw_signature_cache
	set(value):
		host.world_draw_signature_cache = value

var world_hud_signature_cache:
	get:
		return host.world_hud_signature_cache
	set(value):
		host.world_hud_signature_cache = value

var quest_marker_source_signature_cache:
	get:
		return host.quest_marker_source_signature_cache
	set(value):
		host.quest_marker_source_signature_cache = value

var quest_marker_signature_cache:
	get:
		return host.quest_marker_signature_cache
	set(value):
		host.quest_marker_signature_cache = value

var quest_marker_state_cache:
	get:
		return host.quest_marker_state_cache
	set(value):
		host.quest_marker_state_cache = value

var quest_marker_cache_dirty:
	get:
		return host.quest_marker_cache_dirty
	set(value):
		host.quest_marker_cache_dirty = value

var current_task_text_signature_cache:
	get:
		return host.current_task_text_signature_cache
	set(value):
		host.current_task_text_signature_cache = value

var current_task_text_cache:
	get:
		return host.current_task_text_cache
	set(value):
		host.current_task_text_cache = value

var task_tracker_cache_dirty:
	get:
		return host.task_tracker_cache_dirty
	set(value):
		host.task_tracker_cache_dirty = value

var task_tracker_source_signature_cache:
	get:
		return host.task_tracker_source_signature_cache
	set(value):
		host.task_tracker_source_signature_cache = value

var task_tracker_text_cache:
	get:
		return host.task_tracker_text_cache
	set(value):
		host.task_tracker_text_cache = value

var task_tracker_target_cache:
	get:
		return host.task_tracker_target_cache
	set(value):
		host.task_tracker_target_cache = value

var task_tracker_has_target_cache:
	get:
		return host.task_tracker_has_target_cache
	set(value):
		host.task_tracker_has_target_cache = value

var world_hud_refresh_elapsed:
	get:
		return host.world_hud_refresh_elapsed
	set(value):
		host.world_hud_refresh_elapsed = value

var map_world_bounds_cache:
	get:
		return host.map_world_bounds_cache
	set(value):
		host.map_world_bounds_cache = value

var map_world_bounds_cache_valid:
	get:
		return host.map_world_bounds_cache_valid
	set(value):
		host.map_world_bounds_cache_valid = value

var runtime_target_fps_cache:
	get:
		return host.runtime_target_fps_cache
	set(value):
		host.runtime_target_fps_cache = value

var canvas_text_font:
	get:
		return host.canvas_text_font
	set(value):
		host.canvas_text_font = value

var perf_probe_enabled:
	get:
		return host.perf_probe_enabled
	set(value):
		host.perf_probe_enabled = value

var perf_probe_elapsed:
	get:
		return host.perf_probe_elapsed
	set(value):
		host.perf_probe_elapsed = value

var perf_probe_frames:
	get:
		return host.perf_probe_frames
	set(value):
		host.perf_probe_frames = value

var perf_probe_totals:
	get:
		return host.perf_probe_totals
	set(value):
		host.perf_probe_totals = value


func _init(main_host = null) -> void:
	host = main_host


func bind(main_host) -> void:
	host = main_host


func _build_hud() -> void:
	var canvas_layer = CanvasLayer.new()
	host.add_child(canvas_layer)

	hud_root = Control.new()
	hud_root.name = "Hud"
	hud_root.theme = _build_theme()
	hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas_layer.add_child(hud_root)

	top_panel = _panel_container("TopPanel")
	var top_row = HBoxContainer.new()
	top_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	top_row.add_theme_constant_override("separation", 8)
	top_panel.add_child(top_row)
	status_label = Label.new()
	status_label.name = "StatusLabel"
	status_label.add_theme_font_size_override("font_size", 18)
	status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	top_row.add_child(status_label)
	version_label = Label.new()
	version_label.name = "VersionLabel"
	version_label.text = host._client_version_label_text()
	version_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	version_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	version_label.custom_minimum_size = Vector2(92, 0)
	version_label.add_theme_font_size_override("font_size", 14)
	version_label.add_theme_color_override("font_color", Color(0.86, 0.78, 0.62, 0.95))
	top_row.add_child(version_label)
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
	var side_column = VBoxContainer.new()
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
	var action_scroll = ScrollContainer.new()
	action_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	action_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	action_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	action_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	action_bar.add_child(action_scroll)
	var action_row = HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 6)
	action_scroll.add_child(action_row)
	stop_button = Button.new()
	stop_button.text = "挂机"
	stop_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	stop_button.pressed.connect(host._on_hang_button_pressed)
	action_row.add_child(stop_button)
	ring_button = Button.new()
	ring_button.text = "驯宠戒"
	ring_button.custom_minimum_size = Vector2(76, MIN_TOUCH_BUTTON_SIZE.y)
	ring_button.pressed.connect(host._toggle_pet_ring)
	action_row.add_child(ring_button)
	quick_slot_buttons.clear()
	for index in range(PlayerProgressModel.QUICK_SLOT_COUNT):
		var quick_button = Button.new()
		quick_button.custom_minimum_size = Vector2(72, MIN_TOUCH_BUTTON_SIZE.y)
		quick_button.add_theme_font_size_override("font_size", 13)
		var quick_index = index
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
	family_menu_button = Button.new()
	family_menu_button.text = "家族"
	family_menu_button.custom_minimum_size = MIN_TOUCH_BUTTON_SIZE
	family_menu_button.pressed.connect(_open_family_panel)
	action_row.add_child(family_menu_button)
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
	var player_status_column = VBoxContainer.new()
	player_status_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	player_status_column.add_theme_constant_override("separation", 8)
	player_status_panel.add_child(player_status_column)

	var player_status_header = HBoxContainer.new()
	player_status_header.add_theme_constant_override("separation", 10)
	player_status_column.add_child(player_status_header)
	var player_status_title = Label.new()
	player_status_title.text = "人物状态"
	player_status_title.add_theme_font_size_override("font_size", 21)
	player_status_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_header.add_child(player_status_title)
	player_status_close_button = Button.new()
	player_status_close_button.text = "关闭"
	player_status_close_button.custom_minimum_size = Vector2(92, 44)
	player_status_close_button.pressed.connect(_close_player_status_panel)
	player_status_header.add_child(player_status_close_button)

	var player_status_scroll = ScrollContainer.new()
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

	var player_status_point_grid = GridContainer.new()
	player_status_point_grid.columns = 2
	player_status_point_grid.add_theme_constant_override("h_separation", 8)
	player_status_point_grid.add_theme_constant_override("v_separation", 8)
	player_status_point_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_status_column.add_child(player_status_point_grid)
	player_status_stat_point_buttons.clear()
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		var stat_button = Button.new()
		stat_button.custom_minimum_size = Vector2(0, 40)
		stat_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stat_button.add_theme_font_size_override("font_size", 15)
		var captured_key = stat_key
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
	var rebirth_preview_column = VBoxContainer.new()
	rebirth_preview_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebirth_preview_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rebirth_preview_column.add_theme_constant_override("separation", 8)
	player_rebirth_preview_panel.add_child(rebirth_preview_column)
	var rebirth_preview_header = HBoxContainer.new()
	rebirth_preview_header.add_theme_constant_override("separation", 10)
	rebirth_preview_column.add_child(rebirth_preview_header)
	var rebirth_preview_title = Label.new()
	rebirth_preview_title.text = "转生预览"
	rebirth_preview_title.add_theme_font_size_override("font_size", 21)
	rebirth_preview_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rebirth_preview_header.add_child(rebirth_preview_title)
	player_rebirth_preview_close_button = Button.new()
	player_rebirth_preview_close_button.text = "关闭"
	player_rebirth_preview_close_button.custom_minimum_size = Vector2(92, 44)
	player_rebirth_preview_close_button.pressed.connect(_close_player_rebirth_preview_panel)
	rebirth_preview_header.add_child(player_rebirth_preview_close_button)
	var rebirth_preview_scroll = ScrollContainer.new()
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
	var backpack_column = VBoxContainer.new()
	backpack_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	backpack_column.add_theme_constant_override("separation", 8)
	backpack_panel.add_child(backpack_column)

	var backpack_header = HBoxContainer.new()
	backpack_header.add_theme_constant_override("separation", 10)
	backpack_column.add_child(backpack_header)
	var backpack_title = Label.new()
	backpack_title.text = "随身包"
	backpack_title.add_theme_font_size_override("font_size", 21)
	backpack_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_header.add_child(backpack_title)
	backpack_close_button = Button.new()
	backpack_close_button.text = "关闭"
	backpack_close_button.custom_minimum_size = Vector2(92, 44)
	backpack_close_button.pressed.connect(_close_backpack_panel)
	backpack_header.add_child(backpack_close_button)

	var backpack_filter_row = HBoxContainer.new()
	backpack_filter_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	backpack_filter_row.add_theme_constant_override("separation", 6)
	backpack_column.add_child(backpack_filter_row)
	backpack_filter_buttons.clear()
	for option in _backpack_filter_options():
		var filter_id = str(option.get("id", BACKPACK_FILTER_ALL))
		var filter_button = Button.new()
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

	var backpack_scroll = ScrollContainer.new()
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
		var quick_bind_button = Button.new()
		quick_bind_button.text = "快捷%d" % [index + 1]
		quick_bind_button.custom_minimum_size = Vector2(0, 40)
		quick_bind_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		quick_bind_button.add_theme_font_size_override("font_size", 15)
		var quick_bind_index = index
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
	var equipment_column = VBoxContainer.new()
	equipment_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	equipment_column.add_theme_constant_override("separation", 8)
	equipment_panel.add_child(equipment_column)

	var equipment_header = HBoxContainer.new()
	equipment_header.add_theme_constant_override("separation", 10)
	equipment_column.add_child(equipment_header)
	var equipment_title = Label.new()
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
	var equipment_action_row = HBoxContainer.new()
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
	var synthesis_column = VBoxContainer.new()
	synthesis_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_column.add_theme_constant_override("separation", 8)
	equipment_synthesis_panel.add_child(synthesis_column)

	var synthesis_header = HBoxContainer.new()
	synthesis_header.add_theme_constant_override("separation", 10)
	synthesis_column.add_child(synthesis_header)
	var synthesis_title = Label.new()
	synthesis_title.text = "装备合成"
	synthesis_title.add_theme_font_size_override("font_size", 21)
	synthesis_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_header.add_child(synthesis_title)
	equipment_synthesis_close_button = Button.new()
	equipment_synthesis_close_button.text = "关闭"
	equipment_synthesis_close_button.custom_minimum_size = Vector2(92, 44)
	equipment_synthesis_close_button.pressed.connect(_close_equipment_synthesis_panel)
	synthesis_header.add_child(equipment_synthesis_close_button)

	var synthesis_body = HBoxContainer.new()
	synthesis_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_body.add_theme_constant_override("separation", 10)
	synthesis_column.add_child(synthesis_body)

	var synthesis_list_scroll = ScrollContainer.new()
	synthesis_list_scroll.custom_minimum_size = Vector2(236, 0)
	synthesis_list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_body.add_child(synthesis_list_scroll)
	equipment_synthesis_list_container = VBoxContainer.new()
	equipment_synthesis_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	equipment_synthesis_list_container.add_theme_constant_override("separation", 7)
	synthesis_list_scroll.add_child(equipment_synthesis_list_container)

	var synthesis_detail_column = VBoxContainer.new()
	synthesis_detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	synthesis_detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	synthesis_detail_column.add_theme_constant_override("separation", 8)
	synthesis_body.add_child(synthesis_detail_column)
	var synthesis_detail_scroll = ScrollContainer.new()
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

	var synthesis_button_row = HBoxContainer.new()
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
	var shop_column = VBoxContainer.new()
	shop_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	shop_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shop_column.add_theme_constant_override("separation", 8)
	shop_panel.add_child(shop_column)

	var shop_header = HBoxContainer.new()
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

	var shop_tabs = HBoxContainer.new()
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

	var shop_scroll = ScrollContainer.new()
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
	var shop_quantity_row = HBoxContainer.new()
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
	var pet_column = VBoxContainer.new()
	pet_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_column.add_theme_constant_override("separation", 8)
	pet_panel.add_child(pet_column)

	var pet_header = HBoxContainer.new()
	pet_header.add_theme_constant_override("separation", 10)
	pet_column.add_child(pet_header)
	var pet_title = Label.new()
	pet_title.text = "宠物"
	pet_title.add_theme_font_size_override("font_size", 21)
	pet_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_header.add_child(pet_title)
	pet_close_button = Button.new()
	pet_close_button.text = "关闭"
	pet_close_button.custom_minimum_size = Vector2(92, 44)
	pet_close_button.pressed.connect(_close_pet_panel)
	pet_header.add_child(pet_close_button)

	var pet_body = HBoxContainer.new()
	pet_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_body.add_theme_constant_override("separation", 8)
	pet_column.add_child(pet_body)

	var pet_left_column = VBoxContainer.new()
	pet_left_column.custom_minimum_size = Vector2(220, 0)
	pet_left_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_left_column.add_theme_constant_override("separation", 6)
	pet_body.add_child(pet_left_column)
	var pet_manage_row = HBoxContainer.new()
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
		var next_sort_mode = str(pet_sort_option.get_item_metadata(index))
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
	var pet_scroll = ScrollContainer.new()
	pet_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_left_column.add_child(pet_scroll)
	pet_list_container = VBoxContainer.new()
	pet_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_list_container.add_theme_constant_override("separation", 7)
	pet_scroll.add_child(pet_list_container)

	var pet_detail_column = VBoxContainer.new()
	pet_detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pet_detail_column.add_theme_constant_override("separation", 6)
	pet_body.add_child(pet_detail_column)
	var pet_detail_mode_row = HBoxContainer.new()
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
	var pet_detail_content = VBoxContainer.new()
	pet_detail_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_detail_content.add_theme_constant_override("separation", 6)
	pet_detail_scroll.add_child(pet_detail_content)
	pet_growth_stage_row = HBoxContainer.new()
	pet_growth_stage_row.visible = false
	pet_growth_stage_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_growth_stage_row.add_theme_constant_override("separation", 6)
	pet_detail_content.add_child(pet_growth_stage_row)
	for stage in [0, 1, 2]:
		var stage_button = Button.new()
		var stage_index = int(stage)
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
	var pet_manage_action_row = HBoxContainer.new()
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
	var pet_button_row = HBoxContainer.new()
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
	var codex_column = VBoxContainer.new()
	codex_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_column.add_theme_constant_override("separation", 8)
	codex_panel.add_child(codex_column)

	var codex_header = HBoxContainer.new()
	codex_header.add_theme_constant_override("separation", 10)
	codex_column.add_child(codex_header)
	var codex_title = Label.new()
	codex_title.text = "图鉴"
	codex_title.add_theme_font_size_override("font_size", 21)
	codex_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_header.add_child(codex_title)
	codex_close_button = Button.new()
	codex_close_button.text = "关闭"
	codex_close_button.custom_minimum_size = Vector2(92, 44)
	codex_close_button.pressed.connect(_close_codex_panel)
	codex_header.add_child(codex_close_button)

	var codex_body = HBoxContainer.new()
	codex_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_body.add_theme_constant_override("separation", 10)
	codex_column.add_child(codex_body)

	var codex_scroll = ScrollContainer.new()
	codex_scroll.custom_minimum_size = Vector2(236, 0)
	codex_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	codex_body.add_child(codex_scroll)
	codex_list_container = VBoxContainer.new()
	codex_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	codex_list_container.add_theme_constant_override("separation", 7)
	codex_scroll.add_child(codex_list_container)

	var codex_detail_scroll = ScrollContainer.new()
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
	var quest_column = VBoxContainer.new()
	quest_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quest_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	quest_column.add_theme_constant_override("separation", 10)
	quest_panel.add_child(quest_column)

	var quest_header = HBoxContainer.new()
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

	var quest_detail_scroll = ScrollContainer.new()
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
	var map_column = VBoxContainer.new()
	map_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_column.add_theme_constant_override("separation", 8)
	map_panel.add_child(map_column)

	var map_header = HBoxContainer.new()
	map_header.add_theme_constant_override("separation", 10)
	map_column.add_child(map_header)
	var map_title_label = Label.new()
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
	map_texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
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

	var map_marker_scroll = ScrollContainer.new()
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
	var chat_column = VBoxContainer.new()
	chat_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_column.add_theme_constant_override("separation", 8)
	chat_panel.add_child(chat_column)

	var chat_header = HBoxContainer.new()
	chat_header.add_theme_constant_override("separation", 10)
	chat_column.add_child(chat_header)
	var chat_title_label = Label.new()
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

	var chat_tab_row = HBoxContainer.new()
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

	var chat_scroll = ScrollContainer.new()
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

	var chat_input_row = HBoxContainer.new()
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
	var party_column = VBoxContainer.new()
	party_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	party_column.add_theme_constant_override("separation", 8)
	party_panel.add_child(party_column)

	var party_header = HBoxContainer.new()
	party_header.add_theme_constant_override("separation", 10)
	party_column.add_child(party_header)
	var party_title_label = Label.new()
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

	var party_scroll = ScrollContainer.new()
	party_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	party_column.add_child(party_scroll)
	var party_content = VBoxContainer.new()
	party_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_content.add_theme_constant_override("separation", 10)
	party_scroll.add_child(party_content)

	var party_members_title = Label.new()
	party_members_title.text = "成员"
	party_members_title.add_theme_font_size_override("font_size", 17)
	party_content.add_child(party_members_title)
	party_members_container = VBoxContainer.new()
	party_members_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_members_container.add_theme_constant_override("separation", 7)
	party_content.add_child(party_members_container)

	var party_invites_title = Label.new()
	party_invites_title.text = "邀请"
	party_invites_title.add_theme_font_size_override("font_size", 17)
	party_content.add_child(party_invites_title)
	party_invites_container = VBoxContainer.new()
	party_invites_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_invites_container.add_theme_constant_override("separation", 7)
	party_content.add_child(party_invites_container)

	var party_online_title = Label.new()
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

	family_panel = _panel_container("FamilyPanel")
	family_panel.visible = false
	family_panel.z_index = 24
	var family_column = VBoxContainer.new()
	family_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	family_column.add_theme_constant_override("separation", 8)
	family_panel.add_child(family_column)

	var family_header = HBoxContainer.new()
	family_header.add_theme_constant_override("separation", 10)
	family_column.add_child(family_header)
	var family_title_label = Label.new()
	family_title_label.text = "家族与庄园"
	family_title_label.add_theme_font_size_override("font_size", 21)
	family_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_header.add_child(family_title_label)
	family_refresh_button = Button.new()
	family_refresh_button.text = "刷新"
	family_refresh_button.custom_minimum_size = Vector2(80, 44)
	family_refresh_button.pressed.connect(_request_family_state)
	family_header.add_child(family_refresh_button)
	family_leave_button = Button.new()
	family_leave_button.text = "离族"
	family_leave_button.custom_minimum_size = Vector2(80, 44)
	family_leave_button.pressed.connect(_on_family_leave_pressed)
	family_header.add_child(family_leave_button)
	var family_close_button = Button.new()
	family_close_button.text = "关闭"
	family_close_button.custom_minimum_size = Vector2(92, 44)
	family_close_button.pressed.connect(_close_family_panel)
	family_header.add_child(family_close_button)

	family_status_label = Label.new()
	family_status_label.text = ""
	family_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	family_status_label.add_theme_font_size_override("font_size", 15)
	family_status_label.add_theme_color_override("font_color", Color(0.95, 0.78, 0.45, 1.0))
	family_status_label.custom_minimum_size = Vector2(0, 30)
	family_column.add_child(family_status_label)

	var family_create_row = HBoxContainer.new()
	family_create_row.add_theme_constant_override("separation", 8)
	family_column.add_child(family_create_row)
	family_name_input = LineEdit.new()
	family_name_input.placeholder_text = "家族名"
	family_name_input.max_length = 12
	family_name_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_create_row.add_child(family_name_input)
	family_create_button = Button.new()
	family_create_button.text = "成立"
	family_create_button.custom_minimum_size = Vector2(92, 42)
	family_create_button.pressed.connect(_on_family_create_pressed)
	family_create_row.add_child(family_create_button)

	var family_scroll = ScrollContainer.new()
	family_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	family_column.add_child(family_scroll)
	var family_content = VBoxContainer.new()
	family_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_content.add_theme_constant_override("separation", 10)
	family_scroll.add_child(family_content)

	var family_list_title = Label.new()
	family_list_title.text = "家族列表"
	family_list_title.add_theme_font_size_override("font_size", 17)
	family_content.add_child(family_list_title)
	family_list_container = VBoxContainer.new()
	family_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	family_list_container.add_theme_constant_override("separation", 7)
	family_content.add_child(family_list_container)

	var manor_list_title = Label.new()
	manor_list_title.text = "九大庄园"
	manor_list_title.add_theme_font_size_override("font_size", 17)
	family_content.add_child(manor_list_title)
	manor_list_container = VBoxContainer.new()
	manor_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	manor_list_container.add_theme_constant_override("separation", 7)
	family_content.add_child(manor_list_container)

	family_http_request = HTTPRequest.new()
	family_http_request.timeout = 8.0
	family_http_request.request_completed.connect(_on_family_http_request_completed)
	family_panel.add_child(family_http_request)
	hud_root.add_child(family_panel)

	player_action_panel = _panel_container("PlayerActionPanel")
	player_action_panel.visible = false
	player_action_panel.z_index = 26
	var player_action_column = VBoxContainer.new()
	player_action_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	player_action_column.add_theme_constant_override("separation", 8)
	player_action_panel.add_child(player_action_column)
	var player_action_header = HBoxContainer.new()
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
	var battle_result_column = VBoxContainer.new()
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
	var battle_invite_column = VBoxContainer.new()
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
	var battle_invite_button_row = HBoxContainer.new()
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
	var mailbox_column = VBoxContainer.new()
	mailbox_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_column.add_theme_constant_override("separation", 8)
	mailbox_panel.add_child(mailbox_column)

	var mailbox_header = HBoxContainer.new()
	mailbox_header.add_theme_constant_override("separation", 10)
	mailbox_column.add_child(mailbox_header)
	var mailbox_title_label = Label.new()
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

	var mailbox_body = HBoxContainer.new()
	mailbox_body.add_theme_constant_override("separation", 10)
	mailbox_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_column.add_child(mailbox_body)

	var mailbox_list_scroll = ScrollContainer.new()
	mailbox_list_scroll.custom_minimum_size = Vector2(230, 0)
	mailbox_list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_body.add_child(mailbox_list_scroll)
	mailbox_list_container = VBoxContainer.new()
	mailbox_list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_list_container.add_theme_constant_override("separation", 7)
	mailbox_list_scroll.add_child(mailbox_list_container)

	var mailbox_detail_column = VBoxContainer.new()
	mailbox_detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mailbox_detail_column.add_theme_constant_override("separation", 8)
	mailbox_body.add_child(mailbox_detail_column)
	var mailbox_detail_scroll = ScrollContainer.new()
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

	var mailbox_compose_title = Label.new()
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
	var training_partner_column = VBoxContainer.new()
	training_partner_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	training_partner_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	training_partner_column.add_theme_constant_override("separation", 10)
	training_partner_panel.add_child(training_partner_column)
	var training_partner_header = HBoxContainer.new()
	training_partner_header.add_theme_constant_override("separation", 10)
	training_partner_column.add_child(training_partner_header)
	var training_partner_title = Label.new()
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
	var training_partner_button_row = HBoxContainer.new()
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
	var auto_settings_column = VBoxContainer.new()
	auto_settings_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	auto_settings_column.add_theme_constant_override("separation", 8)
	auto_settings_panel.add_child(auto_settings_column)

	var auto_settings_header = HBoxContainer.new()
	auto_settings_header.add_theme_constant_override("separation", 10)
	auto_settings_column.add_child(auto_settings_header)
	var auto_settings_title = Label.new()
	auto_settings_title.text = "内挂设置"
	auto_settings_title.add_theme_font_size_override("font_size", 21)
	auto_settings_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	auto_settings_header.add_child(auto_settings_title)
	auto_settings_close_button = Button.new()
	auto_settings_close_button.text = "关闭"
	auto_settings_close_button.custom_minimum_size = Vector2(92, 44)
	auto_settings_close_button.pressed.connect(_close_auto_settings_panel)
	auto_settings_header.add_child(auto_settings_close_button)

	var auto_settings_tab_row = HBoxContainer.new()
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

	var auto_settings_scroll = ScrollContainer.new()
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
	var qa_column = VBoxContainer.new()
	qa_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	qa_column.add_theme_constant_override("separation", 8)
	qa_panel.add_child(qa_column)

	var qa_header = HBoxContainer.new()
	qa_header.add_theme_constant_override("separation", 10)
	qa_column.add_child(qa_header)
	var qa_title = Label.new()
	qa_title.text = "GM/QA"
	qa_title.add_theme_font_size_override("font_size", 21)
	qa_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_header.add_child(qa_title)
	qa_close_button = Button.new()
	qa_close_button.text = "关闭"
	qa_close_button.custom_minimum_size = Vector2(92, 44)
	qa_close_button.pressed.connect(_close_qa_panel)
	qa_header.add_child(qa_close_button)

	var qa_pet_tool_column = VBoxContainer.new()
	qa_pet_tool_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	qa_pet_tool_column.add_theme_constant_override("separation", 6)
	qa_column.add_child(qa_pet_tool_column)
	var qa_pet_tool_label = Label.new()
	qa_pet_tool_label.text = "GM宠物测试"
	qa_pet_tool_label.add_theme_font_size_override("font_size", 15)
	qa_pet_tool_label.add_theme_color_override("font_color", Color(0.91, 0.80, 0.43, 0.98))
	qa_pet_tool_column.add_child(qa_pet_tool_label)
	var qa_pet_grant_row = HBoxContainer.new()
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
	var qa_pet_level_row = HBoxContainer.new()
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
	var numeric_column = VBoxContainer.new()
	numeric_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	numeric_column.add_theme_constant_override("separation", 9)
	numeric_workbench_panel.add_child(numeric_column)

	var numeric_header = HBoxContainer.new()
	numeric_header.add_theme_constant_override("separation", 10)
	numeric_column.add_child(numeric_header)
	var numeric_title = Label.new()
	numeric_title.text = "数值实验"
	numeric_title.add_theme_font_size_override("font_size", 21)
	numeric_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	numeric_header.add_child(numeric_title)
	numeric_workbench_close_button = Button.new()
	numeric_workbench_close_button.text = "关闭"
	numeric_workbench_close_button.custom_minimum_size = Vector2(92, 44)
	numeric_workbench_close_button.pressed.connect(_close_numeric_workbench_panel)
	numeric_header.add_child(numeric_workbench_close_button)

	var numeric_param_grid = GridContainer.new()
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

	var numeric_hint = Label.new()
	numeric_hint.text = "结果会写到 .run/godot"
	numeric_hint.add_theme_font_size_override("font_size", 14)
	numeric_hint.add_theme_color_override("font_color", Color(0.78, 0.78, 0.72, 0.92))
	numeric_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	numeric_param_grid.add_child(numeric_hint)

	var numeric_button_row = HBoxContainer.new()
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

	var numeric_result_scroll = ScrollContainer.new()
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
	var rename_column = VBoxContainer.new()
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
	var rename_button_row = HBoxContainer.new()
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
	var dialog_column = VBoxContainer.new()
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
	dialog_option_button.pressed.connect(host._confirm_dialog_action)
	dialog_button_row.add_child(dialog_option_button)
	dialog_close_button = Button.new()
	dialog_close_button.text = "离开"
	dialog_close_button.custom_minimum_size = Vector2(96, 48)
	dialog_close_button.pressed.connect(host._close_dialog)
	dialog_button_row.add_child(dialog_close_button)
	hud_root.add_child(dialog_panel)

	encounter_panel = _panel_container("EncounterPanel")
	encounter_panel.visible = false
	var encounter_column = VBoxContainer.new()
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
	var encounter_buttons = HBoxContainer.new()
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
	var battle_column = VBoxContainer.new()
	battle_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_column.add_theme_constant_override("separation", 8)
	battle_command_panel.add_child(battle_column)
	var battle_header = HBoxContainer.new()
	battle_header.name = "BattleCommandHeader"
	battle_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_header.add_theme_constant_override("separation", 8)
	battle_column.add_child(battle_header)
	var battle_auto_left_spacer = Control.new()
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
	battle_auto_button.pressed.connect(host._on_battle_auto_button_pressed)
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
	battle_auto_stop_button.pressed.connect(host._on_battle_auto_stop_button_pressed)
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
	var battle_message_box = VBoxContainer.new()
	battle_message_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_message_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	battle_message_box.add_theme_constant_override("separation", 4)
	battle_message_panel.add_child(battle_message_box)
	var battle_message_header = HBoxContainer.new()
	battle_message_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	battle_message_header.add_theme_constant_override("separation", 6)
	battle_message_box.add_child(battle_message_header)
	var battle_message_title = Label.new()
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

func _build_auth_panel() -> void:
	auth_panel = _panel_container("AuthPanel")
	auth_panel.visible = false
	auth_panel.z_index = 90
	auth_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var outer = VBoxContainer.new()
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 12)
	auth_panel.add_child(outer)

	auth_title_label = Label.new()
	auth_title_label.text = "万兽纪元"
	auth_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	auth_title_label.add_theme_font_size_override("font_size", 26)
	outer.add_child(auth_title_label)

	var subtitle = Label.new()
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

	var tab_row = HBoxContainer.new()
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

	auth_version_label = Label.new()
	auth_version_label.text = host._client_version_label_text()
	auth_version_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	auth_version_label.add_theme_font_size_override("font_size", 13)
	auth_version_label.add_theme_color_override("font_color", Color(0.86, 0.78, 0.62, 0.9))
	outer.add_child(auth_version_label)

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
	var outer = VBoxContainer.new()
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	outer.add_theme_constant_override("separation", 12)
	account_panel.add_child(outer)

	var header = HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(header)
	var title = Label.new()
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
		host._layout_hud()

func _on_auth_source_selected(_index: int) -> void:
	_set_auth_server_mode(true)

func _prefill_auth_last_username() -> void:
	if auth_username_input == null:
		return
	var last_username = AccountAuthModel.last_username()
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
		host._layout_hud()

func _close_auth_panel(update_layout: bool = true) -> void:
	_hide_control(auth_panel, update_layout)

func _remember_auth_session(session: Dictionary) -> void:
	var remember = auth_remember_check == null or auth_remember_check.button_pressed
	if remember:
		AccountAuthModel.set_last_username(str(session.get("username", "")))
	else:
		AccountAuthModel.set_last_username("")

func _on_auth_submit_pressed() -> void:
	if auth_username_input == null or auth_password_input == null:
		return
	if auth_request_pending:
		return
	var username = auth_username_input.text
	var password = auth_password_input.text
	if AUTH_SERVER_ONLY or auth_server_mode:
		_submit_server_auth_request(username, password)
		return
	var result = {}
	if auth_mode_register:
		var display_name = auth_display_name_input.text if auth_display_name_input != null else ""
		result = AccountAuthModel.register_player_account(username, password, display_name)
	else:
		result = AccountAuthModel.login(username, password)
	if not bool(result.get("ok", false)):
		if auth_message_label != null:
			auth_message_label.text = str(result.get("message", "登录失败。"))
		return
	var migrate_legacy = auth_mode_register and bool(result.get("firstAccount", false))
	var session = result.get("session", {}) as Dictionary
	_remember_auth_session(session)
	_apply_authenticated_session(session, migrate_legacy)
	if auth_message_label != null:
		auth_message_label.text = str(result.get("message", "已进入游戏。"))

func _submit_server_auth_request(username: String, password: String) -> void:
	if auth_http_request == null:
		return
	var base_url = auth_server_url_input.text if auth_server_url_input != null else ServerAuthClientModel.DEFAULT_BASE_URL
	var request_spec = {}
	if auth_mode_register:
		var display_name = auth_display_name_input.text if auth_display_name_input != null else ""
		request_spec = ServerAuthClientModel.register_request(base_url, username, password, display_name)
	else:
		request_spec = ServerAuthClientModel.login_request(base_url, username, password)
	auth_request_pending = true
	if auth_submit_button != null:
		auth_submit_button.disabled = true
	if auth_message_label != null:
		auth_message_label.text = "正在连接服务器..."
	var err = auth_http_request.request(
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
	var parsed = ServerAuthClientModel.parse_auth_response(response_code, body)
	if not bool(parsed.get("ok", false)):
		if auth_message_label != null:
			auth_message_label.text = str(parsed.get("message", "服务器登录失败。"))
		return
	var session = parsed.get("session", {}) as Dictionary
	session["serverBaseUrl"] = ServerAuthClientModel.normalized_base_url(auth_server_url_input.text if auth_server_url_input != null else ServerAuthClientModel.DEFAULT_BASE_URL)
	_remember_auth_session(session)
	_apply_authenticated_session(session, false)
	if auth_message_label != null:
		auth_message_label.text = str(parsed.get("message", "已连接服务器。"))

func _packed_string_array(value) -> PackedStringArray:
	var result = PackedStringArray()
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

func _handle_session_invalid_response(parsed: Dictionary) -> bool:
	if not ServerAuthClientModel.is_session_invalid_response(parsed):
		return false
	var message := str(parsed.get("message", "登录已过期，请重新登录。")).strip_edges()
	if message == "":
		message = "登录已过期，请重新登录。"
	_handle_server_session_expired(message)
	return true

func _local_profile_mutation_blocked_for_server_only(action_label: String, emit_message: bool = true) -> bool:
	if not AUTH_SERVER_ONLY:
		return false
	if _is_server_account_session():
		return false
	if auth_auto_bypass or not profile_save_enabled:
		return false
	if emit_message:
		var label = action_label.strip_edges()
		if label == "":
			label = "该操作"
		_set_world_log_message("%s 需要连接服务器后执行，服务器版不会本地改档。" % label)
	return true

func _server_profile_base_url() -> String:
	var base_url = str(current_account_session.get("serverBaseUrl", "")).strip_edges()
	if base_url == "" and auth_server_url_input != null:
		base_url = auth_server_url_input.text
	return ServerAuthClientModel.normalized_base_url(base_url)

func _server_profile_token() -> String:
	return str(current_account_session.get("serverSessionToken", "")).strip_edges()

func _server_battle_should_poll_waiting_state() -> bool:
	return host._server_battle().should_poll_waiting_state()

func _update_server_battle_waiting_state_poll(delta: float) -> void:
	host._server_battle().update_waiting_state_poll(delta)

func _server_battle_should_poll_room_restore() -> bool:
	return host._server_battle().should_poll_room_restore()

func _update_server_battle_room_restore_poll(delta: float) -> void:
	host._server_battle().update_room_restore_poll(delta)

func _request_server_battle_room_restore_poll() -> void:
	await host._server_battle().request_room_restore_poll()

func _request_server_battle_waiting_state_poll() -> void:
	await host._server_battle().request_waiting_state_poll()

func _apply_polled_server_battle_room(room: Dictionary, expected_room_id: String = "") -> void:
	host._server_battle().apply_polled_room(room, expected_room_id)

func _request_server_battle_state_restore() -> void:
	await host._server_battle().request_state_restore()

func _start_server_event_stream_if_needed() -> void:
	if not _is_server_account_session():
		_stop_server_event_stream()
		return
	if server_event_socket != null:
		var state = server_event_socket.get_ready_state()
		if state == WebSocketPeer.STATE_CONNECTING or state == WebSocketPeer.STATE_OPEN:
			return
	if server_event_reconnect_remaining > 0.0 and (server_event_state == "closed" or server_event_state == "error"):
		return
	server_event_socket = WebSocketPeer.new()
	var err = server_event_socket.connect_to_url(ServerAuthClientModel.event_stream_url(_server_profile_base_url(), _server_profile_token(), server_event_last_seq))
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
	var state = server_event_socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		server_event_state = "open"
		var packet_count = 0
		while server_event_socket.get_available_packet_count() > 0 and packet_count < SERVER_EVENT_MAX_PACKETS_PER_FRAME:
			packet_count += 1
			var parsed = ServerAuthClientModel.parse_event_stream_message(server_event_socket.get_packet())
			if bool(parsed.get("ok", false)):
				_handle_server_event(parsed.get("event", {}) as Dictionary if parsed.get("event", {}) is Dictionary else {})
	elif state == WebSocketPeer.STATE_CLOSED:
		server_event_socket = null
		server_event_state = "closed"
		server_event_reconnect_remaining = SERVER_EVENT_RECONNECT_SECONDS

func _handle_server_event(event: Dictionary) -> void:
	var event_type = str(event.get("type", "")).strip_edges()
	if event_type == "":
		return
	var event_seq = int(event.get("eventSeq", 0))
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
	var message = event.get("message", {}) as Dictionary if event.get("message", {}) is Dictionary else {}
	var channel = str(event.get("channel", message.get("channel", CHAT_CHANNEL_NEARBY)))
	if message.is_empty() or not _chat_channel_is_valid(channel):
		return
	var message_id = str(message.get("messageId", "")).strip_edges()
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
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	if current_username == "":
		return false
	return str(invite.get("toUsername", "")).strip_edges() == current_username

func _battle_invite_is_for_current(invite: Dictionary) -> bool:
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	if current_username == "":
		return false
	return str(invite.get("toUsername", "")).strip_edges() == current_username

func _battle_invite_is_from_current(invite: Dictionary) -> bool:
	var current_username = str(current_account_session.get("username", "")).strip_edges()
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
	var was_party_member = _current_player_is_party_member()
	if event.has("party"):
		party_current_state["party"] = event.get("party", null)
	if not party_current_state.has("incomingInvites"):
		party_current_state["incomingInvites"] = []
	if not party_current_state.has("maxMembers"):
		party_current_state["maxMembers"] = 5
	if event.has("invite"):
		var invite = event.get("invite", {}) as Dictionary if event.get("invite", {}) is Dictionary else {}
		if not invite.is_empty():
			var invites: Array = party_current_state.get("incomingInvites", []) if party_current_state.get("incomingInvites", []) is Array else []
			var invite_id = str(invite.get("inviteId", ""))
			if str(invite.get("status", "")) == "pending" and _party_invite_is_for_current(invite):
				var exists = false
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
	host._update_hud_text(true)

func _apply_battle_event(event: Dictionary) -> void:
	host._server_battle().apply_battle_event(event)

func _apply_server_battle_room_state(room: Dictionary, force_start: bool = false) -> bool:
	return host._server_battle().apply_room_state(room, force_start)

func _apply_server_battle_room_closed(room: Dictionary) -> void:
	host._server_battle().apply_room_closed(room)

func _server_battle_closed_room_has_unplayed_turn(room: Dictionary) -> bool:
	if room.is_empty() or not _battle_is_server_authority():
		return false
	if str(room.get("status", "")).strip_edges() != "closed":
		return false
	var room_id = str(room.get("roomId", "")).strip_edges()
	if room_id == "" or room_id != str(battle_state.get("serverRoomId", "")).strip_edges():
		return false
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var last_event_list = battle.get("lastEventList", {}) as Dictionary if battle.get("lastEventList", {}) is Dictionary else {}
	if str(last_event_list.get("kind", "")).strip_edges() != "battle_event_list":
		return false
	var turn_key = _server_battle_turn_key(last_event_list)
	if turn_key == "":
		return false
	if _server_battle_event_playback_active():
		return true
	return turn_key != server_battle_last_playback_turn_key

func _server_battle_closed_room_from_state() -> Dictionary:
	if not server_battle_pending_closed_room.is_empty():
		return server_battle_pending_closed_room.duplicate(true)
	var state_room = battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	if str(state_room.get("status", "")).strip_edges() == "closed":
		return state_room.duplicate(true)
	var room = server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	var room_id = str(room.get("roomId", "")).strip_edges()
	var active_room_id = str(battle_state.get("serverRoomId", "")).strip_edges()
	if str(room.get("status", "")).strip_edges() == "closed" and (active_room_id == "" or active_room_id == room_id):
		return room.duplicate(true)
	var last_event_list = battle_state.get("lastServerEventList", {}) as Dictionary if battle_state.get("lastServerEventList", {}) is Dictionary else {}
	var result = last_event_list.get("result", {}) as Dictionary if last_event_list.get("result", {}) is Dictionary else {}
	if result.is_empty():
		return {}
	var synthesized = state_room.duplicate(true) if not state_room.is_empty() else room.duplicate(true)
	if synthesized.is_empty():
		synthesized = {"roomId": active_room_id}
	synthesized["status"] = "closed"
	synthesized["closeReason"] = str(result.get("reason", synthesized.get("closeReason", "battle_result")))
	var battle = synthesized.get("battle", {}) as Dictionary if synthesized.get("battle", {}) is Dictionary else {}
	battle["result"] = result.duplicate(true)
	synthesized["battle"] = battle
	return synthesized

func _finish_server_battle_from_closed_room(room: Dictionary = {}) -> Dictionary:
	var closed_room = room.duplicate(true)
	if closed_room.is_empty():
		closed_room = _server_battle_closed_room_from_state()
	var is_party_pve = _server_battle_room_is_party_pve(closed_room)
	var is_manor_war = _server_battle_room_is_manor_war(closed_room)
	var message = _server_party_pve_result_message(closed_room) if is_party_pve else (_server_manor_war_result_message(closed_room) if is_manor_war else _server_battle_result_message(closed_room))
	if message == "":
		message = "战斗已结束。" if is_party_pve else ("庄园战已结束。" if is_manor_war else "切磋已结束。")
	var log_message = _server_party_pve_result_log_message(closed_room, message) if is_party_pve else message
	var result_key = _server_battle_result_key(closed_room)
	var hang_result = _apply_server_battle_hang_writeback(closed_room)
	server_battle_pending_closed_room.clear()
	server_battle_command_request_active = false
	server_battle_state_poll_request_active = false
	server_battle_waiting_poll_elapsed = 0.0
	server_battle_room_restore_poll_elapsed = 0.0
	server_battle_last_playback_turn_key = ""
	server_battle_state["room"] = null
	_end_battle(true)
	var returned_to_record_point = _apply_server_battle_return(closed_room)
	if returned_to_record_point:
		log_message = _server_battle_return_message(log_message)
		message = _server_battle_return_message(message)
	var writeback_warning_lines = _server_battle_writeback_warning_lines_for_current_account(closed_room)
	if not writeback_warning_lines.is_empty():
		log_message = _append_unique_message_lines(log_message, writeback_warning_lines)
		message = _append_unique_message_lines(message, writeback_warning_lines)
	_set_world_log_message(log_message)
	if not is_party_pve:
		_open_battle_result_panel(closed_room, result_key, message, "庄园战" if is_manor_war else "切磋")
	else:
		_open_battle_result_panel(closed_room, result_key, log_message, "战斗", false)
	_queue_server_profile_pull()
	if bool(hang_result.get("routeToHealer", false)):
		host.call_deferred("_route_to_hang_healer")
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
	host._sync_battle_buttons()
	host._layout_hud()

func _server_battle_result_payload(room: Dictionary) -> Dictionary:
	var result = room.get("result", {}) as Dictionary if room.get("result", {}) is Dictionary else {}
	if not result.is_empty():
		return result
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	return battle.get("result", {}) as Dictionary if battle.get("result", {}) is Dictionary else {}

func _server_battle_room_mode(room: Dictionary) -> String:
	var mode = str(room.get("mode", "")).strip_edges()
	if mode != "":
		return mode
	var state_room = battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	return str(state_room.get("mode", battle_state.get("serverRoomMode", ""))).strip_edges()

func _server_battle_room_is_party_pve(room: Dictionary) -> bool:
	return _server_battle_room_mode(room) == "party_pve"

func _server_battle_room_is_manor_war(room: Dictionary) -> bool:
	return _server_battle_room_mode(room) == "manor_war"

func _server_battle_room_participant_side(room: Dictionary, account_id: String) -> String:
	var normalized_account_id = account_id.strip_edges()
	if normalized_account_id == "":
		return ""
	var participants: Array = room.get("participants", []) if room.get("participants", []) is Array else []
	for value in participants:
		if not (value is Dictionary):
			continue
		var participant = value as Dictionary
		if str(participant.get("accountId", "")).strip_edges() != normalized_account_id:
			continue
		var side = str(participant.get("side", "")).strip_edges()
		if side == "opponent" or side == "defender":
			return "defender"
		if side == "challenger":
			return "challenger"
	return ""

func _current_server_battle_is_party_pve() -> bool:
	var state_room = battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	if _server_battle_room_is_party_pve(state_room):
		return true
	var server_room = server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if _server_battle_room_is_party_pve(server_room):
		return true
	return str(battle_state.get("serverRoomMode", "")).strip_edges() == "party_pve"

func _server_battle_stale_room_message() -> String:
	var state_room = battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	var server_room = server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if _server_battle_room_is_manor_war(state_room) or _server_battle_room_is_manor_war(server_room):
		return "庄园战房间已失效，已回到地图。"
	return "队伍战斗已结束，已回到地图。" if _current_server_battle_is_party_pve() else "切磋房间已失效，已回到地图。"

func _server_battle_result_key(room: Dictionary) -> String:
	var result = _server_battle_result_payload(room)
	var winner_account_id = str(result.get("winnerAccountId", "")).strip_edges()
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if _server_battle_room_is_manor_war(room) and self_account_id != "":
		if _server_battle_result_loser_contains_self(result):
			return "defeat"
		var self_side = _server_battle_room_participant_side(room, self_account_id)
		var winner_side = _server_battle_room_participant_side(room, winner_account_id)
		if self_side != "" and winner_side != "":
			return "victory" if self_side == winner_side else "defeat"
	if winner_account_id != "" and self_account_id != "":
		return "victory" if winner_account_id == self_account_id else "defeat"
	var reason = str(result.get("reason", room.get("closeReason", ""))).strip_edges()
	if reason == "leave" and str(result.get("closedByAccountId", room.get("closedByAccountId", ""))).strip_edges() == self_account_id:
		return "defeat"
	if reason == "timeout" and _server_battle_result_loser_contains_self(result):
		return "timeout"
	return "server"

func _server_battle_result_loser_contains_self(result: Dictionary) -> bool:
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return false
	var loser_ids: Array = result.get("loserAccountIds", []) if result.get("loserAccountIds", []) is Array else []
	for value in loser_ids:
		if str(value) == self_account_id:
			return true
	return false

func _server_battle_result_message(room: Dictionary) -> String:
	var result = _server_battle_result_payload(room)
	var reason = str(result.get("reason", room.get("closeReason", ""))).strip_edges()
	var winner_account_id = str(result.get("winnerAccountId", "")).strip_edges()
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	var closed_by_account_id = str(result.get("closedByAccountId", room.get("closedByAccountId", ""))).strip_edges()
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

func _server_manor_war_result_message(room: Dictionary) -> String:
	var result = _server_battle_result_payload(room)
	var reason = str(result.get("reason", room.get("closeReason", ""))).strip_edges()
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	var closed_by_account_id = str(result.get("closedByAccountId", room.get("closedByAccountId", ""))).strip_edges()
	var result_key = _server_battle_result_key(room)
	if reason == "forfeit" or reason == "leave":
		if self_account_id != "" and closed_by_account_id == self_account_id:
			return "你已离开庄园战，本场落败。"
		return "对方退出，庄园战获胜。" if result_key == "victory" else "庄园战已结束。"
	if reason == "timeout":
		return "庄园战超时获胜。" if result_key == "victory" else "庄园战超时结束。"
	if result_key == "victory":
		var winner_family_name = str(result.get("winnerFamilyName", "")).strip_edges()
		return "庄园战胜利。%s已占领庄园。" % winner_family_name if winner_family_name != "" else "庄园战胜利。"
	if result_key == "defeat":
		return "庄园战失败。"
	return "庄园战已结束。"

func _server_party_pve_result_message(room: Dictionary) -> String:
	var result = _server_battle_result_payload(room)
	var reason = str(result.get("reason", room.get("closeReason", ""))).strip_edges()
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
	var base_text = base_message.strip_edges()
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
	var profile_entry = _server_battle_profile_writeback_for_current_account(room)
	var exp = profile_entry.get("exp", {}) as Dictionary if profile_entry.get("exp", {}) is Dictionary else {}
	if exp.is_empty():
		return lines
	var fallback_amount = maxi(0, int(exp.get("amount", 0)))
	var player = exp.get("player", {}) as Dictionary if exp.get("player", {}) is Dictionary else {}
	if not player.is_empty():
		var player_line = _server_battle_exp_log_line("人物", player, "人物", fallback_amount)
		if player_line != "":
			lines.append(player_line)
	var ride_pets: Array = exp.get("ridePets", []) if exp.get("ridePets", []) is Array else []
	for value in ride_pets:
		if value is Dictionary:
			var ride_line = _server_battle_exp_log_line("骑宠", value as Dictionary, "骑宠", fallback_amount)
			if ride_line != "":
				lines.append(ride_line)
	var pets: Array = exp.get("pets", []) if exp.get("pets", []) is Array else []
	for value in pets:
		if value is Dictionary:
			var pet_line = _server_battle_exp_log_line("宠物", value as Dictionary, "宠物", fallback_amount)
			if pet_line != "":
				lines.append(pet_line)
	var partners: Array = exp.get("trainingPartners", []) if exp.get("trainingPartners", []) is Array else []
	for value in partners:
		if not (value is Dictionary):
			continue
		var partner = value as Dictionary
		var partner_player = partner.get("player", {}) as Dictionary if partner.get("player", {}) is Dictionary else {}
		if not partner_player.is_empty():
			var partner_line = _server_battle_exp_log_line("伙伴", partner_player, "伙伴", fallback_amount)
			if partner_line != "":
				lines.append(partner_line)
		var partner_pet = partner.get("pet", {}) as Dictionary if partner.get("pet", {}) is Dictionary else {}
		if not partner_pet.is_empty():
			var partner_pet_line = _server_battle_exp_log_line("伙伴宠", partner_pet, "伙伴宠", fallback_amount)
			if partner_pet_line != "":
				lines.append(partner_pet_line)
	return lines

func _server_battle_exp_log_line(role_name: String, entry: Dictionary, fallback_name: String, fallback_amount: int = -1) -> String:
	var amount = maxi(0, int(entry.get("amount", fallback_amount)))
	var display_name = _server_battle_exp_entry_name(entry, fallback_name)
	if amount <= 0:
		var kill_count = maxi(0, int(entry.get("killCount", 0)))
		if kill_count <= 0:
			return "%s %s 获得 0 点经验（未击倒怪物）。" % [role_name, display_name]
		return "%s %s 获得 0 点经验。" % [role_name, display_name]
	var base_amount = amount
	if entry.has("baseAmount"):
		base_amount = maxi(0, int(entry.get("baseAmount", amount)))
	elif entry.has("scaledAmount"):
		base_amount = maxi(0, int(entry.get("scaledAmount", amount)))
	if base_amount <= 0:
		base_amount = amount
	var bonus_percent = maxi(0, int(entry.get("partyBonusPercent", 0)))
	if bonus_percent <= 0:
		bonus_percent = maxi(0, int(round(float(entry.get("partyBonusRate", 0.0)) * 100.0)))
	if bonus_percent > 0:
		return "%s %s 获得 %d 点经验（基础%d，组队+%d%%）。" % [role_name, display_name, amount, base_amount, bonus_percent]
	return "%s %s 获得 %d 点经验。" % [role_name, display_name, amount]

func _server_battle_profile_writeback_for_current_account(room: Dictionary) -> Dictionary:
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return {}
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var writeback = battle.get("profileWriteback", {}) as Dictionary if battle.get("profileWriteback", {}) is Dictionary else {}
	var profiles: Array = writeback.get("profiles", []) if writeback.get("profiles", []) is Array else []
	for value in profiles:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == self_account_id:
			return (value as Dictionary).duplicate(true)
	return {}

func _server_battle_profile_writeback_skips_for_current_account(room: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return result
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var writeback = battle.get("profileWriteback", {}) as Dictionary if battle.get("profileWriteback", {}) is Dictionary else {}
	var skipped_profiles: Array = writeback.get("skippedProfiles", []) if writeback.get("skippedProfiles", []) is Array else []
	for value in skipped_profiles:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == self_account_id:
			result.append((value as Dictionary).duplicate(true))
	return result

func _server_battle_writeback_warning_lines_for_current_account(room: Dictionary) -> Array[String]:
	var skipped_profiles = _server_battle_profile_writeback_skips_for_current_account(room)
	var lines: Array[String] = []
	if skipped_profiles.is_empty():
		return lines
	var profile_missing = false
	var pet_missing = false
	var other_skip = false
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
		var text = str(value).strip_edges()
		if text != "" and not lines.has(text):
			lines.append(text)
	for value in extra_lines:
		var text = str(value).strip_edges()
		if text != "" and not lines.has(text):
			lines.append(text)
	return "\n".join(lines)

func _apply_server_battle_hang_writeback(room: Dictionary) -> Dictionary:
	var profile_entry = _server_battle_profile_writeback_for_current_account(room)
	var hang = profile_entry.get("hang", {}) as Dictionary if profile_entry.get("hang", {}) is Dictionary else {}
	if hang.is_empty():
		return {}
	var stopped = bool(hang.get("stopped", false))
	var reason = str(hang.get("lastStopReason", hang.get("stopReason", ""))).strip_edges()
	var pending_resume = bool(hang.get("pendingResume", false))
	if stopped:
		host._set_hang_mode(false)
		if _encounter_stone_active():
			_clear_encounter_stone_effect(false, false)
		var session = PlayerProgressModel.hang_session(player_profile)
		session[HangSettingsModel.SESSION_ENABLED_KEY] = false
		session[HangSettingsModel.SESSION_PENDING_RESUME_KEY] = pending_resume
		session[HangSettingsModel.SESSION_LAST_STOP_REASON_KEY] = reason
		if hang.has("battleCount"):
			session[HangSettingsModel.SESSION_BATTLE_COUNT_KEY] = maxi(0, int(hang.get("battleCount", session.get(HangSettingsModel.SESSION_BATTLE_COUNT_KEY, 0))))
		if hang.has("captureSuccessCount"):
			session[HangSettingsModel.SESSION_CAPTURE_SUCCESS_COUNT_KEY] = maxi(0, int(hang.get("captureSuccessCount", session.get(HangSettingsModel.SESSION_CAPTURE_SUCCESS_COUNT_KEY, 0))))
		player_profile = PlayerProgressModel.with_hang_session(player_profile, session)
	else:
		var current_session = PlayerProgressModel.hang_session(player_profile)
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
	var display_name = str(entry.get("name", entry.get("displayName", ""))).strip_edges()
	if display_name != "":
		return display_name
	return fallback

func _server_battle_reward_log_lines_for_current_account(room: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var profile_entry = _server_battle_profile_writeback_for_current_account(room)
	var rewards = profile_entry.get("rewards", {}) as Dictionary if profile_entry.get("rewards", {}) is Dictionary else {}
	if not rewards.is_empty():
		var stone_coins = maxi(0, int(rewards.get("stoneCoins", 0)))
		if stone_coins > 0:
			lines.append("获得 %d 石币。" % stone_coins)
		var added_text = BackpackModel.item_amounts_text(_server_battle_item_amounts(rewards.get("addedItems", [])))
		if added_text != "":
			lines.append("获得 %s。" % added_text)
		var lost_text = BackpackModel.item_amounts_text(_server_battle_item_amounts(rewards.get("lostItems", [])))
		if lost_text != "":
			lines.append("背包已满，%s 未进入背包。" % lost_text)
	var quests = profile_entry.get("quests", {}) as Dictionary if profile_entry.get("quests", {}) is Dictionary else {}
	var quest_messages: Array = quests.get("messages", []) if quests.get("messages", []) is Array else []
	for value in quest_messages:
		var message = str(value).strip_edges()
		if message != "":
			lines.append(message)
	var hang = profile_entry.get("hang", {}) as Dictionary if profile_entry.get("hang", {}) is Dictionary else {}
	if bool(hang.get("stopped", false)):
		var hang_reason = str(hang.get("lastStopReason", hang.get("stopReason", ""))).strip_edges()
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
		var entry = entry_value as Dictionary
		var item_id = str(entry.get("itemId", "")).strip_edges()
		var count = maxi(0, int(entry.get("count", 0)))
		if item_id != "" and count > 0:
			result.append({
				"itemId": item_id,
				"count": count,
			})
	return result

func _server_party_pve_has_living_enemy(room: Dictionary) -> bool:
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor = value as Dictionary
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
		var opponent_text = _battle_result_opponent_text(room) if include_opponent else ""
		if include_opponent and opponent_text != "":
			details.append("对手：%s" % opponent_text)
		battle_result_detail_label.text = "\n".join(details)
	battle_result_panel.visible = true
	host._layout_hud()

func _close_battle_result_panel(update_layout: bool = true) -> void:
	_hide_control(battle_result_panel, update_layout)

func _battle_result_title(result_key: String, prefix: String = "切磋") -> String:
	var safe_prefix = prefix.strip_edges()
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
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	var participants: Array = room.get("participants", []) if room.get("participants", []) is Array else []
	for value in participants:
		if not (value is Dictionary):
			continue
		var participant = value as Dictionary
		if str(participant.get("accountId", "")).strip_edges() == self_account_id:
			continue
		var display_name = str(participant.get("displayName", "")).strip_edges()
		var username = str(participant.get("username", "")).strip_edges()
		if display_name != "":
			return display_name
		if username != "":
			return username
	var result = _server_battle_result_payload(room)
	var result_participants: Array = result.get("participants", []) if result.get("participants", []) is Array else []
	for value in result_participants:
		if not (value is Dictionary):
			continue
		var participant = value as Dictionary
		if str(participant.get("accountId", "")).strip_edges() == self_account_id:
			continue
		var display_name = str(participant.get("displayName", "")).strip_edges()
		var username = str(participant.get("username", "")).strip_edges()
		if display_name != "":
			return display_name
		if username != "":
			return username
	return ""

func _server_battle_return_for_self(room: Dictionary) -> Dictionary:
	var result = _server_battle_result_payload(room)
	var returns: Array = result.get("battleReturns", []) if result.get("battleReturns", []) is Array else []
	var self_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if self_account_id == "":
		return {}
	for value in returns:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == self_account_id:
			return (value as Dictionary).duplicate(true)
	return {}

func _apply_server_battle_return(room: Dictionary) -> bool:
	var battle_return = _server_battle_return_for_self(room)
	if battle_return.is_empty():
		return false
	var record_point = battle_return.get("recordPoint", {}) as Dictionary if battle_return.get("recordPoint", {}) is Dictionary else {}
	var position = battle_return.get("position", {}) as Dictionary if battle_return.get("position", {}) is Dictionary else {}
	var map_id = str(record_point.get("mapId", position.get("mapId", ""))).strip_edges()
	var spawn_name = str(record_point.get("spawnName", PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME)).strip_edges()
	if map_id == "":
		return false
	if spawn_name == "":
		spawn_name = PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME
	if not host._load_map(map_id, spawn_name):
		return false
	if not position.is_empty():
		_apply_server_step_move_authority_position(position, true)
	return true

func _server_battle_return_message(message: String) -> String:
	var text = message.strip_edges()
	if text.ends_with("。"):
		text = text.substr(0, text.length() - 1)
	if text == "":
		text = "切磋已结束"
	return "%s，已回到记录点。" % text

func _sync_server_battle_room_scene(force_start: bool = false) -> bool:
	return host._server_battle().sync_room_scene(force_start)

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
	var room = server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if str(room.get("status", "")) != "ready":
		return false
	if room_id.strip_edges() == "":
		return str(room.get("roomId", "")).strip_edges() != ""
	return str(room.get("roomId", "")) == room_id

func _battle_turn_resolved(room_id: String = "", round_number: int = 0) -> bool:
	var room = server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	if room_id.strip_edges() != "" and str(room.get("roomId", "")) != room_id:
		return false
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var event_list = battle.get("lastEventList", {}) as Dictionary if battle.get("lastEventList", {}) is Dictionary else {}
	if str(event_list.get("kind", "")) != "battle_event_list":
		return false
	if round_number > 0 and int(event_list.get("round", 0)) != round_number:
		return false
	var events: Array = event_list.get("events", []) if event_list.get("events", []) is Array else []
	return events.size() > 0

func _server_battle_turn_key(event_list: Dictionary) -> String:
	if str(event_list.get("kind", "")) != "battle_event_list":
		return ""
	var room_id = str(event_list.get("roomId", battle_state.get("serverRoomId", ""))).strip_edges()
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
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	if not battle.is_empty():
		battle_state["serverBattle"] = battle.duplicate(true)
		var last_event_list = battle.get("lastEventList", null)
		if last_event_list is Dictionary:
			battle_state["lastServerEventList"] = (last_event_list as Dictionary).duplicate(true)

func _play_server_battle_event_list(event_list: Dictionary) -> bool:
	return host._server_battle().play_event_list(event_list)

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
	online_position_queued_payload.clear()
	online_position_remote_players.clear()
	online_position_draw_signature_cache = ""
	host.queue_redraw()

func _on_online_position_timer_timeout() -> void:
	_request_online_position_snapshot()

func _request_online_position_snapshot(payload: Dictionary = {}) -> void:
	if online_position_http_request == null:
		return
	if not _is_server_account_session() or player == null or map_data.is_empty():
		online_position_queued_payload.clear()
		return
	var next_payload := payload.duplicate(true) if not payload.is_empty() else _current_online_position_payload()
	if online_position_request_pending:
		online_position_queued_payload = next_payload
		return
	_send_online_position_snapshot(next_payload)

func _send_online_position_snapshot(payload: Dictionary) -> void:
	var spec = ServerAuthClientModel.player_position_update_request(
		_server_profile_base_url(),
		_server_profile_token(),
		payload
	)
	online_position_request_pending = true
	online_position_queued_payload.clear()
	var err = online_position_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_POST)),
		str(spec.get("body", ""))
	)
	if err != OK:
		online_position_request_pending = false
		online_position_queued_payload = payload.duplicate(true)

func _current_online_position_payload() -> Dictionary:
	var use_server_step_cell = _server_step_move_should_report_authority_cell()
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
	var parsed = ServerAuthClientModel.parse_player_position_update_response(response_code, body)
	if not bool(parsed.get("ok", false)):
		_handle_session_invalid_response(parsed)
		return
	var own_position = parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if _should_apply_online_self_position(own_position):
		_apply_server_step_move_authority_position(own_position, true)
	elif _server_step_move_should_report_authority_cell():
		_apply_server_step_move_authority_position(own_position)
	_apply_online_position_players(parsed.get("players", []))
	if not online_position_queued_payload.is_empty():
		var queued_payload: Dictionary = online_position_queued_payload.duplicate(true)
		online_position_queued_payload.clear()
		call_deferred("_request_online_position_snapshot", queued_payload)

func _apply_online_position_players(players) -> void:
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	var current_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	var next_remote_players: Array[Dictionary] = []
	if players is Array:
		for value in players:
			if not (value is Dictionary):
				continue
			var online_player = (value as Dictionary).duplicate(true)
			var username = str(online_player.get("username", "")).strip_edges()
			var account_id = str(online_player.get("accountId", "")).strip_edges()
			if (current_username != "" and username == current_username) or (current_account_id != "" and account_id == current_account_id):
				var self_position = online_player.get("position", {}) as Dictionary if online_player.get("position", {}) is Dictionary else {}
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
	var next_signature = _online_position_draw_signature(next_remote_players)
	if next_signature != online_position_draw_signature_cache:
		online_position_draw_signature_cache = next_signature
		host.queue_redraw()

func _online_position_draw_signature(players: Array[Dictionary]) -> String:
	var parts: Array[String] = []
	for value in players:
		var position = value.get("position", {}) as Dictionary if value.get("position", {}) is Dictionary else {}
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
	host._server_sync().request_profile_pull()

func _queue_server_profile_pull() -> void:
	host._server_sync().queue_profile_pull()

func _queue_server_profile_upload() -> void:
	host._server_sync().queue_profile_upload()

func _start_server_profile_sync_request(kind: String, spec: Dictionary) -> void:
	host._server_sync().start_server_profile_sync_request(kind, spec)

func _on_profile_sync_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	host._server_sync().on_profile_sync_http_request_completed(result, response_code, _headers, body)

func _apply_server_profile_pull_result(parsed: Dictionary, allow_defer: bool = true) -> void:
	host._server_sync().apply_server_profile_pull_result(parsed, allow_defer)

func _apply_server_profile_upload_result(parsed: Dictionary) -> void:
	host._server_sync().apply_server_profile_upload_result(parsed)

func _continue_pending_server_profile_sync() -> void:
	host._server_sync().continue_pending_server_profile_sync()

func _server_profile_pull_should_wait_for_profile_panel() -> bool:
	return host._server_sync().server_profile_pull_should_wait_for_profile_panel()

func _defer_server_profile_pull_result(parsed: Dictionary) -> void:
	host._server_sync().defer_server_profile_pull_result(parsed)

func _apply_deferred_server_profile_pull_if_idle() -> void:
	host._server_sync().apply_deferred_server_profile_pull_if_idle()

func _update_deferred_server_profile_pull(delta: float) -> void:
	host._server_sync().update_deferred_server_profile_pull(delta)

func _apply_server_profile_summary(summary: Dictionary) -> void:
	host._server_sync().apply_server_profile_summary(summary)

func _apply_server_profile_payload(parsed: Dictionary) -> bool:
	return host._server_sync().apply_server_profile_payload(parsed)

func _apply_auth_profile_metadata_fields(display_name: String) -> void:
	var name = display_name.strip_edges()
	if name == "":
		name = str(current_account_session.get("username", "玩家"))
	var player = player_profile.get("player", {}) as Dictionary if player_profile.get("player", {}) is Dictionary else {}
	var current_name = str(player.get("name", player_profile.get("playerName", ""))).strip_edges()
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
	var previous_server_token = _server_profile_token()
	var next_server_token = str(session.get("serverSessionToken", "")).strip_edges()
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
	var migrated = false
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
	host._mark_progress_ui_caches_dirty()
	host._update_hud_text(true)
	host._layout_hud()
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
		host._request_profile_save()

func _can_use_gm_tools() -> bool:
	if host._release_entrypoints_locked():
		return false
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
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	_close_numeric_workbench_panel(false)
	if account_panel != null:
		account_panel.visible = true
	_refresh_account_panel()
	host._layout_hud()

func _close_account_panel(update_layout: bool = true) -> void:
	_hide_control(account_panel, update_layout)

func _refresh_account_panel() -> void:
	if account_info_label == null:
		return
	var display_name = str(current_account_session.get("displayName", "玩家")).strip_edges()
	var username = str(current_account_session.get("username", "")).strip_edges()
	var source = str(current_account_session.get("authSource", ServerAuthClientModel.SOURCE_SERVER))
	var source_label = "服务器" if AUTH_SERVER_ONLY or source == ServerAuthClientModel.SOURCE_SERVER else "本地"
	if display_name == "":
		display_name = username if username != "" else "玩家"
	var profile_line = "档案：等待服务器绑定"
	if AUTH_SERVER_ONLY or source == ServerAuthClientModel.SOURCE_SERVER:
		var summary = current_account_session.get("serverProfileSummary", {}) as Dictionary if current_account_session.get("serverProfileSummary", {}) is Dictionary else {}
		var player_id = str(summary.get("playerId", "")).strip_edges()
		var revision = int(summary.get("profileRevision", 0))
		var sync_label = "同步中" if server_profile_sync_state == "loading" or server_profile_sync_state == "uploading" else ("冲突" if server_profile_sync_state == "conflict" else "已连接")
		profile_line = "档案：%s r%d %s" % [player_id if player_id != "" else "服务器绑定", revision, sync_label]
	account_info_label.text = "当前角色：%s\n账号：%s\n通道：%s\n%s\n切换账号前会保存本地缓存，进度以服务器为准。" % [
		display_name,
		username if username != "" else "-",
		source_label,
		profile_line,
	]

func _switch_account_to_login() -> void:
	if profile_save_enabled:
		host._flush_profile_save_now()
		host._save_player_profile_now()
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
	host._mark_progress_ui_caches_dirty()
	host._update_hud_text(true)
	_open_auth_panel(false)
	host._layout_hud()

func _handle_server_session_expired(message: String = "") -> void:
	var username := str(current_account_session.get("username", "")).strip_edges()
	var text := message.strip_edges()
	if text == "":
		text = "登录已过期，请重新登录。"
	_switch_account_to_login()
	if auth_username_input != null and username != "":
		auth_username_input.text = username
	if auth_message_label != null:
		auth_message_label.text = text
	_set_world_log_message(text)

func _add_battle_buttons(specs: Array) -> void:
	for value in specs:
		var spec = value as Dictionary
		var button = Button.new()
		var command_id = str(spec.get("id", ""))
		button.text = str(spec.get("label", command_id))
		button.custom_minimum_size = host._battle_command_button_size()
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.clip_text = true
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.add_theme_stylebox_override("normal", _battle_command_button_style(Color(0.07, 0.09, 0.09, 0.54)))
		button.add_theme_stylebox_override("hover", _battle_command_button_style(Color(0.12, 0.16, 0.16, 0.70)))
		button.add_theme_stylebox_override("pressed", _battle_command_button_style(Color(0.16, 0.20, 0.19, 0.76)))
		button.add_theme_stylebox_override("disabled", _battle_command_button_style(Color(0.05, 0.06, 0.06, 0.30)))
		button.pressed.connect(host._on_battle_command_pressed.bind(command_id))
		battle_command_button_grid.add_child(button)
		battle_command_buttons[command_id] = button
	host._sync_battle_command_layout()

func _update_battle_debug_window(_force: bool = false) -> void:
	# 兼容旧参数名；当前旁路验证只写 .run/battle_trace/latest.jsonl，不打开游戏窗口。
	return

func _battle_trace_enabled() -> bool:
	return battle_stat_test or battle_status_test or battle_status_skill_test or battle_status_hit_test or battle_status_rule_test or auto_battle_stat_formula_check or auto_battle_event_ledger_check or auto_battle_status_check or auto_battle_status_skill_check or auto_battle_status_hit_check or auto_battle_status_rule_check or auto_battle_passive_hover_check or battle_debug_window_enabled

func _reset_battle_trace_file() -> void:
	battle_trace_path = ""
	if not _battle_trace_enabled() or battle_state.is_empty():
		return
	var trace_dir = ProjectSettings.globalize_path("res://../../.run/battle_trace")
	DirAccess.make_dir_recursive_absolute(trace_dir)
	battle_trace_path = trace_dir + "/latest.jsonl"
	var file = FileAccess.open(battle_trace_path, FileAccess.WRITE)
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
	var file = FileAccess.open(battle_trace_path, FileAccess.READ_WRITE)
	if file == null:
		return
	file.seek_end()
	file.store_line(JSON.stringify(entry))
	file.close()

func _battle_trace_actor_snapshots() -> Array[Dictionary]:
	var snapshots: Array[Dictionary] = []
	for value in battle_state.get("actors", []):
		var actor = value as Dictionary
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
	var font = SystemFont.new()
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
	var theme = Theme.new()
	var font = _build_cjk_system_font()
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
	var panel = PanelContainer.new()
	panel.name = node_name
	panel.add_theme_stylebox_override("panel", _panel_style())
	return panel

func _hide_control(control: Control, update_layout: bool = true) -> bool:
	if control == null or not control.visible:
		return false
	control.visible = false
	if update_layout and hud_root != null:
		host._layout_hud()
	return true

func _panel_style() -> StyleBoxFlat:
	var style = StyleBoxFlat.new()
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
	var style = _panel_style()
	style.bg_color = Color(0.10, 0.14, 0.14, 0.96)
	style.border_color = Color(0.84, 0.62, 0.32, 0.96)
	return style

func _battle_command_panel_style() -> StyleBoxFlat:
	var style = _panel_style()
	style.bg_color = Color(0.10, 0.14, 0.14, 0.68)
	style.border_color = Color(0.72, 0.56, 0.32, 0.82)
	return style

func _battle_passive_panel_style() -> StyleBoxFlat:
	var style = _panel_style()
	style.bg_color = Color(0.10, 0.14, 0.14, 0.50)
	style.border_color = Color(0.72, 0.56, 0.32, 0.45)
	style.set_border_width_all(1)
	return style

func _battle_indicator_panel_style() -> StyleBoxFlat:
	var style = _panel_style()
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
	var style = StyleBoxFlat.new()
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
	var style = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0.94, 0.78, 0.42, 0.95)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	return style

func _set_click_move_target(screen_point: Vector2) -> void:
	if host._is_ui_point(screen_point):
		return
	if encounter_active or battle_active:
		return

	if hang_mode_active:
		host._set_hang_mode(false)
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
	var screen_point = pending_click_screen_point
	has_pending_click_screen_point = false
	_resolve_click_screen_point(screen_point)

func _resolve_click_screen_point(screen_point: Vector2) -> void:
	click_move_screen_resolve_count += 1
	var world_point = host._screen_to_world(screen_point)
	var ground_drop = _find_ground_pet_drop_at_world_point(world_point)
	if not ground_drop.is_empty():
		_set_interaction_target(_ground_pet_interaction_for_drop(ground_drop))
		return
	var interaction = InteractionModel.find_at_world_point(map_data, world_point)
	if not interaction.is_empty():
		_set_interaction_target(interaction)
		return

	_clear_pending_interaction()
	host._close_dialog()
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
	var clicked_cell = IsoMapModel.world_to_grid(map_data, world_point)
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
	var goal_cell = pending_click_move_goal_cell
	var marker_cell = pending_click_move_marker_cell
	var marker_point = pending_click_move_marker_point
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
	var had_authority = server_step_move_authority_valid
	var start_cell = _server_step_move_current_cell()
	var safe_goal_cell = IsoMapModel.nearest_walkable_cell(map_data, goal_cell)
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
		var seeded = await _seed_server_step_move_position(plan_id)
		if not seeded:
			return
	var from_cell = server_step_move_authority_cell
	if server_step_move_path_cells[server_step_move_path_index] != from_cell:
		if not _rebuild_server_step_move_path_from_authority():
			return
	var to_cell = server_step_move_path_cells[server_step_move_path_index + 1]
	server_step_move_request_pending = true
	server_step_move_request_count += 1
	var response = await host._auto_http_request_spec(ServerAuthClientModel.movement_step_request(
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
	var parsed = ServerAuthClientModel.parse_movement_step_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		if _handle_session_invalid_response(parsed):
			_cancel_server_step_move()
			return
		_handle_server_step_move_failure(parsed)
		return
	var position = parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if not _apply_server_step_move_authority_position(position):
		_handle_server_step_move_failure({"code": "movement_position_missing", "message": "服务器位置缺失。"})
		return
	_apply_online_position_players(parsed.get("players", []))
	server_step_move_ack_count += 1
	server_step_move_last_error_code = ""
	var ack_cell = server_step_move_authority_cell
	server_step_move_path_index = mini(server_step_move_path_index + 1, server_step_move_path_cells.size() - 1)
	server_step_move_visual_target_cell = ack_cell
	server_step_move_waiting_for_visual = true
	if player != null:
		var step_points: Array[Vector2] = [IsoMapModel.grid_to_world(map_data, ack_cell)]
		player.set_path(step_points)
	_sync_server_step_current_path_cells()
	host.queue_redraw()

func _seed_server_step_move_position(plan_id: int) -> bool:
	if not _is_server_account_session() or player == null or map_data.is_empty():
		_cancel_server_step_move()
		return false
	var cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	var response = await host._auto_http_request_spec(ServerAuthClientModel.player_position_update_request(
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
	var parsed = ServerAuthClientModel.parse_player_position_update_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		if _handle_session_invalid_response(parsed):
			_cancel_server_step_move()
			return false
		server_step_move_last_error_code = str(parsed.get("code", "movement_seed_failed"))
		_cancel_server_step_move()
		return false
	var position = parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	_apply_online_position_players(parsed.get("players", []))
	if not _apply_server_step_move_authority_position(position):
		server_step_move_last_error_code = "movement_seed_missing_position"
		_cancel_server_step_move()
		return false
	return _rebuild_server_step_move_path_from_authority()

func _handle_server_step_move_failure(parsed: Dictionary) -> void:
	server_step_move_last_error_code = str(parsed.get("code", "movement_step_failed"))
	var response = parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	var movement = parsed.get("movement", {}) as Dictionary if parsed.get("movement", {}) is Dictionary else {}
	var position = parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if position.is_empty():
		position = response.get("position", {}) as Dictionary if response.get("position", {}) is Dictionary else {}
	var synced_position = false
	if not position.is_empty():
		synced_position = _apply_server_step_move_authority_position(position, true)
	var retryable = bool(movement.get("retryable", server_step_move_last_error_code == "movement_origin_mismatch"))
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
	host.queue_redraw()

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
	var cell = server_step_move_authority_cell
	var response = await host._auto_http_request_spec(ServerAuthClientModel.player_position_update_request(
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
	var parsed = ServerAuthClientModel.parse_player_position_update_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		_apply_server_step_move_authority_position(parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {})
		_apply_online_position_players(parsed.get("players", []))
	else:
		_handle_session_invalid_response(parsed)

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
	var map_id = str(position.get("mapId", current_map_id))
	var authority = str(position.get("authority", "")).strip_edges()
	var changed_map = map_id != current_map_id
	if changed_map:
		if authority != "party_follow" or not snap_player_to_authority:
			return false
		if not host._load_map(map_id):
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
	var target_cell = IsoMapModel.nearest_walkable_cell(map_data, authority_cell)
	var target_point = IsoMapModel.grid_to_world(map_data, target_cell)
	var start_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	if start_cell == target_cell or player.global_position.distance_to(target_point) <= 4.0:
		player.global_position = target_point
		player.clear_move_target()
		current_path_cells.clear()
		current_path_is_direct = false
		has_target_marker = false
		has_target_cell = false
		_clear_pending_click_move_target()
		host.queue_redraw()
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
		host.queue_redraw()
		return
	player.set_path(path_points)
	current_path_cells = path_cells
	current_path_is_direct = IsoMapModel.is_direct_path_clear(map_data, start_cell, target_cell)
	has_target_marker = false
	has_target_cell = false
	_clear_pending_click_move_target()
	host.queue_redraw()

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
	var message = str(parsed.get("message", ""))
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
	var delta = to_cell - from_cell
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
	var start_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	var safe_goal_cell = IsoMapModel.nearest_walkable_cell(map_data, goal_cell)
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
	var is_direct_path = IsoMapModel.is_direct_path_clear(map_data, start_cell, safe_goal_cell)
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
	host._set_hang_mode(false)
	host._close_dialog()
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
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	pending_interaction_approach_cell = InteractionModel.interaction_goal_cell_for(map_data, player_cell, item)
	var marker_point = InteractionModel.marker_world_position(map_data, item)
	var moved = _set_move_target_cell(pending_interaction_approach_cell, marker_point, InteractionModel.cell_for(item))
	if not moved:
		_complete_interaction(item)

func _clear_pending_interaction() -> void:
	var had_pending = has_pending_interaction or not pending_interaction.is_empty() or pending_interaction_approach_cell != Vector2i.ZERO
	has_pending_interaction = false
	pending_interaction.clear()
	pending_interaction_approach_cell = Vector2i.ZERO
	if had_pending:
		_refresh_task_route_button()

func _update_pending_interaction() -> void:
	if not has_pending_interaction or player.is_auto_moving():
		return
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	if player_cell == pending_interaction_approach_cell or player.global_position.distance_to(IsoMapModel.grid_to_world(map_data, pending_interaction_approach_cell)) <= 8.0:
		var item = pending_interaction.duplicate(true)
		_clear_pending_interaction()
		_complete_interaction(item)

func _complete_interaction(item: Dictionary) -> void:
	if str(item.get("kind", "")) == "ground_pet_drop":
		_pickup_ground_pet_drop(str(item.get("dropId", "")))
		return
	if InteractionModel.is_warp(item):
		_transfer_from_warp(item)
		return
	host._open_interaction_dialog(item)

func _transfer_from_warp(item: Dictionary) -> void:
	var to_map = str(item.get("toMap", ""))
	var to_spawn = str(item.get("toSpawn", "default"))
	if to_map == "":
		host._open_interaction_dialog(item)
		return
	host._load_map(to_map, to_spawn)
	if hang_heal_resume_active:
		host.call_deferred("_update_hang_heal_resume_route")

func _start_guardian_battle_from_dialog() -> void:
	if active_dialog_interaction.is_empty():
		return
	var interaction = active_dialog_interaction.duplicate(true)
	var zone = _guardian_zone_for_interaction(interaction)
	if zone.is_empty():
		_set_world_log_message("暂时无法挑战%s。" % str(interaction.get("name", "守护兽")))
		host._update_dialog_text()
		return
	var route = _guardian_battle_route_for_current_session()
	if route == "server_member_block":
		_set_world_log_message("队伍挑战由队长发起。")
		host._update_dialog_text()
		return
	if route == "login_required":
		_set_world_log_message("请先登录服务器账号。")
		host._update_dialog_text()
		return
	host._close_dialog()
	if player != null:
		player.clear_move_target()
	host._clear_navigation_state()
	active_encounter_zone.clear()
	encounter_active = false
	var source_name = str(interaction.get("name", "守护兽")).strip_edges()
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
	var enemy_count = EncounterModel.enemy_count(zone, _encounter_enemy_count_fallback())
	var selected_zone = EncounterModel.zone_with_selected_wild_pet(zone, encounter_rng, enemy_count)
	var guardian_state = _battle_state_for_encounter_zone(selected_zone)
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
	var zone_id = str(item.get("encounterZoneId", "")).strip_edges()
	if zone_id != "":
		var zone = host._encounter_zone_by_id(zone_id)
		if not zone.is_empty():
			return zone
	var group_id = str(item.get("encounterGroupId", "")).strip_edges()
	if group_id != "":
		var group_zone = host._encounter_zone_for_group(map_data, group_id)
		if not group_zone.is_empty():
			return group_zone
	if item.has("fixedWildPets") or item.has("wildPetPool") or item.has("wildPetPoolSource"):
		return item.duplicate(true)
	return {}

func _update_encounter_zone_check() -> void:
	if player == null or map_data.is_empty() or encounter_active or battle_active or server_party_encounter_request_pending or host._dialog_is_open() or has_pending_interaction or host._world_menu_is_open():
		return
	if encounter_grace_remaining > 0.0:
		return
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	if player_cell == last_checked_player_cell:
		return
	last_checked_player_cell = player_cell
	var zone = EncounterModel.zone_for_cell(map_data, player_cell)
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
	host._clear_navigation_state()
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
	var enemy_count = EncounterModel.enemy_count(active_encounter_zone, _encounter_enemy_count_fallback())
	server_party_encounter_request_pending = true
	_set_world_log_message(pending_message)
	var response = await host._auto_http_request_spec(ServerAuthClientModel.party_battle_encounter_request(
		_server_profile_base_url(),
		_server_profile_token(),
		active_encounter_zone,
		enemy_count
	))
	server_party_encounter_request_pending = false
	if battle_active:
		active_encounter_zone.clear()
		return
	var parsed = ServerAuthClientModel.parse_battle_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		var room = parsed.get("room", null)
		active_encounter_zone.clear()
		if room is Dictionary:
			var message = success_message.strip_edges()
			if message == "":
				message = str(parsed.get("message", "遭遇了野生宠物。"))
			_set_world_log_message(message)
			_apply_server_battle_room_state(room as Dictionary, true)
		else:
			_set_world_log_message("战斗房间缺失，请重试。")
		return
	active_encounter_zone.clear()
	if _handle_session_invalid_response(parsed):
		return
	_set_world_log_message(str(parsed.get("message", failure_message)))

func _encounter_enemy_count_fallback() -> int:
	return 10 if _effective_battle_team_character_count() > 1 else 1

func _battle_state_for_encounter_zone(zone: Dictionary) -> Dictionary:
	var enemy_count = EncounterModel.enemy_count(zone, _encounter_enemy_count_fallback())
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
	var zone = EncounterModel.zone_with_selected_wild_pet(active_encounter_zone, encounter_rng, _encounter_enemy_count_fallback())
	_start_battle(_battle_state_for_encounter_zone(zone))

func _refresh_battle_target_seed() -> void:
	if battle_state.is_empty():
		return
	var forced_seed = str(battle_state.get("forcedTargetSeed", ""))
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
	host._clear_navigation_state()
	host._close_dialog()
	_close_backpack_panel()
	_close_equipment_panel()
	_close_pet_panel()
	_close_pet_skill_panel()
	_close_codex_panel()
	_close_quest_panel()
	_close_family_panel(false)
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
	host._reset_battle_command_countdown()
	host._set_battle_command_owner("player")
	if player != null:
		player.visible = false
		if player.has_method("set_controls_enabled"):
			player.set_controls_enabled(false)
	if pet != null:
		pet.clear_follow_target()
		pet.visible = false
	if battle_command_panel != null:
		battle_command_panel.visible = host._battle_command_panel_should_be_visible()
	if battle_passive_panel != null:
		battle_passive_panel.visible = false
	if battle_message_panel != null:
		battle_message_panel.visible = true
	if action_bar != null:
		action_bar.visible = false
	_reset_battle_trace_file()
	host._set_battle_message(str(battle_state.get("message", "进入战斗。")))
	host._sync_battle_buttons()
	host._layout_hud()
	_update_battle_debug_window(true)
	host.queue_redraw()

func _end_battle(_restore_world: bool = true) -> void:
	var was_battle_active = battle_active
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
	host._sync_battle_round_timer_labels(true)
	host._set_battle_command_owner("player")
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
	host._sync_hang_button_text()
	if player != null:
		player.visible = true
		if player.has_method("set_controls_enabled"):
			player.set_controls_enabled(true)
	if pet != null:
		pet.visible = pet_follow_enabled
		if pet_follow_enabled:
			pet.set_follow_target(pet.global_position)
	if hud_root != null:
		host._layout_hud()
	if status_label != null:
		host._update_hud_text()
	if _restore_world and was_battle_active:
		_begin_post_battle_encounter_grace()
	_update_battle_debug_window(true)
	host.queue_redraw()

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
	var ended_state = battle_state.duplicate(true)
	var hang_stop_message = _hang_stop_message_for_battle_result(ended_state)
	var player_knocked_away = PlayerProgressModel.battle_actor_knocked_away(ended_state, BattleModel.PLAYER_ACTOR_ID)
	var result = PlayerProgressModel.apply_battle_result(player_profile, ended_state, result_override)
	player_profile = result.get("profile", player_profile)
	var log_lines: Array[String] = []
	for line in result.get("logLines", []):
		log_lines.append(str(line))
	var captured_count = _captured_pet_count_from_battle_result(result)
	var route_to_healer_after_battle = false
	if _hang_activity_active() or bool(PlayerProgressModel.hang_session(player_profile).get(HangSettingsModel.SESSION_ENABLED_KEY, false)):
		player_profile = PlayerProgressModel.record_hang_battle_finished(player_profile, captured_count)
		if PlayerProgressModel.hang_capture_target_reached(player_profile):
			host._stop_hang_activity("", true)
			player_profile = PlayerProgressModel.stop_hang_session(player_profile, "capture_target")
			log_lines.append("捕宠目标已完成，挂机停止。")
	var quest_lines = _quest_messages_for_battle_result(ended_state, result)
	for line in quest_lines:
		log_lines.append(line)
	if hang_stop_message != "":
		var hang_settings = PlayerProgressModel.hang_settings(player_profile)
		var low_hp_action = str(hang_settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP))
		var resume_after_heal = bool(hang_settings.get(HangSettingsModel.RESUME_AFTER_HEAL_KEY, true))
		host._stop_hang_activity("", true)
		if low_hp_action == HangSettingsModel.LOW_HP_ACTION_TOWN_HEAL:
			var session = PlayerProgressModel.hang_session(player_profile)
			session = HangSettingsModel.session_with_pending_resume(session, resume_after_heal)
			player_profile = PlayerProgressModel.with_hang_session(player_profile, session)
			route_to_healer_after_battle = true
		log_lines.append(hang_stop_message)
	if profile_save_enabled:
		host._save_player_profile_now()
	if bool(result.get("returnToRecordPoint", player_knocked_away)):
		_return_player_to_record_point_after_knockaway(log_lines)
	else:
		_end_battle(true)
	_set_world_log_message("\n".join(log_lines))
	if route_to_healer_after_battle:
		host.call_deferred("_route_to_hang_healer")
	return result

func _server_account_local_battle_writeback_blocked() -> bool:
	return _is_server_account_session() and not auth_auto_bypass

func _finish_local_battle_without_profile_writeback_for_server_account() -> Dictionary:
	var message = "服务器账号战斗需由服务器结算，本地战斗结果未写入档案。"
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
	var target = _navigation_target_for_interaction_id("firebud_doctor")
	if target.is_empty():
		_set_world_log_message("暂时找不到村医，挂机已停止。")
		return
	_route_to_quest_target(target)

func _return_player_to_record_point_after_knockaway(log_lines: Array[String]) -> void:
	var returned = _return_player_to_record_point()
	log_lines.append("见习猎人被击飞，回到记录点「%s」。" % str(returned.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL)))

func _return_player_to_record_point() -> Dictionary:
	var point = PlayerProgressModel.record_point(player_profile)
	var map_id = str(point.get("mapId", PlayerProgressModel.DEFAULT_RECORD_POINT_MAP_ID))
	var spawn_name = str(point.get("spawnName", PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME))
	var label = str(point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	if not host._load_map(map_id, spawn_name):
		map_id = PlayerProgressModel.DEFAULT_RECORD_POINT_MAP_ID
		spawn_name = PlayerProgressModel.DEFAULT_RECORD_POINT_SPAWN_NAME
		label = PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL
		host._load_map(map_id, spawn_name)
	return {
		"mapId": map_id,
		"spawnName": spawn_name,
		"label": label,
	}

func _battle_player_actor_from_state(state: Dictionary) -> Dictionary:
	return BattleModel.actor_by_id(state, BattleModel.PLAYER_ACTOR_ID)

func _battle_player_hp_from_state(state: Dictionary) -> int:
	var actor = _battle_player_actor_from_state(state)
	return int(actor.get("hp", 0)) if not actor.is_empty() else 0

func _battle_player_max_hp_from_state(state: Dictionary) -> int:
	var actor = _battle_player_actor_from_state(state)
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
	var settings = PlayerProgressModel.hang_settings(player_profile)
	var threshold = int(settings.get(HangSettingsModel.LOW_HP_STOP_PERCENT_KEY, HangSettingsModel.STOP_ON_DEATH))
	if threshold == HangSettingsModel.STOP_NEVER:
		return ""
	var player_hp = _battle_player_hp_from_state(ended_state)
	var player_max_hp = _battle_player_max_hp_from_state(ended_state)
	if threshold == HangSettingsModel.STOP_ON_DEATH:
		if battle_player_zero_hp_seen or player_hp <= 0:
			var death_settings = PlayerProgressModel.hang_settings(player_profile)
			if str(death_settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP)) == HangSettingsModel.LOW_HP_ACTION_TOWN_HEAL:
				return "人物倒下过，正在回村治疗。"
			return "人物倒下过，挂机已停止。"
		return ""
	var hp_percent = float(maxi(0, player_hp)) / float(player_max_hp) * 100.0
	if hp_percent < float(threshold):
		var low_hp_settings = PlayerProgressModel.hang_settings(player_profile)
		if str(low_hp_settings.get(HangSettingsModel.LOW_HP_ACTION_KEY, HangSettingsModel.LOW_HP_ACTION_STOP)) == HangSettingsModel.LOW_HP_ACTION_TOWN_HEAL:
			return "人物生命低于%d%%，正在回村治疗。" % threshold
		return "人物生命低于%d%%，挂机已停止。" % threshold
	return ""

func _sync_profile_capture_tools_from_battle_state(save_after: bool = true) -> void:
	if battle_state.is_empty():
		return
	player_profile = PlayerProgressModel.with_capture_tool_inventory(player_profile, BattleModel.capture_tool_inventory(battle_state))
	if save_after and profile_save_enabled:
		host._save_player_profile_now()

func _sync_profile_battle_items_from_battle_state(save_after: bool = true) -> void:
	if battle_state.is_empty():
		return
	var bag = battle_state.get("itemBag", {})
	if not (bag is Dictionary):
		return
	player_profile = PlayerProgressModel.with_battle_item_inventory(player_profile, bag as Dictionary)
	if save_after and profile_save_enabled:
		host._save_player_profile_now()

func _quest_messages_for_battle_result(ended_state: Dictionary, result: Dictionary) -> Array[String]:
	var messages: Array[String] = []
	if str(result.get("result", "")) == "victory":
		var group_id = str(ended_state.get("sourceEncounterGroupId", ended_state.get("encounterGroupId", "")))
		var interaction_id = str(ended_state.get("sourceInteractionId", ""))
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
			var captured = value as Dictionary
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
	var progress_result = PlayerProgressModel.record_quest_event(player_profile, event)
	player_profile = progress_result.get("profile", player_profile)
	if not bool(progress_result.get("changed", false)):
		return messages
	host._mark_progress_ui_caches_dirty()
	if bool(progress_result.get("ready", false)) and PlayerProgressModel.active_quest_auto_claim(player_profile):
		var claim_result = PlayerProgressModel.claim_active_quest(player_profile)
		player_profile = claim_result.get("profile", player_profile)
		host._mark_progress_ui_caches_dirty()
		messages.append(str(claim_result.get("message", "")))
	else:
		messages.append(str(progress_result.get("message", "")))
	var filtered: Array[String] = []
	for message in messages:
		var text = message.strip_edges()
		if text != "":
			filtered.append(text)
	return filtered

func _queue_server_quest_record_event(event: Dictionary, quest_id: String = "") -> void:
	host._server_sync().queue_server_quest_record_event(event, quest_id)

func _process_server_quest_record_event_queue() -> void:
	await host._server_sync().process_server_quest_record_event_queue()

func _set_world_log_message(text: String) -> void:
	var stripped = text.strip_edges()
	world_log_message = stripped
	if stripped != "":
		for raw_line in stripped.split("\n", false):
			var line = str(raw_line).strip_edges()
			if line != "":
				world_log_history.append(line)
	while world_log_history.size() > WORLD_LOG_MAX_LINES:
		world_log_history.pop_front()
	var display_text = "\n".join(world_log_history)
	if battle_log_label != null:
		battle_log_label.text = display_text
		battle_log_label.scroll_following = true
		battle_log_label.call_deferred("scroll_to_line", maxi(0, battle_log_label.get_line_count() - 1))
	if battle_message_panel != null:
		battle_message_panel.visible = display_text != "" or battle_active
	_refresh_battle_message_controls()
	if hud_root != null:
		host._layout_hud()
	host.queue_redraw()

func _show_exp_pill_starter_notice_if_needed() -> void:
	var notice = PlayerProgressModel.exp_pill_starter_notice(player_profile)
	if notice != "" and world_log_message != notice:
		_set_world_log_message(notice)

func _save_profile_after_exp_pill_starter_update() -> void:
	# Startup normalization must never rewrite the live save by itself.
	# Real player actions persist explicitly through their own save paths.
	return

func _toggle_battle_message_expanded() -> void:
	battle_message_expanded = not battle_message_expanded
	_refresh_battle_message_controls()
	host._layout_hud()

func _clear_world_log_panel() -> void:
	world_log_history.clear()
	world_log_message = ""
	if battle_log_label != null:
		battle_log_label.text = ""
	if battle_message_panel != null:
		battle_message_panel.visible = battle_active
	_refresh_battle_message_controls()
	host._layout_hud()

func _refresh_battle_message_controls() -> void:
	if battle_message_expand_button != null:
		battle_message_expand_button.text = "收起" if battle_message_expanded else "展开"
	if battle_message_clear_button != null:
		battle_message_clear_button.disabled = world_log_history.is_empty()

func _open_backpack_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_backpack_panel() -> void:
	backpack_pending_use_item_id = ""
	var changed = _hide_control(backpack_panel)
	if changed:
		_apply_deferred_server_profile_pull_if_idle()

func _open_equipment_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_equipment_panel() -> void:
	var changed = _hide_control(equipment_panel, false)
	changed = _hide_control(equipment_synthesis_panel, false) or changed
	if changed and hud_root != null:
		host._layout_hud()

func _open_equipment_synthesis_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_equipment_synthesis_panel(update_layout: bool = true) -> void:
	_hide_control(equipment_synthesis_panel, update_layout)

func _open_player_status_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_player_status_panel() -> void:
	host._flush_profile_save_now()
	player_status_refresh_pending = false
	_hide_control(player_status_panel)

func _open_player_rebirth_preview_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_player_rebirth_preview_panel(update_layout: bool = true) -> void:
	player_rebirth_confirm_pending = false
	_hide_control(player_rebirth_preview_panel, update_layout)

func _on_player_status_equipment_pressed() -> void:
	_close_player_status_panel()
	_open_equipment_panel()

func _on_player_status_allocate_pressed(stat_key: String) -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("player_stat_allocate", {"statKey": stat_key}, "分配属性点失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_request_player_status_refresh()
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("分配属性点"):
		return
	var result = PlayerProgressModel.allocate_player_stat_point_fast(player_profile, stat_key)
	player_profile = result.get("profile", player_profile)
	var ok = bool(result.get("ok", false))
	if ok and profile_save_enabled:
		host._request_profile_save(0.35)
	_request_player_status_refresh()
	if not ok:
		_set_world_log_message(str(result.get("message", "")))
		host._update_hud_text()

func _request_player_status_refresh() -> void:
	if player_status_panel == null or not player_status_panel.visible:
		return
	if player_status_refresh_pending:
		return
	player_status_refresh_pending = true
	host.call_deferred("_flush_player_status_refresh")

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
	var player_dict = player_profile.get("player", {}) as Dictionary
	var raw_base = player_dict.get("baseStats", {}) as Dictionary
	var base = {}
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		base[stat_key] = maxi(1, int(raw_base.get(stat_key, PlayerProgressModel.DEFAULT_PLAYER_BATTLE_STATS.get(stat_key, 1))))
	var slots = _equipment_slots_for_ui()
	var durability = _equipment_durability_for_ui()
	var bonus = _equipment_stat_bonus_for_ui(slots, durability)
	var current = {}
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		current[stat_key] = maxi(1, int(base.get(stat_key, 1)) + int(bonus.get(stat_key, 0)))
	var current_max_hp = maxi(1, int(current.get("maxHp", player_dict.get("maxHp", 1))))
	var current_hp = clampi(int(player_dict.get("hp", current_max_hp)), 0, current_max_hp)
	var level = maxi(1, int(player_dict.get("level", 1)))
	var exp = maxi(0, int(player_dict.get("exp", 0)))
	var next_exp = maxi(1, int(player_dict.get("nextExp", PlayerProgressModel.exp_to_next_level(level))))
	var stat_points = maxi(0, int(player_dict.get("statPoints", 0)))
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
	var spirit_entries = _equipment_spirit_source_entries_for_ui(slots, durability)
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
	var point = point_value as Dictionary if point_value is Dictionary else {}
	lines.append("")
	lines.append("[color=#d7c36a]记录点[/color]")
	lines.append(str(point.get("label", "记录点")))
	player_status_detail_label.text = "\n".join(lines)
	if player_status_points_label != null:
		player_status_points_label.text = "可分配属性点：%d" % stat_points
	for stat_key in player_status_stat_point_buttons.keys():
		var button = player_status_stat_point_buttons.get(stat_key) as Button
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
	var raw_lines = PlayerProgressModel.rebirth_preview_lines(player_profile)
	var lines: Array[String] = []
	for raw_line in raw_lines:
		var line = str(raw_line)
		var escaped = _bbcode_escape(line)
		if line == "转生预览":
			lines.append("[color=#d7c36a]%s[/color]" % escaped)
		elif line == "资格: 可转生":
			lines.append("[color=#84d46b]%s[/color]" % escaped)
		elif line == "资格: 未满足":
			lines.append("[color=#d96b6b]%s[/color]" % escaped)
		else:
			lines.append(escaped)
	var equipment_warning_lines = _rebirth_equipment_warning_lines_for_ui()
	if not equipment_warning_lines.is_empty():
		lines.append("")
		lines.append_array(equipment_warning_lines)
	player_rebirth_preview_label.text = "\n".join(lines)
	if player_rebirth_execute_button != null:
		var preview = PlayerProgressModel.rebirth_preview(player_profile)
		var can_execute = bool(preview.get("ok", false))
		player_rebirth_execute_button.disabled = player_rebirth_request_pending or not can_execute
		if player_rebirth_request_pending:
			player_rebirth_execute_button.text = "转生中"
		else:
			player_rebirth_execute_button.text = "确认转生" if player_rebirth_confirm_pending and can_execute else "执行转生"

func _on_player_rebirth_execute_pressed() -> void:
	if player_rebirth_request_pending:
		return
	var preview = PlayerProgressModel.rebirth_preview(player_profile)
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
	var result = PlayerProgressModel.execute_rebirth(player_profile)
	player_profile = result.get("profile", player_profile)
	player_rebirth_confirm_pending = false
	var log_text = str(result.get("message", ""))
	if bool(result.get("ok", false)):
		var returned = _return_player_to_record_point()
		if log_text != "":
			log_text += "\n"
		log_text += "转生后已回到记录点「%s」。" % str(returned.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	_set_world_log_message(log_text)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_refresh_player_rebirth_preview_panel()
	host._update_hud_text()

func _submit_server_player_rebirth() -> void:
	if not _is_server_account_session():
		return
	player_rebirth_request_pending = true
	_refresh_player_rebirth_preview_panel()
	var response = await host._auto_http_request_spec(ServerAuthClientModel.player_rebirth_request(
		_server_profile_base_url(),
		_server_profile_token()
	))
	player_rebirth_request_pending = false
	if not _is_server_account_session():
		return
	var parsed = ServerAuthClientModel.parse_player_rebirth_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "转生失败。"))]
	if bool(parsed.get("ok", false)):
		player_rebirth_confirm_pending = false
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			var return_entry = parsed.get("returnEntry", {}) as Dictionary if parsed.get("returnEntry", {}) is Dictionary else {}
			var record_point = return_entry.get("recordPoint", {}) as Dictionary if return_entry.get("recordPoint", {}) is Dictionary else {}
			var point_label = str(record_point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
			if point_label != "":
				log_lines.append("转生后已回到记录点「%s」。" % point_label)
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			host._mark_progress_ui_caches_dirty()
			_queue_server_profile_pull()
		else:
			log_lines = ["转生成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		player_rebirth_confirm_pending = false
		if _handle_session_invalid_response(parsed):
			return
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_refresh_player_rebirth_preview_panel()
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()
	_refresh_quick_bar()
	_set_world_log_message("\n".join(log_lines))
	if status_label != null:
		host._update_hud_text()

func _submit_server_quest_record(event: Dictionary, quest_id: String = "") -> Dictionary:
	return await host._server_sync().submit_server_quest_record(event, quest_id)

func _submit_server_quest_claim(quest_id: String = "", reward_choice_id: String = "") -> Dictionary:
	return await host._server_sync().submit_server_quest_claim(quest_id, reward_choice_id)

func _apply_server_quest_action_result(parsed: Dictionary, fallback_message: String) -> Dictionary:
	return host._server_sync().apply_server_quest_action_result(parsed, fallback_message)

func _submit_server_profile_action(action: String, payload: Dictionary = {}, fallback_message: String = "档案操作失败。") -> Dictionary:
	return await host._server_sync().submit_server_profile_action(action, payload, fallback_message)

func _player_status_stat_line(stat_key: String, base: Dictionary, bonus: Dictionary, current: Dictionary) -> String:
	var base_value = int(base.get(stat_key, 0))
	var bonus_value = int(bonus.get(stat_key, 0))
	var label = EquipmentModel.stat_label_for(stat_key)
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
		var bonus_value = int(bonus.get(stat_key, 0))
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
		var source = source_value as Dictionary
		var item_label = str(source.get("itemLabel", "装备"))
		if item_label != "" and not parts.has(item_label):
			parts.append(item_label)
	return "未知装备" if parts.is_empty() else "、".join(parts)

func _equipment_spirit_sources_for_id(spirit_id: String) -> String:
	for entry in PlayerProgressModel.equipment_spirit_source_entries(player_profile):
		if str(entry.get("spiritId", "")) == spirit_id:
			return _equipment_spirit_sources_text(entry as Dictionary)
	return ""

func _equipment_spirit_label_with_source(spirit_id: String) -> String:
	var label = BattleActionCatalog.label_for(spirit_id, spirit_id)
	var source_text = _equipment_spirit_sources_for_id(spirit_id)
	if source_text == "" or source_text == "未知装备":
		return label
	return "%s（%s）" % [label, source_text]

func _refresh_equipment_panel() -> void:
	if equipment_panel == null or equipment_grid == null or equipment_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var equipped = PlayerProgressModel.equipment_slots(player_profile)
	_refresh_equipment_stats()
	if equipment_selected_slot_id == "" or not EquipmentModel.slot_ids().has(equipment_selected_slot_id):
		equipment_selected_slot_id = EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	for child in equipment_grid.get_children():
		child.queue_free()
	equipment_slot_buttons.clear()
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(equipped.get(slot_id, ""))
		var button = Button.new()
		button.toggle_mode = true
		button.button_pressed = slot_id == equipment_selected_slot_id
		button.add_theme_font_size_override("font_size", 14)
		var slot_rect = _equipment_slot_anchor_rect(slot_id)
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
		var selected_slot_id = slot_id
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
		var charge = PlayerProgressModel.equipped_exp_pill_charge(player_profile)
		var level = int(charge.get("level", EquipmentModel.exp_pill_level_for(item_id)))
		return "%s Lv%d" % [EquipmentModel.menu_label_for(item_id, "-"), level]
	var item_label = EquipmentModel.menu_label_for(item_id, "-")
	var enhance_level = PlayerProgressModel.equipment_enhance_level(player_profile, slot_id)
	if enhance_level > 0:
		item_label += " +%d" % enhance_level
	var max_durability = EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return item_label
	var current = clampi(int(PlayerProgressModel.equipment_durability(player_profile).get(slot_id, max_durability)), 0, max_durability)
	return "%s %s%d/%d" % [
		item_label,
		"损" if current <= 0 else "",
		current,
		max_durability,
	]

func _apply_equipment_slot_button_color(button: Button, slot_id: String, item_id: String) -> void:
	if item_id == "":
		return
	var max_durability = EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return
	var current = clampi(int(PlayerProgressModel.equipment_durability(player_profile).get(slot_id, max_durability)), 0, max_durability)
	if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
		var inactive_color = Color(1.0, 0.54, 0.42, 1.0)
		button.add_theme_color_override("font_color", inactive_color)
		button.add_theme_color_override("font_hover_color", inactive_color.lightened(0.10))
		button.add_theme_color_override("font_pressed_color", inactive_color)
	elif current <= 0:
		var broken_color = Color(1.0, 0.36, 0.30, 1.0)
		button.add_theme_color_override("font_color", broken_color)
		button.add_theme_color_override("font_hover_color", broken_color.lightened(0.10))
		button.add_theme_color_override("font_pressed_color", broken_color)
	elif current < max_durability:
		var worn_color = Color(1.0, 0.86, 0.42, 1.0)
		button.add_theme_color_override("font_color", worn_color)
		button.add_theme_color_override("font_hover_color", worn_color.lightened(0.08))
		button.add_theme_color_override("font_pressed_color", worn_color)

func _refresh_equipment_stats() -> void:
	if equipment_stats_label == null:
		return
	var summary = PlayerProgressModel.player_stat_summary(player_profile)
	var base = summary.get("base", {}) as Dictionary
	var bonus = summary.get("bonus", {}) as Dictionary
	var current = summary.get("current", {}) as Dictionary
	equipment_stats_label.text = "人物属性\n%s    %s\n%s    %s" % [
		_equipment_stat_line_for("maxHp", base, bonus, current),
		_equipment_stat_line_for("attack", base, bonus, current),
		_equipment_stat_line_for("defense", base, bonus, current),
		_equipment_stat_line_for("quick", base, bonus, current),
	]

func _equipment_stat_line_for(stat_key: String, base: Dictionary, bonus: Dictionary, current: Dictionary) -> String:
	var base_value = int(base.get(stat_key, 0))
	var bonus_value = int(bonus.get(stat_key, 0))
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
	var equipped = PlayerProgressModel.equipment_slots(player_profile)
	var item_id = str(equipped.get(equipment_selected_slot_id, ""))
	var lines: Array[String] = [
		"%s" % EquipmentModel.slot_label_for(equipment_selected_slot_id),
	]
	if item_id == "":
		lines.append("未装备")
		lines.append_array(_equipment_slot_recommendation_lines(equipment_selected_slot_id))
	else:
		lines.append(EquipmentModel.label_for(item_id))
		var enhance_text = PlayerProgressModel.equipment_enhance_text(player_profile, equipment_selected_slot_id)
		if enhance_text != "":
			lines.append(enhance_text)
		var durability_text = PlayerProgressModel.equipment_slot_durability_text(player_profile, equipment_selected_slot_id)
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
		var quote = PlayerProgressModel.equipment_enhance_quote(player_profile, equipment_selected_slot_id)
		var can_show_enhance = item_id != "" and EquipmentModel.enhance_max_for(item_id) > 0
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
	var counts = _backpack_counts_for_ui()
	var candidates: Array[Dictionary] = []
	for item_id_value in counts.keys():
		var item_id = str(item_id_value)
		var count = int(counts.get(item_id_value, 0))
		if count <= 0:
			continue
		if not EquipmentModel.is_equipment(item_id) or EquipmentModel.slot_for(item_id) != slot_id:
			continue
		var equip_check = _can_equip_item_for_ui(item_id)
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
		var a_score = int(a.get("score", 0))
		var b_score = int(b.get("score", 0))
		if a_score != b_score:
			return a_score > b_score
		return str(a.get("label", "")).naturalnocasecmp_to(str(b.get("label", ""))) < 0
	)
	var limit = mini(4, candidates.size())
	for index in range(limit):
		var candidate = candidates[index]
		var item_id = str(candidate.get("itemId", ""))
		lines.append("- %s x%d：%s" % [
			str(candidate.get("label", "装备")),
			int(candidate.get("count", 0)),
			_equipment_plain_change_text_for(item_id),
		])
	if candidates.size() > limit:
		lines.append("还有%d件可装备物品。" % (candidates.size() - limit))
	return lines

func _equipment_recommendation_score(item_id: String) -> int:
	var stats = EquipmentModel.stats_for(item_id)
	var score = 0
	for stat_key in EquipmentModel.STAT_KEYS:
		score += int(stats.get(stat_key, 0))
	score += EquipmentModel.spirit_ids_for(item_id).size() * 20
	return score

func _equipment_plain_change_text_for(item_id: String) -> String:
	var preview = _equipment_change_preview_for_ui(item_id)
	if preview.is_empty():
		return "无变化"
	if bool(preview.get("unchanged", false)):
		return "已装备"
	var parts: Array[String] = []
	for change_value in preview.get("statChanges", []):
		if not (change_value is Dictionary):
			continue
		var change = change_value as Dictionary
		var delta = int(change.get("delta", 0))
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
	var spirit_ids = EquipmentModel.spirit_ids_for(item_id)
	if spirit_ids.is_empty():
		return []
	if _equipment_slot_is_broken(slot_id, item_id):
		return ["来源精灵: 装备已损坏，精灵暂不可用。"]
	if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
		return ["来源精灵: 需求未满足，精灵暂不可用。"]
	var item_label = EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	var parts: Array[String] = []
	for spirit_id in spirit_ids:
		parts.append("%s（%s）" % [
			BattleActionCatalog.label_for(str(spirit_id), str(spirit_id)),
			item_label,
		])
	return ["来源精灵: %s" % "、".join(parts)]

func _equipment_exp_pill_charge_lines() -> Array[String]:
	var charge = PlayerProgressModel.equipped_exp_pill_charge(player_profile)
	if charge.is_empty():
		return []
	var level = int(charge.get("level", 1))
	var exp = int(charge.get("exp", 0))
	var next_exp = int(charge.get("nextExp", PlayerProgressModel.exp_to_next_level(level)))
	if level >= PlayerProgressModel.MAX_PLAYER_LEVEL:
		return ["储存进度: Lv%d 已满" % level]
	return ["储存进度: Lv%d  %d/%d" % [level, exp, next_exp]]

func _equipment_slot_unequip_locked(slot_id: String) -> bool:
	if slot_id != EquipmentModel.SLOT_EXP_PILL:
		return false
	var item_id = PlayerProgressModel.equipped_item_id(player_profile, slot_id)
	if item_id == "":
		return false
	var charge = PlayerProgressModel.equipped_exp_pill_charge(player_profile)
	if charge.is_empty():
		return false
	var base_level = BackpackModel.world_exp_level_for(item_id)
	return int(charge.get("level", base_level)) > base_level or int(charge.get("exp", 0)) > 0

func _equipment_unequip_impact_lines(slot_id: String) -> Array[String]:
	if slot_id == EquipmentModel.SLOT_EXP_PILL:
		var lines = [
			"",
			"经验丹: 人物满级后的溢出经验会存入这里。",
		]
		if _equipment_slot_unequip_locked(slot_id):
			lines.append("已储存经验，暂不能卸下或替换。")
		return lines
	var after_profile = _equipment_profile_without_slot(player_profile, slot_id)
	var before_summary = PlayerProgressModel.player_stat_summary(player_profile)
	var after_summary = PlayerProgressModel.player_stat_summary(after_profile)
	var before_bonus = before_summary.get("bonus", {}) as Dictionary
	var after_bonus = after_summary.get("bonus", {}) as Dictionary
	var stat_parts: Array[String] = []
	for stat_key in EquipmentModel.STAT_KEYS:
		var delta = int(after_bonus.get(stat_key, 0)) - int(before_bonus.get(stat_key, 0))
		if delta == 0:
			continue
		stat_parts.append("%s %s%d" % [
			EquipmentModel.stat_label_for(stat_key),
			"+" if delta > 0 else "",
			delta,
		])
	var before_spirits = PlayerProgressModel.equipment_spirit_ids(player_profile)
	var after_spirits = PlayerProgressModel.equipment_spirit_ids(after_profile)
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
	var normalized = PlayerProgressModel.normalize_profile(profile)
	var slots = PlayerProgressModel.equipment_slots(normalized)
	var durability = PlayerProgressModel.equipment_durability(normalized)
	var instances = PlayerProgressModel.equipment_instances(normalized)
	var slot_instance_ids = PlayerProgressModel.equipment_slot_instance_ids(normalized)
	var instance_id = str(slot_instance_ids.get(slot_id, ""))
	slots.erase(slot_id)
	durability.erase(slot_id)
	slot_instance_ids.erase(slot_id)
	if instance_id != "" and instances.has(instance_id):
		var record = (instances.get(instance_id, {}) as Dictionary).duplicate(true)
		record["location"] = "backpack"
		record["slotId"] = ""
		instances[instance_id] = record
	normalized[PlayerProgressModel.EQUIPMENT_SLOTS_KEY] = slots
	normalized[PlayerProgressModel.EQUIPMENT_DURABILITY_KEY] = durability
	normalized[PlayerProgressModel.EQUIPMENT_INSTANCES_KEY] = instances
	normalized[PlayerProgressModel.EQUIPMENT_SLOT_INSTANCE_IDS_KEY] = slot_instance_ids
	return PlayerProgressModel.normalize_profile(normalized)

func _equipment_slot_is_broken(slot_id: String, item_id: String) -> bool:
	return _equipment_slot_is_broken_for_ui(slot_id, item_id, _equipment_durability_for_ui())

func _equipment_slot_meets_requirements_for_ui(_slot_id: String, item_id: String) -> bool:
	return (
		_player_level_for_ui() >= EquipmentModel.required_level_for(item_id)
		and _player_rebirth_for_ui() >= EquipmentModel.required_rebirth_for(item_id)
	)

func _equipment_effect_summary_lines_for_ui(use_bbcode: bool = false, slots: Dictionary = {}, durability: Dictionary = {}) -> Array[String]:
	var effective_slots = slots if not slots.is_empty() else _equipment_slots_for_ui()
	var effective_durability = durability if not durability.is_empty() else _equipment_durability_for_ui()
	var active_count = 0
	var inactive_count = 0
	var inactive_parts: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		if slot_id == EquipmentModel.SLOT_EXP_PILL:
			continue
		var item_id = str(effective_slots.get(slot_id, ""))
		if item_id == "":
			continue
		var item_label = EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
		if _equipment_slot_is_broken_for_ui(slot_id, item_id, effective_durability):
			inactive_count += 1
			inactive_parts.append("%s（已损坏）" % item_label)
		elif not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			inactive_count += 1
			inactive_parts.append("%s（需求未满足）" % item_label)
		else:
			active_count += 1
	var summary = "装备: %d件生效 / %d件未生效" % [active_count, inactive_count]
	var lines: Array[String] = []
	if use_bbcode and inactive_count > 0:
		lines.append("[color=%s]%s[/color]" % [EQUIPMENT_COMPARE_LOSS_COLOR, _bbcode_escape(summary)])
	else:
		lines.append(_bbcode_escape(summary) if use_bbcode else summary)
	if not inactive_parts.is_empty():
		var inactive_text = "未生效: %s" % "、".join(inactive_parts)
		if use_bbcode:
			inactive_text = "[color=%s]%s[/color]" % [EQUIPMENT_COMPARE_LOSS_COLOR, _bbcode_escape(inactive_text)]
		lines.append(inactive_text)
	return lines

func _rebirth_equipment_warning_lines_for_ui() -> Array[String]:
	var preview = PlayerProgressModel.rebirth_preview(player_profile)
	if not bool(preview.get("ok", false)):
		return []
	var after_level = maxi(1, int(preview.get("afterLevel", 1)))
	var after_rebirth = maxi(0, int(preview.get("targetCount", PlayerProgressModel.rebirth_count(player_profile) + 1)))
	var slots = PlayerProgressModel.equipment_slots(player_profile)
	var affected: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		if _equipment_slot_is_broken(slot_id, item_id):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		var will_meet = (
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
	var result = PlayerProgressModel.unequip_slot(player_profile, equipment_selected_slot_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_panel()
	if status_label != null:
		host._update_hud_text()

func _on_equipment_enhance_pressed() -> void:
	if equipment_action_request_pending:
		return
	if _is_server_account_session():
		await _submit_server_equipment_enhance(equipment_selected_slot_id)
		return
	if _local_profile_mutation_blocked_for_server_only("装备强化"):
		return
	var result = PlayerProgressModel.enhance_equipment_slot(player_profile, equipment_selected_slot_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_panel()
	_refresh_backpack_panel()
	if status_label != null:
		host._update_hud_text()

func _submit_server_equipment_enhance(slot_id: String) -> void:
	if slot_id == "" or not _is_server_account_session():
		return
	equipment_action_request_pending = true
	_refresh_equipment_panel()
	var response = await host._auto_http_request_spec(ServerAuthClientModel.equipment_enhance_request(
		_server_profile_base_url(),
		_server_profile_token(),
		slot_id
	))
	equipment_action_request_pending = false
	if not _is_server_account_session():
		return
	var parsed = ServerAuthClientModel.parse_equipment_enhance_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "强化失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message = str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			host._mark_progress_ui_caches_dirty()
		else:
			log_lines = ["强化成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		if _handle_session_invalid_response(parsed):
			return
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_set_world_log_message("\n".join(log_lines))
	_refresh_equipment_panel()
	_refresh_backpack_panel()
	if status_label != null:
		host._update_hud_text()

func _refresh_equipment_synthesis_panel() -> void:
	if equipment_synthesis_panel == null or equipment_synthesis_list_container == null or equipment_synthesis_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var recipes = EquipmentSynthesisModel.recipes()
	if equipment_synthesis_selected_recipe_id == "" or EquipmentSynthesisModel.recipe_for_id(equipment_synthesis_selected_recipe_id).is_empty():
		equipment_synthesis_selected_recipe_id = str(recipes[0].get("id", "")) if not recipes.is_empty() else ""
	for child in equipment_synthesis_list_container.get_children():
		child.queue_free()
	equipment_synthesis_recipe_buttons.clear()
	if recipes.is_empty():
		var empty_label = Label.new()
		empty_label.text = "暂无合成配方"
		empty_label.add_theme_font_size_override("font_size", 16)
		equipment_synthesis_list_container.add_child(empty_label)
	else:
		for recipe in recipes:
			var recipe_id = str(recipe.get("id", ""))
			var button = Button.new()
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
	var selected_recipe = EquipmentSynthesisModel.recipe_for_id(equipment_synthesis_selected_recipe_id)
	equipment_synthesis_detail_label.text = _equipment_synthesis_detail_text(selected_recipe)
	if equipment_synthesis_action_button != null:
		var can_synthesize = false
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
	var recipe_id = str(recipe.get("id", ""))
	var output_item_id = EquipmentSynthesisModel.output_item_id(recipe)
	var check = PlayerProgressModel.can_synthesize_equipment(player_profile, recipe_id)
	var lines: Array[String] = []
	lines.append("[color=#d7c36a]配方[/color] %s" % _bbcode_escape(str(recipe.get("label", EquipmentSynthesisModel.output_label_for_recipe(recipe)))))
	lines.append("成品: %s" % _bbcode_escape(EquipmentSynthesisModel.output_text(recipe)))
	lines.append("成功率: %d%%" % int(roundf(EquipmentSynthesisModel.success_rate(recipe) * 100.0)))
	var description = str(recipe.get("description", "")).strip_edges()
	if description != "":
		lines.append("说明: %s" % _bbcode_escape(description))
	lines.append("")
	lines.append("[color=#d7c36a]材料[/color]")
	for material in EquipmentSynthesisModel.material_entries(recipe):
		var item_id = str(material.get("itemId", ""))
		var need_count = maxi(0, int(material.get("count", 0)))
		var held_count = PlayerProgressModel.backpack_item_count(player_profile, item_id)
		var color = EQUIPMENT_COMPARE_GAIN_COLOR if held_count >= need_count else EQUIPMENT_COMPARE_LOSS_COLOR
		lines.append("[color=%s]%s %d/%d[/color]" % [
			color,
			_bbcode_escape(BackpackModel.label_for(item_id, item_id)),
			held_count,
			need_count,
		])
	var cost = EquipmentSynthesisModel.stone_cost(recipe)
	var coins = PlayerProgressModel.stone_coins(player_profile)
	var coin_color = EQUIPMENT_COMPARE_GAIN_COLOR if coins >= cost else EQUIPMENT_COMPARE_LOSS_COLOR
	lines.append("[color=%s]石币 %d/%d[/color]" % [coin_color, coins, cost])
	lines.append("")
	lines.append("[color=#d7c36a]成品详情[/color]")
	for detail_line in EquipmentModel.detail_lines_for_item(output_item_id):
		lines.append(_bbcode_escape(detail_line))
	lines.append("")
	lines.append_array(_equipment_compare_detail_lines(output_item_id))
	lines.append("")
	var status_color = EQUIPMENT_COMPARE_GAIN_COLOR if bool(check.get("ok", false)) else EQUIPMENT_COMPARE_LOSS_COLOR
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
	var result = PlayerProgressModel.synthesize_equipment(player_profile, equipment_synthesis_selected_recipe_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_equipment_synthesis_panel()
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()

func _submit_server_equipment_synthesis(recipe_id: String) -> void:
	if recipe_id == "" or not _is_server_account_session():
		return
	equipment_action_request_pending = true
	_refresh_equipment_synthesis_panel()
	var response = await host._auto_http_request_spec(ServerAuthClientModel.equipment_synthesize_request(
		_server_profile_base_url(),
		_server_profile_token(),
		recipe_id
	))
	equipment_action_request_pending = false
	if not _is_server_account_session():
		return
	var parsed = ServerAuthClientModel.parse_equipment_synthesize_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "合成失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message = str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			host._mark_progress_ui_caches_dirty()
		else:
			log_lines = ["合成成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		if _handle_session_invalid_response(parsed):
			return
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	_set_world_log_message("\n".join(log_lines))
	_refresh_equipment_synthesis_panel()
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()

func _refresh_backpack_panel() -> void:
	if backpack_panel == null or backpack_grid == null or backpack_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var slots = _backpack_slots_for_ui()
	var visible_indices = _backpack_visible_slot_indices(slots)
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
		var empty_label = Label.new()
		empty_label.text = "没有符合筛选的道具"
		empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		empty_label.custom_minimum_size = Vector2(0, 62)
		backpack_grid.add_child(empty_label)
	else:
		for index in visible_indices:
			var slot = slots[index] if index < slots.size() else {}
			var button = Button.new()
			var locked = bool(slot.get("locked", false))
			button.text = _backpack_locked_slot_label(index) if locked else BackpackModel.slot_label(slot)
			button.toggle_mode = not locked
			button.button_pressed = (not locked) and index == backpack_selected_slot_index
			button.custom_minimum_size = Vector2(0, 62)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			if locked:
				button.add_theme_font_size_override("font_size", 14)
			var slot_index = index
			button.pressed.connect(func() -> void:
				_select_backpack_slot(slot_index)
			)
			backpack_grid.add_child(button)
			backpack_slot_buttons.append(button)
		var selected_slot = {}
		if not visible_indices.is_empty() and backpack_selected_slot_index < slots.size():
			selected_slot = slots[backpack_selected_slot_index]
		var selected_item_id = str(selected_slot.get("itemId", ""))
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
		var is_selected_equipment = EquipmentModel.is_equipment(selected_item_id)
		var equipment_requirement_lines: Array[String] = []
		var equipment_compare_lines: Array[String] = []
		if is_selected_equipment:
			equipment_requirement_lines = _equipment_detail_lines_with_requirement_status(selected_item_id, true)
			equipment_compare_lines = _equipment_compare_detail_lines(selected_item_id)
		var detail_lines = BackpackPanelPresenter.detail_lines_for_slot(selected_slot, equipment_requirement_lines, equipment_compare_lines)
		backpack_detail_label.text = "\n".join(detail_lines)
		var equip_check = _can_equip_item_for_ui(selected_item_id) if is_selected_equipment else {}
		var item_actions = BackpackPanelPresenter.selected_item_actions(selected_slot, slots, equip_check)
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
			var quick_bind_button = backpack_quick_bind_buttons[index]
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
		var filter_id = str(option.get("id", ""))
		var button = backpack_filter_buttons.get(filter_id, null) as Button
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
	var extra_index = slot_index - BackpackModel.BASE_SLOT_LIMIT
	return BackpackModel.unlock_cost_for_extra_slot(extra_index)

func _backpack_locked_slot_label(slot_index: int) -> String:
	var cost = _backpack_locked_slot_cost(slot_index)
	return "锁\n%d钻石" % cost if cost > 0 else "锁"

func _backpack_locked_slot_detail_lines(slot_index: int) -> Array[String]:
	var cost = _backpack_locked_slot_cost(slot_index)
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
		var slot = slots[index] if index < slots.size() else {}
		if _backpack_slot_matches_filter(slot):
			result.append(index)
	return result

func _backpack_slot_matches_filter(slot: Dictionary) -> bool:
	return BackpackPanelPresenter.slot_matches_filter(slot, backpack_filter)

func _backpack_grid_columns() -> int:
	return 3 if host._is_phone_shape(host._layout_size()) else 5

func _select_backpack_slot(slot_index: int) -> void:
	backpack_selected_slot_index = clampi(slot_index, 0, BackpackModel.SLOT_LIMIT - 1)
	backpack_pending_use_item_id = ""
	if _backpack_slot_is_locked_index(backpack_selected_slot_index):
		_open_backpack_unlock_dialog(backpack_selected_slot_index)
		return
	_refresh_backpack_panel()

func _open_backpack_unlock_dialog(slot_index: int) -> void:
	var unlocked_count = _backpack_unlocked_slot_count_for_ui()
	if slot_index > unlocked_count:
		_set_world_log_message("请先解锁前一个扩展背包位。")
		_refresh_backpack_panel()
		return
	var extra_index = slot_index - BackpackModel.BASE_SLOT_LIMIT
	var cost = _backpack_locked_slot_cost(slot_index)
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
	host._update_dialog_text()
	dialog_panel.move_to_front()
	dialog_panel.visible = true
	host._layout_hud()

func _unlock_backpack_slot_from_dialog() -> void:
	if active_dialog_interaction.is_empty():
		return
	var extra_index = int(active_dialog_interaction.get("extraSlotIndex", -1))
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("backpack_unlock_slot", {"extraSlotIndex": extra_index}, "解锁背包位失败。")
		var message = "\n".join(_string_array_values(parsed.get("logLines", [])))
		_set_world_log_message(message)
		if bool(parsed.get("ok", false)):
			host._close_dialog()
			_refresh_backpack_panel()
			_refresh_quick_bar()
			if status_label != null:
				host._update_hud_text()
			return
		active_dialog_interaction["dialog"] = [message, "当前钻石：%d" % _profile_diamonds_for_ui()]
		host._update_dialog_text()
		return
	if _local_profile_mutation_blocked_for_server_only("背包扩容"):
		return
	var result = PlayerProgressModel.unlock_backpack_slot(player_profile, extra_index)
	player_profile = result.get("profile", player_profile)
	var message = str(result.get("message", ""))
	_set_world_log_message(message)
	if bool(result.get("ok", false)):
		if profile_save_enabled:
			host._save_player_profile_now()
		host._close_dialog()
		_refresh_backpack_panel()
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		return
	active_dialog_interaction["dialog"] = [message, "当前钻石：%d" % _profile_diamonds_for_ui()]
	host._update_dialog_text()

func _refresh_quick_bar(force: bool = false) -> void:
	if quick_slot_buttons.is_empty():
		return
	var slots = _quick_slots_for_hud()
	var states: Array[Dictionary] = []
	var signature_parts: Array[String] = [str(battle_active), str(encounter_active)]
	for index in range(quick_slot_buttons.size()):
		var item_id = slots[index] if index < slots.size() else ""
		var text = "快%d\n-" % [index + 1]
		var disabled = true
		if item_id == "":
			signature_parts.append("%d:-:0:1" % index)
		else:
			var count = _backpack_item_count_for_hud(item_id)
			text = "%s\nx%d" % [BackpackModel.menu_label_for(item_id), count]
			disabled = battle_active or encounter_active or count <= 0
			signature_parts.append("%d:%s:%d:%d" % [index, item_id, count, 1 if disabled else 0])
		states.append({
			"text": text,
			"disabled": disabled,
		})
	var signature = "|".join(signature_parts)
	if not force and signature == quick_bar_signature_cache:
		return
	quick_bar_signature_cache = signature
	for index in range(quick_slot_buttons.size()):
		var button = quick_slot_buttons[index]
		var state = states[index]
		var next_text = str(state.get("text", ""))
		var next_disabled = bool(state.get("disabled", true))
		if button.text != next_text:
			button.text = next_text
		if button.disabled != next_disabled:
			button.disabled = next_disabled

func _quick_slots_for_hud() -> Array[String]:
	var result: Array[String] = []
	var raw_slots = player_profile.get("quickSlots", [])
	if raw_slots is Array:
		var quick_values = raw_slots as Array
		for raw_item_id in quick_values:
			var item_id = str(raw_item_id).strip_edges()
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
	var unlocked_count = _backpack_unlocked_slot_count_for_ui()
	var result = BackpackModel.normalize_slots(player_profile.get("backpackSlots", []), unlocked_count)
	var slots = player_profile.get("backpackSlots", [])
	if slots is Array:
		result = BackpackModel.normalize_slots(slots, unlocked_count)
	while result.size() < BackpackModel.SLOT_LIMIT:
		var extra_index = result.size() - BackpackModel.BASE_SLOT_LIMIT
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
	var counts = {}
	for slot in slots:
		var slot_item_id = str(slot.get("itemId", ""))
		if slot_item_id != "":
			counts[slot_item_id] = int(counts.get(slot_item_id, 0)) + maxi(0, int(slot.get("count", 0)))
	return counts

func _backpack_counts_for_ui() -> Dictionary:
	return _backpack_counts_from_slots_for_ui(_backpack_slots_for_ui())

func _backpack_available_capacity_for_ui(item_id: String, slots: Array[Dictionary] = []) -> int:
	if item_id == "" or BackpackModel.item_for_id(item_id).is_empty():
		return 0
	var total = 0
	var stack_limit = BackpackModel.stack_limit_for(item_id)
	var effective_slots = slots if not slots.is_empty() else _backpack_slots_for_ui()
	for slot in effective_slots:
		if bool(slot.get("locked", false)):
			continue
		var slot_item_id = str(slot.get("itemId", ""))
		if slot_item_id == item_id:
			total += maxi(0, stack_limit - maxi(0, int(slot.get("count", 0))))
		elif slot_item_id == "":
			total += stack_limit
	return total

func _on_backpack_quick_bind_pressed(slot_index: int) -> void:
	var item_id = _selected_backpack_item_id()
	if item_id == "" or not PlayerProgressModel.item_can_quick_use(item_id):
		return
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		_set_world_log_message("%s 不够了。" % BackpackModel.label_for(item_id))
		return
	player_profile = PlayerProgressModel.with_quick_slot_item(player_profile, slot_index, item_id)
	if profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message("%s 已绑定到快捷%d。" % [BackpackModel.label_for(item_id), slot_index + 1])
	_refresh_backpack_panel()
	_refresh_quick_bar()

func _on_quick_slot_pressed(slot_index: int) -> void:
	if battle_active or encounter_active:
		return
	var slots = PlayerProgressModel.quick_slots(player_profile)
	if slot_index < 0 or slot_index >= slots.size():
		return
	var item_id = str(slots[slot_index])
	if item_id == "":
		return
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		player_profile = PlayerProgressModel.clear_quick_slot(player_profile, slot_index)
		if profile_save_enabled:
			host._save_player_profile_now()
		_set_world_log_message("快捷%d没有可用道具。" % [slot_index + 1])
		_refresh_quick_bar()
		return
	if BackpackModel.item_can_world_encounter_stone(item_id):
		await _use_backpack_encounter_stone(item_id)
		_clear_empty_quick_slot_item(item_id)
		_refresh_quick_bar()
		return
	if BackpackModel.item_can_world_pet_heal(item_id):
		var target_id = _quick_pet_heal_target_id(item_id)
		if target_id == "":
			_set_world_log_message("队伍宠物生命已满。")
			return
		await _use_world_pet_heal_item_and_log(item_id, target_id)
		_clear_empty_quick_slot_item(item_id)
		_refresh_quick_bar()

func _quick_pet_heal_target_id(item_id: String) -> String:
	if not BackpackModel.item_can_world_pet_heal(item_id):
		return ""
	var allow_full_hp_use = BackpackModel.world_pet_heal_allows_full_hp_use(item_id)
	var party = PlayerProgressModel.party_pet_instances(player_profile)
	var active_id = str(player_profile.get("activePetInstanceId", ""))
	for pet in party:
		if str(pet.get("instanceId", "")) != active_id:
			continue
		var active_max_hp = maxi(1, int(pet.get("maxHp", 1)))
		var active_hp = clampi(int(pet.get("hp", active_max_hp)), 0, active_max_hp)
		if active_hp < active_max_hp or allow_full_hp_use:
			return active_id
	for pet in party:
		var max_hp = maxi(1, int(pet.get("maxHp", 1)))
		var hp = clampi(int(pet.get("hp", max_hp)), 0, max_hp)
		if hp < max_hp or allow_full_hp_use:
			return str(pet.get("instanceId", ""))
	return ""

func _clear_empty_quick_slot_item(item_id: String) -> void:
	if item_id == "" or PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0:
		return
	var slots = PlayerProgressModel.quick_slots(player_profile)
	var changed = false
	for index in range(slots.size()):
		if slots[index] == item_id:
			slots[index] = ""
			changed = true
	if not changed:
		return
	var normalized = PlayerProgressModel.normalize_profile(player_profile)
	normalized[PlayerProgressModel.QUICK_SLOTS_KEY] = slots
	player_profile = PlayerProgressModel.normalize_profile(normalized)
	if profile_save_enabled:
		host._save_player_profile_now()

func _player_level_for_ui() -> int:
	var player_value = player_profile.get("player", {})
	var player_dict = player_value as Dictionary if player_value is Dictionary else {}
	return maxi(1, int(player_dict.get("level", 1)))

func _player_rebirth_for_ui() -> int:
	return maxi(0, int(player_profile.get(PlayerProgressModel.REBIRTH_COUNT_KEY, 0)))

func _equipment_slots_for_ui() -> Dictionary:
	var result = {}
	var slots_value = player_profile.get(PlayerProgressModel.EQUIPMENT_SLOTS_KEY, {})
	if slots_value is Dictionary:
		var slots_dict = slots_value as Dictionary
		for slot_id in EquipmentModel.slot_ids():
			var item_id = str(slots_dict.get(slot_id, ""))
			if item_id != "":
				result[slot_id] = item_id
	return result

func _equipment_durability_for_ui() -> Dictionary:
	var result = {}
	var durability_value = player_profile.get(PlayerProgressModel.EQUIPMENT_DURABILITY_KEY, {})
	if durability_value is Dictionary:
		var durability_dict = durability_value as Dictionary
		for slot_id in EquipmentModel.slot_ids():
			if durability_dict.has(slot_id):
				result[slot_id] = maxi(0, int(durability_dict.get(slot_id, 0)))
	return result

func _equipment_enhancement_for_ui() -> Dictionary:
	var result = {}
	var slots = _equipment_slots_for_ui()
	var enhancement_value = player_profile.get(PlayerProgressModel.EQUIPMENT_ENHANCEMENT_KEY, {})
	if not (enhancement_value is Dictionary):
		return result
	var enhancement = enhancement_value as Dictionary
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var record_value = enhancement.get(slot_id, {})
		if not (record_value is Dictionary):
			continue
		var record = record_value as Dictionary
		if str(record.get("itemId", "")) != item_id:
			continue
		var level = clampi(int(record.get("level", 0)), 0, EquipmentModel.enhance_max_for(item_id))
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
	var record = record_value as Dictionary
	if str(record.get("itemId", "")) != item_id:
		return 0
	return clampi(int(record.get("level", 0)), 0, EquipmentModel.enhance_max_for(item_id))

func _equipment_slot_is_broken_for_ui(slot_id: String, item_id: String, durability: Dictionary) -> bool:
	var max_durability = EquipmentModel.max_durability_for(item_id)
	if max_durability <= 0:
		return false
	return clampi(int(durability.get(slot_id, max_durability)), 0, max_durability) <= 0

func _equipment_stat_bonus_for_ui(slots: Dictionary, durability: Dictionary, enhancement: Dictionary = {}) -> Dictionary:
	var result = {}
	var effective_enhancement = enhancement if not enhancement.is_empty() else _equipment_enhancement_for_ui()
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(slots.get(slot_id, ""))
		if item_id == "" or _equipment_slot_is_broken_for_ui(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		var stats = EquipmentModel.stats_for(item_id)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(stats.get(key, 0))
		var enhance_level = _equipment_enhance_level_for_ui(slot_id, item_id, effective_enhancement)
		var enhance_stats = EquipmentModel.enhance_stat_bonus_for(item_id, enhance_level)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(enhance_stats.get(key, 0))
	return result

func _equipment_spirit_ids_for_ui(slots: Dictionary, durability: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(slots.get(slot_id, ""))
		if item_id == "" or _equipment_slot_is_broken_for_ui(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if spirit_id != "" and not result.has(spirit_id):
				result.append(spirit_id)
	return result

func _equipment_spirit_source_entries_for_ui(slots: Dictionary, durability: Dictionary) -> Array[Dictionary]:
	var source_lookup = {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(slots.get(slot_id, ""))
		if item_id == "" or _equipment_slot_is_broken_for_ui(slot_id, item_id, durability):
			continue
		if not _equipment_slot_meets_requirements_for_ui(slot_id, item_id):
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			var normalized_spirit_id = str(spirit_id)
			if normalized_spirit_id == "":
				continue
			if not source_lookup.has(normalized_spirit_id):
				source_lookup[normalized_spirit_id] = []
			var sources = source_lookup[normalized_spirit_id] as Array
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
	var slot_id = EquipmentModel.slot_for(item_id)
	if slot_id == "":
		return {}
	var before_slots = _equipment_slots_for_ui()
	var current_item_id = str(before_slots.get(slot_id, ""))
	var after_slots = before_slots.duplicate(true)
	after_slots[slot_id] = item_id
	var durability = _equipment_durability_for_ui()
	var enhancement = _equipment_enhancement_for_ui()
	var before_bonus = _equipment_stat_bonus_for_ui(before_slots, durability, enhancement)
	var after_bonus = _equipment_stat_bonus_for_ui(after_slots, durability, enhancement)
	var stat_changes: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		var before_value = int(before_bonus.get(key, 0))
		var after_value = int(after_bonus.get(key, 0))
		var delta = after_value - before_value
		if delta == 0:
			continue
		stat_changes.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"before": before_value,
			"after": after_value,
			"delta": delta,
		})
	var before_spirits = _equipment_spirit_ids_for_ui(before_slots, durability)
	var after_spirits = _equipment_spirit_ids_for_ui(after_slots, durability)
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
	var slots = _equipment_slots_for_ui()
	var durability = _equipment_durability_for_ui()
	var missing = 0
	for slot_id in EquipmentModel.slot_ids():
		var item_id = str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var max_durability = EquipmentModel.max_durability_for(item_id)
		if max_durability <= 0:
			continue
		var current = clampi(int(durability.get(slot_id, max_durability)), 0, max_durability)
		missing += maxi(0, max_durability - current)
	return {
		"missingDurability": missing,
		"cost": PlayerProgressModel.equipment_repair_cost_for_missing(missing),
		"stoneCoins": _profile_stone_coins_for_ui(),
	}

func _can_equip_item_for_ui(item_id: String) -> Dictionary:
	var item_label = EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"message": "%s 不能装备。" % item_label,
		}
	var player_level = _player_level_for_ui()
	var required_level = EquipmentModel.required_level_for(item_id)
	var player_rebirth = _player_rebirth_for_ui()
	var required_rebirth = EquipmentModel.required_rebirth_for(item_id)
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
	var preview = _equipment_change_preview_for_ui(item_id)
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
			var change = change_value as Dictionary
			var delta = int(change.get("delta", 0))
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
	var lines = EquipmentModel.detail_lines_for_item(item_id)
	var status_lines = _equipment_requirement_status_lines(item_id, use_bbcode)
	if status_lines.is_empty():
		return lines
	var requirement_text = EquipmentModel.requirement_text_for(item_id)
	var insert_index = -1
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
	var required_level = EquipmentModel.required_level_for(item_id)
	var required_rebirth = EquipmentModel.required_rebirth_for(item_id)
	if required_level <= 1 and required_rebirth <= 0:
		return []
	var parts: Array[String] = []
	var player_level = _player_level_for_ui()
	if required_level > 1:
		var level_met = player_level >= required_level
		var level_text = "当前 Lv%d：%s" % [player_level, "已满足" if level_met else "未满足"]
		if use_bbcode:
			var level_color = EQUIPMENT_COMPARE_GAIN_COLOR if level_met else EQUIPMENT_COMPARE_LOSS_COLOR
			level_text = "[color=%s]%s[/color]" % [level_color, _bbcode_escape(level_text)]
		parts.append(level_text)
	var player_rebirth = _player_rebirth_for_ui()
	if required_rebirth > 0:
		var rebirth_met = player_rebirth >= required_rebirth
		var rebirth_text = "当前 %s：%s" % [
			EquipmentModel.rebirth_label_for(player_rebirth),
			"已满足" if rebirth_met else "未满足",
		]
		if use_bbcode:
			var rebirth_color = EQUIPMENT_COMPARE_GAIN_COLOR if rebirth_met else EQUIPMENT_COMPARE_LOSS_COLOR
			rebirth_text = "[color=%s]%s[/color]" % [rebirth_color, _bbcode_escape(rebirth_text)]
		parts.append(rebirth_text)
	return ["需求状态: %s" % "；".join(parts)]

func _colored_equipment_delta(text: String, delta: int) -> String:
	var color = EQUIPMENT_COMPARE_GAIN_COLOR if delta > 0 else EQUIPMENT_COMPARE_LOSS_COLOR
	return "[color=%s]%s[/color]" % [color, text]

func _bbcode_escape(text: String) -> String:
	return text.replace("[", "[lb]").replace("]", "[rb]")

func _selected_backpack_slot() -> Dictionary:
	var slots = PlayerProgressModel.backpack_slots(player_profile)
	if backpack_selected_slot_index < 0 or backpack_selected_slot_index >= slots.size():
		return {}
	return slots[backpack_selected_slot_index]

func _selected_backpack_item_id() -> String:
	return str(_selected_backpack_slot().get("itemId", ""))

func _backpack_slot_index_for_item(item_id: String) -> int:
	var slots = PlayerProgressModel.backpack_slots(player_profile)
	for index in range(slots.size()):
		if str((slots[index] as Dictionary).get("itemId", "")) == item_id:
			return index
	return -1

func _on_backpack_use_pressed() -> void:
	var item_id = _selected_backpack_item_id()
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
	var result = PlayerProgressModel.equip_item(player_profile, item_id)
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
		host._save_player_profile_now()
	_set_world_log_message("\n".join(log_lines))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	if status_label != null:
		host._update_hud_text()

func _submit_server_equipment_equip(item_id: String) -> void:
	if item_id == "" or not EquipmentModel.is_equipment(item_id) or not _is_server_account_session():
		return
	var parsed = await _request_server_equipment_equip(item_id, true)
	var log_lines: Array[String] = _string_array_values(parsed.get("logLines", []))
	_set_world_log_message("\n".join(log_lines))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	if status_label != null:
		host._update_hud_text()

func _request_server_equipment_equip(item_id: String, refresh_backpack_before: bool = true) -> Dictionary:
	if item_id == "" or not EquipmentModel.is_equipment(item_id) or not _is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "logLines": ["请先登录服务器。"]}
	equipment_action_request_pending = true
	if refresh_backpack_before:
		_refresh_backpack_panel()
	var response = await host._auto_http_request_spec(ServerAuthClientModel.equipment_equip_request(
		_server_profile_base_url(),
		_server_profile_token(),
		item_id
	))
	equipment_action_request_pending = false
	if not _is_server_account_session():
		return {"ok": false, "message": "装备同步已取消。", "logLines": ["装备同步已取消。"]}
	var parsed = ServerAuthClientModel.parse_equipment_equip_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
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
				var quest_message = str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			host._mark_progress_ui_caches_dirty()
		else:
			log_lines = ["装备成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		if _handle_session_invalid_response(parsed):
			parsed["logLines"] = log_lines
			return parsed
		var summary = parsed.get("profileSummary", {})
		if summary is Dictionary:
			_apply_server_profile_summary(summary as Dictionary)
	parsed["logLines"] = log_lines
	return parsed

func _use_backpack_player_exp_item(item_id: String) -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("world_item_use", {"itemId": item_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		_refresh_equipment_panel()
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return
	var result = PlayerProgressModel.use_world_player_exp_item(player_profile, item_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_equipment_panel()
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()

func _use_backpack_encounter_stone(item_id: String) -> void:
	var item_label = BackpackModel.label_for(item_id)
	if hang_session_request_active:
		_set_world_log_message("挂机同步中，请稍候。")
		return
	if _current_player_is_party_member():
		_set_world_log_message("队伍中只有队长可以使用%s。" % item_label)
		return
	if PlayerProgressModel.backpack_item_count(player_profile, item_id) <= 0:
		_set_world_log_message("%s 不够了。" % item_label)
		return
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone = EncounterModel.zone_for_cell(map_data, player_cell)
	if zone.is_empty():
		_set_world_log_message("需要站在遇敌区域，才能使用%s。" % item_label)
		return
	if host._server_hang_session_enabled():
		var server_started = await host._request_server_hang_session_start("encounter_stone", player_cell, item_id)
		if not server_started:
			return
		_activate_encounter_stone(item_id)
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		return
	var slots = BackpackModel.consume(PlayerProgressModel.backpack_slots(player_profile), item_id, 1)
	player_profile = PlayerProgressModel.with_backpack_slots(player_profile, slots)
	_activate_encounter_stone(item_id)
	if profile_save_enabled:
		host._save_player_profile_now()
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()

func _activate_encounter_stone(item_id: String) -> void:
	encounter_stone_item_id = item_id
	encounter_stone_interval = BackpackModel.world_encounter_interval_for(item_id)
	encounter_stone_remaining = BackpackModel.world_encounter_duration_for(item_id)
	encounter_stone_elapsed = 0.0
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position) if player != null and not map_data.is_empty() else Vector2i.ZERO
	player_profile = PlayerProgressModel.start_hang_session(player_profile, "encounter_stone", current_map_id, player_cell)
	host._set_hang_mode(false)
	host._sync_hang_button_text()
	_set_world_log_message("%s 已生效，站在遇敌区域每%d秒遇敌。" % [
		BackpackModel.label_for(item_id),
		int(roundf(encounter_stone_interval)),
	])

func _encounter_stone_active() -> bool:
	return encounter_stone_item_id != "" and encounter_stone_interval > 0.0 and encounter_stone_remaining > 0.0

func _clear_encounter_stone_effect(show_message: bool = false, sync_server: bool = true) -> void:
	var item_label = BackpackModel.label_for(encounter_stone_item_id, "遇敌石")
	var was_active = _encounter_stone_active()
	if was_active:
		player_profile = PlayerProgressModel.stop_hang_session(player_profile, "encounter_stone_end")
	encounter_stone_item_id = ""
	encounter_stone_interval = 0.0
	encounter_stone_remaining = 0.0
	encounter_stone_elapsed = 0.0
	host._sync_hang_button_text()
	if was_active and sync_server:
		host._request_server_hang_session_stop("encounter_stone_end")
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
	if player == null or map_data.is_empty() or player.is_auto_moving() or host._dialog_is_open() or has_pending_interaction or host._world_menu_is_open():
		encounter_stone_elapsed = 0.0
		return
	if encounter_grace_remaining > 0.0:
		return
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	var zone = EncounterModel.zone_for_cell(map_data, player_cell)
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
	var target_count = 0
	if BackpackModel.item_can_world_player_exp(item_id):
		var player_value = player_profile.get("player", {})
		var player_dict = player_value as Dictionary if player_value is Dictionary else {}
		var player_button = Button.new()
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
	var pets = PlayerProgressModel.party_pet_instances(player_profile)
	for pet in pets:
		var max_hp = maxi(1, int(pet.get("maxHp", 1)))
		var hp = clampi(int(pet.get("hp", max_hp)), 0, max_hp)
		var button = Button.new()
		if BackpackModel.item_can_world_pet_exp(item_id):
			button.text = "%s\nLv%d 经验 %d/%d" % [
				str(pet.get("name", "宠物")),
				int(pet.get("level", 1)),
				int(pet.get("exp", 0)),
				int(pet.get("nextExp", PlayerProgressModel.exp_to_next_level(int(pet.get("level", 1))))),
			]
		elif BackpackModel.item_can_world_mm_stone(item_id):
			var stat_key = PetRebirthMmModel.normalized_stat_key(BackpackModel.world_mm_stone_stat_for(item_id))
			var stage = PetRebirthMmModel.helper_stage_for_pet(pet)
			var helper_record = PetRebirthMmModel.normalized_helper_record(pet.get("petRebirthHelper", {}), stage)
			var points = PetRebirthMmModel.normalized_stone_points(helper_record.get("stonePoints", {}))
			var current_points = int(points.get(stat_key, 0)) if stat_key != "" else 0
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
		var allow_full_hp_use = BackpackModel.world_pet_heal_allows_full_hp_use(item_id)
		if BackpackModel.item_can_world_pet_exp(item_id):
			button.disabled = int(pet.get("level", 1)) >= PlayerProgressModel.MAX_PET_LEVEL
		elif BackpackModel.item_can_world_mm_stone(item_id):
			var stone_stat_key = PetRebirthMmModel.normalized_stat_key(BackpackModel.world_mm_stone_stat_for(item_id))
			var helper_stage = PetRebirthMmModel.helper_stage_for_pet(pet)
			var target_record = PetRebirthMmModel.normalized_helper_record(pet.get("petRebirthHelper", {}), helper_stage)
			var target_points = PetRebirthMmModel.normalized_stone_points(target_record.get("stonePoints", {}))
			button.disabled = (
				helper_stage <= 0
				or int(pet.get("level", 1)) >= 74
				or stone_stat_key == ""
				or int(target_points.get(stone_stat_key, 0)) >= PetRebirthMmModel.STONE_CAPACITY
			)
		else:
			button.disabled = (hp >= max_hp and not allow_full_hp_use) or not BackpackModel.item_can_world_pet_heal(item_id)
		var instance_id = str(pet.get("instanceId", ""))
		button.set_meta("pet_instance_id", instance_id)
		button.pressed.connect(func() -> void:
			_use_backpack_item_on_pet(item_id, instance_id)
		)
		backpack_target_container.add_child(button)
		target_count += 1
	if target_count <= 0:
		var empty_label = Label.new()
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
	var result = await _use_world_pet_heal_item_and_log(item_id, instance_id)
	var used = bool(result.get("ok", false))
	var healed = maxi(0, int(result.get("heal", 0)))
	backpack_pending_use_item_id = item_id if PlayerProgressModel.backpack_item_count(player_profile, item_id) > 0 else ""
	_refresh_backpack_panel()
	if used:
		_show_backpack_pet_heal_popup(instance_id, healed)
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()

func _use_world_pet_heal_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("world_item_use", {"itemId": item_id, "instanceId": instance_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_quick_bar()
		var result = parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		result["ok"] = bool(parsed.get("ok", false))
		return result
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return {"ok": false, "message": "使用物品需要连接服务器后执行。"}
	var result = PlayerProgressModel.use_world_pet_heal_item(player_profile, item_id, instance_id)
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
		host._save_player_profile_now()
	_set_world_log_message("\n".join(log_lines))
	_refresh_quick_bar()
	return result

func _use_world_pet_exp_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("world_item_use", {"itemId": item_id, "instanceId": instance_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		var result = parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		result["ok"] = bool(parsed.get("ok", false))
		return result
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return {"ok": false, "message": "使用物品需要连接服务器后执行。"}
	var result = PlayerProgressModel.use_world_pet_exp_item(player_profile, item_id, instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()
	return result

func _use_world_mm_stone_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("world_item_use", {"itemId": item_id, "instanceId": instance_id}, "使用物品失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		var result = parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		result["ok"] = bool(parsed.get("ok", false))
		return result
	if _local_profile_mutation_blocked_for_server_only("使用物品"):
		return {"ok": false, "message": "使用物品需要连接服务器后执行。"}
	var result = PlayerProgressModel.use_world_mm_stone_item(player_profile, item_id, instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()
	return result

func _use_backpack_pet_egg_item(item_id: String) -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("world_item_use", {"itemId": item_id}, "使用宠物蛋失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		backpack_pending_use_item_id = ""
		_refresh_backpack_panel()
		_refresh_pet_panel()
		_refresh_quick_bar()
		if status_label != null:
			host._update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("使用宠物蛋"):
		return
	var result = PlayerProgressModel.use_world_pet_egg_item(player_profile, item_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	backpack_pending_use_item_id = ""
	_refresh_backpack_panel()
	_refresh_pet_panel()
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()

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
	var label = Label.new()
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
	var tween = host.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "modulate:a", 0.0, BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.tween_property(label, "scale", Vector2(0.72, 0.72), BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "offset_top", -43.0, BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "offset_bottom", -7.0, BACKPACK_HEAL_POPUP_DURATION_SECONDS).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.chain().tween_callback(Callable(label, "queue_free"))

func _open_shop_panel(next_shop_id: String = "") -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	var resolved_shop_id = next_shop_id if next_shop_id != "" else ShopCatalogModel.DEFAULT_SHOP_ID
	if ShopCatalogModel.shop_for_id(resolved_shop_id).is_empty():
		resolved_shop_id = ShopCatalogModel.DEFAULT_SHOP_ID
	host._close_dialog()
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
	_close_party_panel(false)
	_close_family_panel(false)
	shop_active_id = resolved_shop_id
	shop_mode = "buy"
	shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_shop_panel()
	host._layout_hud()

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
	var cache_key = "%s|%s|%s|%d" % [shop_active_id, shop_mode, item_id, count]
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
		host.call_deferred("_apply_queued_shop_detail_item")

func _apply_queued_shop_detail_item() -> void:
	shop_detail_update_queued = false
	if shop_panel == null or not shop_panel.visible:
		return
	var detail_text = _shop_detail_text_cached(shop_pending_detail_item_id, shop_pending_detail_count)
	_apply_shop_detail_text(shop_pending_detail_bbcode_enabled, detail_text)

func _select_shop_item(item_id: String, defer_detail_update: bool = false) -> void:
	if shop_selected_item_id == item_id:
		return
	var previous_selected_item_id = shop_selected_item_id
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
			var currency = ShopCatalogModel.currency_for(shop_active_id)
			shop_coin_label.text = "%s %d" % [ShopCatalogModel.currency_label(currency), _profile_currency_amount_for_ui(currency)]
		if shop_buy_button != null:
			shop_buy_button.button_pressed = shop_mode == "buy"
		if shop_sell_button != null:
			shop_sell_button.button_pressed = shop_mode == "sell"
	if shop_buy_button != null:
		shop_buy_button.disabled = shop_action_request_pending
	if shop_sell_button != null:
		shop_sell_button.disabled = shop_action_request_pending
	var backpack_slots_cache = _shop_cached_backpack_slots_for_ui()
	var backpack_counts_cache = _shop_cached_backpack_counts_for_ui(backpack_slots_cache)
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
			var empty_label = Label.new()
			empty_label.text = "暂无可%s的道具" % ("出售" if shop_mode == "sell" else "购买")
			empty_label.add_theme_font_size_override("font_size", 16)
			shop_list_container.add_child(empty_label)
		else:
			for item_id in valid_ids:
				var button = Button.new()
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
	var quantity_max = _shop_quantity_max_cached(shop_selected_item_id, backpack_slots_cache, backpack_counts_cache)
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id, quantity_max)
	var selected_is_equipment = EquipmentModel.is_equipment(shop_selected_item_id)
	if defer_detail_update and not rebuild_list:
		_queue_shop_detail_item(selected_is_equipment, shop_selected_item_id, int(backpack_counts_cache.get(shop_selected_item_id, 0)))
	else:
		var next_detail_text = _shop_detail_text_cached(shop_selected_item_id, int(backpack_counts_cache.get(shop_selected_item_id, 0)))
		_apply_shop_detail_text(selected_is_equipment, next_detail_text)
	_refresh_shop_quantity_controls(quantity_max)
	if selected_is_equipment or (shop_equip_after_buy_button != null and shop_equip_after_buy_button.visible):
		_refresh_shop_equip_after_buy_button(quantity_max)
	if shop_action_button != null:
		var next_action_text = _shop_action_text()
		if shop_action_button.text != next_action_text:
			shop_action_button.text = next_action_text
		var next_disabled = shop_action_request_pending or shop_selected_item_id == "" or quantity_max <= 0
		if shop_action_button.disabled != next_disabled:
			shop_action_button.disabled = next_disabled
	if rebuild_list and shop_repair_button != null:
		shop_repair_button.visible = shop_active_id == FIREBUD_EQUIPMENT_SHOP_ID
	if shop_repair_button != null:
		if shop_repair_button.visible:
			var repair_quote = _equipment_repair_quote_for_ui()
			var missing_durability = int(repair_quote.get("missingDurability", 0))
			var repair_cost = int(repair_quote.get("cost", 0))
			var next_repair_text = "修理中" if shop_action_request_pending else ("修理 %d石币" % repair_cost if missing_durability > 0 else "修理")
			if shop_repair_button.text != next_repair_text:
				shop_repair_button.text = next_repair_text
			var next_repair_disabled = shop_action_request_pending or missing_durability <= 0 or _profile_stone_coins_for_ui() < repair_cost
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
		var effective_counts = counts if not counts.is_empty() else _backpack_counts_for_ui()
		for entry in ShopCatalogModel.entries_for(shop_active_id):
			var item_id = str(entry.get("itemId", ""))
			if item_id != "" and ShopCatalogModel.is_sellable(shop_active_id, item_id) and int(effective_counts.get(item_id, 0)) > 0:
				result.append(item_id)
	else:
		for entry in ShopCatalogModel.buyable_entries_for(shop_active_id):
			var item_id = str(entry.get("itemId", ""))
			if item_id != "":
				result.append(item_id)
	return result

func _first_shop_item_id_for_mode(mode: String) -> String:
	var ids = _shop_item_ids_for_mode(mode)
	return ids[0] if not ids.is_empty() else ""

func _shop_item_button_text(item_id: String, count: int = -1) -> String:
	var effective_count = count if count >= 0 else _backpack_item_count_for_ui(item_id)
	var currency_label = ShopCatalogModel.currency_label_for(shop_active_id)
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
	var effective_count = count if count >= 0 else _backpack_item_count_for_ui(item_id)
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
	var buy_price = ShopCatalogModel.buy_price_for(shop_active_id, item_id)
	if buy_price <= 0:
		return 0
	var currency = ShopCatalogModel.currency_for(shop_active_id)
	var affordable = int(floor(float(_profile_currency_amount_for_ui(currency)) / float(buy_price)))
	var capacity = _backpack_available_capacity_for_ui(item_id, slots)
	return mini(999, mini(affordable, capacity))

func _clamped_shop_quantity(value: int, item_id: String, max_quantity: int = -1) -> int:
	var effective_max = max_quantity if max_quantity >= 0 else _shop_quantity_max(item_id)
	if effective_max <= 0:
		return 1
	return clampi(value, 1, effective_max)

func _set_shop_quantity(value: int) -> void:
	shop_quantity = _clamped_shop_quantity(value, shop_selected_item_id)
	_refresh_shop_panel(false)

func _refresh_shop_quantity_controls(max_quantity: int = -1) -> void:
	var effective_max = max_quantity if max_quantity >= 0 else _shop_quantity_max(shop_selected_item_id)
	var controls_enabled = shop_selected_item_id != "" and effective_max > 0 and not shop_action_request_pending
	if shop_quantity_spinbox != null:
		shop_quantity_spinbox.set_block_signals(true)
		if shop_quantity_spinbox.min_value != 1:
			shop_quantity_spinbox.min_value = 1
		var next_max = maxf(1.0, float(effective_max))
		if shop_quantity_spinbox.max_value != next_max:
			shop_quantity_spinbox.max_value = next_max
		var next_value = float(shop_quantity)
		if shop_quantity_spinbox.value != next_value:
			shop_quantity_spinbox.value = next_value
		if shop_quantity_spinbox.editable != controls_enabled:
			shop_quantity_spinbox.editable = controls_enabled
		shop_quantity_spinbox.set_block_signals(false)
	if shop_quantity_minus_button != null:
		var minus_disabled = not controls_enabled or shop_quantity <= 1
		if shop_quantity_minus_button.disabled != minus_disabled:
			shop_quantity_minus_button.disabled = minus_disabled
	if shop_quantity_plus_button != null:
		var plus_disabled = not controls_enabled or shop_quantity >= effective_max
		if shop_quantity_plus_button.disabled != plus_disabled:
			shop_quantity_plus_button.disabled = plus_disabled
	if shop_quantity_max_button != null:
		var max_disabled = not controls_enabled or shop_quantity >= effective_max
		if shop_quantity_max_button.disabled != max_disabled:
			shop_quantity_max_button.disabled = max_disabled

func _refresh_shop_equip_after_buy_button(quantity_max: int = -1) -> void:
	if shop_equip_after_buy_button == null:
		return
	var is_buy_equipment = shop_mode == "buy" and EquipmentModel.is_equipment(shop_selected_item_id)
	shop_equip_after_buy_button.visible = is_buy_equipment
	if not is_buy_equipment:
		shop_equip_after_buy = false
		shop_equip_after_buy_button.button_pressed = false
		shop_equip_after_buy_button.disabled = true
		return
	var equip_check = _shop_can_equip_item_cached(shop_selected_item_id)
	var can_buy = (quantity_max if quantity_max >= 0 else _shop_quantity_max(shop_selected_item_id)) > 0
	var can_equip = bool(equip_check.get("ok", false))
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
	var unit_price = ShopCatalogModel.sell_price_for(shop_active_id, shop_selected_item_id) if shop_mode == "sell" else ShopCatalogModel.buy_price_for(shop_active_id, shop_selected_item_id)
	var total_price = unit_price * shop_quantity
	var currency_label = ShopCatalogModel.currency_label_for(shop_active_id)
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
	var result = PlayerProgressModel.sell_shop_item(player_profile, shop_active_id, shop_selected_item_id, shop_quantity) if shop_mode == "sell" else PlayerProgressModel.buy_shop_item(player_profile, shop_active_id, shop_selected_item_id, shop_quantity)
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
			var equip_result = PlayerProgressModel.equip_item(player_profile, shop_selected_item_id)
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
		host._save_player_profile_now()
	_set_world_log_message("\n".join(log_lines))
	if shop_mode == "sell" and _backpack_item_count_for_ui(shop_selected_item_id) <= 0:
		shop_selected_item_id = _first_shop_item_id_for_mode(shop_mode)
	shop_quantity = _clamped_shop_quantity(shop_quantity, shop_selected_item_id)
	if shop_mode != "buy" or not EquipmentModel.is_equipment(shop_selected_item_id):
		shop_equip_after_buy = false
	_refresh_shop_panel()
	if status_label != null:
		host._update_hud_text()

func _submit_server_shop_action() -> void:
	if shop_selected_item_id == "" or not _is_server_account_session():
		return
	var request_mode = shop_mode
	var request_shop_id = shop_active_id
	var request_item_id = shop_selected_item_id
	var request_amount = shop_quantity
	var requested_equip_after_buy = shop_equip_after_buy and request_mode == "buy" and EquipmentModel.is_equipment(request_item_id)
	shop_action_request_pending = true
	_refresh_shop_panel(false)
	var response = await host._auto_http_request_spec(ServerAuthClientModel.shop_transaction_request(
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
	var parsed = ServerAuthClientModel.parse_shop_transaction_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if _handle_session_invalid_response(parsed):
		shop_action_request_pending = false
		return
	var log_lines: Array[String] = [str(parsed.get("message", "商店交易失败。"))]
	var should_equip_after_buy = false
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			for message in parsed.get("questMessages", []):
				var quest_message = str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			if requested_equip_after_buy:
				should_equip_after_buy = true
			host._mark_progress_ui_caches_dirty()
		else:
			log_lines = [str(parsed.get("message", "商店交易成功。")), "正在读取服务器档案。"]
			for message in parsed.get("questMessages", []):
				var quest_message = str(message)
				if quest_message != "":
					log_lines.append(quest_message)
			_set_world_log_message("\n".join(log_lines))
			var recovery_parsed = await _pull_server_profile_after_authoritative_shop_action()
			if not _is_server_account_session():
				shop_action_request_pending = false
				return
			if bool(recovery_parsed.get("ok", false)) and recovery_parsed.get("profile", null) is Dictionary:
				log_lines = [str(parsed.get("message", "商店交易成功。")), "已刷新服务器档案。"]
				for message in parsed.get("questMessages", []):
					var recovery_quest_message = str(message)
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
		var equip_parsed = await _request_server_equipment_equip(request_item_id, false)
		log_lines.append_array(_string_array_values(equip_parsed.get("logLines", [])))
	shop_action_request_pending = false
	_refresh_shop_after_action(request_mode, request_item_id)
	_set_world_log_message("\n".join(log_lines))
	if status_label != null:
		host._update_hud_text()

func _pull_server_profile_after_authoritative_shop_action() -> Dictionary:
	if not _is_server_account_session():
		return {"ok": false, "message": "请先登录服务器。", "code": "not_server_session"}
	server_profile_sync_state = "loading"
	server_profile_sync_message = "正在读取服务器档案。"
	var response = await host._auto_http_request_spec(ServerAuthClientModel.profile_request(
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
	var result = PlayerProgressModel.repair_all_equipment(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_shop_panel()
	if equipment_panel != null and equipment_panel.visible:
		_refresh_equipment_panel()
	if player_status_panel != null and player_status_panel.visible:
		_refresh_player_status_panel()
	_refresh_quick_bar()
	if status_label != null:
		host._update_hud_text()

func _submit_server_equipment_repair_all() -> void:
	if not _is_server_account_session():
		return
	shop_action_request_pending = true
	_refresh_shop_panel()
	var response = await host._auto_http_request_spec(ServerAuthClientModel.equipment_repair_all_request(
		_server_profile_base_url(),
		_server_profile_token()
	))
	shop_action_request_pending = false
	if not _is_server_account_session():
		return
	var parsed = ServerAuthClientModel.parse_equipment_repair_all_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	var log_lines: Array[String] = [str(parsed.get("message", "修理失败。"))]
	if bool(parsed.get("ok", false)):
		var server_profile = parsed.get("profile", null)
		if server_profile is Dictionary:
			player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
			_apply_server_profile_summary(parsed.get("profileSummary", {}) as Dictionary if parsed.get("profileSummary", {}) is Dictionary else {})
			if profile_save_enabled:
				PlayerProgressModel.save_profile(player_profile)
			host._mark_progress_ui_caches_dirty()
		else:
			log_lines = ["修理成功，但服务器没有返回档案，请重新拉取。"]
			_queue_server_profile_pull()
	else:
		if _handle_session_invalid_response(parsed):
			return
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
		host._update_hud_text()

func _create_pet_skill_panel() -> void:
	pet_skill_panel = _panel_container("PetSkillPanel")
	pet_skill_panel.visible = false
	pet_skill_panel.z_index = 25
	var column = VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 8)
	pet_skill_panel.add_child(column)

	var header = HBoxContainer.new()
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

	var selector_row = HBoxContainer.new()
	selector_row.add_theme_constant_override("separation", 8)
	column.add_child(selector_row)
	var selector_label = Label.new()
	selector_label.text = "宠物"
	selector_label.custom_minimum_size = Vector2(52, 40)
	selector_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	selector_row.add_child(selector_label)
	pet_skill_pet_option = OptionButton.new()
	pet_skill_pet_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pet_skill_pet_option.custom_minimum_size = Vector2(0, 40)
	pet_skill_pet_option.item_selected.connect(_on_pet_skill_pet_selected)
	selector_row.add_child(pet_skill_pet_option)

	var body = HBoxContainer.new()
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
		var button = Button.new()
		button.toggle_mode = true
		button.custom_minimum_size = Vector2(118, 54)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 15)
		button.pressed.connect(_select_pet_skill_slot.bind(slot))
		pet_skill_slot_grid.add_child(button)
		pet_skill_slot_buttons[slot] = button

	var detail_column = VBoxContainer.new()
	detail_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_column.add_theme_constant_override("separation", 8)
	body.add_child(detail_column)
	var detail_scroll = ScrollContainer.new()
	detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_column.add_child(detail_scroll)
	pet_skill_detail_label = Label.new()
	pet_skill_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pet_skill_detail_label.add_theme_font_size_override("font_size", 16)
	pet_skill_detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.add_child(pet_skill_detail_label)

	var learn_row = HBoxContainer.new()
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
	var column = VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 10)
	pet_cultivation_panel.add_child(column)

	var header = HBoxContainer.new()
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

	var preview_scroll = ScrollContainer.new()
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
	host._set_hang_mode(false)
	host._close_dialog()
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
	var active = PlayerProgressModel.active_pet(player_profile)
	if pet_selected_instance_id == "" or PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id).is_empty():
		pet_selected_instance_id = str(active.get("instanceId", ""))
	_refresh_pet_panel()
	host._layout_hud()

func _close_pet_panel() -> void:
	var changed = _hide_control(pet_panel, false)
	pet_panel_stable_access_override = false
	_close_pet_rename_panel()
	_close_pet_cultivation_panel()
	if changed and hud_root != null:
		host._layout_hud()

func _pet_panel_has_stable_access() -> bool:
	return pet_panel_stable_access_override or PlayerProgressModel.has_remote_stable(player_profile)

func _open_pet_skill_panel(training_mode: bool = false, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
		var active = PlayerProgressModel.active_pet(player_profile)
		if not active.is_empty():
			pet_selected_instance_id = str(active.get("instanceId", ""))
		else:
			for instance in PlayerProgressModel.all_pet_instances(player_profile):
				pet_selected_instance_id = str(instance.get("instanceId", ""))
				break
	pet_skill_selected_slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	pet_skill_panel.visible = true
	_refresh_pet_skill_panel()
	host._layout_hud()

func _close_pet_skill_panel() -> void:
	_hide_control(pet_skill_panel)

func _refresh_pet_skill_panel() -> void:
	if pet_skill_panel == null or pet_skill_pet_option == null or pet_skill_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var all_instances = PlayerProgressModel.all_pet_instances(player_profile)
	if pet_selected_instance_id != "" and PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id).is_empty():
		pet_selected_instance_id = ""
	if pet_selected_instance_id == "" and not all_instances.is_empty():
		pet_selected_instance_id = str(all_instances[0].get("instanceId", ""))
	if pet_skill_title_label != null:
		pet_skill_title_label.text = "%s：%s" % ["宠技训练" if pet_skill_training_mode else "宠物技能", PetSkillTrainingModel.trainer_label(pet_skill_trainer_id) if pet_skill_training_mode else "技能槽"]
	_sync_pet_skill_pet_option(all_instances)
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	_refresh_pet_skill_slots(selected)
	_refresh_pet_skill_detail(selected)
	_refresh_pet_skill_learn_controls(selected)

func _sync_pet_skill_pet_option(instances: Array[Dictionary]) -> void:
	pet_skill_pet_option.clear()
	var selected_index = 0
	for index in range(instances.size()):
		var instance = instances[index]
		var instance_id = str(instance.get("instanceId", ""))
		var label = "%s Lv%d %s" % [
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
	var options = PlayerProgressModel.pet_skill_slot_options_for_instance(selected) if not selected.is_empty() else []
	for slot in range(1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS + 1):
		var button = pet_skill_slot_buttons.get(slot, null)
		if button == null:
			continue
		var button_ref = button as Button
		var label = "未配置"
		var skill_id = ""
		if slot - 1 < options.size():
			var option = options[slot - 1] as Dictionary
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
	var slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var slots = PlayerProgressModel.pet_skill_slots_for_instance(selected)
	var skill_id = str(slots[slot - 1]) if slot - 1 < slots.size() else ""
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
		var effect_type = BattleActionCatalog.effect_type_for(skill_id)
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
	var learnable_count = 0
	if not selected.is_empty():
		pet_skill_learn_option.add_item("空技能  0石币", learnable_count)
		pet_skill_learn_option.set_item_metadata(learnable_count, "")
		learnable_count += 1
		for option in PlayerProgressModel.learnable_pet_skill_options(player_profile, pet_selected_instance_id, pet_skill_trainer_id):
			var skill_id = str(option.get("id", ""))
			if skill_id == "":
				continue
			var cost = int(option.get("cost", PetSkillTrainingModel.DEFAULT_COST))
			var label = "%s  已学" % str(option.get("label", skill_id)) if bool(option.get("learned", false)) else "%s  %d石币" % [str(option.get("label", skill_id)), cost]
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
		var parsed = await _submit_server_profile_action("pet_skill_move_slot", {
			"instanceId": pet_selected_instance_id,
			"slot": pet_skill_selected_slot,
			"direction": direction,
		}, "移动宠物技能失败。")
		var result = parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		if bool(parsed.get("ok", false)):
			pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_skill_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("宠物技能调整"):
		return
	var result = PlayerProgressModel.move_pet_skill_slot(player_profile, pet_selected_instance_id, pet_skill_selected_slot, direction)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		if profile_save_enabled:
			host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()

func _on_pet_skill_learn_pressed() -> void:
	if pet_skill_learn_option == null or pet_skill_learn_option.get_item_count() <= 0:
		return
	var index = pet_skill_learn_option.selected
	var skill_id = str(pet_skill_learn_option.get_item_metadata(index))
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var existing_skill_id = _pet_skill_id_for_selected_slot(selected)
	if existing_skill_id != "" and existing_skill_id != skill_id:
		_open_pet_skill_overwrite_dialog(skill_id)
		return
	_apply_pet_skill_to_selected_slot(skill_id)

func _pet_skill_id_for_selected_slot(instance: Dictionary) -> String:
	var slots = PlayerProgressModel.pet_skill_slots_for_instance(instance)
	var slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	return str(slots[slot - 1]) if slot - 1 < slots.size() else ""

func _apply_pet_skill_to_selected_slot(skill_id: String) -> void:
	var slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_skill_set_slot", {
			"instanceId": pet_selected_instance_id,
			"skillId": skill_id,
			"slot": slot,
			"trainerId": pet_skill_trainer_id,
		}, "学习宠物技能失败。")
		var result = parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		if bool(parsed.get("ok", false)):
			pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_skill_panel()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		return
	if _local_profile_mutation_blocked_for_server_only("宠物技能学习"):
		return
	var result = PlayerProgressModel.learn_pet_skill_to_slot(player_profile, pet_selected_instance_id, skill_id, slot, pet_skill_trainer_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_skill_selected_slot = int(result.get("slot", pet_skill_selected_slot))
		if profile_save_enabled:
			host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()

func _open_pet_skill_overwrite_dialog(skill_id: String) -> void:
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var existing_skill_id = _pet_skill_id_for_selected_slot(selected)
	if existing_skill_id == "":
		_apply_pet_skill_to_selected_slot(skill_id)
		return
	var existing_label = BattleActionCatalog.label_for(existing_skill_id, existing_skill_id)
	var next_label = "空技能" if skill_id == "" else BattleActionCatalog.label_for(skill_id, skill_id)
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
	host._update_dialog_text()
	dialog_panel.move_to_front()
	dialog_panel.visible = true
	host._layout_hud()

func _apply_pet_skill_overwrite_from_dialog() -> void:
	if active_dialog_interaction.is_empty():
		return
	pet_selected_instance_id = str(active_dialog_interaction.get("instanceId", pet_selected_instance_id))
	pet_skill_trainer_id = str(active_dialog_interaction.get("trainerId", pet_skill_trainer_id))
	pet_skill_selected_slot = clampi(int(active_dialog_interaction.get("slot", pet_skill_selected_slot)), 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var skill_id = str(active_dialog_interaction.get("skillId", ""))
	host._close_dialog()
	_apply_pet_skill_to_selected_slot(skill_id)

func _on_pet_skill_forget_pressed() -> void:
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	var slots = PlayerProgressModel.pet_skill_slots_for_instance(selected)
	var slot = clampi(pet_skill_selected_slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var skill_id = str(slots[slot - 1]) if slot - 1 < slots.size() else ""
	if skill_id == "":
		return
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_skill_forget", {
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
	var result = PlayerProgressModel.forget_pet_skill(player_profile, pet_selected_instance_id, skill_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_skill_panel()
	if pet_panel != null and pet_panel.visible:
		_refresh_pet_panel()

func _open_codex_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_codex_panel() -> void:
	_hide_control(codex_panel)

func _open_quest_panel() -> void:
	host._dialog_quest()._open_quest_panel()

func _close_quest_panel() -> void:
	host._dialog_quest()._close_quest_panel()

func _open_map_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_party_panel()
	_close_family_panel()
	map_panel.visible = true
	_refresh_map_panel()
	host._layout_hud()
	host.call_deferred("_layout_hud")

func _close_map_panel() -> void:
	_hide_control(map_panel)

func _open_chat_panel() -> void:
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	_close_mailbox_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	chat_panel.visible = true
	_refresh_chat_panel()
	_request_chat_messages()
	host._layout_hud()

func _close_chat_panel() -> void:
	_hide_control(chat_panel)

func _chat_channel_button(label: String, channel: String) -> Button:
	var button = Button.new()
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
	var stripped = text.strip_edges()
	if stripped == "":
		return
	var normalized_channel = channel if _chat_channel_is_valid(channel) else CHAT_CHANNEL_SYSTEM
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
		var message = value as Dictionary
		if str(message.get("channel", "")) != chat_active_channel:
			continue
		var author = str(message.get("author", "")).strip_edges()
		var text = str(message.get("text", "")).strip_edges()
		if text == "":
			continue
		lines.append("%s：%s" % [author, text] if author != "" else text)
	if lines.is_empty():
		lines.append("暂无消息。")
	if chat_log_label != null:
		chat_log_label.text = "\n".join(lines)
	if chat_input != null:
		var can_send = chat_active_channel != CHAT_CHANNEL_SYSTEM and _is_server_account_session() and not chat_request_pending
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
	var text = chat_input.text.strip_edges()
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
	var err = chat_http_request.request(
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
	var kind = chat_pending_kind
	chat_pending_kind = ""
	chat_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if chat_status_label != null:
			chat_status_label.text = "聊天服务器连接失败。"
		_refresh_chat_panel()
		return
	if kind == "messages":
		var parsed_messages = ServerAuthClientModel.parse_chat_messages_response(response_code, body)
		if bool(parsed_messages.get("ok", false)):
			var channel = str(parsed_messages.get("channel", chat_active_channel))
			_replace_chat_channel_messages(channel, parsed_messages.get("messages", []))
			if chat_status_label != null:
				chat_status_label.text = "聊天已同步。"
		elif _handle_session_invalid_response(parsed_messages):
			return
		elif chat_status_label != null:
			chat_status_label.text = str(parsed_messages.get("message", "聊天读取失败。"))
	elif kind == "send":
		var parsed_send = ServerAuthClientModel.parse_chat_send_response(response_code, body)
		if bool(parsed_send.get("ok", false)):
			if chat_input != null:
				chat_input.text = ""
			if chat_status_label != null:
				chat_status_label.text = "消息已发送。"
			_request_chat_messages()
			return
		elif _handle_session_invalid_response(parsed_send):
			return
		elif chat_status_label != null:
			chat_status_label.text = str(parsed_send.get("message", "消息发送失败。"))
	_refresh_chat_panel()

func _replace_chat_channel_messages(channel: String, server_messages) -> void:
	var normalized_channel = channel if _chat_channel_is_valid(channel) else CHAT_CHANNEL_NEARBY
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
	var author = str(message.get("senderDisplayName", message.get("senderUsername", ""))).strip_edges()
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
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if party_panel != null:
		party_panel.visible = true
	_refresh_party_panel()
	_request_party_state()
	host._layout_hud()

func _close_party_panel(update_layout: bool = true) -> void:
	_hide_control(party_panel, update_layout)

func _open_family_panel() -> void:
	_open_family_panel_with_focus("")

func _open_family_panel_for_manor(manor_id: String) -> void:
	_open_family_panel_with_focus(manor_id)

func _open_family_panel_with_focus(manor_id: String) -> void:
	if battle_active:
		return
	family_focus_manor_id = manor_id.strip_edges()
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_party_panel(false)
	_close_player_action_panel(false)
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if family_panel != null:
		family_panel.visible = true
	_refresh_family_panel()
	_request_family_state()
	host._layout_hud()

func _close_family_panel(update_layout: bool = true) -> void:
	_hide_control(family_panel, update_layout)

func _refresh_family_panel() -> void:
	if family_panel == null or family_list_container == null or manor_list_container == null:
		return
	_clear_container_children(family_list_container)
	_clear_container_children(manor_list_container)
	var current_family := _family_current_family()
	if family_status_label != null and family_status_label.text.strip_edges() == "":
		family_status_label.text = "家族状态已同步。" if not current_family.is_empty() else "当前没有家族。"
	for family in family_list:
		var row = HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		var label = Label.new()
		label.text = "%s  族长：%s  成员：%d/%d  庄园：%d" % [
			str(family.get("name", "家族")),
			str(family.get("leaderDisplayName", family.get("leaderUsername", ""))),
			int(family.get("memberCount", 0)),
			int(family.get("maxMembers", 100)),
			(family.get("manorIds", []) as Array).size() if family.get("manorIds", []) is Array else 0,
		]
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.add_theme_font_size_override("font_size", 15)
		row.add_child(label)
		var join_button = Button.new()
		join_button.text = "加入"
		join_button.custom_minimum_size = Vector2(78, 42)
		var family_id := str(family.get("familyId", ""))
		join_button.disabled = family_request_pending or not current_family.is_empty() or family_id == ""
		join_button.pressed.connect(func() -> void:
			_on_family_join_pressed(family_id)
		)
		row.add_child(join_button)
		family_list_container.add_child(row)
	if family_list.is_empty():
		family_list_container.add_child(_party_info_label("暂无家族。输入家族名可以直接成立。"))
	if family_manors.is_empty():
		manor_list_container.add_child(_party_info_label("暂无庄园资料。"))
	else:
		var sorted_manors: Array[Dictionary] = []
		for manor in family_manors:
			sorted_manors.append(manor.duplicate(true))
		if family_focus_manor_id.strip_edges() != "":
			sorted_manors.sort_custom(_family_manor_focus_less)
		for manor in sorted_manors:
			manor_list_container.add_child(_family_manor_row(manor, current_family))
	_refresh_family_request_controls()

func _family_manor_focus_less(a: Dictionary, b: Dictionary) -> bool:
	var focus_id: String = family_focus_manor_id.strip_edges()
	var a_id := str(a.get("manorId", "")).strip_edges()
	var b_id := str(b.get("manorId", "")).strip_edges()
	if focus_id != "" and a_id != b_id:
		if a_id == focus_id:
			return true
		if b_id == focus_id:
			return false
	return str(a.get("name", a_id)) < str(b.get("name", b_id))

func _family_focused_manor() -> Dictionary:
	var focus_id: String = family_focus_manor_id.strip_edges()
	if focus_id == "":
		return {}
	for manor in family_manors:
		if str(manor.get("manorId", "")).strip_edges() == focus_id:
			return manor.duplicate(true)
	return {}

func _family_state_status_text() -> String:
	var family = _family_current_family()
	var focused_manor := _family_focused_manor()
	if not focused_manor.is_empty():
		var owner_name := str(focused_manor.get("ownerFamilyName", "")).strip_edges()
		if owner_name == "":
			owner_name = "未占领"
		var suffix := "当前没有家族。" if family.is_empty() else "我的家族：%s。" % str(family.get("name", ""))
		var active_war = focused_manor.get("activeWar", null) as Dictionary if focused_manor.get("activeWar", null) is Dictionary else {}
		if not active_war.is_empty():
			var war_phase := "战期" if _family_manor_war_ready(active_war) else _family_manor_war_prepare_line(active_war)
			return "%s：占领 %s；%s %s VS %s。%s" % [
				str(focused_manor.get("name", "庄园")),
				owner_name,
				war_phase,
				str(active_war.get("challengerFamilyName", "挑战方")),
				str(active_war.get("defenderFamilyName", "守方")),
				suffix,
			]
		var peace_text := _family_manor_peace_line(focused_manor)
		if peace_text != "":
			return "%s：占领 %s；%s。%s" % [
				str(focused_manor.get("name", "庄园")),
				owner_name,
				peace_text,
				suffix,
			]
		return "%s：占领 %s。%s" % [
			str(focused_manor.get("name", "庄园")),
			owner_name,
			suffix,
		]
	return "我的家族：%s。" % str(family.get("name", "")) if not family.is_empty() else "当前没有家族。"

func _family_manor_peace_active(manor: Dictionary) -> bool:
	var peace_ends_at := str(manor.get("peaceEndsAt", "")).strip_edges()
	if peace_ends_at == "":
		return false
	return _family_iso_after_now(peace_ends_at)

func _family_manor_peace_line(manor: Dictionary) -> String:
	if not _family_manor_peace_active(manor):
		return ""
	var peace_ends_at := str(manor.get("peaceEndsAt", "")).strip_edges()
	return "休战至：%s" % _family_display_iso_time(peace_ends_at)

func _family_manor_war_ready(war: Dictionary) -> bool:
	var starts_at := str(war.get("startsAt", "")).strip_edges()
	return starts_at == "" or not _family_iso_after_now(starts_at)

func _family_manor_war_prepare_line(war: Dictionary) -> String:
	var starts_at := str(war.get("startsAt", "")).strip_edges()
	if starts_at == "":
		return "准备中"
	return "准备至：%s" % _family_display_iso_time(starts_at)

func _family_iso_after_now(iso_text: String) -> bool:
	return iso_text.strip_edges() > ("%sZ" % Time.get_datetime_string_from_system(true))

func _family_display_iso_time(iso_text: String) -> String:
	return iso_text.strip_edges().replace("T", " ").replace(".000Z", "").replace("Z", "")

func _family_manor_row(manor: Dictionary, current_family: Dictionary) -> Control:
	var row = HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	var label = Label.new()
	var owner_name = str(manor.get("ownerFamilyName", "")).strip_edges()
	if owner_name == "":
		owner_name = "未占领"
	var owned_text = "  已占领" if bool(manor.get("isOwnedByViewerFamily", false)) else ""
	var active_war = manor.get("activeWar", null) as Dictionary if manor.get("activeWar", null) is Dictionary else {}
	var war_text = ""
	if not active_war.is_empty():
		var war_phase := "战期" if _family_manor_war_ready(active_war) else _family_manor_war_prepare_line(active_war)
		war_text = "\n%s：%s VS %s  参战：%d/%d - %d/%d" % [
			war_phase,
			str(active_war.get("challengerFamilyName", "挑战方")),
			str(active_war.get("defenderFamilyName", "守方")),
			int(active_war.get("challengerParticipantCount", 0)),
			int(active_war.get("maxParticipantsPerSide", 5)),
			int(active_war.get("defenderParticipantCount", 0)),
			int(active_war.get("maxParticipantsPerSide", 5)),
		]
	var peace_text := "" if not active_war.is_empty() else _family_manor_peace_line(manor)
	if peace_text != "":
		war_text = "\n%s" % peace_text
	var focus_prefix := "当前：" if family_focus_manor_id.strip_edges() != "" and str(manor.get("manorId", "")).strip_edges() == family_focus_manor_id.strip_edges() else ""
	label.text = "%s%s  %s  守备:%d  占领：%s%s%s" % [
		focus_prefix,
		str(manor.get("name", "庄园")),
		str(manor.get("village", "")),
		int(manor.get("neutralPower", 0)),
		owner_name,
		owned_text,
		war_text,
	]
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", 15)
	row.add_child(label)
	var manor_id := str(manor.get("manorId", ""))
	var challenge_button = Button.new()
	challenge_button.text = "宣战"
	challenge_button.custom_minimum_size = Vector2(78, 42)
	var manor_in_peace := _family_manor_peace_active(manor)
	challenge_button.disabled = family_request_pending or current_family.is_empty() or not _family_current_user_is_leader(current_family) or bool(manor.get("isOwnedByViewerFamily", false)) or not active_war.is_empty() or manor_in_peace
	if manor_in_peace:
		challenge_button.tooltip_text = "庄园休战保护中"
	challenge_button.pressed.connect(func() -> void:
		_on_family_challenge_manor_pressed(manor_id)
	)
	row.add_child(challenge_button)
	if not active_war.is_empty():
		var war_ready := _family_manor_war_ready(active_war)
		var war_id := str(active_war.get("warId", ""))
		var enter_button = Button.new()
		enter_button.text = "参战"
		enter_button.custom_minimum_size = Vector2(78, 42)
		enter_button.disabled = family_request_pending or war_id == "" or not bool(active_war.get("canEnterByViewerFamily", false))
		enter_button.pressed.connect(func() -> void:
			_on_family_enter_manor_war_pressed(war_id)
		)
		row.add_child(enter_button)
		var leave_button = Button.new()
		leave_button.text = "退出"
		leave_button.custom_minimum_size = Vector2(78, 42)
		leave_button.disabled = family_request_pending or war_id == "" or not bool(active_war.get("canLeaveByViewerFamily", false))
		leave_button.pressed.connect(func() -> void:
			_on_family_leave_manor_war_pressed(war_id)
		)
		row.add_child(leave_button)
		var room_button = Button.new()
		room_button.text = "入场"
		room_button.custom_minimum_size = Vector2(78, 42)
		var battle_room_id := str(active_war.get("battleRoomId", "")).strip_edges()
		room_button.disabled = family_request_pending or war_id == "" or not war_ready or not _family_current_user_is_leader(current_family) or (battle_room_id == "" and not bool(active_war.get("canStartBattleRoomByViewerFamily", false)))
		room_button.pressed.connect(func() -> void:
			_on_family_start_manor_war_battle_pressed(war_id)
		)
		row.add_child(room_button)
		var resolve_button = Button.new()
		resolve_button.text = "结算"
		resolve_button.custom_minimum_size = Vector2(78, 42)
		resolve_button.disabled = family_request_pending or war_id == "" or not war_ready or battle_room_id != "" or not bool(active_war.get("canResolveByViewerFamily", false)) or not _family_current_user_is_leader(current_family)
		resolve_button.pressed.connect(func() -> void:
			_on_family_resolve_manor_war_pressed(war_id)
		)
		row.add_child(resolve_button)
	var shop_button = Button.new()
	shop_button.text = "道具场"
	shop_button.custom_minimum_size = Vector2(92, 42)
	var shop_id := str(manor.get("shopId", ""))
	shop_button.disabled = family_request_pending or not bool(manor.get("isOwnedByViewerFamily", false)) or shop_id == ""
	shop_button.pressed.connect(func() -> void:
		_on_family_open_manor_shop_pressed(shop_id)
	)
	row.add_child(shop_button)
	return row

func _family_current_family() -> Dictionary:
	var family_value = family_current_state.get("family", null)
	return (family_value as Dictionary).duplicate(true) if family_value is Dictionary else {}

func _family_current_user_is_leader(family: Dictionary) -> bool:
	var account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if account_id == "":
		account_id = _current_account_id_for_party()
	return account_id != "" and str(family.get("leaderAccountId", "")).strip_edges() == account_id

func _refresh_family_request_controls() -> void:
	var has_server_session = _is_server_account_session()
	var has_family = not _family_current_family().is_empty()
	if family_refresh_button != null:
		family_refresh_button.disabled = family_request_pending or not has_server_session
	if family_create_button != null:
		family_create_button.disabled = family_request_pending or not has_server_session or has_family
	if family_leave_button != null:
		family_leave_button.disabled = family_request_pending or not has_server_session or not has_family
	if family_status_label != null:
		if not has_server_session:
			family_status_label.text = "需要服务器账号登录。"
		elif family_request_pending:
			family_status_label.text = "正在同步家族..."

func _request_family_state() -> void:
	if not _is_server_account_session():
		if family_status_label != null:
			family_status_label.text = "需要服务器账号登录。"
		_refresh_family_request_controls()
		return
	_start_family_request("state", ServerAuthClientModel.family_state_request(_server_profile_base_url(), _server_profile_token()))

func _request_family_list() -> void:
	if not _is_server_account_session():
		return
	_start_family_request("list", ServerAuthClientModel.family_list_request(_server_profile_base_url(), _server_profile_token()))

func _on_family_create_pressed() -> void:
	var family_name = family_name_input.text.strip_edges() if family_name_input != null else ""
	if family_name == "":
		if family_status_label != null:
			family_status_label.text = "请输入家族名。"
		return
	_start_family_request("create", ServerAuthClientModel.family_create_request(_server_profile_base_url(), _server_profile_token(), family_name))

func _on_family_join_pressed(family_id: String) -> void:
	if family_id.strip_edges() == "":
		return
	_start_family_request("join", ServerAuthClientModel.family_join_request(_server_profile_base_url(), _server_profile_token(), family_id))

func _on_family_leave_pressed() -> void:
	if not _is_server_account_session():
		return
	_start_family_request("leave", ServerAuthClientModel.family_leave_request(_server_profile_base_url(), _server_profile_token()))

func _on_family_challenge_manor_pressed(manor_id: String) -> void:
	if manor_id.strip_edges() == "":
		return
	_start_family_request("challenge", ServerAuthClientModel.manor_challenge_request(_server_profile_base_url(), _server_profile_token(), manor_id))

func _on_family_enter_manor_war_pressed(war_id: String) -> void:
	if war_id.strip_edges() == "":
		return
	_start_family_request("war_enter", ServerAuthClientModel.manor_enter_request(_server_profile_base_url(), _server_profile_token(), war_id))

func _on_family_leave_manor_war_pressed(war_id: String) -> void:
	if war_id.strip_edges() == "":
		return
	_start_family_request("war_leave", ServerAuthClientModel.manor_leave_request(_server_profile_base_url(), _server_profile_token(), war_id))

func _on_family_start_manor_war_battle_pressed(war_id: String) -> void:
	if war_id.strip_edges() == "":
		return
	_start_family_request("battle_room", ServerAuthClientModel.manor_battle_room_request(_server_profile_base_url(), _server_profile_token(), war_id))

func _on_family_resolve_manor_war_pressed(war_id: String) -> void:
	if war_id.strip_edges() == "":
		return
	_start_family_request("resolve", ServerAuthClientModel.manor_resolve_request(_server_profile_base_url(), _server_profile_token(), war_id))

func _on_family_open_manor_shop_pressed(shop_id: String) -> void:
	if shop_id.strip_edges() == "":
		return
	_open_shop_panel(shop_id)

func _start_family_request(kind: String, spec: Dictionary) -> void:
	if family_http_request == null or family_request_pending:
		return
	family_pending_kind = kind
	family_request_pending = true
	_refresh_family_request_controls()
	if family_status_label != null:
		match kind:
			"list":
				family_status_label.text = "正在读取家族列表..."
			"create":
				family_status_label.text = "正在成立家族..."
			"join":
				family_status_label.text = "正在加入家族..."
			"leave":
				family_status_label.text = "正在离开家族..."
			"challenge":
				family_status_label.text = "正在登记庄园战..."
			"war_enter":
				family_status_label.text = "正在加入庄园战..."
			"war_leave":
				family_status_label.text = "正在退出庄园战..."
			"battle_room":
				family_status_label.text = "正在开启庄园战房间..."
			"resolve":
				family_status_label.text = "正在开战结算..."
			_:
				family_status_label.text = "正在同步家族..."
	var err = family_http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if err != OK:
		family_request_pending = false
		family_pending_kind = ""
		if family_status_label != null:
			family_status_label.text = "无法发起家族请求。"
		_refresh_family_request_controls()

func _on_family_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind = family_pending_kind
	family_pending_kind = ""
	family_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if family_status_label != null:
			family_status_label.text = "家族服务器连接失败。"
		_refresh_family_request_controls()
		return
	if kind == "state":
		var parsed_state = ServerAuthClientModel.parse_family_state_response(response_code, body)
		if bool(parsed_state.get("ok", false)):
			family_current_state = {"family": parsed_state.get("family", null)}
			family_manors.clear()
			var raw_manors = parsed_state.get("manors", [])
			if raw_manors is Array:
				for value in raw_manors:
					if value is Dictionary:
						family_manors.append((value as Dictionary).duplicate(true))
			if family_status_label != null:
				family_status_label.text = _family_state_status_text()
			_refresh_family_panel()
			_request_family_list()
			return
		elif _handle_session_invalid_response(parsed_state):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_state.get("message", "家族状态读取失败。"))
	elif kind == "list":
		var parsed_list = ServerAuthClientModel.parse_family_list_response(response_code, body)
		if bool(parsed_list.get("ok", false)):
			family_list.clear()
			var raw_families = parsed_list.get("families", [])
			if raw_families is Array:
				for value in raw_families:
					if value is Dictionary:
						family_list.append((value as Dictionary).duplicate(true))
			if family_status_label != null and family_status_label.text.strip_edges() == "":
				family_status_label.text = "家族列表已刷新。"
		elif _handle_session_invalid_response(parsed_list):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_list.get("message", "家族列表读取失败。"))
	elif kind == "challenge":
		var parsed_challenge = ServerAuthClientModel.parse_manor_challenge_response(response_code, body)
		if bool(parsed_challenge.get("ok", false)):
			if family_status_label != null:
				var war = parsed_challenge.get("war", {}) as Dictionary if parsed_challenge.get("war", {}) is Dictionary else {}
				family_status_label.text = "%s：我方 %d / 守方 %d。" % [
					str(parsed_challenge.get("message", "庄园战已登记。")),
					int(war.get("challengerPower", 0)),
					int(war.get("defenderPower", 0)),
				]
			_request_family_state()
			return
		elif _handle_session_invalid_response(parsed_challenge):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_challenge.get("message", "庄园战失败。"))
	elif kind == "resolve":
		var parsed_resolve = ServerAuthClientModel.parse_manor_resolve_response(response_code, body)
		if bool(parsed_resolve.get("ok", false)):
			if family_status_label != null:
				var battle = parsed_resolve.get("battle", {}) as Dictionary if parsed_resolve.get("battle", {}) is Dictionary else {}
				family_status_label.text = "%s：我方 %d / 守方 %d。" % [
					str(parsed_resolve.get("message", "庄园战已结算。")),
					int(battle.get("challengerPower", 0)),
					int(battle.get("defenderPower", 0)),
				]
			_request_family_state()
			return
		elif _handle_session_invalid_response(parsed_resolve):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_resolve.get("message", "庄园战结算失败。"))
	elif kind == "battle_room":
		var parsed_room = ServerAuthClientModel.parse_manor_battle_room_response(response_code, body)
		if bool(parsed_room.get("ok", false)):
			var room = parsed_room.get("room", {}) as Dictionary if parsed_room.get("room", {}) is Dictionary else {}
			if family_status_label != null:
				var war = parsed_room.get("war", {}) as Dictionary if parsed_room.get("war", {}) is Dictionary else {}
				family_status_label.text = "%s：%d/%d 对 %d/%d。" % [
					str(parsed_room.get("message", "庄园战房间已开启。")),
					int(war.get("challengerParticipantCount", 0)),
					int(war.get("maxParticipantsPerSide", 5)),
					int(war.get("defenderParticipantCount", 0)),
					int(war.get("maxParticipantsPerSide", 5)),
				]
			if not room.is_empty():
				_apply_server_battle_room_state(room, true)
			_request_family_state()
			return
		elif _handle_session_invalid_response(parsed_room):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_room.get("message", "庄园战入场失败。"))
	elif kind == "war_enter" or kind == "war_leave":
		var parsed_war_action = ServerAuthClientModel.parse_manor_war_action_response(response_code, body)
		if bool(parsed_war_action.get("ok", false)):
			if family_status_label != null:
				var war = parsed_war_action.get("war", {}) as Dictionary if parsed_war_action.get("war", {}) is Dictionary else {}
				family_status_label.text = "%s：我方 %d / 守方 %d。" % [
					str(parsed_war_action.get("message", "庄园战参战名单已更新。")),
					int(war.get("challengerPower", 0)),
					int(war.get("defenderPower", 0)),
				]
			_request_family_state()
			return
		elif _handle_session_invalid_response(parsed_war_action):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_war_action.get("message", "庄园战参战失败。"))
	else:
		var parsed_action = ServerAuthClientModel.parse_family_action_response(response_code, body)
		if bool(parsed_action.get("ok", false)):
			if family_name_input != null and kind == "create":
				family_name_input.text = ""
			if family_status_label != null:
				family_status_label.text = str(parsed_action.get("message", "家族已更新。"))
			_request_family_state()
			return
		elif _handle_session_invalid_response(parsed_action):
			return
		elif family_status_label != null:
			family_status_label.text = str(parsed_action.get("message", "家族操作失败。"))
	_refresh_family_panel()
	_refresh_family_request_controls()

func _refresh_party_panel() -> void:
	if party_panel == null or party_members_container == null or party_invites_container == null or party_online_container == null:
		return
	_clear_container_children(party_members_container)
	_clear_container_children(party_invites_container)
	_clear_container_children(party_online_container)
	var party_value = party_current_state.get("party", null)
	var party = party_value as Dictionary if party_value is Dictionary else {}
	var members: Array = party.get("members", []) if party.get("members", []) is Array else []
	if party.is_empty() or members.is_empty():
		party_members_container.add_child(_party_info_label("当前没有队伍。"))
	else:
		for value in members:
			if not (value is Dictionary):
				continue
			var member = value as Dictionary
			var role = "队长" if str(member.get("role", "")) == "leader" else "队员"
			party_members_container.add_child(_party_info_label("%s  %s" % [role, _party_player_text(member)]))
	var invites: Array = party_current_state.get("incomingInvites", []) if party_current_state.get("incomingInvites", []) is Array else []
	if invites.is_empty():
		party_invites_container.add_child(_party_info_label("暂无邀请。"))
	else:
		for value in invites:
			if not (value is Dictionary):
				continue
				var invite = value as Dictionary
				var invite_id = str(invite.get("inviteId", ""))
				var invite_kind = str(invite.get("kind", "invite"))
				var row = HBoxContainer.new()
				row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				row.add_theme_constant_override("separation", 8)
				var label = Label.new()
				var invite_player_text = _party_player_text({
					"username": str(invite.get("fromUsername", "")),
					"displayName": str(invite.get("fromDisplayName", "")),
				})
				label.text = "%s 申请加入队伍" % invite_player_text if invite_kind == "application" else "%s 邀请你加入队伍" % invite_player_text
				label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				label.add_theme_font_size_override("font_size", 15)
				row.add_child(label)
				var accept_button = Button.new()
				accept_button.text = "同意" if invite_kind == "application" else "加入"
				accept_button.custom_minimum_size = Vector2(72, 42)
				accept_button.disabled = party_request_pending
				accept_button.pressed.connect(func() -> void:
					_on_party_accept_pressed(invite_id)
				)
				row.add_child(accept_button)
				var decline_button = Button.new()
				decline_button.text = "拒绝"
				decline_button.custom_minimum_size = Vector2(72, 42)
				decline_button.disabled = party_request_pending
				decline_button.pressed.connect(func() -> void:
					_on_party_decline_pressed(invite_id)
				)
				row.add_child(decline_button)
				party_invites_container.add_child(row)
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	var has_online_rows = false
	for value in party_online_players:
		var player = value as Dictionary
		var username = str(player.get("username", "")).strip_edges()
		if username == "":
			continue
		has_online_rows = true
		var row = HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		var label = Label.new()
		label.text = _party_online_player_text(player)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.add_theme_font_size_override("font_size", 15)
		row.add_child(label)
		var invite_button = Button.new()
		invite_button.custom_minimum_size = Vector2(78, 42)
		var player_party_role = str(player.get("partyRole", "")).strip_edges()
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
	var label = Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", 15)
	return label

func _party_player_text(player: Dictionary) -> String:
	var display_name = str(player.get("displayName", "")).strip_edges()
	var username = str(player.get("username", "")).strip_edges()
	if display_name == "":
		display_name = username if username != "" else "玩家"
	return "%s（%s）" % [display_name, username] if username != "" and username != display_name else display_name

func _current_party_members() -> Array[Dictionary]:
	var party_value = party_current_state.get("party", null)
	if not (party_value is Dictionary):
		return []
	var party = party_value as Dictionary
	var values: Array = party.get("members", []) if party.get("members", []) is Array else []
	var result: Array[Dictionary] = []
	for value in values:
		if value is Dictionary:
			result.append((value as Dictionary).duplicate(true))
	return result

func _current_account_id_for_party() -> String:
	var account_id = str(current_account_session.get("accountId", "")).strip_edges()
	if account_id != "":
		return account_id
	var summary_value = current_account_session.get("serverProfileSummary", {})
	if summary_value is Dictionary:
		return str((summary_value as Dictionary).get("accountId", "")).strip_edges()
	return ""

func _party_member_is_current_player(member: Dictionary) -> bool:
	var current_account_id = _current_account_id_for_party()
	var member_account_id = str(member.get("accountId", "")).strip_edges()
	if current_account_id != "" and member_account_id == current_account_id:
		return true
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	var username = str(member.get("username", "")).strip_edges()
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
	var normalized = PlayerProgressModel.normalize_profile(player_profile)
	var partners = PlayerProgressModel.training_partners(normalized)
	var limited: Array[Dictionary] = []
	var count = mini(partners.size(), maxi(0, limit))
	for index in range(count):
		limited.append((partners[index] as Dictionary).duplicate(true))
	normalized["trainingPartners"] = limited
	return PlayerProgressModel.normalize_profile(normalized)

func _local_battle_state_with_current_team(base_state: Dictionary) -> Dictionary:
	var next_state = base_state.duplicate(true)
	var members = _current_party_other_members_for_battle()
	var used_member_slots = mini(members.size(), BATTLE_TEAM_COMPANION_SLOT_NUMBERS.size())
	for index in range(used_member_slots):
		var slot_number = BATTLE_TEAM_COMPANION_SLOT_NUMBERS[index]
		next_state = _battle_state_with_actor(next_state, _party_member_battle_player_actor(members[index], index, slot_number))
		next_state = _battle_state_with_actor(next_state, _party_member_battle_pet_actor(members[index], index, slot_number))
	var partner_slots: Array[int] = []
	for index in range(used_member_slots, BATTLE_TEAM_COMPANION_SLOT_NUMBERS.size()):
		partner_slots.append(BATTLE_TEAM_COMPANION_SLOT_NUMBERS[index])
	next_state["trainingPartnerSlotNumbers"] = partner_slots
	next_state["partyRealMemberActorCount"] = used_member_slots
	next_state["partyTrainingPartnerSlotCount"] = partner_slots.size()
	var battle_profile = _profile_with_effective_training_partners(partner_slots.size())
	return PlayerProgressModel.apply_profile_to_battle_state(battle_profile, next_state)

func _battle_state_with_actor(state: Dictionary, actor: Dictionary) -> Dictionary:
	if actor.is_empty():
		return state
	var next_state = state.duplicate(true)
	var actors: Array = next_state.get("actors", []) if next_state.get("actors", []) is Array else []
	var actor_id = str(actor.get("id", "")).strip_edges()
	if actor_id == "":
		return state
	var replaced = false
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
	var snapshot = _party_member_team_snapshot(member)
	var player_value = snapshot.get("player", {})
	var player_snapshot = player_value as Dictionary if player_value is Dictionary else {}
	var max_hp = maxi(1, int(player_snapshot.get("maxHp", 120)))
	var display_name = str(player_snapshot.get("name", "")).strip_edges()
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
	var snapshot = _party_member_team_snapshot(member)
	var pets: Array = snapshot.get("battlePets", []) if snapshot.get("battlePets", []) is Array else []
	var first_pet: Dictionary = {}
	for value in pets:
		if not (value is Dictionary):
			continue
		var pet = value as Dictionary
		if first_pet.is_empty():
			first_pet = pet.duplicate(true)
		if bool(pet.get("activeInBattle", false)) or str(pet.get("state", "")) == BattleModel.PET_STATE_BATTLE:
			return pet.duplicate(true)
	return first_pet

func _party_member_battle_pet_actor(member: Dictionary, index: int, slot_number: int) -> Dictionary:
	var pet = _party_member_active_battle_pet(member)
	if pet.is_empty():
		return {}
	var max_hp = maxi(1, int(pet.get("maxHp", 90)))
	var form_id = str(pet.get("formId", pet.get("speciesId", ""))).strip_edges()
	var actor_id = "ally_party_member_pet_%d" % [index + 1]
	var stat_overrides = {
		"hp": clampi(int(pet.get("hp", max_hp)), 1, max_hp),
		"maxHp": max_hp,
		"quick": maxi(1, int(pet.get("quick", pet.get("speed", 50)))),
		"attack": maxi(1, int(pet.get("attack", 12))),
		"defense": maxi(1, int(pet.get("defense", 6))),
	}
	var actor = PetTemplateCatalog.actor_from_form(
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
		var text = str(item).strip_edges()
		if text != "":
			result.append(text)
	return result

func _battle_record_summary_text(summary: Dictionary) -> String:
	var target = _party_player_text({
		"username": str(summary.get("targetUsername", "")),
		"displayName": str(summary.get("targetDisplayName", "")),
	})
	var total = maxi(0, int(summary.get("total", 0)))
	var wins = maxi(0, int(summary.get("wins", 0)))
	var losses = maxi(0, int(summary.get("losses", 0)))
	var draws = maxi(0, int(summary.get("draws", 0)))
	if total <= 0:
		return "与%s暂无切磋战绩。" % target
	var draw_text = "，平 %d" % draws if draws > 0 else ""
	return "与%s：共 %d 场，胜 %d，负 %d%s。" % [target, total, wins, losses, draw_text]

func _current_party_role() -> String:
	var party_value = party_current_state.get("party", null)
	if not (party_value is Dictionary):
		return ""
	var party = party_value as Dictionary
	var current_account_id = str(current_account_session.get("accountId", "")).strip_edges()
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	if current_account_id != "" and str(party.get("leaderAccountId", "")).strip_edges() == current_account_id:
		return "leader"
	var members: Array = party.get("members", []) if party.get("members", []) is Array else []
	for value in members:
		if not (value is Dictionary):
			continue
		var member = value as Dictionary
		var account_id = str(member.get("accountId", "")).strip_edges()
		var username = str(member.get("username", "")).strip_edges()
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
	host.queue_redraw()

func _should_apply_online_self_position(position: Dictionary) -> bool:
	if position.is_empty():
		return false
	var authority = str(position.get("authority", "")).strip_edges()
	return authority == "party_follow" or (_current_player_is_party_member() and str(position.get("mapId", "")).strip_edges() != "")

func _party_online_player_text(player: Dictionary) -> String:
	var role = str(player.get("partyRole", "")).strip_edges()
	var suffix = ""
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
	var party = party_value as Dictionary
	var leader_account_id = str(party.get("leaderAccountId", ""))
	var summary_value = current_account_session.get("serverProfileSummary", {})
	var current_account_id = ""
	if summary_value is Dictionary:
		current_account_id = str((summary_value as Dictionary).get("accountId", ""))
	if current_account_id != "":
		return leader_account_id == current_account_id
	var current_username = str(current_account_session.get("username", "")).strip_edges()
	var members: Array = party.get("members", []) if party.get("members", []) is Array else []
	for value in members:
		if value is Dictionary:
			var member = value as Dictionary
			if str(member.get("username", "")) == current_username:
				return str(member.get("role", "")) == "leader"
	return false

func _refresh_party_request_controls() -> void:
	var has_server_session = _is_server_account_session()
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
	var err = party_http_request.request(
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
	var kind = party_pending_kind
	party_pending_kind = ""
	party_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if party_status_label != null:
			party_status_label.text = "队伍服务器连接失败。"
		_refresh_party_request_controls()
		return
	if kind == "state":
		var parsed_state = ServerAuthClientModel.parse_party_state_response(response_code, body)
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
			host._update_hud_text(true)
			_request_party_online()
			return
		elif _handle_session_invalid_response(parsed_state):
			return
		elif party_status_label != null:
			party_status_label.text = str(parsed_state.get("message", "队伍状态读取失败。"))
	elif kind == "online":
		var parsed_online = ServerAuthClientModel.parse_online_players_response(response_code, body)
		if bool(parsed_online.get("ok", false)):
			party_online_players.clear()
			var raw_players = parsed_online.get("players", [])
			if raw_players is Array:
				for value in raw_players:
					if value is Dictionary:
						party_online_players.append((value as Dictionary).duplicate(true))
			if party_status_label != null:
				party_status_label.text = "在线玩家已刷新。"
		elif _handle_session_invalid_response(parsed_online):
			return
		elif party_status_label != null:
			party_status_label.text = str(parsed_online.get("message", "在线玩家读取失败。"))
	else:
		var parsed_action = ServerAuthClientModel.parse_party_action_response(response_code, body)
		if bool(parsed_action.get("ok", false)):
			if party_status_label != null:
				party_status_label.text = str(parsed_action.get("message", "队伍已更新。"))
			_request_party_state()
			return
		elif _handle_session_invalid_response(parsed_action):
			return
		elif party_status_label != null:
			party_status_label.text = str(parsed_action.get("message", "队伍操作失败。"))
	_refresh_party_panel()
	_refresh_party_request_controls()

func _open_player_action_panel(target: Dictionary) -> void:
	if battle_active or target.is_empty():
		return
	var username = str(target.get("username", "")).strip_edges()
	if username == "" or username == str(current_account_session.get("username", "")).strip_edges():
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	host._layout_hud()

func _close_player_action_panel(update_layout: bool = true) -> void:
	player_action_target.clear()
	player_action_request_pending = false
	player_action_pending_kind = ""
	_hide_control(player_action_panel, update_layout)

func _refresh_player_action_panel() -> void:
	if player_action_panel == null:
		return
	var has_session = _is_server_account_session()
	var username = str(player_action_target.get("username", "")).strip_edges()
	var target_name = _party_player_text(player_action_target)
	var position = player_action_target.get("position", {}) as Dictionary if player_action_target.get("position", {}) is Dictionary else {}
	var target_party_id = str(player_action_target.get("partyId", "")).strip_edges()
	var target_party_role = str(player_action_target.get("partyRole", "")).strip_edges()
	var current_party_value = party_current_state.get("party", null)
	var current_has_party = current_party_value is Dictionary
	var distance_text = ""
	if player != null and not map_data.is_empty() and str(position.get("mapId", "")) == current_map_id:
		var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
		var target_cell = Vector2i(int(position.get("cellX", 0)), int(position.get("cellY", 0)))
		var distance = maxi(abs(player_cell.x - target_cell.x), abs(player_cell.y - target_cell.y))
		distance_text = "距离%d格" % distance
	if player_action_title_label != null:
		player_action_title_label.text = "玩家互动"
	if player_action_detail_label != null:
		var party_text = "有队伍" if target_party_id != "" else "未组队"
		if target_party_role == "leader":
			party_text = "队长"
		elif target_party_role == "member":
			party_text = "队员"
		player_action_detail_label.text = "%s\n%s%s" % [
			target_name,
			party_text,
			"  %s" % distance_text if distance_text != "" else "",
		]
	var disabled = player_action_request_pending or not has_session or username == ""
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
	var username = str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("battle_invite", ServerAuthClientModel.battle_invite_request(_server_profile_base_url(), _server_profile_token(), username))

func _on_player_action_record_pressed() -> void:
	var username = str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("battle_record", ServerAuthClientModel.battle_record_summary_request(_server_profile_base_url(), _server_profile_token(), username))

func _on_player_action_party_apply_pressed() -> void:
	var username = str(player_action_target.get("username", "")).strip_edges()
	if username == "" or not _is_server_account_session():
		return
	_start_player_action_request("party_apply", ServerAuthClientModel.party_apply_request(_server_profile_base_url(), _server_profile_token(), username))

func _on_player_action_party_invite_pressed() -> void:
	var username = str(player_action_target.get("username", "")).strip_edges()
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
	var err = player_action_http_request.request(
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
	var kind = player_action_pending_kind
	player_action_pending_kind = ""
	player_action_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if player_action_status_label != null:
			player_action_status_label.text = "服务器连接失败。"
		_refresh_player_action_panel()
		return
	if kind == "battle_invite":
		var parsed_battle = ServerAuthClientModel.parse_battle_action_response(response_code, body)
		if bool(parsed_battle.get("ok", false)):
			if player_action_status_label != null:
				player_action_status_label.text = str(parsed_battle.get("message", "切磋邀请已发送。"))
			_set_world_log_message(str(parsed_battle.get("message", "切磋邀请已发送。")))
		elif _handle_session_invalid_response(parsed_battle):
			return
		elif player_action_status_label != null:
			player_action_status_label.text = str(parsed_battle.get("message", "切磋发起失败。"))
	elif kind == "battle_record":
		var parsed_record = ServerAuthClientModel.parse_battle_record_summary_response(response_code, body)
		if bool(parsed_record.get("ok", false)):
			var summary = parsed_record.get("summary", {}) as Dictionary if parsed_record.get("summary", {}) is Dictionary else {}
			var record_text = _battle_record_summary_text(summary)
			if player_action_status_label != null:
				player_action_status_label.text = record_text
			_set_world_log_message(record_text)
		elif _handle_session_invalid_response(parsed_record):
			return
		elif player_action_status_label != null:
			player_action_status_label.text = str(parsed_record.get("message", "战绩查询失败。"))
	else:
		var parsed_party = ServerAuthClientModel.parse_party_action_response(response_code, body)
		if bool(parsed_party.get("ok", false)):
			if player_action_status_label != null:
				player_action_status_label.text = str(parsed_party.get("message", "队伍请求已发送。"))
			_request_party_state()
		elif _handle_session_invalid_response(parsed_party):
			return
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
	host._layout_hud()

func _close_battle_invite_panel(update_layout: bool = true) -> void:
	battle_invite_current.clear()
	battle_invite_request_pending = false
	battle_invite_pending_kind = ""
	_hide_control(battle_invite_panel, update_layout)

func _refresh_battle_invite_panel() -> void:
	if battle_invite_panel == null:
		return
	var from_player = {
		"username": str(battle_invite_current.get("fromUsername", "")),
		"displayName": str(battle_invite_current.get("fromDisplayName", "")),
	}
	if battle_invite_detail_label != null:
		battle_invite_detail_label.text = "%s 向你发起切磋。" % _party_player_text(from_player)
	var disabled = battle_invite_request_pending or not _is_server_account_session() or str(battle_invite_current.get("inviteId", "")).strip_edges() == ""
	if battle_invite_accept_button != null:
		battle_invite_accept_button.disabled = disabled
	if battle_invite_decline_button != null:
		battle_invite_decline_button.disabled = disabled
	if battle_invite_close_button != null:
		battle_invite_close_button.disabled = battle_invite_request_pending
	if battle_invite_status_label != null and not _is_server_account_session():
		battle_invite_status_label.text = "需要服务器账号登录。"

func _on_battle_invite_accept_pressed() -> void:
	var invite_id = str(battle_invite_current.get("inviteId", "")).strip_edges()
	if invite_id == "" or not _is_server_account_session():
		return
	_start_battle_invite_request("accept", ServerAuthClientModel.battle_invite_accept_request(_server_profile_base_url(), _server_profile_token(), invite_id))

func _on_battle_invite_decline_pressed() -> void:
	var invite_id = str(battle_invite_current.get("inviteId", "")).strip_edges()
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
	var err = battle_invite_http_request.request(
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
	var kind = battle_invite_pending_kind
	battle_invite_pending_kind = ""
	battle_invite_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if battle_invite_status_label != null:
			battle_invite_status_label.text = "切磋服务器连接失败。"
		_refresh_battle_invite_panel()
		return
	var parsed = ServerAuthClientModel.parse_battle_action_response(response_code, body)
	if bool(parsed.get("ok", false)):
		if kind == "accept":
			var room = parsed.get("room", {}) as Dictionary if parsed.get("room", {}) is Dictionary else {}
			if not room.is_empty():
				_apply_server_battle_room_state(room, true)
			_close_battle_invite_panel()
		else:
			_close_battle_invite_panel()
		_set_world_log_message(str(parsed.get("message", "切磋状态已更新。")))
	elif _handle_session_invalid_response(parsed):
		return
	elif battle_invite_status_label != null:
		battle_invite_status_label.text = str(parsed.get("message", "切磋操作失败。"))
	_refresh_battle_invite_panel()

func _party_panel_layout_is_usable() -> bool:
	if party_panel == null or not party_panel.visible:
		return false
	var viewport_size = host._layout_size()
	var margin = 18.0
	var bottom = party_panel.position.y + party_panel.size.y
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
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
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
	host._layout_hud()

func _close_mailbox_panel(update_layout: bool = true) -> void:
	_hide_control(mailbox_panel, update_layout)

func _refresh_mailbox_panel() -> void:
	if mailbox_panel == null or mailbox_list_container == null or mailbox_detail_label == null or mailbox_claim_button == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_mailbox_menu_button()
	var messages = _mailbox_combined_entries()
	var selected_exists = false
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
		var empty_label = Label.new()
		empty_label.text = "没有邮件。" if not mailbox_request_pending else "正在读取..."
		empty_label.add_theme_font_size_override("font_size", 16)
		mailbox_list_container.add_child(empty_label)
	else:
		for entry in messages:
			var key = str(entry.get("key", ""))
			var source = str(entry.get("source", "server"))
			var button = Button.new()
			button.text = _mailbox_entry_button_text(entry)
			button.toggle_mode = true
			button.button_pressed = key == mailbox_selected_mail_id
			button.custom_minimum_size = Vector2(0, 72)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			button.add_theme_font_size_override("font_size", 14)
			var captured_key = key
			var captured_source = source
			button.pressed.connect(func() -> void:
				_select_mailbox_message(captured_key, captured_source)
			)
			mailbox_list_container.add_child(button)
			mailbox_message_buttons[key] = button
	var selected = _mailbox_entry_by_key(mailbox_selected_mail_id)
	if selected.is_empty():
		mailbox_detail_label.text = "没有邮件。"
		mailbox_claim_button.disabled = true
		mailbox_claim_button.visible = true
		mailbox_claim_button.tooltip_text = ""
		_refresh_mailbox_request_controls()
		return
	var selected_source = str(selected.get("source", "server"))
	var selected_message = selected.get("message", {}) as Dictionary if selected.get("message", {}) is Dictionary else {}
	if selected_source == "server":
		mailbox_detail_label.text = _server_mailbox_detail_text(selected_message)
		var server_items = _mailbox_item_entries(selected_message)
		mailbox_claim_button.disabled = mailbox_request_pending or server_items.is_empty()
		mailbox_claim_button.visible = true
		mailbox_claim_button.tooltip_text = "附件会放入背包。背包空间不足时，剩余附件会保留在邮箱。" if not server_items.is_empty() else ""
		_refresh_mailbox_request_controls()
		return
	var items = _mailbox_item_entries(selected_message)
	var lines: Array[String] = []
	lines.append(str(selected_message.get("title", "系统邮件")))
	lines.append("来自：%s" % str(selected_message.get("sender", "系统")))
	lines.append("到期：%s" % PlayerProgressModel.mailbox_expiry_text(selected_message))
	var body = str(selected_message.get("body", "")).strip_edges()
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
		var server_mail = _server_mailbox_message_by_key(mail_id)
		if not server_mail.is_empty() and str(server_mail.get("readAt", "")).strip_edges() == "":
			_request_server_mailbox_read(str(server_mail.get("mailId", "")))
	_refresh_mailbox_panel()

func _on_mailbox_claim_pressed() -> void:
	if mailbox_selected_mail_id == "":
		return
	if mailbox_selected_source == "server":
		var server_mail_id = _mailbox_key_id(mailbox_selected_mail_id, "server:")
		if server_mail_id != "":
			_request_server_mailbox_claim(server_mail_id)
		return
	var local_mail_id = _mailbox_key_id(mailbox_selected_mail_id, "local:")
	var result = PlayerProgressModel.mailbox_claim_message(player_profile, local_mail_id)
	player_profile = result.get("profile", player_profile)
	if profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_mailbox_panel()
	_refresh_mailbox_menu_button()
	if backpack_panel != null and backpack_panel.visible:
		_refresh_backpack_panel()
	host._update_hud_text(true)

func _refresh_mailbox_menu_button() -> void:
	if mailbox_menu_button == null:
		return
	var count = PlayerProgressModel.mailbox_unclaimed_count(player_profile) + _server_mailbox_unread_count()
	mailbox_menu_button.text = "邮箱" if count <= 0 else "邮箱%d" % count

func _mailbox_combined_entries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for message in mailbox_server_messages:
		var mail_id = str(message.get("mailId", "")).strip_edges()
		if mail_id == "":
			continue
		result.append({
			"key": "server:%s" % mail_id,
			"source": "server",
			"message": message,
		})
	for message in PlayerProgressModel.mailbox_messages(player_profile):
		var mail_id = str(message.get("mailId", "")).strip_edges()
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
	var source = str(entry.get("source", "server"))
	var message = entry.get("message", {}) as Dictionary if entry.get("message", {}) is Dictionary else {}
	if source == "server":
		var status = "未读" if str(message.get("readAt", "")).strip_edges() == "" else "已读"
		var title = str(message.get("title", "玩家邮件"))
		var sender = str(message.get("senderDisplayName", message.get("senderUsername", "玩家")))
		return "%s\n%s  %s" % [title, sender, status]
	return PlayerProgressModel.mailbox_message_button_text(message)

func _server_mailbox_detail_text(message: Dictionary) -> String:
	var lines: Array[String] = []
	lines.append(str(message.get("title", "玩家邮件")))
	var sender = str(message.get("senderDisplayName", message.get("senderUsername", "玩家"))).strip_edges()
	if sender == "":
		sender = "玩家"
	lines.append("来自：%s" % sender)
	var created_at = str(message.get("createdAt", "")).strip_edges()
	if created_at != "":
		lines.append("时间：%s" % created_at)
	lines.append("状态：%s" % ("未读" if str(message.get("readAt", "")).strip_edges() == "" else "已读"))
	var body = str(message.get("body", "")).strip_edges()
	if body != "":
		lines.append("")
		lines.append(body)
	var items = _mailbox_item_entries(message)
	lines.append("")
	lines.append("附件：无" if items.is_empty() else "附件：%s" % BackpackModel.item_amounts_text(items))
	return "\n".join(lines)

func _server_mailbox_message_by_key(key: String) -> Dictionary:
	var mail_id = _mailbox_key_id(key, "server:")
	for message in mailbox_server_messages:
		if str(message.get("mailId", "")) == mail_id:
			return message
	return {}

func _server_mailbox_unread_count() -> int:
	var count = 0
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
	var recipient = mailbox_recipient_input.text.strip_edges()
	var title = mailbox_title_input.text.strip_edges()
	var body = mailbox_body_input.text.strip_edges()
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
	var err = mailbox_http_request.request(
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
	var kind = mailbox_pending_kind
	mailbox_pending_kind = ""
	mailbox_request_pending = false
	if result != HTTPRequest.RESULT_SUCCESS:
		if mailbox_status_label != null:
			mailbox_status_label.text = "邮箱服务器连接失败。"
		_refresh_mailbox_request_controls()
		return
	if kind == "inbox":
		var parsed_inbox = ServerAuthClientModel.parse_mail_inbox_response(response_code, body)
		if bool(parsed_inbox.get("ok", false)):
			mailbox_server_messages.clear()
			var raw_messages = parsed_inbox.get("messages", [])
			if raw_messages is Array:
				for value in raw_messages:
					if value is Dictionary:
						mailbox_server_messages.append((value as Dictionary).duplicate(true))
			if mailbox_status_label != null:
				mailbox_status_label.text = "邮箱已刷新。"
		elif _handle_session_invalid_response(parsed_inbox):
			return
		elif mailbox_status_label != null:
			mailbox_status_label.text = str(parsed_inbox.get("message", "邮箱读取失败。"))
	elif kind == "send":
		var parsed_send = ServerAuthClientModel.parse_mail_send_response(response_code, body)
		if bool(parsed_send.get("ok", false)):
			if mailbox_title_input != null:
				mailbox_title_input.text = ""
			if mailbox_body_input != null:
				mailbox_body_input.text = ""
			if mailbox_status_label != null:
				mailbox_status_label.text = "邮件已发送。"
			_request_server_mailbox_inbox()
			return
		elif _handle_session_invalid_response(parsed_send):
			return
		elif mailbox_status_label != null:
			mailbox_status_label.text = str(parsed_send.get("message", "邮件发送失败。"))
		elif kind == "read":
			var parsed_read = ServerAuthClientModel.parse_mail_read_response(response_code, body)
			if bool(parsed_read.get("ok", false)):
				var read_mail = parsed_read.get("mail", {}) as Dictionary if parsed_read.get("mail", {}) is Dictionary else {}
				for index in range(mailbox_server_messages.size()):
					if str(mailbox_server_messages[index].get("mailId", "")) == str(read_mail.get("mailId", "")):
						mailbox_server_messages[index] = read_mail
						break
			elif _handle_session_invalid_response(parsed_read):
				return
			elif mailbox_status_label != null:
				mailbox_status_label.text = str(parsed_read.get("message", "邮件标记失败。"))
		elif kind == "claim":
			var parsed_claim = ServerAuthClientModel.parse_mail_claim_response(response_code, body)
			if bool(parsed_claim.get("ok", false)):
				var server_profile = parsed_claim.get("profile", null)
				if server_profile is Dictionary:
					player_profile = PlayerProgressModel.normalize_profile((server_profile as Dictionary).duplicate(true))
					if profile_save_enabled:
						PlayerProgressModel.save_profile(player_profile)
				var summary = parsed_claim.get("profileSummary", {})
				if summary is Dictionary:
					_apply_server_profile_summary(summary as Dictionary)
				var claim_mail_id = _mailbox_key_id(mailbox_selected_mail_id, "server:")
				var claim_mail = parsed_claim.get("mail", null)
				var replaced = false
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
				host._update_hud_text(true)
			elif _handle_session_invalid_response(parsed_claim):
				return
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
			var entry = raw_item as Dictionary
			var item_id = str(entry.get("itemId", ""))
			var count = maxi(0, int(entry.get("count", 0)))
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
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	_close_auto_settings_panel()
	training_partner_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	host._layout_hud()
	_refresh_training_partner_panel()
	host._layout_hud()
	host.call_deferred("_layout_hud")

func _close_training_partner_panel() -> void:
	_hide_control(training_partner_panel)

func _refresh_training_partner_panel() -> void:
	if training_partner_panel == null or training_partner_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var count = PlayerProgressModel.training_partner_count(player_profile)
	var real_member_count = _current_party_other_members_for_battle().size()
	var available_slots = _training_partner_available_slots()
	var active_count = mini(count, available_slots)
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
	var server_request_pending = _is_server_account_session() and profile_action_request_pending
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
	var viewport_size = host._layout_size()
	var margin = 18.0
	var bottom = training_partner_panel.position.y + training_partner_panel.size.y
	return (
		training_partner_panel.position.x >= -1.0
		and training_partner_panel.position.y >= margin
		and training_partner_panel.size.x <= viewport_size.x - margin * 2.0 + 1.0
		and training_partner_panel.size.y <= viewport_size.y - margin * 2.0 + 1.0
		and bottom <= viewport_size.y + 1.0
		and training_partner_scroll.size.y >= 80.0
	)

func _set_training_partner_count(count: int) -> void:
	var available_slots = _training_partner_available_slots()
	var target_count = clampi(count, 0, available_slots)
	if _is_server_account_session():
		_refresh_training_partner_panel()
		var parsed = await _submit_server_profile_action("training_partner_set_count", {"count": target_count}, "设置陪练伙伴失败。")
		var log_lines = _string_array_values(parsed.get("logLines", []))
		if log_lines.is_empty():
			var fallback_count = PlayerProgressModel.training_partner_count(player_profile)
			log_lines.append("队伍伙伴 %d/%d。" % [fallback_count, _training_partner_available_slots()])
		_set_world_log_message("\n".join(log_lines))
		_refresh_training_partner_panel()
		host._update_hud_text()
		return
	if _local_profile_mutation_blocked_for_server_only("设置陪练伙伴"):
		_refresh_training_partner_panel()
		return
	player_profile = PlayerProgressModel.with_training_partner_count(player_profile, target_count)
	if profile_save_enabled:
		host._save_player_profile_now()
	var next_count = PlayerProgressModel.training_partner_count(player_profile)
	_set_world_log_message("队伍伙伴 %d/%d。" % [next_count, available_slots])
	_refresh_training_partner_panel()
	host._update_hud_text()

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
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	auto_settings_panel.visible = true
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	_refresh_auto_settings_panel()
	host._layout_hud()

func _close_auto_settings_panel() -> void:
	_hide_control(auto_settings_panel)

func _open_qa_panel() -> void:
	if host._release_entrypoints_locked():
		_set_world_log_message("当前构建未开放GM工具。")
		return
	if not _can_use_gm_tools():
		_set_world_log_message("当前账号没有GM权限。")
		return
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_numeric_workbench_panel(false)
	if qa_panel != null:
		qa_panel.visible = true
	_refresh_qa_panel()
	_reset_qa_panel_scrolls()
	host._layout_hud()

func _close_qa_panel(update_layout: bool = true) -> void:
	_hide_control(qa_panel, update_layout)

func _open_numeric_workbench_panel() -> void:
	if host._release_entrypoints_locked():
		_set_world_log_message("当前构建未开放数值实验工具。")
		return
	if not _can_use_gm_tools():
		_set_world_log_message("当前账号没有GM权限。")
		return
	if battle_active:
		return
	host._set_hang_mode(false)
	host._close_dialog()
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
	_close_family_panel()
	_close_training_partner_panel()
	_close_auto_settings_panel()
	_close_qa_panel(false)
	if numeric_workbench_panel != null:
		numeric_workbench_panel.visible = true
	_refresh_numeric_workbench_panel()
	host._layout_hud()

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
	var previous = numeric_workbench_profile_id
	numeric_workbench_profile_option.clear()
	var selected_index = -1
	for option in NumericWorkbenchModel.pet_growth_profile_options():
		var profile_id = str(option.get("id", ""))
		numeric_workbench_profile_option.add_item(str(option.get("label", profile_id)))
		var index = numeric_workbench_profile_option.get_item_count() - 1
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
	var previous = numeric_workbench_stone_plan_id
	numeric_workbench_stone_option.clear()
	var selected_index = -1
	for option in NumericWorkbenchModel.stone_plan_options():
		var plan_id = str(option.get("id", ""))
		numeric_workbench_stone_option.add_item(str(option.get("label", plan_id)))
		var index = numeric_workbench_stone_option.get_item_count() - 1
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
	var result = NumericWorkbenchModel.build_pet_growth_report(
		_numeric_workbench_profile_id(),
		_numeric_workbench_sample_count(),
		_numeric_workbench_target_level(),
		true
	)
	_set_numeric_workbench_result(result)

func _on_numeric_workbench_mm_pressed() -> void:
	var result = NumericWorkbenchModel.build_mm_rebirth_report(
		_numeric_workbench_profile_id(),
		_numeric_workbench_sample_count(),
		_numeric_workbench_stage(),
		_numeric_workbench_stone_plan_id(),
		true
	)
	_set_numeric_workbench_result(result)

func _on_numeric_workbench_compare_pressed() -> void:
	var result = NumericWorkbenchModel.build_mm_stone_comparison_report(
		_numeric_workbench_profile_id(),
		_numeric_workbench_sample_count(),
		_numeric_workbench_stage(),
		true
	)
	_set_numeric_workbench_result(result)

func _on_numeric_workbench_battle_pressed() -> void:
	var result = NumericWorkbenchModel.build_battle_report(true)
	_set_numeric_workbench_result(result)

func _on_numeric_workbench_output_pressed() -> void:
	var output_dir = NumericWorkbenchModel.output_dir_path()
	if not DirAccess.dir_exists_absolute(output_dir):
		DirAccess.make_dir_recursive_absolute(output_dir)
	var open_error = OS.shell_open(output_dir)
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
	var output_path = str(result.get("csvPath", result.get("jsonPath", "")))
	if output_path != "":
		text_lines.append("")
		text_lines.append("[color=#9fd7a0]最近输出[/color] %s" % output_path)
	if numeric_workbench_result_label != null:
		numeric_workbench_result_label.text = "\n".join(text_lines)
	var ok = bool(result.get("ok", false))
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
	var result = QaPanelPresenter.refresh_pet_tool_controls(
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
	var command_ids = GmToolRuntimeModel.command_ids_from_entries(_qa_entry_definitions())
	for command_id in GM_TOOL_EXTRA_COMMAND_IDS:
		if not command_ids.has(command_id):
			command_ids.append(command_id)
	return command_ids

func _authorize_gm_command(command_id: String) -> bool:
	if host._release_entrypoints_locked():
		_set_world_log_message("当前构建未开放GM工具。")
		return false
	if auth_auto_bypass:
		return true
	var result = GmToolRuntimeModel.authorize_command(current_account_session, command_id, _gm_allowed_command_ids())
	var ok = bool(result.get("ok", false))
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
	var profile_id = qa_pet_growth_profile_id
	if profile_id == "" and qa_pet_species_option != null and qa_pet_species_option.get_item_count() > 0:
		profile_id = str(qa_pet_species_option.get_item_metadata(qa_pet_species_option.selected))
	var result = PlayerProgressModel.gm_grant_growth_pet(player_profile, profile_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		qa_pet_level_instance_id = str(result.get("instanceId", qa_pet_level_instance_id))
		pet_selected_instance_id = qa_pet_level_instance_id
		pet_detail_mode = PET_DETAIL_MODE_GROWTH
		if profile_save_enabled:
			host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_qa_pet_tool_controls()
	_refresh_qa_panel()

func _on_qa_pet_level_up_pressed() -> void:
	if not _authorize_gm_command("gm_level_pet"):
		return
	if qa_pet_level_instance_id == "":
		_set_world_log_message("请选择要升级的宠物。")
		return
	var result = PlayerProgressModel.gm_level_up_pet_once(player_profile, qa_pet_level_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = qa_pet_level_instance_id
		var updated = result.get("pet", {})
		pet_detail_mode = PET_DETAIL_MODE_GROWTH if updated is Dictionary and str((updated as Dictionary).get("growthSpeciesProfileId", "")).strip_edges() != "" else PET_DETAIL_MODE_INSTANCE
		if profile_save_enabled:
			host._save_player_profile_now()
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
	var multiplier = float(_gm_battle_speed_multiplier())
	if player != null and player.has_method("set_speed_multiplier"):
		player.set_speed_multiplier(multiplier)
	if pet != null and pet.has_method("set_speed_multiplier"):
		pet.set_speed_multiplier(multiplier)

func _scaled_battle_delta(delta: float) -> float:
	return delta * float(_gm_battle_speed_multiplier())

func _cycle_gm_battle_speed_gear() -> void:
	var current = _gm_battle_speed_multiplier()
	_set_gm_speed_multiplier(GM_BATTLE_SPEED_MIN if current >= GM_BATTLE_SPEED_MAX else maxi(2, current + 1))
	_refresh_qa_panel()
	_set_world_log_message("GM变速齿轮：测试速度 x%d。" % _gm_battle_speed_multiplier())
	host._layout_hud()

func _qa_load_map(map_id: String, spawn_name: String, message: String) -> void:
	_close_qa_panel(false)
	if host._load_map(map_id, spawn_name):
		_set_world_log_message(message)
	else:
		_set_world_log_message("GM入口暂时无法载入地图。")
	host._layout_hud()

func _qa_route_to_gm_zone(zone_id: String) -> void:
	_close_qa_panel(false)
	if current_map_id != GM_10V10_MAP_ID:
		if not host._load_map(GM_10V10_MAP_ID, "default"):
			_set_world_log_message("GM测试场暂时无法载入。")
			return
	var zone = host._encounter_zone_by_id(zone_id)
	if zone.is_empty():
		_set_world_log_message("GM测试草丛不存在：%s。" % zone_id)
		return
	var cell = EncounterModel.first_walkable_cell(map_data, zone)
	if _set_move_target_cell(cell, IsoMapModel.grid_to_world(map_data, cell), cell):
		_set_world_log_message("正在前往%s。" % str(zone.get("name", "GM草丛")))
	else:
		_set_world_log_message("暂时无法前往%s。" % str(zone.get("name", "GM草丛")))
	host._layout_hud()

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
	var settings = PlayerProgressModel.auto_battle_settings(player_profile)
	var player_action_options = _auto_settings_player_action_options()
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
	var heal_priority = _auto_settings_heal_priority_slots(settings)
	for index in range(AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS):
		_add_auto_settings_heal_option(index, str(heal_priority[index]))

func _refresh_hang_settings_tab() -> void:
	var settings = PlayerProgressModel.hang_settings(player_profile)
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
	var button_row = HBoxContainer.new()
	button_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button_row.add_theme_constant_override("separation", 8)
	auto_settings_content.add_child(button_row)
	var save_button = Button.new()
	save_button.text = "保存"
	save_button.custom_minimum_size = Vector2(0, 44)
	save_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	save_button.pressed.connect(func() -> void:
		if profile_save_enabled:
			host._save_player_profile_now()
		_set_world_log_message("挂机设置已保存。")
	)
	button_row.add_child(save_button)
	auto_settings_controls["hangSaveButton"] = save_button
	var start_button = Button.new()
	start_button.text = "开始挂机"
	start_button.custom_minimum_size = Vector2(0, 44)
	start_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	start_button.pressed.connect(func() -> void:
		_close_auto_settings_panel()
		host._start_hang_walk()
	)
	button_row.add_child(start_button)
	auto_settings_controls["hangStartButton"] = start_button
	var close_button = Button.new()
	close_button.text = "关闭"
	close_button.custom_minimum_size = Vector2(0, 44)
	close_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	close_button.pressed.connect(_close_auto_settings_panel)
	button_row.add_child(close_button)
	auto_settings_controls["hangCloseButton"] = close_button

func _refresh_auto_capture_settings_tab() -> void:
	var settings = PlayerProgressModel.auto_capture_settings(player_profile)
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
	var level_row = _auto_settings_row("等级")
	var comparator = OptionButton.new()
	comparator.custom_minimum_size = Vector2(86, 40)
	comparator.add_theme_font_size_override("font_size", 15)
	var comparator_options = AutoCaptureSettingsModel.level_comparator_options()
	var selected_comparator = str(settings.get(AutoCaptureSettingsModel.LEVEL_COMPARATOR_KEY, AutoCaptureSettingsModel.COMPARATOR_EQ))
	var selected_comparator_index = 0
	for index in range(comparator_options.size()):
		var option_entry = comparator_options[index] as Dictionary
		var option_id = str(option_entry.get("id", ""))
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
	var level_spinbox = SpinBox.new()
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
	var label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color(0.95, 0.86, 0.48, 1.0))
	label.custom_minimum_size = Vector2(0, 26)
	auto_settings_content.add_child(label)

func _add_auto_settings_option(label_text: String, key: String, options: Array[Dictionary], selected_id: String) -> OptionButton:
	var row = _auto_settings_row(label_text)
	var option = OptionButton.new()
	option.custom_minimum_size = Vector2(0, 40)
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 15)
	var selected_index = 0
	for index in range(options.size()):
		var option_entry = options[index] as Dictionary
		var option_id = str(option_entry.get("id", ""))
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
	var options = _auto_settings_pet_slot_options()
	var selected_id = str(AutoBattleSettingsModel.normalized_pet_skill_slot(selected_slot))
	return _add_auto_settings_option(label_text, key, options, selected_id)

func _add_auto_settings_checkbox(label_text: String, key: String, value: bool) -> CheckBox:
	var row = _auto_settings_row(label_text)
	var checkbox = CheckBox.new()
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
	var row = _auto_settings_row(label_text)
	var spinbox = SpinBox.new()
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
	var row = _auto_settings_row(label_text)
	var line_edit = LineEdit.new()
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
	var options = _auto_settings_heal_source_options()
	var row_label = "优先%d" % [index + 1]
	var row = _auto_settings_row(row_label)
	var option = OptionButton.new()
	option.custom_minimum_size = Vector2(0, 40)
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 15)
	var selected_index = 0
	for option_index in range(options.size()):
		var option_entry = options[option_index] as Dictionary
		var option_id = str(option_entry.get("id", ""))
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
	var row = HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)
	auto_settings_content.add_child(row)
	var label = Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(96, 40)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 15)
	row.add_child(label)
	return row

func _auto_settings_pet_slot_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	var active_pet = PlayerProgressModel.active_pet(player_profile)
	for slot in range(AutoBattleSettingsModel.MIN_PET_SKILL_SLOT, AutoBattleSettingsModel.MAX_PET_SKILL_SLOT + 1):
		var label = PlayerProgressModel.pet_skill_slot_label_for_instance(active_pet, slot, "未配置") if not active_pet.is_empty() else BattleActionCatalog.pet_skill_label_for_slot(slot, "未配置")
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
		var option_id = str(option.get("id", ""))
		if option_id.begins_with("item_"):
			options.append(option)
	return options

func _auto_settings_heal_source_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	var equipped_spirits = PlayerProgressModel.equipment_spirit_ids(player_profile)
	for option in AutoBattleSettingsModel.heal_source_options():
		var option_id = str(option.get("id", ""))
		if option_id == AutoBattleSettingsModel.HEAL_NONE:
			continue
		var action = BattleActionCatalog.action_by_id(option_id)
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
	var priority = AutoBattleSettingsModel.normalized_heal_priority(settings.get(AutoBattleSettingsModel.HEAL_PRIORITY_KEY, []))
	while priority.size() < AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS:
		priority.append(AutoBattleSettingsModel.HEAL_ITEM_MEAT)
	return priority.slice(0, AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS)

func _auto_capture_form_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = [{
		"id": "",
		"label": "未指定",
	}]
	for form in PetTemplateCatalog.forms():
		var form_id = str(form.get("formId", ""))
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
	var settings = PlayerProgressModel.auto_battle_settings(player_profile)
	settings[key] = int(value) if key == AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY or key == AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY else value
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	if profile_save_enabled:
		host._save_player_profile_now()

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
	var settings = PlayerProgressModel.auto_capture_settings(player_profile)
	match key:
		AutoCaptureSettingsModel.ENABLED_KEY, AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY:
			settings[key] = bool(value)
		AutoCaptureSettingsModel.HP_PERCENT_KEY, AutoCaptureSettingsModel.LEVEL_VALUE_KEY, AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY, AutoCaptureSettingsModel.CAPTURE_PET_SLOT_KEY:
			settings[key] = int(value)
		_:
			settings[key] = str(value)
	player_profile = PlayerProgressModel.with_auto_capture_settings(player_profile, settings)
	if profile_save_enabled:
		host._save_player_profile_now()

func _set_hang_settings_value(key: String, value) -> void:
	var settings = PlayerProgressModel.hang_settings(player_profile)
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
		host._save_player_profile_now()

func _set_auto_settings_heal_priority(index: int, source_id: String) -> void:
	var settings = PlayerProgressModel.auto_battle_settings(player_profile)
	var priority = _auto_settings_heal_priority_slots(settings)
	if index >= 0 and index < priority.size():
		priority[index] = AutoBattleSettingsModel.normalized_heal_source(source_id)
	settings[AutoBattleSettingsModel.HEAL_PRIORITY_KEY] = priority
	player_profile = PlayerProgressModel.with_auto_battle_settings(player_profile, settings)
	if profile_save_enabled:
		host._save_player_profile_now()
	_refresh_auto_settings_panel()

func _refresh_quest_panel() -> void:
	host._dialog_quest()._refresh_quest_panel()

func _set_quest_reward_controls(quest: Dictionary, status: String) -> void:
	host._dialog_quest()._set_quest_reward_controls(quest, status)

func _on_quest_reward_choice_selected(index: int) -> void:
	host._dialog_quest()._on_quest_reward_choice_selected(index)

func _on_quest_claim_pressed() -> void:
	await host._dialog_quest()._on_quest_claim_pressed()

func _on_quest_route_pressed() -> void:
	host._dialog_quest()._on_quest_route_pressed()

func _on_task_tracker_route_pressed() -> void:
	host._dialog_quest()._on_task_tracker_route_pressed()

func _refresh_task_route_button() -> void:
	host._dialog_quest()._refresh_task_route_button()

func _current_task_navigation_target() -> Dictionary:
	host._refresh_task_tracker_cache_if_needed(true)
	return task_tracker_target_cache.duplicate(true)

func _current_task_navigation_target_cached() -> Dictionary:
	host._refresh_task_tracker_cache_if_needed(false)
	return task_tracker_target_cache.duplicate(true)

func _task_tracker_has_navigation_target_cached() -> bool:
	host._refresh_task_tracker_cache_if_needed(false)
	return task_tracker_has_target_cache

func _current_task_navigation_target_uncached() -> Dictionary:
	var quest = PlayerProgressModel.active_quest(player_profile)
	if not quest.is_empty():
		return _navigation_target_for_quest(quest)
	var available_quest = _first_available_unfinished_quest_for_tracker()
	if not available_quest.is_empty():
		return _navigation_target_for_interaction_id(QuestModel.giver_id_for(available_quest))
	var mm_guide = _pet_rebirth_mm_guide_task_info(true)
	if not mm_guide.is_empty():
		var mm_target_value = mm_guide.get("target", {})
		return mm_target_value as Dictionary if mm_target_value is Dictionary else {}
	var trial = _rebirth_trial_task_info(true)
	var target_value = trial.get("target", {})
	return target_value as Dictionary if target_value is Dictionary else {}

func _navigation_target_for_quest(quest: Dictionary) -> Dictionary:
	if quest.is_empty():
		return {}
	var quest_id = str(quest.get("id", ""))
	if quest_id != "" and quest_id == PlayerProgressModel.active_quest_id(player_profile) and PlayerProgressModel.can_claim_active_quest(player_profile):
		return _navigation_target_for_interaction_id(QuestModel.turn_in_id_for(quest))
	var objective = QuestModel.objective_for(quest)
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
	var normalized = PlayerProgressModel.normalize_profile(player_profile)
	for quest in QuestModel.quests():
		if QuestModel.is_optional(quest):
			continue
		var quest_id = str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state = PlayerProgressModel.quest_state_for_id(normalized, quest_id)
		if str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			continue
		if PlayerProgressModel.quest_available_for_profile(normalized, quest):
			return quest
	return {}

func _pet_rebirth_mm_guide_task_info(include_target: bool = false) -> Dictionary:
	var info = PlayerProgressModel.pet_rebirth_mm_guide_info(player_profile)
	var status = str(info.get("status", ""))
	if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED:
		return {}
	var result = info.duplicate(true)
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
	var normalized = PlayerProgressModel.normalize_profile(player_profile)
	var target_count = PlayerProgressModel.rebirth_count(normalized) + 1
	var max_target = RebirthTrialModel.stages().size()
	if target_count < 1 or target_count > max_target:
		return {}
	if not _rebirth_quest_completed_for_target(normalized, target_count):
		return {}
	var stage_label = _rebirth_target_label(target_count)
	var player = normalized.get("player", {}) as Dictionary
	var player_level = maxi(1, int(player.get("level", 1)))
	if player_level < 80:
		var low_level_info = {
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
	var missing_ring = _first_missing_rebirth_ring(normalized, target_count)
	if not missing_ring.is_empty():
		var ring_name = str(missing_ring.get("ringName", BackpackModel.label_for(str(missing_ring.get("ringItemId", "")), "元素戒指")))
		var cave_name = str(missing_ring.get("caveName", "元素洞穴"))
		var owned_rings = _owned_rebirth_ring_count(normalized, target_count)
		var guardian_group_value = missing_ring.get("guardianGroup", {})
		var guardian_group = guardian_group_value as Dictionary if guardian_group_value is Dictionary else {}
		var ring_info = {
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
	var missing_beast = _first_missing_rebirth_beast(normalized, target_count)
	if not missing_beast.is_empty():
		var beast_name = str(missing_beast.get("name", "转生兽"))
		var final_cave = RebirthTrialModel.final_cave()
		var final_cave_name = str(final_cave.get("name", "玄影洞窟"))
		var beast_info = {
			"title": "%s试炼：%s" % [stage_label, beast_name],
			"taskText": "%s试炼 - 捕捉%s" % [stage_label, beast_name],
			"detailLines": [
				"转生阶段：%s" % stage_label,
				"目标：捕捉%s Lv50。" % beast_name,
				"地点：%s前三层。" % final_cave_name,
			],
		}
		if include_target:
			var capture_objective = {
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
		var final_cave = RebirthTrialModel.final_cave()
		var final_cave_name = str(final_cave.get("name", "玄影洞窟"))
		var boss_group_value = final_cave.get("rebirthBossGroup", {})
		var boss_group = boss_group_value as Dictionary if boss_group_value is Dictionary else {}
		var boss_info = {
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
	var ready_info = {
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
	var quest_id = "rebirth_%d" % clampi(target_count, 1, 6)
	var completions = profile.get("rebirthQuestCompletions", [])
	if not (completions is Array):
		return false
	for value in completions:
		if str(value) == quest_id:
			return true
	return false

func _first_missing_rebirth_ring(profile: Dictionary, target_count: int) -> Dictionary:
	for cave in RebirthTrialModel.element_caves():
		var ring_id = str(cave.get("ringItemId", ""))
		if ring_id != "" and RebirthTrialModel.stage_required_ring_ids(target_count).has(ring_id) and PlayerProgressModel.backpack_item_count(profile, ring_id) <= 0:
			return cave
	return {}

func _owned_rebirth_ring_count(profile: Dictionary, target_count: int) -> int:
	var count = 0
	for ring_id in RebirthTrialModel.stage_required_ring_ids(target_count):
		if PlayerProgressModel.backpack_item_count(profile, ring_id) > 0:
			count += 1
	return count

func _first_missing_rebirth_beast(profile: Dictionary, target_count: int) -> Dictionary:
	for form_id in RebirthTrialModel.stage_required_beast_form_ids(target_count):
		if not host._profile_has_pet_form(profile, form_id):
			var beast = _rebirth_beast_for_form_id(form_id)
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
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	var target_text = "无"
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
		var captured_target = target.duplicate(true)
		var button = Button.new()
		button.text = _map_target_button_text(captured_target)
		button.clip_text = true
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.custom_minimum_size = Vector2(0, 42)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 15)
		button.pressed.connect(func() -> void:
			_on_map_marker_pressed(captured_target)
		)
		map_marker_container.add_child(button)
		map_marker_buttons[str(captured_target.get("id", captured_target.get("label", "")))] = button
	if map_marker_buttons.is_empty():
		var empty_label = Label.new()
		empty_label.text = "当前地图暂无可寻路标记。"
		empty_label.add_theme_font_size_override("font_size", 15)
		map_marker_container.add_child(empty_label)

func _map_targets_for_current_map() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for value in InteractionModel.interaction_points(map_data):
		if not (value is Dictionary):
			continue
		var item = value as Dictionary
		var item_id = str(item.get("id", ""))
		if item_id == "":
			continue
		result.append(_navigation_target_from_interaction(current_map_id, item))
	for value in EncounterModel.encounter_zones(map_data):
		if not (value is Dictionary):
			continue
		var zone = value as Dictionary
		if EncounterModel.is_manual_only(zone):
			continue
		var zone_id = str(zone.get("id", ""))
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
	var rank_a = int(a.get("sortRank", 99))
	var rank_b = int(b.get("sortRank", 99))
	if rank_a != rank_b:
		return rank_a < rank_b
	var label_a = str(a.get("label", ""))
	var label_b = str(b.get("label", ""))
	if label_a != label_b:
		return label_a < label_b
	return str(a.get("id", "")) < str(b.get("id", ""))

func _map_target_button_text(target: Dictionary) -> String:
	var kind = str(target.get("kind", ""))
	var label = str(target.get("label", "目标"))
	var facility_label = str(target.get("facilityLabel", ""))
	var prefix = "【%s】" % facility_label if facility_label != "" else ""
	match kind:
		"interaction":
			var interaction = target.get("interaction", {})
			if interaction is Dictionary:
				var action = str((interaction as Dictionary).get("action", ""))
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
	var image_width = 420
	var image_height = 220
	var image = Image.create(image_width, image_height, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.05, 0.08, 0.08, 0.92))
	var grid = IsoMapModel.grid_size(map_data)
	if grid.x <= 0 or grid.y <= 0:
		return ImageTexture.create_from_image(image)
	var margin = 10
	var cell_size = maxi(4, mini(int(floor(float(image_width - margin * 2) / float(grid.x))), int(floor(float(image_height - margin * 2) / float(grid.y)))))
	var map_pixel_size = Vector2i(cell_size * grid.x, cell_size * grid.y)
	var origin_pixel = Vector2i(
		int(floor(float(image_width - map_pixel_size.x) * 0.5)),
		int(floor(float(image_height - map_pixel_size.y) * 0.5))
	)
	var blocked = IsoMapModel.blocked_lookup(map_data)
	var interaction_blocked = IsoMapModel.interaction_blocked_lookup(map_data)
	var decor = _map_decor_lookup()
	var zone_lookup = _map_encounter_zone_lookup()
	for y in range(grid.y):
		for x in range(grid.x):
			var cell = Vector2i(x, y)
			var key = IsoMapModel.cell_key(cell)
			var color = Color(0.19, 0.30, 0.27, 0.96)
			if zone_lookup.has(key):
				color = Color(0.28, 0.45, 0.25, 0.98)
			if decor.has(key):
				color = Color(0.25, 0.42, 0.30, 0.98)
			if blocked.has(key) or interaction_blocked.has(key):
				color = Color(0.12, 0.13, 0.12, 0.98)
			_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, cell), color)
	for target in _map_targets_for_current_map():
		var marker_cell = _map_target_cell(target)
		if IsoMapModel.is_inside(map_data, marker_cell):
			_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, marker_cell), _map_target_minimap_color(target))
	if has_target_cell and IsoMapModel.is_inside(map_data, target_cell):
		_fill_image_rect(image, _map_cell_rect(origin_pixel, cell_size, target_cell), Color(1.0, 0.88, 0.20, 1.0))
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
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
	var lookup = {}
	var decor_cells: Array = map_data.get("decorCells", [])
	for value in decor_cells:
		if not (value is Dictionary):
			continue
		var item = value as Dictionary
		var cell_array: Array = item.get("cell", [0, 0])
		lookup[IsoMapModel.cell_key(Vector2i(int(cell_array[0]), int(cell_array[1])))] = true
	return lookup

func _map_encounter_zone_lookup() -> Dictionary:
	var lookup = {}
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
	var start_x = clampi(rect.position.x, 0, image.get_width())
	var start_y = clampi(rect.position.y, 0, image.get_height())
	var end_x = clampi(rect.position.x + rect.size.x, 0, image.get_width())
	var end_y = clampi(rect.position.y + rect.size.y, 0, image.get_height())
	for y in range(start_y, end_y):
		for x in range(start_x, end_x):
			image.set_pixel(x, y, color)

func _active_quest_navigation_target() -> Dictionary:
	return _current_task_navigation_target()

func _quest_route_hint(quest: Dictionary, _objective: Dictionary) -> String:
	var target = _navigation_target_for_quest(quest)
	if target.is_empty():
		return ""
	var map_id = str(target.get("mapId", ""))
	var map_name = _map_name_for_id(map_id)
	var label = _navigation_target_display_label(target)
	if map_name == "":
		return label
	return "%s / %s" % [map_name, label]

func _route_to_quest_target(target: Dictionary) -> void:
	var target_map_id = str(target.get("mapId", ""))
	var label = _navigation_target_display_label(target)
	if target_map_id != "" and target_map_id != current_map_id:
		var warp = _warp_to_map(current_map_id, target_map_id)
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
			host._close_dialog()
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
	var label = str(target.get("label", "目标"))
	var facility_label = str(target.get("facilityLabel", ""))
	if facility_label != "":
		return "【%s】%s" % [facility_label, label]
	return label

func _navigation_target_from_interaction(map_id: String, item: Dictionary) -> Dictionary:
	var facility_type = InteractionModel.facility_type_for(item)
	var facility_label = InteractionModel.facility_label_for(item)
	var item_id = str(item.get("id", ""))
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
		var loaded_map = _map_data_for_id(str(map_id))
		var item = InteractionModel.find_by_id(loaded_map, interaction_id)
		if not item.is_empty():
			return _navigation_target_from_interaction(str(map_id), item)
	return {}

func _navigation_target_for_shop(shop_id: String) -> Dictionary:
	if shop_id == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map = _map_data_for_id(str(map_id))
		for value in InteractionModel.interaction_points(loaded_map):
			if not (value is Dictionary):
				continue
			var item = value as Dictionary
			if str(item.get("shopId", "")) == shop_id:
				return _navigation_target_from_interaction(str(map_id), item)
	return {}

func _navigation_target_for_map_entrance(destination_map_id: String, label: String = "") -> Dictionary:
	var normalized_destination = destination_map_id.strip_edges()
	if normalized_destination == "":
		return {}
	for map_id in MAP_DATA_PATHS.keys():
		var loaded_map = _map_data_for_id(str(map_id))
		for value in InteractionModel.interaction_points(loaded_map):
			if not (value is Dictionary):
				continue
			var item = value as Dictionary
			if not InteractionModel.is_warp(item) or str(item.get("toMap", "")) != normalized_destination:
				continue
			var target = _navigation_target_from_interaction(str(map_id), item)
			if label != "":
				target["label"] = label
			return target
	return {}

func _navigation_target_for_direct_warp(from_map_id: String, destination_map_id: String, label: String = "") -> Dictionary:
	var loaded_map = _map_data_for_id(from_map_id)
	for value in InteractionModel.interaction_points(loaded_map):
		if not (value is Dictionary):
			continue
		var item = value as Dictionary
		if not InteractionModel.is_warp(item) or str(item.get("toMap", "")) != destination_map_id:
			continue
		var target = _navigation_target_from_interaction(from_map_id, item)
		if label != "":
			target["label"] = label
		return target
	return {}

func _navigation_target_for_encounter_group_on_map(map_id: String, group_id: String, label: String = "") -> Dictionary:
	var loaded_map = _map_data_for_id(map_id)
	var interaction = host._interaction_for_encounter_group(loaded_map, group_id)
	if not interaction.is_empty():
		var interaction_target = _navigation_target_from_interaction(map_id, interaction)
		if label != "":
			interaction_target["label"] = label
		return interaction_target
	var zone = host._encounter_zone_for_group(loaded_map, group_id)
	if zone.is_empty():
		return {}
	var cell = EncounterModel.first_walkable_cell(loaded_map, zone)
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
	var first_floor_id = floor_ids[0]
	var current_index = floor_ids.find(current_map_id)
	if current_index < 0:
		return _navigation_target_for_map_entrance(first_floor_id, entrance_label)

	if current_map_id == goal_map_id:
		return _navigation_target_for_encounter_group_on_map(current_map_id, encounter_group_id, goal_label)

	var goal_index = floor_ids.find(goal_map_id)
	if goal_index < 0:
		goal_index = floor_ids.size() - 1
	var step = 1 if current_index < goal_index else -1
	var next_index = clampi(current_index + step, 0, floor_ids.size() - 1)
	if next_index == current_index:
		return {}
	var next_map_id = floor_ids[next_index]
	return _navigation_target_for_direct_warp(
		current_map_id,
		next_map_id,
		"前往%s" % _map_name_for_id(next_map_id)
	)

func _navigation_target_for_capture_objective_in_cave(floor_ids: Array[String], capture_floor_ids: Array[String], objective: Dictionary, entrance_label: String) -> Dictionary:
	var current_target = _navigation_target_for_capture_objective_on_current_map(objective)
	if not current_target.is_empty():
		return current_target
	if floor_ids.is_empty():
		return {}
	var first_floor_id = floor_ids[0]
	var current_index = floor_ids.find(current_map_id)
	if current_index < 0:
		return _navigation_target_for_map_entrance(first_floor_id, entrance_label)

	var goal_index = -1
	var best_distance = 1000000
	for capture_map_id in capture_floor_ids:
		var floor_index = floor_ids.find(capture_map_id)
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

	var step = 1 if current_index < goal_index else -1
	var next_index = clampi(current_index + step, 0, floor_ids.size() - 1)
	if next_index == current_index:
		return {}
	var next_map_id = floor_ids[next_index]
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
		var loaded_map = _map_data_for_id(str(map_id))
		var interaction = host._interaction_for_encounter_group(loaded_map, group_id)
		if not interaction.is_empty():
			return _navigation_target_from_interaction(str(map_id), interaction)
		for value in EncounterModel.encounter_zones(loaded_map):
			if not (value is Dictionary):
				continue
			var zone = value as Dictionary
			if EncounterModel.is_manual_only(zone):
				continue
			if str(zone.get("encounterGroupId", "")) != group_id:
				continue
			var cell = EncounterModel.first_walkable_cell(loaded_map, zone)
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
		var loaded_map = _map_data_for_id(str(map_id))
		for value in EncounterModel.encounter_zones(loaded_map):
			if not (value is Dictionary):
				continue
			var zone = value as Dictionary
			if not _zone_matches_capture_objective(zone, objective):
				continue
			var cell = EncounterModel.first_walkable_cell(loaded_map, zone)
			return {
				"kind": "encounter_zone",
				"mapId": str(map_id),
				"label": str(zone.get("name", "野外")),
				"zone": zone,
				"cell": cell,
			}
	return {}

func _navigation_target_for_capture_objective_on_current_map(objective: Dictionary) -> Dictionary:
	var loaded_map = _map_data_for_id(current_map_id)
	for value in EncounterModel.encounter_zones(loaded_map):
		if not (value is Dictionary):
			continue
		var zone = value as Dictionary
		if not _zone_matches_capture_objective(zone, objective):
			continue
		var cell = EncounterModel.first_walkable_cell(loaded_map, zone)
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
	var required_line_id = str(objective.get("lineId", ""))
	var required_form_id = str(objective.get("formId", ""))
	var required_prefix = str(objective.get("formIdPrefix", ""))
	var pool = zone.get("wildPetPool", [])
	if not (pool is Array):
		return false
	for value in pool:
		if not (value is Dictionary):
			continue
		var entry = value as Dictionary
		var form_id = str(entry.get("formId", ""))
		if form_id == "":
			continue
		if required_form_id != "" and form_id != required_form_id:
			continue
		if required_prefix != "" and not form_id.begins_with(required_prefix):
			continue
		if required_line_id != "":
			var template = PetTemplateCatalog.runtime_template_for_form(form_id)
			if str(template.get("lineId", "")) != required_line_id:
				continue
		return true
	return false

func _warp_to_map(from_map_id: String, to_map_id: String) -> Dictionary:
	var loaded_map = _map_data_for_id(from_map_id)
	for value in InteractionModel.interaction_points(loaded_map):
		if not (value is Dictionary):
			continue
		var item = value as Dictionary
		if InteractionModel.is_warp(item) and str(item.get("toMap", "")) == to_map_id:
			return item
	return {}

func _map_data_for_id(map_id: String) -> Dictionary:
	if map_id == current_map_id and not map_data.is_empty():
		return map_data
	var map_path = str(MAP_DATA_PATHS.get(map_id, ""))
	if map_path == "":
		return {}
	return IsoMapModel.load_map(map_path)

func _map_name_for_id(map_id: String) -> String:
	var loaded_map = _map_data_for_id(map_id)
	return str(loaded_map.get("name", map_id))

func _refresh_codex_panel() -> void:
	if codex_panel == null or codex_list_container == null or codex_detail_label == null:
		return
	player_profile = PlayerProgressModel.normalize_profile(player_profile)
	var entries = PlayerProgressModel.codex_entries(player_profile)
	for child in codex_list_container.get_children():
		child.queue_free()
	codex_list_buttons.clear()

	var selected_exists = false
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
	var first_form_id = ""
	for entry in entries:
		var form_id = str(entry.get("formId", ""))
		if first_form_id == "":
			first_form_id = form_id
		if bool(entry.get("captured", false)):
			return form_id
	for entry in entries:
		if bool(entry.get("seen", false)):
			return str(entry.get("formId", ""))
	return first_form_id

func _add_codex_list_button(entry: Dictionary) -> void:
	var form_id = str(entry.get("formId", ""))
	if form_id == "":
		return
	var button = Button.new()
	var marker = "▶ " if form_id == codex_selected_form_id else ""
	var display_name = str(entry.get("formName", "宠物")) if bool(entry.get("seen", false)) else "？？？"
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
		var grade = str(row.get("grade", ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("label", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("initial", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("current", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("target", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(str(row.get("growth", "")), false, ""))
		pet_growth_table_grid.add_child(_pet_growth_table_cell(_pet_growth_grade_text(row), false, grade))

func _pet_growth_grade_text(row: Dictionary) -> String:
	var grade = str(row.get("grade", ""))
	var percentile = row.get("percentile", "")
	if grade == "" or grade == "未观察":
		return "未观察"
	if percentile is int or percentile is float:
		return "%s %.0f%%" % [grade, float(percentile)]
	return grade

func _pet_growth_table_cell(text: String, is_header: bool, grade: String) -> Label:
	var label = Label.new()
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
	var has_growth = not instance.is_empty() and str(instance.get("growthSpeciesProfileId", "")).strip_edges() != ""
	pet_growth_stage_row.visible = pet_detail_mode == PET_DETAIL_MODE_GROWTH and has_growth
	if not has_growth:
		pet_growth_stage = 0
		return
	var options = PetGrowthObservationModel.growth_stage_options(instance)
	var enabled_stages = {}
	for entry in options:
		if bool(entry.get("enabled", false)):
			enabled_stages[int(entry.get("stage", 0))] = true
	if not enabled_stages.has(pet_growth_stage):
		pet_growth_stage = 0
	for entry in options:
		var stage = int(entry.get("stage", 0))
		var button = pet_growth_stage_buttons.get(stage, null)
		if button == null or not (button is Button):
			continue
		var stage_button = button as Button
		var enabled = bool(entry.get("enabled", false))
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

	var visible_instances = _pet_panel_visible_instances()
	if visible_instances.is_empty():
		_add_pet_section_label("没有符合条件的宠物。")
	if pet_selected_instance_id != "" and not _pet_panel_has_instance(visible_instances, pet_selected_instance_id):
		pet_selected_instance_id = ""

	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		var active = PlayerProgressModel.active_pet(player_profile)
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
		var storage = PlayerProgressModel.storage_pet_instances(player_profile)
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
				var grades = {}
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
		var target_state = PlayerProgressModel.cycled_pet_state_for_profile(player_profile, pet_selected_instance_id)
		if target_state == "":
			pet_state_cycle_button.disabled = true
			pet_state_cycle_button.visible = false
		else:
			pet_state_cycle_button.visible = true
			var state_check = PlayerProgressModel.can_cycle_pet_state(player_profile, pet_selected_instance_id)
			pet_state_cycle_button.disabled = not bool(state_check.get("ok", false))
			pet_state_cycle_button.text = _pet_state_button_label(target_state)
	if pet_stable_button != null:
		if selected.is_empty():
			pet_stable_button.visible = false
			pet_stable_button.disabled = true
			pet_stable_button.tooltip_text = ""
		else:
			pet_stable_button.visible = true
			var has_stable_access = _pet_panel_has_stable_access()
			pet_stable_button.disabled = not has_stable_access
			var stable_state = str(selected.get("state", ""))
			pet_stable_button.text = "取出" if stable_state == PlayerProgressModel.PET_STATE_STORAGE else "存入"
			pet_stable_button.tooltip_text = "" if has_stable_access else "需要学会远程兽栏，或前往村内兽栏。"
	if pet_party_up_button != null and pet_party_down_button != null:
		var can_show_order = not selected.is_empty()
		var can_edit_order = (
			can_show_order
			and pet_sort_mode == PET_SORT_DEFAULT
			and (pet_filter_mode == PET_FILTER_ALL or pet_filter_mode == PET_FILTER_PARTY)
			and str(selected.get("state", "")) != PlayerProgressModel.PET_STATE_STORAGE
		)
		var up_check = PlayerProgressModel.can_move_party_pet(player_profile, pet_selected_instance_id, -1) if can_edit_order else {}
		var down_check = PlayerProgressModel.can_move_party_pet(player_profile, pet_selected_instance_id, 1) if can_edit_order else {}
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
	var party_count = PlayerProgressModel.party_pet_instances(player_profile).size()
	var has_batch_stable_access = _pet_panel_has_stable_access()
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
		var selected_state = str(selected.get("state", ""))
		if selected_state == PlayerProgressModel.PET_STATE_STORAGE:
			pet_drop_button.disabled = selected.is_empty()
			pet_drop_button.text = "确认" if pet_clear_confirm_instance_id == pet_selected_instance_id else "清理"
		else:
			var drop_check = PlayerProgressModel.can_drop_pet(player_profile, pet_selected_instance_id)
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
	var option = OptionButton.new()
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 15)
	var selected_index = 0
	for index in range(options.size()):
		var entry = options[index] as Dictionary
		var option_id = str(entry.get("id", ""))
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
	var result = false
	match pet_sort_mode:
		PET_SORT_LEVEL:
			var a_level = int(a.get("level", 1))
			var b_level = int(b.get("level", 1))
			if a_level != b_level:
				result = a_level > b_level
			return result if pet_sort_descending else not result
		PET_SORT_POWER:
			var a_power = PetPowerModel.combat_power_for_pet(a)
			var b_power = PetPowerModel.combat_power_for_pet(b)
			if a_power != b_power:
				result = a_power > b_power
			return result if pet_sort_descending else not result
		PET_SORT_SPECIES:
			var a_species = "%s:%s:%s" % [str(a.get("lineName", "")), str(a.get("subtypeName", "")), str(a.get("formName", ""))]
			var b_species = "%s:%s:%s" % [str(b.get("lineName", "")), str(b.get("subtypeName", "")), str(b.get("formName", ""))]
			if a_species != b_species:
				result = a_species > b_species
			return result if pet_sort_descending else not result
		PET_SORT_CAPTURED:
			var a_serial = int(a.get("capturedSerial", 0))
			var b_serial = int(b.get("capturedSerial", 0))
			if a_serial != b_serial:
				result = a_serial > b_serial
			return result if pet_sort_descending else not result
	var a_state_order = _pet_panel_state_order(str(a.get("state", "")))
	var b_state_order = _pet_panel_state_order(str(b.get("state", "")))
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
	var label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 16)
	pet_list_container.add_child(label)

func _add_pet_list_button(instance: Dictionary) -> void:
	var instance_id = str(instance.get("instanceId", ""))
	if instance_id == "":
		return
	var button = Button.new()
	var marker = "▶ " if instance_id == pet_selected_instance_id else ""
	var active_marker = "主 " if str(instance.get("state", "")) == PlayerProgressModel.PET_STATE_BATTLE else ""
	var new_marker = "新 " if bool(instance.get("isNew", false)) else ""
	var lock_marker = "锁 " if bool(instance.get("locked", false)) else ""
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
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, instance_id)
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
				host._save_player_profile_now()
	_refresh_pet_panel()
	if pet_cultivation_panel != null and pet_cultivation_panel.visible:
		_refresh_pet_cultivation_panel()

func _on_pet_state_cycle_pressed() -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_state_cycle", {"instanceId": pet_selected_instance_id}, "切换宠物状态失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = PlayerProgressModel.cycle_pet_state(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_stable_pressed() -> void:
	if not _pet_panel_has_stable_access():
		_set_world_log_message("需要学会远程兽栏，或前往村内兽栏。")
		_refresh_pet_panel()
		return
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_stable_toggle", {"instanceId": pet_selected_instance_id}, "兽栏操作失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = {}
	if str(selected.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE:
		result = PlayerProgressModel.withdraw_pet(player_profile, pet_selected_instance_id)
	else:
		result = PlayerProgressModel.store_pet(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_party_move_pressed(direction: int) -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_party_move", {
			"instanceId": pet_selected_instance_id,
			"direction": direction,
		}, "调整宠物位置失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = PlayerProgressModel.move_party_pet(player_profile, pet_selected_instance_id, direction)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_lock_pressed() -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_lock_toggle", {"instanceId": pet_selected_instance_id}, "宠物锁定失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = PlayerProgressModel.toggle_pet_locked(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_batch_store_pressed() -> void:
	if not _pet_panel_has_stable_access():
		_set_world_log_message("需要学会远程兽栏，或前往村内兽栏。")
		_refresh_pet_panel()
		return
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_batch_store", {}, "批量存入失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = PlayerProgressModel.batch_store_standby_pets(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_batch_state_pressed(target_state: String) -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_batch_state", {"targetState": target_state}, "批量切换状态失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = PlayerProgressModel.batch_set_party_pet_state(player_profile, target_state)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_gm_grant_blue_pressed() -> void:
	var result = PlayerProgressModel.gm_grant_blue_man_dragon(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = str(result.get("instanceId", pet_selected_instance_id))
		pet_detail_mode = PET_DETAIL_MODE_GROWTH
		if profile_save_enabled:
			host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_gm_level_up_pressed() -> void:
	if pet_selected_instance_id == "":
		_set_world_log_message("请选择要升级的宠物。")
		return
	var result = PlayerProgressModel.gm_level_up_pet_once(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		var updated = result.get("pet", {})
		pet_detail_mode = PET_DETAIL_MODE_GROWTH if updated is Dictionary and str((updated as Dictionary).get("growthSpeciesProfileId", "")).strip_edges() != "" else PET_DETAIL_MODE_INSTANCE
		if profile_save_enabled:
			host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_rename_pressed() -> void:
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if pet_rename_panel == null or pet_rename_input == null:
		return
	pet_rename_title_label.text = "宠物改名"
	pet_rename_input.text = str(selected.get("name", "宠物"))
	pet_rename_panel.visible = true
	host._layout_hud()
	pet_rename_input.grab_focus()
	pet_rename_input.select_all()

func _on_pet_rename_confirmed() -> void:
	if pet_rename_panel == null or pet_rename_input == null:
		return
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_rename", {
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
	var result = PlayerProgressModel.rename_pet(player_profile, pet_selected_instance_id, pet_rename_input.text)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		if profile_save_enabled:
			host._save_player_profile_now()
		_close_pet_rename_panel()
		_refresh_pet_panel()
	else:
		pet_rename_input.text = str(result.get("name", pet_rename_input.text))
		pet_rename_input.grab_focus()
	_set_world_log_message(str(result.get("message", "")))

func _on_pet_cultivation_pressed() -> void:
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty() or pet_cultivation_panel == null:
		return
	pet_cultivation_panel.visible = true
	_refresh_pet_cultivation_panel()
	host._layout_hud()

func _refresh_pet_cultivation_panel() -> void:
	if pet_cultivation_panel == null or pet_cultivation_preview_label == null:
		return
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	var preview = PlayerProgressModel.pet_cultivation_preview(player_profile, pet_selected_instance_id)
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
		var mode = str(preview.get("mode", ""))
		pet_cultivation_confirm_button.text = "确认转生" if mode == "rebirth" else "确认强化"
		pet_cultivation_confirm_button.disabled = not bool(preview.get("ok", false))
		pet_cultivation_confirm_button.tooltip_text = str(preview.get("message", ""))

func _on_pet_cultivation_confirm_pressed() -> void:
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_cultivation_apply", {"instanceId": pet_selected_instance_id}, "宠物培养失败。")
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		_refresh_pet_cultivation_panel()
		return
	var result = PlayerProgressModel.apply_pet_cultivation(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)) and profile_save_enabled:
		host._save_player_profile_now()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()
	_refresh_pet_cultivation_panel()

func _close_pet_cultivation_panel() -> void:
	_hide_control(pet_cultivation_panel, false)

func _on_pet_drop_pressed() -> void:
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
	if selected.is_empty():
		return
	if str(selected.get("state", "")) == PlayerProgressModel.PET_STATE_STORAGE:
		_on_pet_clear_storage_pressed()
		return
	var cell_result = _available_pet_drop_cell_result()
	if not bool(cell_result.get("ok", false)):
		_set_world_log_message("地面太满了")
		return
	var drop_cell = cell_result.get("cell", Vector2i.ZERO) as Vector2i
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_drop", {
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
	var result = PlayerProgressModel.drop_pet(
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
			host._save_player_profile_now()
	_close_pet_rename_panel()
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _on_pet_clear_storage_pressed() -> void:
	var selected = PlayerProgressModel.pet_instance_by_id(player_profile, pet_selected_instance_id)
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
		var parsed = await _submit_server_profile_action("pet_clear_storage", {"instanceId": pet_selected_instance_id}, "清理宠物失败。")
		if bool(parsed.get("ok", false)):
			pet_selected_instance_id = ""
		pet_clear_confirm_instance_id = ""
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		_refresh_pet_panel()
		return
	var result = PlayerProgressModel.clear_storage_pet(player_profile, pet_selected_instance_id)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		pet_selected_instance_id = ""
		if profile_save_enabled:
			host._save_player_profile_now()
	pet_clear_confirm_instance_id = ""
	_set_world_log_message(str(result.get("message", "")))
	_refresh_pet_panel()

func _available_pet_drop_cell_result() -> Dictionary:
	if player == null or map_data.is_empty():
		return {"ok": false}
	var candidates: Array[Vector2i] = []
	var player_cell = IsoMapModel.world_to_grid(map_data, player.global_position)
	var occupied = _ground_pet_occupied_cell_lookup(current_map_id)
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
		var cell = PlayerProgressModel.ground_pet_drop_cell(drop)
		lookup[IsoMapModel.cell_key(cell)] = true
	return lookup

func _ground_pet_drop_for_instance_id(instance_id: String) -> Dictionary:
	for drop in _ground_pet_drops_on_map_fast(current_map_id):
		var pet_instance = PlayerProgressModel.ground_pet_drop_pet(drop)
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
		var drop = value as Dictionary
		if str(drop.get("mapId", "")) == map_id:
			result.append(drop)
	return result

func _find_ground_pet_drop_at_world_point(world_point: Vector2, hit_radius: float = 34.0) -> Dictionary:
	var clicked_cell = IsoMapModel.world_to_grid(map_data, world_point)
	var best_drop: Dictionary = {}
	var best_distance = INF
	for drop in _ground_pet_drops_on_map_fast(current_map_id):
		var cell = PlayerProgressModel.ground_pet_drop_cell(drop)
		var marker_point = _ground_pet_marker_world_position(drop)
		var distance = world_point.distance_to(marker_point)
		if cell == clicked_cell:
			distance = minf(distance, hit_radius * 0.5)
		if distance <= hit_radius and distance < best_distance:
			best_drop = drop
			best_distance = distance
	return best_drop

func _ground_pet_interaction_for_drop(drop: Dictionary) -> Dictionary:
	var cell = PlayerProgressModel.ground_pet_drop_cell(drop)
	var pet_instance = PlayerProgressModel.ground_pet_drop_pet(drop)
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
		var parsed = await _submit_server_profile_action("pet_pickup_drop", {
			"dropId": drop_id,
			"nowSec": int(Time.get_unix_time_from_system()),
		}, "拾取宠物失败。")
		var result = parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
		if bool(parsed.get("ok", false)):
			pet_selected_instance_id = str(result.get("instanceId", pet_selected_instance_id))
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
		_set_world_log_message("\n".join(_string_array_values(parsed.get("logLines", []))))
		return
	var result = PlayerProgressModel.pickup_ground_pet(player_profile, drop_id, int(Time.get_unix_time_from_system()))
	player_profile = result.get("profile", player_profile)
	if (bool(result.get("ok", false)) or bool(result.get("changed", false))) and profile_save_enabled:
		host._save_player_profile_now()
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
	var tick_count = mini(3, int(floor(pet_rest_recovery_elapsed / PET_REST_RECOVER_INTERVAL_SECONDS)))
	pet_rest_recovery_elapsed = fmod(pet_rest_recovery_elapsed, PET_REST_RECOVER_INTERVAL_SECONDS)
	var recovered = false
	for _tick in range(tick_count):
		var result = _apply_pet_rest_recovery_tick(false, false)
		recovered = recovered or bool(result.get("ok", false))
	if recovered:
		if profile_save_enabled:
			host._save_player_profile_now()
		if pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()

func _apply_pet_rest_recovery_tick(save_after: bool = true, refresh_panel: bool = true) -> Dictionary:
	var result = PlayerProgressModel.apply_rest_recovery_tick(player_profile)
	player_profile = result.get("profile", player_profile)
	if bool(result.get("ok", false)):
		if save_after and profile_save_enabled:
			host._save_player_profile_now()
		if refresh_panel and pet_panel != null and pet_panel.visible:
			_refresh_pet_panel()
	return result

func _has_recovering_rest_pet() -> bool:
	var instances = player_profile.get("petInstances", [])
	if not (instances is Array):
		return false
	var instance_values = instances as Array
	for value in instance_values:
		if not (value is Dictionary):
			continue
		var instance = value as Dictionary
		if str(instance.get("state", PlayerProgressModel.PET_STATE_STANDBY)) != PlayerProgressModel.PET_STATE_REST:
			continue
		var max_hp = maxi(1, int(instance.get("maxHp", 1)))
		var hp = clampi(int(instance.get("hp", max_hp)), 0, max_hp)
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
	var now_sec = int(Time.get_unix_time_from_system())
	if not _has_expired_ground_pet_drop(now_sec):
		return
	if _is_server_account_session():
		var parsed = await _submit_server_profile_action("pet_expire_drops", {"nowSec": now_sec}, "")
		if bool(parsed.get("ok", false)):
			if pet_panel != null and pet_panel.visible:
				_refresh_pet_panel()
			_set_world_log_message("地上的宠物离开了。")
		return
	var result = PlayerProgressModel.expire_ground_pet_drops(player_profile, now_sec)
	if not bool(result.get("ok", false)):
		return
	player_profile = result.get("profile", player_profile)
	if profile_save_enabled:
		host._save_player_profile_now()
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
	var drop_values = drops as Array
	for drop_value in drop_values:
		if not (drop_value is Dictionary):
			continue
		var expires_at = int((drop_value as Dictionary).get("expiresAtSec", 0))
		if expires_at > 0 and now_sec >= expires_at:
			return true
	return false
