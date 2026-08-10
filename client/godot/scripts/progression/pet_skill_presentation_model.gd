extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const KIND_ACTIVE := "active"
const KIND_PASSIVE := "passive"
const KIND_EMPTY := "empty"
const MAX_ACTIVE_SLOTS := 7

const BASE_SKILL_IDS := ["pet_attack", "pet_defend"]
const STATUS_LABELS := {
	"poison": "中毒",
	"sleep": "睡眠",
	"confusion": "混乱",
	"stone": "石化",
}
const ELEMENT_LABELS := {
	"earth": "地",
	"water": "水",
	"fire": "火",
	"wind": "风",
}
const ROLE_LABELS := {
	"attack": "攻击技能",
	"damage": "攻击技能",
	"defense": "防御技能",
	"defend": "防御技能",
	"control": "控制技能",
	"utility": "辅助技能",
	"resistance": "抗性被动",
	"immunity": "免疫被动",
	"passive": "被动技能",
}
const SOURCE_LABELS := {
	"fixed": "固定技能",
	"fixed_base": "固定技能",
	"base": "固定技能",
	"inherent": "族系固有",
	"inherent_species": "族系固有",
	"species": "族系固有",
	"trainer": "训练习得",
	"trained": "训练习得",
	"rebirth": "转生习得",
	"evolution": "进化习得",
	"evolved": "进化习得",
	"fusion": "融合习得",
	"fused": "融合习得",
	"inheritance": "遗传习得",
	"inherited": "遗传习得",
}


static func view_for_instance(
	instance: Dictionary,
	selected_slot: int = 1,
	training_mode: bool = false,
	training_options: Array[Dictionary] = []
) -> Dictionary:
	var safe_slot := clampi(selected_slot, 1, MAX_ACTIVE_SLOTS)
	var passives := passive_cards_for_instance(instance)
	var active_slots := active_slot_cards_for_instance(instance, safe_slot, training_mode)
	var training_candidates: Array[Dictionary] = []
	var training_actions: Array[Dictionary] = []
	if training_mode:
		training_candidates = training_candidate_cards(training_options)
		training_actions = training_action_cards(instance, safe_slot)
	return {
		"instanceId": str(instance.get("instanceId", "")),
		"petName": str(instance.get("name", "宠物")),
		"selectedSlot": safe_slot,
		"trainingMode": training_mode,
		"readOnly": not training_mode,
		"passives": passives,
		"activeSlots": active_slots,
		"trainingActions": training_actions,
		"trainingCandidates": training_candidates,
		"passiveCount": passives.size(),
		"activeSlotCount": active_slots.size(),
		"trainingActionCount": training_actions.size(),
		"trainingCandidateCount": training_candidates.size(),
	}


static func passive_cards_for_instance(instance: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for passive_id in _passive_ids_for_instance(instance):
		var passive := BattlePassiveCatalog.passive_by_id(passive_id)
		if passive.is_empty():
			continue
		result.append(_passive_card(passive))
	return result


static func active_slot_cards_for_instance(
	instance: Dictionary,
	selected_slot: int = 1,
	training_mode: bool = false
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var slots := PetTemplateCatalog.normalized_skill_slots(
		instance.get("activeSkillIds", []),
		instance.get("petSkillSlots", [])
	)
	for slot in range(1, MAX_ACTIVE_SLOTS + 1):
		var skill_id := str(slots[slot - 1]) if slot - 1 < slots.size() else ""
		if skill_id == "":
			result.append(_empty_slot_card(slot, slot == selected_slot, training_mode))
			continue
		var action := BattleActionCatalog.action_by_id(skill_id)
		if action.is_empty():
			result.append(_unknown_active_card(skill_id, slot, slot == selected_slot))
			continue
		result.append(_active_card(action, slot, slot == selected_slot))
	return result


static func training_candidate_cards(
	training_options: Array[Dictionary]
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var seen_ids := {}
	for option in training_options:
		var skill_id := str(option.get("id", option.get("skillId", ""))).strip_edges()
		if skill_id == "" or seen_ids.has(skill_id):
			continue
		var action := BattleActionCatalog.action_by_id(skill_id)
		if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
			continue
		seen_ids[skill_id] = true
		result.append(_training_candidate_card(action, option))
	return result


static func training_action_cards(
	instance: Dictionary,
	selected_slot: int
) -> Array[Dictionary]:
	var safe_slot := clampi(selected_slot, 1, MAX_ACTIVE_SLOTS)
	var slots := PetTemplateCatalog.normalized_skill_slots(
		instance.get("activeSkillIds", []),
		instance.get("petSkillSlots", [])
	)
	var current_skill_id := (
		str(slots[safe_slot - 1])
		if safe_slot - 1 < slots.size()
		else ""
	)
	if current_skill_id == "" or BASE_SKILL_IDS.has(current_skill_id):
		return []
	return [_clear_slot_card(safe_slot, current_skill_id)]


static func effect_summary_for_action(action: Dictionary) -> String:
	var effect = action.get("effect", {})
	if not (effect is Dictionary):
		return "效果说明尚未补充"
	var effect_data := effect as Dictionary
	var effect_type := str(effect_data.get("type", ""))
	match effect_type:
		"damage":
			if effect_data.has("powerMultiplier"):
				return "攻击力 × %s" % _percent_text(float(effect_data.get("powerMultiplier", 1.0)))
			var amount_bonus := int(effect_data.get("amountBonus", 0))
			if amount_bonus != 0:
				return "物理伤害，攻击力 %+d" % amount_bonus
			return "基于攻击力造成物理伤害"
		"status":
			var status_label := _status_label(str(effect_data.get("statusId", "")))
			var hit_rate := clampf(float(effect_data.get("statusHitRate", 1.0)), 0.0, 1.0)
			var turns := maxi(1, int(effect_data.get("statusTurns", 1)))
			return "%s · %s命中 · 持续%d次行动" % [
				status_label,
				_percent_text(hit_rate),
				turns,
			]
		"defend":
			return "本回合采取防御姿态"
		"heal":
			if effect_data.has("amount"):
				return "恢复%d点生命" % maxi(0, int(effect_data.get("amount", 0)))
			return "恢复生命"
		_:
			return "效果说明尚未补充"


static func target_summary_for_action(action: Dictionary) -> String:
	var target = action.get("target", {})
	if not (target is Dictionary):
		return "目标规则尚未补充"
	var target_data := target as Dictionary
	if bool(target_data.get("selfOnly", false)):
		return "自身"
	var target_mode := str(target_data.get("targetMode", "single"))
	if target_mode == "battlefield":
		return "整个战场"
	if target_mode == "enemy_random_range":
		var min_targets := maxi(1, int(target_data.get("minTargets", 1)))
		var max_targets := maxi(min_targets, int(target_data.get("maxTargets", min_targets)))
		return "随机敌方%d-%d个" % [min_targets, max_targets]
	var can_target_ally := bool(target_data.get("canTargetAlly", false))
	var can_target_enemy := bool(target_data.get("canTargetEnemy", false))
	var is_all := bool(target_data.get("isAll", false))
	if can_target_enemy and not can_target_ally:
		return "敌方全体" if is_all else "单个敌人"
	if can_target_ally and not can_target_enemy:
		return "己方全体" if is_all else "单个友方"
	if can_target_ally and can_target_enemy:
		return "全体目标" if is_all else "单个目标"
	return "无需选择目标"


static func effect_summary_for_passive(passive: Dictionary) -> String:
	var passive_id := str(passive.get("id", ""))
	var presentation := _presentation(passive)
	var effect = passive.get("effect", {})
	if passive_id == "quick_instinct" and not bool(
		presentation.get("mechanicsImplemented", false)
	):
		return "效果尚未开放"
	if not (effect is Dictionary) or (effect as Dictionary).is_empty():
		return "效果尚未开放"
	var effect_data := effect as Dictionary
	var summaries: Array[String] = []
	var immunities = effect_data.get("statusImmune", [])
	if immunities is Array:
		for value in immunities as Array:
			var status_id := str(value)
			if status_id != "":
				summaries.append("免疫%s" % _status_label(status_id))
	var raw_resist = effect_data.get("statusResist", {})
	if raw_resist is Dictionary:
		for key in (raw_resist as Dictionary).keys():
			var status_id := str(key)
			var resist_value := clampf(
				float((raw_resist as Dictionary).get(key, 0.0)),
				0.0,
				1.0
			)
			summaries.append(
				"%s抗性 %s" % [_status_label(status_id), _percent_text(resist_value)]
			)
	if str(effect_data.get("type", "")) == "element_scaled_status_resist":
		var mapping = effect_data.get("mapping", {})
		var scale_per_point := clampf(float(effect_data.get("scalePerPoint", 0.0)), 0.0, 1.0)
		if mapping is Dictionary and not (mapping as Dictionary).is_empty():
			if (mapping as Dictionary).size() == 1:
				var element_id := str((mapping as Dictionary).keys()[0])
				var status_id := str((mapping as Dictionary).get(element_id, ""))
				summaries.append(
					"每点%s属性提供%s%s抗性" % [
						_element_label(element_id),
						_percent_text(scale_per_point),
						_status_label(status_id),
					]
				)
			else:
				summaries.append(
					"每点对应属性提供%s异常抗性" % _percent_text(scale_per_point)
				)
	if summaries.is_empty():
		return "效果尚未开放"
	return " · ".join(summaries)


static func _active_card(action: Dictionary, slot: int, selected: bool) -> Dictionary:
	var action_id := str(action.get("id", ""))
	var presentation := _presentation(action)
	var role := str(presentation.get("role", ""))
	var source := str(presentation.get("source", ""))
	var is_base := BASE_SKILL_IDS.has(action_id)
	return {
		"cardKey": "active:%d" % slot,
		"kind": KIND_ACTIVE,
		"abilityId": action_id,
		"skillId": action_id,
		"slot": slot,
		"label": str(action.get("label", "未命名技能")),
		"typeLabel": "主动技能",
		"categoryLabel": "基础技能" if is_base else _role_label(role, "主动技能"),
		"sourceLabel": _source_label(source, "固定技能" if is_base else "主动技能"),
		"role": role,
		"source": source,
		"description": _active_description(action, presentation),
		"effectSummary": effect_summary_for_action(action),
		"targetSummary": target_summary_for_action(action),
		"effectType": str(action.get("effect", {}).get("type", "")),
		"iconPath": str(presentation.get("iconPath", "")),
		"mechanicsImplemented": bool(presentation.get("mechanicsImplemented", true)),
		"isBase": is_base,
		"isLocked": is_base,
		"isEmpty": false,
		"isTrainingCandidate": false,
		"cost": 0,
		"learned": false,
		"selected": selected,
		"canSelect": true,
	}


static func _passive_card(passive: Dictionary) -> Dictionary:
	var passive_id := str(passive.get("id", ""))
	var presentation := _presentation(passive)
	var role := str(presentation.get("role", "passive"))
	var source := str(presentation.get("source", "inherent"))
	var description := str(
		presentation.get("description", passive.get("description", ""))
	).strip_edges()
	if description == "":
		description = "被动技能说明尚未补充。"
	return {
		"cardKey": "passive:%s" % passive_id,
		"kind": KIND_PASSIVE,
		"abilityId": passive_id,
		"skillId": passive_id,
		"slot": 0,
		"label": str(passive.get("label", "未命名被动")),
		"typeLabel": "被动技能",
		"categoryLabel": _role_label(role, "被动技能"),
		"sourceLabel": _source_label(source, "族系固有"),
		"role": role,
		"source": source,
		"description": description,
		"effectSummary": effect_summary_for_passive(passive),
		"targetSummary": "自身常驻",
		"effectType": str(passive.get("effect", {}).get("type", "")),
		"iconPath": str(presentation.get("iconPath", "")),
		"mechanicsImplemented": bool(presentation.get("mechanicsImplemented", true)),
		"isBase": false,
		"isLocked": true,
		"isEmpty": false,
		"isTrainingCandidate": false,
		"cost": 0,
		"learned": false,
		"selected": false,
		"canSelect": true,
	}


static func _training_candidate_card(
	action: Dictionary,
	option: Dictionary
) -> Dictionary:
	var skill_id := str(action.get("id", ""))
	var presentation := _presentation(action)
	var role := str(presentation.get("role", ""))
	var source := str(presentation.get("source", "trainer"))
	var learned := bool(option.get("learned", false))
	var cost := maxi(0, int(option.get("cost", 0)))
	return {
		"cardKey": "training:%s" % skill_id,
		"kind": KIND_ACTIVE,
		"abilityId": skill_id,
		"skillId": skill_id,
		"slot": 0,
		"label": str(action.get("label", "未命名技能")),
		"typeLabel": "训练技能",
		"categoryLabel": _role_label(role, "主动技能"),
		"sourceLabel": "已学" if learned else "需%d石币" % cost,
		"role": role,
		"source": source,
		"description": _active_description(action, presentation),
		"effectSummary": effect_summary_for_action(action),
		"targetSummary": target_summary_for_action(action),
		"effectType": str(action.get("effect", {}).get("type", "")),
		"iconPath": str(presentation.get("iconPath", "")),
		"mechanicsImplemented": bool(presentation.get("mechanicsImplemented", true)),
		"isBase": BASE_SKILL_IDS.has(skill_id),
		"isLocked": learned,
		"isEmpty": false,
		"isTrainingCandidate": true,
		"cost": cost,
		"learned": learned,
		"canLearn": bool(option.get("canLearn", not learned)),
		"selected": false,
		"canSelect": true,
	}


static func _clear_slot_card(slot: int, current_skill_id: String) -> Dictionary:
	return {
		"cardKey": "training:clear:%d" % slot,
		"kind": KIND_EMPTY,
		"abilityId": "",
		"skillId": "",
		"slot": 0,
		"label": "清空技能槽",
		"typeLabel": "训练操作",
		"categoryLabel": "当前技能槽%d" % slot,
		"sourceLabel": "免费",
		"role": "utility",
		"source": "trainer",
		"description": "移除当前配置的%s，技能槽恢复为空。" % (
			BattleActionCatalog.label_for(
				current_skill_id,
				"当前技能"
			)
		),
		"effectSummary": "移除当前技能",
		"targetSummary": "当前宠物",
		"effectType": "",
		"iconPath": "",
		"mechanicsImplemented": true,
		"isBase": false,
		"isLocked": false,
		"isEmpty": true,
		"isTrainingCandidate": true,
		"isClearAction": true,
		"cost": 0,
		"learned": false,
		"canLearn": true,
		"selected": false,
		"canSelect": true,
	}


static func _empty_slot_card(slot: int, selected: bool, training_mode: bool) -> Dictionary:
	return {
		"cardKey": "active:%d" % slot,
		"kind": KIND_EMPTY,
		"abilityId": "",
		"slot": slot,
		"label": "空技能位",
		"typeLabel": "主动技能",
		"categoryLabel": "等待学习",
		"sourceLabel": "可由训练师教授" if training_mode else "尚未配置",
		"description": (
			"选择此技能槽后，可由训练师教授技能。"
			if training_mode
			else "尚未配置技能；前往宠技训练师处学习。"
		),
		"effectSummary": "暂无效果",
		"targetSummary": "未配置",
		"role": "",
		"source": "",
		"effectType": "",
		"iconPath": "",
		"mechanicsImplemented": false,
		"isBase": false,
		"isLocked": false,
		"isEmpty": true,
		"isTrainingCandidate": false,
		"skillId": "",
		"cost": 0,
		"learned": false,
		"selected": selected,
		"canSelect": true,
	}


static func _unknown_active_card(skill_id: String, slot: int, selected: bool) -> Dictionary:
	return {
		"cardKey": "active:%d" % slot,
		"kind": KIND_ACTIVE,
		"abilityId": skill_id,
		"slot": slot,
		"label": "未知技能",
		"typeLabel": "主动技能",
		"categoryLabel": "旧存档技能",
		"sourceLabel": "暂不可使用",
		"description": "该技能缺少当前版本的展示资料。",
		"effectSummary": "效果无法确认",
		"targetSummary": "目标规则无法确认",
		"role": "",
		"source": "",
		"effectType": "",
		"iconPath": "",
		"mechanicsImplemented": false,
		"isBase": false,
		"isLocked": true,
		"isEmpty": false,
		"isTrainingCandidate": false,
		"skillId": skill_id,
		"cost": 0,
		"learned": false,
		"selected": selected,
		"canSelect": true,
	}


static func _active_description(action: Dictionary, presentation: Dictionary) -> String:
	var description := str(presentation.get("description", "")).strip_edges()
	if description != "":
		return description
	var effect = action.get("effect", {})
	if not (effect is Dictionary):
		return "技能说明尚未补充。"
	match str((effect as Dictionary).get("type", "")):
		"damage":
			return "对敌方目标造成物理伤害。"
		"status":
			return "尝试使敌方目标陷入%s状态。" % _status_label(
				str((effect as Dictionary).get("statusId", ""))
			)
		"defend":
			return "本回合采取防御姿态，等待下一次行动。"
		_:
			return "技能说明尚未补充。"


static func _passive_ids_for_instance(instance: Dictionary) -> Array[String]:
	var result: Array[String] = []
	var raw_ids = instance.get("passiveSkillIds", null)
	if raw_ids == null:
		raw_ids = PetTemplateCatalog.passive_ids_for_form(
			str(instance.get("formId", instance.get("templateId", "")))
		)
	if raw_ids is Array:
		for value in raw_ids as Array:
			var passive_id := str(value).strip_edges()
			if passive_id == "" or result.has(passive_id):
				continue
			result.append(passive_id)
	return result


static func _presentation(entry: Dictionary) -> Dictionary:
	var value = entry.get("presentation", {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func _source_label(source: String, fallback: String) -> String:
	var normalized := source.strip_edges().to_lower()
	if normalized == "":
		return fallback
	return str(SOURCE_LABELS.get(normalized, source.strip_edges()))


static func _role_label(role: String, fallback: String) -> String:
	var normalized := role.strip_edges().to_lower()
	if normalized == "":
		return fallback
	return str(ROLE_LABELS.get(normalized, role.strip_edges()))


static func _status_label(status_id: String) -> String:
	var normalized := status_id.strip_edges().to_lower()
	return str(STATUS_LABELS.get(normalized, "异常状态"))


static func _element_label(element_id: String) -> String:
	var normalized := element_id.strip_edges().to_lower()
	return str(ELEMENT_LABELS.get(normalized, "对应"))


static func _percent_text(value: float) -> String:
	return "%d%%" % int(round(clampf(value, 0.0, 9.99) * 100.0))
