extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const BattleArenaVisualCatalog := preload("res://scripts/battle/battle_arena_visual_catalog.gd")
# Compile the standalone entrypoint in the normal isolated targeted check too.
const ReviewEntry := preload("res://scripts/qa/guardian_battle_review.gd")


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	errors.append_array(preload("res://scripts/qa/cave_journey_wait_budget_check.gd").validation_errors())
	errors.append_array(preload("res://scripts/pet/pet_candidate_sprite_scale_check.gd").validation_errors())
	errors.append_array(BattleArenaVisualCatalog.validation_errors())
	var guardian_state := {"sourceEncounterGroupId": "earth_vein_guardian_group"}
	if BattleArenaVisualCatalog.enable_earth_guardian_review_from_cli():
		errors.append("ordinary auto-check must not enable the interactive arena preview")
	if BattleArenaVisualCatalog.enable_earth_cave_review_from_cli():
		errors.append("ordinary auto-check must not enable cave journey review")
	for map_id in BattleArenaVisualCatalog.EARTH_CAVE_REVIEW_MAPS:
		var cave_state := {"serverRoom": {"mode": "party_pve", "entry": {"mapId": map_id}}}
		if not BattleArenaVisualCatalog._is_earth_cave_encounter(cave_state):
			errors.append("cave journey omitted authoritative floor: %s" % map_id)
		if not BattleArenaVisualCatalog.evidence_for_state(cave_state).is_empty():
			errors.append("cave journey art escaped its explicit preview flag")
	for invalid in [
		{}, {"serverRoom": null}, {"serverRoom": []},
		{"sourceMapId": "earth_vein_cave_f3"},
		{"serverRoom": {"mode": "party_pve", "entry": null}},
		{"serverRoom": {"mode": "duel", "entry": {"mapId": "earth_vein_cave_f3"}}},
		{"serverRoom": {"mode": "party_pve", "entry": {"mapId": "tide_echo_cave_f3"}}},
		{"serverRoom": {"mode": "party_pve", "entry": {"mapId": "earth_vein_cave_f5"}}},
	]:
		if BattleArenaVisualCatalog._is_earth_cave_encounter(invalid):
			errors.append("cave journey accepted an unrelated or malformed location")
	for state in [guardian_state, {"reviewLab": true, "reviewArenaId": "earth_vein_sanctum"}, {"battleArenaOwnerReviewId": "earth_vein_sanctum"}]:
		if BattleArenaVisualCatalog.texture_for_state(state, true) != null:
			errors.append("guardian arena escaped its dedicated isolated preview")
	for sample in [
		{"mode": "party_pve", "map": "earth_vein_cave_f4", "expected": true},
		{"mode": "duel", "map": "earth_vein_cave_f4", "expected": false},
		{"mode": "party_pve", "map": "tide_echo_cave_f4", "expected": false},
	]:
		var state := {"serverRoom": {"mode": sample.mode, "entry": {"mapId": sample.map}}}
		if BattleArenaVisualCatalog._is_earth_guardian_encounter(state) != bool(sample.expected):
			errors.append("guardian arena did not respect authoritative room map and mode")
	var rng := RandomNumberGenerator.new()
	rng.seed = 547
	var checked := 0
	for map_id in ["earth_vein_cave_f4", "tide_echo_cave_f4"]:
		var map_data := JSON.parse_string(FileAccess.get_file_as_string(MapDataCatalog.path_for(map_id))) as Dictionary
		if map_id == "earth_vein_cave_f4":
			_check_earth_landmark_identity(map_data, errors)
		for zone_value in map_data.get("encounterZones", []):
			var zone := zone_value as Dictionary
			var fixed: Array = zone.get("fixedWildPets", [])
			if fixed.size() != 10 or not (fixed[2] as Dictionary).has("battleAppearanceFormId"):
				continue
			var original := zone.duplicate(true)
			var selected := EncounterModel.zone_with_selected_wild_pet(zone, rng, 10)
			var boss_entry := (selected.get("selectedWildPets", []) as Array)[2] as Dictionary
			var state := BattleModel.create_training_partner_battle(selected, 10)
			var boss := BattleModel.actor_by_id(state, "enemy_front_3")
			var appearance := str((fixed[2] as Dictionary).get("battleAppearanceFormId", ""))
			if str(boss_entry.get("battleAppearanceFormId", "")) != appearance:
				errors.append("%s encounter normalization lost appearance" % map_id)
			if str(boss.get("formId", "")) != appearance:
				errors.append("%s local boss appearance differs from server projection" % map_id)
			if str(boss.get("serverFormId", "")) != str(boss_entry.get("formId", "")):
				errors.append("%s boss lost original species identity" % map_id)
			if str(boss.get("name", "")) != str(boss_entry.get("battleDisplayName", "")):
				errors.append("%s boss display name gained a slot-number suffix" % map_id)
			var plain := selected.duplicate(true)
			for entry in plain.get("selectedWildPets", []):
				(entry as Dictionary).erase("battleAppearanceFormId")
				(entry as Dictionary).erase("battleDisplayName")
			var plain_boss := BattleModel.actor_by_id(
				BattleModel.create_training_partner_battle(plain, 10), "enemy_front_3"
			)
			for key in plain_boss.keys():
				if key not in ["formId", "name"] and boss.get(key) != plain_boss.get(key):
					errors.append("%s appearance changed combat field %s" % [map_id, str(key)])
			if zone != original:
				errors.append("%s presentation mutated map data" % map_id)
			_check_single_and_invalid_entries(boss_entry, errors)
			checked += 1
	if checked != 2:
		errors.append("expected the two currently declared approved guardian appearances")
	print("guardian battle presentation check: %s" % JSON.stringify({
		"status": "passed" if errors.is_empty() else "failed", "guardians": checked, "errors": errors,
	}))
	return errors


static func _check_earth_landmark_identity(map_data: Dictionary, errors: Array[String]) -> void:
	var labels: Array[String] = []
	for interaction_id in ["earth_vein_guardian_npc", "earth_vein_evolution_lineage_npc"]:
		var item := InteractionModel.find_by_id(map_data, interaction_id)
		var label := InteractionModel.world_marker_label_for(item)
		if label.is_empty() or label != str(item.get("name", "")) or labels.has(label):
			errors.append("Earth Vein landmark must show its distinct dialog identity: %s" % interaction_id)
		labels.append(label)


static func _check_single_and_invalid_entries(entry: Dictionary, errors: Array[String]) -> void:
	var state := BattleModel.create_wild_battle({"selectedWildPet": entry})
	if str(BattleModel.actor_by_id(state, "enemy_0").get("formId", "")) != str(entry.get("battleAppearanceFormId", "")):
		errors.append("single-actor encounter lost declared appearance")
	for invalid_kind in ["catchable", "missing_catchable", "invalid_form"]:
		var invalid := entry.duplicate(true)
		match invalid_kind:
			"catchable": invalid["catchable"] = true
			"missing_catchable": invalid.erase("catchable")
			"invalid_form": invalid["battleAppearanceFormId"] = "missing_form"
		var actor := BattleModel.actor_by_id(
			BattleModel.create_wild_battle({"selectedWildPet": invalid}), "enemy_0"
		)
		if str(actor.get("formId", "")) != str(entry.get("formId", "")) or actor.has("serverFormId"):
			errors.append("invalid override did not preserve original species: %s" % invalid_kind)
