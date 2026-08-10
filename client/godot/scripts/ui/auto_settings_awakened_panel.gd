extends PanelContainer
class_name AutoSettingsAwakenedPanel

const AutoBattleSettingsModel := preload(
	"res://scripts/progression/auto_battle_settings_model.gd"
)
const PetManagementVisualSkin := preload(
	"res://scripts/ui/pet_management_visual_skin.gd"
)
const BACKDROP_TEXTURE := preload(
	"res://assets/ui/pet_codex_awakened_v1/runtime/pet_codex_backdrop_1280x720.png"
)
const HEADER_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/auto.png"
)
const ATTACK_ICON_TEXTURE := preload(
	"res://assets/ui/battle_command_awakened_v1/runtime/icons/attack.png"
)
const DEFEND_ICON_TEXTURE := preload(
	"res://assets/ui/battle_command_awakened_v1/runtime/icons/defend.png"
)
const SPIRIT_ICON_TEXTURE := preload(
	"res://assets/ui/battle_command_awakened_v1/runtime/icons/spirit.png"
)
const ITEM_ICON_TEXTURE := preload(
	"res://assets/ui/battle_command_awakened_v1/runtime/icons/item.png"
)
const SKILL_ICON_TEXTURE := preload(
	"res://assets/ui/battle_command_awakened_v1/runtime/icons/skill.png"
)
const MANAGED_ICON_TEXTURE := preload(
	"res://assets/ui/battle_command_awakened_v1/runtime/icons/managed.png"
)

signal close_requested
signal tab_requested(tab_id: String)
signal setting_requested(key: String, value)
signal heal_priority_requested(index: int, source_id: String)

const CANVAS_SIZE := Vector2(1280.0, 720.0)
const COLOR_CREAM := Color(0.96, 0.91, 0.78, 1.0)
const COLOR_MUTED := Color(0.71, 0.67, 0.57, 1.0)
const COLOR_GOLD := Color(1.0, 0.73, 0.25, 1.0)
const COLOR_GREEN := Color(0.58, 0.88, 0.31, 1.0)
const COLOR_DARK_TEXT := Color(0.25, 0.15, 0.08, 1.0)

# Stable semantic controls used by the existing coordinator and auto checks.
var close_button: Button
var battle_tab_button: Button
var hang_tab_button: Button
var capture_tab_button: Button
var legacy_content: VBoxContainer
var legacy_scroll: ScrollContainer

var _built := false
var _canvas: Control
var _active_tab := "battle"
var _active_round := "normal"
var _battle_page: Control
var _legacy_page: Control
var _legacy_title: Label
var _page_title: Label
var _page_hint: Label
var _first_round_button: Button
var _normal_round_button: Button
var _player_portrait: TextureRect
var _player_name: Label
var _player_level: Label
var _pet_portrait: TextureRect
var _pet_name: Label
var _pet_level: Label
var _player_action_icon: TextureRect
var _pet_action_icon: TextureRect
var _priority_summary: Label
var _heal_overlay: PanelContainer
var _heal_shade: ColorRect
var _healing_enabled: CheckBox
var _healing_disabled: CheckBox
var _player_hp_value: Label
var _pet_hp_value: Label
var _controls: Dictionary = {}
var _view_state: Dictionary = {}


func _ready() -> void:
	_ensure_built()


func prepare() -> void:
	_ensure_built()


func is_awakened_auto_settings_panel() -> bool:
	return true


func semantic_controls() -> Dictionary:
	return _controls.duplicate()


func active_tab() -> String:
	return _active_tab


func active_round() -> String:
	return _active_round


func heal_overlay_visible() -> bool:
	return _heal_overlay != null and _heal_overlay.visible


func direct_auto_hint_text() -> String:
	return _page_hint.text if _page_hint != null else ""


func set_active_tab(tab_id: String) -> void:
	_ensure_built()
	_active_tab = tab_id if tab_id in ["battle", "hang", "capture"] else "battle"
	_apply_tab_state()


func apply_battle_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	_apply_unit(
		_dictionary(state.get("player", null)),
		_player_portrait,
		_player_name,
		_player_level
	)
	_apply_unit(
		_dictionary(state.get("pet", null)),
		_pet_portrait,
		_pet_name,
		_pet_level
	)
	_populate_option(
		_controls.get(AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY) as OptionButton,
		_dictionary_array(state.get("playerActionOptions", [])),
		str(state.get("playerFirstAction", AutoBattleSettingsModel.ACTION_ATTACK))
	)
	_populate_option(
		_controls.get(AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY) as OptionButton,
		_dictionary_array(state.get("playerActionOptions", [])),
		str(state.get("playerNormalAction", AutoBattleSettingsModel.ACTION_ATTACK))
	)
	_populate_option(
		_controls.get(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY) as OptionButton,
		_dictionary_array(state.get("petSlotOptions", [])),
		str(state.get("petFirstSlot", "1"))
	)
	_populate_option(
		_controls.get(AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY) as OptionButton,
		_dictionary_array(state.get("petSlotOptions", [])),
		str(state.get("petNormalSlot", "1"))
	)
	_populate_option(
		_controls.get(AutoBattleSettingsModel.TARGET_MODE_KEY) as OptionButton,
		_dictionary_array(state.get("targetOptions", [])),
		str(state.get("targetMode", AutoBattleSettingsModel.TARGET_FIRST_LIVING))
	)
	_healing_enabled.set_block_signals(true)
	_healing_disabled.set_block_signals(true)
	_healing_enabled.button_pressed = bool(state.get("healingEnabled", true))
	_healing_disabled.button_pressed = not _healing_enabled.button_pressed
	_healing_enabled.set_block_signals(false)
	_healing_disabled.set_block_signals(false)
	_set_slider_value(
		_controls.get(AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY) as HSlider,
		int(state.get("playerHpPercent", 45)),
		_player_hp_value
	)
	_set_slider_value(
		_controls.get(AutoBattleSettingsModel.PET_HP_PERCENT_KEY) as HSlider,
		int(state.get("petHpPercent", 45)),
		_pet_hp_value
	)
	var heal_options := _dictionary_array(state.get("healSourceOptions", []))
	var priority := _string_array(state.get("healPriority", []))
	for index in range(AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS):
		var selected := priority[index] if index < priority.size() else ""
		_populate_option(
			_controls.get("healPriority%d" % index) as OptionButton,
			heal_options,
			selected
		)
	_refresh_priority_summary()
	_apply_round_state()


func decorate_legacy_content() -> void:
	_ensure_built()
	_decorate_legacy_node(legacy_content)


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "AutoSettingsAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override("panel", PetManagementVisualSkin.transparent_panel_style())

	_canvas = Control.new()
	_canvas.name = "AutoSettingsCanvas"
	_canvas.anchor_left = 0.5
	_canvas.anchor_top = 0.5
	_canvas.anchor_right = 0.5
	_canvas.anchor_bottom = 0.5
	_canvas.offset_left = -640.0
	_canvas.offset_top = -360.0
	_canvas.offset_right = 640.0
	_canvas.offset_bottom = 360.0
	_canvas.custom_minimum_size = CANVAS_SIZE
	_canvas.clip_contents = true
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_canvas)
	_add_backdrop()
	_build_header()
	_build_navigation()
	_build_battle_page()
	_build_legacy_page()
	_build_heal_overlay()
	_apply_tab_state()


func _add_backdrop() -> void:
	var backdrop := TextureRect.new()
	backdrop.name = "AutoSettingsBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(backdrop)


func _build_header() -> void:
	var icon := TextureRect.new()
	icon.name = "SettingsHeaderIcon"
	icon.position = Vector2(25.0, 7.0)
	icon.size = Vector2(44.0, 44.0)
	icon.texture = HEADER_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(icon)

	var title := Label.new()
	title.name = "PanelTitle"
	title.text = "设置"
	title.position = Vector2(72.0, 4.0)
	title.size = Vector2(150.0, 54.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	PetManagementVisualSkin.apply_title(title, 30)
	_canvas.add_child(title)

	close_button = Button.new()
	close_button.name = "AutoSettingsCloseButton"
	close_button.position = Vector2(1202.0, 4.0)
	close_button.size = Vector2(58.0, 50.0)
	PetManagementVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void:
		close_requested.emit()
	)
	_canvas.add_child(close_button)


func _build_navigation() -> void:
	var nav := VBoxContainer.new()
	nav.name = "SettingsNavigation"
	nav.position = Vector2(96.0, 119.0)
	nav.size = Vector2(248.0, 520.0)
	nav.add_theme_constant_override("separation", 12)
	_canvas.add_child(nav)

	var heading := Label.new()
	heading.text = "通用设置"
	heading.custom_minimum_size = Vector2(0.0, 56.0)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_display_label(heading, 23, COLOR_DARK_TEXT)
	heading.add_theme_stylebox_override("normal", _parchment_style())
	nav.add_child(heading)

	battle_tab_button = _navigation_button("自动战斗", "battle")
	hang_tab_button = _navigation_button("在线挂机", "hang")
	capture_tab_button = _navigation_button("自动捕捉", "capture")
	nav.add_child(battle_tab_button)
	nav.add_child(hang_tab_button)
	nav.add_child(capture_tab_button)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	nav.add_child(spacer)

	var hint := Label.new()
	hint.text = "战斗中直接点击「自动」\n默认策略即可顺畅挂机"
	hint.custom_minimum_size = Vector2(0.0, 74.0)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_apply_body_label(hint, 15, COLOR_MUTED)
	hint.add_theme_stylebox_override("normal", _dark_panel_style(0.50, 10))
	nav.add_child(hint)


func _navigation_button(text_value: String, tab_id: String) -> Button:
	var button := Button.new()
	button.name = "%sSettingsTab" % tab_id.capitalize()
	button.text = text_value
	button.toggle_mode = true
	button.custom_minimum_size = Vector2(248.0, 58.0)
	PetManagementVisualSkin.apply_tab_button(button)
	button.pressed.connect(func() -> void:
		tab_requested.emit(tab_id)
	)
	return button


func _build_battle_page() -> void:
	_battle_page = Control.new()
	_battle_page.name = "AutoBattlePage"
	_battle_page.position = Vector2(409.0, 103.0)
	_battle_page.size = Vector2(746.0, 557.0)
	_canvas.add_child(_battle_page)

	_page_title = Label.new()
	_page_title.text = "自动战斗"
	_page_title.position = Vector2(10.0, 0.0)
	_page_title.size = Vector2(250.0, 36.0)
	_apply_display_label(_page_title, 24, COLOR_CREAM)
	_battle_page.add_child(_page_title)

	var default_badge := Label.new()
	default_badge.text = "默认设置即可使用"
	default_badge.position = Vector2(555.0, 2.0)
	default_badge.size = Vector2(176.0, 32.0)
	default_badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	default_badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(default_badge, 14, COLOR_GREEN)
	default_badge.add_theme_stylebox_override("normal", _green_badge_style())
	_battle_page.add_child(default_badge)

	var hint_panel := PanelContainer.new()
	hint_panel.position = Vector2(4.0, 43.0)
	hint_panel.size = Vector2(728.0, 55.0)
	hint_panel.add_theme_stylebox_override("panel", _dark_panel_style(0.76, 8))
	_battle_page.add_child(hint_panel)

	var hint_row := HBoxContainer.new()
	hint_row.add_theme_constant_override("separation", 10)
	hint_panel.add_child(_with_margin(hint_row, 13, 8, 13, 8))
	var hint_icon := TextureRect.new()
	hint_icon.custom_minimum_size = Vector2(36.0, 36.0)
	hint_icon.texture = MANAGED_ICON_TEXTURE
	hint_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	hint_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hint_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	hint_row.add_child(hint_icon)
	_page_hint = Label.new()
	_page_hint.text = "进入战斗后，点右下角「自动」立即开始；需要接管时随时点「取消」。"
	_page_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_page_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_apply_body_label(_page_hint, 15, COLOR_CREAM)
	hint_row.add_child(_page_hint)

	_first_round_button = _round_button("首回合", "first")
	_first_round_button.name = "FirstRoundTab"
	_first_round_button.position = Vector2(4.0, 107.0)
	_first_round_button.size = Vector2(205.0, 43.0)
	_battle_page.add_child(_first_round_button)
	_normal_round_button = _round_button("一般回合", "normal")
	_normal_round_button.name = "NormalRoundTab"
	_normal_round_button.position = Vector2(216.0, 107.0)
	_normal_round_button.size = Vector2(205.0, 43.0)
	_battle_page.add_child(_normal_round_button)

	_build_unit_card(true, Vector2(4.0, 157.0))
	_build_unit_card(false, Vector2(370.0, 157.0))
	_build_recovery_section()
	_build_target_section()


func _round_button(text_value: String, round_id: String) -> Button:
	var button := Button.new()
	button.text = text_value
	button.toggle_mode = true
	PetManagementVisualSkin.apply_tab_button(button)
	button.custom_minimum_size = Vector2(205.0, 43.0)
	button.pressed.connect(func() -> void:
		_active_round = round_id
		_apply_round_state()
	)
	return button


func _build_unit_card(is_player: bool, card_position: Vector2) -> void:
	var card := PanelContainer.new()
	card.position = card_position
	card.size = Vector2(358.0, 151.0)
	card.add_theme_stylebox_override("panel", _dark_panel_style(0.76, 9))
	_battle_page.add_child(card)
	var content := Control.new()
	card.add_child(content)

	var heading := Label.new()
	heading.text = "人物出战" if is_player else "宠物出战"
	heading.position = Vector2(13.0, 8.0)
	heading.size = Vector2(120.0, 28.0)
	_apply_display_label(heading, 17, COLOR_GOLD)
	content.add_child(heading)

	var portrait_frame := PanelContainer.new()
	portrait_frame.position = Vector2(13.0, 40.0)
	portrait_frame.size = Vector2(92.0, 96.0)
	portrait_frame.add_theme_stylebox_override("panel", _portrait_style())
	content.add_child(portrait_frame)
	var portrait := TextureRect.new()
	portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_frame.add_child(_with_margin(portrait, 5, 5, 5, 5))

	var name_label := Label.new()
	name_label.position = Vector2(115.0, 41.0)
	name_label.size = Vector2(116.0, 27.0)
	_apply_display_label(name_label, 16, COLOR_CREAM)
	content.add_child(name_label)
	var level_label := Label.new()
	level_label.position = Vector2(115.0, 66.0)
	level_label.size = Vector2(95.0, 22.0)
	_apply_body_label(level_label, 13, COLOR_MUTED)
	content.add_child(level_label)

	var action_icon := TextureRect.new()
	action_icon.position = Vector2(279.0, 12.0)
	action_icon.size = Vector2(63.0, 63.0)
	action_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	action_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	action_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	action_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(action_icon)

	var first_key := (
		AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY
		if is_player
		else AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY
	)
	var normal_key := (
		AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY
		if is_player
		else AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY
	)
	var first_option := _semantic_option(first_key)
	first_option.position = Vector2(115.0, 94.0)
	first_option.size = Vector2(227.0, 42.0)
	content.add_child(first_option)
	var normal_option := _semantic_option(normal_key)
	normal_option.position = Vector2(115.0, 94.0)
	normal_option.size = Vector2(227.0, 42.0)
	content.add_child(normal_option)

	if is_player:
		_player_portrait = portrait
		_player_name = name_label
		_player_level = level_label
		_player_action_icon = action_icon
	else:
		_pet_portrait = portrait
		_pet_name = name_label
		_pet_level = level_label
		_pet_action_icon = action_icon


func _build_recovery_section() -> void:
	var section := PanelContainer.new()
	section.position = Vector2(4.0, 318.0)
	section.size = Vector2(728.0, 139.0)
	section.add_theme_stylebox_override("panel", _dark_panel_style(0.70, 9))
	_battle_page.add_child(section)
	var content := Control.new()
	section.add_child(content)

	var heading := Label.new()
	heading.text = "战斗生命恢复"
	heading.position = Vector2(13.0, 8.0)
	heading.size = Vector2(190.0, 28.0)
	_apply_display_label(heading, 18, COLOR_CREAM)
	content.add_child(heading)

	var healing_label := Label.new()
	healing_label.text = "自动使用恢复"
	healing_label.position = Vector2(480.0, 9.0)
	healing_label.size = Vector2(126.0, 28.0)
	_apply_body_label(healing_label, 14, COLOR_CREAM)
	content.add_child(healing_label)

	_healing_enabled = CheckBox.new()
	_healing_enabled.name = "HealingEnabledCheck"
	_healing_enabled.text = "开"
	_healing_enabled.position = Vector2(606.0, 5.0)
	_healing_enabled.size = Vector2(52.0, 38.0)
	_healing_enabled.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	_healing_enabled.add_theme_font_size_override("font_size", 14)
	_healing_enabled.add_theme_color_override("font_color", COLOR_CREAM)
	_healing_enabled.toggled.connect(_on_healing_enabled_toggled)
	content.add_child(_healing_enabled)
	_healing_disabled = CheckBox.new()
	_healing_disabled.name = "HealingDisabledCheck"
	_healing_disabled.text = "关"
	_healing_disabled.position = Vector2(663.0, 5.0)
	_healing_disabled.size = Vector2(52.0, 38.0)
	_healing_disabled.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	_healing_disabled.add_theme_font_size_override("font_size", 14)
	_healing_disabled.add_theme_color_override("font_color", COLOR_CREAM)
	_healing_disabled.toggled.connect(_on_healing_disabled_toggled)
	content.add_child(_healing_disabled)
	_controls[AutoBattleSettingsModel.HEALING_ENABLED_KEY] = _healing_enabled

	_build_hp_slider(
		content,
		Vector2(17.0, 53.0),
		"人物生命",
		AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY,
		true
	)
	_build_hp_slider(
		content,
		Vector2(374.0, 53.0),
		"宠物生命",
		AutoBattleSettingsModel.PET_HP_PERCENT_KEY,
		false
	)


func _build_hp_slider(
	parent: Control,
	row_position: Vector2,
	label_text: String,
	key: String,
	is_player: bool
) -> void:
	var label := Label.new()
	label.text = label_text
	label.position = row_position
	label.size = Vector2(94.0, 26.0)
	_apply_body_label(label, 14, COLOR_CREAM)
	parent.add_child(label)
	var value_label := Label.new()
	value_label.position = row_position + Vector2(92.0, 0.0)
	value_label.size = Vector2(105.0, 26.0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_apply_display_label(value_label, 14, COLOR_GOLD)
	parent.add_child(value_label)
	var slider := HSlider.new()
	slider.position = row_position + Vector2(0.0, 34.0)
	slider.size = Vector2(322.0, 34.0)
	slider.min_value = AutoBattleSettingsModel.MIN_HP_PERCENT
	slider.max_value = AutoBattleSettingsModel.MAX_HP_PERCENT
	slider.step = 1.0
	slider.add_theme_stylebox_override("slider", _slider_track_style())
	slider.add_theme_stylebox_override("grabber_area", _slider_fill_style())
	slider.add_theme_stylebox_override("grabber_area_highlight", _slider_fill_style(true))
	slider.value_changed.connect(func(value: float) -> void:
		value_label.text = "低于 %d%%" % roundi(value)
		setting_requested.emit(key, roundi(value))
	)
	parent.add_child(slider)
	_controls[key] = slider
	if is_player:
		_player_hp_value = value_label
	else:
		_pet_hp_value = value_label


func _build_target_section() -> void:
	var section := PanelContainer.new()
	section.position = Vector2(4.0, 467.0)
	section.size = Vector2(728.0, 78.0)
	section.add_theme_stylebox_override("panel", _dark_panel_style(0.64, 9))
	_battle_page.add_child(section)
	var content := Control.new()
	section.add_child(content)

	var target_label := Label.new()
	target_label.text = "攻击目标"
	target_label.position = Vector2(14.0, 10.0)
	target_label.size = Vector2(96.0, 26.0)
	_apply_display_label(target_label, 15, COLOR_CREAM)
	content.add_child(target_label)
	var target_option := _semantic_option(AutoBattleSettingsModel.TARGET_MODE_KEY)
	target_option.position = Vector2(14.0, 36.0)
	target_option.size = Vector2(274.0, 34.0)
	content.add_child(target_option)

	var priority_label := Label.new()
	priority_label.text = "恢复顺序"
	priority_label.position = Vector2(318.0, 10.0)
	priority_label.size = Vector2(100.0, 26.0)
	_apply_display_label(priority_label, 15, COLOR_CREAM)
	content.add_child(priority_label)
	_priority_summary = Label.new()
	_priority_summary.position = Vector2(318.0, 39.0)
	_priority_summary.size = Vector2(242.0, 29.0)
	_priority_summary.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_priority_summary.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_apply_body_label(_priority_summary, 13, COLOR_MUTED)
	content.add_child(_priority_summary)

	var priority_button := Button.new()
	priority_button.name = "HealPriorityButton"
	priority_button.text = "调整顺序"
	priority_button.position = Vector2(574.0, 19.0)
	priority_button.size = Vector2(136.0, 45.0)
	PetManagementVisualSkin.apply_action_button(priority_button)
	priority_button.pressed.connect(func() -> void:
		_heal_shade.visible = true
		_heal_overlay.visible = true
		_heal_overlay.move_to_front()
	)
	content.add_child(priority_button)


func _build_legacy_page() -> void:
	_legacy_page = Control.new()
	_legacy_page.name = "LegacySettingsPage"
	_legacy_page.position = Vector2(409.0, 103.0)
	_legacy_page.size = Vector2(746.0, 557.0)
	_legacy_page.visible = false
	_canvas.add_child(_legacy_page)
	_legacy_title = Label.new()
	_legacy_title.position = Vector2(10.0, 0.0)
	_legacy_title.size = Vector2(300.0, 38.0)
	_apply_display_label(_legacy_title, 24, COLOR_CREAM)
	_legacy_page.add_child(_legacy_title)
	var legacy_hint := Label.new()
	legacy_hint.text = "常用操作可直接在主界面完成；这里仅调整细节。"
	legacy_hint.position = Vector2(319.0, 5.0)
	legacy_hint.size = Vector2(410.0, 30.0)
	legacy_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_apply_body_label(legacy_hint, 14, COLOR_MUTED)
	_legacy_page.add_child(legacy_hint)

	legacy_scroll = ScrollContainer.new()
	legacy_scroll.name = "LegacySettingsScroll"
	legacy_scroll.position = Vector2(4.0, 58.0)
	legacy_scroll.size = Vector2(728.0, 487.0)
	legacy_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	legacy_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	legacy_scroll.add_theme_stylebox_override("panel", _dark_panel_style(0.46, 9))
	_legacy_page.add_child(legacy_scroll)
	legacy_content = VBoxContainer.new()
	legacy_content.name = "LegacySettingsContent"
	legacy_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	legacy_content.add_theme_constant_override("separation", 8)
	legacy_scroll.add_child(legacy_content)


func _build_heal_overlay() -> void:
	_heal_shade = ColorRect.new()
	_heal_shade.name = "HealPriorityShade"
	_heal_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_heal_shade.color = Color(0.0, 0.0, 0.0, 0.48)
	_heal_shade.mouse_filter = Control.MOUSE_FILTER_STOP
	_heal_shade.visible = false
	_canvas.add_child(_heal_shade)

	_heal_overlay = PanelContainer.new()
	_heal_overlay.name = "HealPriorityOverlay"
	_heal_overlay.position = Vector2(516.0, 153.0)
	_heal_overlay.size = Vector2(560.0, 423.0)
	_heal_overlay.add_theme_stylebox_override("panel", _overlay_style())
	_heal_overlay.visible = false
	_canvas.add_child(_heal_overlay)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 9)
	_heal_overlay.add_child(_with_margin(column, 22, 18, 22, 20))
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	column.add_child(header)
	var title := Label.new()
	title.text = "恢复道具优先顺序"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_display_label(title, 21, COLOR_CREAM)
	header.add_child(title)
	var close := Button.new()
	close.name = "HealPriorityCloseButton"
	close.text = "完成"
	PetManagementVisualSkin.apply_action_button(close)
	close.custom_minimum_size = Vector2(104.0, 42.0)
	close.pressed.connect(_hide_heal_overlay)
	header.add_child(close)

	var instruction := Label.new()
	instruction.text = "生命低于设定值时，按 1 → 5 的顺序寻找可用恢复来源。"
	instruction.custom_minimum_size = Vector2(0.0, 31.0)
	_apply_body_label(instruction, 14, COLOR_MUTED)
	column.add_child(instruction)

	for index in range(AutoBattleSettingsModel.MAX_HEAL_PRIORITY_SLOTS):
		var row := HBoxContainer.new()
		row.custom_minimum_size = Vector2(0.0, 48.0)
		row.add_theme_constant_override("separation", 10)
		column.add_child(row)
		var number := Label.new()
		number.text = str(index + 1)
		number.custom_minimum_size = Vector2(42.0, 42.0)
		number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		number.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_apply_display_label(number, 18, COLOR_GOLD)
		number.add_theme_stylebox_override("normal", _number_badge_style())
		row.add_child(number)
		var option := _semantic_heal_option(index)
		option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		option.custom_minimum_size = Vector2(0.0, 42.0)
		row.add_child(option)


func _semantic_option(key: String) -> OptionButton:
	var option := OptionButton.new()
	option.name = "%sOption" % key.capitalize().replace(" ", "")
	PetManagementVisualSkin.apply_option_button(option)
	option.custom_minimum_size.y = 40.0
	option.item_selected.connect(_on_semantic_option_selected.bind(key, option))
	_controls[key] = option
	return option


func _semantic_heal_option(index: int) -> OptionButton:
	var option := OptionButton.new()
	option.name = "HealPriority%dOption" % index
	PetManagementVisualSkin.apply_option_button(option)
	option.item_selected.connect(_on_heal_option_selected.bind(index, option))
	_controls["healPriority%d" % index] = option
	return option


func _on_semantic_option_selected(index: int, key: String, option: OptionButton) -> void:
	if index < 0 or index >= option.item_count:
		return
	var value = option.get_item_metadata(index)
	if key == AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY or key == AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY:
		value = int(str(value))
	setting_requested.emit(key, value)
	_apply_round_icons()


func _on_heal_option_selected(index: int, priority_index: int, option: OptionButton) -> void:
	if index < 0 or index >= option.item_count:
		return
	heal_priority_requested.emit(priority_index, str(option.get_item_metadata(index)))
	_refresh_priority_summary()


func _on_healing_enabled_toggled(pressed: bool) -> void:
	if pressed:
		_healing_disabled.set_block_signals(true)
		_healing_disabled.button_pressed = false
		_healing_disabled.set_block_signals(false)
		setting_requested.emit(AutoBattleSettingsModel.HEALING_ENABLED_KEY, true)
	elif not _healing_disabled.button_pressed:
		_healing_enabled.set_block_signals(true)
		_healing_enabled.button_pressed = true
		_healing_enabled.set_block_signals(false)


func _on_healing_disabled_toggled(pressed: bool) -> void:
	if pressed:
		_healing_enabled.set_block_signals(true)
		_healing_enabled.button_pressed = false
		_healing_enabled.set_block_signals(false)
		setting_requested.emit(AutoBattleSettingsModel.HEALING_ENABLED_KEY, false)
	elif not _healing_enabled.button_pressed:
		_healing_disabled.set_block_signals(true)
		_healing_disabled.button_pressed = true
		_healing_disabled.set_block_signals(false)


func _populate_option(option: OptionButton, options: Array[Dictionary], selected_id: String) -> void:
	if option == null:
		return
	option.set_block_signals(true)
	option.clear()
	var selected_index := 0
	for index in range(options.size()):
		var entry := options[index]
		var option_id := str(entry.get("id", ""))
		option.add_item(str(entry.get("label", option_id)))
		option.set_item_metadata(index, option_id)
		if option_id == selected_id:
			selected_index = index
	if option.item_count == 0:
		option.add_item("暂无可用项")
		option.set_item_metadata(0, "")
		option.disabled = true
	else:
		option.disabled = false
	option.select(clampi(selected_index, 0, maxi(0, option.item_count - 1)))
	option.set_block_signals(false)


func _set_slider_value(slider: HSlider, value: int, label: Label) -> void:
	if slider == null:
		return
	slider.set_block_signals(true)
	slider.value = clampi(value, int(slider.min_value), int(slider.max_value))
	slider.set_block_signals(false)
	if label != null:
		label.text = "低于 %d%%" % roundi(slider.value)


func _apply_unit(source: Dictionary, portrait: TextureRect, name_label: Label, level_label: Label) -> void:
	name_label.text = str(source.get("name", "未配置"))
	level_label.text = str(source.get("levelText", ""))
	portrait.texture = _texture_from_path(str(source.get("portraitTexturePath", "")))
	portrait.modulate = Color.WHITE if portrait.texture != null else Color(0.55, 0.50, 0.42, 0.72)


func _apply_tab_state() -> void:
	battle_tab_button.button_pressed = _active_tab == "battle"
	hang_tab_button.button_pressed = _active_tab == "hang"
	capture_tab_button.button_pressed = _active_tab == "capture"
	_battle_page.visible = _active_tab == "battle"
	_legacy_page.visible = _active_tab != "battle"
	if _active_tab == "hang":
		_page_title.text = "在线挂机"
		_legacy_title.text = "在线挂机"
	elif _active_tab == "capture":
		_page_title.text = "自动捕捉"
		_legacy_title.text = "自动捕捉"
	else:
		_page_title.text = "自动战斗"
		_legacy_title.text = "自动战斗"
	_hide_heal_overlay()


func _apply_round_state() -> void:
	_first_round_button.button_pressed = _active_round == "first"
	_normal_round_button.button_pressed = _active_round == "normal"
	var first_visible := _active_round == "first"
	(_controls.get(AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY) as OptionButton).visible = first_visible
	(_controls.get(AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY) as OptionButton).visible = not first_visible
	(_controls.get(AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY) as OptionButton).visible = first_visible
	(_controls.get(AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY) as OptionButton).visible = not first_visible
	_apply_round_icons()


func _apply_round_icons() -> void:
	var player_key := (
		AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY
		if _active_round == "first"
		else AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY
	)
	var player_option := _controls.get(player_key) as OptionButton
	_player_action_icon.texture = _action_icon(_selected_metadata(player_option))
	_pet_action_icon.texture = SKILL_ICON_TEXTURE


func _refresh_priority_summary() -> void:
	var first := _controls.get("healPriority0") as OptionButton
	_priority_summary.text = "优先：%s" % (
		first.get_item_text(first.selected)
		if first != null and first.item_count > 0 and first.selected >= 0
		else "自动选择"
	)


func _hide_heal_overlay() -> void:
	if _heal_shade != null:
		_heal_shade.visible = false
	if _heal_overlay != null:
		_heal_overlay.visible = false


func _selected_metadata(option: OptionButton) -> String:
	if option == null or option.selected < 0 or option.selected >= option.item_count:
		return ""
	return str(option.get_item_metadata(option.selected))


func _action_icon(action_id: String) -> Texture2D:
	if action_id == AutoBattleSettingsModel.ACTION_DEFEND:
		return DEFEND_ICON_TEXTURE
	if action_id.begins_with("spirit_"):
		return SPIRIT_ICON_TEXTURE
	if action_id.begins_with("item_"):
		return ITEM_ICON_TEXTURE
	return ATTACK_ICON_TEXTURE


func _decorate_legacy_node(node: Node) -> void:
	for child in node.get_children():
		if child is Label:
			(child as Label).add_theme_font_override("font", PetManagementVisualSkin.body_font())
			(child as Label).add_theme_color_override("font_color", COLOR_CREAM)
		elif child is OptionButton:
			PetManagementVisualSkin.apply_option_button(child as OptionButton)
		elif child is Button:
			PetManagementVisualSkin.apply_action_button(child as Button)
		elif child is CheckBox:
			(child as CheckBox).add_theme_font_override("font", PetManagementVisualSkin.body_font())
			(child as CheckBox).add_theme_color_override("font_color", COLOR_CREAM)
		elif child is LineEdit:
			(child as LineEdit).add_theme_font_override("font", PetManagementVisualSkin.body_font())
		_decorate_legacy_node(child)


func _apply_display_label(label: Label, font_size: int, color: Color) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0.06, 0.03, 0.01, 0.82))
	label.add_theme_constant_override("outline_size", 2)


func _apply_body_label(label: Label, font_size: int, color: Color) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)


func _dark_panel_style(alpha: float, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.035, 0.025, alpha)
	style.border_color = Color(0.42, 0.29, 0.16, 0.78)
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	return style


func _parchment_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.88, 0.68, 0.39, 0.96)
	style.border_color = Color(0.49, 0.29, 0.12, 0.96)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	return style


func _green_badge_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.15, 0.24, 0.08, 0.86)
	style.border_color = Color(0.45, 0.69, 0.19, 0.88)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	return style


func _portrait_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.09, 0.06, 0.92)
	style.border_color = Color(0.74, 0.52, 0.22, 0.92)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	return style


func _overlay_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.075, 0.048, 0.99)
	style.border_color = Color(0.70, 0.47, 0.22, 0.98)
	style.set_border_width_all(3)
	style.set_corner_radius_all(12)
	return style


func _number_badge_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.18, 0.12, 0.07, 0.95)
	style.border_color = Color(0.68, 0.46, 0.19, 0.92)
	style.set_border_width_all(1)
	style.set_corner_radius_all(21)
	return style


func _slider_track_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.075, 0.045, 0.025, 0.96)
	style.set_corner_radius_all(6)
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	return style


func _slider_fill_style(highlight := false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 0.68, 0.10, 1.0) if not highlight else Color(1.0, 0.82, 0.24, 1.0)
	style.set_corner_radius_all(6)
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	return style


func _with_margin(
	child: Control,
	left: int,
	top: int,
	right: int,
	bottom: int
) -> MarginContainer:
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", left)
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_right", right)
	margin.add_theme_constant_override("margin_bottom", bottom)
	margin.add_child(child)
	return margin


func _texture_from_path(path: String) -> Texture2D:
	var normalized := path.strip_edges()
	if normalized == "" or not ResourceLoader.exists(normalized, "Texture2D"):
		return null
	return ResourceLoader.load(normalized, "Texture2D") as Texture2D


func _dictionary(value) -> Dictionary:
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry in value as Array:
			if entry is Dictionary:
				result.append((entry as Dictionary).duplicate(true))
	return result


func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry in value as Array:
			result.append(str(entry))
	return result
