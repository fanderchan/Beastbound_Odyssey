extends SceneTree

const HangMatchmakingAwakenedPanel := preload(
	"res://scripts/ui/hang_matchmaking_awakened_panel.gd"
)
const HangMatchmakingPresenter := preload(
	"res://scripts/ui/hang_matchmaking_presenter.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const FORBIDDEN_PLAYER_TOKENS: Array[String] = [
	"accountid",
	"queueid",
	"npcfillinms",
	"requestid",
	"traceid",
	"schemaversion",
	"debug",
	"/hang/match",
	"http://",
	"https://",
]

var _errors: Array[String] = []
var _route_events: Array[String] = []
var _immediate_events: Array[String] = []
var _match_events: Array[String] = []
var _travel_events: Array[String] = []
var _cancel_count := 0
var _close_count := 0
var _capture_dir := ""
var _panel: HangMatchmakingAwakenedPanel


func _initialize() -> void:
	call_deferred("_run")


static func run_static_check() -> Dictionary:
	var panel := HangMatchmakingAwakenedPanel.new()
	panel.prepare()
	panel.configure_from_catalog("firebud_village_gate", 14)
	var report := panel.self_check()
	var errors: Array[String] = []
	for raw_error in report.get("errors", []):
		errors.append(str(raw_error))
	if int((report.get("snapshot", {}) as Dictionary).get("routeCount", 0)) < 6:
		errors.append("挂机匹配没有投影完整的可重复练级区域")
	panel.free()
	return {
		"schemaVersion": 1,
		"reportType": "beastbound.hang_matchmaking_panel_static_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"errors": errors,
	}


func _run() -> void:
	_capture_dir = _capture_directory_argument()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var static_report := run_static_check()
	for raw_error in static_report.get("errors", []):
		_errors.append(str(raw_error))

	_panel = HangMatchmakingAwakenedPanel.new()
	_panel.name = "HangMatchmakingPanelCheckSubject"
	_panel.position = Vector2.ZERO
	_panel.size = Vector2(VIEWPORT_SIZE)
	_connect_signals()
	root.add_child(_panel)
	_panel.configure_from_catalog("firebud_village_gate", 14)
	_panel.apply_state(_browse_state())
	await _settle()

	_append_layout_errors()
	_append_visible_text_errors("区域选择页")
	await _capture("hang-match-browse-1280x720.png")
	await _check_start_choice()
	await _check_non_current_route_contract()
	await _check_party_page()
	await _check_authoritative_matching_state()
	await _capture("hang-match-active-1280x720.png")
	_append_visible_text_errors("匹配状态页")
	await _check_npc_filled_and_full_statuses()
	_panel.apply_state(_matching_state())
	await _settle()
	await _real_left_click(_panel.cancel_button)
	_expect(_cancel_count == 1, "取消匹配没有发出一次取消事件")

	_panel.apply_state(_browse_state())
	await _settle()
	await _real_left_click(_panel.close_button)
	_expect(_close_count == 1, "关闭按钮没有发出一次关闭事件")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.hang_matchmaking_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"staticResult": str(static_report.get("result", "FAIL")),
		"routeEvents": _route_events,
		"immediateEvents": _immediate_events,
		"matchEvents": _match_events,
		"travelEvents": _travel_events,
		"cancelCount": _cancel_count,
		"closeCount": _close_count,
		"snapshot": _panel.debug_snapshot(),
		"captureDirectory": _capture_dir,
		"errors": _errors,
	}
	print("hang matchmaking awakened panel check: %s" % JSON.stringify(report))
	_panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _connect_signals() -> void:
	_panel.route_selected.connect(func(route_id: String) -> void: _route_events.append(route_id))
	_panel.immediate_requested.connect(func(route_id: String) -> void: _immediate_events.append(route_id))
	_panel.match_requested.connect(func(route_id: String) -> void: _match_events.append(route_id))
	_panel.travel_requested.connect(func(route_id: String) -> void: _travel_events.append(route_id))
	_panel.cancel_requested.connect(func() -> void: _cancel_count += 1)
	_panel.close_requested.connect(func() -> void: _close_count += 1)


func _append_layout_errors() -> void:
	_expect(root.size == VIEWPORT_SIZE, "挂机匹配检查没有运行在 1280×720")
	_expect(_panel.size == Vector2(VIEWPORT_SIZE), "挂机匹配没有覆盖 1280×720")
	var canvas := _panel.get_node_or_null("HangMatchmakingCanvas") as Control
	_expect(canvas != null, "挂机匹配缺少固定主画布")
	if canvas != null:
		_expect(canvas.size == Vector2(VIEWPORT_SIZE), "挂机匹配主画布尺寸错误")
	_expect(_panel.route_buttons.size() >= 6, "挂机匹配没有显示完整区域卡片")
	_expect(_panel.primary_button != null, "挂机匹配缺少主操作按钮")
	_expect(_panel.close_button != null, "挂机匹配缺少关闭按钮")
	for route_id in _panel.route_buttons:
		var button := _panel.route_buttons.get(route_id) as Button
		_expect(button != null, "区域卡片不是可左键操作的按钮：%s" % str(route_id))
	var high_route := _first_below_recommended_route()
	if not high_route.is_empty():
		var high_button := _panel.route_buttons.get(str(high_route.get("routeId", ""))) as Button
		_expect(
			high_button != null and not high_button.disabled,
			"推荐等级被误当成服务端硬门槛"
		)


func _check_start_choice() -> void:
	_expect(_panel.selected_route_id() == "firebud_newbie", "没有优先选中当前区域")
	await _real_left_click(_panel.primary_button)
	_expect(bool(_panel.debug_snapshot().get("choiceVisible", false)), "开始挂机没有打开二选一提示")
	await _capture("hang-match-choice-1280x720.png")
	var immediate_button := _panel.find_child("HangMatchImmediateButton", true, false) as Button
	_expect(immediate_button != null, "提示弹窗缺少立即挂机按钮")
	if immediate_button != null:
		await _real_left_click(immediate_button)
	_expect(_immediate_events == ["firebud_newbie"], "立即挂机没有携带选中区域")

	await _real_left_click(_panel.primary_button)
	var match_button := _panel.find_child("HangMatchMatchedButton", true, false) as Button
	_expect(match_button != null, "提示弹窗缺少匹配挂机按钮")
	if match_button != null:
		await _real_left_click(match_button)
	_expect(_match_events == ["firebud_newbie"], "匹配挂机没有携带选中区域")


func _check_non_current_route_contract() -> void:
	var target_id := "mistcap_growth"
	var target_button := _panel.route_buttons.get(target_id) as Button
	_expect(target_button != null, "没有找到相邻的非当前区域卡片")
	if target_button == null:
		return
	await _real_left_click(target_button)
	_expect(_panel.selected_route_id() == target_id, "非当前区域没有被选中")
	_expect(_panel.primary_button.text == "前往该区域", "非当前区域错误显示为直接挂机")
	await _real_left_click(_panel.primary_button)
	_expect(_travel_events == [target_id], "非当前区域没有发出路线引导事件")
	_expect(_immediate_events.size() == 1 and _match_events.size() == 1, "非当前区域错误触发了直接挂机或匹配")


func _check_party_page() -> void:
	await _real_left_click(_panel.party_tab_button)
	_expect(str(_panel.debug_snapshot().get("viewMode", "")) == "party", "便捷组队页签没有切换")
	_panel.apply_state(_party_state())
	await _settle()
	_expect(int(_panel.debug_snapshot().get("listingReferenceCount", 0)) == 1, "便捷组队没有投影真人队伍")
	_append_visible_text_errors("便捷组队页")
	await _capture("hang-match-party-1280x720.png")
	var listing_reference := _panel.listing_reference_labels.get("queue-firebud-01") as Label
	_expect(
		listing_reference != null
			and listing_reference.text == "自动匹配参考",
		"便捷组队错误提供了服务端不支持的指定队伍申请按钮"
	)
	var auto_match_button := _panel.find_child("HangMatchPartyAutoMatchButton", true, false) as Button
	_expect(auto_match_button != null and auto_match_button.text == "自动匹配", "便捷组队缺少统一自动匹配入口")
	if auto_match_button != null:
		await _real_left_click(auto_match_button)
	_expect(
		_match_events == ["firebud_newbie", "firebud_newbie"],
		"便捷组队统一入口没有按当前区域发起自动匹配"
	)


func _check_authoritative_matching_state() -> void:
	_panel.apply_state(_matching_state())
	await _settle()
	var snapshot := _panel.debug_snapshot()
	_expect(str(snapshot.get("viewMode", "")) == "matching", "权威 active 状态没有切到匹配页")
	_expect(int(snapshot.get("humanCount", -1)) == 2, "真人数量没有来自权威 party")
	_expect(int(snapshot.get("npcCount", -1)) == 2, "陪练NPC数量没有来自权威 npcMembers")
	_expect(int(snapshot.get("emptyCount", -1)) == 1, "空位数量没有按五人队计算")
	var visible_text := _visible_text(_panel)
	_expect("陪练NPC" in visible_text, "匹配页没有明确标注陪练NPC")
	_expect("真人 2" in visible_text, "匹配页没有明确显示真人数量")
	_expect("服务端提示：约 5 秒后" in visible_text, "npcFillInMs 没有转换为服务端剩余秒提示")
	_expect("旧陪练" not in visible_text and "陪练伙伴" not in visible_text, "匹配页仍暴露旧手工陪练功能")


func _check_npc_filled_and_full_statuses() -> void:
	_panel.apply_state(_npc_filled_state())
	await _settle()
	var npc_filled_text := _visible_text(_panel)
	_expect("陪练已补齐 · 继续寻找真人" in npc_filled_text, "陪练补满时误导为真人队伍已满")
	_expect("真人队伍已满" not in npc_filled_text, "npc_filled 错误显示真人队伍已满")
	_panel.apply_state(_full_state())
	await _settle()
	var full_text := _visible_text(_panel)
	_expect(
		str(_panel.debug_snapshot().get("viewMode", "")) == "matching"
			and str(_panel.debug_snapshot().get("matchStatus", "")) == "full",
		"满员队列 active=false 时错误退回区域选择页"
	)
	_expect("真人队伍已满" in full_text, "真人满员状态没有正确说明")


func _append_visible_text_errors(context: String) -> void:
	var text := _visible_text(_panel).to_lower()
	for token in FORBIDDEN_PLAYER_TOKENS:
		if token in text:
			_errors.append("%s 暴露技术字段：%s" % [context, token])


func _browse_state() -> Dictionary:
	return {
		"viewMode": "browse",
		"selectedRouteId": "firebud_newbie",
		"pending": false,
		"statusText": "真人队友优先；空位可由陪练NPC临时补足。",
		"match": {"active": false},
	}


func _party_state() -> Dictionary:
	return {
		"viewMode": "party",
		"selectedRouteId": "firebud_newbie",
		"pending": false,
		"match": {
			"active": false,
			"waitingPlayerCount": 3,
		},
		"partyListings": [
			{
				"queueId": "queue-firebud-01",
				"routeId": "firebud_newbie",
				"routeLabel": "火芽村入口草丛",
				"leaderName": "苇影",
				"humanCount": 2,
				"npcCount": 1,
				"emptyCount": 2,
			},
		],
	}


func _matching_state() -> Dictionary:
	return {
		"selectedRouteId": "mistcap_growth",
		"pending": false,
		"match": {
			"active": true,
			"status": "searching",
			"maxMembers": 5,
			"waitingPlayerCount": 4,
			"waitingPartyCount": 1,
			"npcFillInMs": 4100,
			"party": {
				"partyId": "fixture-party",
				"leaderAccountId": "fixture-a",
				"memberCount": 2,
				"maxMembers": 5,
				"members": [
					{
						"accountId": "fixture-a",
						"displayName": "岚",
						"role": "leader",
						"teamSnapshot": {"player": {"level": 14}},
					},
					{
						"accountId": "fixture-b",
						"displayName": "石芽",
						"role": "member",
						"teamSnapshot": {"player": {"level": 13}},
					},
				],
			},
			"npcMembers": [
				{
					"npcId": "fixture-npc-1",
					"displayName": "陪练·岩步",
					"level": 14,
					"controller": "server_ai",
					"matchmakingNpc": true,
					"rewardEligible": false,
				},
				{
					"npcId": "fixture-npc-2",
					"displayName": "陪练·苔歌",
					"level": 14,
					"controller": "server_ai",
					"matchmakingNpc": true,
					"rewardEligible": false,
				},
			],
		},
	}


func _full_state() -> Dictionary:
	var state := _matching_state()
	var match_state := (state.get("match", {}) as Dictionary).duplicate(true)
	match_state["active"] = false
	match_state["status"] = "full"
	match_state["npcFillInMs"] = 0
	match_state["npcMembers"] = []
	var party := (match_state.get("party", {}) as Dictionary).duplicate(true)
	var members := (party.get("members", []) as Array).duplicate(true)
	for index in range(3):
		members.append({
			"accountId": "fixture-full-%d" % index,
			"displayName": "真人队友%d" % (index + 3),
			"role": "member",
			"teamSnapshot": {"player": {"level": 14}},
		})
	party["members"] = members
	party["memberCount"] = 5
	match_state["party"] = party
	state["match"] = match_state
	return state


func _npc_filled_state() -> Dictionary:
	var state := _matching_state()
	var match_state := (state.get("match", {}) as Dictionary).duplicate(true)
	match_state["status"] = "npc_filled"
	match_state["npcFillInMs"] = 0
	var npc_members := (match_state.get("npcMembers", []) as Array).duplicate(true)
	npc_members.append({
		"npcId": "fixture-npc-3",
		"displayName": "陪练·叶弦",
		"level": 14,
		"controller": "server_ai",
		"matchmakingNpc": true,
		"rewardEligible": false,
	})
	match_state["npcMembers"] = npc_members
	state["match"] = match_state
	return state


func _first_below_recommended_route() -> Dictionary:
	for route in HangMatchmakingPresenter.routes_for_player("firebud_village_gate", 14):
		if bool(route.get("belowRecommended", false)):
			return route
	return {}


func _visible_text(node: Node) -> String:
	var parts: Array[String] = []
	_collect_visible_text(node, parts)
	return "\n".join(parts)


func _collect_visible_text(node: Node, parts: Array[String]) -> void:
	if node is CanvasItem and not (node as CanvasItem).is_visible_in_tree():
		return
	if node is Label:
		parts.append((node as Label).text)
	elif node is Button:
		parts.append((node as Button).text)
	for child in node.get_children():
		_collect_visible_text(child, parts)


func _real_left_click(control: Control) -> void:
	if control == null:
		return
	control.grab_focus()
	var center := control.global_position + control.size * 0.5
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = center
	press.global_position = center
	press.pressed = true
	root.push_input(press)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = center
	release.global_position = center
	release.pressed = false
	root.push_input(release)
	await _settle()


func _settle() -> void:
	await process_frame
	await process_frame


func _capture(filename: String) -> void:
	if _capture_dir == "":
		return
	DirAccess.make_dir_recursive_absolute(_capture_dir)
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var error := image.save_png(_capture_dir.path_join(filename))
	_expect(error == OK, "无法保存挂机匹配截图：%s" % filename)


func _capture_directory_argument() -> String:
	var args := OS.get_cmdline_user_args()
	for index in range(args.size() - 1):
		if args[index] == "--capture-dir":
			return ProjectSettings.globalize_path(args[index + 1])
	return ""


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)
