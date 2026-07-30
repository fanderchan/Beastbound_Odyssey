extends Button
class_name BackpackAwakenedItemCard

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)

signal entry_activated(entry: Dictionary)
signal slot_double_clicked(slot_data: Dictionary)
signal slot_dropped(source_data: Dictionary, target_data: Dictionary)
signal slot_context_requested(slot_data: Dictionary, screen_position: Vector2)
signal slot_drag_started(source_data: Dictionary)
signal slot_drag_ended(
	source_data: Dictionary,
	successful: bool,
	screen_position: Vector2
)

var entry: Dictionary = {}
var equipment_slot_mode: bool = false
var active_drag_data: Dictionary = {}
var _rarity_backdrop: Panel
var _icon_rect: TextureRect
var _name_label: Label
var _summary_label: Label
var _corner_label: Label


func _ready() -> void:
	_ensure_ui()


func configure(
	value: Dictionary,
	selected: bool = false,
	as_equipment_slot: bool = false
) -> void:
	entry = value.duplicate(true)
	equipment_slot_mode = as_equipment_slot
	_ensure_ui()
	BackpackAwakenedVisualSkin.apply_slot_button(self, selected)
	disabled = (
		not bool(entry.get("canSelect", entry.get("occupied", true)))
		and not bool(entry.get("dropEnabled", false))
	)
	var is_empty := (
		["empty", "locked"].has(str(entry.get("kind", "")))
		or (
			as_equipment_slot
			and not bool(entry.get("occupied", false))
		)
	)
	tooltip_text = "" if is_empty else _tooltip_for(entry)
	var is_equipment := bool(entry.get("isEquipment", as_equipment_slot))
	var rarity := str(entry.get("rarity", ""))
	var rarity_color := BackpackAwakenedVisualSkin.rarity_color(rarity, is_equipment)
	_rarity_backdrop.add_theme_stylebox_override(
		"panel",
		_inner_style(rarity_color, is_empty)
	)
	var slot_label := str(entry.get("slotLabel", ""))
	var item_label := str(entry.get("itemLabel", "空格"))
	_name_label.text = slot_label if is_empty and as_equipment_slot else item_label
	_name_label.add_theme_color_override(
		"font_color",
		BackpackAwakenedVisualSkin.MUTED_TEXT if is_empty else BackpackAwakenedVisualSkin.CREAM_TEXT
	)
	var summary := str(entry.get("stateSummary", "")).strip_edges()
	var count := maxi(0, int(entry.get("count", 0)))
	if count > 1:
		summary = "×%d" % count
	if as_equipment_slot and not is_empty and slot_label != "":
		summary = slot_label if summary == "" else "%s · %s" % [slot_label, summary]
	_summary_label.text = summary
	_summary_label.visible = summary != ""
	_corner_label.text = _corner_text(entry)
	_corner_label.visible = _corner_label.text != ""

	var texture := _texture_from_entry(entry)
	_icon_rect.texture = texture
	_icon_rect.visible = texture != null and not is_empty


func _ensure_ui() -> void:
	if _rarity_backdrop != null:
		return
	text = ""
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	pressed.connect(_on_pressed)

	_rarity_backdrop = Panel.new()
	_rarity_backdrop.name = "RarityBackdrop"
	_rarity_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_rarity_backdrop.offset_left = 7.0
	_rarity_backdrop.offset_top = 7.0
	_rarity_backdrop.offset_right = -7.0
	_rarity_backdrop.offset_bottom = -7.0
	_rarity_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rarity_backdrop)

	_icon_rect = TextureRect.new()
	_icon_rect.name = "ItemIcon"
	_icon_rect.anchor_left = 0.17
	_icon_rect.anchor_top = 0.10
	_icon_rect.anchor_right = 0.83
	_icon_rect.anchor_bottom = 0.62
	_icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon_rect.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_icon_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_icon_rect)

	_name_label = Label.new()
	_name_label.name = "ItemName"
	_name_label.anchor_left = 0.08
	_name_label.anchor_top = 0.58
	_name_label.anchor_right = 0.92
	_name_label.anchor_bottom = 0.81
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_label.add_theme_font_override("font", BackpackAwakenedVisualSkin.body_font())
	_name_label.add_theme_font_size_override("font_size", 12)
	_name_label.add_theme_color_override("font_color", BackpackAwakenedVisualSkin.CREAM_TEXT)
	_name_label.add_theme_color_override("font_outline_color", Color(0.04, 0.025, 0.012, 0.96))
	_name_label.add_theme_constant_override("outline_size", 2)
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_name_label)

	_summary_label = Label.new()
	_summary_label.name = "ItemSummary"
	_summary_label.anchor_left = 0.08
	_summary_label.anchor_top = 0.79
	_summary_label.anchor_right = 0.92
	_summary_label.anchor_bottom = 0.96
	_summary_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_summary_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_summary_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_summary_label.add_theme_font_override("font", BackpackAwakenedVisualSkin.body_font())
	_summary_label.add_theme_font_size_override("font_size", 10)
	_summary_label.add_theme_color_override("font_color", BackpackAwakenedVisualSkin.GOLD_TEXT)
	_summary_label.add_theme_color_override("font_outline_color", Color(0.04, 0.025, 0.012, 0.96))
	_summary_label.add_theme_constant_override("outline_size", 2)
	_summary_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_summary_label)

	_corner_label = Label.new()
	_corner_label.name = "CornerTag"
	_corner_label.anchor_left = 0.02
	_corner_label.anchor_top = 0.03
	_corner_label.anchor_right = 0.42
	_corner_label.anchor_bottom = 0.24
	_corner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_corner_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_corner_label.add_theme_font_override("font", BackpackAwakenedVisualSkin.display_font())
	_corner_label.add_theme_font_size_override("font_size", 9)
	_corner_label.add_theme_color_override("font_color", Color(0.98, 0.90, 0.67, 1.0))
	_corner_label.add_theme_color_override("font_outline_color", Color(0.08, 0.03, 0.01, 0.98))
	_corner_label.add_theme_constant_override("outline_size", 2)
	_corner_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_corner_label)


func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton):
		return
	var mouse_event := event as InputEventMouseButton
	if mouse_event.button_index == MOUSE_BUTTON_RIGHT and mouse_event.pressed:
		if (
			disabled
			or str(entry.get("itemId", "")) == ""
			or bool(entry.get("locked", false))
		):
			return
		slot_context_requested.emit(
			_slot_data(),
			mouse_event.global_position
		)
		accept_event()
		return
	if (
		mouse_event.button_index != MOUSE_BUTTON_LEFT
		or not mouse_event.pressed
		or not mouse_event.double_click
		or disabled
	):
		return
	slot_double_clicked.emit(_slot_data())
	accept_event()


func _get_drag_data(_at_position: Vector2):
	if (
		disabled
		or not bool(entry.get("dragEnabled", false))
		or str(entry.get("itemId", "")) == ""
		or bool(entry.get("locked", false))
	):
		return null
	var data := _slot_data()
	data["dragKind"] = "item_slot"
	active_drag_data = data.duplicate(true)
	slot_drag_started.emit(active_drag_data.duplicate(true))
	set_drag_preview(_make_drag_preview(data))
	return data


func _can_drop_data(_at_position: Vector2, data) -> bool:
	if (
		not bool(entry.get("dropEnabled", false))
		or bool(entry.get("locked", false))
		or not (data is Dictionary)
	):
		return false
	var source := data as Dictionary
	if str(source.get("dragKind", "")) != "item_slot":
		return false
	var accepts_value = entry.get("accepts", [])
	return (
		not (accepts_value is Array)
		or (accepts_value as Array).has(str(source.get("context", "")))
	)


func _drop_data(_at_position: Vector2, data) -> void:
	if not (data is Dictionary):
		return
	slot_dropped.emit(
		(data as Dictionary).duplicate(true),
		_slot_data()
	)


func _notification(what: int) -> void:
	if what != NOTIFICATION_DRAG_END or active_drag_data.is_empty():
		return
	var successful := (
		get_viewport() != null
		and get_viewport().gui_is_drag_successful()
	)
	slot_drag_ended.emit(
		active_drag_data.duplicate(true),
		successful,
		get_global_mouse_position()
	)
	active_drag_data.clear()


func _on_pressed() -> void:
	if disabled:
		return
	entry_activated.emit(entry.duplicate(true))


func _texture_from_entry(value: Dictionary) -> Texture2D:
	var direct_value = value.get("iconTexture", value.get("icon", null))
	if direct_value is Texture2D:
		return direct_value as Texture2D
	var path := str(value.get("iconPath", "")).strip_edges()
	if path != "" and ResourceLoader.exists(path, "Texture2D"):
		var loaded = load(path)
		if loaded is Texture2D:
			return loaded as Texture2D
	return BackpackAwakenedVisualSkin.item_texture_for(str(value.get("itemId", "")))


func _corner_text(value: Dictionary) -> String:
	if bool(value.get("equipped", false)):
		return "已装"
	if bool(value.get("locked", false)):
		return "锁"
	var enhancement := int(value.get("enhancementLevel", -1))
	if enhancement < 0:
		var detail_value = value.get("detail", {})
		if detail_value is Dictionary:
			enhancement = int((detail_value as Dictionary).get("enhancementLevel", -1))
	return "+%d" % enhancement if enhancement > 0 else ""


func _tooltip_for(value: Dictionary) -> String:
	var label := str(value.get("itemLabel", value.get("slotLabel", "")))
	var summary := str(value.get("stateSummary", "")).strip_edges()
	return label if summary == "" else "%s\n%s" % [label, summary]


func _slot_data() -> Dictionary:
	var data := entry.duplicate(true)
	data["context"] = str(data.get("context", "backpack"))
	if not data.has("equipmentInstanceId"):
		data["equipmentInstanceId"] = str(data.get("instanceId", ""))
	if not data.has("label"):
		data["label"] = _tooltip_for(data)
	return data


func _make_drag_preview(data: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.top_level = true
	panel.z_as_relative = false
	panel.z_index = 4095
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override(
		"panel",
		BackpackAwakenedVisualSkin.detail_panel_style()
	)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 7)
	panel.add_child(row)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(46.0, 46.0)
	icon.texture = _texture_from_entry(data)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var label := Label.new()
	label.text = str(data.get("itemLabel", "物品"))
	label.custom_minimum_size = Vector2(92.0, 46.0)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	BackpackAwakenedVisualSkin.apply_body(label, 14)
	row.add_child(label)
	return panel


func _inner_style(accent: Color, is_empty: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.045, 0.037, 0.030, 0.56)
		if is_empty
		else Color(accent.r * 0.20, accent.g * 0.20, accent.b * 0.20, 0.68)
	)
	style.border_color = Color(accent.r, accent.g, accent.b, 0.55 if not is_empty else 0.24)
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	return style
