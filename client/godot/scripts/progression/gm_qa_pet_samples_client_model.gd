extends RefCounted

const COMMAND_ID := "gm_prepare_qa_pet_samples"
const MANIFEST_ID := "qa_pet_samples_v1"
const SAMPLE_COUNT := 13
const BLUE_MAN_DRAGON_LEVEL_ONE_COUNT := 10
const COMPARISON_LEVEL_TWENTY_COUNT := 3


static func request_payload() -> Dictionary:
	return {"manifestId": MANIFEST_ID}


static func status_state_from_parsed(parsed: Dictionary) -> Dictionary:
	if not bool(parsed.get("ok", false)):
		return {
			"ok": false,
			"message": str(parsed.get("message", "宠物测试样本准备失败。")),
		}
	var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
	var summary := result.get("summary", {}) as Dictionary if result.get("summary", {}) is Dictionary else {}
	if not bool(parsed.get("profileApplied", false)) or not _summary_is_valid(summary):
		return {
			"ok": false,
			"message": "宠物样本同步尚未确认，请勿重复操作，正在重新拉取。",
		}
	return {
		"ok": true,
		"manifestId": str(summary.get("manifestId", "")),
		"changed": bool(summary.get("changed", false)),
		"alreadyPrepared": bool(summary.get("alreadyPrepared", false)),
		"sampleCount": int(summary.get("sampleCount", 0)),
		"presentCount": int(summary.get("presentCount", 0)),
		"missingCount": int(summary.get("missingCount", 0)),
		"blueManDragonLv1Count": int(summary.get("blueManDragonLv1Count", 0)),
		"comparisonLv20Count": int(summary.get("comparisonLv20Count", 0)),
		"partyAdded": int(summary.get("partyAdded", 0)),
		"storageAdded": int(summary.get("storageAdded", 0)),
		"reservedCaptureSlots": int(summary.get("reservedCaptureSlots", 0)),
		"primaryInstanceId": str(summary.get("primaryInstanceId", "")),
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
		or not (summary.get("primaryInstanceId", null) is String)
	):
		return false
	for key in [
		"sampleCount",
		"presentCount",
		"missingCount",
		"blueManDragonLv1Count",
		"comparisonLv20Count",
		"partyAdded",
		"storageAdded",
		"reservedCaptureSlots",
		"profileRevisionBefore",
		"profileRevisionAfter",
	]:
		if not _is_nonnegative_integer(summary.get(key, null)):
			return false
	var changed := bool(summary.get("changed", false))
	var already_prepared := bool(summary.get("alreadyPrepared", false))
	var present_count := int(summary.get("presentCount", 0))
	var missing_count := int(summary.get("missingCount", 0))
	var party_added := int(summary.get("partyAdded", 0))
	var storage_added := int(summary.get("storageAdded", 0))
	var revision_before := int(summary.get("profileRevisionBefore", 0))
	var revision_after := int(summary.get("profileRevisionAfter", 0))
	if (
		changed == already_prepared
		or int(summary.get("sampleCount", 0)) != SAMPLE_COUNT
		or int(summary.get("blueManDragonLv1Count", 0)) != BLUE_MAN_DRAGON_LEVEL_ONE_COUNT
		or int(summary.get("comparisonLv20Count", 0)) != COMPARISON_LEVEL_TWENTY_COUNT
		or present_count + missing_count != SAMPLE_COUNT
		or revision_after != revision_before + (1 if changed else 0)
	):
		return false
	if changed:
		return (
			present_count == SAMPLE_COUNT
			and missing_count == 0
			and party_added + storage_added == SAMPLE_COUNT
			and int(summary.get("reservedCaptureSlots", 0)) >= 1
			and str(summary.get("primaryInstanceId", "")).strip_edges() != ""
		)
	return party_added == 0 and storage_added == 0


static func _is_nonnegative_integer(value: Variant) -> bool:
	if value is int:
		return int(value) >= 0
	if value is float:
		var number := float(value)
		return is_finite(number) and number >= 0.0 and floorf(number) == number
	return false


static func primary_instance_id(state: Dictionary) -> String:
	if not bool(state.get("ok", false)):
		return ""
	return str(state.get("primaryInstanceId", "")).strip_edges()


static func status_text(state: Dictionary) -> String:
	var lines: Array[String] = [
		"[color=#d7c36a]宠物测试样本档[/color]",
		"一次准备 10 只 Lv1 蓝人龙和 3 只 Lv20 角色对照宠。",
		"首次领取需要 13 个空位，并至少保留 1 个真实捕捉位；不会删除或覆盖现有宠物。",
	]
	if state.is_empty():
		lines.append("新发放样本默认绑定并锁定；已领取槽位不会自动补发或重抽。")
		return "\n".join(lines)
	if bool(state.get("pending", false)):
		lines.append("正在由服务器生成并持久化样本，请稍候……")
		return "\n".join(lines)
	if not bool(state.get("ok", false)):
		var error_message := str(state.get("message", "宠物测试样本准备失败。")).strip_edges()
		lines.append("[color=#f0a4a4]%s[/color]" % (error_message if error_message != "" else "宠物测试样本准备失败。"))
		return "\n".join(lines)
	var missing_count := int(state.get("missingCount", 0))
	if bool(state.get("changed", false)):
		lines.append("[color=#9fd7a0]结果：13 只正式工厂样本已生成并写入档案。[/color]")
		lines.append("新增：随队 %d 只 / 兽栏 %d 只" % [
			int(state.get("partyAdded", 0)),
			int(state.get("storageAdded", 0)),
		])
	elif missing_count > 0:
		lines.append("[color=#e6c77a]结果：此样本档曾经领取；目前缺少 %d 只。为防止反复重抽，不会自动补发。[/color]" % missing_count)
	else:
		lines.append("[color=#9fd7a0]结果：样本档已经完整，本次没有新增宠物。[/color]")
	lines.append("样本：现有 %d/%d，只缺 %d 只；当前保留捕捉位 %d 个" % [
		int(state.get("presentCount", 0)),
		int(state.get("sampleCount", SAMPLE_COUNT)),
		missing_count,
		int(state.get("reservedCaptureSlots", 0)),
	])
	lines.append("档案：r%d → r%d" % [
		int(state.get("profileRevisionBefore", 0)),
		int(state.get("profileRevisionAfter", 0)),
	])
	lines.append("新发放样本默认绑定并锁定；服务器不会覆盖或重抽既有样本。")
	return "\n".join(lines)
