extends RefCounted

const BalanceCatalogModel := preload(
	"res://scripts/progression/balance_catalog_model.gd"
)
const PetFusionClientModel := preload(
	"res://scripts/progression/pet_fusion_client_model.gd"
)
const PetFusionOutcomeModel := preload(
	"res://scripts/progression/pet_fusion_outcome_model.gd"
)
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)


static func run() -> Dictionary:
	var errors: Array[String] = []
	var cases := 0
	BalanceCatalogModel.reload()
	var catalog := BalanceCatalogModel.pet_fusion_recipes().duplicate(true)
	catalog["runtimeEnabled"] = true
	var success_result := _success_result_fixture(catalog)
	var success := PetFusionOutcomeModel.success_view(success_result, catalog)
	cases += 1
	_expect(
		str(success.get("kind", "")) == PetFusionOutcomeModel.KIND_SUCCESS
			and str(success.get("nameText", "")) == "曜冠角兽"
			and str(success.get("levelText", "")) == "一转 Lv1"
			and str(success.get("activeText", "")).contains("攻击")
			and str(success.get("activeText", "")).contains("防御")
			and str(success.get("passiveText", "")).contains("被动技能")
			and str(success.get("bindingText", "")).contains("未绑定")
			and str(success.get("terminalText", "")).contains("不可骑乘")
			and str(success.get("consumptionText", "")).contains("已永久消耗")
			and str(success.get("action", ""))
				== PetFusionOutcomeModel.ACTION_VIEW_PET,
		"严格成功结果没有形成完整玩家结果卡",
		errors
	)

	var tampered := success_result.duplicate(true)
	tampered["rideable"] = true
	cases += 1
	_expect(
		PetFusionOutcomeModel.success_view(tampered, catalog).is_empty(),
		"可骑或非严格服务器结果错误进入成功结果页",
		errors
	)

	var failure := PetFusionOutcomeModel.definitive_failure_view(
		"角色档案已经变化，请刷新三只材料宠和融合条件后重试。",
		PetFusionOutcomeModel.ACTION_REQUOTE
	)
	cases += 1
	_expect(
		str(failure.get("kind", "")) == PetFusionOutcomeModel.KIND_FAILURE
			and str(failure.get("consumptionText", "")).contains("没有消耗")
			and str(failure.get("actionText", "")) == "重新获取报价"
			and not JSON.stringify(failure).contains("revision_conflict"),
		"明确失败结果没有给出零消耗与安全恢复",
		errors
	)

	var raw_failure := PetFusionOutcomeModel.definitive_failure_view(
		"revision_conflict",
		PetFusionOutcomeModel.ACTION_RESELECT
	)
	cases += 1
	_expect(
		not JSON.stringify(raw_failure).contains("revision_conflict")
			and str(raw_failure.get("detailText", "")).contains("重新核对"),
		"raw code 可泄露到失败结果页",
		errors
	)

	var pending := PetFusionOutcomeModel.uncertain_result_view(
		"网络不稳定，已重试，请稍后再试。"
	)
	cases += 1
	_expect(
		str(pending.get("kind", "")) == PetFusionOutcomeModel.KIND_PENDING
			and str(pending.get("consumptionText", "")).contains("不能判断")
			and not str(pending.get("consumptionText", "")).contains("没有消耗")
			and str(pending.get("action", ""))
				== PetFusionOutcomeModel.ACTION_RETRY_OPERATION,
		"未知结果错误冒充零消耗失败或不能安全核对",
		errors
	)

	var request_pending := PetFusionOutcomeModel.request_pending_view()
	cases += 1
	_expect(
		str(request_pending.get("kind", "")) == PetFusionOutcomeModel.KIND_PENDING
			and str(request_pending.get("action", "")) == ""
			and str(request_pending.get("actionText", "")).contains("确认中"),
		"执行中结果没有无动作锁定态",
		errors
	)

	var sync_pending := PetFusionOutcomeModel.profile_sync_pending_view()
	cases += 1
	_expect(
		str(sync_pending.get("action", ""))
			== PetFusionOutcomeModel.ACTION_REFRESH_PROFILE
			and str(sync_pending.get("statusText", "")).contains("尚未同步"),
		"服务器成功但档案未应用时错误展示成功",
		errors
	)

	cases += 1
	_expect(
		PetFusionClientModel.definitive_failure_guarantees_no_consumption(
			"revision_conflict"
		)
			and not PetFusionClientModel.definitive_failure_guarantees_no_consumption(
				"bad_json"
			)
			and PetFusionClientModel.operation_id_must_be_retained("bad_json")
			and PetFusionClientModel.operation_id_must_be_retained("server_error"),
		"明确零消耗与未知结果的幂等边界错误",
		errors
	)

	return {
		"ok": errors.is_empty(),
		"cases": cases,
		"errors": errors,
	}


static func _success_result_fixture(catalog: Dictionary) -> Dictionary:
	var material_specs := [
		["core", "outcome_core", "emberhorn_red_fire8_earth2", "赤角兽"],
		[
			"resonance_one",
			"outcome_resonance_one",
			"emberhorn_gale_fire5_wind5",
			"岚角兽",
		],
		[
			"resonance_two",
			"outcome_resonance_two",
			"emberhorn_ash_fire6_wind4",
			"灰烬角兽",
		],
	]
	var consumed: Array[Dictionary] = []
	var inherited_active_ids: Array[String] = []
	for spec_value in material_specs:
		var spec := spec_value as Array
		var form_id := str(spec[2])
		var gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
			catalog,
			form_id
		)
		consumed.append({
			"roleId": str(spec[0]),
			"instanceId": str(spec[1]),
			"formId": form_id,
			"formName": str(spec[3]),
		})
		inherited_active_ids.append(str(gene.get("specialActiveSkillId", "")))
	var core_gene := PetFusionRecipeCatalogModel.gene_profile_by_form_id(
		catalog,
		"emberhorn_red_fire8_earth2"
	)
	return {
		"schemaVersion": 1,
		"catalogId": PetFusionRecipeCatalogModel.CATALOG_ID,
		"recipeId": "emberhorn_solar_crown_fusion_v1",
		"resultInstanceId": "outcome_result_pet",
		"targetFormId": "emberhorn_fusion_solar_crown_fire7_wind3",
		"targetFormName": "曜冠角兽",
		"level": 1,
		"rebirthCount": 1,
		"terminalStage": 2,
		"consumedMaterials": consumed,
		"baseActiveSkillIds": ["pet_attack", "pet_defend"],
		"inheritedActiveSkillIds": inherited_active_ids,
		"inheritedPassiveSkillId": str(core_gene.get("passiveSkillId", "")),
		"passiveSourceRoleId": "core",
		"numericSource": "target_profile_only_v1",
		"materialNumericInheritance": false,
		"rideable": false,
		"additionalCostPolicy": "materials_only",
		"resultBinding": PetFusionClientModel.RESULT_BINDING_UNBOUND,
		"tradeEligibility": (
			PetFusionRecipeCatalogModel.UNBOUND_RESULT_TRADE_POLICY
		),
		"message": "曜冠角兽融合完成；三只材料宠已消耗，成品技能与独立成长已生成。",
	}


static func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
