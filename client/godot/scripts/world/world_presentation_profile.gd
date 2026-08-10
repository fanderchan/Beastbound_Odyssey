class_name WorldPresentationProfile
extends RefCounted

const FIREBUD_REVIEW_BUNDLE_ID := "firebud_region_visual_v2"
const NORMAL_CAMERA_ZOOM := Vector2.ONE
const FIREBUD_REVIEW_CAMERA_ZOOM := Vector2(1.55, 1.55)
const MIN_ZOOM_COMPONENT := 0.0001


static func camera_zoom_for(map_art_review_preview: bool, prepared_visual: Dictionary) -> Vector2:
	if _is_firebud_review_canary(map_art_review_preview, prepared_visual):
		return FIREBUD_REVIEW_CAMERA_ZOOM
	return NORMAL_CAMERA_ZOOM


static func uses_authored_ground_details(
	map_art_review_preview: bool,
	prepared_visual: Dictionary
) -> bool:
	return _is_firebud_review_canary(map_art_review_preview, prepared_visual)


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
