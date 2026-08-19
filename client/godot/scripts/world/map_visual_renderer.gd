extends RefCounted

const RENDER_LAYERS: Array[String] = ["ground_decal", "world", "foreground"]
const GROUND_RENDER_MODE_LAYERED := "layered_semantic_overlay"


static func has_prepared_visual(prepared: Dictionary) -> bool:
	return (
		bool(prepared.get("active", false))
		and prepared.get("atlasTexture") is Texture2D
		and prepared.get("groundDraws", []) is Array
	)


static func draw_ground(canvas: CanvasItem, prepared: Dictionary) -> int:
	if canvas == null or not has_prepared_visual(prepared):
		return 0
	var atlas := prepared.get("atlasTexture") as Texture2D
	_draw_ground_commands(
		canvas,
		atlas,
		prepared.get("edgeGroundDraws", [])
	)
	if str(prepared.get("groundRenderMode", "")) == GROUND_RENDER_MODE_LAYERED:
		var base_count := _draw_ground_commands(
			canvas,
			atlas,
			prepared.get("baseGroundDraws", [])
		)
		var overlay_count := _draw_ground_commands(
			canvas,
			atlas,
			prepared.get("overlayGroundDraws", [])
		)
		return base_count + overlay_count
	return _draw_ground_commands(
		canvas,
		atlas,
		prepared.get("groundDraws", [])
	)


static func _draw_ground_commands(
	canvas: CanvasItem,
	atlas: Texture2D,
	values: Variant
) -> int:
	if canvas == null or atlas == null or not (values is Array):
		return 0
	var count := 0
	for value in values as Array:
		if not (value is Dictionary):
			continue
		var command := value as Dictionary
		var destination: Variant = command.get("destination")
		var source: Variant = command.get("source")
		if not (destination is Rect2) or not (source is Rect2):
			continue
		canvas.draw_texture_rect_region(atlas, destination as Rect2, source as Rect2)
		count += 1
	return count


static func draw_objects(
	canvas: CanvasItem,
	prepared: Dictionary,
	render_layer: String = "world"
) -> int:
	if canvas == null or not bool(prepared.get("active", false)) or not RENDER_LAYERS.has(render_layer):
		return 0
	var by_layer := prepared.get("objectDrawsByLayer", {}) as Dictionary
	var commands: Variant = by_layer.get(render_layer, [])
	if not (commands is Array):
		return 0
	var count := 0
	for value in commands as Array:
		if not (value is Dictionary):
			continue
		var command := value as Dictionary
		var texture: Variant = command.get("texture")
		var draw_rect: Variant = command.get("drawRect")
		if not (texture is Texture2D) or not (draw_rect is Rect2):
			continue
		canvas.draw_texture_rect(texture as Texture2D, draw_rect as Rect2, false)
		count += 1
	return count


static func world_depth_commands(prepared: Dictionary) -> Array[Dictionary]:
	if not bool(prepared.get("active", false)):
		return []
	var commands: Array[Dictionary] = []
	var by_layer := prepared.get("objectDrawsByLayer", {}) as Dictionary
	var values: Variant = by_layer.get("world", [])
	if not (values is Array):
		return commands
	for value in values as Array:
		if not (value is Dictionary):
			continue
		var command := value as Dictionary
		var instance_id := str(command.get("instanceId", "")).strip_edges()
		var texture: Variant = command.get("texture")
		var draw_rect: Variant = command.get("drawRect")
		var contact_point: Variant = command.get("contactPoint")
		if (
			instance_id == ""
			or not (texture is Texture2D)
			or not (draw_rect is Rect2)
			or not (contact_point is Vector2)
		):
			continue
		commands.append({
			"stableId": "object:%s" % instance_id,
			"kind": "map_object",
			"position": contact_point as Vector2,
			"depthY": float(command.get("sortKey", (contact_point as Vector2).y)),
			"tiePriority": 20,
			"texture": texture,
			"drawRect": draw_rect,
			"collisionRole": str(command.get("collisionRole", "")),
			"interactionLink": command.get("interactionLink"),
		})
	return commands


static func world_interaction_link_lookup(prepared: Dictionary) -> Dictionary:
	var lookup: Dictionary = {}
	for command in world_depth_commands(prepared):
		if str(command.get("collisionRole", "")) != "interaction":
			continue
		var interaction_id := str(command.get("interactionLink", "")).strip_edges()
		if interaction_id == "":
			continue
		lookup[interaction_id] = str(command.get("stableId", ""))
	return lookup


static func foreground_overlay_commands(prepared: Dictionary) -> Array[Dictionary]:
	if not bool(prepared.get("active", false)):
		return []
	var commands: Array[Dictionary] = []
	var by_layer := prepared.get("objectDrawsByLayer", {}) as Dictionary
	var values: Variant = by_layer.get("foreground", [])
	if not (values is Array):
		return commands
	for value in values as Array:
		if not (value is Dictionary):
			continue
		var command := value as Dictionary
		var instance_id := str(command.get("instanceId", "")).strip_edges()
		var texture: Variant = command.get("texture")
		var draw_rect: Variant = command.get("drawRect")
		var contact_point: Variant = command.get("contactPoint")
		if (
			instance_id == ""
			or not (texture is Texture2D)
			or not (draw_rect is Rect2)
			or not (contact_point is Vector2)
		):
			continue
		commands.append({
			"stableId": "foreground:%s" % instance_id,
			"kind": "texture",
			"position": contact_point as Vector2,
			"texture": texture,
			"drawRect": draw_rect,
		})
	return commands


static func ground_draw_count(prepared: Dictionary) -> int:
	if not has_prepared_visual(prepared):
		return 0
	return (prepared.get("groundDraws", []) as Array).size()


static func edge_ground_draw_count(prepared: Dictionary) -> int:
	if not has_prepared_visual(prepared):
		return 0
	var values: Variant = prepared.get("edgeGroundDraws", [])
	return (values as Array).size() if values is Array else 0


static func base_ground_draw_count(prepared: Dictionary) -> int:
	if not has_prepared_visual(prepared):
		return 0
	var values: Variant = prepared.get("baseGroundDraws", [])
	return (values as Array).size() if values is Array else 0


static func overlay_ground_draw_count(prepared: Dictionary) -> int:
	if not has_prepared_visual(prepared):
		return 0
	var values: Variant = prepared.get("overlayGroundDraws", [])
	return (values as Array).size() if values is Array else 0


static func object_draw_count(prepared: Dictionary, render_layer: String = "") -> int:
	if not bool(prepared.get("active", false)):
		return 0
	var by_layer := prepared.get("objectDrawsByLayer", {}) as Dictionary
	if render_layer != "":
		if not RENDER_LAYERS.has(render_layer):
			return 0
		return (by_layer.get(render_layer, []) as Array).size()
	var count := 0
	for layer in RENDER_LAYERS:
		count += (by_layer.get(layer, []) as Array).size()
	return count
