extends RefCounted

const Coordinator := preload("res://scripts/battle/server_battle_coordinator.gd")

class Probe extends Node:
	var token := "qa_token_a"
	var authenticated := true
	var server_battle_state_poll_request_active := false
	var server_battle_state: Dictionary = {}
	var restores := 0

	func _server_profile_token() -> String:
		return token

	func _is_server_account_session() -> bool:
		return authenticated

	func _request_server_battle_state_restore() -> void:
		restores += 1


static func run(host: Node) -> Dictionary:
	var probe := Probe.new()
	host.add_child(probe)
	var coordinator := Coordinator.new(probe)
	var checks := {}
	var owner := coordinator._begin_state_request(probe.token)
	var snapshot := owner.duplicate(true)
	checks["current_state_response_accepted"] = coordinator._finish_state_request(owner)
	checks["state_callback_snapshot_preserved"] = owner == snapshot
	checks["state_guard_released"] = not probe.server_battle_state_poll_request_active and coordinator.state_request_owner.is_empty()
	checks["duplicate_state_response_rejected"] = not coordinator._finish_state_request(owner)
	var older := coordinator._begin_state_request(probe.token)
	var newer := coordinator._begin_state_request(probe.token)
	checks["older_state_cannot_release_newer"] = not coordinator._finish_state_request(older) and probe.server_battle_state_poll_request_active and coordinator.state_request_owner == newer
	checks["newer_state_response_accepted"] = coordinator._finish_state_request(newer)
	owner = coordinator._begin_state_request(probe.token)
	probe.token = "qa_token_b"
	checks["changed_session_token_rejected"] = not coordinator._finish_state_request(owner) and not probe.server_battle_state_poll_request_active
	owner = coordinator._begin_state_request(probe.token)
	probe.authenticated = false
	checks["signed_out_state_rejected"] = not coordinator._finish_state_request(owner)
	probe.authenticated = true
	older = coordinator._begin_state_request(probe.token)
	coordinator.invalidate_state_requests()
	newer = coordinator._begin_state_request(probe.token)
	checks["invalidated_state_cannot_release_new_generation"] = not coordinator._finish_state_request(older) and probe.server_battle_state_poll_request_active
	checks["new_generation_state_accepted"] = coordinator._finish_state_request(newer)
	owner = coordinator._begin_state_request(probe.token)
	coordinator.queue_state_restore()
	coordinator.queue_state_restore()
	var queued_current := coordinator._finish_state_request(owner)
	await host.get_tree().process_frame
	checks["queued_restore_runs_once_after_current_response"] = queued_current and probe.restores == 1 and not coordinator.state_request_rerun_queued

	var ticket := "battle_failure_" + "a".repeat(32)
	probe.server_battle_state["interruption"] = _interruption(ticket)
	owner = coordinator._begin_interruption_recovery(probe.token, ticket)
	snapshot = owner.duplicate(true)
	checks["current_recovery_response_accepted"] = coordinator._finish_interruption_recovery(owner)
	checks["recovery_callback_snapshot_preserved"] = owner == snapshot
	checks["recovery_guard_released"] = not coordinator.interruption_recovery_request_active and coordinator.interruption_recovery_owner.is_empty()
	checks["duplicate_recovery_rejected"] = not coordinator._finish_interruption_recovery(owner)
	older = coordinator._begin_interruption_recovery(probe.token, ticket)
	newer = coordinator._begin_interruption_recovery(probe.token, ticket)
	checks["older_recovery_cannot_release_newer"] = not coordinator._finish_interruption_recovery(older) and coordinator.interruption_recovery_request_active and coordinator.interruption_recovery_owner == newer
	checks["newer_recovery_response_accepted"] = coordinator._finish_interruption_recovery(newer)
	owner = coordinator._begin_interruption_recovery(probe.token, ticket)
	probe.server_battle_state["interruption"] = _interruption("battle_failure_" + "b".repeat(32))
	checks["changed_recovery_ticket_rejected"] = not coordinator._finish_interruption_recovery(owner)
	probe.server_battle_state["interruption"] = _interruption(ticket)
	owner = coordinator._begin_interruption_recovery(probe.token, ticket)
	probe.token = "qa_token_c"
	checks["changed_recovery_token_rejected"] = not coordinator._finish_interruption_recovery(owner)
	owner = coordinator._begin_interruption_recovery(probe.token, ticket)
	probe.authenticated = false
	checks["signed_out_recovery_rejected"] = not coordinator._finish_interruption_recovery(owner)
	probe.authenticated = true
	older = coordinator._begin_interruption_recovery(probe.token, ticket)
	coordinator.invalidate_state_requests()
	newer = coordinator._begin_interruption_recovery(probe.token, ticket)
	checks["invalidated_recovery_cannot_release_new_generation"] = not coordinator._finish_interruption_recovery(older) and coordinator.interruption_recovery_request_active
	checks["new_generation_recovery_accepted"] = coordinator._finish_interruption_recovery(newer)
	owner = coordinator._begin_state_request(probe.token)
	var recovery := coordinator._begin_interruption_recovery(probe.token, ticket)
	checks["state_completion_preserves_pending_recovery"] = coordinator._finish_state_request(owner) and coordinator.interruption_recovery_request_active
	checks["independent_recovery_finishes"] = coordinator._finish_interruption_recovery(recovery)
	probe.queue_free()
	await host.get_tree().process_frame
	return {"ok": not checks.values().has(false), "caseCount": checks.size(), "checks": checks}


static func _interruption(ticket: String) -> Dictionary:
	return {"kind": "battle_owner_interruption", "ticketId": ticket, "roomId": "qa_room", "mode": "party_pve", "startedAt": "2026-09-20T00:00:00.000Z", "schemaVersion": 1}
