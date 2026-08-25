extends RefCounted
class_name WorldCameraSafeAreaModel

const DEFAULT_OUTER_MARGIN_PX := 8.0
# Keep the full 34 px world-interaction hit radius clear of a blocking HUD root.
const DEFAULT_BLOCKER_MARGIN_PX := 36.0
const DEFAULT_EDGE_SNAP_PX := 96.0
const DEFAULT_INTERACTION_CLEARANCE_PX := 112.0
const DEFAULT_VISUAL_GAP_PX := 12.0


static func nearby_composition_subject_rects(
	subject_rects_at_base: Array[Rect2],
	viewport_rect: Rect2,
	lookahead_px: float = DEFAULT_VISUAL_GAP_PX
) -> Array[Rect2]:
	var nearby: Array[Rect2] = []
	if viewport_rect.size.x <= 0.0 or viewport_rect.size.y <= 0.0:
		return nearby
	var interest_rect := viewport_rect.grow(maxf(0.0, lookahead_px))
	for subject in subject_rects_at_base:
		if subject.size.x <= 0.0 or subject.size.y <= 0.0:
			continue
		if interest_rect.intersects(subject):
			nearby.append(subject)
	return nearby


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


static func horizontal_anchor_avoiding_rects(
	base_anchor_x: float,
	safe_rect: Rect2,
	blocking_hud_rect: Rect2,
	subject_rects_at_base: Array[Rect2],
	interaction_clearance_px: float = DEFAULT_INTERACTION_CLEARANCE_PX,
	visual_gap_px: float = 12.0
) -> float:
	if (
		safe_rect.size.x <= 0.0
		or blocking_hud_rect.size.x <= 0.0
		or blocking_hud_rect.size.y <= 0.0
	):
		return base_anchor_x
	var clearance := maxf(0.0, interaction_clearance_px)
	var clearance_x := minf(clearance, maxf(0.0, safe_rect.size.x * 0.5 - 1.0))
	var min_anchor_x := safe_rect.position.x + clearance_x
	var max_anchor_x := safe_rect.end.x - clearance_x
	var clamped_base := clampf(base_anchor_x, min_anchor_x, max_anchor_x)
	var gap := maxf(0.0, visual_gap_px)
	var blocked := blocking_hud_rect.grow(gap)
	var candidates: Array[float] = [clamped_base, min_anchor_x, max_anchor_x]
	for rect in subject_rects_at_base:
		if rect.size.x <= 0.0 or rect.size.y <= 0.0:
			continue
		if rect.end.y <= blocked.position.y or rect.position.y >= blocked.end.y:
			continue
		candidates.append(clampf(
			clamped_base + blocked.position.x - rect.end.x,
			min_anchor_x,
			max_anchor_x
		))
		candidates.append(clampf(
			clamped_base + blocked.end.x - rect.position.x,
			min_anchor_x,
			max_anchor_x
		))

	var best_anchor := clamped_base
	var best_overlap_count := 1 << 30
	var best_overlap_area := INF
	var best_distance := INF
	for candidate in candidates:
		var shift := candidate - clamped_base
		var overlap_count := 0
		var overlap_area := 0.0
		for rect in subject_rects_at_base:
			var shifted := Rect2(rect.position + Vector2(shift, 0.0), rect.size)
			var overlap := shifted.intersection(blocked)
			if overlap.size.x <= 0.0 or overlap.size.y <= 0.0:
				continue
			overlap_count += 1
			overlap_area += overlap.size.x * overlap.size.y
		var distance := absf(candidate - clamped_base)
		if (
			overlap_count < best_overlap_count
			or (
				overlap_count == best_overlap_count
				and overlap_area < best_overlap_area - 0.01
			)
			or (
				overlap_count == best_overlap_count
				and absf(overlap_area - best_overlap_area) <= 0.01
				and distance < best_distance - 0.01
			)
		):
			best_anchor = candidate
			best_overlap_count = overlap_count
			best_overlap_area = overlap_area
			best_distance = distance
	return best_anchor


static func composition_anchor_avoiding_rects(
	base_anchor: Vector2,
	safe_rect: Rect2,
	blocking_hud_rects: Array[Rect2],
	subject_rects_at_base: Array[Rect2],
	viewport_rect: Rect2,
	interaction_clearance_px: float = DEFAULT_INTERACTION_CLEARANCE_PX,
	visual_gap_px: float = DEFAULT_VISUAL_GAP_PX
) -> Vector2:
	if safe_rect.size.x <= 0.0 or safe_rect.size.y <= 0.0:
		return base_anchor
	var clearance := maxf(0.0, interaction_clearance_px)
	var clearance_x := minf(clearance, maxf(0.0, safe_rect.size.x * 0.5 - 1.0))
	var clearance_y := minf(clearance, maxf(0.0, safe_rect.size.y * 0.5 - 1.0))
	var min_anchor := safe_rect.position + Vector2(clearance_x, clearance_y)
	var max_anchor := safe_rect.end - Vector2(clearance_x, clearance_y)
	return composition_anchor_avoiding_rects_in_range(
		base_anchor,
		min_anchor,
		max_anchor,
		blocking_hud_rects,
		subject_rects_at_base,
		viewport_rect,
		visual_gap_px
	)


static func composition_anchor_avoiding_rects_in_range(
	base_anchor: Vector2,
	min_anchor: Vector2,
	max_anchor: Vector2,
	blocking_hud_rects: Array[Rect2],
	subject_rects_at_base: Array[Rect2],
	viewport_rect: Rect2,
	visual_gap_px: float = DEFAULT_VISUAL_GAP_PX,
	priority_subject_count: int = 0,
	allow_bidirectional_blocker_escape: bool = false
) -> Vector2:
	if min_anchor.x > max_anchor.x or min_anchor.y > max_anchor.y:
		return base_anchor
	var clamped_base := Vector2(
		clampf(base_anchor.x, min_anchor.x, max_anchor.x),
		clampf(base_anchor.y, min_anchor.y, max_anchor.y)
	)
	if blocking_hud_rects.is_empty() or subject_rects_at_base.is_empty():
		return clamped_base

	var blocked_rects: Array[Rect2] = []
	var gap := maxf(0.0, visual_gap_px)
	for blocker in blocking_hud_rects:
		if blocker.size.x > 0.0 and blocker.size.y > 0.0:
			blocked_rects.append(blocker.grow(gap))
	if blocked_rects.is_empty():
		return clamped_base

	var composition_viewport := viewport_rect
	if composition_viewport.size.x > gap * 2.0 and composition_viewport.size.y > gap * 2.0:
		composition_viewport = composition_viewport.grow(-gap)
	var composition_min_anchor := min_anchor
	var composition_max_anchor := max_anchor
	var tall_left_blocker := false
	var tall_right_blocker := false
	var viewport_center := composition_viewport.get_center()
	for blocked in blocked_rects:
		if blocked.size.y <= blocked.size.x:
			continue
		if blocked.get_center().x < viewport_center.x:
			tall_left_blocker = true
		else:
			tall_right_blocker = true
	if tall_right_blocker and not tall_left_blocker:
		composition_max_anchor.x = minf(composition_max_anchor.x, clamped_base.x)
	elif tall_left_blocker and not tall_right_blocker:
		composition_min_anchor.x = maxf(composition_min_anchor.x, clamped_base.x)
	var x_candidates := _composition_axis_candidates(
		0,
		clamped_base,
		composition_min_anchor,
		composition_max_anchor,
		blocked_rects,
		subject_rects_at_base,
		composition_viewport,
		allow_bidirectional_blocker_escape
	)
	var y_candidates := _composition_axis_candidates(
		1,
		clamped_base,
		composition_min_anchor,
		composition_max_anchor,
		blocked_rects,
		subject_rects_at_base,
		composition_viewport,
		allow_bidirectional_blocker_escape
	)
	var best_anchor := clamped_base
	var best_score := _composition_score(
		best_anchor,
		clamped_base,
		blocked_rects,
		subject_rects_at_base,
		composition_viewport,
		priority_subject_count
	)
	# Candidate coordinates come only from a visible subject touching the inward
	# edge of a fixed HUD or viewport boundary. The resulting grid is small for
	# the formal 14-NPC scene, deterministic, and avoids coordinate-descent traps
	# where clearing the bottom bar can pull a right-edge NPC under the task HUD.
	for candidate_x in x_candidates:
		for candidate_y in y_candidates:
			var candidate_anchor := Vector2(candidate_x, candidate_y)
			var score := _composition_score(
				candidate_anchor,
				clamped_base,
				blocked_rects,
				subject_rects_at_base,
				composition_viewport,
				priority_subject_count
			)
			if _composition_score_is_better(score, best_score):
				best_anchor = candidate_anchor
				best_score = score
	return best_anchor


static func opaque_world_rect(
	command: Dictionary,
	opaque_rect_cache: Dictionary
) -> Rect2:
	var draw_rect_value: Variant = command.get("drawRect")
	var texture_value: Variant = command.get("texture")
	if not (draw_rect_value is Rect2) or not (texture_value is Texture2D):
		return Rect2()
	var draw_rect := draw_rect_value as Rect2
	var texture := texture_value as Texture2D
	var cache_key := texture.resource_path
	if cache_key == "":
		cache_key = str(texture.get_rid())
	var opaque_rect := Rect2i()
	if opaque_rect_cache.has(cache_key):
		opaque_rect = opaque_rect_cache.get(cache_key, Rect2i()) as Rect2i
	else:
		var image: Image = texture.get_image()
		if image != null and not image.is_empty():
			opaque_rect = image.get_used_rect()
		opaque_rect_cache[cache_key] = opaque_rect
	if opaque_rect.size.x <= 0 or opaque_rect.size.y <= 0:
		return draw_rect
	var texture_size := Vector2(texture.get_size())
	if texture_size.x <= 0.0 or texture_size.y <= 0.0:
		return draw_rect
	return Rect2(
		draw_rect.position + Vector2(
			float(opaque_rect.position.x) / texture_size.x * draw_rect.size.x,
			float(opaque_rect.position.y) / texture_size.y * draw_rect.size.y
		),
		Vector2(
			float(opaque_rect.size.x) / texture_size.x * draw_rect.size.x,
			float(opaque_rect.size.y) / texture_size.y * draw_rect.size.y
		)
	)


static func _composition_axis_candidates(
	axis: int,
	base_anchor: Vector2,
	min_anchor: Vector2,
	max_anchor: Vector2,
	blocked_rects: Array[Rect2],
	subject_rects_at_base: Array[Rect2],
	viewport_rect: Rect2,
	allow_bidirectional_blocker_escape: bool
) -> Array[float]:
	var min_value := min_anchor.x if axis == 0 else min_anchor.y
	var max_value := max_anchor.x if axis == 0 else max_anchor.y
	var base_value := base_anchor.x if axis == 0 else base_anchor.y
	var candidates: Array[float] = [base_value]
	var candidate_keys := {int(roundf(base_value * 100.0)): true}
	var viewport_center := viewport_rect.get_center()
	for rect in subject_rects_at_base:
		if rect.size.x <= 0.0 or rect.size.y <= 0.0:
			continue
		for blocked in blocked_rects:
			if axis == 1 and blocked.size.y > blocked.size.x:
				# Tall edge panels have a single honest escape direction: inward on X.
				# Moving the whole village above/below the task HUD hides services.
				continue
			var orthogonal_overlap := (
				rect.end.y > blocked.position.y
				and rect.position.y < blocked.end.y
			) if axis == 0 else (
				rect.end.x > blocked.position.x
				and rect.position.x < blocked.end.x
			)
			if not orthogonal_overlap:
				continue
			var candidate_offsets: Array[float] = []
			if axis == 0:
				candidate_offsets.append(blocked.position.x - rect.end.x)
				if allow_bidirectional_blocker_escape:
					candidate_offsets.append(blocked.end.x - rect.position.x)
				elif blocked.get_center().x < viewport_center.x:
					candidate_offsets[0] = blocked.end.x - rect.position.x
			else:
				candidate_offsets.append(blocked.position.y - rect.end.y)
				if allow_bidirectional_blocker_escape:
					candidate_offsets.append(blocked.end.y - rect.position.y)
				elif blocked.get_center().y < viewport_center.y:
					candidate_offsets[0] = blocked.end.y - rect.position.y
			for candidate_offset in candidate_offsets:
				_append_unique_candidate(
					candidates,
					candidate_keys,
					clampf(base_value + candidate_offset, min_value, max_value)
				)
		if viewport_rect.size.x <= 0.0 or viewport_rect.size.y <= 0.0:
			continue
		var visible := rect.intersection(viewport_rect)
		if visible.size.x <= 0.0 or visible.size.y <= 0.0 or viewport_rect.encloses(rect):
			continue
		if axis == 0:
			if rect.position.x < viewport_rect.position.x:
				_append_unique_candidate(
					candidates,
					candidate_keys,
					clampf(
						base_anchor.x + viewport_rect.position.x - rect.position.x,
						min_value,
						max_value
					)
				)
			if rect.end.x > viewport_rect.end.x:
				_append_unique_candidate(
					candidates,
					candidate_keys,
					clampf(
						base_anchor.x + viewport_rect.end.x - rect.end.x,
						min_value,
						max_value
					)
				)
		else:
			if rect.position.y < viewport_rect.position.y:
				_append_unique_candidate(
					candidates,
					candidate_keys,
					clampf(
						base_anchor.y + viewport_rect.position.y - rect.position.y,
						min_value,
						max_value
					)
				)
			if rect.end.y > viewport_rect.end.y:
				_append_unique_candidate(
					candidates,
					candidate_keys,
					clampf(
						base_anchor.y + viewport_rect.end.y - rect.end.y,
						min_value,
						max_value
					)
				)
	return candidates


static func _append_unique_candidate(
	candidates: Array[float],
	candidate_keys: Dictionary,
	value: float
) -> void:
	var key := int(roundf(value * 100.0))
	if candidate_keys.has(key):
		return
	candidate_keys[key] = true
	candidates.append(value)


static func _composition_score(
	anchor: Vector2,
	base_anchor: Vector2,
	blocked_rects: Array[Rect2],
	subject_rects_at_base: Array[Rect2],
	viewport_rect: Rect2,
	priority_subject_count: int = 0
) -> Array[float]:
	var shift := anchor - base_anchor
	var required_count := mini(maxi(0, priority_subject_count), subject_rects_at_base.size())
	var priority_overlap_count := 0.0
	var priority_overlap_area := 0.0
	var priority_hidden_count := 0.0
	var priority_clipped_count := 0.0
	var overlap_count := 0.0
	var overlap_area := 0.0
	var clipped_count := 0.0
	var visible_count := 0.0
	for subject_index in range(subject_rects_at_base.size()):
		var rect := subject_rects_at_base[subject_index]
		if rect.size.x <= 0.0 or rect.size.y <= 0.0:
			continue
		var shifted := Rect2(rect.position + shift, rect.size)
		for blocked in blocked_rects:
			var overlap := shifted.intersection(blocked)
			if overlap.size.x <= 0.0 or overlap.size.y <= 0.0:
				continue
			overlap_count += 1.0
			overlap_area += overlap.size.x * overlap.size.y
			if subject_index < required_count:
				priority_overlap_count += 1.0
				priority_overlap_area += overlap.size.x * overlap.size.y
		if viewport_rect.size.x <= 0.0 or viewport_rect.size.y <= 0.0:
			continue
		var visible := shifted.intersection(viewport_rect)
		if visible.size.x <= 0.0 or visible.size.y <= 0.0:
			if subject_index < required_count:
				priority_hidden_count += 1.0
			continue
		visible_count += 1.0
		if not viewport_rect.encloses(shifted):
			clipped_count += 1.0
			if subject_index < required_count:
				priority_clipped_count += 1.0
	return [
		priority_overlap_count,
		priority_overlap_area,
		priority_hidden_count,
		priority_clipped_count,
		overlap_count,
		overlap_area,
		clipped_count,
		-visible_count,
		anchor.distance_squared_to(base_anchor),
	]


static func _composition_score_is_better(
	candidate: Array[float],
	current: Array[float]
) -> bool:
	for index in range(mini(candidate.size(), current.size())):
		if candidate[index] < current[index] - 0.01:
			return true
		if candidate[index] > current[index] + 0.01:
			return false
	return false


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
		(viewport_center.x - screen_anchor.x) / zoom.x,
		(viewport_center.y - screen_anchor.y) / zoom.y
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
	var before := Vector2(safe_start.x / zoom.x, safe_start.y / zoom.y)
	var after := Vector2(
		(safe_size.x - safe_end.x) / zoom.x,
		(safe_size.y - safe_end.y) / zoom.y
	)
	return Rect2(
		world_bounds.position - before,
		world_bounds.size + before + after
	)


static func camera_limit_bounds_including_focus_points(
	limit_bounds: Rect2,
	focus_world_points: Array[Vector2],
	viewport_size: Vector2,
	camera_zoom: Vector2,
	screen_anchor: Vector2
) -> Rect2:
	if focus_world_points.is_empty():
		return limit_bounds
	var zoom := _safe_zoom(camera_zoom)
	var half_view := Vector2(
		maxf(1.0, viewport_size.x) * 0.5 / zoom.x,
		maxf(1.0, viewport_size.y) * 0.5 / zoom.y
	)
	var expanded := limit_bounds
	for focus_world_point in focus_world_points:
		if not is_finite(focus_world_point.x) or not is_finite(focus_world_point.y):
			continue
		var focus_center := camera_center_for_anchor(
			focus_world_point,
			viewport_size,
			zoom,
			screen_anchor
		)
		expanded = expanded.expand(focus_center - half_view)
		expanded = expanded.expand(focus_center + half_view)
	return expanded


static func clamp_camera_center(
	desired_center: Vector2,
	limit_bounds: Rect2,
	viewport_size: Vector2,
	camera_zoom: Vector2
) -> Vector2:
	var zoom := _safe_zoom(camera_zoom)
	var half_view := Vector2(
		maxf(1.0, viewport_size.x) * 0.5 / zoom.x,
		maxf(1.0, viewport_size.y) * 0.5 / zoom.y
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
		(world_point.x - camera_center.x) * zoom.x,
		(world_point.y - camera_center.y) * zoom.y
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
	return camera_center + Vector2(offset.x / zoom.x, offset.y / zoom.y)


static func _safe_zoom(camera_zoom: Vector2) -> Vector2:
	return Vector2(
		maxf(0.001, absf(camera_zoom.x)),
		maxf(0.001, absf(camera_zoom.y))
	)
