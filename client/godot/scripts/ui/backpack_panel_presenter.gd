extends RefCounted

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")

const FILTER_ALL := "all"
const FILTER_WORLD := "world"
const FILTER_BATTLE := "battle"
const FILTER_CAPTURE := "capture"
const FILTER_EQUIPMENT := "equipment"


static func filter_options() -> Array[Dictionary]:
	return [
		{"id": FILTER_ALL, "label": "全部"},
		{"id": FILTER_WORLD, "label": "世界"},
		{"id": FILTER_BATTLE, "label": "战斗"},
		{"id": FILTER_CAPTURE, "label": "捕捉"},
		{"id": FILTER_EQUIPMENT, "label": "装备"},
	]


static func filter_ids() -> Array[String]:
	var result: Array[String] = []
	for option in filter_options():
		result.append(str(option.get("id", "")))
	return result


static func filter_label(filter_id: String) -> String:
	for option in filter_options():
		if str(option.get("id", "")) == filter_id:
			return str(option.get("label", filter_id))
	return filter_id


static func slot_matches_filter(slot: Dictionary, filter_id: String) -> bool:
	if filter_id == FILTER_ALL:
		return true
	var item_id := str(slot.get("itemId", ""))
	if item_id == "":
		return false
	match filter_id:
		FILTER_WORLD:
			return (
				BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_PET_HEAL)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_ENCOUNTER_STONE)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_EXP)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_PLAYER_EXP)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_PET_EXP)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_MM_STONE)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_PET_EGG)
				or BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_WORLD_PET_RIDE_PERMIT)
			)
		FILTER_BATTLE:
			return BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_BATTLE_ITEM)
		FILTER_CAPTURE:
			return BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_CAPTURE)
		FILTER_EQUIPMENT:
			return BackpackModel.item_has_context(item_id, BackpackModel.CONTEXT_EQUIPMENT) or EquipmentModel.is_equipment(item_id)
	return true


static func detail_lines_for_slot(slot: Dictionary, equipment_requirement_lines: Array[String], equipment_compare_lines: Array[String]) -> Array[String]:
	var lines := BackpackModel.detail_lines_for_slot(slot)
	var item_id := str(slot.get("itemId", ""))
	if EquipmentModel.is_equipment(item_id):
		lines.append_array(equipment_requirement_lines)
		lines.append_array(equipment_compare_lines)
	return lines


static func selected_item_actions(slot: Dictionary, slots: Array[Dictionary], equip_check: Dictionary) -> Dictionary:
	var item_id := str(slot.get("itemId", ""))
	var item_count := BackpackModel.item_count(slots, item_id) if item_id != "" else 0
	var is_equipment := EquipmentModel.is_equipment(item_id)
	var can_world_pet_use := (
		item_id != ""
		and item_count > 0
		and (
			BackpackModel.item_can_world_pet_heal(item_id)
			or BackpackModel.item_can_world_pet_exp(item_id)
			or BackpackModel.item_can_world_mm_stone(item_id)
		)
	)
	var can_world_player_use := (
		item_id != ""
		and item_count > 0
		and BackpackModel.item_can_world_player_exp(item_id)
	)
	var can_world_pet_egg := (
		item_id != ""
		and item_count > 0
		and BackpackModel.item_can_world_pet_egg(item_id)
	)
	var can_world_pet_ride_permit := (
		item_id != ""
		and item_count > 0
		and BackpackModel.item_can_world_pet_ride_permit(item_id)
	)
	var can_world_use := can_world_pet_use or can_world_player_use or can_world_pet_egg or can_world_pet_ride_permit
	var can_world_encounter_stone := (
		item_id != ""
		and item_count > 0
		and BackpackModel.item_can_world_encounter_stone(item_id)
	)
	var can_equip := (
		item_id != ""
		and item_count > 0
		and is_equipment
		and bool(equip_check.get("ok", false))
	)
	var use_as_equipment_only := is_equipment and not can_world_player_use
	return {
		"itemId": item_id,
		"count": item_count,
		"isEquipment": is_equipment,
		"canWorldPetUse": can_world_pet_use,
		"canWorldPlayerUse": can_world_player_use,
		"canWorldPetEgg": can_world_pet_egg,
		"canWorldPetRidePermit": can_world_pet_ride_permit,
		"canWorldUse": can_world_use,
		"canWorldEncounterStone": can_world_encounter_stone,
		"canEquip": can_equip,
		"useAsEquipmentOnly": use_as_equipment_only,
		"useButtonVisible": can_world_use or can_world_encounter_stone or is_equipment,
		"useButtonDisabled": not (can_world_use or can_world_encounter_stone or (can_equip and use_as_equipment_only)),
		"useButtonText": "装备" if use_as_equipment_only else "使用",
		"equipButtonVisible": is_equipment and can_world_player_use,
		"equipButtonDisabled": not can_equip,
		"targetSelectionAllowed": can_world_pet_use or can_world_player_use,
	}
