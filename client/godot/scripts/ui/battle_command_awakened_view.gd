extends PanelContainer

signal command_pressed(command_id: String)
signal pet_shortcut_pressed(shortcut_id: String)
signal auto_strategy_changed(actor_kind: String, first_value, normal_value)

const Presenter := preload("res://scripts/ui/battle_command_awakened_presenter.gd")
const VisualSkin := preload("res://scripts/ui/battle_command_awakened_visual_skin.gd")

const PLAYER_ICONS := {
	"attack": "attack",
	"spirit": "spirit",
	"item": "item",
	"run": "escape",
	"help": "assist",
	"capture": "capture",
	"switch_pet": "summon",
	"defend": "defend",
}

var _owner := "player"
var _auto_enabled := false
var _pet_skill_menu_open := false
var _visible_ids: Array = []
var _ordered_ids: Array = []
var _command_buttons: Dictionary = {}
var _button_parts: Dictionary = {}
var _active_controls: Array[Control] = []
var _strategy_actor_kind := "player"
var _strategy_populating := false
var _strategy_signature := ""
var _player_options: Array[Dictionary] = []
var _pet_options: Array[Dictionary] = []
var _settings: Dictionary = {}
var _battle_active := false
var _commands_locked := true
var _applied_layout_signature := ""
var _layout_apply_count := 0
var _layout_skip_count := 0
var _button_medallion_kinds: Dictionary = {}
var _medallion_styles: Dictionary = {}
var _command_label_accents: Dictionary = {}

var _command_layer: Control
var _contract_grid: GridContainer
var _title_label: Label
var _capture_capacity_label: Label
var _submenu_panel: PanelContainer
var _strategy_panel: PanelContainer
var _strategy_title: Label
var _strategy_first_option: OptionButton
var _strategy_normal_option: OptionButton
var _strategy_close_button: Button
var _auto_summary_label: Label
var _auto_button: Button
var _auto_player_button: Button
var _auto_pet_button: Button
var _managed_button: Button
var _pet_skill_button: Button
var _pet_attack_button: Button
var _pet_recall_button: Button
var _pet_escape_button: Button
var _pet_assist_button: Button
var _pet_return_button: Button
var _pet_defend_button: Button
var _pet_skill_back_button: Button


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = false
	add_theme_stylebox_override("panel", VisualSkin.transparent_panel_style())
	_build_view()


func configure_command_buttons(buttons: Dictionary) -> void:
	_command_buttons = buttons
	for command_id in _command_buttons.keys():
		var button := _command_buttons[command_id] as Button
		if button == null:
			continue
		if button.get_parent() != null:
			button.get_parent().remove_child(button)
		# The legacy GridContainer assigned a 70px player minimum. Once this
		# focused view owns the button, Presenter is the sole size authority;
		# retaining that minimum widens 68px slots and overlaps their neighbours.
		button.custom_minimum_size = Vector2.ZERO
		_command_layer.add_child(button)
		_prepare_button(button, str(button.text), str(PLAYER_ICONS.get(command_id, "attack")))
		# Legacy buttons already point at the host. Disconnect all existing
		# pressed callbacks before routing through this focused view once.
		for connection in button.pressed.get_connections():
			var callback := connection.get("callable", Callable()) as Callable
			if callback.is_valid():
				button.pressed.disconnect(callback)
		button.pressed.connect(_emit_command.bind(str(command_id)))
	apply_command_state(_owner, _command_buttons.keys(), _command_buttons.keys())


func command_buttons() -> Dictionary:
	return _command_buttons


func contract_grid() -> GridContainer:
	return _contract_grid


func title_label() -> Label:
	return _title_label


func capture_capacity_label() -> Label:
	return _capture_capacity_label


func auto_button() -> Button:
	return _auto_button


func auto_player_button() -> Button:
	return _auto_player_button


func auto_pet_button() -> Button:
	return _auto_pet_button


func pet_skill_button() -> Button:
	return _pet_skill_button


func synthetic_button(shortcut_id: String) -> Button:
	match shortcut_id:
		"managed": return _managed_button
		"auto": return _auto_button
		"auto_player": return _auto_player_button
		"auto_pet": return _auto_pet_button
		"skill": return _pet_skill_button
		"attack": return _pet_attack_button
		"recall": return _pet_recall_button
		"escape": return _pet_escape_button
		"assist": return _pet_assist_button
		"return": return _pet_return_button
		"defend": return _pet_defend_button
		"skill_back": return _pet_skill_back_button
		_: return null


func visible_button_with_label(label_text: String) -> Button:
	for control in _active_controls:
		if not (control is Button) or not control.is_visible_in_tree():
			continue
		var button := control as Button
		var parts := _button_parts.get(button, {}) as Dictionary
		var label := parts.get("label", null) as Label
		if label != null and label.text == label_text:
			return button
	return null


func strategy_first_option() -> OptionButton:
	return _strategy_first_option


func strategy_close_button() -> Button:
	return _strategy_close_button


func input_blockers() -> Array[Control]:
	var result: Array[Control] = []
	for control in _all_interactive_controls():
		if control != null and not result.has(control):
			result.append(control)
	for panel in [_submenu_panel, _strategy_panel]:
		if panel != null and not result.has(panel):
			result.append(panel)
	return result


func apply_command_state(owner: String, visible_ids: Array, ordered_ids: Array) -> void:
	_owner = owner
	_visible_ids = visible_ids.duplicate()
	_ordered_ids = ordered_ids.duplicate()
	if owner != "pet":
		_pet_skill_menu_open = false
	var next_signature := _command_layout_signature()
	if next_signature == _applied_layout_signature:
		_layout_skip_count += 1
		return
	_applied_layout_signature = next_signature
	_layout_apply_count += 1
	_contract_grid.columns = 1 if owner != "player" else 4
	_sync_command_labels()
	_hide_all_controls()
	if _auto_enabled:
		_apply_auto_layout()
	elif owner == "player":
		_apply_player_layout(visible_ids)
	elif owner == "pet":
		_apply_pet_layout(visible_ids, ordered_ids)
	else:
		_apply_submenu_layout(visible_ids, ordered_ids)
	_sync_disabled_visuals()


func set_auto_enabled(enabled: bool) -> void:
	_auto_enabled = enabled
	_auto_button.text = "取消" if enabled else "自动"
	_set_button_content(_auto_button, _auto_button.text, "cancel" if enabled else "auto")
	if not enabled and _strategy_panel.visible:
		_close_strategy()
	apply_command_state(_owner, _visible_ids, _ordered_ids)


func refresh_layout() -> void:
	_applied_layout_signature = ""
	apply_command_state(_owner, _visible_ids, _ordered_ids)


func configure_auto_strategy(
	settings: Dictionary,
	player_options: Array[Dictionary],
	pet_options: Array[Dictionary]
) -> void:
	_settings = settings.duplicate(true)
	_player_options = player_options.duplicate(true)
	_pet_options = pet_options.duplicate(true)
	var signature := JSON.stringify([_settings, _player_options, _pet_options])
	if signature != _strategy_signature:
		_strategy_signature = signature
		if _strategy_panel.visible:
			_populate_strategy_options(_strategy_actor_kind)
	_refresh_auto_summary()


func sync_enabled_state() -> void:
	_sync_disabled_visuals()


func set_command_label_accents(accents: Dictionary) -> void:
	_command_label_accents = accents.duplicate(true)
	_sync_command_label_accents()


func set_interaction_state(battle_active: bool, commands_locked: bool) -> void:
	_battle_active = battle_active
	_commands_locked = commands_locked
	_sync_disabled_visuals()


func point_overlaps_active_control(global_point: Vector2) -> bool:
	for control in _active_controls:
		if control != null and control.visible and control.get_global_rect().has_point(global_point):
			return true
	if _strategy_panel.visible and _strategy_panel.get_global_rect().has_point(global_point):
		return true
	if _submenu_panel.visible and _submenu_panel.get_global_rect().has_point(global_point):
		return true
	return false


func active_controls_overlap_rect(global_rect: Rect2) -> bool:
	for control in _active_controls:
		if control != null and control.is_visible_in_tree() and control.get_global_rect().intersects(global_rect):
			return true
	for panel in [_strategy_panel, _submenu_panel]:
		if panel != null and panel.is_visible_in_tree() and panel.get_global_rect().intersects(global_rect):
			return true
	return false


func snapshot() -> Dictionary:
	var visible_labels: Array[String] = []
	var touch_targets_ok := true
	var icons_ok := true
	var compact_label_bounds_ok := true
	var labels_clip_text := true
	for control in _active_controls:
		if not (control is Button) or not control.visible:
			continue
		var button := control as Button
		var parts := _button_parts.get(button, {}) as Dictionary
		var label := parts.get("label", null) as Label
		var icon_rect := parts.get("icon", null) as TextureRect
		if label != null and label.text != "":
			visible_labels.append(label.text)
			if _owner != "player":
				compact_label_bounds_ok = (
					compact_label_bounds_ok
					and Rect2(Vector2.ZERO, button.size).encloses(
						Rect2(label.position, label.size)
					)
				)
				labels_clip_text = labels_clip_text and label.clip_text
		touch_targets_ok = touch_targets_ok and button.size.x >= 60.0 and button.size.y >= 60.0
		icons_ok = icons_ok and icon_rect != null and icon_rect.texture != null
	return {
		"owner": _owner,
		"autoEnabled": _auto_enabled,
		"petSkillMenuOpen": _pet_skill_menu_open,
		"strategyVisible": _strategy_panel.visible,
		"strategyActor": _strategy_actor_kind,
		"visibleLabels": visible_labels,
		"touchTargetsOk": touch_targets_ok,
		"iconsOk": icons_ok,
		"compactLabelBoundsOk": compact_label_bounds_ok,
		"labelsClipText": labels_clip_text,
		"activeButtonCount": visible_labels.size(),
		"panelSize": size,
		"layoutApplyCount": _layout_apply_count,
		"layoutSkipCount": _layout_skip_count,
		"medallionStyleResourceCount": _medallion_styles.size(),
		"submenuRect": Rect2(_submenu_panel.position, _submenu_panel.size),
	}


func _build_view() -> void:
	_contract_grid = GridContainer.new()
	_contract_grid.name = "BattleCommandLayoutContractGrid"
	_contract_grid.visible = false
	add_child(_contract_grid)

	_command_layer = Control.new()
	_command_layer.name = "BattleCommandLayoutLayer"
	_command_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_command_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_command_layer)

	_title_label = Label.new()
	_title_label.name = "BattleCommandTitle"
	_title_label.text = "人物"
	_title_label.visible = false
	_command_layer.add_child(_title_label)

	_capture_capacity_label = Label.new()
	_capture_capacity_label.name = "BattleCaptureCapacity"
	_capture_capacity_label.text = "随身 0/5、兽栏 0/20"
	_capture_capacity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_capture_capacity_label.add_theme_font_size_override("font_size", 14)
	_capture_capacity_label.add_theme_color_override("font_color", Color("ead08b"))
	_capture_capacity_label.visible = false
	_command_layer.add_child(_capture_capacity_label)

	_submenu_panel = PanelContainer.new()
	_submenu_panel.name = "BattleCommandSubmenu"
	_submenu_panel.visible = false
	_submenu_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_submenu_panel.add_theme_stylebox_override("panel", VisualSkin.submenu_style())
	_command_layer.add_child(_submenu_panel)

	_managed_button = _synthetic_button("managed", "托管", "managed")
	_managed_button.pressed.connect(_emit_pet_shortcut.bind("managed"))
	_auto_button = _synthetic_button("auto", "自动", "auto")
	_auto_button.toggle_mode = true
	_auto_player_button = _synthetic_button("auto_player", "主", "player")
	_auto_player_button.pressed.connect(_open_strategy.bind("player"))
	_auto_pet_button = _synthetic_button("auto_pet", "宠", "pet")
	_auto_pet_button.pressed.connect(_open_strategy.bind("pet"))

	_pet_skill_button = _synthetic_button("pet_skill", "技能", "skill")
	_pet_skill_button.pressed.connect(_open_pet_skill_menu)
	_pet_attack_button = _synthetic_button("pet_attack", "攻击", "attack")
	_pet_attack_button.pressed.connect(_emit_pet_shortcut.bind("attack"))
	_pet_recall_button = _synthetic_button("pet_recall", "撤回", "recall")
	_pet_recall_button.pressed.connect(_emit_pet_shortcut.bind("recall"))
	_pet_escape_button = _synthetic_button("pet_escape", "逃跑", "escape")
	_pet_escape_button.pressed.connect(_emit_pet_shortcut.bind("escape"))
	_pet_assist_button = _synthetic_button("pet_assist", "援助", "assist")
	_pet_assist_button.pressed.connect(_emit_pet_shortcut.bind("assist"))
	_pet_return_button = _synthetic_button("pet_return", "折返", "return")
	_pet_return_button.pressed.connect(_emit_pet_shortcut.bind("return"))
	_pet_defend_button = _synthetic_button("pet_defend", "防御", "defend")
	_pet_defend_button.pressed.connect(_emit_pet_shortcut.bind("defend"))
	_pet_skill_back_button = _synthetic_button("pet_skill_back", "返回", "return")
	_pet_skill_back_button.pressed.connect(_close_pet_skill_menu)

	_auto_summary_label = Label.new()
	_auto_summary_label.name = "BattleAutoSummary"
	_auto_summary_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_auto_summary_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_auto_summary_label.add_theme_font_size_override("font_size", 14)
	_auto_summary_label.add_theme_color_override("font_color", Color("f2d99d"))
	_auto_summary_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	_auto_summary_label.add_theme_constant_override("shadow_offset_x", 1)
	_auto_summary_label.add_theme_constant_override("shadow_offset_y", 2)
	_auto_summary_label.visible = false
	_auto_summary_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_command_layer.add_child(_auto_summary_label)

	_build_strategy_panel()


func _build_strategy_panel() -> void:
	_strategy_panel = PanelContainer.new()
	_strategy_panel.name = "BattleAutoStrategyPopover"
	_strategy_panel.visible = false
	_strategy_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_strategy_panel.add_theme_stylebox_override("panel", VisualSkin.popover_style())
	_command_layer.add_child(_strategy_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	_strategy_panel.add_child(column)
	_strategy_title = Label.new()
	_strategy_title.text = "人物自动策略"
	_strategy_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_strategy_title.add_theme_font_size_override("font_size", 18)
	_strategy_title.add_theme_color_override("font_color", Color("f3d17f"))
	column.add_child(_strategy_title)
	_strategy_first_option = _strategy_option_row(column, "首回合")
	_strategy_normal_option = _strategy_option_row(column, "一般回合")
	_strategy_first_option.item_selected.connect(_on_strategy_option_selected)
	_strategy_normal_option.item_selected.connect(_on_strategy_option_selected)
	_strategy_close_button = Button.new()
	_strategy_close_button.text = "完成"
	_strategy_close_button.custom_minimum_size = Vector2(0, 42)
	_strategy_close_button.add_theme_font_size_override("font_size", 15)
	_strategy_close_button.add_theme_color_override("font_color", Color("f4dfad"))
	_strategy_close_button.add_theme_color_override("font_hover_color", Color.WHITE)
	_strategy_close_button.add_theme_color_override("font_pressed_color", Color.WHITE)
	_strategy_close_button.add_theme_stylebox_override("normal", VisualSkin.strategy_control_style())
	_strategy_close_button.add_theme_stylebox_override("hover", VisualSkin.strategy_control_style("hover"))
	_strategy_close_button.add_theme_stylebox_override("pressed", VisualSkin.strategy_control_style("pressed"))
	_strategy_close_button.pressed.connect(_close_strategy)
	column.add_child(_strategy_close_button)


func _strategy_option_row(parent: VBoxContainer, label_text: String) -> OptionButton:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	parent.add_child(row)
	var label := Label.new()
	label.text = label_text
	label.custom_minimum_size = Vector2(70, 42)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 15)
	row.add_child(label)
	var option := OptionButton.new()
	option.custom_minimum_size = Vector2(196, 42)
	option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option.add_theme_font_size_override("font_size", 14)
	option.add_theme_color_override("font_color", Color("f4e6c8"))
	option.add_theme_color_override("font_hover_color", Color.WHITE)
	option.add_theme_color_override("font_pressed_color", Color.WHITE)
	option.add_theme_stylebox_override("normal", VisualSkin.strategy_control_style())
	option.add_theme_stylebox_override("hover", VisualSkin.strategy_control_style("hover"))
	option.add_theme_stylebox_override("pressed", VisualSkin.strategy_control_style("pressed"))
	row.add_child(option)
	return option


func _synthetic_button(node_name: String, label_text: String, icon_id: String) -> Button:
	var button := Button.new()
	button.name = node_name.to_pascal_case()
	button.text = label_text
	_command_layer.add_child(button)
	_prepare_button(button, label_text, icon_id)
	return button


func _prepare_button(button: Button, label_text: String, icon_id: String) -> void:
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.focus_mode = Control.FOCUS_ALL
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.clip_contents = false
	button.add_theme_color_override("font_color", Color(1, 1, 1, 0))
	button.add_theme_color_override("font_hover_color", Color(1, 1, 1, 0))
	button.add_theme_color_override("font_pressed_color", Color(1, 1, 1, 0))
	button.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0))
	button.add_theme_stylebox_override("normal", VisualSkin.button_overlay_style())
	button.add_theme_stylebox_override("hover", VisualSkin.button_overlay_style(Color(0.96, 0.76, 0.32, 0.10)))
	button.add_theme_stylebox_override("pressed", VisualSkin.button_overlay_style(Color(0.98, 0.72, 0.22, 0.18)))
	button.add_theme_stylebox_override("disabled", VisualSkin.button_overlay_style())
	if _button_parts.has(button):
		_set_button_content(button, label_text, icon_id)
		return
	var medallion := Panel.new()
	medallion.mouse_filter = Control.MOUSE_FILTER_IGNORE
	medallion.add_theme_stylebox_override("panel", VisualSkin.medallion_style())
	button.add_child(medallion)
	var icon_rect := TextureRect.new()
	icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon_rect.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(icon_rect)
	var label := Label.new()
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.clip_text = true
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", Color("f7e8c5"))
	label.add_theme_color_override("font_outline_color", Color("21180fe8"))
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
	label.add_theme_constant_override("outline_size", 3)
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 2)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(label)
	_button_parts[button] = {"medallion": medallion, "icon": icon_rect, "label": label}
	_set_button_content(button, label_text, icon_id)


func _set_button_content(button: Button, label_text: String, icon_id: String) -> void:
	var parts := _button_parts.get(button, {}) as Dictionary
	var label := parts.get("label", null) as Label
	var icon_rect := parts.get("icon", null) as TextureRect
	if label != null and label.text != label_text:
		label.text = label_text
	if icon_rect != null:
		var next_texture := VisualSkin.icon(icon_id)
		if icon_rect.texture != next_texture:
			icon_rect.texture = next_texture


func _command_layout_signature() -> String:
	var parts := PackedStringArray([
		_owner,
		"auto=%s" % str(_auto_enabled),
		"pet_skill=%s" % str(_pet_skill_menu_open),
		"size=%.3f,%.3f" % [size.x, size.y],
	])
	parts.append("visible")
	for command_id in _visible_ids:
		parts.append(str(command_id))
	parts.append("ordered")
	for command_id in _ordered_ids:
		parts.append(str(command_id))
	parts.append("labels")
	var command_ids: Array = _command_buttons.keys()
	command_ids.sort()
	for command_id in command_ids:
		var button := _command_buttons.get(command_id, null) as Button
		parts.append(
			"%s=%s" % [str(command_id), button.text if button != null else ""]
		)
	return "\u001f".join(parts)


func _sync_command_labels() -> void:
	for command_id in _command_buttons.keys():
		var button := _command_buttons[command_id] as Button
		if button == null:
			continue
		_set_button_content(button, button.text, _command_icon_id(str(command_id)))
	_sync_command_label_accents()


func _command_icon_id(command_id: String) -> String:
	if _owner == "switch_pet":
		return "return" if command_id == "run" else "summon"
	return str(PLAYER_ICONS.get(command_id, "attack"))


func _sync_command_label_accents() -> void:
	for command_id in _command_buttons.keys():
		var button := _command_buttons[command_id] as Button
		if button == null:
			continue
		var parts := _button_parts.get(button, {}) as Dictionary
		var label := parts.get("label", null) as Label
		if label != null:
			label.add_theme_color_override(
				"font_color",
				VisualSkin.command_label_color(
					str(_command_label_accents.get(command_id, "normal"))
				)
			)


func _hide_all_controls() -> void:
	_active_controls.clear()
	_submenu_panel.visible = false
	_capture_capacity_label.visible = false
	_auto_summary_label.visible = false
	for control in _all_interactive_controls():
		if control != null:
			control.visible = false
	for button in _command_buttons.values():
		if button is Button:
			(button as Button).visible = false


func _all_interactive_controls() -> Array[Control]:
	return [
		_managed_button,
		_auto_button,
		_auto_player_button,
		_auto_pet_button,
		_pet_skill_button,
		_pet_attack_button,
		_pet_recall_button,
		_pet_escape_button,
		_pet_assist_button,
		_pet_return_button,
		_pet_defend_button,
		_pet_skill_back_button,
	]


func _apply_player_layout(visible_ids: Array) -> void:
	for command_id in ["spirit", "attack", "item", "run", "help", "capture", "switch_pet", "defend"]:
		if not visible_ids.has(command_id) or not _command_buttons.has(command_id):
			continue
		var button := _command_buttons[command_id] as Button
		_show_button(button, Presenter.PLAYER_LAYOUT[command_id] as Rect2)
	_show_button(_managed_button, Presenter.PLAYER_LAYOUT["managed"] as Rect2)
	_show_button(_auto_button, Presenter.PLAYER_LAYOUT["auto"] as Rect2)


func _apply_pet_layout(visible_ids: Array, ordered_ids: Array) -> void:
	if _pet_skill_menu_open:
		_apply_pet_skill_submenu(visible_ids, ordered_ids)
		return
	_show_button(_pet_skill_button, Presenter.PET_LAYOUT["skill"] as Rect2)
	_show_button(_pet_attack_button, Presenter.PET_LAYOUT["attack"] as Rect2)
	_show_button(_pet_recall_button, Presenter.PET_LAYOUT["recall"] as Rect2)
	_show_button(_pet_escape_button, Presenter.PET_LAYOUT["run"] as Rect2)
	_show_button(_pet_assist_button, Presenter.PET_LAYOUT["assist"] as Rect2)
	_show_button(_pet_return_button, Presenter.PET_LAYOUT["return"] as Rect2)
	_show_button(_pet_defend_button, Presenter.PET_LAYOUT["defend"] as Rect2)
	_show_button(_auto_button, Presenter.PET_LAYOUT["auto"] as Rect2)


func _apply_auto_layout() -> void:
	_show_button(_auto_pet_button, Presenter.AUTO_LAYOUT["pet"] as Rect2)
	_show_button(_auto_player_button, Presenter.AUTO_LAYOUT["player"] as Rect2)
	_show_button(_auto_button, Presenter.AUTO_LAYOUT["cancel"] as Rect2, false, true)
	_auto_summary_label.visible = true
	_auto_summary_label.position = Presenter.scaled_rect(Rect2(156, 178, 330, 34), size).position
	_auto_summary_label.size = Presenter.scaled_rect(Rect2(156, 178, 330, 34), size).size
	_refresh_auto_summary()


func _apply_submenu_layout(visible_ids: Array, ordered_ids: Array) -> void:
	_submenu_panel.visible = true
	var panel_design_rect := Rect2(112, 10, 374, 282)
	var button_origin_y := 26.0
	if _owner == "switch_pet":
		var row_count := maxi(1, ceili(float(visible_ids.size()) / 2.0))
		var panel_height := minf(282.0, float(row_count * 62 + 34))
		panel_design_rect.position.y = 292.0 - panel_height
		panel_design_rect.size.y = panel_height
		button_origin_y = panel_design_rect.position.y + 16.0
	var panel_rect := Presenter.scaled_rect(panel_design_rect, size)
	_submenu_panel.position = panel_rect.position
	_submenu_panel.size = panel_rect.size
	var index := 0
	for command_id in ordered_ids:
		if not visible_ids.has(command_id) or not _command_buttons.has(command_id):
			continue
		var button := _command_buttons[command_id] as Button
		var row := index / 2
		var column := index % 2
		var rect := Rect2(124 + column * 180, button_origin_y + row * 62, 170, 60)
		_show_button(button, rect, true)
		index += 1
	_capture_capacity_label.position = Presenter.scaled_rect(Rect2(128, 260, 340, 24), size).position
	_capture_capacity_label.size = Presenter.scaled_rect(Rect2(128, 260, 340, 24), size).size
	_capture_capacity_label.visible = _owner == "capture"


func _apply_pet_skill_submenu(visible_ids: Array, ordered_ids: Array) -> void:
	_submenu_panel.visible = true
	var panel_rect := Presenter.scaled_rect(Rect2(112, 10, 374, 282), size)
	_submenu_panel.position = panel_rect.position
	_submenu_panel.size = panel_rect.size
	var skill_ids: Array = []
	for command_id in ordered_ids:
		if command_id != "help" and visible_ids.has(command_id):
			skill_ids.append(command_id)
	var index := 0
	for command_id in skill_ids:
		if not _command_buttons.has(command_id):
			continue
		var button := _command_buttons[command_id] as Button
		var row := index / 2
		var column := index % 2
		_show_button(button, Rect2(124 + column * 180, 26 + row * 62, 170, 60), true)
		index += 1
	_show_button(_pet_skill_back_button, Rect2(304, 212, 170, 60), true)


func _show_button(button: Button, design_rect: Rect2, compact: bool = false, danger: bool = false) -> void:
	if button == null:
		return
	var rect := Presenter.scaled_rect(design_rect, size)
	button.position = rect.position
	button.size = rect.size
	button.visible = true
	_apply_button_parts_geometry(button, compact, danger)
	if not _active_controls.has(button):
		_active_controls.append(button)


func _apply_button_parts_geometry(button: Button, compact: bool, danger: bool) -> void:
	var parts := _button_parts.get(button, {}) as Dictionary
	var medallion := parts.get("medallion", null) as Panel
	var icon_rect := parts.get("icon", null) as TextureRect
	var label := parts.get("label", null) as Label
	if medallion == null or icon_rect == null or label == null:
		return
	if compact:
		medallion.position = Vector2(4, 5)
		medallion.size = Vector2(44, 44)
		icon_rect.position = Vector2(9, 10)
		icon_rect.size = Vector2(34, 34)
		label.position = Vector2(52, 0)
		label.size = Vector2(maxf(0.0, button.size.x - 56.0), button.size.y)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		label.add_theme_font_size_override(
			"font_size",
			14 if label.text.contains("\n") else 15
		)
	else:
		medallion.position = Vector2(6, 0)
		medallion.size = Vector2(maxf(52.0, button.size.x - 12.0), maxf(52.0, button.size.x - 12.0))
		icon_rect.position = Vector2(12, 6)
		icon_rect.size = Vector2(maxf(40.0, button.size.x - 24.0), maxf(40.0, button.size.x - 24.0))
		label.position = Vector2(-6, button.size.y - 20)
		label.size = Vector2(button.size.x + 12.0, 22)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 17)
	_apply_button_medallion_visual(
		button,
		"disabled" if button.disabled else "danger" if danger else "normal"
	)


func _apply_button_medallion_visual(button: Button, kind: String) -> void:
	if button == null or str(_button_medallion_kinds.get(button, "")) == kind:
		return
	var parts := _button_parts.get(button, {}) as Dictionary
	var medallion := parts.get("medallion", null) as Panel
	if medallion == null:
		return
	if not _medallion_styles.has(kind):
		_medallion_styles[kind] = VisualSkin.medallion_style(kind)
	medallion.add_theme_stylebox_override(
		"panel",
		_medallion_styles[kind] as StyleBoxFlat
	)
	_button_medallion_kinds[button] = kind


func _sync_disabled_visuals() -> void:
	var command_unavailable := not _battle_active or _commands_locked
	_managed_button.disabled = true
	_managed_button.tooltip_text = "当前战斗没有可用托管位"
	_pet_assist_button.disabled = true
	_pet_assist_button.tooltip_text = "当前编队没有援助指令"
	_pet_skill_button.disabled = command_unavailable
	_pet_recall_button.disabled = command_unavailable
	_pet_escape_button.disabled = command_unavailable
	_pet_return_button.disabled = command_unavailable
	_pet_skill_back_button.disabled = command_unavailable
	_pet_attack_button.disabled = command_unavailable or _pet_shortcut_unavailable("attack")
	_pet_defend_button.disabled = command_unavailable or _pet_shortcut_unavailable("defend")
	_auto_button.disabled = not _battle_active or (_commands_locked and not _auto_enabled)
	_auto_player_button.disabled = not _battle_active
	_auto_pet_button.disabled = not _battle_active
	for button_value in _button_parts.keys():
		var button := button_value as Button
		if button == null:
			continue
		var parts := _button_parts.get(button, {}) as Dictionary
		var medallion := parts.get("medallion", null) as Panel
		var icon_rect := parts.get("icon", null) as TextureRect
		var label := parts.get("label", null) as Label
		var disabled := button.disabled
		var kind := "disabled" if disabled else "danger" if button == _auto_button and _auto_enabled else "normal"
		if medallion != null:
			_apply_button_medallion_visual(button, kind)
		var next_icon_modulate := Color(0.62, 0.60, 0.55, 0.72) if disabled else Color.WHITE
		if icon_rect != null and icon_rect.modulate != next_icon_modulate:
			icon_rect.modulate = next_icon_modulate
		var next_label_modulate := Color(0.66, 0.64, 0.59, 0.82) if disabled else Color.WHITE
		if label != null and label.modulate != next_label_modulate:
			label.modulate = next_label_modulate


func _pet_shortcut_unavailable(shortcut_id: String) -> bool:
	for button in _command_buttons.values():
		if not (button is Button):
			continue
		var command_button := button as Button
		var label := command_button.text
		if shortcut_id == "attack" and label.contains("攻击"):
			return command_button.disabled
		if shortcut_id == "defend" and label.contains("防御"):
			return command_button.disabled
	return true


func _open_pet_skill_menu() -> void:
	_pet_skill_menu_open = true
	apply_command_state(_owner, _visible_ids, _ordered_ids)


func _close_pet_skill_menu() -> void:
	_pet_skill_menu_open = false
	apply_command_state(_owner, _visible_ids, _ordered_ids)


func _emit_command(command_id: String) -> void:
	command_pressed.emit(command_id)


func _emit_pet_shortcut(shortcut_id: String) -> void:
	pet_shortcut_pressed.emit(shortcut_id)


func _open_strategy(actor_kind: String) -> void:
	_strategy_actor_kind = "pet" if actor_kind == "pet" else "player"
	_strategy_panel.visible = true
	var rect := Presenter.scaled_rect(Rect2(156, 10, 330, 194), size)
	_strategy_panel.position = rect.position
	_strategy_panel.size = rect.size
	_strategy_panel.move_to_front()
	_populate_strategy_options(_strategy_actor_kind)


func _close_strategy() -> void:
	_strategy_panel.visible = false


func _populate_strategy_options(actor_kind: String) -> void:
	_strategy_populating = true
	_strategy_title.text = "宠物自动策略" if actor_kind == "pet" else "人物自动策略"
	var options := _pet_options if actor_kind == "pet" else _player_options
	var first_key := "petFirstRoundSlot" if actor_kind == "pet" else "playerFirstRoundAction"
	var normal_key := "petNormalSlot" if actor_kind == "pet" else "playerNormalAction"
	_populate_option(_strategy_first_option, options, str(_settings.get(first_key, "1" if actor_kind == "pet" else "attack")))
	_populate_option(_strategy_normal_option, options, str(_settings.get(normal_key, "1" if actor_kind == "pet" else "attack")))
	_strategy_populating = false


func _populate_option(option: OptionButton, options: Array[Dictionary], selected_id: String) -> void:
	option.clear()
	var selected_index := 0
	for index in range(options.size()):
		var entry := options[index]
		var option_id := str(entry.get("id", ""))
		option.add_item(str(entry.get("label", option_id)))
		option.set_item_metadata(index, option_id)
		if option_id == selected_id:
			selected_index = index
	if option.item_count > 0:
		option.select(selected_index)


func _on_strategy_option_selected(_index: int) -> void:
	if _strategy_populating:
		return
	var first_value: Variant = _selected_option_value(_strategy_first_option)
	var normal_value: Variant = _selected_option_value(_strategy_normal_option)
	if _strategy_actor_kind == "pet":
		first_value = int(first_value)
		normal_value = int(normal_value)
	auto_strategy_changed.emit(_strategy_actor_kind, first_value, normal_value)


func _selected_option_value(option: OptionButton) -> String:
	if option == null or option.selected < 0:
		return ""
	return str(option.get_item_metadata(option.selected))


func _refresh_auto_summary() -> void:
	var player_action := str(_settings.get("playerNormalAction", "attack"))
	var pet_slot := str(_settings.get("petNormalSlot", 1))
	var player_label := _option_label(_player_options, player_action, "攻击")
	var pet_label := _option_label(_pet_options, pet_slot, "技%s" % pet_slot)
	_auto_summary_label.text = "主：%s　宠：%s" % [player_label, pet_label]


func _option_label(options: Array[Dictionary], option_id: String, fallback: String) -> String:
	for option in options:
		if str(option.get("id", "")) == option_id:
			return str(option.get("label", fallback))
	return fallback
