extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetIndividualGrowthModel := preload("res://scripts/progression/pet_individual_growth_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")

const REPORT_SCHEMA_VERSION := 1
const DEFAULT_OUTPUT_PATH := "res://../../.run/godot/numeric_battle_simulation_report.json"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const ALLY_BACK_SLOTS: Array[int] = [8, 7, 9, 6, 10]
const ALLY_FRONT_SLOTS: Array[int] = [3, 2, 4, 1, 5]


static func build_report() -> Dictionary:
	BalanceCatalogModel.reload()
	var suite := BalanceCatalogModel.active_battle_simulation_suite()
	var samples: Array[Dictionary] = []
	for scenario in BalanceCatalogModel.battle_simulation_scenario_list():
		samples.append(simulate_scenario(scenario, int(suite.get("roundLimit", 30))))
	var summary := _summary_for_samples(samples)
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"suiteId": str(suite.get("id", "")),
		"label": str(suite.get("label", "")),
		"mode": "deterministic_fixed_seed",
		"samples": samples,
		"summary": summary,
		"notes": [
			"本报告用真实 BattleModel 事件和 apply_battle_event 跑固定样本。",
			"它验证数值区间和风险，不代表完整挂机 AI、补给策略或玩家手操。",
			"人物和宠物按等级段生成推荐练级基线，敌人来自 battle_simulation_scenarios.json。",
		],
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "deterministic_fixed_seed":
		errors.append("numericBattleSimulation.mode 必须是 deterministic_fixed_seed")
	var samples: Array = report.get("samples", [])
	if samples.size() < 6:
		errors.append("numericBattleSimulation.samples 数量不足")
	var summary := report.get("summary", {}) as Dictionary
	if int(summary.get("scenarioCount", 0)) != samples.size():
		errors.append("numericBattleSimulation.summary.scenarioCount 不匹配")
	if int(summary.get("invalidCount", 0)) > 0:
		errors.append("numericBattleSimulation 存在无效样本")
	if int(summary.get("failureCount", 0)) > 0:
		errors.append("numericBattleSimulation 存在失败样本")
	if int(summary.get("timeoutCount", 0)) > 0:
		errors.append("numericBattleSimulation 存在超时样本")
	if int(summary.get("expectationOk", 0)) < samples.size():
		errors.append("numericBattleSimulation 存在不满足 expect 的样本")
	for value in samples:
		if not (value is Dictionary):
			continue
		var sample := value as Dictionary
		if int(sample.get("rounds", 0)) <= 0:
			errors.append("%s.rounds 无效" % str(sample.get("id", "")))
		if int(sample.get("initialEnemyCount", 0)) <= 0:
			errors.append("%s.initialEnemyCount 无效" % str(sample.get("id", "")))
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


static func simulate_scenario(
	scenario: Dictionary,
	suite_round_limit: int = 30,
	formula_driver: String = BattleModel.COMBAT_FORMULA_DRIVER_LEGACY,
	combat_formula: Dictionary = {},
	include_event_digest: bool = false
) -> Dictionary:
	var state := _state_for_scenario(scenario)
	state = BattleModel.with_combat_formula_driver(state, formula_driver, combat_formula)
	var expect := scenario.get("expect", {}) as Dictionary if scenario.get("expect", {}) is Dictionary else {}
	var max_rounds := clampi(int(expect.get("maxRounds", suite_round_limit)), 1, maxi(1, suite_round_limit))
	var initial_player := BattleModel.actor_by_id(state, BattleModel.PLAYER_ACTOR_ID)
	var initial_player_hp := maxi(1, int(initial_player.get("hp", initial_player.get("maxHp", 1))))
	var initial_enemy_count := BattleModel.living_actor_count(state, BattleModel.SIDE_ENEMY)
	var metrics := {
		"events": 0,
		"damageByAlly": 0,
		"damageByEnemy": 0,
		"damageToPlayer": 0,
		"playerPhysicalAttackEvents": 0,
		"playerHitEvents": 0,
		"allyPhysicalAttackEvents": 0,
		"enemyHitEvents": 0,
		"comboEvents": 0,
		"criticalEvents": 0,
		"dodgeEvents": 0,
		"launchEvents": 0,
		"counterEvents": 0,
	}
	var event_digest: Array[String] = []
	var rounds := 0
	for _round_index in range(max_rounds):
		if _state_should_end(state):
			break
		rounds += 1
		state["round"] = rounds
		state["targetSeed"] = "%s:round:%d" % [str(scenario.get("id", "")), rounds]
		var target_id := _preferred_enemy_target_id(state)
		var player_command := {"command": "attack", "targetId": target_id}
		var pet_command := {"command": "attack", "targetId": target_id}
		var events := BattleModel.build_player_pet_round_events(state, player_command, pet_command)
		for event in events:
			if _state_should_end(state):
				break
			state = _apply_and_record_event(state, event, metrics, event_digest)
		if not _state_should_end(state):
			for status_event in BattleModel.build_round_end_status_events(state):
				if _state_should_end(state):
					break
				state = _apply_and_record_event(state, status_event, metrics, event_digest)
		state = BattleModel.reset_action_states(state)
		state = BattleModel.decrement_field_effects(state)
	var result := _result_for_state(state, rounds, max_rounds)
	var player := BattleModel.actor_by_id(state, BattleModel.PLAYER_ACTOR_ID)
	var player_hp := maxi(0, int(player.get("hp", 0))) if not player.is_empty() else 0
	var player_max_hp := maxi(1, int(player.get("maxHp", initial_player_hp))) if not player.is_empty() else initial_player_hp
	var remaining_ratio := snappedf(float(player_hp) / float(player_max_hp), 0.0001)
	var reward_group_id := str(scenario.get("progressionZoneId", ""))
	var reward_state := state.duplicate(true)
	reward_state["sourceEncounterGroupId"] = _encounter_group_for_progression_zone(reward_group_id)
	reward_state["sourceRewardTableId"] = _reward_table_for_progression_zone(reward_group_id)
	var avg_exp := PlayerProgressModel.battle_exp_reward(reward_state)
	var stone_coins := BattleRewardCatalog.stone_coins_for_state(reward_state)
	var expectation := _expectation_result(expect, result, rounds, remaining_ratio)
	var sample := {
		"id": str(scenario.get("id", "")),
		"label": str(scenario.get("label", scenario.get("id", ""))),
		"combatFormulaDriver": formula_driver,
		"progressionZoneId": reward_group_id,
		"partySize": int(scenario.get("partySize", 1)),
		"playerLevel": int(scenario.get("playerLevel", 1)),
		"petLevel": int(scenario.get("petLevel", 1)),
		"enemyLevel": int(scenario.get("enemyLevel", 1)),
		"initialEnemyCount": initial_enemy_count,
		"result": result,
		"rounds": rounds,
		"maxRounds": max_rounds,
		"playerHp": player_hp,
		"playerMaxHp": player_max_hp,
		"playerHpRatio": remaining_ratio,
		"livingAllies": BattleModel.living_actor_count(state, BattleModel.SIDE_ALLY),
		"livingEnemies": BattleModel.living_actor_count(state, BattleModel.SIDE_ENEMY),
		"metrics": metrics.duplicate(true),
		"rewardPreview": {
			"exp": avg_exp,
			"stoneCoins": stone_coins,
			"encounterGroupId": str(reward_state.get("sourceEncounterGroupId", "")),
			"rewardTableId": str(reward_state.get("sourceRewardTableId", "")),
		},
		"expectation": expectation,
	}
	if include_event_digest:
		sample["eventDigest"] = event_digest
	return sample


static func _apply_and_record_event(state: Dictionary, event: Dictionary, metrics: Dictionary, event_digest: Array[String] = []) -> Dictionary:
	var next_state := BattleModel.apply_battle_event(state, event)
	_record_applied_event(next_state, event, metrics, event_digest)
	var counter_event: Dictionary = {}
	var raw_counter_event = next_state.get("lastCounterEvent", {})
	if raw_counter_event is Dictionary:
		counter_event = raw_counter_event as Dictionary
	if not counter_event.is_empty():
		metrics["counterEvents"] = int(metrics.get("counterEvents", 0)) + 1
		next_state = BattleModel.apply_battle_event(next_state, counter_event)
		_record_applied_event(next_state, counter_event, metrics, event_digest)
	return next_state


static func _record_applied_event(state: Dictionary, event: Dictionary, metrics: Dictionary, event_digest: Array[String] = []) -> void:
	if not bool(state.get("lastEventApplied", false)):
		return
	metrics["events"] = int(metrics.get("events", 0)) + 1
	var event_type := str(event.get("type", ""))
	if event_type == "combo_attack":
		metrics["comboEvents"] = int(metrics.get("comboEvents", 0)) + 1
	if bool(state.get("lastCritical", false)):
		metrics["criticalEvents"] = int(metrics.get("criticalEvents", 0)) + 1
	if bool(state.get("lastDodged", false)):
		metrics["dodgeEvents"] = int(metrics.get("dodgeEvents", 0)) + 1
	if bool(state.get("lastLaunch", false)):
		metrics["launchEvents"] = int(metrics.get("launchEvents", 0)) + 1
	var damage := maxi(0, int(state.get("lastDamage", 0)))
	var attacker := BattleModel.actor_by_id(state, str(state.get("lastAttackerId", event.get("attackerId", ""))))
	var side := str(attacker.get("side", ""))
	if side == BattleModel.SIDE_ALLY:
		metrics["damageByAlly"] = int(metrics.get("damageByAlly", 0)) + damage
	elif side == BattleModel.SIDE_ENEMY:
		metrics["damageByEnemy"] = int(metrics.get("damageByEnemy", 0)) + damage
	var target_id := str(state.get("lastTargetId", event.get("targetId", "")))
	if _is_physical_weapon_event(event_type):
		if str(attacker.get("id", "")) == BattleModel.PLAYER_ACTOR_ID:
			metrics["playerPhysicalAttackEvents"] = int(metrics.get("playerPhysicalAttackEvents", 0)) + 1
		if side == BattleModel.SIDE_ALLY:
			metrics["allyPhysicalAttackEvents"] = int(metrics.get("allyPhysicalAttackEvents", 0)) + 1
	if target_id == BattleModel.PLAYER_ACTOR_ID and side == BattleModel.SIDE_ENEMY and damage > 0:
		metrics["damageToPlayer"] = int(metrics.get("damageToPlayer", 0)) + damage
		metrics["playerHitEvents"] = int(metrics.get("playerHitEvents", 0)) + 1
	if side == BattleModel.SIDE_ENEMY and damage > 0:
		metrics["enemyHitEvents"] = int(metrics.get("enemyHitEvents", 0)) + 1
	event_digest.append(_event_digest_entry(state, event))


static func _event_digest_entry(state: Dictionary, event: Dictionary) -> String:
	var target_id := str(state.get("lastTargetId", event.get("targetId", "")))
	var target := BattleModel.actor_by_id(state, target_id)
	return "%s|%s>%s|d=%d|hp=%d|dod=%s|crit=%s|launch=%s|status=%s" % [
		str(event.get("type", "")),
		str(state.get("lastAttackerId", event.get("attackerId", ""))),
		target_id,
		int(state.get("lastDamage", 0)),
		int(target.get("hp", -1)) if not target.is_empty() else -1,
		str(bool(state.get("lastDodged", false))),
		str(bool(state.get("lastCritical", false))),
		str(bool(state.get("lastLaunch", false))),
		str(state.get("lastStatusResult", "")),
	]


static func _is_physical_weapon_event(event_type: String) -> bool:
	return ["attack", "multi_attack", "combo_attack", "counter_attack"].has(event_type)


static func _state_for_scenario(scenario: Dictionary) -> Dictionary:
	var actors: Array[Dictionary] = []
	var party_size := clampi(int(scenario.get("partySize", 1)), 1, 5)
	var player_level := clampi(int(scenario.get("playerLevel", 1)), 1, BalanceCatalogModel.max_player_level(PlayerProgressModel.MAX_PLAYER_LEVEL))
	var pet_level := clampi(int(scenario.get("petLevel", player_level)), 1, BalanceCatalogModel.max_pet_level(PlayerProgressModel.MAX_PET_LEVEL))
	var pet_form_id := str(scenario.get("petFormId", "bui_normal_red_fire10"))
	for index in range(party_size):
		actors.append(_player_actor_for(index, player_level, party_size))
		actors.append(_pet_actor_for(index, pet_level, pet_form_id))
	var enemy_count := clampi(int(scenario.get("enemyCount", 1)), 1, 10)
	var enemy_stats := scenario.get("enemyStats", {}) as Dictionary if scenario.get("enemyStats", {}) is Dictionary else {}
	var enemy_level := clampi(int(scenario.get("enemyLevel", 1)), 1, BalanceCatalogModel.max_pet_level(PlayerProgressModel.MAX_PET_LEVEL))
	for index in range(enemy_count):
		actors.append(_enemy_actor_for(index, enemy_count, enemy_level, enemy_stats, str(scenario.get("id", "scenario"))))
	return {
		"id": "numeric_battle_%s" % str(scenario.get("id", "scenario")),
		"formationTemplate": BattleModel.FORMATION_TEMPLATE_10V10,
		"round": 1,
		"phase": "command",
		"sourceZoneId": str(scenario.get("progressionZoneId", "")),
		"targetSeed": str(scenario.get("id", "scenario")),
		"message": "%s 数值仿真。" % str(scenario.get("label", "战斗")),
		"itemBag": BattleModel.default_item_bag(),
		"captureToolBag": {},
		"fieldEffects": [],
		"guardingActorIds": [],
		"actors": actors,
	}


static func _player_actor_for(index: int, level: int, party_size: int) -> Dictionary:
	var stats := _player_stats_for_level(level, index)
	var slot_number := ALLY_BACK_SLOTS[clampi(index, 0, ALLY_BACK_SLOTS.size() - 1)]
	var actor_id := BattleModel.PLAYER_ACTOR_ID if index == 0 else "ally_partner_%d" % index
	var label := "数值猎人" if index == 0 else "陪练伙伴%d" % index
	return {
		"id": actor_id,
		"name": label,
		"side": BattleModel.SIDE_ALLY,
		"kind": "player",
		"type": "player",
		"slotId": BattleModel.slot_id_for_number(BattleModel.SIDE_ALLY, slot_number),
		"level": level,
		"hp": int(stats.get("maxHp", 1)),
		"maxHp": int(stats.get("maxHp", 1)),
		"attack": int(stats.get("attack", 1)),
		"defense": int(stats.get("defense", 1)),
		"quick": int(stats.get("quick", 1)),
		"comboClass": "combatant",
		"teamSize": party_size,
	}


static func _pet_actor_for(index: int, level: int, form_id: String) -> Dictionary:
	var stats := _pet_stats_for_level(form_id, level, "numeric_pet_%d_%d" % [index, level])
	var slot_number := ALLY_FRONT_SLOTS[clampi(index, 0, ALLY_FRONT_SLOTS.size() - 1)]
	var actor_id := BattleModel.PLAYER_PET_ID if index == 0 else "ally_partner_pet_%d" % index
	var label := "数值宠物" if index == 0 else "陪练宠物%d" % index
	return {
		"id": actor_id,
		"name": label,
		"side": BattleModel.SIDE_ALLY,
		"kind": "pet",
		"type": "pet",
		"slotId": BattleModel.slot_id_for_number(BattleModel.SIDE_ALLY, slot_number),
		"level": level,
		"hp": int(stats.get("maxHp", 1)),
		"maxHp": int(stats.get("maxHp", 1)),
		"attack": int(stats.get("attack", 1)),
		"defense": int(stats.get("defense", 1)),
		"quick": int(stats.get("quick", 1)),
		"formId": form_id,
		"comboClass": "pet",
		"petBattleState": BattleModel.PET_STATE_BATTLE,
		"combatPower": int(PetPowerModel.combat_power_for_stats(stats)),
	}


static func _enemy_actor_for(index: int, enemy_count: int, level: int, stats: Dictionary, scenario_id: String) -> Dictionary:
	var slot_number := _enemy_slot_number_for(index, enemy_count)
	var max_hp := maxi(1, int(stats.get("maxHp", stats.get("hp", 80))))
	var stat_offset := float(index) * 0.015
	return {
		"id": "enemy_%02d" % index,
		"name": "数值敌人%d" % (index + 1),
		"side": BattleModel.SIDE_ENEMY,
		"kind": "wild_pet",
		"type": "pet",
		"slotId": BattleModel.slot_id_for_number(BattleModel.SIDE_ENEMY, slot_number),
		"level": level,
		"hp": max_hp,
		"maxHp": max_hp,
		"attack": maxi(1, int(round(float(stats.get("attack", 10)) * (1.0 + stat_offset)))),
		"defense": maxi(1, int(round(float(stats.get("defense", 6)) * (1.0 + stat_offset)))),
		"quick": maxi(1, int(round(float(stats.get("quick", 50)) * (1.0 + stat_offset)))),
		"formId": str(stats.get("formId", "wuli_normal_orange_fire10")),
		"comboClass": "monster",
		"catchable": true,
		"captureDifficulty": maxi(1, int(stats.get("captureDifficulty", 44 + level))),
		"scenarioId": scenario_id,
	}


static func _player_stats_for_level(level: int, index: int) -> Dictionary:
	var stats := BalanceCatalogModel.default_player_battle_stats(PlayerProgressModel.DEFAULT_PLAYER_BATTLE_STATS)
	var points := maxi(0, level - 1) * BalanceCatalogModel.stat_points_per_level(PlayerProgressModel.PLAYER_STAT_POINTS_PER_LEVEL)
	var hp_points := int(round(float(points) * 0.42))
	var attack_points := int(round(float(points) * 0.26))
	var defense_points := int(round(float(points) * 0.16))
	var quick_points := maxi(0, points - hp_points - attack_points - defense_points)
	stats["maxHp"] = int(stats.get("maxHp", 120)) + hp_points * BalanceCatalogModel.player_stat_point_gain("maxHp", 4)
	stats["attack"] = int(stats.get("attack", 18)) + attack_points * BalanceCatalogModel.player_stat_point_gain("attack", 1)
	stats["defense"] = int(stats.get("defense", 6)) + defense_points * BalanceCatalogModel.player_stat_point_gain("defense", 1)
	stats["quick"] = int(stats.get("quick", 70)) + quick_points * BalanceCatalogModel.player_stat_point_gain("quick", 1)
	var level_bonus := float(maxi(0, level - 1))
	stats["maxHp"] = int(stats.get("maxHp", 1)) + int(round(level_bonus * 2.0))
	stats["attack"] = int(stats.get("attack", 1)) + int(round(level_bonus * 0.35))
	stats["defense"] = int(stats.get("defense", 1)) + int(round(level_bonus * 0.22))
	stats["quick"] = int(stats.get("quick", 1)) + int(round(level_bonus * 0.12))
	if index > 0:
		var scale := 0.92 + float(index % 3) * 0.03
		for key in STAT_KEYS:
			stats[key] = maxi(1, int(round(float(stats.get(key, 1)) * scale)))
	return stats


static func _pet_stats_for_level(form_id: String, level: int, seed: String) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	if template.is_empty():
		return {"maxHp": 90 + level * 7, "attack": 14 + level * 2, "defense": 8 + level, "quick": 68 + level}
	var growth_profile_id := str(template.get("growthProfileId", "balanced"))
	var growth_rates := BalanceCatalogModel.pet_growth_rates(growth_profile_id, {})
	var variance := {
		"schemaVersion": PetIndividualGrowthModel.SCHEMA_VERSION,
		"qualityRoll": 6800,
		"initialBonus": {"maxHp": 1, "attack": 0, "defense": 0, "quick": 1},
		"growthBonus": {"maxHp": 0.08, "attack": 0.03, "defense": 0.02, "quick": 0.03},
	}
	var snapshot := PetIndividualGrowthModel.growth_snapshot(template, {
		"instanceId": seed,
		"formId": form_id,
		"individualSeed": seed,
		"individualVariance": variance,
	}, level, growth_rates, seed)
	return snapshot.get("finalStats", {}) as Dictionary


static func _enemy_slot_number_for(index: int, enemy_count: int) -> int:
	var order := [1, 2, 6, 3, 7, 4, 8, 5, 9, 10]
	if enemy_count >= 8:
		order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
	return int(order[clampi(index, 0, order.size() - 1)])


static func _preferred_enemy_target_id(state: Dictionary) -> String:
	var ordered := BattleModel.living_actor_ids_by_battle_order(state, BattleModel.SIDE_ENEMY)
	return ordered[0] if not ordered.is_empty() else ""


static func _state_should_end(state: Dictionary) -> bool:
	return (
		PlayerProgressModel.battle_actor_knocked_away(state, BattleModel.PLAYER_ACTOR_ID)
		or BattleModel.living_enemy_id(state) == ""
		or BattleModel.living_ally_id(state) == ""
	)


static func _result_for_state(state: Dictionary, rounds: int, max_rounds: int) -> String:
	if PlayerProgressModel.battle_actor_knocked_away(state, BattleModel.PLAYER_ACTOR_ID):
		return "knockaway"
	if BattleModel.living_enemy_id(state) == "":
		return "victory"
	if BattleModel.living_ally_id(state) == "":
		return "defeat"
	if rounds >= max_rounds:
		return "timeout"
	return "running"


static func _expectation_result(expect: Dictionary, result: String, rounds: int, player_hp_ratio: float) -> Dictionary:
	var expected_result := str(expect.get("result", "victory"))
	var min_rounds := int(expect.get("minRounds", 1))
	var max_rounds := int(expect.get("maxRounds", 999))
	var min_ratio := float(expect.get("minPlayerHpRatio", 0.0))
	var result_ok := result == expected_result
	var rounds_ok := rounds >= min_rounds and rounds <= max_rounds
	var hp_ok := player_hp_ratio >= min_ratio
	return {
		"ok": result_ok and rounds_ok and hp_ok,
		"expectedResult": expected_result,
		"resultOk": result_ok,
		"minRounds": min_rounds,
		"maxRounds": max_rounds,
		"roundsOk": rounds_ok,
		"minPlayerHpRatio": min_ratio,
		"playerHpOk": hp_ok,
	}


static func _encounter_group_for_progression_zone(zone_id: String) -> String:
	for zone in BalanceCatalogModel.progression_zone_list():
		if str(zone.get("id", "")) == zone_id:
			return str(zone.get("encounterGroupId", ""))
	return ""


static func _reward_table_for_progression_zone(zone_id: String) -> String:
	for zone in BalanceCatalogModel.progression_zone_list():
		if str(zone.get("id", "")) == zone_id:
			return str(zone.get("rewardTableId", zone.get("encounterGroupId", "")))
	return ""


static func _summary_for_samples(samples: Array[Dictionary]) -> Dictionary:
	var victory_count := 0
	var failure_count := 0
	var timeout_count := 0
	var knockaway_count := 0
	var invalid_count := 0
	var expectation_ok := 0
	var total_rounds := 0
	var total_player_hp_ratio := 0.0
	var hardest_id := ""
	var lowest_hp_ratio := 2.0
	for sample in samples:
		var result := str(sample.get("result", ""))
		match result:
			"victory":
				victory_count += 1
			"defeat":
				failure_count += 1
			"timeout":
				timeout_count += 1
			"knockaway":
				knockaway_count += 1
			_:
				invalid_count += 1
		if bool((sample.get("expectation", {}) as Dictionary).get("ok", false)):
			expectation_ok += 1
		var rounds := maxi(0, int(sample.get("rounds", 0)))
		var ratio := float(sample.get("playerHpRatio", 0.0))
		total_rounds += rounds
		total_player_hp_ratio += ratio
		if ratio < lowest_hp_ratio:
			lowest_hp_ratio = ratio
			hardest_id = str(sample.get("id", ""))
	var count := maxi(1, samples.size())
	return {
		"scenarioCount": samples.size(),
		"victoryCount": victory_count,
		"failureCount": failure_count,
		"timeoutCount": timeout_count,
		"knockawayCount": knockaway_count,
		"invalidCount": invalid_count,
		"expectationOk": expectation_ok,
		"avgRounds": snappedf(float(total_rounds) / float(count), 0.01),
		"avgPlayerHpRatio": snappedf(total_player_hp_ratio / float(count), 0.0001),
		"hardestScenarioId": hardest_id,
		"lowestPlayerHpRatio": snappedf(lowest_hp_ratio, 0.0001),
	}
