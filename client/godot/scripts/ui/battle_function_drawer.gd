extends Control
class_name BattleFunctionDrawer

signal entry_pressed(entry_id: String)

const VisualSkin := preload("res://scripts/ui/world_hud_awakened_visual_skin.gd")

const REFERENCE_SIZE := Vector2(1280.0, 720.0)
const ENTRY_SPECS := [
	{"id": "backpack", "label": "背包", "icon": "backpack"},
	{"id": "character", "label": "角色", "icon": "event_character"},
	{"id": "pet", "label": "宠物", "icon": "event_pet"},
	{"id": "codex", "label": "图鉴", "icon": "event_codex"},
	{"id": "equipment", "label": "装备", "icon": "equipment"},
	{"id": "quest", "label": "任务", "icon": "event_quest"},
	{"id": "family", "label": "家族", "icon": "event_family"},
	{"id": "party", "label": "队伍", "icon": "event_party"},
	{"id": "mailbox", "label": "信箱", "icon": "mailbox"},
	{"id": "market", "label": "买卖", "icon": "market"},
	{"id": "auto", "label": "内挂", "icon": "event_auto"},
	{"id": "account", "label": "设置", "icon": "event_account"},
]
const BATTLE_UNAVAILABLE_IDS := [
	"backpack",
	"character",
	"pet",
	"equipment",
	"family",
	"party",
	"mailbox",
	"market",
]

var _source_buttons: Dictionary = {}
var _entry_buttons: Dictionary = {}
var _entry_slots: Dictionary = {}
var _entry_captions: Dictionary = {}
var _battle_active := false
var _overlay_open := false
var _drawer_open := false
var _viewport_size := REFERENCE_SIZE

var _toggle_slot: Control
var _toggle_button: Button
var _toggle_caption: Label
var _drawer_panel: Panel
var _drawer_title: Label
var _drawer_grid: GridContainer


func _init() -> void:
	name = "BattleFunctionDrawer"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = false
	_build_view()


func configure_source_buttons(buttons: Dictionary) -> void:
	_source_buttons = buttons.duplicate()
	_sync_entry_states()


func apply_state(viewport_size: Vector2, battle_active: bool, overlay_open: bool) -> void:
	_viewport_size = Vector2(maxf(1.0, viewport_size.x), maxf(1.0, viewport_size.y))
	_battle_active = battle_active
	_overlay_open = overlay_open
	position = Vector2.ZERO
	size = _viewport_size
	if not _battle_active or _overlay_open:
		_set_drawer_open(false)
	visible = _battle_active and not _overlay_open
	_layout_view()
	_sync_entry_states()


func set_drawer_open(open: bool) -> void:
	_set_drawer_open(open)


func is_drawer_open() -> bool:
	return _drawer_open


func toggle_button() -> Button:
	return _toggle_button


func drawer_panel() -> Panel:
	return _drawer_panel


func entry_button(entry_id: String) -> Button:
	return _entry_buttons.get(entry_id) as Button


func input_blockers() -> Array[Control]:
	return [_toggle_button, _drawer_panel]


func point_overlaps_active_control(global_point: Vector2) -> bool:
	if _toggle_button != null and _toggle_button.is_visible_in_tree():
		if _toggle_button.get_global_rect().has_point(global_point):
			return true
	return (
		_drawer_panel != null
		and _drawer_panel.is_visible_in_tree()
		and _drawer_panel.get_global_rect().has_point(global_point)
	)


func snapshot() -> Dictionary:
	var visible_ids: Array[String] = []
	var enabled_ids: Array[String] = []
	var touch_targets_ok := true
	var codex_caption := _entry_captions.get("codex") as Label
	for spec_value in ENTRY_SPECS:
		var spec := spec_value as Dictionary
		var entry_id := str(spec.get("id", ""))
		var button := entry_button(entry_id)
		var slot := _entry_slots.get(entry_id) as Control
		if button == null or slot == null or not slot.visible:
			continue
		visible_ids.append(entry_id)
		if not button.disabled:
			enabled_ids.append(entry_id)
		touch_targets_ok = (
			touch_targets_ok
			and button.size.x >= 60.0
			and button.size.y >= 60.0
		)
	return {
		"battleActive": _battle_active,
		"overlayOpen": _overlay_open,
		"visible": visible,
		"drawerOpen": _drawer_open,
		"visibleIds": visible_ids,
		"enabledIds": enabled_ids,
		"mapIncluded": _entry_buttons.has("map"),
		"touchTargetsOk": touch_targets_ok,
		"codexCaption": codex_caption.text if codex_caption != null else "",
		"jianGlyphOk": _label_font_has_char(codex_caption, "鉴"),
		"toggleRect": _global_rect(_toggle_button),
		"drawerRect": _global_rect(_drawer_panel),
	}


static func _label_font_has_char(label: Label, value: String) -> bool:
	if label == null or value.is_empty():
		return false
	var font := label.get_theme_font("font")
	return font != null and font.has_char(value.unicode_at(0))


func _build_view() -> void:
	_toggle_slot = Control.new()
	_toggle_slot.name = "BattleFunctionToggleSlot"
	_toggle_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_toggle_slot)

	_toggle_button = Button.new()
	_toggle_button.name = "BattleFunctionToggleButton"
	_toggle_button.tooltip_text = "展开功能"
	_toggle_button.toggle_mode = true
	VisualSkin.apply_icon_button(_toggle_button, "more", 48, true)
	_toggle_button.pressed.connect(_on_toggle_pressed)
	_toggle_slot.add_child(_toggle_button)

	_toggle_caption = Label.new()
	_toggle_caption.name = "BattleFunctionToggleCaption"
	_toggle_caption.text = "功能"
	VisualSkin.apply_caption(_toggle_caption, 18)
	_toggle_caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toggle_slot.add_child(_toggle_caption)

	_drawer_panel = Panel.new()
	_drawer_panel.name = "BattleFunctionPanel"
	_drawer_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_drawer_panel.clip_contents = true
	_drawer_panel.visible = false
	_drawer_panel.add_theme_stylebox_override("panel", _drawer_style())
	add_child(_drawer_panel)

	_drawer_title = Label.new()
	_drawer_title.name = "BattleFunctionTitle"
	_drawer_title.text = "功能"
	VisualSkin.apply_heading(_drawer_title, 20)
	_drawer_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_drawer_panel.add_child(_drawer_title)

	_drawer_grid = GridContainer.new()
	_drawer_grid.name = "BattleFunctionGrid"
	_drawer_grid.columns = 4
	_drawer_grid.add_theme_constant_override("h_separation", 4)
	_drawer_grid.add_theme_constant_override("v_separation", 2)
	_drawer_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_drawer_panel.add_child(_drawer_grid)

	for spec_value in ENTRY_SPECS:
		_build_entry(spec_value as Dictionary)


func _build_entry(spec: Dictionary) -> void:
	var entry_id := str(spec.get("id", ""))
	var label_text := str(spec.get("label", ""))
	var icon_id := str(spec.get("icon", entry_id))
	var slot := VBoxContainer.new()
	slot.name = "BattleFunctionSlot%s" % entry_id.capitalize().replace(" ", "")
	slot.custom_minimum_size = Vector2(82.0, 82.0)
	slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_theme_constant_override("separation", -1)
	_drawer_grid.add_child(slot)

	var button := Button.new()
	button.name = "BattleFunctionEntry%s" % entry_id.capitalize().replace(" ", "")
	button.custom_minimum_size = Vector2(78.0, 60.0)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	button.tooltip_text = label_text
	VisualSkin.apply_icon_button(button, icon_id, 44, true, entry_id)
	button.add_theme_color_override(
		"icon_disabled_color",
		Color(0.72, 0.68, 0.58, 0.82)
	)
	button.pressed.connect(_on_entry_pressed.bind(entry_id))
	slot.add_child(button)

	var caption := Label.new()
	caption.name = "BattleFunctionCaption"
	caption.text = label_text
	caption.custom_minimum_size = Vector2(78.0, 22.0)
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	VisualSkin.apply_caption(caption, 16)
	var cjk_font := SystemFont.new()
	cjk_font.font_names = PackedStringArray([
		"Hiragino Sans GB",
		"PingFang SC",
		"Microsoft YaHei",
		"Noto Sans CJK SC",
	])
	caption.add_theme_font_override("font", cjk_font)
	slot.add_child(caption)

	_entry_buttons[entry_id] = button
	_entry_slots[entry_id] = slot
	_entry_captions[entry_id] = caption


func _layout_view() -> void:
	var scale_factor := minf(
		_viewport_size.x / REFERENCE_SIZE.x,
		_viewport_size.y / REFERENCE_SIZE.y
	)
	scale_factor = clampf(scale_factor, 0.72, 1.35)
	_toggle_slot.position = Vector2(18.0, 88.0) * scale_factor
	_toggle_slot.size = Vector2(70.0, 90.0) * scale_factor
	_toggle_button.position = Vector2(4.0, 0.0) * scale_factor
	_toggle_button.size = Vector2(62.0, 62.0) * scale_factor
	_toggle_caption.position = Vector2(0.0, 62.0) * scale_factor
	_toggle_caption.size = Vector2(70.0, 26.0) * scale_factor

	var drawer_size := Vector2(372.0, 302.0) * scale_factor
	_drawer_panel.position = Vector2(94.0, 78.0) * scale_factor
	_drawer_panel.size = drawer_size
	_drawer_title.position = Vector2(16.0, 7.0) * scale_factor
	_drawer_title.size = Vector2(drawer_size.x - 32.0 * scale_factor, 32.0 * scale_factor)
	_drawer_grid.position = Vector2(14.0, 42.0) * scale_factor
	_drawer_grid.size = Vector2(drawer_size.x - 28.0 * scale_factor, drawer_size.y - 50.0 * scale_factor)


func _sync_entry_states() -> void:
	for spec_value in ENTRY_SPECS:
		var spec := spec_value as Dictionary
		var entry_id := str(spec.get("id", ""))
		var source := _source_buttons.get(entry_id) as Button
		var button := entry_button(entry_id)
		var slot := _entry_slots.get(entry_id) as Control
		var caption := _entry_captions.get(entry_id) as Label
		if button == null or slot == null:
			continue
		var entry_visible := source != null and source.visible
		var entry_disabled := (
			source == null
			or source.disabled
			or BATTLE_UNAVAILABLE_IDS.has(entry_id)
		)
		slot.visible = entry_visible
		button.disabled = entry_disabled
		button.tooltip_text = (
			"战斗中暂不可用"
			if entry_disabled
			else str(spec.get("label", ""))
		)
		if caption != null:
			caption.add_theme_color_override(
				"font_color",
				Color(0.68, 0.64, 0.54, 0.84)
				if entry_disabled
				else Color(0.96, 0.91, 0.80, 1.0)
			)


func _set_drawer_open(open: bool) -> void:
	_drawer_open = open and _battle_active and not _overlay_open
	_drawer_panel.visible = _drawer_open
	_toggle_button.tooltip_text = "收起功能" if _drawer_open else "展开功能"
	_toggle_button.button_pressed = _drawer_open


func _on_toggle_pressed() -> void:
	_set_drawer_open(not _drawer_open)


func _on_entry_pressed(entry_id: String) -> void:
	var button := entry_button(entry_id)
	var source := _source_buttons.get(entry_id) as Button
	if button == null or button.disabled or source == null or source.disabled:
		return
	_set_drawer_open(false)
	source.pressed.emit()
	entry_pressed.emit(entry_id)


func _drawer_style() -> StyleBoxFlat:
	var style := VisualSkin.drawer_style()
	style.bg_color = Color(0.035, 0.030, 0.025, 0.96)
	style.border_color = Color(0.68, 0.49, 0.25, 0.96)
	style.set_border_width_all(2)
	style.set_corner_radius_all(12)
	style.content_margin_left = 10.0
	style.content_margin_top = 8.0
	style.content_margin_right = 10.0
	style.content_margin_bottom = 10.0
	return style


func _global_rect(control: Control) -> Rect2:
	if control == null:
		return Rect2()
	return control.get_global_rect()
