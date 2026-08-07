extends RefCounted
class_name WorldHudAwakenedVisualSkin

const ICON_ROOT := "res://assets/ui/world_hud_awakened_v1/runtime/icons"
const CODEX_BADGE_PATH := ICON_ROOT + "/event_codex.png"
const ENTRY_ICON_PATHS := {
	"hang": ICON_ROOT + "/hang.png",
	"backpack": ICON_ROOT + "/backpack.png",
	"equipment": ICON_ROOT + "/equipment.png",
	"map": ICON_ROOT + "/map.png",
	"quest": ICON_ROOT + "/quest.png",
	"chat": ICON_ROOT + "/chat.png",
	"party": ICON_ROOT + "/party.png",
	"family": ICON_ROOT + "/family.png",
	"market": ICON_ROOT + "/market.png",
	"mailbox": ICON_ROOT + "/mailbox.png",
	"auto": ICON_ROOT + "/auto.png",
	"more": ICON_ROOT + "/more.png",
	"collapse": ICON_ROOT + "/collapse.png",
	"account": ICON_ROOT + "/account.png",
	"codex": CODEX_BADGE_PATH,
	"top_hang": ICON_ROOT + "/top_hang.png",
	"top_pet": ICON_ROOT + "/top_pet.png",
	"top_quest": ICON_ROOT + "/top_quest.png",
	"top_guide": ICON_ROOT + "/top_guide.png",
	"top_strengthen": ICON_ROOT + "/top_strengthen.png",
	"top_classic": ICON_ROOT + "/top_classic.png",
	"top_more": ICON_ROOT + "/top_more.png",
	"event_backpack": ICON_ROOT + "/event_backpack.png",
	"event_pet": ICON_ROOT + "/event_pet.png",
	"event_character": ICON_ROOT + "/event_character.png",
	"event_auto": ICON_ROOT + "/event_auto.png",
	"event_family": ICON_ROOT + "/event_family.png",
	"event_codex": ICON_ROOT + "/event_codex.png",
	"event_party": ICON_ROOT + "/event_party.png",
	"event_quest": ICON_ROOT + "/event_quest.png",
	"event_account": ICON_ROOT + "/event_account.png",
}

const TEXT_PRIMARY := Color(0.96, 0.90, 0.77, 1.0)
const TEXT_MUTED := Color(0.74, 0.69, 0.58, 1.0)
const TEXT_GOLD := Color(1.0, 0.72, 0.25, 1.0)
const TEXT_BROWN := Color(0.22, 0.13, 0.075, 1.0)
const WOOD_BORDER := Color(0.46, 0.31, 0.17, 0.96)
const WOOD_HIGHLIGHT := Color(0.75, 0.53, 0.27, 0.90)
const PANEL_DARK := Color(0.055, 0.045, 0.036, 0.88)

static var _display_font: SystemFont
static var _body_font: SystemFont
static var _texture_cache: Dictionary = {}


static func display_font() -> Font:
	if _display_font == null:
		_display_font = SystemFont.new()
		_display_font.font_names = PackedStringArray([
			"Hiragino Sans GB W6",
			"PingFang SC",
			"Noto Sans CJK SC Black",
			"Microsoft YaHei",
			"Noto Sans CJK SC",
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


static func texture_for_entry(entry_id: String) -> Texture2D:
	var path := str(ENTRY_ICON_PATHS.get(entry_id, ""))
	return texture_from_path(path)


static func texture_from_path(path_value) -> Texture2D:
	if path_value is Texture2D:
		return path_value as Texture2D
	var path := str(path_value).strip_edges()
	if path == "" or not ResourceLoader.exists(path):
		return null
	if _texture_cache.has(path):
		return _texture_cache.get(path) as Texture2D
	var loaded := load(path) as Texture2D
	if loaded != null:
		_texture_cache[path] = loaded
	return loaded


static func blocker_panel_style(kind: String = "default") -> StyleBoxFlat:
	# The four legacy roots remain hit-test boundaries, but the awakened HUD is
	# assembled from floating icon clusters.  Painting those roots produced the
	# large engineering rectangles that obscured the world in the first pass.
	if kind in ["top", "message", "dock", "side"]:
		return transparent_style()
	return _flat_style(PANEL_DARK, WOOD_BORDER, 1, 12, 6.0)


static func minimap_card_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.055, 0.050, 0.041, 0.82),
		Color(0.78, 0.61, 0.34, 0.96),
		3,
		58,
		7.0
	)


static func drawer_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.035, 0.030, 0.025, 0.88),
		Color(0.60, 0.41, 0.20, 0.90),
		1,
		18,
		6.0
	)


static func task_panel_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.040, 0.036, 0.031, 0.82),
		Color(0.30, 0.23, 0.16, 0.72),
		1,
		8,
		8.0
	)


static func chat_panel_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.035, 0.034, 0.031, 0.78),
		Color(0.27, 0.23, 0.17, 0.70),
		1,
		5,
		7.0
	)


static func caption_plate_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.035, 0.030, 0.025, 0.78),
		Color(0.0, 0.0, 0.0, 0.0),
		0,
		8,
		3.0
	)


static func inset_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.025, 0.022, 0.019, 0.80),
		Color(0.29, 0.22, 0.15, 0.86),
		1,
		9,
		5.0
	)


static func transparent_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.0)
	style.content_margin_left = 0.0
	style.content_margin_top = 0.0
	style.content_margin_right = 0.0
	style.content_margin_bottom = 0.0
	return style


static func apply_label(
	label: Label,
	font_size: int = 15,
	muted: bool = false,
	centered: bool = false
) -> void:
	label.add_theme_font_override("font", body_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override(
		"font_color",
		TEXT_MUTED if muted else TEXT_PRIMARY
	)
	label.add_theme_color_override("font_outline_color", Color(0.04, 0.02, 0.01, 0.94))
	label.add_theme_constant_override("outline_size", 2)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if centered:
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


static func apply_heading(label: Label, font_size: int = 18) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", TEXT_GOLD)
	label.add_theme_color_override("font_outline_color", Color(0.05, 0.02, 0.01, 0.96))
	label.add_theme_constant_override("outline_size", 3)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER


static func apply_entry_button(
	button: Button,
	entry_id: String,
	compact: bool = false
) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.clip_text = true
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	button.custom_minimum_size = Vector2(62.0, 44.0 if compact else 56.0)
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 13 if compact else 14)
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_color_override("font_hover_color", Color(1.0, 0.88, 0.53, 1.0))
	button.add_theme_color_override("font_pressed_color", TEXT_GOLD)
	button.add_theme_color_override("font_focus_color", Color(1.0, 0.88, 0.53, 1.0))
	button.add_theme_color_override("font_disabled_color", Color(0.48, 0.44, 0.37, 0.62))
	button.add_theme_color_override("font_outline_color", Color(0.04, 0.02, 0.01, 0.96))
	button.add_theme_constant_override("outline_size", 2)
	button.add_theme_constant_override("icon_max_width", 34 if compact else 40)
	button.add_theme_constant_override("h_separation", 4)
	button.add_theme_stylebox_override(
		"normal",
		_button_style(Color(0.13, 0.095, 0.064, 0.94), WOOD_BORDER)
	)
	button.add_theme_stylebox_override(
		"hover",
		_button_style(Color(0.22, 0.15, 0.075, 0.98), WOOD_HIGHLIGHT)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_button_style(Color(0.27, 0.17, 0.075, 1.0), Color(0.92, 0.66, 0.27, 1.0))
	)
	button.add_theme_stylebox_override(
		"focus",
		_button_style(Color(0.19, 0.13, 0.07, 0.98), Color(0.93, 0.69, 0.32, 1.0))
	)
	button.add_theme_stylebox_override(
		"disabled",
		_button_style(Color(0.07, 0.06, 0.05, 0.66), Color(0.22, 0.19, 0.15, 0.65))
	)
	var icon_texture := texture_for_entry(entry_id)
	if icon_texture != null:
		button.icon = icon_texture
		button.expand_icon = true
		button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT


static func apply_icon_button(
	button: Button,
	entry_id: String,
	icon_width: int = 48,
	framed: bool = false,
	fallback_entry_id: String = ""
) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.text = ""
	button.clip_text = true
	button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.expand_icon = true
	button.add_theme_constant_override("icon_max_width", icon_width)
	button.add_theme_stylebox_override(
		"normal",
		_icon_style(
			Color(0.055, 0.048, 0.039, 0.72) if framed else Color.TRANSPARENT,
			Color(0.64, 0.46, 0.24, 0.80) if framed else Color.TRANSPARENT,
			1 if framed else 0
		)
	)
	button.add_theme_stylebox_override(
		"hover",
		_icon_style(Color(0.18, 0.12, 0.060, 0.82), WOOD_HIGHLIGHT, 2)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_icon_style(Color(0.27, 0.17, 0.070, 0.90), Color(1.0, 0.77, 0.34, 1.0), 2)
	)
	button.add_theme_stylebox_override(
		"focus",
		_icon_style(Color(0.15, 0.10, 0.055, 0.80), Color(0.93, 0.68, 0.30, 1.0), 2)
	)
	button.add_theme_stylebox_override(
		"disabled",
		_icon_style(Color(0.04, 0.04, 0.035, 0.46), Color(0.0, 0.0, 0.0, 0.0), 0)
	)
	var icon_texture := texture_for_entry(entry_id)
	if icon_texture == null and fallback_entry_id != "":
		icon_texture = texture_for_entry(fallback_entry_id)
	if icon_texture != null:
		button.icon = icon_texture


static func apply_caption(label: Label, font_size: int = 17) -> void:
	apply_label(label, font_size, false, true)
	label.add_theme_color_override("font_color", Color(0.96, 0.91, 0.80, 1.0))
	label.add_theme_color_override("font_outline_color", Color(0.03, 0.02, 0.015, 0.98))
	label.add_theme_constant_override("outline_size", 3)
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS


static func apply_social_button(button: Button, entry_id: String) -> void:
	apply_icon_button(button, entry_id, 34, true)
	button.custom_minimum_size = Vector2(45.0, 42.0)


static func apply_portrait_frame(button: Button, pet: bool = false) -> void:
	apply_icon_button(button, "", 68, true)
	var frame_color := Color(0.76, 0.43, 0.82, 0.96) if pet else Color(0.86, 0.62, 0.30, 0.98)
	button.add_theme_stylebox_override(
		"normal",
		_flat_style(Color(0.045, 0.038, 0.030, 0.86), frame_color, 2, 8, 4.0)
	)


static func apply_tab_button(
	button: Button,
	selected: bool,
	entry_id: String = ""
) -> void:
	apply_entry_button(button, entry_id, true)
	var normal_color := Color(0.30, 0.20, 0.10, 0.98) if selected else Color(0.11, 0.085, 0.06, 0.94)
	var border_color := Color(0.96, 0.70, 0.29, 1.0) if selected else WOOD_BORDER
	button.add_theme_stylebox_override("normal", _button_style(normal_color, border_color))
	button.add_theme_stylebox_override("focus", _button_style(normal_color, border_color))
	button.add_theme_color_override("font_color", TEXT_GOLD if selected else TEXT_PRIMARY)


static func apply_portrait_button(button: Button) -> void:
	apply_portrait_frame(button, false)
	button.custom_minimum_size = Vector2(92.0, 72.0)
	button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.expand_icon = true
	button.add_theme_constant_override("icon_max_width", 56)


static func apply_route_button(button: Button) -> void:
	button.custom_minimum_size = Vector2(0.0, 36.0)
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_color_override("font_color", TEXT_BROWN)
	button.add_theme_color_override("font_hover_color", TEXT_BROWN)
	button.add_theme_color_override("font_pressed_color", TEXT_BROWN)
	button.add_theme_color_override("font_disabled_color", Color(0.26, 0.22, 0.18, 0.58))
	button.add_theme_stylebox_override(
		"normal",
		_button_style(Color(0.75, 0.52, 0.24, 1.0), Color(0.94, 0.72, 0.36, 1.0))
	)
	button.add_theme_stylebox_override(
		"hover",
		_button_style(Color(0.90, 0.67, 0.31, 1.0), Color(1.0, 0.84, 0.50, 1.0))
	)
	button.add_theme_stylebox_override(
		"pressed",
		_button_style(Color(0.61, 0.40, 0.17, 1.0), Color(0.84, 0.62, 0.29, 1.0))
	)
	button.add_theme_stylebox_override(
		"disabled",
		_button_style(Color(0.31, 0.27, 0.21, 0.72), Color(0.40, 0.34, 0.26, 0.60))
	)


static func _button_style(background: Color, border: Color) -> StyleBoxFlat:
	return _flat_style(background, border, 1, 9, 5.0)


static func _icon_style(
	background: Color,
	border: Color,
	border_width: int
) -> StyleBoxFlat:
	return _flat_style(background, border, border_width, 28, 2.0)


static func _flat_style(
	background: Color,
	border: Color,
	border_width: int,
	radius: int,
	content_margin: float
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.border_width_left = border_width
	style.border_width_top = border_width
	style.border_width_right = border_width
	style.border_width_bottom = border_width
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.content_margin_left = content_margin
	style.content_margin_top = content_margin
	style.content_margin_right = content_margin
	style.content_margin_bottom = content_margin
	return style
