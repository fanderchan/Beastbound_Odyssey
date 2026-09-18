extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")

const EARTH_VEIN_SHARED_CONTRACT := "spawn_adjacent_pair_v1"
const EARTH_VEIN_CLICK_COUNT := 60
const EARTH_VEIN_OFFSETS: Array[Vector2i] = [
	Vector2i(0, -1),
	Vector2i(1, 0),
]


static func build(
	map_data: Dictionary,
	start_cell: Vector2i,
	click_count: int,
	contract_id: String
) -> Dictionary:
	if contract_id != EARTH_VEIN_SHARED_CONTRACT:
		return {
			"status": "failed",
			"reason": "unsupported_contract",
		}
	if click_count != EARTH_VEIN_CLICK_COUNT:
		return {
			"status": "failed",
			"reason": "click_count_mismatch",
		}
	var interaction_cells: Dictionary = {}
	var raw_interactions = map_data.get("interactionPoints", [])
	if raw_interactions is Array:
		for raw_interaction in raw_interactions:
			if not (raw_interaction is Dictionary):
				continue
			var raw_cell = (raw_interaction as Dictionary).get("cell", [])
			if raw_cell is Array and raw_cell.size() >= 2:
				interaction_cells[Vector2i(int(raw_cell[0]), int(raw_cell[1]))] = true
	var cells: Array[Vector2i] = []
	var cell_keys := PackedStringArray()
	for index in range(click_count):
		var cell := start_cell + EARTH_VEIN_OFFSETS[index % EARTH_VEIN_OFFSETS.size()]
		if not IsoMapModel.is_walkable(map_data, cell):
			return {
				"status": "failed",
				"reason": "target_not_walkable",
				"cell": IsoMapModel.cell_key(cell),
			}
		if interaction_cells.has(cell):
			return {
				"status": "failed",
				"reason": "target_is_interaction",
				"cell": IsoMapModel.cell_key(cell),
			}
		cells.append(cell)
		cell_keys.append(IsoMapModel.cell_key(cell))
	var serialized := "%s|%s|%s|%s" % [
		contract_id,
		str(map_data.get("id", "")),
		IsoMapModel.cell_key(start_cell),
		";".join(cell_keys),
	]
	return {
		"status": "passed",
		"contractId": contract_id,
		"cells": cells,
		"cellCount": cells.size(),
		"startCellKey": IsoMapModel.cell_key(start_cell),
		"finalCellKey": cell_keys[-1],
		"sequenceSha256": serialized.sha256_text(),
	}
