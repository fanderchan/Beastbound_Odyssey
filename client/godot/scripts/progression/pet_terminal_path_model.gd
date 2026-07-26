extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")

static var _evolution_target_form_ids: Dictionary = {}
static var _evolution_targets_loaded := false


static func is_terminal(instance: Dictionary) -> bool:
	var cultivation := instance.get("petCultivation", {}) as Dictionary if instance.get("petCultivation", {}) is Dictionary else {}
	if int(cultivation.get("rebirthCount", 0)) >= 2 or cultivation.has("terminalPathId"):
		return true
	return (
		is_evolution_terminal(instance)
		or instance.has("fusionLineage")
		or instance.has("terminalPathId")
	)


static func is_evolution_terminal(instance: Dictionary) -> bool:
	# Presence is authoritative here: an empty, legacy, or damaged lineage must
	# fail closed instead of reopening a terminal pet's paid-reset path.
	if instance.has("evolutionLineage"):
		return true
	var target_form_ids := _evolution_target_form_id_set()
	for key in ["formId", "templateId", "speciesId"]:
		var form_id := str(instance.get(key, "")).strip_edges()
		if form_id != "" and target_form_ids.has(form_id):
			return true
	return false


static func evolution_target_form_ids() -> Array[String]:
	var result: Array[String] = []
	for value in _evolution_target_form_id_set().keys():
		result.append(str(value))
	result.sort()
	return result


static func _evolution_target_form_id_set() -> Dictionary:
	if _evolution_targets_loaded:
		return _evolution_target_form_ids
	_evolution_targets_loaded = true
	var document := BalanceCatalogModel.pet_evolution_routes()
	var raw_routes = document.get("routes", [])
	if not (raw_routes is Array):
		return _evolution_target_form_ids
	for raw_route in raw_routes as Array:
		if not (raw_route is Dictionary):
			continue
		var target_form_id := str((raw_route as Dictionary).get("targetFormId", "")).strip_edges()
		if target_form_id != "":
			_evolution_target_form_ids[target_form_id] = true
	return _evolution_target_form_ids
