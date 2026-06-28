extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const CombatFormulaDriverABModel := preload("res://scripts/progression/combat_formula_driver_ab_model.gd")
const CombatFormulaShadowModel := preload("res://scripts/progression/combat_formula_shadow_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")
const NumericEconomyLedgerModel := preload("res://scripts/progression/numeric_economy_ledger_model.gd")
const NumericExperimentModel := preload("res://scripts/progression/numeric_experiment_model.gd")

const REPORT_SCHEMA_VERSION := 1
const DEFAULT_OUTPUT_PATH := "res://../../.run/godot/numeric_balance_gate_report.json"
const ACTIVE_FORMULA_MAX_AVG_DAMAGE_DELTA := 5.0
const ACTIVE_FORMULA_MAX_AVG_RATE_DELTA := 0.08
const ACTIVE_FORMULA_MAX_SINGLE_DAMAGE_DELTA := 10.0
const ACTIVE_FORMULA_MAX_SINGLE_RATE_DELTA := 0.08
const HIGH_ECONOMY_NET_PER_HOUR_WATCH := 200000.0

const CombatFormulaCandidateModel := preload("res://scripts/progression/combat_formula_candidate_model.gd")


static func build_report(numeric_report: Dictionary = {}) -> Dictionary:
	BalanceCatalogModel.reload()
	var report := numeric_report
	if report.is_empty():
		report = NumericExperimentModel.build_report()
	var gates: Array[Dictionary] = []
	gates.append(_catalog_gate())
	gates.append(_progression_gate(report.get("progressionZones", {}) as Dictionary))
	gates.append(_combat_shadow_gate(report.get("combatFormulaShadow", {}) as Dictionary))
	gates.append(_combat_v2_shadow_gate(report.get("combatV2Shadow", {}) as Dictionary))
	gates.append(_active_formula_switch_gate(report.get("combatFormulaShadow", {}) as Dictionary))
	gates.append(_combat_formula_driver_ab_gate(report.get("combatFormulaDriverAB", {}) as Dictionary))
	gates.append(_battle_simulation_gate(report.get("battleSimulation", {}) as Dictionary))
	gates.append(_economy_ledger_gate(report.get("economyLedger", {}) as Dictionary))
	gates.append(_documentation_gate())
	var summary := _summary_for_gates(gates)
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"gateId": "phase129_numeric_promotion_gate",
		"label": "Phase129 数值晋升门禁",
		"mode": "balance_promotion_gate",
		"thresholds": {
			"activeFormulaMaxAvgDamageDelta": ACTIVE_FORMULA_MAX_AVG_DAMAGE_DELTA,
			"activeFormulaMaxAvgRateDelta": ACTIVE_FORMULA_MAX_AVG_RATE_DELTA,
			"activeFormulaMaxSingleDamageDelta": ACTIVE_FORMULA_MAX_SINGLE_DAMAGE_DELTA,
			"activeFormulaMaxSingleRateDelta": ACTIVE_FORMULA_MAX_SINGLE_RATE_DELTA,
			"highEconomyNetPerHourWatch": HIGH_ECONOMY_NET_PER_HOUR_WATCH,
		},
		"summary": summary,
		"gates": gates,
		"notes": [
			"fail 表示基础报告或硬门槛坏了，自测应失败。",
			"blocked 表示当前不建议晋升某个数值/公式，但报告系统本身健康。",
			"watch 表示可继续推进，但需要策划解释或后续回收系统。",
		],
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "balance_promotion_gate":
		errors.append("numericBalanceGate.mode 必须是 balance_promotion_gate")
	var gates: Array = report.get("gates", [])
	if gates.size() < 9:
		errors.append("numericBalanceGate.gates 数量不足")
	var summary := report.get("summary", {}) as Dictionary
	if int(summary.get("gateCount", 0)) != gates.size():
		errors.append("numericBalanceGate.summary.gateCount 不匹配")
	if int(summary.get("failCount", 0)) > 0:
		errors.append("numericBalanceGate 存在 fail 门禁")
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


static func _catalog_gate() -> Dictionary:
	var errors := BalanceCatalogModel.validation_errors()
	var version := BalanceCatalogModel.balance_snapshot_summary()
	if str(version.get("sourceDigest", "")) == "":
		errors.append("balance source digest 不能为空")
	return _gate(
		"catalog_integrity",
		"数值表结构",
		"pass" if errors.is_empty() else "fail",
		"所有 balance 表字段、引用和区间合法。" if errors.is_empty() else "; ".join(errors),
		{
			"errorCount": errors.size(),
				"balanceSetId": str(version.get("balanceSetId", "")),
				"balanceVersion": str(version.get("balanceVersion", "")),
				"formulaVersion": str(version.get("formulaVersion", "")),
				"sourceDigestShort": str(version.get("sourceDigestShort", "")),
				"sourceCount": int(version.get("sourceCount", 0)),
			}
	)


static func _progression_gate(progression: Dictionary) -> Dictionary:
	var summary := progression.get("summary", {}) as Dictionary
	var sample_count := int((progression.get("samples", []) as Array).size())
	var repeatable_count := int(summary.get("repeatableZones", 0))
	var exp_ok := int(summary.get("expOk", 0))
	var stone_ok := int(summary.get("stoneOk", 0))
	var battle_ok := int(summary.get("battleCountOk", 0))
	var ok := sample_count > 0 and exp_ok == sample_count and stone_ok == sample_count and battle_ok == repeatable_count
	return _gate(
		"progression_targets",
		"区域经验/石币/战数",
		"pass" if ok else "fail",
		"区域收益全部命中当前目标。" if ok else "区域收益目标存在漂移，需要先调 progression_zones 或 reward_economy。",
		{
			"samples": sample_count,
			"expOk": exp_ok,
			"stoneOk": stone_ok,
			"battleCountOk": battle_ok,
			"repeatableZones": repeatable_count,
		}
	)


static func _combat_shadow_gate(combat_shadow: Dictionary) -> Dictionary:
	var errors := CombatFormulaShadowModel.validation_errors(combat_shadow)
	var summary := combat_shadow.get("summary", {}) as Dictionary
	return _gate(
		"combat_shadow_report",
		"战斗公式 shadow 报告健康",
		"pass" if errors.is_empty() else "fail",
		"shadow 样本可用；差异是否允许晋升由 active switch 门禁判断。" if errors.is_empty() else "; ".join(errors),
		{
			"damageSamples": int(summary.get("damageSamples", 0)),
			"rateSamples": int(summary.get("rateSamples", 0)),
			"comboSamples": int(summary.get("comboSamples", 0)),
			"avgAbsDamageDelta": float(summary.get("avgAbsDamageDelta", 0.0)),
			"avgAbsRateDelta": float(summary.get("avgAbsRateDelta", 0.0)),
			"maxAbsDamageDelta": int(summary.get("maxAbsDamageDelta", 0)),
			"maxAbsRateDelta": float(summary.get("maxAbsRateDelta", 0.0)),
			"strictParityReady": bool(summary.get("strictParityReady", false)),
		}
	)


static func _combat_v2_shadow_gate(combat_v2_shadow: Dictionary) -> Dictionary:
	var errors := CombatFormulaCandidateModel.validation_errors(combat_v2_shadow)
	var summary := combat_v2_shadow.get("summary", {}) as Dictionary
	var ready := errors.is_empty() and bool(summary.get("candidateReadyForReview", false))
	return _gate(
		"combat_v2_shadow_candidate",
		"combat_v2 候选观察",
		"pass" if ready else "fail",
		"combat_v2_candidate 影子报告可用于数值评审；真实公式仍保持 combat_v1。" if ready else "; ".join(errors),
		{
			"baselineFormulaId": str(combat_v2_shadow.get("baselineFormulaId", "")),
			"candidateFormulaId": str(combat_v2_shadow.get("candidateFormulaId", "")),
			"sampleCount": int(summary.get("sampleCount", 0)),
			"avgAbsDamageDelta": float(summary.get("avgAbsDamageDelta", 0.0)),
			"avgAbsDamageDeltaRatio": float(summary.get("avgAbsDamageDeltaRatio", 0.0)),
			"avgAbsRateDelta": float(summary.get("avgAbsRateDelta", 0.0)),
			"maxAbsDamageDelta": int(summary.get("maxAbsDamageDelta", 0)),
			"maxAbsRateDelta": float(summary.get("maxAbsRateDelta", 0.0)),
			"criteriaPassed": int(summary.get("criteriaPassed", 0)),
			"criteriaTotal": int(summary.get("criteriaTotal", 0)),
			"candidateReadyForReview": bool(summary.get("candidateReadyForReview", false)),
		}
	)


static func _active_formula_switch_gate(combat_shadow: Dictionary) -> Dictionary:
	var summary := combat_shadow.get("summary", {}) as Dictionary
	var damage_delta := float(summary.get("avgAbsDamageDelta", 999.0))
	var rate_delta := float(summary.get("avgAbsRateDelta", 999.0))
	var max_damage_delta := float(summary.get("maxAbsDamageDelta", 999.0))
	var max_rate_delta := float(summary.get("maxAbsRateDelta", 999.0))
	var ready := (
		damage_delta <= ACTIVE_FORMULA_MAX_AVG_DAMAGE_DELTA
		and rate_delta <= ACTIVE_FORMULA_MAX_AVG_RATE_DELTA
		and max_damage_delta <= ACTIVE_FORMULA_MAX_SINGLE_DAMAGE_DELTA
		and max_rate_delta <= ACTIVE_FORMULA_MAX_SINGLE_RATE_DELTA
	)
	return _gate(
		"combat_formula_active_switch",
		"真实战斗公式晋升",
		"pass" if ready else "blocked",
		"公式差异已低于晋升阈值。" if ready else "当前只适合 shadow 观察，不建议切换真实战斗公式。",
		{
			"avgAbsDamageDelta": damage_delta,
			"avgAbsRateDelta": rate_delta,
			"maxAbsDamageDelta": max_damage_delta,
			"maxAbsRateDelta": max_rate_delta,
			"strictParityReady": bool(summary.get("strictParityReady", false)),
			"maxAvgDamageDelta": ACTIVE_FORMULA_MAX_AVG_DAMAGE_DELTA,
			"maxAvgRateDelta": ACTIVE_FORMULA_MAX_AVG_RATE_DELTA,
			"maxSingleDamageDelta": ACTIVE_FORMULA_MAX_SINGLE_DAMAGE_DELTA,
			"maxSingleRateDelta": ACTIVE_FORMULA_MAX_SINGLE_RATE_DELTA,
		}
	)


static func _battle_simulation_gate(battle_simulation: Dictionary) -> Dictionary:
	var errors := NumericBattleSimulatorModel.validation_errors(battle_simulation)
	var summary := battle_simulation.get("summary", {}) as Dictionary
	var scenario_count := int(summary.get("scenarioCount", 0))
	var expectation_ok := int(summary.get("expectationOk", 0))
	var ok := errors.is_empty() and scenario_count > 0 and expectation_ok == scenario_count
	return _gate(
		"battle_simulation_expectation",
		"固定战斗仿真",
		"pass" if ok else "fail",
		"固定战斗全部满足胜负、回合和血量门槛。" if ok else "; ".join(errors),
		{
			"scenarioCount": scenario_count,
			"expectationOk": expectation_ok,
			"avgRounds": float(summary.get("avgRounds", 0.0)),
			"lowestPlayerHpRatio": float(summary.get("lowestPlayerHpRatio", 0.0)),
			"hardestScenarioId": str(summary.get("hardestScenarioId", "")),
		}
	)


static func _combat_formula_driver_ab_gate(combat_driver_ab: Dictionary) -> Dictionary:
	var errors := CombatFormulaDriverABModel.validation_errors(combat_driver_ab)
	var summary := combat_driver_ab.get("summary", {}) as Dictionary
	var scenario_count := int(summary.get("scenarioCount", 0))
	var mismatch_count := int(summary.get("mismatchCount", 999))
	var ready := errors.is_empty() and scenario_count > 0 and mismatch_count == 0
	return _gate(
		"combat_formula_driver_ab",
		"真实公式驱动 A/B",
		"pass" if ready else "fail",
		"legacy/table 驱动回放完全一致，可作为未来切换前置条件。" if ready else "; ".join(errors),
		{
			"scenarioCount": scenario_count,
			"identicalCount": int(summary.get("identicalCount", 0)),
			"mismatchCount": mismatch_count,
			"maxAbsRoundDelta": int(summary.get("maxAbsRoundDelta", 0)),
			"maxAbsPlayerHpDelta": int(summary.get("maxAbsPlayerHpDelta", 0)),
			"firstMismatchId": str(summary.get("firstMismatchId", "")),
			"driverSwitchReady": bool(summary.get("driverSwitchReady", false)),
		}
	)


static func _economy_ledger_gate(economy_ledger: Dictionary) -> Dictionary:
	var errors := NumericEconomyLedgerModel.validation_errors(economy_ledger)
	var summary := economy_ledger.get("summary", {}) as Dictionary
	var repeatable_count := int(summary.get("repeatableCount", 0))
	var net_ok := int(summary.get("repeatableNetPositive", 0))
	var highest_hour := float(summary.get("highestRepeatableNetStonePerHour", 0.0))
	var hard_ok := errors.is_empty() and repeatable_count > 0 and net_ok == repeatable_count
	var status := "pass"
	var reason := "可重复练级区净收入均为正。"
	if not hard_ok:
		status = "fail"
		reason = "; ".join(errors) if not errors.is_empty() else "可重复练级区存在净收入为负。"
	elif highest_hour > HIGH_ECONOMY_NET_PER_HOUR_WATCH:
		status = "watch"
		reason = "高阶区每小时净收入偏高，进入正式数值策划时需要对应金币回收。"
	return _gate(
		"economy_net_income",
		"经济净收入",
		status,
		reason,
		{
			"repeatableCount": repeatable_count,
			"repeatableNetPositive": net_ok,
			"avgRepeatableNetStonePerBattle": float(summary.get("avgRepeatableNetStonePerBattle", 0.0)),
			"highestRepeatableNetStonePerHour": highest_hour,
			"lowestRepeatableNetScenarioId": str(summary.get("lowestRepeatableNetScenarioId", "")),
			"lowestRepeatableNetStonePerBattle": float(summary.get("lowestRepeatableNetStonePerBattle", 0.0)),
		}
	)


static func _documentation_gate() -> Dictionary:
	var docs := [
		"res://../../docs/phase_123_numeric_table_structure_plan.md",
		"res://../../docs/phase_124_numeric_experiment_baseline.md",
		"res://../../docs/phase_126_combat_formula_shadow_baseline.md",
		"res://../../docs/phase_127_battle_simulation_baseline.md",
		"res://../../docs/phase_128_economy_ledger_baseline.md",
		"res://../../docs/phase_129_numeric_promotion_gate.md",
			"res://../../docs/phase_130_combat_formula_parity_calibration.md",
			"res://../../docs/phase_131_combat_formula_driver.md",
			"res://../../docs/phase_132_combat_formula_driver_switch.md",
			"res://../../docs/phase_133_balance_version_receipt_contract.md",
			"res://../../docs/phase_134_numeric_snapshot_digest_contract.md",
			"res://../../docs/phase_141_riding_battle_closure.md",
			"res://../../docs/phase_142_combat_v2_shadow_candidate.md",
		]
	var missing: Array[String] = []
	for path in docs:
		if not FileAccess.file_exists(path):
			missing.append(ProjectSettings.globalize_path(path).simplify_path())
	return _gate(
		"numeric_docs",
		"数值基线文档",
		"pass" if missing.is_empty() else "fail",
		"关键数值基线文档齐全。" if missing.is_empty() else "缺少文档: %s" % ", ".join(missing),
		{"missingCount": missing.size()}
	)


static func _summary_for_gates(gates: Array[Dictionary]) -> Dictionary:
	var pass_count := 0
	var watch_count := 0
	var blocked_count := 0
	var fail_count := 0
	var active_formula_ready := false
	var driver_ab_ready := false
	var core_validation_ok := true
	for gate in gates:
		var status := str(gate.get("status", ""))
		match status:
			"pass":
				pass_count += 1
			"watch":
				watch_count += 1
			"blocked":
				blocked_count += 1
			"fail":
				fail_count += 1
		if status == "fail":
			core_validation_ok = false
		if str(gate.get("id", "")) == "combat_formula_active_switch":
			active_formula_ready = status == "pass"
		if str(gate.get("id", "")) == "combat_formula_driver_ab":
			driver_ab_ready = status == "pass"
	return {
		"gateCount": gates.size(),
		"passCount": pass_count,
		"watchCount": watch_count,
		"blockedCount": blocked_count,
		"failCount": fail_count,
		"coreValidationOk": core_validation_ok,
		"formulaSwitchReady": active_formula_ready and driver_ab_ready,
		"activeFormulaReady": active_formula_ready,
		"driverABReady": driver_ab_ready,
	}


static func _gate(gate_id: String, label: String, status: String, reason: String, metrics: Dictionary) -> Dictionary:
	return {
		"id": gate_id,
		"label": label,
		"status": status,
		"reason": reason,
		"metrics": metrics,
	}
