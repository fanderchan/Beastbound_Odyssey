extends Button

const PetGrowthQualityModel := preload("res://scripts/progression/pet_growth_quality_model.gd")
const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")
const PetPortraitArtCatalog := preload("res://scripts/ui/pet_portrait_art_catalog.gd")
const PetStateBadgeControl := preload("res://scripts/ui/pet_state_badge_control.gd")

var _badge: Control
var _selection_label: Label
var _portrait: TextureRect
var _portrait_fallback: Label
var _name_label: Label
var _quality_label: Label
var _flags_label: Label
var _meta_label: Label
var _primary_text := ""
var _secondary_text := ""
var _form_id := ""
var _quality_view: Dictionary = {}
var _uses_formal_portrait := false


func _init() -> void:
	text = ""
	custom_minimum_size = Vector2(87.0, 98.0)
	clip_contents = true
	_build_content()
	_apply_card_styles(false)


func configure(view: Dictionary) -> void:
	var state_id := str(view.get("stateId", "standby"))
	var state_text := str(view.get("stateText", "待机"))
	var pet_name := str(view.get("name", "宠物"))
	var level := maxi(1, int(view.get("level", 1)))
	var power := maxi(0, int(view.get("power", 0)))
	var selected := bool(view.get("selected", false))
	_form_id = str(view.get("formId", "")).strip_edges()
	var raw_quality = view.get("quality", {})
	_quality_view = (
		(raw_quality as Dictionary).duplicate(true)
		if raw_quality is Dictionary
		else PetGrowthQualityModel.unobserved_presentation(level)
	)
	_badge.call("configure", state_id, state_text)
	_selection_label.text = "◆" if selected else ""
	_name_label.text = pet_name
	var flags: Array[String] = []
	if state_text != "":
		flags.append(state_text)
	if bool(view.get("following", false)):
		flags.append("游")
	if bool(view.get("isNew", false)):
		flags.append("新")
	if bool(view.get("locked", false)):
		flags.append("锁")
	_flags_label.text = " ".join(flags)
	_quality_label.text = str(_quality_view.get("badgeText", "成长未观察"))
	_quality_label.add_theme_color_override(
		"font_color",
		PetGrowthQualityModel.color_for_tone(
			str(_quality_view.get("toneId", "unobserved")),
			str(_quality_view.get("colorHex", ""))
		)
	)
	_secondary_text = "Lv%d  战力%d" % [level, power]
	_meta_label.text = "Lv.%d" % level
	_primary_text = "%s %s" % [state_text, pet_name]
	tooltip_text = "%s · %s · %s\n%s" % [
		state_text,
		pet_name,
		_secondary_text,
		str(_quality_view.get("statusText", "")),
	]
	_update_portrait()
	_apply_card_styles(selected)


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


func quality_badge_text() -> String:
	return _quality_label.text


func uses_formal_art() -> bool:
	return _uses_formal_portrait


func uses_formal_portrait() -> bool:
	return _uses_formal_portrait


func portrait_asset_path() -> String:
	return PetPortraitArtCatalog.resource_path_for_form(_form_id) if _uses_formal_portrait else ""


func shows_portrait_fallback() -> bool:
	return _portrait_fallback.visible


func _build_content() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 7)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 7)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)
	var art_frame := PanelContainer.new()
	art_frame.custom_minimum_size = Vector2(71.0, 65.0)
	art_frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	art_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	art_frame.clip_contents = true
	art_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var art_style := StyleBoxFlat.new()
	art_style.bg_color = Color(0.035, 0.030, 0.026, 0.64)
	art_style.corner_radius_top_left = 8
	art_style.corner_radius_top_right = 8
	art_style.corner_radius_bottom_left = 8
	art_style.corner_radius_bottom_right = 8
	art_frame.add_theme_stylebox_override("panel", art_style)
	column.add_child(art_frame)
	var portrait_canvas := Control.new()
	portrait_canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_frame.add_child(portrait_canvas)
	_portrait = TextureRect.new()
	_portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_canvas.add_child(_portrait)
	_portrait_fallback = Label.new()
	_portrait_fallback.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait_fallback.text = "◇"
	_portrait_fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_portrait_fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_portrait_fallback.add_theme_font_size_override("font_size", 24)
	_portrait_fallback.add_theme_color_override("font_color", Color(0.65, 0.61, 0.51, 0.90))
	_portrait_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_frame.add_child(_portrait_fallback)
	_selection_label = Label.new()
	_selection_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_selection_label.offset_left = -20.0
	_selection_label.offset_bottom = 20.0
	_selection_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_selection_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_selection_label.add_theme_font_size_override("font_size", 11)
	_selection_label.add_theme_color_override("font_color", Color(1.0, 0.87, 0.36, 1.0))
	_selection_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_frame.add_child(_selection_label)
	_name_label = Label.new()
	_name_label.visible = false
	_name_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_name_label.offset_top = -23.0
	_name_label.offset_bottom = -3.0
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_label.add_theme_font_size_override("font_size", 12)
	_name_label.add_theme_color_override("font_color", PetManagementVisualSkin.CREAM_TEXT)
	_name_label.add_theme_color_override("font_outline_color", Color(0.02, 0.02, 0.02, 0.94))
	_name_label.add_theme_constant_override("outline_size", 2)
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_frame.add_child(_name_label)
	_flags_label = Label.new()
	_flags_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	_flags_label.offset_right = 58.0
	_flags_label.offset_bottom = 20.0
	_flags_label.add_theme_font_size_override("font_size", 10)
	_flags_label.add_theme_color_override("font_color", Color(0.93, 0.78, 0.39, 1.0))
	_flags_label.add_theme_color_override("font_outline_color", Color(0.02, 0.02, 0.02, 0.94))
	_flags_label.add_theme_constant_override("outline_size", 2)
	_flags_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	art_frame.add_child(_flags_label)
	_quality_label = Label.new()
	_quality_label.visible = false
	_quality_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_quality_label.add_theme_font_size_override("font_size", 12)
	_quality_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_quality_label)
	_meta_label = Label.new()
	_meta_label.custom_minimum_size = Vector2(0.0, 20.0)
	_meta_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_meta_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_meta_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_meta_label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	_meta_label.add_theme_font_size_override("font_size", 11)
	_meta_label.add_theme_color_override("font_color", PetManagementVisualSkin.CREAM_TEXT)
	_meta_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_meta_label)
	_badge = PetStateBadgeControl.new()
	_badge.visible = false
	_badge.scale = Vector2(0.68, 0.68)
	_badge.custom_minimum_size = Vector2(44.0, 18.0)
	column.add_child(_badge)


func _update_portrait() -> void:
	var texture := PetPortraitArtCatalog.texture_for_form(_form_id)
	_uses_formal_portrait = texture != null
	_portrait.texture = texture
	_portrait.visible = _uses_formal_portrait
	_portrait_fallback.visible = not _uses_formal_portrait


func _apply_card_styles(selected: bool) -> void:
	var accent := PetGrowthQualityModel.color_for_tone(
		str(_quality_view.get("toneId", "unobserved")),
		str(_quality_view.get("colorHex", ""))
	)
	add_theme_stylebox_override(
		"normal",
		PetManagementVisualSkin.roster_style(selected, accent)
	)
	add_theme_stylebox_override(
		"hover",
		PetManagementVisualSkin.roster_style(true, accent, true)
	)
	add_theme_stylebox_override(
		"pressed",
		PetManagementVisualSkin.roster_style(true, accent)
	)
	add_theme_stylebox_override(
		"focus",
		PetManagementVisualSkin.roster_style(true, accent, true)
	)
