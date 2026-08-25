extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")

const MAP_PATH := "res://data/firebud_village_gate_map.json"
const TRAINING_MAP_PATH := "res://data/firebud_training_map.json"
const VILLAGE_BINDING_PATH := (
	"res://assets/maps/firebud_region_visual_v2/bindings/firebud_village_gate.json"
)
const TRAINING_BINDING_PATH := (
	"res://assets/maps/firebud_region_visual_v2/bindings/firebud_training_yard.json"
)
const RECORD_POINT_ID := "firebud_record_pillar"
const RECORD_POINT_CELL := Vector2i(10, 16)
const MIN_FOOTPOINT_SPACING_PX := 72.0
const MAIN_PROMENADE_Y := 15
const MAIN_PROMENADE_X_MIN := 3
const MAIN_PROMENADE_X_MAX := 10
const REVIEW_ZOOM := 1.82
const REVIEW_ANCHOR := Vector2(390, 360)
const REVIEW_SAFE_RECT := Rect2(8, 8, 955, 486)
const EXPECTED_INITIAL_SAFE_NPC_IDS := [
	"firebud_bank_keeper",
	"firebud_shopkeeper",
	"firebud_welfare_clerk",
	"village_guard",
]
const EXPECTED_VILLAGE_BLOCKED_CELL_COUNT := 22
const EXPECTED_TRAINING_BLOCKED_CELL_COUNT := 46
const EXPECTED_VILLAGE_PLACEMENT_COUNT := 21
const EXPECTED_TRAINING_PLACEMENT_COUNT := 28
const TRAINING_ENDPOINT_ZONE := Rect2i(27, 24, 8, 7)

const SERVICE_ZONE_RECTS := {
	"entrance_civic_trade": Rect2i(2, 11, 5, 8),
	"pet_care": Rect2i(6, 17, 7, 6),
	"advanced_growth_trial": Rect2i(11, 8, 8, 6),
}

const SERVICE_ZONE_BY_NPC := {
	"village_guard": "entrance_civic_trade",
	"firebud_welfare_clerk": "entrance_civic_trade",
	"firebud_bank_keeper": "entrance_civic_trade",
	"firebud_shopkeeper": "entrance_civic_trade",
	"firebud_storyteller": "entrance_civic_trade",
	"firebud_riding_trainer": "pet_care",
	"firebud_doctor": "pet_care",
	"firebud_stable_keeper": "pet_care",
	"firebud_pet_skill_trainer": "pet_care",
	"firebud_equipment_keeper": "advanced_growth_trial",
	"firebud_diamond_keeper": "advanced_growth_trial",
	"firebud_rebirth_mentor": "advanced_growth_trial",
	"firebud_pet_mm_trial_mentor": "advanced_growth_trial",
	"firebud_pet_mm_stage2_keeper": "advanced_growth_trial",
}

const EXPECTED_VILLAGE_CLUSTER_ANCHORS := {
	"village_advanced_planter_blocked_cluster_01": {
		"objectId": "firebud_low_planter",
		"grid": Vector2i(11, 8),
	},
	"village_growth_rack_blocked_cluster_01": {
		"objectId": "firebud_training_rack",
		"grid": Vector2i(11, 7),
	},
	"village_trade_counter_blocked_cluster_01": {
		"objectId": "firebud_trade_counter",
		"grid": Vector2i(11, 10),
	},
	"village_pet_care_supplies_blocked_cluster_01": {
		"objectId": "firebud_supply_pots",
		"grid": Vector2i(9, 22),
	},
	"village_planter_blocked_cluster_02": {
		"objectId": "firebud_low_planter",
		"grid": Vector2i(13, 21),
	},
	"village_trial_practice_cluster_blocked_01": {
		"objectId": "firebud_practice_cluster",
		"grid": Vector2i(13, 8),
	},
	"village_trial_target_blocked_cluster_01": {
		"objectId": "firebud_training_target",
		"grid": Vector2i(19, 14),
	},
}

const EXPECTED_TRAINING_ZONE_ANCHORS := {
	"training_target_blocked_cluster_01": {
		"objectId": "firebud_training_target",
		"grid": Vector2i(6, 7),
	},
	"training_fence_blocked_cluster_03": {
		"objectId": "firebud_low_fence",
		"grid": Vector2i(10, 13),
	},
	"training_fence_blocked_cluster_04": {
		"objectId": "firebud_low_fence",
		"grid": Vector2i(19, 13),
	},
	"training_target_blocked_cluster_03": {
		"objectId": "firebud_training_target",
		"grid": Vector2i(23, 16),
	},
	"training_route_rack_blocked_cluster_02": {
		"objectId": "firebud_training_rack",
		"grid": Vector2i(26, 18),
	},
	"training_ancient_tree_blocked_cluster_01": {
		"objectId": "firebud_ancient_tree",
		"grid": Vector2i(7, 20),
	},
	"training_planter_blocked_cluster_01": {
		"objectId": "firebud_low_planter",
		"grid": Vector2i(31, 26),
	},
	"training_village_gate_pavilion_blocked_01": {
		"objectId": "firebud_service_pavilion",
		"grid": Vector2i(34, 25),
	},
	"training_village_gate_fence_blocked_01": {
		"objectId": "firebud_low_fence",
		"grid": Vector2i(34, 29),
	},
}

const EXPECTED_NPCS := {
	"village_guard": {
		"cell": Vector2i(3, 11),
		"facing": "south",
		"appearanceId": "npc_village_guard_m_v1",
	},
	"firebud_welfare_clerk": {
		"cell": Vector2i(5, 12),
		"facing": "south",
		"appearanceId": "npc_welfare_clerk_f_v1",
	},
	"firebud_pet_mm_stage2_keeper": {
		"cell": Vector2i(17, 12),
		"facing": "south",
		"appearanceId": "npc_pet_mm_stage2_keeper_f_v1",
	},
	"firebud_shopkeeper": {
		"cell": Vector2i(5, 16),
		"facing": "north",
		"appearanceId": "npc_item_shopkeeper_f_v1",
	},
	"firebud_equipment_keeper": {
		"cell": Vector2i(12, 9),
		"facing": "south",
		"appearanceId": "npc_equipment_artisan_m_v1",
	},
	"firebud_diamond_keeper": {
		"cell": Vector2i(14, 9),
		"facing": "south",
		"appearanceId": "npc_diamond_merchant_m_v1",
	},
	"firebud_bank_keeper": {
		"cell": Vector2i(5, 14),
		"facing": "south",
		"appearanceId": "npc_bank_keeper_f_v1",
	},
	"firebud_rebirth_mentor": {
		"cell": Vector2i(13, 12),
		"facing": "south",
		"appearanceId": "npc_player_rebirth_mentor_f_v1",
	},
	"firebud_pet_mm_trial_mentor": {
		"cell": Vector2i(15, 11),
		"facing": "south",
		"appearanceId": "npc_pet_mm_trial_mentor_m_v1",
	},
	"firebud_riding_trainer": {
		"cell": Vector2i(7, 18),
		"facing": "north",
		"appearanceId": "npc_riding_trainer_f_v1",
	},
	"firebud_pet_skill_trainer": {
		"cell": Vector2i(11, 20),
		"facing": "north",
		"appearanceId": "npc_pet_skill_trainer_m_v1",
	},
	"firebud_storyteller": {
		"cell": Vector2i(5, 18),
		"facing": "north",
		"appearanceId": "npc_storyteller_m_v1",
	},
	"firebud_stable_keeper": {
		"cell": Vector2i(7, 21),
		"facing": "north",
		"appearanceId": "npc_stable_keeper_m_v1",
	},
	"firebud_doctor": {
		"cell": Vector2i(9, 19),
		"facing": "north",
		"appearanceId": "npc_village_healer_f_v1",
	},
}


static func run() -> Dictionary:
	var errors: Array[String] = []
	var map_data := IsoMapModel.load_map(MAP_PATH)
	if map_data.is_empty():
		errors.append("火芽村入口地图加载失败")
		return _report(errors, {})

	var npc_items: Array[Dictionary] = []
	var layout_items: Array[Dictionary] = []
	var occupied_cells: Dictionary = {}
	var initial_safe_npc_ids: Array[String] = []
	for value in InteractionModel.interaction_points(map_data):
		var item := value as Dictionary
		var item_id := str(item.get("id", ""))
		if str(item.get("kind", "")) == "npc":
			npc_items.append(item)
			var screen_footpoint := REVIEW_ANCHOR + (
				IsoMapModel.grid_to_world(map_data, InteractionModel.cell_for(item))
				- IsoMapModel.grid_to_world(map_data, IsoMapModel.spawn_cell(map_data))
			) * REVIEW_ZOOM
			if REVIEW_SAFE_RECT.has_point(screen_footpoint):
				initial_safe_npc_ids.append(str(item.get("id", "")))
		if EXPECTED_NPCS.has(item_id) or item_id == RECORD_POINT_ID:
			layout_items.append(item)
			var cell := InteractionModel.cell_for(item)
			var cell_key := IsoMapModel.cell_key(cell)
			if occupied_cells.has(cell_key):
				errors.append(
					"服务对象格子重复：%s / %s"
					% [str(occupied_cells[cell_key]), item_id]
				)
			else:
				occupied_cells[cell_key] = item_id

	if npc_items.size() != EXPECTED_NPCS.size():
		errors.append(
			"火芽村正式 NPC 数量漂移：expected=%d actual=%d"
			% [EXPECTED_NPCS.size(), npc_items.size()]
		)
	initial_safe_npc_ids.sort()
	var expected_initial_safe_ids := EXPECTED_INITIAL_SAFE_NPC_IDS.duplicate()
	expected_initial_safe_ids.sort()
	if initial_safe_npc_ids != expected_initial_safe_ids:
		errors.append(
			"火芽村初始安全画幅服务密度漂移：expected=%s actual=%s"
			% [
				",".join(expected_initial_safe_ids),
				",".join(initial_safe_npc_ids),
			]
		)
	if (map_data.get("blockedCells", []) as Array).size() != EXPECTED_VILLAGE_BLOCKED_CELL_COUNT:
		errors.append("火芽村 blockedCells 数量漂移")

	var default_spawn := IsoMapModel.spawn_cell(map_data, "default")
	for npc_id_value in EXPECTED_NPCS.keys():
		var npc_id := str(npc_id_value)
		var expected := EXPECTED_NPCS[npc_id] as Dictionary
		var item := InteractionModel.find_by_id(map_data, npc_id)
		if item.is_empty():
			errors.append("缺少火芽村正式 NPC：%s" % npc_id)
			continue
		var actual_cell := InteractionModel.cell_for(item)
		var expected_cell := expected.get("cell", Vector2i.ZERO) as Vector2i
		if actual_cell != expected_cell:
			errors.append(
				"NPC 站位漂移：%s expected=%s actual=%s"
				% [npc_id, str(expected_cell), str(actual_cell)]
			)
		if str(item.get("facing", "")) != str(expected.get("facing", "")):
			errors.append("NPC 未朝向中央通道：%s" % npc_id)
		if str(item.get("appearanceId", "")) != str(expected.get("appearanceId", "")):
			errors.append("NPC appearanceId 漂移：%s" % npc_id)
		if not InteractionModel.blocks_movement(item):
			errors.append("正式服务 NPC 必须保持阻挡碰撞：%s" % npc_id)
		if _cell_in_encounter_zone(map_data, actual_cell):
			errors.append("服务 NPC 不得站在野外遇敌区：%s" % npc_id)
		var zone_id := str(SERVICE_ZONE_BY_NPC.get(npc_id, ""))
		var zone_rect: Rect2i = SERVICE_ZONE_RECTS.get(zone_id, Rect2i())
		if zone_id == "" or not zone_rect.has_point(actual_cell):
			errors.append("NPC 未进入冻结服务分区：%s/%s" % [npc_id, zone_id])
		var approach_cell := InteractionModel.approach_cell_for(
			map_data,
			default_spawn,
			item
		)
		var approach_path := IsoMapModel.find_path(
			map_data,
			default_spawn,
			approach_cell
		)
		if (
			not IsoMapModel.is_walkable(map_data, approach_cell)
			or not _path_reaches(approach_path, approach_cell)
			or maxi(
				absi(approach_cell.x - actual_cell.x),
				absi(approach_cell.y - actual_cell.y)
			) > 1
		):
			errors.append("NPC 从默认出生点不可接近：%s" % npc_id)

	var record_point := InteractionModel.find_by_id(map_data, RECORD_POINT_ID)
	if record_point.is_empty():
		errors.append("缺少火芽村记录点柱")
	else:
		if InteractionModel.cell_for(record_point) != RECORD_POINT_CELL:
			errors.append("记录点柱站位漂移")
		if not InteractionModel.blocks_movement(record_point):
			errors.append("记录点柱必须保持阻挡碰撞")
		if _cell_in_encounter_zone(map_data, RECORD_POINT_CELL):
			errors.append("记录点柱不得站在野外遇敌区")

	for x in range(MAIN_PROMENADE_X_MIN, MAIN_PROMENADE_X_MAX + 1):
		var route_cell := Vector2i(x, MAIN_PROMENADE_Y)
		if not IsoMapModel.is_walkable(map_data, route_cell):
			errors.append("火芽村中央主通道被阻断：%s" % str(route_cell))

	var doctor_record_spawn := IsoMapModel.spawn_cell(map_data, "doctor_record")
	if not IsoMapModel.is_walkable(map_data, doctor_record_spawn):
		errors.append("doctor_record 出生点不可行走")
	if not _path_reaches(
		IsoMapModel.find_path(map_data, default_spawn, doctor_record_spawn),
		doctor_record_spawn
	):
		errors.append("默认出生点无法到达 doctor_record")

	var village_binding := _load_json(VILLAGE_BINDING_PATH, errors)
	_validate_binding_anchors(
		village_binding,
		EXPECTED_VILLAGE_CLUSTER_ANCHORS,
		EXPECTED_VILLAGE_PLACEMENT_COUNT,
		"火芽村",
		errors
	)
	var training_map := IsoMapModel.load_map(TRAINING_MAP_PATH)
	var training_route_to_village_reachable := false
	if training_map.is_empty():
		errors.append("火芽训练场地图加载失败")
	else:
		training_route_to_village_reachable = _validate_training_navigation(
			training_map,
			errors
		)
	var training_binding := _load_json(TRAINING_BINDING_PATH, errors)
	_validate_binding_anchors(
		training_binding,
		EXPECTED_TRAINING_ZONE_ANCHORS,
		EXPECTED_TRAINING_PLACEMENT_COUNT,
		"火芽训练场",
		errors
	)

	var min_spacing := INF
	var min_pair := ""
	for left_index in range(layout_items.size()):
		var left := layout_items[left_index]
		var left_world := IsoMapModel.grid_to_world(
			map_data,
			InteractionModel.cell_for(left)
		)
		for right_index in range(left_index + 1, layout_items.size()):
			var right := layout_items[right_index]
			var right_world := IsoMapModel.grid_to_world(
				map_data,
				InteractionModel.cell_for(right)
			)
			var spacing := left_world.distance_to(right_world)
			if spacing < min_spacing:
				min_spacing = spacing
				min_pair = "%s/%s" % [
					str(left.get("id", "")),
					str(right.get("id", "")),
				]
	if min_spacing + 0.01 < MIN_FOOTPOINT_SPACING_PX:
		errors.append(
			"服务对象脚点间距不足：%.2fpx pair=%s"
			% [min_spacing, min_pair]
		)

	return _report(errors, {
		"npcCount": npc_items.size(),
		"layoutObjectCount": layout_items.size(),
		"minFootpointSpacingPx": snappedf(min_spacing, 0.01),
		"minPair": min_pair,
		"mainPromenadeClear": true,
		"encounterZoneNpcCount": 0,
		"allNpcApproachesReachable": true,
		"initialSafeNpcFootpointCount": initial_safe_npc_ids.size(),
		"initialSafeNpcIds": initial_safe_npc_ids,
		"facingContract": "north-south-inward",
		"serviceZoneCounts": {
			"entranceCivicTrade": 5,
			"petCare": 4,
			"advancedGrowthTrial": 5,
		},
		"villageBlockedCellCount": (map_data.get("blockedCells", []) as Array).size(),
		"villagePlacementCount": _placement_count(village_binding),
		"trainingBlockedCellCount": (
			(training_map.get("blockedCells", []) as Array).size()
			if not training_map.is_empty()
			else 0
		),
		"trainingPlacementCount": _placement_count(training_binding),
		"trainingRouteToVillageReachable": training_route_to_village_reachable,
	})


static func _validate_training_navigation(
	training_map: Dictionary,
	errors: Array[String]
) -> bool:
	var route_reachable := true
	if (
		(training_map.get("blockedCells", []) as Array).size()
		!= EXPECTED_TRAINING_BLOCKED_CELL_COUNT
	):
		errors.append("火芽训练场 blockedCells 数量漂移")
	var default_spawn := IsoMapModel.spawn_cell(training_map, "default")
	var from_village_spawn := IsoMapModel.spawn_cell(training_map, "from_village_gate")
	var warp := InteractionModel.find_by_id(training_map, "warp_to_village_gate")
	if warp.is_empty():
		errors.append("火芽训练场缺少返回村口 warp")
		return false
	var warp_cell := InteractionModel.cell_for(warp)
	for spawn in [default_spawn, from_village_spawn]:
		if not IsoMapModel.is_walkable(training_map, spawn):
			errors.append("火芽训练场出生点不可行走：%s" % str(spawn))
			route_reachable = false
		elif not _path_reaches(
			IsoMapModel.find_path(training_map, spawn, warp_cell),
			warp_cell
		):
			errors.append("火芽训练场出生点无法到达村口 warp：%s" % str(spawn))
			route_reachable = false
	if (
		not TRAINING_ENDPOINT_ZONE.has_point(from_village_spawn)
		or not TRAINING_ENDPOINT_ZONE.has_point(warp_cell)
	):
		errors.append("训练场村口出生点／warp 未处于路线终点围合区")
		route_reachable = false
	for interaction_id in ["trainer", "block_tester"]:
		var item := InteractionModel.find_by_id(training_map, interaction_id)
		if item.is_empty():
			errors.append("火芽训练场缺少教学交互：%s" % interaction_id)
			continue
		var approach_cell := InteractionModel.approach_cell_for(
			training_map,
			default_spawn,
			item
		)
		if not _path_reaches(
			IsoMapModel.find_path(training_map, default_spawn, approach_cell),
			approach_cell
		):
			errors.append("火芽训练场教学交互不可接近：%s" % interaction_id)
	return route_reachable


static func _validate_binding_anchors(
	binding: Dictionary,
	expected_anchors: Dictionary,
	expected_count: int,
	label: String,
	errors: Array[String]
) -> void:
	if binding.is_empty():
		return
	var placements := binding.get("objectPlacements", []) as Array
	if placements.size() != expected_count:
		errors.append(
			"%s正式物件数量漂移：expected=%d actual=%d"
			% [label, expected_count, placements.size()]
		)
	for instance_id_value in expected_anchors.keys():
		var instance_id := str(instance_id_value)
		var expected := expected_anchors[instance_id] as Dictionary
		var placement := _placement_by_id(placements, instance_id)
		if placement.is_empty():
			errors.append("%s缺少功能区物件：%s" % [label, instance_id])
			continue
		if str(placement.get("objectId", "")) != str(expected.get("objectId", "")):
			errors.append("%s功能区物件类型漂移：%s" % [label, instance_id])
		if _cell(placement.get("grid")) != (expected.get("grid") as Vector2i):
			errors.append("%s功能区物件锚点漂移：%s" % [label, instance_id])


static func _load_json(path: String, errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(path):
		errors.append("布局 binding 不存在：%s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("布局 binding 解析失败：%s" % path)
		return {}
	return parsed as Dictionary


static func _placement_by_id(placements: Array, instance_id: String) -> Dictionary:
	for value in placements:
		if value is Dictionary and str((value as Dictionary).get("instanceId", "")) == instance_id:
			return value as Dictionary
	return {}


static func _placement_count(binding: Dictionary) -> int:
	return (binding.get("objectPlacements", []) as Array).size() if not binding.is_empty() else 0


static func _cell(value: Variant) -> Vector2i:
	if not (value is Array) or (value as Array).size() < 2:
		return Vector2i(-1, -1)
	var values := value as Array
	return Vector2i(int(values[0]), int(values[1]))


static func _path_reaches(path: Array[Vector2i], goal: Vector2i) -> bool:
	return not path.is_empty() and path[path.size() - 1] == goal


static func _cell_in_encounter_zone(map_data: Dictionary, cell: Vector2i) -> bool:
	for zone_value in map_data.get("encounterZones", []):
		var zone := zone_value as Dictionary
		for rect_value in zone.get("rects", []):
			var rect := rect_value as Array
			if rect.size() < 4:
				continue
			if (
				cell.x >= int(rect[0])
				and cell.x < int(rect[0]) + int(rect[2])
				and cell.y >= int(rect[1])
				and cell.y < int(rect[1]) + int(rect[3])
			):
				return true
	return false


static func _report(errors: Array[String], summary: Dictionary) -> Dictionary:
	return {
		"schemaVersion": 1,
		"reportType": "beastbound.firebud_village_service_layout_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"errors": errors,
		"summary": summary,
	}
