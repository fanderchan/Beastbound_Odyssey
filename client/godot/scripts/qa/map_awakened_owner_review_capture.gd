extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const CAPTURE_FLAG := "--map-awakened-owner-review-capture"
const PERF_CAPTURE_FLAG := "--map-awakened-owner-review-perf"
const REVIEW_FPS := 30
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const READY_FRAME_LIMIT := 360
const WORLD_MAP_ID := "firebud_village_gate"
const WORLD_SPAWN_NAME := "from_training_yard"
const LOCAL_TARGET_ID := "interaction:firebud_doctor"
const LOCAL_PENDING_INTERACTION_ID := "firebud_doctor"
const WORLD_REGION_ID := "shadow_oath_cavern"
const WORLD_DESTINATION_MAP_ID := "shadow_oath_cavern_f2"
const EXPECTED_WORLD_REGION_COUNT := 9
const EXPECTED_ROUTE_PATH: Array[String] = [
	"firebud_village_gate",
	"shadow_oath_cavern",
	"shadow_oath_cavern_f2",
]
const PERF_STATE_SECONDS := 7.2
const PERF_STRESS_CYCLES := 12
const PERF_CLICK_PAUSE_SECONDS := 0.12
const CHAPTERS := [
	{"id": "world_hud_map_entry", "seconds": 2.2},
	{"id": "local_map_overview", "seconds": 2.8},
	{"id": "local_target_route_started", "seconds": 2.3},
	{"id": "world_map_overview", "seconds": 2.9},
	{"id": "world_region_selected", "seconds": 2.7},
	{"id": "cross_map_route_started", "seconds": 2.5},
	{"id": "panel_closed_hud_restored", "seconds": 2.3},
	{"id": "battle_map_entry_hidden", "seconds": 3.0},
]

var host
var _panel
var _world_hud
var _map_entry: Button
var _failed := false
var _started_msec := 0
var _actual_left_clicks := 0
var _cross_frame_presses := 0


func _init(host_node = null) -> void:
	host = host_node


static func is_flag(arg: String) -> bool:
	return arg == CAPTURE_FLAG or arg == PERF_CAPTURE_FLAG


func run() -> void:
	if PERF_CAPTURE_FLAG in OS.get_cmdline_user_args():
		await _run_perf_capture()
		return
	await _run_owner_review_capture()


func _run_owner_review_capture() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_world():
		return
	if not _assert_world_hud_restored():
		return
	print(
		"PHASE399_MAP_OWNER_REVIEW_START scene=Main.tscn "
		+ "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
		+ "profile=isolated backend=false profile_save=false http=false"
	)
	print(
		"PHASE399_MAP_OWNER_REVIEW_HUD map_entry=true "
		+ "formal_world_hud=true battle=false"
	)
	await _hold_chapter("world_hud_map_entry")
	if _failed:
		return

	await _left_click(_map_entry, "世界HUD地图入口")
	await _settle_frames(5)
	if not _assert_local_map_panel():
		return
	print(
		"PHASE399_MAP_OWNER_REVIEW_LOCAL fullscreen=true local_mode=true "
		+ "prepared_visual=true target_list=true"
	)
	await _hold_chapter("local_map_overview")
	if _failed:
		return

	var local_target = _panel.marker_buttons.get(LOCAL_TARGET_ID, null)
	if not (local_target is Button):
		_fail_capture("当前地图缺少稳定的村医自动寻路按钮")
		return
	await _left_click(local_target as Button, "当前地图村医目标")
	await _settle_frames(3)
	if not _assert_local_route_started():
		return
	_stop_player_movement_preserving_route()
	print(
		"PHASE399_MAP_OWNER_REVIEW_LOCAL_ROUTE real_click=true "
		+ "panel_closed=true pending_interaction=true target_cell=true"
	)
	await _hold_chapter("local_target_route_started")
	if _failed:
		return

	host.call("_clear_navigation_state")
	await _settle_frames(2)
	if not _assert_world_hud_restored():
		return
	await _left_click(_map_entry, "世界HUD地图入口（再次打开）")
	await _settle_frames(4)
	if not _assert_local_map_panel():
		return
	var world_tab = _panel.call("world_tab_button")
	if not (world_tab is Button):
		_fail_capture("正式地图页缺少世界地图页签")
		return
	await _left_click(world_tab as Button, "世界地图页签")
	await _settle_frames(4)
	if not _assert_world_map_panel():
		return
	print(
		"PHASE399_MAP_OWNER_REVIEW_WORLD world_mode=true atlas=true "
		+ "regions=9 prepared_visual=true"
	)
	await _hold_chapter("world_map_overview")
	if _failed:
		return

	var region_button = _panel.call("world_region_button", WORLD_REGION_ID)
	if not (region_button is Button):
		_fail_capture("世界地图缺少玄影洞窟区域按钮")
		return
	await _left_click(region_button as Button, "玄影洞窟区域")
	await _settle_frames(4)
	if not _assert_selected_world_region():
		return
	print(
		"PHASE399_MAP_OWNER_REVIEW_REGION selected=shadow_oath_cavern "
		+ "entry_route=true floor_route=true"
	)
	await _hold_chapter("world_region_selected")
	if _failed:
		return

	var route_button = _panel.call(
		"world_route_button",
		WORLD_DESTINATION_MAP_ID
	)
	if not (route_button is Button):
		_fail_capture("玄影洞窟详情缺少二层自动寻路按钮")
		return
	await _left_click(route_button as Button, "玄影洞窟二层自动寻路")
	await _settle_frames(4)
	if not _assert_cross_map_route_started():
		return
	_stop_player_movement_preserving_route()
	print(
		"PHASE399_MAP_OWNER_REVIEW_CROSS_ROUTE route_path=true "
		+ "continuation=true panel_closed=true destination=shadow_oath_cavern_f2"
	)
	await _hold_chapter("cross_map_route_started")
	if _failed:
		return

	if not _assert_world_hud_restored():
		return
	print(
		"PHASE399_MAP_OWNER_REVIEW_RESTORE panel_closed=true "
		+ "formal_world_hud=true map_entry=true action_bar=true"
	)
	await _hold_chapter("panel_closed_hud_restored")
	if _failed:
		return

	host.call("_clear_navigation_state")
	await _settle_frames(2)
	if not await _start_deterministic_local_battle():
		return
	print(
		"PHASE399_MAP_OWNER_REVIEW_BATTLE battle_active=true "
		+ "map_entry_hidden=true panel_hidden=true audio=true"
	)
	await _hold_chapter("battle_map_entry_hidden")
	if _failed:
		return

	if _visible_tree_has_forbidden_review_text():
		_fail_capture("玩家可见界面出现QA／调试／验收文字")
		return
	if not _assert_isolated_transport_idle():
		return
	await _release_capture_audio_runtime()
	if _failed:
		return
	await _settle_frames(2)
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE399_MAP_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "scene=Main.tscn entry=MainSceneFlag completed=true "
			+ "fullscreen_local=true prepared_visual=true local_route=true "
			+ "world_atlas=true regions=9 region_route=true "
			+ "route_path=true continuation=true route_closes_panel=true "
			+ "hud_restored=true battle_map_hidden=true audio=true "
			+ "backend=false profile_save=false server_writes=0 "
			+ "actual_left_clicks=%d cross_frame_presses=%d"
		) % [elapsed, _actual_left_clicks, _cross_frame_presses]
	)
	host.get_tree().call_deferred("quit", 0)


func _run_perf_capture() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_world():
		return
	if not bool(_host_property("perf_probe_enabled")):
		_fail_capture("Phase399地图性能验收必须同时启用--perf-probe")
		return
	if not _assert_world_hud_restored():
		return
	print(
		"PHASE399_MAP_PERF_START scene=Main.tscn entry=MainSceneFlag "
		+ "viewport=1280x720 renderer=Metal profile=isolated "
		+ "backend_started=false profile_save=false"
	)

	host.call("_clear_navigation_state")
	host.call("_reset_perf_probe_counters")
	print("PHASE399_MAP_PERF_STATE state=idle_begin")
	await host.get_tree().create_timer(PERF_STATE_SECONDS).timeout
	print("PHASE399_MAP_PERF_STATE state=idle_end")

	var moving_click_start := _actual_left_clicks
	var accepted_before := int(_host_property("click_move_input_accept_count"))
	var player_value = _host_property("player")
	if not (player_value is Node2D):
		_fail_capture("Phase399地图性能验收缺少真实世界角色")
		return
	var previous_position := (player_value as Node2D).global_position
	var total_moved_distance := 0.0
	var moving_started := false
	var movement_index := 0
	_set_host_property("encounter_grace_remaining", 3600.0)
	host.call("_reset_perf_probe_counters")
	print("PHASE399_MAP_PERF_STATE state=moving_begin")
	var moving_started_msec := Time.get_ticks_msec()
	while (
		float(Time.get_ticks_msec() - moving_started_msec) / 1000.0
		< PERF_STATE_SECONDS
	):
		var screen_point := _movement_screen_point(movement_index)
		movement_index += 1
		if screen_point == Vector2.INF:
			_fail_capture("找不到真实Main中可点击且可通行的移动目标")
			return
		await _left_click_world(screen_point, "移动性能目标")
		if _failed:
			return
		await host.get_tree().create_timer(0.72).timeout
		var current_position := (player_value as Node2D).global_position
		total_moved_distance += current_position.distance_to(previous_position)
		previous_position = current_position
		moving_started = moving_started or bool(
			(player_value as Node).call("is_auto_moving")
		)
	print("PHASE399_MAP_PERF_STATE state=moving_end")
	var moving_clicks := _actual_left_clicks - moving_click_start
	var moving_accepted := (
		int(_host_property("click_move_input_accept_count")) - accepted_before
	)
	if (
		moving_clicks < 3
		or moving_accepted != moving_clicks
		or total_moved_distance <= 64.0
		or not moving_started
	):
		_fail_capture(
			"真实跨帧移动未形成持续位移：clicks=%d accepted=%d distance=%.2f started=%s"
			% [moving_clicks, moving_accepted, total_moved_distance, str(moving_started)]
		)
		return

	host.call("_clear_navigation_state")
	await _settle_frames(3)
	if not _assert_world_hud_restored():
		return
	var panel_click_start := _actual_left_clicks
	var panel_accept_before := int(_host_property("click_move_input_accept_count"))
	var completed_cycles := 0
	host.call("_reset_perf_probe_counters")
	print(
		"PHASE399_MAP_PERF_STATE state=panel_stress_begin "
		+ "prepared_visual=true expected_regions=9"
	)
	for cycle_index in range(PERF_STRESS_CYCLES):
		await _left_click(_map_entry, "地图压力循环入口")
		await _perf_click_pause()
		if not _assert_local_map_panel():
			return

		var world_tab = _panel.call("world_tab_button")
		if not (world_tab is Button):
			_fail_capture("地图压力循环缺少世界地图页签")
			return
		await _left_click(world_tab as Button, "地图压力循环世界页签")
		await _perf_click_pause()
		if not _assert_world_map_panel():
			return

		var region_button = _panel.call(
			"world_region_button",
			WORLD_REGION_ID
		)
		if not (region_button is Button):
			_fail_capture("地图压力循环缺少玄影洞窟区域")
			return
		await _left_click(region_button as Button, "地图压力循环玄影区域")
		await _perf_click_pause()
		if not _assert_selected_world_region():
			return

		var local_tab = _panel.call("local_tab_button")
		if not (local_tab is Button):
			_fail_capture("地图压力循环缺少当前地图页签")
			return
		await _left_click(local_tab as Button, "地图压力循环当前地图页签")
		await _perf_click_pause()
		if not _assert_local_map_panel():
			return

		var close_value = _panel.get("close_button")
		if not (close_value is Button):
			_fail_capture("地图压力循环缺少正式关闭按钮")
			return
		await _left_click(close_value as Button, "地图压力循环正式关闭")
		await _perf_click_pause()
		if not _assert_world_hud_restored():
			return
		completed_cycles = cycle_index + 1
	print(
		(
			"PHASE399_MAP_PERF_STATE state=panel_stress_end "
			+ "cycles=%d panel_clicks=%d prepared_visual=true regions=9 "
			+ "hud_restored=true ui_world_leaks=%d"
		) % [
			completed_cycles,
			_actual_left_clicks - panel_click_start,
			int(_host_property("click_move_input_accept_count")) - panel_accept_before,
		]
	)
	var panel_clicks := _actual_left_clicks - panel_click_start
	var ui_world_leaks := (
		int(_host_property("click_move_input_accept_count")) - panel_accept_before
	)
	if (
		completed_cycles != PERF_STRESS_CYCLES
		or panel_clicks != PERF_STRESS_CYCLES * 5
		or ui_world_leaks != 0
	):
		_fail_capture(
			"地图压力循环不完整：cycles=%d clicks=%d ui_world_leaks=%d"
			% [completed_cycles, panel_clicks, ui_world_leaks]
		)
		return
	if _actual_left_clicks != _cross_frame_presses:
		_fail_capture("性能验收存在未跨帧的真实左键")
		return
	if not _assert_isolated_transport_idle():
		return
	await _release_capture_audio_runtime()
	if _failed:
		return
	await _settle_frames(2)
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE399_MAP_PERF_END status=passed elapsed_wall=%.3f "
			+ "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
			+ "idle=true moving=true panel_stress=true cycles=%d "
			+ "moving_clicks=%d moving_accepted=%d moved_distance=%.2f "
			+ "panel_clicks=%d prepared_visual=true regions=9 "
			+ "hud_restored=true ui_world_leaks=0 backend_started=false "
			+ "profile_save=false end_http_disconnected=true "
			+ "actual_left_clicks=%d cross_frame_presses=%d"
		) % [
			elapsed,
			completed_cycles,
			moving_clicks,
			moving_accepted,
			total_moved_distance,
			panel_clicks,
			_actual_left_clicks,
			_cross_frame_presses,
		]
	)
	host.get_tree().call_deferred("quit", 0)


func _prepare_real_main_world() -> bool:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host不存在")
		return false
	var current_scene := host.get_tree().current_scene as Node
	if current_scene != host or current_scene.scene_file_path != "res://scenes/Main.tscn":
		_fail_capture("Phase399验收必须由真实Main.tscn flag启动")
		return false
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if Vector2i(roundi(viewport_size.x), roundi(viewport_size.y)) != EXPECTED_VIEWPORT:
		_fail_capture("Phase399验收视口必须为1280×720")
		return false

	_set_host_property("profile_save_enabled", false)
	_set_host_property("account_authenticated", true)
	_set_host_property("auth_auto_bypass", false)
	_set_host_property("current_account_session", {
		"accountId": "phase399_map_owner_review",
		"displayName": "岚牙",
		"authSource": "isolated_owner_review",
	})
	_set_host_property("server_profile_sync_state", "off")
	_set_host_property("server_profile_sync_pending_kind", "")
	_set_host_property("server_profile_sync_dirty", false)
	_set_host_property("server_profile_sync_pull_queued", false)
	var profile := PlayerProgressModel.normalize_profile(
		PlayerProgressModel.with_starter_equipment(
			PlayerProgressModel.default_profile()
		)
	)
	var player_value = profile.get("player", {})
	var profile_player := (
		(player_value as Dictionary).duplicate(true)
		if player_value is Dictionary
		else {}
	)
	profile_player["name"] = "岚牙"
	profile_player["level"] = 18
	profile["player"] = profile_player
	_set_host_property("player_profile", profile)
	if host.has_method("_stop_server_event_stream"):
		host.call("_stop_server_event_stream")
	if host.has_method("_stop_online_position_sync"):
		host.call("_stop_online_position_sync")
	for value in host.find_children("*", "HTTPRequest", true, false):
		if value is HTTPRequest:
			(value as HTTPRequest).cancel_request()
	for method_name in [
		"_close_auth_panel",
		"_close_account_panel",
		"_close_market_panel",
		"_close_battle_result_panel",
	]:
		if host.has_method(method_name):
			host.call(method_name, false)
	var entry_panel = _host_property("character_entry_panel")
	if entry_panel is CanvasItem:
		(entry_panel as CanvasItem).visible = false
	var loaded = host.call("_load_map", WORLD_MAP_ID, WORLD_SPAWN_NAME)
	if loaded is bool and not bool(loaded):
		_fail_capture("无法载入Phase399地图验收世界")
		return false
	if host.has_method("_update_hud_text"):
		host.call("_update_hud_text", true)
	if host.has_method("_layout_hud"):
		host.call("_layout_hud")

	for _frame in range(READY_FRAME_LIMIT):
		_panel = _host_property("map_panel")
		_world_hud = _host_property("world_hud_awakened_view")
		var map_entry_value = _host_property("map_menu_button")
		var render_state = _host_property("map_visual_render_state")
		if (
			_panel != null
			and _panel.has_method("is_awakened_map_panel")
			and _world_hud is Control
			and map_entry_value is Button
			and render_state is Dictionary
			and bool((render_state as Dictionary).get("active", false))
		):
			_map_entry = map_entry_value as Button
			if host.has_method("_close_map_panel"):
				host.call("_close_map_panel")
			if host.has_method("_layout_hud"):
				host.call("_layout_hud")
			await _settle_frames(8)
			return true
		await host.get_tree().process_frame
	_fail_capture("正式地图、WorldHud或prepared visual未在限定帧内接入Main")
	return false


func _assert_world_hud_restored() -> bool:
	if bool(_host_property("battle_active")):
		_fail_capture("世界HUD恢复阶段仍处于战斗")
		return false
	if _panel == null or (_panel as CanvasItem).is_visible_in_tree():
		_fail_capture("地图页关闭后仍覆盖世界HUD")
		return false
	if _world_hud == null or not (_world_hud as CanvasItem).is_visible_in_tree():
		_fail_capture("正式WorldHud没有恢复")
		return false
	if _map_entry == null or not _map_entry.is_visible_in_tree():
		_fail_capture("世界HUD地图入口没有恢复")
		return false
	var action_bar = _host_property("action_bar")
	if not (action_bar is Control) or not (action_bar as Control).is_visible_in_tree():
		_fail_capture("地图页关闭后右下功能栏没有恢复")
		return false
	return true


func _assert_local_map_panel() -> bool:
	if _panel == null or not (_panel as CanvasItem).is_visible_in_tree():
		_fail_capture("真实左键没有打开正式地图页")
		return false
	if not bool(_panel.call("is_awakened_map_panel")):
		_fail_capture("地图页仍不是正式觉醒界面")
		return false
	if str(_panel.call("current_mode")) != "local":
		_fail_capture("地图页打开时没有复位到当前地图")
		return false
	if not bool(_panel.call("uses_prepared_visual")):
		_fail_capture("当前地图没有使用prepared visual")
		return false
	if not _panel.position.is_equal_approx(Vector2.ZERO):
		_fail_capture("正式地图页没有从视口左上角开始")
		return false
	if not _panel.size.is_equal_approx(Vector2(EXPECTED_VIEWPORT)):
		_fail_capture("正式地图页没有覆盖1280×720视口")
		return false
	if not _panel.marker_buttons.has(LOCAL_TARGET_ID):
		_fail_capture("当前地图目标列表缺少村医")
		return false
	return true


func _assert_local_route_started() -> bool:
	var pending = _host_property("pending_interaction")
	if (
		(_panel as CanvasItem).is_visible_in_tree()
		or not bool(_host_property("has_pending_interaction"))
		or not (pending is Dictionary)
		or str((pending as Dictionary).get("id", "")) != LOCAL_PENDING_INTERACTION_ID
		or not bool(_host_property("has_target_cell"))
	):
		_fail_capture("当前地图真实左键没有形成村医自动寻路")
		return false
	return true


func _assert_world_map_panel() -> bool:
	if not (_panel as CanvasItem).is_visible_in_tree():
		_fail_capture("世界地图阶段正式地图页不可见")
		return false
	if str(_panel.call("current_mode")) != "world":
		_fail_capture("世界地图真实页签没有切换")
		return false
	if not bool(_panel.call("uses_prepared_visual")):
		_fail_capture("世界地图切换后丢失prepared visual合同")
		return false
	if not bool(_panel.call("uses_world_atlas_visual")):
		_fail_capture("世界地图没有使用正式atlas视觉")
		return false
	if int(_panel.call("world_region_count")) != EXPECTED_WORLD_REGION_COUNT:
		_fail_capture("世界地图没有精确显示9个正式区域")
		return false
	return true


func _assert_selected_world_region() -> bool:
	if str(_panel.call("selected_world_region_id")) != WORLD_REGION_ID:
		_fail_capture("世界地图没有选中玄影洞窟")
		return false
	var entry_button = _panel.call("world_entry_route_button")
	var floor_button = _panel.call(
		"world_route_button",
		WORLD_DESTINATION_MAP_ID
	)
	if (
		not (entry_button is Button)
		or (entry_button as Button).disabled
		or not (floor_button is Button)
		or (floor_button as Button).disabled
	):
		_fail_capture("玄影洞窟入口或楼层路线按钮不可用")
		return false
	return true


func _assert_cross_map_route_started() -> bool:
	var pending = _host_property("pending_interaction")
	if not (pending is Dictionary):
		_fail_capture("跨图路线没有形成首段传送交互")
		return false
	var route_warp := pending as Dictionary
	var continuation_value = route_warp.get("routeContinuationTarget", {})
	var continuation := (
		continuation_value as Dictionary
		if continuation_value is Dictionary
		else {}
	)
	if (
		(_panel as CanvasItem).is_visible_in_tree()
		or not bool(_host_property("has_pending_interaction"))
		or str(route_warp.get("toMap", "")) != WORLD_REGION_ID
		or route_warp.get("routeMapPath", []) != EXPECTED_ROUTE_PATH
		or str(continuation.get("mapId", "")) != WORLD_DESTINATION_MAP_ID
		or continuation.get("routeMapPath", []) != EXPECTED_ROUTE_PATH
	):
		_fail_capture("跨图路线缺少真实route path或continuation")
		return false
	return true


func _start_deterministic_local_battle() -> bool:
	var map_data = _host_property("map_data")
	if not (map_data is Dictionary):
		_fail_capture("战斗隐藏验收缺少当前地图数据")
		return false
	var zones := EncounterModel.encounter_zones(map_data as Dictionary)
	if zones.is_empty() or not (zones[0] is Dictionary):
		_fail_capture("战斗隐藏验收缺少确定性野外区域")
		return false
	var battle_state := BattleModel.create_wild_battle(
		(zones[0] as Dictionary).duplicate(true)
	)
	host.call("_start_battle", battle_state)
	await _settle_frames(8)
	if not bool(_host_property("battle_active")):
		_fail_capture("确定性本地战斗没有启动")
		return false
	if (_panel as CanvasItem).is_visible_in_tree():
		_fail_capture("战斗开始后地图页仍可见")
		return false
	if _map_entry.is_visible_in_tree():
		_fail_capture("战斗开始后世界HUD地图入口仍可见")
		return false
	return true


func _stop_player_movement_preserving_route() -> void:
	var player_value = _host_property("player")
	if player_value is Node and (player_value as Node).has_method("clear_move_target"):
		(player_value as Node).call("clear_move_target")


func _assert_isolated_transport_idle() -> bool:
	if bool(_host_property("profile_save_enabled")):
		_fail_capture("隔离验收意外恢复档案写入")
		return false
	var session = _host_property("current_account_session")
	if not (session is Dictionary) or str((session as Dictionary).get("authSource", "")) == "server":
		_fail_capture("隔离验收意外使用服务器登录态")
		return false
	for value in host.find_children("*", "HTTPRequest", true, false):
		if (
			value is HTTPRequest
			and (value as HTTPRequest).get_http_client_status()
			!= HTTPClient.STATUS_DISCONNECTED
		):
			_fail_capture("隔离验收结束时仍存在HTTP请求")
			return false
	return true


func _release_capture_audio_runtime() -> void:
	var audio_manager = _host_property("game_audio_manager")
	if audio_manager == null or not is_instance_valid(audio_manager):
		_fail_capture("真实Main缺少音频管理器")
		return
	if not audio_manager.has_method("stop_all"):
		_fail_capture("音频管理器缺少停止全部播放API")
		return
	audio_manager.call("stop_all")
	for value in (audio_manager as Node).find_children(
		"*",
		"AudioStreamPlayer",
		true,
		false
	):
		if value is AudioStreamPlayer:
			(value as AudioStreamPlayer).stop()
			(value as AudioStreamPlayer).stream = null
	await _settle_frames(8)


func _movement_screen_point(sequence_index: int) -> Vector2:
	var map_value = _host_property("map_data")
	var player_value = _host_property("player")
	if not (map_value is Dictionary) or not (player_value is Node2D):
		return Vector2.INF
	var current_cell := IsoMapModel.world_to_grid(
		map_value as Dictionary,
		(player_value as Node2D).global_position
	)
	var offsets: Array[Vector2i] = [
		Vector2i(7, -5),
		Vector2i(-7, 5),
		Vector2i(6, 5),
		Vector2i(-6, -5),
		Vector2i(8, 0),
		Vector2i(-8, 0),
	]
	var viewport_rect: Rect2 = host.get_viewport().get_visible_rect()
	var safe_rect := Rect2(Vector2(250.0, 118.0), Vector2(780.0, 430.0))
	for offset_index in range(offsets.size()):
		var offset := offsets[(sequence_index + offset_index) % offsets.size()]
		var candidate := IsoMapModel.nearest_walkable_cell(
			map_value as Dictionary,
			current_cell + offset
		)
		if (
			not IsoMapModel.is_inside(map_value as Dictionary, candidate)
			or candidate == current_cell
		):
			continue
		var world_point := IsoMapModel.grid_to_world(
			map_value as Dictionary,
			candidate
		)
		var screen_point = host.call("_world_to_screen", world_point)
		if not (screen_point is Vector2):
			continue
		if (
			viewport_rect.has_point(screen_point as Vector2)
			and safe_rect.has_point(screen_point as Vector2)
			and not bool(host.call("_is_ui_point", screen_point as Vector2))
		):
			return screen_point as Vector2
	return Vector2.INF


func _left_click_world(viewport_point: Vector2, label: String) -> void:
	if (
		viewport_point == Vector2.INF
		or not host.get_viewport().get_visible_rect().has_point(viewport_point)
		or bool(host.call("_is_ui_point", viewport_point))
	):
		_fail_capture("%s不在真实世界可点击区域内" % label)
		return
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
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


func _perf_click_pause() -> void:
	await host.get_tree().create_timer(PERF_CLICK_PAUSE_SECONDS).timeout


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
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
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
	var needles := ["qa", "调试", "验收", "phase399", "owner review"]
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
			"PHASE399_MAP_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x movie_frame=%d"
		) % [
			chapter_id,
			int(round(seconds * REVIEW_FPS)),
			seconds,
			Engine.get_process_frames(),
		]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	var failure_marker := (
		"PHASE399_MAP_PERF_FAILED"
		if PERF_CAPTURE_FLAG in OS.get_cmdline_user_args()
		else "PHASE399_MAP_OWNER_REVIEW_FAILED"
	)
	print("%s reason=%s" % [failure_marker, message])
	push_error("Phase399 map owner review failed: %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().call_deferred("quit", 1)
