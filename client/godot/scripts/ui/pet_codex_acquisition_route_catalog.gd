extends RefCounted
class_name PetCodexAcquisitionRouteCatalog

const PetTemplateCatalog := preload(
	"res://scripts/battle/pet_template_catalog.gd"
)
const MapDataCatalog := preload(
	"res://scripts/world/map_data_catalog.gd"
)
const EncounterModel := preload(
	"res://scripts/world/encounter_model.gd"
)

const EVOLUTION_ROUTES_PATH := "res://data/pet_evolution_routes.json"

static var _prepared := false
static var _routes_by_form: Dictionary = {}
static var _prepare_count := 0
static var _source_load_count := 0
static var _map_source_load_count := 0
static var _evolution_source_load_count := 0
static var _prepare_duration_usec := 0


static func prepare() -> Dictionary:
	if _prepared:
		return stats_for_qa()
	_prepared = true
	_prepare_count += 1
	var started_usec := Time.get_ticks_usec()
	_prepare_capture_routes()
	_prepare_evolution_routes()
	_prepare_duration_usec = Time.get_ticks_usec() - started_usec
	return stats_for_qa()


static func routes_for_form(form_id: String) -> Array[Dictionary]:
	if not _prepared:
		prepare()
	var normalized_form_id := form_id.strip_edges()
	if normalized_form_id == "":
		return []
	return _dictionary_array(_routes_by_form.get(normalized_form_id, []))


static func stats_for_qa() -> Dictionary:
	var route_count := 0
	for routes_value in _routes_by_form.values():
		if routes_value is Array:
			route_count += (routes_value as Array).size()
	return {
		"prepared": _prepared,
		"prepareCount": _prepare_count,
		"sourceLoadCount": _source_load_count,
		"mapSourceLoadCount": _map_source_load_count,
		"evolutionSourceLoadCount": _evolution_source_load_count,
		"knownMapCount": MapDataCatalog.MAP_DATA_PATHS.size(),
		"formCount": _routes_by_form.size(),
		"routeCount": route_count,
		"prepareDurationUsec": _prepare_duration_usec,
	}


static func clear_cache_for_qa() -> void:
	_prepared = false
	_routes_by_form.clear()
	_prepare_count = 0
	_source_load_count = 0
	_map_source_load_count = 0
	_evolution_source_load_count = 0
	_prepare_duration_usec = 0


static func _prepare_capture_routes() -> void:
	for map_id_value in MapDataCatalog.MAP_DATA_PATHS.keys():
		var map_id := str(map_id_value)
		var map_data := _load_json_dictionary(
			MapDataCatalog.path_for(map_id),
			"map"
		)
		if map_data.is_empty():
			continue
		var zones_value = map_data.get("encounterZones", [])
		if not (zones_value is Array):
			continue
		for zone_value in zones_value:
			if not (zone_value is Dictionary):
				continue
			var zone := zone_value as Dictionary
			if not zone.has("wildPetPool") and str(
				zone.get("wildPetPoolSource", "")
			) != "codex_catchable":
				continue
			var pool := EncounterModel.wild_pet_pool(zone)
			var total_weight := 0.0
			for pool_entry in pool:
				total_weight += maxf(
					0.0,
					float(pool_entry.get("weight", 0.0))
				)
			for pool_entry in pool:
				var form_id := str(pool_entry.get("formId", "")).strip_edges()
				if form_id == "" or not _form_is_catchable(form_id):
					continue
				var level_min := maxi(
					1,
					int(pool_entry.get("levelMin", 1))
				)
				var level_max := maxi(
					level_min,
					int(pool_entry.get("levelMax", level_min))
				)
				var pool_share := 0.0
				if total_weight > 0.0:
					pool_share = (
						maxf(0.0, float(pool_entry.get("weight", 0.0)))
						/ total_weight
					)
				var detail := "%s · Lv%d～%d" % [
					str(zone.get("name", "野外区域")),
					level_min,
					level_max,
				]
				if pool_share > 0.0:
					detail += " · 遭遇池 %.1f%%" % (pool_share * 100.0)
				_append_route(form_id, {
					"kind": "capture",
					"title": "野外捕捉 · %s" % str(
						map_data.get("name", "野外地图")
					),
					"detail": detail,
					"itemId": "capture_net",
					"mapId": map_id,
					"zoneId": str(zone.get("id", "")),
				})


static func _prepare_evolution_routes() -> void:
	var document := _load_json_dictionary(EVOLUTION_ROUTES_PATH, "evolution")
	var routes_value = document.get("routes", [])
	if not (routes_value is Array):
		return
	for route_value in routes_value:
		if not (route_value is Dictionary):
			continue
		var route := route_value as Dictionary
		var form_id := str(route.get("targetFormId", "")).strip_edges()
		if form_id == "":
			continue
		var source := PetTemplateCatalog.runtime_template_for_form(
			str(route.get("sourceFormId", ""))
		)
		var eligibility_value = route.get("eligibility", {})
		var eligibility := (
			eligibility_value as Dictionary
			if eligibility_value is Dictionary
			else {}
		)
		var cost_value = route.get("cost", {})
		var cost := (
			cost_value as Dictionary
			if cost_value is Dictionary
			else {}
		)
		var detail := "%s · %d转 Lv%d" % [
			str(source.get("formName", "前置宠物")),
			int(eligibility.get("requiredRebirthCount", 1)),
			int(eligibility.get("requiredLevel", 140)),
		]
		if int(cost.get("stoneCoins", 0)) > 0:
			detail += " · 石币 %d" % int(cost.get("stoneCoins", 0))
		_append_route(form_id, {
			"kind": "evolution",
			"title": "宠物进化",
			"detail": detail,
		})


static func _form_is_catchable(form_id: String) -> bool:
	var template := PetTemplateCatalog.runtime_template_for_form(form_id)
	var capture_value = template.get("capture", {})
	return (
		capture_value is Dictionary
		and bool((capture_value as Dictionary).get("catchable", false))
	)


static func _append_route(form_id: String, route: Dictionary) -> void:
	var routes := _routes_by_form.get(form_id, []) as Array
	routes.append(route.duplicate(true))
	_routes_by_form[form_id] = routes


static func _load_json_dictionary(path: String, kind: String) -> Dictionary:
	_source_load_count += 1
	if kind == "map":
		_map_source_load_count += 1
	elif kind == "evolution":
		_evolution_source_load_count += 1
	if path == "" or not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}


static func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for item in value:
		if item is Dictionary:
			result.append((item as Dictionary).duplicate(true))
	return result
