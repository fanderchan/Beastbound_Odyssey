class_name HangMatchmakingClientModel
extends RefCounted

const ServerAuthClientModel := preload(
	"res://scripts/progression/server_auth_client_model.gd"
)

const SCHEMA_VERSION := 1
const POLL_INTERVAL_SECONDS := 2.0
const PARTY_MAX_MEMBERS := 5
const MAX_LISTINGS := 24
const REQUEST_STATE := "state"
const REQUEST_JOIN := "join"
const REQUEST_CANCEL := "cancel"
const STATUS_IDLE := "idle"
const STATUS_CANCELLED := "cancelled"
const STATUS_MATCHING := "matching"
const STATUS_NPC_FILLED := "npc_filled"
const STATUS_FULL := "full"
const VALID_REQUEST_KINDS := [REQUEST_STATE, REQUEST_JOIN, REQUEST_CANCEL]
const VALID_ACTIVE_STATUSES := [STATUS_MATCHING, STATUS_NPC_FILLED]
const MATCH_ERROR_MESSAGES := {
	"hang_match_session_required": "请先开始挂机，再进行队伍匹配。",
	"hang_match_hang_required": "请先开始挂机，再进行队伍匹配。",
	"hang_match_leader_required": "只有队长可以开启或取消队伍匹配。",
	"hang_match_party_full": "真人队伍已经满员，无需继续匹配。",
	"hang_match_party_member_offline": "有队员当前不在线，暂不能进入挂机匹配。",
	"hang_match_target_invalid": "挂机地点资料不完整，请重新选择。",
	"hang_match_target_missing": "挂机目标不完整，请重新开始挂机。",
	"hang_match_target_mismatch": "当前挂机地点已经变化，请重新选择。",
	"hang_match_target_changed": "匹配目标已经变化，请先取消当前匹配。",
	"hang_match_battle_active": "当前战斗尚未结束，请稍后再试。",
	"hang_match_battle_busy": "队伍正在战斗中，请在本场结束后再开始匹配。",
	"hang_match_unavailable": "挂机匹配暂不可用，请稍后再试。",
	"hang_match_state_invalid": "匹配状态暂时无法读取，请稍后重试。",
}

var _state: Dictionary = empty_state()
var _has_authoritative_state := false
var _request_active := false
var _request_kind := ""
var _poll_elapsed := 0.0
var _join_intent_signature := ""
var _join_idempotency_key := ""
var _cancel_intent_signature := ""
var _cancel_idempotency_key := ""


static func state_request(base_url: String, session_token: String) -> Dictionary:
	var token := session_token.strip_edges()
	if token == "":
		return {}
	return {
		"url": "%s/hang/match/state" % ServerAuthClientModel.normalized_base_url(base_url),
		"headers": ServerAuthClientModel.request_headers([
			"Authorization: Bearer %s" % token,
		]),
		"method": HTTPClient.METHOD_GET,
		"body": "",
	}


static func join_request(
	base_url: String,
	session_token: String,
	target: Dictionary,
	idempotency_key: String
) -> Dictionary:
	var normalized_target := normalized_target(target)
	if session_token.strip_edges() == "" or normalized_target.is_empty():
		return {}
	var stable_key := _stable_idempotency_key(idempotency_key)
	if stable_key == "":
		return {}
	return _durable_match_request(
		base_url,
		session_token,
		"/hang/match/join",
		{
			"target": normalized_target,
			"idempotencyKey": stable_key,
		},
		stable_key
	)


static func cancel_request(
	base_url: String,
	session_token: String,
	idempotency_key: String
) -> Dictionary:
	if session_token.strip_edges() == "":
		return {}
	var stable_key := _stable_idempotency_key(idempotency_key)
	if stable_key == "":
		return {}
	return _durable_match_request(
		base_url,
		session_token,
		"/hang/match/cancel",
		{"idempotencyKey": stable_key},
		stable_key
	)


static func parse_response(response_code: int, body: PackedByteArray) -> Dictionary:
	var text := body.get_string_from_utf8()
	if text.strip_edges() == "":
		return _parse_failure("bad_json", "服务器返回为空。")
	var decoded = JSON.parse_string(text)
	if not (decoded is Dictionary):
		return _parse_failure("bad_json", "服务器返回格式不正确。")
	var response := decoded as Dictionary
	if response_code < 200 or response_code >= 300 or not bool(response.get("ok", false)):
		var code := str(response.get("code", "server_error")).strip_edges()
		return {
			"ok": false,
			"code": code,
			"message": player_message_for_error(
				code,
				str(response.get("message", ""))
			),
			"state": {},
			"questMessages": [],
		}
	var raw_state := _state_payload(response)
	var state := normalized_state(raw_state)
	if state.is_empty():
		return _parse_failure(
			"hang_match_state_invalid",
			"匹配状态暂时无法读取，请稍后重试。"
		)
	var response_message := str(response.get("message", "")).strip_edges()
	if str(state.get("message", "")).strip_edges() == "" and ServerAuthClientModel.message_has_cjk(response_message):
		state["message"] = response_message
	return {
		"ok": true,
		"code": "",
		"message": str(state.get("message", response_message)),
		"state": state,
		"questMessages": _bounded_string_array(response.get("questMessages", []), 12),
	}


static func normalized_state(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	if (
		not _is_nonnegative_integer(source.get("schemaVersion", null))
		or int(source.get("schemaVersion", 0)) != SCHEMA_VERSION
		or not _is_bool(source.get("active", null))
		or not _is_bool(source.get("replayed", null))
		or not _is_nonnegative_integer(source.get("stateRevision", null))
		or not _is_nonnegative_integer(source.get("humanCount", null))
		or not _is_nonnegative_integer(source.get("npcCount", null))
		or not _is_nonnegative_integer(source.get("emptyCount", null))
		or not _is_nonnegative_integer(source.get("maxMembers", null))
		or not _is_nonnegative_integer(source.get("waitingPlayerCount", null))
		or not _is_nonnegative_integer(source.get("waitingPartyCount", null))
		or not _is_nonnegative_integer(source.get("npcFillInMs", null))
	):
		return {}
	var active := bool(source.get("active", false))
	var state_revision := int(source.get("stateRevision", 0))
	var human_count := int(source.get("humanCount", 0))
	var npc_count := int(source.get("npcCount", 0))
	var empty_count := int(source.get("emptyCount", 0))
	var max_members := int(source.get("maxMembers", 0))
	if (
		max_members <= 0
		or max_members > PARTY_MAX_MEMBERS
		or human_count > max_members
		or npc_count > max_members
		or empty_count > max_members
		or human_count + npc_count + empty_count != max_members
	):
		return {}
	var status := str(source.get("status", "")).strip_edges().to_lower()
	var queue_id := str(source.get("queueId", "")).strip_edges()
	if active:
		if not VALID_ACTIVE_STATUSES.has(status) or queue_id == "":
			return {}
	else:
		if status not in [STATUS_IDLE, STATUS_CANCELLED, STATUS_FULL] or npc_count != 0:
			return {}
		if status == STATUS_FULL and (human_count != max_members or empty_count != 0):
			return {}
	var target := normalized_target(source.get("target", {}))
	if active and target.is_empty():
		return {}
	var party = source.get("party", {})
	var npc_members = source.get("npcMembers", [])
	var listings = source.get("listings", [])
	if party == null:
		party = {}
	if not (party is Dictionary) or not (npc_members is Array) or not (listings is Array):
		return {}
	if (npc_members as Array).size() != npc_count or (npc_members as Array).size() > max_members:
		return {}
	var normalized_npc_members := _bounded_dictionary_array(npc_members, max_members)
	if normalized_npc_members.size() != (npc_members as Array).size():
		return {}
	var normalized_listings := _normalized_listings(listings)
	if normalized_listings.size() != mini((listings as Array).size(), MAX_LISTINGS):
		return {}
	var message := str(source.get("message", "")).strip_edges()
	if message != "" and not ServerAuthClientModel.message_has_cjk(message):
		message = ""
	return {
		"schemaVersion": SCHEMA_VERSION,
		"active": active,
		"status": status,
		"stateRevision": state_revision,
		"queueId": queue_id,
		"target": target,
		"humanCount": human_count,
		"npcCount": npc_count,
		"emptyCount": empty_count,
		"maxMembers": max_members,
		"waitingPlayerCount": int(source.get("waitingPlayerCount", 0)),
		"waitingPartyCount": int(source.get("waitingPartyCount", 0)),
		"npcFillInMs": int(source.get("npcFillInMs", 0)),
		"party": (party as Dictionary).duplicate(true),
		"npcMembers": normalized_npc_members,
		"listings": normalized_listings,
		"message": message,
		"replayed": bool(source.get("replayed", false)),
	}


static func normalized_target(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var progression_zone_id := str(source.get("progressionZoneId", "")).strip_edges()
	var map_id := str(source.get("mapId", "")).strip_edges()
	var encounter_group_id := str(source.get("encounterGroupId", "")).strip_edges()
	var label := str(source.get("label", "")).strip_edges()
	if (
		progression_zone_id == ""
		or map_id == ""
		or encounter_group_id == ""
		or label == ""
	):
		return {}
	return {
		"progressionZoneId": progression_zone_id,
		"mapId": map_id,
		"encounterGroupId": encounter_group_id,
		"label": label,
	}


static func empty_state() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"active": false,
		"status": STATUS_IDLE,
		"stateRevision": 0,
		"queueId": "",
		"target": {},
		"humanCount": 0,
		"npcCount": 0,
		"emptyCount": PARTY_MAX_MEMBERS,
		"maxMembers": PARTY_MAX_MEMBERS,
		"waitingPlayerCount": 0,
		"waitingPartyCount": 0,
		"npcFillInMs": 0,
		"party": {},
		"npcMembers": [],
		"listings": [],
		"message": "",
		"replayed": false,
	}


static func world_status_view(state: Dictionary) -> Dictionary:
	var normalized := normalized_state(state)
	if (
		normalized.is_empty()
		or (
			not bool(normalized.get("active", false))
			and str(normalized.get("status", "")) != STATUS_FULL
		)
	):
		return {
			"visible": false,
			"title": "",
			"detail": "",
			"canCancel": false,
		}
	var human_count := int(normalized.get("humanCount", 0))
	var npc_count := int(normalized.get("npcCount", 0))
	var empty_count := int(normalized.get("emptyCount", 0))
	var max_members := int(normalized.get("maxMembers", PARTY_MAX_MEMBERS))
	var full_real_party := human_count >= max_members and npc_count == 0
	var title := "挂机匹配中｜真人 %d｜空位 %d" % [human_count, empty_count]
	var detail := "真人玩家优先匹配。"
	if full_real_party:
		title = "真人队伍已满｜%d/%d" % [human_count, max_members]
		detail = "真人队伍已满；有人离队时会自动恢复匹配。"
	elif npc_count > 0:
		title = "挂机匹配中｜真人 %d｜陪练 NPC %d" % [human_count, npc_count]
		detail = "真人玩家加入时，陪练 NPC 会在下场战斗前自动让位。"
	elif int(normalized.get("npcFillInMs", 0)) > 0:
		var seconds_left := int(ceil(float(normalized.get("npcFillInMs", 0)) / 1000.0))
		detail = "优先等待真人，%d 秒后由陪练 NPC 补齐空位。" % seconds_left
	return {
		"visible": true,
		"title": title,
		"detail": detail,
		"canCancel": str(normalized.get("queueId", "")).strip_edges() != "",
	}


static func world_status_text(state: Dictionary) -> String:
	return str(world_status_view(state).get("title", ""))


static func player_message_for_error(code: String, fallback_message: String = "") -> String:
	var normalized_code := code.strip_edges()
	if MATCH_ERROR_MESSAGES.has(normalized_code):
		return str(MATCH_ERROR_MESSAGES[normalized_code])
	if normalized_code.begins_with("hang_match_"):
		return "挂机匹配暂时无法完成，请稍后重试。"
	var fallback := fallback_message.strip_edges()
	if ServerAuthClientModel.message_has_cjk(fallback):
		return fallback
	return ServerAuthClientModel.player_message_for_code(normalized_code, "")


func reset_for_login() -> void:
	_state = empty_state()
	_has_authoritative_state = false
	_request_active = false
	_request_kind = ""
	_poll_elapsed = 0.0
	_join_intent_signature = ""
	_join_idempotency_key = ""
	_cancel_intent_signature = ""
	_cancel_idempotency_key = ""


func current_state() -> Dictionary:
	return _state.duplicate(true)


func has_authoritative_state() -> bool:
	return _has_authoritative_state


func request_active() -> bool:
	return _request_active


func request_kind() -> String:
	return _request_kind


func try_begin_request(kind: String) -> bool:
	var normalized_kind := kind.strip_edges().to_lower()
	if _request_active or not VALID_REQUEST_KINDS.has(normalized_kind):
		return false
	_request_active = true
	_request_kind = normalized_kind
	if normalized_kind == REQUEST_STATE:
		_poll_elapsed = 0.0
	return true


func begin_join_request(
	base_url: String,
	session_token: String,
	target: Dictionary
) -> Dictionary:
	if _request_active:
		return {}
	var normalized := normalized_target(target)
	if normalized.is_empty():
		return {}
	var signature := _target_signature(normalized)
	if signature != _join_intent_signature:
		_join_intent_signature = signature
		_join_idempotency_key = ""
	if _join_idempotency_key == "":
		_join_idempotency_key = _stable_idempotency_key("")
	var spec := join_request(
		base_url,
		session_token,
		normalized,
		_join_idempotency_key
	)
	if spec.is_empty() or not try_begin_request(REQUEST_JOIN):
		return {}
	return spec


func begin_cancel_request(base_url: String, session_token: String) -> Dictionary:
	if _request_active:
		return {}
	var queue_id := str(_state.get("queueId", "")).strip_edges()
	if (
		queue_id == ""
		or (
			not bool(_state.get("active", false))
			and str(_state.get("status", "")) != STATUS_FULL
		)
	):
		return {}
	if queue_id != _cancel_intent_signature:
		_cancel_intent_signature = queue_id
		_cancel_idempotency_key = ""
	if _cancel_idempotency_key == "":
		_cancel_idempotency_key = _stable_idempotency_key("")
	var spec := cancel_request(
		base_url,
		session_token,
		_cancel_idempotency_key
	)
	if spec.is_empty() or not try_begin_request(REQUEST_CANCEL):
		return {}
	return spec


func abandon_intent(kind: String) -> void:
	if _request_active:
		return
	match kind.strip_edges().to_lower():
		REQUEST_JOIN:
			_join_intent_signature = ""
			_join_idempotency_key = ""
		REQUEST_CANCEL:
			_cancel_intent_signature = ""
			_cancel_idempotency_key = ""


func finish_request(parsed: Dictionary) -> Dictionary:
	var completed_kind := _request_kind
	_request_active = false
	_request_kind = ""
	if not bool(parsed.get("ok", false)):
		return {
			"ok": false,
			"accepted": false,
			"changed": false,
			"reason": "request_failed",
			"requestKind": completed_kind,
			"message": player_message_for_error(
				str(parsed.get("code", "server_error")),
				str(parsed.get("message", ""))
			),
		}
	if completed_kind == REQUEST_JOIN:
		_join_intent_signature = ""
		_join_idempotency_key = ""
	elif completed_kind == REQUEST_CANCEL:
		_cancel_intent_signature = ""
		_cancel_idempotency_key = ""
	var applied := apply_authoritative_state(parsed.get("state", {}))
	applied["ok"] = true
	applied["requestKind"] = completed_kind
	applied["message"] = str(parsed.get("message", ""))
	return applied


func apply_authoritative_state(value) -> Dictionary:
	var next_state := normalized_state(value)
	if next_state.is_empty():
		return {
			"accepted": false,
			"changed": false,
			"reason": "state_invalid",
		}
	if _has_authoritative_state:
		var current_queue_id := str(_state.get("queueId", ""))
		var next_queue_id := str(next_state.get("queueId", ""))
		var same_queue_lifecycle := current_queue_id == next_queue_id
		var current_revision := int(_state.get("stateRevision", 0))
		var next_revision := int(next_state.get("stateRevision", 0))
		if same_queue_lifecycle and next_revision < current_revision:
			return {
				"accepted": false,
				"changed": false,
				"reason": "stale_revision",
			}
		if same_queue_lifecycle and next_revision == current_revision:
			return {
				"accepted": true,
				"changed": false,
				"reason": "same_revision",
			}
	_state = next_state
	_has_authoritative_state = true
	var applied_queue_id := str(_state.get("queueId", "")).strip_edges()
	var applied_target_signature := _target_signature(
		_state.get("target", {}) as Dictionary
		if _state.get("target", {}) is Dictionary
		else {}
	)
	if (
		(
			bool(_state.get("active", false))
			or str(_state.get("status", "")) == STATUS_FULL
		)
		and _join_intent_signature != ""
		and applied_target_signature == _join_intent_signature
	):
		_join_intent_signature = ""
		_join_idempotency_key = ""
	if (
		_cancel_intent_signature != ""
		and (
			str(_state.get("status", "")) in [STATUS_IDLE, STATUS_CANCELLED]
			or applied_queue_id != _cancel_intent_signature
		)
	):
		_cancel_intent_signature = ""
		_cancel_idempotency_key = ""
	if not polling_enabled():
		_poll_elapsed = 0.0
	return {
		"accepted": true,
		"changed": true,
		"reason": "applied",
	}


func polling_enabled() -> bool:
	return (
		bool(_state.get("active", false))
		and str(_state.get("status", "")) in [STATUS_MATCHING, STATUS_NPC_FILLED]
		and int(_state.get("humanCount", 0)) < int(_state.get("maxMembers", PARTY_MAX_MEMBERS))
	)


func poll_request_if_due(
	delta: float,
	base_url: String,
	session_token: String
) -> Dictionary:
	if not polling_enabled() or _request_active or session_token.strip_edges() == "":
		return {}
	# One call can make at most one request. A large frame delta is capped so a
	# resumed client never bursts multiple polls in one frame.
	_poll_elapsed += minf(maxf(0.0, delta), POLL_INTERVAL_SECONDS)
	if _poll_elapsed + 0.0001 < POLL_INTERVAL_SECONDS:
		return {}
	var spec := state_request(base_url, session_token)
	if spec.is_empty() or not try_begin_request(REQUEST_STATE):
		return {}
	return spec


static func debug_self_check() -> Dictionary:
	var errors: Array[String] = []
	var checks := {}
	var model := HangMatchmakingClientModel.new()
	var target := _fixture_target()
	var deterministic_key := "bbo_phase394_hang_match_contract_key"

	var login_view := world_status_view(model.current_state())
	checks["login_empty"] = (
		not model.has_authoritative_state()
		and not bool(login_view.get("visible", true))
		and world_status_text(model.current_state()) == ""
	)
	var login_idle_parsed := parse_response(200, JSON.stringify({
		"ok": true,
		"state": _fixture_state(0, false, STATUS_IDLE, 1, 0, 4, 0),
		"message": "已同步挂机匹配状态。",
	}).to_utf8_buffer())
	var login_idle_apply := model.finish_request(login_idle_parsed)
	checks["login_idle_payload"] = (
		bool(login_idle_apply.get("changed", false))
		and model.has_authoritative_state()
		and int(model.current_state().get("humanCount", 0)) == 1
		and not bool(world_status_view(model.current_state()).get("visible", true))
	)

	var join_spec := join_request(
		"http://127.0.0.1:8787/",
		"session-token",
		target,
		deterministic_key
	)
	var join_body = JSON.parse_string(str(join_spec.get("body", "")))
	checks["join_request"] = (
		str(join_spec.get("url", "")).ends_with("/hang/match/join")
		and int(join_spec.get("method", -1)) == HTTPClient.METHOD_POST
		and join_body is Dictionary
		and str((join_body as Dictionary).get("idempotencyKey", "")) == deterministic_key
		and (join_body as Dictionary).get("target", {}) == target
		and ServerAuthClientModel.request_idempotency_key(join_spec) == deterministic_key
	)
	var cancel_spec := cancel_request(
		"http://127.0.0.1:8787",
		"session-token",
		deterministic_key
	)
	checks["cancel_request"] = (
		str(cancel_spec.get("url", "")).ends_with("/hang/match/cancel")
		and ServerAuthClientModel.request_idempotency_key(cancel_spec) == deterministic_key
	)
	var listing_state := _fixture_state(1, false, STATUS_IDLE, 1, 0, 4, 0)
	listing_state["listings"] = [{
		"queueId": "queue_listing_contract",
		"target": target,
		"leader": {"displayName": "岩拳", "level": 37},
		"humanCount": 2,
		"npcCount": 3,
		"emptyCount": 0,
		"maxMembers": PARTY_MAX_MEMBERS,
		"status": STATUS_NPC_FILLED,
		"schemaVersion": 1,
	}]
	var normalized_listing_state := normalized_state(listing_state)
	var projected_listing := (
		(normalized_listing_state.get("listings", []) as Array)[0] as Dictionary
		if normalized_listing_state.get("listings", []) is Array
		and not (normalized_listing_state.get("listings", []) as Array).is_empty()
		else {}
	)
	checks["listing_projection"] = (
		str(projected_listing.get("queueId", "")) == "queue_listing_contract"
		and str(projected_listing.get("routeId", "")) == str(target.get("progressionZoneId", ""))
		and str(projected_listing.get("routeLabel", "")) == str(target.get("label", ""))
		and str(projected_listing.get("leaderName", "")) == "岩拳"
		and int(projected_listing.get("leaderLevel", 0)) == 37
	)
	var retry_model := HangMatchmakingClientModel.new()
	var first_intent_spec := retry_model.begin_join_request(
		"http://127.0.0.1:8787",
		"session-token",
		target
	)
	var first_intent_key := ServerAuthClientModel.request_idempotency_key(first_intent_spec)
	var duplicate_inflight_spec := retry_model.begin_join_request(
		"http://127.0.0.1:8787",
		"session-token",
		target
	)
	retry_model.finish_request({
		"ok": false,
		"code": "network_failed",
		"message": "网络连接失败，请稍后重试。",
	})
	var retry_intent_spec := retry_model.begin_join_request(
		"http://127.0.0.1:8787",
		"session-token",
		target
	)
	var retry_intent_key := ServerAuthClientModel.request_idempotency_key(retry_intent_spec)
	checks["stable_intent_idempotency"] = (
		first_intent_key != ""
		and duplicate_inflight_spec.is_empty()
		and retry_intent_key == first_intent_key
	)
	retry_model.finish_request({
		"ok": true,
		"message": "匹配中",
		"state": _fixture_state(1, true, STATUS_MATCHING, 1, 0, 4, 8000),
	})
	var next_intent_spec := retry_model.begin_join_request(
		"http://127.0.0.1:8787",
		"session-token",
		target
	)
	checks["successful_intent_rotates_key"] = (
		ServerAuthClientModel.request_idempotency_key(next_intent_spec) != first_intent_key
	)
	retry_model.finish_request({
		"ok": false,
		"code": "hang_match_party_full",
		"message": "真人队伍已经满员，无需继续匹配。",
	})
	var cancel_retry_model := HangMatchmakingClientModel.new()
	cancel_retry_model.apply_authoritative_state(
		_fixture_state(1, true, STATUS_MATCHING, 1, 0, 4, 8000)
	)
	var first_cancel_intent := cancel_retry_model.begin_cancel_request(
		"http://127.0.0.1:8787",
		"session-token"
	)
	var first_cancel_key := ServerAuthClientModel.request_idempotency_key(first_cancel_intent)
	cancel_retry_model.finish_request({
		"ok": false,
		"code": "network_failed",
		"message": "网络连接失败，请稍后重试。",
	})
	var retry_cancel_intent := cancel_retry_model.begin_cancel_request(
		"http://127.0.0.1:8787",
		"session-token"
	)
	checks["stable_cancel_idempotency"] = (
		first_cancel_key != ""
		and ServerAuthClientModel.request_idempotency_key(retry_cancel_intent) == first_cancel_key
	)
	cancel_retry_model.finish_request({
		"ok": true,
		"message": "已取消匹配",
		"state": _fixture_state(2, false, STATUS_CANCELLED, 1, 0, 4, 0),
	})
	checks["cancel_success_closes_intent"] = cancel_retry_model.begin_cancel_request(
		"http://127.0.0.1:8787",
		"session-token"
	).is_empty()

	var matching_state := _fixture_state(10, true, STATUS_MATCHING, 1, 0, 4, 8000)
	var matching_parsed := parse_response(200, JSON.stringify({
		"ok": true,
		"matchmaking": matching_state,
	}).to_utf8_buffer())
	var matching_apply := model.finish_request(matching_parsed)
	var matching_view := world_status_view(model.current_state())
	checks["matching"] = (
		bool(matching_apply.get("changed", false))
		and bool(matching_view.get("visible", false))
		and str(matching_view.get("title", "")).contains("真人 1")
		and str(matching_view.get("detail", "")).contains("8 秒")
	)

	var duplicate_state := matching_state.duplicate(true)
	duplicate_state["humanCount"] = 2
	duplicate_state["emptyCount"] = 3
	var duplicate_apply := model.apply_authoritative_state(duplicate_state)
	checks["same_revision_dedup"] = (
		bool(duplicate_apply.get("accepted", false))
		and not bool(duplicate_apply.get("changed", true))
		and str(duplicate_apply.get("reason", "")) == "same_revision"
		and int(model.current_state().get("humanCount", 0)) == 1
	)

	var soft_fill_state := _fixture_state(11, true, STATUS_NPC_FILLED, 1, 4, 0, 0)
	var soft_fill_apply := model.apply_authoritative_state(soft_fill_state)
	var soft_fill_view := world_status_view(model.current_state())
	checks["npc_soft_fill"] = (
		bool(soft_fill_apply.get("changed", false))
		and str(soft_fill_view.get("title", "")).contains("陪练 NPC 4")
		and str(soft_fill_view.get("detail", "")).contains("自动让位")
		and bool(soft_fill_view.get("canCancel", false))
	)

	var first_poll := model.poll_request_if_due(1.0, "http://127.0.0.1:8787", "token")
	var due_poll := model.poll_request_if_due(1.0, "http://127.0.0.1:8787", "token")
	var duplicate_poll := model.poll_request_if_due(2.0, "http://127.0.0.1:8787", "token")
	checks["bounded_poll_and_request_dedup"] = (
		first_poll.is_empty()
		and not due_poll.is_empty()
		and duplicate_poll.is_empty()
		and model.request_active()
		and model.request_kind() == REQUEST_STATE
	)
	model.finish_request(parse_response(200, JSON.stringify({
		"ok": true,
		"state": soft_fill_state,
	}).to_utf8_buffer()))

	var full_state := _fixture_state(12, false, STATUS_FULL, 5, 0, 0, 0)
	var full_apply := model.apply_authoritative_state(full_state)
	var full_view := world_status_view(model.current_state())
	checks["full_real_party"] = (
		bool(full_apply.get("changed", false))
		and str(full_view.get("title", "")).contains("真人队伍已满")
		and bool(full_view.get("canCancel", false))
		and str(full_view.get("detail", "")).contains("自动恢复匹配")
		and not model.polling_enabled()
	)

	var error_parsed := parse_response(409, JSON.stringify({
		"ok": false,
		"code": "hang_match_leader_required",
		"message": "leader required",
	}).to_utf8_buffer())
	checks["error_is_chinese"] = (
		not bool(error_parsed.get("ok", true))
		and ServerAuthClientModel.message_has_cjk(str(error_parsed.get("message", "")))
		and not str(error_parsed.get("message", "")).contains("leader required")
	)

	var cancelled_state := _fixture_state(13, false, STATUS_CANCELLED, 1, 0, 4, 0)
	var cancelled_apply := model.apply_authoritative_state(cancelled_state)
	checks["cancelled"] = (
		bool(cancelled_apply.get("changed", false))
		and not bool(world_status_view(model.current_state()).get("visible", true))
		and not model.polling_enabled()
	)

	for key in checks:
		if not bool(checks[key]):
			errors.append("%s failed" % str(key))
	return {
		"ok": errors.is_empty(),
		"checks": checks,
		"errors": errors,
		"finalState": model.current_state(),
	}


static func _durable_match_request(
	base_url: String,
	session_token: String,
	path: String,
	body: Dictionary,
	idempotency_key: String
) -> Dictionary:
	var spec := {
		"url": "%s%s" % [ServerAuthClientModel.normalized_base_url(base_url), path],
		"headers": ServerAuthClientModel.request_headers([
			"Content-Type: application/json",
			"Authorization: Bearer %s" % session_token.strip_edges(),
		]),
		"method": HTTPClient.METHOD_POST,
		"body": JSON.stringify(body),
		"durableMutation": true,
	}
	return ServerAuthClientModel.prepare_request_with_idempotency_key(
		spec,
		idempotency_key
	)


static func _stable_idempotency_key(candidate: String) -> String:
	var key := candidate.strip_edges()
	if key == "":
		key = ServerAuthClientModel.new_idempotency_key()
	return key if ServerAuthClientModel.idempotency_key_is_valid(key) else ""


static func _target_signature(target: Dictionary) -> String:
	return "%s|%s|%s|%s" % [
		str(target.get("progressionZoneId", "")),
		str(target.get("mapId", "")),
		str(target.get("encounterGroupId", "")),
		str(target.get("label", "")),
	]


static func _state_payload(response: Dictionary) -> Dictionary:
	for key in ["matchmaking", "state", "hangMatch"]:
		if response.get(key, null) is Dictionary:
			return (response.get(key, {}) as Dictionary).duplicate(true)
	if response.has("active") and response.has("stateRevision"):
		return response.duplicate(true)
	return {}


static func _parse_failure(code: String, message: String) -> Dictionary:
	return {
		"ok": false,
		"code": code,
		"message": player_message_for_error(code, message),
		"state": {},
		"questMessages": [],
	}


static func _bounded_dictionary_array(value, limit: int) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for entry in value:
		if result.size() >= maxi(0, limit):
			break
		if not (entry is Dictionary):
			return []
		result.append((entry as Dictionary).duplicate(true))
	return result


static func _normalized_listings(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for raw_entry in value:
		if result.size() >= MAX_LISTINGS:
			break
		if not (raw_entry is Dictionary):
			return []
		var entry := raw_entry as Dictionary
		var queue_id := str(entry.get("queueId", "")).strip_edges()
		var target := normalized_target(entry.get("target", {}))
		var leader_value = entry.get("leader", {})
		var leader := leader_value as Dictionary if leader_value is Dictionary else {}
		if (
			queue_id == ""
			or target.is_empty()
			or not _is_nonnegative_integer(entry.get("humanCount", null))
			or not _is_nonnegative_integer(entry.get("npcCount", null))
			or not _is_nonnegative_integer(entry.get("emptyCount", null))
			or not _is_nonnegative_integer(entry.get("maxMembers", null))
		):
			return []
		var human_count := int(entry.get("humanCount", 0))
		var npc_count := int(entry.get("npcCount", 0))
		var empty_count := int(entry.get("emptyCount", 0))
		var max_members := int(entry.get("maxMembers", 0))
		if (
			max_members <= 0
			or max_members > PARTY_MAX_MEMBERS
			or human_count + npc_count + empty_count != max_members
		):
			return []
		var projected := entry.duplicate(true)
		projected["queueId"] = queue_id
		projected["target"] = target
		projected["routeId"] = str(target.get("progressionZoneId", ""))
		projected["routeLabel"] = str(target.get("label", ""))
		projected["mapId"] = str(target.get("mapId", ""))
		projected["encounterGroupId"] = str(target.get("encounterGroupId", ""))
		projected["leaderName"] = str(
			leader.get("displayName", leader.get("username", "冒险队长"))
		).strip_edges()
		projected["leaderLevel"] = maxi(1, int(leader.get("level", 1)))
		projected["humanCount"] = human_count
		projected["npcCount"] = npc_count
		projected["emptyCount"] = empty_count
		projected["maxMembers"] = max_members
		result.append(projected)
	return result


static func _bounded_string_array(value, limit: int) -> Array[String]:
	var result: Array[String] = []
	if not (value is Array):
		return result
	for entry in value:
		if result.size() >= maxi(0, limit):
			break
		var message := str(entry).strip_edges()
		if message != "" and ServerAuthClientModel.message_has_cjk(message):
			result.append(message)
	return result


static func _is_nonnegative_integer(value) -> bool:
	if value is int:
		return int(value) >= 0
	if value is float:
		return float(value) >= 0.0 and is_equal_approx(float(value), floor(float(value)))
	return false


static func _is_bool(value) -> bool:
	return value is bool


static func _fixture_target() -> Dictionary:
	return {
		"progressionZoneId": "progression_deep_red_cave_1f",
		"mapId": "deep_red_cave_1f",
		"encounterGroupId": "deep_red_cave_1f_normal",
		"label": "深红洞窟 1层",
	}


static func _fixture_state(
	revision: int,
	active: bool,
	status: String,
	human_count: int,
	npc_count: int,
	empty_count: int,
	npc_fill_in_ms: int
) -> Dictionary:
	var has_queue := active or status == STATUS_FULL
	var npc_members: Array[Dictionary] = []
	for index in range(npc_count):
		npc_members.append({
			"npcId": "match_npc_%d" % index,
			"displayName": "洞窟陪练 %d" % (index + 1),
		})
	return {
		"schemaVersion": SCHEMA_VERSION,
		"active": active,
		"status": status,
		"stateRevision": revision,
		"queueId": "queue_contract" if has_queue else "",
		"target": _fixture_target() if has_queue else {},
		"humanCount": human_count,
		"npcCount": npc_count,
		"emptyCount": empty_count,
		"maxMembers": PARTY_MAX_MEMBERS,
		"waitingPlayerCount": 2 if has_queue else 0,
		"waitingPartyCount": 1 if has_queue else 0,
		"npcFillInMs": npc_fill_in_ms,
		"party": {"leaderAccountId": "self"} if has_queue else {},
		"npcMembers": npc_members,
		"listings": [],
		"message": (
			"真人队伍已满，匹配完成。"
			if status == STATUS_FULL
			else ("匹配中" if active else "已取消匹配")
		),
		"replayed": false,
	}
