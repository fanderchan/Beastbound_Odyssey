extends RefCounted

const BattleEventLedger := preload("res://scripts/battle/battle_event_ledger.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")

const RIDE_A := "qa_ride_a"
const RIDE_B := "qa_ride_b"
const RIDE_OVERFLOW := "qa_ride_overflow"
const RIDE_SURVIVOR := "qa_ride_survivor"
const RIDE_POISON := "qa_ride_poison"


static func run() -> Dictionary:
	var checks := {}

	var direct_before := _server_state()
	direct_before = _set_actor_fields(direct_before, BattleModel.PLAYER_ACTOR_ID, {
		"hp": 100,
		"maxHp": 100,
		"attack": 82,
		"defense": 48,
		"quick": 94,
	})
	direct_before = _set_ride(direct_before, BattleModel.PLAYER_ACTOR_ID, RIDE_A, 10, 10)
	direct_before = _set_actor_fields(direct_before, "ally_speed_fast", {
		"hp": 100,
		"maxHp": 100,
		"attack": 76,
		"defense": 44,
		"quick": 112,
	})
	direct_before = _set_ride(direct_before, "ally_speed_fast", RIDE_B, 10, 10)
	direct_before = _set_actor_fields(direct_before, "ally_speed_normal", {
		"hp": 100,
		"maxHp": 100,
		"attack": 80,
		"defense": 50,
		"quick": 90,
	})
	direct_before = _set_ride(direct_before, "ally_speed_normal", RIDE_OVERFLOW, 1, 20)
	direct_before = _set_actor_fields(direct_before, "ally_speed_slow", {
		"hp": 2,
		"maxHp": 100,
		"attack": 72,
		"defense": 42,
		"quick": 64,
	})
	direct_before = _set_ride(direct_before, "ally_speed_slow", RIDE_SURVIVOR, 20, 20)

	var direct_events := [
		_direct_damage_event(
			"evt_ride_odd",
			"basic_attack",
			"enemy_front_1",
			BattleModel.PLAYER_ACTOR_ID,
			11,
			5,
			6,
			100,
			95,
			RIDE_A,
			10,
			4
		),
		_direct_damage_event(
			"evt_ride_even",
			"pet_skill",
			"enemy_front_2",
			"ally_speed_fast",
			10,
			5,
			5,
			100,
			95,
			RIDE_B,
			10,
			5
		),
		_direct_damage_event(
			"evt_ride_overflow",
			"combo_attack",
			"enemy_front_3",
			"ally_speed_normal",
			40,
			39,
			1,
			100,
			61,
			RIDE_OVERFLOW,
			1,
			0,
			true,
			false,
			18,
			9,
			70,
			["enemy_front_3", "enemy_front_4"]
		),
		_direct_damage_event(
			"evt_after_ride_knock",
			"counter_attack",
			"enemy_front_4",
			"ally_speed_normal",
			9,
			9,
			0,
			61,
			52,
			RIDE_OVERFLOW,
			0,
			0,
			true,
			false,
			18,
			9,
			70
		),
		_direct_damage_event(
			"evt_actor_first_launch",
			"basic_attack",
			"enemy_front_5",
			"ally_speed_slow",
			11,
			5,
			6,
			2,
			0,
			RIDE_SURVIVOR,
			20,
			14,
			false,
			true,
			72,
			42,
			64
		),
	]
	var direct_final := direct_before.duplicate(true)
	direct_final = _set_actor_fields(direct_final, BattleModel.PLAYER_ACTOR_ID, {
		"hp": 95,
		"ridePetHp": 4,
		"ridePetKnocked": false,
		"ridePetBattleState": "riding",
	})
	direct_final = _set_actor_fields(direct_final, "ally_speed_fast", {
		"hp": 95,
		"ridePetHp": 5,
		"ridePetKnocked": false,
		"ridePetBattleState": "riding",
	})
	direct_final = _set_actor_fields(direct_final, "ally_speed_normal", {
		"hp": 52,
		"attack": 18,
		"defense": 9,
		"quick": 70,
		"ridePetHp": 0,
		"ridePetKnocked": true,
		"ridePetBattleState": BattleModel.PET_STATE_REST,
	})
	direct_final = _set_actor_fields(direct_final, "ally_speed_slow", {
		"hp": 0,
		"ridePetHp": 14,
		"ridePetKnocked": false,
		"ridePetBattleState": "riding",
		"serverDefeated": true,
		"launched": true,
		"revivable": false,
	})
	var direct_party_before = direct_before.get("petParty", []).duplicate(true)
	var direct_replay := _replay_from_final(
		direct_final,
		_event_list(direct_events, direct_before, direct_final, 21)
	)
	var direct_state := direct_replay.get("state", {}) as Dictionary
	var mapped_direct_events: Array = direct_replay.get("events", [])
	var direct_ledgers: Array = direct_replay.get("ledgers", [])
	var odd_target := BattleModel.actor_by_id(direct_state, BattleModel.PLAYER_ACTOR_ID)
	var even_target := BattleModel.actor_by_id(direct_state, "ally_speed_fast")
	var overflow_target := BattleModel.actor_by_id(direct_state, "ally_speed_normal")
	var survivor_target := BattleModel.actor_by_id(direct_state, "ally_speed_slow")
	var rewound_overflow := BattleModel.actor_by_id(direct_replay.get("rewound", {}) as Dictionary, "ally_speed_normal")

	checks["actors_before_restores_live_ride"] = (
		str(rewound_overflow.get("ridePetInstanceId", "")) == RIDE_OVERFLOW
		and int(rewound_overflow.get("ridePetHp", -1)) == 1
		and int(rewound_overflow.get("ridePetMaxHp", -1)) == 20
		and str(rewound_overflow.get("ridePetBattleState", "")) == "riding"
		and not bool(rewound_overflow.get("ridePetKnocked", true))
		and int(rewound_overflow.get("attack", -1)) == 80
		and int(rewound_overflow.get("defense", -1)) == 50
		and int(rewound_overflow.get("quick", -1)) == 90
	)
	checks["odd_and_even_exact_server_split"] = (
		mapped_direct_events.size() == 5
		and int((mapped_direct_events[0] as Dictionary).get("serverActorDamage", -1)) == 5
		and int((mapped_direct_events[0] as Dictionary).get("serverRideDamage", -1)) == 6
		and int((mapped_direct_events[1] as Dictionary).get("serverActorDamage", -1)) == 5
		and int((mapped_direct_events[1] as Dictionary).get("serverRideDamage", -1)) == 5
		and int(odd_target.get("hp", -1)) == 95
		and int(odd_target.get("ridePetHp", -1)) == 4
		and int(even_target.get("hp", -1)) == 95
		and int(even_target.get("ridePetHp", -1)) == 5
	)
	checks["ride_hp_one_overflow_conserves_damage"] = (
		int((mapped_direct_events[2] as Dictionary).get("damage", -1)) == 40
		and int((mapped_direct_events[2] as Dictionary).get("serverActorDamage", -1)) == 39
		and int((mapped_direct_events[2] as Dictionary).get("serverRideDamage", -1)) == 1
		and 39 + 1 == 40
		and str(overflow_target.get("ridePetInstanceId", "")) == RIDE_OVERFLOW
		and int(overflow_target.get("ridePetHp", -1)) == 0
		and int(overflow_target.get("ridePetMaxHp", -1)) == 20
		and str(overflow_target.get("ridePetBattleState", "")) == BattleModel.PET_STATE_REST
		and bool(overflow_target.get("ridePetKnocked", false))
	)
	checks["knocked_ride_stays_zero_on_later_hit"] = (
		int((mapped_direct_events[3] as Dictionary).get("serverActorDamage", -1)) == 9
		and int((mapped_direct_events[3] as Dictionary).get("serverRideDamage", -1)) == 0
		and int(overflow_target.get("hp", -1)) == 52
		and int(overflow_target.get("ridePetHp", -1)) == 0
		and int(overflow_target.get("attack", -1)) == 18
		and int(overflow_target.get("defense", -1)) == 9
		and int(overflow_target.get("quick", -1)) == 70
	)
	checks["actor_down_and_launched_before_ride"] = (
		int(survivor_target.get("hp", -1)) == 0
		and bool(survivor_target.get("serverDefeated", false))
		and bool(survivor_target.get("launched", false))
		and not bool(survivor_target.get("revivable", true))
		and str(survivor_target.get("ridePetInstanceId", "")) == RIDE_SURVIVOR
		and int(survivor_target.get("ridePetHp", -1)) == 14
		and str(survivor_target.get("ridePetBattleState", "")) == "riding"
		and not bool(survivor_target.get("ridePetKnocked", true))
	)
	checks["direct_types_and_n_target_order"] = (
		_event_type_sequence(mapped_direct_events) == ["attack", "skill_attack", "combo_attack", "counter_attack", "attack"]
		and _target_sequence(mapped_direct_events) == [
			BattleModel.PLAYER_ACTOR_ID,
			"ally_speed_fast",
			"ally_speed_normal",
			"ally_speed_normal",
			"ally_speed_slow",
		]
		and _sequence_values(mapped_direct_events) == [1, 2, 3, 4, 5]
		and _all_server_resolved(mapped_direct_events)
	)

	var odd_ledger := direct_ledgers[0] as Dictionary if direct_ledgers.size() > 0 else {}
	var overflow_ledger := direct_ledgers[2] as Dictionary if direct_ledgers.size() > 2 else {}
	var later_ledger := direct_ledgers[3] as Dictionary if direct_ledgers.size() > 3 else {}
	var odd_ledger_target := _ledger_target(odd_ledger, BattleModel.PLAYER_ACTOR_ID)
	var overflow_ledger_target := _ledger_target(overflow_ledger, "ally_speed_normal")
	var later_ledger_target := _ledger_target(later_ledger, "ally_speed_normal")
	checks["ledger_keeps_exact_ride_facts"] = (
		int((odd_ledger.get("actorDamagePerTarget", {}) as Dictionary).get(BattleModel.PLAYER_ACTOR_ID, -1)) == 5
		and int((odd_ledger.get("rideDamagePerTarget", {}) as Dictionary).get(BattleModel.PLAYER_ACTOR_ID, -1)) == 6
		and int(odd_ledger_target.get("actorDamage", -1)) == 5
		and int(odd_ledger_target.get("rideDamage", -1)) == 6
		and str(odd_ledger_target.get("ridePetInstanceIdBefore", "")) == RIDE_A
		and str(odd_ledger_target.get("ridePetInstanceIdAfter", "")) == RIDE_A
		and int(odd_ledger_target.get("rideHpBefore", -1)) == 10
		and int(odd_ledger_target.get("rideHpAfter", -1)) == 4
		and int(odd_ledger_target.get("rideMaxHpBefore", -1)) == 10
		and int(odd_ledger_target.get("rideMaxHpAfter", -1)) == 10
		and str(odd_ledger_target.get("rideStateBefore", "")) == "riding"
		and str(odd_ledger_target.get("rideStateAfter", "")) == "riding"
		and not bool(odd_ledger_target.get("ridePetKnockedAfter", true))
		and int(overflow_ledger_target.get("rideHpBefore", -1)) == 1
		and int(overflow_ledger_target.get("rideHpAfter", -1)) == 0
		and str(overflow_ledger_target.get("rideStateAfter", "")) == BattleModel.PET_STATE_REST
		and bool(overflow_ledger_target.get("ridePetKnockedAfter", false))
		and int(later_ledger_target.get("rideHpBefore", -1)) == 0
		and int(later_ledger_target.get("rideHpAfter", -1)) == 0
		and int(later_ledger_target.get("actorDamage", -1)) == 9
		and int(later_ledger_target.get("rideDamage", -1)) == 0
	)
	checks["ride_never_enters_pet_party"] = (
		direct_state.get("petParty", []) == direct_party_before
		and not _pet_party_contains_any_ride(direct_state, [RIDE_A, RIDE_B, RIDE_OVERFLOW, RIDE_SURVIVOR])
	)

	var poison_before := _server_state()
	poison_before = _set_actor_fields(poison_before, "ally_attack_high", {
		"hp": 50,
		"maxHp": 100,
		"attack": 74,
		"defense": 46,
		"quick": 72,
	})
	poison_before = _set_ride(poison_before, "ally_attack_high", RIDE_POISON, 12, 12)
	var poison_applied_status := _poison_status(2, 4, "enemy_back_1")
	var poison_tick_status := _poison_status(1, 4, "enemy_back_1")
	var poison_after_item := poison_before.duplicate(true)
	poison_after_item = _set_actor_fields(poison_after_item, "ally_attack_high", {
		"hp": 47,
		"statuses": {BattleModel.STATUS_POISON: poison_applied_status},
	})
	var poison_final := poison_after_item.duplicate(true)
	poison_final = _set_actor_fields(poison_final, "ally_attack_high", {
		"hp": 43,
		"statuses": {BattleModel.STATUS_POISON: poison_tick_status},
	})
	var poison_events := [
		_poison_item_event(
			"evt_ride_poison_item",
			"enemy_back_1",
			"ally_attack_high",
			50,
			47,
			3,
			RIDE_POISON,
			12,
			poison_applied_status
		),
		_poison_tick_event(
			"evt_ride_poison_tick",
			"ally_attack_high",
			"enemy_back_1",
			47,
			43,
			4,
			RIDE_POISON,
			12,
			poison_applied_status,
			poison_tick_status
		),
	]
	var poison_party_before = poison_before.get("petParty", []).duplicate(true)
	var poison_replay := _replay_from_final(
		poison_final,
		_event_list(poison_events, poison_before, poison_final, 22)
	)
	var poison_state := poison_replay.get("state", {}) as Dictionary
	var poison_target := BattleModel.actor_by_id(poison_state, "ally_attack_high")
	var mapped_poison_events: Array = poison_replay.get("events", [])
	var poison_ledgers: Array = poison_replay.get("ledgers", [])
	var poison_item_ledger := poison_ledgers[0] as Dictionary if poison_ledgers.size() > 0 else {}
	var poison_tick_ledger := poison_ledgers[1] as Dictionary if poison_ledgers.size() > 1 else {}
	var poison_item_target := _ledger_target(poison_item_ledger, "ally_attack_high")
	var poison_tick_target := _ledger_target(poison_tick_ledger, "ally_attack_high")
	checks["poison_immediate_and_tick_never_split"] = (
		mapped_poison_events.size() == 2
		and _all_server_resolved(mapped_poison_events)
		and int((mapped_poison_events[0] as Dictionary).get("serverActorDamage", -1)) == 3
		and int((mapped_poison_events[0] as Dictionary).get("serverRideDamage", -1)) == 0
		and int((mapped_poison_events[1] as Dictionary).get("serverActorDamage", -1)) == 4
		and int((mapped_poison_events[1] as Dictionary).get("serverRideDamage", -1)) == 0
		and int(poison_target.get("hp", -1)) == 43
		and int(poison_target.get("ridePetHp", -1)) == 12
		and str(poison_target.get("ridePetInstanceId", "")) == RIDE_POISON
		and BattleStatusModel.status_turns(poison_target, BattleModel.STATUS_POISON) == 1
		and int(poison_item_target.get("actorDamage", -1)) == 3
		and int(poison_item_target.get("rideDamage", -1)) == 0
		and int(poison_item_target.get("rideHpBefore", -1)) == 12
		and int(poison_item_target.get("rideHpAfter", -1)) == 12
		and int(poison_tick_target.get("actorDamage", -1)) == 4
		and int(poison_tick_target.get("rideDamage", -1)) == 0
		and int(poison_tick_target.get("rideHpBefore", -1)) == 12
		and int(poison_tick_target.get("rideHpAfter", -1)) == 12
	)
	checks["poison_replay_keeps_pet_party"] = (
		poison_state.get("petParty", []) == poison_party_before
		and not _pet_party_contains_any_ride(poison_state, [RIDE_POISON])
	)
	checks["final_actor_snapshots_are_noop"] = (
		bool(direct_replay.get("snapshotNoop", false))
		and bool(poison_replay.get("snapshotNoop", false))
	)

	var ok := true
	for value in checks.values():
		if not bool(value):
			ok = false
			break
	return {"ok": ok, "checks": checks, "checkCount": checks.size()}


static func _server_state() -> Dictionary:
	var state := BattleModel.create_stat_formula_test_battle({"id": "server_ride_replay", "name": "骑宠权威回放"})
	state["serverAuthority"] = true
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		actor["serverActorId"] = str(actor.get("id", ""))
		actor["serverAccountId"] = "account_%s" % str(actor.get("id", ""))
		actor["serverUsername"] = "user_%s" % str(actor.get("id", ""))
		actor["serverSide"] = str(actor.get("side", ""))
		actor["serverKind"] = str(actor.get("kind", ""))
		actor["serverPetId"] = str(actor.get("petId", actor.get("id", ""))) if str(actor.get("kind", "")) == "pet" or str(actor.get("kind", "")) == "wild_pet" else ""
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


static func _set_ride(state: Dictionary, actor_id: String, ride_id: String, ride_hp: int, ride_max_hp: int) -> Dictionary:
	return _set_actor_fields(state, actor_id, {
		"ridePetInstanceId": ride_id,
		"ridePetName": "回放骑宠%s" % ride_id,
		"ridePetFormId": "starter_tiger",
		"ridePetLevel": 20,
		"ridePetHp": ride_hp,
		"ridePetMaxHp": ride_max_hp,
		"ridePetBattleState": BattleModel.PET_STATE_REST if ride_hp <= 0 else "riding",
		"ridePetKnocked": ride_hp <= 0,
	})


static func _direct_damage_event(event_id: String, event_type: String, actor_id: String, target_id: String, damage: int, actor_damage: int, ride_damage: int, hp_before: int, hp_after: int, ride_id: String, ride_hp_before: int, ride_hp_after: int, ride_knocked: bool = false, launched: bool = false, attack_after: int = -1, defense_after: int = -1, speed_after: int = -1, participant_ids: Array = []) -> Dictionary:
	var event := {
		"schemaVersion": 3,
		"eventId": event_id,
		"eventType": event_type,
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "wild_pet",
		"targetActorId": target_id,
		"targetKind": "player",
		"actionId": "pet_bui_charge" if event_type == "pet_skill" else "attack",
		"skillId": "pet_bui_charge" if event_type == "pet_skill" else "",
		"damage": damage,
		"actorDamage": actor_damage,
		"rideDamage": ride_damage,
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"ridePetInstanceId": ride_id,
		"ridePetName": "回放骑宠%s" % ride_id,
		"ridePetFormId": "starter_tiger",
		"ridePetLevel": 20,
		"ridePetMaxHp": 20 if ride_id == RIDE_OVERFLOW or ride_id == RIDE_SURVIVOR else 10,
		"rideHpBefore": ride_hp_before,
		"rideHpAfter": ride_hp_after,
		"ridePetKnocked": ride_knocked,
		"rideActiveAfter": not ride_knocked and ride_hp_after > 0,
		"ridePetBattleStateAfter": BattleModel.PET_STATE_REST if ride_knocked else "riding",
		"dodged": false,
		"critical": false,
		"counterTriggered": event_type == "counter_attack",
		"defeated": hp_after <= 0,
		"launched": launched,
		"statusChanges": [],
	}
	if attack_after >= 0:
		event["attackAfter"] = attack_after
	if defense_after >= 0:
		event["defenseAfter"] = defense_after
	if speed_after >= 0:
		event["speedAfter"] = speed_after
	if event_type == "combo_attack":
		event["participantActorIds"] = participant_ids.duplicate()
	if event_type == "counter_attack":
		event["counterSourceEventId"] = "evt_ride_overflow"
	return event


static func _poison_item_event(event_id: String, actor_id: String, target_id: String, hp_before: int, hp_after: int, damage: int, ride_id: String, ride_hp: int, status_after: Dictionary) -> Dictionary:
	var target_fact := {
		"targetActorId": target_id,
		"targetKind": "player",
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"damage": damage,
		"actorDamage": damage,
		"rideDamage": 0,
		"ridePetInstanceId": ride_id,
		"ridePetName": "回放骑宠%s" % ride_id,
		"ridePetFormId": "starter_tiger",
		"ridePetLevel": 20,
		"ridePetMaxHp": 12,
		"rideHpBefore": ride_hp,
		"rideHpAfter": ride_hp,
		"ridePetKnocked": false,
		"rideActiveAfter": true,
		"ridePetBattleStateAfter": "riding",
		"defeated": false,
		"statusResult": "applied",
	}
	return {
		"schemaVersion": 3,
		"eventId": event_id,
		"eventType": "item_poison",
		"sequence": 1,
		"actorId": actor_id,
		"actorKind": "wild_pet",
		"targetActorId": target_id,
		"targetKind": "player",
		"targetActorIds": [target_id],
		"targets": [target_fact],
		"actionId": "item_poison_single_5",
		"itemId": "item_poison_single_5",
		"itemName": "敌方毒粉",
		"damage": damage,
		"actorDamage": damage,
		"rideDamage": 0,
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"ridePetInstanceId": ride_id,
		"ridePetName": "回放骑宠%s" % ride_id,
		"ridePetFormId": "starter_tiger",
		"ridePetLevel": 20,
		"ridePetMaxHp": 12,
		"rideHpBefore": ride_hp,
		"rideHpAfter": ride_hp,
		"ridePetKnocked": false,
		"rideActiveAfter": true,
		"ridePetBattleStateAfter": "riding",
		"statusId": BattleModel.STATUS_POISON,
		"statusTurns": 2,
		"statusPotency": 4,
		"statusResult": "applied",
		"sourceActorId": actor_id,
		"statusChanges": [{
			"actorId": target_id,
			"statusId": BattleModel.STATUS_POISON,
			"change": "apply",
			"turns": 2,
			"potency": 4,
			"statusBefore": null,
			"statusAfter": status_after.duplicate(true),
			"schemaVersion": 1,
		}],
		"remainingItemCount": 0,
		"defeated": false,
	}


static func _poison_tick_event(event_id: String, target_id: String, source_actor_id: String, hp_before: int, hp_after: int, damage: int, ride_id: String, ride_hp: int, status_before: Dictionary, status_after: Dictionary) -> Dictionary:
	return {
		"schemaVersion": 3,
		"eventId": event_id,
		"eventType": "status_tick",
		"sequence": 1,
		"actorId": target_id,
		"actorKind": "player",
		"targetActorId": target_id,
		"targetKind": "player",
		"sourceActorId": source_actor_id,
		"statusId": BattleModel.STATUS_POISON,
		"statusResult": "tick",
		"statusBefore": status_before.duplicate(true),
		"statusAfter": status_after.duplicate(true),
		"fromTurns": 2,
		"toTurns": 1,
		"statusChanges": [{
			"actorId": target_id,
			"statusId": BattleModel.STATUS_POISON,
			"change": "decrement",
			"fromTurns": 2,
			"toTurns": 1,
			"statusBefore": status_before.duplicate(true),
			"statusAfter": status_after.duplicate(true),
			"schemaVersion": 1,
		}],
		"damage": damage,
		"actorDamage": damage,
		"rideDamage": 0,
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"ridePetInstanceId": ride_id,
		"ridePetName": "回放骑宠%s" % ride_id,
		"ridePetFormId": "starter_tiger",
		"ridePetLevel": 20,
		"ridePetMaxHp": 12,
		"rideHpBefore": ride_hp,
		"rideHpAfter": ride_hp,
		"ridePetKnocked": false,
		"rideActiveAfter": true,
		"ridePetBattleStateAfter": "riding",
		"defeated": false,
		"launched": false,
		"dodged": false,
		"critical": false,
		"counterTriggered": false,
	}


static func _poison_status(turns: int, potency: int, source_id: String) -> Dictionary:
	return {
		"id": BattleModel.STATUS_POISON,
		"label": BattleStatusModel.status_label(BattleModel.STATUS_POISON),
		"turns": turns,
		"potency": potency,
		"sourceId": source_id,
	}


static func _event_list(events: Array, before_state: Dictionary, after_state: Dictionary, turn_seq: int) -> Dictionary:
	for index in range(events.size()):
		if events[index] is Dictionary:
			(events[index] as Dictionary)["sequence"] = index + 1
	return {
		"schemaVersion": 3,
		"kind": "battle_event_list",
		"roomId": "server_ride_replay_room",
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
			"ridePetKnocked": bool(actor.get("ridePetKnocked", false)),
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
			int(actor.get("hp", -1)),
			int(actor.get("maxHp", -1)),
			int(actor.get("attack", -1)),
			int(actor.get("defense", -1)),
			int(actor.get("quick", -1)),
			bool(actor.get("serverDefeated", false)),
			bool(actor.get("launched", false)),
			bool(actor.get("revivable", true)),
			str(actor.get("ridePetInstanceId", "")),
			str(actor.get("ridePetName", "")),
			str(actor.get("ridePetFormId", "")),
			int(actor.get("ridePetLevel", 0)),
			int(actor.get("ridePetHp", -1)),
			int(actor.get("ridePetMaxHp", -1)),
			str(actor.get("ridePetBattleState", "")),
			bool(actor.get("ridePetKnocked", false)),
			JSON.stringify(BattleStatusModel.statuses_for(actor)),
		])
	return {
		"actors": actor_facts,
		"petParty": state.get("petParty", []).duplicate(true),
	}


static func _ledger_target(ledger: Dictionary, target_id: String) -> Dictionary:
	var targets: Array = ledger.get("targets", []) if ledger.get("targets", []) is Array else []
	for value in targets:
		if value is Dictionary and str((value as Dictionary).get("targetId", "")) == target_id:
			return value as Dictionary
	return {}


static func _event_type_sequence(events: Array) -> Array[String]:
	var result: Array[String] = []
	for value in events:
		if value is Dictionary:
			result.append(str((value as Dictionary).get("type", "")))
	return result


static func _target_sequence(events: Array) -> Array[String]:
	var result: Array[String] = []
	for value in events:
		if value is Dictionary:
			result.append(str((value as Dictionary).get("targetId", "")))
	return result


static func _sequence_values(events: Array) -> Array[int]:
	var result: Array[int] = []
	for value in events:
		if value is Dictionary:
			result.append(int((value as Dictionary).get("sequence", 0)))
	return result


static func _all_server_resolved(events: Array) -> bool:
	for value in events:
		if not (value is Dictionary) or not bool((value as Dictionary).get("serverResolved", false)):
			return false
	return true


static func _pet_party_contains_any_ride(state: Dictionary, ride_ids: Array) -> bool:
	for value in state.get("petParty", []):
		if not (value is Dictionary):
			continue
		var entry := value as Dictionary
		for ride_id_value in ride_ids:
			var ride_id := str(ride_id_value)
			if str(entry.get("petId", "")) == ride_id or str(entry.get("instanceId", "")) == ride_id or str(entry.get("actorId", "")) == ride_id:
				return true
	return false
