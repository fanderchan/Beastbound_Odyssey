extends RefCounted

const SCHEMA_VERSION := 1
const MAX_TOKEN_LENGTH := 256


static func from_movement_response(value, position: Dictionary) -> Dictionary:
	if not (value is Dictionary):
		return {}
	if not position.has("mapId") or not position.has("cellX") or not position.has("cellY") or not position.has("movementSeq"):
		return {}
	var source := value as Dictionary
	var token := str(source.get("token", "")).strip_edges()
	var map_id := str(source.get("mapId", "")).strip_edges()
	var zone_id := str(source.get("zoneId", "")).strip_edges()
	var group_id := str(source.get("encounterGroupId", "")).strip_edges()
	var expires_at := str(source.get("expiresAt", "")).strip_edges()
	if (
		token == ""
		or token.length() > MAX_TOKEN_LENGTH
		or map_id == ""
		or zone_id == ""
		or group_id == ""
		or expires_at == ""
		or int(source.get("schemaVersion", 0)) != SCHEMA_VERSION
		or not source.has("cellX")
		or not source.has("cellY")
		or not source.has("movementSeq")
	):
		return {}
	var cell_x := int(source.get("cellX", 0))
	var cell_y := int(source.get("cellY", 0))
	var movement_seq := int(source.get("movementSeq", 0))
	if movement_seq < 1:
		return {}
	if (
		str(position.get("mapId", "")).strip_edges() != map_id
		or int(position.get("cellX", cell_x)) != cell_x
		or int(position.get("cellY", cell_y)) != cell_y
		or int(position.get("movementSeq", movement_seq)) != movement_seq
	):
		return {}
	return {
		"token": token,
		"mapId": map_id,
		"zoneId": zone_id,
		"encounterGroupId": group_id,
		"cellX": cell_x,
		"cellY": cell_y,
		"movementSeq": movement_seq,
		"expiresAt": expires_at,
		"schemaVersion": SCHEMA_VERSION,
	}


static func bound_cell(permit: Dictionary) -> Vector2i:
	return Vector2i(int(permit.get("cellX", 0)), int(permit.get("cellY", 0)))


static func matches_visual_cell(permit: Dictionary, map_id: String, cell: Vector2i) -> bool:
	return (
		not permit.is_empty()
		and str(permit.get("mapId", "")) == map_id
		and bound_cell(permit) == cell
	)
