extends SceneTree

const MapAwakenedPanel := preload("res://scripts/ui/map_awakened_panel.gd")
const MapAwakenedPresenter := preload("res://scripts/ui/map_awakened_presenter.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const QuestModel := preload("res://scripts/progression/quest_model.gd")

var _captured_local_target: Dictionary = {}
var _captured_map_id := ""
var _captured_map_label := ""
var _close_requested := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var stage := Control.new()
	stage.size = Vector2(1280.0, 720.0)
	root.add_child(stage)
	var panel := MapAwakenedPanel.new()
	panel.size = stage.size
	panel.route_target_requested.connect(func(target: Dictionary) -> void:
		_captured_local_target = target.duplicate(true)
	)
	panel.map_destination_requested.connect(func(map_id: String, label: String) -> void:
		_captured_map_id = map_id
		_captured_map_label = label
	)
	panel.close_requested.connect(func() -> void:
		_close_requested = true
	)
	stage.add_child(panel)

	var state := MapAwakenedPresenter.build_view_state(
		"firebud_village_gate",
		"火芽村入口",
		Vector2i(7, 9),
		Vector2i(10, 11),
		[{
			"id": "interaction:firebud_doctor",
			"kind": "interaction",
			"label": "村医阿萝",
			"displayText": "【村医】村医阿萝",
			"facilityType": "healer",
			"cell": Vector2i(8, 9),
			"worldPosition": Vector2(40.0, 20.0),
		}],
		_fixture_regions(),
		{
			"firebud_village_gate": "火芽村入口",
			"shadow_oath_cavern": "影誓洞窟一层",
			"shadow_oath_cavern_f2": "影誓洞窟二层",
		}
	)
	state["mapGrid"] = Vector2i(20, 16)
	state["playerWorldPosition"] = Vector2(12.0, 18.0)
	state["targetCell"] = Vector2i(10, 11)
	state["targetWorldPosition"] = Vector2(44.0, 24.0)
	panel.apply_view_state(
		state,
		{},
		Rect2(),
		_fallback_texture()
	)
	await process_frame
	await process_frame

	_expect(panel.is_awakened_map_panel(), "必须使用正式觉醒地图页", errors)
	_expect(panel.position == Vector2.ZERO, "正式地图页应从视口左上角开始", errors)
	_expect(panel.size == Vector2(1280.0, 720.0), "正式地图页应覆盖完整视口", errors)
	_expect(panel.current_mode() == MapAwakenedPresenter.MODE_LOCAL, "打开时应显示当前地图", errors)
	_expect(
		not MapAwakenedPanel.can_use_prepared_visual({}, Rect2()),
		"无正式地图视觉时必须进入fallback分支",
		errors
	)
	_expect(
		MapAwakenedPanel.can_use_prepared_visual(
			{
				"active": true,
				"atlasTexture": _fallback_texture(),
				"groundDraws": [],
			},
			Rect2(Vector2.ZERO, Vector2(900.0, 520.0))
		),
		"正式地图视觉和有效世界边界应共用prepared判定",
		errors
	)
	_expect(
		not MapAwakenedPanel.can_use_prepared_visual(
			{"active": true},
			Rect2(Vector2.ZERO, Vector2(900.0, 520.0))
		),
		"缺少正式atlas的active状态不能吞掉fallback",
		errors
	)
	_expect(panel.local_tab_button() != null, "缺少稳定的本地地图页签 getter", errors)
	_expect(panel.world_tab_button() != null, "缺少稳定的世界地图页签 getter", errors)
	_expect(
		panel.legacy_texture_rect.texture != null and not panel.uses_prepared_visual(),
		"无正式地图视觉时仍应显示fallback地形",
		errors
	)
	_expect(
		panel.legacy_detail_label.text.find("火芽村入口") >= 0,
		"当前地图摘要缺少地图名",
		errors
	)
	_expect(
		panel.marker_buttons.has("interaction:firebud_doctor"),
		"当前地图目标未进入正式列表",
		errors
	)
	var local_button := panel.marker_buttons.get("interaction:firebud_doctor") as Button
	if local_button != null:
		local_button.pressed.emit()
	_expect(
		str(_captured_local_target.get("id", "")) == "interaction:firebud_doctor",
		"当前地图按钮未透传真实寻路目标",
		errors
	)
	await _check_prepared_static_cache(panel, state, errors)

	panel.world_tab_button().pressed.emit()
	await process_frame
	_expect(panel.current_mode() == MapAwakenedPresenter.MODE_WORLD, "世界地图页签未切换", errors)
	_expect(panel.uses_world_atlas_visual(), "世界地图应使用正式 atlas 视觉", errors)
	_expect(panel.world_region_count() == 2, "世界地图区域数量错误", errors)
	var region_button := panel.world_region_button("shadow_oath_cavern")
	_expect(region_button != null, "缺少稳定的区域按钮 getter", errors)
	if region_button != null:
		region_button.pressed.emit()
	var floor_route_button := panel.world_route_button("shadow_oath_cavern_f2")
	_expect(floor_route_button != null, "缺少稳定的地图路线按钮 getter", errors)
	if floor_route_button != null:
		floor_route_button.pressed.emit()
	_expect(_captured_map_id == "shadow_oath_cavern_f2", "地点按钮未发出真实地图目标", errors)
	var route_button := panel.world_entry_route_button()
	_expect(route_button != null, "缺少稳定的区域路线按钮 getter", errors)
	_expect(route_button != null and not route_button.disabled, "跨区域路线按钮不应禁用", errors)
	if route_button != null:
		route_button.pressed.emit()
	_expect(_captured_map_id == "shadow_oath_cavern", "区域入口未发出真实地图目标", errors)

	panel.close_button.pressed.emit()
	_expect(_close_requested, "关闭按钮未发出恢复世界界面的请求", errors)
	_check_tutorial_event_fast_gate(errors)
	_check_world_lightweight_layout_source_contract(errors)
	_check_prepared_static_cache_source_contract(errors)
	print("MAP_AWAKENED_PANEL_CHECK: %s" % JSON.stringify({
		"ok": errors.is_empty(),
		"errors": errors,
		"mode": panel.current_mode(),
		"regionCount": panel.world_region_count(),
		"capturedMapId": _captured_map_id,
		"closeRequested": _close_requested,
	}))
	quit(0 if errors.is_empty() else 1)


func _fixture_regions() -> Array[Dictionary]:
	return [
		{
			"id": "firebud_village",
			"label": "火芽村",
			"type": "village",
			"entryMapId": "firebud_village_gate",
			"mapIds": ["firebud_village_gate"],
			"levelRange": {},
		},
		{
			"id": "shadow_oath_cavern",
			"label": "影誓洞窟",
			"type": "dungeon",
			"entryMapId": "shadow_oath_cavern",
			"mapIds": ["shadow_oath_cavern", "shadow_oath_cavern_f2"],
			"floorOrder": ["shadow_oath_cavern", "shadow_oath_cavern_f2"],
			"levelRange": {"min": 70, "max": 90},
		},
	]


func _fallback_texture() -> Texture2D:
	var image := Image.create(420, 220, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.16, 0.24, 0.18, 1.0))
	return ImageTexture.create_from_image(image)


func _check_prepared_static_cache(
	panel: MapAwakenedPanel,
	base_state: Dictionary,
	errors: Array[String]
) -> void:
	var prepared_texture := _fallback_texture()
	var prepared_visual := {
		"active": true,
		"atlasTexture": prepared_texture,
		"groundDraws": [],
	}
	var world_bounds := Rect2(Vector2.ZERO, Vector2(900.0, 520.0))
	var state := base_state.duplicate(true)
	state["mapNames"] = {
		"firebud_village_gate": "火芽村入口",
		"shadow_oath_cavern": "影誓洞窟一层",
		"shadow_oath_cavern_f2": "影誓洞窟二层",
	}
	state["mapVisualRevision"] = 1
	state["mapCatalogRevision"] = "fixture-catalog-1"
	state["mapRouteContractRevision"] = "fixture-route-uninitialized"
	panel.reset_static_cache_counters_for_qa()
	panel.apply_view_state(state, prepared_visual, world_bounds, null)
	var first := panel.static_cache_counters_for_qa()
	_expect_cache_counts(first, 1, 1, 1, 1, 1, true, "prepared首开", errors)

	var dynamic_state := state.duplicate(true)
	dynamic_state["playerCell"] = Vector2i(9, 10)
	dynamic_state["playerWorldPosition"] = Vector2(72.0, 33.0)
	dynamic_state["targetCell"] = Vector2i(12, 13)
	dynamic_state["targetWorldPosition"] = Vector2(88.0, 46.0)
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	var dynamic_counts := panel.static_cache_counters_for_qa()
	_expect_cache_counts(
		dynamic_counts,
		1,
		1,
		1,
		1,
		2,
		true,
		"仅动态marker变化",
		errors
	)
	_expect(
		panel.legacy_detail_label.text.find("9,10") >= 0,
		"prepared缓存命中时仍须刷新动态坐标摘要",
		errors
	)
	var queued_sidebar_child: Node = null
	for child in panel.marker_container.get_children():
		if not (child is Button):
			queued_sidebar_child = child
			break
	if queued_sidebar_child != null:
		queued_sidebar_child.queue_free()
	var before_queued_sidebar_child := panel.static_cache_counters_for_qa()
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_queued_sidebar_child,
		panel.static_cache_counters_for_qa(),
		{"sidebarRebuilds": 1, "markerRebuilds": 1},
		"sidebar非按钮child同帧queue_free不得假命中静态缓存",
		errors
	)
	await process_frame
	_expect(
		not is_instance_valid(queued_sidebar_child),
		"sidebar queue_free child必须在跨帧前已由静态子树重建替换",
		errors
	)

	panel.marker_buttons.erase("interaction:firebud_doctor")
	var before_missing_key := panel.static_cache_counters_for_qa()
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_missing_key,
		panel.static_cache_counters_for_qa(),
		{"sidebarRebuilds": 1, "markerRebuilds": 1},
		"sidebar字典key缺失",
		errors
	)
	var destination_buttons_value = panel.get("_local_destination_buttons")
	_expect(
		destination_buttons_value is Dictionary
		and (destination_buttons_value as Dictionary).has(
			"firebud_village_gate"
		),
		"prepared sidebar必须登记区域地点按钮key",
		errors
	)
	if destination_buttons_value is Dictionary:
		(destination_buttons_value as Dictionary).erase("firebud_village_gate")
	var before_missing_destination_key := panel.static_cache_counters_for_qa()
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_missing_destination_key,
		panel.static_cache_counters_for_qa(),
		{"sidebarRebuilds": 1, "markerRebuilds": 1},
		"sidebar区域地点字典key缺失",
		errors
	)
	var region_buttons_value = panel.get("_world_region_buttons")
	_expect(
		region_buttons_value is Dictionary
		and (region_buttons_value as Dictionary).has("firebud_village"),
		"prepared atlas必须登记区域按钮key",
		errors
	)
	if region_buttons_value is Dictionary:
		(region_buttons_value as Dictionary).erase("firebud_village")
	var before_missing_region_key := panel.static_cache_counters_for_qa()
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_missing_region_key,
		panel.static_cache_counters_for_qa(),
		{"regionRebuilds": 1, "markerRebuilds": 1},
		"atlas区域字典key缺失",
		errors
	)
	var route_buttons_value = panel.get("_world_route_buttons")
	_expect(
		route_buttons_value is Dictionary
		and (route_buttons_value as Dictionary).has("firebud_village_gate"),
		"prepared区域详情必须登记路线按钮key",
		errors
	)
	if route_buttons_value is Dictionary:
		(route_buttons_value as Dictionary).erase("firebud_village_gate")
	var before_missing_route_key := panel.static_cache_counters_for_qa()
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_missing_route_key,
		panel.static_cache_counters_for_qa(),
		{"detailRebuilds": 1, "markerRebuilds": 1},
		"区域详情路线字典key缺失",
		errors
	)
	var detached_entry := panel.world_entry_route_button()
	var detached_entry_id := (
		detached_entry.get_instance_id()
		if detached_entry != null
		else 0
	)
	if detached_entry != null and detached_entry.get_parent() != null:
		detached_entry.get_parent().remove_child(detached_entry)
	var before_fixed_root_repair := panel.static_cache_counters_for_qa()
	panel.apply_view_state(dynamic_state, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_fixed_root_repair,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"canvasConfigures": 1,
			"markerRebuilds": 1,
		},
		"固定详情按钮detach后的全panel fail-safe重建",
		errors
	)
	var repaired_entry := panel.world_entry_route_button()
	_expect(
		repaired_entry != null
		and repaired_entry.get_instance_id() != detached_entry_id
		and repaired_entry.get_parent() == panel.get("_world_detail_column"),
		"固定UI root损坏后必须回收旧节点并恢复正确父链",
		errors
	)

	var latest_target_state := dynamic_state.duplicate(true)
	var latest_targets := (latest_target_state.get("localTargets", []) as Array).duplicate(true)
	var latest_target := (latest_targets[0] as Dictionary).duplicate(true)
	latest_target["label"] = "村医阿萝（新位置）"
	latest_target["displayText"] = "【村医】村医阿萝（新位置）"
	latest_target["cell"] = Vector2i(13, 14)
	latest_target["worldPosition"] = Vector2(111.0, 75.0)
	latest_target["interaction"] = {"action": "heal_latest"}
	latest_targets[0] = latest_target
	latest_target_state["localTargets"] = latest_targets
	var cached_button := panel.marker_buttons.get(
		"interaction:firebud_doctor"
	) as Button
	var replaced_target_state := latest_target_state.duplicate(true)
	var replaced_targets := (
		(replaced_target_state.get("localTargets", []) as Array).duplicate(true)
	)
	var replacement := (replaced_targets[0] as Dictionary).duplicate(true)
	replacement["id"] = "interaction:different_target"
	replacement["label"] = "另一个目标"
	replaced_targets[0] = replacement
	replaced_target_state["localTargets"] = replaced_targets
	panel.set("_view_state", replaced_target_state)
	_captured_local_target = {}
	if cached_button != null:
		cached_button.pressed.emit()
	_expect(
		_captured_local_target.is_empty(),
		"缓存按钮稳定ID消失时不得按旧index误寻路到另一个目标",
		errors
	)
	panel.set("_view_state", latest_target_state.duplicate(true))
	_captured_local_target = {}
	if cached_button != null:
		cached_button.pressed.emit()
	_expect(
		str(_captured_local_target.get("label", "")) == "村医阿萝（新位置）"
		and _captured_local_target.get("cell", Vector2i.ZERO) == Vector2i(13, 14)
		and str(
			(_captured_local_target.get("interaction", {}) as Dictionary).get(
				"action",
				""
			)
		) == "heal_latest",
		"缓存按钮必须只捕获稳定ID并从最新view-state解析完整寻路payload",
		errors
	)
	var latest_destination_state := latest_target_state.duplicate(true)
	var latest_current_region := (
		(latest_destination_state.get("currentRegion", {}) as Dictionary).duplicate(true)
	)
	var latest_points := (
		(latest_current_region.get("points", []) as Array).duplicate(true)
	)
	var latest_point := (latest_points[0] as Dictionary).duplicate(true)
	latest_point["label"] = "火芽村入口（最新目录）"
	latest_points[0] = latest_point
	latest_current_region["points"] = latest_points
	latest_destination_state["currentRegion"] = latest_current_region
	var latest_destination_buttons_value = panel.get(
		"_local_destination_buttons"
	)
	var cached_destination_button := (
		(latest_destination_buttons_value as Dictionary).get(
			"firebud_village_gate"
		) as Button
		if latest_destination_buttons_value is Dictionary
		else null
	)
	panel.set("_view_state", latest_destination_state)
	_captured_map_id = ""
	_captured_map_label = ""
	if cached_destination_button != null:
		cached_destination_button.pressed.emit()
	_expect(
		_captured_map_id == "firebud_village_gate"
		and _captured_map_label == "火芽村入口（最新目录）",
		"缓存地点按钮必须按稳定mapId从最新view-state读取新文案",
		errors
	)
	var removed_destination_state := latest_destination_state.duplicate(true)
	var removed_current_region := (
		(removed_destination_state.get("currentRegion", {}) as Dictionary).duplicate(true)
	)
	removed_current_region["points"] = []
	removed_current_region["entryMapId"] = "removed_entry"
	removed_destination_state["currentRegion"] = removed_current_region
	var removed_regions := (
		(removed_destination_state.get("worldRegions", []) as Array).duplicate(true)
	)
	for index in range(removed_regions.size()):
		if not (removed_regions[index] is Dictionary):
			continue
		var removed_region := (removed_regions[index] as Dictionary).duplicate(true)
		removed_region["points"] = []
		if str(removed_region.get("entryMapId", "")) == "firebud_village_gate":
			removed_region["entryMapId"] = "removed_entry"
		removed_regions[index] = removed_region
	removed_destination_state["worldRegions"] = removed_regions
	panel.set("_view_state", removed_destination_state)
	_captured_map_id = ""
	_captured_map_label = ""
	if cached_destination_button != null:
		cached_destination_button.pressed.emit()
	_expect(
		_captured_map_id == "" and _captured_map_label == "",
		"缓存地点稳定ID从最新目录消失时必须no-op，不得发出过期寻路",
		errors
	)
	panel.set("_view_state", latest_target_state.duplicate(true))
	var before_target_change := panel.static_cache_counters_for_qa()
	panel.apply_view_state(
		latest_target_state,
		prepared_visual,
		world_bounds,
		null
	)
	_expect_cache_delta(
		before_target_change,
		panel.static_cache_counters_for_qa(),
		{"sidebarRebuilds": 1, "markerRebuilds": 1},
		"localTargets完整payload变化",
		errors
	)

	var route_changed := latest_target_state.duplicate(true)
	route_changed["mapRouteContractRevision"] = "fixture-route-ready-37-71"
	var before_route := panel.static_cache_counters_for_qa()
	panel.apply_view_state(route_changed, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_route,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"markerRebuilds": 1,
		},
		"路线合同revision变化",
		errors
	)

	var visual_changed := route_changed.duplicate(true)
	visual_changed["mapVisualRevision"] = 2
	var before_visual := panel.static_cache_counters_for_qa()
	panel.apply_view_state(visual_changed, prepared_visual, world_bounds, null)
	_expect_cache_delta(
		before_visual,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"canvasConfigures": 1,
			"markerRebuilds": 1,
		},
		"地图视觉revision变化",
		errors
	)

	var larger_bounds := Rect2(Vector2(-10.0, -5.0), Vector2(920.0, 540.0))
	var before_bounds := panel.static_cache_counters_for_qa()
	panel.apply_view_state(visual_changed, prepared_visual, larger_bounds, null)
	_expect_cache_delta(
		before_bounds,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"canvasConfigures": 1,
			"markerRebuilds": 1,
		},
		"世界边界变化",
		errors
	)

	var region_changed := visual_changed.duplicate(true)
	var region_states := (region_changed.get("worldRegions", []) as Array).duplicate(true)
	var shadow_region := (region_states[1] as Dictionary).duplicate(true)
	shadow_region["label"] = "影誓洞窟（新目录）"
	region_states[1] = shadow_region
	region_changed["worldRegions"] = region_states
	region_changed["mapCatalogRevision"] = "fixture-catalog-2"
	var before_region := panel.static_cache_counters_for_qa()
	panel.apply_view_state(region_changed, prepared_visual, larger_bounds, null)
	_expect_cache_delta(
		before_region,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"markerRebuilds": 1,
		},
		"区域／catalog revision变化",
		errors
	)
	var map_changed := region_changed.duplicate(true)
	map_changed["currentMapId"] = "shadow_oath_cavern"
	map_changed["currentMapName"] = "影誓洞窟一层"
	var before_map := panel.static_cache_counters_for_qa()
	panel.apply_view_state(map_changed, prepared_visual, larger_bounds, null)
	_expect_cache_delta(
		before_map,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"canvasConfigures": 1,
			"markerRebuilds": 1,
		},
		"currentMap变化",
		errors
	)

	var canvas := panel.get("_map_canvas") as Node
	var queued_canvas_id := canvas.get_instance_id() if canvas != null else 0
	if canvas != null:
		canvas.queue_free()
	var before_canvas_repair := panel.static_cache_counters_for_qa()
	panel.apply_view_state(map_changed, prepared_visual, larger_bounds, null)
	_expect_cache_delta(
		before_canvas_repair,
		panel.static_cache_counters_for_qa(),
		{"canvasConfigures": 1, "markerRebuilds": 1},
		"prepared canvas节点丢失重建",
		errors
	)
	var repaired_canvas := panel.get("_map_canvas") as Node
	var repaired_viewport := panel.get("_map_viewport") as Node
	_expect(
		panel.uses_prepared_visual()
		and repaired_canvas != null
		and repaired_canvas.get_instance_id() != queued_canvas_id
		and not repaired_canvas.is_queued_for_deletion()
		and repaired_canvas.get_parent() == repaired_viewport,
		"queue_free canvas必须在同调用重建且继续使用prepared视觉",
		errors
	)
	await process_frame
	_expect(
		is_instance_valid(repaired_canvas)
		and not repaired_canvas.is_queued_for_deletion()
		and repaired_canvas.get_parent() == panel.get("_map_viewport"),
		"queue_free canvas重建实例必须跨帧稳定",
		errors
	)

	var viewport := panel.get("_map_viewport") as Node
	var queued_viewport_id := viewport.get_instance_id() if viewport != null else 0
	var viewport_canvas := panel.get("_map_canvas") as Node
	var queued_viewport_canvas_id := (
		viewport_canvas.get_instance_id()
		if viewport_canvas != null
		else 0
	)
	if viewport != null:
		viewport.queue_free()
	var before_viewport_repair := panel.static_cache_counters_for_qa()
	panel.apply_view_state(map_changed, prepared_visual, larger_bounds, null)
	_expect_cache_delta(
		before_viewport_repair,
		panel.static_cache_counters_for_qa(),
		{"canvasConfigures": 1, "markerRebuilds": 1},
		"prepared viewport同帧queue_free重建",
		errors
	)
	var repaired_viewport_after_queue := panel.get("_map_viewport") as Node
	var repaired_canvas_after_viewport_queue := panel.get("_map_canvas") as Node
	_expect(
		repaired_viewport_after_queue != null
		and repaired_canvas_after_viewport_queue != null
		and repaired_viewport_after_queue.get_instance_id() != queued_viewport_id
		and repaired_canvas_after_viewport_queue.get_instance_id()
			!= queued_viewport_canvas_id
		and not repaired_viewport_after_queue.is_queued_for_deletion()
		and not repaired_canvas_after_viewport_queue.is_queued_for_deletion()
		and repaired_canvas_after_viewport_queue.get_parent()
			== repaired_viewport_after_queue,
		"queue_free viewport必须同调用换新viewport与canvas父链",
		errors
	)
	await process_frame
	_expect(
		is_instance_valid(repaired_viewport_after_queue)
		and is_instance_valid(repaired_canvas_after_viewport_queue)
		and not repaired_viewport_after_queue.is_queued_for_deletion()
		and not repaired_canvas_after_viewport_queue.is_queued_for_deletion(),
		"queue_free viewport/canvas重建实例必须跨帧稳定",
		errors
	)
	var invalid_revision := map_changed.duplicate(true)
	invalid_revision.erase("mapRouteContractRevision")
	var before_invalid := panel.static_cache_counters_for_qa()
	panel.apply_view_state(
		invalid_revision,
		prepared_visual,
		larger_bounds,
		null
	)
	_expect_cache_delta(
		before_invalid,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"canvasConfigures": 1,
			"markerRebuilds": 1,
		},
		"缺少route revision的prepared状态",
		errors
	)
	_expect(
		not bool(
			panel.static_cache_counters_for_qa().get("cacheActive", true)
		),
		"prepared签名缺失时必须fail-safe禁用静态缓存",
		errors
	)
	var before_invalid_repeat := panel.static_cache_counters_for_qa()
	panel.apply_view_state(
		invalid_revision,
		prepared_visual,
		larger_bounds,
		null
	)
	_expect_cache_delta(
		before_invalid_repeat,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"canvasConfigures": 1,
			"markerRebuilds": 1,
		},
		"无效prepared状态重复打开",
		errors
	)

	var fallback := _fallback_texture()
	var before_fallback := panel.static_cache_counters_for_qa()
	panel.apply_view_state(map_changed, {}, Rect2(), fallback)
	var after_fallback := panel.static_cache_counters_for_qa()
	_expect_cache_delta(
		before_fallback,
		after_fallback,
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"markerRebuilds": 1,
		},
		"prepared转nonprepared",
		errors
	)
	_expect(
		not bool(after_fallback.get("cacheActive", true))
		and not panel.uses_prepared_visual()
		and panel.legacy_texture_rect.texture == fallback,
		"nonprepared必须绕过缓存并消费本次fresh fallback",
		errors
	)
	var before_second_fallback := panel.static_cache_counters_for_qa()
	panel.apply_view_state(map_changed, {}, Rect2(), fallback)
	_expect_cache_delta(
		before_second_fallback,
		panel.static_cache_counters_for_qa(),
		{
			"sidebarRebuilds": 1,
			"regionRebuilds": 1,
			"detailRebuilds": 1,
			"markerRebuilds": 1,
		},
		"nonprepared重复打开不得命中静态缓存",
		errors
	)
	var invalid_selection_state := base_state.duplicate(true)
	var invalid_selection_regions := (
		(invalid_selection_state.get("worldRegions", []) as Array).duplicate(true)
	)
	invalid_selection_state["currentRegion"] = (
		(invalid_selection_regions[1] as Dictionary).duplicate(true)
	)
	panel.set("_selected_world_region_id", "removed_region")
	panel.apply_view_state(
		invalid_selection_state,
		{},
		Rect2(),
		_fallback_texture()
	)
	_expect(
		str(panel.get("_selected_world_region_id")) == "firebud_village",
		"已失效的非空区域选择必须保持旧语义回退catalog首项，而非改选currentRegion",
		errors
	)

	var shared_destination_state := latest_destination_state.duplicate(true)
	var shared_regions := (
		(shared_destination_state.get("worldRegions", []) as Array).duplicate(true)
	)
	for index in range(shared_regions.size()):
		if not (shared_regions[index] is Dictionary):
			continue
		var shared_region := (shared_regions[index] as Dictionary).duplicate(true)
		var shared_region_id := str(shared_region.get("id", ""))
		var shared_points := (
			(shared_region.get("points", []) as Array).duplicate(true)
		)
		if shared_region_id == "firebud_village":
			shared_points.append({
				"mapId": "shadow_oath_cavern_f2",
				"label": "跨区域同ID错误文案",
				"meta": "不应命中",
				"current": false,
			})
		elif shared_region_id == "shadow_oath_cavern":
			shared_region["entryMapName"] = "影誓洞窟区域入口（最新）"
			for point_index in range(shared_points.size()):
				if not (shared_points[point_index] is Dictionary):
					continue
				var shared_point := (
					(shared_points[point_index] as Dictionary).duplicate(true)
				)
				if str(shared_point.get("mapId", "")) == "shadow_oath_cavern":
					shared_point["label"] = "同ID普通地点文案"
				elif str(shared_point.get("mapId", "")) == "shadow_oath_cavern_f2":
					shared_point["label"] = "影誓洞窟二层（最新区域）"
				shared_points[point_index] = shared_point
		shared_region["points"] = shared_points
		shared_regions[index] = shared_region
	shared_destination_state["worldRegions"] = shared_regions
	panel.set("_selected_world_region_id", "shadow_oath_cavern")
	panel.apply_view_state(
		shared_destination_state,
		prepared_visual,
		larger_bounds,
		null
	)
	var shared_route_button := panel.world_route_button(
		"shadow_oath_cavern_f2"
	)
	_captured_map_id = ""
	_captured_map_label = ""
	if shared_route_button != null:
		shared_route_button.pressed.emit()
	_expect(
		_captured_map_id == "shadow_oath_cavern_f2"
		and _captured_map_label == "影誓洞窟二层（最新区域）",
		"同mapId跨区域时详情按钮必须按捕获regionId读取最新区域payload",
		errors
	)
	var shared_entry_button := panel.world_entry_route_button()
	_captured_map_id = ""
	_captured_map_label = ""
	if shared_entry_button != null:
		shared_entry_button.pressed.emit()
	_expect(
		_captured_map_id == "shadow_oath_cavern"
		and _captured_map_label == "影誓洞窟区域入口（最新）",
		"entry与普通point共用mapId时必须保留最新entryMapName语义",
		errors
	)
	var removed_shared_region_state := shared_destination_state.duplicate(true)
	var retained_regions: Array = []
	for value in removed_shared_region_state.get("worldRegions", []) as Array:
		if (
			value is Dictionary
			and str((value as Dictionary).get("id", ""))
				!= "shadow_oath_cavern"
		):
			retained_regions.append((value as Dictionary).duplicate(true))
	removed_shared_region_state["worldRegions"] = retained_regions
	panel.set("_view_state", removed_shared_region_state)
	_captured_map_id = ""
	_captured_map_label = ""
	if shared_route_button != null:
		shared_route_button.pressed.emit()
	_expect(
		_captured_map_id == "" and _captured_map_label == "",
		"缓存详情按钮的regionId从最新目录消失时必须no-op",
		errors
	)
	if shared_entry_button != null:
		shared_entry_button.pressed.emit()
	_expect(
		_captured_map_id == "" and _captured_map_label == "",
		"缓存区域入口的selected region消失时必须no-op",
		errors
	)
	panel.apply_view_state(base_state, {}, Rect2(), _fallback_texture())
	var queued_local_tab := panel.local_tab_button()
	var queued_local_tab_id := (
		queued_local_tab.get_instance_id()
		if queued_local_tab != null
		else 0
	)
	var queued_local_tab_parent: Node = (
		queued_local_tab.get_parent() as Node
		if queued_local_tab != null
		else null
	)
	if queued_local_tab_parent != null:
		queued_local_tab_parent.queue_free()
	panel.reset_to_local_view()
	var repaired_local_tab := panel.local_tab_button()
	_expect(
		panel.current_mode() == MapAwakenedPresenter.MODE_LOCAL
		and repaired_local_tab != null
		and repaired_local_tab.get_instance_id() != queued_local_tab_id
		and not repaired_local_tab.is_queued_for_deletion(),
		"真实打开前reset必须先自愈同帧queue_free的页签root再切本地模式",
		errors
	)
	panel.apply_view_state(base_state, {}, Rect2(), _fallback_texture())
	await process_frame
	_expect(
		is_instance_valid(repaired_local_tab)
		and not repaired_local_tab.is_queued_for_deletion()
		and repaired_local_tab == panel.local_tab_button()
		and panel.current_mode() == MapAwakenedPresenter.MODE_LOCAL,
		"页签root自愈与后续apply必须跨帧稳定",
		errors
	)


func _expect_cache_counts(
	actual: Dictionary,
	sidebar: int,
	regions: int,
	detail: int,
	canvas: int,
	markers: int,
	cache_active: bool,
	context: String,
	errors: Array[String]
) -> void:
	_expect(
		int(actual.get("sidebarRebuilds", -1)) == sidebar
		and int(actual.get("regionRebuilds", -1)) == regions
		and int(actual.get("detailRebuilds", -1)) == detail
		and int(actual.get("canvasConfigures", -1)) == canvas
		and int(actual.get("markerRebuilds", -1)) == markers
		and bool(actual.get("cacheActive", not cache_active)) == cache_active,
		"%s缓存计数错误：%s" % [context, JSON.stringify(actual)],
		errors
	)


func _expect_cache_delta(
	before: Dictionary,
	after: Dictionary,
	expected_delta: Dictionary,
	context: String,
	errors: Array[String]
) -> void:
	for key in [
		"sidebarRebuilds",
		"regionRebuilds",
		"detailRebuilds",
		"canvasConfigures",
		"markerRebuilds",
	]:
		var expected := int(expected_delta.get(key, 0))
		var actual := int(after.get(key, -1)) - int(before.get(key, -1))
		_expect(
			actual == expected,
			"%s %s增量错误：expected=%d actual=%d" % [
				context,
				key,
				expected,
				actual,
			],
			errors
		)


func _check_tutorial_event_fast_gate(errors: Array[String]) -> void:
	var map_event := {
		"type": "open_feature",
		"featureId": "map",
	}
	var match_profile := _tutorial_quest_profile(
		"quest_open_map_panel",
		QuestModel.STATUS_ACTIVE
	)
	_expect(
		PlayerProgressModel.active_quest_event_match_certainty(
			match_profile,
			map_event,
			true
		) == PlayerProgressModel.QUEST_EVENT_MATCH,
		"地图任务必须命中教程事件快门",
		errors
	)
	var mismatch_profile := _tutorial_quest_profile(
		"quest_bank_intro",
		QuestModel.STATUS_ACTIVE
	)
	_expect(
		PlayerProgressModel.active_quest_event_match_certainty(
			mismatch_profile,
			map_event,
			true
		) == PlayerProgressModel.QUEST_EVENT_NO_MATCH,
		"完整本地非地图任务应能证明事件不匹配",
		errors
	)
	var uncertain_profiles: Array[Dictionary] = []
	var empty_profile := _tutorial_quest_profile(
		"quest_open_map_panel",
		QuestModel.STATUS_ACTIVE
	)
	empty_profile["activeQuestId"] = ""
	uncertain_profiles.append(empty_profile)
	uncertain_profiles.append(_tutorial_quest_profile(
		"quest_bank_intro",
		QuestModel.STATUS_CLAIMED
	))
	uncertain_profiles.append(_tutorial_quest_profile(
		"quest_missing_after_migration",
		QuestModel.STATUS_ACTIVE
	))
	uncertain_profiles.append(_tutorial_quest_profile(
		"side_firebud_welfare_chat",
		QuestModel.STATUS_ACTIVE
	))
	uncertain_profiles.append(_tutorial_quest_profile(
		"quest_rebirth_2_guidance",
		QuestModel.STATUS_ACTIVE
	))
	for index in range(uncertain_profiles.size()):
		var uncertain_profile := uncertain_profiles[index]
		_expect(
			PlayerProgressModel.active_quest_event_match_certainty(
				uncertain_profile,
				map_event,
				true
			) == PlayerProgressModel.QUEST_EVENT_UNCERTAIN,
			"空／已领取／无效／可选／不可用任务必须保留权威归一化路径：%d" % index,
			errors
		)
		var normalized := PlayerProgressModel.normalize_profile(
			uncertain_profile
		)
		_expect(
			PlayerProgressModel.active_quest_id(normalized, true) == "quest_open_map_panel",
			"不确定任务归一化后必须回到地图教学：%d" % index,
			errors
		)
		var result := PlayerProgressModel.record_quest_event(
			normalized,
			map_event
		)
		_expect(
			bool(result.get("changed", false))
			and str(result.get("questId", "")) == "quest_open_map_panel",
			"不确定任务不得被快门吞掉地图教学推进：%d" % index,
			errors
		)
	var missing_schema := match_profile.duplicate(true)
	missing_schema.erase("schemaVersion")
	_expect(
		PlayerProgressModel.active_quest_event_match_certainty(
			missing_schema,
			map_event,
			true
		) == PlayerProgressModel.QUEST_EVENT_UNCERTAIN,
		"缺少显式本地schema的旧档必须保留权威归一化路径",
		errors
	)
	_check_tutorial_fast_gate_source_contract(errors)


func _tutorial_quest_profile(
	active_quest_id: String,
	active_status: String
) -> Dictionary:
	var profile := PlayerProgressModel.normalize_profile(
		PlayerProgressModel.default_profile()
	)
	profile["activeQuestId"] = active_quest_id
	var states := {
		"quest_intro_talk": {
			"status": QuestModel.STATUS_CLAIMED,
			"progress": 1,
		},
		"quest_open_task_panel": {
			"status": QuestModel.STATUS_CLAIMED,
			"progress": 1,
		},
	}
	states[active_quest_id] = {
		"status": active_status,
		"progress": 0,
	}
	profile["questStates"] = states
	return profile


func _check_tutorial_fast_gate_source_contract(errors: Array[String]) -> void:
	var pfc_source := FileAccess.get_file_as_string(
		"res://scripts/ui/panel_flow_coordinator.gd"
	)
	var model_source := FileAccess.get_file_as_string(
		"res://scripts/progression/player_progress_model.gd"
	)
	var pfc_start := pfc_source.find(
		"func _record_tutorial_feature_opened(feature_id: String) -> void:"
	)
	var pfc_end := pfc_source.find(
		"\n\nfunc _queue_server_quest_record_event(",
		pfc_start
	)
	var pfc_slice := (
		pfc_source.substr(pfc_start, pfc_end - pfc_start)
		if pfc_start >= 0 and pfc_end > pfc_start
		else ""
	)
	var model_start := model_source.find(
		"static func active_quest_event_match_certainty("
	)
	var model_end := model_source.find(
		"\n\nstatic func record_current_battle_pet_quest(",
		model_start
	)
	var model_slice := (
		model_source.substr(model_start, model_end - model_start)
		if model_start >= 0 and model_end > model_start
		else ""
	)
	var server_index := pfc_slice.find(
		"if not (_is_server_account_session() and not auth_auto_bypass):"
	)
	var certainty_index := pfc_slice.find(
		"PlayerProgressModel.active_quest_event_match_certainty("
	)
	var no_match_index := pfc_slice.find(
		"if match_certainty == PlayerProgressModel.QUEST_EVENT_NO_MATCH:"
	)
	var recorder_index := pfc_slice.find(
		"_record_quest_event_and_maybe_claim(event)"
	)
	_expect(
		pfc_source.count("func _record_tutorial_feature_opened(") == 1
		and pfc_slice.find("\nfunc ") < 0
		and 0 <= server_index
		and server_index < certainty_index
		and certainty_index < no_match_index
		and no_match_index < recorder_index,
		"教程快门必须只在本地确定不匹配时短路，并保持server／uncertain旧权威路径",
		errors
	)
	for fragment in [
		"or not profile.has(\"schemaVersion\")",
		"or not profile.has(ACTIVE_QUEST_ID_KEY)",
		"or not profile.has(QUEST_STATES_KEY)",
		"or QuestModel.is_optional(quest)",
		"or not _quest_progress_available_for_profile(quest, profile)",
		"== QuestModel.STATUS_CLAIMED",
		"QuestModel.progress_amount_for_event(quest, event) > 0",
	]:
		_expect(fragment in model_slice, "教程快门三态模型缺少门禁：%s" % fragment, errors)
	_expect(
		"normalize_profile(" not in model_slice,
		"教程事件快门不得在快速路径重新归一化档案",
		errors
	)


func _check_world_lightweight_layout_source_contract(
	errors: Array[String]
) -> void:
	var source_path := "res://scripts/ui/panel_flow_coordinator.gd"
	var source := FileAccess.get_file_as_string(source_path)
	_expect(source != "", "无法读取地图宿主轻量布局合同", errors)
	if source == "":
		return
	var open_start := source.find("func _open_map_panel() -> void:")
	var open_end := source.find("\n\nfunc _close_map_panel()", open_start)
	var close_end := source.find(
		"\n\nfunc _open_chat_panel()",
		open_end
	)
	var open_source := (
		source.substr(open_start, open_end - open_start)
		if open_start >= 0 and open_end > open_start
		else ""
	)
	var map_layout_source := (
		source.substr(open_end, close_end - open_end)
		if open_end >= 0 and close_end > open_end
		else ""
	)
	var blocker_start := source.find(
		"func _map_world_lightweight_layout_blocker(",
		open_end
	)
	var preflight_start := source.find(
		"func _map_world_lightweight_preflight_blocker(",
		blocker_start
	)
	var formal_ready_start := source.find(
		"func _map_formal_world_hud_ready() -> bool:",
		preflight_start
	)
	var visible_menu_start := source.find(
		"func _map_visible_world_menu_controls()",
		formal_ready_start
	)
	var blocker_source := (
		source.substr(blocker_start, preflight_start - blocker_start)
		if blocker_start >= 0 and preflight_start > blocker_start
		else ""
	)
	var preflight_source := (
		source.substr(preflight_start, formal_ready_start - preflight_start)
		if preflight_start >= 0 and formal_ready_start > preflight_start
		else ""
	)
	var formal_ready_source := (
		source.substr(formal_ready_start, visible_menu_start - formal_ready_start)
		if formal_ready_start >= 0 and visible_menu_start > formal_ready_start
		else ""
	)
	_expect(
		blocker_source.find("\nfunc ") < 0
		and preflight_source.find("\nfunc ") < 0
		and formal_ready_source.find("\nfunc ") < 0,
		"地图真实blocker/preflight/formal函数之间不得藏未调用dead helper",
		errors
	)
	_expect(
		"if hang_mode_active:\n\t\thost._set_hang_mode(false)" in open_source,
		"空闲打开地图不得重复重建挂机状态",
		errors
	)
	_expect(
		source.count("func _map_world_lightweight_layout_blocker(") == 1
		and source.count("func _map_world_lightweight_preflight_blocker(") == 1
		and source.count("func _map_formal_world_hud_ready() -> bool:") == 1
		and source.count("_map_world_lightweight_layout_blocker(") == 3
		and source.count("_map_world_lightweight_preflight_blocker(") == 3,
		"地图轻量blocker／preflight必须唯一并只由正式开关路径调用",
		errors
	)
	for fragment in [
		'if battle_active:\n\t\treturn "battle_active"',
		'if not (map_panel is MapAwakenedPanel):\n\t\treturn "non_formal_map"',
		"_map_world_lightweight_preflight_blocker(",
	]:
		_expect(fragment in blocker_source, "地图blocker真实函数缺少门禁：%s" % fragment, errors)
	for fragment in [
		'if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:',
		'map_panel == null',
		'or player == null',
		'or map_data.is_empty()',
		'map_panel is MapAwakenedPanel',
		'or not _map_formal_world_hud_ready()',
		'return "non_world_state"',
		'return "missing_world_hud"',
	]:
		_expect(fragment in preflight_source, "地图preflight真实函数缺少门禁：%s" % fragment, errors)
	var blocker_first_guard := blocker_source.find("if battle_active:")
	var blocker_first_return := blocker_source.find("return ")
	var preflight_first_guard := preflight_source.find(
		"if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:"
	)
	var preflight_first_return := preflight_source.find("return ")
	_expect(
		0 <= blocker_first_guard
		and blocker_first_guard < blocker_first_return,
		"地图blocker不得在首个真实battle门禁前提前返回",
		errors
	)
	_expect(
		0 <= preflight_first_guard
		and preflight_first_guard < preflight_first_return,
		"地图preflight不得在首个真实viewport门禁前提前返回",
		errors
	)
	for fragment in [
		'"WorldHudMessageSurface", true, false',
		'"WorldHudFixedEntries", true, false',
		'"WorldHudEntryMap", true, false',
		"and map_entry == host.map_menu_button",
	]:
		_expect(fragment in formal_ready_source, "地图formal HUD真实函数缺少门禁：%s" % fragment, errors)
	_expect(
		"if battle_active:\n\t\treturn" in open_source,
		"战斗中点击地图必须保持无副作用早退",
		errors
	)
	_expect(
		'if lightweight_reason != "":\n\t\thost.call_deferred("_layout_hud")' in open_source,
		"正式轻量路径不得残留deferred完整布局",
		errors
	)
	var preflight_index := open_source.find(
		"_map_world_lightweight_preflight_blocker("
	)
	var hang_index := open_source.find("if hang_mode_active:")
	var refresh_index := open_source.find(
		"_refresh_map_panel(diagnostic_timing)"
	)
	var tutorial_index := open_source.find(
		"_record_tutorial_feature_opened(TutorialFeatureModel.FEATURE_MAP)"
	)
	var final_layout_index := open_source.find(
		"_map_world_lightweight_layout_blocker("
	)
	_expect(
		0 <= preflight_index
		and preflight_index < hang_index
		and hang_index < refresh_index
		and refresh_index < tutorial_index
		and tutorial_index < final_layout_index,
		"地图必须先preflight，再按refresh→教程→最终HUD投影顺序执行",
		errors
	)
	for fragment in [
		"func _map_world_lightweight_layout_blocker(",
		'if battle_active:\n\t\treturn "battle_active"',
		'if not (map_panel is MapAwakenedPanel):\n\t\treturn "non_formal_map"',
		'if not viewport_size.is_equal_approx(\n\t\t_map_world_lightweight_layout_viewport\n\t):\n\t\treturn "viewport_changed"',
		'if visible_world_menus.size() != 1 or visible_world_menus[0] != map_panel:',
		"func _map_world_lightweight_preflight_blocker(",
		'if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:',
		'map_panel is MapAwakenedPanel',
		'return "missing_world_hud"',
		"func _map_formal_world_hud_ready() -> bool:",
		'"WorldHudMessageSurface", true, false',
		'"WorldHudFixedEntries", true, false',
		'"WorldHudEntryMap", true, false',
		"and map_entry == host.map_menu_button",
		"func _apply_map_world_lightweight_layout(",
		"_layout_world_hud_awakened(viewport_size, opening)",
		"func _apply_map_world_full_layout_fallback(",
		"if not _map_world_full_layout_available():",
		"func _map_world_full_layout_available() -> bool:",
		"host._layout_hud()",
	]:
		_expect(fragment in map_layout_source, "地图轻量布局缺少门禁：%s" % fragment, errors)
	var formal_layout_index := map_layout_source.find(
		"_layout_world_hud_awakened(viewport_size, opening)"
	)
	var safe_area_index := map_layout_source.find(
		"host._refresh_world_camera_safe_area(viewport_size)",
		formal_layout_index
	)
	var movement_index := map_layout_source.find(
		"player.set_movement_bounds(host._player_movement_bounds())",
		safe_area_index
	)
	var camera_limits_index := map_layout_source.find(
		"host._update_camera_limits()",
		movement_index
	)
	var camera_position_index := map_layout_source.find(
		"host._update_camera_position(true)",
		camera_limits_index
	)
	var redraw_index := map_layout_source.find(
		"host.queue_redraw()",
		camera_position_index
	)
	_expect(
		0 <= formal_layout_index
		and formal_layout_index < safe_area_index
		and safe_area_index < movement_index
		and movement_index < camera_limits_index
		and camera_limits_index < camera_position_index
		and camera_position_index < redraw_index,
		"地图轻量布局必须保持正式HUD到Phase400安全区尾链顺序",
		errors
	)


func _check_prepared_static_cache_source_contract(
	errors: Array[String]
) -> void:
	var panel_source := FileAccess.get_file_as_string(
		"res://scripts/ui/map_awakened_panel.gd"
	)
	var pfc_source := FileAccess.get_file_as_string(
		"res://scripts/ui/panel_flow_coordinator.gd"
	)
	var context_start := panel_source.find(
		"func _build_prepared_cache_context("
	)
	var context_end := panel_source.find(
		"\n\nfunc _invalidate_prepared_static_cache()",
		context_start
	)
	var context_slice := (
		panel_source.substr(context_start, context_end - context_start)
		if context_start >= 0 and context_end > context_start
		else ""
	)
	for fragment in [
		"prepared_usable",
		'state.get("mapVisualRevision", -1)',
		'state.get("mapCatalogRevision", "")',
		'state.get("mapRouteContractRevision", "")',
		'state.get("mapNames", {})',
		'"currentMapId": current_map_id',
		'"worldBounds": [',
		'"mapNames": map_names_value',
		"left.recursive_equal(right, 0)",
	]:
		_expect(
			fragment in context_slice,
			"prepared缓存上下文缺少完整签名字段：%s" % fragment,
			errors
		)
	_expect(
		"JSON.stringify(value)" not in context_slice,
		"prepared缓存不得把Vector／Rect原生投影冒充JSON exact签名",
		errors
	)
	for fragment in [
		'"localTargets": _view_state.get("localTargets", [])',
		'"currentRegion": _view_state.get("currentRegion", {})',
		'"worldRegions": _view_state.get("worldRegions", [])',
		'"selectedWorldRegionId": _selected_world_region_id',
		"_sorted_string_keys(marker_buttons)",
		"_sorted_string_keys(_local_destination_buttons)",
		"_sorted_string_keys(_world_region_buttons)",
		"_sorted_string_keys(_world_route_buttons)",
		"_emit_latest_local_target(",
		"_emit_latest_map_destination(",
		"if point.is_empty():",
	]:
		_expect(
			fragment in panel_source,
			"prepared缓存缺少闭包／节点门：%s" % fragment,
			errors
		)
	var configure_start := panel_source.find("func _configure_local_map(")
	var configure_end := panel_source.find(
		"\n\nfunc _ensure_local_map_canvas_ready()",
		configure_start
	)
	var configure_slice := (
		panel_source.substr(configure_start, configure_end - configure_start)
		if configure_start >= 0 and configure_end > configure_start
		else ""
	)
	_expect(
		configure_slice.find("if _using_prepared_visual:") >= 0
		and configure_slice.find("else:") >= 0
		and configure_slice.rfind("_build_map_markers()")
		> configure_slice.find("else:"),
		"prepared canvas缓存不得吞掉每次动态marker重建",
		errors
	)
	var state_start := pfc_source.find("func _map_awakened_view_state()")
	var state_end := pfc_source.find(
		"\n\nfunc _map_awakened_map_names()",
		state_start
	)
	var state_slice := (
		pfc_source.substr(state_start, state_end - state_start)
		if state_start >= 0 and state_end > state_start
		else ""
	)
	for fragment in [
		"var regions := MapRegionCatalog.regions()",
		"var map_names := _map_awakened_map_names()",
		'state["mapNames"] = map_names.duplicate(true)',
		'state["mapVisualRevision"] = int(host.map_visual_render_revision)',
		'state["mapCatalogRevision"] = _map_awakened_catalog_revision()',
		'state["mapRouteContractRevision"] = _map_awakened_route_contract_revision()',
	]:
		_expect(
			fragment in state_slice,
			"地图view-state缺少缓存revision：%s" % fragment,
			errors
		)
	var route_start := pfc_source.find(
		"func _map_awakened_route_contract_revision()"
	)
	var route_end := pfc_source.find(
		"\n\nfunc _map_minimap_texture()",
		route_start
	)
	var route_slice := (
		pfc_source.substr(route_start, route_end - route_start)
		if route_start >= 0 and route_end > route_start
		else ""
	)
	_expect(
		'if _map_route_planner == null:' in route_slice
		and "_map_route_planner.get_instance_id()" in route_slice
		and "_map_route_planner.map_count()" in route_slice
		and "_map_route_planner.directed_edge_count()" in route_slice
		and "_map_route_planner_instance()" not in route_slice,
		"地图页revision不得为签名首次同步构建37图route planner",
		errors
	)
	var apply_start := panel_source.find("func apply_view_state(")
	var apply_end := panel_source.find(
		"\n\nfunc reset_to_local_view()",
		apply_start
	)
	var apply_slice := (
		panel_source.substr(apply_start, apply_end - apply_start)
		if apply_start >= 0 and apply_end > apply_start
		else ""
	)
	var reset_start := apply_end
	var show_mode_start := panel_source.find(
		"func show_mode(mode: String) -> void:",
		reset_start
	)
	var reset_slice := (
		panel_source.substr(reset_start, show_mode_start - reset_start)
		if reset_start >= 0 and show_mode_start > reset_start
		else ""
	)
	var node_live_start := panel_source.find(
		"static func _node_is_live(value) -> bool:"
	)
	var fixed_nodes_start := panel_source.find(
		"func _fixed_ui_root_nodes() -> Array:",
		node_live_start
	)
	var node_live_slice := (
		panel_source.substr(node_live_start, fixed_nodes_start - node_live_start)
		if node_live_start >= 0 and fixed_nodes_start > node_live_start
		else ""
	)
	var fixed_roots_end := panel_source.find(
		"\n\nfunc _build_prepared_cache_context(",
		fixed_nodes_start
	)
	var fixed_roots_slice := (
		panel_source.substr(
			fixed_nodes_start,
			fixed_roots_end - fixed_nodes_start
		)
		if fixed_nodes_start >= 0 and fixed_roots_end > fixed_nodes_start
		else ""
	)
	for fragment in [
		"if not _fixed_ui_roots_ready():",
		"_rebuild_fixed_ui_roots()",
		"_view_state = state.duplicate(true)",
	]:
		_expect(
			fragment in apply_slice,
			"固定地图root必须在投影最新state前fail-safe自愈：%s" % fragment,
			errors
		)
	var reset_order := [
		reset_slice.find("if not _fixed_ui_roots_ready():"),
		reset_slice.find("_rebuild_fixed_ui_roots()"),
		reset_slice.find("show_mode(MapAwakenedPresenter.MODE_LOCAL)"),
	]
	_expect(
		reset_order[0] >= 0
		and reset_order[0] < reset_order[1]
		and reset_order[1] < reset_order[2],
		"真实打开reset必须先自愈fixed roots再调用show_mode",
		errors
	)
	for fragment in [
		"not (value as Node).is_queued_for_deletion()",
		"while node != ancestor:",
		"node = node.get_parent()",
		"if not _node_is_live(node):",
		"for child in container.get_children():",
		"not _node_is_live(child)",
	]:
		_expect(
			fragment in node_live_slice,
			"fixed/cache readiness必须拒绝queued节点、queued祖先及queued非按钮child：%s" % fragment,
			errors
		)
	for fragment in [
		"marker_container",
		"legacy_texture_rect",
		"legacy_detail_label",
		"_map_marker_overlay",
		"_world_region_list",
		"_world_detail_column",
		"_world_detail_points",
		"_world_entry_route_button",
		"_world_entry_route_button.get_parent() == _world_detail_column",
		"_node_has_live_ancestry_to(value, _ui_root)",
		"_invalidate_prepared_static_cache()",
		"_build_ui()",
	]:
		_expect(
			fragment in fixed_roots_slice,
			"固定地图root自愈缺少节点／父链／重建门：%s" % fragment,
			errors
		)
	var ensure_canvas_start := configure_end
	var ensure_canvas_end := panel_source.find(
		"\n\nfunc _build_map_markers()",
		ensure_canvas_start
	)
	var ensure_canvas_slice := (
		panel_source.substr(
			ensure_canvas_start,
			ensure_canvas_end - ensure_canvas_start
		)
		if ensure_canvas_start >= 0 and ensure_canvas_end > ensure_canvas_start
		else ""
	)
	for fragment in [
		"if not _node_is_live(_map_viewport):",
		"if is_instance_valid(_map_viewport):",
		"_map_viewport.free()",
		"if not _node_is_live(_map_canvas):",
		"if is_instance_valid(_map_canvas):",
		"_map_canvas.free()",
	]:
		_expect(
			fragment in ensure_canvas_slice,
			"queued viewport/canvas必须同调用安全回收并重建：%s" % fragment,
			errors
		)
	for fragment in [
		"_all_direct_children_live(marker_container)",
		"_all_direct_children_live(_world_region_list)",
		"_all_direct_children_live(_world_detail_points)",
	]:
		_expect(
			fragment in panel_source,
			"三段prepared静态树必须逐个拒绝queued direct child：%s" % fragment,
			errors
		)
	var refresh_start := pfc_source.find(
		"func _refresh_map_panel(diagnostic_timing = null) -> void:"
	)
	var refresh_end := pfc_source.find(
		"\n\nfunc _map_targets_for_current_map()",
		refresh_start
	)
	var refresh_slice := (
		pfc_source.substr(refresh_start, refresh_end - refresh_start)
		if refresh_start >= 0 and refresh_end > refresh_start
		else ""
	)
	var alias_order := [
		refresh_slice.find("if map_panel == null:"),
		refresh_slice.find("if map_panel is MapAwakenedPanel:"),
		refresh_slice.find("awakened_panel.apply_view_state("),
		refresh_slice.find("map_close_button = awakened_panel.close_button"),
		refresh_slice.find(
			"map_texture_rect = awakened_panel.legacy_texture_rect"
		),
		refresh_slice.find(
			"map_detail_label = awakened_panel.legacy_detail_label"
		),
		refresh_slice.find(
			"map_marker_container = awakened_panel.marker_container"
		),
		refresh_slice.find(
			"map_marker_buttons = awakened_panel.marker_buttons"
		),
	]
	var awakened_return := refresh_slice.find(
		"\n\t\treturn\n",
		int(alias_order[-1])
	)
	var legacy_guard := refresh_slice.find(
		"if map_texture_rect == null or map_detail_label == null "
		+ "or map_marker_container == null:",
		awakened_return
	)
	var aliases_ordered := true
	for index in range(alias_order.size()):
		aliases_ordered = aliases_ordered and int(alias_order[index]) >= 0
		if index > 0:
			aliases_ordered = (
				aliases_ordered
				and int(alias_order[index - 1]) < int(alias_order[index])
			)
	_expect(
		aliases_ordered
		and int(alias_order[-1]) < awakened_return
		and awakened_return < legacy_guard,
		"awakened地图root必须先自愈，再重发四个宿主alias；legacy guard只能位于正式分支后",
		errors
	)


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
