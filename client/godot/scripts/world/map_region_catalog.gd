extends RefCounted

const DATA_PATH := "res://data/map_regions.json"
const VALID_TYPES: Array[String] = ["village", "field", "dungeon", "gm"]
static var cache_loaded: bool = false
static var cache: Dictionary = {}


static func catalog() -> Dictionary:
	if cache_loaded:
		return cache
	cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		cache = {}
		return cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	cache = parsed as Dictionary if parsed is Dictionary else {}
	return cache


static func regions() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_regions = catalog().get("regions", [])
	if raw_regions is Array:
		for value in raw_regions:
			if value is Dictionary and str((value as Dictionary).get("id", "")).strip_edges() != "":
				result.append((value as Dictionary).duplicate(true))
	return result


static func region_for_id(region_id: String) -> Dictionary:
	var normalized_id := region_id.strip_edges()
	for region in regions():
		if str(region.get("id", "")) == normalized_id:
			return region
	return {}


static func map_ids_for_region(region_id: String) -> Array[String]:
	return _string_array(region_for_id(region_id).get("mapIds", []))


static func entry_map_id_for_region(region_id: String) -> String:
	return str(region_for_id(region_id).get("entryMapId", "")).strip_edges()


static func boss_map_id_for_region(region_id: String) -> String:
	return str(region_for_id(region_id).get("bossMapId", "")).strip_edges()


static func floor_order_for_region(region_id: String) -> Array[String]:
	return _string_array(region_for_id(region_id).get("floorOrder", []))


static func sub_dungeons_for_region(region_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw = region_for_id(region_id).get("subDungeons", [])
	if raw is Array:
		for value in raw:
			if value is Dictionary and str((value as Dictionary).get("id", "")).strip_edges() != "":
				result.append((value as Dictionary).duplicate(true))
	return result


static func safe_return_for_region(region_id: String) -> Dictionary:
	var value = region_for_id(region_id).get("safeReturn", {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func region_for_map_id(map_id: String) -> Dictionary:
	var normalized_map_id := map_id.strip_edges()
	for region in regions():
		if _string_array(region.get("mapIds", [])).has(normalized_map_id):
			return region
	return {}


static func validation_errors(known_map_ids: Array[String] = []) -> Array[String]:
	var errors: Array[String] = []
	var loaded := catalog()
	if loaded.is_empty():
		return ["map_regions.json 缺失或不是 JSON 对象"]
	if int(loaded.get("schemaVersion", 0)) != 1:
		errors.append("map_regions.json schemaVersion 当前必须是 1")
	var seen_ids := {}
	var seen_map_regions := {}
	var known_lookup := {}
	for map_id in known_map_ids:
		known_lookup[str(map_id)] = true
	for region in regions():
		var region_id := str(region.get("id", "")).strip_edges()
		if region_id == "":
			errors.append("区域 id 不能为空")
			continue
		if seen_ids.has(region_id):
			errors.append("区域 id 重复: %s" % region_id)
		seen_ids[region_id] = true
		var region_type := str(region.get("type", "")).strip_edges()
		if not VALID_TYPES.has(region_type):
			errors.append("%s.type 无效: %s" % [region_id, region_type])
		if str(region.get("label", "")).strip_edges() == "":
			errors.append("%s.label 不能为空" % region_id)
		var map_ids := _string_array(region.get("mapIds", []))
		if map_ids.is_empty():
			errors.append("%s.mapIds 不能为空" % region_id)
		var shared_map_ids := _string_array(region.get("sharedMapIds", []))
		for map_id in map_ids:
			if not known_lookup.is_empty() and not known_lookup.has(map_id):
				errors.append("%s.mapIds 包含未知地图: %s" % [region_id, map_id])
			if seen_map_regions.has(map_id) and not shared_map_ids.has(map_id):
				var previous_region := str(seen_map_regions.get(map_id, ""))
				var previous_shared := _string_array(region_for_id(previous_region).get("sharedMapIds", []))
				if not previous_shared.has(map_id):
					errors.append("%s.mapIds 与 %s 重复但未声明 sharedMapIds: %s" % [region_id, previous_region, map_id])
			if not seen_map_regions.has(map_id):
				seen_map_regions[map_id] = region_id
		var entry_map_id := str(region.get("entryMapId", "")).strip_edges()
		if entry_map_id == "":
			errors.append("%s.entryMapId 不能为空" % region_id)
		elif not map_ids.has(entry_map_id):
			errors.append("%s.entryMapId 不在 mapIds 内: %s" % [region_id, entry_map_id])
		errors.append_array(_level_range_validation_errors(region.get("levelRange", {}), "%s.levelRange" % region_id, false))
		errors.append_array(_safe_return_validation_errors(region.get("safeReturn", {}), "%s.safeReturn" % region_id, known_lookup))
		if region_type == "village":
			var facilities := _string_array(region.get("facilities", []))
			for required in ["healer", "item_shop", "equipment_shop", "stable", "record_point"]:
				if not facilities.has(required):
					errors.append("%s 缺少村庄设施: %s" % [region_id, required])
			var record_point := region.get("recordPoint", {}) as Dictionary if region.get("recordPoint", {}) is Dictionary else {}
			if str(record_point.get("mapId", "")).strip_edges() == "" or str(record_point.get("spawnName", "")).strip_edges() == "":
				errors.append("%s.recordPoint 缺少 mapId 或 spawnName" % region_id)
		if region_type == "dungeon":
			if str(region.get("bossMode", "")).strip_edges() == "":
				errors.append("%s 缺少 bossMode" % region_id)
			var boss_map_id := str(region.get("bossMapId", "")).strip_edges()
			if boss_map_id == "":
				errors.append("%s.bossMapId 不能为空" % region_id)
			elif not map_ids.has(boss_map_id):
				errors.append("%s.bossMapId 不在 mapIds 内: %s" % [region_id, boss_map_id])
			var floor_order := _string_array(region.get("floorOrder", []))
			if not floor_order.is_empty():
				for floor_map_id in floor_order:
					if not map_ids.has(floor_map_id):
						errors.append("%s.floorOrder 包含不属于本区域的地图: %s" % [region_id, floor_map_id])
			var capture_map_ids := _string_array(region.get("captureMapIds", []))
			for capture_map_id in capture_map_ids:
				if not map_ids.has(capture_map_id):
					errors.append("%s.captureMapIds 包含不属于本区域的地图: %s" % [region_id, capture_map_id])
			errors.append_array(_sub_dungeon_validation_errors(region_id, region, map_ids))
	return errors


static func _sub_dungeon_validation_errors(region_id: String, region: Dictionary, region_map_ids: Array[String]) -> Array[String]:
	var errors: Array[String] = []
	var raw = region.get("subDungeons", [])
	if not (raw is Array):
		return errors
	var seen_sub_ids := {}
	for index in range((raw as Array).size()):
		var value = (raw as Array)[index]
		if not (value is Dictionary):
			errors.append("%s.subDungeons[%d] 必须是对象" % [region_id, index])
			continue
		var sub := value as Dictionary
		var sub_id := str(sub.get("id", "")).strip_edges()
		var path := "%s.subDungeons[%d]" % [region_id, index]
		if sub_id == "":
			errors.append("%s.id 不能为空" % path)
		elif seen_sub_ids.has(sub_id):
			errors.append("%s.subDungeons id 重复: %s" % [region_id, sub_id])
		seen_sub_ids[sub_id] = true
		if str(sub.get("label", "")).strip_edges() == "":
			errors.append("%s.label 不能为空" % path)
		var floor_order := _string_array(sub.get("floorOrder", []))
		if floor_order.is_empty():
			errors.append("%s.floorOrder 不能为空" % path)
		for map_id in floor_order:
			if not region_map_ids.has(map_id):
				errors.append("%s.floorOrder 包含不属于区域的地图: %s" % [path, map_id])
		var entry_map_id := str(sub.get("entryMapId", "")).strip_edges()
		if entry_map_id == "" or not floor_order.has(entry_map_id):
			errors.append("%s.entryMapId 必须在 floorOrder 内" % path)
		var boss_map_id := str(sub.get("bossMapId", "")).strip_edges()
		if boss_map_id == "" or not floor_order.has(boss_map_id):
			errors.append("%s.bossMapId 必须在 floorOrder 内" % path)
		if str(sub.get("guardianInteractionId", "")).strip_edges() == "":
			errors.append("%s.guardianInteractionId 不能为空" % path)
		if str(sub.get("encounterGroupId", "")).strip_edges() == "":
			errors.append("%s.encounterGroupId 不能为空" % path)
		errors.append_array(_level_range_validation_errors(sub.get("recommendedLevelRange", {}), "%s.recommendedLevelRange" % path, true))
	return errors


static func _level_range_validation_errors(value, path: String, required: bool) -> Array[String]:
	var errors: Array[String] = []
	if not (value is Dictionary):
		if required:
			errors.append("%s 不能为空" % path)
		return errors
	var range := value as Dictionary
	if range.is_empty():
		if required:
			errors.append("%s 不能为空" % path)
		return errors
	var min_level := int(range.get("min", 0))
	var max_level := int(range.get("max", 0))
	if min_level < 0 or max_level < min_level:
		errors.append("%s 等级区间无效" % path)
	return errors


static func _safe_return_validation_errors(value, path: String, known_lookup: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if not (value is Dictionary):
		return errors
	var safe_return := value as Dictionary
	if safe_return.is_empty():
		return errors
	var map_id := str(safe_return.get("mapId", "")).strip_edges()
	var spawn_name := str(safe_return.get("spawnName", "")).strip_edges()
	if map_id == "" or spawn_name == "":
		errors.append("%s 缺少 mapId 或 spawnName" % path)
	elif not known_lookup.is_empty() and not known_lookup.has(map_id):
		errors.append("%s.mapId 指向未知地图: %s" % [path, map_id])
	return errors


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item).strip_edges()
			if text != "" and not result.has(text):
				result.append(text)
	return result
