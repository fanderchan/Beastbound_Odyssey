extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const SIDE_ALLY := "ally"
const SIDE_ENEMY := "enemy"
const ROW_FRONT := "front"
const ROW_BACK := "back"
const SLOTS_PER_ROW := 5
const PLAYER_ACTOR_ID := "ally_player"
const PLAYER_PET_ID := "ally_pet"
const SPIRIT_GRACE_ALL := "spirit_grace_5"
const SPIRIT_MOIST_SINGLE := "spirit_moist_5"
const SPIRIT_POISON_SINGLE := "spirit_poison_5"
const SPIRIT_POISON_ALL := "spirit_poison_mist_5"
const PET_SKILL_ATTACK := "pet_attack"
const PET_SKILL_DEFEND := "pet_defend"
const PET_SKILL_BUI_CHARGE := "pet_bui_charge"
const ITEM_HEAL_ALL := "item_heal_all_5"
const ITEM_HEAL_SINGLE := "item_heal_single_5"
const ITEM_POISON_SINGLE := "item_poison_single_5"
const ITEM_POISON_ALL := "item_poison_all_5"
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"


static func create_wild_battle(encounter_zone: Dictionary) -> Dictionary:
	var zone_name := str(encounter_zone.get("name", "野外"))
	var state := {
		"id": "local_wild_battle",
		"round": 1,
		"phase": "command",
		"sourceZoneId": str(encounter_zone.get("id", "")),
		"targetSeed": "local_wild_battle",
		"message": "%s 出现了野生乌力。" % zone_name,
		"itemBag": default_item_bag(),
		"guardingActorIds": [],
		"actors": [
			_make_actor("ally_player", "见习猎人", SIDE_ALLY, "player", "ally.back.3", 120, 120, 70, 18),
			_make_actor("ally_pet", "小布伊", SIDE_ALLY, "pet", "ally.front.3", 90, 90, 68, 14),
			_make_actor("enemy_0", "野生乌力", SIDE_ENEMY, "wild_pet", "enemy.front.3", 80, 80, 48, 10),
		],
	}
	return _with_default_player_pet_party(state)


static func default_item_bag() -> Dictionary:
	return {
		ITEM_HEAL_ALL: 2,
		ITEM_HEAL_SINGLE: 2,
		ITEM_POISON_SINGLE: 2,
		ITEM_POISON_ALL: 2,
	}


static func create_formation_preview_battle(encounter_zone: Dictionary) -> Dictionary:
	var state := create_wild_battle(encounter_zone)
	state["id"] = "local_formation_preview_battle"
	state["message"] = "双方阵型展开。"
	state["actors"] = _formation_preview_actors()
	return _with_default_player_pet_party(state)


static func create_stat_formula_test_battle(encounter_zone: Dictionary) -> Dictionary:
	var zone_name := str(encounter_zone.get("name", "野外"))
	var state := {
		"id": "local_stat_formula_test_battle",
		"round": 1,
		"phase": "command",
		"sourceZoneId": str(encounter_zone.get("id", "")),
		"targetSeed": "stat_formula_test",
		"message": "%s 数值验证战斗。旁路日志会记录速度和伤害公式。" % zone_name,
		"itemBag": default_item_bag(),
		"guardingActorIds": [],
		"actors": _stat_formula_test_actors(),
	}
	return _with_default_player_pet_party(state)


static func _formation_preview_actors() -> Array[Dictionary]:
	var actors: Array[Dictionary] = []
	for slot in range(1, SLOTS_PER_ROW + 1):
		actors.append(_make_actor(
			"enemy_back_%d" % slot,
			"乌力后%d" % slot,
			SIDE_ENEMY,
			"wild_pet",
			slot_id(SIDE_ENEMY, ROW_BACK, slot),
			72,
			72,
			70 + slot * 3,
			5
		))
	for slot in range(1, SLOTS_PER_ROW + 1):
		actors.append(_make_actor(
			"enemy_front_%d" % slot,
			"乌力前%d" % slot,
			SIDE_ENEMY,
			"wild_pet",
			slot_id(SIDE_ENEMY, ROW_FRONT, slot),
			80,
			80,
			46 + slot * 4,
			5
		))
	for slot in range(1, SLOTS_PER_ROW + 1):
		var actor_id := "ally_front_%d" % slot
		var actor_name := "布伊%d" % slot
		if slot == 3:
			actor_id = PLAYER_PET_ID
			actor_name = "小布伊"
		actors.append(_make_actor(
			actor_id,
			actor_name,
			SIDE_ALLY,
			"pet",
			slot_id(SIDE_ALLY, ROW_FRONT, slot),
			90,
			90,
			58 + slot * 5,
			14
		))
	for slot in range(1, SLOTS_PER_ROW + 1):
		var actor_id := "ally_back_%d" % slot
		var actor_name := "猎人%d" % slot
		var actor_kind := "player"
		if slot == 3:
			actor_id = "ally_player"
			actor_name = "见习猎人"
		actors.append(_make_actor(
			actor_id,
			actor_name,
			SIDE_ALLY,
			actor_kind,
			slot_id(SIDE_ALLY, ROW_BACK, slot),
			120,
			120,
			52 + slot * 6,
			18
		))
	return actors


static func _stat_formula_test_actors() -> Array[Dictionary]:
	return [
		_make_actor("enemy_back_1", "高速乌力", SIDE_ENEMY, "wild_pet", "enemy.back.1", 170, 170, 118, 13, 8),
		_make_actor("enemy_back_2", "普通乌力", SIDE_ENEMY, "wild_pet", "enemy.back.2", 170, 170, 62, 12, 8),
		_make_actor("enemy_back_3", "慢速乌力", SIDE_ENEMY, "wild_pet", "enemy.back.3", 170, 170, 22, 12, 8),
		_make_actor("enemy_back_4", "厚皮乌力", SIDE_ENEMY, "wild_pet", "enemy.back.4", 190, 190, 48, 10, 32),
		_make_actor("enemy_back_5", "普通乌力B", SIDE_ENEMY, "wild_pet", "enemy.back.5", 170, 170, 54, 11, 8),
		_make_actor("enemy_front_1", "快乌力", SIDE_ENEMY, "wild_pet", "enemy.front.1", 160, 160, 96, 12, 7),
		_make_actor("enemy_front_2", "普通靶乌力", SIDE_ENEMY, "wild_pet", "enemy.front.2", 190, 190, 50, 10, 8),
		_make_actor("enemy_front_3", "低防乌力", SIDE_ENEMY, "wild_pet", "enemy.front.3", 220, 220, 46, 10, 2),
		_make_actor("enemy_front_4", "高防乌力", SIDE_ENEMY, "wild_pet", "enemy.front.4", 220, 220, 46, 10, 34),
		_make_actor("enemy_front_5", "慢乌力", SIDE_ENEMY, "wild_pet", "enemy.front.5", 160, 160, 18, 10, 8),
		_make_actor("ally_front_1", "高速布伊", SIDE_ALLY, "pet", "ally.front.1", 130, 130, 110, 15, 7),
		_make_actor("ally_front_2", "普通布伊", SIDE_ALLY, "pet", "ally.front.2", 130, 130, 62, 15, 7),
		_make_actor(PLAYER_PET_ID, "我的布伊", SIDE_ALLY, "pet", "ally.front.3", 140, 140, 72, 18, 8),
		_make_actor("ally_front_4", "厚皮布伊", SIDE_ALLY, "pet", "ally.front.4", 150, 150, 45, 14, 28),
		_make_actor("ally_front_5", "慢速布伊", SIDE_ALLY, "pet", "ally.front.5", 130, 130, 24, 15, 7),
		_make_actor("ally_speed_fast", "高速猎人", SIDE_ALLY, "player", "ally.back.1", 150, 150, 130, 18, 9),
		_make_actor("ally_speed_normal", "普通猎人", SIDE_ALLY, "player", "ally.back.2", 150, 150, 70, 18, 9),
		_make_actor(PLAYER_ACTOR_ID, "我本人", SIDE_ALLY, "player", "ally.back.3", 160, 160, 72, 22, 10),
		_make_actor("ally_speed_slow", "慢速猎人", SIDE_ALLY, "player", "ally.back.4", 150, 150, 24, 18, 9),
		_make_actor("ally_attack_high", "高攻猎人", SIDE_ALLY, "player", "ally.back.5", 150, 150, 66, 36, 9),
	]


static func _make_actor(actor_id: String, actor_name: String, side: String, kind: String, slot_id: String, hp: int, max_hp: int, quick: int = 50, attack_power: int = 12, defense_power: int = 6) -> Dictionary:
	return {
		"id": actor_id,
		"name": actor_name,
		"side": side,
		"kind": kind,
		"slotId": slot_id,
		"hp": hp,
		"maxHp": max_hp,
		"quick": quick,
		"attack": attack_power,
		"defense": defense_power,
		"catchable": side == SIDE_ENEMY and kind == "wild_pet",
		"captureDifficulty": 42,
		"actionState": "idle",
		"petBattleState": "battle" if kind == "pet" or kind == "wild_pet" else "",
	}


static func _with_default_player_pet_party(state: Dictionary) -> Dictionary:
	var active_pet := actor_by_id(state, PLAYER_PET_ID)
	if active_pet.is_empty():
		active_pet = actor_by_id(state, "ally_front_3")
	state["petParty"] = default_player_pet_party(active_pet)
	return state


static func default_player_pet_party(active_pet: Dictionary = {}) -> Array[Dictionary]:
	var active_name := str(active_pet.get("name", "小布伊"))
	var active_hp := int(active_pet.get("hp", 90))
	var active_max_hp := int(active_pet.get("maxHp", max(active_hp, 90)))
	var active_quick := int(active_pet.get("quick", 68))
	var active_attack := int(active_pet.get("attack", 14))
	var active_defense := int(active_pet.get("defense", 8))
	return [
		_make_pet_party_entry("pet_bui_main", active_name, "bui", active_hp, active_max_hp, active_quick, active_attack, active_defense, PET_STATE_BATTLE, PLAYER_PET_ID),
		_make_pet_party_entry("pet_bui_speed", "迅捷布伊", "bui_speed", 112, 112, 98, 16, 6, PET_STATE_STANDBY, ""),
		_make_pet_party_entry("pet_bui_tough", "厚皮布伊", "bui_tough", 170, 170, 42, 15, 30, PET_STATE_STANDBY, ""),
		_make_pet_party_entry("pet_bui_rest", "休息布伊", "bui_rest", 0, 130, 50, 15, 8, PET_STATE_REST, ""),
	]


static func _make_pet_party_entry(pet_id: String, pet_name: String, template_id: String, hp: int, max_hp: int, quick: int, attack_power: int, defense_power: int, state: String, actor_id: String) -> Dictionary:
	return {
		"petId": pet_id,
		"templateId": template_id,
		"actorId": actor_id,
		"name": pet_name,
		"state": state,
		"hp": clampi(hp, 0, max_hp),
		"maxHp": max_hp,
		"quick": quick,
		"attack": attack_power,
		"defense": defense_power,
	}


static func player_pet_party(state: Dictionary) -> Array[Dictionary]:
	var party: Array[Dictionary] = []
	for value in state.get("petParty", []):
		var entry := value as Dictionary
		if not entry.is_empty():
			party.append(entry)
	return party


static func pet_party_entry_by_id(state: Dictionary, pet_id: String) -> Dictionary:
	for entry in player_pet_party(state):
		if str(entry.get("petId", "")) == pet_id:
			return entry
	return {}


static func active_pet_party_entry(state: Dictionary) -> Dictionary:
	for entry in player_pet_party(state):
		if str(entry.get("state", "")) == PET_STATE_BATTLE:
			return entry
	return {}


static func switchable_pet_entries(state: Dictionary) -> Array[Dictionary]:
	var entries: Array[Dictionary] = []
	for entry in player_pet_party(state):
		if is_pet_switchable(state, str(entry.get("petId", ""))):
			entries.append(entry)
	return entries


static func is_pet_switchable(state: Dictionary, pet_id: String) -> bool:
	var entry := pet_party_entry_by_id(state, pet_id)
	if entry.is_empty():
		return false
	return str(entry.get("state", "")) == PET_STATE_STANDBY and int(entry.get("hp", 0)) > 0


static func _sync_player_pet_party_from_actor(state: Dictionary, actor: Dictionary) -> Dictionary:
	if str(actor.get("id", "")) != PLAYER_PET_ID:
		return state
	var party: Array = state.get("petParty", [])
	for index in range(party.size()):
		var entry := party[index] as Dictionary
		if str(entry.get("state", "")) != PET_STATE_BATTLE and str(entry.get("actorId", "")) != PLAYER_PET_ID:
			continue
		entry["actorId"] = PLAYER_PET_ID
		entry["name"] = str(actor.get("name", entry.get("name", "宠物")))
		entry["hp"] = int(actor.get("hp", entry.get("hp", 0)))
		entry["maxHp"] = int(actor.get("maxHp", entry.get("maxHp", 1)))
		entry["quick"] = int(actor.get("quick", entry.get("quick", 50)))
		entry["attack"] = int(actor.get("attack", entry.get("attack", 12)))
		entry["defense"] = int(actor.get("defense", entry.get("defense", 6)))
		if str(actor.get("petBattleState", "")) == PET_STATE_REST or str(actor.get("actionState", "")) == "launched" or not bool(actor.get("revivable", true)):
			entry["state"] = PET_STATE_REST
			entry["actorId"] = ""
		else:
			entry["state"] = PET_STATE_BATTLE
		party[index] = entry
		break
	state["petParty"] = party
	return state


static func slot_id(side: String, row: String, slot: int) -> String:
	return "%s.%s.%d" % [side, row, slot]


static func formation_slot_ids() -> Array[String]:
	var slots: Array[String] = []
	for side in [SIDE_ENEMY, SIDE_ALLY]:
		for row in [ROW_BACK, ROW_FRONT]:
			for slot in range(1, SLOTS_PER_ROW + 1):
				slots.append(slot_id(str(side), str(row), slot))
	return slots


static func is_valid_slot_id(value: String) -> bool:
	var parts := value.split(".")
	if parts.size() != 3:
		return false
	var side := str(parts[0])
	var row := str(parts[1])
	if side != SIDE_ALLY and side != SIDE_ENEMY:
		return false
	if row != ROW_FRONT and row != ROW_BACK:
		return false
	var slot := int(parts[2])
	return slot >= 1 and slot <= SLOTS_PER_ROW and str(slot) == str(parts[2])


static func occupied_slots_are_unique(state: Dictionary) -> bool:
	var seen := {}
	var actors: Array = state.get("actors", [])
	for value in actors:
		var actor := value as Dictionary
		var actor_slot := str(actor.get("slotId", ""))
		if not is_valid_slot_id(actor_slot) or seen.has(actor_slot):
			return false
		seen[actor_slot] = true
	return true


static func side_actor_count(state: Dictionary, side: String) -> int:
	var count := 0
	var actors: Array = state.get("actors", [])
	for value in actors:
		var actor := value as Dictionary
		if str(actor.get("side", "")) == side:
			count += 1
	return count


static func fills_full_formation(state: Dictionary) -> bool:
	return state.get("actors", []).size() == 20 and side_actor_count(state, SIDE_ALLY) == 10 and side_actor_count(state, SIDE_ENEMY) == 10 and occupied_slots_are_unique(state)


static func actor_index(state: Dictionary, actor_id: String) -> int:
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		if str(actor.get("id", "")) == actor_id:
			return index
	return -1


static func actor_by_id(state: Dictionary, actor_id: String) -> Dictionary:
	var index := actor_index(state, actor_id)
	if index < 0:
		return {}
	var actors: Array = state.get("actors", [])
	return actors[index] as Dictionary


static func set_actor_hp(state: Dictionary, actor_id: String, hp: int) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	var max_hp := int(actor.get("maxHp", hp))
	actor["hp"] = clampi(hp, 0, max_hp)
	actor["actionState"] = "down" if int(actor.get("hp", 0)) <= 0 else "idle"
	actors[index] = actor
	state["actors"] = actors
	state = _sync_player_pet_party_from_actor(state, actor)
	return state


static func item_count(state: Dictionary, item_id: String) -> int:
	var bag = state.get("itemBag", {})
	if not (bag is Dictionary):
		return 0
	return maxi(0, int((bag as Dictionary).get(item_id, 0)))


static func has_item(state: Dictionary, item_id: String) -> bool:
	return item_count(state, item_id) > 0


static func set_item_count(state: Dictionary, item_id: String, count: int) -> Dictionary:
	var bag = state.get("itemBag", {})
	var next_bag := (bag as Dictionary).duplicate(true) if bag is Dictionary else {}
	next_bag[item_id] = maxi(0, count)
	state["itemBag"] = next_bag
	return state


static func consume_item(state: Dictionary, item_id: String) -> Dictionary:
	return set_item_count(state, item_id, item_count(state, item_id) - 1)


static func living_enemy_id(state: Dictionary) -> String:
	return first_living_actor_id(state, SIDE_ENEMY)


static func living_ally_id(state: Dictionary) -> String:
	return first_living_actor_id(state, SIDE_ALLY)


static func first_living_actor_id(state: Dictionary, side: String) -> String:
	var actors: Array = state.get("actors", [])
	for value in actors:
		var actor := value as Dictionary
		if str(actor.get("side", "")) == side and int(actor.get("hp", 0)) > 0:
			return str(actor.get("id", ""))
	return ""


static func living_actor_ids(state: Dictionary, side: String) -> Array[String]:
	var ids: Array[String] = []
	var actors: Array = state.get("actors", [])
	for value in actors:
		var actor := value as Dictionary
		if str(actor.get("side", "")) == side and int(actor.get("hp", 0)) > 0:
			ids.append(str(actor.get("id", "")))
	return ids


static func living_actor_count(state: Dictionary, side: String) -> int:
	return living_actor_ids(state, side).size()


static func preferred_enemy_target_id(state: Dictionary) -> String:
	return random_living_ally_target_id(state, "preferred", 0)


static func random_living_ally_target_id(state: Dictionary, attacker_id: String = "", sequence: int = 0) -> String:
	var living_ids := living_actor_ids(state, SIDE_ALLY)
	if living_ids.is_empty():
		return ""
	var seed_text := "%s:%s:%d:%d" % [
		str(state.get("targetSeed", state.get("id", "battle"))),
		attacker_id,
		int(state.get("round", 1)),
		sequence,
	]
	return living_ids[_stable_target_index(seed_text, living_ids.size())]


static func build_basic_round_events(state: Dictionary, selected_enemy_id: String) -> Array[Dictionary]:
	return build_command_round_events(state, "attack", selected_enemy_id)


static func build_command_round_events(state: Dictionary, command_id: String, selected_enemy_id: String) -> Array[Dictionary]:
	var player_command := {
		"command": command_id,
		"targetId": selected_enemy_id,
		"allyTargetId": best_ally_heal_target_id(state),
	}
	var pet_command := {
		"command": "attack",
		"targetId": selected_enemy_id,
	}
	return build_player_pet_round_events(state, player_command, pet_command)


static func build_player_pet_round_events(state: Dictionary, player_command: Dictionary, pet_command: Dictionary) -> Array[Dictionary]:
	var entries: Array[Dictionary] = []
	state["guardingActorIds"] = _guarding_actor_ids_for_commands(state, player_command, pet_command)
	var enemy_target_id := _enemy_target_for_command(state, str(player_command.get("targetId", "")))
	var sequence := 0
	var player_id := player_actor_id(state)
	var pet_id := controlled_pet_id(state)
	var player_command_id := str(player_command.get("command", "attack"))
	if player_id != "":
		var player_event := _make_player_command_event(state, player_id, player_command_id, player_command, enemy_target_id, sequence)
		if not player_event.is_empty():
			entries.append(player_event)
			sequence += 1

	var pet_command_id := str(pet_command.get("command", ""))
	if pet_id != "" and pet_command_id != "":
		var pet_enemy_target_id := _enemy_target_for_command(state, str(pet_command.get("targetId", enemy_target_id)))
		var pet_event := _make_pet_command_event(state, pet_id, pet_command_id, pet_command, pet_enemy_target_id, sequence)
		if not pet_event.is_empty():
			entries.append(pet_event)
			sequence += 1

	for ally_id in living_actor_ids(state, SIDE_ALLY):
		if ally_id == player_id or ally_id == pet_id:
			continue
		var npc_target_id := enemy_target_id if enemy_target_id != "" else living_enemy_id(state)
		if npc_target_id != "":
			entries.append(_make_attack_event(state, ally_id, npc_target_id, SIDE_ENEMY, sequence))
			sequence += 1

	for enemy_id in living_actor_ids(state, SIDE_ENEMY):
		var ally_target_id := random_living_ally_target_id(state, str(enemy_id), sequence)
		if ally_target_id != "":
			entries.append(_make_attack_event(state, str(enemy_id), ally_target_id, SIDE_ALLY, sequence))
			sequence += 1
	_sort_events_by_speed(entries)
	return _collapse_combo_events(state, entries)


static func _guarding_actor_ids_for_commands(state: Dictionary, player_command: Dictionary, pet_command: Dictionary) -> Array[String]:
	var ids: Array[String] = []
	var player_id := player_actor_id(state)
	if player_id != "" and str(player_command.get("command", "")) == "defend":
		ids.append(player_id)
	var pet_id := controlled_pet_id(state)
	if pet_id != "" and str(pet_command.get("command", "")) == "defend":
		ids.append(pet_id)
	return ids


static func action_actor_order(state: Dictionary, command_id: String, selected_enemy_id: String) -> Array[String]:
	var result: Array[String] = []
	for event in build_command_round_events(state, command_id, selected_enemy_id):
		var event_type := str(event.get("type", ""))
		if event_type == "combo_attack":
			for actor_id in event.get("participantIds", []):
				result.append(str(actor_id))
		else:
			result.append(str(event.get("attackerId", "")))
	return result


static func _attack_round_events(state: Dictionary, enemy_target_id: String) -> Array[Dictionary]:
	var entries: Array[Dictionary] = []
	var sequence := 0
	for ally_id in living_actor_ids(state, SIDE_ALLY):
		entries.append(_make_attack_event(state, ally_id, enemy_target_id, SIDE_ENEMY, sequence))
		sequence += 1

	for enemy_id in living_actor_ids(state, SIDE_ENEMY):
		var ally_target_id := random_living_ally_target_id(state, str(enemy_id), sequence)
		if ally_target_id != "":
			entries.append(_make_attack_event(state, str(enemy_id), ally_target_id, SIDE_ALLY, sequence))
			sequence += 1
	_sort_events_by_speed(entries)
	return _collapse_combo_events(state, entries)


static func _make_player_command_event(state: Dictionary, player_id: String, command_id: String, command: Dictionary, enemy_target_id: String, sequence: int) -> Dictionary:
	match command_id:
		"capture":
			if enemy_target_id != "":
				return _make_capture_event(state, player_id, enemy_target_id, sequence)
		"spirit":
			return _make_spirit_event(state, player_id, command, enemy_target_id, sequence)
		"item":
			return _make_item_event(state, player_id, command, enemy_target_id, sequence)
		"switch_pet":
			return _make_switch_pet_event(state, player_id, str(command.get("petId", "")), sequence)
		"defend":
			return _make_defend_event(state, player_id, sequence)
		_:
			if enemy_target_id != "":
				return _make_attack_event(state, player_id, enemy_target_id, SIDE_ENEMY, sequence)
	return {}


static func _make_spirit_event(state: Dictionary, player_id: String, command: Dictionary, enemy_target_id: String, sequence: int) -> Dictionary:
	var spirit_id := str(command.get("spiritId", SPIRIT_MOIST_SINGLE))
	match spirit_id:
		SPIRIT_GRACE_ALL:
			if BattleActionCatalog.action_is_all(spirit_id) and BattleActionCatalog.action_can_target_side(spirit_id, SIDE_ALLY):
				return _make_spirit_heal_all_event(state, player_id, sequence)
		SPIRIT_POISON_SINGLE:
			var target_id := str(command.get("targetId", enemy_target_id))
			if BattleActionCatalog.action_can_target_side(spirit_id, SIDE_ENEMY) and _is_living_side_actor(state, target_id, SIDE_ENEMY):
				return _make_spirit_poison_event(state, player_id, target_id, sequence)
		SPIRIT_POISON_ALL:
			if BattleActionCatalog.action_is_all(spirit_id) and BattleActionCatalog.action_can_target_side(spirit_id, SIDE_ENEMY):
				return _make_spirit_poison_all_event(state, player_id, sequence)
		_:
			var ally_target_id := str(command.get("allyTargetId", ""))
			if not _is_living_side_actor(state, ally_target_id, SIDE_ALLY):
				ally_target_id = best_ally_heal_target_id(state)
			if BattleActionCatalog.action_can_target_side(spirit_id, SIDE_ALLY) and ally_target_id != "":
				return _make_spirit_heal_event(state, player_id, ally_target_id, sequence)
	return {}


static func _make_item_event(state: Dictionary, player_id: String, command: Dictionary, enemy_target_id: String, sequence: int) -> Dictionary:
	var item_id := str(command.get("itemId", ITEM_HEAL_SINGLE))
	if not has_item(state, item_id):
		return {}
	match item_id:
		ITEM_HEAL_ALL:
			if BattleActionCatalog.action_is_all(item_id) and BattleActionCatalog.action_can_target_side(item_id, SIDE_ALLY):
				return _make_item_heal_all_event(state, player_id, sequence)
		ITEM_POISON_SINGLE:
			var target_id := str(command.get("targetId", enemy_target_id))
			if BattleActionCatalog.action_can_target_side(item_id, SIDE_ENEMY) and _is_living_side_actor(state, target_id, SIDE_ENEMY):
				return _make_item_poison_event(state, player_id, target_id, sequence)
		ITEM_POISON_ALL:
			if BattleActionCatalog.action_is_all(item_id) and BattleActionCatalog.action_can_target_side(item_id, SIDE_ENEMY):
				return _make_item_poison_all_event(state, player_id, sequence)
		_:
			var ally_target_id := str(command.get("allyTargetId", ""))
			if not _is_living_side_actor(state, ally_target_id, SIDE_ALLY):
				ally_target_id = best_ally_heal_target_id(state)
			if BattleActionCatalog.action_can_target_side(item_id, SIDE_ALLY) and ally_target_id != "":
				return _make_item_heal_event(state, player_id, ally_target_id, sequence)
	return {}


static func _make_pet_command_event(state: Dictionary, pet_id: String, command_id: String, _command: Dictionary, enemy_target_id: String, sequence: int) -> Dictionary:
	match command_id:
		"pet_skill":
			if enemy_target_id != "":
				return _make_skill_event(state, pet_id, enemy_target_id, sequence)
		"defend":
			return _make_defend_event(state, pet_id, sequence)
		_:
			if enemy_target_id != "":
				return _make_attack_event(state, pet_id, enemy_target_id, SIDE_ENEMY, sequence)
	return {}


static func _make_attack_event(state: Dictionary, attacker_id: String, target_id: String, target_side: String, sequence: int) -> Dictionary:
	return {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": target_side,
		"damage": _attack_damage_for(state, attacker_id, target_id),
		"speed": _effective_action_speed(state, attacker_id, "attack"),
		"sequence": sequence,
		"movementStyle": "melee",
		"canLaunch": true,
	}


static func _make_skill_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "skill_attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"damage": _skill_damage_for(state, attacker_id, target_id, PET_SKILL_BUI_CHARGE),
		"speed": _effective_action_speed(state, attacker_id, "pet_skill"),
		"sequence": sequence,
		"skillName": BattleActionCatalog.label_for(PET_SKILL_BUI_CHARGE, "布伊冲撞"),
		"movementStyle": "melee",
		"canLaunch": true,
	}


static func _make_spirit_heal_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "spirit_heal",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ALLY,
		"heal": BattleActionCatalog.effect_amount_for(SPIRIT_MOIST_SINGLE, 48),
		"speed": _effective_action_speed(state, attacker_id, "spirit"),
		"sequence": sequence,
		"skillName": BattleActionCatalog.label_for(SPIRIT_MOIST_SINGLE, "滋润精灵5"),
		"spiritId": SPIRIT_MOIST_SINGLE,
	}


static func _make_spirit_heal_all_event(state: Dictionary, attacker_id: String, sequence: int) -> Dictionary:
	return {
		"type": "spirit_heal_all",
		"attackerId": attacker_id,
		"targetSide": SIDE_ALLY,
		"targetIds": living_actor_ids(state, SIDE_ALLY),
		"heal": BattleActionCatalog.effect_amount_for(SPIRIT_GRACE_ALL, 34),
		"speed": _effective_action_speed(state, attacker_id, "spirit"),
		"sequence": sequence,
		"skillName": BattleActionCatalog.label_for(SPIRIT_GRACE_ALL, "恩惠精灵5"),
		"spiritId": SPIRIT_GRACE_ALL,
	}


static func _make_spirit_poison_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "spirit_poison",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"damage": BattleActionCatalog.effect_amount_for(SPIRIT_POISON_SINGLE, 18),
		"speed": _effective_action_speed(state, attacker_id, "spirit"),
		"sequence": sequence,
		"skillName": BattleActionCatalog.label_for(SPIRIT_POISON_SINGLE, "毒精灵5"),
		"spiritId": SPIRIT_POISON_SINGLE,
	}


static func _make_spirit_poison_all_event(state: Dictionary, attacker_id: String, sequence: int) -> Dictionary:
	return {
		"type": "spirit_poison_all",
		"attackerId": attacker_id,
		"targetSide": SIDE_ENEMY,
		"targetIds": living_actor_ids(state, SIDE_ENEMY),
		"damage": BattleActionCatalog.effect_amount_for(SPIRIT_POISON_ALL, 10),
		"speed": _effective_action_speed(state, attacker_id, "spirit"),
		"sequence": sequence,
		"skillName": BattleActionCatalog.label_for(SPIRIT_POISON_ALL, "毒雾精灵5"),
		"spiritId": SPIRIT_POISON_ALL,
	}


static func _make_item_heal_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "item_heal",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ALLY,
		"heal": BattleActionCatalog.effect_amount_for(ITEM_HEAL_SINGLE, 42),
		"speed": _effective_action_speed(state, attacker_id, "item"),
		"sequence": sequence,
		"itemName": BattleActionCatalog.label_for(ITEM_HEAL_SINGLE, "回复药5"),
		"itemId": ITEM_HEAL_SINGLE,
	}


static func _make_item_heal_all_event(state: Dictionary, attacker_id: String, sequence: int) -> Dictionary:
	return {
		"type": "item_heal_all",
		"attackerId": attacker_id,
		"targetSide": SIDE_ALLY,
		"targetIds": living_actor_ids(state, SIDE_ALLY),
		"heal": BattleActionCatalog.effect_amount_for(ITEM_HEAL_ALL, 24),
		"speed": _effective_action_speed(state, attacker_id, "item"),
		"sequence": sequence,
		"itemName": BattleActionCatalog.label_for(ITEM_HEAL_ALL, "群体草药5"),
		"itemId": ITEM_HEAL_ALL,
	}


static func _make_item_poison_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "item_poison",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"damage": BattleActionCatalog.effect_amount_for(ITEM_POISON_SINGLE, 12),
		"speed": _effective_action_speed(state, attacker_id, "item"),
		"sequence": sequence,
		"itemName": BattleActionCatalog.label_for(ITEM_POISON_SINGLE, "毒粉5"),
		"itemId": ITEM_POISON_SINGLE,
	}


static func _make_item_poison_all_event(state: Dictionary, attacker_id: String, sequence: int) -> Dictionary:
	return {
		"type": "item_poison_all",
		"attackerId": attacker_id,
		"targetSide": SIDE_ENEMY,
		"targetIds": living_actor_ids(state, SIDE_ENEMY),
		"damage": BattleActionCatalog.effect_amount_for(ITEM_POISON_ALL, 7),
		"speed": _effective_action_speed(state, attacker_id, "item"),
		"sequence": sequence,
		"itemName": BattleActionCatalog.label_for(ITEM_POISON_ALL, "毒雾粉5"),
		"itemId": ITEM_POISON_ALL,
	}


static func _make_defend_event(state: Dictionary, actor_id: String, sequence: int) -> Dictionary:
	return {
		"type": "defend",
		"attackerId": actor_id,
		"targetId": actor_id,
		"targetSide": str(actor_by_id(state, actor_id).get("side", "")),
		"speed": _effective_action_speed(state, actor_id, "defend"),
		"sequence": sequence,
		"guardActiveFromRoundStart": true,
	}


static func _make_switch_pet_event(state: Dictionary, actor_id: String, pet_id: String, sequence: int) -> Dictionary:
	if not is_pet_switchable(state, pet_id):
		return {}
	return {
		"type": "switch_pet",
		"attackerId": actor_id,
		"targetId": PLAYER_PET_ID,
		"targetSide": SIDE_ALLY,
		"petId": pet_id,
		"speed": _effective_action_speed(state, actor_id, "switch_pet"),
		"sequence": sequence,
	}


static func _make_capture_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "capture",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"speed": _effective_action_speed(state, attacker_id, "capture"),
		"sequence": sequence,
		"success": capture_would_succeed(state, attacker_id, target_id),
	}


static func _sort_events_by_speed(events: Array[Dictionary]) -> void:
	for index in range(events.size()):
		for next_index in range(index + 1, events.size()):
			var current := events[index] as Dictionary
			var next := events[next_index] as Dictionary
			var current_speed := int(current.get("speed", 0))
			var next_speed := int(next.get("speed", 0))
			var current_sequence := int(current.get("sequence", 0))
			var next_sequence := int(next.get("sequence", 0))
			if next_speed > current_speed or (next_speed == current_speed and next_sequence < current_sequence):
				events[index] = next
				events[next_index] = current


static func _collapse_combo_events(state: Dictionary, entries: Array[Dictionary]) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var index := 0
	while index < entries.size():
		var current := entries[index] as Dictionary
		var combo_entries: Array[Dictionary] = [current]
		var next_index := index + 1
		while next_index < entries.size():
			var next := entries[next_index] as Dictionary
			if not _can_join_combo_group(state, combo_entries, next):
				break
			combo_entries.append(next)
			next_index += 1
		if combo_entries.size() >= 2:
			events.append(_make_combo_event_from_group(combo_entries))
			index = next_index
		else:
			events.append(current)
			index += 1
	return events


static func _can_join_combo_group(state: Dictionary, combo_entries: Array[Dictionary], next: Dictionary) -> bool:
	if combo_entries.is_empty():
		return false
	var first := combo_entries[0] as Dictionary
	if str(first.get("type", "")) != "attack" or str(next.get("type", "")) != "attack":
		return false
	if str(first.get("targetId", "")) != str(next.get("targetId", "")):
		return false
	if str(first.get("targetSide", "")) != str(next.get("targetSide", "")):
		return false
	var seen_actor_ids: Array[String] = []
	for value in combo_entries:
		var combo_entry := value as Dictionary
		var combo_actor_id := str(combo_entry.get("attackerId", ""))
		var combo_actor := actor_by_id(state, combo_actor_id)
		if combo_actor.is_empty() or str(combo_actor.get("side", "")) != SIDE_ALLY:
			return false
		if seen_actor_ids.has(combo_actor_id):
			return false
		seen_actor_ids.append(combo_actor_id)
	var next_actor_id := str(next.get("attackerId", ""))
	var next_actor := actor_by_id(state, str(next.get("attackerId", "")))
	if next_actor.is_empty() or str(next_actor.get("side", "")) != SIDE_ALLY:
		return false
	if seen_actor_ids.has(next_actor_id):
		return false
	return _is_living_side_actor(state, next_actor_id, SIDE_ALLY)


static func _make_combo_event_from_group(combo_entries: Array[Dictionary]) -> Dictionary:
	var first := combo_entries[0] as Dictionary
	var participant_ids: Array[String] = []
	var total_damage := 0
	var max_speed := 0
	for value in combo_entries:
		var entry := value as Dictionary
		participant_ids.append(str(entry.get("attackerId", "")))
		total_damage += int(entry.get("damage", 0))
		max_speed = maxi(max_speed, int(entry.get("speed", 0)))
	return {
		"type": "combo_attack",
		"attackerId": str(first.get("attackerId", "")),
		"participantIds": participant_ids,
		"targetId": str(first.get("targetId", "")),
		"targetSide": str(first.get("targetSide", "")),
		"damage": total_damage + 8 * maxi(1, participant_ids.size() - 1),
		"speed": max_speed,
		"sequence": int(first.get("sequence", 0)),
		"movementStyle": "melee_combo",
		"canLaunch": true,
	}


static func player_actor_id(state: Dictionary) -> String:
	if _is_living_side_actor(state, PLAYER_ACTOR_ID, SIDE_ALLY):
		return PLAYER_ACTOR_ID
	if _is_living_side_actor(state, "ally_back_3", SIDE_ALLY):
		return "ally_back_3"
	return living_ally_id(state)


static func controlled_pet_id(state: Dictionary) -> String:
	if _is_living_side_actor(state, PLAYER_PET_ID, SIDE_ALLY):
		return PLAYER_PET_ID
	if _is_living_side_actor(state, "ally_front_3", SIDE_ALLY):
		return "ally_front_3"
	return ""


static func best_ally_heal_target_id(state: Dictionary) -> String:
	var best_id := ""
	var best_missing := -1
	for actor_id in living_actor_ids(state, SIDE_ALLY):
		var actor := actor_by_id(state, actor_id)
		var missing := int(actor.get("maxHp", 0)) - int(actor.get("hp", 0))
		if missing > best_missing:
			best_missing = missing
			best_id = actor_id
	var player_id := player_actor_id(state)
	if best_missing <= 0 and player_id != "":
		return player_id
	return best_id


static func _effective_action_speed(state: Dictionary, actor_id: String, command_id: String) -> int:
	var actor := actor_by_id(state, actor_id)
	if actor.is_empty():
		return 1
	var base := int(actor.get("quick", 50)) + 20
	match command_id:
		"item":
			return base + 12
		_:
			return base


static func capture_would_succeed(state: Dictionary, attacker_id: String, target_id: String) -> bool:
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return false
	var target := actor_by_id(state, target_id)
	if target.is_empty() or not bool(target.get("catchable", false)):
		return false
	var max_hp := maxf(1.0, float(target.get("maxHp", 1)))
	var hp_ratio := clampf(float(target.get("hp", 0)) / max_hp, 0.0, 1.0)
	var difficulty := clampf(float(target.get("captureDifficulty", 42)) / 100.0, 0.0, 0.9)
	var chance := 0.78 - hp_ratio * 0.55 - difficulty * 0.18
	return chance >= 0.42


static func apply_battle_event(state: Dictionary, event: Dictionary) -> Dictionary:
	state["lastEventApplied"] = false
	state["lastEventType"] = str(event.get("type", ""))
	state["lastDamage"] = 0
	state["lastHeal"] = 0
	state["lastTargetIds"] = []
	state["lastEffectPerTarget"] = {}
	state["lastCaptureSuccess"] = false
	state["lastLaunch"] = false
	state["lastLaunchMode"] = ""
	state["lastParticipants"] = event.get("participantIds", [])
	var event_type := str(event.get("type", ""))
	if event_type == "attack" or event_type == "skill_attack" or event_type == "combo_attack":
		return _apply_damage_event(state, event)
	if event_type == "spirit_heal":
		return _apply_spirit_heal_event(state, event)
	if event_type == "spirit_heal_all":
		return _apply_spirit_heal_all_event(state, event)
	if event_type == "spirit_poison":
		return _apply_spirit_poison_event(state, event)
	if event_type == "spirit_poison_all":
		return _apply_spirit_poison_all_event(state, event)
	if event_type == "item_heal":
		return _apply_item_consuming_event(state, event, "_apply_spirit_heal_event")
	if event_type == "item_heal_all":
		return _apply_item_consuming_event(state, event, "_apply_spirit_heal_all_event")
	if event_type == "item_poison":
		return _apply_item_consuming_event(state, event, "_apply_spirit_poison_event")
	if event_type == "item_poison_all":
		return _apply_item_consuming_event(state, event, "_apply_spirit_poison_all_event")
	if event_type == "capture":
		return _apply_capture_event(state, event)
	if event_type == "switch_pet":
		return _apply_switch_pet_event(state, event)
	if event_type == "defend":
		return _apply_defend_event(state, event)
	return state


static func _apply_item_consuming_event(state: Dictionary, event: Dictionary, apply_method: String) -> Dictionary:
	var next_state := state
	var normalized := _normalize_item_event(event)
	match apply_method:
		"_apply_spirit_heal_event":
			next_state = _apply_spirit_heal_event(next_state, normalized)
		"_apply_spirit_heal_all_event":
			next_state = _apply_spirit_heal_all_event(next_state, normalized)
		"_apply_spirit_poison_event":
			next_state = _apply_spirit_poison_event(next_state, normalized)
		"_apply_spirit_poison_all_event":
			next_state = _apply_spirit_poison_all_event(next_state, normalized)
	if bool(next_state.get("lastEventApplied", false)):
		next_state = consume_item(next_state, str(event.get("itemId", "")))
	return next_state


static func _normalize_item_event(event: Dictionary) -> Dictionary:
	var normalized := event.duplicate(true)
	normalized["skillName"] = str(event.get("itemName", "物品"))
	return normalized


static func _apply_damage_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var event_type := str(event.get("type", ""))
	var attacker_id := str(event.get("attackerId", ""))
	var participant_ids: Array = event.get("participantIds", [attacker_id])
	if participant_ids.is_empty():
		participant_ids = [attacker_id]
	var first_attacker := actor_by_id(state, str(participant_ids[0]))
	if first_attacker.is_empty() or int(first_attacker.get("hp", 0)) <= 0:
		return state

	var target_side := str(event.get("targetSide", ""))
	var target_id := str(event.get("targetId", ""))
	if not _is_living_side_actor(state, target_id, target_side):
		target_id = _fallback_target_id(state, target_side, attacker_id, int(event.get("sequence", 0)))
	if target_id == "":
		return state

	var actors: Array = state.get("actors", [])
	for participant_id in participant_ids:
		var participant_index := actor_index(state, str(participant_id))
		if participant_index < 0:
			continue
		var participant := actors[participant_index] as Dictionary
		if int(participant.get("hp", 0)) <= 0:
			continue
		participant["actionState"] = "combo" if event_type == "combo_attack" else ("skill" if event_type == "skill_attack" else "attack")
		actors[participant_index] = participant

	var target_index := actor_index(state, target_id)
	if target_index < 0:
		return state
	var target := actors[target_index] as Dictionary
	var damage := maxi(1, int(event.get("damage", 1)))
	var hp_before := int(target.get("hp", 0))
	var next_hp := maxi(0, hp_before - damage)
	var max_hp := maxi(1, int(target.get("maxHp", hp_before)))
	var overkill := damage - hp_before
	var launch_threshold := maxi(12, int(round(float(max_hp) * 0.18)))
	var launched := bool(event.get("canLaunch", false)) and hp_before > 0 and next_hp <= 0 and overkill >= launch_threshold
	target["hp"] = next_hp
	if launched:
		target["actionState"] = "launched"
		target["launched"] = true
		target["revivable"] = false
		target["petBattleState"] = "rest"
		target["launchHpBefore"] = hp_before
	else:
		target["actionState"] = "down" if next_hp <= 0 else "hit"
	actors[target_index] = target
	state["actors"] = actors
	state = _sync_player_pet_party_from_actor(state, target)
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastDamage"] = damage
	state["lastParticipants"] = participant_ids
	state["lastLaunch"] = launched
	state["lastLaunchMode"] = _launch_mode_for_event(event, target_id) if launched else ""

	var target_name := str(target.get("name", "目标"))
	if event_type == "combo_attack":
		var names: Array[String] = []
		for participant_id in participant_ids:
			var participant_actor := actor_by_id(state, str(participant_id))
			if not participant_actor.is_empty():
				names.append(str(participant_actor.get("name", "我方")))
		state["message"] = "%s 合击了 %s，造成 %d 点伤害。" % ["、".join(names), target_name, damage]
	elif event_type == "skill_attack":
		var skill_name := str(event.get("skillName", "技能"))
		state["message"] = "%s 使用%s，造成 %d 点伤害。" % [str(first_attacker.get("name", "伙伴")), skill_name, damage]
	else:
		state["message"] = "%s 攻击了 %s，造成 %d 点伤害。" % [str(first_attacker.get("name", "我方")), target_name, damage]
	if launched:
		state["message"] += " %s 被击飞，进入休息状态，无法在本场战斗中复活。" % target_name
	elif next_hp <= 0:
		state["message"] += " %s 倒下了。" % target_name
	return state


static func _launch_mode_for_event(event: Dictionary, target_id: String) -> String:
	if not bool(event.get("canLaunch", false)):
		return ""
	var requested_mode := str(event.get("launchMode", ""))
	if requested_mode == "straight" or requested_mode == "bounce":
		return requested_mode
	var seed_text := "%s:%d" % [target_id, int(event.get("sequence", 0))]
	return "bounce" if _stable_target_index(seed_text, 2) == 0 else "straight"


static func _apply_capture_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	var target_id := str(event.get("targetId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY) or not _is_living_side_actor(state, target_id, SIDE_ENEMY):
		return state
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	var target_index := actor_index(state, target_id)
	if attacker_index < 0 or target_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	var target := actors[target_index] as Dictionary
	attacker["actionState"] = "capture"
	var success := bool(event.get("success", false))
	if success:
		target["hp"] = 0
		target["actionState"] = "captured"
		target["captured"] = true
		state["message"] = "%s 捕捉了 %s。" % [str(attacker.get("name", "我方")), str(target.get("name", "目标"))]
	else:
		target["actionState"] = "hit"
		state["message"] = "%s 抛出捕捉石，%s 挣脱了。" % [str(attacker.get("name", "我方")), str(target.get("name", "目标"))]
	actors[attacker_index] = attacker
	actors[target_index] = target
	state["actors"] = actors
	state = _sync_player_pet_party_from_actor(state, target)
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastCaptureSuccess"] = success
	return state


static func _apply_switch_pet_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	var pet_id := str(event.get("petId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY) or not is_pet_switchable(state, pet_id):
		return state
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	var active_pet_index := actor_index(state, PLAYER_PET_ID)
	if attacker_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	attacker["actionState"] = "switch_pet"
	actors[attacker_index] = attacker

	var party: Array = state.get("petParty", [])
	if active_pet_index >= 0:
		var current_pet := actors[active_pet_index] as Dictionary
		for index in range(party.size()):
			var entry := party[index] as Dictionary
			if str(entry.get("state", "")) != PET_STATE_BATTLE and str(entry.get("actorId", "")) != PLAYER_PET_ID:
				continue
			entry["actorId"] = ""
			entry["hp"] = int(current_pet.get("hp", entry.get("hp", 0)))
			entry["maxHp"] = int(current_pet.get("maxHp", entry.get("maxHp", 1)))
			entry["quick"] = int(current_pet.get("quick", entry.get("quick", 50)))
			entry["attack"] = int(current_pet.get("attack", entry.get("attack", 12)))
			entry["defense"] = int(current_pet.get("defense", entry.get("defense", 6)))
			entry["state"] = PET_STATE_STANDBY if int(current_pet.get("hp", 0)) > 0 and str(current_pet.get("petBattleState", "")) != PET_STATE_REST and bool(current_pet.get("revivable", true)) else PET_STATE_REST
			party[index] = entry
			break

	var selected_entry := {}
	for index in range(party.size()):
		var entry := party[index] as Dictionary
		if str(entry.get("petId", "")) != pet_id:
			continue
		entry["state"] = PET_STATE_BATTLE
		entry["actorId"] = PLAYER_PET_ID
		party[index] = entry
		selected_entry = entry
		break
	if selected_entry.is_empty():
		return state

	var next_pet := _make_actor(
		PLAYER_PET_ID,
		str(selected_entry.get("name", "宠物")),
		SIDE_ALLY,
		"pet",
		slot_id(SIDE_ALLY, ROW_FRONT, 3),
		int(selected_entry.get("hp", 1)),
		int(selected_entry.get("maxHp", 1)),
		int(selected_entry.get("quick", 50)),
		int(selected_entry.get("attack", 12)),
		int(selected_entry.get("defense", 6))
	)
	next_pet["actionState"] = "switch_in"
	next_pet["petBattleState"] = PET_STATE_BATTLE
	if active_pet_index >= 0:
		actors[active_pet_index] = next_pet
	else:
		actors.append(next_pet)
	state["actors"] = actors
	state["petParty"] = party
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = PLAYER_PET_ID
	state["lastTargetIds"] = [PLAYER_PET_ID]
	state["lastPetId"] = pet_id
	state["lastParticipants"] = [attacker_id]
	state["message"] = "%s 换上了 %s。" % [str(attacker.get("name", "我方")), str(next_pet.get("name", "宠物"))]
	return state


static func _apply_spirit_heal_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	var target_id := str(event.get("targetId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return state
	if not _is_living_side_actor(state, target_id, SIDE_ALLY):
		target_id = best_ally_heal_target_id(state)
	if target_id == "":
		return state
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	var target_index := actor_index(state, target_id)
	if attacker_index < 0 or target_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	var target := actors[target_index] as Dictionary
	attacker["actionState"] = "spirit"
	var heal_limit := maxi(0, int(event.get("heal", 0)))
	var hp := int(target.get("hp", 0))
	var max_hp := int(target.get("maxHp", hp))
	var healed := mini(heal_limit, maxi(0, max_hp - hp))
	target["hp"] = mini(max_hp, hp + healed)
	target["actionState"] = "heal"
	actors[attacker_index] = attacker
	actors[target_index] = target
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastHeal"] = healed
	state["lastEffectPerTarget"] = {target_id: healed}
	state["lastParticipants"] = [attacker_id]
	var spirit_name := str(event.get("skillName", "精灵"))
	if healed > 0:
		state["message"] = "%s 使用%s，%s 回复 %d 点生命。" % [
			str(attacker.get("name", "我方")),
			spirit_name,
			str(target.get("name", "目标")),
			healed,
		]
	else:
		state["message"] = "%s 使用%s，%s 生命已经充足。" % [
			str(attacker.get("name", "我方")),
			spirit_name,
			str(target.get("name", "目标")),
		]
	return state


static func _apply_spirit_heal_all_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return state
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	if attacker_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	attacker["actionState"] = "spirit"
	actors[attacker_index] = attacker
	var heal_limit := maxi(0, int(event.get("heal", 0)))
	var healed_targets: Array[String] = []
	var effect_per_target := {}
	var total_healed := 0
	for index in range(actors.size()):
		var target := actors[index] as Dictionary
		if str(target.get("side", "")) != SIDE_ALLY or int(target.get("hp", 0)) <= 0:
			continue
		var hp := int(target.get("hp", 0))
		var max_hp := int(target.get("maxHp", hp))
		var healed := mini(heal_limit, maxi(0, max_hp - hp))
		target["hp"] = mini(max_hp, hp + healed)
		target["actionState"] = "heal"
		actors[index] = target
		healed_targets.append(str(target.get("id", "")))
		effect_per_target[str(target.get("id", ""))] = healed
		total_healed += healed
	if attacker_index >= 0:
		attacker = actors[attacker_index] as Dictionary
		attacker["actionState"] = "spirit"
		actors[attacker_index] = attacker
	state["actors"] = actors
	state = _sync_player_pet_party_from_actor(state, actor_by_id(state, PLAYER_PET_ID))
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = healed_targets[0] if not healed_targets.is_empty() else ""
	state["lastTargetIds"] = healed_targets
	state["lastHeal"] = total_healed
	state["lastEffectPerTarget"] = effect_per_target
	state["lastParticipants"] = [attacker_id]
	state["message"] = "%s 使用%s，我方全体回复生命。" % [
		str(attacker.get("name", "我方")),
		str(event.get("skillName", "精灵")),
	]
	return state


static func _apply_spirit_poison_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	var target_id := str(event.get("targetId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return state
	if not _is_living_side_actor(state, target_id, SIDE_ENEMY):
		target_id = living_enemy_id(state)
	if target_id == "":
		return state
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	var target_index := actor_index(state, target_id)
	if attacker_index < 0 or target_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	var target := actors[target_index] as Dictionary
	attacker["actionState"] = "spirit"
	var damage := maxi(1, int(event.get("damage", 1)))
	var next_hp := maxi(0, int(target.get("hp", 0)) - damage)
	target["hp"] = next_hp
	target["poisoned"] = true
	target["actionState"] = "down" if next_hp <= 0 else "hit"
	actors[attacker_index] = attacker
	actors[target_index] = target
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastDamage"] = damage
	state["lastEffectPerTarget"] = {target_id: damage}
	state["lastParticipants"] = [attacker_id]
	state["message"] = "%s 使用%s，%s 中毒并受到 %d 点伤害。" % [
		str(attacker.get("name", "我方")),
		str(event.get("skillName", "精灵")),
		str(target.get("name", "目标")),
		damage,
	]
	if next_hp <= 0:
		state["message"] += " %s 倒下了。" % str(target.get("name", "目标"))
	return state


static func _apply_spirit_poison_all_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return state
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	if attacker_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	attacker["actionState"] = "spirit"
	actors[attacker_index] = attacker
	var damage := maxi(1, int(event.get("damage", 1)))
	var target_ids: Array[String] = []
	var effect_per_target := {}
	var total_damage := 0
	for index in range(actors.size()):
		var target := actors[index] as Dictionary
		if str(target.get("side", "")) != SIDE_ENEMY or int(target.get("hp", 0)) <= 0:
			continue
		var next_hp := maxi(0, int(target.get("hp", 0)) - damage)
		target["hp"] = next_hp
		target["poisoned"] = true
		target["actionState"] = "down" if next_hp <= 0 else "hit"
		actors[index] = target
		var target_id := str(target.get("id", ""))
		target_ids.append(target_id)
		effect_per_target[target_id] = damage
		total_damage += damage
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_ids[0] if not target_ids.is_empty() else ""
	state["lastTargetIds"] = target_ids
	state["lastDamage"] = total_damage
	state["lastEffectPerTarget"] = effect_per_target
	state["lastParticipants"] = [attacker_id]
	state["message"] = "%s 使用%s，敌方全体中毒。" % [
		str(attacker.get("name", "我方")),
		str(event.get("skillName", "精灵")),
	]
	return state


static func _apply_defend_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var actor_id := str(event.get("attackerId", ""))
	var actor := actor_by_id(state, actor_id)
	if actor.is_empty() or int(actor.get("hp", 0)) <= 0:
		return state
	var actors: Array = state.get("actors", [])
	var actor_index_value := actor_index(state, actor_id)
	if actor_index_value < 0:
		return state
	actor = actors[actor_index_value] as Dictionary
	actor["actionState"] = "defend"
	actors[actor_index_value] = actor
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = actor_id
	state["lastTargetId"] = actor_id
	state["lastParticipants"] = [actor_id]
	state["message"] = "%s 进入防御姿态。" % str(actor.get("name", "我方"))
	return state


static func apply_attack(state: Dictionary, attacker_id: String, target_id: String, damage: int = 18) -> Dictionary:
	var target_actor := actor_by_id(state, target_id)
	var target_side := str(target_actor.get("side", SIDE_ENEMY)) if not target_actor.is_empty() else SIDE_ENEMY
	return apply_battle_event(state, {
		"type": "attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": target_side,
		"damage": damage,
		"speed": _effective_action_speed(state, attacker_id, "attack"),
		"sequence": 0,
	})


static func action_speed_for(state: Dictionary, actor_id: String, command_id: String = "attack") -> int:
	return _effective_action_speed(state, actor_id, command_id)


static func attack_damage_preview_for(state: Dictionary, attacker_id: String, target_id: String) -> int:
	return _attack_damage_for(state, attacker_id, target_id)


static func pet_skill_damage_preview_for(state: Dictionary, attacker_id: String, target_id: String, action_id: String = PET_SKILL_BUI_CHARGE) -> int:
	return _skill_damage_for(state, attacker_id, target_id, action_id)


static func reset_action_states(state: Dictionary) -> Dictionary:
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		if int(actor.get("hp", 0)) > 0:
			actor["actionState"] = "idle"
			actors[index] = actor
	state["actors"] = actors
	return state


static func _ally_action_order(state: Dictionary) -> Array[String]:
	var ordered: Array[String] = []
	for preferred_id in ["ally_player", "ally_pet"]:
		if _is_living_side_actor(state, preferred_id, SIDE_ALLY):
			ordered.append(preferred_id)
	for actor_id in living_actor_ids(state, SIDE_ALLY):
		if not ordered.has(actor_id):
			ordered.append(actor_id)
	return ordered


static func _attack_damage_for(state: Dictionary, actor_id: String, target_id: String = "") -> int:
	var actor := actor_by_id(state, actor_id)
	if actor.is_empty():
		return 1
	var side := str(actor.get("side", ""))
	var kind := str(actor.get("kind", ""))
	var raw_attack := 5 if side == SIDE_ENEMY and living_actor_count(state, SIDE_ENEMY) > 3 else 10
	if actor.has("attack"):
		raw_attack = int(actor.get("attack", raw_attack))
	elif side != SIDE_ENEMY:
		raw_attack = 18 if kind == "player" else 14
	return _damage_after_defense(state, raw_attack, target_id, 0.35)


static func _skill_damage_for(state: Dictionary, actor_id: String, target_id: String = "", action_id: String = PET_SKILL_BUI_CHARGE) -> int:
	var actor := actor_by_id(state, actor_id)
	if actor.is_empty():
		return 1
	var raw_attack := int(actor.get("attack", 12)) + BattleActionCatalog.effect_amount_bonus_for(action_id, 12)
	return _damage_after_defense(state, raw_attack, target_id, 0.25)


static func _damage_after_defense(state: Dictionary, raw_attack: int, target_id: String, defense_factor: float) -> int:
	var target := actor_by_id(state, target_id)
	if target.is_empty():
		return maxi(1, raw_attack)
	var defense := maxi(0, int(target.get("defense", 0)))
	var reduced := raw_attack - int(round(float(defense) * defense_factor))
	if is_actor_guarding(state, target_id):
		reduced = int(floor(float(reduced) * 0.45))
	return maxi(1, reduced)


static func is_actor_guarding(state: Dictionary, actor_id: String) -> bool:
	for value in state.get("guardingActorIds", []):
		if str(value) == actor_id:
			return true
	return false


static func _fallback_target_id(state: Dictionary, target_side: String, attacker_id: String = "", sequence: int = 0) -> String:
	if target_side == SIDE_ENEMY:
		return living_enemy_id(state)
	if target_side == SIDE_ALLY:
		return random_living_ally_target_id(state, attacker_id, sequence)
	return ""


static func _enemy_target_for_command(state: Dictionary, selected_enemy_id: String) -> String:
	if _is_living_side_actor(state, selected_enemy_id, SIDE_ENEMY):
		return selected_enemy_id
	return living_enemy_id(state)


static func _stable_target_index(seed_text: String, count: int) -> int:
	if count <= 0:
		return 0
	var value := 17
	for index in range(seed_text.length()):
		value = (value * 131 + seed_text.unicode_at(index)) % 2147483647
	return value % count


static func _is_living_side_actor(state: Dictionary, actor_id: String, side: String) -> bool:
	if actor_id == "":
		return false
	var actor := actor_by_id(state, actor_id)
	return not actor.is_empty() and str(actor.get("side", "")) == side and int(actor.get("hp", 0)) > 0
