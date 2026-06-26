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
		for map_id in map_ids:
			if not known_lookup.is_empty() and not known_lookup.has(map_id):
				errors.append("%s.mapIds 包含未知地图: %s" % [region_id, map_id])
		if region_type == "village":
			var facilities := _string_array(region.get("facilities", []))
			for required in ["healer", "item_shop", "equipment_shop", "stable", "record_point"]:
				if not facilities.has(required):
					errors.append("%s 缺少村庄设施: %s" % [region_id, required])
		if region_type == "dungeon" and str(region.get("bossMode", "")).strip_edges() == "":
			errors.append("%s 缺少 bossMode" % region_id)
	return errors


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item).strip_edges()
			if text != "" and not result.has(text):
				result.append(text)
	return result
