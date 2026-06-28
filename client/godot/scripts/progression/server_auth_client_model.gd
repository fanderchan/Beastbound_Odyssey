extends RefCounted

const AccountAuthModel := preload("res://scripts/progression/account_auth_model.gd")

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const SOURCE_SERVER := "server"


static func normalized_base_url(base_url: String) -> String:
	var value := base_url.strip_edges()
	if value == "":
		value = DEFAULT_BASE_URL
	while value.ends_with("/"):
		value = value.substr(0, value.length() - 1)
	return value


static func register_request(base_url: String, username: String, password: String, display_name: String) -> Dictionary:
	return _auth_request(base_url, "/auth/register", {
		"username": username,
		"password": password,
		"displayName": display_name,
	})


static func login_request(base_url: String, username: String, password: String) -> Dictionary:
	return _auth_request(base_url, "/auth/login", {
		"username": username,
		"password": password,
	})


static func profile_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/profiles/me" % normalized_base_url(base_url),
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func profile_upload_request(base_url: String, session_token: String, profile: Dictionary, expected_revision: int) -> Dictionary:
	return {
		"url": "%s/profiles/me" % normalized_base_url(base_url),
		"headers": [
			"Content-Type: application/json",
			"Authorization: Bearer %s" % session_token,
		],
		"method": HTTPClient.METHOD_PUT,
		"body": JSON.stringify({
			"expectedRevision": maxi(0, expected_revision),
			"profile": profile,
		}),
	}


static func parse_auth_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": "服务器返回格式不正确。", "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		return {
			"ok": false,
			"message": str(data.get("message", "服务器登录失败。")),
			"code": str(data.get("code", "server_error")),
			"response": data,
		}
	var account := data.get("account", {}) as Dictionary if data.get("account", {}) is Dictionary else {}
	var session := data.get("session", {}) as Dictionary if data.get("session", {}) is Dictionary else {}
	var username := AccountAuthModel.normalized_username(str(account.get("username", session.get("username", ""))))
	var display_name := str(account.get("displayName", username))
	var role := str(account.get("role", AccountAuthModel.ROLE_PLAYER))
	var effective_role := str(session.get("effectiveRole", AccountAuthModel.EFFECTIVE_ROLE_PLAYER))
	if username == "":
		return {"ok": false, "message": "服务器会话缺少账号。", "code": "missing_username"}
	var local_session := {
		"username": username,
		"displayName": display_name,
		"role": role,
		"effectiveRole": effective_role,
		"gmPluginInstalled": false,
		"profileSavePath": profile_save_path_for_username(username),
		"authSource": SOURCE_SERVER,
		"serverSessionId": str(session.get("sessionId", "")),
		"serverSessionToken": str(session.get("token", "")),
		"serverExpiresAt": str(session.get("expiresAt", "")),
		"serverProfileBinding": data.get("profileBinding", {}),
		"serverProfileSummary": data.get("profileSummary", {}),
	}
	return {
		"ok": true,
		"message": str(data.get("message", "已连接服务器。")),
		"session": local_session,
		"account": account,
		"response": data,
	}


static func parse_profile_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": "服务器档案返回格式不正确。", "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		return {
			"ok": false,
			"message": str(data.get("message", "服务器档案读取失败。")),
			"code": str(data.get("code", "server_error")),
			"response": data,
		}
	return {
		"ok": true,
		"profile": data.get("profile", null),
		"profileBinding": data.get("profileBinding", {}),
		"profileSummary": data.get("profileSummary", {}),
		"message": str(data.get("message", "已读取服务器档案摘要。")),
		"response": data,
	}


static func parse_profile_upload_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": "服务器保存返回格式不正确。", "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		return {
			"ok": false,
			"message": str(data.get("message", "服务器档案保存失败。")),
			"code": str(data.get("code", "server_error")),
			"profileSummary": data.get("profileSummary", {}),
			"profileBinding": data.get("profileBinding", {}),
			"response": data,
		}
	return {
		"ok": true,
		"profileBinding": data.get("profileBinding", {}),
		"profileSummary": data.get("profileSummary", {}),
		"message": str(data.get("message", "角色档案已同步。")),
		"response": data,
	}


static func profile_save_path_for_username(username: String) -> String:
	var normalized := AccountAuthModel.normalized_username(username)
	if normalized == "":
		normalized = "player"
	return "user://server_accounts/%s/player_profile.json" % normalized


static func _auth_request(base_url: String, endpoint: String, payload: Dictionary) -> Dictionary:
	return {
		"url": "%s%s" % [normalized_base_url(base_url), endpoint],
		"headers": ["Content-Type: application/json"],
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	}
