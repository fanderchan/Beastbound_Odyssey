extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")


static func is_restorable_room(room: Dictionary) -> bool:
	if room.is_empty():
		return false
	if str(room.get("status", "")).strip_edges() != "ready":
		return false
	if str(room.get("roomId", "")).strip_edges() == "":
		return false
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	if battle.is_empty():
		return false
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	return actors.size() > 0


static func battle_id_for_room(room: Dictionary) -> String:
	var room_id := str(room.get("roomId", "")).strip_edges()
	return "server_battle_%s" % room_id if room_id != "" else "server_battle_room"


static func battle_state_from_room(room: Dictionary, session: Dictionary) -> Dictionary:
	if not is_restorable_room(room):
		return {}
	var battle := room.get("battle", {}) as Dictionary
	var server_actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	var actors: Array[Dictionary] = []
	var self_found := false
	for value in server_actors:
		if not (value is Dictionary):
			continue
		var server_actor := value as Dictionary
		var is_self := _actor_matches_session(server_actor, session)
		self_found = self_found or is_self
		actors.append(_battle_actor_from_server(server_actor, is_self))
	if not self_found and not actors.is_empty():
		var fallback_self := actors[0].duplicate(true)
		fallback_self["id"] = BattleModel.PLAYER_ACTOR_ID
		fallback_self["side"] = BattleModel.SIDE_ALLY
		fallback_self["slotId"] = BattleModel.slot_id(BattleModel.SIDE_ALLY, BattleModel.ROW_BACK, 3)
		actors[0] = fallback_self
		for index in range(1, actors.size()):
			var fallback_enemy := actors[index].duplicate(true)
			fallback_enemy["side"] = BattleModel.SIDE_ENEMY
			fallback_enemy["slotId"] = BattleModel.slot_id(BattleModel.SIDE_ENEMY, BattleModel.ROW_BACK, clampi(index + 2, 1, BattleModel.SLOTS_PER_ROW))
			actors[index] = fallback_enemy
	var state := {
		"id": battle_id_for_room(room),
		"formationTemplate": BattleModel.FORMATION_TEMPLATE_10V10,
		"round": maxi(1, int(battle.get("round", 1))),
		"phase": _local_phase_for_room(battle, session),
		"source": "server",
		"serverAuthority": true,
		"serverRoomId": str(room.get("roomId", "")),
		"serverRoomSeed": str(room.get("seed", "")),
		"targetSeed": str(room.get("seed", battle_id_for_room(room))),
		"message": _message_for_room(battle, session),
		"itemBag": {},
		"captureToolBag": {},
		"fieldEffects": [],
		"guardingActorIds": _guarding_actor_ids(actors),
		"actors": actors,
		"serverBattle": battle.duplicate(true),
		"serverRoom": room.duplicate(true),
	}
	var last_event_list = battle.get("lastEventList", null)
	if last_event_list is Dictionary:
		state["lastServerEventList"] = (last_event_list as Dictionary).duplicate(true)
	return state


static func current_account_submitted(room: Dictionary, session: Dictionary) -> bool:
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id == "":
		return false
	var submitted: Array = battle.get("submittedAccountIds", []) if battle.get("submittedAccountIds", []) is Array else []
	return submitted.has(account_id)


static func target_command_payload_for_actor(actor: Dictionary) -> Dictionary:
	return {
		"targetAccountId": str(actor.get("serverAccountId", "")).strip_edges(),
		"targetUsername": str(actor.get("serverUsername", "")).strip_edges(),
	}


static func _battle_actor_from_server(server_actor: Dictionary, is_self: bool) -> Dictionary:
	var side := BattleModel.SIDE_ALLY if is_self else BattleModel.SIDE_ENEMY
	var actor_id := BattleModel.PLAYER_ACTOR_ID if is_self else "enemy_player"
	var slot_id := BattleModel.slot_id(side, BattleModel.ROW_BACK, 3)
	var max_hp := maxi(1, int(server_actor.get("maxHp", server_actor.get("hp", 120))))
	var hp := clampi(int(server_actor.get("hp", max_hp)), 0, max_hp)
	return {
		"id": actor_id,
		"name": str(server_actor.get("displayName", server_actor.get("username", "猎人"))),
		"side": side,
		"kind": "player",
		"slotId": slot_id,
		"hp": hp,
		"maxHp": max_hp,
		"quick": maxi(1, int(server_actor.get("speed", server_actor.get("quick", 60)))),
		"attack": maxi(1, int(server_actor.get("attack", 18))),
		"defense": maxi(1, int(server_actor.get("defense", 8))),
		"catchable": false,
		"captureDifficulty": 0,
		"actionState": "down" if hp <= 0 else "idle",
		"petBattleState": "",
		"statuses": {},
		"statusResist": {},
		"statusImmune": {},
		"passiveSkillIds": [],
		"serverActorId": str(server_actor.get("actorId", "")),
		"serverAccountId": str(server_actor.get("accountId", "")),
		"serverUsername": str(server_actor.get("username", "")),
		"serverSide": str(server_actor.get("side", "")),
		"serverGuarding": bool(server_actor.get("guarding", false)),
		"serverDefeated": bool(server_actor.get("defeated", false)),
	}


static func _local_phase_for_room(battle: Dictionary, session: Dictionary) -> String:
	var server_phase := str(battle.get("phase", "command")).strip_edges()
	if server_phase != "command":
		return server_phase
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id == "":
		return "command"
	var submitted: Array = battle.get("submittedAccountIds", []) if battle.get("submittedAccountIds", []) is Array else []
	return "server_waiting" if submitted.has(account_id) else "command"


static func _message_for_room(battle: Dictionary, session: Dictionary) -> String:
	var phase := _local_phase_for_room(battle, session)
	if phase == "server_waiting":
		return "指令已提交，等待对方。"
	if phase == "command":
		return "切磋已恢复，请选择指令。"
	return "切磋状态已同步。"


static func _actor_matches_session(server_actor: Dictionary, session: Dictionary) -> bool:
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id != "" and str(server_actor.get("accountId", "")).strip_edges() == account_id:
		return true
	var username := str(session.get("username", "")).strip_edges()
	return username != "" and str(server_actor.get("username", "")).strip_edges() == username


static func _guarding_actor_ids(actors: Array[Dictionary]) -> Array[String]:
	var ids: Array[String] = []
	for actor in actors:
		if bool(actor.get("serverGuarding", false)) and int(actor.get("hp", 0)) > 0:
			ids.append(str(actor.get("id", "")))
	return ids
