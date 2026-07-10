extends RefCounted

const DATA_PATH := "res://data/bag_items.json"
const BASE_SLOT_LIMIT := 15
const EXTRA_SLOT_LIMIT := 5
const SLOT_LIMIT := 20
const UNLOCK_COSTS: Array[int] = [50, 100, 200, 400, 1000]
const CONTEXT_BATTLE_ITEM := "battle_item"
const CONTEXT_CAPTURE := "capture"
const CONTEXT_WORLD_PET_HEAL := "world_pet_heal"
const CONTEXT_WORLD_ENCOUNTER_STONE := "world_encounter_stone"
const CONTEXT_WORLD_EXP := "world_exp"
const CONTEXT_WORLD_PLAYER_EXP := "world_player_exp"
const CONTEXT_WORLD_PET_EXP := "world_pet_exp"
const CONTEXT_WORLD_MM_STONE := "world_mm_stone"
const CONTEXT_WORLD_PET_EGG := "world_pet_egg"
const CONTEXT_EQUIPMENT := "equipment"
const BINDING_UNBOUND := "unbound"
const BINDING_BOUND := "bound"
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


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


static func binding_for(item_id: String) -> String:
	var item := item_for_id(item_id)
	return BINDING_BOUND if str(item.get("binding", BINDING_UNBOUND)) == BINDING_BOUND else BINDING_UNBOUND


static func item_is_bound(item_id: String) -> bool:
	return binding_for(item_id) == BINDING_BOUND


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


static func world_pet_heal_allows_full_hp_use(item_id: String) -> bool:
	return item_can_world_pet_heal(item_id) and bool(world_use_for(item_id).get("allowFullHpUse", false))


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


static func world_exp_level_for(item_id: String) -> int:
	var world_use := world_use_for(item_id)
	var use_type := str(world_use.get("type", ""))
	if use_type != "exp" and use_type != "player_exp" and use_type != "pet_exp":
		return 0
	return maxi(1, int(world_use.get("level", 1)))


static func item_can_world_player_exp(item_id: String) -> bool:
	var use_type := str(world_use_for(item_id).get("type", ""))
	return (
		(
			item_has_context(item_id, CONTEXT_WORLD_EXP)
			and use_type == "exp"
		)
		or (
			item_has_context(item_id, CONTEXT_WORLD_PLAYER_EXP)
			and use_type == "player_exp"
		)
	) and world_exp_level_for(item_id) > 0


static func item_can_world_pet_exp(item_id: String) -> bool:
	var use_type := str(world_use_for(item_id).get("type", ""))
	return (
		(
			item_has_context(item_id, CONTEXT_WORLD_EXP)
			and use_type == "exp"
		)
		or (
			item_has_context(item_id, CONTEXT_WORLD_PET_EXP)
			and use_type == "pet_exp"
		)
	) and world_exp_level_for(item_id) > 0


static func item_can_world_mm_stone(item_id: String) -> bool:
	return item_has_context(item_id, CONTEXT_WORLD_MM_STONE) and str(world_use_for(item_id).get("type", "")) == "mm_stone" and world_mm_stone_points_for(item_id) > 0


static func world_mm_stone_stat_for(item_id: String) -> String:
	if str(world_use_for(item_id).get("type", "")) != "mm_stone":
		return ""
	return str(world_use_for(item_id).get("stat", ""))


static func world_mm_stone_points_for(item_id: String) -> int:
	if str(world_use_for(item_id).get("type", "")) != "mm_stone":
		return 0
	return maxi(0, int(world_use_for(item_id).get("points", 0)))


static func item_can_world_pet_egg(item_id: String) -> bool:
	if not item_has_context(item_id, CONTEXT_WORLD_PET_EGG):
		return false
	var use_type := str(world_use_for(item_id).get("type", ""))
	if use_type == "pet_rebirth_mm_egg":
		return world_pet_egg_stage_for(item_id) > 0
	if use_type == "pet_form_egg":
		return world_pet_egg_form_id_for(item_id) != ""
	return false


static func world_pet_egg_stage_for(item_id: String) -> int:
	if str(world_use_for(item_id).get("type", "")) != "pet_rebirth_mm_egg":
		return 0
	return maxi(0, int(world_use_for(item_id).get("stage", 0)))


static func world_pet_egg_form_id_for(item_id: String) -> String:
	if str(world_use_for(item_id).get("type", "")) != "pet_form_egg":
		return ""
	return str(world_use_for(item_id).get("formId", "")).strip_edges()


static func world_pet_egg_pet_name_for(item_id: String) -> String:
	if str(world_use_for(item_id).get("type", "")) != "pet_form_egg":
		return ""
	return str(world_use_for(item_id).get("petName", "")).strip_edges()


static func starting_slots() -> Array[Dictionary]:
	var counts := {}
	for item in items():
		var item_id := str(item.get("id", ""))
		var count := maxi(0, int(item.get("startingCount", 0)))
		if item_id != "" and count > 0:
			counts[item_id] = count
	return slots_from_counts(counts, BASE_SLOT_LIMIT)


static func unlocked_slot_count(extra_slots: int) -> int:
	return BASE_SLOT_LIMIT + clampi(extra_slots, 0, EXTRA_SLOT_LIMIT)


static func unlock_cost_for_extra_slot(extra_slots_unlocked: int) -> int:
	if extra_slots_unlocked < 0 or extra_slots_unlocked >= UNLOCK_COSTS.size():
		return 0
	return maxi(0, int(UNLOCK_COSTS[extra_slots_unlocked]))


static func normalize_slots(value, slot_limit: int = -1) -> Array[Dictionary]:
	var resolved_slot_limit := _slot_limit_from_value(value, slot_limit)
	var result: Array[Dictionary] = []
	if value is Array:
		for raw_slot in value:
			if result.size() >= resolved_slot_limit:
				break
			if not (raw_slot is Dictionary):
				result.append({})
				continue
			var slot := raw_slot as Dictionary
			var item_id := str(slot.get("itemId", ""))
			if item_id == "" or item_for_id(item_id).is_empty():
				result.append({})
				continue
			var count := maxi(0, int(slot.get("count", 0)))
			if count <= 0:
				result.append({})
				continue
			var remaining := count
			var stack_limit := stack_limit_for(item_id)
			while remaining > 0 and result.size() < resolved_slot_limit:
				var stack_count := mini(remaining, stack_limit)
				result.append({
					"itemId": item_id,
					"count": stack_count,
				})
				remaining -= stack_count
	while result.size() < resolved_slot_limit:
		result.append({})
	return result


static func slots_from_counts(counts: Dictionary, slot_limit: int = BASE_SLOT_LIMIT) -> Array[Dictionary]:
	var resolved_slot_limit := _resolved_slot_limit(slot_limit)
	var result: Array[Dictionary] = []
	for item in items():
		var item_id := str(item.get("id", ""))
		if item_id == "":
			continue
		var remaining := maxi(0, int(counts.get(item_id, 0)))
		var stack_limit := stack_limit_for(item_id)
		while remaining > 0 and result.size() < resolved_slot_limit:
			var stack_count := mini(remaining, stack_limit)
			result.append({
				"itemId": item_id,
				"count": stack_count,
			})
			remaining -= stack_count
	while result.size() < resolved_slot_limit:
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
	return slots_from_counts(counts, _slot_limit_from_slots(slots))


static func set_counts_for_context(slots: Array[Dictionary], context: String, counts: Dictionary) -> Array[Dictionary]:
	var next_counts := counts_by_item(slots)
	for item_id in item_ids_for_context(context):
		var next_count := maxi(0, int(counts.get(item_id, 0)))
		if next_count > 0:
			next_counts[item_id] = next_count
		else:
			next_counts.erase(item_id)
	return slots_from_counts(next_counts, _slot_limit_from_slots(slots))


static func consume(slots: Array[Dictionary], item_id: String, amount: int = 1) -> Array[Dictionary]:
	return set_item_count(slots, item_id, item_count(slots, item_id) - maxi(1, amount))


static func move_stack(slots: Array[Dictionary], source_index: int, target_index: int, amount: int = -1) -> Dictionary:
	var next_slots := normalize_slots(slots)
	if source_index < 0 or target_index < 0 or source_index >= next_slots.size() or target_index >= next_slots.size():
		return {"ok": false, "message": "背包格子无效。", "slots": next_slots}
	if source_index == target_index:
		return {"ok": false, "message": "物品已在这个格子。", "slots": next_slots}
	var source := next_slots[source_index]
	var source_item_id := str(source.get("itemId", ""))
	var source_count := maxi(0, int(source.get("count", 0)))
	if source_item_id == "" or source_count <= 0:
		return {"ok": false, "message": "这个格子没有物品。", "slots": next_slots}
	var target := next_slots[target_index]
	var target_item_id := str(target.get("itemId", ""))
	var target_count := maxi(0, int(target.get("count", 0)))
	var move_count := source_count if amount <= 0 else clampi(amount, 1, source_count)
	var item_label := label_for(source_item_id)
	if target_item_id == "":
		next_slots[target_index] = {"itemId": source_item_id, "count": move_count}
		var remaining_source := source_count - move_count
		next_slots[source_index] = {"itemId": source_item_id, "count": remaining_source} if remaining_source > 0 else {}
		return {
			"ok": true,
			"message": "已移动%s x%d。" % [item_label, move_count],
			"slots": normalize_slots(next_slots),
			"itemId": source_item_id,
			"count": move_count,
		}
	if target_item_id == source_item_id:
		var stack_limit := stack_limit_for(source_item_id)
		var room := maxi(0, stack_limit - target_count)
		if room <= 0:
			return {"ok": false, "message": "%s 已达到堆叠上限。" % item_label, "slots": next_slots}
		var merged_count := mini(move_count, room)
		next_slots[target_index] = {"itemId": source_item_id, "count": target_count + merged_count}
		var remaining_count := source_count - merged_count
		next_slots[source_index] = {"itemId": source_item_id, "count": remaining_count} if remaining_count > 0 else {}
		return {
			"ok": true,
			"message": "已合并%s x%d。" % [item_label, merged_count],
			"slots": normalize_slots(next_slots),
			"itemId": source_item_id,
			"count": merged_count,
		}
	if move_count < source_count:
		return {"ok": false, "message": "拆分到空格，或整组交换。", "slots": next_slots}
	next_slots[source_index] = target.duplicate(true)
	next_slots[target_index] = source.duplicate(true)
	return {
		"ok": true,
		"message": "已交换物品。",
		"slots": normalize_slots(next_slots),
		"itemId": source_item_id,
		"count": move_count,
	}


static func split_stack(slots: Array[Dictionary], source_index: int, quantity: int, target_index: int = -1) -> Dictionary:
	var next_slots := normalize_slots(slots)
	if source_index < 0 or source_index >= next_slots.size():
		return {"ok": false, "message": "背包格子无效。", "slots": next_slots}
	var source := next_slots[source_index]
	var item_id := str(source.get("itemId", ""))
	var source_count := maxi(0, int(source.get("count", 0)))
	if item_id == "" or source_count <= 1:
		return {"ok": false, "message": "这个物品不能拆分。", "slots": next_slots}
	var split_count := clampi(quantity, 1, source_count - 1)
	var resolved_target := target_index
	if resolved_target < 0:
		for index in range(next_slots.size()):
			if index != source_index and str(next_slots[index].get("itemId", "")) == "":
				resolved_target = index
				break
	if resolved_target < 0 or resolved_target >= next_slots.size() or resolved_target == source_index:
		return {"ok": false, "message": "没有空格可以拆分。", "slots": next_slots}
	if str(next_slots[resolved_target].get("itemId", "")) != "":
		return {"ok": false, "message": "请选择一个空格拆分。", "slots": next_slots}
	next_slots[source_index] = {"itemId": item_id, "count": source_count - split_count}
	next_slots[resolved_target] = {"itemId": item_id, "count": split_count}
	return {
		"ok": true,
		"message": "已拆分%s x%d。" % [label_for(item_id), split_count],
		"slots": normalize_slots(next_slots),
		"itemId": item_id,
		"count": split_count,
		"targetSlotIndex": resolved_target,
	}


static func discard_stack(slots: Array[Dictionary], source_index: int, quantity: int = -1) -> Dictionary:
	var next_slots := normalize_slots(slots)
	if source_index < 0 or source_index >= next_slots.size():
		return {"ok": false, "message": "背包格子无效。", "slots": next_slots}
	var source := next_slots[source_index]
	var item_id := str(source.get("itemId", ""))
	var source_count := maxi(0, int(source.get("count", 0)))
	if item_id == "" or source_count <= 0:
		return {"ok": false, "message": "这个格子没有物品。", "slots": next_slots}
	var discard_count := source_count if quantity <= 0 else clampi(quantity, 1, source_count)
	var remaining_count := source_count - discard_count
	next_slots[source_index] = {"itemId": item_id, "count": remaining_count} if remaining_count > 0 else {}
	return {
		"ok": true,
		"message": "已丢弃%s x%d。" % [label_for(item_id), discard_count],
		"slots": normalize_slots(next_slots),
		"itemId": item_id,
		"count": discard_count,
	}


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
		return "空"
	return "%s\nx%d" % [menu_label_for(item_id), maxi(0, int(slot.get("count", 0)))]


static func detail_lines_for_slot(slot: Dictionary) -> Array[String]:
	var item_id := str(slot.get("itemId", ""))
	if item_id == "":
		return ["空格"]
	var contexts := use_contexts_for(item_id)
	var context_labels: Array[String] = []
	if contexts.has(CONTEXT_BATTLE_ITEM):
		context_labels.append("战斗可用")
	if contexts.has(CONTEXT_WORLD_PET_HEAL) or contexts.has(CONTEXT_WORLD_ENCOUNTER_STONE) or contexts.has(CONTEXT_WORLD_EXP) or contexts.has(CONTEXT_WORLD_PLAYER_EXP) or contexts.has(CONTEXT_WORLD_PET_EXP) or contexts.has(CONTEXT_WORLD_MM_STONE) or contexts.has(CONTEXT_WORLD_PET_EGG):
		context_labels.append("世界可用")
	if contexts.has(CONTEXT_CAPTURE):
		context_labels.append("捕捉")
	if contexts.has(CONTEXT_EQUIPMENT):
		context_labels.append("装备")
	if context_labels.is_empty():
		context_labels.append("暂不可用")
	var lines: Array[String] = [
		"%s x%d" % [label_for(item_id), maxi(0, int(slot.get("count", 0)))],
		"绑定：%s" % ("已绑定" if item_is_bound(item_id) else "非绑定"),
		"用途: %s" % " / ".join(context_labels),
		"堆叠: %d" % stack_limit_for(item_id),
	]
	if item_can_world_encounter_stone(item_id):
		lines.append("效果: 原地每%d秒遇敌，持续%d分钟。" % [
			int(roundf(world_encounter_interval_for(item_id))),
			int(roundf(world_encounter_duration_for(item_id) / 60.0)),
		])
	if item_can_world_player_exp(item_id) or item_can_world_pet_exp(item_id):
		lines.append("效果: 获得到达 Lv%d 所需的经验。" % world_exp_level_for(item_id))
	if item_can_world_mm_stone(item_id):
		lines.append("效果: 给转生MM增加 %s石 %d 点。" % [
			_mm_stone_stat_label(world_mm_stone_stat_for(item_id)),
			world_mm_stone_points_for(item_id),
		])
		if item_can_world_pet_egg(item_id):
			var egg_pet_name := world_pet_egg_pet_name_for(item_id)
			if egg_pet_name != "":
				lines.append("效果: 使用后获得 Lv1 %s。" % egg_pet_name)
			else:
				lines.append("效果: 使用后获得 Lv1 %d转小MM。" % world_pet_egg_stage_for(item_id))
	var description := str(item_for_id(item_id).get("description", "")).strip_edges()
	if description != "":
		lines.append("说明: %s" % description)
	return lines


static func _mm_stone_stat_label(stat_key: String) -> String:
	match stat_key:
		"maxHp", "hp", "life":
			return "生命"
		"attack":
			return "攻击"
		"defense":
			return "防御"
		"quick", "agility", "speed":
			return "敏捷"
	return stat_key


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


static func _resolved_slot_limit(slot_limit: int) -> int:
	return clampi(slot_limit, BASE_SLOT_LIMIT, SLOT_LIMIT)


static func _slot_limit_from_slots(slots: Array[Dictionary]) -> int:
	return _resolved_slot_limit(slots.size())


static func _slot_limit_from_value(value, explicit_slot_limit: int = -1) -> int:
	if explicit_slot_limit > 0:
		return _resolved_slot_limit(explicit_slot_limit)
	if value is Array:
		var value_size := (value as Array).size()
		if value_size > 0:
			return _resolved_slot_limit(value_size)
	return BASE_SLOT_LIMIT


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
