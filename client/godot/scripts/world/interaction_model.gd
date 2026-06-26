extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")

const FACILITY_HEALER := "healer"
const FACILITY_ITEM_SHOP := "item_shop"
const FACILITY_EQUIPMENT_SHOP := "equipment_shop"
const FACILITY_RECORD_POINT := "record_point"
const FACILITY_TRAINER := "trainer"
const FACILITY_STABLE := "stable"
const FACILITY_REBIRTH := "rebirth"
const FACILITY_GUARDIAN := "guardian"


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


static func facility_type_for(item: Dictionary) -> String:
	var explicit_type := str(item.get("facilityType", "")).strip_edges()
	if explicit_type != "":
		return explicit_type
	var kind := str(item.get("kind", "")).strip_edges()
	var action_type := str(item.get("actionType", "")).strip_edges()
	if kind == FACILITY_RECORD_POINT or action_type == FACILITY_RECORD_POINT:
		return FACILITY_RECORD_POINT
	if action_type == FACILITY_HEALER or bool(item.get("healer", false)):
		return FACILITY_HEALER
	if kind == FACILITY_STABLE or action_type == FACILITY_STABLE:
		return FACILITY_STABLE
	if action_type == FACILITY_REBIRTH or kind == FACILITY_REBIRTH:
		return FACILITY_REBIRTH
	if action_type == "pet_skill_trainer" or str(item.get("trainerId", "")) != "":
		return FACILITY_TRAINER
	if action_type == FACILITY_GUARDIAN or kind == FACILITY_GUARDIAN:
		return FACILITY_GUARDIAN
	var shop_id := str(item.get("shopId", ""))
	if shop_id != "":
		if shop_id.find("equipment") >= 0:
			return FACILITY_EQUIPMENT_SHOP
		return FACILITY_ITEM_SHOP
	return ""


static func facility_label_for(item: Dictionary) -> String:
	var explicit_label := str(item.get("facilityLabel", "")).strip_edges()
	if explicit_label != "":
		return explicit_label
	match facility_type_for(item):
		FACILITY_HEALER:
			return "村医"
		FACILITY_ITEM_SHOP:
			return "杂货"
		FACILITY_EQUIPMENT_SHOP:
			return "装备"
		FACILITY_RECORD_POINT:
			return "记录"
		FACILITY_TRAINER:
			return "训练"
		FACILITY_STABLE:
			return "兽栏"
		FACILITY_REBIRTH:
			return "转生"
		FACILITY_GUARDIAN:
			return "守护"
	return ""


static func is_facility(item: Dictionary) -> bool:
	return facility_type_for(item) != ""


static func facility_sort_rank_for(item: Dictionary) -> int:
	match facility_type_for(item):
		FACILITY_HEALER:
			return 10
		FACILITY_ITEM_SHOP:
			return 20
		FACILITY_EQUIPMENT_SHOP:
			return 30
		FACILITY_STABLE:
			return 35
		FACILITY_RECORD_POINT:
			return 40
		FACILITY_TRAINER:
			return 50
		FACILITY_REBIRTH:
			return 55
		FACILITY_GUARDIAN:
			return 60
	if is_warp(item):
		return 80
	return 70


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
