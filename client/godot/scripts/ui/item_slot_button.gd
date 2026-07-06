extends Button
class_name ItemSlotButton

signal slot_double_clicked(slot_data: Dictionary)
signal slot_dropped(source_data: Dictionary, target_data: Dictionary)
signal slot_context_requested(slot_data: Dictionary, screen_position: Vector2)
signal slot_drag_started(source_data: Dictionary)
signal slot_drag_ended(source_data: Dictionary, successful: bool, screen_position: Vector2)

var slot_data: Dictionary = {}
var drag_enabled: bool = true
var drop_enabled: bool = true
var highlight_drop_target: bool = false
var active_drag_data: Dictionary = {}


func configure(data: Dictionary, slot_text: String, pressed_value: bool = false, disabled_value: bool = false, toggle_value: bool = true) -> void:
	slot_data = data.duplicate(true)
	text = slot_text
	clip_text = true
	text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	toggle_mode = toggle_value
	if toggle_mode:
		button_pressed = pressed_value
	drag_enabled = bool(slot_data.get("dragEnabled", true))
	drop_enabled = bool(slot_data.get("dropEnabled", true))
	highlight_drop_target = bool(slot_data.get("highlightDropTarget", false))
	disabled = disabled_value
	tooltip_text = str(slot_data.get("tooltip", ""))
	_apply_slot_style()


func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton):
		return
	var mouse_event := event as InputEventMouseButton
	if mouse_event.button_index == MOUSE_BUTTON_RIGHT and mouse_event.pressed:
		if disabled or slot_data.is_empty():
			return
		if str(slot_data.get("itemId", "")) == "":
			return
		slot_context_requested.emit(slot_data.duplicate(true), mouse_event.global_position)
		accept_event()
		return
	if mouse_event.button_index != MOUSE_BUTTON_LEFT or not mouse_event.pressed or not mouse_event.double_click:
		return
	if disabled:
		return
	slot_double_clicked.emit(slot_data.duplicate(true))
	accept_event()


func _get_drag_data(_at_position: Vector2):
	if disabled or not drag_enabled or slot_data.is_empty():
		return null
	var item_id := str(slot_data.get("itemId", ""))
	if item_id == "":
		return null
	var data := slot_data.duplicate(true)
	data["dragKind"] = "item_slot"
	active_drag_data = data.duplicate(true)
	slot_drag_started.emit(active_drag_data.duplicate(true))
	set_drag_preview(_make_drag_preview(str(data.get("label", text))))
	return data


func _can_drop_data(_at_position: Vector2, data) -> bool:
	if disabled or not drop_enabled or not (data is Dictionary):
		return false
	var source := data as Dictionary
	if str(source.get("dragKind", "")) != "item_slot":
		return false
	var accepts_value = slot_data.get("accepts", [])
	if accepts_value is Array:
		var source_context := str(source.get("context", ""))
		return (accepts_value as Array).has(source_context)
	return true


func _drop_data(_at_position: Vector2, data) -> void:
	if not (data is Dictionary):
		return
	slot_dropped.emit((data as Dictionary).duplicate(true), slot_data.duplicate(true))


func _notification(what: int) -> void:
	if what != NOTIFICATION_DRAG_END or active_drag_data.is_empty():
		return
	var successful := false
	if get_viewport() != null:
		successful = get_viewport().gui_is_drag_successful()
	slot_drag_ended.emit(active_drag_data.duplicate(true), successful, get_global_mouse_position())
	active_drag_data.clear()


func _make_drag_preview(label_text: String) -> Control:
	var panel := PanelContainer.new()
	panel.top_level = true
	panel.z_as_relative = false
	panel.z_index = 4095
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.modulate = Color(1.0, 1.0, 1.0, 0.92)
	panel.add_theme_stylebox_override("panel", _slot_style(Color(0.14, 0.18, 0.17, 0.96), Color(0.96, 0.77, 0.36, 0.98), 2))
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text = label_text
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color(0.98, 0.94, 0.82, 1.0))
	label.custom_minimum_size = Vector2(118, 46)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	panel.add_child(label)
	return panel


func _apply_slot_style() -> void:
	var normal_border := Color(0.43, 0.48, 0.41, 0.76)
	if drop_enabled or highlight_drop_target:
		normal_border = Color(0.73, 0.62, 0.36, 0.86)
	add_theme_stylebox_override("normal", _slot_style(Color(0.08, 0.11, 0.10, 0.74), normal_border, 1))
	add_theme_stylebox_override("hover", _slot_style(Color(0.14, 0.18, 0.16, 0.88), Color(0.90, 0.74, 0.38, 0.96), 2))
	add_theme_stylebox_override("pressed", _slot_style(Color(0.18, 0.22, 0.18, 0.94), Color(1.0, 0.82, 0.32, 1.0), 2))
	add_theme_stylebox_override("focus", _slot_style(Color(0.13, 0.17, 0.15, 0.88), Color(0.72, 0.88, 0.92, 0.88), 2))
	add_theme_stylebox_override("disabled", _slot_style(Color(0.05, 0.06, 0.06, 0.38), Color(0.32, 0.34, 0.32, 0.46), 1))
	add_theme_color_override("font_color", Color(0.96, 0.93, 0.84, 1.0))
	add_theme_color_override("font_hover_color", Color(1.0, 0.95, 0.78, 1.0))
	add_theme_color_override("font_pressed_color", Color(1.0, 0.88, 0.48, 1.0))
	add_theme_color_override("font_disabled_color", Color(0.68, 0.68, 0.62, 0.70))


func _slot_style(background: Color, border: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(6)
	style.content_margin_left = 4
	style.content_margin_right = 4
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	return style
