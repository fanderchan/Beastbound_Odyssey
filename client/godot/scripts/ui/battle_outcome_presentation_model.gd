extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")

const RESULT_VICTORY := "victory"
const RESULT_DEFEAT := "defeat"
const RESULT_ESCAPE := "escape"


static func server_pve_view(
	room: Dictionary,
	account_id: String,
	result_key: String = RESULT_VICTORY
) -> Dictionary:
	var safe_result := result_key.strip_edges()
	if safe_result == "":
		safe_result = RESULT_VICTORY
	var profile_entry := _profile_entry(room, account_id)
	var reward_rows: Array[Dictionary] = []
	var warning_rows: Array[Dictionary] = []
	if safe_result == RESULT_VICTORY:
		_append_exp_rows(profile_entry, reward_rows, warning_rows)
		_append_reward_rows(profile_entry, reward_rows, warning_rows)
		_append_capture_rows(profile_entry, reward_rows)
	_append_skipped_writeback_warnings(room, account_id, warning_rows)
	var title := _title_for_result(safe_result)
	var detail_lines: Array[String] = [title]
	for row in reward_rows:
		detail_lines.append(str(row.get("text", "")))
	for row in warning_rows:
		detail_lines.append(str(row.get("text", "")))
	var outcome_id := _outcome_id(room, account_id)
	return {
		"outcomeId": outcome_id,
		"dedupeKey": outcome_id,
		"title": title,
		"resultKey": safe_result,
		"rewardRows": reward_rows,
		"warningRows": warning_rows,
		"detailText": "\n".join(detail_lines),
	}


static func build_view(
	closed_room: Dictionary,
	account_id: String,
	result_key: String = RESULT_VICTORY
) -> Dictionary:
	return server_pve_view(closed_room, account_id, result_key)


static func project(
	closed_room: Dictionary,
	account_id: String,
	result_key: String = RESULT_VICTORY
) -> Dictionary:
	return server_pve_view(closed_room, account_id, result_key)


static func debug_self_check() -> Dictionary:
	var report := contract_check()
	return {
		"ok": bool(report.get("ok", false)),
		"checks": report.get("checks", {}),
		"errors": [] if bool(report.get("ok", false)) else ["presentation contract failed"],
		"view": report.get("view", {}),
	}


static func contract_check() -> Dictionary:
	var fixture := {
		"roomId": "battle_outcome_presenter_check",
		"battleRecordId": "record_presenter_check",
		"battle": {
			"profileWriteback": {
				"profiles": [{
					"accountId": "self",
					"exp": {
						"player": {
							"name": "赤芽",
							"amount": 5120,
							"beforeLevel": 97,
							"level": 98,
							"levelsGained": 1,
						},
						"ridePets": [{
							"petInstanceId": "ride_and_battle",
							"name": "黑乌力",
							"amount": 3584,
						}],
						"pets": [
							{
								"petInstanceId": "ride_and_battle",
								"name": "黑乌力",
								"amount": 3584,
							},
							{
								"petInstanceId": "battle_pet",
								"name": "呼拔拔",
								"amount": 2400,
							},
						],
						"trainingPartners": [{
							"player": {"name": "小伙伴", "amount": 1800},
							"pet": {"petInstanceId": "partner_pet", "name": "小小龙", "amount": 900},
						}],
					},
					"rewards": {
						"stoneCoins": 1680,
						"addedItems": [{"itemId": "item_meat_small", "count": 2}],
						"mailedItems": [{"itemId": "item_meat_small", "count": 1}],
					},
				}],
				"skippedProfiles": [],
			},
		},
	}
	var view := server_pve_view(fixture, "self", RESULT_VICTORY)
	var rows: Array = view.get("rewardRows", []) if view.get("rewardRows", []) is Array else []
	var texts: Array[String] = []
	for value in rows:
		if value is Dictionary:
			texts.append(str((value as Dictionary).get("text", "")))
	var checks := {
		"stable_outcome_id": str(view.get("outcomeId", "")) == "record_presenter_check:self",
		"title": str(view.get("title", "")) == "战斗胜利",
		"player_first": not texts.is_empty() and texts[0] == "赤芽获得了5120经验",
		"level_after_player": texts.size() > 1 and texts[1] == "赤芽升到了98级！",
		"deduped_ride_pet": texts.count("黑乌力获得了3584经验") == 1,
		"partner_present": texts.has("小伙伴获得了1800经验") and texts.has("小小龙获得了900经验"),
		"stone_present": texts.has("获得了1680石币"),
		"mail_present": _contains_fragment(texts, "已发邮箱"),
	}
	var ok := true
	for value in checks.values():
		ok = ok and bool(value)
	return {"ok": ok, "checks": checks, "view": view}


static func _append_exp_rows(
	profile_entry: Dictionary,
	reward_rows: Array[Dictionary],
	warning_rows: Array[Dictionary]
) -> void:
	var exp := profile_entry.get("exp", {}) as Dictionary if profile_entry.get("exp", {}) is Dictionary else {}
	if exp.is_empty():
		return
	if bool(exp.get("failed", false)):
		var failure_message := str(exp.get("message", "")).strip_edges()
		if failure_message == "":
			failure_message = "本次经验结算未写入，请重新登录后确认。"
		_append_unique_warning(warning_rows, failure_message, "writeback")
		return
	var seen_pet_ids: Dictionary = {}
	var player := exp.get("player", {}) as Dictionary if exp.get("player", {}) is Dictionary else {}
	_append_exp_entry(player, "人物", "player", reward_rows, {})
	var ride_pets: Array = exp.get("ridePets", []) if exp.get("ridePets", []) is Array else []
	for value in ride_pets:
		if value is Dictionary:
			_append_exp_entry(value as Dictionary, "骑宠", "ride_pet", reward_rows, seen_pet_ids)
	var pets: Array = exp.get("pets", []) if exp.get("pets", []) is Array else []
	for value in pets:
		if value is Dictionary:
			_append_exp_entry(value as Dictionary, "战宠", "battle_pet", reward_rows, seen_pet_ids)
	var partners: Array = exp.get("trainingPartners", []) if exp.get("trainingPartners", []) is Array else []
	for partner_value in partners:
		if not (partner_value is Dictionary):
			continue
		var partner := partner_value as Dictionary
		var partner_player := partner.get("player", {}) as Dictionary if partner.get("player", {}) is Dictionary else {}
		_append_exp_entry(partner_player, "伙伴", "partner", reward_rows, {})
		var partner_pet := partner.get("pet", {}) as Dictionary if partner.get("pet", {}) is Dictionary else {}
		_append_exp_entry(partner_pet, "伙伴宠", "partner_pet", reward_rows, seen_pet_ids)


static func _append_exp_entry(
	entry: Dictionary,
	fallback_name: String,
	role: String,
	rows: Array[Dictionary],
	seen_ids: Dictionary
) -> void:
	if entry.is_empty():
		return
	var stable_id := _entry_stable_id(entry)
	if stable_id != "" and seen_ids.has(stable_id):
		return
	if stable_id != "":
		seen_ids[stable_id] = true
	var amount := maxi(0, int(entry.get("amount", 0)))
	if amount <= 0:
		return
	var display_name := str(entry.get("name", entry.get("displayName", fallback_name))).strip_edges()
	if display_name == "":
		display_name = fallback_name
	rows.append({
		"text": "%s获得了%d经验" % [display_name, amount],
		"kind": "exp",
		"role": role,
		"amount": amount,
		"stableId": stable_id,
		"isLevelUp": false,
	})
	var levels_gained := maxi(0, int(entry.get("levelsGained", 0)))
	var level := maxi(0, int(entry.get("level", 0)))
	if levels_gained > 0 and level > 0:
		rows.append({
			"text": "%s升到了%d级！" % [display_name, level],
			"kind": "level_up",
			"role": role,
			"level": level,
			"levelsGained": levels_gained,
			"stableId": stable_id,
			"isLevelUp": true,
		})


static func _append_reward_rows(
	profile_entry: Dictionary,
	reward_rows: Array[Dictionary],
	warning_rows: Array[Dictionary]
) -> void:
	var rewards := profile_entry.get("rewards", {}) as Dictionary if profile_entry.get("rewards", {}) is Dictionary else {}
	if rewards.is_empty():
		return
	var stone_coins := maxi(0, int(rewards.get("stoneCoins", 0)))
	if stone_coins > 0:
		reward_rows.append({
			"text": "获得了%d石币" % stone_coins,
			"kind": "currency",
			"amount": stone_coins,
			"isLevelUp": false,
		})
	for item in _item_amounts(rewards.get("addedItems", [])):
		var label := BackpackModel.label_for(str(item.get("itemId", "")), "物品")
		reward_rows.append({
			"text": "获得了%s×%d" % [label, int(item.get("count", 0))],
			"kind": "item",
			"itemId": str(item.get("itemId", "")),
			"amount": int(item.get("count", 0)),
			"isLevelUp": false,
		})
	for item in _item_amounts(rewards.get("mailedItems", [])):
		var label := BackpackModel.label_for(str(item.get("itemId", "")), "物品")
		reward_rows.append({
			"text": "%s×%d已发邮箱" % [label, int(item.get("count", 0))],
			"kind": "mail",
			"itemId": str(item.get("itemId", "")),
			"amount": int(item.get("count", 0)),
			"isLevelUp": false,
		})
	for item in _item_amounts(rewards.get("lostItems", [])):
		var label := BackpackModel.label_for(str(item.get("itemId", "")), "物品")
		_append_unique_warning(
			warning_rows,
			"背包已满，%s×%d未进入背包。" % [label, int(item.get("count", 0))],
			"inventory"
		)


static func _append_capture_rows(profile_entry: Dictionary, rows: Array[Dictionary]) -> void:
	var captured: Array = profile_entry.get("capturedPets", []) if profile_entry.get("capturedPets", []) is Array else []
	for value in captured:
		if not (value is Dictionary):
			continue
		var pet := value as Dictionary
		var display_name := str(pet.get("name", pet.get("displayName", "宠物"))).strip_edges()
		if display_name == "":
			display_name = "宠物"
		var level := maxi(0, int(pet.get("level", 0)))
		rows.append({
			"text": "捕获了%s%s" % [display_name, " Lv%d" % level if level > 0 else ""],
			"kind": "capture",
			"isLevelUp": false,
		})


static func _append_skipped_writeback_warnings(
	room: Dictionary,
	account_id: String,
	warning_rows: Array[Dictionary]
) -> void:
	var writeback := _writeback(room)
	var skipped: Array = writeback.get("skippedProfiles", []) if writeback.get("skippedProfiles", []) is Array else []
	for value in skipped:
		if not (value is Dictionary):
			continue
		var entry := value as Dictionary
		if account_id != "" and str(entry.get("accountId", "")).strip_edges() != account_id:
			continue
		var reason := str(entry.get("reason", "")).strip_edges()
		var text := "部分战斗结果未写入服务器，请重新登录后确认。"
		if reason == "profile_binding_missing" or reason == "profile_document_missing":
			text = "本次战斗结果未写入服务器，请重新登录后确认。"
		elif reason == "pet_instance_missing":
			text = "部分宠物战斗结果未写入服务器，请打开宠物面板确认。"
		_append_unique_warning(warning_rows, text, "writeback")


static func _append_unique_warning(rows: Array[Dictionary], text: String, kind: String) -> void:
	var safe_text := text.strip_edges()
	if safe_text == "":
		return
	for row in rows:
		if str(row.get("text", "")) == safe_text:
			return
	rows.append({
		"text": safe_text,
		"kind": kind,
		"isLevelUp": false,
	})


static func _profile_entry(room: Dictionary, account_id: String) -> Dictionary:
	var writeback := _writeback(room)
	var profiles: Array = writeback.get("profiles", []) if writeback.get("profiles", []) is Array else []
	for value in profiles:
		if not (value is Dictionary):
			continue
		var profile := value as Dictionary
		if account_id == "" or str(profile.get("accountId", "")).strip_edges() == account_id:
			return profile.duplicate(true)
	return {}


static func _writeback(room: Dictionary) -> Dictionary:
	var direct := room.get("profileWriteback", {}) as Dictionary if room.get("profileWriteback", {}) is Dictionary else {}
	if not direct.is_empty():
		return direct
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	return battle.get("profileWriteback", {}) as Dictionary if battle.get("profileWriteback", {}) is Dictionary else {}


static func _outcome_id(room: Dictionary, account_id: String) -> String:
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var result := room.get("result", {}) as Dictionary if room.get("result", {}) is Dictionary else {}
	if result.is_empty():
		result = battle.get("result", {}) as Dictionary if battle.get("result", {}) is Dictionary else {}
	var record_id := str(
		room.get(
			"battleRecordId",
			result.get("battleRecordId", battle.get("battleRecordId", ""))
		)
	).strip_edges()
	if record_id == "":
		record_id = str(room.get("roomId", "battle_outcome")).strip_edges()
	if record_id == "":
		record_id = "battle_outcome"
	return "%s:%s" % [record_id, account_id if account_id != "" else "anonymous"]


static func _entry_stable_id(entry: Dictionary) -> String:
	for key in ["petInstanceId", "instanceId", "petId", "id"]:
		var value := str(entry.get(key, "")).strip_edges()
		if value != "":
			return value
	return ""


static func _item_amounts(value) -> Array[Dictionary]:
	var merged: Dictionary = {}
	var order: Array[String] = []
	if not (value is Array):
		return []
	for raw in value:
		if not (raw is Dictionary):
			continue
		var entry := raw as Dictionary
		var item_id := str(entry.get("itemId", "")).strip_edges()
		var count := maxi(0, int(entry.get("count", entry.get("amount", 0))))
		if item_id == "" or count <= 0:
			continue
		if not merged.has(item_id):
			order.append(item_id)
			merged[item_id] = 0
		merged[item_id] = int(merged.get(item_id, 0)) + count
	var result: Array[Dictionary] = []
	for item_id in order:
		result.append({"itemId": item_id, "count": int(merged.get(item_id, 0))})
	return result


static func _title_for_result(result_key: String) -> String:
	match result_key:
		RESULT_VICTORY:
			return "战斗胜利"
		RESULT_DEFEAT:
			return "战斗失败"
		RESULT_ESCAPE:
			return "已逃离战斗"
		"timeout":
			return "战斗超时"
		_:
			return "战斗结束"


static func _contains_fragment(values: Array[String], fragment: String) -> bool:
	for value in values:
		if value.find(fragment) >= 0:
			return true
	return false
