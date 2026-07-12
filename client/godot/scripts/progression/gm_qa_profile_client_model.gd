extends RefCounted

const COMMAND_ID := "gm_prepare_qa_profile"
const MANIFEST_ID := "qa_core_v1"


static func request_payload() -> Dictionary:
	return {"manifestId": MANIFEST_ID}


static func identity_text(session: Dictionary) -> String:
	var username := str(session.get("username", "")).strip_edges()
	var display_name := str(session.get("displayName", username)).strip_edges()
	if username == "":
		username = "-"
	if display_name == "":
		display_name = username
	var role_label := "GM" if str(session.get("effectiveRole", "")) == "gm" else "普通玩家"
	var summary := session.get("serverProfileSummary", {}) as Dictionary if session.get("serverProfileSummary", {}) is Dictionary else {}
	var revision := maxi(0, int(summary.get("profileRevision", 0)))
	return "%s / %s / %s / 档案 r%d" % [display_name, username, role_label, revision]


static func status_state_from_parsed(parsed: Dictionary) -> Dictionary:
	if not bool(parsed.get("ok", false)):
		return {
			"ok": false,
			"message": str(parsed.get("message", "核心测试档补齐失败。")),
		}
	var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
	var summary := result.get("summary", {}) as Dictionary if result.get("summary", {}) is Dictionary else {}
	if not bool(parsed.get("profileApplied", false)) or not _summary_is_valid(summary):
		return {
			"ok": false,
			"message": "核心测试档同步尚未确认，请勿重复操作，正在重新拉取。",
		}
	return {
		"ok": true,
		"manifestId": str(summary.get("manifestId", "")),
		"changed": bool(summary.get("changed", false)),
		"alreadyCurrent": bool(summary.get("alreadyCurrent", false)),
		"profileRevisionBefore": maxi(0, int(summary.get("profileRevisionBefore", 0))),
		"profileRevisionAfter": maxi(0, int(summary.get("profileRevisionAfter", 0))),
		"stoneCoins": maxi(0, int(summary.get("stoneCoins", 0))),
		"diamonds": maxi(0, int(summary.get("diamonds", 0))),
		"backpackExtraSlots": maxi(0, int(summary.get("backpackExtraSlots", 0))),
		"itemKinds": maxi(0, int(summary.get("itemKinds", 0))),
		"itemQuantity": maxi(0, int(summary.get("itemQuantity", 0))),
	}


static func _summary_is_valid(summary: Dictionary) -> bool:
	if (
		str(summary.get("manifestId", "")) != MANIFEST_ID
		or not _is_nonnegative_integer(summary.get("schemaVersion", null))
		or int(summary.get("schemaVersion", 0)) != 1
		or not (summary.get("changed", null) is bool)
		or not (summary.get("alreadyCurrent", null) is bool)
	):
		return false
	for key in [
		"profileRevisionBefore",
		"profileRevisionAfter",
		"stoneCoins",
		"diamonds",
		"backpackExtraSlots",
		"itemKinds",
		"itemQuantity",
	]:
		if not _is_nonnegative_integer(summary.get(key, null)):
			return false
	var changed := bool(summary.get("changed", false))
	var already_current := bool(summary.get("alreadyCurrent", false))
	var revision_before := int(summary.get("profileRevisionBefore", 0))
	var revision_after := int(summary.get("profileRevisionAfter", 0))
	return (
		changed != already_current
		and revision_after == revision_before + (1 if changed else 0)
		and int(summary.get("stoneCoins", 0)) >= 1000000
		and int(summary.get("diamonds", 0)) >= 100000
		and int(summary.get("backpackExtraSlots", 0)) >= 5
		and int(summary.get("itemKinds", 0)) == 15
		and int(summary.get("itemQuantity", 0)) >= 330
	)


static func _is_nonnegative_integer(value: Variant) -> bool:
	if value is int:
		return int(value) >= 0
	if value is float:
		var number := float(value)
		return is_finite(number) and number >= 0.0 and floorf(number) == number
	return false


static func status_text(state: Dictionary) -> String:
	var lines: Array[String] = [
		"[color=#d7c36a]核心测试档[/color]",
		"只补齐缺少的核心货币和物资，不会清空现有进度。",
	]
	if state.is_empty():
		return "\n".join(lines)
	if bool(state.get("pending", false)):
		lines.append("正在向服务器确认并补齐，请稍候……")
		return "\n".join(lines)
	if not bool(state.get("ok", false)):
		var error_message := str(state.get("message", "核心测试档补齐失败。")).strip_edges()
		lines.append("[color=#f0a4a4]%s[/color]" % (error_message if error_message != "" else "核心测试档补齐失败。"))
		return "\n".join(lines)
	var already_current := bool(state.get("alreadyCurrent", false))
	var changed := bool(state.get("changed", false))
	if already_current:
		lines.append("[color=#9fd7a0]结果：当前档案已经完整，本次没有改动。[/color]")
	elif changed:
		lines.append("[color=#9fd7a0]结果：已补齐缺少的核心测试内容。[/color]")
	else:
		lines.append("[color=#9fd7a0]结果：服务器已完成检查，本次没有改动。[/color]")
	lines.append("档案：r%d → r%d" % [
		int(state.get("profileRevisionBefore", 0)),
		int(state.get("profileRevisionAfter", 0)),
	])
	lines.append("货币：石币 %d / 钻石 %d" % [
		int(state.get("stoneCoins", 0)),
		int(state.get("diamonds", 0)),
	])
	lines.append("物资：%d 种 / 共 %d 件 / 额外背包格 %d" % [
		int(state.get("itemKinds", 0)),
		int(state.get("itemQuantity", 0)),
		int(state.get("backpackExtraSlots", 0)),
	])
	return "\n".join(lines)
