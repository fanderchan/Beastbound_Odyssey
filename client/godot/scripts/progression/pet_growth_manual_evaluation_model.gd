extends RefCounted

const PetGrowthRulePreviewModel := preload("res://scripts/progression/pet_growth_rule_preview_model.gd")
const PetGrowthScreeningModel := preload("res://scripts/progression/pet_growth_screening_model.gd")

const POLICY_STORAGE_KEY := PetGrowthRulePreviewModel.POLICY_KEY
const OVERALL_REFERENCE_KEY := "overall"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const REFERENCE_KEYS: Array[String] = [OVERALL_REFERENCE_KEY, "maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	OVERALL_REFERENCE_KEY: "综合",
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}


static func default_policy() -> Dictionary:
	return PetGrowthRulePreviewModel.default_policy()


static func normalize_policy(value) -> Dictionary:
	return PetGrowthRulePreviewModel.normalize_policy(value)


static func policy_configured(value) -> bool:
	return PetGrowthRulePreviewModel.policy_configured(value)


static func reference_value(value, key: String) -> int:
	var policy := normalize_policy(value)
	if key == OVERALL_REFERENCE_KEY:
		return int(policy.get("overallMinimumPercentile", 0))
	if STAT_KEYS.has(key):
		return int((policy.get("statMinimumPercentiles", {}) as Dictionary).get(key, 0))
	return 0


static func with_reference_value(value, key: String, next_value) -> Dictionary:
	var policy := normalize_policy(value)
	var percentile := clampi(int(next_value), 0, 100)
	if key == OVERALL_REFERENCE_KEY:
		policy["overallMinimumPercentile"] = percentile
	elif STAT_KEYS.has(key):
		var stats := (policy.get("statMinimumPercentiles", {}) as Dictionary).duplicate(true)
		stats[key] = percentile
		policy["statMinimumPercentiles"] = stats
	return policy


static func evaluate_pet(instance: Dictionary, policy_value) -> Dictionary:
	var policy := normalize_policy(policy_value)
	var screening := PetGrowthScreeningModel.evaluate_pet(_public_evidence_instance(instance))
	var level := int(screening.get("level", instance.get("level", 0)))
	var result := {
		"schemaVersion": 1,
		"configured": policy_configured(policy),
		"status": str(screening.get("status", "unavailable")),
		"level": level,
		"observedLevels": int(screening.get("observedLevels", maxi(0, level - 1))),
		"minimumMatureLevel": int(screening.get("minimumLevel", PetGrowthScreeningModel.MINIMUM_LEVEL)),
		"evidenceStage": _evidence_stage(level),
		"nextCheckpointLevel": _next_checkpoint_level(level),
		"recommendation": "manual_review",
		"meetsReferences": false,
		"checks": [],
		"policy": policy.duplicate(true),
		"observation": {},
		"retainPet": true,
		"mutationCount": 0,
	}
	var status := str(result.get("status", "unavailable"))
	if status == "unavailable":
		return result
	if status == "unobserved":
		result["recommendation"] = "continue_observing"
		return result

	var observation_value = screening.get("observation", {})
	var observation := observation_value as Dictionary if observation_value is Dictionary else {}
	result["observation"] = observation.duplicate(true)
	if not bool(result.get("configured", false)):
		result["recommendation"] = "set_references"
		return result

	var checks: Array[Dictionary] = []
	var overall_minimum := int(policy.get("overallMinimumPercentile", 0))
	if overall_minimum > 0:
		var overall_check := _reference_check(
			OVERALL_REFERENCE_KEY,
			observation.get("powerPercentile", null),
			overall_minimum
		)
		if overall_check.is_empty():
			return result
		checks.append(overall_check)
	var stat_minimums := policy.get("statMinimumPercentiles", {}) as Dictionary
	var percentiles_value = observation.get("statPercentiles", {})
	var percentiles := percentiles_value as Dictionary if percentiles_value is Dictionary else {}
	for stat_key in STAT_KEYS:
		var minimum := int(stat_minimums.get(stat_key, 0))
		if minimum <= 0:
			continue
		var check := _reference_check(stat_key, percentiles.get(stat_key, null), minimum)
		if check.is_empty():
			return result
		checks.append(check)
	result["checks"] = checks
	var meets_references := not checks.is_empty()
	for check in checks:
		if not bool(check.get("passed", false)):
			meets_references = false
			break
	result["meetsReferences"] = meets_references
	if level < 5:
		result["recommendation"] = "continue_observing"
	else:
		result["recommendation"] = "continue_training" if meets_references else "consider_release"
	return result


static func contract_check() -> Dictionary:
	var policy := {
		"schemaVersion": 1,
		"overallMinimumPercentile": 91,
		"statMinimumPercentiles": {"maxHp": 90, "attack": 90, "defense": 0, "quick": 40},
	}
	var level_one := _blue_dragon_fixture(1, {"maxHp": 65, "attack": 14, "defense": 9, "quick": 6})
	var level_five := _blue_dragon_fixture(5, {"maxHp": 102, "attack": 24, "defense": 13, "quick": 11})
	var level_ten := _blue_dragon_fixture(10, {"maxHp": 147, "attack": 37, "defense": 18, "quick": 17})
	var level_twenty := _blue_dragon_fixture(20, {"maxHp": 239, "attack": 63, "defense": 28, "quick": 29})
	var unobserved := evaluate_pet(level_one, policy)
	var early := evaluate_pet(level_five, policy)
	var forming := evaluate_pet(level_ten, policy)
	var mature := evaluate_pet(level_twenty, policy)
	var hidden_canary := level_twenty.duplicate(true)
	hidden_canary["privateSeed"] = "must_not_change_manual_growth_evaluation"
	hidden_canary["privateRoll"] = {"growthBonus": {"attack": 9999}}
	hidden_canary["growthSpeciesSeed"] = "must_not_be_read"
	var updated_policy := with_reference_value(policy, OVERALL_REFERENCE_KEY, 85)
	updated_policy = with_reference_value(updated_policy, "maxHp", 85)
	updated_policy = with_reference_value(updated_policy, "quick", 30)
	var mature_after_edit := evaluate_pet(level_twenty, updated_policy)
	return {
		"ok": (
			str(unobserved.get("status", "")) == "unobserved"
			and str(unobserved.get("recommendation", "")) == "continue_observing"
			and str(early.get("evidenceStage", "")) == "early"
			and int(early.get("nextCheckpointLevel", 0)) == 10
			and str(forming.get("evidenceStage", "")) == "forming"
			and int(forming.get("nextCheckpointLevel", 0)) == 20
			and str(mature.get("evidenceStage", "")) == "mature"
			and str(mature.get("recommendation", "")) == "consider_release"
			and not bool(mature.get("meetsReferences", true))
			and str(mature_after_edit.get("recommendation", "")) == "continue_training"
			and bool(mature_after_edit.get("meetsReferences", false))
			and JSON.stringify(evaluate_pet(hidden_canary, policy)) == JSON.stringify(mature)
			and int(mature.get("mutationCount", -1)) == 0
			and bool(mature.get("retainPet", false))
		),
		"unobserved": unobserved,
		"early": early,
		"forming": forming,
		"mature": mature,
		"matureAfterEdit": mature_after_edit,
	}


static func _public_evidence_instance(instance: Dictionary) -> Dictionary:
	var level_one_value = instance.get("growthSpeciesLevel1Stats", instance.get("initialStats", {}))
	var initial_value = instance.get("initialStats", level_one_value)
	var level := int(instance.get("level", 0))
	var model_version := str(instance.get("growthModelVersion", "")).strip_edges()
	if model_version == "" and level_one_value is Dictionary and initial_value is Dictionary:
		model_version = "pet_growth_authority_v1"
	return {
		"instanceId": str(instance.get("instanceId", instance.get("petId", ""))),
		"petId": str(instance.get("petId", instance.get("instanceId", ""))),
		"name": str(instance.get("name", instance.get("displayName", "宠物"))),
		"state": str(instance.get("state", "")),
		"formId": str(instance.get("formId", instance.get("templateId", ""))),
		"templateId": str(instance.get("templateId", instance.get("formId", ""))),
		"growthModelVersion": model_version,
		"growthSpeciesProfileId": str(instance.get("growthSpeciesProfileId", "")),
		"growthAuthority": {
			"schemaVersion": 1,
			"source": "server",
			"modelVersion": model_version,
			"settledLevel": level,
		},
		"level": level,
		"initialStats": initial_value.duplicate(true) if initial_value is Dictionary else {},
		"growthSpeciesLevel1Stats": level_one_value.duplicate(true) if level_one_value is Dictionary else {},
		"maxHp": instance.get("maxHp", null),
		"attack": instance.get("attack", null),
		"defense": instance.get("defense", null),
		"quick": instance.get("quick", null),
	}


static func _reference_check(key: String, actual_value, minimum: int) -> Dictionary:
	if not (actual_value is int or actual_value is float) or not is_finite(float(actual_value)):
		return {}
	var actual := float(actual_value)
	return {
		"key": key,
		"label": str(STAT_LABELS.get(key, key)),
		"actualPercentile": actual,
		"minimumPercentile": minimum,
		"passed": actual >= float(minimum),
	}


static func _evidence_stage(level: int) -> String:
	if level <= 1:
		return "unobserved"
	if level < 5:
		return "very_early"
	if level < 10:
		return "early"
	if level < PetGrowthScreeningModel.MINIMUM_LEVEL:
		return "forming"
	return "mature"


static func _next_checkpoint_level(level: int) -> int:
	if level < 5:
		return 5
	if level < 10:
		return 10
	if level < PetGrowthScreeningModel.MINIMUM_LEVEL:
		return PetGrowthScreeningModel.MINIMUM_LEVEL
	return 0


static func _blue_dragon_fixture(level: int, stats: Dictionary) -> Dictionary:
	var level_one := {"maxHp": 65, "attack": 14, "defense": 9, "quick": 6}
	return {
		"instanceId": "manual_growth_evaluation_fixture",
		"petId": "manual_growth_evaluation_fixture",
		"name": "蓝人龙评估",
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
