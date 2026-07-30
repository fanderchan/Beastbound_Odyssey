extends RefCounted

const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")

const EXPECTED_FRAME_SIZE := Vector2i(512, 512)
const REPO_RESOURCE_PREFIX := "client/godot/"
const PET_ASSET_PREFIX := "client/godot/assets/pets/"
const PORTRAIT_DIRECTORY_SEGMENT := "/portrait/"
const FORBIDDEN_PATH_SEGMENTS: Array[String] = [
	"/identity/",
	"/world/",
	"/battle/",
	"/mounted/",
	"/showcase/",
]

static var _texture_cache: Dictionary = {}
static var _resource_path_cache: Dictionary = {}
static var _load_error_cache: Dictionary = {}


static func texture_for_form(form_id: String) -> Texture2D:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "":
		return null
	if _texture_cache.has(normalized_id):
		return _texture_cache.get(normalized_id) as Texture2D
	var resource_path := resource_path_for_form(normalized_id)
	if resource_path == "":
		_texture_cache[normalized_id] = null
		_load_error_cache[normalized_id] = "没有显式登记可用的大头照路径"
		return null
	if not ResourceLoader.exists(resource_path, "Texture2D"):
		_texture_cache[normalized_id] = null
		_load_error_cache[normalized_id] = "大头照资源不存在：%s" % resource_path
		return null
	var texture := ResourceLoader.load(resource_path, "Texture2D") as Texture2D
	var texture_error := _runtime_texture_error(texture)
	if texture_error != "":
		_texture_cache[normalized_id] = null
		_load_error_cache[normalized_id] = "%s：%s" % [texture_error, resource_path]
		return null
	_texture_cache[normalized_id] = texture
	_load_error_cache[normalized_id] = ""
	return texture


static func has_formal_portrait(form_id: String) -> bool:
	return texture_for_form(form_id) != null


static func declared_path_for_form(form_id: String) -> String:
	var record := PetArtCatalog.form_record(form_id.strip_edges())
	var pet_value = record.get("pet", {})
	if not (pet_value is Dictionary):
		return ""
	var raw_path = (pet_value as Dictionary).get("portraitPath", "")
	return str(raw_path).strip_edges() if typeof(raw_path) == TYPE_STRING else ""


static func resource_path_for_form(form_id: String) -> String:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "":
		return ""
	if _resource_path_cache.has(normalized_id):
		return str(_resource_path_cache.get(normalized_id, ""))
	var record := PetArtCatalog.form_record(normalized_id)
	var resource_path := ""
	if not record.is_empty() and contract_validation_errors_for_record(record).is_empty():
		var declared_path := declared_path_for_form(normalized_id)
		resource_path = "res://%s" % declared_path.substr(REPO_RESOURCE_PREFIX.length())
	_resource_path_cache[normalized_id] = resource_path
	return resource_path


static func prewarm_forms(form_ids: Array[String]) -> bool:
	var all_ready := true
	for form_id in form_ids:
		if texture_for_form(form_id) == null:
			all_ready = false
	return all_ready


static func load_error_for_form(form_id: String) -> String:
	var normalized_id := form_id.strip_edges()
	if normalized_id == "":
		return "formId 为空"
	texture_for_form(normalized_id)
	return str(_load_error_cache.get(normalized_id, ""))


static func contract_validation_errors_for_record(record: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var form_id := str(record.get("formId", "")).strip_edges()
	if form_id == "":
		errors.append("大头照记录缺少 formId")
	var pet_value = record.get("pet", {})
	if not (pet_value is Dictionary):
		errors.append("大头照记录 pet 不是对象：%s" % form_id)
		return errors
	var pet := pet_value as Dictionary
	if not pet.has("root"):
		errors.append("宠物未显式登记 pet.root：%s" % form_id)
		return errors
	if typeof(pet.get("root")) != TYPE_STRING:
		errors.append("pet.root 必须是字符串：%s" % form_id)
		return errors
	var pet_root := str(pet.get("root", "")).strip_edges()
	for root_error in pet_root_validation_errors(pet_root):
		errors.append("%s：%s" % [root_error, form_id])
	if not pet.has("portraitPath"):
		errors.append("宠物未显式登记 pet.portraitPath：%s" % form_id)
		return errors
	if typeof(pet.get("portraitPath")) != TYPE_STRING:
		errors.append("pet.portraitPath 必须是字符串：%s" % form_id)
		return errors
	var declared_path := str(pet.get("portraitPath", "")).strip_edges()
	for path_error in declared_path_validation_errors(declared_path):
		errors.append("%s：%s" % [path_error, form_id])
	var expected_path := "%s/portrait/default.png" % pet_root
	if pet_root != "" and declared_path != expected_path:
		errors.append(
			"pet.portraitPath 必须严格绑定当前形态 pet.root：%s，实际 %s：%s"
			% [expected_path, declared_path, form_id]
		)
	return errors


static func pet_root_validation_errors(pet_root: String) -> Array[String]:
	var errors: Array[String] = []
	var normalized_root := pet_root.strip_edges().replace("\\", "/")
	if normalized_root == "":
		errors.append("pet.root 为空")
		return errors
	if normalized_root != pet_root:
		errors.append("pet.root 必须使用规范正斜杠且不能带首尾空格")
	if normalized_root.begins_with("res://") or normalized_root.begins_with("/"):
		errors.append("pet.root 必须是 repo-relative 路径")
	if not normalized_root.begins_with(PET_ASSET_PREFIX):
		errors.append("pet.root 必须位于正式宠物资产根")
	if normalized_root.ends_with("/"):
		errors.append("pet.root 不能带结尾斜杠")
	var path_parts := normalized_root.split("/", false)
	if path_parts.has("..") or path_parts.has("."):
		errors.append("pet.root 不能包含相对跳转")
	return errors


static func declared_path_validation_errors(declared_path: String) -> Array[String]:
	var errors: Array[String] = []
	var normalized_path := declared_path.strip_edges().replace("\\", "/")
	if normalized_path == "":
		errors.append("pet.portraitPath 为空")
		return errors
	if normalized_path != declared_path:
		errors.append("pet.portraitPath 必须使用规范正斜杠且不能带首尾空格")
	if normalized_path.begins_with("res://") or normalized_path.begins_with("/"):
		errors.append("pet.portraitPath 必须是 repo-relative 路径")
	if not normalized_path.begins_with(PET_ASSET_PREFIX):
		errors.append("pet.portraitPath 必须位于正式宠物资产根")
	if PORTRAIT_DIRECTORY_SEGMENT not in normalized_path:
		errors.append("pet.portraitPath 必须指向专用 portrait 目录")
	if normalized_path.get_extension().to_lower() != "png":
		errors.append("pet.portraitPath 必须指向无损 PNG")
	var path_parts := normalized_path.split("/", false)
	if path_parts.has("..") or path_parts.has("."):
		errors.append("pet.portraitPath 不能包含相对跳转")
	for segment in FORBIDDEN_PATH_SEGMENTS:
		if segment in normalized_path:
			errors.append("pet.portraitPath 禁止复用全身或动作资产目录：%s" % segment)
	return errors


static func validation_errors(form_ids: Array[String] = []) -> Array[String]:
	var errors: Array[String] = []
	var records: Array[Dictionary] = []
	if form_ids.is_empty():
		records = PetArtCatalog.all_form_records()
	else:
		for form_id in form_ids:
			var normalized_id := form_id.strip_edges()
			var record := PetArtCatalog.form_record(normalized_id)
			if record.is_empty():
				errors.append("大头照门禁请求了未知形态：%s" % normalized_id)
				continue
			records.append(record)
	var seen_ids: Dictionary = {}
	for record in records:
		var form_id := str(record.get("formId", "")).strip_edges()
		if form_id != "":
			if seen_ids.has(form_id):
				errors.append("大头照目录重复 formId：%s" % form_id)
				continue
			seen_ids[form_id] = true
		var contract_errors := contract_validation_errors_for_record(record)
		errors.append_array(contract_errors)
		if not contract_errors.is_empty() or form_id == "":
			continue
		if texture_for_form(form_id) == null:
			errors.append("正式大头照加载失败：%s：%s" % [
				form_id,
				load_error_for_form(form_id),
			])
			continue
		var pixel_error := _portrait_pixel_error(texture_for_form(form_id))
		if pixel_error != "":
			errors.append("正式大头照像素合同失败：%s：%s" % [form_id, pixel_error])
	return errors


static func clear_caches_for_qa() -> void:
	_texture_cache.clear()
	_resource_path_cache.clear()
	_load_error_cache.clear()


static func _runtime_texture_error(texture: Texture2D) -> String:
	if texture == null:
		return "大头照不是 Texture2D"
	var size := Vector2i(texture.get_width(), texture.get_height())
	if size != EXPECTED_FRAME_SIZE:
		return "大头照必须为 %dx%d，实际 %dx%d" % [
			EXPECTED_FRAME_SIZE.x,
			EXPECTED_FRAME_SIZE.y,
			size.x,
			size.y,
		]
	return ""


static func _portrait_pixel_error(texture: Texture2D) -> String:
	var image := texture.get_image()
	if image == null or image.is_empty():
		return "大头照无法读取像素"
	if image.get_format() != Image.FORMAT_RGBA8:
		return "大头照必须解码为 RGBA8"
	if image.detect_alpha() == Image.ALPHA_NONE:
		return "大头照必须保留透明通道"
	var used_rect := image.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return "大头照透明通道内没有主体"
	return ""
