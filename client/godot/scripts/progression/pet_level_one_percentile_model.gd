extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")

const SCHEMA_VERSION := 1
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const DISTRIBUTIONS: Array[String] = ["uniform", "weighted_center", "rare_spike"]
const MAX_ABSOLUTE_PROFILE_VALUE := 1000000.0


static func evaluate_pet(instance: Dictionary) -> Dictionary:
	var profile_id := str(instance.get("growthSpeciesProfileId", "")).strip_edges()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	var form_id := str(instance.get("formId", instance.get("templateId", ""))).strip_edges()
	var initial := _strict_stat_map(instance.get("initialStats", null))
	var species_initial := _strict_stat_map(instance.get("growthSpeciesLevel1Stats", null))
	if (
		profile_id == ""
		or profile.is_empty()
		or form_id == ""
		or str(profile.get("formId", "")) != form_id
		or initial.is_empty()
		or species_initial.is_empty()
		or initial != species_initial
	):
		return _unavailable(profile_id)
	var percentiles := {}
	for stat_key in STAT_KEYS:
		var percentile = level_one_stat_percentile(profile, stat_key, int(initial.get(stat_key, 0)))
		if percentile == null:
			return _unavailable(profile_id)
		percentiles[stat_key] = float(percentile)
	return {
		"schemaVersion": SCHEMA_VERSION,
		"ok": true,
		"profileId": profile_id,
		"levelOneFourV": initial.duplicate(true),
		"statPercentiles": percentiles,
	}


static func radar_values(instance: Dictionary) -> Dictionary:
	var evaluation := evaluate_pet(instance)
	var percentiles := evaluation.get("statPercentiles", {}) as Dictionary
	var result := {}
	for stat_key in STAT_KEYS:
		result[stat_key] = clampf(float(percentiles.get(stat_key, 0.0)) / 100.0, 0.0, 1.0)
	return result


static func radar_labels(instance: Dictionary) -> Dictionary:
	var evaluation := evaluate_pet(instance)
	var percentiles := evaluation.get("statPercentiles", {}) as Dictionary
	var result := {}
	for stat_key in STAT_KEYS:
		if not percentiles.has(stat_key):
			result[stat_key] = "--"
			continue
		var value := float(percentiles.get(stat_key, 0.0))
		result[stat_key] = "%d%%" % int(round(value)) if is_equal_approx(value, round(value)) else "%.1f%%" % value
	return result


static func summary_text(instance: Dictionary) -> String:
	var evaluation := evaluate_pet(instance)
	if not bool(evaluation.get("ok", false)):
		return "Lv1 4V分位：资料不足"
	var percentiles := evaluation.get("statPercentiles", {}) as Dictionary
	return "Lv1 4V分位：生命%s 攻击%s 防御%s 敏捷%s" % [
		_percentile_text(percentiles.get("maxHp", 0.0)),
		_percentile_text(percentiles.get("attack", 0.0)),
		_percentile_text(percentiles.get("defense", 0.0)),
		_percentile_text(percentiles.get("quick", 0.0)),
	]


static func level_one_stat_percentile(profile: Dictionary, stat_key: String, visible_value: int):
	var facts := _strict_profile_facts(profile, stat_key)
	if facts.is_empty() or visible_value < 1:
		return null
	var minimum := float(facts.get("minimum", 0.0))
	var maximum := float(facts.get("maximum", 0.0))
	var first_bonus := int(floor(minimum)) - 2
	var last_bonus := int(ceil(maximum)) + 2
	var maximum_accepted_bonus = null
	var lower := first_bonus
	var upper := last_bonus
	while lower <= upper:
		var bonus := int(floor(float(lower + upper) / 2.0))
		if _visible_stat_for_rounded_bonus(float(facts.get("base", 0.0)), bonus) <= visible_value:
			maximum_accepted_bonus = bonus
			lower = bonus + 1
		else:
			upper = bonus - 1
	if maximum_accepted_bonus == null:
		return 0.0
	var percentile := _rounded_bonus_cdf(facts, int(maximum_accepted_bonus)) * 100.0
	return _round_to(clampf(percentile, 0.0, 100.0), 1)


static func distribution_cdf(distribution: String, rare_extreme_rate: float, unit_value: float):
	if not is_finite(unit_value):
		return null
	if unit_value < 0.0:
		return 0.0
	if unit_value >= 1.0:
		return 1.0
	if distribution == "uniform":
		return unit_value
	var rare_rate := clampf(rare_extreme_rate, 0.0, 0.25)
	if distribution == "rare_spike":
		return (1.0 - rare_rate) * _rare_spike_body_cdf(unit_value) + rare_rate * _rare_spike_tail_cdf(unit_value)
	if distribution == "weighted_center":
		return (1.0 - rare_rate) * _weighted_center_body_cdf(unit_value) + rare_rate * 0.5
	return null


static func contract_check() -> Dictionary:
	var blue := _blue_dragon_fixture()
	var evaluated := evaluate_pet(blue)
	var percentiles := evaluated.get("statPercentiles", {}) as Dictionary
	var hidden_canary := blue.duplicate(true)
	hidden_canary["privateSeed"] = "must_not_change_lv1_percentiles"
	hidden_canary["privateRoll"] = {"initialBonus": {"maxHp": 99999}}
	hidden_canary["growthSpeciesRoll"] = {"growthBonus": {"attack": 99999}}
	return {
		"ok": (
			bool(evaluated.get("ok", false))
			and is_equal_approx(float(percentiles.get("maxHp", -1.0)), 15.0)
			and is_equal_approx(float(percentiles.get("attack", -1.0)), 87.5)
			and is_equal_approx(float(percentiles.get("defense", -1.0)), 75.0)
			and is_equal_approx(float(percentiles.get("quick", -1.0)), 87.5)
			and JSON.stringify(evaluate_pet(hidden_canary)) == JSON.stringify(evaluated)
			and is_equal_approx(float(distribution_cdf("weighted_center", 0.02, 0.0)), 0.01)
			and is_equal_approx(float(distribution_cdf("weighted_center", 0.02, 0.5)), 0.5)
			and is_equal_approx(float(distribution_cdf("rare_spike", 0.02, 0.72)), 0.98)
		),
		"evaluation": evaluated,
		"summary": summary_text(blue),
	}


static func _strict_profile_facts(profile: Dictionary, stat_key: String) -> Dictionary:
	var profile_id := str(profile.get("profileId", "")).strip_edges()
	var rules_value = profile.get("individualRules", {})
	var rules := rules_value as Dictionary if rules_value is Dictionary else {}
	var base_value = (profile.get("outputBase", {}) as Dictionary).get(stat_key, null) if profile.get("outputBase", null) is Dictionary else null
	var spread_value = (rules.get("initialOutputSpread", {}) as Dictionary).get(stat_key, null) if rules.get("initialOutputSpread", null) is Dictionary else null
	var distribution := str(rules.get("distribution", "weighted_center"))
	var rare_rate_value = rules.get("rareExtremeRate", null)
	if (
		profile_id == ""
		or not STAT_KEYS.has(stat_key)
		or not (base_value is int or base_value is float)
		or not is_finite(float(base_value))
		or absf(float(base_value)) > MAX_ABSOLUTE_PROFILE_VALUE
		or not (spread_value is Array)
		or (spread_value as Array).size() != 2
		or not ((spread_value as Array)[0] is int or (spread_value as Array)[0] is float)
		or not ((spread_value as Array)[1] is int or (spread_value as Array)[1] is float)
		or not is_finite(float((spread_value as Array)[0]))
		or not is_finite(float((spread_value as Array)[1]))
		or absf(float((spread_value as Array)[0])) > MAX_ABSOLUTE_PROFILE_VALUE
		or absf(float((spread_value as Array)[1])) > MAX_ABSOLUTE_PROFILE_VALUE
		or float((spread_value as Array)[0]) > float((spread_value as Array)[1])
		or not DISTRIBUTIONS.has(distribution)
		or not (rare_rate_value is int or rare_rate_value is float)
		or not is_finite(float(rare_rate_value))
		or float(rare_rate_value) < 0.0
		or float(rare_rate_value) > 0.25
	):
		return {}
	return {
		"profileId": profile_id,
		"base": float(base_value),
		"minimum": float((spread_value as Array)[0]),
		"maximum": float((spread_value as Array)[1]),
		"distribution": distribution,
		"rareExtremeRate": float(rare_rate_value),
	}


static func _strict_stat_map(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var result := {}
	for stat_key in STAT_KEYS:
		if not (source.get(stat_key, null) is int) or int(source.get(stat_key, 0)) < 1:
			return {}
		result[stat_key] = int(source.get(stat_key, 0))
	return result


static func _rounded_bonus_cdf(facts: Dictionary, maximum_rounded_bonus: int) -> float:
	var minimum := float(facts.get("minimum", 0.0))
	var maximum := float(facts.get("maximum", 0.0))
	if maximum <= minimum:
		return 1.0 if maximum_rounded_bonus >= _round_half_away_from_zero(minimum) else 0.0
	var cutoff := (float(maximum_rounded_bonus) + 0.5 - minimum) / (maximum - minimum)
	var value = distribution_cdf(str(facts.get("distribution", "")), float(facts.get("rareExtremeRate", 0.0)), cutoff)
	return float(value) if value is int or value is float else 0.0


static func _visible_stat_for_rounded_bonus(base: float, rounded_bonus: int) -> int:
	return maxi(1, _round_half_away_from_zero(base + float(rounded_bonus)))


static func _weighted_center_body_cdf(unit: float) -> float:
	if unit <= 0.0:
		return 0.0
	if unit >= 1.0:
		return 1.0
	return 2.0 * unit * unit if unit <= 0.5 else 1.0 - 2.0 * (1.0 - unit) * (1.0 - unit)


static func _rare_spike_body_cdf(unit: float) -> float:
	if unit <= 0.0:
		return 0.0
	if unit >= 0.72:
		return 1.0
	return pow(unit / 0.72, 1.0 / 1.35)


static func _rare_spike_tail_cdf(unit: float) -> float:
	if unit < 0.92:
		return 0.0
	if unit >= 1.0:
		return 1.0
	return (unit - 0.92) / 0.08


static func _round_half_away_from_zero(value: float) -> int:
	return int(floor(value + 0.5)) if value >= 0.0 else int(ceil(value - 0.5))


static func _round_to(value: float, decimals: int) -> float:
	var factor := pow(10.0, float(maxi(0, decimals)))
	return round(value * factor) / factor


static func _percentile_text(value) -> String:
	var number := float(value)
	return "%d%%" % int(round(number)) if is_equal_approx(number, round(number)) else "%.1f%%" % number


static func _unavailable(profile_id: String) -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"ok": false,
		"profileId": profile_id,
		"levelOneFourV": {},
		"statPercentiles": {},
	}


static func _blue_dragon_fixture() -> Dictionary:
	var initial := {"maxHp": 56, "attack": 15, "defense": 8, "quick": 7}
	return {
		"instanceId": "lv1_percentile_fixture",
		"formId": "blue_man_dragon_water10",
		"templateId": "blue_man_dragon_water10",
		"growthSpeciesProfileId": "blue_man_dragon_v1",
		"level": 11,
		"initialStats": initial.duplicate(true),
		"growthSpeciesLevel1Stats": initial.duplicate(true),
		"maxHp": 154,
		"attack": 44,
		"defense": 19,
		"quick": 22,
	}
