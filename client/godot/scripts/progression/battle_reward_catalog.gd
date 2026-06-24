extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")

const DATA_PATH := "res://data/battle_rewards.json"
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


static func rewards_for_state(state: Dictionary) -> Array[Dictionary]:
	var forced = state.get("forcedItemRewards", null)
	if forced is Array:
		return _normalized_rewards(forced as Array)
	var table := table_for_state(state)
	if table.is_empty():
		return []
	var raw_rewards = table.get("rewards", [])
	if not (raw_rewards is Array):
		return []
	var result: Array[Dictionary] = []
	var table_id := str(table.get("id", ""))
	for index in range((raw_rewards as Array).size()):
		var value = (raw_rewards as Array)[index]
		if not (value is Dictionary):
			continue
		var reward := value as Dictionary
		var item_id := str(reward.get("itemId", ""))
		if BackpackModel.item_for_id(item_id).is_empty():
			continue
		var chance := clampf(float(reward.get("chance", 1.0)), 0.0, 1.0)
		var seed_text := "%s:reward:%s:%s:%d" % [
			str(state.get("targetSeed", state.get("id", "battle"))),
			table_id,
			item_id,
			index,
		]
		if chance < 1.0 and _stable_roll(seed_text) >= chance:
			continue
		var min_count := maxi(0, int(reward.get("min", reward.get("count", 1))))
		var max_count := maxi(min_count, int(reward.get("max", min_count)))
		var count := min_count
		if max_count > min_count:
			count += _stable_target_index("%s:count" % seed_text, max_count - min_count + 1)
		if count > 0:
			result.append({
				"itemId": item_id,
				"count": count,
			})
	return _merged_rewards(result)


static func stone_coins_for_state(state: Dictionary) -> int:
	if state.has("forcedStoneCoinsReward"):
		return maxi(0, int(state.get("forcedStoneCoinsReward", 0)))
	var table := table_for_state(state)
	if table.is_empty():
		return 0
	var raw_coin_reward = table.get("stoneCoins", {})
	if not (raw_coin_reward is Dictionary):
		return 0
	var coin_reward := raw_coin_reward as Dictionary
	var chance := clampf(float(coin_reward.get("chance", 1.0)), 0.0, 1.0)
	var table_id := str(table.get("id", ""))
	var seed_text := "%s:reward:%s:stoneCoins" % [
		str(state.get("targetSeed", state.get("id", "battle"))),
		table_id,
	]
	if chance < 1.0 and _stable_roll(seed_text) >= chance:
		return 0
	var min_count := maxi(0, int(coin_reward.get("min", coin_reward.get("count", 0))))
	var max_count := maxi(min_count, int(coin_reward.get("max", min_count)))
	var count := min_count
	if max_count > min_count:
		count += _stable_target_index("%s:count" % seed_text, max_count - min_count + 1)
	return count


static func table_for_state(state: Dictionary) -> Dictionary:
	var group_id := str(state.get("sourceEncounterGroupId", ""))
	if group_id != "":
		var group_table := table_for_id(group_id)
		if not group_table.is_empty():
			return group_table
	var zone_id := str(state.get("sourceZoneId", ""))
	if zone_id != "":
		var zone_table := table_for_id(zone_id)
		if not zone_table.is_empty():
			return zone_table
	for table in _tables():
		if bool(table.get("fallback", false)):
			return table
	return {}


static func table_for_id(table_id: String) -> Dictionary:
	for table in _tables():
		if str(table.get("id", "")) == table_id:
			return table
	return {}


static func _normalized_rewards(raw_rewards: Array) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for value in raw_rewards:
		if not (value is Dictionary):
			continue
		var reward := value as Dictionary
		var item_id := str(reward.get("itemId", ""))
		var count := maxi(0, int(reward.get("count", 0)))
		if item_id != "" and count > 0 and not BackpackModel.item_for_id(item_id).is_empty():
			result.append({
				"itemId": item_id,
				"count": count,
			})
	return _merged_rewards(result)


static func _merged_rewards(rewards: Array[Dictionary]) -> Array[Dictionary]:
	var order: Array[String] = []
	var counts := {}
	for reward in rewards:
		var item_id := str(reward.get("itemId", ""))
		if item_id == "":
			continue
		if not counts.has(item_id):
			order.append(item_id)
		counts[item_id] = int(counts.get(item_id, 0)) + maxi(0, int(reward.get("count", 0)))
	var result: Array[Dictionary] = []
	for item_id in order:
		var count := maxi(0, int(counts.get(item_id, 0)))
		if count > 0:
			result.append({
				"itemId": item_id,
				"count": count,
			})
	return result


static func _tables() -> Array[Dictionary]:
	var parsed := _data()
	var raw_tables = parsed.get("rewardTables", [])
	var result: Array[Dictionary] = []
	if raw_tables is Array:
		for value in raw_tables:
			if value is Dictionary and str((value as Dictionary).get("id", "")) != "":
				result.append(value as Dictionary)
	return result


static func _data() -> Dictionary:
	if data_cache_loaded:
		return data_cache
	data_cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		data_cache = {}
		return data_cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	data_cache = parsed as Dictionary if parsed is Dictionary else {}
	return data_cache


static func _stable_roll(seed_text: String) -> float:
	return float(_stable_target_index(seed_text, 10000)) / 10000.0


static func _stable_target_index(seed_text: String, count: int) -> int:
	if count <= 0:
		return 0
	var value := 17
	for index in range(seed_text.length()):
		value = (value * 131 + seed_text.unicode_at(index)) % 2147483647
	return value % count
