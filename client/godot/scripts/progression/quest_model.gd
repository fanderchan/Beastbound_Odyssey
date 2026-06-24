extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")

const DATA_PATH := "res://data/quests.json"
const STATUS_ACTIVE := "active"
const STATUS_READY := "ready"
const STATUS_CLAIMED := "claimed"
static var catalog_cache_loaded: bool = false
static var catalog_cache: Dictionary = {}


static func catalog() -> Dictionary:
	if catalog_cache_loaded:
		return catalog_cache
	catalog_cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		catalog_cache = {}
		return catalog_cache
	var text := FileAccess.get_file_as_string(DATA_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		catalog_cache = {}
		return catalog_cache
	catalog_cache = parsed as Dictionary
	return catalog_cache


static func quests() -> Array[Dictionary]:
	var parsed := catalog()
	var raw_quests = parsed.get("quests", [])
	var result: Array[Dictionary] = []
	if raw_quests is Array:
		for value in raw_quests:
			if value is Dictionary:
				var quest := value as Dictionary
				if str(quest.get("id", "")) != "":
					result.append(quest)
	return result


static func quest_for_id(quest_id: String) -> Dictionary:
	for quest in quests():
		if str(quest.get("id", "")) == quest_id:
			return quest
	return {}


static func first_quest_id() -> String:
	var parsed := catalog()
	var first_id := str(parsed.get("firstQuestId", ""))
	if not quest_for_id(first_id).is_empty():
		return first_id
	var loaded := quests()
	return str(loaded[0].get("id", "")) if not loaded.is_empty() else ""


static func next_quest_id(quest: Dictionary) -> String:
	var next_id := str(quest.get("nextQuestId", ""))
	return next_id if not quest_for_id(next_id).is_empty() else ""


static func title_for(quest: Dictionary) -> String:
	return str(quest.get("title", "任务"))


static func giver_id_for(quest: Dictionary) -> String:
	return str(quest.get("giverId", ""))


static func turn_in_id_for(quest: Dictionary) -> String:
	var turn_in_id := str(quest.get("turnInId", ""))
	return turn_in_id if turn_in_id != "" else giver_id_for(quest)


static func auto_claim_on_ready(quest: Dictionary) -> bool:
	return bool(quest.get("autoClaimOnReady", false))


static func objective_for(quest: Dictionary) -> Dictionary:
	var objective = quest.get("objective", {})
	return objective as Dictionary if objective is Dictionary else {}


static func objective_required_count(quest: Dictionary) -> int:
	return maxi(1, int(objective_for(quest).get("count", 1)))


static func objective_text_for(quest: Dictionary) -> String:
	var objective := objective_for(quest)
	var text := str(objective.get("text", ""))
	return text if text != "" else title_for(quest)


static func reward_stone_coins(quest: Dictionary) -> int:
	var rewards = quest.get("rewards", {})
	var reward_dict := rewards as Dictionary if rewards is Dictionary else {}
	return maxi(0, int(reward_dict.get("stoneCoins", 0)))


static func rebirth_completion_target(quest: Dictionary) -> int:
	return maxi(0, int(quest.get("rebirthQuestTarget", 0)))


static func reward_items(quest: Dictionary) -> Array[Dictionary]:
	var rewards = quest.get("rewards", {})
	var reward_dict := rewards as Dictionary if rewards is Dictionary else {}
	return _normalized_reward_items(reward_dict.get("items", []))


static func reward_abilities(quest: Dictionary) -> Array[Dictionary]:
	var rewards = quest.get("rewards", {})
	var reward_dict := rewards as Dictionary if rewards is Dictionary else {}
	return _normalized_reward_abilities(reward_dict.get("abilities", reward_dict.get("unlockAbilities", [])))


static func reward_choices(quest: Dictionary) -> Array[Dictionary]:
	var rewards = quest.get("rewards", {})
	var reward_dict := rewards as Dictionary if rewards is Dictionary else {}
	var raw_choices = reward_dict.get("choices", reward_dict.get("choiceRewards", []))
	var result: Array[Dictionary] = []
	if raw_choices is Array:
		for index in range((raw_choices as Array).size()):
			var value = (raw_choices as Array)[index]
			if not (value is Dictionary):
				continue
			var choice := value as Dictionary
			var choice_id := str(choice.get("id", "choice_%d" % index))
			var choice_items := _normalized_reward_items(choice.get("items", []))
			var choice_abilities := _normalized_reward_abilities(choice.get("abilities", choice.get("unlockAbilities", [])))
			var choice_coins := maxi(0, int(choice.get("stoneCoins", 0)))
			if choice_id == "" or (choice_items.is_empty() and choice_abilities.is_empty() and choice_coins <= 0):
				continue
			var normalized := {
				"id": choice_id,
				"label": str(choice.get("label", "")),
				"stoneCoins": choice_coins,
				"items": choice_items,
				"abilities": choice_abilities,
			}
			if str(normalized.get("label", "")) == "":
				normalized["label"] = reward_bundle_text(normalized)
			result.append(normalized)
	return result


static func has_reward_choices(quest: Dictionary) -> bool:
	return not reward_choices(quest).is_empty()


static func reward_choice_for_id(quest: Dictionary, choice_id: String) -> Dictionary:
	for choice in reward_choices(quest):
		if str(choice.get("id", "")) == choice_id:
			return choice
	return {}


static func reward_bundle_text(reward_bundle: Dictionary) -> String:
	var parts: Array[String] = []
	var coins := maxi(0, int(reward_bundle.get("stoneCoins", 0)))
	if coins > 0:
		parts.append("%d石币" % coins)
	var raw_items = reward_bundle.get("items", [])
	if raw_items is Array:
		for item in _normalized_reward_items(raw_items):
			parts.append("%s x%d" % [
				BackpackModel.label_for(str(item.get("itemId", ""))),
				maxi(0, int(item.get("count", 0))),
			])
	var raw_abilities = reward_bundle.get("abilities", reward_bundle.get("unlockAbilities", []))
	if raw_abilities is Array:
		for ability in _normalized_reward_abilities(raw_abilities):
			parts.append(str(ability.get("label", ability_label_for(str(ability.get("abilityId", ""))))))
	return "、".join(parts)


static func reward_claim_text(quest: Dictionary, selected_choice: Dictionary = {}) -> String:
	var fixed := {
		"stoneCoins": reward_stone_coins(quest),
		"items": reward_items(quest),
		"abilities": reward_abilities(quest),
	}
	var parts: Array[String] = []
	var fixed_text := reward_bundle_text(fixed)
	if fixed_text != "":
		parts.append(fixed_text)
	if not selected_choice.is_empty():
		var choice_text := reward_bundle_text(selected_choice)
		if choice_text != "":
			parts.append(choice_text)
	return "、".join(parts)


static func _normalized_reward_items(raw_items) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if raw_items is Array:
		for value in raw_items:
			if not (value is Dictionary):
				continue
			var item := value as Dictionary
			var item_id := str(item.get("itemId", ""))
			var count := maxi(0, int(item.get("count", 0)))
			if item_id != "" and count > 0:
				result.append({
					"itemId": item_id,
					"count": count,
				})
	return result


static func _normalized_reward_abilities(raw_abilities) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if raw_abilities is Array:
		for value in raw_abilities:
			var ability_id := ""
			var label := ""
			if value is Dictionary:
				var ability := value as Dictionary
				ability_id = str(ability.get("abilityId", ability.get("id", ""))).strip_edges()
				label = str(ability.get("label", "")).strip_edges()
			else:
				ability_id = str(value).strip_edges()
			if ability_id == "":
				continue
			if label == "":
				label = ability_label_for(ability_id)
			result.append({
				"abilityId": ability_id,
				"label": label,
			})
	return result


static func ability_label_for(ability_id: String) -> String:
	match ability_id:
		"remoteStable":
			return "远程兽栏能力"
	return ability_id


static func reward_text(quest: Dictionary) -> String:
	var parts: Array[String] = []
	var coins := reward_stone_coins(quest)
	if coins > 0:
		parts.append("%d石币" % coins)
	for item in reward_items(quest):
		parts.append("%s x%d" % [
			BackpackModel.label_for(str(item.get("itemId", ""))),
			maxi(0, int(item.get("count", 0))),
		])
	for ability in reward_abilities(quest):
		parts.append(str(ability.get("label", ability_label_for(str(ability.get("abilityId", ""))))))
	var choices := reward_choices(quest)
	if not choices.is_empty():
		var choice_labels: Array[String] = []
		for choice in choices:
			choice_labels.append(str(choice.get("label", reward_bundle_text(choice))))
		parts.append("自选：%s" % " / ".join(choice_labels))
	return "、".join(parts)


static func reward_equipment_detail_lines(quest: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	lines.append_array(_reward_equipment_detail_lines_for_items(reward_items(quest), ""))
	for choice in reward_choices(quest):
		var choice_label := str(choice.get("label", reward_bundle_text(choice)))
		lines.append_array(_reward_equipment_detail_lines_for_items(choice.get("items", []), "自选「%s」" % choice_label))
	return lines


static func _reward_equipment_detail_lines_for_items(raw_items, prefix: String = "") -> Array[String]:
	var lines: Array[String] = []
	var items := _normalized_reward_items(raw_items)
	for item in items:
		var item_id := str(item.get("itemId", ""))
		if not EquipmentModel.is_equipment(item_id):
			continue
		var count := maxi(0, int(item.get("count", 0)))
		var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, item_id))
		var parts: Array[String] = [
			"%s x%d" % [item_label, count],
			EquipmentModel.slot_label_for(EquipmentModel.slot_for(item_id)),
		]
		var stat_text := EquipmentModel.stat_bonus_text_for(item_id)
		if stat_text != "":
			parts.append(stat_text)
		var spirit_text := EquipmentModel.spirit_text_for(item_id)
		if spirit_text != "":
			parts.append("精灵 %s" % spirit_text)
		var detail := " / ".join(parts)
		lines.append("%s：%s" % [prefix, detail] if prefix != "" else detail)
	return lines


static func normalize_state(value, quest_id: String = "") -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var quest := quest_for_id(quest_id)
	var required := objective_required_count(quest) if not quest.is_empty() else 1
	var progress := clampi(int(raw.get("progress", 0)), 0, required)
	var status := str(raw.get("status", STATUS_ACTIVE))
	if not [STATUS_ACTIVE, STATUS_READY, STATUS_CLAIMED].has(status):
		status = STATUS_ACTIVE
	if status == STATUS_CLAIMED:
		progress = required
	elif progress >= required:
		status = STATUS_READY
	return {
		"status": status,
		"progress": progress,
	}


static func normalize_states(value) -> Dictionary:
	var result := {}
	var raw := value as Dictionary if value is Dictionary else {}
	for quest in quests():
		var quest_id := str(quest.get("id", ""))
		if quest_id == "" or not raw.has(quest_id):
			continue
		result[quest_id] = normalize_state(raw.get(quest_id, {}), quest_id)
	return result


static func first_unfinished_quest_id(states: Dictionary) -> String:
	for quest in quests():
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			continue
		var state := normalize_state(states.get(quest_id, {}), quest_id)
		if not states.has(quest_id) or str(state.get("status", STATUS_ACTIVE)) != STATUS_CLAIMED:
			return quest_id
	return ""


static func progress_text_for_state(quest: Dictionary, state: Dictionary) -> String:
	if quest.is_empty():
		return "当前没有任务"
	var normalized := normalize_state(state, str(quest.get("id", "")))
	var status := str(normalized.get("status", STATUS_ACTIVE))
	if status == STATUS_CLAIMED:
		return "%s  已完成" % title_for(quest)
	if status == STATUS_READY:
		return "%s  可领取" % title_for(quest)
	return "%s  %d/%d" % [
		title_for(quest),
		int(normalized.get("progress", 0)),
		objective_required_count(quest),
	]


static func progress_amount_for_event(quest: Dictionary, event: Dictionary) -> int:
	if quest.is_empty():
		return 0
	var objective := objective_for(quest)
	var objective_type := str(objective.get("type", ""))
	var event_type := str(event.get("type", ""))
	if objective_type == "" or objective_type != event_type:
		return 0
	match objective_type:
		"talk":
			if not _matches_string_filter(objective, event, "targetId"):
				return 0
			return 1
		"buy_item":
			if not _matches_string_filter(objective, event, "shopId"):
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"use_world_item":
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "targetType"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"equip_item":
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "slot"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"use_spirit":
			if not _matches_string_filter(objective, event, "spiritId"):
				return 0
			if not _matches_string_filter(objective, event, "eventType"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"battle_victory":
			if not _matches_string_filter(objective, event, "encounterGroupId"):
				return 0
			return 1
		"capture_pet":
			if not _matches_string_filter(objective, event, "lineId"):
				return 0
			if not _matches_string_filter(objective, event, "formId"):
				return 0
			var prefix := str(objective.get("formIdPrefix", ""))
			if prefix != "" and not str(event.get("formId", "")).begins_with(prefix):
				return 0
			return maxi(1, int(event.get("amount", 1)))
	return 0


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var parsed := catalog()
	if parsed.is_empty():
		errors.append("quests.json 缺失或不是 JSON 对象")
		return errors
	if int(parsed.get("schemaVersion", 0)) != 1:
		errors.append("quests.json schemaVersion 当前必须是 1")
	var ids := {}
	for index in range(quests().size()):
		var quest := quests()[index]
		var quest_id := str(quest.get("id", ""))
		if quest_id == "":
			errors.append("quests[%d].id 不能为空" % index)
		elif ids.has(quest_id):
			errors.append("任务 ID 重复: %s" % quest_id)
		else:
			ids[quest_id] = true
		if title_for(quest) == "":
			errors.append("%s.title 不能为空" % quest_id)
		var objective := objective_for(quest)
		if str(objective.get("type", "")) == "":
			errors.append("%s.objective.type 不能为空" % quest_id)
		errors.append_array(_reward_item_validation_errors(reward_items(quest), "%s.rewards.items" % quest_id))
		errors.append_array(_reward_ability_validation_errors(reward_abilities(quest), "%s.rewards.abilities" % quest_id))
		var choice_ids := {}
		for choice in reward_choices(quest):
			var choice_id := str(choice.get("id", ""))
			if choice_id == "":
				errors.append("%s.rewards.choices.id 不能为空" % quest_id)
			elif choice_ids.has(choice_id):
				errors.append("%s.rewards.choices ID 重复: %s" % [quest_id, choice_id])
			else:
				choice_ids[choice_id] = true
			if reward_bundle_text(choice) == "":
				errors.append("%s.rewards.choices.%s 奖励不能为空" % [quest_id, choice_id])
			errors.append_array(_reward_item_validation_errors(choice.get("items", []), "%s.rewards.choices.%s.items" % [quest_id, choice_id]))
			errors.append_array(_reward_ability_validation_errors(choice.get("abilities", []), "%s.rewards.choices.%s.abilities" % [quest_id, choice_id]))
	for quest in quests():
		var next_id := str(quest.get("nextQuestId", ""))
		if next_id != "" and not ids.has(next_id):
			errors.append("%s.nextQuestId 指向不存在任务: %s" % [str(quest.get("id", "")), next_id])
	return errors


static func _reward_item_validation_errors(raw_items, path: String) -> Array[String]:
	var errors: Array[String] = []
	for item in _normalized_reward_items(raw_items):
		var item_id := str(item.get("itemId", ""))
		if BackpackModel.item_for_id(item_id).is_empty():
			errors.append("%s 包含不存在的物品: %s" % [path, item_id])
	return errors


static func _reward_ability_validation_errors(raw_abilities, path: String) -> Array[String]:
	var errors: Array[String] = []
	for ability in _normalized_reward_abilities(raw_abilities):
		var ability_id := str(ability.get("abilityId", ""))
		if ability_id == "":
			errors.append("%s 包含空能力 ID" % path)
	return errors


static func _matches_string_filter(filter_source: Dictionary, event: Dictionary, key: String) -> bool:
	var required := str(filter_source.get(key, ""))
	return required == "" or str(event.get(key, "")) == required


static func _matches_item_filter(filter_source: Dictionary, event: Dictionary) -> bool:
	var item_id := str(event.get("itemId", ""))
	var required_item_id := str(filter_source.get("itemId", ""))
	var item_ids := _string_array(filter_source.get("itemIds", []))
	if required_item_id != "" and item_id != required_item_id:
		return false
	if not item_ids.is_empty() and not item_ids.has(item_id):
		return false
	return true


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result
