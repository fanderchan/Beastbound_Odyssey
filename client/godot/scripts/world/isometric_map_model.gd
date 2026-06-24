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


static func load_map(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return with_runtime_cache(parsed as Dictionary)
	return {}


static func with_runtime_cache(map_data: Dictionary) -> Dictionary:
	map_data[RUNTIME_BLOCKED_LOOKUP_KEY] = _build_blocked_lookup(map_data)
	map_data[RUNTIME_INTERACTION_BLOCKED_LOOKUP_KEY] = _build_interaction_blocked_lookup(map_data)
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


static func interaction_blocks_movement(item: Dictionary) -> bool:
	if item.has("blocksMovement"):
		return bool(item.get("blocksMovement", false))
	var collision := str(item.get("movementCollision", "overlap")).to_lower()
	return collision == MOVEMENT_COLLISION_BLOCK


static func cell_key(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]


static func is_inside(map_data: Dictionary, cell: Vector2i) -> bool:
	var size := grid_size(map_data)
	return cell.x >= 0 and cell.y >= 0 and cell.x < size.x and cell.y < size.y


static func is_walkable(map_data: Dictionary, cell: Vector2i) -> bool:
	if not is_inside(map_data, cell):
		return false
	var blocked := blocked_lookup(map_data)
	if blocked.has(cell_key(cell)):
		return false
	var interaction_blocked := interaction_blocked_lookup(map_data)
	return not interaction_blocked.has(cell_key(cell))


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
	if is_walkable(map_data, cell):
		return cell
	var queue: Array[Vector2i] = [cell]
	var seen: Dictionary = {cell_key(cell): true}
	while not queue.is_empty():
		var current: Vector2i = queue.pop_front()
		for offset in NEIGHBORS_8:
			var next_cell := current + offset
			var key := cell_key(next_cell)
			if seen.has(key):
				continue
			seen[key] = true
			if is_walkable(map_data, next_cell):
				return next_cell
			if is_inside(map_data, next_cell):
				queue.append(next_cell)
	return spawn_cell(map_data)


static func find_path(map_data: Dictionary, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	var safe_start := nearest_walkable_cell(map_data, start)
	var safe_goal := nearest_walkable_cell(map_data, goal)
	if safe_start == safe_goal:
		return [safe_start]

	var direct := direct_path(map_data, safe_start, safe_goal)
	if not direct.is_empty():
		return direct

	var queue: Array[Vector2i] = [safe_start]
	var came_from: Dictionary = {cell_key(safe_start): safe_start}
	var found := false

	while not queue.is_empty() and not found:
		var current: Vector2i = queue.pop_front()
		for next_cell in sorted_step_candidates(map_data, current, safe_start, safe_goal):
			var key := cell_key(next_cell)
			if came_from.has(key):
				continue
			came_from[key] = current
			if next_cell == safe_goal:
				found = true
				break
			queue.append(next_cell)

	if not found:
		return [safe_start]

	var path: Array[Vector2i] = []
	var cursor := safe_goal
	while cursor != safe_start:
		path.push_front(cursor)
		cursor = came_from[cell_key(cursor)] as Vector2i
	path.push_front(safe_start)
	return path


static func direct_path(map_data: Dictionary, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	if not is_walkable(map_data, start) or not is_walkable(map_data, goal):
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
		if not is_walkable(map_data, cell):
			return []
		if not path.is_empty() and not can_step(map_data, previous, cell):
			return []
		path.append(cell)
		previous = cell
	return path


static func is_direct_path_clear(map_data: Dictionary, start: Vector2i, goal: Vector2i) -> bool:
	return not direct_path(map_data, start, goal).is_empty()


static func sorted_step_candidates(map_data: Dictionary, current: Vector2i, start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	var ranked: Array[Dictionary] = []
	for offset in NEIGHBORS_8:
		var next_cell := current + offset
		if not can_step(map_data, current, next_cell):
			continue
		var candidate := {
			"cell": next_cell,
			"line": _line_distance_to_cell(map_data, start, goal, next_cell),
			"goal": _chebyshev_distance(next_cell, goal),
			"key": cell_key(next_cell),
		}
		_insert_ranked_candidate(ranked, candidate)

	var cells: Array[Vector2i] = []
	for item in ranked:
		cells.append(item["cell"] as Vector2i)
	return cells


static func _insert_ranked_candidate(ranked: Array[Dictionary], candidate: Dictionary) -> void:
	var insert_index := ranked.size()
	for index in range(ranked.size()):
		if _candidate_less(candidate, ranked[index]):
			insert_index = index
			break
	ranked.insert(insert_index, candidate)


static func _candidate_less(a: Dictionary, b: Dictionary) -> bool:
	var line_delta := float(a["line"]) - float(b["line"])
	if absf(line_delta) > 0.01:
		return line_delta < 0.0
	var goal_a := int(a["goal"])
	var goal_b := int(b["goal"])
	if goal_a != goal_b:
		return goal_a < goal_b
	return str(a["key"]) < str(b["key"])


static func _chebyshev_distance(a: Vector2i, b: Vector2i) -> int:
	return maxi(absi(a.x - b.x), absi(a.y - b.y))


static func _line_distance_to_cell(map_data: Dictionary, start: Vector2i, goal: Vector2i, cell: Vector2i) -> float:
	var start_point := grid_to_world(map_data, start)
	var goal_point := grid_to_world(map_data, goal)
	var cell_point := grid_to_world(map_data, cell)
	var line := goal_point - start_point
	var length_squared := line.length_squared()
	if length_squared <= 0.001:
		return cell_point.distance_to(start_point)
	var t := clampf((cell_point - start_point).dot(line) / length_squared, 0.0, 1.0)
	return cell_point.distance_to(start_point + line * t)


static func can_step(map_data: Dictionary, from_cell: Vector2i, to_cell: Vector2i) -> bool:
	if not is_walkable(map_data, to_cell):
		return false
	var offset := to_cell - from_cell
	if absi(offset.x) == 1 and absi(offset.y) == 1:
		var side_a := from_cell + Vector2i(offset.x, 0)
		var side_b := from_cell + Vector2i(0, offset.y)
		if not is_walkable(map_data, side_a) and not is_walkable(map_data, side_b):
			return false
	return true


static func path_to_world_points(map_data: Dictionary, path: Array[Vector2i], include_start: bool = false) -> Array[Vector2]:
	var points: Array[Vector2] = []
	for index in range(path.size()):
		if index == 0 and not include_start:
			continue
		points.append(grid_to_world(map_data, path[index]))
	return points
