extends RefCounted

const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const ServerBattleRoomModel := preload("res://scripts/battle/server_battle_room_model.gd")

const SYNCING_TEXT := "宠物资料正在同步，暂时无法捕捉。"


static func snapshot(
	profile: Dictionary,
	room: Dictionary = {},
	session: Dictionary = {},
	active_room_id: String = "",
	require_server_room: bool = false
) -> Dictionary:
	var base_counts := _profile_counts(profile)
	if not bool(base_counts.get("ok", false)):
		return _unavailable_snapshot()
	var pending_count := 0
	if require_server_room:
		var account_id := str(session.get("accountId", "")).strip_edges()
		var normalized_room_id := active_room_id.strip_edges()
		if (
			account_id == ""
			or normalized_room_id == ""
			or room.is_empty()
			or str(room.get("roomId", "")).strip_edges() != normalized_room_id
			or str(room.get("status", "")).strip_edges() != "ready"
		):
			return _unavailable_snapshot()
		pending_count = ServerBattleRoomModel.captured_wild_pet_count_for_account(room, session)

	var party_base := int(base_counts.get("partyCount", 0))
	var storage_base := int(base_counts.get("storageCount", 0))
	var pending_party := mini(pending_count, maxi(0, PlayerProgressModel.PARTY_LIMIT - party_base))
	var pending_storage := pending_count - pending_party
	var party_count := mini(PlayerProgressModel.PARTY_LIMIT, party_base + pending_party)
	var storage_count := mini(PlayerProgressModel.STORAGE_LIMIT, storage_base + pending_storage)
	var total_used := party_base + storage_base + pending_count
	var total_limit := PlayerProgressModel.PARTY_LIMIT + PlayerProgressModel.STORAGE_LIMIT
	var result := {
		"known": true,
		"partyCount": party_count,
		"partyLimit": PlayerProgressModel.PARTY_LIMIT,
		"storageCount": storage_count,
		"storageLimit": PlayerProgressModel.STORAGE_LIMIT,
		"pendingCount": pending_count,
		"totalUsed": total_used,
		"totalLimit": total_limit,
		"canCapture": total_used < total_limit,
		"schemaVersion": 1,
	}
	result["label"] = status_text(result)
	result["blockedMessage"] = blocked_message(result)
	return result


static func status_text(value: Dictionary) -> String:
	if not bool(value.get("known", false)):
		return SYNCING_TEXT
	var text := "随身 %d/%d、兽栏 %d/%d" % [
		int(value.get("partyCount", 0)),
		int(value.get("partyLimit", PlayerProgressModel.PARTY_LIMIT)),
		int(value.get("storageCount", 0)),
		int(value.get("storageLimit", PlayerProgressModel.STORAGE_LIMIT)),
	]
	return "%s（已满）" % text if not bool(value.get("canCapture", false)) else text


static func blocked_message(value: Dictionary) -> String:
	if not bool(value.get("known", false)):
		return SYNCING_TEXT
	return "宠物已满：随身 %d/%d、兽栏 %d/%d。请在战斗结束后整理宠物。" % [
		int(value.get("partyCount", 0)),
		int(value.get("partyLimit", PlayerProgressModel.PARTY_LIMIT)),
		int(value.get("storageCount", 0)),
		int(value.get("storageLimit", PlayerProgressModel.STORAGE_LIMIT)),
	]


static func _profile_counts(profile: Dictionary) -> Dictionary:
	var raw_instances = profile.get("petInstances", null)
	if not (raw_instances is Array):
		return {"ok": false}
	var party_count := 0
	var storage_count := 0
	for value in raw_instances as Array:
		if not (value is Dictionary):
			return {"ok": false}
		if str((value as Dictionary).get("state", PlayerProgressModel.PET_STATE_STANDBY)) == PlayerProgressModel.PET_STATE_STORAGE:
			storage_count += 1
		else:
			party_count += 1
	if party_count > PlayerProgressModel.PARTY_LIMIT or storage_count > PlayerProgressModel.STORAGE_LIMIT:
		return {"ok": false}
	return {
		"ok": true,
		"partyCount": party_count,
		"storageCount": storage_count,
	}


static func _unavailable_snapshot() -> Dictionary:
	return {
		"known": false,
		"partyCount": 0,
		"partyLimit": PlayerProgressModel.PARTY_LIMIT,
		"storageCount": 0,
		"storageLimit": PlayerProgressModel.STORAGE_LIMIT,
		"pendingCount": 0,
		"totalUsed": 0,
		"totalLimit": PlayerProgressModel.PARTY_LIMIT + PlayerProgressModel.STORAGE_LIMIT,
		"canCapture": false,
		"label": SYNCING_TEXT,
		"blockedMessage": SYNCING_TEXT,
		"schemaVersion": 1,
	}
