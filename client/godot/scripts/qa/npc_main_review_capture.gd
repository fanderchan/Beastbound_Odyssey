extends RefCounted

const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")
const WorldReviewFrameParity := preload("res://scripts/qa/world_review_frame_parity.gd")

const CAPTURE_FLAG := "--npc-main-review-capture"
const QA_PREVIEW_FLAG := "--npc-art-review-preview"
const ARG_APPEARANCE_ID := "--npc-main-review-appearance-id"
const ARG_MAP_ID := "--npc-main-review-map-id"
const ARG_SPAWN := "--npc-main-review-spawn"
const ARG_NPC_ID := "--npc-main-review-npc-id"
const ARG_OUTPUT := "--npc-main-review-output"
const ARG_REPORT := "--npc-main-review-report"
const ARG_PORTRAIT_STATE := "--npc-main-review-portrait-state"
const ARG_RUN_ID := "--npc-main-review-run-id"

const REPORT_SCHEMA_VERSION := 1
const REPORT_TYPE := "beastbound_npc_main_review_capture"
const MAIN_SCENE := "res://scenes/Main.tscn"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const DEFAULT_PORTRAIT_STATE := NpcArtCatalog.PORTRAIT_SPEAKING
const EXPECTED_FRAME_COUNT := 12
const SETTLE_FRAMES := 8
const COMPLETE_FRAME_ATTEMPTS := 8

const VALUE_FLAGS := {
	ARG_APPEARANCE_ID: "appearanceId",
	ARG_MAP_ID: "mapId",
	ARG_SPAWN: "spawnName",
	ARG_NPC_ID: "npcId",
	ARG_OUTPUT: "outputPath",
	ARG_REPORT: "reportPath",
	ARG_PORTRAIT_STATE: "portraitState",
	ARG_RUN_ID: "runId",
}
const REQUIRED_VALUE_FLAGS: Array[String] = [
	ARG_APPEARANCE_ID,
	ARG_MAP_ID,
	ARG_SPAWN,
	ARG_NPC_ID,
	ARG_OUTPUT,
	ARG_REPORT,
	ARG_RUN_ID,
]

var host


func _init(host_ref) -> void:
	host = host_ref


static func request_from_args(args: PackedStringArray) -> Dictionary:
	var request := {
		"enabled": false,
		"qaPreviewFlagPresent": false,
		"appearanceId": "",
		"mapId": "",
		"spawnName": "",
		"npcId": "",
		"outputPath": "",
		"reportPath": "",
		"portraitState": DEFAULT_PORTRAIT_STATE,
		"runId": "",
		"parseErrors": [],
	}
	var counts: Dictionary = {}
	var capture_count := 0
	var qa_preview_count := 0
	for index in range(args.size()):
		var arg := str(args[index]).strip_edges()
		if arg == CAPTURE_FLAG:
			capture_count += 1
			continue
		if arg == QA_PREVIEW_FLAG:
			qa_preview_count += 1
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
		if not handled and arg.begins_with("--npc-main-review-"):
			(request["parseErrors"] as Array).append("未知 NPC Main 取证参数：%s" % arg)
	request["enabled"] = capture_count == 1
	request["qaPreviewFlagPresent"] = qa_preview_count == 1
	if capture_count != 1:
		(request["parseErrors"] as Array).append("%s 必须且只能出现一次" % CAPTURE_FLAG)
	if qa_preview_count > 1:
		(request["parseErrors"] as Array).append("%s 最多只能显式出现一次" % QA_PREVIEW_FLAG)
	for flag in REQUIRED_VALUE_FLAGS:
		if int(counts.get(flag, 0)) != 1:
			(request["parseErrors"] as Array).append("%s 必须且只能出现一次" % flag)
		elif str(request.get(VALUE_FLAGS[flag], "")).strip_edges() == "":
			(request["parseErrors"] as Array).append("%s 不能为空" % flag)
	if int(counts.get(ARG_PORTRAIT_STATE, 0)) > 1:
		(request["parseErrors"] as Array).append("%s 最多出现一次" % ARG_PORTRAIT_STATE)
	return request


func run(request: Dictionary) -> Dictionary:
	var report := _base_report(request)
	var errors: Array[String] = _string_array(request.get("parseErrors", []))
	_validate_request(request, errors)
	var report_path := str(request.get("reportPath", "")).strip_edges()
	var output_path := str(request.get("outputPath", "")).strip_edges()
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)
	var appearance_id := str(request.get("appearanceId", ""))
	var appearance_record := NpcArtCatalog.appearance_record(appearance_id)
	var normal_release_access := _record_has_normal_release_access(appearance_record)
	report["normalPlayerRuntimeEnabled"] = normal_release_access
	if appearance_record.is_empty():
		errors.append("NPC appearanceId 未登记：%s" % appearance_id)
	elif not normal_release_access:
		if not bool(request.get("qaPreviewFlagPresent", false)):
			errors.append("待审 NPC Main 取证缺少显式 --npc-art-review-preview 隔离通道")
		if not bool(host.npc_art_review_preview):
			errors.append("待审 NPC Main 取证未启用候选美术预览")
	if not OS.is_debug_build():
		errors.append("NPC Main 取证只能在 Godot debug build 运行")
	if DisplayServer.get_name().to_lower() == "headless":
		errors.append("NPC Main 视觉取证禁止使用 headless DisplayServer")
	if bool(host.auth_auto_bypass):
		errors.append("NPC Main 取证禁止 dev GM auth bypass")
	if bool(host.account_authenticated):
		errors.append("NPC Main 取证必须使用无账号的临时默认档案")
	if bool(host.profile_save_enabled):
		errors.append("NPC Main 取证必须禁用档案写入")
	if bool(host._is_server_account_session()):
		errors.append("NPC Main 取证禁止使用服务端账号会话")
	if str(host.current_map_id) != str(request.get("mapId", "")):
		errors.append("Main 实际地图与请求不一致：%s" % str(host.current_map_id))
	if str(host.map_data.get("id", "")) != str(request.get("mapId", "")):
		errors.append("Main map_data.id 与请求不一致")
	var spawn_points_value = host.map_data.get("spawnPoints", {})
	if not (spawn_points_value is Dictionary) or not (spawn_points_value as Dictionary).has(str(request.get("spawnName", ""))):
		errors.append("地图不存在请求的 spawnName：%s" % str(request.get("spawnName", "")))
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	var npc_id := str(request.get("npcId", ""))
	var portrait_state := str(request.get("portraitState", DEFAULT_PORTRAIT_STATE))
	var item := InteractionModel.find_by_id(host.map_data, npc_id)
	if item.is_empty():
		errors.append("真实地图找不到 npcId：%s" % npc_id)
	elif str(item.get("kind", "")) != "npc":
		errors.append("请求目标不是真实 NPC interaction：%s" % npc_id)
	elif NpcArtCatalog.appearance_id_for_instance(item) != appearance_id:
		errors.append("npcId 与 appearanceId 映射不一致：%s" % npc_id)
	var facing := NpcArtCatalog.facing_for_instance(item) if not item.is_empty() else ""
	if facing == "":
		errors.append("NPC 没有规范真八向 facing：%s" % npc_id)
	report["facing"] = facing
	if not normal_release_access and not NpcArtCatalog.is_qa_preview_enabled(appearance_id):
		errors.append("appearanceId 未进入显式 QA preview：%s" % appearance_id)
	if not NpcArtCatalog.is_world_ready(appearance_id):
		errors.append("appearanceId 世界纹理未通过 QA 预热：%s" % appearance_id)
	if not NpcArtCatalog.is_portrait_ready(appearance_id):
		errors.append("appearanceId 对话人像未通过 QA 预热：%s" % appearance_id)
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	var asset_root := str(appearance_record.get("assetRoot", ""))
	var expected_asset_root := "client/godot/assets/npcs/%s" % appearance_id
	if asset_root != expected_asset_root:
		errors.append("NPC assetRoot 不符合稳定安装路径：%s" % asset_root)
	var resource_root := "res://assets/npcs/%s" % appearance_id
	var world_path := "%s/world/directions/%s/idle/idle-1.png" % [resource_root, facing]
	var portrait_path := "%s/portrait/%s.png" % [resource_root, portrait_state]
	var frames: Array = []
	var world_source: Dictionary = {}
	var portrait_source: Dictionary = {}
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		var direction_path := "%s/world/directions/%s/idle/idle-1.png" % [resource_root, direction]
		if not ResourceLoader.exists(direction_path) or not FileAccess.file_exists(direction_path):
			errors.append("真实世界 PNG 缺失，禁止占位回退：%s" % direction_path)
			continue
		var direction_texture := NpcArtCatalog.world_texture_for_frame(
			appearance_id,
			direction,
			NpcArtCatalog.WORLD_ACTION_IDLE,
			1
		)
		if direction_texture == null:
			errors.append("世界方向无法通过真实目录读取：%s/%s" % [appearance_id, direction])
			continue
		var direction_source := _source_record("world", direction, direction_path, direction_texture)
		errors.append_array(_string_array(direction_source.get("errors", [])))
		var clean_direction_source := _source_record_for_report(direction_source)
		frames.append(clean_direction_source)
		if direction == facing:
			world_source = clean_direction_source
	for state in NpcArtCatalog.PORTRAIT_STATES:
		var state_path := "%s/portrait/%s.png" % [resource_root, state]
		if not ResourceLoader.exists(state_path) or not FileAccess.file_exists(state_path):
			errors.append("请求人像 PNG 缺失，禁止 neutral/其他岗位回退：%s" % state_path)
			continue
		var state_texture := NpcArtCatalog.portrait_texture(appearance_id, state)
		if state_texture == null:
			errors.append("人像状态无法通过真实目录读取：%s/%s" % [appearance_id, state])
			continue
		var state_source := _source_record("portrait", state, state_path, state_texture)
		errors.append_array(_string_array(state_source.get("errors", [])))
		var clean_state_source := _source_record_for_report(state_source)
		frames.append(clean_state_source)
		if state == portrait_state:
			portrait_source = clean_state_source
	if frames.size() != EXPECTED_FRAME_COUNT:
		errors.append("Main 取证必须冻结 8 个世界方向和 4 种人像，共 12 帧")
	if world_source.is_empty():
		errors.append("完整 12 帧集合未包含目标世界 facing：%s" % facing)
	if portrait_source.is_empty():
		errors.append("完整 12 帧集合未包含目标 speaking 人像")
	var world_texture := NpcArtCatalog.world_texture_for_instance(item)
	if world_texture == null:
		errors.append("真实世界 renderer 将回退占位图：%s" % npc_id)
	else:
		var rendered_world_source := _source_record("world", facing, world_path, world_texture)
		errors.append_array(_string_array(rendered_world_source.get("errors", [])))
		if (
			str(rendered_world_source.get("loadedDecodedRgbaSha256", ""))
			!= str(world_source.get("loadedDecodedRgbaSha256", ""))
		):
			errors.append("真实世界 renderer 未使用目标 facing 的 frozen frame")
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	_position_and_open_dialog(item, str(request.get("spawnName", "")))
	for _frame_index in range(SETTLE_FRAMES):
		host.queue_redraw()
		await host.get_tree().process_frame
	await RenderingServer.frame_post_draw

	var viewport_size: Vector2i = Vector2i(host.get_viewport().get_visible_rect().size)
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("Main viewport 必须为 1280x720，实际 %s" % str(viewport_size))
	var dialog_visible: bool = (
		host.dialog_panel != null
		and host.dialog_panel.visible
		and str(host.active_dialog_interaction.get("id", "")) == npc_id
	)
	if not dialog_visible:
		errors.append("没有打开目标 NPC 的真实 interaction dialog")
	var qa_menu_visible: bool = host.qa_menu_button != null and host.qa_menu_button.visible
	var qa_panel_visible: bool = host.qa_panel != null and host.qa_panel.visible
	var numeric_workbench_visible: bool = (
		host.numeric_workbench_panel != null and host.numeric_workbench_panel.visible
	)
	var auth_panel_visible: bool = host.auth_panel != null and host.auth_panel.visible
	var debug_ui_visible := qa_menu_visible or qa_panel_visible or numeric_workbench_visible
	report["debugUiVisible"] = debug_ui_visible
	report["normalPlayerUi"] = not debug_ui_visible and not auth_panel_visible
	report["qaDebugControlsVisible"] = debug_ui_visible
	report["qaPanelVisible"] = qa_panel_visible
	report["authPanelVisible"] = auth_panel_visible
	if debug_ui_visible:
		errors.append("Main 正常玩家截图不得显示 GM/QA/debug 控件")
	if auth_panel_visible:
		errors.append("Main NPC 截图不得被登录面板遮挡")
	var visible_dialog_buttons: Array[Button] = []
	if (
		host.dialog_option_button != null
		and host.dialog_option_button.visible
		and host.dialog_option_button.is_visible_in_tree()
	):
		visible_dialog_buttons.append(host.dialog_option_button)
	for button_value in host.dialog_secondary_buttons:
		if (
			button_value is Button
			and (button_value as Button).visible
			and (button_value as Button).is_visible_in_tree()
		):
			visible_dialog_buttons.append(button_value as Button)
	if (
		host.dialog_close_button != null
		and host.dialog_close_button.visible
		and host.dialog_close_button.is_visible_in_tree()
	):
		visible_dialog_buttons.append(host.dialog_close_button)
	var dialog_bounds: Rect2 = host.dialog_panel.get_global_rect()
	var dialog_buttons_in_bounds := visible_dialog_buttons.size() >= 2
	for button in visible_dialog_buttons:
		if not dialog_bounds.grow(1.0).encloses(button.get_global_rect()):
			dialog_buttons_in_bounds = false
	report["dialogVisibleButtonCount"] = visible_dialog_buttons.size()
	report["dialogButtonsInBounds"] = dialog_buttons_in_bounds
	if not dialog_buttons_in_bounds:
		errors.append("真实 NPC 对话框的可见按钮没有全部落在 dialog_panel 内")
	var actual_portrait_texture: Texture2D = (
		host.dialog_portrait_rect.texture as Texture2D
		if host.dialog_portrait_rect != null and host.dialog_portrait_rect.texture is Texture2D
		else null
	)
	if actual_portrait_texture == null:
		errors.append("真实对话框没有人像纹理")
	else:
		var rendered_portrait_source := _source_record(
			"portrait",
			portrait_state,
			portrait_path,
			actual_portrait_texture
		)
		errors.append_array(_string_array(rendered_portrait_source.get("errors", [])))
		if (
			str(rendered_portrait_source.get("loadedDecodedRgbaSha256", ""))
			!= str(portrait_source.get("loadedDecodedRgbaSha256", ""))
		):
			errors.append("真实对话框 presenter 显示的不是目标 speaking frozen portrait")

	var world_screen_rect: Rect2 = _world_screen_rect(item, world_texture)
	var viewport_rect := Rect2(Vector2.ZERO, Vector2(EXPECTED_VIEWPORT))
	var world_visible: bool = _rect_has_uncovered_area(world_screen_rect, viewport_rect, host.dialog_panel)
	var portrait_visible: bool = _portrait_is_visible(viewport_rect, actual_portrait_texture)
	if not portrait_visible:
		print("npc main portrait diagnostic: %s" % JSON.stringify({
			"dialogPanelVisible": host.dialog_panel != null and host.dialog_panel.visible,
			"portraitNodeExists": host.dialog_portrait_rect != null,
			"portraitNodeVisible": host.dialog_portrait_rect != null and host.dialog_portrait_rect.visible,
			"portraitVisibleInTree": host.dialog_portrait_rect != null and host.dialog_portrait_rect.is_visible_in_tree(),
			"portraitTextureAssigned": actual_portrait_texture != null,
			"portraitRect": _rect_array(host.dialog_portrait_rect.get_global_rect()) if host.dialog_portrait_rect != null else [],
			"dialogRect": _rect_array(host.dialog_panel.get_global_rect()) if host.dialog_panel != null else [],
			"viewportRect": _rect_array(viewport_rect),
		}))
	if not world_visible:
		errors.append("目标 NPC 世界帧未在 Main 截图可见区域内")
	if not portrait_visible:
		errors.append("目标 NPC 对话人像未在 Main 截图可见区域内")
	if not errors.is_empty():
		return _finish_report(report, errors, report_path)

	var screenshot: Image = await _capture_complete_image()
	if screenshot == null:
		errors.append("Metal/viewport 未得到完整稳定画面")
		return _finish_report(report, errors, report_path)
	if screenshot.get_width() != EXPECTED_VIEWPORT.x or screenshot.get_height() != EXPECTED_VIEWPORT.y:
		errors.append("截图不是 1280x720")
		return _finish_report(report, errors, report_path)
	var save_error: int = screenshot.save_png(output_path)
	if save_error != OK:
		errors.append("无法保存 Main 截图：%s" % error_string(save_error))
		return _finish_report(report, errors, report_path)

	var screenshot_hash: String = FileAccess.get_sha256(output_path)
	var screenshot_rgba_hash: String = _image_signature(screenshot)
	if not _is_sha256(screenshot_hash) or not _is_sha256(screenshot_rgba_hash):
		errors.append("截图哈希失败")
	report["worldVisible"] = world_visible
	report["portraitVisible"] = portrait_visible
	report["dialogVisible"] = dialog_visible
	report["viewportSize"] = [screenshot.get_width(), screenshot.get_height()]
	report["frames"] = frames
	report["sources"] = frames
	report["checkedFrames"] = frames.size()
	report["passedFrames"] = frames.size()
	report["sourceSetSha256"] = _source_set_sha256(frames)
	report["world"] = {
		"path": world_path,
		"fileSha256": world_source.get("fileSha256", ""),
		"sourceFullDecodedRgbaSha256": world_source.get("sourceFullDecodedRgbaSha256", ""),
		"sourceDecodedRgbaSha256": world_source.get("sourceDecodedRgbaSha256", ""),
		"loadedDecodedRgbaSha256": world_source.get("loadedDecodedRgbaSha256", ""),
		"screenRect": _rect_array(world_screen_rect),
	}
	report["portrait"] = {
		"state": portrait_state,
		"path": portrait_path,
		"fileSha256": portrait_source.get("fileSha256", ""),
		"sourceFullDecodedRgbaSha256": portrait_source.get("sourceFullDecodedRgbaSha256", ""),
		"sourceDecodedRgbaSha256": portrait_source.get("sourceDecodedRgbaSha256", ""),
		"loadedDecodedRgbaSha256": portrait_source.get("loadedDecodedRgbaSha256", ""),
		"screenRect": _rect_array(host.dialog_portrait_rect.get_global_rect()),
	}
	report["screenshot"] = {
		"path": output_path,
		"fileSha256": screenshot_hash,
		"decodedRgbaSha256": screenshot_rgba_hash,
		"width": screenshot.get_width(),
		"height": screenshot.get_height(),
	}
	report["screenshotPath"] = output_path
	report["screenshotSha256"] = screenshot_hash
	report["visualObservation"] = "Main.tscn 1280x720 画面同时显示地图中的目标 NPC 世界像和真实交互对话框的 speaking 人像。"
	report["dialog"] = {
		"npcId": str(host.active_dialog_interaction.get("id", "")),
		"name": str(host.active_dialog_interaction.get("name", "")),
		"visible": dialog_visible,
	}
	return _finish_report(report, errors, report_path)


func _position_and_open_dialog(item: Dictionary, spawn_name: String) -> void:
	var spawn_cell := IsoMapModel.spawn_cell(host.map_data, spawn_name)
	var approach_cell := InteractionModel.approach_cell_for(host.map_data, spawn_cell, item)
	host._clear_navigation_state()
	host.player.global_position = IsoMapModel.grid_to_world(host.map_data, approach_cell)
	host.player.clear_move_target()
	host.last_checked_player_cell = approach_cell
	if host.pet != null:
		host.pet.clear_follow_target()
		host.pet.global_position = host.player.global_position + Vector2(-56, 36)
	host._update_camera_position(true)
	host._open_interaction_dialog(item)
	host._layout_hud()
	host.queue_redraw()


func _world_screen_rect(item: Dictionary, texture: Texture2D) -> Rect2:
	var marker := InteractionModel.marker_world_position(host.map_data, item)
	var world_rect := NpcArtCatalog.world_draw_rect_for_instance(item, marker, texture)
	var transform: Transform2D = host.get_global_transform_with_canvas()
	var points: Array[Vector2] = [
		transform * world_rect.position,
		transform * Vector2(world_rect.end.x, world_rect.position.y),
		transform * world_rect.end,
		transform * Vector2(world_rect.position.x, world_rect.end.y),
	]
	var minimum := points[0]
	var maximum := points[0]
	for point in points:
		minimum.x = minf(minimum.x, point.x)
		minimum.y = minf(minimum.y, point.y)
		maximum.x = maxf(maximum.x, point.x)
		maximum.y = maxf(maximum.y, point.y)
	return Rect2(minimum, maximum - minimum)


func _rect_has_uncovered_area(rect: Rect2, viewport_rect: Rect2, covering_control: Control) -> bool:
	var visible_rect := rect.intersection(viewport_rect)
	if (
		not visible_rect.has_area()
		or rect.get_area() <= 0.0
		or visible_rect.get_area() < 1024.0
		or visible_rect.get_area() / rect.get_area() < 0.35
	):
		return false
	if covering_control == null or not covering_control.visible:
		return true
	var covered := visible_rect.intersection(covering_control.get_global_rect())
	var uncovered_area := visible_rect.get_area() - covered.get_area()
	return uncovered_area >= 1024.0 and uncovered_area / rect.get_area() >= 0.25


func _portrait_is_visible(viewport_rect: Rect2, texture: Texture2D) -> bool:
	if host.dialog_portrait_rect == null or texture == null:
		return false
	if (
		not host.dialog_portrait_rect.visible
		or not host.dialog_portrait_rect.is_visible_in_tree()
		or host.dialog_portrait_rect.texture == null
	):
		return false
	var portrait_rect: Rect2 = host.dialog_portrait_rect.get_global_rect()
	var visible_rect: Rect2 = portrait_rect.intersection(viewport_rect)
	return portrait_rect.get_area() > 0.0 and visible_rect.get_area() / portrait_rect.get_area() >= 0.70


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


static func _source_record(kind: String, slot: String, path: String, texture: Texture2D) -> Dictionary:
	var parity := WorldReviewFrameParity.compare_source_and_loaded(path, texture)
	var errors: Array[String] = _string_array(parity.get("errors", []))
	return {
		"kind": kind,
		"slot": slot,
		"path": path,
		"status": str(parity.get("status", "failed")),
		"fileSha256": str(parity.get("sourceFileSha256", "")),
		"sourceFullDecodedRgbaSha256": str(parity.get("sourceFullDecodedRgbaSha256", "")),
		"sourceDecodedRgbaSha256": str(parity.get("sourceDecodedRgbaSha256", "")),
		"loadedDecodedRgbaSha256": str(parity.get("loadedDecodedRgbaSha256", "")),
		"sourceLoadedRgbaMatch": (
			str(parity.get("sourceDecodedRgbaSha256", "")) != ""
			and str(parity.get("sourceDecodedRgbaSha256", ""))
			== str(parity.get("loadedDecodedRgbaSha256", ""))
		),
		"importFresh": bool(parity.get("importFresh", false)),
		"loadMode": str(parity.get("loadMode", "")),
		"canonicalRgbaMatch": bool(parity.get("canonicalRgbaMatch", false)),
		"errors": errors,
	}


static func _source_record_for_report(value: Dictionary) -> Dictionary:
	return value.duplicate(true)


static func _source_set_sha256(sources: Array) -> String:
	var lines := ""
	for value in sources:
		var source := value as Dictionary
		lines += "%s\t%s\t%s\t%s\t%s\t%s\n" % [
			str(source.get("kind", "")),
			str(source.get("slot", "")),
			str(source.get("path", "")),
			str(source.get("fileSha256", "")),
			str(source.get("sourceFullDecodedRgbaSha256", "")),
			str(source.get("sourceDecodedRgbaSha256", "")),
		]
	return _sha256_bytes(lines.to_utf8_buffer())


static func _image_signature(image: Image) -> String:
	if image == null or image.is_empty():
		return ""
	var rgba := image.duplicate() as Image
	if rgba.get_format() != Image.FORMAT_RGBA8:
		rgba.convert(Image.FORMAT_RGBA8)
	var bytes := PackedByteArray()
	bytes.append_array(("%dx%d:RGBA\n" % [rgba.get_width(), rgba.get_height()]).to_utf8_buffer())
	bytes.append_array(rgba.get_data())
	return _sha256_bytes(bytes)


static func _sha256_bytes(bytes: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(bytes)
	return context.finish().hex_encode()


static func _base_report(request: Dictionary) -> Dictionary:
	return {
		"schemaVersion": REPORT_SCHEMA_VERSION,
		"reportType": REPORT_TYPE,
		"processKind": "main_capture",
		"runId": str(request.get("runId", "")),
		"status": "failed",
		"ok": false,
		"scene": MAIN_SCENE,
		"qaPreview": bool(request.get("qaPreviewFlagPresent", false)),
		"normalPlayerRuntimeEnabled": false,
		"debugBuild": OS.is_debug_build(),
		"displayServer": DisplayServer.get_name(),
		"runtimeMirroring": false,
		"defaultProfileIsolation": true,
		"profileIsolation": "default_profile_ephemeral_no_save",
		"authAutoBypass": false,
		"accountAuthenticated": false,
		"profileSaveEnabled": false,
		"serverAccountSession": false,
		"appearanceId": str(request.get("appearanceId", "")),
		"mapId": str(request.get("mapId", "")),
		"spawnName": str(request.get("spawnName", "")),
		"npcId": str(request.get("npcId", "")),
		"facing": "",
		"portraitState": str(request.get("portraitState", DEFAULT_PORTRAIT_STATE)),
		"worldVisible": false,
		"portraitVisible": false,
		"dialogVisible": false,
		"dialogVisibleButtonCount": 0,
		"dialogButtonsInBounds": false,
		"debugUiVisible": false,
		"normalPlayerUi": false,
		"qaDebugControlsVisible": false,
		"qaPanelVisible": false,
		"authPanelVisible": false,
		"viewportSize": [],
		"frames": [],
		"sources": [],
		"checkedFrames": 0,
		"passedFrames": 0,
		"sourceSetSha256": "",
		"world": {},
		"portrait": {},
		"screenshot": {},
		"screenshotPath": "",
		"screenshotSha256": "",
		"visualObservation": "",
		"dialog": {},
		"errors": [],
		"generatedAtUtc": "%sZ" % Time.get_datetime_string_from_system(true),
	}


func _finish_report(report: Dictionary, errors: Array[String], report_path: String) -> Dictionary:
	report["authAutoBypass"] = bool(host.auth_auto_bypass) if host != null else false
	report["accountAuthenticated"] = bool(host.account_authenticated) if host != null else false
	report["profileSaveEnabled"] = bool(host.profile_save_enabled) if host != null else false
	report["serverAccountSession"] = bool(host._is_server_account_session()) if host != null else false
	report["errors"] = errors.duplicate()
	report["ok"] = errors.is_empty()
	report["status"] = "passed" if errors.is_empty() else "failed"
	if _can_write_report_path(report_path):
		var directory_error := DirAccess.make_dir_recursive_absolute(report_path.get_base_dir())
		if directory_error != OK:
			report["ok"] = false
			report["status"] = "failed"
			(report["errors"] as Array).append("无法创建 report 目录：%s" % error_string(directory_error))
			return report
		var file := FileAccess.open(report_path, FileAccess.WRITE)
		if file == null:
			report["ok"] = false
			report["status"] = "failed"
			(report["errors"] as Array).append("无法写入 report：%s" % report_path)
			return report
		file.store_string(JSON.stringify(report, "\t", false) + "\n")
	return report


static func _validate_request(request: Dictionary, errors: Array[String]) -> void:
	if not bool(request.get("enabled", false)):
		errors.append("NPC Main capture flag 未正确解析")
	for key in ["appearanceId", "mapId", "spawnName", "npcId"]:
		var value := str(request.get(key, ""))
		if not _is_safe_id(value):
			errors.append("%s 不是安全的小写稳定 ID：%s" % [key, value])
	if not _is_safe_run_id(str(request.get("runId", ""))):
		errors.append("runId 不是安全唯一标识")
	var portrait_state := str(request.get("portraitState", DEFAULT_PORTRAIT_STATE))
	if not NpcArtCatalog.PORTRAIT_STATES.has(portrait_state):
		errors.append("portraitState 不是规范四表情之一：%s" % portrait_state)
	elif portrait_state != DEFAULT_PORTRAIT_STATE:
		errors.append("真实 interaction dialog 取证必须固定使用 speaking 人像")
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


static func _record_has_normal_release_access(record: Dictionary) -> bool:
	return (
		not record.is_empty()
		and typeof(record.get("runtimeEnabled")) == TYPE_BOOL
		and bool(record.get("runtimeEnabled", false))
		and typeof(record.get("releaseApproved")) == TYPE_BOOL
		and bool(record.get("releaseApproved", false))
		and str(record.get("status", "")) == NpcArtCatalog.STATUS_APPROVED
		and str(record.get("ownerReviewStatus", "")) == "approved"
	)


static func _can_write_report_path(path: String) -> bool:
	return path.is_absolute_path() and path.get_extension().to_lower() == "json" and not FileAccess.file_exists(path)


static func _is_safe_id(value: String) -> bool:
	if value == "" or value != value.strip_edges() or value.begins_with("_") or value.ends_with("_") or value.contains("__"):
		return false
	for index in range(value.length()):
		if not "abcdefghijklmnopqrstuvwxyz0123456789_".contains(value.substr(index, 1)):
			return false
	return true


static func _is_safe_run_id(value: String) -> bool:
	if value == "" or value.length() > 128 or value.begins_with(".") or value.ends_with("."):
		return false
	for index in range(value.length()):
		if not "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-".contains(value.substr(index, 1)):
			return false
	return true


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


static func _rect_array(rect: Rect2) -> Array[float]:
	return [rect.position.x, rect.position.y, rect.size.x, rect.size.y]
