extends RefCounted
class_name WorldCameraSafeAreaModel

const DEFAULT_OUTER_MARGIN_PX := 8.0
# Keep the full 34 px world-interaction hit radius clear of a blocking HUD root.
const DEFAULT_BLOCKER_MARGIN_PX := 36.0
const DEFAULT_EDGE_SNAP_PX := 96.0
const DEFAULT_INTERACTION_CLEARANCE_PX := 112.0


static func safe_viewport_rect(
	viewport_size: Vector2,
	blocker_rects: Array[Rect2],
	outer_margin_px: float = DEFAULT_OUTER_MARGIN_PX,
	blocker_margin_px: float = DEFAULT_BLOCKER_MARGIN_PX,
	edge_snap_px: float = DEFAULT_EDGE_SNAP_PX
) -> Rect2:
	var safe_size := Vector2(maxf(1.0, viewport_size.x), maxf(1.0, viewport_size.y))
	var viewport_rect := Rect2(Vector2.ZERO, safe_size)
	var outer_margin := maxf(0.0, outer_margin_px)
	var left := minf(outer_margin, safe_size.x * 0.5)
	var top := minf(outer_margin, safe_size.y * 0.5)
	var right := maxf(left + 1.0, safe_size.x - outer_margin)
	var bottom := maxf(top + 1.0, safe_size.y - outer_margin)
	var center := viewport_rect.get_center()
	var blocker_margin := maxf(0.0, blocker_margin_px)
	var edge_snap := maxf(0.0, edge_snap_px)

	for blocker_rect in blocker_rects:
		if blocker_rect.size.x <= 0.0 or blocker_rect.size.y <= 0.0:
			continue
		var clipped := blocker_rect.intersection(viewport_rect)
		if clipped.size.x <= 0.0 or clipped.size.y <= 0.0:
			continue
		var clipped_end := clipped.end
		var covers_center_x := clipped.position.x <= center.x and clipped_end.x >= center.x
		var covers_center_y := clipped.position.y <= center.y and clipped_end.y >= center.y
		if covers_center_x:
			if clipped_end.y <= center.y and clipped.position.y <= edge_snap:
				top = maxf(top, clipped_end.y + blocker_margin)
			elif (
				clipped.position.y >= center.y
				and viewport_rect.end.y - clipped_end.y <= edge_snap
			):
				bottom = minf(bottom, clipped.position.y - blocker_margin)
		if covers_center_y:
			if clipped_end.x <= center.x and clipped.position.x <= edge_snap:
				left = maxf(left, clipped_end.x + blocker_margin)
			elif (
				clipped.position.x >= center.x
				and viewport_rect.end.x - clipped_end.x <= edge_snap
			):
				right = minf(right, clipped.position.x - blocker_margin)

	if right <= left or bottom <= top:
		return Rect2(Vector2(outer_margin, outer_margin), Vector2(
			maxf(1.0, safe_size.x - outer_margin * 2.0),
			maxf(1.0, safe_size.y - outer_margin * 2.0)
		))
	return Rect2(Vector2(left, top), Vector2(right - left, bottom - top))


static func player_anchor(
	viewport_size: Vector2,
	safe_rect: Rect2,
	interaction_clearance_px: float = DEFAULT_INTERACTION_CLEARANCE_PX
) -> Vector2:
	var viewport_center := Vector2(
		maxf(1.0, viewport_size.x) * 0.5,
		maxf(1.0, viewport_size.y) * 0.5
	)
	if safe_rect.size.x <= 0.0 or safe_rect.size.y <= 0.0:
		return viewport_center
	var clearance := maxf(0.0, interaction_clearance_px)
	var clearance_x := minf(clearance, maxf(0.0, safe_rect.size.x * 0.5 - 1.0))
	var clearance_y := minf(clearance, maxf(0.0, safe_rect.size.y * 0.5 - 1.0))
	var min_anchor := safe_rect.position + Vector2(clearance_x, clearance_y)
	var max_anchor := safe_rect.end - Vector2(clearance_x, clearance_y)
	return Vector2(
		clampf(viewport_center.x, min_anchor.x, max_anchor.x),
		clampf(viewport_center.y, min_anchor.y, max_anchor.y)
	)


static func camera_center_for_anchor(
	world_target: Vector2,
	viewport_size: Vector2,
	camera_zoom: Vector2,
	screen_anchor: Vector2
) -> Vector2:
	var zoom := _safe_zoom(camera_zoom)
	var viewport_center := Vector2(
		maxf(1.0, viewport_size.x) * 0.5,
		maxf(1.0, viewport_size.y) * 0.5
	)
	return world_target + Vector2(
		(viewport_center.x - screen_anchor.x) * zoom.x,
		(viewport_center.y - screen_anchor.y) * zoom.y
	)


static func camera_limit_bounds(
	world_bounds: Rect2,
	viewport_size: Vector2,
	camera_zoom: Vector2,
	safe_rect: Rect2
) -> Rect2:
	var safe_size := Vector2(maxf(1.0, viewport_size.x), maxf(1.0, viewport_size.y))
	var zoom := _safe_zoom(camera_zoom)
	var safe_start := Vector2(
		clampf(safe_rect.position.x, 0.0, safe_size.x),
		clampf(safe_rect.position.y, 0.0, safe_size.y)
	)
	var safe_end := Vector2(
		clampf(safe_rect.end.x, safe_start.x, safe_size.x),
		clampf(safe_rect.end.y, safe_start.y, safe_size.y)
	)
	var before := Vector2(safe_start.x * zoom.x, safe_start.y * zoom.y)
	var after := Vector2(
		(safe_size.x - safe_end.x) * zoom.x,
		(safe_size.y - safe_end.y) * zoom.y
	)
	return Rect2(
		world_bounds.position - before,
		world_bounds.size + before + after
	)


static func clamp_camera_center(
	desired_center: Vector2,
	limit_bounds: Rect2,
	viewport_size: Vector2,
	camera_zoom: Vector2
) -> Vector2:
	var zoom := _safe_zoom(camera_zoom)
	var half_view := Vector2(
		maxf(1.0, viewport_size.x) * 0.5 * zoom.x,
		maxf(1.0, viewport_size.y) * 0.5 * zoom.y
	)
	var min_center := limit_bounds.position + half_view
	var max_center := limit_bounds.end - half_view
	var result := desired_center
	if min_center.x <= max_center.x:
		result.x = clampf(desired_center.x, min_center.x, max_center.x)
	else:
		result.x = limit_bounds.get_center().x
	if min_center.y <= max_center.y:
		result.y = clampf(desired_center.y, min_center.y, max_center.y)
	else:
		result.y = limit_bounds.get_center().y
	return result


static func world_to_screen(
	world_point: Vector2,
	camera_center: Vector2,
	viewport_size: Vector2,
	camera_zoom: Vector2
) -> Vector2:
	var zoom := _safe_zoom(camera_zoom)
	return Vector2(maxf(1.0, viewport_size.x), maxf(1.0, viewport_size.y)) * 0.5 + Vector2(
		(world_point.x - camera_center.x) / zoom.x,
		(world_point.y - camera_center.y) / zoom.y
	)


static func screen_to_world(
	screen_point: Vector2,
	camera_center: Vector2,
	viewport_size: Vector2,
	camera_zoom: Vector2
) -> Vector2:
	var zoom := _safe_zoom(camera_zoom)
	var offset := screen_point - Vector2(
		maxf(1.0, viewport_size.x) * 0.5,
		maxf(1.0, viewport_size.y) * 0.5
	)
	return camera_center + Vector2(offset.x * zoom.x, offset.y * zoom.y)


static func _safe_zoom(camera_zoom: Vector2) -> Vector2:
	return Vector2(
		maxf(0.001, absf(camera_zoom.x)),
		maxf(0.001, absf(camera_zoom.y))
	)
