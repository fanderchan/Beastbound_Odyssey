extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetGrowthSpeciesSimulationModel := preload("res://scripts/progression/pet_growth_species_simulation_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")

const DEFAULT_PROFILE_ID := "blue_man_dragon_v1"
const DEFAULT_FORM_ID := "blue_man_dragon_water10"
const DEFAULT_CSV_PATH := "res://../../.run/godot/pet_growth_observation_100.csv"
const DEFAULT_THRESHOLD_PATH := "res://../../.run/godot/pet_growth_power_percentiles.json"
const DEFAULT_THRESHOLD_SAMPLE_COUNT := 10000
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}
const REBIRTH_STAGE_LABELS := {
	0: "0转成长",
	1: "1转成长",
	2: "2转成长",
}
const REBIRTH_HP_INTERNAL_SCALE := 4.0
const REBIRTH_POWER_THRESHOLDS := {
	1: {"min": 0.0, "p25": 0.55, "p55": 1.05, "p85": 1.35, "p95": 1.52, "max": 1.60},
	2: {"min": 0.0, "p25": 0.65, "p55": 1.18, "p85": 1.55, "p95": 1.76, "max": 1.85},
}
const REBIRTH_STAT_INTERNAL_THRESHOLDS := {
	1: {"min": 0.0, "p25": 0.12, "p55": 0.28, "p85": 0.55, "p95": 0.85, "max": 1.30},
	2: {"min": 0.0, "p25": 0.14, "p55": 0.32, "p85": 0.62, "p95": 0.98, "max": 1.50},
}


static func create_pet_instance(profile_id: String, instance_id: String, form_id: String, pet_name: String, state: String, level: int = 1, seed: String = "", sample_no: int = 0) -> Dictionary:
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if profile.is_empty():
		return {}
	var safe_seed := seed.strip_edges()
	if safe_seed == "":
		safe_seed = "%s:%s" % [profile_id, instance_id]
	var roll := PetGrowthSpeciesSimulationModel.roll_individual_for_seed(profile, safe_seed)
	var safe_level := clampi(level, 1, 140)
	var stats := _stats_for_profile_roll_level(profile, roll, safe_level)
	var level1_stats := _stats_for_profile_roll_level(profile, roll, 1)
	var instance := {
		"instanceId": instance_id,
		"petId": instance_id,
		"templateId": form_id,
		"formId": form_id,
		"name": pet_name if pet_name != "" else str(profile.get("displayName", "蓝人龙")),
		"state": state,
		"level": safe_level,
		"exp": 0,
		"hp": int(stats.get("maxHp", 1)),
		"maxHp": int(stats.get("maxHp", 1)),
		"attack": int(stats.get("attack", 1)),
		"defense": int(stats.get("defense", 1)),
		"quick": int(stats.get("quick", 1)),
		"growthSpeciesProfileId": profile_id,
		"growthSpeciesSeed": safe_seed,
		"growthSpeciesSampleNo": sample_no,
		"growthSpeciesRoll": roll,
		"growthSpeciesLevel1Stats": level1_stats,
		"initialStats": level1_stats,
		"growthRecord": _growth_record_from_roll(roll),
	}
	return normalize_pet_instance(instance, {})


static func normalize_pet_instance(instance: Dictionary, template: Dictionary = {}) -> Dictionary:
	var next := instance.duplicate(true)
	var profile_id := str(next.get("growthSpeciesProfileId", template.get("growthSpeciesProfileId", ""))).strip_edges()
	if profile_id == "":
		return next
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if profile.is_empty():
		return next
	next["growthSpeciesProfileId"] = profile_id
	var seed := str(next.get("growthSpeciesSeed", next.get("individualSeed", next.get("instanceId", profile_id)))).strip_edges()
	if seed == "":
		seed = "%s:%s" % [profile_id, str(next.get("instanceId", "pet"))]
	next["growthSpeciesSeed"] = seed
	var roll = next.get("growthSpeciesRoll", {})
	var roll_dict := roll as Dictionary if roll is Dictionary else {}
	if roll_dict.is_empty() or not roll_dict.has("growthBonus"):
		roll_dict = PetGrowthSpeciesSimulationModel.roll_individual_for_seed(profile, seed)
	next["growthSpeciesRoll"] = roll_dict
	var safe_level := clampi(int(next.get("level", 1)), 1, 140)
	next["level"] = safe_level
	var old_max_hp := maxi(1, int(next.get("maxHp", 1)))
	var old_hp := clampi(int(next.get("hp", old_max_hp)), 0, old_max_hp)
	var missing_hp := maxi(0, old_max_hp - old_hp)
	var cultivation_bonus := _cultivation_growth_bonus(next.get("petCultivation", {}))
	var stats := _stats_for_profile_roll_level(profile, roll_dict, safe_level, cultivation_bonus)
	var max_hp := maxi(1, int(stats.get("maxHp", old_max_hp)))
	next["maxHp"] = max_hp
	next["hp"] = clampi(max_hp - missing_hp, 0, max_hp)
	next["attack"] = maxi(1, int(stats.get("attack", next.get("attack", 1))))
	next["defense"] = maxi(1, int(stats.get("defense", next.get("defense", 1))))
	next["quick"] = maxi(1, int(stats.get("quick", next.get("quick", 1))))
	var level1 = next.get("growthSpeciesLevel1Stats", {})
	var level1_dict := level1 as Dictionary if level1 is Dictionary else {}
	if level1_dict.is_empty():
		level1_dict = _stats_for_profile_roll_level(profile, roll_dict, 1, cultivation_bonus)
	next["growthSpeciesLevel1Stats"] = level1_dict
	next["initialStats"] = level1_dict
	next["growthRecord"] = _growth_record_from_roll(roll_dict, cultivation_bonus)
	next["growthTierId"] = profile_id
	next["growthTierLabel"] = str(profile.get("displayName", profile_id))
	next["growthObservation"] = evaluate_pet(next)
	next["individualQualityLabel"] = str((next["growthObservation"] as Dictionary).get("overallGrade", "未观察"))
	next["individualQualityScore"] = int(round(float((next["growthObservation"] as Dictionary).get("powerPercentile", 0.0)) * 100.0))
	return next


static func level_up_once(instance: Dictionary, max_level: int = 140) -> Dictionary:
	var current := normalize_pet_instance(instance)
	var level := clampi(int(current.get("level", 1)), 1, max_level)
	if level >= max_level:
		return current
	current["level"] = level + 1
	current["exp"] = 0
	return normalize_pet_instance(current)


static func evaluate_pet(instance: Dictionary) -> Dictionary:
	return evaluate_pet_for_stage(instance, 0)


static func evaluate_pet_for_stage(instance: Dictionary, stage: int = 0) -> Dictionary:
	var safe_stage := clampi(stage, 0, 2)
	if safe_stage > 0:
		return _evaluate_rebirth_growth(instance, safe_stage)
	if _is_server_growth_pet(instance):
		return _evaluate_server_observed_growth(instance)
	return _evaluate_base_growth(instance)


static func _evaluate_server_observed_growth(instance: Dictionary) -> Dictionary:
	var profile_id := str(instance.get("growthSpeciesProfileId", "")).strip_edges()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	var level := clampi(int(instance.get("level", 1)), 1, 140)
	var observed_levels := maxi(0, level - 1)
	var level1 := _strict_public_level_one_stats(instance)
	var current := _strict_current_stats(instance)
	var has_record := not profile.is_empty() and not level1.is_empty() and not current.is_empty() and observed_levels > 0
	var stat_averages := {}
	var stat_percentiles := {}
	var stat_grades := {}
	var power_growth := 0.0
	var power_percentile := 0.0
	if has_record:
		for key in STAT_KEYS:
			var average := (float(current.get(key, 0.0)) - float(level1.get(key, 0.0))) / float(observed_levels)
			var percentile := _growth_percentile_for_stat(profile, key, average)
			stat_averages[key] = snappedf(average, 0.001)
			stat_percentiles[key] = snappedf(percentile, 0.1)
			stat_grades[key] = _grade_for_percentile(percentile)
		power_growth = (
			float(PetPowerModel.combat_power_for_stats(current))
			- float(PetPowerModel.combat_power_for_stats(level1))
		) / float(observed_levels)
		power_percentile = _power_growth_percentile(profile, power_growth, level)
	return {
		"schemaVersion": 1,
		"profileId": profile_id,
		"level": level,
		"observedLevels": observed_levels,
		"stage": 0,
		"stageLabel": str(REBIRTH_STAGE_LABELS.get(0, "0转成长")),
		"enabled": true,
		"hasRecord": has_record,
		"statAverages": stat_averages,
		"statPercentiles": stat_percentiles,
		"statGrades": stat_grades,
		"powerGrowthPerLevel": snappedf(power_growth, 0.001),
		"powerPercentile": snappedf(power_percentile, 0.1),
		"overallGrade": _grade_for_percentile(power_percentile) if has_record else ("未观察" if observed_levels <= 0 else "资料不足"),
	}


static func _evaluate_base_growth(instance: Dictionary) -> Dictionary:
	var profile_id := str(instance.get("growthSpeciesProfileId", "")).strip_edges()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	var level := clampi(int(instance.get("level", 1)), 1, 140)
	if profile.is_empty():
		return {
			"schemaVersion": 1,
			"profileId": profile_id,
			"level": level,
			"observedLevels": maxi(0, level - 1),
			"stage": 0,
			"stageLabel": str(REBIRTH_STAGE_LABELS.get(0, "0转成长")),
			"enabled": true,
			"overallGrade": "未知",
		}
	var observed_levels := maxi(0, level - 1)
	var roll_dict := _roll_for_instance(instance, profile, profile_id)
	var level1_stats := _level1_stats_for_instance(instance, profile, roll_dict)
	var current_stats := _stats_for_profile_roll_level(profile, roll_dict, level)
	var stat_averages := {}
	var stat_percentiles := {}
	var stat_grades := {}
	if observed_levels > 0:
		for key in STAT_KEYS:
			var average := (float(current_stats.get(key, 0.0)) - float(level1_stats.get(key, current_stats.get(key, 0.0)))) / float(observed_levels)
			var percentile := _growth_percentile_for_stat(profile, key, average)
			stat_averages[key] = snappedf(average, 0.001)
			stat_percentiles[key] = snappedf(percentile, 0.1)
			stat_grades[key] = _grade_for_percentile(percentile)
	var power_growth := 0.0
	var power_percentile := 0.0
	if observed_levels > 0:
		var current_power := PetPowerModel.combat_power_for_stats(current_stats)
		var level1_power := PetPowerModel.combat_power_for_stats(level1_stats)
		power_growth = (float(current_power) - float(level1_power)) / float(observed_levels)
		power_percentile = _power_growth_percentile(profile, power_growth, level)
	var overall_grade := _grade_for_percentile(power_percentile) if observed_levels > 0 else "未观察"
	return {
		"schemaVersion": 1,
		"profileId": profile_id,
		"level": level,
		"observedLevels": observed_levels,
		"stage": 0,
		"stageLabel": str(REBIRTH_STAGE_LABELS.get(0, "0转成长")),
		"enabled": true,
		"statAverages": stat_averages,
		"statPercentiles": stat_percentiles,
		"statGrades": stat_grades,
		"powerGrowthPerLevel": snappedf(power_growth, 0.001),
		"powerPercentile": snappedf(power_percentile, 0.1),
		"overallGrade": overall_grade,
	}


static func _evaluate_rebirth_growth(instance: Dictionary, stage: int) -> Dictionary:
	var safe_stage := clampi(stage, 1, 2)
	var level := clampi(int(instance.get("level", 1)), 1, 140)
	var rebirth_count := _rebirth_count(instance)
	var label := str(REBIRTH_STAGE_LABELS.get(safe_stage, "%d转成长" % safe_stage))
	if rebirth_count < safe_stage:
		return {
			"schemaVersion": 1,
			"profileId": str(instance.get("growthSpeciesProfileId", "")).strip_edges(),
			"level": level,
			"observedLevels": maxi(0, level - 1),
			"stage": safe_stage,
			"stageLabel": label,
			"enabled": false,
			"overallGrade": "未开启",
		}
	var bonus := _rebirth_stage_bonus(instance, safe_stage)
	var has_record := not _bonus_is_zero(bonus)
	var stat_averages := {}
	var stat_percentiles := {}
	var stat_grades := {}
	for key in STAT_KEYS:
		var visible_growth := float(bonus.get(key, 0.0))
		var internal_growth := _rebirth_internal_value(key, visible_growth)
		var percentile := _rebirth_stat_percentile(safe_stage, internal_growth)
		stat_averages[key] = snappedf(visible_growth, 0.001)
		stat_percentiles[key] = snappedf(percentile, 0.1)
		stat_grades[key] = _grade_for_percentile(percentile) if has_record else "未记录"
	var power_growth := _rebirth_power_growth(bonus)
	var power_percentile := _rebirth_power_percentile(safe_stage, power_growth)
	return {
		"schemaVersion": 1,
		"profileId": str(instance.get("growthSpeciesProfileId", "")).strip_edges(),
		"level": level,
		"observedLevels": maxi(0, level - 1),
		"stage": safe_stage,
		"stageLabel": label,
		"enabled": true,
		"hasRecord": has_record,
		"statAverages": stat_averages,
		"statPercentiles": stat_percentiles,
		"statGrades": stat_grades,
		"powerGrowthPerLevel": snappedf(power_growth, 0.001),
		"powerPercentile": snappedf(power_percentile, 0.1),
		"overallGrade": _grade_for_percentile(power_percentile) if has_record else "未记录",
	}


static func detail_lines(instance: Dictionary) -> Array[String]:
	return detail_lines_for_stage(instance, 0)


static func detail_lines_for_stage(instance: Dictionary, stage: int = 0) -> Array[String]:
	var data := evaluate_pet_for_stage(instance, stage)
	var lines: Array[String] = []
	var observed_levels := int(data.get("observedLevels", 0))
	var safe_stage := clampi(int(data.get("stage", stage)), 0, 2)
	lines.append("%s评价：%s" % [
		str(data.get("stageLabel", REBIRTH_STAGE_LABELS.get(safe_stage, "成长"))),
		str(data.get("overallGrade", "未观察")),
	])
	if not bool(data.get("enabled", true)):
		lines.append("完成%d转后开放此成长观察。" % safe_stage)
		return lines
	if safe_stage <= 0:
		lines.append("观察等级：Lv1 -> Lv%d（%d次升级）" % [
			int(instance.get("level", 1)),
			observed_levels,
		])
		if observed_levels <= 0:
			lines.append("升到 Lv2 后开始按实际成长记录评级。")
			return lines
	else:
		lines.append("评价对象：%d转带来的每级转生增量。" % safe_stage)
		if not bool(data.get("hasRecord", true)):
			lines.append("旧记录没有保存该次转生增量，暂时无法拆分评级。")
			return lines
	var averages := data.get("statAverages", {}) as Dictionary
	var percentiles := data.get("statPercentiles", {}) as Dictionary
	var grades := data.get("statGrades", {}) as Dictionary
	for key in STAT_KEYS:
		lines.append("%s成长：%s    %s/级    分位 %.1f%%" % [
			str(STAT_LABELS.get(key, key)),
			str(grades.get(key, "D")),
			_growth_cell_text(averages.get(key, 0.0)),
			float(percentiles.get(key, 0.0)),
		])
	lines.append("战力成长：%s    %.3f/级    分位 %.1f%%" % [
		str(data.get("overallGrade", "D")),
		float(data.get("powerGrowthPerLevel", 0.0)),
		float(data.get("powerPercentile", 0.0)),
	])
	return lines


static func radar_values(instance: Dictionary) -> Dictionary:
	return radar_values_for_stage(instance, 0)


static func radar_values_for_stage(instance: Dictionary, stage: int = 0) -> Dictionary:
	var data := evaluate_pet_for_stage(instance, stage)
	var percentiles = data.get("statPercentiles", {})
	var percentile_dict := percentiles as Dictionary if percentiles is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = clampf(float(percentile_dict.get(key, 0.0)) / 100.0, 0.0, 1.0)
	return result


static func attribute_table_rows(instance: Dictionary, target_level: int = 140) -> Array[Dictionary]:
	return attribute_table_rows_for_stage(instance, 0, target_level)


static func attribute_table_rows_for_stage(instance: Dictionary, stage: int = 0, target_level: int = 140) -> Array[Dictionary]:
	var safe_stage := clampi(stage, 0, 2)
	if _is_server_growth_pet(instance):
		if safe_stage <= 0:
			return _server_observation_attribute_rows(instance, target_level)
		return _rebirth_attribute_table_rows(instance, safe_stage, target_level)
	if safe_stage > 0:
		return _rebirth_attribute_table_rows(instance, safe_stage, target_level)
	var profile_id := str(instance.get("growthSpeciesProfileId", "")).strip_edges()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if profile.is_empty():
		return []
	var roll_dict := _roll_for_instance(instance, profile, profile_id)
	var safe_level := clampi(int(instance.get("level", 1)), 1, 140)
	var safe_target := clampi(target_level, safe_level, 140)
	var level1_stats := _level1_stats_for_instance(instance, profile, roll_dict)
	var current_stats := _stats_for_profile_roll_level(profile, roll_dict, safe_level)
	var target_stats := _stats_for_profile_roll_level(profile, roll_dict, safe_target)
	var data := evaluate_pet_for_stage(instance, 0)
	var averages := data.get("statAverages", {}) as Dictionary
	var percentiles := data.get("statPercentiles", {}) as Dictionary
	var grades := data.get("statGrades", {}) as Dictionary
	var rows: Array[Dictionary] = []
	rows.append({
		"label": "等级",
		"initial": "Lv1",
		"current": "Lv%d" % safe_level,
		"target": "Lv%d" % safe_target,
		"growth": "-",
		"grade": str(data.get("overallGrade", "未观察")),
		"percentile": data.get("powerPercentile", ""),
	})
	for key in STAT_KEYS:
		rows.append({
			"label": str(STAT_LABELS.get(key, key)),
			"initial": int(level1_stats.get(key, instance.get(key, 0))),
			"current": int(current_stats.get(key, 0)),
			"target": int(target_stats.get(key, 0)),
			"growth": _growth_cell_text(averages.get(key, "")),
			"grade": str(grades.get(key, "未观察")),
			"percentile": percentiles.get(key, ""),
		})
	var level1_power := PetPowerModel.combat_power_for_stats(level1_stats)
	var current_power := PetPowerModel.combat_power_for_stats(current_stats)
	var target_power := PetPowerModel.combat_power_for_stats(target_stats)
	rows.append({
		"label": "战力",
		"initial": level1_power,
		"current": current_power,
		"target": target_power,
		"growth": _growth_cell_text(data.get("powerGrowthPerLevel", "")),
		"grade": str(data.get("overallGrade", "未观察")),
		"percentile": data.get("powerPercentile", ""),
	})
	return rows


static func target_column_label(_instance: Dictionary) -> String:
	return "预测140"


static func _server_observation_attribute_rows(instance: Dictionary, target_level: int = 140) -> Array[Dictionary]:
	var level := clampi(int(instance.get("level", 1)), 1, 140)
	var safe_target := clampi(target_level, level, 140)
	var level1 := _strict_public_level_one_stats(instance)
	var current := _strict_current_stats(instance)
	var data := _evaluate_server_observed_growth(instance)
	var averages := data.get("statAverages", {}) as Dictionary
	var percentiles := data.get("statPercentiles", {}) as Dictionary
	var grades := data.get("statGrades", {}) as Dictionary
	var forecast := _observed_stat_forecast(level1, current, level, safe_target)
	var rows: Array[Dictionary] = [{
		"label": "等级",
		"initial": "Lv1",
		"current": "Lv%d" % level,
		"target": "Lv%d" % safe_target,
		"growth": "-",
		"grade": str(data.get("overallGrade", "未观察")),
		"percentile": data.get("powerPercentile", ""),
	}]
	for key in STAT_KEYS:
		rows.append({
			"label": str(STAT_LABELS.get(key, key)),
			"initial": level1.get(key, "资料不足"),
			"current": current.get(key, "资料不足"),
			"target": forecast.get(key, "待观察"),
			"growth": _growth_cell_text(averages.get(key, "")),
			"grade": str(grades.get(key, "未观察")),
			"percentile": percentiles.get(key, ""),
		})
	var forecast_power = PetPowerModel.combat_power_for_stats(forecast) if not forecast.is_empty() else "待观察"
	rows.append({
		"label": "战力",
		"initial": PetPowerModel.combat_power_for_stats(level1) if not level1.is_empty() else "资料不足",
		"current": PetPowerModel.combat_power_for_stats(current) if not current.is_empty() else "资料不足",
		"target": forecast_power,
		"growth": _growth_cell_text(data.get("powerGrowthPerLevel", "")),
		"grade": str(data.get("overallGrade", "未观察")),
		"percentile": data.get("powerPercentile", ""),
	})
	return rows


static func _observed_stat_forecast(level1: Dictionary, current: Dictionary, level: int, target_level: int) -> Dictionary:
	var observed_levels := level - 1
	if observed_levels <= 0 or level1.is_empty() or current.is_empty():
		return {}
	var target_levels := maxi(0, target_level - 1)
	var result := {}
	for key in STAT_KEYS:
		var initial_value := float(level1.get(key, 0))
		var current_value := float(current.get(key, 0))
		var observed_growth := (current_value - initial_value) / float(observed_levels)
		result[key] = maxi(1, int(round(initial_value + observed_growth * float(target_levels))))
	return result


static func _is_server_growth_pet(instance: Dictionary) -> bool:
	var authority = instance.get("growthAuthority", null)
	return authority is Dictionary and str((authority as Dictionary).get("source", "")) == "server"


static func _strict_public_level_one_stats(instance: Dictionary) -> Dictionary:
	for field in ["growthSpeciesLevel1Stats", "initialStats"]:
		var source = instance.get(field, null)
		if source is Dictionary:
			var result := _strict_stat_map(source as Dictionary)
			if not result.is_empty():
				return result
	return {}


static func _strict_current_stats(instance: Dictionary) -> Dictionary:
	return _strict_stat_map(instance)


static func _strict_stat_map(source: Dictionary) -> Dictionary:
	var result := {}
	for key in STAT_KEYS:
		var value = source.get(key, null)
		if not (value is int or value is float) or float(value) < 1.0:
			return {}
		result[key] = int(value)
	return result


static func _rebirth_attribute_table_rows(instance: Dictionary, stage: int, target_level: int = 140) -> Array[Dictionary]:
	var data := evaluate_pet_for_stage(instance, stage)
	var rows: Array[Dictionary] = []
	var safe_level := clampi(int(instance.get("level", 1)), 1, 140)
	var safe_target := clampi(target_level, safe_level, 140)
	rows.append({
		"label": "阶段",
		"initial": "%d转" % (stage - 1),
		"current": "%d转" % stage,
		"target": "Lv%d" % safe_target,
		"growth": "-",
		"grade": str(data.get("overallGrade", "未观察")),
		"percentile": data.get("powerPercentile", ""),
	})
	if not bool(data.get("enabled", false)):
		return rows
	var averages := data.get("statAverages", {}) as Dictionary
	var percentiles := data.get("statPercentiles", {}) as Dictionary
	var grades := data.get("statGrades", {}) as Dictionary
	var observed_levels := maxi(0, safe_level - 1)
	var target_levels := maxi(0, safe_target - 1)
	for key in STAT_KEYS:
		var growth := float(averages.get(key, 0.0))
		rows.append({
			"label": str(STAT_LABELS.get(key, key)),
			"initial": "+0",
			"current": _rebirth_total_cell(growth * float(observed_levels)),
			"target": _rebirth_total_cell(growth * float(target_levels)),
			"growth": _growth_cell_text(growth),
			"grade": str(grades.get(key, "未记录")),
			"percentile": percentiles.get(key, ""),
		})
	var power_growth := float(data.get("powerGrowthPerLevel", 0.0))
	rows.append({
		"label": "战力",
		"initial": "+0",
		"current": _rebirth_total_cell(power_growth * float(observed_levels)),
		"target": _rebirth_total_cell(power_growth * float(target_levels)),
		"growth": _growth_cell_text(power_growth),
		"grade": str(data.get("overallGrade", "未观察")),
		"percentile": data.get("powerPercentile", ""),
	})
	return rows


static func growth_stage_options(instance: Dictionary) -> Array[Dictionary]:
	var rebirth_count := _rebirth_count(instance)
	var options: Array[Dictionary] = []
	for stage in [0, 1, 2]:
		options.append({
			"stage": int(stage),
			"label": str(REBIRTH_STAGE_LABELS.get(stage, "%d转成长" % int(stage))),
			"enabled": int(stage) == 0 or rebirth_count >= int(stage),
		})
	return options


static func write_observation_csv(profile_id: String = DEFAULT_PROFILE_ID, sample_count: int = 100, output_path: String = DEFAULT_CSV_PATH) -> Dictionary:
	BalanceCatalogModel.reload()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if profile.is_empty():
		return {"ok": false, "path": "", "rows": 0, "error": "找不到成长档: %s" % profile_id}
	var rows := PetGrowthSpeciesSimulationModel.build_rows(profile, sample_count, 1, 140)
	var level1_by_sample := {}
	var level140_by_sample := {}
	for row in rows:
		if int(row.get("level", 0)) == 1:
			level1_by_sample[str(row.get("sampleId", ""))] = row
		elif int(row.get("level", 0)) == 140:
			level140_by_sample[str(row.get("sampleId", ""))] = row
	var output_rows: Array[Dictionary] = []
	for row in rows:
		var sample_id := str(row.get("sampleId", ""))
		var level1 := level1_by_sample.get(sample_id, {}) as Dictionary
		var level140 := level140_by_sample.get(sample_id, {}) as Dictionary
		var pseudo_pet := {
			"growthSpeciesProfileId": profile_id,
			"level": int(row.get("level", 1)),
			"growthSpeciesLevel1Stats": {
				"maxHp": int(level1.get("maxHp", row.get("maxHp", 0))),
				"attack": int(level1.get("attack", row.get("attack", 0))),
				"defense": int(level1.get("defense", row.get("defense", 0))),
				"quick": int(level1.get("quick", row.get("quick", 0))),
			},
			"maxHp": int(row.get("maxHp", 0)),
			"attack": int(row.get("attack", 0)),
			"defense": int(row.get("defense", 0)),
			"quick": int(row.get("quick", 0)),
		}
		var observation := evaluate_pet(pseudo_pet)
		var stat_averages := observation.get("statAverages", {}) as Dictionary
		var stat_percentiles := observation.get("statPercentiles", {}) as Dictionary
		var stat_grades := observation.get("statGrades", {}) as Dictionary
		output_rows.append({
				"profileId": profile_id,
				"sampleId": sample_id,
				"sampleNo": int(row.get("sampleNo", 0)),
				"level": int(row.get("level", 1)),
				"lv1MaxHp": int(level1.get("maxHp", row.get("maxHp", 0))),
				"lv1Attack": int(level1.get("attack", row.get("attack", 0))),
				"lv1Defense": int(level1.get("defense", row.get("defense", 0))),
				"lv1Quick": int(level1.get("quick", row.get("quick", 0))),
				"maxHp": int(row.get("maxHp", 0)),
				"attack": int(row.get("attack", 0)),
				"defense": int(row.get("defense", 0)),
				"quick": int(row.get("quick", 0)),
				"combatPower": int(row.get("combatPower", 0)),
				"lv140MaxHp": int(level140.get("maxHp", row.get("maxHp", 0))),
				"lv140Attack": int(level140.get("attack", row.get("attack", 0))),
				"lv140Defense": int(level140.get("defense", row.get("defense", 0))),
				"lv140Quick": int(level140.get("quick", row.get("quick", 0))),
				"lv140CombatPower": int(level140.get("combatPower", row.get("combatPower", 0))),
				"hpGrowthPerLevel": stat_averages.get("maxHp", ""),
				"attackGrowthPerLevel": stat_averages.get("attack", ""),
				"defenseGrowthPerLevel": stat_averages.get("defense", ""),
			"quickGrowthPerLevel": stat_averages.get("quick", ""),
			"hpPercentile": stat_percentiles.get("maxHp", ""),
			"attackPercentile": stat_percentiles.get("attack", ""),
			"defensePercentile": stat_percentiles.get("defense", ""),
			"quickPercentile": stat_percentiles.get("quick", ""),
			"hpGrade": stat_grades.get("maxHp", ""),
			"attackGrade": stat_grades.get("attack", ""),
			"defenseGrade": stat_grades.get("defense", ""),
			"quickGrade": stat_grades.get("quick", ""),
			"powerGrowthPerLevel": observation.get("powerGrowthPerLevel", ""),
			"powerPercentile": observation.get("powerPercentile", ""),
			"overallGrade": observation.get("overallGrade", ""),
		})
	return _write_csv(output_rows, output_path)


static func build_power_growth_percentile_table(profile_id: String = DEFAULT_PROFILE_ID, sample_count: int = DEFAULT_THRESHOLD_SAMPLE_COUNT, level_min: int = 2, level_max: int = 140) -> Dictionary:
	BalanceCatalogModel.reload()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if profile.is_empty():
		return {"ok": false, "error": "找不到成长档: %s" % profile_id}
	var safe_sample_count := maxi(100, sample_count)
	var safe_min := clampi(level_min, 2, 140)
	var safe_max := clampi(level_max, safe_min, 140)
	var values_by_level := {}
	for level in range(safe_min, safe_max + 1):
		values_by_level[str(level)] = []
	for sample_index in range(safe_sample_count):
		var sample_no := sample_index + 1
		var seed := "%s:%03d" % [profile_id, sample_no]
		var roll := PetGrowthSpeciesSimulationModel.roll_individual_for_seed(profile, seed)
		var level1_stats := _stats_for_profile_roll_level(profile, roll, 1)
		var level1_power := PetPowerModel.combat_power_for_stats(level1_stats)
		for level in range(safe_min, safe_max + 1):
			var stats := _stats_for_profile_roll_level(profile, roll, level)
			var power := PetPowerModel.combat_power_for_stats(stats)
			var power_growth := (float(power) - float(level1_power)) / float(level - 1)
			(values_by_level[str(level)] as Array).append(power_growth)
	var thresholds_by_level := {}
	for level in range(safe_min, safe_max + 1):
		var values := values_by_level[str(level)] as Array
		values.sort()
		thresholds_by_level[str(level)] = {
			"min": snappedf(_percentile_value(values, 0.0), 0.001),
			"p25": snappedf(_percentile_value(values, 25.0), 0.001),
			"p55": snappedf(_percentile_value(values, 55.0), 0.001),
			"p85": snappedf(_percentile_value(values, 85.0), 0.001),
			"p95": snappedf(_percentile_value(values, 95.0), 0.001),
			"max": snappedf(_percentile_value(values, 100.0), 0.001),
		}
	return {
		"ok": true,
		"schemaVersion": 1,
		"profileId": profile_id,
		"displayName": str(profile.get("displayName", profile_id)),
		"sampleCount": safe_sample_count,
		"levelMin": safe_min,
		"levelMax": safe_max,
		"thresholdMetric": "powerGrowthPerLevel",
		"gradeThresholds": {
			"S": 95,
			"A": 85,
			"B": 55,
			"C": 25,
			"D": 0,
		},
		"powerGrowthPercentilesByLevel": thresholds_by_level,
		"error": "",
	}


static func write_power_growth_percentile_table(profile_id: String = DEFAULT_PROFILE_ID, sample_count: int = DEFAULT_THRESHOLD_SAMPLE_COUNT, output_path: String = DEFAULT_THRESHOLD_PATH) -> Dictionary:
	var table := build_power_growth_percentile_table(profile_id, sample_count)
	if not bool(table.get("ok", false)):
		return {"ok": false, "path": "", "table": table, "error": str(table.get("error", "生成失败"))}
	var write_result := _write_json(table, output_path)
	return {
		"ok": bool(write_result.get("ok", false)),
		"path": str(write_result.get("path", "")),
		"table": table,
		"error": str(write_result.get("error", "")),
	}


static func _stats_for_profile_roll_level(profile: Dictionary, roll: Dictionary, level: int, cultivation_bonus: Dictionary = {}) -> Dictionary:
	var row := PetGrowthSpeciesSimulationModel.row_for_roll_level(profile, roll, 0, level)
	var observed_levels := maxi(0, level - 1)
	var bonus := _growth_bonus_dict(cultivation_bonus)
	return {
		"maxHp": int(round(float(row.get("maxHp", 1)) + float(bonus.get("maxHp", 0.0)) * float(observed_levels))),
		"attack": int(round(float(row.get("attack", 1)) + float(bonus.get("attack", 0.0)) * float(observed_levels))),
		"defense": int(round(float(row.get("defense", 1)) + float(bonus.get("defense", 0.0)) * float(observed_levels))),
		"quick": int(round(float(row.get("quick", 1)) + float(bonus.get("quick", 0.0)) * float(observed_levels))),
	}


static func _growth_record_from_roll(roll: Dictionary, cultivation_bonus: Dictionary = {}) -> Dictionary:
	var growth = roll.get("growthBonus", {})
	var growth_dict := growth as Dictionary if growth is Dictionary else {}
	return {
		"base": "species_profile",
		"bonus": growth_dict.duplicate(true),
		"rebirthBonus": _growth_bonus_dict(cultivation_bonus),
	}


static func _cultivation_growth_bonus(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	return _growth_bonus_dict(source.get("rebirthGrowthBonus", {}))


static func _growth_bonus_dict(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = snappedf(float(source.get(key, 0.0)), 0.001)
	return result


static func _roll_for_instance(instance: Dictionary, profile: Dictionary, profile_id: String) -> Dictionary:
	var roll = instance.get("growthSpeciesRoll", {})
	var roll_dict := roll as Dictionary if roll is Dictionary else {}
	if not roll_dict.is_empty() and roll_dict.has("growthBonus"):
		return roll_dict
	var seed := str(instance.get("growthSpeciesSeed", instance.get("instanceId", profile_id))).strip_edges()
	if seed == "":
		seed = profile_id
	return PetGrowthSpeciesSimulationModel.roll_individual_for_seed(profile, seed)


static func _level1_stats_for_instance(instance: Dictionary, profile: Dictionary, roll: Dictionary) -> Dictionary:
	var level1 = instance.get("growthSpeciesLevel1Stats", instance.get("initialStats", {}))
	var level1_stats := level1 as Dictionary if level1 is Dictionary else {}
	if not level1_stats.is_empty():
		return _stats_dict(level1_stats)
	return _stats_for_profile_roll_level(profile, roll, 1)


static func _stats_dict(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = int(source.get(key, 0))
	return result


static func _rebirth_count(instance: Dictionary) -> int:
	var record = instance.get("petCultivation", {})
	var record_dict := record as Dictionary if record is Dictionary else {}
	return maxi(0, int(record_dict.get("rebirthCount", 0)))


static func _rebirth_stage_bonus(instance: Dictionary, stage: int) -> Dictionary:
	var safe_stage := clampi(stage, 1, 2)
	var record = instance.get("petCultivation", {})
	var record_dict := record as Dictionary if record is Dictionary else {}
	var history: Array = record_dict.get("history", []) if record_dict.get("history", []) is Array else []
	for index in range(history.size() - 1, -1, -1):
		var entry = history[index]
		if not (entry is Dictionary):
			continue
		var entry_dict := entry as Dictionary
		var after_stage := int(entry_dict.get("afterRebirthCount", entry_dict.get("helperStage", 0)))
		if str(entry_dict.get("mode", "")) == "rebirth" and after_stage == safe_stage:
			return _growth_bonus_dict(entry_dict.get("visibleGrowthBonus", {}))
	var last_result = record_dict.get("lastResult", {})
	if last_result is Dictionary:
		var result_dict := last_result as Dictionary
		var result_stage := int(result_dict.get("afterRebirthCount", result_dict.get("helperStage", 0)))
		if str(result_dict.get("mode", "")) == "rebirth" and result_stage == safe_stage:
			return _growth_bonus_dict(result_dict.get("visibleGrowthBonus", {}))
	if safe_stage == 1 and int(record_dict.get("rebirthCount", 0)) == 1:
		return _growth_bonus_dict(record_dict.get("rebirthGrowthBonus", {}))
	return _growth_bonus_dict({})


static func _bonus_is_zero(bonus: Dictionary) -> bool:
	for key in STAT_KEYS:
		if absf(float(bonus.get(key, 0.0))) > 0.0001:
			return false
	return true


static func _rebirth_internal_value(stat_key: String, visible_growth: float) -> float:
	return visible_growth / REBIRTH_HP_INTERNAL_SCALE if stat_key == "maxHp" else visible_growth


static func _rebirth_power_growth(bonus: Dictionary) -> float:
	var total := 0.0
	for key in STAT_KEYS:
		total += _rebirth_internal_value(key, float(bonus.get(key, 0.0)))
	return snappedf(total, 0.001)


static func _rebirth_power_percentile(stage: int, power_growth: float) -> float:
	var thresholds := REBIRTH_POWER_THRESHOLDS.get(clampi(stage, 1, 2), REBIRTH_POWER_THRESHOLDS[1]) as Dictionary
	return _percentile_from_thresholds(power_growth, thresholds)


static func _rebirth_stat_percentile(stage: int, internal_growth: float) -> float:
	var thresholds := REBIRTH_STAT_INTERNAL_THRESHOLDS.get(clampi(stage, 1, 2), REBIRTH_STAT_INTERNAL_THRESHOLDS[1]) as Dictionary
	return _percentile_from_thresholds(internal_growth, thresholds)


static func _rebirth_total_cell(value: float) -> String:
	var snapped := snappedf(value, 0.1)
	if absf(snapped - round(snapped)) <= 0.001:
		return "+%d" % int(round(snapped))
	return "+%.1f" % snapped


static func _growth_percentile_for_stat(profile: Dictionary, stat_key: String, observed_growth: float) -> float:
	var output_growth := profile.get("outputGrowth", {}) as Dictionary
	var rules := profile.get("individualRules", {}) as Dictionary
	var spread := rules.get("growthOutputSpread", {}) as Dictionary
	var range_value := _range_for_key(spread, stat_key, 0.0, 0.0)
	var min_growth := float(output_growth.get(stat_key, 0.0)) + float(range_value.get("min", 0.0))
	var max_growth := float(output_growth.get(stat_key, 0.0)) + float(range_value.get("max", 0.0))
	return _percentile_from_range(observed_growth, min_growth, max_growth)


static func _growth_cell_text(value) -> String:
	if value is int or value is float:
		return "%.3f" % float(value)
	var text := str(value)
	return text if text != "" else "-"


static func _power_growth_percentile(profile: Dictionary, observed_power_growth: float, level: int) -> float:
	var precomputed := _precomputed_power_growth_percentile(profile, observed_power_growth, level)
	if precomputed >= 0.0:
		return precomputed
	var weights := BalanceCatalogModel.pet_power_weights()
	var min_power := 0.0
	var max_power := 0.0
	var output_growth := profile.get("outputGrowth", {}) as Dictionary
	var rules := profile.get("individualRules", {}) as Dictionary
	var spread := rules.get("growthOutputSpread", {}) as Dictionary
	for key in STAT_KEYS:
		var range_value := _range_for_key(spread, key, 0.0, 0.0)
		var base_growth := float(output_growth.get(key, 0.0))
		var weight := float(weights.get(key, 1.0))
		min_power += (base_growth + float(range_value.get("min", 0.0))) * weight
		max_power += (base_growth + float(range_value.get("max", 0.0))) * weight
	return _percentile_from_range(observed_power_growth, min_power, max_power)


static func _precomputed_power_growth_percentile(profile: Dictionary, observed_power_growth: float, level: int) -> float:
	var observation := profile.get("growthObservation", {}) as Dictionary
	if observation.is_empty():
		return -1.0
	var by_level := observation.get("powerGrowthPercentilesByLevel", {}) as Dictionary
	if by_level.is_empty():
		return -1.0
	var thresholds = by_level.get(str(level), {})
	if not (thresholds is Dictionary):
		return -1.0
	return _percentile_from_thresholds(observed_power_growth, thresholds as Dictionary)


static func _percentile_from_thresholds(value: float, thresholds: Dictionary) -> float:
	var percentiles: Array[float] = [0.0, 25.0, 55.0, 85.0, 95.0, 100.0]
	var values: Array[float] = [
		float(thresholds.get("min", 0.0)),
		float(thresholds.get("p25", 0.0)),
		float(thresholds.get("p55", 0.0)),
		float(thresholds.get("p85", 0.0)),
		float(thresholds.get("p95", 0.0)),
		float(thresholds.get("max", 0.0)),
	]
	if value <= values[0]:
		return 0.0
	if value >= values[values.size() - 1]:
		return 100.0
	for index in range(values.size() - 1):
		var left := values[index]
		var right := values[index + 1]
		if value <= right:
			if absf(right - left) <= 0.0001:
				return percentiles[index + 1]
			var unit := clampf((value - left) / (right - left), 0.0, 1.0)
			return percentiles[index] + unit * (percentiles[index + 1] - percentiles[index])
	return 100.0


static func _percentile_value(sorted_values: Array, percentile: float) -> float:
	if sorted_values.is_empty():
		return 0.0
	if sorted_values.size() == 1:
		return float(sorted_values[0])
	var target := clampf(percentile, 0.0, 100.0) / 100.0 * float(sorted_values.size() - 1)
	var lower := int(floor(target))
	var upper := int(ceil(target))
	var lower_value := float(sorted_values[lower])
	var upper_value := float(sorted_values[upper])
	if lower == upper:
		return lower_value
	return lower_value + (upper_value - lower_value) * (target - float(lower))


static func _percentile_from_range(value: float, min_value: float, max_value: float) -> float:
	if absf(max_value - min_value) <= 0.0001:
		return 50.0
	return clampf((value - min_value) / (max_value - min_value) * 100.0, 0.0, 100.0)


static func _grade_for_percentile(percentile: float) -> String:
	if percentile >= 95.0:
		return "S"
	if percentile >= 85.0:
		return "A"
	if percentile >= 55.0:
		return "B"
	if percentile >= 25.0:
		return "C"
	return "D"


static func _range_for_key(ranges: Dictionary, key: String, fallback_min: float, fallback_max: float) -> Dictionary:
	var value = ranges.get(key, [])
	if value is Array:
		var array_value := value as Array
		if array_value.size() >= 2:
			return {"min": float(array_value[0]), "max": float(array_value[1])}
	return {"min": fallback_min, "max": fallback_max}


static func _write_csv(rows: Array[Dictionary], output_path: String) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(output_path).simplify_path()
	var dir_path := absolute_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir_error := DirAccess.make_dir_recursive_absolute(dir_path)
		if dir_error != OK:
			return {"ok": false, "path": absolute_path, "rows": 0, "error": "无法创建目录: %d" % dir_error}
	var file := FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "path": absolute_path, "rows": 0, "error": "无法写入 CSV"}
	var headers := [
		"profileId", "sampleId", "sampleNo", "level",
		"lv1MaxHp", "lv1Attack", "lv1Defense", "lv1Quick",
		"maxHp", "attack", "defense", "quick", "combatPower",
		"lv140MaxHp", "lv140Attack", "lv140Defense", "lv140Quick", "lv140CombatPower",
		"hpGrowthPerLevel", "attackGrowthPerLevel", "defenseGrowthPerLevel", "quickGrowthPerLevel",
		"hpPercentile", "attackPercentile", "defensePercentile", "quickPercentile",
		"hpGrade", "attackGrade", "defenseGrade", "quickGrade",
		"powerGrowthPerLevel", "powerPercentile", "overallGrade",
	]
	file.store_line(",".join(headers))
	for row in rows:
		var values: Array[String] = []
		for header in headers:
			values.append(_csv_cell(row.get(header, "")))
		file.store_line(",".join(values))
	file.close()
	return {"ok": true, "path": absolute_path, "rows": rows.size(), "error": ""}


static func _write_json(value: Dictionary, output_path: String) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(output_path).simplify_path()
	var dir_path := absolute_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir_error := DirAccess.make_dir_recursive_absolute(dir_path)
		if dir_error != OK:
			return {"ok": false, "path": absolute_path, "error": "无法创建目录: %d" % dir_error}
	var file := FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "path": absolute_path, "error": "无法写入 JSON"}
	file.store_string(JSON.stringify(value, "\t", false))
	file.close()
	return {"ok": true, "path": absolute_path, "error": ""}


static func _csv_cell(value) -> String:
	var text := str(value)
	if text.contains("\""):
		text = text.replace("\"", "\"\"")
	if text.contains(",") or text.contains("\n") or text.contains("\""):
		return "\"%s\"" % text
	return text
