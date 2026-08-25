extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapVisualReviewCapture := preload(
	"res://scripts/qa/map_visual_review_capture.gd"
)

const MAIN_SCENE := "res://scenes/Main.tscn"
const BUNDLE_ID := "earth_vein_cave_visual_v1"
const MANIFEST_PATH := "res://assets/maps/earth_vein_cave_visual_v1/map-visual-bundle.json"
const QA_PREVIEW_ARG := "--map-art-review-preview=earth_vein_cave"
const QA_LANE_ARG := "--beastbound-qa-user-data-lane=automation"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const SETTLE_FRAMES := 24
const RESIDENT_NPC_POLICY := "not_applicable_environmental_interactions"
const COMPACT_OBJECT_IDS: Array[String] = [
	"earth_cave_crystal_cluster",
	"earth_cave_fungus_cluster",
	"earth_cave_cairn",
]
const BOUNDARY_OBJECT_IDS: Array[String] = [
	"earth_cave_wall_ridge",
	"earth_cave_wall_buttress",
]
const BINDING_PATHS := {
	"earth_vein_cave": "res://assets/maps/earth_vein_cave_visual_v1/bindings/earth_vein_cave.json",
	"earth_vein_cave_f2": "res://assets/maps/earth_vein_cave_visual_v1/bindings/earth_vein_cave_f2.json",
	"earth_vein_cave_f3": "res://assets/maps/earth_vein_cave_visual_v1/bindings/earth_vein_cave_f3.json",
	"earth_vein_cave_f4": "res://assets/maps/earth_vein_cave_visual_v1/bindings/earth_vein_cave_f4.json",
}
const EXPECTED_PROFILES := {
	"earth_vein_cave": {
		"hierarchyStage": 1,
		"floorRole": "threshold_gallery",
		"routeDensityRank": 1,
		"residentNpcPolicy": RESIDENT_NPC_POLICY,
		"dominantMotifObjectId": "earth_cave_cairn",
		"dominantMotifCount": 3,
		"compactDecorativeCount": 4,
		"blockingLandmarkCount": 4,
		"interactionLandmarkCount": 2,
		"boundarySceneryCount": 4,
	},
	"earth_vein_cave_f2": {
		"hierarchyStage": 2,
		"floorRole": "damp_fungus_seam",
		"routeDensityRank": 2,
		"residentNpcPolicy": RESIDENT_NPC_POLICY,
		"dominantMotifObjectId": "earth_cave_fungus_cluster",
		"dominantMotifCount": 4,
		"compactDecorativeCount": 7,
		"blockingLandmarkCount": 4,
		"interactionLandmarkCount": 2,
		"boundarySceneryCount": 4,
	},
	"earth_vein_cave_f3": {
		"hierarchyStage": 3,
		"floorRole": "compressed_crystal_vein",
		"routeDensityRank": 3,
		"residentNpcPolicy": RESIDENT_NPC_POLICY,
		"dominantMotifObjectId": "earth_cave_crystal_cluster",
		"dominantMotifCount": 6,
		"compactDecorativeCount": 9,
		"blockingLandmarkCount": 4,
		"interactionLandmarkCount": 2,
		"boundarySceneryCount": 4,
	},
	"earth_vein_cave_f4": {
		"hierarchyStage": 4,
		"floorRole": "dual_resonance_sanctum",
		"routeDensityRank": 1,
		"residentNpcPolicy": RESIDENT_NPC_POLICY,
		"dominantMotifObjectId": "earth_cave_resonance_plinth",
		"dominantMotifCount": 2,
		"compactDecorativeCount": 4,
		"blockingLandmarkCount": 3,
		"interactionLandmarkCount": 3,
		"boundarySceneryCount": 4,
	},
}
const SCENARIOS: Array[Dictionary] = [
	{
		"id": "f1_sparse_threshold",
		"mapId": "earth_vein_cave",
		"cell": Vector2i(4, 20),
		"requiredMotifIds": ["f1_crystal_decor_01"],
		"visibleCompactRange": [1, 3],
	},
	{
		"id": "f2_damp_pockets",
		"mapId": "earth_vein_cave_f2",
		"cell": Vector2i(8, 18),
		"requiredMotifIds": ["f2_fungus_decor_01", "f2_fungus_decor_02"],
		"visibleCompactRange": [2, 7],
	},
	{
		"id": "f3_compressed_crystal_vein",
		"mapId": "earth_vein_cave_f3",
		"cell": Vector2i(9, 18),
		"requiredMotifIds": ["f3_crystal_decor_01", "f3_crystal_decor_02"],
		"visibleCompactRange": [3, 9],
	},
	{
		"id": "f4_dual_resonance_sanctum",
		"mapId": "earth_vein_cave_f4",
		"cell": Vector2i(22, 11),
		"requiredMotifIds": ["f4_guardian_plinth", "f4_lineage_plinth"],
		"visibleCompactRange": [0, 4],
	},
]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	_validate_invocation(errors)
	var static_reports := _validate_static_contract(errors)
	if errors.is_empty():
		var scene_error := change_scene_to_file(MAIN_SCENE)
		if scene_error != OK:
			errors.append("无法加载真实 Main.tscn：%s" % error_string(scene_error))
	for _frame_index in range(6):
		await process_frame
	var host = current_scene
	if host == null:
		errors.append("真实 Main.tscn 没有成为 current_scene")
		_finish(static_reports, [], errors)
		return
	for _frame_index in range(120):
		if host.player != null and not host.map_data.is_empty():
			break
		await process_frame
	host.profile_save_enabled = false
	host.account_authenticated = false
	host.auth_auto_bypass = false
	host.auth_request_pending = false
	host.map_visual_review_capture = true
	if host.game_audio_manager != null:
		host.game_audio_manager.configure_playback_enabled(false)
	if Vector2i(host.get_viewport().get_visible_rect().size) != EXPECTED_VIEWPORT:
		errors.append("Earth Vein 层级检查必须运行 1280x720 Main")
	var scenario_reports: Array[Dictionary] = []
	for scenario in SCENARIOS:
		var scenario_report := await _run_scenario(host, scenario)
		scenario_reports.append(scenario_report)
		for scenario_error in _string_array(scenario_report.get("errors", [])):
			errors.append("%s：%s" % [str(scenario.get("id", "")), scenario_error])
	_finish(static_reports, scenario_reports, errors)


func _validate_static_contract(errors: Array[String]) -> Array[Dictionary]:
	var reports: Array[Dictionary] = []
	var manifest := _read_json(MANIFEST_PATH, errors, "manifest")
	var object_roles: Dictionary = {}
	for value in manifest.get("objects", []):
		if value is Dictionary:
			var definition := value as Dictionary
			object_roles[str(definition.get("objectId", ""))] = str(
				definition.get("collisionRole", "")
			)
	var declared_binding_hashes: Dictionary = {}
	for value in manifest.get("mapBindings", []):
		if value is Dictionary:
			var entry := value as Dictionary
			var ref := entry.get("binding", {}) as Dictionary
			declared_binding_hashes[str(entry.get("mapId", ""))] = str(
				ref.get("sha256", "")
			)
	var compact_counts: Dictionary = {}
	for map_id_value in BINDING_PATHS.keys():
		var map_id := str(map_id_value)
		var binding_path := str(BINDING_PATHS[map_id])
		var binding := _read_json(binding_path, errors, "binding %s" % map_id)
		var map_data := IsoMapModel.load_map(_map_data_path(map_id))
		var floor_errors: Array[String] = []
		if not _profile_matches(
			binding.get("presentationProfile", {}) as Dictionary,
			EXPECTED_PROFILES[map_id] as Dictionary
		):
			floor_errors.append("presentationProfile 与冻结层级不一致")
		if str(binding.get("bundleId", "")) != BUNDLE_ID or str(binding.get("mapId", "")) != map_id:
			floor_errors.append("binding identity 不一致")
		if FileAccess.get_sha256(binding_path) != str(declared_binding_hashes.get(map_id, "")):
			floor_errors.append("manifest binding SHA-256 未绑定当前文件")
		if map_data.is_empty():
			floor_errors.append("权威 map data 无法加载")
		var npc_spawns: Variant = map_data.get("npcSpawns", [])
		if npc_spawns is Array and not (npc_spawns as Array).is_empty():
			floor_errors.append("non-applicable 洞穴出现常驻 NPC spawn")
		elif not (npc_spawns is Array):
			floor_errors.append("npcSpawns 合同必须缺省为空数组语义")
		var compact_count := 0
		var blocking_count := 0
		var interaction_count := 0
		var boundary_count := 0
		var object_counts: Dictionary = {}
		var interaction_links: Array[String] = []
		var anchors: Dictionary = {}
		for value in binding.get("objectPlacements", []):
			if not (value is Dictionary):
				continue
			var placement := value as Dictionary
			var object_id := str(placement.get("objectId", ""))
			var role := str(object_roles.get(object_id, ""))
			object_counts[object_id] = int(object_counts.get(object_id, 0)) + 1
			if COMPACT_OBJECT_IDS.has(object_id):
				compact_count += 1
			if role == "blocking":
				blocking_count += 1
			elif role == "interaction":
				interaction_count += 1
				interaction_links.append(str(placement.get("interactionLink", "")))
			if BOUNDARY_OBJECT_IDS.has(object_id):
				boundary_count += 1
			var anchor_key := "%s@%s" % [str(placement.get("grid", [])), str(placement.get("offset", []))]
			if anchors.has(anchor_key):
				floor_errors.append("物件 anchor/offset 完全重叠：%s" % anchor_key)
			anchors[anchor_key] = true
		var profile := EXPECTED_PROFILES[map_id] as Dictionary
		if compact_count != int(profile["compactDecorativeCount"]):
			floor_errors.append("compact density 漂移")
		if blocking_count != int(profile["blockingLandmarkCount"]):
			floor_errors.append("blocking landmark count 漂移")
		if interaction_count != int(profile["interactionLandmarkCount"]):
			floor_errors.append("interaction landmark count 漂移")
		if boundary_count != int(profile["boundarySceneryCount"]):
			floor_errors.append("boundary scenery count 漂移")
		if int(object_counts.get(str(profile["dominantMotifObjectId"]), 0)) != int(profile["dominantMotifCount"]):
			floor_errors.append("dominant motif count 漂移")
		var authoritative_interactions: Array[String] = []
		for value in map_data.get("interactionPoints", []):
			if value is Dictionary:
				authoritative_interactions.append(str((value as Dictionary).get("id", "")))
		interaction_links.sort()
		authoritative_interactions.sort()
		if interaction_links != authoritative_interactions:
			floor_errors.append("环境 interaction 没有精确替代权威交互")
		compact_counts[map_id] = compact_count
		reports.append({
			"mapId": map_id,
			"floorRole": str(profile["floorRole"]),
			"compactDecorativeCount": compact_count,
			"blockingLandmarkCount": blocking_count,
			"interactionLandmarkCount": interaction_count,
			"boundarySceneryCount": boundary_count,
			"dominantMotifObjectId": str(profile["dominantMotifObjectId"]),
			"dominantMotifCount": int(profile["dominantMotifCount"]),
			"residentNpcPolicy": RESIDENT_NPC_POLICY,
			"errors": floor_errors,
			"result": "PASS" if floor_errors.is_empty() else "FAIL",
		})
		for floor_error in floor_errors:
			errors.append("%s：%s" % [map_id, floor_error])
	if compact_counts.size() == 4 and not (
		int(compact_counts.get("earth_vein_cave", 0))
		< int(compact_counts.get("earth_vein_cave_f2", 0))
		and int(compact_counts.get("earth_vein_cave_f2", 0))
		< int(compact_counts.get("earth_vein_cave_f3", 0))
		and int(compact_counts.get("earth_vein_cave_f4", 0))
		<= int(compact_counts.get("earth_vein_cave", 0))
	):
		errors.append("一至三层路线密度必须递增，顶层必须收回到入口层或更低")
	return reports


func _run_scenario(host, scenario: Dictionary) -> Dictionary:
	var errors: Array[String] = []
	var map_id := str(scenario.get("mapId", ""))
	var focus_cell := scenario.get("cell", Vector2i(-1, -1)) as Vector2i
	if not host._load_map(map_id, "default"):
		errors.append("无法加载地图")
		return _scenario_report(scenario, {}, {}, [], errors)
	for _frame_index in range(6):
		await process_frame
	var prepared := host.map_visual_render_state as Dictionary
	if (
		str(host.current_map_id) != map_id
		or not bool(prepared.get("active", false))
		or not bool(prepared.get("qaPreview", false))
		or str(prepared.get("bundleId", "")) != BUNDLE_ID
	):
		errors.append("没有加载精确 pending QA 地图候选")
	var start_cell := IsoMapModel.spawn_cell(host.map_data)
	var path: Array[Vector2i] = IsoMapModel.find_path(host.map_data, start_cell, focus_cell)
	if path.is_empty() or path[0] != start_cell or path[path.size() - 1] != focus_cell:
		errors.append("层级焦点不是从权威出生点可达的格")
	host.player.clear_move_target()
	host._clear_navigation_state()
	host.player.global_position = IsoMapModel.grid_to_world(host.map_data, focus_cell)
	host._update_camera_position(true)
	for _frame_index in range(SETTLE_FRAMES):
		host.queue_redraw()
		await process_frame
	await RenderingServer.frame_post_draw
	var controller = MapVisualReviewCapture.new(host)
	var composition: Dictionary = controller._camera_composition_report()
	var scale_report := composition.get("worldSubjectScale", {}) as Dictionary
	if (
		str(scale_report.get("status", "")) != "passed"
		or str(scale_report.get("residentNpcPolicy", "")) != RESIDENT_NPC_POLICY
		or str(scale_report.get("npcRatioStatus", "")) != "not_applicable"
		or int(scale_report.get("npcSubjectCount", -1)) != 0
		or not bool(scale_report.get("playerHeightPassed", false))
		or not bool((scale_report.get("mapObjectScale", {}) as Dictionary).get("passed", false))
		or not bool(scale_report.get("passed", false))
	):
		errors.append("玩家／地图物件相对比例或 NPC non-applicable 合同失败")
	var motif_report := _visible_motif_report(
		host,
		controller,
		_string_array(scenario.get("requiredMotifIds", []))
	)
	for motif_error in _string_array(motif_report.get("errors", [])):
		errors.append(motif_error)
	var visible_range := scenario.get("visibleCompactRange", []) as Array
	var visible_compact_count := int(motif_report.get("visibleCompactCount", -1))
	if (
		visible_range.size() != 2
		or visible_compact_count < int(visible_range[0])
		or visible_compact_count > int(visible_range[1])
	):
		errors.append("真实画幅 compact density 越界")
	if not host._world_depth_npc_commands().is_empty():
		errors.append("真实 Main 出现常驻 NPC depth command")
	return _scenario_report(scenario, composition, motif_report, path, errors)


func _visible_motif_report(host, controller, required_ids: Array[String]) -> Dictionary:
	var opaque_rect_cache: Dictionary = {}
	var viewport_rect := Rect2(Vector2.ZERO, host.get_viewport_rect().size).grow(-8.0)
	var fixed_hud_rects: Array[Rect2] = []
	for value in host.world_camera_hud_blocker_rects:
		if value is Rect2 and (value as Rect2).size.x > 0.0 and (value as Rect2).size.y > 0.0:
			fixed_hud_rects.append(value as Rect2)
	var required_lookup: Dictionary = {}
	for required_id in required_ids:
		required_lookup[required_id] = false
	var visible_compact_ids: Array[String] = []
	var required_screen_rects: Dictionary = {}
	var errors: Array[String] = []
	var by_layer := host.map_visual_render_state.get("objectDrawsByLayer", {}) as Dictionary
	for layer_value in by_layer.values():
		if not (layer_value is Array):
			continue
		for value in layer_value as Array:
			if not (value is Dictionary):
				continue
			var command := value as Dictionary
			var instance_id := str(command.get("instanceId", ""))
			var object_id := str(command.get("objectId", ""))
			var world_rect: Rect2 = controller._command_opaque_world_rect(
				command,
				opaque_rect_cache
			)
			var screen_rect: Rect2 = controller._world_rect_to_screen_rect(world_rect)
			var fully_visible := viewport_rect.encloses(screen_rect)
			var clear_of_hud := true
			for blocker in fixed_hud_rects:
				if blocker.intersects(screen_rect):
					clear_of_hud = false
					break
			if COMPACT_OBJECT_IDS.has(object_id) and fully_visible and clear_of_hud:
				visible_compact_ids.append(instance_id)
			if required_lookup.has(instance_id):
				required_screen_rects[instance_id] = [
					screen_rect.position.x,
					screen_rect.position.y,
					screen_rect.size.x,
					screen_rect.size.y,
				]
				required_lookup[instance_id] = fully_visible and clear_of_hud
	for required_id in required_ids:
		if not bool(required_lookup.get(required_id, false)):
			errors.append("主导 motif 未完整进入无 HUD 遮挡画幅：%s" % required_id)
	visible_compact_ids.sort()
	return {
		"requiredMotifIds": required_ids,
		"requiredMotifScreenRects": required_screen_rects,
		"visibleCompactCount": visible_compact_ids.size(),
		"visibleCompactIds": visible_compact_ids,
		"errors": errors,
		"result": "PASS" if errors.is_empty() else "FAIL",
	}


func _scenario_report(
	scenario: Dictionary,
	composition: Dictionary,
	motif_report: Dictionary,
	path: Array[Vector2i],
	errors: Array[String]
) -> Dictionary:
	var focus_cell := scenario.get("cell", Vector2i(-1, -1)) as Vector2i
	return {
		"id": str(scenario.get("id", "")),
		"mapId": str(scenario.get("mapId", "")),
		"focusCell": [focus_cell.x, focus_cell.y],
		"reachablePathLength": path.size(),
		"worldSubjectScale": composition.get("worldSubjectScale", {}),
		"motifVisibility": motif_report,
		"errors": errors,
		"result": "PASS" if errors.is_empty() else "FAIL",
	}


func _validate_invocation(errors: Array[String]) -> void:
	var args := OS.get_cmdline_user_args()
	if args.count(QA_PREVIEW_ARG) != 1:
		errors.append("必须且只能从 Earth Vein 一层显式 QA preview 启动")
	if args.count(QA_LANE_ARG) != 1:
		errors.append("缺少唯一 automation QA lane 参数")
	for arg_value in args:
		var arg := str(arg_value)
		if arg != QA_PREVIEW_ARG and arg != QA_LANE_ARG:
			errors.append("不接受无关参数：%s" % arg)


func _finish(
	static_reports: Array[Dictionary],
	scenario_reports: Array[Dictionary],
	errors: Array[String]
) -> void:
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.earth_vein_floor_hierarchy_check",
		"scene": MAIN_SCENE,
		"bundleId": BUNDLE_ID,
		"viewport": [EXPECTED_VIEWPORT.x, EXPECTED_VIEWPORT.y],
		"residentNpcPolicy": RESIDENT_NPC_POLICY,
		"staticFloors": static_reports,
		"scenarios": scenario_reports,
		"errors": errors,
		"result": "PASS" if errors.is_empty() else "FAIL",
	}
	print("EARTH_VEIN_FLOOR_HIERARCHY_CHECK: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


static func _map_data_path(map_id: String) -> String:
	return "res://data/%s_map.json" % map_id


static func _profile_matches(actual: Dictionary, expected: Dictionary) -> bool:
	if actual.size() != expected.size():
		return false
	for key_value in expected.keys():
		var key := str(key_value)
		if not actual.has(key):
			return false
		var expected_value: Variant = expected[key]
		var actual_value: Variant = actual[key]
		if expected_value is int:
			if not (actual_value is int or actual_value is float):
				return false
			if int(actual_value) != int(expected_value):
				return false
		elif str(actual_value) != str(expected_value):
			return false
	return true


static func _read_json(path: String, errors: Array[String], label: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		errors.append("%s 不存在：%s" % [label, path])
		return {}
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (value is Dictionary):
		errors.append("%s 不是 JSON 对象：%s" % [label, path])
		return {}
	return value as Dictionary


static func _string_array(value: Variant) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result
