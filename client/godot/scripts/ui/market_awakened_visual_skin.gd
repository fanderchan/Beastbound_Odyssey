extends RefCounted

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)

const CREAM_TEXT := Color(0.96, 0.91, 0.80, 1.0)
const MUTED_TEXT := Color(0.72, 0.67, 0.57, 1.0)
const GOLD_TEXT := Color(1.0, 0.73, 0.24, 1.0)


static func display_font() -> Font:
	return BackpackAwakenedVisualSkin.display_font()


static func body_font() -> Font:
	return BackpackAwakenedVisualSkin.body_font()


static func transparent_panel_style() -> StyleBoxFlat:
	return BackpackAwakenedVisualSkin.transparent_style()


static func dark_panel_style(alpha: float = 0.90, radius: int = 10) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.034, 0.026, alpha)
	style.border_color = Color(0.50, 0.33, 0.18, 0.95)
	style.set_border_width_all(2)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 12.0
	style.content_margin_right = 12.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 10.0
	return style


static func soft_panel_style(alpha: float = 0.72, radius: int = 8) -> StyleBoxFlat:
	var style := dark_panel_style(alpha, radius)
	style.border_color = Color(0.39, 0.29, 0.19, 0.78)
	style.set_border_width_all(1)
	return style


static func slot_style(selected: bool = false, disabled_value: bool = false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.06, 0.045, 0.94 if not disabled_value else 0.50)
	style.border_color = (
		Color(1.0, 0.75, 0.23, 1.0)
		if selected
		else Color(0.47, 0.34, 0.20, 0.92)
	)
	style.set_border_width_all(3 if selected else 1)
	style.set_corner_radius_all(8)
	style.content_margin_left = 8.0
	style.content_margin_right = 8.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	return style


static func currency_chip_style() -> StyleBoxFlat:
	return BackpackAwakenedVisualSkin.currency_chip_style()


static func apply_title(label: Label, font_size: int = 28) -> void:
	BackpackAwakenedVisualSkin.apply_title(label, font_size)


static func apply_body(label: Label, font_size: int = 15, muted: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_body(label, font_size, muted)


static func apply_rich_text(label: RichTextLabel, font_size: int = 15) -> void:
	label.add_theme_font_override("normal_font", body_font())
	label.add_theme_font_override("bold_font", display_font())
	label.add_theme_font_size_override("normal_font_size", font_size)
	label.add_theme_font_size_override("bold_font_size", font_size + 1)
	label.add_theme_color_override("default_color", CREAM_TEXT)
	label.add_theme_color_override("font_outline_color", Color(0.03, 0.02, 0.01, 0.92))
	label.add_theme_constant_override("outline_size", 2)


static func apply_close_button(button: Button) -> void:
	BackpackAwakenedVisualSkin.apply_close_button(button)


static func apply_action_button(button: Button, destructive: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_action_button(button, destructive, button.disabled)


static func apply_tab_button(button: Button, selected: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_tab_button(button, selected)


static func apply_item_button(button: Button, item_id: String, selected: bool) -> void:
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.custom_minimum_size = Vector2(0.0, 74.0)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.add_theme_constant_override("icon_max_width", 48)
	button.expand_icon = true
	button.add_theme_font_override("font", body_font())
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_color_override("font_color", CREAM_TEXT)
	button.add_theme_color_override("font_hover_color", Color(1.0, 0.91, 0.64, 1.0))
	button.add_theme_color_override("font_pressed_color", Color(1.0, 0.80, 0.32, 1.0))
	button.add_theme_color_override("font_disabled_color", Color(0.60, 0.57, 0.51, 0.72))
	button.add_theme_stylebox_override("normal", slot_style(selected, false))
	button.add_theme_stylebox_override("hover", slot_style(true, false))
	button.add_theme_stylebox_override("pressed", slot_style(true, false))
	button.add_theme_stylebox_override("focus", slot_style(true, false))
	button.add_theme_stylebox_override("disabled", slot_style(selected, true))
	button.icon = BackpackAwakenedVisualSkin.item_texture_for(item_id)


static func apply_spinbox(spinbox: SpinBox) -> void:
	spinbox.add_theme_font_override("font", body_font())
	spinbox.add_theme_font_size_override("font_size", 15)
	spinbox.add_theme_color_override("font_color", CREAM_TEXT)
	var line_edit := spinbox.get_line_edit()
	if line_edit != null:
		line_edit.add_theme_font_override("font", body_font())
		line_edit.add_theme_font_size_override("font_size", 15)
		line_edit.add_theme_color_override("font_color", CREAM_TEXT)
		line_edit.add_theme_stylebox_override("normal", dark_panel_style(0.92, 7))
		line_edit.add_theme_stylebox_override("focus", dark_panel_style(0.98, 7))


static func item_texture_for(item_id: String) -> Texture2D:
	return BackpackAwakenedVisualSkin.item_texture_for(item_id)
