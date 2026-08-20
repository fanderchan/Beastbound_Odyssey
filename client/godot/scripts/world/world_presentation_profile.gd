class_name WorldPresentationProfile
extends RefCounted

const WorldCameraSafeAreaModel := preload(
	"res://scripts/world/world_camera_safe_area_model.gd"
)

const FIREBUD_REVIEW_BUNDLE_ID := "firebud_region_visual_v2"
const LAYERED_SEMANTIC_OVERLAY := "layered_semantic_overlay"
const NORMAL_CAMERA_ZOOM := Vector2.ONE
const FIREBUD_REVIEW_CAMERA_ZOOM := Vector2(1.55, 1.55)
# Firebud v2 places its landmark spine east of the player. Reserve 60% of the
# unobstructed world band on that side instead of composing through the fixed
# right task HUD. The vertical anchor deliberately keeps the Phase400 behavior.
const FIREBUD_REVIEW_SAFE_ANCHOR_X_RATIO := 0.40
const MIN_ZOOM_COMPONENT := 0.0001


static func camera_zoom_for(map_art_review_preview: bool, prepared_visual: Dictionary) -> Vector2:
	if _is_firebud_review_canary(map_art_review_preview, prepared_visual):
		return FIREBUD_REVIEW_CAMERA_ZOOM
	return NORMAL_CAMERA_ZOOM


static func camera_anchor_for(
	viewport_size: Vector2,
	safe_rect: Rect2,
	map_art_review_preview: bool,
	prepared_visual: Dictionary
) -> Vector2:
	var anchor := WorldCameraSafeAreaModel.player_anchor(viewport_size, safe_rect)
	if (
		not _is_firebud_review_canary(map_art_review_preview, prepared_visual)
		or safe_rect.size.x <= 0.0
		or safe_rect.size.y <= 0.0
	):
		return anchor
	var clearance := WorldCameraSafeAreaModel.DEFAULT_INTERACTION_CLEARANCE_PX
	var clearance_x := minf(
		clearance,
		maxf(0.0, safe_rect.size.x * 0.5 - 1.0)
	)
	var min_anchor_x := safe_rect.position.x + clearance_x
	var max_anchor_x := safe_rect.end.x - clearance_x
	var composed_x := lerpf(
		safe_rect.position.x,
		safe_rect.end.x,
		FIREBUD_REVIEW_SAFE_ANCHOR_X_RATIO
	)
	anchor.x = clampf(composed_x, min_anchor_x, max_anchor_x)
	return anchor


static func uses_hud_landmark_composition(
	map_art_review_preview: bool,
	prepared_visual: Dictionary
) -> bool:
	return _is_firebud_review_canary(map_art_review_preview, prepared_visual)


static func uses_authored_ground_details(
	map_art_review_preview: bool,
	prepared_visual: Dictionary
) -> bool:
	if (
		not bool(prepared_visual.get("active", false))
		or str(prepared_visual.get("groundRenderMode", ""))
			!= LAYERED_SEMANTIC_OVERLAY
	):
		return false
	if str(prepared_visual.get("status", "")) == "released":
		return true
	return (
		map_art_review_preview
		and bool(prepared_visual.get("qaPreview", false))
		and bool(prepared_visual.get("reviewCandidate", false))
	)


static func safe_zoom(value: Vector2) -> Vector2:
	return Vector2(_safe_zoom_component(value.x), _safe_zoom_component(value.y))


static func _safe_zoom_component(value: float) -> float:
	return value if absf(value) >= MIN_ZOOM_COMPONENT else 1.0


static func _is_firebud_review_canary(
	map_art_review_preview: bool,
	prepared_visual: Dictionary
) -> bool:
	return (
		map_art_review_preview
		and bool(prepared_visual.get("active", false))
		and bool(prepared_visual.get("qaPreview", false))
		and bool(prepared_visual.get("reviewCandidate", false))
		and str(prepared_visual.get("bundleId", "")).strip_edges()
			== FIREBUD_REVIEW_BUNDLE_ID
	)
