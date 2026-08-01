extends RefCounted

const CharacterRosterModel := preload(
	"res://scripts/progression/character_roster_model.gd"
)
const CharacterNamePolicyModel := preload(
	"res://scripts/progression/character_name_policy_model.gd"
)
const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)

const SCHEMA_VERSION := 1
const TOTAL_ELEMENT_POINTS := 10
const MAX_ACTIVE_ELEMENTS := 2
const ELEMENT_KEYS := ["earth", "water", "fire", "wind"]
const ELEMENT_NAMES := {
	"earth": "地",
	"water": "水",
	"fire": "火",
	"wind": "风",
}

static func empty_elements() -> Dictionary:
	return {
		"earth": 0,
		"water": 0,
		"fire": 0,
		"wind": 0,
	}


static func normalize_elements(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var result := empty_elements()
	for key in ELEMENT_KEYS:
		result[key] = clampi(int(raw.get(key, 0)), 0, TOTAL_ELEMENT_POINTS)
	return result


static func element_total(value) -> int:
	var elements := normalize_elements(value)
	var total := 0
	for key in ELEMENT_KEYS:
		total += int(elements.get(key, 0))
	return total


static func active_element_keys(value) -> Array[String]:
	var elements := normalize_elements(value)
	var result: Array[String] = []
	for key in ELEMENT_KEYS:
		if int(elements.get(key, 0)) > 0:
			result.append(key)
	return result


static func remaining_points(value) -> int:
	return maxi(0, TOTAL_ELEMENT_POINTS - element_total(value))


static func element_errors(value, require_complete: bool = true) -> Array[String]:
	var elements := normalize_elements(value)
	var errors: Array[String] = []
	var total := element_total(elements)
	if total > TOTAL_ELEMENT_POINTS:
		errors.append("元素点不能超过%d点" % TOTAL_ELEMENT_POINTS)
	elif require_complete and total != TOTAL_ELEMENT_POINTS:
		errors.append("请分配完全部%d点元素" % TOTAL_ELEMENT_POINTS)
	var active := active_element_keys(elements)
	if active.size() > MAX_ACTIVE_ELEMENTS:
		errors.append("最多只能选择%d种元素" % MAX_ACTIVE_ELEMENTS)
	if int(elements.get("earth", 0)) > 0 and int(elements.get("fire", 0)) > 0:
		errors.append("地与火不能同时分配")
	if int(elements.get("water", 0)) > 0 and int(elements.get("wind", 0)) > 0:
		errors.append("水与风不能同时分配")
	return errors


static func adjust_element(value, key: String, delta: int) -> Dictionary:
	var result := normalize_elements(value)
	if not ELEMENT_KEYS.has(key) or delta == 0:
		return result
	var current := int(result.get(key, 0))
	var target := clampi(current + delta, 0, TOTAL_ELEMENT_POINTS)
	if delta > 0:
		target = mini(target, current + remaining_points(result))
	result[key] = target
	if not element_errors(result, false).is_empty():
		result[key] = current
	return result


static func appearance_name(appearance_id: String) -> String:
	return PlayerAppearanceCatalog.display_name(appearance_id)


static func appearance_is_supported(appearance_id: String) -> bool:
	return PlayerAppearanceCatalog.appearance_ids().has(
		appearance_id.strip_edges()
	)


static func build_create_request(
	slot_index: int,
	raw_name: String,
	appearance_id: String,
	elements_value,
	available_appearance_ids: Array[String] = []
) -> Dictionary:
	var base := CharacterRosterModel.build_create_request(slot_index, raw_name)
	var errors: Array[String] = []
	for error_value in base.get("errors", []):
		errors.append(str(error_value))
	var normalized_appearance_id := appearance_id.strip_edges()
	if not appearance_is_supported(normalized_appearance_id):
		errors.append("请选择可用的人物形象")
	elif (
		not available_appearance_ids.is_empty()
		and not available_appearance_ids.has(normalized_appearance_id)
	):
		errors.append("这个人物形象的美术资源尚未准备完成")
	var elements := normalize_elements(elements_value)
	for error_value in element_errors(elements):
		errors.append(error_value)
	var payload := (
		(base.get("payload", {}) as Dictionary).duplicate(true)
		if base.get("payload", {}) is Dictionary
		else {}
	)
	payload["appearanceId"] = normalized_appearance_id
	payload["elements"] = elements
	return {
		"valid": errors.is_empty(),
		"payload": payload,
		"errors": errors,
	}


static func build_legacy_allocation_request(
	character_value,
	elements_value
) -> Dictionary:
	var character := (
		character_value as Dictionary
		if character_value is Dictionary
		else {}
	)
	var errors: Array[String] = []
	var player_id := str(character.get("playerId", "")).strip_edges()
	if player_id == "":
		errors.append("旧角色资料不完整，请重新登录")
	if not bool(character.get("needsElementAllocation", false)):
		errors.append("这个角色不需要补选元素")
	var elements := normalize_elements(elements_value)
	for error_value in element_errors(elements):
		errors.append(error_value)
	return {
		"valid": errors.is_empty(),
		"payload": {
			"playerId": player_id,
			"elements": elements,
		},
		"errors": errors,
	}


static func random_name(
	rng: RandomNumberGenerator,
	avoid_name: String = ""
) -> String:
	return CharacterNamePolicyModel.generate_random_name(rng, avoid_name)
