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
const PetFusionReleaseAttestationModel := preload(
	"res://scripts/progression/pet_fusion_release_attestation_model.gd"
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
	_expect(
		PetFusionClientModel.operation_id_must_be_retained(
			"storage_outcome_unknown"
		)
			and PetFusionClientModel.operation_id_must_be_retained(
				"network_retry_failed"
			)
			and not PetFusionClientModel.operation_id_must_be_retained(
				"revision_conflict"
			),
		"融合执行的幂等操作标识保留边界错误",
		errors
	)

	var enabled_catalog := production_catalog.duplicate(true)
	enabled_catalog["runtimeEnabled"] = true
	_expect(
		PetFusionRecipeCatalogModel.runtime_available(enabled_catalog),
		"仅用于合同检查的启用副本不可用",
		errors
	)
	var release_fixture := _release_attestation_fixture(enabled_catalog)
	var release_fixture_files := release_fixture.get("files", {}) as Dictionary
	var release_fixture_content := str(
		release_fixture.get("attestationContent", "")
	)
	var release_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			release_fixture_content,
			enabled_catalog,
			release_fixture_files
		)
	)
	var runtime_owner_identity_fixture := _release_attestation_fixture(
		enabled_catalog,
		"project-owner:attacker"
	)
	var runtime_owner_identity_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			str(runtime_owner_identity_fixture.get("attestationContent", "")),
			enabled_catalog,
			runtime_owner_identity_fixture.get("files", {}) as Dictionary
		)
	)
	var portrait_owner_identity_fixture := _release_attestation_fixture(
		enabled_catalog,
		PetFusionReleaseAttestationModel.TRUSTED_PROJECT_OWNER_ID,
		"project-owner:attacker"
	)
	var portrait_owner_identity_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			str(portrait_owner_identity_fixture.get("attestationContent", "")),
			enabled_catalog,
			portrait_owner_identity_fixture.get("files", {}) as Dictionary
		)
	)
	var approved_projection := PetFusionRecipeCatalogModel.production_document(
		enabled_catalog,
		release_errors
	)
	var missing_release_errors := (
		PetFusionReleaseAttestationModel.validation_errors(enabled_catalog)
	)
	var unattested_projection := PetFusionRecipeCatalogModel.production_document(
		enabled_catalog,
		missing_release_errors
	)
	var drifted_catalog := enabled_catalog.duplicate(true)
	var drifted_recipes := (
		(drifted_catalog.get("recipes", []) as Array).duplicate(true)
	)
	drifted_recipes.reverse()
	drifted_catalog["recipes"] = drifted_recipes
	var catalog_drift_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			release_fixture_content,
			drifted_catalog,
			release_fixture_files
		)
	)
	var owner_drift_files := release_fixture_files.duplicate(true)
	var owner_path := PetFusionReleaseAttestationModel.OWNER_DECISION_REPO_PATH
	var owner_document = JSON.parse_string(str(owner_drift_files.get(owner_path, "")))
	if owner_document is Dictionary:
		(owner_document as Dictionary)["runtimeEnabled"] = false
		owner_drift_files[owner_path] = _fixture_json(owner_document)
	var owner_drift_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			release_fixture_content,
			enabled_catalog,
			owner_drift_files
		)
	)
	var portrait_drift_files := release_fixture_files.duplicate(true)
	var first_contract := (
		PetFusionReleaseAttestationModel.FORM_CONTRACTS[0] as Dictionary
	)
	var portrait_path := str(first_contract.get("portraitMetadataPath", ""))
	var portrait_document = JSON.parse_string(
		str(portrait_drift_files.get(portrait_path, ""))
	)
	if portrait_document is Dictionary:
		(portrait_document as Dictionary)["releaseGate"] = false
		portrait_drift_files[portrait_path] = _fixture_json(portrait_document)
	var portrait_drift_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			release_fixture_content,
			enabled_catalog,
			portrait_drift_files
		)
	)
	var metadata_drift_files := release_fixture_files.duplicate(true)
	var metadata_path := str(first_contract.get("petMetadataPath", ""))
	var metadata_document = JSON.parse_string(
		str(metadata_drift_files.get(metadata_path, ""))
	)
	if metadata_document is Dictionary:
		(metadata_document as Dictionary)["runtimeEnabled"] = false
		metadata_drift_files[metadata_path] = _fixture_json(metadata_document)
	var metadata_drift_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			release_fixture_content,
			enabled_catalog,
			metadata_drift_files
		)
	)
	var evidence_document = JSON.parse_string(release_fixture_content)
	var evidence_drift_content := release_fixture_content
	if evidence_document is Dictionary:
		var evidence_rows := (
			(evidence_document as Dictionary).get("validationEvidence", []) as Array
		)
		if not evidence_rows.is_empty():
			var first_evidence := (evidence_rows[0] as Dictionary).duplicate(true)
			first_evidence["status"] = "failed"
			evidence_rows[0] = first_evidence
			(evidence_document as Dictionary)["validationEvidence"] = evidence_rows
			evidence_drift_content = _fixture_json(evidence_document)
	var evidence_drift_errors := (
		PetFusionReleaseAttestationModel.fixture_validation_errors(
			evidence_drift_content,
			enabled_catalog,
			release_fixture_files
		)
	)
	var release_gate_contract_ok := (
		release_errors.is_empty()
		and not runtime_owner_identity_errors.is_empty()
		and not portrait_owner_identity_errors.is_empty()
		and not missing_release_errors.is_empty()
		and PetFusionRecipeCatalogModel.runtime_available(approved_projection)
		and not PetFusionRecipeCatalogModel.runtime_available(
			unattested_projection
		)
		and str(unattested_projection.get("disabledMessage", ""))
			== PetFusionRecipeCatalogModel.RELEASE_GATE_CLOSED_MESSAGE
		and not catalog_drift_errors.is_empty()
		and not owner_drift_errors.is_empty()
		and not portrait_drift_errors.is_empty()
		and not metadata_drift_errors.is_empty()
		and not evidence_drift_errors.is_empty()
	)
	_expect(
		release_gate_contract_ok,
		(
			(
				"融合客户端发布证明未对目录、owner、画像、整包或证据漂移失败关闭："
				+ "fixture=%d runtimeIdentity=%d portraitIdentity=%d missing=%d "
				+ "catalog=%d owner=%d portrait=%d metadata=%d evidence=%d fixtureErrors=%s"
			)
			% [
				release_errors.size(),
				runtime_owner_identity_errors.size(),
				portrait_owner_identity_errors.size(),
				missing_release_errors.size(),
				catalog_drift_errors.size(),
				owner_drift_errors.size(),
				portrait_drift_errors.size(),
				metadata_drift_errors.size(),
				evidence_drift_errors.size(),
				str(release_errors),
			]
		),
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
			"uncertainOutcomeRetainsOperationId": (
				PetFusionClientModel.operation_id_must_be_retained(
					"storage_outcome_unknown"
				)
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
			"clientReleaseAttestationGate": release_gate_contract_ok,
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


static func _release_attestation_fixture(
	catalog_document: Dictionary,
	runtime_reviewer: String = PetFusionReleaseAttestationModel.TRUSTED_PROJECT_OWNER_ID,
	portrait_owner_id: String = PetFusionReleaseAttestationModel.TRUSTED_PROJECT_OWNER_ID
) -> Dictionary:
	var files := {}
	var catalog_reference := _put_fixture_json(
		files,
		PetFusionReleaseAttestationModel.CATALOG_REPO_PATH,
		catalog_document
	)
	var prior_forms: Array[Dictionary] = []
	for contract_value in PetFusionReleaseAttestationModel.FORM_CONTRACTS:
		var contract := contract_value as Dictionary
		prior_forms.append({
			"formId": str(contract.get("formId", "")),
			"battleBundleDigest": str(contract.get("battleBundleDigest", "")),
		})
	var prior_reference := _put_fixture_json(
		files,
		PetFusionReleaseAttestationModel.PRIOR_BODY_VISUAL_DECISION_REPO_PATH,
		{
			"schemaVersion": 1,
			"decisionType": (
				"beastbound_pet_fusion_full_nonrideable_visual_owner_decision"
			),
			"decisionId": (
				"pet_fusion_p1_4e_full_nonrideable_visual_20260730"
			),
			"decision": "approved",
			"approvedScopes": (
				PetFusionReleaseAttestationModel.PRIOR_APPROVED_SCOPES.duplicate()
			),
			"excludedScopes": (
				PetFusionReleaseAttestationModel.PRIOR_EXCLUDED_SCOPES.duplicate()
			),
			"evidence": {"forms": prior_forms},
			"releaseApproved": false,
			"runtimeEnabled": false,
		}
	)
	var fixed_test_sha := (
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	)
	var main_review_reference := _put_fixture_text(
		files,
		"docs/release_evidence/pet_fusion_main_owner_review_v1.json",
		"fixture main owner review"
	)
	var phase_record_reference := _put_fixture_text(
		files,
		"docs/phase_999_pet_fusion_runtime_release.md",
		"fixture P1.4 release phase"
	)
	var owner_reference := _put_fixture_json(
		files,
		PetFusionReleaseAttestationModel.OWNER_DECISION_REPO_PATH,
		{
			"schemaVersion": 1,
			"decisionType": PetFusionReleaseAttestationModel.OWNER_DECISION_TYPE,
			"decisionId": PetFusionReleaseAttestationModel.OWNER_DECISION_ID,
			"roadmapItem": "P1.4",
			"decision": "approved",
			"reviewer": runtime_reviewer,
			"recordedDecisionText": "批准首批融合正式开放。",
			"ownerReviewStatus": "approved",
			"releaseApproved": true,
			"runtimeEnabled": true,
			"playerEntryOpened": true,
			"approvedAtUtc": "2026-08-12T08:00:00Z",
			"catalogId": PetFusionReleaseAttestationModel.CATALOG_ID,
			"recipeIds": PetFusionReleaseAttestationModel.RECIPE_IDS.duplicate(),
			"targetFormIds": PetFusionReleaseAttestationModel.FORM_IDS.duplicate(),
			"nonRideableTargetFormIds": (
				PetFusionReleaseAttestationModel.FORM_IDS.duplicate()
			),
			"approvedScopes": (
				PetFusionReleaseAttestationModel.APPROVED_SCOPES.duplicate()
			),
			"evidence": {
				"mainOwnerReview": main_review_reference,
				"phaseRecord": phase_record_reference,
			},
		}
	)
	var portrait_references: Array[Dictionary] = []
	for contract_value in PetFusionReleaseAttestationModel.FORM_CONTRACTS:
		var contract := contract_value as Dictionary
		var form_id := str(contract.get("formId", ""))
		var runtime_path := str(contract.get("portraitRuntimePath", ""))
		var mask_path := runtime_path.replace(
			"/portrait/default.png",
			"/source/portrait/headshot-chroma-eligibility-mask.png"
		)
		var runtime_reference := _put_fixture_text(
			files,
			runtime_path,
			"%s:portrait" % form_id
		)
		var master_reference := _put_fixture_text(
			files,
			str(contract.get("portraitMasterPath", "")),
			"%s:master" % form_id
		)
		var ownership_reference := _put_fixture_text(
			files,
			str(contract.get("portraitOwnershipPath", "")),
			"%s:owner-reviewed-source-record" % form_id
		)
		var mask_reference := _put_fixture_text(
			files,
			mask_path,
			"%s:mask" % form_id
		)
		var portrait_evidence: Array[Dictionary] = [
			main_review_reference,
			phase_record_reference,
		]
		var portrait_decision_reference := _put_fixture_json(
			files,
			str(contract.get("portraitDecisionPath", "")),
			{
				"schemaVersion": 2,
				"decisionType": (
					PetFusionReleaseAttestationModel.PORTRAIT_OWNER_DECISION_TYPE
				),
				"ownerId": portrait_owner_id,
				"decision": "approved",
				"subject": {
					"kind": "shared_dedicated_headshot_v1",
					"formId": form_id,
					"petRoot": str(contract.get("petRoot", "")),
					"master": master_reference,
					"runtime": runtime_reference,
					"ownership": ownership_reference,
				},
				"acceptedEvidence": portrait_evidence,
				"reviewedAt": "2026-08-12T08:00:00Z",
			}
		)
		portrait_references.append(_put_fixture_json(
			files,
			str(contract.get("portraitMetadataPath", "")),
			{
				"schemaVersion": 1,
				"formId": form_id,
				"capability": "shared_dedicated_headshot_v1",
				"independentlyAuthoredClaim": true,
				"independentAuthorshipClaimTrust": "owner_verified",
				"semanticIndependenceVerified": true,
				"releaseGate": true,
				"fullBodyCropAllowed": false,
				"processing": {
					"alphaMatte": {
						"despill": {
							"scope": "same_operation_exact_eligibility_mask_only",
							"globalColorAdjustmentApplied": false,
							"changedOutsideEligibilityPixels": 0,
							"alphaPixelsChanged": 0,
						},
					},
				},
				"assets": {
					"runtime": runtime_reference,
					"eligibilityMask": {
						"path": str(mask_reference.get("path", "")),
						"sha256": str(mask_reference.get("sha256", "")),
						"nonzeroPixels": 42,
					},
				},
				"ownerReview": {
					"required": true,
					"status": "approved",
					"evidence": portrait_evidence,
					"decision": portrait_decision_reference,
				},
			}
		))
	var validation_evidence: Array[Dictionary] = []
	for kind in PetFusionReleaseAttestationModel.VALIDATION_KINDS:
		validation_evidence.append({
			"kind": kind,
			"status": "passed",
			"path": "docs/release_evidence/%s.json" % kind,
			"sha256": fixed_test_sha,
		})
	var attestation_document := {
		"schemaVersion": 1,
		"attestationType": PetFusionReleaseAttestationModel.ATTESTATION_TYPE,
		"attestationId": PetFusionReleaseAttestationModel.ATTESTATION_ID,
		"status": "approved",
		"ownerReviewStatus": "approved",
		"releaseApproved": true,
		"runtimeEnabled": true,
		"playerEntryOpened": true,
		"approvedAtUtc": "2026-08-12T08:00:00Z",
		"ownerDecision": owner_reference,
		"priorBodyVisualDecision": prior_reference,
		"catalog": catalog_reference,
		"recipeIds": PetFusionReleaseAttestationModel.RECIPE_IDS.duplicate(),
		"targetFormIds": PetFusionReleaseAttestationModel.FORM_IDS.duplicate(),
		"forms": [],
		"validationEvidence": validation_evidence,
		"expectedLifecycle": {
			"artStatus": "approved",
			"ownerReviewStatus": "approved",
			"releaseApproved": true,
			"runtimeEnabled": true,
			"playerEntryOpened": true,
			"resultRideable": false,
			"petWorldRuntimeEnabled": true,
			"petBattleRuntimeEnabled": true,
			"portraitSemanticIndependenceVerified": true,
			"portraitReleaseGate": true,
		},
	}
	var form_entries: Array[Dictionary] = []
	for index in range(PetFusionReleaseAttestationModel.FORM_CONTRACTS.size()):
		var contract := (
			PetFusionReleaseAttestationModel.FORM_CONTRACTS[index] as Dictionary
		)
		form_entries.append({
			"formId": str(contract.get("formId", "")),
			"petMetadataPath": str(contract.get("petMetadataPath", "")),
			"portraitMetadata": portrait_references[index],
			"battleBundleDigest": str(contract.get("battleBundleDigest", "")),
		})
	attestation_document["forms"] = form_entries
	var attestation_content := _fixture_json(attestation_document)
	var attestation_sha := attestation_content.sha256_text()
	for contract_value in PetFusionReleaseAttestationModel.FORM_CONTRACTS:
		var contract := contract_value as Dictionary
		var form_id := str(contract.get("formId", ""))
		_put_fixture_json(
			files,
			str(contract.get("petMetadataPath", "")),
			{
				"formId": form_id,
				"artStatus": "approved",
				"ownerReviewStatus": "approved",
				"runtimeEnabled": true,
				"releaseAttestation": {
					"path": PetFusionReleaseAttestationModel.REPO_DATA_PATH,
					"sha256": attestation_sha,
				},
				"riding": null,
				"worldVisual": {
					"status": "approved",
					"runtimeEnabled": true,
					"strategy": "independent_8",
					"runtimeMirroring": false,
					"runtimeMountedComposition": false,
					"totalFrameCount": 40,
					"directions": (
						PetFusionReleaseAttestationModel.WORLD_DIRECTIONS.duplicate()
					),
					"actions": {
						"idle": {"frameCount": 1, "fps": 4},
						"walk": {"frameCount": 4, "fps": 10},
					},
				},
				"battleVisual": {
					"status": "approved",
					"runtimeEnabled": true,
					"kind": "pet",
					"views": PetFusionReleaseAttestationModel.BATTLE_VIEWS.duplicate(),
					"totalFrameCount": 180,
					"runtimeMirroring": false,
					"integratedWholeFrame": false,
					"runtimeLayeredComposition": false,
					"bundleDigest": str(contract.get("battleBundleDigest", "")),
					"archiveMode": "full",
					"sourceFramesTracked": true,
				},
			}
		)
	return {
		"files": files,
		"attestationContent": attestation_content,
	}


static func _put_fixture_json(
	files: Dictionary,
	path: String,
	value
) -> Dictionary:
	return _put_fixture_text(files, path, _fixture_json(value))


static func _put_fixture_text(
	files: Dictionary,
	path: String,
	content: String
) -> Dictionary:
	files[path] = content
	return {"path": path, "sha256": content.sha256_text()}


static func _fixture_json(value) -> String:
	return JSON.stringify(value, "\t", true) + "\n"


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
