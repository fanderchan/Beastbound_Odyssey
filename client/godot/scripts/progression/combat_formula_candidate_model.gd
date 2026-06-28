extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const CombatFormulaModel := preload("res://scripts/progression/combat_formula_model.gd")

const REPORT_SCHEMA_VERSION := 1
const CANDIDATE_FORMULA_ID := "combat_v2_candidate"
const DEFAULT_OUTPUT_PATH := "res://../../.run/godot/combat_v2_shadow_candidate_report.json"


static func build_report(candidate_id: String = CANDIDATE_FORMULA_ID) -> Dictionary:
	BalanceCatalogModel.reload()
	var baseline := BalanceCatalogModel.active_combat_formula()
	var candidate := BalanceCatalogModel.combat_formula_by_id(candidate_id)
	var samples: Array[Dictionary] = []
	if not baseline.is_empty() and not candidate.is_empty():
		samples = _sample_report(baseline, candidate)
	var criteria := _criteria_for(baseline, candidate, samples)
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"mode": "combat_v2_shadow_candidate",
		"baselineFormulaId": str(baseline.get("id", "")),
		"candidateFormulaId": str(candidate.get("id", "")),
		"samples": samples,
		"summary": _summary_for(samples, criteria),
		"criteria": criteria,
		"notes": [
			"本报告只比较 combat_v1 与 combat_v2_candidate 的公式点差异，不改变真实战斗。",
			"combat_v2_candidate 目标：等级差轻微影响伤害，群攻目标数递减，极端回避/暴击上限收敛，状态命中接受敏捷与等级修正。",
			"真实默认公式仍由 combat_formulas.json.activeFormulaId 控制；当前应保持 combat_v1。",
		],
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "combat_v2_shadow_candidate":
		errors.append("combatV2Shadow.mode 必须是 combat_v2_shadow_candidate")
	if str(report.get("baselineFormulaId", "")) == "":
		errors.append("combatV2Shadow 缺少 baselineFormulaId")
	if str(report.get("candidateFormulaId", "")) != CANDIDATE_FORMULA_ID:
		errors.append("combatV2Shadow 缺少 combat_v2_candidate")
	if str(report.get("baselineFormulaId", "")) == str(report.get("candidateFormulaId", "")):
		errors.append("combatV2Shadow baseline/candidate 不能相同")
	var samples: Array = report.get("samples", [])
	if samples.size() < 10:
		errors.append("combatV2Shadow.samples 数量不足")
	var summary := report.get("summary", {}) as Dictionary
	if int(summary.get("invalidSamples", 0)) > 0:
		errors.append("combatV2Shadow 存在无效样本")
	for value in report.get("criteria", []):
		if not (value is Dictionary):
			continue
		var criterion := value as Dictionary
		if not bool(criterion.get("pass", false)):
			errors.append("%s 未通过: %s" % [str(criterion.get("id", "")), str(criterion.get("detail", ""))])
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


static func _sample_report(baseline: Dictionary, candidate: Dictionary) -> Array[Dictionary]:
	var samples: Array[Dictionary] = []
	var normal_state := _sample_state(false)
	var guard_state := _sample_state(true)
	samples.append(_damage_sample("normal_attack", "普通攻击同级", normal_state, "ally_attacker", "enemy_target", "attack", "", 1, baseline, candidate))
	samples.append(_damage_sample("pet_skill_charge", "宠物伤害技能", normal_state, "ally_pet", "enemy_target", "skill_attack", BattleModel.PET_SKILL_BUI_CHARGE, 1, baseline, candidate))
	samples.append(_damage_sample("guarded_target", "防御目标", guard_state, "ally_attacker", "enemy_target", "attack", "", 1, baseline, candidate))
	samples.append(_damage_sample("overleveled_attack", "高等级打低等级", normal_state, "overleveled_ally", "enemy_target", "attack", "", 1, baseline, candidate))
	samples.append(_damage_sample("underleveled_attack", "低等级打高等级", normal_state, "underleveled_ally", "enemy_target", "attack", "", 1, baseline, candidate))
	samples.append(_damage_sample("shadow_bow_6_targets", "玄影弓 6 目标", normal_state, "ally_attacker", "enemy_target", "multi_attack", BattleModel.WEAPON_SHADOW_GROUP_SHOT, 6, baseline, candidate))
	samples.append(_damage_sample("shadow_bow_10_targets", "玄影弓 10 目标", normal_state, "ally_attacker", "enemy_target", "multi_attack", BattleModel.WEAPON_SHADOW_GROUP_SHOT, 10, baseline, candidate))
	samples.append(_rate_sample("dodge_fast_target", "快速目标回避", normal_state, "ally_attacker", "fast_enemy", "dodge", "", baseline, candidate))
	samples.append(_rate_sample("critical_fast_attacker", "快速攻击者暴击", normal_state, "fast_ally", "enemy_target", "critical", "", baseline, candidate))
	samples.append(_combo_sample("ally_combo", "我方合击", normal_state, ["ally_attacker", "ally_pet", "fast_ally"], "enemy_target", baseline, candidate))
	samples.append(_combo_sample("enemy_combo", "敌方合击", normal_state, ["enemy_target", "fast_enemy"], "ally_attacker", baseline, candidate))
	samples.append(_status_sample("sleep_status_hit", "催眠命中", normal_state, "ally_pet", "enemy_target", BattleModel.PET_SKILL_SLEEP_POWDER, BattleModel.STATUS_SLEEP, baseline, candidate))
	samples.append(_status_sample("stone_status_hit_resisted", "石化命中带抗性", normal_state, "ally_pet", "resistant_enemy", BattleModel.PET_SKILL_STONE_GAZE, BattleModel.STATUS_STONE, baseline, candidate))
	return samples


static func _damage_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, event_type: String, action_id: String, target_count: int, baseline: Dictionary, candidate: Dictionary) -> Dictionary:
	var baseline_damage := _damage_for(baseline, state, attacker_id, target_id, event_type, action_id, target_count)
	var candidate_damage := _damage_for(candidate, state, attacker_id, target_id, event_type, action_id, target_count)
	return {
		"id": sample_id,
		"label": label,
		"kind": "damage",
		"eventType": event_type,
		"actionId": action_id,
		"targetCount": target_count,
		"baselineDamage": baseline_damage,
		"candidateDamage": candidate_damage,
		"delta": candidate_damage - baseline_damage,
		"deltaRatio": _ratio_delta(baseline_damage, candidate_damage),
	}


static func _damage_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String, event_type: String, action_id: String, target_count: int) -> int:
	if event_type == "multi_attack":
		return CombatFormulaModel.multi_attack_damage_for(formula, state, attacker_id, target_id, action_id, target_count)
	return CombatFormulaModel.damage_for_event(formula, state, attacker_id, target_id, event_type, action_id, target_count)


static func _rate_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, rate_kind: String, action_id: String, baseline: Dictionary, candidate: Dictionary) -> Dictionary:
	var baseline_rate := 0.0
	var candidate_rate := 0.0
	match rate_kind:
		"dodge":
			baseline_rate = CombatFormulaModel.dodge_rate_for(baseline, state, attacker_id, target_id)
			candidate_rate = CombatFormulaModel.dodge_rate_for(candidate, state, attacker_id, target_id)
		"critical":
			baseline_rate = CombatFormulaModel.critical_rate_for(baseline, state, attacker_id, target_id, action_id)
			candidate_rate = CombatFormulaModel.critical_rate_for(candidate, state, attacker_id, target_id, action_id)
	return {
		"id": sample_id,
		"label": label,
		"kind": "rate",
		"rateKind": rate_kind,
		"baselineRate": snappedf(baseline_rate, 0.0001),
		"candidateRate": snappedf(candidate_rate, 0.0001),
		"delta": snappedf(candidate_rate - baseline_rate, 0.0001),
	}


static func _combo_sample(sample_id: String, label: String, state: Dictionary, participant_ids: Array[String], target_id: String, baseline: Dictionary, candidate: Dictionary) -> Dictionary:
	var first_id := participant_ids[0] if not participant_ids.is_empty() else ""
	var event := {"type": "attack", "attackerId": first_id, "targetId": target_id}
	var baseline_rate := CombatFormulaModel.combo_rate_for_event(baseline, state, event)
	var candidate_rate := CombatFormulaModel.combo_rate_for_event(candidate, state, event)
	var baseline_damage := CombatFormulaModel.combo_damage_for(baseline, state, participant_ids, target_id)
	var candidate_damage := CombatFormulaModel.combo_damage_for(candidate, state, participant_ids, target_id)
	return {
		"id": sample_id,
		"label": label,
		"kind": "combo",
		"participantCount": participant_ids.size(),
		"baselineRate": snappedf(baseline_rate, 0.0001),
		"candidateRate": snappedf(candidate_rate, 0.0001),
		"rateDelta": snappedf(candidate_rate - baseline_rate, 0.0001),
		"baselineDamage": baseline_damage,
		"candidateDamage": candidate_damage,
		"damageDelta": candidate_damage - baseline_damage,
	}


static func _status_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, action_id: String, status_id: String, baseline: Dictionary, candidate: Dictionary) -> Dictionary:
	var base_rate := BattleActionCatalog.effect_status_hit_rate_for(action_id, 1.0)
	var baseline_rate := CombatFormulaModel.status_hit_rate_for(baseline, state, attacker_id, target_id, action_id, status_id, base_rate)
	var candidate_rate := CombatFormulaModel.status_hit_rate_for(candidate, state, attacker_id, target_id, action_id, status_id, base_rate)
	return {
		"id": sample_id,
		"label": label,
		"kind": "rate",
		"rateKind": "statusHit",
		"actionId": action_id,
		"statusId": status_id,
		"baselineRate": snappedf(baseline_rate, 0.0001),
		"candidateRate": snappedf(candidate_rate, 0.0001),
		"delta": snappedf(candidate_rate - baseline_rate, 0.0001),
	}


static func _summary_for(samples: Array[Dictionary], criteria: Array[Dictionary]) -> Dictionary:
	var damage_count := 0
	var rate_count := 0
	var combo_count := 0
	var invalid_count := 0
	var total_abs_damage_delta := 0
	var total_abs_damage_ratio := 0.0
	var total_abs_rate_delta := 0.0
	var max_abs_damage_delta := 0
	var max_abs_rate_delta := 0.0
	for sample in samples:
		match str(sample.get("kind", "")):
			"damage":
				damage_count += 1
				var base_damage := int(sample.get("baselineDamage", 0))
				var candidate_damage := int(sample.get("candidateDamage", 0))
				if base_damage <= 0 or candidate_damage <= 0:
					invalid_count += 1
				var delta := absi(int(sample.get("delta", 0)))
				total_abs_damage_delta += delta
				total_abs_damage_ratio += absf(float(sample.get("deltaRatio", 0.0)))
				max_abs_damage_delta = maxi(max_abs_damage_delta, delta)
			"rate":
				rate_count += 1
				var rate_delta := absf(float(sample.get("delta", 0.0)))
				total_abs_rate_delta += rate_delta
				max_abs_rate_delta = maxf(max_abs_rate_delta, rate_delta)
			"combo":
				combo_count += 1
				var combo_damage_delta := absi(int(sample.get("damageDelta", 0)))
				var combo_rate_delta := absf(float(sample.get("rateDelta", 0.0)))
				total_abs_damage_delta += combo_damage_delta
				total_abs_damage_ratio += absf(_ratio_delta(int(sample.get("baselineDamage", 0)), int(sample.get("candidateDamage", 0))))
				total_abs_rate_delta += combo_rate_delta
				max_abs_damage_delta = maxi(max_abs_damage_delta, combo_damage_delta)
				max_abs_rate_delta = maxf(max_abs_rate_delta, combo_rate_delta)
	var passed := 0
	for criterion in criteria:
		if bool(criterion.get("pass", false)):
			passed += 1
	return {
		"sampleCount": samples.size(),
		"damageSamples": damage_count,
		"rateSamples": rate_count,
		"comboSamples": combo_count,
		"invalidSamples": invalid_count,
		"avgAbsDamageDelta": snappedf(float(total_abs_damage_delta) / float(maxi(1, damage_count + combo_count)), 0.01),
		"avgAbsDamageDeltaRatio": snappedf(total_abs_damage_ratio / float(maxi(1, damage_count + combo_count)), 0.0001),
		"avgAbsRateDelta": snappedf(total_abs_rate_delta / float(maxi(1, rate_count + combo_count)), 0.0001),
		"maxAbsDamageDelta": max_abs_damage_delta,
		"maxAbsRateDelta": snappedf(max_abs_rate_delta, 0.0001),
		"criteriaPassed": passed,
		"criteriaTotal": criteria.size(),
		"candidateReadyForReview": invalid_count == 0 and passed == criteria.size(),
	}


static func _criteria_for(baseline: Dictionary, candidate: Dictionary, samples: Array[Dictionary]) -> Array[Dictionary]:
	var criteria: Array[Dictionary] = []
	criteria.append(_criterion("candidate_present", not candidate.is_empty(), "必须存在 combat_v2_candidate"))
	criteria.append(_criterion("baseline_stays_v1", str(baseline.get("id", "")) == "combat_v1", "默认 activeFormulaId 应继续是 combat_v1"))
	var normal := _sample_by_id(samples, "normal_attack")
	var over := _sample_by_id(samples, "overleveled_attack")
	var under := _sample_by_id(samples, "underleveled_attack")
	var bow6 := _sample_by_id(samples, "shadow_bow_6_targets")
	var bow10 := _sample_by_id(samples, "shadow_bow_10_targets")
	var enemy_combo := _sample_by_id(samples, "enemy_combo")
	var dodge := candidate.get("dodge", {}) as Dictionary
	var critical := candidate.get("critical", {}) as Dictionary
	var status_hit := candidate.get("statusHit", {}) as Dictionary
	criteria.append(_criterion(
		"level_difference_visible",
		int(over.get("candidateDamage", 0)) > int(normal.get("candidateDamage", 0)) and int(under.get("candidateDamage", 0)) < int(normal.get("candidateDamage", 0)),
		"高等级伤害应高于同级，低等级伤害应低于同级"
	))
	criteria.append(_criterion(
		"multi_target_falloff",
		int(bow10.get("candidateDamage", 0)) < int(bow6.get("candidateDamage", 0)) and int(bow10.get("candidateDamage", 0)) < int(bow10.get("baselineDamage", 0)),
		"10 目标群攻应低于 6 目标，且低于 v1 10 目标"
	))
	criteria.append(_criterion(
		"rate_caps_controlled",
		float(dodge.get("maxRate", 1.0)) <= 0.60 and float(critical.get("maxRate", 1.0)) <= 0.40,
		"v2 回避/暴击上限应比 v1 收敛"
	))
	criteria.append(_criterion(
		"status_uses_quick_or_level",
		str(status_hit.get("mode", "")) != "legacy_base_minus_resistance" and (absf(float(status_hit.get("quickDifferenceWeight", 0.0))) > 0.0 or absf(float(status_hit.get("levelDifferenceWeight", 0.0))) > 0.0),
		"状态命中应启用敏捷或等级修正"
	))
	criteria.append(_criterion(
		"monster_combo_softened",
		float(enemy_combo.get("candidateRate", 0.0)) < float(enemy_combo.get("baselineRate", 0.0)),
		"野怪合击率应较 v1 稍微降低"
	))
	return criteria


static func _criterion(criterion_id: String, passed: bool, detail: String) -> Dictionary:
	return {"id": criterion_id, "pass": passed, "detail": detail}


static func _sample_by_id(samples: Array[Dictionary], sample_id: String) -> Dictionary:
	for sample in samples:
		if str(sample.get("id", "")) == sample_id:
			return sample
	return {}


static func _sample_state(guard_target: bool) -> Dictionary:
	var enemy_target := _actor("enemy_target", BattleModel.SIDE_ENEMY, "wild_pet", 80, 620, 74, 46, 92)
	var resistant_enemy := _actor("resistant_enemy", BattleModel.SIDE_ENEMY, "wild_pet", 82, 640, 72, 50, 88)
	resistant_enemy["statusResist"] = {BattleModel.STATUS_STONE: 0.25, "all": 0.05}
	return {
		"id": "combat_v2_shadow_candidate",
		"targetSeed": "combat_v2_shadow_candidate",
		"round": 1,
		"actors": [
			_actor("ally_attacker", BattleModel.SIDE_ALLY, "player", 80, 720, 92, 42, 96),
			_actor("overleveled_ally", BattleModel.SIDE_ALLY, "player", 96, 760, 92, 42, 96),
			_actor("underleveled_ally", BattleModel.SIDE_ALLY, "player", 64, 760, 92, 42, 96),
			_actor("ally_pet", BattleModel.SIDE_ALLY, "pet", 80, 690, 78, 36, 104),
			_actor("fast_ally", BattleModel.SIDE_ALLY, "pet", 80, 580, 70, 34, 145),
			enemy_target,
			_actor("fast_enemy", BattleModel.SIDE_ENEMY, "wild_pet", 80, 560, 68, 38, 150),
			resistant_enemy,
		],
		"guardingActorIds": ["enemy_target"] if guard_target else [],
	}


static func _actor(actor_id: String, side: String, kind: String, level: int, max_hp: int, attack: int, defense: int, quick: int) -> Dictionary:
	return {
		"id": actor_id,
		"name": actor_id,
		"side": side,
		"kind": kind,
		"type": kind,
		"level": level,
		"hp": max_hp,
		"maxHp": max_hp,
		"attack": attack,
		"defense": defense,
		"quick": quick,
	}


static func _ratio_delta(old_value: int, new_value: int) -> float:
	if old_value <= 0:
		return 0.0
	return snappedf((float(new_value) - float(old_value)) / float(old_value), 0.0001)
