extends RefCounted
class_name WorldHudPartyRosterVisualSkin

const TEXT_PRIMARY := Color("fff2cf")
const TEXT_MUTED := Color("c9bda4")
const TEXT_GOLD := Color("ffd16a")
const TEXT_DARK := Color("2f2117")
const ELEMENT_COLORS := {
	"earth": Color("91c951"),
	"water": Color("57c8e8"),
	"fire": Color("ef7448"),
	"wind": Color("8ad7a5"),
}

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
		])
		_display_font.font_weight = 700
	return _display_font


static func body_font() -> Font:
	if _body_font == null:
		_body_font = SystemFont.new()
		_body_font.font_names = PackedStringArray([
			"Hiragino Sans GB",
			"PingFang SC",
			"Noto Sans CJK SC",
			"Microsoft YaHei",
		])
		_body_font.font_weight = 500
	return _body_font


static func texture_from_path(path_value) -> Texture2D:
	if path_value is Texture2D:
		return path_value as Texture2D
	var path := str(path_value).strip_edges()
	if path == "":
		return null
	if _texture_cache.has(path):
		return _texture_cache.get(path) as Texture2D
	var texture: Texture2D = null
	if ResourceLoader.exists(path):
		texture = load(path) as Texture2D
	elif FileAccess.file_exists(path) and path.get_extension().to_lower() == "png":
		# Isolated owner-review worktrees may not have editor import caches yet.
		# Loading the tracked formal PNG directly keeps the player UI art-complete;
		# packaged builds continue to use the normal imported Texture2D path above.
		var image := Image.load_from_file(ProjectSettings.globalize_path(path))
		if image != null and not image.is_empty():
			texture = ImageTexture.create_from_image(image)
	if texture != null:
		_texture_cache[path] = texture
	return texture


static func panel_style() -> StyleBoxFlat:
	return _flat_style(
		Color("201913e8"),
		Color("76532ccf"),
		2,
		9,
		6.0
	)


static func task_body_style() -> StyleBoxFlat:
	return _flat_style(
		Color("30251de8"),
		Color("59442fc8"),
		1,
		7,
		9.0
	)


static func member_card_style(kind: String, leader: bool = false) -> StyleBoxFlat:
	var background := Color("342a22e8")
	var border := Color("604b37e0")
	if kind == "npc":
		background = Color("422e1fe8")
		border = Color("a87835ee")
	elif kind == "empty":
		background = Color("25211cba")
		border = Color("4c443aa8")
	if leader:
		border = Color("e3ae45fa")
	return _flat_style(background, border, 2 if leader else 1, 7, 5.0)


static func portrait_frame_style(kind: String) -> StyleBoxFlat:
	var border := Color("7b6346ec")
	if kind == "npc":
		border = Color("d3973fee")
	elif kind == "empty":
		border = Color("554e43a8")
	return _flat_style(Color("17130fdd"), border, 2, 6, 2.0)


static func badge_style(kind: String) -> StyleBoxFlat:
	match kind:
		"human":
			return _flat_style(Color("355f43ee"), Color("7ac889f0"), 1, 7, 3.0)
		"npc":
			return _flat_style(Color("6b431fee"), Color("dfa64df0"), 1, 7, 3.0)
		_:
			return _flat_style(Color("3b3831d0"), Color("716a5dca"), 1, 7, 3.0)


static func element_style(element_id: String) -> StyleBoxFlat:
	var color := ELEMENT_COLORS.get(element_id, Color("716a5d")) as Color
	return _flat_style(
		Color(color.r * 0.36, color.g * 0.36, color.b * 0.36, 0.96),
		Color(color.r, color.g, color.b, 0.96),
		1,
		10,
		2.0
	)


static func footer_style() -> StyleBoxFlat:
	return _flat_style(
		Color("15110dda"),
		Color("5b432be0"),
		1,
		7,
		5.0
	)


static func apply_tab(button: Button, selected: bool) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 17)
	button.add_theme_constant_override("outline_size", 2)
	button.add_theme_color_override("font_outline_color", Color("24160cf2"))
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_pressed_color", Color.WHITE)
	button.add_theme_stylebox_override(
		"normal",
		_tab_style(selected, false)
	)
	button.add_theme_stylebox_override("hover", _tab_style(selected, true))
	button.add_theme_stylebox_override("pressed", _tab_style(true, true))
	button.add_theme_stylebox_override("focus", _tab_style(true, true))


static func apply_name(label: Label, leader: bool = false) -> void:
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", TEXT_GOLD if leader else TEXT_PRIMARY)
	label.add_theme_color_override("font_outline_color", Color("1e120af4"))
	label.add_theme_constant_override("outline_size", 2)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER


static func apply_body(label: Label, size_value: int = 13, muted: bool = false) -> void:
	label.add_theme_font_override("font", body_font())
	label.add_theme_font_size_override("font_size", size_value)
	label.add_theme_color_override("font_color", TEXT_MUTED if muted else TEXT_PRIMARY)
	label.add_theme_color_override("font_outline_color", Color("1b110bf2"))
	label.add_theme_constant_override("outline_size", 1)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER


static func apply_badge(label: Label, kind: String) -> void:
	apply_body(label, 11, false)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_stylebox_override("normal", badge_style(kind))


static func apply_element(label: Label, element_id: String) -> void:
	apply_body(label, 12, false)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_stylebox_override("normal", element_style(element_id))


static func apply_action(button: Button, primary: bool = false) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 12)
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_color_override("font_disabled_color", Color("847b6bb0"))
	var normal_bg := Color("685037e8") if primary else Color("3d3126e8")
	var normal_border := Color("d2a354ec") if primary else Color("735b3fe0")
	button.add_theme_stylebox_override(
		"normal",
		_flat_style(normal_bg, normal_border, 1, 6, 4.0)
	)
	button.add_theme_stylebox_override(
		"hover",
		_flat_style(Color("7a5a32f2"), Color("f0c56cf4"), 2, 6, 3.0)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_flat_style(Color("4c341cf2"), Color("ffcf69f6"), 2, 6, 3.0)
	)
	button.add_theme_stylebox_override(
		"disabled",
		_flat_style(Color("27231ec2"), Color("4f493fc0"), 1, 6, 4.0)
	)


static func _tab_style(selected: bool, hovered: bool) -> StyleBoxFlat:
	var background := Color("2b241edc")
	var border := Color("66513bcf")
	var border_width := 1
	if selected:
		background = Color("77572fea")
		border = Color("f2c34ff8")
		border_width = 2
	elif hovered:
		background = Color("443323e8")
		border = Color("bd8c45ea")
	return _flat_style(background, border, border_width, 7, 4.0)


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
	style.set_border_width_all(border_width)
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.content_margin_left = content_margin
	style.content_margin_top = content_margin
	style.content_margin_right = content_margin
	style.content_margin_bottom = content_margin
	return style
