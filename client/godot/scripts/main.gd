extends Node2D

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")
const PET_SCENE := preload("res://scenes/pet/Pet.tscn")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleLayoutConstants := preload("res://scripts/battle/battle_layout_constants.gd")
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const BattleEventLedger := preload("res://scripts/battle/battle_event_ledger.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const BattleCaptureCapacityModel := preload("res://scripts/battle/battle_capture_capacity_model.gd")
const ServerBattleCoordinator := preload("res://scripts/battle/server_battle_coordinator.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")
const ServerSyncCoordinator := preload("res://scripts/net/server_sync_coordinator.gd")
const AccountAuthModel := preload("res://scripts/progression/account_auth_model.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const BattleResultReceiptModel := preload("res://scripts/progression/battle_result_receipt_model.gd")
const AutoBattleSettingsModel := preload("res://scripts/progression/auto_battle_settings_model.gd")
const AutoCaptureSettingsModel := preload("res://scripts/progression/auto_capture_settings_model.gd")
const AutoCaptureFilterModel := preload("res://scripts/progression/auto_capture_filter_model.gd")
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
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const MailboxPageModel := preload("res://scripts/progression/mailbox_page_model.gd")
const NumericBalanceGateModel := preload("res://scripts/progression/numeric_balance_gate_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")
const NumericEconomyLedgerModel := preload("res://scripts/progression/numeric_economy_ledger_model.gd")
const NumericExperimentModel := preload("res://scripts/progression/numeric_experiment_model.gd")
const NumericWorkbenchModel := preload("res://scripts/progression/numeric_workbench_model.gd")
const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")
const PetGrowthRadarControl := preload("res://scripts/ui/pet_growth_radar_control.gd")
const BackpackPanelPresenter := preload("res://scripts/ui/backpack_panel_presenter.gd")
const AdventureGoalPresenter := preload("res://scripts/ui/adventure_goal_presenter.gd")
const PanelRegistry := preload("res://scripts/ui/panel_registry.gd")
const QaPanelCatalog := preload("res://scripts/ui/qa_panel_catalog.gd")
const QaPanelPresenter := preload("res://scripts/ui/qa_panel_presenter.gd")
const ItemSlotButton := preload("res://scripts/ui/item_slot_button.gd")
const DialogQuestCoordinator := preload("res://scripts/ui/dialog_quest_coordinator.gd")
const PanelFlowCoordinator := preload("res://scripts/ui/panel_flow_coordinator.gd")
const AutoCheckCoordinator := preload("res://scripts/qa/auto_check_coordinator.gd")
const PetPaidResetUiCheck := preload("res://scripts/qa/pet_paid_reset_ui_check.gd")
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
const DEV_ENTRYPOINT_FEATURE := "beastbound_dev_tools"
const START_MAP_ID := "firebud_training_yard"
const GM_10V10_MAP_ID := "gm_10v10_training_ground"
const FIREBUD_EQUIPMENT_SHOP_ID := "firebud_equipment_shop"
const EQUIP_FRAG_WOOD_BASIC_ID := "equip_frag_wood_basic"
const EQUIP_FRAG_HIDE_BASIC_ID := "equip_frag_hide_basic"
const MAP_DATA_PATHS := MapDataCatalog.MAP_DATA_PATHS
const MIN_TOUCH_BUTTON_SIZE := Vector2(64, 64)
const ACTION_BAR_SIZE := Vector2(566, 86)
const ACTION_BAR_COLLAPSED_SIZE := Vector2(58, 86)
const DIALOG_PANEL_HEIGHT := 214.0
const PET_PANEL_MIN_SIZE := Vector2(560.0, 360.0)
const PET_PANEL_MAX_SIZE := Vector2(760.0, 468.0)
const PET_MANAGEMENT_PANEL_MAX_SIZE := Vector2(980.0, 560.0)
const WORLD_LOG_MAX_LINES := 80
const CHAT_MAX_MESSAGES := 120
const CHAT_CHANNEL_SYSTEM := "system"
const CHAT_CHANNEL_NEARBY := "nearby"
const CHAT_CHANNEL_TEAM := "team"
const STARTUP_LOGIN_ISOLATION_ARG := "--manual-acceptance-isolated"
const STARTUP_LOGIN_ISOLATION_ROOT := "res://../../.run/manual_acceptance"
const ONLINE_POSITION_SYNC_INTERVAL_SECONDS := 10.0
const ONLINE_POSITION_MAX_REMOTE_PLAYERS := 24
const ONLINE_POSITION_AOI_RADIUS_CELLS := 18
const PARTY_STATE_POLL_SECONDS := 10.0
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
const BATTLE_COMMAND_PLAYER_SIZE := Vector2(390.0, 196.0)
const BATTLE_COMMAND_MENU_SIZE := Vector2(300.0, 440.0)
const BATTLE_COMMAND_BUTTON_ORDER: Array[String] = ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run", "help"]
const BATTLE_CAPTURE_COMMAND_SLOTS: Array[String] = ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run"]
const BATTLE_COMMAND_COUNTDOWN_SECONDS := 99.0
const BATTLE_TEAM_COMPANION_SLOT_NUMBERS: Array[int] = [1, 2, 4, 5]
const BATTLE_AUTO_ATTACK_STEP_DELAY := 0.16
const BATTLE_PASSIVE_LABEL_FONT_SIZE := 15
const BATTLE_PASSIVE_MAX_LINES := 2
const BATTLE_PASSIVE_PANEL_HEIGHT := 64.0
const BATTLE_PASSIVE_PANEL_COMPACT_HEIGHT := 58.0
const BATTLE_PASSIVE_PANEL_PADDING := Vector2(14.0, 6.0)
const BATTLE_GRID_TEMPLATE_SIZE := BattleLayoutConstants.GRID_TEMPLATE_SIZE
const BATTLE_GRID_TEMPLATE_ORIGIN := BattleLayoutConstants.GRID_TEMPLATE_ORIGIN
const BATTLE_GRID_TEMPLATE_LANE_STEP := BattleLayoutConstants.GRID_TEMPLATE_LANE_STEP
const BATTLE_GRID_TEMPLATE_RANK_STEP := BattleLayoutConstants.GRID_TEMPLATE_RANK_STEP
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
const BATTLE_FLOAT_TEXT_FONT_SIZE := 21
const BATTLE_FLOAT_TEXT_MIN_WIDTH := 90.0
const BATTLE_FLOAT_TEXT_HORIZONTAL_PADDING := 10.0
const BATTLE_AUTO_ROUND_SETTLE_DELAY := 0.24
const BATTLE_ESCAPE_PREVIEW_SECONDS := 0.62
const BATTLE_ESCAPE_PREVIEW_DISTANCE := 108.0
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
const DIALOG_ACTION_BANK := "bank"
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
var version_label: Label
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
var battle_capture_capacity_label: Label
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
var action_bar_scroll: ScrollContainer
var action_bar_collapse_button: Button
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
var family_menu_button: Button
var mailbox_menu_button: Button
var training_partner_menu_button: Button
var auto_settings_menu_button: Button
var account_menu_button: Button
var qa_menu_button: Button
var auth_panel: PanelContainer
var auth_title_label: Label
var auth_message_label: Label
var auth_version_label: Label
var auth_username_input: LineEdit
var auth_password_input: LineEdit
var auth_password_confirm_input: LineEdit
var auth_password_visibility_button: Button
var auth_password_confirm_visibility_button: Button
var auth_password_confirm_row: HBoxContainer
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
var panel_flow_coordinator
var account_panel: PanelContainer
var account_info_label: Label
var account_switch_button: Button
var account_logout_here_button: Button
var account_close_button: Button
var backpack_panel: PanelContainer
var backpack_currency_label: Label
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
var equipment_slot_context_menu: PopupMenu
var equipment_context_slot_id: String = ""
var equipment_context_screen_position: Vector2 = Vector2.ZERO
var equipment_detail_popup_panel: PanelContainer
var equipment_detail_popup_title_label: Label
var equipment_detail_popup_slot_id: String = ""
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
var pet_context_menu: PopupMenu
var pet_context_instance_id: String = ""
var pet_context_screen_position: Vector2 = Vector2.ZERO
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
var mailbox_load_more_button: Button
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
var mailbox_page_state: Dictionary = MailboxPageModel.empty_state()
var mailbox_request_pending: bool = false
var mailbox_pending_kind: String = ""
var mailbox_inbox_tab_button: Button
var mailbox_compose_tab_button: Button
var mailbox_inbox_container: Control
var mailbox_compose_container: Control
var mailbox_active_tab: String = "inbox"
var market_menu_button: Button
var market_panel: PanelContainer
var market_list_container: VBoxContainer
var market_detail_label: RichTextLabel
var market_wallet_label: Label
var market_status_label: Label
var market_refresh_button: Button
var market_close_button: Button
var market_buy_tab_button: Button
var market_sell_tab_button: Button
var market_mine_tab_button: Button
var market_buy_button: Button
var market_cancel_button: Button
var market_sell_form_container: VBoxContainer
var market_sell_item_option: OptionButton
var market_sell_count_spinbox: SpinBox
var market_sell_currency_option: OptionButton
var market_sell_unit_price_spinbox: SpinBox
var market_sell_summary_label: Label
var market_sell_button: Button
var market_http_request: HTTPRequest
var market_listing_buttons: Dictionary = {}
var market_listings: Array[Dictionary] = []
var market_my_listings: Array[Dictionary] = []
var market_config: Dictionary = {}
var market_selected_listing_id: String = ""
var market_mode: String = "buy"
var market_request_pending: bool = false
var market_pending_kind: String = ""
var bank_panel: PanelContainer
var bank_list_container: VBoxContainer
var bank_detail_label: RichTextLabel
var bank_quantity_spinbox: SpinBox
var bank_coin_quantity_spinbox: SpinBox
var bank_deposit_button: Button
var bank_withdraw_button: Button
var bank_coin_deposit_button: Button
var bank_coin_withdraw_button: Button
var bank_unlock_tab_button: Button
var bank_status_label: Label
var bank_close_button: Button
var bank_http_request: HTTPRequest
var bank_item_buttons: Dictionary = {}
var bank_selected_item_id: String = ""
var bank_quantity: int = 1
var bank_coin_quantity: int = 1000
var bank_request_pending: bool = false
var bank_pending_kind: String = ""
var party_panel: PanelContainer
var party_status_label: Label
var party_roster_panel: PanelContainer
var party_roster_container: VBoxContainer
var party_members_container: VBoxContainer
var party_invites_container: VBoxContainer
var party_online_container: VBoxContainer
var party_refresh_button: Button
var party_leave_button: Button
var party_close_button: Button
var party_http_request: HTTPRequest
var party_invite_panel: PanelContainer
var party_invite_title_label: Label
var party_invite_detail_label: Label
var party_invite_status_label: Label
var party_invite_accept_button: Button
var party_invite_decline_button: Button
var party_invite_later_button: Button
var party_invite_http_request: HTTPRequest
var party_invite_current: Dictionary = {}
var party_invite_request_pending: bool = false
var party_invite_pending_kind: String = ""
var party_invite_deferred_ids: Array[String] = []
var party_current_state: Dictionary = {}
var party_online_players: Array[Dictionary] = []
var party_request_pending: bool = false
var party_pending_kind: String = ""
var party_state_poll_elapsed: float = 0.0
var family_panel: PanelContainer
var family_status_label: Label
var family_name_input: LineEdit
var family_create_button: Button
var family_refresh_button: Button
var family_leave_button: Button
var family_summary_container: VBoxContainer
var family_list_container: VBoxContainer
var manor_list_container: VBoxContainer
var family_http_request: HTTPRequest
var family_current_state: Dictionary = {}
var family_list: Array[Dictionary] = []
var family_manors: Array[Dictionary] = []
var family_request_pending: bool = false
var family_pending_kind: String = ""
var family_focus_manor_id: String = ""
var family_detail_expanded: bool = false
var online_position_http_request: HTTPRequest
var online_position_timer: Timer
var online_position_request_pending: bool = false
var online_position_queued_payload: Dictionary = {}
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
var player_action_trade_item_option: OptionButton
var player_action_trade_count_spinbox: SpinBox
var player_action_trade_coin_spinbox: SpinBox
var player_action_trade_refresh_button: Button
var player_action_trade_propose_button: Button
var player_action_trade_accept_button: Button
var player_action_close_button: Button
var player_action_http_request: HTTPRequest
var player_action_target: Dictionary = {}
var player_action_trade_received: Dictionary = {}
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
var qa_pet_recovery_username_input: LineEdit
var qa_pet_recovery_selector_input: LineEdit
var qa_pet_recovery_query_button: Button
var qa_pet_recovery_apply_button: Button
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
var auto_mobile_touch_check: bool = false
var auto_pathfinding_check: bool = false
var auto_eight_direction_check: bool = false
var auto_direct_line_check: bool = false
var auto_facing_check: bool = false
var auto_right_click_facing_check: bool = false
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
var auto_pet_growth_rule_preview_check: bool = false
var auto_training_partner_check: bool = false
var auto_hang_settings_check: bool = false
var auto_offline_hang_live_check: bool = false
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
var auto_pet_paid_reset_ui_check: bool = false
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
var auto_player_message_safety_check: bool = false
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
var auto_server_battle_reaction_replay_check: bool = false
var auto_server_battle_status_replay_check: bool = false
var auto_server_battle_ride_replay_check: bool = false
var auto_server_battle_stale_room_check: bool = false
var auto_server_solo_pve_live_check: bool = false
var auto_server_party_pve_sync_live_check: bool = false
var auto_server_profile_sync_check: bool = false
var auto_client_version_check: bool = false
var auto_release_entrypoint_gate_check: bool = false
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
var auto_stage6_content_check: bool = false
var auto_market_panel_check: bool = false
var auto_map_region_contract_check: bool = false
var auto_manor_map_shop_check: bool = false
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
var auto_pet_growth_authority_check: bool = false
var auto_server_pet_growth_boundary_check: bool = false
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
var release_entrypoint_gate_test_mode: bool = false
var release_dev_entrypoint_blocked: bool = false
var backpack_preview: bool = false
var backpack_world_use_preview: bool = false
var backpack_filter_preview: bool = false
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
var bank_drag_preview: bool = false
var shop_preview: bool = false
var battle_reward_preview: bool = false
var equipment_drop_preview: bool = false
var quest_preview: bool = false
var quest_ui_preview: bool = false
var tutorial_task_preview: bool = false
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
var capture_capacity_preview: bool = false
var capture_capacity_preview_screenshot_path: String = ""
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
var startup_login_isolation_applied: bool = false
var current_account_session: Dictionary = {}
var gm_tool_server_access_state: Dictionary = {}
var gm_tool_server_access_request_pending: bool = false
var gm_tool_server_access_generation: int = 0
var server_profile_sync_state: String = "off"
var server_profile_sync_pending_kind: String = ""
var server_profile_sync_dirty: bool = false
var server_profile_sync_pull_queued: bool = false
var server_profile_sync_deferred_pull_result: Dictionary = {}
var server_profile_sync_deferred_pull_elapsed: float = 0.0
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
var pet_follow_instance_id: String = ""
var pet_follow_points: Array[Vector2] = []
var pet_follow_index: int = 0
var target_marker: Vector2 = Vector2.ZERO
var has_target_marker: bool = false
var target_cell: Vector2i = Vector2i.ZERO
var has_target_cell: bool = false
var click_move_repath_cooldown: float = 0.0
var click_move_repath_apply_count: int = 0
var click_move_screen_resolve_count: int = 0
var click_move_input_accept_count: int = 0
var click_move_input_ui_reject_count: int = 0
var click_move_input_remote_hit_count: int = 0
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
# 服务器账号会话默认走 movement/step 权威移动；本地档案会话不受影响。
# QA/性能调试可用 --local-world-move 退回纯本地移动。
var server_step_world_move_enabled: bool = true
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
var battle_capture_button_tool_ids: Dictionary = {}
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
var battle_escape_preview_actor_ids: Array[String] = []
var battle_escape_preview_started_msec: int = 0
var battle_command_countdown_remaining: float = 99.0
var battle_command_countdown_last_second: int = -1
var battle_round_display_last_text: String = ""
var battle_timer_display_last_text: String = ""
var battle_trace_path: String = ""
var gm_battle_speed_multiplier: int = GM_BATTLE_SPEED_MIN
var last_checked_player_cell: Vector2i = Vector2i.ZERO
var encounter_zone_step_count: int = 0
var encounter_grace_remaining: float = 0.0
var pending_server_encounter_permit: Dictionary = {}
var hang_mode_active: bool = false
var hang_walk_direction_index: int = 0
var hang_walk_cooldown: float = 0.0
var hang_heal_resume_active: bool = false
var hang_heal_resume_mode: String = ""
var hang_heal_resume_map_id: String = ""
var hang_heal_resume_cell: Vector2i = Vector2i.ZERO
var hang_session_request_active: bool = false
var hang_stop_after_battle_requested: bool = false
var encounter_stone_item_id: String = ""
var encounter_stone_interval: float = 0.0
var encounter_stone_remaining: float = 0.0
var encounter_stone_elapsed: float = 0.0
var battle_auto_attack_enabled: bool = false
var battle_auto_attack_delay: float = 0.0
var battle_auto_attack_player_submissions: int = 0
var battle_auto_attack_pet_submissions: int = 0
var action_bar_collapsed: bool = false
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
var task_tracker_hud_prefix_cache: String = "目标  当前没有任务\n行动  探索营地，寻找新的委托"
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


func _panel_flow():
	if panel_flow_coordinator == null:
		panel_flow_coordinator = PanelFlowCoordinator.new(self)
	return panel_flow_coordinator


func _ready() -> void:
	_configure_runtime_performance()
	_apply_preview_window_args()
	if _restart_with_startup_login_user_data_dir_if_needed():
		return
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
	_update_hud_text(true)
	_reset_perf_probe_counters()
	_sync_keyboard_movement_input_gate()
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
	elif auto_server_battle_reaction_replay_check:
		call_deferred("_run_auto_server_battle_reaction_replay_check")
	elif auto_server_battle_status_replay_check:
		call_deferred("_run_auto_server_battle_status_replay_check")
	elif auto_server_battle_ride_replay_check:
		call_deferred("_run_auto_server_battle_ride_replay_check")
	elif auto_server_battle_stale_room_check:
		call_deferred("_run_auto_server_battle_stale_room_check")
	elif auto_server_solo_pve_live_check:
		call_deferred("_run_auto_server_solo_pve_live_check")
	elif auto_server_party_pve_sync_live_check:
		call_deferred("_run_auto_server_party_pve_sync_live_check")
	elif auto_auth_server_client_check:
		call_deferred("_run_auto_auth_server_client_check")
	elif auto_player_message_safety_check:
		call_deferred("_run_auto_player_message_safety_check")
	elif auto_server_profile_sync_check:
		call_deferred("_run_auto_server_profile_sync_check")
	elif auto_client_version_check:
		call_deferred("_run_auto_client_version_check")
	elif auto_release_entrypoint_gate_check:
		call_deferred("_run_auto_release_entrypoint_gate_check")
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
	elif auto_pet_growth_rule_preview_check:
		call_deferred("_run_auto_pet_growth_rule_preview_check")
	elif auto_training_partner_check:
		call_deferred("_run_auto_training_partner_check")
	elif auto_hang_settings_check:
		call_deferred("_run_auto_hang_settings_check")
	elif auto_offline_hang_live_check:
		call_deferred("_run_auto_offline_hang_live_check")
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
	elif auto_pet_paid_reset_ui_check:
		call_deferred("_run_auto_pet_paid_reset_ui_check")
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
	elif auto_stage6_content_check:
		call_deferred("_run_auto_stage6_content_check")
	elif auto_market_panel_check:
		call_deferred("_run_auto_market_panel_check")
	elif auto_map_region_contract_check:
		call_deferred("_run_auto_map_region_contract_check")
	elif auto_manor_map_shop_check:
		call_deferred("_run_auto_manor_map_shop_check")
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
	elif auto_pet_growth_authority_check:
		call_deferred("_run_auto_pet_growth_authority_check")
	elif auto_server_pet_growth_boundary_check:
		call_deferred("_run_auto_server_pet_growth_boundary_check")
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
	elif bank_drag_preview:
		call_deferred("_run_bank_drag_preview")
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
	elif tutorial_task_preview:
		call_deferred("_run_tutorial_task_preview")
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
	elif capture_capacity_preview:
		call_deferred("_run_capture_capacity_preview")
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
	elif auto_right_click_facing_check:
		call_deferred("_run_auto_right_click_facing_check")
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
	elif auto_mobile_touch_check:
		call_deferred("_run_auto_mobile_touch_check")
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


func _parse_preview_window_size(raw_value: String) -> Vector2i:
	var parts := raw_value.to_lower().split("x", false)
	if parts.size() != 2:
		return Vector2i.ZERO
	var width := int(parts[0])
	var height := int(parts[1])
	if width < 240 or height < 240:
		return Vector2i.ZERO
	return Vector2i(width, height)


func _apply_preview_window_size(size: Vector2i) -> void:
	if size == Vector2i.ZERO:
		return
	var window := get_window()
	window.size = size
	window.content_scale_size = size


func _dev_entrypoints_allowed() -> bool:
	if release_entrypoint_gate_test_mode:
		return false
	return OS.has_feature("editor") or OS.has_feature("debug") or OS.has_feature(DEV_ENTRYPOINT_FEATURE)


func _release_entrypoints_locked() -> bool:
	return release_entrypoint_gate_test_mode or (OS.has_feature("release") and not _dev_entrypoints_allowed())


func _dev_entrypoint_arg(arg: String) -> bool:
	var normalized := arg.strip_edges()
	if normalized == "":
		return false
	return (
		normalized.begins_with("--auto-")
		or normalized.ends_with("-check")
		or normalized.find("-preview") >= 0
		or normalized.ends_with("-demo")
		or normalized.ends_with("-test")
		or normalized == "--perf-probe"
		or normalized == "--numeric-experiment-report"
		or normalized == "--gm-10v10-map"
		or normalized == "--qa-viewport"
		or normalized.begins_with("--qa-viewport=")
		or normalized == "--battle-debug-window"
		or normalized == "--server-step-world-move"
	)


func _apply_preview_window_args() -> void:
	var args := OS.get_cmdline_user_args()
	release_dev_entrypoint_blocked = false
	for index in range(args.size()):
		var arg := str(args[index])
		if _release_entrypoints_locked() and _dev_entrypoint_arg(arg):
			release_dev_entrypoint_blocked = true
			continue
		if _dev_entrypoint_arg(arg):
			profile_save_enabled = false
			if arg != "--auto-auth-check" and arg != "--auto-auth-server-live-check" and arg != "--auto-startup-login-check":
				auth_auto_bypass = true
		if arg == "--preview-mobile":
			_apply_preview_window_size(Vector2i(1280, 720))
		elif arg == "--preview-phone-landscape":
			_apply_preview_window_size(Vector2i(844, 390))
		elif arg == "--qa-viewport":
			_apply_preview_window_size(_parse_preview_window_size(_cmdline_user_arg_at(args, index + 1)))
		elif arg.begins_with("--qa-viewport="):
			_apply_preview_window_size(_parse_preview_window_size(arg.substr("--qa-viewport=".length())))
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
		elif arg == STARTUP_LOGIN_ISOLATION_ARG:
			startup_login_isolation_applied = true
		elif arg == "--server-step-world-move":
			server_step_world_move_enabled = true
		elif arg == "--local-world-move":
			server_step_world_move_enabled = false
		elif arg == "--preview-mobile-portrait":
			_apply_preview_window_size(Vector2i(390, 844))
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
		elif arg == "--auto-mobile-touch-check":
			auto_mobile_touch_check = true
		elif arg == "--auto-pathfinding-check":
			auto_pathfinding_check = true
		elif arg == "--auto-eight-direction-check":
			auto_eight_direction_check = true
		elif arg == "--auto-direct-line-check":
			auto_direct_line_check = true
		elif arg == "--auto-facing-check":
			auto_facing_check = true
		elif arg == "--auto-right-click-facing-check":
			auto_right_click_facing_check = true
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
		elif arg == "--auto-pet-growth-rule-preview-check":
			auto_pet_growth_rule_preview_check = true
		elif arg == "--auto-training-partner-check":
			auto_training_partner_check = true
		elif arg == "--auto-hang-settings-check":
			auto_hang_settings_check = true
		elif arg == "--auto-offline-hang-live-check":
			auto_offline_hang_live_check = true
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
		elif arg == "--auto-pet-paid-reset-ui-check":
			auto_pet_paid_reset_ui_check = true
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
		elif arg == "--auto-player-message-safety-check":
			auto_player_message_safety_check = true
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
		elif arg == "--auto-server-battle-reaction-replay-check":
			auto_server_battle_reaction_replay_check = true
		elif arg == "--auto-server-battle-status-replay-check":
			auto_server_battle_status_replay_check = true
		elif arg == "--auto-server-battle-ride-replay-check":
			auto_server_battle_ride_replay_check = true
		elif arg == "--auto-server-battle-stale-room-check":
			auto_server_battle_stale_room_check = true
		elif arg == "--auto-server-solo-pve-live-check":
			auto_server_solo_pve_live_check = true
		elif arg == "--auto-server-party-pve-sync-live-check":
			auto_server_party_pve_sync_live_check = true
		elif arg == "--auto-server-profile-sync-check":
			auto_server_profile_sync_check = true
		elif arg == "--auto-client-version-check":
			auto_client_version_check = true
		elif arg == "--auto-release-entrypoint-gate-check":
			auto_release_entrypoint_gate_check = true
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
		elif arg == "--auto-stage6-content-check":
			auto_stage6_content_check = true
		elif arg == "--auto-market-panel-check":
			auto_market_panel_check = true
		elif arg == "--auto-map-region-contract-check":
			auto_map_region_contract_check = true
		elif arg == "--auto-manor-map-shop-check":
			auto_manor_map_shop_check = true
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
		elif arg == "--auto-pet-growth-authority-check":
			auto_pet_growth_authority_check = true
		elif arg == "--auto-server-pet-growth-boundary-check":
			auto_server_pet_growth_boundary_check = true
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
		elif arg == "--bank-drag-preview":
			bank_drag_preview = true
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
		elif arg == "--tutorial-task-preview":
			tutorial_task_preview = true
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
		elif arg == "--capture-capacity-preview":
			capture_capacity_preview = true
		elif arg.begins_with("--capture-capacity-preview-screenshot="):
			capture_capacity_preview = true
			capture_capacity_preview_screenshot_path = arg.trim_prefix("--capture-capacity-preview-screenshot=").strip_edges()
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


func _restart_with_startup_login_user_data_dir_if_needed() -> bool:
	if startup_login_isolation_applied or not _startup_auth_login_requested():
		return false
	var username := AccountAuthModel.normalized_username(startup_auth_username)
	if username == "":
		return false
	if _cmdline_engine_arg_present("--user-data-dir"):
		return false
	var target_dir := _startup_login_user_data_dir(username)
	var current_dir := ProjectSettings.globalize_path("user://").simplify_path()
	if current_dir.begins_with(target_dir):
		return false
	var err := DirAccess.make_dir_recursive_absolute(target_dir)
	if err != OK:
		push_warning("无法创建启动登录隔离目录：%s" % target_dir)
		return false
	var launch_args := _startup_login_relaunch_engine_args()
	launch_args.append("--path")
	launch_args.append(ProjectSettings.globalize_path("res://").simplify_path())
	launch_args.append("--user-data-dir")
	launch_args.append(target_dir)
	launch_args.append("--scene")
	launch_args.append("res://scenes/Main.tscn")
	launch_args.append("--")
	for value in OS.get_cmdline_user_args():
		launch_args.append(str(value))
	launch_args.append(STARTUP_LOGIN_ISOLATION_ARG)
	var pid := OS.create_process(OS.get_executable_path(), launch_args)
	if pid <= 0:
		push_warning("启动登录隔离进程创建失败：%s" % target_dir)
		return false
	print("startup login user data isolated: username=%s dir=%s pid=%d" % [username, target_dir, pid])
	get_tree().quit(0)
	return true


func _startup_login_user_data_dir(username: String) -> String:
	return ProjectSettings.globalize_path("%s/%s" % [STARTUP_LOGIN_ISOLATION_ROOT, username]).simplify_path()


func _startup_login_relaunch_engine_args() -> PackedStringArray:
	var launch_args := PackedStringArray()
	var engine_args := OS.get_cmdline_args()
	for index in range(engine_args.size()):
		var arg := str(engine_args[index])
		if arg == "--":
			break
		if arg == "--headless":
			launch_args.append(arg)
		elif arg == "--quit-after" and index + 1 < engine_args.size():
			launch_args.append(arg)
			launch_args.append(str(engine_args[index + 1]))
		elif arg.begins_with("--quit-after="):
			launch_args.append(arg)
	return launch_args


func _cmdline_engine_arg_present(flag: String) -> bool:
	var engine_args := OS.get_cmdline_args()
	for arg_value in engine_args:
		var arg := str(arg_value)
		if arg == "--":
			break
		if arg == flag or arg.begins_with("%s=" % flag):
			return true
	return false


func _normalize_cmdline_url(value: String) -> String:
	var text := value.strip_edges()
	var markdown_separator := text.find("](")
	if text.begins_with("[") and markdown_separator > 0 and text.ends_with(")"):
		return text.substr(markdown_separator + 2, text.length() - markdown_separator - 3).strip_edges()
	return text


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
	var base_url := _normalize_cmdline_url(startup_auth_base_url)
	if base_url != "" and auth_server_url_input != null:
		auth_server_url_input.text = base_url
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
	var before_input_accept_count := click_move_input_accept_count
	var before_input_ui_reject_count := click_move_input_ui_reject_count
	var before_input_remote_hit_count := click_move_input_remote_hit_count
	var last_cell := start_cell
	var click_count := 0
	var input_elapsed_usec := 0
	var max_input_usec := 0
	var ui_skipped_count := 0
	var mouse_event_count := 0
	var viewport_rect := Rect2(Vector2.ZERO, _layout_size())
	for frame_index in range(120):
		for burst_index in range(3):
			var index := frame_index * 3 + burst_index
			var offset := Vector2i(4 + (index % 9), -4 - (index % 7))
			var candidate := IsoMapModel.nearest_walkable_cell(map_data, start_cell + offset)
			if not IsoMapModel.is_inside(map_data, candidate):
				continue
			var screen_point := _world_to_screen(IsoMapModel.grid_to_world(map_data, candidate))
			if not viewport_rect.has_point(screen_point) or _is_ui_point(screen_point):
				ui_skipped_count += 1
				continue
			last_cell = candidate
			var event := InputEventMouseButton.new()
			if event is InputEventMouseButton:
				mouse_event_count += 1
			event.button_index = MOUSE_BUTTON_LEFT
			event.pressed = true
			event.position = screen_point
			var started_usec := Time.get_ticks_usec()
			_handle_world_pointer_pressed(event.position, false, true)
			var elapsed_usec := Time.get_ticks_usec() - started_usec
			input_elapsed_usec += elapsed_usec
			max_input_usec = maxi(max_input_usec, elapsed_usec)
			click_count += 1
		await get_tree().physics_frame
	for _step in range(60):
		await get_tree().physics_frame
	var applied_count := click_move_repath_apply_count - before_apply_count
	var resolved_count := click_move_screen_resolve_count - before_resolve_count
	var input_accept_count := click_move_input_accept_count - before_input_accept_count
	var input_ui_reject_count := click_move_input_ui_reject_count - before_input_ui_reject_count
	var input_remote_hit_count := click_move_input_remote_hit_count - before_input_remote_hit_count
	var moved := player.global_position.distance_to(start_position) > 16.0
	var avg_input_usec := int(round(float(input_elapsed_usec) / maxf(1.0, float(click_count))))
	var input_fast := avg_input_usec <= 250 and max_input_usec <= 12000
	var coalesced := resolved_count <= 70 and applied_count <= 70
	var settled := not has_pending_click_screen_point and not has_pending_click_move_target
	var final_target_matches := has_target_cell and target_cell == last_cell
	var status := "ok" if click_count > 0 and moved and coalesced and input_fast and settled and final_target_matches else "failed"
	print("movement spam click check ready: status=%s clicks=%d ui_skipped=%d mouse_events=%d input_ui=%d remote_hit=%d accepted=%d resolved=%d applied=%d avg_input_us=%d max_input_us=%d moved=%s coalesced=%s settled=%s final_match=%s auth=%s bypass=%s battle=%s encounter=%s auth_panel=%s final_target=%s expected=%s" % [
		status,
		click_count,
		ui_skipped_count,
		mouse_event_count,
		input_ui_reject_count,
		input_remote_hit_count,
		input_accept_count,
		resolved_count,
		applied_count,
		avg_input_usec,
		max_input_usec,
		str(moved),
		str(coalesced),
		str(settled),
		str(final_target_matches),
		str(account_authenticated),
		str(auth_auto_bypass),
		str(battle_active),
		str(encounter_active),
		str(auth_panel != null and auth_panel.visible),
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


func _run_auto_mobile_touch_check() -> void:
	await _auto_checks()._run_auto_mobile_touch_check()


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


func _run_auto_pet_growth_rule_preview_check() -> void:
	await _auto_checks()._run_auto_pet_growth_rule_preview_check()


func _auto_capture_full_pet_profile() -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	var base_pet := PlayerProgressModel.pet_instance_by_id(profile, "pet_bui_main")
	if base_pet.is_empty():
		base_pet = PlayerProgressModel.create_pet_instance_from_form(
			"pet_bui_main",
			"随行布伊",
			"bui_normal_red_fire10",
			PlayerProgressModel.PET_STATE_BATTLE,
			1
		)
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


func _run_capture_capacity_preview() -> void:
	profile_save_enabled = false
	player_profile = PlayerProgressModel.default_profile()
	var instances: Array[Dictionary] = []
	for index in range(PlayerProgressModel.PARTY_LIMIT + PlayerProgressModel.STORAGE_LIMIT):
		var state := PlayerProgressModel.PET_STATE_STANDBY if index < PlayerProgressModel.PARTY_LIMIT else PlayerProgressModel.PET_STATE_STORAGE
		instances.append(PlayerProgressModel.create_pet_instance_from_form(
			"capture_capacity_preview_%d" % index,
			"容量测试宠%d" % (index + 1),
			"wuli_normal_orange_fire10",
			state,
			1
		))
	player_profile["petInstances"] = instances
	var loaded := _load_map("firebud_village_gate", "from_training_yard")
	var zones := EncounterModel.encounter_zones(map_data)
	if not loaded or zones.is_empty():
		return
	_start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	await get_tree().process_frame
	_set_battle_command_owner("player")
	_sync_battle_buttons()
	if capture_capacity_preview_screenshot_path != "":
		if DisplayServer.get_name() == "headless":
			print("CAPTURE_CAPACITY_PREVIEW_SCREENSHOT path=%s status=error_headless_renderer" % capture_capacity_preview_screenshot_path)
			get_tree().quit(1)
			return
		await get_tree().process_frame
		await get_tree().process_frame
		var directory_error := DirAccess.make_dir_recursive_absolute(capture_capacity_preview_screenshot_path.get_base_dir())
		var save_error := directory_error
		if save_error == OK:
			save_error = get_viewport().get_texture().get_image().save_png(capture_capacity_preview_screenshot_path)
		print("CAPTURE_CAPACITY_PREVIEW_SCREENSHOT path=%s status=%s" % [
			capture_capacity_preview_screenshot_path,
			"ok" if save_error == OK else "error_%d" % save_error,
		])
		get_tree().quit(0 if save_error == OK else 1)


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


func _run_auto_pet_growth_authority_check() -> void:
	await _auto_checks()._run_auto_pet_growth_authority_check()


func _run_auto_server_pet_growth_boundary_check() -> void:
	await _auto_checks()._run_auto_server_pet_growth_boundary_check()


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


func _run_auto_pet_paid_reset_ui_check() -> void:
	await PetPaidResetUiCheck.run(self)


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
		{"itemId": BattleModel.ITEM_MEAT_SMALL, "count": 2},
		{"itemId": BattleModel.ITEM_HEAL_ALL, "count": 1},
		{"itemId": BattleModel.CAPTURE_TOOL_ROPE_BASIC, "count": 1},
		{"itemId": "weapon_wooden_club", "count": 1},
		{"itemId": ENCOUNTER_STONE_LOW_ID, "count": 1},
		{"itemId": BattleModel.CAPTURE_TOOL_NET_REINFORCED, "count": 1},
	])
	return PlayerProgressModel.with_backpack_slots(profile, add_result.get("slots", []))


func _run_auto_backpack_filter_check() -> void:
	await _auto_checks()._run_auto_backpack_filter_check()


func _run_bank_drag_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	account_authenticated = true
	current_account_session = {
		"accountId": "bank_drag_preview_account",
		"username": "bank_preview",
		"displayName": "银行预览",
		"authSource": ServerAuthClientModel.SOURCE_SERVER,
		"serverSessionToken": "bank_drag_preview_token",
		"serverBaseUrl": ServerAuthClientModel.DEFAULT_BASE_URL,
	}
	server_profile_sync_state = "ready"
	var preview_profile := PlayerProgressModel.with_stone_coins(PlayerProgressModel.default_profile(), 1780)
	var slots := PlayerProgressModel.backpack_slots(preview_profile)
	slots = BackpackModel.set_item_count(slots, BattleModel.ITEM_MEAT_SMALL, 18)
	slots = BackpackModel.set_item_count(slots, "trail_ration_pack", 4)
	slots = BackpackModel.set_item_count(slots, BattleModel.CAPTURE_TOOL_NET, 5)
	preview_profile = PlayerProgressModel.with_backpack_slots(preview_profile, slots)
	preview_profile["bank"] = {
		"stoneCoins": 2400,
		"items": [
			{"itemId": "quest_field_note", "count": 2},
			{"itemId": "item_pet_salve_mid", "count": 6},
			{"itemId": BattleModel.ITEM_HEAL_SINGLE, "count": 3},
		],
		"schemaVersion": 1,
	}
	player_profile = PlayerProgressModel.normalize_profile(preview_profile)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("银行：左边是背包，右边是银行；拖动物品后选择数量。")
	_open_bank_panel()
	await get_tree().process_frame
	await get_tree().process_frame
	var source_button = bank_item_buttons.get("bank_backpack:%s" % BattleModel.ITEM_MEAT_SMALL, null)
	var target_button = bank_item_buttons.get("bank_storage:quest_field_note", null)
	if source_button is Control:
		var source_slot := source_button as Control
		var source_center := source_slot.get_global_rect().get_center()
		var target_center := source_center + Vector2(330.0, 0.0)
		if target_button is Control:
			target_center = (target_button as Control).get_global_rect().get_center()
		var press := InputEventMouseButton.new()
		press.button_index = MOUSE_BUTTON_LEFT
		press.pressed = true
		press.position = source_center
		press.global_position = source_center
		Input.parse_input_event(press)
		await get_tree().process_frame
		var previous_pos := source_center
		for target_pos in [source_center + Vector2(-260.0, 0.0), target_center]:
			for step in range(30):
				var progress := float(step + 1) / 30.0
				var eased := 1.0 - pow(1.0 - progress, 2.0)
				var next_pos := previous_pos.lerp(target_pos, eased)
				var motion := InputEventMouseMotion.new()
				motion.position = next_pos
				motion.global_position = next_pos
				motion.relative = next_pos - previous_pos
				motion.button_mask = MOUSE_BUTTON_MASK_LEFT
				Input.parse_input_event(motion)
				previous_pos = next_pos
				await get_tree().process_frame
		var release := InputEventMouseButton.new()
		release.button_index = MOUSE_BUTTON_LEFT
		release.pressed = false
		release.position = target_center
		release.global_position = target_center
		Input.parse_input_event(release)
		await get_tree().process_frame
	if _panel_flow().item_stack_split_panel == null or not _panel_flow().item_stack_split_panel.visible:
		_panel_flow()._on_item_slot_dropped({
			"context": "bank_backpack",
			"itemId": BattleModel.ITEM_MEAT_SMALL,
			"count": 18,
			"dragKind": "item_slot",
		}, {
			"context": "bank_storage",
			"accepts": ["bank_backpack", "backpack"],
		})
	var preview_flow = _panel_flow()
	if preview_flow.item_stack_split_panel != null and preview_flow.item_stack_split_panel.visible:
		for _frame in range(24):
			await get_tree().process_frame
		if preview_flow.item_stack_split_quantity_spinbox != null:
			preview_flow.item_stack_split_quantity_spinbox.value = float(int(preview_flow.item_stack_split_request.get("maxQuantity", 18)))
		for _frame in range(18):
			await get_tree().process_frame
		preview_flow._close_item_stack_split_panel(false)
		var preview_slots_after := PlayerProgressModel.backpack_slots(player_profile)
		preview_slots_after = BackpackModel.set_item_count(preview_slots_after, BattleModel.ITEM_MEAT_SMALL, 0)
		player_profile = PlayerProgressModel.with_backpack_slots(player_profile, preview_slots_after)
		var preview_bank := PlayerProgressModel.bank_data(player_profile)
		var preview_bank_items: Array = preview_bank.get("items", []) if preview_bank.get("items", []) is Array else []
		var merged_item := false
		for index in range(preview_bank_items.size()):
			if not (preview_bank_items[index] is Dictionary):
				continue
			var stored_item := (preview_bank_items[index] as Dictionary).duplicate(true)
			if str(stored_item.get("itemId", "")) != BattleModel.ITEM_MEAT_SMALL:
				continue
			stored_item["count"] = maxi(0, int(stored_item.get("count", 0))) + 18
			preview_bank_items[index] = stored_item
			merged_item = true
			break
		if not merged_item:
			preview_bank_items.append({"itemId": BattleModel.ITEM_MEAT_SMALL, "count": 18})
		preview_bank["items"] = preview_bank_items
		player_profile["bank"] = preview_bank
		player_profile = PlayerProgressModel.normalize_profile(player_profile)
		preview_flow.bank_selected_item_id = BattleModel.ITEM_MEAT_SMALL
		if preview_flow.bank_status_label != null:
			preview_flow.bank_status_label.text = "预览：存入银行：肉 x18。"
		preview_flow._refresh_bank_panel()


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
		if target < 6:
			profile = _profile_with_rebirth_test_level(profile, 80)
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


func _run_auto_stage6_content_check() -> void:
	await _auto_checks()._run_auto_stage6_content_check()


func _run_auto_market_panel_check() -> void:
	await _auto_checks()._run_auto_market_panel_check()


func _run_auto_map_region_contract_check() -> void:
	await _auto_checks()._run_auto_map_region_contract_check()


func _run_auto_manor_map_shop_check() -> void:
	await _auto_checks()._run_auto_manor_map_shop_check()


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


func _run_tutorial_task_preview() -> void:
	profile_save_enabled = false
	world_log_history.clear()
	world_log_message = ""
	player_profile = _profile_with_active_quest("quest_market_sell_player")
	var slots := BackpackModel.set_item_count(PlayerProgressModel.backpack_slots(player_profile), "tutorial_worn_hide", 1)
	player_profile = PlayerProgressModel.with_backpack_slots(player_profile, slots)
	_load_map("firebud_village_gate", "from_training_yard")
	_set_world_log_message("村口守卫：把旧兽皮挂到买卖里，教学买家会马上买下它。")
	_open_quest_panel()
	if status_label != null:
		_update_hud_text()
	var screenshot_path := OS.get_environment("BEASTBOUND_SCREENSHOT_PATH").strip_edges()
	if screenshot_path != "":
		await get_tree().process_frame
		await get_tree().process_frame
		var screenshot := get_viewport().get_texture().get_image()
		var screenshot_error := screenshot.save_png(screenshot_path)
		print("tutorial task screenshot: status=%s path=%s" % ["ok" if screenshot_error == OK else "failed", screenshot_path])
		get_tree().quit(0 if screenshot_error == OK else 1)


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
		"quest_first_victory",
		"quest_buy_spirit_armor",
		"quest_equip_spirit_armor",
		"quest_use_moist_spirit",
		"quest_buy_poison_spirit_armor",
		"quest_equip_poison_spirit_armor",
		"quest_training_partner_intro",
		"quest_group_brawl",
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
	var equipment_slots := profile.get(PlayerProgressModel.EQUIPMENT_SLOTS_KEY, {}) as Dictionary
	equipment_slots["head"] = "helm_dew_band"
	equipment_slots["body"] = "armor_toxin_wrap"
	profile[PlayerProgressModel.EQUIPMENT_SLOTS_KEY] = equipment_slots
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


func _run_auto_offline_hang_live_check() -> void:
	await _auto_checks()._run_auto_offline_hang_live_check()


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
		if quest_id == "" or [
			"quest_capture_wuli",
			"quest_open_codex_panel",
			"quest_open_family_panel",
			"quest_open_account_panel",
			"quest_rebirth_1_guidance",
		].has(quest_id):
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


func _run_auto_player_message_safety_check() -> void:
	await _auto_checks()._run_auto_player_message_safety_check()


func _run_auto_client_version_check() -> void:
	await _auto_checks()._run_auto_client_version_check()


func _run_auto_release_entrypoint_gate_check() -> void:
	await _auto_checks()._run_auto_release_entrypoint_gate_check()


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


func _run_auto_server_battle_reaction_replay_check() -> void:
	await _auto_checks()._run_auto_server_battle_reaction_replay_check()


func _run_auto_server_battle_status_replay_check() -> void:
	await _auto_checks()._run_auto_server_battle_status_replay_check()


func _run_auto_server_battle_ride_replay_check() -> void:
	await _auto_checks()._run_auto_server_battle_ride_replay_check()


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
	var prepared_spec := ServerAuthClientModel.prepare_request_for_send(spec)
	var max_attempts := ServerAuthClientModel.request_retry_attempts(prepared_spec)
	var attempt := 0
	var response: Dictionary = {}
	while attempt < max_attempts:
		attempt += 1
		response = await _auto_http_request_spec_once(prepared_spec)
		response["attempts"] = attempt
		response["retryPolicy"] = ServerAuthClientModel.request_retry_policy(prepared_spec)
		response["idempotent"] = ServerAuthClientModel.request_is_idempotent(prepared_spec)
		if not ServerAuthClientModel.request_should_retry(
			prepared_spec,
			int(response.get("result", HTTPRequest.RESULT_SUCCESS)),
			int(response.get("responseCode", 0)),
			attempt
		):
			break
		var delay_seconds := ServerAuthClientModel.request_retry_delay_seconds(prepared_spec, attempt)
		if delay_seconds > 0.0:
			await get_tree().create_timer(delay_seconds).timeout
	response["retried"] = attempt > 1
	if int(response.get("result", HTTPRequest.RESULT_SUCCESS)) != HTTPRequest.RESULT_SUCCESS:
		response["body"] = ServerAuthClientModel.network_failure_body(
			prepared_spec,
			int(response.get("result", -1)),
			int(response.get("error", OK)),
			attempt,
			attempt >= max_attempts
		)
		response["responseCode"] = 0
		response["ok"] = false
	return response


func _auto_http_request_spec_once(spec: Dictionary) -> Dictionary:
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


func _auto_check_status_cleanse_item() -> Dictionary:
	var started := _start_stat_formula_test_battle()
	await get_tree().process_frame
	if not started:
		return {"ok": false, "reason": "not_started"}
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
	var poison_removed := not BattleStatusModel.has_status(target, BattleModel.STATUS_POISON)
	var sleep_removed := not BattleStatusModel.has_status(target, BattleModel.STATUS_SLEEP)
	var ledger_cleansed := str(battle_last_event_ledger.get("statusResult", "")) == "cleansed"
	return {
		"ok": (
		menu_open
		and button_label_ok
		and mode_ok
		and selected
		and pet_panel_open
		and saw_event
		and after_count == before_count - 1
		and poison_removed
		and sleep_removed
		and ledger_cleansed
		),
		"menu": menu_open,
		"label": button_label_ok,
		"mode": mode_ok,
		"selected": selected,
		"petMenu": pet_panel_open,
		"event": saw_event,
		"beforeCount": before_count,
		"afterCount": after_count,
		"poisonRemoved": poison_removed,
		"sleepRemoved": sleep_removed,
		"ledgerCleansed": ledger_cleansed,
		"lastEvent": battle_last_event_type,
	}


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
	var test_profile := PlayerProgressModel.default_profile()
	test_profile["petInstances"] = [
		PlayerProgressModel.create_pet_instance_from_form(
			"pet_stat_formula_active",
			"数值验证布伊",
			"bui_normal_red_fire10",
			PlayerProgressModel.PET_STATE_BATTLE,
			1
		),
	]
	test_profile["activePetInstanceId"] = "pet_stat_formula_active"
	test_profile["nextPetInstanceSerial"] = 2
	test_profile = PlayerProgressModel.with_battle_item_inventory(test_profile, BattleModel.default_item_bag())
	player_profile = PlayerProgressModel.normalize_profile(test_profile)
	_start_battle(BattleModel.create_stat_formula_test_battle(zones[0] as Dictionary))
	player_profile = previous_profile
	return true


func _battle_buttons_match_request() -> bool:
	var expected := {
		"attack": "攻击",
		"spirit": "精灵",
		"capture": "捕捉",
		"help": "帮助",
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
	battle_capture_button_tool_ids.clear()
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
		_apply_capture_tool_button_labels()
	elif owner == "switch_pet":
		battle_command_title_label.text = "换宠"
		_apply_switch_pet_button_labels()
	else:
		battle_command_title_label.text = "人物"
		_apply_battle_button_labels({
			"attack": "攻击",
			"spirit": "精灵",
			"capture": "捕捉",
			"help": "帮助",
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
	if _battle_auto_capture_capacity_blocks_cycle(capture_settings):
		return false
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
	if not _controlled_pet_has_usable_skill():
		return _skip_controlled_pet_battle_command()
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
		return _skip_controlled_pet_battle_command()
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
	var inventory := BattleModel.capture_tool_inventory(battle_state)
	var preferred_tool_id := str(settings.get(AutoCaptureSettingsModel.PREFERRED_TOOL_ID_KEY, CaptureToolCatalog.EMPTY_HAND_ID))
	var tool_id := _battle_auto_capture_tool_for_target(preferred_tool_id, inventory, target_id)
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
	_submit_player_battle_command("capture", target_id, true)
	if _battle_auto_capture_enabled() and battle_command_owner == "pet":
		_battle_auto_submit_capture_pet_action(settings)
	return true


func _battle_auto_capture_capacity_blocks_cycle(settings: Dictionary) -> bool:
	if not bool(settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false)):
		return false
	if _battle_auto_capture_target_id(settings) == "":
		return false
	var capacity := _battle_capture_capacity_snapshot()
	if not bool(capacity.get("known", false)):
		_set_battle_message(BattleCaptureCapacityModel.SYNCING_TEXT)
		battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
		return true
	if bool(capacity.get("canCapture", false)):
		return false
	var has_hang_activity := _hang_activity_active() or bool(PlayerProgressModel.hang_session(player_profile).get(HangSettingsModel.SESSION_ENABLED_KEY, false))
	var full_message := "宠物栏和兽栏已满，自动挂机已停止，请清理位置后再继续。" if has_hang_activity else "宠物栏和兽栏已满，请先清理位置。"
	_set_battle_message(full_message)
	if has_hang_activity:
		_stop_hang_activity(full_message, false)
	battle_auto_attack_delay = BATTLE_AUTO_ATTACK_STEP_DELAY
	return true


func _battle_auto_capture_tool_for_target(preferred_tool_id: String, inventory: Dictionary, target_id: String) -> String:
	for tool_id in CaptureToolCatalog.fallback_tool_ids_for(preferred_tool_id, inventory, false):
		if _capture_tool_target_requirement_message(tool_id, target_id) == "":
			return tool_id
	return CaptureToolCatalog.EMPTY_HAND_ID


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
		return _skip_controlled_pet_battle_command()
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
		_submit_server_battle_player_command("run")
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
	if str(settings.get(AutoCaptureSettingsModel.TARGET_MODE_KEY, AutoCaptureSettingsModel.TARGET_ALL)) != AutoCaptureSettingsModel.TARGET_ALL:
		var target_form_id := str(settings.get(AutoCaptureSettingsModel.TARGET_FORM_ID_KEY, ""))
		var manual_text := AutoCaptureSettingsModel.clean_manual_text(str(settings.get(AutoCaptureSettingsModel.TARGET_MANUAL_TEXT_KEY, "")))
		if target_form_id == "" and manual_text == "":
			return false
		var identity_matches := target_form_id != "" and str(actor.get("formId", actor.get("templateId", ""))) == target_form_id
		if not identity_matches and manual_text != "":
			var needle := manual_text.to_lower()
			var form_id_for_identity := str(actor.get("formId", actor.get("templateId", ""))).strip_edges()
			var template := PetTemplateCatalog.runtime_template_for_form(form_id_for_identity)
			for public_text in [
				form_id_for_identity,
				str(actor.get("name", "")),
				str(template.get("formName", template.get("name", ""))),
				str(template.get("wildName", "")),
				str(template.get("lineId", "")),
				str(template.get("lineName", "")),
				str(template.get("subtypeName", "")),
			]:
				if str(public_text).to_lower().find(needle) >= 0:
					identity_matches = true
					break
		if not identity_matches:
			return false
	var form_id := str(actor.get("formId", actor.get("templateId", ""))).strip_edges()
	var captured_form_ids_value = player_profile.get("petCodexCapturedFormIds", [])
	var captured_form_ids: Array = captured_form_ids_value if captured_form_ids_value is Array else []
	var pending_same_form := 0
	var self_account_id := str(current_account_session.get("accountId", ""))
	var battle_actors_value = battle_state.get("actors", [])
	if battle_actors_value is Array:
		for candidate_value in battle_actors_value as Array:
			if not (candidate_value is Dictionary):
				continue
			var candidate := candidate_value as Dictionary
			if (
				bool(candidate.get("captured", false))
				and str(candidate.get("capturedByAccountId", "")) == self_account_id
				and str(candidate.get("formId", candidate.get("templateId", ""))) == form_id
			):
				pending_same_form += 1
	var owned_same_form := pending_same_form
	var instances_value = player_profile.get("petInstances", [])
	if instances_value is Array:
		for instance_value in instances_value as Array:
			if instance_value is Dictionary and str((instance_value as Dictionary).get("formId", "")) == form_id:
				owned_same_form += 1
	var local_filter := AutoCaptureFilterModel.local_preselection(
		actor,
		{
			"isNewCodexForm": not captured_form_ids.has(form_id) and pending_same_form <= 0,
			"ownedSameForm": owned_same_form,
		},
		settings.get(AutoCaptureSettingsModel.FILTER_POLICY_KEY, {}),
	)
	return bool(local_filter.get("eligible", true))


func _battle_auto_has_capture_space() -> bool:
	return bool(_battle_capture_capacity_snapshot().get("canCapture", false))


func _battle_capture_capacity_snapshot() -> Dictionary:
	var room := server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	var active_room_id := str(battle_state.get("serverRoomId", "")).strip_edges()
	var state_room := battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	if (
		_battle_is_server_authority()
		and not state_room.is_empty()
		and str(state_room.get("roomId", "")).strip_edges() == active_room_id
		and (room.is_empty() or str(room.get("roomId", "")).strip_edges() != active_room_id)
	):
		room = state_room
	return BattleCaptureCapacityModel.snapshot(
		player_profile,
		room,
		current_account_session,
		active_room_id,
		_battle_is_server_authority()
	)


func _battle_capture_capacity_blocks_action(show_message: bool = true) -> bool:
	var capacity := _battle_capture_capacity_snapshot()
	if bool(capacity.get("canCapture", false)):
		return false
	if show_message:
		_set_battle_message(str(capacity.get("blockedMessage", BattleCaptureCapacityModel.SYNCING_TEXT)))
		_sync_battle_buttons()
	return true


func _sync_battle_capture_capacity_label(capacity: Dictionary, has_capture_target: bool) -> void:
	if battle_capture_capacity_label == null:
		return
	battle_capture_capacity_label.visible = battle_active and (
		battle_command_owner == "capture"
		or (battle_command_owner == "player" and has_capture_target)
	)
	if not battle_capture_capacity_label.visible:
		return
	battle_capture_capacity_label.text = str(capacity.get("label", BattleCaptureCapacityModel.SYNCING_TEXT))
	var available := bool(capacity.get("known", false)) and bool(capacity.get("canCapture", false))
	battle_capture_capacity_label.add_theme_color_override(
		"font_color",
		Color("d8c78f") if available else Color("ffb26b")
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


func _controlled_pet_has_usable_skill() -> bool:
	for slot in range(1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS + 1):
		if not _controlled_pet_skill_action_for_slot(slot).is_empty():
			return true
	return false


func _skip_controlled_pet_battle_command() -> bool:
	var pet_actor := _controlled_pet_actor()
	var pet_name := str(pet_actor.get("name", "宠物")) if not pet_actor.is_empty() else "宠物"
	battle_pending_pet_command.clear()
	battle_pending_pet_skill_id = ""
	_set_battle_message("%s没有可用技能，本回合跳过。" % pet_name)
	if _battle_is_server_authority():
		_sync_server_battle_command_owner_from_room()
	else:
		_battle_start_pending_round()
	return true


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


func _available_capture_tool_ids_for_menu() -> Array[String]:
	var result: Array[String] = [BattleModel.CAPTURE_TOOL_EMPTY_HAND]
	for tool_id in CaptureToolCatalog.ordered_tool_ids():
		var normalized_tool_id := CaptureToolCatalog.normalized_tool_id(tool_id)
		if normalized_tool_id == BattleModel.CAPTURE_TOOL_EMPTY_HAND:
			continue
		if BattleModel.capture_tool_count(battle_state, normalized_tool_id) <= 0:
			continue
		if not result.has(normalized_tool_id):
			result.append(normalized_tool_id)
	return result


func _apply_capture_tool_button_labels() -> void:
	battle_capture_button_tool_ids.clear()
	var labels := {"help": "返回"}
	var tool_ids := _available_capture_tool_ids_for_menu()
	var slot_count := mini(BATTLE_CAPTURE_COMMAND_SLOTS.size(), tool_ids.size())
	for index in range(slot_count):
		var command_id := BATTLE_CAPTURE_COMMAND_SLOTS[index]
		var tool_id := tool_ids[index]
		battle_capture_button_tool_ids[command_id] = tool_id
		labels[command_id] = _capture_tool_button_label(tool_id)
	for command_id in BATTLE_CAPTURE_COMMAND_SLOTS:
		if not labels.has(command_id):
			labels[command_id] = ""
	_apply_battle_button_labels(labels)


func _battle_capture_command_ids() -> Array[String]:
	var result: Array[String] = []
	for command_id in BATTLE_CAPTURE_COMMAND_SLOTS:
		if battle_capture_button_tool_ids.has(command_id):
			result.append(command_id)
	if result.is_empty():
		result.append("attack")
	return result


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
			var ordered := _battle_capture_command_ids()
			ordered.append("help")
			return ordered
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
			var visible := _battle_capture_command_ids()
			visible.append("help")
			return visible
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
	for control in [battle_command_panel, battle_auto_stop_button, battle_passive_panel, battle_message_panel, action_bar, top_panel]:
		if control != null and control.visible:
			if Rect2(control.global_position, control.size).has_point(point):
				return true
	return false


func _run_auto_direct_line_check() -> void:
	await _auto_checks()._run_auto_direct_line_check()


func _run_auto_facing_check() -> void:
	await _auto_checks()._run_auto_facing_check()


func _run_auto_right_click_facing_check() -> void:
	await _auto_checks()._run_auto_right_click_facing_check()


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
	_sync_keyboard_movement_input_gate()
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
		var hud_start := _perf_now()
		_update_world_hud_if_needed(delta)
		_perf_add("hud_update", hud_start)
		var world_log_layout_start := _perf_now()
		_panel_flow()._flush_world_log_layout_if_needed(delta)
		_perf_add("world_log_layout", world_log_layout_start)
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
	_update_deferred_server_profile_pull(delta)
	_perf_add("timed_profile", section_start)
	section_start = _perf_now()
	_poll_server_event_stream(delta)
	_perf_add("server_event", section_start)
	section_start = _perf_now()
	_update_party_state_poll(delta)
	_perf_add("party_poll", section_start)
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
	_panel_flow()._flush_world_log_layout_if_needed(delta)
	_perf_add("world_log_layout", section_start)
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


func _reset_perf_probe_counters() -> void:
	if not perf_probe_enabled:
		return
	perf_probe_elapsed = 0.0
	perf_probe_frames = 0
	perf_probe_totals.clear()


func _request_profile_save(delay_seconds: float = 0.3) -> void:
	_mark_progress_ui_caches_dirty()
	if not profile_save_enabled or _is_server_account_session():
		return
	profile_save_pending = true
	profile_save_debounce_remaining = maxf(profile_save_debounce_remaining, delay_seconds)


func _save_player_profile_now() -> bool:
	_mark_progress_ui_caches_dirty()
	if _is_server_account_session():
		return false
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
			_handle_world_pointer_pressed(mouse_event.position, mouse_event.button_index == MOUSE_BUTTON_RIGHT)
	elif event is InputEventMouseMotion:
		var motion_event := event as InputEventMouseMotion
		if _is_ui_point(motion_event.position):
			return
		if battle_active:
			_update_battle_hover_at_screen_point(motion_event.position)
	elif event is InputEventScreenTouch:
		var touch_event := event as InputEventScreenTouch
		if touch_event.pressed:
			_handle_world_pointer_pressed(touch_event.position, false)


func _sync_keyboard_movement_input_gate() -> void:
	if player == null or not player.has_method("set_keyboard_movement_enabled"):
		return
	player.set_keyboard_movement_enabled(_game_keyboard_movement_allowed())


func _game_keyboard_movement_allowed() -> bool:
	if not account_authenticated and not auth_auto_bypass:
		return false
	if auth_panel != null and auth_panel.visible:
		return false
	return not _text_input_has_focus()


func _text_input_has_focus() -> bool:
	var focus_owner := get_viewport().gui_get_focus_owner()
	if focus_owner is Control and not (focus_owner as Control).is_visible_in_tree():
		return false
	return focus_owner is LineEdit or focus_owner is TextEdit


func _handle_world_pointer_pressed(screen_point: Vector2, context_only: bool = false, ui_checked: bool = false) -> void:
	if not ui_checked and _is_ui_point(screen_point):
		click_move_input_ui_reject_count += 1
		return
	if battle_active:
		if context_only:
			_inspect_battle_actor_at_screen_point(screen_point)
		else:
			_select_battle_target_at_screen_point(screen_point)
		return
	if context_only:
		_face_player_toward_screen_point(screen_point)
		return
	var remote_player := _online_remote_player_at_screen_point(screen_point, true)
	if not remote_player.is_empty():
		click_move_input_remote_hit_count += 1
		_open_player_action_panel(remote_player)
		return
	click_move_input_accept_count += 1
	_set_click_move_target(screen_point, true)


func _face_player_toward_screen_point(screen_point: Vector2) -> bool:
	if player == null:
		return false
	var target_world := _screen_to_world(screen_point)
	var remote_player := _online_remote_player_at_screen_point(screen_point, true)
	if not remote_player.is_empty() and not map_data.is_empty():
		var position := remote_player.get("position", {}) as Dictionary if remote_player.get("position", {}) is Dictionary else {}
		if str(position.get("mapId", "")) == current_map_id:
			var target_cell := Vector2i(int(position.get("cellX", 0)), int(position.get("cellY", 0)))
			if IsoMapModel.is_inside(map_data, target_cell):
				target_world = IsoMapModel.grid_to_world(map_data, target_cell)
	var direction := target_world - player.global_position
	if direction.length() <= 0.001:
		return false
	var previous_facing: String = player.get_facing_key() if player.has_method("get_facing_key") else ""
	player.face_direction(direction)
	var next_facing: String = player.get_facing_key() if player.has_method("get_facing_key") else ""
	if next_facing == "" or next_facing == previous_facing:
		return false
	_request_online_position_snapshot(_current_online_position_payload())
	queue_redraw()
	return true


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
	var normalized_profile := PlayerProgressModel.normalize_profile(player_profile)
	var available_quest := _first_available_unfinished_quest_for_marker(normalized_profile)
	var blocked_quest := _first_blocked_unfinished_quest_for_marker(normalized_profile)
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
		quest_marker_state_cache[item_id] = _compute_quest_marker_state_for_item(item, available_quest, blocked_quest, normalized_profile)
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
	_panel_flow()._build_hud()

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
	_panel_flow()._build_auth_panel()

func _build_account_panel() -> void:
	_panel_flow()._build_account_panel()

func _set_auth_mode(register_mode: bool) -> void:
	_panel_flow()._set_auth_mode(register_mode)

func _set_auth_server_mode(server_mode: bool, update_layout: bool = true) -> void:
	_panel_flow()._set_auth_server_mode(server_mode, update_layout)

func _on_auth_source_selected(_index: int) -> void:
	_panel_flow()._on_auth_source_selected(_index)

func _prefill_auth_last_username() -> void:
	_panel_flow()._prefill_auth_last_username()

func _open_auth_panel(update_layout: bool = true) -> void:
	_panel_flow()._open_auth_panel(update_layout)

func _close_auth_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_auth_panel(update_layout)

func _remember_auth_session(session: Dictionary) -> void:
	_panel_flow()._remember_auth_session(session)

func _on_auth_submit_pressed() -> void:
	_panel_flow()._on_auth_submit_pressed()

func _submit_server_auth_request(username: String, password: String) -> void:
	_panel_flow()._submit_server_auth_request(username, password)

func _on_auth_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_auth_http_request_completed(result, response_code, _headers, body)

func _packed_string_array(value) -> PackedStringArray:
	return _panel_flow()._packed_string_array(value)

func _is_server_account_session() -> bool:
	return _panel_flow()._is_server_account_session()

func _local_profile_mutation_blocked_for_server_only(action_label: String, emit_message: bool = true) -> bool:
	return _panel_flow()._local_profile_mutation_blocked_for_server_only(action_label, emit_message)

func _server_profile_base_url() -> String:
	return _panel_flow()._server_profile_base_url()

func _server_profile_token() -> String:
	return _panel_flow()._server_profile_token()

func _server_battle_should_poll_waiting_state() -> bool:
	return _panel_flow()._server_battle_should_poll_waiting_state()

func _update_server_battle_waiting_state_poll(delta: float) -> void:
	_panel_flow()._update_server_battle_waiting_state_poll(delta)

func _server_battle_should_poll_room_restore() -> bool:
	return _panel_flow()._server_battle_should_poll_room_restore()

func _update_server_battle_room_restore_poll(delta: float) -> void:
	_panel_flow()._update_server_battle_room_restore_poll(delta)

func _request_server_battle_room_restore_poll() -> void:
	await _panel_flow()._request_server_battle_room_restore_poll()

func _request_server_battle_waiting_state_poll() -> void:
	await _panel_flow()._request_server_battle_waiting_state_poll()

func _apply_polled_server_battle_room(room: Dictionary, expected_room_id: String = "") -> void:
	_panel_flow()._apply_polled_server_battle_room(room, expected_room_id)

func _request_server_battle_state_restore() -> void:
	await _panel_flow()._request_server_battle_state_restore()

func _start_server_event_stream_if_needed() -> void:
	_panel_flow()._start_server_event_stream_if_needed()

func _stop_server_event_stream() -> void:
	_panel_flow()._stop_server_event_stream()

func _poll_server_event_stream(delta: float) -> void:
	if bank_drag_preview:
		return
	_panel_flow()._poll_server_event_stream(delta)

func _handle_server_event(event: Dictionary) -> void:
	_panel_flow()._handle_server_event(event)

func _record_server_event_seen(event: Dictionary) -> void:
	_panel_flow()._record_server_event_seen(event)

func _server_event_type_seen(event_type: String) -> bool:
	return _panel_flow()._server_event_type_seen(event_type)

func _apply_chat_message_event(event: Dictionary) -> void:
	_panel_flow()._apply_chat_message_event(event)

func _chat_message_id_exists(message_id: String) -> bool:
	return _panel_flow()._chat_message_id_exists(message_id)

func _party_invite_is_for_current(invite: Dictionary) -> bool:
	return _panel_flow()._party_invite_is_for_current(invite)

func _battle_invite_is_for_current(invite: Dictionary) -> bool:
	return _panel_flow()._battle_invite_is_for_current(invite)

func _battle_invite_is_from_current(invite: Dictionary) -> bool:
	return _panel_flow()._battle_invite_is_from_current(invite)

func _latest_incoming_battle_invite() -> Dictionary:
	return _panel_flow()._latest_incoming_battle_invite()

func _apply_party_event(event: Dictionary) -> void:
	_panel_flow()._apply_party_event(event)

func _refresh_party_roster_hud(update_layout: bool = true) -> void:
	_panel_flow()._refresh_party_roster_hud(update_layout)

func _on_party_invite_popup_accept_pressed() -> void:
	_panel_flow()._on_party_invite_popup_accept_pressed()

func _on_party_invite_popup_decline_pressed() -> void:
	_panel_flow()._on_party_invite_popup_decline_pressed()

func _apply_battle_event(event: Dictionary) -> void:
	_panel_flow()._apply_battle_event(event)

func _apply_server_battle_room_state(room: Dictionary, force_start: bool = false) -> bool:
	return _panel_flow()._apply_server_battle_room_state(room, force_start)

func _apply_server_battle_room_closed(room: Dictionary) -> void:
	_panel_flow()._apply_server_battle_room_closed(room)

func _server_battle_closed_room_has_unplayed_turn(room: Dictionary) -> bool:
	return _panel_flow()._server_battle_closed_room_has_unplayed_turn(room)

func _server_battle_closed_room_from_state() -> Dictionary:
	return _panel_flow()._server_battle_closed_room_from_state()

func _finish_server_battle_from_closed_room(room: Dictionary = {}) -> Dictionary:
	return _panel_flow()._finish_server_battle_from_closed_room(room)

func _server_battle_room_missing_error(parsed: Dictionary) -> bool:
	return _panel_flow()._server_battle_room_missing_error(parsed)

func _clear_stale_server_battle_room(message: String = "切磋房间已失效，已回到地图。") -> void:
	_panel_flow()._clear_stale_server_battle_room(message)

func _server_battle_result_payload(room: Dictionary) -> Dictionary:
	return _panel_flow()._server_battle_result_payload(room)

func _server_battle_room_mode(room: Dictionary) -> String:
	return _panel_flow()._server_battle_room_mode(room)

func _server_battle_room_is_party_pve(room: Dictionary) -> bool:
	return _panel_flow()._server_battle_room_is_party_pve(room)

func _current_server_battle_is_party_pve() -> bool:
	return _panel_flow()._current_server_battle_is_party_pve()

func _start_server_battle_escape_preview_if_needed() -> void:
	_clear_battle_escape_preview()
	if not _battle_is_server_authority():
		return
	if not _current_server_battle_is_party_pve():
		return
	if not _current_player_is_party_member():
		return
	var self_account_id := str(current_account_session.get("accountId", "")).strip_edges()
	var actor_ids: Array[String] = []
	for value in battle_state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var actor_id := str(actor.get("id", "")).strip_edges()
		var actor_account_id := str(actor.get("serverAccountId", actor.get("accountId", ""))).strip_edges()
		if actor_id != "" and self_account_id != "" and actor_account_id == self_account_id:
			actor_ids.append(actor_id)
	if actor_ids.is_empty():
		var player_actor_id := BattleModel.player_actor_id(battle_state)
		if player_actor_id != "":
			actor_ids.append(player_actor_id)
		var pet_actor_id := BattleModel.controlled_pet_id(battle_state)
		if pet_actor_id != "":
			actor_ids.append(pet_actor_id)
	if actor_ids.is_empty():
		return
	battle_escape_preview_actor_ids = actor_ids
	battle_escape_preview_started_msec = Time.get_ticks_msec()
	queue_redraw()

func _clear_battle_escape_preview() -> void:
	battle_escape_preview_actor_ids.clear()
	battle_escape_preview_started_msec = 0

func _server_battle_stale_room_message() -> String:
	return _panel_flow()._server_battle_stale_room_message()

func _server_battle_result_key(room: Dictionary) -> String:
	return _panel_flow()._server_battle_result_key(room)

func _server_battle_result_loser_contains_self(result: Dictionary) -> bool:
	return _panel_flow()._server_battle_result_loser_contains_self(result)

func _server_battle_result_message(room: Dictionary) -> String:
	return _panel_flow()._server_battle_result_message(room)

func _server_party_pve_result_message(room: Dictionary) -> String:
	return _panel_flow()._server_party_pve_result_message(room)

func _server_party_pve_result_log_message(room: Dictionary, base_message: String) -> String:
	return _panel_flow()._server_party_pve_result_log_message(room, base_message)

func _server_battle_exp_log_lines_for_current_account(room: Dictionary) -> Array[String]:
	return _panel_flow()._server_battle_exp_log_lines_for_current_account(room)

func _server_battle_exp_log_line(role_name: String, entry: Dictionary, fallback_name: String, fallback_amount: int = -1) -> String:
	return _panel_flow()._server_battle_exp_log_line(role_name, entry, fallback_name, fallback_amount)

func _server_battle_profile_writeback_for_current_account(room: Dictionary) -> Dictionary:
	return _panel_flow()._server_battle_profile_writeback_for_current_account(room)

func _server_battle_profile_writeback_skips_for_current_account(room: Dictionary) -> Array[Dictionary]:
	return _panel_flow()._server_battle_profile_writeback_skips_for_current_account(room)

func _server_battle_writeback_warning_lines_for_current_account(room: Dictionary) -> Array[String]:
	return _panel_flow()._server_battle_writeback_warning_lines_for_current_account(room)

func _append_unique_message_lines(message: String, extra_lines: Array[String]) -> String:
	return _panel_flow()._append_unique_message_lines(message, extra_lines)

func _apply_server_battle_hang_writeback(room: Dictionary) -> Dictionary:
	return _panel_flow()._apply_server_battle_hang_writeback(room)

func _server_battle_exp_entry_name(entry: Dictionary, fallback: String) -> String:
	return _panel_flow()._server_battle_exp_entry_name(entry, fallback)

func _server_battle_reward_log_lines_for_current_account(room: Dictionary) -> Array[String]:
	return _panel_flow()._server_battle_reward_log_lines_for_current_account(room)

func _server_battle_item_amounts(value) -> Array[Dictionary]:
	return _panel_flow()._server_battle_item_amounts(value)

func _server_party_pve_has_living_enemy(room: Dictionary) -> bool:
	return _panel_flow()._server_party_pve_has_living_enemy(room)

func _open_battle_result_panel(room: Dictionary, result_key: String, message: String, title_prefix: String = "切磋", include_opponent: bool = true) -> void:
	_panel_flow()._open_battle_result_panel(room, result_key, message, title_prefix, include_opponent)

func _close_battle_result_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_battle_result_panel(update_layout)

func _battle_result_title(result_key: String, prefix: String = "切磋") -> String:
	return _panel_flow()._battle_result_title(result_key, prefix)

func _battle_result_opponent_text(room: Dictionary) -> String:
	return _panel_flow()._battle_result_opponent_text(room)

func _server_battle_return_for_self(room: Dictionary) -> Dictionary:
	return _panel_flow()._server_battle_return_for_self(room)

func _apply_server_battle_return(room: Dictionary) -> bool:
	return _panel_flow()._apply_server_battle_return(room)

func _server_battle_return_message(message: String) -> String:
	return _panel_flow()._server_battle_return_message(message)

func _sync_server_battle_room_scene(force_start: bool = false) -> bool:
	return _panel_flow()._sync_server_battle_room_scene(force_start)

func _battle_is_server_authority() -> bool:
	return _panel_flow()._battle_is_server_authority()

func _battle_invite_seen(invite_id: String) -> bool:
	return _panel_flow()._battle_invite_seen(invite_id)

func _battle_outgoing_invite_seen(invite_id: String) -> bool:
	return _panel_flow()._battle_outgoing_invite_seen(invite_id)

func _battle_room_ready(room_id: String = "") -> bool:
	return _panel_flow()._battle_room_ready(room_id)

func _battle_turn_resolved(room_id: String = "", round_number: int = 0) -> bool:
	return _panel_flow()._battle_turn_resolved(room_id, round_number)

func _server_battle_turn_key(event_list: Dictionary) -> String:
	return _panel_flow()._server_battle_turn_key(event_list)

func _server_battle_event_playback_active() -> bool:
	return _panel_flow()._server_battle_event_playback_active()

func _sync_server_battle_snapshot_fields_during_playback(room: Dictionary) -> void:
	_panel_flow()._sync_server_battle_snapshot_fields_during_playback(room)

func _play_server_battle_event_list(event_list: Dictionary) -> bool:
	return _panel_flow()._play_server_battle_event_list(event_list)

func _start_online_position_sync_if_needed() -> void:
	_panel_flow()._start_online_position_sync_if_needed()

func _stop_online_position_sync() -> void:
	_panel_flow()._stop_online_position_sync()

func _on_online_position_timer_timeout() -> void:
	_panel_flow()._on_online_position_timer_timeout()

func _request_online_position_snapshot(payload: Dictionary = {}) -> void:
	_panel_flow()._request_online_position_snapshot(payload)

func _current_online_map_payload() -> Dictionary:
	return _panel_flow()._current_online_map_payload()

func _current_online_position_payload() -> Dictionary:
	return _panel_flow()._current_online_position_payload()

func _on_online_position_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_online_position_http_request_completed(result, response_code, _headers, body)

func _apply_online_position_players(players) -> void:
	_panel_flow()._apply_online_position_players(players)

func _online_position_draw_signature(players: Array[Dictionary]) -> String:
	return _panel_flow()._online_position_draw_signature(players)

func _request_server_profile_pull() -> void:
	_panel_flow()._request_server_profile_pull()

func _queue_server_profile_pull() -> void:
	_panel_flow()._queue_server_profile_pull()

func _queue_server_profile_upload() -> void:
	_panel_flow()._queue_server_profile_upload()

func _start_server_profile_sync_request(kind: String, spec: Dictionary) -> void:
	_panel_flow()._start_server_profile_sync_request(kind, spec)

func _on_profile_sync_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_profile_sync_http_request_completed(result, response_code, _headers, body)

func _apply_server_profile_pull_result(parsed: Dictionary, allow_defer: bool = true) -> void:
	_panel_flow()._apply_server_profile_pull_result(parsed, allow_defer)

func _apply_server_profile_upload_result(parsed: Dictionary) -> void:
	_panel_flow()._apply_server_profile_upload_result(parsed)

func _continue_pending_server_profile_sync() -> void:
	_panel_flow()._continue_pending_server_profile_sync()

func _server_profile_pull_should_wait_for_profile_panel() -> bool:
	return _panel_flow()._server_profile_pull_should_wait_for_profile_panel()

func _defer_server_profile_pull_result(parsed: Dictionary) -> void:
	_panel_flow()._defer_server_profile_pull_result(parsed)

func _apply_deferred_server_profile_pull_if_idle() -> void:
	_panel_flow()._apply_deferred_server_profile_pull_if_idle()

func _update_deferred_server_profile_pull(delta: float) -> void:
	_panel_flow()._update_deferred_server_profile_pull(delta)

func _apply_server_profile_summary(summary: Dictionary) -> void:
	_panel_flow()._apply_server_profile_summary(summary)

func _apply_server_profile_payload(parsed: Dictionary) -> bool:
	return _panel_flow()._apply_server_profile_payload(parsed)

func _apply_auth_profile_metadata_fields(display_name: String) -> void:
	_panel_flow()._apply_auth_profile_metadata_fields(display_name)

func _apply_authenticated_session(session: Dictionary, migrate_legacy: bool = false) -> void:
	_panel_flow()._apply_authenticated_session(session, migrate_legacy)

func _apply_auth_profile_metadata(display_name: String) -> void:
	_panel_flow()._apply_auth_profile_metadata(display_name)

func _can_use_gm_tools() -> bool:
	return _panel_flow()._can_use_gm_tools()

func _refresh_gm_visibility() -> void:
	_panel_flow()._refresh_gm_visibility()

func _open_account_panel() -> void:
	_panel_flow()._open_account_panel()

func _close_account_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_account_panel(update_layout)

func _refresh_account_panel() -> void:
	_panel_flow()._refresh_account_panel()

func _switch_account_to_login() -> void:
	_panel_flow()._switch_account_to_login()

func _logout_to_record_point() -> void:
	await _panel_flow()._logout_to_record_point()

func _logout_in_place() -> void:
	_panel_flow()._logout_in_place()

func _handle_server_session_expired(message: String = "") -> void:
	_panel_flow()._handle_server_session_expired(message)

func _add_battle_buttons(specs: Array) -> void:
	_panel_flow()._add_battle_buttons(specs)

func _update_battle_debug_window(_force: bool = false) -> void:
	_panel_flow()._update_battle_debug_window(_force)

func _battle_trace_enabled() -> bool:
	return _panel_flow()._battle_trace_enabled()

func _reset_battle_trace_file() -> void:
	_panel_flow()._reset_battle_trace_file()

func _append_battle_trace(entry: Dictionary) -> void:
	_panel_flow()._append_battle_trace(entry)

func _battle_trace_actor_snapshots() -> Array[Dictionary]:
	return _panel_flow()._battle_trace_actor_snapshots()

func _battle_trace_actor_snapshot(actor: Dictionary) -> Dictionary:
	return _panel_flow()._battle_trace_actor_snapshot(actor)

func _build_cjk_system_font() -> SystemFont:
	return _panel_flow()._build_cjk_system_font()

func _canvas_text_font() -> Font:
	return _panel_flow()._canvas_text_font()

func _build_theme() -> Theme:
	return _panel_flow()._build_theme()

func _register_hud_panels() -> void:
	_panel_flow()._register_hud_panels()

func _panel_container(node_name: String) -> PanelContainer:
	return _panel_flow()._panel_container(node_name)

func _hide_control(control: Control, update_layout: bool = true) -> bool:
	return _panel_flow()._hide_control(control, update_layout)

func _panel_style() -> StyleBoxFlat:
	return _panel_flow()._panel_style()

func _pet_rename_panel_style() -> StyleBoxFlat:
	return _panel_flow()._pet_rename_panel_style()

func _battle_command_panel_style() -> StyleBoxFlat:
	return _panel_flow()._battle_command_panel_style()

func _battle_passive_panel_style() -> StyleBoxFlat:
	return _panel_flow()._battle_passive_panel_style()

func _battle_indicator_panel_style() -> StyleBoxFlat:
	return _panel_flow()._battle_indicator_panel_style()

func _battle_command_button_style(color: Color) -> StyleBoxFlat:
	return _panel_flow()._battle_command_button_style(color)

func _button_style(color: Color) -> StyleBoxFlat:
	return _panel_flow()._button_style(color)

func _set_click_move_target(screen_point: Vector2, ui_checked: bool = false) -> void:
	_panel_flow()._set_click_move_target(screen_point, ui_checked)

func _should_defer_click_screen_point() -> bool:
	return _panel_flow()._should_defer_click_screen_point()

func _queue_click_screen_point(screen_point: Vector2) -> void:
	_panel_flow()._queue_click_screen_point(screen_point)

func _resolve_pending_click_screen_point() -> void:
	_panel_flow()._resolve_pending_click_screen_point()

func _resolve_click_screen_point(screen_point: Vector2) -> void:
	_panel_flow()._resolve_click_screen_point(screen_point)

func _request_click_move_target(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> void:
	_panel_flow()._request_click_move_target(goal_cell, marker_point, marker_cell)

func _update_pending_click_move(delta: float) -> void:
	_panel_flow()._update_pending_click_move(delta)

func _apply_pending_click_move_target() -> void:
	_panel_flow()._apply_pending_click_move_target()

func _click_move_target_matches_current(goal_cell: Vector2i, marker_cell: Vector2i) -> bool:
	return _panel_flow()._click_move_target_matches_current(goal_cell, marker_cell)

func _clear_pending_click_move_target(reset_cooldown: bool = true) -> void:
	_panel_flow()._clear_pending_click_move_target(reset_cooldown)

func _set_click_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	return _panel_flow()._set_click_move_target_cell(goal_cell, marker_point, marker_cell)

func _should_use_server_step_movement(include_hang: bool = false) -> bool:
	return _panel_flow()._should_use_server_step_movement(include_hang)

func _set_server_step_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	return _panel_flow()._set_server_step_move_target_cell(goal_cell, marker_point, marker_cell)

func _update_server_step_move() -> void:
	_panel_flow()._update_server_step_move()

func _request_next_server_step_move(plan_id: int) -> void:
	await _panel_flow()._request_next_server_step_move(plan_id)

func _seed_server_step_move_position(plan_id: int) -> bool:
	return await _panel_flow()._seed_server_step_move_position(plan_id)

func _handle_server_step_move_failure(parsed: Dictionary) -> void:
	_panel_flow()._handle_server_step_move_failure(parsed)

func _finish_server_step_move() -> void:
	_panel_flow()._finish_server_step_move()

func _publish_server_step_move_stop(plan_id: int) -> void:
	await _panel_flow()._publish_server_step_move_stop(plan_id)

func _cancel_server_step_move(invalidate_plan: bool = true) -> void:
	_panel_flow()._cancel_server_step_move(invalidate_plan)

func _server_step_move_current_cell() -> Vector2i:
	return _panel_flow()._server_step_move_current_cell()

func _server_step_move_should_report_authority_cell() -> bool:
	return _panel_flow()._server_step_move_should_report_authority_cell()

func _apply_server_step_move_authority_position(position: Dictionary, snap_player_to_authority: bool = false, allow_map_change: bool = false) -> bool:
	return _panel_flow()._apply_server_step_move_authority_position(position, snap_player_to_authority, allow_map_change)

func _snap_player_to_server_step_authority() -> void:
	_panel_flow()._snap_player_to_server_step_authority()

func _set_party_follow_move_target(authority_cell: Vector2i) -> void:
	_panel_flow()._set_party_follow_move_target(authority_cell)

func _server_step_move_failure_message(code: String, parsed: Dictionary) -> String:
	return _panel_flow()._server_step_move_failure_message(code, parsed)

func _rebuild_server_step_move_path_from_authority() -> bool:
	return _panel_flow()._rebuild_server_step_move_path_from_authority()

func _sync_server_step_current_path_cells() -> void:
	_panel_flow()._sync_server_step_current_path_cells()

func _facing_for_grid_step(from_cell: Vector2i, to_cell: Vector2i) -> String:
	return _panel_flow()._facing_for_grid_step(from_cell, to_cell)

func _set_move_target_cell(goal_cell: Vector2i, marker_point: Vector2, marker_cell: Vector2i) -> bool:
	return _panel_flow()._set_move_target_cell(goal_cell, marker_point, marker_cell)

func _set_interaction_target(item: Dictionary) -> void:
	_panel_flow()._set_interaction_target(item)

func _clear_pending_interaction() -> void:
	_panel_flow()._clear_pending_interaction()

func _update_pending_interaction() -> void:
	_panel_flow()._update_pending_interaction()

func _complete_interaction(item: Dictionary) -> void:
	_panel_flow()._complete_interaction(item)

func _transfer_from_warp(item: Dictionary) -> void:
	_panel_flow()._transfer_from_warp(item)

func _start_guardian_battle_from_dialog() -> void:
	_panel_flow()._start_guardian_battle_from_dialog()

func _guardian_battle_route_for_current_session() -> String:
	return _panel_flow()._guardian_battle_route_for_current_session()

func _guardian_zone_for_interaction(item: Dictionary) -> Dictionary:
	return _panel_flow()._guardian_zone_for_interaction(item)

func _update_encounter_zone_check() -> void:
	_panel_flow()._update_encounter_zone_check()

func _trigger_encounter(zone: Dictionary) -> void:
	_panel_flow()._trigger_encounter(zone)

func _should_start_server_party_encounter() -> bool:
	return _panel_flow()._should_start_server_party_encounter()

func _can_start_local_encounter_model() -> bool:
	return _panel_flow()._can_start_local_encounter_model()

func _server_encounter_block_message() -> String:
	return _panel_flow()._server_encounter_block_message()

func _start_server_party_encounter(zone: Dictionary, pending_message: String = "遭遇野生宠物，正在同步。", success_message: String = "", failure_message: String = "遇敌同步失败，请重试。", encounter_permit_token: String = "") -> void:
	await _panel_flow()._start_server_party_encounter(zone, pending_message, success_message, failure_message, encounter_permit_token)

func _encounter_enemy_count_fallback() -> int:
	return _panel_flow()._encounter_enemy_count_fallback()

func _battle_state_for_encounter_zone(zone: Dictionary) -> Dictionary:
	return _panel_flow()._battle_state_for_encounter_zone(zone)

func _update_encounter_grace(delta: float) -> void:
	_panel_flow()._update_encounter_grace(delta)

func _begin_post_battle_encounter_grace() -> void:
	_panel_flow()._begin_post_battle_encounter_grace()

func _retreat_from_encounter() -> void:
	_panel_flow()._retreat_from_encounter()

func _close_encounter() -> void:
	_panel_flow()._close_encounter()

func _start_battle_from_encounter() -> void:
	_panel_flow()._start_battle_from_encounter()

func _refresh_battle_target_seed() -> void:
	_panel_flow()._refresh_battle_target_seed()

func _start_battle(next_battle_state: Dictionary) -> void:
	_panel_flow()._start_battle(next_battle_state)

func _end_battle(_restore_world: bool = true) -> void:
	_panel_flow()._end_battle(_restore_world)

func _finish_battle_and_return_to_world(result_override: String = "") -> Dictionary:
	return _panel_flow()._finish_battle_and_return_to_world(result_override)

func _server_account_local_battle_writeback_blocked() -> bool:
	return _panel_flow()._server_account_local_battle_writeback_blocked()

func _finish_local_battle_without_profile_writeback_for_server_account() -> Dictionary:
	return _panel_flow()._finish_local_battle_without_profile_writeback_for_server_account()

func _captured_pet_count_from_battle_result(result: Dictionary) -> int:
	return _panel_flow()._captured_pet_count_from_battle_result(result)

func _route_to_hang_healer() -> void:
	_panel_flow()._route_to_hang_healer()

func _return_player_to_record_point_after_knockaway(log_lines: Array[String]) -> void:
	_panel_flow()._return_player_to_record_point_after_knockaway(log_lines)

func _return_player_to_record_point() -> Dictionary:
	return _panel_flow()._return_player_to_record_point()

func _battle_player_actor_from_state(state: Dictionary) -> Dictionary:
	return _panel_flow()._battle_player_actor_from_state(state)

func _battle_player_hp_from_state(state: Dictionary) -> int:
	return _panel_flow()._battle_player_hp_from_state(state)

func _battle_player_max_hp_from_state(state: Dictionary) -> int:
	return _panel_flow()._battle_player_max_hp_from_state(state)

func _update_battle_player_zero_hp_seen() -> void:
	_panel_flow()._update_battle_player_zero_hp_seen()

func _hang_activity_active() -> bool:
	return _panel_flow()._hang_activity_active()

func _hang_stop_message_for_battle_result(ended_state: Dictionary) -> String:
	return _panel_flow()._hang_stop_message_for_battle_result(ended_state)

func _sync_profile_capture_tools_from_battle_state(save_after: bool = true) -> void:
	_panel_flow()._sync_profile_capture_tools_from_battle_state(save_after)

func _sync_profile_battle_items_from_battle_state(save_after: bool = true) -> void:
	_panel_flow()._sync_profile_battle_items_from_battle_state(save_after)

func _quest_messages_for_battle_result(ended_state: Dictionary, result: Dictionary) -> Array[String]:
	return _panel_flow()._quest_messages_for_battle_result(ended_state, result)

func _record_quest_event_and_maybe_claim(event: Dictionary) -> Array[String]:
	return _panel_flow()._record_quest_event_and_maybe_claim(event)

func _queue_server_quest_record_event(event: Dictionary, quest_id: String = "") -> void:
	_panel_flow()._queue_server_quest_record_event(event, quest_id)

func _process_server_quest_record_event_queue() -> void:
	await _panel_flow()._process_server_quest_record_event_queue()

func _set_world_log_message(text: String) -> void:
	_panel_flow()._set_world_log_message(text)

func _show_exp_pill_starter_notice_if_needed() -> void:
	_panel_flow()._show_exp_pill_starter_notice_if_needed()

func _save_profile_after_exp_pill_starter_update() -> void:
	_panel_flow()._save_profile_after_exp_pill_starter_update()

func _toggle_battle_message_expanded() -> void:
	_panel_flow()._toggle_battle_message_expanded()

func _clear_world_log_panel() -> void:
	_panel_flow()._clear_world_log_panel()

func _refresh_battle_message_controls() -> void:
	_panel_flow()._refresh_battle_message_controls()

func _open_backpack_panel() -> void:
	_panel_flow()._open_backpack_panel()

func _close_backpack_panel() -> void:
	_panel_flow()._close_backpack_panel()

func _open_equipment_panel() -> void:
	_panel_flow()._open_equipment_panel()

func _close_equipment_panel() -> void:
	_panel_flow()._close_equipment_panel()

func _open_equipment_synthesis_panel() -> void:
	_panel_flow()._open_equipment_synthesis_panel()

func _close_equipment_synthesis_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_equipment_synthesis_panel(update_layout)

func _open_player_status_panel() -> void:
	_panel_flow()._open_player_status_panel()

func _close_player_status_panel() -> void:
	_panel_flow()._close_player_status_panel()

func _open_player_rebirth_preview_panel() -> void:
	_panel_flow()._open_player_rebirth_preview_panel()

func _close_player_rebirth_preview_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_player_rebirth_preview_panel(update_layout)

func _on_player_status_equipment_pressed() -> void:
	_panel_flow()._on_player_status_equipment_pressed()

func _on_player_status_allocate_pressed(stat_key: String) -> void:
	await _panel_flow()._on_player_status_allocate_pressed(stat_key)

func _request_player_status_refresh() -> void:
	_panel_flow()._request_player_status_refresh()

func _flush_player_status_refresh() -> void:
	_panel_flow()._flush_player_status_refresh()

func _refresh_player_status_panel() -> void:
	_panel_flow()._refresh_player_status_panel()

func _refresh_player_rebirth_preview_panel() -> void:
	_panel_flow()._refresh_player_rebirth_preview_panel()

func _on_player_rebirth_execute_pressed() -> void:
	await _panel_flow()._on_player_rebirth_execute_pressed()

func _submit_server_player_rebirth() -> void:
	await _panel_flow()._submit_server_player_rebirth()

func _submit_server_quest_record(event: Dictionary, quest_id: String = "") -> Dictionary:
	return await _panel_flow()._submit_server_quest_record(event, quest_id)

func _submit_server_quest_claim(quest_id: String = "", reward_choice_id: String = "") -> Dictionary:
	return await _panel_flow()._submit_server_quest_claim(quest_id, reward_choice_id)

func _apply_server_quest_action_result(parsed: Dictionary, fallback_message: String) -> Dictionary:
	return _panel_flow()._apply_server_quest_action_result(parsed, fallback_message)

func _submit_server_profile_action(action: String, payload: Dictionary = {}, fallback_message: String = "档案操作失败。") -> Dictionary:
	return await _panel_flow()._submit_server_profile_action(action, payload, fallback_message)

func _player_status_stat_line(stat_key: String, base: Dictionary, bonus: Dictionary, current: Dictionary) -> String:
	return _panel_flow()._player_status_stat_line(stat_key, base, bonus, current)

func _player_status_bonus_line(bonus: Dictionary) -> String:
	return _panel_flow()._player_status_bonus_line(bonus)

func _equipment_spirit_sources_text(entry: Dictionary) -> String:
	return _panel_flow()._equipment_spirit_sources_text(entry)

func _equipment_spirit_sources_for_id(spirit_id: String) -> String:
	return _panel_flow()._equipment_spirit_sources_for_id(spirit_id)

func _equipment_spirit_label_with_source(spirit_id: String) -> String:
	return _panel_flow()._equipment_spirit_label_with_source(spirit_id)

func _refresh_equipment_panel() -> void:
	_panel_flow()._refresh_equipment_panel()

func _equipment_slot_button_item_text(slot_id: String, item_id: String) -> String:
	return _panel_flow()._equipment_slot_button_item_text(slot_id, item_id)

func _apply_equipment_slot_button_color(button: Button, slot_id: String, item_id: String) -> void:
	_panel_flow()._apply_equipment_slot_button_color(button, slot_id, item_id)

func _refresh_equipment_stats() -> void:
	_panel_flow()._refresh_equipment_stats()

func _equipment_stat_line_for(stat_key: String, base: Dictionary, bonus: Dictionary, current: Dictionary) -> String:
	return _panel_flow()._equipment_stat_line_for(stat_key, base, bonus, current)

func _equipment_slot_anchor_rect(slot_id: String) -> Rect2:
	return _panel_flow()._equipment_slot_anchor_rect(slot_id)

func _refresh_equipment_detail() -> void:
	_panel_flow()._refresh_equipment_detail()

func _equipment_slot_recommendation_lines(slot_id: String) -> Array[String]:
	return _panel_flow()._equipment_slot_recommendation_lines(slot_id)

func _equipment_recommendation_score(item_id: String) -> int:
	return _panel_flow()._equipment_recommendation_score(item_id)

func _equipment_plain_change_text_for(item_id: String) -> String:
	return _panel_flow()._equipment_plain_change_text_for(item_id)

func _equipment_current_spirit_source_lines(slot_id: String, item_id: String) -> Array[String]:
	return _panel_flow()._equipment_current_spirit_source_lines(slot_id, item_id)

func _equipment_exp_pill_charge_lines() -> Array[String]:
	return _panel_flow()._equipment_exp_pill_charge_lines()

func _equipment_slot_unequip_locked(slot_id: String) -> bool:
	return _panel_flow()._equipment_slot_unequip_locked(slot_id)

func _equipment_unequip_impact_lines(slot_id: String) -> Array[String]:
	return _panel_flow()._equipment_unequip_impact_lines(slot_id)

func _equipment_profile_without_slot(profile: Dictionary, slot_id: String) -> Dictionary:
	return _panel_flow()._equipment_profile_without_slot(profile, slot_id)

func _equipment_slot_is_broken(slot_id: String, item_id: String) -> bool:
	return _panel_flow()._equipment_slot_is_broken(slot_id, item_id)

func _equipment_slot_meets_requirements_for_ui(_slot_id: String, item_id: String) -> bool:
	return _panel_flow()._equipment_slot_meets_requirements_for_ui(_slot_id, item_id)

func _equipment_effect_summary_lines_for_ui(use_bbcode: bool = false, slots: Dictionary = {}, durability: Dictionary = {}) -> Array[String]:
	return _panel_flow()._equipment_effect_summary_lines_for_ui(use_bbcode, slots, durability)

func _rebirth_equipment_warning_lines_for_ui() -> Array[String]:
	return _panel_flow()._rebirth_equipment_warning_lines_for_ui()

func _select_equipment_slot(slot_id: String) -> void:
	_panel_flow()._select_equipment_slot(slot_id)

func _on_equipment_unequip_pressed() -> void:
	await _panel_flow()._on_equipment_unequip_pressed()

func _on_equipment_enhance_pressed() -> void:
	await _panel_flow()._on_equipment_enhance_pressed()

func _submit_server_equipment_enhance(slot_id: String) -> void:
	await _panel_flow()._submit_server_equipment_enhance(slot_id)

func _refresh_equipment_synthesis_panel() -> void:
	_panel_flow()._refresh_equipment_synthesis_panel()

func _select_equipment_synthesis_recipe(recipe_id: String) -> void:
	_panel_flow()._select_equipment_synthesis_recipe(recipe_id)

func _equipment_synthesis_detail_text(recipe: Dictionary) -> String:
	return _panel_flow()._equipment_synthesis_detail_text(recipe)

func _on_equipment_synthesis_pressed() -> void:
	await _panel_flow()._on_equipment_synthesis_pressed()

func _submit_server_equipment_synthesis(recipe_id: String) -> void:
	await _panel_flow()._submit_server_equipment_synthesis(recipe_id)

func _refresh_backpack_panel() -> void:
	_panel_flow()._refresh_backpack_panel()

func _backpack_filter_options() -> Array[Dictionary]:
	return _panel_flow()._backpack_filter_options()

func _backpack_filter_ids() -> Array[String]:
	return _panel_flow()._backpack_filter_ids()

func _backpack_filter_label_for(filter_id: String) -> String:
	return _panel_flow()._backpack_filter_label_for(filter_id)

func _refresh_backpack_filter_buttons() -> void:
	_panel_flow()._refresh_backpack_filter_buttons()

func _set_backpack_filter(filter_id: String) -> void:
	_panel_flow()._set_backpack_filter(filter_id)

func _backpack_button_texts() -> String:
	return _panel_flow()._backpack_button_texts()

func _backpack_unlocked_slot_count_for_ui() -> int:
	return _panel_flow()._backpack_unlocked_slot_count_for_ui()

func _backpack_locked_slot_cost(slot_index: int) -> int:
	return _panel_flow()._backpack_locked_slot_cost(slot_index)

func _backpack_locked_slot_label(slot_index: int) -> String:
	return _panel_flow()._backpack_locked_slot_label(slot_index)

func _backpack_locked_slot_detail_lines(slot_index: int) -> Array[String]:
	return _panel_flow()._backpack_locked_slot_detail_lines(slot_index)

func _backpack_slot_is_locked_index(slot_index: int) -> bool:
	return _panel_flow()._backpack_slot_is_locked_index(slot_index)

func _backpack_visible_slot_indices(slots: Array[Dictionary]) -> Array[int]:
	return _panel_flow()._backpack_visible_slot_indices(slots)

func _backpack_slot_matches_filter(slot: Dictionary) -> bool:
	return _panel_flow()._backpack_slot_matches_filter(slot)

func _backpack_grid_columns() -> int:
	return _panel_flow()._backpack_grid_columns()

func _select_backpack_slot(slot_index: int) -> void:
	_panel_flow()._select_backpack_slot(slot_index)

func _open_backpack_unlock_dialog(slot_index: int) -> void:
	_panel_flow()._open_backpack_unlock_dialog(slot_index)

func _unlock_backpack_slot_from_dialog() -> void:
	await _panel_flow()._unlock_backpack_slot_from_dialog()

func _refresh_quick_bar(force: bool = false) -> void:
	_panel_flow()._refresh_quick_bar(force)

func _profile_stone_coins_for_ui() -> int:
	return _panel_flow()._profile_stone_coins_for_ui()

func _profile_diamonds_for_ui() -> int:
	return _panel_flow()._profile_diamonds_for_ui()

func _profile_currency_amount_for_ui(currency: String) -> int:
	return _panel_flow()._profile_currency_amount_for_ui(currency)

func _backpack_slots_for_ui() -> Array[Dictionary]:
	return _panel_flow()._backpack_slots_for_ui()

func _backpack_item_count_for_ui(item_id: String) -> int:
	return _panel_flow()._backpack_item_count_for_ui(item_id)

func _backpack_counts_from_slots_for_ui(slots: Array[Dictionary]) -> Dictionary:
	return _panel_flow()._backpack_counts_from_slots_for_ui(slots)

func _backpack_counts_for_ui() -> Dictionary:
	return _panel_flow()._backpack_counts_for_ui()

func _backpack_available_capacity_for_ui(item_id: String, slots: Array[Dictionary] = []) -> int:
	return _panel_flow()._backpack_available_capacity_for_ui(item_id, slots)

func _player_level_for_ui() -> int:
	return _panel_flow()._player_level_for_ui()

func _player_rebirth_for_ui() -> int:
	return _panel_flow()._player_rebirth_for_ui()

func _equipment_slots_for_ui() -> Dictionary:
	return _panel_flow()._equipment_slots_for_ui()

func _equipment_durability_for_ui() -> Dictionary:
	return _panel_flow()._equipment_durability_for_ui()

func _equipment_enhancement_for_ui() -> Dictionary:
	return _panel_flow()._equipment_enhancement_for_ui()

func _equipment_enhance_level_for_ui(slot_id: String, item_id: String, enhancement: Dictionary) -> int:
	return _panel_flow()._equipment_enhance_level_for_ui(slot_id, item_id, enhancement)

func _equipment_slot_is_broken_for_ui(slot_id: String, item_id: String, durability: Dictionary) -> bool:
	return _panel_flow()._equipment_slot_is_broken_for_ui(slot_id, item_id, durability)

func _equipment_stat_bonus_for_ui(slots: Dictionary, durability: Dictionary, enhancement: Dictionary = {}) -> Dictionary:
	return _panel_flow()._equipment_stat_bonus_for_ui(slots, durability, enhancement)

func _equipment_spirit_ids_for_ui(slots: Dictionary, durability: Dictionary) -> Array[String]:
	return _panel_flow()._equipment_spirit_ids_for_ui(slots, durability)

func _equipment_spirit_source_entries_for_ui(slots: Dictionary, durability: Dictionary) -> Array[Dictionary]:
	return _panel_flow()._equipment_spirit_source_entries_for_ui(slots, durability)

func _equipment_change_preview_for_ui(item_id: String) -> Dictionary:
	return _panel_flow()._equipment_change_preview_for_ui(item_id)

func _equipment_repair_quote_for_ui() -> Dictionary:
	return _panel_flow()._equipment_repair_quote_for_ui()

func _can_equip_item_for_ui(item_id: String) -> Dictionary:
	return _panel_flow()._can_equip_item_for_ui(item_id)

func _equipment_compare_detail_lines(item_id: String) -> Array[String]:
	return _panel_flow()._equipment_compare_detail_lines(item_id)

func _equipment_detail_lines_with_requirement_status(item_id: String, use_bbcode: bool = false) -> Array[String]:
	return _panel_flow()._equipment_detail_lines_with_requirement_status(item_id, use_bbcode)

func _equipment_requirement_status_lines(item_id: String, use_bbcode: bool = false) -> Array[String]:
	return _panel_flow()._equipment_requirement_status_lines(item_id, use_bbcode)

func _colored_equipment_delta(text: String, delta: int) -> String:
	return _panel_flow()._colored_equipment_delta(text, delta)

func _bbcode_escape(text: String) -> String:
	return _panel_flow()._bbcode_escape(text)

func _selected_backpack_slot() -> Dictionary:
	return _panel_flow()._selected_backpack_slot()

func _selected_backpack_item_id() -> String:
	return _panel_flow()._selected_backpack_item_id()

func _backpack_slot_index_for_item(item_id: String) -> int:
	return _panel_flow()._backpack_slot_index_for_item(item_id)

func _on_backpack_use_pressed() -> void:
	_panel_flow()._on_backpack_use_pressed()

func _on_backpack_equip_pressed() -> void:
	_panel_flow()._on_backpack_equip_pressed()

func _equip_selected_backpack_item(item_id: String) -> void:
	await _panel_flow()._equip_selected_backpack_item(item_id)

func _submit_server_equipment_equip(item_id: String) -> void:
	await _panel_flow()._submit_server_equipment_equip(item_id)

func _request_server_equipment_equip(item_id: String, refresh_backpack_before: bool = true) -> Dictionary:
	return await _panel_flow()._request_server_equipment_equip(item_id, refresh_backpack_before)

func _apply_server_equipment_equip_result(parsed: Dictionary) -> Dictionary:
	return _panel_flow()._apply_server_equipment_equip_result(parsed)

func _use_backpack_player_exp_item(item_id: String) -> void:
	await _panel_flow()._use_backpack_player_exp_item(item_id)

func _use_backpack_encounter_stone(item_id: String) -> void:
	await _panel_flow()._use_backpack_encounter_stone(item_id)

func _activate_encounter_stone(item_id: String) -> void:
	_panel_flow()._activate_encounter_stone(item_id)

func _encounter_stone_active() -> bool:
	return _panel_flow()._encounter_stone_active()

func _clear_encounter_stone_effect(show_message: bool = false, sync_server: bool = true) -> void:
	_panel_flow()._clear_encounter_stone_effect(show_message, sync_server)

func _update_stationary_encounter_stone(delta: float) -> void:
	_panel_flow()._update_stationary_encounter_stone(delta)

func _clear_backpack_target_buttons() -> void:
	_panel_flow()._clear_backpack_target_buttons()

func _refresh_backpack_target_buttons(item_id: String) -> void:
	_panel_flow()._refresh_backpack_target_buttons(item_id)

func _use_backpack_item_on_pet(item_id: String, instance_id: String) -> void:
	await _panel_flow()._use_backpack_item_on_pet(item_id, instance_id)

func _use_world_pet_heal_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	return await _panel_flow()._use_world_pet_heal_item_and_log(item_id, instance_id)

func _use_world_pet_exp_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	return await _panel_flow()._use_world_pet_exp_item_and_log(item_id, instance_id)

func _use_world_mm_stone_item_and_log(item_id: String, instance_id: String) -> Dictionary:
	return await _panel_flow()._use_world_mm_stone_item_and_log(item_id, instance_id)

func _use_backpack_pet_egg_item(item_id: String) -> void:
	await _panel_flow()._use_backpack_pet_egg_item(item_id)

func _show_backpack_pet_heal_popup(instance_id: String, healed_amount: int) -> void:
	_panel_flow()._show_backpack_pet_heal_popup(instance_id, healed_amount)

func _backpack_target_button_for_pet(instance_id: String):
	_panel_flow()._backpack_target_button_for_pet(instance_id)

func _backpack_heal_popup_text_for_pet(instance_id: String) -> String:
	return _panel_flow()._backpack_heal_popup_text_for_pet(instance_id)

func _spawn_backpack_heal_popup(target: Control, healed_amount: int) -> void:
	_panel_flow()._spawn_backpack_heal_popup(target, healed_amount)

func _open_shop_panel(next_shop_id: String = "") -> void:
	_panel_flow()._open_shop_panel(next_shop_id)

func _close_shop_panel() -> void:
	_panel_flow()._close_shop_panel()

func _clear_shop_refresh_cache() -> void:
	_panel_flow()._clear_shop_refresh_cache()

func _shop_cached_backpack_slots_for_ui() -> Array[Dictionary]:
	return _panel_flow()._shop_cached_backpack_slots_for_ui()

func _shop_cached_backpack_counts_for_ui(slots: Array[Dictionary]) -> Dictionary:
	return _panel_flow()._shop_cached_backpack_counts_for_ui(slots)

func _shop_detail_text_cached(item_id: String, count: int) -> String:
	return _panel_flow()._shop_detail_text_cached(item_id, count)

func _shop_can_equip_item_cached(item_id: String) -> Dictionary:
	return _panel_flow()._shop_can_equip_item_cached(item_id)

func _shop_quantity_max_cached(item_id: String, slots: Array[Dictionary], counts: Dictionary) -> int:
	return _panel_flow()._shop_quantity_max_cached(item_id, slots, counts)

func _set_shop_mode(next_mode: String) -> void:
	_panel_flow()._set_shop_mode(next_mode)

func _apply_shop_detail_text(bbcode_enabled: bool, detail_text: String) -> void:
	_panel_flow()._apply_shop_detail_text(bbcode_enabled, detail_text)

func _queue_shop_detail_item(bbcode_enabled: bool, item_id: String, count: int) -> void:
	_panel_flow()._queue_shop_detail_item(bbcode_enabled, item_id, count)

func _apply_queued_shop_detail_item() -> void:
	_panel_flow()._apply_queued_shop_detail_item()

func _select_shop_item(item_id: String, defer_detail_update: bool = false) -> void:
	_panel_flow()._select_shop_item(item_id, defer_detail_update)

func _refresh_shop_panel(rebuild_list: bool = true, previous_selected_item_id: String = "", defer_detail_update: bool = false) -> void:
	_panel_flow()._refresh_shop_panel(rebuild_list, previous_selected_item_id, defer_detail_update)

func _shop_item_ids_for_mode(mode: String, counts: Dictionary = {}) -> Array[String]:
	return _panel_flow()._shop_item_ids_for_mode(mode, counts)

func _first_shop_item_id_for_mode(mode: String) -> String:
	return _panel_flow()._first_shop_item_id_for_mode(mode)

func _shop_item_button_text(item_id: String, count: int = -1) -> String:
	return _panel_flow()._shop_item_button_text(item_id, count)

func _shop_detail_text(item_id: String, count: int = -1) -> String:
	return _panel_flow()._shop_detail_text(item_id, count)

func _shop_quantity_max(item_id: String, slots: Array[Dictionary] = [], counts: Dictionary = {}) -> int:
	return _panel_flow()._shop_quantity_max(item_id, slots, counts)

func _clamped_shop_quantity(value: int, item_id: String, max_quantity: int = -1) -> int:
	return _panel_flow()._clamped_shop_quantity(value, item_id, max_quantity)

func _set_shop_quantity(value: int) -> void:
	_panel_flow()._set_shop_quantity(value)

func _refresh_shop_quantity_controls(max_quantity: int = -1) -> void:
	_panel_flow()._refresh_shop_quantity_controls(max_quantity)

func _refresh_shop_equip_after_buy_button(quantity_max: int = -1) -> void:
	_panel_flow()._refresh_shop_equip_after_buy_button(quantity_max)

func _on_shop_equip_after_buy_pressed() -> void:
	_panel_flow()._on_shop_equip_after_buy_pressed()

func _shop_action_text() -> String:
	return _panel_flow()._shop_action_text()

func _on_shop_action_pressed() -> void:
	await _panel_flow()._on_shop_action_pressed()

func _submit_server_shop_action() -> void:
	await _panel_flow()._submit_server_shop_action()

func _pull_server_profile_after_authoritative_shop_action() -> Dictionary:
	return await _panel_flow()._pull_server_profile_after_authoritative_shop_action()

func _refresh_shop_after_action(previous_mode: String, previous_item_id: String) -> void:
	_panel_flow()._refresh_shop_after_action(previous_mode, previous_item_id)

func _on_shop_repair_pressed() -> void:
	await _panel_flow()._on_shop_repair_pressed()

func _submit_server_equipment_repair_all() -> void:
	await _panel_flow()._submit_server_equipment_repair_all()

func _create_pet_skill_panel() -> void:
	_panel_flow()._create_pet_skill_panel()

func _create_pet_cultivation_panel() -> void:
	_panel_flow()._create_pet_cultivation_panel()

func _open_pet_panel(stable_access_override: bool = false) -> void:
	_panel_flow()._open_pet_panel(stable_access_override)

func _close_pet_panel() -> void:
	_panel_flow()._close_pet_panel()

func _pet_panel_has_stable_access() -> bool:
	return _panel_flow()._pet_panel_has_stable_access()

func _open_pet_skill_panel(training_mode: bool = false, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> void:
	_panel_flow()._open_pet_skill_panel(training_mode, trainer_id)

func _close_pet_skill_panel() -> void:
	_panel_flow()._close_pet_skill_panel()

func _refresh_pet_skill_panel() -> void:
	_panel_flow()._refresh_pet_skill_panel()

func _sync_pet_skill_pet_option(instances: Array[Dictionary]) -> void:
	_panel_flow()._sync_pet_skill_pet_option(instances)

func _refresh_pet_skill_slots(selected: Dictionary) -> void:
	_panel_flow()._refresh_pet_skill_slots(selected)

func _refresh_pet_skill_detail(selected: Dictionary) -> void:
	_panel_flow()._refresh_pet_skill_detail(selected)

func _sync_pet_skill_move_buttons(_selected: Dictionary, _skill_id: String) -> void:
	_panel_flow()._sync_pet_skill_move_buttons(_selected, _skill_id)

func _refresh_pet_skill_learn_controls(selected: Dictionary) -> void:
	_panel_flow()._refresh_pet_skill_learn_controls(selected)

func _pet_skill_has_empty_slot(instance: Dictionary) -> bool:
	return _panel_flow()._pet_skill_has_empty_slot(instance)

func _on_pet_skill_pet_selected(index: int) -> void:
	_panel_flow()._on_pet_skill_pet_selected(index)

func _select_pet_skill_slot(slot: int) -> void:
	_panel_flow()._select_pet_skill_slot(slot)

func _on_pet_skill_move_pressed(direction: int) -> void:
	await _panel_flow()._on_pet_skill_move_pressed(direction)

func _on_pet_skill_learn_pressed() -> void:
	_panel_flow()._on_pet_skill_learn_pressed()

func _pet_skill_id_for_selected_slot(instance: Dictionary) -> String:
	return _panel_flow()._pet_skill_id_for_selected_slot(instance)

func _apply_pet_skill_to_selected_slot(skill_id: String) -> void:
	await _panel_flow()._apply_pet_skill_to_selected_slot(skill_id)

func _open_pet_skill_overwrite_dialog(skill_id: String) -> void:
	_panel_flow()._open_pet_skill_overwrite_dialog(skill_id)

func _apply_pet_skill_overwrite_from_dialog() -> void:
	_panel_flow()._apply_pet_skill_overwrite_from_dialog()

func _on_pet_skill_forget_pressed() -> void:
	await _panel_flow()._on_pet_skill_forget_pressed()

func _open_codex_panel() -> void:
	_panel_flow()._open_codex_panel()

func _close_codex_panel() -> void:
	_panel_flow()._close_codex_panel()

func _open_quest_panel() -> void:
	_panel_flow()._open_quest_panel()

func _close_quest_panel() -> void:
	_panel_flow()._close_quest_panel()

func _open_map_panel() -> void:
	_panel_flow()._open_map_panel()

func _close_map_panel() -> void:
	_panel_flow()._close_map_panel()

func _open_chat_panel() -> void:
	_panel_flow()._open_chat_panel()

func _close_chat_panel() -> void:
	_panel_flow()._close_chat_panel()

func _chat_channel_button(label: String, channel: String) -> Button:
	return _panel_flow()._chat_channel_button(label, channel)

func _chat_channel_is_valid(channel: String) -> bool:
	return _panel_flow()._chat_channel_is_valid(channel)

func _set_chat_channel(channel: String) -> void:
	_panel_flow()._set_chat_channel(channel)

func _append_chat_message(channel: String, text: String, author: String = "") -> void:
	_panel_flow()._append_chat_message(channel, text, author)

func _refresh_chat_panel() -> void:
	_panel_flow()._refresh_chat_panel()

func _on_chat_send_pressed() -> void:
	_panel_flow()._on_chat_send_pressed()

func _request_chat_messages() -> void:
	_panel_flow()._request_chat_messages()

func _start_chat_request(kind: String, spec: Dictionary) -> void:
	_panel_flow()._start_chat_request(kind, spec)

func _on_chat_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_chat_http_request_completed(result, response_code, _headers, body)

func _replace_chat_channel_messages(channel: String, server_messages) -> void:
	_panel_flow()._replace_chat_channel_messages(channel, server_messages)

func _chat_message_from_server(message: Dictionary, channel: String) -> Dictionary:
	return _panel_flow()._chat_message_from_server(message, channel)

func _open_party_panel(mode: String = "partners") -> void:
	_panel_flow()._open_party_panel(mode)

func _close_party_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_party_panel(update_layout)

func _open_family_panel() -> void:
	_panel_flow()._open_family_panel()

func _open_family_panel_for_manor(manor_id: String) -> void:
	_panel_flow()._open_family_panel_for_manor(manor_id)

func _close_family_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_family_panel(update_layout)

func _refresh_party_panel() -> void:
	_panel_flow()._refresh_party_panel()

func _clear_container_children(container: Container) -> void:
	_panel_flow()._clear_container_children(container)

func _party_info_label(text: String) -> Label:
	return _panel_flow()._party_info_label(text)

func _party_player_text(player: Dictionary) -> String:
	return _panel_flow()._party_player_text(player)

func _current_party_members() -> Array[Dictionary]:
	return _panel_flow()._current_party_members()

func _current_account_id_for_party() -> String:
	return _panel_flow()._current_account_id_for_party()

func _party_member_is_current_player(member: Dictionary) -> bool:
	return _panel_flow()._party_member_is_current_player(member)

func _current_party_other_members_for_battle() -> Array[Dictionary]:
	return _panel_flow()._current_party_other_members_for_battle()

func _training_partner_raw_count() -> int:
	return _panel_flow()._training_partner_raw_count()

func _training_partner_available_slots() -> int:
	return _panel_flow()._training_partner_available_slots()

func _effective_training_partner_count() -> int:
	return _panel_flow()._effective_training_partner_count()

func _effective_battle_team_character_count() -> int:
	return _panel_flow()._effective_battle_team_character_count()

func _profile_with_effective_training_partners(limit: int) -> Dictionary:
	return _panel_flow()._profile_with_effective_training_partners(limit)

func _local_battle_state_with_current_team(base_state: Dictionary) -> Dictionary:
	return _panel_flow()._local_battle_state_with_current_team(base_state)

func _battle_state_with_actor(state: Dictionary, actor: Dictionary) -> Dictionary:
	return _panel_flow()._battle_state_with_actor(state, actor)

func _party_member_team_snapshot(member: Dictionary) -> Dictionary:
	return _panel_flow()._party_member_team_snapshot(member)

func _party_member_battle_player_actor(member: Dictionary, index: int, slot_number: int) -> Dictionary:
	return _panel_flow()._party_member_battle_player_actor(member, index, slot_number)

func _party_member_active_battle_pet(member: Dictionary) -> Dictionary:
	return _panel_flow()._party_member_active_battle_pet(member)

func _party_member_battle_pet_actor(member: Dictionary, index: int, slot_number: int) -> Dictionary:
	return _panel_flow()._party_member_battle_pet_actor(member, index, slot_number)

func _string_array_values(value) -> Array[String]:
	return _panel_flow()._string_array_values(value)

func _battle_record_summary_text(summary: Dictionary) -> String:
	return _panel_flow()._battle_record_summary_text(summary)

func _current_party_role() -> String:
	return _panel_flow()._current_party_role()

func _current_player_is_party_member() -> bool:
	return _panel_flow()._current_player_is_party_member()

func _stop_party_member_local_movement(show_message: bool = false) -> void:
	_panel_flow()._stop_party_member_local_movement(show_message)

func _should_apply_online_self_position(position: Dictionary) -> bool:
	return _panel_flow()._should_apply_online_self_position(position)

func _party_online_player_text(player: Dictionary) -> String:
	return _panel_flow()._party_online_player_text(player)

func _party_can_invite() -> bool:
	return _panel_flow()._party_can_invite()

func _refresh_party_request_controls() -> void:
	_panel_flow()._refresh_party_request_controls()

func _request_party_state() -> void:
	_panel_flow()._request_party_state()

func _update_party_state_poll(delta: float) -> void:
	_panel_flow()._update_party_state_poll(delta)

func _request_party_online() -> void:
	_panel_flow()._request_party_online()

func _on_party_invite_pressed(username: String) -> void:
	_panel_flow()._on_party_invite_pressed(username)

func _on_party_accept_pressed(invite_id: String) -> void:
	_panel_flow()._on_party_accept_pressed(invite_id)

func _on_party_decline_pressed(invite_id: String) -> void:
	_panel_flow()._on_party_decline_pressed(invite_id)

func _on_party_leave_pressed() -> void:
	_panel_flow()._on_party_leave_pressed()

func _start_party_request(kind: String, spec: Dictionary) -> void:
	_panel_flow()._start_party_request(kind, spec)

func _on_party_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_party_http_request_completed(result, response_code, _headers, body)

func _open_player_action_panel(target: Dictionary) -> void:
	_panel_flow()._open_player_action_panel(target)

func _close_player_action_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_player_action_panel(update_layout)

func _refresh_player_action_panel() -> void:
	_panel_flow()._refresh_player_action_panel()

func _on_player_action_battle_pressed() -> void:
	_panel_flow()._on_player_action_battle_pressed()

func _on_player_action_record_pressed() -> void:
	_panel_flow()._on_player_action_record_pressed()

func _on_player_action_party_apply_pressed() -> void:
	_panel_flow()._on_player_action_party_apply_pressed()

func _on_player_action_party_invite_pressed() -> void:
	_panel_flow()._on_player_action_party_invite_pressed()

func _start_player_action_request(kind: String, spec: Dictionary) -> void:
	_panel_flow()._start_player_action_request(kind, spec)

func _on_player_action_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_player_action_http_request_completed(result, response_code, _headers, body)

func _open_battle_invite_panel(invite: Dictionary) -> void:
	_panel_flow()._open_battle_invite_panel(invite)

func _close_battle_invite_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_battle_invite_panel(update_layout)

func _refresh_battle_invite_panel() -> void:
	_panel_flow()._refresh_battle_invite_panel()

func _on_battle_invite_accept_pressed() -> void:
	_panel_flow()._on_battle_invite_accept_pressed()

func _on_battle_invite_decline_pressed() -> void:
	_panel_flow()._on_battle_invite_decline_pressed()

func _start_battle_invite_request(kind: String, spec: Dictionary) -> void:
	_panel_flow()._start_battle_invite_request(kind, spec)

func _on_battle_invite_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_battle_invite_http_request_completed(result, response_code, _headers, body)

func _party_panel_layout_is_usable() -> bool:
	return _panel_flow()._party_panel_layout_is_usable()

func _open_mailbox_panel() -> void:
	_panel_flow()._open_mailbox_panel()

func _open_market_panel() -> void:
	_panel_flow()._open_market_panel()

func _close_market_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_market_panel(update_layout)

func _refresh_market_panel() -> void:
	_panel_flow()._refresh_market_panel()

func _on_market_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_market_http_request_completed(result, response_code, _headers, body)

func _open_bank_panel() -> void:
	_panel_flow()._open_bank_panel()

func _close_bank_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_bank_panel(update_layout)

func _refresh_bank_panel() -> void:
	_panel_flow()._refresh_bank_panel()

func _on_bank_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_bank_http_request_completed(result, response_code, _headers, body)

func _close_mailbox_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_mailbox_panel(update_layout)

func _refresh_mailbox_panel() -> void:
	_panel_flow()._refresh_mailbox_panel()

func _set_mailbox_tab(tab_id: String) -> void:
	_panel_flow()._set_mailbox_tab(tab_id)

func _select_mailbox_message(mail_id: String, source: String = "local") -> void:
	_panel_flow()._select_mailbox_message(mail_id, source)

func _on_mailbox_claim_pressed() -> void:
	_panel_flow()._on_mailbox_claim_pressed()

func _refresh_mailbox_menu_button() -> void:
	_panel_flow()._refresh_mailbox_menu_button()

func _mailbox_combined_entries() -> Array[Dictionary]:
	return _panel_flow()._mailbox_combined_entries()

func _mailbox_entry_by_key(key: String) -> Dictionary:
	return _panel_flow()._mailbox_entry_by_key(key)

func _mailbox_entry_button_text(entry: Dictionary) -> String:
	return _panel_flow()._mailbox_entry_button_text(entry)

func _server_mailbox_detail_text(message: Dictionary) -> String:
	return _panel_flow()._server_mailbox_detail_text(message)

func _server_mailbox_message_by_key(key: String) -> Dictionary:
	return _panel_flow()._server_mailbox_message_by_key(key)

func _server_mailbox_unread_count() -> int:
	return _panel_flow()._server_mailbox_unread_count()

func _mailbox_key_id(key: String, prefix: String) -> String:
	return _panel_flow()._mailbox_key_id(key, prefix)

func _refresh_mailbox_request_controls() -> void:
	_panel_flow()._refresh_mailbox_request_controls()

func _request_server_mailbox_inbox() -> void:
	_panel_flow()._request_server_mailbox_inbox()

func _request_server_mailbox_read(mail_id: String) -> void:
	_panel_flow()._request_server_mailbox_read(mail_id)

func _request_server_mailbox_claim(mail_id: String) -> void:
	_panel_flow()._request_server_mailbox_claim(mail_id)

func _on_mailbox_send_pressed() -> void:
	_panel_flow()._on_mailbox_send_pressed()

func _start_mailbox_request(kind: String, spec: Dictionary) -> void:
	_panel_flow()._start_mailbox_request(kind, spec)

func _on_mailbox_http_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_panel_flow()._on_mailbox_http_request_completed(result, response_code, _headers, body)

func _mailbox_item_entries(message: Dictionary) -> Array[Dictionary]:
	return _panel_flow()._mailbox_item_entries(message)

func _local_player_name() -> String:
	return _panel_flow()._local_player_name()

func _open_training_partner_panel() -> void:
	_panel_flow()._open_training_partner_panel()

func _close_training_partner_panel() -> void:
	_panel_flow()._close_training_partner_panel()

func _refresh_training_partner_panel() -> void:
	_panel_flow()._refresh_training_partner_panel()

func _training_partner_panel_layout_is_usable() -> bool:
	return _panel_flow()._training_partner_panel_layout_is_usable()

func _set_training_partner_count(count: int) -> void:
	await _panel_flow()._set_training_partner_count(count)

func _on_training_partner_add_pressed() -> void:
	await _panel_flow()._on_training_partner_add_pressed()

func _on_training_partner_remove_pressed() -> void:
	await _panel_flow()._on_training_partner_remove_pressed()

func _on_training_partner_fill_pressed() -> void:
	await _panel_flow()._on_training_partner_fill_pressed()

func _on_training_partner_clear_pressed() -> void:
	await _panel_flow()._on_training_partner_clear_pressed()

func _open_auto_settings_panel() -> void:
	_panel_flow()._open_auto_settings_panel()

func _close_auto_settings_panel() -> void:
	_panel_flow()._close_auto_settings_panel()

func _open_qa_panel() -> void:
	_panel_flow()._open_qa_panel()

func _close_qa_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_qa_panel(update_layout)

func _open_numeric_workbench_panel() -> void:
	_panel_flow()._open_numeric_workbench_panel()

func _close_numeric_workbench_panel(update_layout: bool = true) -> void:
	_panel_flow()._close_numeric_workbench_panel(update_layout)

func _refresh_numeric_workbench_panel() -> void:
	_panel_flow()._refresh_numeric_workbench_panel()

func _refresh_numeric_workbench_profile_options() -> void:
	_panel_flow()._refresh_numeric_workbench_profile_options()

func _refresh_numeric_workbench_sample_options() -> void:
	_panel_flow()._refresh_numeric_workbench_sample_options()

func _refresh_numeric_workbench_level_options() -> void:
	_panel_flow()._refresh_numeric_workbench_level_options()

func _refresh_numeric_workbench_stage_options() -> void:
	_panel_flow()._refresh_numeric_workbench_stage_options()

func _refresh_numeric_workbench_stone_options() -> void:
	_panel_flow()._refresh_numeric_workbench_stone_options()

func _numeric_workbench_profile_id() -> String:
	return _panel_flow()._numeric_workbench_profile_id()

func _numeric_workbench_sample_count() -> int:
	return _panel_flow()._numeric_workbench_sample_count()

func _numeric_workbench_target_level() -> int:
	return _panel_flow()._numeric_workbench_target_level()

func _numeric_workbench_stage() -> int:
	return _panel_flow()._numeric_workbench_stage()

func _numeric_workbench_stone_plan_id() -> String:
	return _panel_flow()._numeric_workbench_stone_plan_id()

func _on_numeric_workbench_growth_pressed() -> void:
	_panel_flow()._on_numeric_workbench_growth_pressed()

func _on_numeric_workbench_mm_pressed() -> void:
	_panel_flow()._on_numeric_workbench_mm_pressed()

func _on_numeric_workbench_compare_pressed() -> void:
	_panel_flow()._on_numeric_workbench_compare_pressed()

func _on_numeric_workbench_battle_pressed() -> void:
	_panel_flow()._on_numeric_workbench_battle_pressed()

func _on_numeric_workbench_output_pressed() -> void:
	_panel_flow()._on_numeric_workbench_output_pressed()

func _set_numeric_workbench_result(result: Dictionary) -> void:
	_panel_flow()._set_numeric_workbench_result(result)

func _refresh_qa_panel() -> void:
	_panel_flow()._refresh_qa_panel()

func _refresh_qa_pet_tool_controls() -> void:
	_panel_flow()._refresh_qa_pet_tool_controls()

func _reset_qa_panel_scrolls() -> void:
	_panel_flow()._reset_qa_panel_scrolls()

func _qa_panel_layout_is_usable() -> bool:
	return _panel_flow()._qa_panel_layout_is_usable()

func _qa_entry_definitions() -> Array[Dictionary]:
	return _panel_flow()._qa_entry_definitions()

func _qa_command_summary_text() -> String:
	return _panel_flow()._qa_command_summary_text()

func _gm_allowed_command_ids() -> Array[String]:
	return _panel_flow()._gm_allowed_command_ids()

func _gm_pet_command_route_for_state(has_server_session: bool, local_qa_bypass: bool) -> String:
	return _panel_flow()._gm_pet_command_route_for_state(has_server_session, local_qa_bypass)

func _authorize_gm_command(command_id: String) -> bool:
	return _panel_flow()._authorize_gm_command(command_id)

func _on_qa_entry_pressed(entry_id: String) -> void:
	_panel_flow()._on_qa_entry_pressed(entry_id)

func _on_qa_pet_grant_pressed() -> void:
	await _panel_flow()._on_qa_pet_grant_pressed()

func _on_qa_pet_level_up_pressed() -> void:
	await _panel_flow()._on_qa_pet_level_up_pressed()

func _qa_open_auto_settings(tab_id: String) -> void:
	_panel_flow()._qa_open_auto_settings(tab_id)

func _gm_battle_speed_multiplier() -> int:
	return _panel_flow()._gm_battle_speed_multiplier()

func _set_gm_speed_multiplier(value: int) -> void:
	_panel_flow()._set_gm_speed_multiplier(value)

func _sync_gm_speed_multiplier() -> void:
	_panel_flow()._sync_gm_speed_multiplier()

func _scaled_battle_delta(delta: float) -> float:
	return _panel_flow()._scaled_battle_delta(delta)

func _cycle_gm_battle_speed_gear() -> void:
	_panel_flow()._cycle_gm_battle_speed_gear()

func _qa_load_map(map_id: String, spawn_name: String, message: String) -> void:
	_panel_flow()._qa_load_map(map_id, spawn_name, message)

func _qa_route_to_gm_zone(zone_id: String) -> void:
	_panel_flow()._qa_route_to_gm_zone(zone_id)

func _refresh_auto_settings_panel() -> void:
	_panel_flow()._refresh_auto_settings_panel()

func _refresh_auto_battle_settings_tab() -> void:
	_panel_flow()._refresh_auto_battle_settings_tab()

func _refresh_hang_settings_tab() -> void:
	_panel_flow()._refresh_hang_settings_tab()

func _refresh_auto_capture_settings_tab() -> void:
	_panel_flow()._refresh_auto_capture_settings_tab()

func _set_auto_settings_tab(tab: String) -> void:
	_panel_flow()._set_auto_settings_tab(tab)

func _apply_auto_settings_tab_buttons() -> void:
	_panel_flow()._apply_auto_settings_tab_buttons()

func _add_auto_settings_section(text: String) -> void:
	_panel_flow()._add_auto_settings_section(text)

func _add_auto_settings_option(label_text: String, key: String, options: Array[Dictionary], selected_id: String) -> OptionButton:
	return _panel_flow()._add_auto_settings_option(label_text, key, options, selected_id)

func _add_auto_settings_pet_slot_option(label_text: String, key: String, selected_slot: int) -> OptionButton:
	return _panel_flow()._add_auto_settings_pet_slot_option(label_text, key, selected_slot)

func _add_auto_settings_checkbox(label_text: String, key: String, value: bool) -> CheckBox:
	return _panel_flow()._add_auto_settings_checkbox(label_text, key, value)

func _add_auto_settings_spinbox(label_text: String, key: String, value: int, suffix: String = "") -> SpinBox:
	return _panel_flow()._add_auto_settings_spinbox(label_text, key, value, suffix)

func _add_auto_settings_int_spinbox(label_text: String, key: String, value: int, min_value: int, max_value: int, suffix: String = "") -> SpinBox:
	return _panel_flow()._add_auto_settings_int_spinbox(label_text, key, value, min_value, max_value, suffix)

func _add_auto_settings_line_edit(label_text: String, key: String, value: String) -> LineEdit:
	return _panel_flow()._add_auto_settings_line_edit(label_text, key, value)

func _add_auto_settings_heal_option(index: int, selected_source_id: String) -> OptionButton:
	return _panel_flow()._add_auto_settings_heal_option(index, selected_source_id)

func _auto_settings_row(label_text: String) -> HBoxContainer:
	return _panel_flow()._auto_settings_row(label_text)

func _auto_settings_pet_slot_options() -> Array[Dictionary]:
	return _panel_flow()._auto_settings_pet_slot_options()

func _auto_settings_player_action_options() -> Array[Dictionary]:
	return _panel_flow()._auto_settings_player_action_options()

func _auto_settings_heal_source_options() -> Array[Dictionary]:
	return _panel_flow()._auto_settings_heal_source_options()

func _auto_settings_heal_priority_slots(settings: Dictionary) -> Array[String]:
	return _panel_flow()._auto_settings_heal_priority_slots(settings)

func _auto_capture_form_options() -> Array[Dictionary]:
	return _panel_flow()._auto_capture_form_options()

func _set_auto_settings_value(key: String, value) -> void:
	_panel_flow()._set_auto_settings_value(key, value)

func _auto_capture_settings_keys() -> Array[String]:
	return _panel_flow()._auto_capture_settings_keys()

func _hang_settings_keys() -> Array[String]:
	return _panel_flow()._hang_settings_keys()

func _set_auto_capture_settings_value(key: String, value) -> void:
	_panel_flow()._set_auto_capture_settings_value(key, value)

func _set_hang_settings_value(key: String, value) -> void:
	_panel_flow()._set_hang_settings_value(key, value)

func _set_auto_settings_heal_priority(index: int, source_id: String) -> void:
	_panel_flow()._set_auto_settings_heal_priority(index, source_id)

func _refresh_quest_panel() -> void:
	_panel_flow()._refresh_quest_panel()

func _set_quest_reward_controls(quest: Dictionary, status: String) -> void:
	_panel_flow()._set_quest_reward_controls(quest, status)

func _on_quest_reward_choice_selected(index: int) -> void:
	_panel_flow()._on_quest_reward_choice_selected(index)

func _on_quest_claim_pressed() -> void:
	await _panel_flow()._on_quest_claim_pressed()

func _on_quest_route_pressed() -> void:
	_panel_flow()._on_quest_route_pressed()

func _on_task_tracker_route_pressed() -> void:
	_panel_flow()._on_task_tracker_route_pressed()

func _refresh_task_route_button() -> void:
	_panel_flow()._refresh_task_route_button()

func _current_task_navigation_target() -> Dictionary:
	return _panel_flow()._current_task_navigation_target()

func _current_task_navigation_target_cached() -> Dictionary:
	return _panel_flow()._current_task_navigation_target_cached()

func _task_tracker_has_navigation_target_cached() -> bool:
	return _panel_flow()._task_tracker_has_navigation_target_cached()

func _current_task_navigation_target_uncached() -> Dictionary:
	return _panel_flow()._current_task_navigation_target_uncached()

func _navigation_target_for_quest(quest: Dictionary) -> Dictionary:
	return _panel_flow()._navigation_target_for_quest(quest)

func _first_available_unfinished_quest_for_tracker() -> Dictionary:
	return _panel_flow()._first_available_unfinished_quest_for_tracker()

func _pet_rebirth_mm_guide_task_info(include_target: bool = false) -> Dictionary:
	return _panel_flow()._pet_rebirth_mm_guide_task_info(include_target)

func _pet_rebirth_mm_guide_navigation_target(info: Dictionary) -> Dictionary:
	return _panel_flow()._pet_rebirth_mm_guide_navigation_target(info)

func _rebirth_trial_task_info(include_target: bool = false) -> Dictionary:
	return _panel_flow()._rebirth_trial_task_info(include_target)

func _rebirth_quest_completed_for_target(profile: Dictionary, target_count: int) -> bool:
	return _panel_flow()._rebirth_quest_completed_for_target(profile, target_count)

func _first_missing_rebirth_ring(profile: Dictionary, target_count: int) -> Dictionary:
	return _panel_flow()._first_missing_rebirth_ring(profile, target_count)

func _owned_rebirth_ring_count(profile: Dictionary, target_count: int) -> int:
	return _panel_flow()._owned_rebirth_ring_count(profile, target_count)

func _first_missing_rebirth_beast(profile: Dictionary, target_count: int) -> Dictionary:
	return _panel_flow()._first_missing_rebirth_beast(profile, target_count)

func _rebirth_beast_for_form_id(form_id: String) -> Dictionary:
	return _panel_flow()._rebirth_beast_for_form_id(form_id)

func _rebirth_target_label(target_count: int) -> String:
	return _panel_flow()._rebirth_target_label(target_count)

func _refresh_map_panel() -> void:
	_panel_flow()._refresh_map_panel()

func _map_targets_for_current_map() -> Array[Dictionary]:
	return _panel_flow()._map_targets_for_current_map()

func _map_target_less(a: Dictionary, b: Dictionary) -> bool:
	return _panel_flow()._map_target_less(a, b)

func _map_target_button_text(target: Dictionary) -> String:
	return _panel_flow()._map_target_button_text(target)

func _on_map_marker_pressed(target: Dictionary) -> void:
	_panel_flow()._on_map_marker_pressed(target)

func _map_minimap_texture() -> Texture2D:
	return _panel_flow()._map_minimap_texture()

func _map_target_minimap_color(target: Dictionary) -> Color:
	return _panel_flow()._map_target_minimap_color(target)

func _map_target_cell(target: Dictionary) -> Vector2i:
	return _panel_flow()._map_target_cell(target)

func _map_decor_lookup() -> Dictionary:
	return _panel_flow()._map_decor_lookup()

func _map_encounter_zone_lookup() -> Dictionary:
	return _panel_flow()._map_encounter_zone_lookup()

func _map_cell_rect(origin_pixel: Vector2i, cell_size: int, cell: Vector2i) -> Rect2i:
	return _panel_flow()._map_cell_rect(origin_pixel, cell_size, cell)

func _fill_image_rect(image: Image, rect: Rect2i, color: Color) -> void:
	_panel_flow()._fill_image_rect(image, rect, color)

func _active_quest_navigation_target() -> Dictionary:
	return _panel_flow()._active_quest_navigation_target()

func _quest_route_hint(quest: Dictionary, _objective: Dictionary) -> String:
	return _panel_flow()._quest_route_hint(quest, _objective)

func _route_to_quest_target(target: Dictionary) -> void:
	_panel_flow()._route_to_quest_target(target)

func _navigation_target_display_label(target: Dictionary) -> String:
	return _panel_flow()._navigation_target_display_label(target)

func _navigation_target_from_interaction(map_id: String, item: Dictionary) -> Dictionary:
	return _panel_flow()._navigation_target_from_interaction(map_id, item)

func _navigation_target_for_interaction_id(interaction_id: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_interaction_id(interaction_id)

func _navigation_target_for_shop(shop_id: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_shop(shop_id)

func _navigation_target_for_map_entrance(destination_map_id: String, label: String = "") -> Dictionary:
	return _panel_flow()._navigation_target_for_map_entrance(destination_map_id, label)

func _navigation_target_for_direct_warp(from_map_id: String, destination_map_id: String, label: String = "") -> Dictionary:
	return _panel_flow()._navigation_target_for_direct_warp(from_map_id, destination_map_id, label)

func _navigation_target_for_encounter_group_on_map(map_id: String, group_id: String, label: String = "") -> Dictionary:
	return _panel_flow()._navigation_target_for_encounter_group_on_map(map_id, group_id, label)

func _navigation_target_for_cave_progress(floor_ids: Array[String], goal_map_id: String, encounter_group_id: String, entrance_label: String, goal_label: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_cave_progress(floor_ids, goal_map_id, encounter_group_id, entrance_label, goal_label)

func _navigation_target_for_capture_objective_in_cave(floor_ids: Array[String], capture_floor_ids: Array[String], objective: Dictionary, entrance_label: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_capture_objective_in_cave(floor_ids, capture_floor_ids, objective, entrance_label)

func _navigation_target_for_backpack(label: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_backpack(label)

func _navigation_target_for_pet_panel(label: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_pet_panel(label)

func _navigation_target_for_encounter_group(group_id: String) -> Dictionary:
	return _panel_flow()._navigation_target_for_encounter_group(group_id)

func _navigation_target_for_capture_objective(objective: Dictionary) -> Dictionary:
	return _panel_flow()._navigation_target_for_capture_objective(objective)

func _navigation_target_for_capture_objective_on_current_map(objective: Dictionary) -> Dictionary:
	return _panel_flow()._navigation_target_for_capture_objective_on_current_map(objective)

func _map_has_capture_objective(loaded_map: Dictionary, objective: Dictionary) -> bool:
	return _panel_flow()._map_has_capture_objective(loaded_map, objective)

func _zone_matches_capture_objective(zone: Dictionary, objective: Dictionary) -> bool:
	return _panel_flow()._zone_matches_capture_objective(zone, objective)

func _warp_to_map(from_map_id: String, to_map_id: String) -> Dictionary:
	return _panel_flow()._warp_to_map(from_map_id, to_map_id)

func _map_data_for_id(map_id: String) -> Dictionary:
	return _panel_flow()._map_data_for_id(map_id)

func _map_name_for_id(map_id: String) -> String:
	return _panel_flow()._map_name_for_id(map_id)

func _refresh_codex_panel() -> void:
	_panel_flow()._refresh_codex_panel()

func _preferred_codex_form_id(entries: Array[Dictionary]) -> String:
	return _panel_flow()._preferred_codex_form_id(entries)

func _add_codex_list_button(entry: Dictionary) -> void:
	_panel_flow()._add_codex_list_button(entry)

func _select_codex_form(form_id: String) -> void:
	_panel_flow()._select_codex_form(form_id)

func _refresh_pet_growth_table(instance: Dictionary) -> void:
	_panel_flow()._refresh_pet_growth_table(instance)

func _pet_growth_grade_text(row: Dictionary) -> String:
	return _panel_flow()._pet_growth_grade_text(row)

func _pet_growth_table_cell(text: String, is_header: bool, grade: String) -> Label:
	return _panel_flow()._pet_growth_table_cell(text, is_header, grade)

func _pet_growth_table_color(grade: String, is_header: bool) -> Color:
	return _panel_flow()._pet_growth_table_color(grade, is_header)

func _set_pet_growth_stage(stage: int) -> void:
	_panel_flow()._set_pet_growth_stage(stage)

func _sync_pet_growth_stage_tabs(instance: Dictionary) -> void:
	_panel_flow()._sync_pet_growth_stage_tabs(instance)

func _refresh_pet_panel() -> void:
	_panel_flow()._refresh_pet_panel()

func _pet_filter_options() -> Array[Dictionary]:
	return _panel_flow()._pet_filter_options()

func _pet_sort_options() -> Array[Dictionary]:
	return _panel_flow()._pet_sort_options()

func _pet_management_option(options: Array[Dictionary], selected_id: String) -> OptionButton:
	return _panel_flow()._pet_management_option(options, selected_id)

func _sync_pet_management_options() -> void:
	_panel_flow()._sync_pet_management_options()

func _sync_pet_sort_direction_button() -> void:
	_panel_flow()._sync_pet_sort_direction_button()

func _pet_default_sort_descending(sort_mode: String) -> bool:
	return _panel_flow()._pet_default_sort_descending(sort_mode)

func _on_pet_sort_direction_pressed() -> void:
	_panel_flow()._on_pet_sort_direction_pressed()

func _select_option_by_metadata(option: OptionButton, selected_id: String) -> void:
	_panel_flow()._select_option_by_metadata(option, selected_id)

func _node_tree_has_button_text(root: Node, button_text: String) -> bool:
	return _panel_flow()._node_tree_has_button_text(root, button_text)

func _pet_panel_visible_instances() -> Array[Dictionary]:
	return _panel_flow()._pet_panel_visible_instances()

func _pet_panel_instance_passes_filter(instance: Dictionary) -> bool:
	return _panel_flow()._pet_panel_instance_passes_filter(instance)

func _pet_panel_sort_before(a: Dictionary, b: Dictionary) -> bool:
	return _panel_flow()._pet_panel_sort_before(a, b)

func _pet_panel_state_order(state: String) -> int:
	return _panel_flow()._pet_panel_state_order(state)

func _pet_panel_has_instance(instances: Array[Dictionary], instance_id: String) -> bool:
	return _panel_flow()._pet_panel_has_instance(instances, instance_id)

func _pet_state_button_label(state: String) -> String:
	return _panel_flow()._pet_state_button_label(state)

func _set_pet_detail_mode(mode: String) -> void:
	_panel_flow()._set_pet_detail_mode(mode)

func _add_pet_section_label(text: String) -> void:
	_panel_flow()._add_pet_section_label(text)

func _add_pet_list_button(instance: Dictionary) -> void:
	_panel_flow()._add_pet_list_button(instance)

func _select_pet_instance(instance_id: String) -> void:
	await _panel_flow()._select_pet_instance(instance_id)

func _on_pet_state_cycle_pressed() -> void:
	await _panel_flow()._on_pet_state_cycle_pressed()

func _on_pet_stable_pressed() -> void:
	await _panel_flow()._on_pet_stable_pressed()

func _on_pet_party_move_pressed(direction: int) -> void:
	await _panel_flow()._on_pet_party_move_pressed(direction)

func _on_pet_lock_pressed() -> void:
	await _panel_flow()._on_pet_lock_pressed()

func _on_pet_batch_store_pressed() -> void:
	await _panel_flow()._on_pet_batch_store_pressed()

func _on_pet_batch_state_pressed(target_state: String) -> void:
	await _panel_flow()._on_pet_batch_state_pressed(target_state)

func _on_pet_rename_pressed() -> void:
	_panel_flow()._on_pet_rename_pressed()

func _on_pet_rename_confirmed() -> void:
	await _panel_flow()._on_pet_rename_confirmed()

func _on_pet_cultivation_pressed() -> void:
	_panel_flow()._on_pet_cultivation_pressed()

func _refresh_pet_cultivation_panel() -> void:
	_panel_flow()._refresh_pet_cultivation_panel()

func _on_pet_cultivation_confirm_pressed() -> void:
	await _panel_flow()._on_pet_cultivation_confirm_pressed()

func _close_pet_cultivation_panel() -> void:
	_panel_flow()._close_pet_cultivation_panel()

func _on_pet_drop_pressed() -> void:
	await _panel_flow()._on_pet_drop_pressed()

func _on_pet_clear_storage_pressed() -> void:
	await _panel_flow()._on_pet_clear_storage_pressed()

func _available_pet_drop_cell_result() -> Dictionary:
	return _panel_flow()._available_pet_drop_cell_result()

func _ground_pet_occupied_cell_lookup(map_id: String) -> Dictionary:
	return _panel_flow()._ground_pet_occupied_cell_lookup(map_id)

func _ground_pet_drop_for_instance_id(instance_id: String) -> Dictionary:
	return _panel_flow()._ground_pet_drop_for_instance_id(instance_id)

func _ground_pet_drops_on_map_fast(map_id: String) -> Array[Dictionary]:
	return _panel_flow()._ground_pet_drops_on_map_fast(map_id)

func _find_ground_pet_drop_at_world_point(world_point: Vector2, hit_radius: float = 34.0) -> Dictionary:
	return _panel_flow()._find_ground_pet_drop_at_world_point(world_point, hit_radius)

func _ground_pet_interaction_for_drop(drop: Dictionary) -> Dictionary:
	return _panel_flow()._ground_pet_interaction_for_drop(drop)

func _ground_pet_marker_world_position(drop: Dictionary) -> Vector2:
	return _panel_flow()._ground_pet_marker_world_position(drop)

func _pickup_ground_pet_drop(drop_id: String) -> void:
	await _panel_flow()._pickup_ground_pet_drop(drop_id)

func _close_pet_rename_panel() -> void:
	_panel_flow()._close_pet_rename_panel()

func _update_pet_rest_recovery(delta: float) -> void:
	_panel_flow()._update_pet_rest_recovery(delta)

func _apply_pet_rest_recovery_tick(save_after: bool = true, refresh_panel: bool = true) -> Dictionary:
	return _panel_flow()._apply_pet_rest_recovery_tick(save_after, refresh_panel)

func _has_recovering_rest_pet() -> bool:
	return _panel_flow()._has_recovering_rest_pet()

func _update_ground_pet_drop_expiration(delta: float) -> void:
	await _panel_flow()._update_ground_pet_drop_expiration(delta)

func _has_ground_pet_drops() -> bool:
	return _panel_flow()._has_ground_pet_drops()

func _has_expired_ground_pet_drop(now_sec: int) -> bool:
	return _panel_flow()._has_expired_ground_pet_drop(now_sec)

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
			_submit_player_battle_command("run")
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
			_submit_player_battle_command("run")
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
	var first_target_id := _first_catchable_living_enemy_id() if command_id == "capture" else BattleModel.living_enemy_id(battle_state)
	if first_target_id == "":
		_set_battle_message("当前没有可捕捉的宠物。" if command_id == "capture" else "没有可选择的目标。")
		return
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_target_mode = "player_capture_target" if command_id == "capture" else "player_attack_target"
	_set_battle_message("请选择%s目标。" % ("捕捉" if command_id == "capture" else "攻击"))
	_sync_battle_buttons()
	queue_redraw()


func _submit_player_battle_command(command_id: String, target_id: String = "", auto_capture: bool = false) -> void:
	battle_target_mode = "enemy"
	if command_id == "capture" and _battle_capture_capacity_blocks_action():
		return
	if command_id == "attack" or command_id == "capture":
		battle_selected_target_id = target_id
		if battle_selected_target_id == "":
			if command_id == "capture":
				battle_target_mode = "player_capture_target" if _first_catchable_living_enemy_id() != "" else "enemy"
				_set_battle_message("请选择捕捉目标。" if battle_target_mode == "player_capture_target" else "当前没有可捕捉的宠物。")
			else:
				_set_battle_message("没有可选择的目标。")
			return
		if command_id == "capture":
			var capture_target := BattleModel.actor_by_id(battle_state, battle_selected_target_id)
			if not _battle_actor_is_catchable_living_enemy(capture_target):
				battle_target_mode = "player_capture_target" if _first_catchable_living_enemy_id() != "" else "enemy"
				battle_selected_target_id = ""
				_set_battle_message(_capture_target_rejection_message(capture_target))
				_sync_battle_buttons()
				return
			var target_requirement_message := _capture_tool_target_requirement_message(battle_pending_capture_tool_id, battle_selected_target_id)
			if target_requirement_message != "":
				battle_target_mode = "player_capture_target"
				battle_selected_target_id = ""
				_set_battle_message(target_requirement_message)
				_sync_battle_buttons()
				return
	if _battle_is_server_authority():
		_submit_server_battle_player_command(command_id, battle_selected_target_id, "", "", auto_capture)
		return
	battle_pending_player_command = {
		"command": command_id,
		"targetId": battle_selected_target_id,
		"allyTargetId": battle_selected_ally_target_id,
	}
	if command_id == "capture":
		battle_pending_player_command["captureToolId"] = CaptureToolCatalog.normalized_tool_id(battle_pending_capture_tool_id)
	_open_pet_command_or_start_round()


func _submit_server_battle_player_command(command_id: String, target_id: String = "", pet_id: String = "", item_id: String = "", auto_capture: bool = false) -> void:
	await _server_battle().submit_player_command(command_id, target_id, pet_id, item_id, auto_capture)


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
	if _battle_capture_capacity_blocks_action():
		return
	if _first_catchable_living_enemy_id() == "":
		_set_battle_message("当前没有可捕捉的宠物。")
		_sync_battle_buttons()
		return
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
	return str(battle_capture_button_tool_ids.get(command_id, ""))


func _capture_tool_target_requirement_message(tool_id: String, target_id: String) -> String:
	var normalized_tool_id := CaptureToolCatalog.normalized_tool_id(tool_id)
	if normalized_tool_id != BattleModel.CAPTURE_TOOL_POISON_WULI_NET:
		return ""
	var target := BattleModel.actor_by_id(battle_state, target_id)
	if target.is_empty():
		return ""
	if not _battle_actor_is_poisoned_wuli(target):
		return "缚毒捕捉网只能捕捉中毒的乌力。"
	return ""


func _battle_actor_is_catchable_living_enemy(actor: Dictionary) -> bool:
	return (
		not actor.is_empty()
		and str(actor.get("side", "")) == BattleModel.SIDE_ENEMY
		and int(actor.get("hp", 0)) > 0
		and bool(actor.get("catchable", false))
		and not bool(actor.get("captured", false))
	)


func _first_catchable_living_enemy_id() -> String:
	for actor_id in BattleModel.living_actor_ids(battle_state, BattleModel.SIDE_ENEMY):
		var actor := BattleModel.actor_by_id(battle_state, actor_id)
		if _battle_actor_is_catchable_living_enemy(actor):
			return str(actor_id)
	return ""


func _capture_target_rejection_message(actor: Dictionary) -> String:
	if _first_catchable_living_enemy_id() == "":
		return "当前没有可捕捉的宠物。"
	if bool(actor.get("captured", false)):
		return "这个目标已经被捕捉。"
	return "这个目标不可捕捉。"


func _battle_actor_is_poisoned_wuli(actor: Dictionary) -> bool:
	var line_id := str(actor.get("lineId", "")).strip_edges()
	var form_id := str(actor.get("formId", actor.get("templateId", ""))).strip_edges()
	var is_wuli := line_id == "wuli" or form_id.begins_with("wuli_")
	return is_wuli and BattleStatusModel.has_status(actor, BattleModel.STATUS_POISON)


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
	if _battle_capture_capacity_blocks_action():
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
	if _battle_capture_capacity_blocks_action():
		return
	var target_id := _first_catchable_living_enemy_id()
	if target_id == "":
		_set_battle_message("当前没有可捕捉的宠物。")
		return
	battle_pending_capture_tool_id = CaptureToolCatalog.normalized_tool_id(tool_id)
	battle_selected_target_id = ""
	battle_hover_target_id = ""
	battle_hover_ally_target_id = ""
	battle_target_mode = "player_capture_target"
	var chance := BattleModel.capture_chance(battle_state, BattleModel.player_actor_id(battle_state), target_id, battle_pending_capture_tool_id)
	if battle_pending_capture_tool_id == BattleModel.CAPTURE_TOOL_POISON_WULI_NET:
		_set_battle_message("%s：请选择中毒乌力。" % CaptureToolCatalog.full_name_for(battle_pending_capture_tool_id))
	else:
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
	if BattleModel.controlled_pet_id(battle_state) != "" and str(battle_pending_player_command.get("command", "")) != "run":
		if not _controlled_pet_has_usable_skill():
			_skip_controlled_pet_battle_command()
			return
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
	if not (["switch_pet", "run"].has(player_command_id)) and battle_pending_pet_command.is_empty() and BattleModel.controlled_pet_id(battle_state) != "":
		if not _controlled_pet_has_usable_skill():
			battle_pending_pet_command.clear()
		elif bool(battle_pending_player_command.get("captureHold", false)):
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
		if not bool(event.get("serverResolved", false)) and counter_event is Dictionary and not (counter_event as Dictionary).is_empty():
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
		bool(state.get("escaped", false))
		or
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
	if bool(battle_state.get("serverAuthority", false)):
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
			var tick_split := _battle_damage_split_for_ledger(ledger, target_id, tick_damage)
			var tick_actor_damage := int(tick_split.get("actorDamage", tick_damage))
			if tick_actor_damage > 0:
				_add_battle_float_text(target_id, "毒 -%d" % tick_actor_damage, Color(0.68, 0.95, 0.34, 0.98))
			_add_battle_ride_damage_feedback(target_id, int(tick_split.get("rideDamage", 0)))
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
			var poison_split := _battle_damage_split_for_ledger(ledger, target_id, poison_damage)
			var poison_actor_damage := int(poison_split.get("actorDamage", poison_damage))
			var poison_status_result := str(ledger.get("statusResult", ""))
			if poison_actor_damage > 0:
				var poison_text := "中毒 -%d" % poison_actor_damage if poison_status_result == "applied" else (("免疫 -%d" % poison_actor_damage) if poison_status_result == "immune" else "抵抗 -%d" % poison_actor_damage)
				_add_battle_float_text(target_id, poison_text, Color(0.72, 0.95, 0.36, 0.98))
			_add_battle_ride_damage_feedback(target_id, int(poison_split.get("rideDamage", 0)))
		return
	if event_type == "item_poison":
		var item_poison_damage := int(ledger.get("damage", 0))
		if item_poison_damage > 0:
			var item_poison_split := _battle_damage_split_for_ledger(ledger, target_id, item_poison_damage)
			var item_poison_actor_damage := int(item_poison_split.get("actorDamage", item_poison_damage))
			var item_poison_status_result := str(ledger.get("statusResult", ""))
			if item_poison_actor_damage > 0:
				var item_poison_text := "毒粉 -%d" % item_poison_actor_damage if item_poison_status_result == "applied" else (("免疫 -%d" % item_poison_actor_damage) if item_poison_status_result == "immune" else "抵抗 -%d" % item_poison_actor_damage)
				_add_battle_float_text(target_id, item_poison_text, Color(0.80, 0.92, 0.34, 0.98))
			_add_battle_ride_damage_feedback(target_id, int(item_poison_split.get("rideDamage", 0)))
		return
	if event_type == "spirit_poison_all":
		var poison_effects := ledger.get("effectPerTarget", {}) as Dictionary
		var poison_results := ledger.get("statusResultPerTarget", {}) as Dictionary
		for poison_target_id in ledger.get("targetIds", []):
			var poison_value := int(poison_effects.get(str(poison_target_id), 0))
			if poison_value > 0:
				var resolved_poison_target_id := str(poison_target_id)
				var poison_split := _battle_damage_split_for_ledger(ledger, resolved_poison_target_id, poison_value)
				var poison_actor_damage := int(poison_split.get("actorDamage", poison_value))
				var poison_result := str(poison_results.get(str(poison_target_id), "applied"))
				if poison_actor_damage > 0:
					var poison_all_text := "中毒 -%d" % poison_actor_damage if poison_result == "applied" else (("免疫 -%d" % poison_actor_damage) if poison_result == "immune" else "抵抗 -%d" % poison_actor_damage)
					_add_battle_float_text(resolved_poison_target_id, poison_all_text, Color(0.72, 0.95, 0.36, 0.98))
				_add_battle_ride_damage_feedback(resolved_poison_target_id, int(poison_split.get("rideDamage", 0)))
		return
	if event_type == "item_poison_all":
		var item_poison_effects := ledger.get("effectPerTarget", {}) as Dictionary
		var item_poison_results := ledger.get("statusResultPerTarget", {}) as Dictionary
		for item_poison_target_id in ledger.get("targetIds", []):
			var item_poison_value := int(item_poison_effects.get(str(item_poison_target_id), 0))
			if item_poison_value > 0:
				var resolved_item_poison_target_id := str(item_poison_target_id)
				var item_poison_split := _battle_damage_split_for_ledger(ledger, resolved_item_poison_target_id, item_poison_value)
				var item_poison_actor_damage := int(item_poison_split.get("actorDamage", item_poison_value))
				var item_poison_result := str(item_poison_results.get(str(item_poison_target_id), "applied"))
				if item_poison_actor_damage > 0:
					var item_poison_all_text := "毒粉 -%d" % item_poison_actor_damage if item_poison_result == "applied" else (("免疫 -%d" % item_poison_actor_damage) if item_poison_result == "immune" else "抵抗 -%d" % item_poison_actor_damage)
					_add_battle_float_text(resolved_item_poison_target_id, item_poison_all_text, Color(0.80, 0.92, 0.34, 0.98))
				_add_battle_ride_damage_feedback(resolved_item_poison_target_id, int(item_poison_split.get("rideDamage", 0)))
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
			var multi_split := _battle_damage_split_for_ledger(ledger, resolved_multi_target_id, multi_damage)
			var multi_actor_damage := int(multi_split.get("actorDamage", multi_damage))
			if multi_actor_damage > 0:
				var multi_text := "-%d" % multi_actor_damage
				if bool(critical_map.get(resolved_multi_target_id, false)):
					multi_text = "暴击 %s" % multi_text
				_add_battle_float_text(resolved_multi_target_id, multi_text, Color(1.0, 0.82, 0.30, 0.98), multi_delay)
			_add_battle_ride_damage_feedback(resolved_multi_target_id, int(multi_split.get("rideDamage", multi_ride_effects.get(resolved_multi_target_id, 0))), multi_delay + 0.10)
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
	var damage_split := _battle_damage_split_for_ledger(ledger, target_id, damage)
	var actor_damage := int(damage_split.get("actorDamage", damage))
	var ride_damage := int(damage_split.get("rideDamage", 0))
	var feedback_delay := _battle_event_duration(event) * _battle_event_result_reveal_progress(event) if _battle_event_delays_result(event) else 0.0
	if actor_damage > 0:
		var text := "-%d" % actor_damage
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
	_add_battle_ride_damage_feedback(target_id, ride_damage, feedback_delay + 0.10)


func _battle_damage_split_for_ledger(ledger: Dictionary, target_id: String, total_damage: int) -> Dictionary:
	var actor_damage_map := ledger.get("actorDamagePerTarget", {}) as Dictionary if ledger.get("actorDamagePerTarget", {}) is Dictionary else {}
	var ride_damage_map := ledger.get("rideDamagePerTarget", {}) as Dictionary if ledger.get("rideDamagePerTarget", {}) is Dictionary else {}
	return {
		"actorDamage": maxi(0, int(actor_damage_map.get(target_id, total_damage))),
		"rideDamage": maxi(0, int(ride_damage_map.get(target_id, 0))),
	}


func _add_battle_ride_damage_feedback(actor_id: String, ride_damage: int, delay: float = 0.10) -> void:
	if ride_damage <= 0:
		return
	_add_battle_float_text(actor_id, "骑 -%d" % ride_damage, Color(0.50, 0.86, 1.0, 0.98), delay)


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
		"escape":
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
		var player_target := BattleModel.actor_by_id(battle_state, player_target_id)
		if battle_target_mode == "player_capture_target" and not _battle_actor_is_catchable_living_enemy(player_target):
			_set_battle_message(_capture_target_rejection_message(player_target))
			queue_redraw()
			return true
		battle_selected_target_id = player_target_id
		battle_hover_target_id = player_target_id
		battle_hover_info_actor_id = player_target_id
		_update_battle_passive_panel()
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


func _inspect_battle_actor_at_screen_point(screen_point: Vector2) -> bool:
	if not battle_active or _battle_point_overlaps_panel(screen_point):
		return false
	var actor_id := _battle_actor_id_at_screen_point(screen_point, "")
	if actor_id == "":
		return false
	battle_hover_info_actor_id = actor_id
	_update_battle_passive_panel()
	var actor := BattleModel.actor_by_id(battle_state, actor_id)
	if actor.is_empty():
		return false
	var hp := maxi(0, int(actor.get("hp", 0)))
	var max_hp := maxi(1, int(actor.get("maxHp", 1)))
	var side_text := "敌方" if str(actor.get("side", "")) == BattleModel.SIDE_ENEMY else "我方"
	_set_battle_message("查看%s：%s HP %d/%d。" % [
		side_text,
		str(actor.get("name", "目标")),
		hp,
		max_hp,
	])
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
			if battle_target_mode == "player_capture_target" and not _battle_actor_is_catchable_living_enemy(BattleModel.actor_by_id(battle_state, next_enemy_id)):
				next_enemy_id = ""
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
	elif battle_target_mode == "player_capture_target" and not _battle_actor_is_catchable_living_enemy(BattleModel.actor_by_id(battle_state, battle_selected_target_id)):
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
		action_bar.visible = battle_active or not _world_menu_is_open()
		if _battle_overlay_panel_open():
			action_bar.visible = false
	var can_command := battle_active and not _battle_commands_locked()
	if battle_active:
		_sync_battle_target_selection()
	var has_enemy := can_command and BattleModel.living_enemy_id(battle_state) != ""
	var has_capture_target := can_command and _first_catchable_living_enemy_id() != ""
	var has_ally := can_command and BattleModel.living_ally_id(battle_state) != ""
	var capture_capacity := _battle_capture_capacity_snapshot()
	var capture_allowed := bool(capture_capacity.get("canCapture", false))
	_sync_battle_capture_capacity_label(capture_capacity, has_capture_target)
	if battle_command_owner == "player" and battle_command_buttons.has("run"):
		var run_button := battle_command_buttons["run"] as Button
		if run_button != null:
			run_button.text = _battle_player_run_label()
	for command_id in battle_command_buttons.keys():
		var button := battle_command_buttons[command_id] as Button
		if button != null:
			button.tooltip_text = ""
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
					"help":
						button.disabled = not can_command
					_:
						var capture_tool_id := str(battle_capture_button_tool_ids.get(str(command_id), ""))
						button.disabled = not capture_allowed or capture_tool_id == "" or not has_capture_target or not BattleModel.has_capture_tool(battle_state, capture_tool_id)
						if not capture_allowed:
							button.tooltip_text = str(capture_capacity.get("blockedMessage", BattleCaptureCapacityModel.SYNCING_TEXT))
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
							button.disabled = not has_capture_target or not capture_allowed
							if not capture_allowed:
								button.tooltip_text = str(capture_capacity.get("blockedMessage", BattleCaptureCapacityModel.SYNCING_TEXT))
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
						"attack":
							button.disabled = not has_enemy
						"capture":
							button.disabled = not has_capture_target or not capture_allowed
							if not capture_allowed:
								button.tooltip_text = str(capture_capacity.get("blockedMessage", BattleCaptureCapacityModel.SYNCING_TEXT))
						"spirit":
							button.disabled = not has_ally
						"switch_pet":
							button.disabled = BattleModel.switchable_pet_entries(battle_state).is_empty()


func _battle_command_panel_should_be_visible() -> bool:
	return battle_active and not _battle_commands_locked() and not _battle_overlay_panel_open()


func _battle_overlay_panel_open() -> bool:
	return (
		(codex_panel != null and codex_panel.visible)
		or (quest_panel != null and quest_panel.visible)
		or (mailbox_panel != null and mailbox_panel.visible)
		or (market_panel != null and market_panel.visible)
		or (bank_panel != null and bank_panel.visible)
		or (auto_settings_panel != null and auto_settings_panel.visible)
		or (account_panel != null and account_panel.visible)
	)


func _battle_commands_locked() -> bool:
	if not battle_active:
		return true
	return battle_action_timer > 0.0 or not battle_event_queue.is_empty() or battle_enemy_response_pending or battle_end_pending or str(battle_state.get("phase", "command")) != "command"


func _reset_battle_command_countdown() -> void:
	battle_command_countdown_remaining = BATTLE_COMMAND_COUNTDOWN_SECONDS
	battle_command_countdown_last_second = -1
	_sync_battle_round_timer_labels(true)


func _battle_timer_should_be_visible() -> bool:
	if not battle_active:
		return false
	var phase := str(battle_state.get("phase", "command")).strip_edges()
	return phase == "command" or phase == "server_waiting"


func _server_battle_command_deadline_remaining() -> float:
	if not bool(battle_state.get("serverAuthority", false)):
		return -1.0
	var deadline_text := _server_battle_command_deadline_text()
	if deadline_text == "":
		return -1.0
	var deadline_unix := _unix_time_from_iso_utc(deadline_text)
	if deadline_unix < 0.0:
		return -1.0
	return maxf(0.0, deadline_unix - Time.get_unix_time_from_system())


func _server_battle_command_deadline_text() -> String:
	var room = battle_state.get("serverRoom", {}) as Dictionary if battle_state.get("serverRoom", {}) is Dictionary else {}
	var battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var deadline_text := str(battle.get("commandDeadlineAt", "")).strip_edges()
	if deadline_text != "":
		return deadline_text
	room = server_battle_state.get("room", {}) as Dictionary if server_battle_state.get("room", {}) is Dictionary else {}
	battle = room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	return str(battle.get("commandDeadlineAt", "")).strip_edges()


func _unix_time_from_iso_utc(iso_text: String) -> float:
	var text := iso_text.strip_edges()
	if text == "":
		return -1.0
	text = text.replace("T", " ").replace("Z", "")
	var dot_index := text.find(".")
	if dot_index >= 0:
		text = text.substr(0, dot_index)
	var parts := text.split(" ")
	if parts.size() != 2:
		return -1.0
	var date_parts := parts[0].split("-")
	var time_parts := parts[1].split(":")
	if date_parts.size() != 3 or time_parts.size() < 3:
		return -1.0
	return float(Time.get_unix_time_from_datetime_dict({
		"year": int(date_parts[0]),
		"month": int(date_parts[1]),
		"day": int(date_parts[2]),
		"hour": int(time_parts[0]),
		"minute": int(time_parts[1]),
		"second": int(time_parts[2]),
	}))


func _update_battle_command_countdown(delta: float) -> void:
	if not battle_active:
		return
	var phase := str(battle_state.get("phase", "command")).strip_edges()
	if phase == "server_waiting":
		var server_remaining := _server_battle_command_deadline_remaining()
		if server_remaining >= 0.0:
			var local_remaining := maxf(0.0, battle_command_countdown_remaining - delta)
			battle_command_countdown_remaining = minf(local_remaining, server_remaining)
		else:
			battle_command_countdown_remaining = maxf(0.0, battle_command_countdown_remaining - delta)
		_sync_battle_round_timer_labels(false)
		return
	if phase != "command" or _battle_commands_locked():
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
		battle_timer_panel.visible = _battle_timer_should_be_visible()
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
	var guidance := _current_task_guidance_uncached()
	task_tracker_hud_prefix_cache = AdventureGoalPresenter.task_prefix(
		task_tracker_text_cache,
		str(guidance.get("actionText", "探索营地，寻找新的委托")),
		str(guidance.get("rewardText", "")),
	)
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
		var blocked_quest := PlayerProgressModel.first_level_blocked_unfinished_quest(player_profile)
		if not blocked_quest.is_empty():
			var current_level := PlayerProgressModel.player_level(player_profile)
			return "%s - %s" % [
				"等级不足" if current_level < QuestModel.required_level_for(blocked_quest) else "暂不可接",
				QuestModel.title_for(blocked_quest),
			]
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


func _current_task_guidance_uncached() -> Dictionary:
	var quest := PlayerProgressModel.active_quest(player_profile)
	var available := false
	if quest.is_empty():
		quest = _first_available_unfinished_quest_for_tracker()
		available = not quest.is_empty()
	if quest.is_empty():
		return {
			"actionText": "点击任务面板查看下一步",
			"rewardText": "",
		}
	var action_text := QuestModel.objective_text_for(quest)
	if available:
		action_text = "找到任务发布者并接取任务"
	elif PlayerProgressModel.can_claim_active_quest(player_profile):
		action_text = "返回任务发布者领取奖励"
	return {
		"actionText": action_text,
		"rewardText": QuestModel.reward_text(quest),
	}


func _training_partner_count() -> int:
	var partners = player_profile.get("trainingPartners", [])
	if not (partners is Array):
		return 0
	return (partners as Array).size()


func _toggle_pet_ring() -> void:
	if pet_follow_enabled:
		_set_pet_follow_enabled(false)


func _set_pet_follow_enabled(enabled: bool, instance_id: String = "") -> void:
	pet_follow_enabled = enabled
	if enabled:
		var selected_id := instance_id.strip_edges()
		if selected_id != "":
			pet_follow_instance_id = selected_id
	else:
		pet_follow_instance_id = ""
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
	else:
		pet.clear_follow_target()
		pet_follow_points.clear()
		pet_follow_index = 0


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


func _cached_offline_hang_status() -> Dictionary:
	return _server_sync().cached_offline_hang_status()


func _request_offline_hang_status(emit_message: bool = false) -> Dictionary:
	return await _server_sync().request_offline_hang_status(emit_message)


func _submit_offline_hang_action(action: String) -> Dictionary:
	return await _server_sync().submit_offline_hang_action(action)


func _update_offline_hang_gm_config(config: Dictionary) -> Dictionary:
	return await _server_sync().update_offline_hang_gm_config(config)


func _on_hang_button_pressed() -> void:
	if player == null:
		return
	if battle_active:
		_request_hang_stop_after_battle()
		return
	if hang_mode_active or _encounter_stone_active():
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
	var quest_messages := _record_quest_event_and_maybe_claim({
		"type": "start_hang",
		"mode": "walk",
		"encounterGroupId": str(zone.get("encounterGroupId", "")),
		"amount": 1,
	})
	_set_hang_mode(true)
	var messages: Array[String] = ["开始挂机，会在遇敌区域内来回走动。"]
	messages.append_array(quest_messages)
	_set_world_log_message("\n".join(messages))


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
	if (hang_mode_active or _encounter_stone_active()) and not hang_stop_after_battle_requested:
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
	if server_step_move_active or server_step_move_request_pending or server_step_move_waiting_for_visual:
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
	if _should_use_server_step_movement(true):
		_set_server_step_move_target_cell(next_cell, IsoMapModel.grid_to_world(map_data, next_cell), next_cell)
	else:
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


func _request_hang_stop_after_battle() -> void:
	var has_hang_activity := _hang_activity_active() or bool(PlayerProgressModel.hang_session(player_profile).get(HangSettingsModel.SESSION_ENABLED_KEY, false))
	if not has_hang_activity and not hang_stop_after_battle_requested:
		_set_battle_message("当前没有挂机。")
		return
	hang_stop_after_battle_requested = true
	if player != null:
		player.clear_move_target()
	_set_battle_message("本场战斗结束后停止挂机。")
	_sync_hang_button_text()


func _consume_hang_stop_after_battle_request() -> bool:
	if not hang_stop_after_battle_requested:
		return false
	hang_stop_after_battle_requested = false
	return true


func _clear_navigation_state() -> void:
	pending_server_encounter_permit.clear()
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
	var action_collapsed_size := ACTION_BAR_COLLAPSED_SIZE
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
		battle_timer_panel.visible = _battle_timer_should_be_visible()
		if battle_timer_label != null:
			battle_timer_label.size = timer_size - Vector2(20.0, 12.0)
	if party_roster_panel != null:
		var roster_has_party := bool(party_roster_panel.get_meta("has_party", false))
		var roster_width: float = 224.0 if viewport_size.x >= 980.0 else 196.0
		var roster_y := top_panel.position.y + top_panel.size.y + 12.0
		var roster_height: float = minf(348.0, maxf(0.0, viewport_size.y - roster_y - margin - 104.0))
		party_roster_panel.position = Vector2(margin, roster_y)
		party_roster_panel.size = Vector2(roster_width, roster_height)
		party_roster_panel.visible = roster_has_party and not battle_active and not is_phone_shape and viewport_size.x >= 820.0 and roster_height >= 96.0

	if battle_active:
		side_panel.visible = false
		action_bar.visible = true
		action_bar.position = Vector2(viewport_size.x - (action_collapsed_size.x if action_bar_collapsed else action_width) - margin, viewport_size.y - 104.0)
		action_bar.size = action_collapsed_size if action_bar_collapsed else action_size
	elif is_phone_shape or world_menu_open:
		side_panel.visible = false
		action_bar.visible = not world_menu_open
		if viewport_size.y > viewport_size.x:
			action_bar.position = Vector2(maxf(margin, (viewport_size.x - action_width) * 0.5), viewport_size.y - 104.0)
		else:
			action_bar.position = Vector2(margin, viewport_size.y - 104.0)
		if action_bar_collapsed:
			action_bar.position.x = viewport_size.x - action_collapsed_size.x - margin
			action_bar.size = action_collapsed_size
		else:
			action_bar.size = action_size
	else:
		side_panel.visible = true
		action_bar.visible = true
		side_panel.position = Vector2(viewport_size.x - 286.0, margin)
		side_panel.size = Vector2(268, 168)
		action_bar.position = Vector2(viewport_size.x - (action_collapsed_size.x if action_bar_collapsed else action_width) - margin, viewport_size.y - 104.0)
		action_bar.size = action_collapsed_size if action_bar_collapsed else action_size
	_panel_flow()._sync_action_bar_state()

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

	var panel_top_y := top_panel.position.y + top_panel.size.y + 8.0
	var panel_available_height := maxf(160.0, viewport_size.y - panel_top_y - margin)
	var compact_panel_content := is_phone_shape and viewport_size.y < 520.0
	if backpack_detail_label != null:
		backpack_detail_label.custom_minimum_size = Vector2.ZERO if not backpack_detail_label.visible else Vector2(0, 64.0 if compact_panel_content else 122.0)
	if backpack_target_scroll != null:
		backpack_target_scroll.custom_minimum_size = Vector2(0, 72.0 if compact_panel_content else 112.0)
	if shop_detail_label != null:
		shop_detail_label.custom_minimum_size = Vector2(0, 52.0 if compact_panel_content else 126.0)
	if map_texture_rect != null:
		map_texture_rect.custom_minimum_size = Vector2(0, 76.0 if compact_panel_content else 210.0)
	if map_detail_label != null:
		map_detail_label.custom_minimum_size = Vector2(0, 42.0 if compact_panel_content else 58.0)
	var pet_width: float = minf(viewport_size.x - margin * 2.0, PET_PANEL_MAX_SIZE.x)
	var pet_height: float = minf(panel_available_height, PET_PANEL_MAX_SIZE.y)
	pet_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), pet_width)
	pet_height = maxf(minf(PET_PANEL_MIN_SIZE.y, panel_available_height), pet_height)
	var pet_panel_y = minf(maxf(panel_top_y, (viewport_size.y - pet_height) * 0.5), viewport_size.y - pet_height - margin)
	player_status_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, pet_panel_y)
	player_status_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		player_status_panel.visible = false
	if player_status_panel.visible and action_bar != null:
		action_bar.visible = false

	player_rebirth_preview_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, pet_panel_y)
	player_rebirth_preview_panel.size = Vector2(pet_width, pet_height)
	if battle_active:
		player_rebirth_preview_panel.visible = false
	if player_rebirth_preview_panel.visible and action_bar != null:
		action_bar.visible = false

	backpack_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, pet_panel_y)
	backpack_panel.size = Vector2(pet_width, pet_height)
	if backpack_grid != null:
		backpack_grid.columns = _backpack_grid_columns()
	if battle_active:
		backpack_panel.visible = false
	if backpack_panel.visible and action_bar != null:
		action_bar.visible = false

	var equipment_width: float = minf(viewport_size.x - margin * 2.0, 660.0)
	var equipment_height: float = minf(panel_available_height, 430.0)
	equipment_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), equipment_width)
	equipment_height = maxf(minf(340.0, panel_available_height), equipment_height)
	var equipment_panel_y = minf(maxf(panel_top_y, (viewport_size.y - equipment_height) * 0.5), viewport_size.y - equipment_height - margin)
	equipment_panel.position = Vector2((viewport_size.x - equipment_width) * 0.5, equipment_panel_y)
	equipment_panel.size = Vector2(equipment_width, equipment_height)
	if battle_active:
		equipment_panel.visible = false
	if equipment_panel.visible and action_bar != null:
		action_bar.visible = false

	var synthesis_width: float = minf(viewport_size.x - margin * 2.0, 820.0)
	var synthesis_height: float = minf(panel_available_height, 540.0)
	synthesis_width = maxf(minf(620.0, viewport_size.x - margin * 2.0), synthesis_width)
	synthesis_height = maxf(minf(420.0, panel_available_height), synthesis_height)
	var synthesis_panel_y = minf(maxf(panel_top_y, (viewport_size.y - synthesis_height) * 0.5), viewport_size.y - synthesis_height - margin)
	equipment_synthesis_panel.position = Vector2((viewport_size.x - synthesis_width) * 0.5, synthesis_panel_y)
	equipment_synthesis_panel.size = Vector2(synthesis_width, synthesis_height)
	if battle_active:
		equipment_synthesis_panel.visible = false
	if equipment_synthesis_panel.visible and action_bar != null:
		action_bar.visible = false

	if equipment_detail_popup_panel != null:
		var detail_popup_size := Vector2(minf(380.0, viewport_size.x - margin * 2.0), minf(330.0, viewport_size.y - margin * 2.0))
		equipment_detail_popup_panel.size = detail_popup_size
		if equipment_detail_popup_panel.visible:
			equipment_detail_popup_panel.position = Vector2(
				clampf(equipment_detail_popup_panel.position.x, margin, maxf(margin, viewport_size.x - detail_popup_size.x - margin)),
				clampf(equipment_detail_popup_panel.position.y, margin, maxf(margin, viewport_size.y - detail_popup_size.y - margin))
			)

	var shop_width: float = minf(viewport_size.x - margin * 2.0, 940.0)
	var shop_height: float = minf(panel_available_height, 620.0)
	shop_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), shop_width)
	shop_height = maxf(minf(PET_PANEL_MIN_SIZE.y, panel_available_height), shop_height)
	var shop_panel_y = minf(maxf(panel_top_y, (viewport_size.y - shop_height) * 0.5), viewport_size.y - shop_height - margin)
	shop_panel.position = Vector2((viewport_size.x - shop_width) * 0.5, shop_panel_y)
	shop_panel.size = Vector2(shop_width, shop_height)
	if battle_active:
		shop_panel.visible = false
	if shop_panel.visible and action_bar != null:
		action_bar.visible = false

	var pet_management_width: float = minf(viewport_size.x - margin * 2.0, PET_MANAGEMENT_PANEL_MAX_SIZE.x)
	var pet_management_height: float = minf(panel_available_height, PET_MANAGEMENT_PANEL_MAX_SIZE.y)
	pet_management_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), pet_management_width)
	pet_management_height = maxf(minf(PET_PANEL_MIN_SIZE.y, panel_available_height), pet_management_height)
	var pet_management_panel_y = minf(maxf(panel_top_y, (viewport_size.y - pet_management_height) * 0.5), viewport_size.y - pet_management_height - margin)
	pet_panel.position = Vector2((viewport_size.x - pet_management_width) * 0.5, pet_management_panel_y)
	pet_panel.size = Vector2(pet_management_width, pet_management_height)
	if battle_active:
		pet_panel.visible = false
	if pet_panel.visible and action_bar != null:
		action_bar.visible = false

	pet_skill_panel.position = Vector2((viewport_size.x - pet_width) * 0.5, pet_panel_y)
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
	codex_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, pet_panel_y)
	codex_panel.size = Vector2(codex_width, codex_height)
	if codex_panel.visible and action_bar != null:
		action_bar.visible = false

	quest_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, pet_panel_y)
	quest_panel.size = Vector2(codex_width, codex_height)
	if quest_panel.visible and action_bar != null:
		action_bar.visible = false

	map_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, pet_panel_y)
	map_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		map_panel.visible = false
	if map_panel.visible and action_bar != null:
		action_bar.visible = false

	chat_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, pet_panel_y)
	chat_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		chat_panel.visible = false
	if chat_panel.visible and action_bar != null:
		action_bar.visible = false

	party_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, pet_panel_y)
	party_panel.size = Vector2(codex_width, codex_height)
	if battle_active:
		party_panel.visible = false
	if party_panel.visible and action_bar != null:
		action_bar.visible = false

	if family_panel != null:
		var family_width: float = minf(viewport_size.x - margin * 2.0, 860.0)
		var family_height: float = minf(panel_available_height, 560.0)
		family_width = maxf(minf(420.0, viewport_size.x - margin * 2.0), family_width)
		family_height = maxf(minf(330.0, panel_available_height), family_height)
		var family_panel_y = minf(maxf(panel_top_y, (viewport_size.y - family_height) * 0.5), viewport_size.y - family_height - margin)
		family_panel.position = Vector2((viewport_size.x - family_width) * 0.5, family_panel_y)
		family_panel.size = Vector2(family_width, family_height)
		if battle_active:
			family_panel.visible = false
		if family_panel.visible and action_bar != null:
			action_bar.visible = false

	var player_action_width: float = minf(viewport_size.x - margin * 2.0, 430.0)
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

	if party_invite_panel != null:
		var party_invite_width: float = minf(viewport_size.x - margin * 2.0, 402.0)
		var party_invite_height := 194.0
		var party_invite_y := maxf(margin + 72.0, (viewport_size.y - party_invite_height) * 0.32)
		if battle_invite_panel != null and battle_invite_panel.visible:
			party_invite_y = minf(viewport_size.y - party_invite_height - margin, battle_invite_panel.position.y + battle_invite_panel.size.y + 10.0)
		party_invite_panel.position = Vector2((viewport_size.x - party_invite_width) * 0.5, party_invite_y)
		party_invite_panel.size = Vector2(party_invite_width, party_invite_height)
		if party_invite_panel.visible and action_bar != null:
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

	if mailbox_panel != null:
		mailbox_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
		mailbox_panel.size = Vector2(codex_width, codex_height)
		if battle_active:
			mailbox_panel.visible = false
		if mailbox_panel.visible and action_bar != null:
			action_bar.visible = false

	if market_panel != null:
		var market_width: float = minf(viewport_size.x - margin * 2.0, 760.0)
		var market_height: float = minf(panel_available_height, 520.0)
		market_width = maxf(minf(520.0, viewport_size.x - margin * 2.0), market_width)
		market_height = maxf(minf(380.0, panel_available_height), market_height)
		var market_panel_y = minf(maxf(panel_top_y, (viewport_size.y - market_height) * 0.5), viewport_size.y - market_height - margin)
		market_panel.position = Vector2((viewport_size.x - market_width) * 0.5, market_panel_y)
		market_panel.size = Vector2(market_width, market_height)
		if battle_active:
			market_panel.visible = false
		if market_panel.visible and action_bar != null:
			action_bar.visible = false
		if market_panel.visible and not battle_active:
			if top_panel != null:
				top_panel.visible = false
			if side_panel != null:
				side_panel.visible = false
			if party_roster_panel != null:
				party_roster_panel.visible = false
			if battle_message_panel != null:
				battle_message_panel.visible = false

		if bank_panel != null:
			var bank_width: float = minf(viewport_size.x - margin * 2.0, 1120.0)
			var bank_height: float = minf(panel_available_height, 620.0)
			bank_width = maxf(minf(PET_PANEL_MIN_SIZE.x, viewport_size.x - margin * 2.0), bank_width)
			bank_height = maxf(minf(PET_PANEL_MIN_SIZE.y, panel_available_height), bank_height)
			var bank_panel_y = minf(maxf(panel_top_y, (viewport_size.y - bank_height) * 0.5), viewport_size.y - bank_height - margin)
			bank_panel.position = Vector2((viewport_size.x - bank_width) * 0.5, bank_panel_y)
			bank_panel.size = Vector2(bank_width, bank_height)
			if battle_active:
				bank_panel.visible = false
			if bank_panel.visible and action_bar != null:
				action_bar.visible = false

	if training_partner_panel != null:
		training_partner_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
		training_partner_panel.size = Vector2(codex_width, codex_height)
		if battle_active:
			training_partner_panel.visible = false
		if training_partner_panel.visible and action_bar != null:
			action_bar.visible = false

	auto_settings_panel.position = Vector2((viewport_size.x - codex_width) * 0.5, maxf(margin + 68.0, (viewport_size.y - codex_height) * 0.5))
	auto_settings_panel.size = Vector2(codex_width, codex_height)
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
	if battle_active and action_bar != null and action_bar.visible and not action_bar_collapsed and not is_phone_shape:
		message_width = minf(message_width, maxf(300.0, action_bar.position.x - margin * 2.0 - 8.0))
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
		if account_panel.visible:
			top_panel.visible = false
			side_panel.visible = false
			action_bar.visible = false
			battle_message_panel.visible = false
			if battle_command_panel != null:
				battle_command_panel.visible = false
			if battle_auto_stop_button != null:
				battle_auto_stop_button.visible = false

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
	var status_text := ""
	var detail_text := ""
	if battle_active:
		status_text = "万兽纪元  |  %s" % [move_name]
	elif is_phone_shape:
		status_text = "万兽纪元  |  %s" % [move_name]
	else:
		status_text = "万兽纪元  |  %s  |  %s  |  %s" % [str(map_data.get("name", "未知地图")), layout_name, move_name]
		detail_text = AdventureGoalPresenter.world_hud_text(
			task_tracker_hud_prefix_cache,
			player_cell,
			_effective_training_partner_count(),
			_training_partner_available_slots(),
		)
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
	_sync_world_hud_signature_after_text_update()


func _sync_world_hud_signature_after_text_update() -> void:
	if status_label == null or player == null or map_data.is_empty():
		return
	world_hud_signature_cache = _world_hud_signature()
	world_hud_refresh_elapsed = 0.0


func _layout_size() -> Vector2:
	return get_viewport_rect().size


func _is_phone_shape(size: Vector2) -> bool:
	return minf(size.x, size.y) < 520.0 or size.x < 760.0 or size.y > size.x


func _client_version_label_text() -> String:
	return "版本 %s" % ServerAuthClientModel.CLIENT_VERSION


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
	if player == null:
		return "准备中"
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
		if position.has("hasCell") and not bool(position.get("hasCell", false)):
			continue
		if str(position.get("precision", "")).strip_edges().to_lower() == "map":
			continue
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


func _online_remote_player_at_screen_point(screen_point: Vector2, ui_checked: bool = false) -> Dictionary:
	if not _is_server_account_session() or online_position_remote_players.is_empty() or map_data.is_empty() or (not ui_checked and _is_ui_point(screen_point)):
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
		if position.has("hasCell") and not bool(position.get("hasCell", false)):
			continue
		if str(position.get("precision", "")).strip_edges().to_lower() == "map":
			continue
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
	pos += _battle_actor_escape_preview_offset(actor_id, side, visual_scale)
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


func _battle_float_text_draw_width(font: Font, text: String, font_size: int = BATTLE_FLOAT_TEXT_FONT_SIZE) -> float:
	var text_width := _font_text_width(font, text, font_size)
	var max_width := maxf(BATTLE_FLOAT_TEXT_MIN_WIDTH, _layout_size().x - BATTLE_FLOAT_TEXT_HORIZONTAL_PADDING * 2.0)
	return clampf(float(ceil(text_width + BATTLE_FLOAT_TEXT_HORIZONTAL_PADDING * 2.0)), BATTLE_FLOAT_TEXT_MIN_WIDTH, max_width)


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
		var font_size := BATTLE_FLOAT_TEXT_FONT_SIZE
		var text_width := _battle_float_text_draw_width(font, text, font_size)
		var origin := position + Vector2(-text_width * 0.5, -1.0)
		draw_string(font, origin + Vector2(1.0, 1.0), text, HORIZONTAL_ALIGNMENT_CENTER, text_width, font_size, Color(0.08, 0.08, 0.06, color.a * 0.85))
		draw_string(font, origin, text, HORIZONTAL_ALIGNMENT_CENTER, text_width, font_size, color)


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

func _battle_actor_escape_preview_offset(actor_id: String, side: String, visual_scale: float) -> Vector2:
	if battle_escape_preview_started_msec <= 0 or not battle_escape_preview_actor_ids.has(actor_id):
		return Vector2.ZERO
	var age_seconds := float(Time.get_ticks_msec() - battle_escape_preview_started_msec) / 1000.0
	if age_seconds < 0.0:
		return Vector2.ZERO
	var progress := _smooth_unit(clampf(age_seconds / BATTLE_ESCAPE_PREVIEW_SECONDS, 0.0, 1.0))
	var direction := Vector2(1.0, 0.36) if side == BattleModel.SIDE_ALLY else Vector2(-1.0, -0.36)
	return direction.normalized() * BATTLE_ESCAPE_PREVIEW_DISTANCE * visual_scale * progress


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


func _compute_quest_marker_state_for_item(item: Dictionary, available_quest: Dictionary = {}, blocked_quest: Dictionary = {}, normalized_profile: Dictionary = {}) -> String:
	var item_id := str(item.get("id", ""))
	if item_id == "":
		return QUEST_MARKER_NONE
	var marker_profile := normalized_profile if not normalized_profile.is_empty() else PlayerProgressModel.normalize_profile(player_profile)
	var mm_guide_marker := _pet_rebirth_mm_guide_marker_state_for_item(item_id, marker_profile)
	if mm_guide_marker != QUEST_MARKER_NONE:
		return mm_guide_marker
	if item_id == "firebud_pet_mm_stage2_keeper":
		return QUEST_MARKER_NONE if bool(marker_profile.get(PlayerProgressModel.PET_REBIRTH_MM_STAGE2_CLAIMED_KEY, false)) else QUEST_MARKER_AVAILABLE
	var rebirth_marker_state := _rebirth_mentor_marker_state(item_id)
	if rebirth_marker_state != QUEST_MARKER_NONE:
		return rebirth_marker_state
	var quest := PlayerProgressModel.active_quest(marker_profile, true)
	if not quest.is_empty():
		var state := PlayerProgressModel.active_quest_state(marker_profile, true)
		var status := str(state.get("status", QuestModel.STATUS_ACTIVE))
		if status == QuestModel.STATUS_READY and QuestModel.turn_in_id_for(quest) == item_id:
			return QUEST_MARKER_READY
		if status == QuestModel.STATUS_ACTIVE:
			var objective := QuestModel.objective_for(quest)
			if str(objective.get("type", "")) == "talk" and str(objective.get("targetId", QuestModel.turn_in_id_for(quest))) == item_id:
				return QUEST_MARKER_IN_PROGRESS
			if QuestModel.turn_in_id_for(quest) == item_id:
				return QUEST_MARKER_IN_PROGRESS
	var optional_state := _optional_quest_marker_state_for_item(item, marker_profile)
	if optional_state != QUEST_MARKER_NONE:
		return optional_state
	if not quest.is_empty():
		return QUEST_MARKER_NONE
	if not available_quest.is_empty() and QuestModel.giver_id_for(available_quest) == item_id:
		return QUEST_MARKER_AVAILABLE
	if not blocked_quest.is_empty() and QuestModel.giver_id_for(blocked_quest) == item_id:
		return QUEST_MARKER_BLOCKED
	return QUEST_MARKER_NONE


func _pet_rebirth_mm_guide_marker_state_for_item(item_id: String, normalized_profile: Dictionary = {}) -> String:
	var marker_profile := normalized_profile if not normalized_profile.is_empty() else PlayerProgressModel.normalize_profile(player_profile)
	var info := PlayerProgressModel.pet_rebirth_mm_guide_info(marker_profile, true)
	var status := str(info.get("status", ""))
	var step := str(info.get("step", ""))
	if item_id == "firebud_pet_mm_trial_mentor":
		if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED:
			return QUEST_MARKER_REPEATABLE if bool(info.get("meetsRequiredLevel", false)) else QUEST_MARKER_BLOCKED
		if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE:
			return QUEST_MARKER_AVAILABLE if bool(info.get("meetsRequiredLevel", false)) else QUEST_MARKER_BLOCKED
		if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE and step == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_CLAIM_MM:
			return QUEST_MARKER_IN_PROGRESS if bool(info.get("meetsRequiredLevel", false)) else QUEST_MARKER_BLOCKED
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


func _optional_quest_marker_state_for_item(item: Dictionary, normalized_profile: Dictionary = {}) -> String:
	var item_id := str(item.get("id", ""))
	if item_id == "":
		return QUEST_MARKER_NONE
	var marker_profile := normalized_profile if not normalized_profile.is_empty() else PlayerProgressModel.normalize_profile(player_profile)
	var optional_quest := PlayerProgressModel.optional_quest_for_interaction(marker_profile, item_id, true)
	if not optional_quest.is_empty():
		var quest_id := str(optional_quest.get("id", ""))
		var raw_states = marker_profile.get(PlayerProgressModel.QUEST_STATES_KEY, {})
		var has_quest_state := raw_states is Dictionary and (raw_states as Dictionary).has(quest_id)
		if not has_quest_state:
			return QUEST_MARKER_AVAILABLE
		var state := PlayerProgressModel.quest_state_for_id(marker_profile, quest_id, true)
		var status := str(state.get("status", QuestModel.STATUS_ACTIVE))
		if status == QuestModel.STATUS_READY and QuestModel.turn_in_id_for(optional_quest) == item_id:
			return QUEST_MARKER_READY
		if status == QuestModel.STATUS_ACTIVE:
			var objective := QuestModel.objective_for(optional_quest)
			if str(objective.get("type", "")) == "talk" and str(objective.get("targetId", QuestModel.turn_in_id_for(optional_quest))) == item_id:
				return QUEST_MARKER_IN_PROGRESS
			if QuestModel.turn_in_id_for(optional_quest) == item_id:
				return QUEST_MARKER_IN_PROGRESS
	var blocked_quest := PlayerProgressModel.blocked_optional_quest_for_interaction(marker_profile, item_id, true)
	if not blocked_quest.is_empty():
		return QUEST_MARKER_BLOCKED
	return QUEST_MARKER_NONE


func _first_available_unfinished_quest_for_marker(normalized_profile: Dictionary = {}) -> Dictionary:
	var marker_profile := normalized_profile if not normalized_profile.is_empty() else PlayerProgressModel.normalize_profile(player_profile)
	return PlayerProgressModel.first_available_unfinished_quest(marker_profile, true)


func _first_blocked_unfinished_quest_for_marker(normalized_profile: Dictionary = {}) -> Dictionary:
	var marker_profile := normalized_profile if not normalized_profile.is_empty() else PlayerProgressModel.normalize_profile(player_profile)
	return PlayerProgressModel.first_blocked_unfinished_quest(marker_profile, true)


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
