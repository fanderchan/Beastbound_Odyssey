extends RefCounted

const PLUGIN_PATH := "user://gm_tools.gmplugin.json"


static func installed() -> bool:
	var plugin := load_plugin()
	return not plugin.is_empty() and bool(plugin.get("enabled", false))


static func allows_username(username: String) -> bool:
	var plugin := load_plugin()
	if plugin.is_empty() or not bool(plugin.get("enabled", false)):
		return false
	var allowed = plugin.get("gmUsernames", [])
	if not (allowed is Array):
		return false
	var normalized := _normalized_username(username)
	for value in allowed as Array:
		var item := _normalized_username(str(value))
		if item == "*" or item == normalized:
			return true
	return false


static func install_local_plugin(usernames: Array[String]) -> bool:
	var normalized_names: Array[String] = []
	for username in usernames:
		var normalized := _normalized_username(username)
		if normalized != "" and not normalized_names.has(normalized):
			normalized_names.append(normalized)
	var plugin := {
		"schemaVersion": 1,
		"enabled": true,
		"gmUsernames": normalized_names,
	}
	var dir_path := PLUGIN_PATH.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
	var file := FileAccess.open(PLUGIN_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(plugin, "\t"))
	file.close()
	return true


static func load_plugin() -> Dictionary:
	if not FileAccess.file_exists(PLUGIN_PATH):
		return {}
	var text := FileAccess.get_file_as_string(PLUGIN_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


static func _normalized_username(username: String) -> String:
	return username.strip_edges().to_lower()
