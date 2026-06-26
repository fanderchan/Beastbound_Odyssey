extends RefCounted


const PetIndividualGrowthModel := preload("res://scripts/progression/pet_individual_growth_model.gd")


static func combat_power_for_stats(value: Dictionary) -> int:
	var max_hp := maxi(0, int(value.get("maxHp", value.get("hp", 0))))
	var attack := maxi(0, int(value.get("attack", 0)))
	var defense := maxi(0, int(value.get("defense", 0)))
	var agility := maxi(0, int(value.get("agility", value.get("quick", 0))))
	return int(round(float(max_hp) / 4.0 + float(attack + defense + agility)))


static func combat_power_for_pet(value: Dictionary) -> int:
	return combat_power_for_stats(value)


static func combat_power_breakdown_for_pet(value: Dictionary) -> Dictionary:
	return PetIndividualGrowthModel.power_breakdown(value)


static func combat_power_label_for_pet(value: Dictionary) -> String:
	return "战力 %d" % combat_power_for_pet(value)


static func combat_power_source_label_for_pet(value: Dictionary) -> String:
	return PetIndividualGrowthModel.power_source_label(value)
