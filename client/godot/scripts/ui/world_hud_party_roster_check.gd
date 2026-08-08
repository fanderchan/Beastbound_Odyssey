extends SceneTree

const WorldHudPartyRosterPresenter := preload(
	"res://scripts/ui/world_hud_party_roster_presenter.gd"
)
const WorldHudPartyRosterView := preload(
	"res://scripts/ui/world_hud_party_roster_view.gd"
)
const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const COMPONENT_POSITION := Vector2(1034.0, 108.0)
const COMPONENT_SIZE := Vector2(206.0, 402.0)
const FORBIDDEN_PLAYER_TOKENS: Array[String] = [
	"accountid",
	"queueid",
	"schemaversion",
	"npcfillinms",
	"debug",
	"http://",
	"https://",
]

var _errors: Array[String] = []
var _tab_events: Array[String] = []
var _detail_count := 0
var _cancel_count := 0
var _view: WorldHudPartyRosterView


func _initialize() -> void:
	call_deferred("_run")


static func run_static_check() -> Dictionary:
	var errors: Array[String] = []
	var state := WorldHudPartyRosterPresenter.present(_fixture())
	var rows = state.get("rows", [])
	if not (rows is Array) or (rows as Array).size() != 5:
		errors.append("组队侧栏没有投影固定五个席位")
	else:
		var kinds: Array[String] = []
		for raw_row in rows as Array:
			if raw_row is Dictionary:
				kinds.append(str((raw_row as Dictionary).get("kind", "")))
		if kinds != ["human", "human", "npc", "npc", "empty"]:
			errors.append("组队席位没有区分真人、NPC陪练与空位：%s" % str(kinds))
		var first := (rows as Array)[0] as Dictionary
		if str(first.get("levelText", "")) != "2转98级":
			errors.append("已有权威转生字段时没有显示转生等级")
		var second := (rows as Array)[1] as Dictionary
		if "转" in str(second.get("levelText", "")):
			errors.append("缺少权威转生字段时伪造了转生次数")
		var npc := (rows as Array)[2] as Dictionary
		if str(npc.get("kindLabel", "")) != "NPC陪练":
			errors.append("NPC席位没有显式标注NPC陪练")
		if not bool(npc.get("matchmakingNpc", false)):
			errors.append("NPC席位没有保留服务端matchmakingNpc身份")
		var npc_portrait := str(npc.get("portraitTexturePath", ""))
		if (
			str(npc.get("appearanceId", "")) != ""
			or npc_portrait != WorldHudPartyRosterPresenter.EMPTY_SLOT_ICON_PATH
			or npc_portrait in _human_creation_portrait_paths()
		):
			errors.append("无权威头像的NPC陪练没有使用中性正式资源")
		var empty := (rows as Array)[4] as Dictionary
		if str(empty.get("portraitTexturePath", "")) == "":
			errors.append("空位没有使用正式低透明度组队图标")
	if "下一场替换" not in str(state.get("statusText", "")):
		errors.append("真人加入后没有说明下一场替换陪练")
	var solo_source := _fixture()
	var solo_match := solo_source.get("match", {}) as Dictionary
	var solo_party := solo_match.get("party", {}) as Dictionary
	var solo_members := solo_party.get("members", []) as Array
	solo_party["members"] = [solo_members[0]]
	solo_match["humanCount"] = 1
	solo_match["npcCount"] = 4
	solo_match["emptyCount"] = 0
	var solo_npcs := solo_match.get("npcMembers", []) as Array
	solo_npcs.append({
		"displayName": "潮石陪练",
		"level": 80,
		"controller": "server_ai",
		"matchmakingNpc": true,
	})
	solo_npcs.append({
		"displayName": "青藤陪练",
		"level": 80,
		"controller": "server_ai",
		"matchmakingNpc": true,
	})
	var solo_state := WorldHudPartyRosterPresenter.present(solo_source)
	if (
		"继续找真人" not in str(solo_state.get("statusText", ""))
		or "下一场替换" in str(solo_state.get("statusText", ""))
	):
		errors.append("单真人加陪练状态没有保持继续寻找真人")
	var full_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"active": false,
			"status": "full",
			"humanCount": 5,
			"npcCount": 0,
			"emptyCount": 0,
			"maxMembers": 5,
		}
	})
	if str(full_state.get("statusText", "")) != "真人队伍已满":
		errors.append("五名真人满员状态文案不正确")
	var shared_name := "同名猎人"
	var local_portrait := "res://qa/local-identity-portrait-must-not-leak.png"
	var local_identity := {
		"accountId": "account-local",
		"displayName": shared_name,
		"appearanceId": "qa_local_appearance_v1",
		"portraitTexturePath": local_portrait,
		"rebirthCount": 7,
		"elements": {"fire": 10},
	}
	var different_account_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"maxMembers": 5,
			"party": {
				"members": [{
					"accountId": "account-remote",
					"displayName": shared_name,
					"teamSnapshot": {
						"player": {
							"level": 21,
							"appearanceId": "qa_remote_appearance_v1",
						},
					},
				}],
			},
		},
	}, local_identity)
	var different_account_rows = different_account_state.get("rows", [])
	if not (different_account_rows is Array) or (different_account_rows as Array).is_empty():
		errors.append("同名异账号权威队员没有生成席位")
	else:
		var different_account_row := (different_account_rows as Array)[0] as Dictionary
		var different_account_portrait := str(
			different_account_row.get("portraitTexturePath", "")
		)
		if (
			str(different_account_row.get("appearanceId", "")) != "qa_remote_appearance_v1"
			or int(different_account_row.get("rebirthCount", -1)) != -1
			or str(different_account_row.get("elementId", "")) != ""
			or different_account_portrait == local_portrait
			or different_account_portrait != WorldHudPartyRosterPresenter.EMPTY_SLOT_ICON_PATH
			or different_account_portrait in _human_creation_portrait_paths()
		):
			errors.append("同名异账号被错误套用了本地形象、转生或元素")
	var flat_different_account_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"maxMembers": 5,
			"members": [{
				"kind": "human",
				"accountId": "account-flat-remote",
				"name": shared_name,
				"level": 22,
			}],
		},
	}, local_identity)
	var flat_different_account_rows = flat_different_account_state.get("rows", [])
	if not (flat_different_account_rows is Array) or (flat_different_account_rows as Array).is_empty():
		errors.append("同名异账号扁平队员没有生成席位")
	else:
		var flat_different_account_row := (flat_different_account_rows as Array)[0] as Dictionary
		var flat_different_account_portrait := str(
			flat_different_account_row.get("portraitTexturePath", "")
		)
		if (
			str(flat_different_account_row.get("appearanceId", "")) == "qa_local_appearance_v1"
			or flat_different_account_portrait == local_portrait
			or flat_different_account_portrait != WorldHudPartyRosterPresenter.EMPTY_SLOT_ICON_PATH
			or flat_different_account_portrait in _human_creation_portrait_paths()
		):
			errors.append("同名异账号扁平队员被错误套用了本地或随机真人形象")
	var same_account_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"maxMembers": 5,
			"party": {
				"members": [{
					"accountId": "account-local",
					"displayName": "本地猎人",
					"teamSnapshot": {"player": {"level": 24}},
				}],
			},
		},
	}, local_identity)
	var same_account_rows = same_account_state.get("rows", [])
	if not (same_account_rows is Array) or (same_account_rows as Array).is_empty():
		errors.append("同账号本地队员没有生成席位")
	else:
		var same_account_row := (same_account_rows as Array)[0] as Dictionary
		if (
			str(same_account_row.get("appearanceId", "")) != "qa_local_appearance_v1"
			or str(same_account_row.get("portraitTexturePath", "")) != local_portrait
			or int(same_account_row.get("rebirthCount", -1)) != 7
			or str(same_account_row.get("elementId", "")) != "fire"
		):
			errors.append("同账号本地队员没有使用明确本地身份头像与属性")
	var no_id_local_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"maxMembers": 5,
			"party": {
				"members": [{
					"displayName": shared_name,
					"teamSnapshot": {"player": {"level": 23}},
				}],
			},
		},
	}, {
		"displayName": shared_name,
		"appearanceId": "qa_name_fallback_appearance_v1",
		"rebirthCount": 3,
		"elements": {"water": 9},
	})
	var no_id_local_rows = no_id_local_state.get("rows", [])
	if not (no_id_local_rows is Array) or (no_id_local_rows as Array).is_empty():
		errors.append("双方无账号ID的同名回退没有生成席位")
	else:
		var no_id_local_row := (no_id_local_rows as Array)[0] as Dictionary
		if (
			str(no_id_local_row.get("appearanceId", "")) != "qa_name_fallback_appearance_v1"
			or int(no_id_local_row.get("rebirthCount", -1)) != 3
			or str(no_id_local_row.get("elementId", "")) != "water"
		):
			errors.append("双方无账号ID时没有按同名安全回退本地身份")
	_append_matchmaking_truth_errors(errors)
	var view := WorldHudPartyRosterView.new()
	view.prepare()
	if view.custom_minimum_size != COMPONENT_SIZE:
		errors.append("组队侧栏组件不是可嵌入的206×402")
	if view.task_content_parent() == null:
		errors.append("任务页没有暴露既有任务body挂载点")
	view.free()
	return {
		"schemaVersion": 1,
		"reportType": "beastbound.world_hud_party_roster_static_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"errors": errors,
	}


static func _human_creation_portrait_paths() -> Array[String]:
	var paths: Array[String] = []
	for entry in PlayerAppearanceCatalog.creation_entries():
		if entry is Dictionary:
			paths.append(str((entry as Dictionary).get("portraitTexturePath", "")))
	return paths


static func _append_matchmaking_truth_errors(errors: Array[String]) -> void:
	var idle_transport_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"active": false,
			"status": "idle",
			"queueId": "",
			"humanCount": 1,
			"npcCount": 0,
			"maxMembers": 5,
			"party": {},
		},
	})
	if (
		int(idle_transport_state.get("humanCount", -1)) != 0
		or str(idle_transport_state.get("statusText", "")) != "暂未组队"
	):
		errors.append("空闲传输态的humanCount=1被错误投影成虚构队友")
	for raw_row in idle_transport_state.get("rows", []):
		if raw_row is Dictionary and str((raw_row as Dictionary).get("kind", "")) == "human":
			errors.append("空闲无队伍状态出现了真人同步占位")
			break

	var party_with_offline_member := {
		"members": [
			{
				"accountId": "account-online",
				"displayName": "在线猎人",
				"online": true,
				"level": 31,
			},
			{
				"accountId": "account-offline",
				"displayName": "离线猎人",
				"online": false,
				"level": 32,
			},
		],
	}
	var npc_members: Array[Dictionary] = []
	for index in range(4):
		npc_members.append({
			"displayName": "陪练%d" % (index + 1),
			"level": 30,
			"matchmakingNpc": true,
		})
	var matching_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"active": true,
			"status": "npc_filled",
			"queueId": "queue-online-only",
			"humanCount": 2,
			"npcCount": 4,
			"maxMembers": 5,
			"party": party_with_offline_member,
			"npcMembers": npc_members,
		},
	})
	var matching_rows = matching_state.get("rows", [])
	var matching_names: Array[String] = []
	if matching_rows is Array:
		for raw_row in matching_rows as Array:
			if raw_row is Dictionary:
				matching_names.append(str((raw_row as Dictionary).get("name", "")))
	if (
		int(matching_state.get("humanCount", -1)) != 1
		or int(matching_state.get("npcCount", -1)) != 4
		or "离线猎人" in matching_names
	):
		errors.append("匹配队伍没有只投影在线真人，或错误挤掉了NPC陪练")

	var ordinary_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"active": false,
			"status": "idle",
			"queueId": "",
			"maxMembers": 5,
			"party": party_with_offline_member,
		},
	})
	var ordinary_rows = ordinary_state.get("rows", [])
	var ordinary_offline_visible := false
	if ordinary_rows is Array:
		for raw_row in ordinary_rows as Array:
			if (
				raw_row is Dictionary
				and str((raw_row as Dictionary).get("name", "")) == "离线猎人"
				and not bool((raw_row as Dictionary).get("online", true))
			):
				ordinary_offline_visible = true
	if not ordinary_offline_visible:
		errors.append("普通非匹配队伍错误隐藏了离线队员卡")

	var missing_details_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"active": true,
			"status": "matching",
			"queueId": "queue-missing-details",
			"humanCount": 2,
			"npcCount": 0,
			"maxMembers": 5,
			"party": {},
		},
	})
	var missing_detail_names: Array[String] = []
	for raw_row in missing_details_state.get("rows", []):
		if raw_row is Dictionary and str((raw_row as Dictionary).get("kind", "")) == "human":
			missing_detail_names.append(str((raw_row as Dictionary).get("name", "")))
	if (
		missing_detail_names != ["队友信息同步中", "队友信息同步中"]
		or "真人队友" in missing_detail_names
	):
		errors.append("缺少member详情时没有使用中性同步占位")

	var unnamed_member_state := WorldHudPartyRosterPresenter.present({
		"match": {
			"active": true,
			"status": "matching",
			"queueId": "queue-unnamed-member",
			"humanCount": 1,
			"maxMembers": 5,
			"party": {
				"members": [{"accountId": "account-unnamed", "online": true}],
			},
		},
	})
	var unnamed_rows = unnamed_member_state.get("rows", [])
	if (
		not (unnamed_rows is Array)
		or (unnamed_rows as Array).is_empty()
		or str(((unnamed_rows as Array)[0] as Dictionary).get("name", "")) != "队友信息同步中"
		or int(((unnamed_rows as Array)[0] as Dictionary).get("level", -1)) != 0
		or str(((unnamed_rows as Array)[0] as Dictionary).get("levelText", "")) != "资料同步中"
		or not bool(((unnamed_rows as Array)[0] as Dictionary).get("detailsPending", false))
	):
		errors.append("缺少姓名或等级的真实member记录没有保持中性资料同步状态")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	var background := ColorRect.new()
	background.color = Color("553522")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(background)
	var world_hint := Label.new()
	world_hint.text = "赤岩峡谷 · 世界HUD嵌入预览"
	world_hint.position = Vector2(54.0, 54.0)
	world_hint.add_theme_font_size_override("font_size", 22)
	world_hint.add_theme_color_override("font_color", Color("f2dca8"))
	background.add_child(world_hint)

	var static_report := run_static_check()
	for raw_error in static_report.get("errors", []):
		_errors.append(str(raw_error))
	_view = WorldHudPartyRosterView.new()
	_view.name = "WorldHudPartyRosterCheckSubject"
	_view.position = COMPONENT_POSITION
	_view.size = COMPONENT_SIZE
	_view.tab_changed.connect(func(tab_id: String) -> void: _tab_events.append(tab_id))
	_view.match_detail_requested.connect(func() -> void: _detail_count += 1)
	_view.cancel_match_requested.connect(func() -> void: _cancel_count += 1)
	root.add_child(_view)
	_view.apply_state(WorldHudPartyRosterPresenter.present(_fixture()))
	await _settle()
	_append_layout_and_text_errors()
	await _capture_if_requested("world-hud-party-roster-1280x720.png")
	await _real_left_click(_view.task_tab_button)
	_expect(_view.active_tab() == "task", "任务页签不能由真实左键切换")
	var external_task := PanelContainer.new()
	var external_label := Label.new()
	external_label.text = "[主线] 前往赤岩峡谷调查异动"
	external_task.add_child(external_label)
	_view.set_task_content(external_task)
	await _settle()
	_expect(
		_view.task_content_parent().is_ancestor_of(external_task),
		"既有任务body没有嵌入任务页签"
	)
	await _real_left_click(_view.party_tab_button)
	_expect(_view.active_tab() == "party", "组队页签不能由真实左键切换")
	await _real_left_click(_view.detail_button)
	await _real_left_click(_view.cancel_button)
	_expect(_tab_events == ["task", "party"], "双页签事件顺序不正确：%s" % str(_tab_events))
	_expect(_detail_count == 1, "查看匹配没有发出一次事件")
	_expect(_cancel_count == 1, "取消匹配没有发出一次事件")
	_view.apply_state(WorldHudPartyRosterPresenter.present({
		"activeTab": "party",
		"match": {
			"active": false,
			"status": "idle",
			"maxMembers": 5,
			"party": {
				"members": [{
					"accountId": "account-offline-visible",
					"displayName": "离线猎人",
					"online": false,
					"level": 32,
				}],
			},
		},
	}))
	await _settle()
	var offline_card := _view.find_child("WorldHudPartyMember1", true, false)
	var offline_status := (
		offline_card.find_child("StatusText", true, false)
		if offline_card != null
		else null
	)
	_expect(
		offline_status is Label and (offline_status as Label).text == "离线",
		"正式 roster 没有给离线真人显示可见离线标记"
	)
	_view.apply_state(WorldHudPartyRosterPresenter.present(_fixture()))
	await _settle()

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.world_hud_party_roster_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"component": {"x": 1034, "y": 108, "width": 206, "height": 402},
		"tabEvents": _tab_events,
		"detailCount": _detail_count,
		"cancelCount": _cancel_count,
		"snapshot": _view.debug_snapshot(),
		"errors": _errors,
	}
	print("world hud party roster check: %s" % JSON.stringify(report))
	_view.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _append_layout_and_text_errors() -> void:
	var snapshot := _view.debug_snapshot()
	_expect(_view.position == COMPONENT_POSITION, "组队侧栏没有放在世界HUD右侧")
	_expect(_view.size == COMPONENT_SIZE, "组队侧栏没有保持206×402")
	_expect(str(snapshot.get("activeTab", "")) == "party", "默认没有选中组队页签")
	_expect(int(snapshot.get("rowCount", 0)) == 5, "组队页没有完整显示五行席位")
	_expect(
		snapshot.get("rowKinds", []) == ["human", "human", "npc", "npc", "empty"],
		"组队页的真人/NPC/空位层级不正确"
	)
	_expect(bool(snapshot.get("detailVisible", false)), "匹配中没有查看匹配入口")
	_expect(bool(snapshot.get("cancelVisible", false)), "匹配中没有取消匹配入口")
	var visible_text := _visible_text(_view)
	_expect("NPC陪练" in visible_text, "玩家画面没有显式标注NPC陪练")
	_expect("下一场替换" in visible_text, "真人加入后没有在正式组队栏说明下一场替换陪练")
	for token in FORBIDDEN_PLAYER_TOKENS:
		if token in visible_text.to_lower():
			_errors.append("组队侧栏暴露技术字段：%s" % token)


static func _fixture() -> Dictionary:
	return {
		"activeTab": "party",
		"taskText": "[主线] 前往赤岩峡谷调查异动",
		"match": {
			"active": true,
			"status": "npc_filled",
			"queueId": "internal-queue-never-visible",
			"humanCount": 2,
			"npcCount": 2,
			"emptyCount": 1,
			"maxMembers": 5,
			"party": {
				"leaderAccountId": "account-leader",
				"members": [
					{
						"accountId": "account-leader",
						"displayName": "赤羽",
						"role": "leader",
						"online": true,
						"teamSnapshot": {
							"player": {
								"level": 98,
								"rebirthCount": 2,
								"appearanceId": "ember_spark_v1",
								"elements": {"fire": 8, "earth": 2},
							},
						},
					},
					{
						"accountId": "account-member",
						"displayName": "霜语",
						"role": "member",
						"online": true,
						"teamSnapshot": {
							"player": {
								"level": 80,
								"appearanceId": "frost_whisper_v1",
								"elements": {"water": 7, "wind": 3},
							},
						},
					},
				],
			},
			"npcMembers": [
				{
					"npcId": "npc-1",
					"displayName": "岩槌陪练",
					"level": 80,
					"controller": "server_ai",
					"matchmakingNpc": true,
				},
				{
					"npcId": "npc-2",
					"displayName": "风羽陪练",
					"level": 80,
					"controller": "server_ai",
					"matchmakingNpc": true,
				},
			],
		},
	}


func _real_left_click(control: Control) -> void:
	_expect(control != null and control.visible and not (control is Button and (control as Button).disabled), "真实左键目标不可用")
	if control == null:
		return
	var position_value := control.get_global_rect().get_center()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = position_value
	press.global_position = position_value
	press.pressed = true
	Input.parse_input_event(press)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = position_value
	release.global_position = position_value
	release.pressed = false
	Input.parse_input_event(release)
	await _settle()


func _settle() -> void:
	await process_frame
	await process_frame
	await process_frame


func _capture_if_requested(file_name: String) -> void:
	var capture_dir := ""
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--capture-dir="):
			capture_dir = argument.trim_prefix("--capture-dir=").strip_edges()
	if capture_dir == "":
		return
	DirAccess.make_dir_recursive_absolute(capture_dir)
	await process_frame
	var viewport_texture := root.get_texture()
	if viewport_texture == null:
		_errors.append("当前渲染器不能生成组队侧栏截图")
		return
	var image := viewport_texture.get_image()
	if image == null:
		_errors.append("组队侧栏截图像素读取失败")
		return
	var error := image.save_png(capture_dir.path_join(file_name))
	_expect(error == OK, "组队侧栏截图写入失败")


func _visible_text(node: Node) -> String:
	var values: Array[String] = []
	_collect_visible_text(node, values)
	return "\n".join(values)


func _collect_visible_text(node: Node, values: Array[String]) -> void:
	if node is CanvasItem and not (node as CanvasItem).is_visible_in_tree():
		return
	if node is Label:
		values.append((node as Label).text)
	elif node is Button:
		values.append((node as Button).text)
	for child in node.get_children():
		_collect_visible_text(child, values)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)
