extends Node2D

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountComposite2D := preload("res://scripts/player/mount_composite_2d.gd")
const FORM_ID := "bui_novice_sprout_earth5_wind5"

var elapsed: float = 0.0
var front_character: Sprite2D
var back_character: Sprite2D
var front_mount: Node2D
var back_mount: Node2D
var capture_path: String = ""
var capture_complete: bool = false
var recording_mode: bool = false


func _ready() -> void:
	get_window().size = Vector2i(1280, 720)
	get_window().content_scale_size = Vector2i(1280, 720)
	CharacterActionAssetCatalog.warm()
	_build_labels()
	front_character = _character_sprite(Vector2(235, 430), false)
	back_character = _character_sprite(Vector2(445, 430), true)
	front_mount = _mount_composite(Vector2(790, 472), "southwest")
	back_mount = _mount_composite(Vector2(1060, 472), "northeast")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-mount-art="):
			capture_path = arg.trim_prefix("--capture-mount-art=").strip_edges()
		elif arg == "--record-mount-art":
			recording_mode = true
	queue_redraw()


func _process(delta: float) -> void:
	elapsed += delta
	var walk_phase := fmod(elapsed, 6.0)
	var action := "walk" if walk_phase < 4.8 else "idle"
	front_character.texture = CharacterActionAssetCatalog.texture_for_elapsed(
		CharacterActionAssetCatalog.VIEW_FRONT,
		action,
		elapsed
	)
	back_character.texture = CharacterActionAssetCatalog.texture_for_elapsed(
		CharacterActionAssetCatalog.VIEW_BACK,
		action,
		elapsed
	)
	front_character.position.y = 430.0 + sin(elapsed * 2.2) * 2.0
	back_character.position.y = 430.0 + sin(elapsed * 2.2 + 0.8) * 2.0
	front_mount.call("set_visual_state", "southwest", action, elapsed)
	back_mount.call("set_visual_state", "northeast", action, elapsed)
	if capture_path != "" and not capture_complete and elapsed >= 1.8:
		capture_complete = true
		var error := get_viewport().get_texture().get_image().save_png(capture_path)
		print("character mount art capture: path=%s error=%d" % [capture_path, error])
		get_tree().quit(0 if error == OK else 1)
	elif recording_mode and elapsed >= 10.0:
		get_tree().quit(0)


func _draw() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color("263d39"), true)
	_draw_isometric_ground(size)
	_draw_section_backplate(Rect2(54, 134, 432, 440))
	_draw_section_backplate(Rect2(528, 134, 698, 440))
	for point in [Vector2(91, 615), Vector2(180, 590), Vector2(1150, 604), Vector2(1190, 568)]:
		draw_circle(point, 26.0, Color(0.18, 0.31, 0.25, 0.82))
		draw_circle(point + Vector2(14, -15), 18.0, Color(0.25, 0.43, 0.31, 0.9))


func _draw_isometric_ground(size: Vector2) -> void:
	var line_color := Color(0.55, 0.65, 0.48, 0.10)
	for offset in range(-720, 1500, 64):
		draw_line(Vector2(offset, 96), Vector2(offset + 720, 720), line_color, 1.0)
		draw_line(Vector2(offset, 720), Vector2(offset + 720, 96), line_color, 1.0)
	draw_rect(Rect2(0, 0, size.x, 100), Color(0.04, 0.10, 0.10, 0.58), true)


func _draw_section_backplate(rect: Rect2) -> void:
	draw_style_box(_panel_style(), rect)


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.09, 0.09, 0.36)
	style.border_color = Color(0.73, 0.53, 0.20, 0.72)
	style.set_border_width_all(2)
	style.set_corner_radius_all(16)
	return style


func _character_sprite(position_value: Vector2, back_view: bool) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	sprite.position = position_value
	sprite.scale = Vector2(0.76, 0.76)
	sprite.texture = CharacterActionAssetCatalog.texture_for_frame(
		CharacterActionAssetCatalog.VIEW_BACK if back_view else CharacterActionAssetCatalog.VIEW_FRONT,
		"walk",
		1
	)
	add_child(sprite)
	return sprite


func _mount_composite(position_value: Vector2, facing: String) -> Node2D:
	var composite := Node2D.new()
	composite.set_script(MountComposite2D)
	composite.position = position_value
	add_child(composite)
	composite.call("set_mount_form", FORM_ID)
	composite.call("set_presentation_scale", 0.86)
	composite.call("set_visual_state", facing, "walk", 0.0)
	return composite


func _build_labels() -> void:
	_add_label("人物正式美术", Vector2(76, 34), 30, Color("f4de94"))
	_add_label("见习猎人 · 正面 / 背面行走", Vector2(78, 94), 19, Color("d8e5d4"))
	_add_label("芽耳布伊骑乘", Vector2(550, 34), 30, Color("f4de94"))
	_add_label("坐骑本体 + 骑手姿态 + 前景遮挡", Vector2(552, 94), 19, Color("d8e5d4"))
	_add_label("正向", Vector2(716, 528), 18, Color("d8c78f"))
	_add_label("背向", Vector2(1015, 528), 18, Color("d8c78f"))


func _add_label(text_value: String, position_value: Vector2, font_size: int, color: Color) -> void:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	add_child(label)
