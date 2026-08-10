extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")

const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命成长",
	"attack": "攻击成长",
	"defense": "防御成长",
	"quick": "敏捷成长",
}
const OVERALL_KEY := "power"
const OVERALL_LABEL := "总成长"
const DEFAULT_COLOR := Color(0.82, 0.84, 0.86, 1.0)


static func default_stage_for_instance(instance: Dictionary) -> int:
	if PetGrowthObservationModel.is_evolution_pet(instance) or PetGrowthObservationModel.is_fusion_pet(instance):
		return 2
	var cultivation = instance.get("petCultivation", {})
	if cultivation is Dictionary:
		return clampi(int((cultivation as Dictionary).get("rebirthCount", 0)), 0, 2)
	return 0


static func presentation_for_instance(instance: Dictionary, stage: int = 0) -> Dictionary:
	if instance.is_empty():
		return unobserved_presentation()
	var safe_stage := clampi(stage, 0, 2)
	var observation := PetGrowthObservationModel.evaluate_pet_for_stage(instance, safe_stage)
	if observation.is_empty():
		return unobserved_presentation()
	var benchmark := _benchmark_for_instance_stage(instance, safe_stage, observation)
	return presentation_for_observation(
		observation,
		benchmark,
		_requires_observation_maturity(safe_stage, observation)
	)


static func presentation_for_observation(
	observation: Dictionary,
	benchmark: Dictionary,
	requires_observation_maturity: bool = true
) -> Dictionary:
	var observed_levels := maxi(0, int(observation.get("observedLevels", 0)))
	var level := clampi(int(observation.get("level", observed_levels + 1)), 1, 140)
	var averages := _numeric_map(observation.get("statAverages", {}))
	var percentiles := _numeric_map(observation.get("statPercentiles", {}))
	var has_record := bool(observation.get("hasRecord", not averages.is_empty()))
	if observed_levels <= 0 and requires_observation_maturity:
		has_record = false
	if not has_record:
		return unobserved_presentation(level, observed_levels)

	var contract := _contract()
	var minimum_level := int(contract.get("minimumMatureLevel", 20))
	var minimum_observed := int(contract.get("minimumMatureObservedLevels", 19))
	var mature := (
		not requires_observation_maturity
		or (level >= minimum_level and observed_levels >= minimum_observed)
	)
	var overall_percentile := clampf(float(observation.get("powerPercentile", 0.0)), 0.0, 100.0)
	var overall_band := quality_band_for_percentile(overall_percentile)
	var rows: Array[Dictionary] = []
	var burst_keys: Array[String] = []
	var burst_allowed := _burst_allowed(level, observed_levels)
	var overall_row := _row_presentation(
		OVERALL_KEY,
		OVERALL_LABEL,
		observation.get("powerGrowthPerLevel", null),
		benchmark.get("power", null),
		overall_percentile,
		burst_allowed
	)
	rows.append(overall_row)
	if bool(overall_row.get("burst", false)):
		burst_keys.append(OVERALL_KEY)
	for key in STAT_KEYS:
		var row := _row_presentation(
			key,
			str(STAT_LABELS.get(key, key)),
			averages.get(key, null),
			(benchmark.get("stats", {}) as Dictionary).get(key, null),
			float(percentiles.get(key, 0.0)),
			burst_allowed
		)
		rows.append(row)
		if bool(row.get("burst", false)):
			burst_keys.append(key)

	var badge_text := "%s·%s" % [
		str(overall_band.get("colorName", "")),
		str(overall_band.get("qualityName", "")),
	]
	if not mature:
		badge_text += "｜%s" % str(contract.get("observingSuffix", "观察中"))
	return {
		"schemaVersion": 1,
		"presentationId": str(contract.get("presentationId", "pet_growth_quality_v1")),
		"available": true,
		"level": level,
		"observedLevels": observed_levels,
		"mature": mature,
		"preliminary": not mature,
		"gradeId": str(overall_band.get("gradeId", "D")),
		"toneId": str(overall_band.get("toneId", "blue")),
		"colorHex": str(overall_band.get("colorHex", "#49A9FF")),
		"colorName": str(overall_band.get("colorName", "蓝")),
		"qualityName": str(overall_band.get("qualityName", "普通")),
		"badgeText": badge_text,
		"statusText": (
			"已观察%d级成长" % observed_levels
			if mature
			else "已观察%d级，Lv%d后定档" % [observed_levels, minimum_level]
		),
		"benchmarkLabel": str(benchmark.get("label", "当前形态公开上限")),
		"burstAny": not burst_keys.is_empty(),
		"burstKeys": burst_keys,
		"burstLabel": str((contract.get("burst", {}) as Dictionary).get("label", "爆")),
		"rows": rows,
	}


static func unobserved_presentation(level: int = 1, observed_levels: int = 0) -> Dictionary:
	var contract := _contract()
	var unobserved := contract.get("unobserved", {}) as Dictionary
	return {
		"schemaVersion": 1,
		"presentationId": str(contract.get("presentationId", "pet_growth_quality_v1")),
		"available": false,
		"level": clampi(level, 1, 140),
		"observedLevels": maxi(0, observed_levels),
		"mature": false,
		"preliminary": false,
		"gradeId": "",
		"toneId": str(unobserved.get("toneId", "unobserved")),
		"colorHex": str(unobserved.get("colorHex", "#87909C")),
		"colorName": "",
		"qualityName": "",
		"badgeText": str(unobserved.get("label", "成长未观察")),
		"statusText": "Lv1四维独立显示，升级后开始观察成长",
		"benchmarkLabel": "当前形态公开上限",
		"burstAny": false,
		"burstKeys": [],
		"burstLabel": str((contract.get("burst", {}) as Dictionary).get("label", "爆")),
		"rows": [],
	}


static func quality_band_for_percentile(percentile: float) -> Dictionary:
	var safe_percentile := clampf(percentile, 0.0, 100.0)
	for value in _contract().get("qualityBands", []):
		if not (value is Dictionary):
			continue
		var band := value as Dictionary
		if safe_percentile >= float(band.get("minimumPercentile", 0.0)):
			return band.duplicate(true)
	return {
		"gradeId": "D",
		"minimumPercentile": 0,
		"colorName": "蓝",
		"qualityName": "普通",
		"toneId": "blue",
		"colorHex": "#49A9FF",
	}


static func quality_band_for_grade(grade_id: String) -> Dictionary:
	var normalized := grade_id.strip_edges().to_upper()
	for value in _contract().get("qualityBands", []):
		if value is Dictionary and str((value as Dictionary).get("gradeId", "")) == normalized:
			return (value as Dictionary).duplicate(true)
	return {}


static func grade_display_text(grade_id: String, percentile = null) -> String:
	var band := quality_band_for_grade(grade_id)
	if band.is_empty():
		return grade_id if grade_id != "" else "未观察"
	var prefix := "%s·%s" % [
		str(band.get("colorName", "")),
		str(band.get("qualityName", "")),
	]
	if percentile is int or percentile is float:
		return "%s %.0f%%" % [prefix, float(percentile)]
	return prefix


static func color_for_tone(tone_id: String, fallback_hex: String = "") -> Color:
	if fallback_hex.is_valid_html_color():
		return Color.from_string(fallback_hex, DEFAULT_COLOR)
	var normalized := tone_id.strip_edges()
	for value in _contract().get("qualityBands", []):
		if value is Dictionary and str((value as Dictionary).get("toneId", "")) == normalized:
			var color_hex := str((value as Dictionary).get("colorHex", ""))
			if color_hex.is_valid_html_color():
				return Color.from_string(color_hex, DEFAULT_COLOR)
	var unobserved := _contract().get("unobserved", {}) as Dictionary
	var unobserved_hex := str(unobserved.get("colorHex", "#87909C"))
	return Color.from_string(unobserved_hex, DEFAULT_COLOR)


static func color_for_grade(grade_id: String) -> Color:
	var band := quality_band_for_grade(grade_id)
	return color_for_tone(str(band.get("toneId", "unobserved")), str(band.get("colorHex", "")))


static func rainbow_colors() -> Array[Color]:
	var colors: Array[Color] = []
	for value in _contract().get("rainbowStops", []):
		var color_hex := str(value)
		if color_hex.is_valid_html_color():
			colors.append(Color.from_string(color_hex, DEFAULT_COLOR))
	if colors.is_empty():
		colors = [
			Color(0.29, 0.66, 1.0, 1.0),
			Color(0.72, 0.45, 1.0, 1.0),
			Color(1.0, 0.33, 0.39, 1.0),
			Color(1.0, 0.61, 0.24, 1.0),
			Color(0.96, 0.85, 0.37, 1.0),
		]
	return colors


static func validate_contract() -> Array[String]:
	var errors: Array[String] = []
	var contract := _contract()
	if int(contract.get("schemaVersion", 0)) != 1:
		errors.append("成长品质呈现 schemaVersion 必须为1")
	if str(contract.get("presentationId", "")) == "":
		errors.append("成长品质呈现缺少 presentationId")
	if int(contract.get("minimumMatureLevel", 0)) != 20:
		errors.append("成长正式定档等级必须为Lv20")
	if int(contract.get("minimumMatureObservedLevels", 0)) != 19:
		errors.append("成长正式定档必须需要19次升级证据")
	var expected_grades: Array[String] = ["S", "A", "B", "C", "D"]
	var expected_minimums: Array[float] = [95.0, 85.0, 55.0, 25.0, 0.0]
	var expected_tones: Array[String] = ["rainbow", "red", "orange", "purple", "blue"]
	var bands = contract.get("qualityBands", [])
	if not (bands is Array) or (bands as Array).size() != expected_grades.size():
		errors.append("成长品质必须恰好配置S/A/B/C/D五档")
	else:
		for index in range(expected_grades.size()):
			var value = (bands as Array)[index]
			if not (value is Dictionary):
				errors.append("成长品质第%d档不是对象" % index)
				continue
			var band := value as Dictionary
			if str(band.get("gradeId", "")) != expected_grades[index]:
				errors.append("成长品质档位顺序必须为S/A/B/C/D")
			if not is_equal_approx(float(band.get("minimumPercentile", -1.0)), expected_minimums[index]):
				errors.append("%s档分位门槛不正确" % expected_grades[index])
			if str(band.get("toneId", "")) != expected_tones[index]:
				errors.append("%s档颜色映射不正确" % expected_grades[index])
	var burst := contract.get("burst", {}) as Dictionary
	if int(burst.get("minimumLevel", 0)) != 20 or int(burst.get("minimumObservedLevels", 0)) != 19:
		errors.append("爆字必须到Lv20且已有19次升级证据后才开放")
	if str(burst.get("comparison", "")) != "public_observed_average_gt_public_top_benchmark":
		errors.append("爆字只能比较公开实测均值与公开上限")
	return errors


static func selftest() -> Array[String]:
	var errors := validate_contract()
	var boundary_cases := [
		{"percentile": 0.0, "grade": "D"},
		{"percentile": 24.9, "grade": "D"},
		{"percentile": 25.0, "grade": "C"},
		{"percentile": 54.9, "grade": "C"},
		{"percentile": 55.0, "grade": "B"},
		{"percentile": 84.9, "grade": "B"},
		{"percentile": 85.0, "grade": "A"},
		{"percentile": 94.9, "grade": "A"},
		{"percentile": 95.0, "grade": "S"},
	]
	for test_case in boundary_cases:
		var actual := quality_band_for_percentile(float(test_case.get("percentile", 0.0)))
		if str(actual.get("gradeId", "")) != str(test_case.get("grade", "")):
			errors.append("品质分位边界错误：%s" % JSON.stringify(test_case))
	var benchmark := {
		"label": "测试公开上限",
		"power": 5.0,
		"stats": {"maxHp": 8.0, "attack": 2.0, "defense": 1.0, "quick": 1.0},
	}
	var observation := {
		"level": 2,
		"observedLevels": 1,
		"hasRecord": true,
		"statAverages": {"maxHp": 9.0, "attack": 2.0, "defense": 1.0, "quick": 1.0},
		"statPercentiles": {"maxHp": 100.0, "attack": 55.0, "defense": 25.0, "quick": 0.0},
		"powerGrowthPerLevel": 5.25,
		"powerPercentile": 95.0,
	}
	var preliminary := presentation_for_observation(observation, benchmark, true)
	if not bool(preliminary.get("preliminary", false)) or bool(preliminary.get("burstAny", true)):
		errors.append("Lv2必须显示观察中且不能触发爆字")
	observation["level"] = 20
	observation["observedLevels"] = 19
	var mature := presentation_for_observation(observation, benchmark, true)
	if not bool(mature.get("mature", false)) or not bool(mature.get("burstAny", false)):
		errors.append("Lv20公开实测超过上限时必须触发爆字")
	if not (mature.get("burstKeys", []) as Array).has("maxHp"):
		errors.append("爆字必须落到实际超过上限的成长项")
	var unobserved := presentation_for_observation({
		"level": 1,
		"observedLevels": 0,
		"hasRecord": false,
	}, benchmark, true)
	if bool(unobserved.get("available", true)) or str(unobserved.get("badgeText", "")) != "成长未观察":
		errors.append("Lv1必须保持成长未观察")
	var wuli_profile := BalanceCatalogModel.pet_growth_species_profile("wuli_normal_orange_fire10_v1")
	var wuli_benchmark := _species_benchmark(wuli_profile)
	if (
		not is_equal_approx(float((wuli_benchmark.get("stats", {}) as Dictionary).get("maxHp", 0.0)), 9.65)
		or not is_equal_approx(float(wuli_benchmark.get("power", 0.0)), 7.5925)
	):
		errors.append("普通乌力公开成长上限计算错误")
	return errors


static func _row_presentation(
	key: String,
	label: String,
	value,
	benchmark_value,
	percentile: float,
	burst_allowed: bool
) -> Dictionary:
	var has_value := value is int or value is float
	var has_benchmark := (
		(benchmark_value is int or benchmark_value is float)
		and float(benchmark_value) > 0.0
	)
	var numeric_value := float(value) if has_value else 0.0
	var numeric_benchmark := float(benchmark_value) if has_benchmark else 0.0
	var band := quality_band_for_percentile(percentile)
	var epsilon := float((_contract().get("burst", {}) as Dictionary).get("epsilon", 0.0005))
	var burst := (
		burst_allowed
		and has_value
		and has_benchmark
		and numeric_value > numeric_benchmark + epsilon
	)
	return {
		"key": key,
		"label": label,
		"available": has_value and has_benchmark,
		"value": snappedf(numeric_value, 0.001),
		"benchmark": snappedf(numeric_benchmark, 0.001),
		"ratio": clampf(numeric_value / numeric_benchmark, 0.0, 1.0) if has_benchmark else 0.0,
		"percentile": snappedf(clampf(percentile, 0.0, 100.0), 0.1),
		"gradeId": str(band.get("gradeId", "D")),
		"toneId": str(band.get("toneId", "blue")),
		"colorHex": str(band.get("colorHex", "#49A9FF")),
		"qualityName": str(band.get("qualityName", "普通")),
		"burst": burst,
	}


static func _benchmark_for_instance_stage(
	instance: Dictionary,
	stage: int,
	observation: Dictionary
) -> Dictionary:
	if _requires_species_benchmark(stage, observation):
		var profile_id := str(observation.get(
			"profileId",
			instance.get("growthSpeciesProfileId", "")
		)).strip_edges()
		var species_benchmark := _species_benchmark(
			BalanceCatalogModel.pet_growth_species_profile(profile_id)
		)
		if bool(observation.get("evolutionHistory", false)) and stage > 0:
			return _combined_benchmark(
				species_benchmark,
				_rebirth_benchmark(stage),
				"进化前%d转公开上限" % stage
			)
		return species_benchmark
	return _rebirth_benchmark(stage)


static func _requires_species_benchmark(stage: int, observation: Dictionary) -> bool:
	return (
		stage <= 0
		or bool(observation.get("evolutionHistory", false))
		or bool(observation.get("evolutionCurrent", false))
		or bool(observation.get("fusionCurrent", false))
	)


static func _requires_observation_maturity(_stage: int, _observation: Dictionary) -> bool:
	return true


static func _species_benchmark(profile: Dictionary) -> Dictionary:
	if profile.is_empty():
		return {"label": "当前形态公开上限", "power": 0.0, "stats": {}}
	var output := profile.get("outputGrowth", {}) as Dictionary
	var rules := profile.get("individualRules", {}) as Dictionary
	var spread := rules.get("growthOutputSpread", {}) as Dictionary
	var stats := {}
	var power := 0.0
	var weights := BalanceCatalogModel.pet_power_weights()
	for key in STAT_KEYS:
		var range_value = spread.get(key, [])
		var maximum_spread := 0.0
		if range_value is Array and (range_value as Array).size() >= 2:
			maximum_spread = float((range_value as Array)[1])
		var maximum := float(output.get(key, 0.0)) + maximum_spread
		stats[key] = snappedf(maximum, 0.0001)
		power += maximum * float(weights.get(key, 1.0))
	return {
		"label": "当前形态公开上限",
		"power": snappedf(power, 0.0001),
		"stats": stats,
	}


static func _rebirth_benchmark(stage: int) -> Dictionary:
	var balance := BalanceCatalogModel.pet_rebirth_balance()
	var evaluation := balance.get("evaluation", {}) as Dictionary
	var all_thresholds := evaluation.get("stageThresholds", {}) as Dictionary
	var thresholds := all_thresholds.get(str(clampi(stage, 1, 2)), {}) as Dictionary
	var threshold_stats := thresholds.get("stats", {}) as Dictionary
	var internal_power := balance.get("internalPower", {}) as Dictionary
	var hp_scale := maxf(0.001, float(internal_power.get("maxHpScale", 4.0)))
	var stats := {}
	for key in STAT_KEYS:
		var maximum := float((threshold_stats.get(key, {}) as Dictionary).get("max", 0.0))
		stats[key] = snappedf(maximum * hp_scale if key == "maxHp" else maximum, 0.0001)
	return {
		"label": "%d转公开上限" % clampi(stage, 1, 2),
		"power": snappedf(float((thresholds.get("power", {}) as Dictionary).get("max", 0.0)), 0.0001),
		"stats": stats,
	}


static func _combined_benchmark(
	base: Dictionary,
	increment: Dictionary,
	label: String
) -> Dictionary:
	var base_stats := base.get("stats", {}) as Dictionary
	var increment_stats := increment.get("stats", {}) as Dictionary
	var stats := {}
	for key in STAT_KEYS:
		stats[key] = snappedf(
			float(base_stats.get(key, 0.0))
			+ float(increment_stats.get(key, 0.0)),
			0.0001
		)
	return {
		"label": label,
		"power": snappedf(
			float(base.get("power", 0.0))
			+ float(increment.get("power", 0.0)),
			0.0001
		),
		"stats": stats,
	}


static func _burst_allowed(level: int, observed_levels: int) -> bool:
	var burst := _contract().get("burst", {}) as Dictionary
	return (
		level >= int(burst.get("minimumLevel", 20))
		and observed_levels >= int(burst.get("minimumObservedLevels", 19))
	)


static func _numeric_map(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var result := {}
	for key in STAT_KEYS:
		var entry = (value as Dictionary).get(key, null)
		if entry is int or entry is float:
			result[key] = float(entry)
	return result


static func _contract() -> Dictionary:
	return BalanceCatalogModel.pet_growth_quality_presentation()
