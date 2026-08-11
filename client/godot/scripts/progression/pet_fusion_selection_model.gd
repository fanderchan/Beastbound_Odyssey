extends RefCounted

const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetRebirthMmModel := preload(
	"res://scripts/progression/pet_rebirth_mm_model.gd"
)
const PetTerminalPathModel := preload(
	"res://scripts/progression/pet_terminal_path_model.gd"
)

const CLOSED_MESSAGE := "宠物融合尚未开放；当前不会消耗任何宠物。"
const READY_MESSAGE := "本地条件符合；提交后仍由服务器最终校验。"
const REQUEST_ID_MAX_LENGTH := 160
const ROLE_IDS := PetFusionRecipeCatalogModel.ROLE_IDS
const ROLE_LABELS := {
	"core": "主宠",
	"resonance_one": "共鸣宠Ⅰ",
	"resonance_two": "共鸣宠Ⅱ",
}


static func availability(catalog_document) -> Dictionary:
	var available := PetFusionRecipeCatalogModel.runtime_available(catalog_document)
	return {
		"available": available,
		"canSelect": available,
		"canRequestQuote": false,
		"messageText": (
			"请选择主宠、共鸣宠Ⅰ和共鸣宠Ⅱ。"
			if available
			else CLOSED_MESSAGE
		),
		"localHintOnly": true,
		"serverFinalAuthority": true,
	}


static func role_label(role_id: String) -> String:
	return str(ROLE_LABELS.get(role_id.strip_edges(), "融合材料"))


static func candidate_hint(
	instance: Dictionary,
	role_id: String,
	current_selection,
	catalog_document
) -> Dictionary:
	var availability_state := availability(catalog_document)
	if not bool(availability_state.get("available", false)):
		return _candidate_result(false, role_id, instance, CLOSED_MESSAGE)
	if not ROLE_IDS.has(role_id):
		return _candidate_result(false, role_id, instance, "融合材料位置无效。")
	var base_hint := _base_candidate_hint(instance, role_id, catalog_document)
	if not bool(base_hint.get("eligible", false)):
		return base_hint
	var selections := (
		(current_selection as Dictionary).duplicate(true)
		if current_selection is Dictionary
		else {}
	)
	for raw_key in selections.keys():
		if not ROLE_IDS.has(str(raw_key)):
			return _candidate_result(false, role_id, instance, "融合材料位置无效。")
	selections.erase(role_id)
	var instance_id := _instance_id(instance)
	for raw_selected in selections.values():
		if (
			raw_selected is Dictionary
			and _instance_id(raw_selected as Dictionary) == instance_id
		):
			return _candidate_result(
				false,
				role_id,
				instance,
				"三个融合位置必须选择三只不同的宠物。"
			)
	selections[role_id] = instance
	if _matching_recipe_ids(selections, catalog_document).is_empty():
		return _candidate_result(
			false,
			role_id,
			instance,
			"%s不符合当前融合路线的血脉要求。" % role_label(role_id)
		)
	return _candidate_result(
		true,
		role_id,
		instance,
		"%s可作为本地候选，最终资格以服务器校验为准。" % role_label(role_id)
	)


static func selection_state(selected_by_role, catalog_document) -> Dictionary:
	var availability_state := availability(catalog_document)
	if not bool(availability_state.get("available", false)):
		return {
			"available": false,
			"readyForQuoteHint": false,
			"messageText": CLOSED_MESSAGE,
			"slots": _empty_slots(),
			"matchingRecipeIds": [],
			"resolvedRecipeId": "",
			"materialInstanceIds": {},
			"localHintOnly": true,
			"serverFinalAuthority": true,
		}
	if not (selected_by_role is Dictionary):
		return _invalid_selection_state("融合材料选择资料不完整。")
	var selections := selected_by_role as Dictionary
	for raw_key in selections.keys():
		if not ROLE_IDS.has(str(raw_key)):
			return _invalid_selection_state("融合材料位置无效。")

	var slots: Array[Dictionary] = []
	var unique_instance_ids := {}
	var selected_count := 0
	var first_error := ""
	for role_id in ROLE_IDS:
		if not selections.has(role_id):
			slots.append(_empty_slot(role_id))
			continue
		selected_count += 1
		var raw_instance = selections.get(role_id)
		if not (raw_instance is Dictionary):
			var invalid_slot := _empty_slot(role_id)
			invalid_slot["selected"] = true
			invalid_slot["reasonText"] = "%s资料不完整。" % role_label(role_id)
			slots.append(invalid_slot)
			if first_error == "":
				first_error = str(invalid_slot.get("reasonText", ""))
			continue
		var instance := raw_instance as Dictionary
		var hint := _base_candidate_hint(instance, role_id, catalog_document)
		var instance_id := _instance_id(instance)
		if instance_id != "" and unique_instance_ids.has(instance_id):
			hint = _candidate_result(
				false,
				role_id,
				instance,
				"三个融合位置必须选择三只不同的宠物。"
			)
		elif instance_id != "":
			unique_instance_ids[instance_id] = true
		slots.append(_slot_from_hint(hint))
		if not bool(hint.get("eligible", false)) and first_error == "":
			first_error = str(hint.get("reasonText", "融合材料不符合条件。"))

	var matching_recipe_ids := _matching_recipe_ids(selections, catalog_document)
	if first_error == "" and selected_count > 0 and matching_recipe_ids.is_empty():
		first_error = "当前三宠组合没有可用的融合路线。"
	var resolved_recipe_id := ""
	if (
		first_error == ""
		and selected_count == ROLE_IDS.size()
		and matching_recipe_ids.size() == 1
	):
		resolved_recipe_id = matching_recipe_ids[0]
	elif (
		first_error == ""
		and selected_count == ROLE_IDS.size()
		and matching_recipe_ids.size() > 1
	):
		first_error = "当前三宠组合对应多条路线，请重新选择。"

	var ready := first_error == "" and resolved_recipe_id != ""
	var message_text := first_error
	if message_text == "":
		message_text = (
			READY_MESSAGE
			if ready
			else "还需选择%d只融合材料宠。" % (ROLE_IDS.size() - selected_count)
		)
	return {
		"available": true,
		"readyForQuoteHint": ready,
		"messageText": message_text,
		"slots": slots,
		"matchingRecipeIds": matching_recipe_ids,
		"resolvedRecipeId": resolved_recipe_id,
		"materialInstanceIds": (
			_material_instance_ids(selections)
			if ready
			else {}
		),
		"localHintOnly": true,
		"serverFinalAuthority": true,
	}


static func _base_candidate_hint(
	instance: Dictionary,
	role_id: String,
	catalog_document
) -> Dictionary:
	if _instance_id(instance) == "":
		return _candidate_result(false, role_id, instance, "%s身份资料不完整。" % role_label(role_id))
	if PetRebirthMmModel.is_helper_pet(instance):
		return _candidate_result(false, role_id, instance, "转生MM不能作为融合材料。")
	if PetTerminalPathModel.is_terminal(instance):
		return _candidate_result(
			false,
			role_id,
			instance,
			"已进入2转、进化或融合终局的宠物不能作为材料。"
		)
	var form_id := _form_id(instance)
	var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
		catalog_document,
		form_id
	)
	if gene.is_empty() or str(gene.get("materialClass", "")) != "ordinary":
		return _candidate_result(
			false,
			role_id,
			instance,
			"该宠物没有获准参与融合的普通血脉资料。"
		)
	var level_value = instance.get("level", null)
	if not _integer_in_range(
		level_value,
		PetFusionRecipeCatalogModel.MINIMUM_LEVEL,
		PetFusionRecipeCatalogModel.MAXIMUM_LEVEL
	):
		return _candidate_result(
			false,
			role_id,
			instance,
			"融合材料必须达到一转 Lv%d-%d。"
				% [
					PetFusionRecipeCatalogModel.MINIMUM_LEVEL,
					PetFusionRecipeCatalogModel.MAXIMUM_LEVEL,
				]
		)
	var cultivation_value = instance.get("petCultivation", null)
	if not (cultivation_value is Dictionary):
		return _candidate_result(
			false,
			role_id,
			instance,
			"融合材料必须恰好完成一转且尚未进入终局。"
		)
	var cultivation := cultivation_value as Dictionary
	if not _integer_equals(
		cultivation.get("rebirthCount", null),
		PetFusionRecipeCatalogModel.REQUIRED_REBIRTH_COUNT
	):
		return _candidate_result(
			false,
			role_id,
			instance,
			"融合材料必须恰好完成一转且尚未进入终局。"
		)
	if not _authority_public_evidence_valid(instance, gene):
		return _candidate_result(
			false,
			role_id,
			instance,
			"成长资料尚未同步完整，请刷新后重试。"
		)
	return _candidate_result(true, role_id, instance, "本地基础条件符合。")


static func _authority_public_evidence_valid(
	instance: Dictionary,
	gene: Dictionary
) -> bool:
	var profile_id := str(gene.get("growthProfileId", "")).strip_edges()
	if (
		profile_id == ""
		or str(instance.get("growthModelVersion", ""))
			!= PetFusionRecipeCatalogModel.AUTHORITY_MODEL
		or str(instance.get("growthSpeciesProfileId", "")) != profile_id
	):
		return false
	var growth_value = instance.get("petGrowth", null)
	if not (growth_value is Dictionary):
		return false
	var growth := growth_value as Dictionary
	var public_value = growth.get("public", null)
	if not (public_value is Dictionary):
		return false
	var public_growth := public_value as Dictionary
	var level := int(instance.get("level", 0))
	return (
		str(growth.get("modelVersion", ""))
			== PetFusionRecipeCatalogModel.AUTHORITY_MODEL
		and str(growth.get("profileId", "")) == profile_id
		and _integer_equals(growth.get("settledLevel", null), level)
		and str(public_growth.get("growthModelVersion", ""))
			== PetFusionRecipeCatalogModel.AUTHORITY_MODEL
		and str(public_growth.get("growthSpeciesProfileId", "")) == profile_id
		and _integer_equals(public_growth.get("level", null), level)
	)


static func _matching_recipe_ids(
	selections: Dictionary,
	catalog_document
) -> Array[String]:
	var result: Array[String] = []
	var recipes = (
		(catalog_document as Dictionary).get("recipes", [])
		if catalog_document is Dictionary
		else []
	)
	if not (recipes is Array):
		return result
	for raw_recipe in recipes as Array:
		if not (raw_recipe is Dictionary):
			continue
		var recipe := raw_recipe as Dictionary
		var role_rules = recipe.get("roleGeneRules", null)
		if not (role_rules is Dictionary):
			continue
		var matches := true
		for role_id in ROLE_IDS:
			if not selections.has(role_id):
				continue
			var raw_instance = selections.get(role_id)
			if not (raw_instance is Dictionary):
				matches = false
				break
			var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
				catalog_document,
				_form_id(raw_instance as Dictionary)
			)
			if not _gene_allowed_for_role(
				gene,
				(role_rules as Dictionary).get(role_id, null)
			):
				matches = false
				break
		if matches:
			var recipe_id := str(recipe.get("recipeId", "")).strip_edges()
			if recipe_id != "":
				result.append(recipe_id)
	result.sort()
	return result


static func _gene_allowed_for_role(gene: Dictionary, rule_value) -> bool:
	if gene.is_empty() or not (rule_value is Dictionary):
		return false
	var rule := rule_value as Dictionary
	var allowed_lineages = rule.get("allowedLineageIds", [])
	var allowed_genes = rule.get("allowedGeneProfileIds", [])
	if not (allowed_lineages is Array) or not (allowed_genes is Array):
		return false
	return (
		(allowed_lineages as Array).has("*")
			or (allowed_lineages as Array).has(str(gene.get("lineageId", "")))
	) and (
		(allowed_genes as Array).has("*")
			or (allowed_genes as Array).has(str(gene.get("geneProfileId", "")))
	)


static func _candidate_result(
	eligible: bool,
	role_id: String,
	instance: Dictionary,
	reason_text: String
) -> Dictionary:
	return {
		"eligible": eligible,
		"roleLabel": role_label(role_id),
		"petName": str(instance.get("name", "宠物")).strip_edges(),
		"level": int(instance.get("level", 0)),
		"reasonText": reason_text,
		"localHintOnly": true,
		"serverFinalAuthority": true,
	}


static func _slot_from_hint(hint: Dictionary) -> Dictionary:
	return {
		"roleLabel": str(hint.get("roleLabel", "融合材料")),
		"selected": true,
		"petName": str(hint.get("petName", "宠物")),
		"level": int(hint.get("level", 0)),
		"valid": bool(hint.get("eligible", false)),
		"reasonText": str(hint.get("reasonText", "")),
	}


static func _empty_slots() -> Array[Dictionary]:
	var slots: Array[Dictionary] = []
	for role_id in ROLE_IDS:
		slots.append(_empty_slot(role_id))
	return slots


static func _empty_slot(role_id: String) -> Dictionary:
	return {
		"roleLabel": role_label(role_id),
		"selected": false,
		"petName": "",
		"level": 0,
		"valid": false,
		"reasonText": "尚未选择。",
	}


static func _invalid_selection_state(message_text: String) -> Dictionary:
	return {
		"available": true,
		"readyForQuoteHint": false,
		"messageText": message_text,
		"slots": _empty_slots(),
		"matchingRecipeIds": [],
		"resolvedRecipeId": "",
		"materialInstanceIds": {},
		"localHintOnly": true,
		"serverFinalAuthority": true,
	}


static func _material_instance_ids(selections: Dictionary) -> Dictionary:
	var result := {}
	for role_id in ROLE_IDS:
		var raw_instance = selections.get(role_id)
		if not (raw_instance is Dictionary):
			return {}
		var instance_id := _instance_id(raw_instance as Dictionary)
		if instance_id == "":
			return {}
		result[role_id] = instance_id
	return result


static func _instance_id(instance: Dictionary) -> String:
	var raw_value = instance.get("instanceId", null)
	if typeof(raw_value) != TYPE_STRING:
		return ""
	var raw := raw_value as String
	var normalized := raw.strip_edges()
	if (
		normalized == ""
		or normalized != raw
		or normalized.length() > REQUEST_ID_MAX_LENGTH
	):
		return ""
	return normalized


static func _form_id(instance: Dictionary) -> String:
	return str(instance.get("formId", instance.get("templateId", ""))).strip_edges()


static func _integer_in_range(value, minimum: int, maximum: int) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	var number := float(value)
	return (
		is_finite(number)
		and floorf(number) == number
		and int(number) >= minimum
		and int(number) <= maximum
	)


static func _integer_equals(value, expected: int) -> bool:
	return _integer_in_range(value, expected, expected)
