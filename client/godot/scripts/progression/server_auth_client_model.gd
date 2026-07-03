extends RefCounted

const AccountAuthModel := preload("res://scripts/progression/account_auth_model.gd")

const DEFAULT_BASE_URL := "http://127.0.0.1:8787"
const SOURCE_SERVER := "server"
const CLIENT_VERSION := "0.1.0"
const CLIENT_PROTOCOL_VERSION := 1
const SESSION_INVALID_CODES := [
	"session_expired",
	"session_refresh_expired",
	"session_revoked",
	"session_missing",
]


static func normalized_base_url(base_url: String) -> String:
	var value := base_url.strip_edges()
	if value == "":
		value = DEFAULT_BASE_URL
	while value.ends_with("/"):
		value = value.substr(0, value.length() - 1)
	return value


static func protocol_query() -> String:
	return "clientVersion=%s&clientProtocolVersion=%d" % [CLIENT_VERSION.uri_encode(), CLIENT_PROTOCOL_VERSION]


static func request_headers(extra: Array[String] = []) -> Array[String]:
	var headers: Array[String] = [
		"X-Beastbound-Client-Version: %s" % CLIENT_VERSION,
		"X-Beastbound-Protocol-Version: %d" % CLIENT_PROTOCOL_VERSION,
	]
	headers.append_array(extra)
	return headers


static func _auth_headers(session_token: String) -> Array[String]:
	return request_headers(["Authorization: Bearer %s" % session_token])


static func _json_headers() -> Array[String]:
	return request_headers(["Content-Type: application/json"])


static func _json_auth_headers(session_token: String) -> Array[String]:
	return request_headers([
		"Content-Type: application/json",
		"Authorization: Bearer %s" % session_token,
	])


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


static func refresh_session_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/auth/refresh" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func is_session_invalid_code(code: String) -> bool:
	return SESSION_INVALID_CODES.has(code.strip_edges())


static func is_session_invalid_response(parsed: Dictionary) -> bool:
	return is_session_invalid_code(str(parsed.get("code", "")))


static func profile_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/profiles/me" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func profile_upload_disabled_probe_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/profiles/me" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_PUT,
		"body": JSON.stringify({"profile": {}}),
	}


# Legacy auto checks still call this name; it intentionally sends only the disabled probe.
static func profile_upload_request(base_url: String, session_token: String, _profile: Dictionary, _expected_revision: int) -> Dictionary:
	return profile_upload_disabled_probe_request(base_url, session_token)


static func profile_action_request(base_url: String, session_token: String, action: String, payload: Dictionary = {}) -> Dictionary:
	return {
		"url": "%s/profile/action" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"action": action,
			"payload": payload,
		}),
	}


static func shop_transaction_request(base_url: String, session_token: String, mode: String, shop_id: String, item_id: String, amount: int) -> Dictionary:
	return {
		"url": "%s/shops/transaction" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"mode": mode,
			"shopId": shop_id,
			"itemId": item_id,
			"amount": maxi(1, amount),
		}),
	}


static func equipment_equip_request(base_url: String, session_token: String, item_id: String) -> Dictionary:
	return {
		"url": "%s/equipment/equip" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"itemId": item_id,
		}),
	}


static func equipment_enhance_request(base_url: String, session_token: String, slot_id: String) -> Dictionary:
	return {
		"url": "%s/equipment/enhance" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"slotId": slot_id,
		}),
	}


static func equipment_repair_all_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/equipment/repair-all" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func equipment_synthesize_request(base_url: String, session_token: String, recipe_id: String) -> Dictionary:
	return {
		"url": "%s/equipment/synthesize" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"recipeId": recipe_id,
		}),
	}


static func player_rebirth_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/player/rebirth" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func quest_record_request(base_url: String, session_token: String, event: Dictionary, quest_id: String = "") -> Dictionary:
	var payload := {
		"event": event,
	}
	if quest_id.strip_edges() != "":
		payload["questId"] = quest_id.strip_edges()
	return {
		"url": "%s/quests/record" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	}


static func quest_claim_request(base_url: String, session_token: String, quest_id: String = "", reward_choice_id: String = "") -> Dictionary:
	var payload := {}
	if quest_id.strip_edges() != "":
		payload["questId"] = quest_id.strip_edges()
	if reward_choice_id.strip_edges() != "":
		payload["rewardChoiceId"] = reward_choice_id.strip_edges()
	return {
		"url": "%s/quests/claim" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	}


static func player_search_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/players/search?username=%s" % [normalized_base_url(base_url), username.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func online_players_request(base_url: String, session_token: String, scope: String = "", aoi: Dictionary = {}) -> Dictionary:
	var url := "%s/players/online" % normalized_base_url(base_url)
	var query := PackedStringArray()
	var normalized_scope := scope.strip_edges()
	if normalized_scope != "":
		query.append("scope=%s" % normalized_scope.uri_encode())
	if aoi.has("mapId"):
		query.append("mapId=%s" % str(aoi.get("mapId", "")).uri_encode())
	if aoi.has("cellX"):
		query.append("cellX=%s" % str(aoi.get("cellX", "")).uri_encode())
	if aoi.has("cellY"):
		query.append("cellY=%s" % str(aoi.get("cellY", "")).uri_encode())
	if aoi.has("radius"):
		query.append("radius=%s" % str(aoi.get("radius", "")).uri_encode())
	if not query.is_empty():
		url += "?%s" % "&".join(query)
	return {
		"url": url,
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func player_position_update_request(base_url: String, session_token: String, position: Dictionary) -> Dictionary:
	return {
		"url": "%s/players/position" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(position),
	}


static func movement_step_request(base_url: String, session_token: String, step: Dictionary) -> Dictionary:
	return {
		"url": "%s/movement/step" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(step),
	}


static func event_stream_url(base_url: String, session_token: String, last_event_seq: int = 0) -> String:
	var url := normalized_base_url(base_url)
	if url.begins_with("https://"):
		url = "wss://" + url.substr("https://".length())
	elif url.begins_with("http://"):
		url = "ws://" + url.substr("http://".length())
	var query := "%s&token=%s" % [protocol_query(), session_token.uri_encode()]
	if last_event_seq > 0:
		query += "&lastEventSeq=%d" % last_event_seq
	return "%s/events?%s" % [url, query]


static func event_latest_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/events/latest" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func party_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/party/state" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func party_invite_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/party/invite" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"username": username}),
	}


static func party_apply_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/party/apply" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
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
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func battle_state_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/battle/state" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func battle_record_summary_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/battle/records/summary?username=%s" % [normalized_base_url(base_url), username.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func battle_invite_request(base_url: String, session_token: String, username: String) -> Dictionary:
	return {
		"url": "%s/battle/invite" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({"username": username}),
	}


static func party_battle_encounter_request(base_url: String, session_token: String, encounter_zone: Dictionary, enemy_count: int) -> Dictionary:
	return {
		"url": "%s/battle/party-encounter" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"encounterZone": encounter_zone,
			"enemyCount": enemy_count,
		}),
	}


static func hang_session_start_request(base_url: String, session_token: String, mode: String, map_id: String, cell: Vector2i, settings: Dictionary = {}, item_id: String = "") -> Dictionary:
	var body := {
		"mode": mode,
		"mapId": map_id,
		"originMapId": map_id,
		"originCell": [cell.x, cell.y],
		"cellX": cell.x,
		"cellY": cell.y,
		"settings": settings,
	}
	if item_id.strip_edges() != "":
		body["itemId"] = item_id.strip_edges()
	return {
		"url": "%s/hang/session/start" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(body),
	}


static func hang_session_stop_request(base_url: String, session_token: String, reason: String = "manual", pending_resume: bool = false) -> Dictionary:
	return {
		"url": "%s/hang/session/stop" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"reason": reason,
			"pendingResume": pending_resume,
		}),
	}


static func battle_invite_accept_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _battle_invite_action_request(base_url, session_token, invite_id, "accept")


static func battle_invite_decline_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _battle_invite_action_request(base_url, session_token, invite_id, "decline")


static func battle_invite_cancel_request(base_url: String, session_token: String, invite_id: String) -> Dictionary:
	return _battle_invite_action_request(base_url, session_token, invite_id, "cancel")


static func battle_room_leave_request(base_url: String, session_token: String, room_id: String) -> Dictionary:
	return {
		"url": "%s/battle/rooms/%s/leave" % [normalized_base_url(base_url), room_id.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func battle_command_submit_request(base_url: String, session_token: String, room_id: String, command: Dictionary) -> Dictionary:
	return {
		"url": "%s/battle/rooms/%s/commands" % [normalized_base_url(base_url), room_id.uri_encode()],
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(command),
	}


static func mail_inbox_request(base_url: String, session_token: String) -> Dictionary:
	return {
		"url": "%s/mail/inbox" % normalized_base_url(base_url),
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func mail_send_request(base_url: String, session_token: String, recipient_username: String, title: String, body: String) -> Dictionary:
	return {
		"url": "%s/mail/send" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
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
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func mail_claim_request(base_url: String, session_token: String, mail_id: String) -> Dictionary:
	return {
		"url": "%s/mail/%s/claim" % [normalized_base_url(base_url), mail_id.uri_encode()],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func chat_messages_request(base_url: String, session_token: String, channel: String, limit: int = 50) -> Dictionary:
	return {
		"url": "%s/chat/messages?channel=%s&limit=%d" % [normalized_base_url(base_url), channel.uri_encode(), clampi(limit, 1, 50)],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func chat_send_request(base_url: String, session_token: String, channel: String, text: String) -> Dictionary:
	return {
		"url": "%s/chat/send" % normalized_base_url(base_url),
		"headers": _json_auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify({
			"channel": channel,
			"text": text,
		}),
	}


static func parse_auth_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	if text.strip_edges() == "":
		return {"ok": false, "message": "服务器返回为空。", "code": "bad_json"}
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
		"passwordUpgradeRequired": bool(session.get("passwordUpgradeRequired", false)),
		"passwordPolicyMessage": str(session.get("passwordPolicyMessage", "")),
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
	parsed["aoi"] = response.get("aoi", {}) if response.get("aoi", {}) is Dictionary else {}
	return parsed


static func parse_player_position_update_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "位置同步失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["position"] = response.get("position", {}) if response.get("position", {}) is Dictionary else {}
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	parsed["aoi"] = response.get("aoi", {}) if response.get("aoi", {}) is Dictionary else {}
	return parsed


static func parse_movement_step_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "移动提交失败。")
	var response := parsed.get("response", {}) as Dictionary
	parsed["position"] = response.get("position", {}) if response.get("position", {}) is Dictionary else {}
	parsed["players"] = _dictionary_array(response.get("players", []))
	parsed["party"] = response.get("party", null)
	parsed["aoi"] = response.get("aoi", {}) if response.get("aoi", {}) is Dictionary else {}
	parsed["authority"] = str(response.get("authority", ""))
	parsed["movement"] = response.get("movement", {}) if response.get("movement", {}) is Dictionary else {}
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


static func parse_event_latest_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "事件游标读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["latestEventSeq"] = int(response.get("latestEventSeq", 0))
	return parsed


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


static func parse_battle_state_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "切磋状态读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["room"] = response.get("room", null)
	parsed["incomingInvites"] = _dictionary_array(response.get("incomingInvites", []))
	parsed["outgoingInvites"] = _dictionary_array(response.get("outgoingInvites", []))
	return parsed


static func parse_battle_record_summary_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "对战战绩读取失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["summary"] = response.get("summary", {}) if response.get("summary", {}) is Dictionary else {}
	return parsed


static func parse_battle_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "切磋操作失败。")
	if not bool(parsed.get("ok", false)):
		return parsed
	var response := parsed.get("response", {}) as Dictionary
	parsed["room"] = response.get("room", null)
	parsed["invite"] = response.get("invite", {}) if response.get("invite", {}) is Dictionary else {}
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	return parsed


static func parse_battle_command_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "回合命令提交失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["room"] = response.get("room", null)
	parsed["command"] = response.get("command", {}) if response.get("command", {}) is Dictionary else {}
	parsed["turn"] = response.get("turn", null)
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	if not bool(parsed.get("ok", false)):
		return parsed
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


static func parse_mail_claim_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "邮件附件领取失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["mail"] = response.get("mail", null)
	parsed["claim"] = response.get("claim", {}) if response.get("claim", {}) is Dictionary else {}
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


static func parse_profile_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "档案操作失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["result"] = response.get("result", {}) if response.get("result", {}) is Dictionary else {}
	parsed["logLines"] = _string_array(response.get("logLines", []))
	return parsed


static func parse_hang_session_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "挂机同步失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["hang"] = response.get("hang", {}) if response.get("hang", {}) is Dictionary else {}
	return parsed


static func parse_shop_transaction_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "商店交易失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["transaction"] = response.get("transaction", {}) if response.get("transaction", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_equipment_equip_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "装备失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["equipment"] = response.get("equipment", {}) if response.get("equipment", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_equipment_enhance_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "强化失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["enhancement"] = response.get("enhancement", {}) if response.get("enhancement", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_equipment_repair_all_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "修理失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["repair"] = response.get("repair", {}) if response.get("repair", {}) is Dictionary else {}
	return parsed


static func parse_equipment_synthesize_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "合成失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["synthesis"] = response.get("synthesis", {}) if response.get("synthesis", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func parse_player_rebirth_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "转生失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["rebirth"] = response.get("rebirth", {}) if response.get("rebirth", {}) is Dictionary else {}
	parsed["returnEntry"] = response.get("returnEntry", {}) if response.get("returnEntry", {}) is Dictionary else {}
	return parsed


static func parse_quest_action_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var parsed := _parse_server_json(response_code, body, "任务同步失败。")
	var response := parsed.get("response", {}) as Dictionary if parsed.get("response", {}) is Dictionary else {}
	parsed["profile"] = response.get("profile", null)
	parsed["profileBinding"] = response.get("profileBinding", {}) if response.get("profileBinding", {}) is Dictionary else {}
	parsed["profileSummary"] = response.get("profileSummary", {}) if response.get("profileSummary", {}) is Dictionary else {}
	parsed["progress"] = response.get("progress", {}) if response.get("progress", {}) is Dictionary else {}
	parsed["claim"] = response.get("claim", {}) if response.get("claim", {}) is Dictionary else {}
	parsed["questMessages"] = _string_array(response.get("questMessages", []))
	return parsed


static func _parse_server_json(response_code: int, body: PackedByteArray, fallback_message: String) -> Dictionary:
	var text := body.get_string_from_utf8()
	if text.strip_edges() == "":
		return {"ok": false, "message": "服务器返回为空。", "code": "bad_json", "response": {}}
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


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for entry in value:
			var text := str(entry)
			if text != "":
				result.append(text)
	return result


static func profile_save_path_for_username(username: String) -> String:
	var normalized := AccountAuthModel.normalized_username(username)
	if normalized == "":
		normalized = "player"
	return "user://server_accounts/%s/player_profile.json" % normalized


static func _auth_request(base_url: String, endpoint: String, payload: Dictionary) -> Dictionary:
	return {
		"url": "%s%s" % [normalized_base_url(base_url), endpoint],
		"headers": _json_headers(),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(payload),
	}


static func _party_invite_action_request(base_url: String, session_token: String, invite_id: String, action: String) -> Dictionary:
	return {
		"url": "%s/party/invites/%s/%s" % [normalized_base_url(base_url), invite_id.uri_encode(), action],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}


static func _battle_invite_action_request(base_url: String, session_token: String, invite_id: String, action: String) -> Dictionary:
	return {
		"url": "%s/battle/invites/%s/%s" % [normalized_base_url(base_url), invite_id.uri_encode(), action],
		"headers": _auth_headers(session_token),
		"method": HTTPClient.METHOD_POST,
		"body": "",
	}
