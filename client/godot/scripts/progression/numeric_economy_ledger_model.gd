extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const NumericBattleSimulatorModel := preload("res://scripts/progression/numeric_battle_simulator_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")

const REPORT_SCHEMA_VERSION := 1
const DEFAULT_OUTPUT_PATH := "res://../../.run/godot/numeric_economy_ledger_report.json"


static func build_report(battle_report: Dictionary = {}) -> Dictionary:
	BalanceCatalogModel.reload()
	var source_battle_report := battle_report
	if source_battle_report.is_empty():
		source_battle_report = NumericBattleSimulatorModel.build_report()
	var ledger := BalanceCatalogModel.active_economy_ledger()
	var assumptions := _assumptions_for(ledger)
	var samples: Array[Dictionary] = []
	var raw_samples: Array = source_battle_report.get("samples", [])
	for value in raw_samples:
		if value is Dictionary:
			samples.append(_ledger_sample_for_battle(value as Dictionary, assumptions))
	var summary := _summary_for_samples(samples)
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"ledgerId": str(ledger.get("id", "")),
		"label": str(ledger.get("label", "")),
		"mode": "net_stone_ledger",
		"sourceBattleSuiteId": str(ledger.get("sourceBattleSuiteId", "")),
		"assumptions": assumptions,
		"samples": samples,
		"summary": summary,
		"notes": [
			"净收入 = 石币期望 + 可卖物品期望回收 - 人物村医费 - 野外低血补给储备 - 人物装备修理费。",
			"第一版只算人物自身经济，不把陪练伙伴和其他玩家的装备/治疗消耗计入主角成本。",
			"任务戒指、材料等当前不可卖物品按0石币计，但仍在 itemAverages 中保留。",
		],
	}


static func validation_errors(report: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if str(report.get("mode", "")) != "net_stone_ledger":
		errors.append("economyLedger.mode 必须是 net_stone_ledger")
	var samples: Array = report.get("samples", [])
	if samples.size() < 6:
		errors.append("economyLedger.samples 数量不足")
	var summary := report.get("summary", {}) as Dictionary
	if int(summary.get("sampleCount", 0)) != samples.size():
		errors.append("economyLedger.summary.sampleCount 不匹配")
	if int(summary.get("missingRewardTableCount", 0)) > 0:
		errors.append("economyLedger 存在缺失奖励表样本")
	if int(summary.get("repeatableNetPositive", 0)) < int(summary.get("repeatableCount", 0)):
		errors.append("economyLedger 存在可重复练级区净收入为负")
	var assumptions := report.get("assumptions", {}) as Dictionary
	if float(assumptions.get("bestBattleHealCostPerHp", 0.0)) <= 0.0:
		errors.append("economyLedger 无法计算战斗治疗道具每血成本")
	for value in samples:
		if not (value is Dictionary):
			continue
		var sample := value as Dictionary
		if float(sample.get("battleSeconds", 0.0)) <= 0.0:
			errors.append("%s.battleSeconds 无效" % str(sample.get("id", "")))
		if bool(sample.get("repeatable", false)) and float(sample.get("netStonePerBattle", 0.0)) < float(assumptions.get("minRepeatableNetStonePerBattle", 0.0)):
			errors.append("%s 可重复净收入低于底线" % str(sample.get("id", "")))
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


static func _ledger_sample_for_battle(battle_sample: Dictionary, assumptions: Dictionary) -> Dictionary:
	var zone_id := str(battle_sample.get("progressionZoneId", ""))
	var zone := _zone_for_id(zone_id)
	var content_type := str(zone.get("contentType", ""))
	var repeatable := bool(zone.get("repeatable", false))
	var reward_preview := battle_sample.get("rewardPreview", {}) as Dictionary
	var encounter_group_id := str(reward_preview.get("encounterGroupId", zone.get("encounterGroupId", "")))
	var reward_table_id := str(reward_preview.get("rewardTableId", zone.get("rewardTableId", encounter_group_id)))
	var reward_table := BattleRewardCatalog.table_for_id(reward_table_id)
	var expected_stone := _expected_stone_for_table(reward_table)
	var expected_items := _expected_items_for_table(reward_table)
	var item_value := _expected_item_sell_value(expected_items)
	var rounds := maxi(1, int(battle_sample.get("rounds", 1)))
	var encounter_seconds := float(assumptions.get("normalEncounterSeconds", 6.0))
	if not repeatable or content_type == "qualification_battle":
		encounter_seconds = float(assumptions.get("qualificationEncounterSeconds", 0.0))
	var battle_seconds := encounter_seconds + float(assumptions.get("settlementSeconds", 1.2)) + float(rounds) * float(assumptions.get("secondsPerRound", 2.4))
	var metrics := battle_sample.get("metrics", {}) as Dictionary
	var costs := _costs_for_battle(battle_sample, metrics, assumptions)
	var gross := expected_stone + item_value
	var total_cost := float(costs.get("totalStoneEquivalent", 0.0))
	var net := gross - total_cost
	var net_margin := 0.0
	if gross > 0.0:
		net_margin = net / gross
	var battles_per_hour := 3600.0 / maxf(1.0, battle_seconds)
	return {
		"id": str(battle_sample.get("id", "")),
		"label": str(battle_sample.get("label", battle_sample.get("id", ""))),
		"progressionZoneId": zone_id,
		"stageId": str(zone.get("stageId", "")),
		"contentType": content_type,
		"repeatable": repeatable,
		"encounterGroupId": encounter_group_id,
		"rewardTableId": reward_table_id,
		"missingRewardTable": reward_table.is_empty(),
		"rounds": rounds,
		"battleSeconds": snappedf(battle_seconds, 0.01),
		"battlesPerHour": snappedf(battles_per_hour, 0.01),
		"expPerBattle": int((battle_sample.get("rewardPreview", {}) as Dictionary).get("exp", 0)),
		"expPerHour": int(round(float((battle_sample.get("rewardPreview", {}) as Dictionary).get("exp", 0)) * battles_per_hour)),
		"value": {
			"expectedStoneCoins": snappedf(expected_stone, 0.01),
			"expectedItemSellValue": snappedf(item_value, 0.01),
			"grossStoneEquivalent": snappedf(gross, 0.01),
			"itemAverages": expected_items,
		},
		"costs": costs,
		"netStonePerBattle": snappedf(net, 0.01),
		"netStonePerHour": snappedf(net * battles_per_hour, 0.01),
		"netMargin": snappedf(net_margin, 0.0001),
		"lowMargin": repeatable and net_margin < float(assumptions.get("warningNetMargin", 0.15)),
		"playerHpRatio": float(battle_sample.get("playerHpRatio", 0.0)),
		"result": str(battle_sample.get("result", "")),
	}


static func _costs_for_battle(battle_sample: Dictionary, metrics: Dictionary, assumptions: Dictionary) -> Dictionary:
	var player_hp := maxi(0, int(battle_sample.get("playerHp", 0)))
	var player_max_hp := maxi(1, int(battle_sample.get("playerMaxHp", 1)))
	var missing_hp := maxi(0, player_max_hp - player_hp)
	var heal_hp_per_coin := BalanceCatalogModel.village_heal_hp_per_coin(PlayerProgressModel.VILLAGE_HEAL_HP_PER_COIN)
	var healer_cost := int(ceil(float(missing_hp) / float(heal_hp_per_coin)))
	var hp_ratio := float(battle_sample.get("playerHpRatio", 0.0))
	var supply_threshold := float(assumptions.get("fieldSupplyHpRatioThreshold", 0.70))
	var supply_hp := 0.0
	if hp_ratio < supply_threshold:
		supply_hp = maxf(0.0, float(player_max_hp) * supply_threshold - float(player_hp))
	supply_hp *= float(assumptions.get("fieldSupplyReserveShare", 0.35))
	var field_supply_cost := supply_hp * float(assumptions.get("bestBattleHealCostPerHp", 0.0))
	var weapon_repair := float(maxi(0, int(metrics.get("playerPhysicalAttackEvents", 0)))) / float(BalanceCatalogModel.equipment_weapon_attacks_per_durability(PlayerProgressModel.EQUIPMENT_WEAPON_ATTACKS_PER_DURABILITY))
	weapon_repair /= float(BalanceCatalogModel.equipment_repair_durability_per_coin(PlayerProgressModel.EQUIPMENT_REPAIR_DURABILITY_PER_COIN))
	var armor_repair := float(maxi(0, int(metrics.get("playerHitEvents", 0)))) / float(BalanceCatalogModel.equipment_armor_hits_per_durability(PlayerProgressModel.EQUIPMENT_ARMOR_HITS_PER_DURABILITY))
	armor_repair /= float(BalanceCatalogModel.equipment_repair_durability_per_coin(PlayerProgressModel.EQUIPMENT_REPAIR_DURABILITY_PER_COIN))
	var total := float(healer_cost) + field_supply_cost + weapon_repair + armor_repair
	return {
		"playerMissingHp": missing_hp,
		"damageToPlayer": maxi(0, int(metrics.get("damageToPlayer", 0))),
		"playerPhysicalAttackEvents": maxi(0, int(metrics.get("playerPhysicalAttackEvents", 0))),
		"playerHitEvents": maxi(0, int(metrics.get("playerHitEvents", 0))),
		"villageHealerStone": snappedf(float(healer_cost), 0.01),
		"fieldSupplyReserveStone": snappedf(field_supply_cost, 0.01),
		"weaponRepairStone": snappedf(weapon_repair, 0.01),
		"armorRepairStone": snappedf(armor_repair, 0.01),
		"totalStoneEquivalent": snappedf(total, 0.01),
	}


static func _summary_for_samples(samples: Array[Dictionary]) -> Dictionary:
	var repeatable_count := 0
	var qualification_count := 0
	var repeatable_net_positive := 0
	var missing_reward_table_count := 0
	var low_margin_count := 0
	var total_repeatable_net := 0.0
	var total_repeatable_hour := 0.0
	var lowest_net := INF
	var lowest_net_id := ""
	var highest_net_hour := -INF
	var highest_net_hour_id := ""
	for sample in samples:
		if bool(sample.get("missingRewardTable", false)):
			missing_reward_table_count += 1
		var repeatable := bool(sample.get("repeatable", false))
		if repeatable:
			repeatable_count += 1
			var net := float(sample.get("netStonePerBattle", 0.0))
			var net_hour := float(sample.get("netStonePerHour", 0.0))
			total_repeatable_net += net
			total_repeatable_hour += net_hour
			if net >= 0.0:
				repeatable_net_positive += 1
			if bool(sample.get("lowMargin", false)):
				low_margin_count += 1
			if net < lowest_net:
				lowest_net = net
				lowest_net_id = str(sample.get("id", ""))
			if net_hour > highest_net_hour:
				highest_net_hour = net_hour
				highest_net_hour_id = str(sample.get("id", ""))
		else:
			qualification_count += 1
	var repeatable_divisor := maxi(1, repeatable_count)
	return {
		"sampleCount": samples.size(),
		"repeatableCount": repeatable_count,
		"qualificationCount": qualification_count,
		"repeatableNetPositive": repeatable_net_positive,
		"missingRewardTableCount": missing_reward_table_count,
		"lowMarginCount": low_margin_count,
		"avgRepeatableNetStonePerBattle": snappedf(total_repeatable_net / float(repeatable_divisor), 0.01),
		"avgRepeatableNetStonePerHour": snappedf(total_repeatable_hour / float(repeatable_divisor), 0.01),
		"lowestRepeatableNetScenarioId": lowest_net_id,
		"lowestRepeatableNetStonePerBattle": snappedf(lowest_net if lowest_net < INF else 0.0, 0.01),
		"highestRepeatableNetPerHourScenarioId": highest_net_hour_id,
		"highestRepeatableNetStonePerHour": snappedf(highest_net_hour if highest_net_hour > -INF else 0.0, 0.01),
	}


static func _assumptions_for(ledger: Dictionary) -> Dictionary:
	var raw_assumptions = ledger.get("assumptions", {})
	var assumptions := (raw_assumptions as Dictionary).duplicate(true) if raw_assumptions is Dictionary else {}
	assumptions["villageHealHpPerCoin"] = BalanceCatalogModel.village_heal_hp_per_coin(PlayerProgressModel.VILLAGE_HEAL_HP_PER_COIN)
	assumptions["weaponAttacksPerDurability"] = BalanceCatalogModel.equipment_weapon_attacks_per_durability(PlayerProgressModel.EQUIPMENT_WEAPON_ATTACKS_PER_DURABILITY)
	assumptions["armorHitsPerDurability"] = BalanceCatalogModel.equipment_armor_hits_per_durability(PlayerProgressModel.EQUIPMENT_ARMOR_HITS_PER_DURABILITY)
	assumptions["repairDurabilityPerCoin"] = BalanceCatalogModel.equipment_repair_durability_per_coin(PlayerProgressModel.EQUIPMENT_REPAIR_DURABILITY_PER_COIN)
	assumptions["bestBattleHealCostPerHp"] = snappedf(_best_battle_heal_cost_per_hp(), 0.0001)
	return assumptions


static func _expected_stone_for_table(table: Dictionary) -> float:
	if table.is_empty():
		return 0.0
	var raw_coin_reward = table.get("stoneCoins", {})
	if not (raw_coin_reward is Dictionary):
		return 0.0
	var coin_reward := raw_coin_reward as Dictionary
	var chance := clampf(float(coin_reward.get("chance", 1.0)), 0.0, 1.0)
	var min_count := maxi(0, int(coin_reward.get("min", coin_reward.get("count", 0))))
	var max_count := maxi(min_count, int(coin_reward.get("max", min_count)))
	return chance * (float(min_count) + float(max_count)) * 0.5


static func _expected_items_for_table(table: Dictionary) -> Dictionary:
	var result := {}
	if table.is_empty():
		return result
	var raw_rewards = table.get("rewards", [])
	if not (raw_rewards is Array):
		return result
	for value in raw_rewards:
		if not (value is Dictionary):
			continue
		var reward := value as Dictionary
		var item_id := str(reward.get("itemId", ""))
		if item_id == "":
			continue
		var chance := clampf(float(reward.get("chance", 1.0)), 0.0, 1.0)
		var min_count := maxi(0, int(reward.get("min", reward.get("count", 1))))
		var max_count := maxi(min_count, int(reward.get("max", min_count)))
		var expected := chance * (float(min_count) + float(max_count)) * 0.5
		if expected > 0.0:
			result[item_id] = snappedf(float(result.get(item_id, 0.0)) + expected, 0.0001)
	return result


static func _expected_item_sell_value(expected_items: Dictionary) -> float:
	var total := 0.0
	for item_id in expected_items.keys():
		total += float(expected_items[item_id]) * float(_sell_price_for_item(str(item_id)))
	return total


static func _best_battle_heal_cost_per_hp() -> float:
	var best := INF
	for item_id in BackpackModel.item_ids_for_context("battle_item"):
		var action_id := BackpackModel.battle_action_id_for(item_id)
		if BattleActionCatalog.effect_type_for(action_id) != "heal":
			continue
		var amount := BattleActionCatalog.effect_amount_for(action_id, 0)
		if amount <= 0:
			continue
		var buy_price := _buy_price_for_item(item_id)
		if buy_price <= 0:
			continue
		best = minf(best, float(buy_price) / float(amount))
	if best >= INF:
		return 1.0 / float(BalanceCatalogModel.village_heal_hp_per_coin(PlayerProgressModel.VILLAGE_HEAL_HP_PER_COIN))
	return best


static func _buy_price_for_item(item_id: String) -> int:
	var best := 0
	for shop in ShopCatalogModel.shops():
		var shop_id := str(shop.get("id", ""))
		var price := ShopCatalogModel.buy_price_for(shop_id, item_id)
		if price <= 0:
			continue
		if best == 0 or price < best:
			best = price
	return best


static func _sell_price_for_item(item_id: String) -> int:
	var best := 0
	for shop in ShopCatalogModel.shops():
		var shop_id := str(shop.get("id", ""))
		if not ShopCatalogModel.is_sellable(shop_id, item_id):
			continue
		best = maxi(best, ShopCatalogModel.sell_price_for(shop_id, item_id))
	return best


static func _zone_for_id(zone_id: String) -> Dictionary:
	for zone in BalanceCatalogModel.progression_zone_list():
		if str(zone.get("id", "")) == zone_id:
			return zone
	return {}
