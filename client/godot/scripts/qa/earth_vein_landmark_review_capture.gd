extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapVisualReviewCapture := preload(
	"res://scripts/qa/map_visual_review_capture.gd"
)

const MAIN_SCENE := "res://scenes/Main.tscn"
const MAP_ID := "earth_vein_cave_f4"
const BUNDLE_ID := "earth_vein_cave_visual_v1"
const START_CELL := Vector2i(20, 16)
const TARGET_CELL := Vector2i(22, 11)
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const OUTPUT_ENV := "BEASTBOUND_EARTH_LANDMARK_OUTPUT"
const REPORT_ENV := "BEASTBOUND_EARTH_LANDMARK_REPORT"
const QA_PREVIEW_ARG := "--map-art-review-preview=earth_vein_cave_f4"
const QA_LANE_ARG := "--beastbound-qa-user-data-lane=automation"
const REQUIRED_LANDMARKS: Array[String] = [
	"f4_guardian_plinth",
	"f4_lineage_plinth",
]
const SETTLE_FRAMES := 12
const MOVE_FRAME_LIMIT := 240
const REVIEW_HOLD_FRAMES := 120


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var output_path := OS.get_environment(OUTPUT_ENV).strip_edges()
	var report_path := OS.get_environment(REPORT_ENV).strip_edges()
	_validate_invocation(output_path, report_path, errors)
	if errors.is_empty():
		var scene_error := change_scene_to_file(MAIN_SCENE)
		if scene_error != OK:
			errors.append("无法加载真实 Main.tscn：%s" % error_string(scene_error))
	for _frame_index in range(4):
		await process_frame

	var host = current_scene
	if host == null:
		errors.append("真实 Main.tscn 没有成为 current_scene")
		_finish({}, errors, report_path)
		return
	for _frame_index in range(120):
		if (
			host.player != null
			and not host.map_data.is_empty()
			and str(host.current_map_id) == MAP_ID
			and bool(host.map_visual_render_state.get("active", false))
		):
			break
		await process_frame
	# Generic map preview normally enables the isolated dev-GM identity. This
	# standalone evidence controller is not the built-in capture controller, so
	# close that identity explicitly before any review movement. The process is
	# already inside the owner-attested automation user-data lane; disabling save
	# here also guarantees the disclosed viewpoint never persists even there.
	host.profile_save_enabled = false
	host.account_authenticated = false
	host.auth_auto_bypass = false
	host.auth_request_pending = false
	# `_input` intentionally ignores unauthenticated world clicks unless the
	# process is an explicit map-review capture. Keep auth and persistence closed,
	# but identify this standalone evidence controller through that existing input
	# gate after startup has finished (so the built-in capture runner is not
	# scheduled a second time).
	host.map_visual_review_capture = true

	var report := _base_report(output_path)
	_validate_host(host, report, errors)
	if errors.is_empty():
		host.player.clear_move_target()
		host._clear_navigation_state()
		host.player.global_position = IsoMapModel.grid_to_world(
			host.map_data, START_CELL
		)
		host._update_camera_position(true)
		for _frame_index in range(SETTLE_FRAMES):
			host.queue_redraw()
			await process_frame
		await RenderingServer.frame_post_draw

		var input_report := await _send_real_mouse_click(host, TARGET_CELL)
		report["input"] = input_report
		var end_cell := START_CELL
		var moved := false
		var completed := false
		for _frame_index in range(MOVE_FRAME_LIMIT):
			await physics_frame
			end_cell = IsoMapModel.world_to_grid(
				host.map_data, host.player.global_position
			)
			if end_cell != START_CELL:
				moved = true
			if moved and not host.player.is_auto_moving():
				completed = true
				break
		report["endCell"] = [end_cell.x, end_cell.y]
		report["playerCellChanged"] = moved
		report["movementCompleted"] = completed
		if not bool(input_report.get("frameSeparated", false)):
			errors.append("landmark review 鼠标 press/release 没有跨帧")
		if bool(input_report.get("uiBlocked", true)):
			errors.append("landmark review 目标点被玩家 UI 拦截")
		if not moved or not completed or end_cell != TARGET_CELL:
			errors.append(
				"landmark review 没有精确到达 %s，实际 %s"
				% [str(TARGET_CELL), str(end_cell)]
			)
		if str(host.current_map_id) != MAP_ID:
			errors.append("landmark review 意外切换地图")
		if host.encounter_active or host.battle_active:
			errors.append("landmark review 被战斗或遇敌打断")
		if host.has_pending_interaction:
			errors.append("landmark review 结束后仍有 pending interaction")

		for _frame_index in range(REVIEW_HOLD_FRAMES):
			host.queue_redraw()
			await process_frame
		await RenderingServer.frame_post_draw
		var controller = MapVisualReviewCapture.new(host)
		var screenshot: Image = await controller._capture_complete_image()
		if screenshot == null:
			errors.append("landmark review 没有得到完整稳定画面")
		elif (
			screenshot.get_width() != EXPECTED_VIEWPORT.x
			or screenshot.get_height() != EXPECTED_VIEWPORT.y
		):
			errors.append("landmark review 截图不是 1280x720")
		elif errors.is_empty():
			var directory_error := DirAccess.make_dir_recursive_absolute(
				output_path.get_base_dir()
			)
			if directory_error != OK:
				errors.append("无法创建 landmark screenshot 目录")
			elif screenshot.save_png(output_path) != OK:
				errors.append("无法保存 landmark screenshot")
			else:
				var screenshot_sha := FileAccess.get_sha256(output_path)
				report["screenshotPath"] = output_path
				report["screenshotSha256"] = screenshot_sha
				report["screenshot"] = {
					"path": output_path,
					"sha256": screenshot_sha,
					"width": screenshot.get_width(),
					"height": screenshot.get_height(),
				}
		var cleanup: Dictionary = await controller._drain_capture_runtime()
		report["runtimeCleanup"] = cleanup
		if str(cleanup.get("status", "")) != "passed":
			errors.append("landmark review 运行资源收口失败")

	_finish(report, errors, report_path)


func _validate_invocation(
	output_path: String,
	report_path: String,
	errors: Array[String]
) -> void:
	var args := OS.get_cmdline_user_args()
	if args.count(QA_PREVIEW_ARG) != 1:
		errors.append("landmark review 必须且只能预览岩脉洞穴顶层")
	if args.count(QA_LANE_ARG) != 1:
		errors.append("landmark review 缺少唯一 automation QA lane 参数")
	for arg_value in args:
		var arg := str(arg_value)
		if arg != QA_PREVIEW_ARG and arg != QA_LANE_ARG:
			errors.append("landmark review 不接受无关参数：%s" % arg)
	if not output_path.is_absolute_path() or output_path.get_extension().to_lower() != "png":
		errors.append("landmark output 必须是绝对 PNG 路径")
	if not report_path.is_absolute_path() or report_path.get_extension().to_lower() != "json":
		errors.append("landmark report 必须是绝对 JSON 路径")
	if output_path == report_path:
		errors.append("landmark output/report 不能相同")
	if FileAccess.file_exists(output_path) or FileAccess.file_exists(report_path):
		errors.append("landmark evidence 路径必须 immutable")


func _validate_host(host, report: Dictionary, errors: Array[String]) -> void:
	if host.scene_file_path != MAIN_SCENE:
		errors.append("landmark review 没有运行真实 Main.tscn")
	if DisplayServer.get_name().to_lower() == "headless":
		errors.append("landmark review 禁止 headless DisplayServer")
	if not OS.is_debug_build():
		errors.append("landmark review 只能运行 debug build")
	if str(host.current_map_id) != MAP_ID or str(host.map_data.get("id", "")) != MAP_ID:
		errors.append("landmark review 没有加载岩脉洞穴顶层")
	var prepared: Dictionary = host.map_visual_render_state
	report["bundleId"] = str(prepared.get("bundleId", ""))
	report["mapStyleId"] = str(prepared.get("mapStyleId", ""))
	report["mapArtStatus"] = str(prepared.get("status", ""))
	report["mapArtActive"] = bool(prepared.get("active", false))
	report["mapArtQaPreview"] = bool(prepared.get("qaPreview", false))
	report["mapVisualReviewInputGate"] = bool(host.map_visual_review_capture)
	if (
		report["bundleId"] != BUNDLE_ID
		or report["mapArtStatus"] != "owner_review_pending"
		or not report["mapArtActive"]
		or not report["mapArtQaPreview"]
		or not report["mapVisualReviewInputGate"]
	):
		errors.append("landmark review 没有启用 pending QA candidate")
	if (
		host.account_authenticated
		or host.auth_auto_bypass
		or host.profile_save_enabled
		or host._is_server_account_session()
	):
		errors.append("landmark review 必须使用无认证、无保存临时档案")
	var controller = MapVisualReviewCapture.new(host)
	var network_state: Dictionary = controller._network_request_state()
	report["networkRequestsDisconnected"] = bool(
		network_state.get("allDisconnected", false)
	)
	if not report["networkRequestsDisconnected"]:
		errors.append("landmark review 存在活动网络请求")
	var visible_ids: Array[String] = []
	var by_layer := prepared.get("objectDrawsByLayer", {}) as Dictionary
	for layer_value in by_layer.values():
		if not (layer_value is Array):
			continue
		for command_value in layer_value as Array:
			if command_value is Dictionary:
				visible_ids.append(str((command_value as Dictionary).get("instanceId", "")))
	report["requiredLandmarkInstanceIds"] = REQUIRED_LANDMARKS.duplicate()
	report["preparedObjectInstanceIds"] = visible_ids
	for instance_id in REQUIRED_LANDMARKS:
		if not visible_ids.has(instance_id):
			errors.append("landmark review 缺少场景物件：%s" % instance_id)
	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	report["viewport"] = [viewport_size.x, viewport_size.y]
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("landmark review viewport 必须是 1280x720")


func _send_real_mouse_click(host, target_cell: Vector2i) -> Dictionary:
	var screen_point: Vector2 = host._world_to_screen(
		IsoMapModel.grid_to_world(host.map_data, target_cell)
	)
	var ui_blocked := bool(host._is_ui_point(screen_point))
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * screen_point
	)
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	await process_frame
	await physics_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	Input.parse_input_event(release)
	await process_frame
	return {
		"eventClass": "InputEventMouseButton",
		"delivery": "Input.parse_input_event",
		"pressProcessFrame": press_frame,
		"releaseProcessFrame": release_frame,
		"frameSeparated": release_frame > press_frame,
		"screenPoint": [screen_point.x, screen_point.y],
		"inputPosition": [input_position.x, input_position.y],
		"uiBlocked": ui_blocked,
	}


func _base_report(output_path: String) -> Dictionary:
	return {
		"schemaVersion": 1,
		"reportType": "beastbound_map_visual_landmark_review_capture",
		"generatedAtUtc": "%sZ" % Time.get_datetime_string_from_system(true),
		"scene": MAIN_SCENE,
		"mapId": MAP_ID,
		"bundleId": "",
		"mapStyleId": "",
		"mapArtStatus": "",
		"mapArtActive": false,
		"mapArtQaPreview": false,
		"displayServer": DisplayServer.get_name(),
		"debugBuild": OS.is_debug_build(),
		"viewport": [],
		"profileIsolation": "automation_lane_ephemeral_no_save_before_review_movement",
		"reviewIsolationOverride": true,
		"networkRequestsDisconnected": false,
		"reviewOnlyViewpointReposition": true,
		"originalSpawnCell": [5, 22],
		"startCell": [START_CELL.x, START_CELL.y],
		"targetCell": [TARGET_CELL.x, TARGET_CELL.y],
		"endCell": [],
		"playerCellChanged": false,
		"movementCompleted": false,
		"input": {},
		"requiredLandmarkInstanceIds": [],
		"preparedObjectInstanceIds": [],
		"screenshotPath": output_path,
		"screenshotSha256": "",
		"screenshot": {},
		"runtimeCleanup": {},
		"errors": [],
		"result": "FAIL",
		"ok": false,
	}


func _finish(
	report: Dictionary,
	errors: Array[String],
	report_path: String
) -> void:
	report["errors"] = errors.duplicate()
	report["ok"] = errors.is_empty()
	report["result"] = "PASS" if errors.is_empty() else "FAIL"
	if report_path.is_absolute_path() and report_path.get_extension().to_lower() == "json":
		DirAccess.make_dir_recursive_absolute(report_path.get_base_dir())
		var file := FileAccess.open(report_path, FileAccess.WRITE)
		if file != null:
			file.store_string(JSON.stringify(report, "\t", false) + "\n")
	print("earth vein landmark review capture: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)
