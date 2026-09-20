extends RefCounted

# Keep replay memory bounded if a client is stalled while teammates advance.
# Beyond this recovery window retain the most recent authoritative turns.
const MAX_PENDING_TURNS := 128

var room_id: String = ""
var pending: Array[Dictionary] = []
var last_started: Dictionary = {}
var skipped_turns: int = 0


func reset(next_room_id: String = "") -> void:
	room_id = next_room_id
	pending.clear()
	last_started = {}
	skipped_turns = 0


func enqueue(turn: Dictionary) -> bool:
	if str(turn.get("kind", "")) != "battle_event_list" or room_id == "":
		return false
	if str(turn.get("roomId", room_id)).strip_edges() != room_id:
		return false
	if not last_started.is_empty() and not _before(last_started, turn):
		return false
	for queued in pending:
		if not _before(queued, turn) and not _before(turn, queued):
			return false
	pending.append(turn.duplicate(true))
	pending.sort_custom(_before)
	if pending.size() > MAX_PENDING_TURNS:
		pending.pop_front()
		skipped_turns += 1
	return true


func take_next() -> Dictionary:
	if pending.is_empty():
		return {}
	var turn: Dictionary = pending.pop_front()
	last_started = {"round": turn.get("round", 1), "turnSeq": turn.get("turnSeq", 0)}
	return turn


static func _before(left: Dictionary, right: Dictionary) -> bool:
	var left_round := maxi(1, int(left.get("round", 1)))
	var right_round := maxi(1, int(right.get("round", 1)))
	return left_round < right_round or (left_round == right_round and int(left.get("turnSeq", 0)) < int(right.get("turnSeq", 0)))
