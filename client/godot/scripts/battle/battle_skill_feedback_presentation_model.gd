extends RefCounted

## Pure presentation contract for skill-specific battle feedback. Catalog data is
## normalized once when a playback event begins; draw paths only consume the
## prepared plan and never scan JSON or the action catalog per frame.

const SCHEMA_VERSION := 1
const STYLE_LEAF_EARTH_CHARGE := "leaf_earth_charge"
const SUPPORTED_STYLES: Array[String] = [STYLE_LEAF_EARTH_CHARGE]


static func validation_errors(feedback: Dictionary, context: String = "feedback") -> Array[String]:
	var errors: Array[String] = []
	if feedback.is_empty():
		errors.append("%s 不能为空" % context)
		return errors
	if int(feedback.get("schemaVersion", 0)) != SCHEMA_VERSION:
		errors.append("%s.schemaVersion 当前必须是 %d" % [context, SCHEMA_VERSION])
	var style := str(feedback.get("style", "")).strip_edges()
	if not SUPPORTED_STYLES.has(style):
		errors.append("%s.style 不支持: %s" % [context, style])
	var asset_bundle_path := str(feedback.get("assetBundlePath", "")).strip_edges()
	if not asset_bundle_path.begins_with("res://") or not asset_bundle_path.ends_with(".json"):
		errors.append("%s.assetBundlePath 必须是 res:// JSON 路径" % context)

	var cast_value = feedback.get("cast", null)
	if not (cast_value is Dictionary):
		errors.append("%s.cast 必须是对象" % context)
	else:
		_validate_cast(cast_value as Dictionary, "%s.cast" % context, errors)

	var impact_value = feedback.get("impact", null)
	if not (impact_value is Dictionary):
		errors.append("%s.impact 必须是对象" % context)
	else:
		_validate_impact(impact_value as Dictionary, "%s.impact" % context, errors)

	var palette_value = feedback.get("palette", null)
	if not (palette_value is Dictionary):
		errors.append("%s.palette 必须是对象" % context)
	else:
		_validate_palette(palette_value as Dictionary, "%s.palette" % context, errors)
	return errors


static func plan_for(action_id: String, feedback: Dictionary) -> Dictionary:
	if action_id.strip_edges() == "" or not validation_errors(feedback).is_empty():
		return {}
	var cast := feedback.get("cast", {}) as Dictionary
	var impact := feedback.get("impact", {}) as Dictionary
	var palette := feedback.get("palette", {}) as Dictionary
	return {
		"schemaVersion": SCHEMA_VERSION,
		"actionId": action_id,
		"style": str(feedback.get("style", "")),
		"assetBundlePath": str(feedback.get("assetBundlePath", "")).strip_edges(),
		"cast": {
			"startProgress": float(cast.get("startProgress", 0.08)),
			"peakProgress": float(cast.get("peakProgress", 0.28)),
			"endProgress": float(cast.get("endProgress", 0.50)),
			"ringRadius": float(cast.get("ringRadius", 36.0)),
			"leafCount": int(cast.get("leafCount", 3)),
		},
		"impact": {
			"preContactSeconds": float(impact.get("preContactSeconds", 0.035)),
			"fadeSeconds": float(impact.get("fadeSeconds", 0.20)),
			"radius": float(impact.get("radius", 31.0)),
			"leafCount": int(impact.get("leafCount", 5)),
			"earthChunkCount": int(impact.get("earthChunkCount", 3)),
			"contactDistanceScale": float(impact.get("contactDistanceScale", 1.0)),
		},
		"palette": {
			"leaf": _color_from_array(palette.get("leaf", [])),
			"leafGlow": _color_from_array(palette.get("leafGlow", [])),
			"earth": _color_from_array(palette.get("earth", [])),
			"dust": _color_from_array(palette.get("dust", [])),
			"core": _color_from_array(palette.get("core", [])),
		},
	}


static func cast_strength(plan: Dictionary, event_progress: float) -> float:
	var cast := plan.get("cast", {}) as Dictionary
	if cast.is_empty():
		return 0.0
	var start := float(cast.get("startProgress", 0.08))
	var peak := float(cast.get("peakProgress", 0.28))
	var finish := float(cast.get("endProgress", 0.50))
	var progress := clampf(event_progress, 0.0, 1.0)
	if progress < start or progress > finish:
		return 0.0
	if progress <= peak:
		return _smooth_unit((progress - start) / maxf(0.001, peak - start))
	return 1.0 - _smooth_unit((progress - peak) / maxf(0.001, finish - peak))


static func cast_convergence(plan: Dictionary, event_progress: float) -> float:
	var cast := plan.get("cast", {}) as Dictionary
	if cast.is_empty():
		return 0.0
	var start := float(cast.get("startProgress", 0.08))
	var finish := float(cast.get("endProgress", 0.50))
	return _smooth_unit(
		(clampf(event_progress, start, finish) - start)
		/ maxf(0.001, finish - start)
	)


static func impact_strength(
	plan: Dictionary,
	event_progress: float,
	contact_progress: float,
	event_duration_seconds: float
) -> float:
	var impact := plan.get("impact", {}) as Dictionary
	if impact.is_empty():
		return 0.0
	var age_seconds := (
		clampf(event_progress, 0.0, 1.0)
		- clampf(contact_progress, 0.0, 1.0)
	) * maxf(0.01, event_duration_seconds)
	var pre_contact := float(impact.get("preContactSeconds", 0.035))
	var fade := float(impact.get("fadeSeconds", 0.20))
	if age_seconds < -pre_contact or age_seconds > fade:
		return 0.0
	if age_seconds < 0.0:
		return _smooth_unit((age_seconds + pre_contact) / maxf(0.001, pre_contact))
	return 1.0 - _smooth_unit(age_seconds / maxf(0.001, fade))


static func impact_burst_progress(
	plan: Dictionary,
	event_progress: float,
	contact_progress: float,
	event_duration_seconds: float
) -> float:
	var impact := plan.get("impact", {}) as Dictionary
	if impact.is_empty():
		return 0.0
	var age_seconds := (
		clampf(event_progress, 0.0, 1.0)
		- clampf(contact_progress, 0.0, 1.0)
	) * maxf(0.01, event_duration_seconds)
	if age_seconds <= 0.0:
		return 0.0
	var fade := float(impact.get("fadeSeconds", 0.20))
	return _smooth_unit(age_seconds / maxf(0.001, fade))


static func result_mode(event: Dictionary) -> String:
	if bool(event.get("dodged", false)):
		return "dodge"
	if bool(event.get("critical", false)):
		return "critical"
	return "hit"


static func _validate_cast(cast: Dictionary, context: String, errors: Array[String]) -> void:
	for key in ["startProgress", "peakProgress", "endProgress", "ringRadius", "leafCount"]:
		if not _is_number(cast.get(key, null)):
			errors.append("%s.%s 必须是数字" % [context, key])
	var start := float(cast.get("startProgress", -1.0))
	var peak := float(cast.get("peakProgress", -1.0))
	var finish := float(cast.get("endProgress", -1.0))
	if start < 0.0 or finish > 1.0 or not (start < peak and peak < finish):
		errors.append("%s 的 startProgress < peakProgress < endProgress 且必须位于0到1" % context)
	var radius := float(cast.get("ringRadius", 0.0))
	if radius < 12.0 or radius > 80.0:
		errors.append("%s.ringRadius 必须在12到80之间" % context)
	var leaf_count := int(cast.get("leafCount", 0))
	if (
		not _is_integral_number(cast.get("leafCount", null))
		or leaf_count < 1
		or leaf_count > 8
	):
		errors.append("%s.leafCount 必须在1到8之间" % context)


static func _validate_impact(impact: Dictionary, context: String, errors: Array[String]) -> void:
	for key in ["preContactSeconds", "fadeSeconds", "radius", "leafCount", "earthChunkCount", "contactDistanceScale"]:
		if not _is_number(impact.get(key, null)):
			errors.append("%s.%s 必须是数字" % [context, key])
	var pre_contact := float(impact.get("preContactSeconds", -1.0))
	if pre_contact < 0.0 or pre_contact > 0.10:
		errors.append("%s.preContactSeconds 必须在0到0.10之间" % context)
	var fade := float(impact.get("fadeSeconds", 0.0))
	if fade < 0.08 or fade > 0.40:
		errors.append("%s.fadeSeconds 必须在0.08到0.40之间" % context)
	var radius := float(impact.get("radius", 0.0))
	if radius < 16.0 or radius > 72.0:
		errors.append("%s.radius 必须在16到72之间" % context)
	var leaf_count := int(impact.get("leafCount", 0))
	if (
		not _is_integral_number(impact.get("leafCount", null))
		or leaf_count < 2
		or leaf_count > 10
	):
		errors.append("%s.leafCount 必须在2到10之间" % context)
	var chunk_count := int(impact.get("earthChunkCount", 0))
	if (
		not _is_integral_number(impact.get("earthChunkCount", null))
		or chunk_count < 1
		or chunk_count > 6
	):
		errors.append("%s.earthChunkCount 必须在1到6之间" % context)
	var contact_distance_scale := float(impact.get("contactDistanceScale", 0.0))
	if contact_distance_scale < 1.0 or contact_distance_scale > 4.0:
		errors.append("%s.contactDistanceScale 必须在1.0到4.0之间" % context)


static func _validate_palette(palette: Dictionary, context: String, errors: Array[String]) -> void:
	for key in ["leaf", "leafGlow", "earth", "dust", "core"]:
		var value = palette.get(key, null)
		if not (value is Array) or (value as Array).size() != 4:
			errors.append("%s.%s 必须是4项RGBA数组" % [context, key])
			continue
		var channels := value as Array
		for channel in channels:
			if not _is_number(channel) or float(channel) < 0.0 or float(channel) > 1.0:
				errors.append("%s.%s 每个通道必须是0到1之间的数字" % [context, key])
				break


static func _color_from_array(value) -> Color:
	if not (value is Array) or (value as Array).size() != 4:
		return Color.WHITE
	var channels := value as Array
	return Color(
		float(channels[0]),
		float(channels[1]),
		float(channels[2]),
		float(channels[3])
	)


static func _is_number(value) -> bool:
	return typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT


static func _is_integral_number(value) -> bool:
	return _is_number(value) and is_equal_approx(float(value), roundf(float(value)))


static func _smooth_unit(value: float) -> float:
	var normalized := clampf(value, 0.0, 1.0)
	return normalized * normalized * (3.0 - 2.0 * normalized)
