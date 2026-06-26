extends RefCounted

const ACTIONS_PATH := "res://data/battle_actions.json"
const MAX_PET_SKILL_SLOTS_FALLBACK := 7
const OWNER_PLAYER := "player"
const OWNER_SPIRIT := "spirit"
const OWNER_PET_SKILL := "pet_skill"
const OWNER_ITEM := "item"
const OWNER_EQUIPMENT_ACTION := "equipment_action"
const SIDE_ALLY := "ally"
const SIDE_ENEMY := "enemy"
const TARGET_MODE_SINGLE := "single"
const TARGET_MODE_ENEMY_RANDOM_RANGE := "enemy_random_range"
const TARGET_MODE_BATTLEFIELD := "battlefield"
static var catalog_cache_loaded: bool = false
static var catalog_cache: Dictionary = {}


static func catalog() -> Dictionary:
	if catalog_cache_loaded:
		return catalog_cache
	catalog_cache_loaded = true
	if not FileAccess.file_exists(ACTIONS_PATH):
		catalog_cache = {}
		return catalog_cache
	var text := FileAccess.get_file_as_string(ACTIONS_PATH)
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		catalog_cache = {}
		return catalog_cache
	catalog_cache = parsed as Dictionary
	return catalog_cache


static func actions() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var loaded_catalog := catalog()
	var raw_actions: Array = loaded_catalog.get("actions", [])
	for value in raw_actions:
		if value is Dictionary:
			result.append(value as Dictionary)
	return result


static func action_by_id(action_id: String) -> Dictionary:
	for action in actions():
		if str(action.get("id", "")) == action_id:
			return action
	return {}


static func actions_by_owner(owner: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for action in actions():
		if str(action.get("owner", "")) == owner:
			result.append(action)
	return result


static func label_for(action_id: String, fallback: String = "") -> String:
	var action := action_by_id(action_id)
	if action.is_empty():
		return fallback
	var label := str(action.get("label", ""))
	return label if label != "" else fallback


static func effect_amount_for(action_id: String, fallback: int = 0) -> int:
	var effect := effect_for(action_id)
	if effect.has("amount"):
		return int(effect.get("amount", fallback))
	return fallback


static func effect_amount_bonus_for(action_id: String, fallback: int = 0) -> int:
	var effect := effect_for(action_id)
	if effect.has("amountBonus"):
		return int(effect.get("amountBonus", fallback))
	return fallback


static func effect_power_multiplier_for(action_id: String, fallback: float = 1.0) -> float:
	var effect := effect_for(action_id)
	if effect.has("powerMultiplier"):
		return maxf(0.0, float(effect.get("powerMultiplier", fallback)))
	return fallback


static func effect_critical_damage_multiplier_for(action_id: String, fallback: float = -1.0) -> float:
	var effect := effect_for(action_id)
	if effect.has("criticalDamageMultiplier"):
		return maxf(0.0, float(effect.get("criticalDamageMultiplier", fallback)))
	return fallback


static func effect_type_for(action_id: String) -> String:
	return str(effect_for(action_id).get("type", ""))


static func effect_status_id_for(action_id: String, fallback: String = "") -> String:
	var status_id := str(effect_for(action_id).get("statusId", ""))
	return status_id if status_id != "" else fallback


static func effect_status_turns_for(action_id: String, fallback: int = 0) -> int:
	var effect := effect_for(action_id)
	if effect.has("statusTurns"):
		return maxi(1, int(effect.get("statusTurns", fallback)))
	return fallback


static func effect_status_potency_for(action_id: String, base_amount: int = 0, fallback: int = 0) -> int:
	var effect := effect_for(action_id)
	if effect.has("statusPotency"):
		return maxi(0, int(effect.get("statusPotency", fallback)))
	if effect.has("statusPotencyRatio"):
		return maxi(0, int(ceil(float(base_amount) * float(effect.get("statusPotencyRatio", 0.0)))))
	return fallback


static func effect_status_hit_rate_for(action_id: String, fallback: float = 1.0) -> float:
	var effect := effect_for(action_id)
	if effect.has("statusHitRate"):
		return clampf(float(effect.get("statusHitRate", fallback)), 0.0, 1.0)
	return fallback


static func effect_status_ids_for(action_id: String) -> Array[String]:
	var result: Array[String] = []
	var raw_ids = effect_for(action_id).get("statusIds", [])
	if raw_ids is Array:
		for value in raw_ids:
			var status_id := str(value)
			if status_id != "":
				result.append(status_id)
	return result


static func effect_field_effect_id_for(action_id: String, fallback: String = "") -> String:
	var effect := effect_for(action_id)
	var field_effect_id := str(effect.get("fieldEffectId", ""))
	return field_effect_id if field_effect_id != "" else fallback


static func effect_element_for(action_id: String, fallback: String = "") -> String:
	var effect := effect_for(action_id)
	var element := str(effect.get("element", ""))
	return element if element != "" else fallback


static func effect_modifier_for(action_id: String, fallback: int = 0) -> int:
	var effect := effect_for(action_id)
	if effect.has("modifier"):
		return int(effect.get("modifier", fallback))
	return fallback


static func effect_turns_for(action_id: String, fallback: int = 1) -> int:
	var effect := effect_for(action_id)
	if effect.has("turns"):
		return maxi(1, int(effect.get("turns", fallback)))
	return fallback


static func effect_for(action_id: String) -> Dictionary:
	var action := action_by_id(action_id)
	if action.is_empty():
		return {}
	var effect = action.get("effect", {})
	return effect as Dictionary if effect is Dictionary else {}


static func target_rule_for(action_id: String) -> Dictionary:
	var action := action_by_id(action_id)
	if action.is_empty():
		return {}
	var target = action.get("target", {})
	return target as Dictionary if target is Dictionary else {}


static func action_is_all(action_id: String) -> bool:
	return bool(target_rule_for(action_id).get("isAll", false))


static func action_requires_selection(action_id: String) -> bool:
	return bool(target_rule_for(action_id).get("requiresSelection", false))


static func action_can_target_side(action_id: String, side: String) -> bool:
	var target := target_rule_for(action_id)
	if side == SIDE_ALLY:
		return bool(target.get("canTargetAlly", false))
	if side == SIDE_ENEMY:
		return bool(target.get("canTargetEnemy", false))
	return false


static func action_self_only(action_id: String) -> bool:
	return bool(target_rule_for(action_id).get("selfOnly", false))


static func target_mode_for(action_id: String) -> String:
	var mode := str(target_rule_for(action_id).get("targetMode", ""))
	return mode if mode != "" else TARGET_MODE_SINGLE


static func target_min_count_for(action_id: String, fallback: int = 1) -> int:
	var target := target_rule_for(action_id)
	if target.has("minTargets"):
		return maxi(1, int(target.get("minTargets", fallback)))
	return fallback


static func target_max_count_for(action_id: String, fallback: int = 1) -> int:
	var target := target_rule_for(action_id)
	if target.has("maxTargets"):
		return maxi(target_min_count_for(action_id, fallback), int(target.get("maxTargets", fallback)))
	return fallback


static func effect_allows_dodge(action_id: String, fallback: bool = true) -> bool:
	var effect := effect_for(action_id)
	if effect.has("canDodge"):
		return bool(effect.get("canDodge", fallback))
	return fallback


static func effect_allows_critical(action_id: String, fallback: bool = true) -> bool:
	var effect := effect_for(action_id)
	if effect.has("canCritical"):
		return bool(effect.get("canCritical", fallback))
	return fallback


static func effect_allows_counter(action_id: String, fallback: bool = true) -> bool:
	var effect := effect_for(action_id)
	if effect.has("canCounter"):
		return bool(effect.get("canCounter", fallback))
	return fallback


static func pet_skill_action_for_slot(slot: int) -> Dictionary:
	for action in actions_by_owner(OWNER_PET_SKILL):
		if int(action.get("slot", 0)) == slot:
			return action
	return {}


static func pet_skill_label_for_slot(slot: int, fallback: String = "") -> String:
	var action := pet_skill_action_for_slot(slot)
	if action.is_empty():
		return fallback
	return str(action.get("label", fallback))


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var loaded_catalog := catalog()
	if loaded_catalog.is_empty():
		errors.append("battle_actions.json 缺失或不是 JSON 对象")
		return errors

	var raw_actions: Array = loaded_catalog.get("actions", [])
	if raw_actions.is_empty():
		errors.append("actions 不能为空")
		return errors

	var max_pet_slots := int(loaded_catalog.get("maxPetSkillSlots", MAX_PET_SKILL_SLOTS_FALLBACK))
	if max_pet_slots != MAX_PET_SKILL_SLOTS_FALLBACK:
		errors.append("maxPetSkillSlots 当前必须是 %d" % MAX_PET_SKILL_SLOTS_FALLBACK)

	var seen_ids := {}
	var seen_pet_slots := {}
	for index in range(raw_actions.size()):
		var action = raw_actions[index]
		if not (action is Dictionary):
			errors.append("actions[%d] 不是对象" % index)
			continue
		_validate_action(action as Dictionary, index, max_pet_slots, seen_ids, seen_pet_slots, errors)
	_validate_required_actions(seen_ids, errors)
	return errors


static func _validate_action(action: Dictionary, index: int, max_pet_slots: int, seen_ids: Dictionary, seen_pet_slots: Dictionary, errors: Array[String]) -> void:
	var action_id := str(action.get("id", ""))
	if action_id == "":
		errors.append("actions[%d].id 不能为空" % index)
	elif seen_ids.has(action_id):
		errors.append("action id 重复: %s" % action_id)
	else:
		seen_ids[action_id] = true

	if str(action.get("label", "")) == "":
		errors.append("%s.label 不能为空" % _action_name(action, index))

	var owner := str(action.get("owner", ""))
	if not [OWNER_PLAYER, OWNER_SPIRIT, OWNER_PET_SKILL, OWNER_ITEM, OWNER_EQUIPMENT_ACTION].has(owner):
		errors.append("%s.owner 无效: %s" % [_action_name(action, index), owner])

	var target = action.get("target", null)
	if not (target is Dictionary):
		errors.append("%s.target 必须是对象" % _action_name(action, index))
	else:
		_validate_target_rule(action, target as Dictionary, errors)

	var effect = action.get("effect", null)
	if not (effect is Dictionary):
		errors.append("%s.effect 必须是对象" % _action_name(action, index))
	else:
		_validate_effect(action, effect as Dictionary, errors)

	if owner == OWNER_PET_SKILL:
		_validate_pet_skill_slot(action, max_pet_slots, seen_pet_slots, errors)


static func _validate_target_rule(action: Dictionary, target: Dictionary, errors: Array[String]) -> void:
	var action_name := _action_name(action, -1)
	for key in ["isAll", "canTargetAlly", "canTargetEnemy", "requiresSelection", "selfOnly"]:
		if not target.has(key):
			errors.append("%s.target.%s 缺失" % [action_name, key])
		elif typeof(target.get(key)) != TYPE_BOOL:
			errors.append("%s.target.%s 必须是布尔值" % [action_name, key])

	var is_all := bool(target.get("isAll", false))
	var can_ally := bool(target.get("canTargetAlly", false))
	var can_enemy := bool(target.get("canTargetEnemy", false))
	var requires_selection := bool(target.get("requiresSelection", false))
	var self_only := bool(target.get("selfOnly", false))
	if is_all and requires_selection:
		errors.append("%s 不能既是全体又要求单体点选" % action_name)
	if is_all and not (can_ally or can_enemy):
		errors.append("%s 全体目标必须至少允许我方或敌方一侧" % action_name)
	if requires_selection and not (can_ally or can_enemy):
		errors.append("%s 需要点选时必须至少允许一侧目标" % action_name)
	if self_only and (is_all or can_enemy or requires_selection):
		errors.append("%s selfOnly 只能是我方非全体且不点选" % action_name)
	var target_mode := str(target.get("targetMode", ""))
	if target.has("targetMode") and typeof(target.get("targetMode")) != TYPE_STRING:
		errors.append("%s.target.targetMode 必须是字符串" % action_name)
	if target_mode == TARGET_MODE_ENEMY_RANDOM_RANGE:
		if not can_enemy or requires_selection:
			errors.append("%s.target enemy_random_range 必须是不点选敌方目标" % action_name)
		if not target.has("minTargets") or not target.has("maxTargets"):
			errors.append("%s.target 需要 minTargets/maxTargets" % action_name)
		else:
			var min_targets := int(target.get("minTargets", 0))
			var max_targets := int(target.get("maxTargets", 0))
			if min_targets < 1 or max_targets < min_targets:
				errors.append("%s.target 需要有效 minTargets/maxTargets" % action_name)
	if target_mode == TARGET_MODE_BATTLEFIELD and (can_ally or can_enemy or requires_selection or self_only):
		errors.append("%s.target battlefield 不能要求单位目标" % action_name)


static func _validate_effect(action: Dictionary, effect: Dictionary, errors: Array[String]) -> void:
	var effect_type := str(effect.get("type", ""))
	if effect_type == "":
		errors.append("%s.effect.type 不能为空" % _action_name(action, -1))
	if not ["damage", "heal", "poison", "status", "cleanse", "defend", "capture", "field_effect"].has(effect_type):
		errors.append("%s.effect.type 无效: %s" % [_action_name(action, -1), effect_type])
	if ["heal", "poison"].has(effect_type) and not effect.has("amount"):
		errors.append("%s.%s 必须配置 amount" % [_action_name(action, -1), effect_type])
	if effect.has("amount") and typeof(effect.get("amount")) != TYPE_FLOAT and typeof(effect.get("amount")) != TYPE_INT:
		errors.append("%s.effect.amount 必须是数字" % _action_name(action, -1))
	if effect.has("amountBonus") and typeof(effect.get("amountBonus")) != TYPE_FLOAT and typeof(effect.get("amountBonus")) != TYPE_INT:
		errors.append("%s.effect.amountBonus 必须是数字" % _action_name(action, -1))
	if effect.has("powerMultiplier") and typeof(effect.get("powerMultiplier")) != TYPE_FLOAT and typeof(effect.get("powerMultiplier")) != TYPE_INT:
		errors.append("%s.effect.powerMultiplier 必须是数字" % _action_name(action, -1))
	if effect.has("criticalDamageMultiplier") and typeof(effect.get("criticalDamageMultiplier")) != TYPE_FLOAT and typeof(effect.get("criticalDamageMultiplier")) != TYPE_INT:
		errors.append("%s.effect.criticalDamageMultiplier 必须是数字" % _action_name(action, -1))
	if ["poison", "status"].has(effect_type):
		_validate_status_effect(action, effect, errors)
	if effect_type == "cleanse":
		_validate_cleanse_effect(action, effect, errors)
	if effect_type == "field_effect":
		_validate_field_effect(action, effect, errors)


static func _validate_field_effect(action: Dictionary, effect: Dictionary, errors: Array[String]) -> void:
	var action_name := _action_name(action, -1)
	if str(effect.get("fieldEffectId", "")) == "":
		errors.append("%s.effect.fieldEffectId 不能为空" % action_name)
	if not ["fire", "water", "earth", "wind"].has(str(effect.get("element", ""))):
		errors.append("%s.effect.element 无效: %s" % [action_name, str(effect.get("element", ""))])
	if not effect.has("turns") or typeof(effect.get("turns")) != TYPE_FLOAT and typeof(effect.get("turns")) != TYPE_INT or int(effect.get("turns", 0)) <= 0:
		errors.append("%s.effect.turns 必须是正数" % action_name)


static func _validate_status_effect(action: Dictionary, effect: Dictionary, errors: Array[String]) -> void:
	var action_name := _action_name(action, -1)
	var status_id := str(effect.get("statusId", ""))
	if not ["poison", "sleep", "confusion", "stone"].has(status_id):
		errors.append("%s.effect.statusId 无效: %s" % [action_name, status_id])
	if not effect.has("statusTurns") or typeof(effect.get("statusTurns")) != TYPE_FLOAT and typeof(effect.get("statusTurns")) != TYPE_INT or int(effect.get("statusTurns", 0)) <= 0:
		errors.append("%s.effect.statusTurns 必须是正数" % action_name)
	if effect.has("statusPotency") and typeof(effect.get("statusPotency")) != TYPE_FLOAT and typeof(effect.get("statusPotency")) != TYPE_INT:
		errors.append("%s.effect.statusPotency 必须是数字" % action_name)
	if effect.has("statusPotencyRatio") and typeof(effect.get("statusPotencyRatio")) != TYPE_FLOAT and typeof(effect.get("statusPotencyRatio")) != TYPE_INT:
		errors.append("%s.effect.statusPotencyRatio 必须是数字" % action_name)
	if effect.has("statusHitRate"):
		var hit_rate_type := typeof(effect.get("statusHitRate"))
		if hit_rate_type != TYPE_FLOAT and hit_rate_type != TYPE_INT:
			errors.append("%s.effect.statusHitRate 必须是数字" % action_name)
		else:
			var hit_rate := float(effect.get("statusHitRate", 0.0))
			if hit_rate < 0.0 or hit_rate > 1.0:
				errors.append("%s.effect.statusHitRate 必须在 0 到 1 之间" % action_name)


static func _validate_cleanse_effect(action: Dictionary, effect: Dictionary, errors: Array[String]) -> void:
	var action_name := _action_name(action, -1)
	var raw_ids = effect.get("statusIds", [])
	if not (raw_ids is Array) or (raw_ids as Array).is_empty():
		errors.append("%s.effect.statusIds 必须是非空数组" % action_name)
		return
	for value in (raw_ids as Array):
		var status_id := str(value)
		if not ["poison", "sleep", "confusion", "stone"].has(status_id):
			errors.append("%s.effect.statusIds 包含无效状态: %s" % [action_name, status_id])


static func _validate_pet_skill_slot(action: Dictionary, max_pet_slots: int, seen_pet_slots: Dictionary, errors: Array[String]) -> void:
	var slot := int(action.get("slot", 0))
	if slot < 1 or slot > max_pet_slots:
		errors.append("%s.slot 必须在 1-%d 之间" % [_action_name(action, -1), max_pet_slots])
		return
	if seen_pet_slots.has(slot):
		errors.append("宠物技能槽重复: 技%d" % slot)
	else:
		seen_pet_slots[slot] = true


static func _validate_required_actions(seen_ids: Dictionary, errors: Array[String]) -> void:
	for required_id in [
		"spirit_grace_1",
		"spirit_moist_1",
		"spirit_poison_1",
		"spirit_poison_mist_1",
		"spirit_grace_5",
		"spirit_moist_5",
		"spirit_moist_6",
		"spirit_poison_5",
		"spirit_poison_mist_5",
		"pet_attack",
		"pet_defend",
		"pet_bui_charge",
		"pet_sleep_powder",
		"pet_confuse_cry",
		"pet_stone_gaze",
		"pet_focus_bite",
		"item_meat_small",
		"item_heal_all_5",
		"item_heal_single_5",
		"item_poison_single_5",
		"item_poison_all_5",
		"item_cleanse_single_5",
		"weapon_shadow_group_shot",
	]:
		if not seen_ids.has(required_id):
			errors.append("缺少当前战斗需要的动作: %s" % required_id)


static func _action_name(action: Dictionary, index: int) -> String:
	var action_id := str(action.get("id", ""))
	if action_id != "":
		return action_id
	if index >= 0:
		return "actions[%d]" % index
	return "未命名动作"
