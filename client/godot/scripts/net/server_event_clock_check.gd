extends RefCounted

const Model := preload("res://scripts/net/server_event_reconnect_model.gd")


static func run(host) -> Dictionary:
	var flow = host._panel_flow()
	var saved := {
		"session": host.current_account_session, "authenticated": host.account_authenticated,
		"socket": host.server_event_socket, "state": host.server_event_state,
		"remaining": host.server_event_reconnect_remaining,
		"model": flow.server_event_reconnect_model, "pending": flow.server_event_pending_events,
	}
	host.current_account_session = {"authSource": "server", "serverSessionToken": "clock_check"}
	host.account_authenticated = true
	host.server_event_socket = null
	host.server_event_state = "closed"
	host.server_event_reconnect_remaining = 120.0
	flow.server_event_reconnect_model = Model.new()
	var empty_pending: Array[Dictionary] = []
	flow.server_event_pending_events = empty_pending
	var started := Time.get_ticks_usec()
	# A recording/accelerated simulation can advance frames without advancing
	# the network's real clock. Exercise the actual poll path without opening a socket.
	for _frame in range(120):
		flow._poll_server_event_stream(0.5)
	var elapsed := float(Time.get_ticks_usec() - started) / 1000000.0
	var consumed: float = 120.0 - host.server_event_reconnect_remaining
	var no_connection: bool = host.server_event_socket == null
	host.current_account_session = saved.session
	host.account_authenticated = saved.authenticated
	host.server_event_socket = saved.socket
	host.server_event_state = saved.state
	host.server_event_reconnect_remaining = saved.remaining
	flow.server_event_reconnect_model = saved.model
	flow.server_event_pending_events = saved.pending
	var cases := _clock_cases()
	return {"ok": no_connection and absf(consumed - elapsed) < 0.01 and not cases.values().has(false), "clockCases": cases, "simulatedSeconds": 60.0,
		"wallSeconds": elapsed, "retrySecondsConsumed": consumed, "noConnectionOpened": no_connection}


static func _clock_cases() -> Dictionary:
	var clock := {"usec": 1000000}
	var model := Model.new(func() -> int: return int(clock.usec))
	var checks := {"first_poll_has_no_old_elapsed": is_zero_approx(model.poll_elapsed_seconds())}
	checks["same_tick_has_no_elapsed"] = is_zero_approx(model.poll_elapsed_seconds())
	clock.usec += 250000
	checks["uses_real_elapsed"] = is_equal_approx(model.poll_elapsed_seconds(), 0.25)
	clock.usec -= 100000
	checks["backwards_clock_does_not_add_time"] = is_zero_approx(model.poll_elapsed_seconds())
	clock.usec += 350000
	checks["backwards_clock_does_not_double_count"] = is_equal_approx(model.poll_elapsed_seconds(), 0.25)
	clock.usec += 100000000
	model.next_delay(1.0)
	checks["retry_starts_at_failure"] = is_zero_approx(model.poll_elapsed_seconds())
	clock.usec += 100000000
	model.note_connecting()
	checks["connection_starts_at_attempt"] = is_zero_approx(model.poll_elapsed_seconds())
	clock.usec += 9000000
	checks["connection_has_ten_real_seconds"] = not model.note_connecting_elapsed(model.poll_elapsed_seconds())
	clock.usec += 1000000
	checks["connection_deadline_enforced"] = model.note_connecting_elapsed(model.poll_elapsed_seconds())
	model.note_connecting()
	model.note_open(model.poll_elapsed_seconds())
	clock.usec += 4000000
	model.note_open(model.poll_elapsed_seconds())
	checks["ready_has_five_real_seconds"] = not model.ready_timed_out()
	clock.usec += 1000000
	model.note_open(model.poll_elapsed_seconds())
	checks["ready_deadline_enforced"] = model.ready_timed_out()
	model.note_ready()
	clock.usec += 29000000
	checks["stable_reset_waits_thirty_real_seconds"] = not model.note_open(model.poll_elapsed_seconds()) and model.attempt() > 0
	clock.usec += 1000000
	checks["stable_reset_enforced"] = model.note_open(model.poll_elapsed_seconds()) and model.attempt() == 0
	model.reset()
	clock.usec += 100000000
	checks["reset_discards_previous_session_time"] = is_zero_approx(model.poll_elapsed_seconds())
	return checks
