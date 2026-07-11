extends RefCounted

const SCHEMA_VERSION := 1
const AUTHORITY_SOURCE := "server"
const MODEL_LEGACY_INDIVIDUAL := "legacy_individual_v0"
const MODEL_LEGACY_SPECIES_LINEAR := "legacy_species_linear_v0"
const MODEL_AUTHORITY_V1 := "pet_growth_authority_v1"
const MODEL_INVALID_AUTHORITY_V1 := "invalid_pet_growth_authority_v1"
const MARKER_STATUS_VALID := "valid"
const MARKER_STATUS_MISSING := "missing"
const MARKER_STATUS_INVALID := "invalid"
const SUPPORTED_MODEL_VERSIONS: Array[String] = [
	MODEL_LEGACY_INDIVIDUAL,
	MODEL_LEGACY_SPECIES_LINEAR,
	MODEL_AUTHORITY_V1,
]
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const OBSERVATION_NUMBER_KEYS: Array[String] = [
	"schemaVersion",
	"level",
	"observedLevels",
	"stage",
	"powerGrowthPerLevel",
	"powerPercentile",
]
const OBSERVATION_STRING_KEYS: Array[String] = [
	"profileId",
	"stageLabel",
	"overallGrade",
]
const OBSERVATION_BOOL_KEYS: Array[String] = ["enabled", "hasRecord"]
const OBSERVATION_STAT_NUMBER_KEYS: Array[String] = ["statAverages", "statPercentiles"]
const OBSERVATION_STAT_STRING_KEYS: Array[String] = ["statGrades"]
const UNSAFE_OBJECT_KEYS: Array[String] = ["__proto__", "constructor", "prototype"]
const EXACT_PRIVATE_KEYS: Array[String] = [
	"individualSeed",
	"individualVariance",
	"individualQualityScore",
	"individualQualityLabel",
	"growthSpeciesSeed",
	"growthSpeciesSampleNo",
	"growthSpeciesRoll",
	"growthRecord",
	"privateSeed",
	"privateRoll",
	"continuousStats",
	"settledContinuousStats",
	"initialBonus",
	"innateGrowthBonus",
	"growthBonus",
	"internalGrowthBonus",
	"qualityRoll",
	"qualityScore",
	"qualityLabel",
	"futurePrediction",
	"exactLv140Stats",
]


static func project_server_pet(source: Dictionary) -> Dictionary:
	var sanitized_value = _sanitize_public_value(source)
	var pet := sanitized_value as Dictionary if sanitized_value is Dictionary else {}
	var errors: Array[String] = []
	var marker_errors: Array[String] = []
	var warnings: Array[String] = []
	_validate_current_stats(pet, errors)
	_validate_growth_authority(pet, marker_errors)
	for marker_error in marker_errors:
		_append_error(errors, marker_error)
	_validate_growth_envelope(pet, errors)
	_validate_growth_observations(pet, errors)
	_validate_or_supply_level_one(pet, errors, warnings)
	var marker_status := MARKER_STATUS_VALID
	if not (source.get("growthAuthority", null) is Dictionary):
		marker_status = MARKER_STATUS_MISSING
	elif not marker_errors.is_empty():
		marker_status = MARKER_STATUS_INVALID
	return {
		"ok": errors.is_empty(),
		"refreshNeeded": not errors.is_empty(),
		"errors": errors,
		"markerErrors": marker_errors,
		"markerStatus": marker_status,
		"warnings": warnings,
		"pet": pet,
	}


static func has_server_authority_marker(source: Dictionary) -> bool:
	var authority = source.get("growthAuthority", null)
	return authority is Dictionary and str((authority as Dictionary).get("source", "")) == AUTHORITY_SOURCE


static func self_check() -> Dictionary:
	var errors: Array[String] = []
	var case_count := 0

	var species_source := _fixture_pet(MODEL_LEGACY_SPECIES_LINEAR, 20)
	species_source["growthSpeciesLevel1Stats"] = _stats(71, 31, 29, 35)
	species_source["growthObservation"] = _observation_fixture()
	species_source["individualSeed"] = "must-not-survive"
	species_source["growthSpeciesRoll"] = {
		"growthBonus": {"attack": 0.8},
		"nested": {"privateSeed": "must-not-survive"},
	}
	species_source["growthRecord"] = {"qualityScore": 9999}
	var species_result := project_server_pet(species_source)
	case_count += 1
	_expect(bool(species_result.get("ok", false)), "species_linear 应通过", errors)
	var species_pet := species_result.get("pet", {}) as Dictionary
	_expect(_current_stats_equal(species_source, species_pet), "species_linear 改写了服务器当前属性", errors)
	_expect(_first_private_path(species_pet) == "", "species_linear 仍含私有成长字段", errors)
	_expect(
		_deep_equal(species_pet.get("growthObservation", {}), _sanitized_observation_fixture()),
		"species_linear 没有严格保留公开观察",
		errors
	)

	var legacy_source := _fixture_pet(MODEL_LEGACY_INDIVIDUAL, 20)
	legacy_source["hp"] = 171
	legacy_source["maxHp"] = 200
	legacy_source["initialStats"] = _stats(69, 30, 27, 33)
	legacy_source["petCultivation"] = {
		"visibleGrowthBonus": {"attack": 0.4},
		"private": {"continuousStats": {"attack": 90.7}},
	}
	var legacy_result := project_server_pet(legacy_source)
	case_count += 1
	var legacy_pet := legacy_result.get("pet", {}) as Dictionary
	_expect(bool(legacy_result.get("ok", false)), "legacy_individual 应通过", errors)
	_expect(
		int(legacy_pet.get("hp", -1)) == 171 and int(legacy_pet.get("maxHp", -1)) == 200,
		"投影破坏了受伤血量差值",
		errors
	)
	_expect(_first_private_path(legacy_pet) == "", "legacy_individual 仍含私有成长字段", errors)

	var authority_source := _fixture_pet(MODEL_AUTHORITY_V1, 20)
	authority_source["growthModelVersion"] = MODEL_AUTHORITY_V1
	authority_source["growthSpeciesProfileId"] = "blue_man_dragon_v1"
	authority_source["petGrowth"] = {
		"schemaVersion": 1,
		"modelVersion": MODEL_AUTHORITY_V1,
		"settledLevel": 20,
		"public": {
			"schemaVersion": 1,
			"growthModelVersion": MODEL_AUTHORITY_V1,
			"growthSpeciesProfileId": "blue_man_dragon_v1",
			"level": 20,
			"levelOneFourV": _stats(72, 32, 28, 36),
			"stats": _stats(200, 91, 68, 74),
			"exactLv140Stats": {"attack": 612},
			"nested": {"growthSeed": "must-not-survive"},
		},
		"private": {
			"privateRoll": {"innateGrowthBonus": {"attack": 0.7}},
			"settledContinuousStats": {"attack": 90.7},
		},
	}
	var authority_result := project_server_pet(authority_source)
	case_count += 1
	var authority_pet := authority_result.get("pet", {}) as Dictionary
	_expect(bool(authority_result.get("ok", false)), "authority_v1 应通过", errors)
	_expect(_current_stats_equal(authority_source, authority_pet), "authority_v1 改写了服务器当前属性", errors)
	_expect(_first_private_path(authority_pet) == "", "authority_v1 仍含恶意私有字段", errors)
	var projected_growth := authority_pet.get("petGrowth", {}) as Dictionary
	var projected_public := projected_growth.get("public", {}) as Dictionary
	_expect(not projected_public.has("exactLv140Stats"), "authority_v1 泄露精确 Lv140 属性", errors)
	_expect(not projected_growth.has("private"), "authority_v1 保留了 private 容器", errors)

	var replayed := project_server_pet(authority_pet)
	case_count += 1
	_expect(
		_deep_equal(authority_result.get("pet", {}), replayed.get("pet", {}))
			and _deep_equal(authority_result.get("errors", []), replayed.get("errors", []))
			and bool(authority_result.get("refreshNeeded", true)) == bool(replayed.get("refreshNeeded", false)),
		"公开投影不是幂等操作",
		errors
	)

	var level_one_source := _fixture_pet(MODEL_LEGACY_INDIVIDUAL, 1)
	var level_one_result := project_server_pet(level_one_source)
	case_count += 1
	var level_one_pet := level_one_result.get("pet", {}) as Dictionary
	_expect(bool(level_one_result.get("ok", false)), "Lv1 缺记录时不应失败", errors)
	_expect(
		_deep_equal(level_one_pet.get("growthSpeciesLevel1Stats", {}), _stats(200, 91, 68, 74))
			and _deep_equal(level_one_pet.get("initialStats", {}), _stats(200, 91, 68, 74)),
		"Lv1 缺记录时没有使用当前服务器四维",
		errors
	)

	var unobserved_level_one_source := _fixture_pet(MODEL_LEGACY_INDIVIDUAL, 1)
	unobserved_level_one_source["growthObservation"] = {
		"schemaVersion": 1,
		"level": 1,
		"observedLevels": 0,
		"enabled": true,
		"statAverages": {},
		"statPercentiles": {},
		"statGrades": {},
		"overallGrade": "未观察",
	}
	var unobserved_level_one_result := project_server_pet(unobserved_level_one_source)
	case_count += 1
	_expect(
		bool(unobserved_level_one_result.get("ok", false)),
		"旧版 Lv1 未观察空统计不应阻断整份服务器档案",
		errors
	)
	var partial_observation_source := unobserved_level_one_source.duplicate(true)
	partial_observation_source["growthObservation"]["observedLevels"] = 1
	partial_observation_source["growthObservation"]["statAverages"] = {"attack": 2.5}
	var partial_observation_result := project_server_pet(partial_observation_source)
	case_count += 1
	_expect(
		bool(partial_observation_result.get("refreshNeeded", false))
			and (partial_observation_result.get("errors", []) as Array).has("invalid_growth_observation"),
		"非空但残缺的成长观察统计必须继续失败关闭",
		errors
	)

	var missing_level_one_source := _fixture_pet(MODEL_AUTHORITY_V1, 2)
	missing_level_one_source["growthAuthority"]["settledLevel"] = 2
	missing_level_one_source["growthSpeciesProfileId"] = "blue_man_dragon_v1"
	missing_level_one_source["petGrowth"] = {
		"schemaVersion": 1,
		"modelVersion": MODEL_AUTHORITY_V1,
		"settledLevel": 2,
		"public": {
			"schemaVersion": 1,
			"growthModelVersion": MODEL_AUTHORITY_V1,
			"growthSpeciesProfileId": "blue_man_dragon_v1",
			"level": 2,
			"stats": _stats(200, 91, 68, 74),
		},
	}
	var missing_level_one_result := project_server_pet(missing_level_one_source)
	case_count += 1
	_expect(
		bool(missing_level_one_result.get("refreshNeeded", false))
			and (missing_level_one_result.get("errors", []) as Array).has("missing_level_one"),
		"Lv2+ 缺少 Lv1 记录时没有请求刷新",
		errors
	)

	var legacy_missing_source := _fixture_pet(MODEL_LEGACY_INDIVIDUAL, 20)
	var legacy_missing_result := project_server_pet(legacy_missing_source)
	case_count += 1
	var legacy_missing_pet := legacy_missing_result.get("pet", {}) as Dictionary
	_expect(
		bool(legacy_missing_result.get("ok", false))
			and not bool(legacy_missing_result.get("refreshNeeded", true))
			and (legacy_missing_result.get("warnings", []) as Array).has("legacy_missing_level_one"),
		"旧宠缺少 Lv1 记录时不应永久请求刷新",
		errors
	)
	_expect(
		str(legacy_missing_pet.get("growthObservationUnavailableReason", "")) == "legacy_missing_level_one",
		"旧宠缺少 Lv1 记录时没有标记观察不可用原因",
		errors
	)

	var invalid_source := _fixture_pet(MODEL_INVALID_AUTHORITY_V1, 20)
	invalid_source["growthSpeciesLevel1Stats"] = _stats(71, 31, 29, 35)
	var invalid_result := project_server_pet(invalid_source)
	case_count += 1
	_expect(
		bool(invalid_result.get("refreshNeeded", false))
			and (invalid_result.get("errors", []) as Array).has("invalid_growth_authority_state"),
		"损坏的 v1 权威状态没有失败关闭",
		errors
	)

	var wrong_profile_source := authority_source.duplicate(true)
	wrong_profile_source["petGrowth"]["public"]["growthSpeciesProfileId"] = "wrong_profile"
	var wrong_profile_result := project_server_pet(wrong_profile_source)
	case_count += 1
	_expect(
		bool(wrong_profile_result.get("refreshNeeded", false))
			and (wrong_profile_result.get("errors", []) as Array).has("growth_profile_mismatch"),
		"v1 公开成长档与实例矛盾时没有失败关闭",
		errors
	)

	var wrong_stats_source := authority_source.duplicate(true)
	wrong_stats_source["petGrowth"]["public"]["stats"]["attack"] = 92
	var wrong_stats_result := project_server_pet(wrong_stats_source)
	case_count += 1
	_expect(
		bool(wrong_stats_result.get("refreshNeeded", false))
			and (wrong_stats_result.get("errors", []) as Array).has("public_growth_stats_mismatch"),
		"v1 公开快照与当前四维矛盾时没有失败关闭",
		errors
	)

	var unknown_source := _fixture_pet("future_unknown_v9", 20)
	unknown_source["growthSpeciesLevel1Stats"] = _stats(71, 31, 29, 35)
	var unknown_result := project_server_pet(unknown_source)
	case_count += 1
	_expect(
		bool(unknown_result.get("refreshNeeded", false))
			and (unknown_result.get("errors", []) as Array).has("unknown_growth_model"),
		"未知成长模型没有失败关闭",
		errors
	)
	_expect(
		_current_stats_equal(unknown_source, unknown_result.get("pet", {}) as Dictionary),
		"未知成长模型路径改写了服务器属性",
		errors
	)

	var mismatch_source := _fixture_pet(MODEL_AUTHORITY_V1, 20)
	mismatch_source["growthSpeciesLevel1Stats"] = _stats(71, 31, 29, 35)
	mismatch_source["growthAuthority"]["settledLevel"] = 19
	var mismatch_result := project_server_pet(mismatch_source)
	case_count += 1
	_expect(
		bool(mismatch_result.get("refreshNeeded", false))
			and (mismatch_result.get("errors", []) as Array).has("settled_level_mismatch"),
		"settledLevel 不一致没有失败关闭",
		errors
	)
	_expect(
		_current_stats_equal(mismatch_source, mismatch_result.get("pet", {}) as Dictionary),
		"settledLevel 不一致路径改写了服务器属性",
		errors
	)

	return {
		"ok": errors.is_empty(),
		"errors": errors,
		"caseCount": case_count,
		"supportedModelVersions": SUPPORTED_MODEL_VERSIONS.duplicate(),
	}


static func _validate_current_stats(pet: Dictionary, errors: Array[String]) -> void:
	if not pet.has("level"):
		_append_error(errors, "missing_level")
	elif not _is_integer_number(pet.get("level")) or int(pet.get("level")) < 1:
		_append_error(errors, "invalid_level")
	for key in ["hp", "maxHp", "attack", "defense", "quick"]:
		if not pet.has(key):
			_append_error(errors, "missing_current_%s" % key)
		elif not _is_finite_number(pet.get(key)):
			_append_error(errors, "invalid_current_%s" % key)


static func _validate_growth_authority(pet: Dictionary, errors: Array[String]) -> void:
	var raw_authority = pet.get("growthAuthority", null)
	if not (raw_authority is Dictionary):
		_append_error(errors, "missing_growth_authority")
		return
	var authority := raw_authority as Dictionary
	if not _is_integer_number(authority.get("schemaVersion", null)) or int(authority.get("schemaVersion")) != SCHEMA_VERSION:
		_append_error(errors, "invalid_growth_authority_schema")
	if str(authority.get("source", "")) != AUTHORITY_SOURCE:
		_append_error(errors, "invalid_growth_authority_source")
	var model_version := str(authority.get("modelVersion", ""))
	if model_version == MODEL_INVALID_AUTHORITY_V1:
		_append_error(errors, "invalid_growth_authority_state")
	elif not SUPPORTED_MODEL_VERSIONS.has(model_version):
		_append_error(errors, "unknown_growth_model")
	if not _is_integer_number(authority.get("settledLevel", null)):
		_append_error(errors, "invalid_settled_level")
	elif not _is_integer_number(pet.get("level", null)) or int(authority.get("settledLevel")) != int(pet.get("level")):
		_append_error(errors, "settled_level_mismatch")
	for version_key in ["growthModelVersion"]:
		if pet.has(version_key) and str(pet.get(version_key, "")) != model_version:
			_append_error(errors, "growth_model_mismatch")


static func _validate_growth_envelope(pet: Dictionary, errors: Array[String]) -> void:
	var raw_growth = pet.get("petGrowth", null)
	var authority := pet.get("growthAuthority", {}) as Dictionary
	var authority_model := str(authority.get("modelVersion", ""))
	if not (raw_growth is Dictionary):
		if authority_model == MODEL_AUTHORITY_V1:
			_append_error(errors, "missing_growth_envelope")
		return
	var growth := raw_growth as Dictionary
	for version_key in ["modelVersion", "growthModelVersion"]:
		if growth.has(version_key) and str(growth.get(version_key, "")) != authority_model:
			_append_error(errors, "growth_model_mismatch")
	if growth.has("settledLevel"):
		if not _is_integer_number(growth.get("settledLevel", null)):
			_append_error(errors, "invalid_settled_level")
		elif not _is_integer_number(pet.get("level", null)) or int(growth.get("settledLevel")) != int(pet.get("level")):
			_append_error(errors, "settled_level_mismatch")
	if growth.has("level"):
		if not _is_integer_number(growth.get("level", null)) or not _is_integer_number(pet.get("level", null)) \
				or int(growth.get("level")) != int(pet.get("level")):
			_append_error(errors, "settled_level_mismatch")
	var raw_public = growth.get("public", null)
	if raw_public is Dictionary:
		var candidate_public := raw_public as Dictionary
		for version_key in ["modelVersion", "growthModelVersion"]:
			if candidate_public.has(version_key) and str(candidate_public.get(version_key, "")) != authority_model:
				_append_error(errors, "growth_model_mismatch")
	if authority_model != MODEL_AUTHORITY_V1:
		return
	if not _is_integer_number(growth.get("schemaVersion", null)) or int(growth.get("schemaVersion")) != SCHEMA_VERSION:
		_append_error(errors, "invalid_growth_envelope_schema")
	if str(growth.get("modelVersion", "")) != MODEL_AUTHORITY_V1:
		_append_error(errors, "growth_model_mismatch")
	if not (raw_public is Dictionary):
		_append_error(errors, "missing_public_growth_snapshot")
		return
	var public_growth := raw_public as Dictionary
	if not _is_integer_number(public_growth.get("schemaVersion", null)) or int(public_growth.get("schemaVersion")) != SCHEMA_VERSION:
		_append_error(errors, "invalid_public_growth_schema")
	if str(public_growth.get("growthModelVersion", "")) != MODEL_AUTHORITY_V1:
		_append_error(errors, "growth_model_mismatch")
	var profile_id := str(pet.get("growthSpeciesProfileId", "")).strip_edges()
	if profile_id == "" or str(public_growth.get("growthSpeciesProfileId", "")) != profile_id:
		_append_error(errors, "growth_profile_mismatch")
	if not _is_integer_number(public_growth.get("level", null)) \
			or not _is_integer_number(pet.get("level", null)) \
			or int(public_growth.get("level")) != int(pet.get("level")):
		_append_error(errors, "settled_level_mismatch")
	var public_stats = public_growth.get("stats", null)
	if not (public_stats is Dictionary) or not _stat_map_is_complete(public_stats as Dictionary):
		_append_error(errors, "invalid_public_growth_stats")
	elif not _deep_equal(public_stats, _current_four_v(pet)):
		_append_error(errors, "public_growth_stats_mismatch")


static func _validate_growth_observations(pet: Dictionary, errors: Array[String]) -> void:
	if pet.has("growthObservation"):
		_validate_growth_observation(pet.get("growthObservation"), pet.get("level", null), errors)
	var raw_growth = pet.get("petGrowth", null)
	if not (raw_growth is Dictionary):
		return
	var growth := raw_growth as Dictionary
	if growth.has("growthObservation"):
		_validate_growth_observation(growth.get("growthObservation"), pet.get("level", null), errors)
	var raw_public = growth.get("public", null)
	if raw_public is Dictionary and (raw_public as Dictionary).has("growthObservation"):
		_validate_growth_observation((raw_public as Dictionary).get("growthObservation"), pet.get("level", null), errors)


static func _validate_growth_observation(value, pet_level, errors: Array[String]) -> void:
	if not (value is Dictionary) or (value as Dictionary).is_empty():
		_append_error(errors, "invalid_growth_observation")
		return
	var observation := value as Dictionary
	var observed_levels := -1
	if observation.has("level"):
		if not _is_integer_number(observation.get("level")):
			_append_error(errors, "invalid_growth_observation")
		elif not _is_integer_number(pet_level) or int(observation.get("level")) != int(pet_level):
			_append_error(errors, "growth_observation_level_mismatch")
	if observation.has("observedLevels") and (
		not _is_integer_number(observation.get("observedLevels"))
		or int(observation.get("observedLevels")) < 0
	):
		_append_error(errors, "invalid_growth_observation")
	elif observation.has("observedLevels"):
		observed_levels = int(observation.get("observedLevels"))
	for key in OBSERVATION_STAT_NUMBER_KEYS + OBSERVATION_STAT_STRING_KEYS:
		if not observation.has(key):
			continue
		var stat_map = observation.get(key)
		if not (stat_map is Dictionary):
			_append_error(errors, "invalid_growth_observation")
			continue
		var stat_values := stat_map as Dictionary
		# Lv1 has no level-up samples yet. Older authoritative profiles explicitly
		# persisted empty observation maps; those are a valid "not observed" state,
		# while partial/non-empty maps must still satisfy the strict four-stat shape.
		if stat_values.is_empty() and observed_levels == 0:
			continue
		if not _stat_map_is_complete_for_type(stat_values, OBSERVATION_STAT_STRING_KEYS.has(key)):
			_append_error(errors, "invalid_growth_observation")


static func _validate_or_supply_level_one(
	pet: Dictionary,
	errors: Array[String],
	warnings: Array[String]
) -> void:
	var candidates: Array[Dictionary] = []
	var candidate_field_count := 0
	for key in ["growthSpeciesLevel1Stats", "initialStats", "levelOneFourV"]:
		if pet.has(key):
			candidate_field_count += 1
	_collect_level_one_candidate(pet, "growthSpeciesLevel1Stats", "growthSpeciesLevel1Stats", candidates, errors)
	_collect_level_one_candidate(pet, "initialStats", "initialStats", candidates, errors)
	_collect_level_one_candidate(pet, "levelOneFourV", "levelOneFourV", candidates, errors)
	var raw_growth = pet.get("petGrowth", null)
	if raw_growth is Dictionary:
		var growth := raw_growth as Dictionary
		if growth.has("levelOneFourV"):
			candidate_field_count += 1
		_collect_level_one_candidate(growth, "levelOneFourV", "petGrowth.levelOneFourV", candidates, errors)
		var raw_public = growth.get("public", null)
		if raw_public is Dictionary:
			if (raw_public as Dictionary).has("levelOneFourV"):
				candidate_field_count += 1
			_collect_level_one_candidate(raw_public as Dictionary, "levelOneFourV", "petGrowth.public.levelOneFourV", candidates, errors)
	if not candidates.is_empty():
		var expected := candidates[0].get("stats", {}) as Dictionary
		for candidate in candidates.slice(1):
			if not _deep_equal(expected, (candidate as Dictionary).get("stats", {})):
				_append_error(errors, "level_one_mismatch")
				break
		return
	var level := int(pet.get("level", 0)) if _is_integer_number(pet.get("level", null)) else 0
	if level == 1 and candidate_field_count == 0:
		var current_stats := _current_four_v(pet)
		if current_stats.size() == STAT_KEYS.size():
			pet["growthSpeciesLevel1Stats"] = current_stats.duplicate(true)
			pet["initialStats"] = current_stats.duplicate(true)
			return
	var authority := pet.get("growthAuthority", {}) as Dictionary
	var model_version := str(authority.get("modelVersion", ""))
	if model_version in [MODEL_LEGACY_INDIVIDUAL, MODEL_LEGACY_SPECIES_LINEAR]:
		pet["growthObservationUnavailableReason"] = "legacy_missing_level_one"
		_append_error(warnings, "legacy_missing_level_one")
		return
	_append_error(errors, "missing_level_one")


static func _collect_level_one_candidate(
	container: Dictionary,
	key: String,
	_path: String,
	candidates: Array[Dictionary],
	errors: Array[String]
) -> void:
	if not container.has(key):
		return
	var value = container.get(key)
	if not (value is Dictionary) or not _stat_map_is_complete(value as Dictionary):
		_append_error(errors, "invalid_level_one")
		return
	candidates.append({"stats": (value as Dictionary).duplicate(true)})


static func _sanitize_public_value(value):
	if value is Array:
		var result: Array = []
		for entry in value as Array:
			result.append(_sanitize_public_value(entry))
		return result
	if not (value is Dictionary):
		return value
	var result := {}
	for raw_key in (value as Dictionary).keys():
		var key := str(raw_key)
		if _is_private_key(key):
			continue
		var nested = (value as Dictionary).get(raw_key)
		if key == "growthAuthority":
			result[key] = _sanitize_growth_authority(nested)
		elif key == "petGrowth":
			result[key] = _sanitize_pet_growth(nested)
		elif key == "growthObservation":
			result[key] = _sanitize_growth_observation(nested)
		elif key in ["growthSpeciesLevel1Stats", "initialStats", "levelOneFourV"]:
			result[key] = _sanitize_stat_map(nested)
		else:
			result[key] = _sanitize_public_value(nested)
	return result


static func _sanitize_pet_growth(value, allow_nested_public: bool = true) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var result := {}
	for key in ["schemaVersion", "settledLevel", "level"]:
		if source.has(key) and _is_finite_number(source.get(key)):
			result[key] = source.get(key)
	for key in ["modelVersion", "growthModelVersion", "profileId", "growthSpeciesProfileId"]:
		if source.has(key) and source.get(key) is String:
			result[key] = source.get(key)
	for key in ["levelOneFourV", "stats"]:
		if source.has(key):
			result[key] = _sanitize_stat_map(source.get(key))
	if source.has("growthObservation"):
		result["growthObservation"] = _sanitize_growth_observation(source.get("growthObservation"))
	if allow_nested_public and source.has("public"):
		result["public"] = _sanitize_pet_growth(source.get("public"), false)
	return result


static func _sanitize_growth_authority(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var result := {}
	for key in ["schemaVersion", "settledLevel"]:
		if source.has(key) and _is_finite_number(source.get(key)):
			result[key] = source.get(key)
	for key in ["source", "modelVersion"]:
		if source.has(key) and source.get(key) is String:
			result[key] = source.get(key)
	return result


static func _sanitize_growth_observation(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var source := value as Dictionary
	var result := {}
	for key in OBSERVATION_NUMBER_KEYS:
		if source.has(key) and _is_finite_number(source.get(key)):
			result[key] = source.get(key)
	for key in OBSERVATION_STRING_KEYS:
		if source.has(key) and source.get(key) is String:
			result[key] = source.get(key)
	for key in OBSERVATION_BOOL_KEYS:
		if source.has(key) and source.get(key) is bool:
			result[key] = source.get(key)
	for key in OBSERVATION_STAT_NUMBER_KEYS:
		if source.has(key):
			result[key] = _sanitize_stat_map(source.get(key))
	for key in OBSERVATION_STAT_STRING_KEYS:
		if source.has(key):
			result[key] = _sanitize_string_stat_map(source.get(key))
	return result


static func _sanitize_stat_map(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var result := {}
	for key in STAT_KEYS:
		if (value as Dictionary).has(key) and _is_finite_number((value as Dictionary).get(key)):
			result[key] = (value as Dictionary).get(key)
	return result


static func _sanitize_string_stat_map(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var result := {}
	for key in STAT_KEYS:
		if (value as Dictionary).has(key) and (value as Dictionary).get(key) is String:
			result[key] = (value as Dictionary).get(key)
	return result


static func _is_private_key(key: String) -> bool:
	if UNSAFE_OBJECT_KEYS.has(key) or EXACT_PRIVATE_KEYS.has(key):
		return true
	var normalized := key.to_lower()
	for marker in ["seed", "roll", "variance", "entropy", "private", "hidden", "continuous", "secret"]:
		if normalized.find(marker) >= 0:
			return true
	if normalized.find("growthrecord") >= 0 or normalized.find("prediction") >= 0:
		return true
	if normalized.find("exact") >= 0 and (normalized.find("stat") >= 0 or normalized.find("growth") >= 0):
		return true
	if normalized.find("quality") >= 0:
		return true
	if normalized.find("growth") >= 0 and (
		normalized.find("mean") >= 0
		or normalized.find("noise") >= 0
	):
		return true
	return false


static func _is_finite_number(value) -> bool:
	return (value is int or value is float) and is_finite(float(value))


static func _is_integer_number(value) -> bool:
	return _is_finite_number(value) and float(value) == float(int(value))


static func _stat_map_is_complete(value: Dictionary) -> bool:
	if value.size() != STAT_KEYS.size():
		return false
	for key in STAT_KEYS:
		if not value.has(key) or not _is_finite_number(value.get(key)):
			return false
	return true


static func _stat_map_is_complete_for_type(value: Dictionary, expect_string: bool) -> bool:
	if value.size() != STAT_KEYS.size():
		return false
	for key in STAT_KEYS:
		if not value.has(key):
			return false
		if expect_string:
			if not (value.get(key) is String):
				return false
		elif not _is_finite_number(value.get(key)):
			return false
	return true


static func _current_four_v(pet: Dictionary) -> Dictionary:
	var result := {}
	for key in STAT_KEYS:
		if not pet.has(key) or not _is_finite_number(pet.get(key)):
			return {}
		result[key] = pet.get(key)
	return result


static func _current_stats_equal(left: Dictionary, right: Dictionary) -> bool:
	for key in ["level", "hp", "maxHp", "attack", "defense", "quick"]:
		if not left.has(key) or not right.has(key) or not _deep_equal(left.get(key), right.get(key)):
			return false
	return true


static func _deep_equal(left, right) -> bool:
	if left is Dictionary and right is Dictionary:
		var left_dictionary := left as Dictionary
		var right_dictionary := right as Dictionary
		if left_dictionary.size() != right_dictionary.size():
			return false
		for key in left_dictionary.keys():
			if not right_dictionary.has(key) or not _deep_equal(left_dictionary[key], right_dictionary[key]):
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
		return float(left) == float(right)
	return left == right


static func _first_private_path(value, path: String = "") -> String:
	if value is Dictionary:
		for raw_key in (value as Dictionary).keys():
			var key := str(raw_key)
			var next_path := key if path == "" else "%s.%s" % [path, key]
			if _is_private_key(key):
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


static func _append_error(errors: Array[String], code: String) -> void:
	if not errors.has(code):
		errors.append(code)


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)


static func _stats(max_hp: int, attack: int, defense: int, quick: int) -> Dictionary:
	return {"maxHp": max_hp, "attack": attack, "defense": defense, "quick": quick}


static func _fixture_pet(model_version: String, level: int) -> Dictionary:
	return {
		"instanceId": "projection_fixture_%s" % model_version,
		"formId": "fixture_form",
		"name": "测试宠物",
		"level": level,
		"exp": 12,
		"hp": 180,
		"maxHp": 200,
		"attack": 91,
		"defense": 68,
		"quick": 74,
		"growthModelVersion": model_version,
		"growthAuthority": {
			"schemaVersion": SCHEMA_VERSION,
			"source": AUTHORITY_SOURCE,
			"modelVersion": model_version,
			"settledLevel": level,
		},
	}


static func _observation_fixture() -> Dictionary:
	return {
		"schemaVersion": 1,
		"profileId": "blue_man_dragon_v1",
		"level": 20,
		"observedLevels": 19,
		"stage": 0,
		"stageLabel": "0转成长",
		"enabled": true,
		"hasRecord": true,
		"statAverages": {"maxHp": 10.2, "attack": 2.3, "defense": 1.7, "quick": 1.4, "hiddenMean": 9.9},
		"statPercentiles": {"maxHp": 91.2, "attack": 96.4, "defense": 72.1, "quick": 65.5},
		"statGrades": {"maxHp": "A", "attack": "S", "defense": "B", "quick": "B"},
		"powerGrowthPerLevel": 16.875,
		"powerPercentile": 94.7,
		"overallGrade": "A",
		"exactLv140Stats": {"attack": 612},
		"privateRoll": {"attack": 0.7},
	}


static func _sanitized_observation_fixture() -> Dictionary:
	return _sanitize_growth_observation(_observation_fixture())
