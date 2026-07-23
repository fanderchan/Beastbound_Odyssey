extends SceneTree

const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const WorldAudioContextModel := preload("res://scripts/audio/world_audio_context_model.gd")


func _initialize() -> void:
	var map_ids: Array[String] = []
	for value in MapDataCatalog.MAP_DATA_PATHS.keys():
		map_ids.append(str(value))
	map_ids.sort()
	var errors := WorldAudioContextModel.validation_errors(map_ids)
	if WorldAudioContextModel.context_for("firebud_village_gate") != "town":
		errors.append("火芽村口没有解析为 town")
	if WorldAudioContextModel.context_for("mistcap_marsh") != "wilderness":
		errors.append("雾帽湿地没有解析为 wilderness")
	if WorldAudioContextModel.context_for("earth_vein_cave_f4") != "cave":
		errors.append("地脉洞窟没有解析为 cave")
	if WorldAudioContextModel.context_for(
		"future_map",
		{"audioContext": "town"}
	) != "town":
		errors.append("显式 audioContext 没有优先于目录")
	if WorldAudioContextModel.context_for("future_map") != "":
		errors.append("未知地图不应静默套用错误音乐")
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_world_context_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"mapCount": map_ids.size(),
		"contextCounts": _context_counts(map_ids),
		"errors": errors,
	}
	print("audio world context check: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


func _context_counts(map_ids: Array[String]) -> Dictionary:
	var counts := {"town": 0, "wilderness": 0, "cave": 0}
	for map_id in map_ids:
		var context := WorldAudioContextModel.context_for(map_id)
		if counts.has(context):
			counts[context] = int(counts.get(context, 0)) + 1
	return counts
