extends RefCounted

const STATE_BLOCKED := "blocked"
const CRITICAL_STATES: Array[String] = [
	"ready",
	"rebirth_ready",
	"in_progress",
]
const MAX_AMBIENT_MARKERS := 2
const BLOCKED_NEARBY_RADIUS_CELLS := 2


static func visible_item_ids(
	entries: Array[Dictionary],
	player_cell: Vector2i,
	selected_item_id: String = ""
) -> Dictionary:
	var visible: Dictionary = {}
	var ambient: Array[Dictionary] = []
	for entry in entries:
		var item_id := str(entry.get("itemId", "")).strip_edges()
		var state := str(entry.get("state", "")).strip_edges()
		var cell_value: Variant = entry.get("cell")
		if item_id == "" or state == "" or not (cell_value is Vector2i):
			continue
		var cell := cell_value as Vector2i
		var distance := maxi(
			absi(cell.x - player_cell.x),
			absi(cell.y - player_cell.y)
		)
		if item_id == selected_item_id or CRITICAL_STATES.has(state):
			visible[item_id] = true
			continue
		if state == STATE_BLOCKED and distance > BLOCKED_NEARBY_RADIUS_CELLS:
			continue
		ambient.append({
			"itemId": item_id,
			"state": state,
			"distance": distance,
			"priority": _state_priority(state),
		})
	ambient.sort_custom(_ambient_less)
	for index in range(mini(MAX_AMBIENT_MARKERS, ambient.size())):
		visible[str(ambient[index].get("itemId", ""))] = true
	return visible


static func _state_priority(state: String) -> int:
	match state:
		"available":
			return 50
		"rebirth_available":
			return 40
		"repeatable":
			return 30
		STATE_BLOCKED:
			return 10
	return 20


static func _ambient_less(left: Dictionary, right: Dictionary) -> bool:
	var left_priority := int(left.get("priority", 0))
	var right_priority := int(right.get("priority", 0))
	if left_priority != right_priority:
		return left_priority > right_priority
	var left_distance := int(left.get("distance", 0))
	var right_distance := int(right.get("distance", 0))
	if left_distance != right_distance:
		return left_distance < right_distance
	return str(left.get("itemId", "")) < str(right.get("itemId", ""))
