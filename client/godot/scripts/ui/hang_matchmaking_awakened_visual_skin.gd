extends RefCounted
class_name HangMatchmakingAwakenedVisualSkin

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)
const GRASS_MAP_TEXTURE := preload(
	"res://assets/maps/firebud_region_visual_v1/runtime/ground/atlas.png"
)
const MARSH_MAP_TEXTURE := preload(
	"res://assets/maps/mistcap_marsh_visual_v1/runtime/ground/atlas.png"
)

const CREAM_TEXT := Color(0.96, 0.91, 0.80, 1.0)
const MUTED_TEXT := Color(0.73, 0.68, 0.58, 1.0)
const GOLD_TEXT := Color(1.0, 0.73, 0.24, 1.0)
const BROWN_TEXT := Color(0.25, 0.14, 0.075, 1.0)
const HUMAN_TEXT := Color(0.38, 0.78, 1.0, 1.0)
const NPC_TEXT := Color(0.97, 0.72, 0.27, 1.0)
const OPEN_TEXT := Color(0.63, 0.58, 0.50, 1.0)
const POSITIVE_TEXT := Color(0.64, 0.90, 0.33, 1.0)
const LOCKED_TEXT := Color(1.0, 0.39, 0.30, 1.0)

static var _route_tile_cache: Dictionary = {}


static func display_font() -> Font:
	return BackpackAwakenedVisualSkin.display_font()


static func body_font() -> Font:
	return BackpackAwakenedVisualSkin.body_font()


static func add_backdrop(parent: Control) -> TextureRect:
	var backdrop := BackpackAwakenedVisualSkin.add_backdrop(parent)
	backdrop.name = "HangMatchmakingBackdrop"
	parent.move_child(backdrop, 0)
	return backdrop


static func transparent_style() -> StyleBoxFlat:
	return BackpackAwakenedVisualSkin.transparent_style()


static func apply_title(label: Label, font_size: int = 28) -> void:
	BackpackAwakenedVisualSkin.apply_title(label, font_size)


static func apply_body(label: Label, font_size: int = 15, muted: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_body(label, font_size, muted)


static func apply_emphasis(label: Label, color: Color, font_size: int = 16) -> void:
	apply_body(label, font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_constant_override("outline_size", 3)


static func apply_close_button(button: Button) -> void:
	BackpackAwakenedVisualSkin.apply_close_button(button)
	button.custom_minimum_size = Vector2(58.0, 52.0)


static func apply_tab_button(button: Button, selected: bool) -> void:
	BackpackAwakenedVisualSkin.apply_tab_button(button, selected)
	button.button_pressed = selected
	button.custom_minimum_size = Vector2(154.0, 50.0)
	button.add_theme_font_size_override("font_size", 18)


static func apply_action_button(
	button: Button,
	primary: bool = false,
	destructive: bool = false,
	disabled_value: bool = false
) -> void:
	BackpackAwakenedVisualSkin.apply_action_button(button, destructive, disabled_value)
	button.custom_minimum_size = Vector2(150.0, 48.0)
	button.add_theme_font_size_override("font_size", 17)
	if primary and not disabled_value:
		button.add_theme_stylebox_override(
			"normal",
			_texture_style(BackpackAwakenedVisualSkin.BUTTON_SELECTED_TEXTURE)
		)


static func route_card_style(selected: bool, locked: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.047, 0.036, 0.027, 0.97)
	style.border_color = (
		Color(1.0, 0.74, 0.24, 1.0)
		if selected
		else Color(0.44, 0.31, 0.19, 0.96)
	)
	style.set_border_width_all(4 if selected else 2)
	style.set_corner_radius_all(11)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.62)
	style.shadow_size = 9 if selected else 5
	style.content_margin_left = 8.0
	style.content_margin_right = 8.0
	style.content_margin_top = 8.0
	style.content_margin_bottom = 8.0
	if locked:
		style.bg_color = Color(0.035, 0.031, 0.027, 0.96)
		style.border_color = Color(0.25, 0.22, 0.18, 0.76)
		style.shadow_size = 0
	return style


static func apply_route_card(button: Button, selected: bool, locked: bool) -> void:
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_stylebox_override("normal", route_card_style(selected, locked))
	button.add_theme_stylebox_override("hover", route_card_style(true, locked))
	button.add_theme_stylebox_override("pressed", route_card_style(true, locked))
	button.add_theme_stylebox_override("focus", route_card_style(true, locked))
	button.add_theme_stylebox_override("disabled", route_card_style(false, true))


static func main_panel_style() -> StyleBoxFlat:
	var style := BackpackAwakenedVisualSkin.dark_panel_style(0.96, 15)
	style.border_color = Color(0.59, 0.39, 0.20, 1.0)
	style.set_border_width_all(4)
	style.shadow_size = 12
	return style


static func inset_style(alpha: float = 0.86, radius: int = 10) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.038, 0.029, 0.023, alpha)
	style.border_color = Color(0.37, 0.27, 0.17, 0.92)
	style.set_border_width_all(2)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 10.0
	return style


static func parchment_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.82, 0.75, 0.62, 0.99)
	style.border_color = Color(0.42, 0.28, 0.15, 1.0)
	style.set_border_width_all(4)
	style.set_corner_radius_all(10)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.78)
	style.shadow_size = 18
	style.content_margin_left = 26.0
	style.content_margin_right = 26.0
	style.content_margin_top = 22.0
	style.content_margin_bottom = 22.0
	return style


static func badge_style(kind: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	match kind:
		"current":
			style.bg_color = Color(0.20, 0.48, 0.22, 0.96)
		"recommended":
			style.bg_color = Color(0.68, 0.22, 0.12, 0.97)
		"npc":
			style.bg_color = Color(0.50, 0.33, 0.08, 0.96)
		"human":
			style.bg_color = Color(0.08, 0.33, 0.52, 0.96)
		_:
			style.bg_color = Color(0.16, 0.13, 0.10, 0.92)
	style.border_color = Color(0.91, 0.72, 0.38, 0.88)
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.content_margin_left = 8.0
	style.content_margin_right = 8.0
	style.content_margin_top = 3.0
	style.content_margin_bottom = 3.0
	return style


static func member_slot_style(kind: String) -> StyleBoxFlat:
	var style := inset_style(0.93, 9)
	match kind:
		"human":
			style.border_color = Color(0.25, 0.66, 0.92, 1.0)
		"npc":
			style.border_color = Color(0.93, 0.63, 0.18, 1.0)
		_:
			style.border_color = Color(0.31, 0.28, 0.24, 0.82)
	return style


static func route_texture(visual_key: String) -> Texture2D:
	return MARSH_MAP_TEXTURE if visual_key in ["marsh", "cave"] else GRASS_MAP_TEXTURE


static func route_tile_texture(visual_key: String, variant: int) -> Texture2D:
	var normalized_variant := posmod(variant, 4)
	var family := "marsh" if visual_key in ["marsh", "cave"] else "grass"
	var key := "%s:%d" % [family, normalized_variant]
	if _route_tile_cache.has(key):
		return _route_tile_cache.get(key) as Texture2D
	var texture := AtlasTexture.new()
	texture.atlas = MARSH_MAP_TEXTURE if family == "marsh" else GRASS_MAP_TEXTURE
	texture.region = Rect2(
		float((normalized_variant % 2) * 80),
		float(floori(float(normalized_variant) / 2.0) * 40),
		80.0,
		40.0
	)
	texture.filter_clip = true
	_route_tile_cache[key] = texture
	return texture


static func route_preview_base_color(visual_key: String, locked: bool) -> Color:
	if locked:
		return Color(0.045, 0.043, 0.039, 1.0)
	match visual_key:
		"marsh":
			return Color(0.055, 0.16, 0.15, 1.0)
		"cave":
			return Color(0.055, 0.065, 0.11, 1.0)
		"ember":
			return Color(0.20, 0.065, 0.025, 1.0)
		_:
			return Color(0.09, 0.15, 0.04, 1.0)


static func route_texture_modulate(visual_key: String, locked: bool) -> Color:
	if locked:
		return Color(0.35, 0.34, 0.32, 0.56)
	match visual_key:
		"marsh":
			return Color(0.62, 0.96, 0.92, 1.0)
		"cave":
			return Color(0.58, 0.64, 0.85, 0.88)
		"ember":
			return Color(1.0, 0.52, 0.28, 1.0)
		_:
			return Color(0.86, 1.0, 0.68, 1.0)


static func _texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.texture_margin_left = 18.0
	style.texture_margin_right = 18.0
	style.texture_margin_top = 12.0
	style.texture_margin_bottom = 12.0
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 9.0
	style.content_margin_bottom = 9.0
	return style
