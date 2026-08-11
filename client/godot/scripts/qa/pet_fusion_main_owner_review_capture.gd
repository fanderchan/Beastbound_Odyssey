extends RefCounted

## Formal owner-review capture for the first two fusion routes inside the real
## Main.tscn host.  This helper is reachable only through a dev-only QA flag,
## mounts a local presentation overlay, and never performs the second confirm,
## a network request, a profile save, or a production runtime mutation.

const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const PetFusionPanel := preload(
	"res://scripts/ui/pet_fusion_panel.gd"
)
const PetFusionPanelCheck := preload(
	"res://scripts/qa/pet_fusion_panel_check.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetFusionSelectionModel := preload(
	"res://scripts/progression/pet_fusion_selection_model.gd"
)
const PetPortraitArtCatalog := preload(
	"res://scripts/ui/pet_portrait_art_catalog.gd"
)

const CAPTURE_FLAG := "--auto-pet-fusion-main-owner-review-capture"
const REPORT_ARG_PREFIX := "--pet-fusion-main-owner-review-report="
const VIEWPORT_SIZE := Vector2i(1280, 720)
const CAPTURE_FPS := 30
const PLAYBACK_SPEED := 1.0
const REPORT_SCHEMA_VERSION := 1
const REPORT_TYPE := "beastbound.pet_fusion_main_owner_review_capture"
const START_MARKER := "PET_FUSION_MAIN_OWNER_REVIEW_START"
const CHAPTER_MARKER := "PET_FUSION_MAIN_OWNER_REVIEW_CHAPTER"
const STATE_MARKER := "PET_FUSION_MAIN_OWNER_REVIEW_STATE"
const END_MARKER := "PET_FUSION_MAIN_OWNER_REVIEW_END"
const FAILURE_MARKER := "PET_FUSION_MAIN_OWNER_REVIEW_FAILED"
const QA_LANE := "automation"
const QA_LANE_FEATURE := "beastbound_qa_automation"
const QA_LANE_ROOT_ENV := "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT"
const ROUTE_TARGETS := {
	"solar": {
		"formId": "emberhorn_fusion_solar_crown_fire7_wind3",
		"name": "曜冠角兽",
	},
	"moss": {
		"formId": "emberhorn_fusion_moss_rampart_fire4_earth6",
		"name": "苔垒角兽",
	},
}
const CHAPTER_SPECS: Array[Dictionary] = [
	{
		"id": "closed_open",
		"state": "closed",
		"route": "solar",
		"frames": 120,
	},
	{
		"id": "solar_preview",
		"state": "preview",
		"route": "solar",
		"frames": 180,
	},
	{
		"id": "solar_armed",
		"state": "armed",
		"route": "solar",
		"frames": 150,
	},
	{
		"id": "moss_preview",
		"state": "preview",
		"route": "moss",
		"frames": 180,
	},
	{
		"id": "moss_armed",
		"state": "armed",
		"route": "moss",
		"frames": 150,
	},
	{
		"id": "closed_final",
		"state": "closed",
		"route": "solar",
		"frames": 120,
	},
]

var _host
var _tree: SceneTree
var _layer: CanvasLayer
var _panel: Control
var _production_catalog: Dictionary = {}
var _report_path := ""
var _errors: Array[String] = []
var _chapters: Array[Dictionary] = []
var _active_route := ""
var _chapter_frame_count := 0
var _transition_frame_count := 0
var _actual_left_clicks := 0
var _press_frames := 0
var _failed := false


func _init(host_node) -> void:
	_host = host_node


static func is_flag(argument: String) -> bool:
	return argument == CAPTURE_FLAG


func run() -> void:
	_tree = _host.get_tree() if _host != null else null
	var args := OS.get_cmdline_user_args()
	var capture_count := 0
	var report_values: Array[String] = []
	for raw_arg in args:
		var argument := str(raw_arg).strip_edges()
		if is_flag(argument):
			capture_count += 1
		elif argument.begins_with(REPORT_ARG_PREFIX):
			report_values.append(
				argument.trim_prefix(REPORT_ARG_PREFIX).strip_edges()
			)
	if capture_count != 1:
		await _fail("capture flag 必须且只能出现一次")
		return
	if report_values.size() != 1:
		await _fail("report 参数必须且只能出现一次")
		return
	_report_path = _validated_report_path(report_values[0])
	if _report_path == "":
		await _fail("report 必须是仓库 .run/evidence 下的绝对 JSON 路径")
		return
	await _run()


func _run() -> void:
	if _tree == null or _tree.current_scene != _host:
		await _fail("录像没有运行在当前 Main.tscn 宿主")
		return
	if str(_host.scene_file_path) != "res://scenes/Main.tscn":
		await _fail("当前场景路径不是 res://scenes/Main.tscn")
		return
	await _tree.process_frame
	await RenderingServer.frame_post_draw
	_transition_frame_count += 1
	await _configure_isolated_main()
	if _failed:
		return
	_append_main_host_errors()
	BalanceCatalogModel.reload()
	_production_catalog = BalanceCatalogModel.pet_fusion_recipes()
	_append_production_boundary_errors()
	_mount_overlay()
	_append_formal_portrait_preflight_errors()
	if not _errors.is_empty():
		await _fail("Main-hosted 融合验收预检失败")
		return

	print(
		(
			START_MARKER
			+ " scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
			+ "fps=30 speed=1.00x profile=isolated backend=false "
			+ "profile_save=false production_runtime=false "
			+ "player_entry=false owner_review_status=pending"
		)
	)
	for chapter_spec in CHAPTER_SPECS:
		var snapshot := await _configure_chapter(chapter_spec)
		if _failed:
			return
		var chapter_errors: Array[String] = []
		_append_snapshot_errors(chapter_spec, snapshot, chapter_errors)
		_errors.append_array(chapter_errors)
		var frame_count := int(chapter_spec.get("frames", 0))
		var start_frame := _chapter_frame_count
		var end_frame := start_frame + frame_count
		_chapters.append({
			"id": str(chapter_spec.get("id", "")),
			"state": str(chapter_spec.get("state", "")),
			"route": str(chapter_spec.get("route", "")),
			"startFrame": start_frame,
			"endFrameExclusive": end_frame,
			"frameCount": frame_count,
			"startTimeSeconds": float(start_frame) / float(CAPTURE_FPS),
			"centerTimeSeconds": (
				float(start_frame + frame_count / 2) / float(CAPTURE_FPS)
			),
			"endTimeSeconds": float(end_frame) / float(CAPTURE_FPS),
			"snapshot": _report_snapshot(snapshot),
			"errors": chapter_errors,
		})
		print(
			(
				CHAPTER_MARKER
				+ " chapter=%s frame=%d seconds=%.3f speed=1.00x "
				+ "state=%s route=%s"
			) % [
				str(chapter_spec.get("id", "")),
				frame_count,
				float(frame_count) / float(CAPTURE_FPS),
				str(chapter_spec.get("state", "")),
				str(chapter_spec.get("route", "")),
			]
		)
		await _hold_frames(frame_count)

	_append_final_state_errors()
	if not _errors.is_empty():
		await _fail("Main-hosted 融合验收状态不完整")
		return
	await _drain_main_audio_for_movie_shutdown()
	if _failed:
		return
	var report := _report(true)
	var write_error := _write_report(_report_path, report)
	if write_error != OK:
		await _fail(
			"无法写入融合 Main 验收报告：%s"
			% error_string(write_error)
		)
		return
	print(
		(
			STATE_MARKER
			+ " main_host=true qa_lane=true profile_isolated=true "
			+ "formal_portraits=true placeholders=0 layout_valid=true "
			+ "no_player_qa_text=true production_runtime=false "
			+ "player_entry=false network_requests=0 "
			+ "second_confirmations=0 actual_left_clicks=%d "
			+ "press_frames=%d chapter_frames=%d transition_frames=%d"
		) % [
			_actual_left_clicks,
			_press_frames,
			_chapter_frame_count,
			_transition_frame_count,
		]
	)
	print(
		END_MARKER
		+ " completed=true speed=1.00x profile=isolated backend=false "
		+ "owner_review_status=pending"
	)
	# The final closed chapter has already completed its post-draw frame. Free
	# the capture-only overlay synchronously and quit without drawing a world
	# flash frame; otherwise the suspended helper retains panel resources until
	# engine shutdown and Godot correctly reports ObjectDB/resource leaks.
	var tree := _tree
	_release_overlay()
	tree.quit(0)


func _configure_isolated_main() -> void:
	_host.profile_save_enabled = false
	_host.account_authenticated = false
	_host.auth_auto_bypass = false
	_host.current_account_session = {}
	_host.server_profile_sync_state = "off"
	_host.server_profile_sync_pending_kind = ""
	_host.server_profile_sync_dirty = false
	_host.server_profile_sync_pull_queued = false
	_host.auth_request_pending = false
	if _host.has_method("_stop_server_event_stream"):
		_host._stop_server_event_stream()
	if _host.has_method("_stop_online_position_sync"):
		_host._stop_online_position_sync()
	for value in _host.find_children("*", "HTTPRequest", true, false):
		if value is HTTPRequest:
			var request := value as HTTPRequest
			request.cancel_request()
			if request.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
				await _fail("隔离验收未能断开全部 HTTP 请求")
				return
	for method_name in [
		"_close_auth_panel",
		"_close_account_panel",
		"_close_market_panel",
		"_close_battle_result_panel",
	]:
		if _host.has_method(method_name):
			_host.call(method_name, false)
	if _host.has_method("_refresh_gm_visibility"):
		_host._refresh_gm_visibility()
	var qa_menu := _host.get("qa_menu_button") as CanvasItem
	if qa_menu != null and qa_menu.visible:
		await _fail("隔离验收仍显示 GM/QA 入口")


func _append_main_host_errors() -> void:
	var root_window := _tree.root
	if _tree.current_scene != _host:
		_errors.append("current_scene 不是传入的 Main 宿主")
	if str(_host.scene_file_path) != "res://scenes/Main.tscn":
		_errors.append("Main 宿主场景路径错误")
	if root_window.size != VIEWPORT_SIZE:
		_errors.append("Main 验收窗口不是1280x720")
	if root_window.mode != Window.MODE_WINDOWED or not root_window.visible:
		_errors.append("Main 验收窗口不是可见 windowed 模式")
	if DisplayServer.get_name().to_lower() != "macos":
		_errors.append("Main 验收没有使用 macOS DisplayServer")
	if absf(Engine.time_scale - PLAYBACK_SPEED) > 0.0001:
		_errors.append("Main 验收播放速度不是1.00x")
	if str(_host.qa_user_data_lane_arg) != QA_LANE:
		_errors.append("Main 没有绑定 automation QA lane")
	if int(_host.qa_user_data_lane_arg_count) != 1:
		_errors.append("Main QA lane 参数数量不精确")
	if not OS.has_feature(QA_LANE_FEATURE):
		_errors.append("Main 缺少 automation QA lane feature")
	var actual_user_root := _normalized_path(
		ProjectSettings.globalize_path("user://")
	)
	var expected_user_root := _normalized_path(
		OS.get_environment(QA_LANE_ROOT_ENV)
	)
	if expected_user_root == "" or actual_user_root != expected_user_root:
		_errors.append("Main 实际 user:// 与受证明 QA lane 不一致")
	if (
		bool(_host.profile_save_enabled)
		or bool(_host.account_authenticated)
		or bool(_host.auth_auto_bypass)
		or not (_host.current_account_session as Dictionary).is_empty()
		or str(_host.server_profile_sync_state) != "off"
	):
		_errors.append("Main 隔离档案或服务端同步边界错误")
	if not _all_http_requests_disconnected():
		_errors.append("Main 仍有 HTTP 请求处于连接状态")


func _append_production_boundary_errors() -> void:
	if PetFusionRecipeCatalogModel.runtime_available(_production_catalog):
		_errors.append("生产融合目录必须保持关闭")
	if str(_production_catalog.get("disabledMessage", "")) != (
		PetFusionSelectionModel.CLOSED_MESSAGE
	):
		_errors.append("生产融合目录关闭文案不精确")
	var panel_source := _read_text("res://scripts/ui/pet_fusion_panel.gd")
	for marker in [
		"ServerAuthClientModel",
		"HTTPClient",
		"HTTPRequest",
		"pet_fusion_quote_request",
		"pet_fusion_request",
	]:
		if panel_source.find(marker) >= 0:
			_errors.append("融合面板意外依赖网络实现：%s" % marker)
	var main_source := _read_text("res://scripts/main.gd")
	var coordinator_source := _read_text(
		"res://scripts/ui/panel_flow_coordinator.gd"
	)
	if (
		main_source.find("pet_fusion_panel.gd") >= 0
		or coordinator_source.find("pet_fusion_panel.gd") >= 0
	):
		_errors.append("融合面板不得接入正常玩家入口")


func _mount_overlay() -> void:
	_layer = CanvasLayer.new()
	_layer.name = "PetFusionMainOwnerReviewLayer"
	_layer.layer = 240
	_host.add_child(_layer)
	_panel = PetFusionPanel.new()
	_panel.name = "PetFusionMainOwnerReviewPanel"
	_layer.add_child(_panel)


func _append_formal_portrait_preflight_errors() -> void:
	for route_key in ["solar", "moss"]:
		var fixture := PetFusionPanelCheck.preview_fixture(route_key)
		var candidates: Array[Dictionary] = fixture.get("candidates", [])
		var configured := bool(_panel.call(
			"configure_qa_preview",
			PetFusionPanel.QA_PREVIEW_TOKEN,
			fixture.get("catalog", {}),
			fixture.get("selections", {}),
			fixture.get("quote", {}),
			candidates
		))
		var snapshot := _panel.call("snapshot") as Dictionary
		if not configured:
			_errors.append("%s 路线隔离预览装载失败" % route_key)
		if str(snapshot.get("targetPortraitStatus", "")) != "formal":
			_errors.append("%s 路线正式目标大头照尚未落盘" % route_key)
		if int(snapshot.get("candidatePlaceholderCount", -1)) != 0:
			_errors.append("%s 路线仍有候选宠大头照占位" % route_key)
		if int(snapshot.get("candidateFormalPortraitCount", -1)) != (
			candidates.size()
		):
			_errors.append("%s 路线候选宠未全部使用正式大头照" % route_key)
		if int(snapshot.get("networkRequestCount", -1)) != 0:
			_errors.append("%s 路线画像预检发生网络请求" % route_key)
	_panel.call(
		"configure_closed",
		_production_catalog,
		(PetFusionPanelCheck.preview_fixture("solar")).get(
			"candidates",
			[]
		)
	)


func _configure_chapter(chapter_spec: Dictionary) -> Dictionary:
	var state := str(chapter_spec.get("state", ""))
	var route_key := str(chapter_spec.get("route", ""))
	var fixture := PetFusionPanelCheck.preview_fixture(route_key)
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	if state == "closed":
		_panel.call("configure_closed", _production_catalog, candidates)
		_active_route = ""
	elif state == "preview":
		var configured := bool(_panel.call(
			"configure_qa_preview",
			PetFusionPanel.QA_PREVIEW_TOKEN,
			fixture.get("catalog", {}),
			fixture.get("selections", {}),
			fixture.get("quote", {}),
			candidates
		))
		if not configured:
			await _fail("%s 路线隔离预览装载失败" % route_key)
			return {}
		_active_route = route_key
	elif state == "armed":
		if _active_route != route_key:
			await _fail("%s 路线没有从相邻预览态进入确认态" % route_key)
			return {}
		var confirm_button := _panel.get_node_or_null("ConfirmButton") as Button
		await _left_click(confirm_button, "%s 首次确认" % route_key)
		if _failed:
			return {}
	else:
		await _fail("未知融合验收章节状态：%s" % state)
		return {}
	_panel.queue_redraw()
	await _tree.process_frame
	await RenderingServer.frame_post_draw
	_transition_frame_count += 1
	var snapshot := _panel.call("snapshot") as Dictionary
	if state == "closed":
		snapshot["targetNameText"] = ""
		snapshot["targetFormId"] = ""
		snapshot["targetPortraitResourcePath"] = ""
	else:
		var quote := fixture.get("quote", {}) as Dictionary
		var result := quote.get("result", {}) as Dictionary
		snapshot["targetFormId"] = str(result.get("targetFormId", ""))
		snapshot["targetPortraitResourcePath"] = _target_portrait_resource_path()
	return snapshot


func _append_snapshot_errors(
	chapter_spec: Dictionary,
	snapshot: Dictionary,
	errors: Array[String]
) -> void:
	var state := str(chapter_spec.get("state", ""))
	var route_key := str(chapter_spec.get("route", ""))
	var fixture := PetFusionPanelCheck.preview_fixture(route_key)
	var candidates: Array[Dictionary] = fixture.get("candidates", [])
	for layout_error in PetFusionPanelCheck.layout_errors(_panel):
		errors.append("1280x720布局：%s" % layout_error)
	if int(snapshot.get("networkRequestCount", -1)) != 0:
		errors.append("章节发生网络请求")
	if int(snapshot.get("secondConfirmationCount", -1)) != 0:
		errors.append("章节越过第二次确认边界")
	if state == "closed":
		if not bool(snapshot.get("closed", false)):
			errors.append("关闭章节没有保持关闭态")
		if str(snapshot.get("messageText", "")) != (
			PetFusionSelectionModel.CLOSED_MESSAGE
		):
			errors.append("关闭章节文案不精确")
		if (
			int(snapshot.get("materialDisabledCount", -1)) != 3
			or int(snapshot.get("candidateDisabledCount", -1))
				!= candidates.size()
			or not bool(snapshot.get("confirmDisabled", false))
		):
			errors.append("关闭章节仍存在可操作控件")
		return

	var route_target := ROUTE_TARGETS.get(route_key, {}) as Dictionary
	var expected_form_id := str(route_target.get("formId", ""))
	var expected_name := str(route_target.get("name", ""))
	var expected_portrait_path := (
		PetPortraitArtCatalog.resource_path_for_form(expected_form_id)
	)
	if bool(snapshot.get("closed", true)) or not bool(
		snapshot.get("quoteValid", false)
	):
		errors.append("路线章节没有形成有效本地预览")
	if str(snapshot.get("targetPortraitStatus", "")) != "formal":
		errors.append("路线章节没有使用正式目标大头照")
	if str(snapshot.get("targetFormId", "")) != expected_form_id:
		errors.append("路线章节目标形态不是冻结目标")
	if str(snapshot.get("targetNameText", "")) != expected_name:
		errors.append("路线章节目标名称不是冻结目标")
	if str(snapshot.get("targetPortraitResourcePath", "")) != expected_portrait_path:
		errors.append("路线章节正式画像没有绑定冻结目标形态")
	if int(snapshot.get("candidatePlaceholderCount", -1)) != 0:
		errors.append("路线章节仍显示候选宠占位图")
	if int(snapshot.get("candidateFormalPortraitCount", -1)) != candidates.size():
		errors.append("路线章节候选宠没有全部绑定正式画像")
	if state == "preview" and bool(snapshot.get("confirmationArmed", true)):
		errors.append("路线预览章节提前进入二次确认")
	if state == "armed" and not bool(snapshot.get("confirmationArmed", false)):
		errors.append("第一次确认后没有停在二次确认前")
	if bool(snapshot.get("confirmDisabled", true)):
		errors.append("路线章节确认按钮错误禁用")
	var visible_text := str(snapshot.get("visibleText", ""))
	if _contains_player_qa_text(visible_text):
		errors.append("玩家画面泄露测试术语")
	var raw_tokens = fixture.get("rawTokens", [])
	if raw_tokens is Array:
		for raw_token_value in raw_tokens as Array:
			var raw_token := str(raw_token_value)
			if raw_token != "" and visible_text.contains(raw_token):
				errors.append("玩家画面泄露内部标识")
				break


func _append_final_state_errors() -> void:
	var expected_frames := 0
	for chapter_spec in CHAPTER_SPECS:
		expected_frames += int(chapter_spec.get("frames", 0))
	if _chapter_frame_count != expected_frames:
		_errors.append("章节帧数不完整")
	if _actual_left_clicks != 2 or _press_frames != _actual_left_clicks:
		_errors.append("两条路线没有各执行一次跨帧真实左键")
	if not _all_http_requests_disconnected():
		_errors.append("验收结束时仍有 HTTP 请求处于连接状态")
	if PetFusionRecipeCatalogModel.runtime_available(_production_catalog):
		_errors.append("验收期间生产融合目录被打开")
	if bool(_host.profile_save_enabled):
		_errors.append("验收期间 profile save 被重新打开")
	if not (_host.current_account_session as Dictionary).is_empty():
		_errors.append("验收期间创建了账号会话")
	if _visible_player_qa_text_present():
		_errors.append("最终可见画面包含 GM/QA/调试文字")


func _left_click(control: Control, label: String) -> void:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or not (control is Button)
		or (control as Button).disabled
	):
		await _fail("%s不可见或不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	var root_window: Window = _tree.root
	if not root_window.get_visible_rect().has_point(viewport_point):
		await _fail("%s不在1280x720可点击区域内" % label)
		return
	var input_position: Vector2 = (
		root_window.get_screen_transform() * viewport_point
	)
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	await _tree.process_frame
	_transition_frame_count += 1
	var hovered := root_window.gui_get_hovered_control()
	if hovered == null or (
		hovered != control and not control.is_ancestor_of(hovered)
	):
		await _fail(
			"%s指针命中异常：expected=%s hovered=%s"
			% [
				label,
				str(control.get_path()),
				str(hovered.get_path()) if hovered != null else "<none>",
			]
		)
		return
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	Input.parse_input_event(press)
	await _tree.process_frame
	_transition_frame_count += 1
	_press_frames += 1
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	Input.parse_input_event(release)
	await _tree.process_frame
	_transition_frame_count += 1
	_actual_left_clicks += 1


func _hold_frames(frame_count: int) -> void:
	for _frame_index in range(frame_count):
		await _tree.process_frame
		await RenderingServer.frame_post_draw
		_chapter_frame_count += 1


func _report(success: bool) -> Dictionary:
	var expected_frames := 0
	for chapter_spec in CHAPTER_SPECS:
		expected_frames += int(chapter_spec.get("frames", 0))
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"reportType": REPORT_TYPE,
		"result": "PASS" if success else "FAIL",
		"scene": "res://scenes/Main.tscn",
		"entryMode": "MainSceneFlag",
		"realMainSceneInstantiated": (
			_tree != null and _tree.current_scene == _host
		),
		"qaOnlyMainOverlay": true,
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"displayServer": DisplayServer.get_name(),
		"window": {
			"mode": int(_tree.root.mode) if _tree != null else -1,
			"modeName": (
				"windowed"
				if _tree != null and _tree.root.mode == Window.MODE_WINDOWED
				else "other"
			),
			"visible": _tree.root.visible if _tree != null else false,
			"width": _tree.root.size.x if _tree != null else 0,
			"height": _tree.root.size.y if _tree != null else 0,
		},
		"captureFps": CAPTURE_FPS,
		"playbackSpeed": PLAYBACK_SPEED,
		"expectedChapterFrameCount": expected_frames,
		"renderedChapterFrameCount": _chapter_frame_count,
		"transitionFrameCount": _transition_frame_count,
		"actualLeftClicks": _actual_left_clicks,
		"pressFrames": _press_frames,
		"productionRuntimeEnabled": (
			PetFusionRecipeCatalogModel.runtime_available(_production_catalog)
		),
		"playerEntryOpened": false,
		"formalPortraitsRequired": true,
		"secondConfirmationExecuted": _second_confirmation_total() > 0,
		"networkRequestCount": _network_request_total(),
		"profileSaveEnabled": bool(_host.profile_save_enabled) if _host != null else true,
		"accountSessionPresent": (
			not (_host.current_account_session as Dictionary).is_empty()
			if _host != null
			else true
		),
		"backendConnected": not _all_http_requests_disconnected(),
		"qaLane": str(_host.qa_user_data_lane_arg) if _host != null else "",
		"qaLaneFeaturePresent": OS.has_feature(QA_LANE_FEATURE),
		"actualUserDataRoot": _normalized_path(
			ProjectSettings.globalize_path("user://")
		),
		"expectedUserDataRoot": _normalized_path(
			OS.get_environment(QA_LANE_ROOT_ENV)
		),
		"chapters": _chapters,
		"portraitOwnerReviewStatus": "owner_review_pending",
		"ownerReviewStatus": "pending",
		"errors": _errors,
	}


func _report_snapshot(snapshot: Dictionary) -> Dictionary:
	return {
		"closed": bool(snapshot.get("closed", true)),
		"messageText": str(snapshot.get("messageText", "")),
		"targetName": str(snapshot.get("targetNameText", "")),
		"targetFormId": str(snapshot.get("targetFormId", "")),
		"targetPortraitResourcePath": str(
			snapshot.get("targetPortraitResourcePath", "")
		),
		"targetPortraitStatus": str(
			snapshot.get("targetPortraitStatus", "")
		),
		"candidateCount": int(snapshot.get("candidateCount", 0)),
		"candidateFormalPortraitCount": int(
			snapshot.get("candidateFormalPortraitCount", 0)
		),
		"candidatePlaceholderCount": int(
			snapshot.get("candidatePlaceholderCount", 0)
		),
		"quoteValid": bool(snapshot.get("quoteValid", false)),
		"confirmationArmed": bool(
			snapshot.get("confirmationArmed", false)
		),
		"confirmDisabled": bool(snapshot.get("confirmDisabled", true)),
		"buttonText": str(snapshot.get("buttonText", "")),
		"secondConfirmationCount": int(
			snapshot.get("secondConfirmationCount", -1)
		),
		"networkRequestCount": int(
			snapshot.get("networkRequestCount", -1)
		),
	}


func _target_portrait_resource_path() -> String:
	if _panel == null:
		return ""
	var portrait := _panel.get_node_or_null(
		"TargetPortraitFrame/TargetPortrait"
	) as TextureRect
	if portrait == null or portrait.texture == null:
		return ""
	return portrait.texture.resource_path


func _network_request_total() -> int:
	var total := 0
	for chapter in _chapters:
		var snapshot := chapter.get("snapshot", {}) as Dictionary
		total += int(snapshot.get("networkRequestCount", 0))
	return total


func _second_confirmation_total() -> int:
	var total := 0
	for chapter in _chapters:
		var snapshot := chapter.get("snapshot", {}) as Dictionary
		total += int(snapshot.get("secondConfirmationCount", 0))
	return total


func _all_http_requests_disconnected() -> bool:
	if _host == null:
		return false
	for value in _host.find_children("*", "HTTPRequest", true, false):
		if (
			value is HTTPRequest
			and (value as HTTPRequest).get_http_client_status()
				!= HTTPClient.STATUS_DISCONNECTED
		):
			return false
	return true


func _visible_player_qa_text_present() -> bool:
	if _host == null:
		return true
	for value in _host.find_children("*", "Label", true, false):
		if value is Label and (value as Label).is_visible_in_tree():
			if _contains_player_qa_text(str((value as Label).text)):
				return true
	for value in _host.find_children("*", "Button", true, false):
		if value is Button and (value as Button).is_visible_in_tree():
			if _contains_player_qa_text(str((value as Button).text)):
				return true
	return false


static func _contains_player_qa_text(value: String) -> bool:
	var normalized := value.strip_edges().to_lower()
	return (
		"qa" in normalized
		or "debug" in normalized
		or "调试" in normalized
		or "验收" in normalized
		or normalized == "gm"
		or normalized.begins_with("gm/")
	)


func _fail(message: String) -> void:
	if _failed:
		return
	_failed = true
	_errors.append(message)
	if _report_path != "":
		var report := _report(false)
		var write_error := _write_report(_report_path, report)
		if write_error != OK:
			print(
				FAILURE_MARKER
				+ " reason=report_write_failed_%s"
				% error_string(write_error).replace(" ", "_")
			)
	print("%s reason=%s" % [FAILURE_MARKER, message])
	push_error("pet fusion Main owner review failed: %s" % message)
	if _tree != null:
		var tree := _tree
		_release_overlay()
		tree.quit(1)


func _release_overlay() -> void:
	if _layer != null and is_instance_valid(_layer):
		_layer.free()
	_panel = null
	_layer = null


func _drain_main_audio_for_movie_shutdown() -> void:
	# Godot MovieWriter retains an Ogg playback object if an active stream is
	# still referenced when the process quits. Stop the already-recorded town
	# loop, let AudioServer drain it, then free GameAudioManager so its stream
	# cache clears via _exit_tree. The final closed panel remains visible during
	# these four silent drain frames, so the review movie never flashes to Main.
	var timeline = _host.get("battle_audio_timeline_controller")
	if timeline != null and timeline.has_method("end_event"):
		timeline.call("end_event")
	_host.battle_audio_timeline_controller = null
	var manager := _host.get("game_audio_manager") as Node
	if manager == null or not is_instance_valid(manager):
		await _fail("Main 音频管理器不存在，无法安全收口 MovieWriter")
		return
	if not manager.has_method("stop_all"):
		await _fail("Main 音频管理器缺少 stop_all 收口合同")
		return
	manager.call("stop_all")
	for _frame_index in range(2):
		await _tree.process_frame
		await RenderingServer.frame_post_draw
	manager.queue_free()
	for _frame_index in range(2):
		await _tree.process_frame
		await RenderingServer.frame_post_draw
	_host.game_audio_manager = null
	if is_instance_valid(manager):
		await _fail("Main 音频管理器没有在 MovieWriter 退出前释放")


func _validated_report_path(value: String) -> String:
	if value == "" or not value.is_absolute_path():
		return ""
	var normalized := value.simplify_path()
	var evidence_root := ProjectSettings.globalize_path(
		"res://../../.run/evidence"
	).simplify_path()
	if not normalized.begins_with(evidence_root + "/"):
		return ""
	if normalized.get_extension().to_lower() != "json":
		return ""
	return normalized


static func _normalized_path(value: String) -> String:
	var normalized := value.replace("\\", "/").simplify_path()
	while normalized.length() > 1 and normalized.ends_with("/"):
		normalized = normalized.left(normalized.length() - 1)
	return normalized


static func _write_report(path: String, report: Dictionary) -> Error:
	var make_dir_error := DirAccess.make_dir_recursive_absolute(
		path.get_base_dir()
	)
	if make_dir_error != OK:
		return make_dir_error
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(report, "\t", false) + "\n")
	file.close()
	return OK


static func _read_text(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	return file.get_as_text()
