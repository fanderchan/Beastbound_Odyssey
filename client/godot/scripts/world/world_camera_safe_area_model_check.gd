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
	var zoomed_target := Vector2(500.0, 420.0)
	var zoomed_anchor := Vector2(390.0, 360.0)
	var zoomed_camera := WorldCameraSafeAreaModel.camera_center_for_anchor(
		zoomed_target,
		REFERENCE_VIEWPORT,
		Vector2(2.0, 2.0),
		zoomed_anchor
	)
	_expect(
		zoomed_camera.is_equal_approx(Vector2(625.0, 420.0)),
		"Camera2D zoom 位移必须按缩放倒数换算，不能再次乘 zoom",
		errors
	)
	_expect(
		WorldCameraSafeAreaModel.world_to_screen(
			zoomed_target,
			zoomed_camera,
			REFERENCE_VIEWPORT,
			Vector2(2.0, 2.0)
		).is_equal_approx(zoomed_anchor),
		"2x Camera2D 下玩家必须精确落到请求的屏幕锚点",
		errors
	)
	var task_hud := Rect2(999.0, 13.0, 206.0, 465.0)
	var landmark_safe := WorldCameraSafeAreaModel.horizontal_anchor_avoiding_rects(
		390.0,
		reference_safe,
		task_hud,
		[
			Rect2(1088.0, 231.0, 341.0, 343.0),
			Rect2(1165.0, 376.0, 558.0, 450.0),
		]
	)
	_expect(
		landmark_safe >= 518.0 and landmark_safe <= 520.0,
		"远处东侧地标应平移到任务 HUD 右侧，而不是从面板后探出",
		errors
	)
	var nearby_landmark_safe := WorldCameraSafeAreaModel.horizontal_anchor_avoiding_rects(
		390.0,
		reference_safe,
		task_hud,
		[Rect2(669.0, -120.0, 558.0, 450.0)]
	)
	_expect(
		nearby_landmark_safe >= 150.0 and nearby_landmark_safe <= 156.0,
		"附近大地标应移到任务 HUD 左侧完整构图",
		errors
	)
	_expect(
		WorldCameraSafeAreaModel.horizontal_anchor_avoiding_rects(
			390.0,
			reference_safe,
			task_hud,
			[Rect2(420.0, 180.0, 180.0, 140.0)]
		) == 390.0,
		"本来不与任务 HUD 相交的构图不得漂移",
		errors
	)
	var bottom_hud := Rect2(665.0, 616.0, 597.0, 86.0)
	var full_alpha_subjects: Array[Rect2] = [
		Rect2(980.0, 250.0, 72.0, 150.0),
		Rect2(850.0, 570.0, 72.0, 140.0),
		Rect2(730.0, 170.0, 204.0, 205.0),
		Rect2(180.0, 340.0, 60.0, 150.0),
	]
	var village_review_safe := Rect2(8.0, 8.0, 955.0, 486.0)
	var composition_anchor := WorldCameraSafeAreaModel.composition_anchor_avoiding_rects(
		Vector2(390.0, 360.0),
		village_review_safe,
		[task_hud, bottom_hud],
		full_alpha_subjects,
		Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
	)
	var composition_shift := composition_anchor - Vector2(390.0, 360.0)
	var shifted_subjects: Array[Rect2] = []
	for subject in full_alpha_subjects:
		shifted_subjects.append(Rect2(subject.position + composition_shift, subject.size))
	_expect(
		composition_anchor.x < 390.0 and composition_anchor.y < 360.0,
		"完整 NPC alpha 同时争抢任务栏与底栏时必须二维收敛",
		errors
	)
	_expect(
		_rects_clear(shifted_subjects, [task_hud, bottom_hud]),
		"二维构图后完整 NPC/关键环境轮廓不得落入任务栏或底栏",
		errors
	)
	_expect(
		WorldCameraSafeAreaModel.composition_anchor_avoiding_rects(
			Vector2(390.0, 360.0),
			village_review_safe,
			[task_hud, bottom_hud],
			[Rect2(420.0, 180.0, 180.0, 140.0)],
			Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
		).is_equal_approx(Vector2(390.0, 360.0)),
		"完整轮廓本来远离固定 HUD 时不得制造镜头漂移",
		errors
	)
	var local_composition_subjects := WorldCameraSafeAreaModel.nearby_composition_subject_rects(
		[
			Rect2(420.0, 180.0, 180.0, 140.0),
			Rect2(1276.0, 280.0, 24.0, 80.0),
			Rect2(1310.0, 280.0, 24.0, 80.0),
		],
		Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
	)
	_expect(
		local_composition_subjects.size() == 2,
		"局部构图只应保留自然可见或一档视觉余量内的主体",
		errors
	)
	_expect(
		local_composition_subjects.has(Rect2(1276.0, 280.0, 24.0, 80.0)),
		"贴近视口边缘的完整 alpha 主体必须继续参加 HUD／裁边求解",
		errors
	)
	_expect(
		not local_composition_subjects.has(Rect2(1310.0, 280.0, 24.0, 80.0)),
		"全图远处主体不得把玩家镜头拉成全员展板",
		errors
	)
	var endpoint_player_anchor := Vector2(120.0, 207.0)
	var endpoint_player_alpha := Rect2(84.0, 111.0, 72.0, 136.0)
	var endpoint_player_safe_anchor := WorldCameraSafeAreaModel.composition_anchor_avoiding_rects(
		endpoint_player_anchor,
		Rect2(8.0, 8.0, 955.0, 486.0),
		[Rect2(80.0, 0.0, 330.0, 145.0)],
		[endpoint_player_alpha],
		Rect2(Vector2.ZERO, REFERENCE_VIEWPORT)
	)
	var endpoint_player_shifted := Rect2(
		endpoint_player_alpha.position
			+ endpoint_player_safe_anchor - endpoint_player_anchor,
		endpoint_player_alpha.size
	)
	_expect(
		endpoint_player_safe_anchor.y > endpoint_player_anchor.y,
		"训练终点完整人物 alpha 靠近小地图时必须向下收敛镜头锚点",
		errors
	)
	_expect(
		not Rect2(80.0, 0.0, 330.0, 145.0).grow(
			WorldCameraSafeAreaModel.DEFAULT_VISUAL_GAP_PX
		).intersects(endpoint_player_shifted),
		"训练终点完整人物 alpha 不得继续钻入小地图 HUD",
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
		"zoomedCamera": zoomed_camera,
		"zoomedAnchor": zoomed_anchor,
		"landmarkSafeAnchorX": landmark_safe,
		"nearbyLandmarkSafeAnchorX": nearby_landmark_safe,
		"compositionAnchor": composition_anchor,
		"localCompositionSubjectCount": local_composition_subjects.size(),
		"endpointPlayerSafeAnchor": endpoint_player_safe_anchor,
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


func _rects_clear(rects: Array[Rect2], blockers: Array[Rect2]) -> bool:
	for rect in rects:
		for blocker in blockers:
			if rect.intersects(blocker):
				return false
	return true


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
