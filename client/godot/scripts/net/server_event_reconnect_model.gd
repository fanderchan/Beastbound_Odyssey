extends RefCounted

const BASE_DELAY_SECONDS := 1.0
const MAX_DELAY_SECONDS := 30.0
const CONNECT_DEADLINE_SECONDS := 10.0
const READY_DEADLINE_SECONDS := 5.0
const STABLE_OPEN_RESET_SECONDS := 30.0
const MAX_ATTEMPT := 30
const PHASE_IDLE := "idle"
const PHASE_CONNECTING := "connecting"
const PHASE_WAITING_READY := "waiting_ready"
const PHASE_READY := "ready"

var _attempt: int = 0
var _stable_open_seconds: float = 0.0
var _connecting_seconds: float = 0.0
var _waiting_ready_seconds: float = 0.0
var _phase: String = PHASE_IDLE


func reset() -> void:
	_attempt = 0
	_stable_open_seconds = 0.0
	_connecting_seconds = 0.0
	_waiting_ready_seconds = 0.0
	_phase = PHASE_IDLE


func note_connecting() -> void:
	_stable_open_seconds = 0.0
	_connecting_seconds = 0.0
	_waiting_ready_seconds = 0.0
	_phase = PHASE_CONNECTING


func note_connecting_elapsed(delta: float) -> bool:
	if _phase != PHASE_CONNECTING:
		return false
	_connecting_seconds += maxf(0.0, delta)
	return _connecting_seconds >= CONNECT_DEADLINE_SECONDS


func note_open(delta: float) -> bool:
	if _phase == PHASE_CONNECTING:
		_phase = PHASE_WAITING_READY
		_connecting_seconds = 0.0
		_waiting_ready_seconds = 0.0
	if _phase == PHASE_WAITING_READY:
		_waiting_ready_seconds += maxf(0.0, delta)
		_stable_open_seconds = 0.0
		return false
	if _phase != PHASE_READY:
		return false
	_stable_open_seconds += maxf(0.0, delta)
	if _stable_open_seconds < STABLE_OPEN_RESET_SECONDS:
		return false
	var changed := _attempt > 0
	_attempt = 0
	_stable_open_seconds = STABLE_OPEN_RESET_SECONDS
	return changed


func note_ready() -> void:
	_phase = PHASE_READY
	_connecting_seconds = 0.0
	_waiting_ready_seconds = 0.0
	_stable_open_seconds = 0.0


func ready_timed_out() -> bool:
	return _phase == PHASE_WAITING_READY and _waiting_ready_seconds >= READY_DEADLINE_SECONDS


func next_delay(random_unit: float = -1.0, retry_after_seconds: float = 0.0) -> float:
	var window := minf(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * pow(2.0, float(mini(_attempt, 20))))
	_attempt = mini(MAX_ATTEMPT, _attempt + 1)
	_stable_open_seconds = 0.0
	_connecting_seconds = 0.0
	_waiting_ready_seconds = 0.0
	_phase = PHASE_IDLE
	var unit := clampf(random_unit, 0.0, 1.0) if random_unit >= 0.0 else randf()
	var jittered := window * unit
	return minf(MAX_DELAY_SECONDS, maxf(jittered, maxf(0.0, retry_after_seconds)))


func attempt() -> int:
	return _attempt


func stable_open_seconds() -> float:
	return _stable_open_seconds


func connecting_seconds() -> float:
	return _connecting_seconds


func waiting_ready_seconds() -> float:
	return _waiting_ready_seconds


func phase() -> String:
	return _phase


static func cursor_after_ready(current_event_seq: int, ready_event: Dictionary) -> int:
	var current := maxi(0, current_event_seq)
	if str(ready_event.get("replayMode", "")).strip_edges() != "fresh":
		return current
	return maxi(current, int(ready_event.get("latestEventSeq", 0)))


func self_check() -> Dictionary:
	var errors: Array[String] = []
	reset()
	var delays: Array[float] = []
	for _index in range(7):
		delays.append(next_delay(0.5))
	_expect(delays == [0.5, 1.0, 2.0, 4.0, 8.0, 15.0, 15.0], "指数 full-jitter 序列不正确", errors)
	_expect(attempt() == 7, "重连 attempt 没有递增", errors)
	var retry_after := next_delay(0.0, 12.0)
	_expect(is_equal_approx(retry_after, 12.0), "Retry-After 没有覆盖较短 jitter", errors)
	var zero_jitter := next_delay(0.0)
	_expect(is_zero_approx(zero_jitter), "full-jitter 被固定下限截断", errors)
	var attempt_before_deadlines := attempt()
	note_connecting()
	_expect(not note_connecting_elapsed(CONNECT_DEADLINE_SECONDS - 0.1), "连接截止前误判超时", errors)
	_expect(note_connecting_elapsed(0.1), "连接超过截止时间未超时", errors)
	note_connecting()
	_expect(not note_open(READY_DEADLINE_SECONDS - 0.1), "等待 ready 时错误重置 attempt", errors)
	_expect(not ready_timed_out(), "ready 截止前误判超时", errors)
	_expect(not note_open(0.1) and ready_timed_out(), "缺少 events.ready 时未超时", errors)
	_expect(attempt() == attempt_before_deadlines, "仅 transport open 就重置了 attempt", errors)
	note_connecting()
	note_open(0.1)
	note_ready()
	_expect(not note_open(STABLE_OPEN_RESET_SECONDS - 0.1), "未稳定 30 秒就重置 attempt", errors)
	_expect(note_open(0.1) and attempt() == 0, "稳定连接没有重置 attempt", errors)
	var capped := 0.0
	for _index in range(40):
		capped = next_delay(1.0)
	_expect(is_equal_approx(capped, MAX_DELAY_SECONDS), "重连延迟没有封顶", errors)
	var fresh_cursor := cursor_after_ready(0, {"replayMode": "fresh", "latestEventSeq": 37})
	var fresh_cursor_does_not_rewind := cursor_after_ready(41, {"replayMode": "fresh", "latestEventSeq": 37})
	var replay_cursor := cursor_after_ready(12, {"replayMode": "replay", "latestEventSeq": 50})
	var reset_cursor := cursor_after_ready(12, {"replayMode": "reset", "latestEventSeq": 50})
	_expect(fresh_cursor == 37, "fresh ready 没有建立最新游标", errors)
	_expect(fresh_cursor_does_not_rewind == 41, "fresh ready 回退了已有游标", errors)
	_expect(replay_cursor == 12, "replay ready 提前跳过了待补事件", errors)
	_expect(reset_cursor == 12, "reset ready 应等待 events.reset 推进游标", errors)
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"delayCount": delays.size(),
		"cursorCaseCount": 4,
		"maxDelaySeconds": MAX_DELAY_SECONDS,
		"connectDeadlineSeconds": CONNECT_DEADLINE_SECONDS,
		"readyDeadlineSeconds": READY_DEADLINE_SECONDS,
		"stableResetSeconds": STABLE_OPEN_RESET_SECONDS,
	}


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
