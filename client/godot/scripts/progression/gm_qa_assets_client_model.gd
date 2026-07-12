extends RefCounted

const COMMAND_ID := "gm_prepare_qa_assets"
const MANIFEST_ID := "qa_assets_v1"
const CATALOG_ITEM_KINDS := 76
const ORDINARY_ITEM_KINDS := 45
const EQUIPMENT_ITEM_KINDS := 31
const ORDINARY_TARGET_QUANTITY := 83
const EQUIPMENT_SAMPLE_COUNT := 31
const BANK_UNLOCKED_TABS := 6
const BANK_SLOT_CAPACITY := 90
const RESERVED_BANK_SLOTS := 1


static func request_payload() -> Dictionary:
	return {"manifestId": MANIFEST_ID}


static func status_state_from_parsed(parsed: Dictionary) -> Dictionary:
	if not bool(parsed.get("ok", false)):
		return {
			"ok": false,
			"message": str(parsed.get("message", "装备与全物品测试档准备失败。")),
		}
	var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
	var summary := result.get("summary", {}) as Dictionary if result.get("summary", {}) is Dictionary else {}
	if not bool(parsed.get("profileApplied", false)) or not _summary_is_valid(summary):
		return {
			"ok": false,
			"message": "测试资产同步尚未确认，请勿重复操作，正在重新拉取。",
		}
	return {
		"ok": true,
		"manifestId": str(summary.get("manifestId", "")),
		"changed": bool(summary.get("changed", false)),
		"alreadyPrepared": bool(summary.get("alreadyPrepared", false)),
		"catalogItemKinds": int(summary.get("catalogItemKinds", 0)),
		"ordinaryItemKinds": int(summary.get("ordinaryItemKinds", 0)),
		"equipmentItemKinds": int(summary.get("equipmentItemKinds", 0)),
		"ordinaryTargetQuantity": int(summary.get("ordinaryTargetQuantity", 0)),
		"equipmentSampleCount": int(summary.get("equipmentSampleCount", 0)),
		"ordinaryItemKindsPresent": int(summary.get("ordinaryItemKindsPresent", 0)),
		"ordinaryItemKindsMissing": int(summary.get("ordinaryItemKindsMissing", 0)),
		"bankEquipmentSamplesPresent": int(summary.get("bankEquipmentSamplesPresent", 0)),
		"bankEquipmentSamplesMissing": int(summary.get("bankEquipmentSamplesMissing", 0)),
		"bankUnlockedTabs": int(summary.get("bankUnlockedTabs", 0)),
		"bankSlotCapacity": int(summary.get("bankSlotCapacity", 0)),
		"bankUsedSlots": int(summary.get("bankUsedSlots", 0)),
		"bankFreeSlots": int(summary.get("bankFreeSlots", 0)),
		"reservedBankSlots": int(summary.get("reservedBankSlots", 0)),
		"profileRevisionBefore": int(summary.get("profileRevisionBefore", 0)),
		"profileRevisionAfter": int(summary.get("profileRevisionAfter", 0)),
		"schemaVersion": int(summary.get("schemaVersion", 0)),
	}


static func _summary_is_valid(summary: Dictionary) -> bool:
	if (
		str(summary.get("manifestId", "")) != MANIFEST_ID
		or not _is_nonnegative_integer(summary.get("schemaVersion", null))
		or int(summary.get("schemaVersion", 0)) != 1
		or not (summary.get("changed", null) is bool)
		or not (summary.get("alreadyPrepared", null) is bool)
	):
		return false
	for key in [
		"catalogItemKinds",
		"ordinaryItemKinds",
		"equipmentItemKinds",
		"ordinaryTargetQuantity",
		"equipmentSampleCount",
		"ordinaryItemKindsPresent",
		"ordinaryItemKindsMissing",
		"bankEquipmentSamplesPresent",
		"bankEquipmentSamplesMissing",
		"bankUnlockedTabs",
		"bankSlotCapacity",
		"bankUsedSlots",
		"bankFreeSlots",
		"reservedBankSlots",
		"profileRevisionBefore",
		"profileRevisionAfter",
	]:
		if not _is_nonnegative_integer(summary.get(key, null)):
			return false
	var changed := bool(summary.get("changed", false))
	var already_prepared := bool(summary.get("alreadyPrepared", false))
	var ordinary_present := int(summary.get("ordinaryItemKindsPresent", 0))
	var ordinary_missing := int(summary.get("ordinaryItemKindsMissing", 0))
	var equipment_present := int(summary.get("bankEquipmentSamplesPresent", 0))
	var equipment_missing := int(summary.get("bankEquipmentSamplesMissing", 0))
	var bank_used := int(summary.get("bankUsedSlots", 0))
	var bank_free := int(summary.get("bankFreeSlots", 0))
	var revision_before := int(summary.get("profileRevisionBefore", 0))
	var revision_after := int(summary.get("profileRevisionAfter", 0))
	if (
		changed == already_prepared
		or int(summary.get("catalogItemKinds", 0)) != CATALOG_ITEM_KINDS
		or int(summary.get("ordinaryItemKinds", 0)) != ORDINARY_ITEM_KINDS
		or int(summary.get("equipmentItemKinds", 0)) != EQUIPMENT_ITEM_KINDS
		or int(summary.get("ordinaryTargetQuantity", 0)) != ORDINARY_TARGET_QUANTITY
		or int(summary.get("equipmentSampleCount", 0)) != EQUIPMENT_SAMPLE_COUNT
		or ordinary_present + ordinary_missing != ORDINARY_ITEM_KINDS
		or equipment_present + equipment_missing != EQUIPMENT_SAMPLE_COUNT
		or int(summary.get("bankUnlockedTabs", 0)) != BANK_UNLOCKED_TABS
		or int(summary.get("bankSlotCapacity", 0)) != BANK_SLOT_CAPACITY
		or bank_used + bank_free != BANK_SLOT_CAPACITY
		or int(summary.get("reservedBankSlots", 0)) != RESERVED_BANK_SLOTS
		or revision_after != revision_before + (1 if changed else 0)
	):
		return false
	if changed:
		return (
			ordinary_present == ORDINARY_ITEM_KINDS
			and ordinary_missing == 0
			and equipment_present == EQUIPMENT_SAMPLE_COUNT
			and equipment_missing == 0
			and bank_free >= RESERVED_BANK_SLOTS
		)
	return true


static func _is_nonnegative_integer(value: Variant) -> bool:
	if value is int:
		return int(value) >= 0
	if value is float:
		var number := float(value)
		return is_finite(number) and number >= 0.0 and floorf(number) == number
	return false


static func status_text(state: Dictionary) -> String:
	var lines: Array[String] = [
		"[color=#d7c36a]装备与全物品测试档[/color]",
		"准备当前 76 种正式物品：45 种普通物品与 31 件正式装备样本。",
		"这是高价值 GM 测试资产；不会清空现有资产，也不会在使用或转移后补发。",
	]
	if state.is_empty():
		lines.append("首次准备会开放 6 页银行并至少保留 1 格；背包需要 1 个临时空格。")
		return "\n".join(lines)
	if bool(state.get("pending", false)):
		lines.append("正在由服务器校验容量、生成正式实例并持久化，请稍候……")
		return "\n".join(lines)
	if not bool(state.get("ok", false)):
		var error_message := str(state.get("message", "装备与全物品测试档准备失败。")).strip_edges()
		lines.append("[color=#f0a4a4]%s[/color]" % (error_message if error_message != "" else "装备与全物品测试档准备失败。"))
		return "\n".join(lines)
	var ordinary_missing := int(state.get("ordinaryItemKindsMissing", 0))
	var equipment_missing := int(state.get("bankEquipmentSamplesMissing", 0))
	if bool(state.get("changed", false)):
		lines.append("[color=#9fd7a0]结果：全物品与 31 件正式装备样本已写入银行。[/color]")
	elif ordinary_missing > 0 or equipment_missing > 0:
		lines.append("[color=#e6c77a]结果：此测试档曾经准备过；当前银行缺少 %d 种普通物品 / %d 件装备。[/color]" % [ordinary_missing, equipment_missing])
		lines.append("样本可能已移到背包、交易所或邮件，或已被使用；不会自动补发。")
	else:
		lines.append("[color=#9fd7a0]结果：测试档已经完整，本次没有新增资产。[/color]")
	lines.append("银行目录：普通物品 %d/%d 种；装备 %d/%d 件" % [
		int(state.get("ordinaryItemKindsPresent", 0)),
		int(state.get("ordinaryItemKinds", ORDINARY_ITEM_KINDS)),
		int(state.get("bankEquipmentSamplesPresent", 0)),
		int(state.get("equipmentSampleCount", EQUIPMENT_SAMPLE_COUNT)),
	])
	lines.append("银行：%d/%d 格已用，空闲 %d 格，已开放 %d 页" % [
		int(state.get("bankUsedSlots", 0)),
		int(state.get("bankSlotCapacity", BANK_SLOT_CAPACITY)),
		int(state.get("bankFreeSlots", 0)),
		int(state.get("bankUnlockedTabs", BANK_UNLOCKED_TABS)),
	])
	lines.append("档案：r%d → r%d" % [
		int(state.get("profileRevisionBefore", 0)),
		int(state.get("profileRevisionAfter", 0)),
	])
	return "\n".join(lines)
