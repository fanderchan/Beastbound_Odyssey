extends SceneTree

const MapAwakenedPanel := preload("res://scripts/ui/map_awakened_panel.gd")
const MapAwakenedPresenter := preload("res://scripts/ui/map_awakened_presenter.gd")

var _captured_local_target: Dictionary = {}
var _captured_map_id := ""
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
	panel.map_destination_requested.connect(func(map_id: String, _label: String) -> void:
		_captured_map_id = map_id
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
	_expect(panel.local_tab_button() != null, "缺少稳定的本地地图页签 getter", errors)
	_expect(panel.world_tab_button() != null, "缺少稳定的世界地图页签 getter", errors)
	_expect(panel.legacy_texture_rect.texture != null, "当前地图应显示可用地形", errors)
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


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
