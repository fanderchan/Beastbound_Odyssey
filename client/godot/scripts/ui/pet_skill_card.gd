extends Button

const PetSkillIconCatalog := preload("res://scripts/ui/pet_skill_icon_catalog.gd")
const PetSkillVisualSkin := preload("res://scripts/ui/pet_skill_visual_skin.gd")
const EMPTY_ICON_PATH := (
	"res://assets/skills/pet_skill_icons_v1/runtime/common/empty_skill_slot.png"
)
const EMPTY_ICON_TEXTURE := preload(
	"res://assets/skills/pet_skill_icons_v1/runtime/common/empty_skill_slot.png"
)

var _view: Dictionary = {}
var _selected := false
var _icon_frame: PanelContainer
var _icon: TextureRect
var _icon_fallback: Label
var _empty_icon: TextureRect
var _name_label: Label
var _source_label: Label
var _type_tag: PanelContainer
var _type_label: Label
var _lock_label: Label
var _detail_panel: PanelContainer
var _description_label: Label
var _effect_label: Label
var _target_label: Label
var _uses_formal_icon := false
var _formal_icon_path := ""


func _init() -> void:
	custom_minimum_size = Vector2(
		PetSkillVisualSkin.CARD_WIDTH,
		PetSkillVisualSkin.CARD_COLLAPSED_HEIGHT
	)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_build_content()
	_apply_view()


func configure(view: Dictionary, selected_override = null) -> void:
	_view = view.duplicate(true)
	var next_selected := bool(_view.get("selected", false))
	if selected_override != null:
		next_selected = bool(selected_override)
	_selected = next_selected
	_apply_view()


func set_selected_visual(selected: bool) -> void:
	if _selected == selected:
		return
	_selected = selected
	_apply_selection()


func card_key() -> String:
	return str(_view.get("cardKey", ""))


func ability_id() -> String:
	return str(_view.get("abilityId", ""))


func ability_kind() -> String:
	return str(_view.get("kind", ""))


func slot() -> int:
	return int(_view.get("slot", 0))


func is_empty_slot() -> bool:
	return bool(_view.get("isEmpty", false))


func uses_formal_icon() -> bool:
	return _uses_formal_icon


func icon_asset_path() -> String:
	return _formal_icon_path if _uses_formal_icon else ""


func snapshot() -> Dictionary:
	return {
		"cardKey": card_key(),
		"abilityId": ability_id(),
		"skillId": str(_view.get("skillId", ability_id())),
		"kind": ability_kind(),
		"slot": slot(),
		"label": _name_label.text if _name_label != null else "",
		"categoryText": _source_label.text if _source_label != null else "",
		"sourceText": _lock_label.text if _lock_label != null else "",
		"typeText": _type_label.text if _type_label != null else "",
		"descriptionText": _description_label.text if _description_label != null else "",
		"effectText": _effect_label.text if _effect_label != null else "",
		"targetText": _target_label.text if _target_label != null else "",
		"selected": _selected,
		"expanded": _detail_panel.visible if _detail_panel != null else false,
		"isEmpty": is_empty_slot(),
		"isLocked": bool(_view.get("isLocked", false)),
		"isTrainingCandidate": bool(_view.get("isTrainingCandidate", false)),
		"isClearAction": bool(_view.get("isClearAction", false)),
		"cost": maxi(0, int(_view.get("cost", 0))),
		"learned": bool(_view.get("learned", false)),
		"canLearn": bool(_view.get("canLearn", false)),
		"usesFormalIcon": _uses_formal_icon,
		"iconPath": icon_asset_path(),
		"usesFormalEmptyIcon": is_empty_slot() and _empty_icon.texture != null,
		"emptyIconPath": EMPTY_ICON_PATH if is_empty_slot() else "",
		"minimumWidth": custom_minimum_size.x,
		"minimumHeight": custom_minimum_size.y,
		"iconFrameSize": (
			_icon_frame.custom_minimum_size.x if _icon_frame != null else 0.0
		),
		"iconDisplaySize": _icon.custom_minimum_size.x if _icon != null else 0.0,
	}


func _build_content() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 8)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)

	var summary_row := HBoxContainer.new()
	summary_row.custom_minimum_size = Vector2(0.0, PetSkillVisualSkin.ICON_FRAME_SIZE)
	summary_row.add_theme_constant_override("separation", 10)
	summary_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(summary_row)

	_icon_frame = PanelContainer.new()
	_icon_frame.custom_minimum_size = Vector2(
		PetSkillVisualSkin.ICON_FRAME_SIZE,
		PetSkillVisualSkin.ICON_FRAME_SIZE
	)
	_icon_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary_row.add_child(_icon_frame)
	var icon_canvas := Control.new()
	icon_canvas.custom_minimum_size = Vector2(
		PetSkillVisualSkin.ICON_FRAME_SIZE,
		PetSkillVisualSkin.ICON_FRAME_SIZE
	)
	icon_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_icon_frame.add_child(icon_canvas)
	_icon = TextureRect.new()
	_icon.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_icon.offset_left = -PetSkillVisualSkin.ICON_SIZE * 0.5
	_icon.offset_top = -PetSkillVisualSkin.ICON_SIZE * 0.5
	_icon.offset_right = PetSkillVisualSkin.ICON_SIZE * 0.5
	_icon.offset_bottom = PetSkillVisualSkin.ICON_SIZE * 0.5
	_icon.custom_minimum_size = Vector2(
		PetSkillVisualSkin.ICON_SIZE,
		PetSkillVisualSkin.ICON_SIZE
	)
	_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_canvas.add_child(_icon)
	_icon_fallback = Label.new()
	_icon_fallback.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_icon_fallback.text = "无图"
	_icon_fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_icon_fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_icon_fallback.add_theme_font_size_override("font_size", 13)
	_icon_fallback.add_theme_color_override("font_color", Color(0.58, 0.53, 0.45, 0.88))
	_icon_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_canvas.add_child(_icon_fallback)
	_empty_icon = TextureRect.new()
	_empty_icon.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_empty_icon.offset_left = -PetSkillVisualSkin.ICON_SIZE * 0.5
	_empty_icon.offset_top = -PetSkillVisualSkin.ICON_SIZE * 0.5
	_empty_icon.offset_right = PetSkillVisualSkin.ICON_SIZE * 0.5
	_empty_icon.offset_bottom = PetSkillVisualSkin.ICON_SIZE * 0.5
	_empty_icon.custom_minimum_size = Vector2(
		PetSkillVisualSkin.ICON_SIZE,
		PetSkillVisualSkin.ICON_SIZE
	)
	_empty_icon.texture = EMPTY_ICON_TEXTURE
	_empty_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_empty_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_empty_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_empty_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_canvas.add_child(_empty_icon)

	var summary_column := VBoxContainer.new()
	summary_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	summary_column.add_theme_constant_override("separation", 2)
	summary_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary_row.add_child(summary_column)
	var title_row := HBoxContainer.new()
	title_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_row.add_theme_constant_override("separation", 6)
	title_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary_column.add_child(title_row)
	_name_label = Label.new()
	_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_row.add_child(_name_label)
	_type_tag = PanelContainer.new()
	_type_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_row.add_child(_type_tag)
	_type_label = Label.new()
	_type_label.custom_minimum_size = Vector2(66.0, 24.0)
	_type_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_type_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_type_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_type_tag.add_child(_type_label)
	_source_label = Label.new()
	_source_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_source_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary_column.add_child(_source_label)
	_lock_label = Label.new()
	_lock_label.text = ""
	_lock_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_lock_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	summary_column.add_child(_lock_label)

	_detail_panel = PanelContainer.new()
	_detail_panel.custom_minimum_size = Vector2(0.0, 60.0)
	_detail_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_detail_panel)
	var detail_column := VBoxContainer.new()
	detail_column.add_theme_constant_override("separation", 2)
	detail_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_detail_panel.add_child(detail_column)
	_description_label = Label.new()
	_description_label.custom_minimum_size = Vector2(0.0, 30.0)
	_description_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_description_label.max_lines_visible = 2
	_description_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_description_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	detail_column.add_child(_description_label)
	var tags_row := HBoxContainer.new()
	tags_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tags_row.add_theme_constant_override("separation", 5)
	tags_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	detail_column.add_child(tags_row)
	var effect_tag := PanelContainer.new()
	effect_tag.name = "EffectTag"
	effect_tag.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	effect_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tags_row.add_child(effect_tag)
	_effect_label = Label.new()
	_effect_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_effect_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	effect_tag.add_child(_effect_label)
	var target_tag := PanelContainer.new()
	target_tag.name = "TargetTag"
	target_tag.custom_minimum_size = Vector2(108.0, 0.0)
	target_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tags_row.add_child(target_tag)
	_target_label = Label.new()
	_target_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_target_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	target_tag.add_child(_target_label)


func _apply_view() -> void:
	if _name_label == null:
		return
	var kind := ability_kind()
	var is_empty := is_empty_slot()
	var accent := PetSkillVisualSkin.accent_for(kind, is_empty)
	_name_label.text = str(_view.get("label", "空技能位"))
	var category := str(_view.get("categoryLabel", ""))
	var source := str(_view.get("sourceLabel", ""))
	var secondary_parts: Array[String] = []
	if slot() > 0:
		secondary_parts.append("技能槽%d" % slot())
	if category != "":
		secondary_parts.append(category)
	_source_label.text = " · ".join(secondary_parts)
	_lock_label.text = source
	_type_label.text = str(_view.get("typeLabel", "主动技能"))
	_description_label.text = str(_view.get("description", ""))
	_effect_label.text = "效果 · %s" % str(_view.get("effectSummary", "未配置"))
	_target_label.text = "目标 · %s" % str(_view.get("targetSummary", "未配置"))
	var icon := PetSkillIconCatalog.texture_for_view(_view)
	_icon.texture = icon
	_uses_formal_icon = icon != null
	_formal_icon_path = PetSkillIconCatalog.resource_path_for(
		ability_id(),
		kind,
		str(_view.get("iconPath", ""))
	)
	_icon.visible = _uses_formal_icon and not is_empty
	_icon_fallback.visible = not _uses_formal_icon and not is_empty
	_empty_icon.visible = is_empty
	_icon_frame.add_theme_stylebox_override(
		"panel",
		PetSkillVisualSkin.icon_frame_style(kind, _selected, is_empty)
	)
	_type_tag.add_theme_stylebox_override(
		"panel",
		PetSkillVisualSkin.tag_style(kind)
	)
	var effect_tag := _effect_label.get_parent() as PanelContainer
	effect_tag.add_theme_stylebox_override(
		"panel",
		PetSkillVisualSkin.tag_style(kind)
	)
	var target_tag := _target_label.get_parent() as PanelContainer
	target_tag.add_theme_stylebox_override(
		"panel",
		PetSkillVisualSkin.tag_style(kind, true)
	)
	PetSkillVisualSkin.apply_name_label(_name_label, _selected)
	PetSkillVisualSkin.apply_secondary_label(_source_label, accent)
	PetSkillVisualSkin.apply_secondary_label(
		_lock_label,
		PetSkillVisualSkin.LOCKED_ACCENT if bool(_view.get("isLocked", false)) else accent
	)
	PetSkillVisualSkin.apply_tag_label(_type_label, kind)
	PetSkillVisualSkin.apply_body_label(_description_label)
	PetSkillVisualSkin.apply_tag_label(_effect_label, kind)
	PetSkillVisualSkin.apply_tag_label(_target_label, kind, true)
	tooltip_text = "%s\n%s\n%s\n%s" % [
		_name_label.text,
		_description_label.text,
		_effect_label.text,
		_target_label.text,
	]
	_apply_selection()


func _apply_selection() -> void:
	if _detail_panel == null:
		return
	var kind := ability_kind()
	var is_empty := is_empty_slot()
	custom_minimum_size = Vector2(
		PetSkillVisualSkin.CARD_WIDTH,
		PetSkillVisualSkin.CARD_EXPANDED_HEIGHT
		if _selected
		else PetSkillVisualSkin.CARD_COLLAPSED_HEIGHT
	)
	_detail_panel.visible = _selected
	_detail_panel.add_theme_stylebox_override(
		"panel",
		PetSkillVisualSkin.detail_style(kind, is_empty)
	)
	PetSkillVisualSkin.apply_card_button(self, kind, _selected, is_empty)
	_icon_frame.add_theme_stylebox_override(
		"panel",
		PetSkillVisualSkin.icon_frame_style(kind, _selected, is_empty)
	)
	PetSkillVisualSkin.apply_name_label(_name_label, _selected)
