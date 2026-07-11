extends Button

const PetStateBadgeControl := preload("res://scripts/ui/pet_state_badge_control.gd")

var _badge: Control
var _selection_label: Label
var _name_label: Label
var _flags_label: Label
var _meta_label: Label
var _primary_text := ""
var _secondary_text := ""


func _init() -> void:
	text = ""
	custom_minimum_size = Vector2(196.0, 64.0)
	clip_contents = true
	_build_content()


func configure(view: Dictionary) -> void:
	var state_id := str(view.get("stateId", "standby"))
	var state_text := str(view.get("stateText", "待机"))
	var pet_name := str(view.get("name", "宠物"))
	var level := maxi(1, int(view.get("level", 1)))
	var power := maxi(0, int(view.get("power", 0)))
	_badge.call("configure", state_id, state_text)
	_selection_label.text = "▶" if bool(view.get("selected", false)) else ""
	_name_label.text = pet_name
	var flags: Array[String] = []
	if bool(view.get("following", false)):
		flags.append("游")
	if bool(view.get("isNew", false)):
		flags.append("新")
	if bool(view.get("locked", false)):
		flags.append("锁")
	_flags_label.text = " ".join(flags)
	_secondary_text = "Lv%d    战力%d" % [level, power]
	_meta_label.text = _secondary_text
	_primary_text = "%s %s" % [state_text, pet_name]
	tooltip_text = "%s · %s · %s" % [state_text, pet_name, _secondary_text]


func state_badge_id() -> String:
	return str(_badge.call("state_id"))


func state_badge_text() -> String:
	return str(_badge.call("badge_text"))


func state_badge_accent_color() -> Color:
	return _badge.call("accent_color") as Color


func state_badge_asset_path() -> String:
	return str(_badge.call("texture_asset_path"))


func state_badge_uses_texture() -> bool:
	return bool(_badge.call("uses_texture_asset"))


func primary_line_text() -> String:
	return _primary_text


func secondary_line_text() -> String:
	return _secondary_text


func pet_name_text() -> String:
	return _name_label.text


func _build_content() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 5)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 5)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)
	var primary_row := HBoxContainer.new()
	primary_row.custom_minimum_size = Vector2(0.0, 26.0)
	primary_row.add_theme_constant_override("separation", 6)
	primary_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(primary_row)
	_selection_label = Label.new()
	_selection_label.custom_minimum_size = Vector2(16.0, 0.0)
	_selection_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_selection_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_selection_label.add_theme_font_size_override("font_size", 13)
	_selection_label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.50, 1.0))
	_selection_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	primary_row.add_child(_selection_label)
	_badge = PetStateBadgeControl.new()
	primary_row.add_child(_badge)
	_name_label = Label.new()
	_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_label.add_theme_font_size_override("font_size", 17)
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	primary_row.add_child(_name_label)
	_flags_label = Label.new()
	_flags_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_flags_label.add_theme_font_size_override("font_size", 12)
	_flags_label.add_theme_color_override("font_color", Color(0.93, 0.78, 0.39, 1.0))
	_flags_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	primary_row.add_child(_flags_label)
	var secondary_row := HBoxContainer.new()
	secondary_row.add_theme_constant_override("separation", 0)
	secondary_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(secondary_row)
	var secondary_indent := Control.new()
	secondary_indent.custom_minimum_size = Vector2(22.0, 0.0)
	secondary_indent.mouse_filter = Control.MOUSE_FILTER_IGNORE
	secondary_row.add_child(secondary_indent)
	_meta_label = Label.new()
	_meta_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_meta_label.add_theme_font_size_override("font_size", 14)
	_meta_label.add_theme_color_override("font_color", Color(0.78, 0.82, 0.82, 1.0))
	_meta_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	secondary_row.add_child(_meta_label)
