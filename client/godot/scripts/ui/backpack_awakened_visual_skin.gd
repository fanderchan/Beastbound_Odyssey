extends RefCounted

const BACKDROP_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/backpack_backdrop_1280x720.png"
)
const BUTTON_NORMAL_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/button_normal.png"
)
const BUTTON_SELECTED_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/button_selected.png"
)
const TAB_NORMAL_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/tab_normal.png"
)
const TAB_SELECTED_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/tab_selected.png"
)
const CLOSE_ICON_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/close_icon.png"
)
const ITEM_NORMAL_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/slots/item_normal.png"
)
const ITEM_SELECTED_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/slots/item_selected.png"
)
const CURRENCY_ATLAS_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/currency_atlas.png"
)
const BackpackItemIconCatalog := preload(
	"res://scripts/ui/backpack_item_icon_catalog.gd"
)

const CREAM_TEXT := Color(0.96, 0.91, 0.80, 1.0)
const MUTED_TEXT := Color(0.73, 0.68, 0.58, 1.0)
const GOLD_TEXT := Color(1.0, 0.73, 0.24, 1.0)
const BROWN_TEXT := Color(0.25, 0.14, 0.075, 1.0)
const GAIN_TEXT := Color(0.63, 0.91, 0.34, 1.0)
const LOSS_TEXT := Color(1.0, 0.35, 0.32, 1.0)

static var _display_font: SystemFont
static var _body_font: SystemFont
static var _currency_texture_cache: Dictionary = {}


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
			"PingFang SC",
			"Hiragino Sans GB",
			"Noto Sans CJK SC",
			"Microsoft YaHei",
		])
		_body_font.font_weight = 500
	return _body_font


static func add_backdrop(parent: Control) -> TextureRect:
	var backdrop := TextureRect.new()
	backdrop.name = "BackpackBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(backdrop)
	return backdrop


static func apply_title(label: Label, font_size: int = 28) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", CREAM_TEXT)
	label.add_theme_color_override("font_outline_color", Color(0.08, 0.035, 0.012, 0.98))
	label.add_theme_constant_override("outline_size", 4)


static func apply_body(label: Label, font_size: int = 15, muted: bool = false) -> void:
	label.add_theme_font_override("font", body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", MUTED_TEXT if muted else CREAM_TEXT)
	label.add_theme_color_override("font_outline_color", Color(0.035, 0.022, 0.012, 0.88))
	label.add_theme_constant_override("outline_size", 2)


static func apply_power(label: Label) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", 28)
	label.add_theme_color_override("font_color", GOLD_TEXT)
	label.add_theme_color_override("font_outline_color", Color(0.09, 0.04, 0.01, 0.98))
	label.add_theme_constant_override("outline_size", 4)


static func currency_texture_for(currency_id: String) -> Texture2D:
	var normalized_id := currency_id.strip_edges()
	if _currency_texture_cache.has(normalized_id):
		return _currency_texture_cache.get(normalized_id) as Texture2D
	var column := 0 if normalized_id == "stoneCoins" else 1
	var texture := AtlasTexture.new()
	texture.atlas = CURRENCY_ATLAS_TEXTURE
	texture.region = Rect2(column * 512.0, 0.0, 512.0, 512.0)
	_currency_texture_cache[normalized_id] = texture
	return texture


static func apply_close_button(button: Button) -> void:
	button.text = ""
	button.flat = true
	button.icon = CLOSE_ICON_TEXTURE
	button.expand_icon = true
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.custom_minimum_size = Vector2(54.0, 50.0)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_stylebox_override("normal", transparent_style())
	button.add_theme_stylebox_override("hover", transparent_style())
	button.add_theme_stylebox_override("pressed", transparent_style())
	button.add_theme_stylebox_override("focus", transparent_style())


static func apply_tab_button(button: Button, selected: bool = false) -> void:
	button.toggle_mode = true
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 17)
	button.add_theme_color_override("font_color", BROWN_TEXT)
	button.add_theme_color_override("font_hover_color", BROWN_TEXT)
	button.add_theme_color_override("font_pressed_color", BROWN_TEXT)
	button.add_theme_color_override("font_focus_color", BROWN_TEXT)
	button.add_theme_stylebox_override(
		"normal",
		_texture_style(TAB_SELECTED_TEXTURE if selected else TAB_NORMAL_TEXTURE)
	)
	button.add_theme_stylebox_override("hover", _texture_style(TAB_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("pressed", _texture_style(TAB_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("focus", _texture_style(TAB_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(TAB_NORMAL_TEXTURE))


static func apply_action_button(
	button: Button,
	destructive: bool = false,
	disabled_value: bool = false
) -> void:
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.disabled = disabled_value
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 17)
	button.add_theme_color_override("font_color", BROWN_TEXT)
	button.add_theme_color_override("font_hover_color", BROWN_TEXT)
	button.add_theme_color_override("font_pressed_color", BROWN_TEXT)
	button.add_theme_color_override("font_focus_color", BROWN_TEXT)
	button.add_theme_color_override("font_disabled_color", Color(0.34, 0.28, 0.22, 0.62))
	var normal := _texture_style(BUTTON_NORMAL_TEXTURE)
	var selected := _texture_style(BUTTON_SELECTED_TEXTURE)
	if destructive:
		normal.modulate_color = Color(0.86, 0.53, 0.43, 1.0)
		selected.modulate_color = Color(1.0, 0.62, 0.48, 1.0)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", selected)
	button.add_theme_stylebox_override("pressed", selected)
	button.add_theme_stylebox_override("focus", selected)
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(BUTTON_NORMAL_TEXTURE))


static func apply_slot_button(button: Button, selected: bool = false) -> void:
	button.text = ""
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_stylebox_override(
		"normal",
		_texture_style(ITEM_SELECTED_TEXTURE if selected else ITEM_NORMAL_TEXTURE)
	)
	button.add_theme_stylebox_override("hover", _texture_style(ITEM_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("pressed", _texture_style(ITEM_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("focus", _texture_style(ITEM_SELECTED_TEXTURE))
	button.add_theme_stylebox_override("disabled", _disabled_texture_style(ITEM_NORMAL_TEXTURE))
	for color_name in [
		"font_color",
		"font_hover_color",
		"font_pressed_color",
		"font_focus_color",
		"font_disabled_color",
	]:
		button.add_theme_color_override(color_name, Color.TRANSPARENT)


static func currency_chip_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.075, 0.045, 0.027, 0.88)
	style.border_color = Color(0.42, 0.28, 0.15, 0.94)
	style.set_border_width_all(2)
	style.set_corner_radius_all(18)
	style.content_margin_left = 15.0
	style.content_margin_right = 15.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	return style


static func dark_panel_style(alpha: float = 0.94, radius: int = 12) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.034, 0.026, alpha)
	style.border_color = Color(0.50, 0.33, 0.18, 0.96)
	style.set_border_width_all(2)
	style.set_corner_radius_all(radius)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.62)
	style.shadow_size = 8
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 12.0
	style.content_margin_bottom = 12.0
	return style


static func detail_panel_style(accent: Color = Color(0.72, 0.49, 0.25, 1.0)) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.050, 0.039, 0.030, 0.98)
	style.border_color = accent
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 10.0
	return style


static func divider_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.37, 0.25, 0.14, 0.82)
	return style


static func transparent_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.content_margin_left = 0.0
	style.content_margin_right = 0.0
	style.content_margin_top = 0.0
	style.content_margin_bottom = 0.0
	return style


static func rarity_color(value: String, is_equipment: bool = false) -> Color:
	match value.strip_edges().to_lower():
		"blue", "蓝", "rare":
			return Color(0.23, 0.63, 0.88, 1.0)
		"purple", "紫", "epic":
			return Color(0.65, 0.38, 0.84, 1.0)
		"orange", "橙", "legendary":
			return Color(0.94, 0.53, 0.19, 1.0)
		"red", "红", "mythic":
			return Color(0.88, 0.25, 0.20, 1.0)
		"gold", "金":
			return Color(0.95, 0.76, 0.31, 1.0)
	return Color(0.54, 0.48, 0.39, 1.0) if is_equipment else Color(0.63, 0.53, 0.36, 1.0)


static func item_texture_for(item_id: String) -> Texture2D:
	return BackpackItemIconCatalog.texture_for_item(item_id)


static func _texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.draw_center = true
	return style


static func _disabled_texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := _texture_style(texture)
	style.modulate_color = Color(0.54, 0.50, 0.43, 0.52)
	return style
