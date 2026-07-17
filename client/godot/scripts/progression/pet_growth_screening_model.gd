extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")
const PetGrowthPublicProjectionModel := preload("res://scripts/progression/pet_growth_public_projection_model.gd")

const SCHEMA_VERSION := 1
const OBSERVATION_SCHEMA_VERSION := 1
const MINIMUM_LEVEL := 20
const MAXIMUM_LEVEL := 140
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const GRADE_IDS: Array[String] = ["S", "A", "B", "C", "D"]

const REASON_UNAVAILABLE := "pet_growth_screening_unavailable"
const REASON_UNOBSERVED := "pet_growth_screening_unobserved"
const REASON_OBSERVING := "pet_growth_screening_observing"
const REASON_MATURE := "pet_growth_screening_mature"

const REASON_LABELS := {
	REASON_UNAVAILABLE: "成长观察资料不完整，不能参与自动筛选。",
	REASON_UNOBSERVED: "尚未升级，暂时没有成长观察证据。",
	REASON_OBSERVING: "成长仍在观察中，达到 Lv20 后才能参与自动筛选。",
	REASON_MATURE: "公开成长观察已达到 Lv20 证据门槛。",
}


static func evaluate_pet(instance: Dictionary) -> Dictionary:
	var level_value = instance.get("level", null)
	var level := int(level_value) if level_value is int else 0
	var observed_levels := maxi(0, level - 1)
	var profile_id := str(instance.get("growthSpeciesProfileId", ""))
	var growth_profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	var form_id := str(instance.get("formId", ""))
	var template_id := str(instance.get("templateId", ""))
	var initial := _strict_stat_map(instance.get("initialStats", null))
	var species_level_one := _strict_stat_map(instance.get("growthSpeciesLevel1Stats", null))
	var current := _strict_current_stat_map(instance)
	if (
		not PetGrowthPublicProjectionModel.has_server_authority_marker(instance)
		or str(instance.get("growthModelVersion", "")) != PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1
		or level < 1
		or level > MAXIMUM_LEVEL
		or profile_id == ""
		or profile_id != profile_id.strip_edges()
		or growth_profile.is_empty()
		or form_id == ""
		or form_id != form_id.strip_edges()
		or template_id != form_id
		or str(growth_profile.get("formId", "")) != form_id
		or initial.is_empty()
		or species_level_one.is_empty()
		or current.is_empty()
		or not _same_stat_map(initial, species_level_one)
		or (level > 1 and _has_stat_regression(initial, current))
	):
		return _unavailable(level, observed_levels)

	var raw_observation := PetGrowthObservationModel.evaluate_pet(instance)
	if (
		int(raw_observation.get("schemaVersion", 0)) != OBSERVATION_SCHEMA_VERSION
		or str(raw_observation.get("profileId", "")) != profile_id
		or int(raw_observation.get("level", 0)) != level
		or int(raw_observation.get("observedLevels", -1)) != observed_levels
	):
		return _unavailable(level, observed_levels)

	var observation := {
		"schemaVersion": OBSERVATION_SCHEMA_VERSION,
		"profileId": profile_id,
		"level": level,
		"observedLevels": observed_levels,
		"statAverages": {},
		"statPercentiles": {},
		"statGrades": {},
		"powerGrowthPerLevel": 0.0,
		"powerPercentile": 0.0,
		"overallGrade": "未观察",
	}
	if level == 1:
		if bool(raw_observation.get("hasRecord", true)) or str(raw_observation.get("overallGrade", "")) != "未观察":
			return _unavailable(level, observed_levels)
		return _result("unobserved", REASON_UNOBSERVED, observation)

	var stat_averages := _strict_numeric_stat_map(raw_observation.get("statAverages", null))
	var stat_percentiles := _strict_numeric_stat_map(raw_observation.get("statPercentiles", null))
	var stat_grades := _strict_grade_stat_map(raw_observation.get("statGrades", null))
	var power_growth = raw_observation.get("powerGrowthPerLevel", null)
	var power_percentile = raw_observation.get("powerPercentile", null)
	var overall_grade := str(raw_observation.get("overallGrade", ""))
	if (
		not bool(raw_observation.get("hasRecord", false))
		or stat_averages.is_empty()
		or stat_percentiles.is_empty()
		or stat_grades.is_empty()
		or not (power_growth is int or power_growth is float) or not is_finite(float(power_growth))
		or not (power_percentile is int or power_percentile is float) or not is_finite(float(power_percentile))
		or not GRADE_IDS.has(overall_grade)
	):
		return _unavailable(level, observed_levels)
	observation["statAverages"] = stat_averages
	observation["statPercentiles"] = stat_percentiles
	observation["statGrades"] = stat_grades
	observation["powerGrowthPerLevel"] = float(power_growth)
	observation["powerPercentile"] = float(power_percentile)
	observation["overallGrade"] = overall_grade
	return _result(
		"mature" if level >= MINIMUM_LEVEL else "observing",
		REASON_MATURE if level >= MINIMUM_LEVEL else REASON_OBSERVING,
		observation
	)


static func contract_check() -> Dictionary:
	var level_twenty := _blue_dragon_fixture(20, {"maxHp": 239, "attack": 63, "defense": 28, "quick": 29})
	var mature := evaluate_pet(level_twenty)
	var level_nineteen := _blue_dragon_fixture(19, {"maxHp": 230, "attack": 60, "defense": 27, "quick": 28})
	var observing := evaluate_pet(level_nineteen)
	var level_one := _blue_dragon_fixture(1, {"maxHp": 65, "attack": 14, "defense": 9, "quick": 6})
	var unobserved := evaluate_pet(level_one)
	var hidden_canary := level_twenty.duplicate(true)
	hidden_canary["privateSeed"] = "must_not_change_public_growth_screening"
	hidden_canary["privateRoll"] = {"innateGrowthBonus": {"attack": 999}}
	var mismatch := level_twenty.duplicate(true)
	(mismatch["growthSpeciesLevel1Stats"] as Dictionary)["attack"] = 15
	var wrong_form := level_twenty.duplicate(true)
	wrong_form["formId"] = "wuli_normal_orange_fire10"
	var regressed_stat := level_twenty.duplicate(true)
	regressed_stat["attack"] = 13
	var legacy := level_twenty.duplicate(true)
	legacy["growthModelVersion"] = PetGrowthPublicProjectionModel.MODEL_LEGACY_SPECIES_LINEAR
	var mature_observation := mature.get("observation", {}) as Dictionary
	var mature_averages := mature_observation.get("statAverages", {}) as Dictionary
	var mature_percentiles := mature_observation.get("statPercentiles", {}) as Dictionary
	var mature_grades := mature_observation.get("statGrades", {}) as Dictionary
	return {
		"ok": (
			str(mature.get("status", "")) == "mature"
			and bool(mature.get("growthRuleEligible", false))
			and bool(mature.get("retainPet", false))
			and int(mature.get("observedLevels", 0)) == 19
			and str(mature_observation.get("overallGrade", "")) == "A"
			and is_equal_approx(float(mature_observation.get("powerGrowthPerLevel", -1.0)), 7.105)
			and is_equal_approx(float(mature_observation.get("powerPercentile", -1.0)), 90.0)
			and is_equal_approx(float(mature_averages.get("maxHp", -1.0)), 9.158)
			and is_equal_approx(float(mature_averages.get("attack", -1.0)), 2.579)
			and is_equal_approx(float(mature_averages.get("defense", -1.0)), 1.0)
			and is_equal_approx(float(mature_averages.get("quick", -1.0)), 1.211)
			and is_equal_approx(float(mature_percentiles.get("maxHp", -1.0)), 89.0)
			and is_equal_approx(float(mature_percentiles.get("attack", -1.0)), 91.9)
			and is_equal_approx(float(mature_percentiles.get("defense", -1.0)), 38.7)
			and is_equal_approx(float(mature_percentiles.get("quick", -1.0)), 30.4)
			and mature_grades == {"maxHp": "A", "attack": "A", "defense": "C", "quick": "C"}
			and str(observing.get("status", "")) == "observing"
			and not bool(observing.get("growthRuleEligible", true))
			and int(observing.get("remainingLevels", 0)) == 1
			and str(unobserved.get("status", "")) == "unobserved"
			and int(unobserved.get("remainingLevels", 0)) == 19
			and JSON.stringify(evaluate_pet(hidden_canary)) == JSON.stringify(mature)
			and str(evaluate_pet(mismatch).get("status", "")) == "unavailable"
			and str(evaluate_pet(wrong_form).get("status", "")) == "unavailable"
			and str(evaluate_pet(regressed_stat).get("status", "")) == "unavailable"
			and str(evaluate_pet(legacy).get("status", "")) == "unavailable"
		),
		"mature": mature,
		"observing": observing,
		"unobserved": unobserved,
	}


static func _result(status: String, reason_code: String, observation: Dictionary) -> Dictionary:
	var level := int(observation.get("level", 0))
	return {
		"schemaVersion": SCHEMA_VERSION,
		"status": status,
		"growthRuleEligible": status == "mature",
		"retainPet": true,
		"reasonCode": reason_code,
		"reasonLabel": str(REASON_LABELS.get(reason_code, REASON_LABELS[REASON_UNAVAILABLE])),
		"minimumLevel": MINIMUM_LEVEL,
		"level": level,
		"observedLevels": int(observation.get("observedLevels", 0)),
		"remainingLevels": maxi(0, MINIMUM_LEVEL - level),
		"observation": observation.duplicate(true),
	}


static func _unavailable(level: int, observed_levels: int) -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"status": "unavailable",
		"growthRuleEligible": false,
		"retainPet": true,
		"reasonCode": REASON_UNAVAILABLE,
		"reasonLabel": str(REASON_LABELS[REASON_UNAVAILABLE]),
		"minimumLevel": MINIMUM_LEVEL,
		"level": level,
		"observedLevels": observed_levels,
		"remainingLevels": maxi(0, MINIMUM_LEVEL - level),
		"observation": {},
	}


static func _strict_stat_map(value) -> Dictionary:
	if not (value is Dictionary) or (value as Dictionary).size() != STAT_KEYS.size():
		return {}
	var source := value as Dictionary
	var result := {}
	for key in STAT_KEYS:
		if not source.has(key) or not (source.get(key) is int) or int(source.get(key)) < 1:
			return {}
		result[key] = int(source.get(key))
	return result


static func _strict_current_stat_map(instance: Dictionary) -> Dictionary:
	var source := {}
	for key in STAT_KEYS:
		source[key] = instance.get(key, null)
	return _strict_stat_map(source)


static func _strict_numeric_stat_map(value) -> Dictionary:
	if not (value is Dictionary) or (value as Dictionary).size() != STAT_KEYS.size():
		return {}
	var source := value as Dictionary
	var result := {}
	for key in STAT_KEYS:
		var number = source.get(key, null)
		if not (number is int or number is float) or not is_finite(float(number)):
			return {}
		result[key] = float(number)
	return result


static func _strict_grade_stat_map(value) -> Dictionary:
	if not (value is Dictionary) or (value as Dictionary).size() != STAT_KEYS.size():
		return {}
	var source := value as Dictionary
	var result := {}
	for key in STAT_KEYS:
		var grade := str(source.get(key, ""))
		if not GRADE_IDS.has(grade):
			return {}
		result[key] = grade
	return result


static func _same_stat_map(left: Dictionary, right: Dictionary) -> bool:
	for key in STAT_KEYS:
		if int(left.get(key, 0)) != int(right.get(key, 0)):
			return false
	return true


static func _has_stat_regression(initial: Dictionary, current: Dictionary) -> bool:
	for key in STAT_KEYS:
		if int(current.get(key, 0)) < int(initial.get(key, 0)):
			return true
	return false


static func _blue_dragon_fixture(level: int, stats: Dictionary) -> Dictionary:
	var level_one := {"maxHp": 65, "attack": 14, "defense": 9, "quick": 6}
	return {
		"instanceId": "pet_growth_screening_fixture",
		"petId": "pet_growth_screening_fixture",
		"formId": "blue_man_dragon_water10",
		"templateId": "blue_man_dragon_water10",
		"growthModelVersion": PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1,
		"growthSpeciesProfileId": "blue_man_dragon_v1",
		"growthAuthority": {
			"schemaVersion": 1,
			"source": "server",
			"modelVersion": PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1,
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
