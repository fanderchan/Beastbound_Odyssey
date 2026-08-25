extends RefCounted

const BattleActionCatalog := preload(
	"res://scripts/battle/battle_action_catalog.gd"
)
const BattlePassiveCatalog := preload(
	"res://scripts/battle/battle_passive_catalog.gd"
)
const PetFusionClientModel := preload(
	"res://scripts/progression/pet_fusion_client_model.gd"
)

const KIND_SUCCESS := "success"
const KIND_FAILURE := "failure"
const KIND_PENDING := "pending"

const ACTION_VIEW_PET := "view_pet"
const ACTION_REQUOTE := "requote"
const ACTION_RESELECT := "reselect"
const ACTION_RETRY_OPERATION := "retry_operation"
const ACTION_REFRESH_PROFILE := "refresh_profile"

const VIEW_KEYS := [
	"kind",
	"titleText",
	"statusText",
	"portraitFormId",
	"nameText",
	"levelText",
	"activeText",
	"passiveText",
	"bindingText",
	"terminalText",
	"consumptionText",
	"detailText",
	"action",
	"actionText",
]


static func success_view(result_value, catalog_document) -> Dictionary:
	var result := PetFusionClientModel.normalized_fusion_result(
		result_value,
		catalog_document
	)
	if result.is_empty():
		return {}
	var base_labels := _action_labels(
		result.get("baseActiveSkillIds", [])
	)
	var inherited_labels := _action_labels(
		result.get("inheritedActiveSkillIds", [])
	)
	var passive_label := BattlePassiveCatalog.label_for(
		str(result.get("inheritedPassiveSkillId", ""))
	).strip_edges()
	var consumed_names: Array[String] = []
	for raw_material in result.get("consumedMaterials", []) as Array:
		if not (raw_material is Dictionary):
			return {}
		var material_name := str(
			(raw_material as Dictionary).get("formName", "")
		).strip_edges()
		if material_name == "":
			return {}
		consumed_names.append(material_name)
	if base_labels.size() != 2 or passive_label == "" or consumed_names.size() != 3:
		return {}
	var binding_text := _binding_text(result)
	if binding_text == "":
		return {}
	var inherited_text := (
		"、".join(inherited_labels)
		if not inherited_labels.is_empty()
		else "本次未获得特殊主动"
	)
	return normalized_view({
		"kind": KIND_SUCCESS,
		"titleText": "融合完成",
		"statusText": "服务器结果已确认，角色档案已同步",
		"portraitFormId": str(result.get("targetFormId", "")),
		"nameText": str(result.get("targetFormName", "")),
		"levelText": "一转 Lv1",
		"activeText": "主动技能：%s；血脉遗传：%s" % [
			"、".join(base_labels),
			inherited_text,
		],
		"passiveText": "被动技能：%s" % passive_label,
		"bindingText": binding_text,
		"terminalText": (
			"一转终局融合形态 · 不可骑乘 · "
			+ "不可再次进化、融合或付费重置"
		),
		"consumptionText": "三只材料宠已永久消耗：%s" % " / ".join(
			consumed_names
		),
		"detailText": "成品成长与四维已独立生成，不继承材料数值。",
		"action": ACTION_VIEW_PET,
		"actionText": "查看新宠",
	})


static func definitive_failure_view(
	player_message: String,
	recovery_action: String
) -> Dictionary:
	if not [ACTION_REQUOTE, ACTION_RESELECT].has(recovery_action):
		return {}
	var action_text := (
		"重新获取报价"
		if recovery_action == ACTION_REQUOTE
		else "返回材料选择"
	)
	return normalized_view({
		"kind": KIND_FAILURE,
		"titleText": "融合未完成",
		"statusText": "服务器未执行本次融合",
		"portraitFormId": "",
		"nameText": "三只材料宠仍在",
		"levelText": "",
		"activeText": "",
		"passiveText": "",
		"bindingText": "",
		"terminalText": "",
		"consumptionText": "本次没有消耗任何宠物。",
		"detailText": _safe_player_message(
			player_message,
			"当前无法完成融合，请重新核对材料。"
		),
		"action": recovery_action,
		"actionText": action_text,
	})


static func request_pending_view() -> Dictionary:
	return normalized_view({
		"kind": KIND_PENDING,
		"titleText": "正在确认融合结果",
		"statusText": "服务器正在校验材料、血脉与最终结果",
		"portraitFormId": "",
		"nameText": "请勿关闭页面或重复提交",
		"levelText": "",
		"activeText": "",
		"passiveText": "",
		"bindingText": "",
		"terminalText": "",
		"consumptionText": "结果确认前，不判断材料是否已消耗。",
		"detailText": "本次请求已锁定；完成后会显示服务器权威结果。",
		"action": "",
		"actionText": "服务器确认中…",
	})


static func uncertain_result_view(player_message: String) -> Dictionary:
	return normalized_view({
		"kind": KIND_PENDING,
		"titleText": "融合结果待确认",
		"statusText": "服务器回执暂未确认",
		"portraitFormId": "",
		"nameText": "请勿重新选择材料或再次发起新融合",
		"levelText": "",
		"activeText": "",
		"passiveText": "",
		"bindingText": "",
		"terminalText": "",
		"consumptionText": "当前不能判断材料是否已消耗。",
		"detailText": _safe_player_message(
			player_message,
			"回执暂未确认，请使用同一操作继续核对。"
		),
		"action": ACTION_RETRY_OPERATION,
		"actionText": "核对融合结果",
	})


static func profile_sync_pending_view() -> Dictionary:
	return normalized_view({
		"kind": KIND_PENDING,
		"titleText": "融合档案待同步",
		"statusText": "服务器已返回结果，角色档案尚未同步完成",
		"portraitFormId": "",
		"nameText": "同步完成前不会展示成功结果",
		"levelText": "",
		"activeText": "",
		"passiveText": "",
		"bindingText": "",
		"terminalText": "",
		"consumptionText": "请勿重新提交融合或更换材料。",
		"detailText": "请重新拉取服务器档案，核对成品与最新修订。",
		"action": ACTION_REFRESH_PROFILE,
		"actionText": "同步角色档案",
	})


static func normalized_view(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var view := value as Dictionary
	if not _has_exact_keys(view, VIEW_KEYS):
		return {}
	var kind := str(view.get("kind", ""))
	var action := str(view.get("action", ""))
	if not [KIND_SUCCESS, KIND_FAILURE, KIND_PENDING].has(kind):
		return {}
	for key in [
		"titleText",
		"statusText",
		"nameText",
		"consumptionText",
		"detailText",
		"actionText",
	]:
		if str(view.get(key, "")).strip_edges() == "":
			return {}
	if kind == KIND_SUCCESS:
		if (
			action != ACTION_VIEW_PET
			or str(view.get("portraitFormId", "")).strip_edges() == ""
			or str(view.get("levelText", "")) != "一转 Lv1"
			or str(view.get("activeText", "")).strip_edges() == ""
			or str(view.get("passiveText", "")).strip_edges() == ""
			or str(view.get("bindingText", "")).strip_edges() == ""
			or str(view.get("terminalText", "")).strip_edges() == ""
		):
			return {}
	elif kind == KIND_FAILURE:
		if not [ACTION_REQUOTE, ACTION_RESELECT].has(action):
			return {}
	elif not ["", ACTION_RETRY_OPERATION, ACTION_REFRESH_PROFILE].has(action):
		return {}
	return view.duplicate(true)


static func _action_labels(value) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for raw_id in value as Array:
		var label := BattleActionCatalog.label_for(str(raw_id)).strip_edges()
		if label == "":
			return []
		result.append(label)
	return result


static func _binding_text(result: Dictionary) -> String:
	var binding := str(result.get("resultBinding", ""))
	var trade := str(result.get("tradeEligibility", ""))
	if (
		binding == PetFusionClientModel.RESULT_BINDING_BOUND
		and trade == PetFusionClientModel.TRADE_ELIGIBILITY_NOT_ELIGIBLE
	):
		return "绑定与交易：成品已绑定，不可交易"
	if (
		binding == PetFusionClientModel.RESULT_BINDING_UNBOUND
		and trade == "eligible_when_pet_trading_available"
	):
		return "绑定与交易：成品未绑定；宠物交易开放后可交易"
	return ""


static func _safe_player_message(value: String, fallback: String) -> String:
	var message := value.strip_edges()
	if message == "" or message.contains("_"):
		return fallback
	if message.length() > 120:
		message = message.left(120).strip_edges() + "…"
	return message


static func _has_exact_keys(value: Dictionary, expected_keys: Array) -> bool:
	if value.size() != expected_keys.size():
		return false
	for key in expected_keys:
		if not value.has(key):
			return false
	return true
