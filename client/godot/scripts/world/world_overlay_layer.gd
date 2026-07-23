extends Node2D

const KIND_TARGET := "target"
const KIND_SELECTION := "selection"
const KIND_NPC_QUEST := "npc_quest"
const KIND_FACILITY := "facility"
const KIND_TEXTURE := "texture"
const VALID_KINDS: Array[String] = [
	KIND_TARGET,
	KIND_SELECTION,
	KIND_NPC_QUEST,
	KIND_FACILITY,
	KIND_TEXTURE,
]

var _last_signature: String = ""
var _command_kinds: Dictionary = {}
var _target_node: Node2D
var _replace_count: int = 0


func replace_commands(commands: Array[Dictionary], signature: String, force: bool = false) -> int:
	if not force and signature == _last_signature:
		return get_child_count()
	_target_node = null
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_command_kinds.clear()
	var sorted_commands := commands.duplicate(false)
	sorted_commands.sort_custom(_command_less)
	for command in sorted_commands:
		var node := _build_command(command)
		if node == null:
			continue
		add_child(node)
		var kind := str(command.get("kind", ""))
		_command_kinds[kind] = int(_command_kinds.get(kind, 0)) + 1
		if kind == KIND_TARGET:
			_target_node = node
	_last_signature = signature
	_replace_count += 1
	return get_child_count()


func set_target_marker(enabled: bool, target_position: Vector2) -> bool:
	if not enabled:
		if _target_node == null or not is_instance_valid(_target_node):
			_target_node = null
			return false
		if _target_node.get_parent() == self:
			remove_child(_target_node)
		_target_node.queue_free()
		_target_node = null
		_command_kinds.erase(KIND_TARGET)
		return true
	if _target_node == null or not is_instance_valid(_target_node):
		_target_node = _build_command({
			"stableId": "target:movement",
			"kind": KIND_TARGET,
			"position": target_position,
		})
		if _target_node == null:
			return false
		add_child(_target_node)
		_command_kinds[KIND_TARGET] = 1
		return true
	if _target_node.position.is_equal_approx(target_position):
		return false
	_target_node.position = target_position
	return true


func command_count(kind: String = "") -> int:
	if kind == "":
		return get_child_count()
	return int(_command_kinds.get(kind, 0))


func replace_count() -> int:
	return _replace_count


func target_marker_position() -> Vector2:
	if _target_node == null or not is_instance_valid(_target_node):
		return Vector2(INF, INF)
	return _target_node.position


func _build_command(command: Dictionary) -> Node2D:
	var stable_id := str(command.get("stableId", "")).strip_edges()
	var kind := str(command.get("kind", "")).strip_edges()
	var position_value: Variant = command.get("position")
	if stable_id == "" or not VALID_KINDS.has(kind) or not (position_value is Vector2):
		return null
	var root := Node2D.new()
	root.name = _safe_node_name(stable_id)
	root.position = position_value as Vector2
	match kind:
		KIND_TARGET:
			_add_target(root)
		KIND_SELECTION:
			_add_ring(root, 24.0, Color(1.0, 0.82, 0.25, 0.95), 3.0)
		KIND_NPC_QUEST:
			_add_quest_marker(root, command)
		KIND_FACILITY:
			_add_facility_label(root, command)
		KIND_TEXTURE:
			_add_texture(root, command)
	if root.get_child_count() <= 0:
		root.queue_free()
		return null
	return root


func _add_target(root: Node2D) -> void:
	var size := 22.0
	var color := Color(1.0, 0.74, 0.16, 0.95)
	_add_line(root, PackedVector2Array([
		Vector2(0, -size),
		Vector2(size, 0),
		Vector2(0, size),
		Vector2(-size, 0),
	]), color, 5.0, true)
	_add_ellipse(root, Vector2.ZERO, Vector2(5, 5), Color(1.0, 0.92, 0.38, 0.95), 20)


func _add_quest_marker(root: Node2D, command: Dictionary) -> void:
	var fill: Variant = command.get("fill")
	var border: Variant = command.get("border")
	var text_color: Variant = command.get("textColor")
	if not (fill is Color) or not (border is Color) or not (text_color is Color):
		return
	_add_ellipse(root, Vector2(1, 2), Vector2(12.5, 12.5), Color(0.03, 0.04, 0.03, 0.58), 28)
	_add_ellipse(root, Vector2.ZERO, Vector2(12, 12), fill as Color, 28)
	_add_ring(root, 13.0, border as Color, 2.2)
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text = str(command.get("glyph", "!"))
	label.position = Vector2(-11, -14)
	label.size = Vector2(22, 28)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 22)
	label.add_theme_color_override("font_color", text_color as Color)
	var font_value: Variant = command.get("font")
	if font_value is Font:
		label.add_theme_font_override("font", font_value as Font)
	root.add_child(label)


func _add_facility_label(root: Node2D, command: Dictionary) -> void:
	var text := str(command.get("text", "")).strip_edges()
	var fill: Variant = command.get("fill")
	var width := float(command.get("width", 0.0))
	if text == "" or not (fill is Color) or width <= 0.0:
		return
	var rect := Rect2(Vector2(-width * 0.5, -62.0), Vector2(width, 22.0))
	_add_rect(root, rect, Color(0.04, 0.07, 0.06, 0.72))
	_add_rect(root, rect.grow(-2.0), fill as Color)
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color(0.98, 0.96, 0.86, 0.98))
	var font_value: Variant = command.get("font")
	if font_value is Font:
		label.add_theme_font_override("font", font_value as Font)
	root.add_child(label)


func _add_texture(root: Node2D, command: Dictionary) -> void:
	var texture: Variant = command.get("texture")
	var draw_rect: Variant = command.get("drawRect")
	if not (texture is Texture2D) or not (draw_rect is Rect2):
		return
	var texture_size := (texture as Texture2D).get_size()
	if texture_size.x <= 0.0 or texture_size.y <= 0.0:
		return
	var sprite := Sprite2D.new()
	sprite.centered = false
	sprite.texture = texture as Texture2D
	sprite.position = (draw_rect as Rect2).position - root.position
	sprite.scale = Vector2(
		(draw_rect as Rect2).size.x / texture_size.x,
		(draw_rect as Rect2).size.y / texture_size.y
	)
	root.add_child(sprite)


func _add_ring(root: Node2D, radius: float, color: Color, width: float) -> void:
	_add_line(root, _ellipse_points(Vector2.ZERO, Vector2(radius, radius), 32), color, width, true)


func _add_rect(root: Node2D, rect: Rect2, color: Color) -> void:
	var polygon := Polygon2D.new()
	polygon.color = color
	polygon.polygon = PackedVector2Array([
		rect.position,
		rect.position + Vector2(rect.size.x, 0),
		rect.position + rect.size,
		rect.position + Vector2(0, rect.size.y),
	])
	root.add_child(polygon)


func _add_ellipse(
	root: Node2D,
	center: Vector2,
	radius: Vector2,
	color: Color,
	point_count: int
) -> void:
	var polygon := Polygon2D.new()
	polygon.color = color
	polygon.polygon = _ellipse_points(center, radius, point_count)
	root.add_child(polygon)


func _add_line(
	root: Node2D,
	points: PackedVector2Array,
	color: Color,
	width: float,
	closed: bool = false
) -> void:
	var line := Line2D.new()
	line.points = points
	line.default_color = color
	line.width = width
	line.closed = closed
	line.antialiased = true
	line.joint_mode = Line2D.LINE_JOINT_ROUND
	line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	line.end_cap_mode = Line2D.LINE_CAP_ROUND
	root.add_child(line)


static func _ellipse_points(
	center: Vector2,
	radius: Vector2,
	point_count: int
) -> PackedVector2Array:
	var points := PackedVector2Array()
	var count := maxi(8, point_count)
	for index in range(count):
		var angle := TAU * float(index) / float(count)
		points.append(center + Vector2(cos(angle) * radius.x, sin(angle) * radius.y))
	return points


static func _command_less(a: Dictionary, b: Dictionary) -> bool:
	return str(a.get("stableId", "")) < str(b.get("stableId", ""))


static func _safe_node_name(stable_id: String) -> String:
	var result := stable_id
	for character in [":", "/", "\\", ".", " ", "@"]:
		result = result.replace(character, "_")
	return "Overlay_%s" % result
