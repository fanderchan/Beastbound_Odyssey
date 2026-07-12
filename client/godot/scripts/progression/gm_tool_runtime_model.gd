extends RefCounted

const GmQaAccessPolicyModel := preload("res://scripts/progression/gm_qa_access_policy_model.gd")
const GmToolPluginModel := preload("res://scripts/progression/gm_tool_plugin_model.gd")

const EFFECTIVE_ROLE_GM := "gm"
const AUDIT_PATH := "user://gm_tool_audit.jsonl"
const MAX_AUDIT_LINES := 500


static func command_ids_from_entries(entries: Array[Dictionary]) -> Array[String]:
	var result: Array[String] = []
	for entry in entries:
		var command_id := str(entry.get("id", "")).strip_edges()
		if command_id != "" and not result.has(command_id):
			result.append(command_id)
	return result


static func session_can_open_tools(session: Dictionary) -> bool:
	var username := str(session.get("username", "")).strip_edges()
	return (
		str(session.get("effectiveRole", "")) == EFFECTIVE_ROLE_GM
		and GmToolPluginModel.installed()
		and GmToolPluginModel.allows_username(username)
	)


static func authorize_command(
	session: Dictionary,
	command_id: String,
	allowed_command_ids: Array[String],
	server_access_state: Dictionary = {}
) -> Dictionary:
	var normalized_command_id := command_id.strip_edges()
	if normalized_command_id == "":
		return {"ok": false, "message": "GM命令为空。", "code": "empty_command"}
	var username := str(session.get("username", "")).strip_edges()
	if str(session.get("effectiveRole", "")) != EFFECTIVE_ROLE_GM:
		return {"ok": false, "message": "当前账号没有GM权限。", "code": "role_denied"}
	if not GmToolPluginModel.installed():
		return {"ok": false, "message": "未加载GM插件。", "code": "plugin_missing"}
	if not GmToolPluginModel.allows_username(username):
		return {"ok": false, "message": "GM插件未授权当前账号。", "code": "user_denied"}
	if not allowed_command_ids.has(normalized_command_id):
		return {"ok": false, "message": "GM命令不在客户端白名单。", "code": "client_command_denied"}
	if not GmToolPluginModel.allows_command_id(normalized_command_id):
		return {"ok": false, "message": "当前测试授权不包含此功能。", "code": "plugin_command_denied"}
	if (
		GmQaAccessPolicyModel.server_authoritative_client_command_ids().has(normalized_command_id)
		and not server_authorizes_command(session, normalized_command_id, server_access_state)
	):
		return {"ok": false, "message": "服务器授权尚未确认，请重新初始化后再试。", "code": "server_command_denied"}
	return {"ok": true, "message": "", "code": "ok"}


static func command_available(
	session: Dictionary,
	command_id: String,
	allowed_command_ids: Array[String],
	server_access_state: Dictionary = {}
) -> bool:
	return bool(authorize_command(session, command_id, allowed_command_ids, server_access_state).get("ok", false))


static func server_authorizes_command(session: Dictionary, command_id: String, server_access_state: Dictionary) -> bool:
	if not server_access_snapshot_is_valid(session, server_access_state):
		return false
	var commands = server_access_state.get("commandIds", [])
	return commands is Array and (commands as Array).has(command_id.strip_edges().to_lower())


static func server_access_snapshot_is_valid(session: Dictionary, state: Dictionary, now_sec: int = -1) -> bool:
	if not bool(state.get("ok", false)):
		return false
	var username := str(session.get("username", "")).strip_edges().to_lower()
	if (
		username == ""
		or str(session.get("effectiveRole", "")) != EFFECTIVE_ROLE_GM
		or str(state.get("username", "")).strip_edges().to_lower() != username
		or not GmQaAccessPolicyModel.integer_value_is_exact(state.get("schemaVersion", null), 2)
		or str(state.get("effectiveRole", "")) != EFFECTIVE_ROLE_GM
		or str(state.get("policyId", "")) != GmQaAccessPolicyModel.policy_id()
		or not (state.get("expiresAt", null) is String)
		or not GmQaAccessPolicyModel.future_expiry_is_valid(str(state.get("expiresAt", "")), now_sec)
		or not (state.get("commandIds", null) is Array)
	):
		return false
	var normalized_commands: Array[String] = []
	for value in state.get("commandIds", []) as Array:
		if not (value is String):
			return false
		var command_id := str(value).strip_edges().to_lower()
		if (
			command_id == ""
			or command_id == "*"
			or normalized_commands.has(command_id)
			or not GmQaAccessPolicyModel.server_command_ids().has(command_id)
		):
			return false
		normalized_commands.append(command_id)
	return true


static func available_command_count(session: Dictionary, server_access_state: Dictionary = {}) -> int:
	var count := 0
	var allowed := GmQaAccessPolicyModel.client_command_ids()
	for command_id in allowed:
		if command_available(session, command_id, allowed, server_access_state):
			count += 1
	return count


static func safe_access_text(session: Dictionary, server_access_state: Dictionary = {}) -> String:
	if str(session.get("effectiveRole", "")) != EFFECTIVE_ROLE_GM:
		return "授权：当前账号不是 GM"
	var plugin := GmToolPluginModel.inspect_plugin()
	if not bool(plugin.get("ok", false)) or not GmToolPluginModel.allows_username(str(session.get("username", ""))):
		return "授权：需要重新初始化"
	if bool(server_access_state.get("pending", false)):
		return "授权：正在向服务器确认……"
	if not server_access_snapshot_is_valid(session, server_access_state):
		return "授权：服务器权限未确认，高价值操作暂不可用"
	var plugin_expiry := int(plugin.get("expiresAtUnix", -1))
	var server_expiry := GmQaAccessPolicyModel.expires_at_unix(str(server_access_state.get("expiresAt", "")))
	var effective_expires_at := str(plugin.get("expiresAt", "")) if plugin_expiry <= server_expiry else str(server_access_state.get("expiresAt", ""))
	var effective_expiry_text := GmQaAccessPolicyModel.expiry_display_text(effective_expires_at)
	return "授权：有效至 %s / 可用功能 %d 项" % [
		effective_expiry_text,
		available_command_count(session, server_access_state),
	]


static func audit_command(session: Dictionary, command_id: String, ok: bool, message: String = "") -> void:
	var entry := {
		"time": int(Time.get_unix_time_from_system()),
		"username": str(session.get("username", "")),
		"commandId": command_id,
		"ok": ok,
		"message": message,
	}
	var lines: Array[String] = []
	if FileAccess.file_exists(AUDIT_PATH):
		for line in FileAccess.get_file_as_string(AUDIT_PATH).split("\n", false):
			var stripped := str(line).strip_edges()
			if stripped != "":
				lines.append(stripped)
	lines.append(JSON.stringify(entry))
	while lines.size() > MAX_AUDIT_LINES:
		lines.pop_front()
	var dir_path := AUDIT_PATH.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
	var file := FileAccess.open(AUDIT_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string("\n".join(lines))
	file.close()
