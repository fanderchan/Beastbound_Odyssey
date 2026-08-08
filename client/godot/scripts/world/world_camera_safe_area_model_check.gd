extends SceneTree

const WorldCameraSafeAreaModel := preload(
	"res://scripts/world/world_camera_safe_area_model.gd"
)

const REFERENCE_VIEWPORT := Vector2(1280.0, 720.0)
const SQUARE_VIEWPORT := Vector2(1280.0, 1280.0)


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var reference_blockers := _formal_hud_blockers(REFERENCE_VIEWPORT)
	var reference_safe := WorldCameraSafeAreaModel.safe_viewport_rect(
		REFERENCE_VIEWPORT,
		reference_blockers
	)
	var reference_anchor := WorldCameraSafeAreaModel.player_anchor(
		REFERENCE_VIEWPORT,
		reference_safe
	)
	_expect(
		reference_anchor.is_equal_approx(REFERENCE_VIEWPORT * 0.5),
		"1280x720 中心本来可用时不应平移正常玩家镜头",
		errors
	)
	_expect(
		_point_clear(reference_anchor, reference_blockers, 6.0),
		"1280x720 玩家锚点不得落入正式 HUD",
		errors
	)
	var nearby_target := reference_anchor + Vector2(0.0, 96.0)
	_expect(
		reference_safe.has_point(nearby_target)
			and _point_clear(nearby_target, reference_blockers, 6.0),
		"玩家下方两格的传送交互仍应位于安全世界区",
		errors
	)

	var square_blockers := _formal_hud_blockers(SQUARE_VIEWPORT)
	var square_safe := WorldCameraSafeAreaModel.safe_viewport_rect(
		SQUARE_VIEWPORT,
		square_blockers
	)
	var square_anchor := WorldCameraSafeAreaModel.player_anchor(
		SQUARE_VIEWPORT,
		square_safe
	)
	_expect(
		square_anchor.is_equal_approx(SQUARE_VIEWPORT * 0.5),
		"方形 QA 视口的中心仍应保留为玩家锚点",
		errors
	)
	_expect(
		_point_clear(square_anchor + Vector2(0.0, 96.0), square_blockers, 6.0),
		"方形视口中邻近交互不得被底栏覆盖",
		errors
	)

	var constrained_viewport := Vector2(800.0, 600.0)
	var constrained_blockers: Array[Rect2] = [
		Rect2(80.0, 0.0, 520.0, 120.0),
		Rect2(680.0, 90.0, 110.0, 420.0),
		Rect2(250.0, 360.0, 530.0, 232.0),
	]
	var constrained_safe := WorldCameraSafeAreaModel.safe_viewport_rect(
		constrained_viewport,
		constrained_blockers
	)
	var constrained_anchor := WorldCameraSafeAreaModel.player_anchor(
		constrained_viewport,
		constrained_safe,
		80.0
	)
	_expect(constrained_safe.position.y >= 132.0, "顶部 HUD 应收紧安全区", errors)
	_expect(constrained_safe.end.x <= 668.0, "右侧 HUD 应收紧安全区", errors)
	_expect(constrained_safe.end.y <= 348.0, "底部 HUD 应收紧安全区", errors)
	_expect(
		_point_clear(constrained_anchor, constrained_blockers, 6.0),
		"受限视口的玩家锚点不得与顶部、右侧或底部 HUD 相交",
		errors
	)

	var world_bounds := Rect2(Vector2.ZERO, Vector2(1000.0, 1000.0))
	var zoom := Vector2.ONE
	var square_limits := WorldCameraSafeAreaModel.camera_limit_bounds(
		world_bounds,
		SQUARE_VIEWPORT,
		zoom,
		square_safe
	)
	var edge_player := Vector2(900.0, 900.0)
	var desired_center := WorldCameraSafeAreaModel.camera_center_for_anchor(
		edge_player,
		SQUARE_VIEWPORT,
		zoom,
		square_anchor
	)
	var edge_camera := WorldCameraSafeAreaModel.clamp_camera_center(
		desired_center,
		square_limits,
		SQUARE_VIEWPORT,
		zoom
	)
	var edge_player_screen := WorldCameraSafeAreaModel.world_to_screen(
		edge_player,
		edge_camera,
		SQUARE_VIEWPORT,
		zoom
	)
	_expect(square_safe.has_point(edge_player_screen), "地图边缘玩家必须留在安全世界区", errors)
	_expect(
		_point_clear(edge_player_screen, square_blockers, 6.0),
		"地图边缘玩家不得被正式 HUD 覆盖",
		errors
	)
	var edge_interaction_screen := WorldCameraSafeAreaModel.world_to_screen(
		edge_player + Vector2(0.0, 96.0),
		edge_camera,
		SQUARE_VIEWPORT,
		zoom
	)
	_expect(
		square_safe.has_point(edge_interaction_screen)
			and _point_clear(edge_interaction_screen, square_blockers, 6.0),
		"地图下缘玩家附近的传送交互必须同时可见可点",
		errors
	)
	var roundtrip_world := WorldCameraSafeAreaModel.screen_to_world(
		edge_player_screen,
		edge_camera,
		SQUARE_VIEWPORT,
		zoom
	)
	_expect(
		roundtrip_world.distance_to(edge_player) <= 0.1,
		"安全区相机的世界/屏幕坐标换算必须可逆",
		errors
	)

	var report := {
		"ok": errors.is_empty(),
		"errors": errors,
		"referenceSafeRect": reference_safe,
		"referenceAnchor": reference_anchor,
		"squareSafeRect": square_safe,
		"squareAnchor": square_anchor,
		"constrainedSafeRect": constrained_safe,
		"constrainedAnchor": constrained_anchor,
		"edgeCamera": edge_camera,
		"edgePlayerScreen": edge_player_screen,
		"edgeInteractionScreen": edge_interaction_screen,
	}
	print("WORLD_CAMERA_SAFE_AREA_MODEL_CHECK: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


func _formal_hud_blockers(viewport_size: Vector2) -> Array[Rect2]:
	var scale_x := viewport_size.x / 1280.0
	var scale_y := viewport_size.y / 720.0
	return [
		Rect2(Vector2(80.0 * scale_x, 0.0), Vector2(752.0 * scale_x, 170.0 * scale_y)),
		Rect2(Vector2(999.0 * scale_x, 13.0 * scale_y), Vector2(206.0 * scale_x, 465.0 * scale_y)),
		Rect2(Vector2(57.0 * scale_x, 469.0 * scale_y), Vector2(348.0 * scale_x, 233.0 * scale_y)),
		Rect2(Vector2(599.0 * scale_x, 530.0 * scale_y), Vector2(597.0 * scale_x, 181.0 * scale_y)),
	]


func _point_clear(point: Vector2, blockers: Array[Rect2], radius: float) -> bool:
	var probe := Rect2(point - Vector2.ONE * radius, Vector2.ONE * radius * 2.0)
	for blocker in blockers:
		if blocker.intersects(probe):
			return false
	return true


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
