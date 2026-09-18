extends RefCounted

const Presenter := preload("res://scripts/ui/evolution_trial_dialog_presenter.gd")
const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")


static func run(host) -> bool:
	var catalog := BalanceCatalogModel.pet_evolution_routes()
	var errors: Array[String] = []
	var checked := 0
	for source in catalog.get("materialEncounters", []):
		var map_path := str(MapDataCatalog.MAP_DATA_PATHS.get(str(source.get("mapId", "")), ""))
		var file := FileAccess.open(map_path, FileAccess.READ)
		var map_data: Dictionary = JSON.parse_string(file.get_as_text())
		var item: Dictionary = {}
		for interaction in map_data.get("interactionPoints", []):
			if interaction.get("id", "") == source.get("interactionId", ""):
				item = interaction
		var before := item.duplicate(true)
		var body: String = host._dialog_quest()._dialog_body_for(item)
		var expected := "%s×%d" % [BackpackModel.label_for(source["itemId"]), source["itemCountPerVictory"]]
		if body.contains("完成前") or not body.contains(expected) or not body.contains("%d级" % source["minPlayerLevel"]) or not body.contains("%d人" % source["minPlayerCount"]):
			errors.append("current trial hint does not match catalog: " + str(source["sourceId"]))
		if item != before:
			errors.append("dialogue presentation mutated map data")
		var disabled := catalog.duplicate(true)
		disabled["runtimeEnabled"] = false
		var disabled_text := "\n".join(Presenter.lines_for_catalog(item, disabled))
		if not disabled_text.contains("暂未开放") or disabled_text.contains("胜利奖励"):
			errors.append("disabled trial advertised rewards")
		var changed := catalog.duplicate(true)
		for trial in changed["materialEncounters"]:
			trial["minPlayerCount"] = 3
			trial["minPlayerLevel"] = 125
			trial["itemCountPerVictory"] = 2
		var changed_text := "\n".join(Presenter.lines_for_catalog(item, changed))
		if not changed_text.contains("3人，全员达到125级") or not changed_text.contains("×2"):
			errors.append("trial hint failed to follow changed catalog rules")
		var wrong_group := item.duplicate(true)
		wrong_group["encounterGroupId"] = "unrelated"
		if Presenter.lines_for_catalog(wrong_group, catalog) != item.get("dialog", []):
			errors.append("unrelated interaction was overridden")
		checked += 1
	print("evolution trial dialog check: %s" % JSON.stringify({"trials": checked, "errors": errors, "status": "passed" if checked == 3 and errors.is_empty() else "failed"}))
	return checked == 3 and errors.is_empty()
