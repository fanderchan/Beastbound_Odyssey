extends SceneTree

const MAIN_SCENE := "res://scenes/Main.tscn"
const PLAN_ENV := "BEASTBOUND_MAP_PERF_BATCH_PLAN"
const PLAN_SHA_ENV := "BEASTBOUND_MAP_PERF_BATCH_PLAN_SHA256"
const STRATEGY := "single_window_fresh_main_v1"
const VIEWPORT := Vector2i(1280, 720)
const SAMPLE_TIMEOUT_MSEC := 120000

var _plan_sha := ""
var _window_id := -1
var _completed := 0
var _released := 0
var _sample_done := false
var _sample_exit_code := 1
var _active_host: Node = null
var _errors: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var plan := _read_plan()
	if not _errors.is_empty():
		_finish()
		return
	root.size = VIEWPORT
	root.content_scale_size = VIEWPORT
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	_window_id = root.get_window_id()
	root.title = "万兽纪元｜地图性能对比准备中"
	if not await _wait_for_foreground():
		_errors.append("foreground_unavailable")
		_finish()
		return
	var packed := load(MAIN_SCENE) as PackedScene
	if packed == null:
		_errors.append("main_scene_missing")
		_finish()
		return
	var samples: Array = plan["samples"]
	for index in range(samples.size()):
		var sample: Dictionary = samples[index]
		var host = packed.instantiate()
		_active_host = host
		_sample_done = false
		_sample_exit_code = 1
		host.startup_map_id = str(sample["mapId"])
		host.startup_spawn_name = "default"
		host.map_art_review_preview = str(sample["variant"]) == "candidate"
		host.movement_spam_click_check = str(sample["mode"]) == "moving"
		host.movement_spam_click_limit = 60 if host.movement_spam_click_check else 0
		host.movement_spam_shared_target_contract = (
			"spawn_adjacent_pair_v1" if host.movement_spam_click_check else ""
		)
		# Add/current_scene just like SceneTree scene changes, while retaining the
		# root Window. Main itself performs the official user-data attestation.
		root.add_child(host)
		current_scene = host
		root.title = "万兽纪元｜性能测试 %d/%d｜%s｜%s" % [
			index + 1, samples.size(),
			"旧网格基线（非试玩效果）" if sample["variant"] == "baseline" else "当前美术候选",
			"静止" if sample["mode"] == "idle" else "移动",
		]
		var start := _boundary(host, index)
		start["sample"] = sample
		print("map performance sample start: %s" % JSON.stringify(start))
		var deadline := Time.get_ticks_msec() + SAMPLE_TIMEOUT_MSEC
		var observed_frames := 0
		var unfocused_frames := 0
		while not _sample_done and Time.get_ticks_msec() < deadline:
			await process_frame
			observed_frames += 1
			if not DisplayServer.window_is_focused():
				unfocused_frames += 1
		if not _sample_done:
			_errors.append("sample_timeout_%d" % index)
			_finish()
			return
		var ending := _boundary(host, index)
		ending["exitCode"] = _sample_exit_code
		ending["focusObservedFrames"] = observed_frames
		ending["unfocusedFrames"] = unfocused_frames
		print("map performance sample end: %s" % JSON.stringify(ending))
		if not start["focused"] or not ending["focused"] or unfocused_frames > 0:
			_errors.append("foreground_lost_%d" % index)
		if _sample_exit_code != 0:
			_errors.append("sample_failed_%d" % index)
		# Never free a Main while its finishing coroutine is still executing.
		await process_frame
		await _drain_prefetch(host, index)
		current_scene = null
		root.remove_child(host)
		host.free()
		_active_host = null
		await process_frame
		if is_instance_valid(host) or _main_count() != 0:
			_errors.append("main_not_released_%d" % index)
		else:
			_released += 1
		_completed += 1
		if not _errors.is_empty():
			break
	_finish()


func _wait_for_foreground() -> bool:
	# Request activation only during startup. A focus change during sampling
	# invalidates the batch; never keep taking focus back from the user.
	var deadline := Time.get_ticks_msec() + 5000
	var next_request := 0
	while Time.get_ticks_msec() < deadline:
		if Time.get_ticks_msec() >= next_request:
			DisplayServer.window_move_to_foreground()
			next_request = Time.get_ticks_msec() + 250
		await process_frame
		if DisplayServer.window_is_focused():
			return true
	return false


func complete_map_performance_sample(host: Node, exit_code: int) -> void:
	if host != _active_host or _sample_done:
		_errors.append("unexpected_sample_completion")
		quit(1)
		return
	_sample_exit_code = exit_code
	_sample_done = true


func _drain_prefetch(host: Node, index: int) -> void:
	var prefetch = host.get("battle_texture_prefetcher")
	if prefetch == null:
		_errors.append("prefetch_missing_%d" % index)
		return
	prefetch.cancel()
	var deadline := Time.get_ticks_msec() + 5000
	while int(prefetch.snapshot().get("inFlight", 0)) > 0 and Time.get_ticks_msec() < deadline:
		await process_frame
	var snapshot: Dictionary = prefetch.snapshot()
	print("map performance prefetch drain: %s" % JSON.stringify({
		"sampleIndex": index, "snapshot": snapshot,
	}))
	if int(snapshot.get("inFlight", 0)) != 0 or int(snapshot.get("retained", 0)) != 0:
		_errors.append("prefetch_not_drained_%d" % index)


func _main_count() -> int:
	var count := 0
	for child in root.get_children():
		if str(child.scene_file_path) == MAIN_SCENE:
			count += 1
	return count


func _boundary(host: Node, index: int) -> Dictionary:
	var window_count := DisplayServer.get_window_list().size()
	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	if (root.get_window_id() != _window_id or window_count != 1
		or DisplayServer.window_get_mode() != DisplayServer.WINDOW_MODE_WINDOWED
		or viewport_size != VIEWPORT or _main_count() != 1):
		_errors.append("window_or_main_identity_changed_%d" % index)
	return {
		"planSha256": _plan_sha, "sampleIndex": index,
		"processId": OS.get_process_id(), "rootWindowId": root.get_window_id(),
		"mainInstanceId": host.get_instance_id(), "mainScene": str(host.scene_file_path),
		"windowCount": window_count, "mainCount": _main_count(),
		"windowMode": DisplayServer.window_get_mode(),
		"viewport": [viewport_size.x, viewport_size.y],
		"frame": Engine.get_process_frames(),
		"focused": DisplayServer.window_is_focused(),
		"title": root.title,
		"prefetch": host.get("battle_texture_prefetcher").snapshot() if host.get("battle_texture_prefetcher") != null else {},
	}


func _read_plan() -> Dictionary:
	var path := OS.get_environment(PLAN_ENV)
	_plan_sha = OS.get_environment(PLAN_SHA_ENV)
	if not OS.is_debug_build() or DisplayServer.get_name() != "macOS":
		_errors.append("native_macos_debug_required")
	if AudioServer.get_driver_name() != "Dummy":
		_errors.append("dummy_audio_required")
	var expected_args := PackedStringArray([
		"--beastbound-qa-user-data-lane=automation", "--perf-probe",
		"--perf-probe-warmup-frames=180", "--perf-probe-sample-frames=60",
		"--perf-probe-clean-exit-frames=480",
	])
	if OS.get_cmdline_user_args() != expected_args:
		_errors.append("unexpected_user_arguments")
	if (path.is_empty() or not FileAccess.file_exists(path)
		or _plan_sha.length() != 64 or FileAccess.get_sha256(path) != _plan_sha):
		_errors.append("plan_hash_mismatch")
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		_errors.append("invalid_plan")
		return {}
	var plan: Dictionary = parsed
	if (plan.get("strategy") != STRATEGY or plan.get("mainScene") != MAIN_SCENE
		or plan.get("focusPolicy") != "foreground_required_v1"):
		_errors.append("plan_strategy_mismatch")
	var maps := {
		"earth_vein_cave_visual_v1": ["earth_vein_cave", "earth_vein_cave_f2", "earth_vein_cave_f3", "earth_vein_cave_f4"],
		"firebud_region_visual_v2": ["firebud_training_yard", "firebud_village_gate"],
		"firebud_region_visual_v1": ["firebud_training_yard", "firebud_village_gate"],
		"mistcap_marsh_visual_v1": ["mistcap_marsh"],
	}
	var bundle_id := str(plan.get("bundleId", ""))
	var samples = plan.get("samples", [])
	if not maps.has(bundle_id) or not samples is Array or samples.is_empty():
		_errors.append("invalid_sample_matrix")
		return {}
	var repetitions = plan.get("repetitions", 0)
	if (not (repetitions is float or repetitions is int)
		or float(repetitions) != float(int(repetitions))
		or int(repetitions) < 3 or int(repetitions) > 9 or int(repetitions) % 2 != 1):
		_errors.append("invalid_repetitions")
		return {}
	var expected: Array = []
	var bundle_maps: Array = maps[bundle_id]
	for repetition in range(1, int(repetitions) + 1):
		for offset in range(bundle_maps.size()):
			var map_id: String = bundle_maps[(offset + repetition - 1) % bundle_maps.size()]
			for mode in ["idle", "moving"]:
				var variants := ["baseline", "candidate"] if repetition % 2 else ["candidate", "baseline"]
				for variant in variants:
					expected.append({"mapId": map_id, "variant": variant, "mode": mode, "repetition": float(repetition)})
	if samples != expected:
		_errors.append("sample_order_mismatch")
	if FileAccess.get_sha256(OS.get_executable_path()) != plan.get("executableSha256"):
		_errors.append("executable_hash_mismatch")
	return plan


func _finish() -> void:
	print("map performance batch complete: %s" % JSON.stringify({
		"status": "passed" if _errors.is_empty() else "failed",
		"planSha256": _plan_sha, "processId": OS.get_process_id(),
		"rootWindowId": root.get_window_id(),
		"windowCount": DisplayServer.get_window_list().size(),
		"completedSamples": _completed, "releasedMainCount": _released,
		"remainingMainCount": _main_count(), "errors": _errors,
	}))
	quit(0 if _errors.is_empty() else 1)
