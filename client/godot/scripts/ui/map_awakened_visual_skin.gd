extends RefCounted
class_name MapAwakenedVisualSkin

const WorldHudAwakenedVisualSkin := preload(
	"res://scripts/ui/world_hud_awakened_visual_skin.gd"
)
const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)

const TEXT_PRIMARY := Color(0.96, 0.91, 0.80, 1.0)
const TEXT_MUTED := Color(0.72, 0.67, 0.57, 1.0)
const TEXT_DARK := Color(0.24, 0.15, 0.09, 1.0)
const TEXT_GOLD := Color(1.0, 0.74, 0.28, 1.0)
const PANEL_DARK := Color(0.055, 0.045, 0.035, 0.96)
const PANEL_INSET := Color(0.105, 0.082, 0.060, 0.96)
const WOOD_EDGE := Color(0.57, 0.36, 0.18, 1.0)
const WOOD_LIGHT := Color(0.83, 0.60, 0.31, 1.0)
const PARCHMENT := Color(0.76, 0.67, 0.52, 0.98)
const MARKER_ROLE_LANDMARK := "landmark"
const MARKER_ROLE_PLAYER := "player"
const MARKER_ROLE_TARGET := "target"


static func frame_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.045, 0.034, 0.026, 0.985),
		WOOD_EDGE,
		4,
		15,
		12.0,
		12.0
	)


static func header_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.18, 0.105, 0.055, 0.98),
		WOOD_LIGHT,
		2,
		10,
		10.0,
		8.0
	)


static func dark_surface_style(radius: int = 10) -> StyleBoxFlat:
	return _flat_style(
		PANEL_DARK,
		Color(0.34, 0.24, 0.15, 0.96),
		2,
		radius,
		8.0,
		8.0
	)


static func inset_surface_style(radius: int = 8) -> StyleBoxFlat:
	return _flat_style(
		PANEL_INSET,
		Color(0.28, 0.20, 0.13, 0.96),
		1,
		radius,
		7.0,
		7.0
	)


static func parchment_style() -> StyleBoxFlat:
	return _flat_style(
		PARCHMENT,
		Color(0.44, 0.31, 0.19, 1.0),
		3,
		11,
		10.0,
		10.0
	)


static func info_bar_style() -> StyleBoxFlat:
	return _flat_style(
		Color(0.025, 0.021, 0.018, 0.92),
		Color(0.45, 0.31, 0.17, 0.92),
		1,
		7,
		8.0,
		5.0
	)


static func apply_heading(label: Label, size: int = 24, dark: bool = false) -> void:
	label.add_theme_font_override("font", WorldHudAwakenedVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", TEXT_DARK if dark else TEXT_GOLD)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.04, 0.02, 0.01, 0.92) if not dark else Color(0.93, 0.82, 0.63, 0.70)
	)
	label.add_theme_constant_override("outline_size", 2 if not dark else 1)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER


static func apply_label(
	label: Label,
	size: int = 16,
	muted: bool = false,
	dark: bool = false
) -> void:
	label.add_theme_font_override("font", WorldHudAwakenedVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override(
		"font_color",
		TEXT_DARK if dark else (TEXT_MUTED if muted else TEXT_PRIMARY)
	)
	label.add_theme_color_override(
		"font_outline_color",
		Color(0.03, 0.02, 0.01, 0.84) if not dark else Color(0.92, 0.82, 0.67, 0.52)
	)
	label.add_theme_constant_override("outline_size", 1)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER


static func apply_tab_button(button: Button) -> void:
	button.toggle_mode = true
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(132.0, 42.0)
	button.add_theme_font_override("font", WorldHudAwakenedVisualSkin.display_font())
	button.add_theme_font_size_override("font_size", 17)
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_color_override("font_hover_color", TEXT_GOLD)
	button.add_theme_color_override("font_pressed_color", TEXT_DARK)
	button.add_theme_stylebox_override(
		"normal",
		_flat_style(Color(0.12, 0.085, 0.055, 0.96), Color(0.40, 0.27, 0.15, 1.0), 1, 8, 7.0, 4.0)
	)
	button.add_theme_stylebox_override(
		"hover",
		_flat_style(Color(0.20, 0.13, 0.07, 0.98), WOOD_LIGHT, 2, 8, 7.0, 4.0)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_flat_style(Color(0.84, 0.64, 0.34, 1.0), Color(1.0, 0.81, 0.43, 1.0), 2, 8, 7.0, 4.0)
	)


static func apply_list_button(
	button: Button,
	icon_id: String = "map",
	accent: bool = false
) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(0.0, 48.0)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.expand_icon = true
	button.add_theme_constant_override("icon_max_width", 30)
	button.add_theme_constant_override("h_separation", 10)
	button.add_theme_font_override("font", WorldHudAwakenedVisualSkin.body_font())
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_color_override("font_hover_color", TEXT_GOLD)
	button.add_theme_color_override("font_pressed_color", TEXT_DARK)
	button.icon = WorldHudAwakenedVisualSkin.texture_for_entry(icon_id)
	var normal_color := Color(0.22, 0.145, 0.078, 0.98) if accent else Color(0.09, 0.07, 0.052, 0.96)
	button.add_theme_stylebox_override(
		"normal",
		_flat_style(normal_color, Color(0.36, 0.25, 0.15, 0.96), 1, 7, 8.0, 5.0)
	)
	button.add_theme_stylebox_override(
		"hover",
		_flat_style(Color(0.28, 0.18, 0.09, 0.99), WOOD_LIGHT, 2, 7, 8.0, 5.0)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_flat_style(Color(0.78, 0.57, 0.29, 1.0), Color(1.0, 0.81, 0.43, 1.0), 2, 7, 8.0, 5.0)
	)
	button.add_theme_stylebox_override(
		"disabled",
		_flat_style(Color(0.065, 0.055, 0.047, 0.88), Color(0.20, 0.17, 0.13, 0.82), 1, 7, 8.0, 5.0)
	)
	button.add_theme_color_override("font_disabled_color", Color(0.48, 0.45, 0.40, 1.0))


static func apply_atlas_region_button(
	button: Button,
	icon_id: String,
	current: bool = false
) -> void:
	button.toggle_mode = true
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(152.0, 42.0)
	button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.expand_icon = true
	button.add_theme_constant_override("icon_max_width", 26)
	button.add_theme_constant_override("h_separation", 6)
	button.add_theme_font_override("font", WorldHudAwakenedVisualSkin.display_font())
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", TEXT_PRIMARY)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_pressed_color", TEXT_DARK)
	button.icon = WorldHudAwakenedVisualSkin.texture_for_entry(icon_id)
	var normal_fill := Color(0.10, 0.065, 0.035, 0.90)
	var normal_edge := Color(0.77, 0.53, 0.25, 0.96)
	if current:
		normal_fill = Color(0.35, 0.19, 0.055, 0.96)
		normal_edge = Color(1.0, 0.80, 0.36, 1.0)
	button.add_theme_stylebox_override(
		"normal",
		_flat_style(normal_fill, normal_edge, 2, 9, 7.0, 4.0)
	)
	button.add_theme_stylebox_override(
		"hover",
		_flat_style(Color(0.28, 0.16, 0.06, 0.98), Color(1.0, 0.87, 0.48, 1.0), 3, 9, 7.0, 4.0)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_flat_style(Color(0.86, 0.65, 0.32, 0.98), Color(1.0, 0.90, 0.57, 1.0), 3, 9, 7.0, 4.0)
	)


static func apply_map_marker_button(
	button: Button,
	icon_id: String,
	role: String = MARKER_ROLE_LANDMARK
) -> void:
	button.focus_mode = Control.FOCUS_ALL
	button.custom_minimum_size = Vector2(36.0, 36.0)
	button.icon = WorldHudAwakenedVisualSkin.texture_for_entry(icon_id)
	button.expand_icon = true
	button.add_theme_constant_override("icon_max_width", 24)
	var normal_fill := Color(0.11, 0.075, 0.045, 0.94)
	var normal_edge := Color(0.96, 0.72, 0.28, 0.98)
	if role == MARKER_ROLE_PLAYER:
		normal_fill = Color(0.035, 0.18, 0.27, 0.97)
		normal_edge = Color(0.44, 0.88, 1.0, 1.0)
	elif role == MARKER_ROLE_TARGET:
		normal_fill = Color(0.44, 0.18, 0.035, 0.98)
		normal_edge = Color(1.0, 0.88, 0.28, 1.0)
	button.add_theme_stylebox_override(
		"normal",
		_flat_style(normal_fill, normal_edge, 2, 18, 2.0, 2.0)
	)
	button.add_theme_stylebox_override(
		"hover",
		_flat_style(Color(0.30, 0.18, 0.075, 0.99), Color(1.0, 0.88, 0.52, 1.0), 3, 18, 2.0, 2.0)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_flat_style(Color(0.78, 0.55, 0.22, 1.0), Color(1.0, 0.91, 0.60, 1.0), 3, 18, 2.0, 2.0)
	)


static func apply_close_button(button: Button) -> void:
	BackpackAwakenedVisualSkin.apply_close_button(button)


static func icon_for_target(target: Dictionary) -> String:
	var facility_type := str(target.get("facilityType", ""))
	match facility_type:
		"healer":
			return "event_character"
		"item_shop", "equipment_shop", "bank":
			return "event_backpack"
		"stable", "trainer":
			return "event_pet"
		"record_point":
			return "map"
		"guardian", "rebirth":
			return "top_classic"
	match str(target.get("kind", "")):
		"encounter_zone":
			return "hang"
		"interaction":
			var interaction_value = target.get("interaction", {})
			if interaction_value is Dictionary and str((interaction_value as Dictionary).get("kind", "")) == "warp":
				return "map"
	return "quest"


static func icon_for_region(region_type: String) -> String:
	match region_type:
		"village":
			return "map"
		"dungeon":
			return "top_classic"
		"field":
			return "top_hang"
	return "map"


static func _flat_style(
	background: Color,
	border: Color,
	border_width: int,
	radius: int,
	horizontal_margin: float,
	vertical_margin: float
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = horizontal_margin
	style.content_margin_right = horizontal_margin
	style.content_margin_top = vertical_margin
	style.content_margin_bottom = vertical_margin
	return style
