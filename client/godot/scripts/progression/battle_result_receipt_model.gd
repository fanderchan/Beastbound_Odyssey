extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")

const SCHEMA_VERSION := 1
const DEFAULT_PLAYER_ID := "local_player"
const DEFAULT_LIMIT := 50


static func build_receipt(state: Dictionary, result_payload: Dictionary, player_id: String = DEFAULT_PLAYER_ID, now_sec: int = 0) -> Dictionary:
	var created_at: int = now_sec if now_sec > 0 else int(Time.get_unix_time_from_system())
	var target_seed: String = str(state.get("targetSeed", state.get("id", "battle")))
	var result: String = str(result_payload.get("result", ""))
	var balance: Dictionary = BalanceCatalogModel.balance_snapshot_summary()
	var receipt_id: String = str(result_payload.get("receiptId", ""))
	if receipt_id == "":
		receipt_id = "battle_%s_%d" % [_safe_id(target_seed), created_at]
	return normalize_receipt({
		"schemaVersion": SCHEMA_VERSION,
		"receiptId": receipt_id,
		"playerId": player_id if player_id != "" else DEFAULT_PLAYER_ID,
		"battleId": str(state.get("id", target_seed)),
		"result": result,
		"createdAtSec": created_at,
		"targetSeed": target_seed,
		"sourceEncounterGroupId": str(state.get("sourceEncounterGroupId", state.get("encounterGroupId", ""))),
		"sourceZoneId": str(state.get("sourceZoneId", "")),
		"round": maxi(0, int(state.get("round", 0))),
		"combatFormulaDriver": str(state.get("combatFormulaDriver", "legacy")),
		"balance": balance,
		"rewards": {
			"exp": maxi(0, int(result_payload.get("expReward", 0))),
			"stoneCoins": maxi(0, int(result_payload.get("stoneCoinsReward", 0))),
			"items": _item_amounts(result_payload.get("itemRewards", [])),
			"mailedItems": _item_amounts(result_payload.get("mailedItemRewards", [])),
		},
		"capture": {
			"kept": _pet_ids(result_payload.get("capturedPets", [])),
			"lost": _pet_ids(result_payload.get("lostCapturedPets", [])),
			"autoDiscarded": _pet_ids(result_payload.get("autoDiscardedPets", [])),
		},
		"knockaway": {
			"player": bool(result_payload.get("playerKnockedAway", false)),
			"activePet": bool(result_payload.get("activePetKnockedAway", false)),
			"allyActorIds": _string_array(result_payload.get("allyKnockedAwayActorIds", [])),
			"enemyActorIds": _string_array(result_payload.get("enemyKnockedAwayActorIds", [])),
		},
	})


static func normalize_receipts(value, limit: int = DEFAULT_LIMIT) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var receipt: Dictionary = normalize_receipt(entry_value as Dictionary)
			if not receipt.is_empty():
				result.append(receipt)
	var safe_limit: int = maxi(1, limit)
	while result.size() > safe_limit:
		result.remove_at(0)
	return result


static func with_appended_receipt(profile: Dictionary, receipt: Dictionary, key: String = "battleResultReceipts", limit: int = DEFAULT_LIMIT) -> Dictionary:
	var next_profile: Dictionary = profile.duplicate(true)
	var receipts: Array[Dictionary] = normalize_receipts(next_profile.get(key, []), limit)
	var normalized_receipt: Dictionary = normalize_receipt(receipt)
	if normalized_receipt.is_empty():
		next_profile[key] = receipts
		return next_profile
	var receipt_id: String = str(normalized_receipt.get("receiptId", ""))
	var replaced: bool = false
	for index in range(receipts.size()):
		if str(receipts[index].get("receiptId", "")) == receipt_id:
			receipts[index] = normalized_receipt
			replaced = true
			break
	if not replaced:
		receipts.append(normalized_receipt)
	while receipts.size() > maxi(1, limit):
		receipts.remove_at(0)
	next_profile[key] = receipts
	return next_profile


static func normalize_receipt(value) -> Dictionary:
	var source: Dictionary = {}
	if value is Dictionary:
		source = value as Dictionary
	var receipt_id: String = str(source.get("receiptId", "")).strip_edges()
	if receipt_id == "":
		return {}
	var balance: Dictionary = {}
	var raw_balance = source.get("balance", {})
	if raw_balance is Dictionary:
		balance = raw_balance as Dictionary
	return {
		"schemaVersion": SCHEMA_VERSION,
		"receiptId": receipt_id,
		"playerId": str(source.get("playerId", DEFAULT_PLAYER_ID)),
		"battleId": str(source.get("battleId", "")),
		"result": str(source.get("result", "")),
		"createdAtSec": maxi(0, int(source.get("createdAtSec", 0))),
		"targetSeed": str(source.get("targetSeed", "")),
		"sourceEncounterGroupId": str(source.get("sourceEncounterGroupId", "")),
		"sourceZoneId": str(source.get("sourceZoneId", "")),
		"round": maxi(0, int(source.get("round", 0))),
		"combatFormulaDriver": str(source.get("combatFormulaDriver", "legacy")),
		"balance": _normalize_balance_summary(balance),
		"rewards": _normalize_rewards(source.get("rewards", {})),
		"capture": _normalize_capture(source.get("capture", {})),
		"knockaway": _normalize_knockaway(source.get("knockaway", {})),
	}


static func validation_errors(receipt: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if int(receipt.get("schemaVersion", 0)) != SCHEMA_VERSION:
		errors.append("receipt.schemaVersion 必须是 %d" % SCHEMA_VERSION)
	for key in ["receiptId", "playerId", "battleId", "result", "targetSeed"]:
		if str(receipt.get(key, "")).strip_edges() == "":
			errors.append("receipt.%s 不能为空" % key)
	var balance: Dictionary = {}
	var raw_balance = receipt.get("balance", {})
	if raw_balance is Dictionary:
		balance = raw_balance as Dictionary
	for key in ["balanceSetId", "balanceVersion", "formulaVersion", "captureFormulaVersion", "rewardEconomyVersion", "sourceDigest"]:
		if str(balance.get(key, "")).strip_edges() == "":
			errors.append("receipt.balance.%s 不能为空" % key)
	if not ["victory", "defeat", "escape", "running"].has(str(receipt.get("result", ""))):
		errors.append("receipt.result 非预期: %s" % str(receipt.get("result", "")))
	return errors


static func server_projection(receipt: Dictionary) -> Dictionary:
	var normalized: Dictionary = normalize_receipt(receipt)
	var balance: Dictionary = normalized.get("balance", {}) as Dictionary
	var rewards: Dictionary = normalized.get("rewards", {}) as Dictionary
	var knockaway: Dictionary = normalized.get("knockaway", {}) as Dictionary
	return {
		"playerId": str(normalized.get("playerId", "")),
		"receiptId": str(normalized.get("receiptId", "")),
		"battleId": str(normalized.get("battleId", "")),
		"result": str(normalized.get("result", "")),
		"createdAtSec": int(normalized.get("createdAtSec", 0)),
			"balanceVersion": str(balance.get("balanceVersion", "")),
			"formulaVersion": str(balance.get("formulaVersion", "")),
			"captureFormulaVersion": str(balance.get("captureFormulaVersion", "")),
			"rewardEconomyVersion": str(balance.get("rewardEconomyVersion", "")),
			"balanceSourceDigest": str(balance.get("sourceDigest", "")),
			"balanceSourceDigestShort": str(balance.get("sourceDigestShort", "")),
			"targetSeed": str(normalized.get("targetSeed", "")),
		"sourceEncounterGroupId": str(normalized.get("sourceEncounterGroupId", "")),
		"expReward": int(rewards.get("exp", 0)),
		"stoneCoinsReward": int(rewards.get("stoneCoins", 0)),
		"playerKnockedAway": bool(knockaway.get("player", false)),
	}


static func _normalize_balance_summary(value: Dictionary) -> Dictionary:
	return {
		"balanceSetId": str(value.get("balanceSetId", "")),
		"balanceVersion": str(value.get("balanceVersion", "")),
		"formulaVersion": str(value.get("formulaVersion", "")),
		"captureFormulaVersion": str(value.get("captureFormulaVersion", "")),
		"rewardEconomyVersion": str(value.get("rewardEconomyVersion", "")),
		"progressionVersion": str(value.get("progressionVersion", "")),
			"levelCurveId": str(value.get("levelCurveId", "")),
			"battleSimulationSuiteId": str(value.get("battleSimulationSuiteId", "")),
			"economyLedgerId": str(value.get("economyLedgerId", "")),
			"petPowerFormulaId": str(value.get("petPowerFormulaId", "")),
			"sourceDigest": str(value.get("sourceDigest", "")),
			"sourceDigestShort": str(value.get("sourceDigestShort", "")),
			"sourceCount": maxi(0, int(value.get("sourceCount", 0))),
		}


static func _normalize_rewards(value) -> Dictionary:
	var source: Dictionary = {}
	if value is Dictionary:
		source = value as Dictionary
	return {
		"exp": maxi(0, int(source.get("exp", 0))),
		"stoneCoins": maxi(0, int(source.get("stoneCoins", 0))),
		"items": _item_amounts(source.get("items", [])),
		"mailedItems": _item_amounts(source.get("mailedItems", [])),
	}


static func _normalize_capture(value) -> Dictionary:
	var source: Dictionary = {}
	if value is Dictionary:
		source = value as Dictionary
	return {
		"kept": _string_array(source.get("kept", [])),
		"lost": _string_array(source.get("lost", [])),
		"autoDiscarded": _string_array(source.get("autoDiscarded", [])),
	}


static func _normalize_knockaway(value) -> Dictionary:
	var source: Dictionary = {}
	if value is Dictionary:
		source = value as Dictionary
	return {
		"player": bool(source.get("player", false)),
		"activePet": bool(source.get("activePet", false)),
		"allyActorIds": _string_array(source.get("allyActorIds", [])),
		"enemyActorIds": _string_array(source.get("enemyActorIds", [])),
	}


static func _item_amounts(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry: Dictionary = entry_value as Dictionary
			var item_id: String = str(entry.get("itemId", ""))
			var count: int = maxi(0, int(entry.get("count", 0)))
			if item_id != "" and count > 0:
				result.append({"itemId": item_id, "count": count})
	return result


static func _pet_ids(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry_value in value:
			if entry_value is Dictionary:
				var entry: Dictionary = entry_value as Dictionary
				var id: String = str(entry.get("instanceId", entry.get("petId", ""))).strip_edges()
				if id != "" and not result.has(id):
					result.append(id)
	return result


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry_value in value:
			var item: String = str(entry_value).strip_edges()
			if item != "" and not result.has(item):
				result.append(item)
	return result


static func _safe_id(value: String) -> String:
	var safe: String = value.replace(":", "_").replace("/", "_").replace(" ", "_")
	if safe.length() > 48:
		safe = "%s_%d" % [safe.substr(0, 32), value.hash()]
	return safe if safe != "" else "battle"
