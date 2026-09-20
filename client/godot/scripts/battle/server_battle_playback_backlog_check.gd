extends RefCounted

const RoomModel := preload("res://scripts/battle/server_battle_room_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PlaybackQueue := preload("res://scripts/battle/server_battle_playback_queue.gd")


static func run(host, fixture: Dictionary, session: Dictionary, event_fixture: Dictionary) -> bool:
	var checks := _queue_checks()
	host._end_battle(true)
	host.current_account_session = session.duplicate(true)
	host.battle_auto_attack_enabled = false
	host.server_battle_last_playback_turn_key = ""
	host.server_battle_state["room"] = fixture.duplicate(true)
	host._start_battle(RoomModel.battle_state_from_room(fixture, session))
	var turns: Array[Dictionary] = []
	for round_number in range(1, 5):
		var turn := event_fixture.duplicate(true)
		turn["round"] = round_number
		turn["turnSeq"] = round_number
		turn.events[0]["eventId"] = "backlog_round_%d" % round_number
		turn.events[0]["hpBefore"] = 88 - 17 * (round_number - 1)
		turn.events[0]["hpAfter"] = 88 - 17 * round_number
		for actor in turn.actors:
			if actor.actorId == "actor_a_pet":
				actor.hp = turn.events[0].hpAfter
		turns.append(turn)
	checks["first_turn_started"] = host._play_server_battle_event_list(turns[0])
	var second_room := _room_after_turn(fixture, turns[1])
	# Reconnect history includes compact turn events without a redundant room.
	host._apply_battle_event({"type": "battle.turn_resolved", "roomId": fixture.roomId, "turn": turns[2]})
	host._apply_battle_event({"type": "battle.turn_resolved", "room": second_room, "turn": turns[1]})
	var closed := _room_after_turn(fixture, turns[3])
	closed["status"] = "closed"
	closed.battle["phase"] = "finished"
	closed.battle["result"] = {"reason": "defeat", "winnerAccountId": "acc_b", "loserAccountIds": ["acc_a"]}
	host._apply_battle_event({"type": "battle.room_closed", "room": closed})
	# A late HTTP response must not rewind authoritative room metadata or replay twice.
	host._server_battle()._apply_command_success({"room": second_room, "turn": turns[1]}, "attack", false)
	checks["current_turn_snapshot_preserved"] = int(host.battle_state.get("lastServerEventList", {}).get("round", 0)) == 1
	checks["future_hp_not_applied"] = int(BattleModel.actor_by_id(host.battle_state, "enemy_pet").get("hp", -1)) == 71
	checks["closed_snapshot_not_rewound"] = str(host.server_battle_state.get("room", {}).get("status", "")) == "closed"
	checks["close_waits_for_playback"] = host.battle_active
	var foreign_turn := turns[3].duplicate(true)
	foreign_turn["roomId"] = "another_room"
	checks["foreign_turn_rejected"] = not host._play_server_battle_event_list(foreign_turn)
	var played: Array[int] = [1]
	for _frame in range(900):
		if not host.battle_active:
			break
		await host.get_tree().process_frame
		if host.battle_active:
			var round_number := int(host.battle_state.get("round", 0))
			if played.back() != round_number:
				played.append(round_number)
	checks["every_turn_played_once_in_order"] = played == [1, 2, 3, 4]
	checks["closed_after_final_turn"] = not host.battle_active
	checks["queue_cleared_on_settlement"] = host._server_battle().playback_queue.pending.is_empty()
	var next_room := fixture.duplicate(true)
	next_room["roomId"] = "next_backlog_room"
	host.server_battle_state["room"] = next_room
	host._start_battle(RoomModel.battle_state_from_room(next_room, session))
	var next_turn := turns[0].duplicate(true)
	next_turn["roomId"] = next_room.roomId
	checks["next_battle_restarts_at_turn_one"] = host._play_server_battle_event_list(next_turn)
	host._end_battle(true)
	checks["queue_cleared_on_interruption"] = host._server_battle().playback_queue.room_id == ""
	print("server battle playback backlog check: " + JSON.stringify({"checks": checks, "played": played}))
	return not checks.values().has(false)


static func _room_after_turn(fixture: Dictionary, turn: Dictionary) -> Dictionary:
	var room := fixture.duplicate(true)
	room.battle["round"] = int(turn.round) + 1
	room.battle["actors"] = turn.actors.duplicate(true)
	room.battle["lastEventList"] = turn.duplicate(true)
	return room


static func _queue_checks() -> Dictionary:
	var queue := PlaybackQueue.new()
	queue.reset("queue_room")
	var turn := {"kind": "battle_event_list", "roomId": "queue_room", "round": 1, "turnSeq": 1}
	var checks := {}
	queue.enqueue(turn)
	checks["pending_duplicate_rejected"] = not queue.enqueue(turn)
	queue.take_next()
	checks["played_duplicate_rejected"] = not queue.enqueue(turn)
	for number in range(2, PlaybackQueue.MAX_PENDING_TURNS + 7):
		turn["round"] = number
		turn["turnSeq"] = number
		queue.enqueue(turn)
	checks["stalled_client_memory_bounded"] = queue.pending.size() == PlaybackQueue.MAX_PENDING_TURNS and queue.skipped_turns == 5
	checks["overflow_keeps_recent_authoritative_history"] = int(queue.take_next().round) == 7
	queue.reset("new_room")
	checks["room_reset_discards_old_history"] = queue.pending.is_empty() and queue.last_started.is_empty() and queue.skipped_turns == 0
	return checks
