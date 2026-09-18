extends RefCounted

const RoomModel := preload("res://scripts/battle/server_battle_room_model.gd")


static func run(host, room: Dictionary, session: Dictionary) -> bool:
	var saved_state: Dictionary = host.battle_state.duplicate(true)
	var saved_room: Dictionary = host.server_battle_state.duplicate(true)
	var saved_owner: String = host.battle_command_owner
	var checks := {}
	var account_id := str(session.get("accountId", ""))
	var player_id := ""
	var pet_id := ""
	for actor in room.battle.actors:
		if str(actor.get("accountId", "")) == account_id:
			if actor.kind == "player":
				player_id = actor.actorId
			elif actor.kind == "pet":
				pet_id = actor.actorId
	checks["fixture_has_both_actors"] = player_id != "" and pet_id != ""
	checks["living_player_first"] = RoomModel.current_account_command_owner(room, session) == "player"
	var next := room.duplicate(true)
	next.battle.submittedActorIds = [player_id]
	checks["submitted_player_hands_off"] = RoomModel.current_account_command_owner(next, session) == "pet"
	next.battle.submittedActorIds = []
	next.battle.requiredActorIds.erase(player_id)
	for actor in next.battle.actors:
		if actor.actorId == player_id:
			actor.hp = 0
	var pet_only_state := RoomModel.battle_state_from_room(next, session)
	var launched_state := pet_only_state.duplicate(true)
	for actor in launched_state.get("actors", []):
		if str(actor.get("serverActorId", "")) == player_id:
			actor["launched"] = true
			actor["revivable"] = false
			actor["actionState"] = "launched"
	checks["server_player_launch_keeps_authoritative_battle_open"] = not host._battle_state_should_end(launched_state)
	var local_launch := launched_state.duplicate(true)
	local_launch["serverAuthority"] = false
	checks["local_player_launch_still_ends_local_battle"] = host._battle_state_should_end(local_launch)
	var empty_playback := launched_state.duplicate(true)
	empty_playback["actors"] = []
	checks["empty_visual_snapshot_cannot_settle_server_battle"] = not host._battle_state_should_end(empty_playback)
	checks["downed_player_pet_still_pending"] = (
		RoomModel.current_account_command_owner(next, session) == "pet"
		and not RoomModel.current_account_submitted(next, session)
		and pet_only_state.phase == "command"
	)
	host.server_battle_state["room"] = next.duplicate(true)
	host.battle_state = pet_only_state.duplicate(true)
	var state_before_finish: Dictionary = host.battle_state.duplicate(true)
	var room_before_finish: Dictionary = host.server_battle_state.duplicate(true)
	var was_active: bool = host.battle_active
	checks["unclosed_room_cannot_display_result_or_leave_battle"] = (
		host._finish_server_battle_from_closed_room(next).is_empty()
		and host._finish_server_battle_from_closed_room().is_empty()
		and host.battle_state == state_before_finish
		and host.server_battle_state == room_before_finish
		and host.battle_active == was_active
	)
	host._set_battle_command_owner("player")
	checks["automatic_command_handoff"] = (
		host._sync_server_battle_command_owner_from_room()
		and host.battle_command_owner == "pet"
		and not host._battle_commands_locked()
	)
	host._set_battle_command_owner("player")
	next.battle.round = int(next.battle.round) + 1
	host.server_battle_state["room"] = next.duplicate(true)
	checks["new_round_opens_pet_menu_without_extra_click"] = (
		host._sync_server_battle_room_scene(false)
		and host.battle_command_owner == "pet"
		and not host._battle_commands_locked()
	)
	next.battle.submittedActorIds = [pet_id]
	checks["pet_submitted_waits"] = (
		RoomModel.current_account_command_owner(next, session) == ""
		and RoomModel.current_account_submitted(next, session)
		and RoomModel.battle_state_from_room(next, session).phase == "server_waiting"
	)
	next.battle.submittedActorIds = []
	for actor in next.battle.actors:
		if actor.actorId == pet_id:
			actor.hp = 0
	checks["both_downed_wait"] = (
		RoomModel.current_account_command_owner(next, session) == ""
		and RoomModel.current_account_submitted(next, session)
	)
	next.battle.phase = "resolving"
	checks["no_command_during_resolution"] = RoomModel.current_account_command_owner(next, session) == ""
	host.battle_state = saved_state
	host.server_battle_state = saved_room
	host._set_battle_command_owner(saved_owner)
	host._sync_battle_buttons()
	print("server battle command owner check: " + JSON.stringify(checks))
	return not checks.values().has(false)
