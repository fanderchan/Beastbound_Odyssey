extends RefCounted

const COMMAND_ID := "gm_pet_capture_recovery"
const ACTION_SEARCH := "search"
const ACTION_RECOVER := "recover"
const MAX_RECORDS := 50


static func request_payload(action: String, target_username: String, selector: String = "") -> Dictionary:
	var normalized_selector := selector.strip_edges()
	var recovery_id := normalized_selector if _is_recovery_id(normalized_selector) else ""
	var pet_instance_id := normalized_selector if normalized_selector != "" and recovery_id == "" else ""
	return {
		"action": action.strip_edges(),
		"targetUsername": target_username.strip_edges(),
		"recoveryId": recovery_id,
		"petInstanceId": pet_instance_id,
	}


static func status_state_from_parsed(parsed: Dictionary) -> Dictionary:
	if not bool(parsed.get("ok", false)):
		return {
			"ok": false,
			"message": str(parsed.get("message", "捕捉恢复操作失败。")),
		}
	var result := parsed.get("result", {}) as Dictionary if parsed.get("result", {}) is Dictionary else {}
	if not _valid_result(result):
		return {
			"ok": false,
			"message": "服务器返回的捕捉恢复摘要不完整，请重新查询。",
		}
	return {
		"ok": true,
		"message": str(parsed.get("message", "捕捉恢复操作已完成。")),
		"result": result.duplicate(true),
	}


static func status_text(state: Dictionary) -> String:
	var lines: Array[String] = [
		"[color=#d7c36a]捕捉恢复审计[/color]",
		"只查询服务器异常捕捉快照；恢复前会复核战斗状态和宠物容量。",
	]
	if state.is_empty():
		lines.append("输入目标用户名；恢复ID或宠物ID可留空以查询全部。")
		return "\n".join(lines)
	if bool(state.get("pending", false)):
		lines.append("正在等待服务器确认并写入审计……")
		return "\n".join(lines)
	if not bool(state.get("ok", false)):
		var error_message := str(state.get("message", "捕捉恢复操作失败。")).strip_edges()
		lines.append("[color=#f0a4a4]%s[/color]" % _bbcode_escape(error_message if error_message != "" else "捕捉恢复操作失败。"))
		return "\n".join(lines)
	var result := state.get("result", {}) as Dictionary if state.get("result", {}) is Dictionary else {}
	var target := result.get("target", {}) as Dictionary
	var capacity := result.get("capacity", {}) as Dictionary
	var counts := result.get("counts", {}) as Dictionary
	lines.append("[color=#9fd7a0]%s[/color]" % _bbcode_escape(str(state.get("message", "查询完成。"))))
	lines.append("目标：%s / %s / 档案 r%d%s" % [
		_bbcode_escape(str(target.get("displayName", target.get("username", "-")))),
		_bbcode_escape(str(target.get("username", "-"))),
		int(target.get("profileRevision", 0)),
		" / 战斗中" if bool(target.get("activeBattle", false)) else "",
	])
	lines.append("容量：随身 %d/%d、兽栏 %d/%d、空位 %d" % [
		int(capacity.get("partyCount", 0)),
		int(capacity.get("partyLimit", 5)),
		int(capacity.get("storageCount", 0)),
		int(capacity.get("storageLimit", 20)),
		int(capacity.get("available", 0)),
	])
	lines.append("记录：待恢复 %d / 已完成 %d / 命中 %d" % [
		int(counts.get("pending", 0)),
		int(counts.get("completed", 0)),
		int(counts.get("matched", 0)),
	])
	var records := result.get("records", []) as Array
	if records.is_empty():
		lines.append("没有匹配记录。")
	for value in records:
		var record := value as Dictionary
		var status := str(record.get("status", ""))
		var name := str(record.get("name", "")).strip_edges()
		var form_id := str(record.get("formId", "")).strip_edges()
		var level := int(record.get("level", 0))
		var headline := "%s %s%s%s" % [
			"[待恢复]" if status == "pending" else "[已完成]",
			_bbcode_escape(name if name != "" else (form_id if form_id != "" else "未知宠物")),
			" Lv%d" % level if level > 0 else "",
			" → %s" % _disposition_label(str(record.get("disposition", ""))) if status == "completed" else "",
		]
		lines.append(headline)
		lines.append("  恢复ID：%s" % _bbcode_escape(str(record.get("recoveryId", ""))))
		lines.append("  宠物ID：%s" % _bbcode_escape(str(record.get("petInstanceId", ""))))
		var timestamp := str(record.get("createdAt", "")) if status == "pending" else str(record.get("completedAt", ""))
		if timestamp != "":
			lines.append("  时间：%s" % _bbcode_escape(timestamp))
	if bool(counts.get("truncated", false)):
		lines.append("结果超过 %d 条，请填写恢复ID或宠物ID精确查询。" % MAX_RECORDS)
	return "\n".join(lines)


static func _valid_result(result: Dictionary) -> bool:
	var action := str(result.get("action", ""))
	if (
		str(result.get("commandId", "")) != COMMAND_ID
		or not [ACTION_SEARCH, ACTION_RECOVER].has(action)
		or int(result.get("schemaVersion", 0)) != 1
		or not (result.get("target", null) is Dictionary)
		or not (result.get("capacity", null) is Dictionary)
		or not (result.get("counts", null) is Dictionary)
		or not (result.get("records", null) is Array)
	):
		return false
	var expected_result_keys := ["action", "capacity", "commandId", "counts", "records", "schemaVersion", "target"]
	if action == ACTION_RECOVER:
		expected_result_keys.append("recovery")
	if not _has_exact_keys(result, expected_result_keys):
		return false
	var target := result.get("target", {}) as Dictionary
	var capacity := result.get("capacity", {}) as Dictionary
	var counts := result.get("counts", {}) as Dictionary
	var records := result.get("records", []) as Array
	if (
		not _has_exact_keys(target, ["activeBattle", "displayName", "profileRevision", "schemaVersion", "username"])
		or not _has_exact_keys(capacity, ["available", "partyCount", "partyLimit", "schemaVersion", "storageCount", "storageLimit"])
		or not _has_exact_keys(counts, ["completed", "matched", "pending", "returned", "schemaVersion", "truncated"])
		or not (target.get("username", null) is String)
		or not (target.get("displayName", null) is String)
		or str(target.get("username", "")).strip_edges() == ""
		or int(target.get("schemaVersion", 0)) != 1
		or not (target.get("activeBattle", null) is bool)
		or not _nonnegative_integer(target.get("profileRevision", null))
		or int(capacity.get("schemaVersion", 0)) != 1
		or int(counts.get("schemaVersion", 0)) != 1
		or records.size() > MAX_RECORDS
	):
		return false
	for key in ["partyCount", "partyLimit", "storageCount", "storageLimit", "available"]:
		if not _nonnegative_integer(capacity.get(key, null)):
			return false
	for key in ["pending", "completed", "matched", "returned"]:
		if not _nonnegative_integer(counts.get(key, null)):
			return false
	if not (counts.get("truncated", null) is bool) or int(counts.get("returned", -1)) != records.size():
		return false
	for value in records:
		if not (value is Dictionary) or not _valid_record(value as Dictionary):
			return false
	if action == ACTION_RECOVER:
		var recovery: Variant = result.get("recovery", null)
		if not (recovery is Dictionary):
			return false
		var recovery_dict := recovery as Dictionary
		if (
			not _has_exact_keys(recovery_dict, ["changed", "disposition", "replayed", "schemaVersion"])
			or int(recovery_dict.get("schemaVersion", 0)) != 1
			or not (recovery_dict.get("changed", null) is bool)
			or not (recovery_dict.get("replayed", null) is bool)
			or not (recovery_dict.get("disposition", null) is String)
			or not ["", "party", "storage", "overflow_fallback"].has(str(recovery_dict.get("disposition", "")))
		):
			return false
	return true


static func _valid_record(record: Dictionary) -> bool:
	if not _has_exact_keys(record, [
		"capturedSerial", "completedAt", "createdAt", "disposition", "formId", "level",
		"name", "petInstanceId", "recoveryId", "schemaVersion", "state", "status",
	]):
		return false
	for key in ["completedAt", "createdAt", "disposition", "formId", "name", "petInstanceId", "recoveryId", "state", "status"]:
		if not (record.get(key, null) is String):
			return false
	return (
		["pending", "completed"].has(str(record.get("status", "")))
		and _is_recovery_id(str(record.get("recoveryId", "")))
		and _is_pet_instance_id(str(record.get("petInstanceId", "")))
		and str(record.get("createdAt", "")).length() <= 64
		and str(record.get("completedAt", "")).length() <= 64
		and _nonnegative_integer(record.get("level", null))
		and _nonnegative_integer(record.get("capturedSerial", null))
		and int(record.get("schemaVersion", 0)) == 1
	)


static func _is_recovery_id(value: String) -> bool:
	if value.length() != 44 or not value.begins_with("pet_capture_"):
		return false
	var suffix := value.substr(12)
	for index in range(suffix.length()):
		if "0123456789abcdef".find(suffix.substr(index, 1)) < 0:
			return false
	return true


static func _is_pet_instance_id(value: String) -> bool:
	if value.length() < 1 or value.length() > 160:
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if not (
			(code >= 48 and code <= 57)
			or (code >= 65 and code <= 90)
			or (code >= 97 and code <= 122)
			or code == 46
			or code == 58
			or code == 95
			or code == 45
		):
			return false
	return true


static func _has_exact_keys(value: Dictionary, expected: Array) -> bool:
	var actual := value.keys()
	actual.sort()
	var normalized_expected := expected.duplicate()
	normalized_expected.sort()
	return actual == normalized_expected


static func _disposition_label(value: String) -> String:
	match value:
		"party":
			return "随身栏"
		"storage":
			return "兽栏"
		"overflow_fallback":
			return "旧版溢出保护"
		_:
			return "已处理"


static func _bbcode_escape(value: String) -> String:
	var escaped := ""
	for index in range(value.length()):
		var character := value.substr(index, 1)
		if character == "[":
			escaped += "[lb]"
		elif character == "]":
			escaped += "[rb]"
		else:
			escaped += character
	return escaped


static func _nonnegative_integer(value: Variant) -> bool:
	if value is int:
		return int(value) >= 0
	if value is float:
		var number := float(value)
		return is_finite(number) and number >= 0.0 and floorf(number) == number
	return false
