extends SceneTree

const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const MapRoutePlanner := preload("res://scripts/world/map_route_planner.gd")

var _catalog_load_counts: Dictionary = {}
var _synthetic_maps: Dictionary = {}
var _invalid_maps: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var known_map_ids: Array[String] = []
	for map_id_value in MapDataCatalog.MAP_DATA_PATHS.keys():
		known_map_ids.append(str(map_id_value))
	var planner := MapRoutePlanner.new(
		known_map_ids,
		Callable(self, "_load_catalog_map")
	)
	_expect(planner.is_ready(), "正式地图图结构应通过严格校验", errors)
	_expect(
		planner.map_count() == known_map_ids.size(),
		"缓存地图数量应等于正式目录数量",
		errors
	)

	var two_hop_expected: Array[String] = [
		"firebud_village_gate",
		"earth_vein_cave",
		"earth_vein_cave_f2",
	]
	var four_hop_expected: Array[String] = [
		"firebud_village_gate",
		"shadow_oath_cavern",
		"shadow_oath_cavern_f2",
		"shadow_oath_cavern_f3",
		"shadow_oath_cavern_f4",
	]
	var five_hop_expected: Array[String] = four_hop_expected.duplicate()
	five_hop_expected.append("shadow_oath_cavern_f5")
	var two_hop_path := planner.shortest_path(
		"firebud_village_gate",
		"earth_vein_cave_f2"
	)
	var four_hop_path := planner.shortest_path(
		"firebud_village_gate",
		"shadow_oath_cavern_f4"
	)
	var five_hop_path := planner.shortest_path(
		"firebud_village_gate",
		"shadow_oath_cavern_f5"
	)
	_expect(two_hop_path == two_hop_expected, "正式地图二跳路线错误", errors)
	_expect(four_hop_path == four_hop_expected, "正式地图四跳路线错误", errors)
	_expect(five_hop_path == five_hop_expected, "正式地图五跳路线错误", errors)

	var five_hop_first_warp := planner.next_warp(
		"firebud_village_gate",
		"shadow_oath_cavern_f5"
	)
	_expect(
		str(five_hop_first_warp.get("toMap", "")) == "shadow_oath_cavern",
		"五跳路线首个传送点错误",
		errors
	)
	_expect(
		five_hop_first_warp.get("routeMapPath", []) == five_hop_expected,
		"首个传送点必须携带完整只读地图路线",
		errors
	)
	_expect(
		planner.shortest_path(
			"firebud_village_gate",
			"gm_10v10_training_ground"
		).is_empty(),
		"不可达 GM 地图必须失败关闭",
		errors
	)
	_expect(
		planner.shortest_path("missing_map", "firebud_village_gate").is_empty(),
		"未知起点不得进入地图图结构",
		errors
	)
	_expect(
		planner.shortest_path(
			"firebud_village_gate",
			"firebud_village_gate"
		) == ["firebud_village_gate"],
		"同地图查询应返回单节点路线",
		errors
	)
	_expect(
		planner.next_warp(
			"firebud_village_gate",
			"firebud_village_gate"
		).is_empty(),
		"同地图查询不得伪造传送点",
		errors
	)

	var loads_after_build := _total_load_count(_catalog_load_counts)
	planner.shortest_path("earth_vein_cave_f4", "mistcap_marsh")
	planner.next_warp("mistcap_marsh", "shadow_oath_cavern_f5")
	_expect(
		loads_after_build == known_map_ids.size(),
		"构图时每张正式地图必须只加载一次",
		errors
	)
	_expect(
		_total_load_count(_catalog_load_counts) == loads_after_build,
		"路线查询不得再次读取地图文件",
		errors
	)

	_check_shortest_route(errors)
	_check_invalid_graph_fails_closed(errors)

	var result := {
		"ok": errors.is_empty(),
		"errors": errors,
		"mapCount": planner.map_count(),
		"directedEdgeCount": planner.directed_edge_count(),
		"catalogLoadCount": _total_load_count(_catalog_load_counts),
		"twoHopPath": two_hop_path,
		"fourHopPath": four_hop_path,
		"fiveHopPath": five_hop_path,
	}
	print("MAP_ROUTE_PLANNER_CHECK: %s" % JSON.stringify(result))
	quit(0 if errors.is_empty() else 1)


func _check_shortest_route(errors: Array[String]) -> void:
	_synthetic_maps = {
		"start": _fixture_map("start", [
			_fixture_warp("start_to_long_1", "long_1"),
			_fixture_warp("start_to_short", "short"),
		]),
		"long_1": _fixture_map("long_1", [
			_fixture_warp("long_1_to_long_2", "long_2"),
		]),
		"long_2": _fixture_map("long_2", [
			_fixture_warp("long_2_to_goal", "goal"),
		]),
		"short": _fixture_map("short", [
			_fixture_warp("short_to_goal", "goal"),
		]),
		"goal": _fixture_map("goal", []),
	}
	var ids: Array[String] = ["start", "long_1", "long_2", "short", "goal"]
	var planner := MapRoutePlanner.new(ids, Callable(self, "_load_synthetic_map"))
	_expect(planner.is_ready(), "最短路夹具应可构图", errors)
	_expect(
		planner.shortest_path("start", "goal") == ["start", "short", "goal"],
		"BFS 必须选择二跳路线而不是三跳分支",
		errors
	)


func _check_invalid_graph_fails_closed(errors: Array[String]) -> void:
	_invalid_maps = {
		"bad_start": _fixture_map("bad_start", [
			_fixture_warp("bad_start_to_missing", "missing_map"),
		]),
		"bad_goal": _fixture_map("bad_goal", []),
	}
	var ids: Array[String] = ["bad_start", "bad_goal"]
	var planner := MapRoutePlanner.new(ids, Callable(self, "_load_invalid_map"))
	_expect(not planner.is_ready(), "未知传送目标必须使整张图失败关闭", errors)
	_expect(not planner.validation_errors().is_empty(), "失败关闭必须保留可诊断原因", errors)
	_expect(planner.map_count() == 0, "失败关闭后不得暴露半张地图图结构", errors)
	_expect(planner.directed_edge_count() == 0, "失败关闭后不得暴露部分传送边", errors)
	_expect(
		planner.shortest_path("bad_start", "bad_goal").is_empty(),
		"损坏图不得返回部分路线",
		errors
	)
	_expect(
		planner.next_warp("bad_start", "bad_goal").is_empty(),
		"损坏图不得返回传送点",
		errors
	)


func _load_catalog_map(map_id: String) -> Variant:
	_catalog_load_counts[map_id] = int(_catalog_load_counts.get(map_id, 0)) + 1
	var path := MapDataCatalog.path_for(map_id)
	if path == "":
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return null
	return JSON.parse_string(file.get_as_text())


func _load_synthetic_map(map_id: String) -> Variant:
	var value = _synthetic_maps.get(map_id, null)
	return (value as Dictionary).duplicate(true) if value is Dictionary else null


func _load_invalid_map(map_id: String) -> Variant:
	var value = _invalid_maps.get(map_id, null)
	return (value as Dictionary).duplicate(true) if value is Dictionary else null


func _fixture_map(map_id: String, interactions: Array) -> Dictionary:
	return {
		"id": map_id,
		"interactionPoints": interactions,
	}


func _fixture_warp(warp_id: String, target_map_id: String) -> Dictionary:
	return {
		"id": warp_id,
		"kind": "warp",
		"cell": [1, 1],
		"toMap": target_map_id,
	}


func _total_load_count(load_counts: Dictionary) -> int:
	var result := 0
	for count_value in load_counts.values():
		result += int(count_value)
	return result


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
