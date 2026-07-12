extends RefCounted

const GmQaAccessPolicyModel := preload("res://scripts/progression/gm_qa_access_policy_model.gd")

const PLUGIN_PATH := "user://gm_tools.gmplugin.json"
const SCHEMA_VERSION := 2
const EXPECTED_PLUGIN_KEYS := ["enabled", "expiresAt", "gmCommands", "gmUsernames", "policyId", "schemaVersion"]


static func installed() -> bool:
	return bool(inspect_plugin().get("ok", false))


static func allows_username(username: String) -> bool:
	var inspection := inspect_plugin()
	if not bool(inspection.get("ok", false)):
		return false
	var allowed := inspection.get("gmUsernames", []) as Array
	var normalized := _normalized_username(username)
	for value in allowed:
		var item := _normalized_username(str(value))
		if item == normalized:
			return true
	return false


static func allows_command_id(command_id: String) -> bool:
	var inspection := inspect_plugin()
	if not bool(inspection.get("ok", false)):
		return false
	var commands := inspection.get("gmCommands", []) as Array
	var normalized := _normalized_command_id(command_id)
	for value in commands:
		var item := _normalized_command_id(str(value))
		if item == normalized:
			return true
	return false


static func install_local_plugin(usernames: Array[String], command_ids: Array[String], expires_at: String) -> bool:
	var normalized_names: Array[String] = []
	for username in usernames:
		var normalized := _normalized_username(username)
		if normalized != "" and normalized != "*" and not normalized_names.has(normalized):
			normalized_names.append(normalized)
	var normalized_commands: Array[String] = []
	for command_id in command_ids:
		var normalized_command := _normalized_command_id(command_id)
		if normalized_command != "" and normalized_command != "*" and not normalized_commands.has(normalized_command):
			normalized_commands.append(normalized_command)
	if (
		normalized_names.size() != usernames.size()
		or normalized_commands.size() != command_ids.size()
		or normalized_names != GmQaAccessPolicyModel.allowed_usernames()
		or normalized_commands != GmQaAccessPolicyModel.client_command_ids()
		or not GmQaAccessPolicyModel.future_expiry_is_valid(expires_at)
	):
		return false
	var plugin := {
		"schemaVersion": SCHEMA_VERSION,
		"policyId": GmQaAccessPolicyModel.policy_id(),
		"enabled": true,
		"expiresAt": expires_at.strip_edges(),
		"gmUsernames": normalized_names,
		"gmCommands": normalized_commands,
	}
	var dir_path := PLUGIN_PATH.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
	var file := FileAccess.open(PLUGIN_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(plugin, "\t"))
	file.close()
	return bool(inspect_plugin().get("ok", false))


static func inspect_plugin(now_sec: int = -1) -> Dictionary:
	if not FileAccess.file_exists(PLUGIN_PATH):
		return _inspection_failure("missing", "需要重新初始化 GM 测试授权。")
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(PLUGIN_PATH))
	if not (parsed is Dictionary):
		return _inspection_failure("invalid", "需要重新初始化 GM 测试授权。")
	var plugin := parsed as Dictionary
	var actual_keys: Array[String] = []
	for key in plugin.keys():
		actual_keys.append(str(key))
	actual_keys.sort()
	var expected_keys: Array[String] = []
	for key in EXPECTED_PLUGIN_KEYS:
		expected_keys.append(str(key))
	expected_keys.sort()
	if (
		actual_keys != expected_keys
		or not GmQaAccessPolicyModel.integer_value_is_exact(plugin.get("schemaVersion", null), SCHEMA_VERSION)
		or not (plugin.get("policyId", null) is String)
		or str(plugin.get("policyId", "")).strip_edges() != GmQaAccessPolicyModel.policy_id()
		or not (plugin.get("enabled", null) is bool)
		or not bool(plugin.get("enabled", false))
		or not (plugin.get("expiresAt", null) is String)
		or not (plugin.get("gmUsernames", null) is Array)
		or not (plugin.get("gmCommands", null) is Array)
	):
		return _inspection_failure("invalid", "需要重新初始化 GM 测试授权。")
	var normalized_names := _normalized_values(plugin.get("gmUsernames", []), true)
	var normalized_commands := _normalized_values(plugin.get("gmCommands", []), false)
	if (
		normalized_names.size() != (plugin.get("gmUsernames", []) as Array).size()
		or normalized_commands.size() != (plugin.get("gmCommands", []) as Array).size()
		or normalized_names != GmQaAccessPolicyModel.allowed_usernames()
		or normalized_commands != GmQaAccessPolicyModel.client_command_ids()
	):
		return _inspection_failure("invalid", "需要重新初始化 GM 测试授权。")
	var expires_at := str(plugin.get("expiresAt", "")).strip_edges()
	var expires_at_unix := GmQaAccessPolicyModel.expires_at_unix(expires_at)
	var now_value := now_sec if now_sec >= 0 else int(Time.get_unix_time_from_system())
	if expires_at_unix < 0:
		return _inspection_failure("invalid", "需要重新初始化 GM 测试授权。")
	if expires_at_unix <= now_value:
		return _inspection_failure("expired", "GM 测试授权已到期，需要重新初始化。")
	return {
		"ok": true,
		"schemaVersion": SCHEMA_VERSION,
		"policyId": GmQaAccessPolicyModel.policy_id(),
		"enabled": true,
		"expiresAt": expires_at,
		"expiresAtUnix": expires_at_unix,
		"gmUsernames": normalized_names,
		"gmCommands": normalized_commands,
		"message": "",
	}


static func load_plugin() -> Dictionary:
	if not FileAccess.file_exists(PLUGIN_PATH):
		return {}
	var text := FileAccess.get_file_as_string(PLUGIN_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


static func _inspection_failure(reason: String, message: String) -> Dictionary:
	return {
		"ok": false,
		"reason": reason,
		"message": message,
	}


static func _normalized_values(value: Variant, username_values: bool) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for raw_value in value as Array:
		if not (raw_value is String):
			continue
		var normalized := _normalized_username(str(raw_value)) if username_values else _normalized_command_id(str(raw_value))
		if normalized == "" or normalized == "*" or result.has(normalized):
			continue
		result.append(normalized)
	return result


static func _normalized_username(username: String) -> String:
	return username.strip_edges().to_lower()


static func _normalized_command_id(command_id: String) -> String:
	return command_id.strip_edges().to_lower()
