extends RefCounted

const BattleActionCatalog := preload("res://scripts/battle/battle_action_catalog.gd")

const SETTINGS_KEY := "autoBattleSettings"

const ACTION_ATTACK := "attack"
const ACTION_DEFEND := "defend"
const ACTION_SPIRIT_GRACE_1 := "spirit_grace_1"
const ACTION_SPIRIT_MOIST_1 := "spirit_moist_1"
const ACTION_SPIRIT_POISON_1 := "spirit_poison_1"
const ACTION_SPIRIT_POISON_ALL_1 := "spirit_poison_mist_1"
const ACTION_SPIRIT_GRACE := "spirit_grace_5"
const ACTION_SPIRIT_MOIST := "spirit_moist_5"
const ACTION_SPIRIT_MOIST_6 := "spirit_moist_6"
const ACTION_SPIRIT_POISON := "spirit_poison_5"
const ACTION_SPIRIT_POISON_ALL := "spirit_poison_mist_5"
const ACTION_ITEM_MEAT := "item_meat_small"
const ACTION_ITEM_HEAL_SINGLE := "item_heal_single_5"
const ACTION_ITEM_HEAL_ALL := "item_heal_all_5"
const ACTION_ITEM_POISON := "item_poison_single_5"
const ACTION_ITEM_POISON_ALL := "item_poison_all_5"
const ACTION_ITEM_CLEANSE := "item_cleanse_single_5"

const TARGET_FIRST_LIVING := "first_living"
const TARGET_LOWEST_HP := "lowest_hp"
const TARGET_LOWEST_HP_PERCENT := "lowest_hp_percent"

const HEAL_NONE := "none"
const HEAL_SPIRIT_MOIST_1 := ACTION_SPIRIT_MOIST_1
const HEAL_SPIRIT_MOIST := ACTION_SPIRIT_MOIST
const HEAL_SPIRIT_MOIST_6 := ACTION_SPIRIT_MOIST_6
const HEAL_SPIRIT_GRACE_1 := ACTION_SPIRIT_GRACE_1
const HEAL_SPIRIT_GRACE := ACTION_SPIRIT_GRACE
const HEAL_ITEM_MEAT := ACTION_ITEM_MEAT
const HEAL_ITEM_HEAL_SINGLE := ACTION_ITEM_HEAL_SINGLE
const HEAL_ITEM_HEAL_ALL := ACTION_ITEM_HEAL_ALL

const PLAYER_FIRST_ROUND_ACTION_KEY := "playerFirstRoundAction"
const PLAYER_NORMAL_ACTION_KEY := "playerNormalAction"
const PET_FIRST_ROUND_SLOT_KEY := "petFirstRoundSlot"
const PET_NORMAL_SLOT_KEY := "petNormalSlot"
const TARGET_MODE_KEY := "targetMode"
const HEALING_ENABLED_KEY := "healingEnabled"
const PLAYER_HP_PERCENT_KEY := "playerHpPercent"
const PET_HP_PERCENT_KEY := "petHpPercent"
const HEAL_PRIORITY_KEY := "healPriority"

const MIN_HP_PERCENT := 1
const MAX_HP_PERCENT := 100
const MAX_HEAL_PRIORITY_SLOTS := 5
const MIN_PET_SKILL_SLOT := 1
const MAX_PET_SKILL_SLOT := 7


static func default_settings() -> Dictionary:
	return {
		PLAYER_FIRST_ROUND_ACTION_KEY: ACTION_ATTACK,
		PLAYER_NORMAL_ACTION_KEY: ACTION_ATTACK,
		PET_FIRST_ROUND_SLOT_KEY: 1,
		PET_NORMAL_SLOT_KEY: 1,
		TARGET_MODE_KEY: TARGET_FIRST_LIVING,
		HEALING_ENABLED_KEY: true,
		PLAYER_HP_PERCENT_KEY: 45,
		PET_HP_PERCENT_KEY: 45,
		HEAL_PRIORITY_KEY: [
			HEAL_SPIRIT_MOIST_1,
			HEAL_ITEM_MEAT,
			HEAL_ITEM_HEAL_SINGLE,
			HEAL_SPIRIT_GRACE_1,
			HEAL_ITEM_HEAL_ALL,
		],
	}


static func normalize_settings(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var normalized := default_settings()
	normalized[PLAYER_FIRST_ROUND_ACTION_KEY] = normalized_player_action_id(str(raw.get(PLAYER_FIRST_ROUND_ACTION_KEY, normalized[PLAYER_FIRST_ROUND_ACTION_KEY])))
	normalized[PLAYER_NORMAL_ACTION_KEY] = normalized_player_action_id(str(raw.get(PLAYER_NORMAL_ACTION_KEY, normalized[PLAYER_NORMAL_ACTION_KEY])))
	normalized[PET_FIRST_ROUND_SLOT_KEY] = normalized_pet_skill_slot(raw.get(PET_FIRST_ROUND_SLOT_KEY, normalized[PET_FIRST_ROUND_SLOT_KEY]))
	normalized[PET_NORMAL_SLOT_KEY] = normalized_pet_skill_slot(raw.get(PET_NORMAL_SLOT_KEY, normalized[PET_NORMAL_SLOT_KEY]))
	normalized[TARGET_MODE_KEY] = normalized_target_mode(str(raw.get(TARGET_MODE_KEY, normalized[TARGET_MODE_KEY])))
	normalized[HEALING_ENABLED_KEY] = bool(raw.get(HEALING_ENABLED_KEY, normalized[HEALING_ENABLED_KEY]))
	normalized[PLAYER_HP_PERCENT_KEY] = clampi(int(raw.get(PLAYER_HP_PERCENT_KEY, normalized[PLAYER_HP_PERCENT_KEY])), MIN_HP_PERCENT, MAX_HP_PERCENT)
	normalized[PET_HP_PERCENT_KEY] = clampi(int(raw.get(PET_HP_PERCENT_KEY, normalized[PET_HP_PERCENT_KEY])), MIN_HP_PERCENT, MAX_HP_PERCENT)
	normalized[HEAL_PRIORITY_KEY] = normalized_heal_priority(raw.get(HEAL_PRIORITY_KEY, normalized[HEAL_PRIORITY_KEY]))
	return normalized


static func normalize_settings_for_available_spirits(value, available_spirit_ids: Array[String]) -> Dictionary:
	var normalized := normalize_settings(value)
	var available := _unique_string_array(available_spirit_ids)
	for key in [PLAYER_FIRST_ROUND_ACTION_KEY, PLAYER_NORMAL_ACTION_KEY]:
		var action_id := str(normalized.get(key, ACTION_ATTACK))
		if _is_spirit_action(action_id) and not available.has(action_id):
			normalized[key] = ACTION_ATTACK
	normalized[HEAL_PRIORITY_KEY] = _heal_priority_for_available_spirits(normalized.get(HEAL_PRIORITY_KEY, []), available)
	return normalized


static func normalized_player_action_id(action_id: String) -> String:
	var normalized_id := action_id.strip_edges()
	for option in player_action_options():
		if str(option.get("id", "")) == normalized_id:
			return normalized_id
	var action := BattleActionCatalog.action_by_id(normalized_id)
	if not action.is_empty() and str(action.get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT:
		return normalized_id
	return ACTION_ATTACK


static func normalized_pet_skill_slot(value) -> int:
	return clampi(int(value), MIN_PET_SKILL_SLOT, MAX_PET_SKILL_SLOT)


static func normalized_target_mode(mode_id: String) -> String:
	var normalized_id := mode_id.strip_edges()
	for option in target_mode_options():
		if str(option.get("id", "")) == normalized_id:
			return normalized_id
	return TARGET_FIRST_LIVING


static func normalized_heal_source(source_id: String) -> String:
	var normalized_id := source_id.strip_edges()
	for option in heal_source_options():
		if str(option.get("id", "")) == normalized_id:
			return normalized_id
	var action := BattleActionCatalog.action_by_id(normalized_id)
	if (
		not action.is_empty()
		and str(action.get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT
		and BattleActionCatalog.effect_type_for(normalized_id) == "heal"
	):
		return normalized_id
	return HEAL_NONE


static func normalized_heal_priority(value) -> Array[String]:
	var raw_values: Array = value if value is Array else []
	var result: Array[String] = []
	for raw_source in raw_values:
		var source_id := normalized_heal_source(str(raw_source))
		if source_id == HEAL_NONE:
			continue
		if result.has(source_id):
			continue
		result.append(source_id)
		if result.size() >= MAX_HEAL_PRIORITY_SLOTS:
			return result
	for source_id in default_settings().get(HEAL_PRIORITY_KEY, []):
		var normalized_source := normalized_heal_source(str(source_id))
		if normalized_source != HEAL_NONE and not result.has(normalized_source):
			result.append(normalized_source)
		if result.size() >= MAX_HEAL_PRIORITY_SLOTS:
			break
	return result


static func _heal_priority_for_available_spirits(value, available_spirit_ids: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for source_id in normalized_heal_priority(value):
		var normalized_source := normalized_heal_source(str(source_id))
		if _heal_source_allowed_for_available_spirits(normalized_source, available_spirit_ids) and not result.has(normalized_source):
			result.append(normalized_source)
		if result.size() >= MAX_HEAL_PRIORITY_SLOTS:
			return result
	for source_id in default_settings().get(HEAL_PRIORITY_KEY, []):
		var normalized_source := normalized_heal_source(str(source_id))
		if _heal_source_allowed_for_available_spirits(normalized_source, available_spirit_ids) and not result.has(normalized_source):
			result.append(normalized_source)
		if result.size() >= MAX_HEAL_PRIORITY_SLOTS:
			break
	if result.is_empty():
		result.append(HEAL_ITEM_MEAT)
	return result


static func _heal_source_allowed_for_available_spirits(source_id: String, available_spirit_ids: Array[String]) -> bool:
	if source_id == HEAL_NONE:
		return false
	if _is_spirit_action(source_id):
		return available_spirit_ids.has(source_id)
	return normalized_heal_source(source_id) != HEAL_NONE


static func _is_spirit_action(action_id: String) -> bool:
	var action := BattleActionCatalog.action_by_id(action_id)
	return not action.is_empty() and str(action.get("owner", "")) == BattleActionCatalog.OWNER_SPIRIT


static func _unique_string_array(values: Array[String]) -> Array[String]:
	var result: Array[String] = []
	for value in values:
		var text := str(value)
		if text != "" and not result.has(text):
			result.append(text)
	return result


static func player_action_options() -> Array[Dictionary]:
	return [
		{"id": ACTION_ATTACK, "label": "攻击"},
		{"id": ACTION_DEFEND, "label": "防御"},
		{"id": ACTION_SPIRIT_GRACE_1, "label": "恩惠精灵1"},
		{"id": ACTION_SPIRIT_MOIST_1, "label": "滋润精灵1"},
		{"id": ACTION_SPIRIT_POISON_1, "label": "毒精灵1"},
		{"id": ACTION_SPIRIT_POISON_ALL_1, "label": "毒雾精灵1"},
		{"id": ACTION_SPIRIT_GRACE, "label": "恩惠精灵5"},
		{"id": ACTION_SPIRIT_MOIST, "label": "滋润精灵5"},
		{"id": ACTION_SPIRIT_MOIST_6, "label": "滋润精灵6"},
		{"id": ACTION_SPIRIT_POISON, "label": "毒精灵5"},
		{"id": ACTION_SPIRIT_POISON_ALL, "label": "毒雾精灵5"},
		{"id": ACTION_ITEM_MEAT, "label": "肉"},
		{"id": ACTION_ITEM_HEAL_SINGLE, "label": "回复药5"},
		{"id": ACTION_ITEM_HEAL_ALL, "label": "群体草药5"},
		{"id": ACTION_ITEM_POISON, "label": "毒粉5"},
		{"id": ACTION_ITEM_POISON_ALL, "label": "毒雾粉5"},
		{"id": ACTION_ITEM_CLEANSE, "label": "净化草5"},
	]


static func target_mode_options() -> Array[Dictionary]:
	return [
		{"id": TARGET_FIRST_LIVING, "label": "第一个活着"},
		{"id": TARGET_LOWEST_HP_PERCENT, "label": "生命比例最低"},
		{"id": TARGET_LOWEST_HP, "label": "当前生命最低"},
	]


static func heal_source_options() -> Array[Dictionary]:
	return [
		{"id": HEAL_NONE, "label": "无"},
		{"id": HEAL_SPIRIT_MOIST_1, "label": "滋润精灵1"},
		{"id": HEAL_SPIRIT_MOIST, "label": "滋润精灵5"},
		{"id": HEAL_SPIRIT_MOIST_6, "label": "滋润精灵6"},
		{"id": HEAL_ITEM_MEAT, "label": "肉"},
		{"id": HEAL_ITEM_HEAL_SINGLE, "label": "回复药5"},
		{"id": HEAL_SPIRIT_GRACE_1, "label": "恩惠精灵1"},
		{"id": HEAL_SPIRIT_GRACE, "label": "恩惠精灵5"},
		{"id": HEAL_ITEM_HEAL_ALL, "label": "群体草药5"},
	]


static func option_label(options: Array[Dictionary], option_id: String, fallback: String = "") -> String:
	for option in options:
		if str(option.get("id", "")) == option_id:
			var label := str(option.get("label", ""))
			return label if label != "" else fallback
	return fallback


static func player_action_label(action_id: String) -> String:
	return option_label(player_action_options(), normalized_player_action_id(action_id), "攻击")


static func target_mode_label(mode_id: String) -> String:
	return option_label(target_mode_options(), normalized_target_mode(mode_id), "第一个活着")


static func heal_source_label(source_id: String) -> String:
	return option_label(heal_source_options(), normalized_heal_source(source_id), "无")
