extends RefCounted

const PetGrowthObservationModel := preload("res://scripts/progression/pet_growth_observation_model.gd")

const SCHEMA_VERSION := 1
const STAGE_ONE := 1
const STAGE_TWO := 2
const HELPER_REQUIRED_LEVEL := 79
const TARGET_REQUIRED_LEVEL := 80
const STONE_CAPACITY := 50
const MAX_REBIRTH_STAGE := 2
const HP_INTERNAL_SCALE := 4.0
const TARGET_WEIGHT_SCALE := 1.0
const STONE_WEIGHT_SCALE := 8.0
const HELPER_QUALITY_MULTIPLIER_MIN := 0.92
const HELPER_QUALITY_MULTIPLIER_MAX := 1.08
const STAT_KEYS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}
const HELPER_FORM_BY_STAGE := {
	STAGE_ONE: "pet_rebirth_mm_stage1",
	STAGE_TWO: "pet_rebirth_mm_stage2",
}
const HELPER_NAME_BY_STAGE := {
	STAGE_ONE: "1转小MM",
	STAGE_TWO: "2转小MM",
}
const FULL_STONE_INTERNAL_POOLS_BY_STAGE := {
	STAGE_ONE: {
		0: 0.0,
		1: 1.05,
		2: 1.20,
		3: 1.35,
		4: 1.60,
	},
	STAGE_TWO: {
		0: 0.0,
		1: 1.15,
		2: 1.35,
		3: 1.55,
		4: 1.85,
	},
}


static func helper_form_id_for_stage(stage: int) -> String:
	return str(HELPER_FORM_BY_STAGE.get(clampi(stage, STAGE_ONE, STAGE_TWO), ""))


static func helper_name_for_stage(stage: int) -> String:
	return str(HELPER_NAME_BY_STAGE.get(clampi(stage, STAGE_ONE, STAGE_TWO), "转生MM"))


static func is_helper_pet(pet: Dictionary) -> bool:
	return helper_stage_for_pet(pet) > 0


static func helper_stage_for_pet(pet: Dictionary) -> int:
	var form_id := str(pet.get("formId", pet.get("templateId", "")))
	for stage in HELPER_FORM_BY_STAGE.keys():
		if str(HELPER_FORM_BY_STAGE.get(stage, "")) == form_id:
			return int(stage)
	var record := normalized_helper_record(pet.get("petRebirthHelper", pet.get("rebirthHelper", {})), 0)
	return int(record.get("stage", 0))


static func normalized_helper_record(value, default_stage: int = STAGE_ONE) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var stage := clampi(int(source.get("stage", default_stage)), 0, MAX_REBIRTH_STAGE)
	var points := normalized_stone_points(source.get("stonePoints", {}))
	return {
		"schemaVersion": SCHEMA_VERSION,
		"stage": stage,
		"stoneCapacity": STONE_CAPACITY,
		"stonePoints": points,
	}


static func normalized_stone_points(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = clampi(int(source.get(key, 0)), 0, STONE_CAPACITY)
	return result


static func add_stone_points(record: Dictionary, stat_key: String, points: int) -> Dictionary:
	var next := normalized_helper_record(record, int(record.get("stage", STAGE_ONE)))
	var key := normalized_stat_key(stat_key)
	if key == "":
		return next
	var stone_points := next.get("stonePoints", {}) as Dictionary
	stone_points[key] = clampi(int(stone_points.get(key, 0)) + maxi(0, points), 0, STONE_CAPACITY)
	next["stonePoints"] = stone_points
	return next


static func normalized_stat_key(stat_key: String) -> String:
	var key := stat_key.strip_edges()
	if key == "hp" or key == "life":
		key = "maxHp"
	if key == "agility" or key == "speed":
		key = "quick"
	return key if STAT_KEYS.has(key) else ""


static func stat_label(stat_key: String) -> String:
	return str(STAT_LABELS.get(normalized_stat_key(stat_key), stat_key))


static func stone_completion(record: Dictionary) -> Dictionary:
	var points := normalized_stone_points(record.get("stonePoints", {}))
	var total := 0
	var full_count := 0
	for key in STAT_KEYS:
		var value := int(points.get(key, 0))
		total += value
		if value >= STONE_CAPACITY:
			full_count += 1
	return {
		"totalPoints": total,
		"fullCount": full_count,
		"completion": clampf(float(total) / float(STONE_CAPACITY * STAT_KEYS.size()), 0.0, 1.0),
	}


static func helper_record_lines(record: Dictionary) -> Array[String]:
	var normalized := normalized_helper_record(record, int(record.get("stage", STAGE_ONE)))
	var points := normalized.get("stonePoints", {}) as Dictionary
	var lines: Array[String] = []
	lines.append("%s石：%d/%d" % [stat_label("maxHp"), int(points.get("maxHp", 0)), STONE_CAPACITY])
	lines.append("%s石：%d/%d" % [stat_label("attack"), int(points.get("attack", 0)), STONE_CAPACITY])
	lines.append("%s石：%d/%d" % [stat_label("defense"), int(points.get("defense", 0)), STONE_CAPACITY])
	lines.append("%s石：%d/%d" % [stat_label("quick"), int(points.get("quick", 0)), STONE_CAPACITY])
	var completion := stone_completion(normalized)
	lines.append("满石数：%d/4    总完成度：%d%%" % [
		int(completion.get("fullCount", 0)),
		int(round(float(completion.get("completion", 0.0)) * 100.0)),
	])
	return lines


static func rebirth_bonus_preview(target_pet: Dictionary, helper_pet: Dictionary) -> Dictionary:
	var helper_stage := helper_stage_for_pet(helper_pet)
	var target_rebirth := _pet_rebirth_count(target_pet)
	var expected_stage := target_rebirth + 1
	if helper_stage <= 0:
		return _preview(false, "请选择转生MM。", {}, {})
	if expected_stage > MAX_REBIRTH_STAGE:
		return _preview(false, "当前只开放到2转宠物转生。", {}, {})
	if helper_stage != expected_stage:
		return _preview(false, "%s 需要 %s。" % [
			str(target_pet.get("name", "宠物")),
			helper_name_for_stage(expected_stage),
		], {}, {})
	if int(target_pet.get("level", 1)) < TARGET_REQUIRED_LEVEL:
		return _preview(false, "%s 需要 Lv%d 才能进行宠物转生。" % [
			str(target_pet.get("name", "宠物")),
			TARGET_REQUIRED_LEVEL,
		], {}, {})
	if int(helper_pet.get("level", 1)) < HELPER_REQUIRED_LEVEL:
		return _preview(false, "%s 需要练到 Lv%d。" % [
			str(helper_pet.get("name", helper_name_for_stage(helper_stage))),
			HELPER_REQUIRED_LEVEL,
		], {}, {})
	var helper_record := normalized_helper_record(helper_pet.get("petRebirthHelper", {}), helper_stage)
	var bonus := _bonus_from_target_and_helper(target_pet, helper_pet, helper_record, helper_stage)
	return _preview(true, "%s 可以使用 %s 转生。" % [
		str(target_pet.get("name", "宠物")),
		str(helper_pet.get("name", helper_name_for_stage(helper_stage))),
	], bonus, helper_record, _helper_growth_multiplier(helper_pet))


static func apply_rebirth_to_pet(target_pet: Dictionary, helper_pet: Dictionary, now_sec: int) -> Dictionary:
	var preview := rebirth_bonus_preview(target_pet, helper_pet)
	if not bool(preview.get("ok", false)):
		return {
			"ok": false,
			"pet": target_pet.duplicate(true),
			"preview": preview,
			"message": str(preview.get("message", "不能转生。")),
		}
	var next := target_pet.duplicate(true)
	var record := _normalized_cultivation(next.get("petCultivation", {}))
	var current_rebirth := int(record.get("rebirthCount", 0))
	var bonus := preview.get("visibleGrowthBonus", {}) as Dictionary
	var cumulative := _growth_bonus_dict(record.get("rebirthGrowthBonus", {}))
	for key in STAT_KEYS:
		cumulative[key] = snappedf(float(cumulative.get(key, 0.0)) + float(bonus.get(key, 0.0)), 0.001)
	record["rebirthCount"] = current_rebirth + 1
	record["rebirthGrowthBonus"] = cumulative
	var event := {
		"schemaVersion": SCHEMA_VERSION,
		"mode": "rebirth",
		"timestamp": now_sec,
		"petInstanceId": str(next.get("instanceId", next.get("petId", ""))),
		"petName": str(next.get("name", "宠物")),
		"helperInstanceId": str(helper_pet.get("instanceId", "")),
		"helperName": str(helper_pet.get("name", helper_name_for_stage(current_rebirth + 1))),
		"helperStage": current_rebirth + 1,
		"helperLevel": int(helper_pet.get("level", 1)),
		"helperStonePoints": (preview.get("helperRecord", {}) as Dictionary).get("stonePoints", {}),
		"helperGrowthMultiplier": float(preview.get("helperGrowthMultiplier", 1.0)),
		"visibleGrowthBonus": bonus,
		"beforeLevel": int(target_pet.get("level", 1)),
		"afterLevel": 1,
		"beforeRebirthCount": current_rebirth,
		"afterRebirthCount": current_rebirth + 1,
		"summary": "%d转 -> %d转，Lv%d -> Lv1" % [
			current_rebirth,
			current_rebirth + 1,
			int(target_pet.get("level", 1)),
		],
	}
	event["message"] = "%s：%s，成长加成 %s。" % [
		str(target_pet.get("name", "宠物")),
		str(event.get("summary", "")),
		_bonus_text(bonus),
	]
	var history: Array = record.get("history", []) if record.get("history", []) is Array else []
	history.append(event.duplicate(true))
	while history.size() > 20:
		history.pop_front()
	record["history"] = history
	record["lastPreview"] = preview.duplicate(true)
	record["lastResult"] = event.duplicate(true)
	next["petCultivation"] = record
	next["lastCultivationResult"] = event.duplicate(true)
	next["level"] = 1
	next["exp"] = 0
	next["hp"] = 1
	next["maxHp"] = 1
	return {
		"ok": true,
		"pet": next,
		"preview": preview,
		"result": event,
		"message": str(event.get("message", "宠物转生完成。")),
	}


static func _bonus_from_target_and_helper(target_pet: Dictionary, helper_pet: Dictionary, helper_record: Dictionary, stage: int) -> Dictionary:
	var target_growth := observed_visible_growth(target_pet)
	var target_internal := {}
	for key in STAT_KEYS:
		var value := float(target_growth.get(key, 0.0))
		target_internal[key] = value / HP_INTERNAL_SCALE if key == "maxHp" else value
	var stone_points := normalized_stone_points(helper_record.get("stonePoints", {}))
	var weights := {}
	var weight_total := 0.0
	for key in STAT_KEYS:
		var weight := maxf(0.05, float(target_internal.get(key, 0.0)) * TARGET_WEIGHT_SCALE)
		weight += float(stone_points.get(key, 0)) / float(STONE_CAPACITY) * STONE_WEIGHT_SCALE
		weights[key] = weight
		weight_total += weight
	if weight_total <= 0.0001:
		return _growth_bonus_dict({})
	var pool := _pool_for_helper_record(helper_record, stage)
	pool = snappedf(pool * _helper_growth_multiplier(helper_pet), 0.001)
	var visible_bonus := {}
	var internal_bonus := {}
	for key in STAT_KEYS:
		var internal := pool * float(weights.get(key, 0.0)) / weight_total
		internal_bonus[key] = snappedf(internal, 0.001)
		visible_bonus[key] = snappedf(internal * HP_INTERNAL_SCALE, 0.001) if key == "maxHp" else snappedf(internal, 0.001)
	return _growth_bonus_dict(visible_bonus)


static func helper_growth_multiplier(helper_pet: Dictionary) -> float:
	return _helper_growth_multiplier(helper_pet)


static func _helper_growth_multiplier(helper_pet: Dictionary) -> float:
	if helper_pet.is_empty():
		return 1.0
	if str(helper_pet.get("growthSpeciesProfileId", "")).strip_edges() == "":
		return 1.0
	var observation := PetGrowthObservationModel.evaluate_pet_for_stage(helper_pet, 0)
	var observed_levels := int(observation.get("observedLevels", 0))
	if observed_levels <= 0:
		return 1.0
	var percentile := clampf(float(observation.get("powerPercentile", 50.0)), 0.0, 100.0)
	return snappedf(HELPER_QUALITY_MULTIPLIER_MIN + (HELPER_QUALITY_MULTIPLIER_MAX - HELPER_QUALITY_MULTIPLIER_MIN) * percentile / 100.0, 0.001)


static func observed_visible_growth(pet: Dictionary) -> Dictionary:
	var level := maxi(1, int(pet.get("level", 1)))
	var result := _growth_bonus_dict({})
	if level <= 1:
		var record_value: Variant = pet.get("growthRecord", {})
		var bonus_dict: Dictionary = {}
		if record_value is Dictionary:
			var record_dict := record_value as Dictionary
			var bonus_value: Variant = record_dict.get("bonus", {})
			if bonus_value is Dictionary:
				bonus_dict = bonus_value as Dictionary
		for key in STAT_KEYS:
			result[key] = float(bonus_dict.get(key, 0.0))
		return result
	var initial = pet.get("initialStats", pet.get("growthSpeciesLevel1Stats", {}))
	var initial_dict := initial as Dictionary if initial is Dictionary else {}
	for key in STAT_KEYS:
		result[key] = snappedf((float(pet.get(key, 0.0)) - float(initial_dict.get(key, pet.get(key, 0.0)))) / float(level - 1), 0.001)
	return result


static func _pool_for_helper_record(helper_record: Dictionary, stage: int) -> float:
	var completion := stone_completion(helper_record)
	var total_points := int(completion.get("totalPoints", 0))
	var full_count := clampi(int(completion.get("fullCount", 0)), 0, 4)
	if total_points <= 0:
		return 0.0
	var stage_table := FULL_STONE_INTERNAL_POOLS_BY_STAGE.get(clampi(stage, STAGE_ONE, STAGE_TWO), FULL_STONE_INTERNAL_POOLS_BY_STAGE[STAGE_ONE]) as Dictionary
	if full_count <= 0:
		var four_full_pool := float(stage_table.get(4, 1.60))
		return snappedf(four_full_pool * pow(float(total_points) / float(STONE_CAPACITY * 4), 1.35), 0.001)
	var current_full_pool := float(stage_table.get(full_count, 0.0))
	var previous_full_pool := float(stage_table.get(full_count - 1, 0.0))
	var points_in_band := total_points - full_count * STONE_CAPACITY
	var band_size := STONE_CAPACITY if full_count < 4 else 1
	var band_unit := clampf(float(points_in_band) / float(band_size), 0.0, 1.0)
	if full_count >= 4:
		return snappedf(current_full_pool, 0.001)
	var next_pool := float(stage_table.get(full_count + 1, current_full_pool))
	return snappedf(current_full_pool + (next_pool - current_full_pool) * pow(band_unit, 1.15), 0.001) if points_in_band > 0 else snappedf(current_full_pool if current_full_pool > 0.0 else previous_full_pool, 0.001)


static func _preview(ok: bool, message: String, visible_bonus: Dictionary, helper_record: Dictionary, helper_multiplier: float = 1.0) -> Dictionary:
	var lines: Array[String] = []
	if ok:
		lines.append("等级变化：当前等级 -> Lv1，经验清零。")
		lines.append("成长加成：%s" % _bonus_text(visible_bonus))
		lines.append("MM石头：%s" % _stone_points_text(helper_record.get("stonePoints", {})))
		lines.append("MM个体效率：%.1f%%" % (helper_multiplier * 100.0))
		lines.append("说明：加成写入宠物成长记录，后续升级按新成长计算。")
	return {
		"ok": ok,
		"mode": "rebirth",
		"title": "宠物转生",
		"message": message,
		"lines": lines,
		"visibleGrowthBonus": _growth_bonus_dict(visible_bonus),
		"helperGrowthMultiplier": snappedf(helper_multiplier, 0.001),
		"helperRecord": normalized_helper_record(helper_record, int(helper_record.get("stage", STAGE_ONE))) if not helper_record.is_empty() else {},
		"schemaVersion": SCHEMA_VERSION,
	}


static func _bonus_text(bonus: Dictionary) -> String:
	var normalized := _growth_bonus_dict(bonus)
	return "血 %.3f/级，攻 %.3f/级，防 %.3f/级，敏 %.3f/级" % [
		float(normalized.get("maxHp", 0.0)),
		float(normalized.get("attack", 0.0)),
		float(normalized.get("defense", 0.0)),
		float(normalized.get("quick", 0.0)),
	]


static func _stone_points_text(value) -> String:
	var points := normalized_stone_points(value)
	var parts: Array[String] = []
	for key in STAT_KEYS:
		parts.append("%s%d/%d" % [stat_label(key), int(points.get(key, 0)), STONE_CAPACITY])
	return "，".join(parts)


static func _growth_bonus_dict(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = snappedf(float(source.get(key, 0.0)), 0.001)
	return result


static func _normalized_cultivation(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var history: Array = source.get("history", []) if source.get("history", []) is Array else []
	return {
		"schemaVersion": SCHEMA_VERSION,
		"rebirthCount": maxi(0, int(source.get("rebirthCount", 0))),
		"enhanceLevel": maxi(0, int(source.get("enhanceLevel", 0))),
		"rebirthGrowthBonus": _growth_bonus_dict(source.get("rebirthGrowthBonus", {})),
		"history": history.duplicate(true),
		"lastPreview": (source.get("lastPreview", {}) as Dictionary).duplicate(true) if source.get("lastPreview", {}) is Dictionary else {},
		"lastResult": (source.get("lastResult", {}) as Dictionary).duplicate(true) if source.get("lastResult", {}) is Dictionary else {},
	}


static func _pet_rebirth_count(pet: Dictionary) -> int:
	var record_value: Variant = pet.get("petCultivation", {})
	if record_value is Dictionary:
		return maxi(0, int((record_value as Dictionary).get("rebirthCount", 0)))
	return 0
