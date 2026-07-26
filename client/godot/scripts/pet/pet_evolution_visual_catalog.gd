extends RefCounted

const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")

const VIEW_FRONT := "front_3quarter_sw"
const REQUIRED_FRAME_COUNT := 12
const REQUIRED_FPS := 12.0
const REQUIRED_STAGE_COUNT := 3
const STATUS_OWNER_REVIEW_PENDING := "owner_review_pending"
const STATUS_APPROVED := "approved"

static var _metadata_cache: Dictionary = {}
static var _texture_cache: Dictionary = {}
static var _warmed_forms: Dictionary = {}
static var _qa_preview_forms: Dictionary = {}


static func enable_qa_preview_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	if not OS.is_debug_build() or normalized == "":
		return false
	var visual := _evolution_visual(normalized)
	if visual.is_empty():
		return false
	if not [STATUS_OWNER_REVIEW_PENDING, STATUS_APPROVED].has(str(visual.get("status", ""))):
		return false
	if not validation_errors_for_form(normalized).is_empty():
		return false
	_qa_preview_forms[normalized] = true
	_warmed_forms.erase(normalized)
	return true


static func disable_qa_preview_form(form_id: String) -> void:
	var normalized := form_id.strip_edges()
	_qa_preview_forms.erase(normalized)
	_warmed_forms.erase(normalized)


static func is_qa_preview_enabled(form_id: String) -> bool:
	return OS.is_debug_build() and bool(_qa_preview_forms.get(form_id.strip_edges(), false))


static func supports_target_form(form_id: String) -> bool:
	return not descriptor_for_target(form_id).is_empty()


static func descriptor_for_target(form_id: String) -> Dictionary:
	var normalized := form_id.strip_edges()
	if not _access_allowed(normalized) or not validation_errors_for_form(normalized).is_empty():
		return {}
	var visual := _evolution_visual(normalized)
	var bundle_root := _bundle_root(normalized)
	return {
		"animationId": str(visual.get("animationId", "")),
		"sourceFormId": str(visual.get("sourceFormId", "")),
		"targetFormId": normalized,
		"view": VIEW_FRONT,
		"frameCount": int(visual.get("frameCount", 0)),
		"fps": float(visual.get("fps", 0.0)),
		"loop": false,
		"presentationCopy": (visual.get("presentationCopy", {}) as Dictionary).duplicate(true),
		"runtimeRoot": bundle_root.path_join(str(visual.get("runtimeRoot", ""))),
	}


static func warm_target_form(form_id: String) -> bool:
	var normalized := form_id.strip_edges()
	var descriptor := descriptor_for_target(normalized)
	if descriptor.is_empty():
		return false
	if bool(_warmed_forms.get(normalized, false)):
		return true
	var runtime_root := str(descriptor.get("runtimeRoot", ""))
	var animation_id := str(descriptor.get("animationId", ""))
	for frame_number in range(1, int(descriptor.get("frameCount", 0)) + 1):
		var path := runtime_root.path_join("evolution-%d.png" % frame_number)
		var texture = load(path)
		if not (texture is Texture2D):
			_warmed_forms[normalized] = false
			return false
		_texture_cache[_texture_key(animation_id, frame_number)] = texture
	_warmed_forms[normalized] = true
	return true


static func texture_for_frame(form_id: String, frame_index: int):
	var normalized := form_id.strip_edges()
	var descriptor := descriptor_for_target(normalized)
	if descriptor.is_empty():
		return null
	var frame_count := int(descriptor.get("frameCount", 0))
	if frame_index < 0 or frame_index >= frame_count:
		return null
	if not warm_target_form(normalized):
		return null
	return _texture_cache.get(
		_texture_key(str(descriptor.get("animationId", "")), frame_index + 1),
		null
	)


static func validation_errors_for_form(form_id: String) -> Array[String]:
	var normalized := form_id.strip_edges()
	var errors: Array[String] = []
	if normalized == "":
		errors.append("进化视觉目标 formId 不能为空")
		return errors
	var metadata_path := PetArtCatalog.pet_bundle_metadata_path(normalized)
	if metadata_path == "":
		errors.append("宠物美术目录没有登记进化目标：%s" % normalized)
		return errors
	var metadata := _bundle_metadata(normalized)
	if metadata.is_empty():
		errors.append("进化视觉元数据无法读取：%s" % metadata_path)
		return errors
	var visual_value = metadata.get("evolutionVisual", null)
	if not (visual_value is Dictionary):
		errors.append("宠物动作包缺少 evolutionVisual：%s" % normalized)
		return errors
	var visual := visual_value as Dictionary
	if str(visual.get("animationId", "")).strip_edges() == "":
		errors.append("进化视觉缺少 animationId：%s" % normalized)
	if str(visual.get("sourceFormId", "")).strip_edges() == "":
		errors.append("进化视觉缺少 sourceFormId：%s" % normalized)
	if str(visual.get("targetFormId", "")) != normalized:
		errors.append("进化视觉 targetFormId 与目录目标不一致：%s" % normalized)
	if str(visual.get("view", "")) != VIEW_FRONT:
		errors.append("进化视觉必须使用 %s：%s" % [VIEW_FRONT, normalized])
	if int(visual.get("frameCount", 0)) != REQUIRED_FRAME_COUNT:
		errors.append("进化视觉必须恰好 12 帧：%s" % normalized)
	if not is_equal_approx(float(visual.get("fps", 0.0)), REQUIRED_FPS):
		errors.append("进化视觉必须严格按 12 FPS 登记：%s" % normalized)
	if bool(visual.get("loop", true)):
		errors.append("进化视觉必须是单次非循环序列：%s" % normalized)
	var status := str(visual.get("status", ""))
	if not [STATUS_OWNER_REVIEW_PENDING, STATUS_APPROVED].has(status):
		errors.append("进化视觉状态无效：%s=%s" % [normalized, status])
	_validate_presentation_copy(normalized, visual.get("presentationCopy", null), errors)
	var runtime_root := str(visual.get("runtimeRoot", "")).strip_edges().replace("\\", "/")
	if runtime_root == "" or runtime_root.begins_with("/") or runtime_root.begins_with("res://") or runtime_root.find("..") >= 0:
		errors.append("进化视觉 runtimeRoot 必须是安全的包内相对路径：%s" % normalized)
	else:
		var absolute_runtime_root := _bundle_root(normalized).path_join(runtime_root)
		for frame_number in range(1, REQUIRED_FRAME_COUNT + 1):
			var frame_path := absolute_runtime_root.path_join("evolution-%d.png" % frame_number)
			if not FileAccess.file_exists(frame_path):
				errors.append("进化视觉缺少运行帧：%s" % frame_path)
	if status == STATUS_OWNER_REVIEW_PENDING and (
		str(visual.get("ownerReview", "")) != "pending"
		or bool(visual.get("runtimeEnabled", false))
	):
		errors.append("待所有者验收的进化视觉必须保持 ownerReview=pending 且 runtimeEnabled=false：%s" % normalized)
	if status == STATUS_APPROVED:
		if str(visual.get("ownerReview", "")) != STATUS_APPROVED:
			errors.append("已批准进化视觉必须同步 ownerReview=approved：%s" % normalized)
		_validate_owner_decision(normalized, visual, errors)
	return errors


static func contract_summary(form_id: String) -> Dictionary:
	var normalized := form_id.strip_edges()
	var visual := _evolution_visual(normalized)
	var errors := validation_errors_for_form(normalized)
	return {
		"formId": normalized,
		"animationId": str(visual.get("animationId", "")),
		"frameCount": int(visual.get("frameCount", 0)),
		"fps": float(visual.get("fps", 0.0)),
		"loop": bool(visual.get("loop", true)),
		"status": str(visual.get("status", "")),
		"runtimeEnabled": bool(visual.get("runtimeEnabled", false)),
		"qaPreviewEnabled": is_qa_preview_enabled(normalized),
		"errors": errors,
		"ok": errors.is_empty(),
	}


static func _access_allowed(form_id: String) -> bool:
	if is_qa_preview_enabled(form_id):
		return true
	var visual := _evolution_visual(form_id)
	return (
		str(visual.get("status", "")) == STATUS_APPROVED
		and str(visual.get("ownerReview", "")) == STATUS_APPROVED
		and bool(visual.get("runtimeEnabled", false))
	)


static func _validate_owner_decision(form_id: String, visual: Dictionary, errors: Array[String]) -> void:
	var relative_path := str(visual.get("ownerDecision", "")).strip_edges().replace("\\", "/")
	var expected_sha := str(visual.get("ownerDecisionSha256", "")).strip_edges().to_lower()
	if relative_path == "" or relative_path.begins_with("/") or relative_path.begins_with("res://") or relative_path.find("..") >= 0:
		errors.append("已批准进化视觉缺少安全的 ownerDecision 路径：%s" % form_id)
		return
	var decision_path := _bundle_root(form_id).path_join(relative_path)
	if not FileAccess.file_exists(decision_path):
		errors.append("进化视觉 ownerDecision 文件不存在：%s" % decision_path)
		return
	if expected_sha.length() != 64:
		errors.append("进化视觉 ownerDecisionSha256 无效：%s" % form_id)
	elif FileAccess.get_file_as_string(decision_path).sha256_text() != expected_sha:
		errors.append("进化视觉 ownerDecisionSha256 不匹配：%s" % form_id)
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(decision_path))
	if not (parsed is Dictionary):
		errors.append("进化视觉 ownerDecision 不是 JSON 对象：%s" % form_id)
		return
	var decision := parsed as Dictionary
	if (
		str(decision.get("decision", "")) != STATUS_APPROVED
		or str(decision.get("formId", "")) != form_id
		or str(decision.get("animationId", "")) != str(visual.get("animationId", ""))
		or bool(decision.get("routeRuntimeEnabled", true))
	):
		errors.append("进化视觉 ownerDecision 范围或结论无效：%s" % form_id)


static func _validate_presentation_copy(form_id: String, value, errors: Array[String]) -> void:
	if not (value is Dictionary):
		errors.append("进化视觉缺少 presentationCopy：%s" % form_id)
		return
	var copy := value as Dictionary
	if copy.size() != 2 or not copy.has("intro") or not copy.has("stages"):
		errors.append("进化视觉 presentationCopy 只允许 intro/stages：%s" % form_id)
		return
	if str(copy.get("intro", "")).strip_edges() == "":
		errors.append("进化视觉 presentationCopy.intro 不能为空：%s" % form_id)
	var stages_value = copy.get("stages", null)
	if not (stages_value is Array) or (stages_value as Array).size() != REQUIRED_STAGE_COUNT:
		errors.append("进化视觉 presentationCopy.stages 必须恰好三段：%s" % form_id)
		return
	var previous_end := 0
	for index in range(REQUIRED_STAGE_COUNT):
		var stage_value = (stages_value as Array)[index]
		if not (stage_value is Dictionary):
			errors.append("进化视觉第%d段不是对象：%s" % [index + 1, form_id])
			continue
		var stage := stage_value as Dictionary
		if stage.size() != 2 or not stage.has("label") or not stage.has("endFrame"):
			errors.append("进化视觉第%d段只允许 label/endFrame：%s" % [index + 1, form_id])
			continue
		if str(stage.get("label", "")).strip_edges() == "":
			errors.append("进化视觉第%d段 label 不能为空：%s" % [index + 1, form_id])
		var end_value = stage.get("endFrame", null)
		if not _is_integer_value(end_value):
			errors.append("进化视觉第%d段 endFrame 必须是整数：%s" % [index + 1, form_id])
			continue
		var end_frame := int(end_value)
		if end_frame <= previous_end or end_frame > REQUIRED_FRAME_COUNT:
			errors.append("进化视觉第%d段 endFrame 顺序无效：%s" % [index + 1, form_id])
		previous_end = end_frame
	if previous_end != REQUIRED_FRAME_COUNT:
		errors.append("进化视觉最后一段必须结束于第12帧：%s" % form_id)


static func _is_integer_value(value) -> bool:
	return (
		(value is int)
		or (
			value is float
			and is_finite(float(value))
			and floorf(float(value)) == float(value)
		)
	)


static func _bundle_root(form_id: String) -> String:
	return PetArtCatalog.pet_bundle_metadata_path(form_id).get_base_dir()


static func _evolution_visual(form_id: String) -> Dictionary:
	var value = _bundle_metadata(form_id).get("evolutionVisual", {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


static func _bundle_metadata(form_id: String) -> Dictionary:
	var normalized := form_id.strip_edges()
	if _metadata_cache.has(normalized):
		var cached = _metadata_cache.get(normalized, {})
		return (cached as Dictionary).duplicate(true) if cached is Dictionary else {}
	var path := PetArtCatalog.pet_bundle_metadata_path(normalized)
	if path == "" or not FileAccess.file_exists(path):
		_metadata_cache[normalized] = {}
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		_metadata_cache[normalized] = {}
		return {}
	_metadata_cache[normalized] = parsed
	return (parsed as Dictionary).duplicate(true)


static func _texture_key(animation_id: String, frame_number: int) -> String:
	return "%s:%d" % [animation_id, frame_number]
