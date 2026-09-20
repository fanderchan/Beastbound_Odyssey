extends RefCounted

const Playthrough := preload("res://scripts/qa/guardian_battle_playthrough.gd")
const Iso := preload("res://scripts/world/isometric_map_model.gd")
const WaitBudget := preload("res://scripts/qa/cave_journey_wait_budget.gd")
const RETURN_MAPS := ["earth_vein_cave_f3", "earth_vein_cave_f2", "earth_vein_cave", "firebud_village_gate"]


static func run(host, output_dir: String, expected_world_players: Array, deadline_ms: int) -> Dictionary:
	var report: Dictionary = await Playthrough.run(host, output_dir, expected_world_players)
	report["kind"] = "automated_cave_journey_viewport_input"
	report["performanceEvidence"] = false
	report["route"] = [_world_snapshot(host)]
	report["ordinaryBattles"] = []
	report["returnTiming"] = []
	if report.status != "passed":
		return report
	report.status = "running"
	for destination in RETURN_MAPS:
		if not await _travel(host, output_dir, destination, report, deadline_ms):
			return report
	report["endMap"] = host.current_map_id
	report["status"] = "passed" if report.errors.is_empty() else "failed"
	return report


static func _travel(host, output_dir: String, destination: String, report: Dictionary, deadline_ms: int) -> bool:
	var tree: SceneTree = host.get_tree()
	var origin: String = host.current_map_id
	var budget := WaitBudget.new(Time.get_ticks_msec(), deadline_ms)
	var route_requested := false
	var stopped_since := 0
	var route_attempts := 0
	while true:
		if FileAccess.file_exists(output_dir.path_join("stop")):
			return _fail(report, "cave journey cancelled")
		var timing_error := _sample_wait(host, budget)
		if not timing_error.is_empty():
			return _fail(report, timing_error + ": " + origin)
		if host.battle_active:
			var battle: Dictionary = host.battle_state
			var room_id := str((battle.get("serverRoom", {}) as Dictionary).get("roomId", ""))
			if room_id.is_empty() or not battle.get("serverAuthority", false):
				return _fail(report, "route encounter is not authoritative")
			report.ordinaryBattles.append({"roomId": room_id, "map": host.current_map_id})
			await Playthrough._capture(host, output_dir, "journey-battle-%02d" % report.ordinaryBattles.size())
			if not await Playthrough._until(tree, func() -> bool:
				if not host.battle_active or host.battle_auto_attack_enabled:
					return true
				var button: Button = host.battle_command_awakened_view.auto_button()
				return button != null and button.is_visible_in_tree() and not button.disabled,
				10, output_dir):
				return _fail(report, "route encounter did not enable normal auto button")
			if host.battle_active and not host.battle_auto_attack_enabled:
				await Playthrough._button(host, host.battle_command_awakened_view.auto_button(), "route automatic battle", report)
			while host.battle_active:
				if FileAccess.file_exists(output_dir.path_join("stop")):
					return _fail(report, "cave journey cancelled")
				timing_error = _sample_wait(host, budget)
				if not timing_error.is_empty():
					return _fail(report, timing_error + ": " + room_id)
				await tree.create_timer(0.1).timeout
			timing_error = budget.sample(Time.get_ticks_msec())
			if not timing_error.is_empty():
				return _fail(report, timing_error + ": " + room_id)
			route_requested = false
			stopped_since = 0
		elif host.battle_result_panel.visible:
			await Playthrough._button(host, host.battle_result_close_button, "close settled battle", report)
			if not await Playthrough._until(tree, func() -> bool: return not host.battle_result_panel.visible, 3, output_dir):
				return _fail(report, "battle result blocked return route")
		elif host.current_map_id != origin:
			if host.current_map_id != destination:
				return _fail(report, "route reached unexpected map: " + str(host.current_map_id))
			await tree.create_timer(0.5).timeout
			var snapshot := _world_snapshot(host)
			report.route.append(snapshot)
			report.returnTiming.append({"from": origin, "to": destination,
				"navigationElapsedMs": budget.navigation_elapsed_ms, "combatElapsedMs": budget.combat_elapsed_ms})
			await Playthrough._capture(host, output_dir, "journey-" + destination)
			if not snapshot.serverSession or snapshot.saving or not snapshot.groundVisible:
				return _fail(report, "route lost server session or ground: " + destination)
			if destination.begins_with("earth_vein_cave") and (
				not snapshot.artPreview or not snapshot.mapVisualActive
				or snapshot.bundleId != "earth_vein_cave_visual_v1"
				or not is_equal_approx(snapshot.zoom[0], 1.52)
				or not is_equal_approx(snapshot.zoom[1], 1.52)
			):
				return _fail(report, "cave transition lost candidate art or actor camera scale")
			print("CAVE_JOURNEY_ARRIVED " + JSON.stringify(snapshot))
			return report.errors.is_empty()
		elif not route_requested:
			var warp_id := ""
			for point in host.map_data.get("interactionPoints", []):
				if point.get("kind") == "warp" and point.get("toMap") == destination:
					warp_id = str(point.get("id", ""))
			if warp_id.is_empty():
				return _fail(report, "missing authoritative return warp: " + destination)
			route_attempts += 1
			if route_attempts > 12:
				return _fail(report, "return route repeatedly stopped: " + origin)
			await Playthrough._button(host, host.world_hud_awakened_view.entry_button("map"), "open return map", report)
			await tree.create_timer(0.3).timeout
			var button: Button = host.map_panel.marker_buttons.get("interaction:" + warp_id)
			await Playthrough._button(host, button, "return warp " + warp_id, report)
			if not report.errors.is_empty():
				return _fail(report, "return warp button unavailable")
			route_requested = true
			stopped_since = 0
		else:
			# Encounters consume navigation. A stationary path may also be waiting
			# for authoritative warp acceptance; allow that response before retrying.
			if host.player.is_auto_moving():
				stopped_since = 0
			elif stopped_since == 0:
				stopped_since = Time.get_ticks_msec()
			elif Time.get_ticks_msec() - stopped_since > 3000:
				route_requested = false
		await tree.create_timer(0.1).timeout
	return false


static func _sample_wait(host, budget: WaitBudget) -> String:
	if not host.battle_active:
		return budget.sample(Time.get_ticks_msec())
	var battle: Dictionary = host.battle_state
	var room_id := str((battle.get("serverRoom", {}) as Dictionary).get("roomId", ""))
	if room_id.is_empty() or not battle.get("serverAuthority", false):
		return "route encounter is not authoritative"
	return budget.sample(Time.get_ticks_msec(), room_id, int(battle.get("round", 0)))


static func _world_snapshot(host) -> Dictionary:
	var cell: Vector2i = Iso.world_to_grid(host.map_data, host.player.global_position)
	var zoom: Vector2 = host.game_camera.zoom
	return {"map": host.current_map_id, "cell": [cell.x, cell.y], "frame": Engine.get_process_frames(),
		"serverSession": host._is_server_account_session(), "saving": host.profile_save_enabled,
		"groundVisible": host.world_ground_layer.visible and host.world_ground_layer.has_ground(),
		"artPreview": host.map_art_review_preview, "mapVisualActive": host.map_visual_render_state.get("active", false),
		"bundleId": host.map_visual_render_state.get("bundleId", ""), "zoom": [zoom.x, zoom.y],
		"playerAlphaHeight": host.player.get_visual_world_rect().size.y * zoom.y}


static func _fail(report: Dictionary, message: String) -> bool:
	report.errors.append(message)
	report.status = "failed"
	return false
