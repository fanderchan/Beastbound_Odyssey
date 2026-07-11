extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const CombatFormulaCandidateModel := preload("res://scripts/progression/combat_formula_candidate_model.gd")
const CombatFormulaDriverABModel := preload("res://scripts/progression/combat_formula_driver_ab_model.gd")
const CombatFormulaShadowModel := preload("res://scripts/progression/combat_formula_shadow_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")
const NumericEconomyLedgerModel := preload("res://scripts/progression/numeric_economy_ledger_model.gd")
const PetIndividualGrowthModel := preload("res://scripts/progression/pet_individual_growth_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")

const REPORT_SCHEMA_VERSION := 1
const DEFAULT_OUTPUT_PATH := "res://../../.run/godot/numeric_experiment_report.json"
const LEVEL_ANCHORS: Array[int] = [1, 20, 60, 80, 100, 120, 131, 140]
const PET_GROWTH_ANCHORS: Array[int] = [1, 20, 50, 80, 100, 120, 131, 140]
const PET_GROWTH_SAMPLE_FORM_IDS: Array[String] = [
	"bui_normal_red_fire10",
	"bui_normal_yellow_wind10",
	"bui_normal_thick_earth10",
	"wuli_normal_orange_fire10",
	"rebirth_beast_water_lv50",
]
const PET_GROWTH_ROLLS: Array[Dictionary] = [
	{"id": "low", "label": "低个体", "qualityRoll": 1000, "ratio": 0.0},
	{"id": "mid", "label": "中个体", "qualityRoll": 5000, "ratio": 0.5},
	{"id": "high", "label": "高个体", "qualityRoll": 9000, "ratio": 1.0},
]
const CAPTURE_HP_RATIOS: Array[float] = [1.0, 0.5, 0.2, 0.1]
const CAPTURE_TOOLS: Array[String] = [
	BattleModel.CAPTURE_TOOL_EMPTY_HAND,
	BattleModel.CAPTURE_TOOL_ROPE_BASIC,
	BattleModel.CAPTURE_TOOL_NET,
	BattleModel.CAPTURE_TOOL_NET_REINFORCED,
]


static func build_report() -> Dictionary:
	BalanceCatalogModel.reload()
	var balance := _balance_summary()
	var level_curve := _level_curve_section()
	var player_growth := _player_growth_section()
	var pet_growth := _pet_growth_section()
	var battle_rewards := _battle_reward_section()
	var progression_zones := _progression_zone_section()
	var combat_formula_shadow := CombatFormulaShadowModel.build_report()
	var combat_v2_shadow := CombatFormulaCandidateModel.build_report()
	var combat_formula_driver_ab := CombatFormulaDriverABModel.build_report()
	var battle_simulation := NumericBattleSimulatorModel.build_report()
	var economy_ledger := NumericEconomyLedgerModel.build_report(battle_simulation)
	var capture_matrix := _capture_matrix_section()
	var equipment_economy := _equipment_economy_section()
	var sections := {
		"balance": balance,
		"levelCurve": level_curve,
		"playerGrowth": player_growth,
		"petGrowth": pet_growth,
		"battleRewards": battle_rewards,
		"progressionZones": progression_zones,
		"combatFormulaShadow": combat_formula_shadow,
		"combatV2Shadow": combat_v2_shadow,
		"combatFormulaDriverAB": combat_formula_driver_ab,
		"battleSimulation": battle_simulation,
		"economyLedger": economy_ledger,
		"captureMatrix": capture_matrix,
		"equipmentEconomy": equipment_economy,
	}
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"suiteId": "phase123_core",
		"policy": {
			"purpose": "固定样本数值基线；用于调参前后对比，不作为最终平衡结论。",
			"probabilityUnit": "0..1",
			"parityMode": true,
			"notes": [
				"真实战斗默认仍使用 legacy；table driver 通过 A/B 报告后才允许切换。",
				"捕捉工具仍使用旧 chanceBonus；capturePower 只作为后续校准预留。",
			],
		},
		"findings": _baseline_findings(sections),
		"balance": balance,
		"levelCurve": level_curve,
		"playerGrowth": player_growth,
		"petGrowth": pet_growth,
		"battleRewards": battle_rewards,
		"progressionZones": progression_zones,
		"combatFormulaShadow": combat_formula_shadow,
		"combatV2Shadow": combat_v2_shadow,
		"combatFormulaDriverAB": combat_formula_driver_ab,
		"battleSimulation": battle_simulation,
		"economyLedger": economy_ledger,
		"captureMatrix": capture_matrix,
		"equipmentEconomy": equipment_economy,
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var balance_errors := BalanceCatalogModel.validation_errors()
	errors.append_array(balance_errors)
	var anchors: Array = report.get("levelCurve", {}).get("anchors", [])
	if anchors.size() != LEVEL_ANCHORS.size():
		errors.append("levelCurve anchors 数量不正确")
	var level_80 := _anchor_for_level(anchors, 80)
	var level_140 := _anchor_for_level(anchors, 140)
	if level_80.is_empty() or level_140.is_empty() or int(level_140.get("cumulativeExp", 0)) <= int(level_80.get("cumulativeExp", 0)):
		errors.append("levelCurve Lv140 累计经验必须高于 Lv80")
	var reward_samples: Array = report.get("battleRewards", {}).get("samples", [])
	var default_sample := _sample_for_id(reward_samples, "default_wild_single")
	var firebud_sample := _sample_for_id(reward_samples, "firebud_training_30")
	if default_sample.is_empty() or firebud_sample.is_empty():
		errors.append("battleRewards 缺少默认或火芽样本")
	elif float(firebud_sample.get("avgExp", 0.0)) <= float(default_sample.get("avgExp", 0.0)):
		errors.append("火芽训练样本平均经验应高于默认单怪样本")
	var capture_rows: Array = report.get("captureMatrix", {}).get("rows", [])
	var hp_20 := _capture_row_for_ratio(capture_rows, 0.2, false)
	var hp_20_sleep := _capture_row_for_ratio(capture_rows, 0.2, true)
	if hp_20.is_empty() or hp_20_sleep.is_empty():
		errors.append("captureMatrix 缺少 20% 血量样本")
	else:
		var chances := hp_20.get("chances", {}) as Dictionary
		var empty := float(chances.get(BattleModel.CAPTURE_TOOL_EMPTY_HAND, 0.0))
		var rope := float(chances.get(BattleModel.CAPTURE_TOOL_ROPE_BASIC, 0.0))
		var net := float(chances.get(BattleModel.CAPTURE_TOOL_NET, 0.0))
		var reinforced := float(chances.get(BattleModel.CAPTURE_TOOL_NET_REINFORCED, 0.0))
		var sleep_reinforced := float((hp_20_sleep.get("chances", {}) as Dictionary).get(BattleModel.CAPTURE_TOOL_NET_REINFORCED, 0.0))
		if not (empty < rope and rope < net and net < reinforced and sleep_reinforced > reinforced):
			errors.append("captureMatrix 工具/睡眠趋势不正确")
	var equipment := report.get("equipmentEconomy", {}) as Dictionary
	if int(equipment.get("weaponAttacksPerDurability", 0)) <= 0 or int(equipment.get("armorHitsPerDurability", 0)) <= 0:
		errors.append("equipmentEconomy 耐久参数无效")
	var combat_shadow := report.get("combatFormulaShadow", {}) as Dictionary
	errors.append_array(CombatFormulaShadowModel.validation_errors(combat_shadow))
	var combat_v2_shadow := report.get("combatV2Shadow", {}) as Dictionary
	errors.append_array(CombatFormulaCandidateModel.validation_errors(combat_v2_shadow))
	var combat_driver_ab := report.get("combatFormulaDriverAB", {}) as Dictionary
	errors.append_array(CombatFormulaDriverABModel.validation_errors(combat_driver_ab))
	var battle_simulation := report.get("battleSimulation", {}) as Dictionary
	errors.append_array(NumericBattleSimulatorModel.validation_errors(battle_simulation))
	var economy_ledger := report.get("economyLedger", {}) as Dictionary
	errors.append_array(NumericEconomyLedgerModel.validation_errors(economy_ledger))
	var pet_growth := report.get("petGrowth", {}) as Dictionary
	var pet_growth_samples: Array = pet_growth.get("growthSamples", [])
	if pet_growth_samples.size() < PET_GROWTH_SAMPLE_FORM_IDS.size() * PET_GROWTH_ROLLS.size():
		errors.append("petGrowth growthSamples 数量不足")
	for value in pet_growth_samples:
		if not (value is Dictionary):
			continue
		var sample := value as Dictionary
		var anchors_for_sample: Array = sample.get("anchors", [])
		if anchors_for_sample.size() != PET_GROWTH_ANCHORS.size():
			errors.append("petGrowth.%s anchors 数量不正确" % str(sample.get("sampleId", "")))
			continue
		var first_anchor := anchors_for_sample[0] as Dictionary
		var last_anchor := anchors_for_sample[anchors_for_sample.size() - 1] as Dictionary
		if int(last_anchor.get("combatPower", 0)) <= int(first_anchor.get("combatPower", 0)):
			errors.append("petGrowth.%s 战力未随等级成长" % str(sample.get("sampleId", "")))
	var progression := report.get("progressionZones", {}) as Dictionary
	var progression_samples: Array = progression.get("samples", [])
	if progression_samples.size() < 8:
		errors.append("progressionZones 样本数量不足")
	for value in progression_samples:
		if not (value is Dictionary):
			continue
		var sample := value as Dictionary
		if bool(sample.get("missingRewardTable", false)):
			errors.append("progressionZones.%s 缺少奖励表" % str(sample.get("id", "")))
		if float(sample.get("avgExp", 0.0)) <= 0.0:
			errors.append("progressionZones.%s 经验样本无效" % str(sample.get("id", "")))
	var findings: Array = report.get("findings", [])
	if findings.is_empty():
		errors.append("findings 不能为空")
	return errors


static func write_report(report: Dictionary, output_path: String = DEFAULT_OUTPUT_PATH) -> Dictionary:
	var absolute_path := ProjectSettings.globalize_path(output_path).simplify_path()
	var dir_path := absolute_path.get_base_dir()
	if not DirAccess.dir_exists_absolute(dir_path):
		var dir_error := DirAccess.make_dir_recursive_absolute(dir_path)
		if dir_error != OK:
			return {"ok": false, "path": absolute_path, "error": "无法创建目录: %d" % dir_error}
	var file := FileAccess.open(absolute_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "path": absolute_path, "error": "无法写入报告"}
	file.store_string(JSON.stringify(report, "\t", false))
	file.close()
	return {"ok": true, "path": absolute_path, "error": ""}


static func _balance_summary() -> Dictionary:
	var level_curve := BalanceCatalogModel.active_level_curve()
	var pet_formula := BalanceCatalogModel.pet_power_formula()
	var combat_formula := BalanceCatalogModel.active_combat_formula()
	var capture_formula := BalanceCatalogModel.active_capture_formula()
	var version := BalanceCatalogModel.balance_snapshot_summary()
	return {
		"balanceSetId": str(version.get("balanceSetId", "")),
		"balanceVersion": str(version.get("balanceVersion", "")),
		"formulaVersion": str(version.get("formulaVersion", "")),
		"captureFormulaVersion": str(version.get("captureFormulaVersion", "")),
		"rewardEconomyVersion": str(version.get("rewardEconomyVersion", "")),
		"sourceDigest": str(version.get("sourceDigest", "")),
		"sourceDigestShort": str(version.get("sourceDigestShort", "")),
		"sourceCount": int(version.get("sourceCount", 0)),
		"maxPlayerLevel": BalanceCatalogModel.max_player_level(PlayerProgressModel.MAX_PLAYER_LEVEL),
		"maxPetLevel": BalanceCatalogModel.max_pet_level(PlayerProgressModel.MAX_PET_LEVEL),
		"activeLevelCurve": str(level_curve.get("id", "")),
		"activePetPowerFormula": str(pet_formula.get("id", "")),
		"activeCombatFormula": str(combat_formula.get("id", "")),
		"activeCaptureFormula": str(capture_formula.get("id", "")),
		"defaultShopSellRate": BalanceCatalogModel.default_shop_sell_rate(0.5),
	}


static func _level_curve_section() -> Dictionary:
	var anchors: Array[Dictionary] = []
	var lv140_total := maxi(1, BalanceCatalogModel.exp_grant_for_level(140, PlayerProgressModel.MAX_PLAYER_LEVEL))
	for level in LEVEL_ANCHORS:
		var cumulative := BalanceCatalogModel.exp_grant_for_level(level, PlayerProgressModel.MAX_PLAYER_LEVEL)
		anchors.append({
			"level": level,
			"expToNext": BalanceCatalogModel.exp_to_next_level(level, PlayerProgressModel.exp_to_next_level(level)),
			"cumulativeExp": cumulative,
			"cumulativeRatioToLv140": snappedf(float(cumulative) / float(lv140_total), 0.0001),
			"role": _level_anchor_role(level),
		})
	return {
		"formula": str(BalanceCatalogModel.active_level_curve().get("formula", "")),
		"anchors": anchors,
	}


static func _player_growth_section() -> Dictionary:
	var stats := BalanceCatalogModel.default_player_battle_stats(PlayerProgressModel.DEFAULT_PLAYER_BATTLE_STATS)
	var point_gains := {}
	for key in ["maxHp", "attack", "defense", "quick"]:
		point_gains[key] = BalanceCatalogModel.player_stat_point_gain(key, int(PlayerProgressModel.PLAYER_STAT_POINT_GAINS.get(key, 1)))
	var rebirth_required: Array[int] = []
	for target in range(1, 7):
		rebirth_required.append(BalanceCatalogModel.rebirth_required_level_for_target(target, 80))
	return {
		"baseStats": stats,
		"statPointsPerLevel": BalanceCatalogModel.stat_points_per_level(PlayerProgressModel.PLAYER_STAT_POINTS_PER_LEVEL),
		"pointGains": point_gains,
		"villageHealHpPerCoin": BalanceCatalogModel.village_heal_hp_per_coin(PlayerProgressModel.VILLAGE_HEAL_HP_PER_COIN),
		"rebirthRequiredLevelByTarget": rebirth_required,
	}


static func _pet_growth_section() -> Dictionary:
	var profiles: Array[Dictionary] = []
	for profile in BalanceCatalogModel.pet_growth_profile_list():
		profiles.append({
			"id": str(profile.get("id", "")),
			"displayName": str(profile.get("displayName", "")),
			"perLevel": BalanceCatalogModel.pet_growth_rates(str(profile.get("id", "")), {}),
		})
	return {
		"profiles": profiles,
		"quality": {
			"lowThreshold": BalanceCatalogModel.pet_quality_low_threshold(2400),
			"highThreshold": BalanceCatalogModel.pet_quality_high_threshold(7600),
			"lowLabel": BalanceCatalogModel.pet_quality_label("low", "偏低"),
			"normalLabel": BalanceCatalogModel.pet_quality_label("normal", "普通"),
			"highLabel": BalanceCatalogModel.pet_quality_label("high", "偏高"),
		},
		"powerFormula": BalanceCatalogModel.pet_power_formula(),
		"samplePower": PetPowerModel.combat_power_for_stats({"maxHp": 80, "attack": 10, "defense": 5, "quick": 20}),
		"sampleAnchors": PET_GROWTH_ANCHORS,
		"growthSamples": _pet_growth_samples(),
	}


static func _pet_growth_samples() -> Array[Dictionary]:
	var samples: Array[Dictionary] = []
	for form_id in PET_GROWTH_SAMPLE_FORM_IDS:
		var template := PetTemplateCatalog.runtime_template_for_form(form_id)
		if template.is_empty():
			continue
		var growth_profile_id := str(template.get("growthProfileId", "balanced"))
		var growth_rates := BalanceCatalogModel.pet_growth_rates(growth_profile_id, {})
		for roll in PET_GROWTH_ROLLS:
			var roll_id := str(roll.get("id", ""))
			var variance := _pet_growth_variance_for_roll(float(roll.get("ratio", 0.5)), int(roll.get("qualityRoll", 5000)))
			var instance := {
				"instanceId": "numeric_%s_%s" % [form_id, roll_id],
				"formId": form_id,
				"growthTierId": growth_profile_id,
				"individualSeed": "numeric:%s:%s" % [form_id, roll_id],
				"individualVariance": variance,
			}
			var anchors: Array[Dictionary] = []
			var quality_score := 0
			var quality_label := ""
			var initial_stats := {}
			for level in PET_GROWTH_ANCHORS:
				var snapshot := PetIndividualGrowthModel.growth_snapshot(template, instance, level, growth_rates, str(instance.get("individualSeed", "")))
				var final_stats := snapshot.get("finalStats", {}) as Dictionary
				var breakdown := PetIndividualGrowthModel.power_breakdown(final_stats)
				quality_score = int(snapshot.get("individualQualityScore", quality_score))
				quality_label = str(snapshot.get("individualQualityLabel", quality_label))
				initial_stats = snapshot.get("initialStats", initial_stats)
				anchors.append({
					"level": level,
					"finalStats": final_stats,
					"combatPower": int(breakdown.get("total", 0)),
					"combatPowerBreakdown": breakdown,
				})
			samples.append({
				"sampleId": "%s:%s" % [form_id, roll_id],
				"formId": form_id,
				"formName": str(template.get("formName", form_id)),
				"growthProfileId": growth_profile_id,
				"growthProfileLabel": PetIndividualGrowthModel.growth_tier_label(growth_profile_id),
				"rollId": roll_id,
				"rollLabel": str(roll.get("label", roll_id)),
				"individualVariance": variance,
				"individualQualityScore": quality_score,
				"individualQualityLabel": quality_label,
				"initialStats": initial_stats,
				"anchors": anchors,
			})
	return samples


static func _pet_growth_variance_for_roll(ratio: float, quality_roll: int) -> Dictionary:
	var clamped_ratio := clampf(ratio, 0.0, 1.0)
	var initial := {}
	var growth := {}
	for key in ["maxHp", "attack", "defense", "quick"]:
		var initial_range := BalanceCatalogModel.pet_initial_bonus_range(key, 0, 0)
		var growth_range := BalanceCatalogModel.pet_growth_bonus_range(key, 0.0, 0.0)
		initial[key] = int(round(lerpf(float(initial_range.get("min", 0)), float(initial_range.get("max", 0)), clamped_ratio)))
		growth[key] = snappedf(lerpf(float(growth_range.get("min", 0.0)), float(growth_range.get("max", 0.0)), clamped_ratio), 0.0001)
	return {
		"schemaVersion": PetIndividualGrowthModel.SCHEMA_VERSION,
		"qualityRoll": clampi(quality_roll, 0, 10000),
		"initialBonus": initial,
		"growthBonus": growth,
	}


static func _battle_reward_section() -> Dictionary:
	var samples: Array[Dictionary] = []
	samples.append(_battle_reward_sample(
		"default_wild_single",
		"",
		[_enemy_actor("enemy_0", 1, 80, 12, 8, 62)],
		30
	))
	samples.append(_battle_reward_sample(
		"firebud_training_30",
		"firebud_grass_01",
		[
			_enemy_actor("enemy_0", 1, 80, 12, 8, 62),
			_enemy_actor("enemy_1", 2, 92, 15, 7, 72),
		],
		30
	))
	samples.append(_battle_reward_sample(
		"earth_guardian_10",
		"earth_vein_guardian_group",
		[
			_enemy_actor("guardian_0", 80, 950, 95, 70, 70),
			_enemy_actor("guardian_1", 80, 900, 88, 78, 62),
		],
		10
	))
	samples.append(_battle_reward_sample(
		"shadow_oath_boss_10",
		"shadow_oath_rebirth_guardian",
		[_enemy_actor("shadow_guardian", 106, 1500, 135, 95, 90)],
		10
	))
	return {
		"samples": samples,
		"formula": BalanceCatalogModel.active_battle_exp_formula(),
		"stageTargets": BalanceCatalogModel.battle_exp_stage_targets(),
		"notes": [
			"经验仍使用 PlayerProgressModel.battle_exp_reward 当前公式。",
			"石币和物品使用 BattleRewardCatalog 固定 seed 采样。",
		],
	}


static func _progression_zone_section() -> Dictionary:
	var samples: Array[Dictionary] = []
	var summary := {
		"repeatableZones": 0,
		"qualificationZones": 0,
		"expOk": 0,
		"expBelow": 0,
		"expAbove": 0,
		"stoneOk": 0,
		"battleCountOk": 0,
	}
	for zone in BalanceCatalogModel.progression_zone_list():
		var sample := _progression_zone_sample(zone)
		samples.append(sample)
		if bool(sample.get("repeatable", false)):
			summary["repeatableZones"] = int(summary.get("repeatableZones", 0)) + 1
		else:
			summary["qualificationZones"] = int(summary.get("qualificationZones", 0)) + 1
		match str(sample.get("expStatus", "")):
			"ok":
				summary["expOk"] = int(summary.get("expOk", 0)) + 1
			"below":
				summary["expBelow"] = int(summary.get("expBelow", 0)) + 1
			"above":
				summary["expAbove"] = int(summary.get("expAbove", 0)) + 1
		if str(sample.get("stoneStatus", "")) == "ok":
			summary["stoneOk"] = int(summary.get("stoneOk", 0)) + 1
		if str(sample.get("battlesPerLevelStatus", "")) == "ok":
			summary["battleCountOk"] = int(summary.get("battleCountOk", 0)) + 1
	return {
		"activeProgression": str(BalanceCatalogModel.active_progression().get("id", "")),
		"samples": samples,
		"summary": summary,
		"notes": [
			"区域收益样本只验证表目标和当前公式，不代表地图已经正式开放。",
			"qualification_battle 的 targetBattlesPerLevel 仅作占位，不参与练级战数判定。",
		],
	}


static func _progression_zone_sample(zone: Dictionary) -> Dictionary:
	var zone_id := str(zone.get("id", ""))
	var group_id := str(zone.get("encounterGroupId", ""))
	var reward_table_id := str(zone.get("rewardTableId", group_id))
	var repeatable := bool(zone.get("repeatable", false))
	var battle_count := 30 if repeatable else 10
	var typical_battle = zone.get("typicalBattle", {})
	var typical_battle_dict := typical_battle as Dictionary if typical_battle is Dictionary else {}
	var enemy_count := maxi(1, int(typical_battle_dict.get("enemyCount", 1)))
	var enemy_value = typical_battle_dict.get("enemy", {})
	var enemy := enemy_value as Dictionary if enemy_value is Dictionary else {}
	var enemies: Array[Dictionary] = []
	for index in range(enemy_count):
		enemies.append(_enemy_actor(
			"%s_enemy_%02d" % [zone_id, index],
			int(enemy.get("level", 1)),
			int(enemy.get("maxHp", 80)),
			int(enemy.get("attack", 10)),
			int(enemy.get("defense", 6)),
			int(enemy.get("quick", 40))
		))
	var reward := _battle_reward_sample(zone_id, reward_table_id, enemies, battle_count)
	var level_range := _pair_from(zone.get("levelRange", []), 1, 1)
	var anchor_level := clampi(int(round((float(level_range[0]) + float(level_range[1])) / 2.0)), 1, BalanceCatalogModel.max_player_level(PlayerProgressModel.MAX_PLAYER_LEVEL) - 1)
	var avg_exp := float(reward.get("avgExp", 0.0))
	var estimated_battles := int(ceil(float(BalanceCatalogModel.exp_to_next_level(anchor_level, 1)) / maxf(1.0, avg_exp)))
	var target_exp := _pair_from(zone.get("targetAvgExpPerBattle", []), 0, 0)
	var target_stone := _pair_from(zone.get("targetStoneCoinsPerBattle", []), 0, 0)
	var target_battles := _pair_from(zone.get("targetBattlesPerLevel", []), 0, 0)
	var exp_status := _range_status(avg_exp, target_exp)
	var stone_status := _range_status(float(reward.get("avgStoneCoins", 0.0)), target_stone)
	var battle_status := "not_applicable"
	if repeatable:
		battle_status = _range_status(float(estimated_battles), target_battles)
	return {
		"id": zone_id,
		"label": str(zone.get("label", zone_id)),
		"stageId": str(zone.get("stageId", "")),
		"contentType": str(zone.get("contentType", "")),
		"repeatable": repeatable,
		"levelRange": level_range,
		"anchorLevel": anchor_level,
		"encounterGroupId": group_id,
		"rewardTableId": reward_table_id,
		"enemyCount": enemy_count,
		"enemyLevel": int(enemy.get("level", 1)),
		"targetAvgExpPerBattle": target_exp,
		"targetStoneCoinsPerBattle": target_stone,
		"targetBattlesPerLevel": target_battles,
		"avgExp": reward.get("avgExp", 0.0),
		"avgStoneCoins": reward.get("avgStoneCoins", 0.0),
		"estimatedBattlesToNextAtAnchor": estimated_battles,
		"itemAverages": reward.get("itemAverages", {}),
		"expStatus": exp_status,
		"stoneStatus": stone_status,
		"battlesPerLevelStatus": battle_status,
		"missingRewardTable": reward_table_id != "" and BattleRewardCatalog.table_for_id(reward_table_id).is_empty(),
		"designNotes": str(zone.get("designNotes", "")),
	}


static func _battle_reward_sample(sample_id: String, reward_table_id: String, enemies: Array[Dictionary], battles: int) -> Dictionary:
	var battle_count := maxi(1, battles)
	var total_exp := 0
	var total_stone := 0
	var item_totals := {}
	var last_items: Array[Dictionary] = []
	for index in range(battle_count):
		var state := {
			"id": "%s:%d" % [sample_id, index],
			"targetSeed": "%s:%d" % [sample_id, index],
			"actors": enemies.duplicate(true),
		}
		if reward_table_id != "":
			state["sourceEncounterGroupId"] = reward_table_id
		var exp := PlayerProgressModel.battle_exp_reward(state)
		var stone := BattleRewardCatalog.stone_coins_for_state(state)
		var items := BattleRewardCatalog.rewards_for_state(state)
		total_exp += exp
		total_stone += stone
		last_items = items
		for reward in items:
			var item_id := str(reward.get("itemId", ""))
			item_totals[item_id] = int(item_totals.get(item_id, 0)) + maxi(0, int(reward.get("count", 0)))
	var item_averages := {}
	for item_id in item_totals.keys():
		item_averages[item_id] = snappedf(float(item_totals[item_id]) / float(battle_count), 0.0001)
	var avg_exp := float(total_exp) / float(battle_count)
	return {
		"id": sample_id,
		"rewardTableId": reward_table_id if reward_table_id != "" else "default_wild",
		"battles": battle_count,
		"enemyCount": enemies.size(),
		"avgExp": snappedf(avg_exp, 0.01),
		"avgStoneCoins": snappedf(float(total_stone) / float(battle_count), 0.01),
		"totalExp": total_exp,
		"totalStoneCoins": total_stone,
		"itemAverages": item_averages,
		"lastSampleItems": last_items,
		"estimatedBattlesToNextAtLv80": int(ceil(float(BalanceCatalogModel.exp_to_next_level(80, 1)) / maxf(1.0, avg_exp))),
	}


static func _capture_matrix_section() -> Dictionary:
	var rows: Array[Dictionary] = []
	for ratio in CAPTURE_HP_RATIOS:
		rows.append(_capture_row(ratio, false))
		if absf(ratio - 0.2) <= 0.001:
			rows.append(_capture_row(ratio, true))
	return {
		"target": {
			"label": "普通乌力样本",
			"level": 1,
			"maxHp": 80,
			"captureDifficulty": 44,
		},
		"rows": rows,
	}


static func _capture_row(hp_ratio: float, sleeping: bool) -> Dictionary:
	var target_hp := clampi(int(round(80.0 * hp_ratio)), 0, 80)
	var state := _capture_state(target_hp, sleeping)
	var chances := {}
	for tool_id in CAPTURE_TOOLS:
		chances[tool_id] = snappedf(BattleModel.capture_chance(state, BattleModel.PLAYER_ACTOR_ID, "enemy_0", tool_id), 0.0001)
	return {
		"hpRatio": snappedf(hp_ratio, 0.0001),
		"targetHp": target_hp,
		"sleeping": sleeping,
		"chances": chances,
	}


static func _equipment_economy_section() -> Dictionary:
	var repair_per_coin := BalanceCatalogModel.equipment_repair_durability_per_coin(PlayerProgressModel.EQUIPMENT_REPAIR_DURABILITY_PER_COIN)
	return {
		"weaponAttacksPerDurability": BalanceCatalogModel.equipment_weapon_attacks_per_durability(PlayerProgressModel.EQUIPMENT_WEAPON_ATTACKS_PER_DURABILITY),
		"armorHitsPerDurability": BalanceCatalogModel.equipment_armor_hits_per_durability(PlayerProgressModel.EQUIPMENT_ARMOR_HITS_PER_DURABILITY),
		"repairDurabilityPerCoin": repair_per_coin,
		"repairCostFor100MissingDurability": int(ceil(100.0 / float(repair_per_coin))),
		"assumptions": [
			"武器只有普通攻击类动作计数，防御/精灵/道具不计。",
			"防具只有命中后计数，回避不计。",
		],
	}


static func _baseline_findings(sections: Dictionary) -> Array[Dictionary]:
	var findings: Array[Dictionary] = []
	var anchors: Array = sections.get("levelCurve", {}).get("anchors", [])
	var lv80 := _anchor_for_level(anchors, 80)
	var lv140 := _anchor_for_level(anchors, 140)
	if not lv80.is_empty() and not lv140.is_empty():
		findings.append({
			"id": "level_curve_rebirth_vs_cap",
			"severity": "info",
			"text": "Lv80 累计经验约为 Lv140 的 %.2f%%，适合把人物转生循环和宠物长期满级目标分开。" % [float(lv80.get("cumulativeRatioToLv140", 0.0)) * 100.0],
		})
	var samples: Array = sections.get("battleRewards", {}).get("samples", [])
	var firebud := _sample_for_id(samples, "firebud_training_30")
	if not firebud.is_empty():
		findings.append({
			"id": "firebud_training_not_high_level_route",
			"severity": "warning",
			"text": "火芽草丛样本在 Lv80 约需 %d 战升下一等级，它只能验证新手/低级收益，不应作为 Lv80 后练级区。" % int(firebud.get("estimatedBattlesToNextAtLv80", 0)),
		})
	var guardian := _sample_for_id(samples, "earth_guardian_10")
	if not guardian.is_empty():
		findings.append({
			"id": "guardian_reward_band",
			"severity": "info",
			"text": "四洞守护样本平均 %.0f 经验、%.0f 石币，作为资格战奖励已有存在感；它应限次/任务化，不应承担重复刷级主循环。" % [
				float(guardian.get("avgExp", 0.0)),
				float(guardian.get("avgStoneCoins", 0.0)),
			],
		})
	var capture_rows: Array = sections.get("captureMatrix", {}).get("rows", [])
	var hp_20 := _capture_row_for_ratio(capture_rows, 0.2, false)
	var hp_20_sleep := _capture_row_for_ratio(capture_rows, 0.2, true)
	if not hp_20.is_empty() and not hp_20_sleep.is_empty():
		var normal_reinforced := float((hp_20.get("chances", {}) as Dictionary).get(BattleModel.CAPTURE_TOOL_NET_REINFORCED, 0.0))
		var sleep_reinforced := float((hp_20_sleep.get("chances", {}) as Dictionary).get(BattleModel.CAPTURE_TOOL_NET_REINFORCED, 0.0))
		findings.append({
			"id": "sleep_capture_value",
			"severity": "info",
			"text": "20%% 血强化网捕捉率 %.2f%%，睡眠后 %.2f%%，状态技能对捕宠有明确价值。" % [normal_reinforced * 100.0, sleep_reinforced * 100.0],
		})
	var pet_growth := sections.get("petGrowth", {}) as Dictionary
	var pet_growth_samples: Array = pet_growth.get("growthSamples", [])
	var bui_low := _pet_growth_sample_for_id(pet_growth_samples, "bui_normal_red_fire10:low")
	var bui_high := _pet_growth_sample_for_id(pet_growth_samples, "bui_normal_red_fire10:high")
	if not bui_low.is_empty() and not bui_high.is_empty():
		var low_power := _pet_growth_anchor_power(bui_low, 140)
		var high_power := _pet_growth_anchor_power(bui_high, 140)
		findings.append({
			"id": "pet_individual_quality_gap",
			"severity": "info",
			"text": "红色普通布伊 Lv140 低/高个体战力 %d/%d，品质和战力差异已可由个体差与成长记录解释。" % [low_power, high_power],
		})
	var equipment := sections.get("equipmentEconomy", {}) as Dictionary
	findings.append({
		"id": "equipment_repair_sink",
		"severity": "info",
		"text": "装备修理 100 点耐久缺口约 %d 石币，是温和金币回收；后续强化/高阶装备再扩大经济回收。" % int(equipment.get("repairCostFor100MissingDurability", 0)),
	})
	var progression := sections.get("progressionZones", {}) as Dictionary
	var progression_summary := progression.get("summary", {}) as Dictionary
	if int(progression_summary.get("expBelow", 0)) > 0 or int(progression_summary.get("expAbove", 0)) > 0:
		findings.append({
			"id": "progression_zone_targets_need_tuning",
			"severity": "warning",
			"text": "区域收益样本有 %d 个低于经验目标、%d 个高于经验目标；后续调参应优先改 progression_zones 和 battleExp group/level scale。" % [
				int(progression_summary.get("expBelow", 0)),
				int(progression_summary.get("expAbove", 0)),
			],
		})
	else:
		findings.append({
			"id": "progression_zone_targets_aligned",
			"severity": "info",
			"text": "区域收益样本经验目标均落在当前目标区间内，可作为下一轮战斗公式迁移前的练级收益基线。",
		})
	var combat_shadow := sections.get("combatFormulaShadow", {}) as Dictionary
	var combat_summary := combat_shadow.get("summary", {}) as Dictionary
	findings.append({
		"id": "combat_formula_shadow_delta",
		"severity": "warning",
		"text": "战斗公式 shadow report 平均伤害差 %.2f、平均概率差 %.2f%%；当前只记录差异，尚未切换实战公式。" % [
			float(combat_summary.get("avgAbsDamageDelta", 0.0)),
			float(combat_summary.get("avgAbsRateDelta", 0.0)) * 100.0,
		],
	})
	var combat_v2_shadow := sections.get("combatV2Shadow", {}) as Dictionary
	var combat_v2_summary := combat_v2_shadow.get("summary", {}) as Dictionary
	findings.append({
		"id": "combat_v2_candidate_shadow",
		"severity": "info" if bool(combat_v2_summary.get("candidateReadyForReview", false)) else "warning",
		"text": "combat_v2_candidate 影子样本 %d 个，评审条件 %d/%d，平均伤害差 %.2f、平均伤害比例差 %.2f%%；当前只观察，不切换真实战斗。" % [
			int(combat_v2_summary.get("sampleCount", 0)),
			int(combat_v2_summary.get("criteriaPassed", 0)),
			int(combat_v2_summary.get("criteriaTotal", 0)),
			float(combat_v2_summary.get("avgAbsDamageDelta", 0.0)),
			float(combat_v2_summary.get("avgAbsDamageDeltaRatio", 0.0)) * 100.0,
		],
	})
	var battle_simulation := sections.get("battleSimulation", {}) as Dictionary
	var battle_sim_summary := battle_simulation.get("summary", {}) as Dictionary
	findings.append({
		"id": "battle_simulation_gate",
		"severity": "info" if int(battle_sim_summary.get("expectationOk", 0)) == int(battle_sim_summary.get("scenarioCount", 0)) else "warning",
		"text": "固定战斗仿真 %d/%d 个场景满足期望，平均 %.2f 回合，最低人物血量 %.2f%%；这是后续公式切换的硬门槛。" % [
			int(battle_sim_summary.get("expectationOk", 0)),
			int(battle_sim_summary.get("scenarioCount", 0)),
			float(battle_sim_summary.get("avgRounds", 0.0)),
			float(battle_sim_summary.get("lowestPlayerHpRatio", 0.0)) * 100.0,
		],
	})
	var economy_ledger := sections.get("economyLedger", {}) as Dictionary
	var economy_summary := economy_ledger.get("summary", {}) as Dictionary
	findings.append({
		"id": "economy_ledger_net_income",
		"severity": "info" if int(economy_summary.get("repeatableNetPositive", 0)) == int(economy_summary.get("repeatableCount", 0)) else "warning",
		"text": "经济账本 %d/%d 个可重复练级区净收入为正，平均每战 %.2f 石币，最低样本 %s=%.2f；后续调表不能只看毛掉落。" % [
			int(economy_summary.get("repeatableNetPositive", 0)),
			int(economy_summary.get("repeatableCount", 0)),
			float(economy_summary.get("avgRepeatableNetStonePerBattle", 0.0)),
			str(economy_summary.get("lowestRepeatableNetScenarioId", "")),
			float(economy_summary.get("lowestRepeatableNetStonePerBattle", 0.0)),
		],
	})
	return findings


static func _capture_state(target_hp: int, sleeping: bool) -> Dictionary:
	var state := {
		"id": "numeric_capture_sample",
		"targetSeed": "numeric_capture_sample",
		"actors": [
			{
				"id": BattleModel.PLAYER_ACTOR_ID,
				"name": "数值样本人物",
				"side": BattleModel.SIDE_ALLY,
				"type": "player",
				"hp": 160,
				"maxHp": 160,
				"attack": 22,
				"defense": 10,
				"quick": 72,
			},
			{
				"id": "enemy_0",
				"name": "普通乌力样本",
				"side": BattleModel.SIDE_ENEMY,
				"type": "pet",
				"hp": target_hp,
				"maxHp": 80,
				"attack": 12,
				"defense": 8,
				"quick": 62,
				"level": 1,
				"catchable": true,
				"captureDifficulty": 44,
			},
		],
		"captureToolBag": {
			BattleModel.CAPTURE_TOOL_ROPE_BASIC: 99,
			BattleModel.CAPTURE_TOOL_NET: 99,
			BattleModel.CAPTURE_TOOL_NET_REINFORCED: 99,
		},
	}
	if sleeping:
		state = BattleModel.set_actor_status(state, "enemy_0", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	return state


static func _enemy_actor(actor_id: String, level: int, max_hp: int, attack: int, defense: int, quick: int) -> Dictionary:
	return {
		"id": actor_id,
		"name": "数值样本敌人",
		"side": BattleModel.SIDE_ENEMY,
		"type": "pet",
		"level": level,
		"hp": 0,
		"maxHp": max_hp,
		"attack": attack,
		"defense": defense,
		"quick": quick,
	}


static func _level_anchor_role(level: int) -> String:
	match level:
		1:
			return "新手起点"
		20:
			return "教学完成"
		60:
			return "中期成长"
		80:
			return "转生循环门槛"
		100:
			return "四洞稳定挑战"
		120:
			return "玄影准备"
		131:
			return "经验丹测试锚点"
		140:
			return "长期满级"
		_:
			return ""


static func _anchor_for_level(anchors: Array, level: int) -> Dictionary:
	for value in anchors:
		if value is Dictionary and int((value as Dictionary).get("level", 0)) == level:
			return value as Dictionary
	return {}


static func _sample_for_id(samples: Array, sample_id: String) -> Dictionary:
	for value in samples:
		if value is Dictionary and str((value as Dictionary).get("id", "")) == sample_id:
			return value as Dictionary
	return {}


static func _capture_row_for_ratio(rows: Array, ratio: float, sleeping: bool) -> Dictionary:
	for value in rows:
		if not (value is Dictionary):
			continue
		var row := value as Dictionary
		if absf(float(row.get("hpRatio", 0.0)) - ratio) <= 0.001 and bool(row.get("sleeping", false)) == sleeping:
			return row
	return {}


static func _pet_growth_sample_for_id(samples: Array, sample_id: String) -> Dictionary:
	for value in samples:
		if value is Dictionary and str((value as Dictionary).get("sampleId", "")) == sample_id:
			return value as Dictionary
	return {}


static func _pet_growth_anchor_power(sample: Dictionary, level: int) -> int:
	var anchors: Array = sample.get("anchors", [])
	for value in anchors:
		if value is Dictionary and int((value as Dictionary).get("level", 0)) == level:
			return int((value as Dictionary).get("combatPower", 0))
	return 0


static func _pair_from(value, fallback_min: int, fallback_max: int) -> Array[int]:
	if value is Array:
		var values := value as Array
		if values.size() >= 2:
			return [int(values[0]), int(values[1])]
	return [fallback_min, fallback_max]


static func _range_status(value: float, target_range: Array[int]) -> String:
	if target_range.size() < 2:
		return "unknown"
	if value < float(target_range[0]):
		return "below"
	if value > float(target_range[1]):
		return "above"
	return "ok"
