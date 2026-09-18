extends RefCounted

const Iso := preload("res://scripts/world/isometric_map_model.gd")
const Interaction := preload("res://scripts/world/interaction_model.gd")
const Progress := preload("res://scripts/progression/player_progress_model.gd")
const Battle := preload("res://scripts/battle/battle_model.gd")
const WorldDepthLayer := preload("res://scripts/world/world_depth_layer.gd")


static func run(host, output_dir: String, expected_world_players: Array) -> Dictionary:
	var report := {"kind": "automated_viewport_input_playthrough", "computerUse": false, "status": "running", "inputs": [], "errors": []}
	var tree: SceneTree = host.get_tree()
	await tree.create_timer(3.0).timeout
	var initial_revision: int = host.server_profile_sync_expected_revision
	var initial_rings := Progress.backpack_item_count(host.player_profile, "ring_earth_trial")
	if expected_world_players.size() != 4:
		return _fail(report, "fixture must identify four authoritative teammates")
	if not await _until(tree, func() -> bool: return _world_snapshot(host, expected_world_players).valid, 20, output_dir):
		report["initialWorld"] = _world_snapshot(host, expected_world_players)
		return _fail(report, "four distinct authoritative teammate visuals did not appear")
	report["initialWorld"] = _world_snapshot(host, expected_world_players)
	# Observe the real periodic timer and its HTTP completion while standing
	# still; a forced snapshot would miss the regression in the normal callback.
	var refresh := {"timer": 0, "responses": 0}
	var timer_listener := func() -> void: refresh.timer += 1
	var response_listener := func(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
		if result == HTTPRequest.RESULT_SUCCESS and code == 200:
			refresh.responses += 1
	host.online_position_timer.timeout.connect(timer_listener)
	host.online_position_http_request.request_completed.connect(response_listener)
	var refreshed := await _until(tree, func() -> bool:
		return refresh.timer > 0 and refresh.responses > 0 and not host.online_position_request_pending,
		20, output_dir)
	host.online_position_timer.timeout.disconnect(timer_listener)
	host.online_position_http_request.request_completed.disconnect(response_listener)
	report["idleRefresh"] = refresh
	report["worldAfterIdleRefresh"] = _world_snapshot(host, expected_world_players)
	if not refreshed or not report.worldAfterIdleRefresh.valid:
		return _fail(report, "periodic refresh lost teammate visuals")
	await _capture(host, output_dir, "autoplay-start")
	var obscured := false
	for cell in [Vector2i(24, 6), Vector2i(19, 5), Vector2i(21, 8)]:
		var point: Vector2 = host._world_to_screen(Iso.grid_to_world(host.map_data, cell))
		if host._is_ui_point(point):
			return _fail(report, "movement target lies under UI: " + str(cell))
		await _click(host, point, "walk " + str(cell), report)
		var arrived := false
		for _frame in range(600):
			if FileAccess.file_exists(output_dir.path_join("stop")):
				return _fail(report, "playthrough cancelled")
			await tree.physics_frame
			for candidate in host.world_depth_layer._occlusion_candidates:
				var prop: Node2D = candidate.get("node") as Node2D
				if prop.modulate.a < 0.99 and not obscured:
					obscured = true
					await _capture(host, output_dir, "autoplay-occlusion")
			if not host.player.is_auto_moving() and Iso.world_to_grid(host.map_data, host.player.global_position) == cell:
				arrived = true
				break
		if not arrived:
			return _fail(report, "movement did not reach " + str(cell))
		await tree.create_timer(1.0).timeout
	report["occlusionObserved"] = obscured
	await _capture(host, output_dir, "autoplay-returned-in-front")
	await _button(host, host.world_hud_awakened_view.entry_button("map"), "open local map", report)
	await tree.create_timer(0.5).timeout
	var guardian_button: Button
	for button_value in host.map_panel.marker_buttons.values():
		var button := button_value as Button
		if button.text.contains("岩脉守护兽"):
			guardian_button = button
	await _button(host, guardian_button, "route to guardian", report)
	if not await _until(tree, func() -> bool: return host._dialog_is_open(), 10, output_dir):
		return _fail(report, "guardian dialog did not open")
	await _capture(host, output_dir, "autoplay-dialog")
	await tree.create_timer(2.0).timeout
	await _button(host, host.dialog_option_button, "challenge", report)
	if not await _until(tree, func() -> bool: return host.battle_active and host.battle_command_owner == "player", 15, output_dir):
		return _fail(report, "authoritative battle did not start")
	var room: Dictionary = host.battle_state.get("serverRoom", {})
	report["participantCount"] = (room.get("participants", []) as Array).size()
	report["actorCount"] = (host.battle_state.get("actors", []) as Array).size()
	if report.participantCount != 5 or report.actorCount != 20 or not host.battle_state.get("serverAuthority", false):
		return _fail(report, "expected five participants and twenty authoritative actors")
	report["groundHiddenInBattle"] = not host.world_ground_layer.visible
	if not report.groundHiddenInBattle:
		return _fail(report, "world ground remained visible in battle")
	report["battleAppearancesAtStart"] = _battle_appearance_snapshot(host)
	if not report.battleAppearancesAtStart.valid:
		return _fail(report, "battle entry lost authoritative character appearances")
	await _capture(host, output_dir, "autoplay-battle-start")
	await tree.create_timer(2.0).timeout
	var view = host.battle_command_awakened_view
	await _button(host, view.visible_button_with_label("攻击"), "player attack", report)
	await _boss_target(host, report)
	if not await _until(tree, func() -> bool: return host.battle_command_owner == "pet", 5, output_dir):
		return _fail(report, "pet command did not become available")
	await _button(host, view.pet_skill_button(), "pet skills", report)
	await _button(host, host.battle_command_buttons.get("capture"), "Bui charge", report)
	await _boss_target(host, report)
	if not await _until(tree, func() -> bool: return host.battle_active and int(host.battle_state.get("round", 0)) == 2 and host.battle_command_owner == "player", 90, output_dir):
		return _fail(report, "round two did not become available")
	report["battleAppearancesAfterRound"] = _battle_appearance_snapshot(host)
	if not report.battleAppearancesAfterRound.valid:
		return _fail(report, "round playback lost authoritative character appearances")
	await _capture(host, output_dir, "autoplay-boss-telegraph")
	await tree.create_timer(3.0).timeout
	await _button(host, view.visible_button_with_label("防御"), "player defend", report)
	if not await _until(tree, func() -> bool: return host.battle_command_owner == "pet", 5, output_dir):
		return _fail(report, "pet defense did not become available")
	await _button(host, view.visible_button_with_label("防御"), "pet defend", report)
	if not await _until(tree, func() -> bool: return host.battle_active and int(host.battle_state.get("round", 0)) >= 3 and host.battle_command_owner == "player", 90, output_dir):
		return _fail(report, "round three did not become available")
	await _button(host, view.auto_button(), "automatic battle", report)
	if not await _until(tree, func() -> bool: return _battle_completed(host, report), 300, output_dir):
		return _fail(report, "battle did not finish")
	report["groundRestoredAfterBattle"] = host.world_ground_layer.visible and host.world_ground_layer.has_ground()
	if not report.groundRestoredAfterBattle:
		return _fail(report, "world ground did not return with the settled battle")
	await _capture(host, output_dir, "autoplay-result")
	var synchronized := await _until(tree, func() -> bool: return host.server_profile_sync_expected_revision > initial_revision, 20, output_dir)
	report["profileSynchronized"] = synchronized
	report["revisionBefore"] = initial_revision
	report["revisionAfter"] = host.server_profile_sync_expected_revision
	report["endMap"] = host.current_map_id
	report["earthRingsGranted"] = Progress.backpack_item_count(host.player_profile, "ring_earth_trial") - initial_rings
	await tree.create_timer(5.0).timeout
	report["finalWorld"] = _world_snapshot(host, expected_world_players)
	await _capture(host, output_dir, "autoplay-final")
	if not synchronized:
		return _fail(report, "settled server profile did not reach Main")
	if int(report.earthRingsGranted) != 1 or host.current_map_id != "earth_vein_cave_f4":
		return _fail(report, "guardian victory reward or return map missing")
	if not obscured:
		return _fail(report, "walk did not exercise interactive-prop occlusion")
	if not report.finalWorld.valid:
		return _fail(report, "teammate visuals did not return after battle")
	report["status"] = "passed" if report.errors.is_empty() else "failed"
	return report


static func _world_snapshot(host, expected_players: Array) -> Dictionary:
	var rows: Array[Dictionary] = []
	var valid: bool = host.world_ground_layer.visible and host.world_ground_layer.has_ground()
	var remotes: Array = host.world_depth_layer._group_nodes.get("remote_actors", [])
	for expected in expected_players:
		var row := {"name": str(expected.displayName), "expectedAppearanceId": str(expected.appearanceId), "visible": false}
		for node in remotes:
			if str(node.get_meta(WorldDepthLayer.STABLE_ID_META, "")) != "remote:%s" % str(expected.accountId):
				continue
			var actor = node.get_node("Presentation")
			row["appearanceId"] = actor.get_appearance_id()
			row["visible"] = node.is_visible_in_tree() and actor.is_visible_in_tree()
			row["formalArt"] = actor.uses_formal_character_art()
			row["sameScaleAsPlayer"] = actor.scale == host.player.scale
			break
		valid = valid and bool(row.visible) and bool(row.get("formalArt", false)) and bool(row.get("sameScaleAsPlayer", false)) and row.get("appearanceId", "") == row.expectedAppearanceId
		rows.append(row)
	return {"valid": valid and rows.size() == 4 and remotes.size() == 4, "visiblePlayers": rows,
		"remoteCount": remotes.size(), "groundVisible": host.world_ground_layer.visible}


static func _battle_appearance_snapshot(host) -> Dictionary:
	var rows: Array[Dictionary] = []
	var valid := true
	var room: Dictionary = host.battle_state.get("serverRoom", {})
	for expected in room.get("battle", {}).get("actors", []):
		if str(expected.get("kind", "")) != "player":
			continue
		var row := {"name": str(expected.get("displayName", "")),
			"expectedAppearanceId": str(expected.get("appearanceId", "")), "appearanceId": "", "renderedAppearanceId": ""}
		for actor in host.battle_state.get("actors", []):
			if str(actor.get("serverActorId", "")) == str(expected.actorId):
				row["appearanceId"] = str(actor.get("appearanceId", ""))
				row["renderedAppearanceId"] = host._battle_actor_appearance_id(actor)
				break
		valid = valid and row.expectedAppearanceId != "" and row.appearanceId == row.expectedAppearanceId and row.renderedAppearanceId == row.expectedAppearanceId
		rows.append(row)
	return {"valid": valid and rows.size() == 5, "players": rows}


static func _battle_completed(host, report: Dictionary) -> bool:
	if host.battle_active:
		var player := Battle.actor_by_id(host.battle_state, Battle.PLAYER_ACTOR_ID)
		var pet := Battle.actor_by_id(host.battle_state, Battle.controlled_pet_id(host.battle_state))
		if int(player.get("hp", 0)) <= 0 and int(pet.get("hp", 0)) > 0 and host.battle_command_owner == "pet" and not host._battle_commands_locked():
			report["downedPlayerPetCommandObserved"] = true
	return not host.battle_active


static func _until(tree: SceneTree, predicate: Callable, seconds: float, output_dir: String) -> bool:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if FileAccess.file_exists(output_dir.path_join("stop")):
			return false
		if predicate.call():
			return true
		await tree.create_timer(0.1).timeout
	return false


static func _button(host, button: Button, label: String, report: Dictionary) -> void:
	if button == null or not button.is_visible_in_tree() or button.disabled:
		report.errors.append("unavailable button: " + label)
		return
	await _click(host, button.get_global_rect().get_center(), label, report)


static func _boss_target(host, report: Dictionary) -> void:
	for actor in host.battle_state.get("actors", []):
		if str(actor.get("name", "")) == "岩脉守护兽":
			var point: Vector2 = host._world_to_screen(host._battle_slot_world_position(str(actor.get("slotId", ""))))
			await _click(host, point + Vector2(0, -18), "guardian target", report)
			return
	report.errors.append("guardian actor not found")


static func _click(host, point: Vector2, label: String, report: Dictionary) -> void:
	var viewport: Viewport = host.get_viewport()
	var tree: SceneTree = host.get_tree()
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	viewport.push_input(motion, true)
	await tree.process_frame
	var press := InputEventMouseButton.new()
	press.position = point
	press.global_position = point
	press.button_index = MOUSE_BUTTON_LEFT
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.pressed = true
	var press_frame := Engine.get_process_frames()
	viewport.push_input(press, true)
	await tree.process_frame
	await tree.physics_frame
	var release := InputEventMouseButton.new()
	release.position = point
	release.global_position = point
	release.button_index = MOUSE_BUTTON_LEFT
	var release_frame := Engine.get_process_frames()
	viewport.push_input(release, true)
	await tree.process_frame
	report.inputs.append({"label": label, "point": [point.x, point.y], "pressFrame": press_frame, "releaseFrame": release_frame, "frameSeparated": release_frame > press_frame})


static func _capture(host, output_dir: String, name: String) -> void:
	await RenderingServer.frame_post_draw
	host.get_viewport().get_texture().get_image().save_png(output_dir.path_join(name + ".png"))


static func _fail(report: Dictionary, message: String) -> Dictionary:
	report.errors.append(message)
	report.status = "failed"
	return report
