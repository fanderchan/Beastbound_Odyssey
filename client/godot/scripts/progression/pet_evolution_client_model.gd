extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")

const AUTHORITY_MODEL := "pet_growth_authority_v1"
const REQUIRED_LEVEL := 140
const REQUIRED_REBIRTH_COUNT := 1
const UNCERTAIN_RESULT_CODES := [
	"network_failed",
	"network_retry_failed",
	"storage_commit_timeout",
	"storage_outcome_unknown",
	"storage_write_failed",
]


static func runtime_enabled() -> bool:
	return bool(BalanceCatalogModel.pet_evolution_routes().get("runtimeEnabled", false))


static func route_for_instance(instance: Dictionary) -> Dictionary:
	var form_id := str(instance.get("formId", instance.get("templateId", ""))).strip_edges()
	if form_id == "":
		return {}
	var routes_value = BalanceCatalogModel.pet_evolution_routes().get("routes", [])
	if not (routes_value is Array):
		return {}
	for raw_route in routes_value as Array:
		if not (raw_route is Dictionary):
			continue
		var route := raw_route as Dictionary
		if str(route.get("sourceFormId", "")) == form_id:
			return route.duplicate(true)
	return {}


static func route_id_for_instance(instance: Dictionary) -> String:
	return str(route_for_instance(instance).get("routeId", "")).strip_edges()


static func is_local_candidate(instance: Dictionary) -> bool:
	if not runtime_enabled():
		return false
	var route := route_for_instance(instance)
	var cultivation := instance.get("petCultivation", {}) as Dictionary if instance.get("petCultivation", {}) is Dictionary else {}
	var asset_gate := route.get("assetGate", {}) as Dictionary if route.get("assetGate", {}) is Dictionary else {}
	return (
		not route.is_empty()
		and str(instance.get("instanceId", "")).strip_edges() != ""
		and int(instance.get("level", 0)) == REQUIRED_LEVEL
		and int(cultivation.get("rebirthCount", 0)) == REQUIRED_REBIRTH_COUNT
		and str(instance.get("growthModelVersion", "")) == AUTHORITY_MODEL
		and not (instance.get("evolutionLineage", null) is Dictionary)
		and str(asset_gate.get("status", "")) == "formal"
	)


static func normalized_quote(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var quote := value as Dictionary
	if not _has_exact_keys(quote, [
		"schemaVersion",
		"catalogId",
		"routeId",
		"profileRevision",
		"pet",
		"result",
		"cost",
	]):
		return {}
	if (
		not _integer_equals(quote.get("schemaVersion", null), 1)
		or str(quote.get("catalogId", "")).strip_edges() == ""
		or str(quote.get("routeId", "")).strip_edges() == ""
		or not _is_nonnegative_integer(quote.get("profileRevision", null))
	):
		return {}
	var pet := quote.get("pet", {}) as Dictionary if quote.get("pet", {}) is Dictionary else {}
	var result := quote.get("result", {}) as Dictionary if quote.get("result", {}) is Dictionary else {}
	var cost := quote.get("cost", {}) as Dictionary if quote.get("cost", {}) is Dictionary else {}
	if not _valid_pet(pet) or not _valid_result(result) or not _valid_cost(cost):
		return {}
	var route := _route_by_id(str(quote.get("routeId", "")))
	if (
		route.is_empty()
		or str(quote.get("catalogId", "")) != str(BalanceCatalogModel.pet_evolution_routes().get("catalogId", ""))
		or str(route.get("sourceFormId", "")) != str(pet.get("sourceFormId", ""))
		or str(route.get("targetFormId", "")) != str(result.get("targetFormId", ""))
	):
		return {}
	return quote.duplicate(true)


static func quote_matches_instance(quote_value, instance: Dictionary) -> bool:
	var quote := normalized_quote(quote_value)
	if quote.is_empty():
		return false
	var pet := quote.get("pet", {}) as Dictionary
	return (
		str(pet.get("instanceId", "")) == str(instance.get("instanceId", ""))
		and str(pet.get("sourceFormId", "")) == str(instance.get("formId", instance.get("templateId", "")))
	)


static func confirmation_fingerprint(quote_value) -> String:
	var quote := normalized_quote(quote_value)
	if quote.is_empty():
		return ""
	var pet := quote.get("pet", {}) as Dictionary
	var cost := quote.get("cost", {}) as Dictionary
	var items := cost.get("items", []) as Array
	var item_parts: Array[String] = []
	for raw_item in items:
		var item := raw_item as Dictionary
		item_parts.append("%s:%d:%d" % [
			str(item.get("itemId", "")),
			int(item.get("required", 0)),
			int(item.get("available", 0)),
		])
	item_parts.sort()
	var coins := cost.get("stoneCoins", {}) as Dictionary
	return "%s|%s|r%d|%s|%s|c%d|a%d" % [
		str(pet.get("instanceId", "")),
		str(quote.get("routeId", "")),
		int(quote.get("profileRevision", 0)),
		str(quote.get("catalogId", "")),
		",".join(item_parts),
		int(coins.get("amount", 0)),
		int(coins.get("available", 0)),
	]


static func view_model(quote_value) -> Dictionary:
	var quote := normalized_quote(quote_value)
	if quote.is_empty():
		return {}
	var pet := quote.get("pet", {}) as Dictionary
	var result := quote.get("result", {}) as Dictionary
	var cost := quote.get("cost", {}) as Dictionary
	var item_parts: Array[String] = []
	for raw_item in cost.get("items", []) as Array:
		var item := raw_item as Dictionary
		item_parts.append("%s %s%d/%d" % [
			str(item.get("label", "材料")),
			"✓ " if bool(item.get("enough", false)) else "缺 ",
			int(item.get("available", 0)),
			int(item.get("required", 0)),
		])
	var coins := cost.get("stoneCoins", {}) as Dictionary
	var debit_parts: Array[String] = []
	for raw_debit in coins.get("debits", []) as Array:
		var debit := raw_debit as Dictionary
		debit_parts.append("%s %s" % [
			binding_label(str(debit.get("binding", ""))),
			grouped_number(int(debit.get("amount", 0))),
		])
	var top_percent := maxi(0, 100 - int(pet.get("requiredPercentile", 90)))
	return {
		"title": "宠物进化",
		"summary": "%s｜1转 Lv140 → %s｜1转 Lv1" % [
			str(pet.get("sourceFormName", "宠物")),
			str(result.get("targetFormName", "进化形态")),
		],
		"condition": "成长战力 %d / 门槛 %d（同形态前%d%%）" % [
			int(pet.get("intrinsicCombatPower", 0)),
			int(pet.get("minimumIntrinsicCombatPower", 0)),
			top_percent,
		],
		"items": "材料：%s" % "　".join(item_parts),
		"stoneCoins": "石币：%s%s%s" % [
			grouped_number(int(coins.get("amount", 0))),
			"｜扣款 " if not debit_parts.is_empty() else "",
			" + ".join(debit_parts),
		],
		"affordable": bool(cost.get("affordable", false)),
		"shortfall": affordability_shortfall(cost),
		"changes": "重新抽取：二代 Lv1 血、攻、防、敏与天生成长；结果可能变强，也可能变弱。",
		"preserves": "保留：同一只宠物、名字、绑定/锁定、强化、技能、一转加成、0转/1转成长履历。",
		"terminal": "结果：回到 Lv1・1转并进入“2转/进化/融合”终局；不能普通二转或作为融合材料。",
		"safety": "条件齐全时 100% 成功；失败不扣宠物、材料或石币。",
		"buttonText": "进化为%s" % str(result.get("targetFormName", "新形态")),
		"confirmText": "再次确认：消耗材料并重新抽取二代",
	}


static func operation_id_must_be_retained(code: String) -> bool:
	return UNCERTAIN_RESULT_CODES.has(code.strip_edges())


static func affordability_shortfall(cost: Dictionary) -> String:
	var parts: Array[String] = []
	for raw_item in cost.get("items", []) as Array:
		var item := raw_item as Dictionary
		var missing := maxi(0, int(item.get("required", 0)) - int(item.get("available", 0)))
		if missing > 0:
			parts.append("%s×%d" % [str(item.get("label", "材料")), missing])
	var coins := cost.get("stoneCoins", {}) as Dictionary
	var coin_shortfall := int(coins.get("shortfall", 0))
	if coin_shortfall > 0:
		parts.append("石币%s" % grouped_number(coin_shortfall))
	return "、".join(parts)


static func grouped_number(value: int) -> String:
	var text := str(maxi(0, value))
	var parts: Array[String] = []
	while text.length() > 3:
		parts.push_front(text.substr(text.length() - 3))
		text = text.substr(0, text.length() - 3)
	parts.push_front(text)
	return ",".join(parts)


static func binding_label(binding: String) -> String:
	return "绑定" if binding == "bound" else "非绑定"


static func contract_check() -> Dictionary:
	var fixture := {
		"schemaVersion": 1,
		"catalogId": "pet_evolution_routes_v2",
		"routeId": "wuli_crystal_evolution_v1",
		"profileRevision": 7,
		"pet": {
			"instanceId": "pet_evolution_ui_contract",
			"sourceFormId": "wuli_normal_tough_earth10",
			"sourceFormName": "高防乌力",
			"level": 140,
			"rebirthCount": 1,
			"intrinsicCombatPower": 1410,
			"minimumIntrinsicCombatPower": 1345,
			"requiredPercentile": 90,
		},
		"result": {
			"targetFormId": "wuli_evolved_crystal_earth8_water2",
			"targetFormName": "晶甲乌力",
			"level": 1,
			"rebirthCount": 1,
			"rerollLevelOneFourV": true,
			"rerollHiddenGrowth": true,
			"preservedHistoryStages": [0, 1],
			"terminalStageLabel": "2转/进化/融合",
		},
		"cost": {
			"affordable": true,
			"items": [
				{"itemId": "pet_evolution_resonance_core", "label": "共鸣兽核", "binding": "bound", "required": 8, "available": 8, "enough": true},
				{"itemId": "pet_evolution_wuli_crystal_scale", "label": "岩晶甲片", "binding": "unbound", "required": 12, "available": 12, "enough": true},
			],
			"stoneCoins": {
				"amount": 300000,
				"available": 350000,
				"shortfall": 0,
				"balances": {"bound": 250000, "unbound": 100000},
				"debits": [{"binding": "bound", "amount": 250000}, {"binding": "unbound", "amount": 50000}],
			},
		},
	}
	var view := view_model(fixture)
	return {
		"ok": (
			not view.is_empty()
			and str(view.get("summary", "")).find("高防乌力｜1转 Lv140 → 晶甲乌力｜1转 Lv1") >= 0
			and str(view.get("condition", "")).find("成长战力 1410 / 门槛 1345（同形态前10%）") >= 0
			and str(view.get("items", "")).find("共鸣兽核 ✓ 8/8") >= 0
			and str(view.get("stoneCoins", "")).find("绑定 250,000 + 非绑定 50,000") >= 0
			and str(view.get("changes", "")).find("天生成长") >= 0
			and str(view.get("preserves", "")).find("0转/1转成长履历") >= 0
		),
		"fixture": fixture,
	}


static func _valid_pet(pet: Dictionary) -> bool:
	return (
		_has_exact_keys(pet, [
			"instanceId",
			"sourceFormId",
			"sourceFormName",
			"level",
			"rebirthCount",
			"intrinsicCombatPower",
			"minimumIntrinsicCombatPower",
			"requiredPercentile",
		])
		and str(pet.get("instanceId", "")).strip_edges() != ""
		and str(pet.get("sourceFormId", "")).strip_edges() != ""
		and str(pet.get("sourceFormName", "")).strip_edges() != ""
		and _integer_equals(pet.get("level", null), REQUIRED_LEVEL)
		and _integer_equals(pet.get("rebirthCount", null), REQUIRED_REBIRTH_COUNT)
		and _is_positive_integer(pet.get("intrinsicCombatPower", null))
		and _is_positive_integer(pet.get("minimumIntrinsicCombatPower", null))
		and int(pet.get("intrinsicCombatPower", 0)) >= int(pet.get("minimumIntrinsicCombatPower", 0))
		and _integer_equals(pet.get("requiredPercentile", null), 90)
	)


static func _valid_result(result: Dictionary) -> bool:
	return (
		_has_exact_keys(result, [
			"targetFormId",
			"targetFormName",
			"level",
			"rebirthCount",
			"rerollLevelOneFourV",
			"rerollHiddenGrowth",
			"preservedHistoryStages",
			"terminalStageLabel",
		])
		and str(result.get("targetFormId", "")).strip_edges() != ""
		and str(result.get("targetFormName", "")).strip_edges() != ""
		and _integer_equals(result.get("level", null), 1)
		and _integer_equals(result.get("rebirthCount", null), 1)
		and result.get("rerollLevelOneFourV", null) == true
		and result.get("rerollHiddenGrowth", null) == true
		and _integer_array_equals(result.get("preservedHistoryStages", null), [0, 1])
		and str(result.get("terminalStageLabel", "")) == "2转/进化/融合"
	)


static func _valid_cost(cost: Dictionary) -> bool:
	if not _has_exact_keys(cost, ["affordable", "items", "stoneCoins"]):
		return false
	if not (cost.get("affordable", null) is bool) or not (cost.get("items", null) is Array) or not (cost.get("stoneCoins", null) is Dictionary):
		return false
	var items := cost.get("items", []) as Array
	if items.is_empty():
		return false
	var item_ids: Array[String] = []
	var items_enough := true
	for raw_item in items:
		if not (raw_item is Dictionary):
			return false
		var item := raw_item as Dictionary
		var item_id := str(item.get("itemId", ""))
		if (
			not _has_exact_keys(item, ["itemId", "label", "binding", "required", "available", "enough"])
			or item_id.strip_edges() == ""
			or item_ids.has(item_id)
			or str(item.get("label", "")).strip_edges() == ""
			or not ["bound", "unbound"].has(str(item.get("binding", "")))
			or not _is_positive_integer(item.get("required", null))
			or not _is_nonnegative_integer(item.get("available", null))
			or not (item.get("enough", null) is bool)
			or bool(item.get("enough", false)) != (int(item.get("available", 0)) >= int(item.get("required", 0)))
		):
			return false
		item_ids.append(item_id)
		items_enough = items_enough and bool(item.get("enough", false))
	var coins := cost.get("stoneCoins", {}) as Dictionary
	if not _valid_stone_coins(coins):
		return false
	var coins_enough := int(coins.get("available", 0)) >= int(coins.get("amount", 0))
	return bool(cost.get("affordable", false)) == (items_enough and coins_enough)


static func _valid_stone_coins(coins: Dictionary) -> bool:
	if not _has_exact_keys(coins, ["amount", "available", "shortfall", "balances", "debits"]):
		return false
	if (
		not _is_positive_integer(coins.get("amount", null))
		or not _is_nonnegative_integer(coins.get("available", null))
		or not _is_nonnegative_integer(coins.get("shortfall", null))
		or not (coins.get("balances", null) is Dictionary)
		or not (coins.get("debits", null) is Array)
	):
		return false
	var balances := coins.get("balances", {}) as Dictionary
	if not _has_exact_keys(balances, ["bound", "unbound"]):
		return false
	if not _is_nonnegative_integer(balances.get("bound", null)) or not _is_nonnegative_integer(balances.get("unbound", null)):
		return false
	if int(coins.get("available", 0)) != int(balances.get("bound", 0)) + int(balances.get("unbound", 0)):
		return false
	var amount := int(coins.get("amount", 0))
	var available := int(coins.get("available", 0))
	var debits := coins.get("debits", []) as Array
	if available < amount:
		return debits.is_empty() and int(coins.get("shortfall", 0)) == amount - available
	if int(coins.get("shortfall", 0)) != 0:
		return false
	var seen_bindings: Array[String] = []
	var debit_total := 0
	for raw_debit in debits:
		if not (raw_debit is Dictionary):
			return false
		var debit := raw_debit as Dictionary
		var binding := str(debit.get("binding", ""))
		if (
			not _has_exact_keys(debit, ["binding", "amount"])
			or not ["bound", "unbound"].has(binding)
			or seen_bindings.has(binding)
			or not _is_positive_integer(debit.get("amount", null))
		):
			return false
		seen_bindings.append(binding)
		debit_total += int(debit.get("amount", 0))
	return debit_total == amount


static func _route_by_id(route_id: String) -> Dictionary:
	var routes_value = BalanceCatalogModel.pet_evolution_routes().get("routes", [])
	if not (routes_value is Array):
		return {}
	for raw_route in routes_value as Array:
		if raw_route is Dictionary and str((raw_route as Dictionary).get("routeId", "")) == route_id:
			return (raw_route as Dictionary).duplicate(true)
	return {}


static func _integer_array_equals(value, expected: Array) -> bool:
	if not (value is Array) or (value as Array).size() != expected.size():
		return false
	for index in range(expected.size()):
		if not _integer_equals((value as Array)[index], int(expected[index])):
			return false
	return true


static func _has_exact_keys(value: Dictionary, expected: Array) -> bool:
	if value.size() != expected.size():
		return false
	for key in expected:
		if not value.has(key):
			return false
	return true


static func _is_nonnegative_integer(value) -> bool:
	if value is int:
		return int(value) >= 0
	if value is float:
		return is_finite(float(value)) and float(value) >= 0.0 and floorf(float(value)) == float(value)
	return false


static func _is_positive_integer(value) -> bool:
	return _is_nonnegative_integer(value) and int(value) >= 1


static func _integer_equals(value, expected: int) -> bool:
	return _is_nonnegative_integer(value) and int(value) == expected
