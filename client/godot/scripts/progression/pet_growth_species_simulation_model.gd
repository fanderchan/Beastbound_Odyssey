extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")

const DEFAULT_PROFILE_ID := "blue_man_dragon_v1"
const DEFAULT_SAMPLE_COUNT := 100
const DEFAULT_LEVEL_MIN := 1
const DEFAULT_LEVEL_MAX := 140
const DEFAULT_REPORT_PATH := "res://../../.run/godot/pet_growth_species_simulation_report.json"
const DEFAULT_CSV_PATH := "res://../../.run/godot/pet_growth_species_simulation_rows.csv"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const ANCHOR_LEVELS: Array[int] = [1, 20, 50, 80, 100, 120, 131, 140]


static func run_default(profile_id: String = DEFAULT_PROFILE_ID) -> Dictionary:
	BalanceCatalogModel.reload()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	var rows := build_rows(profile)
	var report := build_report(profile, rows)
	var report_write := write_json(report, DEFAULT_REPORT_PATH)
	var csv_write := write_csv(rows, DEFAULT_CSV_PATH)
	var errors := validation_errors(report, rows)
	if not bool(report_write.get("ok", false)):
		errors.append(str(report_write.get("error", "JSON 报告写入失败")))
	if not bool(csv_write.get("ok", false)):
		errors.append(str(csv_write.get("error", "CSV 明细写入失败")))
	report["outputs"] = {
		"json": str(report_write.get("path", "")),
		"csv": str(csv_write.get("path", "")),
	}
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"report": report,
		"rows": rows,
		"reportWrite": report_write,
		"csvWrite": csv_write,
	}


static func build_rows(profile: Dictionary, sample_count: int = -1, level_min: int = -1, level_max: int = -1) -> Array[Dictionary]:
	if profile.is_empty():
		return []
	var target := profile.get("targetAudit", {}) as Dictionary
	var samples := sample_count if sample_count > 0 else int(target.get("sampleCount", DEFAULT_SAMPLE_COUNT))
	var min_level := level_min if level_min > 0 else int(target.get("levelMin", DEFAULT_LEVEL_MIN))
	var max_level := level_max if level_max > 0 else int(target.get("levelMax", DEFAULT_LEVEL_MAX))
	samples = maxi(1, samples)
	min_level = clampi(min_level, 1, 140)
	max_level = clampi(max_level, min_level, 140)
	var sample_rolls: Array[Dictionary] = []
	for sample_index in range(samples):
		var sample_no := sample_index + 1
		var seed := "%s:%03d" % [str(profile.get("profileId", DEFAULT_PROFILE_ID)), sample_no]
		var roll := _roll_individual(profile, seed)
		roll["sampleNo"] = sample_no
		sample_rolls.append(roll)
	_assign_relative_quality(sample_rolls)
	var rows: Array[Dictionary] = []
	for sample_index in range(samples):
		var sample_no := sample_index + 1
		var roll := sample_rolls[sample_index]
		for level in range(min_level, max_level + 1):
			rows.append(_row_for_level(profile, roll, sample_no, level))
	return rows


static func roll_individual_for_seed(profile: Dictionary, seed: String) -> Dictionary:
	return _roll_individual(profile, seed)


static func row_for_roll_level(profile: Dictionary, roll: Dictionary, sample_no: int, level: int) -> Dictionary:
	return _row_for_level(profile, roll, sample_no, level)


static func quality_tier_for_percentile(percentile: int) -> String:
	return _quality_tier_for_percentile(percentile)


static func build_report(profile: Dictionary, rows: Array[Dictionary]) -> Dictionary:
	var profile_id := str(profile.get("profileId", ""))
	var sample_ids := {}
	var levels := {}
	for row in rows:
		sample_ids[str(row.get("sampleId", ""))] = true
		levels[int(row.get("level", 0))] = true
	var sample_count := sample_ids.keys().size()
	var level_count := levels.keys().size()
	var level_summaries := _level_summaries(rows)
	var anchor_summaries: Array[Dictionary] = []
	for level in ANCHOR_LEVELS:
		if level_summaries.has(level):
			anchor_summaries.append(level_summaries[level])
	var sample_summaries := _sample_summaries(rows)
	var growth_summaries := _growth_summaries(sample_summaries)
	var quality_counts := _quality_counts(sample_summaries)
	var target := profile.get("targetAudit", {}) as Dictionary
	var lv1_summary := level_summaries.get(1, {}) as Dictionary
	var lv140_summary := level_summaries.get(140, {}) as Dictionary
	var findings := _findings(profile, lv1_summary, lv140_summary, growth_summaries, quality_counts, sample_count)
	return {
		"schemaVersion": 1,
		"mode": "pet_growth_species_offline_simulation",
		"profileId": profile_id,
		"displayName": str(profile.get("displayName", profile_id)),
		"sampleCount": sample_count,
		"levelCount": level_count,
		"rowCount": rows.size(),
		"expectedRows": sample_count * level_count,
		"balance": BalanceCatalogModel.balance_snapshot_summary(),
		"profile": profile,
		"targetAudit": target,
		"qualityCounts": quality_counts,
		"levelSummaries": anchor_summaries,
		"sampleSummaries": sample_summaries,
		"growthSummaries": growth_summaries,
		"findings": findings,
	}


static func validation_errors(report: Dictionary, rows: Array[Dictionary]) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "pet_growth_species_offline_simulation":
		errors.append("报告 mode 不正确")
	if rows.is_empty():
		errors.append("模拟明细为空")
	if int(report.get("sampleCount", 0)) <= 0:
		errors.append("样本数必须大于 0")
	if int(report.get("levelCount", 0)) <= 0:
		errors.append("等级数必须大于 0")
	if int(report.get("rowCount", 0)) != int(report.get("expectedRows", -1)):
		errors.append("明细行数与样本数*等级数不一致")
	var profile := report.get("profile", {}) as Dictionary
	if profile.is_empty():
		errors.append("缺少物种成长配置")
	var target := report.get("targetAudit", {}) as Dictionary
	var lv1_summary := _summary_for_level(report, 1)
	var lv140_summary := _summary_for_level(report, 140)
	var hp_spread = target.get("lv1MaxHpSpread", [])
	if hp_spread is Array and (hp_spread as Array).size() >= 2 and not lv1_summary.is_empty():
		var base_hp := int((profile.get("outputBase", {}) as Dictionary).get("maxHp", 0))
		var min_allowed := base_hp + int((hp_spread as Array)[0])
		var max_allowed := base_hp + int((hp_spread as Array)[1])
		var actual_min := int((lv1_summary.get("maxHp", {}) as Dictionary).get("min", min_allowed))
		var actual_max := int((lv1_summary.get("maxHp", {}) as Dictionary).get("max", max_allowed))
		if actual_min < min_allowed or actual_max > max_allowed:
			errors.append("Lv1 生命超出配置浮动边界")
	var power_band = target.get("lv140PowerBand", [])
	if power_band is Array and (power_band as Array).size() >= 2 and not lv140_summary.is_empty():
		var power := lv140_summary.get("combatPower", {}) as Dictionary
		var avg_power := float(power.get("avg", 0.0))
		if avg_power <= 0.0:
			errors.append("Lv140 平均战力无效")
	var growth_summaries := report.get("growthSummaries", {}) as Dictionary
	var three_band = target.get("threeStatGrowthBand", [])
	if three_band is Array and (three_band as Array).size() >= 2 and growth_summaries.has("threeStatGrowthPerLevel"):
		var three_growth := growth_summaries.get("threeStatGrowthPerLevel", {}) as Dictionary
		var actual_min := float(three_growth.get("min", 0.0))
		var actual_max := float(three_growth.get("max", 0.0))
		var low := float((three_band as Array)[0])
		var high := float((three_band as Array)[1])
		if actual_min < low or actual_max > high:
			errors.append("三维成长范围 %.2f-%.2f 超出目标 %.2f-%.2f" % [actual_min, actual_max, low, high])
	var hp_growth_band = target.get("hpGrowthBand", [])
	if hp_growth_band is Array and (hp_growth_band as Array).size() >= 2 and growth_summaries.has("hpGrowthPerLevel"):
		var hp_growth := growth_summaries.get("hpGrowthPerLevel", {}) as Dictionary
		var hp_actual_min := float(hp_growth.get("min", 0.0))
		var hp_actual_max := float(hp_growth.get("max", 0.0))
		var hp_low := float((hp_growth_band as Array)[0])
		var hp_high := float((hp_growth_band as Array)[1])
		if hp_actual_min < hp_low or hp_actual_max > hp_high:
			errors.append("血成长范围 %.2f-%.2f 超出目标 %.2f-%.2f" % [hp_actual_min, hp_actual_max, hp_low, hp_high])
	for row in rows:
		if int(row.get("level", 0)) < 1 or int(row.get("level", 0)) > 140:
			errors.append("存在非法等级")
			break
	return errors


static func write_json(report: Dictionary, output_path: String = DEFAULT_REPORT_PATH) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(output_path).simplify_path()
	var dir_path := absolute_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir_error := DirAccess.make_dir_recursive_absolute(dir_path)
		if dir_error != OK:
			return {"ok": false, "path": absolute_path, "error": "无法创建目录: %d" % dir_error}
	var file := FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "path": absolute_path, "error": "无法写入 JSON 报告"}
	file.store_string(JSON.stringify(report, "\t", false))
	file.close()
	return {"ok": true, "path": absolute_path, "error": ""}


static func write_csv(rows: Array[Dictionary], output_path: String = DEFAULT_CSV_PATH) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(output_path).simplify_path()
	var dir_path := absolute_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir_error := DirAccess.make_dir_recursive_absolute(dir_path)
		if dir_error != OK:
			return {"ok": false, "path": absolute_path, "error": "无法创建目录: %d" % dir_error}
	var file := FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "path": absolute_path, "error": "无法写入 CSV 明细"}
	var headers := [
		"profileId", "sampleId", "sampleNo", "level", "qualityTier", "qualityScore", "qualityPercentile",
		"maxHp", "attack", "defense", "quick", "combatPower",
		"deltaMaxHp", "deltaAttack", "deltaDefense", "deltaQuick", "deltaThreeStats",
		"initialMaxHp", "initialAttack", "initialDefense", "initialQuick",
		"growthMaxHp", "growthAttack", "growthDefense", "growthQuick",
	]
	file.store_line(",".join(headers))
	for row in rows:
		var values: Array[String] = []
		for header in headers:
			values.append(_csv_cell(row.get(header, "")))
		file.store_line(",".join(values))
	file.close()
	return {"ok": true, "path": absolute_path, "error": ""}


static func _row_for_level(profile: Dictionary, roll: Dictionary, sample_no: int, level: int) -> Dictionary:
	var profile_id := str(profile.get("profileId", DEFAULT_PROFILE_ID))
	var output_base := profile.get("outputBase", {}) as Dictionary
	var output_growth := profile.get("outputGrowth", {}) as Dictionary
	var initial := roll.get("initialBonus", {}) as Dictionary
	var growth := roll.get("growthBonus", {}) as Dictionary
	var stats := _stats_for_level(output_base, output_growth, initial, growth, level)
	var previous_stats := _stats_for_level(output_base, output_growth, initial, growth, level - 1) if level > 1 else {}
	var delta_max_hp := int(stats.get("maxHp", 1)) - int(previous_stats.get("maxHp", stats.get("maxHp", 1)))
	var delta_attack := int(stats.get("attack", 1)) - int(previous_stats.get("attack", stats.get("attack", 1)))
	var delta_defense := int(stats.get("defense", 1)) - int(previous_stats.get("defense", stats.get("defense", 1)))
	var delta_quick := int(stats.get("quick", 1)) - int(previous_stats.get("quick", stats.get("quick", 1)))
	var combat_power := PetPowerModel.combat_power_for_stats(stats)
	return {
		"profileId": profile_id,
		"sampleId": "%s_%03d" % [profile_id, sample_no],
		"sampleNo": sample_no,
		"level": level,
		"qualityTier": str(roll.get("qualityTier", "C")),
		"qualityScore": int(roll.get("qualityScore", 0)),
		"qualityPercentile": int(roll.get("qualityPercentile", 0)),
		"maxHp": int(stats.get("maxHp", 1)),
		"attack": int(stats.get("attack", 1)),
		"defense": int(stats.get("defense", 1)),
		"quick": int(stats.get("quick", 1)),
		"combatPower": combat_power,
		"deltaMaxHp": delta_max_hp,
		"deltaAttack": delta_attack,
		"deltaDefense": delta_defense,
		"deltaQuick": delta_quick,
		"deltaThreeStats": delta_attack + delta_defense + delta_quick,
		"initialMaxHp": int(initial.get("maxHp", 0)),
		"initialAttack": int(initial.get("attack", 0)),
		"initialDefense": int(initial.get("defense", 0)),
		"initialQuick": int(initial.get("quick", 0)),
		"growthMaxHp": snappedf(float(growth.get("maxHp", 0.0)), 0.001),
		"growthAttack": snappedf(float(growth.get("attack", 0.0)), 0.001),
		"growthDefense": snappedf(float(growth.get("defense", 0.0)), 0.001),
		"growthQuick": snappedf(float(growth.get("quick", 0.0)), 0.001),
	}


static func _stats_for_level(output_base: Dictionary, output_growth: Dictionary, initial: Dictionary, growth: Dictionary, level: int) -> Dictionary:
	var stats := {}
	var safe_level := maxi(1, level)
	for key in STAT_KEYS:
		var base_value := float(output_base.get(key, 1.0))
		var growth_value := float(output_growth.get(key, 0.0))
		var initial_bonus := float(initial.get(key, 0.0))
		var growth_bonus := float(growth.get(key, 0.0))
		stats[key] = maxi(1, int(round(base_value + initial_bonus + (growth_value + growth_bonus) * float(safe_level - 1))))
	return stats


static func _roll_individual(profile: Dictionary, seed: String) -> Dictionary:
	var rules := profile.get("individualRules", {}) as Dictionary
	var initial_spread := rules.get("initialOutputSpread", {}) as Dictionary
	var growth_spread := rules.get("growthOutputSpread", {}) as Dictionary
	var distribution := str(rules.get("distribution", "weighted_center"))
	var rare_rate := clampf(float(rules.get("rareExtremeRate", 0.02)), 0.0, 0.25)
	var initial := {}
	var growth := {}
	for key in STAT_KEYS:
		var initial_range := _range_for_key(initial_spread, key, -1.0, 1.0)
		var growth_range := _range_for_key(growth_spread, key, -0.1, 0.1)
		initial[key] = int(round(_roll_in_range(seed, "initial_%s" % key, initial_range, distribution, rare_rate)))
		growth[key] = snappedf(_roll_in_range(seed, "growth_%s" % key, growth_range, distribution, rare_rate), 0.001)
	var quality_score := _quality_score(initial, growth, initial_spread, growth_spread)
	return {
		"seed": seed,
		"qualityScore": quality_score,
		"qualityPercentile": 0,
		"qualityTier": "C",
		"initialBonus": initial,
		"growthBonus": growth,
	}


static func _assign_relative_quality(rolls: Array[Dictionary]) -> void:
	var sorted: Array[Dictionary] = rolls.duplicate()
	sorted.sort_custom(func(a, b): return int(a.get("qualityScore", 0)) < int(b.get("qualityScore", 0)))
	var denom := maxi(1, sorted.size() - 1)
	for index in range(sorted.size()):
		var roll := sorted[index]
		var percentile := int(round(float(index) / float(denom) * 100.0))
		roll["qualityPercentile"] = percentile
		roll["qualityTier"] = _quality_tier_for_percentile(percentile)


static func _roll_in_range(seed: String, key: String, range_value: Dictionary, distribution: String, rare_rate: float) -> float:
	var min_value := float(range_value.get("min", 0.0))
	var max_value := float(range_value.get("max", 0.0))
	if max_value <= min_value:
		return min_value
	var unit := _unit("%s:%s" % [seed, key])
	if distribution == "uniform":
		return min_value + (max_value - min_value) * unit
	if distribution == "rare_spike":
		var spike := _unit("%s:%s:spike" % [seed, key])
		if spike < rare_rate:
			unit = 0.92 + _unit("%s:%s:spike_value" % [seed, key]) * 0.08
		else:
			unit = pow(_unit("%s:%s:body" % [seed, key]), 1.35) * 0.72
		return min_value + (max_value - min_value) * clampf(unit, 0.0, 1.0)
	var rare := _unit("%s:%s:rare" % [seed, key])
	if rare < rare_rate:
		unit = 0.0 if _unit("%s:%s:side" % [seed, key]) < 0.5 else 1.0
	else:
		var a := _unit("%s:%s:a" % [seed, key])
		var b := _unit("%s:%s:b" % [seed, key])
		unit = (a + b) * 0.5
	return min_value + (max_value - min_value) * clampf(unit, 0.0, 1.0)


static func _quality_score(initial: Dictionary, growth: Dictionary, initial_spread: Dictionary, growth_spread: Dictionary) -> int:
	var weights := {"maxHp": 0.30, "attack": 0.30, "defense": 0.20, "quick": 0.20}
	var initial_score := 0.0
	var growth_score := 0.0
	for key in STAT_KEYS:
		var weight := float(weights.get(key, 0.25))
		initial_score += _normalized_stat_score(float(initial.get(key, 0.0)), _range_for_key(initial_spread, key, 0.0, 0.0)) * weight
		growth_score += _normalized_stat_score(float(growth.get(key, 0.0)), _range_for_key(growth_spread, key, 0.0, 0.0)) * weight
	return clampi(int(round((initial_score * 0.35 + growth_score * 0.65) * 100.0)), 0, 100)


static func _quality_tier_for_percentile(percentile: int) -> String:
	if percentile >= 98:
		return "S"
	if percentile >= 85:
		return "A"
	if percentile >= 55:
		return "B"
	if percentile >= 20:
		return "C"
	return "D"


static func _normalized_stat_score(value: float, range_value: Dictionary) -> float:
	var min_value := float(range_value.get("min", 0.0))
	var max_value := float(range_value.get("max", 0.0))
	if absf(max_value - min_value) <= 0.0001:
		return 0.5
	return clampf((value - min_value) / (max_value - min_value), 0.0, 1.0)


static func _level_summaries(rows: Array[Dictionary]) -> Dictionary:
	var grouped := {}
	for row in rows:
		var level := int(row.get("level", 0))
		if not grouped.has(level):
			grouped[level] = []
		(grouped[level] as Array).append(row)
	var result := {}
	for level in grouped.keys():
		result[level] = _summary_for_rows(grouped[level], {"level": level})
	return result


static func _sample_summaries(rows: Array[Dictionary]) -> Array[Dictionary]:
	var by_sample := {}
	for row in rows:
		var sample_id := str(row.get("sampleId", ""))
		if not by_sample.has(sample_id):
			by_sample[sample_id] = []
		(by_sample[sample_id] as Array).append(row)
	var summaries: Array[Dictionary] = []
	for sample_id in by_sample.keys():
		var sample_rows: Array = by_sample[sample_id]
		var lv1 := _row_for_specific_level(sample_rows, 1)
		var lv140 := _row_for_specific_level(sample_rows, 140)
		if lv1.is_empty() or lv140.is_empty():
			continue
		var hp_growth := (float(lv140.get("maxHp", 0)) - float(lv1.get("maxHp", 0))) / 139.0
		var attack_growth := (float(lv140.get("attack", 0)) - float(lv1.get("attack", 0))) / 139.0
		var defense_growth := (float(lv140.get("defense", 0)) - float(lv1.get("defense", 0))) / 139.0
		var quick_growth := (float(lv140.get("quick", 0)) - float(lv1.get("quick", 0))) / 139.0
		var three_growth := attack_growth + defense_growth + quick_growth
		summaries.append({
			"sampleId": sample_id,
			"sampleNo": int(lv1.get("sampleNo", 0)),
			"qualityTier": str(lv1.get("qualityTier", "C")),
			"qualityScore": int(lv1.get("qualityScore", 0)),
			"qualityPercentile": int(lv1.get("qualityPercentile", 0)),
			"lv1": _compact_stats(lv1),
			"lv140": _compact_stats(lv140),
			"hpGrowthPerLevel": snappedf(hp_growth, 0.001),
			"attackGrowthPerLevel": snappedf(attack_growth, 0.001),
			"defenseGrowthPerLevel": snappedf(defense_growth, 0.001),
			"quickGrowthPerLevel": snappedf(quick_growth, 0.001),
			"threeStatGrowthPerLevel": snappedf(three_growth, 0.001),
			"initialBonus": {
				"maxHp": int(lv1.get("initialMaxHp", 0)),
				"attack": int(lv1.get("initialAttack", 0)),
				"defense": int(lv1.get("initialDefense", 0)),
				"quick": int(lv1.get("initialQuick", 0)),
			},
			"growthBonus": {
				"maxHp": float(lv1.get("growthMaxHp", 0.0)),
				"attack": float(lv1.get("growthAttack", 0.0)),
				"defense": float(lv1.get("growthDefense", 0.0)),
				"quick": float(lv1.get("growthQuick", 0.0)),
			},
		})
	summaries.sort_custom(func(a, b): return int(a.get("sampleNo", 0)) < int(b.get("sampleNo", 0)))
	return summaries


static func _growth_summaries(sample_summaries: Array[Dictionary]) -> Dictionary:
	return {
		"hpGrowthPerLevel": _numeric_summary_float(sample_summaries, "hpGrowthPerLevel"),
		"attackGrowthPerLevel": _numeric_summary_float(sample_summaries, "attackGrowthPerLevel"),
		"defenseGrowthPerLevel": _numeric_summary_float(sample_summaries, "defenseGrowthPerLevel"),
		"quickGrowthPerLevel": _numeric_summary_float(sample_summaries, "quickGrowthPerLevel"),
		"threeStatGrowthPerLevel": _numeric_summary_float(sample_summaries, "threeStatGrowthPerLevel"),
	}


static func _summary_for_rows(rows: Array, extra: Dictionary = {}) -> Dictionary:
	var summary := extra.duplicate(true)
	for key in ["maxHp", "attack", "defense", "quick", "combatPower"]:
		summary[key] = _numeric_summary(rows, key)
	return summary


static func _numeric_summary(rows: Array, key: String) -> Dictionary:
	if rows.is_empty():
		return {"min": 0, "max": 0, "avg": 0.0}
	var min_value := INF
	var max_value := -INF
	var total := 0.0
	for row in rows:
		var value := float((row as Dictionary).get(key, 0.0))
		min_value = minf(min_value, value)
		max_value = maxf(max_value, value)
		total += value
	return {
		"min": int(round(min_value)),
		"max": int(round(max_value)),
		"avg": snappedf(total / float(rows.size()), 0.01),
	}


static func _numeric_summary_float(rows: Array, key: String) -> Dictionary:
	if rows.is_empty():
		return {"min": 0.0, "max": 0.0, "avg": 0.0}
	var min_value := INF
	var max_value := -INF
	var total := 0.0
	for row in rows:
		var value := float((row as Dictionary).get(key, 0.0))
		min_value = minf(min_value, value)
		max_value = maxf(max_value, value)
		total += value
	return {
		"min": snappedf(min_value, 0.001),
		"max": snappedf(max_value, 0.001),
		"avg": snappedf(total / float(rows.size()), 0.001),
	}


static func _quality_counts(sample_summaries: Array[Dictionary]) -> Dictionary:
	var counts := {"S": 0, "A": 0, "B": 0, "C": 0, "D": 0}
	for sample in sample_summaries:
		var tier := str(sample.get("qualityTier", "C"))
		counts[tier] = int(counts.get(tier, 0)) + 1
	return counts


static func _findings(profile: Dictionary, lv1: Dictionary, lv140: Dictionary, growth_summaries: Dictionary, quality_counts: Dictionary, sample_count: int) -> Array[Dictionary]:
	var findings: Array[Dictionary] = []
	var target := profile.get("targetAudit", {}) as Dictionary
	var hp := lv1.get("maxHp", {}) as Dictionary
	var power := lv140.get("combatPower", {}) as Dictionary
	var power_band = target.get("lv140PowerBand", [])
	var power_note := "未配置 Lv140 战力目标。"
	if power_band is Array and (power_band as Array).size() >= 2:
		var low := int((power_band as Array)[0])
		var high := int((power_band as Array)[1])
		var avg_power := float(power.get("avg", 0.0))
		power_note = "Lv140 平均战力 %.2f，目标区间 %d-%d。" % [avg_power, low, high]
	findings.append({
		"id": "lv1_hp_spread",
		"text": "Lv1 生命样本范围 %d-%d，平均 %.2f。" % [
			int(hp.get("min", 0)),
			int(hp.get("max", 0)),
			float(hp.get("avg", 0.0)),
		],
	})
	findings.append({
		"id": "lv140_power_band",
		"text": power_note,
	})
	var hp_growth := growth_summaries.get("hpGrowthPerLevel", {}) as Dictionary
	var three_growth := growth_summaries.get("threeStatGrowthPerLevel", {}) as Dictionary
	findings.append({
		"id": "hp_growth_band",
		"text": "血成长样本范围 %.3f-%.3f，平均 %.3f。" % [
			float(hp_growth.get("min", 0.0)),
			float(hp_growth.get("max", 0.0)),
			float(hp_growth.get("avg", 0.0)),
		],
	})
	findings.append({
		"id": "three_stat_growth_band",
		"text": "三维成长样本范围 %.3f-%.3f，平均 %.3f。" % [
			float(three_growth.get("min", 0.0)),
			float(three_growth.get("max", 0.0)),
			float(three_growth.get("avg", 0.0)),
		],
	})
	findings.append({
		"id": "quality_mix",
		"text": "样本品质分布 S:%d A:%d B:%d C:%d D:%d，总样本 %d。" % [
			int(quality_counts.get("S", 0)),
			int(quality_counts.get("A", 0)),
			int(quality_counts.get("B", 0)),
			int(quality_counts.get("C", 0)),
			int(quality_counts.get("D", 0)),
			sample_count,
		],
	})
	return findings


static func _summary_for_level(report: Dictionary, level: int) -> Dictionary:
	var summaries: Array = report.get("levelSummaries", [])
	for value in summaries:
		if value is Dictionary and int((value as Dictionary).get("level", 0)) == level:
			return value as Dictionary
	return {}


static func _row_for_specific_level(rows: Array, level: int) -> Dictionary:
	for row in rows:
		if row is Dictionary and int((row as Dictionary).get("level", 0)) == level:
			return row as Dictionary
	return {}


static func _compact_stats(row: Dictionary) -> Dictionary:
	return {
		"level": int(row.get("level", 0)),
		"maxHp": int(row.get("maxHp", 0)),
		"attack": int(row.get("attack", 0)),
		"defense": int(row.get("defense", 0)),
		"quick": int(row.get("quick", 0)),
		"combatPower": int(row.get("combatPower", 0)),
	}


static func _range_for_key(ranges: Dictionary, key: String, fallback_min: float, fallback_max: float) -> Dictionary:
	var raw = ranges.get(key, [])
	var min_value := fallback_min
	var max_value := fallback_max
	if raw is Array and (raw as Array).size() >= 2:
		min_value = float((raw as Array)[0])
		max_value = float((raw as Array)[1])
	if min_value > max_value:
		var swap := min_value
		min_value = max_value
		max_value = swap
	return {"min": min_value, "max": max_value}


static func _unit(text: String) -> float:
	return float(_stable_hash(text) % 1000001) / 1000000.0


static func _stable_hash(text: String) -> int:
	var hash_value := 2166136261
	for index in range(text.length()):
		hash_value = int((hash_value ^ text.unicode_at(index)) * 16777619) % 2147483647
	return abs(hash_value)


static func _csv_cell(value) -> String:
	if value == null:
		return ""
	var text := str(value)
	if text.find(",") >= 0 or text.find("\"") >= 0 or text.find("\n") >= 0:
		return "\"%s\"" % text.replace("\"", "\"\"")
	return text
