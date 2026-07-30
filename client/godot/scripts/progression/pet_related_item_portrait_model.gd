extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const PetRebirthMmModel := preload("res://scripts/progression/pet_rebirth_mm_model.gd")

const KIND_EGG := "pet_egg"
const KIND_RIDE_PERMIT := "pet_ride_permit"

static var _form_id_cache: Dictionary = {}
static var _kind_cache: Dictionary = {}


static func form_id_for_item(item_id: String) -> String:
	var normalized_id := item_id.strip_edges()
	if normalized_id == "":
		return ""
	if _form_id_cache.has(normalized_id):
		return str(_form_id_cache.get(normalized_id, ""))
	var form_id := _resolve_form_id(normalized_id)
	_form_id_cache[normalized_id] = form_id
	return form_id


static func portrait_kind_for_item(item_id: String) -> String:
	var normalized_id := item_id.strip_edges()
	if normalized_id == "":
		return ""
	if _kind_cache.has(normalized_id):
		return str(_kind_cache.get(normalized_id, ""))
	var kind := ""
	if BackpackModel.item_can_world_pet_egg(normalized_id):
		kind = KIND_EGG
	elif BackpackModel.item_can_world_pet_ride_permit(normalized_id):
		kind = KIND_RIDE_PERMIT
	_kind_cache[normalized_id] = kind
	return kind


static func is_supported_item(item_id: String) -> bool:
	return portrait_kind_for_item(item_id) != "" and form_id_for_item(item_id) != ""


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var item_ids: Array[String] = []
	item_ids.append_array(BackpackModel.item_ids_for_context(BackpackModel.CONTEXT_WORLD_PET_EGG))
	item_ids.append_array(
		BackpackModel.item_ids_for_context(BackpackModel.CONTEXT_WORLD_PET_RIDE_PERMIT)
	)
	for item_id in item_ids:
		var kind := portrait_kind_for_item(item_id)
		if kind == "":
			errors.append("宠物关联物品未识别展示类型：%s" % item_id)
			continue
		var form_id := form_id_for_item(item_id)
		if form_id == "":
			errors.append("宠物关联物品无法从权威字段解析 formId：%s" % item_id)
	return errors


static func clear_caches_for_qa() -> void:
	_form_id_cache.clear()
	_kind_cache.clear()


static func _resolve_form_id(item_id: String) -> String:
	if BackpackModel.item_can_world_pet_egg(item_id):
		var direct_form_id := BackpackModel.world_pet_egg_form_id_for(item_id)
		if direct_form_id != "":
			return direct_form_id
		var helper_stage := BackpackModel.world_pet_egg_stage_for(item_id)
		if helper_stage > 0:
			return PetRebirthMmModel.helper_form_id_for_stage(helper_stage)
		return ""
	if BackpackModel.item_can_world_pet_ride_permit(item_id):
		return BackpackModel.world_pet_ride_permit_form_id_for(item_id)
	return ""
