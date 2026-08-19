extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")
const MapVisualCatalog := preload("res://scripts/world/map_visual_catalog.gd")
const MapVisualRenderer := preload("res://scripts/world/map_visual_renderer.gd")

const EXPECTED_MAP_IDS: Array[String] = [
	"firebud_training_yard",
	"firebud_village_gate",
	"mistcap_marsh",
]
const TILE_SIZE := Vector2i(80, 40)
const COLLISION_ROLES: Array[String] = ["none", "decorative", "blocking", "interaction"]
const BINDING_PATHS := {
	"firebud_training_yard": "res://assets/maps/firebud_region_visual_v1/bindings/firebud_training_yard.json",
	"firebud_village_gate": "res://assets/maps/firebud_region_visual_v1/bindings/firebud_village_gate.json",
	"mistcap_marsh": "res://assets/maps/mistcap_marsh_visual_v1/bindings/mistcap_marsh.json",
}
const BUNDLE_MAP_IDS := {
	"firebud_region_visual_v1": ["firebud_training_yard", "firebud_village_gate"],
	"mistcap_marsh_visual_v1": ["mistcap_marsh"],
}
const GENERATE_CATALOG_CONTRACT_FLAG := "--generate-map-visual-catalog-contract"
const GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX := "--generate-map-visual-review-catalog-contract="
const OVERWRITE_CATALOG_CONTRACT_FLAG := "--overwrite-map-visual-catalog-contract"
const PREVIEW_CATALOG_CONTRACT_FLAG := "--preview-map-visual-catalog-contract"
const CATALOG_CONTRACT_REPORT_TYPE := "beastbound.map_visual_catalog_contract"
const CATALOG_CONTRACT_REPORT_PATH := "evidence/catalog-contract-check.json"
const AUTH_ARGUMENT_NAMES: Array[String] = [
	"--login",
	"--server-login",
	"--login-username",
	"--auth-username",
	"--auth-user",
	"--login-password",
	"--auth-password",
	"--auth-pass",
	"--server-url",
	"--auth-server-url",
]


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var usage_error := _catalog_contract_cli_error(args)
	if usage_error != "":
		var usage_report := {
			"schemaVersion": 1,
			"reportType": "beastbound.map_visual_runtime_check",
			"result": "FAIL",
			"errors": [usage_error],
		}
		print("map visual runtime check: %s" % JSON.stringify(usage_report))
		quit(2)
		return
	var generate_contract := args.has(GENERATE_CATALOG_CONTRACT_FLAG)
	var review_generation_bundle_id := _review_generation_bundle_id(args)
	var generate_review_contract := review_generation_bundle_id != ""
	var overwrite_contract := args.has(OVERWRITE_CATALOG_CONTRACT_FLAG)
	var preview_contract := args.has(PREVIEW_CATALOG_CONTRACT_FLAG)
	var report := run(
		not generate_contract and not generate_review_contract and not preview_contract,
		preview_contract or generate_review_contract
	)
	if preview_contract:
		report["mode"] = "catalog_contract_preview"
	elif generate_review_contract:
		report["mode"] = "review_catalog_contract_generation"
	if (
		(generate_contract or generate_review_contract)
		and str(report.get("result", "FAIL")) == "PASS"
	):
		var bundle_ids_override: Array = (
			[review_generation_bundle_id]
			if generate_review_contract
			else []
		)
		var generation := _write_catalog_contract_reports(
			report,
			overwrite_contract,
			bundle_ids_override
		)
		report["catalogContractGeneration"] = generation
		if str(generation.get("result", "FAIL")) != "PASS":
			report["result"] = "FAIL"
			var report_errors := report.get("errors", []) as Array
			report_errors.append_array(generation.get("errors", []) as Array)
			report["errors"] = report_errors
	print("map visual runtime check: %s" % JSON.stringify(report))
	quit(0 if str(report.get("result", "FAIL")) == "PASS" else 1)


static func run(
	validate_frozen_catalog_contract: bool = true,
	pending_catalog_preview: bool = false
) -> Dictionary:
	var errors: Array[String] = []
	var summaries: Array[Dictionary] = []
	var selected_preview_map_ids: Array[String] = []
	var staged_primary_errors_by_map: Dictionary = {}
	var review_candidate_summaries: Array[Dictionary] = []
	var binding_hashes: Dictionary = {}
	var map_data_hashes: Dictionary = {}
	var review_map_ids_by_bundle: Dictionary = {}
	var review_expected_map_ids_by_bundle: Dictionary = {}
	var review_manifest_paths_by_bundle: Dictionary = {}
	var review_binding_hashes_by_bundle: Dictionary = {}
	var review_map_data_hashes_by_bundle: Dictionary = {}
	var review_summaries_by_bundle: Dictionary = {}
	var review_paths_exact_by_bundle: Dictionary = {}
	var catalog_manifest_paths := _catalog_manifest_paths(errors)
	var catalog_initialized := MapVisualCatalog.initialize()
	if not catalog_initialized:
		errors.append_array(MapVisualCatalog.catalog_errors())
	var review_catalog_load_errors := MapVisualCatalog.review_catalog_errors()
	if not review_catalog_load_errors.is_empty():
		errors.append_array(review_catalog_load_errors)
	var catalog_ids := MapVisualCatalog.catalog_map_ids()
	var review_only_map_ids: Array[String] = []
	for review_map_id in MapVisualCatalog.review_catalog_map_ids():
		if not catalog_ids.has(review_map_id):
			review_only_map_ids.append(review_map_id)
	review_only_map_ids.sort()
	var catalog_coverage_exact := catalog_ids.size() == EXPECTED_MAP_IDS.size()
	var catalog_paths_exact := true
	for map_id in EXPECTED_MAP_IDS:
		if not catalog_ids.has(map_id):
			catalog_coverage_exact = false
			errors.append("地图视觉 catalog 缺少 canary：%s" % map_id)
		var expected_binding_path := str(BINDING_PATHS.get(map_id, ""))
		var catalog_binding_path := MapVisualCatalog.catalog_binding_path(map_id)
		if expected_binding_path == "" or catalog_binding_path != expected_binding_path:
			catalog_paths_exact = false
			errors.append(
				"地图视觉 catalog bindingPath 与 runtime check 不一致：%s expected=%s actual=%s"
				% [map_id, expected_binding_path, catalog_binding_path]
			)
	for map_id in catalog_ids:
		if not BINDING_PATHS.has(map_id):
			catalog_coverage_exact = false
			errors.append("runtime check BINDING_PATHS 缺少 catalog mapId：%s" % map_id)
	for map_id_value in BINDING_PATHS.keys():
		var map_id := str(map_id_value)
		if not EXPECTED_MAP_IDS.has(map_id) or not catalog_ids.has(map_id):
			catalog_coverage_exact = false
			errors.append("runtime check BINDING_PATHS 含未声明 canary/catalog mapId：%s" % map_id)

	for map_id in EXPECTED_MAP_IDS:
		var map_path := MapDataCatalog.path_for(map_id)
		var map_data := IsoMapModel.load_map(map_path)
		if map_data.is_empty():
			errors.append("权威地图加载失败：%s" % map_id)
			continue
		var binding_path := str(BINDING_PATHS.get(map_id, ""))
		var binding := _read_json(binding_path, errors, "地图视觉 binding %s" % map_id)
		var binding_manifest_path := binding_path.get_base_dir().get_base_dir().path_join("map-visual-bundle.json")
		var manifest_path := str(catalog_manifest_paths.get(map_id, ""))
		if manifest_path != binding_manifest_path:
			catalog_paths_exact = false
			errors.append(
				"地图视觉 catalog bundleManifest 与 binding 实际 manifest 不一致：%s expected=%s actual=%s"
				% [map_id, binding_manifest_path, manifest_path]
			)
		var manifest := _read_json(manifest_path, errors, "地图视觉 manifest %s" % map_id)
		var staged_review_manifest_path := MapVisualCatalog.review_catalog_manifest_path(map_id)
		var staged_review_binding_path := MapVisualCatalog.review_catalog_binding_path(map_id)
		var staged_review_candidate := (
			pending_catalog_preview
			and staged_review_manifest_path != ""
			and staged_review_binding_path != ""
			and (
				staged_review_manifest_path != manifest_path
				or staged_review_binding_path != binding_path
			)
		)
		var staged_primary_errors: Array[String] = []
		if staged_review_candidate:
			_validate_authority_contract(
				map_id,
				map_data,
				binding,
				manifest,
				staged_primary_errors
			)
		else:
			_validate_authority_contract(map_id, map_data, binding, manifest, errors)
		var expected_normal_access := _expected_normal_access(manifest, map_id, errors)
		var binding_hash := FileAccess.get_sha256(binding_path) if FileAccess.file_exists(binding_path) else ""
		var map_data_hash := FileAccess.get_sha256(map_path) if FileAccess.file_exists(map_path) else ""
		if binding_hash.length() != 64:
			errors.append("无法冻结地图视觉 binding SHA-256：%s" % map_id)
		if map_data_hash.length() != 64:
			errors.append("无法冻结权威地图数据 SHA-256：%s" % map_id)
		binding_hashes[map_id] = binding_hash
		map_data_hashes[map_id] = map_data_hash
		if validate_frozen_catalog_contract:
			_validate_frozen_catalog_contract(
				map_id,
				manifest_path,
				manifest,
				binding_hash,
				map_data_hash,
				errors
			)
		var before := map_data.duplicate(true)
		var normal := MapVisualCatalog.prepare_map(map_id, map_data, false)
		if expected_normal_access and normal.is_empty():
			if staged_review_candidate:
				staged_primary_errors.append("released 地图没有进入普通运行时：%s" % map_id)
			else:
				errors.append("released 地图没有进入普通运行时：%s" % map_id)
		elif not expected_normal_access and not normal.is_empty():
			errors.append("owner_review_pending 地图绕过 QA 开关：%s" % map_id)
		if map_data != before:
			errors.append("normal prepare 修改了权威 mapData：%s" % map_id)
		var primary_preview := MapVisualCatalog.prepare_primary_catalog_map(
			map_id,
			map_data,
			true
		)
		if primary_preview.is_empty():
			if staged_review_candidate:
				staged_primary_errors.append("主 catalog QA preview 地图准备失败：%s" % map_id)
				staged_primary_errors.append_array(MapVisualCatalog.errors_for_map(map_id))
			else:
				errors.append("主 catalog QA preview 地图准备失败：%s" % map_id)
				errors.append_array(MapVisualCatalog.errors_for_map(map_id))
				continue
		if map_data != before:
			errors.append("主 catalog QA prepare 修改了权威 mapData：%s" % map_id)
		if not primary_preview.is_empty():
			if staged_review_candidate:
				_validate_prepared_map(
					map_id,
					map_data,
					manifest,
					primary_preview,
					staged_primary_errors
				)
			else:
				_validate_prepared_map(map_id, map_data, manifest, primary_preview, errors)
			summaries.append({
				"mapId": map_id,
				"groundDraws": MapVisualRenderer.ground_draw_count(primary_preview),
				"objects": MapVisualRenderer.object_draw_count(primary_preview),
				"protectedCells": (primary_preview.get("protectedLookup", {}) as Dictionary).size(),
			})
		if staged_review_candidate:
			staged_primary_errors_by_map[map_id] = staged_primary_errors.duplicate()

		var selected_preview := MapVisualCatalog.prepare_map(map_id, map_data, true)
		if selected_preview.is_empty():
			errors.append("QA review/fallback 地图准备失败：%s" % map_id)
			errors.append_array(MapVisualCatalog.errors_for_map(map_id))
			continue
		selected_preview_map_ids.append(map_id)
		if map_data != before:
			errors.append("QA review/fallback prepare 修改了权威 mapData：%s" % map_id)
		if bool(selected_preview.get("reviewCandidate", false)):
			var review_manifest_path := str(selected_preview.get("manifestPath", ""))
			var review_binding_path := str(selected_preview.get("bindingPath", ""))
			if (
				review_manifest_path != MapVisualCatalog.review_catalog_manifest_path(map_id)
				or review_binding_path != MapVisualCatalog.review_catalog_binding_path(map_id)
			):
				errors.append("QA review candidate 路径未绑定 review catalog：%s" % map_id)
			var review_manifest := _read_json(
				review_manifest_path,
				errors,
				"地图视觉 review manifest %s" % map_id
			)
			var review_binding := _read_json(
				review_binding_path,
				errors,
				"地图视觉 review binding %s" % map_id
			)
			_validate_authority_contract(
				map_id,
				map_data,
				review_binding,
				review_manifest,
				errors
			)
			_validate_prepared_map(
				map_id,
				map_data,
				review_manifest,
				selected_preview,
				errors
			)
			var review_bundle_id := str(selected_preview.get("bundleId", ""))
			var review_binding_hash := (
				FileAccess.get_sha256(review_binding_path)
				if FileAccess.file_exists(review_binding_path)
				else ""
			)
			if review_bundle_id == "":
				errors.append("QA review candidate 缺少 bundleId：%s" % map_id)
			if review_binding_hash.length() != 64:
				errors.append("无法冻结 review 地图视觉 binding SHA-256：%s" % map_id)
			var normal_bundle_id := str(normal.get("bundleId", ""))
			var normal_failed_closed_for_staged_authority := (
				pending_catalog_preview
				and staged_review_candidate
				and normal.is_empty()
			)
			if not normal_failed_closed_for_staged_authority and (
				normal.is_empty()
				or bool(normal.get("reviewCandidate", false))
				or str(normal.get("catalogSource", "")) != "normal"
				or normal_bundle_id == review_bundle_id
			):
				errors.append("pending review candidate 污染了普通 released catalog：%s" % map_id)

			var expected_review_map_ids_value: Variant = review_manifest.get("mapIds", [])
			if not (expected_review_map_ids_value is Array):
				errors.append("QA review manifest.mapIds 必须是数组：%s" % map_id)
			else:
				var expected_review_map_ids := expected_review_map_ids_value as Array
				if review_expected_map_ids_by_bundle.has(review_bundle_id):
					if not _same_string_set(
						review_expected_map_ids_by_bundle.get(review_bundle_id, []) as Array,
						expected_review_map_ids
					):
						errors.append("同 review bundle 的 manifest.mapIds 不一致：%s" % review_bundle_id)
				else:
					review_expected_map_ids_by_bundle[review_bundle_id] = expected_review_map_ids.duplicate()
			var seen_review_map_ids := review_map_ids_by_bundle.get(review_bundle_id, []) as Array
			if seen_review_map_ids.has(map_id):
				errors.append("review bundle mapId 重复：%s/%s" % [review_bundle_id, map_id])
			else:
				seen_review_map_ids.append(map_id)
			review_map_ids_by_bundle[review_bundle_id] = seen_review_map_ids
			var prior_manifest_path := str(review_manifest_paths_by_bundle.get(review_bundle_id, ""))
			if prior_manifest_path != "" and prior_manifest_path != review_manifest_path:
				errors.append("同 review bundle 的 manifest 路径不一致：%s" % review_bundle_id)
			review_manifest_paths_by_bundle[review_bundle_id] = review_manifest_path
			var review_bundle_binding_hashes := (
				review_binding_hashes_by_bundle.get(review_bundle_id, {}) as Dictionary
			)
			review_bundle_binding_hashes[map_id] = review_binding_hash
			review_binding_hashes_by_bundle[review_bundle_id] = review_bundle_binding_hashes
			var review_bundle_map_hashes := (
				review_map_data_hashes_by_bundle.get(review_bundle_id, {}) as Dictionary
			)
			review_bundle_map_hashes[map_id] = map_data_hash
			review_map_data_hashes_by_bundle[review_bundle_id] = review_bundle_map_hashes

			var review_summary := {
				"mapId": map_id,
				"groundDraws": MapVisualRenderer.ground_draw_count(selected_preview),
				"objects": MapVisualRenderer.object_draw_count(selected_preview),
				"protectedCells": (
					selected_preview.get("protectedLookup", {}) as Dictionary
				).size(),
			}
			review_candidate_summaries.append(review_summary.merged({"bundleId": review_bundle_id}))
			var review_bundle_summaries := (
				review_summaries_by_bundle.get(review_bundle_id, []) as Array
			)
			review_bundle_summaries.append(review_summary)
			review_summaries_by_bundle[review_bundle_id] = review_bundle_summaries
			var path_exact := (
				review_manifest_path == MapVisualCatalog.review_catalog_manifest_path(map_id)
				and review_binding_path == MapVisualCatalog.review_catalog_binding_path(map_id)
			)
			review_paths_exact_by_bundle[review_bundle_id] = (
				bool(review_paths_exact_by_bundle.get(review_bundle_id, true)) and path_exact
			)
			if validate_frozen_catalog_contract:
				_validate_frozen_catalog_contract(
					map_id,
					review_manifest_path,
					review_manifest,
					review_binding_hash,
					map_data_hash,
					errors
				)
		elif str(selected_preview.get("catalogSource", "")) != "normal":
			errors.append("QA preview 未解析到 review 或 normal catalog：%s" % map_id)

	# A first visual bundle has no released primary entry to compare against.
	# The review catalog already supports that selection contract; freeze these
	# QA-only maps independently while continuing to require normal runtime to
	# fall back to the legacy renderer.
	for map_id in review_only_map_ids:
		var map_path := MapDataCatalog.path_for(map_id)
		if map_path == "":
			errors.append("review-only 地图未注册 MapDataCatalog：%s" % map_id)
			continue
		var map_data := IsoMapModel.load_map(map_path)
		if map_data.is_empty():
			errors.append("review-only 权威地图加载失败：%s" % map_id)
			continue
		var binding_path := MapVisualCatalog.review_catalog_binding_path(map_id)
		var manifest_path := MapVisualCatalog.review_catalog_manifest_path(map_id)
		var binding := _read_json(
			binding_path,
			errors,
			"review-only 地图视觉 binding %s" % map_id
		)
		var manifest := _read_json(
			manifest_path,
			errors,
			"review-only 地图视觉 manifest %s" % map_id
		)
		var binding_manifest_path := (
			binding_path.get_base_dir().get_base_dir().path_join("map-visual-bundle.json")
		)
		if manifest_path != binding_manifest_path:
			errors.append(
				"review-only catalog bundleManifest 与 binding 实际 manifest 不一致：%s expected=%s actual=%s"
				% [map_id, binding_manifest_path, manifest_path]
			)
		_validate_authority_contract(map_id, map_data, binding, manifest, errors)
		var binding_hash := (
			FileAccess.get_sha256(binding_path)
			if FileAccess.file_exists(binding_path)
			else ""
		)
		var map_data_hash := (
			FileAccess.get_sha256(map_path)
			if FileAccess.file_exists(map_path)
			else ""
		)
		if binding_hash.length() != 64:
			errors.append("无法冻结 review-only 地图视觉 binding SHA-256：%s" % map_id)
		if map_data_hash.length() != 64:
			errors.append("无法冻结 review-only 权威地图数据 SHA-256：%s" % map_id)
		if validate_frozen_catalog_contract:
			_validate_frozen_catalog_contract(
				map_id,
				manifest_path,
				manifest,
				binding_hash,
				map_data_hash,
				errors
			)

		var before := map_data.duplicate(true)
		var normal := MapVisualCatalog.prepare_map(map_id, map_data, false)
		if not normal.is_empty():
			errors.append("review-only 地图绕过 QA 进入普通运行时：%s" % map_id)
		if map_data != before:
			errors.append("review-only normal prepare 修改了权威 mapData：%s" % map_id)
		var selected_preview := MapVisualCatalog.prepare_map(map_id, map_data, true)
		if selected_preview.is_empty():
			errors.append("review-only QA preview 地图准备失败：%s" % map_id)
			errors.append_array(MapVisualCatalog.errors_for_map(map_id))
			continue
		if map_data != before:
			errors.append("review-only QA prepare 修改了权威 mapData：%s" % map_id)
		if (
			not bool(selected_preview.get("reviewCandidate", false))
			or str(selected_preview.get("catalogSource", "")) != "review"
		):
			errors.append("review-only QA preview 未解析到 review catalog：%s" % map_id)
		_validate_prepared_map(map_id, map_data, manifest, selected_preview, errors)

		var review_bundle_id := str(selected_preview.get("bundleId", ""))
		var review_binding_hash := (
			FileAccess.get_sha256(binding_path)
			if FileAccess.file_exists(binding_path)
			else ""
		)
		if review_bundle_id == "":
			errors.append("review-only candidate 缺少 bundleId：%s" % map_id)
		if review_binding_hash.length() != 64:
			errors.append("无法冻结 review-only binding SHA-256：%s" % map_id)
		var expected_review_map_ids_value: Variant = manifest.get("mapIds", [])
		if not (expected_review_map_ids_value is Array):
			errors.append("review-only manifest.mapIds 必须是数组：%s" % map_id)
		else:
			var expected_review_map_ids := expected_review_map_ids_value as Array
			if review_expected_map_ids_by_bundle.has(review_bundle_id):
				if not _same_string_set(
					review_expected_map_ids_by_bundle.get(review_bundle_id, []) as Array,
					expected_review_map_ids
				):
					errors.append("同 review-only bundle 的 manifest.mapIds 不一致：%s" % review_bundle_id)
			else:
				review_expected_map_ids_by_bundle[review_bundle_id] = expected_review_map_ids.duplicate()
		var seen_review_map_ids := review_map_ids_by_bundle.get(review_bundle_id, []) as Array
		if seen_review_map_ids.has(map_id):
			errors.append("review-only bundle mapId 重复：%s/%s" % [review_bundle_id, map_id])
		else:
			seen_review_map_ids.append(map_id)
		review_map_ids_by_bundle[review_bundle_id] = seen_review_map_ids
		var prior_manifest_path := str(review_manifest_paths_by_bundle.get(review_bundle_id, ""))
		if prior_manifest_path != "" and prior_manifest_path != manifest_path:
			errors.append("同 review-only bundle 的 manifest 路径不一致：%s" % review_bundle_id)
		review_manifest_paths_by_bundle[review_bundle_id] = manifest_path
		var review_bundle_binding_hashes := (
			review_binding_hashes_by_bundle.get(review_bundle_id, {}) as Dictionary
		)
		review_bundle_binding_hashes[map_id] = review_binding_hash
		review_binding_hashes_by_bundle[review_bundle_id] = review_bundle_binding_hashes
		var review_bundle_map_hashes := (
			review_map_data_hashes_by_bundle.get(review_bundle_id, {}) as Dictionary
		)
		review_bundle_map_hashes[map_id] = map_data_hash
		review_map_data_hashes_by_bundle[review_bundle_id] = review_bundle_map_hashes
		var review_summary := {
			"mapId": map_id,
			"groundDraws": MapVisualRenderer.ground_draw_count(selected_preview),
			"objects": MapVisualRenderer.object_draw_count(selected_preview),
			"protectedCells": (
				selected_preview.get("protectedLookup", {}) as Dictionary
			).size(),
		}
		review_candidate_summaries.append(review_summary.merged({"bundleId": review_bundle_id}))
		var review_bundle_summaries := (
			review_summaries_by_bundle.get(review_bundle_id, []) as Array
		)
		review_bundle_summaries.append(review_summary)
		review_summaries_by_bundle[review_bundle_id] = review_bundle_summaries
		var path_exact := (
			manifest_path == MapVisualCatalog.review_catalog_manifest_path(map_id)
			and binding_path == MapVisualCatalog.review_catalog_binding_path(map_id)
		)
		review_paths_exact_by_bundle[review_bundle_id] = (
			bool(review_paths_exact_by_bundle.get(review_bundle_id, true)) and path_exact
		)

	for review_bundle_id_value in review_expected_map_ids_by_bundle.keys():
		var review_bundle_id := str(review_bundle_id_value)
		var expected_review_map_ids := (
			review_expected_map_ids_by_bundle.get(review_bundle_id, []) as Array
		)
		var seen_review_map_ids := review_map_ids_by_bundle.get(review_bundle_id, []) as Array
		if not _same_string_set(seen_review_map_ids, expected_review_map_ids):
			errors.append(
				"review catalog 未精确覆盖 bundle mapIds：%s expected=%s actual=%s"
				% [review_bundle_id, str(expected_review_map_ids), str(seen_review_map_ids)]
			)

	var repeat_prepare_map_ids: Array[String] = EXPECTED_MAP_IDS.duplicate()
	repeat_prepare_map_ids.append_array(review_only_map_ids)
	var counts_after_first_pass := MapVisualCatalog.debug_io_counts()
	for map_id in repeat_prepare_map_ids:
		var map_data := IsoMapModel.load_map(MapDataCatalog.path_for(map_id))
		MapVisualCatalog.prepare_map(map_id, map_data, true)
	var counts_after_second_pass := MapVisualCatalog.debug_io_counts()
	var repeat_prepare_io_stable := counts_after_first_pass == counts_after_second_pass
	if not repeat_prepare_io_stable:
		errors.append("重复 prepare 触发了新的 JSON/Texture I/O")

	var unknown_map := {
		"id": "unknown_visual_map",
		"gridSize": [1, 1],
		"tileSize": [80, 40],
		"origin": [0, 0],
		"spawnCell": [0, 0],
		"blockedCells": [],
		"interactionPoints": [],
	}
	var unknown_map_failed_closed := MapVisualCatalog.prepare_map("unknown_visual_map", unknown_map, true).is_empty()
	if not unknown_map_failed_closed:
		errors.append("未知地图视觉没有失败关闭到旧 renderer")

	var generated_at_utc := _utc_timestamp()
	var catalog_hash := FileAccess.get_sha256(MapVisualCatalog.DATA_PATH) if FileAccess.file_exists(MapVisualCatalog.DATA_PATH) else ""
	if catalog_hash.length() != 64:
		errors.append("无法冻结地图视觉 catalog SHA-256")
	var review_catalog_hash := (
		FileAccess.get_sha256(MapVisualCatalog.REVIEW_DATA_PATH)
		if FileAccess.file_exists(MapVisualCatalog.REVIEW_DATA_PATH)
		else ""
	)
	if not review_expected_map_ids_by_bundle.is_empty() and review_catalog_hash.length() != 64:
		errors.append("无法冻结地图视觉 review catalog SHA-256")
	var current_hashes_complete := catalog_hash.length() == 64
	for map_id in EXPECTED_MAP_IDS:
		current_hashes_complete = (
			current_hashes_complete
			and str(binding_hashes.get(map_id, "")).length() == 64
			and str(map_data_hashes.get(map_id, "")).length() == 64
		)
	var lifecycle_valid := errors.filter(
		func(error: String) -> bool:
			return error.contains("普通运行时") or error.contains("绕过 QA") or error.contains("生命周期")
	).is_empty()
	var qa_preview_enabled := _same_string_set(selected_preview_map_ids, EXPECTED_MAP_IDS)
	var checks := {
		"catalogInitialized": catalog_initialized,
		"catalogCoverageExact": catalog_coverage_exact,
		"catalogPathsExact": catalog_paths_exact,
		"currentHashesComplete": current_hashes_complete,
		"normalLifecycleAccessValid": lifecycle_valid,
		"qaPreviewEnabled": qa_preview_enabled,
		"repeatPrepareIoStable": repeat_prepare_io_stable,
		"unknownMapFailedClosed": unknown_map_failed_closed,
		"allIndependentChecksPassed": errors.is_empty(),
		"frozenReportValidationSkippedForGeneration": not validate_frozen_catalog_contract,
	}
	var result := "PASS" if errors.is_empty() else "FAIL"
	var bundle_reports: Dictionary = {}
	for bundle_id_value in BUNDLE_MAP_IDS.keys():
		var bundle_id := str(bundle_id_value)
		var map_ids: Array = BUNDLE_MAP_IDS.get(bundle_id, [])
		var bundle_binding_hashes: Dictionary = {}
		var bundle_map_data_hashes: Dictionary = {}
		for map_id_value in map_ids:
			var map_id := str(map_id_value)
			bundle_binding_hashes[map_id] = str(binding_hashes.get(map_id, ""))
			bundle_map_data_hashes[map_id] = str(map_data_hashes.get(map_id, ""))
		var bundle_maps: Array[Dictionary] = []
		for summary in summaries:
			if map_ids.has(str(summary.get("mapId", ""))):
				bundle_maps.append(summary.duplicate(true))
		var bundle_errors: Array[String] = errors.duplicate()
		if pending_catalog_preview:
			for map_id_value in map_ids:
				var map_id := str(map_id_value)
				var staged_values: Variant = staged_primary_errors_by_map.get(map_id, [])
				if staged_values is Array:
					bundle_errors.append_array(staged_values as Array[String])
		var bundle_preview_enabled := bundle_maps.size() == map_ids.size()
		if not bundle_preview_enabled and pending_catalog_preview:
			bundle_errors.append(
				"primary bundle 与 staged 权威地图不一致，已在 preview 模式失败关闭：%s"
				% bundle_id
			)
		var bundle_checks := checks.duplicate(true)
		bundle_checks["normalLifecycleAccessValid"] = (
			lifecycle_valid and bundle_preview_enabled
		)
		bundle_checks["qaPreviewEnabled"] = bundle_preview_enabled
		bundle_checks["allIndependentChecksPassed"] = bundle_errors.is_empty()
		var bundle_result := "PASS" if bundle_errors.is_empty() else "FAIL"
		bundle_reports[bundle_id] = {
			"schemaVersion": 1,
			"reportType": CATALOG_CONTRACT_REPORT_TYPE,
			"generatedAtUtc": generated_at_utc,
			"bundleId": bundle_id,
			"result": bundle_result,
			"testedMapIds": map_ids.duplicate(),
			"catalogSha256": catalog_hash,
			"bindingHashes": bundle_binding_hashes,
			"mapDataHashes": bundle_map_data_hashes,
			"maps": bundle_maps,
			"checks": bundle_checks,
			"errors": bundle_errors,
		}
	var review_bundle_ids: Array[String] = []
	for review_bundle_id_value in review_expected_map_ids_by_bundle.keys():
		var review_bundle_id := str(review_bundle_id_value)
		review_bundle_ids.append(review_bundle_id)
		var expected_review_map_ids := (
			review_expected_map_ids_by_bundle.get(review_bundle_id, []) as Array
		)
		var seen_review_map_ids := review_map_ids_by_bundle.get(review_bundle_id, []) as Array
		var review_bundle_binding_hashes := (
			review_binding_hashes_by_bundle.get(review_bundle_id, {}) as Dictionary
		)
		var review_bundle_map_hashes := (
			review_map_data_hashes_by_bundle.get(review_bundle_id, {}) as Dictionary
		)
		var review_bundle_summaries := (
			review_summaries_by_bundle.get(review_bundle_id, []) as Array
		)
		var review_hashes_complete := review_catalog_hash.length() == 64
		for map_id_value in expected_review_map_ids:
			var map_id := str(map_id_value)
			review_hashes_complete = (
				review_hashes_complete
				and str(review_bundle_binding_hashes.get(map_id, "")).length() == 64
				and str(review_bundle_map_hashes.get(map_id, "")).length() == 64
			)
		var review_checks := {
			"catalogInitialized": review_catalog_load_errors.is_empty(),
			"catalogCoverageExact": _same_string_set(seen_review_map_ids, expected_review_map_ids),
			"catalogPathsExact": bool(review_paths_exact_by_bundle.get(review_bundle_id, false)),
			"currentHashesComplete": review_hashes_complete,
			"normalLifecycleAccessValid": lifecycle_valid,
			"qaPreviewEnabled": _same_string_set(seen_review_map_ids, expected_review_map_ids),
			"repeatPrepareIoStable": repeat_prepare_io_stable,
			"unknownMapFailedClosed": unknown_map_failed_closed,
			"allIndependentChecksPassed": errors.is_empty(),
			"frozenReportValidationSkippedForGeneration": not validate_frozen_catalog_contract,
		}
		var review_errors: Array[String] = errors.duplicate()
		if not bool(review_checks.get("catalogCoverageExact", false)):
			review_errors.append("review bundle catalog 覆盖不完整：%s" % review_bundle_id)
		if not bool(review_checks.get("catalogPathsExact", false)):
			review_errors.append("review bundle catalog 路径不精确：%s" % review_bundle_id)
		if not bool(review_checks.get("currentHashesComplete", false)):
			review_errors.append("review bundle 当前哈希不完整：%s" % review_bundle_id)
		review_checks["allIndependentChecksPassed"] = review_errors.is_empty()
		var review_result := "PASS" if review_errors.is_empty() else "FAIL"
		bundle_reports[review_bundle_id] = {
			"schemaVersion": 1,
			"reportType": CATALOG_CONTRACT_REPORT_TYPE,
			"generatedAtUtc": generated_at_utc,
			"bundleId": review_bundle_id,
			"result": review_result,
			"testedMapIds": expected_review_map_ids.duplicate(),
			"catalogSha256": review_catalog_hash,
			"bindingHashes": review_bundle_binding_hashes.duplicate(true),
			"mapDataHashes": review_bundle_map_hashes.duplicate(true),
			"maps": review_bundle_summaries.duplicate(true),
			"checks": review_checks,
			"errors": review_errors,
		}
	review_bundle_ids.sort()

	return {
		"schemaVersion": 1,
		"reportType": "beastbound.map_visual_runtime_check",
		"generatedAtUtc": generated_at_utc,
		"mode": "strict_frozen_validation" if validate_frozen_catalog_contract else "catalog_contract_generation",
		"result": result,
		"testedMapIds": EXPECTED_MAP_IDS.duplicate(),
		"catalogSha256": catalog_hash,
		"bindingHashes": binding_hashes,
		"mapDataHashes": map_data_hashes,
		"bundleReports": bundle_reports,
		"reviewBundleIds": review_bundle_ids,
		"reviewOnlyMapIds": review_only_map_ids.duplicate(),
		"normalPendingDisabled": errors.filter(func(error: String) -> bool: return error.contains("绕过 QA")).is_empty(),
		"normalLifecycleAccessValid": lifecycle_valid,
		"qaPreviewEnabled": qa_preview_enabled,
		"ioCounts": counts_after_second_pass,
		"maps": summaries,
		"reviewCandidates": review_candidate_summaries,
		"checks": checks,
		"errors": errors,
	}


static func _review_generation_bundle_id(args: PackedStringArray) -> String:
	for arg in args:
		if arg.begins_with(GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX):
			return arg.substr(GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX.length()).strip_edges()
	return ""


static func _is_safe_bundle_id(value: String) -> bool:
	if value == "":
		return false
	var regex := RegEx.new()
	if regex.compile("^[a-z0-9]+(?:_[a-z0-9]+)*$") != OK:
		return false
	return regex.search(value) != null


static func _catalog_contract_cli_error(args: PackedStringArray) -> String:
	var generate_requested := args.has(GENERATE_CATALOG_CONTRACT_FLAG)
	var review_generate_count := 0
	var review_generation_bundle_id := ""
	for arg in args:
		if arg.begins_with(GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX):
			review_generate_count += 1
			review_generation_bundle_id = arg.substr(
				GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX.length()
			).strip_edges()
	var review_generate_requested := review_generate_count > 0
	var overwrite_requested := args.has(OVERWRITE_CATALOG_CONTRACT_FLAG)
	var preview_requested := args.has(PREVIEW_CATALOG_CONTRACT_FLAG)
	if review_generate_count > 1:
		return "%s 必须且只能出现一次" % GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX
	if review_generate_requested and not _is_safe_bundle_id(review_generation_bundle_id):
		return "%s 后必须是安全 bundleId" % GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX
	if generate_requested and review_generate_requested:
		return "%s 不得与 %s 同时使用" % [
			GENERATE_CATALOG_CONTRACT_FLAG,
			GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX,
		]
	if preview_requested and (generate_requested or review_generate_requested):
		return "%s 不得与 catalog contract 生成参数同时使用" % [
			PREVIEW_CATALOG_CONTRACT_FLAG,
		]
	if overwrite_requested and not (generate_requested or review_generate_requested):
		return "%s 只能与 catalog contract 生成参数一起使用" % [
			OVERWRITE_CATALOG_CONTRACT_FLAG,
		]
	for arg in args:
		for forbidden_name in AUTH_ARGUMENT_NAMES:
			if arg == forbidden_name or arg.begins_with(forbidden_name + "="):
				return "地图视觉 catalog contract 检查拒绝登录/server 参数：%s" % forbidden_name
		if (
			arg != GENERATE_CATALOG_CONTRACT_FLAG
			and arg != OVERWRITE_CATALOG_CONTRACT_FLAG
			and arg != PREVIEW_CATALOG_CONTRACT_FLAG
			and not arg.begins_with(GENERATE_REVIEW_CATALOG_CONTRACT_PREFIX)
		):
			return "地图视觉 catalog contract 检查不接受未知参数：%s" % arg
	return ""


static func _write_catalog_contract_reports(
	run_report: Dictionary,
	overwrite: bool,
	bundle_ids_override: Array = []
) -> Dictionary:
	var errors: Array[String] = []
	if not [
		"catalog_contract_generation",
		"review_catalog_contract_generation",
	].has(str(run_report.get("mode", ""))):
		errors.append("catalog contract 只允许写入 generation 模式报告")
	if str(run_report.get("result", "FAIL")) != "PASS":
		errors.append("独立 runtime/path/hash 检查未通过，拒绝写入 catalog contract")
	var checks_value: Variant = run_report.get("checks", {})
	if not (checks_value is Dictionary):
		errors.append("generation 报告缺少 checks")
	else:
		var checks := checks_value as Dictionary
		if not bool(checks.get("allIndependentChecksPassed", false)):
			errors.append("generation 报告未确认全部独立检查通过")
		if not bool(checks.get("frozenReportValidationSkippedForGeneration", false)):
			errors.append("generation 模式没有正确跳过旧冻结报告门禁")

	var bundle_reports_value: Variant = run_report.get("bundleReports", {})
	if not (bundle_reports_value is Dictionary):
		errors.append("generation 报告缺少 bundleReports")
	var bundle_reports := bundle_reports_value as Dictionary if bundle_reports_value is Dictionary else {}
	var review_bundle_ids_value: Variant = run_report.get("reviewBundleIds", [])
	var review_bundle_ids: Array = (
		review_bundle_ids_value as Array if review_bundle_ids_value is Array else []
	)
	var bundle_ids_to_write: Array = bundle_ids_override.duplicate()
	if bundle_ids_to_write.is_empty():
		bundle_ids_to_write = (
			review_bundle_ids.duplicate()
			if not review_bundle_ids.is_empty()
			else BUNDLE_MAP_IDS.keys()
		)
	for bundle_id_value in bundle_ids_override:
		var bundle_id := str(bundle_id_value)
		if not review_bundle_ids.has(bundle_id):
			errors.append("review catalog generation bundleId 不在 review catalog：%s" % bundle_id)
	var targets := _catalog_contract_report_targets(
		errors,
		bundle_ids_to_write,
		review_bundle_ids,
		bundle_reports
	)
	for bundle_id_value in bundle_ids_to_write:
		var bundle_id := str(bundle_id_value)
		if not targets.has(bundle_id):
			errors.append("catalog contract 缺少 bundle 写入目标：%s" % bundle_id)
		if not bundle_reports.has(bundle_id):
			errors.append("catalog contract 缺少 bundle 报告：%s" % bundle_id)
		var target_path := str(targets.get(bundle_id, ""))
		if target_path != "" and FileAccess.file_exists(target_path) and not overwrite:
			errors.append(
				"catalog contract 已存在，拒绝覆盖：%s（需显式 %s）"
				% [target_path, OVERWRITE_CATALOG_CONTRACT_FLAG]
			)
	if not errors.is_empty():
		return {"result": "FAIL", "atomicity": "per_bundle_file", "written": [], "errors": errors}

	var staged: Array[Dictionary] = []
	for bundle_id_value in bundle_ids_to_write:
		var bundle_id := str(bundle_id_value)
		var target_path := str(targets.get(bundle_id, ""))
		var temp_path := "%s.tmp.%d.%d" % [
			target_path,
			OS.get_process_id(),
			Time.get_ticks_usec(),
		]
		var bundle_report := (bundle_reports.get(bundle_id, {}) as Dictionary).duplicate(true)
		var payload := JSON.stringify(bundle_report, "\t", true) + "\n"
		var file := FileAccess.open(temp_path, FileAccess.WRITE)
		if file == null:
			errors.append("无法创建 catalog contract 临时文件：%s error=%d" % [temp_path, FileAccess.get_open_error()])
			break
		file.store_string(payload)
		file.flush()
		var write_error := file.get_error()
		file.close()
		if write_error != OK:
			errors.append("写入 catalog contract 临时文件失败：%s error=%d" % [temp_path, write_error])
			break
		staged.append({"bundleId": bundle_id, "temp": temp_path, "target": target_path})
	if not errors.is_empty():
		_remove_staged_files(staged)
		return {"result": "FAIL", "atomicity": "per_bundle_file", "written": [], "errors": errors}

	var written: Array[Dictionary] = []
	for entry in staged:
		var install_error := _atomic_install_report(
			str(entry.get("temp", "")),
			str(entry.get("target", "")),
			overwrite
		)
		if install_error != OK:
			errors.append(
				"原子安装 catalog contract 失败：%s error=%d"
				% [str(entry.get("target", "")), install_error]
			)
			break
		var target_path := str(entry.get("target", ""))
		written.append({
			"bundleId": str(entry.get("bundleId", "")),
			"path": target_path,
			"sha256": FileAccess.get_sha256(target_path),
		})
	if not errors.is_empty():
		_remove_staged_files(staged)
		return {"result": "FAIL", "atomicity": "per_bundle_file", "written": written, "errors": errors}
	return {"result": "PASS", "atomicity": "per_bundle_file", "written": written, "errors": []}


static func _catalog_contract_report_targets(
	errors: Array[String],
	bundle_ids: Array,
	review_bundle_ids: Array,
	bundle_reports: Dictionary
) -> Dictionary:
	var targets: Dictionary = {}
	var primary_manifest_paths := _catalog_manifest_paths(errors)
	var review_manifest_paths := _review_catalog_manifest_paths(errors)
	for bundle_id_value in bundle_ids:
		var bundle_id := str(bundle_id_value)
		var report := bundle_reports.get(bundle_id, {}) as Dictionary
		var map_ids_value: Variant = report.get("testedMapIds", [])
		if not (map_ids_value is Array) or (map_ids_value as Array).is_empty():
			errors.append("catalog contract bundle 报告缺少 testedMapIds：%s" % bundle_id)
			continue
		var map_ids := map_ids_value as Array
		var manifest_paths := (
			review_manifest_paths if review_bundle_ids.has(bundle_id) else primary_manifest_paths
		)
		var manifest_path := ""
		for map_id_value in map_ids:
			var map_id := str(map_id_value)
			var current_path := str(manifest_paths.get(map_id, ""))
			if manifest_path == "":
				manifest_path = current_path
			elif current_path != manifest_path:
				errors.append("同 bundle 的 catalog manifest 路径不一致：%s/%s" % [bundle_id, map_id])
		if manifest_path == "":
			errors.append("catalog contract 无法解析 manifest：%s" % bundle_id)
			continue
		var manifest := _read_json(manifest_path, errors, "catalog contract manifest %s" % bundle_id)
		if manifest.is_empty():
			continue
		if str(manifest.get("bundleId", "")) != bundle_id:
			errors.append("catalog contract manifest bundleId 不一致：%s" % bundle_id)
		var manifest_map_ids_value: Variant = manifest.get("mapIds", [])
		if not (manifest_map_ids_value is Array) or not _same_string_set(manifest_map_ids_value as Array, map_ids):
			errors.append("catalog contract manifest mapIds 与 bundle canary 不一致：%s" % bundle_id)
		var reference_value: Variant = manifest.get("catalogContractCheck")
		if not (reference_value is Dictionary):
			errors.append("catalog contract manifest 缺少 catalogContractCheck：%s" % bundle_id)
			continue
		var relative_path := str((reference_value as Dictionary).get("path", ""))
		if relative_path != CATALOG_CONTRACT_REPORT_PATH:
			errors.append(
				"catalogContractCheck 必须使用固定 bundle 相对路径：%s actual=%s"
				% [bundle_id, relative_path]
			)
			continue
		var bundle_root := manifest_path.get_base_dir().simplify_path()
		var target_path := bundle_root.path_join(relative_path).simplify_path()
		if not target_path.begins_with(bundle_root + "/"):
			errors.append("catalog contract 写入路径越界：%s" % bundle_id)
			continue
		var target_directory := target_path.get_base_dir()
		if not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(target_directory)):
			errors.append("catalog contract 写入目录不存在：%s" % target_directory)
			continue
		if targets.values().has(target_path):
			errors.append("catalog contract bundle 写入目标重复：%s" % target_path)
			continue
		targets[bundle_id] = target_path
	return targets


static func _atomic_install_report(temp_path: String, target_path: String, overwrite: bool) -> Error:
	var temp_absolute := ProjectSettings.globalize_path(temp_path)
	var target_absolute := ProjectSettings.globalize_path(target_path)
	if not overwrite:
		# `rename(2)` may replace a destination that appears after preflight. A same-directory
		# hard link gives this no-overwrite path atomic create-if-absent semantics on macOS/Linux.
		if FileAccess.file_exists(target_path):
			return ERR_ALREADY_EXISTS
		if OS.get_name() != "macOS" and OS.get_name() != "Linux":
			return ERR_UNAVAILABLE
		var link_output: Array = []
		var link_exit := OS.execute(
			"/bin/ln",
			PackedStringArray([temp_absolute, target_absolute]),
			link_output,
			true
		)
		if link_exit != 0:
			return ERR_ALREADY_EXISTS if FileAccess.file_exists(target_path) else FAILED
		var cleanup_error := DirAccess.remove_absolute(temp_absolute)
		return cleanup_error if cleanup_error != OK else OK
	var direct_error := DirAccess.rename_absolute(temp_absolute, target_absolute)
	if direct_error == OK:
		return OK
	if not overwrite or not FileAccess.file_exists(target_path):
		return direct_error
	var backup_path := "%s.backup.%d.%d" % [target_path, OS.get_process_id(), Time.get_ticks_usec()]
	var backup_absolute := ProjectSettings.globalize_path(backup_path)
	var backup_error := DirAccess.rename_absolute(target_absolute, backup_absolute)
	if backup_error != OK:
		return backup_error
	var install_error := DirAccess.rename_absolute(temp_absolute, target_absolute)
	if install_error != OK:
		DirAccess.rename_absolute(backup_absolute, target_absolute)
		return install_error
	DirAccess.remove_absolute(backup_absolute)
	return OK


static func _remove_staged_files(staged: Array[Dictionary]) -> void:
	for entry in staged:
		var temp_path := str(entry.get("temp", ""))
		if temp_path != "" and FileAccess.file_exists(temp_path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(temp_path))


static func _utc_timestamp() -> String:
	return Time.get_datetime_string_from_system(true, false) + "Z"


static func _read_json(path: String, errors: Array[String], label: String) -> Dictionary:
	if path == "" or not FileAccess.file_exists(path):
		errors.append("%s 文件不存在：%s" % [label, path])
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("%s 不是 JSON 对象：%s" % [label, path])
		return {}
	return parsed as Dictionary


static func _catalog_manifest_paths(errors: Array[String]) -> Dictionary:
	return _manifest_paths_from_catalog(
		MapVisualCatalog.DATA_PATH,
		"地图视觉 catalog 独立读取",
		errors
	)


static func _review_catalog_manifest_paths(errors: Array[String]) -> Dictionary:
	return _manifest_paths_from_catalog(
		MapVisualCatalog.REVIEW_DATA_PATH,
		"地图视觉 review catalog 独立读取",
		errors
	)


static func _manifest_paths_from_catalog(
	catalog_path: String,
	label: String,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	var catalog := _read_json(catalog_path, errors, label)
	var entries_value: Variant = catalog.get("entries", [])
	if not (entries_value is Array):
		errors.append("%s.entries 不是数组" % label)
		return result
	for index in range((entries_value as Array).size()):
		var entry_value: Variant = (entries_value as Array)[index]
		if not (entry_value is Dictionary):
			errors.append("地图视觉 catalog entry[%d] 不是对象" % index)
			continue
		var entry := entry_value as Dictionary
		var map_id := str(entry.get("mapId", ""))
		var manifest_path := str(entry.get("bundleManifest", ""))
		if map_id == "" or result.has(map_id):
			errors.append("%s mapId 缺失或重复：%s" % [label, map_id])
			continue
		result[map_id] = manifest_path
	return result


static func _expected_normal_access(manifest: Dictionary, map_id: String, errors: Array[String]) -> bool:
	if typeof(manifest.get("releaseApproved")) != TYPE_BOOL:
		errors.append("地图视觉 releaseApproved 必须是布尔值：%s" % map_id)
		return false
	if typeof(manifest.get("runtimeEnabled")) != TYPE_BOOL:
		errors.append("地图视觉 runtimeEnabled 必须是布尔值：%s" % map_id)
		return false
	var status := str(manifest.get("status", ""))
	var review := str(manifest.get("ownerReviewStatus", ""))
	var release_approved := bool(manifest.get("releaseApproved"))
	var runtime_enabled := bool(manifest.get("runtimeEnabled"))
	var pending := (
		status == MapVisualCatalog.STATUS_OWNER_REVIEW_PENDING
		and review == MapVisualCatalog.OWNER_REVIEW_PENDING
		and not release_approved
		and not runtime_enabled
	)
	var released := (
		status == MapVisualCatalog.STATUS_RELEASED
		and review == MapVisualCatalog.OWNER_REVIEW_APPROVED
		and release_approved
		and runtime_enabled
	)
	if not pending and not released:
		errors.append("地图视觉生命周期门禁组合无效：%s" % map_id)
	return released


static func _validate_frozen_catalog_contract(
	map_id: String,
	manifest_path: String,
	manifest: Dictionary,
	binding_hash: String,
	map_data_hash: String,
	errors: Array[String]
) -> void:
	var reference_value: Variant = manifest.get("catalogContractCheck")
	if not (reference_value is Dictionary):
		errors.append("地图视觉缺少 catalogContractCheck 引用：%s" % map_id)
		return
	var reference := reference_value as Dictionary
	var relative_path := str(reference.get("path", ""))
	var declared_hash := str(reference.get("sha256", ""))
	var bundle_root := manifest_path.get_base_dir().simplify_path()
	var report_path := bundle_root.path_join(relative_path).simplify_path()
	if (
		relative_path != CATALOG_CONTRACT_REPORT_PATH
		or relative_path.begins_with("res://")
		or not report_path.begins_with(bundle_root + "/")
	):
		errors.append("catalogContractCheck 路径越界或无效：%s" % map_id)
		return
	if declared_hash.length() != 64 or not FileAccess.file_exists(report_path):
		errors.append("catalogContractCheck 文件/hash 缺失：%s" % map_id)
		return
	var actual_hash := FileAccess.get_sha256(report_path)
	if actual_hash != declared_hash:
		errors.append("catalogContractCheck 文件 hash 漂移：%s" % map_id)
		return
	var report := _read_json(report_path, errors, "catalogContractCheck %s" % map_id)
	if report.is_empty():
		return
	if int(report.get("schemaVersion", 0)) != 1:
		errors.append("catalogContractCheck schemaVersion 无效：%s" % map_id)
	if str(report.get("reportType", "")) != CATALOG_CONTRACT_REPORT_TYPE:
		errors.append("catalogContractCheck reportType 无效：%s" % map_id)
	if not _is_utc_timestamp(str(report.get("generatedAtUtc", ""))):
		errors.append("catalogContractCheck generatedAtUtc 无效：%s" % map_id)
	var bundle_id := str(manifest.get("bundleId", ""))
	if str(report.get("bundleId", "")) != bundle_id:
		errors.append("catalogContractCheck bundleId 与 manifest 不一致：%s" % map_id)
	if str(report.get("result", "")) != "PASS":
		errors.append("catalogContractCheck 不是 PASS：%s" % map_id)
	var expected_map_ids_value: Variant = manifest.get("mapIds", [])
	if not (expected_map_ids_value is Array) or (expected_map_ids_value as Array).is_empty():
		errors.append("catalogContractCheck manifest.mapIds 无效：%s" % bundle_id)
		return
	var expected_map_ids := expected_map_ids_value as Array
	var tested_value: Variant = report.get("testedMapIds", [])
	if not (tested_value is Array) or not _same_string_set(tested_value as Array, expected_map_ids):
		errors.append("catalogContractCheck testedMapIds 必须精确覆盖 bundle：%s" % map_id)
	var selected_catalog_path := (
		MapVisualCatalog.REVIEW_DATA_PATH
		if str(manifest.get("status", "")) == MapVisualCatalog.STATUS_OWNER_REVIEW_PENDING
		else MapVisualCatalog.DATA_PATH
	)
	if (
		not FileAccess.file_exists(selected_catalog_path)
		or str(report.get("catalogSha256", "")) != FileAccess.get_sha256(selected_catalog_path)
	):
		errors.append("catalogContractCheck catalog hash 已过期：%s" % map_id)
	var frozen_binding_hashes_value: Variant = report.get("bindingHashes", {})
	var frozen_map_hashes_value: Variant = report.get("mapDataHashes", {})
	if not (frozen_binding_hashes_value is Dictionary) or not (frozen_map_hashes_value is Dictionary):
		errors.append("catalogContractCheck hashes 必须是对象：%s" % map_id)
		return
	var frozen_binding_hashes := frozen_binding_hashes_value as Dictionary
	var frozen_map_hashes := frozen_map_hashes_value as Dictionary
	if not _dictionary_has_exact_string_keys(frozen_binding_hashes, expected_map_ids):
		errors.append("catalogContractCheck bindingHashes keys 不精确：%s" % map_id)
	if not _dictionary_has_exact_string_keys(frozen_map_hashes, expected_map_ids):
		errors.append("catalogContractCheck mapDataHashes keys 不精确：%s" % map_id)
	if str(frozen_binding_hashes.get(map_id, "")) != binding_hash:
		errors.append("catalogContractCheck binding hash 已过期：%s" % map_id)
	if str(frozen_map_hashes.get(map_id, "")) != map_data_hash:
		errors.append("catalogContractCheck 权威 mapData hash 已过期：%s" % map_id)
	_validate_frozen_report_maps(map_id, expected_map_ids, report.get("maps", []), errors)
	_validate_frozen_report_checks(map_id, report.get("checks", {}), errors)
	var report_errors_value: Variant = report.get("errors", null)
	if not (report_errors_value is Array) or not (report_errors_value as Array).is_empty():
		errors.append("catalogContractCheck errors 必须是空数组：%s" % map_id)


static func _validate_frozen_report_maps(
	map_id: String,
	expected_map_ids: Array,
	maps_value: Variant,
	errors: Array[String]
) -> void:
	if not (maps_value is Array):
		errors.append("catalogContractCheck maps 必须是数组：%s" % map_id)
		return
	var seen: Array[String] = []
	for value in maps_value as Array:
		if not (value is Dictionary):
			errors.append("catalogContractCheck maps 条目必须是对象：%s" % map_id)
			continue
		var summary := value as Dictionary
		var summary_map_id := str(summary.get("mapId", ""))
		if not expected_map_ids.has(summary_map_id) or seen.has(summary_map_id):
			errors.append("catalogContractCheck maps mapId 缺失、重复或越界：%s/%s" % [map_id, summary_map_id])
			continue
		seen.append(summary_map_id)
		if (
			int(summary.get("groundDraws", 0)) <= 0
			or int(summary.get("objects", 0)) <= 0
			or int(summary.get("protectedCells", 0)) <= 0
		):
			errors.append("catalogContractCheck maps 计数无效：%s/%s" % [map_id, summary_map_id])
	if not _same_string_set(seen, expected_map_ids):
		errors.append("catalogContractCheck maps 必须精确覆盖 bundle：%s" % map_id)


static func _validate_frozen_report_checks(
	map_id: String,
	checks_value: Variant,
	errors: Array[String]
) -> void:
	if not (checks_value is Dictionary):
		errors.append("catalogContractCheck checks 必须是对象：%s" % map_id)
		return
	var checks := checks_value as Dictionary
	for key in [
		"catalogInitialized",
		"catalogCoverageExact",
		"catalogPathsExact",
		"currentHashesComplete",
		"normalLifecycleAccessValid",
		"qaPreviewEnabled",
		"repeatPrepareIoStable",
		"unknownMapFailedClosed",
		"allIndependentChecksPassed",
		"frozenReportValidationSkippedForGeneration",
	]:
		if typeof(checks.get(key)) != TYPE_BOOL or not bool(checks.get(key, false)):
			errors.append("catalogContractCheck checks.%s 必须为 true：%s" % [key, map_id])


static func _dictionary_has_exact_string_keys(value: Dictionary, expected: Array) -> bool:
	if value.size() != expected.size():
		return false
	for expected_key_value in expected:
		if not value.has(str(expected_key_value)):
			return false
	return true


static func _same_string_set(left: Array, right: Array) -> bool:
	if left.size() != right.size():
		return false
	var seen: Dictionary = {}
	for value in left:
		var key := str(value)
		if key == "" or seen.has(key):
			return false
		seen[key] = true
	for value in right:
		if not seen.has(str(value)):
			return false
	return true


static func _is_utc_timestamp(value: String) -> bool:
	if value.length() != 20 or not value.ends_with("Z"):
		return false
	var regex := RegEx.new()
	if regex.compile("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$") != OK:
		return false
	return regex.search(value) != null


static func _validate_authority_contract(
	map_id: String,
	map_data: Dictionary,
	binding: Dictionary,
	manifest: Dictionary,
	errors: Array[String]
) -> void:
	if binding.is_empty() or manifest.is_empty():
		return
	var ground_value: Variant = binding.get("ground", {})
	if ground_value is Dictionary:
		_validate_path_links_contract(map_id, map_data, ground_value as Dictionary, errors)
	else:
		errors.append("独立检查：binding.ground 不是对象：%s" % map_id)
	_validate_spawn_points_contract(map_id, map_data, errors)
	_validate_encounter_zones_contract(map_id, map_data, errors)
	for value in map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		var kind := str(item.get("kind", ""))
		if kind == "warp":
			_validate_warp_contract(map_id, map_data, item, errors)
		elif kind == "npc":
			var source := _cell(item.get("cell"))
			if not IsoMapModel.is_inside(map_data, source):
				errors.append("独立检查：NPC interaction 源格越界：%s/%s" % [map_id, str(item.get("id", ""))])
			elif _independent_reachable_npc_approaches(map_data, item).is_empty():
				errors.append("独立检查：NPC interaction 没有可达 approach 邻格：%s/%s" % [map_id, str(item.get("id", ""))])
	_validate_raw_object_contract(map_id, map_data, binding, manifest, errors)


static func _validate_spawn_points_contract(
	map_id: String,
	map_data: Dictionary,
	errors: Array[String]
) -> void:
	var spawn_points_value: Variant = map_data.get("spawnPoints", {})
	if not (spawn_points_value is Dictionary):
		errors.append("独立检查：spawnPoints 不是对象：%s" % map_id)
		return
	var spawn_points := spawn_points_value as Dictionary
	var default_spawn := IsoMapModel.spawn_cell(map_data)
	var default_valid := (
		IsoMapModel.is_inside(map_data, default_spawn)
		and IsoMapModel.is_walkable(map_data, default_spawn)
	)
	if not default_valid:
		errors.append("独立检查：默认 spawn 越界或不可走：%s/%s" % [map_id, IsoMapModel.cell_key(default_spawn)])
	for spawn_id_value in spawn_points.keys():
		var spawn_id := str(spawn_id_value)
		if not (spawn_id_value is String) or not _is_stable_id(spawn_id):
			errors.append("独立检查：spawnPoints ID 非稳定 ID：%s/%s" % [map_id, spawn_id])
			continue
		var spawn := _cell(spawn_points.get(spawn_id_value))
		if not IsoMapModel.is_inside(map_data, spawn) or not IsoMapModel.is_walkable(map_data, spawn):
			errors.append("独立检查：spawnPoint 越界或不可走：%s/%s/%s" % [map_id, spawn_id, IsoMapModel.cell_key(spawn)])
			continue
		if not default_valid:
			continue
		var path := IsoMapModel.find_path(map_data, default_spawn, spawn)
		if not _path_reaches_exact(path, default_spawn, spawn, false):
			errors.append(
				"独立检查：spawnPoint 从默认 spawn 不可精确到达：%s/%s/%s->%s"
				% [map_id, spawn_id, IsoMapModel.cell_key(default_spawn), IsoMapModel.cell_key(spawn)]
			)


static func _validate_encounter_zones_contract(
	map_id: String,
	map_data: Dictionary,
	errors: Array[String]
) -> void:
	var zones_value: Variant = map_data.get("encounterZones", [])
	if not (zones_value is Array):
		errors.append("独立检查：encounterZones 不是数组：%s" % map_id)
		return
	var default_spawn := IsoMapModel.spawn_cell(map_data)
	var default_valid := (
		IsoMapModel.is_inside(map_data, default_spawn)
		and IsoMapModel.is_walkable(map_data, default_spawn)
	)
	var has_non_manual_zone := false
	var has_reachable_cell := false
	for zone_index in range((zones_value as Array).size()):
		var zone_value: Variant = (zones_value as Array)[zone_index]
		if not (zone_value is Dictionary):
			errors.append("独立检查：encounterZones[%d] 不是对象：%s" % [zone_index, map_id])
			continue
		var zone := zone_value as Dictionary
		if bool(zone.get("manualOnly", false)):
			continue
		has_non_manual_zone = true
		var zone_id := str(zone.get("id", "zone_%d" % zone_index))
		var cells_value: Variant = zone.get("cells", [])
		if not (cells_value is Array):
			errors.append("独立检查：encounterZone cells 不是数组：%s/%s" % [map_id, zone_id])
		else:
			for cell_index in range((cells_value as Array).size()):
				var cell := _cell((cells_value as Array)[cell_index])
				if not _validate_encounter_cell(map_id, map_data, zone_id, "cells[%d]" % cell_index, cell, errors):
					continue
				if default_valid and not has_reachable_cell:
					var path := IsoMapModel.find_path(map_data, default_spawn, cell)
					has_reachable_cell = _path_reaches_exact(path, default_spawn, cell, false)
		var rects_value: Variant = zone.get("rects", [])
		if not (rects_value is Array):
			errors.append("独立检查：encounterZone rects 不是数组：%s/%s" % [map_id, zone_id])
			continue
		for rect_index in range((rects_value as Array).size()):
			var rect_value: Variant = (rects_value as Array)[rect_index]
			if not (rect_value is Array) or (rect_value as Array).size() != 4:
				errors.append("独立检查：encounterZone rects[%d] 格式无效：%s/%s" % [rect_index, map_id, zone_id])
				continue
			var parts := rect_value as Array
			var rect_x := int(parts[0])
			var rect_y := int(parts[1])
			var rect_width := int(parts[2])
			var rect_height := int(parts[3])
			if rect_width <= 0 or rect_height <= 0:
				errors.append("独立检查：encounterZone rects[%d] 尺寸无效：%s/%s" % [rect_index, map_id, zone_id])
				continue
			for y in range(rect_y, rect_y + rect_height):
				for x in range(rect_x, rect_x + rect_width):
					var cell := Vector2i(x, y)
					if not _validate_encounter_cell(map_id, map_data, zone_id, "rects[%d]" % rect_index, cell, errors):
						continue
					if default_valid and not has_reachable_cell:
						var path := IsoMapModel.find_path(map_data, default_spawn, cell)
						has_reachable_cell = _path_reaches_exact(path, default_spawn, cell, false)
	if has_non_manual_zone and not has_reachable_cell:
		errors.append("独立检查：非手动 encounterZones 没有从默认 spawn 可精确到达的格子：%s" % map_id)


static func _validate_encounter_cell(
	map_id: String,
	map_data: Dictionary,
	zone_id: String,
	source: String,
	cell: Vector2i,
	errors: Array[String]
) -> bool:
	var terrain_blocked := IsoMapModel.blocked_lookup(map_data)
	if not IsoMapModel.is_inside(map_data, cell):
		errors.append(
			"独立检查：encounterZone 格子越界：%s/%s/%s/%s"
			% [map_id, zone_id, source, IsoMapModel.cell_key(cell)]
		)
		return false
	if terrain_blocked.has(IsoMapModel.cell_key(cell)):
		# Rectangular encounter areas describe broad terrain and the runtime can
		# never place a player on a static blocker inside that rectangle. Keep
		# explicit cells strict, but filter incidental blocked rect cells exactly
		# like EncounterModel.first_walkable_cell and the visual encounter lookup.
		if source.begins_with("cells["):
			errors.append(
				"独立检查：encounterZone 显式格被静态地形阻挡：%s/%s/%s/%s"
				% [map_id, zone_id, source, IsoMapModel.cell_key(cell)]
			)
		return false
	return true


static func _validate_path_links_contract(
	map_id: String,
	map_data: Dictionary,
	ground: Dictionary,
	errors: Array[String]
) -> void:
	var links_value: Variant = ground.get("pathLinks", [])
	if not (links_value is Array):
		errors.append("独立检查：pathLinks 不是数组：%s" % map_id)
		return
	for index in range((links_value as Array).size()):
		var value: Variant = (links_value as Array)[index]
		if not (value is Dictionary):
			errors.append("独立检查：pathLinks[%d] 不是对象：%s" % [index, map_id])
			continue
		var link := value as Dictionary
		var start := _cell(link.get("from"))
		var goal := _cell(link.get("to"))
		if (
			not IsoMapModel.is_inside(map_data, start)
			or not IsoMapModel.is_inside(map_data, goal)
			or not IsoMapModel.is_walkable(map_data, start)
			or not IsoMapModel.is_walkable(map_data, goal)
			or start == goal
		):
			errors.append("独立检查：pathLinks[%d] 起终点无效：%s" % [index, map_id])
			continue
		var path := IsoMapModel.find_path(map_data, start, goal)
		if not _path_reaches_exact(path, start, goal, true):
			errors.append(
				"独立检查：pathLinks[%d] 被吸附、仅含 start 或未到达 goal：%s/%s->%s"
				% [index, map_id, IsoMapModel.cell_key(start), IsoMapModel.cell_key(goal)]
			)


static func _validate_warp_contract(
	map_id: String,
	map_data: Dictionary,
	item: Dictionary,
	errors: Array[String]
) -> void:
	var warp_id := str(item.get("id", ""))
	var source := _cell(item.get("cell"))
	if warp_id == "" or not IsoMapModel.is_inside(map_data, source) or not IsoMapModel.is_walkable(map_data, source):
		errors.append("独立检查：warp source 无效：%s/%s" % [map_id, warp_id])
		return
	var default_spawn := IsoMapModel.spawn_cell(map_data)
	if not IsoMapModel.is_inside(map_data, default_spawn) or not IsoMapModel.is_walkable(map_data, default_spawn):
		errors.append("独立检查：warp 无法使用无效的默认 spawn：%s/%s" % [map_id, warp_id])
	else:
		var source_path := IsoMapModel.find_path(map_data, default_spawn, source)
		if not _path_reaches_exact(source_path, default_spawn, source, false):
			errors.append(
				"独立检查：warp source 从默认 spawn 不可精确到达：%s/%s/%s->%s"
				% [map_id, warp_id, IsoMapModel.cell_key(default_spawn), IsoMapModel.cell_key(source)]
			)
	var target_map_id := str(item.get("toMap", ""))
	var target_spawn := str(item.get("toSpawn", ""))
	var target_path := MapDataCatalog.path_for(target_map_id)
	if target_map_id == "" or target_path == "":
		errors.append("独立检查：warp targetMapId(toMap) 未注册：%s/%s" % [map_id, warp_id])
		return
	var target_map := _read_json(target_path, errors, "warp 目标地图 %s/%s" % [map_id, warp_id])
	if target_map.is_empty() or str(target_map.get("id", "")) != target_map_id:
		errors.append("独立检查：warp targetMapId(toMap) 不一致：%s/%s" % [map_id, warp_id])
		return
	var spawn_points_value: Variant = target_map.get("spawnPoints", {})
	if not (spawn_points_value is Dictionary):
		errors.append("独立检查：warp 目标地图 spawnPoints 无效：%s/%s" % [map_id, warp_id])
		return
	var spawn_points := spawn_points_value as Dictionary
	if target_spawn == "" or not spawn_points.has(target_spawn):
		errors.append("独立检查：warp targetSpawn(toSpawn) 不存在：%s/%s/%s" % [map_id, warp_id, target_spawn])
		return
	var target_cell := _cell(spawn_points.get(target_spawn))
	if not IsoMapModel.is_inside(target_map, target_cell) or not IsoMapModel.is_walkable(target_map, target_cell):
		errors.append("独立检查：warp targetSpawn(toSpawn) 越界或不可走：%s/%s/%s" % [map_id, warp_id, target_spawn])


static func _independent_reachable_npc_approaches(
	map_data: Dictionary,
	item: Dictionary
) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var source := _cell(item.get("cell"))
	var start := IsoMapModel.spawn_cell(map_data)
	if not IsoMapModel.is_inside(map_data, source) or not IsoMapModel.is_walkable(map_data, start):
		return result
	for offset in IsoMapModel.NEIGHBORS_8:
		var candidate := source + offset
		if not IsoMapModel.is_walkable(map_data, candidate):
			continue
		var path := IsoMapModel.find_path(map_data, start, candidate)
		if _path_reaches_exact(path, start, candidate, false):
			result.append(candidate)
	return result


static func _path_reaches_exact(
	path: Array[Vector2i],
	start: Vector2i,
	goal: Vector2i,
	require_move: bool
) -> bool:
	if path.is_empty() or path.front() != start or path.back() != goal:
		return false
	return not require_move or path.size() >= 2


static func _validate_raw_object_contract(
	map_id: String,
	map_data: Dictionary,
	binding: Dictionary,
	manifest: Dictionary,
	errors: Array[String]
) -> void:
	var definitions: Dictionary = {}
	for value in manifest.get("objects", []):
		if not (value is Dictionary):
			errors.append("独立检查：object 定义不是对象：%s" % map_id)
			continue
		var definition := value as Dictionary
		var object_id := str(definition.get("objectId", ""))
		if object_id == "" or definitions.has(object_id):
			errors.append("独立检查：objectId 缺失或重复：%s/%s" % [map_id, object_id])
			continue
		definitions[object_id] = definition
		_validate_raw_collision_definition(map_id, object_id, definition, errors)

	var authoritative_blocked := IsoMapModel.blocked_lookup(map_data)
	var grid_size := IsoMapModel.grid_size(map_data)
	var ground := binding.get("ground", {}) as Dictionary
	var edge_padding_value: Variant = ground.get("edgePaddingCells", 0)
	var covered_blocked: Dictionary = {}
	for value in binding.get("objectPlacements", []):
		if not (value is Dictionary):
			errors.append("独立检查：objectPlacement 不是对象：%s" % map_id)
			continue
		var placement := value as Dictionary
		var instance_id := str(placement.get("instanceId", ""))
		var object_id := str(placement.get("objectId", ""))
		if not definitions.has(object_id):
			errors.append("独立检查：placement 引用未知 objectId：%s/%s" % [map_id, instance_id])
			continue
		var definition := definitions[object_id] as Dictionary
		var role := str(definition.get("collisionRole", ""))
		if not COLLISION_ROLES.has(role):
			errors.append("独立检查：collisionRole 不在白名单：%s/%s/%s" % [map_id, instance_id, role])
			continue
		var grid_value: Variant = placement.get("grid")
		if not MapVisualCatalog._is_integral_grid_pair(grid_value):
			errors.append("独立检查：placement grid 不是整数坐标：%s/%s" % [map_id, instance_id])
			continue
		var grid := _cell(grid_value)
		if not MapVisualCatalog._object_anchor_within_contract(
			grid,
			grid_size,
			role,
			edge_padding_value
		):
			if role == "none" or role == "decorative":
				errors.append("独立检查：纯布景锚点超出 edge skirt：%s/%s" % [map_id, instance_id])
			else:
				errors.append("独立检查：blocking/interaction placement 锚点越界：%s/%s" % [map_id, instance_id])
		var footprint_value: Variant = placement.get("collisionFootprint", [])
		if not (footprint_value is Array):
			errors.append("独立检查：collisionFootprint 不是数组：%s/%s" % [map_id, instance_id])
			continue
		var footprint_keys: Array[String] = []
		var footprint_cells: Array[Vector2i] = []
		for footprint_cell_value in footprint_value as Array:
			var footprint_cell := _cell(footprint_cell_value)
			var key := IsoMapModel.cell_key(footprint_cell)
			if not IsoMapModel.is_inside(map_data, footprint_cell):
				errors.append("独立检查：collisionFootprint 越界：%s/%s/%s" % [map_id, instance_id, key])
				continue
			if footprint_keys.has(key):
				errors.append("独立检查：collisionFootprint 格子重复：%s/%s/%s" % [map_id, instance_id, key])
				continue
			footprint_keys.append(key)
			footprint_cells.append(footprint_cell)
		if role == "blocking":
			if footprint_keys.is_empty():
				errors.append("独立检查：blocking footprint 为空：%s/%s" % [map_id, instance_id])
			elif not _footprint_near_grid(grid, footprint_cells):
				errors.append("独立检查：blocking footprint 与 placement 锚点脱离：%s/%s" % [map_id, instance_id])
			for key in footprint_keys:
				if not authoritative_blocked.has(key):
					errors.append("独立检查：blocking footprint 未绑定 blockedCells：%s/%s/%s" % [map_id, instance_id, key])
				else:
					covered_blocked[key] = true
		elif role == "none" or role == "decorative":
			if not footprint_keys.is_empty():
				errors.append("独立检查：none/decorative footprint 非空：%s/%s" % [map_id, instance_id])
		elif role == "interaction":
			var collision_value: Variant = definition.get("collision", {})
			var collision_mode := str((collision_value as Dictionary).get("mode", "")) if collision_value is Dictionary else ""
			_validate_raw_interaction_placement(
				map_id,
				map_data,
				instance_id,
				grid,
				placement.get("interactionLink"),
				collision_mode,
				footprint_keys,
					authoritative_blocked,
					errors
				)
	if str(ground.get("blockedVisualMode", "blocked_tile")) == "inherit_surface":
		for key_value in authoritative_blocked.keys():
			var key := str(key_value)
			if not covered_blocked.has(key):
				errors.append("独立检查：inherit_surface 留下未被物件覆盖的阻挡格：%s/%s" % [map_id, key])


static func _footprint_near_grid(grid: Vector2i, footprint_cells: Array[Vector2i]) -> bool:
	for footprint_cell in footprint_cells:
		if maxi(absi(footprint_cell.x - grid.x), absi(footprint_cell.y - grid.y)) <= 1:
			return true
	return false


static func _validate_raw_collision_definition(
	map_id: String,
	object_id: String,
	definition: Dictionary,
	errors: Array[String]
) -> void:
	var role := str(definition.get("collisionRole", ""))
	if not COLLISION_ROLES.has(role):
		errors.append("独立检查：collisionRole 不在白名单：%s/%s/%s" % [map_id, object_id, role])
		return
	var collision_value: Variant = definition.get("collision", {})
	if not (collision_value is Dictionary):
		errors.append("独立检查：object.collision 不是对象：%s/%s" % [map_id, object_id])
		return
	var collision := collision_value as Dictionary
	var mode := str(collision.get("mode", ""))
	var points_value: Variant = collision.get("points", [])
	if not (points_value is Array):
		errors.append("独立检查：collision.points 不是数组：%s/%s" % [map_id, object_id])
		return
	var points := points_value as Array
	if role == "blocking" and mode != "polygon":
		errors.append("独立检查：blocking 必须使用 polygon collision：%s/%s" % [map_id, object_id])
	if (role == "none" or role == "decorative") and (mode != "none" or not points.is_empty()):
		errors.append("独立检查：none/decorative 必须使用空 none collision：%s/%s" % [map_id, object_id])
	if role == "interaction" and mode != "none" and mode != "polygon":
		errors.append("独立检查：interaction collision 只接受 none/polygon：%s/%s" % [map_id, object_id])
	if mode == "none" and not points.is_empty():
		errors.append("独立检查：none collision 不得有 points：%s/%s" % [map_id, object_id])
	if mode != "polygon":
		return
	var asset_value: Variant = definition.get("asset", {})
	var dimensions := Vector2i.ZERO
	if asset_value is Dictionary:
		dimensions = _cell((asset_value as Dictionary).get("dimensions"))
	if dimensions.x <= 0 or dimensions.y <= 0 or points.size() < 3:
		errors.append("独立检查：polygon collision 尺寸/点数无效：%s/%s" % [map_id, object_id])
		return
	for index in range(points.size()):
		var point := _number_pair(points[index])
		if point.x < 0.0 or point.y < 0.0 or point.x >= dimensions.x or point.y >= dimensions.y:
			errors.append("独立检查：polygon collision 点越界：%s/%s/%d" % [map_id, object_id, index])


static func _validate_raw_interaction_placement(
	map_id: String,
	map_data: Dictionary,
	instance_id: String,
	grid: Vector2i,
	interaction_link: Variant,
	collision_mode: String,
	footprint_keys: Array[String],
	authoritative_blocked: Dictionary,
	errors: Array[String]
) -> void:
	if not (interaction_link is String) or not _is_stable_id(str(interaction_link)):
		errors.append("独立检查：interactionLink 非法：%s/%s" % [map_id, instance_id])
		return
	var interaction := _find_interaction(map_data, str(interaction_link))
	if interaction.is_empty():
		errors.append("独立检查：interactionLink 未绑定当前权威 interaction：%s/%s" % [map_id, instance_id])
		return
	var interaction_cell := _cell(interaction.get("cell"))
	var interaction_key := IsoMapModel.cell_key(interaction_cell)
	if grid != interaction_cell:
		errors.append("独立检查：interaction placement 锚点不等于权威 interaction 源格：%s/%s" % [map_id, instance_id])
	if collision_mode == "none":
		if not footprint_keys.is_empty():
			errors.append("独立检查：none interaction footprint 非空：%s/%s" % [map_id, instance_id])
		return
	if collision_mode != "polygon":
		return
	if footprint_keys.is_empty() or not footprint_keys.has(interaction_key):
		errors.append("独立检查：polygon interaction footprint 必须包含权威源格：%s/%s" % [map_id, instance_id])
	if not IsoMapModel.interaction_blocks_movement(interaction):
		errors.append("独立检查：可重叠 interaction 不得绑定 polygon：%s/%s" % [map_id, instance_id])
	for key in footprint_keys:
		if key != interaction_key and not authoritative_blocked.has(key):
			errors.append("独立检查：interaction footprint 未绑定 interaction/blockedCells：%s/%s/%s" % [map_id, instance_id, key])


static func _find_interaction(map_data: Dictionary, interaction_id: String) -> Dictionary:
	for value in map_data.get("interactionPoints", []):
		if value is Dictionary and str((value as Dictionary).get("id", "")) == interaction_id:
			return value as Dictionary
	return {}


static func _is_stable_id(value: String) -> bool:
	if value == "":
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if not ((code >= 97 and code <= 122) or (code >= 48 and code <= 57) or code == 95 or code == 45):
			return false
	return true


static func _number_pair(value: Variant) -> Vector2:
	if not (value is Array) or (value as Array).size() != 2:
		return Vector2(-1, -1)
	var parts := value as Array
	if not (parts[0] is int or parts[0] is float) or not (parts[1] is int or parts[1] is float):
		return Vector2(-1, -1)
	return Vector2(float(parts[0]), float(parts[1]))


static func _validate_prepared_map(
	map_id: String,
	map_data: Dictionary,
	manifest: Dictionary,
	prepared: Dictionary,
	errors: Array[String]
) -> void:
	var grid_size := IsoMapModel.grid_size(map_data)
	if str(prepared.get("mapId", "")) != map_id:
		errors.append("prepared mapId 错误：%s" % map_id)
	if prepared.get("tileSize") != TILE_SIZE or Vector2i(IsoMapModel.tile_size(map_data)) != TILE_SIZE:
		errors.append("prepared/authority tileSize 不是 80x40：%s" % map_id)
	if prepared.get("gridSize") != grid_size:
		errors.append("prepared gridSize 与权威地图不一致：%s" % map_id)
	if str(prepared.get("status", "")) != str(manifest.get("status", "")):
		errors.append("prepared 地图生命周期与 manifest 不一致：%s" % map_id)
	if not bool(prepared.get("qaPreview", false)):
		errors.append("canary 地图没有标记 QA preview：%s" % map_id)

	var ground := prepared.get("groundRules", {}) as Dictionary
	var ground_draws: Array = prepared.get("groundDraws", [])
	var variant_config := prepared.get("tileVariantConfig", {}) as Dictionary
	var expected_cluster_size := int(ground.get("variantClusterSize", 1))
	if (
		int(variant_config.get("clusterSize", 0)) != expected_cluster_size
		or int(prepared.get("variantClusterSize", 0)) != expected_cluster_size
	):
		errors.append("prepared variantClusterSize 与 binding 不一致：%s" % map_id)
	if ground_draws.size() != grid_size.x * grid_size.y:
		errors.append("地表绘制命令数不等于完整地图网格：%s" % map_id)
	var seen_cells: Dictionary = {}
	for value in ground_draws:
		if not (value is Dictionary):
			errors.append("地表绘制命令不是对象：%s" % map_id)
			continue
		var command := value as Dictionary
		var cell: Variant = command.get("cell")
		var semantic_tile_id := str(command.get("semanticTileId", ""))
		var destination: Variant = command.get("destination")
		var source: Variant = command.get("source")
		if not (cell is Vector2i) or not IsoMapModel.is_inside(map_data, cell as Vector2i):
			errors.append("地表绘制命令格子越界：%s" % map_id)
			continue
		var key := IsoMapModel.cell_key(cell as Vector2i)
		if seen_cells.has(key):
			errors.append("地表绘制命令格子重复：%s/%s" % [map_id, key])
		seen_cells[key] = true
		if semantic_tile_id != MapVisualCatalog.prepared_semantic_tile_id(
			prepared,
			cell as Vector2i
		):
			errors.append("地表命令语义 tile 与 prepared lookup 不一致：%s/%s" % [map_id, key])
		var expected_visual_tile_id := MapVisualCatalog.prepared_tile_id(
			prepared,
			cell as Vector2i
		)
		if str(command.get("tileId", "")) != expected_visual_tile_id:
			errors.append("地表命令变体选择不确定：%s/%s" % [map_id, key])
		if not (destination is Rect2) or Vector2i((destination as Rect2).size) != TILE_SIZE:
			errors.append("地表 destination 不是 80x40：%s/%s" % [map_id, key])
		if not (source is Rect2) or Vector2i((source as Rect2).size) != TILE_SIZE:
			errors.append("地表 atlas source 不是 80x40：%s/%s" % [map_id, key])
	_validate_layered_ground_draws(
		map_id,
		map_data,
		prepared,
		ground,
		variant_config,
		ground_draws,
		errors
	)

	var edge_padding := int(ground.get("edgePaddingCells", 0))
	var edge_draws: Array = prepared.get("edgeGroundDraws", [])
	var expected_edge_draws := (
		(grid_size.x + edge_padding * 2) * (grid_size.y + edge_padding * 2)
		- grid_size.x * grid_size.y
	)
	if edge_draws.size() != expected_edge_draws:
		errors.append("视觉 edge skirt 绘制命令数不完整：%s" % map_id)
	var edge_seen: Dictionary = {}
	var edge_semantic_tile_id := str(
		ground.get("edgeTileId", ground.get("defaultTileId", ""))
	)
	var tile_ids := prepared.get("tileIdsByCell", {}) as Dictionary
	var blocked := prepared.get("blockedLookup", {}) as Dictionary
	var protected := prepared.get("protectedLookup", {}) as Dictionary
	for value in edge_draws:
		if not (value is Dictionary):
			errors.append("视觉 edge skirt 绘制命令不是对象：%s" % map_id)
			continue
		var command := value as Dictionary
		var cell_value: Variant = command.get("cell")
		var destination_value: Variant = command.get("destination")
		var source_value: Variant = command.get("source")
		if not (cell_value is Vector2i):
			errors.append("视觉 edge skirt 缺少 Vector2i 格：%s" % map_id)
			continue
		var edge_cell := cell_value as Vector2i
		if IsoMapModel.is_inside(map_data, edge_cell):
			errors.append("视觉 edge skirt 侵入权威网格：%s/%s" % [map_id, str(edge_cell)])
			continue
		var edge_key := IsoMapModel.cell_key(edge_cell)
		if edge_seen.has(edge_key):
			errors.append("视觉 edge skirt 格重复：%s/%s" % [map_id, edge_key])
		edge_seen[edge_key] = true
		if tile_ids.has(edge_key) or blocked.has(edge_key) or protected.has(edge_key):
			errors.append("视觉 edge skirt 污染玩法 lookup：%s/%s" % [map_id, edge_key])
		if str(command.get("semanticTileId", "")) != edge_semantic_tile_id:
			errors.append("视觉 edge skirt 未使用 edgeTileId/defaultTileId 语义：%s/%s" % [map_id, edge_key])
		var expected_edge_tile_id := MapVisualCatalog._select_tile_variant(
			map_id,
			edge_cell,
			edge_semantic_tile_id,
			variant_config
		)
		if str(command.get("tileId", "")) != expected_edge_tile_id:
			errors.append("视觉 edge skirt 变体选择不确定：%s/%s" % [map_id, edge_key])
		if not (destination_value is Rect2) or Vector2i((destination_value as Rect2).size) != TILE_SIZE:
			errors.append("视觉 edge skirt destination 不是 80x40：%s/%s" % [map_id, edge_key])
		if not (source_value is Rect2) or Vector2i((source_value as Rect2).size) != TILE_SIZE:
			errors.append("视觉 edge skirt atlas source 不是 80x40：%s/%s" % [map_id, edge_key])

	if int(ground.get("pathDilation", -1)) != 1:
		errors.append("canary 主路必须使用 Chebyshev 一格扩张：%s" % map_id)
	var independent := _independent_ground_lookups(map_id, map_data, ground, errors)
	_validate_ground_priority(map_id, map_data, prepared, ground, independent, errors)
	_validate_protected_cells(map_id, map_data, prepared, ground, independent, errors)
	_validate_object_footprints(map_id, map_data, prepared, errors)


static func _validate_layered_ground_draws(
	map_id: String,
	map_data: Dictionary,
	prepared: Dictionary,
	ground: Dictionary,
	variant_config: Dictionary,
	ground_draws: Array,
	errors: Array[String]
) -> void:
	var mode := str(prepared.get("groundRenderMode", ""))
	var base_value: Variant = prepared.get("baseGroundDraws", [])
	var overlay_value: Variant = prepared.get("overlayGroundDraws", [])
	if not (base_value is Array) or not (overlay_value is Array):
		errors.append("prepared 分层地表命令必须是数组：%s" % map_id)
		return
	var base_draws := base_value as Array
	var overlay_draws := overlay_value as Array
	if not ground.has("layeredBaseTileId"):
		if mode != "single_layer" or not base_draws.is_empty() or not overlay_draws.is_empty():
			errors.append("未声明分层地表的地图生成了分层命令：%s" % map_id)
		return
	if mode != "layered_semantic_overlay":
		errors.append("声明分层地表的地图没有进入 layered_semantic_overlay：%s" % map_id)

	var grid_size := IsoMapModel.grid_size(map_data)
	if base_draws.size() != grid_size.x * grid_size.y:
		errors.append("分层地表 base 命令没有覆盖完整网格：%s" % map_id)
	var base_tile_id := str(ground.get("layeredBaseTileId", ""))
	var base_pool_value: Variant = (
		variant_config.get("pools", {}) as Dictionary
	).get(base_tile_id, [base_tile_id])
	var base_pool: Array = base_pool_value as Array if base_pool_value is Array else [base_tile_id]
	var base_by_cell: Dictionary = {}
	for value in base_draws:
		if not (value is Dictionary):
			errors.append("分层地表 base 命令不是对象：%s" % map_id)
			continue
		var command := value as Dictionary
		var cell_value: Variant = command.get("cell")
		if not (cell_value is Vector2i) or not IsoMapModel.is_inside(map_data, cell_value as Vector2i):
			errors.append("分层地表 base 命令格子越界：%s" % map_id)
			continue
		var cell := cell_value as Vector2i
		var key := IsoMapModel.cell_key(cell)
		if base_by_cell.has(key):
			errors.append("分层地表 base 命令格子重复：%s/%s" % [map_id, key])
		base_by_cell[key] = command
		var expected_tile_id := MapVisualCatalog._select_tile_variant(
			map_id,
			cell,
			base_tile_id,
			variant_config
		)
		if (
			str(command.get("semanticTileId", "")) != base_tile_id
			or str(command.get("tileId", "")) != expected_tile_id
		):
			errors.append("分层地表 base 语义或变体错误：%s/%s" % [map_id, key])
		var destination: Variant = command.get("destination")
		var source: Variant = command.get("source")
		if not (destination is Rect2) or Vector2i((destination as Rect2).size) != TILE_SIZE:
			errors.append("分层地表 base destination 不是 80x40：%s/%s" % [map_id, key])
		if not (source is Rect2) or Vector2i((source as Rect2).size) != TILE_SIZE:
			errors.append("分层地表 base source 不是 80x40：%s/%s" % [map_id, key])

	var expected_overlays: Dictionary = {}
	for value in ground_draws:
		if not (value is Dictionary):
			continue
		var command := value as Dictionary
		var cell_value: Variant = command.get("cell")
		if not (cell_value is Vector2i):
			continue
		var semantic_tile_id := str(command.get("semanticTileId", ""))
		var visual_tile_id := str(command.get("tileId", ""))
		if base_pool.has(semantic_tile_id) or base_pool.has(visual_tile_id):
			continue
		expected_overlays[IsoMapModel.cell_key(cell_value as Vector2i)] = command
	if overlay_draws.size() != expected_overlays.size():
		errors.append(
			"分层地表 overlay 命令数与非 base 语义格不一致：%s expected=%d actual=%d"
			% [map_id, expected_overlays.size(), overlay_draws.size()]
		)
	var overlay_seen: Dictionary = {}
	for value in overlay_draws:
		if not (value is Dictionary):
			errors.append("分层地表 overlay 命令不是对象：%s" % map_id)
			continue
		var command := value as Dictionary
		var cell_value: Variant = command.get("cell")
		if not (cell_value is Vector2i) or not IsoMapModel.is_inside(map_data, cell_value as Vector2i):
			errors.append("分层地表 overlay 命令格子越界：%s" % map_id)
			continue
		var key := IsoMapModel.cell_key(cell_value as Vector2i)
		if overlay_seen.has(key):
			errors.append("分层地表 overlay 命令格子重复：%s/%s" % [map_id, key])
		overlay_seen[key] = true
		if not expected_overlays.has(key):
			errors.append("分层地表 overlay 污染 base 语义格：%s/%s" % [map_id, key])
			continue
		var expected := expected_overlays.get(key, {}) as Dictionary
		for field in ["tileId", "semanticTileId", "destination", "source"]:
			if command.get(field) != expected.get(field):
				errors.append("分层地表 overlay 与语义命令不一致：%s/%s/%s" % [map_id, key, field])
	for key_value in expected_overlays.keys():
		var key := str(key_value)
		if not overlay_seen.has(key):
			errors.append("分层地表 overlay 缺少语义格：%s/%s" % [map_id, key])


static func _validate_ground_priority(
	map_id: String,
	map_data: Dictionary,
	prepared: Dictionary,
	ground: Dictionary,
	lookups: Dictionary,
	errors: Array[String]
) -> void:
	var grid_size := IsoMapModel.grid_size(map_data)
	var overrides := lookups.get("overrides", {}) as Dictionary
	var path := lookups.get("path", {}) as Dictionary
	var plaza := lookups.get("plaza", {}) as Dictionary
	var encounter := lookups.get("encounter", {}) as Dictionary
	var blocked := lookups.get("blocked", {}) as Dictionary
	var warp := lookups.get("warp", {}) as Dictionary
	for y in range(grid_size.y):
		for x in range(grid_size.x):
			var cell := Vector2i(x, y)
			var key := IsoMapModel.cell_key(cell)
			var expected := str(overrides.get(key, ground.get("defaultTileId", "")))
			if path.has(key):
				expected = str(ground.get("pathTileId", expected))
			if plaza.has(key):
				expected = str(ground.get("plazaTileId", expected))
			if encounter.has(key):
				expected = str(ground.get("encounterTileId", expected))
			if (
				blocked.has(key)
				and str(ground.get("blockedVisualMode", "blocked_tile")) == "blocked_tile"
			):
				expected = str(ground.get("blockedTileId", expected))
			if warp.has(key):
				expected = str(ground.get("warpTileId", expected))
			var actual := MapVisualCatalog.prepared_semantic_tile_id(prepared, cell)
			if actual != expected:
				errors.append("地表语义优先级错误：%s/%s expected=%s actual=%s" % [map_id, key, expected, actual])
				return


static func _validate_protected_cells(
	map_id: String,
	map_data: Dictionary,
	prepared: Dictionary,
	ground: Dictionary,
	lookups: Dictionary,
	errors: Array[String]
) -> void:
	var expected := (lookups.get("path", {}) as Dictionary).duplicate()
	for key_value in (lookups.get("encounter", {}) as Dictionary).keys():
		expected[str(key_value)] = true
	var spawn := IsoMapModel.spawn_cell(map_data)
	expected[IsoMapModel.cell_key(spawn)] = true
	for value in (map_data.get("spawnPoints", {}) as Dictionary).values():
		var cell := _cell(value)
		if IsoMapModel.is_inside(map_data, cell):
			expected[IsoMapModel.cell_key(cell)] = true
	for value in map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		var kind := str(item.get("kind", ""))
		if kind != "warp" and kind != "npc":
			continue
		var cell := _cell(item.get("cell"))
		if IsoMapModel.is_inside(map_data, cell):
			expected[IsoMapModel.cell_key(cell)] = true
		if kind == "npc":
			var approaches := _independent_reachable_npc_approaches(map_data, item)
			if approaches.is_empty():
				errors.append("独立检查：NPC 没有可达 approach 邻格：%s/%s" % [map_id, str(item.get("id", ""))])
			for approach in approaches:
				expected[IsoMapModel.cell_key(approach)] = true
	var actual := prepared.get("protectedLookup", {}) as Dictionary
	if actual.size() != expected.size():
		errors.append("保护格数量不一致：%s expected=%d actual=%d" % [map_id, expected.size(), actual.size()])
		return
	for key_value in expected.keys():
		if not actual.has(str(key_value)):
			errors.append("缺少 spawn/warp/NPC/主路/遇敌区保护格：%s/%s" % [map_id, str(key_value)])
			return


static func _validate_object_footprints(
	map_id: String,
	map_data: Dictionary,
	prepared: Dictionary,
	errors: Array[String]
) -> void:
	var authoritative_blocked := IsoMapModel.blocked_lookup(map_data)
	var protected := prepared.get("protectedLookup", {}) as Dictionary
	var grid_size := IsoMapModel.grid_size(map_data)
	var ground := prepared.get("groundRules", {}) as Dictionary
	var edge_padding_value: Variant = ground.get("edgePaddingCells", 0)
	var seen_instances: Dictionary = {}
	var covered_blocked: Dictionary = {}
	for layer in MapVisualCatalog.RENDER_LAYERS:
		for command in MapVisualCatalog.prepared_objects(prepared, layer):
			var instance_id := str(command.get("instanceId", ""))
			if instance_id == "" or seen_instances.has(instance_id):
				errors.append("地图物件 instanceId 缺失或重复：%s/%s" % [map_id, instance_id])
				continue
			seen_instances[instance_id] = true
			var grid: Variant = command.get("grid")
			var role := str(command.get("collisionRole", ""))
			if not COLLISION_ROLES.has(role):
				errors.append("地图物件 collisionRole 不在白名单：%s/%s/%s" % [map_id, instance_id, role])
			if (
				not (grid is Vector2i)
				or not MapVisualCatalog._object_anchor_within_contract(
					grid as Vector2i,
					grid_size,
					role,
					edge_padding_value
				)
			):
				errors.append("地图物件锚点不符合权威网格/edge skirt 合同：%s/%s" % [map_id, instance_id])
			var footprint: Array = command.get("collisionFootprint", [])
			if role == "blocking" and footprint.is_empty():
				errors.append("blocking 地图物件 footprint 为空：%s/%s" % [map_id, instance_id])
			if (role == "none" or role == "decorative") and not footprint.is_empty():
				errors.append("none/decorative 地图物件 footprint 非空：%s/%s" % [map_id, instance_id])
			var linked := _find_interaction(map_data, str(command.get("interactionLink", ""))) if role == "interaction" else {}
			if role == "interaction":
				if linked.is_empty():
					errors.append("interaction 地图物件未绑定当前权威 interaction：%s/%s" % [map_id, instance_id])
				elif not (grid is Vector2i) or (grid as Vector2i) != _cell(linked.get("cell")):
					errors.append("interaction 地图物件锚点与权威 interaction 不一致：%s/%s" % [map_id, instance_id])
			for key_value in footprint:
				var key := str(key_value)
				if role == "blocking":
					if not authoritative_blocked.has(key):
						errors.append("blocking 物件碰撞格不属于权威 blockedCells：%s/%s/%s" % [map_id, instance_id, key])
					else:
						covered_blocked[key] = true
					if protected.has(key):
						errors.append("blocking 物件碰撞格侵入保护格：%s/%s/%s" % [map_id, instance_id, key])
				elif role == "interaction" and not linked.is_empty():
					var interaction_key := IsoMapModel.cell_key(_cell(linked.get("cell")))
					if key != interaction_key and not authoritative_blocked.has(key):
						errors.append("interaction 物件 footprint 未绑定 interaction/blockedCells：%s/%s/%s" % [map_id, instance_id, key])
	if str(ground.get("blockedVisualMode", "blocked_tile")) == "inherit_surface":
		for key_value in authoritative_blocked.keys():
			var key := str(key_value)
			if not covered_blocked.has(key):
				errors.append("inherit_surface 地图存在未被 blocking 物件覆盖的阻挡格：%s/%s" % [map_id, key])


static func _independent_ground_lookups(
	map_id: String,
	map_data: Dictionary,
	ground: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var grid_size := IsoMapModel.grid_size(map_data)
	var path: Dictionary = {}
	var dilation := int(ground.get("pathDilation", 0))
	var links_value: Variant = ground.get("pathLinks", [])
	if not (links_value is Array):
		errors.append("独立检查：pathLinks 不是数组：%s" % map_id)
		links_value = []
	for index in range((links_value as Array).size()):
		var value: Variant = (links_value as Array)[index]
		if not (value is Dictionary):
			errors.append("独立检查：pathLinks[%d] 不是对象：%s" % [index, map_id])
			continue
		var link := value as Dictionary
		var start := _cell(link.get("from"))
		var goal := _cell(link.get("to"))
		if (
			not IsoMapModel.is_inside(map_data, start)
			or not IsoMapModel.is_inside(map_data, goal)
			or not IsoMapModel.is_walkable(map_data, start)
			or not IsoMapModel.is_walkable(map_data, goal)
			or start == goal
		):
			errors.append("独立检查：pathLinks[%d] 起终点无效：%s" % [index, map_id])
			continue
		var exact_path := IsoMapModel.find_path(map_data, start, goal)
		if not _path_reaches_exact(exact_path, start, goal, true):
			errors.append(
				"独立检查：pathLinks[%d] 被吸附、仅含 start 或未到达 goal：%s/%s->%s"
				% [index, map_id, IsoMapModel.cell_key(start), IsoMapModel.cell_key(goal)]
			)
			continue
		for path_cell in exact_path:
			for dy in range(-dilation, dilation + 1):
				for dx in range(-dilation, dilation + 1):
					var cell := path_cell + Vector2i(dx, dy)
					if IsoMapModel.is_inside(map_data, cell):
						path[IsoMapModel.cell_key(cell)] = true
	var plaza: Dictionary = {}
	for value in ground.get("plazaRects", []):
		if not (value is Array) or (value as Array).size() != 4:
			continue
		var parts := value as Array
		for y in range(int(parts[1]), int(parts[1]) + int(parts[3])):
			for x in range(int(parts[0]), int(parts[0]) + int(parts[2])):
				var cell := Vector2i(x, y)
				if _inside(cell, grid_size):
					plaza[IsoMapModel.cell_key(cell)] = true
	for value in ground.get("plazaCells", []):
		var cell := _cell(value)
		if _inside(cell, grid_size):
			plaza[IsoMapModel.cell_key(cell)] = true
	var encounter: Dictionary = {}
	for zone_value in map_data.get("encounterZones", []):
		if not (zone_value is Dictionary):
			continue
		var zone := zone_value as Dictionary
		if bool(zone.get("manualOnly", false)):
			continue
		for cell_value in zone.get("cells", []):
			var cell := _cell(cell_value)
			if _inside(cell, grid_size) and IsoMapModel.is_walkable(map_data, cell):
				encounter[IsoMapModel.cell_key(cell)] = true
		for rect_value in zone.get("rects", []):
			if not (rect_value is Array) or (rect_value as Array).size() != 4:
				continue
			var parts := rect_value as Array
			for y in range(int(parts[1]), int(parts[1]) + int(parts[3])):
				for x in range(int(parts[0]), int(parts[0]) + int(parts[2])):
					var cell := Vector2i(x, y)
					if _inside(cell, grid_size) and IsoMapModel.is_walkable(map_data, cell):
						encounter[IsoMapModel.cell_key(cell)] = true
	var warp: Dictionary = {}
	for value in map_data.get("interactionPoints", []):
		if value is Dictionary and str((value as Dictionary).get("kind", "")) == "warp":
			var cell := _cell((value as Dictionary).get("cell"))
			if _inside(cell, grid_size):
				warp[IsoMapModel.cell_key(cell)] = true
	var blocked: Dictionary = IsoMapModel.blocked_lookup(map_data)
	var overrides: Dictionary = {}
	for value in ground.get("overrides", []):
		if value is Dictionary:
			overrides[IsoMapModel.cell_key(_cell((value as Dictionary).get("grid")))] = str((value as Dictionary).get("tileId", ""))
	return {
		"path": path,
		"plaza": plaza,
		"encounter": encounter,
		"warp": warp,
		"blocked": blocked,
		"overrides": overrides,
	}


static func _cell(value: Variant) -> Vector2i:
	if not (value is Array) or (value as Array).size() != 2:
		return Vector2i(-1, -1)
	return Vector2i(int((value as Array)[0]), int((value as Array)[1]))


static func _inside(cell: Vector2i, size: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < size.x and cell.y < size.y
