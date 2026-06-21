extends RefCounted

const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const SAVE_PATH := "user://player_profile.json"
const PROFILE_SCHEMA_VERSION := 1
const PET_STATE_BATTLE := "battle"
const PET_STATE_STANDBY := "standby"
const PET_STATE_REST := "rest"
const PET_STATE_STORAGE := "storage"
const PARTY_LIMIT := 5


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
			_pet_instance_from_form("pet_bui_rest", "休息布伊", "bui_normal_red_fire10", PET_STATE_REST, 1, {"hp": 0}),
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
	if active_id == "" or _pet_instance_index(instances, active_id) < 0:
		active_id = str(instances[0].get("instanceId", ""))
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
	var active_added := false
	for instance in _pet_instances(normalized):
		var state := str(instance.get("state", PET_STATE_STANDBY))
		if str(instance.get("instanceId", "")) == active_id:
			var active_entry := instance.duplicate(true)
			active_entry["state"] = PET_STATE_BATTLE
			active_entry["actorId"] = "ally_pet"
			party.append(active_entry)
			active_added = true
			break
	if not active_added:
		var instances := _pet_instances(normalized)
		if not instances.is_empty():
			var active_fallback := instances[0].duplicate(true)
			active_fallback["state"] = PET_STATE_BATTLE
			active_fallback["actorId"] = "ally_pet"
			party.append(active_fallback)
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
