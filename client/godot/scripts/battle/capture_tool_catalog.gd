extends RefCounted

const DATA_PATH := "res://data/capture_tools.json"
const EMPTY_HAND_ID := "empty_hand"


static func ordered_tool_ids() -> Array[String]:
	var result: Array[String] = []
	for tool in _tools():
		var tool_id := str(tool.get("id", ""))
		if tool_id != "":
			result.append(tool_id)
	return result


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
	if not FileAccess.file_exists(DATA_PATH):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	return parsed as Dictionary if parsed is Dictionary else {}


static func _empty_hand_tool() -> Dictionary:
	return {
		"id": EMPTY_HAND_ID,
		"label": "空手",
		"fullName": "空手捕捉",
		"menuLabel": "空手",
		"consumable": false,
		"startingCount": 0,
		"chanceBonus": 0.0,
	}
