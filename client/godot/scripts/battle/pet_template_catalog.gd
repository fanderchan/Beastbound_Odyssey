extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")
const BattlePassiveCatalog := preload("res://scripts/battle/battle_passive_catalog.gd")

const TEMPLATES_PATH := "res://data/pet_templates.json"
const ELEMENT_IDS := ["fire", "water", "earth", "wind"]


static func catalog() -> Dictionary:
	if not FileAccess.file_exists(TEMPLATES_PATH):
		return {}
	var text := FileAccess.get_file_as_string(TEMPLATES_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


static func lines() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var loaded_catalog := catalog()
	var raw_lines = loaded_catalog.get("lines", [])
	if raw_lines is Array:
		for value in raw_lines:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result


static func subtypes() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var loaded_catalog := catalog()
	var raw_subtypes = loaded_catalog.get("subtypes", [])
	if raw_subtypes is Array:
		for value in raw_subtypes:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result


static func forms() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var loaded_catalog := catalog()
	var raw_forms = loaded_catalog.get("forms", [])
	if raw_forms is Array:
		for value in raw_forms:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result


static func catchable_wild_pet_pool(level_min: int = 1, level_max: int = 1) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var min_level := maxi(1, level_min)
	var max_level := maxi(min_level, level_max)
	for form in forms():
		var form_id := str(form.get("formId", ""))
		if form_id == "":
			continue
		var capture = form.get("capture", {})
		var capture_dict := capture as Dictionary if capture is Dictionary else {}
		if not bool(capture_dict.get("catchable", true)):
			continue
		var entry := {
			"formId": form_id,
			"name": str(form.get("wildName", form.get("formName", "野生宠物"))),
			"weight": maxf(0.0, float(form.get("encounterWeight", 1.0))),
			"levelMin": min_level,
			"levelMax": max_level,
		}
		var stats = form.get("baseStats", {})
		if stats is Dictionary:
			var stats_dict := stats as Dictionary
			entry["battleStats"] = {
				"maxHp": int(stats_dict.get("maxHp", 1)),
				"attack": int(stats_dict.get("attack", 12)),
				"defense": int(stats_dict.get("defense", 6)),
				"agility": int(stats_dict.get("agility", 50)),
			}
		result.append(entry)
	return result


static func line_by_id(line_id: String) -> Dictionary:
	for line in lines():
		if str(line.get("lineId", "")) == line_id:
			return line
	return {}


static func subtype_by_id(subtype_id: String) -> Dictionary:
	for subtype in subtypes():
		if str(subtype.get("subtypeId", "")) == subtype_id:
			return subtype
	return {}


static func form_by_id(form_id: String) -> Dictionary:
	for form in forms():
		if str(form.get("formId", "")) == form_id:
			return form
	return {}


static func runtime_template_for_form(form_id: String) -> Dictionary:
	var form := form_by_id(form_id)
	if form.is_empty():
		return {}
	var line_id := str(form.get("lineId", ""))
	var subtype_id := str(form.get("subtypeId", ""))
	var line := line_by_id(line_id)
	var subtype := subtype_by_id(subtype_id)
	if line.is_empty() or subtype.is_empty():
		return {}
	var result := form.duplicate(true)
	result["lineName"] = str(line.get("lineName", ""))
	result["subtypeName"] = str(subtype.get("subtypeName", ""))
	result["activeSkillIds"] = active_skill_ids_for_form(form_id)
	result["passiveSkillIds"] = passive_ids_for_form(form_id)
	return result


static func active_skill_ids_for_form(form_id: String) -> Array[String]:
	var result: Array[String] = []
	var form := form_by_id(form_id)
	if form.is_empty():
		return result
	var subtype := subtype_by_id(str(form.get("subtypeId", "")))
	return _string_array(subtype.get("activeSkillIds", []))


static func active_skill_ids_for_actor(actor: Dictionary) -> Array[String]:
	var result := _string_array(actor.get("activeSkillIds", []))
	if not result.is_empty():
		return result
	var form_id := str(actor.get("formId", actor.get("templateId", "")))
	return active_skill_ids_for_form(form_id)


static func passive_ids_for_form(form_id: String) -> Array[String]:
	var result: Array[String] = []
	var form := form_by_id(form_id)
	if form.is_empty():
		return result
	var line := line_by_id(str(form.get("lineId", "")))
	var passive_id := str(line.get("passiveSkillId", ""))
	if passive_id != "":
		result.append(passive_id)
	return result


static func pet_skill_action_for_actor_slot(actor: Dictionary, slot: int) -> Dictionary:
	if actor.is_empty():
		return {}
	var action := BattleActionCatalog.pet_skill_action_for_slot(slot)
	if action.is_empty():
		return {}
	var action_id := str(action.get("id", ""))
	var active_skill_ids := active_skill_ids_for_actor(actor)
	var has_template_source := (
		actor.has("activeSkillIds")
		or str(actor.get("formId", actor.get("templateId", ""))) != ""
	)
	if has_template_source and not active_skill_ids.has(action_id):
		return {}
	return action


static func actor_from_form(form_id: String, actor_id: String, side: String, kind: String, slot_id: String, name_override: String = "", stat_overrides: Dictionary = {}) -> Dictionary:
	var template := runtime_template_for_form(form_id)
	if template.is_empty():
		return {}
	var stats = template.get("baseStats", {})
	var stats_dict := stats as Dictionary if stats is Dictionary else {}
	var capture = template.get("capture", {})
	var capture_dict := capture as Dictionary if capture is Dictionary else {}
	var max_hp := int(stat_overrides.get("maxHp", stats_dict.get("maxHp", 1)))
	var hp := int(stat_overrides.get("hp", max_hp))
	var actor_name := name_override if name_override != "" else str(template.get("formName", "宠物"))
	return {
		"id": actor_id,
		"name": actor_name,
		"side": side,
		"kind": kind,
		"slotId": slot_id,
		"hp": clampi(hp, 0, max_hp),
		"maxHp": max_hp,
		"quick": int(stat_overrides.get("quick", stats_dict.get("agility", 50))),
		"attack": int(stat_overrides.get("attack", stats_dict.get("attack", 12))),
		"defense": int(stat_overrides.get("defense", stats_dict.get("defense", 6))),
		"catchable": bool(capture_dict.get("catchable", side == "enemy" and kind == "wild_pet")),
		"captureDifficulty": int(capture_dict.get("difficulty", 42)),
		"actionState": "idle",
		"petBattleState": "battle" if kind == "pet" or kind == "wild_pet" else "",
		"templateId": form_id,
		"formId": form_id,
		"formName": str(template.get("formName", "")),
		"lineId": str(template.get("lineId", "")),
		"lineName": str(template.get("lineName", "")),
		"subtypeId": str(template.get("subtypeId", "")),
		"subtypeName": str(template.get("subtypeName", "")),
		"growthProfileId": str(template.get("growthProfileId", "")),
		"elements": _elements_for_template(template),
		"activeSkillIds": _string_array(template.get("activeSkillIds", [])),
		"passiveSkillIds": _string_array(template.get("passiveSkillIds", [])),
	}


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded_catalog := catalog()
	if loaded_catalog.is_empty():
		errors.append("pet_templates.json 缺失或不是 JSON 对象")
		return errors
	if int(loaded_catalog.get("schemaVersion", 0)) != 1:
		errors.append("pet_templates.json schemaVersion 当前必须是 1")

	var raw_lines = loaded_catalog.get("lines", [])
	var raw_subtypes = loaded_catalog.get("subtypes", [])
	var raw_forms = loaded_catalog.get("forms", [])
	if not (raw_lines is Array) or (raw_lines as Array).is_empty():
		errors.append("pet_templates.json lines 必须是非空数组")
	if not (raw_subtypes is Array) or (raw_subtypes as Array).is_empty():
		errors.append("pet_templates.json subtypes 必须是非空数组")
	if not (raw_forms is Array) or (raw_forms as Array).is_empty():
		errors.append("pet_templates.json forms 必须是非空数组")
	if not errors.is_empty():
		return errors

	var line_ids := {}
	var subtype_ids := {}
	var form_ids := {}
	for index in range((raw_lines as Array).size()):
		_validate_line((raw_lines as Array)[index], index, line_ids, errors)
	for index in range((raw_subtypes as Array).size()):
		_validate_subtype((raw_subtypes as Array)[index], index, line_ids, subtype_ids, errors)
	for index in range((raw_forms as Array).size()):
		_validate_form((raw_forms as Array)[index], index, line_ids, subtype_ids, form_ids, errors)
	return errors


static func _validate_line(value, index: int, line_ids: Dictionary, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("lines[%d] 不是对象" % index)
		return
	var line := value as Dictionary
	var line_id := str(line.get("lineId", ""))
	if line_id == "":
		errors.append("lines[%d].lineId 不能为空" % index)
	elif line_ids.has(line_id):
		errors.append("lineId 重复: %s" % line_id)
	else:
		line_ids[line_id] = true
	if str(line.get("lineName", "")) == "":
		errors.append("%s.lineName 不能为空" % _line_name(line, index))
	var passive_id := str(line.get("passiveSkillId", ""))
	if passive_id == "":
		errors.append("%s.passiveSkillId 不能为空" % _line_name(line, index))
	elif BattlePassiveCatalog.passive_by_id(passive_id).is_empty():
		errors.append("%s.passiveSkillId 不存在: %s" % [_line_name(line, index), passive_id])
	for forbidden_key in ["passiveSkillIds", "allowedPassiveSkillIds", "passivePoolIds"]:
		if line.has(forbidden_key):
			errors.append("%s 不允许使用 %s；种系必须只有一个 passiveSkillId" % [_line_name(line, index), forbidden_key])


static func _validate_subtype(value, index: int, line_ids: Dictionary, subtype_ids: Dictionary, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("subtypes[%d] 不是对象" % index)
		return
	var subtype := value as Dictionary
	var subtype_id := str(subtype.get("subtypeId", ""))
	if subtype_id == "":
		errors.append("subtypes[%d].subtypeId 不能为空" % index)
	elif subtype_ids.has(subtype_id):
		errors.append("subtypeId 重复: %s" % subtype_id)
	else:
		subtype_ids[subtype_id] = str(subtype.get("lineId", ""))
	if str(subtype.get("subtypeName", "")) == "":
		errors.append("%s.subtypeName 不能为空" % _subtype_name(subtype, index))
	var line_id := str(subtype.get("lineId", ""))
	if not line_ids.has(line_id):
		errors.append("%s.lineId 不存在: %s" % [_subtype_name(subtype, index), line_id])
	var raw_actions = subtype.get("activeSkillIds", [])
	if not (raw_actions is Array) or (raw_actions as Array).is_empty():
		errors.append("%s.activeSkillIds 必须是非空数组" % _subtype_name(subtype, index))
	elif raw_actions is Array:
		var seen_slots := {}
		var action_ids := _string_array(raw_actions)
		for action_value in raw_actions:
			var action_id := str(action_value)
			var action := BattleActionCatalog.action_by_id(action_id)
			if action_id == "" or action.is_empty():
				errors.append("%s.activeSkillIds 包含不存在的动作: %s" % [_subtype_name(subtype, index), action_id])
				continue
			if str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
				errors.append("%s.activeSkillIds 只能引用宠物技能: %s" % [_subtype_name(subtype, index), action_id])
			var slot := int(action.get("slot", 0))
			if slot <= 0:
				errors.append("%s.activeSkillIds 缺少有效技能槽: %s" % [_subtype_name(subtype, index), action_id])
			elif seen_slots.has(slot):
				errors.append("%s.activeSkillIds 技能槽重复: 技%d" % [_subtype_name(subtype, index), slot])
			else:
				seen_slots[slot] = true
		for required_id in ["pet_attack", "pet_defend"]:
			if not action_ids.has(required_id):
				errors.append("%s.activeSkillIds 必须包含 %s" % [_subtype_name(subtype, index), required_id])


static func _validate_form(value, index: int, line_ids: Dictionary, subtype_ids: Dictionary, form_ids: Dictionary, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("forms[%d] 不是对象" % index)
		return
	var form := value as Dictionary
	var form_id := str(form.get("formId", ""))
	if form_id == "":
		errors.append("forms[%d].formId 不能为空" % index)
	elif form_ids.has(form_id):
		errors.append("formId 重复: %s" % form_id)
	else:
		form_ids[form_id] = true
	if str(form.get("formName", "")) == "":
		errors.append("%s.formName 不能为空" % _form_name(form, index))
	var line_id := str(form.get("lineId", ""))
	var subtype_id := str(form.get("subtypeId", ""))
	if not line_ids.has(line_id):
		errors.append("%s.lineId 不存在: %s" % [_form_name(form, index), line_id])
	if not subtype_ids.has(subtype_id):
		errors.append("%s.subtypeId 不存在: %s" % [_form_name(form, index), subtype_id])
	elif str(subtype_ids.get(subtype_id, "")) != line_id:
		errors.append("%s.subtypeId 所属种系和 form.lineId 不一致" % _form_name(form, index))
	_validate_elements(form, index, errors)
	_validate_base_stats(form, index, errors)
	for forbidden_key in ["passiveSkillIds", "extraPassiveSkillIds", "allowedPassiveSkillIds"]:
		if form.has(forbidden_key):
			errors.append("%s 不允许使用 %s；形态不能追加或替换种系被动" % [_form_name(form, index), forbidden_key])


static func _validate_elements(form: Dictionary, index: int, errors: Array[String]) -> void:
	var raw_elements = form.get("elements", {})
	if not (raw_elements is Dictionary):
		errors.append("%s.elements 必须是对象" % _form_name(form, index))
		return
	var total := 0
	for element_id in ELEMENT_IDS:
		if not (raw_elements as Dictionary).has(element_id):
			errors.append("%s.elements.%s 缺失" % [_form_name(form, index), element_id])
			continue
		var value_type := typeof((raw_elements as Dictionary).get(element_id))
		if value_type != TYPE_INT and value_type != TYPE_FLOAT:
			errors.append("%s.elements.%s 必须是数字" % [_form_name(form, index), element_id])
			continue
		var value := int((raw_elements as Dictionary).get(element_id, 0))
		if value < 0 or value > 10:
			errors.append("%s.elements.%s 必须在 0 到 10 之间" % [_form_name(form, index), element_id])
		total += value
	if total != 10:
		errors.append("%s.elements 四系合计必须为 10，当前为 %d" % [_form_name(form, index), total])


static func _validate_base_stats(form: Dictionary, index: int, errors: Array[String]) -> void:
	var raw_stats = form.get("baseStats", {})
	if not (raw_stats is Dictionary):
		errors.append("%s.baseStats 必须是对象" % _form_name(form, index))
		return
	for key in ["maxHp", "attack", "defense", "agility"]:
		var value_type := typeof((raw_stats as Dictionary).get(key))
		if value_type != TYPE_INT and value_type != TYPE_FLOAT:
			errors.append("%s.baseStats.%s 必须是数字" % [_form_name(form, index), key])
		elif int((raw_stats as Dictionary).get(key, 0)) <= 0:
			errors.append("%s.baseStats.%s 必须大于 0" % [_form_name(form, index), key])


static func _elements_for_template(template: Dictionary) -> Dictionary:
	var result := {}
	var raw_elements = template.get("elements", {})
	if raw_elements is Dictionary:
		for element_id in ELEMENT_IDS:
			result[element_id] = int((raw_elements as Dictionary).get(element_id, 0))
	return result


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "":
				result.append(text)
	return result


static func _line_name(line: Dictionary, index: int) -> String:
	var line_id := str(line.get("lineId", ""))
	return line_id if line_id != "" else "lines[%d]" % index


static func _subtype_name(subtype: Dictionary, index: int) -> String:
	var subtype_id := str(subtype.get("subtypeId", ""))
	return subtype_id if subtype_id != "" else "subtypes[%d]" % index


static func _form_name(form: Dictionary, index: int) -> String:
	var form_id := str(form.get("formId", ""))
	return form_id if form_id != "" else "forms[%d]" % index
