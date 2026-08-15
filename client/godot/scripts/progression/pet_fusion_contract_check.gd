extends SceneTree

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const PetFusionClientModel := preload("res://scripts/progression/pet_fusion_client_model.gd")
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")

const FUSION_GENE_REACTION_FIELDS := {
	"pet_gene_emberhorn_red_heavy_charge": {
		"canDodge": true,
		"canCritical": false,
		"canCounter": false,
	},
	"pet_gene_emberhorn_ash_sure_charge": {
		"canDodge": false,
		"canCritical": false,
		"canCounter": false,
	},
	"pet_gene_emberhorn_gale_rending_charge": {
		"canDodge": true,
		"canCritical": true,
		"canCounter": false,
	},
	"pet_gene_mossback_marsh_sure_crush": {
		"canDodge": false,
		"canCritical": true,
		"canCounter": false,
	},
	"pet_gene_mossback_sunbaked_heavy_crush": {
		"canDodge": true,
		"canCritical": false,
		"canCounter": false,
	},
}


func _initialize() -> void:
	var errors: Array[String] = []
	BalanceCatalogModel.reload()
	var production_catalog := BalanceCatalogModel.pet_fusion_recipes()
	var production_dependencies := _production_dependencies()
	var production_contract := PetFusionRecipeCatalogModel.contract_check(
		production_catalog,
		production_dependencies.get("petTemplates", {}),
		production_dependencies.get("growthProfiles", {}),
		production_dependencies.get("paidResetPolicy", {}),
		production_dependencies.get("battleActions", {}),
		production_dependencies.get("battlePassives", {}),
		production_dependencies.get("skillTraining", {})
	)
	_expect(
		bool(production_contract.get("ok", false)),
		"生产融合目录未通过严格校验：%s"
			% " | ".join(production_contract.get("errors", []) as Array),
		errors
	)
	_expect(
		not bool(production_contract.get("runtimeEnabled", true))
			and not bool(production_contract.get("available", true))
			and int(production_contract.get("geneProfileCount", -1)) == 5
			and int(production_contract.get("recipeCount", -1)) == 2
			and production_contract.get("targetFormIds", []) == [
				"emberhorn_fusion_moss_rampart_fire4_earth6",
				"emberhorn_fusion_solar_crown_fire7_wind3",
			],
		"生产融合目录必须保持关闭，并精确登记五个血脉基因档与两条正式配方",
		errors
	)
	var bloodline_reaction_fields_ok := true
	var bloodline_reaction_sequence := 100
	for skill_id_value in FUSION_GENE_REACTION_FIELDS:
		var skill_id := str(skill_id_value)
		var expected := FUSION_GENE_REACTION_FIELDS.get(skill_id, {}) as Dictionary
		var event := BattleModel._make_skill_event(
			{},
			"qa_fusion_gene_actor",
			"qa_fusion_gene_target",
			bloodline_reaction_sequence,
			skill_id
		)
		bloodline_reaction_sequence += 1
		var event_ok := (
			str(event.get("type", "")) == "skill_attack"
			and str(event.get("skillId", "")) == skill_id
			and event.has("canDodge")
			and event.has("canCritical")
			and event.has("canCounter")
			and bool(event.get("canDodge", false))
				== bool(expected.get("canDodge", false))
			and bool(event.get("canCritical", false))
				== bool(expected.get("canCritical", false))
			and bool(event.get("canCounter", false))
				== bool(expected.get("canCounter", false))
		)
		bloodline_reaction_fields_ok = bloodline_reaction_fields_ok and event_ok
		_expect(
			event_ok,
			"融合血脉技能本地事件反应字段错误：%s" % skill_id,
			errors
		)
	var snapshot := BalanceCatalogModel.balance_snapshot_summary()
	var snapshot_paths = snapshot.get("sourcePaths", [])
	_expect(
		snapshot_paths is Array
			and (snapshot_paths as Array).has(BalanceCatalogModel.PET_FUSION_RECIPES_PATH)
			and int(snapshot.get("sourceCount", 0)) == (snapshot_paths as Array).size()
			and str(snapshot.get("sourceDigest", "")).length() == 64,
		"融合共享目录没有进入稳定数值摘要",
		errors
	)

	var enabled_empty := production_catalog.duplicate(true)
	enabled_empty["runtimeEnabled"] = true
	enabled_empty["recipes"] = []
	_expect(
		not _catalog_errors(enabled_empty, production_dependencies).is_empty(),
		"空配方目录被错误开启",
		errors
	)
	var extra_field := production_catalog.duplicate(true)
	extra_field["debugBypass"] = true
	_expect(
		not _catalog_errors(extra_field, production_dependencies).is_empty(),
		"融合目录额外字段没有失败关闭",
		errors
	)
	var invalid_rule_values := {
		"additionalCostPolicy": "stone_coin_fee",
		"resultBindingPolicy": "always_bound",
		"unboundResultTradePolicy": "always_tradeable",
		"baseActiveSkillForgetPolicy": "allowed",
		"inheritedSpecialActiveForgetPolicy": "single_confirm",
		"postFusionTrainingPolicy": "overwrite_allowed",
	}
	for raw_rule_key in invalid_rule_values:
		var rule_key := str(raw_rule_key)
		var invalid_rules_catalog := production_catalog.duplicate(true)
		var invalid_rules := (
			invalid_rules_catalog.get("rules", {}) as Dictionary
		).duplicate(true)
		invalid_rules[rule_key] = invalid_rule_values.get(rule_key)
		invalid_rules_catalog["rules"] = invalid_rules
		_expect(
			not _catalog_errors(
				invalid_rules_catalog,
				production_dependencies
			).is_empty(),
			"融合目录错误策略没有失败关闭：%s" % rule_key,
			errors
		)

	var fixture := _enabled_fixture()
	var fixture_catalog := fixture.get("catalog", {}) as Dictionary
	var fixture_dependencies := fixture.get("dependencies", {}) as Dictionary
	var fixture_errors := _catalog_errors(fixture_catalog, fixture_dependencies)
	_expect(
		fixture_errors.is_empty()
			and PetFusionRecipeCatalogModel.runtime_available(fixture_catalog),
		"未来正式融合配方夹具未通过严格校验：%s" % " | ".join(fixture_errors),
		errors
	)
	var disabled_fixture_catalog := fixture_catalog.duplicate(true)
	disabled_fixture_catalog["runtimeEnabled"] = false
	var nonrideable_art_form := {
		"formId": "form_fusion_target",
		"rideableTarget": false,
		"supportedCharacterIds": [],
	}
	var valid_nonrideable_art_errors := PetArtCatalog.capability_validation_errors(
		nonrideable_art_form,
		"novice_hunter_v1",
		disabled_fixture_catalog
	)
	_expect(
		valid_nonrideable_art_errors.is_empty(),
		"关闭态共享配方的不可骑目标未通过美术能力门禁：%s"
			% " | ".join(valid_nonrideable_art_errors),
		errors
	)
	var empty_recipe_catalog := disabled_fixture_catalog.duplicate(true)
	empty_recipe_catalog["recipes"] = []
	_expect(
		not PetArtCatalog.capability_validation_errors(
			nonrideable_art_form,
			"novice_hunter_v1",
			empty_recipe_catalog
		).is_empty(),
		"没有共享融合配方的普通形态伪装成不可骑目标",
		errors
	)
	var ordinary_nonrideable_art := nonrideable_art_form.duplicate(true)
	ordinary_nonrideable_art["formId"] = "form_ordinary"
	_expect(
		not PetArtCatalog.capability_validation_errors(
			ordinary_nonrideable_art,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"非融合目标错误通过不可骑美术能力门禁",
		errors
	)
	var missing_rideable_art := nonrideable_art_form.duplicate(true)
	missing_rideable_art.erase("rideableTarget")
	_expect(
		not PetArtCatalog.capability_validation_errors(
			missing_rideable_art,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"缺失 rideableTarget 的美术目录项没有失败关闭",
		errors
	)
	var invalid_rideable_art := nonrideable_art_form.duplicate(true)
	invalid_rideable_art["rideableTarget"] = "false"
	_expect(
		not PetArtCatalog.capability_validation_errors(
			invalid_rideable_art,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"非布尔 rideableTarget 的美术目录项没有失败关闭",
		errors
	)
	var missing_supported_art := nonrideable_art_form.duplicate(true)
	missing_supported_art.erase("supportedCharacterIds")
	_expect(
		not PetArtCatalog.capability_validation_errors(
			missing_supported_art,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"缺失 supportedCharacterIds 的美术目录项没有失败关闭",
		errors
	)
	var invalid_supported_art := nonrideable_art_form.duplicate(true)
	invalid_supported_art["supportedCharacterIds"] = "novice_hunter_v1"
	_expect(
		not PetArtCatalog.capability_validation_errors(
			invalid_supported_art,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"非数组 supportedCharacterIds 的美术目录项没有失败关闭",
		errors
	)
	var nonrideable_with_character := nonrideable_art_form.duplicate(true)
	nonrideable_with_character["supportedCharacterIds"] = ["novice_hunter_v1"]
	_expect(
		not PetArtCatalog.capability_validation_errors(
			nonrideable_with_character,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"不可骑目标错误登记了整图骑乘人物",
		errors
	)
	var nonrideable_with_mounted := nonrideable_art_form.duplicate(true)
	nonrideable_with_mounted["mounted"] = {}
	_expect(
		not PetArtCatalog.capability_validation_errors(
			nonrideable_with_mounted,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"不可骑目标错误登记了 mounted 资产包",
		errors
	)
	var rideable_without_mounted := {
		"formId": "form_ordinary",
		"rideableTarget": true,
		"supportedCharacterIds": ["novice_hunter_v1"],
	}
	_expect(
		not PetArtCatalog.capability_validation_errors(
			rideable_without_mounted,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty(),
		"可骑目标缺失 mounted 资产包仍通过门禁",
		errors
	)
	var art_capability_gate_ok := (
		valid_nonrideable_art_errors.is_empty()
		and not PetArtCatalog.capability_validation_errors(
			ordinary_nonrideable_art,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty()
		and not PetArtCatalog.capability_validation_errors(
			rideable_without_mounted,
			"novice_hunter_v1",
			disabled_fixture_catalog
		).is_empty()
	)
	var training_gene_catalog := fixture_catalog.duplicate(true)
	var training_genes := training_gene_catalog.get("geneProfiles", []) as Array
	(training_genes[0] as Dictionary)["specialActiveSkillId"] = "pet_training_bite"
	_expect(
		not _catalog_errors(training_gene_catalog, fixture_dependencies).is_empty(),
		"普通训练主动技能被错误登记为融合血脉特殊主动",
		errors
	)
	var rideable_target_catalog := fixture_catalog.duplicate(true)
	var rideable_dependencies := fixture_dependencies.duplicate(true)
	var rideable_templates := (
		rideable_dependencies.get("petTemplates", {}) as Dictionary
	).duplicate(true)
	var rideable_forms := (rideable_templates.get("forms", []) as Array).duplicate(true)
	for raw_form in rideable_forms:
		if raw_form is Dictionary and str((raw_form as Dictionary).get("formId", "")) == "form_fusion_target":
			(raw_form as Dictionary)["riding"] = {"rideable": true}
	rideable_templates["forms"] = rideable_forms
	rideable_dependencies["petTemplates"] = rideable_templates
	_expect(
		not _catalog_errors(rideable_target_catalog, rideable_dependencies).is_empty(),
		"第一版可骑乘融合目标没有失败关闭",
		errors
	)
	var mismatched_binding_catalog := fixture_catalog.duplicate(true)
	var mismatched_binding_recipes := (
		mismatched_binding_catalog.get("recipes", []) as Array
	)
	var mismatched_binding_recipe := (
		mismatched_binding_recipes[0] as Dictionary
	)
	var mismatched_binding_recipe_result := (
		mismatched_binding_recipe.get("result", {}) as Dictionary
	)
	mismatched_binding_recipe_result["bindingPolicy"] = "always_bound"
	_expect(
		not _catalog_errors(
			mismatched_binding_catalog,
			fixture_dependencies
		).is_empty(),
		"配方绑定策略与全局规则不一致仍通过目录门禁",
		errors
	)
	var recursive_target_catalog := fixture_catalog.duplicate(true)
	(recursive_target_catalog.get("geneProfiles", []) as Array).append({
		"geneProfileId": "gene_fusion_target_forbidden_v1",
		"lineageId": "line_fusion_target",
		"formId": "form_fusion_target",
		"growthProfileId": "growth_fusion_target_v1",
		"materialClass": "ordinary",
		"specialActiveSkillId": "pet_special_core",
		"passiveSkillId": "passive_core",
	})
	_expect(
		not _catalog_errors(recursive_target_catalog, fixture_dependencies).is_empty(),
		"共鸣二通配错误允许融合目标重新登记为材料",
		errors
	)

	var material_ids := {
		"core": "pet_core_1",
		"resonance_one": "pet_resonance_one_2",
		"resonance_two": "pet_resonance_two_3",
	}
	var invalid_request_catalog := fixture_catalog.duplicate(true)
	var invalid_request_rules := (
		invalid_request_catalog.get("rules", {}) as Dictionary
	).duplicate(true)
	invalid_request_rules["additionalCostPolicy"] = "stone_coin_fee"
	invalid_request_catalog["rules"] = invalid_request_rules
	_expect(
		not PetFusionRecipeCatalogModel.runtime_available(
			invalid_request_catalog
		)
		and PetFusionClientModel.request_payload(
			"fusion_recipe_fixture_v1",
			material_ids,
			invalid_request_catalog
		).is_empty(),
		"错误全局策略仍被当作可用运行目录构造融合请求",
		errors
	)
	var quote_spec := ServerAuthClientModel.pet_fusion_quote_request(
		"http://127.0.0.1:8787/",
		"session_fixture",
		"fusion_recipe_fixture_v1",
		material_ids,
		fixture_catalog
	)
	var quote_body := _dict(JSON.parse_string(str(quote_spec.get("body", ""))))
	_expect(
		str(quote_spec.get("url", "")) == "http://127.0.0.1:8787/pets/fusion/quote"
			and int(quote_spec.get("method", -1)) == HTTPClient.METHOD_POST
			and quote_spec.get("durableMutation", false) != true
			and ServerAuthClientModel.request_is_idempotent(quote_spec)
			and ServerAuthClientModel.request_idempotency_key(quote_spec) == ""
			and _has_exact_keys(quote_body, ["recipeId", "materialInstanceIds"])
			and quote_body.get("materialInstanceIds", {}) == material_ids,
		"融合报价请求不是严格的只读可重试 POST",
		errors
	)
	var operation_id := "bbo_fusion_contract_operation_0001"
	var mutation_spec := ServerAuthClientModel.pet_fusion_request(
		"http://127.0.0.1:8787/",
		"session_fixture",
		"fusion_recipe_fixture_v1",
		material_ids,
		7,
		PetFusionRecipeCatalogModel.CATALOG_ID,
		operation_id,
		fixture_catalog
	)
	var mutation_body := _dict(JSON.parse_string(str(mutation_spec.get("body", ""))))
	_expect(
		str(mutation_spec.get("url", "")) == "http://127.0.0.1:8787/pets/fusion"
			and int(mutation_spec.get("method", -1)) == HTTPClient.METHOD_POST
			and bool(mutation_spec.get("durableMutation", false))
			and ServerAuthClientModel.request_is_idempotent(mutation_spec)
			and ServerAuthClientModel.request_idempotency_key(mutation_spec) == operation_id
			and _has_exact_keys(
				mutation_body,
				[
					"recipeId",
					"materialInstanceIds",
					"expectedProfileRevision",
					"expectedCatalogId",
				]
			)
			and int(mutation_body.get("expectedProfileRevision", -1)) == 7
			and str(mutation_body.get("expectedCatalogId", ""))
				== PetFusionRecipeCatalogModel.CATALOG_ID,
		"融合执行请求没有保留 revision/catalog/operationId 幂等合同",
		errors
	)
	var duplicate_material_ids := material_ids.duplicate(true)
	duplicate_material_ids["resonance_two"] = material_ids["core"]
	_expect(
		ServerAuthClientModel.pet_fusion_quote_request(
			"http://127.0.0.1:8787",
			"session_fixture",
			"fusion_recipe_fixture_v1",
			duplicate_material_ids,
			fixture_catalog
		).is_empty(),
		"重复材料仍生成了融合报价请求",
		errors
	)
	_expect(
		ServerAuthClientModel.pet_fusion_quote_request(
			"http://127.0.0.1:8787",
			"session_fixture",
			"fusion_recipe_fixture_v1",
			material_ids
		).is_empty()
			and ServerAuthClientModel.pet_fusion_request(
				"http://127.0.0.1:8787",
				"session_fixture",
				"fusion_recipe_fixture_v1",
				material_ids,
				7,
				PetFusionRecipeCatalogModel.CATALOG_ID,
				operation_id
			).is_empty(),
		"生产目录关闭时客户端仍能构造融合请求",
		errors
	)

	var quote := _quote_fixture()
	var parsed_quote := ServerAuthClientModel.parse_pet_fusion_quote_response(
		200,
		JSON.stringify({
			"ok": true,
			"profileBinding": {"profileRevision": 7},
			"profileSummary": {},
			"petFusionQuote": quote,
			"message": "融合条件已刷新。",
		}).to_utf8_buffer(),
		fixture_catalog
	)
	_expect(
		bool(parsed_quote.get("ok", false))
			and PetFusionClientModel.quote_matches_material_selection(
				parsed_quote.get("petFusionQuote", {}),
				"fusion_recipe_fixture_v1",
				material_ids,
				fixture_catalog
			)
			and str(
				(parsed_quote.get("petFusionQuote", {}) as Dictionary).get("catalogId", "")
			) == PetFusionRecipeCatalogModel.CATALOG_ID,
		"合法融合报价没有通过严格响应解析",
		errors
	)
	var bound_quote := quote.duplicate(true)
	var bound_quote_result := (
		bound_quote.get("result", {}) as Dictionary
	).duplicate(true)
	bound_quote_result["resultBinding"] = "bound"
	bound_quote_result["tradeEligibility"] = "not_eligible"
	bound_quote["result"] = bound_quote_result
	_expect(
		not PetFusionClientModel.normalized_quote(
			bound_quote,
			fixture_catalog
		).is_empty(),
		"绑定材料推导的绑定成品报价没有通过严格响应解析",
		errors
	)
	var fee_quote := quote.duplicate(true)
	var fee_quote_result := (
		fee_quote.get("result", {}) as Dictionary
	).duplicate(true)
	fee_quote_result["additionalCostPolicy"] = "stone_coin_fee"
	fee_quote["result"] = fee_quote_result
	_expect(
		PetFusionClientModel.normalized_quote(
			fee_quote,
			fixture_catalog
		).is_empty(),
		"带额外费用的融合报价没有失败关闭",
		errors
	)
	var mismatched_trade_quote := quote.duplicate(true)
	var mismatched_trade_quote_result := (
		mismatched_trade_quote.get("result", {}) as Dictionary
	).duplicate(true)
	mismatched_trade_quote_result["resultBinding"] = "bound"
	mismatched_trade_quote_result["tradeEligibility"] = (
		"eligible_when_pet_trading_available"
	)
	mismatched_trade_quote["result"] = mismatched_trade_quote_result
	_expect(
		PetFusionClientModel.normalized_quote(
			mismatched_trade_quote,
			fixture_catalog
		).is_empty(),
		"绑定成品错误获得交易资格仍通过报价解析",
		errors
	)
	var malformed_quote := quote.duplicate(true)
	malformed_quote["privateSeed"] = "must_not_leak"
	var parsed_malformed_quote := ServerAuthClientModel.parse_pet_fusion_quote_response(
		200,
		JSON.stringify({
			"ok": true,
			"profileBinding": {"profileRevision": 7},
			"profileSummary": {},
			"petFusionQuote": malformed_quote,
		}).to_utf8_buffer(),
		fixture_catalog
	)
	_expect(
		not bool(parsed_malformed_quote.get("ok", true))
			and str(parsed_malformed_quote.get("code", "")) == "bad_json"
			and (parsed_malformed_quote.get("petFusionQuote", {}) as Dictionary).is_empty(),
		"携带私有随机字段的融合报价没有失败关闭",
		errors
	)

	var fusion_result := _fusion_result_fixture()
	var parsed_result := ServerAuthClientModel.parse_pet_fusion_response(
		200,
		JSON.stringify({
			"ok": true,
			"profile": {},
			"profileBinding": {"profileRevision": 8},
			"profileSummary": {},
			"petFusion": fusion_result,
			"logLines": [fusion_result.get("message", "")],
			"message": fusion_result.get("message", ""),
		}).to_utf8_buffer(),
		fixture_catalog
	)
	_expect(
		bool(parsed_result.get("ok", false))
			and str(
				(parsed_result.get("petFusion", {}) as Dictionary).get(
					"resultInstanceId",
					""
				)
			) == "pet_fusion_100"
			and (parsed_result.get("petFusion", {}) as Dictionary).get(
				"materialNumericInheritance",
				true
			) == false
			and (parsed_result.get("petFusion", {}) as Dictionary).get("rideable", true)
				== false
			and str(
				(parsed_result.get("petFusion", {}) as Dictionary).get(
					"additionalCostPolicy",
					""
				)
			) == "materials_only"
			and str(
				(parsed_result.get("petFusion", {}) as Dictionary).get(
					"resultBinding",
					""
				)
			) == "unbound"
			and str(
				(parsed_result.get("petFusion", {}) as Dictionary).get(
					"tradeEligibility",
					""
				)
			) == "eligible_when_pet_trading_available",
		"合法融合结果没有通过严格响应解析",
		errors
	)
	var mismatched_trade_result := fusion_result.duplicate(true)
	mismatched_trade_result["resultBinding"] = "bound"
	mismatched_trade_result["tradeEligibility"] = (
		"eligible_when_pet_trading_available"
	)
	_expect(
		PetFusionClientModel.normalized_fusion_result(
			mismatched_trade_result,
			fixture_catalog
		).is_empty(),
		"绑定成品错误获得交易资格仍通过完成结果解析",
		errors
	)
	var bound_fusion_result := fusion_result.duplicate(true)
	bound_fusion_result["resultBinding"] = "bound"
	bound_fusion_result["tradeEligibility"] = "not_eligible"
	_expect(
		not PetFusionClientModel.normalized_fusion_result(
			bound_fusion_result,
			fixture_catalog
		).is_empty(),
		"合法绑定融合完成结果没有通过严格解析",
		errors
	)
	var fee_fusion_result := fusion_result.duplicate(true)
	fee_fusion_result["additionalCostPolicy"] = "stone_coin_fee"
	_expect(
		PetFusionClientModel.normalized_fusion_result(
			fee_fusion_result,
			fixture_catalog
		).is_empty(),
		"带额外费用的融合完成结果没有失败关闭",
		errors
	)
	var private_result := fusion_result.duplicate(true)
	private_result["fusionPrivate"] = {"privateRootSeed": "must_not_leak"}
	var parsed_private_result := ServerAuthClientModel.parse_pet_fusion_response(
		200,
		JSON.stringify({
			"ok": true,
			"profile": {},
			"profileBinding": {"profileRevision": 8},
			"profileSummary": {},
			"petFusion": private_result,
			"logLines": [],
		}).to_utf8_buffer(),
		fixture_catalog
	)
	_expect(
		not bool(parsed_private_result.get("ok", true))
			and str(parsed_private_result.get("code", "")) == "bad_json",
		"融合结果中的私有随机信息没有失败关闭",
		errors
	)
	var ordinary_active_result := fusion_result.duplicate(true)
	ordinary_active_result["inheritedActiveSkillIds"] = ["pet_training_bite"]
	_expect(
		PetFusionClientModel.normalized_fusion_result(
			ordinary_active_result,
			fixture_catalog
		).is_empty(),
		"普通训练主动技能被错误接纳为融合遗传结果",
		errors
	)
	var duplicate_active_catalog := fixture_catalog.duplicate(true)
	var duplicate_active_genes := duplicate_active_catalog.get("geneProfiles", []) as Array
	(duplicate_active_genes[2] as Dictionary)["specialActiveSkillId"] = "pet_special_core"
	var duplicate_active_result := fusion_result.duplicate(true)
	duplicate_active_result["inheritedActiveSkillIds"] = ["pet_special_core"]
	duplicate_active_result["inheritedPassiveSkillId"] = "passive_resonance_two"
	duplicate_active_result["passiveSourceRoleId"] = "resonance_two"
	_expect(
		_catalog_errors(duplicate_active_catalog, fixture_dependencies).is_empty()
			and not PetFusionClientModel.normalized_fusion_result(
				duplicate_active_result,
				duplicate_active_catalog
			).is_empty(),
		"重复特殊主动去重后错误丢失了共鸣二的独立被动来源",
		errors
	)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.pet_fusion_contract_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"checks": {
			"productionClosed": (
				bool(production_contract.get("ok", false))
				and not bool(production_contract.get("available", true))
			),
			"catalogStrict": fixture_errors.is_empty(),
			"artCapabilityGateStrict": art_capability_gate_ok,
			"digestIncludesFusion": (
				snapshot_paths is Array
				and (snapshot_paths as Array).has(BalanceCatalogModel.PET_FUSION_RECIPES_PATH)
			),
			"quotePostReadOnly": not quote_spec.is_empty(),
			"mutationDurable": not mutation_spec.is_empty(),
			"quoteResponseStrict": bool(parsed_quote.get("ok", false)),
			"mutationResponseStrict": bool(parsed_result.get("ok", false)),
			"commercialPoliciesStrict": (
				not PetFusionClientModel.normalized_quote(
					bound_quote,
					fixture_catalog
				).is_empty()
				and PetFusionClientModel.normalized_quote(
					fee_quote,
					fixture_catalog
				).is_empty()
				and PetFusionClientModel.normalized_fusion_result(
					mismatched_trade_result,
					fixture_catalog
				).is_empty()
				and not PetFusionClientModel.normalized_fusion_result(
					bound_fusion_result,
					fixture_catalog
				).is_empty()
				and PetFusionClientModel.normalized_fusion_result(
					fee_fusion_result,
					fixture_catalog
				).is_empty()
			),
			"ordinaryTrainingActiveRejected": PetFusionClientModel.normalized_fusion_result(
				ordinary_active_result,
				fixture_catalog
			).is_empty(),
			"bloodlineReactionFields": bloodline_reaction_fields_ok,
			"duplicateActiveDeduplicatedWithoutReroll": not PetFusionClientModel.normalized_fusion_result(
				duplicate_active_result,
				duplicate_active_catalog
			).is_empty(),
		},
		"errors": errors,
	}
	print("pet fusion contract check: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


static func _production_dependencies() -> Dictionary:
	return {
		"petTemplates": _load_json("res://data/pet_templates.json"),
		"growthProfiles": _load_json(
			"res://data/balance/pet_growth_species_profiles.json"
		),
		"paidResetPolicy": _load_json("res://data/balance/pet_paid_reset_policy.json"),
		"battleActions": _load_json("res://data/battle_actions.json"),
		"battlePassives": _load_json("res://data/battle_passive_skills.json"),
		"skillTraining": _load_json("res://data/pet_skill_training.json"),
	}


static func _enabled_fixture() -> Dictionary:
	var catalog := {
		"schemaVersion": PetFusionRecipeCatalogModel.CATALOG_SCHEMA_VERSION,
		"catalogId": PetFusionRecipeCatalogModel.CATALOG_ID,
		"runtimeEnabled": true,
		"disabledMessage": "夹具目录不可用。",
		"rules": {
			"roleIds": ["core", "resonance_one", "resonance_two"],
			"requiredGrowthModelVersion": "pet_growth_authority_v1",
			"requiredRebirthCount": 1,
			"minimumLevel": 131,
			"maximumLevel": 140,
			"baseActiveSkillIds": ["pet_attack", "pet_defend"],
			"specialActiveInheritanceChance": 0.5,
			"passiveSourceWeights": {
				"core": 0.4,
				"resonance_one": 0.3,
				"resonance_two": 0.3,
			},
			"resultPassiveSkillCount": 1,
			"materialNumericInheritance": false,
			"resultRideable": false,
			"additionalCostPolicy": "materials_only",
			"resultBindingPolicy": "bound_if_any_material_bound",
			"unboundResultTradePolicy": "eligible_when_pet_trading_available",
			"baseActiveSkillForgetPolicy": "forbidden",
			"inheritedSpecialActiveForgetPolicy": "double_confirm_irreversible",
			"postFusionTrainingPolicy": "empty_slots_only",
		},
		"geneProfiles": [
			{
				"geneProfileId": "gene_core_v1",
				"lineageId": "line_core",
				"formId": "form_core",
				"growthProfileId": "growth_core_v1",
				"materialClass": "ordinary",
				"specialActiveSkillId": "pet_special_core",
				"passiveSkillId": "passive_core",
			},
			{
				"geneProfileId": "gene_resonance_one_v1",
				"lineageId": "line_resonance_one",
				"formId": "form_resonance_one",
				"growthProfileId": "growth_resonance_one_v1",
				"materialClass": "ordinary",
				"specialActiveSkillId": "pet_special_resonance_one",
				"passiveSkillId": "passive_resonance_one",
			},
			{
				"geneProfileId": "gene_resonance_two_v1",
				"lineageId": "line_resonance_two",
				"formId": "form_resonance_two",
				"growthProfileId": "growth_resonance_two_v1",
				"materialClass": "ordinary",
				"specialActiveSkillId": "pet_special_resonance_two",
				"passiveSkillId": "passive_resonance_two",
			},
		],
		"recipes": [
			{
				"recipeId": "fusion_recipe_fixture_v1",
				"targetFormId": "form_fusion_target",
				"targetGrowthProfileId": "growth_fusion_target_v1",
				"roleGeneRules": {
					"core": {
						"allowedLineageIds": ["line_core"],
						"allowedGeneProfileIds": ["gene_core_v1"],
					},
					"resonance_one": {
						"allowedLineageIds": ["line_resonance_one"],
						"allowedGeneProfileIds": ["gene_resonance_one_v1"],
					},
					"resonance_two": {
						"allowedLineageIds": ["*"],
						"allowedGeneProfileIds": ["*"],
					},
				},
				"result": {
					"level": 1,
					"rebirthCount": 1,
					"terminalPathId": "fusion_terminal_v1",
					"paidResetAllowed": false,
					"newInstanceRequired": true,
					"numericSource": "target_profile_only_v1",
					"rideable": false,
					"bindingPolicy": "bound_if_any_material_bound",
					"resultStatePolicy": "replace_active_else_core_state",
				},
				"assetGate": {
					"status": "formal",
					"replacementPath": "res://assets/pets/form_fusion_target",
				},
			},
		],
	}
	var forms: Array[Dictionary] = []
	var growth_profiles: Array[Dictionary] = []
	for entry in [
		["form_core", "line_core", "growth_core_v1"],
		["form_resonance_one", "line_resonance_one", "growth_resonance_one_v1"],
		["form_resonance_two", "line_resonance_two", "growth_resonance_two_v1"],
		["form_fusion_target", "line_fusion_target", "growth_fusion_target_v1"],
	]:
		forms.append({
			"formId": entry[0],
			"lineId": entry[1],
			"growthSpeciesProfileId": entry[2],
			"riding": {"rideable": false},
		})
		growth_profiles.append({
			"profileId": entry[2],
			"formId": entry[0],
		})
	return {
		"catalog": catalog,
		"dependencies": {
			"petTemplates": {"forms": forms},
			"growthProfiles": {"profiles": growth_profiles},
			"paidResetPolicy": {
				"formPolicies": [
					{
						"formId": "form_fusion_target",
						"resetAllowed": false,
						"ineligibleReason": "terminal_fusion",
					},
				],
			},
			"battleActions": {
				"actions": [
					{"id": "pet_special_core", "owner": "pet_skill"},
					{"id": "pet_special_resonance_one", "owner": "pet_skill"},
					{"id": "pet_special_resonance_two", "owner": "pet_skill"},
					{"id": "pet_training_bite", "owner": "pet_skill"},
				],
			},
			"battlePassives": {
				"passives": [
					{"id": "passive_core"},
					{"id": "passive_resonance_one"},
					{"id": "passive_resonance_two"},
				],
			},
			"skillTraining": {
				"skills": [{"skillId": "pet_training_bite"}],
				"trainers": [],
			},
		},
	}


static func _quote_fixture() -> Dictionary:
	return {
		"schemaVersion": 1,
		"catalogId": PetFusionRecipeCatalogModel.CATALOG_ID,
		"recipeId": "fusion_recipe_fixture_v1",
		"profileRevision": 7,
		"materials": [
			{
				"roleId": "core",
				"instanceId": "pet_core_1",
				"formId": "form_core",
				"formName": "核心宠",
				"level": 131,
				"rebirthCount": 1,
				"specialActiveSkillId": "pet_special_core",
				"passiveSkillId": "passive_core",
			},
			{
				"roleId": "resonance_one",
				"instanceId": "pet_resonance_one_2",
				"formId": "form_resonance_one",
				"formName": "共鸣一宠",
				"level": 140,
				"rebirthCount": 1,
				"specialActiveSkillId": "pet_special_resonance_one",
				"passiveSkillId": "passive_resonance_one",
			},
			{
				"roleId": "resonance_two",
				"instanceId": "pet_resonance_two_3",
				"formId": "form_resonance_two",
				"formName": "共鸣二宠",
				"level": 137,
				"rebirthCount": 1,
				"specialActiveSkillId": "pet_special_resonance_two",
				"passiveSkillId": "passive_resonance_two",
			},
		],
		"inheritance": {
			"baseActiveSkillIds": ["pet_attack", "pet_defend"],
			"specialActiveInheritanceChance": 0.5,
			"activeRollsIndependent": true,
			"ordinaryOrTrainingActiveInheritance": false,
			"duplicateActiveSkillPolicy": "deduplicate_after_roll_no_reroll",
			"passiveSourceWeights": {
				"core": 0.4,
				"resonance_one": 0.3,
				"resonance_two": 0.3,
			},
			"resultPassiveSkillCount": 1,
		},
		"result": {
			"targetFormId": "form_fusion_target",
			"targetFormName": "融合目标宠",
			"level": 1,
			"rebirthCount": 1,
			"terminalStage": 2,
			"terminalStageLabel": "2转/进化/融合",
			"numericSource": "target_profile_only_v1",
			"materialNumericInheritance": false,
			"rideable": false,
			"additionalCostPolicy": "materials_only",
			"resultBinding": "unbound",
			"tradeEligibility": "eligible_when_pet_trading_available",
		},
	}


static func _fusion_result_fixture() -> Dictionary:
	return {
		"schemaVersion": 1,
		"catalogId": PetFusionRecipeCatalogModel.CATALOG_ID,
		"recipeId": "fusion_recipe_fixture_v1",
		"resultInstanceId": "pet_fusion_100",
		"targetFormId": "form_fusion_target",
		"targetFormName": "融合目标宠",
		"level": 1,
		"rebirthCount": 1,
		"terminalStage": 2,
		"consumedMaterials": [
			{
				"roleId": "core",
				"instanceId": "pet_core_1",
				"formId": "form_core",
				"formName": "核心宠",
			},
			{
				"roleId": "resonance_one",
				"instanceId": "pet_resonance_one_2",
				"formId": "form_resonance_one",
				"formName": "共鸣一宠",
			},
			{
				"roleId": "resonance_two",
				"instanceId": "pet_resonance_two_3",
				"formId": "form_resonance_two",
				"formName": "共鸣二宠",
			},
		],
		"baseActiveSkillIds": ["pet_attack", "pet_defend"],
		"inheritedActiveSkillIds": [
			"pet_special_core",
			"pet_special_resonance_one",
		],
		"inheritedPassiveSkillId": "passive_core",
		"passiveSourceRoleId": "core",
		"numericSource": "target_profile_only_v1",
		"materialNumericInheritance": false,
		"rideable": false,
		"additionalCostPolicy": "materials_only",
		"resultBinding": "unbound",
		"tradeEligibility": "eligible_when_pet_trading_available",
		"message": "融合目标宠融合完成；三只材料宠已消耗，成品技能与独立成长已生成。",
	}


static func _catalog_errors(catalog, dependencies: Dictionary) -> Array[String]:
	return PetFusionRecipeCatalogModel.fixture_validation_errors(
		catalog,
		dependencies.get("petTemplates", {}),
		dependencies.get("growthProfiles", {}),
		dependencies.get("paidResetPolicy", {}),
		dependencies.get("battleActions", {}),
		dependencies.get("battlePassives", {}),
		dependencies.get("skillTraining", {})
	)


static func _load_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	return parsed as Dictionary if parsed is Dictionary else {}


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


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
