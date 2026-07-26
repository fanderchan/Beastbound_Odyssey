extends RefCounted

const PetEvolutionClientModel := preload("res://scripts/progression/pet_evolution_client_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")


static func request_for_outcome(
	parsed_value,
	profile_applied: bool,
	quote_value,
	operation_id: String
) -> Dictionary:
	if not profile_applied or not (parsed_value is Dictionary):
		return {}
	var parsed := parsed_value as Dictionary
	if not bool(parsed.get("ok", false)):
		return {}
	var normalized_operation_id := operation_id.strip_edges()
	if not ServerAuthClientModel.idempotency_key_is_valid(normalized_operation_id):
		return {}
	var quote := PetEvolutionClientModel.normalized_quote(quote_value)
	if quote.is_empty():
		return {}
	var outcome_value = parsed.get("petEvolution", null)
	if not (outcome_value is Dictionary):
		return {}
	var outcome := outcome_value as Dictionary
	var quote_pet := quote.get("pet", {}) as Dictionary
	var quote_result := quote.get("result", {}) as Dictionary
	if (
		int(outcome.get("schemaVersion", 0)) != 1
		or str(outcome.get("routeId", "")) != str(quote.get("routeId", ""))
		or str(outcome.get("instanceId", "")) != str(quote_pet.get("instanceId", ""))
		or str(outcome.get("sourceFormId", "")) != str(quote_pet.get("sourceFormId", ""))
		or str(outcome.get("targetFormId", "")) != str(quote_result.get("targetFormId", ""))
		or str(outcome.get("sourceFormName", "")) != str(quote_pet.get("sourceFormName", ""))
		or str(outcome.get("targetFormName", "")) != str(quote_result.get("targetFormName", ""))
		or int(outcome.get("beforeLevel", 0)) != PetEvolutionClientModel.REQUIRED_LEVEL
		or int(outcome.get("afterLevel", 0)) != 1
		or int(outcome.get("rebirthCount", 0)) != PetEvolutionClientModel.REQUIRED_REBIRTH_COUNT
		or not _profile_contains_applied_target(parsed.get("profile", null), outcome)
	):
		return {}
	return {
		"schemaVersion": 1,
		"presentationId": normalized_operation_id,
		"routeId": str(outcome.get("routeId", "")),
		"instanceId": str(outcome.get("instanceId", "")),
		"sourceFormId": str(outcome.get("sourceFormId", "")),
		"sourceFormName": str(outcome.get("sourceFormName", "")),
		"targetFormId": str(outcome.get("targetFormId", "")),
		"targetFormName": str(outcome.get("targetFormName", "")),
		"beforeLevel": int(outcome.get("beforeLevel", 0)),
		"afterLevel": int(outcome.get("afterLevel", 0)),
		"rebirthCount": int(outcome.get("rebirthCount", 0)),
	}


static func contract_check() -> Dictionary:
	var wuli_quote := (PetEvolutionClientModel.contract_check().get("fixture", {}) as Dictionary).duplicate(true)
	var moon_quote := _moon_gale_quote_fixture(wuli_quote)
	var route_fixtures: Dictionary = {}
	var route_contract_ok := true
	for fixture in [
		{
			"routeId": "wuli_crystal_evolution_v1",
			"quote": wuli_quote,
			"operationId": "bbo_contract_evolution_presentation_wuli_001",
			"expectedTargetFormId": "wuli_evolved_crystal_earth8_water2",
		},
		{
			"routeId": "driftfox_moon_gale_evolution_v1",
			"quote": moon_quote,
			"operationId": "bbo_contract_evolution_presentation_fox_001",
			"expectedTargetFormId": "driftfox_evolved_moon_gale_wind7_water3",
		},
	]:
		var quote := fixture.get("quote", {}) as Dictionary
		var operation_id := str(fixture.get("operationId", ""))
		var success := _success_fixture(quote)
		var request := request_for_outcome(success, true, quote, operation_id)
		route_contract_ok = (
			route_contract_ok
			and not request.is_empty()
			and str(request.get("routeId", "")) == str(fixture.get("routeId", ""))
			and str(request.get("targetFormId", "")) == str(fixture.get("expectedTargetFormId", ""))
			and int(request.get("afterLevel", 0)) == 1
		)
		route_fixtures[str(fixture.get("routeId", ""))] = {
			"quote": quote.duplicate(true),
			"outcome": success,
			"operationId": operation_id,
			"request": request,
		}
	var wuli_fixture := route_fixtures.get("wuli_crystal_evolution_v1", {}) as Dictionary
	var moon_fixture := route_fixtures.get("driftfox_moon_gale_evolution_v1", {}) as Dictionary
	var operation_id := str(wuli_fixture.get("operationId", ""))
	var success := wuli_fixture.get("outcome", {}) as Dictionary
	var below_p90 := {
		"ok": false,
		"code": "pet_evolution_power_below_p90",
	}
	var insufficient := {
		"ok": false,
		"code": "pet_evolution_assets_insufficient",
	}
	var unknown := {
		"ok": false,
		"code": "storage_outcome_unknown",
	}
	var tampered := success.duplicate(true)
	(tampered.get("petEvolution", {}) as Dictionary)["targetFormId"] = "tampered_target"
	var tampered_label := success.duplicate(true)
	(tampered_label.get("petEvolution", {}) as Dictionary)["targetFormName"] = "月岚风狐"
	var success_request := wuli_fixture.get("request", {}) as Dictionary
	var cross_route_outcome := moon_fixture.get("outcome", {}) as Dictionary
	return {
		"ok": (
			route_contract_ok
			and request_for_outcome(below_p90, true, wuli_quote, operation_id).is_empty()
			and request_for_outcome(insufficient, true, wuli_quote, operation_id).is_empty()
			and request_for_outcome(unknown, true, wuli_quote, operation_id).is_empty()
			and request_for_outcome(success, false, wuli_quote, operation_id).is_empty()
			and request_for_outcome(tampered, true, wuli_quote, operation_id).is_empty()
			and request_for_outcome(tampered_label, true, wuli_quote, operation_id).is_empty()
			and request_for_outcome(cross_route_outcome, true, wuli_quote, operation_id).is_empty()
		),
		"fixture": success,
		"operationId": operation_id,
		"request": success_request,
		"routeFixtures": route_fixtures,
	}


static func _moon_gale_quote_fixture(base_quote: Dictionary) -> Dictionary:
	var quote := base_quote.duplicate(true)
	quote["routeId"] = "driftfox_moon_gale_evolution_v1"
	var pet := quote.get("pet", {}) as Dictionary
	pet["instanceId"] = "pet_evolution_ui_contract_fox"
	pet["sourceFormId"] = "driftfox_highland_wind9_earth1"
	pet["sourceFormName"] = "高地风狐"
	pet["intrinsicCombatPower"] = 1492
	pet["minimumIntrinsicCombatPower"] = 1437
	var result := quote.get("result", {}) as Dictionary
	result["targetFormId"] = "driftfox_evolved_moon_gale_wind7_water3"
	result["targetFormName"] = "月岚风狐"
	var cost := quote.get("cost", {}) as Dictionary
	var items := cost.get("items", []) as Array
	if items.size() >= 2 and items[1] is Dictionary:
		var lineage_item := items[1] as Dictionary
		lineage_item["itemId"] = "pet_evolution_driftfox_moon_plume"
		lineage_item["label"] = "月岚尾羽"
	return quote


static func _success_fixture(quote: Dictionary) -> Dictionary:
	var pet := quote.get("pet", {}) as Dictionary
	var result := quote.get("result", {}) as Dictionary
	var outcome := {
		"schemaVersion": 1,
		"routeId": str(quote.get("routeId", "")),
		"instanceId": str(pet.get("instanceId", "")),
		"sourceFormId": str(pet.get("sourceFormId", "")),
		"sourceFormName": str(pet.get("sourceFormName", "")),
		"targetFormId": str(result.get("targetFormId", "")),
		"targetFormName": str(result.get("targetFormName", "")),
		"beforeLevel": PetEvolutionClientModel.REQUIRED_LEVEL,
		"afterLevel": 1,
		"rebirthCount": PetEvolutionClientModel.REQUIRED_REBIRTH_COUNT,
	}
	return {
		"ok": true,
		"profile": {
			"petInstances": [{
				"instanceId": str(outcome.get("instanceId", "")),
				"formId": str(outcome.get("targetFormId", "")),
				"level": 1,
				"petCultivation": {"rebirthCount": 1},
			}],
		},
		"petEvolution": outcome,
	}


static func _profile_contains_applied_target(profile_value, outcome: Dictionary) -> bool:
	if not (profile_value is Dictionary):
		return false
	var instances_value = (profile_value as Dictionary).get("petInstances", null)
	if not (instances_value is Array):
		return false
	for value in instances_value as Array:
		if not (value is Dictionary):
			continue
		var instance := value as Dictionary
		if str(instance.get("instanceId", "")) != str(outcome.get("instanceId", "")):
			continue
		var cultivation := instance.get("petCultivation", {}) as Dictionary if instance.get("petCultivation", {}) is Dictionary else {}
		return (
			str(instance.get("formId", instance.get("templateId", ""))) == str(outcome.get("targetFormId", ""))
			and int(instance.get("level", 0)) == int(outcome.get("afterLevel", 0))
			and int(cultivation.get("rebirthCount", 0)) == int(outcome.get("rebirthCount", 0))
		)
	return false
