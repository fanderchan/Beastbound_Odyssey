extends RefCounted

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)

# The codex intentionally reuses the already-published backpack primitives.
# It must not pull the unpublished pet-management visual package into its
# otherwise independent runtime closure.
const TAB_NORMAL_TEXTURE := BackpackAwakenedVisualSkin.TAB_NORMAL_TEXTURE
const TAB_SELECTED_TEXTURE := BackpackAwakenedVisualSkin.TAB_SELECTED_TEXTURE
const PORTRAIT_SLOT_NORMAL_TEXTURE := BackpackAwakenedVisualSkin.ITEM_NORMAL_TEXTURE
const PORTRAIT_SLOT_SELECTED_TEXTURE := BackpackAwakenedVisualSkin.ITEM_SELECTED_TEXTURE
const HEADER_CODEX_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/top_pet.png"
)

const BROWN_TEXT := Color(0.25, 0.15, 0.09, 1.0)


static func display_font() -> Font:
	return BackpackAwakenedVisualSkin.display_font()


static func body_font() -> Font:
	return BackpackAwakenedVisualSkin.body_font()


static func content_trimmed_texture(texture: Texture2D) -> Texture2D:
	return texture


static func transparent_panel_style() -> StyleBoxFlat:
	return BackpackAwakenedVisualSkin.transparent_style()


static func apply_title(label: Label, font_size: int = 26) -> void:
	BackpackAwakenedVisualSkin.apply_title(label, font_size)


static func apply_close_button(button: Button) -> void:
	BackpackAwakenedVisualSkin.apply_close_button(button)


static func apply_tab_button(button: Button) -> void:
	BackpackAwakenedVisualSkin.apply_tab_button(button)
	# The codex owns selection in its presenter state. Keeping these as ordinary
	# release buttons avoids two independent toggle states appearing selected.
	button.toggle_mode = false


static func apply_action_button(button: Button, compact: bool = false) -> void:
	BackpackAwakenedVisualSkin.apply_action_button(button, false, false)
	if compact:
		button.custom_minimum_size.y = 34.0
		button.add_theme_font_size_override("font_size", 14)


static func apply_help_button(button: Button) -> void:
	button.text = "?"
	button.toggle_mode = false
	button.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	button.custom_minimum_size = Vector2(28.0, 28.0)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_font_override("font", display_font())
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_color_override("font_color", BROWN_TEXT)
	button.add_theme_color_override("font_hover_color", BROWN_TEXT)
	button.add_theme_color_override("font_pressed_color", BROWN_TEXT)
	button.add_theme_color_override("font_focus_color", BROWN_TEXT)
	button.add_theme_stylebox_override(
		"normal",
		_texture_style(PORTRAIT_SLOT_NORMAL_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"hover",
		_texture_style(PORTRAIT_SLOT_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"pressed",
		_texture_style(PORTRAIT_SLOT_SELECTED_TEXTURE)
	)
	button.add_theme_stylebox_override(
		"focus",
		_texture_style(PORTRAIT_SLOT_SELECTED_TEXTURE)
	)


static func apply_help_decoration(label: Label) -> void:
	label.text = "?"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", display_font())
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", BROWN_TEXT)
	label.add_theme_stylebox_override(
		"normal",
		_texture_style(PORTRAIT_SLOT_NORMAL_TEXTURE)
	)


static func _texture_style(texture: Texture2D) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.draw_center = true
	return style
