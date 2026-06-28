extends RefCounted

const BALANCE_DIR := "res://data/balance"
const BALANCE_SETS_PATH := BALANCE_DIR + "/balance_sets.json"
const LEVEL_CURVES_PATH := BALANCE_DIR + "/level_curves.json"
const PLAYER_GROWTH_PATH := BALANCE_DIR + "/player_growth.json"
const PET_GROWTH_PROFILES_PATH := BALANCE_DIR + "/pet_growth_profiles.json"
const PET_GROWTH_SPECIES_PROFILES_PATH := BALANCE_DIR + "/pet_growth_species_profiles.json"
const COMBAT_FORMULAS_PATH := BALANCE_DIR + "/combat_formulas.json"
const CAPTURE_FORMULA_PATH := BALANCE_DIR + "/capture_formula.json"
const REWARD_ECONOMY_PATH := BALANCE_DIR + "/reward_economy.json"
const PROGRESSION_ZONES_PATH := BALANCE_DIR + "/progression_zones.json"
const BATTLE_SIMULATION_SCENARIOS_PATH := BALANCE_DIR + "/battle_simulation_scenarios.json"
const ECONOMY_LEDGER_SCENARIOS_PATH := BALANCE_DIR + "/economy_ledger_scenarios.json"
const BATTLE_REWARDS_PATH := "res://data/battle_rewards.json"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const CORE_NUMERIC_DIGEST_PATHS: Array[String] = [
	BALANCE_SETS_PATH,
	LEVEL_CURVES_PATH,
	PLAYER_GROWTH_PATH,
	PET_GROWTH_PROFILES_PATH,
	PET_GROWTH_SPECIES_PROFILES_PATH,
	COMBAT_FORMULAS_PATH,
	CAPTURE_FORMULA_PATH,
	REWARD_ECONOMY_PATH,
	PROGRESSION_ZONES_PATH,
	BATTLE_SIMULATION_SCENARIOS_PATH,
	ECONOMY_LEDGER_SCENARIOS_PATH,
	BATTLE_REWARDS_PATH,
]

static var cache: Dictionary = {}


static func reload() -> void:
	cache.clear()


static func balance_sets() -> Dictionary:
	return _data(BALANCE_SETS_PATH)


static func level_curves() -> Dictionary:
	return _data(LEVEL_CURVES_PATH)


static func player_growth() -> Dictionary:
	return _data(PLAYER_GROWTH_PATH)


static func pet_growth_profiles() -> Dictionary:
	return _data(PET_GROWTH_PROFILES_PATH)


static func pet_growth_species_profiles() -> Dictionary:
	return _data(PET_GROWTH_SPECIES_PROFILES_PATH)


static func combat_formulas() -> Dictionary:
	return _data(COMBAT_FORMULAS_PATH)


static func capture_formula() -> Dictionary:
	return _data(CAPTURE_FORMULA_PATH)


static func reward_economy() -> Dictionary:
	return _data(REWARD_ECONOMY_PATH)


static func progression_zones() -> Dictionary:
	return _data(PROGRESSION_ZONES_PATH)


static func battle_simulation_scenarios() -> Dictionary:
	return _data(BATTLE_SIMULATION_SCENARIOS_PATH)


static func economy_ledger_scenarios() -> Dictionary:
	return _data(ECONOMY_LEDGER_SCENARIOS_PATH)


static func active_balance_set() -> Dictionary:
	var catalog := balance_sets()
	var active_id := str(catalog.get("activeBalanceSetId", ""))
	var raw_sets = catalog.get("sets", [])
	if raw_sets is Array:
		for value in raw_sets:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func balance_version_summary() -> Dictionary:
	var set := active_balance_set()
	return {
		"balanceSetId": str(set.get("id", "")),
		"balanceVersion": str(set.get("balanceVersion", "")),
		"formulaVersion": str(set.get("formulaVersion", "")),
		"captureFormulaVersion": str(set.get("captureFormulaVersion", "")),
		"rewardEconomyVersion": str(set.get("rewardEconomyVersion", "")),
		"progressionVersion": str(set.get("progressionVersion", "")),
		"levelCurveId": str(set.get("levelCurveId", "")),
		"battleSimulationSuiteId": str(set.get("battleSimulationSuiteId", "")),
		"economyLedgerId": str(set.get("economyLedgerId", "")),
		"petPowerFormulaId": str(set.get("petPowerFormulaId", "")),
	}


static func balance_snapshot_summary() -> Dictionary:
	var summary: Dictionary = balance_version_summary()
	var source_parts: Array[String] = []
	var source_paths: Array[String] = []
	for path in CORE_NUMERIC_DIGEST_PATHS:
		source_paths.append(path)
		source_parts.append("%s\n%s" % [path, _source_file_text(path)])
	var digest: String = "\n---BEASTBOUND-NUMERIC-SOURCE---\n".join(source_parts).sha256_text()
	summary["sourceDigest"] = digest
	summary["sourceDigestShort"] = digest.substr(0, 12)
	summary["sourceCount"] = source_paths.size()
	summary["sourcePaths"] = source_paths
	return summary


static func default_shop_sell_rate(fallback: float = 0.5) -> float:
	var shop = reward_economy().get("shop", {})
	var shop_dict := shop as Dictionary if shop is Dictionary else {}
	return clampf(float(shop_dict.get("defaultSellRate", fallback)), 0.0, 1.0)


static func active_battle_exp_formula() -> Dictionary:
	var battle_exp := _battle_exp_config()
	var active_id := str(battle_exp.get("activeFormulaId", ""))
	var raw_formulas = battle_exp.get("formulas", [])
	if raw_formulas is Array:
		for value in raw_formulas:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func battle_exp_stage_targets() -> Array[Dictionary]:
	var battle_exp := _battle_exp_config()
	var raw_targets = battle_exp.get("stageTargets", [])
	var result: Array[Dictionary] = []
	if raw_targets is Array:
		for value in raw_targets:
			if value is Dictionary:
				result.append((value as Dictionary).duplicate(true))
	return result


static func active_progression() -> Dictionary:
	var catalog := progression_zones()
	var active_id := str(catalog.get("activeProgressionId", ""))
	var raw_progressions = catalog.get("progressions", [])
	if raw_progressions is Array:
		for value in raw_progressions:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func progression_zone_list() -> Array[Dictionary]:
	var progression := active_progression()
	var raw_zones = progression.get("zones", [])
	var result: Array[Dictionary] = []
	if raw_zones is Array:
		for value in raw_zones:
			if value is Dictionary:
				result.append((value as Dictionary).duplicate(true))
	return result


static func active_battle_simulation_suite() -> Dictionary:
	var catalog := battle_simulation_scenarios()
	var active_id := str(catalog.get("activeSuiteId", ""))
	var raw_suites = catalog.get("suites", [])
	if raw_suites is Array:
		for value in raw_suites:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func battle_simulation_scenario_list() -> Array[Dictionary]:
	var suite := active_battle_simulation_suite()
	var raw_scenarios = suite.get("scenarios", [])
	var result: Array[Dictionary] = []
	if raw_scenarios is Array:
		for value in raw_scenarios:
			if value is Dictionary:
				result.append((value as Dictionary).duplicate(true))
	return result


static func active_economy_ledger() -> Dictionary:
	var catalog := economy_ledger_scenarios()
	var active_id := str(catalog.get("activeLedgerId", ""))
	var raw_ledgers = catalog.get("ledgers", [])
	if raw_ledgers is Array:
		for value in raw_ledgers:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func battle_exp_reward_for_actor(actor: Dictionary, reward_group_id: String = "", fallback: int = 0) -> int:
	var formula := active_battle_exp_formula()
	if formula.is_empty():
		return maxi(0, fallback)
	var max_hp := maxi(1, int(actor.get("maxHp", 1)))
	var attack := maxi(0, int(actor.get("attack", 0)))
	var defense := maxi(0, int(actor.get("defense", 0)))
	var quick := maxi(0, int(actor.get("quick", actor.get("agility", 0))))
	var base := float(max_hp) / maxf(1.0, float(formula.get("maxHpDivisor", 10.0)))
	base += float(attack) * maxf(0.0, float(formula.get("attackWeight", 1.0)))
	base += float(defense) * maxf(0.0, float(formula.get("defenseWeight", 1.0)))
	base += float(quick) / maxf(1.0, float(formula.get("quickDivisor", 8.0)))
	var scaled := maxf(float(formula.get("minPerEnemy", 8)), base)
	scaled *= _battle_exp_level_multiplier(int(actor.get("level", 1)), formula)
	scaled *= _battle_exp_group_multiplier(reward_group_id, formula)
	return maxi(0, int(round(scaled)))


static func max_player_level(fallback: int = 140) -> int:
	return maxi(1, int(level_curves().get("maxPlayerLevel", fallback)))


static func max_pet_level(fallback: int = 140) -> int:
	return maxi(1, int(level_curves().get("maxPetLevel", fallback)))


static func exp_to_next_level(level: int, fallback: int = 1) -> int:
	var curve := active_level_curve()
	if curve.is_empty():
		return fallback
	var safe_level := maxi(1, level)
	var formula := str(curve.get("formula", ""))
	if formula == "v1_exponential_power":
		var base_constant := float(curve.get("baseConstant", 80))
		var linear_per_level := float(curve.get("linearPerLevel", 40))
		var exp_growth_rate := float(curve.get("expGrowthRate", 1.052))
		var power_exponent := float(curve.get("powerExponent", 2.15))
		var power_multiplier := float(curve.get("powerMultiplier", 2.0))
		var base := (base_constant + float(safe_level) * linear_per_level) * pow(exp_growth_rate, float(safe_level - 1))
		var high_level_shape := pow(float(safe_level), power_exponent) * power_multiplier
		return maxi(1, int(roundf(base + high_level_shape)))
	return fallback


static func exp_grant_for_level(target_level: int, fallback_max_level: int = 140) -> int:
	var safe_target := clampi(target_level, 1, max_player_level(fallback_max_level))
	var total := 0
	for level in range(1, safe_target):
		total += exp_to_next_level(level, 1)
	return total


static func default_player_battle_stats(fallback: Dictionary = {}) -> Dictionary:
	return _normalized_stat_dict(player_growth().get("baseStats", fallback), fallback)


static func stat_points_per_level(fallback: int = 3) -> int:
	return maxi(0, int(player_growth().get("statPointsPerLevel", fallback)))


static func player_stat_point_gain(stat_key: String, fallback: int = 1) -> int:
	var gains = player_growth().get("pointGains", {})
	var gain_dict := gains as Dictionary if gains is Dictionary else {}
	return maxi(0, int(gain_dict.get(stat_key, fallback)))


static func equipment_weapon_attacks_per_durability(fallback: int = 100) -> int:
	var wear := _player_equipment_wear()
	return maxi(1, int(wear.get("weaponAttacksPerDurability", fallback)))


static func equipment_armor_hits_per_durability(fallback: int = 10) -> int:
	var wear := _player_equipment_wear()
	return maxi(1, int(wear.get("armorHitsPerDurability", fallback)))


static func equipment_repair_durability_per_coin(fallback: int = 5) -> int:
	var wear := _player_equipment_wear()
	return maxi(1, int(wear.get("repairDurabilityPerCoin", fallback)))


static func village_heal_hp_per_coin(fallback: int = 20) -> int:
	return maxi(1, int(player_growth().get("villageHealHpPerCoin", fallback)))


static func rebirth_required_level_for_target(target_count: int, fallback: int = 80) -> int:
	var rebirth = player_growth().get("rebirth", {})
	var rebirth_dict := rebirth as Dictionary if rebirth is Dictionary else {}
	var raw_levels = rebirth_dict.get("requiredLevelByTarget", [])
	if raw_levels is Array:
		var levels := raw_levels as Array
		var index := clampi(target_count, 1, levels.size()) - 1
		if index >= 0 and index < levels.size():
			return maxi(1, int(levels[index]))
	return maxi(1, fallback)


static func pet_growth_rates(profile_id: String, fallback: Dictionary = {}) -> Dictionary:
	var profile := pet_growth_profile(profile_id)
	if profile.is_empty():
		return _normalized_float_stat_dict(fallback, fallback)
	var per_level = profile.get("perLevel", {})
	return _normalized_float_stat_dict(per_level, fallback)


static func pet_growth_profile(profile_id: String) -> Dictionary:
	var normalized := profile_id.to_lower().strip_edges()
	for profile in pet_growth_profile_list():
		if str(profile.get("id", "")).to_lower().strip_edges() == normalized:
			return profile.duplicate(true)
	var fuzzy := _fuzzy_pet_growth_profile_id(normalized)
	if fuzzy != "":
		for profile in pet_growth_profile_list():
			if str(profile.get("id", "")) == fuzzy:
				return profile.duplicate(true)
	for profile in pet_growth_profile_list():
		if str(profile.get("id", "")) == "balanced":
			return profile.duplicate(true)
	return {}


static func pet_growth_profile_list() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_profiles = pet_growth_profiles().get("profiles", [])
	if raw_profiles is Array:
		for value in raw_profiles:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result


static func pet_growth_species_profile(profile_id: String) -> Dictionary:
	var normalized := profile_id.strip_edges()
	for profile in pet_growth_species_profile_list():
		if str(profile.get("profileId", "")) == normalized:
			return profile.duplicate(true)
	return {}


static func pet_growth_species_profile_list() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_profiles = pet_growth_species_profiles().get("profiles", [])
	if raw_profiles is Array:
		for value in raw_profiles:
			if value is Dictionary:
				result.append((value as Dictionary).duplicate(true))
	return result


static func pet_power_formula() -> Dictionary:
	var catalog := pet_growth_profiles()
	var active_id := str(catalog.get("activePowerFormula", ""))
	var raw_formulas = catalog.get("powerFormulas", [])
	if raw_formulas is Array:
		for value in raw_formulas:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func pet_power_weights() -> Dictionary:
	var formula := pet_power_formula()
	var weights = formula.get("weights", {})
	return weights as Dictionary if weights is Dictionary else {}


static func pet_quality_low_threshold(fallback: int = 2400) -> int:
	var quality := _pet_quality_config()
	return clampi(int(quality.get("lowThreshold", fallback)), 0, 10000)


static func pet_quality_high_threshold(fallback: int = 7600) -> int:
	var quality := _pet_quality_config()
	return clampi(int(quality.get("highThreshold", fallback)), 0, 10000)


static func pet_quality_label(label_key: String, fallback: String) -> String:
	var quality := _pet_quality_config()
	var raw_labels = quality.get("labels", {})
	var labels := raw_labels as Dictionary if raw_labels is Dictionary else {}
	var label := str(labels.get(label_key, fallback)).strip_edges()
	return label if label != "" else fallback


static func pet_initial_bonus_range(stat_key: String, fallback_min: int, fallback_max: int) -> Dictionary:
	var ranges := _pet_individual_variance_ranges("initialBonus")
	return _number_range_for_key(ranges, stat_key, float(fallback_min), float(fallback_max), true)


static func pet_growth_bonus_range(stat_key: String, fallback_min: float, fallback_max: float) -> Dictionary:
	var ranges := _pet_individual_variance_ranges("growthBonus")
	return _number_range_for_key(ranges, stat_key, fallback_min, fallback_max, false)


static func active_combat_formula() -> Dictionary:
	var catalog := combat_formulas()
	var active_id := str(catalog.get("activeFormulaId", ""))
	return combat_formula_by_id(active_id)


static func combat_formula_by_id(formula_id: String) -> Dictionary:
	var normalized_id := formula_id.strip_edges()
	if normalized_id == "":
		return {}
	var catalog := combat_formulas()
	var raw_formulas = catalog.get("formulas", [])
	if raw_formulas is Array:
		for value in raw_formulas:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == normalized_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func combat_formula_list() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_formulas = combat_formulas().get("formulas", [])
	if raw_formulas is Array:
		for value in raw_formulas:
			if value is Dictionary:
				result.append((value as Dictionary).duplicate(true))
	return result


static func active_capture_formula() -> Dictionary:
	var catalog := capture_formula()
	var active_id := str(catalog.get("activeFormulaId", ""))
	var raw_formulas = catalog.get("formulas", [])
	if raw_formulas is Array:
		for value in raw_formulas:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	_validate_balance_sets(errors)
	_validate_level_curves(errors)
	_validate_player_growth(errors)
	_validate_pet_growth_profiles(errors)
	_validate_pet_growth_species_profiles(errors)
	_validate_combat_formulas(errors)
	_validate_capture_formula(errors)
	_validate_reward_economy(errors)
	_validate_progression_zones(errors)
	_validate_battle_simulation_scenarios(errors)
	_validate_economy_ledger_scenarios(errors)
	return errors


static func _validate_balance_sets(errors: Array[String]) -> void:
	var data := balance_sets()
	if data.is_empty():
		errors.append("balance_sets.json 缺失或不是 JSON 对象")
		return
	var active_set := active_balance_set()
	if active_set.is_empty():
		errors.append("balance_sets 缺少 activeBalanceSetId 对应 set")
		return
	var required_keys := [
		"balanceVersion",
		"formulaVersion",
		"captureFormulaVersion",
		"rewardEconomyVersion",
		"progressionVersion",
		"levelCurveId",
		"battleSimulationSuiteId",
		"economyLedgerId",
		"petPowerFormulaId",
	]
	for key in required_keys:
		if str(active_set.get(key, "")).strip_edges() == "":
			errors.append("balance_sets.%s 不能为空" % key)
	var expected := {
		"formulaVersion": str(active_combat_formula().get("id", "")),
		"captureFormulaVersion": str(active_capture_formula().get("id", "")),
		"rewardEconomyVersion": str(active_battle_exp_formula().get("id", "")),
		"progressionVersion": str(active_progression().get("id", "")),
		"levelCurveId": str(active_level_curve().get("id", "")),
		"battleSimulationSuiteId": str(active_battle_simulation_suite().get("id", "")),
		"economyLedgerId": str(active_economy_ledger().get("id", "")),
		"petPowerFormulaId": str(pet_power_formula().get("id", "")),
	}
	for key in expected.keys():
		if str(active_set.get(key, "")) != str(expected.get(key, "")):
			errors.append("balance_sets.%s=%s 与 active=%s 不一致" % [key, str(active_set.get(key, "")), str(expected.get(key, ""))])


static func _validate_level_curves(errors: Array[String]) -> void:
	var data := level_curves()
	if data.is_empty():
		errors.append("level_curves.json 缺失或不是 JSON 对象")
		return
	if max_player_level(0) != 140:
		errors.append("maxPlayerLevel 第一版必须是 140")
	if max_pet_level(0) != 140:
		errors.append("maxPetLevel 第一版必须是 140")
	var curve := active_level_curve()
	if curve.is_empty():
		errors.append("level_curves 缺少 activeCurveId 对应曲线")
		return
	if str(curve.get("formula", "")) != "v1_exponential_power":
		errors.append("level_curves 当前只支持 v1_exponential_power")
	for key in ["baseConstant", "linearPerLevel", "expGrowthRate", "powerExponent", "powerMultiplier"]:
		if not curve.has(key):
			errors.append("level_curves.%s 缺失" % key)
	if exp_to_next_level(1, 0) <= 0 or exp_to_next_level(80, 0) <= exp_to_next_level(20, 0):
		errors.append("level_curves 经验曲线不递增")


static func _validate_player_growth(errors: Array[String]) -> void:
	var data := player_growth()
	if data.is_empty():
		errors.append("player_growth.json 缺失或不是 JSON 对象")
		return
	var stats := default_player_battle_stats({})
	for key in STAT_KEYS:
		if int(stats.get(key, 0)) <= 0:
			errors.append("player_growth.baseStats.%s 必须大于0" % key)
	if stat_points_per_level(-1) < 0:
		errors.append("player_growth.statPointsPerLevel 无效")
	for key in STAT_KEYS:
		if player_stat_point_gain(key, -1) < 0:
			errors.append("player_growth.pointGains.%s 无效" % key)
	if equipment_weapon_attacks_per_durability(0) <= 0:
		errors.append("player_growth.equipmentWear.weaponAttacksPerDurability 无效")
	if equipment_armor_hits_per_durability(0) <= 0:
		errors.append("player_growth.equipmentWear.armorHitsPerDurability 无效")
	if equipment_repair_durability_per_coin(0) <= 0:
		errors.append("player_growth.equipmentWear.repairDurabilityPerCoin 无效")
	for target in range(1, 7):
		if rebirth_required_level_for_target(target, 0) <= 0:
			errors.append("player_growth.rebirth.requiredLevelByTarget[%d] 无效" % target)


static func _validate_pet_growth_profiles(errors: Array[String]) -> void:
	var data := pet_growth_profiles()
	if data.is_empty():
		errors.append("pet_growth_profiles.json 缺失或不是 JSON 对象")
		return
	var seen := {}
	for profile in pet_growth_profile_list():
		var profile_id := str(profile.get("id", "")).strip_edges()
		if profile_id == "":
			errors.append("pet_growth profile id 不能为空")
			continue
		if seen.has(profile_id):
			errors.append("pet_growth profile id 重复: %s" % profile_id)
		seen[profile_id] = true
		var rates := pet_growth_rates(profile_id, {})
		for key in STAT_KEYS:
			if float(rates.get(key, -1.0)) < 0.0:
				errors.append("%s.perLevel.%s 无效" % [profile_id, key])
	if not seen.has("balanced"):
		errors.append("pet_growth_profiles 必须包含 balanced")
	if pet_power_weights().is_empty():
		errors.append("pet_growth_profiles 缺少 activePowerFormula")
	if pet_quality_low_threshold(-1) < 0 or pet_quality_high_threshold(-1) <= pet_quality_low_threshold(-1):
		errors.append("pet_growth_profiles.quality 阈值无效")
	for key in STAT_KEYS:
		var initial_range := pet_initial_bonus_range(key, 0, 0)
		if int(initial_range.get("min", 0)) > int(initial_range.get("max", 0)):
			errors.append("pet_growth_profiles.individualVariance.initialBonus.%s 无效" % key)
		var growth_range := pet_growth_bonus_range(key, 0.0, 0.0)
		if float(growth_range.get("min", 0.0)) > float(growth_range.get("max", 0.0)):
			errors.append("pet_growth_profiles.individualVariance.growthBonus.%s 无效" % key)


static func _validate_pet_growth_species_profiles(errors: Array[String]) -> void:
	var data := pet_growth_species_profiles()
	if data.is_empty():
		errors.append("pet_growth_species_profiles.json 缺失或不是 JSON 对象")
		return
	var seen := {}
	for profile in pet_growth_species_profile_list():
		var profile_id := str(profile.get("profileId", "")).strip_edges()
		if profile_id == "":
			errors.append("pet_growth_species profileId 不能为空")
			continue
		if seen.has(profile_id):
			errors.append("pet_growth_species profileId 重复: %s" % profile_id)
		seen[profile_id] = true
		var base := profile.get("outputBase", {}) as Dictionary
		var growth := profile.get("outputGrowth", {}) as Dictionary
		var rules := profile.get("individualRules", {}) as Dictionary
		var initial := rules.get("initialOutputSpread", {}) as Dictionary
		var growth_spread := rules.get("growthOutputSpread", {}) as Dictionary
		var observation := profile.get("growthObservation", {}) as Dictionary
		for key in STAT_KEYS:
			if float(base.get(key, 0.0)) <= 0.0:
				errors.append("%s.outputBase.%s 必须大于0" % [profile_id, key])
			if float(growth.get(key, -1.0)) < 0.0:
				errors.append("%s.outputGrowth.%s 无效" % [profile_id, key])
			if not _range_value_valid(initial.get(key, [])):
				errors.append("%s.initialOutputSpread.%s 无效" % [profile_id, key])
			if not _range_value_valid(growth_spread.get(key, [])):
				errors.append("%s.growthOutputSpread.%s 无效" % [profile_id, key])
		if not observation.is_empty():
			var by_level := observation.get("powerGrowthPercentilesByLevel", {}) as Dictionary
			var level_min := clampi(int(observation.get("levelMin", 2)), 2, 140)
			var level_max := clampi(int(observation.get("levelMax", 140)), level_min, 140)
			if by_level.is_empty():
				errors.append("%s.growthObservation 缺少 powerGrowthPercentilesByLevel" % profile_id)
			for level in range(level_min, level_max + 1):
				var thresholds := by_level.get(str(level), {}) as Dictionary
				if thresholds.is_empty():
					errors.append("%s.growthObservation 缺少 Lv%d 阈值" % [profile_id, level])
					break
				var last := -INF
				for threshold_key in ["min", "p25", "p55", "p85", "p95", "max"]:
					if not thresholds.has(threshold_key):
						errors.append("%s.growthObservation.Lv%d 缺少 %s" % [profile_id, level, threshold_key])
						break
					var value := float(thresholds.get(threshold_key, 0.0))
					if value < last:
						errors.append("%s.growthObservation.Lv%d 阈值顺序错误" % [profile_id, level])
						break
					last = value
	if seen.is_empty():
		errors.append("pet_growth_species_profiles 至少需要一个 profile")


static func _validate_combat_formulas(errors: Array[String]) -> void:
	var formula := active_combat_formula()
	if formula.is_empty():
		errors.append("combat_formulas 缺少 activeFormulaId 对应公式")
		return
	var seen := {}
	for formula_entry in combat_formula_list():
		var formula_id := str(formula_entry.get("id", "")).strip_edges()
		if formula_id == "":
			errors.append("combat_formulas 存在空公式 id")
			continue
		if seen.has(formula_id):
			errors.append("combat_formulas.%s 重复" % formula_id)
		seen[formula_id] = true
		for key in ["physicalDamage", "dodge", "critical", "combo", "multiTarget", "statusHit"]:
			if not (formula_entry.get(key, {}) is Dictionary):
				errors.append("combat_formulas.%s.%s 必须是对象" % [formula_id, key])
		var dodge := formula_entry.get("dodge", {}) as Dictionary
		if float(dodge.get("maxRate", 0.0)) <= float(dodge.get("minRate", 0.0)):
			errors.append("combat_formulas.%s.dodge 上限必须大于下限" % formula_id)
		var critical := formula_entry.get("critical", {}) as Dictionary
		if float(critical.get("maxRate", 0.0)) < float(critical.get("minRate", 0.0)):
			errors.append("combat_formulas.%s.critical 上限不能小于下限" % formula_id)
		var multi := formula_entry.get("multiTarget", {}) as Dictionary
		if float(multi.get("minMultiplier", 0.0)) <= 0.0:
			errors.append("combat_formulas.%s.multiTarget.minMultiplier 必须大于 0" % formula_id)


static func _validate_capture_formula(errors: Array[String]) -> void:
	var formula := active_capture_formula()
	if formula.is_empty():
		errors.append("capture_formula 缺少 activeFormulaId 对应公式")
		return
	if float(formula.get("maxChance", 0.0)) <= float(formula.get("minChance", 0.0)):
		errors.append("capture_formula maxChance 必须大于 minChance")
	for key in ["baseChance", "hpRatioPenalty", "difficultyRatioPenalty"]:
		if not formula.has(key):
			errors.append("capture_formula.%s 缺失" % key)


static func _validate_reward_economy(errors: Array[String]) -> void:
	var data := reward_economy()
	if data.is_empty():
		errors.append("reward_economy.json 缺失或不是 JSON 对象")
		return
	var shop = data.get("shop", {})
	var shop_dict := shop as Dictionary if shop is Dictionary else {}
	var sell_rate := float(shop_dict.get("defaultSellRate", 0.0))
	if sell_rate <= 0.0 or sell_rate >= 1.0:
		errors.append("reward_economy.shop.defaultSellRate 应在 0-1 之间")
	var battle_exp := active_battle_exp_formula()
	if battle_exp.is_empty():
		errors.append("reward_economy.battleExp 缺少 activeFormulaId 对应公式")
	else:
		for key in ["minPerEnemy", "maxHpDivisor", "attackWeight", "defenseWeight", "quickDivisor"]:
			if not battle_exp.has(key):
				errors.append("reward_economy.battleExp.%s 缺失" % key)
		if battle_exp_reward_for_actor({"level": 1, "maxHp": 80, "attack": 12, "defense": 8, "quick": 62}, "default_wild", 0) != 36:
			errors.append("reward_economy.battleExp 低级默认样本必须保持旧经验")
		var level_80_exp := battle_exp_reward_for_actor({"level": 80, "maxHp": 950, "attack": 95, "defense": 70, "quick": 70}, "earth_vein_guardian_group", 0)
		if level_80_exp <= 1000:
			errors.append("reward_economy.battleExp Lv80 样本经验过低")
	if battle_exp_stage_targets().is_empty():
		errors.append("reward_economy.battleExp.stageTargets 不能为空")


static func _validate_progression_zones(errors: Array[String]) -> void:
	var data := progression_zones()
	if data.is_empty():
		errors.append("progression_zones.json 缺失或不是 JSON 对象")
		return
	var progression := active_progression()
	if progression.is_empty():
		errors.append("progression_zones 缺少 activeProgressionId 对应方案")
		return
	var seen := {}
	var repeatable_count := 0
	var qualification_count := 0
	for zone in progression_zone_list():
		var zone_id := str(zone.get("id", "")).strip_edges()
		if zone_id == "":
			errors.append("progression_zones zone id 不能为空")
			continue
		if seen.has(zone_id):
			errors.append("progression_zones zone id 重复: %s" % zone_id)
		seen[zone_id] = true
		var level_range := _int_pair(zone.get("levelRange", []), 1, 1)
		if int(level_range[0]) > int(level_range[1]):
			errors.append("%s.levelRange 无效" % zone_id)
		var exp_range := _int_pair(zone.get("targetAvgExpPerBattle", []), 0, 0)
		if int(exp_range[0]) <= 0 or int(exp_range[1]) < int(exp_range[0]):
			errors.append("%s.targetAvgExpPerBattle 无效" % zone_id)
		var stone_range := _int_pair(zone.get("targetStoneCoinsPerBattle", []), 0, 0)
		if int(stone_range[1]) < int(stone_range[0]):
			errors.append("%s.targetStoneCoinsPerBattle 无效" % zone_id)
		var typical_battle = zone.get("typicalBattle", {})
		var typical_battle_dict := typical_battle as Dictionary if typical_battle is Dictionary else {}
		if int(typical_battle_dict.get("enemyCount", 0)) <= 0:
			errors.append("%s.typicalBattle.enemyCount 无效" % zone_id)
		if not (typical_battle_dict.get("enemy", {}) is Dictionary):
			errors.append("%s.typicalBattle.enemy 缺失" % zone_id)
		var content_type := str(zone.get("contentType", "")).strip_edges()
		if bool(zone.get("repeatable", false)):
			repeatable_count += 1
		if content_type == "qualification_battle":
			qualification_count += 1
	if repeatable_count < 6:
		errors.append("progression_zones 至少需要 6 个可重复练级段")
	if qualification_count < 2:
		errors.append("progression_zones 至少需要资格战样本")


static func _validate_battle_simulation_scenarios(errors: Array[String]) -> void:
	var data := battle_simulation_scenarios()
	if data.is_empty():
		errors.append("battle_simulation_scenarios.json 缺失或不是 JSON 对象")
		return
	var suite := active_battle_simulation_suite()
	if suite.is_empty():
		errors.append("battle_simulation_scenarios 缺少 activeSuiteId 对应方案")
		return
	if int(suite.get("roundLimit", 0)) <= 0:
		errors.append("battle_simulation_scenarios.roundLimit 无效")
	var seen := {}
	var scenario_count := 0
	var zone_ids := {}
	for zone in progression_zone_list():
		zone_ids[str(zone.get("id", ""))] = true
	for scenario in battle_simulation_scenario_list():
		scenario_count += 1
		var scenario_id := str(scenario.get("id", "")).strip_edges()
		if scenario_id == "":
			errors.append("battle_simulation scenario id 不能为空")
			continue
		if seen.has(scenario_id):
			errors.append("battle_simulation scenario id 重复: %s" % scenario_id)
		seen[scenario_id] = true
		if int(scenario.get("partySize", 0)) <= 0:
			errors.append("%s.partySize 无效" % scenario_id)
		if int(scenario.get("playerLevel", 0)) <= 0:
			errors.append("%s.playerLevel 无效" % scenario_id)
		if int(scenario.get("enemyCount", 0)) <= 0:
			errors.append("%s.enemyCount 无效" % scenario_id)
		var progression_zone_id := str(scenario.get("progressionZoneId", "")).strip_edges()
		if progression_zone_id == "" or not zone_ids.has(progression_zone_id):
			errors.append("%s.progressionZoneId 不存在: %s" % [scenario_id, progression_zone_id])
		if not (scenario.get("enemyStats", {}) is Dictionary):
			errors.append("%s.enemyStats 缺失" % scenario_id)
		if not (scenario.get("expect", {}) is Dictionary):
			errors.append("%s.expect 缺失" % scenario_id)
		else:
			var expect := scenario.get("expect", {}) as Dictionary
			var min_rounds := maxi(1, int(expect.get("minRounds", 1)))
			var max_rounds := maxi(1, int(expect.get("maxRounds", 1)))
			if min_rounds > max_rounds:
				errors.append("%s.expect minRounds 不能大于 maxRounds" % scenario_id)
			var min_hp_ratio := float(expect.get("minPlayerHpRatio", 0.0))
			if min_hp_ratio < 0.0 or min_hp_ratio > 1.0:
				errors.append("%s.expect minPlayerHpRatio 必须在 0-1" % scenario_id)
	if scenario_count < 6:
		errors.append("battle_simulation 至少需要 6 个代表场景")


static func _validate_economy_ledger_scenarios(errors: Array[String]) -> void:
	var data := economy_ledger_scenarios()
	if data.is_empty():
		errors.append("economy_ledger_scenarios.json 缺失或不是 JSON 对象")
		return
	var ledger := active_economy_ledger()
	if ledger.is_empty():
		errors.append("economy_ledger_scenarios 缺少 activeLedgerId 对应方案")
		return
	var source_suite_id := str(ledger.get("sourceBattleSuiteId", "")).strip_edges()
	if source_suite_id == "":
		errors.append("economy_ledger.sourceBattleSuiteId 不能为空")
	else:
		var suite := active_battle_simulation_suite()
		if not suite.is_empty() and source_suite_id != str(suite.get("id", "")):
			errors.append("economy_ledger.sourceBattleSuiteId 必须对应当前 battle simulation suite")
	var raw_assumptions = ledger.get("assumptions", {})
	if not (raw_assumptions is Dictionary):
		errors.append("economy_ledger.assumptions 必须是对象")
		return
	var assumptions := raw_assumptions as Dictionary
	for key in ["normalEncounterSeconds", "secondsPerRound", "settlementSeconds"]:
		if float(assumptions.get(key, -1.0)) < 0.0:
			errors.append("economy_ledger.assumptions.%s 无效" % key)
	var hp_threshold := float(assumptions.get("fieldSupplyHpRatioThreshold", 0.0))
	var reserve_share := float(assumptions.get("fieldSupplyReserveShare", 0.0))
	if hp_threshold < 0.0 or hp_threshold > 1.0:
		errors.append("economy_ledger.fieldSupplyHpRatioThreshold 必须在0-1")
	if reserve_share < 0.0 or reserve_share > 1.0:
		errors.append("economy_ledger.fieldSupplyReserveShare 必须在0-1")


static func active_level_curve() -> Dictionary:
	var catalog := level_curves()
	var active_id := str(catalog.get("activeCurveId", ""))
	var raw_curves = catalog.get("curves", [])
	if raw_curves is Array:
		for value in raw_curves:
			if value is Dictionary and str((value as Dictionary).get("id", "")) == active_id:
				return (value as Dictionary).duplicate(true)
	return {}


static func _player_equipment_wear() -> Dictionary:
	var raw_wear = player_growth().get("equipmentWear", {})
	return raw_wear as Dictionary if raw_wear is Dictionary else {}


static func _battle_exp_config() -> Dictionary:
	var raw_battle_exp = reward_economy().get("battleExp", {})
	return raw_battle_exp as Dictionary if raw_battle_exp is Dictionary else {}


static func _battle_exp_level_multiplier(level: int, formula: Dictionary) -> float:
	var raw_level_scale = formula.get("levelScale", {})
	var level_scale := raw_level_scale as Dictionary if raw_level_scale is Dictionary else {}
	if not bool(level_scale.get("enabled", false)):
		return 1.0
	var pivot := maxf(1.0, float(level_scale.get("pivotLevel", 20)))
	var exponent := maxf(0.0, float(level_scale.get("exponent", 1.0)))
	var min_multiplier := maxf(0.0, float(level_scale.get("minMultiplier", 1.0)))
	var max_multiplier := maxf(min_multiplier, float(level_scale.get("maxMultiplier", 30.0)))
	var raw_multiplier := pow(maxf(1.0, float(maxi(1, level)) / pivot), exponent)
	return clampf(raw_multiplier, min_multiplier, max_multiplier)


static func _battle_exp_group_multiplier(group_id: String, formula: Dictionary) -> float:
	var raw_multipliers = formula.get("groupMultipliers", {})
	var multipliers := raw_multipliers as Dictionary if raw_multipliers is Dictionary else {}
	var normalized := group_id.strip_edges()
	if normalized != "" and multipliers.has(normalized):
		return maxf(0.0, float(multipliers.get(normalized, 1.0)))
	if multipliers.has("default_wild"):
		return maxf(0.0, float(multipliers.get("default_wild", 1.0)))
	return 1.0


static func _pet_quality_config() -> Dictionary:
	var raw_quality = pet_growth_profiles().get("quality", {})
	return raw_quality as Dictionary if raw_quality is Dictionary else {}


static func _pet_individual_variance_ranges(section_key: String) -> Dictionary:
	var raw_variance = pet_growth_profiles().get("individualVariance", {})
	var variance := raw_variance as Dictionary if raw_variance is Dictionary else {}
	var raw_ranges = variance.get(section_key, {})
	return raw_ranges as Dictionary if raw_ranges is Dictionary else {}


static func _number_range_for_key(ranges: Dictionary, stat_key: String, fallback_min: float, fallback_max: float, as_int: bool) -> Dictionary:
	var raw_range = ranges.get(stat_key, [])
	var min_value := fallback_min
	var max_value := fallback_max
	if raw_range is Array:
		var values := raw_range as Array
		if values.size() >= 2:
			min_value = float(values[0])
			max_value = float(values[1])
	if min_value > max_value:
		var swap := min_value
		min_value = max_value
		max_value = swap
	if as_int:
		return {"min": int(round(min_value)), "max": int(round(max_value))}
	return {"min": min_value, "max": max_value}


static func _range_value_valid(value) -> bool:
	if not (value is Array):
		return false
	var values := value as Array
	if values.size() < 2:
		return false
	return float(values[0]) <= float(values[1])


static func _int_pair(value, fallback_min: int, fallback_max: int) -> Array[int]:
	if value is Array:
		var values := value as Array
		if values.size() >= 2:
			return [int(values[0]), int(values[1])]
	return [fallback_min, fallback_max]


static func _data(path: String) -> Dictionary:
	if cache.has(path):
		return (cache.get(path, {}) as Dictionary)
	if not FileAccess.file_exists(path):
		cache[path] = {}
		return {}
	var text := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		cache[path] = {}
		return {}
	cache[path] = parsed as Dictionary
	return cache.get(path, {}) as Dictionary


static func _source_file_text(path: String) -> String:
	if not FileAccess.file_exists(path):
		return ""
	return FileAccess.get_file_as_string(path)


static func _normalized_stat_dict(value, fallback: Dictionary) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = maxi(1, int(source.get(key, fallback.get(key, 1))))
	return result


static func _normalized_float_stat_dict(value, fallback: Dictionary) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = maxf(0.0, float(source.get(key, fallback.get(key, 0.0))))
	return result


static func _fuzzy_pet_growth_profile_id(normalized: String) -> String:
	if normalized.find("attack") >= 0:
		return "attack_high"
	if normalized.find("agility") >= 0 or normalized.find("quick") >= 0 or normalized.find("speed") >= 0:
		return "agility_high"
	if normalized.find("defense") >= 0:
		return "defense_high"
	if normalized.find("hp") >= 0 or normalized.find("health") >= 0 or normalized.find("stamina") >= 0 or normalized.find("survival") >= 0:
		return "hp_high"
	return ""
