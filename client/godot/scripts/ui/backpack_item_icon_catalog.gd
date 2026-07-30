extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")

const PET_RELATED_ITEM_MODEL_PATH := (
	"res://scripts/progression/pet_related_item_portrait_model.gd"
)
const PET_PORTRAIT_CATALOG_PATH := "res://scripts/ui/pet_portrait_art_catalog.gd"

const MANIFEST_SPECS := [
	{
		"path":
		"res://assets/ui/backpack_awakened_v1/source/consumable_atlas/manifest-part.json",
		"priority": 10,
		"optional": false,
	},
	{
		"path":
		"res://assets/ui/backpack_awakened_v1/source/equipment_atlas/manifest-part.json",
		"priority": 20,
		"optional": false,
	},
	{
		"path":
		"res://assets/ui/backpack_awakened_v1/source/material_atlas/manifest-part.json",
		"priority": 30,
		"optional": false,
	},
	{
		"path":
		"res://assets/ui/backpack_awakened_v1/source/pet_item_atlas/manifest-part.json",
		"priority": 40,
		"optional": true,
	},
]

const ITEM_ALIASES := {
	"item_pet_exp_pill_lv131": "item_exp_pill_lv131",
}

const FORBIDDEN_FAKE_SOURCE_MARKERS := [
	"placeholder",
	"fallback_glyph",
	"glyph",
	"emoji",
	"text_icon",
]

static var _loaded: bool = false
static var _atlas_entry_cache: Dictionary = {}
static var _texture_cache: Dictionary = {}
static var _source_cache: Dictionary = {}
static var _manifest_errors: Array[String] = []
static var _atlas_textures_by_path: Dictionary = {}
static var _optional_portrait_adapter_checked: bool = false
static var _pet_related_item_model = null
static var _pet_portrait_catalog = null


static func texture_for_item(item_id: String) -> Texture2D:
	var normalized_id := item_id.strip_edges()
	if normalized_id == "":
		return null
	_ensure_loaded()
	if _texture_cache.has(normalized_id):
		return _texture_cache.get(normalized_id) as Texture2D

	var formal_portrait := _formal_pet_portrait_for_item(normalized_id)
	if formal_portrait != null:
		_texture_cache[normalized_id] = formal_portrait
		return formal_portrait

	var resolved_id := _resolved_item_id(normalized_id)
	var entry_value = _atlas_entry_cache.get(resolved_id, {})
	if not (entry_value is Dictionary) or (entry_value as Dictionary).is_empty():
		_texture_cache[normalized_id] = null
		_source_cache[normalized_id] = ""
		return null
	var entry := entry_value as Dictionary
	var texture_value = entry.get("texture", null)
	var texture := texture_value as Texture2D if texture_value is Texture2D else null
	_texture_cache[normalized_id] = texture
	var direct_source := str(entry.get("source", ""))
	_source_cache[normalized_id] = (
		direct_source
		if resolved_id == normalized_id
		else "alias:%s->%s|%s" % [normalized_id, resolved_id, direct_source]
	)
	return texture


static func atlas_texture_for_item(item_id: String) -> Texture2D:
	var normalized_id := item_id.strip_edges()
	if normalized_id == "":
		return null
	_ensure_loaded()
	var resolved_id := _resolved_item_id(normalized_id)
	var entry_value = _atlas_entry_cache.get(resolved_id, {})
	if not (entry_value is Dictionary):
		return null
	var texture_value = (entry_value as Dictionary).get("texture", null)
	return texture_value as Texture2D if texture_value is Texture2D else null


static func texture_for_view(view: Dictionary) -> Texture2D:
	return texture_for_item(str(view.get("itemId", "")))


static func view_with_icon(view: Dictionary) -> Dictionary:
	var result := view.duplicate(true)
	var texture := texture_for_view(result)
	if texture != null:
		result["iconTexture"] = texture
	return result


static func source_for_item(item_id: String) -> String:
	var normalized_id := item_id.strip_edges()
	if normalized_id == "":
		return ""
	texture_for_item(normalized_id)
	return str(_source_cache.get(normalized_id, ""))


static func has_real_texture(item_id: String) -> bool:
	var texture := texture_for_item(item_id)
	if texture == null or texture.get_width() <= 0 or texture.get_height() <= 0:
		return false
	var source := source_for_item(item_id)
	if source == "":
		return false
	var lowered_source := source.to_lower()
	for marker in FORBIDDEN_FAKE_SOURCE_MARKERS:
		if lowered_source.contains(marker):
			return false
	return true


static func catalog_item_ids() -> Array[String]:
	_ensure_loaded()
	var result: Array[String] = []
	for item in BackpackModel.items():
		var item_id := str(item.get("id", "")).strip_edges()
		if item_id != "" and not result.has(item_id):
			result.append(item_id)
	for item in EquipmentModel.items():
		var item_id := str(item.get("id", "")).strip_edges()
		if item_id != "" and not result.has(item_id):
			result.append(item_id)
	result.sort()
	return result


static func validation_errors() -> Array[String]:
	_ensure_loaded()
	var errors: Array[String] = _manifest_errors.duplicate()
	for item_id in catalog_item_ids():
		var texture := texture_for_item(item_id)
		if texture == null:
			errors.append("背包正式图标缺失：%s" % item_id)
			continue
		if texture.get_width() <= 0 or texture.get_height() <= 0:
			errors.append("背包正式图标尺寸无效：%s" % item_id)
			continue
		var source := source_for_item(item_id)
		if source == "":
			errors.append("背包正式图标缺少来源绑定：%s" % item_id)
			continue
		var lowered_source := source.to_lower()
		for marker in FORBIDDEN_FAKE_SOURCE_MARKERS:
			if lowered_source.contains(marker):
				errors.append("背包图标禁止使用文字、emoji 或占位来源：%s：%s" % [
					item_id,
					source,
				])
				break
		if not (texture is AtlasTexture) and not source.begins_with("formal_pet_portrait:"):
			errors.append("背包图标不是 manifest atlas 或正式宠物大头照：%s：%s" % [
				item_id,
				source,
			])
	for item_id in _pet_related_item_ids():
		var fallback_texture := atlas_texture_for_item(item_id)
		if fallback_texture == null:
			errors.append("宠物关联物品缺少 pet atlas 运行时降级图标：%s" % item_id)
	return errors


static func self_check() -> Dictionary:
	var errors := validation_errors()
	var backpack_count := BackpackModel.items().size()
	var equipment_count := EquipmentModel.items().size()
	var pet_fallback_count := 0
	var atlas_count := 0
	var portrait_count := 0
	var alias_count := 0
	for item_id in catalog_item_ids():
		var source := source_for_item(item_id)
		if source.begins_with("formal_pet_portrait:"):
			portrait_count += 1
		elif source.begins_with("alias:"):
			alias_count += 1
		elif source.begins_with("atlas:"):
			atlas_count += 1
	for item_id in _pet_related_item_ids():
		if atlas_texture_for_item(item_id) != null:
			pet_fallback_count += 1
	return {
		"ok": errors.is_empty(),
		"itemCount": catalog_item_ids().size(),
		"backpackItemCount": backpack_count,
		"equipmentItemCount": equipment_count,
		"atlasTextureCount": atlas_count,
		"formalPetPortraitCount": portrait_count,
		"petAtlasFallbackCount": pet_fallback_count,
		"aliasCount": alias_count,
		"fakeSourceCount": 0 if errors.is_empty() else _fake_source_error_count(errors),
		"errors": errors,
	}


static func reload_optional_assets() -> void:
	clear_caches_for_qa()
	_ensure_loaded()


static func clear_caches_for_qa() -> void:
	_loaded = false
	_atlas_entry_cache.clear()
	_texture_cache.clear()
	_source_cache.clear()
	_manifest_errors.clear()
	_atlas_textures_by_path.clear()
	_optional_portrait_adapter_checked = false
	_pet_related_item_model = null
	_pet_portrait_catalog = null


static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	for raw_spec in MANIFEST_SPECS:
		if raw_spec is Dictionary:
			_load_manifest(raw_spec as Dictionary)


static func _load_manifest(spec: Dictionary) -> void:
	var manifest_path := str(spec.get("path", "")).strip_edges()
	var optional := bool(spec.get("optional", false))
	if manifest_path == "":
		if not optional:
			_manifest_errors.append("背包图标 manifest 路径为空")
		return
	if not FileAccess.file_exists(manifest_path):
		if not optional:
			_manifest_errors.append("背包图标 manifest 不存在：%s" % manifest_path)
		return
	var file := FileAccess.open(manifest_path, FileAccess.READ)
	if file == null:
		_manifest_errors.append("背包图标 manifest 无法读取：%s" % manifest_path)
		return
	var parser := JSON.new()
	var parse_error := parser.parse(file.get_as_text())
	file.close()
	if parse_error != OK or not (parser.data is Dictionary):
		_manifest_errors.append("背包图标 manifest JSON 无效：%s" % manifest_path)
		return
	var manifest := parser.data as Dictionary
	if int(manifest.get("schemaVersion", 0)) != 1:
		_manifest_errors.append("背包图标 manifest schemaVersion 不支持：%s" % manifest_path)
		return

	var atlas_meta_value = manifest.get("atlas", {})
	var atlas_meta := (
		atlas_meta_value as Dictionary if atlas_meta_value is Dictionary else {}
	)
	var grid_meta_value = manifest.get("grid", atlas_meta)
	var grid_meta := (
		grid_meta_value as Dictionary if grid_meta_value is Dictionary else {}
	)
	var size_meta_value = manifest.get("atlasSize", atlas_meta)
	var size_meta := (
		size_meta_value as Dictionary if size_meta_value is Dictionary else {}
	)
	var runtime_path := str(
		manifest.get("runtimePath", atlas_meta.get("path", ""))
	).strip_edges()
	var manifest_id := str(
		manifest.get("atlasId", manifest_path.get_file().get_basename())
	).strip_edges()
	var columns := int(grid_meta.get("columns", atlas_meta.get("columns", 0)))
	var rows := int(grid_meta.get("rows", atlas_meta.get("rows", 0)))
	var cell_width := int(grid_meta.get("cellWidth", atlas_meta.get("cellWidth", 0)))
	var cell_height := int(grid_meta.get("cellHeight", atlas_meta.get("cellHeight", 0)))
	var declared_width := int(size_meta.get("width", atlas_meta.get("width", 0)))
	var declared_height := int(size_meta.get("height", atlas_meta.get("height", 0)))
	if (
		runtime_path == ""
		or columns <= 0
		or rows <= 0
		or cell_width <= 0
		or cell_height <= 0
	):
		_manifest_errors.append("背包图标 manifest atlas/grid 合同不完整：%s" % manifest_path)
		return
	if not ResourceLoader.exists(runtime_path, "Texture2D"):
		_manifest_errors.append("背包图标 atlas 资源不存在：%s" % runtime_path)
		return
	var atlas_value = ResourceLoader.load(runtime_path, "Texture2D")
	var atlas := atlas_value as Texture2D if atlas_value is Texture2D else null
	if atlas == null:
		_manifest_errors.append("背包图标 atlas 不是 Texture2D：%s" % runtime_path)
		return
	if declared_width > 0 and atlas.get_width() != declared_width:
		_manifest_errors.append("背包图标 atlas 宽度与 manifest 不一致：%s" % runtime_path)
	if declared_height > 0 and atlas.get_height() != declared_height:
		_manifest_errors.append("背包图标 atlas 高度与 manifest 不一致：%s" % runtime_path)
	if columns * cell_width > atlas.get_width() or rows * cell_height > atlas.get_height():
		_manifest_errors.append("背包图标 atlas 网格越界：%s" % runtime_path)
		return
	_atlas_textures_by_path[runtime_path] = atlas

	var items_value = manifest.get("items", [])
	var priority := int(spec.get("priority", 0))
	if items_value is Dictionary:
		for raw_item_id in (items_value as Dictionary).keys():
			var item_id := str(raw_item_id).strip_edges()
			var cell_value = (items_value as Dictionary).get(raw_item_id, {})
			if item_id == "" or not (cell_value is Dictionary):
				_manifest_errors.append("背包图标 manifest 含无效物品格：%s" % manifest_path)
				continue
			_register_manifest_cell(
				item_id,
				cell_value as Dictionary,
				atlas,
				runtime_path,
				manifest_id,
				manifest_path,
				columns,
				rows,
				cell_width,
				cell_height,
				priority
			)
	elif items_value is Array:
		for cell_value in items_value:
			if not (cell_value is Dictionary):
				_manifest_errors.append("背包图标 manifest 含非对象物品格：%s" % manifest_path)
				continue
			var cell := cell_value as Dictionary
			if bool(cell.get("reservedEmpty", false)):
				continue
			var item_id := str(cell.get("itemId", cell.get("id", ""))).strip_edges()
			if item_id == "":
				_manifest_errors.append("背包图标 manifest 物品格缺少 itemId：%s" % manifest_path)
				continue
			_register_manifest_cell(
				item_id,
				cell,
				atlas,
				runtime_path,
				manifest_id,
				manifest_path,
				columns,
				rows,
				cell_width,
				cell_height,
				priority
			)
	else:
		_manifest_errors.append("背包图标 manifest items 必须是对象或数组：%s" % manifest_path)


static func _register_manifest_cell(
	item_id: String,
	cell: Dictionary,
	atlas: Texture2D,
	runtime_path: String,
	manifest_id: String,
	manifest_path: String,
	columns: int,
	rows: int,
	cell_width: int,
	cell_height: int,
	priority: int
) -> void:
	var row := int(cell.get("row", -1))
	var column := int(cell.get("column", -1))
	if row < 0 or column < 0 or row >= rows or column >= columns:
		_manifest_errors.append("背包图标物品格坐标越界：%s：%s" % [manifest_path, item_id])
		return
	var current_value = _atlas_entry_cache.get(item_id, {})
	if current_value is Dictionary and not (current_value as Dictionary).is_empty():
		if int((current_value as Dictionary).get("priority", -1)) >= priority:
			return
	var atlas_texture := AtlasTexture.new()
	atlas_texture.atlas = atlas
	atlas_texture.region = Rect2(
		Vector2(column * cell_width, row * cell_height),
		Vector2(cell_width, cell_height)
	)
	_atlas_entry_cache[item_id] = {
		"texture": atlas_texture,
		"source": "atlas:%s|%s|%s" % [manifest_id, runtime_path, manifest_path],
		"priority": priority,
		"row": row,
		"column": column,
	}


static func _formal_pet_portrait_for_item(item_id: String) -> Texture2D:
	_ensure_optional_portrait_adapter()
	if _pet_related_item_model == null or _pet_portrait_catalog == null:
		return null
	if (
		not _pet_related_item_model.has_method("is_supported_item")
		or not _pet_related_item_model.has_method("form_id_for_item")
		or not _pet_portrait_catalog.has_method("texture_for_form")
	):
		return null
	if not bool(_pet_related_item_model.call("is_supported_item", item_id)):
		return null
	var form_id := str(
		_pet_related_item_model.call("form_id_for_item", item_id)
	).strip_edges()
	if form_id == "":
		return null
	var texture_value = _pet_portrait_catalog.call("texture_for_form", form_id)
	var texture := texture_value as Texture2D if texture_value is Texture2D else null
	if texture == null:
		return null
	_source_cache[item_id] = "formal_pet_portrait:%s" % form_id
	return texture


static func _ensure_optional_portrait_adapter() -> void:
	if _optional_portrait_adapter_checked:
		return
	_optional_portrait_adapter_checked = true
	if (
		not ResourceLoader.exists(PET_RELATED_ITEM_MODEL_PATH)
		or not ResourceLoader.exists(PET_PORTRAIT_CATALOG_PATH)
	):
		return
	_pet_related_item_model = ResourceLoader.load(PET_RELATED_ITEM_MODEL_PATH)
	_pet_portrait_catalog = ResourceLoader.load(PET_PORTRAIT_CATALOG_PATH)


static func _resolved_item_id(item_id: String) -> String:
	var current := item_id
	var seen: Dictionary = {}
	while ITEM_ALIASES.has(current) and not seen.has(current):
		seen[current] = true
		current = str(ITEM_ALIASES.get(current, current))
	return current


static func _pet_related_item_ids() -> Array[String]:
	var result: Array[String] = []
	for item in BackpackModel.items():
		var item_id := str(item.get("id", "")).strip_edges()
		if item_id == "":
			continue
		if (
			BackpackModel.item_can_world_pet_egg(item_id)
			or BackpackModel.item_can_world_pet_tame_permit(item_id)
			or BackpackModel.item_can_world_pet_ride_permit(item_id)
		):
			result.append(item_id)
	result.sort()
	return result


static func _fake_source_error_count(errors: Array[String]) -> int:
	var result := 0
	for error in errors:
		if str(error).contains("文字、emoji 或占位"):
			result += 1
	return result
