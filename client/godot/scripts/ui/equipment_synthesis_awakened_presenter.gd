extends RefCounted
class_name EquipmentSynthesisAwakenedPresenter

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const EquipmentSynthesisModel := preload(
	"res://scripts/progression/equipment_synthesis_model.gd"
)
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")


static func build_view_state(profile: Dictionary, recipe_id: String) -> Dictionary:
	var normalized := PlayerProgressModel.normalize_profile(profile)
	var recipe := EquipmentSynthesisModel.recipe_for_id(recipe_id)
	if recipe.is_empty():
		return {
			"recipeId": "",
			"outputItemId": "",
			"outputLabel": "请选择配方",
			"description": "从左侧选择一项装备配方。",
			"successPercent": 0,
			"stoneCost": 0,
			"stoneHeld": PlayerProgressModel.stone_coins(normalized),
			"stoneEnough": false,
			"materials": [],
			"attributeLines": [],
			"canSynthesize": false,
			"statusText": "暂无可预览的合成配方。",
		}

	var output_item_id := EquipmentSynthesisModel.output_item_id(recipe)
	var materials: Array[Dictionary] = []
	for material in EquipmentSynthesisModel.material_entries(recipe):
		var item_id := str(material.get("itemId", ""))
		var required_count := maxi(0, int(material.get("count", 0)))
		var held_count := PlayerProgressModel.backpack_item_count(normalized, item_id)
		materials.append({
			"itemId": item_id,
			"label": BackpackModel.label_for(item_id, item_id),
			"required": required_count,
			"held": held_count,
			"enough": held_count >= required_count,
		})
	var stone_cost := EquipmentSynthesisModel.stone_cost(recipe)
	var stone_held := PlayerProgressModel.stone_coins(normalized)
	var eligibility := PlayerProgressModel.can_synthesize_equipment(normalized, recipe_id)
	return {
		"recipeId": recipe_id,
		"outputItemId": output_item_id,
		"outputLabel": EquipmentSynthesisModel.output_label_for_recipe(recipe),
		"outputCount": EquipmentSynthesisModel.output_count(recipe),
		"description": str(recipe.get("description", "")).strip_edges(),
		"successPercent": int(roundf(EquipmentSynthesisModel.success_rate(recipe) * 100.0)),
		"stoneCost": stone_cost,
		"stoneHeld": stone_held,
		"stoneEnough": stone_held >= stone_cost,
		"materials": materials,
		"attributeLines": EquipmentModel.detail_lines_for_item(output_item_id),
		"canSynthesize": bool(eligibility.get("ok", false)),
		"statusText": str(eligibility.get("message", "")),
	}
