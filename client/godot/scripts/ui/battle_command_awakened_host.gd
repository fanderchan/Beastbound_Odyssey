extends RefCounted

const Presenter := preload("res://scripts/ui/battle_command_awakened_presenter.gd")
const View := preload("res://scripts/ui/battle_command_awakened_view.gd")
const FunctionDrawer := preload("res://scripts/ui/battle_function_drawer.gd")
const AutoBattleSettingsModel := preload(
	"res://scripts/progression/auto_battle_settings_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

# Every synthetic caption below delegates to an existing host/server contract.
# The view never invents a client-only battle command.
const PET_SHORTCUT_CONTRACT := {
	"skill": "opens_existing_pet_skill_slots",
	"attack": "existing_pet_slot_with_command_attack",
	"recall": "existing_pet_help_back_to_player",
	"escape": "existing_pet_help_then_player_run",
	"assist": "unavailable_without_authoritative_assist_command",
	"return": "existing_pet_help_then_player_switch_pet",
	"defend": "existing_pet_slot_with_command_defend",
	"auto": "existing_auto_battle_state",
}

var _host: Node
var _view
var _drawer
var _layout_viewport_size := Vector2(-1.0, -1.0)
var _layout_battle_active := false
var _layout_overlay_open := false
var _auto_payload_revision := -1


func _init(host_node: Node) -> void:
	_host = host_node


func mount() -> bool:
	if _host == null or _host.hud_root == null:
		return false
	_mount_command_view()
	_mount_function_drawer()
	return _view != null and _drawer != null


func command_view():
	return _view


func function_drawer():
	return _drawer


func shortcut_contract_snapshot() -> Dictionary:
	return PET_SHORTCUT_CONTRACT.duplicate(true)


func sync_command_layout(owner: String, visible_ids: Array, ordered_ids: Array) -> bool:
	if _view == null:
		return false
	_view.apply_command_state(owner, visible_ids, ordered_ids)
	var next_minimum_size := Presenter.recommended_size(_host._layout_size())
	if not _view.custom_minimum_size.is_equal_approx(next_minimum_size):
		_view.custom_minimum_size = next_minimum_size
	return true


func sync_auto_state() -> bool:
	if _view == null:
		return false
	var payload: Dictionary = _host._battle_auto_ui_payload()
	var payload_revision := int(payload.get("revision", -1))
	if payload_revision != _auto_payload_revision:
		_view.configure_auto_strategy(
			payload.get("settings", {}) as Dictionary,
			payload.get("playerOptions", []) as Array,
			payload.get("petOptions", []) as Array
		)
		_auto_payload_revision = payload_revision
	_view.set_auto_enabled(_host.battle_auto_attack_enabled)
	if _view.auto_button().button_pressed != _host.battle_auto_attack_enabled:
		_view.auto_button().button_pressed = _host.battle_auto_attack_enabled
	return true


func sync_enabled_state() -> void:
	if _view == null:
		return
	_view.set_interaction_state(
		_host.battle_active,
		_host._battle_commands_locked()
	)
	_view.sync_enabled_state()


func needs_world_layout_reset() -> bool:
	return _layout_battle_active


func apply_layout(viewport_size: Vector2, overlay_open: bool) -> void:
	var battle_active: bool = _host.battle_active
	if (
		viewport_size.is_equal_approx(_layout_viewport_size)
		and battle_active == _layout_battle_active
		and overlay_open == _layout_overlay_open
	):
		return
	_layout_viewport_size = viewport_size
	_layout_battle_active = battle_active
	_layout_overlay_open = overlay_open
	if _view != null:
		var view_size := Presenter.recommended_size(viewport_size)
		_view.size = view_size
		_view.position = Vector2(
			maxf(12.0, viewport_size.x - view_size.x - 18.0),
			maxf(12.0, viewport_size.y - view_size.y - 18.0)
		)
		_view.refresh_layout()
	if _drawer != null:
		_drawer.apply_state(
			viewport_size,
			_host.battle_active,
			overlay_open
		)


func recommended_size(viewport_size: Vector2) -> Vector2:
	return Presenter.recommended_size(viewport_size)


func point_overlaps(global_point: Vector2) -> bool:
	if _drawer != null and _drawer.point_overlaps_active_control(global_point):
		return true
	return (
		_view != null
		and _view.is_visible_in_tree()
		and _view.point_overlaps_active_control(global_point)
	)


func _mount_command_view() -> void:
	if _view != null:
		return
	var legacy_panel: Control = _host.battle_command_panel
	var legacy_stop_button: Control = _host.battle_auto_stop_button
	if _host.panel_registry != null:
		_host.panel_registry.remove_input_blocker(legacy_panel)
		_host.panel_registry.remove_input_blocker(legacy_stop_button)

	_view = View.new()
	_view.name = "BattleCommandAwakenedView"
	_view.z_index = 31
	_view.visible = false
	_view.size = Presenter.recommended_size(_host._layout_size())
	_view.command_pressed.connect(Callable(_host, "_on_battle_command_pressed"))
	_view.pet_shortcut_pressed.connect(_on_pet_shortcut_pressed)
	_view.auto_strategy_changed.connect(_on_auto_strategy_changed)
	_host.hud_root.add_child(_view)
	_view.configure_command_buttons(_host.battle_command_buttons)
	_view.auto_button().pressed.connect(_on_auto_pressed)

	_host.battle_command_awakened_view = _view
	_host.battle_command_panel = _view
	_host.battle_command_title_label = _view.title_label()
	_host.battle_capture_capacity_label = _view.capture_capacity_label()
	_host.battle_auto_button = _view.auto_button()
	_host.battle_command_button_grid = _view.contract_grid()
	_host.battle_command_buttons = _view.command_buttons()
	_host.battle_auto_stop_button = null

	if _host.panel_registry != null:
		for blocker in _view.input_blockers():
			_host.panel_registry.add_input_blocker(blocker)
	if legacy_panel != null:
		legacy_panel.queue_free()
	if legacy_stop_button != null:
		legacy_stop_button.queue_free()


func _mount_function_drawer() -> void:
	if _drawer != null:
		return
	_drawer = FunctionDrawer.new()
	_drawer.name = "BattleFunctionDrawer"
	_drawer.z_index = 32
	_drawer.visible = false
	_host.hud_root.add_child(_drawer)
	_drawer.configure_source_buttons({
		"backpack": _host.bag_menu_button,
		"character": _host.player_status_menu_button,
		"pet": _host.pet_menu_button,
		"codex": _host.codex_menu_button,
		"equipment": _host.equipment_menu_button,
		"quest": _host.quest_menu_button,
		"family": _host.family_menu_button,
		"party": _host.party_menu_button,
		"mailbox": _host.mailbox_menu_button,
		"market": _host.market_menu_button,
		"auto": _host.auto_settings_menu_button,
		"account": _host.account_menu_button,
	})
	_host.battle_function_drawer = _drawer
	if _host.panel_registry != null:
		for blocker in _drawer.input_blockers():
			_host.panel_registry.add_input_blocker(blocker)


func _on_auto_pressed() -> void:
	if not _host.battle_active:
		return
	_host._set_battle_auto_attack_enabled(
		not _host.battle_auto_attack_enabled
	)


func _on_auto_strategy_changed(
	actor_kind: String,
	first_value,
	normal_value
) -> void:
	var settings: Dictionary = _host._battle_auto_settings()
	if actor_kind == "pet":
		settings[AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY] = (
			AutoBattleSettingsModel.normalized_pet_skill_slot(first_value)
		)
		settings[AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY] = (
			AutoBattleSettingsModel.normalized_pet_skill_slot(normal_value)
		)
	else:
		settings[AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY] = (
			AutoBattleSettingsModel.normalized_player_action_id(str(first_value))
		)
		settings[AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY] = (
			AutoBattleSettingsModel.normalized_player_action_id(str(normal_value))
		)
	_host.player_profile = PlayerProgressModel.with_auto_battle_settings(
		_host.player_profile,
		settings
	)
	_host._mark_progress_ui_caches_dirty()
	if _host.profile_save_enabled:
		_host._save_player_profile_now()
	sync_auto_state()
	_host._set_battle_message(
		"%s自动策略已更新。" % ("宠物" if actor_kind == "pet" else "人物")
	)


func _on_pet_shortcut_pressed(shortcut_id: String) -> void:
	if not _host.battle_active or _host._battle_commands_locked():
		return
	match shortcut_id:
		"managed":
			_host._set_battle_message("当前战斗尚未配置托管位。")
		"assist":
			_host._set_battle_message("当前编队没有可触发的援助技。")
		"recall":
			if _host.battle_command_owner == "pet":
				_host._on_pet_battle_command_pressed("help")
		"escape":
			if _host.battle_command_owner == "pet":
				_host._on_pet_battle_command_pressed("help")
			if _host.battle_command_owner == "player":
				_host._on_battle_command_pressed("run")
		"return":
			if _host.battle_command_owner == "pet":
				_host._on_pet_battle_command_pressed("help")
			if _host.battle_command_owner == "player":
				_host._open_switch_pet_command_menu()
		"attack", "defend":
			var command_id := _pet_command_id_for_action(shortcut_id)
			if command_id == "":
				_host._set_battle_message(
					"当前宠物没有可用的%s指令。"
					% ("攻击" if shortcut_id == "attack" else "防御")
				)
			else:
				_host._on_battle_command_pressed(command_id)


func _pet_command_id_for_action(action_command: String) -> String:
	for command_id in ["attack", "spirit", "capture", "defend", "item", "switch_pet", "run"]:
		var action: Dictionary = _host._controlled_pet_skill_action_for_slot(
			_host._pet_skill_slot_for_command(command_id)
		)
		if str(action.get("command", "")) == action_command:
			return command_id
	return ""
