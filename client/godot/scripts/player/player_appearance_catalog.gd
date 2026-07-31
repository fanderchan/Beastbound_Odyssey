extends RefCounted

const CATALOG_PATH := "res://data/player_appearances.json"

static var _catalog_loaded := false
static var _entries: Array[Dictionary] = []
static var _errors: Array[String] = []


static func creation_entries() -> Array[Dictionary]:
	_ensure_loaded()
	return _entries.duplicate(true)


static func appearance_ids() -> Array[String]:
	_ensure_loaded()
	var result: Array[String] = []
	for entry in _entries:
		result.append(str(entry.get("appearanceId", "")))
	return result


static func entry(appearance_id: String) -> Dictionary:
	_ensure_loaded()
	var normalized := appearance_id.strip_edges()
	for value in _entries:
		if str(value.get("appearanceId", "")) == normalized:
			return value.duplicate(true)
	return {}


static func display_name(appearance_id: String) -> String:
	var value := entry(appearance_id)
	return str(value.get("displayName", "未知形象"))


static func visual_sources() -> Dictionary:
	_ensure_loaded()
	var result: Dictionary = {}
	for value in _entries:
		var appearance_id := str(value.get("appearanceId", ""))
		if appearance_id == "":
			continue
		result[appearance_id] = {
			"portraitTexturePath": str(value.get("portraitTexturePath", "")),
			"showcaseTexturePath": str(value.get("showcaseTexturePath", "")),
		}
	return result


static func contract_errors() -> Array[String]:
	_ensure_loaded()
	return _errors.duplicate()


static func _ensure_loaded() -> void:
	if _catalog_loaded:
		return
	_catalog_loaded = true
	_entries.clear()
	_errors.clear()
	if not FileAccess.file_exists(CATALOG_PATH):
		_errors.append("缺少人物形象目录")
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_PATH))
	if not (parsed is Dictionary):
		_errors.append("人物形象目录格式无效")
		return
	var root := parsed as Dictionary
	var values = root.get("appearances", [])
	if not (values is Array):
		_errors.append("人物形象列表格式无效")
		return
	var seen: Dictionary = {}
	for raw_value in values as Array:
		if not (raw_value is Dictionary):
			_errors.append("人物形象条目格式无效")
			continue
		var raw := raw_value as Dictionary
		if not bool(raw.get("selectable", false)):
			continue
		var appearance_id := str(raw.get("appearanceId", "")).strip_edges()
		var display_name_value := str(raw.get("displayName", "")).strip_edges()
		var portrait_path := str(raw.get("portraitTexturePath", "")).strip_edges()
		var showcase_path := str(raw.get("showcaseTexturePath", "")).strip_edges()
		if appearance_id == "" or seen.has(appearance_id):
			_errors.append("人物形象ID缺失或重复")
			continue
		if display_name_value == "" or portrait_path == "" or showcase_path == "":
			_errors.append("人物形象%s的创建页资料不完整" % appearance_id)
			continue
		seen[appearance_id] = true
		_entries.append({
			"appearanceId": appearance_id,
			"displayName": display_name_value,
			"creationOrder": int(raw.get("creationOrder", _entries.size())),
			"portraitTexturePath": portrait_path,
			"showcaseTexturePath": showcase_path,
			"characterAssetRoot": str(raw.get("characterAssetRoot", "")),
		})
	_entries.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		return int(left.get("creationOrder", 0)) < int(right.get("creationOrder", 0))
	)
