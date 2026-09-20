extends RefCounted

const Reconnect := preload("res://scripts/net/server_event_reconnect_model.gd")
# Current EventHub writer budget, including its frame header: 256 KiB.
const SERVER_FRAME_BUDGET := 256 * 1024


static func run(host) -> Dictionary:
	var flow = host._panel_flow()
	var saved := {
		"session": host.current_account_session, "authenticated": host.account_authenticated,
		"socket": host.server_event_socket, "state": host.server_event_state,
		"remaining": host.server_event_reconnect_remaining, "cursor": host.server_event_last_seq,
		"epoch": flow.server_event_epoch, "model": flow.server_event_reconnect_model,
		"pending": flow.server_event_pending_events, "processing": host.is_processing(),
	}
	host.set_process(false)
	var cases: Array[Dictionary] = []
	for size in [80 * 1024, SERVER_FRAME_BUDGET - 64, SERVER_FRAME_BUDGET + 1]:
		cases.append(await _exchange(host, flow, size, size < SERVER_FRAME_BUDGET))
	host.current_account_session = saved.session
	host.account_authenticated = saved.authenticated
	host.server_event_socket = saved.socket
	host.server_event_state = saved.state
	host.server_event_reconnect_remaining = saved.remaining
	host.server_event_last_seq = saved.cursor
	flow.server_event_epoch = saved.epoch
	flow.server_event_reconnect_model = saved.model
	flow.server_event_pending_events = saved.pending
	host.set_process(saved.processing)
	return {"ok": cases.all(func(row: Dictionary) -> bool: return bool(row.get("ok", false))),
		"scope": "actual Main event transport over a disposable loopback WebSocket", "cases": cases}


static func _exchange(host, flow, byte_count: int, expect_delivery: bool) -> Dictionary:
	var listener := TCPServer.new()
	var listen_error := listener.listen(0, "127.0.0.1")
	if listen_error != OK:
		return {"ok": false, "listenError": listen_error}
	host.current_account_session = {"authSource": "server", "serverSessionToken": "transport_check",
		"serverBaseUrl": "http://127.0.0.1:%d" % listener.get_local_port()}
	host.account_authenticated = true
	host.server_event_socket = null
	host.server_event_state = "off"
	host.server_event_reconnect_remaining = 0.0
	host.server_event_last_seq = 0
	flow.server_event_epoch = ""
	flow.server_event_reconnect_model = Reconnect.new()
	var empty_pending: Array[Dictionary] = []
	flow.server_event_pending_events = empty_pending
	flow._start_server_event_stream_if_needed()
	var client: WebSocketPeer = host.server_event_socket
	var peer := WebSocketPeer.new()
	peer.outbound_buffer_size = SERVER_FRAME_BUDGET * 2
	var prefix := '{"type":"transport.check","eventSeq":1,"text":"'
	var suffix := '"}'
	var padding := byte_count - prefix.to_utf8_buffer().size() - suffix.length()
	var message := prefix + "岩".repeat(padding / 3) + "x".repeat(padding % 3) + suffix
	var accepted := false
	var sent := false
	var send_error := OK
	var closed := false
	var delivered := false
	var deadline := Time.get_ticks_msec() + 4000
	while client != null and Time.get_ticks_msec() < deadline:
		if not accepted and listener.is_connection_available():
			accepted = peer.accept_stream(listener.take_connection()) == OK
		if accepted:
			peer.poll()
			if not sent and peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
				send_error = peer.send_text(message)
				sent = send_error == OK
		flow._poll_server_event_stream(1.0 / 60.0)
		delivered = host.server_event_last_seq == 1
		closed = client.get_ready_state() == WebSocketPeer.STATE_CLOSED
		if delivered or closed or send_error != OK:
			break
		await host.get_tree().process_frame
	var close_code := client.get_close_code() if client != null and closed else -1
	var result := {"ok": sent and message.to_utf8_buffer().size() == byte_count and
		(delivered and not closed if expect_delivery else closed and not delivered and close_code == 1009),
		"bytes": byte_count, "received": delivered, "closed": closed, "closeCode": close_code,
		"closeReason": client.get_close_reason() if client != null and closed else "",
		"inboundBufferBytes": client.inbound_buffer_size if client != null else 0,
		"sendError": send_error}
	if client != null:
		client.close(-1)
	peer.close(-1)
	listener.stop()
	return result
