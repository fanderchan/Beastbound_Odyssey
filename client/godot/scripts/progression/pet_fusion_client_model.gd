extends RefCounted

const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)

const ROLE_IDS := PetFusionRecipeCatalogModel.ROLE_IDS
const BASE_ACTIVE_SKILL_IDS := PetFusionRecipeCatalogModel.BASE_ACTIVE_SKILL_IDS
const REQUEST_ID_MAX_LENGTH := 160
const MAX_SAFE_INTEGER := 9007199254740991
const RESULT_BINDING_BOUND := "bound"
const RESULT_BINDING_UNBOUND := "unbound"
const TRADE_ELIGIBILITY_NOT_ELIGIBLE := "not_eligible"
const UNCERTAIN_RESULT_CODES := [
	"network_failed",
	"network_retry_failed",
	"storage_commit_timeout",
	"storage_outcome_unknown",
	"storage_write_failed",
]


static func request_payload(
	recipe_id: String,
	material_instance_ids,
	catalog_document,
	expected_profile_revision: int = -1,
	expected_catalog_id: String = ""
) -> Dictionary:
	if not PetFusionRecipeCatalogModel.runtime_available(catalog_document):
		return {}
	var normalized_recipe_id := recipe_id.strip_edges()
	var recipe := PetFusionRecipeCatalogModel.recipe_by_id(
		catalog_document,
		normalized_recipe_id
	)
	if recipe.is_empty():
		return {}
	var materials := normalized_material_instance_ids(material_instance_ids)
	if materials.is_empty():
		return {}
	var payload := {
		"recipeId": normalized_recipe_id,
		"materialInstanceIds": materials,
	}
	if expected_profile_revision < 0 and expected_catalog_id.strip_edges() == "":
		return payload
	if (
		expected_profile_revision < 0
		or expected_profile_revision > MAX_SAFE_INTEGER
		or expected_catalog_id.strip_edges()
			!= str(_dict(catalog_document).get("catalogId", "")).strip_edges()
	):
		return {}
	payload["expectedProfileRevision"] = expected_profile_revision
	payload["expectedCatalogId"] = expected_catalog_id.strip_edges()
	return payload


static func normalized_material_instance_ids(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	if not _has_exact_keys(source, ROLE_IDS):
		return {}
	var result := {}
	var unique_ids := {}
	for role_id in ROLE_IDS:
		var instance_id := _request_id(source.get(role_id, null))
		if instance_id == "" or unique_ids.has(instance_id):
			return {}
		result[role_id] = instance_id
		unique_ids[instance_id] = true
	return result


static func operation_id_must_be_retained(code: String) -> bool:
	return UNCERTAIN_RESULT_CODES.has(code.strip_edges())


static func normalized_quote(value, catalog_document) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var quote := value as Dictionary
	if not _has_exact_keys(
		quote,
		[
			"schemaVersion",
			"catalogId",
			"recipeId",
			"profileRevision",
			"materials",
			"inheritance",
			"result",
		]
	):
		return {}
	if (
		not _integer_equals(quote.get("schemaVersion", null), 1)
		or str(quote.get("catalogId", "")) != PetFusionRecipeCatalogModel.CATALOG_ID
		or str(quote.get("catalogId", "")) != str(_dict(catalog_document).get("catalogId", ""))
		or not _integer_equals(
			_dict(catalog_document).get("schemaVersion", null),
			PetFusionRecipeCatalogModel.CATALOG_SCHEMA_VERSION
		)
		or not _nonnegative_integer(quote.get("profileRevision", null))
	):
		return {}
	var recipe_id := _stable_identifier(quote.get("recipeId", null))
	var recipe := PetFusionRecipeCatalogModel.recipe_by_id(catalog_document, recipe_id)
	if recipe.is_empty():
		return {}
	var materials := _normalized_quote_materials(
		quote.get("materials", null),
		recipe,
		catalog_document
	)
	if materials.is_empty():
		return {}
	var inheritance := _normalized_inheritance(quote.get("inheritance", null))
	if inheritance.is_empty():
		return {}
	var result := _normalized_quote_result(
		quote.get("result", null),
		recipe,
		catalog_document
	)
	if result.is_empty():
		return {}
	var normalized := quote.duplicate(true)
	normalized["materials"] = materials
	normalized["inheritance"] = inheritance
	normalized["result"] = result
	return normalized


static func normalized_fusion_result(value, catalog_document) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var result := value as Dictionary
	if not _has_exact_keys(
		result,
		[
			"schemaVersion",
			"catalogId",
			"recipeId",
			"resultInstanceId",
			"targetFormId",
			"targetFormName",
			"level",
			"rebirthCount",
			"terminalStage",
			"consumedMaterials",
			"baseActiveSkillIds",
			"inheritedActiveSkillIds",
			"inheritedPassiveSkillId",
			"passiveSourceRoleId",
			"numericSource",
			"materialNumericInheritance",
			"rideable",
			"additionalCostPolicy",
			"resultBinding",
			"tradeEligibility",
			"message",
		]
	):
		return {}
	if (
		not _integer_equals(result.get("schemaVersion", null), 1)
		or str(result.get("catalogId", "")) != PetFusionRecipeCatalogModel.CATALOG_ID
		or str(result.get("catalogId", "")) != str(_dict(catalog_document).get("catalogId", ""))
		or not _integer_equals(
			_dict(catalog_document).get("schemaVersion", null),
			PetFusionRecipeCatalogModel.CATALOG_SCHEMA_VERSION
		)
		or _request_id(result.get("resultInstanceId", null)) == ""
		or not _nonempty_text(result.get("targetFormName", null))
		or not _integer_equals(result.get("level", null), 1)
		or not _integer_equals(result.get("rebirthCount", null), 1)
		or not _integer_equals(result.get("terminalStage", null), 2)
		or not _same_string_array(result.get("baseActiveSkillIds", null), BASE_ACTIVE_SKILL_IDS)
		or result.get("materialNumericInheritance", null) != false
		or result.get("rideable", null) != false
		or not _result_policy_contract_valid(result, catalog_document)
		or not _nonempty_text(result.get("message", null))
	):
		return {}
	var recipe_id := _stable_identifier(result.get("recipeId", null))
	var recipe := PetFusionRecipeCatalogModel.recipe_by_id(catalog_document, recipe_id)
	var recipe_result := _dict(recipe.get("result", {}))
	if (
		recipe.is_empty()
		or str(result.get("targetFormId", "")) != str(recipe.get("targetFormId", ""))
		or str(result.get("numericSource", "")) != str(recipe_result.get("numericSource", ""))
		or str(recipe_result.get("bindingPolicy", ""))
			!= PetFusionRecipeCatalogModel.RESULT_BINDING_POLICY
	):
		return {}
	var consumed := _normalized_consumed_materials(
		result.get("consumedMaterials", null),
		recipe,
		catalog_document
	)
	if consumed.is_empty():
		return {}
	var candidate_active_ids: Array[String] = []
	var passive_candidates := {}
	for material in consumed:
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			catalog_document,
			str(material.get("formId", ""))
		)
		var active_id := str(gene.get("specialActiveSkillId", ""))
		if active_id != "" and not candidate_active_ids.has(active_id):
			candidate_active_ids.append(active_id)
		passive_candidates[str(material.get("roleId", ""))] = str(
			gene.get("passiveSkillId", "")
		)
	var inherited_active_value = result.get("inheritedActiveSkillIds", null)
	if not (inherited_active_value is Array):
		return {}
	var inherited_active_ids := _stable_identifier_array(
		inherited_active_value,
		true
	)
	if inherited_active_ids.size() != (inherited_active_value as Array).size():
		return {}
	if inherited_active_ids.size() > candidate_active_ids.size():
		return {}
	var previous_candidate_index := -1
	for active_id in inherited_active_ids:
		var candidate_index := candidate_active_ids.find(active_id)
		if (
			BASE_ACTIVE_SKILL_IDS.has(active_id)
			or candidate_index < 0
			or candidate_index <= previous_candidate_index
		):
			return {}
		previous_candidate_index = candidate_index
	var passive_source_role_id := str(result.get("passiveSourceRoleId", ""))
	var inherited_passive_id := _stable_identifier(
		result.get("inheritedPassiveSkillId", null)
	)
	if (
		not ROLE_IDS.has(passive_source_role_id)
		or inherited_passive_id == ""
		or inherited_passive_id
			!= str(passive_candidates.get(passive_source_role_id, ""))
	):
		return {}
	var normalized := result.duplicate(true)
	normalized["consumedMaterials"] = consumed
	normalized["inheritedActiveSkillIds"] = inherited_active_ids
	return normalized


static func quote_matches_material_selection(
	quote_value,
	recipe_id: String,
	material_instance_ids,
	catalog_document
) -> bool:
	var quote := normalized_quote(quote_value, catalog_document)
	var selected := normalized_material_instance_ids(material_instance_ids)
	if quote.is_empty() or selected.is_empty():
		return false
	if str(quote.get("recipeId", "")) != recipe_id.strip_edges():
		return false
	for raw_material in quote.get("materials", []) as Array:
		var material := _dict(raw_material)
		var role_id := str(material.get("roleId", ""))
		if str(material.get("instanceId", "")) != str(selected.get(role_id, "")):
			return false
	return true


static func _normalized_quote_materials(
	value,
	recipe: Dictionary,
	catalog_document
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array) or (value as Array).size() != ROLE_IDS.size():
		return result
	var unique_instance_ids := {}
	for index in range(ROLE_IDS.size()):
		var raw_material = (value as Array)[index]
		if not (raw_material is Dictionary):
			return []
		var material := raw_material as Dictionary
		if not _has_exact_keys(
			material,
			[
				"roleId",
				"instanceId",
				"formId",
				"formName",
				"level",
				"rebirthCount",
				"specialActiveSkillId",
				"passiveSkillId",
			]
		):
			return []
		var role_id := str(material.get("roleId", ""))
		var instance_id := _request_id(material.get("instanceId", null))
		var form_id := _stable_identifier(material.get("formId", null))
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			catalog_document,
			form_id
		)
		if (
			role_id != ROLE_IDS[index]
			or instance_id == ""
			or unique_instance_ids.has(instance_id)
			or gene.is_empty()
			or not _gene_allowed_for_role(gene, _dict(recipe.get("roleGeneRules", {})).get(role_id, null))
			or not _nonempty_text(material.get("formName", null))
			or not _integer_in_range(
				material.get("level", null),
				PetFusionRecipeCatalogModel.MINIMUM_LEVEL,
				PetFusionRecipeCatalogModel.MAXIMUM_LEVEL
			)
			or not _integer_equals(
				material.get("rebirthCount", null),
				PetFusionRecipeCatalogModel.REQUIRED_REBIRTH_COUNT
			)
			or str(material.get("specialActiveSkillId", ""))
				!= str(gene.get("specialActiveSkillId", ""))
			or str(material.get("passiveSkillId", ""))
				!= str(gene.get("passiveSkillId", ""))
		):
			return []
		unique_instance_ids[instance_id] = true
		result.append(material.duplicate(true))
	return result


static func _normalized_inheritance(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var inheritance := value as Dictionary
	if not _has_exact_keys(
		inheritance,
		[
			"baseActiveSkillIds",
			"specialActiveInheritanceChance",
			"activeRollsIndependent",
			"ordinaryOrTrainingActiveInheritance",
			"duplicateActiveSkillPolicy",
			"passiveSourceWeights",
			"resultPassiveSkillCount",
		]
	):
		return {}
	if (
		not _same_string_array(
			inheritance.get("baseActiveSkillIds", null),
			BASE_ACTIVE_SKILL_IDS
		)
		or not _number_equals(
			inheritance.get("specialActiveInheritanceChance", null),
			PetFusionRecipeCatalogModel.SPECIAL_ACTIVE_INHERITANCE_CHANCE
		)
		or inheritance.get("activeRollsIndependent", null) != true
		or inheritance.get("ordinaryOrTrainingActiveInheritance", null) != false
		or str(inheritance.get("duplicateActiveSkillPolicy", ""))
			!= "deduplicate_after_roll_no_reroll"
		or not _integer_equals(
			inheritance.get("resultPassiveSkillCount", null),
			PetFusionRecipeCatalogModel.RESULT_PASSIVE_SKILL_COUNT
		)
	):
		return {}
	var weights_value = inheritance.get("passiveSourceWeights", null)
	if not (weights_value is Dictionary):
		return {}
	var weights := weights_value as Dictionary
	if not _has_exact_keys(weights, ROLE_IDS):
		return {}
	for role_id in ROLE_IDS:
		if not _number_equals(
			weights.get(role_id, null),
			float(PetFusionRecipeCatalogModel.PASSIVE_SOURCE_WEIGHTS.get(role_id, -1.0))
		):
			return {}
	return inheritance.duplicate(true)


static func _normalized_quote_result(
	value,
	recipe: Dictionary,
	catalog_document
) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var result := value as Dictionary
	if not _has_exact_keys(
		result,
		[
			"targetFormId",
			"targetFormName",
			"level",
			"rebirthCount",
			"terminalStage",
			"terminalStageLabel",
			"numericSource",
			"materialNumericInheritance",
			"rideable",
			"additionalCostPolicy",
			"resultBinding",
			"tradeEligibility",
		]
	):
		return {}
	var recipe_result := _dict(recipe.get("result", {}))
	if (
		str(result.get("targetFormId", "")) != str(recipe.get("targetFormId", ""))
		or not _nonempty_text(result.get("targetFormName", null))
		or not _integer_equals(result.get("level", null), 1)
		or not _integer_equals(result.get("rebirthCount", null), 1)
		or not _integer_equals(result.get("terminalStage", null), 2)
		or str(result.get("terminalStageLabel", "")) != "2转/进化/融合"
		or str(result.get("numericSource", ""))
			!= str(recipe_result.get("numericSource", ""))
		or result.get("materialNumericInheritance", null) != false
		or result.get("rideable", null) != false
		or str(recipe_result.get("bindingPolicy", ""))
			!= PetFusionRecipeCatalogModel.RESULT_BINDING_POLICY
		or not _result_policy_contract_valid(result, catalog_document)
	):
		return {}
	return result.duplicate(true)


static func _result_policy_contract_valid(
	value: Dictionary,
	catalog_document
) -> bool:
	var rules := _dict(_dict(catalog_document).get("rules", {}))
	if (
		str(rules.get("additionalCostPolicy", ""))
			!= PetFusionRecipeCatalogModel.ADDITIONAL_COST_POLICY
		or str(rules.get("resultBindingPolicy", ""))
			!= PetFusionRecipeCatalogModel.RESULT_BINDING_POLICY
		or str(rules.get("unboundResultTradePolicy", ""))
			!= PetFusionRecipeCatalogModel.UNBOUND_RESULT_TRADE_POLICY
		or str(value.get("additionalCostPolicy", ""))
			!= PetFusionRecipeCatalogModel.ADDITIONAL_COST_POLICY
	):
		return false
	var result_binding := str(value.get("resultBinding", ""))
	var expected_trade_eligibility := ""
	if result_binding == RESULT_BINDING_BOUND:
		expected_trade_eligibility = TRADE_ELIGIBILITY_NOT_ELIGIBLE
	elif result_binding == RESULT_BINDING_UNBOUND:
		expected_trade_eligibility = (
			PetFusionRecipeCatalogModel.UNBOUND_RESULT_TRADE_POLICY
		)
	else:
		return false
	return str(value.get("tradeEligibility", "")) == expected_trade_eligibility


static func _normalized_consumed_materials(
	value,
	recipe: Dictionary,
	catalog_document
) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array) or (value as Array).size() != ROLE_IDS.size():
		return result
	var unique_ids := {}
	for index in range(ROLE_IDS.size()):
		var raw_material = (value as Array)[index]
		if not (raw_material is Dictionary):
			return []
		var material := raw_material as Dictionary
		if not _has_exact_keys(
			material,
			["roleId", "instanceId", "formId", "formName"]
		):
			return []
		var role_id := str(material.get("roleId", ""))
		var instance_id := _request_id(material.get("instanceId", null))
		var form_id := _stable_identifier(material.get("formId", null))
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			catalog_document,
			form_id
		)
		if (
			role_id != ROLE_IDS[index]
			or instance_id == ""
			or unique_ids.has(instance_id)
			or gene.is_empty()
			or not _gene_allowed_for_role(
				gene,
				_dict(recipe.get("roleGeneRules", {})).get(role_id, null)
			)
			or not _nonempty_text(material.get("formName", null))
		):
			return []
		unique_ids[instance_id] = true
		result.append(material.duplicate(true))
	return result


static func _gene_allowed_for_role(gene: Dictionary, rule_value) -> bool:
	if not (rule_value is Dictionary):
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


static func _stable_identifier_array(value, unique_required: bool) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for raw_value in value as Array:
		var identifier := _stable_identifier(raw_value)
		if identifier == "" or (unique_required and result.has(identifier)):
			return []
		result.append(identifier)
	return result


static func _request_id(value) -> String:
	if typeof(value) != TYPE_STRING:
		return ""
	var raw := value as String
	var normalized := raw.strip_edges()
	if (
		normalized == ""
		or normalized != raw
		or normalized.length() > REQUEST_ID_MAX_LENGTH
	):
		return ""
	return normalized


static func _stable_identifier(value) -> String:
	if typeof(value) != TYPE_STRING:
		return ""
	var identifier := value as String
	if identifier != identifier.strip_edges():
		return ""
	if identifier.length() < 2 or identifier.length() > 96:
		return ""
	var first := identifier.unicode_at(0)
	if first < 0x61 or first > 0x7a:
		return ""
	for index in range(1, identifier.length()):
		var codepoint := identifier.unicode_at(index)
		var is_lower := codepoint >= 0x61 and codepoint <= 0x7a
		var is_digit := codepoint >= 0x30 and codepoint <= 0x39
		if not is_lower and not is_digit and codepoint != 0x5f:
			return ""
	return identifier


static func _has_exact_keys(value: Dictionary, expected_keys: Array) -> bool:
	var actual: Array[String] = []
	for raw_key in value.keys():
		actual.append(str(raw_key))
	actual.sort()
	var expected: Array[String] = []
	for raw_key in expected_keys:
		expected.append(str(raw_key))
	expected.sort()
	return actual == expected


static func _same_string_array(value, expected: Array[String]) -> bool:
	if not (value is Array) or (value as Array).size() != expected.size():
		return false
	for index in range(expected.size()):
		if typeof((value as Array)[index]) != TYPE_STRING:
			return false
		if str((value as Array)[index]) != expected[index]:
			return false
	return true


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


static func _nonnegative_integer(value) -> bool:
	return _integer_in_range(value, 0, MAX_SAFE_INTEGER)


static func _number_equals(value, expected: float) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	var number := float(value)
	return is_finite(number) and number == expected


static func _nonempty_text(value) -> bool:
	return (
		typeof(value) == TYPE_STRING
		and value == (value as String).strip_edges()
		and not (value as String).is_empty()
	)


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
