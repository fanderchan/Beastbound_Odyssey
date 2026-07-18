extends RefCounted

const POLICY_PATH := "res://data/gm_qa_access_policy.json"
const SCHEMA_VERSION := 1
const EXPECTED_POLICY_KEYS := [
	"allowedUsernames",
	"clientCommandIds",
	"defaultLeaseHours",
	"maxLeaseHours",
	"policyId",
	"schemaVersion",
	"serverAuthoritativeClientCommandIds",
	"serverCommandIds",
]

static var _cached_policy: Dictionary = {}


static func policy() -> Dictionary:
	if not _cached_policy.is_empty():
		return _cached_policy.duplicate(true)
	if not FileAccess.file_exists(POLICY_PATH):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(POLICY_PATH))
	if not (parsed is Dictionary):
		return {}
	var candidate := parsed as Dictionary
	if not validation_errors_for(candidate).is_empty():
		return {}
	_cached_policy = candidate.duplicate(true)
	return _cached_policy.duplicate(true)


static func policy_id() -> String:
	return str(policy().get("policyId", ""))


static func allowed_usernames() -> Array[String]:
	return _normalized_string_array(policy().get("allowedUsernames", []), true)


static func server_command_ids() -> Array[String]:
	return _normalized_string_array(policy().get("serverCommandIds", []), false)


static func client_command_ids() -> Array[String]:
	return _normalized_string_array(policy().get("clientCommandIds", []), false)


static func server_authoritative_client_command_ids() -> Array[String]:
	return _normalized_string_array(policy().get("serverAuthoritativeClientCommandIds", []), false)


static func validation_errors() -> Array[String]:
	var loaded := policy()
	if loaded.is_empty():
		return ["GM QA 授权策略不可用。"]
	return validation_errors_for(loaded)


static func validation_errors_for(candidate: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var actual_keys: Array[String] = []
	for key in candidate.keys():
		actual_keys.append(str(key))
	actual_keys.sort()
	var expected_keys: Array[String] = []
	for key in EXPECTED_POLICY_KEYS:
		expected_keys.append(str(key))
	expected_keys.sort()
	if actual_keys != expected_keys:
		errors.append("授权策略字段不完整或包含未知字段。")
	if not integer_value_is_exact(candidate.get("schemaVersion", null), SCHEMA_VERSION):
		errors.append("schemaVersion 不受支持。")
	var candidate_policy_id := str(candidate.get("policyId", "")).strip_edges()
	if not (candidate.get("policyId", null) is String) or not _valid_command_id(candidate_policy_id) or candidate_policy_id != str(candidate.get("policyId", "")):
		errors.append("policyId 不合法。")
	var default_hours := int(candidate.get("defaultLeaseHours", 0))
	var max_hours := int(candidate.get("maxLeaseHours", 0))
	if (
		not integer_value_is_exact(candidate.get("defaultLeaseHours", null), default_hours)
		or not integer_value_is_exact(candidate.get("maxLeaseHours", null), max_hours)
		or default_hours <= 0
		or max_hours <= 0
		or default_hours > max_hours
		or max_hours > 24
	):
		errors.append("授权时长不合法。")
	var usernames := _validated_list(candidate.get("allowedUsernames", null), true, "allowedUsernames", errors)
	var server_ids := _validated_list(candidate.get("serverCommandIds", null), false, "serverCommandIds", errors)
	var client_ids := _validated_list(candidate.get("clientCommandIds", null), false, "clientCommandIds", errors)
	var authoritative_ids := _validated_list(candidate.get("serverAuthoritativeClientCommandIds", null), false, "serverAuthoritativeClientCommandIds", errors)
	if usernames.size() != 1:
		errors.append("allowedUsernames 必须且只能包含一个账号。")
	if server_ids.size() != 12 or client_ids.size() != 31 or authoritative_ids.size() != 9:
		errors.append("授权策略目录数量与冻结合同不一致。")
	for command_id in authoritative_ids:
		if not client_ids.has(command_id) or not server_ids.has(command_id):
			errors.append("服务端权威客户端命令不在共享目录中。")
	return errors


static func expires_at_unix(expires_at: String) -> int:
	var value := expires_at.strip_edges()
	var expression := RegEx.new()
	if expression.compile("^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})\\.\\d{3}Z$") != OK:
		return -1
	var result := expression.search(value)
	if result == null:
		return -1
	var parts := {
		"year": int(result.get_string(1)),
		"month": int(result.get_string(2)),
		"day": int(result.get_string(3)),
		"hour": int(result.get_string(4)),
		"minute": int(result.get_string(5)),
		"second": int(result.get_string(6)),
	}
	if (
		int(parts["year"]) < 1970
		or int(parts["month"]) < 1 or int(parts["month"]) > 12
		or int(parts["day"]) < 1 or int(parts["day"]) > 31
		or int(parts["hour"]) < 0 or int(parts["hour"]) > 23
		or int(parts["minute"]) < 0 or int(parts["minute"]) > 59
		or int(parts["second"]) < 0 or int(parts["second"]) > 59
	):
		return -1
	var unix_time := int(Time.get_unix_time_from_datetime_dict(parts))
	var round_trip := Time.get_datetime_dict_from_unix_time(unix_time)
	for key in ["year", "month", "day", "hour", "minute", "second"]:
		if int(round_trip.get(key, -1)) != int(parts.get(key, -2)):
			return -1
	return unix_time


static func future_expiry_is_valid(expires_at: String, now_sec: int = -1) -> bool:
	var expiry := expires_at_unix(expires_at)
	var now_value := now_sec if now_sec >= 0 else int(Time.get_unix_time_from_system())
	return expiry > now_value


static func integer_value_is_exact(value: Variant, expected: int) -> bool:
	if value is int:
		return int(value) == expected
	if value is float:
		var number := float(value)
		return is_finite(number) and floorf(number) == number and int(number) == expected
	return false


static func expiry_display_text(expires_at: String) -> String:
	var unix_time := expires_at_unix(expires_at)
	if unix_time < 0:
		return "-"
	var value := Time.get_datetime_dict_from_unix_time(unix_time)
	return "%04d-%02d-%02d %02d:%02d UTC" % [
		int(value.get("year", 0)),
		int(value.get("month", 0)),
		int(value.get("day", 0)),
		int(value.get("hour", 0)),
		int(value.get("minute", 0)),
	]


static func _validated_list(value: Variant, username_list: bool, label: String, errors: Array[String]) -> Array[String]:
	if not (value is Array):
		errors.append("%s 必须为数组。" % label)
		return []
	var result := _normalized_string_array(value, username_list)
	if result.size() != (value as Array).size():
		errors.append("%s 含空值、重复项或通配符。" % label)
	return result


static func _normalized_string_array(value: Variant, username_list: bool) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for raw_value in value as Array:
		if not (raw_value is String):
			continue
		var normalized := str(raw_value).strip_edges().to_lower()
		if normalized == "" or normalized == "*" or normalized != str(raw_value) or result.has(normalized):
			continue
		if username_list and not _valid_username(normalized):
			continue
		if not username_list and not _valid_command_id(normalized):
			continue
		result.append(normalized)
	return result


static func _valid_username(value: String) -> bool:
	if value.length() < 3 or value.length() > 20:
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if not ((code >= 48 and code <= 57) or (code >= 97 and code <= 122) or code == 95):
			return false
	return true


static func _valid_command_id(value: String) -> bool:
	if value.length() < 2 or value.length() > 80:
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if index == 0 and not (code >= 97 and code <= 122):
			return false
		if index > 0 and not ((code >= 48 and code <= 57) or (code >= 97 and code <= 122) or code == 95):
			return false
	return true
