extends RefCounted

const PROFILE_KEY := "petRidePermits"
const SCHEMA_VERSION := 1


static func default_state() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"permitIds": [],
	}


static func permit_id_for_riding(riding: Dictionary) -> String:
	return str(riding.get("permitId", "")).strip_edges()


static func permit_item_id_for_riding(riding: Dictionary) -> String:
	return str(riding.get("permitItemId", "")).strip_edges()


static func has_required_permit(profile: Dictionary, riding: Dictionary) -> bool:
	var permit_id := permit_id_for_riding(riding)
	if permit_id == "":
		return true
	var snapshot := read_state(profile)
	if not bool(snapshot.get("ok", false)):
		return false
	if bool(snapshot.get("legacyMissing", false)):
		return bool(riding.get("legacyProfilesGranted", false))
	return (snapshot.get("permitIds", []) as Array[String]).has(permit_id)


static func read_state(profile: Dictionary) -> Dictionary:
	if not profile.has(PROFILE_KEY):
		return {
			"ok": true,
			"legacyMissing": true,
			"state": default_state(),
			"permitIds": [] as Array[String],
		}
	var raw_state = profile.get(PROFILE_KEY)
	if not (raw_state is Dictionary):
		return _invalid_state("骑乘资格资料异常。")
	var state := raw_state as Dictionary
	if not _exact_integer_equals(state.get("schemaVersion"), SCHEMA_VERSION):
		return _invalid_state("骑乘资格版本异常。")
	var raw_permit_ids = state.get("permitIds")
	if not (raw_permit_ids is Array):
		return _invalid_state("骑乘资格列表异常。")
	var permit_ids: Array[String] = []
	for raw_permit_id in raw_permit_ids as Array:
		if not (raw_permit_id is String):
			return _invalid_state("骑乘资格编号异常。")
		var permit_id := str(raw_permit_id).strip_edges()
		if permit_id == "" or permit_ids.has(permit_id):
			return _invalid_state("骑乘资格编号异常。")
		permit_ids.append(permit_id)
	return {
		"ok": true,
		"legacyMissing": false,
		"state": {
			"schemaVersion": SCHEMA_VERSION,
			"permitIds": permit_ids.duplicate(),
		},
		"permitIds": permit_ids,
	}


static func plan_unlock(profile: Dictionary, riding: Dictionary, item_id: String) -> Dictionary:
	var permit_id := permit_id_for_riding(riding)
	var expected_item_id := permit_item_id_for_riding(riding)
	if permit_id == "" or expected_item_id == "":
		return {"ok": false, "code": "ride_permit_not_configured", "message": "这只宠物没有配置驯宠证。"}
	if item_id.strip_edges() != expected_item_id:
		return {"ok": false, "code": "ride_permit_item_mismatch", "message": "驯宠证与宠物不匹配。"}
	var snapshot := read_state(profile)
	if not bool(snapshot.get("ok", false)):
		return {
			"ok": false,
			"code": "ride_permit_state_invalid",
			"message": str(snapshot.get("message", "骑乘资格资料异常。")),
		}
	if has_required_permit(profile, riding):
		return {"ok": false, "code": "ride_permit_owned", "message": "已经获得这项骑乘资格。"}
	var permit_ids := (snapshot.get("permitIds", []) as Array[String]).duplicate()
	permit_ids.append(permit_id)
	return {
		"ok": true,
		"permitId": permit_id,
		"state": {
			"schemaVersion": SCHEMA_VERSION,
			"permitIds": permit_ids,
		},
	}


static func _invalid_state(message: String) -> Dictionary:
	return {
		"ok": false,
		"legacyMissing": false,
		"state": {},
		"permitIds": [] as Array[String],
		"message": message,
	}


static func _exact_integer_equals(value, expected: int) -> bool:
	return (value is int or value is float) and float(value) == float(expected) and floor(float(value)) == float(value)
