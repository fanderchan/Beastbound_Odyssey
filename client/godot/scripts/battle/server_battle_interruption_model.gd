extends RefCounted

const INTERRUPTION_KIND := "battle_owner_interruption"
const INTERRUPTION_SCHEMA_VERSION := 1
const TICKET_PREFIX := "battle_failure_"
const TICKET_HEX_LENGTH := 32
const OPERATION_PREFIX := "bbo_battle_recover_"


static func read(value) -> Dictionary:
	if value == null:
		return {"ok": true, "interruption": {}}
	if not (value is Dictionary):
		return _invalid()
	var source := value as Dictionary
	var ticket_id := str(source.get("ticketId", "")).strip_edges()
	var room_id := str(source.get("roomId", "")).strip_edges()
	var mode := str(source.get("mode", "")).strip_edges()
	var started_at := str(source.get("startedAt", "")).strip_edges()
	if (
		str(source.get("kind", "")).strip_edges() != INTERRUPTION_KIND
		or not ticket_id_is_valid(ticket_id)
		or room_id == ""
		or mode == ""
		or started_at == ""
		or int(source.get("schemaVersion", 0)) != INTERRUPTION_SCHEMA_VERSION
	):
		return _invalid()
	return {
		"ok": true,
		"interruption": {
			"kind": INTERRUPTION_KIND,
			"ticketId": ticket_id,
			"roomId": room_id,
			"mode": mode,
			"startedAt": started_at,
			"encounterReturnAvailable": bool(source.get("encounterReturnAvailable", false)),
			"message": "战斗因服务器切换中断，本场不计胜负。",
			"schemaVersion": INTERRUPTION_SCHEMA_VERSION,
		},
	}


static func ticket_id_is_valid(value: String) -> bool:
	var ticket_id := value.strip_edges()
	if not ticket_id.begins_with(TICKET_PREFIX):
		return false
	var suffix := ticket_id.trim_prefix(TICKET_PREFIX)
	if suffix.length() != TICKET_HEX_LENGTH:
		return false
	for index in range(suffix.length()):
		var codepoint := suffix.unicode_at(index)
		if not (codepoint >= 0x30 and codepoint <= 0x39) and not (codepoint >= 0x61 and codepoint <= 0x66):
			return false
	return true


static func recovery_operation_id(interruption: Dictionary) -> String:
	var ticket_id := str(interruption.get("ticketId", "")).strip_edges()
	if not ticket_id_is_valid(ticket_id):
		return ""
	return "%s%s" % [OPERATION_PREFIX, ticket_id.trim_prefix(TICKET_PREFIX)]


static func recovering_message() -> String:
	return "重连时战斗中断，本场不计胜负；正在返回地图。"


static func recovered_message(encounter_returned: bool) -> String:
	if encounter_returned:
		return "战斗已安全结束，本场不计胜负；本次遇敌次数已返还。"
	return "战斗已安全结束，本场不计胜负，可以重新发起。"


static func retry_message() -> String:
	return "战斗已安全结束且不计胜负；补偿状态将在重连后继续确认。"


static func invalid_message() -> String:
	return "战斗已安全结束且不计胜负；恢复状态异常，请重新登录后重试。"


static func self_check() -> Dictionary:
	var ticket_id := "%s%s" % [TICKET_PREFIX, "a".repeat(TICKET_HEX_LENGTH)]
	var fixture := {
		"kind": INTERRUPTION_KIND,
		"ticketId": ticket_id,
		"roomId": "battle_room_owner_failure",
		"mode": "party_pve",
		"startedAt": "2026-08-15T04:00:00.000Z",
		"encounterReturnAvailable": true,
		"participantAccountIds": ["must_not_escape"],
		"accountId": "must_not_escape",
		"schemaVersion": INTERRUPTION_SCHEMA_VERSION,
	}
	var valid := read(fixture)
	var interruption := valid.get("interruption", {}) as Dictionary if valid.get("interruption", {}) is Dictionary else {}
	var null_read := read(null)
	var malformed := fixture.duplicate(true)
	malformed["ticketId"] = "%s%s" % [TICKET_PREFIX, "z".repeat(TICKET_HEX_LENGTH)]
	var invalid := read(malformed)
	var operation_id := recovery_operation_id(interruption)
	return {
		"ok": (
			bool(valid.get("ok", false))
			and str(interruption.get("ticketId", "")) == ticket_id
			and bool(interruption.get("encounterReturnAvailable", false))
			and not interruption.has("participantAccountIds")
			and not interruption.has("accountId")
			and bool(null_read.get("ok", false))
			and (null_read.get("interruption", {}) as Dictionary).is_empty()
			and not bool(invalid.get("ok", true))
			and operation_id == "%s%s" % [OPERATION_PREFIX, "a".repeat(TICKET_HEX_LENGTH)]
			and recovery_operation_id(interruption) == operation_id
			and recovered_message(true).find("遇敌次数已返还") >= 0
		),
		"caseCount": 6,
		"operationId": operation_id,
		"participantIdentityHidden": not interruption.has("participantAccountIds") and not interruption.has("accountId"),
	}


static func _invalid() -> Dictionary:
	return {
		"ok": false,
		"code": "battle_interruption_contract_invalid",
		"message": invalid_message(),
		"interruption": {},
	}
