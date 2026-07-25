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
		or str(outcome.get("sourceFormName", "")).strip_edges() == ""
		or str(outcome.get("targetFormName", "")).strip_edges() == ""
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
	var quote := (PetEvolutionClientModel.contract_check().get("fixture", {}) as Dictionary).duplicate(true)
	var operation_id := "bbo_contract_evolution_presentation_001"
	var success := _success_fixture(quote)
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
	var success_request := request_for_outcome(success, true, quote, operation_id)
	return {
		"ok": (
			request_for_outcome(below_p90, true, quote, operation_id).is_empty()
			and request_for_outcome(insufficient, true, quote, operation_id).is_empty()
			and request_for_outcome(unknown, true, quote, operation_id).is_empty()
			and request_for_outcome(success, false, quote, operation_id).is_empty()
			and request_for_outcome(tampered, true, quote, operation_id).is_empty()
			and not success_request.is_empty()
			and str(success_request.get("targetFormId", "")) == "wuli_evolved_crystal_earth8_water2"
			and int(success_request.get("afterLevel", 0)) == 1
		),
		"fixture": success,
		"operationId": operation_id,
		"request": success_request,
	}


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
