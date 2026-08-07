extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const CAPTURE_FLAG := "--hang-matchmaking-world-hud-owner-review-capture"
const REVIEW_FPS := 30
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const EXPECTED_ACTION_RECT := Rect2(599.0, 530.0, 597.0, 181.0)
const READY_FRAME_LIMIT := 360
const ACCOUNT_ID := "phase395_hang_owner_review"
const WORLD_MAP_ID := "firebud_village_gate"
const WORLD_SPAWN_NAME := "from_training_yard"
const QUEUE_ID := "phase395_hang_owner_review_queue"
const STOP_BUTTON_NODE := "HangMatchStopButton"
const NEUTRAL_PARTY_PORTRAIT_PATH := (
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/party.png"
)
const CHAPTERS := [
	{"id": "route_selection_fullscreen", "seconds": 2.0},
	{"id": "start_choice", "seconds": 1.8},
	{"id": "world_one_human_four_empty", "seconds": 2.2},
	{"id": "world_one_human_four_npc", "seconds": 2.2},
	{"id": "world_two_human_three_npc_next_match", "seconds": 2.4},
	{"id": "task_tab_real_click", "seconds": 1.3},
	{"id": "party_tab_real_click", "seconds": 1.5},
	{"id": "cancelled_match_hang_continues", "seconds": 2.2},
	{"id": "stop_hang_fullscreen", "seconds": 1.5},
	{"id": "stopped_hang_world", "seconds": 1.5},
]

var host
var _panel_flow
var _panel
var _world_hud
var _roster
var _selected_route: Dictionary = {}
var _target: Dictionary = {}
var _failed := false
var _started_msec := 0
var _actual_left_clicks := 0
var _cross_frame_presses := 0
var _match_request_count := 0
var _cancel_request_count := 0
var _stop_request_count := 0
var _formal_roster_instance_id := 0


func _init(host_node = null) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_world():
		return
	if not _install_deterministic_controller_bridge():
		return
	if not _assert_full_world_hud():
		return
	print(
		(
			"PHASE395_WORLD_PARTY_OWNER_REVIEW_START scene=Main.tscn "
			+ "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false "
			+ "state_source=deterministic_injected_controller http=false"
		)
	)
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_HUD "
		+ "awakened_mounted=true action_bar=true dock=true fixed_entries=true"
	)

	var hang_entry = _host_property("stop_button")
	if not (hang_entry is Button):
		_fail_capture("正式右下挂机入口不存在")
		return
	await _left_click(hang_entry as Button, "右下挂机入口")
	if not await _expect_panel_view("browse", false):
		return
	_selected_route = _panel.call("selected_route") as Dictionary
	if _selected_route.is_empty() or not bool(_selected_route.get("current", false)):
		_fail_capture("挂机路线页没有选中当前可挂机区域")
		return
	_target = _target_for_route(_selected_route)
	if _target.is_empty():
		_fail_capture("当前练级路线无法形成权威匹配目标")
		return
	if not _run_authority_projection_hard_gates():
		return
	if not _apply_authoritative_state(_idle_listing_state()):
		return
	var route_buttons = _panel.get("route_buttons")
	var route_button = (
		route_buttons.get(str(_selected_route.get("routeId", "")), null)
		if route_buttons is Dictionary
		else null
	)
	if not (route_button is Button):
		_fail_capture("当前练级区域卡片不存在")
		return
	await _left_click(route_button as Button, "当前练级区域卡片")
	if _failed:
		return
	if not _assert_fullscreen_panel("browse"):
		return
	if not (route_buttons is Dictionary) or (route_buttons as Dictionary).size() < 4:
		_fail_capture("全屏挂机路线页没有完整显示路线卡片")
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_ROUTE "
		+ "fullscreen=true route_cards=true selected_current=true real_click=true"
	)
	await _hold_chapter("route_selection_fullscreen")
	if _failed:
		return

	var primary_button = _panel.get("primary_button")
	if not (primary_button is Button):
		_fail_capture("路线页缺少开始挂机按钮")
		return
	await _left_click(primary_button as Button, "开始挂机")
	if not await _expect_panel_view("browse", true):
		return
	var immediate_button := _named_button(_panel, "HangMatchImmediateButton")
	var match_button := _named_button(_panel, "HangMatchMatchedButton")
	if (
		immediate_button == null
		or match_button == null
		or immediate_button.text != "立即挂机"
		or match_button.text != "匹配挂机"
	):
		_fail_capture("立即挂机／匹配挂机二选一没有完整呈现")
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_CHOICE "
		+ "immediate=true matchmaking=true fullscreen=true"
	)
	await _hold_chapter("start_choice")
	if _failed:
		return

	await _left_click(match_button, "匹配挂机")
	await _settle_frames(5)
	if _match_request_count != 1:
		_fail_capture("匹配挂机真实左键没有进入确定性控制器桥")
		return
	if _panel.is_visible_in_tree():
		_fail_capture("开始匹配后全屏路线页没有立即关闭回到世界")
		return
	if not bool(_host_property("hang_mode_active")):
		_fail_capture("进入匹配后挂机没有继续运行")
		return
	if not _assert_roster_state(
		["human", "empty", "empty", "empty", "empty"],
		["岚牙", "等待真人", "等待真人", "等待真人", "等待真人"],
		"真人优先匹配中",
		true
	):
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_MATCH "
		+ "panel_closed=true world_visible=true human=1 npc=0 empty=4 hang_active=true"
	)
	await _hold_chapter("world_one_human_four_empty")
	if _failed:
		return

	if not _apply_authoritative_state(_matching_state(3, 1, 4)):
		return
	await _settle_frames(4)
	if not _assert_roster_state(
		["human", "npc", "npc", "npc", "npc"],
		["岚牙", "岩牙陪练", "风羽陪练", "木盾陪练", "泉铃陪练"],
		"陪练补位中",
		true
	):
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_NPC_FILL "
		+ "human=1 npc=4 empty=0 explicit_npc_names=true server_ai=true "
		+ "neutral_npc_portraits=true authority_shape=true"
	)
	await _hold_chapter("world_one_human_four_npc")
	if _failed:
		return

	if not _apply_authoritative_state(_matching_state(4, 2, 3)):
		return
	await _settle_frames(4)
	if not _assert_roster_state(
		["human", "human", "npc", "npc", "npc"],
		["岚牙", "石木", "岩牙陪练", "风羽陪练", "木盾陪练"],
		"下一场替换",
		true
	):
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_REPLACEMENT "
		+ "human=2 npc=3 next_match_replacement_visible=true"
	)
	await _hold_chapter("world_two_human_three_npc_next_match")
	if _failed:
		return

	var task_tab := _named_button(_roster, "WorldHudPartyTaskTab")
	var party_tab := _named_button(_roster, "WorldHudPartyTeamTab")
	if task_tab == null or party_tab == null:
		return
	await _left_click(task_tab, "世界HUD任务页签")
	await _settle_frames(3)
	if not _assert_roster_tab("task"):
		return
	await _hold_chapter("task_tab_real_click")
	if _failed:
		return
	await _left_click(party_tab, "世界HUD组队页签")
	await _settle_frames(3)
	if not _assert_roster_tab("party"):
		return
	if not _assert_roster_state(
		["human", "human", "npc", "npc", "npc"],
		["岚牙", "石木", "岩牙陪练", "风羽陪练", "木盾陪练"],
		"下一场替换",
		true
	):
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_TABS "
		+ "task_real_click=true party_real_click=true roster_instance_stable=true"
	)
	await _hold_chapter("party_tab_real_click")
	if _failed:
		return

	var roster_cancel := _named_button(_roster, "WorldHudPartyCancelButton")
	if roster_cancel == null:
		return
	await _left_click(roster_cancel, "世界HUD取消匹配")
	await _settle_frames(4)
	var match_state := _controller_state()
	if (
		_cancel_request_count != 1
		or bool(match_state.get("active", true))
		or str(match_state.get("status", "")) != "cancelled"
		or not bool(_host_property("hang_mode_active"))
	):
		_fail_capture("取消匹配没有收敛到匹配停止、挂机继续")
		return
	if not _assert_roster_state(
		["human", "human", "empty", "empty", "empty"],
		["岚牙", "石木", "等待队友", "等待队友", "等待队友"],
		"当前队伍 2/5",
		false
	):
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_CANCEL "
		+ "match_active=false hang_active=true full_bottom_hud=true"
	)
	await _hold_chapter("cancelled_match_hang_continues")
	if _failed:
		return

	await _left_click(hang_entry as Button, "挂机中入口")
	if not await _expect_panel_visible():
		return
	var stop_button := _named_button(_panel, STOP_BUTTON_NODE)
	if stop_button == null or stop_button.text != "停止挂机":
		_fail_capture("正式挂机全屏页缺少稳定的停止挂机入口")
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_STOP_ENTRY "
		+ "fullscreen=true visible_stop=true real_entry_click=true"
	)
	await _hold_chapter("stop_hang_fullscreen")
	if _failed:
		return
	await _left_click(stop_button, "停止挂机")
	await _settle_frames(5)
	if (
		_stop_request_count != 1
		or bool(_host_property("hang_mode_active"))
		or _panel.is_visible_in_tree()
	):
		_fail_capture("停止挂机没有回到完整世界HUD")
		return
	if (hang_entry as Button).text != "挂机":
		_fail_capture("停止挂机后右下入口文案没有恢复")
		return
	if not _assert_full_world_hud():
		return
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_STOPPED "
		+ "hang_active=false panel_closed=true full_bottom_hud=true"
	)
	await _hold_chapter("stopped_hang_world")
	if _failed:
		return

	if _visible_tree_has_forbidden_review_text():
		_fail_capture("玩家可见界面出现QA／调试／验收文字")
		return
	if not _assert_isolated_transport_idle():
		return
	_restore_product_signal_handlers()
	await _release_capture_audio_runtime()
	if _failed:
		return
	await _settle_frames(2)
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE395_WORLD_PARTY_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "scene=Main.tscn entry=MainSceneFlag completed=true "
			+ "awakened_hud_mounted=true bottom_hud_persistent=true "
			+ "route_choice=true one_human_four_empty=true one_human_four_npc=true "
			+ "two_human_three_npc=true next_match_replacement=true "
			+ "idle_empty_no_fake_human=true active_empty_authoritative=true "
			+ "full_empty_authoritative=true production_party_authority=true "
			+ "fullscreen_production_truth=true "
			+ "task_party_real_click=true cancel_kept_hang=true stopped_hang=true "
			+ "right_party_tab=true five_slots=true legacy_ui_hidden=true "
			+ "backend=false profile_save=false server_writes=0 "
			+ "actual_left_clicks=%d cross_frame_presses=%d"
		) % [elapsed, _actual_left_clicks, _cross_frame_presses]
	)
	# Quit on the next idle turn so this coroutine and Main's awaiting wrapper can
	# unwind after the explicit audio drain, before Movie Maker performs its
	# ObjectDB/resource leak audit.
	host.get_tree().call_deferred("quit", 0)


func _run_authority_projection_hard_gates() -> bool:
	# These transport-shape gates intentionally run synchronously before the
	# first held visual chapter.  Every state still travels through the real
	# Main controller, PanelFlowCoordinator and mounted formal right roster, but
	# the owner-review movie keeps the frozen ten player-facing chapters.
	_panel_flow.call("_close_hang_matchmaking_panel", false)
	if host.has_method("_layout_hud"):
		host.call("_layout_hud")
	_set_host_property("world_hud_active_side_tab", "party")
	_set_host_property("party_current_state", {})
	if not _apply_authoritative_state(_idle_empty_party_state(1)):
		return false
	if not _assert_authority_roster_projection(
		["empty", "empty", "empty", "empty", "empty"],
		["等待队友", "等待队友", "等待队友", "等待队友", "等待队友"],
		["可加入", "可加入", "可加入", "可加入", "可加入"],
		"暂未组队",
		false,
		["岚牙", "队友信息同步中"]
	):
		return false
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_IDLE_EMPTY_PARTY "
		+ "idle_empty_no_fake_human=true"
	)

	_set_host_property("party_current_state", _ordinary_stale_party_state())
	if not _apply_authoritative_state(_active_empty_party_state(2)):
		return false
	if not _assert_authority_roster_projection(
		["human", "npc", "npc", "npc", "npc"],
		["队友信息同步中", "岩牙陪练", "风羽陪练", "木盾陪练", "泉铃陪练"],
		["资料同步中", "8级", "9级", "10级", "11级"],
		"陪练补位中 · 继续找真人",
		true,
		["普通队伍冲突"]
	):
		return false
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_ACTIVE_EMPTY_PARTY "
		+ "active_empty_authoritative=true stale_ordinary_ignored=true "
		+ "human=1 npc=4"
	)

	if not _apply_authoritative_state(_full_empty_party_state(3)):
		return false
	if not _assert_authority_roster_projection(
		["human", "human", "human", "human", "human"],
		[
			"队友信息同步中",
			"队友信息同步中",
			"队友信息同步中",
			"队友信息同步中",
			"队友信息同步中",
		],
		["资料同步中", "资料同步中", "资料同步中", "资料同步中", "资料同步中"],
		"真人队伍已满",
		true,
		["普通队伍冲突"]
	):
		return false
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_FULL_EMPTY_PARTY "
		+ "full_empty_authoritative=true stale_ordinary_ignored=true "
		+ "syncing_humans=5"
	)

	if not _apply_authoritative_state(_production_party_state(4)):
		return false
	if not _assert_authority_roster_projection(
		["human", "human", "empty", "empty", "empty"],
		["队友信息同步中", "星纹", "等待真人", "等待真人", "等待真人"],
		["资料同步中", "37级", "匹配中", "匹配中", "匹配中"],
		"真人优先匹配中",
		true,
		["离线冲突成员", "普通队伍冲突", "1级"]
	):
		return false
	_panel_flow.call("_open_hang_matchmaking_panel")
	if not _assert_fullscreen_production_party_truth():
		return false
	_panel_flow.call("_close_hang_matchmaking_panel", false)
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_PRODUCTION_PARTY "
		+ "offline_filtered=true pending_neutral=true team_snapshot_level=true"
	)
	print(
		"PHASE395_WORLD_PARTY_OWNER_REVIEW_TRUTH_GATES "
		+ "idleEmptyTruth=true activeEmptyTruth=true fullEmptyTruth=true "
		+ "productionPartyTruth=true fullscreenProductionTruth=true"
	)

	# Do not let any fixture survive into the visible review chapters.  Clearing
	# the controller first would briefly let its idle signal reuse the production
	# party cache, so empty the cache before resetting the model.
	_set_host_property("party_current_state", {})
	var controller = _host_property("hang_matchmaking_controller")
	if controller == null or not controller.has_method("clear_local_state"):
		_fail_capture("权威投影预检无法恢复挂机匹配控制器")
		return false
	controller.call("clear_local_state")
	if not _apply_authoritative_state(_idle_listing_state()):
		return false
	_panel_flow.call("_open_hang_matchmaking_panel")
	_panel.call("set_view_mode", "browse")
	_panel.call("hide_start_choice")
	if not _panel.is_visible_in_tree():
		_fail_capture("权威投影预检后没有恢复正式挂机路线页")
		return false
	return true


func _assert_fullscreen_production_party_truth() -> bool:
	if not _panel.is_visible_in_tree():
		_fail_capture("生产party真值没有穿过正式挂机匹配全屏页")
		return false
	var snapshot_value = _panel.call("debug_snapshot")
	if not (snapshot_value is Dictionary):
		_fail_capture("正式挂机匹配全屏页缺少生产party快照")
		return false
	var snapshot := snapshot_value as Dictionary
	if (
		str(snapshot.get("viewMode", "")) != "matching"
		or not bool(snapshot.get("matching", false))
		or int(snapshot.get("humanCount", 0)) != 2
		or int(snapshot.get("npcCount", 0)) != 0
		or int(snapshot.get("emptyCount", 0)) != 3
	):
		_fail_capture("正式挂机匹配全屏页没有使用生产party计数：%s" % str(snapshot))
		return false
	var visible_texts: Array[String] = []
	for type_name in ["Label", "RichTextLabel", "Button"]:
		for value in _panel.find_children("*", type_name, true, false):
			if not (value is CanvasItem) or not (value as CanvasItem).is_visible_in_tree():
				continue
			var text_value := ""
			if value is Label:
				text_value = (value as Label).text.strip_edges()
			elif value is RichTextLabel:
				text_value = (value as RichTextLabel).get_parsed_text().strip_edges()
			elif value is Button:
				text_value = (value as Button).text.strip_edges()
			if text_value != "":
				visible_texts.append(text_value)
	for required in ["星纹", "Lv37", "队友信息同步中", "资料同步中"]:
		if not visible_texts.has(required):
			_fail_capture(
				"正式挂机匹配全屏页缺少生产party玩家文案：%s texts=%s"
				% [required, str(visible_texts)]
			)
			return false
	for forbidden in ["离线冲突成员", "Lv1"]:
		if visible_texts.has(forbidden):
			_fail_capture("正式挂机匹配全屏页泄漏降级/离线文案：%s" % forbidden)
			return false
	for text_value in visible_texts:
		if text_value.contains("普通队伍冲突"):
			_fail_capture("正式挂机匹配全屏页泄漏普通队伍缓存")
			return false
	return true


func _assert_authority_roster_projection(
	expected_kinds: Array,
	expected_names: Array,
	expected_level_texts: Array,
	expected_status: String,
	expected_cancel_visible: bool,
	forbidden_name_needles: Array
) -> bool:
	if not _assert_formal_party_roster() or not _assert_legacy_ui_hidden():
		return false
	var snapshot_value = _roster.call("debug_snapshot")
	var state_value = _roster.get("_state")
	if not (snapshot_value is Dictionary) or not (state_value is Dictionary):
		_fail_capture("正式组队右栏缺少可验证的运行时投影")
		return false
	var snapshot := snapshot_value as Dictionary
	var state := state_value as Dictionary
	var rows_value = state.get("rows", [])
	if not (rows_value is Array):
		_fail_capture("正式组队右栏投影没有五席 rows")
		return false
	var row_kinds: Array[String] = []
	var row_names: Array[String] = []
	var row_level_texts: Array[String] = []
	for raw_row in rows_value as Array:
		if not (raw_row is Dictionary):
			continue
		var row := raw_row as Dictionary
		row_kinds.append(str(row.get("kind", "")))
		row_names.append(str(row.get("name", "")))
		row_level_texts.append(str(row.get("levelText", "")))
		if (
			str(row.get("kind", "")) == "npc"
			and str(row.get("portraitTexturePath", ""))
			!= NEUTRAL_PARTY_PORTRAIT_PATH
		):
			_fail_capture("空party权威NPC没有使用正式中性头像")
			return false
	var expected_kind_values: Array[String] = []
	var expected_name_values: Array[String] = []
	var expected_level_values: Array[String] = []
	for value in expected_kinds:
		expected_kind_values.append(str(value))
	for value in expected_names:
		expected_name_values.append(str(value))
	for value in expected_level_texts:
		expected_level_values.append(str(value))
	if (
		str(snapshot.get("activeTab", "")) != "party"
		or not bool(snapshot.get("partyVisible", false))
		or bool(snapshot.get("taskVisible", true))
		or int(snapshot.get("rowCount", 0)) != 5
		or row_kinds != expected_kind_values
		or row_names != expected_name_values
		or row_level_texts != expected_level_values
		or str(snapshot.get("statusText", "")) != expected_status
		or bool(snapshot.get("cancelVisible", false)) != expected_cancel_visible
	):
		_fail_capture(
			"正式右栏未遵守权威party投影：snapshot=%s levels=%s"
			% [str(snapshot), str(row_level_texts)]
		)
		return false
	for raw_needle in forbidden_name_needles:
		var needle := str(raw_needle)
		for value in row_names + row_level_texts:
			if str(value).contains(needle):
				_fail_capture("正式右栏泄漏了禁止的旧/降级值：%s" % needle)
				return false
	return true


func _release_capture_audio_runtime() -> void:
	# Movie Maker exits immediately after the review coroutine finishes.  Stop
	# and detach every playback stream while Main is still alive, then give the
	# audio thread several real frames to release its Ogg playback objects before
	# SceneTree teardown performs Godot's ObjectDB/resource leak audit.
	var audio_manager = _host_property("game_audio_manager")
	if audio_manager == null or not is_instance_valid(audio_manager):
		_fail_capture("真实 Main 缺少音频管理器，无法完成无泄漏录像收口")
		return
	if not audio_manager.has_method("stop_all"):
		_fail_capture("真实 Main 音频管理器缺少停止全部播放 API")
		return
	audio_manager.call("stop_all")
	for value in (audio_manager as Node).find_children("*", "AudioStreamPlayer", true, false):
		if not (value is AudioStreamPlayer):
			continue
		var player := value as AudioStreamPlayer
		player.stop()
		player.stream = null
	for _frame in range(8):
		await host.get_tree().process_frame


func _prepare_real_main_world() -> bool:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return false
	var current_scene := host.get_tree().current_scene as Node
	if current_scene != host or current_scene.scene_file_path != "res://scenes/Main.tscn":
		_fail_capture("Phase395 验收必须由真实 Main.tscn flag 启动")
		return false
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if Vector2i(roundi(viewport_size.x), roundi(viewport_size.y)) != EXPECTED_VIEWPORT:
		_fail_capture("Phase395 验收视口必须为 1280×720")
		return false

	_set_host_property("profile_save_enabled", false)
	_set_host_property("account_authenticated", true)
	_set_host_property("auth_auto_bypass", false)
	_set_host_property("current_account_session", {
		"accountId": ACCOUNT_ID,
		"displayName": "岚牙",
		"authSource": "isolated_owner_review",
	})
	_set_host_property("server_profile_sync_state", "off")
	_set_host_property("server_profile_sync_pending_kind", "")
	_set_host_property("server_profile_sync_dirty", false)
	_set_host_property("server_profile_sync_pull_queued", false)
	var profile := PlayerProgressModel.normalize_profile(
		PlayerProgressModel.with_starter_equipment(PlayerProgressModel.default_profile())
	)
	var player_value = profile.get("player", {})
	var profile_player := (
		(player_value as Dictionary).duplicate(true)
		if player_value is Dictionary
		else {}
	)
	profile_player["name"] = "岚牙"
	profile_player["level"] = 8
	profile["player"] = profile_player
	_set_host_property("player_profile", profile)
	if host.has_method("_stop_server_event_stream"):
		host.call("_stop_server_event_stream")
	if host.has_method("_stop_online_position_sync"):
		host.call("_stop_online_position_sync")
	for request_name in [
		"auth_http_request",
		"profile_sync_http_request",
		"online_position_http_request",
		"chat_http_request",
		"party_http_request",
	]:
		var request_value = _host_property(request_name)
		if request_value is HTTPRequest:
			(request_value as HTTPRequest).cancel_request()
	for method_name in [
		"_close_auth_panel",
		"_close_account_panel",
		"_close_party_panel",
		"_close_market_panel",
		"_close_battle_result_panel",
	]:
		if host.has_method(method_name):
			host.call(method_name, false)
	var entry_panel = _host_property("character_entry_panel")
	if entry_panel is CanvasItem:
		(entry_panel as CanvasItem).visible = false
	if host.has_method("_load_map"):
		var loaded = host.call("_load_map", WORLD_MAP_ID, WORLD_SPAWN_NAME)
		if loaded is bool and not bool(loaded):
			_fail_capture("无法载入挂机匹配验收世界地图")
			return false
	if host.has_method("_update_hud_text"):
		host.call("_update_hud_text", true)

	for _frame in range(READY_FRAME_LIMIT):
		_world_hud = _world_hud_view(false)
		_roster = _party_roster_view(_world_hud, false)
		_panel_flow = _host_property("panel_flow_coordinator")
		_panel = _host_property("hang_matchmaking_panel")
		if (
			_world_hud != null
			and _roster != null
			and _panel_flow != null
			and _panel != null
			and _host_property("hang_matchmaking_controller") != null
		):
			_world_hud.call("set_collapsed", false)
			_formal_roster_instance_id = _roster.get_instance_id()
			var controller = _host_property("hang_matchmaking_controller")
			if controller.has_method("clear_local_state"):
				controller.call("clear_local_state")
			if host.has_method("_close_hang_matchmaking_panel"):
				host.call("_close_hang_matchmaking_panel", false)
			if host.has_method("_set_hang_mode"):
				host.call("_set_hang_mode", false)
			_set_host_property("world_hud_active_side_tab", "party")
			if _panel_flow.has_method("_refresh_hang_matchmaking_views"):
				_panel_flow.call("_refresh_hang_matchmaking_views")
			if host.has_method("_layout_hud"):
				host.call("_layout_hud")
			await _settle_frames(6)
			return true
		await host.get_tree().process_frame
	_fail_capture("正式 WorldHud、五席组队或挂机匹配控制器没有在限定帧内接入 Main")
	return false


func _install_deterministic_controller_bridge() -> bool:
	if not _replace_signal_handler(
		_panel,
		"match_requested",
		"_on_hang_matchmaking_match_requested",
		Callable(self, "_on_local_match_requested")
	):
		return false
	if not _replace_signal_handler(
		_panel,
		"cancel_requested",
		"_on_hang_matchmaking_cancel_requested",
		Callable(self, "_on_local_cancel_requested")
	):
		return false
	if not _replace_signal_handler(
		_roster,
		"cancel_match_requested",
		"_on_hang_matchmaking_cancel_requested",
		Callable(self, "_on_local_cancel_requested")
	):
		return false
	if not _panel.has_signal("stop_requested"):
		_fail_capture("正式挂机面板尚未冻结 stop_requested 信号")
		return false
	if not _replace_signal_handler(
		_panel,
		"stop_requested",
		"_on_hang_matchmaking_stop_requested",
		Callable(self, "_on_local_stop_requested")
	):
		return false
	return true


func _replace_signal_handler(
	source: Object,
	signal_name: String,
	product_method: String,
	replacement: Callable
) -> bool:
	if source == null or not source.has_signal(signal_name):
		_fail_capture("确定性控制器无法接管信号：%s" % signal_name)
		return false
	for connection in source.get_signal_connection_list(signal_name):
		if not (connection is Dictionary):
			continue
		var callable_value = (connection as Dictionary).get("callable", Callable())
		if not (callable_value is Callable):
			continue
		var callback := callable_value as Callable
		if callback.get_method() != product_method:
			continue
		if source.is_connected(signal_name, callback):
			source.disconnect(signal_name, callback)
	if not source.is_connected(signal_name, replacement):
		source.connect(signal_name, replacement)
	return true


func _restore_product_signal_handlers() -> void:
	if _panel_flow == null:
		return
	_restore_signal_handler(
		_panel,
		"match_requested",
		Callable(self, "_on_local_match_requested"),
		Callable(_panel_flow, "_on_hang_matchmaking_match_requested")
	)
	_restore_signal_handler(
		_panel,
		"cancel_requested",
		Callable(self, "_on_local_cancel_requested"),
		Callable(_panel_flow, "_on_hang_matchmaking_cancel_requested")
	)
	_restore_signal_handler(
		_roster,
		"cancel_match_requested",
		Callable(self, "_on_local_cancel_requested"),
		Callable(_panel_flow, "_on_hang_matchmaking_cancel_requested")
	)
	_restore_signal_handler(
		_panel,
		"stop_requested",
		Callable(self, "_on_local_stop_requested"),
		Callable(_panel_flow, "_on_hang_matchmaking_stop_requested")
	)


func _restore_signal_handler(
	source: Object,
	signal_name: String,
	replacement: Callable,
	product_handler: Callable
) -> void:
	if source == null or not source.has_signal(signal_name):
		return
	if source.is_connected(signal_name, replacement):
		source.disconnect(signal_name, replacement)
	if product_handler.is_valid() and not source.is_connected(signal_name, product_handler):
		source.connect(signal_name, product_handler)


func _on_local_match_requested(route_id: String) -> void:
	if route_id != str(_selected_route.get("routeId", "")):
		_fail_capture("匹配按钮提交了错误练级路线")
		return
	_match_request_count += 1
	# Run the real product transition first: it validates the selected route,
	# switches the formal right tab, closes the full-screen panel, and lays out
	# the actual world.  The capture then removes only the pending travel intent
	# so no HTTP/session write can follow in this isolated run.
	_panel_flow.call("_begin_hang_matchmaking_route", route_id, "match")
	var pending_route = _host_property("hang_matchmaking_pending_route")
	if pending_route is Dictionary:
		(pending_route as Dictionary).clear()
	_set_host_property("hang_matchmaking_pending_mode", "")
	_set_host_property("hang_matchmaking_route_check_elapsed", 0.0)
	var player_value = _host_property("player")
	if player_value is Node and (player_value as Node).has_method("clear_move_target"):
		(player_value as Node).call("clear_move_target")
	if host.has_method("_clear_navigation_state"):
		host.call("_clear_navigation_state")
	if host.has_method("_set_hang_mode"):
		host.call("_set_hang_mode", true)
	_set_host_property("hang_walk_cooldown", 9999.0)
	_apply_authoritative_state(_matching_state(2, 1, 0))
	if host.has_method("_layout_hud"):
		host.call("_layout_hud")


func _on_local_cancel_requested() -> void:
	_cancel_request_count += 1
	_apply_authoritative_state(_cancelled_state())


func _on_local_stop_requested() -> void:
	_stop_request_count += 1
	if host.has_method("_stop_hang_activity"):
		host.call("_stop_hang_activity", "挂机已停止。", true, false)


func _idle_empty_party_state(revision: int) -> Dictionary:
	return {
		"schemaVersion": 1,
		"active": false,
		"status": "idle",
		"stateRevision": revision,
		"queueId": "",
		"target": _target.duplicate(true),
		# The production idle transport retains the local-account count even
		# though party={} owns no renderable member identity.
		"humanCount": 1,
		"npcCount": 0,
		"emptyCount": 4,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0,
		"party": {},
		"npcMembers": [],
		"listings": [],
		"message": "暂未组队。",
		"replayed": false,
	}


func _active_empty_party_state(revision: int) -> Dictionary:
	return {
		"schemaVersion": 1,
		"active": true,
		"status": "npc_filled",
		"stateRevision": revision,
		"queueId": QUEUE_ID,
		"target": _target.duplicate(true),
		"humanCount": 1,
		"npcCount": 4,
		"emptyCount": 0,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0,
		# This is the public production authority shape while member detail is
		# still syncing.  The ordinary party cache must never fill this object.
		"party": {},
		"npcMembers": _authority_npc_members(4),
		"listings": [],
		"message": "陪练NPC已临时补位。",
		"replayed": false,
	}


func _full_empty_party_state(revision: int) -> Dictionary:
	return {
		"schemaVersion": 1,
		"active": false,
		"status": "full",
		"stateRevision": revision,
		"queueId": QUEUE_ID,
		"target": _target.duplicate(true),
		"humanCount": 5,
		"npcCount": 0,
		"emptyCount": 0,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0,
		"party": {},
		"npcMembers": [],
		"listings": [],
		"message": "队伍已满，队友资料同步中。",
		"replayed": false,
	}


func _production_party_state(revision: int) -> Dictionary:
	return {
		"schemaVersion": 1,
		"active": true,
		"status": "matching",
		"stateRevision": revision,
		"queueId": QUEUE_ID,
		"target": _target.duplicate(true),
		# Only the two online humans count.  The offline transport row below is
		# present specifically to prove the formal matchmaking UI filters it.
		"humanCount": 2,
		"npcCount": 0,
		"emptyCount": 3,
		"maxMembers": 5,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 8000,
		"party": {
			"partyId": "phase395_production_party",
			"leaderAccountId": "phase395_pending_online",
			"memberCount": 3,
			"maxMembers": 5,
			"members": [
				{
					"accountId": "phase395_offline_conflict",
					"displayName": "离线冲突成员",
					"level": 88,
					"role": "member",
					"online": false,
				},
				{
					"accountId": "phase395_pending_online",
					"role": "leader",
					"online": true,
					"detailsPending": true,
				},
				{
					"accountId": "phase395_team_snapshot",
					"displayName": "星纹",
					# The flat fallback is intentionally wrong/stale.  The authority
					# contract requires the nested teamSnapshot.player.level.
					"level": 1,
					"role": "member",
					"online": true,
					"teamSnapshot": {
						"player": {
							"level": 37,
							"appearanceId": "obsidian_scout_v1",
							"elements": {"earth": 7, "water": 3},
						},
					},
				},
			],
		},
		"npcMembers": [],
		"listings": [],
		"message": "真人队友资料同步中。",
		"replayed": false,
	}


func _ordinary_stale_party_state() -> Dictionary:
	var members: Array[Dictionary] = []
	for index in range(5):
		members.append({
			"accountId": "phase395_ordinary_stale_%d" % index,
			"displayName": "普通队伍冲突%d" % (index + 1),
			"appearanceId": "novice_hunter_v1",
			"level": 90 + index,
			"role": "leader" if index == 0 else "member",
			"online": true,
		})
	return {
		"party": {
			"partyId": "phase395_ordinary_stale_party",
			"leaderAccountId": "phase395_ordinary_stale_0",
			"memberCount": 5,
			"maxMembers": 5,
			"members": members,
		},
	}


func _authority_npc_members(count: int) -> Array[Dictionary]:
	var names := ["岩牙陪练", "风羽陪练", "木盾陪练", "泉铃陪练"]
	var members: Array[Dictionary] = []
	for index in range(clampi(count, 0, names.size())):
		members.append({
			"npcId": "phase395_training_npc_%d" % index,
			"displayName": names[index],
			"level": 8 + index,
			"controller": "server_ai",
			"matchmakingNpc": true,
			"rewardEligible": false,
			"schemaVersion": 1,
		})
	return members


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
		"party": null,
		"npcMembers": [],
		"listings": [{
			"schemaVersion": 1,
			"queueId": "phase395_visible_listing",
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
		"appearanceId": "novice_hunter_v1",
		"level": 8,
		"role": "leader",
		"online": true,
		"elements": {"fire": 6, "wind": 4},
	}]
	if human_count >= 2:
		human_members.append({
			"accountId": "phase395_real_companion",
			"displayName": "石木",
			"appearanceId": "obsidian_scout_v1",
			"level": 9,
			"role": "member",
			"online": true,
			"elements": {"earth": 7, "water": 3},
		})
	var npc_names := ["岩牙陪练", "风羽陪练", "木盾陪练", "泉铃陪练"]
	var npc_members: Array[Dictionary] = []
	for index in range(npc_count):
		npc_members.append({
			"npcId": "phase395_training_npc_%d" % index,
			"displayName": npc_names[index],
			"level": 8 + index,
			"controller": "server_ai",
			"matchmakingNpc": true,
			"rewardEligible": false,
			"schemaVersion": 1,
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
		"npcFillInMs": 0 if npc_count > 0 else 8000,
		"party": {
			"partyId": "phase395_owner_review_party",
			"leaderAccountId": ACCOUNT_ID,
			"memberCount": human_count,
			"maxMembers": 5,
			"members": human_members,
		},
		"npcMembers": npc_members,
		"listings": [],
		"message": (
			"真人加入后，陪练NPC将在下一场战斗前让位。"
			if human_count >= 2 and npc_count > 0
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
			"partyId": "phase395_owner_review_party",
			"leaderAccountId": ACCOUNT_ID,
			"memberCount": 2,
			"maxMembers": 5,
			"members": [
				{
					"accountId": ACCOUNT_ID,
					"displayName": "岚牙",
					"appearanceId": "novice_hunter_v1",
					"level": 8,
					"role": "leader",
					"online": true,
				},
				{
					"accountId": "phase395_real_companion",
					"displayName": "石木",
					"appearanceId": "obsidian_scout_v1",
					"level": 9,
					"role": "member",
					"online": true,
				},
			],
		},
		"npcMembers": [],
		"listings": [],
		"message": "已取消匹配，挂机继续。",
		"replayed": false,
	}


func _apply_authoritative_state(state: Dictionary) -> bool:
	if not host.has_method("_debug_apply_hang_matchmaking_state"):
		_fail_capture("Main 缺少确定性权威状态注入入口")
		return false
	var result_value = host.call("_debug_apply_hang_matchmaking_state", state)
	if not (result_value is Dictionary):
		_fail_capture("权威状态注入没有返回合同结果")
		return false
	var result := result_value as Dictionary
	if not bool(result.get("accepted", false)):
		_fail_capture("本地权威状态被拒绝：%s" % str(result.get("reason", "unknown")))
		return false
	if _panel_flow.has_method("_refresh_hang_matchmaking_views"):
		_panel_flow.call("_refresh_hang_matchmaking_views")
	return true


func _controller_state() -> Dictionary:
	var controller = _host_property("hang_matchmaking_controller")
	if controller != null and controller.has_method("current_state"):
		var value = controller.call("current_state")
		if value is Dictionary:
			return value as Dictionary
	return {}


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


func _assert_fullscreen_panel(expected_view: String = "") -> bool:
	if _panel == null or not is_instance_valid(_panel) or not _panel.is_visible_in_tree():
		_fail_capture("挂机匹配全屏页不可见")
		return false
	var snapshot_value = _panel.call("debug_snapshot")
	if not (snapshot_value is Dictionary):
		_fail_capture("挂机匹配全屏页 debug_snapshot 无效")
		return false
	if (
		expected_view != ""
		and str((snapshot_value as Dictionary).get("viewMode", "")) != expected_view
	):
		_fail_capture("挂机匹配全屏页没有进入%s视图" % expected_view)
		return false
	if not _assert_legacy_ui_hidden():
		return false
	return true


func _assert_full_world_hud() -> bool:
	if _world_hud == null or not is_instance_valid(_world_hud):
		_fail_capture("正式 WorldHud 不存在")
		return false
	var contract_value = _world_hud.call("layout_contract")
	if not (contract_value is Dictionary):
		_fail_capture("WorldHud layout_contract 返回值无效")
		return false
	var contract := contract_value as Dictionary
	if not bool(contract.get("mounted", false)):
		_fail_capture("WorldHud 尚未正式 mounted")
		return false
	if bool(contract.get("collapsed", true)):
		_fail_capture("WorldHud 处于收起态，右下完整功能栏不可验收")
		return false
	var action_rect_value = contract.get("actionBarRect", null)
	if not (action_rect_value is Rect2):
		_fail_capture("WorldHud 缺少 actionBarRect 合同")
		return false
	var action_rect := action_rect_value as Rect2
	if (
		action_rect.position.distance_to(EXPECTED_ACTION_RECT.position) > 3.0
		or action_rect.size.distance_to(EXPECTED_ACTION_RECT.size) > 3.0
	):
		_fail_capture("右下 action bar 不是 1280×720 正式布局：%s" % str(action_rect))
		return false
	var action_bar = _host_property("action_bar")
	if not (action_bar is Control) or not (action_bar as Control).is_visible_in_tree():
		_fail_capture("右下 action bar 没有在世界画面显示")
		return false
	var dock := _named_control(_world_hud, "WorldHudDockSurface")
	var fixed_entries := _named_control(_world_hud, "WorldHudFixedEntries")
	if dock == null or not dock.is_visible_in_tree():
		_fail_capture("正式 WorldHudDockSurface 不可见")
		return false
	if fixed_entries == null or not fixed_entries.is_visible_in_tree():
		_fail_capture("正式 WorldHudFixedEntries 不可见")
		return false
	if not _world_hud.is_ancestor_of(dock) or not _world_hud.is_ancestor_of(fixed_entries):
		_fail_capture("右下功能栏不属于正式 WorldHud，疑似隔离旧 HUD")
		return false
	if host.has_method("_world_menu_is_open") and bool(host.call("_world_menu_is_open")):
		_fail_capture("世界菜单仍打开，不能把遮挡状态当作世界返回态")
		return false
	if not _assert_formal_party_roster():
		return false
	return _assert_legacy_ui_hidden()


func _assert_formal_party_roster() -> bool:
	if _roster == null or not is_instance_valid(_roster):
		_fail_capture("正式右侧组队组件不存在")
		return false
	if _roster.get_instance_id() != _formal_roster_instance_id:
		_fail_capture("匹配状态切换时重建了正式组队组件")
		return false
	for method_name in ["slot_count", "debug_snapshot", "active_tab"]:
		if not _roster.has_method(method_name):
			_fail_capture("正式组队组件缺少稳定 API：%s" % method_name)
			return false
	if not _world_hud.is_ancestor_of(_roster):
		_fail_capture("五席组队组件未嵌入正式 WorldHud 右侧")
		return false
	if not (_roster is Control) or not (_roster as Control).is_visible_in_tree():
		_fail_capture("正式五席组队组件不可见")
		return false
	var roster_rect := (_roster as Control).get_global_rect()
	if (
		roster_rect.position.x < 985.0
		or roster_rect.end.x > 1225.0
		or roster_rect.size.x < 190.0
		or roster_rect.size.x > 220.0
		or roster_rect.size.y < 360.0
	):
		_fail_capture("正式组队组件没有位于 206×402 世界 HUD 右侧：%s" % str(roster_rect))
		return false
	if int(_roster.call("slot_count")) != 5:
		_fail_capture("正式组队页没有固定五个席位")
		return false
	for node_name in [
		"WorldHudPartyRosterShell",
		"WorldHudPartyTaskTab",
		"WorldHudPartyTeamTab",
		"WorldHudPartyMemberList",
		"WorldHudPartyMember1",
		"WorldHudPartyMember2",
		"WorldHudPartyMember3",
		"WorldHudPartyMember4",
		"WorldHudPartyMember5",
		"WorldHudPartyDetailButton",
		"WorldHudPartyCancelButton",
	]:
		var control := _named_control(_roster, node_name)
		if control == null:
			return false
	return true


func _assert_roster_state(
	expected_kinds: Array,
	expected_names: Array,
	status_needle: String,
	expected_cancel_visible: bool
) -> bool:
	if not _assert_full_world_hud():
		return false
	var snapshot_value = _roster.call("debug_snapshot")
	if not (snapshot_value is Dictionary):
		_fail_capture("正式组队组件 debug_snapshot 返回值无效")
		return false
	var snapshot := snapshot_value as Dictionary
	var row_kinds: Array[String] = []
	for value in snapshot.get("rowKinds", []):
		row_kinds.append(str(value))
	var row_names: Array[String] = []
	for value in snapshot.get("rowNames", []):
		row_names.append(str(value))
	var expected_kind_values: Array[String] = []
	for value in expected_kinds:
		expected_kind_values.append(str(value))
	var expected_name_values: Array[String] = []
	for value in expected_names:
		expected_name_values.append(str(value))
	if (
		str(snapshot.get("activeTab", "")) != "party"
		or not bool(snapshot.get("partyVisible", false))
		or bool(snapshot.get("taskVisible", true))
		or int(snapshot.get("rowCount", 0)) != 5
		or row_kinds != expected_kind_values
		or row_names != expected_name_values
		or not str(snapshot.get("statusText", "")).contains(status_needle)
		or bool(snapshot.get("cancelVisible", false)) != expected_cancel_visible
	):
		_fail_capture("正式右侧五席状态不符合权威投影：%s" % str(snapshot))
		return false
	if not _assert_neutral_npc_portraits(expected_kind_values):
		return false
	return true


func _assert_neutral_npc_portraits(expected_kinds: Array[String]) -> bool:
	for index in range(expected_kinds.size()):
		if expected_kinds[index] != "npc":
			continue
		var row := _named_control(
			_roster,
			"WorldHudPartyMember%d" % (index + 1)
		)
		if row == null:
			return false
		var portrait := _named_control(row, "Portrait") as TextureRect
		if (
			portrait == null
			or portrait.texture == null
			or portrait.texture.resource_path != NEUTRAL_PARTY_PORTRAIT_PATH
		):
			_fail_capture(
				"无权威头像的NPC陪练没有使用中性组队图标：席位%d" % (index + 1)
			)
			return false
	return true


func _assert_roster_tab(expected_tab: String) -> bool:
	if not _assert_full_world_hud():
		return false
	var snapshot := _roster.call("debug_snapshot") as Dictionary
	var task_expected := expected_tab == "task"
	if (
		str(snapshot.get("activeTab", "")) != expected_tab
		or bool(snapshot.get("taskVisible", false)) != task_expected
		or bool(snapshot.get("partyVisible", false)) == task_expected
	):
		_fail_capture("任务／组队真实页签没有切换：%s" % str(snapshot))
		return false
	return true


func _assert_legacy_ui_hidden() -> bool:
	for property_name in [
		"party_panel",
		"party_roster_panel",
		"hang_matchmaking_world_status",
	]:
		var value = _host_property(property_name)
		if value is CanvasItem and (value as CanvasItem).is_visible_in_tree():
			_fail_capture("旧程序UI仍可见：%s" % property_name)
			return false
	var retired = _world_hud.find_child("WorldHudLegacySideTabsRetired", true, false)
	if retired is CanvasItem and (retired as CanvasItem).is_visible_in_tree():
		_fail_capture("旧世界任务／组队页签仍可见")
		return false
	for node_name in ["PartyPanel", "PartyRosterPanel"]:
		var value = host.find_child(node_name, true, false)
		if (
			value is CanvasItem
			and (value as CanvasItem).is_visible_in_tree()
			and value != _roster
			and not _roster.is_ancestor_of(value)
		):
			_fail_capture("旧组队节点仍覆盖正式WorldHud：%s" % node_name)
			return false
	return true


func _assert_isolated_transport_idle() -> bool:
	if bool(_host_property("profile_save_enabled")):
		_fail_capture("隔离验收意外恢复了档案写入")
		return false
	var session = _host_property("current_account_session")
	if not (session is Dictionary) or str((session as Dictionary).get("authSource", "")) == "server":
		_fail_capture("隔离验收意外使用服务器登录态")
		return false
	var controller = _host_property("hang_matchmaking_controller")
	if controller != null and controller.has_method("request_active") and bool(controller.call("request_active")):
		_fail_capture("隔离验收结束时仍存在挂机匹配HTTP请求")
		return false
	var request_node = host.find_child("HangMatchmakingHttpRequest", true, false)
	if (
		request_node is HTTPRequest
		and (request_node as HTTPRequest).get_http_client_status() != HTTPClient.STATUS_DISCONNECTED
	):
		_fail_capture("隔离验收的挂机匹配HTTP客户端不是断开态")
		return false
	return true


func _expect_panel_view(view_mode: String, choice_visible: bool) -> bool:
	await _settle_frames(3)
	if not _assert_fullscreen_panel(view_mode):
		return false
	var snapshot := _panel.call("debug_snapshot") as Dictionary
	if bool(snapshot.get("choiceVisible", false)) != choice_visible:
		_fail_capture("挂机匹配面板二选一显示状态错误")
		return false
	return true


func _expect_panel_visible() -> bool:
	await _settle_frames(3)
	return _assert_fullscreen_panel()


func _world_hud_view(report_error: bool = true):
	var candidate = _host_property("world_hud_awakened_view")
	if not (candidate is Node):
		candidate = host.find_child("WorldHudAwakenedView", true, false)
	if not (candidate is Node):
		if report_error:
			_fail_capture("觉醒式 WorldHud 尚未接入真实 Main")
		return null
	for method_name in ["layout_contract", "set_collapsed", "is_collapsed"]:
		if not candidate.has_method(method_name):
			if report_error:
				_fail_capture("WorldHud 缺少稳定验收 API：%s" % method_name)
			return null
	return candidate


func _party_roster_view(world_hud, report_error: bool = true):
	var candidate = _host_property("world_hud_party_roster_view")
	if candidate is Node and candidate.has_method("slot_count"):
		return candidate
	var shell := _named_control(world_hud, "WorldHudPartyRosterShell", false)
	var cursor: Node = shell
	while cursor != null:
		if cursor.has_method("slot_count") and cursor.has_method("debug_snapshot"):
			return cursor
		cursor = cursor.get_parent()
	if report_error:
		_fail_capture("正式 WorldHudPartyRosterView 尚未接入右侧")
	return null


func _named_button(root_node, node_name: String, report_error: bool = true) -> Button:
	var control := _named_control(root_node, node_name, report_error)
	if control == null:
		return null
	if not (control is Button):
		if report_error:
			_fail_capture("稳定节点不是按钮：%s" % node_name)
		return null
	return control as Button


func _named_control(root_node, node_name: String, report_error: bool = true) -> Control:
	if not (root_node is Node):
		if report_error:
			_fail_capture("无法在空节点查找：%s" % node_name)
		return null
	var value = (root_node as Node).find_child(node_name, true, false)
	if value is Control:
		return value as Control
	if report_error:
		_fail_capture("正式界面缺少稳定节点：%s" % node_name)
	return null


func _left_click(control: Control, label: String) -> void:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		_fail_capture("%s不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	if not host.get_viewport().get_visible_rect().has_point(viewport_point):
		_fail_capture("%s不在1280×720可点击区域内" % label)
		return
	var input_position: Vector2 = host.get_viewport().get_screen_transform() * viewport_point
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	await host.get_tree().process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	Input.parse_input_event(release)
	await host.get_tree().process_frame
	_actual_left_clicks += 1
	if release_frame <= press_frame:
		_fail_capture("%s的左键按下与释放没有跨帧" % label)
		return
	_cross_frame_presses += 1


func _visible_tree_has_forbidden_review_text() -> bool:
	var needles := ["qa", "调试", "验收", "phase395", "owner review"]
	for type_name in ["Label", "RichTextLabel", "Button"]:
		for value in host.find_children("*", type_name, true, false):
			if not (value is CanvasItem) or not (value as CanvasItem).is_visible_in_tree():
				continue
			var text_value := ""
			if value is Label:
				text_value = (value as Label).text.to_lower()
			elif value is RichTextLabel:
				text_value = (value as RichTextLabel).get_parsed_text().to_lower()
			elif value is Button:
				text_value = (value as Button).text.to_lower()
			for needle in needles:
				if text_value.contains(needle):
					return true
	return false


func _host_property(property_name: String):
	if host == null:
		return null
	for raw_property in host.get_property_list():
		if raw_property is Dictionary and str(raw_property.get("name", "")) == property_name:
			return host.get(property_name)
	return null


func _set_host_property(property_name: String, value) -> void:
	if host == null:
		return
	for raw_property in host.get_property_list():
		if raw_property is Dictionary and str(raw_property.get("name", "")) == property_name:
			host.set(property_name, value)
			return


func _settle_frames(frame_count: int) -> void:
	for _frame in range(maxi(0, frame_count)):
		await host.get_tree().process_frame


func _hold_chapter(chapter_id: String) -> void:
	var seconds := 0.0
	for chapter in CHAPTERS:
		if str(chapter.get("id", "")) == chapter_id:
			seconds = float(chapter.get("seconds", 0.0))
			break
	if seconds <= 0.0:
		_fail_capture("未知录像章节：%s" % chapter_id)
		return
	print(
		(
			"PHASE395_WORLD_PARTY_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter_id, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	print("PHASE395_WORLD_PARTY_OWNER_REVIEW_FAILED reason=%s" % message)
	push_error("Phase395 world party owner review failed: %s" % message)
	if host != null and is_instance_valid(host):
		_restore_product_signal_handlers()
		host.get_tree().call_deferred("quit", 1)
