extends RefCounted

const PASSIVES_PATH := "res://data/battle_passive_skills.json"
const ELEMENT_IDS := ["fire", "water", "earth", "wind"]


static func catalog() -> Dictionary:
	if not FileAccess.file_exists(PASSIVES_PATH):
		return {}
	var text := FileAccess.get_file_as_string(PASSIVES_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


static func passives() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var loaded_catalog := catalog()
	var raw_passives: Array = loaded_catalog.get("passives", [])
	for value in raw_passives:
		if value is Dictionary:
			result.append(value as Dictionary)
	return result


static func passive_by_id(passive_id: String) -> Dictionary:
	for passive in passives():
		if str(passive.get("id", "")) == passive_id:
			return passive
	return {}


static func passive_ids_for_actor(actor: Dictionary) -> Array[String]:
	var result: Array[String] = []
	var raw_ids = actor.get("passiveSkillIds", [])
	if raw_ids is Array:
		for value in raw_ids:
			var passive_id := str(value)
			if passive_id != "":
				result.append(passive_id)
	return result


static func display_lines_for_actor(actor: Dictionary) -> Array[String]:
	var lines: Array[String] = []
	for passive_id in passive_ids_for_actor(actor):
		var passive := passive_by_id(passive_id)
		if passive.is_empty():
			continue
		var label := str(passive.get("label", ""))
		var description := str(passive.get("description", ""))
		if label == "" or description == "":
			continue
		lines.append("%s：%s" % [label, description])
	return lines


static func display_text_for_actor(actor: Dictionary) -> String:
	return "\n".join(display_lines_for_actor(actor))


static func apply_actor_passive_effects(actor: Dictionary) -> Dictionary:
	var next_actor := actor.duplicate(true)
	for passive_id in passive_ids_for_actor(next_actor):
		var passive := passive_by_id(passive_id)
		if passive.is_empty():
			continue
		var effect = passive.get("effect", {})
		if effect is Dictionary:
			_apply_passive_effect(next_actor, effect as Dictionary)
	return next_actor


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded_catalog := catalog()
	if loaded_catalog.is_empty():
		errors.append("battle_passive_skills.json 缺失或不是 JSON 对象")
		return errors
	if int(loaded_catalog.get("schemaVersion", 0)) != 1:
		errors.append("schemaVersion 当前必须是 1")
	var raw_passives: Array = loaded_catalog.get("passives", [])
	if raw_passives.is_empty():
		errors.append("passives 不能为空")
		return errors
	var seen_ids := {}
	for index in range(raw_passives.size()):
		var passive = raw_passives[index]
		if not (passive is Dictionary):
			errors.append("passives[%d] 不是对象" % index)
			continue
		_validate_passive(passive as Dictionary, index, seen_ids, errors)
	return errors


static func _apply_passive_effect(actor: Dictionary, effect: Dictionary) -> void:
	if str(effect.get("type", "")) == "element_scaled_status_resist":
		_apply_element_scaled_status_resist(actor, effect)

	var raw_immunities = effect.get("statusImmune", [])
	if raw_immunities is Array:
		var immune = actor.get("statusImmune", {})
		var next_immune := (immune as Dictionary).duplicate(true) if immune is Dictionary else {}
		for status_value in raw_immunities:
			var status_id := str(status_value)
			if status_id != "":
				next_immune[status_id] = true
		actor["statusImmune"] = next_immune

	var raw_resist = effect.get("statusResist", {})
	if raw_resist is Dictionary:
		var resist = actor.get("statusResist", {})
		var next_resist := (resist as Dictionary).duplicate(true) if resist is Dictionary else {}
		for status_key in (raw_resist as Dictionary).keys():
			var status_id := str(status_key)
			if status_id == "":
				continue
			var current := clampf(float(next_resist.get(status_id, 0.0)), 0.0, 1.0)
			var passive_value := clampf(float((raw_resist as Dictionary).get(status_key, 0.0)), 0.0, 1.0)
			next_resist[status_id] = maxf(current, passive_value)
		actor["statusResist"] = next_resist


static func _apply_element_scaled_status_resist(actor: Dictionary, effect: Dictionary) -> void:
	var raw_mapping = effect.get("mapping", {})
	if not (raw_mapping is Dictionary):
		return
	var raw_elements = actor.get("elements", {})
	if not (raw_elements is Dictionary):
		return
	var scale_per_point := clampf(float(effect.get("scalePerPoint", 0.0)), 0.0, 1.0)
	var immune_threshold := float(effect.get("immuneAtOrAbove", 2.0))
	var resist = actor.get("statusResist", {})
	var next_resist := (resist as Dictionary).duplicate(true) if resist is Dictionary else {}
	var immune = actor.get("statusImmune", {})
	var next_immune := (immune as Dictionary).duplicate(true) if immune is Dictionary else {}
	for element_key in (raw_mapping as Dictionary).keys():
		var element_id := str(element_key)
		var status_id := str((raw_mapping as Dictionary).get(element_key, ""))
		if not ELEMENT_IDS.has(element_id) or not _valid_status_id(status_id):
			continue
		var element_points := clampf(float((raw_elements as Dictionary).get(element_id, 0.0)), 0.0, 10.0)
		var passive_value := clampf(element_points * scale_per_point, 0.0, 1.0)
		var current := clampf(float(next_resist.get(status_id, 0.0)), 0.0, 1.0)
		next_resist[status_id] = maxf(current, passive_value)
		if passive_value >= immune_threshold:
			next_immune[status_id] = true
	actor["statusResist"] = next_resist
	actor["statusImmune"] = next_immune


static func _validate_passive(passive: Dictionary, index: int, seen_ids: Dictionary, errors: Array[String]) -> void:
	var passive_id := str(passive.get("id", ""))
	if passive_id == "":
		errors.append("passives[%d].id 不能为空" % index)
	elif seen_ids.has(passive_id):
		errors.append("passive id 重复: %s" % passive_id)
	else:
		seen_ids[passive_id] = true

	if str(passive.get("label", "")) == "":
		errors.append("%s.label 不能为空" % _passive_name(passive, index))
	if str(passive.get("description", "")) == "":
		errors.append("%s.description 不能为空" % _passive_name(passive, index))

	var effect = passive.get("effect", {})
	if not (effect is Dictionary):
		errors.append("%s.effect 必须是对象" % _passive_name(passive, index))
		return
	_validate_passive_effect(passive, effect as Dictionary, errors)


static func _validate_passive_effect(passive: Dictionary, effect: Dictionary, errors: Array[String]) -> void:
	var passive_name := _passive_name(passive, -1)
	var raw_immunities = effect.get("statusImmune", [])
	if raw_immunities != null and not (raw_immunities is Array):
		errors.append("%s.effect.statusImmune 必须是数组" % passive_name)
	elif raw_immunities is Array:
		for value in raw_immunities:
			if not _valid_status_id(str(value)):
				errors.append("%s.effect.statusImmune 包含无效状态: %s" % [passive_name, str(value)])

	var raw_resist = effect.get("statusResist", {})
	if raw_resist != null and not (raw_resist is Dictionary):
		errors.append("%s.effect.statusResist 必须是对象" % passive_name)
	elif raw_resist is Dictionary:
		for key in (raw_resist as Dictionary).keys():
			if not _valid_status_id(str(key)) and str(key) != "all":
				errors.append("%s.effect.statusResist 包含无效状态: %s" % [passive_name, str(key)])
			var value_type := typeof((raw_resist as Dictionary).get(key))
			if value_type != TYPE_FLOAT and value_type != TYPE_INT:
				errors.append("%s.effect.statusResist.%s 必须是数字" % [passive_name, str(key)])

	var effect_type := str(effect.get("type", ""))
	if effect_type != "" and effect_type != "element_scaled_status_resist":
		errors.append("%s.effect.type 无效: %s" % [passive_name, effect_type])
	if effect_type == "element_scaled_status_resist":
		var scale_type := typeof(effect.get("scalePerPoint"))
		if scale_type != TYPE_FLOAT and scale_type != TYPE_INT:
			errors.append("%s.effect.scalePerPoint 必须是数字" % passive_name)
		var raw_mapping = effect.get("mapping", {})
		if not (raw_mapping is Dictionary) or (raw_mapping as Dictionary).is_empty():
			errors.append("%s.effect.mapping 必须是非空对象" % passive_name)
		elif raw_mapping is Dictionary:
			for element_key in (raw_mapping as Dictionary).keys():
				var element_id := str(element_key)
				var status_id := str((raw_mapping as Dictionary).get(element_key, ""))
				if not ELEMENT_IDS.has(element_id):
					errors.append("%s.effect.mapping 包含无效属性: %s" % [passive_name, element_id])
				if not _valid_status_id(status_id):
					errors.append("%s.effect.mapping.%s 包含无效状态: %s" % [passive_name, element_id, status_id])
		if effect.has("immuneAtOrAbove"):
			var immune_type := typeof(effect.get("immuneAtOrAbove"))
			if immune_type != TYPE_FLOAT and immune_type != TYPE_INT:
				errors.append("%s.effect.immuneAtOrAbove 必须是数字" % passive_name)


static func _valid_status_id(status_id: String) -> bool:
	return ["poison", "sleep", "confusion", "stone"].has(status_id)


static func _passive_name(passive: Dictionary, index: int) -> String:
	var passive_id := str(passive.get("id", ""))
	if passive_id != "":
		return passive_id
	if index >= 0:
		return "passives[%d]" % index
	return "未命名被动"
