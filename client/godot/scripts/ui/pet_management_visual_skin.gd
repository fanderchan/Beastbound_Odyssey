extends RefCounted

const BACKDROP_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/pet_management_backdrop_1280x720.png"
)
const TAB_NORMAL_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/tab_normal.png"
)
const TAB_SELECTED_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/tab_selected.png"
)
const BUTTON_NORMAL_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/button_normal.png"
)
const BUTTON_SELECTED_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/button_selected.png"
)
const PORTRAIT_SLOT_NORMAL_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/portrait_slot_normal.png"
)
const PORTRAIT_SLOT_SELECTED_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/portrait_slot_selected.png"
)
const HEADER_PAW_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/header_paw.png"
)
const HELP_MEDALLION_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/help_medallion.png"
)
const STRATEGY_BANNER_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/strategy_banner.png"
)
const CODEX_BADGE_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/codex_badge.png"
)
const CLOSE_ICON_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/close_icon.png"
)
const EDIT_ICON_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/edit_icon.png"
)
const ROSTER_UP_DOWN_CONTROL_TEXTURE := preload(
	"res://assets/ui/pet_management_awakened_v2/runtime/roster_up_down_control.png"
)

const CREAM_TEXT := Color(0.96, 0.90, 0.76, 1.0)
const BROWN_TEXT := Color(0.25, 0.15, 0.09, 1.0)
const MUTED_TEXT := Color(0.70, 0.67, 0.59, 1.0)
const GOLD_TEXT := Color(1.0, 0.72, 0.23, 1.0)

static var _trimmed_texture_cache: Dictionary = {}
static var _display_font: SystemFont
static var _body_font: SystemFont


static func display_font() -> Font:
	if _display_font == null:
		_display_font = SystemFont.new()
		_display_font.font_names = PackedStringArray([
			"Hiragino Sans GB W6",
			"PingFang SC",
			"Noto Sans CJK SC Black",
			"Hiragino Sans GB",
			"Noto Sans CJK SC",
			"Microsoft YaHei",
		])
		_display_font.font_weight = 700
	return _display_font


static func body_font() -> Font:
	if _body_font == null:
		_body_font = SystemFont.new()
		_body_font.font_names = PackedStringArray([
			"Hiragino Sans GB",
			"Heiti SC",
			"STHeiti",
			"Microsoft YaHei",
			"Noto Sans CJK SC",
			"Source Han Sans SC",
			"WenQuanYi Micro Hei",
			"Arial Unicode MS",
			"PingFang SC",
			"Noto Sans",
		])
		_body_font.font_weight = 500
	return _body_font


static func content_trimmed_texture(texture: Texture2D) -> Texture2D:
	if texture == null:
		return null
	var cache_key := texture.resource_path
	if cache_key == "":
		cache_key = str(texture.get_rid().get_id())
	if _trimmed_texture_cache.has(cache_key):
		return _trimmed_texture_cache.get(cache_key) as Texture2D
	var image := texture.get_image()
	if image == null or image.is_empty():
		return texture
	var used_rect := image.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return texture
	var padded_position := Vector2i(
		maxi(0, used_rect.position.x - 2),
		maxi(0, used_rect.position.y - 2)
	)
	var padded_end := Vector2i(
		mini(image.get_width(), used_rect.end.x + 2),
		mini(image.get_height(), used_rect.end.y + 2)
	)
	var region := Rect2i(padded_position, padded_end - padded_position)
	if region.size == image.get_size():
		_trimmed_texture_cache[cache_key] = texture
		return texture
	var trimmed := AtlasTexture.new()
	trimmed.atlas = texture
	trimmed.region = Rect2(region)
	_trimmed_texture_cache[cache_key] = trimmed
	return trimmed


static func add_backdrop(parent: Control) -> TextureRect:
	var backdrop := TextureRect.new()
	backdrop.name = "PetManagementBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(backdrop)
	return backdrop


static func transparent_panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.0)
	style.content_margin_left = 0.0
	style.content_margin_top = 0.0
	style.content_margin_right = 0.0
	style.content_margin_bottom = 0.0
	return style


static func dark_inset_style(alpha: float = 0.62, radius: int = 10) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.037, 0.030, alpha)
	style.border_color = Color(0.34, 0.25, 0.16, minf(0.72, alpha))
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	return style


static func apply_title(label: Label, font_size: int = 26) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", CREAM_TEXT)
	label.add_theme_color_override("font_outline_color", Color(0.08, 0.04, 0.02, 0.92))
	label.add_theme_constant_override("outline_size", 3)


static func apply_close_button(button: Button) -> void:
	button.text = ""
	button.flat = true
	button.custom_minimum_size = Vector2(58.0, 48.0)
	button.icon = content_trimmed_texture(CLOSE_ICON_TEXTURE)
	button.expand_icon = true
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 42)
	button.add_theme_color_override("font_color", Color(0.86, 0.25, 0.10, 1.0))
	button.add_theme_color_override("font_hover_color", Color(1.0, 0.43, 0.18, 1.0))
	button.add_theme_color_override("font_pressed_color", Color(0.72, 0.16, 0.08, 1.0))
	button.add_theme_color_override("font_outline_color", Color(0.16, 0.06, 0.02, 0.90))
	button.add_theme_constant_override("outline_size", 3)


static func apply_tab_button(button: Button) -> void:
	button.custom_minimum_size = Vector2(126.0, 52.0)
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 19)
	button.add_theme_color_override("font_color", CREAM_TEXT)
	button.add_theme_color_override("font_hover_color", BROWN_TEXT)
	button.add_theme_color_override("font_pressed_color", BROWN_TEXT)
	button.add_theme_color_override("font_focus_color", BROWN_TEXT)
	button.add_theme_color_override("font_outline_color", Color(0.10, 0.05, 0.02, 0.72))
	button.add_theme_constant_override("outline_size", 1)
	button.add_theme_stylebox_override("normal", _texture_style(TAB_NORMAL_TEXTURE))
	button.add_theme_stylebox_override("hover", _texture_style(TAB_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("pressed", _texture_style(TAB_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("focus", _texture_style(TAB_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(TAB_NORMAL_TEXTURE))


static func apply_action_button(button: Button, compact: bool = false) -> void:
	button.custom_minimum_size = Vector2(0.0, 34.0 if compact else 42.0)
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 14 if compact else 16)
	button.add_theme_color_override("font_color", BROWN_TEXT)
	button.add_theme_color_override("font_hover_color", BROWN_TEXT)
	button.add_theme_color_override("font_pressed_color", BROWN_TEXT)
	button.add_theme_color_override("font_focus_color", BROWN_TEXT)
	button.add_theme_color_override("font_disabled_color", Color(0.33, 0.27, 0.21, 0.64))
	button.add_theme_stylebox_override("normal", _texture_style(BUTTON_NORMAL_TEXTURE))
	button.add_theme_stylebox_override("hover", _texture_style(BUTTON_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("pressed", _texture_style(BUTTON_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("focus", _texture_style(BUTTON_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(BUTTON_NORMAL_TEXTURE))


static func apply_option_button(option: OptionButton) -> void:
	option.custom_minimum_size.y = 32.0
	option.add_theme_font_override("font", body_font())
	option.add_theme_font_size_override("font_size", 13)
	option.add_theme_color_override("font_color", CREAM_TEXT)
	option.add_theme_color_override("font_hover_color", Color(1.0, 0.86, 0.52, 1.0))
	option.add_theme_stylebox_override("normal", dark_inset_style(0.78, 7))
	option.add_theme_stylebox_override("hover", dark_inset_style(0.92, 7))
	option.add_theme_stylebox_override("pressed", dark_inset_style(0.94, 7))
	option.add_theme_stylebox_override("focus", dark_inset_style(0.94, 7))


static func apply_codex_button(button: Button) -> void:
	button.custom_minimum_size = Vector2(92.0, 100.0)
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 17)
	button.add_theme_color_override("font_color", CREAM_TEXT)
	button.add_theme_color_override("font_hover_color", Color(1.0, 0.86, 0.42, 1.0))
	button.add_theme_color_override("font_pressed_color", Color(1.0, 0.76, 0.28, 1.0))
	button.add_theme_color_override("font_focus_color", Color(1.0, 0.86, 0.42, 1.0))
	button.add_theme_color_override("font_outline_color", Color(0.07, 0.035, 0.015, 0.96))
	button.add_theme_constant_override("outline_size", 2)
	var normal := _texture_style(CODEX_BADGE_TEXTURE)
	var hover := _texture_style(CODEX_BADGE_TEXTURE)
	hover.modulate_color = Color(1.0, 0.95, 0.78, 1.0)
	var pressed := _texture_style(CODEX_BADGE_TEXTURE)
	pressed.modulate_color = Color(1.0, 0.82, 0.48, 1.0)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", hover)
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(CODEX_BADGE_TEXTURE))


static func apply_help_button(button: Button) -> void:
	button.text = ""
	button.toggle_mode = true
	button.custom_minimum_size = Vector2(28.0, 28.0)
	var help_texture := content_trimmed_texture(HELP_MEDALLION_TEXTURE)
	var normal := _texture_style(help_texture)
	var hover := _texture_style(help_texture)
	hover.modulate_color = Color(1.0, 0.96, 0.78, 1.0)
	var pressed := _texture_style(help_texture)
	pressed.modulate_color = Color(1.0, 0.80, 0.40, 1.0)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", hover)
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(help_texture))


static func roster_style(selected: bool, accent: Color, hover: bool = false) -> StyleBoxTexture:
	var texture := PORTRAIT_SLOT_SELECTED_TEXTURE if selected or hover else PORTRAIT_SLOT_NORMAL_TEXTURE
	var style := _texture_style(texture)
	style.modulate_color = (
		Color.WHITE
		if selected
		else Color(0.94, 0.94, 0.94, 0.94)
	)
	if hover:
		style.modulate_color = Color(1.0, 0.96, 0.82, 1.0)
	elif not selected:
		var tint := accent.lerp(Color.WHITE, 0.76)
		tint.a = 0.92
		style.modulate_color = tint
	return style


static func _texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.draw_center = true
	return style


static func _disabled_texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := _texture_style(texture)
	style.modulate_color = Color(0.56, 0.53, 0.47, 0.58)
	return style
