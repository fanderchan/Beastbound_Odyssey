extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")

# Frozen map bundles retain this pre-release line. Suppress it only for a
# registered material trial; current requirements come from the shared catalog.
const LEGACY_CLOSED_LINE := "进化系统完成前，这场试炼不会开放。"


static func lines_for(item: Dictionary) -> Array:
	return lines_for_catalog(item, BalanceCatalogModel.pet_evolution_routes())


static func lines_for_catalog(item: Dictionary, catalog: Dictionary) -> Array:
	var raw_lines = item.get("dialog", [])
	var original: Array = raw_lines.duplicate() if raw_lines is Array else []
	var sources = catalog.get("materialEncounters", [])
	if not (sources is Array):
		return original
	for value in sources:
		if not (value is Dictionary):
			continue
		var source := value as Dictionary
		if str(source.get("interactionId", "")).is_empty():
			continue
		if str(source.get("interactionId", "")) != str(item.get("id", "")):
			continue
		if str(source.get("encounterGroupId", "")) != str(item.get("encounterGroupId", "")):
			continue
		var lines: Array = []
		for line in original:
			if str(line) != LEGACY_CLOSED_LINE:
				lines.append(line)
		lines.append(_current_hint(catalog, source))
		return lines
	return original


static func _current_hint(catalog: Dictionary, source: Dictionary) -> String:
	if catalog.get("runtimeEnabled", false) != true:
		return "试炼暂未开放，请稍后再来。"
	var label := BackpackModel.label_for(str(source.get("itemId", "")), "")
	var players := int(source.get("minPlayerCount", 0))
	var level := int(source.get("minPlayerLevel", 0))
	var reward_count := int(source.get("itemCountPerVictory", 0))
	if label.is_empty() or players <= 0 or level <= 0 or reward_count <= 0:
		return "暂时无法确认试炼资料，请稍后再来。"
	return "组队要求：至少%d人，全员达到%d级。\n胜利奖励：每人%s×%d。" % [
		players, level, label, reward_count,
	]
