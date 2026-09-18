extends SceneTree

## Low-disturbance Earth Vein owner-review capture.
##
## One process creates the real Main.tscn exactly once, then keeps that native
## window alive while it records all four floor idle/moving subjects and the F4
## landmark subject.  The Python recorder runs this script once natively and
## once with MovieWriter; it never launches a Godot process per segment.

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const MapVisualRenderer := preload(
	"res://scripts/world/map_visual_renderer.gd"
)
const MapVisualReviewCapture := preload(
	"res://scripts/qa/map_visual_review_capture.gd"
)
const RuntimeExitCleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")
const ReviewCaptureRenderPump := preload("res://scripts/qa/review_capture_render_pump.gd")

const MAIN_SCENE := "res://scenes/Main.tscn"
const BUNDLE_ID := "earth_vein_cave_visual_v1"
const MAP_IDS: Array[String] = [
	"earth_vein_cave",
	"earth_vein_cave_f2",
	"earth_vein_cave_f3",
	"earth_vein_cave_f4",
]
const MODES: Array[String] = ["idle", "moving"]
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const EXPECTED_FPS := 30
const EXPECTED_AUDIO_DRIVER := "Dummy"
const QA_LANE_ARG := "--beastbound-qa-user-data-lane=automation"
const REVIEW_AUTH_ENV := "BEASTBOUND_EARTH_REVIEW_BATCH_AUTH"
const REVIEW_AUTH_SHA_ENV := "BEASTBOUND_EARTH_REVIEW_BATCH_AUTH_SHA256"
const REVIEW_AUTH_REPORT_TYPE := (
	"beastbound_earth_vein_low_disturbance_review_authorization"
)
const ARG_OUTPUT_ROOT_PREFIX := "--earth-vein-review-batch-output-root="
const ARG_REPORT_PREFIX := "--earth-vein-review-batch-report="
const ARG_PASS_PREFIX := "--earth-vein-review-batch-pass="
const VALID_PASSES: Array[String] = ["native", "movie"]
const STARTUP_FRAME_LIMIT := 180
const MAP_SETTLE_FRAMES := 24
const LANDMARK_START_CELL := Vector2i(20, 16)
const LANDMARK_TARGET_CELL := Vector2i(22, 11)
const LANDMARK_MOVE_FRAME_LIMIT := 240
const LANDMARK_HOLD_FRAMES := 120
const LANDMARK_IDS: Array[String] = [
	"f4_guardian_plinth",
	"f4_lineage_plinth",
]
const HARNESS_PATHS: Array[String] = [
	"res://scripts/qa/earth_vein_review_batch_capture.gd",
	"res://scripts/qa/map_visual_review_capture.gd",
	"res://scripts/qa/runtime_exit_cleanup.gd",
	"res://scripts/qa/review_capture_render_pump.gd",
	"res://scripts/audio/game_audio_manager.gd",
	"res://scripts/audio/battle_audio_timeline_controller.gd",
	"res://scripts/audio/battle_audio_cue_model.gd",
	"res://assets/audio/beastbound_audio_v2/audio-cues.json",
	"res://data/audio_ambience_release_gate_v1.json",
	"res://scripts/world/isometric_map_model.gd",
	"res://scripts/world/interaction_model.gd",
	"res://scripts/progression/player_progress_model.gd",
	"res://scripts/world/map_visual_catalog.gd",
	"res://scripts/world/map_visual_renderer.gd",
	"res://scripts/world/world_camera_safe_area_model.gd",
	"res://scripts/qa/map_visual_review_showcase_profile.gd",
	"res://scenes/Main.tscn",
	"res://scripts/main.gd",
]

var _process_frame_origin := 0
var _authorized_output_root := ""
var _authorized_report_path := ""
var _root_window_id := -1


func _initialize() -> void:
	_process_frame_origin = Engine.get_process_frames()
	call_deferred("_run")


func _run() -> void:
	var invocation := _invocation_from_args()
	var errors: Array[String] = _string_array(invocation.get("errors", []))
	var review_authorization := _read_and_validate_review_authorization(errors)
	var output_root := str(invocation.get("outputRoot", ""))
	var report_path := str(invocation.get("reportPath", ""))
	var capture_pass := str(invocation.get("capturePass", ""))
	if not errors.is_empty():
		print(
			"earth vein review batch authorization rejected: %s"
			% JSON.stringify({"result": "FAIL", "errors": errors})
		)
		quit(1)
		return
	_validate_invocation(output_root, report_path, capture_pass, errors)
	if not errors.is_empty():
		# An untrusted path never reaches any writer, directory creation, Main
		# startup, or cleanup side effect.  Invalid invocations are log-only.
		print(
			"earth vein review batch invocation rejected: %s"
			% JSON.stringify({"result": "FAIL", "errors": errors})
		)
		quit(1)
		return
	if _process_frame_origin != 0:
		errors.append(
			"MovieWriter 零基帧映射要求 process frame origin 精确为 0"
		)
	_root_window_id = root.get_window_id()
	var original_window_position := root.position
	root.size = EXPECTED_VIEWPORT
	root.content_scale_size = EXPECTED_VIEWPORT
	# Godot forbids hiding its root Window. Minimize it while Main is
	# initialized, then restore the same native window after isolation.
	if not await _settle_root_window_mode(Window.MODE_MINIMIZED):
		errors.append("批量 Main 窗口未在 8 秒内最小化")
	var pre_main_runtime_identity := _runtime_identity()
	if (
		int(pre_main_runtime_identity.get("rootWindowMode", -1))
		!= Window.MODE_MINIMIZED
		or int(pre_main_runtime_identity.get("displayServerWindowCount", 0)) != 1
		or pre_main_runtime_identity.get("displayServerWindowIds", [])
		!= [_root_window_id]
		or int(pre_main_runtime_identity.get("rootWindowId", -1))
		!= _root_window_id
		or int(pre_main_runtime_identity.get("mainSceneInstanceCount", -1)) != 0
		or str(pre_main_runtime_identity.get("audioDriver", ""))
		!= EXPECTED_AUDIO_DRIVER
	):
		errors.append("Main 启动前 root window/Main/audio identity 不精确")
	if not errors.is_empty():
		print(
			"earth vein review batch pre-Main isolation rejected: %s"
			% JSON.stringify({"result": "FAIL", "errors": errors, "runtimeIdentity": pre_main_runtime_identity})
		)
		quit(1)
		return
	var main_scene_load_success_count := 0
	var scene_error := change_scene_to_file(MAIN_SCENE)
	if scene_error != OK:
		errors.append(
			"无法加载真实 Main.tscn：%s" % error_string(scene_error)
		)
	else:
		main_scene_load_success_count = 1

	var host = null
	for _frame_index in range(STARTUP_FRAME_LIMIT):
		host = current_scene
		if (
			host != null
			and str(host.scene_file_path) == MAIN_SCENE
			and host.player != null
			and not host.map_data.is_empty()
			and host.game_camera != null
			and host.game_audio_manager != null
		):
			break
		await process_frame
	if (
		host == null
		or str(host.scene_file_path) != MAIN_SCENE
		or host.player == null
		or host.map_data.is_empty()
		or host.game_camera == null
		or host.game_audio_manager == null
	):
		errors.append("真实 Main.tscn 未在最小化窗口的帧上限内完成启动")

	var stages: Array[Dictionary] = []
	var startup_isolation := {}
	if host != null and errors.is_empty():
		startup_isolation = _configure_isolated_batch_host(host)
		var startup_audio := await _disable_audio_without_free(host)
		startup_isolation["audioIsolation"] = startup_audio
		startup_isolation["rootMinimizedUntilIsolationComplete"] = (
			int(pre_main_runtime_identity.get("rootWindowMode", -1))
			== Window.MODE_MINIMIZED
		)
		if str(startup_audio.get("status", "failed")) != "passed":
			startup_isolation["status"] = "failed"
		if str(startup_isolation.get("status", "failed")) != "passed":
			errors.append("Main 预览启动隔离未在首段取证前收口")
	var capture_frame_start := Engine.get_process_frames() - _process_frame_origin
	if host != null and errors.is_empty():
		root.position = original_window_position
		if not await _settle_root_window_mode(Window.MODE_WINDOWED):
			errors.append("批量 Main 窗口未在 8 秒内恢复到 windowed")
		capture_frame_start = Engine.get_process_frames() - _process_frame_origin
	var initial_runtime_identity := _runtime_identity_checkpoint("initial", errors)
	var render_pump = null
	if host != null and errors.is_empty():
		render_pump = ReviewCaptureRenderPump.new()
		render_pump.start(root)
	if host != null and errors.is_empty():
		for map_id in MAP_IDS:
			for mode in MODES:
				var before_identity := _runtime_identity_checkpoint(
					"%s:%s:before" % [map_id, mode],
					errors
				)
				var stage := await _run_floor_stage(
					host,
					output_root,
					map_id,
					mode,
					capture_pass
				)
				var after_identity := _runtime_identity_checkpoint(
					"%s:%s:after" % [map_id, mode],
					errors
				)
				stage["runtimeIdentity"] = {
					"before": before_identity,
					"after": after_identity,
				}
				stages.append(stage)
				print(
					"earth vein review batch segment: %s"
					% JSON.stringify(stage)
				)
				if str(stage.get("result", "FAIL")) != "PASS":
					errors.append(
						"四层批量片段失败：%s:%s"
						% [map_id, mode]
					)
					break
			if not errors.is_empty():
				break
	if host != null and errors.is_empty():
		var landmark_before_identity := _runtime_identity_checkpoint(
			"earth_vein_cave_f4:landmark:before",
			errors
		)
		var landmark_stage := await _run_landmark_stage(
			host,
			output_root,
			capture_pass
		)
		var landmark_after_identity := _runtime_identity_checkpoint(
			"earth_vein_cave_f4:landmark:after",
			errors
		)
		landmark_stage["runtimeIdentity"] = {
			"before": landmark_before_identity,
			"after": landmark_after_identity,
		}
		stages.append(landmark_stage)
		print(
			"earth vein review batch landmark: %s"
			% JSON.stringify(landmark_stage)
		)
		if str(landmark_stage.get("result", "FAIL")) != "PASS":
			errors.append("F4 landmark 批量片段失败")

	# Landmark already owns the final awaited cleanup.  No process frame may be
	# advanced after its endExclusive; MovieWriter adds only its documented
	# terminal frame when quit() closes the persistent root window.
	var render_continuity := {}
	if render_pump != null:
		render_continuity = render_pump.stop()
		if str(render_continuity.get("result", "FAIL")) != "PASS":
			errors.append("审片期间存在未绘制的逻辑帧，不能接受重复画面录像")
	var final_cleanup := {
		"status": "not_required",
		"reason": "last_stage_already_drained",
	}
	var final_runtime_identity := _runtime_identity_checkpoint("final", errors)
	var process_frame_end_exclusive := (
		Engine.get_process_frames() - _process_frame_origin
	)
	var last_segment_end_exclusive := _last_stage_end_exclusive(stages)
	if last_segment_end_exclusive != process_frame_end_exclusive:
		errors.append("最后 segment 未精确闭合 processFrameEndExclusive")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound_earth_vein_low_disturbance_review_batch",
		"generatedAtUtc": "%sZ" % Time.get_datetime_string_from_system(true),
		"result": "PASS" if errors.is_empty() else "FAIL",
		"ok": errors.is_empty(),
		"bundleId": BUNDLE_ID,
		"ownerReviewStatus": "pending",
		"capturePass": capture_pass,
		"scene": MAIN_SCENE,
		"viewport": [EXPECTED_VIEWPORT.x, EXPECTED_VIEWPORT.y],
		"fps": EXPECTED_FPS,
		"playbackSpeed": 1.0,
		"displayServer": DisplayServer.get_name(),
		"mainSceneLoadCount": main_scene_load_success_count,
		"mainSceneInstanceCount": int(
			final_runtime_identity.get("mainSceneInstanceCount", 0)
		),
		"godotProcessInstanceCount": 1,
		"windowLifecycle": "persistent_single_window",
		"windowOpenCloseCycles": int(
			final_runtime_identity.get("displayServerWindowCount", 0)
		),
		"rootWindowId": _root_window_id,
		"runtimeIdentity": {
			"preMain": pre_main_runtime_identity,
			"initial": initial_runtime_identity,
			"final": final_runtime_identity,
		},
		"reviewAuthorization": review_authorization,
		"processFrameOrigin": _process_frame_origin,
		"movieWriterFrameOrigin": 0,
		"frameIndexContract": "zero_based_start_inclusive_end_exclusive_v1",
		"preRollFrameCount": capture_frame_start,
		"captureFrameStartInclusive": capture_frame_start,
		"processFrameEndExclusive": process_frame_end_exclusive,
		"lastSegmentEndExclusive": last_segment_end_exclusive,
		"movieWriterExportFrameRange": {
			"indexBasis": "movie_writer_zero_based_v1",
			"startFrameInclusive": capture_frame_start,
			"endFrameExclusive": process_frame_end_exclusive,
			"frameCount": process_frame_end_exclusive - capture_frame_start,
		},
		# Godot MovieWriter emits one final frame while SceneTree.quit() closes
		# the persistent window.  This is outside every review stage range.
		"movieWriterTerminalFrameCount": 1,
		"movieWriterExpectedFrameCount": (
			process_frame_end_exclusive + 1
		),
		"startupIsolation": startup_isolation,
		"renderContinuity": render_continuity,
		"fourFloorSegmentCount": _floor_stage_count(stages),
		"landmarkSegmentCount": _landmark_stage_count(stages),
		"captureSequence": _capture_sequence(stages),
		"stages": stages,
		"harnessHashes": _harness_hashes(),
		"finalCleanup": final_cleanup,
		"errors": errors,
	}
	if not _write_report(report_path, report):
		errors.append("批量 report 无法以 atomic/exclusive 模式写入")
	report["errors"] = errors
	report["ok"] = errors.is_empty()
	report["result"] = "PASS" if errors.is_empty() else "FAIL"
	print("earth vein review batch capture: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


func _configure_isolated_batch_host(host) -> Dictionary:
	# Main has already completed normal construction.  Keep the real player HUD
	# and runtime scene, then close every account/save escape hatch before any
	# batch movement.  Preview startup may have installed a dev-GM session, so
	# clearing only the booleans is insufficient: clear the session and restore
	# the exact default profile before MapVisualReviewCapture checks isolation.
	host.profile_save_enabled = false
	host.profile_save_pending = false
	host.account_authenticated = false
	host.auth_auto_bypass = false
	host.auth_request_pending = false
	host.current_account_session = {}
	host.startup_auth_username = ""
	host.startup_auth_password = ""
	host.startup_auth_base_url = ""
	host.player_profile = PlayerProgressModel.default_profile()
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	host.gm_tool_server_access_state = {}
	host.gm_tool_server_access_request_pending = false
	host.gm_tool_server_access_generation += 1
	host.map_art_review_preview = true
	host.map_visual_review_capture = true
	if host.has_method("_stop_server_event_stream"):
		host._stop_server_event_stream()
	if host.has_method("_stop_online_position_sync"):
		host._stop_online_position_sync()
	if host.auth_panel != null and host.auth_panel.visible:
		host._close_auth_panel(false)
	if host.has_method("_close_account_panel"):
		host._close_account_panel(false)
	if host.has_method("_close_qa_panel"):
		host._close_qa_panel(false)
	if host.has_method("_close_numeric_workbench_panel"):
		host._close_numeric_workbench_panel(false)
	var gm_visibility_refreshed: bool = host.has_method("_refresh_gm_visibility")
	if gm_visibility_refreshed:
		host._refresh_gm_visibility()
	# Explicit hiding is deliberate defense in depth against stale panel state.
	for item in [host.qa_menu_button, host.qa_panel, host.numeric_workbench_panel]:
		if item is CanvasItem:
			(item as CanvasItem).visible = false
	if host.has_method("_sync_player_mount_visual_if_needed"):
		host.call("_sync_player_mount_visual_if_needed", true)
	if host.has_method("_mark_progress_ui_caches_dirty"):
		host.call("_mark_progress_ui_caches_dirty")
	host._layout_hud()
	host._update_hud_text(true)
	host.queue_redraw()
	var auth_panel_hidden: bool = host.auth_panel == null or not host.auth_panel.visible
	var qa_menu_hidden: bool = host.qa_menu_button == null or not host.qa_menu_button.visible
	var qa_panel_hidden: bool = host.qa_panel == null or not host.qa_panel.visible
	var workbench_hidden: bool = (
		host.numeric_workbench_panel == null
		or not host.numeric_workbench_panel.visible
	)
	var account_session_cleared: bool = (
		host.current_account_session is Dictionary
		and (host.current_account_session as Dictionary).is_empty()
		and not host._is_server_account_session()
	)
	var default_profile_restored: bool = (
		host.player_profile == PlayerProgressModel.default_profile()
	)
	var passed: bool = (
		account_session_cleared
		and default_profile_restored
		and not host.account_authenticated
		and not host.auth_auto_bypass
		and not host.profile_save_enabled
		and gm_visibility_refreshed
		and auth_panel_hidden
		and qa_menu_hidden
		and qa_panel_hidden
		and workbench_hidden
	)
	return {
		"status": "passed" if passed else "failed",
		"accountSessionCleared": account_session_cleared,
		"defaultProfileRestored": default_profile_restored,
		"accountAuthenticated": bool(host.account_authenticated),
		"authAutoBypass": bool(host.auth_auto_bypass),
		"profileSaveEnabled": bool(host.profile_save_enabled),
		"gmVisibilityRefreshed": gm_visibility_refreshed,
		"authPanelHidden": auth_panel_hidden,
		"qaMenuHidden": qa_menu_hidden,
		"qaPanelHidden": qa_panel_hidden,
		"numericWorkbenchHidden": workbench_hidden,
	}


func _run_floor_stage(
	host,
	output_root: String,
	map_id: String,
	mode: String,
	capture_pass: String
) -> Dictionary:
	var prefix := "%s-%s" % [map_id, mode]
	var screenshot_path := "%s/segments/%s.png" % [output_root, prefix]
	var report_path := "%s/segments/%s.json" % [output_root, prefix]
	var temporary_screenshot_path := _temporary_artifact_path(screenshot_path)
	var temporary_report_path := _temporary_artifact_path(report_path)
	var errors: Array[String] = []
	_validate_fresh_stage_targets(
		[
			screenshot_path,
			report_path,
			temporary_screenshot_path,
			temporary_report_path,
		],
		errors
	)
	if not errors.is_empty():
		return _failed_stage("four_floor", map_id, mode, errors)
	await _prepare_map_stage(host, map_id, errors)
	if not errors.is_empty():
		return _failed_stage("four_floor", map_id, mode, errors)

	var start_frame := Engine.get_process_frames() - _process_frame_origin
	var request := {
		"enabled": true,
		"qaPreviewFlagPresent": true,
		"qaPreviewMapId": map_id,
		"showcaseProfileRequested": false,
		"mapId": map_id,
		# The legacy capture helper writes directly.  Give it unpredictable,
		# same-directory staging names and publish only through this controller's
		# create-if-absent hard-link gate after the long-running capture returns.
		"outputPath": temporary_screenshot_path,
		"reportPath": temporary_report_path,
		"mode": mode,
		"captureVariant": "default",
		"parseErrors": [],
	}
	var capture: Dictionary = await MapVisualReviewCapture.new(host).run(request)
	errors.append_array(_string_array(capture.get("errors", [])))
	if str(capture.get("result", "FAIL")) != "PASS" and errors.is_empty():
		errors.append("四层批量 capture helper 未返回 PASS")
	if str(capture.get("result", "FAIL")) == "PASS" and errors.is_empty():
		if not _publish_temp_file_no_replace(
			temporary_screenshot_path,
			screenshot_path
		):
			errors.append("四层批量截图无法 atomic/exclusive 发布")
		else:
			var screenshot_sha := FileAccess.get_sha256(screenshot_path)
			capture["screenshotPath"] = screenshot_path
			capture["screenshotSha256"] = screenshot_sha
			capture["screenshot"] = {
				"path": screenshot_path,
				"sha256": screenshot_sha,
				"width": EXPECTED_VIEWPORT.x,
				"height": EXPECTED_VIEWPORT.y,
			}
			capture["errors"] = errors
			capture["ok"] = errors.is_empty()
			capture["result"] = "PASS" if errors.is_empty() else "FAIL"
			if not _write_json(report_path, capture):
				errors.append("四层批量 report 无法 atomic/exclusive 发布")
	_cleanup_staged_file(temporary_screenshot_path)
	_cleanup_staged_file(temporary_report_path)
	capture["errors"] = errors
	capture["ok"] = errors.is_empty()
	capture["result"] = "PASS" if errors.is_empty() else "FAIL"
	var end_frame := Engine.get_process_frames() - _process_frame_origin
	return {
		"kind": "four_floor",
		"mapId": map_id,
		"mode": mode,
		"captureVariant": "default",
		"capturePass": capture_pass,
		"result": str(capture.get("result", "FAIL")),
		"processFrameRange": _movie_writer_frame_range(
			start_frame,
			end_frame,
			0
		),
		"screenshot": _file_record(screenshot_path),
		"captureReport": _file_record(report_path),
		"runtimeCleanup": (capture.get("runtimeCleanup", {}) as Dictionary).duplicate(true),
		"errors": errors,
	}


func _prepare_map_stage(host, map_id: String, errors: Array[String]) -> void:
	if host.game_audio_manager == null:
		host._build_game_audio_manager()
	var preparation := await _disable_audio_without_free(host)
	if str(preparation.get("status", "")) != "passed":
		errors.append(
			"批量片段音频未在输入前停播解绑：%s"
			% str(preparation.get("reason", "unknown"))
		)
		return
	if not host._load_map(map_id, "default"):
		errors.append("批量片段无法加载地图：%s" % map_id)
		return
	for _frame_index in range(MAP_SETTLE_FRAMES):
		host.queue_redraw()
		await process_frame
	await RenderingServer.frame_post_draw
	if str(host.current_map_id) != map_id:
		errors.append("批量片段实际地图与计划不一致")
	if str(host.map_visual_render_state.get("bundleId", "")) != BUNDLE_ID:
		errors.append("批量片段没有启用精确 Earth Vein bundle")
	if str(host.map_visual_render_state.get("status", "")) != "owner_review_pending":
		errors.append("批量片段候选不再是 owner_review_pending")
	if not bool(host.map_visual_render_state.get("qaPreview", false)):
		errors.append("批量片段没有通过显式 QA preview")


func _run_landmark_stage(
	host,
	output_root: String,
	capture_pass: String
) -> Dictionary:
	var screenshot_path := "%s/landmark/earth-vein-f4-landmarks.png" % output_root
	var report_path := "%s/landmark/earth-vein-f4-landmarks.json" % output_root
	var errors: Array[String] = []
	_validate_fresh_stage_targets([screenshot_path, report_path], errors)
	if not errors.is_empty():
		return _failed_stage(
			"landmark",
			"earth_vein_cave_f4",
			"moving",
			errors
		)
	await _prepare_map_stage(host, "earth_vein_cave_f4", errors)
	var report := _landmark_base_report(screenshot_path)
	var preparation := await _disable_audio_without_free(host)
	report["audioCapturePreparation"] = preparation
	if str(preparation.get("status", "")) != "passed":
		errors.append("landmark 音频未在移动前完成停播与解绑")
	_validate_landmark_host(host, report, errors)
	var start_frame := Engine.get_process_frames() - _process_frame_origin
	if errors.is_empty():
		host.player.clear_move_target()
		host._clear_navigation_state()
		host.player.global_position = IsoMapModel.grid_to_world(
			host.map_data,
			LANDMARK_START_CELL
		)
		host._update_camera_position(true)
		for _frame_index in range(MAP_SETTLE_FRAMES):
			host.queue_redraw()
			await process_frame
		await RenderingServer.frame_post_draw

		var input_report := await _send_landmark_click(
			host,
			LANDMARK_TARGET_CELL
		)
		report["input"] = input_report
		var end_cell := LANDMARK_START_CELL
		var moved := false
		var completed := false
		for _frame_index in range(LANDMARK_MOVE_FRAME_LIMIT):
			await physics_frame
			end_cell = IsoMapModel.world_to_grid(
				host.map_data,
				host.player.global_position
			)
			if end_cell != LANDMARK_START_CELL:
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
		if not moved or not completed or end_cell != LANDMARK_TARGET_CELL:
			errors.append("landmark review 没有精确到达冻结目标")
		if str(host.current_map_id) != "earth_vein_cave_f4":
			errors.append("landmark review 意外切换地图")
		if host.encounter_active or host.battle_active:
			errors.append("landmark review 被战斗或遇敌打断")
		if host.has_pending_interaction:
			errors.append("landmark review 结束后仍有 pending interaction")

		for _frame_index in range(LANDMARK_HOLD_FRAMES):
			host.queue_redraw()
			await process_frame
		await RenderingServer.frame_post_draw
		var controller = MapVisualReviewCapture.new(host)
		var screenshot: Image = await controller._capture_complete_image()
		if screenshot == null:
			errors.append("landmark review 没有得到完整稳定画面")
		elif screenshot.get_size() != EXPECTED_VIEWPORT:
			errors.append("landmark review 截图不是 1280x720")
		elif not _write_png(screenshot_path, screenshot):
			errors.append("landmark review 无法保存截图")
		else:
			var screenshot_sha := FileAccess.get_sha256(screenshot_path)
			report["screenshotPath"] = screenshot_path
			report["screenshotSha256"] = screenshot_sha
			report["screenshot"] = {
				"path": screenshot_path,
				"sha256": screenshot_sha,
				"width": screenshot.get_width(),
				"height": screenshot.get_height(),
			}

	var cleanup := {}
	if host.game_audio_manager != null:
		cleanup = await RuntimeExitCleanup.drain_audio(host)
	else:
		cleanup = {"status": "failed", "reason": "audio_manager_missing"}
	report["runtimeCleanup"] = cleanup
	if str(cleanup.get("status", "")) != "passed":
		errors.append("landmark review 运行资源收口失败")
	report["errors"] = errors
	report["ok"] = errors.is_empty()
	report["result"] = "PASS" if errors.is_empty() else "FAIL"
	if not _write_json(report_path, report):
		errors.append("landmark review 无法写入 capture report")
		report["errors"] = errors
		report["ok"] = false
		report["result"] = "FAIL"
	var end_frame := Engine.get_process_frames() - _process_frame_origin
	return {
		"kind": "landmark",
		"mapId": "earth_vein_cave_f4",
		"mode": "moving",
		"captureVariant": "f4_dual_resonance_landmark",
		"capturePass": capture_pass,
		"result": report["result"],
		"processFrameRange": _movie_writer_frame_range(
			start_frame,
			end_frame,
			LANDMARK_HOLD_FRAMES
		),
		"screenshot": _file_record(screenshot_path),
		"captureReport": _file_record(report_path),
		"runtimeCleanup": cleanup,
		"errors": errors,
	}


func _disable_audio_without_free(host) -> Dictionary:
	var manager = host.game_audio_manager
	if manager == null or not is_instance_valid(manager):
		return {"status": "failed", "reason": "audio_manager_missing"}
	for method_name in ["configure_playback_enabled", "stop_all", "debug_snapshot"]:
		if not manager.has_method(method_name):
			return {
				"status": "failed",
				"reason": "audio_contract_missing",
				"missingMethod": method_name,
			}
	manager.call("configure_playback_enabled", false)
	manager.call("stop_all")
	for _frame_index in range(4):
		await process_frame
	var snapshot_value: Variant = manager.call("debug_snapshot")
	var snapshot := (
		snapshot_value as Dictionary
		if snapshot_value is Dictionary
		else {}
	)
	var players := (manager as Node).find_children(
		"*",
		"AudioStreamPlayer",
		true,
		false
	)
	var playing_count := 0
	var stream_count := 0
	for value in players:
		if value is AudioStreamPlayer:
			var player := value as AudioStreamPlayer
			if player.playing:
				playing_count += 1
			if player.stream != null:
				stream_count += 1
	var playback_disabled := not bool(snapshot.get("playbackEnabled", true))
	var passed := playback_disabled and playing_count == 0 and stream_count == 0
	return {
		"status": "passed" if passed else "failed",
		"reason": "" if passed else "audio_playback_not_disabled_or_detached",
		"playbackDisabled": playback_disabled,
		"audioStopped": playing_count == 0,
		"audioStreamsDetached": stream_count == 0,
		"audioPlayerCount": players.size(),
		"playingAudioPlayerCount": playing_count,
		"attachedAudioStreamCount": stream_count,
	}


func _validate_landmark_host(
	host,
	report: Dictionary,
	errors: Array[String]
) -> void:
	if host.scene_file_path != MAIN_SCENE:
		errors.append("landmark review 没有运行真实 Main.tscn")
	if DisplayServer.get_name().to_lower() == "headless":
		errors.append("landmark review 禁止 headless DisplayServer")
	if not OS.is_debug_build():
		errors.append("landmark review 只能运行 debug build")
	if (
		str(host.current_map_id) != "earth_vein_cave_f4"
		or str(host.map_data.get("id", "")) != "earth_vein_cave_f4"
	):
		errors.append("landmark review 没有加载岩脉洞穴顶层")
	var prepared: Dictionary = host.map_visual_render_state
	report["bundleId"] = str(prepared.get("bundleId", ""))
	report["mapStyleId"] = str(prepared.get("mapStyleId", ""))
	report["mapArtStatus"] = str(prepared.get("status", ""))
	report["mapArtActive"] = bool(prepared.get("active", false))
	report["mapArtQaPreview"] = bool(prepared.get("qaPreview", false))
	report["groundDrawCount"] = MapVisualRenderer.ground_draw_count(prepared)
	report["objectCount"] = MapVisualRenderer.object_draw_count(prepared)
	report["tileCounts"] = (
		(prepared.get("tileCounts", {}) as Dictionary).duplicate(true)
	)
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
				visible_ids.append(
					str((command_value as Dictionary).get("instanceId", ""))
				)
	report["requiredLandmarkInstanceIds"] = LANDMARK_IDS.duplicate()
	report["preparedObjectInstanceIds"] = visible_ids
	for instance_id in LANDMARK_IDS:
		if not visible_ids.has(instance_id):
			errors.append("landmark review 缺少场景物件：%s" % instance_id)
	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	report["viewport"] = [viewport_size.x, viewport_size.y]
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("landmark review viewport 必须是 1280x720")


func _send_landmark_click(host, target_cell: Vector2i) -> Dictionary:
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


func _landmark_base_report(output_path: String) -> Dictionary:
	return {
		"schemaVersion": 1,
		"reportType": "beastbound_map_visual_landmark_review_capture",
		"generatedAtUtc": "%sZ" % Time.get_datetime_string_from_system(true),
		"scene": MAIN_SCENE,
		"mapId": "earth_vein_cave_f4",
		"captureVariant": "f4_dual_resonance_landmark",
		"bundleId": "",
		"mapStyleId": "",
		"mapArtStatus": "",
		"mapArtActive": false,
		"mapArtQaPreview": false,
		"groundDrawCount": 0,
		"objectCount": 0,
		"tileCounts": {},
		"displayServer": DisplayServer.get_name(),
		"debugBuild": OS.is_debug_build(),
		"viewport": [],
		"profileIsolation": "automation_lane_ephemeral_no_save_before_review_movement",
		"reviewIsolationOverride": true,
		"networkRequestsDisconnected": false,
		"reviewOnlyViewpointReposition": true,
		"originalSpawnCell": [5, 22],
		"startCell": [LANDMARK_START_CELL.x, LANDMARK_START_CELL.y],
		"targetCell": [LANDMARK_TARGET_CELL.x, LANDMARK_TARGET_CELL.y],
		"endCell": [],
		"playerCellChanged": false,
		"movementCompleted": false,
		"input": {},
		"audioCapturePreparation": {},
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


func _validate_invocation(
	output_root: String,
	report_path: String,
	capture_pass: String,
	errors: Array[String]
) -> void:
	_authorized_output_root = ""
	_authorized_report_path = ""
	var evidence_root := _normalized_absolute_path(
		ProjectSettings.globalize_path("res://../../.run/evidence")
	)
	var repository_root := _normalized_absolute_path(
		ProjectSettings.globalize_path("res://../../")
	)
	var normalized_output := _normalized_absolute_path(output_root)
	var normalized_report := _normalized_absolute_path(report_path)
	if not output_root.is_absolute_path():
		errors.append("批量取证 output root 必须是绝对路径")
	else:
		if not _path_is_strict_descendant(normalized_output, evidence_root):
			errors.append("批量取证 output root 必须位于仓库 .run/evidence")
		if _path_has_link_from_root(evidence_root, repository_root):
			errors.append("仓库到 .run/evidence 的 authority 路径不得包含 symlink")
		if (
			DirAccess.dir_exists_absolute(normalized_output)
			or FileAccess.file_exists(normalized_output)
			or _entry_is_link(normalized_output)
		):
			errors.append("批量取证 output root 必须是尚不存在的 immutable 路径")
		if _path_has_link_from_root(normalized_output.get_base_dir(), evidence_root):
			errors.append("批量取证 output root 父路径不得包含 symlink")
	if (
		not report_path.is_absolute_path()
		or report_path.get_extension().to_lower() != "json"
	):
		errors.append("批量取证 report 必须是绝对 JSON 路径")
	elif (
		normalized_report.get_base_dir() != normalized_output
		or report_path.get_file() != "batch-report.json"
	):
		errors.append("批量取证 report 必须是 output root 内固定文件")
	if not VALID_PASSES.has(capture_pass):
		errors.append("批量取证 pass 必须是 native 或 movie")
	if (
		FileAccess.file_exists(normalized_report)
		or DirAccess.dir_exists_absolute(normalized_report)
		or _entry_is_link(normalized_report)
	):
		errors.append("批量取证 report 已存在，证据目录必须 immutable")
	if not errors.is_empty():
		return
	if not DirAccess.dir_exists_absolute(normalized_output.get_base_dir()):
		errors.append("批量取证 output root 父目录必须由 recorder 预先创建")
		return
	if _path_has_link_from_root(normalized_output.get_base_dir(), evidence_root):
		errors.append("批量取证 output root 父路径创建后出现 symlink")
		return
	var root_error := DirAccess.make_dir_absolute(normalized_output)
	if root_error != OK:
		errors.append("无法 exclusive claim 批量取证 output root")
		return
	if _entry_is_link(normalized_output):
		errors.append("批量取证 output root claim 结果是 symlink")
		return
	for child in ["segments", "landmark"]:
		var child_path := "%s/%s" % [normalized_output, child]
		var directory_error := DirAccess.make_dir_absolute(child_path)
		if directory_error != OK or _entry_is_link(child_path):
			errors.append("无法创建批量取证目录：%s" % child)
	if not errors.is_empty():
		return
	_authorized_output_root = normalized_output
	_authorized_report_path = normalized_report


func _invocation_from_args() -> Dictionary:
	var result := {
		"outputRoot": "",
		"reportPath": "",
		"capturePass": "",
		"errors": [],
	}
	var lane_count := 0
	var output_count := 0
	var report_count := 0
	var pass_count := 0
	for arg_value in OS.get_cmdline_user_args():
		var arg := str(arg_value).strip_edges()
		if arg == QA_LANE_ARG:
			lane_count += 1
		elif arg.begins_with(ARG_OUTPUT_ROOT_PREFIX):
			output_count += 1
			result["outputRoot"] = arg.substr(ARG_OUTPUT_ROOT_PREFIX.length()).strip_edges()
		elif arg.begins_with(ARG_REPORT_PREFIX):
			report_count += 1
			result["reportPath"] = arg.substr(ARG_REPORT_PREFIX.length()).strip_edges()
		elif arg.begins_with(ARG_PASS_PREFIX):
			pass_count += 1
			result["capturePass"] = arg.substr(ARG_PASS_PREFIX.length()).strip_edges()
		else:
			(result["errors"] as Array).append(
				"批量取证不接受无关参数：%s" % arg
			)
	if lane_count != 1:
		(result["errors"] as Array).append(
			"批量取证缺少唯一 automation QA lane 参数"
		)
	for count_and_label in [
		[output_count, "output root"],
		[report_count, "report"],
		[pass_count, "pass"],
	]:
		if int(count_and_label[0]) != 1:
			(result["errors"] as Array).append(
				"批量取证 %s 参数必须且只能出现一次"
				% str(count_and_label[1])
			)
	return result


func _write_report(report_path: String, report: Dictionary) -> bool:
	var normalized_report := _normalized_absolute_path(report_path)
	if (
		_authorized_output_root == ""
		or normalized_report != _authorized_report_path
		or normalized_report.get_base_dir() != _authorized_output_root
	):
		return false
	return _write_json(normalized_report, report)


func _write_json(path: String, value: Dictionary) -> bool:
	var normalized_path := _normalized_absolute_path(path)
	if not _is_fresh_authorized_target(normalized_path):
		return false
	var temp_path := _temporary_artifact_path(normalized_path)
	if not _is_fresh_authorized_target(temp_path):
		return false
	var payload := JSON.stringify(value, "\t", false) + "\n"
	var file := FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(payload)
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		DirAccess.remove_absolute(temp_path)
		return false
	if FileAccess.get_file_as_string(temp_path) != payload:
		DirAccess.remove_absolute(temp_path)
		return false
	return _publish_temp_file_no_replace(temp_path, normalized_path)


func _write_png(path: String, image: Image) -> bool:
	var normalized_path := _normalized_absolute_path(path)
	if image == null or not _is_fresh_authorized_target(normalized_path):
		return false
	var temp_path := _temporary_artifact_path(normalized_path)
	if not _is_fresh_authorized_target(temp_path):
		return false
	if image.save_png(temp_path) != OK:
		_cleanup_staged_file(temp_path)
		return false
	if (
		not FileAccess.file_exists(temp_path)
		or _entry_is_link(temp_path)
		or DirAccess.dir_exists_absolute(temp_path)
		or FileAccess.get_file_as_bytes(temp_path).is_empty()
	):
		_cleanup_staged_file(temp_path)
		return false
	return _publish_temp_file_no_replace(temp_path, normalized_path)


func _publish_temp_file_no_replace(temp_path: String, final_path: String) -> bool:
	var normalized_temp := _normalized_absolute_path(temp_path)
	var normalized_final := _normalized_absolute_path(final_path)
	if (
		not _is_existing_authorized_file(normalized_temp)
		or not _is_fresh_authorized_target(normalized_final)
		or normalized_temp.get_base_dir() != normalized_final.get_base_dir()
	):
		_cleanup_staged_file(normalized_temp)
		return false
	var platform := OS.get_name()
	var link_arguments := PackedStringArray()
	if platform == "macOS":
		# -h refuses to dereference a destination symlink to a directory.
		link_arguments.append("-h")
	elif platform == "Linux":
		# -T likewise treats the destination as an entry, never a directory.
		link_arguments.append("-T")
	else:
		_cleanup_staged_file(normalized_temp)
		return false
	link_arguments.append(normalized_temp)
	link_arguments.append(normalized_final)
	var link_output: Array = []
	var link_exit := OS.execute(
		"/bin/ln",
		link_arguments,
		link_output,
		true
	)
	if (
		link_exit != 0
		or not _is_existing_authorized_file(normalized_final)
		or FileAccess.get_sha256(normalized_final)
		!= FileAccess.get_sha256(normalized_temp)
	):
		_cleanup_staged_file(normalized_temp)
		return false
	if DirAccess.remove_absolute(normalized_temp) != OK:
		return false
	return true


func _is_fresh_authorized_target(path: String) -> bool:
	var normalized_path := _normalized_absolute_path(path)
	return (
		_authorized_output_root != ""
		and _path_is_strict_descendant(
			normalized_path,
			_authorized_output_root
		)
		and not _path_has_link_from_root(
			normalized_path.get_base_dir(),
			_authorized_output_root
		)
		and not FileAccess.file_exists(normalized_path)
		and not DirAccess.dir_exists_absolute(normalized_path)
		and not _entry_is_link(normalized_path)
	)


func _is_existing_authorized_file(path: String) -> bool:
	var normalized_path := _normalized_absolute_path(path)
	return (
		_authorized_output_root != ""
		and _path_is_strict_descendant(
			normalized_path,
			_authorized_output_root
		)
		and not _path_has_link_from_root(
			normalized_path.get_base_dir(),
			_authorized_output_root
		)
		and FileAccess.file_exists(normalized_path)
		and not DirAccess.dir_exists_absolute(normalized_path)
		and not _entry_is_link(normalized_path)
	)


func _temporary_artifact_path(final_path: String) -> String:
	var normalized_path := _normalized_absolute_path(final_path)
	return "%s/.%s.%d.%d.%s" % [
		normalized_path.get_base_dir(),
		normalized_path.get_file().get_basename(),
		OS.get_process_id(),
		Time.get_ticks_usec(),
		normalized_path.get_extension(),
	]


func _cleanup_staged_file(path: String) -> void:
	if FileAccess.file_exists(path) and not _entry_is_link(path):
		DirAccess.remove_absolute(path)


func _read_and_validate_review_authorization(errors: Array[String]) -> Dictionary:
	var path := OS.get_environment(REVIEW_AUTH_ENV).strip_edges()
	var expected_sha := OS.get_environment(REVIEW_AUTH_SHA_ENV).strip_edges()
	var repository_root := _normalized_absolute_path(
		ProjectSettings.globalize_path("res://../../")
	)
	var evidence_root := repository_root.path_join(".run/evidence")
	var normalized_path := _normalized_absolute_path(path)
	if (
		path == ""
		or not path.is_absolute_path()
		or path.get_extension().to_lower() != "json"
		or expected_sha.length() != 64
		or not _path_is_strict_descendant(normalized_path, evidence_root)
		or _path_has_link_from_root(normalized_path, repository_root)
		or not FileAccess.file_exists(normalized_path)
		or _entry_is_link(normalized_path)
		or FileAccess.get_sha256(normalized_path) != expected_sha
	):
		errors.append("批量 review authorization 路径或 SHA-256 无效")
		return {}
	var parsed: Variant = JSON.parse_string(
		FileAccess.get_file_as_string(normalized_path)
	)
	if not (parsed is Dictionary):
		errors.append("批量 review authorization 不是 JSON object")
		return {}
	var authorization := parsed as Dictionary
	if (
		int(authorization.get("schemaVersion", 0)) != 1
		or str(authorization.get("reportType", "")) != REVIEW_AUTH_REPORT_TYPE
		or str(authorization.get("bundleId", "")) != BUNDLE_ID
		or authorization.get("maps", []) != MAP_IDS
		or authorization.get("modes", []) != MODES
		or str(authorization.get("scene", "")) != MAIN_SCENE
		or not review_viewport_matches(authorization.get("viewport"))
		or authorization.get("launchContract", {}) != {
			"entrypoint": "standalone_scene_tree_script",
			"genericPreviewCliFlag": false,
			"authorizationValidatedBeforeMain": true,
			"rootMinimizedUntilIsolationComplete": true,
		}
	):
		errors.append("批量 review authorization 固定合同漂移")
		return {}
	var source_identity := authorization.get("sourceIdentity", {}) as Dictionary
	if source_identity.size() != HARNESS_PATHS.size():
		errors.append("批量 review authorization sourceIdentity keyset 漂移")
		return {}
	for resource_path in HARNESS_PATHS:
		var record := source_identity.get(resource_path, {}) as Dictionary
		if (
			str(record.get("sha256", "")) != FileAccess.get_sha256(resource_path)
			or int(record.get("sizeBytes", -1))
			!= FileAccess.get_file_as_bytes(resource_path).size()
		):
			errors.append("批量 review authorization source 漂移：%s" % resource_path)
	return {
		"status": "passed" if errors.is_empty() else "failed",
		"path": normalized_path,
		"sha256": expected_sha,
		"validatedBeforeMain": true,
		"genericPreviewCliFlagPresent": false,
		"sourceIdentityCount": source_identity.size(),
	}


static func review_viewport_matches(value: Variant) -> bool:
	# JSON numbers are floats. Array equality distinguishes them from the int
	# literals even when both dimensions are exact; compare numeric scalars
	# without truncation so malformed/fractional sizes still fail closed.
	return (
		value is Array
		and value.size() == 2
		and (value[0] is int or value[0] is float)
		and (value[1] is int or value[1] is float)
		and value[0] == EXPECTED_VIEWPORT.x
		and value[1] == EXPECTED_VIEWPORT.y
	)


func _settle_root_window_mode(target_mode: Window.Mode) -> bool:
	# Both minimizing and restoring are asynchronous on macOS. Retry only
	# after the native animation has had time to consume the prior request.
	var deadline := Time.get_ticks_msec() + 8000
	var next_request := Time.get_ticks_msec() + 250
	root.mode = target_mode
	while Time.get_ticks_msec() < deadline:
		await process_frame
		if root.mode == target_mode:
			return true
		var now_msec := Time.get_ticks_msec()
		if now_msec >= next_request:
			root.mode = target_mode
			next_request = now_msec + 250
	return false


func _runtime_identity() -> Dictionary:
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
		"processFrame": Engine.get_process_frames() - _process_frame_origin,
		"displayServerWindowCount": window_ids.size(),
		"displayServerWindowIds": window_ids,
		"rootWindowId": root.get_window_id(),
		"rootWindowVisible": root.visible,
		"rootWindowMode": int(root.mode),
		"rootWindowPosition": [root.position.x, root.position.y],
		"mainSceneInstanceCount": main_scene_count,
		"audioDriver": AudioServer.get_driver_name(),
	}


func _runtime_identity_checkpoint(
	label: String,
	errors: Array[String]
) -> Dictionary:
	var identity := _runtime_identity()
	var root_window_id := int(identity.get("rootWindowId", -1))
	if (
		int(identity.get("displayServerWindowCount", 0)) != 1
		or identity.get("displayServerWindowIds", []) != [root_window_id]
		or root_window_id != _root_window_id
		or int(identity.get("mainSceneInstanceCount", 0)) != 1
		or not bool(identity.get("rootWindowVisible", false))
		or int(identity.get("rootWindowMode", -1)) != Window.MODE_WINDOWED
		or str(identity.get("audioDriver", "")) != EXPECTED_AUDIO_DRIVER
	):
		errors.append("批量 runtime identity 漂移：%s" % label)
	identity["label"] = label
	return identity


func _last_stage_end_exclusive(stages: Array[Dictionary]) -> int:
	if stages.is_empty():
		return -1
	var frame_range := stages.back().get("processFrameRange", {}) as Dictionary
	return int(frame_range.get("endExclusive", -1))


func _validate_fresh_stage_targets(
	paths: Array[String],
	errors: Array[String]
) -> void:
	for path in paths:
		var normalized_path := _normalized_absolute_path(path)
		if (
			_authorized_output_root == ""
			or not _path_is_strict_descendant(
				normalized_path,
				_authorized_output_root
			)
			or _path_has_link_from_root(
				normalized_path.get_base_dir(),
				_authorized_output_root
			)
			or FileAccess.file_exists(normalized_path)
			or DirAccess.dir_exists_absolute(normalized_path)
			or _entry_is_link(normalized_path)
		):
			errors.append("批量片段目标不是 fresh authorized path：%s" % path)


func _movie_writer_frame_range(
	start_frame: int,
	end_frame: int,
	in_process_review_hold_frames: int
) -> Dictionary:
	return {
		"indexBasis": "movie_writer_zero_based_v1",
		"origin": 0,
		"start": start_frame,
		"startFrameInclusive": start_frame,
		"endExclusive": end_frame,
		"endFrameExclusive": end_frame,
		"frameCount": maxi(0, end_frame - start_frame),
		"inProcessReviewHoldFrameCount": in_process_review_hold_frames,
	}


func _normalized_absolute_path(path: String) -> String:
	return path.replace("\\", "/").simplify_path().trim_suffix("/")


func _path_is_strict_descendant(path: String, root_path: String) -> bool:
	return path != root_path and path.begins_with("%s/" % root_path)


func _path_has_link_from_root(path: String, root_path: String) -> bool:
	if path != root_path and not _path_is_strict_descendant(path, root_path):
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


func _file_record(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"path": path, "sha256": "", "sizeBytes": 0}
	return {
		"path": path,
		"sha256": FileAccess.get_sha256(path),
		"sizeBytes": FileAccess.get_file_as_bytes(path).size(),
	}


func _harness_hashes() -> Array[Dictionary]:
	var records: Array[Dictionary] = []
	for path in HARNESS_PATHS:
		records.append(_file_record(path))
	return records


func _failed_stage(
	kind: String,
	map_id: String,
	mode: String,
	errors: Array[String]
) -> Dictionary:
	return {
		"kind": kind,
		"mapId": map_id,
		"mode": mode,
		"result": "FAIL",
		"processFrameRange": {
			"start": 0,
			"endExclusive": 0,
			"frameCount": 0,
		},
		"screenshot": {},
		"captureReport": {},
		"runtimeCleanup": {},
		"errors": errors,
	}


func _capture_sequence(stages: Array[Dictionary]) -> Array[String]:
	var sequence: Array[String] = []
	for stage in stages:
		if str(stage.get("kind", "")) == "landmark":
			sequence.append("earth_vein_cave_f4:landmark")
		else:
			sequence.append(
				"%s:%s" % [stage.get("mapId", ""), stage.get("mode", "")]
			)
	return sequence


func _floor_stage_count(stages: Array[Dictionary]) -> int:
	var count := 0
	for stage in stages:
		if str(stage.get("kind", "")) == "four_floor":
			count += 1
	return count


func _landmark_stage_count(stages: Array[Dictionary]) -> int:
	var count := 0
	for stage in stages:
		if str(stage.get("kind", "")) == "landmark":
			count += 1
	return count


func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result
