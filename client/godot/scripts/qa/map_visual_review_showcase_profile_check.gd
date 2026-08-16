extends RefCounted

const ShowcaseProfile := preload(
	"res://scripts/qa/map_visual_review_showcase_profile.gd"
)
const MapVisualReviewCapture := preload(
	"res://scripts/qa/map_visual_review_capture.gd"
)


static func run() -> Dictionary:
	var errors: Array[String] = []
	var profile := ShowcaseProfile.build()
	errors.append_array(ShowcaseProfile.errors_for(profile))
	if not ShowcaseProfile.context_allowed(
		"firebud_village_gate",
		ShowcaseProfile.EXPECTED_BUNDLE_ID
	):
		errors.append("Phase383 村口展示上下文被错误拒绝")
	if not ShowcaseProfile.context_allowed(
		"firebud_training_yard",
		ShowcaseProfile.EXPECTED_BUNDLE_ID
	):
		errors.append("Phase383 训练场展示上下文被错误拒绝")
	if ShowcaseProfile.context_allowed(
		"firebud_village_gate",
		"firebud_region_visual_v1"
	):
		errors.append("Phase383 展示档案错误放行正式 v1 bundle")
	if ShowcaseProfile.context_allowed(
		"mistcap_marsh",
		ShowcaseProfile.EXPECTED_BUNDLE_ID
	):
		errors.append("Phase383 展示档案错误放行非目标地图")
	var capture_args := PackedStringArray([
		"--map-art-review-preview=firebud_village_gate",
		MapVisualReviewCapture.CAPTURE_FLAG,
		MapVisualReviewCapture.SHOWCASE_PROFILE_FLAG,
		"--map-visual-review-map-id=firebud_village_gate",
		"--map-visual-review-output=/tmp/phase383-showcase.png",
		"--map-visual-review-report=/tmp/phase383-showcase.json",
		"--map-visual-review-mode=idle",
		"--map-visual-review-capture-variant=pointer",
	])
	var request := MapVisualReviewCapture.request_from_args(capture_args)
	if not (request.get("parseErrors", []) as Array).is_empty():
		errors.append("Phase383 显式展示参数没有通过 capture parser")
	if not bool(request.get("showcaseProfileRequested", false)):
		errors.append("Phase383 capture parser 没有记录显式展示参数")
	if str(request.get("captureVariant", "")) != "pointer":
		errors.append("地图 capture parser 没有记录固定动作变体")
	var legacy_args := capture_args.duplicate()
	legacy_args.remove_at(2)
	var legacy_request := MapVisualReviewCapture.request_from_args(legacy_args)
	if bool(legacy_request.get("showcaseProfileRequested", true)):
		errors.append("旧地图 capture 被错误强制注入展示档案")
	var duplicate_args := capture_args.duplicate()
	duplicate_args.append(MapVisualReviewCapture.SHOWCASE_PROFILE_FLAG)
	var duplicate_request := MapVisualReviewCapture.request_from_args(duplicate_args)
	if (duplicate_request.get("parseErrors", []) as Array).is_empty():
		errors.append("重复 Phase383 展示参数没有失败关闭")
	var invalid_variant_args := capture_args.duplicate()
	invalid_variant_args[invalid_variant_args.size() - 1] = (
		"--map-visual-review-capture-variant=freeform"
	)
	var invalid_variant_request := MapVisualReviewCapture.request_from_args(
		invalid_variant_args
	)
	if (invalid_variant_request.get("parseErrors", []) as Array).is_empty():
		errors.append("任意地图 capture variant 没有失败关闭")
	return {
		"result": "PASS" if errors.is_empty() else "FAIL",
		"profileId": ShowcaseProfile.PROFILE_ID,
		"playerAppearanceId": ShowcaseProfile.PLAYER_APPEARANCE_ID,
		"activePetFormId": ShowcaseProfile.ACTIVE_PET_FORM_ID,
		"allowedMaps": ShowcaseProfile.ALLOWED_MAP_IDS.duplicate(),
		"defaultProfileReplaced": true,
		"ridePetInjected": false,
		"errors": errors,
	}
