extends RefCounted

## Focused runtime catalog for skill-specific VFX bundles. Bundle JSON and
## textures are loaded only while preparing a playback event; draw paths read
## the in-memory caches and never perform file I/O.

const SCHEMA_VERSION := 1
const EXPECTED_FRAME_COUNT := 4
const FRAME_GROUPS := {
	"charge": "chargeFrames",
	"impact": "impactFrames",
}
const FRAME_THRESHOLDS := {
	"charge": "chargeFrameThresholds",
	"impact": "impactFrameThresholds",
}

static var _bundle_cache: Dictionary = {}
static var _texture_cache: Dictionary = {}


static func validation_errors(
	bundle_path: String,
	expected_action_id: String = "",
	expected_style: String = ""
) -> Array[String]:
	var errors: Array[String] = []
	var normalized_path := bundle_path.strip_edges()
	if not normalized_path.begins_with("res://") or not normalized_path.ends_with(".json"):
		errors.append("skill feedback assetBundlePath 必须是 res:// JSON 路径")
		return errors
	var bundle := _load_bundle(normalized_path)
	if bundle.is_empty():
		errors.append("skill feedback asset bundle 无法读取: %s" % normalized_path)
		return errors
	if int(bundle.get("schemaVersion", 0)) != SCHEMA_VERSION:
		errors.append("%s.schemaVersion 当前必须是 %d" % [normalized_path, SCHEMA_VERSION])
	if expected_action_id != "" and str(bundle.get("actionId", "")) != expected_action_id:
		errors.append("%s.actionId 必须是 %s" % [normalized_path, expected_action_id])
	if expected_style != "" and str(bundle.get("style", "")) != expected_style:
		errors.append("%s.style 必须是 %s" % [normalized_path, expected_style])
	if str(bundle.get("deliveryStatus", "")) not in [
		"in_production",
		"owner_review_pending",
		"approved",
	]:
		errors.append("%s.deliveryStatus 无效" % normalized_path)
	if not bool(bundle.get("ownerReviewRequired", false)):
		errors.append("%s.ownerReviewRequired 必须为 true" % normalized_path)
	if bool(bundle.get("playerFacingDebugAllowed", true)):
		errors.append("%s.playerFacingDebugAllowed 必须为 false" % normalized_path)

	var runtime_value = bundle.get("runtime", null)
	if not (runtime_value is Dictionary):
		errors.append("%s.runtime 必须是对象" % normalized_path)
		return errors
	var runtime := runtime_value as Dictionary
	_validate_frame_size(runtime, normalized_path, errors)
	for group in FRAME_GROUPS:
		_validate_frame_group(
			runtime,
			str(FRAME_GROUPS[group]),
			"%s.runtime.%s" % [normalized_path, str(FRAME_GROUPS[group])],
			errors
		)
		_validate_thresholds(
			runtime,
			str(FRAME_THRESHOLDS[group]),
			"%s.runtime.%s" % [normalized_path, str(FRAME_THRESHOLDS[group])],
			errors
		)
	_validate_scale(runtime, "chargeDrawScale", normalized_path, errors)
	_validate_scale(runtime, "impactDrawScale", normalized_path, errors)
	_validate_scale(runtime, "criticalDrawScale", normalized_path, errors)
	_validate_anchor(runtime, "chargeAnchor", normalized_path, errors)
	_validate_anchor(runtime, "impactAnchor", normalized_path, errors)

	var source := bundle.get("source", {}) as Dictionary
	var provenance_path := str(source.get("provenancePath", "")).strip_edges()
	if not provenance_path.begins_with("res://") or not FileAccess.file_exists(provenance_path):
		errors.append("%s.source.provenancePath 不存在" % normalized_path)
	return errors


static func prepare(
	bundle_path: String,
	expected_action_id: String,
	expected_style: String
) -> bool:
	var normalized_path := bundle_path.strip_edges()
	if not validation_errors(
		normalized_path,
		expected_action_id,
		expected_style
	).is_empty():
		return false
	if _texture_cache.has(normalized_path):
		return bool((_texture_cache[normalized_path] as Dictionary).get("valid", false))
	var bundle := _bundle_cache.get(normalized_path, {}) as Dictionary
	var runtime := bundle.get("runtime", {}) as Dictionary
	var prepared := {"valid": true}
	for group in FRAME_GROUPS:
		var textures: Array = []
		for value in runtime.get(str(FRAME_GROUPS[group]), []) as Array:
			var texture := _load_texture(str(value))
			if texture == null:
				prepared["valid"] = false
				break
			textures.append(texture)
		prepared[group] = textures
		if not bool(prepared.get("valid", false)):
			break
	_texture_cache[normalized_path] = prepared
	return bool(prepared.get("valid", false))


static func texture_for(
	bundle_path: String,
	group: String,
	frame_index: int
) -> Texture2D:
	var prepared := _texture_cache.get(bundle_path.strip_edges(), {}) as Dictionary
	if not bool(prepared.get("valid", false)):
		return null
	var textures = prepared.get(group, [])
	if not (textures is Array) or (textures as Array).is_empty():
		return null
	var texture_array := textures as Array
	return texture_array[clampi(frame_index, 0, texture_array.size() - 1)] as Texture2D


static func frame_index_for(
	bundle_path: String,
	group: String,
	progress: float
) -> int:
	var bundle := _bundle_cache.get(bundle_path.strip_edges(), {}) as Dictionary
	var runtime := bundle.get("runtime", {}) as Dictionary
	var threshold_key := str(FRAME_THRESHOLDS.get(group, ""))
	var thresholds = runtime.get(threshold_key, [])
	if not (thresholds is Array) or (thresholds as Array).size() != EXPECTED_FRAME_COUNT - 1:
		return clampi(int(floor(clampf(progress, 0.0, 0.999) * EXPECTED_FRAME_COUNT)), 0, EXPECTED_FRAME_COUNT - 1)
	var normalized := clampf(progress, 0.0, 1.0)
	for index in range((thresholds as Array).size()):
		if normalized < float((thresholds as Array)[index]):
			return index
	return EXPECTED_FRAME_COUNT - 1


static func draw_scale_for(
	bundle_path: String,
	key: String,
	fallback: float
) -> float:
	var bundle := _bundle_cache.get(bundle_path.strip_edges(), {}) as Dictionary
	var runtime := bundle.get("runtime", {}) as Dictionary
	return float(runtime.get(key, fallback))


static func anchor_for(
	bundle_path: String,
	key: String,
	fallback: Vector2
) -> Vector2:
	var bundle := _bundle_cache.get(bundle_path.strip_edges(), {}) as Dictionary
	var runtime := bundle.get("runtime", {}) as Dictionary
	var value = runtime.get(key, [])
	if not (value is Array) or (value as Array).size() != 2:
		return fallback
	return Vector2(float((value as Array)[0]), float((value as Array)[1]))


static func _load_bundle(bundle_path: String) -> Dictionary:
	if _bundle_cache.has(bundle_path):
		return _bundle_cache[bundle_path] as Dictionary
	if not FileAccess.file_exists(bundle_path):
		return {}
	var file := FileAccess.open(bundle_path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	if not (parsed is Dictionary):
		return {}
	var bundle := (parsed as Dictionary).duplicate(true)
	_bundle_cache[bundle_path] = bundle
	return bundle


static func _validate_frame_size(
	runtime: Dictionary,
	context: String,
	errors: Array[String]
) -> void:
	var value = runtime.get("frameSize", [])
	if not (value is Array) or (value as Array).size() != 2:
		errors.append("%s.runtime.frameSize 必须是两项数组" % context)
		return
	if int((value as Array)[0]) != 256 or int((value as Array)[1]) != 256:
		errors.append("%s.runtime.frameSize 当前必须是 256x256" % context)


static func _validate_frame_group(
	runtime: Dictionary,
	key: String,
	context: String,
	errors: Array[String]
) -> void:
	var value = runtime.get(key, null)
	if not (value is Array) or (value as Array).size() != EXPECTED_FRAME_COUNT:
		errors.append("%s 必须恰好包含 %d 帧" % [context, EXPECTED_FRAME_COUNT])
		return
	var seen := {}
	for item in value as Array:
		var path := str(item).strip_edges()
		if not path.begins_with("res://") or not path.ends_with(".png"):
			errors.append("%s 路径必须是 res:// PNG" % context)
			continue
		if seen.has(path):
			errors.append("%s 不允许重复帧: %s" % [context, path])
		seen[path] = true
		if not FileAccess.file_exists(path):
			errors.append("%s 资源不存在: %s" % [context, path])


static func _load_texture(resource_path: String) -> Texture2D:
	if ResourceLoader.exists(resource_path):
		var imported := ResourceLoader.load(resource_path) as Texture2D
		if imported != null:
			return imported
	# A fresh source checkout may not have a .godot import cache yet. Decode the
	# project PNG once during event preparation; exported builds still take the
	# normal ResourceLoader path above. Draw paths only consume the cached texture.
	var image := Image.load_from_file(resource_path)
	if image == null or image.is_empty():
		return null
	return ImageTexture.create_from_image(image)


static func _validate_thresholds(
	runtime: Dictionary,
	key: String,
	context: String,
	errors: Array[String]
) -> void:
	var value = runtime.get(key, null)
	if not (value is Array) or (value as Array).size() != EXPECTED_FRAME_COUNT - 1:
		errors.append("%s 必须包含三项递增阈值" % context)
		return
	var previous := 0.0
	for index in range((value as Array).size()):
		var threshold_value = (value as Array)[index]
		if not _is_number(threshold_value):
			errors.append("%s[%d] 必须是数字" % [context, index])
			continue
		var threshold := float(threshold_value)
		if threshold <= previous or threshold >= 1.0:
			errors.append("%s 必须严格递增且位于0到1" % context)
		previous = threshold


static func _validate_scale(
	runtime: Dictionary,
	key: String,
	context: String,
	errors: Array[String]
) -> void:
	var value = runtime.get(key, null)
	if not _is_number(value) or float(value) < 0.25 or float(value) > 1.5:
		errors.append("%s.runtime.%s 必须在0.25到1.5之间" % [context, key])


static func _validate_anchor(
	runtime: Dictionary,
	key: String,
	context: String,
	errors: Array[String]
) -> void:
	var value = runtime.get(key, null)
	if not (value is Array) or (value as Array).size() != 2:
		errors.append("%s.runtime.%s 必须是两项数组" % [context, key])
		return
	for channel in value as Array:
		if not _is_number(channel) or float(channel) < 0.0 or float(channel) > 1.0:
			errors.append("%s.runtime.%s 必须是0到1锚点" % [context, key])
			return


static func _is_number(value) -> bool:
	return typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT
