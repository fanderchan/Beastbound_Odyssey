extends RefCounted

const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const SCHEMA_VERSION := 1
const MAX_LINE_IDS := 32
const MAX_OWNED_SAME_FORM := 999
const MAX_LEVEL_ONE_STAT := 999999

const ELEMENT_MODE_ANY := "any"
const ELEMENT_MODE_ALL := "all"
const ELEMENT_IDS: Array[String] = ["fire", "water", "earth", "wind"]
const ELEMENT_LABELS := {
	"fire": "火",
	"water": "水",
	"earth": "地",
	"wind": "风",
}
const STAT_IDS: Array[String] = ["maxHp", "attack", "defense", "quick"]
const STAT_LABELS := {
	"maxHp": "生命",
	"attack": "攻击",
	"defense": "防御",
	"quick": "敏捷",
}

# These keys belong to the view adapter only. The saved document remains the
# nested filterPolicy contract shared with the server.
const UI_LINE_ID_KEY := "filterPolicy.lineId"
const UI_ELEMENT_MODE_KEY := "filterPolicy.element.mode"
const UI_ELEMENT_MIN_POINTS_KEY := "filterPolicy.element.minPoints"
const UI_ONLY_NEW_CODEX_FORM_KEY := "filterPolicy.onlyNewCodexForm"
const UI_MAX_OWNED_SAME_FORM_KEY := "filterPolicy.maxOwnedSameForm"


static func default_policy() -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"lineIds": [],
		"element": {
			"mode": ELEMENT_MODE_ANY,
			"ids": [],
			"minPoints": 1,
		},
		"onlyNewCodexForm": false,
		"maxOwnedSameForm": 0,
		"levelOneFourV": {
			"maxHp": {"min": 0, "max": 0},
			"attack": {"min": 0, "max": 0},
			"defense": {"min": 0, "max": 0},
			"quick": {"min": 0, "max": 0},
		},
	}


static func normalize_policy(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var normalized := default_policy()
	normalized["lineIds"] = _normalized_line_ids(raw.get("lineIds", []))
	var raw_element_value = raw.get("element", {})
	var raw_element := raw_element_value as Dictionary if raw_element_value is Dictionary else {}
	normalized["element"] = {
		"mode": _normalized_element_mode(str(raw_element.get("mode", ELEMENT_MODE_ANY))),
		"ids": _normalized_element_ids(raw_element.get("ids", [])),
		"minPoints": clampi(int(raw_element.get("minPoints", 1)), 1, 10),
	}
	normalized["onlyNewCodexForm"] = bool(raw.get("onlyNewCodexForm", false))
	normalized["maxOwnedSameForm"] = clampi(int(raw.get("maxOwnedSameForm", 0)), 0, MAX_OWNED_SAME_FORM)
	var raw_four_value = raw.get("levelOneFourV", {})
	var raw_four := raw_four_value as Dictionary if raw_four_value is Dictionary else {}
	var four := {}
	for stat_id in STAT_IDS:
		four[stat_id] = _normalized_stat_range(raw_four.get(stat_id, {}))
	normalized["levelOneFourV"] = four
	return normalized


static func ui_keys() -> Array[String]:
	var keys: Array[String] = [
		UI_LINE_ID_KEY,
		UI_ELEMENT_MODE_KEY,
		UI_ELEMENT_MIN_POINTS_KEY,
		UI_ONLY_NEW_CODEX_FORM_KEY,
		UI_MAX_OWNED_SAME_FORM_KEY,
	]
	for element_id in ELEMENT_IDS:
		keys.append(ui_element_key(element_id))
	for stat_id in STAT_IDS:
		keys.append(ui_stat_min_key(stat_id))
		keys.append(ui_stat_max_key(stat_id))
	return keys


static func is_ui_key(key: String) -> bool:
	return ui_keys().has(key)


static func ui_element_key(element_id: String) -> String:
	return "filterPolicy.element.%s" % element_id


static func ui_stat_min_key(stat_id: String) -> String:
	return "filterPolicy.levelOneFourV.%s.min" % stat_id


static func ui_stat_max_key(stat_id: String) -> String:
	return "filterPolicy.levelOneFourV.%s.max" % stat_id


static func with_ui_value(value, key: String, next_value) -> Dictionary:
	var policy := normalize_policy(value)
	match key:
		UI_LINE_ID_KEY:
			var line_id := str(next_value).strip_edges()
			policy["lineIds"] = [] if line_id == "" or PetTemplateCatalog.line_by_id(line_id).is_empty() else [line_id]
		UI_ELEMENT_MODE_KEY:
			(policy["element"] as Dictionary)["mode"] = _normalized_element_mode(str(next_value))
		UI_ELEMENT_MIN_POINTS_KEY:
			(policy["element"] as Dictionary)["minPoints"] = clampi(int(next_value), 1, 10)
		UI_ONLY_NEW_CODEX_FORM_KEY:
			policy["onlyNewCodexForm"] = bool(next_value)
		UI_MAX_OWNED_SAME_FORM_KEY:
			policy["maxOwnedSameForm"] = clampi(int(next_value), 0, MAX_OWNED_SAME_FORM)
		_:
			for element_id in ELEMENT_IDS:
				if key != ui_element_key(element_id):
					continue
				var ids := _string_array((policy["element"] as Dictionary).get("ids", []))
				if bool(next_value) and not ids.has(element_id):
					ids.append(element_id)
				elif not bool(next_value):
					ids.erase(element_id)
				(policy["element"] as Dictionary)["ids"] = ids
				return normalize_policy(policy)
			for stat_id in STAT_IDS:
				var four := policy["levelOneFourV"] as Dictionary
				var bounds := (four.get(stat_id, {}) as Dictionary).duplicate(true)
				if key == ui_stat_min_key(stat_id):
					bounds["min"] = clampi(int(next_value), 0, MAX_LEVEL_ONE_STAT)
					if int(bounds.get("max", 0)) > 0 and int(bounds.get("min", 0)) > int(bounds.get("max", 0)):
						bounds["max"] = bounds["min"]
				elif key == ui_stat_max_key(stat_id):
					bounds["max"] = clampi(int(next_value), 0, MAX_LEVEL_ONE_STAT)
					if int(bounds.get("max", 0)) > 0 and int(bounds.get("min", 0)) > int(bounds.get("max", 0)):
						bounds["min"] = bounds["max"]
				else:
					continue
				four[stat_id] = bounds
				policy["levelOneFourV"] = four
				return normalize_policy(policy)
	return normalize_policy(policy)


static func selected_line_id(value) -> String:
	var line_ids := _string_array(normalize_policy(value).get("lineIds", []))
	return str(line_ids[0]) if not line_ids.is_empty() else ""


static func line_options() -> Array[Dictionary]:
	var options: Array[Dictionary] = [{"id": "", "label": "不限系别"}]
	for line in PetTemplateCatalog.lines():
		var line_id := str(line.get("lineId", ""))
		if line_id == "":
			continue
		options.append({"id": line_id, "label": str(line.get("lineName", line_id))})
	return options


static func element_mode_options() -> Array[Dictionary]:
	return [
		{"id": ELEMENT_MODE_ANY, "label": "任一"},
		{"id": ELEMENT_MODE_ALL, "label": "同时"},
	]


static func stat_label(stat_id: String) -> String:
	return str(STAT_LABELS.get(stat_id, stat_id))


static func element_label(element_id: String) -> String:
	return str(ELEMENT_LABELS.get(element_id, element_id))


static func has_level_one_rules(value) -> bool:
	var four := normalize_policy(value).get("levelOneFourV", {}) as Dictionary
	for stat_id in STAT_IDS:
		var bounds := four.get(stat_id, {}) as Dictionary
		if int(bounds.get("min", 0)) > 0 or int(bounds.get("max", 0)) > 0:
			return true
	return false


# Client-side preselection only avoids obviously unsuitable targets. It fails
# open when public facts are incomplete; the server always recomputes the rule.
static func local_preselection(actor: Dictionary, context: Dictionary, value, target_form_id: String = "") -> Dictionary:
	var policy := normalize_policy(value)
	var normalized_target_form := target_form_id.strip_edges()
	var line_ids := _string_array(policy.get("lineIds", []))
	var element := policy.get("element", {}) as Dictionary
	var element_ids := _string_array(element.get("ids", []))
	var only_new := bool(policy.get("onlyNewCodexForm", false))
	var max_owned := int(policy.get("maxOwnedSameForm", 0))
	var deferred: Array[String] = []
	if has_level_one_rules(policy):
		deferred.append("level_one_four_v")
	var has_pre_rules := normalized_target_form != "" or not line_ids.is_empty() or not element_ids.is_empty() or only_new or max_owned > 0
	if not has_pre_rules and deferred.is_empty():
		return _selection_result("disabled", true, true, [], deferred)

	var failures: Array[String] = []
	var unavailable: Array[String] = []
	var form_id := str(actor.get("formId", actor.get("templateId", ""))).strip_edges()
	var form := PetTemplateCatalog.form_by_id(form_id)
	if normalized_target_form != "":
		if form_id == "":
			unavailable.append("actor_public_facts_unavailable")
		elif form_id != normalized_target_form:
			failures.append("target_identity_not_matched")
	if not line_ids.is_empty():
		var line_id := str(form.get("lineId", actor.get("lineId", ""))).strip_edges()
		if line_id == "":
			unavailable.append("pet_template_unavailable")
		elif not line_ids.has(line_id):
			failures.append("pet_line_not_matched")
	if not element_ids.is_empty():
		var elements_value = form.get("elements", actor.get("elements", {}))
		var elements := elements_value as Dictionary if elements_value is Dictionary else {}
		if elements.is_empty():
			unavailable.append("pet_element_facts_unavailable")
		elif not _element_matches(elements, element):
			failures.append("pet_element_not_matched")
	if only_new:
		var is_new_known := false
		var is_new := false
		if context.has("isNewCodexForm") and typeof(context.get("isNewCodexForm")) == TYPE_BOOL:
			is_new_known = true
			is_new = bool(context.get("isNewCodexForm", false))
		elif context.get("codexCapturedFormIds", null) is Array and form_id != "":
			is_new_known = true
			is_new = not _string_array(context.get("codexCapturedFormIds", [])).has(form_id)
		if not is_new_known:
			unavailable.append("codex_history_unavailable")
		elif not is_new:
			failures.append("codex_form_already_captured")
	if max_owned > 0:
		var owned_known := context.has("ownedSameForm") or context.has("ownedSameFormCount")
		var pending_known := context.has("ownedSameForm") or context.has("pendingSameFormCount")
		var owned_count := int(context.get("ownedSameForm", context.get("ownedSameFormCount", 0)))
		var pending_count := int(context.get("pendingSameFormCount", 0))
		if not owned_known or not pending_known:
			unavailable.append("owned_form_count_unavailable")
		elif owned_count + pending_count >= max_owned:
			failures.append("owned_same_form_limit_reached")
	if not failures.is_empty():
		return _selection_result("not_matched", false, false, failures, deferred)
	if not unavailable.is_empty():
		return _selection_result("unavailable", false, true, unavailable, deferred)
	return _selection_result("matched", true, true, [], deferred)


static func contract_check() -> Dictionary:
	var policy := normalize_policy({
		"lineIds": ["man_dragon", "man_dragon", "unknown"],
		"element": {"mode": "all", "ids": ["water"], "minPoints": 10},
		"onlyNewCodexForm": true,
		"maxOwnedSameForm": 3,
		"levelOneFourV": {"attack": {"min": 14, "max": 16}},
	})
	var actor := {
		"formId": "blue_man_dragon_water10",
		"_privateOpaque": "must_not_be_read",
	}
	var matched := local_preselection(actor, {"isNewCodexForm": true, "ownedSameForm": 2}, policy)
	actor["_privateOpaque"] = "changed_but_irrelevant"
	var hidden_changed := local_preselection(actor, {"isNewCodexForm": true, "ownedSameForm": 2}, policy)
	var capped := local_preselection(actor, {"isNewCodexForm": true, "ownedSameForm": 3}, policy)
	var unavailable := local_preselection(actor, {}, policy)
	var edited := with_ui_value(policy, ui_stat_min_key("attack"), 20)
	var edited_attack := (edited.get("levelOneFourV", {}) as Dictionary).get("attack", {}) as Dictionary
	return {
		"ok": (
			_string_array(policy.get("lineIds", [])).size() == 1
			and str(matched.get("status", "")) == "matched"
			and bool(matched.get("eligible", false))
			and matched == hidden_changed
			and (matched.get("deferredChecks", []) as Array).has("level_one_four_v")
			and str(capped.get("status", "")) == "not_matched"
			and not bool(capped.get("eligible", true))
			and str(unavailable.get("status", "")) == "unavailable"
			and bool(unavailable.get("eligible", false))
			and int(edited_attack.get("min", 0)) == 20
			and int(edited_attack.get("max", 0)) == 20
		),
		"policy": policy,
		"matched": matched,
		"capped": capped,
		"unavailable": unavailable,
		"edited": edited,
	}


static func _selection_result(status: String, matched: bool, eligible: bool, reasons: Array[String], deferred: Array[String]) -> Dictionary:
	return {
		"schemaVersion": SCHEMA_VERSION,
		"stage": "pre_capture",
		"status": status,
		"matched": matched,
		"eligible": eligible,
		"reasons": reasons.duplicate(),
		"deferredChecks": deferred.duplicate(),
	}


static func _element_matches(elements: Dictionary, rule: Dictionary) -> bool:
	var ids := _string_array(rule.get("ids", []))
	if ids.is_empty():
		return true
	var minimum := clampi(int(rule.get("minPoints", 1)), 1, 10)
	if str(rule.get("mode", ELEMENT_MODE_ANY)) == ELEMENT_MODE_ALL:
		for element_id in ids:
			if int(elements.get(element_id, 0)) < minimum:
				return false
		return true
	for element_id in ids:
		if int(elements.get(element_id, 0)) >= minimum:
			return true
	return false


static func _normalized_line_ids(value) -> Array[String]:
	var result: Array[String] = []
	for line_id in _string_array(value):
		if result.size() >= MAX_LINE_IDS:
			break
		if result.has(line_id) or PetTemplateCatalog.line_by_id(line_id).is_empty():
			continue
		result.append(line_id)
	return result


static func _normalized_element_ids(value) -> Array[String]:
	var result: Array[String] = []
	for element_id in _string_array(value):
		if ELEMENT_IDS.has(element_id) and not result.has(element_id):
			result.append(element_id)
	return result


static func _normalized_element_mode(value: String) -> String:
	return ELEMENT_MODE_ALL if value.strip_edges() == ELEMENT_MODE_ALL else ELEMENT_MODE_ANY


static func _normalized_stat_range(value) -> Dictionary:
	var raw := value as Dictionary if value is Dictionary else {}
	var minimum := clampi(int(raw.get("min", 0)), 0, MAX_LEVEL_ONE_STAT)
	var maximum := clampi(int(raw.get("max", 0)), 0, MAX_LEVEL_ONE_STAT)
	if minimum > 0 and maximum > 0 and minimum > maximum:
		var swap := minimum
		minimum = maximum
		maximum = swap
	return {"min": minimum, "max": maximum}


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			var text := str(item).strip_edges()
			if text != "":
				result.append(text)
	return result
