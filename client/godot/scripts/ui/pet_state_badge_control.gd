extends Control

const BADGE_SIZE := Vector2(58.0, 24.0)
const TEXTURE_PATHS := {
	"battle": "res://assets/ui/pet_state_badges/battle.png",
	"riding": "res://assets/ui/pet_state_badges/riding.png",
	"standby": "res://assets/ui/pet_state_badges/standby.png",
	"rest": "res://assets/ui/pet_state_badges/rest.png",
	"storage": "res://assets/ui/pet_state_badges/storage.png",
}

static var _texture_cache: Dictionary = {}
static var _missing_texture_paths: Dictionary = {}

var _state_id := "standby"
var _badge_text := "待机"
var _fill_color := Color(0.25, 0.34, 0.40, 1.0)
var _inner_color := Color(0.12, 0.18, 0.22, 0.96)
var _border_color := Color(0.58, 0.72, 0.78, 1.0)
var _text_color := Color(0.92, 0.96, 0.98, 1.0)
var _texture_rect: TextureRect
var _text_label: Label


func _init() -> void:
	custom_minimum_size = BADGE_SIZE
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	_texture_rect = TextureRect.new()
	_texture_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_texture_rect)
	_text_label = Label.new()
	_text_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_text_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_text_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_text_label.add_theme_font_size_override("font_size", 13)
	_text_label.add_theme_constant_override("outline_size", 1)
	_text_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_text_label)
	configure(_state_id, _badge_text)


func configure(state_id: String, badge_text: String) -> void:
	_state_id = state_id.strip_edges()
	_badge_text = badge_text.strip_edges()
	var palette := _palette_for_state(_state_id)
	_fill_color = palette.get("fill", _fill_color)
	_inner_color = palette.get("inner", _inner_color)
	_border_color = palette.get("border", _border_color)
	_text_color = palette.get("text", _text_color)
	_text_label.text = _badge_text
	_text_label.add_theme_color_override("font_color", _text_color)
	_text_label.add_theme_color_override("font_outline_color", Color(0.04, 0.05, 0.05, 0.82))
	_texture_rect.texture = _texture_for_state(_state_id)
	_texture_rect.visible = _texture_rect.texture != null
	queue_redraw()


func state_id() -> String:
	return _state_id


func badge_text() -> String:
	return _badge_text


func accent_color() -> Color:
	return _fill_color


func texture_asset_path() -> String:
	return str(TEXTURE_PATHS.get(_state_id, ""))


func uses_texture_asset() -> bool:
	return _texture_rect.texture != null


func _draw() -> void:
	if _texture_rect.texture != null:
		return
	var width := maxf(1.0, size.x)
	var height := maxf(1.0, size.y)
	var outer := PackedVector2Array([
		Vector2(0.0, 5.0),
		Vector2(7.0, 0.0),
		Vector2(width - 9.0, 0.0),
		Vector2(width, height * 0.5),
		Vector2(width - 9.0, height),
		Vector2(7.0, height),
		Vector2(0.0, height - 5.0),
	])
	draw_colored_polygon(outer, _fill_color)
	var inset := 2.0
	var inner := PackedVector2Array([
		Vector2(inset, 6.0),
		Vector2(8.0, inset),
		Vector2(width - 10.0, inset),
		Vector2(width - inset, height * 0.5),
		Vector2(width - 10.0, height - inset),
		Vector2(8.0, height - inset),
		Vector2(inset, height - 6.0),
	])
	draw_colored_polygon(inner, _inner_color)
	var outline := PackedVector2Array(outer)
	outline.append(outer[0])
	draw_polyline(outline, _border_color, 1.5, true)
	# Small engraved studs keep the fallback visually badge-like. A future PNG
	# replaces this backing while the localized label stays a real UI label.
	draw_circle(Vector2(6.0, height * 0.5), 1.4, _border_color)
	draw_circle(Vector2(width - 7.5, height * 0.5), 1.4, _border_color)


func _texture_for_state(state_id: String) -> Texture2D:
	var path := str(TEXTURE_PATHS.get(state_id, ""))
	if path == "" or _missing_texture_paths.has(path):
		return null
	if _texture_cache.has(path):
		return _texture_cache[path] as Texture2D
	if not ResourceLoader.exists(path, "Texture2D"):
		_missing_texture_paths[path] = true
		return null
	var texture = load(path)
	if texture is Texture2D:
		_texture_cache[path] = texture
		return texture as Texture2D
	_missing_texture_paths[path] = true
	return null


func _palette_for_state(state_id: String) -> Dictionary:
	match state_id:
		"battle":
			return {
				"fill": Color(0.94, 0.65, 0.12, 1.0),
				"inner": Color(0.46, 0.27, 0.035, 0.98),
				"border": Color(1.0, 0.86, 0.34, 1.0),
				"text": Color(1.0, 0.93, 0.62, 1.0),
			}
		"riding":
			return {
				"fill": Color(0.18, 0.72, 0.76, 1.0),
				"inner": Color(0.045, 0.31, 0.35, 0.98),
				"border": Color(0.53, 0.94, 0.93, 1.0),
				"text": Color(0.78, 1.0, 0.98, 1.0),
			}
		"rest":
			return {
				"fill": Color(0.48, 0.38, 0.70, 1.0),
				"inner": Color(0.20, 0.16, 0.34, 0.98),
				"border": Color(0.75, 0.67, 0.96, 1.0),
				"text": Color(0.93, 0.89, 1.0, 1.0),
			}
		"storage":
			return {
				"fill": Color(0.48, 0.42, 0.27, 1.0),
				"inner": Color(0.24, 0.20, 0.11, 0.98),
				"border": Color(0.76, 0.67, 0.40, 1.0),
				"text": Color(0.96, 0.90, 0.70, 1.0),
			}
		_:
			return {
				"fill": Color(0.27, 0.39, 0.46, 1.0),
				"inner": Color(0.11, 0.19, 0.23, 0.98),
				"border": Color(0.57, 0.75, 0.82, 1.0),
				"text": Color(0.88, 0.96, 1.0, 1.0),
			}
