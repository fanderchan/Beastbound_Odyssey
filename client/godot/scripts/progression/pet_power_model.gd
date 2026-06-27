extends RefCounted


const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const PetIndividualGrowthModel := preload("res://scripts/progression/pet_individual_growth_model.gd")


static func combat_power_for_stats(value: Dictionary) -> int:
	var max_hp := maxi(0, int(value.get("maxHp", value.get("hp", 0))))
	var attack := maxi(0, int(value.get("attack", 0)))
	var defense := maxi(0, int(value.get("defense", 0)))
	var agility := maxi(0, int(value.get("agility", value.get("quick", 0))))
	var weights := BalanceCatalogModel.pet_power_weights()
	var hp_weight := float(weights.get("maxHp", 0.25))
	var attack_weight := float(weights.get("attack", 1.0))
	var defense_weight := float(weights.get("defense", 1.0))
	var quick_weight := float(weights.get("quick", 1.0))
	return int(round(
		float(max_hp) * hp_weight
		+ float(attack) * attack_weight
		+ float(defense) * defense_weight
		+ float(agility) * quick_weight
	))


static func combat_power_for_pet(value: Dictionary) -> int:
	return combat_power_for_stats(value)


static func combat_power_breakdown_for_pet(value: Dictionary) -> Dictionary:
	return PetIndividualGrowthModel.power_breakdown(value)


static func combat_power_label_for_pet(value: Dictionary) -> String:
	return "战力 %d" % combat_power_for_pet(value)


static func combat_power_source_label_for_pet(value: Dictionary) -> String:
	return PetIndividualGrowthModel.power_source_label(value)
