extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")

const ELEMENT_IDS: Array[String] = ["earth", "water", "fire", "wind"]
const ELEMENT_TOTAL_POINTS := 10
const MULTIPLIER_EPSILON := 0.005


static func shared_matchup() -> Dictionary:
	var document := BalanceCatalogModel.combat_formulas()
	var raw_matchup = document.get("elementMatchup", {})
	return (raw_matchup as Dictionary).duplicate(true) if raw_matchup is Dictionary else {}


static func presentation_plan(
	matchup_value: Dictionary,
	attacker: Dictionary,
	target: Dictionary
) -> Dictionary:
	var result := resolve_matchup(
		matchup_value,
		attacker.get("elements", {}),
		target.get("elements", {})
	)
	if not bool(result.get("valid", false)):
		return {
			"visible": false,
			"schemaVersion": 1,
		}
	var multiplier := float(result.get("multiplier", 1.0))
	var percent_delta := int(round((multiplier - 1.0) * 100.0))
	var disposition := "neutral"
	var label := "均势"
	if multiplier > 1.0 + MULTIPLIER_EPSILON:
		disposition = "advantage"
		label = "克制 +%d%%" % percent_delta
	elif multiplier < 1.0 - MULTIPLIER_EPSILON:
		disposition = "disadvantage"
		label = "受制 %d%%" % percent_delta
	return {
		"visible": true,
		"disposition": disposition,
		"label": label,
		"multiplier": multiplier,
		"percentDelta": percent_delta,
		"strongWeight": float(result.get("strongWeight", 0.0)),
		"weakWeight": float(result.get("weakWeight", 0.0)),
		"neutralWeight": float(result.get("neutralWeight", 0.0)),
		"attackerElements": (result.get("attackerElements", {}) as Dictionary).duplicate(true),
		"targetElements": (result.get("targetElements", {}) as Dictionary).duplicate(true),
		"schemaVersion": 1,
	}


static func resolve_matchup(
	matchup_value: Dictionary,
	attacker_elements_value,
	target_elements_value
) -> Dictionary:
	var matchup := _inspect_matchup(matchup_value)
	var attacker := _inspect_elements(attacker_elements_value)
	var target := _inspect_elements(target_elements_value)
	if matchup.is_empty() or attacker.is_empty() or target.is_empty():
		return {"valid": false, "schemaVersion": 1}
	var strong_weight := 0.0
	var weak_weight := 0.0
	var neutral_weight := 0.0
	var cycle: Array = matchup.get("cycle", []) if matchup.get("cycle", []) is Array else []
	for attacker_element_id in ELEMENT_IDS:
		var attacker_weight := float(attacker.get(attacker_element_id, 0)) / float(ELEMENT_TOTAL_POINTS)
		if attacker_weight <= 0.0:
			continue
		for target_element_id in ELEMENT_IDS:
			var target_weight := float(target.get(target_element_id, 0)) / float(ELEMENT_TOTAL_POINTS)
			if target_weight <= 0.0:
				continue
			var weight := attacker_weight * target_weight
			match _pair_disposition(cycle, attacker_element_id, target_element_id):
				"strong":
					strong_weight += weight
				"weak":
					weak_weight += weight
				_:
					neutral_weight += weight
	var multiplier := (
		strong_weight * float(matchup.get("strongMultiplier", 1.0))
		+ weak_weight * float(matchup.get("weakMultiplier", 1.0))
		+ neutral_weight * float(matchup.get("neutralMultiplier", 1.0))
	)
	return {
		"valid": true,
		"multiplier": multiplier,
		"strongWeight": strong_weight,
		"weakWeight": weak_weight,
		"neutralWeight": neutral_weight,
		"attackerElements": attacker,
		"targetElements": target,
		"schemaVersion": 1,
	}


static func _inspect_elements(value) -> Dictionary:
	if not (value is Dictionary):
		return {}
	var raw := value as Dictionary
	for key in raw.keys():
		if not ELEMENT_IDS.has(str(key)):
			return {}
	var result := {}
	var total := 0
	for element_id in ELEMENT_IDS:
		if not raw.has(element_id):
			return {}
		var raw_points = raw.get(element_id, null)
		if not (raw_points is int or raw_points is float):
			return {}
		var numeric_points := float(raw_points)
		if is_nan(numeric_points) or is_inf(numeric_points):
			return {}
		var points := int(round(numeric_points))
		if absf(numeric_points - float(points)) > 0.0001 or points < 0 or points > ELEMENT_TOTAL_POINTS:
			return {}
		result[element_id] = points
		total += points
	return result if total == ELEMENT_TOTAL_POINTS else {}


static func _inspect_matchup(value: Dictionary) -> Dictionary:
	var cycle: Array = value.get("cycle", []) if value.get("cycle", []) is Array else []
	if cycle.size() != ELEMENT_IDS.size():
		return {}
	var seen_strong := {}
	var seen_weak := {}
	var normalized_cycle: Array[Dictionary] = []
	for raw_pair in cycle:
		if not (raw_pair is Dictionary):
			return {}
		var pair := raw_pair as Dictionary
		var strong := str(pair.get("strong", "")).strip_edges()
		var weak := str(pair.get("weak", "")).strip_edges()
		if (
			strong == weak
			or not ELEMENT_IDS.has(strong)
			or not ELEMENT_IDS.has(weak)
			or seen_strong.has(strong)
			or seen_weak.has(weak)
		):
			return {}
		seen_strong[strong] = true
		seen_weak[weak] = true
		normalized_cycle.append({"strong": strong, "weak": weak})
	var result := {"cycle": normalized_cycle}
	for key in ["strongMultiplier", "weakMultiplier", "neutralMultiplier"]:
		var raw_multiplier = value.get(key, null)
		if not (raw_multiplier is int or raw_multiplier is float):
			return {}
		var multiplier := float(raw_multiplier)
		if is_nan(multiplier) or is_inf(multiplier) or multiplier <= 0.0:
			return {}
		result[key] = multiplier
	return result


static func _pair_disposition(cycle: Array, attacker_element_id: String, target_element_id: String) -> String:
	if attacker_element_id == target_element_id:
		return "neutral"
	for raw_pair in cycle:
		if not (raw_pair is Dictionary):
			continue
		var pair := raw_pair as Dictionary
		if str(pair.get("strong", "")) == attacker_element_id and str(pair.get("weak", "")) == target_element_id:
			return "strong"
		if str(pair.get("strong", "")) == target_element_id and str(pair.get("weak", "")) == attacker_element_id:
			return "weak"
	return "neutral"
