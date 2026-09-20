extends RefCounted

## QA wall-clock budgets, independent of MovieWriter's simulation clock.
## Combat consumes the whole-run deadline, but not a floor's navigation budget.
const NAVIGATION_LIMIT_MS := 420000
const BATTLE_STALL_LIMIT_MS := 90000

var navigation_elapsed_ms := 0
var combat_elapsed_ms := 0
var _deadline_ms: int
var _last_sample_ms: int
var _room_id := ""
var _round := 0
var _last_progress_ms := 0


func _init(now_ms: int, deadline_ms: int) -> void:
	_last_sample_ms = now_ms
	_deadline_ms = deadline_ms


func sample(now_ms: int, room_id: String = "", battle_round: int = 0) -> String:
	if now_ms < _last_sample_ms:
		return "review clock moved backwards"
	if _room_id.is_empty():
		navigation_elapsed_ms += now_ms - _last_sample_ms
	else:
		combat_elapsed_ms += now_ms - _last_sample_ms
	_last_sample_ms = now_ms
	if now_ms >= _deadline_ms:
		return "whole review timed out"
	if navigation_elapsed_ms >= NAVIGATION_LIMIT_MS:
		return "return navigation timed out"
	if room_id.is_empty():
		_room_id = ""
		return ""
	if _room_id.is_empty():
		_room_id = room_id
		_round = battle_round
		_last_progress_ms = now_ms
	elif room_id != _room_id:
		return "route encounter changed before playback completed"
	elif battle_round < _round:
		return "route encounter round moved backwards"
	elif battle_round > _round:
		_round = battle_round
		_last_progress_ms = now_ms
	# Only advancing the displayed round renews this allowance. Repeated room
	# packets, phase changes, frame draws and HP animations are not progress.
	if now_ms - _last_progress_ms >= BATTLE_STALL_LIMIT_MS:
		return "route encounter stopped advancing"
	return ""
