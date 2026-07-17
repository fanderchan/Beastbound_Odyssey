extends RefCounted

const AUTHORITY_MODEL := "pet_growth_authority_v1"
const CLEAR_IDS := [
	"level_and_exp",
	"rebirth_stage",
	"rebirth_growth_bonus",
	"rebirth_history",
	"growth_observation",
]
const PRESERVE_IDS := [
	"pet_identity",
	"level_one_stats",
	"hidden_growth",
	"enhancement",
	"active_passive_skills",
	"learned_inherited_skills",
	"evolution_lineage",
]
const NON_REFUND_IDS := [
	"training_time",
	"consumed_rebirth_inputs",
	"consumed_cultivation_inputs",
]
const CLEAR_LABELS := {
	"level_and_exp": "当前等级与经验",
	"rebirth_stage": "转生次数",
	"rebirth_growth_bonus": "累计转生成长",
	"rebirth_history": "转生记录",
	"growth_observation": "旧成长观察",
}
const PRESERVE_LABELS := {
	"pet_identity": "宠物身份与造型",
	"level_one_stats": "Lv1 4V",
	"hidden_growth": "天生隐藏成长",
	"enhancement": "强化等级",
	"active_passive_skills": "主动与被动技能",
	"learned_inherited_skills": "已学与遗传技能",
	"evolution_lineage": "进化与融合血统",
}
const NON_REFUND_LABELS := {
	"training_time": "练级时间",
	"consumed_rebirth_inputs": "已消耗的转生材料与货币",
	"consumed_cultivation_inputs": "已消耗的培养材料与货币",
}
const UNCERTAIN_RESULT_CODES := [
	"network_failed",
	"network_retry_failed",
	"storage_commit_timeout",
	"storage_outcome_unknown",
	"storage_write_failed",
]


static func is_local_candidate(instance: Dictionary) -> bool:
	var cultivation := instance.get("petCultivation", {}) as Dictionary if instance.get("petCultivation", {}) is Dictionary else {}
	var rebirth_count := int(cultivation.get("rebirthCount", 0))
	return (
		str(instance.get("instanceId", "")).strip_edges() != ""
		and [1, 2].has(rebirth_count)
		and str(instance.get("growthModelVersion", "")) == AUTHORITY_MODEL
	)


static func normalized_quote(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var quote := value as Dictionary
	if not _has_exact_keys(quote, [
		"schemaVersion",
		"profileRevision",
		"configRevision",
		"pet",
		"payment",
		"result",
		"consequences",
	]):
		return {}
	if (
		not _is_nonnegative_integer(quote.get("profileRevision", null))
		or not _is_nonnegative_integer(quote.get("configRevision", null))
		or not _integer_equals(quote.get("schemaVersion", null), 1)
	):
		return {}
	var pet := quote.get("pet", {}) as Dictionary if quote.get("pet", {}) is Dictionary else {}
	var payment := quote.get("payment", {}) as Dictionary if quote.get("payment", {}) is Dictionary else {}
	var result := quote.get("result", {}) as Dictionary if quote.get("result", {}) is Dictionary else {}
	var consequences := quote.get("consequences", {}) as Dictionary if quote.get("consequences", {}) is Dictionary else {}
	if not _valid_pet(pet) or not _valid_payment(payment) or not _valid_result(result) or not _valid_consequences(consequences):
		return {}
	return quote.duplicate(true)


static func quote_matches_instance(quote_value, instance: Dictionary) -> bool:
	var quote := normalized_quote(quote_value)
	if quote.is_empty():
		return false
	var pet := quote.get("pet", {}) as Dictionary
	return (
		str(pet.get("instanceId", "")) == str(instance.get("instanceId", ""))
		and str(pet.get("formId", "")) == str(instance.get("formId", instance.get("templateId", "")))
	)


static func confirmation_fingerprint(quote_value) -> String:
	var quote := normalized_quote(quote_value)
	if quote.is_empty():
		return ""
	var pet := quote.get("pet", {}) as Dictionary
	var payment := quote.get("payment", {}) as Dictionary
	return "%s|r%d|c%d|%s|%d" % [
		str(pet.get("instanceId", "")),
		int(quote.get("profileRevision", 0)),
		int(quote.get("configRevision", 0)),
		str(payment.get("currencyId", "")),
		int(payment.get("amount", 0)),
	]


static func view_model(quote_value) -> Dictionary:
	var quote := normalized_quote(quote_value)
	if quote.is_empty():
		return {}
	var pet := quote.get("pet", {}) as Dictionary
	var payment := quote.get("payment", {}) as Dictionary
	var consequences := quote.get("consequences", {}) as Dictionary
	var debit_parts: Array[String] = []
	for raw_debit in payment.get("debits", []) as Array:
		var debit := raw_debit as Dictionary
		debit_parts.append("%s %s" % [
			binding_label(str(debit.get("binding", ""))),
			amount_text(int(debit.get("amount", 0)), str(payment.get("currencyId", ""))),
		])
	return {
		"title": "重置转生",
		"summary": "%s｜Lv%d・%d转 → Lv1・0转" % [
			str(pet.get("formName", "宠物")),
			int(pet.get("level", 1)),
			int(pet.get("rebirthCount", 0)),
		],
		"price": amount_text(int(payment.get("amount", 0)), str(payment.get("currencyId", ""))),
		"wallet": "扣款：%s" % (" + ".join(debit_parts) if not debit_parts.is_empty() else "余额不足"),
		"affordable": bool(payment.get("affordable", false)),
		"shortfall": amount_text(int(payment.get("shortfall", 0)), str(payment.get("currencyId", "")), true),
		"paidResetCount": int(pet.get("paidResetCount", 0)),
		"clears": _labels_for(consequences.get("clears", []), CLEAR_LABELS),
		"preserves": _labels_for(consequences.get("preserves", []), PRESERVE_LABELS),
		"nonRefunded": _labels_for(consequences.get("nonRefunded", []), NON_REFUND_LABELS),
		"confirmText": "再次确认支付 %s" % amount_text(int(payment.get("amount", 0)), str(payment.get("currencyId", ""))),
	}


static func operation_id_must_be_retained(code: String) -> bool:
	return UNCERTAIN_RESULT_CODES.has(code.strip_edges())


static func amount_text(amount: int, currency_id: String, allow_zero: bool = false) -> String:
	var safe_amount := maxi(0, amount)
	if safe_amount == 0 and allow_zero:
		return "0%s" % currency_label(currency_id)
	return "%s%s" % [_grouped_number(safe_amount), currency_label(currency_id)]


static func currency_label(currency_id: String) -> String:
	match currency_id:
		"diamonds":
			return "钻石"
		"stoneCoins":
			return "石币"
	return "货币"


static func binding_label(binding: String) -> String:
	return "绑定" if binding == "bound" else "非绑定"


static func contract_check() -> Dictionary:
	var fixture := {
		"schemaVersion": 1,
		"profileRevision": 3,
		"configRevision": 2,
		"pet": {
			"instanceId": "pet_paid_reset_contract",
			"formId": "rebirth_starter_four_spirit_cub",
			"formName": "四灵幼兽",
			"level": 88,
			"rebirthCount": 2,
			"enhanceLevel": 3,
			"binding": "bound",
			"paidResetCount": 0,
		},
		"payment": {
			"currencyId": "diamonds",
			"amount": 300,
			"affordable": true,
			"available": 350,
			"shortfall": 0,
			"balances": {"bound": 250, "unbound": 100},
			"debits": [{"binding": "bound", "amount": 250}, {"binding": "unbound", "amount": 50}],
		},
		"result": {"level": 1, "rebirthCount": 0, "binding": "unbound"},
		"consequences": {"clears": CLEAR_IDS, "preserves": PRESERVE_IDS, "nonRefunded": NON_REFUND_IDS},
	}
	var view := view_model(fixture)
	return {
		"ok": (
			not view.is_empty()
			and str(view.get("summary", "")).find("Lv88・2转 → Lv1・0转") >= 0
			and str(view.get("wallet", "")).find("绑定 250钻石 + 非绑定 50钻石") >= 0
			and str(view.get("preserves", "")).find("天生隐藏成长") >= 0
			and str(view.get("nonRefunded", "")).find("转生材料") >= 0
		),
		"fixture": fixture,
	}


static func _valid_pet(pet: Dictionary) -> bool:
	return (
		_has_exact_keys(pet, ["instanceId", "formId", "formName", "level", "rebirthCount", "enhanceLevel", "binding", "paidResetCount"])
		and str(pet.get("instanceId", "")).strip_edges() != ""
		and str(pet.get("formId", "")).strip_edges() != ""
		and str(pet.get("formName", "")).strip_edges() != ""
		and _is_positive_integer(pet.get("level", null))
		and _integer_in(pet.get("rebirthCount", null), [1, 2])
		and _is_nonnegative_integer(pet.get("enhanceLevel", null))
		and ["bound", "unbound"].has(str(pet.get("binding", "")))
		and _is_nonnegative_integer(pet.get("paidResetCount", null))
	)


static func _valid_payment(payment: Dictionary) -> bool:
	if not _has_exact_keys(payment, ["currencyId", "amount", "affordable", "available", "shortfall", "balances", "debits"]):
		return false
	var currency_id := str(payment.get("currencyId", ""))
	var amount := int(payment.get("amount", 0))
	var affordable_value = payment.get("affordable", null)
	var affordable := bool(affordable_value) if affordable_value is bool else false
	if (
		not ["diamonds", "stoneCoins"].has(currency_id)
		or not _is_positive_integer(payment.get("amount", null))
		or not (affordable_value is bool)
		or not _is_nonnegative_integer(payment.get("available", null))
		or not _is_nonnegative_integer(payment.get("shortfall", null))
		or not (payment.get("balances", null) is Dictionary)
		or not (payment.get("debits", null) is Array)
	):
		return false
	var balances := payment.get("balances", {}) as Dictionary
	if balances.keys().any(func(key) -> bool: return not ["bound", "unbound"].has(str(key))):
		return false
	if balances.values().any(func(value) -> bool: return not _is_nonnegative_integer(value)):
		return false
	var debit_total := 0
	var seen_bindings: Array[String] = []
	for value in payment.get("debits", []) as Array:
		if not (value is Dictionary):
			return false
		var debit := value as Dictionary
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
	if affordable:
		return int(payment.get("shortfall", 0)) == 0 and debit_total == amount
	return (payment.get("debits", []) as Array).is_empty() and int(payment.get("shortfall", 0)) == amount - int(payment.get("available", 0))


static func _valid_result(result: Dictionary) -> bool:
	return (
		_has_exact_keys(result, ["level", "rebirthCount", "binding"])
		and _integer_equals(result.get("level", null), 1)
		and _integer_equals(result.get("rebirthCount", null), 0)
		and str(result.get("binding", "")) == "unbound"
	)


static func _valid_consequences(consequences: Dictionary) -> bool:
	return (
		_has_exact_keys(consequences, ["clears", "preserves", "nonRefunded"])
		and _string_array_equals(consequences.get("clears", null), CLEAR_IDS)
		and _string_array_equals(consequences.get("preserves", null), PRESERVE_IDS)
		and _string_array_equals(consequences.get("nonRefunded", null), NON_REFUND_IDS)
	)


static func _labels_for(values, labels: Dictionary) -> String:
	var result: Array[String] = []
	for value in values as Array:
		result.append(str(labels.get(str(value), "")))
	return "、".join(result)


static func _string_array_equals(value, expected: Array) -> bool:
	if not (value is Array) or (value as Array).size() != expected.size():
		return false
	for index in range(expected.size()):
		if not ((value as Array)[index] is String) or str((value as Array)[index]) != str(expected[index]):
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


static func _integer_in(value, expected: Array) -> bool:
	return _is_nonnegative_integer(value) and expected.has(int(value))


static func _grouped_number(value: int) -> String:
	var text := str(maxi(0, value))
	var parts: Array[String] = []
	while text.length() > 3:
		parts.push_front(text.substr(text.length() - 3))
		text = text.substr(0, text.length() - 3)
	parts.push_front(text)
	return ",".join(parts)
