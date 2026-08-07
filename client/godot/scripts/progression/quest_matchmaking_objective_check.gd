extends SceneTree

const QuestModel := preload("res://scripts/progression/quest_model.gd")


func _initialize() -> void:
	var report := run()
	print("quest matchmaking objective check: %s" % JSON.stringify(report))
	quit(0 if str(report.get("result", "FAIL")) == "PASS" else 1)


static func run() -> Dictionary:
	var errors: Array[String] = []
	var quest := QuestModel.quest_for_id("quest_training_partner_intro")
	var objective := QuestModel.objective_for(quest)
	_expect(not quest.is_empty(), "稳定任务 ID quest_training_partner_intro 丢失", errors)
	_expect(str(quest.get("title", "")) == "匹配陪练", "匹配陪练任务标题未迁移", errors)
	_expect(
		str(objective.get("type", "")) == "hang_matchmaking_join"
			and int(objective.get("count", 0)) == 1,
		"匹配陪练任务没有使用一次权威匹配事件",
		errors
	)
	_expect(
		QuestModel.supported_objective_types().has("hang_matchmaking_join")
			and QuestModel.supported_objective_types().has("training_partner_count"),
		"新匹配目标或旧存档兼容目标未注册",
		errors
	)
	var template := QuestModel.objective_template_for_type("hang_matchmaking_join")
	_expect(
		(template.get("eventTypes", []) as Array) == ["hang_matchmaking_join"]
			and str(template.get("label", "")) == "加入挂机匹配",
		"匹配目标模板与权威事件合同不一致",
		errors
	)
	_expect(
		QuestModel.progress_amount_for_event(quest, {
			"type": "hang_matchmaking_join",
			"amount": 1,
		}) == 1,
		"首次成功加入挂机匹配没有推进任务",
		errors
	)
	_expect(
		QuestModel.progress_amount_for_event(quest, {
			"type": "hang_matchmaking_join",
			"amount": 0,
		}) == 0,
		"未成功的匹配事件错误推进了任务",
		errors
	)
	_expect(
		QuestModel.progress_amount_for_event(quest, {
			"type": "training_partner_set_count",
			"count": 4,
			"amount": 1,
		}) == 0,
		"已退役的手工陪练事件仍能推进新任务",
		errors
	)

	var filtered_quest := {
		"id": "test_hang_matchmaking_route",
		"title": "匹配指定路线",
		"objective": {
			"type": "hang_matchmaking_join",
			"progressionZoneId": "progression_firebud_1_10",
			"mapId": "firebud_village_gate",
			"encounterGroupId": "firebud_grass_danger",
			"count": 1,
		},
	}
	var matching_event := {
		"type": "hang_matchmaking_join",
		"progressionZoneId": "progression_firebud_1_10",
		"mapId": "firebud_village_gate",
		"encounterGroupId": "firebud_grass_danger",
		"amount": 1,
	}
	_expect(
		QuestModel.progress_amount_for_event(filtered_quest, matching_event) == 1,
		"合法路线过滤未通过",
		errors
	)
	var wrong_route_event := matching_event.duplicate(true)
	wrong_route_event["encounterGroupId"] = "firebud_grass_01"
	_expect(
		QuestModel.progress_amount_for_event(filtered_quest, wrong_route_event) == 0,
		"错误遇敌组绕过了匹配任务过滤",
		errors
	)

	var legacy_quest := {
		"id": "legacy_training_partner_quest",
		"title": "旧陪练任务",
		"objective": {
			"type": "training_partner_count",
			"count": 2,
		},
	}
	_expect(
		QuestModel.progress_amount_for_event(legacy_quest, {
			"type": "training_partner_set_count",
			"count": 2,
			"amount": 1,
		}) == 2,
		"旧 training_partner_count 档案不再可读取",
		errors
	)
	_expect(
		QuestModel.progress_amount_for_event(legacy_quest, matching_event) == 0,
		"新匹配事件错误改写了旧手工陪练任务",
		errors
	)
	_expect(QuestModel.validation_errors().is_empty(), "正式任务目录校验失败", errors)

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.quest_matchmaking_objective_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"errors": errors,
	}


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
