extends RefCounted

const DATA_PATH := "res://data/bag_items.json"
const SLOT_LIMIT := 15
const CONTEXT_BATTLE_ITEM := "battle_item"
const CONTEXT_CAPTURE := "capture"
const CONTEXT_WORLD_PET_HEAL := "world_pet_heal"
const CONTEXT_WORLD_ENCOUNTER_STONE := "world_encounter_stone"
const CONTEXT_EQUIPMENT := "equipment"


static func items() -> Array[Dictionary]:
	var parsed := _data()
	var raw_items = parsed.get("items", [])
	var result: Array[Dictionary] = []
	if raw_items is Array:
		for value in raw_items:
			if value is Dictionary:
				var item := value as Dictionary
				if str(item.get("id", "")) != "":
					result.append(item)
	return result


static func item_for_id(item_id: String) -> Dictionary:
	for item in items():
		if str(item.get("id", "")) == item_id:
			return item
	return {}


static func label_for(item_id: String, fallback: String = "物品") -> String:
	var item := item_for_id(item_id)
	if item.is_empty():
		return fallback
	var label := str(item.get("label", ""))
	return label if label != "" else fallback


static func menu_label_for(item_id: String, fallback: String = "物品") -> String:
	var item := item_for_id(item_id)
	if item.is_empty():
		return fallback
	var label := str(item.get("menuLabel", ""))
	return label if label != "" else label_for(item_id, fallback)


static func stack_limit_for(item_id: String) -> int:
	var item := item_for_id(item_id)
	return maxi(1, int(item.get("stackLimit", 1)))


static func use_contexts_for(item_id: String) -> Array[String]:
	var item := item_for_id(item_id)
	var raw_contexts = item.get("useContexts", [])
	var result: Array[String] = []
	if raw_contexts is Array:
		for value in raw_contexts:
			var context := str(value)
			if context != "" and not result.has(context):
				result.append(context)
	return result


static func item_has_context(item_id: String, context: String) -> bool:
	return use_contexts_for(item_id).has(context)


static func item_ids_for_context(context: String) -> Array[String]:
	var result: Array[String] = []
	for item in items():
		var item_id := str(item.get("id", ""))
		if item_id != "" and item_has_context(item_id, context):
			result.append(item_id)
	return result


static func battle_action_id_for(item_id: String) -> String:
	var item := item_for_id(item_id)
	return str(item.get("battleActionId", item_id))


static func capture_tool_id_for(item_id: String) -> String:
	var item := item_for_id(item_id)
	return str(item.get("captureToolId", ""))


static func world_use_for(item_id: String) -> Dictionary:
	var item := item_for_id(item_id)
	var raw_world_use = item.get("worldUse", {})
	return raw_world_use as Dictionary if raw_world_use is Dictionary else {}


static func world_heal_amount_for(item_id: String) -> int:
	var world_use := world_use_for(item_id)
	if str(world_use.get("type", "")) != "pet_heal":
		return 0
	return maxi(0, int(world_use.get("amount", 0)))


static func item_can_world_pet_heal(item_id: String) -> bool:
	return item_has_context(item_id, CONTEXT_WORLD_PET_HEAL) and world_heal_amount_for(item_id) > 0


static func world_encounter_interval_for(item_id: String) -> float:
	var world_use := world_use_for(item_id)
	if str(world_use.get("type", "")) != "encounter_stone":
		return 0.0
	return maxf(0.0, float(world_use.get("intervalSeconds", 0.0)))


static func world_encounter_duration_for(item_id: String) -> float:
	var world_use := world_use_for(item_id)
	if str(world_use.get("type", "")) != "encounter_stone":
		return 0.0
	return maxf(0.0, float(world_use.get("durationSeconds", 0.0)))


static func item_can_world_encounter_stone(item_id: String) -> bool:
	return (
		item_has_context(item_id, CONTEXT_WORLD_ENCOUNTER_STONE)
		and world_encounter_interval_for(item_id) > 0.0
		and world_encounter_duration_for(item_id) > 0.0
	)


static func starting_slots() -> Array[Dictionary]:
	var counts := {}
	for item in items():
		var item_id := str(item.get("id", ""))
		var count := maxi(0, int(item.get("startingCount", 0)))
		if item_id != "" and count > 0:
			counts[item_id] = count
	return slots_from_counts(counts)


static func normalize_slots(value) -> Array[Dictionary]:
	var counts := {}
	if value is Array:
		for raw_slot in value:
			if not (raw_slot is Dictionary):
				continue
			var slot := raw_slot as Dictionary
			var item_id := str(slot.get("itemId", ""))
			if item_id == "" or item_for_id(item_id).is_empty():
				continue
			var count := maxi(0, int(slot.get("count", 0)))
			if count <= 0:
				continue
			counts[item_id] = int(counts.get(item_id, 0)) + count
	return slots_from_counts(counts)


static func slots_from_counts(counts: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for item in items():
		var item_id := str(item.get("id", ""))
		if item_id == "":
			continue
		var remaining := maxi(0, int(counts.get(item_id, 0)))
		var stack_limit := stack_limit_for(item_id)
		while remaining > 0 and result.size() < SLOT_LIMIT:
			var stack_count := mini(remaining, stack_limit)
			result.append({
				"itemId": item_id,
				"count": stack_count,
			})
			remaining -= stack_count
	while result.size() < SLOT_LIMIT:
		result.append({})
	return result


static func item_count(slots: Array[Dictionary], item_id: String) -> int:
	var total := 0
	for slot in normalize_slots(slots):
		if str(slot.get("itemId", "")) == item_id:
			total += maxi(0, int(slot.get("count", 0)))
	return total


static func available_capacity_for(slots: Array[Dictionary], item_id: String) -> int:
	if item_for_id(item_id).is_empty():
		return 0
	var total := 0
	var stack_limit := stack_limit_for(item_id)
	for slot in normalize_slots(slots):
		var slot_item_id := str(slot.get("itemId", ""))
		if slot_item_id == item_id:
			total += maxi(0, stack_limit - maxi(0, int(slot.get("count", 0))))
		elif slot_item_id == "":
			total += stack_limit
	return total


static func counts_for_context(slots: Array[Dictionary], context: String) -> Dictionary:
	var result := {}
	for slot in normalize_slots(slots):
		var item_id := str(slot.get("itemId", ""))
		if item_id == "" or not item_has_context(item_id, context):
			continue
		result[item_id] = int(result.get(item_id, 0)) + maxi(0, int(slot.get("count", 0)))
	return result


static func set_item_count(slots: Array[Dictionary], item_id: String, count: int) -> Array[Dictionary]:
	if item_for_id(item_id).is_empty():
		return normalize_slots(slots)
	var counts := counts_by_item(slots)
	var next_count := maxi(0, count)
	if next_count > 0:
		counts[item_id] = next_count
	else:
		counts.erase(item_id)
	return slots_from_counts(counts)


static func set_counts_for_context(slots: Array[Dictionary], context: String, counts: Dictionary) -> Array[Dictionary]:
	var next_counts := counts_by_item(slots)
	for item_id in item_ids_for_context(context):
		var next_count := maxi(0, int(counts.get(item_id, 0)))
		if next_count > 0:
			next_counts[item_id] = next_count
		else:
			next_counts.erase(item_id)
	return slots_from_counts(next_counts)


static func consume(slots: Array[Dictionary], item_id: String, amount: int = 1) -> Array[Dictionary]:
	return set_item_count(slots, item_id, item_count(slots, item_id) - maxi(1, amount))


static func add_items(slots: Array[Dictionary], rewards: Array[Dictionary]) -> Dictionary:
	var next_slots := normalize_slots(slots)
	var added: Array[Dictionary] = []
	var lost: Array[Dictionary] = []
	for reward in rewards:
		var item_id := str(reward.get("itemId", ""))
		var count := maxi(0, int(reward.get("count", 0)))
		if item_id == "" or count <= 0 or item_for_id(item_id).is_empty():
			continue
		var add_result := _add_single_item(next_slots, item_id, count)
		next_slots = add_result.get("slots", next_slots)
		var added_count := maxi(0, int(add_result.get("addedCount", 0)))
		var lost_count := maxi(0, count - added_count)
		if added_count > 0:
			added.append({
				"itemId": item_id,
				"count": added_count,
			})
		if lost_count > 0:
			lost.append({
				"itemId": item_id,
				"count": lost_count,
			})
	return {
		"slots": normalize_slots(next_slots),
		"added": merge_item_amounts(added),
		"lost": merge_item_amounts(lost),
	}


static func merge_item_amounts(entries: Array[Dictionary]) -> Array[Dictionary]:
	var order: Array[String] = []
	var counts := {}
	for entry in entries:
		var item_id := str(entry.get("itemId", ""))
		var count := maxi(0, int(entry.get("count", 0)))
		if item_id == "" or count <= 0:
			continue
		if not counts.has(item_id):
			order.append(item_id)
		counts[item_id] = int(counts.get(item_id, 0)) + count
	var result: Array[Dictionary] = []
	for item_id in order:
		result.append({
			"itemId": item_id,
			"count": maxi(0, int(counts.get(item_id, 0))),
		})
	return result


static func item_amounts_text(entries: Array[Dictionary]) -> String:
	var parts: Array[String] = []
	for entry in merge_item_amounts(entries):
		var item_id := str(entry.get("itemId", ""))
		var count := maxi(0, int(entry.get("count", 0)))
		if item_id != "" and count > 0:
			parts.append("%s x%d" % [label_for(item_id), count])
	return "、".join(parts)


static func counts_by_item(slots: Array[Dictionary]) -> Dictionary:
	var result := {}
	for slot in normalize_slots(slots):
		var item_id := str(slot.get("itemId", ""))
		if item_id == "":
			continue
		result[item_id] = int(result.get(item_id, 0)) + maxi(0, int(slot.get("count", 0)))
	return result


static func slot_label(slot: Dictionary) -> String:
	var item_id := str(slot.get("itemId", ""))
	if item_id == "":
		return "-"
	return "%s\nx%d" % [menu_label_for(item_id), maxi(0, int(slot.get("count", 0)))]


static func detail_lines_for_slot(slot: Dictionary) -> Array[String]:
	var item_id := str(slot.get("itemId", ""))
	if item_id == "":
		return ["空格"]
	var contexts := use_contexts_for(item_id)
	var context_labels: Array[String] = []
	if contexts.has(CONTEXT_BATTLE_ITEM):
		context_labels.append("战斗可用")
	if contexts.has(CONTEXT_WORLD_PET_HEAL) or contexts.has(CONTEXT_WORLD_ENCOUNTER_STONE):
		context_labels.append("世界可用")
	if contexts.has(CONTEXT_CAPTURE):
		context_labels.append("捕捉")
	if contexts.has(CONTEXT_EQUIPMENT):
		context_labels.append("装备")
	if context_labels.is_empty():
		context_labels.append("暂不可用")
	var lines: Array[String] = [
		"%s x%d" % [label_for(item_id), maxi(0, int(slot.get("count", 0)))],
		"用途: %s" % " / ".join(context_labels),
		"堆叠: %d" % stack_limit_for(item_id),
	]
	if item_can_world_encounter_stone(item_id):
		lines.append("效果: 原地每%d秒遇敌，持续%d分钟。" % [
			int(roundf(world_encounter_interval_for(item_id))),
			int(roundf(world_encounter_duration_for(item_id) / 60.0)),
		])
	return lines


static func _add_single_item(slots: Array[Dictionary], item_id: String, count: int) -> Dictionary:
	var next_slots := normalize_slots(slots)
	var remaining := maxi(0, count)
	var stack_limit := stack_limit_for(item_id)
	for index in range(next_slots.size()):
		if remaining <= 0:
			break
		var slot := next_slots[index]
		if str(slot.get("itemId", "")) != item_id:
			continue
		var current_count := maxi(0, int(slot.get("count", 0)))
		var room := maxi(0, stack_limit - current_count)
		if room <= 0:
			continue
		var move_count := mini(room, remaining)
		slot["count"] = current_count + move_count
		next_slots[index] = slot
		remaining -= move_count
	for index in range(next_slots.size()):
		if remaining <= 0:
			break
		var slot := next_slots[index]
		if str(slot.get("itemId", "")) != "":
			continue
		var move_count := mini(stack_limit, remaining)
		next_slots[index] = {
			"itemId": item_id,
			"count": move_count,
		}
		remaining -= move_count
	return {
		"slots": next_slots,
		"addedCount": count - remaining,
	}


static func _data() -> Dictionary:
	if not FileAccess.file_exists(DATA_PATH):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	return parsed as Dictionary if parsed is Dictionary else {}
