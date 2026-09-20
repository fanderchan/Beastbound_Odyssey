extends RefCounted

const Overlay := preload("res://scripts/ui/battle_outcome_float_overlay.gd")
const RoomModel := preload("res://scripts/battle/server_battle_room_model.gd")


static func run(host, room: Dictionary, session: Dictionary) -> bool:
	var tree: SceneTree = host.get_tree()
	var checks := {}
	var overlay := _new_overlay(host)
	var started: Array[String] = []
	var completed: Array[String] = []
	overlay.sequence_started.connect(func(id: String) -> void: started.append(id))
	overlay.sequence_completed.connect(func(id: String) -> void: completed.append(id))
	overlay.present(_view("cancelled"), 1.0)
	checks["cancelled_sequence_started"] = await _until(tree, func(): return started == ["cancelled"])
	overlay.dismiss()
	overlay.present(_view("replacement", 8), 0.5)
	# The cancelled title timer wakes while its replacement is still playing.
	await tree.create_timer(0.30).timeout
	checks["old_timer_cannot_stop_replacement"] = bool(overlay.snapshot().active)
	checks["cancelled_outcome_stays_deduplicated"] = not overlay.present(_view("cancelled"), 0.5)
	overlay.present(_view("queued"), 0.5)
	await tree.create_timer(0.06).timeout
	checks["third_outcome_waits_its_turn"] = started == ["cancelled", "replacement"] and int(overlay.snapshot().queuedCount) == 1
	checks["replacement_queue_finishes"] = await _until(tree, func(): return completed.size() == 2, 8.0)
	checks["replacement_queue_completes_once_in_order"] = completed == ["replacement", "queued"]
	checks["normal_queue_auto_closes"] = not overlay.visible and not bool(overlay.snapshot().active) and _row_nodes(overlay) == 0
	checks["mouse_passthrough"] = bool(overlay.snapshot().mouseFilterIgnore)
	overlay.dismiss()
	overlay.get_parent().queue_free()
	await tree.process_frame

	overlay = _new_overlay(host)
	overlay.present(_view("retiring", 8), 1.0)
	checks["retiring_row_observed"] = await _until(tree, func(): return _row_nodes(overlay) > Overlay.MAX_VISIBLE_ROWS)
	overlay.dismiss()
	await tree.process_frame
	checks["cancel_removes_retiring_rows"] = _row_nodes(overlay) == 0 and not overlay.visible
	overlay.present(_view("after_retirement"), 0.5)
	await tree.process_frame
	await tree.process_frame
	checks["retired_rows_do_not_reappear"] = _row_nodes(overlay) == 0
	overlay.dismiss()
	overlay.get_parent().queue_free()
	await tree.process_frame

	overlay = _new_overlay(host)
	var title := overlay.get_node("OutcomeTitle") as Label
	var title_y := title.position.y
	overlay.present(_view("fading"), 0.5)
	checks["title_fade_observed"] = await _until(tree, func(): return title.position.y < title_y - 1.0)
	overlay.dismiss()
	overlay.present(_view("after_fade"), 0.5)
	await tree.process_frame
	await tree.process_frame
	checks["interrupted_title_resets_position"] = is_equal_approx(title.position.y, title_y)
	overlay.dismiss()
	overlay.get_parent().queue_free()
	await tree.process_frame

	checks.merge(await _layout_checks(host))

	# Exercise the actual Main/PFC battle transition, not just the widget API.
	host._end_battle(true)
	host.current_account_session = session.duplicate(true)
	host.battle_auto_attack_enabled = false
	var flow = host._panel_flow()
	flow._dismiss_battle_outcome_float(true)
	var profile_before: Dictionary = host.player_profile.duplicate(true)
	var previous_view := _view("world_before_encounter", 8)
	flow._present_battle_outcome_float(previous_view, 1.0)
	checks["world_reward_visible_before_encounter"] = await _until(tree, func(): return int(flow._battle_outcome_overlay_snapshot().get("rowCount", 0)) > 0)
	flow._present_battle_outcome_float(_view("world_queued_before_encounter"), 1.0)
	var next_room := room.duplicate(true)
	next_room["roomId"] = "outcome_lifecycle_next_room"
	host.server_battle_state["room"] = next_room
	host._start_battle(RoomModel.battle_state_from_room(next_room, session))
	var entered: Dictionary = flow._battle_outcome_overlay_snapshot()
	checks["battle_entry_clears_reward_display_and_queue"] = host.battle_active and not bool(entered.visible) and not bool(entered.active) and int(entered.rowCount) == 0 and int(entered.queuedCount) == 0
	checks["battle_entry_keeps_dedupe"] = not flow._present_battle_outcome_float(previous_view, 1.0)
	await tree.create_timer(0.30).timeout
	checks["cancelled_world_timer_cannot_reopen_in_battle"] = not bool(flow._battle_outcome_overlay_snapshot().visible)
	host._end_battle(true)
	checks["next_victory_accepted"] = flow._present_battle_outcome_float(_view("next_victory"), 0.5)
	checks["next_victory_auto_finishes"] = await _until(tree, func():
		var snapshot: Dictionary = flow._battle_outcome_overlay_snapshot()
		return str(snapshot.lastOutcomeId) == "next_victory" and not bool(snapshot.active)
	)
	checks["presentation_did_not_change_profile"] = host.player_profile == profile_before
	flow._dismiss_battle_outcome_float()
	print("battle outcome lifecycle check: " + JSON.stringify({"checks": checks, "started": started, "completed": completed}))
	return not checks.values().has(false)


static func _layout_checks(host) -> Dictionary:
	var overlay := _new_overlay(host)
	var title := overlay.get_node("OutcomeTitle") as Label
	var title_overlaps := 0
	var row_overlaps := 0
	var frames := 0
	var max_rows := 0
	overlay.present(_view("long_reward_queue", 10), 0.8)
	var deadline := Time.get_ticks_msec() + 6000
	while bool(overlay.snapshot().active) and Time.get_ticks_msec() < deadline:
		await host.get_tree().process_frame
		frames += 1
		var rects: Array[Rect2] = []
		for child in overlay.get_children():
			if child is PanelContainer and child.visible and child.modulate.a > 0.1:
				var rect: Rect2 = child.get_global_rect()
				if title.visible and title.modulate.a > 0.1 and rect.intersects(title.get_global_rect()):
					title_overlaps += 1
				for other in rects:
					if rect.intersects(other):
						row_overlaps += 1
				rects.append(rect)
		max_rows = maxi(max_rows, rects.size())
	var checks := {
		"long_queue_animation_sampled": frames >= 60 and max_rows >= 5 and int(overlay.snapshot().completedCount) == 1,
		"rewards_stay_below_title": title_overlaps == 0,
		"entering_and_retiring_rows_do_not_overlap": row_overlaps == 0,
	}
	print("battle outcome layout check: " + JSON.stringify({"frames": frames, "maxRows": max_rows, "titleOverlaps": title_overlaps, "rowOverlaps": row_overlaps}))
	overlay.dismiss()
	overlay.get_parent().queue_free()
	await host.get_tree().process_frame
	return checks


static func _new_overlay(host) -> Control:
	var surface := Control.new()
	surface.size = Vector2(1280, 720)
	surface.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.hud_root.add_child(surface)
	var overlay := Overlay.new()
	surface.add_child(overlay)
	return overlay


static func _row_nodes(overlay: Control) -> int:
	var count := 0
	for child in overlay.get_children():
		if child is PanelContainer:
			count += 1
	return count


static func _until(tree: SceneTree, condition: Callable, seconds: float = 4.0) -> bool:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000.0)
	while not bool(condition.call()) and Time.get_ticks_msec() < deadline:
		await tree.process_frame
	return bool(condition.call())


static func _view(id: String, row_count: int = 1) -> Dictionary:
	var rows: Array[Dictionary] = []
	for index in range(row_count):
		rows.append({"text": "获得石币 %d" % (index + 1), "kind": "currency"})
	return {"outcomeId": id, "title": "战斗胜利", "rewardRows": rows}
