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
	var session_server_side := _session_server_side(server_actors, session)
	var side_counts := {
		BattleModel.SIDE_ALLY: 0,
		BattleModel.SIDE_ENEMY: 0,
	}
	var kind_counts := {
		BattleModel.SIDE_ALLY: {},
		BattleModel.SIDE_ENEMY: {},
	}
	for value in server_actors:
		if not (value is Dictionary):
			continue
		var server_actor := value as Dictionary
		var is_self_account := _actor_matches_session(server_actor, session)
		self_found = self_found or is_self_account
		var local_side := _local_side_for_server_actor(server_actor, session_server_side, is_self_account)
		side_counts[local_side] = int(side_counts.get(local_side, 0)) + 1
		var kind := _server_actor_kind(server_actor)
		var local_kind_counts := kind_counts.get(local_side, {}) as Dictionary
		local_kind_counts[kind] = int(local_kind_counts.get(kind, 0)) + 1
		kind_counts[local_side] = local_kind_counts
		actors.append(_battle_actor_from_server(
			server_actor,
			is_self_account,
			local_side,
			int(side_counts.get(local_side, 1)),
			int(local_kind_counts.get(kind, 1))
		))
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


static func battle_events_from_server_event_list(state: Dictionary, event_list: Dictionary) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if str(event_list.get("kind", "")) != "battle_event_list":
		return events
	var raw_events: Array = event_list.get("events", []) if event_list.get("events", []) is Array else []
	for value in raw_events:
		if not (value is Dictionary):
			continue
		var local_event := _local_event_from_server_event(state, value as Dictionary)
		if not local_event.is_empty():
			events.append(local_event)
	return events


static func state_at_server_event_list_start(state: Dictionary, event_list: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	if str(event_list.get("kind", "")) != "battle_event_list":
		return next_state
	next_state["round"] = maxi(1, int(event_list.get("round", next_state.get("round", 1))))
	next_state["phase"] = "round_events"
	next_state["lastServerEventList"] = event_list.duplicate(true)
	var started_actor_ids := {}
	var raw_events: Array = event_list.get("events", []) if event_list.get("events", []) is Array else []
	for value in raw_events:
		if not (value is Dictionary):
			continue
		var server_event := value as Dictionary
		if str(server_event.get("eventType", "")) != "basic_attack":
			continue
		var target_id := _local_actor_id_for_server_actor(
			next_state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", ""))
		)
		if target_id == "" or started_actor_ids.has(target_id):
			continue
		started_actor_ids[target_id] = true
		next_state = BattleModel.set_actor_hp(next_state, target_id, int(server_event.get("hpBefore", 0)))
	return next_state


static func state_with_server_event_actor_snapshot(state: Dictionary, event_list: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	if str(event_list.get("kind", "")) != "battle_event_list":
		return next_state
	var server_actors: Array = event_list.get("actors", []) if event_list.get("actors", []) is Array else []
	var guarding_ids: Array[String] = []
	for value in server_actors:
		if not (value is Dictionary):
			continue
		var server_actor := value as Dictionary
		var actor_id := _local_actor_id_for_server_actor(
			next_state,
			str(server_actor.get("actorId", "")),
			str(server_actor.get("accountId", "")),
			str(server_actor.get("username", ""))
		)
		if actor_id == "":
			continue
		next_state = BattleModel.set_actor_hp(next_state, actor_id, int(server_actor.get("hp", 0)))
		if bool(server_actor.get("guarding", false)) and int(server_actor.get("hp", 0)) > 0:
			guarding_ids.append(actor_id)
	next_state["guardingActorIds"] = guarding_ids
	return next_state


static func current_account_submitted(room: Dictionary, session: Dictionary) -> bool:
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id == "":
		return false
	var submitted: Array = battle.get("submittedAccountIds", []) if battle.get("submittedAccountIds", []) is Array else []
	return submitted.has(account_id)


static func target_command_payload_for_actor(actor: Dictionary) -> Dictionary:
	return {
		"targetActorId": str(actor.get("serverActorId", "")).strip_edges(),
		"targetAccountId": str(actor.get("serverAccountId", "")).strip_edges(),
		"targetUsername": str(actor.get("serverUsername", "")).strip_edges(),
	}


static func _battle_actor_from_server(server_actor: Dictionary, is_self_account: bool, side: String, side_index: int, kind_index: int) -> Dictionary:
	var kind := _server_actor_kind(server_actor)
	var actor_id := _local_actor_id_for_server_kind(side, kind, is_self_account, kind_index)
	var slot_id := _slot_id_for_server_actor(side, server_actor, side_index, kind_index)
	var max_hp := maxi(1, int(server_actor.get("maxHp", server_actor.get("hp", 120))))
	var hp := clampi(int(server_actor.get("hp", max_hp)), 0, max_hp)
	return {
		"id": actor_id,
		"name": str(server_actor.get("displayName", server_actor.get("username", "猎人"))),
		"side": side,
		"kind": kind,
		"slotId": slot_id,
		"level": maxi(1, int(server_actor.get("level", 1))),
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
		"passiveSkillIds": _string_array(server_actor.get("passiveSkillIds", [])),
		"activeSkillIds": _string_array(server_actor.get("activeSkillIds", [])),
		"serverActorId": str(server_actor.get("actorId", "")),
		"serverAccountId": str(server_actor.get("accountId", "")),
		"serverUsername": str(server_actor.get("username", "")),
		"serverSide": str(server_actor.get("side", "")),
		"serverKind": kind,
		"serverPetId": str(server_actor.get("petId", "")),
		"formId": str(server_actor.get("formId", "")),
		"petId": str(server_actor.get("petId", "")),
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


static func _session_server_side(server_actors: Array, session: Dictionary) -> String:
	for value in server_actors:
		if value is Dictionary and _actor_matches_session(value as Dictionary, session):
			return str((value as Dictionary).get("side", "")).strip_edges()
	return ""


static func _local_side_for_server_actor(server_actor: Dictionary, session_server_side: String, is_self: bool) -> String:
	if is_self:
		return BattleModel.SIDE_ALLY
	if session_server_side != "" and str(server_actor.get("side", "")).strip_edges() == session_server_side:
		return BattleModel.SIDE_ALLY
	return BattleModel.SIDE_ENEMY


static func _server_actor_kind(server_actor: Dictionary) -> String:
	var kind := str(server_actor.get("kind", "player")).strip_edges()
	return "pet" if kind == "pet" else "player"


static func _local_actor_id_for_server_kind(side: String, kind: String, is_self_account: bool, kind_index: int) -> String:
	var index := maxi(1, kind_index)
	if is_self_account:
		return BattleModel.PLAYER_ACTOR_ID if kind != "pet" else "ally_pet"
	if side == BattleModel.SIDE_ENEMY:
		if kind == "pet":
			return "enemy_pet" if index == 1 else "enemy_pet_%d" % index
		return "enemy_player" if index == 1 else "enemy_player_%d" % index
	if kind == "pet":
		return "ally_partner_pet_%d" % index
	return "ally_partner_%d" % index


static func _slot_id_for_server_actor(side: String, server_actor: Dictionary, side_index: int, kind_index: int) -> String:
	var kind := _server_actor_kind(server_actor)
	var slot_number := int(server_actor.get("slotNumber", 0))
	if slot_number <= 0:
		slot_number = 3 if kind == "pet" or kind_index <= 1 else clampi(kind_index + 2, 1, BattleModel.SLOTS_PER_ROW)
	slot_number = clampi(slot_number, 1, BattleModel.SLOTS_PER_ROW)
	var row := BattleModel.ROW_FRONT if kind == "pet" else BattleModel.ROW_BACK
	return BattleModel.slot_id(side, row, slot_number)


static func _slot_id_for_local_index(side: String, side_index: int) -> String:
	var order: Array[int] = [8, 7, 9, 6, 10, 3, 2, 4, 1, 5]
	var index := clampi(side_index, 1, order.size()) - 1
	return BattleModel.slot_id_for_number(side, order[index])


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result


static func _local_event_from_server_event(state: Dictionary, server_event: Dictionary) -> Dictionary:
	var event_type := str(server_event.get("eventType", ""))
	var actor_id := _local_actor_id_for_server_actor(
		state,
		str(server_event.get("actorId", "")),
		str(server_event.get("actorAccountId", "")),
		str(server_event.get("actorUsername", ""))
	)
	if actor_id == "":
		return {}
	var actor := BattleModel.actor_by_id(state, actor_id)
	var sequence := maxi(1, int(server_event.get("sequence", 0)))
	if event_type == "defend":
		return {
			"type": "defend",
			"attackerId": actor_id,
			"targetId": actor_id,
			"targetSide": str(actor.get("side", "")),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"actionId": str(server_event.get("actionId", "defend")),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
		}
	if event_type == "target_missing":
		return {
			"type": "target_missing",
			"attackerId": actor_id,
			"targetId": "",
			"targetSide": "",
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"actionId": str(server_event.get("actionId", "attack")),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
		}
	if event_type != "basic_attack":
		return {}
	var target_id := _local_actor_id_for_server_actor(
		state,
		str(server_event.get("targetActorId", "")),
		str(server_event.get("targetAccountId", "")),
		str(server_event.get("targetUsername", ""))
	)
	if target_id == "":
		return {}
	var target := BattleModel.actor_by_id(state, target_id)
	return {
		"type": "attack",
		"attackerId": actor_id,
		"targetId": target_id,
		"targetSide": str(target.get("side", BattleModel.SIDE_ENEMY)),
		"damage": maxi(1, int(server_event.get("damage", 1))),
		"speed": int(actor.get("quick", actor.get("speed", 0))),
		"sequence": sequence,
		"movementStyle": "melee",
		"canDodge": false,
		"canCritical": false,
		"canCounter": false,
		"canLaunch": false,
		"actionId": str(server_event.get("actionId", "attack")),
		"serverEventId": str(server_event.get("eventId", "")),
		"serverEventType": event_type,
		"serverMessage": str(server_event.get("message", "")),
		"serverHpBefore": int(server_event.get("hpBefore", 0)),
		"serverHpAfter": int(server_event.get("hpAfter", 0)),
		"serverBlocked": bool(server_event.get("blocked", false)),
		"serverDefeated": bool(server_event.get("defeated", false)),
	}


static func _local_actor_id_for_server_actor(state: Dictionary, server_actor_id: String, account_id: String, username: String) -> String:
	var actor_id := server_actor_id.strip_edges()
	var account := account_id.strip_edges()
	var name := username.strip_edges()
	var actors: Array = state.get("actors", []) if state.get("actors", []) is Array else []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if actor_id != "" and str(actor.get("serverActorId", "")).strip_edges() == actor_id:
			return str(actor.get("id", ""))
		if account != "" and str(actor.get("serverAccountId", "")).strip_edges() == account:
			return str(actor.get("id", ""))
		if name != "" and str(actor.get("serverUsername", "")).strip_edges() == name:
			return str(actor.get("id", ""))
	return ""


static func _guarding_actor_ids(actors: Array[Dictionary]) -> Array[String]:
	var ids: Array[String] = []
	for actor in actors:
		if bool(actor.get("serverGuarding", false)) and int(actor.get("hp", 0)) > 0:
			ids.append(str(actor.get("id", "")))
	return ids
