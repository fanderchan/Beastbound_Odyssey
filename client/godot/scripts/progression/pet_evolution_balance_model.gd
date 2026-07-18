extends RefCounted

const THRESHOLD_KEYS: Array[String] = ["min", "p25", "p55", "p85", "p95", "max"]
const ATTEMPT_SOURCES: Array[String] = [
	"repeatable_floor_boss_personal_reward",
	"repeatable_lineage_material",
	"stone_coin_sink",
]
const PRESERVE_IDS: Array[String] = [
	"instance_identity",
	"owner_and_capture_history",
	"name",
	"source_stage_zero_and_one_public_history",
	"stage_one_rebirth_bonus_and_history",
	"enhancement",
	"active_passive_learned_inherited_skills",
	"paid_reset_history",
	"lock_and_binding_state",
	"form_lineage_history",
]
const CLEAR_IDS: Array[String] = [
	"level_and_exp",
	"current_hp",
	"growth_observation",
	"pending_rebirth_preview",
	"source_private_growth_identity",
]


static func validation_errors(document, rebirth_document) -> Array[String]:
	var errors: Array[String] = []
	if not (document is Dictionary):
		return ["pet_evolution_balance.json 缺失或不是 JSON 对象"]
	if not (rebirth_document is Dictionary):
		return ["pet_evolution_balance 缺少有效的二转基准"]
	var data := document as Dictionary
	var rebirth := rebirth_document as Dictionary
	if int(data.get("schemaVersion", 0)) != 1:
		errors.append("pet_evolution_balance.schemaVersion 当前必须为1")
	if str(data.get("balanceVersion", "")) != "pet_evolution_balance_v2":
		errors.append("pet_evolution_balance.balanceVersion 当前必须为pet_evolution_balance_v2")

	var reference := _dict(data.get("reference", {}))
	var rebirth_evaluation := _dict(rebirth.get("evaluation", {}))
	if str(reference.get("rebirthBalanceVersion", "")) != str(rebirth.get("balanceVersion", "")):
		errors.append("pet_evolution_balance 必须引用当前二转平衡版本")
	if str(reference.get("rebirthEvaluationVersion", "")) != str(rebirth_evaluation.get("evaluationVersion", "")):
		errors.append("pet_evolution_balance 必须引用当前二转评价版本")
	if str(reference.get("baselinePath", "")) != "normal_second_rebirth_full_preparation":
		errors.append("pet_evolution_balance.reference.baselinePath 无效")

	var eligibility := _dict(data.get("eligibility", {}))
	var rebirth_target := _dict(rebirth.get("target", {}))
	if int(eligibility.get("requiredRebirthCount", 0)) != 1:
		errors.append("进化目标必须恰好一转")
	if int(eligibility.get("requiredLevel", 0)) != int(rebirth_target.get("fullPreparationLevel", 0)):
		errors.append("进化目标必须达到二转满准备等级")
	if str(eligibility.get("requiredGrowthModelVersion", "")) != "pet_growth_authority_v1":
		errors.append("进化只允许 authority-v1 成长宠")
	if int(eligibility.get("requiredIntrinsicPowerPercentile", 0)) != 90:
		errors.append("进化源宠必须达到同形态一转Lv140战力P90")
	if str(eligibility.get("intrinsicPowerFormula", "")) != "round(maxHp*0.25+attack+defense+quick)":
		errors.append("进化源宠战力公式无效")
	if str(eligibility.get("thresholdScope", "")) != "same_source_form_stage_one_lv140":
		errors.append("进化源宠战力门槛范围无效")
	if str(eligibility.get("licenseScope", "")) != "line":
		errors.append("进化资格当前必须按族系解锁")
	if str(eligibility.get("licenseSource", "")) != "one_time_quest_unlock_only":
		errors.append("进化资格必须来自一次性解锁任务")
	if eligibility.get("licenseDirectResult", null) != false:
		errors.append("进化资格任务不能直接发放进化成品")

	var acquisition := _dict(data.get("acquisition", {}))
	_validate_exact_string_array(acquisition.get("perAttemptSources", []), ATTEMPT_SOURCES, "进化每次来源", errors)
	if acquisition.get("requiresTeamPve", null) != true:
		errors.append("进化每次成本必须包含团队PVE")
	if acquisition.get("requirementsConfigurableByRoute", null) != true:
		errors.append("进化材料必须允许按路线配置")
	if acquisition.get("realMoneySkipAllowed", null) != false:
		errors.append("充值不能绕过进化资格任务")
	if str(acquisition.get("paymentCurrencyId", "")) != "stoneCoins":
		errors.append("进化基础货币回收当前必须使用石币")
	if str(acquisition.get("paymentWalletPolicyId", "")) != "bound_first_split":
		errors.append("进化石币当前必须绑定优先扣除")

	var effort := _dict(data.get("effortModel", {}))
	if str(effort.get("unit", "")) != "normalized_nonpayer_effort":
		errors.append("进化难度必须使用非付费归一投入")
	var normal_total := _effort_total(
		effort.get("normalSecondRebirth", {}),
		["targetTraining", "helperAcquisition", "helperTraining", "helperStones"],
		"普通二转投入",
		errors
	)
	var evolution_block := _dict(effort.get("evolutionRepeatable", {}))
	var evolution_total := _effort_total(
		evolution_block,
		["targetTraining", "floorBossCore", "lineageMaterials", "currencySink"],
		"重复进化投入",
		errors
	)
	var first_unlock := _dict(effort.get("firstUnlock", {}))
	if float(first_unlock.get("licenseQuest", 0.0)) <= 0.0:
		errors.append("首次进化必须有资格任务投入")
	if first_unlock.get("excludedFromRepeatableRatio", null) != true:
		errors.append("一次性资格任务不能伪装成每次进化成本")
	var target_ratio := _dict(effort.get("repeatableTargetRatio", {}))
	var ratio_min := float(target_ratio.get("min", 0.0))
	var ratio_max := float(target_ratio.get("max", 0.0))
	var actual_ratio := evolution_total / normal_total if normal_total > 0.0 else 0.0
	if ratio_min < 1.5 or ratio_max > 2.0 or ratio_max < ratio_min:
		errors.append("进化目标难度必须保持在普通二转的1.5到2.0倍")
	if actual_ratio < ratio_min - 0.000001 or actual_ratio > ratio_max + 0.000001:
		errors.append("重复进化实际投入不在批准难度区间")
	if float(evolution_block.get("floorBossCore", 0.0)) <= 0.0 or float(evolution_block.get("lineageMaterials", 0.0)) <= 0.0:
		errors.append("重复进化必须同时包含刷楼核心和族系材料")

	var terminal := _dict(data.get("terminalPath", {}))
	if str(terminal.get("pathId", "")) != "evolution_terminal_v1":
		errors.append("进化终局路径版本无效")
	if int(terminal.get("resultLevel", 0)) != 1 or int(terminal.get("resultRebirthCount", 0)) != 1:
		errors.append("进化结果必须是Lv1一转终局形态")
	if terminal.get("normalSecondRebirthAllowed", null) != false or terminal.get("fusionMaterialAllowed", null) != false:
		errors.append("进化终局不能叠加普通二转或作为融合材料")
	if not is_equal_approx(float(terminal.get("successRate", 0.0)), 1.0) or terminal.get("failureConsumes", null) != false:
		errors.append("进化必须100%成功且失败零消耗")
	if str(terminal.get("formTransition", "")) != "replace_form_preserve_instance":
		errors.append("进化必须换形态但保留宠物实例")

	var quality := _dict(data.get("qualityProjection", {}))
	if str(quality.get("lv1FourV", "")) != "fresh_target_species_roll_v1":
		errors.append("进化Lv1 4V必须按二代物种重新抽取")
	if str(quality.get("hiddenGrowth", "")) != "fresh_target_species_roll_v1":
		errors.append("进化隐藏成长必须按二代物种重新抽取")
	if quality.get("preserveIndependentDimensions", null) != true or quality.get("rerollAllowed", null) != true or quality.get("sourceQualityTransfer", null) != false or quality.get("preserveSourceStageSnapshots", null) != true or quality.get("publicCombinedScore", null) != false:
		errors.append("进化必须重抽独立品质、只保留源宠公开阶段履历且不泄露总分")

	var power := _dict(data.get("powerBudget", {}))
	if power.get("preserveStageOneRebirthBonus", null) != true:
		errors.append("进化必须保留一转结果")
	if str(power.get("evolvedIntrinsicUpliftReference", "")) != "normal_second_rebirth_stage_2":
		errors.append("进化形态成长增量必须参考普通二转第二阶段")
	var intrinsic := _dict(power.get("intrinsicUpliftInternalPower", {}))
	var stage_thresholds := _dict(rebirth_evaluation.get("stageThresholds", {}))
	var stage_two := _dict(_dict(stage_thresholds.get("2", {})).get("power", {}))
	var last := -INF
	for key in THRESHOLD_KEYS:
		var value := float(intrinsic.get(key, -1.0))
		if value < last or absf(value - float(stage_two.get(key, INF))) > 0.000002:
			errors.append("进化内在成长增量.%s 必须与普通二转第二阶段一致" % key)
		last = value
	if str(power.get("terminalComparison", "")) != "comparable_to_normal_two_rebirth":
		errors.append("进化成品必须与普通二转处于同一数值带")
	if power.get("utilityMayExceedRawStats", null) != true or power.get("rawStatInflationBeyondBandAllowed", null) != false:
		errors.append("进化优势必须来自构筑，不得越过原始数值带")

	_validate_exact_string_array(data.get("preserve", []), PRESERVE_IDS, "进化保留项", errors)
	_validate_exact_string_array(data.get("clear", []), CLEAR_IDS, "进化清除项", errors)
	var compatibility := _dict(data.get("compatibility", {}))
	if str(compatibility.get("applyTo", "")) != "future_confirmed_evolutions_only":
		errors.append("进化合同只能作用于未来确认操作")
	if str(compatibility.get("existingPets", "")) != "unchanged" or str(compatibility.get("existingHistory", "")) != "unchanged":
		errors.append("进化合同必须保持既有宠物和历史不变")
	if str(compatibility.get("oldClients", "")) != "no_evolution_entry":
		errors.append("旧客户端必须没有进化入口而不是猜测执行")
	return errors


static func effort_summary(document: Dictionary) -> Dictionary:
	var effort := _dict(document.get("effortModel", {}))
	var normal := float(_dict(effort.get("normalSecondRebirth", {})).get("total", 0.0))
	var repeatable := float(_dict(effort.get("evolutionRepeatable", {})).get("total", 0.0))
	var unlock := float(_dict(effort.get("firstUnlock", {})).get("licenseQuest", 0.0))
	return {
		"normalSecondRebirth": normal,
		"evolutionRepeatable": repeatable,
		"firstEvolution": repeatable + unlock,
		"repeatableRatio": repeatable / normal if normal > 0.0 else 0.0,
		"firstEvolutionRatio": (repeatable + unlock) / normal if normal > 0.0 else 0.0,
	}


static func contract_check(document: Dictionary, rebirth_document: Dictionary) -> Dictionary:
	var errors := validation_errors(document, rebirth_document)
	var effort := effort_summary(document)
	return {
		"ok": (
			errors.is_empty()
			and is_equal_approx(float(effort.get("repeatableRatio", 0.0)), 1.5)
			and is_equal_approx(float(effort.get("firstEvolutionRatio", 0.0)), 1.7)
		),
		"errors": errors,
		"effort": effort,
	}


static func _effort_total(value, component_keys: Array, label: String, errors: Array[String]) -> float:
	if not (value is Dictionary):
		errors.append("%s必须是对象" % label)
		return 0.0
	var block := value as Dictionary
	var sum := 0.0
	for key in component_keys:
		var amount := float(block.get(key, -1.0))
		if amount < 0.0:
			errors.append("%s.%s必须非负" % [label, str(key)])
		else:
			sum += amount
	var total := float(block.get("total", -1.0))
	if total <= 0.0 or not is_equal_approx(total, sum):
		errors.append("%s.total必须等于分项合计" % label)
	return maxf(0.0, total)


static func _validate_exact_string_array(value, expected: Array[String], label: String, errors: Array[String]) -> void:
	if not (value is Array) or (value as Array).size() != expected.size():
		errors.append("%s必须包含%d个精确条目" % [label, expected.size()])
		return
	var source := value as Array
	for index in range(expected.size()):
		if not (source[index] is String) or str(source[index]) != expected[index]:
			errors.append("%s[%d]必须为%s" % [label, index, expected[index]])


static func _dict(value) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
