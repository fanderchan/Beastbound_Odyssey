extends RefCounted

const STATUS_POISON := "poison"
const STATUS_SLEEP := "sleep"
const STATUS_CONFUSION := "confusion"
const STATUS_STONE := "stone"

const _STATUS_LABELS := {
	STATUS_POISON: "中毒",
	STATUS_SLEEP: "睡眠",
	STATUS_CONFUSION: "混乱",
	STATUS_STONE: "石化",
}

const CONTROL_STATUSES := [
	STATUS_SLEEP,
	STATUS_CONFUSION,
	STATUS_STONE,
]


static func empty_statuses() -> Dictionary:
	return {}


static func statuses_for(actor: Dictionary) -> Dictionary:
	var value = actor.get("statuses", {})
	if value is Dictionary:
		return (value as Dictionary).duplicate(true)
	return {}


static func has_status(actor: Dictionary, status_id: String) -> bool:
	var statuses := statuses_for(actor)
	if not statuses.has(status_id):
		return false
	var status = statuses.get(status_id, {})
	if not (status is Dictionary):
		return false
	return int((status as Dictionary).get("turns", 0)) > 0


static func status_label(status_id: String) -> String:
	return str(_STATUS_LABELS.get(status_id, status_id))


static func status_turns(actor: Dictionary, status_id: String) -> int:
	var statuses := statuses_for(actor)
	var status = statuses.get(status_id, {})
	if status is Dictionary:
		return int((status as Dictionary).get("turns", 0))
	return 0


static func status_potency(actor: Dictionary, status_id: String) -> int:
	var statuses := statuses_for(actor)
	var status = statuses.get(status_id, {})
	if status is Dictionary:
		return int((status as Dictionary).get("potency", 0))
	return 0


static func blocking_status_id(actor: Dictionary) -> String:
	if has_status(actor, STATUS_STONE):
		return STATUS_STONE
	if has_status(actor, STATUS_SLEEP):
		return STATUS_SLEEP
	return ""


static func active_status_ids(actor: Dictionary) -> Array[String]:
	var result: Array[String] = []
	var statuses := statuses_for(actor)
	for key in statuses.keys():
		var status_id := str(key)
		if has_status(actor, status_id):
			result.append(status_id)
	return result


static func statuses_removed_by_apply(actor: Dictionary, status_id: String) -> Array[String]:
	var removed: Array[String] = []
	if not CONTROL_STATUSES.has(status_id):
		return removed
	for other_status_id in CONTROL_STATUSES:
		var other_id := str(other_status_id)
		if other_id != status_id and has_status(actor, other_id):
			removed.append(other_id)
	return removed


static func apply_status(actor: Dictionary, status_id: String, turns: int, potency: int = 0, source_id: String = "") -> Dictionary:
	var next_actor := actor.duplicate(true)
	var statuses := statuses_for(next_actor)
	for removed_status_id in statuses_removed_by_apply(next_actor, status_id):
		statuses.erase(removed_status_id)
	statuses[status_id] = {
		"id": status_id,
		"label": status_label(status_id),
		"turns": maxi(1, turns),
		"potency": maxi(0, potency),
		"sourceId": source_id,
	}
	next_actor["statuses"] = statuses
	return next_actor


static func active_matching_status_ids(actor: Dictionary, status_ids: Array) -> Array[String]:
	var result: Array[String] = []
	for value in status_ids:
		var status_id := str(value)
		if has_status(actor, status_id):
			result.append(status_id)
	return result


static func remove_statuses(actor: Dictionary, status_ids: Array) -> Dictionary:
	var next_actor := actor.duplicate(true)
	var statuses := statuses_for(next_actor)
	for value in status_ids:
		statuses.erase(str(value))
	next_actor["statuses"] = statuses
	return next_actor


static func remove_status(actor: Dictionary, status_id: String) -> Dictionary:
	var next_actor := actor.duplicate(true)
	var statuses := statuses_for(next_actor)
	statuses.erase(status_id)
	next_actor["statuses"] = statuses
	return next_actor


static func decrement_status(actor: Dictionary, status_id: String) -> Dictionary:
	var next_actor := actor.duplicate(true)
	var statuses := statuses_for(next_actor)
	var status = statuses.get(status_id, {})
	if status is Dictionary:
		var next_status := (status as Dictionary).duplicate(true)
		next_status["turns"] = int(next_status.get("turns", 0)) - 1
		if int(next_status.get("turns", 0)) <= 0:
			statuses.erase(status_id)
		else:
			statuses[status_id] = next_status
	next_actor["statuses"] = statuses
	return next_actor


static func status_labels_for(status_ids: Array) -> String:
	var labels: Array[String] = []
	for value in status_ids:
		var label := status_label(str(value))
		if label != "":
			labels.append(label)
	return "、".join(labels)


static func trace_statuses(actor: Dictionary) -> Dictionary:
	var result := {}
	var statuses := statuses_for(actor)
	for key in statuses.keys():
		var status_id := str(key)
		var status = statuses.get(key, {})
		if status is Dictionary and int((status as Dictionary).get("turns", 0)) > 0:
			result[status_id] = {
				"label": status_label(status_id),
				"turns": int((status as Dictionary).get("turns", 0)),
				"potency": int((status as Dictionary).get("potency", 0)),
			}
	return result
