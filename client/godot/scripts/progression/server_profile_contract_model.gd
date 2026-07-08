extends RefCounted

const PROFILE_KEY := "serverSync"
const SCHEMA_VERSION := 2
const CONTRACT_VERSION := "profile_contract_v2"
const REVISION_KEY := "profileRevision"


static func default_sync_state() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"contractVersion": CONTRACT_VERSION,
		"profileRevision": 0,
		"lastServerRevision": 0,
		"dirtyModules": _default_dirty_modules(),
		"lastLocalSaveAtSec": 0,
		"lastClientContractVersion": CONTRACT_VERSION,
	}


static func normalize_sync_state(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var dirty := _normalized_dirty_modules(raw)
	return {
		"schemaVersion": SCHEMA_VERSION,
		"contractVersion": CONTRACT_VERSION,
		"profileRevision": maxi(0, int(raw.get("profileRevision", 0))),
		"lastServerRevision": maxi(0, int(raw.get("lastServerRevision", 0))),
		"dirtyModules": dirty,
		"lastLocalSaveAtSec": maxi(0, int(raw.get("lastLocalSaveAtSec", 0))),
		"lastClientContractVersion": str(raw.get("lastClientContractVersion", CONTRACT_VERSION)),
	}


static func contract() -> Dictionary:
	var modules := _module_definitions()
	return {
		"schemaVersion": SCHEMA_VERSION,
		"contractVersion": CONTRACT_VERSION,
		"ownerKey": "playerId",
		"revisionKey": REVISION_KEY,
		"modules": modules,
		"moduleIds": module_ids(),
		"policies": {
			"currentAuthority": "local_client",
			"futureAuthority": "node_mysql_server",
			"clientWriteMode": "prototype_direct_write",
			"serverWriteMode": "revision_checked_upsert",
			"conflictDefault": "server_wins_after_authority_cutover",
		},
	}


static func module_ids() -> Array[String]:
	var ids: Array[String] = []
	for module in _module_definitions():
		ids.append(str(module.get("id", "")))
	return ids


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var seen := {}
	var local_key_owner := {}
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
		var local_keys = module.get("localKeys", [])
		if not (local_keys is Array) or (local_keys as Array).is_empty():
			errors.append("%s.localKeys 不能为空" % module_id)
		else:
			for key_value in local_keys as Array:
				var local_key := str(key_value).strip_edges()
				if local_key == "":
					errors.append("%s.localKeys 存在空字段" % module_id)
					continue
				if local_key_owner.has(local_key) and not bool(module.get("derived", false)):
					errors.append("%s.localKeys 与 %s 重复: %s" % [module_id, str(local_key_owner.get(local_key, "")), local_key])
				local_key_owner[local_key] = module_id
		for key in ["serverTable", "revisionKey", "syncPolicy", "conflictPolicy"]:
			if str(module.get(key, "")) == "":
				errors.append("%s.%s 不能为空" % [module_id, key])
		var id_keys = module.get("idKeys", [])
		if not (id_keys is Array) or (id_keys as Array).is_empty():
			errors.append("%s.idKeys 不能为空" % module_id)
	return errors


static func profile_validation_errors(profile: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	for module in _module_definitions():
		var module_id := str(module.get("id", ""))
		var local_keys = module.get("localKeys", [])
		if not (local_keys is Array):
			continue
		for key_value in local_keys as Array:
			var local_key := str(key_value).strip_edges()
			if local_key != "" and not profile.has(local_key):
				errors.append("%s 缺少本地字段: %s" % [module_id, local_key])
	return errors


static func migration_preview(profile: Dictionary) -> Dictionary:
	var raw_pets = profile.get("petInstances", [])
	var raw_drops = profile.get("groundPetDrops", [])
	var raw_backpack = profile.get("backpackSlots", [])
	var raw_equipment_slots = profile.get("equipmentSlots", {})
	var raw_equipment_instances = profile.get("equipmentInstances", {})
	var raw_equipment_slot_instances = profile.get("equipmentSlotInstanceIds", {})
	var raw_mail = profile.get("mailboxMessages", [])
	var raw_quests = profile.get("questStates", {})
	var raw_battle_results = profile.get("battleResultReceipts", [])
	var module_counts := {}
	for module in _module_definitions():
		module_counts[str(module.get("id", ""))] = _module_record_count(profile, module)
	return {
		"schemaVersion": int(profile.get("schemaVersion", 0)),
		"contractSchemaVersion": SCHEMA_VERSION,
		"contractVersion": CONTRACT_VERSION,
		"moduleCount": _module_definitions().size(),
		"moduleIds": module_ids(),
		"moduleCounts": module_counts,
		"counts": {
			"pets": (raw_pets as Array).size() if raw_pets is Array else 0,
			"groundPets": (raw_drops as Array).size() if raw_drops is Array else 0,
			"backpackSlots": (raw_backpack as Array).size() if raw_backpack is Array else 0,
			"backpackExtraSlots": maxi(0, int(profile.get("backpackExtraSlots", 0))),
			"equipmentSlots": (raw_equipment_slots as Dictionary).size() if raw_equipment_slots is Dictionary else 0,
			"equipmentInstances": (raw_equipment_instances as Dictionary).size() if raw_equipment_instances is Dictionary else 0,
			"equipmentSlotInstanceIds": (raw_equipment_slot_instances as Dictionary).size() if raw_equipment_slot_instances is Dictionary else 0,
			"mailMessages": (raw_mail as Array).size() if raw_mail is Array else 0,
			"questStates": (raw_quests as Dictionary).size() if raw_quests is Dictionary else 0,
			"battleResults": (raw_battle_results as Array).size() if raw_battle_results is Array else 0,
			"trainingPartners": _value_count(profile.get("trainingPartners", [])),
		},
		"errors": validation_errors(),
		"profileErrors": profile_validation_errors(profile),
	}


static func migration_manifest(profile: Dictionary) -> Dictionary:
	return {
		"contract": contract(),
		"preview": migration_preview(profile),
		"syncState": normalize_sync_state(profile.get(PROFILE_KEY, {})),
	}


static func _module_definitions() -> Array[Dictionary]:
	return [
		_module("player", ["player"], "player_profiles", ["playerId"], "document", "client_dirty_until_server_authority", "server_wins_after_cutover", "人物基础信息、等级、经验和当前血量。"),
		_module("wallet", ["stoneCoins", "diamonds"], "player_wallet_balances", ["playerId", "currency"], "kv_rows", "transactional", "server_recalculate_for_rewards", "石币、钻石等货币余额。"),
		_module("playerGrowth", ["playerGrowth"], "player_growth_snapshots", ["playerId"], "document", "derived_snapshot", "rebuild_from_player_equipment_rebirth", "人物成长来源、属性点和技能来源。"),
		_module("rebirth", ["rebirthCount", "rebirthHistory", "rebirthQuestCompletions", "rebirthTrialProofs"], "player_rebirth_state", ["playerId"], "document", "quest_transaction", "server_wins_after_cutover", "人物转生次数、历史、试炼凭证和任务完成记录。"),
		_module("abilities", ["unlockedAbilities"], "player_abilities", ["playerId", "abilityId"], "set_rows", "reward_transaction", "server_wins_after_cutover", "远程兽栏、骑宠术等能力解锁。"),
		_module("recordPoint", ["recordPoint"], "player_record_points", ["playerId"], "document", "player_choice", "latest_revision_wins", "记录点地图和出生点。"),
		_module("pets", ["petInstances", "activePetInstanceId", "nextPetInstanceSerial", "ridePetInstanceId", "petRebirthMmStage2Claimed", "petRebirthMmGuide"], "player_pet_instances", ["playerId", "instanceId"], "instance_rows", "pet_transaction", "server_wins_after_cutover", "队伍、兽栏、骑宠、宠物个体成长、锁定、转生和 MM 状态。"),
		_module("groundPets", ["groundPetDrops", "nextPetDropSerial"], "world_ground_pet_drops", ["mapId", "dropId"], "world_rows", "server_ttl_authoritative", "server_wins", "丢弃在地上的宠物和 10 分钟过期规则。"),
		_module("petCodex", ["petCodexSeenFormIds", "petCodexCapturedFormIds"], "player_pet_codex", ["playerId", "formId"], "set_rows", "append_only", "merge_sets", "图鉴已见、已捕获记录。"),
		_module("backpack", ["backpackSlots"], "player_backpack_slots", ["playerId", "slotIndex"], "slot_rows", "transactional", "server_wins_after_cutover", "随身包格子、物品堆叠和数量。"),
		_module("backpackExpansion", ["backpackExtraSlots"], "player_backpack_expansions", ["playerId"], "document", "diamond_transaction", "server_wins_after_cutover", "钻石解锁背包格数。"),
	_module("quickSlots", ["quickSlots"], "player_quick_slots", ["playerId", "slotIndex"], "slot_rows", "client_preference", "latest_revision_wins", "历史快捷栏兼容字段，当前玩家界面不展示。"),
		_module("captureTools", ["captureTools"], "player_capture_tools", ["playerId", "toolId"], "kv_rows", "transactional", "server_wins_after_cutover", "捕捉道具库存和消耗。"),
		_module("equipment", ["equipmentInstances", "equipmentSlotInstanceIds", "nextEquipmentInstanceSerial"], "player_equipment_instances", ["playerId", "instanceId"], "instance_rows", "equipment_transaction", "server_wins_after_cutover", "装备实例、槽位、耐久、强化、经验丹充能和来源。"),
		_module("equipmentCompatibility", ["equipmentSlots", "equipmentDurability", "equipmentEnhancement", "equipmentWearCounters", "equipmentExpPillCharge", "equipmentSlotsVersion", "equipmentStarterSetVersion", "expPillStarterVersion"], "player_equipment_compat_snapshots", ["playerId"], "derived_document", "derived_snapshot", "rebuild_from_equipment_instances", "旧装备字段派生快照，服务端迁移后可逐步淘汰。", true),
		_module("mail", ["mailboxMessages"], "player_mail_messages", ["playerId", "messageId"], "message_rows", "server_append_client_claim", "server_wins_after_cutover", "系统邮件、附件、30 天过期和领取状态。"),
		_module("quests", ["activeQuestId", "questStates"], "player_quest_states", ["playerId", "questId"], "state_rows", "quest_transaction", "server_wins_after_cutover", "主线、支线、循环任务状态和当前追踪任务。"),
		_module("battleResults", ["battleResultReceipts"], "battle_result_receipts", ["playerId", "receiptId"], "receipt_rows", "append_only", "server_replay_authoritative", "战斗结果、奖励、捕捉、数值版本回执。"),
		_module("autoBattleSettings", ["autoBattleSettings"], "player_auto_battle_settings", ["playerId"], "document", "client_preference", "latest_revision_wins", "内挂自动战斗策略。"),
		_module("autoCaptureSettings", ["autoCaptureSettings"], "player_auto_capture_settings", ["playerId"], "document", "client_preference", "latest_revision_wins", "自动捉宠策略。"),
		_module("hangSettings", ["hangSettings"], "player_hang_settings", ["playerId"], "document", "client_preference", "latest_revision_wins", "挂机设置、低血停止和补给策略。"),
		_module("hangSession", ["hangSession"], "player_hang_sessions", ["playerId"], "document", "runtime_session", "server_can_discard_stale", "当前挂机会话、回补状态和统计。"),
		_module("trainingPartners", ["trainingPartners"], "player_training_partners", ["playerId", "partnerId"], "partner_rows", "party_transaction", "server_wins_after_cutover", "陪练伙伴和其成长状态。"),
		_module("serverSync", [PROFILE_KEY], "player_sync_state", ["playerId"], "document", "client_sync_metadata", "server_revision_wins", "本地 revision、dirtyModules 和上次服务端 revision。"),
	]


static func _module(
	id: String,
	local_keys: Array,
	server_table: String,
	id_keys: Array,
	server_shape: String,
	sync_policy: String,
	conflict_policy: String,
	description: String,
	derived: bool = false
) -> Dictionary:
	var clean_local_keys := _unique_strings(local_keys)
	var result := {
		"id": id,
		"localKeys": clean_local_keys,
		"serverTable": server_table,
		"idKeys": _unique_strings(id_keys),
		"revisionKey": REVISION_KEY,
		"serverShape": server_shape,
		"syncPolicy": sync_policy,
		"conflictPolicy": conflict_policy,
		"description": description,
	}
	if clean_local_keys.size() == 1:
		result["localKey"] = clean_local_keys[0]
	if derived:
		result["derived"] = true
	return result


static func _default_dirty_modules() -> Array[String]:
	var ids: Array[String] = []
	for module in _module_definitions():
		if not bool(module.get("derived", false)):
			ids.append(str(module.get("id", "")))
	return ids


static func _normalized_dirty_modules(raw: Dictionary) -> Array[String]:
	var allowed := {}
	for id in module_ids():
		allowed[id] = true
	var dirty: Array[String] = []
	var raw_dirty = raw.get("dirtyModules", null)
	if raw_dirty is Array:
		for module_id in raw_dirty as Array:
			var id := str(module_id).strip_edges()
			if id == "equipmentSlots":
				id = "equipment"
			if id != "" and allowed.has(id) and not dirty.has(id):
				dirty.append(id)
	if raw_dirty == null and int(raw.get("schemaVersion", 0)) <= 0:
		return _default_dirty_modules()
	return dirty


static func _module_record_count(profile: Dictionary, module: Dictionary) -> int:
	var total := 0
	var local_keys = module.get("localKeys", [])
	if not (local_keys is Array):
		return 0
	for key_value in local_keys as Array:
		total += _value_count(profile.get(str(key_value), null))
	return total


static func _value_count(value) -> int:
	match typeof(value):
		TYPE_ARRAY:
			return (value as Array).size()
		TYPE_DICTIONARY:
			return (value as Dictionary).size()
		TYPE_NIL:
			return 0
		_:
			return 1


static func _unique_strings(values: Array) -> Array[String]:
	var result: Array[String] = []
	for value in values:
		var text := str(value).strip_edges()
		if text != "" and not result.has(text):
			result.append(text)
	return result
