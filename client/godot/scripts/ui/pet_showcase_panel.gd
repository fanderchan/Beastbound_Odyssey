extends PanelContainer

signal rename_requested

const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")
const PetGrowthQualityBadge := preload("res://scripts/ui/pet_growth_quality_badge.gd")
const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")
const PetShowcaseArtCatalog := preload("res://scripts/ui/pet_showcase_art_catalog.gd")

const IDLE_FRAME_SECONDS := 0.14

var _name_label: Label
var _form_label: Label
var _quality_badge: Control
var _portrait: TextureRect
var _fallback_panel: PanelContainer
var _fallback_label: Label
var _level_label: Label
var _power_label: Label
var _state_label: Label
var _edit_button: Button
var _growth_stage_slot: CenterContainer
var _primary_action_slot: CenterContainer
var _timer: Timer
var _form_id := ""
var _elapsed := 0.0
var _uses_static_showcase := false


func _init() -> void:
	custom_minimum_size = Vector2(548.0, 0.0)
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_stylebox_override("panel", _showcase_style())
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 42)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_bottom", 4)
	add_child(margin)
	var showcase_canvas := Control.new()
	showcase_canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	showcase_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(showcase_canvas)
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 3)
	showcase_canvas.add_child(column)
	_name_label = Label.new()
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_label.custom_minimum_size.x = 370.0
	_name_label.size_flags_horizontal = Control.SIZE_SHRINK_END
	PetManagementVisualSkin.apply_title(_name_label, 27)
	column.add_child(_name_label)
	_form_label = Label.new()
	_form_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_form_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_form_label.custom_minimum_size.x = 370.0
	_form_label.size_flags_horizontal = Control.SIZE_SHRINK_END
	_form_label.add_theme_font_size_override("font_size", 14)
	_form_label.add_theme_color_override("font_color", PetManagementVisualSkin.MUTED_TEXT)
	column.add_child(_form_label)
	var badge_center := CenterContainer.new()
	badge_center.custom_minimum_size.x = 370.0
	badge_center.size_flags_horizontal = Control.SIZE_SHRINK_END
	column.add_child(badge_center)
	_quality_badge = PetGrowthQualityBadge.new()
	badge_center.add_child(_quality_badge)
	var portrait_frame := PanelContainer.new()
	portrait_frame.custom_minimum_size = Vector2(0.0, 258.0)
	portrait_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_frame.clip_contents = true
	portrait_frame.add_theme_stylebox_override("panel", _portrait_style())
	column.add_child(portrait_frame)
	var portrait_canvas := Control.new()
	portrait_canvas.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	portrait_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	portrait_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_frame.add_child(portrait_canvas)
	_portrait = TextureRect.new()
	_portrait.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_portrait.offset_left = 42.0
	_portrait.offset_right = 42.0
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	portrait_canvas.add_child(_portrait)
	_fallback_panel = PanelContainer.new()
	_fallback_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 18)
	_fallback_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fallback_panel.add_theme_stylebox_override("panel", _fallback_style())
	portrait_frame.add_child(_fallback_panel)
	_fallback_label = Label.new()
	_fallback_label.text = "◇\n形象制作中"
	_fallback_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_fallback_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_fallback_label.add_theme_font_size_override("font_size", 20)
	_fallback_label.add_theme_color_override("font_color", Color(0.74, 0.69, 0.56, 0.92))
	_fallback_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fallback_panel.add_child(_fallback_label)
	_growth_stage_slot = CenterContainer.new()
	_growth_stage_slot.custom_minimum_size = Vector2(0.0, 80.0)
	_growth_stage_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(_growth_stage_slot)
	var stat_row := Control.new()
	stat_row.custom_minimum_size = Vector2(0.0, 30.0)
	stat_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(stat_row)
	_level_label = _stat_label()
	_level_label.visible = false
	stat_row.add_child(_level_label)
	var power_paw := TextureRect.new()
	power_paw.position = Vector2(170.0, 1.0)
	power_paw.size = Vector2(28.0, 28.0)
	power_paw.texture = PetManagementVisualSkin.content_trimmed_texture(
		PetManagementVisualSkin.HEADER_PAW_TEXTURE
	)
	power_paw.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	power_paw.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	power_paw.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	power_paw.modulate = Color(0.96, 0.72, 0.28, 1.0)
	power_paw.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stat_row.add_child(power_paw)
	_power_label = _stat_label()
	_power_label.position = Vector2(205.0, 0.0)
	_power_label.size = Vector2(170.0, 30.0)
	_power_label.add_theme_font_size_override("font_size", 25)
	_power_label.add_theme_color_override("font_color", PetManagementVisualSkin.GOLD_TEXT)
	stat_row.add_child(_power_label)
	_state_label = Label.new()
	_state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_state_label.add_theme_font_size_override("font_size", 14)
	_state_label.add_theme_color_override("font_color", Color(0.78, 0.85, 0.72, 1.0))
	column.add_child(_state_label)
	_primary_action_slot = CenterContainer.new()
	_primary_action_slot.custom_minimum_size = Vector2(0.0, 40.0)
	_primary_action_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(_primary_action_slot)
	_timer = Timer.new()
	_timer.wait_time = IDLE_FRAME_SECONDS
	_timer.one_shot = false
	_timer.autostart = false
	_timer.timeout.connect(_on_idle_frame)
	add_child(_timer)
	_add_strategy_badge(showcase_canvas)
	_add_edit_button(showcase_canvas)
	configure({}, {})


func mount_primary_action(button: Button) -> void:
	if button == null or _primary_action_slot == null:
		return
	if button.get_parent() != null:
		button.get_parent().remove_child(button)
	button.custom_minimum_size = Vector2(150.0, 40.0)
	var action_canvas := Control.new()
	action_canvas.custom_minimum_size = Vector2(440.0, 40.0)
	_primary_action_slot.add_child(action_canvas)
	button.position = Vector2(192.0, 0.0)
	button.size = Vector2(150.0, 40.0)
	action_canvas.add_child(button)


func mount_growth_stage_row(stage_row: Control) -> void:
	if stage_row == null or _growth_stage_slot == null:
		return
	if stage_row.get_parent() != null:
		stage_row.get_parent().remove_child(stage_row)
	stage_row.custom_minimum_size = Vector2(360.0, 78.0)
	var stage_canvas := Control.new()
	stage_canvas.custom_minimum_size = Vector2(440.0, 78.0)
	stage_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_growth_stage_slot.add_child(stage_canvas)
	stage_row.position = Vector2(75.0, 0.0)
	stage_row.size = Vector2(360.0, 78.0)
	stage_canvas.add_child(stage_row)


func configure(instance: Dictionary, quality_view: Dictionary) -> void:
	if instance.is_empty():
		_form_id = ""
		_name_label.text = "请选择宠物"
		_form_label.text = ""
		_level_label.text = "Lv-"
		_power_label.text = "战力-"
		_state_label.text = ""
		_edit_button.visible = false
		_portrait.texture = null
		_portrait.visible = false
		_fallback_panel.visible = true
		_fallback_label.text = "◇\n暂无宠物"
		_quality_badge.call("configure", quality_view)
		_timer.stop()
		return
	_form_id = str(instance.get(
		"formId",
		instance.get("templateId", instance.get("speciesId", ""))
	)).strip_edges()
	_name_label.text = str(instance.get("name", instance.get("displayName", "宠物")))
	_form_label.text = "%s｜%s" % [
		str(instance.get("formName", "未知形态")),
		_stage_text(instance),
	]
	_level_label.text = "Lv.%d" % maxi(1, int(instance.get("level", 1)))
	_power_label.text = "战力  %d" % maxi(0, int(instance.get("combatPower", 0)))
	if int(instance.get("combatPower", 0)) <= 0:
		_power_label.text = "战力  待计算"
	_state_label.text = str(instance.get("_uiStateText", ""))
	_edit_button.visible = true
	_quality_badge.call("configure", quality_view)
	_elapsed = 0.0
	_update_portrait()
	if _portrait.visible and not _uses_static_showcase and is_visible_in_tree():
		_timer.start()
	else:
		_timer.stop()


func snapshot() -> Dictionary:
	return {
		"name": _name_label.text,
		"form": _form_label.text,
		"level": _level_label.text,
		"power": _power_label.text,
		"state": _state_label.text,
		"formId": _form_id,
		"usesFormalArt": _portrait.visible and _portrait.texture != null,
		"usesShowcaseArt": _uses_static_showcase,
		"showcaseArtPath": PetShowcaseArtCatalog.asset_path_for_form(_form_id),
		"quality": _quality_badge.call("snapshot") if _quality_badge != null else {},
	}


func _on_idle_frame() -> void:
	if not is_visible_in_tree() or _form_id == "":
		_timer.stop()
		return
	_elapsed += IDLE_FRAME_SECONDS
	_update_portrait()


func _update_portrait() -> void:
	var texture := PetShowcaseArtCatalog.texture_for_form(_form_id)
	_uses_static_showcase = texture != null
	if texture == null and PetActionAssetCatalog.supports_world_form(_form_id):
		texture = PetActionAssetCatalog.world_texture_for_elapsed(
			_form_id,
			"south",
			"idle",
			_elapsed
		)
	if texture == null and PetActionAssetCatalog.supports_form(_form_id):
		texture = PetActionAssetCatalog.texture_for_elapsed(
			_form_id,
			"front_3quarter_sw",
			"idle",
			_elapsed
		)
	_portrait.texture = PetManagementVisualSkin.content_trimmed_texture(texture)
	_portrait.visible = texture != null
	_fallback_panel.visible = texture == null
	if texture == null:
		_fallback_label.text = "◇\n形象制作中"


func _stage_text(instance: Dictionary) -> String:
	if PetGrowthObservationModel.is_fusion_pet(instance):
		return "融合"
	if PetGrowthObservationModel.is_evolution_pet(instance):
		return "进化"
	var cultivation = instance.get("petCultivation", {})
	var rebirth_count := int((cultivation as Dictionary).get("rebirthCount", 0)) if cultivation is Dictionary else 0
	return "%d转" % clampi(rebirth_count, 0, 2)


func _stat_label() -> Label:
	var label := Label.new()
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 17)
	label.add_theme_color_override("font_color", PetManagementVisualSkin.CREAM_TEXT)
	return label


func _showcase_style() -> StyleBoxFlat:
	return PetManagementVisualSkin.transparent_panel_style()


func _portrait_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.0)
	style.corner_radius_top_left = 36
	style.corner_radius_top_right = 36
	style.corner_radius_bottom_left = 36
	style.corner_radius_bottom_right = 36
	return style


func _fallback_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.13, 0.11, 0.09, 0.82)
	style.border_color = Color(0.48, 0.39, 0.24, 0.58)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 24
	style.corner_radius_top_right = 24
	style.corner_radius_bottom_left = 24
	style.corner_radius_bottom_right = 24
	return style


func _add_strategy_badge(parent: Control) -> void:
	var badge := TextureRect.new()
	badge.position = Vector2(70.0, -8.0)
	badge.size = Vector2(64.0, 86.0)
	badge.texture = PetManagementVisualSkin.content_trimmed_texture(
		PetManagementVisualSkin.STRATEGY_BANNER_TEXTURE
	)
	badge.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	badge.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	badge.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(badge)
	var label := Label.new()
	label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label.text = "攻\n略"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", Color(0.95, 0.92, 0.78, 1.0))
	label.add_theme_color_override("font_outline_color", Color(0.08, 0.05, 0.02, 0.94))
	label.add_theme_constant_override("outline_size", 2)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(label)


func _add_edit_button(parent: Control) -> void:
	_edit_button = Button.new()
	_edit_button.position = Vector2(350.0, 0.0)
	_edit_button.size = Vector2(28.0, 28.0)
	_edit_button.flat = true
	_edit_button.icon = PetManagementVisualSkin.content_trimmed_texture(
		PetManagementVisualSkin.EDIT_ICON_TEXTURE
	)
	_edit_button.expand_icon = true
	_edit_button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_edit_button.tooltip_text = "修改宠物名字"
	_edit_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_edit_button.pressed.connect(func() -> void:
		rename_requested.emit()
	)
	parent.add_child(_edit_button)
