extends RefCounted
class_name QuestAwakenedPresenter

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const QuestModel := preload("res://scripts/progression/quest_model.gd")

const MAX_TRACKER_ENTRIES := 4
const SPECIAL_TASK_MM_GUIDE_ID := "special_pet_rebirth_mm_guide"
const SPECIAL_TASK_REBIRTH_TRIAL_ID := "special_player_rebirth_trial"


static func build_view_state(
	profile: Dictionary,
	selected_quest_id: String = "",
	special_task: Dictionary = {}
) -> Dictionary:
	var normalized := PlayerProgressModel.normalize_profile(profile)
	var rows := _catalog_rows(normalized)
	var special_row := _special_task_row(special_task)
	if not special_row.is_empty():
		rows.push_front(special_row)
	var resolved_selected_id := _resolved_selected_id(rows, selected_quest_id)
	var selected_row := _row_for_id(rows, resolved_selected_id)
	var selected_quest := QuestModel.quest_for_id(resolved_selected_id)
	var detail := (
		_special_task_detail(selected_row)
		if bool(selected_row.get("specialTask", false))
		else _detail_state(normalized, selected_quest, selected_row)
	)
	return {
		"title": "经典任务",
		"catalog": rows,
		"selectedQuestId": resolved_selected_id,
		"detail": detail,
		"trackerEntries": tracker_entries(normalized, MAX_TRACKER_ENTRIES, true),
	}


static func _special_task_row(special_task: Dictionary) -> Dictionary:
	var task_id := str(special_task.get("id", "")).strip_edges()
	var title := str(special_task.get("title", "")).strip_edges()
	if task_id == "" or title == "":
		return {}
	var display_status_id := str(
		special_task.get("displayStatusId", "active")
	).strip_edges()
	if not ["active", "available"].has(display_status_id):
		display_status_id = "active"
	return {
		"questId": task_id,
		"title": title,
		"formattedTitle": title,
		"categoryId": str(special_task.get("categoryId", "classic")),
		"categoryLabel": str(special_task.get("categoryLabel", "转生")),
		"objectiveText": str(special_task.get("taskText", title)),
		"statusText": str(
			special_task.get(
				"statusText",
				"可开始" if display_status_id == "available" else "正在进行"
			)
		),
		"displayStatusId": display_status_id,
		"active": display_status_id == "active",
		"accepted": display_status_id == "active",
		"claimed": false,
		"ready": false,
		"available": display_status_id == "available",
		"locked": false,
		"specialTask": true,
		"taskText": str(special_task.get("taskText", title)),
		"detailLines": _string_values(special_task.get("detailLines", [])),
	}


static func _special_task_detail(row: Dictionary) -> Dictionary:
	var detail_lines := _string_values(row.get("detailLines", []))
	var objective_text := str(row.get("taskText", row.get("title", "继续试炼")))
	var progress_text := ""
	var level_lines: Array[String] = []
	var description_lines: Array[String] = []
	for line in detail_lines:
		if line.begins_with("目标："):
			objective_text = line.trim_prefix("目标：").strip_edges()
		elif line.begins_with("进度："):
			progress_text = line.trim_prefix("进度：").strip_edges()
		elif line.begins_with("接取等级：") or line.begins_with("推荐等级："):
			level_lines.append(line)
		else:
			description_lines.append(line)
	if description_lines.is_empty():
		description_lines.append("完成当前阶段目标后，继续推进人物转生试炼。")
	return {
		"questId": str(row.get("questId", "")),
		"title": str(row.get("title", "转生试炼")),
		"formattedTitle": str(row.get("formattedTitle", row.get("title", "转生试炼"))),
		"categoryId": str(row.get("categoryId", "classic")),
		"categoryLabel": str(row.get("categoryLabel", "转生")),
		"statusId": str(row.get("displayStatusId", "active")),
		"statusText": str(row.get("statusText", "正在进行")),
		"description": "\n".join(description_lines),
		"objectiveText": objective_text,
		"levelText": "  ·  ".join(level_lines),
		"progressText": progress_text,
		"rewardText": "",
		"rewardEntries": [],
		"rewardChoices": [],
		"routeButtonText": "立即前往",
		"routeAllowedByState": true,
		"claimVisible": false,
		"legacyTitle": str(row.get("title", "转生试炼")),
		"legacyDetail": "\n".join(detail_lines),
	}


static func _string_values(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			result.append(str(item))
	return result


static func tracker_entries(
	profile: Dictionary,
	limit: int = MAX_TRACKER_ENTRIES,
	profile_is_normalized: bool = false
) -> Array[Dictionary]:
	var normalized := (
		profile
		if profile_is_normalized
		else PlayerProgressModel.normalize_profile(profile)
	)
	var rows := _catalog_rows(normalized)
	var result: Array[Dictionary] = []
	for pass_id in ["accepted", "available"]:
		for row in rows:
			if result.size() >= maxi(1, limit):
				return result
			var status_id := str(row.get("displayStatusId", ""))
			var include := false
			if pass_id == "accepted":
				include = ["active", "ready", "accepted"].has(status_id)
			else:
				include = status_id == "available"
			if not include:
				continue
			result.append({
				"questId": str(row.get("questId", "")),
				"categoryId": str(row.get("categoryId", "main")),
				"categoryLabel": str(row.get("categoryLabel", "主线")),
				"title": str(row.get("title", "任务")),
				"objectiveText": str(row.get("objectiveText", "")),
				"statusText": str(row.get("statusText", "")),
				"active": bool(row.get("active", false)),
				"ready": bool(row.get("ready", false)),
				"available": bool(row.get("available", false)),
			})
	return result


static func _catalog_rows(normalized: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var states_value = normalized.get("questStates", {})
	var states := states_value as Dictionary if states_value is Dictionary else {}
	var active_quest_id := PlayerProgressModel.active_quest_id(normalized, true)
	var first_available_main := PlayerProgressModel.first_available_unfinished_quest(
		normalized,
		true
	)
	var first_available_main_id := str(first_available_main.get("id", ""))
	var player_level := PlayerProgressModel.player_level(normalized, true)
	for quest in QuestModel.quests():
		if not bool(quest.get("runtimeEnabled", true)):
			continue
		var quest_id := str(quest.get("id", "")).strip_edges()
		if quest_id == "":
			continue
		var category := category_state(QuestModel.quest_type_for(quest))
		var has_state := states.has(quest_id) or active_quest_id == quest_id
		var state := PlayerProgressModel.quest_state_for_id(
			normalized,
			quest_id,
			true
		)
		var raw_status := str(state.get("status", QuestModel.STATUS_ACTIVE))
		var active := active_quest_id == quest_id
		var claimed := has_state and raw_status == QuestModel.STATUS_CLAIMED
		var ready := has_state and raw_status == QuestModel.STATUS_READY
		var available := false
		if not has_state:
			if QuestModel.is_optional(quest):
				available = PlayerProgressModel.quest_available_for_profile(
					normalized,
					quest,
					true
				)
			else:
				available = quest_id == first_available_main_id
		var display_status := _display_status(
			quest,
			active,
			has_state,
			claimed,
			ready,
			available,
			player_level
		)
		result.append({
			"questId": quest_id,
			"title": QuestModel.raw_title_for(quest),
			"formattedTitle": QuestModel.title_for(quest),
			"categoryId": str(category.get("id", "main")),
			"categoryLabel": str(category.get("label", "主线")),
			"objectiveText": QuestModel.objective_text_for(quest),
			"statusText": str(display_status.get("text", "")),
			"displayStatusId": str(display_status.get("id", "locked")),
			"active": active,
			"accepted": has_state and not claimed,
			"claimed": claimed,
			"ready": ready,
			"available": available,
			"locked": not has_state and not available,
			"progress": maxi(0, int(state.get("progress", 0))),
			"required": QuestModel.objective_required_count(quest),
			"requiredLevel": QuestModel.required_level_for(quest),
			"recommendedLevel": QuestModel.recommended_level_for(quest),
			"rawStatus": raw_status,
		})
	return result


static func _display_status(
	quest: Dictionary,
	active: bool,
	has_state: bool,
	claimed: bool,
	ready: bool,
	available: bool,
	player_level: int
) -> Dictionary:
	if claimed:
		return {"id": "claimed", "text": "已完成"}
	if active and ready:
		return {"id": "ready", "text": "可领取"}
	if active:
		return {"id": "active", "text": "正在进行"}
	if has_state and ready:
		return {"id": "ready", "text": "待交付"}
	if has_state:
		return {"id": "accepted", "text": "进行中"}
	if available:
		return {"id": "available", "text": "可接取"}
	var required_level := QuestModel.required_level_for(quest)
	var recommended_level := QuestModel.recommended_level_for(quest)
	if player_level < required_level:
		return {"id": "locked", "text": "接取等级：Lv%d" % required_level}
	if recommended_level > 0:
		return {"id": "locked", "text": "推荐等级：Lv%d" % recommended_level}
	return {"id": "locked", "text": "尚未开放"}


static func _resolved_selected_id(
	rows: Array[Dictionary],
	requested_id: String
) -> String:
	if requested_id != "" and not _row_for_id(rows, requested_id).is_empty():
		return requested_id
	for preferred_status in ["active", "ready", "accepted", "available"]:
		for row in rows:
			if str(row.get("displayStatusId", "")) == preferred_status:
				return str(row.get("questId", ""))
	return str(rows[0].get("questId", "")) if not rows.is_empty() else ""


static func _row_for_id(
	rows: Array[Dictionary],
	quest_id: String
) -> Dictionary:
	for row in rows:
		if str(row.get("questId", "")) == quest_id:
			return row
	return {}


static func _detail_state(
	normalized: Dictionary,
	quest: Dictionary,
	row: Dictionary
) -> Dictionary:
	if quest.is_empty() or row.is_empty():
		return {
			"title": "暂无任务",
			"description": "当前没有可查看的任务。",
			"objectiveText": "继续探索世界，新的任务会在这里出现。",
			"rewardEntries": [],
			"legacyTitle": "任务",
			"legacyDetail": "当前没有任务。",
		}
	var summary := str(quest.get("summary", "")).strip_edges()
	if summary == "":
		summary = "完成任务目标后即可领取对应奖励。"
	var reward_entries := _reward_entries(quest)
	var required := maxi(1, int(row.get("required", 1)))
	var progress := clampi(int(row.get("progress", 0)), 0, required)
	var status_id := str(row.get("displayStatusId", "locked"))
	var level_lines: Array[String] = []
	var required_level_text := QuestModel.required_level_text_for(
		quest,
		PlayerProgressModel.player_level(normalized, true)
	)
	if required_level_text != "":
		level_lines.append(required_level_text)
	var recommended_level_text := QuestModel.recommended_level_text_for(quest)
	if recommended_level_text != "":
		level_lines.append(recommended_level_text)
	var legacy_lines: Array[String] = [
		"任务：%s" % QuestModel.title_for(quest),
		"状态：%s" % str(row.get("statusText", "")),
	]
	legacy_lines.append_array(level_lines)
	legacy_lines.append("目标：%s" % QuestModel.objective_text_for(quest))
	if bool(row.get("accepted", false)):
		legacy_lines.append("进度：%d/%d" % [progress, required])
	legacy_lines.append("说明：%s" % summary)
	var reward_text := QuestModel.reward_text(quest)
	if reward_text != "":
		legacy_lines.append("奖励：%s" % reward_text)
	var reward_equipment_lines := QuestModel.reward_equipment_detail_lines(quest)
	if not reward_equipment_lines.is_empty():
		legacy_lines.append("奖励装备：")
		for equipment_line in reward_equipment_lines:
			legacy_lines.append("- %s" % equipment_line)
	return {
		"questId": str(row.get("questId", "")),
		"title": QuestModel.raw_title_for(quest),
		"formattedTitle": QuestModel.title_for(quest),
		"categoryId": str(row.get("categoryId", "main")),
		"categoryLabel": str(row.get("categoryLabel", "主线")),
		"statusId": status_id,
		"statusText": str(row.get("statusText", "")),
		"description": summary,
		"objectiveText": QuestModel.objective_text_for(quest),
		"levelText": "  ·  ".join(level_lines),
		"progressText": (
			"进度 %d/%d" % [progress, required]
			if bool(row.get("accepted", false))
			else ""
		),
		"rewardText": reward_text,
		"rewardEntries": reward_entries,
		"rewardChoices": QuestModel.reward_choices(quest),
		"routeButtonText": _route_button_text(status_id),
		"routeAllowedByState": not ["claimed", "locked"].has(status_id),
		"claimVisible": (
			str(row.get("questId", ""))
			== PlayerProgressModel.active_quest_id(normalized, true)
			and status_id == "ready"
		),
		"legacyTitle": QuestModel.title_for(quest),
		"legacyDetail": "\n".join(legacy_lines),
	}


static func _route_button_text(status_id: String) -> String:
	match status_id:
		"available":
			return "前往接取"
		"locked":
			return "前往查看"
		"claimed":
			return "已经完成"
	return "立即前往"


static func _reward_entries(quest: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var stone_coins := QuestModel.reward_stone_coins(quest)
	if stone_coins > 0:
		result.append({
			"kind": "currency",
			"id": "stoneCoins",
			"label": "石币",
			"count": stone_coins,
		})
	for item in QuestModel.reward_items(quest):
		var item_id := str(item.get("itemId", ""))
		result.append({
			"kind": "item",
			"id": item_id,
			"label": BackpackModel.label_for(item_id),
			"count": maxi(1, int(item.get("count", 1))),
		})
	for ability in QuestModel.reward_abilities(quest):
		result.append({
			"kind": "ability",
			"id": str(ability.get("abilityId", "")),
			"label": str(ability.get("label", "能力")),
			"count": 1,
		})
	return result


static func category_state(quest_type: String) -> Dictionary:
	match quest_type.strip_edges().to_lower():
		"classic":
			return {"id": "classic", "label": "经典"}
		"experience":
			return {"id": "experience", "label": "经验"}
		"side", "optional":
			return {"id": "side", "label": "支线"}
	return {"id": "main", "label": "主线"}
