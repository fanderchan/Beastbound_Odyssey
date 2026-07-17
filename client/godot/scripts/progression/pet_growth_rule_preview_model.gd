extends RefCounted

const PetGrowthScreeningModel := preload("res://scripts/progression/pet_growth_screening_model.gd")

const POLICY_KEY := "growthRulePolicy"
const POLICY_SCHEMA_VERSION := 1
const PREVIEW_SCHEMA_VERSION := 1
const MAX_PREVIEW_PETS := 25
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}
const UI_OVERALL_MINIMUM_KEY := "growthRuleOverallMinimumPercentile"
const UI_STAT_MINIMUM_PREFIX := "growthRuleStatMinimumPercentile:"


static func default_policy() -> Dictionary:
	return {
		"schemaVersion": POLICY_SCHEMA_VERSION,
		"overallMinimumPercentile": 0,
		"statMinimumPercentiles": {
			"maxHp": 0,
			"attack": 0,
			"defense": 0,
			"quick": 0,
		},
	}


static func normalize_policy(value) -> Dictionary:
	if not (value is Dictionary):
		return default_policy()
	var source := value as Dictionary
	var schema_value = source.get("schemaVersion", null)
	if not (schema_value is int or schema_value is float) or float(schema_value) != float(POLICY_SCHEMA_VERSION):
		return default_policy()
	var raw_stats = source.get("statMinimumPercentiles", {})
	var stat_source := raw_stats as Dictionary if raw_stats is Dictionary else {}
	var stats := {}
	for stat_key in STAT_KEYS:
		stats[stat_key] = _normalized_percentile(stat_source.get(stat_key, 0))
	return {
		"schemaVersion": POLICY_SCHEMA_VERSION,
		"overallMinimumPercentile": _normalized_percentile(source.get("overallMinimumPercentile", 0)),
		"statMinimumPercentiles": stats,
	}


static func policy_configured(value) -> bool:
	var policy := normalize_policy(value)
	if int(policy.get("overallMinimumPercentile", 0)) > 0:
		return true
	var stats := policy.get("statMinimumPercentiles", {}) as Dictionary
	for stat_key in STAT_KEYS:
		if int(stats.get(stat_key, 0)) > 0:
			return true
	return false


static func ui_stat_key(stat_key: String) -> String:
	return "%s%s" % [UI_STAT_MINIMUM_PREFIX, stat_key]


static func ui_keys() -> Array[String]:
	var result: Array[String] = [UI_OVERALL_MINIMUM_KEY]
	for stat_key in STAT_KEYS:
		result.append(ui_stat_key(stat_key))
	return result


static func is_ui_key(key: String) -> bool:
	return ui_keys().has(key)


static func with_ui_value(value, key: String, next_value) -> Dictionary:
	var policy := normalize_policy(value)
	var percentile := _normalized_percentile(next_value)
	if key == UI_OVERALL_MINIMUM_KEY:
		policy["overallMinimumPercentile"] = percentile
		return policy
	if key.begins_with(UI_STAT_MINIMUM_PREFIX):
		var stat_key := key.trim_prefix(UI_STAT_MINIMUM_PREFIX)
		if STAT_KEYS.has(stat_key):
			var stats := (policy.get("statMinimumPercentiles", {}) as Dictionary).duplicate(true)
			stats[stat_key] = percentile
			policy["statMinimumPercentiles"] = stats
	return policy


static func evaluate_pet(instance: Dictionary, policy_value) -> Dictionary:
	var policy := normalize_policy(policy_value)
	var screening := PetGrowthScreeningModel.evaluate_pet(instance)
	var preview := _base_preview(instance, policy, screening)
	if not bool(preview.get("configured", false)):
		preview["status"] = "not_configured"
		preview["meetsRetentionRules"] = true
		preview["reasonMessage"] = "尚未设置成长保留门槛；当前只保留宠物。"
		return preview
	var screening_status := str(screening.get("status", ""))
	if screening_status == "unobserved" or screening_status == "observing":
		preview["status"] = "observing"
		preview["reasonMessage"] = "成长仍在观察中；达到 Lv%d 后才会预览处理结果。" % int(screening.get("minimumLevel", 20))
		return preview
	if screening_status != "mature" or not bool(screening.get("growthRuleEligible", false)):
		return preview

	var observation := screening.get("observation", {}) as Dictionary
	var checks: Array[Dictionary] = []
	var overall_minimum := int(policy.get("overallMinimumPercentile", 0))
	if overall_minimum > 0:
		var overall_check := _rule_check("overall", "综合", observation.get("powerPercentile", null), overall_minimum)
		if overall_check.is_empty():
			return preview
		checks.append(overall_check)
	var thresholds := policy.get("statMinimumPercentiles", {}) as Dictionary
	var percentiles_value = observation.get("statPercentiles", {})
	var percentiles := percentiles_value as Dictionary if percentiles_value is Dictionary else {}
	for stat_key in STAT_KEYS:
		var minimum := int(thresholds.get(stat_key, 0))
		if minimum <= 0:
			continue
		var check := _rule_check(stat_key, str(STAT_LABELS.get(stat_key, stat_key)), percentiles.get(stat_key, null), minimum)
		if check.is_empty():
			return preview
		checks.append(check)
	preview["checks"] = checks
	var meets_rules := true
	for check in checks:
		if not bool(check.get("passed", false)):
			meets_rules = false
			break
	preview["meetsRetentionRules"] = meets_rules
	preview["wouldHandle"] = not meets_rules
	preview["previewAction"] = "keep" if meets_rules else "review"
	preview["status"] = "would_keep" if meets_rules else "would_handle"
	preview["reasonMessage"] = (
		"这只宠物达到全部已启用的成长保留门槛。"
		if meets_rules
		else "若未来开启安全处置，这只宠物会进入待处理；当前仍完整保留。"
	)
	return preview


static func evaluate_pets(pets_value, policy_value) -> Dictionary:
	var policy := normalize_policy(policy_value)
	var pets: Array[Dictionary] = []
	if pets_value is Array:
		for entry in pets_value as Array:
			if entry is Dictionary:
				pets.append(entry as Dictionary)
	var items: Array[Dictionary] = []
	for index in range(mini(pets.size(), MAX_PREVIEW_PETS)):
		items.append(evaluate_pet(pets[index], policy))
	var summary := {
		"total": items.size(),
		"wouldKeep": 0,
		"wouldHandle": 0,
		"observing": 0,
		"unavailable": 0,
		"notConfigured": 0,
	}
	for item in items:
		match str(item.get("status", "")):
			"would_keep":
				summary["wouldKeep"] = int(summary["wouldKeep"]) + 1
			"would_handle":
				summary["wouldHandle"] = int(summary["wouldHandle"]) + 1
			"observing":
				summary["observing"] = int(summary["observing"]) + 1
			"not_configured":
				summary["notConfigured"] = int(summary["notConfigured"]) + 1
			_:
				summary["unavailable"] = int(summary["unavailable"]) + 1
	return {
		"schemaVersion": PREVIEW_SCHEMA_VERSION,
		"dryRun": true,
		"retainPet": true,
		"mutationCount": 0,
		"configured": policy_configured(policy),
		"policy": policy,
		"summary": summary,
		"items": items,
		"totalPetCount": pets.size(),
		"truncated": pets.size() > items.size(),
	}


static func contract_check() -> Dictionary:
	var level_twenty := _blue_dragon_fixture(20, {"maxHp": 239, "attack": 63, "defense": 28, "quick": 29})
	var policy := {
		"schemaVersion": 1,
		"overallMinimumPercentile": 91,
		"statMinimumPercentiles": {"maxHp": 90, "attack": 90, "defense": 0, "quick": 40},
	}
	var would_handle := evaluate_pet(level_twenty, policy)
	var would_keep := evaluate_pet(level_twenty, {
		"schemaVersion": 1,
		"overallMinimumPercentile": 85,
		"statMinimumPercentiles": {"maxHp": 85, "attack": 90, "defense": 0, "quick": 30},
	})
	var observing := evaluate_pet(
		_blue_dragon_fixture(19, {"maxHp": 230, "attack": 60, "defense": 27, "quick": 28}),
		policy
	)
	var hidden_canary := level_twenty.duplicate(true)
	hidden_canary["privateSeed"] = "must_not_change_growth_rule_preview"
	hidden_canary["privateRoll"] = {"innateGrowthBonus": {"attack": 999}}
	var checks := would_handle.get("checks", []) as Array
	return {
		"ok": (
			str(would_handle.get("status", "")) == "would_handle"
			and bool(would_handle.get("wouldHandle", false))
			and bool(would_handle.get("retainPet", false))
			and not bool(would_handle.get("mutationPerformed", true))
			and checks.size() == 4
			and not bool((checks[0] as Dictionary).get("passed", true))
			and not bool((checks[1] as Dictionary).get("passed", true))
			and bool((checks[2] as Dictionary).get("passed", false))
			and not bool((checks[3] as Dictionary).get("passed", true))
			and str(would_keep.get("status", "")) == "would_keep"
			and str(observing.get("status", "")) == "observing"
			and JSON.stringify(evaluate_pet(hidden_canary, policy)) == JSON.stringify(would_handle)
			and int(evaluate_pets([level_twenty], policy).get("mutationCount", -1)) == 0
		),
		"wouldHandle": would_handle,
		"wouldKeep": would_keep,
		"observing": observing,
	}


static func _normalized_percentile(value) -> int:
	if value is float and not is_finite(float(value)):
		return 0
	if value is int or value is float:
		return clampi(int(value), 0, 100)
	if value is String and str(value).is_valid_float():
		return clampi(int(float(value)), 0, 100)
	return 0


static func _base_preview(instance: Dictionary, policy: Dictionary, screening: Dictionary) -> Dictionary:
	return {
		"schemaVersion": PREVIEW_SCHEMA_VERSION,
		"dryRun": true,
		"configured": policy_configured(policy),
		"status": "unavailable",
		"meetsRetentionRules": false,
		"wouldHandle": false,
		"previewAction": "keep",
		"retainPet": true,
		"mutationPerformed": false,
		"reasonMessage": "成长资料暂时不可用；本次只保留宠物。",
		"pet": _public_pet_identity(instance),
		"policy": policy.duplicate(true),
		"growth": _public_growth_facts(screening),
		"checks": [],
	}


static func _public_pet_identity(instance: Dictionary) -> Dictionary:
	var name := str(instance.get("name", instance.get("displayName", ""))).strip_edges()
	if name == "":
		name = "宠物"
	return {
		"instanceId": str(instance.get("instanceId", instance.get("petId", ""))).strip_edges(),
		"formId": str(instance.get("formId", instance.get("templateId", ""))).strip_edges(),
		"name": name,
		"level": int(instance.get("level", 0)),
		"state": str(instance.get("state", "")).strip_edges(),
	}


static func _public_growth_facts(screening: Dictionary) -> Dictionary:
	var observation_value = screening.get("observation", {})
	var observation := observation_value as Dictionary if observation_value is Dictionary else {}
	var raw_percentiles = observation.get("statPercentiles", {})
	var percentiles_source := raw_percentiles as Dictionary if raw_percentiles is Dictionary else {}
	var percentiles := {}
	for stat_key in STAT_KEYS:
		if percentiles_source.has(stat_key):
			percentiles[stat_key] = percentiles_source.get(stat_key)
	return {
		"status": str(screening.get("status", "")),
		"level": int(screening.get("level", 0)),
		"observedLevels": int(screening.get("observedLevels", 0)),
		"minimumLevel": int(screening.get("minimumLevel", 20)),
		"overallGrade": str(observation.get("overallGrade", "")),
		"powerPercentile": observation.get("powerPercentile", null),
		"statPercentiles": percentiles,
	}


static func _rule_check(field: String, label: String, actual_value, minimum: int) -> Dictionary:
	if not (actual_value is int or actual_value is float) or not is_finite(float(actual_value)):
		return {}
	var actual := float(actual_value)
	var passed := actual >= float(minimum)
	return {
		"field": field,
		"label": label,
		"actualPercentile": actual,
		"minimumPercentile": minimum,
		"passed": passed,
	}


static func _blue_dragon_fixture(level: int, stats: Dictionary) -> Dictionary:
	var level_one := {"maxHp": 65, "attack": 14, "defense": 9, "quick": 6}
	return {
		"instanceId": "pet_growth_rule_preview_fixture",
		"petId": "pet_growth_rule_preview_fixture",
		"name": "蓝人龙预览",
		"state": "standby",
		"formId": "blue_man_dragon_water10",
		"templateId": "blue_man_dragon_water10",
		"growthModelVersion": "pet_growth_authority_v1",
		"growthSpeciesProfileId": "blue_man_dragon_v1",
		"growthAuthority": {
			"schemaVersion": 1,
			"source": "server",
			"modelVersion": "pet_growth_authority_v1",
			"settledLevel": level,
		},
		"level": level,
		"initialStats": level_one.duplicate(true),
		"growthSpeciesLevel1Stats": level_one.duplicate(true),
		"maxHp": int(stats.get("maxHp", 1)),
		"attack": int(stats.get("attack", 1)),
		"defense": int(stats.get("defense", 1)),
		"quick": int(stats.get("quick", 1)),
	}
