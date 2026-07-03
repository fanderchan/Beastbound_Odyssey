extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")

const SERVER_BATTLE_WAITING_POLL_SECONDS := 1.0
const SERVER_BATTLE_ROOM_RESTORE_POLL_SECONDS := 1.0

var host


func _init(main_host = null) -> void:
	host = main_host


func bind(main_host) -> void:
	host = main_host


func handle_session_invalid_response(parsed: Dictionary) -> bool:
	if not ServerAuthClientModel.is_session_invalid_response(parsed):
		return false
	var message := str(parsed.get("message", "登录已过期，请重新登录。")).strip_edges()
	if message == "":
		message = "登录已过期，请重新登录。"
	host._handle_server_session_expired(message)
	return true


func should_poll_waiting_state() -> bool:
	var phase := str(host.battle_state.get("phase", "")).strip_edges()
	return (
		host._battle_is_server_authority()
		and (phase == "server_waiting" or phase == "command" or phase == "round_events")
		and not host.server_battle_command_request_active
		and not host.server_battle_state_poll_request_active
		and not host._server_battle_event_playback_active()
	)


func update_waiting_state_poll(delta: float) -> void:
	if not should_poll_waiting_state():
		host.server_battle_waiting_poll_elapsed = 0.0
		return
	host.server_battle_waiting_poll_elapsed += maxf(0.0, delta)
	if host.server_battle_waiting_poll_elapsed < SERVER_BATTLE_WAITING_POLL_SECONDS:
		return
	host.server_battle_waiting_poll_elapsed = 0.0
	host._request_server_battle_waiting_state_poll()


func should_poll_room_restore() -> bool:
	# Room restore is explicit on login and server events; idle polling can reopen stale party-member rooms.
	return false


func update_room_restore_poll(delta: float) -> void:
	if not should_poll_room_restore():
		host.server_battle_room_restore_poll_elapsed = 0.0
		return
	host.server_battle_room_restore_poll_elapsed += maxf(0.0, delta)
	if host.server_battle_room_restore_poll_elapsed < SERVER_BATTLE_ROOM_RESTORE_POLL_SECONDS:
		return
	host.server_battle_room_restore_poll_elapsed = 0.0
	host._request_server_battle_room_restore_poll()


func request_room_restore_poll() -> void:
	if not should_poll_room_restore():
		return
	var token: String = host._server_profile_token()
	var base_url: String = host._server_profile_base_url()
	if token == "" or base_url == "":
		return
	host.server_battle_state_poll_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.battle_state_request(base_url, token))
	host.server_battle_state_poll_request_active = false
	if not host._is_server_account_session() or token != host._server_profile_token():
		return
	if host.battle_active or host.encounter_active or host.server_party_encounter_request_pending:
		return
	var parsed := ServerAuthClientModel.parse_battle_state_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		handle_session_invalid_response(parsed)
		return
	host.server_battle_state["incomingInvites"] = parsed.get("incomingInvites", [])
	host.server_battle_state["outgoingInvites"] = parsed.get("outgoingInvites", [])
	var room = parsed.get("room", null)
	if room is Dictionary and ServerBattleRoomModel.is_restorable_room(room as Dictionary):
		host._stop_party_member_local_movement(false)
		if host._apply_server_battle_room_state(room as Dictionary, true):
			host.server_battle_room_restore_poll_elapsed = 0.0


func request_waiting_state_poll() -> void:
	if not should_poll_waiting_state():
		return
	var token: String = host._server_profile_token()
	var base_url: String = host._server_profile_base_url()
	var expected_room_id := str(host.battle_state.get("serverRoomId", "")).strip_edges()
	if token == "" or base_url == "" or expected_room_id == "":
		return
	host.server_battle_state_poll_request_active = true
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.battle_state_request(base_url, token))
	host.server_battle_state_poll_request_active = false
	if not host._is_server_account_session() or token != host._server_profile_token():
		return
	if not host._battle_is_server_authority() or str(host.battle_state.get("serverRoomId", "")).strip_edges() != expected_room_id:
		return
	var parsed := ServerAuthClientModel.parse_battle_state_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		handle_session_invalid_response(parsed)
		return
	var room = parsed.get("room", null)
	if room is Dictionary:
		apply_polled_room(room as Dictionary, expected_room_id)
	elif host._battle_is_server_authority():
		host._clear_stale_server_battle_room(host._server_battle_stale_room_message())


func apply_polled_room(room: Dictionary, expected_room_id: String = "") -> void:
	if room.is_empty() or not host._battle_is_server_authority():
		return
	var room_id := str(room.get("roomId", "")).strip_edges()
	var active_room_id := expected_room_id.strip_edges()
	if active_room_id == "":
		active_room_id = str(host.battle_state.get("serverRoomId", "")).strip_edges()
	if active_room_id != "" and room_id != "" and room_id != active_room_id:
		return
	host.server_battle_state["room"] = room.duplicate(true)
	var room_closed := str(room.get("status", "")).strip_edges() == "closed"
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var last_event_list := battle.get("lastEventList", {}) as Dictionary if battle.get("lastEventList", {}) is Dictionary else {}
	if not last_event_list.is_empty():
		var turn_key: String = host._server_battle_turn_key(last_event_list)
		var same_turn_playing: bool = turn_key != "" and turn_key == host.server_battle_last_playback_turn_key and host._server_battle_event_playback_active()
		if same_turn_playing:
			host._sync_server_battle_snapshot_fields_during_playback(room)
			return
		var is_new_turn: bool = turn_key == "" or turn_key != host.server_battle_last_playback_turn_key
		if is_new_turn:
			host._sync_server_battle_snapshot_fields_during_playback(room)
			var playback_started: bool = host._play_server_battle_event_list(last_event_list)
			if not playback_started:
				if room_closed:
					host._apply_server_battle_room_closed(room)
			else:
				host._sync_server_battle_room_scene(false)
			return
	var room_round := maxi(1, int(battle.get("round", host.battle_state.get("round", 1))))
	var local_round := maxi(1, int(host.battle_state.get("round", 1)))
	var room_phase := str(battle.get("phase", "")).strip_edges()
	var local_phase := str(host.battle_state.get("phase", "")).strip_edges()
	if room_closed:
		host._apply_server_battle_room_closed(room)
	elif room_round != local_round:
		host._sync_server_battle_room_scene(false)
	elif local_phase == "server_waiting" and room_phase == "command":
		host._sync_server_battle_room_scene(false)


func request_state_restore() -> void:
	if not host._is_server_account_session():
		return
	var token: String = host._server_profile_token()
	var base_url: String = host._server_profile_base_url()
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.battle_state_request(base_url, token))
	if not host._is_server_account_session() or token != host._server_profile_token():
		return
	var parsed := ServerAuthClientModel.parse_battle_state_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if not bool(parsed.get("ok", false)):
		handle_session_invalid_response(parsed)
		return
	host.server_battle_state["incomingInvites"] = parsed.get("incomingInvites", [])
	host.server_battle_state["outgoingInvites"] = parsed.get("outgoingInvites", [])
	var room = parsed.get("room", null)
	if room is Dictionary:
		host._apply_server_battle_room_state(room as Dictionary, false)
	else:
		if host._battle_is_server_authority():
			host._clear_stale_server_battle_room(host._server_battle_stale_room_message())
		var latest_invite: Dictionary = host._latest_incoming_battle_invite()
		if not latest_invite.is_empty():
			host._open_battle_invite_panel(latest_invite)


func apply_battle_event(event: Dictionary) -> void:
	var event_type := str(event.get("type", "")).strip_edges()
	if not host.server_battle_state.has("incomingInvites"):
		host.server_battle_state["incomingInvites"] = []
	if not host.server_battle_state.has("outgoingInvites"):
		host.server_battle_state["outgoingInvites"] = []
	var room_updated := false
	if event.has("room"):
		host.server_battle_state["room"] = event.get("room", null)
		room_updated = event.get("room", null) is Dictionary
	if event.has("invite"):
		_apply_battle_invite_event(event, event_type)
	if event_type == "battle.room_closed":
		var closed_room := event.get("room", {}) as Dictionary if event.get("room", {}) is Dictionary else {}
		if closed_room.is_empty() and host.server_battle_state.get("room", {}) is Dictionary:
			closed_room = host.server_battle_state.get("room", {}) as Dictionary
		if host._server_battle_closed_room_has_unplayed_turn(closed_room):
			host._apply_polled_server_battle_room(closed_room, str(closed_room.get("roomId", "")))
		else:
			host._apply_server_battle_room_closed(closed_room)
		return
	if room_updated:
		host._close_battle_invite_panel(false)
		var updated_room := host.server_battle_state.get("room", {}) as Dictionary if host.server_battle_state.get("room", {}) is Dictionary else {}
		var turn := event.get("turn", {}) as Dictionary if event.get("turn", {}) is Dictionary else {}
		var turn_key: String = host._server_battle_turn_key(turn)
		var same_turn_playing: bool = turn_key != "" and turn_key == host.server_battle_last_playback_turn_key and host._server_battle_event_playback_active()
		if same_turn_playing:
			host._sync_server_battle_snapshot_fields_during_playback(updated_room)
		else:
			if not turn.is_empty() and host._battle_is_server_authority() and str(host.battle_state.get("serverRoomId", "")).strip_edges() == str(updated_room.get("roomId", "")).strip_edges():
				host._sync_server_battle_snapshot_fields_during_playback(updated_room)
			else:
				host._sync_server_battle_room_scene()
			if not turn.is_empty():
				var playback_started: bool = host._play_server_battle_event_list(turn)
				if not playback_started:
					if str(updated_room.get("status", "")).strip_edges() == "closed":
						host._apply_server_battle_room_closed(updated_room)
					else:
						host._sync_server_battle_room_scene(false)


func _apply_battle_invite_event(event: Dictionary, event_type: String) -> void:
	var invite := event.get("invite", {}) as Dictionary if event.get("invite", {}) is Dictionary else {}
	if invite.is_empty():
		return
	var invites: Array = host.server_battle_state.get("incomingInvites", []) if host.server_battle_state.get("incomingInvites", []) is Array else []
	var outgoing_invites: Array = host.server_battle_state.get("outgoingInvites", []) if host.server_battle_state.get("outgoingInvites", []) is Array else []
	var invite_id := str(invite.get("inviteId", ""))
	var invite_status := str(invite.get("status", ""))
	var invite_for_current: bool = host._battle_invite_is_for_current(invite)
	var invite_from_current: bool = host._battle_invite_is_from_current(invite)
	if invite_status == "pending" and invite_for_current:
		var exists := false
		for value in invites:
			if value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id:
				exists = true
				break
		if not exists:
			invites.append(invite)
			host._open_battle_invite_panel(invite)
	else:
		invites = invites.filter(func(value) -> bool:
			return not (value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id)
		)
		if host.battle_invite_panel != null and host.battle_invite_panel.visible and str(host.battle_invite_current.get("inviteId", "")) == invite_id:
			host._close_battle_invite_panel(false)
	host.server_battle_state["incomingInvites"] = invites
	if invite_status == "pending" and invite_from_current:
		var outgoing_exists := false
		for index in range(outgoing_invites.size()):
			var value = outgoing_invites[index]
			if value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id:
				outgoing_invites[index] = invite
				outgoing_exists = true
				break
		if not outgoing_exists:
			outgoing_invites.append(invite)
	else:
		outgoing_invites = outgoing_invites.filter(func(value) -> bool:
			return not (value is Dictionary and str((value as Dictionary).get("inviteId", "")) == invite_id)
		)
	host.server_battle_state["outgoingInvites"] = outgoing_invites
	if event_type == "battle.invite_declined" and invite_from_current:
		var target_player := {
			"username": str(invite.get("toUsername", "")),
			"displayName": str(invite.get("toDisplayName", "")),
		}
		var message := "%s 拒绝了你的切磋邀请。" % host._party_player_text(target_player)
		host._set_world_log_message(message)
		if host.player_action_status_label != null:
			host.player_action_status_label.text = message
		if host.player_action_panel != null and host.player_action_panel.visible:
			host._refresh_player_action_panel()


func apply_room_state(room: Dictionary, force_start: bool = false) -> bool:
	if room.is_empty():
		return false
	host.server_battle_state["room"] = room.duplicate(true)
	return host._sync_server_battle_room_scene(force_start)


func apply_room_closed(room: Dictionary) -> void:
	if room.is_empty():
		return
	host.server_battle_state["room"] = room.duplicate(true)
	var room_id := str(room.get("roomId", "")).strip_edges()
	if host._server_battle_event_playback_active() and room_id != "" and room_id == str(host.battle_state.get("serverRoomId", "")):
		host.server_battle_pending_closed_room = room.duplicate(true)
		host._sync_server_battle_snapshot_fields_during_playback(room)
		return
	host._finish_server_battle_from_closed_room(room)


func sync_room_scene(force_start: bool = false) -> bool:
	var room := host.server_battle_state.get("room", {}) as Dictionary if host.server_battle_state.get("room", {}) is Dictionary else {}
	if not ServerBattleRoomModel.is_restorable_room(room):
		return false
	var next_state := ServerBattleRoomModel.battle_state_from_room(room, host.current_account_session)
	if next_state.is_empty():
		return false
	var room_id := str(next_state.get("serverRoomId", "")).strip_edges()
	var same_room: bool = (
		host.battle_active
		and bool(host.battle_state.get("serverAuthority", false))
		and str(host.battle_state.get("serverRoomId", "")) == room_id
	)
	if same_room and not force_start:
		if host._server_battle_event_playback_active():
			host._sync_server_battle_snapshot_fields_during_playback(room)
			return true
		var previous_phase := str(host.battle_state.get("phase", ""))
		var previous_round := maxi(1, int(host.battle_state.get("round", 1)))
		host.battle_state = next_state.duplicate(true)
		host._set_battle_command_owner("player")
		host.battle_target_mode = "enemy"
		host.battle_pending_player_command.clear()
		host.battle_pending_pet_command.clear()
		host.battle_pending_spirit_id = ""
		host.battle_pending_item_id = ""
		host.battle_pending_capture_tool_id = ""
		host.battle_pending_pet_skill_id = ""
		host.battle_selected_target_id = ""
		host.battle_selected_ally_target_id = ""
		host.battle_hover_target_id = ""
		host.battle_hover_ally_target_id = ""
		var next_phase := str(host.battle_state.get("phase", ""))
		var next_round := maxi(1, int(host.battle_state.get("round", 1)))
		var same_round_self_pet_handoff: bool = (
			previous_phase == "server_waiting"
			and next_phase == "command"
			and previous_round == next_round
			and host._server_battle_needs_self_pet_command()
		)
		if previous_phase != "command" and next_phase == "command" and not same_round_self_pet_handoff:
			host._reset_battle_command_countdown()
		host._set_battle_message(str(host.battle_state.get("message", "切磋状态已同步。")))
		host._sync_battle_target_selection()
		host._sync_battle_buttons()
		host._layout_hud()
		host.queue_redraw()
		return true
	host._start_battle(next_state)
	return true


func play_event_list(event_list: Dictionary) -> bool:
	if not host._battle_is_server_authority():
		return false
	if str(event_list.get("kind", "")) != "battle_event_list":
		return false
	if host._server_battle_event_playback_active():
		return false
	var turn_key: String = host._server_battle_turn_key(event_list)
	if turn_key != "" and turn_key == host.server_battle_last_playback_turn_key:
		return false
	var local_events := ServerBattleRoomModel.battle_events_from_server_event_list(host.battle_state, event_list)
	if local_events.is_empty():
		return false
	if turn_key != "":
		host.server_battle_last_playback_turn_key = turn_key
	host.battle_state = ServerBattleRoomModel.state_at_server_event_list_start(host.battle_state, event_list)
	host.battle_event_queue = local_events
	host.battle_current_event.clear()
	host.battle_current_event_duration = 0.0
	host.battle_current_event_actor_snapshots.clear()
	host.battle_action_timer = 0.0
	host.battle_event_advance_pending = false
	host.battle_round_end_status_processed = true
	host.battle_end_pending = false
	host.battle_enemy_response_pending = false
	host.battle_pending_player_command.clear()
	host.battle_pending_pet_command.clear()
	host.battle_pending_spirit_id = ""
	host.battle_pending_item_id = ""
	host.battle_pending_capture_tool_id = ""
	host.battle_pending_pet_skill_id = ""
	host.battle_selected_target_id = ""
	host.battle_selected_ally_target_id = ""
	host.battle_hover_target_id = ""
	host.battle_hover_ally_target_id = ""
	host.battle_last_round_applied_events = 0
	host.battle_last_round_event_types.clear()
	host.battle_last_round_actor_order.clear()
	host.battle_last_round_speeds.clear()
	host.battle_last_round_enemy_target_ids.clear()
	host.battle_state["phase"] = "round_events"
	host._set_battle_command_owner("player")
	host._sync_battle_buttons()
	host._layout_hud()
	host._play_next_battle_event()
	return true


func needs_self_pet_command() -> bool:
	if not host._battle_is_server_authority():
		return false
	var room := host.server_battle_state.get("room", {}) as Dictionary if host.server_battle_state.get("room", {}) is Dictionary else {}
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var pet_actor := BattleModel.actor_by_id(host.battle_state, BattleModel.controlled_pet_id(host.battle_state))
	var pet_server_actor_id := str(pet_actor.get("serverActorId", "")).strip_edges()
	if pet_server_actor_id == "" or int(pet_actor.get("hp", 0)) <= 0:
		return false
	var required_actor_ids: Array = battle.get("requiredActorIds", []) if battle.get("requiredActorIds", []) is Array else []
	if not required_actor_ids.has(pet_server_actor_id):
		return false
	var submitted_actor_ids: Array = battle.get("submittedActorIds", []) if battle.get("submittedActorIds", []) is Array else []
	return not submitted_actor_ids.has(pet_server_actor_id)


func current_account_submitted() -> bool:
	if not host._battle_is_server_authority():
		return false
	var room := host.server_battle_state.get("room", {}) as Dictionary if host.server_battle_state.get("room", {}) is Dictionary else {}
	if room.is_empty():
		var state_room := host.battle_state.get("serverRoom", {}) as Dictionary if host.battle_state.get("serverRoom", {}) is Dictionary else {}
		room = state_room
	if room.is_empty():
		return false
	return ServerBattleRoomModel.current_account_submitted(room, host.current_account_session)


func actor_submitted(actor_id: String) -> bool:
	if actor_id.strip_edges() == "":
		return false
	var room := host.server_battle_state.get("room", {}) as Dictionary if host.server_battle_state.get("room", {}) is Dictionary else {}
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var submitted_actor_ids: Array = battle.get("submittedActorIds", []) if battle.get("submittedActorIds", []) is Array else []
	return submitted_actor_ids.has(actor_id)


func self_player_submitted() -> bool:
	var player_actor := BattleModel.actor_by_id(host.battle_state, BattleModel.PLAYER_ACTOR_ID)
	var player_server_actor_id := str(player_actor.get("serverActorId", "")).strip_edges()
	return actor_submitted(player_server_actor_id)


func sync_command_owner_from_room() -> bool:
	if not host._battle_is_server_authority():
		return false
	if current_account_submitted():
		host.battle_state["phase"] = "server_waiting"
		host._set_battle_command_owner("player")
		var room := host.server_battle_state.get("room", {}) as Dictionary if host.server_battle_state.get("room", {}) is Dictionary else {}
		var mode := str(room.get("mode", host.battle_state.get("serverRoomMode", ""))).strip_edges()
		host._set_battle_message("指令已提交，等待队友。" if mode == "party_pve" else "指令已提交，等待对方。")
		host._sync_battle_buttons()
		host._layout_hud()
		return true
	if host.battle_command_owner == "player" and self_player_submitted() and needs_self_pet_command():
		host._open_server_battle_pet_command()
		return true
	return false


func apply_command_error_room(parsed: Dictionary) -> bool:
	if not _command_error_should_sync(parsed):
		return false
	var room = parsed.get("room", null)
	if not (room is Dictionary):
		return false
	host.server_battle_state["room"] = (room as Dictionary).duplicate(true)
	if not host._sync_server_battle_room_scene(false):
		return false
	sync_command_owner_from_room()
	return true


func _command_error_should_sync(parsed: Dictionary) -> bool:
	var code := str(parsed.get("code", "")).strip_edges()
	return [
		"battle_command_actor_missing",
		"battle_command_duplicate",
		"battle_command_phase_invalid",
		"battle_command_round_mismatch",
	].has(code)


func open_pet_command() -> void:
	if not needs_self_pet_command():
		return
	host._set_battle_command_owner("pet")
	var pet_actor := BattleModel.actor_by_id(host.battle_state, BattleModel.controlled_pet_id(host.battle_state))
	host._set_battle_message("%s 要做什么？" % str(pet_actor.get("name", "宠物")))
	host._sync_battle_buttons()
	host._layout_hud()


func submit_player_command(command_id: String, target_id: String = "", pet_id: String = "", item_id: String = "") -> void:
	if not host._battle_is_server_authority():
		return
	if host.server_battle_command_request_active:
		host._set_battle_message("正在提交指令。")
		return
	if command_id == "run":
		host._leave_server_battle_room()
		return
	if sync_command_owner_from_room():
		return
	var payload := _player_command_payload(command_id, target_id, pet_id, item_id)
	if payload.is_empty():
		return
	var room_id := str(host.battle_state.get("serverRoomId", "")).strip_edges()
	if room_id == "":
		host._set_battle_message("战斗房间状态缺失，请重新同步。")
		return
	host.server_battle_command_request_active = true
	host.battle_state["phase"] = "server_waiting"
	var action_id := str(payload.get("actionId", ""))
	host._set_battle_message("换宠指令已提交，等待服务器确认。" if action_id == "switch_pet" else "物品指令已提交，等待服务器确认。" if command_id == "item" else "精灵指令已提交，等待服务器确认。" if command_id == "spirit" else "捕捉指令已提交，等待服务器确认。" if command_id == "capture" else "指令已提交，等待服务器确认。")
	host._sync_battle_buttons()
	host._layout_hud()
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.battle_command_submit_request(
		host._server_profile_base_url(),
		host._server_profile_token(),
		room_id,
		payload
	))
	host.server_battle_command_request_active = false
	if not host._battle_is_server_authority():
		return
	var parsed := ServerAuthClientModel.parse_battle_command_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		_apply_command_success(parsed, command_id, true)
		return
	if handle_session_invalid_response(parsed):
		return
	if apply_command_error_room(parsed):
		return
	host.battle_state["phase"] = "command"
	host._reset_battle_command_countdown()
	if host._server_battle_room_missing_error(parsed):
		host._clear_stale_server_battle_room(host._server_battle_stale_room_message())
		return
	host._set_battle_message(str(parsed.get("message", "指令提交失败，请重试。")))
	host._sync_battle_buttons()
	host._layout_hud()


func _player_command_payload(command_id: String, target_id: String, pet_id: String, item_id: String) -> Dictionary:
	var item_action_id := item_id.strip_edges()
	var action_id := ""
	var capture_tool_id := ""
	match command_id:
		"attack":
			action_id = "attack"
		"defend":
			action_id = "defend"
		"switch_pet":
			action_id = "switch_pet"
		"capture":
			action_id = "capture"
		"item", "spirit":
			action_id = item_action_id
	if action_id == "":
		host._set_battle_message("联网战斗暂只支持攻击、防御、物品、精灵、捕捉和换宠。")
		return {}
	var switch_pet_id := pet_id.strip_edges()
	if action_id == "switch_pet" and switch_pet_id == "":
		host._set_battle_message("没有选择待机宠物。")
		return {}
	if command_id == "item":
		if not host._battle_item_supported_in_combat(item_action_id):
			host._set_battle_message("联网战斗暂不支持这个物品。")
			return {}
		if not BattleModel.has_item(host.battle_state, item_action_id):
			host._set_battle_message("%s 不够了。" % BattleActionCatalog.label_for(item_action_id, "物品"))
			return {}
		if target_id.strip_edges() == "":
			host._set_battle_message("请选择物品目标。")
			return {}
	if command_id == "spirit":
		var player_actor_id := BattleModel.player_actor_id(host.battle_state)
		if not BattleModel.actor_has_spirit(host.battle_state, player_actor_id, action_id):
			host._set_battle_message("当前装备没有提供%s。" % BattleActionCatalog.label_for(action_id, "精灵"))
			return {}
		if not BattleActionCatalog.action_is_all(action_id) and target_id.strip_edges() == "":
			host._set_battle_message("请选择精灵目标。")
			return {}
	if command_id == "capture":
		capture_tool_id = CaptureToolCatalog.normalized_tool_id(host.battle_pending_capture_tool_id)
		if not BattleModel.has_capture_tool(host.battle_state, capture_tool_id):
			host._set_battle_message("%s 不够了。" % CaptureToolCatalog.full_name_for(capture_tool_id))
			return {}
		if target_id.strip_edges() == "":
			host._set_battle_message("请选择捕捉目标。")
			return {}
	var payload := {
		"round": maxi(1, int(host.battle_state.get("round", 1))),
		"actionId": action_id,
	}
	var player_actor := BattleModel.actor_by_id(host.battle_state, BattleModel.PLAYER_ACTOR_ID)
	var player_server_actor_id := str(player_actor.get("serverActorId", "")).strip_edges()
	if player_server_actor_id != "":
		payload["actorId"] = player_server_actor_id
	if action_id == "attack" or command_id == "item" or command_id == "spirit" or command_id == "capture":
		var resolved_target_id: String = target_id
		if (command_id == "spirit" or command_id == "item") and resolved_target_id.strip_edges() == "" and BattleActionCatalog.action_is_all(action_id):
			if BattleActionCatalog.action_can_target_side(action_id, BattleModel.SIDE_ALLY):
				resolved_target_id = BattleModel.player_actor_id(host.battle_state)
			elif BattleActionCatalog.action_can_target_side(action_id, BattleModel.SIDE_ENEMY):
				resolved_target_id = BattleModel.living_enemy_id(host.battle_state)
		var target_actor := BattleModel.actor_by_id(host.battle_state, resolved_target_id)
		if target_actor.is_empty():
			host._set_battle_message("没有可选择的目标。")
			return {}
		var target_payload: Dictionary = ServerBattleRoomModel.target_command_payload_for_actor(target_actor)
		if str(target_payload.get("targetActorId", "")).strip_edges() == "" and str(target_payload.get("targetAccountId", "")).strip_edges() == "" and str(target_payload.get("targetUsername", "")).strip_edges() == "":
			host._set_battle_message("目标状态缺失，请重新同步。")
			return {}
		for key in target_payload.keys():
			if str(target_payload[key]).strip_edges() != "":
				payload[key] = target_payload[key]
		if command_id == "item":
			payload["itemId"] = item_action_id
		elif command_id == "spirit":
			payload["spiritId"] = action_id
		elif command_id == "capture":
			payload["captureToolId"] = capture_tool_id
	elif action_id == "switch_pet":
		payload["petId"] = switch_pet_id
	return payload


func submit_pet_command(command_id: String, target_id: String = "", skill_id: String = "") -> void:
	if not host._battle_is_server_authority():
		return
	if host.server_battle_command_request_active:
		host._set_battle_message("正在提交指令。")
		return
	if sync_command_owner_from_room():
		return
	var pet_actor := BattleModel.actor_by_id(host.battle_state, BattleModel.controlled_pet_id(host.battle_state))
	var pet_server_actor_id := str(pet_actor.get("serverActorId", "")).strip_edges()
	if pet_actor.is_empty() or pet_server_actor_id == "":
		host._set_battle_message("宠物状态缺失，请重新同步。")
		return
	var action_id := skill_id.strip_edges()
	if command_id == "attack" and action_id == "":
		action_id = BattleModel.PET_SKILL_ATTACK
	elif command_id == "defend" and action_id == "":
		action_id = BattleModel.PET_SKILL_DEFEND
	if action_id == "":
		host._set_battle_message("这个宠物技能暂未开放。")
		return
	var room_id := str(host.battle_state.get("serverRoomId", "")).strip_edges()
	if room_id == "":
		host._set_battle_message("战斗房间状态缺失，请重新同步。")
		return
	var payload := {
		"round": maxi(1, int(host.battle_state.get("round", 1))),
		"actorId": pet_server_actor_id,
		"actionId": action_id,
	}
	if command_id == "attack" or command_id == "pet_skill":
		var target_actor := BattleModel.actor_by_id(host.battle_state, target_id)
		if target_actor.is_empty():
			host._set_battle_message("没有可选择的目标。")
			return
		var target_payload := ServerBattleRoomModel.target_command_payload_for_actor(target_actor)
		if str(target_payload.get("targetActorId", "")).strip_edges() == "":
			host._set_battle_message("目标状态缺失，请重新同步。")
			return
		for key in target_payload.keys():
			if str(target_payload[key]).strip_edges() != "":
				payload[key] = target_payload[key]
	host.server_battle_command_request_active = true
	host.battle_state["phase"] = "server_waiting"
	host._set_battle_message("宠物指令已提交，等待服务器确认。")
	host._sync_battle_buttons()
	host._layout_hud()
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.battle_command_submit_request(
		host._server_profile_base_url(),
		host._server_profile_token(),
		room_id,
		payload
	))
	host.server_battle_command_request_active = false
	if not host._battle_is_server_authority():
		return
	var parsed := ServerAuthClientModel.parse_battle_command_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		_apply_command_success(parsed, command_id, false)
		return
	if handle_session_invalid_response(parsed):
		return
	if apply_command_error_room(parsed):
		return
	host.battle_state["phase"] = "command"
	host._reset_battle_command_countdown()
	if host._server_battle_room_missing_error(parsed):
		host._clear_stale_server_battle_room(host._server_battle_stale_room_message())
		return
	host._open_server_battle_pet_command()
	host._set_battle_message(str(parsed.get("message", "宠物指令提交失败，请重试。")))
	host._sync_battle_buttons()
	host._layout_hud()


func _apply_command_success(parsed: Dictionary, command_id: String, can_open_pet_command: bool) -> void:
	var room = parsed.get("room", null)
	var turn := parsed.get("turn", {}) as Dictionary if parsed.get("turn", {}) is Dictionary else {}
	if room is Dictionary:
		var room_dict := room as Dictionary
		var turn_key: String = host._server_battle_turn_key(turn)
		var same_turn_playing: bool = turn_key != "" and turn_key == host.server_battle_last_playback_turn_key and host._server_battle_event_playback_active()
		var room_closed := str(room_dict.get("status", "")).strip_edges() == "closed"
		host.server_battle_state["room"] = room_dict.duplicate(true)
		if same_turn_playing:
			host._sync_server_battle_snapshot_fields_during_playback(room_dict)
		else:
			if not turn.is_empty() and host._battle_is_server_authority() and str(host.battle_state.get("serverRoomId", "")).strip_edges() == str(room_dict.get("roomId", "")).strip_edges():
				host._sync_server_battle_snapshot_fields_during_playback(room_dict)
			else:
				host._sync_server_battle_room_scene(false)
		if not turn.is_empty():
			var playback_started: bool = host._play_server_battle_event_list(turn)
			if room_closed and not playback_started:
				host._apply_server_battle_room_closed(room_dict)
			elif not playback_started:
				host._sync_server_battle_room_scene(false)
		elif room_closed:
			host._apply_server_battle_room_closed(room_dict)
		elif can_open_pet_command and needs_self_pet_command():
			host._open_server_battle_pet_command()
	else:
		host._set_battle_message("指令已提交。" if can_open_pet_command else "宠物指令已提交。")


func leave_room() -> void:
	if not host._battle_is_server_authority():
		return
	var leave_label: String = host._battle_player_run_label()
	var leave_action := "逃离" if leave_label == "逃跑" else "离开"
	if host.server_battle_command_request_active:
		host._set_battle_message("正在处理战斗请求。")
		return
	var room_id := str(host.battle_state.get("serverRoomId", "")).strip_edges()
	if room_id == "":
		host._set_battle_message("战斗房间状态缺失，请重新同步。")
		return
	host.server_battle_command_request_active = true
	host.battle_state["phase"] = "server_waiting"
	host._set_battle_message("正在%s战斗。" % leave_action)
	host._sync_battle_buttons()
	host._layout_hud()
	var response: Dictionary = await host._auto_http_request_spec(ServerAuthClientModel.battle_room_leave_request(
		host._server_profile_base_url(),
		host._server_profile_token(),
		room_id
	))
	host.server_battle_command_request_active = false
	if not host._battle_is_server_authority():
		return
	var parsed := ServerAuthClientModel.parse_battle_action_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()) as PackedByteArray)
	if bool(parsed.get("ok", false)):
		var room = parsed.get("room", null)
		if room is Dictionary:
			host._apply_server_battle_room_closed(room as Dictionary)
		else:
			host._set_battle_message("已%s战斗。" % leave_action)
		return
	if handle_session_invalid_response(parsed):
		return
	host.battle_state["phase"] = "command"
	host._reset_battle_command_countdown()
	if host._server_battle_room_missing_error(parsed):
		host._clear_stale_server_battle_room(host._server_battle_stale_room_message())
		return
	host._set_battle_message(str(parsed.get("message", "%s战斗失败，请重试。" % leave_action)))
	host._sync_battle_buttons()
	host._layout_hud()
