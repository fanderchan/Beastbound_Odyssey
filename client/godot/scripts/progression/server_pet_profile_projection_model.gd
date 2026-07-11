extends RefCounted

const PetGrowthPublicProjectionModel := preload("res://scripts/progression/pet_growth_public_projection_model.gd")

const ROOT_PET_ARRAY_KEYS: Array[String] = ["petInstances", "pets"]
const WRAPPED_PET_ARRAY_KEYS: Array[String] = ["groundPetDrops", "trainingPartners"]
const CURRENT_STAT_KEYS: Array[String] = ["level", "hp", "maxHp", "attack", "defense", "quick"]
const PUBLIC_V2_VECTOR_PATH := "res://../../tools/fixtures/server_pet_profile_public_v2_vectors.json"
const CURRENT_SERVER_PROFILE_SCHEMA_VERSION := 3


static func project_server_profile(source: Dictionary) -> Dictionary:
	return _project_known_pet_paths(source, true)


static func project_runtime_server_profile(source: Dictionary) -> Dictionary:
	var result := _project_known_pet_paths(source, true)
	var schema_info := profile_schema_info(source)
	var schema_version := int(schema_info.get("version", -1))
	var profile_errors := (result.get("profileErrors", []) as Array[String]).duplicate()
	var schema_status := str(schema_info.get("status", "invalid"))
	if schema_status != "current":
		profile_errors.append("schemaVersion:%s%s" % [
			schema_status,
			":%d" % schema_version if schema_version >= 0 else "",
		])
	result["profileSchemaVersion"] = schema_version
	result["profileSchemaStatus"] = schema_status
	result["profileErrors"] = profile_errors
	result["ok"] = bool(result.get("ok", false)) and schema_status == "current"
	result["refreshNeeded"] = not bool(result.get("ok", false))
	if schema_status != "current":
		result["requiresFreshServerProfile"] = true
	return result


static func profile_schema_info(source: Dictionary) -> Dictionary:
	if not source.has("schemaVersion"):
		return {"status": "missing", "version": -1}
	var schema_version := _integer_schema_version(source.get("schemaVersion"))
	if schema_version < 1:
		return {"status": "invalid", "version": schema_version}
	if schema_version > CURRENT_SERVER_PROFILE_SCHEMA_VERSION:
		return {"status": "future", "version": schema_version}
	if schema_version < CURRENT_SERVER_PROFILE_SCHEMA_VERSION:
		return {"status": "legacy", "version": schema_version}
	return {"status": "current", "version": schema_version}


static func sanitize_cached_server_profile(source: Dictionary) -> Dictionary:
	return _project_known_pet_paths(source, false)


static func _integer_schema_version(value) -> int:
	if not (value is int or value is float):
		return -1
	var numeric := float(value)
	if not is_finite(numeric) or numeric < 1.0 or numeric != floor(numeric):
		return -1
	return int(numeric)


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var case_count := 0

	var source := {
		"schemaVersion": 1,
		"player": {"name": "投影测试", "level": 20},
		"stoneCoins": 777,
		"qualityScore": 88,
		"growthBonus": {"attack": 3},
		"petInstances": [_fixture_pet("root_pet")],
		"pets": [_fixture_pet("legacy_root_pet")],
		"groundPetDrops": [{"dropId": "drop_1", "pet": _fixture_pet("drop_pet")}],
		"trainingPartners": [{"partnerId": "partner_1", "pet": _fixture_pet("partner_pet")}],
		"battleResultReceipts": [{
			"pet": {
				"instanceId": "summary_pet",
				"level": 20,
				"individualSeed": "summary-contract-must-stay",
			},
		}],
	}
	var source_before := source.duplicate(true)
	var projected := project_server_profile(source)
	case_count += 1
	_expect(bool(projected.get("ok", false)), "四条登记档案路径应通过严格投影", errors)
	_expect(not bool(projected.get("refreshNeeded", true)), "合法档案不应请求刷新", errors)
	_expect(int(projected.get("projectedPetCount", 0)) == 4, "登记宠物计数错误", errors)
	_expect((projected.get("missingMarkerPaths", []) as Array).is_empty(), "合法档案误报缺 marker", errors)
	_expect((projected.get("invalidMarkerPaths", []) as Array).is_empty(), "合法档案误报坏 marker", errors)
	var public_profile := projected.get("profile", {}) as Dictionary
	_expect(_deep_equal(source, source_before), "档案投影改写了输入对象", errors)
	_expect(int(public_profile.get("stoneCoins", 0)) == 777, "档案投影改写非宠货币", errors)
	_expect(int(public_profile.get("qualityScore", 0)) == 88, "档案投影误删非宠 qualityScore", errors)
	_expect(
		_deep_equal(public_profile.get("growthBonus", {}), {"attack": 3}),
		"档案投影误删非宠 growthBonus",
		errors
	)
	_expect(
		_deep_equal(public_profile.get("battleResultReceipts", []), source.get("battleResultReceipts", [])),
		"档案投影递归改写了未登记的宠物摘要",
		errors
	)
	for pet in _known_projected_pets(public_profile):
		_expect(not (pet as Dictionary).has("individualSeed"), "登记宠物仍含私有 seed", errors)
		_expect(_current_stats_preserved(source_before_pet(source_before, str((pet as Dictionary).get("instanceId", ""))), pet), "登记宠物当前属性被改写", errors)

	var replayed := project_server_profile(public_profile)
	case_count += 1
	_expect(
		_deep_equal(projected.get("profile", {}), replayed.get("profile", {}))
			and _deep_equal(projected.get("petDiagnostics", []), replayed.get("petDiagnostics", [])),
		"档案严格投影不是幂等操作",
		errors
	)

	var missing_marker_profile := {"petInstances": [_fixture_pet("missing_marker")]}
	(missing_marker_profile["petInstances"][0] as Dictionary).erase("growthAuthority")
	(missing_marker_profile["petInstances"][0] as Dictionary).erase("growthModelVersion")
	var missing_result := project_server_profile(missing_marker_profile)
	case_count += 1
	_expect(
		not bool(missing_result.get("ok", true))
			and bool(missing_result.get("refreshNeeded", false))
			and (missing_result.get("missingMarkerPaths", []) as Array).has("petInstances[0]"),
		"缺 marker 档案没有失败关闭",
		errors
	)
	var missing_public_pet := ((missing_result.get("profile", {}) as Dictionary).get("petInstances", []) as Array)[0] as Dictionary
	_expect(not missing_public_pet.has("individualSeed"), "缺 marker 安全快照仍含 seed", errors)
	_expect(
		_current_stats_preserved((missing_marker_profile["petInstances"] as Array)[0] as Dictionary, missing_public_pet),
		"缺 marker 安全快照改写当前属性",
		errors
	)

	var invalid_marker_profile := {"petInstances": [_fixture_pet("invalid_marker")]}
	var invalid_pet := (invalid_marker_profile["petInstances"] as Array)[0] as Dictionary
	invalid_pet["growthAuthority"]["modelVersion"] = PetGrowthPublicProjectionModel.MODEL_INVALID_AUTHORITY_V1
	invalid_pet["growthModelVersion"] = PetGrowthPublicProjectionModel.MODEL_INVALID_AUTHORITY_V1
	var invalid_result := project_server_profile(invalid_marker_profile)
	case_count += 1
	_expect(
		not bool(invalid_result.get("ok", true))
			and (invalid_result.get("invalidMarkerPaths", []) as Array).has("petInstances[0]"),
		"显式损坏 marker 没有归入 invalid",
		errors
	)

	var envelope_profile := {"petInstances": [_fixture_v1_pet("bad_envelope")]}
	(envelope_profile["petInstances"][0]["petGrowth"]["public"]["stats"] as Dictionary)["attack"] = 999
	var envelope_result := project_server_profile(envelope_profile)
	case_count += 1
	_expect(
		not bool(envelope_result.get("ok", true))
			and bool(envelope_result.get("refreshNeeded", false))
			and (envelope_result.get("missingMarkerPaths", []) as Array).is_empty()
			and (envelope_result.get("invalidMarkerPaths", []) as Array).is_empty(),
		"合法 marker 的坏 envelope 被误报成 marker 问题",
		errors
	)

	var legacy_missing_profile := {"petInstances": [_fixture_pet("legacy_missing")]}
	(legacy_missing_profile["petInstances"][0] as Dictionary).erase("initialStats")
	var legacy_missing_result := project_server_profile(legacy_missing_profile)
	case_count += 1
	_expect(
		bool(legacy_missing_result.get("ok", false))
			and not bool(legacy_missing_result.get("refreshNeeded", true)),
		"旧宠缺 Lv1 历史导致永久刷新",
		errors
	)

	var cached_result := sanitize_cached_server_profile(missing_marker_profile)
	case_count += 1
	_expect(
		bool(cached_result.get("ok", false))
			and bool(cached_result.get("requiresFreshServerProfile", false))
			and not (((cached_result.get("profile", {}) as Dictionary).get("petInstances", []) as Array)[0] as Dictionary).has("individualSeed"),
		"旧缓存没有在保留结构时清除秘密并要求新档",
		errors
	)

	var malformed_profile := {"petInstances": [42], "stoneCoins": 5}
	var malformed_result := sanitize_cached_server_profile(malformed_profile)
	case_count += 1
	_expect(
		not bool(malformed_result.get("ok", true))
			and bool(malformed_result.get("requiresFreshServerProfile", false))
			and _deep_equal(malformed_result.get("profile", {}), malformed_profile),
		"结构不安全缓存没有保持原样并拒绝写回",
		errors
	)

	var shared_vectors = JSON.parse_string(FileAccess.get_file_as_string(PUBLIC_V2_VECTOR_PATH))
	case_count += 1
	_expect(shared_vectors is Dictionary, "无法读取共享 public DTO v2 向量", errors)
	if shared_vectors is Dictionary:
		_expect(int((shared_vectors as Dictionary).get("schemaVersion", 0)) == 2, "共享 public DTO 向量版本错误", errors)
		for vector in (shared_vectors as Dictionary).get("cases", []):
			if not (vector is Dictionary):
				continue
			var expected = (vector as Dictionary).get("expectedPublicProfile", null)
			if not (expected is Dictionary):
				_expect(false, "共享 public DTO 向量缺 expectedPublicProfile", errors)
				continue
			var vector_projection := project_server_profile(expected as Dictionary)
			_expect(bool(vector_projection.get("ok", false)), "Godot 拒绝 Node 共享 public DTO", errors)
			var vector_public := vector_projection.get("profile", {}) as Dictionary
			for pet in _known_projected_pets(vector_public):
				_expect(
					_current_stats_preserved(source_before_pet(expected as Dictionary, str((pet as Dictionary).get("instanceId", ""))), pet),
					"Godot 改写共享 public DTO 当前属性",
					errors
				)
			var vector_replay := project_server_profile(vector_public)
			_expect(
				_deep_equal(vector_replay.get("profile", {}), vector_public),
				"Godot 对共享 public DTO 的二次投影不幂等",
				errors
			)

	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"caseCount": case_count,
	}


static func _project_known_pet_paths(source: Dictionary, strict_authority: bool) -> Dictionary:
	var state := {
		"profile": source.duplicate(true),
		"projectedPetCount": 0,
		"missingMarkerPaths": [] as Array[String],
		"invalidMarkerPaths": [] as Array[String],
		"profileErrors": [] as Array[String],
		"petErrors": [] as Array[String],
		"petDiagnostics": [] as Array[Dictionary],
		"requiresFreshServerProfile": false,
	}
	for key in ROOT_PET_ARRAY_KEYS:
		_project_root_pet_array(source, key, state)
	for key in WRAPPED_PET_ARRAY_KEYS:
		_project_wrapped_pet_array(source, key, state)
	var profile_errors := state.get("profileErrors", []) as Array[String]
	var pet_errors := state.get("petErrors", []) as Array[String]
	var strict_errors: Array[String] = []
	strict_errors.append_array(profile_errors)
	strict_errors.append_array(pet_errors)
	var structure_ok := profile_errors.is_empty()
	return {
		"ok": strict_errors.is_empty() if strict_authority else structure_ok,
		"refreshNeeded": not strict_errors.is_empty() if strict_authority else false,
		"requiresFreshServerProfile": bool(state.get("requiresFreshServerProfile", false)),
		"profile": state.get("profile", {}) as Dictionary,
		"projectedPetCount": int(state.get("projectedPetCount", 0)),
		"missingMarkerPaths": state.get("missingMarkerPaths", []) as Array[String],
		"invalidMarkerPaths": state.get("invalidMarkerPaths", []) as Array[String],
		"profileErrors": profile_errors,
		"petErrors": pet_errors,
		"petDiagnostics": state.get("petDiagnostics", []) as Array[Dictionary],
	}


static func _project_root_pet_array(source: Dictionary, key: String, state: Dictionary) -> void:
	if not source.has(key):
		return
	var value = source.get(key)
	if not (value is Array):
		_append_profile_error(state, "%s:not_array" % key)
		return
	var projected: Array = []
	for index in range((value as Array).size()):
		var entry = (value as Array)[index]
		var path := "%s[%d]" % [key, index]
		if not (entry is Dictionary):
			projected.append(entry)
			_append_profile_error(state, "%s:not_dictionary" % path)
			continue
		projected.append(_project_pet(entry as Dictionary, path, state))
	(state.get("profile", {}) as Dictionary)[key] = projected


static func _project_wrapped_pet_array(source: Dictionary, key: String, state: Dictionary) -> void:
	if not source.has(key):
		return
	var value = source.get(key)
	if not (value is Array):
		_append_profile_error(state, "%s:not_array" % key)
		return
	var projected: Array = []
	for index in range((value as Array).size()):
		var entry = (value as Array)[index]
		var wrapper_path := "%s[%d]" % [key, index]
		if not (entry is Dictionary):
			projected.append(entry)
			_append_profile_error(state, "%s:not_dictionary" % wrapper_path)
			continue
		var next_wrapper := (entry as Dictionary).duplicate(true)
		if not (entry as Dictionary).has("pet"):
			projected.append(next_wrapper)
			_append_profile_error(state, "%s:missing_pet" % wrapper_path)
			continue
		var pet = (entry as Dictionary).get("pet")
		if not (pet is Dictionary):
			projected.append(next_wrapper)
			_append_profile_error(state, "%s.pet:not_dictionary" % wrapper_path)
			continue
		next_wrapper["pet"] = _project_pet(pet as Dictionary, "%s.pet" % wrapper_path, state)
		projected.append(next_wrapper)
	(state.get("profile", {}) as Dictionary)[key] = projected


static func _project_pet(source: Dictionary, path: String, state: Dictionary) -> Dictionary:
	var result := PetGrowthPublicProjectionModel.project_server_pet(source)
	var projected := result.get("pet", {}) as Dictionary
	state["projectedPetCount"] = int(state.get("projectedPetCount", 0)) + 1
	var marker_status := str(result.get("markerStatus", PetGrowthPublicProjectionModel.MARKER_STATUS_INVALID))
	if marker_status == PetGrowthPublicProjectionModel.MARKER_STATUS_MISSING:
		(state.get("missingMarkerPaths", []) as Array[String]).append(path)
	elif marker_status == PetGrowthPublicProjectionModel.MARKER_STATUS_INVALID:
		(state.get("invalidMarkerPaths", []) as Array[String]).append(path)
	var result_errors := result.get("errors", []) as Array
	var result_warnings := result.get("warnings", []) as Array
	for error_code in result_errors:
		(state.get("petErrors", []) as Array[String]).append("%s:%s" % [path, str(error_code)])
	if bool(result.get("refreshNeeded", false)):
		state["requiresFreshServerProfile"] = true
	if not _current_stats_preserved(source, projected):
		_append_profile_error(state, "%s:current_stats_not_preserved" % path)
	(state.get("petDiagnostics", []) as Array[Dictionary]).append({
		"path": path,
		"instanceId": str(source.get("instanceId", source.get("petId", ""))),
		"markerStatus": marker_status,
		"refreshNeeded": bool(result.get("refreshNeeded", false)),
		"errors": result_errors.duplicate(true),
		"warnings": result_warnings.duplicate(true),
	})
	return projected


static func _append_profile_error(state: Dictionary, code: String) -> void:
	var errors := state.get("profileErrors", []) as Array[String]
	if not errors.has(code):
		errors.append(code)
	state["requiresFreshServerProfile"] = true


static func _current_stats_preserved(source: Dictionary, projected: Dictionary) -> bool:
	for key in CURRENT_STAT_KEYS:
		if not source.has(key) or not projected.has(key):
			return false
		if typeof(source.get(key)) != typeof(projected.get(key)):
			return false
		if not _is_finite_number(source.get(key)) or not _deep_equal(source.get(key), projected.get(key)):
			return false
	return int(source.get("level", 0)) >= 1 and float(source.get("maxHp", 0)) >= 1.0


static func _known_projected_pets(profile: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for key in ROOT_PET_ARRAY_KEYS:
		var entries = profile.get(key, [])
		if entries is Array:
			for entry in entries as Array:
				if entry is Dictionary:
					result.append(entry as Dictionary)
	for key in WRAPPED_PET_ARRAY_KEYS:
		var wrappers = profile.get(key, [])
		if wrappers is Array:
			for wrapper in wrappers as Array:
				if wrapper is Dictionary and (wrapper as Dictionary).get("pet") is Dictionary:
					result.append((wrapper as Dictionary).get("pet") as Dictionary)
	return result


static func source_before_pet(profile: Dictionary, instance_id: String) -> Dictionary:
	for pet in _known_projected_pets(profile):
		if str(pet.get("instanceId", pet.get("petId", ""))) == instance_id:
			return pet
	return {}


static func _fixture_pet(instance_id: String) -> Dictionary:
	return {
		"instanceId": instance_id,
		"petId": instance_id,
		"formId": "fixture_form",
		"name": "测试宠物",
		"level": 20,
		"exp": 12,
		"hp": 171,
		"maxHp": 200,
		"attack": 91,
		"defense": 68,
		"quick": 74,
		"initialStats": {"maxHp": 70, "attack": 30, "defense": 28, "quick": 35},
		"individualSeed": "must-not-survive",
		"petCultivation": {"privateSeed": "must-not-survive", "rebirthCount": 0},
		"growthModelVersion": PetGrowthPublicProjectionModel.MODEL_LEGACY_INDIVIDUAL,
		"growthAuthority": {
			"schemaVersion": 1,
			"source": "server",
			"modelVersion": PetGrowthPublicProjectionModel.MODEL_LEGACY_INDIVIDUAL,
			"settledLevel": 20,
		},
	}


static func _fixture_v1_pet(instance_id: String) -> Dictionary:
	var pet := _fixture_pet(instance_id)
	pet["growthModelVersion"] = PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1
	pet["growthSpeciesProfileId"] = "fixture_growth_v1"
	pet["growthAuthority"]["modelVersion"] = PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1
	pet["petGrowth"] = {
		"schemaVersion": 1,
		"modelVersion": PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1,
		"settledLevel": 20,
		"public": {
			"schemaVersion": 1,
			"growthModelVersion": PetGrowthPublicProjectionModel.MODEL_AUTHORITY_V1,
			"growthSpeciesProfileId": "fixture_growth_v1",
			"level": 20,
			"levelOneFourV": {"maxHp": 70, "attack": 30, "defense": 28, "quick": 35},
			"stats": {"maxHp": 200, "attack": 91, "defense": 68, "quick": 74},
		},
		"private": {"privateSeed": "must-not-survive"},
	}
	return pet


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
	if _is_finite_number(left) and _is_finite_number(right):
		return typeof(left) == typeof(right) and float(left) == float(right)
	return left == right


static func _is_finite_number(value) -> bool:
	return (value is int or value is float) and is_finite(float(value))


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
