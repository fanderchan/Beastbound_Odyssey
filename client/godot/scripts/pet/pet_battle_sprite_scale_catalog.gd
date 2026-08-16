extends RefCounted

const PetActionAssetCatalog := preload(
	"res://scripts/pet/pet_action_asset_catalog.gd"
)
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")

const DATA_PATH := "res://data/pet_battle_sprite_scales.json"
const SCHEMA_VERSION := 1
const APPLICATION_MODE := "ordinary_formal_pet_sprite_only"
const DEFAULT_SPRITE_SCALE := 1.0
const FORMAL_BATTLE_CANVAS_SIZE := 156.0
const SOURCE_FRAME_SIZE := 256.0

static var _loaded := false
static var _catalog: Dictionary = {}
static var _profiles_by_form: Dictionary = {}
static var _load_error := ""


static func warm_battle_state(state: Dictionary) -> bool:
	_ensure_loaded()
	if _load_error != "":
		return false
	var all_ready := true
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if not _ordinary_pet_actor(actor):
			continue
		var form_id := str(
			actor.get("formId", actor.get("templateId", ""))
		).strip_edges()
		if not PetActionAssetCatalog.supports_form(form_id):
			continue
		all_ready = _profiles_by_form.has(form_id) and all_ready
	return all_ready


static func sprite_scale_for_actor(actor: Dictionary) -> float:
	if not _ordinary_pet_actor(actor):
		return DEFAULT_SPRITE_SCALE
	var form_id := str(
		actor.get("formId", actor.get("templateId", ""))
	).strip_edges()
	return sprite_scale_for_form(form_id)


static func sprite_scale_for_form(form_id: String) -> float:
	# Drawing is a hot path. Battle startup must warm this catalog; an unwarmed
	# or invalid catalog fails visually safe at 1.0 without file I/O in _draw().
	if not _loaded or _load_error != "":
		return DEFAULT_SPRITE_SCALE
	var profile = _profiles_by_form.get(form_id.strip_edges(), {})
	if not (profile is Dictionary):
		return DEFAULT_SPRITE_SCALE
	return float((profile as Dictionary).get("spriteScale", DEFAULT_SPRITE_SCALE))


static func profile_for_form(form_id: String) -> Dictionary:
	_ensure_loaded()
	var value = _profiles_by_form.get(form_id.strip_edges(), {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func validation_errors() -> Array[String]:
	_ensure_loaded()
	var errors: Array[String] = []
	if _load_error != "":
		errors.append(_load_error)
		return errors
	if int(_catalog.get("schemaVersion", 0)) != SCHEMA_VERSION:
		errors.append("普通宠物战斗身体比例 schemaVersion 必须为 1")
	if str(_catalog.get("applicationMode", "")) != APPLICATION_MODE:
		errors.append("普通宠物战斗身体比例不得改变战斗权威几何")
	var scale_range := _number_range(_catalog.get("scaleRange", []))
	if scale_range.size() != 2 or scale_range[0] <= 0.0 or scale_range[1] < scale_range[0]:
		errors.append("普通宠物战斗身体比例范围无效")
		return errors
	var runtime_forms: Dictionary = {}
	for record in PetArtCatalog.runtime_form_records():
		var form_id := str(record.get("formId", "")).strip_edges()
		if form_id != "":
			runtime_forms[form_id] = true
			if not _profiles_by_form.has(form_id):
				errors.append("当前运行宠物缺少显式战斗身体比例：%s" % form_id)
	for form_id_value in _profiles_by_form.keys():
		var form_id := str(form_id_value)
		var profile := _profiles_by_form[form_id] as Dictionary
		if not runtime_forms.has(form_id):
			errors.append("战斗身体比例登记了非运行宠物：%s" % form_id)
		if not PetActionAssetCatalog.supports_form(form_id):
			errors.append("战斗身体比例登记的宠物没有正式动作包：%s" % form_id)
		var sprite_scale := float(profile.get("spriteScale", 0.0))
		if sprite_scale < scale_range[0] or sprite_scale > scale_range[1]:
			errors.append("战斗身体比例越界：%s=%.3f" % [form_id, sprite_scale])
		if str(profile.get("artRole", "")).strip_edges() == "":
			errors.append("战斗身体比例缺少美术层级角色：%s" % form_id)
		if str(profile.get("reason", "")).strip_edges() == "":
			errors.append("战斗身体比例缺少审美理由：%s" % form_id)
		for key in ["sourceIdleBounds", "normalizedIdleBounds"]:
			var bounds = profile.get(key, {})
			if not (bounds is Dictionary):
				errors.append("战斗身体比例缺少 %s：%s" % [key, form_id])
				continue
			for axis in ["width", "height"]:
				var axis_range := _number_range((bounds as Dictionary).get(axis, []))
				if axis_range.size() != 2 or axis_range[0] <= 0.0 or axis_range[1] < axis_range[0]:
					errors.append("战斗身体比例 %s.%s 无效：%s" % [key, axis, form_id])
	return errors


static func idle_bounds_report(
	form_id: String,
	visual_scale: float = 1.0
) -> Dictionary:
	_ensure_loaded()
	var normalized_form_id := form_id.strip_edges()
	var profile := profile_for_form(normalized_form_id)
	var errors: Array[String] = []
	if profile.is_empty():
		if PetArtCatalog.supports_form(normalized_form_id):
			errors.append("当前运行宠物缺少战斗身体比例审计：%s" % normalized_form_id)
		return {
			"managed": false,
			"formId": normalized_form_id,
			"spriteScale": DEFAULT_SPRITE_SCALE,
			"errors": errors,
		}
	if not PetActionAssetCatalog.warm_battle_form(normalized_form_id):
		errors.append("战斗身体比例审计无法预热动作包：%s" % normalized_form_id)
	var widths: Array[float] = []
	var heights: Array[float] = []
	var idle_count := PetActionAssetCatalog.frame_count_for_action(
		normalized_form_id,
		"idle"
	)
	for view in PetActionAssetCatalog.VIEWS:
		for frame_index in range(idle_count):
			var texture := PetActionAssetCatalog.texture_for_progress(
				normalized_form_id,
				view,
				"idle",
				float(frame_index) / float(idle_count)
			)
			if texture == null:
				errors.append(
					"战斗身体比例审计缺少 idle 帧：%s/%s/%d"
					% [normalized_form_id, view, frame_index + 1]
				)
				continue
			var image := texture.get_image()
			if image == null or image.is_empty():
				errors.append(
					"战斗身体比例审计无法读取 idle 像素：%s/%s/%d"
					% [normalized_form_id, view, frame_index + 1]
				)
				continue
			var used_rect := image.get_used_rect()
			if used_rect.size.x <= 0 or used_rect.size.y <= 0:
				errors.append(
					"战斗身体比例审计得到空主体：%s/%s/%d"
					% [normalized_form_id, view, frame_index + 1]
				)
				continue
			widths.append(float(used_rect.size.x))
			heights.append(float(used_rect.size.y))
	var source_bounds := _measured_bounds(widths, heights)
	var sprite_scale := float(profile.get("spriteScale", DEFAULT_SPRITE_SCALE))
	var normalized_bounds := _scaled_bounds(source_bounds, sprite_scale)
	_compare_expected_bounds(
		errors,
		normalized_form_id,
		"sourceIdleBounds",
		source_bounds,
		profile.get("sourceIdleBounds", {})
	)
	_compare_expected_bounds(
		errors,
		normalized_form_id,
		"normalizedIdleBounds",
		normalized_bounds,
		profile.get("normalizedIdleBounds", {})
	)
	var draw_factor := FORMAL_BATTLE_CANVAS_SIZE * maxf(0.01, visual_scale) / SOURCE_FRAME_SIZE
	return {
		"managed": true,
		"formId": normalized_form_id,
		"artRole": str(profile.get("artRole", "")),
		"spriteScale": sprite_scale,
		"frameCount": widths.size(),
		"sourceIdleBounds": source_bounds,
		"normalizedIdleBounds": normalized_bounds,
		"estimatedVisibleBounds": _scaled_bounds(normalized_bounds, draw_factor),
		"visualScale": visual_scale,
		"applicationMode": APPLICATION_MODE,
		"authoritativeGeometryChanged": false,
		"errors": errors,
	}


static func _ordinary_pet_actor(actor: Dictionary) -> bool:
	var kind := str(actor.get("kind", "")).strip_edges()
	return (
		kind == "pet"
		or (kind == "wild_pet" and bool(actor.get("catchable", true)))
	)


static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		_load_error = "缺少普通宠物战斗身体比例目录：%s" % DATA_PATH
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	if not (parsed is Dictionary):
		_load_error = "普通宠物战斗身体比例目录不是有效 JSON 对象"
		return
	_catalog = parsed as Dictionary
	var profiles = _catalog.get("profiles", [])
	if not (profiles is Array):
		_load_error = "普通宠物战斗身体比例 profiles 必须为数组"
		return
	for value in profiles as Array:
		if not (value is Dictionary):
			_load_error = "普通宠物战斗身体比例 profile 不是对象"
			return
		var profile := value as Dictionary
		var form_id := str(profile.get("formId", "")).strip_edges()
		if form_id == "":
			_load_error = "普通宠物战斗身体比例存在空 formId"
			return
		if _profiles_by_form.has(form_id):
			_load_error = "普通宠物战斗身体比例重复 formId：%s" % form_id
			return
		_profiles_by_form[form_id] = profile


static func _number_range(value) -> Array[float]:
	var result: Array[float] = []
	if value is Array and (value as Array).size() == 2:
		for item in value as Array:
			if typeof(item) != TYPE_INT and typeof(item) != TYPE_FLOAT:
				return []
			result.append(float(item))
	return result


static func _measured_bounds(widths: Array[float], heights: Array[float]) -> Dictionary:
	if widths.is_empty() or heights.is_empty():
		return {}
	var width_min := widths[0]
	var width_max := widths[0]
	var height_min := heights[0]
	var height_max := heights[0]
	for value in widths:
		width_min = minf(width_min, value)
		width_max = maxf(width_max, value)
	for value in heights:
		height_min = minf(height_min, value)
		height_max = maxf(height_max, value)
	return {
		"width": [width_min, width_max],
		"height": [height_min, height_max],
	}


static func _scaled_bounds(bounds: Dictionary, multiplier: float) -> Dictionary:
	var widths := _number_range(bounds.get("width", []))
	var heights := _number_range(bounds.get("height", []))
	if widths.size() != 2 or heights.size() != 2:
		return {}
	return {
		"width": [widths[0] * multiplier, widths[1] * multiplier],
		"height": [heights[0] * multiplier, heights[1] * multiplier],
	}


static func _compare_expected_bounds(
	errors: Array[String],
	form_id: String,
	label: String,
	actual: Dictionary,
	expected_value
) -> void:
	if not (expected_value is Dictionary):
		errors.append("战斗身体比例 %s 不是对象：%s" % [label, form_id])
		return
	for axis in ["width", "height"]:
		var actual_range := _number_range(actual.get(axis, []))
		var expected_range := _number_range((expected_value as Dictionary).get(axis, []))
		if actual_range.size() != 2 or expected_range.size() != 2:
			errors.append("战斗身体比例 %s.%s 不可审计：%s" % [label, axis, form_id])
			continue
		if (
			absf(actual_range[0] - expected_range[0]) > 0.051
			or absf(actual_range[1] - expected_range[1]) > 0.051
		):
			errors.append(
				"战斗身体比例 %s.%s 漂移：%s actual=%s expected=%s"
				% [label, axis, form_id, str(actual_range), str(expected_range)]
			)
