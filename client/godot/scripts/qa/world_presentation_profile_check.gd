extends RefCounted

const WorldPresentationProfile := preload(
	"res://scripts/world/world_presentation_profile.gd"
)


static func run(host: Node) -> Dictionary:
	var errors: Array[String] = []
	var v1 := {
		"active": true,
		"bundleId": "firebud_region_visual_v1",
		"qaPreview": false,
		"reviewCandidate": false,
	}
	var v2 := {
		"active": true,
		"bundleId": WorldPresentationProfile.FIREBUD_REVIEW_BUNDLE_ID,
		"qaPreview": true,
		"reviewCandidate": true,
		"status": "owner_review_pending",
		"groundRenderMode": WorldPresentationProfile.LAYERED_SEMANTIC_OVERLAY,
	}
	var earth_review := {
		"active": true,
		"bundleId": "earth_vein_cave_visual_v1",
		"qaPreview": true,
		"reviewCandidate": true,
		"status": "owner_review_pending",
		"groundRenderMode": WorldPresentationProfile.LAYERED_SEMANTIC_OVERLAY,
	}
	var released_layered := {
		"active": true,
		"bundleId": "future_layered_map_visual_v1",
		"qaPreview": false,
		"reviewCandidate": false,
		"status": "released",
		"groundRenderMode": WorldPresentationProfile.LAYERED_SEMANTIC_OVERLAY,
	}
	var forged_v2 := {"bundleId": WorldPresentationProfile.FIREBUD_REVIEW_BUNDLE_ID}
	var reference_viewport := Vector2(1280.0, 720.0)
	var reference_safe_rect := Rect2(Vector2(8.0, 206.0), Vector2(955.0, 288.0))
	var default_anchor := WorldPresentationProfile.camera_anchor_for(
		reference_viewport,
		reference_safe_rect,
		false,
		v1
	)
	var firebud_anchor := WorldPresentationProfile.camera_anchor_for(
		reference_viewport,
		reference_safe_rect,
		true,
		v2
	)
	var forged_anchor := WorldPresentationProfile.camera_anchor_for(
		reference_viewport,
		reference_safe_rect,
		true,
		forged_v2
	)
	_expect_vector(
		default_anchor,
		reference_viewport * 0.5,
		"普通地图必须保留 Phase400 整屏中心锚点",
		errors
	)
	_expect_vector(
		firebud_anchor,
		Vector2(390.0, 360.0),
		"Firebud v2 必须在未被 HUD 遮挡的世界区使用 40/60 水平构图",
		errors
	)
	_expect_vector(
		forged_anchor,
		reference_viewport * 0.5,
		"仅伪造 v2 bundleId 不得启用安全区构图",
		errors
	)

	_expect_vector(
		WorldPresentationProfile.camera_zoom_for(false, v1),
		Vector2.ONE,
		"普通 v1 相机必须保持 1.0",
		errors
	)
	_expect_vector(
		WorldPresentationProfile.camera_zoom_for(true, v1),
		Vector2.ONE,
		"v1 即使处于美术预览也必须保持 1.0",
		errors
	)
	_expect_vector(
		WorldPresentationProfile.camera_zoom_for(false, v2),
		Vector2.ONE,
		"普通运行时不得启用 v2 canary 相机",
		errors
	)
	_expect_vector(
		WorldPresentationProfile.camera_zoom_for(true, v2),
		Vector2(1.55, 1.55),
		"v2 美术预览必须启用 1.55 相机",
		errors
	)
	_expect_vector(
		WorldPresentationProfile.camera_zoom_for(true, forged_v2),
		Vector2.ONE,
		"仅伪造 v2 bundleId 不得启用 canary 相机",
		errors
	)
	if WorldPresentationProfile.uses_authored_ground_details(false, v2):
		errors.append("外层未显式进入预览时不得关闭程序化地表反馈")
	if WorldPresentationProfile.uses_authored_ground_details(true, v1):
		errors.append("v1 不得关闭程序化 encounter/decor 地表反馈")
	if WorldPresentationProfile.uses_authored_ground_details(true, forged_v2):
		errors.append("仅伪造 v2 bundleId 不得关闭程序化地表反馈")
	if not WorldPresentationProfile.uses_authored_ground_details(true, v2):
		errors.append("v2 必须使用 authored encounter/decor 地表细节")
	if not WorldPresentationProfile.uses_authored_ground_details(true, earth_review):
		errors.append("分层语义地图候选必须使用 authored encounter/decor 地表细节")
	if WorldPresentationProfile.uses_authored_ground_details(false, earth_review):
		errors.append("pending 分层语义地图不得绕过显式审图入口")
	if not WorldPresentationProfile.uses_authored_ground_details(false, released_layered):
		errors.append("released 分层语义地图必须在正常玩家路径使用 authored 地表细节")
	_expect_vector(
		WorldPresentationProfile.safe_zoom(Vector2.ZERO),
		Vector2.ONE,
		"零 zoom 防护必须回退到 1.0",
		errors
	)
	_expect_vector(
		WorldPresentationProfile.safe_zoom(Vector2(1.35, 0.0)),
		Vector2(1.35, 1.0),
		"单轴零 zoom 防护不得覆盖另一轴",
		errors
	)

	var original_preview: bool = bool(host.get("map_art_review_preview"))
	var original_battle_active: bool = bool(host.get("battle_active"))
	var original_prepared: Dictionary = (
		(host.get("map_visual_render_state") as Dictionary).duplicate(true)
	)
	host.set("battle_active", false)
	host.set("map_art_review_preview", true)
	host.set("map_visual_render_state", v2.duplicate(true))
	host.call("_apply_world_presentation_profile")
	host.call("_refresh_world_camera_safe_area", host.get_viewport_rect().size)
	_expect_vector(
		host.get("game_camera").zoom,
		Vector2(1.55, 1.55),
		"Main 未应用 v2 canary 相机",
		errors
	)
	var live_v2_anchor: Vector2 = host.get("world_camera_safe_anchor_screen")
	var expected_live_v2_anchor := WorldPresentationProfile.camera_anchor_for(
		host.get_viewport_rect().size,
		host.get("world_camera_safe_viewport_rect"),
		true,
		v2
	)
	_expect_vector(
		live_v2_anchor,
		expected_live_v2_anchor,
		"Main 未应用 Firebud v2 HUD 安全区构图",
		errors
	)
	var v2_sample_world: Vector2 = host.get("player").global_position + Vector2(73.0, -41.0)
	var v2_sample_screen: Vector2 = host.call("_world_to_screen", v2_sample_world)
	var v2_round_trip_world: Vector2 = host.call("_screen_to_world", v2_sample_screen)
	if not v2_round_trip_world.is_equal_approx(v2_sample_world):
		errors.append("v2 1.55 zoom 下 screen/world 坐标不能往返")
	var v2_viewport_size: Vector2 = host.get_viewport_rect().size
	var v2_viewport_world_rect: Rect2 = host.call("_viewport_world_rect")
	var expected_v2_world_size := v2_viewport_size / Vector2(1.55, 1.55)
	if not v2_viewport_world_rect.size.is_equal_approx(expected_v2_world_size):
		errors.append("v2 viewport world rect 未按 1.55 zoom 缩放")
	host.set("battle_active", true)
	host.call("_apply_world_presentation_profile")
	_expect_vector(
		host.get("game_camera").zoom,
		Vector2.ONE,
		"v2 预览进入战斗后相机未恢复 1.0",
		errors
	)
	host.set("battle_active", false)
	host.call("_apply_world_presentation_profile")
	_expect_vector(
		host.get("game_camera").zoom,
		Vector2(1.55, 1.55),
		"v2 预览离开战斗后相机未恢复 1.55",
		errors
	)
	host.set("map_visual_render_state", v1.duplicate(true))
	host.call("_apply_world_presentation_profile")
	_expect_vector(
		host.get("game_camera").zoom,
		Vector2.ONE,
		"切换回 v1 后相机未恢复 1.0",
		errors
	)
	host.set("map_visual_render_state", v2.duplicate(true))
	host.set("map_art_review_preview", false)
	host.call("_apply_world_presentation_profile")
	_expect_vector(
		host.get("game_camera").zoom,
		Vector2.ONE,
		"退出预览后相机未恢复 1.0",
		errors
	)
	host.set("map_art_review_preview", original_preview)
	host.set("map_visual_render_state", original_prepared)
	host.set("battle_active", original_battle_active)
	host.call("_apply_world_presentation_profile")
	host.call("_refresh_world_camera_safe_area", host.get_viewport_rect().size)

	var current_zoom: Vector2 = host.get("game_camera").zoom
	var expected_current_zoom := WorldPresentationProfile.camera_zoom_for(
		original_preview and not original_battle_active,
		original_prepared
	)
	_expect_vector(
		current_zoom,
		expected_current_zoom,
		"恢复现场后相机 profile 不一致",
		errors
	)
	var sample_world: Vector2 = host.get("player").global_position + Vector2(73.0, -41.0)
	var sample_screen: Vector2 = host.call("_world_to_screen", sample_world)
	var round_trip_world: Vector2 = host.call("_screen_to_world", sample_screen)
	if not round_trip_world.is_equal_approx(sample_world):
		errors.append("screen/world 坐标在 zoom 下不能往返")

	var safe_current_zoom := WorldPresentationProfile.safe_zoom(current_zoom)
	var viewport_size: Vector2 = host.get_viewport_rect().size
	var viewport_world_rect: Rect2 = host.call("_viewport_world_rect")
	var expected_world_size := Vector2(
		viewport_size.x / safe_current_zoom.x,
		viewport_size.y / safe_current_zoom.y
	)
	if not viewport_world_rect.size.is_equal_approx(expected_world_size):
		errors.append("viewport world rect 未按 zoom 缩放")

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.world_presentation_profile_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"currentBundleId": str(original_prepared.get("bundleId", "")),
		"currentReviewPreview": original_preview,
		"currentPreparedActive": bool(original_prepared.get("active", false)),
		"currentPreparedQaPreview": bool(original_prepared.get("qaPreview", false)),
		"currentPreparedReviewCandidate": bool(
			original_prepared.get("reviewCandidate", false)
		),
		"currentUsesAuthoredGroundDetails": (
			WorldPresentationProfile.uses_authored_ground_details(
				original_preview,
				original_prepared
			)
		),
		"currentCameraZoom": [current_zoom.x, current_zoom.y],
		"roundTripError": round_trip_world.distance_to(sample_world),
		"errors": errors,
	}


static func _expect_vector(
	actual: Vector2,
	expected: Vector2,
	message: String,
	errors: Array[String]
) -> void:
	if not actual.is_equal_approx(expected):
		errors.append("%s：expected=%s actual=%s" % [message, str(expected), str(actual)])
