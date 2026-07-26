extends RefCounted

const BASE_ACTIVE_SKILL_IDS: Array[String] = ["pet_attack", "pet_defend"]
const FUSION_ROLE_IDS: Array[String] = ["core", "resonance_one", "resonance_two"]
const FORGET_ACKNOWLEDGEMENT := "double_confirm_irreversible_v1"

const CODE_BASE_SKILL := "pet_skill_base"
const CODE_FUSION_SLOT_OCCUPIED := "pet_fusion_skill_slot_occupied"
const CODE_FUSION_LINEAGE_INVALID := "pet_fusion_lineage_invalid"
const CODE_FUSION_FORGET_CONFIRMATION_REQUIRED := "pet_fusion_skill_forget_confirmation_required"
const CODE_FUSION_INHERITED_RETRAIN_FORBIDDEN := "pet_fusion_inherited_skill_retrain_forbidden"


static func is_fusion_instance(instance: Dictionary, fusion_target_form_ids = []) -> bool:
	if instance.has("fusionLineage"):
		return true
	var form_ids := _unique_ids([
		instance.get("formId", ""),
		instance.get("templateId", ""),
		instance.get("speciesId", ""),
	])
	var target_ids := _unique_ids(fusion_target_form_ids)
	for form_id in form_ids:
		if target_ids.has(form_id):
			return true
	return false


static func effective_active_skill_ids(
	instance: Dictionary,
	template_skill_ids,
	instance_skill_ids,
	forgotten_skill_ids,
	fusion_target_form_ids = []
) -> Array[String]:
	var result: Array[String] = BASE_ACTIVE_SKILL_IDS.duplicate()
	var forgotten := _unique_ids(forgotten_skill_ids)
	var candidates: Array[String] = []
	if not is_fusion_instance(instance, fusion_target_form_ids):
		candidates.append_array(_unique_ids(template_skill_ids))
	candidates.append_array(_unique_ids(instance_skill_ids))
	for skill_id in candidates:
		if BASE_ACTIVE_SKILL_IDS.has(skill_id) or forgotten.has(skill_id) or result.has(skill_id):
			continue
		result.append(skill_id)
	return result


static func slot_assignment_policy(
	instance: Dictionary,
	previous_skill_id: String,
	next_skill_id: String,
	fusion_target_form_ids = []
) -> Dictionary:
	var previous_id := previous_skill_id.strip_edges()
	var next_id := next_skill_id.strip_edges()
	if previous_id == next_id:
		return _allowed()
	if BASE_ACTIVE_SKILL_IDS.has(previous_id):
		return _denied(CODE_BASE_SKILL, "攻击和防御不能覆盖或清空。")
	if not is_fusion_instance(instance, fusion_target_form_ids):
		return _allowed()
	var lineage := active_inheritance_contract(instance, fusion_target_form_ids)
	if not bool(lineage.get("ok", false)):
		return lineage
	if previous_id == "":
		var forgotten := _unique_ids(instance.get("forgottenSkillIds", []))
		if next_id != "" and forgotten.has(next_id):
			var inherited_ids := lineage.get("inheritedActiveSkillIds", []) as Array
			if inherited_ids.has(next_id):
				return _denied(
					CODE_FUSION_INHERITED_RETRAIN_FORBIDDEN,
					"融合遗传主动一旦遗忘就不能重新学习。"
				)
		return _allowed()
	return _denied(CODE_FUSION_SLOT_OCCUPIED, "融合宠训练只能使用空技能位。")


static func forget_policy(
	instance: Dictionary,
	skill_id: String,
	acknowledgement: String = "",
	fusion_target_form_ids = []
) -> Dictionary:
	var normalized_skill_id := skill_id.strip_edges()
	if BASE_ACTIVE_SKILL_IDS.has(normalized_skill_id):
		return _denied(CODE_BASE_SKILL, "攻击和防御不能遗忘。")
	if not is_fusion_instance(instance, fusion_target_form_ids):
		return _allowed()
	var lineage := active_inheritance_contract(instance, fusion_target_form_ids)
	if not bool(lineage.get("ok", false)):
		return lineage
	var inherited_ids := lineage.get("inheritedActiveSkillIds", []) as Array
	if not inherited_ids.has(normalized_skill_id):
		return _allowed()
	if acknowledgement != FORGET_ACKNOWLEDGEMENT:
		var denied := _denied(
			CODE_FUSION_FORGET_CONFIRMATION_REQUIRED,
			"遗传主动遗忘后无法恢复，需要再次确认。"
		)
		denied["requiresAcknowledgement"] = true
		denied["acknowledgement"] = FORGET_ACKNOWLEDGEMENT
		return denied
	var allowed := _allowed()
	allowed["irreversible"] = true
	return allowed


static func active_inheritance_contract(
	instance: Dictionary,
	fusion_target_form_ids = []
) -> Dictionary:
	if not is_fusion_instance(instance, fusion_target_form_ids):
		return {
			"ok": true,
			"code": "",
			"inheritedActiveSkillIds": [],
		}
	var lineage_value = instance.get("fusionLineage", null)
	if not (lineage_value is Dictionary):
		return _invalid_lineage()
	var lineage := lineage_value as Dictionary
	var schema_version = lineage.get("schemaVersion", null)
	var mode = lineage.get("mode", null)
	if (
		(
			typeof(schema_version) != TYPE_INT
			and typeof(schema_version) != TYPE_FLOAT
		)
		or float(schema_version) != 1.0
		or not (mode is String)
		or str(mode) != "fusion"
	):
		return _invalid_lineage()
	var inheritance_value = lineage.get("activeInheritance", null)
	if (
		not (inheritance_value is Array)
		or (inheritance_value as Array).size() > FUSION_ROLE_IDS.size()
	):
		return _invalid_lineage()
	var inherited_ids: Array[String] = []
	var role_ids: Array[String] = []
	for entry_value in inheritance_value as Array:
		if not (entry_value is Dictionary):
			return _invalid_lineage()
		var entry := entry_value as Dictionary
		var inherited_value = entry.get("inherited", null)
		var role_id := str(entry.get("roleId", "")).strip_edges()
		var skill_value = entry.get("skillId", null)
		if (
			typeof(inherited_value) != TYPE_BOOL
			or not bool(inherited_value)
			or not (skill_value is String)
		):
			return _invalid_lineage()
		var inherited_skill_id := str(skill_value).strip_edges()
		if (
			not FUSION_ROLE_IDS.has(role_id)
			or role_ids.has(role_id)
			or not _valid_skill_id(inherited_skill_id)
			or BASE_ACTIVE_SKILL_IDS.has(inherited_skill_id)
		):
			return _invalid_lineage()
		role_ids.append(role_id)
		if not inherited_ids.has(inherited_skill_id):
			inherited_ids.append(inherited_skill_id)
	return {
		"ok": true,
		"code": "",
		"inheritedActiveSkillIds": inherited_ids,
	}


static func _unique_ids(value) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for raw_id in value as Array:
		var skill_id := str(raw_id).strip_edges()
		if skill_id == "" or result.has(skill_id):
			continue
		result.append(skill_id)
	return result


static func _valid_skill_id(skill_id: String) -> bool:
	if skill_id.length() < 2 or skill_id.length() > 96:
		return false
	var first_code := skill_id.unicode_at(0)
	if first_code < 97 or first_code > 122:
		return false
	for index in range(1, skill_id.length()):
		var code := skill_id.unicode_at(index)
		var lowercase := code >= 97 and code <= 122
		var digit := code >= 48 and code <= 57
		if not lowercase and not digit and code != 95:
			return false
	return true


static func _allowed() -> Dictionary:
	return {"ok": true, "code": ""}


static func _denied(code: String, message: String) -> Dictionary:
	return {
		"ok": false,
		"code": code,
		"message": message,
	}


static func _invalid_lineage() -> Dictionary:
	return _denied(CODE_FUSION_LINEAGE_INVALID, "融合血脉记录异常，不能执行技能变更。")
