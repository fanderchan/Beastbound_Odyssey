extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapVisualCatalog := preload("res://scripts/world/map_visual_catalog.gd")
const MapVisualRenderer := preload("res://scripts/world/map_visual_renderer.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")

const CAPTURE_FLAG := "--map-visual-review-capture"
const QA_PREVIEW_PREFIX := "--map-art-review-preview="
const ARG_MAP_ID := "--map-visual-review-map-id"
const ARG_OUTPUT := "--map-visual-review-output"
const ARG_REPORT := "--map-visual-review-report"
const ARG_MODE := "--map-visual-review-mode"

const REPORT_SCHEMA_VERSION := 1
const REPORT_TYPE := "beastbound_map_visual_main_review_capture"
const MAIN_SCENE := "res://scenes/Main.tscn"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const VALID_MODES: Array[String] = ["idle", "moving"]
const SETTLE_FRAMES := 10
const COMPLETE_FRAME_ATTEMPTS := 10
const MOVE_FRAME_LIMIT := 240

const VALUE_FLAGS := {
	ARG_MAP_ID: "mapId",
	ARG_OUTPUT: "outputPath",
	ARG_REPORT: "reportPath",
	ARG_MODE: "mode",
}
const REQUIRED_VALUE_FLAGS: Array[String] = [
	ARG_MAP_ID,
	ARG_OUTPUT,
	ARG_REPORT,
	ARG_MODE,
]
const FORBIDDEN_AUTH_PREFIXES: Array[String] = [
	"--login",
	"--server-login",
	"--login-username",
	"--auth-username",
	"--auth-user",
	"--login-password",
	"--auth-password",
	"--auth-pass",
	"--server-url",
	"--auth-server-url",
]

var host


func _init(host_ref) -> void:
	host = host_ref


static func request_from_args(args: PackedStringArray) -> Dictionary:
	var request := {
		"enabled": false,
		"qaPreviewFlagPresent": false,
		"qaPreviewMapId": "",
		"mapId": "",
		"outputPath": "",
		"reportPath": "",
		"mode": "",
		"parseErrors": [],
	}
	var counts: Dictionary = {}
	var capture_count := 0
	var preview_count := 0
	for index in range(args.size()):
		var arg := str(args[index]).strip_edges()
		if _is_forbidden_auth_arg(arg):
			(request["parseErrors"] as Array).append(
				"地图 Main 取证禁止登录凭据或服务器参数：%s" % arg.get_slice("=", 0)
			)
			continue
		if arg == CAPTURE_FLAG:
			capture_count += 1
			continue
		if arg.begins_with(QA_PREVIEW_PREFIX):
			preview_count += 1
			request["qaPreviewMapId"] = arg.substr(QA_PREVIEW_PREFIX.length()).strip_edges()
			continue
		if arg == "--map-art-review-preview":
			(request["parseErrors"] as Array).append(
				"地图 Main 取证必须显式使用 --map-art-review-preview=<mapId>"
			)
			continue
		var handled := false
		for flag_value in VALUE_FLAGS.keys():
			var flag := str(flag_value)
			var value := ""
			if arg == flag:
				value = str(args[index + 1]).strip_edges() if index + 1 < args.size() else ""
				handled = true
			elif arg.begins_with("%s=" % flag):
				value = arg.substr(flag.length() + 1).strip_edges()
				handled = true
			if not handled:
				continue
			counts[flag] = int(counts.get(flag, 0)) + 1
			request[str(VALUE_FLAGS[flag])] = value
			break
		if not handled and arg.begins_with("--"):
			(request["parseErrors"] as Array).append("地图 Main 取证不接受无关参数：%s" % arg)
	request["enabled"] = capture_count == 1
	request["qaPreviewFlagPresent"] = preview_count == 1
	if capture_count != 1:
		(request["parseErrors"] as Array).append("%s 必须且只能出现一次" % CAPTURE_FLAG)
	if preview_count != 1:
		(request["parseErrors"] as Array).append(
			"--map-art-review-preview=<mapId> 必须且只能出现一次"
		)
	for flag in REQUIRED_VALUE_FLAGS:
		if int(counts.get(flag, 0)) != 1:
			(request["parseErrors"] as Array).append("%s 必须且只能出现一次" % flag)
		elif str(request.get(VALUE_FLAGS[flag], "")).strip_edges() == "":
			(request["parseErrors"] as Array).append("%s 不能为空" % flag)
	return request


func run(request: Dictionary) -> Dictionary:
	var report := _base_report(request)
	var errors: Array[String] = _string_array(request.get("parseErrors", []))
	_validate_request(request, errors)
	var report_path := str(request.get("reportPath", "")).strip_edges()
	var output_path := str(request.get("outputPath", "")).strip_edges()
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	_validate_runtime_isolation(request, report, errors)
	var prepared: Dictionary = host.map_visual_render_state
	var map_id := str(request.get("mapId", ""))
	var catalog_errors := MapVisualCatalog.errors_for_map(map_id)
	errors.append_array(catalog_errors)
	report["mapArtActive"] = bool(prepared.get("active", false))
	report["bundleId"] = str(prepared.get("bundleId", ""))
	report["mapStyleId"] = str(prepared.get("mapStyleId", ""))
	report["mapArtStatus"] = str(prepared.get("status", ""))
	report["mapArtQaPreview"] = bool(prepared.get("qaPreview", false))
	report["groundDrawCount"] = MapVisualRenderer.ground_draw_count(prepared)
	report["objectCount"] = MapVisualRenderer.object_draw_count(prepared)
	report["tileCounts"] = (prepared.get("tileCounts", {}) as Dictionary).duplicate(true)
	if not bool(prepared.get("active", false)):
		errors.append("Main 没有启用请求地图的候选美术")
	if not bool(prepared.get("qaPreview", false)):
		errors.append("Main 地图候选美术没有通过显式 QA preview 通道")
	if str(prepared.get("status", "")) != MapVisualCatalog.STATUS_OWNER_REVIEW_PENDING:
		errors.append("地图 Main 取证只接受 owner_review_pending 候选美术")
	if int(report.get("groundDrawCount", 0)) <= 0:
		errors.append("地图候选美术没有真实 ground draw commands")
	if int(report.get("objectCount", 0)) <= 0:
		errors.append("地图候选美术没有独立 scene object draw commands")
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	for _frame_index in range(SETTLE_FRAMES):
		host.queue_redraw()
		await host.get_tree().process_frame
	await RenderingServer.frame_post_draw

	var start_cell := IsoMapModel.world_to_grid(host.map_data, host.player.global_position)
	var end_cell := start_cell
	var target_cell := start_cell
	var mode := str(request.get("mode", ""))
	var input_report := {
		"eventClass": "",
		"delivery": "none",
		"pressProcessFrame": -1,
		"releaseProcessFrame": -1,
		"frameSeparated": false,
		"screenPoint": [],
	}
	if mode == "moving":
		var target := _find_reachable_visible_target(start_cell)
		if target.is_empty():
			errors.append("找不到可由真实鼠标点击到达且不被 UI 遮挡的目标格")
		else:
			target_cell = target.get("cell", start_cell) as Vector2i
			input_report = await _send_real_mouse_click(target.get("screenPoint", Vector2.ZERO) as Vector2)
			var changed := false
			var completed := false
			for _frame_index in range(MOVE_FRAME_LIMIT):
				await host.get_tree().physics_frame
				end_cell = IsoMapModel.world_to_grid(host.map_data, host.player.global_position)
				if end_cell != start_cell:
					changed = true
				if changed and not host.player.is_auto_moving():
					completed = true
					break
			if not bool(input_report.get("frameSeparated", false)):
				errors.append("真实鼠标 press/release 没有跨帧发送")
			if not changed:
				errors.append("真实鼠标点击后 player cell 没有改变")
			if not completed:
				errors.append("真实鼠标移动没有在帧上限内完成")
			if end_cell != target_cell:
				errors.append("真实鼠标移动没有精确到达 targetCell")
			if str(host.current_map_id) != str(request.get("mapId", "")):
				errors.append("真实鼠标移动意外切换了地图")
			if str(host.map_data.get("id", "")) != str(request.get("mapId", "")):
				errors.append("真实鼠标移动后的 map_data.id 与请求不一致")
			if bool(host.has_pending_interaction):
				errors.append("真实鼠标移动结束后仍有 pending interaction")
			if bool(host._dialog_is_open()) or bool(host._world_menu_is_open()):
				errors.append("真实鼠标移动被对话或世界菜单消费")
			if host.encounter_active or host.battle_active:
				errors.append("地图移动取证被战斗/遇敌界面打断")
	else:
		end_cell = IsoMapModel.world_to_grid(host.map_data, host.player.global_position)

	report["startCell"] = _cell_array(start_cell)
	report["targetCell"] = _cell_array(target_cell)
	report["endCell"] = _cell_array(end_cell)
	report["playerCellChanged"] = end_cell != start_cell
	report["input"] = input_report
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	for _frame_index in range(SETTLE_FRAMES):
		host.queue_redraw()
		await host.get_tree().process_frame
	await RenderingServer.frame_post_draw

	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	report["viewport"] = [viewport_size.x, viewport_size.y]
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("Main viewport 必须为 1280x720，实际 %s" % str(viewport_size))
	var screenshot: Image = await _capture_complete_image()
	if screenshot == null:
		errors.append("Metal/viewport 未得到完整稳定画面")
		return _finish_report(report, errors, report_path)
	if screenshot.get_width() != EXPECTED_VIEWPORT.x or screenshot.get_height() != EXPECTED_VIEWPORT.y:
		errors.append("截图不是 1280x720")
		return _finish_report(report, errors, report_path)
	var output_directory_error := DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	if output_directory_error != OK:
		errors.append("无法创建截图目录：%s" % error_string(output_directory_error))
		return _finish_report(report, errors, report_path)
	var save_error := screenshot.save_png(output_path)
	if save_error != OK:
		errors.append("无法保存 Main 地图截图：%s" % error_string(save_error))
		return _finish_report(report, errors, report_path)
	var screenshot_hash := FileAccess.get_sha256(output_path)
	if not _is_sha256(screenshot_hash):
		errors.append("截图 SHA-256 失败")
	var portable_output_path := _portable_output_path(output_path)
	report["screenshotPath"] = portable_output_path
	report["screenshotSha256"] = screenshot_hash
	report["screenshot"] = {
		"path": portable_output_path,
		"sha256": screenshot_hash,
		"width": screenshot.get_width(),
		"height": screenshot.get_height(),
	}
	return _finish_report(report, errors, report_path)


func write_parse_failure(request: Dictionary) -> Dictionary:
	var report := _base_report(request)
	var errors: Array[String] = _string_array(request.get("parseErrors", []))
	_validate_request(request, errors)
	if errors.is_empty():
		errors.append("地图 Main 取证 fail-fast 被错误调用")
	report["networkRequestAttempted"] = false
	return _finish_report(report, errors, str(request.get("reportPath", "")).strip_edges())


func _validate_runtime_isolation(
	request: Dictionary,
	report: Dictionary,
	errors: Array[String]
) -> void:
	var current_scene: Node = host.get_tree().current_scene as Node
	var current_scene_path: String = current_scene.scene_file_path if current_scene != null else ""
	if current_scene != host or current_scene_path != MAIN_SCENE:
		errors.append("地图视觉取证必须运行真实 Main.tscn")
	if not OS.is_debug_build():
		errors.append("地图视觉取证只能在 Godot debug build 运行")
	if DisplayServer.get_name().to_lower() == "headless":
		errors.append("地图视觉取证禁止使用 headless DisplayServer")
	if not bool(host.map_art_review_preview):
		errors.append("Main 没有启用显式地图候选美术预览")
	if bool(host.auth_auto_bypass):
		errors.append("地图视觉取证必须禁用 dev GM auth bypass")
	if bool(host.account_authenticated):
		errors.append("地图视觉取证必须使用无账号的临时默认档案")
	if bool(host.profile_save_enabled):
		errors.append("地图视觉取证必须禁用档案写入")
	if bool(host._is_server_account_session()):
		errors.append("地图视觉取证禁止使用服务端账号会话")
	var default_profile_isolation: bool = host.player_profile == PlayerProgressModel.default_profile()
	report["defaultProfileIsolation"] = default_profile_isolation
	if not default_profile_isolation:
		errors.append("地图视觉取证没有使用独立的 QA 默认档案")
	if str(host.current_map_id) != str(request.get("mapId", "")):
		errors.append("Main 实际地图与请求不一致：%s" % str(host.current_map_id))
	if str(host.map_data.get("id", "")) != str(request.get("mapId", "")):
		errors.append("Main map_data.id 与请求不一致")
	var auth_panel_visible: bool = host.auth_panel != null and host.auth_panel.visible
	var qa_menu_visible: bool = host.qa_menu_button != null and host.qa_menu_button.visible
	var qa_panel_visible: bool = host.qa_panel != null and host.qa_panel.visible
	var numeric_workbench_visible: bool = (
		host.numeric_workbench_panel != null and host.numeric_workbench_panel.visible
	)
	var debug_ui_visible := qa_menu_visible or qa_panel_visible or numeric_workbench_visible
	report["authPanelVisible"] = auth_panel_visible
	report["qaMenuVisible"] = qa_menu_visible
	report["qaPanelVisible"] = qa_panel_visible
	report["numericWorkbenchVisible"] = numeric_workbench_visible
	report["debugUiVisible"] = debug_ui_visible
	report["normalPlayerHud"] = not auth_panel_visible and not debug_ui_visible
	if auth_panel_visible:
		errors.append("地图视觉取证画面不得被登录面板遮挡")
	if debug_ui_visible:
		errors.append("地图视觉取证画面不得显示 QA/GM/agent 调试控件")


func _find_reachable_visible_target(start_cell: Vector2i) -> Dictionary:
	var offsets: Array[Vector2i] = [
		Vector2i(3, -3),
		Vector2i(4, -2),
		Vector2i(2, -4),
		Vector2i(3, 0),
		Vector2i(0, 3),
		Vector2i(-3, 3),
		Vector2i(-4, 2),
		Vector2i(-2, 4),
		Vector2i(2, 2),
		Vector2i(-2, -2),
		Vector2i(1, 0),
		Vector2i(0, 1),
		Vector2i(-1, 0),
		Vector2i(0, -1),
	]
	var viewport_rect := Rect2(Vector2(48, 48), Vector2(EXPECTED_VIEWPORT - Vector2i(96, 96)))
	for offset in offsets:
		var candidate := start_cell + offset
		if not IsoMapModel.is_walkable(host.map_data, candidate):
			continue
		if _near_interaction_source(candidate):
			continue
		var path: Array[Vector2i] = IsoMapModel.find_path(host.map_data, start_cell, candidate)
		if path.size() < 2 or path[0] != start_cell or path[path.size() - 1] != candidate:
			continue
		var screen_point: Vector2 = host._world_to_screen(IsoMapModel.grid_to_world(host.map_data, candidate))
		if not viewport_rect.has_point(screen_point) or host._is_ui_point(screen_point):
			continue
		return {
			"cell": candidate,
			"screenPoint": screen_point,
			"pathLength": path.size(),
		}
	return {}


func _near_interaction_source(candidate: Vector2i) -> bool:
	for value in host.map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var source := _cell((value as Dictionary).get("cell"))
		if maxi(absi(candidate.x - source.x), absi(candidate.y - source.y)) <= 2:
			return true
	return false


func _send_real_mouse_click(screen_point: Vector2) -> Dictionary:
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = screen_point
	press.global_position = screen_point
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame

	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = screen_point
	release.global_position = screen_point
	var release_frame := Engine.get_process_frames()
	Input.parse_input_event(release)
	await host.get_tree().process_frame
	return {
		"eventClass": "InputEventMouseButton",
		"delivery": "Input.parse_input_event",
		"pressProcessFrame": press_frame,
		"releaseProcessFrame": release_frame,
		"frameSeparated": release_frame > press_frame,
		"screenPoint": [screen_point.x, screen_point.y],
	}


func _capture_complete_image() -> Image:
	for _attempt in range(COMPLETE_FRAME_ATTEMPTS):
		host.queue_redraw()
		await host.get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image: Image = host.get_viewport().get_texture().get_image()
		if image == null or image.get_width() != EXPECTED_VIEWPORT.x or image.get_height() != EXPECTED_VIEWPORT.y:
			continue
		var sample_points: Array[Vector2i] = [
			Vector2i(image.get_width() / 10, image.get_height() / 7),
			Vector2i(image.get_width() / 2, image.get_height() / 7),
			Vector2i(image.get_width() * 9 / 10, image.get_height() / 7),
			Vector2i(image.get_width() / 10, image.get_height() * 6 / 7),
			Vector2i(image.get_width() / 2, image.get_height() / 2),
			Vector2i(image.get_width() * 9 / 10, image.get_height() * 6 / 7),
		]
		var complete_samples := 0
		for point in sample_points:
			var sample := image.get_pixel(point.x, point.y)
			if sample.r + sample.g + sample.b > 0.05:
				complete_samples += 1
		if complete_samples >= 5:
			return image
	return null


static func _base_report(request: Dictionary) -> Dictionary:
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"reportType": REPORT_TYPE,
		"scene": MAIN_SCENE,
		"mapId": str(request.get("mapId", "")),
		"mode": str(request.get("mode", "")),
		"qaPreviewFlagPresent": bool(request.get("qaPreviewFlagPresent", false)),
		"qaPreviewMapId": str(request.get("qaPreviewMapId", "")),
		"displayServer": DisplayServer.get_name(),
		"debugBuild": OS.is_debug_build(),
		"profileIsolation": "default_profile_ephemeral_no_save",
		"defaultProfileIsolation": false,
		"authAutoBypass": false,
		"accountAuthenticated": false,
		"profileSaveEnabled": false,
		"serverAccountSession": false,
		"networkRequestAttempted": false,
		"authPanelVisible": false,
		"qaMenuVisible": false,
		"qaPanelVisible": false,
		"numericWorkbenchVisible": false,
		"debugUiVisible": false,
		"normalPlayerHud": false,
		"viewport": [],
		"mapArtActive": false,
		"mapArtQaPreview": false,
		"mapArtStatus": "",
		"bundleId": "",
		"mapStyleId": "",
		"groundDrawCount": 0,
		"objectCount": 0,
		"tileCounts": {},
		"startCell": [],
		"targetCell": [],
		"endCell": [],
		"playerCellChanged": false,
		"input": {},
		"screenshotPath": "",
		"screenshotSha256": "",
		"screenshot": {},
		"errors": [],
		"result": "FAIL",
		"ok": false,
		"generatedAtUtc": "%sZ" % Time.get_datetime_string_from_system(true),
	}


func _finish_report(report: Dictionary, errors: Array[String], report_path: String) -> Dictionary:
	report["authAutoBypass"] = bool(host.auth_auto_bypass) if host != null else false
	report["accountAuthenticated"] = bool(host.account_authenticated) if host != null else false
	report["profileSaveEnabled"] = bool(host.profile_save_enabled) if host != null else false
	report["serverAccountSession"] = bool(host._is_server_account_session()) if host != null else false
	report["errors"] = errors.duplicate()
	report["ok"] = errors.is_empty()
	report["result"] = "PASS" if errors.is_empty() else "FAIL"
	if _can_write_report_path(report_path):
		var directory_error := DirAccess.make_dir_recursive_absolute(report_path.get_base_dir())
		if directory_error != OK:
			report["ok"] = false
			report["result"] = "FAIL"
			(report["errors"] as Array).append("无法创建 report 目录：%s" % error_string(directory_error))
			return report
		var file := FileAccess.open(report_path, FileAccess.WRITE)
		if file == null:
			report["ok"] = false
			report["result"] = "FAIL"
			(report["errors"] as Array).append("无法写入 report：%s" % report_path)
			return report
		file.store_string(JSON.stringify(report, "\t", false) + "\n")
	return report


static func _validate_request(request: Dictionary, errors: Array[String]) -> void:
	if not bool(request.get("enabled", false)):
		errors.append("地图 Main capture flag 未正确解析")
	var map_id := str(request.get("mapId", ""))
	if not _is_safe_id(map_id):
		errors.append("mapId 不是安全的小写稳定 ID：%s" % map_id)
	if not bool(request.get("qaPreviewFlagPresent", false)):
		errors.append("缺少唯一显式 --map-art-review-preview=<mapId>")
	elif str(request.get("qaPreviewMapId", "")) != map_id:
		errors.append("候选美术 preview mapId 与取证 mapId 不一致")
	var mode := str(request.get("mode", ""))
	if not VALID_MODES.has(mode):
		errors.append("mode 必须为 idle 或 moving")
	var output_path := str(request.get("outputPath", ""))
	var report_path := str(request.get("reportPath", ""))
	if not output_path.is_absolute_path() or output_path.get_extension().to_lower() != "png":
		errors.append("output 必须是绝对 PNG 路径")
	if not report_path.is_absolute_path() or report_path.get_extension().to_lower() != "json":
		errors.append("report 必须是绝对 JSON 路径")
	if output_path == report_path:
		errors.append("output 与 report 不能是同一路径")
	if FileAccess.file_exists(output_path):
		errors.append("截图输出已存在，证据目录必须 immutable：%s" % output_path)
	if FileAccess.file_exists(report_path):
		errors.append("report 输出已存在，证据目录必须 immutable：%s" % report_path)


static func _can_write_report_path(path: String) -> bool:
	return path.is_absolute_path() and path.get_extension().to_lower() == "json" and not FileAccess.file_exists(path)


static func _portable_output_path(path: String) -> String:
	var simplified_path := path.simplify_path()
	var project_root := ProjectSettings.globalize_path("res://").simplify_path()
	var project_prefix := project_root + "/"
	if simplified_path.begins_with(project_prefix):
		return "res://" + simplified_path.trim_prefix(project_prefix)
	return simplified_path


static func _is_safe_id(value: String) -> bool:
	if value == "" or value != value.strip_edges() or value.begins_with("_") or value.ends_with("_") or value.contains("__"):
		return false
	for index in range(value.length()):
		if not "abcdefghijklmnopqrstuvwxyz0123456789_".contains(value.substr(index, 1)):
			return false
	return true


static func _is_forbidden_auth_arg(arg: String) -> bool:
	for prefix in FORBIDDEN_AUTH_PREFIXES:
		if arg == prefix or arg.begins_with(prefix + "="):
			return true
	return false


static func _is_sha256(value: String) -> bool:
	if value.length() != 64 or value != value.to_lower():
		return false
	for index in range(value.length()):
		if not "0123456789abcdef".contains(value.substr(index, 1)):
			return false
	return true


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result


static func _cell_array(cell: Vector2i) -> Array[int]:
	return [cell.x, cell.y]


static func _cell(value: Variant) -> Vector2i:
	if not (value is Array) or (value as Array).size() != 2:
		return Vector2i(-9999, -9999)
	return Vector2i(int((value as Array)[0]), int((value as Array)[1]))
