extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")

const REPORT_SCHEMA_VERSION := 1
const DEFAULT_OUTPUT_PATH := "res://../../.run/godot/combat_formula_driver_ab_report.json"
const CORE_METRIC_KEYS: Array[String] = [
	"events",
	"damageByAlly",
	"damageByEnemy",
	"damageToPlayer",
	"playerPhysicalAttackEvents",
	"playerHitEvents",
	"allyPhysicalAttackEvents",
	"enemyHitEvents",
	"comboEvents",
	"criticalEvents",
	"dodgeEvents",
	"launchEvents",
	"counterEvents",
]


static func build_report() -> Dictionary:
	BalanceCatalogModel.reload()
	var suite := BalanceCatalogModel.active_battle_simulation_suite()
	var formula := BalanceCatalogModel.active_combat_formula()
	var samples: Array[Dictionary] = []
	for scenario in BalanceCatalogModel.battle_simulation_scenario_list():
		var expect := scenario.get("expect", {}) as Dictionary if scenario.get("expect", {}) is Dictionary else {}
		var max_rounds := clampi(int(expect.get("maxRounds", int(suite.get("roundLimit", 30)))), 1, maxi(1, int(suite.get("roundLimit", 30))))
		var legacy := NumericBattleSimulatorModel.simulate_scenario(
			scenario,
			max_rounds,
			BattleModel.COMBAT_FORMULA_DRIVER_LEGACY,
			{},
			true
		)
		var table := NumericBattleSimulatorModel.simulate_scenario(
			scenario,
			max_rounds,
			BattleModel.COMBAT_FORMULA_DRIVER_TABLE,
			formula,
			true
		)
		samples.append(_compare_scenario(str(scenario.get("id", "")), legacy, table))
	var summary := _summary_for_samples(samples)
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"mode": "legacy_vs_table_driver_ab",
		"activeFormulaId": str(formula.get("id", "")),
		"suiteId": str(suite.get("id", "")),
		"samples": samples,
		"summary": summary,
		"notes": [
			"默认真实玩法仍使用 legacy；本报告只验证 table driver 是否可无差异接管。",
			"A/B 使用同一组 battle_simulation_scenarios 和同一套 targetSeed。",
			"如果这里出现 mismatch，不能切换默认驱动，必须先修公式或事件摘要差异。",
		],
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "legacy_vs_table_driver_ab":
		errors.append("combatFormulaDriverAB.mode 必须是 legacy_vs_table_driver_ab")
	var samples: Array = report.get("samples", [])
	if samples.size() < 6:
		errors.append("combatFormulaDriverAB.samples 数量不足")
	var summary := report.get("summary", {}) as Dictionary
	if int(summary.get("scenarioCount", 0)) != samples.size():
		errors.append("combatFormulaDriverAB.summary.scenarioCount 不匹配")
	if int(summary.get("mismatchCount", 0)) > 0:
		errors.append("combatFormulaDriverAB 存在 A/B 不一致样本")
	for value in samples:
		if not (value is Dictionary):
			continue
		var sample := value as Dictionary
		if not bool(sample.get("identical", false)):
			errors.append("%s legacy/table 不一致: %s" % [str(sample.get("id", "")), str(sample.get("firstMismatch", ""))])
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


static func _compare_scenario(sample_id: String, legacy: Dictionary, table: Dictionary) -> Dictionary:
	var legacy_digest: Array = legacy.get("eventDigest", [])
	var table_digest: Array = table.get("eventDigest", [])
	var result_match := str(legacy.get("result", "")) == str(table.get("result", ""))
	var round_delta := int(table.get("rounds", 0)) - int(legacy.get("rounds", 0))
	var player_hp_delta := int(table.get("playerHp", 0)) - int(legacy.get("playerHp", 0))
	var living_ally_delta := int(table.get("livingAllies", 0)) - int(legacy.get("livingAllies", 0))
	var living_enemy_delta := int(table.get("livingEnemies", 0)) - int(legacy.get("livingEnemies", 0))
	var metrics_match := _core_metrics_for(legacy) == _core_metrics_for(table)
	var digest_match := _array_equals(legacy_digest, table_digest)
	var identical := (
		result_match
		and round_delta == 0
		and player_hp_delta == 0
		and living_ally_delta == 0
		and living_enemy_delta == 0
		and metrics_match
		and digest_match
	)
	return {
		"id": sample_id,
		"label": str(legacy.get("label", sample_id)),
		"identical": identical,
		"resultMatch": result_match,
		"metricsMatch": metrics_match,
		"digestMatch": digest_match,
		"roundDelta": round_delta,
		"playerHpDelta": player_hp_delta,
		"livingAllyDelta": living_ally_delta,
		"livingEnemyDelta": living_enemy_delta,
		"legacy": _sample_summary_for(legacy, legacy_digest),
		"table": _sample_summary_for(table, table_digest),
		"firstMismatch": "" if identical else _first_mismatch_reason(legacy, table, legacy_digest, table_digest),
	}


static func _sample_summary_for(sample: Dictionary, digest: Array) -> Dictionary:
	return {
		"driver": str(sample.get("combatFormulaDriver", "")),
		"result": str(sample.get("result", "")),
		"rounds": int(sample.get("rounds", 0)),
		"playerHp": int(sample.get("playerHp", 0)),
		"playerHpRatio": float(sample.get("playerHpRatio", 0.0)),
		"livingAllies": int(sample.get("livingAllies", 0)),
		"livingEnemies": int(sample.get("livingEnemies", 0)),
		"metrics": _core_metrics_for(sample),
		"eventDigestCount": digest.size(),
		"eventDigestHash": _digest_hash(digest),
	}


static func _core_metrics_for(sample: Dictionary) -> Dictionary:
	var source := sample.get("metrics", {}) as Dictionary if sample.get("metrics", {}) is Dictionary else {}
	var result := {}
	for key in CORE_METRIC_KEYS:
		result[key] = int(source.get(key, 0))
	return result


static func _first_mismatch_reason(legacy: Dictionary, table: Dictionary, legacy_digest: Array, table_digest: Array) -> String:
	if str(legacy.get("result", "")) != str(table.get("result", "")):
		return "result %s != %s" % [str(legacy.get("result", "")), str(table.get("result", ""))]
	for key in ["rounds", "playerHp", "livingAllies", "livingEnemies"]:
		if int(legacy.get(key, 0)) != int(table.get(key, 0)):
			return "%s %d != %d" % [key, int(legacy.get(key, 0)), int(table.get(key, 0))]
	var legacy_metrics := _core_metrics_for(legacy)
	var table_metrics := _core_metrics_for(table)
	for key in CORE_METRIC_KEYS:
		if int(legacy_metrics.get(key, 0)) != int(table_metrics.get(key, 0)):
			return "metric.%s %d != %d" % [key, int(legacy_metrics.get(key, 0)), int(table_metrics.get(key, 0))]
	if legacy_digest.size() != table_digest.size():
		return "eventDigest.size %d != %d" % [legacy_digest.size(), table_digest.size()]
	for index in range(legacy_digest.size()):
		if str(legacy_digest[index]) != str(table_digest[index]):
			return "eventDigest[%d] %s != %s" % [index, str(legacy_digest[index]), str(table_digest[index])]
	return "unknown"


static func _summary_for_samples(samples: Array[Dictionary]) -> Dictionary:
	var identical_count := 0
	var mismatch_count := 0
	var max_abs_round_delta := 0
	var max_abs_player_hp_delta := 0
	var first_mismatch_id := ""
	for sample in samples:
		if bool(sample.get("identical", false)):
			identical_count += 1
		else:
			mismatch_count += 1
			if first_mismatch_id == "":
				first_mismatch_id = str(sample.get("id", ""))
		max_abs_round_delta = maxi(max_abs_round_delta, absi(int(sample.get("roundDelta", 0))))
		max_abs_player_hp_delta = maxi(max_abs_player_hp_delta, absi(int(sample.get("playerHpDelta", 0))))
	return {
		"scenarioCount": samples.size(),
		"identicalCount": identical_count,
		"mismatchCount": mismatch_count,
		"maxAbsRoundDelta": max_abs_round_delta,
		"maxAbsPlayerHpDelta": max_abs_player_hp_delta,
		"firstMismatchId": first_mismatch_id,
		"driverSwitchReady": mismatch_count == 0 and samples.size() > 0,
	}


static func _array_equals(left: Array, right: Array) -> bool:
	if left.size() != right.size():
		return false
	for index in range(left.size()):
		if str(left[index]) != str(right[index]):
			return false
	return true


static func _digest_hash(digest: Array) -> String:
	var values: Array[String] = []
	for value in digest:
		values.append(str(value))
	return str("\n".join(values).hash())
