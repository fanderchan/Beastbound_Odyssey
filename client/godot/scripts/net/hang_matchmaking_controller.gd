class_name HangMatchmakingController
extends RefCounted

signal state_changed(state: Dictionary)
signal request_pending_changed(pending: bool, kind: String)
signal request_finished(kind: String, ok: bool, message: String)
signal quest_messages_received(kind: String, messages: Array[String])

const HangMatchmakingClientModel := preload(
	"res://scripts/net/hang_matchmaking_client_model.gd"
)

var _model := HangMatchmakingClientModel.new()
var _http_request: HTTPRequest
var _base_url := ""
var _session_token := ""


func mount(parent: Node) -> void:
	if parent == null or _http_request != null:
		return
	_http_request = HTTPRequest.new()
	_http_request.name = "HangMatchmakingHttpRequest"
	_http_request.timeout = 8.0
	_http_request.request_completed.connect(_on_request_completed)
	parent.add_child(_http_request)


func configure(base_url: String, session_token: String) -> void:
	_base_url = base_url.strip_edges()
	_session_token = session_token.strip_edges()


func reset_for_login() -> void:
	clear_local_state()


func clear_local_state() -> void:
	if _http_request != null and _model.request_active():
		_http_request.cancel_request()
	_model.reset_for_login()
	state_changed.emit(_model.current_state())
	request_pending_changed.emit(false, "")


func current_state() -> Dictionary:
	return _model.current_state()


func request_active() -> bool:
	return _model.request_active()


func debug_apply_authoritative_state(state: Dictionary) -> Dictionary:
	var outcome := _model.apply_authoritative_state(state)
	if bool(outcome.get("changed", false)):
		state_changed.emit(_model.current_state())
	return outcome


func request_state() -> bool:
	return _begin_direct_request(
		HangMatchmakingClientModel.REQUEST_STATE,
		HangMatchmakingClientModel.state_request(_base_url, _session_token)
	)


func request_join(target: Dictionary) -> bool:
	return _send_already_started(
		HangMatchmakingClientModel.REQUEST_JOIN,
		_model.begin_join_request(_base_url, _session_token, target)
	)


func request_cancel() -> bool:
	return _send_already_started(
		HangMatchmakingClientModel.REQUEST_CANCEL,
		_model.begin_cancel_request(_base_url, _session_token)
	)


func update(delta: float) -> void:
	if _http_request == null:
		return
	var spec := _model.poll_request_if_due(
		delta,
		_base_url,
		_session_token
	)
	if spec.is_empty():
		return
	request_pending_changed.emit(true, HangMatchmakingClientModel.REQUEST_STATE)
	_send_spec(spec)


func _begin_direct_request(kind: String, spec: Dictionary) -> bool:
	if _http_request == null or spec.is_empty():
		return false
	if not _model.try_begin_request(kind):
		return false
	request_pending_changed.emit(true, kind)
	return _send_spec(spec)


func _send_already_started(kind: String, spec: Dictionary) -> bool:
	if _http_request == null or spec.is_empty():
		return false
	request_pending_changed.emit(true, kind)
	return _send_spec(spec)


func _send_spec(spec: Dictionary) -> bool:
	var error := _http_request.request(
		str(spec.get("url", "")),
		_packed_string_array(spec.get("headers", [])),
		int(spec.get("method", HTTPClient.METHOD_GET)),
		str(spec.get("body", ""))
	)
	if error == OK:
		return true
	_finish_transport_failure("请求发送失败，请稍后重试。")
	return false


func _on_request_completed(
	result: int,
	response_code: int,
	_headers: PackedStringArray,
	body: PackedByteArray
) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		_finish_transport_failure("服务器连接失败，请稍后重试。")
		return
	var parsed := HangMatchmakingClientModel.parse_response(response_code, body)
	var outcome := _model.finish_request(parsed)
	var kind := str(outcome.get("requestKind", ""))
	var ok := bool(outcome.get("ok", false))
	var message := str(outcome.get("message", "")).strip_edges()
	var quest_messages: Array[String] = []
	for value in parsed.get("questMessages", []):
		var quest_message := str(value).strip_edges()
		if quest_message != "":
			quest_messages.append(quest_message)
	request_pending_changed.emit(false, "")
	if ok and bool(outcome.get("changed", false)):
		state_changed.emit(_model.current_state())
	if ok and not quest_messages.is_empty():
		quest_messages_received.emit(kind, quest_messages)
	request_finished.emit(kind, ok, message)


func _finish_transport_failure(message: String) -> void:
	var outcome := _model.finish_request({
		"ok": false,
		"code": "network_error",
		"message": message,
	})
	var kind := str(outcome.get("requestKind", ""))
	request_pending_changed.emit(false, "")
	request_finished.emit(kind, false, str(outcome.get("message", message)))


func _packed_string_array(values) -> PackedStringArray:
	var result := PackedStringArray()
	if values is Array:
		for value in values as Array:
			result.append(str(value))
	return result
