extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")

const SIDE_ENEMY := "enemy"
const STATUS_POISON := BattleStatusModel.STATUS_POISON
const STATUS_STONE := BattleStatusModel.STATUS_STONE


static func attack_damage_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String = "") -> int:
	return damage_for_event(formula, state, attacker_id, target_id, "attack", "", 1)


static func skill_damage_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String = "", action_id: String = "") -> int:
	return damage_for_event(formula, state, attacker_id, target_id, "skill_attack", action_id, 1)


static func multi_attack_damage_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String, action_id: String, target_count: int = 1) -> int:
	return damage_for_event(formula, state, attacker_id, target_id, "multi_attack", action_id, target_count)


static func combo_damage_for(formula: Dictionary, state: Dictionary, participant_ids: Array[String], target_id: String) -> int:
	var total := 0
	for participant_id in participant_ids:
		total += attack_damage_for(formula, state, participant_id, target_id)
	var combo := section(formula, "combo")
	var bonus := maxf(0.0, float(combo.get("bonusPerExtraParticipant", 0.0)))
	var flat_bonus := int(combo.get("flatBonusPerExtraParticipant", 0))
	var extra_participants := maxi(0, participant_ids.size() - 1)
	var flat_extra := maxi(1, participant_ids.size() - 1)
	return maxi(1, int(round(float(total) * (1.0 + bonus * float(extra_participants)))) + flat_bonus * flat_extra)


static func damage_for_event(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String, event_type: String, action_id: String = "", target_count: int = 1) -> int:
	var physical := section(formula, "physicalDamage")
	var attacker := actor_by_id(state, attacker_id)
	var target := actor_by_id(state, target_id)
	if attacker.is_empty():
		return 1
	var raw_attack := raw_attack_for_event(physical, state, attacker, event_type, action_id)
	var power_multiplier := float(physical.get("powerMultiplier", 1.0))
	var defense_factor := float(physical.get("defaultDefenseFactor", 0.35))
	var post_defense_multiplier := 1.0
	if event_type == "skill_attack":
		defense_factor = float(physical.get("petSkillDefenseFactor", defense_factor))
	if event_type == "multi_attack":
		var multi := section(formula, "multiTarget")
		var multi_multiplier := multi_target_multiplier_for(formula, action_id, target_count)
		if bool(multi.get("applyPowerMultiplierAfterDefense", false)):
			post_defense_multiplier = multi_multiplier
		else:
			power_multiplier *= multi_multiplier
	var power := float(raw_attack) * power_multiplier
	var defense := defense_for_target(target)
	var defense_cut = defense * defense_factor
	if bool(physical.get("roundDefenseBeforeSubtract", false)):
		defense_cut = float(int(round(defense_cut)))
	var reduced := power - float(defense_cut)
	reduced *= level_multiplier_for(physical, attacker, target)
	if is_actor_guarding(state, target_id):
		var guard_multiplier := float(physical.get("guardMultiplier", 0.45))
		reduced *= guard_multiplier
		if str(physical.get("guardRounding", "")) == "floor":
			reduced = floor(reduced)
	reduced *= post_defense_multiplier
	return maxi(1, int(round(reduced)))


static func raw_attack_for_event(physical: Dictionary, state: Dictionary, attacker: Dictionary, event_type: String, action_id: String) -> int:
	var raw_attack := raw_attack_for_actor(state, attacker) + int(physical.get("flatPower", 0))
	if event_type == "skill_attack":
		raw_attack = int(attacker.get("attack", 12)) + BattleActionCatalog.effect_amount_bonus_for(action_id, 12) + int(physical.get("flatPower", 0))
	return raw_attack


static func raw_attack_for_actor(state: Dictionary, actor: Dictionary) -> int:
	var side := str(actor.get("side", ""))
	var kind := str(actor.get("kind", ""))
	var raw_attack := 5 if side == SIDE_ENEMY and living_actor_count(state, SIDE_ENEMY) > 3 else 10
	if actor.has("attack"):
		raw_attack = int(actor.get("attack", raw_attack))
	elif side != SIDE_ENEMY:
		raw_attack = 18 if kind == "player" else 14
	return raw_attack


static func defense_for_target(target: Dictionary) -> float:
	if target.is_empty():
		return 0.0
	var defense := maxf(0.0, float(target.get("defense", 0)))
	if BattleStatusModel.has_status(target, STATUS_STONE):
		defense *= 2.0
	return defense


static func multi_target_multiplier_for(formula: Dictionary, action_id: String, target_count: int) -> float:
	var base_multiplier := BattleActionCatalog.effect_power_multiplier_for(action_id, 1.0)
	var multi := section(formula, "multiTarget")
	var falloff := maxf(0.0, float(multi.get("targetCountFalloffPerExtra", 0.0)))
	var min_multiplier := maxf(0.0, float(multi.get("minMultiplier", 0.45)))
	var adjusted := base_multiplier - falloff * float(maxi(0, target_count - 1))
	return maxf(min_multiplier, adjusted)


static func level_multiplier_for(physical: Dictionary, attacker: Dictionary, target: Dictionary) -> float:
	var per_level := float(physical.get("levelDifferenceMultiplierPerLevel", 0.0))
	var min_value := float(physical.get("levelMultiplierMin", 1.0))
	var max_value := float(physical.get("levelMultiplierMax", 1.0))
	var attacker_level := int(attacker.get("level", 1))
	var target_level := int(target.get("level", 1))
	return clampf(1.0 + float(attacker_level - target_level) * per_level, min_value, max_value)


static func dodge_rate_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String) -> float:
	var target := actor_by_id(state, target_id)
	if target.has("dodgeRateOverride"):
		return clampf(float(target.get("dodgeRateOverride", 0.0)), 0.0, 1.0)
	if target.has("evasionRateOverride"):
		return clampf(float(target.get("evasionRateOverride", 0.0)), 0.0, 1.0)
	var dodge := section(formula, "dodge")
	if str(dodge.get("mode", "")) == "quick_contest_sqrt":
		return quick_contest_rate_for(
			state,
			target_id,
			attacker_id,
			float(dodge.get("dexDivisor", 0.02)),
			float(dodge.get("minRate", 0.0001)),
			float(dodge.get("maxRate", 0.75)),
			"dodge"
		)
	var attacker := actor_by_id(state, attacker_id)
	var rate := float(dodge.get("baseRate", 0.03))
	rate += (float(target.get("quick", 50)) - float(attacker.get("quick", 50))) * float(dodge.get("quickDifferenceWeight", 0.002))
	rate += float(target.get("dodgeBonus", target.get("evasionBonus", 0.0)))
	return clampf(rate, float(dodge.get("minRate", 0.01)), float(dodge.get("maxRate", 0.35)))


static func critical_rate_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String, action_id: String = "") -> float:
	var attacker := actor_by_id(state, attacker_id)
	if attacker.has("criticalRateOverride"):
		return clampf(float(attacker.get("criticalRateOverride", 0.0)), 0.0, 1.0)
	var critical := section(formula, "critical")
	if str(critical.get("mode", "")) == "quick_contest_sqrt":
		return quick_contest_rate_for(
			state,
			attacker_id,
			target_id,
			float(critical.get("dexDivisor", 0.09)),
			float(critical.get("minRate", 0.0)),
			float(critical.get("maxRate", 1.0)),
			"critical"
		)
	var target := actor_by_id(state, target_id)
	var rate := float(critical.get("baseRate", 0.05))
	rate += (float(attacker.get("quick", 50)) - float(target.get("quick", 50))) * float(critical.get("quickDifferenceWeight", 0.0015))
	rate += float(attacker.get("criticalBonus", 0.0))
	return clampf(rate, float(critical.get("minRate", 0.0)), float(critical.get("maxRate", 0.35)))


static func quick_contest_rate_for(state: Dictionary, favored_id: String, opposing_id: String, divisor: float, min_rate: float, max_rate: float, bonus_kind: String) -> float:
	var favored := actor_by_id(state, favored_id)
	var opposing := actor_by_id(state, opposing_id)
	if favored.is_empty() or opposing.is_empty():
		return min_rate
	var favored_quick := maxf(1.0, float(favored.get("quick", 50)))
	var opposing_quick := maxf(1.0, float(opposing.get("quick", 50)))
	var big := maxf(favored_quick, opposing_quick)
	var small := minf(favored_quick, opposing_quick)
	var ratio := 1.0 if favored_quick >= opposing_quick else small / big
	var work := maxf(0.0, (big - small) / maxf(0.001, divisor))
	var chance_percent := sqrt(work) * ratio
	match bonus_kind:
		"dodge":
			chance_percent += float(favored.get("luck", 0.0))
			chance_percent += float(favored.get("dodgeBonus", favored.get("evasionBonus", 0.0)))
		"critical":
			chance_percent += float(favored.get("luck", 0.0))
			chance_percent += float(favored.get("criticalBonus", 0.0))
	return clampf(chance_percent / 100.0, min_rate, max_rate)


static func combo_rate_for_event(formula: Dictionary, state: Dictionary, event: Dictionary) -> float:
	if str(event.get("type", "")) != "attack":
		return 0.0
	var attacker := actor_by_id(state, str(event.get("attackerId", "")))
	if attacker.is_empty():
		return 0.0
	if event.has("comboRateOverride"):
		return clampf(rate_value(event.get("comboRateOverride"), 0.0), 0.0, 1.0)
	if attacker.has("comboRateOverride"):
		return clampf(rate_value(attacker.get("comboRateOverride"), 0.0), 0.0, 1.0)
	var chance := combo_base_rate_for_actor(formula, attacker)
	chance += rate_value(state.get("comboBonusRate", 0.0), 0.0)
	var side_bonus_map = state.get("comboBonusRateBySide", {})
	if side_bonus_map is Dictionary:
		chance += rate_value((side_bonus_map as Dictionary).get(str(attacker.get("side", "")), 0.0), 0.0)
	chance += rate_value(attacker.get("comboBonusRate", attacker.get("comboBonus", 0.0)), 0.0)
	chance += rate_value(event.get("comboBonusRate", event.get("comboBonus", 0.0)), 0.0)
	return clampf(chance, 0.0, 1.0)


static func combo_base_rate_for_actor(formula: Dictionary, actor: Dictionary) -> float:
	if actor.has("comboBaseRateOverride"):
		return clampf(rate_value(actor.get("comboBaseRateOverride"), float(section(formula, "combo").get("allyBaseRate", 0.50))), 0.0, 1.0)
	var combo := section(formula, "combo")
	var combo_class := str(actor.get("comboClass", "")).to_lower()
	if ["monster", "wild", "wild_pet", "enemy"].has(combo_class):
		return float(combo.get("monsterBaseRate", 0.20))
	if ["combatant", "player", "pet", "pvp"].has(combo_class):
		return float(combo.get("allyBaseRate", 0.50))
	var stoneage_type := str(actor.get("stoneAgeType", "")).to_lower()
	if ["enemy", "char_typeenemy", "char_type_enemy"].has(stoneage_type):
		return float(combo.get("monsterBaseRate", 0.20))
	if ["player", "pet", "char_typeplayer", "char_type_player", "char_typepet", "char_type_pet"].has(stoneage_type):
		return float(combo.get("allyBaseRate", 0.50))
	var kind := str(actor.get("kind", "")).to_lower()
	if ["wild_pet", "enemy", "wild", "monster"].has(kind):
		return float(combo.get("monsterBaseRate", 0.20))
	return float(combo.get("allyBaseRate", 0.50))


static func status_hit_rate_for(formula: Dictionary, state: Dictionary, attacker_id: String, target_id: String, action_id: String, status_id: String, override_rate: float = -1.0) -> float:
	var status_hit := section(formula, "statusHit")
	var target := actor_by_id(state, target_id)
	var base_rate := BattleActionCatalog.effect_status_hit_rate_for(action_id, 1.0) if action_id != "" else 1.0
	if override_rate >= 0.0:
		base_rate = override_rate
	var resistance := status_resistance_for_actor(target, status_id)
	if str(status_hit.get("mode", "")) == "legacy_base_minus_resistance":
		return clampf(base_rate - resistance, 0.0, 1.0)
	var attacker := actor_by_id(state, attacker_id)
	var quick_bonus := (float(attacker.get("quick", 50)) - float(target.get("quick", 50))) * float(status_hit.get("quickDifferenceWeight", 0.0))
	quick_bonus = clampf(quick_bonus, float(status_hit.get("quickDifferenceBonusMin", -0.05)), float(status_hit.get("quickDifferenceBonusMax", 0.05)))
	var level_bonus := float(int(attacker.get("level", 1)) - int(target.get("level", 1))) * float(status_hit.get("levelDifferenceWeight", 0.0))
	var max_rate := float(status_hit.get("poisonMaxRate", 1.0)) if status_id == STATUS_POISON else float(status_hit.get("controlMaxRate", 1.0))
	return clampf(base_rate + quick_bonus + level_bonus - resistance, 0.0, max_rate)


static func status_resistance_for_actor(actor: Dictionary, status_id: String) -> float:
	var raw_resist = actor.get("statusResist", {})
	if not (raw_resist is Dictionary):
		return 0.0
	var resist := raw_resist as Dictionary
	if resist.has(status_id):
		return clampf(float(resist.get(status_id, 0.0)), 0.0, 1.0)
	return clampf(float(resist.get("all", 0.0)), 0.0, 1.0)


static func rate_value(value, fallback: float) -> float:
	var value_type := typeof(value)
	if value_type != TYPE_FLOAT and value_type != TYPE_INT:
		return fallback
	var rate := float(value)
	if absf(rate) > 1.0:
		rate *= 0.01
	return rate


static func actor_by_id(state: Dictionary, actor_id: String) -> Dictionary:
	if actor_id == "":
		return {}
	var actors: Array = state.get("actors", [])
	for value in actors:
		if value is Dictionary and str((value as Dictionary).get("id", "")) == actor_id:
			return value as Dictionary
	return {}


static func living_actor_count(state: Dictionary, side: String) -> int:
	var count := 0
	var actors: Array = state.get("actors", [])
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if str(actor.get("side", "")) == side and int(actor.get("hp", 0)) > 0:
			count += 1
	return count


static func is_actor_guarding(state: Dictionary, actor_id: String) -> bool:
	for value in state.get("guardingActorIds", []):
		if str(value) == actor_id:
			return true
	return false


static func section(formula: Dictionary, key: String) -> Dictionary:
	var raw_section = formula.get(key, {})
	return raw_section as Dictionary if raw_section is Dictionary else {}
