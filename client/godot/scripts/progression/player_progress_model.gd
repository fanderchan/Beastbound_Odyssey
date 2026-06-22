extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const SAVE_PATH := "user://player_profile.json"
const PROFILE_SCHEMA_VERSION := 1
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"
const PET_STATE_STORAGE := "storage"
const PARTY_LIMIT := 5
const PET_NAME_MAX_LENGTH := 8
const PET_REST_RECOVERY_RATIO := 0.05
const PET_DROP_TTL_SECONDS := 600
const PET_PICKUP_LEVEL_MARGIN := 5
const PET_DROP_PICKUP_PUBLIC := "public"
const LOCAL_PLAYER_ID := "local_player"
const CAPTURE_TOOLS_KEY := "captureTools"
const PET_CODEX_SEEN_FORM_IDS_KEY := "petCodexSeenFormIds"
const PET_CODEX_CAPTURED_FORM_IDS_KEY := "petCodexCapturedFormIds"


static func default_profile() -> Dictionary:
	return {
		"schemaVersion": PROFILE_SCHEMA_VERSION,
		"player": {
			"name": "见习猎人",
			"level": 1,
			"exp": 0,
			"nextExp": exp_to_next_level(1),
		},
		"activePetInstanceId": "pet_bui_main",
		"nextPetInstanceSerial": 5,
		"nextPetDropSerial": 1,
		"petInstances": [
			_pet_instance_from_form("pet_bui_main", "我的布伊", "bui_normal_red_fire10", PET_STATE_BATTLE, 1),
			_pet_instance_from_form("pet_bui_speed", "黄色普通布伊", "bui_normal_yellow_wind10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_tough", "厚皮布伊", "bui_normal_thick_earth10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", PET_STATE_REST, 1),
		],
		"groundPetDrops": [],
		"captureTools": CaptureToolCatalog.starting_inventory(),
		"petCodexSeenFormIds": [],
		"petCodexCapturedFormIds": [],
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


static func capture_tool_inventory(profile: Dictionary) -> Dictionary:
	return CaptureToolCatalog.normalize_inventory(normalize_profile(profile).get(CAPTURE_TOOLS_KEY, {}))


static func capture_tool_count(profile: Dictionary, tool_id: String) -> int:
	return CaptureToolCatalog.count_for(capture_tool_inventory(profile), tool_id)


static func with_capture_tool_inventory(profile: Dictionary, inventory: Dictionary) -> Dictionary:
	var normalized := normalize_profile(profile)
	normalized[CAPTURE_TOOLS_KEY] = CaptureToolCatalog.normalize_inventory(inventory)
	return normalized


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


static func can_heal_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var instance := pet_instance_by_id(normalized, instance_id)
	if instance.is_empty():
		return {"ok": false, "message": "没有找到这只宠物。"}
	var max_hp := maxi(1, int(instance.get("maxHp", 1)))
	var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
	if hp >= max_hp:
		return {"ok": false, "message": "%s 生命已满。" % str(instance.get("name", "宠物"))}
	return {"ok": true, "message": "%s 可以治疗。" % str(instance.get("name", "宠物"))}


static func heal_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	var normalized := normalize_profile(profile)
	var check := can_heal_pet(normalized, instance_id)
	if not bool(check.get("ok", false)):
		return {
			"ok": false,
			"profile": normalized,
			"message": str(check.get("message", "不能治疗。")),
		}
	var healed_name := "宠物"
	var healed_amount := 0
	var instances: Array = normalized.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		if str(instance.get("instanceId", "")) != instance_id:
			instances[index] = instance
			continue
		var max_hp := maxi(1, int(instance.get("maxHp", 1)))
		var hp := clampi(int(instance.get("hp", max_hp)), 0, max_hp)
		healed_name = str(instance.get("name", "宠物"))
		healed_amount = maxi(0, max_hp - hp)
		instance["hp"] = max_hp
		instances[index] = instance
		break
	normalized["petInstances"] = instances
	normalized = normalize_profile(normalized)
	return {
		"ok": healed_amount > 0,
		"profile": normalized,
		"message": "%s 已治疗。" % healed_name,
		"heal": healed_amount,
	}


static func rest_recovery_amount_for_instance(instance: Dictionary) -> int:
	var max_hp := maxi(1, int(instance.get("maxHp", 1)))
	return maxi(1, int(ceil(float(max_hp) * PET_REST_RECOVERY_RATIO)))


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
	for skill_id in _string_array(instance.get("activeSkillIds", [])):
		var label := BattleActionCatalog.label_for(skill_id, skill_id)
		if label != "":
			labels.append(label)
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
	lines.append("经验：%d/%d" % [
		int(instance.get("exp", 0)),
		int(instance.get("nextExp", exp_to_next_level(int(instance.get("level", 1))))),
	])
	var skill_labels := active_skill_labels_for_instance(instance)
	lines.append("主动技能：%s" % ("、".join(skill_labels) if not skill_labels.is_empty() else "无"))
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
	normalized[CAPTURE_TOOLS_KEY] = CaptureToolCatalog.normalize_inventory(normalized.get(CAPTURE_TOOLS_KEY, {}))

	var seen_form_ids := _valid_unique_form_id_array(normalized.get(PET_CODEX_SEEN_FORM_IDS_KEY, []))
	var captured_form_ids := _valid_unique_form_id_array(normalized.get(PET_CODEX_CAPTURED_FORM_IDS_KEY, []))
	for form_id in captured_form_ids:
		if not seen_form_ids.has(form_id):
			seen_form_ids.append(form_id)
	normalized[PET_CODEX_SEEN_FORM_IDS_KEY] = seen_form_ids
	normalized[PET_CODEX_CAPTURED_FORM_IDS_KEY] = captured_form_ids

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


static func apply_profile_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var normalized := normalize_profile(profile)
	next_state["captureToolBag"] = capture_tool_inventory(normalized)
	next_state = _apply_profile_player_to_battle_state(normalized, next_state)
	var party := pet_party_for_battle(normalized)
	next_state["petParty"] = party
	var active_entry := _active_party_entry(party)
	if active_entry.is_empty():
		next_state["actors"] = _actors_without_id(next_state, "ally_pet")
		return next_state
	var active_actor := actor_from_pet_instance(active_entry, "ally_pet", "ally", "ally.front.3")
	if active_actor.is_empty():
		return next_state
	var actors: Array = next_state.get("actors", [])
	var replaced := false
	for index in range(actors.size()):
		var actor := actors[index] as Dictionary
		if str(actor.get("id", "")) == "ally_pet":
			actors[index] = active_actor
			replaced = true
			break
	if not replaced:
		actors.append(active_actor)
	next_state["actors"] = actors
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
	actor["petBattleState"] = PET_STATE_BATTLE
	return BattlePassiveCatalog.apply_actor_passive_effects(actor)


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
	next_profile[CAPTURE_TOOLS_KEY] = CaptureToolCatalog.normalize_inventory(state.get("captureToolBag", next_profile.get(CAPTURE_TOOLS_KEY, {})))
	next_profile = _merge_battle_pet_party(next_profile, state)
	next_profile = _with_codex_forms_seen_from_battle(next_profile, state)
	var result := result_override if result_override != "" else battle_result_for_state(state)
	var exp_reward := battle_exp_reward(state) if result == "victory" else 0
	var level_up_lines: Array[String] = []
	if exp_reward > 0:
		var player = next_profile.get("player", {}) as Dictionary
		var player_award := _award_exp(player, exp_reward)
		next_profile["player"] = player_award.get("entry", player)
		if bool(player_award.get("leveled", false)):
			level_up_lines.append("%s 升到 Lv%d。" % [str(player.get("name", "见习猎人")), int((player_award.get("entry", {}) as Dictionary).get("level", 1))])
		var active_id := str(next_profile.get("activePetInstanceId", ""))
		var instances: Array = next_profile.get("petInstances", [])
		for index in range(instances.size()):
			var instance := instances[index] as Dictionary
			if str(instance.get("instanceId", "")) != active_id:
				continue
			var pet_award := _award_exp(instance, exp_reward)
			instances[index] = pet_award.get("entry", instance)
			if bool(pet_award.get("leveled", false)):
				level_up_lines.append("%s 升到 Lv%d。" % [str(instance.get("name", "宠物")), int((pet_award.get("entry", {}) as Dictionary).get("level", 1))])
			break
		next_profile["petInstances"] = instances

	var captured_instances := _captured_pet_instances_from_state(next_profile, state)
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
		"capturedPets": captured_instances,
		"logLines": battle_result_log_lines(result, exp_reward, captured_instances, level_up_lines, next_profile),
	}


static func battle_result_log_lines(result: String, exp_reward: int, captured_instances: Array[Dictionary], level_up_lines: Array[String], profile: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	match result:
		"victory":
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
		"defeat":
			lines.append("战斗失败。")
		"escape":
			lines.append("成功逃跑。")
		_:
			lines.append("战斗结束。")
	for line in level_up_lines:
		if lines.size() >= 2:
			break
		lines.append(line)
	return lines


static func _captured_pet_log_part(captured: Dictionary) -> String:
	var pet_name := str(captured.get("name", "宠物"))
	var level := maxi(1, int(captured.get("level", 1)))
	var destination := "队伍已满，已送入兽栏" if str(captured.get("state", PET_STATE_STANDBY)) == PET_STATE_STORAGE else "已加入队伍"
	return "捕捉了%s Lv%d，%s" % [pet_name, level, destination]


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
	}


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
			for key in ["name", "state", "hp", "maxHp", "quick", "attack", "defense", "formId", "templateId", "lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "passiveSkillIds"]:
				if entry.has(key):
					instance[key] = entry.get(key)
			instances[index] = instance
			break
	next_profile["petInstances"] = instances
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
	var captured_instances: Array[Dictionary] = []
	var serial := maxi(int(profile.get("nextPetInstanceSerial", 1)), _next_serial_from_instances(_pet_instances(profile)))
	var occupied_party_count := _party_visible_instance_count(profile)
	for actor in _actors(state):
		if not bool(actor.get("captured", false)):
			continue
		var form_id := str(actor.get("formId", actor.get("templateId", "")))
		if form_id == "":
			continue
		var instance_id := "pet_captured_%d" % serial
		serial += 1
		var state_name := PET_STATE_STANDBY if occupied_party_count < PARTY_LIMIT else PET_STATE_STORAGE
		occupied_party_count += 1
		var captured := _pet_instance_from_form(instance_id, str(actor.get("name", actor.get("formName", "宠物"))), form_id, state_name, maxi(1, int(actor.get("level", 1))), {
			"hp": maxi(1, int(actor.get("maxHp", actor.get("hp", 1)))),
			"maxHp": int(actor.get("maxHp", 1)),
			"quick": int(actor.get("quick", 50)),
			"attack": int(actor.get("attack", 12)),
			"defense": int(actor.get("defense", 6)),
		})
		captured_instances.append(captured)
	return captured_instances


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
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "passiveSkillIds"]:
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
	for key in ["lineId", "lineName", "subtypeId", "subtypeName", "formName", "growthProfileId", "elements", "activeSkillIds", "passiveSkillIds"]:
		if template.has(key):
			instance[key] = template.get(key)
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


static func _valid_unique_form_id_array(value) -> Array[String]:
	var result: Array[String] = []
	for form_id in _string_array(value):
		if result.has(form_id):
			continue
		if PetTemplateCatalog.runtime_template_for_form(form_id).is_empty():
			continue
		result.append(form_id)
	return result
