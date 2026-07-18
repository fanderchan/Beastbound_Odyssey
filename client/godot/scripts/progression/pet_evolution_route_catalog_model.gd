extends RefCounted

const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_WEIGHTS := {"maxHp": 0.25, "attack": 1.0, "defense": 1.0, "quick": 1.0}
const EXPECTED_ROUTE_COUNT := 2
const TOLERANCE := 0.001


static func validation_errors(
	document,
	evolution_balance,
	pet_templates,
	growth_profiles,
	paid_reset_policy,
	bag_items,
	battle_rewards,
	quests,
	battle_actions,
	battle_passives,
	maps_by_id
) -> Array[String]:
	var errors: Array[String] = []
	if not (document is Dictionary):
		return ["pet_evolution_routes.json 缺失或不是JSON对象"]
	var data := document as Dictionary
	var balance := _dict(evolution_balance)
	if int(data.get("schemaVersion", 0)) != 1 or str(data.get("catalogId", "")) != "pet_evolution_routes_v2":
		errors.append("进化路线目录版本无效")
	if str(data.get("balanceVersion", "")) != str(balance.get("balanceVersion", "")):
		errors.append("进化路线必须引用当前进化平衡版本")
	if not (data.get("runtimeEnabled", null) is bool):
		errors.append("进化路线runtimeEnabled必须是布尔值")
	var runtime_enabled := bool(data.get("runtimeEnabled", false))
	if str(data.get("disabledMessage", "")).strip_edges() == "":
		errors.append("进化路线关闭时必须有安全提示")
	if _dict(data.get("qualityProjection", {})) != _dict(balance.get("qualityProjection", {})):
		errors.append("进化路线必须保持二代4V/隐藏成长重抽与源宠履历合同")

	var lines := _index(pet_templates, "lines", "lineId", "宠物族系", errors)
	var subtypes := _index(pet_templates, "subtypes", "subtypeId", "宠物亚种", errors)
	var forms := _index(pet_templates, "forms", "formId", "宠物形态", errors)
	var profiles := _index(growth_profiles, "profiles", "profileId", "成长档", errors)
	var reset_forms := _index(paid_reset_policy, "formPolicies", "formId", "重置策略", errors)
	var items := _index(bag_items, "items", "id", "背包物品", errors)
	var rewards := _index(battle_rewards, "rewardTables", "id", "战斗奖励", errors)
	var quest_index := _index(quests, "quests", "id", "任务", errors)
	var action_index := _index(battle_actions, "actions", "id", "战斗动作", errors)
	var passive_index := _index(battle_passives, "passives", "id", "宠物被动", errors)

	var source_index := {}
	var material_values = data.get("materialEncounters", [])
	if not (material_values is Array) or (material_values as Array).size() != 3:
		errors.append("进化路线必须恰好包含1个共鸣核心和2个族系材料来源")
	else:
		for raw_source in material_values as Array:
			_validate_material_source(
				_dict(raw_source), source_index, items, rewards, _dict(maps_by_id), errors
			)
	var shared_source_count := 0
	var lineage_source_count := 0
	for source_value in source_index.values():
		var source := _dict(source_value)
		if str(source.get("kind", "")) == "shared_floor_core":
			shared_source_count += 1
		elif str(source.get("kind", "")) == "lineage_material":
			lineage_source_count += 1
	if shared_source_count != 1 or lineage_source_count != 2:
		errors.append("进化材料来源分类必须是1个共鸣核心加2个族系材料")

	var routes_value = data.get("routes", [])
	if not (routes_value is Array) or (routes_value as Array).size() != EXPECTED_ROUTE_COUNT:
		errors.append("第一版进化路线必须恰好为2条")
		return errors
	var route_ids := {}
	var used_lines := {}
	var used_sources := {}
	var used_targets := {}
	var shared_source_ids := {}
	var lineage_source_ids := {}
	for index in range((routes_value as Array).size()):
		_validate_route(
			_dict((routes_value as Array)[index]),
			index,
			runtime_enabled,
			balance,
			lines,
			subtypes,
			forms,
			profiles,
			reset_forms,
			quest_index,
			action_index,
			passive_index,
			source_index,
			route_ids,
			used_lines,
			used_sources,
			used_targets,
			shared_source_ids,
			lineage_source_ids,
			errors
		)
	if shared_source_ids.size() != 1 or lineage_source_ids.size() != EXPECTED_ROUTE_COUNT:
		errors.append("两条路线必须共用一个刷楼核心，并各用不同族系材料")
	return errors


static func contract_check(document, evolution_balance, pet_templates, growth_profiles, paid_reset_policy, bag_items, battle_rewards, quests, battle_actions, battle_passives, maps_by_id) -> Dictionary:
	var errors := validation_errors(document, evolution_balance, pet_templates, growth_profiles, paid_reset_policy, bag_items, battle_rewards, quests, battle_actions, battle_passives, maps_by_id)
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"routeCount": (_dict(document).get("routes", []) as Array).size() if _dict(document).get("routes", []) is Array else 0,
		"runtimeEnabled": bool(_dict(document).get("runtimeEnabled", false)),
	}


static func _validate_material_source(source: Dictionary, source_index: Dictionary, items: Dictionary, rewards: Dictionary, maps: Dictionary, errors: Array[String]) -> void:
	var source_id := str(source.get("sourceId", ""))
	if source_id == "" or source_index.has(source_id):
		errors.append("进化材料来源ID为空或重复：%s" % source_id)
		return
	source_index[source_id] = source
	var kind := str(source.get("kind", ""))
	if not ["shared_floor_core", "lineage_material"].has(kind):
		errors.append("%s 材料来源类型无效" % source_id)
	if source.get("repeatable", null) != true or source.get("personalReward", null) != true:
		errors.append("%s 必须是可重复的个人团队奖励" % source_id)
	if int(source.get("minPlayerCount", 0)) != 2:
		errors.append("%s 必须要求至少2名真实玩家组队" % source_id)
	if int(source.get("enemyCount", 0)) != 10 or int(source.get("itemCountPerVictory", 0)) != 1:
		errors.append("%s 必须是10v10且每胜固定给1个材料" % source_id)
	var item_id := str(source.get("itemId", ""))
	var item := _dict(items.get(item_id, {}))
	if item.is_empty():
		errors.append("%s 引用了未知材料%s" % [source_id, item_id])
	else:
		var binding := "bound" if str(item.get("binding", "unbound")) == "bound" else "unbound"
		if binding != str(source.get("itemBinding", "")):
			errors.append("%s 材料绑定规则与背包目录不一致" % source_id)
	var reward_id := str(source.get("rewardTableId", ""))
	var reward := _dict(rewards.get(reward_id, {}))
	var reward_items = reward.get("rewards", [])
	if reward.is_empty() or reward.get("repeatable", null) != true or reward.get("personalReward", null) != true:
		errors.append("%s 缺少可重复个人奖励表" % source_id)
	elif not (reward_items is Array) or (reward_items as Array).size() != 1:
		errors.append("%s 奖励表必须只发一种材料" % source_id)
	else:
		var entry := _dict((reward_items as Array)[0])
		if str(entry.get("itemId", "")) != item_id or int(entry.get("min", 0)) != 1 or int(entry.get("max", 0)) != 1 or not is_equal_approx(float(entry.get("chance", 0.0)), 1.0):
			errors.append("%s 奖励表必须100%%固定给1个声明材料" % source_id)
	var map_id := str(source.get("mapId", ""))
	var map_data := _dict(maps.get(map_id, {}))
	var zone := _entry_by_id(map_data.get("encounterZones", []), str(source.get("encounterZoneId", "")))
	var interaction := _entry_by_id(map_data.get("interactionPoints", []), str(source.get("interactionId", "")))
	if map_data.is_empty() or zone.is_empty() or interaction.is_empty():
		errors.append("%s 的地图、遇敌区或交互点缺失" % source_id)
		return
	if zone.get("manualOnly", null) != true or str(zone.get("encounterGroupId", "")) != str(source.get("encounterGroupId", "")) or str(zone.get("rewardTableId", "")) != reward_id:
		errors.append("%s 的手动Boss遇敌合同不一致" % source_id)
	var enemies = zone.get("fixedWildPets", [])
	if not (enemies is Array) or (enemies as Array).size() != 10:
		errors.append("%s 必须配置10只固定敌人" % source_id)
	else:
		for enemy in enemies as Array:
			if _dict(enemy).get("catchable", null) != false:
				errors.append("%s 的材料Boss敌人必须显式不可捕捉" % source_id)
				break
	if str(interaction.get("encounterZoneId", "")) != str(source.get("encounterZoneId", "")) or str(interaction.get("encounterGroupId", "")) != str(source.get("encounterGroupId", "")):
		errors.append("%s 的Boss交互没有指向声明的遇敌区" % source_id)


static func _validate_route(route: Dictionary, index: int, runtime_enabled: bool, balance: Dictionary, lines: Dictionary, subtypes: Dictionary, forms: Dictionary, profiles: Dictionary, reset_forms: Dictionary, quests: Dictionary, actions: Dictionary, passives: Dictionary, sources: Dictionary, route_ids: Dictionary, used_lines: Dictionary, used_sources: Dictionary, used_targets: Dictionary, shared_source_ids: Dictionary, lineage_source_ids: Dictionary, errors: Array[String]) -> void:
	var label := "routes[%d]" % index
	var route_id := str(route.get("routeId", ""))
	var line_id := str(route.get("lineId", ""))
	var source_form_id := str(route.get("sourceFormId", ""))
	var target_form_id := str(route.get("targetFormId", ""))
	if route_id == "" or route_ids.has(route_id):
		errors.append("%s 路线ID为空或重复" % label)
	route_ids[route_id] = true
	for pair in [[used_lines, line_id, "族系"], [used_sources, source_form_id, "来源形态"], [used_targets, target_form_id, "目标形态"]]:
		var used := pair[0] as Dictionary
		var value := str(pair[1])
		if value == "" or used.has(value):
			errors.append("%s %s为空或重复" % [label, str(pair[2])])
		used[value] = true
	var line := _dict(lines.get(line_id, {}))
	var source_form := _dict(forms.get(source_form_id, {}))
	var target_form := _dict(forms.get(target_form_id, {}))
	var source_profile := _dict(profiles.get(str(route.get("sourceGrowthProfileId", "")), {}))
	var target_profile := _dict(profiles.get(str(route.get("targetGrowthProfileId", "")), {}))
	if line.is_empty() or source_form.is_empty() or target_form.is_empty() or source_profile.is_empty() or target_profile.is_empty():
		errors.append("%s 的族系、形态或成长档不完整" % label)
		return
	if str(source_form.get("lineId", "")) != line_id or _dict(source_form.get("capture", {})).get("catchable", null) != true:
		errors.append("%s 来源必须是同族可捕捉形态" % label)
	if str(target_form.get("lineId", "")) != line_id or _dict(target_form.get("capture", {})).get("catchable", null) != false:
		errors.append("%s 目标必须是同族不可捕捉形态" % label)
	if str(source_form.get("growthSpeciesProfileId", "")) != str(source_profile.get("profileId", "")) or str(target_form.get("growthSpeciesProfileId", "")) != str(target_profile.get("profileId", "")):
		errors.append("%s 形态与成长档引用不一致" % label)
	if absf(_internal_power(_dict(source_profile.get("outputBase", {}))) - _internal_power(_dict(target_profile.get("outputBase", {})))) > 0.000001:
		errors.append("%s 进化不能膨胀Lv1内部基础战力" % label)
	_validate_growth_uplift(source_profile, target_profile, _dict(_dict(balance.get("powerBudget", {})).get("intrinsicUpliftInternalPower", {})), label, errors)

	var license := _dict(route.get("license", {}))
	var quest := _dict(quests.get(str(license.get("questId", "")), {}))
	var ability_id := str(license.get("abilityId", ""))
	var quest_rewards := _dict(quest.get("rewards", {}))
	var abilities = quest_rewards.get("abilities", [])
	if license.get("oneTime", null) != true or license.get("directResult", null) != false or quest.is_empty():
		errors.append("%s 缺少一次性且不发成品的资格任务" % label)
	elif bool(quest.get("runtimeEnabled", true)) != runtime_enabled or str(quest.get("requiredMissingAbility", "")) != ability_id or not (abilities is Array) or (abilities as Array).size() != 1 or str(_dict((abilities as Array)[0]).get("abilityId", "")) != ability_id:
		errors.append("%s 资格任务开关或能力奖励不一致" % label)
	var eligibility := _dict(route.get("eligibility", {}))
	var expected_eligibility := _dict(balance.get("eligibility", {}))
	if int(eligibility.get("requiredRebirthCount", 0)) != int(expected_eligibility.get("requiredRebirthCount", 0)) or int(eligibility.get("requiredLevel", 0)) != int(expected_eligibility.get("requiredLevel", 0)) or str(eligibility.get("requiredGrowthModelVersion", "")) != str(expected_eligibility.get("requiredGrowthModelVersion", "")) or int(eligibility.get("requiredIntrinsicPowerPercentile", 0)) != 90 or int(eligibility.get("minimumIntrinsicCombatPower", 0)) <= 0 or str(eligibility.get("thresholdAuditVersion", "")) != "pet_evolution_eligibility_p90_v1" or int(eligibility.get("thresholdSampleCount", 0)) < 10000:
		errors.append("%s 资格门槛与全局进化合同不一致" % label)

	var cost := _dict(route.get("cost", {}))
	var cost_items = cost.get("items", [])
	var shared_victories := 0
	var lineage_victories := 0
	if int(cost.get("stoneCoins", 0)) != 300000 or str(cost.get("walletPolicyId", "")) != "bound_first_split" or not (cost_items is Array) or (cost_items as Array).size() != 2:
		errors.append("%s 第一版成本必须是30万石币加两类材料" % label)
	else:
		for raw_cost in cost_items as Array:
			var item_cost := _dict(raw_cost)
			var source_id := str(item_cost.get("sourceId", ""))
			var source := _dict(sources.get(source_id, {}))
			if source.is_empty() or str(source.get("itemId", "")) != str(item_cost.get("itemId", "")):
				errors.append("%s 材料成本与掉落来源不一致" % label)
				continue
			var victories := ceili(float(item_cost.get("count", 0)) / maxf(1.0, float(source.get("itemCountPerVictory", 1))))
			if str(source.get("kind", "")) == "shared_floor_core":
				shared_victories = victories
				shared_source_ids[source_id] = true
			else:
				lineage_victories = victories
				lineage_source_ids[source_id] = true
	var effort := _dict(route.get("effort", {}))
	if shared_victories != 8 or lineage_victories != 12 or int(effort.get("deterministicVictories", 0)) != shared_victories + lineage_victories or int(effort.get("normalizedRepeatableEffort", 0)) != 150 or int(effort.get("normalizedFirstUnlockEffort", 0)) != 170:
		errors.append("%s 必须固定为8场核心+12场族系Boss、1.50x/1.70x投入" % label)

	var result := _dict(route.get("result", {}))
	var terminal := _dict(balance.get("terminalPath", {}))
	if int(result.get("level", 0)) != int(terminal.get("resultLevel", 0)) or int(result.get("rebirthCount", 0)) != int(terminal.get("resultRebirthCount", 0)) or result.get("normalSecondRebirthAllowed", null) != false or result.get("fusionMaterialAllowed", null) != false or not is_equal_approx(float(result.get("successRate", 0.0)), 1.0) or result.get("failureConsumes", null) != false:
		errors.append("%s 结果违反一转终局、必成和失败零消耗合同" % label)
	var skills := _dict(route.get("skills", {}))
	var subtype := _dict(subtypes.get(str(target_form.get("subtypeId", "")), {}))
	var default_actions = skills.get("defaultActionIds", [])
	if not (default_actions is Array) or (default_actions as Array).size() < 2 or (default_actions as Array).size() > 7 or subtype.get("activeSkillIds", []) != default_actions:
		errors.append("%s 新亚种主动技能与路线不一致" % label)
	else:
		for action_id in default_actions as Array:
			if not actions.has(str(action_id)):
				errors.append("%s 引用了未实现主动技能%s" % [label, str(action_id)])
	var passive_id := str(skills.get("passiveSkillId", ""))
	if not passives.has(passive_id) or str(line.get("passiveSkillId", "")) != passive_id or skills.get("preserveLearnedAndInherited", null) != true:
		errors.append("%s 必须保留族系被动和已学/遗传技能" % label)
	var reset_policy := _dict(reset_forms.get(target_form_id, {}))
	if str(route.get("paidResetPriceTierId", "")) != "diamond_evolution" or str(reset_policy.get("priceTierId", "")) != "diamond_evolution":
		errors.append("%s 目标形态必须使用进化宠重置价格档" % label)
	var asset_gate := _dict(route.get("assetGate", {}))
	if not ["deferred", "formal"].has(str(asset_gate.get("status", ""))) or asset_gate.get("formalAssetRequiredBeforeRuntime", null) != true or not (asset_gate.get("requiredAnimations", []) is Array) or (asset_gate.get("requiredAnimations", []) as Array).size() < 8:
		errors.append("%s 正式资产门禁不完整" % label)
	if runtime_enabled and str(asset_gate.get("status", "")) != "formal":
		errors.append("%s 正式资产未完成前不能开放进化" % label)


static func _validate_growth_uplift(source: Dictionary, target: Dictionary, budget: Dictionary, label: String, errors: Array[String]) -> void:
	var source_rules := _dict(source.get("individualRules", {}))
	var target_rules := _dict(target.get("individualRules", {}))
	var center := 0.0
	var radius := 0.0
	for key in STAT_KEYS:
		var source_initial := _half_range(_dict(source_rules.get("initialOutputSpread", {})).get(key, []))
		var target_initial := _half_range(_dict(target_rules.get("initialOutputSpread", {})).get(key, []))
		if source_initial < 0.0 or target_initial < 0.0:
			errors.append("%s %s的Lv1重抽范围无效" % [label, key])
		var source_growth := _half_range(_dict(source_rules.get("growthOutputSpread", {})).get(key, []))
		var target_growth := _half_range(_dict(target_rules.get("growthOutputSpread", {})).get(key, []))
		var weight := float(STAT_WEIGHTS.get(key, 1.0))
		center += (float(_dict(target.get("outputGrowth", {})).get(key, 0.0)) - float(_dict(source.get("outputGrowth", {})).get(key, 0.0))) * weight
		radius += absf(target_growth - source_growth) * weight
	var minimum := center - radius
	var maximum := center + radius
	if minimum < float(budget.get("min", 0.0)) - TOLERANCE or maximum > float(budget.get("max", 0.0)) + TOLERANCE or center < float(budget.get("p25", 0.0)) or center > float(budget.get("p85", 0.0)):
		errors.append("%s 进化成长增量超出普通二转第二阶段预算" % label)


static func _internal_power(stats: Dictionary) -> float:
	var total := 0.0
	for key in STAT_KEYS:
		total += float(stats.get(key, 0.0)) * float(STAT_WEIGHTS.get(key, 1.0))
	return total


static func _half_range(value) -> float:
	if not (value is Array) or (value as Array).size() != 2:
		return -1.0
	var values := value as Array
	if absf(float(values[0]) + float(values[1])) > 0.000001 or float(values[0]) > 0.0:
		return -1.0
	return float(values[1])


static func _index(document, array_key: String, id_key: String, label: String, errors: Array[String]) -> Dictionary:
	var result := {}
	var values = _dict(document).get(array_key, [])
	if not (values is Array):
		errors.append("%s目录缺失" % label)
		return result
	for raw in values as Array:
		var entry := _dict(raw)
		var id := str(entry.get(id_key, ""))
		if id == "" or result.has(id):
			errors.append("%s ID为空或重复：%s" % [label, id])
		else:
			result[id] = entry
	return result


static func _entry_by_id(value, id: String) -> Dictionary:
	if value is Array:
		for raw in value as Array:
			var entry := _dict(raw)
			if str(entry.get("id", "")) == id:
				return entry
	return {}


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
