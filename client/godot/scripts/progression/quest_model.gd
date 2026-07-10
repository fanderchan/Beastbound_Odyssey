extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")

const DATA_PATH := "res://data/quests.json"
const STATUS_ACTIVE := "active"
const STATUS_READY := "ready"
const STATUS_CLAIMED := "claimed"
const OBJECTIVE_TEMPLATES := {
	"talk": {
		"label": "对话",
		"eventTypes": ["talk"],
		"requiredFields": ["targetId"],
		"summary": "和指定 NPC / 设施对话。",
	},
	"buy_item": {
		"label": "购买道具",
		"eventTypes": ["buy_item"],
		"requiredFields": ["shopId", "itemId"],
		"summary": "在指定商店购买指定物品。",
	},
	"sell_item": {
		"label": "出售道具",
		"eventTypes": ["sell_item"],
		"requiredFields": ["shopId", "itemId"],
		"summary": "在指定商店出售指定物品。",
	},
	"open_feature": {
		"label": "打开功能",
		"eventTypes": ["open_feature"],
		"requiredFields": ["featureId"],
		"summary": "从底部功能栏打开指定面板。",
	},
	"start_hang": {
		"label": "开始挂机",
		"eventTypes": ["start_hang"],
		"requiredFields": ["mode"],
		"summary": "在遇敌区域开始指定模式的挂机。",
	},
	"market_list": {
		"label": "交易所上架",
		"eventTypes": ["market_list"],
		"requiredFields": ["itemId"],
		"summary": "把指定物品上架到玩家交易所。",
	},
	"market_buy": {
		"label": "交易所购买",
		"eventTypes": ["market_buy"],
		"requiredFields": ["itemId"],
		"summary": "从玩家交易所购买指定物品。",
	},
	"claim_mail": {
		"label": "领取邮件",
		"eventTypes": ["claim_mail"],
		"requiredFields": ["mailKind"],
		"summary": "从邮箱领取指定来源的附件。",
	},
	"send_chat": {
		"label": "发送聊天",
		"eventTypes": ["send_chat"],
		"requiredFields": ["channel"],
		"summary": "在指定聊天频道发送一条消息。",
	},
	"use_world_item": {
		"label": "世界使用道具",
		"eventTypes": ["use_world_item"],
		"requiredFields": ["itemId", "targetType"],
		"summary": "在世界界面对目标使用指定道具。",
	},
	"use_item": {
		"label": "使用道具",
		"eventTypes": ["use_item", "use_world_item", "battle_item"],
		"requiredFields": ["itemId"],
		"summary": "在世界或战斗中使用指定道具，可用 targetType 限定目标。",
	},
	"equip_item": {
		"label": "装备指定装备",
		"eventTypes": ["equip_item"],
		"requiredFields": ["itemId", "slot"],
		"summary": "把指定装备穿到指定装备槽。",
	},
	"use_spirit": {
		"label": "释放精灵",
		"eventTypes": ["use_spirit"],
		"requiredFields": ["spiritId"],
		"summary": "在战斗中释放指定精灵，可用 eventType 限定效果。",
	},
	"training_partner_count": {
		"label": "陪练伙伴",
		"eventTypes": ["training_partner_set_count"],
		"summary": "队伍中加入指定数量的陪练伙伴。",
	},
	"ride_pet": {
		"label": "骑乘宠物",
		"eventTypes": ["ride_pet"],
		"requiredAnyFields": ["formId", "lineId"],
		"summary": "把指定形态或系别的宠物切换为骑乘。",
	},
	"battle_pet": {
		"label": "设置战斗宠物",
		"eventTypes": ["battle_pet"],
		"requiredAnyFields": ["formId", "lineId"],
		"summary": "把指定形态或系别的非骑宠切换为战斗。",
	},
	"battle_victory": {
		"label": "战斗胜利",
		"eventTypes": ["battle_victory"],
		"requiredFields": ["encounterGroupId"],
		"summary": "赢下指定遇敌组或试炼战斗。",
	},
	"defeat_npc": {
		"label": "击败指定 NPC 怪",
		"eventTypes": ["defeat_npc", "battle_victory"],
		"requiredAnyFields": ["encounterGroupId", "targetId", "interactionId"],
		"summary": "击败地图上对话触发的指定守护兽或 NPC 战斗。",
	},
	"capture_pet": {
		"label": "捕捉宠物",
		"eventTypes": ["capture_pet"],
		"requiredAnyFields": ["lineId", "formId", "formIdPrefix"],
		"summary": "捕捉指定系别、形态或形态前缀的宠物，可用 captureToolId 和 requiredStatusId 限定捕捉条件。",
	},
	"deliver_pet": {
		"label": "交付宠物",
		"eventTypes": ["deliver_pet"],
		"requiredAnyFields": ["lineId", "formId", "formIdPrefix"],
		"summary": "交付指定系别、形态或形态前缀的宠物，可用 minLevel 限定等级。",
	},
	"reach_map": {
		"label": "到达地图",
		"eventTypes": ["reach_map", "enter_map"],
		"requiredFields": ["mapId"],
		"summary": "到达指定地图，适合副本入口或跨地图教学。",
	},
	"reach_npc": {
		"label": "到达 NPC",
		"eventTypes": ["reach_npc", "reach_interaction"],
		"requiredAnyFields": ["targetId", "interactionId"],
		"summary": "自动寻路到指定 NPC / 设施附近。",
	},
}
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


static func raw_title_for(quest: Dictionary) -> String:
	return str(quest.get("title", "任务"))


static func required_level_for(quest: Dictionary) -> int:
	return maxi(1, int(quest.get("requiredLevel", 1)))


static func recommended_level_for(quest: Dictionary) -> int:
	return maxi(0, int(quest.get("recommendedLevel", 0)))


static func can_accept_at_level(quest: Dictionary, player_level: int) -> bool:
	return maxi(1, player_level) >= required_level_for(quest)


static func title_with_required_level(title: String, required_level: int) -> String:
	var normalized_title := title.strip_edges()
	if normalized_title == "":
		normalized_title = "任务"
	return "[%d] %s" % [maxi(1, required_level), normalized_title]


static func title_for(quest: Dictionary) -> String:
	return title_with_required_level(raw_title_for(quest), required_level_for(quest))


static func recommended_level_text_for(quest: Dictionary) -> String:
	var recommended_level := recommended_level_for(quest)
	return "推荐等级：Lv%d" % recommended_level if recommended_level > 0 else ""


static func required_level_text_for(quest: Dictionary, player_level: int = 0) -> String:
	var required_level := required_level_for(quest)
	if player_level <= 0:
		return "接取等级：Lv%d" % required_level
	if player_level < required_level:
		return "接取等级：Lv%d（当前 Lv%d，尚未达到）" % [required_level, maxi(1, player_level)]
	return "接取等级：Lv%d（已达到）" % required_level


static func giver_id_for(quest: Dictionary) -> String:
	return str(quest.get("giverId", ""))


static func turn_in_id_for(quest: Dictionary) -> String:
	var turn_in_id := str(quest.get("turnInId", ""))
	return turn_in_id if turn_in_id != "" else giver_id_for(quest)


static func auto_claim_on_ready(quest: Dictionary) -> bool:
	return bool(quest.get("autoClaimOnReady", false))


static func is_optional(quest: Dictionary) -> bool:
	return bool(quest.get("optional", quest.get("isOptional", false)))


static func quest_type_for(quest: Dictionary) -> String:
	return str(quest.get("questType", "main" if not is_optional(quest) else "side"))


static func objective_templates() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var keys := OBJECTIVE_TEMPLATES.keys()
	keys.sort()
	for key in keys:
		var template := (OBJECTIVE_TEMPLATES.get(key, {}) as Dictionary).duplicate(true)
		template["type"] = str(key)
		result.append(template)
	return result


static func objective_template_for_type(objective_type: String) -> Dictionary:
	return (OBJECTIVE_TEMPLATES.get(objective_type, {}) as Dictionary).duplicate(true)


static func supported_objective_types() -> Array[String]:
	var result: Array[String] = []
	var keys := OBJECTIVE_TEMPLATES.keys()
	keys.sort()
	for key in keys:
		result.append(str(key))
	return result


static func objective_type_label_for(objective_type: String) -> String:
	var template := objective_template_for_type(objective_type)
	return str(template.get("label", objective_type))


static func objective_contract_lines() -> Array[String]:
	var lines: Array[String] = []
	for template in objective_templates():
		var required := _string_array(template.get("requiredFields", []))
		var required_any := _string_array(template.get("requiredAnyFields", []))
		var requirement_text := ""
		if not required.is_empty():
			requirement_text = "必填 %s" % "、".join(required)
		elif not required_any.is_empty():
			requirement_text = "至少填 %s 之一" % "、".join(required_any)
		else:
			requirement_text = "无额外必填"
		lines.append("%s：%s；事件 %s；%s" % [
			str(template.get("type", "")),
			str(template.get("label", "")),
			"、".join(_string_array(template.get("eventTypes", []))),
			requirement_text,
		])
	return lines


static func objective_for(quest: Dictionary) -> Dictionary:
	var objectives := objectives_for(quest)
	return objectives[0] if not objectives.is_empty() else {}


static func objectives_for(quest: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_objectives = quest.get("objectives", [])
	if raw_objectives is Array:
		for value in raw_objectives:
			if value is Dictionary and str((value as Dictionary).get("type", "")) != "":
				result.append((value as Dictionary).duplicate(true))
	if not result.is_empty():
		return result
	var objective = quest.get("objective", {})
	if objective is Dictionary and str((objective as Dictionary).get("type", "")) != "":
		result.append((objective as Dictionary).duplicate(true))
	return result


static func objective_required_count(quest: Dictionary) -> int:
	var total := 0
	for objective in objectives_for(quest):
		total += maxi(1, int(objective.get("count", 1)))
	return maxi(1, total)


static func objective_text_for(quest: Dictionary) -> String:
	var parts: Array[String] = []
	for objective in objectives_for(quest):
		var text := str(objective.get("text", "")).strip_edges()
		if text != "":
			parts.append(text)
	if not parts.is_empty():
		return "；".join(parts)
	return title_for(quest)


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
		"riding":
			return "骑虎证"
		"taming":
			return "驯宠证"
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
	var total := 0
	for objective in objectives_for(quest):
		total += _progress_amount_for_objective(objective, event)
	return total


static func _progress_amount_for_objective(objective: Dictionary, event: Dictionary) -> int:
	var objective_type := str(objective.get("type", ""))
	var event_type := str(event.get("type", ""))
	if objective_type == "":
		return 0
	match objective_type:
		"talk":
			if event_type != "talk":
				return 0
			if not _matches_string_filter(objective, event, "targetId"):
				return 0
			return 1
		"buy_item":
			if event_type != "buy_item":
				return 0
			if not _matches_string_filter(objective, event, "shopId"):
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"sell_item":
			if event_type != "sell_item":
				return 0
			if not _matches_string_filter(objective, event, "shopId"):
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"open_feature":
			if event_type != "open_feature" or not _matches_string_filter(objective, event, "featureId"):
				return 0
			return 1
		"start_hang":
			if event_type != "start_hang":
				return 0
			if not _matches_string_filter(objective, event, "mode"):
				return 0
			return 1
		"market_list":
			if event_type != "market_list":
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "currency"):
				return 0
			if not _matches_maximum_number_filter(objective, event, "unitPrice", "maxUnitPrice"):
				return 0
			if not _matches_maximum_number_filter(objective, event, "amount", "maxCount"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"market_buy":
			if event_type != "market_buy":
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "sellerKind"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"claim_mail":
			if event_type != "claim_mail" or not _matches_string_filter(objective, event, "mailKind"):
				return 0
			return 1
		"send_chat":
			if event_type != "send_chat" or not _matches_string_filter(objective, event, "channel"):
				return 0
			return 1
		"use_world_item":
			if event_type != "use_world_item":
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "targetType"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"use_item":
			if not ["use_item", "use_world_item", "battle_item"].has(event_type):
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "targetType"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"equip_item":
			if event_type != "equip_item":
				return 0
			if not _matches_item_filter(objective, event):
				return 0
			if not _matches_string_filter(objective, event, "slot"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"use_spirit":
			if event_type != "use_spirit":
				return 0
			if not _matches_string_filter(objective, event, "spiritId"):
				return 0
			if not _matches_string_filter(objective, event, "eventType"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"training_partner_count":
			if event_type != "training_partner_set_count":
				return 0
			var required_partner_count := maxi(1, int(objective.get("count", 1)))
			if int(event.get("count", event.get("amount", 0))) < required_partner_count:
				return 0
			return required_partner_count
		"ride_pet":
			if event_type != "ride_pet":
				return 0
			if not _matches_string_filter(objective, event, "lineId"):
				return 0
			if not _matches_string_filter(objective, event, "formId"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"battle_pet":
			if event_type != "battle_pet":
				return 0
			if not _matches_string_filter(objective, event, "lineId"):
				return 0
			if not _matches_string_filter(objective, event, "formId"):
				return 0
			if bool(objective.get("excludeRidePet", false)):
				var instance_id := str(event.get("instanceId", "")).strip_edges()
				var ride_instance_id := str(event.get("ridePetInstanceId", "")).strip_edges()
				if instance_id == "" or (ride_instance_id != "" and instance_id == ride_instance_id):
					return 0
			return maxi(1, int(event.get("amount", 1)))
		"battle_victory":
			if event_type != "battle_victory":
				return 0
			if not _matches_string_filter(objective, event, "encounterGroupId"):
				return 0
			if not _matches_minimum_number_filter(objective, event, "partyMemberCount", "minPartyMemberCount"):
				return 0
			return 1
		"defeat_npc":
			if event_type != "defeat_npc" and event_type != "battle_victory":
				return 0
			if not _matches_string_filter(objective, event, "encounterGroupId"):
				return 0
			if not _matches_string_filter(objective, event, "targetId"):
				return 0
			if not _matches_string_filter(objective, event, "interactionId"):
				return 0
			return 1
		"capture_pet":
			if event_type != "capture_pet":
				return 0
			if not _matches_string_filter(objective, event, "lineId"):
				return 0
			if not _matches_string_filter(objective, event, "formId"):
				return 0
			if not _matches_string_filter(objective, event, "captureToolId"):
				return 0
			var prefix := str(objective.get("formIdPrefix", ""))
			if prefix != "" and not str(event.get("formId", "")).begins_with(prefix):
				return 0
			var required_status_id := str(objective.get("requiredStatusId", objective.get("statusId", ""))).strip_edges()
			if required_status_id != "" and not _event_status_ids(event).has(required_status_id):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"deliver_pet":
			if event_type != "deliver_pet":
				return 0
			if not _matches_string_filter(objective, event, "lineId"):
				return 0
			if not _matches_string_filter(objective, event, "formId"):
				return 0
			var prefix := str(objective.get("formIdPrefix", ""))
			if prefix != "" and not str(event.get("formId", "")).begins_with(prefix):
				return 0
			var min_level := maxi(0, int(objective.get("minLevel", 0)))
			if min_level > 0 and int(event.get("level", 1)) < min_level:
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"reach_map":
			if not ["reach_map", "enter_map"].has(event_type):
				return 0
			if not _matches_string_filter(objective, event, "mapId"):
				return 0
			if not _matches_string_filter(objective, event, "regionId"):
				return 0
			return maxi(1, int(event.get("amount", 1)))
		"reach_npc":
			if not ["reach_npc", "reach_interaction"].has(event_type):
				return 0
			if not _matches_string_filter(objective, event, "targetId"):
				return 0
			if not _matches_string_filter(objective, event, "interactionId"):
				return 0
			if not _matches_string_filter(objective, event, "mapId"):
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
		if raw_title_for(quest).strip_edges() == "":
			errors.append("%s.title 不能为空" % quest_id)
		if not quest.has("requiredLevel"):
			errors.append("%s.requiredLevel 必须显式配置" % quest_id)
		elif int(quest.get("requiredLevel", 0)) < 1:
			errors.append("%s.requiredLevel 必须大于等于 1" % quest_id)
		if not quest.has("recommendedLevel"):
			errors.append("%s.recommendedLevel 必须显式配置" % quest_id)
		else:
			var recommended_level := int(quest.get("recommendedLevel", 0))
			if recommended_level < 1:
				errors.append("%s.recommendedLevel 必须大于等于 1" % quest_id)
			elif recommended_level < required_level_for(quest):
				errors.append("%s.recommendedLevel 不能低于 requiredLevel" % quest_id)
		var objectives := objectives_for(quest)
		if objectives.is_empty():
			errors.append("%s.objective.type 不能为空" % quest_id)
		for objective_index in range(objectives.size()):
			var objective := objectives[objective_index]
			if str(objective.get("type", "")) == "":
				errors.append("%s.objectives[%d].type 不能为空" % [quest_id, objective_index])
			if int(objective.get("count", 1)) < 1:
				errors.append("%s.objectives[%d].count 必须大于等于 1" % [quest_id, objective_index])
			errors.append_array(_objective_template_validation_errors(quest_id, objective_index, objective))
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


static func _objective_template_validation_errors(quest_id: String, objective_index: int, objective: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var objective_type := str(objective.get("type", ""))
	if objective_type == "":
		return errors
	var template := objective_template_for_type(objective_type)
	var path := "%s.objectives[%d]" % [quest_id, objective_index]
	if template.is_empty():
		errors.append("%s 使用未知任务目标模板: %s" % [path, objective_type])
		return errors
	for field in _string_array(template.get("requiredFields", [])):
		if str(objective.get(field, "")).strip_edges() == "":
			errors.append("%s.%s 为 %s 模板必填字段" % [path, field, objective_type])
	var required_any := _string_array(template.get("requiredAnyFields", []))
	if not required_any.is_empty():
		var has_any := false
		for field in required_any:
			if str(objective.get(field, "")).strip_edges() != "":
				has_any = true
				break
		if not has_any:
			errors.append("%s 需要填写 %s 之一" % [path, "、".join(required_any)])
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


static func _matches_minimum_number_filter(filter_source: Dictionary, event: Dictionary, event_key: String, filter_key: String) -> bool:
	var required := maxi(0, int(filter_source.get(filter_key, filter_source.get(event_key, 0))))
	if required <= 0:
		return true
	return int(event.get(event_key, 0)) >= required


static func _matches_maximum_number_filter(filter_source: Dictionary, event: Dictionary, event_key: String, filter_key: String) -> bool:
	var maximum := maxi(0, int(filter_source.get(filter_key, filter_source.get(event_key, 0))))
	if maximum <= 0:
		return true
	return int(event.get(event_key, 0)) <= maximum


static func _matches_item_filter(filter_source: Dictionary, event: Dictionary) -> bool:
	var item_id := str(event.get("itemId", ""))
	var required_item_id := str(filter_source.get("itemId", ""))
	var item_ids := _string_array(filter_source.get("itemIds", []))
	if required_item_id != "" and item_id != required_item_id:
		return false
	if not item_ids.is_empty() and not item_ids.has(item_id):
		return false
	return true


static func _event_status_ids(event: Dictionary) -> Array[String]:
	var result := _string_array(event.get("targetStatusIds", event.get("statusIds", [])))
	var single_status_id := str(event.get("targetStatusId", event.get("statusId", ""))).strip_edges()
	if single_status_id != "" and not result.has(single_status_id):
		result.append(single_status_id)
	return result


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result
