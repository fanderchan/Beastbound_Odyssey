extends RefCounted

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)

# Character management deliberately reuses the established backpack bitmap kit.
# The panel stays visually consistent with other full-screen player menus while
# keeping all gameplay-specific composition outside this skin helper.
const BACKDROP_TEXTURE := BackpackAwakenedVisualSkin.BACKDROP_TEXTURE
const BUTTON_NORMAL_TEXTURE := BackpackAwakenedVisualSkin.BUTTON_NORMAL_TEXTURE
const BUTTON_SELECTED_TEXTURE := BackpackAwakenedVisualSkin.BUTTON_SELECTED_TEXTURE
const TAB_NORMAL_TEXTURE := BackpackAwakenedVisualSkin.TAB_NORMAL_TEXTURE
const TAB_SELECTED_TEXTURE := BackpackAwakenedVisualSkin.TAB_SELECTED_TEXTURE
const CLOSE_ICON_TEXTURE := BackpackAwakenedVisualSkin.CLOSE_ICON_TEXTURE
const SLOT_NORMAL_TEXTURE := BackpackAwakenedVisualSkin.ITEM_NORMAL_TEXTURE
const SLOT_SELECTED_TEXTURE := BackpackAwakenedVisualSkin.ITEM_SELECTED_TEXTURE
const STAT_PLUS_ICON_TEXTURE := preload(
	"res://assets/ui/character_management_awakened_v1/runtime/icons/stat_plus.png"
)
const STAT_MINUS_ICON_TEXTURE := preload(
	"res://assets/ui/character_management_awakened_v1/runtime/icons/stat_minus.png"
)
const RIDE_LOCKED_ICON_TEXTURE := preload(
	"res://assets/ui/character_management_awakened_v1/runtime/icons/ride_locked.png"
)
const RIDE_OWNED_ICON_TEXTURE := preload(
	"res://assets/ui/character_management_awakened_v1/runtime/icons/ride_owned.png"
)

const CREAM_TEXT := Color(0.96, 0.91, 0.80, 1.0)
const MUTED_TEXT := Color(0.73, 0.68, 0.58, 1.0)
const GOLD_TEXT := Color(1.0, 0.73, 0.24, 1.0)
const BROWN_TEXT := Color(0.25, 0.14, 0.075, 1.0)
const GAIN_TEXT := Color(0.63, 0.91, 0.34, 1.0)
const LOSS_TEXT := Color(1.0, 0.35, 0.32, 1.0)

# Product-wide element palette: earth is always green.
const EARTH_TEXT := Color(0.39, 0.76, 0.34, 1.0)
const WATER_TEXT := Color(0.24, 0.66, 0.94, 1.0)
const FIRE_TEXT := Color(0.94, 0.31, 0.23, 1.0)
const WIND_TEXT := Color(0.96, 0.76, 0.24, 1.0)

static var _trimmed_texture_cache: Dictionary = {}


static func display_font() -> Font:
	return BackpackAwakenedVisualSkin.display_font()


static func body_font() -> Font:
	return BackpackAwakenedVisualSkin.body_font()


static func add_backdrop(parent: Control) -> TextureRect:
	var backdrop := BackpackAwakenedVisualSkin.add_backdrop(parent)
	backdrop.name = "CharacterManagementBackdrop"
	parent.move_child(backdrop, 0)
	return backdrop


static func apply_title(label: Label, font_size: int = 26) -> void:
	BackpackAwakenedVisualSkin.apply_title(label, font_size)


static func apply_body(label: Label, font_size: int = 15, muted: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_body(label, font_size, muted)


static func apply_muted(label: Label, font_size: int = 14) -> void:
	apply_body(label, font_size, true)


static func apply_gold(label: Label, font_size: int = 18) -> void:
	_apply_emphasis(label, font_size, GOLD_TEXT)


static func apply_positive(label: Label, font_size: int = 15) -> void:
	_apply_emphasis(label, font_size, GAIN_TEXT)


static func apply_element_label(label: Label, element_id: String, font_size: int = 16) -> void:
	_apply_emphasis(label, font_size, element_color(element_id))


static func apply_close_button(button: Button) -> void:
	BackpackAwakenedVisualSkin.apply_close_button(button)
	button.icon = content_trimmed_texture(CLOSE_ICON_TEXTURE)
	button.custom_minimum_size = Vector2(58.0, 52.0)


static func apply_tab_button(button: Button, selected: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_tab_button(button, selected)
	button.custom_minimum_size = Vector2(132.0, 56.0)
	button.button_pressed = selected
	button.add_theme_font_size_override("font_size", 19)
	button.add_theme_constant_override("outline_size", 1)
	button.add_theme_color_override("font_outline_color", Color(0.16, 0.08, 0.025, 0.66))


static func apply_action_button(
	button: Button,
	primary: bool = false,
	disabled_value: bool = false,
	compact: bool = false
) -> void:
	BackpackAwakenedVisualSkin.apply_action_button(button, false, disabled_value)
	button.custom_minimum_size = Vector2(98.0 if compact else 126.0, 36.0 if compact else 46.0)
	button.add_theme_font_size_override("font_size", 15 if compact else 17)
	if primary:
		button.add_theme_stylebox_override("normal", _texture_style(BUTTON_SELECTED_TEXTURE))
		button.add_theme_stylebox_override("hover", _bright_texture_style(BUTTON_SELECTED_TEXTURE))
		button.add_theme_stylebox_override("pressed", _pressed_texture_style(BUTTON_SELECTED_TEXTURE))
		button.add_theme_stylebox_override("focus", _bright_texture_style(BUTTON_SELECTED_TEXTURE))


static func apply_slot_button(
	button: Button,
	selected: bool = false,
	disabled_value: bool = false
) -> void:
	BackpackAwakenedVisualSkin.apply_slot_button(button, selected)
	button.disabled = disabled_value
	button.add_theme_stylebox_override(
		"disabled",
		_disabled_texture_style(SLOT_NORMAL_TEXTURE)
	)


static func apply_card_button(
	button: Button,
	selected: bool = false,
	locked: bool = false
) -> void:
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_ARROW if locked else Control.CURSOR_POINTING_HAND
	button.disabled = locked
	button.add_theme_font_override("font", body_font())
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", CREAM_TEXT)
	button.add_theme_color_override("font_hover_color", GOLD_TEXT)
	button.add_theme_color_override("font_pressed_color", GOLD_TEXT)
	button.add_theme_color_override("font_focus_color", GOLD_TEXT)
	button.add_theme_color_override("font_disabled_color", MUTED_TEXT.darkened(0.28))
	button.add_theme_stylebox_override("normal", card_style(selected, false))
	button.add_theme_stylebox_override("hover", card_style(true, false))
	button.add_theme_stylebox_override("pressed", card_style(true, false))
	button.add_theme_stylebox_override("focus", card_style(true, false))
	button.add_theme_stylebox_override("disabled", card_style(false, true))


static func panel_style() -> StyleBoxFlat:
	var style := BackpackAwakenedVisualSkin.dark_panel_style(0.93, 12)
	style.border_color = Color(0.53, 0.35, 0.19, 0.98)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.70)
	style.shadow_size = 10
	style.content_margin_left = 16.0
	style.content_margin_right = 16.0
	style.content_margin_top = 14.0
	style.content_margin_bottom = 14.0
	return style


static func large_framed_panel_style() -> StyleBoxFlat:
	var style := panel_style()
	style.bg_color = Color(0.052, 0.041, 0.030, 0.975)
	style.border_color = Color(0.62, 0.41, 0.22, 1.0)
	style.set_border_width_all(4)
	style.set_corner_radius_all(15)
	style.shadow_size = 14
	style.content_margin_left = 20.0
	style.content_margin_right = 20.0
	style.content_margin_top = 18.0
	style.content_margin_bottom = 18.0
	return style


static func inset_style(alpha: float = 0.72, radius: int = 8) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.027, 0.021, 0.017, alpha)
	style.border_color = Color(0.31, 0.22, 0.14, minf(0.86, alpha + 0.12))
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 8.0
	style.content_margin_bottom = 8.0
	return style


static func card_style(selected: bool = false, locked: bool = false) -> StyleBoxFlat:
	var style := inset_style(0.90, 9)
	style.bg_color = Color(0.055, 0.042, 0.031, 0.94)
	style.border_color = Color(0.95, 0.66, 0.22, 1.0) if selected else Color(0.43, 0.31, 0.20, 0.96)
	style.set_border_width_all(3 if selected else 2)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.46)
	style.shadow_size = 5
	if locked:
		style.bg_color = Color(0.035, 0.030, 0.026, 0.88)
		style.border_color = Color(0.25, 0.22, 0.18, 0.72)
		style.shadow_size = 0
	return style


static func equipment_slot_style(
	filled: bool = false,
	selected: bool = false
) -> StyleBoxTexture:
	var texture := SLOT_SELECTED_TEXTURE if selected else SLOT_NORMAL_TEXTURE
	var style := _texture_style(texture)
	if selected:
		style.modulate_color = Color(1.0, 0.95, 0.74, 1.0)
	elif filled:
		style.modulate_color = Color(0.96, 0.92, 0.84, 1.0)
	else:
		style.modulate_color = Color(0.70, 0.65, 0.57, 0.72)
	return style


static func progress_background_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.020, 0.016, 0.96)
	style.border_color = Color(0.30, 0.21, 0.13, 0.94)
	style.set_border_width_all(1)
	style.set_corner_radius_all(7)
	return style


static func progress_fill_style(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = color.lightened(0.18)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(7)
	return style


static func apply_progress_bar(bar: ProgressBar, color: Color) -> void:
	bar.custom_minimum_size.y = 18.0
	bar.show_percentage = false
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_theme_stylebox_override("background", progress_background_style())
	bar.add_theme_stylebox_override("fill", progress_fill_style(color))
	bar.add_theme_font_override("font", display_font())
	bar.add_theme_font_size_override("font_size", 12)
	bar.add_theme_color_override("font_color", CREAM_TEXT)
	bar.add_theme_color_override("font_outline_color", Color(0.03, 0.02, 0.01, 0.92))
	bar.add_theme_constant_override("outline_size", 2)


static func element_color(element_id: String) -> Color:
	match element_id.strip_edges().to_lower():
		"earth", "earthaffinity", "地":
			return EARTH_TEXT
		"water", "wateraffinity", "水":
			return WATER_TEXT
		"fire", "fireaffinity", "火":
			return FIRE_TEXT
		"wind", "windaffinity", "风":
			return WIND_TEXT
	return MUTED_TEXT


static func element_segment_style(element_id: String, filled: bool = true) -> StyleBoxFlat:
	var color := element_color(element_id)
	var style := StyleBoxFlat.new()
	style.bg_color = color if filled else Color(0.035, 0.029, 0.024, 0.96)
	style.border_color = color.lightened(0.15) if filled else Color(0.26, 0.22, 0.18, 0.88)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	style.shadow_color = Color(color.r, color.g, color.b, 0.28) if filled else Color.TRANSPARENT
	style.shadow_size = 3 if filled else 0
	return style


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


static func _apply_emphasis(label: Label, font_size: int, color: Color) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color(0.055, 0.025, 0.010, 0.94))
	label.add_theme_constant_override("outline_size", 2)


static func _texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.draw_center = true
	return style


static func _bright_texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := _texture_style(texture)
	style.modulate_color = Color(1.0, 0.96, 0.82, 1.0)
	return style


static func _pressed_texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := _texture_style(texture)
	style.modulate_color = Color(0.94, 0.80, 0.54, 1.0)
	return style


static func _disabled_texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := _texture_style(texture)
	style.modulate_color = Color(0.54, 0.50, 0.43, 0.52)
	return style
