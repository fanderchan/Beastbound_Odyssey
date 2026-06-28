extends RefCounted

const ACCOUNT_STORE_PATH := "user://accounts.json"
const GM_PLUGIN_PATH := "user://gm_tools.gmplugin.json"
const ROLE_PLAYER := "player"
const ROLE_GM := "gm"
const EFFECTIVE_ROLE_PLAYER := "player"
const EFFECTIVE_ROLE_GM := "gm"
const USERNAME_MIN_LENGTH := 3
const USERNAME_MAX_LENGTH := 20
const PASSWORD_MIN_LENGTH := 4


static func normalized_username(username: String) -> String:
	return username.strip_edges().to_lower()


static func is_valid_username(username: String) -> bool:
	var value := normalized_username(username)
	if value.length() < USERNAME_MIN_LENGTH or value.length() > USERNAME_MAX_LENGTH:
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		var is_digit := code >= 48 and code <= 57
		var is_lower := code >= 97 and code <= 122
		var is_underscore := code == 95
		if not (is_digit or is_lower or is_underscore):
			return false
	return true


static func is_valid_password(password: String) -> bool:
	return password.length() >= PASSWORD_MIN_LENGTH


static func load_store() -> Dictionary:
	if not FileAccess.file_exists(ACCOUNT_STORE_PATH):
		return _empty_store()
	var text := FileAccess.get_file_as_string(ACCOUNT_STORE_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return _empty_store()
	var store := parsed as Dictionary
	if not (store.get("accounts", {}) is Dictionary):
		store["accounts"] = {}
	store["schemaVersion"] = int(store.get("schemaVersion", 1))
	return store


static func save_store(store: Dictionary) -> bool:
	var dir_path := ACCOUNT_STORE_PATH.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
	var file := FileAccess.open(ACCOUNT_STORE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(store, "\t"))
	file.close()
	return true


static func register_player_account(username: String, password: String, display_name: String = "") -> Dictionary:
	var normalized := normalized_username(username)
	if not is_valid_username(normalized):
		return {"ok": false, "message": "账号只能使用3-20位小写字母、数字或下划线。"}
	if not is_valid_password(password):
		return {"ok": false, "message": "密码至少需要4位。"}
	var store := load_store()
	var accounts := store.get("accounts", {}) as Dictionary
	if accounts.has(normalized):
		return {"ok": false, "message": "账号已存在，请直接登录。"}
	var first_account := accounts.is_empty()
	var account := _new_account(normalized, password, display_name, ROLE_PLAYER)
	accounts[normalized] = account
	store["accounts"] = accounts
	if not save_store(store):
		return {"ok": false, "message": "账号保存失败，请稍后重试。"}
	return {
		"ok": true,
		"message": "注册成功。",
		"session": session_for_account(account),
		"firstAccount": first_account,
	}


static func login(username: String, password: String) -> Dictionary:
	var normalized := normalized_username(username)
	var store := load_store()
	var accounts := store.get("accounts", {}) as Dictionary
	if not accounts.has(normalized):
		return {"ok": false, "message": "账号不存在。"}
	var account := accounts.get(normalized, {}) as Dictionary
	var salt := str(account.get("passwordSalt", ""))
	var expected := str(account.get("passwordHash", ""))
	if expected == "" or _password_hash(password, salt) != expected:
		return {"ok": false, "message": "密码不正确。"}
	return {
		"ok": true,
		"message": "登录成功。",
		"session": session_for_account(account),
	}


static func session_for_account(account: Dictionary) -> Dictionary:
	var username := normalized_username(str(account.get("username", "")))
	var role := str(account.get("role", ROLE_PLAYER))
	var can_use_gm := role == ROLE_GM and gm_plugin_allows_username(username)
	return {
		"username": username,
		"displayName": str(account.get("displayName", username)),
		"role": role,
		"effectiveRole": EFFECTIVE_ROLE_GM if can_use_gm else EFFECTIVE_ROLE_PLAYER,
		"gmPluginInstalled": gm_plugin_installed(),
		"profileSavePath": profile_save_path_for_username(username),
	}


static func session_can_use_gm(session: Dictionary) -> bool:
	return str(session.get("effectiveRole", EFFECTIVE_ROLE_PLAYER)) == EFFECTIVE_ROLE_GM


static func dev_gm_session() -> Dictionary:
	return {
		"username": "dev_gm",
		"displayName": "开发GM",
		"role": ROLE_GM,
		"effectiveRole": EFFECTIVE_ROLE_GM,
		"gmPluginInstalled": true,
		"profileSavePath": "user://player_profile.json",
	}


static func profile_save_path_for_username(username: String) -> String:
	var normalized := normalized_username(username)
	if normalized == "":
		normalized = "player"
	return "user://accounts/%s/player_profile.json" % normalized


static func gm_plugin_installed() -> bool:
	var plugin := _load_gm_plugin()
	return not plugin.is_empty() and bool(plugin.get("enabled", false))


static func gm_plugin_allows_username(username: String) -> bool:
	var plugin := _load_gm_plugin()
	if plugin.is_empty() or not bool(plugin.get("enabled", false)):
		return false
	var allowed = plugin.get("gmUsernames", [])
	if not (allowed is Array):
		return false
	var normalized := normalized_username(username)
	for value in allowed as Array:
		var item := normalized_username(str(value))
		if item == "*" or item == normalized:
			return true
	return false


static func ensure_local_gm_account(username: String, password: String, display_name: String = "GM") -> Dictionary:
	var normalized := normalized_username(username)
	var store := load_store()
	var accounts := store.get("accounts", {}) as Dictionary
	var account := {}
	if accounts.has(normalized):
		account = accounts.get(normalized, {}) as Dictionary
		account["role"] = ROLE_GM
		account["displayName"] = display_name
		if password != "":
			var salt := _new_salt()
			account["passwordSalt"] = salt
			account["passwordHash"] = _password_hash(password, salt)
	else:
		account = _new_account(normalized, password, display_name, ROLE_GM)
	accounts[normalized] = account
	store["accounts"] = accounts
	save_store(store)
	return session_for_account(account)


static func install_local_gm_plugin(usernames: Array[String]) -> bool:
	var normalized_names: Array[String] = []
	for username in usernames:
		var normalized := normalized_username(username)
		if normalized != "" and not normalized_names.has(normalized):
			normalized_names.append(normalized)
	var plugin := {
		"schemaVersion": 1,
		"enabled": true,
		"gmUsernames": normalized_names,
	}
	var dir_path := GM_PLUGIN_PATH.get_base_dir()
	if dir_path != "":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
	var file := FileAccess.open(GM_PLUGIN_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(plugin, "\t"))
	file.close()
	return true


static func _load_gm_plugin() -> Dictionary:
	if not FileAccess.file_exists(GM_PLUGIN_PATH):
		return {}
	var text := FileAccess.get_file_as_string(GM_PLUGIN_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


static func _empty_store() -> Dictionary:
	return {
		"schemaVersion": 1,
		"accounts": {},
	}


static func _new_account(username: String, password: String, display_name: String, role: String) -> Dictionary:
	var salt := _new_salt()
	var display := display_name.strip_edges()
	if display == "":
		display = username
	return {
		"username": username,
		"displayName": display,
		"role": role,
		"passwordSalt": salt,
		"passwordHash": _password_hash(password, salt),
		"createdAt": int(Time.get_unix_time_from_system()),
	}


static func _new_salt() -> String:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	return "%d_%d_%d" % [int(Time.get_unix_time_from_system()), Time.get_ticks_usec(), rng.randi()]


static func _password_hash(password: String, salt: String) -> String:
	return ("%s:%s" % [salt, password]).sha256_text()
