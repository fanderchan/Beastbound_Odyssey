extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const MapVisualCatalog := preload("res://scripts/world/map_visual_catalog.gd")


func _initialize() -> void:
	var errors: Array[String] = []
	var manifest := _sample_manifest()
	var expected_summaries := {
		"manifestSha256": "626a87f07417483466977becd006bdb36f6adc4b08e29311aee764b2632893d6",
		"evidenceSha256": "e0d2a754a608a4ac1a95666043fdb49765882d59b443254e082c84d7fabe6d15",
		"assetSha256": "81132492754d3d5db09edcae47fc0eac47ceeb7895bde11c19d7f34504e0520a",
		"bundleSha256": "fcd65d9bce0d79e3561b9b6628fa813d0a4bdc0ecdb96534132afbc37dea80b1",
	}
	var actual_summaries := MapVisualCatalog._release_summary_hashes(manifest)
	if actual_summaries != expected_summaries:
		errors.append(
			"Godot/Python release summary canonicalization drifted: expected=%s actual=%s"
			% [JSON.stringify(expected_summaries), JSON.stringify(actual_summaries)]
		)

	var attestation := _attestation(manifest, expected_summaries)
	var attestation_errors: Array[String] = []
	MapVisualCatalog._validate_release_attestation_payload(
		manifest,
		attestation,
		attestation_errors
	)
	if not attestation_errors.is_empty():
		errors.append_array(attestation_errors)
	var float_schema_attestation := attestation.duplicate(true)
	float_schema_attestation["schemaVersion"] = 1.0
	var float_schema_errors: Array[String] = []
	MapVisualCatalog._validate_release_attestation_payload(
		manifest,
		float_schema_attestation,
		float_schema_errors
	)
	if not float_schema_errors.is_empty():
		errors.append("parsed JSON float schemaVersion 1 was rejected")

	var drifted_attestation := attestation.duplicate(true)
	(drifted_attestation["summaries"] as Dictionary)["assetSha256"] = "f".repeat(64)
	var drift_errors: Array[String] = []
	MapVisualCatalog._validate_release_attestation_payload(
		manifest,
		drifted_attestation,
		drift_errors
	)
	if drift_errors.is_empty():
		errors.append("release attestation asset summary drift did not fail closed")

	var type_confusion_ok := _validate_type_confusion(attestation, manifest, errors)
	var cache_identity_ok := _validate_release_cache_identity(errors)
	var same_path_replacement_ok := _validate_same_path_attestation_replacement(errors)
	_validate_edge_skirt(errors)
	var edge_skirt_ok := true
	for error in errors:
		if error.begins_with("edge skirt"):
			edge_skirt_ok = false
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.map_visual_release_contract_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"checks": {
			"pythonGodotSummaryParity": actual_summaries == expected_summaries,
			"validAttestationAccepted": attestation_errors.is_empty(),
			"parsedFloatSchemaAccepted": float_schema_errors.is_empty(),
			"summaryDriftRejected": not drift_errors.is_empty(),
			"typeConfusionRejected": type_confusion_ok,
			"manifestIdentityCacheBound": cache_identity_ok,
			"samePathAttestationReplacementRejected": same_path_replacement_ok,
			"edgeSkirtVisualOnly": edge_skirt_ok,
		},
		"errors": errors,
	}
	print("map visual release contract check: %s" % JSON.stringify(report))
	quit(0 if errors.is_empty() else 1)


static func _sample_manifest() -> Dictionary:
	return {
		"schemaVersion": 1,
		"bundleId": "solo_map_visual_v1",
		"mapStyleId": "solo_style_v1",
		"mapIds": ["solo_map"],
		"status": "owner_review_pending",
		"ownerReviewStatus": "pending",
		"releaseApproved": false,
		"runtimeEnabled": false,
		"tileSize": [80, 40],
		"catalogContractCheck": {
			"path": "evidence/catalog.json",
			"sha256": "1".repeat(64),
		},
		"source": {
			"origin": "AI-generated original",
			"owner": "Beastbound Odyssey project",
			"licenseBasis": "project-owned generated output",
		},
		"groundAtlas": {
			"path": "runtime/ground/atlas.png",
			"sha256": "2".repeat(64),
			"dimensions": [80, 40],
			"alphaMode": "mixed",
		},
		"tiles": [
			{"tileId": "grass", "rect": [0, 0, 80, 40], "role": "ground"},
		],
		"objects": [],
		"mapBindings": [
			{
				"mapId": "solo_map",
				"binding": {
					"path": "bindings/solo_map.json",
					"sha256": "3".repeat(64),
				},
			},
		],
		"evidence": {
			"dressedReference": {
				"path": "evidence/dressed.png",
				"sha256": "4".repeat(64),
			},
			"runtimeScreenshots": [],
			"ownerAcceptance": null,
		},
	}


static func _attestation(manifest: Dictionary, summaries: Dictionary) -> Dictionary:
	return {
		"schemaVersion": 1,
		"attestationType": MapVisualCatalog.RELEASE_ATTESTATION_TYPE,
		"status": MapVisualCatalog.RELEASE_ATTESTATION_STATUS,
		"bundleId": manifest.get("bundleId"),
		"mapStyleId": manifest.get("mapStyleId"),
		"mapIds": manifest.get("mapIds"),
		"manifest": {
			"path": "map-visual-bundle.json",
			"summarySha256": summaries.get("manifestSha256"),
		},
		"lifecycle": {
			"status": "released",
			"ownerReviewStatus": "approved",
			"releaseApproved": true,
			"runtimeEnabled": true,
		},
		"offlineAudit": {
			"status": "PASS",
			"releaseReady": true,
			"missingReleaseGates": [],
		},
		"summaries": {
			"evidenceSha256": summaries.get("evidenceSha256"),
			"assetSha256": summaries.get("assetSha256"),
			"bundleSha256": summaries.get("bundleSha256"),
		},
	}


static func _validate_type_confusion(
	attestation: Dictionary,
	manifest: Dictionary,
	errors: Array[String]
) -> bool:
	var candidates: Array[Dictionary] = []
	var schema_bool := attestation.duplicate(true)
	schema_bool["schemaVersion"] = true
	candidates.append(schema_bool)
	var release_approved_int := attestation.duplicate(true)
	(release_approved_int["lifecycle"] as Dictionary)["releaseApproved"] = 1
	candidates.append(release_approved_int)
	var runtime_enabled_int := attestation.duplicate(true)
	(runtime_enabled_int["lifecycle"] as Dictionary)["runtimeEnabled"] = 1
	candidates.append(runtime_enabled_int)
	var release_ready_int := attestation.duplicate(true)
	(release_ready_int["offlineAudit"] as Dictionary)["releaseReady"] = 1
	candidates.append(release_ready_int)
	var valid := true
	for index in range(candidates.size()):
		var candidate_errors: Array[String] = []
		MapVisualCatalog._validate_release_attestation_payload(
			manifest,
			candidates[index],
			candidate_errors
		)
		if candidate_errors.is_empty():
			errors.append("type confusion candidate %d did not fail closed" % index)
			valid = false
	return valid


static func _validate_release_cache_identity(errors: Array[String]) -> bool:
	var manifest_a := _cache_manifest()
	var bundle_root := "res://scripts/qa/fixtures/map_visual_release_cache"
	MapVisualCatalog._release_attestation_cache.clear()
	var before_count := int(
		MapVisualCatalog.debug_io_counts().get("releaseAttestationValidations", -1)
	)
	var first_errors: Array[String] = []
	var first_valid := MapVisualCatalog._validate_runtime_release_attestation(
		manifest_a,
		bundle_root,
		first_errors
	)
	var after_first := int(
		MapVisualCatalog.debug_io_counts().get("releaseAttestationValidations", -1)
	)
	var repeated_errors: Array[String] = []
	var repeated_valid := MapVisualCatalog._validate_runtime_release_attestation(
		manifest_a.duplicate(true),
		bundle_root,
		repeated_errors
	)
	var after_repeat := int(
		MapVisualCatalog.debug_io_counts().get("releaseAttestationValidations", -1)
	)
	var manifest_b := manifest_a.duplicate(true)
	manifest_b["mapStyleId"] = "cache_style_v2"
	var different_errors: Array[String] = []
	var different_valid := MapVisualCatalog._validate_runtime_release_attestation(
		manifest_b,
		bundle_root,
		different_errors
	)
	var after_different := int(
		MapVisualCatalog.debug_io_counts().get("releaseAttestationValidations", -1)
	)
	var valid := (
		first_valid
		and first_errors.is_empty()
		and repeated_valid
		and repeated_errors.is_empty()
		and not different_valid
		and not different_errors.is_empty()
		and after_first == before_count + 1
		and after_repeat == after_first
		and after_different == after_repeat + 1
		and MapVisualCatalog._release_attestation_cache_key(manifest_a, bundle_root)
		!= MapVisualCatalog._release_attestation_cache_key(manifest_b, bundle_root)
	)
	if not valid:
		errors.append(
			"release attestation cache did not bind manifest identity: "
			+ "valid=%s/%s/%s counts=%d/%d/%d/%d first=%s repeat=%s different=%s"
			% [
				str(first_valid),
				str(repeated_valid),
				str(different_valid),
				before_count,
				after_first,
				after_repeat,
				after_different,
				"; ".join(first_errors),
				"; ".join(repeated_errors),
				"; ".join(different_errors),
			]
		)
	return valid


static func _cache_manifest() -> Dictionary:
	return {
		"schemaVersion": 1,
		"bundleId": "cache_fixture_visual_v1",
		"mapStyleId": "cache_style_v1",
		"mapIds": ["cache_map_a", "cache_map_b"],
		"status": "released",
		"ownerReviewStatus": "approved",
		"releaseApproved": true,
		"runtimeEnabled": true,
		"releaseAttestation": {
			"path": "release-attestation.json",
			"sha256": "bc53f048b8b6fb1b391c1a8ae688d3f9ab93ba56f9c58425026cd50ea5b356d3",
		},
		"tileSize": [80, 40],
		"catalogContractCheck": {
			"path": "evidence/catalog.json",
			"sha256": "1".repeat(64),
		},
		"source": {
			"origin": "fixture",
			"owner": "fixture",
			"licenseBasis": "fixture",
		},
		"groundAtlas": {
			"path": "runtime/ground/atlas.bin",
			"sha256": "93dfa7d871a2f38cfc08475beeb8e12bfebc77ca70abfd370eab0dc68295b21a",
		},
		"tiles": [
			{"tileId": "grass", "rect": [0, 0, 80, 40], "role": "ground"},
		],
		"objects": [],
		"mapBindings": [],
		"evidence": {
			"runtimeScreenshots": [],
			"ownerAcceptance": null,
		},
	}


static func _validate_same_path_attestation_replacement(errors: Array[String]) -> bool:
	var bundle_root := "res://.godot/qa/map_visual_release_attestation_replacement"
	var attestation_path := bundle_root.path_join("release-attestation.json")
	var atlas_path := bundle_root.path_join("runtime/ground/atlas.bin")
	_cleanup_replacement_fixture(bundle_root)
	var directory_error := DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path(atlas_path.get_base_dir())
	)
	if directory_error != OK:
		errors.append(
			"same-path attestation fixture directory failed: %s"
			% error_string(directory_error)
		)
		return false
	if not _write_fixture_bytes(
		atlas_path,
		"map-release-cache-replacement-fixture\n".to_utf8_buffer()
	):
		errors.append("same-path attestation fixture atlas write failed")
		_cleanup_replacement_fixture(bundle_root)
		return false

	var manifest := _cache_manifest()
	(manifest["groundAtlas"] as Dictionary)["sha256"] = FileAccess.get_sha256(atlas_path)
	var valid_attestation := _attestation(
		manifest,
		MapVisualCatalog._release_summary_hashes(manifest)
	)
	if not _write_fixture_text(
		attestation_path,
		JSON.stringify(valid_attestation, "\t") + "\n"
	):
		errors.append("same-path valid attestation write failed")
		_cleanup_replacement_fixture(bundle_root)
		return false
	(manifest["releaseAttestation"] as Dictionary)["sha256"] = FileAccess.get_sha256(
		attestation_path
	)

	MapVisualCatalog._release_attestation_cache.clear()
	MapVisualCatalog._release_attestation_json_cache.clear()
	var first_errors: Array[String] = []
	var first_valid := MapVisualCatalog._validate_runtime_release_attestation(
		manifest,
		bundle_root,
		first_errors
	)

	var tampered_attestation := valid_attestation.duplicate(true)
	tampered_attestation["status"] = "tampered"
	if not _write_fixture_text(
		attestation_path,
		JSON.stringify(tampered_attestation, "\t") + "\n"
	):
		errors.append("same-path tampered attestation write failed")
		_cleanup_replacement_fixture(bundle_root)
		return false
	var stale_reference_errors: Array[String] = []
	var stale_reference_valid := MapVisualCatalog._validate_runtime_release_attestation(
		manifest,
		bundle_root,
		stale_reference_errors
	)

	var tampered_manifest := manifest.duplicate(true)
	(tampered_manifest["releaseAttestation"] as Dictionary)["sha256"] = FileAccess.get_sha256(
		attestation_path
	)
	var updated_reference_errors: Array[String] = []
	var updated_reference_valid := MapVisualCatalog._validate_runtime_release_attestation(
		tampered_manifest,
		bundle_root,
		updated_reference_errors
	)
	var valid := (
		first_valid
		and first_errors.is_empty()
		and not stale_reference_valid
		and not stale_reference_errors.is_empty()
		and not updated_reference_valid
		and not updated_reference_errors.is_empty()
	)
	if not valid:
		errors.append(
			"same-path attestation replacement reused stale validation/payload: "
			+ "valid=%s/%s/%s first=%s stale_ref=%s updated_ref=%s"
			% [
				str(first_valid),
				str(stale_reference_valid),
				str(updated_reference_valid),
				"; ".join(first_errors),
				"; ".join(stale_reference_errors),
				"; ".join(updated_reference_errors),
			]
		)
	MapVisualCatalog._release_attestation_cache.clear()
	MapVisualCatalog._release_attestation_json_cache.clear()
	_cleanup_replacement_fixture(bundle_root)
	return valid


static func _write_fixture_text(path: String, text: String) -> bool:
	return _write_fixture_bytes(path, text.to_utf8_buffer())


static func _write_fixture_bytes(path: String, bytes: PackedByteArray) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_buffer(bytes)
	file.flush()
	return file.get_error() == OK


static func _cleanup_replacement_fixture(bundle_root: String) -> void:
	var root_absolute := ProjectSettings.globalize_path(bundle_root)
	var files: Array[String] = [
		root_absolute.path_join("release-attestation.json"),
		root_absolute.path_join("runtime/ground/atlas.bin"),
	]
	for file_path in files:
		if FileAccess.file_exists(file_path):
			DirAccess.remove_absolute(file_path)
	var directories: Array[String] = [
		root_absolute.path_join("runtime/ground"),
		root_absolute.path_join("runtime"),
		root_absolute,
	]
	for directory_path in directories:
		if DirAccess.dir_exists_absolute(directory_path):
			DirAccess.remove_absolute(directory_path)


static func _validate_edge_skirt(errors: Array[String]) -> void:
	var map_data := IsoMapModel.load_map(MapDataCatalog.path_for("firebud_village_gate"))
	if map_data.is_empty():
		errors.append("edge skirt fixture map failed to load")
		return
	var grid_size := IsoMapModel.grid_size(map_data)
	var build_errors: Array[String] = []
	var draws := MapVisualCatalog._build_edge_ground_draws(
		map_data,
		{"defaultTileId": "grass", "edgePaddingCells": 2},
		{"grass": Rect2(0, 0, 80, 40)},
		build_errors
	)
	var expected_count := (grid_size.x + 4) * (grid_size.y + 4) - grid_size.x * grid_size.y
	if not build_errors.is_empty():
		errors.append("edge skirt valid contract failed: %s" % "; ".join(build_errors))
	if draws.size() != expected_count:
		errors.append("edge skirt count mismatch: expected=%d actual=%d" % [expected_count, draws.size()])
	var seen: Dictionary = {}
	for command in draws:
		var cell := command.get("cell", Vector2i.ZERO) as Vector2i
		var key := IsoMapModel.cell_key(cell)
		if IsoMapModel.is_inside(map_data, cell):
			errors.append("edge skirt entered authoritative grid: %s" % key)
		if seen.has(key):
			errors.append("edge skirt duplicated cell: %s" % key)
		seen[key] = true
		if str(command.get("tileId", "")) != "grass":
			errors.append("edge skirt did not use default tile: %s" % key)
	var invalid_errors: Array[String] = []
	var invalid_draws := MapVisualCatalog._build_edge_ground_draws(
		map_data,
		{"defaultTileId": "grass", "edgePaddingCells": 33},
		{"grass": Rect2(0, 0, 80, 40)},
		invalid_errors
	)
	if not invalid_draws.is_empty() or invalid_errors.is_empty():
		errors.append("edge skirt accepted padding outside 0..32")
