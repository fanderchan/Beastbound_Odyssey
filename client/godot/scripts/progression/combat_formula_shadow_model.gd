extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const CombatFormulaModel := preload("res://scripts/progression/combat_formula_model.gd")

const REPORT_SCHEMA_VERSION := 1


static func build_report() -> Dictionary:
	var formula := BalanceCatalogModel.active_combat_formula()
	var samples := _sample_report(formula)
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"mode": "shadow_only",
		"driverModel": "CombatFormulaModel",
		"activeFormulaId": str(formula.get("id", "")),
		"samples": samples,
		"summary": _summary_for_samples(samples),
		"notes": [
			"shadow report 只并排计算 old/new，不改变真实 BattleModel 结果。",
			"old 使用当前 BattleModel 公式；new 使用 combat_formulas.json。",
		],
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "shadow_only":
		errors.append("combatFormulaShadow.mode 必须是 shadow_only")
	var samples: Array = report.get("samples", [])
	if samples.size() < 6:
		errors.append("combatFormulaShadow.samples 数量不足")
	var summary := report.get("summary", {}) as Dictionary
	if int(summary.get("damageSamples", 0)) <= 0:
		errors.append("combatFormulaShadow 缺少伤害样本")
	if int(summary.get("rateSamples", 0)) <= 0:
		errors.append("combatFormulaShadow 缺少概率样本")
	for value in samples:
		if not (value is Dictionary):
			continue
		var sample := value as Dictionary
		if str(sample.get("kind", "")) == "damage" and int(sample.get("oldDamage", 0)) <= 0:
			errors.append("combatFormulaShadow.%s oldDamage 无效" % str(sample.get("id", "")))
		if str(sample.get("kind", "")) == "damage" and int(sample.get("newDamage", 0)) <= 0:
			errors.append("combatFormulaShadow.%s newDamage 无效" % str(sample.get("id", "")))
	return errors


static func _sample_report(formula: Dictionary) -> Array[Dictionary]:
	var samples: Array[Dictionary] = []
	var normal_state := _sample_state(false)
	var guard_state := _sample_state(true)
	samples.append(_damage_sample(
		"normal_attack_even_level",
		"普通攻击同级",
		normal_state,
		"ally_attacker",
		"enemy_target",
		"attack",
		"",
		formula
	))
	samples.append(_damage_sample(
		"pet_skill_charge",
		"宠物伤害技能",
		normal_state,
		"ally_pet",
		"enemy_target",
		"skill_attack",
		BattleModel.PET_SKILL_BUI_CHARGE,
		formula
	))
	samples.append(_damage_sample(
		"guarded_target",
		"防御目标",
		guard_state,
		"ally_attacker",
		"enemy_target",
		"attack",
		"",
		formula
	))
	samples.append(_damage_sample(
		"overleveled_attack_parity",
		"等级差普通攻击",
		normal_state,
		"overleveled_ally",
		"enemy_target",
		"attack",
		"",
		formula
	))
	samples.append(_multi_target_sample(
		"shadow_bow_6_targets",
		"玄影弓 6 目标",
		normal_state,
		"ally_attacker",
		"enemy_target",
		6,
		formula
	))
	samples.append(_multi_target_sample(
		"shadow_bow_10_targets",
		"玄影弓 10 目标",
		normal_state,
		"ally_attacker",
		"enemy_target",
		10,
		formula
	))
	samples.append(_rate_sample("dodge_fast_target", "快速目标回避", normal_state, "ally_attacker", "fast_enemy", "dodge", "", formula))
	samples.append(_rate_sample("critical_fast_attacker", "快速攻击者暴击", normal_state, "fast_ally", "enemy_target", "critical", "", formula))
	samples.append(_combo_sample("ally_combo", "我方合击", normal_state, ["ally_attacker", "ally_pet", "fast_ally"], "enemy_target", formula))
	samples.append(_combo_sample("enemy_combo", "敌方合击", normal_state, ["enemy_target", "fast_enemy"], "ally_attacker", formula))
	samples.append(_status_sample("sleep_status_hit", "催眠命中", normal_state, "ally_pet", "enemy_target", BattleModel.PET_SKILL_SLEEP_POWDER, BattleModel.STATUS_SLEEP, formula))
	samples.append(_status_sample("stone_status_hit_resisted", "石化命中带抗性", normal_state, "ally_pet", "resistant_enemy", BattleModel.PET_SKILL_STONE_GAZE, BattleModel.STATUS_STONE, formula))
	return samples


static func _damage_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, event_type: String, action_id: String, formula: Dictionary) -> Dictionary:
	var old_damage := 0
	if event_type == "skill_attack":
		old_damage = BattleModel.pet_skill_damage_preview_for(state, attacker_id, target_id, action_id)
	else:
		old_damage = BattleModel.attack_damage_preview_for(state, attacker_id, target_id)
	var new_damage := CombatFormulaModel.damage_for_event(formula, state, attacker_id, target_id, event_type, action_id, 1)
	return {
		"id": sample_id,
		"label": label,
		"kind": "damage",
		"eventType": event_type,
		"actionId": action_id,
		"oldDamage": old_damage,
		"newDamage": new_damage,
		"delta": new_damage - old_damage,
		"deltaRatio": _ratio_delta(old_damage, new_damage),
	}


static func _multi_target_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, target_count: int, formula: Dictionary) -> Dictionary:
	var action_id := BattleModel.WEAPON_SHADOW_GROUP_SHOT
	var old_base := BattleModel.attack_damage_preview_for(state, attacker_id, target_id)
	var old_multiplier := BattleActionCatalog.effect_power_multiplier_for(action_id, 1.0)
	var old_damage := maxi(1, int(round(float(old_base) * old_multiplier)))
	var new_damage := CombatFormulaModel.multi_attack_damage_for(formula, state, attacker_id, target_id, action_id, target_count)
	return {
		"id": sample_id,
		"label": label,
		"kind": "damage",
		"eventType": "multi_attack",
		"actionId": action_id,
		"targetCount": target_count,
		"oldDamage": old_damage,
		"newDamage": new_damage,
		"delta": new_damage - old_damage,
		"deltaRatio": _ratio_delta(old_damage, new_damage),
	}


static func _rate_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, rate_kind: String, action_id: String, formula: Dictionary) -> Dictionary:
	var old_rate := 0.0
	var new_rate := 0.0
	match rate_kind:
		"dodge":
			old_rate = BattleModel._dodge_rate_for(state, attacker_id, target_id)
			new_rate = CombatFormulaModel.dodge_rate_for(formula, state, attacker_id, target_id)
		"critical":
			old_rate = BattleModel._critical_rate_for(state, attacker_id, target_id)
			new_rate = CombatFormulaModel.critical_rate_for(formula, state, attacker_id, target_id, action_id)
	return {
		"id": sample_id,
		"label": label,
		"kind": "rate",
		"rateKind": rate_kind,
		"oldRate": snappedf(old_rate, 0.0001),
		"newRate": snappedf(new_rate, 0.0001),
		"delta": snappedf(new_rate - old_rate, 0.0001),
	}


static func _combo_sample(sample_id: String, label: String, state: Dictionary, participant_ids: Array[String], target_id: String, formula: Dictionary) -> Dictionary:
	var first_id := participant_ids[0] if not participant_ids.is_empty() else ""
	var old_rate := BattleModel.combo_chance_for_event(state, {"type": "attack", "attackerId": first_id, "targetId": target_id})
	var new_rate := CombatFormulaModel.combo_rate_for_event(formula, state, {"type": "attack", "attackerId": first_id, "targetId": target_id})
	var old_total := 0
	for participant_id in participant_ids:
		old_total += BattleModel.attack_damage_preview_for(state, participant_id, target_id)
	var old_damage := old_total + 8 * maxi(1, participant_ids.size() - 1)
	var new_damage := CombatFormulaModel.combo_damage_for(formula, state, participant_ids, target_id)
	return {
		"id": sample_id,
		"label": label,
		"kind": "combo",
		"participantCount": participant_ids.size(),
		"oldRate": snappedf(old_rate, 0.0001),
		"newRate": snappedf(new_rate, 0.0001),
		"rateDelta": snappedf(new_rate - old_rate, 0.0001),
		"oldDamage": old_damage,
		"newDamage": new_damage,
		"damageDelta": new_damage - old_damage,
	}


static func _status_sample(sample_id: String, label: String, state: Dictionary, attacker_id: String, target_id: String, action_id: String, status_id: String, formula: Dictionary) -> Dictionary:
	var target := BattleModel.actor_by_id(state, target_id)
	var event := {
		"type": "status",
		"attackerId": attacker_id,
		"targetId": target_id,
		"skillId": action_id,
		"statusId": status_id,
		"statusHitRate": BattleActionCatalog.effect_status_hit_rate_for(action_id, 1.0),
		"sequence": 1,
	}
	var old_check := BattleModel._status_hit_check_for_event(state, event, target, status_id)
	var old_rate := float(old_check.get("chance", 0.0))
	var new_rate := CombatFormulaModel.status_hit_rate_for(formula, state, attacker_id, target_id, action_id, status_id, float(event.get("statusHitRate", -1.0)))
	return {
		"id": sample_id,
		"label": label,
		"kind": "rate",
		"rateKind": "statusHit",
		"actionId": action_id,
		"statusId": status_id,
		"oldRate": snappedf(old_rate, 0.0001),
		"newRate": snappedf(new_rate, 0.0001),
		"delta": snappedf(new_rate - old_rate, 0.0001),
	}

static func _summary_for_samples(samples: Array[Dictionary]) -> Dictionary:
	var damage_count := 0
	var rate_count := 0
	var combo_count := 0
	var total_abs_damage_delta := 0
	var total_abs_rate_delta := 0.0
	var max_abs_damage_delta := 0
	var max_abs_rate_delta := 0.0
	for sample in samples:
		match str(sample.get("kind", "")):
			"damage":
				damage_count += 1
				var delta := absi(int(sample.get("delta", 0)))
				total_abs_damage_delta += delta
				max_abs_damage_delta = maxi(max_abs_damage_delta, delta)
			"rate":
				rate_count += 1
				var delta := absf(float(sample.get("delta", 0.0)))
				total_abs_rate_delta += delta
				max_abs_rate_delta = maxf(max_abs_rate_delta, delta)
			"combo":
				combo_count += 1
				var damage_delta := absi(int(sample.get("damageDelta", 0)))
				var rate_delta := absf(float(sample.get("rateDelta", 0.0)))
				total_abs_damage_delta += damage_delta
				total_abs_rate_delta += rate_delta
				max_abs_damage_delta = maxi(max_abs_damage_delta, damage_delta)
				max_abs_rate_delta = maxf(max_abs_rate_delta, rate_delta)
	return {
		"damageSamples": damage_count,
		"rateSamples": rate_count,
		"comboSamples": combo_count,
		"avgAbsDamageDelta": snappedf(float(total_abs_damage_delta) / float(maxi(1, damage_count + combo_count)), 0.01),
		"avgAbsRateDelta": snappedf(total_abs_rate_delta / float(maxi(1, rate_count + combo_count)), 0.0001),
		"maxAbsDamageDelta": max_abs_damage_delta,
		"maxAbsRateDelta": snappedf(max_abs_rate_delta, 0.0001),
		"strictParityReady": max_abs_damage_delta == 0 and max_abs_rate_delta <= 0.0001,
	}


static func _formula_section(formula: Dictionary, key: String) -> Dictionary:
	var raw_section = formula.get(key, {})
	return raw_section as Dictionary if raw_section is Dictionary else {}


static func _sample_state(guard_target: bool) -> Dictionary:
	var enemy_target := _actor("enemy_target", BattleModel.SIDE_ENEMY, "wild_pet", 80, 620, 74, 46, 92)
	var resistant_enemy := _actor("resistant_enemy", BattleModel.SIDE_ENEMY, "wild_pet", 82, 640, 72, 50, 88)
	resistant_enemy["statusResist"] = {BattleModel.STATUS_STONE: 0.25, "all": 0.05}
	var state := {
		"id": "combat_formula_shadow",
		"targetSeed": "combat_formula_shadow",
		"round": 1,
		"actors": [
			_actor("ally_attacker", BattleModel.SIDE_ALLY, "player", 80, 720, 92, 42, 96),
			_actor("overleveled_ally", BattleModel.SIDE_ALLY, "player", 96, 760, 92, 42, 96),
			_actor("ally_pet", BattleModel.SIDE_ALLY, "pet", 80, 690, 78, 36, 104),
			_actor("fast_ally", BattleModel.SIDE_ALLY, "pet", 80, 580, 70, 34, 145),
			enemy_target,
			_actor("fast_enemy", BattleModel.SIDE_ENEMY, "wild_pet", 80, 560, 68, 38, 150),
			resistant_enemy,
		],
		"guardingActorIds": ["enemy_target"] if guard_target else [],
	}
	return state


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
