extends RefCounted

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const MapDataCatalog := preload("res://scripts/world/map_data_catalog.gd")

const DATA_PATH := "res://data/map_visual_catalog.json"
const SCHEMA_VERSION := 1
const TILE_SIZE := Vector2i(80, 40)
const STATUS_OWNER_REVIEW_PENDING := "owner_review_pending"
const STATUS_RELEASED := "released"
const OWNER_REVIEW_PENDING := "pending"
const OWNER_REVIEW_APPROVED := "approved"
const RENDER_LAYERS: Array[String] = ["ground_decal", "world", "foreground"]
const COLLISION_ROLES: Array[String] = ["none", "decorative", "blocking", "interaction"]

static var _catalog_loaded := false
static var _catalog_errors: Array[String] = []
static var _entries_by_map_id: Dictionary = {}
static var _json_cache: Dictionary = {}
static var _contract_cache: Dictionary = {}
static var _texture_cache: Dictionary = {}
static var _map_errors: Dictionary = {}
static var _json_load_count := 0
static var _texture_load_count := 0
static var _image_fallback_load_count := 0


static func initialize() -> bool:
	_ensure_catalog_loaded()
	return _catalog_errors.is_empty()


static func catalog_map_ids() -> Array[String]:
	_ensure_catalog_loaded()
	var result: Array[String] = []
	for map_id_value in _entries_by_map_id.keys():
		result.append(str(map_id_value))
	result.sort()
	return result


static func catalog_errors() -> Array[String]:
	_ensure_catalog_loaded()
	return _catalog_errors.duplicate()


static func catalog_binding_path(map_id: String) -> String:
	_ensure_catalog_loaded()
	var entry := _entries_by_map_id.get(map_id, {}) as Dictionary
	return str(entry.get("bindingPath", ""))


static func errors_for_map(map_id: String) -> Array[String]:
	var value: Variant = _map_errors.get(map_id, [])
	return (value as Array[String]).duplicate() if value is Array else []


static func debug_io_counts() -> Dictionary:
	return {
		"jsonLoads": _json_load_count,
		"textureLoads": _texture_load_count,
		"imageFallbackLoads": _image_fallback_load_count,
		"cachedJson": _json_cache.size(),
		"cachedTextures": _texture_cache.size(),
	}


static func prepare_map(map_id: String, map_data: Dictionary, qa_preview: bool = false) -> Dictionary:
	_ensure_catalog_loaded()
	var errors: Array[String] = []
	_map_errors[map_id] = errors
	if map_id == "" or not _entries_by_map_id.has(map_id):
		return {}
	if not _catalog_errors.is_empty():
		errors.append_array(_catalog_errors)
		return {}
	if str(map_data.get("id", "")) != map_id:
		errors.append("地图视觉 mapId 与权威地图不一致：%s" % map_id)
		return {}
	if IsoMapModel.grid_size(map_data).x <= 0 or IsoMapModel.grid_size(map_data).y <= 0:
		errors.append("权威地图网格尺寸无效：%s" % map_id)
		return {}
	if Vector2i(IsoMapModel.tile_size(map_data)) != TILE_SIZE:
		errors.append("地图视觉只接受 80x40 权威格：%s" % map_id)
		return {}

	var contract := _contract_for_map(map_id, errors)
	if contract.is_empty():
		return {}
	var manifest := contract.get("manifest", {}) as Dictionary
	if not _access_allowed(manifest, qa_preview, errors):
		return {}

	var binding := contract.get("binding", {}) as Dictionary
	var grid_size := IsoMapModel.grid_size(map_data)
	var binding_grid := _vector2i_from_value(binding.get("mapGridSize"), Vector2i.ZERO)
	if binding_grid != grid_size:
		errors.append("地图视觉 binding 网格与权威地图不一致：%s" % map_id)

	var atlas_definition := manifest.get("groundAtlas", {}) as Dictionary
	var atlas_dimensions := _vector2i_from_value(atlas_definition.get("dimensions"), Vector2i.ZERO)
	var atlas_path := _resolve_bundle_path(
		str(contract.get("bundleRoot", "")),
		str(atlas_definition.get("path", ""))
	)
	if atlas_dimensions.x <= 0 or atlas_dimensions.y <= 0:
		errors.append("地表 atlas 尺寸无效：%s" % map_id)
	var atlas_texture := _load_texture(atlas_path, errors, "地表 atlas")
	if atlas_texture != null and Vector2i(atlas_texture.get_size()) != atlas_dimensions:
		errors.append("地表 atlas 贴图尺寸与 manifest 不一致：%s" % map_id)

	var tile_rects := _tile_rects_for_manifest(manifest, atlas_dimensions, errors)
	var ground_rules := binding.get("ground", {}) as Dictionary
	_validate_ground_tile_ids(ground_rules, tile_rects, errors)
	var ground_state := _build_ground_state(map_data, ground_rules, tile_rects, errors)
	var protected_lookup := _build_protected_lookup(
		map_data,
		ground_state.get("pathLookup", {}) as Dictionary,
		ground_state.get("encounterLookup", {}) as Dictionary,
		errors
	)
	var object_draws_by_layer := _build_object_draws(
		map_data,
		manifest,
		binding,
		str(contract.get("bundleRoot", "")),
		protected_lookup,
		errors
	)
	if not errors.is_empty() or atlas_texture == null:
		return {}

	var ground_draws: Array[Dictionary] = []
	var tile_ids_by_cell := ground_state.get("tileIdsByCell", {}) as Dictionary
	for y in range(grid_size.y):
		for x in range(grid_size.x):
			var cell := Vector2i(x, y)
			var key := IsoMapModel.cell_key(cell)
			var tile_id := str(tile_ids_by_cell.get(key, ""))
			var source_rect := tile_rects.get(tile_id, Rect2()) as Rect2
			var center := IsoMapModel.grid_to_world(map_data, cell)
			ground_draws.append({
				"cell": cell,
				"tileId": tile_id,
				"destination": Rect2(center - Vector2(TILE_SIZE) * 0.5, Vector2(TILE_SIZE)),
				"source": source_rect,
			})

	return {
		"active": true,
		"mapId": map_id,
		"bundleId": str(manifest.get("bundleId", "")),
		"mapStyleId": str(manifest.get("mapStyleId", "")),
		"status": str(manifest.get("status", "")),
		"qaPreview": qa_preview,
		"tileSize": TILE_SIZE,
		"gridSize": grid_size,
		"atlasTexture": atlas_texture,
		"groundDraws": ground_draws,
		"tileIdsByCell": tile_ids_by_cell,
		"tileCounts": ground_state.get("tileCounts", {}),
		"pathLookup": ground_state.get("pathLookup", {}),
		"plazaLookup": ground_state.get("plazaLookup", {}),
		"encounterLookup": ground_state.get("encounterLookup", {}),
		"warpLookup": ground_state.get("warpLookup", {}),
		"blockedLookup": ground_state.get("blockedLookup", {}),
		"protectedLookup": protected_lookup,
		"objectDrawsByLayer": object_draws_by_layer,
		"objectCount": _object_draw_count(object_draws_by_layer),
		"groundRules": ground_rules.duplicate(true),
	}


static func prepared_tile_id(prepared: Dictionary, cell: Vector2i) -> String:
	if not bool(prepared.get("active", false)):
		return ""
	var lookup := prepared.get("tileIdsByCell", {}) as Dictionary
	return str(lookup.get(IsoMapModel.cell_key(cell), ""))


static func prepared_objects(prepared: Dictionary, render_layer: String = "world") -> Array[Dictionary]:
	if not bool(prepared.get("active", false)) or not RENDER_LAYERS.has(render_layer):
		return []
	var by_layer := prepared.get("objectDrawsByLayer", {}) as Dictionary
	var value: Variant = by_layer.get(render_layer, [])
	return value as Array[Dictionary] if value is Array else []


static func _ensure_catalog_loaded() -> void:
	if _catalog_loaded:
		return
	_catalog_loaded = true
	var catalog := _read_json_cached(DATA_PATH, _catalog_errors, "地图视觉 catalog")
	if catalog.is_empty():
		return
	if int(catalog.get("schemaVersion", 0)) != SCHEMA_VERSION:
		_catalog_errors.append("地图视觉 catalog schemaVersion 必须为 1")
	var entries_value: Variant = catalog.get("entries", [])
	if not (entries_value is Array):
		_catalog_errors.append("地图视觉 catalog.entries 必须是数组")
		return
	for index in range((entries_value as Array).size()):
		var value: Variant = (entries_value as Array)[index]
		if not (value is Dictionary):
			_catalog_errors.append("地图视觉 catalog entry[%d] 必须是对象" % index)
			continue
		var entry := value as Dictionary
		var map_id := str(entry.get("mapId", ""))
		var manifest_path := str(entry.get("bundleManifest", ""))
		var binding_path := str(entry.get("bindingPath", ""))
		if map_id == "" or _entries_by_map_id.has(map_id):
			_catalog_errors.append("地图视觉 catalog mapId 缺失或重复：%s" % map_id)
			continue
		if not _is_resource_path(manifest_path) or not _is_resource_path(binding_path):
			_catalog_errors.append("地图视觉 catalog 路径必须是 res://：%s" % map_id)
			continue
		_entries_by_map_id[map_id] = entry.duplicate(true)


static func _contract_for_map(map_id: String, errors: Array[String]) -> Dictionary:
	if _contract_cache.has(map_id):
		var cached := _contract_cache.get(map_id, {}) as Dictionary
		errors.append_array(cached.get("errors", []) as Array[String])
		return cached.get("contract", {}) as Dictionary
	var contract_errors: Array[String] = []
	var entry := _entries_by_map_id.get(map_id, {}) as Dictionary
	var manifest_path := str(entry.get("bundleManifest", ""))
	var binding_path := str(entry.get("bindingPath", ""))
	var manifest := _read_json_cached(manifest_path, contract_errors, "地图视觉 manifest")
	var binding := _read_json_cached(binding_path, contract_errors, "地图视觉 binding")
	var bundle_root := manifest_path.get_base_dir()
	if not manifest.is_empty():
		_validate_manifest_for_map(manifest, map_id, contract_errors)
	if not binding.is_empty():
		_validate_binding_identity(binding, manifest, map_id, contract_errors)
	if not manifest.is_empty() and not binding.is_empty():
		_validate_manifest_binding_reference(manifest, bundle_root, binding_path, map_id, contract_errors)
	var contract: Dictionary = {}
	if contract_errors.is_empty():
		contract = {
			"entry": entry.duplicate(true),
			"manifest": manifest,
			"binding": binding,
			"bundleRoot": bundle_root,
		}
	_contract_cache[map_id] = {"contract": contract, "errors": contract_errors.duplicate()}
	errors.append_array(contract_errors)
	return contract


static func _validate_manifest_for_map(manifest: Dictionary, map_id: String, errors: Array[String]) -> void:
	if int(manifest.get("schemaVersion", 0)) != SCHEMA_VERSION:
		errors.append("地图视觉 manifest schemaVersion 必须为 1：%s" % map_id)
	if str(manifest.get("bundleId", "")) == "" or str(manifest.get("mapStyleId", "")) == "":
		errors.append("地图视觉 manifest 缺少 bundleId/mapStyleId：%s" % map_id)
	var map_ids: Array = manifest.get("mapIds", [])
	if not map_ids.has(map_id):
		errors.append("地图视觉 manifest 未声明 mapId：%s" % map_id)
	if _vector2i_from_value(manifest.get("tileSize"), Vector2i.ZERO) != TILE_SIZE:
		errors.append("地图视觉 manifest tileSize 必须为 80x40：%s" % map_id)
	var source := manifest.get("source", {}) as Dictionary
	if bool(source.get("mirrored", false)) or bool(source.get("bakedActors", false)):
		errors.append("地图视觉禁止镜像或烘焙角色：%s" % map_id)


static func _validate_binding_identity(
	binding: Dictionary,
	manifest: Dictionary,
	map_id: String,
	errors: Array[String]
) -> void:
	if int(binding.get("schemaVersion", 0)) != SCHEMA_VERSION:
		errors.append("地图视觉 binding schemaVersion 必须为 1：%s" % map_id)
	if str(binding.get("mapId", "")) != map_id:
		errors.append("地图视觉 binding mapId 不一致：%s" % map_id)
	if str(binding.get("bundleId", "")) != str(manifest.get("bundleId", "")):
		errors.append("地图视觉 binding bundleId 不一致：%s" % map_id)
	if not (binding.get("ground", {}) is Dictionary):
		errors.append("地图视觉 binding 缺少 ground：%s" % map_id)
	if not (binding.get("objectPlacements", []) is Array):
		errors.append("地图视觉 binding.objectPlacements 必须是数组：%s" % map_id)


static func _validate_manifest_binding_reference(
	manifest: Dictionary,
	bundle_root: String,
	binding_path: String,
	map_id: String,
	errors: Array[String]
) -> void:
	var found := false
	for value in manifest.get("mapBindings", []):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if str(item.get("mapId", "")) != map_id:
			continue
		var binding_ref := item.get("binding", {}) as Dictionary
		var declared := _resolve_bundle_path(bundle_root, str(binding_ref.get("path", "")))
		found = declared == binding_path.simplify_path()
		break
	if not found:
		errors.append("地图视觉 manifest 与 catalog binding 路径不一致：%s" % map_id)


static func _access_allowed(manifest: Dictionary, qa_preview: bool, errors: Array[String]) -> bool:
	var status := str(manifest.get("status", ""))
	var review := str(manifest.get("ownerReviewStatus", ""))
	if typeof(manifest.get("releaseApproved")) != TYPE_BOOL:
		errors.append("地图视觉 releaseApproved 必须是布尔值")
		return false
	if typeof(manifest.get("runtimeEnabled")) != TYPE_BOOL:
		errors.append("地图视觉 runtimeEnabled 必须是布尔值")
		return false
	var release_approved := bool(manifest.get("releaseApproved", false))
	var runtime_enabled := bool(manifest.get("runtimeEnabled", false))
	var released := (
		status == STATUS_RELEASED
		and review == OWNER_REVIEW_APPROVED
		and release_approved
		and runtime_enabled
	)
	if released:
		return true
	if not qa_preview or not OS.is_debug_build():
		return false
	var pending := (
		status == STATUS_OWNER_REVIEW_PENDING
		and review == OWNER_REVIEW_PENDING
		and not release_approved
		and not runtime_enabled
	)
	if not pending:
		errors.append("地图视觉生命周期门禁组合无效")
	return pending


static func _tile_rects_for_manifest(
	manifest: Dictionary,
	atlas_dimensions: Vector2i,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	var tiles_value: Variant = manifest.get("tiles", [])
	if not (tiles_value is Array) or (tiles_value as Array).is_empty():
		errors.append("地图视觉 manifest.tiles 必须是非空数组")
		return result
	for value in tiles_value as Array:
		if not (value is Dictionary):
			errors.append("地图视觉 tile 必须是对象")
			continue
		var tile := value as Dictionary
		var tile_id := str(tile.get("tileId", ""))
		var rect := _rect2i_from_value(tile.get("rect"))
		if tile_id == "" or result.has(tile_id):
			errors.append("地图视觉 tileId 缺失或重复：%s" % tile_id)
			continue
		if rect.size != TILE_SIZE or rect.position.x < 0 or rect.position.y < 0:
			errors.append("地图视觉 tile rect 必须是 atlas 内 80x40：%s" % tile_id)
			continue
		if rect.end.x > atlas_dimensions.x or rect.end.y > atlas_dimensions.y:
			errors.append("地图视觉 tile rect 超出 atlas：%s" % tile_id)
			continue
		result[tile_id] = Rect2(rect)
	return result


static func _validate_ground_tile_ids(
	ground: Dictionary,
	tile_rects: Dictionary,
	errors: Array[String]
) -> void:
	var keys: Array[String] = [
		"defaultTileId",
		"blockedTileId",
		"encounterTileId",
		"warpTileId",
		"pathTileId",
		"plazaTileId",
	]
	for key in keys:
		var tile_id := str(ground.get(key, ""))
		if tile_id == "" or not tile_rects.has(tile_id):
			errors.append("地图视觉 ground.%s 未解析到 tile：%s" % [key, tile_id])


static func _build_ground_state(
	map_data: Dictionary,
	ground: Dictionary,
	tile_rects: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var grid_size := IsoMapModel.grid_size(map_data)
	var default_tile_id := str(ground.get("defaultTileId", ""))
	var overrides: Dictionary = {}
	for value in ground.get("overrides", []):
		if not (value is Dictionary):
			errors.append("地图视觉 ground override 必须是对象")
			continue
		var item := value as Dictionary
		var cell := _vector2i_from_value(item.get("grid"), Vector2i(-1, -1))
		var tile_id := str(item.get("tileId", ""))
		if not _cell_in_size(cell, grid_size) or not tile_rects.has(tile_id):
			errors.append("地图视觉 ground override 越界或 tileId 无效：%s" % str(item))
			continue
		overrides[IsoMapModel.cell_key(cell)] = tile_id

	var path_lookup := _build_path_lookup(map_data, ground, errors)
	var plaza_lookup := _build_plaza_lookup(ground, grid_size, errors)
	var encounter_lookup := _build_encounter_lookup(map_data)
	var warp_lookup := _build_warp_lookup(map_data)
	# Only the authoritative static blockedCells select blocked terrain art.
	# Interaction blockers (NPCs, signs, record points) keep the surrounding
	# plaza/encounter material and remain independently rendered actors.
	var blocked_lookup: Dictionary = IsoMapModel.blocked_lookup(map_data)

	var tile_ids_by_cell: Dictionary = {}
	var tile_counts: Dictionary = {}
	for y in range(grid_size.y):
		for x in range(grid_size.x):
			var cell := Vector2i(x, y)
			var key := IsoMapModel.cell_key(cell)
			var tile_id := str(overrides.get(key, default_tile_id))
			# Semantic ground wins over cosmetic overrides in this exact order.
			if path_lookup.has(key):
				tile_id = str(ground.get("pathTileId", tile_id))
			if plaza_lookup.has(key):
				tile_id = str(ground.get("plazaTileId", tile_id))
			if encounter_lookup.has(key):
				tile_id = str(ground.get("encounterTileId", tile_id))
			if blocked_lookup.has(key):
				tile_id = str(ground.get("blockedTileId", tile_id))
			if warp_lookup.has(key):
				tile_id = str(ground.get("warpTileId", tile_id))
			if not tile_rects.has(tile_id):
				errors.append("地图视觉格子未解析到 tile：%s/%s" % [key, tile_id])
				continue
			tile_ids_by_cell[key] = tile_id
			tile_counts[tile_id] = int(tile_counts.get(tile_id, 0)) + 1
	return {
		"tileIdsByCell": tile_ids_by_cell,
		"tileCounts": tile_counts,
		"pathLookup": path_lookup,
		"plazaLookup": plaza_lookup,
		"encounterLookup": encounter_lookup,
		"warpLookup": warp_lookup,
		"blockedLookup": blocked_lookup,
	}


static func _build_path_lookup(
	map_data: Dictionary,
	ground: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	var dilation := clampi(int(ground.get("pathDilation", 0)), 0, 3)
	var links_value: Variant = ground.get("pathLinks", [])
	if not (links_value is Array):
		errors.append("地图视觉 ground.pathLinks 必须是数组")
		return result
	for index in range((links_value as Array).size()):
		var value: Variant = (links_value as Array)[index]
		if not (value is Dictionary):
			errors.append("地图视觉 pathLinks[%d] 必须是对象" % index)
			continue
		var link := value as Dictionary
		var start := _vector2i_from_value(link.get("from"), Vector2i(-1, -1))
		var goal := _vector2i_from_value(link.get("to"), Vector2i(-1, -1))
		if (
			not IsoMapModel.is_inside(map_data, start)
			or not IsoMapModel.is_inside(map_data, goal)
			or not IsoMapModel.is_walkable(map_data, start)
			or not IsoMapModel.is_walkable(map_data, goal)
			or start == goal
		):
			errors.append("地图视觉 pathLinks[%d] 起终点无效或不可行走" % index)
			continue
		var path := IsoMapModel.find_path(map_data, start, goal)
		if not _path_reaches_exact(path, start, goal, true):
			errors.append(
				"地图视觉 pathLinks[%d] 未严格到达声明起终点：%s -> %s"
				% [index, IsoMapModel.cell_key(start), IsoMapModel.cell_key(goal)]
			)
			continue
		for path_cell in path:
			for dy in range(-dilation, dilation + 1):
				for dx in range(-dilation, dilation + 1):
					var cell := path_cell + Vector2i(dx, dy)
					if IsoMapModel.is_inside(map_data, cell):
						result[IsoMapModel.cell_key(cell)] = true
	return result


static func _build_plaza_lookup(
	ground: Dictionary,
	grid_size: Vector2i,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {}
	for value in ground.get("plazaRects", []):
		var rect := _rect2i_from_value(value)
		if rect.size.x <= 0 or rect.size.y <= 0 or rect.position.x < 0 or rect.position.y < 0:
			errors.append("地图视觉 plazaRects 包含无效区域")
			continue
		if rect.end.x > grid_size.x or rect.end.y > grid_size.y:
			errors.append("地图视觉 plazaRects 越界")
			continue
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				result[IsoMapModel.cell_key(Vector2i(x, y))] = true
	for value in ground.get("plazaCells", []):
		var cell := _vector2i_from_value(value, Vector2i(-1, -1))
		if not _cell_in_size(cell, grid_size):
			errors.append("地图视觉 plazaCells 越界")
			continue
		result[IsoMapModel.cell_key(cell)] = true
	return result


static func _build_encounter_lookup(map_data: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	var grid_size := IsoMapModel.grid_size(map_data)
	for zone_value in map_data.get("encounterZones", []):
		if not (zone_value is Dictionary):
			continue
		var zone := zone_value as Dictionary
		if EncounterModel.is_manual_only(zone):
			continue
		for cell in EncounterModel.cells_for_zone(zone):
			if _cell_in_size(cell, grid_size) and IsoMapModel.is_walkable(map_data, cell):
				result[IsoMapModel.cell_key(cell)] = true
	return result


static func _build_warp_lookup(map_data: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for value in map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		if str(item.get("kind", "")) != "warp":
			continue
		var cell := _vector2i_from_value(item.get("cell"), Vector2i(-1, -1))
		if IsoMapModel.is_inside(map_data, cell):
			result[IsoMapModel.cell_key(cell)] = true
	return result


static func _build_protected_lookup(
	map_data: Dictionary,
	path_lookup: Dictionary,
	encounter_lookup: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var result := path_lookup.duplicate()
	for key_value in encounter_lookup.keys():
		result[str(key_value)] = true
	var spawn_cell := IsoMapModel.spawn_cell(map_data)
	if IsoMapModel.is_inside(map_data, spawn_cell):
		result[IsoMapModel.cell_key(spawn_cell)] = true
	var spawn_points := map_data.get("spawnPoints", {}) as Dictionary
	for value in spawn_points.values():
		var cell := _vector2i_from_value(value, Vector2i(-1, -1))
		if IsoMapModel.is_inside(map_data, cell):
			result[IsoMapModel.cell_key(cell)] = true
	for value in map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var item := value as Dictionary
		var kind := str(item.get("kind", ""))
		if kind != "warp" and kind != "npc":
			continue
		var cell := _vector2i_from_value(item.get("cell"), Vector2i(-1, -1))
		if IsoMapModel.is_inside(map_data, cell):
			result[IsoMapModel.cell_key(cell)] = true
		else:
			errors.append("权威 interaction 源格越界：%s" % str(item.get("id", "")))
			continue
		if kind == "warp":
			_validate_warp_contract(item, map_data, errors)
			continue
		var approaches := _reachable_npc_approaches(map_data, item)
		if approaches.is_empty():
			errors.append("NPC interaction 没有从默认出生点可达的 approach 邻格：%s" % str(item.get("id", "")))
			continue
		for approach in approaches:
			result[IsoMapModel.cell_key(approach)] = true
	return result


static func _validate_warp_contract(
	item: Dictionary,
	map_data: Dictionary,
	errors: Array[String]
) -> void:
	var warp_id := str(item.get("id", ""))
	var source := _vector2i_from_value(item.get("cell"), Vector2i(-1, -1))
	if warp_id == "" or not IsoMapModel.is_inside(map_data, source) or not IsoMapModel.is_walkable(map_data, source):
		errors.append("warp source 无效或不可行走：%s" % warp_id)
		return
	var target_map_id := str(item.get("toMap", ""))
	var target_spawn := str(item.get("toSpawn", ""))
	var target_path := MapDataCatalog.path_for(target_map_id)
	if target_map_id == "" or target_path == "":
		errors.append("warp targetMapId(toMap) 未注册：%s/%s" % [warp_id, target_map_id])
		return
	var target_map := _read_json_cached(target_path, errors, "warp 目标权威地图 %s" % warp_id)
	if target_map.is_empty() or str(target_map.get("id", "")) != target_map_id:
		errors.append("warp targetMapId(toMap) 与权威地图不一致：%s/%s" % [warp_id, target_map_id])
		return
	var spawn_points_value: Variant = target_map.get("spawnPoints", {})
	if not (spawn_points_value is Dictionary):
		errors.append("warp 目标地图 spawnPoints 无效：%s" % warp_id)
		return
	var spawn_points := spawn_points_value as Dictionary
	if target_spawn == "" or not spawn_points.has(target_spawn):
		errors.append("warp targetSpawn(toSpawn) 不存在：%s/%s" % [warp_id, target_spawn])
		return
	var target_cell := _vector2i_from_value(spawn_points.get(target_spawn), Vector2i(-1, -1))
	if not IsoMapModel.is_inside(target_map, target_cell) or not IsoMapModel.is_walkable(target_map, target_cell):
		errors.append("warp targetSpawn(toSpawn) 越界或不可行走：%s/%s" % [warp_id, target_spawn])


static func _reachable_npc_approaches(map_data: Dictionary, item: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var source := _vector2i_from_value(item.get("cell"), Vector2i(-1, -1))
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


static func _validate_object_definition_collision(
	definition: Dictionary,
	object_id: String,
	errors: Array[String]
) -> void:
	var role := str(definition.get("collisionRole", ""))
	if not COLLISION_ROLES.has(role):
		errors.append("地图视觉 object collisionRole 不在白名单：%s/%s" % [object_id, role])
		return
	var collision_value: Variant = definition.get("collision", {})
	if not (collision_value is Dictionary):
		errors.append("地图视觉 object.collision 必须是对象：%s" % object_id)
		return
	var collision := collision_value as Dictionary
	var mode := str(collision.get("mode", ""))
	var points_value: Variant = collision.get("points", [])
	if not (points_value is Array):
		errors.append("地图视觉 object.collision.points 必须是数组：%s" % object_id)
		return
	var points := points_value as Array
	if role == "blocking" and mode != "polygon":
		errors.append("blocking 地图 object 必须使用 polygon collision：%s" % object_id)
	if (role == "none" or role == "decorative") and (mode != "none" or not points.is_empty()):
		errors.append("none/decorative 地图 object 必须使用空 none collision：%s" % object_id)
	if role == "interaction" and mode != "none" and mode != "polygon":
		errors.append("interaction 地图 object collision 只接受 none/polygon：%s" % object_id)
	if mode == "none" and not points.is_empty():
		errors.append("none collision 不得声明 polygon points：%s" % object_id)
	if mode != "polygon":
		return
	var asset_value: Variant = definition.get("asset", {})
	var dimensions := Vector2i.ZERO
	if asset_value is Dictionary:
		dimensions = _vector2i_from_value((asset_value as Dictionary).get("dimensions"), Vector2i.ZERO)
	if dimensions.x <= 0 or dimensions.y <= 0 or points.size() < 3:
		errors.append("polygon collision 必须有有效贴图尺寸和至少 3 个点：%s" % object_id)
		return
	for index in range(points.size()):
		var point := _vector2_from_value(points[index], Vector2(-1, -1))
		if point.x < 0.0 or point.y < 0.0 or point.x >= dimensions.x or point.y >= dimensions.y:
			errors.append("polygon collision 点超出贴图：%s/%d" % [object_id, index])


static func _find_authoritative_interaction(map_data: Dictionary, interaction_id: String) -> Dictionary:
	for value in map_data.get("interactionPoints", []):
		if value is Dictionary and str((value as Dictionary).get("id", "")) == interaction_id:
			return value as Dictionary
	return {}


static func _validate_interaction_footprint(
	instance_id: String,
	interaction: Dictionary,
	collision_mode: String,
	footprint_keys: Array[String],
	authoritative_blocked: Dictionary,
	errors: Array[String]
) -> void:
	if collision_mode == "none":
		if not footprint_keys.is_empty():
			errors.append("none collision 的 interaction 地图物件必须为空 footprint：%s" % instance_id)
		return
	if collision_mode != "polygon":
		return
	if footprint_keys.is_empty():
		errors.append("polygon collision 的 interaction 地图物件必须有 footprint：%s" % instance_id)
		return
	if not IsoMapModel.interaction_blocks_movement(interaction):
		errors.append("可重叠权威 interaction 不得绑定 polygon collision：%s" % instance_id)
		return
	var interaction_cell := _vector2i_from_value(interaction.get("cell"), Vector2i(-1, -1))
	var interaction_key := IsoMapModel.cell_key(interaction_cell)
	if not footprint_keys.has(interaction_key):
		errors.append("interaction footprint 未包含权威 interaction 源格：%s/%s" % [instance_id, interaction_key])
	for key in footprint_keys:
		if key != interaction_key and not authoritative_blocked.has(key):
			errors.append("interaction footprint 未绑定权威 interaction/blockedCells：%s/%s" % [instance_id, key])


static func _is_stable_id(value: String) -> bool:
	if value == "":
		return false
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if not ((code >= 97 and code <= 122) or (code >= 48 and code <= 57) or code == 95 or code == 45):
			return false
	return true


static func _build_object_draws(
	map_data: Dictionary,
	manifest: Dictionary,
	binding: Dictionary,
	bundle_root: String,
	protected_lookup: Dictionary,
	errors: Array[String]
) -> Dictionary:
	var result: Dictionary = {
		"ground_decal": [] as Array[Dictionary],
		"world": [] as Array[Dictionary],
		"foreground": [] as Array[Dictionary],
	}
	var definitions: Dictionary = {}
	for value in manifest.get("objects", []):
		if not (value is Dictionary):
			errors.append("地图视觉 object 定义必须是对象")
			continue
		var definition := value as Dictionary
		var object_id := str(definition.get("objectId", ""))
		if object_id == "" or definitions.has(object_id):
			errors.append("地图视觉 objectId 缺失或重复：%s" % object_id)
			continue
		definitions[object_id] = definition
		_validate_object_definition_collision(definition, object_id, errors)

	var authoritative_blocked := IsoMapModel.blocked_lookup(map_data)
	var instance_ids: Dictionary = {}
	for value in binding.get("objectPlacements", []):
		if not (value is Dictionary):
			errors.append("地图视觉 objectPlacement 必须是对象")
			continue
		var placement := value as Dictionary
		var instance_id := str(placement.get("instanceId", ""))
		var object_id := str(placement.get("objectId", ""))
		if instance_id == "" or instance_ids.has(instance_id):
			errors.append("地图视觉 instanceId 缺失或重复：%s" % instance_id)
			continue
		instance_ids[instance_id] = true
		if bool(placement.get("mirrored", false)):
			errors.append("地图视觉物件禁止镜像：%s" % instance_id)
			continue
		if not definitions.has(object_id):
			errors.append("地图视觉 objectPlacement 引用未知 objectId：%s" % object_id)
			continue
		var definition := definitions[object_id] as Dictionary
		var cell := _vector2i_from_value(placement.get("grid"), Vector2i(-1, -1))
		if not IsoMapModel.is_inside(map_data, cell):
			errors.append("地图视觉物件锚点越界：%s" % instance_id)
			continue
		var collision_role := str(definition.get("collisionRole", ""))
		if not COLLISION_ROLES.has(collision_role):
			errors.append("地图视觉物件 collisionRole 不在白名单：%s/%s" % [instance_id, collision_role])
		var collision := definition.get("collision", {}) as Dictionary
		var collision_mode := str(collision.get("mode", ""))
		var interaction_link: Variant = placement.get("interactionLink")
		var linked_interaction: Dictionary = {}
		if collision_role == "interaction":
			if not (interaction_link is String) or not _is_stable_id(str(interaction_link)):
				errors.append("interaction 地图物件必须声明合法 interactionLink：%s" % instance_id)
			else:
				linked_interaction = _find_authoritative_interaction(map_data, str(interaction_link))
				if linked_interaction.is_empty():
					errors.append("interactionLink 未绑定当前权威 interaction：%s/%s" % [instance_id, str(interaction_link)])
				elif _vector2i_from_value(linked_interaction.get("cell"), Vector2i(-1, -1)) != cell:
					errors.append("interaction 地图物件锚点与权威 interaction 源格不一致：%s" % instance_id)
		elif interaction_link != null:
			errors.append("非 interaction 地图物件的 interactionLink 必须为 null：%s" % instance_id)

		var footprint_keys: Array[String] = []
		var footprint_value_raw: Variant = placement.get("collisionFootprint", [])
		if not (footprint_value_raw is Array):
			errors.append("地图视觉物件 collisionFootprint 必须是数组：%s" % instance_id)
			footprint_value_raw = []
		for footprint_value in footprint_value_raw as Array:
			var footprint_cell := _vector2i_from_value(footprint_value, Vector2i(-1, -1))
			var footprint_key := IsoMapModel.cell_key(footprint_cell)
			if not IsoMapModel.is_inside(map_data, footprint_cell):
				errors.append("地图视觉物件碰撞占地越界：%s/%s" % [instance_id, footprint_key])
				continue
			if footprint_keys.has(footprint_key):
				errors.append("地图视觉物件 collisionFootprint 格子重复：%s/%s" % [instance_id, footprint_key])
				continue
			if collision_role == "blocking":
				if not authoritative_blocked.has(footprint_key):
					errors.append("blocking 地图物件碰撞未绑定权威 blockedCells：%s/%s" % [instance_id, footprint_key])
				if protected_lookup.has(footprint_key):
					errors.append("blocking 地图物件占用了 spawn/warp/NPC approach/主路保护格：%s/%s" % [instance_id, footprint_key])
			footprint_keys.append(footprint_key)
		if collision_role == "blocking" and footprint_keys.is_empty():
			errors.append("blocking 地图物件必须声明 collisionFootprint：%s" % instance_id)
		if (collision_role == "none" or collision_role == "decorative") and not footprint_keys.is_empty():
			errors.append("none/decorative 地图物件不得声明 collisionFootprint：%s" % instance_id)
		if collision_role == "interaction" and not linked_interaction.is_empty():
			_validate_interaction_footprint(
				instance_id,
				linked_interaction,
				collision_mode,
				footprint_keys,
				authoritative_blocked,
				errors
			)

		var display_size := _vector2_from_value(definition.get("displaySize"), Vector2.ZERO)
		var scale := _vector2_from_value(definition.get("scale"), Vector2.ONE)
		var anchor := _vector2_from_value(definition.get("anchor"), Vector2(-1, -1))
		var sort_point := _vector2_from_value(definition.get("sortPoint"), Vector2(-1, -1))
		var offset := _vector2_from_value(placement.get("offset"), Vector2.ZERO)
		var render_layer := str(definition.get("renderLayer", ""))
		if display_size.x <= 0.0 or display_size.y <= 0.0 or scale.x <= 0.0 or scale.y <= 0.0:
			errors.append("地图视觉物件 displaySize/scale 无效：%s" % instance_id)
			continue
		if not _normalized_point(anchor) or not _normalized_point(sort_point):
			errors.append("地图视觉物件 anchor/sortPoint 无效：%s" % instance_id)
			continue
		if not RENDER_LAYERS.has(render_layer):
			errors.append("地图视觉物件 renderLayer 无效：%s" % instance_id)
			continue
		var asset := definition.get("asset", {}) as Dictionary
		var texture_path := _resolve_bundle_path(bundle_root, str(asset.get("path", "")))
		var texture := _load_texture(texture_path, errors, "地图物件 %s" % object_id)
		if texture == null:
			continue
		var declared_dimensions := _vector2i_from_value(asset.get("dimensions"), Vector2i.ZERO)
		if Vector2i(texture.get_size()) != declared_dimensions:
			errors.append("地图视觉物件贴图尺寸与 manifest 不一致：%s" % object_id)
			continue

		var draw_size := display_size * scale
		var contact_point := IsoMapModel.grid_to_world(map_data, cell) + offset
		var draw_rect := Rect2(contact_point - draw_size * anchor, draw_size)
		var source_sort_y := draw_rect.position.y + draw_size.y * sort_point.y
		var sort_offset := int((definition.get("sort", {}) as Dictionary).get("offset", 0))
		var command := {
			"instanceId": instance_id,
			"objectId": object_id,
			"grid": cell,
			"texture": texture,
			"drawRect": draw_rect,
			"contactPoint": contact_point,
			"sortKey": source_sort_y + float(sort_offset),
			"renderLayer": render_layer,
			"collisionRole": collision_role,
			"collisionFootprint": footprint_keys,
			"interactionLink": interaction_link,
		}
		(result[render_layer] as Array[Dictionary]).append(command)
	for layer in RENDER_LAYERS:
		(result[layer] as Array[Dictionary]).sort_custom(_object_draw_less)
	return result


static func _object_draw_less(a: Dictionary, b: Dictionary) -> bool:
	var delta := float(a.get("sortKey", 0.0)) - float(b.get("sortKey", 0.0))
	if absf(delta) > 0.01:
		return delta < 0.0
	return str(a.get("instanceId", "")) < str(b.get("instanceId", ""))


static func _object_draw_count(by_layer: Dictionary) -> int:
	var count := 0
	for layer in RENDER_LAYERS:
		count += (by_layer.get(layer, []) as Array).size()
	return count


static func _read_json_cached(path: String, errors: Array[String], label: String) -> Dictionary:
	if _json_cache.has(path):
		return _json_cache.get(path, {}) as Dictionary
	if not _is_resource_path(path) or not FileAccess.file_exists(path):
		errors.append("%s 文件不存在：%s" % [label, path])
		return {}
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if not (parsed is Dictionary):
		errors.append("%s 不是有效 JSON 对象：%s" % [label, path])
		return {}
	_json_cache[path] = parsed
	_json_load_count += 1
	return parsed as Dictionary


static func _load_texture(path: String, errors: Array[String], label: String) -> Texture2D:
	if _texture_cache.has(path):
		return _texture_cache.get(path) as Texture2D
	if not _is_resource_path(path):
		errors.append("%s 贴图不存在：%s" % [label, path])
		return null
	var texture: Texture2D = null
	if ResourceLoader.exists(path, "Texture2D"):
		var resource := ResourceLoader.load(path, "Texture2D")
		if resource is Texture2D:
			texture = resource as Texture2D
	if texture == null:
		# A clean source checkout may not have editor-generated .import metadata
		# yet. Keep exports on ResourceLoader, but let source QA decode the exact
		# frozen PNG without requiring generated files in version control.
		if not FileAccess.file_exists(path):
			errors.append("%s 贴图不存在：%s" % [label, path])
			return null
		var image := Image.new()
		var load_error := image.load(path)
		if load_error != OK or image.is_empty():
			errors.append("%s PNG 解码失败（%s）：%s" % [label, error_string(load_error), path])
			return null
		texture = ImageTexture.create_from_image(image)
		if texture == null:
			errors.append("%s 无法创建 Texture2D：%s" % [label, path])
			return null
		_image_fallback_load_count += 1
	_texture_cache[path] = texture
	_texture_load_count += 1
	return texture


static func _resolve_bundle_path(bundle_root: String, relative_path: String) -> String:
	if bundle_root == "" or relative_path == "" or relative_path.begins_with("res://"):
		return ""
	var root := bundle_root.simplify_path()
	var resolved := root.path_join(relative_path).simplify_path()
	if not resolved.begins_with(root + "/"):
		return ""
	return resolved


static func _is_resource_path(path: String) -> bool:
	return path.begins_with("res://") and path.simplify_path() == path


static func _vector2i_from_value(value: Variant, fallback: Vector2i) -> Vector2i:
	if not (value is Array) or (value as Array).size() != 2:
		return fallback
	var parts := value as Array
	if not (parts[0] is int or parts[0] is float) or not (parts[1] is int or parts[1] is float):
		return fallback
	return Vector2i(int(parts[0]), int(parts[1]))


static func _vector2_from_value(value: Variant, fallback: Vector2) -> Vector2:
	if not (value is Array) or (value as Array).size() != 2:
		return fallback
	var parts := value as Array
	if not (parts[0] is int or parts[0] is float) or not (parts[1] is int or parts[1] is float):
		return fallback
	return Vector2(float(parts[0]), float(parts[1]))


static func _rect2i_from_value(value: Variant) -> Rect2i:
	if not (value is Array) or (value as Array).size() != 4:
		return Rect2i()
	var parts := value as Array
	for part in parts:
		if not (part is int or part is float):
			return Rect2i()
	return Rect2i(int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3]))


static func _cell_in_size(cell: Vector2i, grid_size: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < grid_size.x and cell.y < grid_size.y


static func _normalized_point(point: Vector2) -> bool:
	return point.x >= 0.0 and point.y >= 0.0 and point.x <= 1.0 and point.y <= 1.0
