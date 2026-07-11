extends RefCounted

const CaptureToolCatalog := preload("res://scripts/battle/capture_tool_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const SETTINGS_KEY := "autoCaptureSettings"

const ENABLED_KEY := "enabled"
const TARGET_MODE_KEY := "targetMode"
const TARGET_FORM_ID_KEY := "targetFormId"
const TARGET_MANUAL_TEXT_KEY := "targetManualText"
const HP_PERCENT_KEY := "hpPercent"
const LEVEL_COMPARATOR_KEY := "levelComparator"
const LEVEL_VALUE_KEY := "levelValue"
const PREFERRED_TOOL_ID_KEY := "preferredToolId"
const NO_TARGET_ACTION_KEY := "noTargetAction"
const CAPTURE_PET_SLOT_KEY := "capturePetSkillSlot"
const AUTO_DISCARD_LOW_POWER_KEY := "autoDiscardLowPower"
const LOW_POWER_THRESHOLD_KEY := "lowPowerThreshold"

const TARGET_ALL := "all"
const TARGET_CODEX := "codex"

const NO_TARGET_BATTLE := "battle"
const NO_TARGET_ESCAPE := "escape"

const COMPARATOR_LT := "<"
const COMPARATOR_EQ := "="
const COMPARATOR_GT := ">"

const MIN_HP_PERCENT := 1
const MAX_HP_PERCENT := 100
const MIN_LEVEL := 1
const MAX_LEVEL := 999
const MIN_PET_SKILL_SLOT := 1
const MAX_PET_SKILL_SLOT := 7
const DEFAULT_CAPTURE_PET_SLOT := 2
const MIN_POWER := 0
const MAX_POWER := 9999
const DEFAULT_LOW_POWER_THRESHOLD := 31


static func default_settings() -> Dictionary:
	return {
		ENABLED_KEY: false,
		TARGET_MODE_KEY: TARGET_ALL,
		TARGET_FORM_ID_KEY: "",
		TARGET_MANUAL_TEXT_KEY: "",
		HP_PERCENT_KEY: MAX_HP_PERCENT,
		LEVEL_COMPARATOR_KEY: COMPARATOR_EQ,
		LEVEL_VALUE_KEY: MIN_LEVEL,
		PREFERRED_TOOL_ID_KEY: CaptureToolCatalog.EMPTY_HAND_ID,
		NO_TARGET_ACTION_KEY: NO_TARGET_ESCAPE,
		CAPTURE_PET_SLOT_KEY: DEFAULT_CAPTURE_PET_SLOT,
		AUTO_DISCARD_LOW_POWER_KEY: false,
		LOW_POWER_THRESHOLD_KEY: DEFAULT_LOW_POWER_THRESHOLD,
	}


static func normalize_settings(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var normalized := default_settings()
	normalized[ENABLED_KEY] = bool(raw.get(ENABLED_KEY, normalized[ENABLED_KEY]))
	normalized[TARGET_MODE_KEY] = normalized_target_mode(str(raw.get(TARGET_MODE_KEY, normalized[TARGET_MODE_KEY])))
	normalized[TARGET_FORM_ID_KEY] = normalized_form_id(str(raw.get(TARGET_FORM_ID_KEY, normalized[TARGET_FORM_ID_KEY])))
	normalized[TARGET_MANUAL_TEXT_KEY] = clean_manual_text(str(raw.get(TARGET_MANUAL_TEXT_KEY, normalized[TARGET_MANUAL_TEXT_KEY])))
	normalized[HP_PERCENT_KEY] = clampi(int(raw.get(HP_PERCENT_KEY, normalized[HP_PERCENT_KEY])), MIN_HP_PERCENT, MAX_HP_PERCENT)
	normalized[LEVEL_COMPARATOR_KEY] = normalized_level_comparator(str(raw.get(LEVEL_COMPARATOR_KEY, normalized[LEVEL_COMPARATOR_KEY])))
	normalized[LEVEL_VALUE_KEY] = clampi(int(raw.get(LEVEL_VALUE_KEY, normalized[LEVEL_VALUE_KEY])), MIN_LEVEL, MAX_LEVEL)
	normalized[PREFERRED_TOOL_ID_KEY] = CaptureToolCatalog.normalized_tool_id(str(raw.get(PREFERRED_TOOL_ID_KEY, normalized[PREFERRED_TOOL_ID_KEY])))
	normalized[NO_TARGET_ACTION_KEY] = normalized_no_target_action(str(raw.get(NO_TARGET_ACTION_KEY, normalized[NO_TARGET_ACTION_KEY])))
	normalized[CAPTURE_PET_SLOT_KEY] = normalized_pet_skill_slot(raw.get(CAPTURE_PET_SLOT_KEY, normalized[CAPTURE_PET_SLOT_KEY]))
	normalized[AUTO_DISCARD_LOW_POWER_KEY] = bool(raw.get(AUTO_DISCARD_LOW_POWER_KEY, normalized[AUTO_DISCARD_LOW_POWER_KEY]))
	normalized[LOW_POWER_THRESHOLD_KEY] = clampi(int(raw.get(LOW_POWER_THRESHOLD_KEY, normalized[LOW_POWER_THRESHOLD_KEY])), MIN_POWER, MAX_POWER)
	return normalized


static func normalized_target_mode(mode_id: String) -> String:
	var normalized_id := mode_id.strip_edges()
	for option in target_mode_options():
		if str(option.get("id", "")) == normalized_id:
			return normalized_id
	return TARGET_ALL


static func normalized_form_id(form_id: String) -> String:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "":
		return ""
	if PetTemplateCatalog.form_by_id(normalized_id).is_empty():
		return ""
	return normalized_id


static func normalized_level_comparator(value: String) -> String:
	var comparator := value.strip_edges()
	if comparator == COMPARATOR_LT or comparator == COMPARATOR_EQ or comparator == COMPARATOR_GT:
		return comparator
	return COMPARATOR_EQ


static func normalized_no_target_action(value: String) -> String:
	var action := value.strip_edges()
	for option in no_target_action_options():
		if str(option.get("id", "")) == action:
			return action
	return NO_TARGET_ESCAPE


static func normalized_pet_skill_slot(value) -> int:
	return clampi(int(value), MIN_PET_SKILL_SLOT, MAX_PET_SKILL_SLOT)


static func clean_manual_text(value: String) -> String:
	var result := value.replace("\r", "").replace("\n", "").replace("\t", " ").strip_edges()
	while result.find("  ") >= 0:
		result = result.replace("  ", " ")
	return result.left(24)


static func level_matches(level: int, comparator: String, target_level: int) -> bool:
	var normalized_level := maxi(MIN_LEVEL, level)
	var normalized_target := clampi(target_level, MIN_LEVEL, MAX_LEVEL)
	match normalized_level_comparator(comparator):
		COMPARATOR_LT:
			return normalized_level < normalized_target
		COMPARATOR_GT:
			return normalized_level > normalized_target
		_:
			return normalized_level == normalized_target


static func target_mode_options() -> Array[Dictionary]:
	return [
		{"id": TARGET_ALL, "label": "全部"},
		{"id": TARGET_CODEX, "label": "指定图鉴宠物"},
	]


static func level_comparator_options() -> Array[Dictionary]:
	return [
		{"id": COMPARATOR_EQ, "label": "="},
		{"id": COMPARATOR_GT, "label": ">"},
		{"id": COMPARATOR_LT, "label": "<"},
	]


static func capture_tool_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = []
	for tool_id in CaptureToolCatalog.tool_ids_by_power(false):
		options.append({
			"id": tool_id,
			"label": CaptureToolCatalog.menu_label_for(tool_id),
		})
	return options


static func no_target_action_options() -> Array[Dictionary]:
	return [
		{"id": NO_TARGET_BATTLE, "label": "战斗"},
		{"id": NO_TARGET_ESCAPE, "label": "逃跑"},
	]
