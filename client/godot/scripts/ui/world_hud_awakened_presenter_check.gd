extends SceneTree

const WorldHudAwakenedPresenter := preload(
	"res://scripts/ui/world_hud_awakened_presenter.gd"
)


func _initialize() -> void:
	call_deferred("_execute")


func _execute() -> void:
	var errors: Array[String] = []
	_check_identity(errors)
	_check_runtime_projection(errors)
	_check_host_runtime_contract(errors)
	_check_runtime_absence_contracts(errors)
	_check_menu_gates(errors)
	_check_combined_contract(errors)
	var result := {
		"ok": errors.is_empty(),
		"errors": errors,
	}
	print("WORLD_HUD_AWAKENED_PRESENTER_CHECK: %s" % JSON.stringify(result))
	quit(0 if errors.is_empty() else 1)


func _check_identity(errors: Array[String]) -> void:
	var profile := _fixture_profile()
	var original := profile.duplicate(true)
	var identity := WorldHudAwakenedPresenter.identity_state(profile)
	var player := identity.get("player", {}) as Dictionary
	var pet := identity.get("activeBattlePet", {}) as Dictionary
	_expect(bool(player.get("available", false)), "人物身份应可用", errors)
	_expect(str(player.get("name", "")) == "焰芽斗士", "人物姓名应来自 profile", errors)
	_expect(int(player.get("level", 0)) == 80, "人物等级应来自 profile", errors)
	_expect(int(player.get("hp", 0)) == 515, "人物当前生命应来自 profile", errors)
	_expect(int(player.get("maxHp", 0)) == 515, "人物最大生命应来自 profile", errors)
	_expect(int(player.get("exp", 0)) == 91703, "人物经验应来自 profile", errors)
	_expect(int(player.get("nextExp", 0)) == 119635, "人物升级经验应来自 profile", errors)
	_expect(
		str(player.get("portraitTexturePath", ""))
		== "res://assets/characters/ember_spark_v1/ui/portrait.png",
		"人物头像应解析到正式形象目录",
		errors
	)
	_expect(bool(pet.get("available", false)), "真实出战宠物应可用", errors)
	_expect(str(pet.get("name", "")) == "芽耳布伊", "应按 activePetInstanceId 选择战宠", errors)
	_expect(int(pet.get("level", 0)) == 77, "战宠等级应来自实例", errors)
	_expect(int(pet.get("hp", 0)) == 286, "战宠当前生命应来自实例", errors)
	_expect(int(pet.get("maxHp", 0)) == 310, "战宠最大生命应来自实例", errors)
	_expect(str(pet.get("formId", "")) == "bui_novice_sprout_earth5_wind5", "战宠形态应来自实例", errors)
	_expect(
		str(pet.get("portraitTexturePath", ""))
		== "res://assets/pets/novice_sprout_bui/portrait/default.png",
		"战宠头像应解析到独立正式大头照",
		errors
	)
	_expect(profile == original, "身份投影不得修改已规范化 profile", errors)

	var no_pet_profile := profile.duplicate(true)
	no_pet_profile["activePetInstanceId"] = ""
	var no_pet := WorldHudAwakenedPresenter.identity_state(no_pet_profile).get(
		"activeBattlePet",
		{}
	) as Dictionary
	_expect(not bool(no_pet.get("available", true)), "无出战宠时必须明确 unavailable", errors)
	_expect(not no_pet.has("name") and not no_pet.has("level"), "无出战宠时不得伪造宠物身份或等级", errors)

	var standby_profile := profile.duplicate(true)
	var pets := standby_profile.get("petInstances", []) as Array
	(pets[1] as Dictionary)["state"] = "standby"
	standby_profile["petInstances"] = pets
	var standby_pet := WorldHudAwakenedPresenter.identity_state(standby_profile).get(
		"activeBattlePet",
		{}
	) as Dictionary
	_expect(not bool(standby_pet.get("available", true)), "非 battle 状态不得冒充出战宠", errors)


func _check_runtime_projection(errors: Array[String]) -> void:
	var long_text := "最新消息" + "好".repeat(150)
	var members: Array[Dictionary] = []
	for index in range(7):
		members.append({
			"accountId": "account_%d" % index,
			"username": "hunter_%d" % index,
			"displayName": "队员%d" % index,
			"role": "leader" if index == 0 else "member",
			"online": index != 4,
			"connectionState": "online" if index != 4 else "offline",
			"teamSnapshot": {
				"player": {"hp": 100 - index, "maxHp": 100},
			},
		})
	var state := WorldHudAwakenedPresenter.runtime_state({
		"mapName": "火芽训练场",
		"playerCell": Vector2i(17, 23),
		"taskText": "前往导师处学习战斗",
		"party": {"members": members},
		"chatMessages": [
			{"author": "旧消息", "text": "不应被选择"},
			{
				"channel": "nearby",
				"author": "最后发言者",
				"text": long_text,
				"messageId": "message_latest",
			},
		],
		"mailbox": {
			"synced": true,
			"state": {"unreadCount": 4},
		},
		"line": {
			"available": true,
			"lineId": "line_2",
			"label": "二线",
			"playerCount": 81,
		},
		"menu": {
			"authenticated": true,
			"gmAccess": true,
			"battleActive": false,
		},
	})
	var cell := state.get("playerCell", {}) as Dictionary
	var party := state.get("party", {}) as Dictionary
	var projected_members := party.get("members", []) as Array
	var latest_chat := state.get("latestChat", {}) as Dictionary
	var mailbox := state.get("mailbox", {}) as Dictionary
	var line := state.get("line", {}) as Dictionary
	_expect(str(state.get("mapName", "")) == "火芽训练场", "地图名投影错误", errors)
	_expect(bool(cell.get("available", false)) and int(cell.get("x", 0)) == 17 and int(cell.get("y", 0)) == 23, "玩家格坐标投影错误", errors)
	_expect(projected_members.size() == 5, "队伍成员必须限制为五名", errors)
	_expect(bool(party.get("truncated", false)), "超出五人的队伍应标记截断", errors)
	_expect(str((projected_members[0] as Dictionary).get("displayName", "")) == "队员0", "队伍成员顺序应保留", errors)
	_expect(bool(latest_chat.get("available", false)), "末条聊天应可用", errors)
	_expect(str(latest_chat.get("author", "")) == "最后发言者", "只能投影传入数组末条聊天", errors)
	_expect(str(latest_chat.get("text", "")).begins_with("最新消息"), "末条聊天内容错误", errors)
	_expect(str(latest_chat.get("text", "")).length() == 120, "聊天正文必须有长度上限", errors)
	_expect(bool(latest_chat.get("textTruncated", false)), "聊天截断应显式标记", errors)
	_expect(bool(mailbox.get("unreadAvailable", false)) and int(mailbox.get("unreadCount", 0)) == 4, "同步邮件未读数应来自邮箱状态", errors)
	_expect(bool(line.get("available", false)) and str(line.get("lineId", "")) == "line_2", "明确可用的线路应按输入投影", errors)


func _check_runtime_absence_contracts(errors: Array[String]) -> void:
	var state := WorldHudAwakenedPresenter.runtime_state({
		"chatMessages": [],
		"mailbox": {
			"synced": false,
			"state": {"unreadCount": 99},
		},
	})
	var latest_chat := state.get("latestChat", {}) as Dictionary
	var mailbox := state.get("mailbox", {}) as Dictionary
	var line := state.get("line", {}) as Dictionary
	_expect(not bool(latest_chat.get("available", true)), "空聊天不得伪造通知", errors)
	_expect(not bool(mailbox.get("synced", true)), "未同步邮箱应保留未同步状态", errors)
	_expect(not bool(mailbox.get("unreadAvailable", true)), "未同步邮箱不得显示未读数", errors)
	_expect(not mailbox.has("unreadCount"), "未同步邮箱不得伪造零或沿用陈旧未读数", errors)
	_expect(not bool(line.get("available", true)), "无线路资料时 line.available 必须为 false", errors)
	_expect(line.size() == 1, "无线路资料时不得伪造线路名称或人数", errors)


func _check_host_runtime_contract(errors: Array[String]) -> void:
	var state := WorldHudAwakenedPresenter.runtime_state({
		"mapData": {"name": "真实主界面地图"},
		"partyState": {
			"party": {
				"members": [{"displayName": "主界面队员"}],
			},
		},
		"mailboxPageState": {"unreadCount": 6},
		"mailboxSynced": true,
		"accountAuthenticated": true,
		"gmToolsVisible": true,
		"battleActive": false,
	})
	var members := (state.get("party", {}) as Dictionary).get("members", []) as Array
	var mailbox := state.get("mailbox", {}) as Dictionary
	var menu := state.get("menu", {}) as Dictionary
	_expect(str(state.get("mapName", "")) == "真实主界面地图", "应兼容主界面 mapData.name", errors)
	_expect(members.size() == 1 and str((members[0] as Dictionary).get("displayName", "")) == "主界面队员", "应只读取主界面 partyState.party.members", errors)
	_expect(bool(mailbox.get("unreadAvailable", false)) and int(mailbox.get("unreadCount", 0)) == 6, "应兼容主界面已同步 mailboxPageState", errors)
	_expect(bool(menu.get("authenticated", false)) and bool(menu.get("gmAccess", false)), "应兼容主界面认证与 GM 可见门禁", errors)


func _check_menu_gates(errors: Array[String]) -> void:
	var unauthenticated := WorldHudAwakenedPresenter.runtime_state({}).get("menu", {}) as Dictionary
	var unauth_gates := unauthenticated.get("gates", {}) as Dictionary
	_expect(not bool(unauthenticated.get("authenticated", true)), "缺省不得冒充已登录", errors)
	_expect(not bool((unauth_gates.get("account", {}) as Dictionary).get("visible", true)), "未登录时账号入口应隐藏", errors)
	_expect(bool((unauth_gates.get("account", {}) as Dictionary).get("disabled", false)), "未登录时账号入口应禁用", errors)
	_expect(not bool((unauth_gates.get("gm", {}) as Dictionary).get("visible", true)), "无权限时 GM 入口应隐藏", errors)

	var battle := WorldHudAwakenedPresenter.runtime_state({
		"menu": {
			"authenticated": true,
			"gmAccess": true,
			"battleActive": true,
		},
	}).get("menu", {}) as Dictionary
	var battle_gates := battle.get("gates", {}) as Dictionary
	_expect(battle_gates.has("character"), "菜单门禁应使用 view 消费的 character 入口 ID", errors)
	_expect(not battle_gates.has("player"), "菜单门禁不得保留 view 无法消费的 player 入口 ID", errors)
	for entry_id in ["character", "backpack", "equipment", "pet", "map", "chat", "party", "family", "gm"]:
		_expect(bool((battle_gates.get(entry_id, {}) as Dictionary).get("disabled", false)), "战斗时应禁用入口：%s" % entry_id, errors)
	for entry_id in ["hang", "codex", "quest", "market", "mailbox", "auto", "account"]:
		_expect(not bool((battle_gates.get(entry_id, {}) as Dictionary).get("disabled", true)), "战斗时应保留当前可用入口：%s" % entry_id, errors)
	_expect(bool((battle_gates.get("account", {}) as Dictionary).get("visible", false)), "已登录时账号入口应显示", errors)
	_expect(bool((battle_gates.get("gm", {}) as Dictionary).get("visible", false)), "有权限时 GM 入口应显示", errors)


func _check_combined_contract(errors: Array[String]) -> void:
	var combined := WorldHudAwakenedPresenter.combined_state(_fixture_profile(), {})
	_expect(combined.has("identity") and combined.has("runtime"), "combined_state 应组合身份与运行态", errors)
	_expect(combined.has("player") and combined.has("activeBattlePet"), "combined_state 应提供 HUD 直接消费的身份投影", errors)
	for forbidden_key in ["activity", "vip", "currency"]:
		_expect(not combined.has(forbidden_key), "不得伪造顶层字段：%s" % forbidden_key, errors)
		_expect(not (combined.get("identity", {}) as Dictionary).has(forbidden_key), "身份态不得伪造字段：%s" % forbidden_key, errors)
		_expect(not (combined.get("runtime", {}) as Dictionary).has(forbidden_key), "运行态不得伪造字段：%s" % forbidden_key, errors)
	var line := (combined.get("runtime", {}) as Dictionary).get("line", {}) as Dictionary
	_expect(not bool(line.get("available", true)), "combined_state 不得用虚构线路填空", errors)


func _fixture_profile() -> Dictionary:
	return {
		"player": {
			"name": "焰芽斗士",
			"level": 80,
			"hp": 515,
			"maxHp": 515,
			"exp": 91703,
			"nextExp": 119635,
			"appearanceId": "ember_spark_v1",
		},
		"activePetInstanceId": "pet_active",
		"petInstances": [
			{
				"instanceId": "pet_not_active",
				"formId": "bui_normal_yellow_wind10",
				"name": "不应选中的宠物",
				"state": "battle",
				"level": 140,
				"hp": 999,
				"maxHp": 999,
			},
			{
				"instanceId": "pet_active",
				"formId": "bui_novice_sprout_earth5_wind5",
				"name": "芽耳布伊",
				"state": "battle",
				"level": 77,
				"hp": 286,
				"maxHp": 310,
			},
		],
	}


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
