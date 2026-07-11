extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")


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
			"serverRoomMode": str(room.get("mode", "")),
			"targetSeed": str(room.get("seed", battle_id_for_room(room))),
			"message": _message_for_room(room, battle, session),
			"itemBag": _item_bag_for_session(room, session),
			"captureToolBag": _capture_tool_bag_for_session(room, session),
			"petParty": _pet_party_for_session(room, session),
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
		var event_type := str(server_event.get("eventType", ""))
		if not [
				"basic_attack",
				"pet_skill",
				"combo_attack",
				"item_heal",
				"item_heal_all",
				"item_poison",
				"item_poison_all",
				"item_cleanse",
				"capture",
				"spirit_heal",
				"spirit_heal_all",
				"spirit_poison",
				"spirit_poison_all",
				"skill_status",
				"status_skip",
		].has(event_type):
			continue
		var target_id := _local_actor_id_for_server_actor(
			next_state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if target_id == "" or started_actor_ids.has(target_id):
			continue
		if not server_event.has("hpBefore"):
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
			str(server_actor.get("username", "")),
			_server_actor_kind(server_actor),
			str(server_actor.get("petId", ""))
		)
		if actor_id == "":
			continue
		next_state = _apply_server_actor_snapshot(next_state, actor_id, server_actor)
		if bool(server_actor.get("guarding", false)) and int(server_actor.get("hp", 0)) > 0:
			guarding_ids.append(actor_id)
	next_state["guardingActorIds"] = guarding_ids
	return next_state


static func current_account_submitted(room: Dictionary, session: Dictionary) -> bool:
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id == "":
		return false
	var required_actor_ids := _account_required_actor_ids(battle, account_id)
	if required_actor_ids.is_empty():
		return _account_has_any_actor(battle, account_id)
	var submitted_actor_ids: Array = battle.get("submittedActorIds", []) if battle.get("submittedActorIds", []) is Array else []
	for actor_id in required_actor_ids:
		if not submitted_actor_ids.has(actor_id):
			return false
	return true


static func captured_wild_pet_count_for_account(room: Dictionary, session: Dictionary) -> int:
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id == "":
		return 0
	var battle := room.get("battle", {}) as Dictionary if room.get("battle", {}) is Dictionary else {}
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	var count := 0
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if (
			bool(actor.get("captured", false))
			and str(actor.get("kind", "")).strip_edges() == "wild_pet"
			and str(actor.get("capturedByAccountId", "")).strip_edges() == account_id
		):
			count += 1
	return count


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
	var launched := bool(server_actor.get("launched", false)) or str(server_actor.get("actionState", "")).strip_edges() == "launched" or (server_actor.has("revivable") and not bool(server_actor.get("revivable", true)))
	var action_state := "launched" if launched else ("captured" if bool(server_actor.get("captured", false)) else ("down" if hp <= 0 else "idle"))
	var actor := {
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
		"catchable": bool(server_actor.get("catchable", kind == "wild_pet")),
		"captureDifficulty": maxi(0, int(server_actor.get("captureDifficulty", 0))),
		"captured": bool(server_actor.get("captured", false)),
		"actionState": action_state,
		"launched": launched,
		"revivable": bool(server_actor.get("revivable", true)) and not launched,
		"petBattleState": BattleModel.PET_STATE_BATTLE if kind == "pet" or kind == "wild_pet" else "",
		"statuses": _dictionary_value(server_actor.get("statuses", {})),
		"statusResist": _dictionary_value(server_actor.get("statusResist", {})),
		"statusImmune": _dictionary_value(server_actor.get("statusImmune", {})),
		"passiveSkillIds": _string_array(server_actor.get("passiveSkillIds", [])),
		"activeSkillIds": _string_array(server_actor.get("activeSkillIds", [])),
		"petSkillSlots": _string_array(server_actor.get("petSkillSlots", [])),
		"spiritIds": _string_array(server_actor.get("spiritIds", [])),
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
		"serverCaptured": bool(server_actor.get("captured", false)),
		"serverLaunched": launched,
	}
	if launched and (kind == "pet" or kind == "wild_pet"):
		actor["petBattleState"] = BattleModel.PET_STATE_REST
	_apply_server_ride_fields(actor, server_actor)
	return actor


static func _apply_server_ride_fields(actor: Dictionary, server_actor: Dictionary) -> void:
	var ride_pet_id := str(server_actor.get("ridePetInstanceId", "")).strip_edges()
	if ride_pet_id == "":
		for key in ["ridePetInstanceId", "ridePetName", "ridePetFormId", "ridePetLevel", "ridePetHp", "ridePetMaxHp", "ridePetBattleState"]:
			actor.erase(key)
		return
	var ride_max_hp := maxi(1, int(server_actor.get("ridePetMaxHp", 1)))
	var ride_hp := clampi(int(server_actor.get("ridePetHp", ride_max_hp)), 0, ride_max_hp)
	if ride_hp <= 0:
		actor.erase("ridePetInstanceId")
		return
	actor["ridePetInstanceId"] = ride_pet_id
	actor["ridePetName"] = str(server_actor.get("ridePetName", "骑宠"))
	actor["ridePetFormId"] = str(server_actor.get("ridePetFormId", ""))
	actor["ridePetLevel"] = maxi(1, int(server_actor.get("ridePetLevel", 1)))
	actor["ridePetHp"] = ride_hp
	actor["ridePetMaxHp"] = ride_max_hp
	actor["ridePetBattleState"] = str(server_actor.get("ridePetBattleState", "riding"))


static func _pet_party_for_session(room: Dictionary, session: Dictionary) -> Array[Dictionary]:
	var account_id := str(session.get("accountId", "")).strip_edges()
	var username := str(session.get("username", "")).strip_edges()
	var participants: Array = room.get("participants", []) if room.get("participants", []) is Array else []
	for value in participants:
		if not (value is Dictionary):
			continue
		var participant := value as Dictionary
		if (
			(account_id != "" and str(participant.get("accountId", "")).strip_edges() == account_id)
			or (username != "" and str(participant.get("username", "")).strip_edges() == username)
		):
			var snapshot := participant.get("teamSnapshot", {}) as Dictionary if participant.get("teamSnapshot", {}) is Dictionary else {}
			var pets: Array = snapshot.get("battlePets", []) if snapshot.get("battlePets", []) is Array else []
			var result: Array[Dictionary] = []
			for pet_value in pets:
				if pet_value is Dictionary:
					result.append(_pet_party_entry_from_server_pet(pet_value as Dictionary))
			return result
	return []


static func _pet_party_entry_from_server_pet(server_pet: Dictionary) -> Dictionary:
	var pet_id := str(server_pet.get("petId", server_pet.get("instanceId", ""))).strip_edges()
	var active := bool(server_pet.get("activeInBattle", false)) or str(server_pet.get("state", "")) == BattleModel.PET_STATE_BATTLE
	return {
		"petId": pet_id,
		"instanceId": pet_id,
		"name": str(server_pet.get("name", "宠物")),
		"state": BattleModel.PET_STATE_BATTLE if active else BattleModel.PET_STATE_STANDBY,
		"actorId": BattleModel.PLAYER_PET_ID if active else "",
		"hp": maxi(0, int(server_pet.get("hp", 0))),
		"maxHp": maxi(1, int(server_pet.get("maxHp", 1))),
		"quick": maxi(1, int(server_pet.get("quick", server_pet.get("speed", 50)))),
		"attack": maxi(1, int(server_pet.get("attack", 12))),
		"defense": maxi(1, int(server_pet.get("defense", 6))),
		"formId": str(server_pet.get("formId", "")),
		"activeSkillIds": _string_array(server_pet.get("activeSkillIds", [])),
		"petSkillSlots": _string_array(server_pet.get("petSkillSlots", [])),
		"passiveSkillIds": _string_array(server_pet.get("passiveSkillIds", [])),
	}


static func _item_bag_for_session(room: Dictionary, session: Dictionary) -> Dictionary:
	var account_id := str(session.get("accountId", "")).strip_edges()
	var username := str(session.get("username", "")).strip_edges()
	var participants: Array = room.get("participants", []) if room.get("participants", []) is Array else []
	for value in participants:
		if not (value is Dictionary):
			continue
		var participant := value as Dictionary
		if (
			(account_id != "" and str(participant.get("accountId", "")).strip_edges() == account_id)
			or (username != "" and str(participant.get("username", "")).strip_edges() == username)
		):
			var snapshot := participant.get("teamSnapshot", {}) as Dictionary if participant.get("teamSnapshot", {}) is Dictionary else {}
			var bag := snapshot.get("battleItemBag", {}) as Dictionary if snapshot.get("battleItemBag", {}) is Dictionary else {}
			return bag.duplicate(true)
	return {}


static func _capture_tool_bag_for_session(room: Dictionary, session: Dictionary) -> Dictionary:
	var account_id := str(session.get("accountId", "")).strip_edges()
	var username := str(session.get("username", "")).strip_edges()
	var participants: Array = room.get("participants", []) if room.get("participants", []) is Array else []
	for value in participants:
		if not (value is Dictionary):
			continue
		var participant := value as Dictionary
		if (
			(account_id != "" and str(participant.get("accountId", "")).strip_edges() == account_id)
			or (username != "" and str(participant.get("username", "")).strip_edges() == username)
		):
			var snapshot := participant.get("teamSnapshot", {}) as Dictionary if participant.get("teamSnapshot", {}) is Dictionary else {}
			var bag := snapshot.get("captureToolBag", {}) as Dictionary if snapshot.get("captureToolBag", {}) is Dictionary else {}
			return CaptureToolCatalog.normalize_inventory(bag)
	return CaptureToolCatalog.starting_inventory()


static func _apply_server_actor_snapshot(state: Dictionary, actor_id: String, server_actor: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var actors: Array = next_state.get("actors", []) if next_state.get("actors", []) is Array else []
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := (actors[index] as Dictionary).duplicate(true)
		if str(actor.get("id", "")) != actor_id:
			continue
		var max_hp := maxi(1, int(server_actor.get("maxHp", actor.get("maxHp", 1))))
		actor["name"] = str(server_actor.get("displayName", actor.get("name", "")))
		actor["hp"] = clampi(int(server_actor.get("hp", actor.get("hp", max_hp))), 0, max_hp)
		actor["maxHp"] = max_hp
		actor["quick"] = maxi(1, int(server_actor.get("speed", actor.get("quick", 60))))
		actor["attack"] = maxi(1, int(server_actor.get("attack", actor.get("attack", 18))))
		actor["defense"] = maxi(1, int(server_actor.get("defense", actor.get("defense", 8))))
		actor["serverActorId"] = str(server_actor.get("actorId", actor.get("serverActorId", "")))
		actor["serverAccountId"] = str(server_actor.get("accountId", actor.get("serverAccountId", "")))
		actor["serverUsername"] = str(server_actor.get("username", actor.get("serverUsername", "")))
		actor["serverSide"] = str(server_actor.get("side", actor.get("serverSide", "")))
		actor["serverKind"] = _server_actor_kind(server_actor)
		actor["serverPetId"] = str(server_actor.get("petId", actor.get("serverPetId", "")))
		actor["petId"] = str(server_actor.get("petId", actor.get("petId", "")))
		actor["formId"] = str(server_actor.get("formId", actor.get("formId", "")))
		actor["catchable"] = bool(server_actor.get("catchable", actor.get("catchable", false)))
		actor["captureDifficulty"] = maxi(0, int(server_actor.get("captureDifficulty", actor.get("captureDifficulty", 0))))
		actor["captured"] = bool(server_actor.get("captured", actor.get("captured", false)))
		var launched := bool(server_actor.get("launched", actor.get("launched", false))) or str(server_actor.get("actionState", "")).strip_edges() == "launched" or (server_actor.has("revivable") and not bool(server_actor.get("revivable", true)))
		actor["launched"] = launched
		actor["revivable"] = bool(server_actor.get("revivable", actor.get("revivable", true))) and not launched
		if launched:
			actor["actionState"] = "launched"
			if str(actor.get("kind", "")) == "pet" or str(actor.get("kind", "")) == "wild_pet":
				actor["petBattleState"] = BattleModel.PET_STATE_REST
		elif bool(actor.get("captured", false)):
			actor["actionState"] = "captured"
		elif int(actor.get("hp", 0)) <= 0:
			actor["actionState"] = "down"
		_apply_server_ride_fields(actor, server_actor)
		actor["activeSkillIds"] = _string_array(server_actor.get("activeSkillIds", actor.get("activeSkillIds", [])))
		actor["petSkillSlots"] = _string_array(server_actor.get("petSkillSlots", actor.get("petSkillSlots", [])))
		actor["passiveSkillIds"] = _string_array(server_actor.get("passiveSkillIds", actor.get("passiveSkillIds", [])))
		actor["spiritIds"] = _string_array(server_actor.get("spiritIds", actor.get("spiritIds", [])))
		actor["statuses"] = _dictionary_value(server_actor.get("statuses", actor.get("statuses", {})))
		actor["statusResist"] = _dictionary_value(server_actor.get("statusResist", actor.get("statusResist", {})))
		actor["statusImmune"] = _dictionary_value(server_actor.get("statusImmune", actor.get("statusImmune", {})))
		actor["serverGuarding"] = bool(server_actor.get("guarding", false))
		actor["serverDefeated"] = bool(server_actor.get("defeated", false))
		actor["serverCaptured"] = bool(server_actor.get("captured", false))
		actor["serverLaunched"] = launched
		actors[index] = actor
		next_state["actors"] = actors
		return next_state
	return next_state


static func _local_phase_for_room(battle: Dictionary, session: Dictionary) -> String:
	var server_phase := str(battle.get("phase", "command")).strip_edges()
	if server_phase != "command":
		return server_phase
	var account_id := str(session.get("accountId", "")).strip_edges()
	if account_id == "":
		return "command"
	return "server_waiting" if _account_submitted_all_required_actors(battle, account_id) else "command"


static func _message_for_room(room: Dictionary, battle: Dictionary, session: Dictionary) -> String:
	var mode := str(room.get("mode", "")).strip_edges()
	var phase := _local_phase_for_room(battle, session)
	if phase == "server_waiting":
		var waiting_account_id := str(session.get("accountId", "")).strip_edges()
		if waiting_account_id != "" and _account_has_any_actor(battle, waiting_account_id) and _account_required_actor_ids(battle, waiting_account_id).is_empty():
			return "已倒下，等待队友。" if mode == "party_pve" else "已倒下，等待战斗结果。"
		return "指令已提交，等待队友。" if mode == "party_pve" else "指令已提交，等待对方。"
	if phase == "command":
		var account_id := str(session.get("accountId", "")).strip_edges()
		if account_id != "" and _account_submitted_some_required_actors(battle, account_id):
			return "请选择宠物指令。"
		return "队伍战斗已同步，请选择指令。" if mode == "party_pve" else "切磋已恢复，请选择指令。"
	return "队伍战斗状态已同步。" if mode == "party_pve" else "切磋状态已同步。"


static func _account_required_actor_ids(battle: Dictionary, account_id: String) -> Array[String]:
	var required: Array = battle.get("requiredActorIds", []) if battle.get("requiredActorIds", []) is Array else []
	var required_map := {}
	for value in required:
		var actor_id := str(value).strip_edges()
		if actor_id != "":
			required_map[actor_id] = true
	var result: Array[String] = []
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var actor_id := str(actor.get("actorId", "")).strip_edges()
		if actor_id == "" or (not required_map.is_empty() and not required_map.has(actor_id)):
			continue
		if str(actor.get("accountId", "")).strip_edges() == account_id and int(actor.get("hp", 0)) > 0:
			result.append(actor_id)
	return result


static func _account_submitted_all_required_actors(battle: Dictionary, account_id: String) -> bool:
	var required_actor_ids := _account_required_actor_ids(battle, account_id)
	if required_actor_ids.is_empty():
		return _account_has_any_actor(battle, account_id)
	var submitted_actor_ids: Array = battle.get("submittedActorIds", []) if battle.get("submittedActorIds", []) is Array else []
	for actor_id in required_actor_ids:
		if not submitted_actor_ids.has(actor_id):
			return false
	return true


static func _account_has_any_actor(battle: Dictionary, account_id: String) -> bool:
	if account_id.strip_edges() == "":
		return false
	var actors: Array = battle.get("actors", []) if battle.get("actors", []) is Array else []
	for value in actors:
		if value is Dictionary and str((value as Dictionary).get("accountId", "")).strip_edges() == account_id:
			return true
	return false


static func _account_submitted_some_required_actors(battle: Dictionary, account_id: String) -> bool:
	var required_actor_ids := _account_required_actor_ids(battle, account_id)
	if required_actor_ids.is_empty():
		return false
	var submitted_actor_ids: Array = battle.get("submittedActorIds", []) if battle.get("submittedActorIds", []) is Array else []
	for actor_id in required_actor_ids:
		if submitted_actor_ids.has(actor_id):
			return true
	return false


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
	if kind == "pet":
		return "pet"
	if kind == "wild_pet":
		return "wild_pet"
	return "player"


static func _local_actor_id_for_server_kind(side: String, kind: String, is_self_account: bool, kind_index: int) -> String:
	var index := maxi(1, kind_index)
	if is_self_account:
		return BattleModel.PLAYER_ACTOR_ID if kind != "pet" and kind != "wild_pet" else "ally_pet"
	if side == BattleModel.SIDE_ENEMY:
		if kind == "pet" or kind == "wild_pet":
			return "enemy_pet" if index == 1 else "enemy_pet_%d" % index
		return "enemy_player" if index == 1 else "enemy_player_%d" % index
	if kind == "pet":
		return "ally_partner_pet_%d" % index
	if kind == "wild_pet":
		return "ally_partner_pet_%d" % index
	return "ally_partner_%d" % index


static func _slot_id_for_server_actor(side: String, server_actor: Dictionary, side_index: int, kind_index: int) -> String:
	var kind := _server_actor_kind(server_actor)
	var explicit_slot_id := str(server_actor.get("slotId", "")).strip_edges()
	if explicit_slot_id.begins_with("%s." % side) and BattleModel.is_valid_slot_id(explicit_slot_id):
		return explicit_slot_id
	var slot_number := int(server_actor.get("slotNumber", 0))
	if slot_number <= 0:
		slot_number = 3 if kind == "pet" or kind == "wild_pet" or kind_index <= 1 else clampi(kind_index + 2, 1, BattleModel.SLOTS_PER_ROW)
	slot_number = clampi(slot_number, 1, BattleModel.SLOTS_PER_ROW)
	var row := BattleModel.ROW_FRONT if kind == "pet" or kind == "wild_pet" else BattleModel.ROW_BACK
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


static func _dictionary_value(value) -> Dictionary:
	if value is Dictionary:
		return (value as Dictionary).duplicate(true)
	return {}


static func _local_value_map_from_server_actor_map(state: Dictionary, server_event: Dictionary, key: String) -> Dictionary:
	var source := _dictionary_value(server_event.get(key, {}))
	var result := {}
	for server_actor_id in source.keys():
		var local_id := _local_actor_id_for_server_actor(state, str(server_actor_id), "", "", "")
		if local_id != "":
			result[local_id] = source.get(server_actor_id)
	return result


static func _local_actor_ids_from_server_actor_ids(state: Dictionary, server_ids: Array) -> Array[String]:
	var result: Array[String] = []
	for server_actor_id in server_ids:
		var local_id := _local_actor_id_for_server_actor(state, str(server_actor_id), "", "", "")
		if local_id != "" and not result.has(local_id):
			result.append(local_id)
	return result


static func _local_event_from_server_event(state: Dictionary, server_event: Dictionary) -> Dictionary:
	var event_type := str(server_event.get("eventType", ""))
	var actor_id := _local_actor_id_for_server_actor(
		state,
		str(server_event.get("actorId", "")),
		str(server_event.get("actorAccountId", "")),
		str(server_event.get("actorUsername", "")),
		str(server_event.get("actorKind", ""))
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
	if event_type == "escape":
		return {
			"type": "escape",
			"attackerId": actor_id,
			"targetId": actor_id,
			"targetSide": str(actor.get("side", "")),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"actionId": str(server_event.get("actionId", "run")),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
		}
	if event_type == "switch_pet":
		if str(actor.get("side", "")) != BattleModel.SIDE_ALLY:
			return {}
		return {
			"type": "switch_pet",
			"attackerId": actor_id,
			"targetId": BattleModel.PLAYER_PET_ID,
			"targetSide": BattleModel.SIDE_ALLY,
			"petId": str(server_event.get("petId", "")),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"actionId": "switch_pet",
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverPreviousPetId": str(server_event.get("previousPetId", "")),
			"serverPreviousPetActorId": str(server_event.get("previousPetActorId", "")),
			"serverNextPetActorId": str(server_event.get("nextPetActorId", "")),
		}
	if event_type == "item_heal" or event_type == "item_heal_all":
		var item_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if item_target_id == "":
			return {}
		var item_target := BattleModel.actor_by_id(state, item_target_id)
		return {
			"type": event_type,
			"attackerId": actor_id,
			"targetId": item_target_id,
			"targetSide": str(item_target.get("side", BattleModel.SIDE_ALLY)),
			"targetIds": _local_actor_ids_from_server_actor_ids(state, server_event.get("targetActorIds", []) if server_event.get("targetActorIds", []) is Array else []),
			"heal": maxi(0, int(server_event.get("heal", server_event.get("healed", 0)))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"itemName": str(server_event.get("itemName", "物品")),
			"itemId": str(server_event.get("itemId", server_event.get("actionId", ""))),
			"actionId": str(server_event.get("actionId", server_event.get("itemId", ""))),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverHealed": int(server_event.get("healed", 0)),
			"remainingItemCount": int(server_event.get("remainingItemCount", -1)),
			"serverRemainingItemCount": int(server_event.get("remainingItemCount", -1)),
			"serverTargets": server_event.get("targets", []),
		}
	if event_type == "item_poison":
		var item_poison_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if item_poison_target_id == "":
			return {}
		var item_poison_target := BattleModel.actor_by_id(state, item_poison_target_id)
		return {
			"type": "item_poison",
			"attackerId": actor_id,
			"targetId": item_poison_target_id,
			"targetSide": str(item_poison_target.get("side", BattleModel.SIDE_ENEMY)),
			"damage": maxi(1, int(server_event.get("damage", 1))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"itemName": str(server_event.get("itemName", "物品")),
			"itemId": str(server_event.get("itemId", server_event.get("actionId", ""))),
			"actionId": str(server_event.get("actionId", server_event.get("itemId", ""))),
			"statusId": str(server_event.get("statusId", BattleModel.STATUS_POISON)),
			"statusTurns": maxi(1, int(server_event.get("statusTurns", 3))),
			"statusPotency": maxi(1, int(server_event.get("statusPotency", 1))),
			"statusHitRate": float(server_event.get("statusHitRate", 1.0)),
			"forcedStatusResult": str(server_event.get("statusResult", "")),
			"forcedStatusRoll": float(server_event.get("statusRoll", -1.0)),
			"forcedStatusChance": float(server_event.get("statusChance", -1.0)),
			"forcedStatusResistance": float(server_event.get("statusResistance", 0.0)),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverDefeated": bool(server_event.get("defeated", false)),
			"remainingItemCount": int(server_event.get("remainingItemCount", -1)),
			"serverRemainingItemCount": int(server_event.get("remainingItemCount", -1)),
		}
	if event_type == "item_poison_all":
		return {
			"type": "item_poison_all",
			"attackerId": actor_id,
			"targetId": "",
			"targetSide": BattleModel.SIDE_ENEMY,
			"targetIds": _local_actor_ids_from_server_actor_ids(state, server_event.get("targetActorIds", []) if server_event.get("targetActorIds", []) is Array else []),
			"damage": maxi(1, int(server_event.get("damage", 1))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"itemName": str(server_event.get("itemName", "物品")),
			"itemId": str(server_event.get("itemId", server_event.get("actionId", ""))),
			"actionId": str(server_event.get("actionId", server_event.get("itemId", ""))),
			"statusId": str(server_event.get("statusId", BattleModel.STATUS_POISON)),
			"statusTurns": maxi(1, int(server_event.get("statusTurns", 3))),
			"statusPotency": maxi(1, int(server_event.get("statusPotency", 1))),
			"statusHitRate": float(server_event.get("statusHitRate", 1.0)),
			"forcedStatusResultPerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusResultPerTarget"),
			"forcedStatusRollPerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusRollPerTarget"),
			"forcedStatusChancePerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusChancePerTarget"),
			"forcedStatusResistancePerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusResistancePerTarget"),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverTargets": server_event.get("targets", []),
			"remainingItemCount": int(server_event.get("remainingItemCount", -1)),
			"serverRemainingItemCount": int(server_event.get("remainingItemCount", -1)),
		}
	if event_type == "item_cleanse":
		var item_cleanse_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if item_cleanse_target_id == "":
			return {}
		var item_cleanse_target := BattleModel.actor_by_id(state, item_cleanse_target_id)
		return {
			"type": "item_cleanse",
			"attackerId": actor_id,
			"targetId": item_cleanse_target_id,
			"targetSide": str(item_cleanse_target.get("side", BattleModel.SIDE_ALLY)),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"itemName": str(server_event.get("itemName", "物品")),
			"itemId": str(server_event.get("itemId", server_event.get("actionId", ""))),
			"actionId": str(server_event.get("actionId", server_event.get("itemId", ""))),
			"statusIds": server_event.get("statusIds", []),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"remainingItemCount": int(server_event.get("remainingItemCount", -1)),
			"serverRemainingItemCount": int(server_event.get("remainingItemCount", -1)),
		}
	if event_type == "capture":
		var capture_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if capture_target_id == "":
			return {}
		var capture_target := BattleModel.actor_by_id(state, capture_target_id)
		var capture_tool_id := str(server_event.get("captureToolId", BattleModel.CAPTURE_TOOL_EMPTY_HAND))
		return {
			"type": "capture",
			"attackerId": actor_id,
			"targetId": capture_target_id,
			"targetSide": str(capture_target.get("side", BattleModel.SIDE_ENEMY)),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"captureToolId": capture_tool_id,
			"captureToolLabel": str(server_event.get("captureToolLabel", CaptureToolCatalog.full_name_for(capture_tool_id))),
			"captureChance": float(server_event.get("captureChance", 0.0)),
			"captureRoll": float(server_event.get("captureRoll", 1.0)),
			"success": bool(server_event.get("success", false)),
			"actionId": "capture",
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverRemainingCaptureToolCount": int(server_event.get("remainingCaptureToolCount", -1)),
		}
	if event_type == "spirit_heal":
		var spirit_heal_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if spirit_heal_target_id == "":
			return {}
		var spirit_heal_target := BattleModel.actor_by_id(state, spirit_heal_target_id)
		return {
			"type": "spirit_heal",
			"attackerId": actor_id,
			"targetId": spirit_heal_target_id,
			"targetSide": str(spirit_heal_target.get("side", BattleModel.SIDE_ALLY)),
			"heal": maxi(0, int(server_event.get("heal", server_event.get("healed", 0)))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"spiritId": str(server_event.get("spiritId", server_event.get("actionId", ""))),
			"skillName": str(server_event.get("skillName", BattleActionCatalog.label_for(str(server_event.get("spiritId", "")), "精灵"))),
			"actionId": str(server_event.get("actionId", server_event.get("spiritId", ""))),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverHealed": int(server_event.get("healed", 0)),
		}
	if event_type == "spirit_heal_all":
		return {
			"type": "spirit_heal_all",
			"attackerId": actor_id,
			"targetId": actor_id,
			"targetSide": str(actor.get("side", BattleModel.SIDE_ALLY)),
			"heal": maxi(0, int(server_event.get("heal", server_event.get("healed", 0)))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"spiritId": str(server_event.get("spiritId", server_event.get("actionId", ""))),
			"skillName": str(server_event.get("skillName", BattleActionCatalog.label_for(str(server_event.get("spiritId", "")), "精灵"))),
			"actionId": str(server_event.get("actionId", server_event.get("spiritId", ""))),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverTargets": server_event.get("targets", []),
		}
	if event_type == "spirit_poison":
		var spirit_poison_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if spirit_poison_target_id == "":
			return {}
		var spirit_poison_target := BattleModel.actor_by_id(state, spirit_poison_target_id)
		return {
			"type": "spirit_poison",
			"attackerId": actor_id,
			"targetId": spirit_poison_target_id,
			"targetSide": str(spirit_poison_target.get("side", BattleModel.SIDE_ENEMY)),
			"damage": maxi(1, int(server_event.get("damage", 1))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"spiritId": str(server_event.get("spiritId", server_event.get("actionId", ""))),
			"skillName": str(server_event.get("skillName", BattleActionCatalog.label_for(str(server_event.get("spiritId", "")), "精灵"))),
			"actionId": str(server_event.get("actionId", server_event.get("spiritId", ""))),
			"statusId": str(server_event.get("statusId", BattleModel.STATUS_POISON)),
			"statusTurns": maxi(1, int(server_event.get("statusTurns", 3))),
			"statusPotency": maxi(1, int(server_event.get("statusPotency", 1))),
			"statusHitRate": float(server_event.get("statusHitRate", 1.0)),
			"forcedStatusResult": str(server_event.get("statusResult", "")),
			"forcedStatusRoll": float(server_event.get("statusRoll", -1.0)),
			"forcedStatusChance": float(server_event.get("statusChance", -1.0)),
			"forcedStatusResistance": float(server_event.get("statusResistance", 0.0)),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverDefeated": bool(server_event.get("defeated", false)),
		}
	if event_type == "spirit_poison_all":
		return {
			"type": "spirit_poison_all",
			"attackerId": actor_id,
			"targetId": "",
			"targetSide": BattleModel.SIDE_ENEMY,
			"damage": maxi(1, int(server_event.get("damage", 1))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"spiritId": str(server_event.get("spiritId", server_event.get("actionId", ""))),
			"skillName": str(server_event.get("skillName", BattleActionCatalog.label_for(str(server_event.get("spiritId", "")), "精灵"))),
			"actionId": str(server_event.get("actionId", server_event.get("spiritId", ""))),
			"statusId": str(server_event.get("statusId", BattleModel.STATUS_POISON)),
			"statusTurns": maxi(1, int(server_event.get("statusTurns", 3))),
			"statusPotency": maxi(1, int(server_event.get("statusPotency", 1))),
			"statusHitRate": float(server_event.get("statusHitRate", 1.0)),
			"forcedStatusResultPerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusResultPerTarget"),
			"forcedStatusRollPerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusRollPerTarget"),
			"forcedStatusChancePerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusChancePerTarget"),
			"forcedStatusResistancePerTarget": _local_value_map_from_server_actor_map(state, server_event, "statusResistancePerTarget"),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverTargets": server_event.get("targets", []),
		}
	if event_type == "skill_status":
		var status_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if status_target_id == "":
			return {}
		var status_target := BattleModel.actor_by_id(state, status_target_id)
		var skill_id := str(server_event.get("skillId", server_event.get("actionId", "pet_sleep_powder")))
		return {
			"type": "skill_status",
			"attackerId": actor_id,
			"targetId": status_target_id,
			"targetSide": str(status_target.get("side", BattleModel.SIDE_ENEMY)),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"skillId": skill_id,
			"skillName": str(server_event.get("skillName", BattleActionCatalog.label_for(skill_id, "宠物技能"))),
			"actionId": str(server_event.get("actionId", skill_id)),
			"statusId": str(server_event.get("statusId", "")),
			"statusTurns": maxi(1, int(server_event.get("statusTurns", 1))),
			"statusPotency": maxi(0, int(server_event.get("statusPotency", 0))),
			"statusHitRate": float(server_event.get("statusHitRate", 1.0)),
			"forcedStatusResult": str(server_event.get("statusResult", "")),
			"forcedStatusRoll": float(server_event.get("statusRoll", -1.0)),
			"forcedStatusChance": float(server_event.get("statusChance", -1.0)),
			"forcedStatusResistance": float(server_event.get("statusResistance", 0.0)),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
		}
	if event_type == "status_skip":
		return {
			"type": "status_skip",
			"attackerId": actor_id,
			"targetId": actor_id,
			"targetSide": str(actor.get("side", "")),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"actionId": str(server_event.get("actionId", "")),
			"statusId": str(server_event.get("statusId", "")),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
		}
	if event_type == "combo_attack":
		var combo_target_id := _local_actor_id_for_server_actor(
			state,
			str(server_event.get("targetActorId", "")),
			str(server_event.get("targetAccountId", "")),
			str(server_event.get("targetUsername", "")),
			str(server_event.get("targetKind", ""))
		)
		if combo_target_id == "":
			return {}
		var combo_target := BattleModel.actor_by_id(state, combo_target_id)
		var participant_ids: Array[String] = []
		var server_participant_ids: Array = server_event.get("participantActorIds", []) if server_event.get("participantActorIds", []) is Array else []
		for server_actor_id in server_participant_ids:
			var participant_id := _local_actor_id_for_server_actor(state, str(server_actor_id), "", "", "")
			if participant_id != "" and not participant_ids.has(participant_id):
				participant_ids.append(participant_id)
		if participant_ids.is_empty():
			participant_ids.append(actor_id)
		return {
			"type": "combo_attack",
			"attackerId": actor_id,
			"participantIds": participant_ids,
			"targetId": combo_target_id,
			"targetSide": str(combo_target.get("side", BattleModel.SIDE_ENEMY)),
			"damage": maxi(1, int(server_event.get("damage", 1))),
			"speed": int(actor.get("quick", actor.get("speed", 0))),
			"sequence": sequence,
			"movementStyle": "melee_combo",
			"canDodge": false,
			"canCritical": false,
			"canCounter": false,
			"canLaunch": bool(server_event.get("launched", false)),
			"actionId": str(server_event.get("actionId", "attack")),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverBlocked": bool(server_event.get("blocked", false)),
			"serverDefeated": bool(server_event.get("defeated", false)),
			"serverLaunched": bool(server_event.get("launched", false)),
			"serverParticipants": server_event.get("participants", []),
		}
	if event_type != "basic_attack" and event_type != "pet_skill":
		return {}
	var target_id := _local_actor_id_for_server_actor(
		state,
		str(server_event.get("targetActorId", "")),
		str(server_event.get("targetAccountId", "")),
		str(server_event.get("targetUsername", "")),
		str(server_event.get("targetKind", ""))
	)
	if target_id == "":
		return {}
	var target := BattleModel.actor_by_id(state, target_id)
	if event_type == "pet_skill":
		var skill_id := str(server_event.get("skillId", server_event.get("actionId", "pet_bui_charge")))
		return {
			"type": "skill_attack",
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
			"canLaunch": bool(server_event.get("launched", false)),
			"skillId": skill_id,
			"skillName": BattleActionCatalog.label_for(skill_id, "宠物技能"),
			"actionId": str(server_event.get("actionId", skill_id)),
			"serverEventId": str(server_event.get("eventId", "")),
			"serverEventType": event_type,
			"serverMessage": str(server_event.get("message", "")),
			"serverHpBefore": int(server_event.get("hpBefore", 0)),
			"serverHpAfter": int(server_event.get("hpAfter", 0)),
			"serverBlocked": bool(server_event.get("blocked", false)),
			"serverDefeated": bool(server_event.get("defeated", false)),
			"serverLaunched": bool(server_event.get("launched", false)),
		}
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
		"canLaunch": bool(server_event.get("launched", false)),
		"actionId": str(server_event.get("actionId", "attack")),
		"serverEventId": str(server_event.get("eventId", "")),
		"serverEventType": event_type,
		"serverMessage": str(server_event.get("message", "")),
		"serverHpBefore": int(server_event.get("hpBefore", 0)),
		"serverHpAfter": int(server_event.get("hpAfter", 0)),
		"serverBlocked": bool(server_event.get("blocked", false)),
		"serverDefeated": bool(server_event.get("defeated", false)),
		"serverLaunched": bool(server_event.get("launched", false)),
	}


static func _local_actor_id_for_server_actor(state: Dictionary, server_actor_id: String, account_id: String, username: String, kind: String = "", pet_id: String = "") -> String:
	var actor_id := server_actor_id.strip_edges()
	var account := account_id.strip_edges()
	var name := username.strip_edges()
	var normalized_kind := kind.strip_edges()
	var normalized_pet_id := pet_id.strip_edges()
	var actors: Array = state.get("actors", []) if state.get("actors", []) is Array else []
	if actor_id != "":
		for value in actors:
			if not (value is Dictionary):
				continue
			var actor := value as Dictionary
			if str(actor.get("serverActorId", "")).strip_edges() == actor_id:
				return str(actor.get("id", ""))
	if account != "":
		for value in actors:
			if not (value is Dictionary):
				continue
			var actor := value as Dictionary
			if normalized_kind != "" and str(actor.get("serverKind", actor.get("kind", ""))).strip_edges() != normalized_kind:
				continue
			if str(actor.get("serverAccountId", "")).strip_edges() == account:
				return str(actor.get("id", ""))
	if name != "":
		for value in actors:
			if not (value is Dictionary):
				continue
			var actor := value as Dictionary
			if normalized_kind != "" and str(actor.get("serverKind", actor.get("kind", ""))).strip_edges() != normalized_kind:
				continue
			if str(actor.get("serverUsername", "")).strip_edges() == name:
				return str(actor.get("id", ""))
	if normalized_kind == "pet" and normalized_pet_id != "":
		for value in actors:
			if not (value is Dictionary):
				continue
			var actor := value as Dictionary
			if str(actor.get("serverKind", actor.get("kind", ""))).strip_edges() != "pet":
				continue
			if (
				str(actor.get("serverPetId", "")).strip_edges() == normalized_pet_id
				or str(actor.get("petId", "")).strip_edges() == normalized_pet_id
			):
				return str(actor.get("id", ""))
	return ""


static func _guarding_actor_ids(actors: Array[Dictionary]) -> Array[String]:
	var ids: Array[String] = []
	for actor in actors:
		if bool(actor.get("serverGuarding", false)) and int(actor.get("hp", 0)) > 0:
			ids.append(str(actor.get("id", "")))
	return ids
