extends RefCounted
class_name MapAwakenedPresenter

const MODE_LOCAL := "local"
const MODE_WORLD := "world"


static func build_view_state(
	current_map_id: String,
	current_map_name: String,
	player_cell: Vector2i,
	target_cell_value,
	local_targets: Array[Dictionary],
	regions: Array[Dictionary],
	map_names: Dictionary
) -> Dictionary:
	var current_region := _region_for_map(regions, current_map_id)
	var target_text := "无"
	if target_cell_value is Vector2i:
		var target_cell := target_cell_value as Vector2i
		if target_cell.x >= 0 and target_cell.y >= 0:
			target_text = "%d,%d" % [target_cell.x, target_cell.y]
	var normalized_targets: Array[Dictionary] = []
	for target in local_targets:
		var entry := target.duplicate(true)
		entry["displayText"] = str(entry.get("displayText", entry.get("label", "目标")))
		normalized_targets.append(entry)
	return {
		"mode": MODE_LOCAL,
		"currentMapId": current_map_id,
		"currentMapName": current_map_name if current_map_name != "" else current_map_id,
		"playerCell": player_cell,
		"targetText": target_text,
		"localTargets": normalized_targets,
		"currentRegion": _region_state(current_region, current_map_id, map_names),
		"worldRegions": _world_region_states(regions, current_map_id, map_names),
	}


static func player_facing_summary(state: Dictionary) -> String:
	return "地图：%s\n坐标：%d,%d    目标：%s" % [
		str(state.get("currentMapName", "未知地图")),
		int((state.get("playerCell", Vector2i.ZERO) as Vector2i).x),
		int((state.get("playerCell", Vector2i.ZERO) as Vector2i).y),
		str(state.get("targetText", "无")),
	]


static func region_level_text(region: Dictionary) -> String:
	var level_range_value = region.get("levelRange", {})
	if not (level_range_value is Dictionary):
		return "生活区域"
	var level_range := level_range_value as Dictionary
	var min_level := int(level_range.get("min", 0))
	var max_level := int(level_range.get("max", 0))
	if min_level <= 0 or max_level <= 0:
		return "生活区域"
	if min_level == max_level:
		return "推荐 Lv%d" % min_level
	return "推荐 Lv%d–%d" % [min_level, max_level]


static func _world_region_states(
	regions: Array[Dictionary],
	current_map_id: String,
	map_names: Dictionary
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var current_region := _region_for_map(regions, current_map_id)
	var current_region_id := str(current_region.get("id", ""))
	for region in regions:
		if str(region.get("type", "")) == "gm":
			continue
		var state := _region_state(region, current_map_id, map_names)
		state["current"] = str(region.get("id", "")) == current_region_id
		result.append(state)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if bool(a.get("current", false)) != bool(b.get("current", false)):
			return bool(a.get("current", false))
		var rank_a := _region_type_rank(str(a.get("type", "")))
		var rank_b := _region_type_rank(str(b.get("type", "")))
		if rank_a != rank_b:
			return rank_a < rank_b
		return str(a.get("label", "")) < str(b.get("label", ""))
	)
	return result


static func _region_state(
	region: Dictionary,
	current_map_id: String,
	map_names: Dictionary
) -> Dictionary:
	if region.is_empty():
		return {}
	var entry_map_id := str(region.get("entryMapId", ""))
	return {
		"id": str(region.get("id", "")),
		"label": str(region.get("label", "未知区域")),
		"type": str(region.get("type", "field")),
		"entryMapId": entry_map_id,
		"entryMapName": str(map_names.get(entry_map_id, entry_map_id)),
		"levelText": region_level_text(region),
		"mapCount": _string_array(region.get("mapIds", [])).size(),
		"current": _string_array(region.get("mapIds", [])).has(current_map_id),
		"points": _region_points(region, current_map_id, map_names),
	}


static func _region_points(
	region: Dictionary,
	current_map_id: String,
	map_names: Dictionary
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var sub_dungeons_value = region.get("subDungeons", [])
	if sub_dungeons_value is Array and not (sub_dungeons_value as Array).is_empty():
		for value in sub_dungeons_value as Array:
			if not (value is Dictionary):
				continue
			var sub := value as Dictionary
			var map_id := str(sub.get("entryMapId", ""))
			var floor_count := _string_array(sub.get("floorOrder", [])).size()
			var level_text := _level_text_from_range(sub.get("recommendedLevelRange", {}))
			result.append({
				"id": "sub:%s" % str(sub.get("id", map_id)),
				"mapId": map_id,
				"label": str(sub.get("label", map_names.get(map_id, map_id))),
				"meta": "%d层%s" % [floor_count, " · %s" % level_text if level_text != "" else ""],
				"current": _string_array(sub.get("floorOrder", [])).has(current_map_id),
			})
		return result

	var floor_order := _string_array(region.get("floorOrder", []))
	var map_ids := floor_order if not floor_order.is_empty() else _string_array(region.get("mapIds", []))
	var shared_map_ids := _string_array(region.get("sharedMapIds", []))
	var entry_map_id := str(region.get("entryMapId", ""))
	for map_id in map_ids:
		if shared_map_ids.has(map_id) and map_id != entry_map_id and map_id != current_map_id:
			continue
		result.append({
			"id": "map:%s" % map_id,
			"mapId": map_id,
			"label": str(map_names.get(map_id, map_id)),
			"meta": "当前所在" if map_id == current_map_id else "自动寻路",
			"current": map_id == current_map_id,
		})
	return result


static func _region_for_map(regions: Array[Dictionary], map_id: String) -> Dictionary:
	var first_match: Dictionary = {}
	for region in regions:
		if not _string_array(region.get("mapIds", [])).has(map_id):
			continue
		if first_match.is_empty():
			first_match = region
		if str(region.get("type", "")) == "village":
			return region
	return first_match


static func _region_type_rank(region_type: String) -> int:
	match region_type:
		"village":
			return 0
		"field":
			return 1
		"dungeon":
			return 2
	return 3


static func _level_text_from_range(value) -> String:
	if not (value is Dictionary):
		return ""
	var level_range := value as Dictionary
	var min_level := int(level_range.get("min", 0))
	var max_level := int(level_range.get("max", 0))
	if min_level <= 0 or max_level <= 0:
		return ""
	return "Lv%d–%d" % [min_level, max_level]


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			var text := str(item).strip_edges()
			if text != "" and not result.has(text):
				result.append(text)
	return result
