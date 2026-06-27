extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")

const SCHEMA_VERSION := 1
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]


static func growth_snapshot(template: Dictionary, instance: Dictionary, level: int, growth_rates: Dictionary, seed_hint: String = "") -> Dictionary:
	var seed := str(instance.get("individualSeed", "")).strip_edges()
	if seed == "":
		seed = seed_hint.strip_edges()
	if seed == "":
		seed = "%s:%s:%d" % [
			str(instance.get("instanceId", instance.get("petId", ""))),
			str(instance.get("formId", instance.get("templateId", template.get("formId", "")))),
			level,
		]
	var tier_id := str(instance.get("growthTierId", template.get("growthProfileId", "balanced"))).strip_edges()
	if tier_id == "":
		tier_id = "balanced"
	var base_stats := template_base_stats(template)
	var variance := normalized_variance(instance.get("individualVariance", {}), seed)
	var initial_stats := stats_with_bonus(base_stats, variance.get("initialBonus", {}))
	var level_value := clampi(level, 1, 140)
	var stat_gains := stat_gains_for_level(growth_rates, variance.get("growthBonus", {}), level_value)
	var final_stats := stats_with_bonus(initial_stats, stat_gains)
	var quality_score := quality_score_for_variance(variance)
	var growth_record := {
		"schemaVersion": SCHEMA_VERSION,
		"level": level_value,
		"growthTierId": tier_id,
		"baseStats": base_stats,
		"growthRates": normalized_growth_rates(growth_rates),
		"individualVariance": variance,
		"initialStats": initial_stats,
		"statGains": stat_gains,
		"finalStats": final_stats,
	}
	return {
		"growthTierId": tier_id,
		"growthTierLabel": growth_tier_label(tier_id),
		"individualSeed": seed,
		"individualVariance": variance,
		"individualQualityScore": quality_score,
		"individualQualityLabel": quality_label(quality_score),
		"initialStats": initial_stats,
		"growthRecord": growth_record,
		"finalStats": final_stats,
	}


static func template_base_stats(template: Dictionary) -> Dictionary:
	var stats = template.get("baseStats", {})
	var stats_dict := stats as Dictionary if stats is Dictionary else {}
	return {
		"maxHp": maxi(1, int(stats_dict.get("maxHp", 1))),
		"attack": maxi(1, int(stats_dict.get("attack", 12))),
		"defense": maxi(1, int(stats_dict.get("defense", 6))),
		"quick": maxi(1, int(stats_dict.get("agility", stats_dict.get("quick", 50)))),
	}


static func normalized_growth_rates(value: Dictionary) -> Dictionary:
	return {
		"maxHp": float(value.get("maxHp", 0.0)),
		"attack": float(value.get("attack", 0.0)),
		"defense": float(value.get("defense", 0.0)),
		"quick": float(value.get("quick", 0.0)),
	}


static func normalized_variance(value, seed: String) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var initial = source.get("initialBonus", {})
	var growth = source.get("growthBonus", {})
	var initial_bonus := _normalized_int_stat_dict(initial, _generated_initial_bonus(seed))
	var growth_bonus := _normalized_float_stat_dict(growth, _generated_growth_bonus(seed))
	var quality_roll := int(source.get("qualityRoll", _stable_hash("%s:quality" % seed) % 10001))
	return {
		"schemaVersion": SCHEMA_VERSION,
		"qualityRoll": clampi(quality_roll, 0, 10000),
		"initialBonus": initial_bonus,
		"growthBonus": growth_bonus,
	}


static func stats_with_bonus(base: Dictionary, bonus: Dictionary) -> Dictionary:
	var result := {}
	for key in STAT_KEYS:
		result[key] = maxi(1, int(round(float(base.get(key, 1)) + float(bonus.get(key, 0)))))
	return result


static func stat_gains_for_level(growth_rates: Dictionary, growth_bonus: Dictionary, level: int) -> Dictionary:
	var result := {}
	var level_bonus := maxi(0, clampi(level, 1, 140) - 1)
	for key in STAT_KEYS:
		var rate := float(growth_rates.get(key, 0.0)) + float(growth_bonus.get(key, 0.0))
		result[key] = int(round(maxf(0.0, rate) * float(level_bonus)))
	return result


static func quality_score_for_variance(variance: Dictionary) -> int:
	var initial := variance.get("initialBonus", {}) as Dictionary
	var growth := variance.get("growthBonus", {}) as Dictionary
	var score := int(variance.get("qualityRoll", 5000))
	score += int(initial.get("maxHp", 0)) * 120
	score += int(initial.get("attack", 0)) * 400
	score += int(initial.get("defense", 0)) * 350
	score += int(initial.get("quick", 0)) * 300
	score += int(round(float(growth.get("maxHp", 0.0)) * 600.0))
	score += int(round(float(growth.get("attack", 0.0)) * 2200.0))
	score += int(round(float(growth.get("defense", 0.0)) * 2000.0))
	score += int(round(float(growth.get("quick", 0.0)) * 1800.0))
	return clampi(score, 0, 10000)


static func quality_label(score: int) -> String:
	if score >= BalanceCatalogModel.pet_quality_high_threshold(7600):
		return BalanceCatalogModel.pet_quality_label("high", "偏高")
	if score <= BalanceCatalogModel.pet_quality_low_threshold(2400):
		return BalanceCatalogModel.pet_quality_label("low", "偏低")
	return BalanceCatalogModel.pet_quality_label("normal", "普通")


static func growth_tier_label(tier_id: String) -> String:
	var normalized := tier_id.to_lower().strip_edges()
	if normalized == "" or normalized == "balanced":
		return "均衡"
	var labels: Array[String] = []
	if normalized.find("attack") >= 0:
		labels.append("攻击")
	if normalized.find("agility") >= 0 or normalized.find("quick") >= 0 or normalized.find("speed") >= 0:
		labels.append("敏捷")
	if normalized.find("defense") >= 0:
		labels.append("防御")
	if normalized.find("hp") >= 0 or normalized.find("health") >= 0 or normalized.find("stamina") >= 0 or normalized.find("survival") >= 0:
		labels.append("生命")
	return " / ".join(labels) if not labels.is_empty() else "未记录"


static func power_breakdown(value: Dictionary) -> Dictionary:
	var max_hp := maxi(0, int(value.get("maxHp", value.get("hp", 0))))
	var attack := maxi(0, int(value.get("attack", 0)))
	var defense := maxi(0, int(value.get("defense", 0)))
	var quick := maxi(0, int(value.get("agility", value.get("quick", 0))))
	var weights := BalanceCatalogModel.pet_power_weights()
	var hp_weight := float(weights.get("maxHp", 0.25))
	var attack_weight := float(weights.get("attack", 1.0))
	var defense_weight := float(weights.get("defense", 1.0))
	var quick_weight := float(weights.get("quick", 1.0))
	var hp_part := float(max_hp) * hp_weight
	var attack_part := float(attack) * attack_weight
	var defense_part := float(defense) * defense_weight
	var quick_part := float(quick) * quick_weight
	var total := int(round(hp_part + attack_part + defense_part + quick_part))
	var formula := str(BalanceCatalogModel.pet_power_formula().get("formula", "round(maxHp / 4 + attack + defense + agility)"))
	return {
		"formula": formula,
		"maxHp": max_hp,
		"maxHpContribution": hp_part,
		"attack": attack,
		"attackContribution": attack_part,
		"defense": defense,
		"defenseContribution": defense_part,
		"quick": quick,
		"agility": quick,
		"quickContribution": quick_part,
		"total": total,
	}


static func power_source_label(value: Dictionary) -> String:
	var breakdown := power_breakdown(value)
	return "战力来源：生命/4 %.1f + 攻击 %d + 防御 %d + 敏捷 %d = %d" % [
		float(breakdown.get("maxHpContribution", 0.0)),
		int(breakdown.get("attack", 0)),
		int(breakdown.get("defense", 0)),
		int(breakdown.get("quick", 0)),
		int(breakdown.get("total", 0)),
	]


static func _generated_initial_bonus(seed: String) -> Dictionary:
	var hp_range = BalanceCatalogModel.pet_initial_bonus_range("maxHp", -3, 3)
	var attack_range = BalanceCatalogModel.pet_initial_bonus_range("attack", -1, 1)
	var defense_range = BalanceCatalogModel.pet_initial_bonus_range("defense", -1, 1)
	var quick_range = BalanceCatalogModel.pet_initial_bonus_range("quick", -2, 2)
	return {
		"maxHp": _roll_int(seed, "initial_maxHp", int(hp_range.get("min", -3)), int(hp_range.get("max", 3))),
		"attack": _roll_int(seed, "initial_attack", int(attack_range.get("min", -1)), int(attack_range.get("max", 1))),
		"defense": _roll_int(seed, "initial_defense", int(defense_range.get("min", -1)), int(defense_range.get("max", 1))),
		"quick": _roll_int(seed, "initial_quick", int(quick_range.get("min", -2)), int(quick_range.get("max", 2))),
	}


static func _generated_growth_bonus(seed: String) -> Dictionary:
	var hp_range = BalanceCatalogModel.pet_growth_bonus_range("maxHp", -0.45, 0.45)
	var attack_range = BalanceCatalogModel.pet_growth_bonus_range("attack", -0.12, 0.12)
	var defense_range = BalanceCatalogModel.pet_growth_bonus_range("defense", -0.10, 0.10)
	var quick_range = BalanceCatalogModel.pet_growth_bonus_range("quick", -0.12, 0.12)
	return {
		"maxHp": _roll_float(seed, "growth_maxHp", float(hp_range.get("min", -0.45)), float(hp_range.get("max", 0.45))),
		"attack": _roll_float(seed, "growth_attack", float(attack_range.get("min", -0.12)), float(attack_range.get("max", 0.12))),
		"defense": _roll_float(seed, "growth_defense", float(defense_range.get("min", -0.10)), float(defense_range.get("max", 0.10))),
		"quick": _roll_float(seed, "growth_quick", float(quick_range.get("min", -0.12)), float(quick_range.get("max", 0.12))),
	}


static func _normalized_int_stat_dict(value, fallback: Dictionary) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = int(source.get(key, fallback.get(key, 0)))
	return result


static func _normalized_float_stat_dict(value, fallback: Dictionary) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = float(source.get(key, fallback.get(key, 0.0)))
	return result


static func _roll_int(seed: String, key: String, min_value: int, max_value: int) -> int:
	var span := maxi(1, max_value - min_value + 1)
	return min_value + int(_stable_hash("%s:%s" % [seed, key]) % span)


static func _roll_float(seed: String, key: String, min_value: float, max_value: float) -> float:
	var unit := float(_stable_hash("%s:%s" % [seed, key]) % 10001) / 10000.0
	return min_value + (max_value - min_value) * unit


static func _stable_hash(text: String) -> int:
	var hash_value := 2166136261
	for index in range(text.length()):
		hash_value = int((hash_value ^ text.unicode_at(index)) * 16777619) % 2147483647
	return abs(hash_value)
