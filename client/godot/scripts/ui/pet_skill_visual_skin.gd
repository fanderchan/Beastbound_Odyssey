extends RefCounted

const PetManagementVisualSkin := preload("res://scripts/ui/pet_management_visual_skin.gd")

const CARD_WIDTH := 396.0
const CARD_COLLAPSED_HEIGHT := 90.0
const CARD_EXPANDED_HEIGHT := 162.0
const ICON_FRAME_SIZE := 68.0
const ICON_SIZE := 56.0

const ACTIVE_ACCENT := Color(0.83, 0.48, 0.20, 1.0)
const PASSIVE_ACCENT := Color(0.58, 0.36, 0.73, 1.0)
const EMPTY_ACCENT := Color(0.47, 0.43, 0.36, 0.82)
const SELECTED_ACCENT := Color(1.0, 0.76, 0.26, 1.0)
const LOCKED_ACCENT := Color(0.72, 0.61, 0.43, 1.0)


static func apply_card_button(
	button: Button,
	kind: String,
	selected: bool,
	is_empty: bool
) -> void:
	button.text = ""
	button.toggle_mode = false
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.clip_contents = true
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.mouse_force_pass_scroll_events = true
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_stylebox_override(
		"normal",
		card_style(kind, selected, is_empty)
	)
	button.add_theme_stylebox_override(
		"hover",
		card_style(kind, selected, is_empty, true)
	)
	button.add_theme_stylebox_override(
		"pressed",
		card_style(kind, true, is_empty, false, true)
	)
	button.add_theme_stylebox_override(
		"focus",
		card_style(kind, true, is_empty, true)
	)
	button.add_theme_stylebox_override(
		"disabled",
		card_style(kind, selected, is_empty)
	)
	for color_name in [
		"font_color",
		"font_hover_color",
		"font_pressed_color",
		"font_focus_color",
		"font_disabled_color",
	]:
		button.add_theme_color_override(color_name, Color.TRANSPARENT)


static func card_style(
	kind: String,
	selected: bool,
	is_empty: bool,
	hovered: bool = false,
	pressed: bool = false
) -> StyleBoxFlat:
	var accent := accent_for(kind, is_empty)
	if selected:
		accent = SELECTED_ACCENT
	elif hovered:
		accent = accent.lerp(Color(1.0, 0.83, 0.47, 1.0), 0.30)
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.10, 0.075, 0.052, 0.98)
		if selected
		else Color(0.075, 0.060, 0.047, 0.93)
	)
	if is_empty:
		style.bg_color = Color(0.065, 0.057, 0.049, 0.84)
	if pressed:
		style.bg_color = style.bg_color.lightened(0.04)
	style.border_color = accent
	var border_width := 2 if selected or hovered else 1
	style.border_width_left = border_width
	style.border_width_top = border_width
	style.border_width_right = border_width
	style.border_width_bottom = border_width
	style.corner_radius_top_left = 9
	style.corner_radius_top_right = 9
	style.corner_radius_bottom_left = 9
	style.corner_radius_bottom_right = 9
	style.shadow_color = Color(0.015, 0.010, 0.006, 0.64)
	style.shadow_size = 4 if selected else 2
	return style


static func icon_frame_style(
	kind: String,
	selected: bool,
	is_empty: bool
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = (
		Color(0.115, 0.085, 0.060, 0.98)
		if not is_empty
		else Color(0.09, 0.078, 0.066, 0.80)
	)
	style.border_color = SELECTED_ACCENT if selected else accent_for(kind, is_empty)
	var width := 2 if selected else 1
	style.border_width_left = width
	style.border_width_top = width
	style.border_width_right = width
	style.border_width_bottom = width
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	return style


static func detail_style(kind: String, is_empty: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.030, 0.026, 0.70)
	style.border_color = accent_for(kind, is_empty).darkened(0.24)
	style.border_width_top = 1
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	style.content_margin_left = 8.0
	style.content_margin_top = 4.0
	style.content_margin_right = 8.0
	style.content_margin_bottom = 4.0
	return style


static func tag_style(kind: String, muted: bool = false) -> StyleBoxFlat:
	var accent := accent_for(kind, false)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(accent.r * 0.20, accent.g * 0.20, accent.b * 0.20, 0.84)
	style.border_color = Color(accent.r, accent.g, accent.b, 0.56 if muted else 0.82)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 5
	style.corner_radius_top_right = 5
	style.corner_radius_bottom_left = 5
	style.corner_radius_bottom_right = 5
	style.content_margin_left = 7.0
	style.content_margin_top = 2.0
	style.content_margin_right = 7.0
	style.content_margin_bottom = 2.0
	return style


static func apply_name_label(label: Label, selected: bool = false) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.display_font())
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override(
		"font_color",
		PetManagementVisualSkin.GOLD_TEXT if selected else PetManagementVisualSkin.CREAM_TEXT
	)
	label.add_theme_color_override("font_outline_color", Color(0.03, 0.02, 0.01, 0.95))
	label.add_theme_constant_override("outline_size", 2)


static func apply_secondary_label(label: Label, accent: Color) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override("font_color", accent.lerp(Color.WHITE, 0.28))


static func apply_body_label(label: Label, muted: bool = false) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", 13)
	label.add_theme_color_override(
		"font_color",
		PetManagementVisualSkin.MUTED_TEXT if muted else PetManagementVisualSkin.CREAM_TEXT
	)


static func apply_tag_label(label: Label, kind: String, muted: bool = false) -> void:
	label.add_theme_font_override("font", PetManagementVisualSkin.body_font())
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override(
		"font_color",
		PetManagementVisualSkin.MUTED_TEXT
		if muted
		else accent_for(kind, false).lerp(Color.WHITE, 0.34)
	)


static func accent_for(kind: String, is_empty: bool = false) -> Color:
	if is_empty or kind == "empty":
		return EMPTY_ACCENT
	if kind == "passive":
		return PASSIVE_ACCENT
	return ACTIVE_ACCENT
