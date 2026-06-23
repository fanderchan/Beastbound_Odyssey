extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const BattleStatusModel := preload("res://scripts/battle/battle_status_model.gd")
const AutoBattleSettingsModel := preload("res://scripts/progression/auto_battle_settings_model.gd")
const AutoCaptureSettingsModel := preload("res://scripts/progression/auto_capture_settings_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const BattleRewardCatalog := preload("res://scripts/progression/battle_reward_catalog.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const HangSettingsModel := preload("res://scripts/progression/hang_settings_model.gd")
const PetPowerModel := preload("res://scripts/progression/pet_power_model.gd")
const PetSkillTrainingModel := preload("res://scripts/progression/pet_skill_training_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const QuestModel := preload("res://scripts/progression/quest_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")
const TrainingPartnerModel := preload("res://scripts/progression/training_partner_model.gd")

const SAVE_PATH := "user://player_profile.json"
const PROFILE_SCHEMA_VERSION := 1
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"
const PET_STATE_STORAGE := "storage"
const PET_BASE_SKILL_IDS: Array[String] = ["pet_attack", "pet_defend"]
const PARTY_LIMIT := 5
const STORAGE_LIMIT := 20
const PET_NAME_MAX_LENGTH := 8
const PET_REST_RECOVERY_RATIO := 0.05
const PET_DROP_TTL_SECONDS := 600
const PET_PICKUP_LEVEL_MARGIN := 5
const PET_DROP_PICKUP_PUBLIC := "public"
const LOCAL_PLAYER_ID := "local_player"
const DEFAULT_STONE_COINS := 120
const VILLAGE_HEAL_HP_PER_COIN := 20
const PLAYER_STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const DEFAULT_PLAYER_BATTLE_STATS := {
	"maxHp": 120,
	"attack": 18,
	"defense": 6,
	"quick": 70,
}
const PLAYER_STAT_POINTS_PER_LEVEL := 3
const PLAYER_STAT_POINT_GAINS := {
	"maxHp": 4,
	"attack": 1,
	"defense": 1,
	"quick": 1,
}
const STONE_COINS_KEY := "stoneCoins"
const BACKPACK_SLOTS_KEY := "backpackSlots"
const EQUIPMENT_SLOTS_KEY := "equipmentSlots"
const EQUIPMENT_SLOTS_VERSION_KEY := "equipmentSlotsVersion"
const EQUIPMENT_SLOTS_VERSION := 3
const EQUIPMENT_STARTER_SET_VERSION_KEY := "equipmentStarterSetVersion"
const EQUIPMENT_STARTER_SET_VERSION := 1
const CAPTURE_TOOLS_KEY := "captureTools"
const ACTIVE_QUEST_ID_KEY := "activeQuestId"
const QUEST_STATES_KEY := "questStates"
const PET_CODEX_SEEN_FORM_IDS_KEY := "petCodexSeenFormIds"
const PET_CODEX_CAPTURED_FORM_IDS_KEY := "petCodexCapturedFormIds"
const AUTO_BATTLE_SETTINGS_KEY := AutoBattleSettingsModel.SETTINGS_KEY
const AUTO_CAPTURE_SETTINGS_KEY := AutoCaptureSettingsModel.SETTINGS_KEY
const HANG_SETTINGS_KEY := HangSettingsModel.SETTINGS_KEY
const TRAINING_PARTNERS_KEY := TrainingPartnerModel.PROFILE_KEY
const RECORD_POINT_KEY := "recordPoint"
const DEFAULT_RECORD_POINT_MAP_ID := "firebud_village_gate"
const DEFAULT_RECORD_POINT_SPAWN_NAME := "default"
const DEFAULT_RECORD_POINT_LABEL := "火芽村出生点"


static func default_profile() -> Dictionary:
	return {
		"schemaVersion": PROFILE_SCHEMA_VERSION,
		"player": {
			"name": "见习猎人",
			"level": 1,
			"exp": 0,
			"nextExp": exp_to_next_level(1),
			"baseStats": DEFAULT_PLAYER_BATTLE_STATS.duplicate(true),
			"statPoints": 0,
			"hp": DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120),
			"maxHp": DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120),
		},
		"activePetInstanceId": "pet_bui_main",
		"nextPetInstanceSerial": 5,
		"nextPetDropSerial": 1,
		"stoneCoins": DEFAULT_STONE_COINS,
		"petInstances": [
			_pet_instance_from_form("pet_bui_main", "我的布伊", "bui_normal_red_fire10", PET_STATE_BATTLE, 1),
			_pet_instance_from_form("pet_bui_speed", "黄色普通布伊", "bui_normal_yellow_wind10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_tough", "厚皮布伊", "bui_normal_thick_earth10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", PET_STATE_REST, 1),
		],
		"groundPetDrops": [],
		"backpackSlots": BackpackModel.starting_slots(),
		"equipmentSlots": starter_equipment_slots(),
		"equipmentSlotsVersion": EQUIPMENT_SLOTS_VERSION,
		"equipmentStarterSetVersion": EQUIPMENT_STARTER_SET_VERSION,
		"captureTools": CaptureToolCatalog.starting_inventory(),
		"activeQuestId": QuestModel.first_quest_id(),
		"questStates": {},
		"petCodexSeenFormIds": [],
		"petCodexCapturedFormIds": [],
		"autoBattleSettings": AutoBattleSettingsModel.default_settings(),
		"autoCaptureSettings": AutoCaptureSettingsModel.default_settings(),
		"hangSettings": HangSettingsModel.default_settings(),
		"trainingPartners": [],
		"recordPoint": default_record_point(),
	}


static func load_profile() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return default_profile()
	var text := FileAccess.get_file_as_string(SAVE_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return default_profile()
	return normalize_profile(parsed as Dictionary)


static func save_profile(profile: Dictionary) -> bool:
	var normalized := normalize_profile(profile)
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(normalized, "\t"))
	file.close()
	return true


static func default_record_point() -> Dictionary:
	return {
		"mapId": DEFAULT_RECORD_POINT_MAP_ID,
		"spawnName": DEFAULT_RECORD_POINT_SPAWN_NAME,
		"label": DEFAULT_RECORD_POINT_LABEL,
	}


static func record_point(profile: Dictionary) -> Dictionary:
	return _normalize_record_point(normalize_profile(profile).get(RECORD_POINT_KEY, {}))


static func with_record_point(profile: Dictionary, map_id: String, spawn_name: String, label: String = "") -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[RECORD_POINT_KEY] = _normalize_record_point({
		"mapId": map_id,
		"spawnName": spawn_name,
		"label": label,
	})
	return normalize_profile(normalized)


static func battle_actor_knocked_away(state: Dictionary, actor_id: String) -> bool:
	for actor in _actors(state):
		if str(actor.get("id", "")) != actor_id:
			continue
		return bool(actor.get("launched", false)) or str(actor.get("actionState", "")) == "launched" or not bool(actor.get("revivable", true))
	return false


static func active_pet(profile: Dictionary) -> Dictionary:
	return _active_profile_pet(normalize_profile(profile))


static func pet_instance_by_id(profile: Dictionary, instance_id: String) -> Dictionary:
	for instance in _pet_instances(normalize_profile(profile)):
		if str(instance.get("instanceId", "")) == instance_id:
			return instance
	return {}


static func party_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for instance in _pet_instances(normalize_profile(profile)):
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
			result.append(instance)
	return result


static func storage_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for instance in _pet_instances(normalize_profile(profile)):
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			result.append(instance)
	return result


static func mark_pet_seen(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		instance["isNew"] = false
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	return normalize_profile(normalized)


static func capture_tool_inventory(profile: Dictionary) -> Dictionary:
	return _capture_tool_inventory_from_slots(backpack_slots(profile))


static func capture_tool_count(profile: Dictionary, tool_id: String) -> int:
	return CaptureToolCatalog.count_for(capture_tool_inventory(profile), tool_id)


static func with_capture_tool_inventory(profile: Dictionary, inventory: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := BackpackModel.set_counts_for_context(
		BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])),
		BackpackModel.CONTEXT_CAPTURE,
		CaptureToolCatalog.normalize_inventory(inventory)
	)
	normalized[BACKPACK_SLOTS_KEY] = slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(slots)
	return normalized


static func backpack_slots(profile: Dictionary) -> Array[Dictionary]:
	return BackpackModel.normalize_slots(normalize_profile(profile).get(BACKPACK_SLOTS_KEY, []))


static func backpack_item_count(profile: Dictionary, item_id: String) -> int:
	return BackpackModel.item_count(backpack_slots(profile), item_id)


static func backpack_counts_for_context(profile: Dictionary, context: String) -> Dictionary:
	var normalized_slots := backpack_slots(profile)
	if context == BackpackModel.CONTEXT_CAPTURE:
		return _capture_tool_inventory_from_slots(normalized_slots)
	if context == BackpackModel.CONTEXT_BATTLE_ITEM:
		return _battle_item_inventory_from_slots(normalized_slots)
	return BackpackModel.counts_for_context(normalized_slots, context)


static func with_backpack_slots(profile: Dictionary, slots: Array[Dictionary]) -> Dictionary:
	var normalized := normalize_profile(profile)
	var normalized_slots := BackpackModel.normalize_slots(slots)
	normalized[BACKPACK_SLOTS_KEY] = normalized_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(normalized_slots)
	return normalize_profile(normalized)


static func equipment_slots(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots = normalized.get(EQUIPMENT_SLOTS_KEY, {})
	return (slots as Dictionary).duplicate(true) if slots is Dictionary else {}


static func equipped_item_id(profile: Dictionary, slot_id: String) -> String:
	return str(equipment_slots(profile).get(slot_id, ""))


static func equipped_slot_for_item(profile: Dictionary, item_id: String) -> String:
	for slot_id in EquipmentModel.slot_ids():
		if str(equipment_slots(profile).get(slot_id, "")) == item_id:
			return slot_id
	return ""


static func starter_equipment_slots() -> Dictionary:
	return {
		EquipmentModel.SLOT_ACCESSORY_LEFT: "accessory_firebud_charm",
		EquipmentModel.SLOT_ACCESSORY_RIGHT: "accessory_wind_ring",
		EquipmentModel.SLOT_HEAD: "helm_leather_cap",
		EquipmentModel.SLOT_LEFT_HAND_WEAPON: "weapon_training_spear",
		EquipmentModel.SLOT_BODY: "armor_moist_cloth",
		EquipmentModel.SLOT_RIGHT_HAND_WEAPON: "weapon_stone_dagger",
		EquipmentModel.SLOT_HANDS: "gloves_hide",
		EquipmentModel.SLOT_FEET: "boots_grass",
	}


static func without_equipment(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[EQUIPMENT_SLOTS_KEY] = {}
	normalized[EQUIPMENT_STARTER_SET_VERSION_KEY] = EQUIPMENT_STARTER_SET_VERSION
	return normalize_profile(normalized)


static func equipment_stat_bonus(profile: Dictionary) -> Dictionary:
	return _equipment_stat_bonus_from_slots(equipment_slots(profile))


static func equipment_spirit_ids(profile: Dictionary) -> Array[String]:
	return _equipment_spirit_ids_from_slots(equipment_slots(profile))


static func equipment_spirit_source_entries(profile: Dictionary) -> Array[Dictionary]:
	return _equipment_spirit_source_entries_from_slots(equipment_slots(profile))


static func equipment_change_preview(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	if not EquipmentModel.is_equipment(item_id):
		return {}
	var slot_id := EquipmentModel.slot_for(item_id)
	if slot_id == "":
		return {}
	var before_slots := equipment_slots(normalized)
	var current_item_id := str(before_slots.get(slot_id, ""))
	var after_slots := before_slots.duplicate(true)
	after_slots[slot_id] = item_id
	var before_bonus := _equipment_stat_bonus_from_slots(before_slots)
	var after_bonus := _equipment_stat_bonus_from_slots(after_slots)
	var stat_changes: Array[Dictionary] = []
	for key in EquipmentModel.STAT_KEYS:
		var before_value := int(before_bonus.get(key, 0))
		var after_value := int(after_bonus.get(key, 0))
		var delta := after_value - before_value
		if delta == 0:
			continue
		stat_changes.append({
			"key": key,
			"label": EquipmentModel.stat_label_for(key),
			"before": before_value,
			"after": after_value,
			"delta": delta,
		})
	var before_spirits := _equipment_spirit_ids_from_slots(before_slots)
	var after_spirits := _equipment_spirit_ids_from_slots(after_slots)
	var gained_spirits: Array[String] = []
	for spirit_id in after_spirits:
		if not before_spirits.has(spirit_id):
			gained_spirits.append(spirit_id)
	var lost_spirits: Array[String] = []
	for spirit_id in before_spirits:
		if not after_spirits.has(spirit_id):
			lost_spirits.append(spirit_id)
	return {
		"slot": slot_id,
		"slotLabel": EquipmentModel.slot_label_for(slot_id),
		"currentItemId": current_item_id,
		"currentItemLabel": EquipmentModel.label_for(current_item_id, "无") if current_item_id != "" else "无",
		"newItemId": item_id,
		"newItemLabel": EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		"statChanges": stat_changes,
		"gainedSpiritIds": gained_spirits,
		"lostSpiritIds": lost_spirits,
		"unchanged": current_item_id == item_id and stat_changes.is_empty() and gained_spirits.is_empty() and lost_spirits.is_empty(),
	}


static func player_base_stats(profile: Dictionary = {}) -> Dictionary:
	if profile.is_empty():
		return DEFAULT_PLAYER_BATTLE_STATS.duplicate(true)
	var player = profile.get("player", {})
	return _player_base_stats_from_player(player as Dictionary if player is Dictionary else {})


static func player_stat_points(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	return maxi(0, int(player_dict.get("statPoints", 0)))


static func player_stat_point_gain_for(stat_key: String) -> int:
	return maxi(1, int(PLAYER_STAT_POINT_GAINS.get(stat_key, 1)))


static func allocate_player_stat_point(profile: Dictionary, stat_key: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var key := stat_key.strip_edges()
	if not PLAYER_STAT_KEYS.has(key):
		return {
			"ok": false,
			"profile": normalized,
			"message": "不能分配这个属性。",
		}
	var player := normalized.get("player", {}) as Dictionary
	var points := maxi(0, int(player.get("statPoints", 0)))
	if points <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有可分配属性点。",
		}
	var base_stats := _player_base_stats_from_player(player)
	var gain := player_stat_point_gain_for(key)
	base_stats[key] = maxi(1, int(base_stats.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))) + gain)
	player["baseStats"] = base_stats
	player["statPoints"] = points - 1
	if key == "maxHp":
		player["hp"] = maxi(1, int(player.get("hp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))) + gain)
	normalized["player"] = player
	normalized = normalize_profile(normalized)
	var label := EquipmentModel.stat_label_for(key)
	var normalized_player := normalized.get("player", {}) as Dictionary
	var normalized_base := normalized_player.get("baseStats", {}) as Dictionary
	var current_base := int(normalized_base.get(key, base_stats.get(key, 0)))
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 提升到 %d。" % [label, current_base],
		"statKey": key,
		"gain": gain,
	}


static func player_stat_summary(profile: Dictionary, base_stats: Dictionary = {}) -> Dictionary:
	var normalized_base := _normalize_player_stat_values(base_stats if not base_stats.is_empty() else player_base_stats(profile))
	var raw_bonus := equipment_stat_bonus(profile)
	var normalized_bonus := {}
	var current := {}
	for key in PLAYER_STAT_KEYS:
		var base_value := int(normalized_base.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1)))
		var bonus_value := int(raw_bonus.get(key, 0))
		normalized_bonus[key] = bonus_value
		current[key] = maxi(1, base_value + bonus_value)
	return {
		"base": normalized_base,
		"bonus": normalized_bonus,
		"current": current,
	}


static func can_equip_item(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"message": "%s 不能装备。" % item_label,
		}
	var player := normalized.get("player", {}) as Dictionary
	var player_level := maxi(1, int(player.get("level", 1)))
	var required_level := EquipmentModel.required_level_for(item_id)
	if player_level < required_level:
		return {
			"ok": false,
			"message": "%s 需要 Lv%d 才能装备。" % [item_label, required_level],
			"requiredLevel": required_level,
			"playerLevel": player_level,
		}
	return {
		"ok": true,
		"message": "%s 可以装备。" % item_label,
		"requiredLevel": required_level,
		"playerLevel": player_level,
	}


static func equip_item(profile: Dictionary, item_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id))
	if not EquipmentModel.is_equipment(item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能装备。" % item_label,
		}
	if BackpackModel.item_count(backpack_slots(normalized), item_id) <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有%s。" % item_label,
		}
	var equip_check := can_equip_item(normalized, item_id)
	if not bool(equip_check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(equip_check.get("message", "暂时不能装备。")),
		}
	var slot_id := EquipmentModel.slot_for(item_id)
	if slot_id == "":
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 没有可用装备槽。" % item_label,
		}
	var slots := equipment_slots(normalized)
	var previous_item_id := str(slots.get(slot_id, ""))
	if previous_item_id == item_id:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 已经装备。" % item_label,
		}
	var backpack_after_take := BackpackModel.consume(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), item_id, 1)
	if previous_item_id != "":
		var return_result := BackpackModel.add_items(backpack_after_take, [{
			"itemId": previous_item_id,
			"count": 1,
		}])
		var lost: Array = return_result.get("lost", [])
		if lost is Array and not (lost as Array).is_empty():
			return {
				"ok": false,
				"profile": normalized,
				"message": "背包已满，无法换下%s。" % EquipmentModel.label_for(previous_item_id, BackpackModel.label_for(previous_item_id)),
			}
		backpack_after_take = return_result.get("slots", backpack_after_take)
	slots[slot_id] = item_id
	normalized[BACKPACK_SLOTS_KEY] = backpack_after_take
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(backpack_after_take)
	normalized[EQUIPMENT_SLOTS_KEY] = slots
	normalized[EQUIPMENT_SLOTS_VERSION_KEY] = EQUIPMENT_SLOTS_VERSION
	normalized = normalize_profile(normalized)
	var message := "装备%s。" % item_label
	if previous_item_id != "" and previous_item_id != item_id:
		message = "装备%s，换下%s。" % [item_label, EquipmentModel.label_for(previous_item_id, BackpackModel.label_for(previous_item_id))]
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"itemId": item_id,
		"slot": slot_id,
		"previousItemId": previous_item_id,
	}


static func unequip_slot(profile: Dictionary, slot_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := equipment_slots(normalized)
	var item_id := str(slots.get(slot_id, ""))
	if item_id == "":
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 没有装备。" % EquipmentModel.slot_label_for(slot_id),
		}
	var add_result := BackpackModel.add_items(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), [{
		"itemId": item_id,
		"count": 1,
	}])
	var lost: Array = add_result.get("lost", [])
	if lost is Array and not (lost as Array).is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "背包已满，无法卸下%s。" % EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		}
	slots.erase(slot_id)
	normalized[BACKPACK_SLOTS_KEY] = add_result.get("slots", normalized.get(BACKPACK_SLOTS_KEY, []))
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])))
	normalized[EQUIPMENT_SLOTS_KEY] = slots
	normalized[EQUIPMENT_SLOTS_VERSION_KEY] = EQUIPMENT_SLOTS_VERSION
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "卸下%s。" % EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id)),
		"itemId": item_id,
		"slot": slot_id,
	}


static func battle_item_inventory(profile: Dictionary) -> Dictionary:
	return _battle_item_inventory_from_slots(backpack_slots(profile))


static func with_battle_item_inventory(profile: Dictionary, inventory: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var slots := BackpackModel.set_counts_for_context(
		BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])),
		BackpackModel.CONTEXT_BATTLE_ITEM,
		inventory
	)
	normalized[BACKPACK_SLOTS_KEY] = slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(slots)
	return normalized


static func auto_battle_settings(profile: Dictionary) -> Dictionary:
	return AutoBattleSettingsModel.normalize_settings(normalize_profile(profile).get(AUTO_BATTLE_SETTINGS_KEY, {}))


static func with_auto_battle_settings(profile: Dictionary, settings: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[AUTO_BATTLE_SETTINGS_KEY] = AutoBattleSettingsModel.normalize_settings(settings)
	return normalize_profile(normalized)


static func auto_capture_settings(profile: Dictionary) -> Dictionary:
	return AutoCaptureSettingsModel.normalize_settings(normalize_profile(profile).get(AUTO_CAPTURE_SETTINGS_KEY, {}))


static func with_auto_capture_settings(profile: Dictionary, settings: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[AUTO_CAPTURE_SETTINGS_KEY] = AutoCaptureSettingsModel.normalize_settings(settings)
	return normalize_profile(normalized)


static func pet_skill_slots_for_instance(instance: Dictionary) -> Array[String]:
	return PetTemplateCatalog.normalized_skill_slots(instance.get("activeSkillIds", []), instance.get("petSkillSlots", []))


static func pet_skill_slot_label_for_instance(instance: Dictionary, slot: int, fallback: String = "未配置") -> String:
	var safe_slot := clampi(slot, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var slots := pet_skill_slots_for_instance(instance)
	if safe_slot - 1 < 0 or safe_slot - 1 >= slots.size():
		return fallback
	var skill_id := str(slots[safe_slot - 1])
	return BattleActionCatalog.label_for(skill_id, fallback) if skill_id != "" else fallback


static func pet_skill_slot_options_for_instance(instance: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var slots := pet_skill_slots_for_instance(instance)
	for slot in range(1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS + 1):
		var skill_id := str(slots[slot - 1]) if slot - 1 < slots.size() else ""
		result.append({
			"slot": slot,
			"skillId": skill_id,
			"label": BattleActionCatalog.label_for(skill_id, "未配置") if skill_id != "" else "未配置",
		})
	return result


static func learnable_pet_skill_options(profile: Dictionary, instance_id: String, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> Array[Dictionary]:
	var instance := pet_instance_by_id(profile, instance_id)
	if instance.is_empty():
		return []
	var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
	var result: Array[Dictionary] = []
	for option in PetSkillTrainingModel.skill_options_for_trainer(trainer_id):
		var skill_id := str(option.get("id", ""))
		var next_option := option.duplicate(true)
		next_option["learned"] = learned.has(skill_id)
		next_option["canLearn"] = skill_id != "" and not learned.has(skill_id)
		result.append(next_option)
	return result


static func learn_pet_skill(profile: Dictionary, instance_id: String, skill_id: String, trainer_id: String = PetSkillTrainingModel.DEFAULT_TRAINER_ID) -> Dictionary:
	var normalized := normalize_profile(profile)
	var normalized_skill_id := skill_id.strip_edges()
	var offered := PetSkillTrainingModel.trainer_skill_ids(trainer_id)
	if not offered.has(normalized_skill_id):
		return {"ok": false, "profile": normalized, "message": "这个训练师不会教该技能。"}
	var action := BattleActionCatalog.action_by_id(normalized_skill_id)
	if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
		return {"ok": false, "profile": normalized, "message": "该技能不能作为宠物技能学习。"}
	var cost := PetSkillTrainingModel.skill_cost(normalized_skill_id)
	if stone_coins(normalized) < cost:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不足，需要%d石币。" % cost,
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
		if learned.has(normalized_skill_id):
			return {
				"ok": false,
				"profile": normalized,
				"message": "%s 已经学会%s。" % [str(instance.get("name", "宠物")), BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id)],
			}
		var slots := pet_skill_slots_for_instance(instance)
		var empty_slot := _first_empty_pet_skill_slot(slots)
		if empty_slot <= 0:
			return {"ok": false, "profile": normalized, "message": "技能栏满，请先调整。"}
		learned.append(normalized_skill_id)
		slots[empty_slot - 1] = normalized_skill_id
		var forgotten := _valid_unique_pet_skill_ids(instance.get("forgottenSkillIds", []))
		forgotten.erase(normalized_skill_id)
		instance["activeSkillIds"] = learned
		instance["forgottenSkillIds"] = forgotten
		instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(learned, slots)
		instances[index] = instance
		normalized["petInstances"] = instances
		normalized[STONE_COINS_KEY] = maxi(0, stone_coins(normalized) - cost)
		normalized = normalize_profile(normalized)
		return {
			"ok": true,
			"profile": normalized,
			"message": "%s 学会了%s。" % [str(instance.get("name", "宠物")), BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id)],
			"skillId": normalized_skill_id,
			"slot": empty_slot,
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func can_forget_pet_skill(profile: Dictionary, instance_id: String, skill_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var normalized_skill_id := skill_id.strip_edges()
	if normalized_skill_id == "":
		return {"ok": false, "profile": normalized, "message": "请选择要遗忘的技能。"}
	if PET_BASE_SKILL_IDS.has(normalized_skill_id):
		return {"ok": false, "profile": normalized, "message": "攻击和防御不能遗忘。"}
	var action := BattleActionCatalog.action_by_id(normalized_skill_id)
	if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
		return {"ok": false, "profile": normalized, "message": "该技能不能遗忘。"}
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}
	var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
	if not learned.has(normalized_skill_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 没有学会%s。" % [
				str(instance.get("name", "宠物")),
				BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id),
			],
		}
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 可以遗忘%s。" % [
			str(instance.get("name", "宠物")),
			BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id),
		],
	}


static func forget_pet_skill(profile: Dictionary, instance_id: String, skill_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_forget_pet_skill(normalized, instance_id, skill_id)
	if not bool(check.get("ok", false)):
		return check
	var normalized_skill_id := skill_id.strip_edges()
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var learned := _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
		learned.erase(normalized_skill_id)
		var forgotten := _valid_unique_pet_skill_ids(instance.get("forgottenSkillIds", []))
		if not forgotten.has(normalized_skill_id):
			forgotten.append(normalized_skill_id)
		var slots := pet_skill_slots_for_instance(instance)
		for slot_index in range(slots.size()):
			if str(slots[slot_index]) == normalized_skill_id:
				slots[slot_index] = ""
		instance["activeSkillIds"] = learned
		instance["forgottenSkillIds"] = forgotten
		instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(learned, slots)
		instances[index] = instance
		normalized["petInstances"] = instances
		normalized = normalize_profile(normalized)
		return {
			"ok": true,
			"profile": normalized,
			"message": "%s 遗忘了%s。" % [
				str(instance.get("name", "宠物")),
				BattleActionCatalog.label_for(normalized_skill_id, normalized_skill_id),
			],
			"skillId": normalized_skill_id,
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func move_pet_skill_slot(profile: Dictionary, instance_id: String, slot: int, direction: int) -> Dictionary:
	var target_slot := clampi(slot + direction, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	return swap_pet_skill_slots(profile, instance_id, slot, target_slot)


static func swap_pet_skill_slots(profile: Dictionary, instance_id: String, slot_a: int, slot_b: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var safe_a := clampi(slot_a, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	var safe_b := clampi(slot_b, 1, PetTemplateCatalog.MAX_PET_SKILL_SLOTS)
	if safe_a == safe_b:
		return {"ok": false, "profile": normalized, "message": "已经在这个技能位。"}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var slots := pet_skill_slots_for_instance(instance)
		if safe_a - 1 >= slots.size() or str(slots[safe_a - 1]) == "":
			return {"ok": false, "profile": normalized, "message": "这个技能位还没有技能。"}
		var skill_id := str(slots[safe_a - 1])
		var temp := str(slots[safe_b - 1]) if safe_b - 1 < slots.size() else ""
		slots[safe_b - 1] = skill_id
		slots[safe_a - 1] = temp
		instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(instance.get("activeSkillIds", []), slots)
		instances[index] = instance
		normalized["petInstances"] = instances
		normalized = normalize_profile(normalized)
		return {
			"ok": true,
			"profile": normalized,
			"message": "%s 已移动到技%d。" % [BattleActionCatalog.label_for(skill_id, skill_id), safe_b],
			"slot": safe_b,
		}
	return {"ok": false, "profile": normalized, "message": "没有找到这只宠物。"}


static func hang_settings(profile: Dictionary) -> Dictionary:
	return HangSettingsModel.normalize_settings(normalize_profile(profile).get(HANG_SETTINGS_KEY, {}))


static func with_hang_settings(profile: Dictionary, settings: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[HANG_SETTINGS_KEY] = HangSettingsModel.normalize_settings(settings)
	return normalize_profile(normalized)


static func player_hp(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	return clampi(int(player_dict.get("hp", player_max_hp(normalized))), 1, player_max_hp(normalized))


static func player_max_hp(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	return maxi(1, int(player_dict.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))))


static func with_player_hp(profile: Dictionary, hp: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {}) as Dictionary
	player["hp"] = clampi(hp, 1, player_max_hp(normalized))
	normalized["player"] = player
	return normalize_profile(normalized)


static func training_partners(profile: Dictionary) -> Array[Dictionary]:
	return TrainingPartnerModel.normalize_partners(normalize_profile(profile).get(TRAINING_PARTNERS_KEY, []))


static func training_partner_count(profile: Dictionary) -> int:
	return training_partners(profile).size()


static func with_training_partner_count(profile: Dictionary, count: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var target_count := TrainingPartnerModel.clamp_partner_count(count)
	var partners := TrainingPartnerModel.normalize_partners(normalized.get(TRAINING_PARTNERS_KEY, []))
	while partners.size() > target_count:
		partners.pop_back()
	while partners.size() < target_count:
		partners.append(_create_training_partner_from_profile(normalized, partners.size()))
	normalized[TRAINING_PARTNERS_KEY] = partners
	return normalize_profile(normalized)


static func training_partner_summary_lines(profile: Dictionary) -> Array[String]:
	return TrainingPartnerModel.summary_lines(training_partners(profile))


static func _create_training_partner_from_profile(profile: Dictionary, index: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	var player = normalized.get("player", {}) as Dictionary
	var summary := player_stat_summary(normalized)
	var current = summary.get("current", {}) as Dictionary
	var partner := {
		"partnerId": TrainingPartnerModel.partner_id_for_index(index),
		"name": TrainingPartnerModel.partner_name_for_index(index),
		"level": maxi(1, int(player.get("level", 1))),
		"exp": 0,
		"nextExp": exp_to_next_level(maxi(1, int(player.get("level", 1)))),
		"hp": maxi(1, int(current.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120)))),
		"maxHp": maxi(1, int(current.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120)))),
		"attack": maxi(1, int(current.get("attack", DEFAULT_PLAYER_BATTLE_STATS.get("attack", 18)))),
		"defense": maxi(1, int(current.get("defense", DEFAULT_PLAYER_BATTLE_STATS.get("defense", 6)))),
		"quick": maxi(1, int(current.get("quick", DEFAULT_PLAYER_BATTLE_STATS.get("quick", 70)))),
		"slotNumber": TrainingPartnerModel.slot_number_for_index(index),
	}
	var active := _active_profile_pet(normalized)
	if active.is_empty():
		active = _pet_instance_from_form(
			"training_partner_source_pet",
			"布伊",
			"bui_normal_red_fire10",
			PET_STATE_BATTLE,
			maxi(1, int(player.get("level", 1)))
		)
	var pet := active.duplicate(true)
	pet["name"] = TrainingPartnerModel.partner_pet_name_for_index(index, str(active.get("name", "布伊")))
	pet["level"] = maxi(1, int(active.get("level", partner.get("level", 1))))
	pet["exp"] = 0
	pet["nextExp"] = exp_to_next_level(int(pet.get("level", 1)))
	pet["hp"] = maxi(1, int(active.get("maxHp", active.get("hp", 90))))
	pet["maxHp"] = maxi(1, int(active.get("maxHp", active.get("hp", 90))))
	for key in ["attack", "defense", "quick"]:
		pet[key] = maxi(1, int(active.get(key, 1)))
	partner["pet"] = pet
	return TrainingPartnerModel.normalize_partner(partner, index)


static func stone_coins(profile: Dictionary) -> int:
	return maxi(0, int(normalize_profile(profile).get(STONE_COINS_KEY, DEFAULT_STONE_COINS)))


static func with_stone_coins(profile: Dictionary, amount: int) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[STONE_COINS_KEY] = maxi(0, amount)
	return normalized


static func village_healer_missing_hp(profile: Dictionary) -> int:
	var normalized := normalize_profile(profile)
	var missing := maxi(0, player_max_hp(normalized) - player_hp(normalized))
	for instance in party_pet_instances(normalized):
		missing += _missing_hp_for_pet_instance(instance)
	return missing


static func village_healer_cost_for_missing_hp(missing_hp: int) -> int:
	var missing := maxi(0, missing_hp)
	if missing <= 0:
		return 0
	return maxi(1, int(ceil(float(missing) / float(VILLAGE_HEAL_HP_PER_COIN))))


static func village_healer_quote(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var missing := village_healer_missing_hp(normalized)
	var cost := village_healer_cost_for_missing_hp(missing)
	var coins := stone_coins(normalized)
	var message := "队伍生命已满。"
	if missing > 0 and coins < cost:
		message = "石币不足，无法治疗。"
	elif missing > 0:
		message = "预计费用 %d 石币。" % cost
	return {
		"missingHp": missing,
		"cost": cost,
		"stoneCoins": coins,
		"canHeal": missing > 0 and coins >= cost,
		"message": message,
	}


static func apply_village_healer(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quote := village_healer_quote(normalized)
	var missing := int(quote.get("missingHp", 0))
	var cost := int(quote.get("cost", 0))
	if missing <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "队伍生命已满。",
			"heal": 0,
			"cost": 0,
		}
	if stone_coins(normalized) < cost:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不足，无法治疗。",
			"heal": 0,
			"cost": cost,
		}

	var healed_units := 0
	var player = normalized.get("player", {}) as Dictionary
	var player_max := player_max_hp(normalized)
	if player_hp(normalized) < player_max:
		player["hp"] = player_max
		healed_units += 1
	normalized["player"] = player

	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			instances[index] = instance
			continue
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		if hp < max_hp:
			instance["hp"] = max_hp
			healed_units += 1
		instances[index] = instance
	normalized["petInstances"] = instances
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - cost
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "村医治疗完成，恢复%d生命，花费%d石币。" % [missing, cost],
		"heal": missing,
		"cost": cost,
		"healedUnits": healed_units,
	}


static func active_quest_id(profile: Dictionary) -> String:
	return str(normalize_profile(profile).get(ACTIVE_QUEST_ID_KEY, ""))


static func active_quest(profile: Dictionary) -> Dictionary:
	return QuestModel.quest_for_id(active_quest_id(profile))


static func active_quest_state(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var states := _quest_states(normalized)
	return QuestModel.normalize_state(states.get(quest_id, {}), quest_id)


static func active_quest_auto_claim(profile: Dictionary) -> bool:
	return QuestModel.auto_claim_on_ready(active_quest(profile))


static func active_quest_turn_in_id(profile: Dictionary) -> String:
	return QuestModel.turn_in_id_for(active_quest(profile))


static func can_claim_active_quest(profile: Dictionary) -> bool:
	var quest := active_quest(profile)
	if quest.is_empty():
		return false
	return str(active_quest_state(profile).get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_READY


static func quest_progress_text(profile: Dictionary) -> String:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return "当前没有任务"
	return QuestModel.progress_text_for_state(quest, _quest_states(normalized).get(quest_id, {}))


static func quest_reward_text(profile: Dictionary) -> String:
	var quest := active_quest(profile)
	if quest.is_empty():
		return ""
	return QuestModel.reward_text(quest)


static func record_quest_event(profile: Dictionary, event: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return {
			"profile": normalized,
			"changed": false,
			"ready": false,
			"questId": "",
			"message": "",
		}
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_ACTIVE:
		return {
			"profile": normalized,
			"changed": false,
			"ready": str(state.get("status", "")) == QuestModel.STATUS_READY,
			"questId": quest_id,
			"message": "",
		}
	var progress_amount := QuestModel.progress_amount_for_event(quest, event)
	if progress_amount <= 0:
		return {
			"profile": normalized,
			"changed": false,
			"ready": false,
			"questId": quest_id,
			"message": "",
		}
	var required := QuestModel.objective_required_count(quest)
	var next_progress := clampi(int(state.get("progress", 0)) + progress_amount, 0, required)
	state["progress"] = next_progress
	var ready := next_progress >= required
	if ready:
		state["status"] = QuestModel.STATUS_READY
	states[quest_id] = state
	normalized[QUEST_STATES_KEY] = states
	normalized = normalize_profile(normalized)
	var message := "任务完成：%s。" % QuestModel.title_for(quest) if ready else "任务更新：%s。" % QuestModel.progress_text_for_state(quest, state)
	return {
		"profile": normalized,
		"changed": true,
		"ready": ready,
		"questId": quest_id,
		"title": QuestModel.title_for(quest),
		"message": message,
	}


static func claim_active_quest(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var quest_id := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	var quest := QuestModel.quest_for_id(quest_id)
	if quest.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "当前没有可领取的任务奖励。",
		}
	var states := _quest_states(normalized)
	var state := QuestModel.normalize_state(states.get(quest_id, {}), quest_id)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_READY:
		return {
			"ok": false,
			"profile": normalized,
			"message": "任务还没有完成。",
		}
	var reward_items := QuestModel.reward_items(quest)
	var reward_result := BackpackModel.add_items(
		BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])),
		reward_items
	)
	var lost: Array = reward_result.get("lost", [])
	if lost is Array and not (lost as Array).is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "背包空间不足，无法领取任务奖励。",
		}
	normalized[BACKPACK_SLOTS_KEY] = reward_result.get("slots", normalized.get(BACKPACK_SLOTS_KEY, []))
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])))
	var coins := QuestModel.reward_stone_coins(quest)
	if coins > 0:
		normalized[STONE_COINS_KEY] = stone_coins(normalized) + coins
	state["status"] = QuestModel.STATUS_CLAIMED
	state["progress"] = QuestModel.objective_required_count(quest)
	states[quest_id] = state
	var next_id := QuestModel.next_quest_id(quest)
	if next_id != "":
		if not states.has(next_id):
			states[next_id] = QuestModel.normalize_state({}, next_id)
		normalized[ACTIVE_QUEST_ID_KEY] = next_id
	else:
		normalized[ACTIVE_QUEST_ID_KEY] = ""
	normalized[QUEST_STATES_KEY] = states
	normalized = normalize_profile(normalized)
	var reward_text := QuestModel.reward_text(quest)
	var message := "完成任务「%s」。" % QuestModel.title_for(quest)
	if reward_text != "":
		message = "完成任务「%s」，获得%s。" % [QuestModel.title_for(quest), reward_text]
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"questId": quest_id,
		"nextQuestId": next_id,
	}


static func buy_shop_item(profile: Dictionary, shop_id: String, item_id: String, amount: int = 1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id)
	var buy_amount := maxi(1, amount)
	if not ShopCatalogModel.is_buyable(shop_id, item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 暂时不能购买。" % item_label,
		}
	var price := ShopCatalogModel.buy_price_for(shop_id, item_id)
	var total_price := price * buy_amount
	if stone_coins(normalized) < total_price:
		return {
			"ok": false,
			"profile": normalized,
			"message": "石币不够。",
		}
	var add_result := BackpackModel.add_items(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), [{
		"itemId": item_id,
		"count": buy_amount,
	}])
	if _item_amount_count(add_result.get("added", []), item_id) < buy_amount:
		return {
			"ok": false,
			"profile": normalized,
			"message": "背包已满。",
		}
	var next_slots: Array[Dictionary] = add_result.get("slots", [])
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) - total_price
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "购买%s x%d，花费%d石币。" % [item_label, buy_amount, total_price],
		"itemId": item_id,
		"amount": buy_amount,
		"price": total_price,
	}


static func sell_shop_item(profile: Dictionary, shop_id: String, item_id: String, amount: int = 1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id)
	var sell_amount := maxi(1, amount)
	if not ShopCatalogModel.is_sellable(shop_id, item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能出售。" % item_label,
		}
	var held_count := BackpackModel.item_count(backpack_slots(normalized), item_id)
	if held_count < sell_amount:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 数量不够。" % item_label,
		}
	var price := ShopCatalogModel.sell_price_for(shop_id, item_id)
	var total_price := price * sell_amount
	var next_slots := BackpackModel.consume(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), item_id, sell_amount)
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized[STONE_COINS_KEY] = stone_coins(normalized) + total_price
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "出售%s x%d，获得%d石币。" % [item_label, sell_amount, total_price],
		"itemId": item_id,
		"amount": sell_amount,
		"price": total_price,
	}


static func _capture_tool_inventory_from_slots(slots: Array[Dictionary]) -> Dictionary:
	var result := CaptureToolCatalog.starting_inventory()
	for key in result.keys():
		var tool_id := str(key)
		result[tool_id] = BackpackModel.item_count(slots, tool_id)
	return CaptureToolCatalog.normalize_inventory(result)


static func _battle_item_inventory_from_slots(slots: Array[Dictionary]) -> Dictionary:
	var result := {}
	for item_id in BackpackModel.item_ids_for_context(BackpackModel.CONTEXT_BATTLE_ITEM):
		result[item_id] = BackpackModel.item_count(slots, item_id)
	return result


static func _quest_states(profile: Dictionary) -> Dictionary:
	return QuestModel.normalize_states(profile.get(QUEST_STATES_KEY, {}))


static func _normalize_equipment_slots(value) -> Dictionary:
	var result := {}
	var raw := value as Dictionary if value is Dictionary else {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(raw.get(slot_id, ""))
		if item_id == "":
			continue
		if EquipmentModel.slot_for(item_id) != slot_id:
			continue
		result[slot_id] = item_id
	return result


static func _equipment_stat_bonus_from_slots(slots: Dictionary) -> Dictionary:
	var result := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		var stats := EquipmentModel.stats_for(item_id)
		for key in EquipmentModel.STAT_KEYS:
			result[key] = int(result.get(key, 0)) + int(stats.get(key, 0))
	return result


static func _equipment_spirit_ids_from_slots(slots: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if not result.has(spirit_id):
				result.append(spirit_id)
	return _sorted_player_spirit_ids(result)


static func _equipment_spirit_source_entries_from_slots(slots: Dictionary) -> Array[Dictionary]:
	var source_lookup := {}
	for slot_id in EquipmentModel.slot_ids():
		var item_id := str(slots.get(slot_id, ""))
		if item_id == "":
			continue
		for spirit_id in EquipmentModel.spirit_ids_for(item_id):
			if spirit_id == "":
				continue
			if not source_lookup.has(spirit_id):
				source_lookup[spirit_id] = []
			var sources := source_lookup[spirit_id] as Array
			sources.append({
				"slotId": slot_id,
				"slotLabel": EquipmentModel.slot_label_for(slot_id),
				"itemId": item_id,
				"itemLabel": EquipmentModel.label_for(item_id, item_id),
			})
			source_lookup[spirit_id] = sources
	var result: Array[Dictionary] = []
	for spirit_id in _sorted_player_spirit_ids(_string_array(source_lookup.keys())):
		result.append({
			"spiritId": spirit_id,
			"spiritLabel": BattleActionCatalog.label_for(spirit_id, spirit_id),
			"sources": source_lookup.get(spirit_id, []),
		})
	return result


static func _sorted_player_spirit_ids(spirit_ids: Array[String]) -> Array[String]:
	var preferred_order: Array[String] = [
		"spirit_grace_1",
		"spirit_moist_1",
		"spirit_poison_1",
		"spirit_poison_mist_1",
		"spirit_grace_5",
		"spirit_moist_6",
		"spirit_moist_5",
		"spirit_poison_5",
		"spirit_poison_mist_5",
	]
	var result: Array[String] = []
	for spirit_id in preferred_order:
		if spirit_ids.has(spirit_id):
			result.append(spirit_id)
	for spirit_id in spirit_ids:
		if not result.has(spirit_id):
			result.append(spirit_id)
	return result


static func _normalize_player_stat_values(value: Dictionary) -> Dictionary:
	var result := {}
	for key in PLAYER_STAT_KEYS:
		result[key] = maxi(1, int(value.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))))
	return result


static func _player_base_stats_from_player(player: Dictionary) -> Dictionary:
	var raw_base = player.get("baseStats", {})
	if raw_base is Dictionary:
		return _normalize_player_stat_values(raw_base as Dictionary)
	return DEFAULT_PLAYER_BATTLE_STATS.duplicate(true)


static func _player_base_stats_from_actor(actor: Dictionary) -> Dictionary:
	var result := {}
	for key in PLAYER_STAT_KEYS:
		result[key] = maxi(1, int(actor.get(key, DEFAULT_PLAYER_BATTLE_STATS.get(key, 1))))
	return result


static func all_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	return _pet_instances(normalize_profile(profile))


static func ground_pet_drops(profile: Dictionary) -> Array[Dictionary]:
	return _ground_pet_drops(normalize_profile(profile))


static func ground_pet_drops_on_map(profile: Dictionary, map_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for drop in ground_pet_drops(profile):
		if str(drop.get("mapId", "")) == map_id:
			result.append(drop)
	return result


static func ground_pet_drop_by_id(profile: Dictionary, drop_id: String) -> Dictionary:
	for drop in ground_pet_drops(profile):
		if str(drop.get("dropId", "")) == drop_id:
			return drop
	return {}


static func ground_pet_drop_cell(drop: Dictionary) -> Vector2i:
	return _drop_cell(drop)


static func ground_pet_drop_pet(drop: Dictionary) -> Dictionary:
	var pet_value = drop.get("pet", {})
	if pet_value is Dictionary:
		return _normalize_pet_instance(pet_value as Dictionary)
	return {}


static func codex_entries(profile: Dictionary) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	var seen_ids := _string_array(normalized.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	var captured_ids := _string_array(normalized.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
	var owned_counts := _owned_pet_form_counts(normalized)
	var result: Array[Dictionary] = []
	for form in PetTemplateCatalog.forms():
		var form_id := str(form.get("formId", ""))
		if form_id == "":
			continue
		var template := PetTemplateCatalog.runtime_template_for_form(form_id)
		if template.is_empty():
			continue
		var owned_count := int(owned_counts.get(form_id, 0))
		var captured := captured_ids.has(form_id) or owned_count > 0
		var seen := captured or seen_ids.has(form_id)
		result.append({
			"formId": form_id,
			"formName": str(template.get("formName", "宠物")),
			"lineName": str(template.get("lineName", "未知种系")),
			"subtypeName": str(template.get("subtypeName", "未知亚种")),
			"seen": seen,
			"captured": captured,
			"ownedCount": owned_count,
			"recordLabel": codex_record_label(seen, captured, owned_count),
		})
	return result


static func codex_entry_for_form(profile: Dictionary, form_id: String) -> Dictionary:
	for entry in codex_entries(profile):
		if str(entry.get("formId", "")) == form_id:
			return entry
	return {}


static func codex_record_label(seen: bool, captured: bool, owned_count: int = 0) -> String:
	if captured:
		return "已捕捉    持有 %d" % maxi(0, owned_count)
	if seen:
		return "已遇见"
	return "未遇见"


static func pet_codex_detail_lines_for_form(profile: Dictionary, form_id: String) -> Array[String]:
	var entry := codex_entry_for_form(profile, form_id)
	if entry.is_empty():
		return ["暂无图鉴资料。"]
	if not bool(entry.get("seen", false)):
		return [
			"图鉴：？？？",
			"记录：未遇见",
		]
	var instance := create_pet_instance_from_form(
		"pet_codex_preview",
		str(entry.get("formName", "宠物")),
		form_id,
		PET_STATE_STANDBY,
		1
	)
	var lines := pet_codex_detail_lines(instance)
	lines.insert(1, "记录：%s" % str(entry.get("recordLabel", "未遇见")))
	return lines


static func record_codex_seen(profile: Dictionary, form_id: String) -> Dictionary:
	return normalize_profile(_with_codex_form_recorded(profile, form_id, false))


static func record_codex_captured(profile: Dictionary, form_id: String) -> Dictionary:
	return normalize_profile(_with_codex_form_recorded(profile, form_id, true))


static func can_set_active_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		return {"ok": false, "message": "%s 已经是主宠。" % str(instance.get("name", "宠物"))}
	var state := str(instance.get("state", PET_STATE_STANDBY))
	if state == PET_STATE_REST:
		return {"ok": false, "message": "%s 正在休息，不能出战。" % str(instance.get("name", "宠物"))}
	if state == PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 在兽栏里，暂时不能直接出战。" % str(instance.get("name", "宠物"))}
	if int(instance.get("hp", 0)) <= 0:
		return {"ok": false, "message": "%s 生命为 0，不能出战。" % str(instance.get("name", "宠物"))}
	return {"ok": true, "message": "%s 可以设为主宠。" % str(instance.get("name", "宠物"))}


static func set_active_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_set_active_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能设为主宠。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		var state := str(instance.get("state", PET_STATE_STANDBY))
		if str(instance.get("instanceId", "")) == instance_id:
			instance["state"] = PET_STATE_BATTLE
		elif state == PET_STATE_BATTLE:
			instance["state"] = PET_STATE_STANDBY
		instances[index] = instance
	normalized["petInstances"] = instances
	normalized["activePetInstanceId"] = instance_id
	normalized = normalize_profile(normalized)
	var active := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已设为主宠。" % str(active.get("name", "宠物")),
	}


static func cycled_pet_state(state: String) -> String:
	match state:
		PET_STATE_REST:
			return PET_STATE_BATTLE
		PET_STATE_BATTLE:
			return PET_STATE_STANDBY
		PET_STATE_STANDBY:
			return PET_STATE_REST
		_:
			return ""


static func can_cycle_pet_state(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	var state := str(instance.get("state", PET_STATE_STANDBY))
	var target_state := cycled_pet_state(state)
	if target_state == "":
		return {"ok": false, "message": "%s 当前状态不能切换。" % str(instance.get("name", "宠物"))}
	if state == PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 在兽栏里，暂时不能切换状态。" % str(instance.get("name", "宠物"))}
	if target_state == PET_STATE_BATTLE and int(instance.get("hp", 0)) <= 0:
		return {"ok": false, "message": "%s 生命为 0，不能出战。" % str(instance.get("name", "宠物"))}
	return {"ok": true, "message": "%s 将切换为%s。" % [str(instance.get("name", "宠物")), state_label(target_state)]}


static func cycle_pet_state(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_cycle_pet_state(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能切换宠物状态。")),
		}
	var selected := pet_instance_by_id(normalized, instance_id)
	var current_state := str(selected.get("state", PET_STATE_STANDBY))
	var target_state := cycled_pet_state(current_state)
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		var current_id := str(instance.get("instanceId", ""))
		if current_id == instance_id:
			instance["state"] = target_state
		elif target_state == PET_STATE_BATTLE and str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
			instance["state"] = PET_STATE_STANDBY
		instances[index] = instance
	normalized["petInstances"] = instances
	if target_state == PET_STATE_BATTLE:
		normalized["activePetInstanceId"] = instance_id
	elif current_state == PET_STATE_BATTLE:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	var changed := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已切换为%s。" % [str(changed.get("name", "宠物")), state_label(str(changed.get("state", target_state)))],
	}


static func can_store_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 已在兽栏。" % str(instance.get("name", "宠物"))}
	if _storage_instance_count(normalized) >= STORAGE_LIMIT:
		return {"ok": false, "message": "兽栏已满。"}
	return {"ok": true, "message": "%s 可以存入兽栏。" % str(instance.get("name", "宠物"))}


static func store_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_store_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能存入。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		instance["state"] = PET_STATE_STORAGE
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	var changed := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已存入兽栏。" % str(changed.get("name", "宠物")),
	}


static func clean_pet_name(raw_name: String) -> String:
	var pet_name := raw_name.replace("\r", "").replace("\n", "").replace("\t", " ").strip_edges()
	while pet_name.find("  ") >= 0:
		pet_name = pet_name.replace("  ", " ")
	return pet_name


static func can_rename_pet(profile: Dictionary, instance_id: String, raw_name: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。", "name": ""}
	var pet_name := clean_pet_name(raw_name)
	if pet_name == "":
		return {"ok": false, "message": "名字不能为空。", "name": pet_name}
	if pet_name.length() > PET_NAME_MAX_LENGTH:
		return {"ok": false, "message": "名字最多 %d 个字。" % PET_NAME_MAX_LENGTH, "name": pet_name}
	if pet_name == str(instance.get("name", "")):
		return {"ok": false, "message": "名字没有变化。", "name": pet_name}
	return {"ok": true, "message": "%s 可以改名。" % str(instance.get("name", "宠物")), "name": pet_name}


static func rename_pet(profile: Dictionary, instance_id: String, raw_name: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_rename_pet(normalized, instance_id, raw_name)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能改名。")),
			"name": str(check.get("name", "")),
		}
	var pet_name := str(check.get("name", ""))
	var old_name := "宠物"
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		old_name = str(instance.get("name", "宠物"))
		instance["name"] = pet_name
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已改名为%s。" % [old_name, pet_name],
		"name": pet_name,
	}


static func use_world_pet_heal_item(profile: Dictionary, item_id: String, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var item_label := BackpackModel.label_for(item_id)
	if not BackpackModel.item_can_world_pet_heal(item_id):
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能这样使用。" % item_label,
		}
	if BackpackModel.item_count(backpack_slots(normalized), item_id) <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不够了。" % item_label,
		}

	var instances: Array = normalized.get("petInstances", [])
	var found := false
	var healed_name := "宠物"
	var healed_amount := 0
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		found = true
		healed_name = str(instance.get("name", "宠物"))
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			return {
				"ok": false,
				"profile": normalized,
				"message": "只能对队伍宠物使用。",
			}
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		var allow_full_hp_use := bool(BackpackModel.world_use_for(item_id).get("allowFullHpUse", false))
		if hp >= max_hp and not allow_full_hp_use:
			return {
				"ok": false,
				"profile": normalized,
				"message": "%s 生命已满。" % healed_name,
			}
		healed_amount = mini(BackpackModel.world_heal_amount_for(item_id), max_hp - hp)
		instance["hp"] = hp + healed_amount
		instances[index] = instance
		break
	if not found:
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}
	var allow_full_hp_use_after := bool(BackpackModel.world_use_for(item_id).get("allowFullHpUse", false))
	if healed_amount <= 0 and not allow_full_hp_use_after:
		return {
			"ok": false,
			"profile": normalized,
			"message": "%s 不能这样使用。" % item_label,
		}

	normalized["petInstances"] = instances
	var next_slots := BackpackModel.consume(BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, [])), item_id, 1)
	normalized[BACKPACK_SLOTS_KEY] = next_slots
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(next_slots)
	normalized = normalize_profile(normalized)
	var message := "%s 使用%s，恢复%d生命。" % [healed_name, item_label, healed_amount]
	if healed_amount <= 0:
		message = "%s 吃下%s，生命已满。" % [healed_name, item_label]
	return {
		"ok": true,
		"profile": normalized,
		"message": message,
		"heal": healed_amount,
		"itemId": item_id,
		"petId": instance_id,
	}


static func rest_recovery_amount_for_instance(instance: Dictionary) -> int:
	var max_hp := maxi(1, int(instance.get("maxHp", 1)))
	return maxi(1, int(ceil(float(max_hp) * PET_REST_RECOVERY_RATIO)))


static func _missing_hp_for_pet_instance(instance: Dictionary) -> int:
	var max_hp := maxi(1, int(instance.get("maxHp", 1)))
	var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
	return maxi(0, max_hp - hp)


static func apply_rest_recovery_tick(profile: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instances: Array = normalized.get("petInstances", [])
	var healed_count := 0
	var total_heal := 0
	var recovered_ids: Array[String] = []
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_REST:
			instances[index] = instance
			continue
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		if hp >= max_hp:
			instances[index] = instance
			continue
		var healed := mini(rest_recovery_amount_for_instance(instance), max_hp - hp)
		instance["hp"] = hp + healed
		instances[index] = instance
		healed_count += 1
		total_heal += healed
		recovered_ids.append(str(instance.get("instanceId", "")))
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	return {
		"ok": healed_count > 0,
		"profile": normalized,
		"healedCount": healed_count,
		"totalHeal": total_heal,
		"petIds": recovered_ids,
	}


static func can_withdraw_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
		return {"ok": false, "message": "%s 不在兽栏。" % str(instance.get("name", "宠物"))}
	if _party_visible_instance_count(normalized) >= PARTY_LIMIT:
		return {"ok": false, "message": "队伍已满。"}
	return {"ok": true, "message": "%s 可以取出。" % str(instance.get("name", "宠物"))}


static func withdraw_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_withdraw_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能取出。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		instance["state"] = PET_STATE_STANDBY
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	var changed := pet_instance_by_id(normalized, instance_id)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 已取出。" % str(changed.get("name", "宠物")),
	}


static func can_drop_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
		return {"ok": false, "message": "兽栏里的宠物不能直接丢弃。"}
	return {"ok": true, "message": "%s 可以丢弃。" % str(instance.get("name", "宠物"))}


static func drop_pet(profile: Dictionary, instance_id: String, map_id: String, cell: Vector2i, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_drop_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能丢弃。")),
		}
	if map_id == "":
		return {
			"ok": false,
			"profile": normalized,
			"message": "当前位置不能丢弃宠物。",
		}

	var instances: Array = normalized.get("petInstances", [])
	var next_instances: Array = []
	var dropped_pet: Dictionary = {}
	for value in instances:
		if not (value is Dictionary):
			continue
		var instance := (value as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) == instance_id:
			dropped_pet = instance
			continue
		next_instances.append(instance)
	if dropped_pet.is_empty():
		return {
			"ok": false,
			"profile": normalized,
			"message": "没有找到这只宠物。",
		}

	dropped_pet["state"] = PET_STATE_STANDBY
	var created_at := _safe_now_sec(now_sec)
	var serial := maxi(1, int(normalized.get("nextPetDropSerial", 1)))
	var drops: Array = normalized.get("groundPetDrops", [])
	var drop_id := "ground_pet_%d" % serial
	while _ground_pet_drop_index(drops, drop_id) >= 0:
		serial += 1
		drop_id = "ground_pet_%d" % serial
	var drop := _normalize_ground_pet_drop({
		"dropId": drop_id,
		"ownerId": LOCAL_PLAYER_ID,
		"pickupMode": PET_DROP_PICKUP_PUBLIC,
		"mapId": map_id,
		"cell": [cell.x, cell.y],
		"createdAtSec": created_at,
		"expiresAtSec": created_at + PET_DROP_TTL_SECONDS,
		"pet": dropped_pet,
	})
	drops.append(drop)

	normalized["petInstances"] = next_instances
	normalized["groundPetDrops"] = drops
	normalized["nextPetDropSerial"] = serial + 1
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"message": "%s 被丢在地上。" % str(dropped_pet.get("name", "宠物")),
		"dropId": drop_id,
	}


static func can_clear_storage_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
		return {"ok": false, "message": "只有兽栏里的宠物可以清理。"}
	return {"ok": true, "message": "%s 可以清理。" % str(instance.get("name", "宠物"))}


static func clear_storage_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_clear_storage_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能清理。")),
		}
	var instances: Array = normalized.get("petInstances", [])
	var next_instances: Array = []
	var removed_pet: Dictionary = {}
	for value in instances:
		if not (value is Dictionary):
			continue
		var instance := (value as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) == instance_id:
			removed_pet = instance
			continue
		next_instances.append(instance)
	normalized["petInstances"] = next_instances
	if str(normalized.get("activePetInstanceId", "")) == instance_id:
		normalized["activePetInstanceId"] = ""
	normalized = normalize_profile(normalized)
	return {
		"ok": not removed_pet.is_empty(),
		"profile": normalized,
		"message": "%s 已清理。" % str(removed_pet.get("name", "宠物")) if not removed_pet.is_empty() else "没有找到这只宠物。",
		"removedCount": 1 if not removed_pet.is_empty() else 0,
	}


static func can_pickup_ground_pet(profile: Dictionary, drop_id: String, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var now := _safe_now_sec(now_sec)
	var drop := ground_pet_drop_by_id(normalized, drop_id)
	if drop.is_empty():
		return {"ok": false, "message": "这只宠物已经离开了。"}
	if _ground_pet_drop_expired(drop, now):
		return {"ok": false, "message": "这只宠物已经离开了。"}
	if _party_visible_instance_count(normalized) >= PARTY_LIMIT:
		return {"ok": false, "message": "队伍已满。"}
	var pet := ground_pet_drop_pet(drop)
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	var player_level := maxi(1, int(player_dict.get("level", 1)))
	var pet_level := maxi(1, int(pet.get("level", 1)))
	if pet_level > player_level + PET_PICKUP_LEVEL_MARGIN:
		return {"ok": false, "message": "不能拾取超过自己5级以上的宠物。"}
	return {"ok": true, "message": "%s 可以拾取。" % str(pet.get("name", "宠物"))}


static func pickup_ground_pet(profile: Dictionary, drop_id: String, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var expired := expire_ground_pet_drops(normalized, now_sec)
	normalized = expired.get("profile", normalized)
	if bool(expired.get("ok", false)) and ground_pet_drop_by_id(normalized, drop_id).is_empty():
		return {
			"ok": false,
			"changed": true,
			"profile": normalized,
			"message": "这只宠物已经离开了。",
		}
	var check := can_pickup_ground_pet(normalized, drop_id, now_sec)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"changed": bool(expired.get("ok", false)),
			"profile": normalized,
			"message": str(check.get("message", "不能拾取。")),
		}

	var drops: Array = normalized.get("groundPetDrops", [])
	var picked_pet: Dictionary = {}
	for index in range(drops.size()):
		if not (drops[index] is Dictionary):
			continue
		var drop := drops[index] as Dictionary
		if str(drop.get("dropId", "")) != drop_id:
			continue
		picked_pet = ground_pet_drop_pet(drop)
		drops.remove_at(index)
		break
	if picked_pet.is_empty():
		return {
			"ok": false,
			"changed": bool(expired.get("ok", false)),
			"profile": normalized,
			"message": "这只宠物已经离开了。",
		}

	picked_pet["state"] = PET_STATE_STANDBY
	var instances: Array = normalized.get("petInstances", [])
	instances.append(picked_pet)
	normalized["petInstances"] = instances
	normalized["groundPetDrops"] = drops
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"changed": true,
		"profile": normalized,
		"message": "%s 回到队伍。" % str(picked_pet.get("name", "宠物")),
		"instanceId": str(picked_pet.get("instanceId", "")),
	}


static func expire_ground_pet_drops(profile: Dictionary, now_sec: int = -1) -> Dictionary:
	var normalized := normalize_profile(profile)
	var now := _safe_now_sec(now_sec)
	var active_drops: Array = []
	var expired_count := 0
	for drop in _ground_pet_drops(normalized):
		if _ground_pet_drop_expired(drop, now):
			expired_count += 1
			continue
		active_drops.append(drop)
	if expired_count <= 0:
		return {
			"ok": false,
			"profile": normalized,
			"expiredCount": 0,
		}
	normalized["groundPetDrops"] = active_drops
	normalized = normalize_profile(normalized)
	return {
		"ok": true,
		"profile": normalized,
		"expiredCount": expired_count,
	}


static func state_label(state: String) -> String:
	match state:
		PET_STATE_BATTLE:
			return "出战"
		PET_STATE_STANDBY:
			return "待机"
		PET_STATE_REST:
			return "休息"
		PET_STATE_STORAGE:
			return "兽栏"
		_:
			return "未知"


static func element_summary_for_instance(instance: Dictionary) -> String:
	var elements = instance.get("elements", {})
	if not (elements is Dictionary):
		return "未知属性"
	var labels := {
		"fire": "火",
		"water": "水",
		"earth": "地",
		"wind": "风",
	}
	var parts: Array[String] = []
	for key in ["fire", "water", "earth", "wind"]:
		var value := int((elements as Dictionary).get(key, 0))
		if value > 0:
			parts.append("%d%s" % [value, str(labels.get(key, key))])
	return " ".join(parts) if not parts.is_empty() else "无属性"

static func active_skill_labels_for_instance(instance: Dictionary) -> Array[String]:
	var labels: Array[String] = []
	for skill_id in _valid_unique_pet_skill_ids(instance.get("activeSkillIds", [])):
		var label := BattleActionCatalog.label_for(skill_id, skill_id)
		if label != "":
			labels.append(label)
	return labels


static func pet_skill_slot_labels_for_instance(instance: Dictionary) -> Array[String]:
	var labels: Array[String] = []
	for option in pet_skill_slot_options_for_instance(instance):
		var skill_id := str(option.get("skillId", ""))
		if skill_id == "":
			continue
		labels.append("技%d %s" % [int(option.get("slot", 1)), str(option.get("label", skill_id))])
	return labels


static func passive_lines_for_instance(instance: Dictionary) -> Array[String]:
	return BattlePassiveCatalog.display_lines_for_actor(instance)


static func pet_detail_lines(instance: Dictionary) -> Array[String]:
	if instance.is_empty():
		return ["请选择宠物。"]
	var lines: Array[String] = []
	lines.append("%s  Lv%d  %s" % [
		str(instance.get("name", "宠物")),
		int(instance.get("level", 1)),
		state_label(str(instance.get("state", PET_STATE_STANDBY))),
	])
	lines.append("%s / %s / %s" % [
		str(instance.get("lineName", "未知种系")),
		str(instance.get("subtypeName", "未知亚种")),
		str(instance.get("formName", "未知形态")),
	])
	lines.append("属性：%s" % element_summary_for_instance(instance))
	lines.append("生命：%d/%d    攻击：%d    防御：%d    敏捷：%d" % [
		int(instance.get("hp", 0)),
		int(instance.get("maxHp", 0)),
		int(instance.get("attack", 0)),
		int(instance.get("defense", 0)),
		int(instance.get("quick", 0)),
	])
	lines.append(PetPowerModel.combat_power_label_for_pet(instance))
	lines.append("经验：%d/%d" % [
		int(instance.get("exp", 0)),
		int(instance.get("nextExp", exp_to_next_level(int(instance.get("level", 1))))),
	])
	var slot_labels := pet_skill_slot_labels_for_instance(instance)
	lines.append("技能槽：%s" % ("、".join(slot_labels) if not slot_labels.is_empty() else "无"))
	var passive_lines := passive_lines_for_instance(instance)
	if passive_lines.is_empty():
		lines.append("被动技能: 无")
	else:
		for passive_line in passive_lines:
			lines.append(passive_line)
	var state := str(instance.get("state", PET_STATE_STANDBY))
	if state == PET_STATE_STORAGE:
		lines.append("在兽栏中，暂时不能直接出战。")
	elif int(instance.get("hp", 0)) <= 0:
		lines.append("%s 生命为 0，不能出战。" % str(instance.get("name", "宠物")))
	return lines


static func pet_codex_detail_lines(instance: Dictionary) -> Array[String]:
	if instance.is_empty():
		return ["请选择宠物。"]
	var form_id := str(instance.get("formId", instance.get("templateId", "")))
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	if template.is_empty():
		return ["暂无图鉴资料。"]
	var lines: Array[String] = []
	lines.append("图鉴：%s" % str(template.get("formName", "宠物")))
	lines.append("种系：%s    亚种：%s" % [
		str(template.get("lineName", "未知种系")),
		str(template.get("subtypeName", "未知亚种")),
	])
	lines.append("形态：%s" % str(template.get("formName", "未知形态")))
	lines.append("属性：%s" % element_summary_for_instance(template))
	lines.append("成长倾向：%s" % growth_profile_label(str(template.get("growthProfileId", ""))))
	var stats = template.get("baseStats", {})
	if stats is Dictionary:
		var stats_dict := stats as Dictionary
		lines.append("基础能力：生命 %d    攻击 %d    防御 %d    敏捷 %d" % [
			int(stats_dict.get("maxHp", 0)),
			int(stats_dict.get("attack", 0)),
			int(stats_dict.get("defense", 0)),
			int(stats_dict.get("agility", 0)),
		])
	var capture = template.get("capture", {})
	if capture is Dictionary:
		var capture_dict := capture as Dictionary
		var capture_label := "可捕捉" if bool(capture_dict.get("catchable", false)) else "不可捕捉"
		if capture_dict.has("difficulty"):
			capture_label += "    难度 %d" % int(capture_dict.get("difficulty", 0))
		lines.append("捕捉：%s" % capture_label)
	var line := PetTemplateCatalog.line_by_id(str(template.get("lineId", "")))
	var description := str(line.get("description", "")).strip_edges()
	if description != "":
		lines.append("种系说明：%s" % description)
	var skill_labels := active_skill_labels_for_instance(template)
	lines.append("可用技能：%s" % ("、".join(skill_labels) if not skill_labels.is_empty() else "无"))
	var passive_lines := passive_lines_for_instance(template)
	if passive_lines.is_empty():
		lines.append("被动技能: 无")
	else:
		for passive_line in passive_lines:
			lines.append(passive_line)
	return lines


static func growth_profile_label(profile_id: String) -> String:
	var normalized := profile_id.to_lower()
	if normalized == "":
		return "未记录"
	if normalized == "balanced":
		return "均衡"
	var labels: Array[String] = []
	if normalized.find("attack") >= 0:
		labels.append("攻击")
	if normalized.find("agility") >= 0 or normalized.find("quick") >= 0 or normalized.find("speed") >= 0:
		labels.append("敏捷")
	if normalized.find("defense") >= 0:
		labels.append("防御")
	if normalized.find("hp") >= 0 or normalized.find("health") >= 0 or normalized.find("stamina") >= 0 or normalized.find("survival") >= 0:
		labels.append("生命")
	if labels.is_empty():
		return "未记录"
	return " / ".join(labels)


static func create_pet_instance_from_form(instance_id: String, pet_name: String, form_id: String, state: String, level: int, stat_overrides: Dictionary = {}) -> Dictionary:
	return _pet_instance_from_form(instance_id, pet_name, form_id, state, level, stat_overrides)


static func normalize_profile(profile: Dictionary) -> Dictionary:
	var normalized := profile.duplicate(true)
	normalized["schemaVersion"] = PROFILE_SCHEMA_VERSION
	var player = normalized.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	player_dict["name"] = str(player_dict.get("name", "见习猎人"))
	player_dict["level"] = maxi(1, int(player_dict.get("level", 1)))
	player_dict["exp"] = maxi(0, int(player_dict.get("exp", 0)))
	player_dict["nextExp"] = maxi(1, int(player_dict.get("nextExp", exp_to_next_level(int(player_dict.get("level", 1))))))
	player_dict["baseStats"] = _player_base_stats_from_player(player_dict)
	player_dict["statPoints"] = maxi(0, int(player_dict.get("statPoints", 0)))
	normalized["player"] = player_dict

	var raw_instances = normalized.get("petInstances", [])
	var has_instance_array := raw_instances is Array
	var instances: Array[Dictionary] = []
	if raw_instances is Array:
		for value in raw_instances:
			if value is Dictionary:
				var instance := _normalize_pet_instance(value as Dictionary)
				if not instance.is_empty():
					instances.append(instance)
	if instances.is_empty() and not has_instance_array:
		instances = default_profile().get("petInstances", [])
	normalized["petInstances"] = instances

	var drops: Array[Dictionary] = []
	var raw_drops = normalized.get("groundPetDrops", [])
	if raw_drops is Array:
		for value in raw_drops:
			if value is Dictionary:
				var drop := _normalize_ground_pet_drop(value as Dictionary)
				if not drop.is_empty():
					drops.append(drop)
	normalized["groundPetDrops"] = drops
	var has_backpack_slots := normalized.has(BACKPACK_SLOTS_KEY) and normalized.get(BACKPACK_SLOTS_KEY) is Array
	var backpack_slots_value := BackpackModel.normalize_slots(normalized.get(BACKPACK_SLOTS_KEY, []))
	if not has_backpack_slots:
		backpack_slots_value = BackpackModel.starting_slots()
		var legacy_capture_tools = normalized.get(CAPTURE_TOOLS_KEY, null)
		if legacy_capture_tools is Dictionary:
			backpack_slots_value = BackpackModel.set_counts_for_context(
				backpack_slots_value,
				BackpackModel.CONTEXT_CAPTURE,
				CaptureToolCatalog.normalize_inventory(legacy_capture_tools as Dictionary)
			)
	normalized[BACKPACK_SLOTS_KEY] = backpack_slots_value
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(backpack_slots_value)
	var equipment_slots_version := int(normalized.get(EQUIPMENT_SLOTS_VERSION_KEY, 1))
	var equipment_slots_value := _normalize_equipment_slots(normalized.get(EQUIPMENT_SLOTS_KEY, {}))
	var equipment_starter_set_version := int(normalized.get(EQUIPMENT_STARTER_SET_VERSION_KEY, 0))
	if equipment_starter_set_version < EQUIPMENT_STARTER_SET_VERSION and equipment_slots_value.is_empty():
		equipment_slots_value = starter_equipment_slots()
		equipment_starter_set_version = EQUIPMENT_STARTER_SET_VERSION
	if equipment_slots_version < EQUIPMENT_SLOTS_VERSION:
		for slot_id in EquipmentModel.slot_ids():
			var equipped_item_id_value := str(equipment_slots_value.get(slot_id, ""))
			if equipped_item_id_value != "" and BackpackModel.item_count(backpack_slots_value, equipped_item_id_value) > 0:
				backpack_slots_value = BackpackModel.consume(backpack_slots_value, equipped_item_id_value, 1)
	normalized[BACKPACK_SLOTS_KEY] = backpack_slots_value
	normalized[CAPTURE_TOOLS_KEY] = _capture_tool_inventory_from_slots(backpack_slots_value)
	normalized[EQUIPMENT_SLOTS_KEY] = equipment_slots_value
	normalized[EQUIPMENT_SLOTS_VERSION_KEY] = EQUIPMENT_SLOTS_VERSION
	normalized[EQUIPMENT_STARTER_SET_VERSION_KEY] = equipment_starter_set_version
	normalized[STONE_COINS_KEY] = maxi(0, int(normalized.get(STONE_COINS_KEY, DEFAULT_STONE_COINS)))
	player_dict = normalized.get("player", {}) as Dictionary
	var player_base_stats := _player_base_stats_from_player(player_dict)
	var player_bonus := _equipment_stat_bonus_from_slots(equipment_slots_value)
	var player_max_hp := maxi(1, int(player_base_stats.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120))) + int(player_bonus.get("maxHp", 0)))
	player_dict["maxHp"] = player_max_hp
	player_dict["hp"] = clampi(int(player_dict.get("hp", player_max_hp)), 1, player_max_hp)
	player_dict["baseStats"] = player_base_stats
	normalized["player"] = player_dict

	var had_quest_data := normalized.has(QUEST_STATES_KEY) or normalized.has(ACTIVE_QUEST_ID_KEY)
	var quest_states := QuestModel.normalize_states(normalized.get(QUEST_STATES_KEY, {}))
	var active_quest_id_value := str(normalized.get(ACTIVE_QUEST_ID_KEY, ""))
	if active_quest_id_value != "":
		var active_state := QuestModel.normalize_state(quest_states.get(active_quest_id_value, {}), active_quest_id_value)
		if QuestModel.quest_for_id(active_quest_id_value).is_empty() or str(active_state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_CLAIMED:
			active_quest_id_value = ""
		else:
			quest_states[active_quest_id_value] = active_state
	if active_quest_id_value == "":
		active_quest_id_value = QuestModel.first_unfinished_quest_id(quest_states)
		if active_quest_id_value == "" and not had_quest_data:
			active_quest_id_value = QuestModel.first_quest_id()
	if active_quest_id_value != "" and not quest_states.has(active_quest_id_value):
		quest_states[active_quest_id_value] = QuestModel.normalize_state({}, active_quest_id_value)
	normalized[ACTIVE_QUEST_ID_KEY] = active_quest_id_value
	normalized[QUEST_STATES_KEY] = quest_states

	var seen_form_ids := _valid_unique_form_id_array(normalized.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	var captured_form_ids := _valid_unique_form_id_array(normalized.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
	for form_id in captured_form_ids:
		if not seen_form_ids.has(form_id):
			seen_form_ids.append(form_id)
	normalized[PET_CODEX_SEEN_FORM_IDS_KEY] = seen_form_ids
	normalized[PET_CODEX_CAPTURED_FORM_IDS_KEY] = captured_form_ids
	normalized[AUTO_BATTLE_SETTINGS_KEY] = AutoBattleSettingsModel.normalize_settings(normalized.get(AUTO_BATTLE_SETTINGS_KEY, {}))
	normalized[AUTO_CAPTURE_SETTINGS_KEY] = AutoCaptureSettingsModel.normalize_settings(normalized.get(AUTO_CAPTURE_SETTINGS_KEY, {}))
	normalized[HANG_SETTINGS_KEY] = HangSettingsModel.normalize_settings(normalized.get(HANG_SETTINGS_KEY, {}))
	normalized[TRAINING_PARTNERS_KEY] = TrainingPartnerModel.normalize_partners(normalized.get(TRAINING_PARTNERS_KEY, []))
	normalized[RECORD_POINT_KEY] = _normalize_record_point(normalized.get(RECORD_POINT_KEY, {}))

	var active_id := str(normalized.get("activePetInstanceId", ""))
	if active_id != "":
		var active_index := _pet_instance_index(instances, active_id)
		if active_index < 0 or str(instances[active_index].get("state", PET_STATE_STANDBY)) != PET_STATE_BATTLE:
			active_id = ""
	if active_id == "":
		active_id = _first_battle_pet_id({"petInstances": instances})
	normalized["activePetInstanceId"] = active_id
	normalized["nextPetInstanceSerial"] = maxi(int(normalized.get("nextPetInstanceSerial", instances.size() + 1)), _next_serial_from_instances(instances))
	normalized["nextPetDropSerial"] = maxi(int(normalized.get("nextPetDropSerial", 1)), _next_drop_serial_from_drops(drops))
	return normalized


static func _normalize_record_point(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var map_id := str(source.get("mapId", DEFAULT_RECORD_POINT_MAP_ID)).strip_edges()
	var spawn_name := str(source.get("spawnName", DEFAULT_RECORD_POINT_SPAWN_NAME)).strip_edges()
	var label := str(source.get("label", "")).strip_edges()
	if map_id == "":
		map_id = DEFAULT_RECORD_POINT_MAP_ID
	if spawn_name == "":
		spawn_name = DEFAULT_RECORD_POINT_SPAWN_NAME
	if label == "":
		label = DEFAULT_RECORD_POINT_LABEL
	return {
		"mapId": map_id,
		"spawnName": spawn_name,
		"label": label,
	}


static func apply_profile_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var normalized := normalize_profile(profile)
	next_state["itemBag"] = battle_item_inventory(normalized)
	next_state["captureToolBag"] = capture_tool_inventory(normalized)
	next_state = _apply_profile_player_to_battle_state(normalized, next_state)
	var party := pet_party_for_battle(normalized)
	next_state["petParty"] = party
	var active_entry := _active_party_entry(party)
	if active_entry.is_empty():
		next_state["actors"] = _actors_without_id(next_state, "ally_pet")
	else:
		var active_actor := actor_from_pet_instance(active_entry, "ally_pet", "ally", "ally.front.3")
		if not active_actor.is_empty():
			next_state["actors"] = _actors_with_replaced_actor(next_state, active_actor)
	next_state = _apply_training_partners_to_battle_state(normalized, next_state)
	return next_state


static func _apply_profile_player_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var player = profile.get("player", {})
	var player_dict := player as Dictionary if player is Dictionary else {}
	var actors: Array = next_state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			continue
		var actor := (actors[index] as Dictionary).duplicate(true)
		if str(actor.get("id", "")) != "ally_player":
			continue
		actor["name"] = str(player_dict.get("name", actor.get("name", "见习猎人")))
		actor["level"] = maxi(1, int(player_dict.get("level", actor.get("level", 1))))
		actor["exp"] = maxi(0, int(player_dict.get("exp", 0)))
		actor["nextExp"] = maxi(1, int(player_dict.get("nextExp", exp_to_next_level(int(actor.get("level", 1))))))
		var previous_max_hp := maxi(1, int(actor.get("maxHp", 1)))
		var previous_hp := clampi(int(actor.get("hp", previous_max_hp)), 0, previous_max_hp)
		var summary := player_stat_summary(profile)
		var current := summary.get("current", {}) as Dictionary
		var current_max_hp := maxi(1, int(current.get("maxHp", previous_max_hp)))
		actor["maxHp"] = current_max_hp
		actor["hp"] = clampi(int(player_dict.get("hp", previous_hp + current_max_hp - previous_max_hp)), 1, current_max_hp)
		for key in ["attack", "defense", "quick"]:
			actor[key] = maxi(1, int(current.get(key, actor.get(key, 1))))
		actor["equipmentSlots"] = equipment_slots(profile)
		actor["equipmentStatBonus"] = summary.get("bonus", {})
		actor["equipmentStatSummary"] = summary
		actor["spiritIds"] = equipment_spirit_ids(profile)
		actors[index] = actor
		break
	next_state["actors"] = actors
	return next_state


static func pet_party_for_battle(profile: Dictionary) -> Array[Dictionary]:
	var normalized := normalize_profile(profile)
	var active_id := str(normalized.get("activePetInstanceId", ""))
	var party: Array[Dictionary] = []
	if active_id != "":
		for instance in _pet_instances(normalized):
			if str(instance.get("instanceId", "")) == active_id and str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
				var active_entry := instance.duplicate(true)
				active_entry["state"] = PET_STATE_BATTLE
				active_entry["actorId"] = "ally_pet"
				party.append(active_entry)
				break
	for instance in _pet_instances(normalized):
		if party.size() >= PARTY_LIMIT:
			break
		var instance_id := str(instance.get("instanceId", ""))
		if instance_id == "" or instance_id == active_id:
			continue
		var state := str(instance.get("state", PET_STATE_STANDBY))
		if state == PET_STATE_STORAGE:
			continue
		var entry := instance.duplicate(true)
		if state != PET_STATE_REST:
			entry["state"] = PET_STATE_STANDBY
		entry["actorId"] = ""
		party.append(entry)
	return party


static func actor_from_pet_instance(instance: Dictionary, actor_id: String, side: String, slot_id: String) -> Dictionary:
	var form_id := str(instance.get("formId", instance.get("templateId", "")))
	var actor := PetTemplateCatalog.actor_from_form(form_id, actor_id, side, "pet", slot_id, str(instance.get("name", "宠物")), {
		"hp": int(instance.get("hp", instance.get("maxHp", 1))),
		"maxHp": int(instance.get("maxHp", 1)),
		"quick": int(instance.get("quick", 50)),
		"attack": int(instance.get("attack", 12)),
		"defense": int(instance.get("defense", 6)),
	})
	if actor.is_empty():
		return {}
	actor["instanceId"] = str(instance.get("instanceId", ""))
	actor["petId"] = str(instance.get("instanceId", ""))
	actor["level"] = int(instance.get("level", 1))
	actor["exp"] = int(instance.get("exp", 0))
	actor["nextExp"] = int(instance.get("nextExp", exp_to_next_level(int(instance.get("level", 1)))))
	actor["activeSkillIds"] = _valid_unique_pet_skill_ids(instance.get("activeSkillIds", []))
	actor["petSkillSlots"] = pet_skill_slots_for_instance(instance)
	actor["petBattleState"] = PET_STATE_BATTLE
	return BattlePassiveCatalog.apply_actor_passive_effects(actor)


static func _apply_training_partners_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var partners := training_partners(profile)
	for index in range(partners.size()):
		var partner := partners[index]
		var slot_number := TrainingPartnerModel.slot_number_for_index(index)
		var partner_actor := _training_partner_actor(partner, index, slot_number)
		if not partner_actor.is_empty():
			next_state["actors"] = _actors_with_replaced_actor(next_state, partner_actor)
		var pet_actor := _training_partner_pet_actor(partner, index, slot_number)
		if not pet_actor.is_empty():
			next_state["actors"] = _actors_with_replaced_actor(next_state, pet_actor)
	return next_state


static func _training_partner_actor(partner: Dictionary, index: int, slot_number: int) -> Dictionary:
	var max_hp := maxi(1, int(partner.get("maxHp", 120)))
	return {
		"id": "ally_training_partner_%d" % [index + 1],
		"trainingPartnerId": str(partner.get("partnerId", TrainingPartnerModel.partner_id_for_index(index))),
		"name": str(partner.get("name", TrainingPartnerModel.partner_name_for_index(index))),
		"side": "ally",
		"kind": "player",
		"slotId": "ally.back.%d" % slot_number,
		"level": maxi(1, int(partner.get("level", 1))),
		"exp": maxi(0, int(partner.get("exp", 0))),
		"nextExp": maxi(1, int(partner.get("nextExp", exp_to_next_level(int(partner.get("level", 1)))))),
		"hp": clampi(int(partner.get("hp", max_hp)), 1, max_hp),
		"maxHp": max_hp,
		"attack": maxi(1, int(partner.get("attack", 18))),
		"defense": maxi(1, int(partner.get("defense", 6))),
		"quick": maxi(1, int(partner.get("quick", 70))),
		"actionState": "idle",
		"statuses": BattleStatusModel.empty_statuses(),
		"statusResist": {},
		"statusImmune": {},
	}


static func _training_partner_pet_actor(partner: Dictionary, index: int, slot_number: int) -> Dictionary:
	var pet = partner.get("pet", {})
	if not (pet is Dictionary):
		return {}
	var pet_dict := (pet as Dictionary).duplicate(true)
	pet_dict["instanceId"] = "training_partner_pet_%d" % [index + 1]
	pet_dict["state"] = PET_STATE_BATTLE
	var actor := actor_from_pet_instance(
		pet_dict,
		"ally_training_partner_pet_%d" % [index + 1],
		"ally",
		"ally.front.%d" % slot_number
	)
	if actor.is_empty():
		return {}
	actor["trainingPartnerId"] = str(partner.get("partnerId", TrainingPartnerModel.partner_id_for_index(index)))
	return actor


static func battle_result_for_state(state: Dictionary) -> String:
	var living_enemies := 0
	var living_allies := 0
	for actor in _actors(state):
		if int(actor.get("hp", 0)) <= 0:
			continue
		match str(actor.get("side", "")):
			"enemy":
				living_enemies += 1
			"ally":
				living_allies += 1
	if living_enemies <= 0:
		return "victory"
	if living_allies <= 0:
		return "defeat"
	return "running"


static func apply_battle_result(profile: Dictionary, state: Dictionary, result_override: String = "") -> Dictionary:
	var next_profile := normalize_profile(profile)
	var state_item_bag = state.get("itemBag", _battle_item_inventory_from_slots(backpack_slots(next_profile)))
	if state_item_bag is Dictionary:
		next_profile = with_battle_item_inventory(next_profile, state_item_bag as Dictionary)
	var state_capture_tool_bag = state.get("captureToolBag", _capture_tool_inventory_from_slots(backpack_slots(next_profile)))
	if state_capture_tool_bag is Dictionary:
		next_profile = with_capture_tool_inventory(next_profile, state_capture_tool_bag as Dictionary)
	next_profile = _merge_battle_player(next_profile, state)
	next_profile = _merge_battle_pet_party(next_profile, state)
	next_profile = _with_codex_forms_seen_from_battle(next_profile, state)
	var result := result_override if result_override != "" else battle_result_for_state(state)
	var exp_reward := battle_exp_reward(state) if result == "victory" else 0
	var stone_coins_reward := BattleRewardCatalog.stone_coins_for_state(state) if result == "victory" else 0
	var level_up_lines: Array[String] = []
	var item_rewards: Array[Dictionary] = []
	var lost_item_rewards: Array[Dictionary] = []
	if exp_reward > 0:
		var player = next_profile.get("player", {}) as Dictionary
		var player_award := _award_exp(player, exp_reward)
		var awarded_player := player_award.get("entry", player) as Dictionary
		var player_levels_gained := maxi(0, int(player_award.get("levelsGained", 0)))
		if player_levels_gained > 0:
			awarded_player["statPoints"] = maxi(0, int(awarded_player.get("statPoints", 0))) + player_levels_gained * PLAYER_STAT_POINTS_PER_LEVEL
		next_profile["player"] = awarded_player
		if bool(player_award.get("leveled", false)):
			level_up_lines.append("%s 升到 Lv%d，获得%d属性点。" % [
				str(player.get("name", "见习猎人")),
				int(awarded_player.get("level", 1)),
				player_levels_gained * PLAYER_STAT_POINTS_PER_LEVEL,
			])
		var active_id := str(next_profile.get("activePetInstanceId", ""))
		var instances: Array = next_profile.get("petInstances", [])
		for index in range(instances.size()):
			if not (instances[index] is Dictionary):
				continue
			var instance := instances[index] as Dictionary
			if str(instance.get("instanceId", "")) != active_id:
				continue
			var pet_award := _award_exp(instance, exp_reward)
			instances[index] = pet_award.get("entry", instance)
			if bool(pet_award.get("leveled", false)):
				level_up_lines.append("%s 升到 Lv%d。" % [str(instance.get("name", "宠物")), int((pet_award.get("entry", {}) as Dictionary).get("level", 1))])
			break
		next_profile["petInstances"] = instances
		var partner_award := _award_training_partner_exp(next_profile, exp_reward)
		next_profile = partner_award.get("profile", next_profile)
		for line in partner_award.get("levelUpLines", []):
			level_up_lines.append(str(line))
	if result == "victory":
		if stone_coins_reward > 0:
			next_profile[STONE_COINS_KEY] = stone_coins(next_profile) + stone_coins_reward
		var reward_result := BackpackModel.add_items(
			BackpackModel.normalize_slots(next_profile.get(BACKPACK_SLOTS_KEY, [])),
			BattleRewardCatalog.rewards_for_state(state)
		)
		next_profile = with_backpack_slots(next_profile, reward_result.get("slots", []))
		item_rewards = _item_amount_array(reward_result.get("added", []))
		lost_item_rewards = _item_amount_array(reward_result.get("lost", []))

	var capture_result := _captured_pet_result_from_state(next_profile, state)
	var captured_instances: Array[Dictionary] = capture_result.get("capturedPets", [])
	var lost_captured_instances: Array[Dictionary] = capture_result.get("lostCapturedPets", [])
	var auto_discarded_instances: Array[Dictionary] = capture_result.get("autoDiscardedPets", [])
	if not captured_instances.is_empty():
		var instances: Array = next_profile.get("petInstances", [])
		for captured in captured_instances:
			instances.append(captured)
			next_profile = _with_codex_form_recorded(next_profile, str(captured.get("formId", "")), true)
		next_profile["petInstances"] = instances
		next_profile["nextPetInstanceSerial"] = _next_serial_from_instances(_pet_instances(next_profile))
	next_profile = normalize_profile(next_profile)

	return {
		"profile": next_profile,
		"result": result,
		"expReward": exp_reward,
		"stoneCoinsReward": stone_coins_reward,
		"itemRewards": item_rewards,
		"lostItemRewards": lost_item_rewards,
		"capturedPets": captured_instances,
		"lostCapturedPets": lost_captured_instances,
		"autoDiscardedPets": auto_discarded_instances,
		"logLines": battle_result_log_lines(result, exp_reward, captured_instances, level_up_lines, next_profile, item_rewards, lost_item_rewards, stone_coins_reward, lost_captured_instances, auto_discarded_instances),
	}


static func battle_result_log_lines(result: String, exp_reward: int, captured_instances: Array[Dictionary], level_up_lines: Array[String], profile: Dictionary, item_rewards: Array[Dictionary] = [], lost_item_rewards: Array[Dictionary] = [], stone_coins_reward: int = 0, lost_captured_instances: Array[Dictionary] = [], auto_discarded_instances: Array[Dictionary] = []) -> Array[String]:
	var lines: Array[String] = []
	match result:
		"victory":
			if stone_coins_reward > 0:
				lines.append("战斗胜利，获得 %d 经验、%d 石币。" % [exp_reward, stone_coins_reward])
			else:
				lines.append("战斗胜利，获得 %d 经验。" % exp_reward)
			var second_parts: Array[String] = []
			var active_pet := _active_profile_pet(profile)
			if not active_pet.is_empty() and exp_reward > 0:
				second_parts.append("%s获得经验" % str(active_pet.get("name", "宠物")))
			if not captured_instances.is_empty():
				var captured_parts: Array[String] = []
				for captured in captured_instances:
					captured_parts.append(_captured_pet_log_part(captured))
				second_parts.append("；".join(captured_parts))
			if not second_parts.is_empty():
				lines.append("。".join(second_parts) + "。")
			if not auto_discarded_instances.is_empty():
				var discard_parts: Array[String] = []
				for discarded in auto_discarded_instances:
					discard_parts.append(_auto_discarded_pet_log_part(discarded))
				lines.append("；".join(discard_parts) + "。")
			if not lost_captured_instances.is_empty():
				var lost_parts: Array[String] = []
				for lost in lost_captured_instances:
					lost_parts.append(_lost_captured_pet_log_part(lost))
				lines.append("；".join(lost_parts) + "。")
			var item_reward_text := BackpackModel.item_amounts_text(item_rewards)
			if item_reward_text != "":
				lines.append("获得 %s。" % item_reward_text)
			var lost_item_reward_text := BackpackModel.item_amounts_text(lost_item_rewards)
			if lost_item_reward_text != "":
				lines.append("背包已满，未获得 %s。" % lost_item_reward_text)
		"defeat":
			lines.append("战斗失败。")
			_append_capture_result_lines(lines, captured_instances, lost_captured_instances, auto_discarded_instances)
		"escape":
			lines.append("成功逃跑。")
			_append_capture_result_lines(lines, captured_instances, lost_captured_instances, auto_discarded_instances)
		_:
			lines.append("战斗结束。")
			_append_capture_result_lines(lines, captured_instances, lost_captured_instances, auto_discarded_instances)
	for line in level_up_lines:
		if lines.size() >= 4:
			break
		lines.append(line)
	return lines


static func _append_capture_result_lines(lines: Array[String], captured_instances: Array[Dictionary], lost_captured_instances: Array[Dictionary], auto_discarded_instances: Array[Dictionary]) -> void:
	if not captured_instances.is_empty():
		var captured_parts: Array[String] = []
		for captured in captured_instances:
			captured_parts.append(_captured_pet_log_part(captured))
		lines.append("；".join(captured_parts) + "。")
	if not auto_discarded_instances.is_empty():
		var discard_parts: Array[String] = []
		for discarded in auto_discarded_instances:
			discard_parts.append(_auto_discarded_pet_log_part(discarded))
		lines.append("；".join(discard_parts) + "。")
	if not lost_captured_instances.is_empty():
		var lost_parts: Array[String] = []
		for lost in lost_captured_instances:
			lost_parts.append(_lost_captured_pet_log_part(lost))
		lines.append("；".join(lost_parts) + "。")


static func _item_amount_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry := entry_value as Dictionary
			var item_id := str(entry.get("itemId", ""))
			var count := maxi(0, int(entry.get("count", 0)))
			if item_id != "" and count > 0:
				result.append({
					"itemId": item_id,
					"count": count,
				})
	return result


static func _item_amount_count(value, item_id: String) -> int:
	var total := 0
	if value is Array:
		for entry_value in value:
			if not (entry_value is Dictionary):
				continue
			var entry := entry_value as Dictionary
			if str(entry.get("itemId", "")) == item_id:
				total += maxi(0, int(entry.get("count", 0)))
	return total


static func _captured_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var power := _captured_pet_power(captured)
	var destination := "队伍已满，已送入兽栏" if str(captured.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE else "已加入队伍"
	return "捕获%s Lv%d，战力%d，%s" % [pet_name, level, power, destination]


static func _lost_captured_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var power := _captured_pet_power(captured)
	return "捕获%s Lv%d，战力%d，但兽栏和宠物栏满，请清理" % [pet_name, level, power]


static func _auto_discarded_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var power := _captured_pet_power(captured)
	var threshold := maxi(0, int(captured.get("discardThreshold", AutoCaptureSettingsModel.DEFAULT_LOW_POWER_THRESHOLD)))
	return "捕获%s Lv%d，战力%d，低于%d，已自动丢弃" % [pet_name, level, power, threshold]


static func _captured_pet_power(captured: Dictionary) -> int:
	return maxi(0, int(captured.get("combatPower", PetPowerModel.combat_power_for_pet(captured))))


static func battle_exp_reward(state: Dictionary) -> int:
	var total := 0
	for actor in _actors(state):
		if str(actor.get("side", "")) != "enemy":
			continue
		if int(actor.get("hp", 0)) > 0 and not bool(actor.get("captured", false)):
			continue
		var max_hp := int(actor.get("maxHp", 1))
		var attack := int(actor.get("attack", 8))
		var defense := int(actor.get("defense", 6))
		var quick := int(actor.get("quick", 40))
		total += maxi(8, int(round(float(max_hp) / 10.0)) + attack + defense + int(round(float(quick) / 8.0)))
	return maxi(0, total)


static func exp_to_next_level(level: int) -> int:
	return 80 + maxi(1, level) * 40


static func _award_exp(entry: Dictionary, amount: int) -> Dictionary:
	var next_entry := entry.duplicate(true)
	var level := maxi(1, int(next_entry.get("level", 1)))
	var start_level := level
	var exp := maxi(0, int(next_entry.get("exp", 0))) + maxi(0, amount)
	var next_exp := maxi(1, int(next_entry.get("nextExp", exp_to_next_level(level))))
	var leveled := false
	while exp >= next_exp:
		exp -= next_exp
		level += 1
		next_exp = exp_to_next_level(level)
		leveled = true
	next_entry["level"] = level
	next_entry["exp"] = exp
	next_entry["nextExp"] = next_exp
	return {
		"entry": next_entry,
		"leveled": leveled,
		"levelsGained": maxi(0, level - start_level),
	}


static func _award_training_partner_exp(profile: Dictionary, amount: int) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var partners := training_partners(next_profile)
	var lines: Array[String] = []
	for index in range(partners.size()):
		var partner := partners[index]
		var before_level := maxi(1, int(partner.get("level", 1)))
		var partner_award := _award_exp(partner, amount)
		partner = partner_award.get("entry", partner)
		var after_level := maxi(1, int(partner.get("level", before_level)))
		if after_level > before_level:
			partner = _grow_training_partner_stats(partner, after_level - before_level)
			lines.append("%s 升到 Lv%d。" % [str(partner.get("name", TrainingPartnerModel.partner_name_for_index(index))), after_level])
		var pet = partner.get("pet", {})
		if pet is Dictionary:
			var pet_dict := (pet as Dictionary).duplicate(true)
			var pet_before_level := maxi(1, int(pet_dict.get("level", 1)))
			var pet_award := _award_exp(pet_dict, amount)
			pet_dict = pet_award.get("entry", pet_dict)
			var pet_after_level := maxi(1, int(pet_dict.get("level", pet_before_level)))
			if pet_after_level > pet_before_level:
				pet_dict = _grow_training_partner_pet_stats(pet_dict, pet_after_level - pet_before_level)
				lines.append("%s 升到 Lv%d。" % [str(pet_dict.get("name", "陪练宠物")), pet_after_level])
			partner["pet"] = pet_dict
		partners[index] = TrainingPartnerModel.normalize_partner(partner, index)
	next_profile[TRAINING_PARTNERS_KEY] = partners
	return {
		"profile": normalize_profile(next_profile),
		"levelUpLines": lines,
	}


static func _grow_training_partner_stats(partner: Dictionary, levels: int) -> Dictionary:
	var next_partner := partner.duplicate(true)
	var level_count := maxi(0, levels)
	next_partner["maxHp"] = maxi(1, int(next_partner.get("maxHp", 120)) + level_count * 8)
	next_partner["hp"] = maxi(1, int(next_partner.get("hp", next_partner.get("maxHp", 120))) + level_count * 8)
	next_partner["attack"] = maxi(1, int(next_partner.get("attack", 18)) + level_count * 2)
	next_partner["defense"] = maxi(1, int(next_partner.get("defense", 6)) + level_count)
	next_partner["quick"] = maxi(1, int(next_partner.get("quick", 70)) + level_count)
	return next_partner


static func _grow_training_partner_pet_stats(pet: Dictionary, levels: int) -> Dictionary:
	var next_pet := pet.duplicate(true)
	var level_count := maxi(0, levels)
	next_pet["maxHp"] = maxi(1, int(next_pet.get("maxHp", 90)) + level_count * 7)
	next_pet["hp"] = maxi(1, int(next_pet.get("hp", next_pet.get("maxHp", 90))) + level_count * 7)
	next_pet["attack"] = maxi(1, int(next_pet.get("attack", 14)) + level_count * 2)
	next_pet["defense"] = maxi(1, int(next_pet.get("defense", 8)) + level_count)
	next_pet["quick"] = maxi(1, int(next_pet.get("quick", 68)) + level_count)
	return next_pet


static func _merge_battle_pet_party(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances: Array = next_profile.get("petInstances", [])
	for entry_value in state.get("petParty", []):
		if not (entry_value is Dictionary):
			continue
		var entry := entry_value as Dictionary
		var instance_id := str(entry.get("instanceId", entry.get("petId", "")))
		if instance_id == "":
			continue
		for index in range(instances.size()):
			var instance := instances[index] as Dictionary
			if str(instance.get("instanceId", "")) != instance_id:
				continue
			for key in ["name", "state", "hp", "maxHp", "quick", "attack", "defense", "formId", "templateId", "lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "petSkillSlots", "forgottenSkillIds", "passiveSkillIds"]:
				if entry.has(key):
					instance[key] = entry.get(key)
			instances[index] = instance
			break
	next_profile["petInstances"] = instances
	return next_profile


static func _merge_battle_player(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	for actor in _actors(state):
		if str(actor.get("id", "")) != "ally_player":
			continue
		var player = next_profile.get("player", {}) as Dictionary
		var max_hp := maxi(1, int(actor.get("maxHp", player.get("maxHp", DEFAULT_PLAYER_BATTLE_STATS.get("maxHp", 120)))))
		player["maxHp"] = max_hp
		player["hp"] = clampi(maxi(1, int(actor.get("hp", player.get("hp", max_hp)))), 1, max_hp)
		next_profile["player"] = player
		return next_profile
	return next_profile


static func _with_codex_forms_seen_from_battle(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_profile := profile.duplicate(true)
	for actor in _actors(state):
		if str(actor.get("side", "")) != "enemy":
			continue
		var form_id := str(actor.get("formId", actor.get("templateId", "")))
		if form_id == "":
			continue
		next_profile = _with_codex_form_recorded(next_profile, form_id, bool(actor.get("captured", false)))
	return next_profile


static func _with_codex_form_recorded(profile: Dictionary, form_id: String, captured: bool) -> Dictionary:
	var normalized_form_id := form_id.strip_edges()
	if normalized_form_id == "" or PetTemplateCatalog.runtime_template_for_form(normalized_form_id).is_empty():
		return profile.duplicate(true)
	var next_profile := profile.duplicate(true)
	var seen_ids := _valid_unique_form_id_array(next_profile.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	if not seen_ids.has(normalized_form_id):
		seen_ids.append(normalized_form_id)
	next_profile[PET_CODEX_SEEN_FORM_IDS_KEY] = seen_ids
	if captured:
		var captured_ids := _valid_unique_form_id_array(next_profile.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
		if not captured_ids.has(normalized_form_id):
			captured_ids.append(normalized_form_id)
		next_profile[PET_CODEX_CAPTURED_FORM_IDS_KEY] = captured_ids
	return next_profile


static func _owned_pet_form_counts(profile: Dictionary) -> Dictionary:
	var counts := {}
	for instance in _pet_instances(profile):
		var form_id := str(instance.get("formId", instance.get("templateId", "")))
		if form_id == "":
			continue
		counts[form_id] = int(counts.get(form_id, 0)) + 1
	return counts


static func _captured_pet_instances_from_state(profile: Dictionary, state: Dictionary) -> Array[Dictionary]:
	return _captured_pet_result_from_state(profile, state).get("capturedPets", [])


static func _captured_pet_result_from_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var captured_instances: Array[Dictionary] = []
	var lost_captured_instances: Array[Dictionary] = []
	var auto_discarded_instances: Array[Dictionary] = []
	var serial := maxi(int(profile.get("nextPetInstanceSerial", 1)), _next_serial_from_instances(_pet_instances(profile)))
	var occupied_party_count := _party_visible_instance_count(profile)
	var occupied_storage_count := _storage_instance_count(profile)
	var capture_settings := auto_capture_settings(profile)
	var auto_discard_enabled := (
		bool(capture_settings.get(AutoCaptureSettingsModel.ENABLED_KEY, false))
		and bool(capture_settings.get(AutoCaptureSettingsModel.AUTO_DISCARD_LOW_POWER_KEY, true))
	)
	var auto_discard_threshold := maxi(0, int(capture_settings.get(AutoCaptureSettingsModel.LOW_POWER_THRESHOLD_KEY, AutoCaptureSettingsModel.DEFAULT_LOW_POWER_THRESHOLD)))
	for actor in _actors(state):
		if not bool(actor.get("captured", false)):
			continue
		var form_id := str(actor.get("formId", actor.get("templateId", "")))
		if form_id == "":
			continue
		var instance_id := "pet_captured_%d" % serial
		serial += 1
		var state_name := PET_STATE_STANDBY
		var can_keep := true
		if occupied_party_count < PARTY_LIMIT:
			state_name = PET_STATE_STANDBY
		elif occupied_storage_count < STORAGE_LIMIT:
			state_name = PET_STATE_STORAGE
		else:
			can_keep = false
		var captured := _pet_instance_from_form(instance_id, str(actor.get("name", actor.get("formName", "宠物"))), form_id, state_name, maxi(1, int(actor.get("level", 1))), {
			"hp": maxi(1, int(actor.get("maxHp", actor.get("hp", 1)))),
			"maxHp": int(actor.get("maxHp", 1)),
			"quick": int(actor.get("quick", 50)),
			"attack": int(actor.get("attack", 12)),
			"defense": int(actor.get("defense", 6)),
		})
		if captured.is_empty():
			continue
		var combat_power := PetPowerModel.combat_power_for_pet(captured)
		captured["combatPower"] = combat_power
		captured["capturedSerial"] = serial - 1
		captured["isNew"] = true
		if auto_discard_enabled and combat_power < auto_discard_threshold:
			captured["discardThreshold"] = auto_discard_threshold
			auto_discarded_instances.append(captured)
			continue
		if not can_keep:
			lost_captured_instances.append(captured)
			continue
		captured_instances.append(captured)
		if state_name == PET_STATE_STORAGE:
			occupied_storage_count += 1
		else:
			occupied_party_count += 1
	return {
		"capturedPets": captured_instances,
		"lostCapturedPets": lost_captured_instances,
		"autoDiscardedPets": auto_discarded_instances,
	}


static func _pet_instance_from_form(instance_id: String, pet_name: String, form_id: String, state: String, level: int, stat_overrides: Dictionary = {}) -> Dictionary:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	if template.is_empty():
		return {}
	var stats = template.get("baseStats", {})
	var stats_dict := stats as Dictionary if stats is Dictionary else {}
	var max_hp := int(stat_overrides.get("maxHp", stats_dict.get("maxHp", 1)))
	var hp := int(stat_overrides.get("hp", max_hp))
	var instance := {
		"instanceId": instance_id,
		"petId": instance_id,
		"templateId": form_id,
		"formId": form_id,
		"name": pet_name if pet_name != "" else str(template.get("formName", "宠物")),
		"state": state,
		"level": maxi(1, level),
		"exp": 0,
		"nextExp": exp_to_next_level(maxi(1, level)),
		"hp": clampi(hp, 0, max_hp),
		"maxHp": max_hp,
		"quick": int(stat_overrides.get("quick", stats_dict.get("agility", 50))),
		"attack": int(stat_overrides.get("attack", stats_dict.get("attack", 12))),
		"defense": int(stat_overrides.get("defense", stats_dict.get("defense", 6))),
	}
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "petSkillSlots", "passiveSkillIds"]:
		if template.has(key):
			instance[key] = template.get(key)
	return _normalize_pet_instance(instance)


static func _normalize_pet_instance(value: Dictionary) -> Dictionary:
	var instance := value.duplicate(true)
	var instance_id := str(instance.get("instanceId", instance.get("petId", "")))
	var form_id := str(instance.get("formId", instance.get("templateId", "")))
	if instance_id == "" or form_id == "":
		return {}
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	instance["instanceId"] = instance_id
	instance["petId"] = instance_id
	instance["formId"] = form_id
	instance["templateId"] = form_id
	instance["name"] = str(instance.get("name", template.get("formName", "宠物")))
	instance["state"] = str(instance.get("state", PET_STATE_STANDBY))
	instance["level"] = maxi(1, int(instance.get("level", 1)))
	instance["exp"] = maxi(0, int(instance.get("exp", 0)))
	instance["nextExp"] = maxi(1, int(instance.get("nextExp", exp_to_next_level(int(instance.get("level", 1))))))
	var stats = template.get("baseStats", {})
	var stats_dict := stats as Dictionary if stats is Dictionary else {}
	instance["maxHp"] = maxi(1, int(instance.get("maxHp", stats_dict.get("maxHp", 1))))
	instance["hp"] = clampi(int(instance.get("hp", instance.get("maxHp", 1))), 0, int(instance.get("maxHp", 1)))
	instance["quick"] = int(instance.get("quick", stats_dict.get("agility", 50)))
	instance["attack"] = int(instance.get("attack", stats_dict.get("attack", 12)))
	instance["defense"] = int(instance.get("defense", stats_dict.get("defense", 6)))
	instance["capturedSerial"] = maxi(0, int(instance.get("capturedSerial", 0)))
	instance["isNew"] = bool(instance.get("isNew", false))
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "passiveSkillIds"]:
		if template.has(key):
			instance[key] = template.get(key)
	var forgotten := _valid_unique_pet_skill_ids(instance.get("forgottenSkillIds", []))
	for base_skill_id in PET_BASE_SKILL_IDS:
		forgotten.erase(base_skill_id)
	var learned: Array[String] = []
	for skill_id in _valid_unique_pet_skill_ids(template.get("activeSkillIds", [])):
		if PET_BASE_SKILL_IDS.has(skill_id) or not forgotten.has(skill_id):
			learned.append(skill_id)
	for skill_id in _valid_unique_pet_skill_ids(instance.get("activeSkillIds", [])):
		if forgotten.has(skill_id):
			continue
		if not learned.has(skill_id):
			learned.append(skill_id)
	instance["activeSkillIds"] = learned
	instance["forgottenSkillIds"] = forgotten
	instance["petSkillSlots"] = PetTemplateCatalog.normalized_skill_slots(learned, instance.get("petSkillSlots", template.get("petSkillSlots", [])))
	instance["combatPower"] = PetPowerModel.combat_power_for_pet(instance)
	return instance


static func _pet_instances(profile: Dictionary) -> Array[Dictionary]:
	var instances: Array[Dictionary] = []
	var raw_instances = profile.get("petInstances", [])
	if raw_instances is Array:
		for value in raw_instances:
			if value is Dictionary:
				instances.append(value as Dictionary)
	return instances


static func _ground_pet_drops(profile: Dictionary) -> Array[Dictionary]:
	var drops: Array[Dictionary] = []
	var raw_drops = profile.get("groundPetDrops", [])
	if raw_drops is Array:
		for value in raw_drops:
			if value is Dictionary:
				drops.append(value as Dictionary)
	return drops


static func _normalize_ground_pet_drop(value: Dictionary) -> Dictionary:
	var drop := value.duplicate(true)
	var pet_value = drop.get("pet", {})
	if not (pet_value is Dictionary):
		return {}
	var pet := _normalize_pet_instance(pet_value as Dictionary)
	if pet.is_empty():
		return {}
	pet["state"] = PET_STATE_STANDBY

	var drop_id := str(drop.get("dropId", ""))
	if drop_id == "":
		drop_id = "ground_%s" % str(pet.get("instanceId", "pet"))
	var map_id := str(drop.get("mapId", ""))
	if map_id == "":
		return {}
	var cell := _drop_cell(drop)
	var created_at := maxi(0, int(drop.get("createdAtSec", 0)))
	var expires_at := int(drop.get("expiresAtSec", created_at + PET_DROP_TTL_SECONDS))
	if expires_at <= 0:
		expires_at = created_at + PET_DROP_TTL_SECONDS
	return {
		"dropId": drop_id,
		"ownerId": str(drop.get("ownerId", LOCAL_PLAYER_ID)),
		"pickupMode": str(drop.get("pickupMode", PET_DROP_PICKUP_PUBLIC)),
		"mapId": map_id,
		"cell": [cell.x, cell.y],
		"createdAtSec": created_at,
		"expiresAtSec": expires_at,
		"pet": pet,
	}


static func _drop_cell(drop: Dictionary) -> Vector2i:
	var cell_value = drop.get("cell", [0, 0])
	if cell_value is Array:
		var cell_array := cell_value as Array
		if cell_array.size() >= 2:
			return Vector2i(int(cell_array[0]), int(cell_array[1]))
	return Vector2i.ZERO


static func _ground_pet_drop_index(drops: Array, drop_id: String) -> int:
	for index in range(drops.size()):
		if not (drops[index] is Dictionary):
			continue
		if str((drops[index] as Dictionary).get("dropId", "")) == drop_id:
			return index
	return -1


static func _ground_pet_drop_expired(drop: Dictionary, now_sec: int) -> bool:
	var expires_at := int(drop.get("expiresAtSec", 0))
	return expires_at > 0 and now_sec >= expires_at


static func _actors(state: Dictionary) -> Array[Dictionary]:
	var actors: Array[Dictionary] = []
	var raw_actors = state.get("actors", [])
	if raw_actors is Array:
		for value in raw_actors:
			if value is Dictionary:
				actors.append(value as Dictionary)
	return actors


static func _actors_without_id(state: Dictionary, actor_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for actor in _actors(state):
		if str(actor.get("id", "")) != actor_id:
			result.append(actor)
	return result


static func _actors_with_replaced_actor(state: Dictionary, next_actor: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var next_id := str(next_actor.get("id", ""))
	var next_slot := str(next_actor.get("slotId", ""))
	for actor in _actors(state):
		var actor_id := str(actor.get("id", ""))
		var actor_slot := str(actor.get("slotId", ""))
		if actor_id == next_id or (next_slot != "" and actor_slot == next_slot):
			continue
		result.append(actor)
	result.append(next_actor)
	return result


static func _active_party_entry(party: Array[Dictionary]) -> Dictionary:
	for entry in party:
		if str(entry.get("state", "")) == PET_STATE_BATTLE:
			return entry
	return {}


static func _active_profile_pet(profile: Dictionary) -> Dictionary:
	var active_id := str(profile.get("activePetInstanceId", ""))
	for instance in _pet_instances(profile):
		if str(instance.get("instanceId", "")) == active_id:
			return instance
	return {}


static func _pet_instance_index(instances: Array[Dictionary], instance_id: String) -> int:
	for index in range(instances.size()):
		if str(instances[index].get("instanceId", "")) == instance_id:
			return index
	return -1


static func _party_visible_instance_count(profile: Dictionary) -> int:
	var count := 0
	for instance in _pet_instances(profile):
		if str(instance.get("state", PET_STATE_STANDBY)) != PET_STATE_STORAGE:
			count += 1
	return count


static func _storage_instance_count(profile: Dictionary) -> int:
	var count := 0
	for instance in _pet_instances(profile):
		if str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE:
			count += 1
	return count


static func _first_battle_pet_id(profile: Dictionary) -> String:
	for instance in _pet_instances(profile):
		var instance_id := str(instance.get("instanceId", ""))
		if instance_id != "" and str(instance.get("state", PET_STATE_STANDBY)) == PET_STATE_BATTLE:
			return instance_id
	return ""


static func _next_serial_from_instances(instances: Array[Dictionary]) -> int:
	var max_serial := 0
	for instance in instances:
		var instance_id := str(instance.get("instanceId", ""))
		var parts := instance_id.split("_")
		if parts.is_empty():
			continue
		var maybe_number := int(parts[parts.size() - 1])
		max_serial = maxi(max_serial, maybe_number)
	return max_serial + 1


static func _next_drop_serial_from_drops(drops: Array[Dictionary]) -> int:
	var max_serial := 0
	for drop in drops:
		var drop_id := str(drop.get("dropId", ""))
		var parts := drop_id.split("_")
		if parts.is_empty():
			continue
		var maybe_number := int(parts[parts.size() - 1])
		max_serial = maxi(max_serial, maybe_number)
	return max_serial + 1


static func _safe_now_sec(now_sec: int) -> int:
	if now_sec >= 0:
		return now_sec
	return int(Time.get_unix_time_from_system())


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result


static func _valid_unique_pet_skill_ids(value) -> Array[String]:
	var result: Array[String] = []
	for skill_id in _string_array(value):
		if result.has(skill_id):
			continue
		var action := BattleActionCatalog.action_by_id(skill_id)
		if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
			continue
		result.append(skill_id)
	return result


static func _first_empty_pet_skill_slot(slots: Array[String]) -> int:
	for index in range(PetTemplateCatalog.MAX_PET_SKILL_SLOTS):
		if index >= slots.size() or str(slots[index]) == "":
			return index + 1
	return 0


static func _valid_unique_form_id_array(value) -> Array[String]:
	var result: Array[String] = []
	for form_id in _string_array(value):
		if result.has(form_id):
			continue
		if PetTemplateCatalog.runtime_template_for_form(form_id).is_empty():
			continue
		result.append(form_id)
	return result
