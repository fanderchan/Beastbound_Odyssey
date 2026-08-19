extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")

const MAP_PATH := "res://data/firebud_village_gate_map.json"
const RECORD_POINT_ID := "firebud_record_pillar"
const RECORD_POINT_CELL := Vector2i(10, 16)
const MIN_FOOTPOINT_SPACING_PX := 72.0
const MAIN_PROMENADE_Y := 15
const MAIN_PROMENADE_X_MIN := 3
const MAIN_PROMENADE_X_MAX := 10

const EXPECTED_NPCS := {
	"village_guard": {
		"cell": Vector2i(3, 11),
		"facing": "south",
		"appearanceId": "npc_village_guard_m_v1",
	},
	"firebud_welfare_clerk": {
		"cell": Vector2i(7, 10),
		"facing": "south",
		"appearanceId": "npc_welfare_clerk_f_v1",
	},
	"firebud_pet_mm_stage2_keeper": {
		"cell": Vector2i(11, 11),
		"facing": "south",
		"appearanceId": "npc_pet_mm_stage2_keeper_f_v1",
	},
	"firebud_shopkeeper": {
		"cell": Vector2i(3, 14),
		"facing": "south",
		"appearanceId": "npc_item_shopkeeper_f_v1",
	},
	"firebud_equipment_keeper": {
		"cell": Vector2i(6, 12),
		"facing": "south",
		"appearanceId": "npc_equipment_artisan_m_v1",
	},
	"firebud_diamond_keeper": {
		"cell": Vector2i(9, 13),
		"facing": "south",
		"appearanceId": "npc_diamond_merchant_m_v1",
	},
	"firebud_bank_keeper": {
		"cell": Vector2i(5, 14),
		"facing": "south",
		"appearanceId": "npc_bank_keeper_f_v1",
	},
	"firebud_rebirth_mentor": {
		"cell": Vector2i(12, 13),
		"facing": "south",
		"appearanceId": "npc_player_rebirth_mentor_f_v1",
	},
	"firebud_pet_mm_trial_mentor": {
		"cell": Vector2i(14, 11),
		"facing": "south",
		"appearanceId": "npc_pet_mm_trial_mentor_m_v1",
	},
	"firebud_riding_trainer": {
		"cell": Vector2i(3, 18),
		"facing": "north",
		"appearanceId": "npc_riding_trainer_f_v1",
	},
	"firebud_pet_skill_trainer": {
		"cell": Vector2i(7, 18),
		"facing": "north",
		"appearanceId": "npc_pet_skill_trainer_m_v1",
	},
	"firebud_storyteller": {
		"cell": Vector2i(14, 15),
		"facing": "north",
		"appearanceId": "npc_storyteller_m_v1",
	},
	"firebud_stable_keeper": {
		"cell": Vector2i(5, 20),
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
	for value in InteractionModel.interaction_points(map_data):
		var item := value as Dictionary
		var item_id := str(item.get("id", ""))
		if str(item.get("kind", "")) == "npc":
			npc_items.append(item)
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
			or approach_path.is_empty()
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
	if IsoMapModel.find_path(map_data, default_spawn, doctor_record_spawn).is_empty():
		errors.append("默认出生点无法到达 doctor_record")

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
		"facingContract": "north-south-inward",
	})


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
