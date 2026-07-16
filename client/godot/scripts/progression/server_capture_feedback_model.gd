extends RefCounted

const AUTHORITY_V1 := "pet_growth_authority_v1"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]


static func lines_for_writeback(profile_writeback: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var captured_values = profile_writeback.get("capturedPets", [])
	if captured_values is Array:
		for value in captured_values:
			if value is Dictionary:
				lines.append_array(_captured_pet_lines(value as Dictionary))
	var lost_values = profile_writeback.get("lostCapturedPets", [])
	if lost_values is Array:
		for value in lost_values:
			if value is Dictionary:
				lines.append(_lost_pet_line(value as Dictionary))
	return lines


static func contract_check() -> Dictionary:
	var authority := {
		"modelVersion": AUTHORITY_V1,
		"source": "server",
		"schemaVersion": 1,
		"settledLevel": 1,
	}
	var entry := {
		"capturedPets": [{
			"name": "普通乌力",
			"level": 1,
			"state": "standby",
			"maxHp": 83,
			"attack": 11,
			"defense": 7,
			"quick": 49,
			"initialStats": {"maxHp": 83, "attack": 11, "defense": 7, "quick": 49},
			"growthAuthority": authority,
			"captureFilterEvaluation": {
				"schemaVersion": 1,
				"stage": "post_capture",
				"status": "matched",
				"matched": true,
				"retainPet": true,
				"reasons": [{"code": "post_capture_public_rules_matched", "message": "Lv1 四维符合设置。"}],
			},
		}],
	}
	var lines := lines_for_writeback(entry)
	var text := "\n".join(lines)
	var not_matched_text := "\n".join(_capture_filter_lines({
		"captureFilterEvaluation": {
			"status": "not_matched",
			"reasons": [{"code": "owned_same_form_limit_reached", "message": "同形态持有数量已到设置上限。"}],
		},
	}))
	var unknown_text := "\n".join(_capture_filter_lines({
		"captureFilterEvaluation": {"status": "future_status", "reasons": ["private_seed_123"]},
	}))
	var nested_text := "\n".join(_capture_filter_lines({
		"captureFilterEvaluation": {"post": {"status": "unavailable", "reasons": []}},
	}))
	return {
		"ok": (
			text.find("捕获普通乌力 Lv1，已加入队伍。") >= 0
			and text.find("初始四维：生命83 攻击11 防御7 敏捷49。") >= 0
			and text.find("约 Lv20 再决定去留") >= 0
			and text.find("公开筛选：已命中") >= 0
			and text.find("Lv1 四维符合设置") >= 0
			and text.find("当前不会自动处理，宠物已保留") >= 0
			and not_matched_text.find("公开筛选：未命中") >= 0
			and not_matched_text.find("同形态持有数量已到设置上限") >= 0
			and unknown_text.find("公开筛选：无法判断") >= 0
			and unknown_text.find("private_seed_123") < 0
			and nested_text.find("公开筛选：无法判断") >= 0
			and text.find("private") < 0
			and text.find("seed") < 0
			and text.find("预测140") < 0
		),
		"lines": lines,
		"notMatchedText": not_matched_text,
		"unknownText": unknown_text,
		"nestedText": nested_text,
	}


static func _captured_pet_lines(pet: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	var name := str(pet.get("name", "宠物")).strip_edges()
	if name == "":
		name = "宠物"
	var level := maxi(1, int(pet.get("level", 1)))
	var state := str(pet.get("state", "standby"))
	var destination := "已加入队伍"
	if state == "storage":
		destination = "队伍已满，已送入兽栏"
	lines.append("捕获%s Lv%d，%s。" % [name, level, destination])
	var initial := _four_stats(pet.get("initialStats", pet.get("growthSpeciesLevel1Stats", {})))
	if not initial.is_empty():
		lines.append("初始四维：生命%d 攻击%d 防御%d 敏捷%d。" % [
			int(initial.get("maxHp", 0)),
			int(initial.get("attack", 0)),
			int(initial.get("defense", 0)),
			int(initial.get("quick", 0)),
		])
	lines.append_array(_capture_filter_lines(pet))
	var authority_value = pet.get("growthAuthority", {})
	var authority := authority_value as Dictionary if authority_value is Dictionary else {}
	if str(authority.get("modelVersion", pet.get("growthModelVersion", ""))) == AUTHORITY_V1:
		lines.append("从 Lv2 开始记录实际成长，建议训练到约 Lv20 再决定去留。")
	return lines


static func _capture_filter_lines(pet: Dictionary) -> Array[String]:
	var raw_value = pet.get("captureFilterEvaluation", {})
	if not (raw_value is Dictionary):
		return []
	var raw := raw_value as Dictionary
	if raw.is_empty():
		return []
	var nested_value = raw.get("post", {})
	var evaluation := nested_value as Dictionary if nested_value is Dictionary and not (nested_value as Dictionary).is_empty() else raw
	var status := str(evaluation.get("status", ""))
	if status == "disabled":
		return ["公开筛选：未启用，宠物已正常保留。"]
	var reason_text := _filter_reason_text(evaluation.get("reasons", []))
	var prefix := "公开筛选：无法判断。"
	if status == "matched":
		prefix = "公开筛选：已命中。"
	elif status == "not_matched":
		prefix = "公开筛选：未命中。"
	elif status != "unavailable":
		reason_text = ""
	if reason_text == "":
		reason_text = "公开信息不足。" if status == "unavailable" or not ["matched", "not_matched"].has(status) else ""
	var detail := "%s%s" % [prefix, reason_text]
	return ["%s当前不会自动处理，宠物已保留。" % detail]


static func _filter_reason_text(value) -> String:
	if not (value is Array):
		return ""
	var messages: Array[String] = []
	for reason_value in value as Array:
		var code := ""
		var message := ""
		if reason_value is Dictionary:
			var reason := reason_value as Dictionary
			code = str(reason.get("code", "")).strip_edges()
			message = _clean_player_text(str(reason.get("message", "")))
		else:
			code = str(reason_value).strip_edges()
		if message == "":
			message = _known_reason_text(code)
		if message == "" or messages.has(message):
			continue
		messages.append(message)
		if messages.size() >= 2:
			break
	return " ".join(messages)


static func _known_reason_text(code: String) -> String:
	match code:
		"auto_capture_disabled":
			return "自动捕捉未开启。"
		"actor_public_facts_unavailable", "pet_template_unavailable":
			return "目标的公开资料暂时不完整。"
		"actor_not_catchable":
			return "该目标不能捕捉。"
		"actor_not_alive":
			return "该目标已无法捕捉。"
		"hp_percent_not_matched":
			return "目标血量不符合设置。"
		"level_not_matched":
			return "目标等级不符合设置。"
		"target_identity_not_matched", "form_mismatch":
			return "形态不符合设置。"
		"pet_line_not_matched", "line_mismatch":
			return "系别不符合设置。"
		"pet_element_facts_unavailable":
			return "目标的元素资料暂时不完整。"
		"pet_element_not_matched", "element_mismatch":
			return "元素组合不符合设置。"
		"codex_history_unavailable":
			return "图鉴记录暂时无法确认。"
		"codex_form_already_captured", "not_new_codex_form":
			return "该形态已收录过图鉴。"
		"owned_form_count_unavailable":
			return "同形态持有数量暂时无法确认。"
		"owned_same_form_limit_reached", "owned_same_form_limit":
			return "同形态持有数量已到设置上限。"
		"pre_capture_public_rules_matched":
			return "抓前公开条件符合设置。"
		"pre_capture_evaluation_unavailable":
			return "抓前筛选结果暂时无法确认。"
		"pre_capture_rules_not_matched":
			return "抓前公开条件未命中。"
		"level_one_four_v_unavailable":
			return "Lv1 四维资料暂时不完整。"
		"level_one_four_v_inconsistent":
			return "Lv1 四维资料暂时无法确认。"
		"level_one_maxHp_below_min", "level_one_maxHp_above_max", "level_one_max_hp_mismatch":
			return "Lv1 生命不在设置范围。"
		"level_one_attack_below_min", "level_one_attack_above_max", "level_one_attack_mismatch":
			return "Lv1 攻击不在设置范围。"
		"level_one_defense_below_min", "level_one_defense_above_max", "level_one_defense_mismatch":
			return "Lv1 防御不在设置范围。"
		"level_one_quick_below_min", "level_one_quick_above_max", "level_one_quick_mismatch":
			return "Lv1 敏捷不在设置范围。"
		"post_capture_public_rules_not_matched":
			return "公开筛选条件未全部命中。"
		"post_capture_public_rules_matched", "level_one_four_v_matched":
			return "公开筛选条件全部命中。"
	return ""


static func _clean_player_text(value: String) -> String:
	var result := value.replace("\r", " ").replace("\n", " ").replace("\t", " ").strip_edges()
	while result.find("  ") >= 0:
		result = result.replace("  ", " ")
	return result.left(80)


static func _lost_pet_line(pet: Dictionary) -> String:
	var name := str(pet.get("name", "宠物")).strip_edges()
	if name == "":
		name = "宠物"
	return "捕获%s后没有可用收容位置，请立即清理宠物栏并联系管理员。" % name


static func _four_stats(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var result := {}
	for key in STAT_KEYS:
		var amount := int(source.get(key, 0))
		if amount <= 0:
			return {}
		result[key] = amount
	return result
