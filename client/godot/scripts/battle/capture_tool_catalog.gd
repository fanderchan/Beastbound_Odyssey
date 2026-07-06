extends RefCounted

const DATA_PATH := "res://data/capture_tools.json"
const EMPTY_HAND_ID := "empty_hand"
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


static func ordered_tool_ids() -> Array[String]:
	var result: Array[String] = []
	for tool in _tools():
		var tool_id := str(tool.get("id", ""))
		if tool_id != "":
			result.append(tool_id)
	return result


static func tool_ids_by_power(descending: bool = true) -> Array[String]:
	var ids := ordered_tool_ids()
	ids.sort_custom(func(left: String, right: String) -> bool:
		var left_power := capture_power_for(left)
		var right_power := capture_power_for(right)
		if left_power == right_power:
			return left < right
		return left_power > right_power if descending else left_power < right_power
	)
	return ids


static func tool_for_id(tool_id: String) -> Dictionary:
	var tool := _raw_tool_for_id(tool_id)
	return tool if not tool.is_empty() else _empty_hand_tool()


static func _raw_tool_for_id(tool_id: String) -> Dictionary:
	for tool in _tools():
		if str(tool.get("id", "")) == tool_id:
			return tool
	return {}


static func normalized_tool_id(tool_id: String) -> String:
	var normalized := tool_id.strip_edges()
	if normalized == "":
		return EMPTY_HAND_ID
	if _raw_tool_for_id(normalized).is_empty():
		return EMPTY_HAND_ID
	return normalized


static func label_for(tool_id: String, fallback: String = "空手") -> String:
	var tool := tool_for_id(normalized_tool_id(tool_id))
	return str(tool.get("label", fallback))


static func full_name_for(tool_id: String, fallback: String = "空手捕捉") -> String:
	var tool := tool_for_id(normalized_tool_id(tool_id))
	return str(tool.get("fullName", fallback))


static func menu_label_for(tool_id: String, fallback: String = "空手") -> String:
	var tool := tool_for_id(normalized_tool_id(tool_id))
	return str(tool.get("menuLabel", fallback))


static func chance_bonus_for(tool_id: String) -> float:
	var tool := tool_for_id(normalized_tool_id(tool_id))
	return clampf(float(tool.get("chanceBonus", 0.0)), 0.0, 0.8)


static func capture_power_for(tool_id: String) -> int:
	var tool := tool_for_id(normalized_tool_id(tool_id))
	return clampi(int(tool.get("capturePower", 1)), 1, 100)


static func is_consumable(tool_id: String) -> bool:
	var normalized := normalized_tool_id(tool_id)
	if normalized == EMPTY_HAND_ID:
		return false
	return bool(tool_for_id(normalized).get("consumable", true))


static func starting_inventory() -> Dictionary:
	var result := {}
	for tool in _tools():
		var tool_id := str(tool.get("id", ""))
		if tool_id == "" or not bool(tool.get("consumable", true)):
			continue
		result[tool_id] = maxi(0, int(tool.get("startingCount", 0)))
	return result


static func normalize_inventory(value) -> Dictionary:
	var result := starting_inventory()
	if value is Dictionary:
		for key in (value as Dictionary).keys():
			var tool_id := normalized_tool_id(str(key))
			if tool_id == EMPTY_HAND_ID or not is_consumable(tool_id):
				continue
			result[tool_id] = maxi(0, int((value as Dictionary).get(key, 0)))
	return result


static func count_for(inventory: Dictionary, tool_id: String) -> int:
	var normalized := normalized_tool_id(tool_id)
	if normalized == EMPTY_HAND_ID or not is_consumable(normalized):
		return 0
	return maxi(0, int(inventory.get(normalized, 0)))


static func can_use(inventory: Dictionary, tool_id: String) -> bool:
	var normalized := normalized_tool_id(tool_id)
	return normalized == EMPTY_HAND_ID or count_for(inventory, normalized) > 0


static func fallback_tool_ids_for(preferred_tool_id: String, inventory: Dictionary, include_unusable: bool = false) -> Array[String]:
	var preferred := normalized_tool_id(preferred_tool_id)
	var max_power := capture_power_for(preferred)
	var result: Array[String] = []
	for tool_id in tool_ids_by_power(true):
		if tool_id != preferred and not bool(tool_for_id(tool_id).get("generalFallback", true)):
			continue
		if capture_power_for(tool_id) > max_power:
			continue
		if not include_unusable and not can_use(inventory, tool_id):
			continue
		if not result.has(tool_id):
			result.append(tool_id)
	if not result.has(EMPTY_HAND_ID):
		result.append(EMPTY_HAND_ID)
	return result


static func best_available_fallback_tool(preferred_tool_id: String, inventory: Dictionary) -> String:
	var candidates := fallback_tool_ids_for(preferred_tool_id, inventory, false)
	return candidates[0] if not candidates.is_empty() else EMPTY_HAND_ID


static func consume(inventory: Dictionary, tool_id: String) -> Dictionary:
	var normalized := normalized_tool_id(tool_id)
	var next_inventory := normalize_inventory(inventory)
	if normalized != EMPTY_HAND_ID and is_consumable(normalized):
		next_inventory[normalized] = maxi(0, int(next_inventory.get(normalized, 0)) - 1)
	return next_inventory


static func chance_tier(chance: float) -> String:
	var normalized := clampf(chance, 0.0, 1.0)
	if normalized < 0.32:
		return "较低"
	if normalized < 0.52:
		return "一般"
	if normalized < 0.72:
		return "较高"
	return "很高"


static func _tools() -> Array[Dictionary]:
	var parsed := _data()
	var raw_tools = parsed.get("tools", [])
	var result: Array[Dictionary] = []
	if raw_tools is Array:
		for value in raw_tools:
			if value is Dictionary:
				var tool := value as Dictionary
				if str(tool.get("id", "")) != "":
					result.append(tool)
	if result.is_empty():
		result.append(_empty_hand_tool())
	return result


static func _data() -> Dictionary:
	if data_cache_loaded:
		return data_cache
	data_cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		data_cache = {}
		return data_cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	data_cache = parsed as Dictionary if parsed is Dictionary else {}
	return data_cache


static func _empty_hand_tool() -> Dictionary:
	return {
		"id": EMPTY_HAND_ID,
		"label": "空手",
		"fullName": "空手捕捉",
		"menuLabel": "空手",
		"consumable": false,
		"startingCount": 0,
		"capturePower": 1,
		"chanceBonus": 0.0,
	}
