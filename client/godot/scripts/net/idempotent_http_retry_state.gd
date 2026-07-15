extends RefCounted

const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")
const HARD_MAX_ATTEMPTS := 3

var _prepared_spec: Dictionary = {}
var _attempts: int = 0
var _active: bool = false
var _finished: bool = true


func prepare(spec: Dictionary) -> Dictionary:
	var prepared := ServerAuthClientModel.prepare_request_for_send(spec)
	if (
		bool(prepared.get("durableMutation", false))
		and not ServerAuthClientModel.idempotency_key_is_valid(
			ServerAuthClientModel.request_idempotency_key(prepared)
		)
	):
		cancel()
		return {}
	_prepared_spec = prepared.duplicate(true)
	_attempts = 0
	_active = true
	_finished = false
	return prepared_spec()


func begin_attempt() -> Dictionary:
	if not _active or _finished or _prepared_spec.is_empty():
		return {}
	if _attempts >= max_attempts():
		_active = false
		_finished = true
		return {}
	_attempts += 1
	return prepared_spec()


func complete_attempt(result: int, response_code: int) -> Dictionary:
	if not _active or _finished or _attempts <= 0:
		return _decision(false, true, 0.0)
	var should_retry := (
		_attempts < max_attempts()
		and ServerAuthClientModel.request_should_retry(
			_prepared_spec,
			result,
			response_code,
			_attempts
		)
	)
	if should_retry:
		return _decision(
			true,
			false,
			ServerAuthClientModel.request_retry_delay_seconds(_prepared_spec, _attempts)
		)
	_active = false
	_finished = true
	return _decision(false, true, 0.0)


func cancel() -> void:
	_prepared_spec.clear()
	_attempts = 0
	_active = false
	_finished = true


func prepared_spec() -> Dictionary:
	return _prepared_spec.duplicate(true)


func idempotency_key() -> String:
	return ServerAuthClientModel.request_idempotency_key(_prepared_spec)


func attempt_count() -> int:
	return _attempts


func max_attempts() -> int:
	if _prepared_spec.is_empty():
		return 0
	return mini(HARD_MAX_ATTEMPTS, ServerAuthClientModel.request_retry_attempts(_prepared_spec))


func is_active() -> bool:
	return _active and not _finished


func is_finished() -> bool:
	return _finished


func _decision(should_retry: bool, finished: bool, delay_seconds: float) -> Dictionary:
	return {
		"shouldRetry": should_retry,
		"finished": finished,
		"delaySeconds": maxf(0.0, delay_seconds),
		"attempts": _attempts,
		"maxAttempts": max_attempts(),
		"idempotencyKey": idempotency_key(),
	}
