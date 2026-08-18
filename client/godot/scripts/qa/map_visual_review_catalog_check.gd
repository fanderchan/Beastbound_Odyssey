extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const MapVisualCatalog := preload("res://scripts/world/map_visual_catalog.gd")


func _initialize() -> void:
	var errors: Array[String] = []
	_validate_review_catalog_file(errors)
	_validate_catalog_selection(errors)
	_validate_review_lifecycle(errors)
	_validate_edge_tile_contract(errors)
	_validate_deterministic_tile_variants(errors)
	_validate_path_transition_contract(errors)
	_validate_plaza_transition_contract(errors)
	_validate_edge_scenery_anchor_contract(errors)
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.map_visual_review_catalog_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"checks": {
			"normalCatalogUnaffected": not errors.any(
				func(error: String) -> bool: return error.begins_with("catalog selection")
			),
			"pendingReviewOnly": not errors.any(
				func(error: String) -> bool: return error.begins_with("review lifecycle")
			),
			"edgeTileIndependent": not errors.any(
				func(error: String) -> bool: return error.begins_with("edge tile")
			),
			"tileVariantsDeterministic": not errors.any(
				func(error: String) -> bool: return error.begins_with("tile variants")
			),
			"pathTransitionsComplete": not errors.any(
				func(error: String) -> bool: return error.begins_with("path transitions")
			),
			"plazaTransitionsComplete": not errors.any(
				func(error: String) -> bool: return error.begins_with("plaza transitions")
			),
			"edgeSceneryAnchorsBounded": not errors.any(
				func(error: String) -> bool: return error.begins_with("edge scenery")
			),
		},
		"errors": errors,
	}
	print("map visual review catalog check: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


static func _validate_edge_scenery_anchor_contract(errors: Array[String]) -> void:
	var grid_size := Vector2i(10, 8)
	var valid_cases := [
		[Vector2i(3, 4), "blocking", 0],
		[Vector2i(-2, 0), "none", 2],
		[Vector2i(0, -2), "decorative", 2],
		[Vector2i(11, 9), "decorative", 2],
	]
	for fixture in valid_cases:
		if not MapVisualCatalog._object_anchor_within_contract(
			fixture[0] as Vector2i,
			grid_size,
			str(fixture[1]),
			fixture[2]
		):
			errors.append("edge scenery valid anchor was rejected: %s" % str(fixture))

	var invalid_cases := [
		[Vector2i(-3, 0), "decorative", 2],
		[Vector2i(12, 7), "none", 2],
		[Vector2i(-1, 0), "decorative", 0],
		[Vector2i(-1, 0), "blocking", 2],
		[Vector2i(10, 0), "interaction", 2],
	]
	for fixture in invalid_cases:
		if MapVisualCatalog._object_anchor_within_contract(
			fixture[0] as Vector2i,
			grid_size,
			str(fixture[1]),
			fixture[2]
		):
			errors.append("edge scenery invalid anchor was accepted: %s" % str(fixture))


static func _validate_review_catalog_file(errors: Array[String]) -> void:
	if not FileAccess.file_exists(MapVisualCatalog.REVIEW_DATA_PATH):
		errors.append("catalog selection review catalog file missing")
		return
	var parsed: Variant = JSON.parse_string(
		FileAccess.get_file_as_string(MapVisualCatalog.REVIEW_DATA_PATH)
	)
	if not (parsed is Dictionary):
		errors.append("catalog selection review catalog is not a JSON object")
		return
	var catalog := parsed as Dictionary
	if int(catalog.get("schemaVersion", 0)) != 1 or not (catalog.get("entries") is Array):
		errors.append("catalog selection review catalog schema is invalid")
	if not MapVisualCatalog.review_catalog_errors().is_empty():
		errors.append(
			"catalog selection review catalog runtime errors: %s"
			% "; ".join(MapVisualCatalog.review_catalog_errors())
		)


static func _validate_catalog_selection(errors: Array[String]) -> void:
	var normal_entry := {
		"mapId": "firebud_training_yard",
		"bundleManifest": "res://normal/map-visual-bundle.json",
		"bindingPath": "res://normal/bindings/firebud_training_yard.json",
	}
	var review_entry := {
		"mapId": "firebud_training_yard",
		"bundleManifest": "res://review/map-visual-bundle.json",
		"bindingPath": "res://review/bindings/firebud_training_yard.json",
	}
	var normal_entries := {"firebud_training_yard": normal_entry}
	var review_entries := {"firebud_training_yard": review_entry}

	var normal_errors: Array[String] = []
	var normal := MapVisualCatalog._select_catalog_entry(
		"firebud_training_yard",
		false,
		normal_entries,
		review_entries,
		[],
		normal_errors
	)
	if (
		not normal_errors.is_empty()
		or str(normal.get("source", "")) != "normal"
		or normal.get("entry", {}) != normal_entry
	):
		errors.append("catalog selection normal prepare did not stay on released catalog")

	var preview_errors: Array[String] = []
	var preview := MapVisualCatalog._select_catalog_entry(
		"firebud_training_yard",
		true,
		normal_entries,
		review_entries,
		[],
		preview_errors
	)
	if (
		not preview_errors.is_empty()
		or str(preview.get("source", "")) != "review"
		or preview.get("entry", {}) != review_entry
	):
		errors.append("catalog selection QA preview did not prefer review candidate")

	var fallback_errors: Array[String] = []
	var fallback := MapVisualCatalog._select_catalog_entry(
		"firebud_training_yard",
		true,
		normal_entries,
		{},
		[],
		fallback_errors
	)
	if not fallback_errors.is_empty() or str(fallback.get("source", "")) != "normal":
		errors.append("catalog selection QA preview did not fall back to normal catalog")
	var mirrored_errors: Array[String] = []
	var mirrored := MapVisualCatalog._select_catalog_entry(
		"firebud_training_yard",
		true,
		normal_entries,
		normal_entries.duplicate(true),
		[],
		mirrored_errors
	)
	if (
		not mirrored_errors.is_empty()
		or str(mirrored.get("source", "")) != "normal"
		or mirrored.get("entry", {}) != normal_entry
	):
		errors.append("catalog selection mirrored review entry did not stay normal")
	var review_only_errors: Array[String] = []
	var review_only := MapVisualCatalog._select_catalog_entry(
		"firebud_training_yard",
		true,
		{},
		review_entries,
		[],
		review_only_errors
	)
	if not review_only_errors.is_empty() or str(review_only.get("source", "")) != "review":
		errors.append("catalog selection QA-only registered candidate was rejected")

	var malformed_errors: Array[String] = []
	var malformed := MapVisualCatalog._select_catalog_entry(
		"firebud_training_yard",
		true,
		normal_entries,
		review_entries,
		["malformed review catalog"],
		malformed_errors
	)
	if not malformed.is_empty() or malformed_errors.is_empty():
		errors.append("catalog selection malformed review catalog did not fail closed")


static func _validate_review_lifecycle(errors: Array[String]) -> void:
	if not OS.is_debug_build():
		return
	var pending := {
		"status": "owner_review_pending",
		"ownerReviewStatus": "pending",
		"releaseApproved": false,
		"runtimeEnabled": false,
	}
	var pending_errors: Array[String] = []
	if not MapVisualCatalog._review_candidate_access_allowed(pending, true, pending_errors):
		errors.append("review lifecycle valid pending candidate was rejected")
	var released := pending.duplicate(true)
	released["status"] = "released"
	released["ownerReviewStatus"] = "approved"
	released["releaseApproved"] = true
	released["runtimeEnabled"] = true
	var released_errors: Array[String] = []
	if (
		MapVisualCatalog._review_candidate_access_allowed(released, true, released_errors)
		or released_errors.is_empty()
	):
		errors.append("review lifecycle released candidate bypassed pending-only gate")
	var normal_flag_errors: Array[String] = []
	if MapVisualCatalog._review_candidate_access_allowed(pending, false, normal_flag_errors):
		errors.append("review lifecycle candidate bypassed explicit QA preview flag")


static func _validate_edge_tile_contract(errors: Array[String]) -> void:
	var map_data := IsoMapModel.load_map(
		MapDataCatalog.path_for("firebud_village_gate")
	)
	if map_data.is_empty():
		errors.append("edge tile fixture map failed to load")
		return
	var tile_rects := {
		"grass": Rect2(0, 0, 80, 40),
		"edge": Rect2(80, 0, 80, 40),
		"edge_alt": Rect2(160, 0, 80, 40),
	}
	var ground := _required_ground("grass")
	ground["edgePaddingCells"] = 2
	ground["edgeTileId"] = "edge"
	ground["variantSeed"] = 97
	ground["variantClusterSize"] = 3
	ground["tileVariants"] = {"edge": ["edge", "edge_alt"]}
	var build_errors: Array[String] = []
	MapVisualCatalog._validate_ground_tile_ids(ground, tile_rects, build_errors)
	var variants := MapVisualCatalog._compile_ground_tile_variants(
		"firebud_village_gate",
		ground,
		tile_rects,
		build_errors
	)
	var draws := MapVisualCatalog._build_edge_ground_draws(
		map_data,
		ground,
		tile_rects,
		build_errors,
		variants
	)
	if not build_errors.is_empty():
		errors.append("edge tile valid contract failed: %s" % "; ".join(build_errors))
	var seen_tiles: Dictionary = {}
	for command in draws:
		if str(command.get("semanticTileId", "")) != "edge":
			errors.append("edge tile command lost independent edge semantic")
			break
		seen_tiles[str(command.get("tileId", ""))] = true
	if not seen_tiles.has("edge") or not seen_tiles.has("edge_alt") or seen_tiles.has("grass"):
		errors.append("edge tile skirt did not use deterministic edge variants")
	var negative_cluster_tile := MapVisualCatalog._select_tile_variant(
		"firebud_village_gate", Vector2i(-3, -3), "edge", variants
	)
	for clustered_cell in [Vector2i(-2, -3), Vector2i(-1, -1)]:
		if (
			MapVisualCatalog._select_tile_variant(
				"firebud_village_gate", clustered_cell, "edge", variants
			) != negative_cluster_tile
		):
			errors.append("edge tile negative cells did not share deterministic cluster")
			break

	var fallback_ground := _required_ground("grass")
	fallback_ground["edgePaddingCells"] = 1
	var fallback_errors: Array[String] = []
	var fallback_draws := MapVisualCatalog._build_edge_ground_draws(
		map_data,
		fallback_ground,
		tile_rects,
		fallback_errors
	)
	if not fallback_errors.is_empty():
		errors.append("edge tile backward-compatible fallback failed")
	for command in fallback_draws:
		if str(command.get("tileId", "")) != "grass":
			errors.append("edge tile legacy binding no longer falls back to defaultTileId")
			break

	var invalid_ground := _required_ground("grass")
	invalid_ground["edgeTileId"] = "missing"
	var invalid_errors: Array[String] = []
	MapVisualCatalog._validate_ground_tile_ids(invalid_ground, tile_rects, invalid_errors)
	if invalid_errors.is_empty():
		errors.append("edge tile unknown edgeTileId did not fail strict validation")


static func _validate_deterministic_tile_variants(errors: Array[String]) -> void:
	var map_data := IsoMapModel.load_map(
		MapDataCatalog.path_for("firebud_village_gate")
	)
	var binding := _read_json(
		"res://assets/maps/firebud_region_visual_v1/bindings/firebud_village_gate.json"
	)
	if map_data.is_empty() or binding.is_empty():
		errors.append("tile variants fixture map/binding failed to load")
		return
	var ground := (binding.get("ground", {}) as Dictionary).duplicate(true)
	var tile_rects: Dictionary = {}
	for key in [
		"defaultTileId",
		"blockedTileId",
		"encounterTileId",
		"warpTileId",
		"pathTileId",
		"plazaTileId",
	]:
		tile_rects[str(ground.get(key, ""))] = Rect2(0, 0, 80, 40)
	var base_tile_id := str(ground.get("defaultTileId", ""))
	var alternate_tile_id := "%s_alt" % base_tile_id
	tile_rects[alternate_tile_id] = Rect2(80, 0, 80, 40)
	ground["variantSeed"] = 314159
	ground["variantClusterSize"] = 3
	ground["tileVariants"] = {
		base_tile_id: [base_tile_id, alternate_tile_id],
	}
	var compile_errors: Array[String] = []
	var config := MapVisualCatalog._compile_ground_tile_variants(
		"firebud_village_gate",
		ground,
		tile_rects,
		compile_errors
	)
	if not compile_errors.is_empty():
		errors.append("tile variants valid contract failed: %s" % "; ".join(compile_errors))
		return
	if int(config.get("clusterSize", 0)) != 3:
		errors.append("tile variants did not retain declared cluster size")
	var legacy_cluster_ground := ground.duplicate(true)
	legacy_cluster_ground.erase("variantClusterSize")
	var legacy_cluster_errors: Array[String] = []
	var legacy_cluster_config := MapVisualCatalog._compile_ground_tile_variants(
		"firebud_village_gate",
		legacy_cluster_ground,
		tile_rects,
		legacy_cluster_errors
	)
	if not legacy_cluster_errors.is_empty() or int(legacy_cluster_config.get("clusterSize", 0)) != 1:
		errors.append("tile variants legacy binding no longer defaults cluster size to 1")
	var selections: Dictionary = {}
	for y in range(8):
		for x in range(8):
			var cell := Vector2i(x, y)
			var first := MapVisualCatalog._select_tile_variant(
				"firebud_village_gate",
				cell,
				base_tile_id,
				config
			)
			var repeated := MapVisualCatalog._select_tile_variant(
				"firebud_village_gate",
				cell,
				base_tile_id,
				config
			)
			if first != repeated:
				errors.append("tile variants repeated selection drifted")
				return
			selections[first] = true
	if not selections.has(base_tile_id) or not selections.has(alternate_tile_id):
		errors.append("tile variants fixed seed did not distribute declared candidates")
	var first_cluster_tile := MapVisualCatalog._select_tile_variant(
		"firebud_village_gate", Vector2i(0, 0), base_tile_id, config
	)
	for clustered_cell in [Vector2i(1, 0), Vector2i(2, 2)]:
		if (
			MapVisualCatalog._select_tile_variant(
				"firebud_village_gate", clustered_cell, base_tile_id, config
			) != first_cluster_tile
		):
			errors.append("tile variants changed inside one declared visual cluster")
			break

	var baseline_errors: Array[String] = []
	var baseline := MapVisualCatalog._build_ground_state(
		map_data,
		ground,
		tile_rects,
		{"seed": 314159, "pools": {}},
		baseline_errors
	)
	var variant_errors: Array[String] = []
	var variant_state := MapVisualCatalog._build_ground_state(
		map_data,
		ground,
		tile_rects,
		config,
		variant_errors
	)
	if not baseline_errors.is_empty() or not variant_errors.is_empty():
		errors.append("tile variants ground-state fixture failed")
	elif (
		baseline.get("semanticTileIdsByCell") != variant_state.get("semanticTileIdsByCell")
		or baseline.get("pathLookup") != variant_state.get("pathLookup")
		or baseline.get("blockedLookup") != variant_state.get("blockedLookup")
		or baseline.get("warpLookup") != variant_state.get("warpLookup")
	):
		errors.append("tile variants changed semantic/path/collision authority")
	var grid_size := IsoMapModel.grid_size(map_data)
	var visual_count := 0
	for count_value in (variant_state.get("tileCounts", {}) as Dictionary).values():
		visual_count += int(count_value)
	if visual_count != grid_size.x * grid_size.y:
		errors.append("tile variants final visual tileCounts are incomplete")

	var invalid_ground := ground.duplicate(true)
	invalid_ground["tileVariants"] = {base_tile_id: [base_tile_id, "unknown_tile"]}
	var invalid_errors: Array[String] = []
	MapVisualCatalog._compile_ground_tile_variants(
		"firebud_village_gate",
		invalid_ground,
		tile_rects,
		invalid_errors
	)
	if invalid_errors.is_empty():
		errors.append("tile variants unknown tileId did not fail strict validation")

	var invalid_cluster_ground := ground.duplicate(true)
	invalid_cluster_ground["variantClusterSize"] = 9
	var invalid_cluster_errors: Array[String] = []
	MapVisualCatalog._compile_ground_tile_variants(
		"firebud_village_gate",
		invalid_cluster_ground,
		tile_rects,
		invalid_cluster_errors
	)
	if invalid_cluster_errors.is_empty():
		errors.append("tile variants invalid cluster size did not fail strict validation")


static func _validate_path_transition_contract(errors: Array[String]) -> void:
	var fixture := _surface_transition_fixture(errors, "path transitions")
	if fixture.is_empty():
		return
	var map_data := fixture.get("mapData", {}) as Dictionary
	var ground := fixture.get("ground", {}) as Dictionary
	var tile_rects := fixture.get("tileRects", {}) as Dictionary
	var baseline := fixture.get("baseline", {}) as Dictionary
	var fixture_errors: Array[String] = []
	var first := MapVisualCatalog._apply_path_transition_tiles(
		map_data,
		ground,
		baseline,
		tile_rects,
		fixture_errors
	)
	var repeated := MapVisualCatalog._apply_path_transition_tiles(
		map_data,
		ground,
		baseline,
		tile_rects,
		fixture_errors
	)
	if not fixture_errors.is_empty():
		errors.append("path transitions valid contract failed: %s" % "; ".join(fixture_errors))
		return
	if int(first.get("pathTransitionCount", 0)) <= 0:
		errors.append("path transitions did not select any exposed path edge")
	if (
		first.get("tileIdsByCell") != repeated.get("tileIdsByCell")
		or first.get("tileCounts") != repeated.get("tileCounts")
	):
		errors.append("path transitions repeated preparation drifted")
	_validate_transition_authority_unchanged(
		"path transitions",
		baseline,
		first,
		errors
	)
	_validate_transition_cells(
		"path transitions",
		map_data,
		"pathTileId",
		"pathTransitionTileIds",
		"pathTransitionCount",
		ground,
		first,
		errors
	)

	var invalid_ground := ground.duplicate(true)
	var invalid_mapping := (
		invalid_ground.get("pathTransitionTileIds", {}) as Dictionary
	).duplicate(true)
	invalid_mapping.erase("nw_ne_sw_se")
	invalid_ground["pathTransitionTileIds"] = invalid_mapping
	var invalid_errors: Array[String] = []
	MapVisualCatalog._validate_ground_tile_ids(invalid_ground, tile_rects, invalid_errors)
	if invalid_errors.is_empty():
		errors.append("path transitions incomplete direction map did not fail closed")

	var reused_ground := ground.duplicate(true)
	var reused_plaza := (
		reused_ground.get("plazaTransitionTileIds", {}) as Dictionary
	).duplicate(true)
	reused_plaza["nw"] = str(
		(reused_ground.get("pathTransitionTileIds", {}) as Dictionary).get("nw", "")
	)
	reused_ground["plazaTransitionTileIds"] = reused_plaza
	var reused_errors: Array[String] = []
	MapVisualCatalog._validate_ground_tile_ids(reused_ground, tile_rects, reused_errors)
	if reused_errors.is_empty():
		errors.append("path transitions cross-surface tile reuse did not fail closed")


static func _validate_plaza_transition_contract(errors: Array[String]) -> void:
	var fixture := _surface_transition_fixture(errors, "plaza transitions")
	if fixture.is_empty():
		return
	var map_data := fixture.get("mapData", {}) as Dictionary
	var ground := fixture.get("ground", {}) as Dictionary
	var tile_rects := fixture.get("tileRects", {}) as Dictionary
	var baseline := fixture.get("baseline", {}) as Dictionary
	var fixture_errors: Array[String] = []
	var first := MapVisualCatalog._apply_plaza_transition_tiles(
		map_data,
		ground,
		baseline,
		tile_rects,
		fixture_errors
	)
	var repeated := MapVisualCatalog._apply_plaza_transition_tiles(
		map_data,
		ground,
		baseline,
		tile_rects,
		fixture_errors
	)
	if not fixture_errors.is_empty():
		errors.append("plaza transitions valid contract failed: %s" % "; ".join(fixture_errors))
		return
	if int(first.get("plazaTransitionCount", 0)) <= 0:
		errors.append("plaza transitions did not select any exposed plaza edge")
	if (
		first.get("tileIdsByCell") != repeated.get("tileIdsByCell")
		or first.get("tileCounts") != repeated.get("tileCounts")
	):
		errors.append("plaza transitions repeated preparation drifted")
	_validate_transition_authority_unchanged(
		"plaza transitions",
		baseline,
		first,
		errors
	)
	_validate_transition_cells(
		"plaza transitions",
		map_data,
		"plazaTileId",
		"plazaTransitionTileIds",
		"plazaTransitionCount",
		ground,
		first,
		errors
	)

	var invalid_ground := ground.duplicate(true)
	invalid_ground.erase("plazaTileId")
	var invalid_errors: Array[String] = []
	MapVisualCatalog._validate_ground_tile_ids(invalid_ground, tile_rects, invalid_errors)
	if invalid_errors.is_empty():
		errors.append("plaza transitions missing semantic base did not fail closed")


static func _surface_transition_fixture(
	errors: Array[String],
	error_prefix: String
) -> Dictionary:
	var map_id := "firebud_village_gate"
	var map_data := IsoMapModel.load_map(MapDataCatalog.path_for(map_id))
	var binding := _read_json(
		"res://assets/maps/firebud_region_visual_v1/bindings/firebud_village_gate.json"
	)
	if map_data.is_empty() or binding.is_empty():
		errors.append("%s released v1 fixture failed to load" % error_prefix)
		return {}
	var ground := (binding.get("ground", {}) as Dictionary).duplicate(true)
	var path_transitions: Dictionary = {}
	var plaza_transitions: Dictionary = {}
	for signature in MapVisualCatalog.SURFACE_TRANSITION_KEYS:
		path_transitions[signature] = "path_edge_%s" % signature
		plaza_transitions[signature] = "plaza_edge_%s" % signature
	ground["pathTransitionTileIds"] = path_transitions
	ground["plazaTransitionTileIds"] = plaza_transitions
	var tile_rects: Dictionary = {}
	for key in [
		"defaultTileId",
		"blockedTileId",
		"encounterTileId",
		"warpTileId",
		"pathTileId",
		"plazaTileId",
		"edgeTileId",
	]:
		var tile_id := str(ground.get(key, ""))
		if tile_id != "":
			tile_rects[tile_id] = Rect2(0, 0, 80, 40)
	var tile_variants_value: Variant = ground.get("tileVariants", {})
	if tile_variants_value is Dictionary:
		for candidates_value in (tile_variants_value as Dictionary).values():
			if not (candidates_value is Array):
				continue
			for candidate_value in candidates_value as Array:
				tile_rects[str(candidate_value)] = Rect2(0, 0, 80, 40)
	for transition_field in ["pathTransitionTileIds", "plazaTransitionTileIds"]:
		for tile_id_value in (ground.get(transition_field, {}) as Dictionary).values():
			tile_rects[str(tile_id_value)] = Rect2(0, 0, 80, 40)
	var fixture_errors: Array[String] = []
	MapVisualCatalog._validate_ground_tile_ids(ground, tile_rects, fixture_errors)
	var config := MapVisualCatalog._compile_ground_tile_variants(
		map_id,
		ground,
		tile_rects,
		fixture_errors
	)
	var baseline := MapVisualCatalog._build_ground_state(
		map_data,
		ground,
		tile_rects,
		config,
		fixture_errors
	)
	if not fixture_errors.is_empty():
		errors.append("%s fixture failed: %s" % [error_prefix, "; ".join(fixture_errors)])
		return {}
	return {
		"mapData": map_data,
		"ground": ground,
		"tileRects": tile_rects,
		"baseline": baseline,
	}


static func _validate_transition_authority_unchanged(
	error_prefix: String,
	baseline: Dictionary,
	result: Dictionary,
	errors: Array[String]
) -> void:
	for key in [
		"semanticTileIdsByCell",
		"semanticTileCounts",
		"pathLookup",
		"plazaLookup",
		"encounterLookup",
		"warpLookup",
		"blockedLookup",
	]:
		if baseline.get(key) != result.get(key):
			errors.append("%s changed authoritative field %s" % [error_prefix, key])


static func _validate_transition_cells(
	error_prefix: String,
	map_data: Dictionary,
	semantic_field: String,
	transition_field: String,
	count_field: String,
	ground: Dictionary,
	result: Dictionary,
	errors: Array[String]
) -> void:
	var transition_mapping := ground.get(transition_field, {}) as Dictionary
	var semantic_tile_id := str(ground.get(semantic_field, ""))
	var connected_lookup: Dictionary = {}
	for lookup_field in ["pathLookup", "plazaLookup", "warpLookup"]:
		for connected_key in (result.get(lookup_field, {}) as Dictionary).keys():
			connected_lookup[connected_key] = true
	var transition_cells := 0
	var multi_edge_cells := 0
	var grid_size := IsoMapModel.grid_size(map_data)
	for y in range(grid_size.y):
		for x in range(grid_size.x):
			var cell := Vector2i(x, y)
			var key := IsoMapModel.cell_key(cell)
			if str((result.get("semanticTileIdsByCell", {}) as Dictionary).get(key, "")) != semantic_tile_id:
				continue
			var signature := MapVisualCatalog._surface_transition_signature(cell, connected_lookup)
			if signature == "":
				continue
			transition_cells += 1
			if signature.contains("_"):
				multi_edge_cells += 1
			var expected_tile_id := str(transition_mapping.get(signature, ""))
			var actual_tile_id := str(
				(result.get("tileIdsByCell", {}) as Dictionary).get(key, "")
			)
			if actual_tile_id != expected_tile_id:
				errors.append(
					"%s exposure signature mismatch: %s/%s/%s"
					% [error_prefix, key, signature, actual_tile_id]
				)
				return
	if transition_cells != int(result.get(count_field, -1)):
		errors.append("%s count does not match selected visual cells" % error_prefix)
	if multi_edge_cells <= 0:
		errors.append("%s fixture did not prove a multi-edge corner" % error_prefix)
	var total_visual_cells := 0
	for count_value in (result.get("tileCounts", {}) as Dictionary).values():
		total_visual_cells += int(count_value)
	if total_visual_cells != (result.get("tileIdsByCell", {}) as Dictionary).size():
		errors.append("%s tileCounts lost or duplicated cells" % error_prefix)


static func _required_ground(tile_id: String) -> Dictionary:
	return {
		"defaultTileId": tile_id,
		"blockedTileId": tile_id,
		"encounterTileId": tile_id,
		"warpTileId": tile_id,
		"pathTileId": tile_id,
		"plazaTileId": tile_id,
	}


static func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
