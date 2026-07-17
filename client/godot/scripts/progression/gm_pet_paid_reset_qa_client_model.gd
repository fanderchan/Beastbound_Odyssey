extends RefCounted

const COMMAND_ID := "gm_pet_paid_reset_config"
const MANIFEST_ID := "pet_paid_reset_qa_v1"


static func request_payload() -> Dictionary:
	return {"manifestId": MANIFEST_ID}


static func status_state_from_parsed(parsed: Dictionary) -> Dictionary:
	if not bool(parsed.get("ok", false)):
		return {"ok": false, "message": str(parsed.get("message", "宠物重置验收档准备失败。"))}
	var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
	var summary := result.get("summary", {}) as Dictionary if result.get("summary", {}) is Dictionary else {}
	var samples := result.get("samples", []) as Array if result.get("samples", []) is Array else []
	var price := result.get("price", {}) as Dictionary if result.get("price", {}) is Dictionary else {}
	var negative_checks := result.get("negativeChecks", {}) as Dictionary if result.get("negativeChecks", {}) is Dictionary else {}
	if (
		not bool(parsed.get("profileApplied", false))
		or not _valid_summary(summary)
		or samples.size() != 2
		or samples.any(func(sample) -> bool: return not _valid_sample(sample))
		or not _valid_price(price)
		or not _valid_negative_checks(negative_checks)
	):
		return {"ok": false, "message": "宠物重置验收档同步尚未确认，请勿重复操作，正在重新拉取。"}
	return {
		"ok": true,
		"summary": summary.duplicate(true),
		"samples": samples.duplicate(true),
		"price": price.duplicate(true),
		"negativeChecks": negative_checks.duplicate(true),
	}


static func primary_instance_id(state: Dictionary) -> String:
	if not bool(state.get("ok", false)):
		return ""
	var summary := state.get("summary", {}) as Dictionary if state.get("summary", {}) is Dictionary else {}
	return str(summary.get("primaryInstanceId", "")).strip_edges()


static func status_text(state: Dictionary) -> String:
	var lines: Array[String] = [
		"[color=#d7c36a]付费重置验收档与审计[/color]",
		"首次准备 1只一转 + 1只二转四灵幼兽，并把绑定/非绑定钻石与石币各补至验收下限。",
		"再次执行只刷新当前服务端价格、永久次数和最近10条安全审计；不会重抽或补发已删除样本。",
	]
	if state.is_empty():
		lines.append("准备后会自动选中二转样本；到宠物→成长页查看玩家实际报价与二次确认。")
		return "\n".join(lines)
	if bool(state.get("pending", false)):
		lines.append("正在由服务器准备并持久化验收档，请稍候……")
		return "\n".join(lines)
	if not bool(state.get("ok", false)):
		lines.append("[color=#f0a4a4]%s[/color]" % str(state.get("message", "宠物重置验收档准备失败。")))
		return "\n".join(lines)
	var summary := state.get("summary", {}) as Dictionary
	var price := state.get("price", {}) as Dictionary
	var wallets := summary.get("wallets", {}) as Dictionary
	lines.append("[color=#9fd7a0]价格：%s %s（配置 r%d）[/color]" % [
		_grouped_number(int(price.get("amount", 0))),
		_currency_label(str(price.get("currencyId", ""))),
		int(price.get("configRevision", 0)),
	])
	lines.append("钱包：绑定钻石 %d / 非绑定钻石 %d / 绑定石币 %s / 非绑定石币 %s" % [
		int(wallets.get("boundDiamonds", 0)),
		int(wallets.get("diamonds", 0)),
		_grouped_number(int(wallets.get("boundStoneCoins", 0))),
		_grouped_number(int(wallets.get("stoneCoins", 0))),
	])
	for sample_value in state.get("samples", []) as Array:
		var sample := sample_value as Dictionary
		var audit := sample.get("audit", {}) as Dictionary
		lines.append("%s｜Lv%d・%d转｜%s｜永久重置 %d 次｜审计 %d 条" % [
			str(sample.get("name", sample.get("slotId", "样本"))),
			int(sample.get("level", 0)),
			int(sample.get("rebirthCount", 0)),
			"可重置" if bool(sample.get("eligible", false)) else str(sample.get("eligibilityMessage", "当前不可重置")),
			int(sample.get("paidResetCount", 0)),
			int(audit.get("totalCount", 0)),
		])
		var records := audit.get("records", []) as Array if audit.get("records", []) is Array else []
		if not records.is_empty():
			var latest := records[records.size() - 1] as Dictionary
			var before := latest.get("before", {}) as Dictionary
			var after := latest.get("after", {}) as Dictionary
			lines.append("  最近：#%d %s｜Lv%d/%d转 → Lv%d/%d转" % [
				int(latest.get("resetNumber", 0)),
				str(latest.get("recordedAt", "")),
				int(before.get("level", 0)),
				int(before.get("rebirthCount", 0)),
				int(after.get("level", 0)),
				int(after.get("rebirthCount", 0)),
			])
	var negative := state.get("negativeChecks", {}) as Dictionary
	lines.append("安全拒绝自检：旧成长档 %s / 损坏成长档 %s" % [
		"通过" if bool(negative.get("legacyRejected", false)) else "失败",
		"通过" if bool(negative.get("damagedRejected", false)) else "失败",
	])
	lines.append("档案：r%d → r%d；本次新增 %d 只。" % [
		int(summary.get("profileRevisionBefore", 0)),
		int(summary.get("profileRevisionAfter", 0)),
		int(summary.get("samplesCreated", 0)),
	])
	return "\n".join(lines)


static func contract_check() -> Dictionary:
	var sample_base := {
		"schemaVersion": 1,
		"present": true,
		"eligible": true,
		"paidResetCount": 0,
		"audit": {"totalCount": 0, "archivedCount": 0, "records": []},
	}
	var first_sample := sample_base.duplicate(true)
	first_sample.merge({
		"slotId": "paid_reset_stage1",
		"instanceId": "qa_paid_reset_stage1",
		"name": "重置验收·一转四灵",
		"level": 80,
		"rebirthCount": 1,
	}, true)
	var second_sample := sample_base.duplicate(true)
	second_sample.merge({
		"slotId": "paid_reset_stage2",
		"instanceId": "qa_paid_reset_stage2",
		"name": "重置验收·二转四灵",
		"level": 88,
		"rebirthCount": 2,
	}, true)
	var parsed := {
		"ok": true,
		"profileApplied": true,
		"result": {
			"summary": {
				"schemaVersion": 1,
				"manifestId": MANIFEST_ID,
				"changed": true,
				"alreadyPrepared": false,
				"samplesCreated": 2,
				"sampleCount": 2,
				"presentCount": 2,
				"partyAdded": 2,
				"storageAdded": 0,
				"walletFieldsRaised": ["boundDiamonds", "diamonds", "boundStoneCoins", "stoneCoins"],
				"primaryInstanceId": "qa_paid_reset_stage2",
				"profileRevisionBefore": 4,
				"profileRevisionAfter": 5,
				"wallets": {"boundDiamonds": 1000, "diamonds": 1000, "boundStoneCoins": 1000000, "stoneCoins": 1000000},
			},
			"samples": [first_sample, second_sample],
			"price": {"configRevision": 2, "formId": "rebirth_starter_four_spirit_cub", "formName": "四灵幼兽", "currencyId": "diamonds", "amount": 300},
			"negativeChecks": {"legacyRejected": true, "damagedRejected": true},
		},
	}
	var state := status_state_from_parsed(parsed)
	var text := status_text(state)
	return {
		"ok": (
			bool(state.get("ok", false))
			and primary_instance_id(state) == "qa_paid_reset_stage2"
			and text.find("价格：300 钻石") >= 0
			and text.find("绑定钻石 1000") >= 0
			and text.find("旧成长档 通过 / 损坏成长档 通过") >= 0
			and text.find("privateSeed") < 0
			and text.find("operationId") < 0
		),
		"state": state,
	}


static func _valid_summary(summary: Dictionary) -> bool:
	if (
		int(summary.get("schemaVersion", 0)) != 1
		or str(summary.get("manifestId", "")) != MANIFEST_ID
		or not (summary.get("changed", null) is bool)
		or not (summary.get("alreadyPrepared", null) is bool)
		or not (summary.get("walletFieldsRaised", null) is Array)
		or not (summary.get("wallets", null) is Dictionary)
		or str(summary.get("primaryInstanceId", "")).strip_edges() == ""
	):
		return false
	for key in ["samplesCreated", "sampleCount", "presentCount", "partyAdded", "storageAdded", "profileRevisionBefore", "profileRevisionAfter"]:
		if not _is_nonnegative_integer(summary.get(key, null)):
			return false
	if int(summary.get("sampleCount", 0)) != 2 or int(summary.get("presentCount", 0)) > 2:
		return false
	var wallets := summary.get("wallets", {}) as Dictionary
	for key in ["boundDiamonds", "diamonds", "boundStoneCoins", "stoneCoins"]:
		if not _is_nonnegative_integer(wallets.get(key, null)):
			return false
	return true


static func _valid_sample(value) -> bool:
	if not (value is Dictionary):
		return false
	var sample := value as Dictionary
	if (
		int(sample.get("schemaVersion", 0)) != 1
		or str(sample.get("slotId", "")).strip_edges() == ""
		or str(sample.get("instanceId", "")).strip_edges() == ""
		or not (sample.get("present", null) is bool)
		or not (sample.get("eligible", null) is bool)
		or not _is_nonnegative_integer(sample.get("paidResetCount", null))
		or not (sample.get("audit", null) is Dictionary)
	):
		return false
	var audit := sample.get("audit", {}) as Dictionary
	return (
		_is_nonnegative_integer(audit.get("totalCount", null))
		and _is_nonnegative_integer(audit.get("archivedCount", null))
		and audit.get("records", null) is Array
	)


static func _valid_price(price: Dictionary) -> bool:
	return (
		_is_nonnegative_integer(price.get("configRevision", null))
		and str(price.get("formId", "")).strip_edges() != ""
		and str(price.get("formName", "")).strip_edges() != ""
		and ["diamonds", "stoneCoins"].has(str(price.get("currencyId", "")))
		and _is_positive_integer(price.get("amount", null))
	)


static func _valid_negative_checks(value: Dictionary) -> bool:
	return value.get("legacyRejected", null) is bool and value.get("damagedRejected", null) is bool


static func _is_nonnegative_integer(value) -> bool:
	return (value is int and int(value) >= 0) or (value is float and is_finite(float(value)) and float(value) >= 0 and floorf(float(value)) == float(value))


static func _is_positive_integer(value) -> bool:
	return _is_nonnegative_integer(value) and int(value) >= 1


static func _grouped_number(value: int) -> String:
	var text := str(maxi(0, value))
	var parts: Array[String] = []
	while text.length() > 3:
		parts.push_front(text.substr(text.length() - 3))
		text = text.substr(0, text.length() - 3)
	parts.push_front(text)
	return ",".join(parts)


static func _currency_label(currency_id: String) -> String:
	return "钻石" if currency_id == "diamonds" else "石币"
