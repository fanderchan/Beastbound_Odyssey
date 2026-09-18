extends RefCounted

const Api := preload("res://scripts/progression/server_auth_client_model.gd")
const PresenceCache := preload("res://scripts/net/online_presence_cache_model.gd")


static func run(host: Node, base_url: String, observer_session: Dictionary) -> Dictionary:
	var errors: Array[String] = []
	var observer_id := str(observer_session.get("accountId", ""))
	var actor_id := str(host.current_account_session.get("accountId", ""))
	var socket := WebSocketPeer.new()
	socket.handshake_headers = Api.event_stream_headers(str(observer_session.get("serverSessionToken", "")))
	var cache := PresenceCache.new()
	if socket.connect_to_url(Api.event_stream_url(base_url)) != OK:
		return {"ok": false, "errors": ["旁观连接无法启动"]}
	await _wait_for_revision(host, socket, cache, observer_id, actor_id, 0)
	if not cache.has_account(actor_id):
		errors.append("刷新前旁观者未收到角色")
	var refreshed_visible: Array[bool] = []
	var callback_count := 3
	for index in range(callback_count):
		var revision: int = cache.revision_for(actor_id)
		# Exercise the real timer callback and the default request builder, not a
		# hand-built test payload that would mask the scope regression.
		host._on_online_position_timer_timeout()
		await _wait_for_revision(host, socket, cache, observer_id, actor_id, revision)
		var visible: bool = cache.has_account(actor_id)
		refreshed_visible.append(visible)
		if not visible or cache.revision_for(actor_id) <= revision:
			errors.append("静止刷新 %d 后旁观角色消失或没有增量" % (index + 1))
			await _close_observer(host, socket)
			return {"ok": false, "timerCallbacks": index + 1, "visibleAfterRefresh": refreshed_visible,
				"defaultScope": host._current_online_map_payload().get("scope", ""), "errors": errors}
	# Explicit map-only requests retain the server's existing privacy contract.
	var before_private: int = cache.revision_for(actor_id)
	var private_payload: Dictionary = host._current_online_position_payload()
	private_payload["scope"] = "map"
	host._request_online_position_snapshot(private_payload)
	await _wait_for_revision(host, socket, cache, observer_id, actor_id, before_private)
	var map_only_hidden := not cache.has_account(actor_id)
	if not map_only_hidden:
		errors.append("显式 map-only 请求泄露旁观坐标")
	var before_restore: int = cache.revision_for(actor_id)
	host._request_online_position_snapshot()
	await _wait_for_revision(host, socket, cache, observer_id, actor_id, before_restore)
	var restored: bool = cache.has_account(actor_id)
	if not restored:
		errors.append("恢复普通刷新后角色未重新出现")
	var response: Dictionary = await host._auto_http_request_spec(Api.online_players_request(
		base_url, str(observer_session.get("serverSessionToken", "")), "aoi", {
			"mapId": host.current_map_id,
			"cellX": private_payload.cellX, "cellY": private_payload.cellY, "radius": 18,
		}
	))
	var parsed := Api.parse_online_players_response(int(response.get("responseCode", 0)), response.get("body", PackedByteArray()))
	var http_visible := false
	for row in parsed.get("players", []):
		if str(row.get("accountId", "")) == actor_id:
			http_visible = bool(row.get("position", {}).get("hasCell", false)) and str(row.get("appearanceId", "")) != ""
	if not http_visible:
		errors.append("HTTP AOI 名册缺少精确位置或人物外观")
	await _close_observer(host, socket)
	return {"ok": errors.is_empty(), "timerCallbacks": callback_count, "visibleAfterRefresh": refreshed_visible,
		"mapOnlyHidden": map_only_hidden, "restored": restored, "httpVisible": http_visible,
		"timerIntervalSeconds": host.ONLINE_POSITION_SYNC_INTERVAL_SECONDS, "errors": errors}


static func _wait_for_revision(host: Node, socket: WebSocketPeer, cache: RefCounted, observer_id: String, actor_id: String, old_revision: int) -> void:
	for frame in range(720):
		socket.poll()
		while socket.get_available_packet_count() > 0:
			var parsed: Variant = JSON.parse_string(socket.get_packet().get_string_from_utf8())
			if not (parsed is Dictionary):
				continue
			var event := parsed as Dictionary
			match str(event.get("type", "")):
				"online.snapshot":
					cache.apply_snapshot(event.get("players", []), observer_id)
				"online.position":
					cache.apply_position_event(event, observer_id)
				"online.position_batch":
					cache.apply_position_batch(event, observer_id)
		if not host.online_position_request_pending and cache.revision_for(actor_id) > old_revision:
			return
		await host.get_tree().process_frame


static func _close_observer(host: Node, socket: WebSocketPeer) -> void:
	socket.close()
	for index in range(30):
		socket.poll()
		if socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
			break
		await host.get_tree().process_frame
