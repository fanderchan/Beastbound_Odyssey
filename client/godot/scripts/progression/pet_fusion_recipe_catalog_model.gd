extends RefCounted

const PetFusionReleaseAttestationModel := preload(
	"res://scripts/progression/pet_fusion_release_attestation_model.gd"
)

const CATALOG_SCHEMA_VERSION := 2
const CATALOG_ID := "pet_fusion_recipes_v2"
const AUTHORITY_MODEL := "pet_growth_authority_v1"
const ROLE_IDS: Array[String] = ["core", "resonance_one", "resonance_two"]
const BASE_ACTIVE_SKILL_IDS: Array[String] = ["pet_attack", "pet_defend"]
const ADDITIONAL_COST_POLICY := "materials_only"
const RESULT_BINDING_POLICY := "bound_if_any_material_bound"
const UNBOUND_RESULT_TRADE_POLICY := "eligible_when_pet_trading_available"
const BASE_ACTIVE_SKILL_FORGET_POLICY := "forbidden"
const INHERITED_SPECIAL_ACTIVE_FORGET_POLICY := "double_confirm_irreversible"
const POST_FUSION_TRAINING_POLICY := "empty_slots_only"
const BINDING_POLICIES: Array[String] = [
	RESULT_BINDING_POLICY,
]
const RESULT_STATE_POLICIES: Array[String] = [
	"replace_active_else_core_state",
]
const REQUIRED_REBIRTH_COUNT := 1
const MINIMUM_LEVEL := 131
const MAXIMUM_LEVEL := 140
const SPECIAL_ACTIVE_INHERITANCE_CHANCE := 0.5
const RESULT_PASSIVE_SKILL_COUNT := 1
const RELEASE_GATE_CLOSED_MESSAGE := "宠物融合尚未开放；当前不会消耗任何宠物。"
const PASSIVE_SOURCE_WEIGHTS := {
	"core": 0.4,
	"resonance_one": 0.3,
	"resonance_two": 0.3,
}


static func validation_errors(
	document,
	pet_templates,
	growth_profiles,
	paid_reset_policy,
	battle_actions,
	battle_passives,
	skill_training
) -> Array[String]:
	return _validation_errors(
		document,
		pet_templates,
		growth_profiles,
		paid_reset_policy,
		battle_actions,
		battle_passives,
		skill_training,
		true
	)


static func fixture_validation_errors(
	document,
	pet_templates,
	growth_profiles,
	paid_reset_policy,
	battle_actions,
	battle_passives,
	skill_training
) -> Array[String]:
	return _validation_errors(
		document,
		pet_templates,
		growth_profiles,
		paid_reset_policy,
		battle_actions,
		battle_passives,
		skill_training,
		false
	)


static func _validation_errors(
	document,
	pet_templates,
	growth_profiles,
	paid_reset_policy,
	battle_actions,
	battle_passives,
	skill_training,
	require_release_attestation: bool
) -> Array[String]:
	var errors: Array[String] = []
	if not (document is Dictionary):
		return ["pet_fusion_recipes.json 缺失或不是 JSON 对象"]
	var data := document as Dictionary
	_validate_exact_keys(
		data,
		[
			"schemaVersion",
			"catalogId",
			"runtimeEnabled",
			"disabledMessage",
			"rules",
			"geneProfiles",
			"recipes",
		],
		"pet_fusion_recipes",
		errors
	)
	if not _integer_equals(data.get("schemaVersion", null), CATALOG_SCHEMA_VERSION):
		errors.append(
			"pet_fusion_recipes.schemaVersion 当前必须为%d"
			% CATALOG_SCHEMA_VERSION
		)
	if str(data.get("catalogId", "")) != CATALOG_ID:
		errors.append("pet_fusion_recipes.catalogId 当前必须为%s" % CATALOG_ID)
	if typeof(data.get("runtimeEnabled", null)) != TYPE_BOOL:
		errors.append("pet_fusion_recipes.runtimeEnabled 必须是布尔值")
	if not _nonempty_text(data.get("disabledMessage", null)):
		errors.append("pet_fusion_recipes.disabledMessage 必须是非空文本")
	_validate_rules(data.get("rules", null), errors)

	var forms := _index_by(
		_dict(pet_templates).get("forms", []),
		"formId",
		"宠物形态",
		errors
	)
	var profiles := _index_by(
		_dict(growth_profiles).get("profiles", []),
		"profileId",
		"宠物成长档",
		errors
	)
	var actions := _index_by(
		_dict(battle_actions).get("actions", []),
		"id",
		"战斗主动技能",
		errors
	)
	var passives := _index_by(
		_dict(battle_passives).get("passives", []),
		"id",
		"战斗被动技能",
		errors
	)
	var reset_policies := _index_by(
		_dict(paid_reset_policy).get("formPolicies", []),
		"formId",
		"宠物付费重置策略",
		errors
	)
	var trainable_skill_ids := _trainable_skill_ids(skill_training)

	var raw_genes = data.get("geneProfiles", null)
	if not (raw_genes is Array):
		errors.append("pet_fusion_recipes.geneProfiles 必须是数组")
		raw_genes = []
	var genes_by_id := {}
	var genes_by_form_id := {}
	for index in range((raw_genes as Array).size()):
		var gene := _validate_gene_profile(
			(raw_genes as Array)[index],
			index,
			forms,
			profiles,
			actions,
			passives,
			trainable_skill_ids,
			errors
		)
		if gene.is_empty():
			continue
		var gene_id := str(gene.get("geneProfileId", ""))
		var form_id := str(gene.get("formId", ""))
		if genes_by_id.has(gene_id):
			errors.append("融合基因档ID重复：%s" % gene_id)
		else:
			genes_by_id[gene_id] = gene
		if genes_by_form_id.has(form_id):
			errors.append("同一材料形态重复登记融合基因档：%s" % form_id)
		else:
			genes_by_form_id[form_id] = gene

	var raw_recipes = data.get("recipes", null)
	if not (raw_recipes is Array):
		errors.append("pet_fusion_recipes.recipes 必须是数组")
		raw_recipes = []
	var recipe_ids := {}
	var target_form_ids := {}
	var appearance_pair_owners := {}
	var formal_recipe_count := 0
	for index in range((raw_recipes as Array).size()):
		var recipe := _validate_recipe(
			(raw_recipes as Array)[index],
			index,
			forms,
			profiles,
			reset_policies,
			genes_by_id,
			errors
		)
		if recipe.is_empty():
			continue
		var recipe_id := str(recipe.get("recipeId", ""))
		var target_form_id := str(recipe.get("targetFormId", ""))
		if genes_by_form_id.has(target_form_id):
			errors.append("融合目标不能同时登记为普通材料基因档：%s" % target_form_id)
		if recipe_ids.has(recipe_id):
			errors.append("融合配方ID重复：%s" % recipe_id)
		else:
			recipe_ids[recipe_id] = true
		if target_form_ids.has(target_form_id):
			errors.append("融合目标形态重复：%s" % target_form_id)
		else:
			target_form_ids[target_form_id] = true
		if str(_dict(recipe.get("assetGate", {})).get("status", "")) == "formal":
			formal_recipe_count += 1
		for raw_pair in recipe.get("appearanceLineagePairs", []) as Array:
			var pair := _dict(raw_pair)
			var pair_key := "%s|%s" % [
				str(pair.get("coreLineageId", "")),
				str(pair.get("resonanceOneLineageId", "")),
			]
			if appearance_pair_owners.has(pair_key):
				errors.append(
					"核心族与共鸣一族外观组合重复：%s/%s 已属于配方%s"
					% [
						str(pair.get("coreLineageId", "")),
						str(pair.get("resonanceOneLineageId", "")),
						str(appearance_pair_owners.get(pair_key, "")),
					]
				)
			else:
				appearance_pair_owners[pair_key] = recipe_id

	if data.get("runtimeEnabled", null) == true:
		if (raw_recipes as Array).is_empty():
			errors.append("融合目录开启时必须至少有一条正式配方")
		if formal_recipe_count != (raw_recipes as Array).size():
			errors.append("融合目录开启时每条配方都必须通过正式资源门禁")
		if require_release_attestation:
			errors.append_array(
				PetFusionReleaseAttestationModel.validation_errors(data)
			)
	return errors


static func runtime_available(document) -> bool:
	if not (document is Dictionary):
		return false
	var data := document as Dictionary
	var recipes = data.get("recipes", [])
	var rule_errors: Array[String] = []
	_validate_rules(data.get("rules", null), rule_errors)
	return (
		_integer_equals(
			data.get("schemaVersion", null),
			CATALOG_SCHEMA_VERSION
		)
		and str(data.get("catalogId", "")) == CATALOG_ID
		and rule_errors.is_empty()
		and data.get("runtimeEnabled", null) == true
		and recipes is Array
		and not (recipes as Array).is_empty()
	)


static func production_document(
	document,
	contract_errors: Array[String]
) -> Dictionary:
	if not (document is Dictionary):
		return {}
	var projected := (document as Dictionary).duplicate(true)
	if projected.get("runtimeEnabled", null) != true:
		return projected
	if not runtime_available(projected) or not contract_errors.is_empty():
		projected["runtimeEnabled"] = false
		projected["disabledMessage"] = RELEASE_GATE_CLOSED_MESSAGE
	return projected


static func recipe_by_id(document, recipe_id: String) -> Dictionary:
	var normalized_id := recipe_id.strip_edges()
	if normalized_id == "":
		return {}
	var recipes = _dict(document).get("recipes", [])
	if recipes is Array:
		for raw_recipe in recipes as Array:
			if raw_recipe is Dictionary and str((raw_recipe as Dictionary).get("recipeId", "")) == normalized_id:
				return (raw_recipe as Dictionary).duplicate(true)
	return {}


static func gene_profile_by_form_id(document, form_id: String) -> Dictionary:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "":
		return {}
	var profiles = _dict(document).get("geneProfiles", [])
	if profiles is Array:
		for raw_profile in profiles as Array:
			if raw_profile is Dictionary and str((raw_profile as Dictionary).get("formId", "")) == normalized_id:
				return (raw_profile as Dictionary).duplicate(true)
	return {}


static func contract_check(
	document,
	pet_templates,
	growth_profiles,
	paid_reset_policy,
	battle_actions,
	battle_passives,
	skill_training
) -> Dictionary:
	var errors := validation_errors(
		document,
		pet_templates,
		growth_profiles,
		paid_reset_policy,
		battle_actions,
		battle_passives,
		skill_training
	)
	var data := _dict(document)
	var genes = data.get("geneProfiles", [])
	var recipes = data.get("recipes", [])
	var target_form_ids: Array[String] = []
	if recipes is Array:
		for raw_recipe in recipes as Array:
			if not (raw_recipe is Dictionary):
				continue
			var target_form_id := str(
				(raw_recipe as Dictionary).get("targetFormId", "")
			).strip_edges()
			if target_form_id != "" and not target_form_ids.has(target_form_id):
				target_form_ids.append(target_form_id)
	target_form_ids.sort()
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"catalogId": str(data.get("catalogId", "")),
		"runtimeEnabled": data.get("runtimeEnabled", null) == true,
		"available": errors.is_empty() and runtime_available(data),
		"geneProfileCount": (genes as Array).size() if genes is Array else 0,
		"recipeCount": (recipes as Array).size() if recipes is Array else 0,
		"targetFormIds": target_form_ids,
	}


static func _validate_rules(value, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("pet_fusion_recipes.rules 必须是对象")
		return
	var rules := value as Dictionary
	_validate_exact_keys(
		rules,
		[
			"roleIds",
			"requiredGrowthModelVersion",
			"requiredRebirthCount",
			"minimumLevel",
			"maximumLevel",
			"baseActiveSkillIds",
			"specialActiveInheritanceChance",
			"passiveSourceWeights",
			"resultPassiveSkillCount",
			"materialNumericInheritance",
			"resultRideable",
			"additionalCostPolicy",
			"resultBindingPolicy",
			"unboundResultTradePolicy",
			"baseActiveSkillForgetPolicy",
			"inheritedSpecialActiveForgetPolicy",
			"postFusionTrainingPolicy",
		],
		"pet_fusion_recipes.rules",
		errors
	)
	if not _same_string_array(rules.get("roleIds", null), ROLE_IDS):
		errors.append("融合材料位置必须依次为核心、共鸣一、共鸣二")
	if str(rules.get("requiredGrowthModelVersion", "")) != AUTHORITY_MODEL:
		errors.append("融合材料必须使用 authority-v1 成长资料")
	if not _integer_equals(rules.get("requiredRebirthCount", null), REQUIRED_REBIRTH_COUNT):
		errors.append("融合材料必须恰好完成一转")
	if (
		not _integer_equals(rules.get("minimumLevel", null), MINIMUM_LEVEL)
		or not _integer_equals(rules.get("maximumLevel", null), MAXIMUM_LEVEL)
	):
		errors.append("融合材料等级范围必须为 Lv131-140")
	if not _same_string_array(rules.get("baseActiveSkillIds", null), BASE_ACTIVE_SKILL_IDS):
		errors.append("融合成品基础主动技能必须只有攻击和防御")
	if not _number_equals(
		rules.get("specialActiveInheritanceChance", null),
		SPECIAL_ACTIVE_INHERITANCE_CHANCE
	):
		errors.append("三只材料的特殊主动技能必须各自独立50%遗传")
	if not _integer_equals(
		rules.get("resultPassiveSkillCount", null),
		RESULT_PASSIVE_SKILL_COUNT
	):
		errors.append("融合成品必须恰好遗传一个被动技能")
	if rules.get("materialNumericInheritance", null) != false:
		errors.append("融合成品数值不得继承材料宠品质")
	if rules.get("resultRideable", null) != false:
		errors.append("第一版融合宠必须显式不可骑乘")
	if str(rules.get("additionalCostPolicy", "")) != ADDITIONAL_COST_POLICY:
		errors.append("融合额外成本策略必须为 materials_only")
	if str(rules.get("resultBindingPolicy", "")) != RESULT_BINDING_POLICY:
		errors.append("融合成品绑定策略必须为 bound_if_any_material_bound")
	if (
		str(rules.get("unboundResultTradePolicy", ""))
		!= UNBOUND_RESULT_TRADE_POLICY
	):
		errors.append(
			"未绑定融合成品交易策略必须为 eligible_when_pet_trading_available"
		)
	if (
		str(rules.get("baseActiveSkillForgetPolicy", ""))
		!= BASE_ACTIVE_SKILL_FORGET_POLICY
	):
		errors.append("融合宠攻击和防御必须永久禁止遗忘")
	if (
		str(rules.get("inheritedSpecialActiveForgetPolicy", ""))
		!= INHERITED_SPECIAL_ACTIVE_FORGET_POLICY
	):
		errors.append("遗传特殊主动必须二次确认后不可逆遗忘")
	if (
		str(rules.get("postFusionTrainingPolicy", ""))
		!= POST_FUSION_TRAINING_POLICY
	):
		errors.append("融合宠后续训练只能写入空技能格")
	var weights_value = rules.get("passiveSourceWeights", null)
	if not (weights_value is Dictionary):
		errors.append("融合被动来源权重必须是对象")
		return
	var weights := weights_value as Dictionary
	_validate_exact_keys(
		weights,
		ROLE_IDS,
		"pet_fusion_recipes.rules.passiveSourceWeights",
		errors
	)
	for role_id in ROLE_IDS:
		if not _number_equals(
			weights.get(role_id, null),
			float(PASSIVE_SOURCE_WEIGHTS.get(role_id, -1.0))
		):
			errors.append("融合被动来源权重错误：%s" % role_id)


static func _validate_gene_profile(
	value,
	index: int,
	forms: Dictionary,
	profiles: Dictionary,
	actions: Dictionary,
	passives: Dictionary,
	trainable_skill_ids: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var label := "pet_fusion_recipes.geneProfiles[%d]" % index
	if not (value is Dictionary):
		errors.append("%s 必须是对象" % label)
		return {}
	var gene := value as Dictionary
	_validate_exact_keys(
		gene,
		[
			"geneProfileId",
			"lineageId",
			"formId",
			"growthProfileId",
			"materialClass",
			"specialActiveSkillId",
			"passiveSkillId",
		],
		label,
		errors
	)
	var gene_id := _validated_identifier(gene.get("geneProfileId", null), "%s.geneProfileId" % label, errors)
	var lineage_id := _validated_identifier(gene.get("lineageId", null), "%s.lineageId" % label, errors)
	var form_id := _validated_identifier(gene.get("formId", null), "%s.formId" % label, errors)
	var growth_profile_id := _validated_identifier(
		gene.get("growthProfileId", null),
		"%s.growthProfileId" % label,
		errors
	)
	var special_active_skill_id := _validated_identifier(
		gene.get("specialActiveSkillId", null),
		"%s.specialActiveSkillId" % label,
		errors
	)
	var passive_skill_id := _validated_identifier(
		gene.get("passiveSkillId", null),
		"%s.passiveSkillId" % label,
		errors
	)
	if str(gene.get("materialClass", "")) != "ordinary":
		errors.append("%s.materialClass 当前必须为 ordinary" % label)
	var form := _dict(forms.get(form_id, {}))
	var growth_profile := _dict(profiles.get(growth_profile_id, {}))
	var action := _dict(actions.get(special_active_skill_id, {}))
	if form.is_empty():
		errors.append("%s 引用了未知材料形态%s" % [label, form_id])
	else:
		if str(form.get("lineId", "")) != lineage_id:
			errors.append("%s 的族系与材料形态不一致" % label)
		if str(form.get("growthSpeciesProfileId", "")) != growth_profile_id:
			errors.append("%s 的成长档与材料形态不一致" % label)
	if growth_profile.is_empty():
		errors.append("%s 引用了未知成长档%s" % [label, growth_profile_id])
	elif str(growth_profile.get("formId", "")) != form_id:
		errors.append("%s 的成长档没有反向指向材料形态" % label)
	if (
		action.is_empty()
		or str(action.get("owner", "")) != "pet_skill"
		or BASE_ACTIVE_SKILL_IDS.has(special_active_skill_id)
	):
		errors.append("%s 的特殊主动必须是非基础宠物技能" % label)
	if trainable_skill_ids.has(special_active_skill_id):
		errors.append("%s 的特殊主动不能是普通或训练类技能" % label)
	if not passives.has(passive_skill_id):
		errors.append("%s 引用了未知被动技能%s" % [label, passive_skill_id])
	if (
		gene_id == ""
		or lineage_id == ""
		or form_id == ""
		or growth_profile_id == ""
		or special_active_skill_id == ""
		or passive_skill_id == ""
	):
		return {}
	return {
		"geneProfileId": gene_id,
		"lineageId": lineage_id,
		"formId": form_id,
		"growthProfileId": growth_profile_id,
		"specialActiveSkillId": special_active_skill_id,
		"passiveSkillId": passive_skill_id,
	}


static func _validate_recipe(
	value,
	index: int,
	forms: Dictionary,
	profiles: Dictionary,
	reset_policies: Dictionary,
	genes_by_id: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var label := "pet_fusion_recipes.recipes[%d]" % index
	if not (value is Dictionary):
		errors.append("%s 必须是对象" % label)
		return {}
	var recipe := value as Dictionary
	_validate_exact_keys(
		recipe,
		[
			"recipeId",
			"targetFormId",
			"targetGrowthProfileId",
			"roleGeneRules",
			"result",
			"assetGate",
		],
		label,
		errors
	)
	var recipe_id := _validated_identifier(recipe.get("recipeId", null), "%s.recipeId" % label, errors)
	var target_form_id := _validated_identifier(
		recipe.get("targetFormId", null),
		"%s.targetFormId" % label,
		errors
	)
	var target_growth_profile_id := _validated_identifier(
		recipe.get("targetGrowthProfileId", null),
		"%s.targetGrowthProfileId" % label,
		errors
	)
	var role_rules_value = recipe.get("roleGeneRules", null)
	if not (role_rules_value is Dictionary):
		errors.append("%s.roleGeneRules 必须是对象" % label)
		role_rules_value = {}
	var role_rules := role_rules_value as Dictionary
	_validate_exact_keys(role_rules, ROLE_IDS, "%s.roleGeneRules" % label, errors)
	var normalized_role_rules := {}
	for role_id in ROLE_IDS:
		normalized_role_rules[role_id] = _validate_role_gene_rule(
			role_rules.get(role_id, null),
			"%s.roleGeneRules.%s" % [label, role_id],
			role_id,
			genes_by_id,
			errors
		)

	var target_form := _dict(forms.get(target_form_id, {}))
	var target_profile := _dict(profiles.get(target_growth_profile_id, {}))
	if target_form.is_empty():
		errors.append("%s 引用了未知融合目标形态%s" % [label, target_form_id])
	else:
		if str(target_form.get("growthSpeciesProfileId", "")) != target_growth_profile_id:
			errors.append("%s 的目标成长档与目标形态不一致" % label)
		if _dict(target_form.get("riding", {})).get("rideable", null) == true:
			errors.append("%s 的第一版融合目标不得支持骑乘" % label)
	if target_profile.is_empty():
		errors.append("%s 引用了未知融合目标成长档%s" % [label, target_growth_profile_id])
	elif str(target_profile.get("formId", "")) != target_form_id:
		errors.append("%s 的目标成长档没有反向指向目标形态" % label)
	var reset_policy := _dict(reset_policies.get(target_form_id, {}))
	if (
		reset_policy.is_empty()
		or reset_policy.get("resetAllowed", null) != false
		or str(reset_policy.get("ineligibleReason", "")) != "terminal_fusion"
	):
		errors.append("%s 的目标形态必须声明 terminal_fusion 且禁止付费重置" % label)

	for role_id in ROLE_IDS:
		var role_rule := _dict(normalized_role_rules.get(role_id, {}))
		for raw_gene_id in role_rule.get("allowedGeneProfileIds", []) as Array:
			var gene_id := str(raw_gene_id)
			if gene_id == "*":
				continue
			var gene := _dict(genes_by_id.get(gene_id, {}))
			if str(gene.get("formId", "")) == target_form_id:
				errors.append("%s 的融合目标不能同时作为材料形态" % label)

	var result := _validate_recipe_result(recipe.get("result", null), label, errors)
	var asset_gate := _validate_asset_gate(recipe.get("assetGate", null), label, errors)
	var appearance_pairs: Array[Dictionary] = []
	var core_rule := _dict(normalized_role_rules.get("core", {}))
	var resonance_one_rule := _dict(normalized_role_rules.get("resonance_one", {}))
	for raw_core_lineage in core_rule.get("allowedLineageIds", []) as Array:
		for raw_resonance_lineage in resonance_one_rule.get("allowedLineageIds", []) as Array:
			if str(raw_core_lineage) != "*" and str(raw_resonance_lineage) != "*":
				appearance_pairs.append({
					"coreLineageId": str(raw_core_lineage),
					"resonanceOneLineageId": str(raw_resonance_lineage),
				})
	if recipe_id == "" or target_form_id == "" or target_growth_profile_id == "":
		return {}
	return {
		"recipeId": recipe_id,
		"targetFormId": target_form_id,
		"targetGrowthProfileId": target_growth_profile_id,
		"roleGeneRules": normalized_role_rules,
		"result": result,
		"assetGate": asset_gate,
		"appearanceLineagePairs": appearance_pairs,
	}


static func _validate_role_gene_rule(
	value,
	label: String,
	role_id: String,
	genes_by_id: Dictionary,
	errors: Array[String]
) -> Dictionary:
	if not (value is Dictionary):
		errors.append("%s 必须是对象" % label)
		return {"allowedLineageIds": [], "allowedGeneProfileIds": []}
	var rule := value as Dictionary
	_validate_exact_keys(
		rule,
		["allowedLineageIds", "allowedGeneProfileIds"],
		label,
		errors
	)
	var allowed_lineages := _validated_identifier_set(
		rule.get("allowedLineageIds", null),
		"%s.allowedLineageIds" % label,
		errors
	)
	var allowed_gene_ids := _validated_identifier_set(
		rule.get("allowedGeneProfileIds", null),
		"%s.allowedGeneProfileIds" % label,
		errors
	)
	var lineage_wildcard := allowed_lineages.has("*")
	var gene_wildcard := allowed_gene_ids.has("*")
	if (lineage_wildcard or gene_wildcard) and role_id != "resonance_two":
		errors.append("%s 只有共鸣二可以使用通配血脉" % label)
	if lineage_wildcard != gene_wildcard:
		errors.append("%s 的族系和基因档通配必须同时出现" % label)
	var approved_lineages := {}
	for raw_gene in genes_by_id.values():
		var gene := _dict(raw_gene)
		approved_lineages[str(gene.get("lineageId", ""))] = true
	for lineage_id in allowed_lineages:
		if lineage_id != "*" and not approved_lineages.has(lineage_id):
			errors.append("%s 引用了未知族系%s" % [label, lineage_id])
	for gene_id in allowed_gene_ids:
		if gene_id != "*" and not genes_by_id.has(gene_id):
			errors.append("%s 引用了未知基因档%s" % [label, gene_id])
	if not lineage_wildcard and not gene_wildcard:
		for gene_id in allowed_gene_ids:
			var gene := _dict(genes_by_id.get(gene_id, {}))
			if not gene.is_empty() and not allowed_lineages.has(str(gene.get("lineageId", ""))):
				errors.append("%s 的基因档%s超出允许族系" % [label, gene_id])
		for lineage_id in allowed_lineages:
			var covered := false
			for gene_id in allowed_gene_ids:
				if str(_dict(genes_by_id.get(gene_id, {})).get("lineageId", "")) == lineage_id:
					covered = true
					break
			if not covered:
				errors.append("%s 的族系%s没有获准基因档" % [label, lineage_id])
	return {
		"allowedLineageIds": allowed_lineages,
		"allowedGeneProfileIds": allowed_gene_ids,
	}


static func _validate_recipe_result(value, recipe_label: String, errors: Array[String]) -> Dictionary:
	var label := "%s.result" % recipe_label
	if not (value is Dictionary):
		errors.append("%s 必须是对象" % label)
		return {}
	var result := value as Dictionary
	_validate_exact_keys(
		result,
		[
			"level",
			"rebirthCount",
			"terminalPathId",
			"paidResetAllowed",
			"newInstanceRequired",
			"numericSource",
			"rideable",
			"bindingPolicy",
			"resultStatePolicy",
		],
		label,
		errors
	)
	if not _integer_equals(result.get("level", null), 1):
		errors.append("%s.level 必须为1" % label)
	if not _integer_equals(result.get("rebirthCount", null), 1):
		errors.append("%s.rebirthCount 必须为1" % label)
	if str(result.get("terminalPathId", "")) != "fusion_terminal_v1":
		errors.append("%s.terminalPathId 必须为 fusion_terminal_v1" % label)
	if result.get("paidResetAllowed", null) != false:
		errors.append("%s 必须禁止付费重置" % label)
	if result.get("newInstanceRequired", null) != true:
		errors.append("%s 必须生成新宠物实例" % label)
	if str(result.get("numericSource", "")) != "target_profile_only_v1":
		errors.append("%s 数值必须只来自目标成长档" % label)
	if result.get("rideable", null) != false:
		errors.append("%s 第一版必须不可骑乘" % label)
	if str(result.get("bindingPolicy", "")) != RESULT_BINDING_POLICY:
		errors.append(
			"%s.bindingPolicy 必须为 bound_if_any_material_bound"
			% label
		)
	if not RESULT_STATE_POLICIES.has(str(result.get("resultStatePolicy", ""))):
		errors.append("%s.resultStatePolicy 无效" % label)
	return result.duplicate(true)


static func _validate_asset_gate(value, recipe_label: String, errors: Array[String]) -> Dictionary:
	var label := "%s.assetGate" % recipe_label
	if not (value is Dictionary):
		errors.append("%s 必须是对象" % label)
		return {}
	var gate := value as Dictionary
	_validate_exact_keys(gate, ["status", "replacementPath"], label, errors)
	if str(gate.get("status", "")) != "formal":
		errors.append("%s.status 生产共享目录只能为 formal" % label)
	if not _nonempty_text(gate.get("replacementPath", null)):
		errors.append("%s.replacementPath 必须是非空文本" % label)
	return gate.duplicate(true)


static func _trainable_skill_ids(document) -> Dictionary:
	var result := {}
	var data := _dict(document)
	var skills = data.get("skills", [])
	if skills is Array:
		for raw_skill in skills as Array:
			if raw_skill is Dictionary:
				var skill_id := str((raw_skill as Dictionary).get("skillId", "")).strip_edges()
				if skill_id != "":
					result[skill_id] = true
	var trainers = data.get("trainers", [])
	if trainers is Array:
		for raw_trainer in trainers as Array:
			if not (raw_trainer is Dictionary):
				continue
			var trainer_skill_ids = (raw_trainer as Dictionary).get("skillIds", [])
			if trainer_skill_ids is Array:
				for raw_skill_id in trainer_skill_ids as Array:
					var skill_id := str(raw_skill_id).strip_edges()
					if skill_id != "":
						result[skill_id] = true
	return result


static func _index_by(value, key: String, label: String, errors: Array[String]) -> Dictionary:
	var result := {}
	if not (value is Array):
		errors.append("%s目录必须是数组" % label)
		return result
	for index in range((value as Array).size()):
		var raw_entry = (value as Array)[index]
		if not (raw_entry is Dictionary):
			errors.append("%s[%d]必须是对象" % [label, index])
			continue
		var entry := raw_entry as Dictionary
		var entry_id := str(entry.get(key, "")).strip_edges()
		if entry_id == "":
			errors.append("%s[%d].%s不能为空" % [label, index, key])
		elif result.has(entry_id):
			errors.append("%s目录ID重复：%s" % [label, entry_id])
		else:
			result[entry_id] = entry
	return result


static func _validated_identifier(value, label: String, errors: Array[String]) -> String:
	if typeof(value) != TYPE_STRING:
		errors.append("%s 必须是稳定 snake_case ID" % label)
		return ""
	var identifier := (value as String).strip_edges()
	if not _identifier_is_valid(identifier):
		errors.append("%s 必须是稳定 snake_case ID" % label)
		return ""
	return identifier


static func _validated_identifier_set(value, label: String, errors: Array[String]) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array) or (value as Array).is_empty():
		errors.append("%s 必须是非空数组" % label)
		return result
	for index in range((value as Array).size()):
		var raw_identifier = (value as Array)[index]
		if typeof(raw_identifier) != TYPE_STRING:
			errors.append("%s[%d] 必须是稳定ID或通配符" % [label, index])
			continue
		var identifier := (raw_identifier as String).strip_edges()
		if identifier != "*" and not _identifier_is_valid(identifier):
			errors.append("%s[%d] 必须是稳定ID或通配符" % [label, index])
			continue
		if result.has(identifier):
			errors.append("%s 存在重复ID：%s" % [label, identifier])
			continue
		result.append(identifier)
	if result.has("*") and result.size() != 1:
		errors.append("%s 的通配符必须单独使用" % label)
	return result


static func _identifier_is_valid(value: String) -> bool:
	if value.length() < 2 or value.length() > 96:
		return false
	var first := value.unicode_at(0)
	if first < 0x61 or first > 0x7a:
		return false
	for index in range(1, value.length()):
		var codepoint := value.unicode_at(index)
		var is_lower := codepoint >= 0x61 and codepoint <= 0x7a
		var is_digit := codepoint >= 0x30 and codepoint <= 0x39
		if not is_lower and not is_digit and codepoint != 0x5f:
			return false
	return true


static func _validate_exact_keys(
	value: Dictionary,
	expected_keys: Array,
	label: String,
	errors: Array[String]
) -> void:
	var actual: Array[String] = []
	for raw_key in value.keys():
		actual.append(str(raw_key))
	actual.sort()
	var expected: Array[String] = []
	for raw_key in expected_keys:
		expected.append(str(raw_key))
	expected.sort()
	if actual != expected:
		errors.append("%s 字段必须严格为：%s" % [label, "、".join(expected)])


static func _same_string_array(value, expected: Array[String]) -> bool:
	if not (value is Array) or (value as Array).size() != expected.size():
		return false
	for index in range(expected.size()):
		if typeof((value as Array)[index]) != TYPE_STRING:
			return false
		if str((value as Array)[index]) != expected[index]:
			return false
	return true


static func _integer_equals(value, expected: int) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	var number := float(value)
	return is_finite(number) and floorf(number) == number and int(number) == expected


static func _number_equals(value, expected: float) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	var number := float(value)
	return is_finite(number) and number == expected


static func _nonempty_text(value) -> bool:
	return typeof(value) == TYPE_STRING and not (value as String).strip_edges().is_empty()


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
