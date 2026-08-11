extends SceneTree

const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const PetFusionClientModel := preload(
	"res://scripts/progression/pet_fusion_client_model.gd"
)
const PetFusionPresentationModel := preload(
	"res://scripts/progression/pet_fusion_presentation_model.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetFusionSelectionModel := preload(
	"res://scripts/progression/pet_fusion_selection_model.gd"
)


func _initialize() -> void:
	var errors: Array[String] = []
	BalanceCatalogModel.reload()
	var production_catalog := BalanceCatalogModel.pet_fusion_recipes()
	var production_recipes = production_catalog.get("recipes", [])
	_expect(
		production_catalog.get("runtimeEnabled", true) == false
			and str(production_catalog.get("disabledMessage", ""))
				== PetFusionSelectionModel.CLOSED_MESSAGE
			and production_recipes is Array
			and (production_recipes as Array).size() == 2,
		"生产目录必须保持精确关闭文案、两条正式配方且 runtime 关闭",
		errors
	)

	var closed_availability := PetFusionSelectionModel.availability(
		production_catalog
	)
	var closed_selection := PetFusionSelectionModel.selection_state(
		{},
		production_catalog
	)
	var closed_view := PetFusionPresentationModel.availability_view(
		production_catalog
	)
	var closed_request_payload := PetFusionClientModel.request_payload(
		"emberhorn_moss_rampart_fusion_v1",
		{
			"core": "closed_core",
			"resonance_one": "closed_resonance_one",
			"resonance_two": "closed_resonance_two",
		},
		production_catalog
	)
	_expect(
		not bool(closed_availability.get("available", true))
			and not bool(closed_availability.get("canSelect", true))
			and not bool(closed_availability.get("canRequestQuote", true))
			and str(closed_availability.get("messageText", ""))
				== PetFusionSelectionModel.CLOSED_MESSAGE
			and not bool(closed_selection.get("readyForQuoteHint", true))
			and (closed_selection.get("materialInstanceIds", {}) as Dictionary).is_empty()
			and str(closed_selection.get("messageText", ""))
				== PetFusionSelectionModel.CLOSED_MESSAGE
			and not bool(closed_view.get("canSelect", true))
			and not bool(closed_view.get("canRequestQuote", true))
			and (closed_view.get("actions", []) as Array).is_empty()
			and str(closed_view.get("messageText", ""))
				== PetFusionSelectionModel.CLOSED_MESSAGE
			and closed_request_payload.is_empty(),
		"关闭态没有同时做到精确中文、禁选、无报价动作和空请求载荷",
		errors
	)

	var selection_source := _read_text(
		"res://scripts/progression/pet_fusion_selection_model.gd"
	)
	var presentation_source := _read_text(
		"res://scripts/progression/pet_fusion_presentation_model.gd"
	)
	var no_network_dependency := true
	for marker in [
		"ServerAuthClientModel",
		"HTTPClient",
		"HTTPRequest",
		"pet_fusion_quote_request",
		"pet_fusion_request",
	]:
		if selection_source.find(marker) >= 0 or presentation_source.find(marker) >= 0:
			no_network_dependency = false
			break
	_expect(
		no_network_dependency,
		"独立选择/展示领域层意外依赖网络请求实现",
		errors
	)

	var enabled_catalog := production_catalog.duplicate(true)
	enabled_catalog["runtimeEnabled"] = true
	_expect(
		PetFusionRecipeCatalogModel.runtime_available(enabled_catalog),
		"仅用于合同检查的启用副本不可用",
		errors
	)

	var core := _material_instance(
		enabled_catalog,
		"contract_core_emberhorn",
		"emberhorn_red_fire8_earth2",
		"赤角兽",
		131
	)
	var resonance_one := _material_instance(
		enabled_catalog,
		"contract_resonance_moss",
		"mossback_marsh_earth7_water3",
		"湿地苔背兽",
		140
	)
	var resonance_two := _material_instance(
		enabled_catalog,
		"contract_resonance_emberhorn",
		"emberhorn_ash_fire6_wind4",
		"灰烬角兽",
		137
	)
	var selections := {
		"core": core,
		"resonance_one": resonance_one,
		"resonance_two": resonance_two,
	}

	var core_hint := PetFusionSelectionModel.candidate_hint(
		core,
		"core",
		{},
		enabled_catalog
	)
	var resonance_one_hint := PetFusionSelectionModel.candidate_hint(
		resonance_one,
		"resonance_one",
		{"core": core},
		enabled_catalog
	)
	var resonance_two_hint := PetFusionSelectionModel.candidate_hint(
		resonance_two,
		"resonance_two",
		{"core": core, "resonance_one": resonance_one},
		enabled_catalog
	)
	var selection := PetFusionSelectionModel.selection_state(
		selections,
		enabled_catalog
	)
	var selection_view := PetFusionPresentationModel.selection_view(selection)
	var selection_view_text := JSON.stringify(selection_view)
	_expect(
		bool(core_hint.get("eligible", false))
			and bool(resonance_one_hint.get("eligible", false))
			and bool(resonance_two_hint.get("eligible", false))
			and bool(selection.get("readyForQuoteHint", false))
			and str(selection.get("resolvedRecipeId", ""))
				== "emberhorn_moss_rampart_fusion_v1"
			and selection.get("matchingRecipeIds", []) == [
				"emberhorn_moss_rampart_fusion_v1",
			]
			and selection.get("materialInstanceIds", {}) == {
				"core": "contract_core_emberhorn",
				"resonance_one": "contract_resonance_moss",
				"resonance_two": "contract_resonance_emberhorn",
			}
			and str(selection.get("messageText", ""))
				== PetFusionSelectionModel.READY_MESSAGE
			and bool(selection.get("localHintOnly", false))
			and bool(selection.get("serverFinalAuthority", false))
			and bool(selection_view.get("canRequestQuote", false))
			and selection_view_text.find("最终资格与结果由服务器确认") >= 0
			and selection_view_text.find("contract_core_emberhorn") < 0
			and selection_view_text.find("emberhorn_moss_rampart_fusion_v1") < 0,
		"合法三宠组合没有解析为苔垒路线，或本地提示越过服务器最终权威",
		errors
	)

	var solar_resonance_one := _material_instance(
		enabled_catalog,
		"contract_resonance_emberhorn_one",
		"emberhorn_gale_fire5_wind5",
		"岚角兽",
		139
	)
	var solar_selection := PetFusionSelectionModel.selection_state(
		{
			"core": core,
			"resonance_one": solar_resonance_one,
			"resonance_two": resonance_two,
		},
		enabled_catalog
	)
	_expect(
		bool(solar_selection.get("readyForQuoteHint", false))
			and str(solar_selection.get("resolvedRecipeId", ""))
				== "emberhorn_solar_crown_fusion_v1",
		"同族共鸣一没有解析为曜冠路线",
		errors
	)

	var wrong_role_hint := PetFusionSelectionModel.candidate_hint(
		resonance_one,
		"core",
		{},
		enabled_catalog
	)
	var duplicate_selection := selections.duplicate(true)
	duplicate_selection["resonance_two"] = core
	var duplicate_state := PetFusionSelectionModel.selection_state(
		duplicate_selection,
		enabled_catalog
	)
	_expect(
		not bool(wrong_role_hint.get("eligible", true))
			and str(wrong_role_hint.get("reasonText", "")).find("血脉要求") >= 0
			and not bool(duplicate_state.get("readyForQuoteHint", true))
			and str(duplicate_state.get("messageText", "")).find("三只不同") >= 0,
		"血脉位置或三只不重复规则没有在本地提示层失败关闭",
		errors
	)

	var level_low := core.duplicate(true)
	_set_material_level(level_low, 130)
	var level_high := core.duplicate(true)
	_set_material_level(level_high, 141)
	var rebirth_zero := core.duplicate(true)
	(rebirth_zero.get("petCultivation", {}) as Dictionary)["rebirthCount"] = 0
	var rebirth_two := core.duplicate(true)
	(rebirth_two.get("petCultivation", {}) as Dictionary)["rebirthCount"] = 2
	var helper := core.duplicate(true)
	helper["petRebirthHelper"] = {"schemaVersion": 1, "stage": 1}
	var terminal := core.duplicate(true)
	terminal["fusionLineage"] = {}
	var legacy_growth := core.duplicate(true)
	legacy_growth["growthModelVersion"] = "legacy_individual_v0"
	var wrong_growth_profile := core.duplicate(true)
	wrong_growth_profile["growthSpeciesProfileId"] = "wrong_profile"
	var invalid_cases := [
		[level_low, "Lv131-140"],
		[level_high, "Lv131-140"],
		[rebirth_zero, "恰好完成一转"],
		[rebirth_two, "终局"],
		[helper, "转生MM"],
		[terminal, "终局"],
		[legacy_growth, "成长资料"],
		[wrong_growth_profile, "成长资料"],
	]
	for invalid_case in invalid_cases:
		var invalid_hint := PetFusionSelectionModel.candidate_hint(
			invalid_case[0] as Dictionary,
			"core",
			{},
			enabled_catalog
		)
		_expect(
			not bool(invalid_hint.get("eligible", true))
				and str(invalid_hint.get("reasonText", "")).find(
					str(invalid_case[1])
				) >= 0,
			"无效材料未被拒绝：%s" % str(invalid_case[1]),
			errors
		)

	var quote := _quote_fixture(enabled_catalog, selections)
	var enabled_quote_fingerprint := (
		PetFusionPresentationModel.confirmation_fingerprint(
			quote,
			enabled_catalog
		)
	)
	var closed_stale_quote_view := PetFusionPresentationModel.quote_view(
		quote,
		production_catalog
	)
	var closed_stale_confirmation := (
		PetFusionPresentationModel.confirmation_view(
			quote,
			production_catalog,
			enabled_quote_fingerprint
		)
	)
	var closed_stale_fingerprint := (
		PetFusionPresentationModel.confirmation_fingerprint(
			quote,
			production_catalog
		)
	)
	_expect(
		enabled_quote_fingerprint.length() == 64
			and closed_stale_quote_view.is_empty()
			and closed_stale_confirmation.is_empty()
			and closed_stale_fingerprint == "",
		"生产目录关闭后，旧有效报价仍可展示、生成指纹或武装双确认",
		errors
	)
	var normalized_quote := PetFusionClientModel.normalized_quote(
		quote,
		enabled_catalog
	)
	var quote_view := PetFusionPresentationModel.quote_view(
		quote,
		enabled_catalog
	)
	var quote_view_text := JSON.stringify(quote_view)
	var unbound_quote := quote.duplicate(true)
	var unbound_result := (
		unbound_quote.get("result", {}) as Dictionary
	).duplicate(true)
	unbound_result["resultBinding"] = "unbound"
	unbound_result["tradeEligibility"] = (
		PetFusionRecipeCatalogModel.UNBOUND_RESULT_TRADE_POLICY
	)
	unbound_quote["result"] = unbound_result
	var unbound_view_text := JSON.stringify(
		PetFusionPresentationModel.quote_view(
			unbound_quote,
			enabled_catalog
		)
	)
	_expect(
		not normalized_quote.is_empty()
			and not quote_view.is_empty()
			and quote_view.get("baseSkillTexts", []) == ["攻击", "防御"]
			and (quote_view.get("specialActiveRows", []) as Array).size() == 3
			and quote_view_text.count("50%") == 3
			and quote_view_text.find("赤角重冲") >= 0
			and quote_view_text.find("湿甲稳压") >= 0
			and quote_view_text.find("灰烬追角") >= 0
			and quote_view_text.find("灼心") >= 0
			and quote_view_text.find("沼生甲") >= 0
			and quote_view_text.find("烬息") >= 0
			and quote_view_text.find("主宠40% / 共鸣宠Ⅰ30% / 共鸣宠Ⅱ30%") >= 0
			and quote_view_text.find("最终只保留1个被动") >= 0
			and quote_view_text.find("数值不会继承") >= 0
			and quote_view_text.find("任一材料已绑定，成品将绑定") >= 0
			and quote_view_text.find("不额外消耗石币、钻石或道具") >= 0
			and quote_view_text.find("不可骑乘") >= 0
			and quote_view_text.find("2转/进化/融合") >= 0
			and quote_view_text.find("不能付费重置") >= 0,
		"融合报价没有完整展示固定技能、遗传概率、独立数值、绑定、成本与终局规则",
		errors
	)
	_expect(
		unbound_view_text.find(
			"三只材料均未绑定，成品保持未绑定"
		) >= 0
			and unbound_view_text.find(
				"宠物交易开放后可按规则交易"
			) >= 0,
		"全未绑定材料的成品绑定与未来交易资格没有正确展示",
		errors
	)

	var raw_tokens := [
		"emberhorn_moss_rampart_fusion_v1",
		"emberhorn_fusion_moss_rampart_fire4_earth6",
		"contract_core_emberhorn",
		"contract_resonance_moss",
		"contract_resonance_emberhorn",
		"pet_gene_emberhorn_red_heavy_charge",
		"pet_gene_mossback_marsh_sure_crush",
		"emberhorn_red_burning_mind",
	]
	var no_raw_player_text := true
	for raw_token in raw_tokens:
		if (
			quote_view_text.find(raw_token) >= 0
			or selection_view_text.find(raw_token) >= 0
		):
			no_raw_player_text = false
			break
	_expect(
		no_raw_player_text
			and quote_view_text.find("QA") < 0
			and quote_view_text.find("skillLevel") < 0
			and quote_view_text.find("技能等级") < 0,
		"玩家展示泄露 raw ID/QA 字段，或提前决定了技能等级继承",
		errors
	)

	var fingerprint := PetFusionPresentationModel.confirmation_fingerprint(
		quote,
		enabled_catalog
	)
	var first_confirmation := PetFusionPresentationModel.confirmation_view(
		quote,
		enabled_catalog
	)
	var armed_confirmation := PetFusionPresentationModel.confirmation_view(
		quote,
		enabled_catalog,
		fingerprint
	)
	var changed_quote := quote.duplicate(true)
	changed_quote["profileRevision"] = int(quote.get("profileRevision", 0)) + 1
	var changed_fingerprint := PetFusionPresentationModel.confirmation_fingerprint(
		changed_quote,
		enabled_catalog
	)
	var stale_confirmation := PetFusionPresentationModel.confirmation_view(
		changed_quote,
		enabled_catalog,
		fingerprint
	)
	_expect(
		fingerprint.length() == 64
			and fingerprint == PetFusionPresentationModel.confirmation_fingerprint(
				quote,
				enabled_catalog
			)
			and fingerprint != changed_fingerprint
			and not bool(first_confirmation.get("confirmationArmed", true))
			and bool(armed_confirmation.get("confirmationArmed", false))
			and not bool(stale_confirmation.get("confirmationArmed", true))
			and str(first_confirmation.get("buttonText", ""))
				== "查看不可逆确认"
			and str(armed_confirmation.get("buttonText", "")) == "确认融合",
		"报价指纹或两段确认没有在 revision/材料/技能事实变化时解除确认",
		errors
	)

	_expect(
		selection_source.find("skillLevel") < 0
			and presentation_source.find("skillLevel") < 0
			and selection_source.find("skillLevels") < 0
			and presentation_source.find("skillLevels") < 0,
		"本切片提前引入了尚未决定的技能等级继承规则",
		errors
	)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.pet_fusion_client_domain_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"checks": {
			"productionClosedExact": (
				not bool(closed_availability.get("available", true))
				and str(closed_view.get("messageText", ""))
					== PetFusionSelectionModel.CLOSED_MESSAGE
			),
			"closedZeroRequest": (
				closed_request_payload.is_empty()
				and no_network_dependency
			),
			"closedStaleQuoteRejected": (
				closed_stale_quote_view.is_empty()
				and closed_stale_confirmation.is_empty()
				and closed_stale_fingerprint == ""
			),
			"localEligibility": bool(selection.get("readyForQuoteHint", false)),
			"serverFinalAuthority": bool(
				selection.get("serverFinalAuthority", false)
			),
			"routeResolution": str(selection.get("resolvedRecipeId", "")),
			"quotePresentation": not quote_view.is_empty(),
			"doubleConfirmation": bool(
				armed_confirmation.get("confirmationArmed", false)
			),
			"playerTextClean": no_raw_player_text,
			"skillLevelRuleDeferred": (
				presentation_source.find("skillLevel") < 0
			),
		},
		"errors": errors,
	}
	print("pet fusion client domain check: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


static func _material_instance(
	catalog_document,
	instance_id: String,
	form_id: String,
	form_name: String,
	level: int
) -> Dictionary:
	var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
		catalog_document,
		form_id
	)
	var growth_profile_id := str(gene.get("growthProfileId", ""))
	return {
		"instanceId": instance_id,
		"formId": form_id,
		"name": form_name,
		"level": level,
		"growthModelVersion": PetFusionRecipeCatalogModel.AUTHORITY_MODEL,
		"growthSpeciesProfileId": growth_profile_id,
		"petCultivation": {"rebirthCount": 1},
		"petGrowth": {
			"schemaVersion": 1,
			"modelVersion": PetFusionRecipeCatalogModel.AUTHORITY_MODEL,
			"profileId": growth_profile_id,
			"settledLevel": level,
			"public": {
				"schemaVersion": 1,
				"growthModelVersion": PetFusionRecipeCatalogModel.AUTHORITY_MODEL,
				"growthSpeciesProfileId": growth_profile_id,
				"level": level,
			},
		},
	}


static func _set_material_level(instance: Dictionary, level: int) -> void:
	instance["level"] = level
	var growth := instance.get("petGrowth", {}) as Dictionary
	growth["settledLevel"] = level
	var public_growth := growth.get("public", {}) as Dictionary
	public_growth["level"] = level
	growth["public"] = public_growth
	instance["petGrowth"] = growth


static func _quote_fixture(
	catalog_document,
	selections: Dictionary
) -> Dictionary:
	var materials: Array[Dictionary] = []
	for role_id in PetFusionRecipeCatalogModel.ROLE_IDS:
		var instance := selections.get(role_id, {}) as Dictionary
		var form_id := str(instance.get("formId", ""))
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			catalog_document,
			form_id
		)
		materials.append({
			"roleId": role_id,
			"instanceId": str(instance.get("instanceId", "")),
			"formId": form_id,
			"formName": str(instance.get("name", "宠物")),
			"level": int(instance.get("level", 0)),
			"rebirthCount": int(
				(instance.get("petCultivation", {}) as Dictionary).get(
					"rebirthCount",
					0
				)
			),
			"specialActiveSkillId": str(
				gene.get("specialActiveSkillId", "")
			),
			"passiveSkillId": str(gene.get("passiveSkillId", "")),
		})
	return {
		"schemaVersion": 1,
		"catalogId": PetFusionRecipeCatalogModel.CATALOG_ID,
		"recipeId": "emberhorn_moss_rampart_fusion_v1",
		"profileRevision": 19,
		"materials": materials,
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
			"targetFormId": "emberhorn_fusion_moss_rampart_fire4_earth6",
			"targetFormName": "苔垒角兽",
			"level": 1,
			"rebirthCount": 1,
			"terminalStage": 2,
			"terminalStageLabel": "2转/进化/融合",
			"numericSource": "target_profile_only_v1",
			"materialNumericInheritance": false,
			"rideable": false,
			"additionalCostPolicy": "materials_only",
			"resultBinding": "bound",
			"tradeEligibility": "not_eligible",
		},
	}


static func _read_text(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	return file.get_as_text()


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
