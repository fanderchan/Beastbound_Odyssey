extends RefCounted

const ServerAuthClientModel := preload(
	"res://scripts/progression/server_auth_client_model.gd"
)

var host
var panel

var _pending_session: Dictionary = {}
var _base_url := ""
var _generation := 0


func _init(main_host = null, character_panel = null) -> void:
	bind(main_host, character_panel)


func bind(main_host, character_panel) -> void:
	host = main_host
	panel = character_panel
	if panel == null:
		return
	if not panel.create_character_requested.is_connected(_on_create_character_requested):
		panel.create_character_requested.connect(_on_create_character_requested)
	if not panel.select_character_requested.is_connected(_on_select_character_requested):
		panel.select_character_requested.connect(_on_select_character_requested)
	if not panel.return_to_login_requested.is_connected(_on_return_to_login_requested):
		panel.return_to_login_requested.connect(_on_return_to_login_requested)


func begin_from_auth(parsed: Dictionary) -> void:
	if host == null or panel == null:
		return
	_generation += 1
	var generation := _generation
	_pending_session = (
		(parsed.get("session", {}) as Dictionary).duplicate(true)
		if parsed.get("session", {}) is Dictionary
		else {}
	)
	_base_url = ServerAuthClientModel.normalized_base_url(str(
		_pending_session.get(
			"serverBaseUrl",
			ServerAuthClientModel.DEFAULT_BASE_URL
		)
	))
	_pending_session["serverBaseUrl"] = _base_url
	var username := str(_pending_session.get("username", "")).strip_edges()
	var response := (
		parsed.get("response", {}) as Dictionary
		if parsed.get("response", {}) is Dictionary
		else {}
	)
	panel.open_with_roster(
		response,
		_preferred_player_id(response),
		username
	)
	panel.set_loading(true, "正在读取角色…")
	host._close_auth_panel(false)
	host._layout_hud()
	if _pending_token() == "":
		panel.show_error("登录会话不完整，请重新登录")
		return
	_refresh_roster(generation)


func reset() -> void:
	_generation += 1
	_pending_session.clear()
	_base_url = ""
	if panel != null:
		panel.set_loading(false)
		panel.visible = false


func has_pending_session() -> bool:
	return not _pending_session.is_empty() and _pending_token() != ""


func snapshot() -> Dictionary:
	return {
		"generation": _generation,
		"hasPendingSession": has_pending_session(),
		"username": str(_pending_session.get("username", "")),
		"playerId": str(_pending_session.get("playerId", "")),
		"baseUrl": _base_url,
		"panelVisible": panel != null and panel.visible,
	}


func enter_selected_character() -> void:
	if panel == null:
		return
	_on_select_character_requested(str(panel.selected_player_id()))


func _refresh_roster(generation: int) -> void:
	var token := _pending_token()
	var response: Dictionary = await host._auto_http_request_spec(
		ServerAuthClientModel.characters_request(_base_url, token)
	)
	if not _request_is_current(generation, token):
		return
	var parsed := ServerAuthClientModel.parse_characters_response(
		int(response.get("responseCode", 0)),
		response.get("body", PackedByteArray()) as PackedByteArray
	)
	if not bool(parsed.get("ok", false)):
		panel.show_error(ServerAuthClientModel.player_message_from_parsed(
			parsed,
			"角色列表读取失败，请稍后重试"
		))
		return
	var roster := parsed.get("response", {}) as Dictionary
	panel.present_roster(roster, _preferred_player_id(roster))
	panel.show_notice("请选择一位角色")


func _on_create_character_requested(payload: Dictionary) -> void:
	if host == null or panel == null or not has_pending_session():
		if panel != null:
			panel.show_error("登录已失效，请重新登录")
		return
	var generation := _generation
	var token := _pending_token()
	var response: Dictionary = await host._auto_http_request_spec(
		ServerAuthClientModel.character_create_request(
			_base_url,
			token,
			int(payload.get("slotIndex", -1)),
			str(payload.get("displayName", ""))
		)
	)
	if not _request_is_current(generation, token):
		return
	var parsed := ServerAuthClientModel.parse_character_create_response(
		int(response.get("responseCode", 0)),
		response.get("body", PackedByteArray()) as PackedByteArray
	)
	if not bool(parsed.get("ok", false)):
		panel.show_error(ServerAuthClientModel.player_message_from_parsed(
			parsed,
			"角色创建失败，请稍后重试"
		))
		return
	var created := (
		parsed.get("character", {}) as Dictionary
		if parsed.get("character", {}) is Dictionary
		else {}
	)
	var roster := parsed.get("response", {}) as Dictionary
	panel.present_roster(roster, str(created.get("playerId", "")))
	panel.show_notice("角色创建成功，请选择角色进入游戏")


func _on_select_character_requested(player_id: String) -> void:
	if host == null or panel == null or not has_pending_session():
		if panel != null:
			panel.show_error("登录已失效，请重新登录")
		return
	var normalized_player_id := player_id.strip_edges()
	if normalized_player_id == "":
		panel.show_error("请选择要进入游戏的角色")
		return
	var generation := _generation
	var token := _pending_token()
	var response: Dictionary = await host._auto_http_request_spec(
		ServerAuthClientModel.character_select_request(
			_base_url,
			token,
			normalized_player_id
		)
	)
	if not _request_is_current(generation, token):
		return
	var parsed := ServerAuthClientModel.parse_character_select_response(
		int(response.get("responseCode", 0)),
		response.get("body", PackedByteArray()) as PackedByteArray,
		_pending_session
	)
	if not bool(parsed.get("ok", false)):
		panel.show_error(ServerAuthClientModel.player_message_from_parsed(
			parsed,
			"暂时无法进入游戏，请稍后重试"
		))
		return
	var selected_session := (
		(parsed.get("session", {}) as Dictionary).duplicate(true)
		if parsed.get("session", {}) is Dictionary
		else {}
	)
	selected_session["serverBaseUrl"] = _base_url
	_pending_session = selected_session.duplicate(true)
	panel.visible = false
	host._remember_auth_session(selected_session)
	host._apply_authenticated_session(selected_session, false)


func _on_return_to_login_requested() -> void:
	if host == null or panel == null:
		return
	var token := _pending_token()
	_generation += 1
	var generation := _generation
	panel.set_loading(true, "正在返回登录…")
	if token != "":
		await host._auto_http_request_spec(
			ServerAuthClientModel.logout_request(_base_url, token)
		)
	if generation != _generation:
		return
	panel.visible = false
	_pending_session.clear()
	_base_url = ""
	host._switch_account_to_login(false)


func _pending_token() -> String:
	return str(_pending_session.get("serverSessionToken", "")).strip_edges()


func _request_is_current(generation: int, token: String) -> bool:
	return (
		generation == _generation
		and token != ""
		and token == _pending_token()
		and panel != null
		and panel.visible
	)


func _preferred_player_id(roster: Dictionary) -> String:
	var selected := (
		roster.get("selectedCharacter", {}) as Dictionary
		if roster.get("selectedCharacter", {}) is Dictionary
		else {}
	)
	var selected_player_id := str(selected.get("playerId", "")).strip_edges()
	if selected_player_id != "":
		return selected_player_id
	var characters = roster.get("characters", [])
	if characters is Array:
		for value in characters as Array:
			if (
				value is Dictionary
				and bool((value as Dictionary).get("selected", false))
			):
				return str((value as Dictionary).get("playerId", "")).strip_edges()
	return ""
