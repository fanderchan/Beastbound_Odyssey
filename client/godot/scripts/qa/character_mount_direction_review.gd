extends Node2D

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountComposite2D := preload("res://scripts/player/mount_composite_2d.gd")
const FORM_ID := "bui_novice_sprout_earth5_wind5"
const DIRECTIONS: Array[String] = [
	"south",
	"southwest",
	"west",
	"northwest",
	"north",
	"northeast",
	"east",
	"southeast",
]
const DIRECTION_NAMES := {
	"south": "南",
	"southwest": "西南",
	"west": "西",
	"northwest": "西北",
	"north": "北",
	"northeast": "东北",
	"east": "东",
	"southeast": "东南",
}
const DIRECTION_VECTORS := {
	"south": Vector2(0, 1),
	"southwest": Vector2(-0.707, 0.707),
	"west": Vector2(-1, 0),
	"northwest": Vector2(-0.707, -0.707),
	"north": Vector2(0, -1),
	"northeast": Vector2(0.707, -0.707),
	"east": Vector2(1, 0),
	"southeast": Vector2(0.707, 0.707),
}
const DIRECTION_SECONDS := 1.8

var elapsed: float = 0.0
var grid_mode: bool = true
var recording_mode: bool = false
var capture_path: String = ""
var capture_complete: bool = false
var active_direction_index: int = -1
var active_character: Sprite2D
var active_mount: Node2D
var active_title: Label
var active_mapping: Label
var grid_characters: Array[Sprite2D] = []
var grid_mounts: Array[Node2D] = []


func _ready() -> void:
	get_window().size = Vector2i(1280, 720)
	get_window().content_scale_size = Vector2i(1280, 720)
	for arg in OS.get_cmdline_user_args():
		if arg == "--record-mount-directions":
			recording_mode = true
			grid_mode = false
		elif arg.begins_with("--capture-mount-directions="):
			capture_path = arg.trim_prefix("--capture-mount-directions=").strip_edges()
			grid_mode = true
	CharacterActionAssetCatalog.warm()
	if grid_mode:
		_build_grid()
	else:
		_build_cycle()
	queue_redraw()


func _process(delta: float) -> void:
	elapsed += delta
	if grid_mode:
		_update_grid()
		if capture_path != "" and not capture_complete and elapsed >= 1.8:
			capture_complete = true
			var error := get_viewport().get_texture().get_image().save_png(capture_path)
			print("mount direction grid capture: path=%s error=%d" % [capture_path, error])
			get_tree().quit(0 if error == OK else 1)
		return
	_update_cycle()
	if recording_mode and elapsed >= DIRECTION_SECONDS * float(DIRECTIONS.size()):
		get_tree().quit(0)


func _draw() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color("203a36"), true)
	_draw_isometric_ground(size)
	draw_rect(Rect2(0, 0, size.x, 92), Color(0.035, 0.09, 0.085, 0.92), true)
	if grid_mode:
		_draw_grid_panels()
	else:
		_draw_cycle_panels()


func _build_grid() -> void:
	_add_label("人物 / 芽耳布伊骑乘 · 八方向总览", Vector2(42, 24), 30, Color("f4de94"))
	_add_label("每格左侧为人物，右侧为运行时分层骑乘；这里如实显示当前母版复用与镜像", Vector2(43, 61), 16, Color("c8d8cf"))
	for index in range(DIRECTIONS.size()):
		var direction := DIRECTIONS[index]
		var rect := _grid_rect(index)
		_add_label(
			"%d  %s · %s" % [index + 1, DIRECTION_NAMES[direction], _mapping_text(direction)],
			rect.position + Vector2(18, 12),
			16,
			Color("edd689")
		)
		_add_label("人物", rect.position + Vector2(52, 49), 13, Color("b9cbc1"))
		_add_label("骑乘", rect.position + Vector2(197, 49), 13, Color("b9cbc1"))
		var character := _character_sprite(rect.position + Vector2(82, 202), 0.43)
		grid_characters.append(character)
		var mount := _mount_composite(rect.position + Vector2(220, 215), direction, 0.43)
		grid_mounts.append(mount)


func _build_cycle() -> void:
	_add_label("人物 / 芽耳布伊骑乘 · 八方向逐项录像", Vector2(42, 24), 30, Color("f4de94"))
	_add_label("左：人物原动作层　　右：坐骑 + 骑手姿态 + 宠物前景遮挡", Vector2(43, 61), 16, Color("c8d8cf"))
	_add_label("不骑宠", Vector2(255, 128), 24, Color("e8d58f"))
	_add_label("骑芽耳布伊", Vector2(864, 128), 24, Color("e8d58f"))
	active_title = _add_label("", Vector2(520, 108), 28, Color("fff0b2"))
	active_mapping = _add_label("", Vector2(505, 147), 16, Color("b9cbc1"))
	active_character = _character_sprite(Vector2(333, 438), 0.92)
	active_mount = _mount_composite(Vector2(928, 488), DIRECTIONS[0], 0.91)
	for index in range(DIRECTIONS.size()):
		var x := 34.0 + float(index) * 153.0
		_add_label("%d %s" % [index + 1, DIRECTION_NAMES[DIRECTIONS[index]]], Vector2(x + 37, 655), 15, Color("cfdcd4"))


func _update_grid() -> void:
	for index in range(DIRECTIONS.size()):
		var direction := DIRECTIONS[index]
		var character := grid_characters[index]
		_update_character(character, direction, elapsed)
		grid_mounts[index].call("set_visual_state", direction, "walk", elapsed)


func _update_cycle() -> void:
	var next_index := mini(DIRECTIONS.size() - 1, int(floor(elapsed / DIRECTION_SECONDS)))
	var direction := DIRECTIONS[next_index]
	if next_index != active_direction_index:
		active_direction_index = next_index
		active_title.text = "第 %d / 8 方向：%s" % [next_index + 1, DIRECTION_NAMES[direction]]
		active_mapping.text = _mapping_text(direction)
		queue_redraw()
	var local_elapsed := fmod(elapsed, DIRECTION_SECONDS)
	_update_character(active_character, direction, local_elapsed)
	active_mount.call("set_visual_state", direction, "walk", local_elapsed)


func _update_character(sprite: Sprite2D, direction: String, animation_elapsed: float) -> void:
	var view := CharacterActionAssetCatalog.world_view_for_direction(direction)
	sprite.flip_h = CharacterActionAssetCatalog.world_flip_h_for_direction(direction)
	sprite.texture = CharacterActionAssetCatalog.texture_for_elapsed(view, "walk", animation_elapsed)


func _character_sprite(position_value: Vector2, scale_value: float) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	sprite.position = position_value
	sprite.scale = Vector2(scale_value, scale_value)
	add_child(sprite)
	return sprite


func _mount_composite(position_value: Vector2, direction: String, scale_value: float) -> Node2D:
	var composite := Node2D.new()
	composite.set_script(MountComposite2D)
	composite.position = position_value
	add_child(composite)
	composite.call("set_mount_form", FORM_ID)
	composite.call("set_presentation_scale", scale_value)
	composite.call("set_visual_state", direction, "walk", 0.0)
	return composite


func _draw_grid_panels() -> void:
	for index in range(DIRECTIONS.size()):
		var rect := _grid_rect(index)
		draw_style_box(_panel_style(), rect)
		_draw_direction_arrow(rect.position + Vector2(152, 64), DIRECTIONS[index], 21.0)


func _draw_cycle_panels() -> void:
	draw_style_box(_panel_style(), Rect2(54, 177, 535, 430))
	draw_style_box(_panel_style(), Rect2(691, 177, 535, 430))
	var direction := DIRECTIONS[maxi(0, active_direction_index)]
	_draw_direction_arrow(Vector2(640, 355), direction, 55.0)
	for index in range(DIRECTIONS.size()):
		var rect := Rect2(34.0 + float(index) * 153.0, 641, 142, 54)
		var active := index == active_direction_index
		draw_rect(rect, Color("8c6a28") if active else Color(0.04, 0.10, 0.09, 0.72), true)
		draw_rect(rect, Color("efce70") if active else Color(0.47, 0.38, 0.18, 0.85), false, 2.0)


func _draw_direction_arrow(center: Vector2, direction: String, length: float) -> void:
	var vector := (DIRECTION_VECTORS[direction] as Vector2).normalized()
	var start := center - vector * length * 0.45
	var finish := center + vector * length * 0.55
	var color := Color("f2d46e")
	draw_line(start, finish, color, 4.0, true)
	var perpendicular := Vector2(-vector.y, vector.x)
	draw_colored_polygon(PackedVector2Array([
		finish,
		finish - vector * 13.0 + perpendicular * 8.0,
		finish - vector * 13.0 - perpendicular * 8.0,
	]), color)


func _draw_isometric_ground(size: Vector2) -> void:
	var line_color := Color(0.55, 0.65, 0.48, 0.08)
	for offset in range(-720, 1500, 64):
		draw_line(Vector2(offset, 92), Vector2(offset + 720, size.y), line_color, 1.0)
		draw_line(Vector2(offset, size.y), Vector2(offset + 720, 92), line_color, 1.0)


func _grid_rect(index: int) -> Rect2:
	var column := index % 4
	var row := index / 4
	return Rect2(20 + column * 315, 105 + row * 294, 295, 274)


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.085, 0.08, 0.54)
	style.border_color = Color(0.70, 0.51, 0.19, 0.78)
	style.set_border_width_all(2)
	style.set_corner_radius_all(13)
	return style


func _mapping_text(direction: String) -> String:
	var view := CharacterActionAssetCatalog.world_view_for_direction(direction)
	var view_name := "正面母版" if view == CharacterActionAssetCatalog.VIEW_FRONT else "背面母版"
	var mirror_name := "水平镜像" if CharacterActionAssetCatalog.world_flip_h_for_direction(direction) else "未镜像"
	return "%s · %s" % [view_name, mirror_name]


func _add_label(text_value: String, position_value: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	add_child(label)
	return label
