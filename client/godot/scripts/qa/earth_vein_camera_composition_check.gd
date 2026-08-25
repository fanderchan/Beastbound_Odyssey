extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapVisualReviewCapture := preload(
	"res://scripts/qa/map_visual_review_capture.gd"
)

const MAIN_SCENE := "res://scenes/Main.tscn"
const BUNDLE_ID := "earth_vein_cave_visual_v1"
const QA_PREVIEW_ARG := "--map-art-review-preview=earth_vein_cave"
const QA_LANE_ARG := "--beastbound-qa-user-data-lane=automation"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const SETTLE_FRAMES := 24
const SCENARIOS: Array[Dictionary] = [
	{
		"id": "f1_exit",
		"mapId": "earth_vein_cave",
		"cell": Vector2i(4, 20),
		"requiredIds": ["f1_exit_arch"],
		"nearestWarpId": "earth_vein_cave_exit",
	},
	{
		"id": "f1_upper_stair",
		"mapId": "earth_vein_cave",
		"cell": Vector2i(21, 7),
		"requiredIds": ["f1_upper_arch"],
		"nearestWarpId": "earth_vein_stair_1_to_2",
	},
	{
		"id": "f2_lower_stair",
		"mapId": "earth_vein_cave_f2",
		"cell": Vector2i(5, 20),
		"requiredIds": ["f2_lower_arch"],
		"nearestWarpId": "earth_vein_stair_2_to_1",
	},
	{
		"id": "f2_upper_stair",
		"mapId": "earth_vein_cave_f2",
		"cell": Vector2i(21, 7),
		"requiredIds": ["f2_upper_arch"],
		"nearestWarpId": "earth_vein_stair_2_to_3",
	},
	{
		"id": "f3_lower_stair",
		"mapId": "earth_vein_cave_f3",
		"cell": Vector2i(5, 20),
		"requiredIds": ["f3_lower_arch"],
		"nearestWarpId": "earth_vein_stair_3_to_2",
	},
	{
		"id": "f3_upper_stair",
		"mapId": "earth_vein_cave_f3",
		"cell": Vector2i(21, 7),
		"requiredIds": ["f3_upper_arch"],
		"nearestWarpId": "earth_vein_stair_3_to_4",
	},
	{
		"id": "f4_lower_stair",
		"mapId": "earth_vein_cave_f4",
		"cell": Vector2i(5, 22),
		"requiredIds": ["f4_lower_arch"],
		"nearestWarpId": "earth_vein_stair_4_to_3",
	},
	{
		"id": "f4_guardian",
		"mapId": "earth_vein_cave_f4",
		"cell": Vector2i(21, 8),
		"requiredIds": ["f4_guardian_plinth"],
		"nearestWarpId": "",
	},
	{
		"id": "f4_lineage",
		"mapId": "earth_vein_cave_f4",
		"cell": Vector2i(25, 13),
		"requiredIds": ["f4_lineage_plinth"],
		"nearestWarpId": "",
	},
	{
		"id": "f4_dual_resonance",
		"mapId": "earth_vein_cave_f4",
		"cell": Vector2i(22, 11),
		"requiredIds": ["f4_guardian_plinth", "f4_lineage_plinth"],
		"nearestWarpId": "",
	},
]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	_validate_invocation(errors)
	if errors.is_empty():
		var scene_error := change_scene_to_file(MAIN_SCENE)
		if scene_error != OK:
			errors.append("无法加载真实 Main.tscn：%s" % error_string(scene_error))
	for _frame_index in range(6):
		await process_frame
	var host = current_scene
	if host == null:
		errors.append("真实 Main.tscn 没有成为 current_scene")
		_finish([], errors)
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
	var viewport_size := Vector2i(host.get_viewport().get_visible_rect().size)
	if viewport_size != EXPECTED_VIEWPORT:
		errors.append("Earth Vein 构图检查必须运行 1280x720 Main")
	var scenario_reports: Array[Dictionary] = []
	for scenario in SCENARIOS:
		var scenario_report := await _run_scenario(host, scenario)
		scenario_reports.append(scenario_report)
		for scenario_error in _string_array(scenario_report.get("errors", [])):
			errors.append("%s：%s" % [str(scenario.get("id", "")), scenario_error])
	_finish(scenario_reports, errors)


func _run_scenario(host, scenario: Dictionary) -> Dictionary:
	var errors: Array[String] = []
	var map_id := str(scenario.get("mapId", ""))
	var focus_cell := scenario.get("cell", Vector2i(-1, -1)) as Vector2i
	if not host._load_map(map_id, "default"):
		errors.append("无法加载地图")
		return _scenario_report(scenario, {}, [], errors)
	for _frame_index in range(6):
		await process_frame
	var prepared := host.map_visual_render_state as Dictionary
	if (
		str(host.current_map_id) != map_id
		or str(host.map_data.get("id", "")) != map_id
		or not bool(prepared.get("active", false))
		or not bool(prepared.get("qaPreview", false))
		or str(prepared.get("bundleId", "")) != BUNDLE_ID
	):
		errors.append("没有加载精确 pending QA 地图候选")
	var default_cell := IsoMapModel.spawn_cell(host.map_data)
	var path: Array[Vector2i] = IsoMapModel.find_path(
		host.map_data,
		default_cell,
		focus_cell
	)
	if path.is_empty() or path[0] != default_cell or path[path.size() - 1] != focus_cell:
		errors.append("构图焦点不是从权威默认出生点可达的格")
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
	for key in [
		"playerAtEffectiveAnchor",
		"playerAlphaInsideSafeRect",
		"playerAlphaClearOfTaskHud",
		"playerAlphaClearOfFixedHud",
		"playerAlphaViewportEdgeClear",
	]:
		if not bool(composition.get(key, false)):
			errors.append("完整玩家 alpha／相机锚点失败：%s" % key)
	if str(composition.get("playerAlphaBoundsSource", "")) != "formal_action_alpha_union":
		errors.append("玩家安全构图没有使用完整动作 alpha")
	if not _string_array(
		composition.get("taskHudOverlappingBlockingObjectIds", [])
	).is_empty():
		errors.append("任务 HUD 仍覆盖可见 blocking/interaction 物件")
	if not _string_array(composition.get("hudOverlappingKeyEnvironmentIds", [])).is_empty():
		errors.append("固定 HUD 仍覆盖可见关键环境物件")
	var visible_ids := _string_array(composition.get("visibleKeyEnvironmentIds", []))
	var clipped_ids := _string_array(composition.get("viewportClippedKeyEnvironmentIds", []))
	var required_ids := _string_array(scenario.get("requiredIds", []))
	for required_id in required_ids:
		if not visible_ids.has(required_id):
			errors.append("端点地标没有进入真实视口：%s" % required_id)
		if clipped_ids.has(required_id):
			errors.append("端点地标被视口裁边：%s" % required_id)
	var nearest_warp_id := str(scenario.get("nearestWarpId", ""))
	if nearest_warp_id != "":
		var nearest_warp := composition.get("nearestWarp", {}) as Dictionary
		if (
			str(nearest_warp.get("id", "")) != nearest_warp_id
			or not bool(nearest_warp.get("insideSafeRect", false))
			or not bool(nearest_warp.get("edgeClear", false))
		):
			errors.append("相邻权威 warp 没有完整进入安全世界带")
	return _scenario_report(scenario, composition, path, errors)


func _scenario_report(
	scenario: Dictionary,
	composition: Dictionary,
	path: Array[Vector2i],
	errors: Array[String]
) -> Dictionary:
	var path_cells: Array = []
	for cell in path:
		path_cells.append([cell.x, cell.y])
	var focus_cell := scenario.get("cell", Vector2i(-1, -1)) as Vector2i
	return {
		"id": str(scenario.get("id", "")),
		"mapId": str(scenario.get("mapId", "")),
		"focusCell": [focus_cell.x, focus_cell.y],
		"requiredIds": _string_array(scenario.get("requiredIds", [])),
		"reachablePathLength": path.size(),
		"reachablePath": path_cells,
		"cameraComposition": composition,
		"errors": errors.duplicate(),
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


func _finish(scenario_reports: Array[Dictionary], errors: Array[String]) -> void:
	var passed_scenarios := scenario_reports.filter(
		func(value: Dictionary) -> bool:
			return str(value.get("result", "")) == "PASS"
	)
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.earth_vein_camera_composition_check",
		"scene": MAIN_SCENE,
		"bundleId": BUNDLE_ID,
		"viewport": [EXPECTED_VIEWPORT.x, EXPECTED_VIEWPORT.y],
		"scenarioCount": SCENARIOS.size(),
		"passedScenarioCount": passed_scenarios.size(),
		"scenarios": scenario_reports,
		"errors": errors.duplicate(),
		"result": "PASS" if errors.is_empty() else "FAIL",
	}
	print("EARTH_VEIN_CAMERA_COMPOSITION_CHECK: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


static func _string_array(value: Variant) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value as Array:
			result.append(str(item))
	return result
