extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
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
		"petInstances": [
			_pet_instance_from_form("pet_bui_main", "我的布伊", "bui_normal_red_fire10", PET_STATE_BATTLE, 1),
			_pet_instance_from_form("pet_bui_speed", "黄色普通布伊", "bui_normal_yellow_wind10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_tough", "厚皮布伊", "bui_normal_thick_earth10", PET_STATE_STANDBY, 1),
			_pet_instance_from_form("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", PET_STATE_REST, 1),
		],
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


static func all_pet_instances(profile: Dictionary) -> Array[Dictionary]:
	return _pet_instances(normalize_profile(profile))


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

	var instances: Array[Dictionary] = []
	var raw_instances = normalized.get("petInstances", [])
	if raw_instances is Array:
		for value in raw_instances:
			if value is Dictionary:
				var instance := _normalize_pet_instance(value as Dictionary)
				if not instance.is_empty():
					instances.append(instance)
	if instances.is_empty():
		instances = default_profile().get("petInstances", [])
	normalized["petInstances"] = instances

	var active_id := str(normalized.get("activePetInstanceId", ""))
	if active_id != "":
		var active_index := _pet_instance_index(instances, active_id)
		if active_index < 0 or str(instances[active_index].get("state", PET_STATE_STANDBY)) != PET_STATE_BATTLE:
			active_id = ""
	if active_id == "":
		active_id = _first_battle_pet_id({"petInstances": instances})
	normalized["activePetInstanceId"] = active_id
	normalized["nextPetInstanceSerial"] = maxi(int(normalized.get("nextPetInstanceSerial", instances.size() + 1)), _next_serial_from_instances(instances))
	return normalized


static func apply_profile_to_battle_state(profile: Dictionary, state: Dictionary) -> Dictionary:
	var next_state := state.duplicate(true)
	var normalized := normalize_profile(profile)
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
	next_profile = _merge_battle_pet_party(next_profile, state)
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
				var names: Array[String] = []
				for captured in captured_instances:
					names.append(str(captured.get("name", "宠物")))
				second_parts.append("捕捉了%s" % "、".join(names))
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


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result
