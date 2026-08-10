extends Button

const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")
const PetPortraitArtCatalog := preload("res://scripts/ui/pet_portrait_art_catalog.gd")
const FRAME_NORMAL_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/stage_frame_normal.png"
)
const FRAME_SELECTED_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/stage_frame_selected.png"
)

var _portrait: TextureRect
var _portrait_fallback: Label
var _frame: TextureRect
var _label: Label
var _form_id := ""
var _uses_formal_portrait := false


func _init() -> void:
	text = ""
	toggle_mode = true
	flat = true
	custom_minimum_size = Vector2(104.0, 78.0)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in [
		"font_color",
		"font_hover_color",
		"font_pressed_color",
		"font_focus_color",
		"font_disabled_color",
	]:
		add_theme_color_override(state, Color.TRANSPARENT)
	for style_name in ["normal", "hover", "pressed", "focus", "disabled"]:
		add_theme_stylebox_override(
			style_name,
			PetManagementVisualSkin.transparent_panel_style()
		)
	_portrait = TextureRect.new()
	_portrait.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_portrait.offset_left = -25.0
	_portrait.offset_top = 3.0
	_portrait.offset_right = 25.0
	_portrait.offset_bottom = 53.0
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_portrait)
	_portrait_fallback = Label.new()
	_portrait_fallback.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_portrait_fallback.offset_left = -25.0
	_portrait_fallback.offset_top = 3.0
	_portrait_fallback.offset_right = 25.0
	_portrait_fallback.offset_bottom = 53.0
	_portrait_fallback.text = "◇"
	_portrait_fallback.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_portrait_fallback.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_portrait_fallback.add_theme_font_size_override("font_size", 23)
	_portrait_fallback.add_theme_color_override(
		"font_color",
		Color(0.65, 0.61, 0.51, 0.90)
	)
	_portrait_fallback.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_portrait_fallback)
	_frame = TextureRect.new()
	_frame.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_frame.offset_left = -31.0
	_frame.offset_top = -2.0
	_frame.offset_right = 31.0
	_frame.offset_bottom = 60.0
	_frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_frame.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_frame.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame)
	_label = Label.new()
	_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_label.offset_top = -22.0
	_label.offset_bottom = 0.0
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	_label.add_theme_font_size_override("font_size", 13)
	_label.add_theme_color_override("font_color", PetManagementVisualSkin.CREAM_TEXT)
	_label.add_theme_color_override("font_outline_color", Color(0.04, 0.02, 0.01, 0.96))
	_label.add_theme_constant_override("outline_size", 2)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_label)
	set_selected_visual(false)


func configure_stage(label_text: String, form_id: String, selected: bool) -> void:
	text = label_text
	_label.text = label_text
	_form_id = form_id.strip_edges()
	var texture := PetPortraitArtCatalog.texture_for_form(_form_id)
	_uses_formal_portrait = texture != null
	_portrait.texture = texture
	_portrait.visible = _uses_formal_portrait
	_portrait_fallback.visible = not _uses_formal_portrait
	set_selected_visual(selected)


func set_selected_visual(selected: bool) -> void:
	_frame.texture = PetManagementVisualSkin.content_trimmed_texture(
		FRAME_SELECTED_TEXTURE if selected else FRAME_NORMAL_TEXTURE
	)
	_label.add_theme_color_override(
		"font_color",
		Color(1.0, 0.86, 0.42, 1.0) if selected else PetManagementVisualSkin.CREAM_TEXT
	)


func art_form_id() -> String:
	return _form_id


func uses_formal_art() -> bool:
	return _uses_formal_portrait


func uses_formal_portrait() -> bool:
	return _uses_formal_portrait


func portrait_asset_path() -> String:
	return PetPortraitArtCatalog.resource_path_for_form(_form_id) if _uses_formal_portrait else ""


func shows_portrait_fallback() -> bool:
	return _portrait_fallback.visible
