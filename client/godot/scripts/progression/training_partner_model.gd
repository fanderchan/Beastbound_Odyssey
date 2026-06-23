extends RefCounted

const PROFILE_KEY := "trainingPartners"
const MAX_PARTNERS := 4
const SLOT_NUMBERS: Array[int] = [1, 2, 4, 5]
const PLAYER_STAT_KEYS: Array[String] = ["hp", "maxHp", "attack", "defense", "quick"]
const PET_STAT_KEYS: Array[String] = ["hp", "maxHp", "attack", "defense", "quick"]


static func clamp_partner_count(value) -> int:
	return clampi(int(value), 0, MAX_PARTNERS)


static func partner_id_for_index(index: int) -> String:
	return "training_partner_%d" % [index + 1]


static func partner_name_for_index(index: int) -> String:
	return "陪练伙伴%d" % [index + 1]


static func partner_pet_name_for_index(index: int, pet_name: String = "") -> String:
	var source_name := pet_name.strip_edges()
	if source_name == "":
		source_name = "布伊"
	return "陪练%s%d" % [source_name, index + 1]


static func slot_number_for_index(index: int) -> int:
	if index < 0 or index >= SLOT_NUMBERS.size():
		return SLOT_NUMBERS[0]
	return SLOT_NUMBERS[index]


static func normalize_partners(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if value is Array:
		for entry_value in value:
			if result.size() >= MAX_PARTNERS:
				break
			if entry_value is Dictionary:
				var entry := normalize_partner(entry_value as Dictionary, result.size())
				if not entry.is_empty():
					result.append(entry)
	return result


static func normalize_partner(value: Dictionary, index: int) -> Dictionary:
	var entry := value.duplicate(true)
	var safe_index := clampi(index, 0, MAX_PARTNERS - 1)
	entry["partnerId"] = str(entry.get("partnerId", partner_id_for_index(safe_index)))
	entry["name"] = str(entry.get("name", partner_name_for_index(safe_index))).strip_edges()
	if str(entry.get("name", "")) == "":
		entry["name"] = partner_name_for_index(safe_index)
	entry["level"] = maxi(1, int(entry.get("level", 1)))
	entry["exp"] = maxi(0, int(entry.get("exp", 0)))
	entry["nextExp"] = maxi(1, int(entry.get("nextExp", 120)))
	entry["slotNumber"] = slot_number_for_index(safe_index)
	for key in PLAYER_STAT_KEYS:
		var fallback := 120 if key == "hp" or key == "maxHp" else 1
		entry[key] = maxi(1, int(entry.get(key, fallback)))
	entry["hp"] = clampi(int(entry.get("hp", entry.get("maxHp", 1))), 1, maxi(1, int(entry.get("maxHp", 1))))
	var pet_value = entry.get("pet", {})
	var pet := (pet_value as Dictionary).duplicate(true) if pet_value is Dictionary else {}
	pet["name"] = str(pet.get("name", partner_pet_name_for_index(safe_index))).strip_edges()
	if str(pet.get("name", "")) == "":
		pet["name"] = partner_pet_name_for_index(safe_index)
	pet["formId"] = str(pet.get("formId", pet.get("templateId", "bui_normal_red_fire10")))
	pet["templateId"] = str(pet.get("templateId", pet.get("formId", "bui_normal_red_fire10")))
	pet["level"] = maxi(1, int(pet.get("level", entry.get("level", 1))))
	pet["exp"] = maxi(0, int(pet.get("exp", 0)))
	pet["nextExp"] = maxi(1, int(pet.get("nextExp", 120)))
	for key in PET_STAT_KEYS:
		var pet_fallback := 90 if key == "hp" or key == "maxHp" else 1
		pet[key] = maxi(1, int(pet.get(key, pet_fallback)))
	pet["hp"] = clampi(int(pet.get("hp", pet.get("maxHp", 1))), 1, maxi(1, int(pet.get("maxHp", 1))))
	entry["pet"] = pet
	return entry


static func summary_lines(partners: Array[Dictionary]) -> Array[String]:
	if partners.is_empty():
		return ["当前没有陪练伙伴。"]
	var lines: Array[String] = []
	for index in range(partners.size()):
		var partner := normalize_partner(partners[index], index)
		var pet := partner.get("pet", {}) as Dictionary
		lines.append("%s Lv%d / %s Lv%d" % [
			str(partner.get("name", partner_name_for_index(index))),
			int(partner.get("level", 1)),
			str(pet.get("name", "陪练宠物")),
			int(pet.get("level", 1)),
		])
	return lines
