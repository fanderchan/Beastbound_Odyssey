extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")


static func encounter_zones(map_data: Dictionary) -> Array:
	return map_data.get("encounterZones", [])


static func zone_for_cell(map_data: Dictionary, cell: Vector2i) -> Dictionary:
	for value in encounter_zones(map_data):
		var zone := value as Dictionary
		if is_manual_only(zone):
			continue
		if zone_contains_cell(zone, cell):
			return zone
	return {}


static func is_manual_only(zone: Dictionary) -> bool:
	return bool(zone.get("manualOnly", false))


static func zone_contains_cell(zone: Dictionary, cell: Vector2i) -> bool:
	var cells: Array = zone.get("cells", [])
	for value in cells:
		var cell_array := value as Array
		if cell == Vector2i(int(cell_array[0]), int(cell_array[1])):
			return true
	var rects: Array = zone.get("rects", [])
	for value in rects:
		var rect := value as Array
		var origin := Vector2i(int(rect[0]), int(rect[1]))
		var size := Vector2i(int(rect[2]), int(rect[3]))
		if cell.x >= origin.x and cell.y >= origin.y and cell.x < origin.x + size.x and cell.y < origin.y + size.y:
			return true
	return false


static func cells_for_zone(zone: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var cells: Array = zone.get("cells", [])
	for value in cells:
		var cell_array := value as Array
		result.append(Vector2i(int(cell_array[0]), int(cell_array[1])))
	var rects: Array = zone.get("rects", [])
	for value in rects:
		var rect := value as Array
		var origin := Vector2i(int(rect[0]), int(rect[1]))
		var size := Vector2i(int(rect[2]), int(rect[3]))
		for y in range(origin.y, origin.y + size.y):
			for x in range(origin.x, origin.x + size.x):
				var cell := Vector2i(x, y)
				if not result.has(cell):
					result.append(cell)
	return result


static func first_walkable_cell(map_data: Dictionary, zone: Dictionary) -> Vector2i:
	for cell in cells_for_zone(zone):
		if IsoMapModel.is_walkable(map_data, cell):
			return cell
	return IsoMapModel.spawn_cell(map_data)


static func encounter_rate(zone: Dictionary) -> float:
	return clampf(float(zone.get("encounterRate", 0.0)), 0.0, 1.0)


static func enemy_count(zone: Dictionary, fallback: int = 1) -> int:
	if zone.has("selectedEnemyCount"):
		return clampi(int(zone.get("selectedEnemyCount", fallback)), 1, 10)
	return clampi(int(zone.get("enemyCount", fallback)), 1, 10)


static func wild_pet_pool(zone: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if str(zone.get("wildPetPoolSource", "")) == "codex_catchable":
		var sourced_pool := PetTemplateCatalog.catchable_wild_pet_pool(
			maxi(1, int(zone.get("levelMin", 1))),
			maxi(1, int(zone.get("levelMax", zone.get("levelMin", 1))))
		)
		for value in sourced_pool:
			var sourced_entry := _normalized_wild_pet_entry(value)
			if not sourced_entry.is_empty():
				result.append(sourced_entry)
	var raw_pool = zone.get("wildPetPool", [])
	if raw_pool is Array:
		for value in raw_pool:
			if value is Dictionary:
				var entry := _normalized_wild_pet_entry(value as Dictionary)
				if not entry.is_empty():
					result.append(entry)
	if result.is_empty():
		result.append(_normalized_wild_pet_entry({
			"formId": "wuli_normal_orange_fire10",
			"name": "野生乌力",
			"weight": 1,
			"levelMin": 1,
			"levelMax": 1,
			"battleStats": {
				"maxHp": 80,
				"attack": 10,
				"defense": 6,
				"agility": 48,
			},
		}))
	return result


static func selected_wild_pet(zone: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var selected_value = zone.get("selectedWildPet", {})
	if selected_value is Dictionary:
		var selected := _normalized_wild_pet_entry(selected_value as Dictionary)
		if not selected.is_empty():
			return selected
	var pool := wild_pet_pool(zone)
	var total_weight := 0.0
	for entry in pool:
		total_weight += maxf(0.0, float(entry.get("weight", 1.0)))
	if total_weight <= 0.0:
		return _with_selected_level(pool[0], rng)
	var roll := rng.randf_range(0.0, total_weight)
	var cursor := 0.0
	for entry in pool:
		cursor += maxf(0.0, float(entry.get("weight", 1.0)))
		if roll <= cursor:
			return _with_selected_level(entry, rng)
	return _with_selected_level(pool[pool.size() - 1], rng)


static func zone_with_selected_wild_pet(zone: Dictionary, rng: RandomNumberGenerator, fallback_enemy_count: int = 1) -> Dictionary:
	var next_zone := zone.duplicate(true)
	var fixed_pets := _fixed_wild_pets(zone)
	if not fixed_pets.is_empty():
		var count := clampi(fixed_pets.size(), 1, 10)
		next_zone["selectedEnemyCount"] = count
		next_zone["selectedWildPet"] = fixed_pets[0]
		next_zone["selectedWildPets"] = fixed_pets
		return next_zone
	var count := _selected_enemy_count(zone, rng, fallback_enemy_count)
	next_zone["selectedEnemyCount"] = count
	var selected_pets: Array[Dictionary] = []
	if bool(zone.get("individualWildPets", false)):
		for _index in range(count):
			selected_pets.append(selected_wild_pet(zone, rng))
	if selected_pets.is_empty():
		selected_pets.append(selected_wild_pet(zone, rng))
	next_zone["selectedWildPet"] = selected_pets[0]
	next_zone["selectedWildPets"] = selected_pets
	return next_zone


static func _selected_enemy_count(zone: Dictionary, rng: RandomNumberGenerator, fallback_enemy_count: int = 1) -> int:
	if zone.has("enemyCountMin") or zone.has("enemyCountMax"):
		var min_count := clampi(int(zone.get("enemyCountMin", zone.get("enemyCount", 1))), 1, 10)
		var max_count := clampi(int(zone.get("enemyCountMax", min_count)), min_count, 10)
		return rng.randi_range(min_count, max_count)
	return enemy_count(zone, fallback_enemy_count)


static func _fixed_wild_pets(zone: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw_pets = zone.get("fixedWildPets", [])
	if not (raw_pets is Array):
		return result
	for value in raw_pets:
		if not (value is Dictionary):
			continue
		var entry := _normalized_wild_pet_entry(value as Dictionary)
		if not entry.is_empty():
			result.append(entry)
		if result.size() >= 10:
			break
	return result


static func _with_selected_level(entry: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var selected := entry.duplicate(true)
	var level_min := maxi(1, int(selected.get("levelMin", 1)))
	var level_max := maxi(level_min, int(selected.get("levelMax", level_min)))
	selected["level"] = rng.randi_range(level_min, level_max)
	return selected


static func _normalized_wild_pet_entry(value: Dictionary) -> Dictionary:
	var form_id := str(value.get("formId", value.get("templateId", ""))).strip_edges()
	if form_id == "":
		return {}
	var level_min := maxi(1, int(value.get("levelMin", value.get("level", 1))))
	var level_max := maxi(level_min, int(value.get("levelMax", value.get("level", level_min))))
	var entry := {
		"formId": form_id,
		"name": str(value.get("name", "")),
		"weight": maxf(0.0, float(value.get("weight", 1.0))),
		"levelMin": level_min,
		"levelMax": level_max,
	}
	if value.has("level"):
		entry["level"] = clampi(int(value.get("level", level_min)), level_min, level_max)
	var stats = value.get("battleStats", {})
	if stats is Dictionary:
		entry["battleStats"] = (stats as Dictionary).duplicate(true)
	for key in ["catchable", "captureDifficulty"]:
		if value.has(key):
			entry[key] = value.get(key)
	for key in ["activeSkillIds", "petSkillSlots", "passiveSkillIds"]:
		if value.has(key):
			entry[key] = _string_array(value.get(key))
	return entry


static func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for item in value:
			var text := str(item).strip_edges()
			if text != "" and not result.has(text):
				result.append(text)
	return result
