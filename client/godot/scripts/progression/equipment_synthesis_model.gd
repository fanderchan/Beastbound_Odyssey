extends RefCounted

const DATA_PATH := "res://data/equipment_synthesis_recipes.json"
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


static func recipes() -> Array[Dictionary]:
	var parsed := _data()
	var raw_recipes = parsed.get("recipes", [])
	var result: Array[Dictionary] = []
	if raw_recipes is Array:
		for value in raw_recipes:
			if value is Dictionary and str((value as Dictionary).get("id", "")) != "":
				result.append(value as Dictionary)
	return result


static func recipe_for_id(recipe_id: String) -> Dictionary:
	for recipe in recipes():
		if str(recipe.get("id", "")) == recipe_id:
			return recipe
	return {}


static func label_for(recipe_id: String, fallback: String = "合成") -> String:
	var recipe := recipe_for_id(recipe_id)
	if recipe.is_empty():
		return fallback
	return str(recipe.get("label", output_label_for_recipe(recipe, fallback)))


static func output_item_id(recipe: Dictionary) -> String:
	return str(recipe.get("outputItemId", ""))


static func output_count(recipe: Dictionary) -> int:
	return maxi(1, int(recipe.get("outputCount", 1)))


static func output_label_for_recipe(recipe: Dictionary, fallback: String = "装备") -> String:
	var item_id := output_item_id(recipe)
	return EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, fallback))


static func stone_cost(recipe: Dictionary) -> int:
	return maxi(0, int(recipe.get("stoneCost", 0)))


static func success_rate(recipe: Dictionary) -> float:
	return clampf(float(recipe.get("successRate", 1.0)), 0.0, 1.0)


static func material_entries(recipe: Dictionary) -> Array[Dictionary]:
	var raw_materials = recipe.get("materials", [])
	var result: Array[Dictionary] = []
	if raw_materials is Array:
		for value in raw_materials:
			if not (value is Dictionary):
				continue
			var material := value as Dictionary
			var item_id := str(material.get("itemId", ""))
			var count := maxi(0, int(material.get("count", 0)))
			if item_id != "" and count > 0:
				result.append({
					"itemId": item_id,
					"count": count,
				})
	return BackpackModel.merge_item_amounts(result)


static func material_text(recipe: Dictionary) -> String:
	return BackpackModel.item_amounts_text(material_entries(recipe))


static func output_text(recipe: Dictionary) -> String:
	var item_id := output_item_id(recipe)
	var count := output_count(recipe)
	return "%s x%d" % [EquipmentModel.label_for(item_id, BackpackModel.label_for(item_id, item_id)), count]


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var parsed := _data()
	if parsed.is_empty():
		errors.append("equipment_synthesis_recipes.json 缺失或不是 JSON 对象")
		return errors
	if int(parsed.get("schemaVersion", 0)) != 1:
		errors.append("equipment_synthesis_recipes.json schemaVersion 当前必须是 1")
	var ids_seen := {}
	for recipe in recipes():
		var recipe_id := str(recipe.get("id", ""))
		if ids_seen.has(recipe_id):
			errors.append("装备合成配方 ID 重复: %s" % recipe_id)
		ids_seen[recipe_id] = true
		var output_id := output_item_id(recipe)
		if output_id == "" or not EquipmentModel.is_equipment(output_id):
			errors.append("%s.outputItemId 不是有效装备: %s" % [recipe_id, output_id])
		if BackpackModel.item_for_id(output_id).is_empty():
			errors.append("%s.outputItemId 未登记到背包物品表: %s" % [recipe_id, output_id])
		if output_count(recipe) <= 0:
			errors.append("%s.outputCount 必须大于 0" % recipe_id)
		if stone_cost(recipe) < 0:
			errors.append("%s.stoneCost 必须大于等于 0" % recipe_id)
		if success_rate(recipe) <= 0.0:
			errors.append("%s.successRate 当前第一版必须大于 0" % recipe_id)
		var materials := material_entries(recipe)
		if materials.is_empty():
			errors.append("%s.materials 不能为空" % recipe_id)
		for material in materials:
			var material_id := str(material.get("itemId", ""))
			if BackpackModel.item_for_id(material_id).is_empty():
				errors.append("%s.materials 包含未知物品: %s" % [recipe_id, material_id])
			if int(material.get("count", 0)) <= 0:
				errors.append("%s.materials.%s 数量必须大于 0" % [recipe_id, material_id])
	return errors


static func _data() -> Dictionary:
	if data_cache_loaded:
		return data_cache
	data_cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		data_cache = {}
		return data_cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	data_cache = parsed as Dictionary if parsed is Dictionary else {}
	return data_cache
