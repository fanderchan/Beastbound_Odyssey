extends RefCounted

const BattleEventLedger := preload("res://scripts/battle/battle_event_ledger.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")


static func run() -> Dictionary:
	var checks := {}

	var reconnect_before := _server_state()
	reconnect_before = BattleModel.set_actor_hp(reconnect_before, BattleModel.PLAYER_ACTOR_ID, 41)
	reconnect_before = BattleModel.set_actor_status(reconnect_before, BattleModel.PLAYER_ACTOR_ID, BattleModel.STATUS_POISON, 2, 6, "enemy_front_3")
	reconnect_before = _set_actor_fields(reconnect_before, BattleModel.PLAYER_ACTOR_ID, {
		"serverGuarding": true,
		"ridePetInstanceId": "qa_status_ride",
		"ridePetName": "状态回放骑宠",
		"ridePetFormId": "starter_tiger",
		"ridePetLevel": 12,
		"ridePetHp": 33,
		"ridePetMaxHp": 40,
		"ridePetBattleState": "riding",
	})
	var reconnect_final := reconnect_before.duplicate(true)
	reconnect_final = BattleModel.set_actor_hp(reconnect_final, BattleModel.PLAYER_ACTOR_ID, 0)
	reconnect_final = _set_actor_fields(reconnect_final, BattleModel.PLAYER_ACTOR_ID, {
		"statuses": {},
		"serverGuarding": false,
		"serverDefeated": true,
		"actionState": "down",
		"launched": true,
		"revivable": false,
		"ridePetInstanceId": "",
	})
	var reconnect_list := _event_list([], reconnect_before, reconnect_final, 1)
	var rewound := ServerBattleRoomModel.state_at_server_event_list_start(reconnect_final, reconnect_list)
	var rewound_player := BattleModel.actor_by_id(rewound, BattleModel.PLAYER_ACTOR_ID)
	checks["actors_before_full_restore"] = (
		int(rewound_player.get("hp", -1)) == 41
		and BattleStatusModel.status_turns(rewound_player, BattleModel.STATUS_POISON) == 2
		and str(rewound_player.get("ridePetInstanceId", "")) == "qa_status_ride"
		and int(rewound_player.get("ridePetHp", -1)) == 33
		and not bool(rewound_player.get("launched", true))
		and bool(rewound_player.get("revivable", false))
		and str(rewound_player.get("actionState", "")) == "idle"
		and (rewound.get("guardingActorIds", []) as Array).has(BattleModel.PLAYER_ACTOR_ID)
	)

	var tick_before := _server_state()
	tick_before = BattleModel.set_actor_hp(tick_before, "enemy_front_3", 20)
	tick_before = BattleModel.set_actor_status(tick_before, "enemy_front_3", BattleModel.STATUS_POISON, 2, 7, BattleModel.PLAYER_ACTOR_ID)
	var tick_after := tick_before.duplicate(true)
	tick_after = BattleModel.set_actor_hp(tick_after, "enemy_front_3", 13)
	tick_after = BattleModel.set_actor_status(tick_after, "enemy_front_3", BattleModel.STATUS_POISON, 1, 7, BattleModel.PLAYER_ACTOR_ID)
	var tick_event := _status_lifecycle_event(
		"evt_tick_2_to_1",
		"status_tick",
		"enemy_front_3",
		BattleModel.STATUS_POISON,
		_status_for_actor(tick_before, "enemy_front_3", BattleModel.STATUS_POISON),
		_status_for_actor(tick_after, "enemy_front_3", BattleModel.STATUS_POISON),
		2,
		1,
		7,
		20,
		13,
		BattleModel.PLAYER_ACTOR_ID
	)
	var tick_replay := _replay_from_final(tick_after, _event_list([tick_event], tick_before, tick_after, 2))
	var tick_state := tick_replay.get("state", {}) as Dictionary
	var tick_target := BattleModel.actor_by_id(tick_state, "enemy_front_3")
	var tick_events: Array = tick_replay.get("events", [])
	var tick_ledgers: Array = tick_replay.get("ledgers", [])
	var tick_ledger := tick_ledgers[0] as Dictionary if not tick_ledgers.is_empty() else {}
	var tick_ledger_target := _first_ledger_target(tick_ledger)
	checks["tick_two_to_one_exact"] = (
		tick_events.size() == 1
		and bool((tick_events[0] as Dictionary).get("serverResolved", false))
		and int(BattleModel.actor_by_id(tick_replay.get("rewound", {}) as Dictionary, "enemy_front_3").get("hp", -1)) == 20
		and int(tick_target.get("hp", -1)) == 13
		and BattleStatusModel.status_turns(tick_target, BattleModel.STATUS_POISON) == 1
		and int(tick_ledger_target.get("hpBefore", -1)) == 20
		and int(tick_ledger_target.get("hpAfter", -1)) == 13
		and _status_turns_from_snapshot(tick_ledger_target.get("statusesBefore", {}), BattleModel.STATUS_POISON) == 2
		and _status_turns_from_snapshot(tick_ledger_target.get("statusesAfter", {}), BattleModel.STATUS_POISON) == 1
	)

	var expiry_before := _server_state()
	expiry_before = BattleModel.set_actor_hp(expiry_before, "enemy_front_3", 20)
	expiry_before = BattleModel.set_actor_status(expiry_before, "enemy_front_3", BattleModel.STATUS_POISON, 1, 4, BattleModel.PLAYER_ACTOR_ID)
	expiry_before = BattleModel.set_actor_hp(expiry_before, BattleModel.PLAYER_ACTOR_ID, 5)
	expiry_before = BattleModel.set_actor_status(expiry_before, BattleModel.PLAYER_ACTOR_ID, BattleModel.STATUS_POISON, 1, 7, "enemy_front_3")
	var expiry_after := expiry_before.duplicate(true)
	expiry_after = BattleModel.set_actor_hp(expiry_after, "enemy_front_3", 16)
	expiry_after = _set_actor_fields(expiry_after, "enemy_front_3", {"statuses": {}})
	expiry_after = BattleModel.set_actor_hp(expiry_after, BattleModel.PLAYER_ACTOR_ID, 0)
	expiry_after = _set_actor_fields(expiry_after, BattleModel.PLAYER_ACTOR_ID, {
		"statuses": {},
		"serverDefeated": true,
		"actionState": "down",
	})
	var expiry_events := [
		_status_lifecycle_event("evt_tick_expire", "status_tick", "enemy_front_3", BattleModel.STATUS_POISON, _status_for_actor(expiry_before, "enemy_front_3", BattleModel.STATUS_POISON), null, 1, 0, 4, 20, 16, BattleModel.PLAYER_ACTOR_ID),
		_status_lifecycle_event("evt_tick_fatal", "status_tick", BattleModel.PLAYER_ACTOR_ID, BattleModel.STATUS_POISON, _status_for_actor(expiry_before, BattleModel.PLAYER_ACTOR_ID, BattleModel.STATUS_POISON), null, 1, 0, 7, 5, 0, "enemy_front_3"),
	]
	var expiry_replay := _replay_from_final(expiry_after, _event_list(expiry_events, expiry_before, expiry_after, 3))
	var expiry_state := expiry_replay.get("state", {}) as Dictionary
	var mapped_expiry_events: Array = expiry_replay.get("events", [])
	checks["tick_expire_and_fatal"] = (
		mapped_expiry_events.size() == 2
		and str((mapped_expiry_events[0] as Dictionary).get("targetId", "")) == "enemy_front_3"
		and str((mapped_expiry_events[1] as Dictionary).get("targetId", "")) == BattleModel.PLAYER_ACTOR_ID
		and int(BattleModel.actor_by_id(expiry_state, "enemy_front_3").get("hp", -1)) == 16
		and not BattleStatusModel.has_status(BattleModel.actor_by_id(expiry_state, "enemy_front_3"), BattleModel.STATUS_POISON)
		and int(BattleModel.actor_by_id(expiry_state, BattleModel.PLAYER_ACTOR_ID).get("hp", -1)) == 0
		and str(BattleModel.actor_by_id(expiry_state, BattleModel.PLAYER_ACTOR_ID).get("actionState", "")) == "down"
		and not BattleStatusModel.has_status(BattleModel.actor_by_id(expiry_state, BattleModel.PLAYER_ACTOR_ID), BattleModel.STATUS_POISON)
	)

	var skip_before := _server_state()
	skip_before = BattleModel.set_actor_status(skip_before, "enemy_front_3", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	skip_before = BattleModel.set_actor_status(skip_before, "enemy_front_4", BattleModel.STATUS_STONE, 1, 0, BattleModel.PLAYER_ACTOR_ID)
	var skip_after := skip_before.duplicate(true)
	skip_after = BattleModel.set_actor_status(skip_after, "enemy_front_3", BattleModel.STATUS_SLEEP, 1, 0, BattleModel.PLAYER_ACTOR_ID)
	skip_after = _set_actor_fields(skip_after, "enemy_front_4", {"statuses": {}})
	var skip_events := [
		_status_lifecycle_event("evt_sleep_skip", "status_skip", "enemy_front_3", BattleModel.STATUS_SLEEP, _status_for_actor(skip_before, "enemy_front_3", BattleModel.STATUS_SLEEP), _status_for_actor(skip_after, "enemy_front_3", BattleModel.STATUS_SLEEP), 2, 1, 0, int(BattleModel.actor_by_id(skip_before, "enemy_front_3").get("hp", 0)), int(BattleModel.actor_by_id(skip_after, "enemy_front_3").get("hp", 0))),
		_status_lifecycle_event("evt_stone_skip", "status_skip", "enemy_front_4", BattleModel.STATUS_STONE, _status_for_actor(skip_before, "enemy_front_4", BattleModel.STATUS_STONE), null, 1, 0, 0, int(BattleModel.actor_by_id(skip_before, "enemy_front_4").get("hp", 0)), int(BattleModel.actor_by_id(skip_after, "enemy_front_4").get("hp", 0))),
	]
	var skip_replay := _replay_from_final(skip_after, _event_list(skip_events, skip_before, skip_after, 4))
	var skip_state := skip_replay.get("state", {}) as Dictionary
	checks["enemy_skip_exact"] = (
		BattleStatusModel.status_turns(BattleModel.actor_by_id(skip_state, "enemy_front_3"), BattleModel.STATUS_SLEEP) == 1
		and not BattleStatusModel.has_status(BattleModel.actor_by_id(skip_state, "enemy_front_4"), BattleModel.STATUS_STONE)
		and str(skip_state.get("lastEventType", "")) == "status_skip"
		and str(skip_state.get("lastStatusId", "")) == BattleModel.STATUS_STONE
	)

	var enemy_status_before := _server_state()
	enemy_status_before["itemBag"] = {"item_poison_single_5": 9, "item_cleanse_single_5": 9}
	enemy_status_before = BattleModel.set_actor_hp(enemy_status_before, BattleModel.PLAYER_ACTOR_ID, 30)
	enemy_status_before = BattleModel.set_actor_hp(enemy_status_before, BattleModel.PLAYER_PET_ID, 24)
	enemy_status_before = BattleModel.set_actor_status(enemy_status_before, "enemy_front_4", BattleModel.STATUS_POISON, 2, 3, BattleModel.PLAYER_ACTOR_ID)
	enemy_status_before = BattleModel.set_actor_status(enemy_status_before, "enemy_front_4", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	var enemy_status_after := enemy_status_before.duplicate(true)
	enemy_status_after = BattleModel.set_actor_hp(enemy_status_after, BattleModel.PLAYER_ACTOR_ID, 27)
	enemy_status_after = BattleModel.set_actor_status(enemy_status_after, BattleModel.PLAYER_ACTOR_ID, BattleModel.STATUS_POISON, 3, 2, "enemy_front_3")
	enemy_status_after = BattleModel.set_actor_status(enemy_status_after, BattleModel.PLAYER_PET_ID, BattleModel.STATUS_SLEEP, 2, 0, "enemy_front_3")
	enemy_status_after = BattleModel.set_actor_hp(enemy_status_after, BattleModel.PLAYER_PET_ID, 21)
	enemy_status_after = BattleModel.set_actor_status(enemy_status_after, BattleModel.PLAYER_PET_ID, BattleModel.STATUS_POISON, 3, 2, "enemy_front_3")
	enemy_status_after = _set_actor_fields(enemy_status_after, "enemy_front_4", {"statuses": {}})
	var enemy_status_events := [
		_poison_event("evt_enemy_item_poison", "item_poison", "enemy_front_3", [BattleModel.PLAYER_ACTOR_ID], 3, 3, 2, "item_poison_single_5", "item"),
		_status_apply_event("evt_enemy_status_skill", "enemy_front_3", BattleModel.PLAYER_PET_ID, BattleModel.STATUS_SLEEP, 2),
		_poison_event("evt_enemy_spirit_poison", "spirit_poison_all", "enemy_front_3", [BattleModel.PLAYER_PET_ID], 3, 3, 2, "spirit_poison_mist_1", "spirit"),
		_cleanse_event("evt_enemy_cleanse", "enemy_front_3", "enemy_front_4", [BattleModel.STATUS_POISON, BattleModel.STATUS_SLEEP]),
	]
	var enemy_status_replay := _replay_from_final(enemy_status_after, _event_list(enemy_status_events, enemy_status_before, enemy_status_after, 5))
	var enemy_status_state := enemy_status_replay.get("state", {}) as Dictionary
	var mapped_enemy_events: Array = enemy_status_replay.get("events", [])
	checks["enemy_poison_status_and_cleanse"] = (
		mapped_enemy_events.size() == 4
		and _all_server_resolved(mapped_enemy_events)
		and int(BattleModel.actor_by_id(enemy_status_state, BattleModel.PLAYER_ACTOR_ID).get("hp", -1)) == 27
		and BattleStatusModel.has_status(BattleModel.actor_by_id(enemy_status_state, BattleModel.PLAYER_ACTOR_ID), BattleModel.STATUS_POISON)
		and int(BattleModel.actor_by_id(enemy_status_state, BattleModel.PLAYER_PET_ID).get("hp", -1)) == 21
		and BattleStatusModel.has_status(BattleModel.actor_by_id(enemy_status_state, BattleModel.PLAYER_PET_ID), BattleModel.STATUS_SLEEP)
		and BattleStatusModel.has_status(BattleModel.actor_by_id(enemy_status_state, BattleModel.PLAYER_PET_ID), BattleModel.STATUS_POISON)
		and BattleStatusModel.active_status_ids(BattleModel.actor_by_id(enemy_status_state, "enemy_front_4")).is_empty()
		and BattleModel.item_count(enemy_status_state, "item_poison_single_5") == 9
		and BattleModel.item_count(enemy_status_state, "item_cleanse_single_5") == 9
	)

	var local_item_before := _server_state()
	local_item_before["itemBag"] = {"item_poison_single_5": 5}
	local_item_before = BattleModel.set_actor_hp(local_item_before, "enemy_front_3", 24)
	var local_item_after := local_item_before.duplicate(true)
	local_item_after = BattleModel.set_actor_hp(local_item_after, "enemy_front_3", 21)
	local_item_after = BattleModel.set_actor_status(local_item_after, "enemy_front_3", BattleModel.STATUS_POISON, 3, 2, BattleModel.PLAYER_ACTOR_ID)
	var local_item_event := _poison_event(
		"evt_local_item_poison",
		"item_poison",
		BattleModel.PLAYER_ACTOR_ID,
		["enemy_front_3"],
		3,
		3,
		2,
		"item_poison_single_5",
		"item",
		2
	)
	var local_item_replay := _replay_from_final(local_item_after, _event_list([local_item_event], local_item_before, local_item_after, 6))
	var local_item_state := local_item_replay.get("state", {}) as Dictionary
	var mapped_local_item_events: Array = local_item_replay.get("events", [])
	checks["local_item_count_uses_server_remaining"] = (
		mapped_local_item_events.size() == 1
		and bool((mapped_local_item_events[0] as Dictionary).get("serverResolved", false))
		and bool((mapped_local_item_events[0] as Dictionary).get("applyServerRemainingItemCount", false))
		and BattleModel.item_count(local_item_state, "item_poison_single_5") == 2
		and int(BattleModel.actor_by_id(local_item_state, "enemy_front_3").get("hp", -1)) == 21
		and BattleStatusModel.status_turns(BattleModel.actor_by_id(local_item_state, "enemy_front_3"), BattleModel.STATUS_POISON) == 3
	)

	var wake_before := _server_state()
	wake_before = BattleModel.set_actor_hp(wake_before, "enemy_front_3", 20)
	wake_before = BattleModel.set_actor_status(wake_before, "enemy_front_3", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	wake_before = BattleModel.set_actor_status(wake_before, "enemy_front_4", BattleModel.STATUS_SLEEP, 2, 0, BattleModel.PLAYER_ACTOR_ID)
	var wake_after := wake_before.duplicate(true)
	wake_after = BattleModel.set_actor_hp(wake_after, "enemy_front_3", 16)
	wake_after = _set_actor_fields(wake_after, "enemy_front_3", {"statuses": {}})
	var wake_events := [
		_damage_event("evt_wake", BattleModel.PLAYER_ACTOR_ID, "enemy_front_3", 4, 20, 16, [{
			"actorId": "enemy_front_3",
			"statusId": BattleModel.STATUS_SLEEP,
			"change": "remove_on_damage",
			"statusBefore": _status_for_actor(wake_before, "enemy_front_3", BattleModel.STATUS_SLEEP),
			"statusAfter": null,
			"fromTurns": 2,
			"toTurns": 0,
			"schemaVersion": 1,
		}]),
		_damage_event("evt_zero_dodge", BattleModel.PLAYER_ACTOR_ID, "enemy_front_4", 0, int(BattleModel.actor_by_id(wake_before, "enemy_front_4").get("hp", 0)), int(BattleModel.actor_by_id(wake_before, "enemy_front_4").get("hp", 0)), [], true),
	]
	var wake_replay := _replay_from_final(wake_after, _event_list(wake_events, wake_before, wake_after, 6))
	var wake_state := wake_replay.get("state", {}) as Dictionary
	checks["damage_wake_is_server_fact"] = (
		not BattleStatusModel.has_status(BattleModel.actor_by_id(wake_state, "enemy_front_3"), BattleModel.STATUS_SLEEP)
		and BattleStatusModel.status_turns(BattleModel.actor_by_id(wake_state, "enemy_front_4"), BattleModel.STATUS_SLEEP) == 2
		and int(BattleModel.actor_by_id(wake_state, "enemy_front_4").get("hp", -1)) == int(BattleModel.actor_by_id(wake_before, "enemy_front_4").get("hp", 0))
	)

	checks["final_actor_snapshots_are_noop"] = (
		bool(tick_replay.get("snapshotNoop", false))
		and bool(expiry_replay.get("snapshotNoop", false))
		and bool(skip_replay.get("snapshotNoop", false))
		and bool(enemy_status_replay.get("snapshotNoop", false))
		and bool(local_item_replay.get("snapshotNoop", false))
		and bool(wake_replay.get("snapshotNoop", false))
	)

	var ok := true
	for value in checks.values():
		if not bool(value):
			ok = false
			break
	return {"ok": ok, "checks": checks, "checkCount": checks.size()}


static func _server_state() -> Dictionary:
	var state := BattleModel.create_stat_formula_test_battle({"id": "server_status_replay", "name": "状态权威回放"})
	state["serverAuthority"] = true
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		actor["serverActorId"] = str(actor.get("id", ""))
		actor["serverAccountId"] = "account_%s" % str(actor.get("id", ""))
		actor["serverUsername"] = "user_%s" % str(actor.get("id", ""))
		actor["serverSide"] = str(actor.get("side", ""))
		actor["serverKind"] = str(actor.get("kind", ""))
		actor["serverPetId"] = str(actor.get("petId", actor.get("id", ""))) if str(actor.get("kind", "")) == "pet" else ""
		actors[index] = actor
	state["actors"] = actors
	return state


static func _set_actor_fields(state: Dictionary, actor_id: String, fields: Dictionary) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := BattleModel.actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	for key in fields.keys():
		actor[str(key)] = fields.get(key)
	actors[index] = actor
	state["actors"] = actors
	return state


static func _status_for_actor(state: Dictionary, actor_id: String, status_id: String):
	var actor := BattleModel.actor_by_id(state, actor_id)
	var statuses := BattleStatusModel.statuses_for(actor)
	if statuses.get(status_id, null) is Dictionary:
		return (statuses.get(status_id) as Dictionary).duplicate(true)
	return null


static func _status_lifecycle_event(event_id: String, event_type: String, actor_id: String, status_id: String, status_before, status_after, from_turns: int, to_turns: int, damage: int, hp_before: int, hp_after: int, source_actor_id: String = "") -> Dictionary:
	return {
		"schemaVersion": 2,
		"eventId": event_id,
		"eventType": event_type,
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "player" if actor_id == BattleModel.PLAYER_ACTOR_ID else "pet",
		"targetActorId": actor_id,
		"targetKind": "player" if actor_id == BattleModel.PLAYER_ACTOR_ID else "pet",
		"sourceActorId": source_actor_id,
		"statusId": status_id,
		"statusResult": "tick" if event_type == "status_tick" else "skip",
		"statusBefore": status_before,
		"statusAfter": status_after,
		"fromTurns": from_turns,
		"toTurns": to_turns,
		"statusChanges": [{
			"actorId": actor_id,
			"statusId": status_id,
			"change": "decrement",
			"fromTurns": from_turns,
			"toTurns": to_turns,
			"schemaVersion": 1,
		}],
		"damage": damage,
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"defeated": hp_after <= 0,
		"launched": false,
		"dodged": false,
		"critical": false,
		"counterTriggered": false,
	}


static func _poison_event(event_id: String, event_type: String, actor_id: String, target_ids: Array, damage: int, status_turns: int, status_potency: int, action_id: String, source_kind: String, remaining_item_count: int = 0) -> Dictionary:
	var targets: Array[Dictionary] = []
	var changes: Array[Dictionary] = []
	var result_per_target := {}
	for target_id_value in target_ids:
		var target_id := str(target_id_value)
		var hp_before := 30 if target_id == BattleModel.PLAYER_ACTOR_ID else 24
		targets.append({
			"targetActorId": target_id,
			"targetKind": "player" if target_id == BattleModel.PLAYER_ACTOR_ID else "pet",
			"hpBefore": hp_before,
			"hpAfter": hp_before - damage,
			"damage": damage,
			"defeated": false,
			"statusResult": "applied",
		})
		changes.append({
			"actorId": target_id,
			"statusId": BattleModel.STATUS_POISON,
			"change": "apply",
			"turns": status_turns,
			"potency": status_potency,
			"schemaVersion": 1,
		})
		result_per_target[target_id] = "applied"
	var event := {
		"schemaVersion": 1,
		"eventId": event_id,
		"eventType": event_type,
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "player" if actor_id == BattleModel.PLAYER_ACTOR_ID else "pet",
		"targetActorId": str(target_ids[0]) if not target_ids.is_empty() else "",
		"targetKind": "player" if not target_ids.is_empty() and str(target_ids[0]) == BattleModel.PLAYER_ACTOR_ID else "pet",
		"targetActorIds": target_ids.duplicate(),
		"targets": targets,
		"actionId": action_id,
		"damage": damage,
		"hpBefore": int(targets[0].get("hpBefore", 0)) if not targets.is_empty() else 0,
		"hpAfter": int(targets[0].get("hpAfter", 0)) if not targets.is_empty() else 0,
		"statusId": BattleModel.STATUS_POISON,
		"statusTurns": status_turns,
		"statusPotency": status_potency,
		"statusResult": "applied",
		"statusResultPerTarget": result_per_target,
		"statusChanges": changes,
	}
	if source_kind == "item":
		event["itemId"] = action_id
		event["itemName"] = "敌方毒粉"
		event["remainingItemCount"] = remaining_item_count
	else:
		event["spiritId"] = action_id
		event["skillId"] = action_id
		event["skillName"] = "敌方毒精灵"
	return event


static func _status_apply_event(event_id: String, actor_id: String, target_id: String, status_id: String, turns: int) -> Dictionary:
	return {
		"schemaVersion": 1,
		"eventId": event_id,
		"eventType": "skill_status",
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "pet",
		"targetActorId": target_id,
		"targetKind": "pet",
		"actionId": "pet_sleep_powder",
		"skillId": "pet_sleep_powder",
		"skillName": "催眠粉",
		"statusId": status_id,
		"statusTurns": turns,
		"statusPotency": 0,
		"statusResult": "applied",
		"statusRoll": 0.1,
		"statusChance": 0.8,
		"statusResistance": 0.0,
		"statusChanges": [{
			"actorId": target_id,
			"statusId": status_id,
			"change": "apply",
			"turns": turns,
			"potency": 0,
			"schemaVersion": 1,
		}],
	}


static func _cleanse_event(event_id: String, actor_id: String, target_id: String, removed_status_ids: Array) -> Dictionary:
	var changes: Array[Dictionary] = []
	for status_id_value in removed_status_ids:
		changes.append({
			"actorId": target_id,
			"statusId": str(status_id_value),
			"change": "remove_cleanse",
			"schemaVersion": 1,
		})
	return {
		"schemaVersion": 1,
		"eventId": event_id,
		"eventType": "item_cleanse",
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "pet",
		"targetActorId": target_id,
		"targetKind": "pet",
		"actionId": "item_cleanse_single_5",
		"itemId": "item_cleanse_single_5",
		"itemName": "敌方净化草",
		"statusIds": removed_status_ids.duplicate(),
		"removedStatusIds": removed_status_ids.duplicate(),
		"statusResult": "cleansed",
		"statusChanges": changes,
		"remainingItemCount": 0,
	}


static func _damage_event(event_id: String, actor_id: String, target_id: String, damage: int, hp_before: int, hp_after: int, status_changes: Array, dodged: bool = false) -> Dictionary:
	return {
		"schemaVersion": 2,
		"eventId": event_id,
		"eventType": "basic_attack",
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "player",
		"targetActorId": target_id,
		"targetKind": "pet",
		"actionId": "attack",
		"damage": damage,
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"dodged": dodged,
		"critical": false,
		"counterTriggered": false,
		"defeated": hp_after <= 0,
		"launched": false,
		"statusChanges": status_changes.duplicate(true),
	}


static func _event_list(events: Array, before_state: Dictionary, after_state: Dictionary, turn_seq: int) -> Dictionary:
	for index in range(events.size()):
		if events[index] is Dictionary:
			(events[index] as Dictionary)["sequence"] = index + 1
	return {
		"schemaVersion": 2,
		"kind": "battle_event_list",
		"roomId": "server_status_replay_room",
		"round": 1,
		"turnSeq": turn_seq,
		"events": events,
		"actorsBefore": _server_snapshots(before_state),
		"actors": _server_snapshots(after_state),
	}


static func _server_snapshots(state: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		result.append({
			"actorId": str(actor.get("serverActorId", actor.get("id", ""))),
			"accountId": str(actor.get("serverAccountId", "")),
			"username": str(actor.get("serverUsername", "")),
			"displayName": str(actor.get("name", "")),
			"side": str(actor.get("serverSide", actor.get("side", ""))),
			"kind": str(actor.get("serverKind", actor.get("kind", "player"))),
			"slotId": str(actor.get("slotId", "")),
			"level": int(actor.get("level", 1)),
			"petId": str(actor.get("serverPetId", actor.get("petId", ""))),
			"formId": str(actor.get("formId", "")),
			"hp": int(actor.get("hp", 0)),
			"maxHp": int(actor.get("maxHp", 1)),
			"speed": int(actor.get("quick", 1)),
			"attack": int(actor.get("attack", 1)),
			"defense": int(actor.get("defense", 1)),
			"guarding": bool(actor.get("serverGuarding", false)),
			"defeated": bool(actor.get("serverDefeated", int(actor.get("hp", 0)) <= 0)),
			"escaped": bool(actor.get("escaped", false)),
			"captured": bool(actor.get("captured", false)),
			"actionState": str(actor.get("actionState", "")),
			"launched": bool(actor.get("launched", false)),
			"revivable": bool(actor.get("revivable", true)),
			"activeSkillIds": actor.get("activeSkillIds", []),
			"petSkillSlots": actor.get("petSkillSlots", []),
			"passiveSkillIds": actor.get("passiveSkillIds", []),
			"spiritIds": actor.get("spiritIds", []),
			"statuses": BattleStatusModel.statuses_for(actor),
			"statusResist": (actor.get("statusResist", {}) as Dictionary).duplicate(true) if actor.get("statusResist", {}) is Dictionary else {},
			"statusImmune": (actor.get("statusImmune", {}) as Dictionary).duplicate(true) if actor.get("statusImmune", {}) is Dictionary else {},
			"ridePetInstanceId": str(actor.get("ridePetInstanceId", "")),
			"ridePetName": str(actor.get("ridePetName", "")),
			"ridePetFormId": str(actor.get("ridePetFormId", "")),
			"ridePetLevel": int(actor.get("ridePetLevel", 0)),
			"ridePetHp": int(actor.get("ridePetHp", 0)),
			"ridePetMaxHp": int(actor.get("ridePetMaxHp", 0)),
			"ridePetBattleState": str(actor.get("ridePetBattleState", "")),
		})
	return result


static func _replay_from_final(final_state: Dictionary, event_list: Dictionary) -> Dictionary:
	var rewound := ServerBattleRoomModel.state_at_server_event_list_start(final_state, event_list)
	var local_events := ServerBattleRoomModel.battle_events_from_server_event_list(rewound, event_list)
	var next_state := rewound.duplicate(true)
	var ledgers: Array[Dictionary] = []
	for event in local_events:
		var snapshots := _actor_snapshots(next_state)
		next_state = BattleModel.apply_battle_event(next_state, event)
		ledgers.append(BattleEventLedger.build_from_applied_state(next_state, event, snapshots))
	var facts_before_snapshot := _authoritative_facts(next_state)
	var calibrated := ServerBattleRoomModel.state_with_server_event_actor_snapshot(next_state, event_list)
	return {
		"rewound": rewound,
		"state": next_state,
		"events": local_events,
		"ledgers": ledgers,
		"snapshotNoop": facts_before_snapshot == _authoritative_facts(calibrated),
	}


static func _actor_snapshots(state: Dictionary) -> Dictionary:
	var result := {}
	for value in state.get("actors", []):
		if value is Dictionary:
			var actor := value as Dictionary
			result[str(actor.get("id", ""))] = actor.duplicate(true)
	return result


static func _authoritative_facts(state: Dictionary) -> Dictionary:
	var actor_facts: Array = []
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		actor_facts.append([
			str(actor.get("id", "")),
			str(actor.get("serverActorId", "")),
			str(actor.get("serverPetId", "")),
			str(actor.get("formId", "")),
			int(actor.get("hp", -1)),
			bool(actor.get("serverDefeated", false)),
			bool(actor.get("captured", false)),
			bool(actor.get("launched", false)),
			bool(actor.get("revivable", true)),
			str(actor.get("ridePetInstanceId", "")),
			int(actor.get("ridePetHp", -1)),
			JSON.stringify(BattleStatusModel.statuses_for(actor)),
		])
	return {
		"actors": actor_facts,
		"guarding": (state.get("guardingActorIds", []) as Array).duplicate(),
	}


static func _first_ledger_target(ledger: Dictionary) -> Dictionary:
	var targets: Array = ledger.get("targets", []) if ledger.get("targets", []) is Array else []
	return targets[0] as Dictionary if not targets.is_empty() else {}


static func _status_turns_from_snapshot(value, status_id: String) -> int:
	if not (value is Dictionary):
		return 0
	var status = (value as Dictionary).get(status_id, {})
	return int((status as Dictionary).get("turns", 0)) if status is Dictionary else 0


static func _all_server_resolved(events: Array) -> bool:
	for value in events:
		if not (value is Dictionary) or not bool((value as Dictionary).get("serverResolved", false)):
			return false
	return true
