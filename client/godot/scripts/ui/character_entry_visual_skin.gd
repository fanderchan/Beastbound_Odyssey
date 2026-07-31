extends RefCounted

const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)

const VIEWPORT_SIZE := Vector2(1280.0, 720.0)
const CARD_SIZE := Vector2(420.0, 132.0)

const DEFAULT_BACKGROUND_PATH := (
	"res://assets/ui/character_entry_awakened_v1/runtime/"
	+ "backgrounds/tropical_camp.png"
)
const DEFAULT_SHOWCASE_PATH := (
	"res://assets/ui/character_entry_awakened_v1/runtime/"
	+ "characters/novice_hunter_hammer.png"
)
const DEFAULT_PORTRAIT_PATH := (
	"res://assets/ui/character_entry_awakened_v1/runtime/"
	+ "portraits/novice_hunter.png"
)

const BACKGROUND_TEXTURE := preload(
	"res://assets/ui/character_entry_awakened_v1/runtime/backgrounds/tropical_camp.png"
)
const DEFAULT_SHOWCASE_TEXTURE := preload(
	"res://assets/ui/character_entry_awakened_v1/runtime/characters/novice_hunter_hammer.png"
)
const DEFAULT_PORTRAIT_TEXTURE := preload(
	"res://assets/ui/character_entry_awakened_v1/runtime/portraits/novice_hunter.png"
)
const SELECTED_CARD_TEXTURE := preload(
	"res://assets/ui/character_entry_awakened_v1/runtime/cards/selected.png"
)
const EMPTY_CARD_TEXTURE := preload(
	"res://assets/ui/character_entry_awakened_v1/runtime/cards/empty.png"
)
const BACK_CHEVRONS_TEXTURE := preload(
	"res://assets/ui/character_entry_awakened_v1/runtime/icons/back_chevrons.png"
)
const BUTTON_NORMAL_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/button_normal.png"
)
const BUTTON_SELECTED_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/common/button_selected.png"
)

const CREAM_TEXT := Color(0.98, 0.94, 0.82, 1.0)
const MUTED_TEXT := Color(0.80, 0.75, 0.67, 1.0)
const GOLD_TEXT := Color(1.0, 0.78, 0.30, 1.0)
const INK_TEXT := Color(0.22, 0.13, 0.075, 1.0)
const ERROR_TEXT := Color(1.0, 0.77, 0.68, 1.0)
const SUCCESS_TEXT := Color(0.72, 0.96, 0.70, 1.0)

static var _display_font: SystemFont
static var _body_font: SystemFont
static var _texture_cache: Dictionary = {}
static var _missing_texture_paths: Dictionary = {}


static func default_visual_sources() -> Dictionary:
	return {
		"backgroundTexturePath": DEFAULT_BACKGROUND_PATH,
		"appearances": PlayerAppearanceCatalog.visual_sources(),
	}


static func merge_visual_sources(value: Dictionary) -> Dictionary:
	var result := default_visual_sources()
	for key in value.keys():
		if key != "appearances":
			result[key] = value.get(key)
	var source_appearances = value.get("appearances", {})
	if source_appearances is Dictionary:
		var result_appearances := (
			result.get("appearances", {}) as Dictionary
		).duplicate(true)
		for appearance_key in (source_appearances as Dictionary).keys():
			var source_value = (
				source_appearances as Dictionary
			).get(appearance_key, {})
			if source_value is Dictionary:
				var appearance := {}
				var current_value = result_appearances.get(
					appearance_key,
					{}
				)
				if current_value is Dictionary:
					appearance = (current_value as Dictionary).duplicate(true)
				appearance.merge(source_value as Dictionary, true)
				result_appearances[appearance_key] = appearance
		result["appearances"] = result_appearances
	return result


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
			"Noto Sans",
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
			"Noto Sans",
		])
		_body_font.font_weight = 500
	return _body_font


static func texture_from(value, fallback_path: String = "") -> Texture2D:
	if value is Texture2D:
		return value as Texture2D
	var path := "" if value == null else str(value).strip_edges()
	if path == "":
		path = fallback_path.strip_edges()
	if path == "" or _missing_texture_paths.has(path):
		return null
	if _texture_cache.has(path):
		return _texture_cache.get(path) as Texture2D
	if not ResourceLoader.exists(path, "Texture2D"):
		_missing_texture_paths[path] = true
		return null
	var resource = ResourceLoader.load(path, "Texture2D")
	if resource is Texture2D:
		_texture_cache[path] = resource
		return resource as Texture2D
	_missing_texture_paths[path] = true
	return null


static func fallback_backdrop_texture() -> Texture2D:
	return BACKGROUND_TEXTURE


static func apply_title(label: Label, font_size: int = 34) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", CREAM_TEXT)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.055, 0.035, 0.018, 0.98)
	)
	label.add_theme_constant_override("outline_size", 4)


static func apply_body(
	label: Label,
	font_size: int = 16,
	color: Color = CREAM_TEXT
) -> void:
	label.add_theme_font_override("font", body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.04, 0.028, 0.018, 0.90)
	)
	label.add_theme_constant_override("outline_size", 2)


static func apply_line_edit(line_edit: LineEdit) -> void:
	line_edit.add_theme_font_override("font", body_font())
	line_edit.add_theme_font_size_override("font_size", 20)
	line_edit.add_theme_color_override("font_color", CREAM_TEXT)
	line_edit.add_theme_color_override("font_placeholder_color", MUTED_TEXT)
	line_edit.add_theme_color_override("caret_color", GOLD_TEXT)
	line_edit.add_theme_stylebox_override(
		"normal",
		input_style(Color(0.56, 0.36, 0.18, 0.96))
	)
	line_edit.add_theme_stylebox_override(
		"focus",
		input_style(Color(0.96, 0.72, 0.25, 1.0))
	)


static func apply_primary_button(button: Button) -> void:
	_apply_button_text(button, 22, INK_TEXT)
	button.custom_minimum_size = Vector2(240.0, 58.0)
	button.add_theme_stylebox_override(
		"normal",
		_texture_style(BUTTON_NORMAL_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"hover",
		_texture_style(BUTTON_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_texture_style(BUTTON_SELECTED_TEXTURE, Color(0.94, 0.82, 0.64, 1.0))
	)
	button.add_theme_stylebox_override(
		"focus",
		_texture_style(BUTTON_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"disabled",
		_texture_style(BUTTON_NORMAL_TEXTURE, Color(0.52, 0.50, 0.46, 0.62))
	)
	button.add_theme_color_override(
		"font_disabled_color",
		Color(0.34, 0.29, 0.23, 0.72)
	)


static func apply_secondary_button(button: Button) -> void:
	_apply_button_text(button, 17, INK_TEXT)
	button.custom_minimum_size = Vector2(150.0, 44.0)
	button.add_theme_stylebox_override(
		"normal",
		_texture_style(BUTTON_NORMAL_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"hover",
		_texture_style(BUTTON_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_texture_style(BUTTON_SELECTED_TEXTURE, Color(0.93, 0.82, 0.67, 1.0))
	)
	button.add_theme_stylebox_override(
		"focus",
		_texture_style(BUTTON_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"disabled",
		_texture_style(BUTTON_NORMAL_TEXTURE, Color(0.52, 0.50, 0.46, 0.62))
	)


static func apply_back_button(button: Button) -> void:
	_apply_button_text(button, 26, CREAM_TEXT)
	button.text = "返回"
	button.flat = true
	button.icon = BACK_CHEVRONS_TEXTURE
	button.expand_icon = true
	button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.add_theme_constant_override("h_separation", 8)
	var transparent := transparent_style()
	button.add_theme_stylebox_override("normal", transparent)
	button.add_theme_stylebox_override("hover", transparent_style())
	button.add_theme_stylebox_override("pressed", transparent_style())
	button.add_theme_stylebox_override("focus", transparent_style())
	button.add_theme_stylebox_override("disabled", transparent_style())
	button.add_theme_color_override("font_hover_color", GOLD_TEXT)
	button.add_theme_color_override("font_pressed_color", Color(0.94, 0.64, 0.24, 1.0))
	button.add_theme_constant_override("outline_size", 4)


static func apply_slot_button(
	button: Button,
	selected: bool,
	occupied: bool
) -> void:
	button.text = ""
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.focus_mode = Control.FOCUS_ALL
	var normal := slot_style(selected, occupied)
	var hover := slot_style(true, occupied)
	hover.modulate_color = (
		Color(1.04, 1.04, 0.98, 1.0)
		if occupied
		else Color(1.10, 1.02, 0.88, 1.0)
	)
	var pressed := slot_style(true, occupied)
	pressed.modulate_color = Color(0.90, 0.84, 0.72, 1.0)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("focus", hover)
	var disabled_style := slot_style(selected, occupied)
	disabled_style.modulate_color = Color(0.55, 0.53, 0.49, 0.62)
	button.add_theme_stylebox_override("disabled", disabled_style)


static func main_panel_style() -> StyleBoxFlat:
	return transparent_style()


static func nameplate_style() -> StyleBoxFlat:
	return transparent_style()


static func modal_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.075, 0.049, 0.030, 0.985)
	style.border_color = Color(0.88, 0.62, 0.27, 1.0)
	style.set_border_width_all(3)
	style.set_corner_radius_all(18)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.82)
	style.shadow_size = 22
	return style


static func status_style(error: bool = false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.36, 0.10, 0.075, 0.94)
		if error
		else Color(0.13, 0.085, 0.045, 0.90)
	)
	style.border_color = (
		Color(0.91, 0.42, 0.29, 0.96)
		if error
		else Color(0.78, 0.55, 0.25, 0.90)
	)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	return style


static func input_style(border_color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.032, 0.022, 0.96)
	style.border_color = border_color
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 10.0
	return style


static func slot_style(
	selected: bool,
	occupied: bool
) -> StyleBoxTexture:
	var texture: Texture2D = (
		SELECTED_CARD_TEXTURE if occupied else EMPTY_CARD_TEXTURE
	)
	var style := _texture_style(texture)
	if occupied and not selected:
		style.modulate_color = Color(0.69, 0.63, 0.53, 0.96)
	return style


static func portrait_frame_style(_selected: bool = false) -> StyleBoxFlat:
	return transparent_style()


static func creation_board_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.028, 0.021, 0.90)
	style.border_color = Color(0.62, 0.45, 0.26, 0.98)
	style.set_border_width_all(2)
	style.set_corner_radius_all(18)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.72)
	style.shadow_size = 18
	return style


static func appearance_button_style(
	selected: bool,
	available: bool
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.20, 0.13, 0.075, 0.98)
		if available
		else Color(0.09, 0.075, 0.060, 0.84)
	)
	style.border_color = (
		Color(1.0, 0.70, 0.20, 1.0)
		if selected and available
		else Color(0.60, 0.45, 0.29, 0.90)
	)
	style.set_border_width_all(4 if selected else 2)
	style.set_corner_radius_all(52)
	style.shadow_color = (
		Color(1.0, 0.56, 0.10, 0.48)
		if selected and available
		else Color(0.0, 0.0, 0.0, 0.44)
	)
	style.shadow_size = 10 if selected else 5
	style.content_margin_left = 7.0
	style.content_margin_right = 7.0
	style.content_margin_top = 7.0
	style.content_margin_bottom = 7.0
	return style


static func element_track_style(fill_color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill_color
	style.border_color = Color(0.94, 0.79, 0.53, 0.52)
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	return style


static func compact_action_button(button: Button) -> void:
	_apply_button_text(button, 22, INK_TEXT)
	button.custom_minimum_size = Vector2(42.0, 42.0)
	button.add_theme_stylebox_override(
		"normal",
		_texture_style(BUTTON_NORMAL_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"hover",
		_texture_style(BUTTON_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_texture_style(BUTTON_SELECTED_TEXTURE, Color(0.90, 0.79, 0.63, 1.0))
	)
	button.add_theme_stylebox_override(
		"focus",
		_texture_style(BUTTON_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"disabled",
		_texture_style(BUTTON_NORMAL_TEXTURE, Color(0.45, 0.43, 0.40, 0.60))
	)


static func transparent_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.content_margin_left = 0.0
	style.content_margin_right = 0.0
	style.content_margin_top = 0.0
	style.content_margin_bottom = 0.0
	return style


static func _texture_style(
	texture: Texture2D,
	modulate: Color = Color.WHITE
) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.draw_center = true
	style.modulate_color = modulate
	return style


static func _apply_button_text(
	button: Button,
	font_size: int,
	color: Color
) -> void:
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", font_size)
	for color_name in [
		"font_color",
		"font_hover_color",
		"font_pressed_color",
		"font_focus_color",
	]:
		button.add_theme_color_override(color_name, color)
	button.add_theme_color_override(
		"font_outline_color",
		Color(0.06, 0.035, 0.015, 0.54)
	)
	button.add_theme_constant_override("outline_size", 1)
