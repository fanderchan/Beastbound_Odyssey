extends SceneTree

const MapVisualReviewCapture := preload(
	"res://scripts/qa/map_visual_review_capture.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const MAIN_SCENE := "res://scenes/Main.tscn"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const PLAN_ENV := "BEASTBOUND_MAP_ACTION_BATCH_PLAN"
const PLAN_SHA_ENV := "BEASTBOUND_MAP_ACTION_BATCH_PLAN_SHA256"
const QA_LANE_ARG := "--beastbound-qa-user-data-lane=automation"
const REPORT_TYPE := "beastbound_map_visual_action_capture_batch_plan"
const AUDIO_DRIVER := "Dummy"
const BUILD_IDENTITY_NAMESPACE := "beastbound-map-runtime-surface-v2"
const ACTION_MODES := {
	"pointer": "idle",
	"movement_path": "moving",
	"warp": "moving",
	"collision": "moving",
	"occlusion": "moving",
}
const BUNDLE_MAPS := {
	"firebud_region_visual_v2": [
		"firebud_village_gate",
		"firebud_training_yard",
	],
	"earth_vein_cave_visual_v1": [
		"earth_vein_cave",
		"earth_vein_cave_f2",
		"earth_vein_cave_f3",
		"earth_vein_cave_f4",
	],
}
const SOURCE_PATHS := {
	"orchestrator": "repo://tools/record_map_visual_action_captures.py",
	"evidenceBuilder": "repo://tools/map_visual_evidence_builder.py",
	"ownerReviewRecorder": "repo://tools/record_firebud_v2_owner_review.py",
	"processContainment": "repo://tools/record_pet_management_owner_review.py",
	"qaUserDataLane": "repo://tools/godot_qa_user_data_lane.py",
	"hudGlyphAuditor": "repo://tools/audit_firebud_hud_glyph_stability.py",
	"entrypoint": "res://scripts/qa/map_visual_action_capture_batch.gd",
	"captureController": "res://scripts/qa/map_visual_review_capture.gd",
	"interactionModel": "res://scripts/world/interaction_model.gd",
	"playerProgressModel": "res://scripts/progression/player_progress_model.gd",
	"showcaseProfile": "res://scripts/qa/map_visual_review_showcase_profile.gd",
	"mainScene": "res://scenes/Main.tscn",
	"mainHost": "res://scripts/main.gd",
}
const HOST_READY_FRAME_LIMIT := 180
const BETWEEN_ACTION_SETTLE_FRAMES := 4

var _process_frame_origin := 0
var _root_window_id := -1


func _initialize() -> void:
	_process_frame_origin = Engine.get_process_frames()
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var plan_path := OS.get_environment(PLAN_ENV).strip_edges()
	var expected_plan_sha := OS.get_environment(PLAN_SHA_ENV).strip_edges()
	var plan := _read_and_validate_plan(
		plan_path,
		expected_plan_sha,
		errors
	)
	_validate_invocation(plan, errors)
	if not errors.is_empty():
		_finish(plan, [], errors, expected_plan_sha, {}, {})
		return

	root.size = EXPECTED_VIEWPORT
	root.content_scale_size = EXPECTED_VIEWPORT
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	var scene_error := change_scene_to_file(MAIN_SCENE)
	if scene_error != OK:
		errors.append("批量动作取证无法加载真实 Main.tscn：%s" % error_string(scene_error))
		_finish(plan, [], errors, expected_plan_sha, {}, {})
		return
	var host = await _wait_for_host()
	if host == null:
		errors.append("批量动作取证的真实 Main.tscn 未在限定帧内就绪")
		_finish(plan, [], errors, expected_plan_sha, _runtime_identity(), {})
		return

	await _configure_isolated_capture_host(host, errors)
	var runtime_identity := _runtime_identity()
	_validate_runtime_identity(runtime_identity, errors)
	_root_window_id = int(runtime_identity.get("rootWindowId", -1))
	var initial_window_identity := _window_identity_checkpoint("initial", errors)
	if not errors.is_empty():
		var early_cleanup := await _drain_host_audio_if_present(host)
		_finish(
			plan,
			[],
			errors,
			expected_plan_sha,
			runtime_identity,
			early_cleanup
		)
		return

	var actions := plan.get("actions", []) as Array
	var completed: Array[Dictionary] = []
	print(
		"map visual action capture batch start: %s"
		% JSON.stringify({
			"status": "started",
			"scene": MAIN_SCENE,
			"bundleId": str(plan.get("bundleId", "")),
			"planSha256": expected_plan_sha,
			"actionCount": actions.size(),
			"godotProcessCount": 1,
			"userVisibleWindowOpenCount": int(
				runtime_identity.get("displayServerWindowCount", 0)
			),
			"singlePersistentWindow": true,
			"viewport": [EXPECTED_VIEWPORT.x, EXPECTED_VIEWPORT.y],
			"sourceIdentity": plan.get("sourceIdentity", {}),
			"runtimeIdentity": runtime_identity,
		})
	)
	for action_index in range(actions.size()):
		var action := actions[action_index] as Dictionary
		var action_errors: Array[String] = []
		var action_key := "%s/%s" % [
			str(action.get("mapId", "")),
			str(action.get("actionKind", "")),
		]
		var before_window_identity := _window_identity_checkpoint(
			"%s:before" % action_key,
			action_errors
		)
		_print_progress(plan, expected_plan_sha, action_index, "before_prepare")
		await _prepare_action(host, action, action_errors)
		if not action_errors.is_empty():
			errors.append_array(action_errors)
			break
		var request := _capture_request(action, str(plan.get("bundleId", "")))
		var report: Dictionary = await MapVisualReviewCapture.new(host).run(request)
		var after_window_identity := _window_identity_checkpoint(
			"%s:after" % action_key,
			action_errors
		)
		var action_window_identity := {
			"rootWindowId": _root_window_id,
			"before": before_window_identity,
			"after": after_window_identity,
		}
		_seal_action_report(
			report,
			action,
			plan,
			expected_plan_sha,
			runtime_identity,
			action_window_identity,
			action_errors
		)
		_print_progress(plan, expected_plan_sha, action_index, "after_capture")
		print("map visual review capture: %s" % JSON.stringify(report))
		completed.append({
			"mapId": str(action.get("mapId", "")),
			"actionKind": str(action.get("actionKind", "")),
			"mode": str(action.get("mode", "")),
			"result": str(report.get("result", "FAIL")),
			"screenshotSha256": str(report.get("screenshotSha256", "")),
			"captureReportSha256": FileAccess.get_sha256(
				str(action.get("reportPath", ""))
			),
			"windowIdentity": action_window_identity,
			"runtimeCleanup": report.get("runtimeCleanup", {}),
		})
		if not action_errors.is_empty():
			errors.append_array(action_errors)
			break
		if not bool(report.get("ok", false)):
			errors.append(
				"批量动作取证失败：%s/%s"
				% [
					str(action.get("mapId", "")),
					str(action.get("actionKind", "")),
				]
			)
			break

	var final_cleanup := await _drain_host_audio_if_present(host)
	var final_window_identity := _window_identity_checkpoint("final", errors)
	if str(final_cleanup.get("status", "")) == "failed":
		errors.append("批量动作进程最终运行资源收口失败")
	_finish(
		plan,
		completed,
		errors,
		expected_plan_sha,
		runtime_identity,
		final_cleanup,
		{
			"rootWindowId": _root_window_id,
			"initial": initial_window_identity,
			"final": final_window_identity,
		}
	)


func _wait_for_host():
	for _frame_index in range(HOST_READY_FRAME_LIMIT):
		await process_frame
		var host = current_scene
		if (
			host != null
			and str(host.scene_file_path) == MAIN_SCENE
			and host.player != null
			and not host.map_data.is_empty()
			and host.auth_panel != null
		):
			return host
	return null


func _configure_isolated_capture_host(host, errors: Array[String]) -> void:
	host.profile_save_enabled = false
	host.profile_save_pending = false
	host.account_authenticated = false
	host.current_account_session = {}
	host.auth_auto_bypass = false
	host.auth_request_pending = false
	host.startup_auth_username = ""
	host.startup_auth_password = ""
	host.startup_auth_base_url = ""
	host.map_art_review_preview = true
	# Set only after Main._ready() so the built-in one-action controller is not
	# scheduled. This existing input gate keeps real cross-frame mouse events
	# enabled while authentication and persistence stay closed.
	host.map_visual_review_capture = true
	host.player_profile = PlayerProgressModel.default_profile()
	if host.has_method("_stop_server_event_stream"):
		host._stop_server_event_stream()
	if host.has_method("_stop_online_position_sync"):
		host._stop_online_position_sync()
	for method_name in [
		"_close_auth_panel",
		"_close_account_panel",
		"_close_dialog",
		"_close_encounter",
	]:
		if not host.has_method(method_name):
			continue
		if method_name in ["_close_auth_panel", "_close_account_panel"]:
			host.call(method_name, false)
		else:
			host.call(method_name)
	if host.has_method("_refresh_gm_visibility"):
		host._refresh_gm_visibility()
	if host.has_method("_sync_player_mount_visual_if_needed"):
		host._sync_player_mount_visual_if_needed(true)
	if host.has_method("_mark_progress_ui_caches_dirty"):
		host._mark_progress_ui_caches_dirty()
	if host.has_method("_update_hud_text"):
		host._update_hud_text(true)
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _disable_audio(host, errors)
	for _frame_index in range(BETWEEN_ACTION_SETTLE_FRAMES):
		await process_frame
	if current_scene != host or str(host.scene_file_path) != MAIN_SCENE:
		errors.append("批量动作取证没有保持真实 Main.tscn current_scene")
	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("批量动作取证 viewport 不是 1280x720：%s" % str(viewport_size))
	if (
		host.account_authenticated
		or host.auth_auto_bypass
		or host.profile_save_enabled
		or host._is_server_account_session()
	):
		errors.append("批量动作取证没有关闭认证、保存或服务端会话")


func _prepare_action(
	host,
	action: Dictionary,
	errors: Array[String]
) -> void:
	if host.game_audio_manager == null:
		host._build_game_audio_manager()
	await _disable_audio(host, errors)
	if not errors.is_empty():
		return
	host.player_profile = PlayerProgressModel.default_profile()
	var map_id := str(action.get("mapId", ""))
	if not host._load_map(map_id, "default"):
		errors.append("批量动作取证无法载入地图：%s" % map_id)
		return
	if host.has_method("_sync_player_mount_visual_if_needed"):
		host._sync_player_mount_visual_if_needed(true)
	if host.has_method("_mark_progress_ui_caches_dirty"):
		host._mark_progress_ui_caches_dirty()
	if host.has_method("_update_hud_text"):
		host._update_hud_text(true)
	if host.has_method("_layout_hud"):
		host._layout_hud()
	if host.has_method("_refresh_gm_visibility"):
		host._refresh_gm_visibility()
	for _frame_index in range(BETWEEN_ACTION_SETTLE_FRAMES):
		host.queue_redraw()
		await process_frame
	if str(host.current_map_id) != map_id:
		errors.append("批量动作取证地图切换不一致：%s" % map_id)
	var prepared := host.map_visual_render_state as Dictionary
	if (
		str(prepared.get("bundleId", "")) != str(action.get("bundleId", ""))
		or str(prepared.get("status", "")) != "owner_review_pending"
		or not bool(prepared.get("active", false))
		or not bool(prepared.get("qaPreview", false))
	):
		errors.append("批量动作取证没有准备 pending QA candidate：%s" % map_id)


func _disable_audio(host, errors: Array[String]) -> void:
	var manager = host.game_audio_manager
	if manager == null or not is_instance_valid(manager):
		errors.append("批量动作取证缺少有效 AudioManager")
		return
	for method_name in ["configure_playback_enabled", "stop_all", "debug_snapshot"]:
		if not manager.has_method(method_name):
			errors.append("批量动作取证 AudioManager 缺少 %s" % method_name)
			return
	manager.call("configure_playback_enabled", false)
	manager.call("stop_all")
	for _frame_index in range(BETWEEN_ACTION_SETTLE_FRAMES):
		await process_frame
	var snapshot_value: Variant = manager.call("debug_snapshot")
	var snapshot := snapshot_value as Dictionary if snapshot_value is Dictionary else {}
	if bool(snapshot.get("playbackEnabled", true)):
		errors.append("批量动作取证 AudioManager 未关闭播放")


func _runtime_identity() -> Dictionary:
	var viewport_size := Vector2i(root.get_visible_rect().size)
	var window_ids: Array[int] = []
	for window_id_value in DisplayServer.get_window_list():
		window_ids.append(int(window_id_value))
	window_ids.sort()
	var main_scene_count := 0
	for child in root.get_children():
		if str(child.scene_file_path) == MAIN_SCENE:
			main_scene_count += 1
	return {
		"processId": OS.get_process_id(),
		"processFrameOrigin": _process_frame_origin,
		"displayServer": DisplayServer.get_name(),
		"displayServerWindowCount": window_ids.size(),
		"displayServerWindowIds": window_ids,
		"rootWindowId": root.get_window_id(),
		"audioDriver": AudioServer.get_driver_name(),
		"mainSceneLoadCount": 1 if current_scene != null else 0,
		"mainSceneInstanceCount": main_scene_count,
		"viewport": [viewport_size.x, viewport_size.y],
	}


func _validate_runtime_identity(
	runtime_identity: Dictionary,
	errors: Array[String]
) -> void:
	if int(runtime_identity.get("processId", 0)) <= 0:
		errors.append("批量动作取证缺少有效 Godot processId")
	if str(runtime_identity.get("displayServer", "")).to_lower() == "headless":
		errors.append("批量动作取证禁止 headless DisplayServer")
	if int(runtime_identity.get("displayServerWindowCount", 0)) != 1:
		errors.append("批量动作取证运行时不是唯一 DisplayServer window")
	var root_window_id := int(runtime_identity.get("rootWindowId", -1))
	if runtime_identity.get("displayServerWindowIds", []) != [root_window_id]:
		errors.append("批量动作取证唯一 window 不是 root window")
	if str(runtime_identity.get("audioDriver", "")) != AUDIO_DRIVER:
		errors.append("批量动作取证没有使用 Dummy 音频驱动")
	if (
		int(runtime_identity.get("mainSceneLoadCount", 0)) != 1
		or int(runtime_identity.get("mainSceneInstanceCount", 0)) != 1
	):
		errors.append("批量动作取证没有保持唯一真实 Main.tscn 实例")
	if runtime_identity.get("viewport", []) != [
		EXPECTED_VIEWPORT.x,
		EXPECTED_VIEWPORT.y,
	]:
		errors.append("批量动作取证运行时 viewport identity 不一致")


func _window_identity_checkpoint(label: String, errors: Array[String]) -> Dictionary:
	var identity := _runtime_identity()
	var ids := identity.get("displayServerWindowIds", []) as Array
	var root_window_id := int(identity.get("rootWindowId", -1))
	if (
		int(identity.get("displayServerWindowCount", 0)) != 1
		or ids != [root_window_id]
		or (_root_window_id >= 0 and root_window_id != _root_window_id)
	):
		errors.append("批量动作 window identity 漂移：%s" % label)
	return {
		"label": label,
		"processFrame": Engine.get_process_frames(),
		"windowCount": int(identity.get("displayServerWindowCount", 0)),
		"windowIds": ids.duplicate(),
		"rootWindowId": root_window_id,
	}


func _print_progress(
	plan: Dictionary,
	plan_sha: String,
	action_index: int,
	stage: String
) -> void:
	print(
		"map visual action capture progress: %s"
		% JSON.stringify({
			"bundleId": str(plan.get("bundleId", "")),
			"planSha256": plan_sha,
			"actionIndex": action_index,
			"stage": stage,
			"processFrame": Engine.get_process_frames(),
			"rootWindowId": _root_window_id,
		})
	)


func _capture_request(action: Dictionary, bundle_id: String) -> Dictionary:
	var map_id := str(action.get("mapId", ""))
	return {
		"enabled": true,
		"qaPreviewFlagPresent": true,
		"qaPreviewMapId": map_id,
		"showcaseProfileRequested": bundle_id == "firebud_region_visual_v2",
		"mapId": map_id,
		"outputPath": str(action.get("outputPath", "")),
		"reportPath": str(action.get("reportPath", "")),
		"mode": str(action.get("mode", "")),
		"captureVariant": str(action.get("captureVariant", "")),
		"parseErrors": [],
	}


func _seal_action_report(
	report: Dictionary,
	action: Dictionary,
	plan: Dictionary,
	plan_sha: String,
	runtime_identity: Dictionary,
	action_window_identity: Dictionary,
	errors: Array[String]
) -> void:
	var report_path := str(action.get("reportPath", ""))
	if not FileAccess.file_exists(report_path):
		errors.append("批量动作 capture report 没有写出，无法绑定 batch identity")
		return
	var map_id := str(action.get("mapId", ""))
	var action_kind := str(action.get("actionKind", ""))
	var install_output_path := str(action.get("installOutputPath", ""))
	var install_report_path := str(action.get("installReportPath", ""))
	var write_output_path := str(action.get("outputPath", ""))
	# The focused legacy capture controller still uses its old in-memory request
	# fields as an internal validation adapter.  The persisted evidence records
	# the truthful CLI fact: this batch has no per-map preview flag.  Candidate
	# activation is instead authorized by this SHA-bound batch controller/plan.
	report["qaPreviewFlagPresent"] = false
	report["qaPreviewMapId"] = ""
	report["qaPreviewAuthorization"] = {
		"kind": "sha256_bound_batch_plan",
		"authorized": true,
		"cliPreviewFlagPresent": false,
		"controllerActivatedCandidatePreview": true,
		"planSha256": plan_sha,
		"bundleId": str(plan.get("bundleId", "")),
		"mapId": map_id,
		"actionKind": action_kind,
		"buildIdentity": str(plan.get("buildIdentity", "")),
		"bundleManifestSha256": str(
			(plan.get("bundleManifestIdentity", {}) as Dictionary).get("sha256", "")
		),
		"captureSurfaceIdentitySha256": str(
			plan.get("captureSurfaceIdentitySha256", "")
		),
	}
	report["batchPlanSha256"] = plan_sha
	report["batchSourceIdentity"] = (
		(plan.get("sourceIdentity", {}) as Dictionary).duplicate(true)
	)
	report["batchRuntimeIdentity"] = runtime_identity.duplicate(true)
	report["batchBuildIdentity"] = str(plan.get("buildIdentity", ""))
	report["batchBundleManifestIdentity"] = (
		(plan.get("bundleManifestIdentity", {}) as Dictionary).duplicate(true)
	)
	report["batchCaptureSurfaceIdentity"] = (
		(plan.get("captureSurfaceIdentity", {}) as Dictionary).duplicate(true)
	)
	report["batchCaptureSurfaceIdentitySha256"] = str(
		plan.get("captureSurfaceIdentitySha256", "")
	)
	report["batchWindowIdentity"] = action_window_identity.duplicate(true)
	report["captureWritePath"] = _portable_output_path(write_output_path)
	report["captureReportWritePath"] = _portable_output_path(report_path)
	report["screenshotPath"] = _portable_output_path(install_output_path)
	report["reportInstallPath"] = _portable_output_path(install_report_path)
	var screenshot_value: Variant = report.get("screenshot", {})
	if screenshot_value is Dictionary:
		var screenshot := screenshot_value as Dictionary
		if not screenshot.is_empty():
			screenshot["path"] = _portable_output_path(install_output_path)
			report["screenshot"] = screenshot
	report["batchReportSealed"] = true
	var file := FileAccess.open(report_path, FileAccess.WRITE)
	if file == null:
		errors.append("批量动作无法密封 batch-bound capture report")
		return
	file.store_string(JSON.stringify(report, "\t", false) + "\n")
	file.close()


func _portable_output_path(path: String) -> String:
	var simplified_path := path.simplify_path()
	var project_root := ProjectSettings.globalize_path("res://").simplify_path()
	var project_prefix := project_root + "/"
	if simplified_path.begins_with(project_prefix):
		return "res://" + simplified_path.trim_prefix(project_prefix)
	return simplified_path


func _read_and_validate_plan(
	plan_path: String,
	expected_sha: String,
	errors: Array[String]
) -> Dictionary:
	if not plan_path.is_absolute_path() or plan_path.get_extension().to_lower() != "json":
		errors.append("批量动作计划必须是绝对 JSON 路径")
		return {}
	var normalized_plan_path := _normalized_absolute_path(plan_path)
	var project_root := _normalized_absolute_path(
		ProjectSettings.globalize_path("res://")
	)
	var repo_root := project_root.get_base_dir().get_base_dir()
	var plan_root := repo_root.path_join(
		".run/evidence/map_visual_action_captures"
	)
	if not _path_is_inside(normalized_plan_path, plan_root):
		errors.append("批量动作计划逃出固定 .run evidence 根")
		return {}
	if _path_has_link_from_root(normalized_plan_path, repo_root):
		errors.append("批量动作计划路径不得穿过符号链接")
		return {}
	if not FileAccess.file_exists(plan_path):
		errors.append("批量动作计划不存在")
		return {}
	if not _is_sha256(expected_sha):
		errors.append("批量动作计划缺少有效 SHA-256 环境绑定")
		return {}
	# Hash and parse the exact same immutable byte buffer. Reading the path once
	# for the hash and again for JSON would allow a plan swap between the reads.
	var plan_file := FileAccess.open(plan_path, FileAccess.READ)
	if plan_file == null:
		errors.append("批量动作计划无法打开")
		return {}
	var plan_bytes := plan_file.get_buffer(plan_file.get_length())
	plan_file.close()
	var hash_context := HashingContext.new()
	if hash_context.start(HashingContext.HASH_SHA256) != OK:
		errors.append("批量动作计划 SHA-256 上下文初始化失败")
		return {}
	if hash_context.update(plan_bytes) != OK:
		errors.append("批量动作计划 SHA-256 更新失败")
		return {}
	var actual_sha := hash_context.finish().hex_encode()
	if actual_sha != expected_sha:
		errors.append("批量动作计划 SHA-256 与环境绑定不一致")
		return {}
	var parsed: Variant = JSON.parse_string(plan_bytes.get_string_from_utf8())
	if not (parsed is Dictionary):
		errors.append("批量动作计划根节点必须是对象")
		return {}
	var plan := parsed as Dictionary
	if int(plan.get("schemaVersion", 0)) != 1 or str(plan.get("reportType", "")) != REPORT_TYPE:
		errors.append("批量动作计划 schema/reportType 不受支持")
	var bundle_id := str(plan.get("bundleId", ""))
	if not BUNDLE_MAPS.has(bundle_id):
		errors.append("批量动作计划 bundleId 不受支持")
		return plan
	if plan.get("mapIds", []) != BUNDLE_MAPS[bundle_id]:
		errors.append("批量动作计划 mapIds 与固定 bundle 成员不一致")
	var lifecycle := plan.get("lifecycle", {}) as Dictionary
	if lifecycle != {
		"status": "owner_review_pending",
		"ownerReviewStatus": "pending",
		"releaseApproved": false,
		"runtimeEnabled": false,
	}:
		errors.append("批量动作计划没有保持 pending 失败关闭生命周期")
	_validate_source_identity(plan.get("sourceIdentity", {}), errors)
	_validate_capture_freeze(plan, errors)
	_validate_actions(plan, plan_path, errors)
	return plan


func _validate_source_identity(value: Variant, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("批量动作计划缺少 sourceIdentity")
		return
	var identity := value as Dictionary
	if identity.size() != SOURCE_PATHS.size():
		errors.append("批量动作计划 sourceIdentity 数量不精确")
	for key_value in SOURCE_PATHS.keys():
		var key := str(key_value)
		var record_value: Variant = identity.get(key, {})
		if not (record_value is Dictionary):
			errors.append("批量动作 sourceIdentity 缺少 %s" % key)
			continue
		var record := record_value as Dictionary
		var expected_path := str(SOURCE_PATHS[key])
		if str(record.get("path", "")) != expected_path:
			errors.append("批量动作 sourceIdentity 路径不一致：%s" % key)
			continue
		var expected_sha := str(record.get("sha256", ""))
		if not _is_sha256(expected_sha):
			errors.append("批量动作 sourceIdentity SHA 无效：%s" % key)
			continue
		var absolute_path := _source_absolute_path(expected_path)
		var repo_root := _normalized_absolute_path(
			ProjectSettings.globalize_path("res://")
		).get_base_dir().get_base_dir()
		if absolute_path == "" or not _path_is_inside(absolute_path, repo_root):
			errors.append("批量动作 sourceIdentity 路径越界：%s" % key)
			continue
		if _path_has_link_from_root(absolute_path, repo_root):
			errors.append("批量动作 sourceIdentity 穿过符号链接：%s" % key)
			continue
		if not FileAccess.file_exists(absolute_path):
			errors.append("批量动作 sourceIdentity 文件不存在：%s" % key)
		elif FileAccess.get_sha256(absolute_path) != expected_sha:
			errors.append("批量动作 sourceIdentity 字节漂移：%s" % key)


func _validate_capture_freeze(plan: Dictionary, errors: Array[String]) -> void:
	var bundle_id := str(plan.get("bundleId", ""))
	var build_identity := str(plan.get("buildIdentity", ""))
	if not _is_build_identity(build_identity):
		errors.append("批量动作 buildIdentity 无效")
	var manifest_value: Variant = plan.get("bundleManifestIdentity", {})
	if not (manifest_value is Dictionary):
		errors.append("批量动作缺少 bundle manifest identity")
	else:
		var manifest_identity := manifest_value as Dictionary
		var expected_manifest_path := (
			"client/godot/assets/maps/%s/map-visual-bundle.json" % bundle_id
		)
		if (
			manifest_identity.get("path") != expected_manifest_path
			or manifest_identity.get("canonicalization") != "map_runtime_subject_v1"
			or not _is_sha256(str(manifest_identity.get("sha256", "")))
		):
			errors.append("批量动作 bundle manifest identity 路径不精确")
	var surface_value: Variant = plan.get("captureSurfaceIdentity", {})
	if not (surface_value is Dictionary) or (surface_value as Dictionary).is_empty():
		errors.append("批量动作缺少候选关键来源冻结")
		return
	if not _is_sha256(str(plan.get("captureSurfaceIdentitySha256", ""))):
		errors.append("批量动作候选关键来源摘要无效")
	for path_value in (surface_value as Dictionary).keys():
		var relative_path := str(path_value)
		if relative_path == (
			"client/godot/assets/maps/%s/map-visual-bundle.json" % bundle_id
		):
			if str((surface_value as Dictionary).get(path_value, "")) != str(
				(plan.get("bundleManifestIdentity", {}) as Dictionary).get("sha256", "")
			):
				errors.append("批量动作 manifest runtime subject 摘要不一致")
			continue
		_validate_repo_relative_sha(
			relative_path,
			str((surface_value as Dictionary).get(path_value, "")),
			"候选关键来源",
			errors
		)


func _validate_repo_relative_sha(
	relative_path: String,
	expected_sha: String,
	label: String,
	errors: Array[String]
) -> void:
	if relative_path.is_absolute_path() or ".." in relative_path.split("/", false):
		errors.append("批量动作 %s 路径越界" % label)
		return
	var project_root := _normalized_absolute_path(
		ProjectSettings.globalize_path("res://")
	)
	var repo_root := project_root.get_base_dir().get_base_dir()
	var absolute_path := _normalized_absolute_path(repo_root.path_join(relative_path))
	if (
		not _path_is_inside(absolute_path, repo_root)
		or _path_has_link_from_root(absolute_path, repo_root)
		or not FileAccess.file_exists(absolute_path)
		or not _is_sha256(expected_sha)
		or FileAccess.get_sha256(absolute_path) != expected_sha
	):
		errors.append("批量动作 %s 字节漂移：%s" % [label, relative_path])


func _validate_actions(
	plan: Dictionary,
	plan_path: String,
	errors: Array[String]
) -> void:
	var bundle_id := str(plan.get("bundleId", ""))
	var allowed_maps := BUNDLE_MAPS.get(bundle_id, []) as Array
	var actions_value: Variant = plan.get("actions", [])
	if not (actions_value is Array) or (actions_value as Array).is_empty():
		errors.append("批量动作计划 actions 必须是非空数组")
		return
	var actions := actions_value as Array
	if actions.size() > allowed_maps.size() * ACTION_MODES.size():
		errors.append("批量动作计划数量超过固定矩阵")
	var seen: Dictionary = {}
	var output_paths: Dictionary = {}
	var project_root := _normalized_absolute_path(
		ProjectSettings.globalize_path("res://")
	)
	var repo_root := project_root.get_base_dir().get_base_dir()
	var formal_prefix := (
		project_root
		+ "/assets/maps/"
		+ bundle_id
		+ "/evidence/runtime-actions/"
	)
	var bundle_run_root := (
		repo_root
		+ "/.run/evidence/map_visual_action_captures/"
		+ bundle_id
	)
	var run_root := _run_root_from_plan_path(plan_path, bundle_run_root)
	if run_root == "":
		errors.append("批量动作计划目录不是固定 single-window-batch 结构")
		return
	var batch_run := _normalized_absolute_path(plan_path).get_base_dir()
	var output_mode := str(plan.get("outputMode", ""))
	var expected_output_root := ""
	var expected_install_root := ""
	if output_mode == "scratch":
		expected_output_root = run_root.path_join("scratch-actions")
		expected_install_root = expected_output_root
	elif output_mode == "formal_staging":
		expected_output_root = batch_run.path_join("staged-actions")
		expected_install_root = formal_prefix.trim_suffix("/")
	else:
		errors.append("批量动作 outputMode 不受支持")
		return
	var output_root := _normalized_absolute_path(str(plan.get("outputRoot", "")))
	var install_root := _normalized_absolute_path(str(plan.get("installRoot", "")))
	if output_root != expected_output_root:
		errors.append("批量动作 outputRoot 与固定模式不一致")
	if install_root != expected_install_root:
		errors.append("批量动作 installRoot 与固定模式不一致")
	for guarded_path in [run_root, batch_run, output_root, install_root]:
		if not _path_is_inside(guarded_path, repo_root):
			errors.append("批量动作路径越出仓库：%s" % guarded_path)
		elif _path_has_link_from_root(guarded_path, repo_root):
			errors.append("批量动作路径不得穿过符号链接：%s" % guarded_path)
	for action_value in actions:
		if not (action_value is Dictionary):
			errors.append("批量动作条目必须是对象")
			continue
		var action := action_value as Dictionary
		var map_id := str(action.get("mapId", ""))
		var action_kind := str(action.get("actionKind", ""))
		var mode := str(action.get("mode", ""))
		var key := "%s/%s" % [map_id, action_kind]
		if not allowed_maps.has(map_id):
			errors.append("批量动作 mapId 不属于 bundle：%s" % map_id)
		if not ACTION_MODES.has(action_kind):
			errors.append("批量动作 actionKind 不受支持：%s" % action_kind)
		elif mode != str(ACTION_MODES[action_kind]):
			errors.append("批量动作 mode 不匹配：%s" % key)
		if str(action.get("captureVariant", "")) != action_kind:
			errors.append("批量动作 captureVariant 不匹配：%s" % key)
		if str(action.get("bundleId", "")) != bundle_id:
			errors.append("批量动作 bundleId 不匹配：%s" % key)
		if seen.has(key):
			errors.append("批量动作重复：%s" % key)
		seen[key] = true
		var output_path := _normalized_absolute_path(
			str(action.get("outputPath", ""))
		)
		var report_path := _normalized_absolute_path(
			str(action.get("reportPath", ""))
		)
		var install_output_path := _normalized_absolute_path(
			str(action.get("installOutputPath", ""))
		)
		var install_report_path := _normalized_absolute_path(
			str(action.get("installReportPath", ""))
		)
		if (
			not output_path.is_absolute_path()
			or output_path.get_extension().to_lower() != "png"
			or output_path.get_file() != "%s.png" % action_kind
		):
			errors.append("批量动作截图路径无效：%s" % key)
		if (
			not report_path.is_absolute_path()
			or report_path.get_extension().to_lower() != "json"
			or report_path.get_file() != "%s-capture.json" % action_kind
		):
			errors.append("批量动作报告路径无效：%s" % key)
		var expected_output_path := output_root.path_join(
			"%s/%s.png" % [map_id, action_kind]
		)
		var expected_report_path := output_root.path_join(
			"%s/%s-capture.json" % [map_id, action_kind]
		)
		var expected_install_output_path := install_root.path_join(
			"%s/%s.png" % [map_id, action_kind]
		)
		var expected_install_report_path := install_root.path_join(
			"%s/%s-capture.json" % [map_id, action_kind]
		)
		if output_path != expected_output_path:
			errors.append("批量动作截图路径不是固定精确目标：%s" % key)
		if report_path != expected_report_path:
			errors.append("批量动作报告路径不是固定精确目标：%s" % key)
		if install_output_path != expected_install_output_path:
			errors.append("批量动作截图安装路径不是固定精确目标：%s" % key)
		if install_report_path != expected_install_report_path:
			errors.append("批量动作报告安装路径不是固定精确目标：%s" % key)
		for path in [
			output_path,
			report_path,
			install_output_path,
			install_report_path,
		]:
			if _path_has_link_from_root(path, repo_root):
				errors.append("批量动作文件路径不得穿过符号链接：%s" % path)
		for path in [output_path, report_path]:
			if FileAccess.file_exists(path):
				errors.append("批量动作写入目标必须尚不存在：%s" % path)
			if output_paths.has(path):
				errors.append("批量动作输出路径重复：%s" % path)
			output_paths[path] = true


static func _exact_json_number(value: Variant, expected: int) -> bool:
	return (value is int or value is float) and value == expected


static func action_window_contract_matches(value: Variant) -> bool:
	if not (value is Dictionary) or value.size() != 5:
		return false
	for key in ["godotProcessCount", "userVisibleWindowOpenCount", "userVisibleWindowCloseCount"]:
		if not _exact_json_number(value.get(key), 1):
			return false
	if not (value.get("singlePersistentWindow") is bool) or not value["singlePersistentWindow"]:
		return false
	var viewport: Variant = value.get("viewport")
	return (
		viewport is Array and viewport.size() == 2
		and _exact_json_number(viewport[0], EXPECTED_VIEWPORT.x)
		and _exact_json_number(viewport[1], EXPECTED_VIEWPORT.y)
	)


static func action_launch_contract_matches(value: Variant) -> bool:
	return (
		value is Dictionary and value.size() == 5
		and value.get("entrypoint") == "standalone_scene_tree_script"
		and _exact_json_number(value.get("mainSceneLoadCount"), 1)
		and value.get("audioDriver") == AUDIO_DRIVER
		and value.get("perMapPreviewCliFlags") is bool
		and not value["perMapPreviewCliFlags"]
		and value.get("previewAuthorization") == "sha256_bound_batch_plan"
	)


func _validate_invocation(plan: Dictionary, errors: Array[String]) -> void:
	var args := OS.get_cmdline_user_args()
	for arg_value in args:
		var arg := str(arg_value)
		if arg != QA_LANE_ARG:
			errors.append("批量动作取证不接受无关参数：%s" % arg)
	if args.count(QA_LANE_ARG) != 1:
		errors.append("批量动作取证缺少唯一 automation QA lane 参数")
	if args.size() != 1:
		errors.append("批量动作取证 user args 必须只有 QA lane")
	# JSON.parse_string represents JSON numbers as float. Nested container
	# equality against int literals rejects a valid plan; compare exact values
	# and types without rounding or accepting strings/bools as counts.
	if not action_window_contract_matches(plan.get("windowContract")):
		errors.append("批量动作计划没有固定为单进程单窗口")
	if not action_launch_contract_matches(plan.get("launchContract")):
		errors.append("批量动作计划 launchContract 不精确")


func _drain_host_audio_if_present(host) -> Dictionary:
	if host == null or not is_instance_valid(host):
		return {"status": "not_required", "reason": "host_missing"}
	if host.game_audio_manager == null or not is_instance_valid(host.game_audio_manager):
		return {"status": "not_required", "reason": "already_drained"}
	var controller := MapVisualReviewCapture.new(host)
	return await controller._drain_capture_runtime()


func _finish(
	plan: Dictionary,
	completed: Array[Dictionary],
	errors: Array[String],
	plan_sha: String,
	runtime_identity: Dictionary,
	final_cleanup: Dictionary,
	window_lifecycle: Dictionary = {}
) -> void:
	var actions_value: Variant = plan.get("actions", [])
	var action_count := (
		(actions_value as Array).size()
		if actions_value is Array
		else 0
	)
	var passed := errors.is_empty() and completed.size() == action_count
	var visible_window_count := int(
		runtime_identity.get("displayServerWindowCount", 0)
	)
	var receipt := {
		"status": "passed" if passed else "failed",
		"result": "PASS" if passed else "FAIL",
		"scene": MAIN_SCENE,
		"bundleId": str(plan.get("bundleId", "")),
		"planSha256": plan_sha,
		"actionCount": action_count,
		"completedActionCount": completed.size(),
		"godotProcessCount": 1,
		"userVisibleWindowOpenCount": visible_window_count,
		"singlePersistentWindow": true,
		"viewport": [EXPECTED_VIEWPORT.x, EXPECTED_VIEWPORT.y],
		"sourceIdentity": plan.get("sourceIdentity", {}),
		"buildIdentity": plan.get("buildIdentity", ""),
		"bundleManifestIdentity": plan.get("bundleManifestIdentity", {}),
		"captureSurfaceIdentity": plan.get("captureSurfaceIdentity", {}),
		"captureSurfaceIdentitySha256": plan.get(
			"captureSurfaceIdentitySha256", ""
		),
		"runtimeIdentity": runtime_identity,
		"windowCountEvidence": {
			"displayServerWindowCountDuringCapture": visible_window_count,
			"singleWindowEngineFlagRequiredByPlan": true,
			"windowLifecycle": window_lifecycle,
		},
		"finalCleanup": final_cleanup,
		"processFrameCount": maxi(
			0,
			Engine.get_process_frames() - _process_frame_origin
		),
		"lifecycle": plan.get("lifecycle", {}),
		"actions": completed,
		"errors": errors,
	}
	print("map visual action capture batch: %s" % JSON.stringify(receipt))
	quit(0 if passed else 1)


func _normalized_absolute_path(path: String) -> String:
	if path.strip_edges() == "":
		return ""
	return path.replace("\\", "/").simplify_path().trim_suffix("/")


func _path_is_inside(path: String, root_path: String) -> bool:
	if path == "" or root_path == "":
		return false
	return path == root_path or path.begins_with("%s/" % root_path)


func _path_has_link_from_root(path: String, root_path: String) -> bool:
	if not _path_is_inside(path, root_path):
		return true
	var current := root_path
	if _entry_is_link(current):
		return true
	var relative := path.trim_prefix(root_path).trim_prefix("/")
	if relative == "":
		return false
	for component in relative.split("/", false):
		current = current.path_join(component)
		if _entry_is_link(current):
			return true
	return false


func _entry_is_link(path: String) -> bool:
	var parent := DirAccess.open(path.get_base_dir())
	return parent != null and parent.is_link(path.get_file())


func _source_absolute_path(path: String) -> String:
	if path.begins_with("res://"):
		return _normalized_absolute_path(ProjectSettings.globalize_path(path))
	if path.begins_with("repo://"):
		var project_root := _normalized_absolute_path(
			ProjectSettings.globalize_path("res://")
		)
		var repo_root := project_root.get_base_dir().get_base_dir()
		return repo_root.path_join(path.trim_prefix("repo://"))
	return ""


func _run_root_from_plan_path(plan_path: String, bundle_root: String) -> String:
	var normalized_plan := _normalized_absolute_path(plan_path)
	var normalized_bundle_root := _normalized_absolute_path(bundle_root)
	if not _path_is_inside(normalized_plan, normalized_bundle_root):
		return ""
	var plan_dir := normalized_plan.get_base_dir()
	if plan_dir.get_file() == "single-window-batch":
		var direct_run_root := plan_dir.get_base_dir()
		return (
			direct_run_root
			if direct_run_root.get_base_dir() == normalized_bundle_root
			else ""
		)
	var parent := plan_dir.get_base_dir()
	if parent.get_file() != "single-window-batch":
		return ""
	var resume_name := plan_dir.get_file()
	if not resume_name.begins_with("resume-"):
		return ""
	var resume_number := resume_name.trim_prefix("resume-")
	if (
		resume_number.length() != 2
		or not resume_number.substr(0, 1).is_valid_int()
		or not resume_number.substr(1, 1).is_valid_int()
		or int(resume_number) < 1
		or int(resume_number) > 99
	):
		return ""
	var resumed_run_root := parent.get_base_dir()
	return (
		resumed_run_root
		if resumed_run_root.get_base_dir() == normalized_bundle_root
		else ""
	)


func _is_build_identity(value: String) -> bool:
	var git_prefix := "git:"
	var separator := "+%s:" % BUILD_IDENTITY_NAMESPACE
	var separator_offset := git_prefix.length() + 40
	if (
		value.length() != separator_offset + separator.length() + 64
		or not value.begins_with(git_prefix)
		or value.substr(separator_offset, separator.length()) != separator
	):
		return false
	return (
		_is_lower_hex(value.substr(git_prefix.length(), 40), 40)
		and _is_sha256(value.substr(separator_offset + separator.length(), 64))
	)


func _is_sha256(value: String) -> bool:
	return _is_lower_hex(value, 64)


func _is_lower_hex(value: String, expected_length: int) -> bool:
	if value.length() != expected_length or value != value.to_lower():
		return false
	for index in range(value.length()):
		if not "0123456789abcdef".contains(value.substr(index, 1)):
			return false
	return true
