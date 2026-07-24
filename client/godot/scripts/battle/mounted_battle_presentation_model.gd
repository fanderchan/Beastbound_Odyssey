extends RefCounted

const MountedCharacterAssetCatalog := preload(
	"res://scripts/player/mounted_character_asset_catalog.gd"
)
const MountVisualProfileCatalog := preload(
	"res://scripts/player/mount_visual_profile_catalog.gd"
)

const TARGET_IDLE_SUBJECT_HEIGHT := 196.0
const MIN_SCALE_MULTIPLIER := 1.0
const MAX_SCALE_MULTIPLIER := 1.6
const REVIEW_FORMATION_VISUAL_SCALE := 0.74
const BATTLE_CANVAS_SCALE := 0.72

static var _report_cache: Dictionary = {}


static func warm_battle_state(state: Dictionary) -> bool:
	var all_ready := true
	var seen := {}
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if str(actor.get("kind", "")) != "player":
			continue
		var form_id := str(actor.get("ridePetFormId", "")).strip_edges()
		if form_id == "":
			continue
		var character_id := MountVisualProfileCatalog.character_id_for_form(form_id)
		var key := _cache_key(character_id, form_id)
		if seen.has(key):
			continue
		seen[key] = true
		var report := _measure(character_id, form_id)
		all_ready = bool(report.get("ok", false)) and all_ready
	return all_ready


static func warm_form(character_id: String, form_id: String) -> bool:
	return bool(_measure(character_id, form_id).get("ok", false))


static func scale_multiplier_for(character_id: String, form_id: String) -> float:
	var report = _report_cache.get(_cache_key(character_id, form_id), {})
	if not (report is Dictionary):
		return 1.0
	return float((report as Dictionary).get("scaleMultiplier", 1.0))


static func report_for(character_id: String, form_id: String) -> Dictionary:
	var report = _report_cache.get(_cache_key(character_id, form_id), {})
	return (report as Dictionary).duplicate(true) if report is Dictionary else {}


static func _measure(character_id: String, form_id: String) -> Dictionary:
	var key := _cache_key(character_id, form_id)
	var cached = _report_cache.get(key, {})
	if cached is Dictionary and not (cached as Dictionary).is_empty():
		return cached as Dictionary
	var heights: Array[float] = []
	if MountedCharacterAssetCatalog.supports_battle_combination(
		character_id,
		form_id
	):
		for view in MountedCharacterAssetCatalog.VIEWS:
			var texture := MountedCharacterAssetCatalog.battle_texture_for_progress(
				character_id,
				form_id,
				view,
				"idle",
				0.0
			)
			if texture == null:
				continue
			var image := texture.get_image()
			if image == null or image.is_empty():
				continue
			var used_rect := image.get_used_rect()
			if used_rect.size.y > 0:
				heights.append(float(used_rect.size.y))
	var source_height := 0.0
	for height in heights:
		source_height += height
	if not heights.is_empty():
		source_height /= float(heights.size())
	var multiplier := (
		clampf(
			TARGET_IDLE_SUBJECT_HEIGHT / source_height,
			MIN_SCALE_MULTIPLIER,
			MAX_SCALE_MULTIPLIER
		)
		if source_height > 0.0
		else 1.0
	)
	var presentation_scale := (
		MountVisualProfileCatalog.battle_presentation_scale_for_form(form_id)
		* REVIEW_FORMATION_VISUAL_SCALE
		* BATTLE_CANVAS_SCALE
	)
	var report := {
		"ok": source_height > 0.0,
		"characterId": character_id,
		"formId": form_id,
		"viewHeights": heights,
		"sourceIdleHeight": source_height,
		"scaleMultiplier": multiplier,
		"normalizedSourceHeight": source_height * multiplier,
		"estimatedReviewHeight": source_height * multiplier * presentation_scale,
	}
	if source_height > 0.0:
		_report_cache[key] = report
	return report


static func _cache_key(character_id: String, form_id: String) -> String:
	return "%s|%s" % [character_id.strip_edges(), form_id.strip_edges()]
