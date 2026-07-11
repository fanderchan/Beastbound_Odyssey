extends RefCounted

const ServerPetProfileProjectionModel := preload("res://scripts/progression/server_pet_profile_projection_model.gd")

const SERVER_CACHE_ROOT := "user://server_accounts/"
const PROFILE_FILE_NAME := "player_profile.json"
const STATUS_MISSING := "missing"
const STATUS_UNCHANGED := "unchanged"
const STATUS_SANITIZED := "sanitized"
const STATUS_PUBLISHED := "published"
const STATUS_INVALID_PATH := "invalid_path"
const STATUS_READ_FAILED := "read_failed"
const STATUS_INVALID_JSON := "invalid_json"
const STATUS_INVALID_PROFILE := "invalid_profile"
const STATUS_WRITE_FAILED := "write_failed"


static func backup_path_for_active(active_path: String) -> String:
	var extension := active_path.get_extension()
	if extension == "":
		return "%s.last_good" % active_path
	return "%s.last_good.%s" % [
		active_path.substr(0, active_path.length() - extension.length() - 1),
		extension,
	]


static func sanitize_server_cache_pair(active_path: String) -> Dictionary:
	var normalized_path := active_path.strip_edges()
	if not _valid_server_cache_path(normalized_path):
		var invalid := _file_result(normalized_path, false, STATUS_INVALID_PATH)
		return {
			"ok": false,
			"refreshNeeded": true,
			"active": invalid,
			"lastGood": _file_result("", false, STATUS_INVALID_PATH),
		}
	var backup_path := backup_path_for_active(normalized_path)
	var active_result := _sanitize_one(normalized_path)
	var backup_result := _sanitize_one(backup_path)
	return {
		"ok": bool(active_result.get("ok", false)) and bool(backup_result.get("ok", false)),
		"refreshNeeded": (
			not bool(active_result.get("ok", false))
			or not bool(backup_result.get("ok", false))
			or bool(active_result.get("requiresFreshServerProfile", false))
			or bool(backup_result.get("requiresFreshServerProfile", false))
		),
		"active": active_result,
		"lastGood": backup_result,
	}


static func publish_fresh_server_profile(active_path: String, source: Dictionary) -> Dictionary:
	var normalized_path := active_path.strip_edges()
	if not _valid_server_cache_path(normalized_path):
		return {
			"ok": false,
			"active": _file_result(normalized_path, false, STATUS_INVALID_PATH),
			"lastGood": _file_result("", false, STATUS_INVALID_PATH),
		}
	var projection := ServerPetProfileProjectionModel.project_runtime_server_profile(source)
	if not bool(projection.get("ok", false)):
		var invalid := _file_result(normalized_path, false, STATUS_INVALID_PROFILE)
		invalid["requiresFreshServerProfile"] = true
		return {
			"ok": false,
			"active": invalid,
			"lastGood": _file_result(backup_path_for_active(normalized_path), false, STATUS_INVALID_PROFILE),
		}
	var public_profile := (projection.get("profile", {}) as Dictionary).duplicate(true)
	var backup_path := backup_path_for_active(normalized_path)
	var active_ok := _replace_json_file(normalized_path, public_profile)
	var backup_ok := _replace_json_file(backup_path, public_profile)
	return {
		"ok": active_ok and backup_ok,
		"active": _file_result(normalized_path, active_ok, STATUS_PUBLISHED if active_ok else STATUS_WRITE_FAILED),
		"lastGood": _file_result(backup_path, backup_ok, STATUS_PUBLISHED if backup_ok else STATUS_WRITE_FAILED),
		"projectedPetCount": int(projection.get("projectedPetCount", 0)),
	}


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var case_count := 0
	var suffix := "%d_%d" % [int(Time.get_unix_time_from_system()), Time.get_ticks_usec()]
	var directory := "%s__cache_sanitizer_check_%s" % [SERVER_CACHE_ROOT, suffix]
	var active_path := "%s/%s" % [directory, PROFILE_FILE_NAME]
	var backup_path := backup_path_for_active(active_path)
	var corrupt_text := "{ this is not valid json"

	var active_source := _cache_fixture("active_pet", "active_secret")
	active_source["stoneCoins"] = 777
	active_source["economy"] = {"qualityScore": 44, "growthBonus": {"attack": 9}}
	var backup_source := _cache_fixture("backup_pet", "backup_secret")
	backup_source["stoneCoins"] = 333
	backup_source["groundPetDrops"] = [{
		"dropId": "backup_drop",
		"pet": _legacy_pet("backup_drop_pet", "backup_drop_secret"),
	}]
	_expect(_write_raw(active_path, JSON.stringify(active_source, "\t")), "无法写入 active 测试缓存", errors)
	_expect(_write_raw(backup_path, JSON.stringify(backup_source, "\t")), "无法写入 backup 测试缓存", errors)
	var active_before := _read_dictionary(active_path)
	var backup_before := _read_dictionary(backup_path)
	var sanitized := sanitize_server_cache_pair(active_path)
	case_count += 1
	var active_result := sanitized.get("active", {}) as Dictionary
	var backup_result := sanitized.get("lastGood", {}) as Dictionary
	_expect(bool(sanitized.get("ok", false)), "双缓存清洗应成功", errors)
	_expect(str(active_result.get("status", "")) == STATUS_SANITIZED, "active 未独立清洗", errors)
	_expect(str(backup_result.get("status", "")) == STATUS_SANITIZED, "last_good 未独立清洗", errors)
	var active_after := _read_dictionary(active_path)
	var backup_after := _read_dictionary(backup_path)
	_expect(_known_pet_private_path(active_after) == "", "active 仍含宠物私有字段", errors)
	_expect(_known_pet_private_path(backup_after) == "", "last_good 仍含宠物私有字段", errors)
	_expect(_visible_pet_stats_equal(active_before, active_after), "active 清洗改写宠物当前属性", errors)
	_expect(_visible_pet_stats_equal(backup_before, backup_after), "last_good 清洗改写宠物当前属性", errors)
	_expect(int(active_after.get("stoneCoins", 0)) == 777, "active 清洗改写货币", errors)
	_expect(
		_deep_equal(active_after.get("economy", {}), active_before.get("economy", {})),
		"active 清洗误删非宠同名字段",
		errors
	)

	var repeated := sanitize_server_cache_pair(active_path)
	case_count += 1
	_expect(
		str((repeated.get("active", {}) as Dictionary).get("status", "")) == STATUS_UNCHANGED
			and str((repeated.get("lastGood", {}) as Dictionary).get("status", "")) == STATUS_UNCHANGED,
		"双缓存清洗不是幂等操作",
		errors
	)

	_expect(_write_raw(active_path, corrupt_text), "无法写入损坏 active", errors)
	_expect(_write_raw(backup_path, JSON.stringify(backup_source, "\t")), "无法重写 backup", errors)
	var corrupt_active := sanitize_server_cache_pair(active_path)
	case_count += 1
	_expect(not bool(corrupt_active.get("ok", true)), "损坏 active 被误报成功", errors)
	_expect(
		str((corrupt_active.get("active", {}) as Dictionary).get("status", "")) == STATUS_INVALID_JSON
			and FileAccess.get_file_as_string(active_path) == corrupt_text,
		"损坏 active 没有原样保留",
		errors
	)
	_expect(
		str((corrupt_active.get("lastGood", {}) as Dictionary).get("status", "")) == STATUS_SANITIZED,
		"active 损坏时没有继续独立清洗 last_good",
		errors
	)

	_expect(_write_raw(active_path, JSON.stringify(active_source, "\t")), "无法重写 active", errors)
	_expect(_write_raw(backup_path, corrupt_text), "无法写入损坏 backup", errors)
	var corrupt_backup := sanitize_server_cache_pair(active_path)
	case_count += 1
	_expect(not bool(corrupt_backup.get("ok", true)), "损坏 backup 被误报成功", errors)
	_expect(
		str((corrupt_backup.get("active", {}) as Dictionary).get("status", "")) == STATUS_SANITIZED,
		"last_good 损坏时没有继续独立清洗 active",
		errors
	)
	_expect(
		str((corrupt_backup.get("lastGood", {}) as Dictionary).get("status", "")) == STATUS_INVALID_JSON
			and FileAccess.get_file_as_string(backup_path) == corrupt_text,
		"损坏 last_good 没有原样保留",
		errors
	)

	var malformed_source := {"petInstances": [{"instanceId": "broken_pet", "individualSeed": "keep-original"}]}
	var malformed_text := JSON.stringify(malformed_source, "\t")
	_expect(_write_raw(active_path, malformed_text), "无法写入结构损坏缓存", errors)
	_remove_file(backup_path)
	var malformed := sanitize_server_cache_pair(active_path)
	case_count += 1
	_expect(
		not bool(malformed.get("ok", true))
			and str((malformed.get("active", {}) as Dictionary).get("status", "")) == STATUS_INVALID_PROFILE
			and FileAccess.get_file_as_string(active_path) == malformed_text,
		"无法证明属性不变的缓存没有原样保留",
		errors
	)

	_expect(_write_raw(active_path, "[]"), "无法写入非 Dictionary 根", errors)
	var invalid_root := sanitize_server_cache_pair(active_path)
	case_count += 1
	_expect(
		str((invalid_root.get("active", {}) as Dictionary).get("status", "")) == STATUS_INVALID_PROFILE
			and FileAccess.get_file_as_string(active_path) == "[]",
		"非 Dictionary 根没有原样保留",
		errors
	)

	_remove_file(active_path)
	_remove_file(backup_path)
	var missing := sanitize_server_cache_pair(active_path)
	case_count += 1
	_expect(
		bool(missing.get("ok", false))
			and str((missing.get("active", {}) as Dictionary).get("status", "")) == STATUS_MISSING
			and str((missing.get("lastGood", {}) as Dictionary).get("status", "")) == STATUS_MISSING,
		"缺失双缓存不应报错",
		errors
	)
	_expect(backup_path == "%s/player_profile.last_good.json" % directory, "last_good 路径推导错误", errors)
	_expect(not _directory_has_temp_file(directory), "清洗后残留临时文件", errors)

	var vector_document = JSON.parse_string(FileAccess.get_file_as_string("res://../../tools/fixtures/server_pet_profile_public_v2_vectors.json"))
	var vector_cases = (vector_document as Dictionary).get("cases", []) if vector_document is Dictionary else []
	var fresh_profile = ((vector_cases as Array)[0] as Dictionary).get("expectedPublicProfile", {}) if vector_cases is Array and not (vector_cases as Array).is_empty() else {}
	if fresh_profile is Dictionary:
		fresh_profile = (fresh_profile as Dictionary).duplicate(true)
		# The fixture came through JSON and therefore stores numeric fields as
		# floats; keep that representation so the atomic write/read deep check is
		# testing the cache rather than an int-vs-float fixture mismatch.
		(fresh_profile as Dictionary)["schemaVersion"] = float(ServerPetProfileProjectionModel.CURRENT_SERVER_PROFILE_SCHEMA_VERSION)
	var published := publish_fresh_server_profile(active_path, fresh_profile as Dictionary if fresh_profile is Dictionary else {})
	case_count += 1
	var published_active := _read_dictionary(active_path)
	var published_backup := _read_dictionary(backup_path)
	_expect(bool(published.get("ok", false)), "新鲜服务器公开档案发布失败：active=%s backup=%s" % [
		str((published.get("active", {}) as Dictionary).get("status", "")),
		str((published.get("lastGood", {}) as Dictionary).get("status", "")),
	], errors)
	_expect(_deep_equal(published_active, published_backup), "active 与 last_good 发布内容不一致", errors)
	_expect(_known_pet_private_path(published_active) == "", "新鲜服务器缓存发布了私有字段", errors)
	var published_before := published_active.duplicate(true)
	var rejected_publish := publish_fresh_server_profile(active_path, malformed_source)
	case_count += 1
	_expect(not bool(rejected_publish.get("ok", true)), "缺 marker 的服务器档案被错误发布", errors)
	_expect(
		_deep_equal(_read_dictionary(active_path), published_before)
			and _deep_equal(_read_dictionary(backup_path), published_before),
		"失败发布改写了既有安全缓存",
		errors
	)

	var invalid_path := sanitize_server_cache_pair("user://player_profile.json")
	case_count += 1
	_expect(
		not bool(invalid_path.get("ok", true))
			and str((invalid_path.get("active", {}) as Dictionary).get("status", "")) == STATUS_INVALID_PATH,
		"路径白名单没有拒绝本地单机档案",
		errors
	)

	var current_cache := {"schemaVersion": 3, "player": {"name": "当前缓存"}, "petInstances": [], "futureRoot": {"kept": true}}
	var current_text := JSON.stringify(current_cache, "\t")
	_expect(_write_raw(active_path, current_text), "无法写入 current 缓存夹具", errors)
	var current_result := _sanitize_one(active_path)
	case_count += 1
	_expect(
		bool(current_result.get("ok", false))
			and str(current_result.get("status", "")) == STATUS_UNCHANGED
			and str(current_result.get("profileSchemaStatus", "")) == "current"
			and not bool(current_result.get("requiresFreshServerProfile", true))
			and FileAccess.get_file_as_string(active_path) == current_text,
		"current schema3 缓存没有保持可用且原样",
		errors
	)

	var legacy_cache := _cache_fixture("legacy_schema_pet", "legacy_schema_secret")
	var legacy_text := JSON.stringify(legacy_cache, "\t")
	_expect(_write_raw(active_path, legacy_text), "无法写入 legacy 缓存夹具", errors)
	var legacy_result := _sanitize_one(active_path)
	case_count += 1
	_expect(
		bool(legacy_result.get("ok", false))
			and str(legacy_result.get("profileSchemaStatus", "")) == "legacy"
			and bool(legacy_result.get("requiresFreshServerProfile", false))
			and _known_pet_private_path(_read_dictionary(active_path)) == "",
		"legacy 缓存没有只清秘密并要求新鲜档案",
		errors
	)

	var missing_cache := legacy_cache.duplicate(true)
	missing_cache.erase("schemaVersion")
	var missing_text := JSON.stringify(missing_cache, "\t")
	_expect(_write_raw(active_path, missing_text), "无法写入 missing 缓存夹具", errors)
	var missing_schema_result := _sanitize_one(active_path)
	case_count += 1
	_expect(
		bool(missing_schema_result.get("ok", false))
			and str(missing_schema_result.get("profileSchemaStatus", "")) == "missing"
			and bool(missing_schema_result.get("requiresFreshServerProfile", false))
			and _known_pet_private_path(_read_dictionary(active_path)) == "",
		"missing schema 缓存没有只清秘密并要求新鲜档案",
		errors
	)

	var future_cache := legacy_cache.duplicate(true)
	future_cache["schemaVersion"] = 4
	var future_text := JSON.stringify(future_cache, "\t")
	_expect(_write_raw(active_path, future_text), "无法写入 future 缓存夹具", errors)
	var future_result := _sanitize_one(active_path)
	case_count += 1
	_expect(
		not bool(future_result.get("ok", true))
			and str(future_result.get("profileSchemaStatus", "")) == "future"
			and bool(future_result.get("requiresFreshServerProfile", false))
			and FileAccess.get_file_as_string(active_path) == future_text,
		"future 缓存没有原字节保留并失败关闭",
		errors
	)

	var invalid_cache := legacy_cache.duplicate(true)
	invalid_cache["schemaVersion"] = "3"
	var invalid_text := JSON.stringify(invalid_cache, "\t")
	_expect(_write_raw(active_path, invalid_text), "无法写入 invalid 缓存夹具", errors)
	var invalid_schema_result := _sanitize_one(active_path)
	case_count += 1
	_expect(
		not bool(invalid_schema_result.get("ok", true))
			and str(invalid_schema_result.get("profileSchemaStatus", "")) == "invalid"
			and bool(invalid_schema_result.get("requiresFreshServerProfile", false))
			and FileAccess.get_file_as_string(active_path) == invalid_text,
		"invalid schema 缓存没有原字节保留并失败关闭",
		errors
	)

	_remove_file(active_path)
	_remove_file(backup_path)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(directory))
	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"caseCount": case_count,
	}


static func _sanitize_one(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return _file_result(path, true, STATUS_MISSING)
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _file_result(path, false, STATUS_READ_FAILED)
	var original_text := file.get_as_text()
	file.close()
	var parsed_result := _parse_json(original_text)
	if not bool(parsed_result.get("ok", false)):
		return _file_result(path, false, STATUS_INVALID_JSON)
	var parsed = parsed_result.get("data")
	if not (parsed is Dictionary):
		return _file_result(path, false, STATUS_INVALID_PROFILE)
	var schema_info := ServerPetProfileProjectionModel.profile_schema_info(parsed as Dictionary)
	var schema_status := str(schema_info.get("status", "invalid"))
	# Future and malformed schema declarations are opaque.  Even the pet-secret
	# sanitizer must not parse and rewrite bytes it does not understand.
	if schema_status == "future" or schema_status == "invalid":
		var opaque := _file_result(path, false, STATUS_INVALID_PROFILE)
		opaque["requiresFreshServerProfile"] = true
		opaque["profileSchemaStatus"] = schema_status
		return opaque
	var projection := ServerPetProfileProjectionModel.sanitize_cached_server_profile(parsed as Dictionary)
	if not bool(projection.get("ok", false)):
		var invalid_profile := _file_result(path, false, STATUS_INVALID_PROFILE)
		invalid_profile["requiresFreshServerProfile"] = true
		invalid_profile["profileSchemaStatus"] = schema_status
		invalid_profile["projectedPetCount"] = int(projection.get("projectedPetCount", 0))
		invalid_profile["profileErrorCount"] = (projection.get("profileErrors", []) as Array).size()
		return invalid_profile
	var sanitized := projection.get("profile", {}) as Dictionary
	if _deep_equal(parsed, sanitized):
		var unchanged := _file_result(path, true, STATUS_UNCHANGED)
		unchanged["requiresFreshServerProfile"] = schema_status != "current" or bool(projection.get("requiresFreshServerProfile", false))
		unchanged["profileSchemaStatus"] = schema_status
		unchanged["projectedPetCount"] = int(projection.get("projectedPetCount", 0))
		return unchanged
	if not _replace_json_file(path, sanitized):
		return _file_result(path, false, STATUS_WRITE_FAILED)
	var result := _file_result(path, true, STATUS_SANITIZED)
	result["changed"] = true
	result["requiresFreshServerProfile"] = schema_status != "current" or bool(projection.get("requiresFreshServerProfile", false))
	result["profileSchemaStatus"] = schema_status
	result["projectedPetCount"] = int(projection.get("projectedPetCount", 0))
	return result


static func _replace_json_file(path: String, value: Dictionary) -> bool:
	var dir_path := path.get_base_dir()
	if dir_path != "":
		var dir_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
		if dir_error != OK and dir_error != ERR_ALREADY_EXISTS:
			return false
	var temp_path := _unique_temp_path(path)
	var file := FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return false
	var text := JSON.stringify(value, "\t")
	var stored := file.store_string(text)
	file.flush()
	file.close()
	if not stored:
		_remove_file(temp_path)
		return false
	var verify_result := _parse_json(FileAccess.get_file_as_string(temp_path))
	var verify = verify_result.get("data")
	if not bool(verify_result.get("ok", false)) or not (verify is Dictionary) or not _deep_equal(verify, value):
		_remove_file(temp_path)
		return false
	var rename_error := DirAccess.rename_absolute(
		ProjectSettings.globalize_path(temp_path),
		ProjectSettings.globalize_path(path)
	)
	if rename_error != OK:
		_remove_file(temp_path)
		return false
	return true


static func _unique_temp_path(path: String) -> String:
	var base := "%s.sanitize.%d" % [path, Time.get_ticks_usec()]
	for serial in range(100):
		var candidate := "%s.%d.tmp" % [base, serial]
		if not FileAccess.file_exists(candidate):
			return candidate
	return "%s.fallback.tmp" % base


static func _valid_server_cache_path(path: String) -> bool:
	return (
		path.begins_with(SERVER_CACHE_ROOT)
		and path.get_file() == PROFILE_FILE_NAME
		and path.find("..") < 0
	)


static func _file_result(path: String, ok_value: bool, status: String) -> Dictionary:
	return {
		"ok": ok_value,
		"status": status,
		"path": path,
		"changed": false,
		"requiresFreshServerProfile": false,
		"projectedPetCount": 0,
		"profileErrorCount": 0,
		"profileSchemaStatus": "missing",
	}


static func _write_raw(path: String, text: String) -> bool:
	var dir_path := path.get_base_dir()
	if dir_path != "":
		var dir_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir_path))
		if dir_error != OK and dir_error != ERR_ALREADY_EXISTS:
			return false
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	var stored := file.store_string(text)
	file.close()
	return stored


static func _read_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed_result := _parse_json(FileAccess.get_file_as_string(path))
	var parsed = parsed_result.get("data")
	return parsed as Dictionary if bool(parsed_result.get("ok", false)) and parsed is Dictionary else {}


static func _parse_json(text: String) -> Dictionary:
	var parser := JSON.new()
	var error := parser.parse(text)
	return {
		"ok": error == OK,
		"data": parser.data if error == OK else null,
	}


static func _remove_file(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


static func _directory_has_temp_file(directory: String) -> bool:
	var dir := DirAccess.open(directory)
	if dir == null:
		return false
	for file_name in dir.get_files():
		if file_name.find(".sanitize.") >= 0 and file_name.ends_with(".tmp"):
			return true
	return false


static func _cache_fixture(instance_id: String, seed: String) -> Dictionary:
	return {
		"schemaVersion": 1,
		"player": {"name": "旧联网缓存", "level": 20},
		"petInstances": [_legacy_pet(instance_id, seed)],
		"backpackSlots": [{"itemId": "item_meat_small", "count": 3}],
	}


static func _legacy_pet(instance_id: String, seed: String) -> Dictionary:
	return {
		"instanceId": instance_id,
		"petId": instance_id,
		"formId": "fixture_form",
		"name": "旧缓存宠物",
		"level": 20,
		"exp": 12,
		"hp": 171,
		"maxHp": 200,
		"attack": 91,
		"defense": 68,
		"quick": 74,
		"initialStats": {"maxHp": 70, "attack": 30, "defense": 28, "quick": 35},
		"individualSeed": seed,
		"growthSpeciesRoll": {"qualityScore": 999, "privateSeed": seed},
	}


static func _known_pets(profile: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for key in ["petInstances", "pets"]:
		var entries = profile.get(key, [])
		if entries is Array:
			for entry in entries as Array:
				if entry is Dictionary:
					result.append(entry as Dictionary)
	for key in ["groundPetDrops", "trainingPartners"]:
		var wrappers = profile.get(key, [])
		if wrappers is Array:
			for wrapper in wrappers as Array:
				if wrapper is Dictionary and (wrapper as Dictionary).get("pet") is Dictionary:
					result.append((wrapper as Dictionary).get("pet") as Dictionary)
	return result


static func _known_pet_private_path(profile: Dictionary) -> String:
	for pet in _known_pets(profile):
		var path := _first_private_path(pet)
		if path != "":
			return path
	return ""


static func _first_private_path(value, path: String = "") -> String:
	if value is Dictionary:
		for raw_key in (value as Dictionary).keys():
			var key := str(raw_key)
			var normalized := key.to_lower()
			var next_path := key if path == "" else "%s.%s" % [path, key]
			for marker in ["seed", "roll", "variance", "entropy", "private", "hidden", "continuous", "quality"]:
				if normalized.find(marker) >= 0:
					return next_path
			var nested := _first_private_path((value as Dictionary).get(raw_key), next_path)
			if nested != "":
				return nested
	elif value is Array:
		for index in range((value as Array).size()):
			var nested := _first_private_path((value as Array)[index], "%s[%d]" % [path, index])
			if nested != "":
				return nested
	return ""


static func _visible_pet_stats_equal(before: Dictionary, after: Dictionary) -> bool:
	var before_pets := {}
	for pet in _known_pets(before):
		before_pets[str(pet.get("instanceId", pet.get("petId", "")))] = pet
	for pet in _known_pets(after):
		var instance_id := str(pet.get("instanceId", pet.get("petId", "")))
		if not before_pets.has(instance_id):
			return false
		var original := before_pets.get(instance_id, {}) as Dictionary
		for key in ["level", "hp", "maxHp", "attack", "defense", "quick"]:
			if not original.has(key) or not pet.has(key) or typeof(original.get(key)) != typeof(pet.get(key)) \
					or not _deep_equal(original.get(key), pet.get(key)):
				return false
	return before_pets.size() == _known_pets(after).size()


static func _deep_equal(left, right) -> bool:
	if left is Dictionary and right is Dictionary:
		var left_dictionary := left as Dictionary
		var right_dictionary := right as Dictionary
		if left_dictionary.size() != right_dictionary.size():
			return false
		for key in left_dictionary.keys():
			if not right_dictionary.has(key) or not _deep_equal(left_dictionary.get(key), right_dictionary.get(key)):
				return false
		return true
	if left is Array and right is Array:
		var left_array := left as Array
		var right_array := right as Array
		if left_array.size() != right_array.size():
			return false
		for index in range(left_array.size()):
			if not _deep_equal(left_array[index], right_array[index]):
				return false
		return true
	if (left is int or left is float) and (right is int or right is float):
		return typeof(left) == typeof(right) and float(left) == float(right)
	return left == right


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
