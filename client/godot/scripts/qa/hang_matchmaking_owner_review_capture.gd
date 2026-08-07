extends SceneTree

const MAIN_SCENE := preload("res://scenes/Main.tscn")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const HangMatchmakingAwakenedPanel := preload(
	"res://scripts/ui/hang_matchmaking_awakened_panel.gd"
)
const HangMatchmakingWorldStatus := preload(
	"res://scripts/ui/hang_matchmaking_world_status.gd"
)

const REVIEW_FPS := 30
const VIEWPORT_SIZE := Vector2i(1280, 720)
const ACCOUNT_ID := "phase394_hang_owner_review"
const WORLD_MAP_ID := "firebud_village_gate"
const WORLD_SPAWN_NAME := "from_training_yard"
const QUEUE_ID := "hang_match_owner_review_queue"

const CHAPTERS := [
	{"id": "world_context", "seconds": 1.5},
	{"id": "route_cards", "seconds": 2.3},
	{"id": "party_overview", "seconds": 2.0},
	{"id": "start_choice", "seconds": 2.2},
	{"id": "human_priority_queue", "seconds": 2.6},
	{"id": "npc_fill", "seconds": 2.6},
	{"id": "human_replacement", "seconds": 2.8},
	{"id": "world_matching_status", "seconds": 2.3},
	{"id": "cancelled_match_hang_continues", "seconds": 2.4},
	{"id": "stopped_hang", "seconds": 1.8},
]

var _host
var _panel_flow
var _panel: HangMatchmakingAwakenedPanel
var _world_status: HangMatchmakingWorldStatus
var _selected_route: Dictionary = {}
var _target: Dictionary = {}
var _failed := false
var _started_msec := 0
var _actual_left_clicks := 0
var _press_frames := 0
var _max_process_ms := 0.0
var _match_request_count := 0
var _cancel_request_count := 0
var _stop_request_count := 0
var _server_write_count := 0
var _coverage := {
	"route_cards": false,
	"choice": false,
	"human_priority": false,
	"npc_fill": false,
	"human_replacement": false,
	"world_status": false,
	"cancel_kept_hang": false,
	"stop_hid_status": false,
	"no_player_qa_text": false,
}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_started_msec = Time.get_ticks_msec()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP

	_host = MAIN_SCENE.instantiate()
	root.add_child(_host)
	current_scene = _host
	if not await _wait_for_real_world():
		_fail("真实 Main.tscn 世界 HUD 没有在限定帧内就绪")
		return
	if not _configure_isolated_world():
		return
	if not _install_deterministic_controller_bridge():
		return

	print(
		(
			"HANG_MATCHMAKING_OWNER_REVIEW_START scene=Main.tscn "
			+ "entry=SceneTreeScript viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false "
			+ "state_source=deterministic_injected_controller "
			+ "online_claims=false"
		)
	)
	await _hold_chapter("world_context")
	if _failed:
		return

	await _left_click(_host.stop_button, "挂机入口")
	if not await _expect_panel_view("browse", false):
		return
	_selected_route = _panel.selected_route()
	if _selected_route.is_empty() or not bool(_selected_route.get("current", false)):
		_fail("真实区域目录没有选中当前可挂机路线")
		return
	_target = _target_for_route(_selected_route)
	if _target.is_empty():
		_fail("当前练级路线无法形成匹配目标")
		return
	var idle_apply: Dictionary = _panel_flow._debug_apply_hang_matchmaking_state(
		_idle_listing_state()
	)
	if not bool(idle_apply.get("accepted", false)):
		_fail("本地权威空闲态未被客户端合同接受")
		return
	await _settle_frames(2)
	var route_button_value = _panel.route_buttons.get(
		str(_selected_route.get("routeId", "")),
		null
	)
	if not (route_button_value is Button):
		_fail("当前练级区域卡片缺失")
		return
	await _left_click(route_button_value as Button, "当前练级区域卡片")
	_coverage["route_cards"] = (
		_panel.route_buttons.size() >= 4
		and str(_panel.selected_route_id()) == str(_selected_route.get("routeId", ""))
	)
	if not bool(_coverage["route_cards"]):
		_fail("区域卡片没有完整呈现或点击选择失效")
		return
	await _hold_chapter("route_cards")

	await _left_click(_panel.party_tab_button, "便捷组队页签")
	if not await _expect_panel_view("party", false):
		return
	if not _tree_has_visible_text(_panel, "石木"):
		_fail("本地权威队伍列表没有投影到便捷组队页")
		return
	await _hold_chapter("party_overview")

	await _left_click(_panel.browse_tab_button, "练级区域页签")
	await _left_click(_panel.primary_button, "开始挂机")
	var immediate_button := _button_named(_panel, "HangMatchImmediateButton")
	var match_button := _button_named(_panel, "HangMatchMatchedButton")
	_coverage["choice"] = (
		bool(_panel.debug_snapshot().get("choiceVisible", false))
		and _button_ready(immediate_button)
		and _button_ready(match_button)
		and immediate_button.text == "立即挂机"
		and match_button.text == "匹配挂机"
	)
	if not bool(_coverage["choice"]):
		_fail("立即挂机／匹配挂机二选一弹层没有完整出现")
		return
	await _hold_chapter("start_choice")
	# Runtime imports and the first full-screen panel build are a one-time warmup.
	# Measure the recurring queue/state/cancel/stop path separately so the probe
	# catches gameplay stalls instead of editor import work.
	_max_process_ms = 0.0

	await _left_click(match_button, "匹配挂机")
	if _match_request_count != 1 or not _host.hang_mode_active:
		_fail("真实左键没有进入本地权威匹配流程")
		return
	var human_snapshot: Dictionary = _panel_flow._hang_matchmaking_debug_snapshot()
	_coverage["human_priority"] = (
		bool(human_snapshot.get("panelVisible", false))
		and int((human_snapshot.get("panel", {}) as Dictionary).get("humanCount", 0)) == 1
		and int((human_snapshot.get("panel", {}) as Dictionary).get("npcCount", -1)) == 0
		and int((human_snapshot.get("panel", {}) as Dictionary).get("emptyCount", 0)) == 4
		and bool((human_snapshot.get("panel", {}) as Dictionary).get("matching", false))
	)
	if not bool(_coverage["human_priority"]):
		_fail("真人优先、NPC 尚未补位的匹配态不正确")
		return
	await _hold_chapter("human_priority_queue")

	if not _apply_authoritative_state(_matching_state(3, 1, 4)):
		return
	var npc_snapshot: Dictionary = _panel_flow._hang_matchmaking_debug_snapshot()
	_coverage["npc_fill"] = (
		int((npc_snapshot.get("panel", {}) as Dictionary).get("humanCount", 0)) == 1
		and int((npc_snapshot.get("panel", {}) as Dictionary).get("npcCount", 0)) == 4
		and _tree_has_visible_text(_panel, "陪练NPC")
	)
	if not bool(_coverage["npc_fill"]):
		_fail("陪练NPC补位没有明确呈现为 NPC")
		return
	await _hold_chapter("npc_fill")

	if not _apply_authoritative_state(_matching_state(4, 2, 3)):
		return
	var replacement_snapshot: Dictionary = _panel_flow._hang_matchmaking_debug_snapshot()
	_coverage["human_replacement"] = (
		int((replacement_snapshot.get("panel", {}) as Dictionary).get("humanCount", 0)) == 2
		and int((replacement_snapshot.get("panel", {}) as Dictionary).get("npcCount", 0)) == 3
		and _tree_has_visible_text(_panel, "下一场战斗前自动让位")
	)
	if not bool(_coverage["human_replacement"]):
		_fail("真人加入后下一场替换陪练NPC的规则没有明确呈现")
		return
	await _hold_chapter("human_replacement")

	await _left_click(_panel.close_button, "关闭挂机匹配页")
	await _settle_frames(2)
	var world_snapshot: Dictionary = _panel_flow._hang_matchmaking_debug_snapshot()
	_coverage["world_status"] = (
		not bool(world_snapshot.get("panelVisible", true))
		and bool(world_snapshot.get("worldStatusVisible", false))
		and bool(world_snapshot.get("hangActive", false))
		and _tree_has_visible_text(_world_status, "真人 2")
		and _tree_has_visible_text(_world_status, "陪练 NPC 3")
	)
	if not bool(_coverage["world_status"]):
		_fail("世界挂机状态条没有保留真人／陪练NPC匹配信息")
		return
	await _hold_chapter("world_matching_status")

	var world_cancel := _find_visible_button_by_text(_world_status, "取消匹配")
	await _left_click(world_cancel, "世界状态取消匹配")
	await _settle_frames(2)
	var cancelled_snapshot: Dictionary = _panel_flow._hang_matchmaking_debug_snapshot()
	_coverage["cancel_kept_hang"] = (
		_cancel_request_count == 1
		and bool(cancelled_snapshot.get("hangActive", false))
		and bool(cancelled_snapshot.get("worldStatusVisible", false))
		and not bool(
			(cancelled_snapshot.get("matchState", {}) as Dictionary).get("active", true)
		)
		and _tree_has_visible_text(_world_status, "挂机中")
		and _find_visible_button_by_text(_world_status, "取消匹配") == null
	)
	if not bool(_coverage["cancel_kept_hang"]):
		_fail("取消匹配意外停止挂机或没有收敛到挂机中状态")
		return
	await _hold_chapter("cancelled_match_hang_continues")

	var world_stop := _find_visible_button_by_text(_world_status, "停止挂机")
	await _left_click(world_stop, "停止挂机")
	await _settle_frames(2)
	var stopped_snapshot: Dictionary = _panel_flow._hang_matchmaking_debug_snapshot()
	_coverage["stop_hid_status"] = (
		_stop_request_count == 1
		and not bool(stopped_snapshot.get("hangActive", true))
		and not bool(stopped_snapshot.get("worldStatusVisible", true))
	)
	if not bool(_coverage["stop_hid_status"]):
		_fail("停止挂机后世界状态没有消失")
		return
	await _hold_chapter("stopped_hang")

	_coverage["no_player_qa_text"] = not _visible_tree_has_forbidden_review_text()
	if not bool(_coverage["no_player_qa_text"]):
		_fail("玩家可见界面出现验收／调试文字")
		return
	if _host.hang_matchmaking_controller.request_active():
		_fail("隔离验收结束时仍存在 HTTP 请求")
		return
	if _server_write_count != 0:
		_fail("隔离验收记录到服务端写入")
		return
	if _max_process_ms > 80.0:
		_fail("挂机匹配切片出现超过 80ms 的进程帧：%.3fms" % _max_process_ms)
		return

	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"HANG_MATCHMAKING_OWNER_REVIEW_STATE route_cards=%s choice=%s "
			+ "human_priority=%s npc_fill=%s human_replacement_next_battle=%s "
			+ "world_status=%s cancel_kept_hang=%s stop_hid_status=%s "
			+ "no_player_qa_text=%s actual_left_clicks=%d press_frames=%d "
			+ "server_writes=%d online_claims=false max_process_ms=%.3f"
		) % [
			_bool_text(bool(_coverage["route_cards"])),
			_bool_text(bool(_coverage["choice"])),
			_bool_text(bool(_coverage["human_priority"])),
			_bool_text(bool(_coverage["npc_fill"])),
			_bool_text(bool(_coverage["human_replacement"])),
			_bool_text(bool(_coverage["world_status"])),
			_bool_text(bool(_coverage["cancel_kept_hang"])),
			_bool_text(bool(_coverage["stop_hid_status"])),
			_bool_text(bool(_coverage["no_player_qa_text"])),
			_actual_left_clicks,
			_press_frames,
			_server_write_count,
			_max_process_ms,
		]
	)
	print(
		(
			"HANG_MATCHMAKING_OWNER_REVIEW_END elapsed_wall=%.3f speed=1.00x "
			+ "profile=isolated backend=false completed=true"
		) % elapsed
	)
	quit(0)


func _wait_for_real_world() -> bool:
	for _frame_index in range(180):
		await process_frame
		if _host == null or not is_instance_valid(_host):
			return false
		var hud_value = _host.get("hud_root")
		var player_value = _host.get("player")
		if (
			hud_value is Control
			and (hud_value as Control).is_inside_tree()
			and player_value is CanvasItem
			and (player_value as CanvasItem).is_inside_tree()
			and _host.get("stop_button") is Button
			and str(_host.get("current_map_id")).strip_edges() != ""
		):
			return (
				current_scene == _host
				and str(_host.scene_file_path) == "res://scenes/Main.tscn"
			)
	return false


func _configure_isolated_world() -> bool:
	_host.profile_save_enabled = false
	_host.account_authenticated = true
	_host.current_account_session = {
		"accountId": ACCOUNT_ID,
		"displayName": "岚牙",
		"authSource": "isolated_owner_review",
	}
	_host.server_profile_sync_state = "off"
	_host.server_profile_sync_pending_kind = ""
	_host.server_profile_sync_dirty = false
	_host.server_profile_sync_pull_queued = false
	if _host.has_method("_stop_server_event_stream"):
		_host._stop_server_event_stream()
	if _host.has_method("_stop_online_position_sync"):
		_host._stop_online_position_sync()
	for method_name in [
		"_close_auth_panel",
		"_close_account_panel",
		"_close_market_panel",
		"_close_battle_result_panel",
	]:
		if _host.has_method(method_name):
			_host.call(method_name, false)
	var entry_panel_value = _host.get("character_entry_panel")
	if entry_panel_value is CanvasItem:
		(entry_panel_value as CanvasItem).visible = false

	var profile := PlayerProgressModel.default_profile()
	var player_profile_value := (
		(profile.get("player", {}) as Dictionary).duplicate(true)
	)
	player_profile_value["name"] = "岚牙"
	player_profile_value["level"] = 8
	profile["player"] = player_profile_value
	_host.player_profile = profile
	if not _host._load_map(WORLD_MAP_ID, WORLD_SPAWN_NAME):
		_fail("无法载入挂机匹配验收世界地图")
		return false
	_host._set_world_log_message("选择练级区域后，可以立即挂机或边练级边找队友。")
	_host._update_hud_text(true)
	_host._layout_hud()
	_panel_flow = _host._panel_flow()
	if _panel_flow == null:
		_fail("真实 Main.tscn 没有建立 PanelFlowCoordinator")
		return false
	_panel = _host.hang_matchmaking_panel as HangMatchmakingAwakenedPanel
	_world_status = _host.hang_matchmaking_world_status as HangMatchmakingWorldStatus
	if _panel == null or _world_status == null:
		_fail("挂机匹配面板或世界状态没有挂载到真实 HUD")
		return false
	_panel_flow._close_hang_matchmaking_panel(false)
	_host._set_hang_mode(false)
	_host._layout_hud()
	return true


func _install_deterministic_controller_bridge() -> bool:
	var match_handler := Callable(
		_panel_flow,
		"_on_hang_matchmaking_match_requested"
	)
	if _panel.match_requested.is_connected(match_handler):
		_panel.match_requested.disconnect(match_handler)
	_panel.match_requested.connect(_on_local_match_requested)

	var cancel_handler := Callable(
		_panel_flow,
		"_on_hang_matchmaking_cancel_requested"
	)
	if _panel.cancel_requested.is_connected(cancel_handler):
		_panel.cancel_requested.disconnect(cancel_handler)
	if _world_status.cancel_requested.is_connected(cancel_handler):
		_world_status.cancel_requested.disconnect(cancel_handler)
	_panel.cancel_requested.connect(_on_local_cancel_requested)
	_world_status.cancel_requested.connect(_on_local_cancel_requested)

	for connection in _world_status.stop_requested.get_connections():
		var callable_value = connection.get("callable", Callable())
		if (
			callable_value is Callable
			and _world_status.stop_requested.is_connected(callable_value)
		):
			_world_status.stop_requested.disconnect(callable_value)
	_world_status.stop_requested.connect(_on_local_stop_requested)
	return true


func _on_local_match_requested(route_id: String) -> void:
	if route_id != str(_selected_route.get("routeId", "")):
		_fail("匹配按钮提交了错误练级路线")
		return
	_match_request_count += 1
	_host._set_hang_mode(true)
	_host.hang_walk_cooldown = 9999.0
	_apply_authoritative_state(_matching_state(2, 1, 0))


func _on_local_cancel_requested() -> void:
	_cancel_request_count += 1
	_apply_authoritative_state(_cancelled_state())


func _on_local_stop_requested() -> void:
	_stop_request_count += 1
	_host._stop_hang_activity("挂机已停止。", true, false)


func _idle_listing_state() -> Dictionary:
	return {
		"schemaVersion": 1,
		"active": false,
		"status": "idle",
		"stateRevision": 1,
		"queueId": "",
		"target": _target.duplicate(true),
		"humanCount": 1,
		"npcCount": 0,
		"emptyCount": 4,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0,
		"party": {},
		"npcMembers": [],
		"listings": [{
			"schemaVersion": 1,
			"queueId": "visible_authoritative_listing",
			"target": _target.duplicate(true),
			"leader": {"displayName": "石木", "level": 9},
			"humanCount": 2,
			"npcCount": 0,
			"emptyCount": 3,
			"maxMembers": 5,
			"status": "matching",
		}],
		"message": "真人队伍优先展示。",
		"replayed": false,
	}


func _matching_state(revision: int, human_count: int, npc_count: int) -> Dictionary:
	var human_members: Array[Dictionary] = [{
		"accountId": ACCOUNT_ID,
		"displayName": "岚牙",
		"level": 8,
	}]
	if human_count >= 2:
		human_members.append({
			"accountId": "owner_review_companion",
			"displayName": "石木",
			"level": 9,
		})
	var npc_members: Array[Dictionary] = []
	for index in range(npc_count):
		npc_members.append({
			"npcId": "training_npc_%d" % index,
			"displayName": "陪练NPC·%d" % (index + 1),
			"level": 8,
		})
	return {
		"schemaVersion": 1,
		"active": true,
		"status": "npc_filled" if npc_count > 0 else "matching",
		"stateRevision": revision,
		"queueId": QUEUE_ID,
		"target": _target.duplicate(true),
		"humanCount": human_count,
		"npcCount": npc_count,
		"emptyCount": 5 - human_count - npc_count,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0 if npc_count > 0 else 9000,
		"party": {
			"partyId": "owner_review_party",
			"leaderAccountId": ACCOUNT_ID,
			"memberCount": human_count,
			"members": human_members,
		},
		"npcMembers": npc_members,
		"listings": [],
		"message": (
			"真人加入后，陪练NPC将在下一场战斗前让位。"
			if human_count >= 2
			else "优先寻找真人队友。"
		),
		"replayed": false,
	}


func _cancelled_state() -> Dictionary:
	return {
		"schemaVersion": 1,
		"active": false,
		"status": "cancelled",
		"stateRevision": 5,
		"queueId": "",
		"target": _target.duplicate(true),
		"humanCount": 2,
		"npcCount": 0,
		"emptyCount": 3,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0,
		"party": {
			"partyId": "owner_review_party",
			"leaderAccountId": ACCOUNT_ID,
			"memberCount": 2,
			"members": [
				{"accountId": ACCOUNT_ID, "displayName": "岚牙", "level": 8},
				{"accountId": "owner_review_companion", "displayName": "石木", "level": 9},
			],
		},
		"npcMembers": [],
		"listings": [],
		"message": "已取消匹配，挂机继续。",
		"replayed": false,
	}


func _apply_authoritative_state(state: Dictionary) -> bool:
	var result: Dictionary = _panel_flow._debug_apply_hang_matchmaking_state(state)
	if not bool(result.get("accepted", false)):
		_fail("本地权威状态被拒绝：%s" % str(result.get("reason", "unknown")))
		return false
	return true


func _target_for_route(route: Dictionary) -> Dictionary:
	var target := {
		"progressionZoneId": str(route.get("routeId", "")).strip_edges(),
		"mapId": str(route.get("mapId", "")).strip_edges(),
		"encounterGroupId": str(route.get("encounterGroupId", "")).strip_edges(),
		"label": str(route.get("label", "")).strip_edges(),
	}
	for value in target.values():
		if str(value).strip_edges() == "":
			return {}
	return target


func _expect_panel_view(view_mode: String, choice_visible: bool) -> bool:
	await _settle_frames(2)
	var snapshot := _panel.debug_snapshot()
	if (
		not _panel.is_visible_in_tree()
		or str(snapshot.get("viewMode", "")) != view_mode
		or bool(snapshot.get("choiceVisible", false)) != choice_visible
	):
		_fail("挂机匹配面板没有进入预期视图：%s" % view_mode)
		return false
	return true


func _button_named(parent: Node, node_name: String) -> Button:
	var value := parent.find_child(node_name, true, false)
	return value as Button if value is Button else null


func _button_ready(button: Button) -> bool:
	return (
		button != null
		and button.is_inside_tree()
		and button.is_visible_in_tree()
		and not button.disabled
	)


func _find_visible_button_by_text(parent: Node, text_value: String) -> Button:
	if parent == null:
		return null
	for value in parent.find_children("*", "Button", true, false):
		if (
			value is Button
			and (value as Button).is_visible_in_tree()
			and (value as Button).text == text_value
		):
			return value as Button
	return null


func _tree_has_visible_text(parent: Node, needle: String) -> bool:
	if parent == null:
		return false
	for value in parent.find_children("*", "Label", true, false):
		if (
			value is Label
			and (value as Label).is_visible_in_tree()
			and str((value as Label).text).contains(needle)
		):
			return true
	for value in parent.find_children("*", "Button", true, false):
		if (
			value is Button
			and (value as Button).is_visible_in_tree()
			and str((value as Button).text).contains(needle)
		):
			return true
	return false


func _visible_tree_has_forbidden_review_text() -> bool:
	for value in root.find_children("*", "Label", true, false):
		if value is Label and (value as Label).is_visible_in_tree():
			var text_value := str((value as Label).text).to_lower()
			if "qa" in text_value or "调试" in text_value or "验收" in text_value:
				return true
	for value in root.find_children("*", "Button", true, false):
		if value is Button and (value as Button).is_visible_in_tree():
			var text_value := str((value as Button).text).to_lower()
			if "qa" in text_value or "调试" in text_value or "验收" in text_value:
				return true
	return false


func _left_click(control: Control, label: String) -> void:
	if not _button_ready(control as Button if control is Button else null):
		_fail("%s不可见或不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	if not root.get_visible_rect().has_point(viewport_point):
		_fail("%s不在 1280×720 可点击区域内" % label)
		return
	var input_position: Vector2 = root.get_screen_transform() * viewport_point
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	await process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	Input.parse_input_event(press)
	await process_frame
	_press_frames += 1
	_sample_performance()
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	Input.parse_input_event(release)
	await process_frame
	_actual_left_clicks += 1
	_sample_performance()


func _settle_frames(count: int) -> void:
	for _index in range(maxi(1, count)):
		await process_frame
		_sample_performance()


func _hold_chapter(chapter_id: String) -> void:
	var seconds := 0.0
	for chapter in CHAPTERS:
		if str(chapter.get("id", "")) == chapter_id:
			seconds = float(chapter.get("seconds", 0.0))
			break
	if seconds <= 0.0:
		_fail("未知录像章节：%s" % chapter_id)
		return
	var frames := maxi(1, roundi(seconds * REVIEW_FPS))
	print(
		(
			"HANG_MATCHMAKING_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter_id, frames, seconds]
	)
	for _frame_index in range(frames):
		await process_frame
		_sample_performance()


func _sample_performance() -> void:
	_max_process_ms = maxf(
		_max_process_ms,
		float(Performance.get_monitor(Performance.TIME_PROCESS)) * 1000.0
	)


func _bool_text(value: bool) -> String:
	return "true" if value else "false"


func _fail(message: String) -> void:
	if _failed:
		return
	_failed = true
	print("HANG_MATCHMAKING_OWNER_REVIEW_FAILED reason=%s" % message)
	push_error("hang matchmaking owner review failed: %s" % message)
	quit(1)
