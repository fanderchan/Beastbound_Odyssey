extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const WorldCameraSafeAreaModel := preload(
	"res://scripts/world/world_camera_safe_area_model.gd"
)

const CAPTURE_FLAG := "--map-awakened-owner-review-capture"
const PERF_CAPTURE_FLAG := "--map-awakened-owner-review-perf"
const RENDER_DIAGNOSTIC_FLAG := "--map-awakened-render-diagnostic"
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
const PERF_EXPECTED_MENU_60_CHECKS := PERF_STRESS_CYCLES * 4
const PERF_MAX_PANEL_DISPATCH_USEC := 8000
const DIAGNOSTIC_WARMUP_FRAMES := 60
const DIAGNOSTIC_SAMPLE_FRAMES := 300
const DIAGNOSTIC_SIGNAL_CYCLES := 12
const DIAGNOSTIC_MAX_SIGNAL_USEC := 8000
const DIAGNOSTIC_STATE_IDS: Array[String] = [
	"world_active_static",
	"fresh_local_static",
	"world_atlas_static",
	"panel_stress",
	"post_stress_local_static",
]
const DIAGNOSTIC_SIGNAL_ACTION_IDS: Array[String] = [
	"open_local",
	"world_tab",
	"select_region",
	"local_tab",
	"close_panel",
]
const DIAGNOSTIC_OPEN_TIMING_USEC_FIELDS: Array[String] = [
	"hang_usec",
	"dialog_encounter_usec",
	"other_panels_usec",
	"show_reset_usec",
	"view_state_usec",
	"bounds_usec",
	"prepared_predicate_usec",
	"fallback_usec",
	"apply_state_copy_usec",
	"apply_header_usec",
	"apply_sidebar_usec",
	"apply_local_map_usec",
	"apply_world_regions_usec",
	"apply_world_detail_usec",
	"apply_show_mode_usec",
	"apply_marker_schedule_usec",
	"apply_residual_usec",
	"panel_apply_total_usec",
	"marker_publish_usec",
	"refresh_residual_usec",
	"refresh_total_usec",
	"layout_usec",
	"deferred_layout_schedule_usec",
	"tutorial_usec",
	"open_residual_usec",
	"open_total_usec",
	"signal_residual_usec",
	"signal_total_usec",
]
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
var _perf_foreground_start := false
var _perf_menu_60_checks := 0
var _panel_press_dispatch_samples: Array[int] = []
var _panel_handler_refresh_samples: Array[int] = []
var _diagnostic_click_latency_usec: Array[int] = []
var _diagnostic_click_latency_frames: Array[int] = []
var _diagnostic_signal_samples: Dictionary = {}
var _diagnostic_state_reports: Array[Dictionary] = []
var _diagnostic_region_setup_count := 0
var _diagnostic_open_timing_raw_count := 0


func _init(host_node = null) -> void:
	host = host_node


static func is_flag(arg: String) -> bool:
	return (
		arg == CAPTURE_FLAG
		or arg == PERF_CAPTURE_FLAG
		or arg == RENDER_DIAGNOSTIC_FLAG
	)


func run() -> void:
	if RENDER_DIAGNOSTIC_FLAG in OS.get_cmdline_user_args():
		await _run_render_diagnostic()
		return
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


func _run_render_diagnostic() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_world():
		return
	if not bool(_host_property("perf_probe_enabled")):
		_fail_capture("地图渲染诊断必须同时启用--perf-probe")
		return
	if not _assert_world_hud_restored():
		return
	if not await _diagnostic_prepare_autofill_guard():
		return
	_diagnostic_click_latency_usec.clear()
	_diagnostic_click_latency_frames.clear()
	_diagnostic_signal_samples.clear()
	_diagnostic_state_reports.clear()
	_diagnostic_region_setup_count = 0
	_diagnostic_open_timing_raw_count = 0
	for action_id in DIAGNOSTIC_SIGNAL_ACTION_IDS:
		_diagnostic_signal_samples[action_id] = []
	var global_node_start := _diagnostic_monitor_int(
		Performance.OBJECT_NODE_COUNT
	)
	var global_orphan_start := _diagnostic_monitor_int(
		Performance.OBJECT_ORPHAN_NODE_COUNT
	)
	print(
		"PHASE399_MAP_DIAGNOSTIC_START scene=Main.tscn "
		+ "entry=MainSceneFlag viewport=1280x720 renderer=Metal "
		+ "profile=fresh backend_started=false profile_save=false "
		+ "status=observing states=5 warmup_frames=60 sample_frames=300"
	)

	if not await _diagnostic_prepare_static_world_target():
		return
	if not await _diagnostic_collect_static_state("world_active_static"):
		return

	host.call("_clear_navigation_state")
	await _settle_frames(3)
	if not _assert_world_hud_restored():
		return
	await _left_click(_map_entry, "诊断当前地图入口")
	await _settle_frames(3)
	if not _assert_local_map_panel():
		return
	if not await _diagnostic_collect_static_state("fresh_local_static"):
		return

	var world_tab = _panel.call("world_tab_button")
	if not (world_tab is Button):
		_fail_capture("地图渲染诊断缺少世界地图页签")
		return
	await _left_click(world_tab as Button, "诊断世界地图页签")
	await _settle_frames(3)
	if not _assert_world_map_panel():
		return
	if not await _diagnostic_collect_static_state("world_atlas_static"):
		return

	var local_tab = _panel.call("local_tab_button")
	if not (local_tab is Button):
		_fail_capture("地图渲染诊断缺少当前地图页签")
		return
	await _left_click(local_tab as Button, "诊断返回当前地图")
	await _settle_frames(2)
	if not _assert_local_map_panel():
		return
	var local_target = _panel.marker_buttons.get(LOCAL_TARGET_ID, null)
	if not (local_target is Button):
		_fail_capture("地图渲染诊断缺少维持60fps的真实目标")
		return
	await _left_click(local_target as Button, "诊断真实静态目标")
	await _settle_frames(3)
	if not _assert_local_route_started():
		return
	_stop_player_movement_preserving_route()
	await _settle_frames(2)
	if not _diagnostic_assert_static_target():
		return
	if not await _diagnostic_run_panel_stress_state():
		return

	host.call("_clear_navigation_state")
	await _settle_frames(3)
	if not _assert_world_hud_restored():
		return
	await _left_click(_map_entry, "诊断压力后当前地图入口")
	await _settle_frames(3)
	if not _assert_local_map_panel():
		return
	if not await _diagnostic_collect_static_state(
		"post_stress_local_static"
	):
		return
	var close_value = _panel.get("close_button")
	if not (close_value is Button):
		_fail_capture("地图渲染诊断缺少最终关闭按钮")
		return
	await _left_click(close_value as Button, "诊断最终关闭地图")
	await _settle_frames(3)
	if not _assert_world_hud_restored():
		return
	if _diagnostic_state_reports.size() != DIAGNOSTIC_STATE_IDS.size():
		_fail_capture("地图渲染诊断五态没有完整闭合")
		return
	for state_index in range(DIAGNOSTIC_STATE_IDS.size()):
		if str(_diagnostic_state_reports[state_index].get("state", "")) != DIAGNOSTIC_STATE_IDS[state_index]:
			_fail_capture("地图渲染诊断五态顺序发生漂移")
			return
	if not _assert_isolated_transport_idle():
		return
	var global_node_end := _diagnostic_monitor_int(
		Performance.OBJECT_NODE_COUNT
	)
	var global_orphan_end := _diagnostic_monitor_int(
		Performance.OBJECT_ORPHAN_NODE_COUNT
	)
	await _release_capture_audio_runtime()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE399_MAP_DIAGNOSTIC_END status=observed complete=true "
			+ "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
			+ "states=%d static_states=4 stress_cycles=%d "
			+ "real_click_samples=%d signal_samples=%d open_timing_samples=%d "
			+ "node_start=%d node_end=%d orphan_start=%d orphan_end=%d "
			+ "release_decision=diagnostic_only elapsed_wall=%.3f"
		) % [
			_diagnostic_state_reports.size(),
			PERF_STRESS_CYCLES,
			_diagnostic_click_latency_usec.size(),
			_diagnostic_signal_sample_count(),
			_diagnostic_open_timing_raw_count,
			global_node_start,
			global_node_end,
			global_orphan_start,
			global_orphan_end,
			elapsed,
		]
	)
	host.get_tree().call_deferred("quit", 0)


func _diagnostic_prepare_autofill_guard() -> bool:
	var viewport_value = host.get_viewport()
	if not (viewport_value is Viewport):
		_fail_capture("地图渲染诊断缺少正式Main viewport，无法清理文本焦点")
		return false
	var viewport := viewport_value as Viewport
	if (
		_map_entry == null
		or not is_instance_valid(_map_entry)
		or not _map_entry.is_visible_in_tree()
		or _map_entry.disabled
		or _map_entry.focus_mode == Control.FOCUS_NONE
		or str(_map_entry.name) != "WorldHudEntryMap"
	):
		_fail_capture("地图渲染诊断缺少可聚焦的正式世界HUD地图入口")
		return false
	var focus_before := viewport.gui_get_focus_owner()
	var focused_text_before := _diagnostic_is_text_focus(focus_before)
	var focus_class_before := _diagnostic_focus_class(focus_before)
	var focus_path_before := _diagnostic_focus_path(focus_before)
	if focused_text_before:
		(focus_before as Control).release_focus()
	_map_entry.grab_focus()
	DisplayServer.window_move_to_foreground()
	await host.get_tree().process_frame
	await RenderingServer.frame_post_draw
	var focus_after := viewport.gui_get_focus_owner()
	var focused_text_after := _diagnostic_is_text_focus(focus_after)
	var focus_class_after := _diagnostic_focus_class(focus_after)
	var focus_target := _diagnostic_focus_path(focus_after)
	var foreground := DisplayServer.window_is_focused()
	print(
		(
			"PHASE399_MAP_DIAGNOSTIC_FOCUS_SETUP status=observed "
			+ "autofill_guard=true focused_text_before=%s "
			+ "focused_text_after=%s focus_class_before=%s "
			+ "focus_path_before=%s focus_class_after=%s "
			+ "focus_target=%s foreground=%s"
		) % [
			str(focused_text_before).to_lower(),
			str(focused_text_after).to_lower(),
			focus_class_before,
			focus_path_before,
			focus_class_after,
			focus_target,
			str(foreground).to_lower(),
		]
	)
	if focused_text_after:
		_fail_capture("地图渲染诊断START前仍残留LineEdit或TextEdit焦点")
		return false
	if focus_after != _map_entry:
		_fail_capture("地图渲染诊断START前没有聚焦正式世界HUD地图入口")
		return false
	if not foreground:
		_fail_capture("地图渲染诊断autofill guard后Godot没有前台焦点")
		return false
	return true


func _diagnostic_is_text_focus(control) -> bool:
	return control is LineEdit or control is TextEdit


func _diagnostic_focus_class(control) -> String:
	if not (control is Control) or not is_instance_valid(control):
		return "none"
	return _diagnostic_focus_token((control as Control).get_class())


func _diagnostic_focus_path(control) -> String:
	if not (control is Control) or not is_instance_valid(control):
		return "none"
	return _diagnostic_focus_token(str((control as Control).get_path()))


func _diagnostic_focus_token(value: String) -> String:
	var token := value.strip_edges()
	for whitespace in [" ", "\t", "\r", "\n"]:
		token = token.replace(whitespace, "_")
	return token if not token.is_empty() else "none"


func _diagnostic_prepare_static_world_target() -> bool:
	host.call("_clear_navigation_state")
	await _settle_frames(3)
	if not _assert_world_hud_restored():
		return false
	await _left_click(_map_entry, "诊断真实目标地图入口")
	await _settle_frames(3)
	if not _assert_local_map_panel():
		return false
	var local_target = _panel.marker_buttons.get(LOCAL_TARGET_ID, null)
	if not (local_target is Button):
		_fail_capture("地图渲染诊断缺少村医真实目标")
		return false
	await _left_click(local_target as Button, "诊断村医真实目标")
	await _settle_frames(3)
	if not _assert_local_route_started():
		return false
	_stop_player_movement_preserving_route()
	await _settle_frames(2)
	return _diagnostic_assert_static_target()


func _diagnostic_assert_static_target() -> bool:
	var player_value = _host_property("player")
	if (
		not bool(_host_property("has_target_marker"))
		or not bool(host.call("_world_needs_active_fps"))
		or not (player_value is Node)
		or bool((player_value as Node).call("is_auto_moving"))
	):
		_fail_capture("真实目标没有形成静止世界60fps条件")
		return false
	host.call("_update_runtime_frame_budget")
	return true


func _diagnostic_collect_static_state(state_id: String) -> bool:
	if not await _diagnostic_require_foreground(state_id, "start"):
		return false
	var node_start := _diagnostic_monitor_int(Performance.OBJECT_NODE_COUNT)
	var orphan_start := _diagnostic_monitor_int(
		Performance.OBJECT_ORPHAN_NODE_COUNT
	)
	for _warmup_index in range(DIAGNOSTIC_WARMUP_FRAMES):
		await host.get_tree().process_frame
		if not _diagnostic_assert_frame_budget(state_id):
			return false
	await RenderingServer.frame_post_draw
	var metrics := _diagnostic_new_frame_metrics()
	metrics["target60Checks"] = DIAGNOSTIC_WARMUP_FRAMES
	metrics["previousUsec"] = Time.get_ticks_usec()
	for _sample_index in range(DIAGNOSTIC_SAMPLE_FRAMES):
		if not await _diagnostic_record_process_frame(
			metrics,
			state_id,
			"static_sample=%d" % _sample_index
		):
			return false
	if not await _diagnostic_require_foreground(state_id, "end"):
		return false
	return _diagnostic_finish_state(
		state_id,
		metrics,
		node_start,
		orphan_start
	)


func _diagnostic_run_panel_stress_state() -> bool:
	var state_id := "panel_stress"
	if not _diagnostic_assert_static_target():
		return false
	if not await _diagnostic_require_foreground(state_id, "start"):
		return false
	var node_start := _diagnostic_monitor_int(Performance.OBJECT_NODE_COUNT)
	var orphan_start := _diagnostic_monitor_int(
		Performance.OBJECT_ORPHAN_NODE_COUNT
	)
	for _warmup_index in range(DIAGNOSTIC_WARMUP_FRAMES):
		await host.get_tree().process_frame
		if not _diagnostic_assert_frame_budget(state_id):
			return false
	await RenderingServer.frame_post_draw
	var metrics := _diagnostic_new_frame_metrics()
	metrics["target60Checks"] = DIAGNOSTIC_WARMUP_FRAMES
	metrics["previousUsec"] = Time.get_ticks_usec()
	var stress_click_start := _actual_left_clicks
	var stress_cross_frame_start := _cross_frame_presses
	var latency_start := _diagnostic_click_latency_usec.size()
	for cycle_index in range(PERF_STRESS_CYCLES):
		if not await _diagnostic_real_button_click(
			_map_entry,
			"压力入口%d" % cycle_index,
			"open_local",
			cycle_index,
			Callable(self, "_diagnostic_is_local_panel"),
			Callable(self, "_assert_local_map_panel"),
			metrics,
			state_id
		):
			return false
		var world_tab = _panel.call("world_tab_button")
		if not (world_tab is Button):
			_fail_capture("诊断压力循环缺少世界页签")
			return false
		if not await _diagnostic_real_button_click(
			world_tab as Button,
			"压力世界页签%d" % cycle_index,
			"world_tab",
			cycle_index,
			Callable(self, "_diagnostic_is_world_panel"),
			Callable(self, "_assert_world_map_panel"),
			metrics,
			state_id
		):
			return false
		if not _diagnostic_reset_region_selection():
			return false
		var region_button = _panel.call(
			"world_region_button",
			WORLD_REGION_ID
		)
		if not (region_button is Button):
			_fail_capture("诊断压力循环缺少玄影洞窟区域")
			return false
		if not await _diagnostic_real_button_click(
			region_button as Button,
			"压力玄影区域%d" % cycle_index,
			"select_region",
			cycle_index,
			Callable(self, "_diagnostic_is_selected_region"),
			Callable(self, "_assert_selected_world_region"),
			metrics,
			state_id
		):
			return false
		var local_tab = _panel.call("local_tab_button")
		if not (local_tab is Button):
			_fail_capture("诊断压力循环缺少当前地图页签")
			return false
		if not await _diagnostic_real_button_click(
			local_tab as Button,
			"压力当前页签%d" % cycle_index,
			"local_tab",
			cycle_index,
			Callable(self, "_diagnostic_is_local_panel"),
			Callable(self, "_assert_local_map_panel"),
			metrics,
			state_id
		):
			return false
		var close_value = _panel.get("close_button")
		if not (close_value is Button):
			_fail_capture("诊断压力循环缺少关闭按钮")
			return false
		if not await _diagnostic_real_button_click(
			close_value as Button,
			"压力关闭%d" % cycle_index,
			"close_panel",
			cycle_index,
			Callable(self, "_diagnostic_is_world_hud"),
			Callable(self, "_assert_world_hud_restored"),
			metrics,
			state_id
		):
			return false
	if (
		_actual_left_clicks - stress_click_start != PERF_STRESS_CYCLES * 5
		or _cross_frame_presses - stress_cross_frame_start != PERF_STRESS_CYCLES * 5
		or _diagnostic_click_latency_usec.size() - latency_start != PERF_STRESS_CYCLES * 5
		or int((metrics["intervalUsec"] as Array).size()) != DIAGNOSTIC_SAMPLE_FRAMES
	):
		_fail_capture("地图渲染诊断真实压力输入没有形成60次／300帧")
		return false
	if not await _diagnostic_run_direct_signal_cycles(state_id):
		return false
	if _diagnostic_region_setup_count != PERF_STRESS_CYCLES * 2:
		_fail_capture("区域复位setup没有精确执行24次")
		return false
	print(
		(
			"PHASE399_MAP_DIAGNOSTIC_SETUP action=reset_region "
			+ "status=observed setup_only=true samples=%d "
			+ "synchronous=true immediate_state=true"
		) % _diagnostic_region_setup_count
	)
	if not await _diagnostic_require_foreground(state_id, "end"):
		return false
	if not _diagnostic_finish_state(
		state_id,
		metrics,
		node_start,
		orphan_start
	):
		return false
	var latency_usec_p95 := int(_diagnostic_percentile(
		_diagnostic_click_latency_usec,
		0.95
	))
	var latency_usec_max := _max_usec(_diagnostic_click_latency_usec)
	var latency_frames_p95 := int(_diagnostic_percentile(
		_diagnostic_click_latency_frames,
		0.95
	))
	var latency_frames_max := _max_usec(_diagnostic_click_latency_frames)
	print(
		(
			"PHASE399_MAP_DIAGNOSTIC_INPUT status=observed samples=%d "
			+ "observed=%d cross_frame=%d latency_p95_usec=%d "
			+ "latency_max_usec=%d latency_p95_frames=%d "
			+ "latency_max_frames=%d"
		) % [
			_diagnostic_click_latency_usec.size(),
			_diagnostic_click_latency_usec.size(),
			_actual_left_clicks - stress_click_start,
			latency_usec_p95,
			latency_usec_max,
			latency_frames_p95,
			latency_frames_max,
		]
	)
	return true


func _diagnostic_run_direct_signal_cycles(state_id: String) -> bool:
	var map_flow = host.call("_panel_flow")
	if map_flow == null:
		_fail_capture("同步signal诊断缺少PanelFlowCoordinator")
		return false
	map_flow.call("disable_map_open_timing_for_qa")
	map_flow.call("reset_map_world_lightweight_layout_for_qa")
	if bool(map_flow.call("map_open_timing_active_for_qa")):
		_fail_capture("同步signal诊断无法建立default-off起点")
		return false
	for cycle_index in range(DIAGNOSTIC_SIGNAL_CYCLES):
		if not _diagnostic_emit_button(
			_map_entry,
			"open_local",
			Callable(self, "_diagnostic_is_local_panel"),
			Callable(self, "_assert_local_map_panel"),
			cycle_index
		):
			return false
		var world_tab = _panel.call("world_tab_button")
		if not (world_tab is Button):
			_fail_capture("同步signal诊断缺少世界页签")
			return false
		if not _diagnostic_emit_button(
			world_tab as Button,
			"world_tab",
			Callable(self, "_diagnostic_is_world_panel"),
			Callable(self, "_assert_world_map_panel")
		):
			return false
		if not _diagnostic_reset_region_selection():
			return false
		var region_button = _panel.call(
			"world_region_button",
			WORLD_REGION_ID
		)
		if not (region_button is Button):
			_fail_capture("同步signal诊断缺少玄影区域")
			return false
		if not _diagnostic_emit_button(
			region_button as Button,
			"select_region",
			Callable(self, "_diagnostic_is_selected_region"),
			Callable(self, "_assert_selected_world_region")
		):
			return false
		var local_tab = _panel.call("local_tab_button")
		if not (local_tab is Button):
			_fail_capture("同步signal诊断缺少当前地图页签")
			return false
		if not _diagnostic_emit_button(
			local_tab as Button,
			"local_tab",
			Callable(self, "_diagnostic_is_local_panel"),
			Callable(self, "_assert_local_map_panel")
		):
			return false
		var close_value = _panel.get("close_button")
		if not (close_value is Button):
			_fail_capture("同步signal诊断缺少关闭按钮")
			return false
		if not _diagnostic_emit_button(
			close_value as Button,
			"close_panel",
			Callable(self, "_diagnostic_is_world_hud"),
			Callable(self, "_assert_world_hud_restored_after_map_close")
		):
			return false
		await host.get_tree().process_frame
		if not _diagnostic_assert_frame_budget(state_id):
			return false
	map_flow.call("disable_map_open_timing_for_qa")
	if int(map_flow.call("map_world_full_layout_fallback_count_for_qa")) != 0:
		_fail_capture("正式prepared地图诊断错误进入完整HUD fallback")
		return false
	if _diagnostic_open_timing_raw_count != DIAGNOSTIC_SIGNAL_CYCLES:
		_fail_capture(
			"地图打开分段诊断没有精确输出12条raw：%d"
			% _diagnostic_open_timing_raw_count
		)
		return false
	for action_id in DIAGNOSTIC_SIGNAL_ACTION_IDS:
		var samples_value = _diagnostic_signal_samples.get(action_id, [])
		var samples: Array = samples_value if samples_value is Array else []
		var p95_usec := int(_diagnostic_percentile(samples, 0.95))
		var max_usec := int(_diagnostic_maximum(samples))
		if (
			samples.size() != DIAGNOSTIC_SIGNAL_CYCLES
			or p95_usec >= DIAGNOSTIC_MAX_SIGNAL_USEC
			or max_usec >= DIAGNOSTIC_MAX_SIGNAL_USEC
		):
			_fail_capture(
				"同步signal诊断超过8ms或样本不完整：%s p95=%d max=%d n=%d"
				% [action_id, p95_usec, max_usec, samples.size()]
			)
			return false
		print(
			(
				"PHASE399_MAP_DIAGNOSTIC_SIGNAL action=%s status=observed "
				+ "samples=%d synchronous=true immediate_state=true "
				+ "p95_usec=%d max_usec=%d"
			) % [action_id, samples.size(), p95_usec, max_usec]
		)
	return true


func _diagnostic_emit_button(
	button: Button,
	action_id: String,
	state_predicate: Callable,
	state_assertion: Callable,
	open_timing_cycle: int = -1
) -> bool:
	if not _diagnostic_button_ready(button, action_id):
		return false
	if bool(state_predicate.call()):
		_fail_capture("同步signal诊断动作前状态已成立：%s" % action_id)
		return false
	if not _diagnostic_assert_pressed_connections_synchronous(
		button,
		action_id
	):
		return false
	var map_flow = null
	var default_off_before_begin := false
	if open_timing_cycle >= 0:
		map_flow = host.call("_panel_flow")
		if map_flow == null:
			_fail_capture("地图打开分段诊断缺少PanelFlowCoordinator")
			return false
		default_off_before_begin = not bool(
			map_flow.call("map_open_timing_active_for_qa")
		)
		if not default_off_before_begin:
			_fail_capture("地图打开分段诊断begin前不是default-off")
			return false
		if not bool(map_flow.call(
			"begin_map_open_timing_for_qa",
			action_id,
			open_timing_cycle
		)):
			_fail_capture("地图打开分段诊断无法开始唯一token")
			return false
	var started_usec := Time.get_ticks_usec()
	button.pressed.emit()
	var duration_usec := int(Time.get_ticks_usec() - started_usec)
	if open_timing_cycle >= 0:
		var sample_value = map_flow.call("consume_map_open_timing_for_qa")
		var sample: Dictionary = (
			sample_value as Dictionary
			if sample_value is Dictionary
			else {}
		)
		sample["default_off"] = default_off_before_begin
		sample["consume_once"] = not bool(
			map_flow.call("map_open_timing_active_for_qa")
		)
		sample["signal_total_usec"] = duration_usec
		sample["signal_residual_usec"] = maxi(
			0,
			duration_usec - int(sample.get("open_total_usec", 0))
		)
		var raw_complete := _diagnostic_print_open_timing_raw(
			sample,
			action_id,
			open_timing_cycle
		)
		if not _diagnostic_validate_open_timing_sample(
			sample,
			action_id,
			open_timing_cycle,
			raw_complete
		):
			return false
	if not bool(state_predicate.call()):
		_fail_capture("pressed.emit返回前状态没有同步变化：%s" % action_id)
		return false
	if not bool(state_assertion.call()):
		return false
	var samples_value = _diagnostic_signal_samples.get(action_id, [])
	var samples: Array = samples_value if samples_value is Array else []
	samples.append(duration_usec)
	_diagnostic_signal_samples[action_id] = samples
	return true


func _diagnostic_print_open_timing_raw(
	sample: Dictionary,
	action_id: String,
	cycle_index: int
) -> bool:
	var complete := (
		str(sample.get("action", "")) == action_id
		and int(sample.get("cycle", -1)) == cycle_index
		and str(sample.get("token", "")) == "%s:%d" % [action_id, cycle_index]
		and bool(sample.get("default_off", false))
		and bool(sample.get("consume_once", false))
		and sample.has("prepared_visual")
		and sample.has("fallback_called")
		and sample.has("lightweight_layout")
		and sample.has("layout_fallback_delta")
	)
	for field_name in DIAGNOSTIC_OPEN_TIMING_USEC_FIELDS:
		if not sample.has(field_name):
			complete = false
	var status := "observed" if complete else "partial"
	var line := (
		"PHASE399_MAP_DIAGNOSTIC_OPEN_TIMING action=%s cycle=%d "
		+ "token=%s status=%s complete=%s default_off=%s "
		+ "consume_once=%s prepared_visual=%s fallback_called=%s "
		+ "fallback_counter_delta=%d lightweight_layout=%s "
		+ "layout_fallback_delta=%d"
	) % [
		action_id,
		cycle_index,
		str(sample.get("token", "missing")),
		status,
		str(complete).to_lower(),
		str(bool(sample.get("default_off", false))).to_lower(),
		str(bool(sample.get("consume_once", false))).to_lower(),
		str(bool(sample.get("prepared_visual", false))).to_lower(),
		str(bool(sample.get("fallback_called", true))).to_lower(),
		int(sample.get("fallback_counter_delta", -1)),
		str(bool(sample.get("lightweight_layout", false))).to_lower(),
		int(sample.get("layout_fallback_delta", -1)),
	]
	for field_name in DIAGNOSTIC_OPEN_TIMING_USEC_FIELDS:
		line += " %s=%d" % [field_name, int(sample.get(field_name, -1))]
	print(line)
	_diagnostic_open_timing_raw_count += 1
	return complete


func _diagnostic_validate_open_timing_sample(
	sample: Dictionary,
	action_id: String,
	cycle_index: int,
	raw_complete: bool
) -> bool:
	if (
		not raw_complete
		or str(sample.get("action", "")) != action_id
		or int(sample.get("cycle", -1)) != cycle_index
		or str(sample.get("token", "")) != "%s:%d" % [action_id, cycle_index]
	):
		_fail_capture("地图打开分段诊断raw结构不完整")
		return false
	for field_name in DIAGNOSTIC_OPEN_TIMING_USEC_FIELDS:
		if int(sample.get(field_name, -1)) < 0:
			_fail_capture("地图打开分段诊断字段为负：%s" % field_name)
			return false
	if (
		not bool(sample.get("default_off", false))
		or not bool(sample.get("consume_once", false))
		or not bool(sample.get("prepared_visual", false))
		or bool(sample.get("fallback_called", true))
		or int(sample.get("fallback_usec", -1)) != 0
		or int(sample.get("fallback_counter_delta", -1)) != 0
		or not bool(sample.get("lightweight_layout", false))
		or int(sample.get("layout_fallback_delta", -1)) != 0
	):
		_fail_capture("正式prepared地图未走轻量布局、错误触发fallback或计时token没有单次消费")
		return false
	var apply_child_usec := (
		int(sample.get("apply_state_copy_usec", 0))
		+ int(sample.get("apply_header_usec", 0))
		+ int(sample.get("apply_sidebar_usec", 0))
		+ int(sample.get("apply_local_map_usec", 0))
		+ int(sample.get("apply_world_regions_usec", 0))
		+ int(sample.get("apply_world_detail_usec", 0))
		+ int(sample.get("apply_show_mode_usec", 0))
		+ int(sample.get("apply_marker_schedule_usec", 0))
		+ int(sample.get("apply_residual_usec", 0))
	)
	var refresh_child_usec := (
		int(sample.get("view_state_usec", 0))
		+ int(sample.get("bounds_usec", 0))
		+ int(sample.get("prepared_predicate_usec", 0))
		+ int(sample.get("fallback_usec", 0))
		+ int(sample.get("panel_apply_total_usec", 0))
		+ int(sample.get("marker_publish_usec", 0))
		+ int(sample.get("refresh_residual_usec", 0))
	)
	var open_child_usec := (
		int(sample.get("hang_usec", 0))
		+ int(sample.get("dialog_encounter_usec", 0))
		+ int(sample.get("other_panels_usec", 0))
		+ int(sample.get("show_reset_usec", 0))
		+ int(sample.get("refresh_total_usec", 0))
		+ int(sample.get("layout_usec", 0))
		+ int(sample.get("deferred_layout_schedule_usec", 0))
		+ int(sample.get("tutorial_usec", 0))
		+ int(sample.get("open_residual_usec", 0))
	)
	if (
		apply_child_usec != int(sample.get("panel_apply_total_usec", 0))
		or refresh_child_usec != int(sample.get("refresh_total_usec", 0))
		or open_child_usec != int(sample.get("open_total_usec", 0))
		or (
			int(sample.get("open_total_usec", 0))
			+ int(sample.get("signal_residual_usec", 0))
			!= int(sample.get("signal_total_usec", 0))
		)
		or int(sample.get("panel_apply_total_usec", 0)) > int(sample.get("refresh_total_usec", 0))
		or int(sample.get("refresh_total_usec", 0)) > int(sample.get("open_total_usec", 0))
		or int(sample.get("open_total_usec", 0)) > int(sample.get("signal_total_usec", 0))
		or int(sample.get("signal_total_usec", 0)) >= DIAGNOSTIC_MAX_SIGNAL_USEC
	):
		_fail_capture("地图打开分段诊断三层ownership恒等式或8ms信号门无效")
		return false
	return true


func _diagnostic_real_button_click(
	button: Button,
	label: String,
	action_id: String,
	cycle_index: int,
	state_predicate: Callable,
	state_assertion: Callable,
	metrics: Dictionary,
	state_id: String
) -> bool:
	if not _diagnostic_button_ready(button, label):
		return false
	if bool(state_predicate.call()):
		_fail_capture("真实点击前目标状态已成立：%s" % label)
		return false
	var viewport_point := button.get_global_rect().get_center()
	if not host.get_viewport().get_visible_rect().has_point(viewport_point):
		_fail_capture("%s不在1280×720可点击区域内" % label)
		return false
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	if not await _diagnostic_record_process_frame(
		metrics,
		state_id,
		"stress_action=%s cycle=%d phase=motion" % [action_id, cycle_index]
	):
		return false
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	if not await _diagnostic_record_process_frame(
		metrics,
		state_id,
		"stress_action=%s cycle=%d phase=press" % [action_id, cycle_index]
	):
		return false
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	var release_usec := Time.get_ticks_usec()
	Input.parse_input_event(release)
	var observed := bool(state_predicate.call())
	var observed_usec := Time.get_ticks_usec() if observed else 0
	var observed_frame := Engine.get_process_frames() if observed else -1
	for _observation_index in range(3):
		if not await _diagnostic_record_process_frame(
			metrics,
			state_id,
			"stress_action=%s cycle=%d phase=release_observe_%d"
			% [action_id, cycle_index, _observation_index]
		):
			return false
		if not observed and bool(state_predicate.call()):
			observed = true
			observed_usec = Time.get_ticks_usec()
			observed_frame = Engine.get_process_frames()
	if not observed:
		_fail_capture("真实release后三帧内没有观察到状态变化：%s" % label)
		return false
	if not bool(state_assertion.call()):
		return false
	_actual_left_clicks += 1
	if release_frame <= press_frame:
		_fail_capture("%s的左键按下与释放没有跨帧" % label)
		return false
	_cross_frame_presses += 1
	_diagnostic_click_latency_usec.append(
		maxi(0, observed_usec - release_usec)
	)
	_diagnostic_click_latency_frames.append(
		maxi(0, observed_frame - release_frame)
	)
	return true


func _diagnostic_button_ready(button: Button, label: String) -> bool:
	if (
		button == null
		or not button.is_inside_tree()
		or not button.is_visible_in_tree()
		or button.disabled
	):
		_fail_capture("地图渲染诊断按钮不可用：%s" % label)
		return false
	return true


func _diagnostic_reset_region_selection() -> bool:
	var alternate = _panel.call("world_region_button", "firebud_village")
	if not (alternate is Button):
		_fail_capture("地图渲染诊断缺少区域状态复位按钮")
		return false
	if not _diagnostic_button_ready(alternate as Button, "reset_region_setup"):
		return false
	if not _diagnostic_assert_pressed_connections_synchronous(
		alternate as Button,
		"reset_region_setup"
	):
		return false
	(alternate as Button).pressed.emit()
	if str(_panel.call("selected_world_region_id")) != "firebud_village":
		_fail_capture("区域复位setup在emit返回前没有同步选中火芽村")
		return false
	_diagnostic_region_setup_count += 1
	return true


func _diagnostic_assert_pressed_connections_synchronous(
	button: Button,
	label: String
) -> bool:
	var connections := button.get_signal_connection_list("pressed")
	if connections.is_empty():
		_fail_capture("同步signal诊断按钮没有pressed连接：%s" % label)
		return false
	for connection_value in connections:
		if not (connection_value is Dictionary):
			_fail_capture("同步signal诊断pressed连接不是Dictionary：%s" % label)
			return false
		var flags := int((connection_value as Dictionary).get("flags", 0))
		if (flags & CONNECT_DEFERRED) != 0:
			_fail_capture("同步signal诊断拒绝DEFERRED连接：%s" % label)
			return false
	return true


func _diagnostic_is_local_panel() -> bool:
	return (
		_panel != null
		and is_instance_valid(_panel)
		and _panel is CanvasItem
		and (_panel as CanvasItem).is_visible_in_tree()
		and str(_panel.call("current_mode")) == "local"
	)


func _diagnostic_is_world_panel() -> bool:
	return (
		_panel != null
		and is_instance_valid(_panel)
		and _panel is CanvasItem
		and (_panel as CanvasItem).is_visible_in_tree()
		and str(_panel.call("current_mode")) == "world"
	)


func _diagnostic_is_selected_region() -> bool:
	return (
		_diagnostic_is_world_panel()
		and str(_panel.call("selected_world_region_id")) == WORLD_REGION_ID
	)


func _diagnostic_is_world_hud() -> bool:
	return (
		_panel != null
		and is_instance_valid(_panel)
		and _panel is CanvasItem
		and not (_panel as CanvasItem).is_visible_in_tree()
		and _world_hud is CanvasItem
		and (_world_hud as CanvasItem).is_visible_in_tree()
		and _map_entry != null
		and _map_entry.is_visible_in_tree()
	)


func _diagnostic_require_foreground(
	state_id: String,
	boundary: String
) -> bool:
	if boundary == "start":
		DisplayServer.window_move_to_foreground()
		for _focus_index in range(30):
			await host.get_tree().process_frame
			if DisplayServer.window_is_focused():
				break
	elif boundary != "end":
		_fail_capture("地图诊断出现未知焦点边界：%s" % boundary)
		return false
	if not DisplayServer.window_is_focused():
		_fail_capture("地图诊断%s态%s边界没有前台焦点" % [state_id, boundary])
		return false
	return true


func _diagnostic_assert_frame_budget(state_id: String) -> bool:
	var runtime_fps := int(_host_property("runtime_target_fps_cache"))
	if (
		not bool(host.call("_world_needs_active_fps"))
		or runtime_fps != 60
		or Engine.max_fps != 60
	):
		_fail_capture(
			"地图诊断%s态没有逐帧保持60fps合同：runtime=%d engine=%d"
			% [state_id, runtime_fps, Engine.max_fps]
		)
		return false
	return true


func _diagnostic_new_frame_metrics() -> Dictionary:
	return {
		"previousUsec": 0,
		"intervalUsec": [],
		"mainProcessUsec": [],
		"drawCalls": [],
		"renderObjects": [],
		"renderPrimitives": [],
		"target60Checks": 0,
	}


func _diagnostic_record_process_frame(
	metrics: Dictionary,
	state_id: String,
	context: String
) -> bool:
	var engine_frame_before := Engine.get_process_frames()
	await host.get_tree().process_frame
	host.call("_reset_perf_probe_frame_max_for_qa")
	await RenderingServer.frame_post_draw
	var engine_frame_after := Engine.get_process_frames()
	var engine_delta := engine_frame_after - engine_frame_before
	var now_usec := Time.get_ticks_usec()
	var previous_usec := int(metrics.get("previousUsec", 0))
	if previous_usec <= 0 or now_usec <= previous_usec:
		_fail_capture("地图诊断%s态帧间隔时钟无效" % state_id)
		return false
	if not _diagnostic_assert_frame_budget(state_id):
		return false
	var snapshot_value = host.call("_perf_probe_frame_snapshot_for_qa")
	if not (snapshot_value is Dictionary):
		_fail_capture("地图诊断%s态缺少Main逐帧性能快照" % state_id)
		return false
	var snapshot := snapshot_value as Dictionary
	var max_by_label_value = snapshot.get("maxUsecByLabel", {})
	var samples_by_label_value = snapshot.get("sampleCountByLabel", {})
	var max_by_label: Dictionary = (
		max_by_label_value as Dictionary
		if max_by_label_value is Dictionary
		else {}
	)
	var samples_by_label: Dictionary = (
		samples_by_label_value as Dictionary
		if samples_by_label_value is Dictionary
		else {}
	)
	var actual_count := int(samples_by_label.get("process_total", 0))
	var interval_index := int((metrics["intervalUsec"] as Array).size())
	if actual_count != 1:
		_fail_capture(
			(
				"地图诊断%s态Main样本不唯一：actual_count=%d "
				+ "interval_index=%d engine_delta=%d engine_before=%d "
				+ "engine_after=%d context=%s"
			) % [
				state_id,
				actual_count,
				interval_index,
				engine_delta,
				engine_frame_before,
				engine_frame_after,
				context,
			]
		)
		return false
	if engine_delta < 0 or engine_delta > 1:
		_fail_capture(
			(
				"地图诊断%s态Engine相位跨越无效：actual_count=%d "
				+ "interval_index=%d engine_delta=%d engine_before=%d "
				+ "engine_after=%d context=%s"
			) % [
				state_id,
				actual_count,
				interval_index,
				engine_delta,
				engine_frame_before,
				engine_frame_after,
				context,
			]
		)
		return false
	(metrics["intervalUsec"] as Array).append(now_usec - previous_usec)
	(metrics["mainProcessUsec"] as Array).append(
		int(max_by_label.get("process_total", 0))
	)
	(metrics["drawCalls"] as Array).append(_diagnostic_monitor_int(
		Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME
	))
	(metrics["renderObjects"] as Array).append(_diagnostic_monitor_int(
		Performance.RENDER_TOTAL_OBJECTS_IN_FRAME
	))
	(metrics["renderPrimitives"] as Array).append(_diagnostic_monitor_int(
		Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME
	))
	metrics["previousUsec"] = now_usec
	metrics["target60Checks"] = int(metrics.get("target60Checks", 0)) + 1
	return true


func _diagnostic_finish_state(
	state_id: String,
	metrics: Dictionary,
	node_start: int,
	orphan_start: int
) -> bool:
	var intervals: Array = metrics.get("intervalUsec", [])
	var main_process: Array = metrics.get("mainProcessUsec", [])
	var draw_calls: Array = metrics.get("drawCalls", [])
	var render_objects: Array = metrics.get("renderObjects", [])
	var render_primitives: Array = metrics.get("renderPrimitives", [])
	if (
		intervals.size() != DIAGNOSTIC_SAMPLE_FRAMES
		or main_process.size() != DIAGNOSTIC_SAMPLE_FRAMES
		or draw_calls.size() != DIAGNOSTIC_SAMPLE_FRAMES
		or render_objects.size() != DIAGNOSTIC_SAMPLE_FRAMES
		or render_primitives.size() != DIAGNOSTIC_SAMPLE_FRAMES
		or int(metrics.get("target60Checks", 0))
		!= DIAGNOSTIC_WARMUP_FRAMES + DIAGNOSTIC_SAMPLE_FRAMES
	):
		_fail_capture("地图诊断%s态没有精确记录300帧" % state_id)
		return false
	var map_viewport = _panel.find_child(
		"MapAwakenedViewport",
		true,
		false
	)
	if not (map_viewport is SubViewport):
		_fail_capture("地图诊断%s态缺少MapAwakenedViewport" % state_id)
		return false
	var subviewport := map_viewport as SubViewport
	var interval_median := _diagnostic_median(intervals)
	var interval_p95 := _diagnostic_percentile(intervals, 0.95)
	var interval_max := _diagnostic_maximum(intervals)
	var effective_fps := (
		1000000.0 / interval_median
		if interval_median > 0.0
		else 0.0
	)
	var node_end := _diagnostic_monitor_int(Performance.OBJECT_NODE_COUNT)
	var orphan_end := _diagnostic_monitor_int(
		Performance.OBJECT_ORPHAN_NODE_COUNT
	)
	var report := {
		"state": state_id,
		"intervalMedianUsec": interval_median,
		"intervalP95Usec": interval_p95,
		"intervalMaxUsec": interval_max,
		"effectiveFps": effective_fps,
		"mainProcessP95Usec": _diagnostic_percentile(main_process, 0.95),
		"mainProcessMaxUsec": _diagnostic_maximum(main_process),
		"nodeStart": node_start,
		"nodeEnd": node_end,
		"orphanStart": orphan_start,
		"orphanEnd": orphan_end,
	}
	_diagnostic_state_reports.append(report)
	print(
		(
			"PHASE399_MAP_DIAGNOSTIC_STATE state=%s status=observed "
			+ "foreground_start=true foreground_end=true warmup_frames=%d "
			+ "interval_samples=%d target60_checks=%d "
			+ "interval_median_usec=%.1f interval_p95_usec=%.1f "
			+ "interval_max_usec=%.1f effective_fps=%.3f "
			+ "main_process_samples=%d main_process_p95_usec=%.1f "
			+ "main_process_max_usec=%.1f draw_calls_median=%.1f "
			+ "draw_calls_p95=%.1f render_objects_median=%.1f "
			+ "render_objects_p95=%.1f render_primitives_median=%.1f "
			+ "render_primitives_p95=%.1f node_start=%d node_end=%d "
			+ "orphan_start=%d orphan_end=%d subviewport_present=true "
			+ "subviewport_size=%dx%d subviewport_update_mode=%d"
		) % [
			state_id,
			DIAGNOSTIC_WARMUP_FRAMES,
			intervals.size(),
			int(metrics.get("target60Checks", 0)),
			interval_median,
			interval_p95,
			interval_max,
			effective_fps,
			main_process.size(),
			_diagnostic_percentile(main_process, 0.95),
			_diagnostic_maximum(main_process),
			_diagnostic_median(draw_calls),
			_diagnostic_percentile(draw_calls, 0.95),
			_diagnostic_median(render_objects),
			_diagnostic_percentile(render_objects, 0.95),
			_diagnostic_median(render_primitives),
			_diagnostic_percentile(render_primitives, 0.95),
			node_start,
			node_end,
			orphan_start,
			orphan_end,
			subviewport.size.x,
			subviewport.size.y,
			int(subviewport.render_target_update_mode),
		]
	)
	return true


func _diagnostic_monitor_int(monitor: int) -> int:
	return int(round(Performance.get_monitor(monitor)))


func _diagnostic_median(samples: Array) -> float:
	if samples.is_empty():
		return 0.0
	var ordered: Array = samples.duplicate()
	ordered.sort()
	var middle := ordered.size() / 2
	if ordered.size() % 2 == 0:
		return (float(ordered[middle - 1]) + float(ordered[middle])) / 2.0
	return float(ordered[middle])


func _diagnostic_percentile(samples: Array, ratio: float) -> float:
	if samples.is_empty():
		return 0.0
	var ordered: Array = samples.duplicate()
	ordered.sort()
	var index := clampi(
		ceili(float(ordered.size()) * ratio) - 1,
		0,
		ordered.size() - 1
	)
	return float(ordered[index])


func _diagnostic_maximum(samples: Array) -> float:
	var maximum := 0.0
	for sample in samples:
		maximum = maxf(maximum, float(sample))
	return maximum


func _diagnostic_signal_sample_count() -> int:
	var total := 0
	for action_id in DIAGNOSTIC_SIGNAL_ACTION_IDS:
		var samples_value = _diagnostic_signal_samples.get(action_id, [])
		if samples_value is Array:
			total += (samples_value as Array).size()
	return total


func _run_perf_capture() -> void:
	_started_msec = Time.get_ticks_msec()
	if host == null or not is_instance_valid(host):
		_fail_capture("Phase399地图性能验收缺少真实Main host")
		return
	DisplayServer.window_move_to_foreground()
	for _focus_frame in range(30):
		await host.get_tree().process_frame
		if DisplayServer.window_is_focused():
			break
	_perf_foreground_start = DisplayServer.window_is_focused()
	if not _perf_foreground_start:
		_fail_capture("Phase399地图性能窗口没有进入玩家前台焦点态")
		return
	if not await _prepare_real_main_world():
		return
	if not bool(_host_property("perf_probe_enabled")):
		_fail_capture("Phase399地图性能验收必须同时启用--perf-probe")
		return
	if not _assert_world_hud_restored():
		return
	# Preparation spans multiple frames, so bind the START marker to a fresh
	# focus observation rather than the earlier foreground request.
	_perf_foreground_start = DisplayServer.window_is_focused()
	if not _perf_foreground_start:
		_fail_capture("Phase399地图性能起点前失去玩家前台焦点")
		return
	print(
		"PHASE399_MAP_PERF_START scene=Main.tscn entry=MainSceneFlag "
		+ "viewport=1280x720 renderer=Metal profile=isolated "
		+ "backend_started=false profile_save=false foreground_start=true"
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
	_perf_menu_60_checks = 0
	_panel_press_dispatch_samples.clear()
	_panel_handler_refresh_samples.clear()
	var map_flow = host.call("_panel_flow")
	if map_flow == null:
		_fail_capture("地图压力循环缺少PanelFlowCoordinator")
		return
	map_flow.call("reset_map_world_lightweight_layout_for_qa")
	host.call("_reset_perf_probe_counters")
	print(
		"PHASE399_MAP_PERF_STATE state=panel_stress_begin "
		+ "prepared_visual=true expected_regions=9"
	)
	for cycle_index in range(PERF_STRESS_CYCLES):
		await _left_click(_map_entry, "地图压力循环入口", true)
		await _perf_click_pause()
		if not _assert_local_map_panel():
			return
		if not _assert_panel_60fps("地图压力循环打开当前地图"):
			return

		var world_tab = _panel.call("world_tab_button")
		if not (world_tab is Button):
			_fail_capture("地图压力循环缺少世界地图页签")
			return
		await _left_click(world_tab as Button, "地图压力循环世界页签", true)
		await _perf_click_pause()
		if not _assert_world_map_panel():
			return
		if not _assert_panel_60fps("地图压力循环世界页签"):
			return

		var region_button = _panel.call(
			"world_region_button",
			WORLD_REGION_ID
		)
		if not (region_button is Button):
			_fail_capture("地图压力循环缺少玄影洞窟区域")
			return
		await _left_click(region_button as Button, "地图压力循环玄影区域", true)
		await _perf_click_pause()
		if not _assert_selected_world_region():
			return
		if not _assert_panel_60fps("地图压力循环玄影区域"):
			return

		var local_tab = _panel.call("local_tab_button")
		if not (local_tab is Button):
			_fail_capture("地图压力循环缺少当前地图页签")
			return
		await _left_click(local_tab as Button, "地图压力循环当前地图页签", true)
		await _perf_click_pause()
		if not _assert_local_map_panel():
			return
		if not _assert_panel_60fps("地图压力循环当前地图页签"):
			return

		var close_value = _panel.get("close_button")
		if not (close_value is Button):
			_fail_capture("地图压力循环缺少正式关闭按钮")
			return
		await _left_click(close_value as Button, "地图压力循环正式关闭", true)
		await _perf_click_pause()
		if not _assert_world_hud_restored_after_map_close():
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
	var press_dispatch_p95_usec := _percentile_usec(
		_panel_press_dispatch_samples,
		0.95
	)
	var press_dispatch_max_usec := _max_usec(_panel_press_dispatch_samples)
	var handler_refresh_p95_usec := _percentile_usec(
		_panel_handler_refresh_samples,
		0.95
	)
	var handler_refresh_max_usec := _max_usec(_panel_handler_refresh_samples)
	print(
		(
			"PHASE399_MAP_PERF_HANDLER panel_clicks=%d "
			+ "press_dispatch_samples=%d press_dispatch_p95_usec=%d "
			+ "press_dispatch_max_usec=%d handler_refresh_samples=%d "
			+ "handler_refresh_p95_usec=%d handler_refresh_max_usec=%d"
		) % [
			panel_clicks,
			_panel_press_dispatch_samples.size(),
			press_dispatch_p95_usec,
			press_dispatch_max_usec,
			_panel_handler_refresh_samples.size(),
			handler_refresh_p95_usec,
			handler_refresh_max_usec,
		]
	)
	if (
		completed_cycles != PERF_STRESS_CYCLES
		or panel_clicks != PERF_STRESS_CYCLES * 5
		or ui_world_leaks != 0
		or _perf_menu_60_checks != PERF_EXPECTED_MENU_60_CHECKS
		or _panel_press_dispatch_samples.size() != panel_clicks
		or _panel_handler_refresh_samples.size() != panel_clicks
	):
		_fail_capture(
			(
				"地图压力循环不完整：cycles=%d clicks=%d ui_world_leaks=%d "
				+ "menu60=%d press_samples=%d handler_samples=%d"
			) % [
				completed_cycles,
				panel_clicks,
				ui_world_leaks,
				_perf_menu_60_checks,
				_panel_press_dispatch_samples.size(),
				_panel_handler_refresh_samples.size(),
			]
		)
		return
	if int(map_flow.call("map_world_full_layout_fallback_count_for_qa")) != 0:
		_fail_capture("正式prepared地图压力循环错误进入完整HUD fallback")
		return
	if (
		press_dispatch_p95_usec >= PERF_MAX_PANEL_DISPATCH_USEC
		or press_dispatch_max_usec >= PERF_MAX_PANEL_DISPATCH_USEC
		or handler_refresh_p95_usec >= PERF_MAX_PANEL_DISPATCH_USEC
		or handler_refresh_max_usec >= PERF_MAX_PANEL_DISPATCH_USEC
	):
		_fail_capture(
			(
				"地图压力真实输入同步处理超过8ms：press_p95=%d press_max=%d "
				+ "handler_p95=%d handler_max=%d"
			) % [
				press_dispatch_p95_usec,
				press_dispatch_max_usec,
				handler_refresh_p95_usec,
				handler_refresh_max_usec,
			]
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
	var foreground_end := DisplayServer.window_is_focused()
	if not foreground_end:
		_fail_capture("Phase399地图性能交互结束前失去玩家前台焦点")
		return
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
			+ "foreground_start=true foreground_end=true menu_fps60=true "
			+ "menu_fps60_checks=%d actual_left_clicks=%d "
			+ "cross_frame_presses=%d press_dispatch_p95_usec=%d "
			+ "press_dispatch_max_usec=%d handler_refresh_p95_usec=%d "
			+ "handler_refresh_max_usec=%d"
		) % [
			elapsed,
			completed_cycles,
			moving_clicks,
			moving_accepted,
			total_moved_distance,
			panel_clicks,
			_perf_menu_60_checks,
			_actual_left_clicks,
			_cross_frame_presses,
			press_dispatch_p95_usec,
			press_dispatch_max_usec,
			handler_refresh_p95_usec,
			handler_refresh_max_usec,
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


func _assert_world_hud_restored_after_map_close() -> bool:
	if not _assert_world_hud_restored():
		return false
	var map_flow = host.call("_panel_flow")
	if (
		map_flow == null
		or not bool(map_flow.call(
			"map_world_lightweight_close_same_call_for_qa"
		))
		or bool(map_flow.call("map_world_lightweight_active_for_qa"))
		or int(map_flow.call(
			"map_world_full_layout_fallback_count_for_qa"
		)) != 0
	):
		_fail_capture("正式地图关闭没有在同调用恢复轻量世界HUD")
		return false
	var viewport_size: Vector2 = host.call("_layout_size")
	var top_panel = _host_property("top_panel")
	var side_panel = _host_property("side_panel")
	var action_bar = _host_property("action_bar")
	var message_panel = _host_property("battle_message_panel")
	var message_expand_button = _host_property("battle_message_expand_button")
	var message_clear_button = _host_property("battle_message_clear_button")
	var awakened = _host_property("world_hud_awakened_view")
	var message_surface: Control = (
		(awakened as Control).find_child(
			"WorldHudMessageSurface", true, false
		) as Control
		if awakened is Control
		else null
	)
	var chat_surface: Control = (
		(awakened as Control).find_child(
			"WorldHudChatSurface", true, false
		) as Control
		if awakened is Control
		else null
	)
	var message_actions: HBoxContainer = (
		(awakened as Control).find_child(
			"WorldHudMessageActions", true, false
		) as HBoxContainer
		if awakened is Control
		else null
	)
	var formal_battle_log: RichTextLabel = (
		(awakened as Control).find_child("BattleLog", true, false)
			as RichTextLabel
		if awakened is Control
		else null
	)
	var expect_side: bool = not bool(host.call("_is_phone_shape", viewport_size))
	if (
		not (top_panel is Control)
		or not (top_panel as Control).is_visible_in_tree()
		or not (side_panel is Control)
		or (side_panel as Control).is_visible_in_tree() != expect_side
		or not (action_bar is Control)
		or not (action_bar as Control).is_visible_in_tree()
	):
		_fail_capture("地图轻量关闭没有恢复正式顶部／侧栏／右下功能栏")
		return false
	var world_log_nonempty := (
		str(_host_property("world_log_message")) != ""
		or not (_host_property("world_log_history") as Array).is_empty()
	)
	if (
		not world_log_nonempty
		or not (message_panel is Control)
		or not (message_panel as Control).is_visible_in_tree()
		or (message_panel as Control).mouse_filter == Control.MOUSE_FILTER_IGNORE
		or (message_panel as Control).get_global_rect().size.x <= 1.0
		or (message_panel as Control).get_global_rect().size.y <= 1.0
		or not (message_expand_button is Button)
		or not (message_expand_button as Button).is_visible_in_tree()
		or (message_expand_button as Button).disabled
		or (message_expand_button as Button).mouse_filter == Control.MOUSE_FILTER_IGNORE
		or not (message_clear_button is Button)
		or not (message_clear_button as Button).is_visible_in_tree()
		or (message_clear_button as Button).disabled
		or (message_clear_button as Button).mouse_filter == Control.MOUSE_FILTER_IGNORE
		or message_surface == null
		or message_surface.get_parent() != message_panel
		or chat_surface == null
		or chat_surface.get_parent() != message_surface
		or message_actions == null
		or message_actions.get_parent() != chat_surface
		or formal_battle_log == null
		or formal_battle_log.get_parent() != chat_surface
		or not formal_battle_log.is_visible_in_tree()
		or (message_expand_button as Button).get_parent() != message_actions
		or (message_clear_button as Button).get_parent() != message_actions
	):
		_fail_capture("地图轻量关闭没有恢复正式世界消息与操作按钮")
		return false
	var blocker_rects: Array[Rect2] = []
	var blocker_values = _host_property("world_camera_hud_blocker_rects")
	if blocker_values is Array:
		for blocker_value in blocker_values:
			if typeof(blocker_value) == TYPE_RECT2:
				blocker_rects.append(blocker_value as Rect2)
	var expected_blockers: Array[Control] = [
		top_panel as Control,
		side_panel as Control,
		message_panel as Control,
		action_bar as Control,
	]
	var blockers_match := blocker_rects.size() == expected_blockers.size()
	for blocker in expected_blockers:
		blockers_match = (
			blockers_match
			and blocker != null
			and blocker.is_visible_in_tree()
			and blocker.mouse_filter != Control.MOUSE_FILTER_IGNORE
			and _rect_list_contains(blocker_rects, blocker.get_global_rect())
		)
	var expected_safe_rect := WorldCameraSafeAreaModel.safe_viewport_rect(
		viewport_size,
		blocker_rects
	)
	var actual_safe_rect: Rect2 = _host_property(
		"world_camera_safe_viewport_rect"
	) as Rect2
	var expected_safe_anchor := WorldCameraSafeAreaModel.player_anchor(
		viewport_size,
		expected_safe_rect
	)
	var actual_safe_anchor: Vector2 = _host_property(
		"world_camera_safe_anchor_screen"
	) as Vector2
	if (
		not blockers_match
		or not _rect_nearly_equal(actual_safe_rect, expected_safe_rect)
		or _rect_nearly_equal(
			actual_safe_rect,
			Rect2(Vector2.ZERO, viewport_size)
		)
		or actual_safe_anchor.distance_to(expected_safe_anchor) > 0.5
	):
		_fail_capture("地图轻量关闭没有恢复Phase400精确blocker／safe rect／anchor")
		return false
	var player_value = _host_property("player")
	var camera_value = _host_property("game_camera")
	var expected_camera_position := Vector2.ZERO
	if player_value is Node2D:
		expected_camera_position = host.call(
			"_clamped_camera_center",
			(player_value as Node2D).global_position
		) as Vector2
	if (
		not (player_value is Node2D)
		or not _rect_nearly_equal(
			(player_value as Node).get("movement_bounds") as Rect2,
			host.call("_player_movement_bounds") as Rect2
		)
		or not (host.call("_player_movement_bounds") as Rect2).grow(0.5).has_point(
			(player_value as Node2D).global_position
		)
		or not (camera_value is Camera2D)
		or (camera_value as Camera2D).limit_left != -10000000
		or (camera_value as Camera2D).limit_top != -10000000
		or (camera_value as Camera2D).limit_right != 10000000
		or (camera_value as Camera2D).limit_bottom != 10000000
		or not bool(host.call(
			"_camera_center_is_inside_limits",
			(camera_value as Camera2D).global_position
		))
		or (camera_value as Camera2D).global_position.distance_to(
			expected_camera_position
		) > 0.1
	):
		_fail_capture("地图轻量关闭没有恢复Phase400移动边界与computed／clamped相机")
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
	var map_flow = host.call("_panel_flow")
	if (
		map_flow == null
		or not bool(map_flow.call(
			"map_world_lightweight_open_same_call_for_qa"
		))
		or not bool(map_flow.call("map_world_lightweight_active_for_qa"))
		or int(map_flow.call(
			"map_world_full_layout_fallback_count_for_qa"
		)) != 0
	):
		_fail_capture("正式prepared地图没有走同调用轻量world overlay布局")
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


func _rect_nearly_equal(left: Rect2, right: Rect2) -> bool:
	return (
		left.position.distance_to(right.position) <= 0.5
		and left.size.distance_to(right.size) <= 0.5
	)


func _rect_list_contains(rects: Array[Rect2], expected: Rect2) -> bool:
	for rect in rects:
		if _rect_nearly_equal(rect, expected):
			return true
	return false


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


func _assert_panel_60fps(label: String) -> bool:
	var panel_visible := (
		_panel != null
		and is_instance_valid(_panel)
		and _panel is CanvasItem
		and (_panel as CanvasItem).is_visible_in_tree()
	)
	var world_menu_open := bool(host.call("_world_menu_is_open"))
	var runtime_fps := int(_host_property("runtime_target_fps_cache"))
	if (
		not panel_visible
		or not world_menu_open
		or runtime_fps != 60
		or Engine.max_fps != 60
	):
		_fail_capture(
			"%s没有保持正式菜单60fps预算：runtime=%d engine=%d"
			% [label, runtime_fps, Engine.max_fps]
		)
		return false
	_perf_menu_60_checks += 1
	return true


func _percentile_usec(samples: Array[int], ratio: float) -> int:
	if samples.is_empty():
		return 0
	var ordered: Array[int] = samples.duplicate()
	ordered.sort()
	var index := clampi(
		ceili(float(ordered.size()) * ratio) - 1,
		0,
		ordered.size() - 1
	)
	return ordered[index]


func _max_usec(samples: Array[int]) -> int:
	var maximum := 0
	for sample in samples:
		maximum = maxi(maximum, sample)
	return maximum


func _left_click(
	control: Control,
	label: String,
	record_panel_dispatch: bool = false
) -> void:
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
	var press_started_usec := Time.get_ticks_usec()
	Input.parse_input_event(press)
	var press_dispatch_usec := int(Time.get_ticks_usec() - press_started_usec)
	if record_panel_dispatch:
		_panel_press_dispatch_samples.append(press_dispatch_usec)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	var handler_started_usec := Time.get_ticks_usec()
	Input.parse_input_event(release)
	# BaseButton emits `pressed` synchronously during release dispatch, so this
	# sample includes the real panel handler and its immediate refresh work.
	var handler_refresh_usec := int(Time.get_ticks_usec() - handler_started_usec)
	if record_panel_dispatch:
		_panel_handler_refresh_samples.append(handler_refresh_usec)
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
	var user_args := OS.get_cmdline_user_args()
	var failure_marker := "PHASE399_MAP_OWNER_REVIEW_FAILED"
	if RENDER_DIAGNOSTIC_FLAG in user_args:
		failure_marker = "PHASE399_MAP_DIAGNOSTIC_FAILED"
	elif PERF_CAPTURE_FLAG in user_args:
		failure_marker = "PHASE399_MAP_PERF_FAILED"
	print("%s reason=%s" % [failure_marker, message])
	push_error("Phase399 map owner review failed: %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().call_deferred("quit", 1)
