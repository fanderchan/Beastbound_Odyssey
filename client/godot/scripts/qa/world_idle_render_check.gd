extends RefCounted

const IdleRenderer := preload("res://scripts/world/world_idle_render_controller.gd")
const IsoMap := preload("res://scripts/world/isometric_map_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const Cleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")
const MAPS := ["earth_vein_cave", "earth_vein_cave_f2", "earth_vein_cave_f3", "earth_vein_cave_f4"]


static func run(host: Node) -> Dictionary:
	var probe := CameraProbe.new(host)
	var was_processing := host.is_processing()
	host.set_process(false)
	await probe.run()
	host.set_process(was_processing)
	var integration := await _check_main(host)
	probe.errors.append_array(integration.errors)
	var cleanup := await Cleanup.drain_audio(host)
	if cleanup.get("status") != "passed":
		probe.errors.append("audio cleanup failed")
	return {
		"status": "ok" if probe.errors.is_empty() else "failed",
		"cameraCases": probe.rows, "comparedFrames": probe.compared,
		"maxCenterError": probe.max_center_error,
		"maxPointerWorldError": probe.max_pointer_error,
		"main": integration, "errors": probe.errors,
	}


static func _check_main(host: Node) -> Dictionary:
	var errors: Array[String] = []
	var original_map: String = host.current_map_id
	var original_preview: bool = host.map_art_review_preview
	host.map_art_review_preview = true
	var checked_maps: Array[String] = []
	for map_id in MAPS:
		if not host._load_map(map_id):
			errors.append("map load failed: " + map_id)
			continue
		for frame in range(24):
			await host.get_tree().process_frame
		if not host.world_idle_renderer.is_sleeping() or not OS.low_processor_usage_mode:
			errors.append("map did not settle into idle rendering: " + map_id)
		if host.game_camera.zoom != Vector2(1.52, 1.52):
			errors.append("candidate zoom changed: " + map_id)
		checked_maps.append(map_id)
	host._load_map("earth_vein_cave_f2")
	for frame in range(24):
		await host.get_tree().process_frame
	var late_modes := {}
	for property in ["perf_probe_enabled", "map_visual_review_capture"]:
		var previous: bool = host.get(property)
		host.set(property, true)
		for frame in range(2):
			await host.get_tree().process_frame
		late_modes[property] = not OS.low_processor_usage_mode
		if not late_modes[property]:
			errors.append("late continuous draw request was ignored: " + property)
		host.set(property, previous)
		for frame in range(2):
			await host.get_tree().process_frame
		if not OS.low_processor_usage_mode:
			errors.append("idle draw policy did not resume after late request: " + property)
	# A fixed-frame probe stops collecting before its audio-drain coroutine
	# completes. The whole visible probe lifecycle must keep drawing.
	var previous_exit_frames: int = host.perf_probe_clean_exit_frames
	var previous_complete: bool = host.perf_probe_measurement_complete
	var previous_probe: bool = host.perf_probe_enabled
	host.perf_probe_clean_exit_frames = 480
	host.perf_probe_enabled = true
	var completed_measurement: bool = host._complete_perf_probe_measurement("idle_render_cleanup_regression")
	var cleanup_continuous_frames := 0
	for frame in range(8):
		await host.get_tree().process_frame
		if not OS.low_processor_usage_mode:
			cleanup_continuous_frames += 1
	if not completed_measurement or host.perf_probe_enabled or cleanup_continuous_frames != 8:
		errors.append("completed measurement did not retain continuous drawing through cleanup")
	host.perf_probe_clean_exit_frames = previous_exit_frames
	host.perf_probe_measurement_complete = previous_complete
	host.perf_probe_enabled = previous_probe
	for frame in range(2):
		await host.get_tree().process_frame
	if not OS.low_processor_usage_mode:
		errors.append("ordinary idle policy did not resume after the probe lifecycle")
	var start: Vector2 = host.player.global_position
	var cell := IsoMap.world_to_grid(host.map_data, start) + Vector2i(0, -1)
	var target := IsoMap.grid_to_world(host.map_data, cell)
	var point: Vector2 = host._world_to_screen(target)
	var input_events := 0
	var input_frames: Array[int] = []
	var input_woke_renderer := false
	var accepted_before: int = host.click_move_input_accept_count
	if not IsoMap.is_walkable(host.map_data, cell) or host._is_ui_point(point):
		errors.append("mouse movement fixture is not clickable")
	else:
		var input_position: Vector2 = host.get_viewport().get_screen_transform() * point
		for pressed in [true, false]:
			var event := InputEventMouseButton.new()
			event.button_index = MOUSE_BUTTON_LEFT
			event.pressed = pressed
			event.position = input_position
			event.global_position = input_position
			Input.parse_input_event(event)
			input_events += 1
			input_frames.append(Engine.get_process_frames())
			await host.get_tree().process_frame
			# parse_input_event can enqueue the event; inspect the first delivered
			# frame, before releasing the button, rather than the enqueue call.
			if pressed:
				input_woke_renderer = (
					host.click_move_input_accept_count == accepted_before + 1
					and not OS.low_processor_usage_mode and Engine.max_fps == host.ACTIVE_TARGET_FPS
				)
				if not input_woke_renderer:
					errors.append("first delivered movement input did not restore active rendering")
	var moving_frames := 0
	var active_render_frames := 0
	for frame in range(180):
		await host.get_tree().process_frame
		if host.player.is_moving():
			moving_frames += 1
			if not OS.low_processor_usage_mode:
				active_render_frames += 1
	var arrived: bool = host.player.global_position.distance_to(target) <= 6.0
	if input_events != 2 or input_frames[0] == input_frames[1] or moving_frames <= 0 or not arrived:
		errors.append("cross-frame mouse movement did not arrive")
	if active_render_frames != moving_frames:
		errors.append("moving world used idle render policy")
	if not host.world_idle_renderer.is_sleeping() or not OS.low_processor_usage_mode:
		errors.append("camera did not sleep after movement tail")
	# Exercise Main's existing layout and battle transitions, not copies of its
	# camera math. The combat fixture is offline QA; it does not prove networking.
	host.map_panel.visible = true
	host._layout_hud()
	for frame in range(4):
		await host.get_tree().process_frame
	if OS.low_processor_usage_mode or Engine.max_fps != host.ACTIVE_TARGET_FPS:
		errors.append("open menu did not restore active rendering")
	host.map_panel.visible = false
	host._layout_hud()
	var zones := EncounterModel.encounter_zones(host.map_data)
	if zones.is_empty():
		errors.append("cave battle fixture has no encounter zone")
	else:
		host._start_battle(BattleModel.create_wild_battle(zones[0] as Dictionary))
	for frame in range(4):
		await host.get_tree().process_frame
	var entered_battle: bool = host.battle_active
	if not entered_battle or OS.low_processor_usage_mode:
		errors.append("battle did not restore continuous rendering")
	host._end_battle(false)
	for frame in range(90):
		await host.get_tree().process_frame
	var returned: bool = not host.battle_active and host.world_idle_renderer.is_sleeping() and OS.low_processor_usage_mode
	if not returned or host.game_camera.zoom != Vector2(1.52, 1.52):
		errors.append("battle return did not restore world camera and idle rendering")
	host.map_art_review_preview = original_preview
	host._load_map(original_map)
	return {
		"maps": checked_maps, "inputEvents": input_events, "inputFrames": input_frames,
		"inputWokeRenderer": input_woke_renderer,
		"lateContinuousModes": late_modes,
		"completedMeasurement": completed_measurement,
		"cleanupContinuousFrames": cleanup_continuous_frames,
		"movingFrames": moving_frames, "activeRenderMovingFrames": active_render_frames,
		"arrived": arrived, "battleEntered": entered_battle, "battleReturned": returned,
		"errors": errors,
	}


class CameraProbe extends RefCounted:
	var host: Node
	var controller := IdleRenderer.new()
	var baseline: Camera2D
	var candidate: Camera2D
	var viewports: Array[SubViewport] = []
	var parents: Array[Node2D] = []
	var errors: Array[String] = []
	var rows: Array[Dictionary] = []
	var compared := 0
	var max_center_error := 0.0
	var max_pointer_error := 0.0

	func _init(host_ref: Node) -> void:
		host = host_ref

	func run() -> void:
		for index in range(2):
			var viewport := SubViewport.new()
			viewport.size = Vector2i(1280, 720)
			viewport.world_2d = World2D.new()
			host.add_child(viewport)
			viewports.append(viewport)
			var parent := Node2D.new()
			viewport.add_child(parent)
			parents.append(parent)
			var camera := Camera2D.new()
			camera.position_smoothing_enabled = true
			camera.position_smoothing_speed = 7.0
			camera.position = Vector2(500, 1000)
			parent.add_child(camera)
			camera.make_current()
			if index == 0: baseline = camera
			else: candidate = camera
		await _case("initial_idle", 30, func(_frame): pass, true)
		await _case("moving_target", 60, func(frame):
			baseline.position = Vector2(500 + frame * 2.0, 1000 + frame * 0.5)
			candidate.position = baseline.position, false)
		await _case("smoothing_tail", 180, func(_frame): pass, true)
		await _case("zoom", 30, func(frame):
			if frame == 0:
				baseline.zoom = Vector2(1.52, 1.52)
				candidate.zoom = baseline.zoom, true)
		await _case("viewport_resize", 30, func(frame):
			if frame == 0:
				for viewport in viewports: viewport.size = Vector2i(960, 540), true)
		await _case("offset_fallback", 30, func(frame):
			if frame == 0:
				baseline.offset = Vector2(25, -10)
				candidate.offset = baseline.offset, false)
		await _case("offset_restore", 30, func(frame):
			if frame == 0:
				baseline.offset = Vector2.ZERO
				candidate.offset = Vector2.ZERO, true)
		await _case("teleport_reset", 30, func(frame):
			if frame == 0:
				baseline.position = Vector2(-320, 640)
				candidate.position = baseline.position
				baseline.reset_smoothing()
				candidate.reset_smoothing()
				controller.observe(candidate, true), true)
		await _case("rotation_fallback", 30, func(frame):
			if frame == 0:
				baseline.ignore_rotation = false
				candidate.ignore_rotation = false
				baseline.rotation = 0.2
				candidate.rotation = 0.2, false)
		await _case("rotation_restore", 30, func(frame):
			if frame == 0:
				baseline.ignore_rotation = true
				candidate.ignore_rotation = true, true)
		await _case("physics_fallback", 30, func(frame):
			if frame == 0:
				baseline.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
				candidate.process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS, false)
		await _case("idle_callback_restore", 30, func(frame):
			if frame == 0:
				baseline.process_callback = Camera2D.CAMERA2D_PROCESS_IDLE
				candidate.process_callback = Camera2D.CAMERA2D_PROCESS_IDLE, true)
		await _case("drag_offset_fallback", 30, func(frame):
			if frame == 0:
				baseline.drag_horizontal_offset = 0.4
				candidate.drag_horizontal_offset = 0.4, false)
		await _case("drag_offset_restore", 180, func(frame):
			if frame == 0:
				baseline.drag_horizontal_offset = 0.0
				candidate.drag_horizontal_offset = 0.0, true)
		await _case("external_canvas_write", 30, func(frame):
			if frame == 0:
				for viewport in viewports: viewport.canvas_transform = Transform2D(0.0, Vector2(20, 40)), true)
		await _case("parent_transform", 180, func(frame):
			if frame == 0:
				for parent in parents: parent.position = Vector2(60, -20), true)
		await _case("speed_setter_wake", 30, func(frame):
			if frame == 0:
				baseline.position_smoothing_speed = 10.0
				candidate.position_smoothing_speed = 10.0, true)
		await _case("disabled", 30, func(_frame): controller.enabled = false, false)
		await _case("enabled_again", 30, func(_frame): controller.enabled = true, true)
		var prior := OS.low_processor_usage_mode
		controller.configure_runtime()
		controller.apply_runtime_budget(false)
		if not OS.low_processor_usage_mode: errors.append("idle render budget not applied")
		controller.apply_runtime_budget(false, true)
		if OS.low_processor_usage_mode: errors.append("late continuous draw request not applied")
		controller.apply_runtime_budget(false)
		if not OS.low_processor_usage_mode: errors.append("late continuous draw request did not release")
		controller.apply_runtime_budget(true)
		if OS.low_processor_usage_mode: errors.append("active render budget not applied")
		controller.apply_runtime_budget(false)
		controller.release()
		if OS.low_processor_usage_mode != prior or not candidate.is_processing_internal():
			errors.append("release did not restore camera and global render policy")
		controller.release()
		if OS.low_processor_usage_mode != prior: errors.append("release was not idempotent")
		controller.configure_runtime(true)
		for frame in range(8):
			controller.observe(candidate)
			await host.get_tree().process_frame
		controller.apply_runtime_budget(false)
		if OS.low_processor_usage_mode or not controller.is_sleeping():
			errors.append("fixed continuous mode must keep draws without disabling camera suspension")
		controller.release()
		if OS.low_processor_usage_mode != prior: errors.append("profiling release changed prior render policy")
		if rows.size() != 19 or compared != 1050:
			errors.append("incomplete paired camera matrix")
		for viewport in viewports:
			host.remove_child(viewport)
			viewport.free()

	func _case(label: String, frames: int, action: Callable, expect_sleep: bool) -> void:
		var sleeping_frames := 0
		for frame in range(frames):
			action.call(frame)
			controller.observe(candidate)
			await host.get_tree().process_frame
			var center_error := candidate.get_screen_center_position().distance_to(baseline.get_screen_center_position())
			var point := Vector2(200, 240)
			var a := viewports[0].canvas_transform.affine_inverse() * point
			var b := viewports[1].canvas_transform.affine_inverse() * point
			max_center_error = maxf(max_center_error, center_error)
			max_pointer_error = maxf(max_pointer_error, a.distance_to(b))
			if (center_error > 0.01 or a.distance_to(b) > 0.01) and errors.size() < 20:
				errors.append("%s frame %d changed camera or pointer coordinates" % [label, frame])
			if controller.is_sleeping(): sleeping_frames += 1
			compared += 1
		if controller.is_sleeping() != expect_sleep: errors.append(label + " suspension mismatch")
		rows.append({"case": label, "frames": frames, "sleepingFrames": sleeping_frames, "sleeping": controller.is_sleeping()})
