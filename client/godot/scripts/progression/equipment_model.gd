extends RefCounted

const DATA_PATH := "res://data/equipment_items.json"
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const SLOT_ACCESSORY_LEFT := "accessory_left"
const SLOT_ACCESSORY_RIGHT := "accessory_right"
const SLOT_HEAD := "head"
const SLOT_LEFT_HAND_WEAPON := "left_hand_weapon"
const SLOT_BODY := "body"
const SLOT_RIGHT_HAND_WEAPON := "right_hand_weapon"
const SLOT_HANDS := "hands"
const SLOT_FEET := "feet"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const DEFAULT_DURABILITY_MAX := 30
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


static func slots() -> Array[Dictionary]:
	var parsed := _data()
	var raw_slots = parsed.get("slots", [])
	var result: Array[Dictionary] = []
	if raw_slots is Array:
		for value in raw_slots:
			if value is Dictionary and str((value as Dictionary).get("id", "")) != "":
				result.append(value as Dictionary)
	return result


static func slot_ids() -> Array[String]:
	var result: Array[String] = []
	for slot in slots():
		var slot_id := str(slot.get("id", ""))
		if slot_id != "":
			result.append(slot_id)
	return result


static func slot_label_for(slot_id: String) -> String:
	for slot in slots():
		if str(slot.get("id", "")) == slot_id:
			return str(slot.get("label", slot_id))
	return slot_id


static func items() -> Array[Dictionary]:
	var parsed := _data()
	var raw_items = parsed.get("items", [])
	var result: Array[Dictionary] = []
	if raw_items is Array:
		for value in raw_items:
			if value is Dictionary and str((value as Dictionary).get("id", "")) != "":
				result.append(value as Dictionary)
	return result


static func item_for_id(item_id: String) -> Dictionary:
	for item in items():
		if str(item.get("id", "")) == item_id:
			return item
	return {}


static func is_equipment(item_id: String) -> bool:
	return not item_for_id(item_id).is_empty()


static func slot_for(item_id: String) -> String:
	return str(item_for_id(item_id).get("slot", ""))


static func label_for(item_id: String, fallback: String = "装备") -> String:
	var item := item_for_id(item_id)
	if item.is_empty():
		return fallback
	return str(item.get("label", fallback))


static func menu_label_for(item_id: String, fallback: String = "装备") -> String:
	var item := item_for_id(item_id)
	if item.is_empty():
		return fallback
	return str(item.get("menuLabel", label_for(item_id, fallback)))


static func stats_for(item_id: String) -> Dictionary:
	var item := item_for_id(item_id)
	var raw_stats = item.get("stats", {})
	if not (raw_stats is Dictionary):
		return {}
	var result := {}
	for key in STAT_KEYS:
		var amount := int((raw_stats as Dictionary).get(key, 0))
		if amount != 0:
			result[key] = amount
	return result


static func spirit_ids_for(item_id: String) -> Array[String]:
	var item := item_for_id(item_id)
	var raw_spirits = item.get("spiritIds", [])
	var result: Array[String] = []
	if raw_spirits is Array:
		for value in raw_spirits:
			var spirit_id := str(value)
			if spirit_id == "" or result.has(spirit_id):
				continue
			var action := BattleActionCatalog.action_by_id(spirit_id)
			if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_SPIRIT:
				continue
			result.append(spirit_id)
	return result


static func spirit_text_for(item_id: String) -> String:
	var parts: Array[String] = []
	for spirit_id in spirit_ids_for(item_id):
		parts.append(BattleActionCatalog.label_for(spirit_id, spirit_id))
	return "、".join(parts)


static func required_level_for(item_id: String) -> int:
	return maxi(1, int(item_for_id(item_id).get("requiredLevel", 1)))


static func requirement_text_for(item_id: String) -> String:
	var required_level := required_level_for(item_id)
	return "需求: Lv%d" % required_level if required_level > 1 else ""


static func max_durability_for(item_id: String) -> int:
	if not is_equipment(item_id):
		return 0
	return maxi(1, int(item_for_id(item_id).get("durabilityMax", DEFAULT_DURABILITY_MAX)))


static func stat_bonus_text_for(item_id: String) -> String:
	var stats := stats_for(item_id)
	var parts: Array[String] = []
	for key in STAT_KEYS:
		var amount := int(stats.get(key, 0))
		if amount == 0:
			continue
		parts.append("%s %s%d" % [_stat_label_for(key), "+" if amount > 0 else "", amount])
	return "、".join(parts)


static func stat_label_for(key: String) -> String:
	return _stat_label_for(key)


static func detail_lines_for_item(item_id: String) -> Array[String]:
	var item := item_for_id(item_id)
	if item.is_empty():
		return []
	var lines: Array[String] = [
		"装备槽: %s" % slot_label_for(slot_for(item_id)),
	]
	var requirement_text := requirement_text_for(item_id)
	if requirement_text != "":
		lines.append(requirement_text)
	var durability_max := max_durability_for(item_id)
	if durability_max > 0:
		lines.append("耐久上限: %d" % durability_max)
	var stat_text := stat_bonus_text_for(item_id)
	if stat_text != "":
		lines.append("效果: %s" % stat_text)
	var spirit_text := spirit_text_for(item_id)
	if spirit_text != "":
		lines.append("精灵: %s" % spirit_text)
	var description := str(item.get("description", "")).strip_edges()
	if description != "":
		lines.append(description)
	return lines


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var parsed := _data()
	if parsed.is_empty():
		errors.append("equipment_items.json 缺失或不是 JSON 对象")
		return errors
	if int(parsed.get("schemaVersion", 0)) != 1:
		errors.append("equipment_items.json schemaVersion 当前必须是 1")
	var slot_ids_seen := {}
	for slot in slots():
		var slot_id := str(slot.get("id", ""))
		if slot_ids_seen.has(slot_id):
			errors.append("装备槽重复: %s" % slot_id)
		slot_ids_seen[slot_id] = true
	var item_ids_seen := {}
	for item in items():
		var item_id := str(item.get("id", ""))
		if item_ids_seen.has(item_id):
			errors.append("装备 ID 重复: %s" % item_id)
		item_ids_seen[item_id] = true
		var slot_id := str(item.get("slot", ""))
		if slot_id == "" or not slot_ids_seen.has(slot_id):
			errors.append("%s.slot 指向不存在装备槽: %s" % [item_id, slot_id])
		if int(item.get("requiredLevel", 1)) < 1:
			errors.append("%s.requiredLevel 必须大于等于 1" % item_id)
		if int(item.get("durabilityMax", DEFAULT_DURABILITY_MAX)) < 1:
			errors.append("%s.durabilityMax 必须大于等于 1" % item_id)
		var raw_spirits = item.get("spiritIds", [])
		if raw_spirits is Array:
			for value in raw_spirits:
				var spirit_id := str(value)
				var action := BattleActionCatalog.action_by_id(spirit_id)
				if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_SPIRIT:
					errors.append("%s.spiritIds 包含无效精灵: %s" % [item_id, spirit_id])
	return errors


static func _stat_label_for(key: String) -> String:
	match key:
		"maxHp":
			return "生命"
		"attack":
			return "攻击"
		"defense":
			return "防御"
		"quick":
			return "敏捷"
	return key


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
