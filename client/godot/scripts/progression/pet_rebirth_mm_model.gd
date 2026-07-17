extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
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
const HELPER_GROWTH_WEIGHT_SCALE := 0.6
const STONE_EFFECTIVE_EXPONENT := 1.35
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


static func balance_version() -> String:
	return str(_balance().get("balanceVersion", ""))


static func full_preparation_level() -> int:
	return int(_target_balance().get("fullPreparationLevel", 140))


static func target_preparation_for_level(target_level: int) -> Dictionary:
	var target := _target_balance()
	var minimum_level := int(target.get("minimumLevel", TARGET_REQUIRED_LEVEL))
	var full_level := maxi(minimum_level + 1, int(target.get("fullPreparationLevel", 140)))
	var max_multiplier := clampf(float(target.get("maxPoolMultiplier", 1.0)), 1.0, 1.25)
	var ratio := clampf(float(target_level - minimum_level) / float(full_level - minimum_level), 0.0, 1.0)
	return {
		"level": maxi(1, target_level),
		"ratio": ratio,
		"multiplier": 1.0 + (max_multiplier - 1.0) * ratio,
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
		"stoneCapacity": _stone_capacity(),
		"stonePoints": points,
	}


static func normalized_stone_points(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	var capacity := _stone_capacity()
	for key in STAT_KEYS:
		result[key] = clampi(int(source.get(key, 0)), 0, capacity)
	return result


static func add_stone_points(record: Dictionary, stat_key: String, points: int) -> Dictionary:
	var next := normalized_helper_record(record, int(record.get("stage", STAGE_ONE)))
	var key := normalized_stat_key(stat_key)
	if key == "":
		return next
	var stone_points := next.get("stonePoints", {}) as Dictionary
	stone_points[key] = clampi(int(stone_points.get(key, 0)) + maxi(0, points), 0, _stone_capacity())
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
	var capacity := _stone_capacity()
	for key in STAT_KEYS:
		var value := int(points.get(key, 0))
		total += value
		if value >= capacity:
			full_count += 1
	return {
		"totalPoints": total,
		"fullCount": full_count,
		"completion": clampf(float(total) / float(capacity * STAT_KEYS.size()), 0.0, 1.0),
	}


static func effective_stone_count(record: Dictionary) -> float:
	return _effective_stone_count(record)


static func pool_range_for_effective_stone_count(effective_count: float, stage: int) -> Dictionary:
	return (_pool_range_for_effective_stone_count(effective_count, stage) as Dictionary).duplicate(true)


static func helper_record_lines(record: Dictionary) -> Array[String]:
	var normalized := normalized_helper_record(record, int(record.get("stage", STAGE_ONE)))
	var points := normalized.get("stonePoints", {}) as Dictionary
	var lines: Array[String] = []
	var capacity := _stone_capacity()
	lines.append("%s石：%d/%d" % [stat_label("maxHp"), int(points.get("maxHp", 0)), capacity])
	lines.append("%s石：%d/%d" % [stat_label("attack"), int(points.get("attack", 0)), capacity])
	lines.append("%s石：%d/%d" % [stat_label("defense"), int(points.get("defense", 0)), capacity])
	lines.append("%s石：%d/%d" % [stat_label("quick"), int(points.get("quick", 0)), capacity])
	var completion := stone_completion(normalized)
	lines.append("满石数：%d/4    总完成度：%d%%" % [
		int(completion.get("fullCount", 0)),
		int(round(float(completion.get("completion", 0.0)) * 100.0)),
	])
	return lines


static func rebirth_bonus_preview(target_pet: Dictionary, helper_pet: Dictionary, roll_seed: String = "") -> Dictionary:
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
	var bonus_package := _bonus_from_target_and_helper(target_pet, helper_pet, helper_record, helper_stage, roll_seed)
	var bonus := bonus_package.get("visibleGrowthBonus", {}) as Dictionary
	return _preview(true, "%s 可以使用 %s 转生。" % [
		str(target_pet.get("name", "宠物")),
		str(helper_pet.get("name", helper_name_for_stage(helper_stage))),
	], bonus, helper_record, bonus_package)


static func apply_rebirth_to_pet(target_pet: Dictionary, helper_pet: Dictionary, now_sec: int, roll_seed: String = "") -> Dictionary:
	var validation_preview := rebirth_bonus_preview(target_pet, helper_pet)
	if not bool(validation_preview.get("ok", false)):
		return {
			"ok": false,
			"pet": target_pet.duplicate(true),
			"preview": validation_preview,
			"message": str(validation_preview.get("message", "不能转生。")),
		}
	var actual_roll_seed := roll_seed.strip_edges()
	if actual_roll_seed == "":
		actual_roll_seed = _new_rebirth_roll_seed(target_pet, helper_pet, now_sec)
	var preview := rebirth_bonus_preview(target_pet, helper_pet, actual_roll_seed)
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
		"rebirthBalanceVersion": str(preview.get("rebirthBalanceVersion", balance_version())),
		"rebirthBaseInternalPower": float(preview.get("rebirthBaseInternalPower", 0.0)),
		"rebirthBonusInternalPower": float(preview.get("rebirthBonusInternalPower", 0.0)),
		"rebirthBonusPercentile": float(preview.get("rebirthBonusPercentile", 0.0)),
		"rebirthBonusGrade": str(preview.get("rebirthBonusGrade", "D")),
		"rebirthRollSeed": str(preview.get("rebirthRollSeed", actual_roll_seed)),
		"targetPreparationLevel": int(preview.get("targetPreparationLevel", int(target_pet.get("level", 1)))),
		"targetPreparationRatio": float(preview.get("targetPreparationRatio", 0.0)),
		"targetPreparationMultiplier": float(preview.get("targetPreparationMultiplier", 1.0)),
		"helperGrowthWeights": (preview.get("helperGrowthWeights", {}) as Dictionary).duplicate(true) if preview.get("helperGrowthWeights", {}) is Dictionary else {},
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


static func _bonus_from_target_and_helper(target_pet: Dictionary, helper_pet: Dictionary, helper_record: Dictionary, stage: int, roll_seed: String = "") -> Dictionary:
	var target_growth := observed_visible_growth(target_pet)
	var target_internal := {}
	var hp_internal_scale := _hp_internal_scale()
	var allocation := _allocation_balance()
	var target_weight_scale := float(allocation.get("targetGrowthWeight", TARGET_WEIGHT_SCALE))
	var stone_weight_scale := float(allocation.get("stoneWeight", STONE_WEIGHT_SCALE))
	var helper_weight_scale := float(allocation.get("helperGrowthWeight", HELPER_GROWTH_WEIGHT_SCALE))
	var stone_capacity := float(_stone_capacity())
	for key in STAT_KEYS:
		var value := float(target_growth.get(key, 0.0))
		target_internal[key] = value / hp_internal_scale if key == "maxHp" else value
	var stone_points := normalized_stone_points(helper_record.get("stonePoints", {}))
	var helper_growth_weights := helper_growth_weight_distribution(helper_pet)
	var weights := {}
	var weight_total := 0.0
	for key in STAT_KEYS:
		var weight := maxf(0.05, float(target_internal.get(key, 0.0)) * target_weight_scale)
		weight += float(stone_points.get(key, 0)) / stone_capacity * stone_weight_scale
		weight += float(helper_growth_weights.get(key, 1.0)) * helper_weight_scale
		weights[key] = weight
		weight_total += weight
	if weight_total <= 0.0001:
		return _bonus_package(_growth_bonus_dict({}), {}, 0.0, 0.0, "D", helper_growth_weights)
	var pool_info := _pool_info_for_target_and_helper(target_pet, helper_pet, helper_record, stage, roll_seed)
	var pool := float(pool_info.get("pool", 0.0))
	var visible_bonus := {}
	var internal_bonus := {}
	for key in STAT_KEYS:
		var internal := pool * float(weights.get(key, 0.0)) / weight_total
		internal_bonus[key] = snappedf(internal, 0.001)
		visible_bonus[key] = snappedf(internal * hp_internal_scale, 0.001) if key == "maxHp" else snappedf(internal, 0.001)
	return _bonus_package(
		_growth_bonus_dict(visible_bonus),
		internal_bonus,
		pool,
		float(pool_info.get("percentile", 0.0)),
		str(pool_info.get("grade", "D")),
		helper_growth_weights,
		roll_seed,
		pool_info
	)


static func helper_growth_multiplier(helper_pet: Dictionary) -> float:
	return 1.0


static func helper_growth_weight_distribution(helper_pet: Dictionary) -> Dictionary:
	return _helper_growth_weight_distribution(helper_pet)


static func _helper_growth_weight_distribution(helper_pet: Dictionary) -> Dictionary:
	var equal := {}
	for key in STAT_KEYS:
		equal[key] = 1.0
	if helper_pet.is_empty():
		return equal
	if str(helper_pet.get("growthSpeciesProfileId", "")).strip_edges() == "":
		return equal
	var growth := observed_visible_growth(helper_pet)
	var internal := {}
	var total := 0.0
	var hp_internal_scale := _hp_internal_scale()
	for key in STAT_KEYS:
		var value := float(growth.get(key, 0.0))
		if key == "maxHp":
			value /= hp_internal_scale
		value = maxf(0.001, value)
		internal[key] = value
		total += value
	if total <= 0.0001:
		return equal
	var result := {}
	for key in STAT_KEYS:
		result[key] = snappedf(float(internal.get(key, 0.001)) / total * float(STAT_KEYS.size()), 0.001)
	return result


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


static func _pool_info_for_target_and_helper(target_pet: Dictionary, helper_pet: Dictionary, helper_record: Dictionary, stage: int, roll_seed: String = "") -> Dictionary:
	var safe_stage := clampi(stage, STAGE_ONE, STAGE_TWO)
	var effective_count := _effective_stone_count(helper_record)
	var pool_range := _pool_range_for_effective_stone_count(effective_count, safe_stage)
	var min_pool := float(pool_range.get("min", 0.0))
	var max_pool := float(pool_range.get("max", 0.0))
	var percentile := _rebirth_bonus_percentile(target_pet, helper_pet, helper_record, safe_stage, roll_seed)
	var base_pool := min_pool + (max_pool - min_pool) * percentile / 100.0
	var preparation := target_preparation_for_level(int(target_pet.get("level", 1)))
	var multiplier := float(preparation.get("multiplier", 1.0))
	var pool := snappedf(base_pool * multiplier, 0.001)
	return {
		"pool": pool,
		"basePool": snappedf(base_pool, 0.001),
		"effectiveStoneCount": snappedf(effective_count, 0.001),
		"poolMin": snappedf(min_pool, 0.001),
		"poolMax": snappedf(max_pool, 0.001),
		"percentile": snappedf(percentile, 0.1),
		"grade": _grade_for_percentile(percentile),
		"targetPreparationLevel": int(preparation.get("level", 1)),
		"targetPreparationRatio": snappedf(float(preparation.get("ratio", 0.0)), 0.001),
		"targetPreparationMultiplier": snappedf(multiplier, 0.001),
	}


static func _effective_stone_count(helper_record: Dictionary) -> float:
	var points := normalized_stone_points(helper_record.get("stonePoints", {}))
	var total := 0.0
	var stone_capacity := float(_stone_capacity())
	var exponent := float(_stone_balance().get("effectiveExponent", STONE_EFFECTIVE_EXPONENT))
	for key in STAT_KEYS:
		var ratio := clampf(float(points.get(key, 0)) / stone_capacity, 0.0, 1.0)
		total += pow(ratio, exponent)
	return snappedf(total, 0.001)


static func _pool_range_for_effective_stone_count(effective_count: float, stage: int) -> Dictionary:
	var safe_stage := clampi(stage, STAGE_ONE, STAGE_TWO)
	var raw_tables := _balance().get("poolRangesByStage", {}) as Dictionary
	var table_value = raw_tables.get(str(safe_stage), raw_tables.get(str(STAGE_ONE), []))
	var table := table_value as Array if table_value is Array else []
	if table.size() < 5:
		return {"min": 0.0, "max": 0.0}
	var safe_count := clampf(effective_count, 0.0, 4.0)
	var lower := clampi(int(floor(safe_count)), 0, 4)
	var upper := clampi(lower + 1, 0, 4)
	var t := 0.0 if lower >= 4 else clampf(safe_count - float(lower), 0.0, 1.0)
	var lower_range := table[lower] as Dictionary if table[lower] is Dictionary else {"min": 0.0, "max": 0.0}
	var upper_range := table[upper] as Dictionary if table[upper] is Dictionary else lower_range
	var lower_min := float(lower_range.get("min", 0.0))
	var lower_max := float(lower_range.get("max", 0.0))
	var upper_min := float(upper_range.get("min", lower_min))
	var upper_max := float(upper_range.get("max", lower_max))
	return {
		"min": snappedf(lower_min + (upper_min - lower_min) * t, 0.001),
		"max": snappedf(lower_max + (upper_max - lower_max) * t, 0.001),
	}


static func _rebirth_bonus_percentile(target_pet: Dictionary, helper_pet: Dictionary, _helper_record: Dictionary, stage: int, roll_seed: String = "") -> float:
	var actual_seed := roll_seed.strip_edges()
	if actual_seed == "":
		return clampf(float(_roll_balance().get("previewPercentile", 50.0)), 0.0, 100.0)
	var key := "%s|%s|%s|%s|%d|%s" % [
		str(target_pet.get("growthSpeciesSeed", target_pet.get("instanceId", target_pet.get("petId", "")))),
		str(helper_pet.get("growthSpeciesSeed", helper_pet.get("instanceId", helper_pet.get("petId", "")))),
		str(target_pet.get("formId", target_pet.get("templateId", ""))),
		str(helper_pet.get("formId", helper_pet.get("templateId", ""))),
		stage,
		actual_seed,
	]
	return float(_stable_hash("pet_rebirth_bonus:%s" % key) % 10001) / 100.0


static func _grade_for_percentile(percentile: float) -> String:
	var value := clampf(percentile, 0.0, 100.0)
	var thresholds := _roll_balance().get("gradeThresholds", {}) as Dictionary
	if value >= float(thresholds.get("S", 95.0)):
		return "S"
	if value >= float(thresholds.get("A", 85.0)):
		return "A"
	if value >= float(thresholds.get("B", 55.0)):
		return "B"
	if value >= float(thresholds.get("C", 25.0)):
		return "C"
	return "D"


static func _bonus_package(visible_bonus: Dictionary, internal_bonus: Dictionary, internal_power: float, percentile: float, grade: String, helper_growth_weights: Dictionary, roll_seed: String = "", pool_info: Dictionary = {}) -> Dictionary:
	return {
		"visibleGrowthBonus": _growth_bonus_dict(visible_bonus),
		"internalGrowthBonus": internal_bonus.duplicate(true),
		"rebirthBalanceVersion": balance_version(),
		"rebirthBaseInternalPower": snappedf(float(pool_info.get("basePool", internal_power)), 0.001),
		"rebirthBonusInternalPower": snappedf(internal_power, 0.001),
		"rebirthBonusPercentile": snappedf(percentile, 0.1),
		"rebirthBonusGrade": grade,
		"rebirthRollSeed": roll_seed.strip_edges(),
		"rebirthRollMode": "random" if roll_seed.strip_edges() != "" else "preview_median",
		"targetPreparationLevel": int(pool_info.get("targetPreparationLevel", 1)),
		"targetPreparationRatio": snappedf(float(pool_info.get("targetPreparationRatio", 0.0)), 0.001),
		"targetPreparationMultiplier": snappedf(float(pool_info.get("targetPreparationMultiplier", 1.0)), 0.001),
		"helperGrowthWeights": helper_growth_weights.duplicate(true),
	}


static func _preview(ok: bool, message: String, visible_bonus: Dictionary, helper_record: Dictionary, bonus_package: Dictionary = {}) -> Dictionary:
	var lines: Array[String] = []
	if ok:
		lines.append("等级变化：当前等级 -> Lv1，经验清零。")
		lines.append("成长加成：%s" % _bonus_text(visible_bonus))
		lines.append("MM石头：%s" % _stone_points_text(helper_record.get("stonePoints", {})))
		lines.append("目标等级准备：Lv%d，成长池 ×%.3f（Lv%d可转，Lv%d满额）。" % [
			int(bonus_package.get("targetPreparationLevel", TARGET_REQUIRED_LEVEL)),
			float(bonus_package.get("targetPreparationMultiplier", 1.0)),
			TARGET_REQUIRED_LEVEL,
			full_preparation_level(),
		])
		var roll_mode := str(bonus_package.get("rebirthRollMode", "preview_median"))
		lines.append("转生加成%s：%s %.1f%%，四维等效 %.3f/级" % [
			"预估" if roll_mode == "preview_median" else "",
			str(bonus_package.get("rebirthBonusGrade", "D")),
			float(bonus_package.get("rebirthBonusPercentile", 0.0)),
			float(bonus_package.get("rebirthBonusInternalPower", 0.0)),
		])
		if roll_mode == "preview_median":
			lines.append("说明：预览按中位数估算，确认转生时随机一次并记录。")
		lines.append("说明：MM单项成长只轻微影响四维分配，不放大总成长。")
		lines.append("说明：加成写入宠物成长记录，后续升级按新成长计算。")
	return {
		"ok": ok,
		"mode": "rebirth",
		"title": "宠物转生",
		"message": message,
		"lines": lines,
		"visibleGrowthBonus": _growth_bonus_dict(visible_bonus),
		"rebirthBalanceVersion": str(bonus_package.get("rebirthBalanceVersion", balance_version())),
		"rebirthBaseInternalPower": snappedf(float(bonus_package.get("rebirthBaseInternalPower", 0.0)), 0.001),
		"rebirthBonusInternalPower": snappedf(float(bonus_package.get("rebirthBonusInternalPower", 0.0)), 0.001),
		"rebirthBonusPercentile": snappedf(float(bonus_package.get("rebirthBonusPercentile", 0.0)), 0.1),
		"rebirthBonusGrade": str(bonus_package.get("rebirthBonusGrade", "D")),
		"rebirthRollSeed": str(bonus_package.get("rebirthRollSeed", "")),
		"rebirthRollMode": str(bonus_package.get("rebirthRollMode", "preview_median")),
		"targetPreparationLevel": int(bonus_package.get("targetPreparationLevel", 1)),
		"targetPreparationRatio": snappedf(float(bonus_package.get("targetPreparationRatio", 0.0)), 0.001),
		"targetPreparationMultiplier": snappedf(float(bonus_package.get("targetPreparationMultiplier", 1.0)), 0.001),
		"helperGrowthWeights": (bonus_package.get("helperGrowthWeights", {}) as Dictionary).duplicate(true) if bonus_package.get("helperGrowthWeights", {}) is Dictionary else {},
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
	var capacity := _stone_capacity()
	for key in STAT_KEYS:
		parts.append("%s%d/%d" % [stat_label(key), int(points.get(key, 0)), capacity])
	return "，".join(parts)


static func _balance() -> Dictionary:
	return BalanceCatalogModel.pet_rebirth_balance()


static func _target_balance() -> Dictionary:
	var value = _balance().get("target", {})
	return value as Dictionary if value is Dictionary else {}


static func _stone_balance() -> Dictionary:
	var value = _balance().get("stone", {})
	return value as Dictionary if value is Dictionary else {}


static func _allocation_balance() -> Dictionary:
	var value = _balance().get("allocation", {})
	return value as Dictionary if value is Dictionary else {}


static func _roll_balance() -> Dictionary:
	var value = _balance().get("roll", {})
	return value as Dictionary if value is Dictionary else {}


static func _stone_capacity() -> int:
	return maxi(1, int(_stone_balance().get("capacityPerStat", STONE_CAPACITY)))


static func _hp_internal_scale() -> float:
	var value = _balance().get("internalPower", {})
	var internal_power := value as Dictionary if value is Dictionary else {}
	return maxf(0.001, float(internal_power.get("maxHpScale", HP_INTERNAL_SCALE)))


static func _growth_bonus_dict(value) -> Dictionary:
	var source := value as Dictionary if value is Dictionary else {}
	var result := {}
	for key in STAT_KEYS:
		result[key] = snappedf(float(source.get(key, 0.0)), 0.001)
	return result


static func _stable_hash(text: String) -> int:
	var hash_value := 2166136261
	for index in range(text.length()):
		hash_value = int((hash_value ^ text.unicode_at(index)) * 16777619) % 2147483647
	return abs(hash_value)


static func _new_rebirth_roll_seed(target_pet: Dictionary, helper_pet: Dictionary, now_sec: int) -> String:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	return "%d|%d|%d|%s|%s" % [
		now_sec,
		Time.get_ticks_usec(),
		rng.randi(),
		str(target_pet.get("instanceId", target_pet.get("petId", ""))),
		str(helper_pet.get("instanceId", helper_pet.get("petId", ""))),
	]


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
