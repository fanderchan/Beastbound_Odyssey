extends RefCounted

const REBIRTH_COUNT_KEY := "rebirthCount"
const REBIRTH_HISTORY_KEY := "rebirthHistory"
const REBIRTH_QUEST_COMPLETIONS_KEY := "rebirthQuestCompletions"
const MAX_REBIRTH_COUNT := 6
const MIN_REBIRTH_LEVEL := 80
const PREVIEW_LEVEL_CAP := 140
const FORMULA_VERSION := 1
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const DEFAULT_BASE_STATS := {
	"maxHp": 120,
	"attack": 18,
	"defense": 6,
	"quick": 70,
}


static func default_fields() -> Dictionary:
	return {
		REBIRTH_COUNT_KEY: 0,
		REBIRTH_HISTORY_KEY: [],
		REBIRTH_QUEST_COMPLETIONS_KEY: [],
	}


static func normalize_profile(profile: Dictionary) -> Dictionary:
	var normalized := profile.duplicate(true)
	normalized[REBIRTH_COUNT_KEY] = clampi(int(normalized.get(REBIRTH_COUNT_KEY, 0)), 0, MAX_REBIRTH_COUNT)
	normalized[REBIRTH_HISTORY_KEY] = _normalize_history(normalized.get(REBIRTH_HISTORY_KEY, []))
	normalized[REBIRTH_QUEST_COMPLETIONS_KEY] = _valid_unique_string_array(normalized.get(REBIRTH_QUEST_COMPLETIONS_KEY, []))
	return normalized


static func rebirth_count(profile: Dictionary) -> int:
	return clampi(int(profile.get(REBIRTH_COUNT_KEY, 0)), 0, MAX_REBIRTH_COUNT)


static func quest_completions(profile: Dictionary) -> Array[String]:
	return _valid_unique_string_array(profile.get(REBIRTH_QUEST_COMPLETIONS_KEY, []))


static func quest_id_for_target(target_count: int) -> String:
	return "rebirth_%d" % clampi(target_count, 1, MAX_REBIRTH_COUNT)


static func stage_label(count: int) -> String:
	return "%d转" % clampi(count, 0, MAX_REBIRTH_COUNT)


static func target_stage_label(target_count: int) -> String:
	match clampi(target_count, 1, MAX_REBIRTH_COUNT):
		1:
			return "一转"
		2:
			return "二转"
		3:
			return "三转"
		4:
			return "四转"
		5:
			return "五转"
		_:
			return "六转"


static func required_quest_label_for_target(target_count: int) -> String:
	return "%s任务链" % target_stage_label(target_count)


static func requirement_state(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var count := rebirth_count(normalized)
	var target_count := clampi(count + 1, 1, MAX_REBIRTH_COUNT)
	var player := _player_dict(normalized)
	var level := maxi(1, int(player.get("level", 1)))
	var completions := quest_completions(normalized)
	var quest_id := quest_id_for_target(target_count)
	var limit_ok := count < MAX_REBIRTH_COUNT
	var level_ok := level >= MIN_REBIRTH_LEVEL
	var quest_ok := completions.has(quest_id)
	var reasons: Array[String] = []
	if not limit_ok:
		reasons.append("已达到%d转上限。" % MAX_REBIRTH_COUNT)
	if not level_ok:
		reasons.append("人物需要 Lv%d。" % MIN_REBIRTH_LEVEL)
	if limit_ok and not quest_ok:
		reasons.append("%s未完成。" % required_quest_label_for_target(target_count))
	return {
		"ok": limit_ok and level_ok and quest_ok,
		"fromCount": count,
		"targetCount": target_count,
		"level": level,
		"levelOk": level_ok,
		"questOk": quest_ok,
		"limitOk": limit_ok,
		"questId": quest_id,
		"questLabel": required_quest_label_for_target(target_count),
		"reasons": reasons,
	}


static func preview(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var requirement := requirement_state(normalized)
	var player := _player_dict(normalized)
	var before_stats := _base_stats_from_player(player)
	var carry_score := _stat_carry_score(
		maxi(1, int(player.get("level", 1))),
		before_stats,
		int(requirement.get("targetCount", 1))
	)
	var after_stats := _preview_after_stats(before_stats, carry_score)
	return {
		"ok": bool(requirement.get("ok", false)),
		"formulaVersion": FORMULA_VERSION,
		"fromCount": int(requirement.get("fromCount", 0)),
		"targetCount": int(requirement.get("targetCount", 1)),
		"currentLevel": maxi(1, int(player.get("level", 1))),
		"afterLevel": 1,
		"questLabel": str(requirement.get("questLabel", "")),
		"reasons": requirement.get("reasons", []),
		"beforeStats": before_stats,
		"afterStats": after_stats,
		"statCarryScore": carry_score,
	}


static func preview_lines(profile: Dictionary) -> Array[String]:
	var data := preview(profile)
	var before_stats := data.get("beforeStats", {}) as Dictionary
	var after_stats := data.get("afterStats", {}) as Dictionary
	var lines: Array[String] = []
	lines.append("转生预览")
	lines.append("阶段: %s -> %s" % [
		stage_label(int(data.get("fromCount", 0))),
		stage_label(int(data.get("targetCount", 1))),
	])
	lines.append("资格: %s" % ("可转生" if bool(data.get("ok", false)) else "未满足"))
	lines.append("要求: 人物 Lv%d；%s；未达%d转上限" % [
		MIN_REBIRTH_LEVEL,
		str(data.get("questLabel", "")),
		MAX_REBIRTH_COUNT,
	])
	var reasons: Array = data.get("reasons", [])
	if not reasons.is_empty():
		var reason_texts: Array[String] = []
		for reason in reasons:
			reason_texts.append(str(reason))
		lines.append("未满足: %s" % " ".join(reason_texts))
	lines.append("当前: Lv%d  %s" % [int(data.get("currentLevel", 1)), _stats_text(before_stats)])
	lines.append("转生后预览: Lv%d  %s" % [int(data.get("afterLevel", 1)), _stats_text(after_stats)])
	lines.append("说明: 执行转生前会再次确认。")
	return lines


static func execute_rebirth(profile: Dictionary, next_exp_level_1: int = 120) -> Dictionary:
	var normalized := normalize_profile(profile)
	var data := preview(normalized)
	if not bool(data.get("ok", false)):
		var reasons: Array = data.get("reasons", [])
		var reason_texts: Array[String] = []
		for reason in reasons:
			reason_texts.append(str(reason))
		var message := "暂时不能转生。"
		if not reason_texts.is_empty():
			message = "暂时不能转生：%s" % " ".join(reason_texts)
		return {
			"ok": false,
			"profile": normalized,
			"message": message,
		}
	var player := _player_dict(normalized).duplicate(true)
	var before_stats := (data.get("beforeStats", {}) as Dictionary).duplicate(true)
	var after_stats := (data.get("afterStats", {}) as Dictionary).duplicate(true)
	var from_count := int(data.get("fromCount", 0))
	var target_count := int(data.get("targetCount", from_count + 1))
	var history := _normalize_history(normalized.get(REBIRTH_HISTORY_KEY, []))
	history.append({
		"fromRebirth": from_count,
		"toRebirth": target_count,
		"level": maxi(1, int(player.get("level", 1))),
		"formulaVersion": FORMULA_VERSION,
		"questId": quest_id_for_target(target_count),
		"baseStatsBefore": before_stats,
		"baseStatsAfter": after_stats,
		"statCarryScore": int(data.get("statCarryScore", 0)),
	})
	player["level"] = 1
	player["exp"] = 0
	player["nextExp"] = maxi(1, next_exp_level_1)
	player["baseStats"] = after_stats
	player["statPoints"] = 0
	player["hp"] = maxi(1, int(after_stats.get("maxHp", DEFAULT_BASE_STATS.get("maxHp", 120))))
	player["maxHp"] = maxi(1, int(after_stats.get("maxHp", DEFAULT_BASE_STATS.get("maxHp", 120))))
	normalized["player"] = player
	normalized[REBIRTH_COUNT_KEY] = target_count
	normalized[REBIRTH_HISTORY_KEY] = history
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "完成%s。等级回到 Lv1，基础能力已重算。" % target_stage_label(target_count),
		"fromCount": from_count,
		"targetCount": target_count,
		"afterStats": after_stats,
	}


static func with_rebirth_count(profile: Dictionary, count: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[REBIRTH_COUNT_KEY] = clampi(count, 0, MAX_REBIRTH_COUNT)
	return normalize_profile(normalized)


static func with_rebirth_quest_completed(profile: Dictionary, target_count: int, completed: bool = true) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := quest_id_for_target(target_count)
	var completions := quest_completions(normalized)
	if completed:
		if not completions.has(quest_id):
			completions.append(quest_id)
	else:
		completions.erase(quest_id)
	normalized[REBIRTH_QUEST_COMPLETIONS_KEY] = completions
	return normalize_profile(normalized)


static func _normalize_history(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry in value:
			if entry is Dictionary:
				result.append((entry as Dictionary).duplicate(true))
	return result


static func _valid_unique_string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for raw in value:
			var text := str(raw).strip_edges()
			if text != "" and not result.has(text):
				result.append(text)
	return result


static func _player_dict(profile: Dictionary) -> Dictionary:
	var player = profile.get("player", {})
	return player as Dictionary if player is Dictionary else {}


static func _base_stats_from_player(player: Dictionary) -> Dictionary:
	var raw = player.get("baseStats", {})
	var source := raw as Dictionary if raw is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = maxi(1, int(source.get(key, DEFAULT_BASE_STATS.get(key, 1))))
	return result


static func _stat_carry_score(level: int, before_stats: Dictionary, target_count: int) -> int:
	var capped_level := clampi(level, MIN_REBIRTH_LEVEL, PREVIEW_LEVEL_CAP)
	var level_score := float(maxi(0, capped_level - MIN_REBIRTH_LEVEL))
	var old_score := (
		float(int(before_stats.get("maxHp", 1))) / 4.0
		+ float(int(before_stats.get("attack", 1)))
		+ float(int(before_stats.get("defense", 1)))
		+ float(int(before_stats.get("quick", 1)))
	)
	var stage_score := float(clampi(target_count, 1, MAX_REBIRTH_COUNT)) * 8.0
	return maxi(1, int(round(level_score * 0.35 + old_score / 12.0 + stage_score)))


static func _preview_after_stats(before_stats: Dictionary, carry_score: int) -> Dictionary:
	var after := DEFAULT_BASE_STATS.duplicate(true)
	var weighted_total := (
		float(int(before_stats.get("maxHp", 1))) / 4.0
		+ float(int(before_stats.get("attack", 1)))
		+ float(int(before_stats.get("defense", 1)))
		+ float(int(before_stats.get("quick", 1)))
	)
	if weighted_total <= 0.0:
		return after
	var hp_share := (float(int(before_stats.get("maxHp", 1))) / 4.0) / weighted_total
	after["maxHp"] = maxi(1, int(after.get("maxHp", 120)) + int(round(float(carry_score) * hp_share * 4.0)))
	for key in ["attack", "defense", "quick"]:
		var share := float(int(before_stats.get(key, 1))) / weighted_total
		after[key] = maxi(1, int(after.get(key, 1)) + int(round(float(carry_score) * share)))
	return after


static func _stats_text(stats: Dictionary) -> String:
	return "生命 %d    攻击 %d    防御 %d    敏捷 %d" % [
		int(stats.get("maxHp", 0)),
		int(stats.get("attack", 0)),
		int(stats.get("defense", 0)),
		int(stats.get("quick", 0)),
	]
