extends RefCounted

const MODEL_VERSION := "pet_growth_authority_v1"
const PUBLIC_SNAPSHOT_SCHEMA_VERSION := 1
const MAX_LEVEL := 140
const INTERNAL_DECIMALS := 6
const DEFAULT_VECTOR_PATH := "res://../../tools/fixtures/pet_growth_authority_v1_vectors.json"
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const PRIVATE_FIELD_NAMES: Array[String] = [
	"continuousStats",
	"innateGrowthBonus",
	"initialBonus",
	"growthBonus",
	"privateSeed",
	"privateRoll",
	"individualSeed",
	"individualVariance",
	"growthSpeciesSeed",
	"growthSpeciesRoll",
	"growthSpeciesSampleNo",
]


static func round_half_away_from_zero(value: float) -> int:
	if not is_finite(value):
		return 0
	return -int(floor(-value + 0.5)) if value < 0.0 else int(floor(value + 0.5))


static func quantize(value: float, decimals: int = INTERNAL_DECIMALS) -> float:
	var factor := pow(10.0, float(maxi(0, decimals)))
	return float(round_half_away_from_zero(value * factor)) / factor


static func stable_unit(seed: String) -> float:
	var digest := seed.sha256_text()
	var first_u32 := 0
	for index in range(8):
		first_u32 = first_u32 * 16 + _hex_digit_value(digest.unicode_at(index))
	return float(first_u32) / 4294967295.0


static func derive_private_roll(profile: Dictionary, private_seed: String) -> Dictionary:
	if not _profile_is_valid(profile) or private_seed.strip_edges() == "":
		return {}
	var profile_id := str(profile.get("profileId", ""))
	var rules := profile.get("individualRules", {}) as Dictionary
	var initial_spread := rules.get("initialOutputSpread", {}) as Dictionary
	var growth_spread := rules.get("growthOutputSpread", {}) as Dictionary
	var distribution := str(rules.get("distribution", "weighted_center"))
	var rare_extreme_rate := clampf(float(rules.get("rareExtremeRate", 0.0)), 0.0, 0.25)
	var roll_seed := "%s:%s:%s" % [MODEL_VERSION, profile_id, private_seed.strip_edges()]
	var initial_bonus := {}
	var innate_growth_bonus := {}
	for key in STAT_KEYS:
		initial_bonus[key] = round_half_away_from_zero(_roll_in_range(
			roll_seed,
			"initial:%s" % key,
			_range_for_key(initial_spread, key, 0.0, 0.0),
			distribution,
			rare_extreme_rate
		))
		innate_growth_bonus[key] = quantize(_roll_in_range(
			roll_seed,
			"innate_growth:%s" % key,
			_range_for_key(growth_spread, key, 0.0, 0.0),
			distribution,
			rare_extreme_rate
		))
	return {
		"modelVersion": MODEL_VERSION,
		"profileId": profile_id,
		"initialBonus": initial_bonus,
		"innateGrowthBonus": innate_growth_bonus,
	}


static func level_noise(profile: Dictionary, private_seed: String, level: int, key: String) -> float:
	var rules := profile.get("individualRules", {}) as Dictionary
	var spread := rules.get("levelOutputNoiseSpread", {}) as Dictionary
	var range_value := _range_for_key(spread, key, 0.0, 0.0)
	if float(range_value.get("max", 0.0)) <= float(range_value.get("min", 0.0)):
		return quantize(float(range_value.get("min", 0.0)))
	var distribution := str(rules.get("levelNoiseDistribution", rules.get("distribution", "weighted_center")))
	var rare_extreme_rate := clampf(float(rules.get(
		"levelNoiseRareExtremeRate",
		rules.get("rareExtremeRate", 0.0)
	)), 0.0, 0.25)
	var seed := "%s:%s:%s" % [MODEL_VERSION, str(profile.get("profileId", "")), private_seed.strip_edges()]
	return quantize(_roll_in_range(
		seed,
		"level:%d:%s" % [level, key],
		range_value,
		distribution,
		rare_extreme_rate
	))


static func growth_delta_for_level(
	profile: Dictionary,
	private_seed: String,
	target_level: int,
	private_roll: Dictionary = {},
	cultivation: Dictionary = {}
) -> Dictionary:
	if not _profile_is_valid(profile):
		return {}
	var safe_target_level := clampi(target_level, 1, MAX_LEVEL)
	var roll := _verified_private_roll(profile, private_seed, private_roll)
	if roll.is_empty():
		return {}
	var cultivated := _normalized_cultivation(cultivation)
	return _growth_delta_for_level_trusted(profile, private_seed, safe_target_level, roll, cultivated)


static func _growth_delta_for_level_trusted(
	profile: Dictionary,
	private_seed: String,
	safe_target_level: int,
	roll: Dictionary,
	cultivated: Dictionary
) -> Dictionary:
	var cultivated_growth := cultivated.get("growthBonus", {}) as Dictionary
	var innate_growth_bonus := roll.get("innateGrowthBonus", {}) as Dictionary
	var output_growth := profile.get("outputGrowth", {}) as Dictionary
	var result := {}
	for key in STAT_KEYS:
		result[key] = 0.0 if safe_target_level <= 1 else quantize(
			float(output_growth.get(key, 0.0))
			+ float(innate_growth_bonus.get(key, 0.0))
			+ float(cultivated_growth.get(key, 0.0))
			+ level_noise(profile, private_seed, safe_target_level, key)
		)
	return result


static func continuous_stats_at_level(
	profile: Dictionary,
	private_seed: String,
	level: int,
	private_roll: Dictionary = {},
	cultivation: Dictionary = {}
) -> Dictionary:
	if not _profile_is_valid(profile):
		return {}
	var safe_level := clampi(level, 1, MAX_LEVEL)
	var roll := _verified_private_roll(profile, private_seed, private_roll)
	if roll.is_empty():
		return {}
	var cultivated := _normalized_cultivation(cultivation)
	var cultivated_initial := cultivated.get("initialBonus", {}) as Dictionary
	var initial_bonus := roll.get("initialBonus", {}) as Dictionary
	var output_base := profile.get("outputBase", {}) as Dictionary
	var result := {}
	for key in STAT_KEYS:
		result[key] = quantize(
			float(output_base.get(key, 0.0))
			+ float(initial_bonus.get(key, 0.0))
			+ float(cultivated_initial.get(key, 0.0))
		)
	for next_level in range(2, safe_level + 1):
		var delta := _growth_delta_for_level_trusted(profile, private_seed, next_level, roll, cultivated)
		for key in STAT_KEYS:
			result[key] = quantize(float(result.get(key, 0.0)) + float(delta.get(key, 0.0)))
	return result


static func visible_stats_at_level(
	profile: Dictionary,
	private_seed: String,
	level: int,
	private_roll: Dictionary = {},
	cultivation: Dictionary = {}
) -> Dictionary:
	var continuous := continuous_stats_at_level(profile, private_seed, level, private_roll, cultivation)
	if continuous.size() != STAT_KEYS.size():
		return {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = maxi(1, round_half_away_from_zero(float(continuous.get(key, 1.0))))
	return result


static func build_public_snapshot(
	profile: Dictionary,
	private_seed: String,
	level: int,
	private_roll: Dictionary = {},
	cultivation: Dictionary = {}
) -> Dictionary:
	var roll := _verified_private_roll(profile, private_seed, private_roll)
	if roll.is_empty():
		return {}
	var safe_level := clampi(level, 1, MAX_LEVEL)
	var level_one_four_v := visible_stats_at_level(profile, private_seed, 1, roll)
	var stats := visible_stats_at_level(profile, private_seed, safe_level, roll, cultivation)
	if level_one_four_v.is_empty() or stats.is_empty():
		return {}
	return {
		"schemaVersion": PUBLIC_SNAPSHOT_SCHEMA_VERSION,
		"growthModelVersion": MODEL_VERSION,
		"growthSpeciesProfileId": str(profile.get("profileId", "")),
		"level": safe_level,
		"levelOneFourV": level_one_four_v,
		"stats": stats,
	}


static func build_private_snapshot(
	profile: Dictionary,
	private_seed: String,
	level: int,
	cultivation: Dictionary = {}
) -> Dictionary:
	var private_roll := derive_private_roll(profile, private_seed)
	if private_roll.is_empty():
		return {}
	var continuous_stats := continuous_stats_at_level(profile, private_seed, level, private_roll, cultivation)
	var public_snapshot := build_public_snapshot(profile, private_seed, level, private_roll, cultivation)
	if continuous_stats.is_empty() or public_snapshot.is_empty():
		return {}
	return {
		"modelVersion": MODEL_VERSION,
		"profileId": str(profile.get("profileId", "")),
		"privateSeed": private_seed.strip_edges(),
		"privateRoll": private_roll,
		"continuousStats": continuous_stats,
		"publicSnapshot": public_snapshot,
	}


static func validate_golden_vectors(vector_path: String = DEFAULT_VECTOR_PATH) -> Dictionary:
	var errors: Array[String] = []
	var absolute_path := ProjectSettings.globalize_path(vector_path).simplify_path()
	var file := FileAccess.open(absolute_path, FileAccess.READ)
	if file == null:
		return {"ok": false, "errors": ["无法读取成长黄金向量: %s" % absolute_path], "vectorCount": 0}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if not (parsed is Dictionary):
		return {"ok": false, "errors": ["成长黄金向量不是 JSON object"], "vectorCount": 0}
	var document := parsed as Dictionary
	if str(document.get("modelVersion", "")) != MODEL_VERSION:
		errors.append("成长黄金向量 modelVersion 不匹配")
	if round_half_away_from_zero(1.5) != 2 or round_half_away_from_zero(-1.5) != -2:
		errors.append("远离 0 取整原语不正确")
	if absf(quantize(-0.1234565) - (-0.123457)) > 0.0000005:
		errors.append("六位量化原语不正确")
	if not build_public_snapshot({}, "", 1).is_empty():
		errors.append("无效成长输入没有失败关闭")
	var vectors: Array = document.get("vectors", [])
	for value in vectors:
		if not (value is Dictionary):
			errors.append("成长黄金向量存在非 object 项")
			continue
		var vector := value as Dictionary
		var vector_id := str(vector.get("id", "unnamed"))
		var profile := vector.get("profile", {}) as Dictionary
		var private_seed := str(vector.get("privateSeed", ""))
		var expected := vector.get("expected", {}) as Dictionary
		var private_roll := derive_private_roll(profile, private_seed)
		if not _deep_equal(private_roll, expected.get("privateRoll", {})):
			errors.append("%s privateRoll 不一致" % vector_id)
		var expected_snapshots: Array = expected.get("publicSnapshots", [])
		for expected_value in expected_snapshots:
			if not (expected_value is Dictionary):
				errors.append("%s publicSnapshot 非 object" % vector_id)
				continue
			var expected_snapshot := expected_value as Dictionary
			var actual_snapshot := build_public_snapshot(
				profile,
				private_seed,
				int(expected_snapshot.get("level", 1)),
				private_roll,
				vector.get("cultivation", {}) as Dictionary
			)
			if not _deep_equal(actual_snapshot, expected_snapshot):
				errors.append("%s Lv%d publicSnapshot 不一致" % [vector_id, int(expected_snapshot.get("level", 1))])
			var forbidden_path := _first_private_field_path(actual_snapshot)
			if forbidden_path != "":
				errors.append("%s publicSnapshot 泄露私有字段 %s" % [vector_id, forbidden_path])
			if not _public_snapshot_shape_is_valid(actual_snapshot):
				errors.append("%s publicSnapshot 不符合严格公开白名单" % vector_id)
		var expected_continuous_snapshots: Array = expected.get("continuousSnapshots", [])
		for expected_value in expected_continuous_snapshots:
			if not (expected_value is Dictionary):
				errors.append("%s continuousSnapshot 非 object" % vector_id)
				continue
			var expected_continuous := expected_value as Dictionary
			var actual_continuous := continuous_stats_at_level(
				profile,
				private_seed,
				int(expected_continuous.get("level", 1)),
				private_roll,
				vector.get("cultivation", {}) as Dictionary
			)
			if not _deep_equal(actual_continuous, expected_continuous.get("stats", {})):
				errors.append("%s Lv%d continuousStats 不一致" % [vector_id, int(expected_continuous.get("level", 1))])
		var expected_growth_deltas: Array = expected.get("growthDeltas", [])
		for expected_value in expected_growth_deltas:
			if not (expected_value is Dictionary):
				errors.append("%s growthDelta 非 object" % vector_id)
				continue
			var expected_delta := expected_value as Dictionary
			var actual_delta := growth_delta_for_level(
				profile,
				private_seed,
				int(expected_delta.get("level", 1)),
				private_roll,
				vector.get("cultivation", {}) as Dictionary
			)
			if not _deep_equal(actual_delta, expected_delta.get("stats", {})):
				errors.append("%s Lv%d growthDelta 不一致" % [vector_id, int(expected_delta.get("level", 1))])
		var repeated := derive_private_roll(profile, private_seed)
		if not _deep_equal(repeated, private_roll):
			errors.append("%s 相同种子重复计算不一致" % vector_id)
		var forged_roll := private_roll.duplicate(true)
		var forged_growth := forged_roll.get("innateGrowthBonus", {}) as Dictionary
		forged_growth["attack"] = float(forged_growth.get("attack", 0.0)) + 0.1
		forged_roll["innateGrowthBonus"] = forged_growth
		if not build_public_snapshot(profile, private_seed, 20, forged_roll).is_empty():
			errors.append("%s 接受了不匹配私有种子的伪造 roll" % vector_id)
		var replayed := continuous_stats_at_level(profile, private_seed, 1, private_roll, vector.get("cultivation", {}) as Dictionary)
		for target_level in range(2, MAX_LEVEL + 1):
			var delta := growth_delta_for_level(
				profile,
				private_seed,
				target_level,
				private_roll,
				vector.get("cultivation", {}) as Dictionary
			)
			for key in STAT_KEYS:
				replayed[key] = quantize(float(replayed.get(key, 0.0)) + float(delta.get(key, 0.0)))
		var direct := continuous_stats_at_level(
			profile,
			private_seed,
			MAX_LEVEL,
			private_roll,
			vector.get("cultivation", {}) as Dictionary
		)
		if not _deep_equal(replayed, direct):
			errors.append("%s 逐级升级与直算 Lv140 不一致" % vector_id)
	return {"ok": errors.is_empty(), "errors": errors, "vectorCount": vectors.size()}


static func _normalized_cultivation(cultivation: Dictionary) -> Dictionary:
	var initial_source := cultivation.get("initialBonus", {}) as Dictionary
	var growth_source := cultivation.get("growthBonus", {}) as Dictionary
	var initial_bonus := {}
	var growth_bonus := {}
	for key in STAT_KEYS:
		initial_bonus[key] = quantize(float(initial_source.get(key, 0.0)))
		growth_bonus[key] = quantize(float(growth_source.get(key, 0.0)))
	return {"initialBonus": initial_bonus, "growthBonus": growth_bonus}


static func _verified_private_roll(
	profile: Dictionary,
	private_seed: String,
	candidate: Dictionary
) -> Dictionary:
	var derived := derive_private_roll(profile, private_seed)
	if derived.is_empty():
		return {}
	if not candidate.is_empty() and not _deep_equal(candidate, derived):
		return {}
	return derived


static func _roll_in_range(
	seed: String,
	key: String,
	range_value: Dictionary,
	distribution: String,
	rare_extreme_rate: float
) -> float:
	var minimum := float(range_value.get("min", 0.0))
	var maximum := float(range_value.get("max", 0.0))
	if maximum <= minimum:
		return minimum
	var unit := stable_unit("%s:%s" % [seed, key])
	if distribution == "uniform":
		return minimum + (maximum - minimum) * unit
	if distribution == "rare_spike":
		var spike := stable_unit("%s:%s:spike" % [seed, key])
		if spike < rare_extreme_rate:
			unit = 0.92 + stable_unit("%s:%s:spike_value" % [seed, key]) * 0.08
		else:
			unit = pow(stable_unit("%s:%s:body" % [seed, key]), 1.35) * 0.72
		return minimum + (maximum - minimum) * clampf(unit, 0.0, 1.0)
	var rare := stable_unit("%s:%s:rare" % [seed, key])
	if rare < rare_extreme_rate:
		unit = 0.0 if stable_unit("%s:%s:side" % [seed, key]) < 0.5 else 1.0
	else:
		var first := stable_unit("%s:%s:a" % [seed, key])
		var second := stable_unit("%s:%s:b" % [seed, key])
		unit = (first + second) * 0.5
	return minimum + (maximum - minimum) * clampf(unit, 0.0, 1.0)


static func _range_for_key(
	source: Dictionary,
	key: String,
	fallback_minimum: float,
	fallback_maximum: float
) -> Dictionary:
	var raw = source.get(key, null)
	if raw is Array and (raw as Array).size() >= 2:
		var array := raw as Array
		var first := float(array[0])
		var second := float(array[1])
		return {"min": minf(first, second), "max": maxf(first, second)}
	if raw is Dictionary:
		var dictionary := raw as Dictionary
		var first := float(dictionary.get("min", fallback_minimum))
		var second := float(dictionary.get("max", fallback_maximum))
		return {"min": minf(first, second), "max": maxf(first, second)}
	return {
		"min": minf(fallback_minimum, fallback_maximum),
		"max": maxf(fallback_minimum, fallback_maximum),
	}


static func _profile_is_valid(profile: Dictionary) -> bool:
	if str(profile.get("profileId", "")).strip_edges() == "":
		return false
	var output_base := profile.get("outputBase", {}) as Dictionary
	var output_growth := profile.get("outputGrowth", {}) as Dictionary
	for key in STAT_KEYS:
		if not output_base.has(key) or not output_growth.has(key):
			return false
	return true


static func _hex_digit_value(codepoint: int) -> int:
	if codepoint >= 48 and codepoint <= 57:
		return codepoint - 48
	if codepoint >= 65 and codepoint <= 70:
		return codepoint - 55
	if codepoint >= 97 and codepoint <= 102:
		return codepoint - 87
	return 0


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
	if (left is int or left is float) and (right is int or right is float):
		return absf(float(left) - float(right)) <= 0.0000005
	return left == right


static func _first_private_field_path(value, path: String = "") -> String:
	if value is Dictionary:
		for key in (value as Dictionary).keys():
			var clean_key := str(key)
			var next_path := clean_key if path == "" else "%s.%s" % [path, clean_key]
			if PRIVATE_FIELD_NAMES.has(clean_key):
				return next_path
			var nested := _first_private_field_path((value as Dictionary)[key], next_path)
			if nested != "":
				return nested
	elif value is Array:
		var array := value as Array
		for index in range(array.size()):
			var nested := _first_private_field_path(array[index], "%s[%d]" % [path, index])
			if nested != "":
				return nested
	return ""


static func _public_snapshot_shape_is_valid(snapshot: Dictionary) -> bool:
	var top_level_keys: Array[String] = [
		"schemaVersion",
		"growthModelVersion",
		"growthSpeciesProfileId",
		"level",
		"levelOneFourV",
		"stats",
	]
	if snapshot.size() != top_level_keys.size():
		return false
	for key in top_level_keys:
		if not snapshot.has(key):
			return false
	for stats_key in ["levelOneFourV", "stats"]:
		var value = snapshot.get(stats_key, {})
		if not (value is Dictionary) or (value as Dictionary).size() != STAT_KEYS.size():
			return false
		for key in STAT_KEYS:
			if not (value as Dictionary).has(key):
				return false
	return true
