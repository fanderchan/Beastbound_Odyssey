extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")


static func encounter_zones(map_data: Dictionary) -> Array:
	return map_data.get("encounterZones", [])


static func zone_for_cell(map_data: Dictionary, cell: Vector2i) -> Dictionary:
	for value in encounter_zones(map_data):
		var zone := value as Dictionary
		if zone_contains_cell(zone, cell):
			return zone
	return {}


static func zone_contains_cell(zone: Dictionary, cell: Vector2i) -> bool:
	var cells: Array = zone.get("cells", [])
	for value in cells:
		var cell_array := value as Array
		if cell == Vector2i(int(cell_array[0]), int(cell_array[1])):
			return true
	var rects: Array = zone.get("rects", [])
	for value in rects:
		var rect := value as Array
		var origin := Vector2i(int(rect[0]), int(rect[1]))
		var size := Vector2i(int(rect[2]), int(rect[3]))
		if cell.x >= origin.x and cell.y >= origin.y and cell.x < origin.x + size.x and cell.y < origin.y + size.y:
			return true
	return false


static func cells_for_zone(zone: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var cells: Array = zone.get("cells", [])
	for value in cells:
		var cell_array := value as Array
		result.append(Vector2i(int(cell_array[0]), int(cell_array[1])))
	var rects: Array = zone.get("rects", [])
	for value in rects:
		var rect := value as Array
		var origin := Vector2i(int(rect[0]), int(rect[1]))
		var size := Vector2i(int(rect[2]), int(rect[3]))
		for y in range(origin.y, origin.y + size.y):
			for x in range(origin.x, origin.x + size.x):
				var cell := Vector2i(x, y)
				if not result.has(cell):
					result.append(cell)
	return result


static func first_walkable_cell(map_data: Dictionary, zone: Dictionary) -> Vector2i:
	for cell in cells_for_zone(zone):
		if IsoMapModel.is_walkable(map_data, cell):
			return cell
	return IsoMapModel.spawn_cell(map_data)


static func encounter_rate(zone: Dictionary) -> float:
	return clampf(float(zone.get("encounterRate", 0.0)), 0.0, 1.0)
