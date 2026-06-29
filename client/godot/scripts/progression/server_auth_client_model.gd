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


static func player_search_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/players/search?username=%s" % [normalized_base_url(base_url), username.uri_encode()],
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func online_players_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/players/online" % normalized_base_url(base_url),
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func player_position_update_request(base_url: String, session_token: String, position: Dictionary) -> Dictionary:
	return {
		"url": "%s/players/position" % normalized_base_url(base_url),
		"headers": [
			"Content-Type: application/json",
			"Authorization: Bearer %s" % session_token,
		],
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(position),
	}


static func event_stream_url(base_url: String, session_token: String) -> String:
	var url := normalized_base_url(base_url)
	if url.begins_with("https://"):
		url = "wss://" + url.substr("https://".length())
	elif url.begins_with("http://"):
		url = "ws://" + url.substr("http://".length())
	return "%s/events?token=%s" % [url, session_token.uri_encode()]


static func party_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/party/state" % normalized_base_url(base_url),
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func party_invite_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/party/invite" % normalized_base_url(base_url),
		"headers": [
			"Content-Type: application/json",
			"Authorization: Bearer %s" % session_token,
		],
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"username": username}),
	}


static func party_invite_accept_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _party_invite_action_request(base_url, session_token, invite_id, "accept")


static func party_invite_decline_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _party_invite_action_request(base_url, session_token, invite_id, "decline")


static func party_leave_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/party/leave" % normalized_base_url(base_url),
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func mail_inbox_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/mail/inbox" % normalized_base_url(base_url),
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func mail_send_request(base_url: String, session_token: String, recipient_username: String, title: String, body: String) -> Dictionary:
	return {
		"url": "%s/mail/send" % normalized_base_url(base_url),
		"headers": [
			"Content-Type: application/json",
			"Authorization: Bearer %s" % session_token,
		],
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"recipientUsername": recipient_username,
			"title": title,
			"body": body,
		}),
	}


static func mail_read_request(base_url: String, session_token: String, mail_id: String) -> Dictionary:
	return {
		"url": "%s/mail/%s/read" % [normalized_base_url(base_url), mail_id.uri_encode()],
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func chat_messages_request(base_url: String, session_token: String, channel: String, limit: int = 50) -> Dictionary:
	return {
		"url": "%s/chat/messages?channel=%s&limit=%d" % [normalized_base_url(base_url), channel.uri_encode(), clampi(limit, 1, 50)],
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func chat_send_request(base_url: String, session_token: String, channel: String, text: String) -> Dictionary:
	return {
		"url": "%s/chat/send" % normalized_base_url(base_url),
		"headers": [
			"Content-Type: application/json",
			"Authorization: Bearer %s" % session_token,
		],
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"channel": channel,
			"text": text,
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
		"accountId": str(account.get("accountId", "")),
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


static func parse_player_search_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "玩家搜索失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var players: Array[Dictionary] = []
	var raw_players = (parsed.get("response", {}) as Dictionary).get("players", [])
	if raw_players is Array:
		for value in raw_players:
			if value is Dictionary:
				players.append((value as Dictionary).duplicate(true))
	parsed["players"] = players
	return parsed


static func parse_online_players_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "在线玩家读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	return parsed


static func parse_player_position_update_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "位置同步失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["position"] = response.get("position", {}) if response.get("position", {}) is Dictionary else {}
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	return parsed


static func parse_event_stream_message(packet: PackedByteArray) -> Dictionary:
	var text := packet.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": "服务器事件格式不正确。", "code": "bad_event_json"}
	var event := parsed as Dictionary
	return {
		"ok": true,
		"event": event,
		"type": str(event.get("type", "")),
	}


static func parse_party_state_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "队伍状态读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["party"] = response.get("party", null)
	parsed["incomingInvites"] = _dictionary_array(response.get("incomingInvites", []))
	parsed["maxMembers"] = int(response.get("maxMembers", 5))
	return parsed


static func parse_party_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "队伍操作失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["party"] = response.get("party", null)
	parsed["invite"] = response.get("invite", {}) if response.get("invite", {}) is Dictionary else {}
	parsed["incomingInvites"] = _dictionary_array(response.get("incomingInvites", []))
	return parsed


static func parse_mail_inbox_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮箱读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var messages: Array[Dictionary] = []
	var raw_messages = (parsed.get("response", {}) as Dictionary).get("messages", [])
	if raw_messages is Array:
		for value in raw_messages:
			if value is Dictionary:
				messages.append((value as Dictionary).duplicate(true))
	parsed["messages"] = messages
	parsed["unreadCount"] = int((parsed.get("response", {}) as Dictionary).get("unreadCount", 0))
	return parsed


static func parse_mail_send_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮件发送失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["mail"] = response.get("mail", {}) if response.get("mail", {}) is Dictionary else {}
	return parsed


static func parse_mail_read_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮件标记失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["mail"] = response.get("mail", {}) if response.get("mail", {}) is Dictionary else {}
	return parsed


static func parse_chat_messages_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "聊天读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["channel"] = str(response.get("channel", "nearby"))
	parsed["messages"] = _dictionary_array(response.get("messages", []))
	parsed["party"] = response.get("party", null)
	return parsed


static func parse_chat_send_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "消息发送失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["message"] = response.get("message", {}) if response.get("message", {}) is Dictionary else {}
	parsed["party"] = response.get("party", null)
	return parsed


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


static func _parse_server_json(response_code: int, body: PackedByteArray, fallback_message: String) -> Dictionary:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		return {"ok": false, "message": "服务器返回格式不正确。", "code": "bad_json"}
	var data := parsed as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(data.get("ok", false)):
		return {
			"ok": false,
			"message": str(data.get("message", fallback_message)),
			"code": str(data.get("code", "server_error")),
			"response": data,
		}
	return {
		"ok": true,
		"message": str(data.get("message", "")),
		"response": data,
	}


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry in value:
			if entry is Dictionary:
				result.append((entry as Dictionary).duplicate(true))
	return result


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


static func _party_invite_action_request(base_url: String, session_token: String, invite_id: String, action: String) -> Dictionary:
	return {
		"url": "%s/party/invites/%s/%s" % [normalized_base_url(base_url), invite_id.uri_encode(), action],
		"headers": ["Authorization: Bearer %s" % session_token],
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}
