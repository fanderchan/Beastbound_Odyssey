extends Node2D

const GROUP_META := &"world_depth_group"
const STABLE_ID_META := &"world_depth_stable_id"
const DEPTH_Y_META := &"world_depth_y"
const TIE_PRIORITY_META := &"world_depth_tie_priority"
const ACTOR_META := &"world_depth_actor"
const ACTOR_FOOT_OFFSET_META := &"world_depth_actor_foot_offset"

const KIND_MAP_OBJECT := "map_object"
const KIND_NPC := "npc"
const KIND_NPC_PLACEHOLDER := "npc_placeholder"
const KIND_REMOTE_ACTOR := "remote_actor"
const KIND_GATE := "gate"
const KIND_RECORD_POINT := "record_point"
const KIND_SIGN := "sign"
const KIND_GROUND_PET_DROP := "ground_pet_drop"
const VALID_KINDS: Array[String] = [
	KIND_MAP_OBJECT,
	KIND_NPC,
	KIND_NPC_PLACEHOLDER,
	KIND_REMOTE_ACTOR,
	KIND_GATE,
	KIND_RECORD_POINT,
	KIND_SIGN,
	KIND_GROUND_PET_DROP,
]

const ACTOR_TIE_PRIORITY := 10
const OBJECT_TIE_PRIORITY := 20
const LATE_DEPTH_PROCESS_PRIORITY := 100

var _group_nodes: Dictionary = {}
var _registered_actors: Dictionary = {}
var _order_dirty: bool = true
var _last_actor_depth_signature: String = ""
var _last_order_signature: String = ""


func _ready() -> void:
	process_priority = LATE_DEPTH_PROCESS_PRIORITY


func _process(_delta: float) -> void:
	if visible:
		refresh_depth_order()


func register_actor(stable_id: String, actor: Node2D, foot_offset_y: float = 0.0) -> bool:
	var normalized_id := stable_id.strip_edges()
	if normalized_id == "" or actor == null:
		return false
	if actor.get_parent() != self:
		actor.reparent(self, true)
	actor.set_meta(STABLE_ID_META, normalized_id)
	actor.set_meta(ACTOR_META, true)
	actor.set_meta(ACTOR_FOOT_OFFSET_META, foot_offset_y)
	actor.set_meta(TIE_PRIORITY_META, ACTOR_TIE_PRIORITY)
	_registered_actors[normalized_id] = actor
	_order_dirty = true
	return true


func replace_group(group_id: String, commands: Array[Dictionary]) -> int:
	var normalized_group := group_id.strip_edges()
	if normalized_group == "":
		return 0
	_clear_group(normalized_group)
	var sorted_commands := commands.duplicate(false)
	sorted_commands.sort_custom(_command_less)
	var nodes: Array[Node2D] = []
	for command in sorted_commands:
		var visual := _build_visual(command, normalized_group)
		if visual == null:
			continue
		add_child(visual)
		nodes.append(visual)
	_group_nodes[normalized_group] = nodes
	_order_dirty = true
	refresh_depth_order(true)
	return nodes.size()


func clear_group(group_id: String) -> void:
	var normalized_group := group_id.strip_edges()
	if normalized_group == "":
		return
	_clear_group(normalized_group)
	_order_dirty = true
	refresh_depth_order(true)


func refresh_depth_order(force: bool = false) -> bool:
	_prune_invalid_actors()
	var actor_signature := _actor_depth_signature()
	if not force and not _order_dirty and actor_signature == _last_actor_depth_signature:
		return false
	var entries: Array[Dictionary] = []
	for child in get_children():
		if not (child is Node2D):
			continue
		var node := child as Node2D
		var stable_id := str(node.get_meta(STABLE_ID_META, "")).strip_edges()
		if stable_id == "":
			continue
		var depth_y := float(node.get_meta(DEPTH_Y_META, node.global_position.y))
		if bool(node.get_meta(ACTOR_META, false)):
			depth_y = node.global_position.y + _actor_foot_offset(node)
		entries.append({
			"node": node,
			"stableId": stable_id,
			"depthY": depth_y,
			"tiePriority": int(node.get_meta(TIE_PRIORITY_META, ACTOR_TIE_PRIORITY)),
		})
	entries.sort_custom(_depth_entry_less)
	var order_ids: Array[String] = []
	for index in range(entries.size()):
		var entry := entries[index] as Dictionary
		var node := entry.get("node") as Node2D
		if node != null and node.get_parent() == self:
			if node.get_index() != index:
				move_child(node, index)
			order_ids.append(str(entry.get("stableId", "")))
	var next_order_signature := "|".join(order_ids)
	var changed := next_order_signature != _last_order_signature
	_last_order_signature = next_order_signature
	_last_actor_depth_signature = actor_signature
	_order_dirty = false
	return changed


func group_count(group_id: String) -> int:
	var values: Variant = _group_nodes.get(group_id, [])
	if not (values is Array):
		return 0
	var count := 0
	for value in values as Array:
		if value is Node2D and is_instance_valid(value):
			count += 1
	return count


func has_depth_member(stable_id: String) -> bool:
	var expected := stable_id.strip_edges()
	if expected == "":
		return false
	for child in get_children():
		if child is Node2D and str((child as Node2D).get_meta(STABLE_ID_META, "")) == expected:
			return true
	return false


func registered_actor_foot_offset(stable_id: String) -> float:
	var actor_value: Variant = _registered_actors.get(stable_id.strip_edges())
	if not (actor_value is Node2D) or not is_instance_valid(actor_value):
		return NAN
	return _actor_foot_offset(actor_value as Node2D)


func stable_ids_front_to_back(group_id: String = "") -> Array[String]:
	refresh_depth_order(true)
	var normalized_group := group_id.strip_edges()
	var result: Array[String] = []
	for index in range(get_child_count() - 1, -1, -1):
		var child := get_child(index)
		if not (child is Node2D):
			continue
		var node := child as Node2D
		if normalized_group != "" and str(node.get_meta(GROUP_META, "")) != normalized_group:
			continue
		var stable_id := str(node.get_meta(STABLE_ID_META, "")).strip_edges()
		if stable_id != "":
			result.append(stable_id)
	return result


func debug_depth_snapshot() -> Array[Dictionary]:
	refresh_depth_order(true)
	var result: Array[Dictionary] = []
	for child in get_children():
		if not (child is Node2D):
			continue
		var node := child as Node2D
		var stable_id := str(node.get_meta(STABLE_ID_META, "")).strip_edges()
		if stable_id == "":
			continue
		var depth_y := float(node.get_meta(DEPTH_Y_META, node.global_position.y))
		if bool(node.get_meta(ACTOR_META, false)):
			depth_y = node.global_position.y + _actor_foot_offset(node)
		result.append({
			"stableId": stable_id,
			"depthY": depth_y,
			"footOffsetY": (
				_actor_foot_offset(node)
				if bool(node.get_meta(ACTOR_META, false))
				else 0.0
			),
			"tiePriority": int(node.get_meta(TIE_PRIORITY_META, ACTOR_TIE_PRIORITY)),
			"group": str(node.get_meta(GROUP_META, "")),
		})
	return result


static func debug_sorted_ids(entries: Array[Dictionary]) -> Array[String]:
	var copied := entries.duplicate(true)
	copied.sort_custom(_depth_entry_less)
	var result: Array[String] = []
	for entry in copied:
		result.append(str((entry as Dictionary).get("stableId", "")))
	return result


func _clear_group(group_id: String) -> void:
	var values: Variant = _group_nodes.get(group_id, [])
	if values is Array:
		for value in values as Array:
			if not (value is Node2D) or not is_instance_valid(value):
				continue
			var node := value as Node2D
			if node.get_parent() == self:
				remove_child(node)
			node.queue_free()
	_group_nodes.erase(group_id)


func _build_visual(command: Dictionary, group_id: String) -> Node2D:
	var stable_id := str(command.get("stableId", "")).strip_edges()
	var kind := str(command.get("kind", "")).strip_edges()
	var position_value: Variant = command.get("position")
	if stable_id == "" or not VALID_KINDS.has(kind) or not (position_value is Vector2):
		return null
	var root := Node2D.new()
	root.name = _safe_node_name(stable_id)
	root.position = position_value as Vector2
	root.set_meta(GROUP_META, group_id)
	root.set_meta(STABLE_ID_META, stable_id)
	root.set_meta(DEPTH_Y_META, float(command.get("depthY", root.position.y)))
	root.set_meta(TIE_PRIORITY_META, int(command.get(
		"tiePriority",
		OBJECT_TIE_PRIORITY if kind == KIND_MAP_OBJECT else ACTOR_TIE_PRIORITY
	)))
	match kind:
		KIND_MAP_OBJECT:
			_add_map_object(root, command)
		KIND_NPC:
			_add_npc(root, command)
		KIND_NPC_PLACEHOLDER:
			_add_npc_placeholder(root, command)
		KIND_REMOTE_ACTOR:
			_add_remote_actor(root, command)
		KIND_GATE:
			_add_gate(root, command)
		KIND_RECORD_POINT:
			_add_record_point(root, command)
		KIND_SIGN:
			_add_sign(root, command)
		KIND_GROUND_PET_DROP:
			_add_ground_pet_drop(root, command)
	if root.get_child_count() <= 0:
		root.queue_free()
		return null
	return root


func _add_map_object(root: Node2D, command: Dictionary) -> void:
	var texture: Variant = command.get("texture")
	var draw_rect: Variant = command.get("drawRect")
	if not (texture is Texture2D) or not (draw_rect is Rect2):
		return
	_add_texture_rect(root, texture as Texture2D, draw_rect as Rect2)


func _add_npc(root: Node2D, command: Dictionary) -> void:
	var texture: Variant = command.get("texture")
	var draw_rect: Variant = command.get("drawRect")
	var shadow_center: Variant = command.get("shadowCenter")
	var shadow_radius: Variant = command.get("shadowRadius")
	if (
		not (texture is Texture2D)
		or not (draw_rect is Rect2)
		or not (shadow_center is Vector2)
		or not (shadow_radius is Vector2)
	):
		return
	_add_ellipse(
		root,
		(shadow_center as Vector2) - root.position,
		shadow_radius as Vector2,
		Color(0.02, 0.03, 0.025, 0.34),
		28
	)
	_add_texture_rect(root, texture as Texture2D, draw_rect as Rect2)


func _add_npc_placeholder(root: Node2D, command: Dictionary) -> void:
	var marker: Variant = command.get("marker")
	if not (marker is Vector2):
		return
	var local_marker := marker as Vector2 - root.position
	var blocks_movement := bool(command.get("blocksMovement", true))
	var body_color := Color(0.74, 0.36, 0.25, 0.98) if blocks_movement else Color(0.22, 0.58, 0.66, 0.98)
	var trim_color := Color(0.99, 0.82, 0.45, 0.95) if blocks_movement else Color(0.58, 0.89, 0.78, 0.95)
	_add_ellipse(root, local_marker + Vector2(0, -9), Vector2(8, 8), Color(0.99, 0.76, 0.46, 0.98), 24)
	_add_rect(root, Rect2(local_marker + Vector2(-8, -1), Vector2(16, 20)), body_color)
	_add_line(root, PackedVector2Array([
		local_marker + Vector2(-13, 8),
		local_marker + Vector2(13, 8),
	]), trim_color, 3.0)


func _add_remote_actor(root: Node2D, command: Dictionary) -> void:
	var moving := bool(command.get("moving", false))
	var body_color := Color(0.20, 0.66, 0.72, 0.92) if not moving else Color(0.27, 0.76, 0.82, 0.96)
	_add_ellipse(root, Vector2(0, 23), Vector2(19, 19), Color(0.02, 0.04, 0.04, 0.32), 28)
	_add_rect(root, Rect2(Vector2(-15, -22), Vector2(30, 38)), body_color)
	_add_ellipse(root, Vector2(0, -35), Vector2(9, 9), Color(0.98, 0.75, 0.46, 0.96), 24)
	var facing_offset: Variant = command.get("facingOffset")
	if facing_offset is Vector2:
		_add_ellipse(
			root,
			(facing_offset as Vector2) * 18.0 + Vector2(0, -6),
			Vector2(4, 4),
			Color(1.0, 0.88, 0.38, 0.96),
			18
		)
	var label := str(command.get("label", "")).strip_edges()
	if label == "":
		return
	var label_width := clampf(float(label.length()) * 16.0 + 22.0, 56.0, 168.0)
	var label_rect := Rect2(Vector2(-label_width * 0.5, -66.0), Vector2(label_width, 22.0))
	_add_rect(root, label_rect, Color(0.04, 0.07, 0.06, 0.70))
	_add_label(
		root,
		label,
		label_rect,
		14,
		Color(0.94, 0.98, 0.90, 0.96),
		command.get("font")
	)


func _add_gate(root: Node2D, command: Dictionary) -> void:
	var marker_value: Variant = command.get("marker")
	if not (marker_value is Vector2):
		return
	var marker := marker_value as Vector2 - root.position
	_add_line(
		root,
		PackedVector2Array([marker + Vector2(-14, 14), marker + Vector2(-14, -10)]),
		Color(0.73, 0.54, 0.34, 0.95),
		5.0
	)
	_add_line(
		root,
		PackedVector2Array([marker + Vector2(14, 14), marker + Vector2(14, -10)]),
		Color(0.73, 0.54, 0.34, 0.95),
		5.0
	)
	_add_line(
		root,
		PackedVector2Array([marker + Vector2(-14, -10), marker + Vector2(14, -10)]),
		Color(0.90, 0.72, 0.43, 0.95),
		5.0
	)
	_add_ellipse(root, marker + Vector2(0, 4), Vector2(4, 4), Color(1.0, 0.86, 0.42, 0.95), 18)


func _add_record_point(root: Node2D, command: Dictionary) -> void:
	var marker_value: Variant = command.get("marker")
	if not (marker_value is Vector2):
		return
	var marker := marker_value as Vector2 - root.position
	_add_rect(root, Rect2(marker + Vector2(-7, -26), Vector2(14, 36)), Color(0.56, 0.62, 0.66, 0.98))
	_add_line(
		root,
		PackedVector2Array([marker + Vector2(-13, -18), marker + Vector2(13, -18)]),
		Color(0.95, 0.82, 0.46, 0.95),
		4.0
	)
	_add_ellipse(root, marker + Vector2(0, -31), Vector2(9, 9), Color(0.98, 0.78, 0.34, 0.98), 24)
	_add_line(
		root,
		_ellipse_points(marker + Vector2(0, -31), Vector2(13, 13), 24),
		Color(0.55, 0.79, 1.0, 0.76),
		2.0,
		true
	)


func _add_sign(root: Node2D, command: Dictionary) -> void:
	var marker_value: Variant = command.get("marker")
	if not (marker_value is Vector2):
		return
	var marker := marker_value as Vector2 - root.position
	var board_rect := Rect2(marker + Vector2(-26, -47), Vector2(52, 28))
	_add_line(
		root,
		PackedVector2Array([marker + Vector2(0, 16), marker + Vector2(0, -18)]),
		Color(0.42, 0.27, 0.14, 0.98),
		5.0
	)
	_add_rect(root, board_rect, Color(0.05, 0.04, 0.03, 0.55))
	_add_rect(root, board_rect.grow(-2.0), Color(0.58, 0.38, 0.18, 0.97))
	_add_line(
		root,
		PackedVector2Array([
			board_rect.position + Vector2(5, 8),
			board_rect.position + Vector2(47, 8),
		]),
		Color(0.82, 0.62, 0.30, 0.95),
		2.0
	)
	_add_line(
		root,
		PackedVector2Array([
			board_rect.position + Vector2(5, 20),
			board_rect.position + Vector2(47, 20),
		]),
		Color(0.32, 0.20, 0.10, 0.55),
		2.0
	)


func _add_ground_pet_drop(root: Node2D, command: Dictionary) -> void:
	var marker_value: Variant = command.get("marker")
	var body_color_value: Variant = command.get("bodyColor")
	if not (marker_value is Vector2) or not (body_color_value is Color):
		return
	var marker := marker_value as Vector2 - root.position
	var body_color := body_color_value as Color
	var trim_color := Color(1.0, 0.86, 0.42, 0.96)
	_add_ellipse(root, marker + Vector2(0, 22), Vector2(20, 20), Color(0.0, 0.0, 0.0, 0.22), 28)
	_add_ellipse(root, marker, Vector2(17, 17), body_color, 28)
	var ear := Polygon2D.new()
	ear.color = trim_color
	ear.polygon = PackedVector2Array([
		marker + Vector2(-10, -12),
		marker + Vector2(-2, -29),
		marker + Vector2(3, -12),
	])
	root.add_child(ear)
	_add_ellipse(root, marker + Vector2(-6, -3), Vector2(3, 3), Color(0.08, 0.10, 0.09, 0.95), 16)
	_add_line(
		root,
		PackedVector2Array([marker + Vector2(-11, 12), marker + Vector2(11, 12)]),
		trim_color,
		3.0
	)
	var name := str(command.get("name", "宠物"))
	var label_rect := Rect2(marker + Vector2(-48, -56), Vector2(96, 20))
	_add_label(
		root,
		name,
		Rect2(label_rect.position + Vector2(0, 1), label_rect.size),
		14,
		Color(0.07, 0.09, 0.08, 0.72),
		command.get("font")
	)
	_add_label(
		root,
		name,
		label_rect,
		14,
		Color(0.98, 0.92, 0.72, 0.96),
		command.get("font")
	)


func _add_texture_rect(root: Node2D, texture: Texture2D, world_rect: Rect2) -> void:
	if texture == null or world_rect.size.x <= 0.0 or world_rect.size.y <= 0.0:
		return
	var texture_size := texture.get_size()
	if texture_size.x <= 0.0 or texture_size.y <= 0.0:
		return
	var sprite := Sprite2D.new()
	sprite.centered = false
	sprite.texture = texture
	sprite.position = world_rect.position - root.position
	sprite.scale = Vector2(
		world_rect.size.x / texture_size.x,
		world_rect.size.y / texture_size.y
	)
	root.add_child(sprite)


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


func _add_label(
	root: Node2D,
	text: String,
	rect: Rect2,
	font_size: int,
	color: Color,
	font_value: Variant
) -> void:
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	if font_value is Font:
		label.add_theme_font_override("font", font_value as Font)
	root.add_child(label)


func _actor_depth_signature() -> String:
	var parts: Array[String] = []
	var actor_ids := _registered_actors.keys()
	actor_ids.sort()
	for id_value in actor_ids:
		var stable_id := str(id_value)
		var actor_value: Variant = _registered_actors.get(stable_id)
		if not (actor_value is Node2D) or not is_instance_valid(actor_value):
			continue
		var actor := actor_value as Node2D
		var depth_y := actor.global_position.y + _actor_foot_offset(actor)
		parts.append("%s:%.3f:%s" % [stable_id, depth_y, str(actor.visible)])
	return "|".join(parts)


static func _actor_foot_offset(actor: Node2D) -> float:
	if actor != null and actor.has_method("get_world_depth_foot_offset_y"):
		return float(actor.call("get_world_depth_foot_offset_y"))
	return float(actor.get_meta(ACTOR_FOOT_OFFSET_META, 0.0)) if actor != null else 0.0


func _prune_invalid_actors() -> void:
	var stale_ids: Array[String] = []
	for id_value in _registered_actors.keys():
		var stable_id := str(id_value)
		var actor_value: Variant = _registered_actors.get(stable_id)
		if not (actor_value is Node2D) or not is_instance_valid(actor_value):
			stale_ids.append(stable_id)
	for stable_id in stale_ids:
		_registered_actors.erase(stable_id)
		_order_dirty = true


static func _command_less(a: Dictionary, b: Dictionary) -> bool:
	return str(a.get("stableId", "")) < str(b.get("stableId", ""))


static func _depth_entry_less(a: Dictionary, b: Dictionary) -> bool:
	var depth_a := float(a.get("depthY", 0.0))
	var depth_b := float(b.get("depthY", 0.0))
	var depth_a_is_nan := is_nan(depth_a)
	var depth_b_is_nan := is_nan(depth_b)
	# A pairwise epsilon tie is not transitive (A ~= B, B ~= C, A < C),
	# which makes Array.sort_custom receive an invalid comparator. Keep the
	# documented depthY/tiePriority/stableId contract lexicographic instead.
	# Invalid NaN depths sort after numeric depths and then use the same stable
	# tie-breakers, so malformed debug input cannot make ordering nondeterministic.
	if depth_a_is_nan != depth_b_is_nan:
		return not depth_a_is_nan
	if not depth_a_is_nan and depth_a != depth_b:
		return depth_a < depth_b
	var priority_a := int(a.get("tiePriority", ACTOR_TIE_PRIORITY))
	var priority_b := int(b.get("tiePriority", ACTOR_TIE_PRIORITY))
	if priority_a != priority_b:
		return priority_a < priority_b
	return str(a.get("stableId", "")) < str(b.get("stableId", ""))


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


static func _safe_node_name(stable_id: String) -> String:
	var result := stable_id
	for character in [":", "/", "\\", ".", " ", "@"]:
		result = result.replace(character, "_")
	return "Depth_%s" % result
