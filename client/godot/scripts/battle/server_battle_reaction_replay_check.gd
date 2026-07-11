extends RefCounted

const BattleEventLedger := preload("res://scripts/battle/battle_event_ledger.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")


static func run() -> Dictionary:
	var checks := {}

	var dodge_state := _server_state()
	dodge_state = _set_actor_fields(dodge_state, "enemy_front_3", {
		"dodgeRateOverride": 0.0,
		"counterRateOverride": 1.0,
	})
	dodge_state = BattleModel.set_actor_hp(dodge_state, "enemy_front_3", 5)
	var dodge_replay := _replay(dodge_state, _event_list([_damage_event(
		"evt_dodge",
		"basic_attack",
		BattleModel.PLAYER_ACTOR_ID,
		"enemy_front_3",
		0,
		220,
		220,
		{"dodged": true}
	)]))
	var dodge_events: Array = dodge_replay.get("events", [])
	var dodge_steps: Array = dodge_replay.get("steps", [])
	var dodge_event := dodge_events[0] as Dictionary if not dodge_events.is_empty() else {}
	var dodge_step := dodge_steps[0] as Dictionary if not dodge_steps.is_empty() else {}
	checks["dodge_zero_mapping"] = (
		bool(dodge_event.get("serverResolved", false))
		and bool(dodge_event.get("dodged", false))
		and int(dodge_event.get("damage", -1)) == 0
	)
	checks["dodge_exact_before_snapshot"] = (
		int(dodge_step.get("targetHp", -1)) == 220
		and int(dodge_step.get("lastDamage", -1)) == 0
		and bool(dodge_step.get("lastDodged", false))
		and bool(dodge_step.get("counterEventEmpty", false))
		and int(dodge_step.get("ledgerHpBefore", -1)) == 220
		and int(dodge_step.get("ledgerHpAfter", -1)) == 220
	)

	var critical_state := _server_state()
	critical_state = _set_actor_fields(critical_state, BattleModel.PLAYER_PET_ID, {"criticalRateOverride": 0.0})
	critical_state = BattleModel.set_actor_hp(critical_state, "enemy_front_4", 5)
	var critical_replay := _replay(critical_state, _event_list([_damage_event(
		"evt_pet_critical",
		"pet_skill",
		BattleModel.PLAYER_PET_ID,
		"enemy_front_4",
		27,
		220,
		193,
		{
			"critical": true,
			"skillId": "pet_bui_charge",
			"actionId": "pet_bui_charge",
		}
	)]))
	var critical_events: Array = critical_replay.get("events", [])
	var critical_steps: Array = critical_replay.get("steps", [])
	var critical_event := critical_events[0] as Dictionary if not critical_events.is_empty() else {}
	var critical_step := critical_steps[0] as Dictionary if not critical_steps.is_empty() else {}
	checks["critical_final_damage"] = (
		str(critical_event.get("type", "")) == "skill_attack"
		and int(critical_step.get("targetHp", -1)) == 193
		and int(critical_step.get("lastDamage", -1)) == 27
		and bool(critical_step.get("lastCritical", false))
		and bool(critical_step.get("counterEventEmpty", false))
		and int(critical_step.get("ledgerHpBefore", -1)) == 220
		and int(critical_step.get("ledgerHpAfter", -1)) == 193
	)

	var pair_state := _server_state()
	pair_state = _set_actor_fields(pair_state, "enemy_front_3", {
		"dodgeRateOverride": 1.0,
		"criticalRateOverride": 1.0,
		"counterRateOverride": 1.0,
		"actionState": "launched",
		"launched": true,
		"revivable": false,
		"petBattleState": BattleModel.PET_STATE_REST,
		"launchHpBefore": 220,
	})
	pair_state = _set_actor_fields(pair_state, BattleModel.PLAYER_ACTOR_ID, {
		"dodgeRateOverride": 1.0,
		"criticalRateOverride": 1.0,
		"counterRateOverride": 1.0,
		"actionState": "launched",
		"launched": true,
		"revivable": false,
		"launchHpBefore": 160,
		"ridePetInstanceId": "qa_replay_ride",
		"ridePetName": "回放骑宠",
		"ridePetHp": 70,
		"ridePetMaxHp": 80,
		"ridePetBattleState": "riding",
	})
	pair_state = BattleModel.set_actor_hp(pair_state, "enemy_front_3", 5)
	pair_state = BattleModel.set_actor_hp(pair_state, BattleModel.PLAYER_ACTOR_ID, 5)
	var pair_event_list := _event_list([
		_damage_event("evt_primary", "basic_attack", BattleModel.PLAYER_ACTOR_ID, "enemy_front_3", 9, 220, 211, {
			"counterTriggered": true,
		}),
		_damage_event("evt_counter", "counter_attack", "enemy_front_3", BattleModel.PLAYER_ACTOR_ID, 7, 160, 153, {
			"counterSourceEventId": "evt_primary",
			"skillId": "pet_attack",
		}),
	])
	var pair_replay := _replay(pair_state, pair_event_list)
	var pair_events: Array = pair_replay.get("events", [])
	var pair_steps: Array = pair_replay.get("steps", [])
	var pair_ledgers: Array = pair_replay.get("ledgers", [])
	var primary_step := pair_steps[0] as Dictionary if pair_steps.size() > 0 else {}
	var counter_step := pair_steps[1] as Dictionary if pair_steps.size() > 1 else {}
	var counter_event := pair_events[1] as Dictionary if pair_events.size() > 1 else {}
	var counter_ledger := pair_ledgers[1] as Dictionary if pair_ledgers.size() > 1 else {}
	checks["single_layer_counter"] = (
		pair_events.size() == 2
		and str(counter_event.get("type", "")) == "counter_attack"
		and str(counter_event.get("counterSourceEventId", "")) == "evt_primary"
		and str(counter_event.get("skillId", "")) == "pet_attack"
		and str(counter_ledger.get("counterSourceEventId", "")) == "evt_primary"
		and str(counter_ledger.get("skillId", "")) == "pet_attack"
		and int(primary_step.get("targetHp", -1)) == 211
		and int(counter_step.get("targetHp", -1)) == 153
		and int(primary_step.get("ledgerHpBefore", -1)) == 220
		and int(primary_step.get("ledgerHpAfter", -1)) == 211
		and int(counter_step.get("ledgerHpBefore", -1)) == 160
		and int(counter_step.get("ledgerHpAfter", -1)) == 153
		and bool(primary_step.get("lastCounterTriggered", false))
		and not bool(counter_step.get("lastCounterTriggered", true))
		and bool(primary_step.get("counterEventEmpty", false))
		and bool(counter_step.get("counterEventEmpty", false))
	)
	var pair_replay_state := pair_replay.get("state", {}) as Dictionary
	pair_event_list["actors"] = [
		_server_snapshot_for_actor(pair_replay_state, "enemy_front_3"),
		_server_snapshot_for_actor(pair_replay_state, BattleModel.PLAYER_ACTOR_ID),
	]
	var pair_before_calibration := _authoritative_facts_for_actors(pair_replay_state, ["enemy_front_3", BattleModel.PLAYER_ACTOR_ID])
	var pair_calibrated_state := ServerBattleRoomModel.state_with_server_event_actor_snapshot(pair_replay_state, pair_event_list)
	checks["final_snapshot_is_consistency_only"] = (
		pair_before_calibration == _authoritative_facts_for_actors(pair_calibrated_state, ["enemy_front_3", BattleModel.PLAYER_ACTOR_ID])
		and int(BattleModel.actor_by_id(pair_calibrated_state, BattleModel.PLAYER_ACTOR_ID).get("ridePetHp", -1)) == 70
	)

	var five_state := _limited_state_per_side(_server_state(), 5)
	var five_attacker_id := BattleModel.living_ally_id(five_state)
	var five_target_id := BattleModel.living_enemy_id(five_state)
	var five_target := BattleModel.actor_by_id(five_state, five_target_id)
	var five_hp_before := int(five_target.get("hp", 0))
	var five_damage := mini(11, five_hp_before)
	var five_replay := _replay(five_state, _event_list([_damage_event(
		"evt_five_vs_five",
		"basic_attack",
		five_attacker_id,
		five_target_id,
		five_damage,
		five_hp_before,
		five_hp_before - five_damage
	)]))
	var five_final_state := five_replay.get("state", {}) as Dictionary
	checks["five_vs_five_server_event"] = (
		BattleModel.living_actor_count(five_state, BattleModel.SIDE_ALLY) == 5
		and BattleModel.living_actor_count(five_state, BattleModel.SIDE_ENEMY) == 5
		and int(BattleModel.actor_by_id(five_final_state, five_target_id).get("hp", -1)) == five_hp_before - five_damage
	)

	var counter_state := _server_state()
	counter_state = BattleModel.set_actor_hp(counter_state, BattleModel.PLAYER_ACTOR_ID, 5)
	counter_state = BattleModel.set_actor_hp(counter_state, "ally_speed_normal", 5)
	var counter_replay := _replay(counter_state, _event_list([
		_damage_event("evt_counter_dodge", "counter_attack", "enemy_front_3", BattleModel.PLAYER_ACTOR_ID, 0, 160, 160, {
			"dodged": true,
			"counterSourceEventId": "evt_source_dodge",
		}),
		_damage_event("evt_counter_critical", "counter_attack", "enemy_front_4", "ally_speed_normal", 19, 150, 131, {
			"critical": true,
			"counterSourceEventId": "evt_source_critical",
		}),
	]))
	var counter_steps: Array = counter_replay.get("steps", [])
	var counter_dodge_step := counter_steps[0] as Dictionary if counter_steps.size() > 0 else {}
	var counter_critical_step := counter_steps[1] as Dictionary if counter_steps.size() > 1 else {}
	checks["counter_dodge_and_critical"] = (
		int(counter_dodge_step.get("targetHp", -1)) == 160
		and bool(counter_dodge_step.get("lastDodged", false))
		and int(counter_dodge_step.get("lastDamage", -1)) == 0
		and int(counter_dodge_step.get("ledgerHpBefore", -1)) == 160
		and int(counter_dodge_step.get("ledgerHpAfter", -1)) == 160
		and bool(counter_dodge_step.get("counterEventEmpty", false))
		and int(counter_critical_step.get("targetHp", -1)) == 131
		and bool(counter_critical_step.get("lastCritical", false))
		and int(counter_critical_step.get("lastDamage", -1)) == 19
		and int(counter_critical_step.get("ledgerHpBefore", -1)) == 150
		and int(counter_critical_step.get("ledgerHpAfter", -1)) == 131
		and bool(counter_critical_step.get("counterEventEmpty", false))
	)

	var combo_state := _server_state()
	combo_state["targetSeed"] = "local_seed_must_not_matter"
	combo_state = _set_actor_fields(combo_state, "ally_speed_fast", {"criticalRateOverride": 1.0})
	combo_state = _set_actor_fields(combo_state, "enemy_front_4", {
		"dodgeRateOverride": 1.0,
		"counterRateOverride": 1.0,
	})
	combo_state = BattleModel.set_actor_hp(combo_state, "enemy_front_4", 5)
	var combo_event := _damage_event("evt_combo", "combo_attack", "ally_speed_fast", "enemy_front_4", 43, 220, 177)
	combo_event["participantActorIds"] = ["ally_speed_fast", "ally_attack_high"]
	var combo_replay := _replay(combo_state, _event_list([combo_event]))
	var combo_events: Array = combo_replay.get("events", [])
	var combo_steps: Array = combo_replay.get("steps", [])
	var mapped_combo := combo_events[0] as Dictionary if not combo_events.is_empty() else {}
	var combo_step := combo_steps[0] as Dictionary if not combo_steps.is_empty() else {}
	var combo_participants: Array = mapped_combo.get("participantIds", []) if mapped_combo.get("participantIds", []) is Array else []
	checks["combo_no_local_reaction"] = (
		combo_participants.size() == 2
		and int(combo_step.get("targetHp", -1)) == 177
		and int(combo_step.get("lastDamage", -1)) == 43
		and not bool(combo_step.get("lastDodged", true))
		and not bool(combo_step.get("lastCritical", true))
		and bool(combo_step.get("counterEventEmpty", false))
		and int(combo_step.get("ledgerHpBefore", -1)) == 220
		and int(combo_step.get("ledgerHpAfter", -1)) == 177
	)

	var status_replay := _replay(_server_state(), _event_list([{
		"eventId": "evt_enemy_status",
		"eventType": "skill_status",
		"sequence": 1,
		"actorId": "enemy_front_3",
		"targetActorId": BattleModel.PLAYER_PET_ID,
		"actionId": "pet_sleep_powder",
		"skillId": "pet_sleep_powder",
		"statusId": BattleModel.STATUS_SLEEP,
		"statusTurns": 2,
		"statusPotency": 0,
		"statusResult": "applied",
		"statusRoll": 0.1,
		"statusChance": 0.8,
		"statusResistance": 0.0,
	}]))
	var status_events: Array = status_replay.get("events", [])
	var status_state := status_replay.get("state", {}) as Dictionary
	var status_event := status_events[0] as Dictionary if not status_events.is_empty() else {}
	var status_target := BattleModel.actor_by_id(status_state, BattleModel.PLAYER_PET_ID)
	checks["enemy_status_replay"] = (
		bool(status_event.get("serverResolved", false))
		and str(status_state.get("lastStatusResult", "")) == "applied"
		and _actor_has_status(status_target, BattleModel.STATUS_SLEEP)
	)

	var ok := true
	for value in checks.values():
		if not bool(value):
			ok = false
			break
	return {
		"ok": ok,
		"checks": checks,
		"checkCount": checks.size(),
	}


static func _server_state() -> Dictionary:
	var state := BattleModel.create_stat_formula_test_battle({"id": "server_replay", "name": "权威回放"})
	state["serverAuthority"] = true
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		actor["serverActorId"] = str(actor.get("id", ""))
		actor["serverKind"] = str(actor.get("kind", ""))
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


static func _limited_state_per_side(state: Dictionary, limit: int) -> Dictionary:
	var limited_actors: Array = []
	var counts := {BattleModel.SIDE_ALLY: 0, BattleModel.SIDE_ENEMY: 0}
	var actors: Array = state.get("actors", []) if state.get("actors", []) is Array else []
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var side := str(actor.get("side", ""))
		if not counts.has(side) or int(counts.get(side, 0)) >= limit:
			continue
		limited_actors.append(actor.duplicate(true))
		counts[side] = int(counts.get(side, 0)) + 1
	state["actors"] = limited_actors
	return state


static func _damage_event(event_id: String, event_type: String, actor_id: String, target_id: String, damage: int, hp_before: int, hp_after: int, extra: Dictionary = {}) -> Dictionary:
	var event := {
		"eventId": event_id,
		"eventType": event_type,
		"sequence": 1,
		"actorId": actor_id,
		"targetActorId": target_id,
		"actionId": "attack",
		"damage": damage,
		"hpBefore": hp_before,
		"hpAfter": hp_after,
		"dodged": false,
		"critical": false,
		"counterTriggered": false,
		"blocked": false,
		"defeated": hp_after <= 0,
		"launched": false,
	}
	for key in extra.keys():
		event[str(key)] = extra.get(key)
	return event


static func _server_snapshot_for_actor(state: Dictionary, actor_id: String) -> Dictionary:
	var actor := BattleModel.actor_by_id(state, actor_id)
	return {
		"actorId": str(actor.get("serverActorId", actor_id)),
		"accountId": str(actor.get("serverAccountId", "")),
		"username": str(actor.get("serverUsername", "")),
		"displayName": str(actor.get("name", "")),
		"side": str(actor.get("serverSide", actor.get("side", ""))),
		"kind": str(actor.get("serverKind", actor.get("kind", "player"))),
		"petId": str(actor.get("serverPetId", actor.get("petId", ""))),
		"formId": str(actor.get("formId", "")),
		"hp": int(actor.get("hp", 0)),
		"maxHp": int(actor.get("maxHp", 1)),
		"speed": int(actor.get("quick", 1)),
		"attack": int(actor.get("attack", 1)),
		"defense": int(actor.get("defense", 1)),
		"statuses": (actor.get("statuses", {}) as Dictionary).duplicate(true) if actor.get("statuses", {}) is Dictionary else {},
		"statusResist": (actor.get("statusResist", {}) as Dictionary).duplicate(true) if actor.get("statusResist", {}) is Dictionary else {},
		"statusImmune": (actor.get("statusImmune", {}) as Dictionary).duplicate(true) if actor.get("statusImmune", {}) is Dictionary else {},
		"launched": bool(actor.get("launched", false)),
		"revivable": bool(actor.get("revivable", true)),
		"actionState": str(actor.get("actionState", "")),
		"ridePetInstanceId": str(actor.get("ridePetInstanceId", "")),
		"ridePetName": str(actor.get("ridePetName", "")),
		"ridePetHp": int(actor.get("ridePetHp", 0)),
		"ridePetMaxHp": int(actor.get("ridePetMaxHp", 0)),
		"ridePetBattleState": str(actor.get("ridePetBattleState", "")),
	}


static func _authoritative_facts_for_actors(state: Dictionary, actor_ids: Array) -> Array:
	var facts: Array = []
	for actor_id_value in actor_ids:
		var actor := BattleModel.actor_by_id(state, str(actor_id_value))
		facts.append([
			int(actor.get("hp", -1)),
			int(actor.get("maxHp", -1)),
			bool(actor.get("launched", false)),
			bool(actor.get("revivable", true)),
			str(actor.get("petBattleState", "")),
			str(actor.get("ridePetInstanceId", "")),
			int(actor.get("ridePetHp", -1)),
			int(actor.get("ridePetMaxHp", -1)),
			JSON.stringify(actor.get("statuses", {})),
		])
	return facts


static func _event_list(events: Array) -> Dictionary:
	for index in range(events.size()):
		if events[index] is Dictionary:
			(events[index] as Dictionary)["sequence"] = index + 1
	return {
		"schemaVersion": 2,
		"kind": "battle_event_list",
		"roomId": "server_reaction_replay_room",
		"round": 1,
		"turnSeq": 1,
		"events": events,
		"actors": [],
	}


static func _replay(state: Dictionary, event_list: Dictionary) -> Dictionary:
	var local_events := ServerBattleRoomModel.battle_events_from_server_event_list(state, event_list)
	var next_state := ServerBattleRoomModel.state_at_server_event_list_start(state, event_list)
	var steps: Array[Dictionary] = []
	var ledgers: Array[Dictionary] = []
	for event in local_events:
		var snapshots := _actor_snapshots(next_state)
		next_state = BattleModel.apply_battle_event(next_state, event)
		var ledger := BattleEventLedger.build_from_applied_state(next_state, event, snapshots)
		ledgers.append(ledger)
		var counter_event = next_state.get("lastCounterEvent", {})
		var ledger_targets: Array = ledger.get("targets", []) if ledger.get("targets", []) is Array else []
		var ledger_target := ledger_targets[0] as Dictionary if not ledger_targets.is_empty() else {}
		steps.append({
			"targetHp": int(BattleModel.actor_by_id(next_state, str(event.get("targetId", ""))).get("hp", -1)),
			"lastDamage": int(next_state.get("lastDamage", -1)),
			"lastDodged": bool(next_state.get("lastDodged", false)),
			"lastCritical": bool(next_state.get("lastCritical", false)),
			"lastCounterTriggered": bool(next_state.get("lastCounterTriggered", false)),
			"counterEventEmpty": counter_event is Dictionary and (counter_event as Dictionary).is_empty(),
			"ledgerHpBefore": int(ledger_target.get("hpBefore", -1)),
			"ledgerHpAfter": int(ledger_target.get("hpAfter", -1)),
		})
	return {
		"state": next_state,
		"events": local_events,
		"steps": steps,
		"ledgers": ledgers,
	}


static func _actor_snapshots(state: Dictionary) -> Dictionary:
	var snapshots := {}
	var actors: Array = state.get("actors", [])
	for value in actors:
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		var actor_id := str(actor.get("id", ""))
		if actor_id != "":
			snapshots[actor_id] = actor.duplicate(true)
	return snapshots


static func _actor_has_status(actor: Dictionary, status_id: String) -> bool:
	var statuses = actor.get("statuses", {})
	return statuses is Dictionary and (statuses as Dictionary).has(status_id)
