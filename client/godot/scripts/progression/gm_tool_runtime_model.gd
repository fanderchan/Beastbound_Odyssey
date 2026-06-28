extends RefCounted

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


static func authorize_command(session: Dictionary, command_id: String, allowed_command_ids: Array[String]) -> Dictionary:
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
		return {"ok": false, "message": "GM插件未授权该命令。", "code": "plugin_command_denied"}
	return {"ok": true, "message": "", "code": "ok"}


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
