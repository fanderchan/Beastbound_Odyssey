extends RefCounted


static func run(host: Node) -> Dictionary:
	var errors: Array[String] = []
	var clicks: Array[Dictionary] = []
	host._clear_navigation_state()
	if host.player != null:
		host.player.clear_move_target()
	host.encounter_grace_remaining = 3600.0
	var panel: Control = host.battle_result_panel
	var button: Button = host.battle_result_close_button
	if panel == null or button == null or host.player == null:
		return {"status": "failed", "errors": ["battle result controls missing"]}
	for result_key in ["victory", "defeat", "escape"]:
		host._open_battle_result_panel({}, result_key, "战斗已结束。", "战斗", false)
		await host.get_tree().process_frame
		await host.get_tree().process_frame
		var body_point: Vector2 = host.battle_result_detail_label.get_global_rect().get_center()
		var button_point := button.get_global_rect().get_center()
		for action in ["body", "right_confirm", "confirm"]:
			var point: Vector2 = body_point if action == "body" else button_point
			var before_position: Vector2 = host.player.global_position
			var before_facing: String = host.player.get_facing_key()
			var before_accepted: int = host.click_move_input_accept_count
			var before_rejected: int = host.click_move_input_ui_reject_count
			var before_resolved: int = host.click_move_screen_resolve_count
			var before_applied: int = host.click_move_repath_apply_count
			var click := await _click(host, point, MOUSE_BUTTON_RIGHT if action == "right_confirm" else MOUSE_BUTTON_LEFT)
			click["result"] = result_key
			click["action"] = action
			clicks.append(click)
			if not click.frameSeparated:
				errors.append("press and release were not on separate frames")
			if host.click_move_input_ui_reject_count != before_rejected + 1:
				errors.append("%s/%s: result panel did not block world input" % [result_key, action])
			if (
				host.click_move_input_accept_count != before_accepted
				or host.click_move_screen_resolve_count != before_resolved
				or host.click_move_repath_apply_count != before_applied
				or host.has_pending_click_screen_point
				or host.has_pending_click_move_target
				or not host.current_path_cells.is_empty()
				or host.player.is_auto_moving()
				or not host.player.global_position.is_equal_approx(before_position)
				or host.player.get_facing_key() != before_facing
			):
				errors.append("%s/%s: result click changed world movement or facing" % [result_key, action])
			if panel.visible != (action != "confirm"):
				errors.append("%s/%s: only left confirmation should close result" % [result_key, action])
			host._clear_navigation_state()
			host.player.clear_move_target()
		# A hidden result panel must not leave a dead area over the world.
		var before_ground_accepted: int = host.click_move_input_accept_count
		var ground_click := await _click(host, button_point, MOUSE_BUTTON_LEFT)
		ground_click["result"] = result_key
		ground_click["action"] = "ground_after_close"
		clicks.append(ground_click)
		if not ground_click.frameSeparated or host.click_move_input_accept_count != before_ground_accepted + 1:
			errors.append("%s: closed result panel still blocks world input" % result_key)
		host._clear_navigation_state()
		host.player.clear_move_target()
		await host.get_tree().physics_frame
	return {"status": "passed" if errors.is_empty() else "failed", "clicks": clicks, "errors": errors}


static func _click(host: Node, point: Vector2, button: MouseButton) -> Dictionary:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	host.get_viewport().push_input(motion, true)
	await host.get_tree().process_frame
	var press_frame := Engine.get_process_frames()
	var press := InputEventMouseButton.new()
	press.button_index = button
	press.pressed = true
	press.position = point
	press.global_position = point
	host.get_viewport().push_input(press, true)
	await host.get_tree().process_frame
	var release_frame := Engine.get_process_frames()
	var release := InputEventMouseButton.new()
	release.button_index = button
	release.pressed = false
	release.position = point
	release.global_position = point
	host.get_viewport().push_input(release, true)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame
	return {"frameSeparated": release_frame > press_frame, "pressFrame": press_frame, "releaseFrame": release_frame}
