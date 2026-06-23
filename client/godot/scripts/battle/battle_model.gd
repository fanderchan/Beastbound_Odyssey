extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const SIDE_ALLY := "ally"
const SIDE_ENEMY := "enemy"
const ROW_FRONT := "front"
const ROW_BACK := "back"
const SLOTS_PER_ROW := 5
const FORMATION_TEMPLATE_10V10 := "10v10"
const PLAYER_ACTOR_ID := "ally_player"
const PLAYER_PET_ID := "ally_pet"
const SPIRIT_GRACE_ALL := "spirit_grace_5"
const SPIRIT_MOIST_SINGLE := "spirit_moist_5"
const SPIRIT_POISON_SINGLE := "spirit_poison_5"
const SPIRIT_POISON_ALL := "spirit_poison_mist_5"
const PET_SKILL_ATTACK := "pet_attack"
const PET_SKILL_DEFEND := "pet_defend"
const PET_SKILL_BUI_CHARGE := "pet_bui_charge"
const PET_SKILL_SLEEP_POWDER := "pet_sleep_powder"
const PET_SKILL_CONFUSE_CRY := "pet_confuse_cry"
const PET_SKILL_STONE_GAZE := "pet_stone_gaze"
const ITEM_HEAL_ALL := "item_heal_all_5"
const ITEM_HEAL_SINGLE := "item_heal_single_5"
const ITEM_MEAT_SMALL := "item_meat_small"
const ITEM_POISON_SINGLE := "item_poison_single_5"
const ITEM_POISON_ALL := "item_poison_all_5"
const ITEM_CLEANSE_SINGLE := "item_cleanse_single_5"
const CAPTURE_TOOL_EMPTY_HAND := "empty_hand"
const CAPTURE_TOOL_ROPE_BASIC := "capture_rope_basic"
const CAPTURE_TOOL_NET := "capture_net"
const CAPTURE_TOOL_NET_REINFORCED := "capture_net_reinforced"
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"
const STATUS_POISON := BattleStatusModel.STATUS_POISON
const STATUS_SLEEP := BattleStatusModel.STATUS_SLEEP
const STATUS_CONFUSION := BattleStatusModel.STATUS_CONFUSION
const STATUS_STONE := BattleStatusModel.STATUS_STONE
const DODGE_MAX_RATE := 0.75
const DODGE_DEX_DIVISOR := 0.02
const CRITICAL_DEX_DIVISOR := 0.09
const COUNTER_DEX_DIVISOR := 0.08
const COUNTER_DAMAGE_FACTOR := 0.75
const COMBATANT_COMBO_BASE_RATE := 0.50
const MONSTER_COMBO_BASE_RATE := 0.20


static func create_wild_battle(encounter_zone: Dictionary) -> Dictionary:
	var zone_name := str(encounter_zone.get("name", "野外"))
	var wild_pet := _wild_pet_entry_for_zone(encounter_zone)
	var enemy_form_id := str(wild_pet.get("formId", "wuli_normal_orange_fire10"))
	var enemy_name := _wild_pet_name(wild_pet, enemy_form_id)
	var enemy_stats := _wild_pet_battle_stats(wild_pet, enemy_form_id)
	var enemy_level := maxi(1, int(wild_pet.get("level", wild_pet.get("levelMin", 1))))
	var enemy_actor := _make_actor(
		"enemy_0",
		enemy_name,
		SIDE_ENEMY,
		"wild_pet",
		"enemy.front.3",
		int(enemy_stats.get("hp", enemy_stats.get("maxHp", 80))),
		int(enemy_stats.get("maxHp", 80)),
		int(enemy_stats.get("quick", enemy_stats.get("agility", 48))),
		int(enemy_stats.get("attack", 10)),
		int(enemy_stats.get("defense", 6)),
		[],
		enemy_form_id
	)
	enemy_actor["level"] = enemy_level
	var state := {
		"id": "local_wild_battle",
		"round": 1,
		"phase": "command",
		"sourceZoneId": str(encounter_zone.get("id", "")),
		"sourceEncounterGroupId": str(encounter_zone.get("encounterGroupId", "")),
		"selectedWildPet": wild_pet,
		"targetSeed": "local_wild_battle",
		"message": "%s 出现了%s。" % [zone_name, enemy_name],
		"itemBag": default_item_bag(),
		"captureToolBag": CaptureToolCatalog.starting_inventory(),
		"guardingActorIds": [],
		"actors": [
			_make_actor("ally_player", "见习猎人", SIDE_ALLY, "player", "ally.back.3", 120, 120, 70, 18),
			_make_actor("ally_pet", "小布伊", SIDE_ALLY, "pet", "ally.front.3", 90, 90, 68, 14, 8, [], "bui_normal_red_fire10"),
			enemy_actor,
		],
	}
	return _with_default_player_pet_party(state)


static func create_training_partner_battle(encounter_zone: Dictionary, enemy_count: int = 10) -> Dictionary:
	var state := create_wild_battle(encounter_zone)
	var allies: Array[Dictionary] = []
	for actor in _actors(state):
		if str(actor.get("side", "")) == SIDE_ALLY:
			allies.append(actor)
	state["id"] = "local_training_partner_battle"
	state["formationTemplate"] = FORMATION_TEMPLATE_10V10
	state["message"] = "%s 出现了一群野生宠物。" % str(encounter_zone.get("name", "野外"))
	state["actors"] = _training_partner_enemy_group_actors(encounter_zone, enemy_count) + allies
	return _with_default_player_pet_party(state)


static func default_item_bag() -> Dictionary:
	return {
		ITEM_MEAT_SMALL: 6,
		ITEM_HEAL_ALL: 2,
		ITEM_HEAL_SINGLE: 2,
		ITEM_POISON_SINGLE: 2,
		ITEM_POISON_ALL: 2,
		ITEM_CLEANSE_SINGLE: 2,
	}


static func create_formation_preview_battle(encounter_zone: Dictionary) -> Dictionary:
	var state := create_wild_battle(encounter_zone)
	state["id"] = "local_formation_preview_battle"
	state["formationTemplate"] = FORMATION_TEMPLATE_10V10
	state["message"] = "双方阵型展开。"
	state["actors"] = _formation_preview_actors()
	return _with_default_player_pet_party(state)


static func create_stat_formula_test_battle(encounter_zone: Dictionary) -> Dictionary:
	var zone_name := str(encounter_zone.get("name", "野外"))
	var state := {
		"id": "local_stat_formula_test_battle",
		"formationTemplate": FORMATION_TEMPLATE_10V10,
		"round": 1,
		"phase": "command",
		"sourceZoneId": str(encounter_zone.get("id", "")),
		"targetSeed": "stat_formula_test",
		"message": "%s 数值验证战斗。旁路日志会记录速度和伤害公式。" % zone_name,
		"itemBag": default_item_bag(),
		"captureToolBag": CaptureToolCatalog.starting_inventory(),
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
			5,
			6,
			[],
			"wuli_normal_orange_fire10"
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
			5,
			6,
			[],
			"wuli_normal_orange_fire10"
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
			14,
			6,
			[],
			"bui_normal_red_fire10"
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


static func _training_partner_enemy_group_actors(encounter_zone: Dictionary, enemy_count: int) -> Array[Dictionary]:
	var actors: Array[Dictionary] = []
	var count := clampi(enemy_count, 1, SLOTS_PER_ROW * 2)
	for index in range(count):
		var battle_slot_number := index + 1
		var wild_pet := _wild_pet_entry_for_zone_index(encounter_zone, index)
		var form_id := str(wild_pet.get("formId", "wuli_normal_orange_fire10"))
		var base_name := _wild_pet_name(wild_pet, form_id)
		var base_stats := _wild_pet_battle_stats(wild_pet, form_id)
		var enemy_level := maxi(1, int(wild_pet.get("level", wild_pet.get("levelMin", 1))))
		var front_row := battle_slot_number <= SLOTS_PER_ROW
		var slot := battle_slot_number if front_row else battle_slot_number - SLOTS_PER_ROW
		var row := ROW_FRONT if front_row else ROW_BACK
		var actor_id := "enemy_%s_%d" % [row, slot]
		var name := "%s%d" % [base_name, battle_slot_number]
		var max_hp := maxi(1, int(base_stats.get("maxHp", 80)) + index * 4)
		var actor := _make_actor(
			actor_id,
			name,
			SIDE_ENEMY,
			"wild_pet",
			slot_id_for_number(SIDE_ENEMY, battle_slot_number),
			int(base_stats.get("hp", max_hp)),
			max_hp,
			int(base_stats.get("quick", base_stats.get("agility", 48))) + (index % SLOTS_PER_ROW) * 2,
			int(base_stats.get("attack", 10)),
			int(base_stats.get("defense", 6)),
			[],
			form_id
		)
		actor["level"] = enemy_level
		actors.append(actor)
	return actors


static func slot_id_for_number(side: String, battle_slot_number: int) -> String:
	var number := clampi(battle_slot_number, 1, SLOTS_PER_ROW * 2)
	var row := ROW_FRONT if number <= SLOTS_PER_ROW else ROW_BACK
	var row_slot := number if row == ROW_FRONT else number - SLOTS_PER_ROW
	return slot_id(side, row, row_slot)


static func uses_10v10_formation(state: Dictionary) -> bool:
	return str(state.get("formationTemplate", "")) == FORMATION_TEMPLATE_10V10


static func _stat_formula_test_actors() -> Array[Dictionary]:
	return [
		_make_actor("enemy_back_1", "高速乌力", SIDE_ENEMY, "wild_pet", "enemy.back.1", 170, 170, 118, 13, 8, [], "wuli_normal_fast_wind10"),
		_make_actor("enemy_back_2", "普通乌力", SIDE_ENEMY, "wild_pet", "enemy.back.2", 170, 170, 62, 12, 8, [], "wuli_normal_orange_fire10"),
		_make_actor("enemy_back_3", "慢速乌力", SIDE_ENEMY, "wild_pet", "enemy.back.3", 170, 170, 22, 12, 8, [], "wuli_normal_orange_fire10"),
		_make_actor("enemy_back_4", "厚皮乌力", SIDE_ENEMY, "wild_pet", "enemy.back.4", 190, 190, 48, 10, 32, [], "wuli_normal_tough_earth10"),
		_make_actor("enemy_back_5", "普通乌力B", SIDE_ENEMY, "wild_pet", "enemy.back.5", 170, 170, 54, 11, 8, [], "wuli_normal_orange_fire10"),
		_make_actor("enemy_front_1", "快乌力", SIDE_ENEMY, "wild_pet", "enemy.front.1", 160, 160, 96, 12, 7, [], "wuli_normal_fast_wind10"),
		_make_actor("enemy_front_2", "普通靶乌力", SIDE_ENEMY, "wild_pet", "enemy.front.2", 190, 190, 50, 10, 8, [], "wuli_normal_orange_fire10"),
		_make_actor("enemy_front_3", "低防乌力", SIDE_ENEMY, "wild_pet", "enemy.front.3", 220, 220, 46, 10, 2, [], "wuli_normal_orange_fire10"),
		_make_actor("enemy_front_4", "高防乌力", SIDE_ENEMY, "wild_pet", "enemy.front.4", 220, 220, 46, 10, 34, [], "wuli_normal_tough_earth10"),
		_make_actor("enemy_front_5", "慢乌力", SIDE_ENEMY, "wild_pet", "enemy.front.5", 160, 160, 18, 10, 8, [], "wuli_normal_orange_fire10"),
		_make_actor("ally_front_1", "高速布伊", SIDE_ALLY, "pet", "ally.front.1", 130, 130, 110, 15, 7, [], "bui_normal_yellow_wind10"),
		_make_actor("ally_front_2", "普通布伊", SIDE_ALLY, "pet", "ally.front.2", 130, 130, 62, 15, 7, [], "bui_normal_red_fire10"),
		_make_actor(PLAYER_PET_ID, "我的布伊", SIDE_ALLY, "pet", "ally.front.3", 140, 140, 72, 18, 8, [], "bui_normal_red_fire10"),
		_make_actor("ally_front_4", "厚皮布伊", SIDE_ALLY, "pet", "ally.front.4", 150, 150, 45, 14, 28, [], "bui_normal_thick_earth10"),
		_make_actor("ally_front_5", "慢速布伊", SIDE_ALLY, "pet", "ally.front.5", 130, 130, 24, 15, 7, [], "bui_normal_red_fire10"),
		_make_actor("ally_speed_fast", "高速猎人", SIDE_ALLY, "player", "ally.back.1", 150, 150, 130, 18, 9),
		_make_actor("ally_speed_normal", "普通猎人", SIDE_ALLY, "player", "ally.back.2", 150, 150, 70, 18, 9),
		_make_actor(PLAYER_ACTOR_ID, "我本人", SIDE_ALLY, "player", "ally.back.3", 160, 160, 72, 22, 10),
		_make_actor("ally_speed_slow", "慢速猎人", SIDE_ALLY, "player", "ally.back.4", 150, 150, 24, 18, 9),
		_make_actor("ally_attack_high", "高攻猎人", SIDE_ALLY, "player", "ally.back.5", 150, 150, 66, 36, 9),
	]


static func _make_actor(actor_id: String, actor_name: String, side: String, kind: String, slot_id: String, hp: int, max_hp: int, quick: int = 50, attack_power: int = 12, defense_power: int = 6, passive_skill_ids: Array = [], form_id: String = "") -> Dictionary:
	var stat_overrides := {
		"hp": hp,
		"maxHp": max_hp,
		"quick": quick,
		"attack": attack_power,
		"defense": defense_power,
	}
	var actor := PetTemplateCatalog.actor_from_form(form_id, actor_id, side, kind, slot_id, actor_name, stat_overrides) if form_id != "" else {}
	if actor.is_empty():
		actor = {
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
			"statuses": BattleStatusModel.empty_statuses(),
			"statusResist": {},
			"statusImmune": {},
			"passiveSkillIds": _string_array(passive_skill_ids),
		}
	else:
		actor["statuses"] = BattleStatusModel.empty_statuses()
		actor["statusResist"] = {}
		actor["statusImmune"] = {}
		if not passive_skill_ids.is_empty():
			actor["passiveSkillIds"] = _merged_string_array(actor.get("passiveSkillIds", []), passive_skill_ids)
	return BattlePassiveCatalog.apply_actor_passive_effects(actor)


static func _wild_pet_entry_for_zone(encounter_zone: Dictionary) -> Dictionary:
	var selected = encounter_zone.get("selectedWildPet", {})
	if selected is Dictionary:
		var selected_entry := _normalized_wild_pet_entry(selected as Dictionary)
		if not selected_entry.is_empty():
			return selected_entry
	var raw_pool = encounter_zone.get("wildPetPool", [])
	if raw_pool is Array:
		for value in raw_pool:
			if value is Dictionary:
				var entry := _normalized_wild_pet_entry(value as Dictionary)
				if not entry.is_empty():
					return entry
	return _normalized_wild_pet_entry({
		"formId": "wuli_normal_orange_fire10",
		"name": "野生乌力",
		"level": 1,
		"battleStats": {
			"maxHp": 80,
			"attack": 10,
			"defense": 6,
			"agility": 48,
		},
	})


static func _wild_pet_entry_for_zone_index(encounter_zone: Dictionary, index: int) -> Dictionary:
	var selected_values = encounter_zone.get("selectedWildPets", [])
	if selected_values is Array:
		var selected_array := selected_values as Array
		if index >= 0 and index < selected_array.size() and selected_array[index] is Dictionary:
			var selected_entry := _normalized_wild_pet_entry(selected_array[index] as Dictionary)
			if not selected_entry.is_empty():
				return selected_entry
	return _wild_pet_entry_for_zone(encounter_zone)


static func _normalized_wild_pet_entry(value: Dictionary) -> Dictionary:
	var form_id := str(value.get("formId", value.get("templateId", ""))).strip_edges()
	if form_id == "" or PetTemplateCatalog.runtime_template_for_form(form_id).is_empty():
		return {}
	var level_min := maxi(1, int(value.get("levelMin", value.get("level", 1))))
	var level_max := maxi(level_min, int(value.get("levelMax", value.get("level", level_min))))
	var level := clampi(int(value.get("level", level_min)), level_min, level_max)
	var entry := {
		"formId": form_id,
		"name": str(value.get("name", "")),
		"weight": maxf(0.0, float(value.get("weight", 1.0))),
		"levelMin": level_min,
		"levelMax": level_max,
		"level": level,
	}
	var stats = value.get("battleStats", {})
	if stats is Dictionary:
		entry["battleStats"] = (stats as Dictionary).duplicate(true)
	return entry


static func _wild_pet_name(entry: Dictionary, form_id: String) -> String:
	var name := str(entry.get("name", "")).strip_edges()
	if name != "":
		return name
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	return str(template.get("formName", "野生宠物"))


static func _wild_pet_battle_stats(entry: Dictionary, form_id: String) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	var base_stats = template.get("baseStats", {})
	var base_stats_dict := base_stats as Dictionary if base_stats is Dictionary else {}
	var stats = entry.get("battleStats", {})
	var stats_dict := stats as Dictionary if stats is Dictionary else {}
	var max_hp := int(stats_dict.get("maxHp", base_stats_dict.get("maxHp", 80)))
	return {
		"hp": int(stats_dict.get("hp", max_hp)),
		"maxHp": max_hp,
		"attack": int(stats_dict.get("attack", base_stats_dict.get("attack", 10))),
		"defense": int(stats_dict.get("defense", base_stats_dict.get("defense", 6))),
		"quick": int(stats_dict.get("quick", stats_dict.get("agility", base_stats_dict.get("agility", 48)))),
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
	var active_passives := BattlePassiveCatalog.passive_ids_for_actor(active_pet)
	var active_form_id := str(active_pet.get("formId", active_pet.get("templateId", "bui_normal_red_fire10")))
	return [
		_make_pet_party_entry("pet_bui_main", active_name, active_form_id, active_hp, active_max_hp, active_quick, active_attack, active_defense, PET_STATE_BATTLE, PLAYER_PET_ID, active_passives, active_form_id, _pet_metadata_from_actor(active_pet)),
		_make_pet_party_entry_from_form("pet_bui_speed", "黄色普通布伊", "bui_normal_yellow_wind10", PET_STATE_STANDBY, ""),
		_make_pet_party_entry_from_form("pet_bui_tough", "厚皮布伊", "bui_normal_thick_earth10", PET_STATE_STANDBY, ""),
		_make_pet_party_entry_from_form("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", PET_STATE_REST, "", {"maxHp": 130, "quick": 50, "attack": 15, "defense": 8}),
	]


static func _make_pet_party_entry_from_form(pet_id: String, pet_name: String, form_id: String, state: String, actor_id: String, stat_overrides: Dictionary = {}) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	var stats = template.get("baseStats", {})
	var stats_dict := stats as Dictionary if stats is Dictionary else {}
	var max_hp := int(stat_overrides.get("maxHp", stats_dict.get("maxHp", 1)))
	var hp := int(stat_overrides.get("hp", max_hp))
	return _make_pet_party_entry(
		pet_id,
		pet_name if pet_name != "" else str(template.get("formName", "宠物")),
		form_id,
		hp,
		max_hp,
		int(stat_overrides.get("quick", stats_dict.get("agility", 50))),
		int(stat_overrides.get("attack", stats_dict.get("attack", 12))),
		int(stat_overrides.get("defense", stats_dict.get("defense", 6))),
		state,
		actor_id,
		PetTemplateCatalog.passive_ids_for_form(form_id),
		form_id,
		_pet_metadata_from_template(template)
	)


static func _make_pet_party_entry(pet_id: String, pet_name: String, template_id: String, hp: int, max_hp: int, quick: int, attack_power: int, defense_power: int, state: String, actor_id: String, passive_skill_ids: Array = [], form_id: String = "", metadata: Dictionary = {}) -> Dictionary:
	var entry := {
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
		"passiveSkillIds": _string_array(passive_skill_ids),
	}
	if form_id != "":
		entry["formId"] = form_id
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds"]:
		if metadata.has(key):
			entry[key] = metadata.get(key)
	return entry


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
		entry["passiveSkillIds"] = BattlePassiveCatalog.passive_ids_for_actor(actor)
		for key in ["templateId", "formId", "lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds"]:
			if actor.has(key):
				entry[key] = actor.get(key)
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


static func _actors(state: Dictionary) -> Array[Dictionary]:
	var actors: Array[Dictionary] = []
	var raw_actors = state.get("actors", [])
	if raw_actors is Array:
		for value in raw_actors:
			if value is Dictionary:
				actors.append(value as Dictionary)
	return actors


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


static func set_actor_status(state: Dictionary, actor_id: String, status_id: String, turns: int, potency: int = 0, source_id: String = "") -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	actor = BattleStatusModel.apply_status(actor, status_id, turns, potency, source_id)
	actors[index] = actor
	state["actors"] = actors
	return state


static func clear_actor_status(state: Dictionary, actor_id: String, status_id: String) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	actor = BattleStatusModel.remove_status(actor, status_id)
	actors[index] = actor
	state["actors"] = actors
	return state


static func actor_statuses_for_trace(actor: Dictionary) -> Dictionary:
	return BattleStatusModel.trace_statuses(actor)


static func set_actor_status_resist(state: Dictionary, actor_id: String, status_id: String, resistance: float) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	var resist = actor.get("statusResist", {})
	var next_resist := (resist as Dictionary).duplicate(true) if resist is Dictionary else {}
	next_resist[status_id] = clampf(resistance, 0.0, 1.0)
	actor["statusResist"] = next_resist
	actors[index] = actor
	state["actors"] = actors
	return state


static func actor_status_resist_for_trace(actor: Dictionary) -> Dictionary:
	var result := {}
	var resist = actor.get("statusResist", {})
	if not (resist is Dictionary):
		return result
	for key in (resist as Dictionary).keys():
		result[str(key)] = clampf(float((resist as Dictionary).get(key, 0.0)), 0.0, 1.0)
	return result


static func set_actor_status_immune(state: Dictionary, actor_id: String, status_id: String, immune: bool = true) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var index := actor_index(state, actor_id)
	if index < 0:
		return state
	var actor := actors[index] as Dictionary
	var immune_value = actor.get("statusImmune", {})
	var next_immune := (immune_value as Dictionary).duplicate(true) if immune_value is Dictionary else {}
	next_immune[status_id] = immune
	actor["statusImmune"] = next_immune
	actors[index] = actor
	state["actors"] = actors
	return state


static func actor_status_immune_for_trace(actor: Dictionary) -> Dictionary:
	var result := {}
	var immune_value = actor.get("statusImmune", {})
	if not (immune_value is Dictionary):
		return result
	for key in (immune_value as Dictionary).keys():
		result[str(key)] = bool((immune_value as Dictionary).get(key, false))
	return result


static func actor_passive_skill_ids_for_trace(actor: Dictionary) -> Array[String]:
	return BattlePassiveCatalog.passive_ids_for_actor(actor)


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result


static func _merged_string_array(first, second) -> Array[String]:
	var result: Array[String] = []
	for source in [first, second]:
		if source is Array:
			for item in source:
				var text := str(item)
				if text != "" and not result.has(text):
					result.append(text)
	return result


static func _pet_metadata_from_actor(actor: Dictionary) -> Dictionary:
	var result := {}
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formId", "formName", "growthProfileId", "elements", "activeSkillIds"]:
		if actor.has(key):
			result[key] = actor.get(key)
	return result


static func _pet_metadata_from_template(template: Dictionary) -> Dictionary:
	var result := {}
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formId", "formName", "growthProfileId", "elements", "activeSkillIds"]:
		if template.has(key):
			result[key] = template.get(key)
	return result


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


static func capture_tool_inventory(state: Dictionary) -> Dictionary:
	return CaptureToolCatalog.normalize_inventory(state.get("captureToolBag", {}))


static func capture_tool_count(state: Dictionary, tool_id: String) -> int:
	return CaptureToolCatalog.count_for(capture_tool_inventory(state), tool_id)


static func has_capture_tool(state: Dictionary, tool_id: String) -> bool:
	return CaptureToolCatalog.can_use(capture_tool_inventory(state), tool_id)


static func set_capture_tool_count(state: Dictionary, tool_id: String, count: int) -> Dictionary:
	var normalized_tool_id := CaptureToolCatalog.normalized_tool_id(tool_id)
	var inventory := capture_tool_inventory(state)
	if CaptureToolCatalog.is_consumable(normalized_tool_id):
		inventory[normalized_tool_id] = maxi(0, count)
	state["captureToolBag"] = CaptureToolCatalog.normalize_inventory(inventory)
	return state


static func consume_capture_tool(state: Dictionary, tool_id: String) -> Dictionary:
	state["captureToolBag"] = CaptureToolCatalog.consume(capture_tool_inventory(state), tool_id)
	return state


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
	var allied_ai_should_hold := player_command_id == "capture" or bool(player_command.get("captureHold", false)) or bool(pet_command.get("captureHold", false))
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
		if allied_ai_should_hold:
			entries.append(_make_defend_event(state, ally_id, sequence))
			sequence += 1
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
	if str(player_command.get("command", "")) == "capture" or bool(player_command.get("captureHold", false)) or bool(pet_command.get("captureHold", false)):
		for ally_id in living_actor_ids(state, SIDE_ALLY):
			if ally_id != player_id and not ids.has(ally_id):
				ids.append(ally_id)
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
				return _make_capture_event(state, player_id, enemy_target_id, sequence, str(command.get("captureToolId", CAPTURE_TOOL_EMPTY_HAND)))
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
		ITEM_CLEANSE_SINGLE:
			var cleanse_target_id := str(command.get("allyTargetId", ""))
			if not _is_living_side_actor(state, cleanse_target_id, SIDE_ALLY):
				cleanse_target_id = best_ally_heal_target_id(state)
			if BattleActionCatalog.action_can_target_side(item_id, SIDE_ALLY) and cleanse_target_id != "":
				return _make_item_cleanse_event(state, player_id, cleanse_target_id, sequence)
		_:
			var ally_target_id := str(command.get("allyTargetId", ""))
			if not _is_living_side_actor(state, ally_target_id, SIDE_ALLY):
				ally_target_id = best_ally_heal_target_id(state)
			if BattleActionCatalog.action_can_target_side(item_id, SIDE_ALLY) and ally_target_id != "":
				return _make_item_heal_event(state, player_id, ally_target_id, sequence, item_id)
	return {}


static func _make_pet_command_event(state: Dictionary, pet_id: String, command_id: String, command: Dictionary, enemy_target_id: String, sequence: int) -> Dictionary:
	match command_id:
		"pet_skill":
			if enemy_target_id != "":
				return _make_skill_event(state, pet_id, enemy_target_id, sequence, str(command.get("skillId", PET_SKILL_BUI_CHARGE)))
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


static func _make_skill_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int, skill_id: String = PET_SKILL_BUI_CHARGE) -> Dictionary:
	if skill_id == "":
		skill_id = PET_SKILL_BUI_CHARGE
	if BattleActionCatalog.effect_type_for(skill_id) == "status":
		return _make_status_skill_event(state, attacker_id, target_id, sequence, skill_id)
	return {
		"type": "skill_attack",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"damage": _skill_damage_for(state, attacker_id, target_id, skill_id),
		"speed": _effective_action_speed(state, attacker_id, "pet_skill"),
		"sequence": sequence,
		"skillId": skill_id,
		"skillName": BattleActionCatalog.label_for(skill_id, "宠物技能"),
		"movementStyle": "melee",
		"canLaunch": true,
	}


static func _make_status_skill_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int, skill_id: String) -> Dictionary:
	return {
		"type": "skill_status",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"speed": _effective_action_speed(state, attacker_id, "pet_skill"),
		"sequence": sequence,
		"skillId": skill_id,
		"skillName": BattleActionCatalog.label_for(skill_id, "宠物技能"),
		"statusId": BattleActionCatalog.effect_status_id_for(skill_id, ""),
		"statusTurns": BattleActionCatalog.effect_status_turns_for(skill_id, 1),
		"statusPotency": BattleActionCatalog.effect_status_potency_for(skill_id, 0, 0),
		"statusHitRate": BattleActionCatalog.effect_status_hit_rate_for(skill_id, 1.0),
		"movementStyle": "ranged_status",
		"canLaunch": false,
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
		"statusId": BattleActionCatalog.effect_status_id_for(SPIRIT_POISON_SINGLE, STATUS_POISON),
		"statusTurns": BattleActionCatalog.effect_status_turns_for(SPIRIT_POISON_SINGLE, 3),
		"statusPotency": BattleActionCatalog.effect_status_potency_for(SPIRIT_POISON_SINGLE, BattleActionCatalog.effect_amount_for(SPIRIT_POISON_SINGLE, 18), _poison_tick_damage_for(BattleActionCatalog.effect_amount_for(SPIRIT_POISON_SINGLE, 18))),
		"statusHitRate": BattleActionCatalog.effect_status_hit_rate_for(SPIRIT_POISON_SINGLE, 1.0),
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
		"statusId": BattleActionCatalog.effect_status_id_for(SPIRIT_POISON_ALL, STATUS_POISON),
		"statusTurns": BattleActionCatalog.effect_status_turns_for(SPIRIT_POISON_ALL, 3),
		"statusPotency": BattleActionCatalog.effect_status_potency_for(SPIRIT_POISON_ALL, BattleActionCatalog.effect_amount_for(SPIRIT_POISON_ALL, 10), _poison_tick_damage_for(BattleActionCatalog.effect_amount_for(SPIRIT_POISON_ALL, 10))),
		"statusHitRate": BattleActionCatalog.effect_status_hit_rate_for(SPIRIT_POISON_ALL, 1.0),
	}


static func _make_item_heal_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int, item_id: String = ITEM_HEAL_SINGLE) -> Dictionary:
	return {
		"type": "item_heal",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ALLY,
		"heal": BattleActionCatalog.effect_amount_for(item_id, 42),
		"speed": _effective_action_speed(state, attacker_id, "item"),
		"sequence": sequence,
		"itemName": BattleActionCatalog.label_for(item_id, "回复药5"),
		"itemId": item_id,
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
		"statusId": BattleActionCatalog.effect_status_id_for(ITEM_POISON_SINGLE, STATUS_POISON),
		"statusTurns": BattleActionCatalog.effect_status_turns_for(ITEM_POISON_SINGLE, 3),
		"statusPotency": BattleActionCatalog.effect_status_potency_for(ITEM_POISON_SINGLE, BattleActionCatalog.effect_amount_for(ITEM_POISON_SINGLE, 12), _poison_tick_damage_for(BattleActionCatalog.effect_amount_for(ITEM_POISON_SINGLE, 12))),
		"statusHitRate": BattleActionCatalog.effect_status_hit_rate_for(ITEM_POISON_SINGLE, 1.0),
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
		"statusId": BattleActionCatalog.effect_status_id_for(ITEM_POISON_ALL, STATUS_POISON),
		"statusTurns": BattleActionCatalog.effect_status_turns_for(ITEM_POISON_ALL, 3),
		"statusPotency": BattleActionCatalog.effect_status_potency_for(ITEM_POISON_ALL, BattleActionCatalog.effect_amount_for(ITEM_POISON_ALL, 7), _poison_tick_damage_for(BattleActionCatalog.effect_amount_for(ITEM_POISON_ALL, 7))),
		"statusHitRate": BattleActionCatalog.effect_status_hit_rate_for(ITEM_POISON_ALL, 1.0),
	}


static func _make_item_cleanse_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int) -> Dictionary:
	return {
		"type": "item_cleanse",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ALLY,
		"speed": _effective_action_speed(state, attacker_id, "item"),
		"sequence": sequence,
		"itemName": BattleActionCatalog.label_for(ITEM_CLEANSE_SINGLE, "净化草5"),
		"itemId": ITEM_CLEANSE_SINGLE,
		"statusIds": BattleActionCatalog.effect_status_ids_for(ITEM_CLEANSE_SINGLE),
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


static func _make_capture_event(state: Dictionary, attacker_id: String, target_id: String, sequence: int, tool_id: String = CAPTURE_TOOL_EMPTY_HAND) -> Dictionary:
	var capture_tool_id := CaptureToolCatalog.normalized_tool_id(tool_id)
	if not has_capture_tool(state, capture_tool_id):
		return {}
	return {
		"type": "capture",
		"attackerId": attacker_id,
		"targetId": target_id,
		"targetSide": SIDE_ENEMY,
		"speed": _effective_action_speed(state, attacker_id, "capture"),
		"sequence": sequence,
		"captureToolId": capture_tool_id,
		"captureToolLabel": CaptureToolCatalog.full_name_for(capture_tool_id),
		"captureChance": capture_chance(state, attacker_id, target_id, capture_tool_id),
		"captureRoll": capture_roll(state, attacker_id, target_id, capture_tool_id, sequence),
		"success": capture_would_succeed(state, attacker_id, target_id, capture_tool_id, sequence),
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
		if not _combo_start_roll_succeeds(state, current):
			events.append(current)
			index += 1
			continue
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
	var combo_side := ""
	for value in combo_entries:
		var combo_entry := value as Dictionary
		var combo_actor_id := str(combo_entry.get("attackerId", ""))
		var combo_actor := actor_by_id(state, combo_actor_id)
		if combo_actor.is_empty():
			return false
		var actor_side := str(combo_actor.get("side", ""))
		if combo_side == "":
			combo_side = actor_side
		elif actor_side != combo_side:
			return false
		if seen_actor_ids.has(combo_actor_id):
			return false
		seen_actor_ids.append(combo_actor_id)
	var next_actor_id := str(next.get("attackerId", ""))
	var next_actor := actor_by_id(state, str(next.get("attackerId", "")))
	if next_actor.is_empty() or str(next_actor.get("side", "")) != combo_side:
		return false
	if seen_actor_ids.has(next_actor_id):
		return false
	return _is_living_side_actor(state, next_actor_id, combo_side)


static func _combo_start_roll_succeeds(state: Dictionary, event: Dictionary) -> bool:
	if str(event.get("type", "")) != "attack":
		return false
	var chance := combo_chance_for_event(state, event)
	var seed_text := _battle_roll_seed(state, "combo", str(event.get("attackerId", "")), str(event.get("targetId", "")), int(event.get("sequence", 0)))
	return _stable_roll(seed_text) < chance


static func combo_chance_for_event(state: Dictionary, event: Dictionary) -> float:
	if str(event.get("type", "")) != "attack":
		return 0.0
	var attacker := actor_by_id(state, str(event.get("attackerId", "")))
	if attacker.is_empty():
		return 0.0
	if event.has("comboRateOverride"):
		return clampf(_rate_value(event.get("comboRateOverride"), 0.0), 0.0, 1.0)
	if attacker.has("comboRateOverride"):
		return clampf(_rate_value(attacker.get("comboRateOverride"), 0.0), 0.0, 1.0)
	var chance := combo_base_rate_for_actor(attacker)
	chance += _rate_value(state.get("comboBonusRate", 0.0), 0.0)
	var side_bonus_map = state.get("comboBonusRateBySide", {})
	if side_bonus_map is Dictionary:
		chance += _rate_value((side_bonus_map as Dictionary).get(str(attacker.get("side", "")), 0.0), 0.0)
	chance += _rate_value(attacker.get("comboBonusRate", attacker.get("comboBonus", 0.0)), 0.0)
	chance += _rate_value(event.get("comboBonusRate", event.get("comboBonus", 0.0)), 0.0)
	return clampf(chance, 0.0, 1.0)


static func combo_base_rate_for_actor(actor: Dictionary) -> float:
	if actor.has("comboBaseRateOverride"):
		return clampf(_rate_value(actor.get("comboBaseRateOverride"), COMBATANT_COMBO_BASE_RATE), 0.0, 1.0)
	var combo_class := str(actor.get("comboClass", "")).to_lower()
	if ["monster", "wild", "wild_pet", "enemy"].has(combo_class):
		return MONSTER_COMBO_BASE_RATE
	if ["combatant", "player", "pet", "pvp"].has(combo_class):
		return COMBATANT_COMBO_BASE_RATE
	var stoneage_type := str(actor.get("stoneAgeType", "")).to_lower()
	if ["enemy", "char_typeenemy", "char_type_enemy"].has(stoneage_type):
		return MONSTER_COMBO_BASE_RATE
	if ["player", "pet", "char_typeplayer", "char_type_player", "char_typepet", "char_type_pet"].has(stoneage_type):
		return COMBATANT_COMBO_BASE_RATE
	var kind := str(actor.get("kind", "")).to_lower()
	if ["wild_pet", "enemy", "wild", "monster"].has(kind):
		return MONSTER_COMBO_BASE_RATE
	return COMBATANT_COMBO_BASE_RATE


static func _rate_value(value, fallback: float) -> float:
	var value_type := typeof(value)
	if value_type != TYPE_FLOAT and value_type != TYPE_INT:
		return fallback
	var rate := float(value)
	if absf(rate) > 1.0:
		rate *= 0.01
	return rate


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


static func capture_chance(state: Dictionary, attacker_id: String, target_id: String, capture_tool_id: String = CAPTURE_TOOL_EMPTY_HAND) -> float:
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return 0.0
	var target := actor_by_id(state, target_id)
	if target.is_empty() or not bool(target.get("catchable", false)):
		return 0.0
	var max_hp := maxf(1.0, float(target.get("maxHp", 1)))
	var hp_ratio := clampf(float(target.get("hp", 0)) / max_hp, 0.0, 1.0)
	var difficulty := clampf(float(target.get("captureDifficulty", 42)) / 100.0, 0.0, 0.9)
	var chance := 0.42 - hp_ratio * 0.22 - difficulty * 0.12
	chance += CaptureToolCatalog.chance_bonus_for(capture_tool_id)
	chance += _capture_status_bonus_for_actor(target)
	return clampf(chance, 0.05, 0.95)


static func capture_roll(state: Dictionary, attacker_id: String, target_id: String, capture_tool_id: String = CAPTURE_TOOL_EMPTY_HAND, sequence: int = 0) -> float:
	var seed_text := "%s:%s" % [
		_battle_roll_seed(state, "capture", attacker_id, target_id, sequence),
		CaptureToolCatalog.normalized_tool_id(capture_tool_id),
	]
	return _stable_roll(seed_text)


static func capture_would_succeed(state: Dictionary, attacker_id: String, target_id: String, capture_tool_id: String = CAPTURE_TOOL_EMPTY_HAND, sequence: int = 0) -> bool:
	if not has_capture_tool(state, capture_tool_id):
		return false
	var chance := capture_chance(state, attacker_id, target_id, capture_tool_id)
	if chance <= 0.0:
		return false
	return capture_roll(state, attacker_id, target_id, capture_tool_id, sequence) < chance


static func _capture_status_bonus_for_actor(actor: Dictionary) -> float:
	var bonus := 0.0
	if BattleStatusModel.has_status(actor, STATUS_SLEEP):
		bonus += 0.18
	if BattleStatusModel.has_status(actor, STATUS_STONE):
		bonus += 0.16
	if BattleStatusModel.has_status(actor, STATUS_CONFUSION):
		bonus += 0.10
	if BattleStatusModel.has_status(actor, STATUS_POISON):
		bonus += 0.05
	return bonus


static func apply_battle_event(state: Dictionary, event: Dictionary) -> Dictionary:
	state["lastEventApplied"] = false
	state["lastEventType"] = str(event.get("type", ""))
	state["lastEventLedger"] = {}
	state["lastDamage"] = 0
	state["lastHeal"] = 0
	state["lastTargetIds"] = []
	state["lastEffectPerTarget"] = {}
	state["lastCaptureSuccess"] = false
	state["lastCaptureToolId"] = CAPTURE_TOOL_EMPTY_HAND
	state["lastCaptureChance"] = -1.0
	state["lastCaptureRoll"] = -1.0
	state["lastLaunch"] = false
	state["lastLaunchMode"] = ""
	state["lastStatusId"] = ""
	state["lastStatusResult"] = ""
	state["lastStatusChanges"] = []
	state["lastStatusRoll"] = -1.0
	state["lastStatusChance"] = -1.0
	state["lastStatusResistance"] = 0.0
	state["lastStatusResultPerTarget"] = {}
	state["lastStatusRollPerTarget"] = {}
	state["lastStatusChancePerTarget"] = {}
	state["lastStatusResistancePerTarget"] = {}
	state["lastParticipants"] = event.get("participantIds", [])
	state["lastDodged"] = false
	state["lastCritical"] = false
	state["lastCounterEvent"] = {}
	state["lastCounterTriggered"] = false
	state["lastReactionKind"] = ""
	var event_type := str(event.get("type", ""))
	if event_type == "status_tick":
		return _apply_status_tick_event(state, event)
	if event_type == "status_skip":
		return _apply_status_skip_event(state, event, str(event.get("statusId", "")))
	var blocking_status_id := _blocking_status_for_event_actor(state, event)
	if blocking_status_id != "":
		return _apply_status_skip_event(state, event, blocking_status_id)
	if event_type == "skill_status":
		return _apply_status_apply_event(state, event)
	if event_type == "attack" or event_type == "skill_attack" or event_type == "combo_attack" or event_type == "counter_attack":
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
	if event_type == "item_cleanse":
		return _apply_item_consuming_event(state, event, "_apply_item_cleanse_event")
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
		"_apply_item_cleanse_event":
			next_state = _apply_item_cleanse_event(next_state, normalized)
	if bool(next_state.get("lastEventApplied", false)):
		next_state = consume_item(next_state, str(event.get("itemId", "")))
	return next_state


static func _normalize_item_event(event: Dictionary) -> Dictionary:
	var normalized := event.duplicate(true)
	normalized["skillName"] = str(event.get("itemName", "物品"))
	return normalized


static func _blocking_status_for_event_actor(state: Dictionary, event: Dictionary) -> String:
	var event_type := str(event.get("type", ""))
	if event_type == "status_tick" or event_type == "status_skip":
		return ""
	var attacker_id := str(event.get("attackerId", ""))
	if attacker_id == "":
		return ""
	var actor := actor_by_id(state, attacker_id)
	if actor.is_empty() or int(actor.get("hp", 0)) <= 0:
		return ""
	return BattleStatusModel.blocking_status_id(actor)


static func _apply_status_skip_event(state: Dictionary, event: Dictionary, status_id: String) -> Dictionary:
	var actor_id := str(event.get("attackerId", event.get("targetId", "")))
	var actors: Array = state.get("actors", [])
	var actor_index_value := actor_index(state, actor_id)
	if actor_index_value < 0:
		return state
	var actor := actors[actor_index_value] as Dictionary
	if int(actor.get("hp", 0)) <= 0:
		return state
	if status_id == "":
		status_id = BattleStatusModel.blocking_status_id(actor)
	if status_id == "":
		return state
	var previous_turns := BattleStatusModel.status_turns(actor, status_id)
	actor = BattleStatusModel.decrement_status(actor, status_id)
	actor["actionState"] = "status_%s" % status_id
	actors[actor_index_value] = actor
	state["actors"] = actors
	state = _remove_guarding_actor(state, actor_id)
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastEventType"] = "status_skip"
	state["lastAttackerId"] = actor_id
	state["lastTargetId"] = actor_id
	state["lastTargetIds"] = [actor_id]
	state["lastParticipants"] = [actor_id]
	state["lastStatusId"] = status_id
	state["lastStatusResult"] = "skip"
	state["lastStatusChanges"] = [{
		"actorId": actor_id,
		"statusId": status_id,
		"change": "decrement",
		"fromTurns": previous_turns,
		"toTurns": BattleStatusModel.status_turns(actor, status_id),
	}]
	state["message"] = "%s 处于%s状态，无法行动。" % [
		str(actor.get("name", "目标")),
		BattleStatusModel.status_label(status_id),
	]
	return state


static func _apply_status_tick_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var status_id := str(event.get("statusId", STATUS_POISON))
	var target_id := str(event.get("targetId", ""))
	var actors: Array = state.get("actors", [])
	var target_index := actor_index(state, target_id)
	if target_index < 0:
		return state
	var target := actors[target_index] as Dictionary
	if int(target.get("hp", 0)) <= 0 or not BattleStatusModel.has_status(target, status_id):
		return state
	var potency := maxi(1, int(event.get("damage", BattleStatusModel.status_potency(target, status_id))))
	var hp_before := int(target.get("hp", 0))
	var next_hp := maxi(0, hp_before - potency)
	var previous_turns := BattleStatusModel.status_turns(target, status_id)
	target["hp"] = next_hp
	target = BattleStatusModel.decrement_status(target, status_id)
	if next_hp <= 0:
		target["actionState"] = "down"
	else:
		target["actionState"] = "hit"
	actors[target_index] = target
	state["actors"] = actors
	state = _sync_player_pet_party_from_actor(state, target)
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastEventType"] = "status_tick"
	state["lastAttackerId"] = target_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastDamage"] = potency
	state["lastEffectPerTarget"] = {target_id: potency}
	state["lastParticipants"] = [target_id]
	state["lastStatusId"] = status_id
	state["lastStatusResult"] = "tick"
	state["lastStatusChanges"] = [{
		"actorId": target_id,
		"statusId": status_id,
		"change": "decrement",
		"fromTurns": previous_turns,
		"toTurns": BattleStatusModel.status_turns(target, status_id),
	}]
	state["message"] = "%s 因%s受到 %d 点伤害。" % [
		str(target.get("name", "目标")),
		BattleStatusModel.status_label(status_id),
		potency,
	]
	if next_hp <= 0:
		state["message"] += " %s 倒下了。" % str(target.get("name", "目标"))
	return state


static func _status_hit_check_for_event(state: Dictionary, event: Dictionary, target: Dictionary, status_id: String) -> Dictionary:
	var immune := _status_immunity_for_actor(target, status_id)
	if immune:
		return {
			"hit": false,
			"result": "immune",
			"chance": 0.0,
			"roll": -1.0,
			"resistance": _status_resistance_for_actor(target, status_id),
			"immune": true,
		}
	var action_id := _status_action_id_for_event(event)
	var base_rate := BattleActionCatalog.effect_status_hit_rate_for(action_id, 1.0) if action_id != "" else 1.0
	if event.has("statusHitRate"):
		base_rate = float(event.get("statusHitRate", base_rate))
	var resistance := _status_resistance_for_actor(target, status_id)
	var chance := clampf(base_rate - resistance, 0.0, 1.0)
	var seed_text := "%s:status:%s:%s:%s:%s:%d:%d" % [
		str(state.get("targetSeed", state.get("id", "battle"))),
		action_id,
		str(event.get("attackerId", "")),
		str(target.get("id", "")),
		status_id,
		int(state.get("round", 1)),
		int(event.get("sequence", 0)),
	]
	var roll := float(_stable_target_index(seed_text, 10000)) / 10000.0
	var hit := roll < chance
	return {
		"hit": hit,
		"result": "applied" if hit else "resisted",
		"chance": chance,
		"roll": roll,
		"resistance": resistance,
		"immune": false,
	}


static func _status_action_id_for_event(event: Dictionary) -> String:
	for key in ["skillId", "spiritId", "itemId"]:
		var value := str(event.get(key, ""))
		if value != "":
			return value
	return ""


static func _status_resistance_for_actor(actor: Dictionary, status_id: String) -> float:
	var resist = actor.get("statusResist", {})
	if not (resist is Dictionary):
		return 0.0
	var resist_dict := resist as Dictionary
	if resist_dict.has(status_id):
		return clampf(float(resist_dict.get(status_id, 0.0)), 0.0, 1.0)
	return clampf(float(resist_dict.get("all", 0.0)), 0.0, 1.0)


static func _status_immunity_for_actor(actor: Dictionary, status_id: String) -> bool:
	var immune_value = actor.get("statusImmune", {})
	if not (immune_value is Dictionary):
		return false
	var immune_dict := immune_value as Dictionary
	if bool(immune_dict.get("all", false)):
		return true
	return bool(immune_dict.get(status_id, false))


static func _write_single_status_check_to_state(state: Dictionary, status_check: Dictionary) -> Dictionary:
	state["lastStatusRoll"] = float(status_check.get("roll", -1.0))
	state["lastStatusChance"] = float(status_check.get("chance", -1.0))
	state["lastStatusResistance"] = float(status_check.get("resistance", 0.0))
	return state


static func _apply_status_apply_event(state: Dictionary, event: Dictionary) -> Dictionary:
	var attacker_id := str(event.get("attackerId", ""))
	var target_side := str(event.get("targetSide", SIDE_ENEMY))
	var target_id := str(event.get("targetId", ""))
	if not _is_living_side_actor(state, attacker_id, SIDE_ALLY):
		return state
	if not _is_living_side_actor(state, target_id, target_side):
		target_id = _fallback_target_id(state, target_side, attacker_id, int(event.get("sequence", 0)))
	if target_id == "":
		return state
	var status_id := str(event.get("statusId", ""))
	if status_id == "":
		return state
	var turns := maxi(1, int(event.get("statusTurns", 1)))
	var potency := maxi(0, int(event.get("statusPotency", 0)))
	var actors: Array = state.get("actors", [])
	var attacker_index := actor_index(state, attacker_id)
	var target_index := actor_index(state, target_id)
	if attacker_index < 0 or target_index < 0:
		return state
	var attacker := actors[attacker_index] as Dictionary
	var target := actors[target_index] as Dictionary
	var status_check := _status_hit_check_for_event(state, event, target, status_id)
	var status_result := str(status_check.get("result", "resisted"))
	var status_applied := status_result == "applied"
	var removed_status_ids: Array[String] = []
	if status_applied:
		removed_status_ids = BattleStatusModel.statuses_removed_by_apply(target, status_id)
	attacker["actionState"] = "skill"
	if status_applied:
		target = BattleStatusModel.apply_status(target, status_id, turns, potency, attacker_id)
	target["actionState"] = "hit"
	actors[attacker_index] = attacker
	actors[target_index] = target
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastParticipants"] = [attacker_id]
	state["lastStatusId"] = status_id
	state["lastStatusResult"] = status_result
	var status_changes: Array[Dictionary] = []
	for removed_status_id in removed_status_ids:
		status_changes.append({
			"actorId": target_id,
			"statusId": removed_status_id,
			"change": "remove_overwritten",
		})
	status_changes.append({
		"actorId": target_id,
		"statusId": status_id,
		"change": "apply" if status_applied else status_result,
		"turns": turns if status_applied else 0,
		"potency": potency if status_applied else 0,
		"chance": float(status_check.get("chance", 0.0)),
		"roll": float(status_check.get("roll", 0.0)),
		"resistance": float(status_check.get("resistance", 0.0)),
		"immune": bool(status_check.get("immune", false)),
	})
	state["lastStatusChanges"] = status_changes
	state = _write_single_status_check_to_state(state, status_check)
	var skill_name := str(event.get("skillName", "宠物技能"))
	var target_name := str(target.get("name", "目标"))
	var status_label := BattleStatusModel.status_label(status_id)
	if status_applied:
		state["message"] = "%s 使用%s，%s 陷入%s状态。" % [
			str(attacker.get("name", "宠物")),
			skill_name,
			target_name,
			status_label,
		]
	elif status_result == "immune":
		state["message"] = "%s 使用%s，%s 免疫了%s。" % [
			str(attacker.get("name", "宠物")),
			skill_name,
			target_name,
			status_label,
		]
	else:
		state["message"] = "%s 使用%s，%s 抵抗了%s。" % [
			str(attacker.get("name", "宠物")),
			skill_name,
			target_name,
			status_label,
		]
	return state


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
	var declared_target_id := target_id
	var status_changes: Array[Dictionary] = []
	var confusion_triggered := false
	if BattleStatusModel.has_status(first_attacker, STATUS_CONFUSION):
		var confused_target_id := _confusion_target_id(state, attacker_id, int(event.get("sequence", 0)))
		if confused_target_id != "":
			target_id = confused_target_id
			var confused_target := actor_by_id(state, target_id)
			target_side = str(confused_target.get("side", target_side))
			var previous_turns := BattleStatusModel.status_turns(first_attacker, STATUS_CONFUSION)
			state = _decrement_actor_status(state, attacker_id, STATUS_CONFUSION)
			first_attacker = actor_by_id(state, str(participant_ids[0]))
			status_changes.append({
				"actorId": attacker_id,
				"statusId": STATUS_CONFUSION,
				"change": "decrement",
				"fromTurns": previous_turns,
				"toTurns": BattleStatusModel.status_turns(first_attacker, STATUS_CONFUSION),
			})
			confusion_triggered = true
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
		if BattleStatusModel.blocking_status_id(participant) != "":
			continue
		participant["actionState"] = "combo" if event_type == "combo_attack" else ("skill" if event_type == "skill_attack" else "attack")
		actors[participant_index] = participant

	var target_index := actor_index(state, target_id)
	if target_index < 0:
		return state
	var target := actors[target_index] as Dictionary
	var hp_before := int(target.get("hp", 0))
	var dodged := _damage_event_is_dodged(state, event, attacker_id, target_id)
	var critical := false
	var damage := 0
	if dodged:
		target["actionState"] = "dodge"
		actors[target_index] = target
		state["actors"] = actors
		state["phase"] = "round_events"
		state["lastEventApplied"] = true
		state["lastAttackerId"] = attacker_id
		state["lastTargetId"] = target_id
		state["lastTargetIds"] = [target_id]
		state["lastDamage"] = 0
		state["lastEffectPerTarget"] = {target_id: 0}
		state["lastParticipants"] = participant_ids
		state["lastDodged"] = true
		state["lastCritical"] = false
		state["lastLaunch"] = false
		state["lastLaunchMode"] = ""
		state["lastCounterEvent"] = _counter_event_after_damage(state, event, attacker_id, target_id, target_side, hp_before, hp_before)
		state["lastCounterTriggered"] = not (state["lastCounterEvent"] as Dictionary).is_empty()
		state["lastReactionKind"] = "dodge"
		var dodged_attacker_name := str(first_attacker.get("name", "我方"))
		var dodged_target_name := str(target.get("name", "目标"))
		if event_type == "counter_attack":
			state["message"] = "%s 反击 %s，%s 回避了。" % [dodged_attacker_name, dodged_target_name, dodged_target_name]
		elif event_type == "skill_attack":
			state["message"] = "%s 使用%s，%s 回避了。" % [dodged_attacker_name, str(event.get("skillName", "技能")), dodged_target_name]
		else:
			state["message"] = "%s 攻击了 %s，%s 回避了。" % [dodged_attacker_name, dodged_target_name, dodged_target_name]
		return state

	damage = _resolved_damage_for_event(state, event, target_id, declared_target_id, participant_ids)
	critical = _damage_event_is_critical(state, event, attacker_id, target_id)
	if critical:
		damage = _critical_damage_for(state, attacker_id, target_id, damage)
	var next_hp := maxi(0, hp_before - damage)
	var max_hp := maxi(1, int(target.get("maxHp", hp_before)))
	var overkill := damage - hp_before
	var launch_threshold := maxi(12, int(round(float(max_hp) * 0.18)))
	var launched := bool(event.get("canLaunch", false)) and hp_before > 0 and next_hp <= 0 and overkill >= launch_threshold
	target["hp"] = next_hp
	if BattleStatusModel.has_status(target, STATUS_SLEEP):
		target = BattleStatusModel.remove_status(target, STATUS_SLEEP)
		status_changes.append({
			"actorId": target_id,
			"statusId": STATUS_SLEEP,
			"change": "remove_on_damage",
		})
	if launched:
		target["actionState"] = "launched"
		target["launched"] = true
		target["revivable"] = false
		if str(target.get("kind", "")) == "pet" or str(target.get("kind", "")) == "wild_pet":
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
	state["lastEffectPerTarget"] = {target_id: damage}
	state["lastParticipants"] = participant_ids
	state["lastLaunch"] = launched
	state["lastLaunchMode"] = _launch_mode_for_event(event, target_id) if launched else ""
	state["lastDodged"] = false
	state["lastCritical"] = critical
	state["lastCounterEvent"] = _counter_event_after_damage(state, event, attacker_id, target_id, target_side, hp_before, next_hp)
	state["lastCounterTriggered"] = not (state["lastCounterEvent"] as Dictionary).is_empty()
	state["lastReactionKind"] = "critical" if critical else ""
	if confusion_triggered:
		state["lastStatusId"] = STATUS_CONFUSION
		state["lastStatusResult"] = "confused_retarget"
	if not status_changes.is_empty():
		state["lastStatusChanges"] = status_changes

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
	elif event_type == "counter_attack":
		state["message"] = "%s 反击了 %s，造成 %d 点伤害。" % [str(first_attacker.get("name", "我方")), target_name, damage]
	else:
		state["message"] = "%s 攻击了 %s，造成 %d 点伤害。" % [str(first_attacker.get("name", "我方")), target_name, damage]
	if critical:
		state["message"] += " 触发幸运一击。"
	if launched:
		if str(target.get("kind", "")) == "pet" or str(target.get("kind", "")) == "wild_pet":
			state["message"] += " %s 被击飞，进入休息状态，无法在本场战斗中复活。" % target_name
		else:
			state["message"] += " %s 被击飞。" % target_name
	elif next_hp <= 0:
		state["message"] += " %s 倒下了。" % target_name
	return state


static func _resolved_damage_for_event(state: Dictionary, event: Dictionary, target_id: String, declared_target_id: String, participant_ids: Array) -> int:
	if target_id == declared_target_id:
		return maxi(1, int(event.get("damage", 1)))
	var event_type := str(event.get("type", ""))
	if event_type == "skill_attack":
		return _skill_damage_for(state, str(event.get("attackerId", "")), target_id, str(event.get("skillId", PET_SKILL_BUI_CHARGE)))
	if event_type == "combo_attack":
		var living_participants: Array[String] = []
		var total := 0
		for participant_value in participant_ids:
			var participant_id := str(participant_value)
			if not _is_living_side_actor(state, participant_id, SIDE_ALLY):
				continue
			if BattleStatusModel.blocking_status_id(actor_by_id(state, participant_id)) != "":
				continue
			living_participants.append(participant_id)
			total += _attack_damage_for(state, participant_id, target_id)
		if living_participants.is_empty():
			return maxi(1, int(event.get("damage", 1)))
		return maxi(1, total + 8 * maxi(1, living_participants.size() - 1))
	return _attack_damage_for(state, str(event.get("attackerId", "")), target_id)


static func _damage_event_is_dodged(state: Dictionary, event: Dictionary, attacker_id: String, target_id: String) -> bool:
	if not _damage_event_allows_dodge(event):
		return false
	if event.has("forceDodge"):
		return bool(event.get("forceDodge", false))
	var target := actor_by_id(state, target_id)
	if target.is_empty() or is_actor_guarding(state, target_id) or BattleStatusModel.blocking_status_id(target) != "":
		return false
	var chance := _dodge_rate_for(state, attacker_id, target_id)
	var seed_text := _battle_roll_seed(state, "dodge", attacker_id, target_id, int(event.get("sequence", 0)))
	return _stable_roll(seed_text) < chance


static func _damage_event_allows_dodge(event: Dictionary) -> bool:
	if not bool(event.get("canDodge", true)):
		return false
	return ["attack", "skill_attack", "counter_attack"].has(str(event.get("type", "")))


static func _damage_event_is_critical(state: Dictionary, event: Dictionary, attacker_id: String, target_id: String) -> bool:
	if not _damage_event_allows_critical(event):
		return false
	if event.has("forceCritical"):
		return bool(event.get("forceCritical", false))
	var chance := _critical_rate_for(state, attacker_id, target_id)
	var seed_text := _battle_roll_seed(state, "critical", attacker_id, target_id, int(event.get("sequence", 0)))
	return _stable_roll(seed_text) < chance


static func _damage_event_allows_critical(event: Dictionary) -> bool:
	if not bool(event.get("canCritical", true)):
		return false
	return ["attack", "skill_attack", "counter_attack"].has(str(event.get("type", "")))


static func _counter_event_after_damage(state: Dictionary, event: Dictionary, attacker_id: String, target_id: String, target_side: String, hp_before: int, hp_after: int) -> Dictionary:
	if str(event.get("type", "")) != "attack" or bool(event.get("isCounter", false)):
		return {}
	if event.has("canCounter") and not bool(event.get("canCounter", true)):
		return {}
	if hp_before <= 0 or hp_after <= 0:
		return {}
	var attacker := actor_by_id(state, attacker_id)
	var counter_actor := actor_by_id(state, target_id)
	if attacker.is_empty() or counter_actor.is_empty():
		return {}
	if int(attacker.get("hp", 0)) <= 0 or int(counter_actor.get("hp", 0)) <= 0:
		return {}
	if BattleStatusModel.blocking_status_id(counter_actor) != "":
		return {}
	var chance := _counter_rate_for(state, target_id, attacker_id)
	var sequence := int(event.get("sequence", 0))
	var seed_text := _battle_roll_seed(state, "counter", target_id, attacker_id, sequence)
	if _stable_roll(seed_text) >= chance:
		return {}
	return {
		"type": "counter_attack",
		"attackerId": target_id,
		"targetId": attacker_id,
		"targetSide": str(attacker.get("side", target_side)),
		"damage": _counter_damage_for(state, target_id, attacker_id),
		"speed": int(event.get("speed", 0)),
		"sequence": sequence + 500,
		"movementStyle": "melee",
		"canLaunch": true,
		"isCounter": true,
	}


static func _dodge_rate_for(state: Dictionary, attacker_id: String, target_id: String) -> float:
	var target := actor_by_id(state, target_id)
	if target.has("dodgeRateOverride"):
		return clampf(float(target.get("dodgeRateOverride", 0.0)), 0.0, 1.0)
	if target.has("evasionRateOverride"):
		return clampf(float(target.get("evasionRateOverride", 0.0)), 0.0, 1.0)
	var chance_percent := _quick_contest_percent(state, target_id, attacker_id, DODGE_DEX_DIVISOR)
	chance_percent += float(target.get("luck", 0))
	chance_percent += float(target.get("dodgeBonus", target.get("evasionBonus", 0.0)))
	return clampf(chance_percent / 100.0, 0.0001, DODGE_MAX_RATE)


static func _critical_rate_for(state: Dictionary, attacker_id: String, target_id: String) -> float:
	var attacker := actor_by_id(state, attacker_id)
	if attacker.has("criticalRateOverride"):
		return clampf(float(attacker.get("criticalRateOverride", 0.0)), 0.0, 1.0)
	var chance_percent := _quick_contest_percent(state, attacker_id, target_id, CRITICAL_DEX_DIVISOR)
	chance_percent += float(attacker.get("luck", 0))
	chance_percent += float(attacker.get("criticalBonus", 0.0))
	return clampf(chance_percent / 100.0, 0.0, 1.0)


static func _counter_rate_for(state: Dictionary, counter_actor_id: String, target_id: String) -> float:
	var counter_actor := actor_by_id(state, counter_actor_id)
	if counter_actor.has("counterRateOverride"):
		return clampf(float(counter_actor.get("counterRateOverride", 0.0)), 0.0, 1.0)
	var chance_percent := _quick_contest_percent(state, counter_actor_id, target_id, COUNTER_DEX_DIVISOR)
	chance_percent += float(counter_actor.get("luck", 0))
	chance_percent += float(counter_actor.get("counterBonus", 0.0))
	return clampf(chance_percent / 100.0, 0.0, 1.0)


static func _quick_contest_percent(state: Dictionary, favored_actor_id: String, opposing_actor_id: String, divisor: float) -> float:
	var favored := actor_by_id(state, favored_actor_id)
	var opposing := actor_by_id(state, opposing_actor_id)
	if favored.is_empty() or opposing.is_empty():
		return 0.0
	var favored_quick := maxf(1.0, float(favored.get("quick", 50)))
	var opposing_quick := maxf(1.0, float(opposing.get("quick", 50)))
	var big := maxf(favored_quick, opposing_quick)
	var small := minf(favored_quick, opposing_quick)
	var ratio := 1.0 if favored_quick >= opposing_quick else small / big
	var work := maxf(0.0, (big - small) / maxf(0.001, divisor))
	return sqrt(work) * ratio


static func _critical_damage_for(state: Dictionary, attacker_id: String, target_id: String, base_damage: int) -> int:
	var attacker := actor_by_id(state, attacker_id)
	var target := actor_by_id(state, target_id)
	var attacker_level := maxf(1.0, float(attacker.get("level", 1)))
	var target_level := maxf(1.0, float(target.get("level", 1)))
	var defense_bonus := float(target.get("defense", 0)) * attacker_level / target_level * 0.5
	return maxi(base_damage + 1, base_damage + int(round(defense_bonus)))


static func _counter_damage_for(state: Dictionary, counter_actor_id: String, target_id: String) -> int:
	return maxi(1, int(round(float(_attack_damage_for(state, counter_actor_id, target_id)) * COUNTER_DAMAGE_FACTOR)))


static func _battle_roll_seed(state: Dictionary, purpose: String, attacker_id: String, target_id: String, sequence: int) -> String:
	return "%s:%s:r%d:s%d:%s:%s" % [
		str(state.get("targetSeed", state.get("id", "battle"))),
		purpose,
		int(state.get("round", 1)),
		sequence,
		attacker_id,
		target_id,
	]


static func _stable_roll(seed_text: String) -> float:
	return float(_stable_target_index(seed_text, 10000)) / 10000.0


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
	var capture_tool_id := CaptureToolCatalog.normalized_tool_id(str(event.get("captureToolId", CAPTURE_TOOL_EMPTY_HAND)))
	var capture_tool_name := CaptureToolCatalog.full_name_for(capture_tool_id)
	attacker["actionState"] = "capture"
	var success := bool(event.get("success", false))
	if success:
		target["hp"] = 0
		target["actionState"] = "captured"
		target["captured"] = true
		if capture_tool_id == CAPTURE_TOOL_EMPTY_HAND:
			state["message"] = "%s 空手捕捉了 %s。" % [str(attacker.get("name", "我方")), str(target.get("name", "目标"))]
		else:
			state["message"] = "%s 使用%s捕捉了 %s。" % [str(attacker.get("name", "我方")), capture_tool_name, str(target.get("name", "目标"))]
	else:
		target["actionState"] = "hit"
		if capture_tool_id == CAPTURE_TOOL_EMPTY_HAND:
			state["message"] = "%s 空手尝试捕捉 %s，%s 挣脱了。" % [
				str(attacker.get("name", "我方")),
				str(target.get("name", "目标")),
				str(target.get("name", "目标")),
			]
		else:
			state["message"] = "%s 抛出%s，%s 挣脱了。" % [str(attacker.get("name", "我方")), capture_tool_name, str(target.get("name", "目标"))]
	actors[attacker_index] = attacker
	actors[target_index] = target
	state["actors"] = actors
	state = consume_capture_tool(state, capture_tool_id)
	state = _sync_player_pet_party_from_actor(state, target)
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastCaptureSuccess"] = success
	state["lastCaptureToolId"] = capture_tool_id
	state["lastCaptureChance"] = float(event.get("captureChance", capture_chance(state, attacker_id, target_id, capture_tool_id)))
	state["lastCaptureRoll"] = float(event.get("captureRoll", capture_roll(state, attacker_id, target_id, capture_tool_id, int(event.get("sequence", 0)))))
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
			entry["passiveSkillIds"] = BattlePassiveCatalog.passive_ids_for_actor(current_pet)
			for key in ["templateId", "formId", "lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds"]:
				if current_pet.has(key):
					entry[key] = current_pet.get(key)
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
		int(selected_entry.get("defense", 6)),
		_string_array(selected_entry.get("passiveSkillIds", [])),
		str(selected_entry.get("formId", selected_entry.get("templateId", "")))
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
	var poison_status_id := str(event.get("statusId", STATUS_POISON))
	var poison_turns := maxi(1, int(event.get("statusTurns", 3)))
	var poison_tick_damage := maxi(1, int(event.get("statusPotency", _poison_tick_damage_for(damage))))
	var status_check := _status_hit_check_for_event(state, event, target, poison_status_id) if next_hp > 0 else {
		"hit": false,
		"result": "target_down",
		"chance": -1.0,
		"roll": -1.0,
		"resistance": _status_resistance_for_actor(target, poison_status_id),
		"immune": false,
	}
	var status_result := str(status_check.get("result", "resisted")) if next_hp > 0 else "target_down"
	var status_applied := status_result == "applied"
	if status_applied:
		target = BattleStatusModel.apply_status(target, poison_status_id, poison_turns, poison_tick_damage, attacker_id)
	target["poisoned"] = BattleStatusModel.has_status(target, poison_status_id)
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
	state["lastStatusId"] = poison_status_id
	state["lastStatusResult"] = status_result
	state["lastStatusChanges"] = [{
		"actorId": target_id,
		"statusId": poison_status_id,
		"change": "apply" if status_applied else status_result,
		"turns": poison_turns if status_applied else 0,
		"potency": poison_tick_damage if status_applied else 0,
		"chance": float(status_check.get("chance", -1.0)),
		"roll": float(status_check.get("roll", -1.0)),
		"resistance": float(status_check.get("resistance", 0.0)),
		"immune": bool(status_check.get("immune", false)),
	}]
	state = _write_single_status_check_to_state(state, status_check)
	var poison_status_label := BattleStatusModel.status_label(poison_status_id)
	if status_applied:
		state["message"] = "%s 使用%s，%s 中毒并受到 %d 点伤害。" % [
			str(attacker.get("name", "我方")),
			str(event.get("skillName", "精灵")),
			str(target.get("name", "目标")),
			damage,
		]
	elif status_result == "immune":
		state["message"] = "%s 使用%s，%s 受到 %d 点伤害，但免疫%s。" % [
			str(attacker.get("name", "我方")),
			str(event.get("skillName", "精灵")),
			str(target.get("name", "目标")),
			damage,
			poison_status_label,
		]
	else:
		state["message"] = "%s 使用%s，%s 受到 %d 点伤害，但抵抗了%s。" % [
			str(attacker.get("name", "我方")),
			str(event.get("skillName", "精灵")),
			str(target.get("name", "目标")),
			damage,
			poison_status_label,
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
	var poison_status_id := str(event.get("statusId", STATUS_POISON))
	var poison_turns := maxi(1, int(event.get("statusTurns", 3)))
	var poison_tick_damage := maxi(1, int(event.get("statusPotency", _poison_tick_damage_for(damage))))
	var target_ids: Array[String] = []
	var effect_per_target := {}
	var total_damage := 0
	var status_changes: Array[Dictionary] = []
	var result_per_target := {}
	var roll_per_target := {}
	var chance_per_target := {}
	var resistance_per_target := {}
	var applied_count := 0
	var resisted_count := 0
	var immune_count := 0
	var down_count := 0
	for index in range(actors.size()):
		var target := actors[index] as Dictionary
		if str(target.get("side", "")) != SIDE_ENEMY or int(target.get("hp", 0)) <= 0:
			continue
		var next_hp := maxi(0, int(target.get("hp", 0)) - damage)
		target["hp"] = next_hp
		var status_check := _status_hit_check_for_event(state, event, target, poison_status_id) if next_hp > 0 else {
			"hit": false,
			"result": "target_down",
			"chance": -1.0,
			"roll": -1.0,
			"resistance": _status_resistance_for_actor(target, poison_status_id),
			"immune": false,
		}
		var status_result := str(status_check.get("result", "resisted")) if next_hp > 0 else "target_down"
		var status_applied := status_result == "applied"
		if status_applied:
			target = BattleStatusModel.apply_status(target, poison_status_id, poison_turns, poison_tick_damage, attacker_id)
		target["poisoned"] = BattleStatusModel.has_status(target, poison_status_id)
		target["actionState"] = "down" if next_hp <= 0 else "hit"
		actors[index] = target
		var target_id := str(target.get("id", ""))
		target_ids.append(target_id)
		effect_per_target[target_id] = damage
		total_damage += damage
		var result := "applied" if status_applied else status_result
		if result == "applied":
			applied_count += 1
		elif result == "resisted":
			resisted_count += 1
		elif result == "immune":
			immune_count += 1
		else:
			down_count += 1
		result_per_target[target_id] = result
		roll_per_target[target_id] = float(status_check.get("roll", -1.0))
		chance_per_target[target_id] = float(status_check.get("chance", -1.0))
		resistance_per_target[target_id] = float(status_check.get("resistance", 0.0))
		status_changes.append({
			"actorId": target_id,
			"statusId": poison_status_id,
			"change": "apply" if status_applied else result,
			"turns": poison_turns if status_applied else 0,
			"potency": poison_tick_damage if status_applied else 0,
			"chance": float(status_check.get("chance", -1.0)),
			"roll": float(status_check.get("roll", -1.0)),
			"resistance": float(status_check.get("resistance", 0.0)),
			"immune": bool(status_check.get("immune", false)),
		})
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_ids[0] if not target_ids.is_empty() else ""
	state["lastTargetIds"] = target_ids
	state["lastDamage"] = total_damage
	state["lastEffectPerTarget"] = effect_per_target
	state["lastParticipants"] = [attacker_id]
	state["lastStatusId"] = poison_status_id
	if applied_count > 0 and resisted_count == 0 and immune_count == 0 and down_count == 0:
		state["lastStatusResult"] = "applied"
	elif applied_count == 0 and resisted_count > 0 and immune_count == 0 and down_count == 0:
		state["lastStatusResult"] = "resisted"
	elif applied_count == 0 and resisted_count == 0 and immune_count > 0 and down_count == 0:
		state["lastStatusResult"] = "immune"
	else:
		state["lastStatusResult"] = "mixed"
	state["lastStatusChanges"] = status_changes
	state["lastStatusResultPerTarget"] = result_per_target
	state["lastStatusRollPerTarget"] = roll_per_target
	state["lastStatusChancePerTarget"] = chance_per_target
	state["lastStatusResistancePerTarget"] = resistance_per_target
	var all_poison_actor_name := str(attacker.get("name", "我方"))
	var all_poison_skill_name := str(event.get("skillName", "精灵"))
	if applied_count > 0 and resisted_count == 0 and immune_count == 0:
		state["message"] = "%s 使用%s，敌方全体中毒。" % [all_poison_actor_name, all_poison_skill_name]
	elif applied_count == 0 and immune_count > 0 and resisted_count == 0:
		state["message"] = "%s 使用%s，敌方免疫了中毒。" % [all_poison_actor_name, all_poison_skill_name]
	elif applied_count == 0 and resisted_count > 0:
		state["message"] = "%s 使用%s，敌方抵抗了中毒。" % [all_poison_actor_name, all_poison_skill_name]
	else:
		state["message"] = "%s 使用%s，部分敌方中毒。" % [all_poison_actor_name, all_poison_skill_name]
	return state


static func _apply_item_cleanse_event(state: Dictionary, event: Dictionary) -> Dictionary:
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
	attacker["actionState"] = "item"
	var status_ids: Array = event.get("statusIds", [])
	var removed_ids := BattleStatusModel.active_matching_status_ids(target, status_ids)
	target = BattleStatusModel.remove_statuses(target, status_ids)
	target["poisoned"] = BattleStatusModel.has_status(target, STATUS_POISON)
	target["actionState"] = "heal" if not removed_ids.is_empty() else "idle"
	actors[attacker_index] = attacker
	actors[target_index] = target
	state["actors"] = actors
	state["phase"] = "round_events"
	state["lastEventApplied"] = true
	state["lastAttackerId"] = attacker_id
	state["lastTargetId"] = target_id
	state["lastTargetIds"] = [target_id]
	state["lastParticipants"] = [attacker_id]
	state["lastStatusId"] = "cleanse"
	state["lastStatusResult"] = "cleansed" if not removed_ids.is_empty() else "no_status"
	var status_changes: Array[Dictionary] = []
	for removed_status_id in removed_ids:
		status_changes.append({
			"actorId": target_id,
			"statusId": removed_status_id,
			"change": "remove_cleanse",
		})
	state["lastStatusChanges"] = status_changes
	var target_name := str(target.get("name", "目标"))
	var item_name := str(event.get("itemName", "物品"))
	if removed_ids.is_empty():
		state["message"] = "%s 使用%s，%s 没有可解除的异常。" % [
			str(attacker.get("name", "我方")),
			item_name,
			target_name,
		]
	else:
		state["message"] = "%s 使用%s，解除了 %s 的%s。" % [
			str(attacker.get("name", "我方")),
			item_name,
			target_name,
			BattleStatusModel.status_labels_for(removed_ids),
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


static func build_round_end_status_events(state: Dictionary) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		if int(actor.get("hp", 0)) <= 0 or not BattleStatusModel.has_status(actor, STATUS_POISON):
			continue
		var actor_id := str(actor.get("id", ""))
		events.append({
			"type": "status_tick",
			"statusId": STATUS_POISON,
			"attackerId": actor_id,
			"targetId": actor_id,
			"targetSide": str(actor.get("side", "")),
			"damage": maxi(1, BattleStatusModel.status_potency(actor, STATUS_POISON)),
			"speed": 0,
			"sequence": 10000 + index,
			"canLaunch": false,
		})
	return events


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
	if BattleStatusModel.has_status(target, STATUS_STONE):
		defense *= 2
	var reduced := raw_attack - int(round(float(defense) * defense_factor))
	if is_actor_guarding(state, target_id):
		reduced = int(floor(float(reduced) * 0.45))
	return maxi(1, reduced)


static func is_actor_guarding(state: Dictionary, actor_id: String) -> bool:
	for value in state.get("guardingActorIds", []):
		if str(value) == actor_id:
			return true
	return false


static func _remove_guarding_actor(state: Dictionary, actor_id: String) -> Dictionary:
	var next_guarding: Array[String] = []
	for value in state.get("guardingActorIds", []):
		if str(value) != actor_id:
			next_guarding.append(str(value))
	state["guardingActorIds"] = next_guarding
	return state


static func _decrement_actor_status(state: Dictionary, actor_id: String, status_id: String) -> Dictionary:
	var actors: Array = state.get("actors", [])
	var actor_index_value := actor_index(state, actor_id)
	if actor_index_value < 0:
		return state
	var actor := actors[actor_index_value] as Dictionary
	actor = BattleStatusModel.decrement_status(actor, status_id)
	actors[actor_index_value] = actor
	state["actors"] = actors
	return state


static func _confusion_target_id(state: Dictionary, attacker_id: String, sequence: int) -> String:
	var attacker := actor_by_id(state, attacker_id)
	if attacker.is_empty():
		return ""
	var same_side := str(attacker.get("side", ""))
	var candidates := living_actor_ids(state, same_side)
	if candidates.is_empty():
		return ""
	if candidates.size() > 1:
		candidates.erase(attacker_id)
	var seed_text := "%s:confusion:%s:%d:%d" % [
		str(state.get("targetSeed", state.get("id", "battle"))),
		attacker_id,
		int(state.get("round", 1)),
		sequence,
	]
	return candidates[_stable_target_index(seed_text, candidates.size())]


static func _poison_tick_damage_for(base_damage: int) -> int:
	return maxi(1, int(ceil(float(maxi(1, base_damage)) * 0.5)))


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
