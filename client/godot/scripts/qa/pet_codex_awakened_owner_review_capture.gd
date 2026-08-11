extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetCodexAwakenedPanel := preload(
	"res://scripts/ui/pet_codex_awakened_panel.gd"
)
const PetCodexAcquisitionRouteCatalog := preload(
	"res://scripts/ui/pet_codex_acquisition_route_catalog.gd"
)
const WorldCameraSafeAreaModel := preload(
	"res://scripts/world/world_camera_safe_area_model.gd"
)

const CAPTURE_FLAG := "--pet-codex-awakened-owner-review-capture"
const NATIVE_PERF_FLAG := "--pet-codex-awakened-owner-review-native-perf"
const REVIEW_FPS := 30
const VIEWPORT_SIZE := Vector2i(1280, 720)
const FOREGROUND_TIMEOUT_MSEC := 3000
const FOREGROUND_RETRY_MSEC := 250
const ACCOUNT_ID := "phase398_pet_codex_owner_review"
const WORLD_MAP_ID := "firebud_village_gate"
const WORLD_SPAWN_NAME := "from_training_yard"
const SELECTED_LINE_ID := "wuli"
const SELECTED_FORM_ID := "wuli_normal_fast_wind10"
const CHAPTERS := [
	{"id": "world_formal_hud", "seconds": 1.6},
	{"id": "codex_open", "seconds": 1.8},
	{"id": "family_and_form", "seconds": 2.0},
	{"id": "attributes_tab", "seconds": 1.5},
	{"id": "growth_tab", "seconds": 1.5},
	{"id": "acquisition_embedded", "seconds": 2.2},
	{"id": "top_close_collapses_embedded", "seconds": 1.4},
	{"id": "embedded_close", "seconds": 1.5},
	{"id": "return_world_hud", "seconds": 2.0},
]

var _host
var _tree: SceneTree
var _panel_flow
var _panel: PetCodexAwakenedPanel
var _failed := false
var _started_msec := 0
var _actual_left_clicks := 0
var _press_frames := 0
var _main_process_max_ms := 0.0
var _monitor_diagnostic_ms := 0.0
var _open_monitor_diagnostic_ms := 0.0
var _performance_context := "startup"
var _recurring_perf_started := false
var _interactive_process_active := false
var _native_perf_mode := false
var _coverage := {
	"world_hud_before": false,
	"real_codex_entry": false,
	"family_form": false,
	"attributes_growth": false,
	"acquisition_open": false,
	"modal_blocks_underlay": false,
	"top_close_collapses": false,
	"embedded_close": false,
	"world_hud_restored": false,
	"world_hud_clickable": false,
	"message_panel_restored": false,
	"safe_area_restored": false,
	"movement_bounds_restored": false,
	"camera_state_restored": false,
	"menu_fps60": false,
	"idle_fps30": false,
	"battle_fps60": false,
	"foreground_contract": false,
	"pending_portrait_blocked": false,
	"no_player_qa_text": false,
	"hot_selection": false,
	"route_cache_stable": false,
}
var _route_source_loads_before := 0
var _route_source_loads_after := 0
var _selection_max_usec := 0
var _main_process_sample_count := 0
var _input_dispatch_max_usec := 0
var _detail_tab_max_usec := 0


func _init(host_node = null) -> void:
	_host = host_node
	if _host != null and is_instance_valid(_host):
		_tree = _host.get_tree()
	if _tree == null:
		var main_loop := Engine.get_main_loop()
		if main_loop is SceneTree:
			_tree = main_loop as SceneTree


static func is_flag(argument: String) -> bool:
	return argument == CAPTURE_FLAG or argument == NATIVE_PERF_FLAG


func run() -> void:
	var user_args := OS.get_cmdline_user_args()
	var capture_count := user_args.count(CAPTURE_FLAG)
	var native_perf_count := user_args.count(NATIVE_PERF_FLAG)
	if capture_count != 1 or native_perf_count > 1:
		await _fail(
			"图鉴验收参数必须包含唯一 capture flag，native perf flag 最多一个"
		)
		return
	_native_perf_mode = native_perf_count == 1
	await _run()


func _run() -> void:
	_started_msec = Time.get_ticks_msec()
	if _host == null or not is_instance_valid(_host) or _host.get_tree() == null:
		await _fail("正式 Main 宿主不存在")
		return
	var tree: SceneTree = _host.get_tree()
	var root_window: Window = tree.root
	if (
		tree.current_scene != _host
		or str(_host.scene_file_path) != "res://scenes/Main.tscn"
		or root_window.size != VIEWPORT_SIZE
		or root_window.content_scale_size != VIEWPORT_SIZE
	):
		await _fail("图鉴验收没有运行在正式 1280×720 Main.tscn 宿主")
		return
	if bool(_host.perf_probe_enabled) != _native_perf_mode:
		await _fail("native perf flag 与 Main --perf-probe 状态不一致")
		return
	# Main has already completed `_ready()`, including the fail-closed QA lane
	# attestation.  Wait for a fresh player-visible frame before asking macOS for
	# key focus; focus itself remains a hard start/end gate below.
	await tree.process_frame
	await RenderingServer.frame_post_draw
	if _native_perf_mode:
		_coverage["foreground_contract"] = await _wait_for_native_foreground_focus()
		if not bool(_coverage["foreground_contract"]):
			await _fail("native 性能窗口没有进入玩家前台焦点态")
			return
	else:
		_coverage["foreground_contract"] = true
	if not await _wait_for_real_world():
		await _fail("真实 Main.tscn 世界 HUD 没有在限定帧内就绪")
		return
	if not await _configure_isolated_world():
		return

	print((
		"PET_CODEX_AWAKENED_OWNER_REVIEW_START scene=Main.tscn "
		+ "entry=MainSceneFlag viewport=1280x720 fps=%s speed=1.00x "
		+ "profile=isolated backend=false profile_save=false "
		+ "owner_review_status=pending perf_mode=%s"
	) % [
			"native60" if _native_perf_mode else "30",
			"native" if _native_perf_mode else "movie30",
		])
	_coverage["world_hud_before"] = _formal_world_hud_complete()
	if not bool(_coverage["world_hud_before"]):
		await _fail("打开图鉴前正式世界 HUD 或右下固定栏不完整")
		return
	await _hold_chapter("world_formal_hud")
	if _failed:
		return

	# Exclude the intentionally 30fps idle-world scheduler from the opening
	# interaction diagnostic. The focused presenter/panel check owns cold build
	# timing; native perf below owns warmed recurring interaction.
	_monitor_diagnostic_ms = 0.0
	await _left_click(_formal_codex_entry_button(), "正式右下图鉴入口")
	if _failed:
		return
	await _settle_frames(3)
	_panel = _host.codex_panel as PetCodexAwakenedPanel
	_coverage["real_codex_entry"] = (
		_panel != null
		and _panel.is_visible_in_tree()
		and _panel.title_font_has_jian_glyph()
		and _panel.is_within_viewport()
	)
	if not bool(_coverage["real_codex_entry"]):
		await _fail("正式右下入口没有打开 1280×720 图鉴或“鉴”字缺字")
		return
	_host._update_runtime_frame_budget()
	_coverage["menu_fps60"] = (
		_host._world_menu_is_open()
		and _host.runtime_target_fps_cache == 60
		and Engine.max_fps == 60
	)
	if not bool(_coverage["menu_fps60"]):
		await _fail("正式图鉴打开后没有切换到 60fps 交互预算")
		return
	await _hold_chapter("codex_open")
	if _failed:
		return
	# Scene construction and the first complete codex build are one-time warmup.
	# The recurring family/form/tab/modal/close flow is the performance slice.
	_open_monitor_diagnostic_ms = _monitor_diagnostic_ms
	_monitor_diagnostic_ms = 0.0
	_recurring_perf_started = true
	_interactive_process_active = true
	if _native_perf_mode:
		_host._reset_perf_probe_frame_max_for_qa()
	_panel_flow.reset_codex_selection_performance_for_qa()
	_route_source_loads_before = int(
		PetCodexAcquisitionRouteCatalog.stats_for_qa().get(
			"sourceLoadCount",
			-1
		)
	)

	var family_button := _panel.visible_family_buttons().get(
		SELECTED_LINE_ID,
		null
	) as Button
	await _left_click(family_button, "乌力系种族")
	if _failed:
		return
	await _settle_frames(2)
	var form_button := _panel.visible_form_buttons().get(
		SELECTED_FORM_ID,
		null
	) as Button
	await _left_click(form_button, "高速乌力形态")
	if _failed:
		return
	await _settle_frames(2)
	var stage := _panel.find_child("SelectedPetShowcase", true, false) as TextureRect
	var stage_label := _panel.find_child("LockedStageLabel", true, false) as Label
	_coverage["family_form"] = _panel.selected_form_id() == SELECTED_FORM_ID
	_coverage["pending_portrait_blocked"] = (
		stage != null
		and not stage.visible
		and stage.texture == null
		and stage_label != null
		and stage_label.visible
		and stage_label.text == "形象尚未收录"
	)
	var selection_perf := (
		_panel_flow.codex_selection_performance_for_qa() as Dictionary
	)
	_selection_max_usec = int(selection_perf.get("maxRefreshUsec", 999999))
	_route_source_loads_after = int(
		PetCodexAcquisitionRouteCatalog.stats_for_qa().get(
			"sourceLoadCount",
			-2
		)
	)
	_coverage["hot_selection"] = (
		int(selection_perf.get("refreshCount", 0)) >= 2
		and int(selection_perf.get("cachedEntryCount", 0)) > 0
		and _selection_max_usec < 8000
	)
	_coverage["route_cache_stable"] = (
		_route_source_loads_before >= 0
		and _route_source_loads_after == _route_source_loads_before
	)
	if (
		not bool(_coverage["family_form"])
		or not bool(_coverage["pending_portrait_blocked"])
		or not bool(_coverage["hot_selection"])
		or not bool(_coverage["route_cache_stable"])
	):
		await _fail(
			(
				"种族／形态选择、纯内存热路径或未批准画像门禁失败 "
				+ "family_form=%s pending=%s refresh_count=%d "
				+ "selection_max_usec=%d build_max_usec=%d apply_max_usec=%d "
				+ "route_loads=%d/%d"
			) % [
				_bool_text(bool(_coverage["family_form"])),
				_bool_text(bool(_coverage["pending_portrait_blocked"])),
				int(selection_perf.get("refreshCount", 0)),
				_selection_max_usec,
				int(selection_perf.get("maxBuildUsec", 0)),
				int(selection_perf.get("maxApplyUsec", 0)),
				_route_source_loads_before,
				_route_source_loads_after,
			]
		)
		return
	await _hold_chapter("family_and_form")
	if _failed:
		return

	await _left_click(_panel.attribute_tab_button, "属性页签")
	if _panel.active_detail_tab() != PetCodexAwakenedPanel.TAB_ATTRIBUTES:
		await _fail("属性页签真实左键未切换")
		return
	await _hold_chapter("attributes_tab")
	if _failed:
		return
	await _left_click(_panel.growth_tab_button, "成长页签")
	if _panel.active_detail_tab() != PetCodexAwakenedPanel.TAB_GROWTH:
		await _fail("成长页签真实左键未切回")
		return
	_coverage["attributes_growth"] = true
	await _hold_chapter("growth_tab")
	if _failed:
		return

	await _left_click(_panel.acquisition_button, "获取途径")
	if _failed:
		return
	var sheet := _panel.find_child("AcquisitionSheet", true, false) as PanelContainer
	_coverage["acquisition_open"] = (
		_panel.acquisition_is_visible()
		and _panel.route_card_count() > 0
		and _panel.acquisition_overlay.size.distance_to(Vector2(VIEWPORT_SIZE)) <= 0.5
		and sheet != null
		and sheet.position.distance_to(Vector2(418.0, 148.0)) <= 0.5
		and sheet.size.distance_to(Vector2(365.0, 402.0)) <= 0.5
	)
	if not bool(_coverage["acquisition_open"]):
		await _fail("获取途径内嵌页尺寸、位置或权威路线不完整")
		return
	var form_before_modal := _panel.selected_form_id()
	var tab_before_modal := _panel.active_detail_tab()
	var modal_family_button := _panel.visible_family_buttons().get(
		"bui",
		null
	) as Button
	var modal_form_button: Button = null
	for form_id in _panel.visible_form_buttons().keys():
		if str(form_id) != form_before_modal:
			modal_form_button = _panel.visible_form_buttons().get(form_id, null) as Button
			break
	await _left_click(modal_family_button, "模态下种族阻断探针", false)
	await _left_click(modal_form_button, "模态下形态阻断探针", false)
	await _left_click(_panel.attribute_tab_button, "模态下页签阻断探针", false)
	_coverage["modal_blocks_underlay"] = (
		_panel.selected_form_id() == form_before_modal
		and _panel.active_detail_tab() == tab_before_modal
		and _panel.acquisition_is_visible()
	)
	if not bool(_coverage["modal_blocks_underlay"]):
		await _fail("获取途径打开时底层种族、形态或页签仍可点击")
		return
	await _hold_chapter("acquisition_embedded")
	if _failed:
		return

	await _left_click(_panel.close_button, "顶层关闭先折叠内嵌页")
	_coverage["top_close_collapses"] = (
		_panel.is_visible_in_tree() and not _panel.acquisition_is_visible()
	)
	if not bool(_coverage["top_close_collapses"]):
		await _fail("顶层关闭没有先折叠获取途径，或错误关闭整页")
		return
	await _hold_chapter("top_close_collapses_embedded")
	if _failed:
		return

	await _left_click(_panel.acquisition_button, "再次打开获取途径")
	var dismiss := _panel.find_child(
		"DismissAcquisitionButton",
		true,
		false
	) as Button
	await _left_click(dismiss, "内嵌页关闭")
	_coverage["embedded_close"] = (
		_panel.is_visible_in_tree() and not _panel.acquisition_is_visible()
	)
	if not bool(_coverage["embedded_close"]):
		await _fail("内嵌关闭没有仅关闭获取途径")
		return
	await _hold_chapter("embedded_close")
	if _failed:
		return

	await _left_click(_panel.close_button, "关闭图鉴")
	var same_call_restored := bool(
		_panel_flow.codex_close_world_hud_restore_same_call_for_qa()
	)
	var next_frame_restored := _formal_world_hud_complete()
	var same_call_close_contract := _world_close_runtime_contract()
	await _settle_frames(1)
	next_frame_restored = next_frame_restored and _formal_world_hud_complete()
	var next_frame_close_contract := _world_close_runtime_contract()
	await _left_click(_formal_codex_entry_button(), "恢复后的正式图鉴入口")
	var reopened_from_restored_hud := _panel.is_visible_in_tree()
	await _left_click(_panel.close_button, "从恢复入口再次关闭图鉴")
	await _settle_frames(1)
	var final_close_contract := _world_close_runtime_contract()
	_interactive_process_active = false
	if _native_perf_mode:
		_coverage["foreground_contract"] = (
			bool(_coverage["foreground_contract"])
			and DisplayServer.window_is_focused()
		)
		if not bool(_coverage["foreground_contract"]):
			await _fail("native 图鉴交互切片结束前失去玩家前台焦点")
			return
		var frame_snapshot := (
			_host._perf_probe_frame_snapshot_for_qa() as Dictionary
		)
		var max_by_label := frame_snapshot.get(
			"maxUsecByLabel",
			{}
		) as Dictionary
		var samples_by_label := frame_snapshot.get(
			"sampleCountByLabel",
			{}
		) as Dictionary
		_main_process_max_ms = (
			float(int(max_by_label.get("process_total", 0))) / 1000.0
		)
		_main_process_sample_count = int(
			samples_by_label.get("process_total", 0)
		)
	_coverage["world_hud_restored"] = (
		same_call_restored
		and next_frame_restored
		and not _panel.is_visible_in_tree()
		and _formal_world_hud_complete()
	)
	_coverage["world_hud_clickable"] = (
		reopened_from_restored_hud
		and bool(_panel_flow.codex_close_world_hud_restore_same_call_for_qa())
		and _formal_world_hud_complete()
	)
	_coverage["message_panel_restored"] = (
		bool(same_call_close_contract.get("messagePanel", false))
		and bool(next_frame_close_contract.get("messagePanel", false))
		and bool(final_close_contract.get("messagePanel", false))
	)
	_coverage["safe_area_restored"] = (
		bool(same_call_close_contract.get("safeArea", false))
		and bool(next_frame_close_contract.get("safeArea", false))
		and bool(final_close_contract.get("safeArea", false))
	)
	_coverage["movement_bounds_restored"] = (
		bool(same_call_close_contract.get("movementBounds", false))
		and bool(next_frame_close_contract.get("movementBounds", false))
		and bool(final_close_contract.get("movementBounds", false))
	)
	_coverage["camera_state_restored"] = (
		bool(same_call_close_contract.get("cameraState", false))
		and bool(next_frame_close_contract.get("cameraState", false))
		and bool(final_close_contract.get("cameraState", false))
	)
	_host._update_runtime_frame_budget()
	_coverage["idle_fps30"] = (
		not _host._world_menu_is_open()
		and not _host._world_needs_active_fps()
		and _host.runtime_target_fps_cache == 30
		and Engine.max_fps == 30
	)
	var battle_active_before: bool = bool(_host.battle_active)
	_host.battle_active = true
	_host._update_runtime_frame_budget()
	_coverage["battle_fps60"] = (
		_host._world_needs_active_fps()
		and _host.runtime_target_fps_cache == 60
		and Engine.max_fps == 60
	)
	_host.battle_active = battle_active_before
	_host._update_runtime_frame_budget()
	_coverage["no_player_qa_text"] = not _visible_tree_has_forbidden_review_text()
	if not _all_http_requests_disconnected():
		await _fail("isolated owner review 结束前发现未断开的 HTTP 请求")
		return
	if not bool(_coverage["world_hud_restored"]):
		await _fail("关闭图鉴后同调用／下一帧正式世界 HUD 没有完整恢复")
		return
	if not bool(_coverage["world_hud_clickable"]):
		await _fail("关闭图鉴后正式 HUD 入口没有恢复真实左键响应")
		return
	if not bool(_coverage["message_panel_restored"]):
		await _fail("关闭图鉴后世界消息面板或其可交互矩形没有恢复")
		return
	if not bool(_coverage["safe_area_restored"]):
		await _fail("关闭图鉴后 Phase400 正式安全区或 HUD blocker 没有恢复")
		return
	if not bool(_coverage["movement_bounds_restored"]):
		await _fail("关闭图鉴后玩家移动边界没有恢复为当前地图权威边界")
		return
	if not bool(_coverage["camera_state_restored"]):
		await _fail("关闭图鉴后镜头限制或当前位置没有恢复到安全区内")
		return
	if not bool(_coverage["idle_fps30"]):
		await _fail("图鉴关闭后的静止世界没有恢复 30fps 空闲预算")
		return
	if not bool(_coverage["battle_fps60"]):
		await _fail("战斗状态没有保持 60fps 活跃预算")
		return
	if not bool(_coverage["no_player_qa_text"]):
		await _fail("玩家画面出现 QA／调试／验收文字")
		return
	await _hold_chapter("return_world_hud")
	if _failed:
		return

	if _actual_left_clicks < 13 or _press_frames != _actual_left_clicks:
		await _fail("完整流程没有全部使用跨帧真实左键")
		return
	_detail_tab_max_usec = int(
		_panel.detail_tab_performance_for_qa().get("maxRefreshUsec", 999999)
	)
	_print_performance_diagnostics()
	if _input_dispatch_max_usec >= 8000 or _detail_tab_max_usec >= 8000:
		await _fail(
			"图鉴输入或页签处理超过 8ms：input=%dus detail=%dus"
			% [_input_dispatch_max_usec, _detail_tab_max_usec]
		)
		return
	if _native_perf_mode and (
		_main_process_sample_count <= 0 or _main_process_max_ms > 16.7
	):
		var detail_perf := _panel.detail_tab_performance_for_qa()
		await _fail(
			(
				"图鉴切片 Main ticks 门禁失败：%.3fms samples=%d "
				+ "detail_tab_max_usec=%d"
			) % [
				_main_process_max_ms,
				_main_process_sample_count,
				int(detail_perf.get("maxRefreshUsec", 0)),
			]
		)
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print((
		"PET_CODEX_AWAKENED_OWNER_REVIEW_STATE "
		+ "world_hud_before=%s real_codex_entry=%s family_form=%s "
		+ "attributes_growth=%s acquisition_open=%s modal_blocks_underlay=%s "
		+ "top_close_collapses=%s embedded_close=%s world_hud_restored=%s "
		+ "world_hud_clickable=%s "
		+ "message_panel_restored=%s safe_area_restored=%s "
		+ "movement_bounds_restored=%s camera_state_restored=%s "
		+ "menu_fps60=%s idle_fps30=%s battle_fps60=%s "
		+ "foreground_contract=%s "
		+ "pending_portrait_blocked=%s no_player_qa_text=%s "
		+ "hot_selection=%s route_cache_stable=%s "
		+ "actual_left_clicks=%d press_frames=%d server_writes=0 "
		+ "main_process_max_ms=%.3f main_process_samples=%d "
		+ "monitor_diagnostic_ms=%.3f open_monitor_diagnostic_ms=%.3f "
		+ "selection_max_usec=%d input_dispatch_max_usec=%d "
		+ "detail_tab_max_usec=%d "
		+ "route_source_loads_before=%d route_source_loads_after=%d "
		+ "perf_mode=%s") % [
			_bool_text(bool(_coverage["world_hud_before"])),
			_bool_text(bool(_coverage["real_codex_entry"])),
			_bool_text(bool(_coverage["family_form"])),
			_bool_text(bool(_coverage["attributes_growth"])),
			_bool_text(bool(_coverage["acquisition_open"])),
			_bool_text(bool(_coverage["modal_blocks_underlay"])),
			_bool_text(bool(_coverage["top_close_collapses"])),
			_bool_text(bool(_coverage["embedded_close"])),
			_bool_text(bool(_coverage["world_hud_restored"])),
			_bool_text(bool(_coverage["world_hud_clickable"])),
			_bool_text(bool(_coverage["message_panel_restored"])),
			_bool_text(bool(_coverage["safe_area_restored"])),
			_bool_text(bool(_coverage["movement_bounds_restored"])),
			_bool_text(bool(_coverage["camera_state_restored"])),
			_bool_text(bool(_coverage["menu_fps60"])),
			_bool_text(bool(_coverage["idle_fps30"])),
			_bool_text(bool(_coverage["battle_fps60"])),
			_bool_text(bool(_coverage["foreground_contract"])),
			_bool_text(bool(_coverage["pending_portrait_blocked"])),
			_bool_text(bool(_coverage["no_player_qa_text"])),
			_bool_text(bool(_coverage["hot_selection"])),
			_bool_text(bool(_coverage["route_cache_stable"])),
			_actual_left_clicks,
			_press_frames,
			_main_process_max_ms,
			_main_process_sample_count,
			_monitor_diagnostic_ms,
			_open_monitor_diagnostic_ms,
			_selection_max_usec,
			_input_dispatch_max_usec,
			_detail_tab_max_usec,
			_route_source_loads_before,
			_route_source_loads_after,
			"native" if _native_perf_mode else "movie30",
		]
	)
	print((
		"PET_CODEX_AWAKENED_OWNER_REVIEW_END elapsed_wall=%.3f "
		+ "speed=1.00x profile=isolated backend=false completed=true") % elapsed
	)
	await _finish(0)


func _wait_for_native_foreground_focus() -> bool:
	# macOS treats activation as a request. Repeat it only inside a bounded
	# window, and accept evidence solely after a fresh frame reports key focus.
	var tree: SceneTree = _host.get_tree()
	var started_msec := Time.get_ticks_msec()
	var next_request_msec := started_msec
	var request_count := 0
	while Time.get_ticks_msec() - started_msec <= FOREGROUND_TIMEOUT_MSEC:
		var now_msec := Time.get_ticks_msec()
		if now_msec >= next_request_msec:
			DisplayServer.window_move_to_foreground()
			request_count += 1
			next_request_msec = now_msec + FOREGROUND_RETRY_MSEC
		await tree.process_frame
		if DisplayServer.window_is_focused():
			print(
				"PET_CODEX_AWAKENED_OWNER_REVIEW_FOCUS "
				+ "focused=true elapsed_msec=%d requests=%d"
				% [Time.get_ticks_msec() - started_msec, request_count]
			)
			return true
	print(
		"PET_CODEX_AWAKENED_OWNER_REVIEW_FOCUS "
		+ "focused=false elapsed_msec=%d requests=%d"
		% [Time.get_ticks_msec() - started_msec, request_count]
	)
	return false


func _wait_for_real_world() -> bool:
	var tree := _tree
	if tree == null:
		return false
	for _frame_index in range(240):
		if _host == null or not is_instance_valid(_host):
			return false
		await tree.process_frame
		if (
			_host.get("hud_root") is Control
			and _host.get("player") is CanvasItem
			and _host.get("codex_menu_button") is Button
			and str(_host.get("current_map_id")).strip_edges() != ""
		):
			return (
				_host.get_tree().current_scene == _host
				and str(_host.scene_file_path) == "res://scenes/Main.tscn"
			)
	return false


func _configure_isolated_world() -> bool:
	_host.profile_save_enabled = false
	_host.account_authenticated = true
	_host.auth_auto_bypass = false
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
	for value in _host.find_children("*", "HTTPRequest", true, false):
		if value is HTTPRequest:
			var request := value as HTTPRequest
			request.cancel_request()
			if request.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
				await _fail("isolated owner review 未能断开所有 HTTP 请求")
				return false
	if _host.has_method("_refresh_gm_visibility"):
		_host._refresh_gm_visibility()
	var qa_menu := _host.get("qa_menu_button") as CanvasItem
	if qa_menu != null and qa_menu.visible:
		await _fail("isolated owner review 仍显示 GM/QA 入口")
		return false
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
	for form_id in [
		"wuli_normal_orange_fire10",
		SELECTED_FORM_ID,
		"bui_novice_sprout_earth5_wind5",
	]:
		profile = PlayerProgressModel.record_codex_seen(profile, form_id)
	var player_value = profile.get("player", {})
	var player_profile := (
		(player_value as Dictionary).duplicate(true)
		if player_value is Dictionary
		else {}
	)
	player_profile["name"] = "岚牙"
	player_profile["level"] = 18
	profile["player"] = player_profile
	_host.player_profile = PlayerProgressModel.normalize_profile(profile)
	_host.codex_selected_form_id = "bui_novice_sprout_earth5_wind5"
	if not _host._load_map(WORLD_MAP_ID, WORLD_SPAWN_NAME):
		await _fail("无法载入图鉴验收世界地图")
		return false
	_host._set_world_log_message("冒险图鉴会记录旅途中遇见的宠物。")
	_host._update_hud_text(true)
	_host._layout_hud()
	_panel_flow = _host._panel_flow()
	if _panel_flow == null:
		await _fail("真实 Main.tscn 没有建立 PanelFlowCoordinator")
		return false
	_panel_flow._close_codex_panel()
	_host._layout_hud()
	return true


func _formal_world_hud_complete() -> bool:
	var awakened = _host.get("world_hud_awakened_view")
	var roster = _host.get("world_hud_party_roster_view")
	var top_panel = _host.get("top_panel") as Control
	var side_panel = _host.get("side_panel") as Control
	var action_bar = _host.get("action_bar") as Control
	var top_surface: Node = (
		awakened.find_child("WorldHudTopSurface", true, false)
		if awakened is Node
		else null
	)
	var side_surface: Node = (
		awakened.find_child("WorldHudSideSurface", true, false)
		if awakened is Node
		else null
	)
	var dock_surface: Node = (
		awakened.find_child("WorldHudDockSurface", true, false)
		if awakened is Node
		else null
	)
	var fixed_entries: Node = (
		awakened.find_child("WorldHudFixedEntries", true, false)
		if awakened is Node
		else null
	)
	var map_button: Node = (
		awakened.find_child("WorldHudEntryMap", true, false)
		if awakened is Node
		else null
	)
	var character_button: Node = (
		awakened.find_child("WorldHudCharacterPortraitProxy", true, false)
		if awakened is Node
		else null
	)
	var codex_button := _formal_codex_entry_button()
	return (
		awakened is Control
		and (awakened as Control).is_visible_in_tree()
		and roster is Control
		and (roster as Control).is_visible_in_tree()
		and _hud_control_ready(top_panel)
		and top_panel.mouse_filter != Control.MOUSE_FILTER_IGNORE
		and _hud_control_ready(side_panel)
		and side_panel.mouse_filter != Control.MOUSE_FILTER_IGNORE
		and _hud_control_ready(action_bar)
		and action_bar.mouse_filter != Control.MOUSE_FILTER_IGNORE
		and _hud_control_ready(top_surface as Control)
		and _hud_control_ready(side_surface as Control)
		and _hud_control_ready(dock_surface as Control)
		and fixed_entries is Control
		and _hud_control_ready(fixed_entries as Control)
		and map_button is Button
		and _hud_button_ready(map_button as Button)
		and character_button is Button
		and _hud_button_ready(character_button as Button)
		and _hud_button_ready(codex_button)
	)


func _world_close_runtime_contract() -> Dictionary:
	var viewport_size := Vector2(VIEWPORT_SIZE)
	var message_panel := _host.get("battle_message_panel") as Control
	var message_expand_button := (
		_host.get("battle_message_expand_button") as Button
	)
	var message_clear_button := _host.get("battle_message_clear_button") as Button
	var message_panel_ready := (
		str(_host.get("world_log_message")).strip_edges() != ""
		or not (_host.get("world_log_history") as Array).is_empty()
	)
	message_panel_ready = (
		message_panel_ready
		and _hud_control_ready(message_panel)
		and message_panel.mouse_filter != Control.MOUSE_FILTER_IGNORE
		and _hud_button_ready(message_expand_button)
		and _hud_button_ready(message_clear_button)
	)

	var blocker_rects: Array[Rect2] = []
	var raw_blockers = _host.get("world_camera_hud_blocker_rects")
	if raw_blockers is Array:
		for raw_rect in raw_blockers:
			if typeof(raw_rect) == TYPE_RECT2:
				var blocker_rect: Rect2 = raw_rect
				blocker_rects.append(blocker_rect)
	var expected_blocker_controls: Array[Control] = [
		_host.get("top_panel") as Control,
		_host.get("side_panel") as Control,
		message_panel,
		_host.get("action_bar") as Control,
	]
	var blockers_match := blocker_rects.size() == expected_blocker_controls.size()
	for blocker_control in expected_blocker_controls:
		blockers_match = (
			blockers_match
			and blocker_control != null
			and blocker_control.is_visible_in_tree()
			and blocker_control.mouse_filter != Control.MOUSE_FILTER_IGNORE
			and _rect_list_contains(blocker_rects, blocker_control.get_global_rect())
		)
	var expected_safe_rect := WorldCameraSafeAreaModel.safe_viewport_rect(
		viewport_size,
		blocker_rects
	)
	var actual_safe_rect: Rect2 = _host.get("world_camera_safe_viewport_rect")
	var expected_safe_anchor := WorldCameraSafeAreaModel.player_anchor(
		viewport_size,
		expected_safe_rect
	)
	var actual_safe_anchor: Vector2 = _host.get("world_camera_safe_anchor_screen")
	var safe_area_ready := (
		blockers_match
		and expected_safe_rect.size.x > 0.5
		and expected_safe_rect.size.y > 0.5
		and _rect_nearly_equal(actual_safe_rect, expected_safe_rect)
		and not _rect_nearly_equal(
			actual_safe_rect,
			Rect2(Vector2.ZERO, viewport_size)
		)
		and actual_safe_anchor.distance_to(expected_safe_anchor) <= 0.5
	)

	var player := _host.get("player") as CharacterBody2D
	var expected_movement_bounds: Rect2 = _host._player_movement_bounds()
	var actual_movement_bounds := Rect2()
	if player != null:
		actual_movement_bounds = player.get("movement_bounds") as Rect2
	var movement_bounds_ready := (
		player != null
		and expected_movement_bounds.size.x > 0.5
		and expected_movement_bounds.size.y > 0.5
		and _rect_nearly_equal(actual_movement_bounds, expected_movement_bounds)
		and expected_movement_bounds.grow(0.5).has_point(player.global_position)
	)

	var camera := _host.get("game_camera") as Camera2D
	var camera_state_ready := false
	if camera != null and player != null:
		var expected_camera_position: Vector2 = _host._clamped_camera_center(
			player.global_position
		)
		camera_state_ready = (
			camera.limit_left == -10000000
			and camera.limit_top == -10000000
			and camera.limit_right == 10000000
			and camera.limit_bottom == 10000000
			and _host._camera_center_is_inside_limits(camera.global_position)
			and camera.global_position.distance_to(expected_camera_position) <= 0.1
		)
	return {
		"messagePanel": message_panel_ready,
		"safeArea": safe_area_ready,
		"movementBounds": movement_bounds_ready,
		"cameraState": camera_state_ready,
	}


func _rect_list_contains(rects: Array[Rect2], expected: Rect2) -> bool:
	for rect in rects:
		if _rect_nearly_equal(rect, expected):
			return true
	return false


func _rect_nearly_equal(left: Rect2, right: Rect2) -> bool:
	return (
		left.position.distance_to(right.position) <= 0.5
		and left.size.distance_to(right.size) <= 0.5
	)


func _formal_codex_entry_button() -> Button:
	var awakened = _host.get("world_hud_awakened_view")
	if not (awakened is Node):
		return null
	var fixed_entries := (awakened as Node).find_child(
		"WorldHudFixedEntries",
		true,
		false
	) as Control
	if fixed_entries == null:
		return null
	for node in fixed_entries.find_children("*", "Button", true, false):
		var button := node as Button
		if button != null and (
			button.name.begins_with("WorldHudProxyCodex")
			or button.tooltip_text == "图鉴"
		):
			return button
	return null


func _hud_control_ready(control: Control) -> bool:
	if control == null or not control.is_visible_in_tree():
		return false
	var rect := control.get_global_rect()
	var viewport_rect: Rect2 = _host.get_tree().root.get_visible_rect()
	return (
		rect.size.x > 0.5
		and rect.size.y > 0.5
		and rect.position.x >= viewport_rect.position.x - 0.5
		and rect.position.y >= viewport_rect.position.y - 0.5
		and rect.end.x <= viewport_rect.end.x + 0.5
		and rect.end.y <= viewport_rect.end.y + 0.5
	)


func _hud_button_ready(button: Button) -> bool:
	return (
		_button_ready(button)
		and button.mouse_filter != Control.MOUSE_FILTER_IGNORE
		and _hud_control_ready(button)
	)


func _button_ready(button: Button) -> bool:
	return (
		button != null
		and button.is_inside_tree()
		and button.is_visible_in_tree()
		and not button.disabled
		and button.mouse_filter != Control.MOUSE_FILTER_IGNORE
	)


func _left_click(control: Control, label: String, require_button_ready := true) -> void:
	_performance_context = "click:%s" % label
	if control == null or not control.is_inside_tree():
		await _fail("%s不存在，无法执行真实左键" % label)
		return
	if require_button_ready and not _button_ready(control as Button if control is Button else null):
		await _fail("%s不可见或不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	var root_window: Window = _host.get_tree().root
	if not root_window.get_visible_rect().has_point(viewport_point):
		await _fail("%s不在 1280×720 可点击区域内" % label)
		return
	var input_position: Vector2 = root_window.get_screen_transform() * viewport_point
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	_parse_input_event_with_perf(motion)
	await _host.get_tree().process_frame
	if require_button_ready:
		var hovered: Control = root_window.gui_get_hovered_control()
		if hovered == null or (
			hovered != control and not control.is_ancestor_of(hovered)
		):
			await _fail(
				"%s指针命中异常：expected=%s hovered=%s point=%s"
				% [
					label,
					str(control.get_path()),
					str(hovered.get_path()) if hovered != null else "<none>",
					str(viewport_point),
				]
			)
			return
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	_parse_input_event_with_perf(press)
	await _host.get_tree().process_frame
	_press_frames += 1
	_sample_performance()
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	_parse_input_event_with_perf(release)
	await _host.get_tree().process_frame
	_actual_left_clicks += 1
	_sample_performance()


func _parse_input_event_with_perf(event: InputEvent) -> void:
	var dispatch_start := Time.get_ticks_usec()
	Input.parse_input_event(event)
	if _recurring_perf_started and _interactive_process_active:
		_input_dispatch_max_usec = maxi(
			_input_dispatch_max_usec,
			Time.get_ticks_usec() - dispatch_start
		)


func _settle_frames(count: int) -> void:
	for _index in range(maxi(1, count)):
		await _host.get_tree().process_frame
		_sample_performance()


func _hold_chapter(chapter_id: String) -> void:
	_performance_context = "chapter:%s" % chapter_id
	var seconds := 0.0
	for chapter in CHAPTERS:
		if str(chapter.get("id", "")) == chapter_id:
			seconds = float(chapter.get("seconds", 0.0))
			break
	if seconds <= 0.0:
		await _fail("未知录像章节：%s" % chapter_id)
		return
	var frames := maxi(1, roundi(seconds * REVIEW_FPS))
	if _native_perf_mode:
		frames = maxi(1, roundi(seconds * 60.0))
	print((
		"PET_CODEX_AWAKENED_OWNER_REVIEW_CHAPTER chapter=%s "
		+ "frame=%d seconds=%.3f speed=1.00x") % [chapter_id, frames, seconds]
	)
	for _frame_index in range(frames):
		await _host.get_tree().process_frame
		_sample_performance()


func _sample_performance() -> void:
	if _native_perf_mode:
		return
	var sample_ms := (
		float(Performance.get_monitor(Performance.TIME_PROCESS)) * 1000.0
	)
	# Movie Maker's monitor is only a delayed diagnostic maximum. Godot may
	# publish it up to one second late, so it is neither chapter-attributed nor a
	# release gate. Native evidence comes from Main's process_total ticks.
	_monitor_diagnostic_ms = maxf(_monitor_diagnostic_ms, sample_ms)


func _print_performance_diagnostics() -> void:
	print(
		(
			"PET_CODEX_AWAKENED_OWNER_REVIEW_PERF_DIAGNOSTICS "
			+ "main_process_max_ms=%.3f main_process_samples=%d "
			+ "monitor_diagnostic_ms=%.3f input_dispatch_max_usec=%d "
			+ "detail_tab_max_usec=%d"
		) % [
			_main_process_max_ms,
			_main_process_sample_count,
			_monitor_diagnostic_ms,
			_input_dispatch_max_usec,
			_detail_tab_max_usec,
		]
	)


func _visible_tree_has_forbidden_review_text() -> bool:
	for value in _host.find_children("*", "Label", true, false):
		if value is Label and (value as Label).is_visible_in_tree():
			var text_value := str((value as Label).text).strip_edges().to_lower()
			if (
				"qa" in text_value
				or "调试" in text_value
				or "验收" in text_value
				or text_value == "gm"
				or text_value.begins_with("gm/")
			):
				return true
	for value in _host.find_children("*", "Button", true, false):
		if value is Button and (value as Button).is_visible_in_tree():
			var text_value := str((value as Button).text).strip_edges().to_lower()
			if (
				"qa" in text_value
				or "调试" in text_value
				or "验收" in text_value
				or text_value == "gm"
				or text_value.begins_with("gm/")
			):
				return true
	return false


func _all_http_requests_disconnected() -> bool:
	for value in _host.find_children("*", "HTTPRequest", true, false):
		if (
			value is HTTPRequest
			and (value as HTTPRequest).get_http_client_status()
			!= HTTPClient.STATUS_DISCONNECTED
		):
			return false
	return true


func _bool_text(value: bool) -> String:
	return "true" if value else "false"


func _fail(message: String) -> void:
	if _failed:
		return
	_failed = true
	print("PET_CODEX_AWAKENED_OWNER_REVIEW_FAILED reason=%s" % message)
	push_error("pet codex awakened owner review failed: %s" % message)
	await _finish(1)


func _finish(exit_code: int) -> void:
	var tree := _tree
	if tree == null:
		return
	for _frame_index in range(4):
		await tree.process_frame
	tree.call_deferred("quit", exit_code)
