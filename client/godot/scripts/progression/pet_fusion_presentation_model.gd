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
const PetFusionRecipeCatalogModel := preload(
	"res://scripts/progression/pet_fusion_recipe_catalog_model.gd"
)
const PetFusionSelectionModel := preload(
	"res://scripts/progression/pet_fusion_selection_model.gd"
)

const CLOSED_MESSAGE := PetFusionSelectionModel.CLOSED_MESSAGE


static func availability_view(catalog_document) -> Dictionary:
	var state := PetFusionSelectionModel.availability(catalog_document)
	if not bool(state.get("available", false)):
		return {
			"title": "宠物融合",
			"messageText": CLOSED_MESSAGE,
			"actions": [],
			"canSelect": false,
			"canRequestQuote": false,
		}
	return {
		"title": "宠物融合",
		"messageText": str(state.get("messageText", "请选择三只融合材料宠。")),
		"actions": ["选择材料"],
		"canSelect": true,
		"canRequestQuote": false,
	}


static func selection_view(selection_state: Dictionary) -> Dictionary:
	if not bool(selection_state.get("available", false)):
		return {
			"title": "宠物融合",
			"messageText": CLOSED_MESSAGE,
			"materialSlots": _empty_material_slots(),
			"actions": [],
			"canRequestQuote": false,
		}
	var material_slots: Array[Dictionary] = []
	var raw_slots = selection_state.get("slots", [])
	if raw_slots is Array:
		for raw_slot in raw_slots as Array:
			if not (raw_slot is Dictionary):
				continue
			var slot := raw_slot as Dictionary
			var selected := bool(slot.get("selected", false))
			material_slots.append({
				"roleText": str(slot.get("roleLabel", "融合材料")),
				"petNameText": (
					str(slot.get("petName", "宠物"))
					if selected
					else "尚未选择"
				),
				"levelText": (
					"一转 Lv%d" % int(slot.get("level", 0))
					if selected
					else ""
				),
				"statusText": str(slot.get("reasonText", "")),
				"selected": selected,
				"valid": bool(slot.get("valid", false)),
			})
	return {
		"title": "宠物融合",
		"messageText": str(
			selection_state.get("messageText", "融合材料选择资料不完整。")
		),
		"authorityText": "当前仅作本地提示，最终资格与结果由服务器确认。",
		"materialSlots": material_slots,
		"actions": ["获取融合报价"],
		"canRequestQuote": bool(
			selection_state.get("readyForQuoteHint", false)
		),
	}


static func quote_view(quote_value, catalog_document) -> Dictionary:
	if not PetFusionRecipeCatalogModel.runtime_available(catalog_document):
		return {}
	var quote := PetFusionClientModel.normalized_quote(
		quote_value,
		catalog_document
	)
	if quote.is_empty():
		return {}
	var inheritance := quote.get("inheritance", {}) as Dictionary
	var result := quote.get("result", {}) as Dictionary
	var active_chance := int(round(
		float(inheritance.get("specialActiveInheritanceChance", 0.0)) * 100.0
	))
	var passive_weights := (
		inheritance.get("passiveSourceWeights", {}) as Dictionary
	)
	var material_cards: Array[Dictionary] = []
	var special_active_rows: Array[Dictionary] = []
	var passive_source_rows: Array[Dictionary] = []
	for raw_material in quote.get("materials", []) as Array:
		var material := raw_material as Dictionary
		var role_id := str(material.get("roleId", ""))
		var role_text := PetFusionSelectionModel.role_label(role_id)
		var pet_name := str(material.get("formName", "宠物"))
		var special_active_label := BattleActionCatalog.label_for(
			str(material.get("specialActiveSkillId", "")),
			"血脉特殊主动"
		)
		var passive_label := BattlePassiveCatalog.label_for(
			str(material.get("passiveSkillId", "")),
			"血脉被动"
		)
		var passive_chance := int(round(
			float(passive_weights.get(role_id, 0.0)) * 100.0
		))
		material_cards.append({
			"roleText": role_text,
			"petNameText": pet_name,
			"levelText": "一转 Lv%d" % int(material.get("level", 0)),
		})
		special_active_rows.append({
			"sourceText": "%s・%s" % [role_text, pet_name],
			"skillNameText": special_active_label,
			"ruleText": "%d%%独立遗传" % active_chance,
		})
		passive_source_rows.append({
			"sourceText": role_text,
			"skillNameText": passive_label,
			"ruleText": "%d%%" % passive_chance,
		})

	var result_binding := str(result.get("resultBinding", ""))
	var binding_text := (
		"任一材料已绑定，成品将绑定。"
		if result_binding == PetFusionClientModel.RESULT_BINDING_BOUND
		else "三只材料均未绑定，成品保持未绑定；宠物交易开放后可按规则交易。"
	)
	return {
		"title": "融合报价",
		"resultText": "三只一转材料 → %s・一转 Lv1" % str(
			result.get("targetFormName", "融合宠")
		),
		"materialCards": material_cards,
		"baseSkillTitle": "固定主动技能",
		"baseSkillTexts": ["攻击", "防御"],
		"specialActiveTitle": "血脉特殊主动",
		"specialActiveRows": special_active_rows,
		"specialActiveSummaryText": "三只材料宠分别独立判定，普通或训练主动不会遗传。",
		"passiveTitle": "唯一被动技能",
		"passiveSourceRows": passive_source_rows,
		"passiveSummaryText": "最终只保留1个被动：主宠40% / 共鸣宠Ⅰ30% / 共鸣宠Ⅱ30%。",
		"numericRuleText": "三只材料宠的一级四维、成长、培养强度与加点数值不会继承；成品按自身规则独立生成。",
		"bindingRuleText": binding_text,
		"costRuleText": "只消耗这三只材料宠，不额外消耗石币、钻石或道具。",
		"terminalRuleText": "成品不可骑乘，并进入“2转/进化/融合”终局；不能普通二转、再次进化或融合，也不能付费重置。",
		"authorityText": "报价只用于确认展示；执行前服务器会再次校验，最终结果以服务器确认为准。",
		"warningText": "融合成功后将永久消耗三只材料宠，操作不可撤销。",
	}


static func confirmation_view(
	quote_value,
	catalog_document,
	armed_fingerprint: String = ""
) -> Dictionary:
	if not PetFusionRecipeCatalogModel.runtime_available(catalog_document):
		return {}
	var view := quote_view(quote_value, catalog_document)
	if view.is_empty():
		return {}
	var expected_fingerprint := confirmation_fingerprint(
		quote_value,
		catalog_document
	)
	var armed := (
		expected_fingerprint != ""
		and armed_fingerprint.strip_edges() == expected_fingerprint
	)
	view["title"] = "融合确认"
	view["confirmationArmed"] = armed
	view["confirmationStepText"] = (
		"二次确认：永久消耗三只材料宠并生成终局融合宠。"
		if armed
		else "首次确认：请完整核对三只材料、遗传概率和不可逆规则。"
	)
	view["buttonText"] = (
		"确认融合"
		if armed
		else "查看不可逆确认"
	)
	return view


static func confirmation_fingerprint(
	quote_value,
	catalog_document
) -> String:
	if not PetFusionRecipeCatalogModel.runtime_available(catalog_document):
		return ""
	var quote := PetFusionClientModel.normalized_quote(
		quote_value,
		catalog_document
	)
	if quote.is_empty():
		return ""
	var parts: Array[String] = [
		str(quote.get("catalogId", "")),
		str(quote.get("recipeId", "")),
		"revision:%d" % int(quote.get("profileRevision", 0)),
	]
	for raw_material in quote.get("materials", []) as Array:
		var material := raw_material as Dictionary
		parts.append("%s:%s:%s:%d:%s:%s" % [
			str(material.get("roleId", "")),
			str(material.get("instanceId", "")),
			str(material.get("formId", "")),
			int(material.get("level", 0)),
			str(material.get("specialActiveSkillId", "")),
			str(material.get("passiveSkillId", "")),
		])
	var result := quote.get("result", {}) as Dictionary
	parts.append("%s:%s:%s" % [
		str(result.get("targetFormId", "")),
		str(result.get("resultBinding", "")),
		str(result.get("tradeEligibility", "")),
	])
	return "|".join(parts).sha256_text()


static func _empty_material_slots() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for role_id in PetFusionRecipeCatalogModel.ROLE_IDS:
		result.append({
			"roleText": PetFusionSelectionModel.role_label(role_id),
			"petNameText": "尚未选择",
			"levelText": "",
			"statusText": "尚未选择。",
			"selected": false,
			"valid": false,
		})
	return result
