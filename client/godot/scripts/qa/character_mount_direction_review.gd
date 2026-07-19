extends Node2D

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountedCharacter2D := preload("res://scripts/player/mounted_character_2d.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")

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
var active_pet: Sprite2D
var active_mount: Node2D
var active_title: Label
var active_mapping: Label
var grid_characters: Array[Sprite2D] = []
var grid_pets: Array[Sprite2D] = []
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
	PetActionAssetCatalog.warm_world_form(FORM_ID)
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
			print("true eight direction grid capture: path=%s error=%d" % [capture_path, error])
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
	_add_label("人物 / 宠物 / 人骑宠 · 真八方向视觉验收", Vector2(42, 20), 29, Color("f4de94"))
	_add_label("每格均为独立源方向，不做水平镜像；三栏按游戏内世界比例等比缩放", Vector2(43, 58), 16, Color("c8d8cf"))
	for index in range(DIRECTIONS.size()):
		var direction := DIRECTIONS[index]
		var rect := _grid_rect(index)
		_add_label(
			"%d  %s · 独立源图" % [index + 1, DIRECTION_NAMES[direction]],
			rect.position + Vector2(15, 10),
			15,
			Color("edd689")
		)
		_add_label("人", rect.position + Vector2(49, 43), 13, Color("b9cbc1"))
		_add_label("宠", rect.position + Vector2(139, 43), 13, Color("b9cbc1"))
		_add_label("骑", rect.position + Vector2(229, 43), 13, Color("b9cbc1"))
		# 地图中徒步人物和整体骑乘图使用同一展示比例；战斗比例由战斗配置独立决定。
		grid_characters.append(_character_sprite(rect.position + Vector2(52, 223), 0.29))
		grid_pets.append(_pet_sprite(rect.position + Vector2(137, 220), 0.29))
		grid_mounts.append(_mounted_character(rect.position + Vector2(233, 226), direction, 0.29))


func _build_cycle() -> void:
	_add_label("人物 / 宠物 / 人骑宠 · 真八方向逐项录像", Vector2(42, 20), 29, Color("f4de94"))
	_add_label("独立八向源图 · 无运行时镜像 · 骑手、坐骑与运动轴必须一致", Vector2(43, 58), 16, Color("c8d8cf"))
	_add_label("人物", Vector2(190, 126), 23, Color("e8d58f"))
	_add_label("宠物", Vector2(596, 126), 23, Color("e8d58f"))
	_add_label("人骑宠", Vector2(994, 126), 23, Color("e8d58f"))
	active_title = _add_label("", Vector2(520, 98), 26, Color("fff0b2"))
	active_mapping = _add_label("", Vector2(519, 158), 15, Color("b9cbc1"))
	active_character = _character_sprite(Vector2(214, 475), 0.72)
	active_pet = _pet_sprite(Vector2(624, 477), 0.72)
	active_mount = _mounted_character(Vector2(1031, 489), DIRECTIONS[0], 0.72)
	for index in range(DIRECTIONS.size()):
		var x := 34.0 + float(index) * 153.0
		_add_label("%d %s" % [index + 1, DIRECTION_NAMES[DIRECTIONS[index]]], Vector2(x + 37, 655), 15, Color("cfdcd4"))


func _update_grid() -> void:
	for index in range(DIRECTIONS.size()):
		var direction := DIRECTIONS[index]
		_update_character(grid_characters[index], direction, elapsed)
		_update_pet(grid_pets[index], direction, elapsed)
		grid_mounts[index].call("set_visual_state", direction, "walk", elapsed)


func _update_cycle() -> void:
	var next_index := mini(DIRECTIONS.size() - 1, int(floor(elapsed / DIRECTION_SECONDS)))
	var direction := DIRECTIONS[next_index]
	if next_index != active_direction_index:
		active_direction_index = next_index
		active_title.text = "第 %d / 8 方向：%s" % [next_index + 1, DIRECTION_NAMES[direction]]
		active_mapping.text = "人物、宠物、骑乘均为 %s 独立源图" % DIRECTION_NAMES[direction]
		queue_redraw()
	var local_elapsed := fmod(elapsed, DIRECTION_SECONDS)
	_update_character(active_character, direction, local_elapsed)
	_update_pet(active_pet, direction, local_elapsed)
	active_mount.call("set_visual_state", direction, "walk", local_elapsed)


func _update_character(sprite: Sprite2D, direction: String, animation_elapsed: float) -> void:
	sprite.flip_h = false
	sprite.texture = CharacterActionAssetCatalog.world_texture_for_elapsed(direction, "walk", animation_elapsed)


func _update_pet(sprite: Sprite2D, direction: String, animation_elapsed: float) -> void:
	sprite.flip_h = false
	sprite.texture = PetActionAssetCatalog.world_texture_for_elapsed(FORM_ID, direction, "walk", animation_elapsed)


func _character_sprite(position_value: Vector2, scale_value: float) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	sprite.position = position_value
	sprite.scale = Vector2(scale_value, scale_value)
	add_child(sprite)
	return sprite


func _pet_sprite(position_value: Vector2, scale_value: float) -> Sprite2D:
	return _character_sprite(position_value, scale_value)


func _mounted_character(position_value: Vector2, direction: String, scale_value: float) -> Node2D:
	var mounted := Node2D.new()
	mounted.set_script(MountedCharacter2D)
	mounted.position = position_value
	add_child(mounted)
	mounted.call("set_mount_form", FORM_ID)
	mounted.call("set_presentation_scale", scale_value)
	mounted.call("set_visual_state", direction, "walk", 0.0)
	return mounted


func _draw_grid_panels() -> void:
	for index in range(DIRECTIONS.size()):
		var rect := _grid_rect(index)
		draw_style_box(_panel_style(), rect)
		_draw_direction_arrow(rect.position + Vector2(274, 27), DIRECTIONS[index], 17.0)


func _draw_cycle_panels() -> void:
	draw_style_box(_panel_style(), Rect2(34, 177, 365, 430))
	draw_style_box(_panel_style(), Rect2(457, 177, 365, 430))
	draw_style_box(_panel_style(), Rect2(880, 177, 365, 430))
	var direction := DIRECTIONS[maxi(0, active_direction_index)]
	_draw_direction_arrow(Vector2(640, 203), direction, 42.0)
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
	draw_line(start, finish, color, 3.0, true)
	var perpendicular := Vector2(-vector.y, vector.x)
	draw_colored_polygon(PackedVector2Array([
		finish,
		finish - vector * 10.0 + perpendicular * 6.0,
		finish - vector * 10.0 - perpendicular * 6.0,
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


func _add_label(text_value: String, position_value: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	add_child(label)
	return label
