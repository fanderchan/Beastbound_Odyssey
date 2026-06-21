extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")


static func interaction_points(map_data: Dictionary) -> Array:
	return map_data.get("interactionPoints", [])


static func find_by_id(map_data: Dictionary, interaction_id: String) -> Dictionary:
	for value in interaction_points(map_data):
		var item := value as Dictionary
		if str(item.get("id", "")) == interaction_id:
			return item
	return {}


static func cell_for(item: Dictionary) -> Vector2i:
	var value: Array = item.get("cell", [0, 0])
	return Vector2i(int(value[0]), int(value[1]))


static func blocks_movement(item: Dictionary) -> bool:
	return IsoMapModel.interaction_blocks_movement(item)


static func is_warp(item: Dictionary) -> bool:
	return str(item.get("kind", "")) == "warp"


static func interaction_goal_cell_for(map_data: Dictionary, player_cell: Vector2i, item: Dictionary) -> Vector2i:
	if blocks_movement(item):
		return approach_cell_for(map_data, player_cell, item)
	return cell_for(item)


static func marker_world_position(map_data: Dictionary, item: Dictionary) -> Vector2:
	return IsoMapModel.grid_to_world(map_data, cell_for(item)) + Vector2(0, -18)


static func find_at_world_point(map_data: Dictionary, world_point: Vector2, hit_radius: float = 34.0) -> Dictionary:
	var clicked_cell := IsoMapModel.world_to_grid(map_data, world_point)
	var best_item: Dictionary = {}
	var best_distance := INF
	for value in interaction_points(map_data):
		var item := value as Dictionary
		var item_cell := cell_for(item)
		var marker_point := marker_world_position(map_data, item)
		var distance := world_point.distance_to(marker_point)
		if item_cell == clicked_cell:
			distance = minf(distance, hit_radius * 0.5)
		if distance <= hit_radius and distance < best_distance:
			best_item = item
			best_distance = distance
	return best_item


static func approach_cell_for(map_data: Dictionary, player_cell: Vector2i, item: Dictionary) -> Vector2i:
	var item_cell := cell_for(item)
	var candidates: Array[Dictionary] = []
	for offset in IsoMapModel.NEIGHBORS_8:
		var candidate_cell: Vector2i = item_cell + offset
		if not IsoMapModel.is_walkable(map_data, candidate_cell):
			continue
		var path := IsoMapModel.find_path(map_data, player_cell, candidate_cell)
		if path.is_empty():
			continue
		candidates.append({
			"cell": candidate_cell,
			"path_len": path.size(),
			"distance": maxi(absi(candidate_cell.x - player_cell.x), absi(candidate_cell.y - player_cell.y)),
			"key": IsoMapModel.cell_key(candidate_cell),
		})
	if candidates.is_empty():
		return IsoMapModel.nearest_walkable_cell(map_data, item_cell)
	candidates.sort_custom(_candidate_less)
	return candidates[0]["cell"] as Vector2i


static func _candidate_less(a: Dictionary, b: Dictionary) -> bool:
	var path_a := int(a["path_len"])
	var path_b := int(b["path_len"])
	if path_a != path_b:
		return path_a < path_b
	var distance_delta := float(a["distance"]) - float(b["distance"])
	if absf(distance_delta) > 0.01:
		return distance_delta < 0.0
	return str(a["key"]) < str(b["key"])
