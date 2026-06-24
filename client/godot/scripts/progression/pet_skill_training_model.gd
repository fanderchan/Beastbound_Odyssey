extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")

const TRAINING_PATH := "res://data/pet_skill_training.json"
const DEFAULT_TRAINER_ID := "firebud_pet_skill_trainer"
const DEFAULT_COST := 30
static var catalog_cache_loaded: bool = false
static var catalog_cache: Dictionary = {}


static func catalog() -> Dictionary:
	if catalog_cache_loaded:
		return catalog_cache
	catalog_cache_loaded = true
	if not FileAccess.file_exists(TRAINING_PATH):
		catalog_cache = {}
		return catalog_cache
	var text := FileAccess.get_file_as_string(TRAINING_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		catalog_cache = {}
		return catalog_cache
	catalog_cache = parsed as Dictionary
	return catalog_cache


static func trainers() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_trainers = catalog().get("trainers", [])
	if raw_trainers is Array:
		for value in raw_trainers:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result


static func trainer_by_id(trainer_id: String) -> Dictionary:
	for trainer in trainers():
		if str(trainer.get("trainerId", "")) == trainer_id:
			return trainer
	return {}


static func trainer_label(trainer_id: String = DEFAULT_TRAINER_ID) -> String:
	var trainer := trainer_by_id(trainer_id)
	return str(trainer.get("label", "宠技训练师")) if not trainer.is_empty() else "宠技训练师"


static func trainer_skill_ids(trainer_id: String = DEFAULT_TRAINER_ID) -> Array[String]:
	var trainer := trainer_by_id(trainer_id)
	if trainer.is_empty():
		return []
	return _string_array(trainer.get("skillIds", []))


static func skill_entries() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_skills = catalog().get("skills", [])
	if raw_skills is Array:
		for value in raw_skills:
			if value is Dictionary:
				result.append(value as Dictionary)
	return result


static func skill_entry(skill_id: String) -> Dictionary:
	for skill in skill_entries():
		if str(skill.get("skillId", "")) == skill_id:
			return skill
	return {}


static func skill_cost(skill_id: String) -> int:
	return maxi(0, int(skill_entry(skill_id).get("cost", DEFAULT_COST)))


static func skill_description(skill_id: String) -> String:
	var entry := skill_entry(skill_id)
	var description := str(entry.get("description", ""))
	if description != "":
		return description
	var effect_type := BattleActionCatalog.effect_type_for(skill_id)
	match effect_type:
		"damage":
			return "宠物物理技能。"
		"status":
			return "宠物状态技能。"
		"defend":
			return "宠物防御。"
		_:
			return "宠物技能。"


static func skill_options_for_trainer(trainer_id: String = DEFAULT_TRAINER_ID) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for skill_id in trainer_skill_ids(trainer_id):
		var action := BattleActionCatalog.action_by_id(skill_id)
		if action.is_empty() or str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
			continue
		result.append({
			"id": skill_id,
			"label": BattleActionCatalog.label_for(skill_id, skill_id),
			"cost": skill_cost(skill_id),
			"description": skill_description(skill_id),
		})
	return result


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded_catalog := catalog()
	if loaded_catalog.is_empty():
		errors.append("pet_skill_training.json 缺失或不是 JSON 对象")
		return errors
	if int(loaded_catalog.get("schemaVersion", 0)) != 1:
		errors.append("pet_skill_training.json schemaVersion 当前必须是 1")
	var seen_trainers := {}
	for trainer in trainers():
		var trainer_id := str(trainer.get("trainerId", ""))
		if trainer_id == "":
			errors.append("训练师 trainerId 不能为空")
			continue
		if seen_trainers.has(trainer_id):
			errors.append("训练师重复: %s" % trainer_id)
		seen_trainers[trainer_id] = true
		var skill_ids := _string_array(trainer.get("skillIds", []))
		if skill_ids.is_empty():
			errors.append("%s.skillIds 不能为空" % trainer_id)
		for skill_id in skill_ids:
			var action := BattleActionCatalog.action_by_id(skill_id)
			if action.is_empty():
				errors.append("%s 引用了不存在的技能: %s" % [trainer_id, skill_id])
			elif str(action.get("owner", "")) != BattleActionCatalog.OWNER_PET_SKILL:
				errors.append("%s 只能教授宠物技能: %s" % [trainer_id, skill_id])
	var seen_skills := {}
	for skill in skill_entries():
		var skill_id := str(skill.get("skillId", ""))
		if skill_id == "":
			errors.append("训练技能 skillId 不能为空")
			continue
		if seen_skills.has(skill_id):
			errors.append("训练技能重复: %s" % skill_id)
		seen_skills[skill_id] = true
		if BattleActionCatalog.action_by_id(skill_id).is_empty():
			errors.append("训练技能不存在: %s" % skill_id)
		if int(skill.get("cost", DEFAULT_COST)) < 0:
			errors.append("%s.cost 不能为负数" % skill_id)
	return errors


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item)
			if text != "" and not result.has(text):
				result.append(text)
	return result
