extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")
const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")
const PetGrowthSpeciesSimulationModel := preload("res://scripts/progression/pet_growth_species_simulation_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetRebirthMmModel := preload("res://scripts/progression/pet_rebirth_mm_model.gd")

const DEFAULT_SAMPLE_COUNT := 100
const DEFAULT_TARGET_LEVEL := 140
const OUTPUT_DIR := "res://../../.run/godot"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}
const STONE_PLAN_FULL4 := "full4"
const STONE_PLAN_THREE_NO_HP := "three_no_hp"
const STONE_PLAN_ATTACK_DEFENSE := "attack_defense"
const STONE_PLAN_ATTACK_ONLY := "attack_only"
const STONE_PLAN_DEFENSE_ONLY := "defense_only"
const STONE_PLAN_QUICK_ONLY := "quick_only"
const STONE_PLAN_HP_ONLY := "hp_only"
const STONE_PLAN_EMPTY := "empty"


static func pet_growth_profile_options() -> Array[Dictionary]:
	BalanceCatalogModel.reload()
	var result: Array[Dictionary] = []
	for profile in BalanceCatalogModel.pet_growth_species_profile_list():
		var profile_id := str(profile.get("profileId", "")).strip_edges()
		var form_id := str(profile.get("formId", "")).strip_edges()
		if profile_id == "" or form_id == "":
			continue
		result.append({
			"id": profile_id,
			"label": str(profile.get("formName", profile.get("displayName", profile_id))),
			"displayName": str(profile.get("displayName", profile_id)),
			"formId": form_id,
		})
	return result


static func stone_plan_options() -> Array[Dictionary]:
	return [
		{"id": STONE_PLAN_FULL4, "label": "四满石", "points": {"maxHp": 50, "attack": 50, "defense": 50, "quick": 50}},
		{"id": STONE_PLAN_THREE_NO_HP, "label": "三石：攻防敏", "points": {"maxHp": 0, "attack": 50, "defense": 50, "quick": 50}},
		{"id": STONE_PLAN_ATTACK_DEFENSE, "label": "双石：攻防", "points": {"maxHp": 0, "attack": 50, "defense": 50, "quick": 0}},
		{"id": STONE_PLAN_ATTACK_ONLY, "label": "单攻石", "points": {"maxHp": 0, "attack": 50, "defense": 0, "quick": 0}},
		{"id": STONE_PLAN_DEFENSE_ONLY, "label": "单防石", "points": {"maxHp": 0, "attack": 0, "defense": 50, "quick": 0}},
		{"id": STONE_PLAN_QUICK_ONLY, "label": "单敏石", "points": {"maxHp": 0, "attack": 0, "defense": 0, "quick": 50}},
		{"id": STONE_PLAN_HP_ONLY, "label": "单血石", "points": {"maxHp": 50, "attack": 0, "defense": 0, "quick": 0}},
		{"id": STONE_PLAN_EMPTY, "label": "空石", "points": {"maxHp": 0, "attack": 0, "defense": 0, "quick": 0}},
	]


static func build_pet_growth_report(profile_id: String, sample_count: int = DEFAULT_SAMPLE_COUNT, target_level: int = DEFAULT_TARGET_LEVEL, write_csv_file: bool = true) -> Dictionary:
	BalanceCatalogModel.reload()
	var profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if profile.is_empty():
		return _error_report("宠物成长模拟", "找不到成长档：%s" % profile_id)
	var safe_samples := clampi(sample_count, 1, 1000)
	var safe_level := clampi(target_level, 1, 140)
	var rows := PetGrowthSpeciesSimulationModel.build_rows(profile, safe_samples, 1, safe_level)
	var sample_summaries := _growth_sample_summaries(rows, profile, safe_level)
	var summary := {
		"profileId": profile_id,
		"displayName": str(profile.get("displayName", profile_id)),
		"sampleCount": safe_samples,
		"targetLevel": safe_level,
		"rowCount": rows.size(),
		"qualityCounts": _counts_for_key(sample_summaries, "qualityTier"),
		"overallGradeCounts": _counts_for_key(sample_summaries, "overallGrade"),
		"targetPower": _number_summary(sample_summaries, "targetPower"),
		"powerGrowthPerLevel": _number_summary(sample_summaries, "powerGrowthPerLevel"),
		"hpGrowthPerLevel": _number_summary(sample_summaries, "hpGrowthPerLevel"),
		"threeStatGrowthPerLevel": _number_summary(sample_summaries, "threeStatGrowthPerLevel"),
	}
	var csv_path := ""
	var csv_error := ""
	if write_csv_file:
		var write_result := _write_csv(
			sample_summaries,
			"%s/numeric_workbench_pet_growth_%s_%d_lv%d.csv" % [OUTPUT_DIR, profile_id, safe_samples, safe_level],
			[
				"profileId", "sampleNo", "sampleId", "qualityTier", "qualityPercentile", "overallGrade", "powerPercentile",
				"level1MaxHp", "level1Attack", "level1Defense", "level1Quick", "level1Power",
				"targetLevel", "targetMaxHp", "targetAttack", "targetDefense", "targetQuick", "targetPower",
				"hpGrowthPerLevel", "attackGrowthPerLevel", "defenseGrowthPerLevel", "quickGrowthPerLevel",
				"threeStatGrowthPerLevel", "powerGrowthPerLevel",
			]
		)
		csv_path = str(write_result.get("path", ""))
		csv_error = str(write_result.get("error", ""))
	var lines: Array[String] = []
	lines.append("宠物成长模拟：%s，%d只，Lv1 -> Lv%d" % [str(profile.get("displayName", profile_id)), safe_samples, safe_level])
	lines.append("样本行：%d    CSV：%s" % [sample_summaries.size(), csv_path if csv_path != "" else "未导出"])
	lines.append("品质分布：%s" % _counts_text(summary.get("qualityCounts", {})))
	lines.append("成长评价：%s" % _counts_text(summary.get("overallGradeCounts", {})))
	lines.append("Lv%d战力：%s" % [safe_level, _range_text(summary.get("targetPower", {}), 1)])
	lines.append("战力成长/级：%s" % _range_text(summary.get("powerGrowthPerLevel", {}), 3))
	lines.append("血成长/级：%s" % _range_text(summary.get("hpGrowthPerLevel", {}), 3))
	lines.append("三维成长/级：%s" % _range_text(summary.get("threeStatGrowthPerLevel", {}), 3))
	if csv_error != "":
		lines.append("CSV错误：%s" % csv_error)
	return {
		"ok": csv_error == "",
		"mode": "pet_growth",
		"title": "宠物成长模拟",
		"lines": lines,
		"summary": summary,
		"rows": sample_summaries,
		"csvPath": csv_path,
		"error": csv_error,
	}


static func build_mm_rebirth_report(profile_id: String, sample_count: int = DEFAULT_SAMPLE_COUNT, stage: int = PetRebirthMmModel.STAGE_ONE, stone_plan_id: String = STONE_PLAN_FULL4, write_csv_file: bool = true) -> Dictionary:
	BalanceCatalogModel.reload()
	var target_profile := BalanceCatalogModel.pet_growth_species_profile(profile_id)
	if target_profile.is_empty():
		return _error_report("MM转宠模拟", "找不到目标成长档：%s" % profile_id)
	var safe_stage := clampi(stage, PetRebirthMmModel.STAGE_ONE, PetRebirthMmModel.STAGE_TWO)
	var helper_profile_id := "pet_rebirth_mm_stage%d_v1" % safe_stage
	var helper_profile := BalanceCatalogModel.pet_growth_species_profile(helper_profile_id)
	if helper_profile.is_empty():
		return _error_report("MM转宠模拟", "找不到MM成长档：%s" % helper_profile_id)
	var stone_plan := _stone_plan(stone_plan_id)
	if stone_plan.is_empty():
		return _error_report("MM转宠模拟", "找不到喂石方案：%s" % stone_plan_id)
	var safe_samples := clampi(sample_count, 1, 1000)
	var rows: Array[Dictionary] = []
	for index in range(safe_samples):
		var sample_no := index + 1
		rows.append(_mm_rebirth_sample_row(target_profile, helper_profile, safe_stage, stone_plan, sample_no))
	var summary := {
		"profileId": profile_id,
		"displayName": str(target_profile.get("displayName", profile_id)),
		"helperProfileId": helper_profile_id,
		"sampleCount": safe_samples,
		"stage": safe_stage,
		"stonePlanId": str(stone_plan.get("id", "")),
		"stonePlanLabel": str(stone_plan.get("label", "")),
		"gradeCounts": _counts_for_key(rows, "rebirthGrade"),
		"internalPowerBonus": _number_summary(rows, "rebirthInternalPowerBonus"),
		"hpGrowthBonus": _number_summary(rows, "hpGrowthBonus"),
		"attackGrowthBonus": _number_summary(rows, "attackGrowthBonus"),
		"defenseGrowthBonus": _number_summary(rows, "defenseGrowthBonus"),
		"quickGrowthBonus": _number_summary(rows, "quickGrowthBonus"),
		"afterTargetPower": _number_summary(rows, "afterTargetPower"),
		"afterPowerGrowthPerLevel": _number_summary(rows, "afterPowerGrowthPerLevel"),
	}
	var csv_path := ""
	var csv_error := ""
	if write_csv_file:
		var write_result := _write_csv(
			rows,
			"%s/numeric_workbench_mm_rebirth_%s_stage%d_%s_%d.csv" % [OUTPUT_DIR, profile_id, safe_stage, str(stone_plan.get("id", "")), safe_samples],
			[
				"profileId", "sampleNo", "stage", "stonePlanId", "stonePlanLabel", "effectiveStoneCount",
				"rebirthGrade", "rebirthPercentile", "rebirthInternalPowerBonus",
				"targetLv1MaxHp", "targetLv1Attack", "targetLv1Defense", "targetLv1Quick", "targetLv1Power",
				"targetLv140MaxHp", "targetLv140Attack", "targetLv140Defense", "targetLv140Quick", "targetLv140Power",
				"helperLv79MaxHp", "helperLv79Attack", "helperLv79Defense", "helperLv79Quick",
				"helperHpWeight", "helperAttackWeight", "helperDefenseWeight", "helperQuickWeight",
				"hpGrowthBonus", "attackGrowthBonus", "defenseGrowthBonus", "quickGrowthBonus",
				"afterLv1MaxHp", "afterLv1Attack", "afterLv1Defense", "afterLv1Quick", "afterLv1Power",
				"afterLv140MaxHp", "afterLv140Attack", "afterLv140Defense", "afterLv140Quick", "afterTargetPower",
				"afterHpGrowthPerLevel", "afterAttackGrowthPerLevel", "afterDefenseGrowthPerLevel", "afterQuickGrowthPerLevel", "afterPowerGrowthPerLevel",
			]
		)
		csv_path = str(write_result.get("path", ""))
		csv_error = str(write_result.get("error", ""))
	var lines: Array[String] = []
	lines.append("MM转宠模拟：%s，%s，%s，%d组" % [
		str(target_profile.get("displayName", profile_id)),
		PetRebirthMmModel.helper_name_for_stage(safe_stage),
		str(stone_plan.get("label", "")),
		safe_samples,
	])
	lines.append("CSV：%s" % (csv_path if csv_path != "" else "未导出"))
	lines.append("转生随机档：%s" % _counts_text(summary.get("gradeCounts", {})))
	lines.append("四维等效加成/级：%s" % _range_text(summary.get("internalPowerBonus", {}), 3))
	lines.append("血加成/级：%s" % _range_text(summary.get("hpGrowthBonus", {}), 3))
	lines.append("攻加成/级：%s" % _range_text(summary.get("attackGrowthBonus", {}), 3))
	lines.append("防加成/级：%s" % _range_text(summary.get("defenseGrowthBonus", {}), 3))
	lines.append("敏加成/级：%s" % _range_text(summary.get("quickGrowthBonus", {}), 3))
	lines.append("转后Lv140战力：%s" % _range_text(summary.get("afterTargetPower", {}), 1))
	lines.append("转后战力成长/级：%s" % _range_text(summary.get("afterPowerGrowthPerLevel", {}), 3))
	if csv_error != "":
		lines.append("CSV错误：%s" % csv_error)
	return {
		"ok": csv_error == "",
		"mode": "mm_rebirth",
		"title": "MM转宠模拟",
		"lines": lines,
		"summary": summary,
		"rows": rows,
		"csvPath": csv_path,
		"error": csv_error,
	}


static func build_battle_report(write_json_file: bool = true) -> Dictionary:
	var report := NumericBattleSimulatorModel.build_report()
	var errors := NumericBattleSimulatorModel.validation_errors(report)
	var output_path := ""
	var output_error := ""
	if write_json_file:
		var write_result := NumericBattleSimulatorModel.write_report(
			report,
			"%s/numeric_workbench_battle_simulation_report.json" % OUTPUT_DIR
		)
		output_path = str(write_result.get("path", ""))
		output_error = str(write_result.get("error", ""))
		if output_error != "":
			errors.append(output_error)
	var summary := report.get("summary", {}) as Dictionary
	var lines: Array[String] = []
	lines.append("固定战斗模拟：%d个场景" % int(summary.get("scenarioCount", 0)))
	lines.append("JSON：%s" % (output_path if output_path != "" else "未导出"))
	lines.append("胜利：%d    预期通过：%d    失败：%d    超时：%d" % [
		int(summary.get("victoryCount", 0)),
		int(summary.get("expectationOk", 0)),
		int(summary.get("failureCount", 0)),
		int(summary.get("timeoutCount", 0)),
	])
	lines.append("平均回合：%.2f    平均人物剩余血：%.1f%%" % [
		float(summary.get("avgRounds", 0.0)),
		float(summary.get("avgPlayerHpRatio", 0.0)) * 100.0,
	])
	lines.append("最难场景：%s" % str(summary.get("hardestScenarioId", "")))
	if not errors.is_empty():
		lines.append("问题：%s" % "；".join(errors))
	return {
		"ok": errors.is_empty(),
		"mode": "battle",
		"title": "固定战斗模拟",
		"lines": lines,
		"summary": summary,
		"report": report,
		"jsonPath": output_path,
		"errors": errors,
		"error": "；".join(errors),
	}


static func _mm_rebirth_sample_row(target_profile: Dictionary, helper_profile: Dictionary, stage: int, stone_plan: Dictionary, sample_no: int) -> Dictionary:
	var profile_id := str(target_profile.get("profileId", ""))
	var target_seed := "numeric_workbench:%s:%03d:target" % [profile_id, sample_no]
	var helper_seed := "numeric_workbench:%s:%03d:mm%d" % [profile_id, sample_no, stage]
	var target_pet := PetGrowthObservationModel.create_pet_instance(
		profile_id,
		"numeric_target_%03d" % sample_no,
		str(target_profile.get("formId", "")),
		str(target_profile.get("formName", target_profile.get("displayName", "宠物"))),
		"standby",
		140,
		target_seed,
		sample_no
	)
	target_pet["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": maxi(0, stage - 1),
		"rebirthGrowthBonus": _growth_bonus_dict({}),
		"history": [],
	}
	target_pet = PetGrowthObservationModel.normalize_pet_instance(target_pet)
	var helper_profile_id := str(helper_profile.get("profileId", ""))
	var helper_pet := PetGrowthObservationModel.create_pet_instance(
		helper_profile_id,
		"numeric_mm_%03d" % sample_no,
		PetRebirthMmModel.helper_form_id_for_stage(stage),
		PetRebirthMmModel.helper_name_for_stage(stage),
		"standby",
		PetRebirthMmModel.HELPER_REQUIRED_LEVEL,
		helper_seed,
		sample_no
	)
	helper_pet["petRebirthHelper"] = {
		"schemaVersion": 1,
		"stage": stage,
		"stoneCapacity": PetRebirthMmModel.STONE_CAPACITY,
		"stonePoints": (stone_plan.get("points", {}) as Dictionary).duplicate(true),
	}
	helper_pet = PetGrowthObservationModel.normalize_pet_instance(helper_pet)
	var preview := PetRebirthMmModel.rebirth_bonus_preview(
		target_pet,
		helper_pet,
		"numeric_workbench:%s:%03d:%s:stage%d" % [profile_id, sample_no, str(stone_plan.get("id", "")), stage]
	)
	var bonus := preview.get("visibleGrowthBonus", {}) as Dictionary
	var after_pet := target_pet.duplicate(true)
	after_pet["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": stage,
		"rebirthGrowthBonus": bonus.duplicate(true),
		"history": [],
	}
	after_pet["level"] = 1
	after_pet = PetGrowthObservationModel.normalize_pet_instance(after_pet)
	var after_lv1 := _pet_stats(after_pet)
	after_pet["level"] = 140
	after_pet = PetGrowthObservationModel.normalize_pet_instance(after_pet)
	var target_lv1 := target_pet.get("initialStats", {}) as Dictionary
	var target_lv140 := _pet_stats(target_pet)
	var helper_lv79 := _pet_stats(helper_pet)
	var after_lv140 := _pet_stats(after_pet)
	var helper_weights := preview.get("helperGrowthWeights", {}) as Dictionary
	var target_lv1_power := PetPowerModel.combat_power_for_stats(target_lv1)
	var target_lv140_power := PetPowerModel.combat_power_for_stats(target_lv140)
	var after_lv1_power := PetPowerModel.combat_power_for_stats(after_lv1)
	var after_lv140_power := PetPowerModel.combat_power_for_stats(after_lv140)
	var observed_levels := 139.0
	return {
		"profileId": profile_id,
		"sampleNo": sample_no,
		"stage": stage,
		"stonePlanId": str(stone_plan.get("id", "")),
		"stonePlanLabel": str(stone_plan.get("label", "")),
		"effectiveStoneCount": PetRebirthMmModel.effective_stone_count(helper_pet.get("petRebirthHelper", {})),
		"rebirthGrade": str(preview.get("rebirthBonusGrade", "D")),
		"rebirthPercentile": float(preview.get("rebirthBonusPercentile", 0.0)),
		"rebirthInternalPowerBonus": float(preview.get("rebirthBonusInternalPower", 0.0)),
		"targetLv1MaxHp": int(target_lv1.get("maxHp", 0)),
		"targetLv1Attack": int(target_lv1.get("attack", 0)),
		"targetLv1Defense": int(target_lv1.get("defense", 0)),
		"targetLv1Quick": int(target_lv1.get("quick", 0)),
		"targetLv1Power": target_lv1_power,
		"targetLv140MaxHp": int(target_lv140.get("maxHp", 0)),
		"targetLv140Attack": int(target_lv140.get("attack", 0)),
		"targetLv140Defense": int(target_lv140.get("defense", 0)),
		"targetLv140Quick": int(target_lv140.get("quick", 0)),
		"targetLv140Power": target_lv140_power,
		"helperLv79MaxHp": int(helper_lv79.get("maxHp", 0)),
		"helperLv79Attack": int(helper_lv79.get("attack", 0)),
		"helperLv79Defense": int(helper_lv79.get("defense", 0)),
		"helperLv79Quick": int(helper_lv79.get("quick", 0)),
		"helperHpWeight": float(helper_weights.get("maxHp", 0.0)),
		"helperAttackWeight": float(helper_weights.get("attack", 0.0)),
		"helperDefenseWeight": float(helper_weights.get("defense", 0.0)),
		"helperQuickWeight": float(helper_weights.get("quick", 0.0)),
		"hpGrowthBonus": float(bonus.get("maxHp", 0.0)),
		"attackGrowthBonus": float(bonus.get("attack", 0.0)),
		"defenseGrowthBonus": float(bonus.get("defense", 0.0)),
		"quickGrowthBonus": float(bonus.get("quick", 0.0)),
		"afterLv1MaxHp": int(after_lv1.get("maxHp", 0)),
		"afterLv1Attack": int(after_lv1.get("attack", 0)),
		"afterLv1Defense": int(after_lv1.get("defense", 0)),
		"afterLv1Quick": int(after_lv1.get("quick", 0)),
		"afterLv1Power": after_lv1_power,
		"afterLv140MaxHp": int(after_lv140.get("maxHp", 0)),
		"afterLv140Attack": int(after_lv140.get("attack", 0)),
		"afterLv140Defense": int(after_lv140.get("defense", 0)),
		"afterLv140Quick": int(after_lv140.get("quick", 0)),
		"afterTargetPower": after_lv140_power,
		"afterHpGrowthPerLevel": snappedf((float(after_lv140.get("maxHp", 0)) - float(after_lv1.get("maxHp", 0))) / observed_levels, 0.001),
		"afterAttackGrowthPerLevel": snappedf((float(after_lv140.get("attack", 0)) - float(after_lv1.get("attack", 0))) / observed_levels, 0.001),
		"afterDefenseGrowthPerLevel": snappedf((float(after_lv140.get("defense", 0)) - float(after_lv1.get("defense", 0))) / observed_levels, 0.001),
		"afterQuickGrowthPerLevel": snappedf((float(after_lv140.get("quick", 0)) - float(after_lv1.get("quick", 0))) / observed_levels, 0.001),
		"afterPowerGrowthPerLevel": snappedf((float(after_lv140_power) - float(after_lv1_power)) / observed_levels, 0.001),
	}


static func _growth_sample_summaries(rows: Array[Dictionary], profile: Dictionary, target_level: int) -> Array[Dictionary]:
	var by_sample := {}
	for row in rows:
		var sample_no := int(row.get("sampleNo", 0))
		if sample_no <= 0:
			continue
		if not by_sample.has(sample_no):
			by_sample[sample_no] = {}
		var sample := by_sample[sample_no] as Dictionary
		if int(row.get("level", 0)) == 1:
			sample["level1"] = row
		if int(row.get("level", 0)) == target_level:
			sample["target"] = row
	var result: Array[Dictionary] = []
	for sample_no in by_sample.keys():
		var sample := by_sample[sample_no] as Dictionary
		var level1 := sample.get("level1", {}) as Dictionary
		var target := sample.get("target", {}) as Dictionary
		if level1.is_empty() or target.is_empty():
			continue
		var levels := maxi(1, target_level - 1)
		var level1_power := int(level1.get("combatPower", 0))
		var target_power := int(target.get("combatPower", 0))
		var power_growth := snappedf((float(target_power) - float(level1_power)) / float(levels), 0.001)
		var observation := _growth_observation_for_sample(profile, int(sample_no), target_level)
		result.append({
			"profileId": str(target.get("profileId", "")),
			"sampleNo": int(sample_no),
			"sampleId": str(target.get("sampleId", "")),
			"qualityTier": str(target.get("qualityTier", "C")),
			"qualityPercentile": int(target.get("qualityPercentile", 0)),
			"overallGrade": str(observation.get("overallGrade", "未观察")),
			"powerPercentile": float(observation.get("powerPercentile", 0.0)),
			"level1MaxHp": int(level1.get("maxHp", 0)),
			"level1Attack": int(level1.get("attack", 0)),
			"level1Defense": int(level1.get("defense", 0)),
			"level1Quick": int(level1.get("quick", 0)),
			"level1Power": level1_power,
			"targetLevel": target_level,
			"targetMaxHp": int(target.get("maxHp", 0)),
			"targetAttack": int(target.get("attack", 0)),
			"targetDefense": int(target.get("defense", 0)),
			"targetQuick": int(target.get("quick", 0)),
			"targetPower": target_power,
			"hpGrowthPerLevel": snappedf((float(target.get("maxHp", 0)) - float(level1.get("maxHp", 0))) / float(levels), 0.001),
			"attackGrowthPerLevel": snappedf((float(target.get("attack", 0)) - float(level1.get("attack", 0))) / float(levels), 0.001),
			"defenseGrowthPerLevel": snappedf((float(target.get("defense", 0)) - float(level1.get("defense", 0))) / float(levels), 0.001),
			"quickGrowthPerLevel": snappedf((float(target.get("quick", 0)) - float(level1.get("quick", 0))) / float(levels), 0.001),
			"threeStatGrowthPerLevel": snappedf(
				(float(target.get("attack", 0)) - float(level1.get("attack", 0))
				+ float(target.get("defense", 0)) - float(level1.get("defense", 0))
				+ float(target.get("quick", 0)) - float(level1.get("quick", 0))) / float(levels),
				0.001
			),
			"powerGrowthPerLevel": power_growth,
		})
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("sampleNo", 0)) < int(b.get("sampleNo", 0))
	)
	return result


static func _growth_observation_for_sample(profile: Dictionary, sample_no: int, target_level: int) -> Dictionary:
	var profile_id := str(profile.get("profileId", ""))
	var instance := PetGrowthObservationModel.create_pet_instance(
		profile_id,
		"numeric_growth_%03d" % sample_no,
		str(profile.get("formId", "")),
		str(profile.get("formName", profile.get("displayName", "宠物"))),
		"standby",
		target_level,
		"%s:%03d" % [profile_id, sample_no],
		sample_no
	)
	return PetGrowthObservationModel.evaluate_pet(instance)


static func _stone_plan(stone_plan_id: String) -> Dictionary:
	for plan in stone_plan_options():
		if str(plan.get("id", "")) == stone_plan_id:
			return plan.duplicate(true)
	return {}


static func _pet_stats(pet: Dictionary) -> Dictionary:
	return {
		"maxHp": int(pet.get("maxHp", 0)),
		"attack": int(pet.get("attack", 0)),
		"defense": int(pet.get("defense", 0)),
		"quick": int(pet.get("quick", 0)),
	}


static func _growth_bonus_dict(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = snappedf(float(source.get(key, 0.0)), 0.001)
	return result


static func _counts_for_key(rows: Array[Dictionary], key: String) -> Dictionary:
	var result := {}
	for row in rows:
		var value := str(row.get(key, ""))
		if value == "":
			value = "空"
		result[value] = int(result.get(value, 0)) + 1
	return result


static func _number_summary(rows: Array[Dictionary], key: String) -> Dictionary:
	if rows.is_empty():
		return {"min": 0.0, "max": 0.0, "avg": 0.0}
	var min_value := INF
	var max_value := -INF
	var total := 0.0
	var count := 0
	for row in rows:
		if not row.has(key):
			continue
		var value := float(row.get(key, 0.0))
		min_value = minf(min_value, value)
		max_value = maxf(max_value, value)
		total += value
		count += 1
	if count <= 0:
		return {"min": 0.0, "max": 0.0, "avg": 0.0}
	return {
		"min": snappedf(min_value, 0.001),
		"max": snappedf(max_value, 0.001),
		"avg": snappedf(total / float(count), 0.001),
	}


static func _counts_text(counts_value) -> String:
	var counts := counts_value as Dictionary if counts_value is Dictionary else {}
	if counts.is_empty():
		return "无"
	var order := ["S", "A", "B", "C", "D", "空"]
	var parts: Array[String] = []
	for key in order:
		if counts.has(key):
			parts.append("%s:%d" % [key, int(counts.get(key, 0))])
	for key in counts.keys():
		if not order.has(str(key)):
			parts.append("%s:%d" % [str(key), int(counts.get(key, 0))])
	return "，".join(parts)


static func _range_text(summary_value, decimals: int = 2) -> String:
	var summary := summary_value as Dictionary if summary_value is Dictionary else {}
	var format := "%%.%df-%%.%df，均 %%.%df" % [decimals, decimals, decimals]
	return format % [
		float(summary.get("min", 0.0)),
		float(summary.get("max", 0.0)),
		float(summary.get("avg", 0.0)),
	]


static func _write_csv(rows: Array[Dictionary], output_path: String, headers: Array[String]) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(output_path).simplify_path()
	var dir_path := absolute_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir_error := DirAccess.make_dir_recursive_absolute(dir_path)
		if dir_error != OK:
			return {"ok": false, "path": absolute_path, "error": "无法创建目录: %d" % dir_error}
	var file := FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "path": absolute_path, "error": "无法写入 CSV"}
	file.store_line(",".join(headers))
	for row in rows:
		var values: Array[String] = []
		for header in headers:
			values.append(_csv_cell(row.get(header, "")))
		file.store_line(",".join(values))
	file.close()
	return {"ok": true, "path": absolute_path, "error": ""}


static func _csv_cell(value) -> String:
	var text := str(value)
	if text.find(",") >= 0 or text.find("\"") >= 0 or text.find("\n") >= 0:
		text = "\"" + text.replace("\"", "\"\"") + "\""
	return text


static func _error_report(title: String, message: String) -> Dictionary:
	return {
		"ok": false,
		"title": title,
		"lines": [message],
		"summary": {},
		"rows": [],
		"error": message,
	}
