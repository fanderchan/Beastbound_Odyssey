extends RefCounted

const NEIGHBORS_8: Array[Vector2i] = [
	Vector2i(1, -1),
	Vector2i(-1, 1),
	Vector2i(1, 1),
	Vector2i(-1, -1),
	Vector2i(1, 0),
	Vector2i(0, 1),
	Vector2i(-1, 0),
	Vector2i(0, -1),
]
const MOVEMENT_COLLISION_BLOCK := "block"
const RUNTIME_BLOCKED_LOOKUP_KEY := "__blockedLookup"
const RUNTIME_INTERACTION_BLOCKED_LOOKUP_KEY := "__interactionBlockedLookup"
const RUNTIME_BLOCKED_CELL_LOOKUP_KEY := "__blockedCellLookup"
const RUNTIME_INTERACTION_BLOCKED_CELL_LOOKUP_KEY := "__interactionBlockedCellLookup"


static func load_map(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return with_runtime_cache(parsed as Dictionary)
	return {}


static func with_runtime_cache(map_data: Dictionary) -> Dictionary:
	map_data[RUNTIME_BLOCKED_LOOKUP_KEY] = _build_blocked_lookup(map_data)
	map_data[RUNTIME_INTERACTION_BLOCKED_LOOKUP_KEY] = _build_interaction_blocked_lookup(map_data)
	map_data[RUNTIME_BLOCKED_CELL_LOOKUP_KEY] = _build_blocked_cell_lookup(map_data)
	map_data[RUNTIME_INTERACTION_BLOCKED_CELL_LOOKUP_KEY] = _build_interaction_blocked_cell_lookup(map_data)
	return map_data


static func grid_size(map_data: Dictionary) -> Vector2i:
	var value: Array = map_data.get("gridSize", [0, 0])
	return Vector2i(int(value[0]), int(value[1]))


static func tile_size(map_data: Dictionary) -> Vector2:
	var value: Array = map_data.get("tileSize", [80, 40])
	return Vector2(float(value[0]), float(value[1]))


static func origin(map_data: Dictionary) -> Vector2:
	var value: Array = map_data.get("origin", [0, 0])
	return Vector2(float(value[0]), float(value[1]))


static func spawn_cell(map_data: Dictionary, spawn_name: String = "default") -> Vector2i:
	var points: Dictionary = map_data.get("spawnPoints", {})
	var value: Array = points.get(spawn_name, map_data.get("spawnCell", [0, 0]))
	return Vector2i(int(value[0]), int(value[1]))


static func blocked_lookup(map_data: Dictionary) -> Dictionary:
	if map_data.has(RUNTIME_BLOCKED_LOOKUP_KEY):
		return map_data.get(RUNTIME_BLOCKED_LOOKUP_KEY, {}) as Dictionary
	return _build_blocked_lookup(map_data)


static func _build_blocked_lookup(map_data: Dictionary) -> Dictionary:
	var lookup: Dictionary = {}
	var cells: Array = map_data.get("blockedCells", [])
	for cell_value in cells:
		var cell_array := cell_value as Array
		var cell := Vector2i(int(cell_array[0]), int(cell_array[1]))
		lookup[cell_key(cell)] = true
	return lookup


static func blocked_cell_lookup(map_data: Dictionary) -> Dictionary:
	if map_data.has(RUNTIME_BLOCKED_CELL_LOOKUP_KEY):
		return map_data.get(RUNTIME_BLOCKED_CELL_LOOKUP_KEY, {}) as Dictionary
	return _build_blocked_cell_lookup(map_data)


static func _build_blocked_cell_lookup(map_data: Dictionary) -> Dictionary:
	var lookup: Dictionary = {}
	var cells: Array = map_data.get("blockedCells", [])
	for cell_value in cells:
		var cell_array := cell_value as Array
		lookup[Vector2i(int(cell_array[0]), int(cell_array[1]))] = true
	return lookup


static func interaction_blocked_lookup(map_data: Dictionary) -> Dictionary:
	if map_data.has(RUNTIME_INTERACTION_BLOCKED_LOOKUP_KEY):
		return map_data.get(RUNTIME_INTERACTION_BLOCKED_LOOKUP_KEY, {}) as Dictionary
	return _build_interaction_blocked_lookup(map_data)


static func _build_interaction_blocked_lookup(map_data: Dictionary) -> Dictionary:
	var lookup: Dictionary = {}
	var points: Array = map_data.get("interactionPoints", [])
	for point_value in points:
		var item := point_value as Dictionary
		if not interaction_blocks_movement(item):
			continue
		var cell_value: Array = item.get("cell", [0, 0])
		var cell := Vector2i(int(cell_value[0]), int(cell_value[1]))
		lookup[cell_key(cell)] = true
	return lookup


static func interaction_blocked_cell_lookup(map_data: Dictionary) -> Dictionary:
	if map_data.has(RUNTIME_INTERACTION_BLOCKED_CELL_LOOKUP_KEY):
		return map_data.get(RUNTIME_INTERACTION_BLOCKED_CELL_LOOKUP_KEY, {}) as Dictionary
	return _build_interaction_blocked_cell_lookup(map_data)


static func _build_interaction_blocked_cell_lookup(map_data: Dictionary) -> Dictionary:
	var lookup: Dictionary = {}
	var points: Array = map_data.get("interactionPoints", [])
	for point_value in points:
		var item := point_value as Dictionary
		if not interaction_blocks_movement(item):
			continue
		var cell_value: Array = item.get("cell", [0, 0])
		lookup[Vector2i(int(cell_value[0]), int(cell_value[1]))] = true
	return lookup


static func interaction_blocks_movement(item: Dictionary) -> bool:
	if item.has("blocksMovement"):
		return bool(item.get("blocksMovement", false))
	var collision := str(item.get("movementCollision", "overlap")).to_lower()
	return collision == MOVEMENT_COLLISION_BLOCK


static func cell_key(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]


static func is_inside(map_data: Dictionary, cell: Vector2i) -> bool:
	return _is_inside_size(grid_size(map_data), cell)


static func is_walkable(map_data: Dictionary, cell: Vector2i) -> bool:
	return _is_walkable_cached(
		grid_size(map_data),
		blocked_cell_lookup(map_data),
		interaction_blocked_cell_lookup(map_data),
		cell
	)


static func _is_inside_size(size: Vector2i, cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < size.x and cell.y < size.y


static func _is_walkable_cached(
	size: Vector2i,
	blocked: Dictionary,
	interaction_blocked: Dictionary,
	cell: Vector2i
) -> bool:
	return (
		_is_inside_size(size, cell)
		and not blocked.has(cell)
		and not interaction_blocked.has(cell)
	)


static func grid_to_world(map_data: Dictionary, cell: Vector2i) -> Vector2:
	var tile := tile_size(map_data)
	var map_origin := origin(map_data)
	return map_origin + Vector2(
		float(cell.x - cell.y) * tile.x * 0.5,
		float(cell.x + cell.y) * tile.y * 0.5
	)


static func world_to_grid(map_data: Dictionary, point: Vector2) -> Vector2i:
	var tile := tile_size(map_data)
	var local := point - origin(map_data)
	var half_w := tile.x * 0.5
	var half_h := tile.y * 0.5
	var grid_x := (local.y / half_h + local.x / half_w) * 0.5
	var grid_y := (local.y / half_h - local.x / half_w) * 0.5
	return Vector2i(int(roundf(grid_x)), int(roundf(grid_y)))


static func nearest_walkable_cell(map_data: Dictionary, cell: Vector2i) -> Vector2i:
	return _nearest_walkable_cell_cached(
		map_data,
		grid_size(map_data),
		blocked_cell_lookup(map_data),
		interaction_blocked_cell_lookup(map_data),
		cell
	)


static func _nearest_walkable_cell_cached(
	map_data: Dictionary,
	size: Vector2i,
	blocked: Dictionary,
	interaction_blocked: Dictionary,
	cell: Vector2i
) -> Vector2i:
	if _is_walkable_cached(size, blocked, interaction_blocked, cell):
		return cell
	var queue: Array[Vector2i] = [cell]
	var seen: Dictionary = {cell: true}
	var queue_index := 0
	while queue_index < queue.size():
		var current: Vector2i = queue[queue_index]
		queue_index += 1
		for offset in NEIGHBORS_8:
			var next_cell := current + offset
			if seen.has(next_cell):
				continue
			seen[next_cell] = true
			if _is_walkable_cached(size, blocked, interaction_blocked, next_cell):
				return next_cell
			if _is_inside_size(size, next_cell):
				queue.append(next_cell)
	return spawn_cell(map_data)


static func find_path(map_data: Dictionary, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	var size := grid_size(map_data)
	var blocked := blocked_cell_lookup(map_data)
	var interaction_blocked := interaction_blocked_cell_lookup(map_data)
	var safe_start := _nearest_walkable_cell_cached(
		map_data, size, blocked, interaction_blocked, start
	)
	var safe_goal := _nearest_walkable_cell_cached(
		map_data, size, blocked, interaction_blocked, goal
	)
	if safe_start == safe_goal:
		return [safe_start]

	var direct := _direct_path_cached(
		map_data,
		size,
		blocked,
		interaction_blocked,
		safe_start,
		safe_goal
	)
	if not direct.is_empty():
		return direct

	var queue: Array[Vector2i] = [safe_start]
	var came_from: Dictionary = {safe_start: safe_start}
	var found := false
	var queue_index := 0
	var map_tile := tile_size(map_data)
	var map_origin := origin(map_data)
	var line_start := _grid_to_world_cached(map_tile, map_origin, safe_start)
	var line_vector := (
		_grid_to_world_cached(map_tile, map_origin, safe_goal) - line_start
	)
	var line_length_squared := line_vector.length_squared()

	while queue_index < queue.size() and not found:
		var current: Vector2i = queue[queue_index]
		queue_index += 1
		for next_cell in _sorted_step_candidates_cached(
			current,
			safe_goal,
			size,
			blocked,
			interaction_blocked,
			map_tile,
			map_origin,
			line_start,
			line_vector,
			line_length_squared
		):
			if came_from.has(next_cell):
				continue
			came_from[next_cell] = current
			if next_cell == safe_goal:
				found = true
				break
			queue.append(next_cell)

	if not found:
		return [safe_start]

	var path: Array[Vector2i] = []
	var cursor := safe_goal
	while cursor != safe_start:
		path.append(cursor)
		cursor = came_from[cursor] as Vector2i
	path.append(safe_start)
	path.reverse()
	return path


static func direct_path(map_data: Dictionary, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	return _direct_path_cached(
		map_data,
		grid_size(map_data),
		blocked_cell_lookup(map_data),
		interaction_blocked_cell_lookup(map_data),
		start,
		goal
	)


static func _direct_path_cached(
	map_data: Dictionary,
	size: Vector2i,
	blocked: Dictionary,
	interaction_blocked: Dictionary,
	start: Vector2i,
	goal: Vector2i
) -> Array[Vector2i]:
	if (
		not _is_walkable_cached(size, blocked, interaction_blocked, start)
		or not _is_walkable_cached(size, blocked, interaction_blocked, goal)
	):
		return []
	var steps := maxi(absi(goal.x - start.x), absi(goal.y - start.y))
	if steps == 0:
		return [start]

	var path: Array[Vector2i] = []
	var previous := start
	for step in range(steps + 1):
		var t := float(step) / float(steps)
		var cell := Vector2i(
			int(roundf(lerpf(float(start.x), float(goal.x), t))),
			int(roundf(lerpf(float(start.y), float(goal.y), t)))
		)
		if not path.is_empty() and cell == previous:
			continue
		if not _is_walkable_cached(size, blocked, interaction_blocked, cell):
			return []
		if (
			not path.is_empty()
			and not _can_step_cached(
				size, blocked, interaction_blocked, previous, cell
			)
		):
			return []
		path.append(cell)
		previous = cell
	return path


static func is_direct_path_clear(map_data: Dictionary, start: Vector2i, goal: Vector2i) -> bool:
	return not direct_path(map_data, start, goal).is_empty()


static func sorted_step_candidates(map_data: Dictionary, current: Vector2i, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	var map_tile := tile_size(map_data)
	var map_origin := origin(map_data)
	var line_start := _grid_to_world_cached(map_tile, map_origin, start)
	var line_vector := _grid_to_world_cached(map_tile, map_origin, goal) - line_start
	return _sorted_step_candidates_cached(
		current,
		goal,
		grid_size(map_data),
		blocked_cell_lookup(map_data),
		interaction_blocked_cell_lookup(map_data),
		map_tile,
		map_origin,
		line_start,
		line_vector,
		line_vector.length_squared()
	)


static func _sorted_step_candidates_cached(
	current: Vector2i,
	goal: Vector2i,
	size: Vector2i,
	blocked: Dictionary,
	interaction_blocked: Dictionary,
	map_tile: Vector2,
	map_origin: Vector2,
	line_start: Vector2,
	line_vector: Vector2,
	line_length_squared: float
) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	var line_scores: Array[float] = []
	var goal_scores: Array[int] = []
	for offset in NEIGHBORS_8:
		var next_cell := current + offset
		if not _can_step_cached(
			size, blocked, interaction_blocked, current, next_cell
		):
			continue
		var line_score := _line_distance_to_cell_cached(
			map_tile,
			map_origin,
			line_start,
			line_vector,
			line_length_squared,
			next_cell
		)
		var goal_score := _chebyshev_distance(next_cell, goal)
		var insert_index := cells.size()
		for index in range(cells.size()):
			if _candidate_values_less(
				line_score,
				goal_score,
				next_cell,
				line_scores[index],
				goal_scores[index],
				cells[index]
			):
				insert_index = index
				break
		cells.insert(insert_index, next_cell)
		line_scores.insert(insert_index, line_score)
		goal_scores.insert(insert_index, goal_score)
	return cells


static func _candidate_values_less(
	line_a: float,
	goal_a: int,
	cell_a: Vector2i,
	line_b: float,
	goal_b: int,
	cell_b: Vector2i
) -> bool:
	var line_delta := line_a - line_b
	if absf(line_delta) > 0.01:
		return line_delta < 0.0
	if goal_a != goal_b:
		return goal_a < goal_b
	# Preserve the old lexical cell-key tie-break without allocating a key for
	# every candidate. Exact ties are rare, so allocate only for this final case.
	return cell_key(cell_a) < cell_key(cell_b)


static func _chebyshev_distance(a: Vector2i, b: Vector2i) -> int:
	return maxi(absi(a.x - b.x), absi(a.y - b.y))


static func _line_distance_to_cell(map_data: Dictionary, start: Vector2i, goal: Vector2i, cell: Vector2i) -> float:
	var map_tile := tile_size(map_data)
	var map_origin := origin(map_data)
	var start_point := _grid_to_world_cached(map_tile, map_origin, start)
	var line := _grid_to_world_cached(map_tile, map_origin, goal) - start_point
	return _line_distance_to_cell_cached(
		map_tile,
		map_origin,
		start_point,
		line,
		line.length_squared(),
		cell
	)


static func _grid_to_world_cached(
	map_tile: Vector2,
	map_origin: Vector2,
	cell: Vector2i
) -> Vector2:
	return map_origin + Vector2(
		float(cell.x - cell.y) * map_tile.x * 0.5,
		float(cell.x + cell.y) * map_tile.y * 0.5
	)


static func _line_distance_to_cell_cached(
	map_tile: Vector2,
	map_origin: Vector2,
	line_start: Vector2,
	line_vector: Vector2,
	line_length_squared: float,
	cell: Vector2i
) -> float:
	var cell_point := _grid_to_world_cached(map_tile, map_origin, cell)
	if line_length_squared <= 0.001:
		return cell_point.distance_to(line_start)
	var t := clampf(
		(cell_point - line_start).dot(line_vector) / line_length_squared,
		0.0,
		1.0
	)
	return cell_point.distance_to(line_start + line_vector * t)


static func can_step(map_data: Dictionary, from_cell: Vector2i, to_cell: Vector2i) -> bool:
	return _can_step_cached(
		grid_size(map_data),
		blocked_cell_lookup(map_data),
		interaction_blocked_cell_lookup(map_data),
		from_cell,
		to_cell
	)


static func _can_step_cached(
	size: Vector2i,
	blocked: Dictionary,
	interaction_blocked: Dictionary,
	from_cell: Vector2i,
	to_cell: Vector2i
) -> bool:
	if not _is_walkable_cached(size, blocked, interaction_blocked, to_cell):
		return false
	var offset := to_cell - from_cell
	if absi(offset.x) == 1 and absi(offset.y) == 1:
		var side_a := from_cell + Vector2i(offset.x, 0)
		var side_b := from_cell + Vector2i(0, offset.y)
		if (
			not _is_walkable_cached(size, blocked, interaction_blocked, side_a)
			and not _is_walkable_cached(size, blocked, interaction_blocked, side_b)
		):
			return false
	return true


static func path_to_world_points(map_data: Dictionary, path: Array[Vector2i], include_start: bool = false) -> Array[Vector2]:
	var points: Array[Vector2] = []
	for index in range(path.size()):
		if index == 0 and not include_start:
			continue
		points.append(grid_to_world(map_data, path[index]))
	return points
