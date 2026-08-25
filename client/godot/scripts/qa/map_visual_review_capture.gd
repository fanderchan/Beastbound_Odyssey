extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const MapVisualCatalog := preload("res://scripts/world/map_visual_catalog.gd")
const MapVisualRenderer := preload("res://scripts/world/map_visual_renderer.gd")
const WorldCameraSafeAreaModel := preload(
	"res://scripts/world/world_camera_safe_area_model.gd"
)
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const ShowcaseProfile := preload(
	"res://scripts/qa/map_visual_review_showcase_profile.gd"
)
const RuntimeExitCleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")

const CAPTURE_FLAG := "--map-visual-review-capture"
const SHOWCASE_PROFILE_FLAG := "--map-visual-review-showcase-profile"
const QA_PREVIEW_PREFIX := "--map-art-review-preview="
const ARG_MAP_ID := "--map-visual-review-map-id"
const ARG_OUTPUT := "--map-visual-review-output"
const ARG_REPORT := "--map-visual-review-report"
const ARG_MODE := "--map-visual-review-mode"
const ARG_CAPTURE_VARIANT := "--map-visual-review-capture-variant"
const QA_USER_DATA_LANE_PREFIX := "--beastbound-qa-user-data-lane="

const REPORT_SCHEMA_VERSION := 1
const REPORT_TYPE := "beastbound_map_visual_main_review_capture"
const MAIN_SCENE := "res://scenes/Main.tscn"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const VALID_MODES: Array[String] = ["idle", "moving"]
const VALID_CAPTURE_VARIANTS: Array[String] = [
	"default",
	"pointer",
	"movement_path",
	"warp",
	"collision",
	"occlusion",
]
const MOVING_CAPTURE_VARIANTS: Array[String] = [
	"movement_path",
	"warp",
	"collision",
	"occlusion",
]
const SETTLE_FRAMES := 10
const COMPLETE_FRAME_ATTEMPTS := 10
const HUD_GLYPH_STABILITY_FRAME_COUNT := 6
const MOVE_FRAME_LIMIT := 240
const FIREBUD_BUNDLE_ID := "firebud_region_visual_v2"
const FIREBUD_VILLAGE_SAFE_NPC_MIN := 4
const FIREBUD_VILLAGE_SAFE_NPC_MAX := 7
const HUD_GLYPH_REGIONS := {
	"tabs": {
		"rect": Rect2i(1020, 136, 166, 24),
		"minimumEdgeEnergy": 25000,
		"meaning": "任务/组队页签字形",
	},
	"title": {
		"rect": Rect2i(1020, 193, 90, 25),
		"minimumEdgeEnergy": 15000,
		"meaning": "任务追踪标题字形",
	},
	"body": {
		"rect": Rect2i(1027, 225, 148, 200),
		"minimumEdgeEnergy": 200000,
		"meaning": "任务条目标题与正文",
	},
	"routeButton": {
		"rect": Rect2i(1068, 453, 70, 19),
		"minimumEdgeEnergy": 7000,
		"meaning": "自动寻路按钮字形",
	},
}
const TASK_HUD_PIXEL_CROP := Rect2i(999, 121, 206, 401)
const VALUE_FLAGS := {
	ARG_MAP_ID: "mapId",
	ARG_OUTPUT: "outputPath",
	ARG_REPORT: "reportPath",
	ARG_MODE: "mode",
	ARG_CAPTURE_VARIANT: "captureVariant",
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
const NETWORK_REQUEST_NAMES: Array[String] = [
	"auth_http_request",
	"profile_sync_http_request",
	"chat_http_request",
	"mailbox_http_request",
	"market_http_request",
	"bank_http_request",
	"party_http_request",
	"party_invite_http_request",
	"family_http_request",
	"online_position_http_request",
	"player_action_http_request",
	"battle_invite_http_request",
]

var host


func _init(host_ref) -> void:
	host = host_ref


static func request_from_args(args: PackedStringArray) -> Dictionary:
	var request := {
		"enabled": false,
		"qaPreviewFlagPresent": false,
		"qaPreviewMapId": "",
		"showcaseProfileRequested": false,
		"mapId": "",
		"outputPath": "",
		"reportPath": "",
		"mode": "",
		"captureVariant": "default",
		"parseErrors": [],
	}
	var counts: Dictionary = {}
	var capture_count := 0
	var preview_count := 0
	var showcase_profile_count := 0
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
		if arg == SHOWCASE_PROFILE_FLAG:
			showcase_profile_count += 1
			continue
		if arg.begins_with(QA_USER_DATA_LANE_PREFIX):
			# Main performs the exact owner-attested lane validation before any
			# runtime bootstrap. The focused parser only needs to avoid treating
			# that mandatory global safety marker as an unrelated capture flag.
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
	request["showcaseProfileRequested"] = showcase_profile_count == 1
	if capture_count != 1:
		(request["parseErrors"] as Array).append("%s 必须且只能出现一次" % CAPTURE_FLAG)
	if preview_count != 1:
		(request["parseErrors"] as Array).append(
			"--map-art-review-preview=<mapId> 必须且只能出现一次"
		)
	if showcase_profile_count > 1:
		(request["parseErrors"] as Array).append(
			"%s 最多只能出现一次" % SHOWCASE_PROFILE_FLAG
		)
	for flag in REQUIRED_VALUE_FLAGS:
		if int(counts.get(flag, 0)) != 1:
			(request["parseErrors"] as Array).append("%s 必须且只能出现一次" % flag)
		elif str(request.get(VALUE_FLAGS[flag], "")).strip_edges() == "":
			(request["parseErrors"] as Array).append("%s 不能为空" % flag)
	var capture_variant_count := int(counts.get(ARG_CAPTURE_VARIANT, 0))
	if capture_variant_count > 1:
		(request["parseErrors"] as Array).append(
			"%s 最多只能出现一次" % ARG_CAPTURE_VARIANT
		)
	elif capture_variant_count == 1:
		var capture_variant := str(request.get("captureVariant", "")).strip_edges()
		if not VALID_CAPTURE_VARIANTS.has(capture_variant):
			(request["parseErrors"] as Array).append(
				"%s 必须是固定动作变体" % ARG_CAPTURE_VARIANT
			)
	return request


func run(request: Dictionary) -> Dictionary:
	var report := _base_report(request)
	var errors: Array[String] = _string_array(request.get("parseErrors", []))
	_validate_request(request, errors)
	var report_path := str(request.get("reportPath", "")).strip_edges()
	var output_path := str(request.get("outputPath", "")).strip_edges()
	if not errors.is_empty():
		return await _finish_capture(report, errors, report_path)

	_validate_runtime_isolation(request, report, errors)
	var initial_network_state := _network_request_state()
	report["networkRequestStatuses"] = initial_network_state.get("statuses", {})
	report["networkRequestsDisconnected"] = bool(
		initial_network_state.get("allDisconnected", false)
	)
	if not bool(initial_network_state.get("allDisconnected", false)):
		var active_requests: Array[String] = _string_array(
			initial_network_state.get("active", [])
		)
		errors.append(
			"地图视觉取证运行时存在活动网络请求：%s"
			% ",".join(active_requests)
		)
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
	if errors.is_empty() and bool(request.get("showcaseProfileRequested", false)):
		_apply_showcase_profile(request, prepared, report, errors)
	if not errors.is_empty():
		return await _finish_capture(report, errors, report_path)

	for _frame_index in range(SETTLE_FRAMES):
		host.queue_redraw()
		await host.get_tree().process_frame
	await RenderingServer.frame_post_draw

	var start_cell := IsoMapModel.world_to_grid(host.map_data, host.player.global_position)
	var end_cell := start_cell
	var target_cell := start_cell
	var mode := str(request.get("mode", ""))
	var capture_variant := str(request.get("captureVariant", "default"))
	var input_report := {
		"eventClass": "",
		"delivery": "none",
		"pressProcessFrame": -1,
		"releaseProcessFrame": -1,
		"frameSeparated": false,
		"screenPoint": [],
	}
	if mode == "moving":
		var target := _find_reachable_visible_target(
			start_cell,
			capture_variant
		)
		if target.is_empty():
			errors.append("找不到可由真实鼠标点击到达且不被 UI 遮挡的目标格")
		else:
			report["targetCandidateCount"] = int(target.get("candidateCount", 0))
			report["targetVariantIndex"] = int(target.get("variantIndex", -1))
			report["targetClearance"] = str(target.get("clearance", ""))
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
		return await _finish_capture(report, errors, report_path)

	for _frame_index in range(SETTLE_FRAMES):
		host.queue_redraw()
		await host.get_tree().process_frame
	await RenderingServer.frame_post_draw

	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	report["viewport"] = [viewport_size.x, viewport_size.y]
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("Main viewport 必须为 1280x720，实际 %s" % str(viewport_size))
	var camera_composition := _camera_composition_report()
	report["cameraComposition"] = camera_composition
	if not bool(camera_composition.get("taskHudVisible", false)):
		errors.append("地图安全区取证不得隐藏右侧任务 HUD")
	if not bool(camera_composition.get("bottomHudVisible", false)):
		errors.append("地图安全区取证不得隐藏正常底栏 HUD")
	if not bool(camera_composition.get("playerInsideSafeRect", false)):
		errors.append("玩家没有落在 World HUD 安全区内")
	if not bool(camera_composition.get("playerClearOfTaskHud", false)):
		errors.append("玩家与右侧任务 HUD 相交")
	if not bool(camera_composition.get("playerClearOfFixedHud", false)):
		errors.append("玩家与固定 World HUD 相交")
	if not bool(camera_composition.get("playerAtEffectiveAnchor", false)):
		errors.append("玩家实际屏幕位置没有收敛到动态地标安全锚点")
	var overlapping_objects := camera_composition.get(
		"taskHudOverlappingBlockingObjectIds",
		[]
	) as Array
	if not overlapping_objects.is_empty():
		errors.append(
			"右侧任务 HUD 覆盖 blocking/interaction 地图物件：%s"
			% ",".join(_string_array(overlapping_objects))
		)
	var overlapping_npcs := camera_composition.get(
		"hudOverlappingNpcIds",
		[]
	) as Array
	var requires_village_local_alpha_gate := (
		str(prepared.get("bundleId", "")) == "firebud_region_visual_v2"
		and map_id == "firebud_village_gate"
		and capture_variant in ["default", "pointer"]
	)
	var overlapping_key_environment := camera_composition.get(
		"hudOverlappingKeyEnvironmentIds",
		[]
	) as Array
	if str(prepared.get("bundleId", "")) == "firebud_region_visual_v2":
		var configured_anchor := camera_composition.get("configuredAnchor", []) as Array
		if (
			configured_anchor.size() != 2
			or absf(float(configured_anchor[0]) - 390.0) > 0.5
			or absf(float(configured_anchor[1]) - 360.0) > 0.5
		):
			errors.append("Firebud v2 1280x720 没有应用冻结的 40/60 安全锚点")
		if map_id == "firebud_village_gate":
			if int(camera_composition.get("npcAlphaSubjectCount", 0)) != 14:
				errors.append("村口完整 NPC alpha 门禁没有覆盖全部 14 名 NPC")
			if int(camera_composition.get("keyEnvironmentSubjectCount", 0)) != 7:
				errors.append("村口关键环境 alpha 门禁没有覆盖冻结的 7 个物件")
			if requires_village_local_alpha_gate:
				var safe_npc_count := int(camera_composition.get("safeNpcCount", 0))
				if (
					safe_npc_count < FIREBUD_VILLAGE_SAFE_NPC_MIN
					or safe_npc_count > FIREBUD_VILLAGE_SAFE_NPC_MAX
				):
					errors.append(
						"村口首屏安全世界带 NPC 密度越界：expected=%d..%d actual=%d"
						% [
							FIREBUD_VILLAGE_SAFE_NPC_MIN,
							FIREBUD_VILLAGE_SAFE_NPC_MAX,
							safe_npc_count,
						]
					)
				var unsafe_safe_npcs: Array[String] = []
				for npc_id in _string_array(camera_composition.get("safeNpcIds", [])):
					if overlapping_npcs.has(npc_id):
						unsafe_safe_npcs.append(npc_id)
				if not unsafe_safe_npcs.is_empty():
					errors.append(
						"安全世界带 NPC 完整 alpha 被固定 HUD 覆盖：%s"
						% ",".join(unsafe_safe_npcs)
					)
				var unsafe_safe_environment: Array[String] = []
				for object_id in _string_array(
					camera_composition.get("safeKeyEnvironmentIds", [])
				):
					if overlapping_key_environment.has(object_id):
						unsafe_safe_environment.append(object_id)
				if not unsafe_safe_environment.is_empty():
					errors.append(
						"安全世界带关键环境完整 alpha 被固定 HUD 覆盖：%s"
						% ",".join(unsafe_safe_environment)
					)
				var clipped_safe_npcs: Array[String] = []
				for npc_id in _string_array(camera_composition.get("safeNpcIds", [])):
					if _string_array(
						camera_composition.get("viewportClippedNpcIds", [])
					).has(npc_id):
						clipped_safe_npcs.append(npc_id)
				if not clipped_safe_npcs.is_empty():
					errors.append(
						"安全世界带 NPC 完整 alpha 被视口边缘裁切：%s"
						% ",".join(clipped_safe_npcs)
					)
				var clipped_safe_environment: Array[String] = []
				for object_id in _string_array(
					camera_composition.get("safeKeyEnvironmentIds", [])
				):
					if _string_array(
						camera_composition.get("viewportClippedKeyEnvironmentIds", [])
					).has(object_id):
						clipped_safe_environment.append(object_id)
				if not clipped_safe_environment.is_empty():
					errors.append(
						"安全世界带关键环境完整 alpha 被视口边缘裁切：%s"
						% ",".join(clipped_safe_environment)
					)
				var nearby_warp := camera_composition.get("nearestWarp", {}) as Dictionary
				if (
					str(nearby_warp.get("id", "")) != "warp_to_training_yard"
					or not bool(nearby_warp.get("edgeClear", false))
				):
					errors.append("村口相邻圆形 warp 地标被屏幕边缘裁切")
	var hud_glyph_capture := await _capture_hud_glyph_stability_sequence(
		str(prepared.get("bundleId", ""))
	)
	var screenshot: Image = hud_glyph_capture.get("image") as Image
	var hud_glyph_report := hud_glyph_capture.duplicate(true)
	hud_glyph_report.erase("image")
	report["hudGlyphStability"] = hud_glyph_report
	if str(hud_glyph_report.get("status", "failed")) == "failed":
		errors.append_array(_string_array(hud_glyph_report.get("errors", [])))
	if screenshot == null:
		if errors.is_empty():
			errors.append("Metal/viewport 未得到完整稳定画面")
		return await _finish_capture(report, errors, report_path)
	if screenshot.get_width() != EXPECTED_VIEWPORT.x or screenshot.get_height() != EXPECTED_VIEWPORT.y:
		errors.append("截图不是 1280x720")
		return await _finish_capture(report, errors, report_path)
	var output_directory_error := DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	if output_directory_error != OK:
		errors.append("无法创建截图目录：%s" % error_string(output_directory_error))
		return await _finish_capture(report, errors, report_path)
	var save_error := screenshot.save_png(output_path)
	if save_error != OK:
		errors.append("无法保存 Main 地图截图：%s" % error_string(save_error))
		return await _finish_capture(report, errors, report_path)
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
	return await _finish_capture(report, errors, report_path)


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


func _apply_showcase_profile(
	request: Dictionary,
	prepared: Dictionary,
	report: Dictionary,
	errors: Array[String]
) -> void:
	var map_id := str(request.get("mapId", ""))
	var bundle_id := str(prepared.get("bundleId", ""))
	if not ShowcaseProfile.context_allowed(map_id, bundle_id):
		errors.append(
			"内存展示档案只允许 Phase383 Firebud v2 owner-review capture"
		)
		return
	if not bool(report.get("defaultProfileIsolation", false)):
		errors.append("内存展示档案注入前没有先通过默认档案隔离验证")
		return
	if bool(host.account_authenticated) or bool(host.auth_auto_bypass):
		errors.append("内存展示档案注入前认证状态不安全")
		return
	if bool(host.profile_save_enabled) or bool(host._is_server_account_session()):
		errors.append("内存展示档案注入前仍连接存档或服务端会话")
		return

	var showcase_profile := ShowcaseProfile.build()
	var profile_errors := ShowcaseProfile.errors_for(showcase_profile)
	if not profile_errors.is_empty():
		errors.append_array(profile_errors)
		return
	host.player_profile = showcase_profile
	if host.has_method("_sync_player_mount_visual_if_needed"):
		host.call("_sync_player_mount_visual_if_needed", true)
	if host.has_method("_mark_progress_ui_caches_dirty"):
		host.call("_mark_progress_ui_caches_dirty")
	if host.has_method("_update_hud_text"):
		host.call("_update_hud_text", true)
	if host.has_method("_layout_hud"):
		host.call("_layout_hud")
	host.queue_redraw()

	var player_value = showcase_profile.get("player", {})
	var player := player_value as Dictionary if player_value is Dictionary else {}
	var active_pet := PlayerProgressModel.pet_instance_by_id(
		showcase_profile,
		ShowcaseProfile.ACTIVE_PET_INSTANCE_ID
	)
	var active_pet_form_id := str(
		active_pet.get("formId", active_pet.get("templateId", ""))
	)
	var in_memory_applied: bool = host.player_profile == showcase_profile
	var post_injection_is_default: bool = (
		host.player_profile == PlayerProgressModel.default_profile()
	)
	report["profileIsolation"] = (
		"default_profile_verified_then_showcase_ephemeral_no_save"
	)
	report["showcaseProfileInMemory"] = in_memory_applied
	report["showcaseProfilePostInjectionIsDefault"] = post_injection_is_default
	report["showcaseProfileId"] = ShowcaseProfile.PROFILE_ID
	report["showcasePlayerAppearanceId"] = str(player.get("appearanceId", ""))
	report["showcaseActivePetFormId"] = active_pet_form_id
	report["showcaseProfilePersisted"] = false
	var network_state := _network_request_state()
	report["networkRequestStatuses"] = network_state.get("statuses", {})
	report["networkRequestsDisconnected"] = bool(
		network_state.get("allDisconnected", false)
	)
	if not in_memory_applied or post_injection_is_default:
		errors.append("Phase383 内存展示档案没有稳定应用到 Main")
	if bool(host.account_authenticated) or bool(host.auth_auto_bypass):
		errors.append("Phase383 内存展示档案错误启用了认证或 GM bypass")
	if bool(host.profile_save_enabled) or bool(host._is_server_account_session()):
		errors.append("Phase383 内存展示档案错误启用了存档或服务端会话")
	if not bool(network_state.get("allDisconnected", false)):
		var active_requests: Array[String] = _string_array(
			network_state.get("active", [])
		)
		errors.append(
			"Phase383 内存展示档案运行时存在活动网络请求：%s"
			% ",".join(active_requests)
		)


func _network_request_state() -> Dictionary:
	var statuses := {}
	var active: Array[String] = []
	for request_name in NETWORK_REQUEST_NAMES:
		var value = host.get(request_name)
		if not (value is HTTPRequest):
			continue
		var request := value as HTTPRequest
		var status := request.get_http_client_status()
		statuses[request_name] = status
		if status != HTTPClient.STATUS_DISCONNECTED:
			active.append(request_name)
	return {
		"statuses": statuses,
		"active": active,
		"allDisconnected": active.is_empty(),
	}


func _camera_composition_report() -> Dictionary:
	var safe_rect: Rect2 = host.world_camera_safe_viewport_rect
	var configured_anchor: Vector2 = host.world_camera_safe_anchor_screen
	var effective_anchor: Vector2 = host._world_camera_anchor(
		host.get_viewport_rect().size
	)
	var player_screen: Vector2 = host._world_to_screen(host.player.global_position)
	var task_hud: Control = host.side_panel as Control
	var task_hud_visible := task_hud != null and task_hud.is_visible_in_tree()
	var task_hud_rect := task_hud.get_global_rect() if task_hud_visible else Rect2()
	var bottom_hud: Control = host.action_bar as Control
	var bottom_hud_visible := bottom_hud != null and bottom_hud.is_visible_in_tree()
	var bottom_hud_rect := bottom_hud.get_global_rect() if bottom_hud_visible else Rect2()
	var top_hud: Control = host.top_panel as Control
	var top_hud_visible := top_hud != null and top_hud.is_visible_in_tree()
	var top_hud_rect := top_hud.get_global_rect() if top_hud_visible else Rect2()
	var message_hud: Control = host.battle_message_panel as Control
	var message_hud_visible := message_hud != null and message_hud.is_visible_in_tree()
	var message_hud_rect := message_hud.get_global_rect() if message_hud_visible else Rect2()
	var player_probe := Rect2(player_screen - Vector2(34.0, 48.0), Vector2(68.0, 96.0))
	var fixed_hud_rects: Array[Rect2] = []
	for rect in host.world_camera_hud_blocker_rects:
		if rect.size.x > 0.0 and rect.size.y > 0.0:
			fixed_hud_rects.append(rect)
	var opaque_rect_cache: Dictionary = {}
	var npc_commands: Array[Dictionary] = host._world_depth_npc_commands()
	var npc_subject_report := _composition_subject_report(
		npc_commands,
		safe_rect,
		fixed_hud_rects,
		task_hud_rect,
		task_hud_visible,
		opaque_rect_cache
	)
	var key_environment_commands: Array[Dictionary] = []
	var by_layer := host.map_visual_render_state.get("objectDrawsByLayer", {}) as Dictionary
	for layer_value in by_layer.values():
		if not (layer_value is Array):
			continue
		for command_value in layer_value as Array:
			if not (command_value is Dictionary):
				continue
			var command := command_value as Dictionary
			var collision_role := str(command.get("collisionRole", ""))
			if collision_role != "blocking" and collision_role != "interaction":
				continue
			key_environment_commands.append(command)
	var key_environment_report := _composition_subject_report(
		key_environment_commands,
		safe_rect,
		fixed_hud_rects,
		task_hud_rect,
		task_hud_visible,
		opaque_rect_cache
	)
	var nearest_warp := {}
	var nearest_warp_distance := INF
	for interaction_value in host.map_data.get("interactionPoints", []):
		if not (interaction_value is Dictionary):
			continue
		var interaction := interaction_value as Dictionary
		if str(interaction.get("kind", "")) != "warp":
			continue
		var cell_value := interaction.get("cell", []) as Array
		if cell_value.size() != 2:
			continue
		var cell := Vector2i(int(cell_value[0]), int(cell_value[1]))
		var world_point: Vector2 = InteractionModel.marker_world_position(
			host.map_data,
			interaction
		)
		var distance: float = host.player.global_position.distance_to(world_point)
		if distance >= nearest_warp_distance:
			continue
		nearest_warp_distance = distance
		var screen_point: Vector2 = host._world_to_screen(world_point)
		nearest_warp = {
			"id": str(interaction.get("id", "")),
			"cell": [cell.x, cell.y],
			"screenPoint": [screen_point.x, screen_point.y],
			"edgeClear": Rect2(Vector2(24.0, 24.0), Vector2(1232.0, 672.0)).has_point(
				screen_point
			),
			"insideSafeRect": safe_rect.has_point(screen_point),
		}
	return {
		"safeRect": [safe_rect.position.x, safe_rect.position.y, safe_rect.size.x, safe_rect.size.y],
		"configuredAnchor": [configured_anchor.x, configured_anchor.y],
		"effectiveAnchor": [effective_anchor.x, effective_anchor.y],
		"playerScreenPoint": [player_screen.x, player_screen.y],
		"playerAtEffectiveAnchor": player_screen.distance_to(effective_anchor) <= 8.0,
		"taskHudVisible": task_hud_visible,
		"taskHudRect": [task_hud_rect.position.x, task_hud_rect.position.y, task_hud_rect.size.x, task_hud_rect.size.y],
		"bottomHudVisible": bottom_hud_visible,
		"bottomHudRect": [bottom_hud_rect.position.x, bottom_hud_rect.position.y, bottom_hud_rect.size.x, bottom_hud_rect.size.y],
		"topHudVisible": top_hud_visible,
		"topHudRect": [top_hud_rect.position.x, top_hud_rect.position.y, top_hud_rect.size.x, top_hud_rect.size.y],
		"messageHudVisible": message_hud_visible,
		"messageHudRect": [message_hud_rect.position.x, message_hud_rect.position.y, message_hud_rect.size.x, message_hud_rect.size.y],
		"fixedHudBlockerCount": fixed_hud_rects.size(),
		"playerInsideSafeRect": safe_rect.has_point(player_screen),
		"playerClearOfTaskHud": not task_hud_visible or not task_hud_rect.intersects(player_probe),
		"playerClearOfFixedHud": _rect_clear_of_rects(player_probe, fixed_hud_rects),
		"taskHudOverlappingBlockingObjectIds": key_environment_report.get("taskOverlapIds", []),
		"npcAlphaSubjectCount": int(npc_subject_report.get("subjectCount", 0)),
		"visibleNpcCount": int(npc_subject_report.get("visibleCount", 0)),
		"visibleNpcIds": npc_subject_report.get("visibleIds", []),
		"safeNpcCount": int(npc_subject_report.get("safeCount", 0)),
		"safeNpcIds": npc_subject_report.get("safeIds", []),
		"npcAlphaScreenRects": npc_subject_report.get("screenRects", {}),
		"hudOverlappingNpcIds": npc_subject_report.get("hudOverlapIds", []),
		"viewportClippedNpcIds": npc_subject_report.get("viewportClippedIds", []),
		"keyEnvironmentSubjectCount": int(key_environment_report.get("subjectCount", 0)),
		"visibleKeyEnvironmentCount": int(key_environment_report.get("visibleCount", 0)),
		"visibleKeyEnvironmentIds": key_environment_report.get("visibleIds", []),
		"safeKeyEnvironmentCount": int(key_environment_report.get("safeCount", 0)),
		"safeKeyEnvironmentIds": key_environment_report.get("safeIds", []),
		"keyEnvironmentAlphaScreenRects": key_environment_report.get("screenRects", {}),
		"hudOverlappingKeyEnvironmentIds": key_environment_report.get("hudOverlapIds", []),
		"viewportClippedKeyEnvironmentIds": key_environment_report.get("viewportClippedIds", []),
		"nearestWarp": nearest_warp,
	}


func _composition_subject_report(
	commands: Array[Dictionary],
	composition_safe_rect: Rect2,
	fixed_hud_rects: Array[Rect2],
	task_hud_rect: Rect2,
	task_hud_visible: bool,
	opaque_rect_cache: Dictionary
) -> Dictionary:
	var viewport_rect := Rect2(Vector2.ZERO, host.get_viewport_rect().size)
	var edge_safe_rect := viewport_rect.grow(-WorldCameraSafeAreaModel.DEFAULT_VISUAL_GAP_PX)
	var subject_count := 0
	var visible_ids: Array[String] = []
	var safe_ids: Array[String] = []
	var hud_overlap_ids: Array[String] = []
	var task_overlap_ids: Array[String] = []
	var viewport_clipped_ids: Array[String] = []
	var screen_rects: Dictionary = {}
	for command in commands:
		var visual_world_rect := _command_opaque_world_rect(command, opaque_rect_cache)
		if visual_world_rect.size.x <= 0.0 or visual_world_rect.size.y <= 0.0:
			continue
		subject_count += 1
		var subject_id := str(command.get(
			"stableId",
			command.get("instanceId", command.get("objectId", ""))
		)).strip_edges()
		if subject_id.begins_with("npc:"):
			subject_id = subject_id.trim_prefix("npc:")
		var screen_start: Vector2 = host._world_to_screen(visual_world_rect.position)
		var screen_end: Vector2 = host._world_to_screen(visual_world_rect.end)
		var screen_rect := Rect2(
			Vector2(minf(screen_start.x, screen_end.x), minf(screen_start.y, screen_end.y)),
			Vector2(absf(screen_end.x - screen_start.x), absf(screen_end.y - screen_start.y))
		)
		screen_rects[subject_id] = [
			screen_rect.position.x,
			screen_rect.position.y,
			screen_rect.size.x,
			screen_rect.size.y,
		]
		if not viewport_rect.intersects(screen_rect):
			continue
		visible_ids.append(subject_id)
		if composition_safe_rect.encloses(screen_rect):
			safe_ids.append(subject_id)
		if not edge_safe_rect.encloses(screen_rect):
			viewport_clipped_ids.append(subject_id)
		if task_hud_visible and task_hud_rect.intersects(screen_rect):
			task_overlap_ids.append(subject_id)
		for blocker in fixed_hud_rects:
			if blocker.intersects(screen_rect):
				hud_overlap_ids.append(subject_id)
				break
	visible_ids.sort()
	safe_ids.sort()
	hud_overlap_ids.sort()
	task_overlap_ids.sort()
	viewport_clipped_ids.sort()
	return {
		"subjectCount": subject_count,
		"visibleCount": visible_ids.size(),
		"visibleIds": visible_ids,
		"safeCount": safe_ids.size(),
		"safeIds": safe_ids,
		"hudOverlapIds": hud_overlap_ids,
		"taskOverlapIds": task_overlap_ids,
		"viewportClippedIds": viewport_clipped_ids,
		"screenRects": screen_rects,
	}


static func _rect_clear_of_rects(probe: Rect2, blockers: Array[Rect2]) -> bool:
	for blocker in blockers:
		if blocker.intersects(probe):
			return false
	return true


static func _command_opaque_world_rect(
	command: Dictionary,
	opaque_rect_cache: Dictionary
) -> Rect2:
	return WorldCameraSafeAreaModel.opaque_world_rect(command, opaque_rect_cache)


func _find_reachable_visible_target(
	start_cell: Vector2i,
	capture_variant: String = "default"
) -> Dictionary:
	var offsets: Array[Vector2i] = [
		# The training-yard spawn is intentionally framed by NPCs and props. These
		# central offsets provide several genuinely clickable destinations while
		# retaining the two-cell visual-collision safety margin below. Keeping the
		# choices distinct also prevents the formal action matrix from freezing the
		# same moving frame for movement, warp, collision and occlusion evidence.
		Vector2i(1, 3),
		Vector2i(-2, -3),
		Vector2i(2, 3),
		Vector2i(-3, -3),
		Vector2i(3, 3),
		Vector2i(-4, -1),
		Vector2i(1, 4),
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
	# A newly dressed service area may invalidate several curated offsets. Add a
	# deterministic perimeter search so the four moving evidence variants still
	# receive four different reachable cells instead of wrapping with modulo and
	# silently freezing duplicate pixels.
	for radius in range(1, 9):
		for delta_x in range(-radius, radius + 1):
			for delta_y in range(-radius, radius + 1):
				if maxi(abs(delta_x), abs(delta_y)) != radius:
					continue
				var offset := Vector2i(delta_x, delta_y)
				if not offsets.has(offset):
					offsets.append(offset)
	var viewport_rect := Rect2(Vector2(48, 48), Vector2(EXPECTED_VIEWPORT - Vector2i(96, 96)))
	var candidates: Array[Dictionary] = []
	var relaxed_default_candidates: Array[Dictionary] = []
	for offset in offsets:
		var candidate := start_cell + offset
		if not IsoMapModel.is_walkable(host.map_data, candidate):
			continue
		var strict_clear := (
			not _near_visual_collision(candidate)
			and not _near_interaction_source(candidate)
		)
		var exact_clear := (
			not _near_visual_collision(candidate, 0)
			and not _near_interaction_source(candidate, 0)
		)
		if not strict_clear and not exact_clear:
			continue
		var path: Array[Vector2i] = IsoMapModel.find_path(host.map_data, start_cell, candidate)
		if path.size() < 2 or path[0] != start_cell or path[path.size() - 1] != candidate:
			continue
		var screen_point: Vector2 = host._world_to_screen(IsoMapModel.grid_to_world(host.map_data, candidate))
		if not viewport_rect.has_point(screen_point) or host._is_ui_point(screen_point):
			continue
		var target_record := {
			"cell": candidate,
			"screenPoint": screen_point,
			"pathLength": path.size(),
			"clearance": "two_cell" if strict_clear else "exact_cell",
		}
		if strict_clear:
			candidates.append(target_record)
		else:
			relaxed_default_candidates.append(target_record)
	# The W009 village layout deliberately surrounds the spawn with service
	# actors. For the generic idle/moving reel, prefer the first exact-clear
	# nearby ground cell over an eight-cell detour selected solely to preserve the
	# stricter two-cell action-evidence margin. The post-move assertions still
	# fail if the real click opens an interaction, battle or menu. Formal
	# movement/warp/collision/occlusion variants keep the strict margin above.
	if capture_variant == "default" and not relaxed_default_candidates.is_empty():
		candidates = relaxed_default_candidates
	elif (
		capture_variant != "default"
		and candidates.size() < MOVING_CAPTURE_VARIANTS.size()
	):
		# W009's denser service layout can leave fewer than four two-cell-clear
		# destinations in the initial clickable viewport. Formal action captures
		# still need distinct real mouse movements, so retain every strict target
		# first, then fill only from destinations whose exact cell is clear of
		# blocking and interaction sources. This changes QA framing only; runtime
		# collision, pathfinding and the authority map remain untouched.
		for relaxed_candidate in relaxed_default_candidates:
			candidates.append(relaxed_candidate)
	if candidates.is_empty():
		return {}
	var variant_index := MOVING_CAPTURE_VARIANTS.find(capture_variant)
	if variant_index < 0:
		variant_index = 0
	if variant_index >= candidates.size():
		return {}
	var selected := (candidates[variant_index] as Dictionary).duplicate(true)
	selected["candidateCount"] = candidates.size()
	selected["variantIndex"] = variant_index
	return selected


func _near_visual_collision(candidate: Vector2i, margin_cells: int = 2) -> bool:
	var by_layer := host.map_visual_render_state.get("objectDrawsByLayer", {}) as Dictionary
	for layer_value in by_layer.values():
		if not (layer_value is Array):
			continue
		for command_value in layer_value as Array:
			if not (command_value is Dictionary):
				continue
			var command := command_value as Dictionary
			if str(command.get("collisionRole", "")) != "blocking":
				continue
			var footprint_value: Variant = command.get("collisionFootprint", [])
			if not (footprint_value is Array):
				continue
			# Tall isometric blockers can stop the capsule before the grid center
			# even when the requested destination is two cells beyond the frozen
			# logical footprint. Keep review movement targets clear of that visual
			# margin so the recorder measures traversal instead of edge contact.
			var margin := maxi(0, margin_cells)
			for delta_x in range(-margin, margin + 1):
				for delta_y in range(-margin, margin + 1):
					var neighbor_key := IsoMapModel.cell_key(
						candidate + Vector2i(delta_x, delta_y)
					)
					if (footprint_value as Array).has(neighbor_key):
						return true
	return false


func _near_interaction_source(candidate: Vector2i, margin_cells: int = 2) -> bool:
	var margin := maxi(0, margin_cells)
	for value in host.map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var source := _cell((value as Dictionary).get("cell"))
		if maxi(absi(candidate.x - source.x), absi(candidate.y - source.y)) <= margin:
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


func _capture_hud_glyph_stability_sequence(bundle_id: String) -> Dictionary:
	if bundle_id != FIREBUD_BUNDLE_ID:
		var fallback_image: Image = await _capture_complete_image()
		return {
			"status": "not_applicable",
			"passed": true,
			"reason": "只对 Firebud v2 固定 HUD 几何启用字形像素门禁",
			"image": fallback_image,
			"errors": [],
		}
	var source_contract := _task_hud_text_source_contract()
	var errors: Array[String] = _string_array(source_contract.get("errors", []))
	if not errors.is_empty():
		return {
			"status": "failed",
			"passed": false,
			"consecutiveFrames": true,
			"frameCount": 0,
			"requiredFrameCount": HUD_GLYPH_STABILITY_FRAME_COUNT,
			"textSource": source_contract,
			"frames": [],
			"image": null,
			"errors": errors,
		}
	var frames: Array[Dictionary] = []
	var screenshot: Image
	for frame_index in range(HUD_GLYPH_STABILITY_FRAME_COUNT):
		host.queue_redraw()
		await host.get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image: Image = host.get_viewport().get_texture().get_image()
		if (
			image == null
			or image.get_width() != EXPECTED_VIEWPORT.x
			or image.get_height() != EXPECTED_VIEWPORT.y
		):
			errors.append("HUD 字形连续帧 %d 不是完整 1280x720" % frame_index)
			break
		var sample := _hud_glyph_pixel_sample(image, frame_index)
		frames.append(sample)
		if not bool(sample.get("passed", false)):
			errors.append(
				"HUD 字形连续帧 %d 缺少页签、标题、正文或按钮像素：%s"
				% [frame_index, JSON.stringify(sample.get("failedRegions", []))]
			)
			break
		screenshot = image
	var passed := (
		errors.is_empty()
		and frames.size() == HUD_GLYPH_STABILITY_FRAME_COUNT
		and screenshot != null
	)
	return {
		"status": "passed" if passed else "failed",
		"passed": passed,
		"method": "independent_viewport_rgb_readback_edge_energy",
		"consecutiveFrames": true,
		"frameCount": frames.size(),
		"requiredFrameCount": HUD_GLYPH_STABILITY_FRAME_COUNT,
		"textSource": source_contract,
		"regions": _hud_glyph_region_contract_report(),
		"frames": frames,
		"image": screenshot,
		"errors": errors,
	}


func _task_hud_text_source_contract() -> Dictionary:
	var errors: Array[String] = []
	var task_tab: Button
	var party_tab: Button
	if host.world_hud_party_roster_view != null:
		task_tab = host.world_hud_party_roster_view.task_tab_button as Button
		party_tab = host.world_hud_party_roster_view.party_tab_button as Button
	var side_title := (
		host.side_panel.find_child("WorldHudSideTitle", true, false) as Label
		if host.side_panel != null
		else null
	)
	var task_entries := (
		host.side_panel.find_child("WorldHudTaskEntries", true, false) as Control
		if host.side_panel != null
		else null
	)
	var route_button := host.task_route_button as Button
	if task_tab == null or not task_tab.is_visible_in_tree() or task_tab.text != "任务":
		errors.append("任务页签源文字不可见或不是任务")
	if party_tab == null or not party_tab.is_visible_in_tree() or party_tab.text != "组队":
		errors.append("组队页签源文字不可见或不是组队")
	if (
		side_title == null
		or not side_title.is_visible_in_tree()
		or side_title.text != "任务追踪"
	):
		errors.append("任务追踪标题源文字不可见")
	if (
		route_button == null
		or not route_button.is_visible_in_tree()
		or route_button.text != "自动寻路"
	):
		errors.append("自动寻路按钮源文字不可见")
	var entry_count := 0
	var entry_label_count := 0
	var empty_entry_label_count := 0
	if task_entries != null:
		for child_value in task_entries.get_children():
			if not (child_value is Button):
				continue
			var entry := child_value as Button
			if not entry.is_visible_in_tree():
				continue
			entry_count += 1
			for label_value in entry.get_children():
				if not (label_value is Label):
					continue
				var label := label_value as Label
				if not label.is_visible_in_tree():
					continue
				entry_label_count += 1
				if label.text.strip_edges() == "":
					empty_entry_label_count += 1
	if entry_count < 4 or entry_label_count < 8 or empty_entry_label_count > 0:
		errors.append(
			"任务正文源节点不完整：entries=%d labels=%d empty=%d"
			% [entry_count, entry_label_count, empty_entry_label_count]
		)
	return {
		"passed": errors.is_empty(),
		"taskTabText": task_tab.text if task_tab != null else "",
		"partyTabText": party_tab.text if party_tab != null else "",
		"titleText": side_title.text if side_title != null else "",
		"routeButtonText": route_button.text if route_button != null else "",
		"taskEntryCount": entry_count,
		"taskEntryLabelCount": entry_label_count,
		"emptyTaskEntryLabelCount": empty_entry_label_count,
		"errors": errors,
	}


func _hud_glyph_pixel_sample(image: Image, frame_index: int) -> Dictionary:
	var regions := {}
	var failed_regions: Array[String] = []
	for region_id_value in HUD_GLYPH_REGIONS.keys():
		var region_id := str(region_id_value)
		var contract := HUD_GLYPH_REGIONS[region_id] as Dictionary
		var rect: Rect2i = contract.get("rect", Rect2i())
		var edge_energy := _image_edge_energy(image, rect)
		var minimum := int(contract.get("minimumEdgeEnergy", 0))
		var region_passed := edge_energy >= minimum
		regions[region_id] = {
			"edgeEnergy": edge_energy,
			"minimumEdgeEnergy": minimum,
			"passed": region_passed,
		}
		if not region_passed:
			failed_regions.append(region_id)
	return {
		"frameIndex": frame_index,
		"processFrame": Engine.get_process_frames(),
		"taskHudDecodedPixelSha256": _image_region_sha256(
			image,
			TASK_HUD_PIXEL_CROP
		),
		"regions": regions,
		"failedRegions": failed_regions,
		"passed": failed_regions.is_empty(),
	}


func _image_edge_energy(image: Image, rect: Rect2i) -> int:
	var clipped := rect.intersection(Rect2i(Vector2i.ZERO, image.get_size()))
	if clipped.size.x < 2 or clipped.size.y < 2:
		return 0
	var energy := 0
	for y in range(clipped.position.y, clipped.end.y):
		var previous_luminance := -1
		for x in range(clipped.position.x, clipped.end.x):
			var color := image.get_pixel(x, y)
			var luminance := roundi(
				255.0 * (color.r * 0.299 + color.g * 0.587 + color.b * 0.114)
			)
			if previous_luminance >= 0:
				energy += absi(luminance - previous_luminance)
			if y > clipped.position.y:
				var above := image.get_pixel(x, y - 1)
				var above_luminance := roundi(
					255.0 * (above.r * 0.299 + above.g * 0.587 + above.b * 0.114)
				)
				energy += absi(luminance - above_luminance)
			previous_luminance = luminance
	return energy


func _image_region_sha256(image: Image, rect: Rect2i) -> String:
	var clipped := rect.intersection(Rect2i(Vector2i.ZERO, image.get_size()))
	if clipped.size.x <= 0 or clipped.size.y <= 0:
		return ""
	var region := image.get_region(clipped)
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(
		("%dx%d:%d\n" % [region.get_width(), region.get_height(), region.get_format()]).to_utf8_buffer()
	)
	context.update(region.get_data())
	return context.finish().hex_encode()


func _hud_glyph_region_contract_report() -> Dictionary:
	var result := {}
	for region_id_value in HUD_GLYPH_REGIONS.keys():
		var region_id := str(region_id_value)
		var contract := HUD_GLYPH_REGIONS[region_id] as Dictionary
		var rect: Rect2i = contract.get("rect", Rect2i())
		result[region_id] = {
			"rect": [rect.position.x, rect.position.y, rect.size.x, rect.size.y],
			"minimumEdgeEnergy": int(contract.get("minimumEdgeEnergy", 0)),
			"meaning": str(contract.get("meaning", "")),
		}
	return result


static func _base_report(request: Dictionary) -> Dictionary:
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"reportType": REPORT_TYPE,
		"scene": MAIN_SCENE,
		"mapId": str(request.get("mapId", "")),
		"mode": str(request.get("mode", "")),
		"captureVariant": str(request.get("captureVariant", "default")),
		"qaPreviewFlagPresent": bool(request.get("qaPreviewFlagPresent", false)),
		"qaPreviewMapId": str(request.get("qaPreviewMapId", "")),
		"showcaseProfileRequested": bool(
			request.get("showcaseProfileRequested", false)
		),
		"displayServer": DisplayServer.get_name(),
		"debugBuild": OS.is_debug_build(),
		"profileIsolation": "default_profile_ephemeral_no_save",
		"defaultProfileIsolation": false,
		"authAutoBypass": false,
		"accountAuthenticated": false,
		"profileSaveEnabled": false,
		"serverAccountSession": false,
		"networkRequestAttempted": false,
		"networkRequestStatuses": {},
		"networkRequestsDisconnected": false,
		"showcaseProfileInMemory": false,
		"showcaseProfilePostInjectionIsDefault": true,
		"showcaseProfileId": "",
		"showcasePlayerAppearanceId": "",
		"showcaseActivePetFormId": "",
		"showcaseProfilePersisted": false,
		"authPanelVisible": false,
		"qaMenuVisible": false,
		"qaPanelVisible": false,
		"numericWorkbenchVisible": false,
		"debugUiVisible": false,
		"normalPlayerHud": false,
		"viewport": [],
		"cameraComposition": {},
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
		"targetCandidateCount": 0,
		"targetVariantIndex": -1,
		"targetClearance": "",
		"endCell": [],
		"playerCellChanged": false,
		"input": {},
		"screenshotPath": "",
		"screenshotSha256": "",
		"screenshot": {},
		"runtimeCleanup": {},
		"errors": [],
		"result": "FAIL",
		"ok": false,
		"generatedAtUtc": "%sZ" % Time.get_datetime_string_from_system(true),
	}


func _finish_capture(
	report: Dictionary,
	errors: Array[String],
	report_path: String
) -> Dictionary:
	var cleanup := await _drain_capture_runtime()
	report["runtimeCleanup"] = cleanup
	if str(cleanup.get("status", "")) != "passed":
		errors.append(
			"地图 Main 取证运行资源收口失败：%s"
			% str(cleanup.get("reason", "unknown"))
		)
	return _finish_report(report, errors, report_path)


func _drain_capture_runtime() -> Dictionary:
	return await RuntimeExitCleanup.drain_audio(host)


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
	var capture_variant := str(request.get("captureVariant", "default"))
	if not VALID_CAPTURE_VARIANTS.has(capture_variant):
		errors.append("captureVariant 必须为固定动作变体")
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
