extends RefCounted

const PROFILE_KEY := "serverSync"
const SCHEMA_VERSION := 1


static func default_sync_state() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"profileRevision": 0,
		"lastServerRevision": 0,
		"dirtyModules": ["player", "pets", "backpack", "equipment", "mail", "quests"],
		"lastLocalSaveAtSec": 0,
	}


static func normalize_sync_state(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var dirty: Array[String] = []
	var raw_dirty = raw.get("dirtyModules", [])
	if raw_dirty is Array:
		for module_id in raw_dirty:
			var id := str(module_id).strip_edges()
			if id != "" and not dirty.has(id):
				dirty.append(id)
	return {
		"schemaVersion": SCHEMA_VERSION,
		"profileRevision": maxi(0, int(raw.get("profileRevision", 0))),
		"lastServerRevision": maxi(0, int(raw.get("lastServerRevision", 0))),
		"dirtyModules": dirty,
		"lastLocalSaveAtSec": maxi(0, int(raw.get("lastLocalSaveAtSec", 0))),
	}


static func contract() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"ownerKey": "playerId",
		"modules": [
			{"id": "player", "localKey": "player", "serverTable": "player_profiles", "idKeys": ["playerId"], "revisionKey": "profileRevision"},
			{"id": "pets", "localKey": "petInstances", "serverTable": "player_pets", "idKeys": ["playerId", "instanceId"], "revisionKey": "profileRevision"},
			{"id": "groundPets", "localKey": "groundPetDrops", "serverTable": "ground_pet_drops", "idKeys": ["dropId"], "revisionKey": "profileRevision"},
			{"id": "backpack", "localKey": "backpackSlots", "serverTable": "player_backpack_slots", "idKeys": ["playerId", "slotIndex"], "revisionKey": "profileRevision"},
			{"id": "equipment", "localKey": "equipmentSlots", "serverTable": "player_equipment", "idKeys": ["playerId", "slotId"], "revisionKey": "profileRevision"},
			{"id": "mail", "localKey": "mailboxMessages", "serverTable": "player_mail", "idKeys": ["playerId", "messageId"], "revisionKey": "profileRevision"},
			{"id": "quests", "localKey": "questStates", "serverTable": "player_quests", "idKeys": ["playerId", "questId"], "revisionKey": "profileRevision"},
			{"id": "battleResults", "localKey": "battleResultReceipts", "serverTable": "battle_result_receipts", "idKeys": ["playerId", "receiptId"], "revisionKey": "profileRevision"},
			{"id": "hang", "localKey": "hangSession", "serverTable": "player_hang_sessions", "idKeys": ["playerId"], "revisionKey": "profileRevision"},
		],
	}


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var seen := {}
	var raw_modules = contract().get("modules", [])
	if not (raw_modules is Array):
		return ["modules 必须是数组"]
	for value in raw_modules:
		if not (value is Dictionary):
			errors.append("module 必须是对象")
			continue
		var module := value as Dictionary
		var module_id := str(module.get("id", ""))
		if module_id == "":
			errors.append("module.id 不能为空")
		elif seen.has(module_id):
			errors.append("module.id 重复: %s" % module_id)
		seen[module_id] = true
		for key in ["localKey", "serverTable", "revisionKey"]:
			if str(module.get(key, "")) == "":
				errors.append("%s.%s 不能为空" % [module_id, key])
		var id_keys = module.get("idKeys", [])
		if not (id_keys is Array) or (id_keys as Array).is_empty():
			errors.append("%s.idKeys 不能为空" % module_id)
	return errors


static func migration_preview(profile: Dictionary) -> Dictionary:
	var raw_pets = profile.get("petInstances", [])
	var raw_drops = profile.get("groundPetDrops", [])
	var raw_backpack = profile.get("backpackSlots", [])
	var raw_equipment = profile.get("equipmentSlots", {})
	var raw_mail = profile.get("mailboxMessages", [])
	var raw_quests = profile.get("questStates", {})
	var raw_battle_results = profile.get("battleResultReceipts", [])
	return {
		"schemaVersion": int(profile.get("schemaVersion", 0)),
		"moduleCount": (contract().get("modules", []) as Array).size(),
		"counts": {
			"pets": (raw_pets as Array).size() if raw_pets is Array else 0,
			"groundPets": (raw_drops as Array).size() if raw_drops is Array else 0,
			"backpackSlots": (raw_backpack as Array).size() if raw_backpack is Array else 0,
			"equipmentSlots": (raw_equipment as Dictionary).size() if raw_equipment is Dictionary else 0,
			"mailMessages": (raw_mail as Array).size() if raw_mail is Array else 0,
			"questStates": (raw_quests as Dictionary).size() if raw_quests is Dictionary else 0,
			"battleResults": (raw_battle_results as Array).size() if raw_battle_results is Array else 0,
		},
		"errors": validation_errors(),
	}
