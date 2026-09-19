extends RefCounted

const Renderer := preload("res://scripts/world/map_visual_renderer.gd")


static func build(prepared: Dictionary) -> ArrayMesh:
	if not Renderer.has_prepared_visual(prepared):
		return null
	var atlas := prepared.get("atlasTexture") as Texture2D
	if atlas is AtlasTexture:
		return null
	var texture_size := atlas.get_size()
	if texture_size.x <= 0.0 or texture_size.y <= 0.0:
		return null
	var groups: Array = [prepared.get("edgeGroundDraws", [])]
	if str(prepared.get("groundRenderMode", "")) == Renderer.GROUND_RENDER_MODE_LAYERED:
		groups.append(prepared.get("baseGroundDraws", []))
		groups.append(prepared.get("overlayGroundDraws", []))
	else:
		groups.append(prepared.get("groundDraws", []))
	var vertices := PackedVector2Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var atlas_rect := Rect2(Vector2.ZERO, texture_size)
	for values in groups:
		if not values is Array:
			continue
		for value in values:
			if not value is Dictionary or not value.get("destination") is Rect2 or not value.get("source") is Rect2:
				continue
			var destination: Rect2 = value.destination
			var source: Rect2 = value.source
			# Canonical terrain uses positive, in-atlas regions. Other rectangles
			# retain draw_texture_rect_region's clipping/flip semantics via fallback.
			if not _positive_finite_rect(destination) or not _positive_finite_rect(source) or not atlas_rect.encloses(source):
				return null
			var first := vertices.size()
			vertices.append_array(PackedVector2Array([
				destination.position, Vector2(destination.end.x, destination.position.y),
				destination.end, Vector2(destination.position.x, destination.end.y),
			]))
			uvs.append_array(PackedVector2Array([
				source.position / texture_size, Vector2(source.end.x, source.position.y) / texture_size,
				source.end / texture_size, Vector2(source.position.x, source.end.y) / texture_size,
			]))
			# Keep the original edge/base/overlay and within-layer drawing order.
			indices.append_array(PackedInt32Array([first, first + 1, first + 2, first, first + 2, first + 3]))
	if vertices.is_empty():
		return null
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, Mesh.ARRAY_FLAG_USE_2D_VERTICES)
	return mesh


static func _positive_finite_rect(rect: Rect2) -> bool:
	return rect.position.is_finite() and rect.size.is_finite() and rect.end.is_finite() and rect.size.x > 0.0 and rect.size.y > 0.0
