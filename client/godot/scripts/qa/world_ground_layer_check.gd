extends RefCounted

const GroundMesh := preload("res://scripts/world/map_ground_mesh.gd")
const GroundLayer := preload("res://scripts/world/world_ground_layer.gd")
const MAPS: Array[String] = ["earth_vein_cave", "earth_vein_cave_f2", "earth_vein_cave_f3", "earth_vein_cave_f4"]


static func run(host: Node) -> Dictionary:
	var errors: Array[String] = []
	_append_mesh_contract_errors(errors)
	var original_map: String = host.current_map_id
	var original_preview: bool = host.map_art_review_preview
	var layer: Node2D = host.world_ground_layer
	if layer == null:
		return {"result": "FAIL", "errors": ["静态地面图层未创建"]}
	var layer_id := layer.get_instance_id()
	var counts := {"ground": 0, "main": 0}
	var ground_listener := func() -> void: counts.ground += 1
	var main_listener := func() -> void: counts.main += 1
	layer.draw.connect(ground_listener)
	host.draw.connect(main_listener)
	host.map_art_review_preview = true
	var map_rows: Array[Dictionary] = []
	for map_id in MAPS:
		var before: int = counts.ground
		var loaded: bool = host._load_map(map_id)
		await _settle(host)
		var active: bool = loaded and layer.has_ground() and layer.visible and counts.ground > before
		var mesh: ArrayMesh = layer.get("_ground_mesh")
		var meshed := mesh != null and mesh.get_surface_count() == 1
		map_rows.append({"mapId": map_id, "active": active, "meshed": meshed})
		if not meshed:
			errors.append("正式地面未构建缓存几何：%s" % map_id)
		if not active:
			errors.append("切图后地面未重建：%s" % map_id)
		if layer.get_instance_id() != layer_id or not layer.show_behind_parent or layer.get_parent() != host:
			errors.append("地面必须复用图层并位于 Main 动态反馈下方")
	var ground_before: int = counts.ground
	var retained_mesh: ArrayMesh = layer.get("_ground_mesh")
	var main_before: int = counts.main
	for index in range(8):
		host.queue_redraw()
		await _settle(host)
	var retained := int(counts.ground) == ground_before and int(counts.main) >= main_before + 8
	if not retained:
		errors.append("动态世界重绘重复提交了静态地面")
	# Reconfiguring the same revision does not discard retained draw commands.
	host._sync_world_visual_layers(true)
	await _settle(host)
	if int(counts.ground) != ground_before or layer.get("_ground_mesh") != retained_mesh:
		errors.append("同一地图修订重复重建地面")
	var original_rect: Rect2 = layer.get("_background_rect")
	layer.set_background_rect(original_rect.grow(1.0))
	await _settle(host)
	var resized := int(counts.ground) == ground_before + 1
	layer.set_background_rect(original_rect)
	await _settle(host)
	if not resized or layer.get("_ground_mesh") != retained_mesh:
		errors.append("背景范围改变未刷新静态图层")
	# Visibility uses the existing world contract; no battle simulation is
	# needed to verify the immediate layer transition.
	var was_battle: bool = host.battle_active
	host.battle_active = true
	host._sync_world_layer_visibility()
	var battle_hidden := not layer.visible
	host._end_battle(false)
	var battle_restored := layer.visible
	host.battle_active = was_battle
	var was_map_visible: bool = host.map_panel.visible
	host.map_panel.visible = true
	host._sync_world_layer_visibility()
	var map_hidden := not layer.visible
	host.map_panel.visible = was_map_visible
	host._layout_hud()
	var map_restored := layer.visible
	if not battle_hidden or not battle_restored or not map_hidden or not map_restored:
		errors.append("战斗／全屏地图的地面显隐不一致")
	host.map_art_review_preview = false
	host._load_map("firebud_training_yard")
	await _settle(host)
	var fallback: bool = not layer.has_ground() and not layer.visible and layer.get("_ground_mesh") == null
	if not fallback:
		errors.append("未开放地图仍残留候选地面")
	layer.draw.disconnect(ground_listener)
	host.draw.disconnect(main_listener)
	host.map_art_review_preview = original_preview
	host._load_map(original_map)
	await _settle(host)
	return {"result": "PASS" if errors.is_empty() else "FAIL", "maps": map_rows,
		"dynamicRedraws": int(counts.main) - main_before, "groundRetained": retained, "backgroundResized": resized,
		"battleHidden": battle_hidden, "battleRestoredImmediately": battle_restored,
		"mapHidden": map_hidden, "mapRestoredImmediately": map_restored,
		"fallbackCleared": fallback, "errors": errors}


static func _settle(host: Node) -> void:
	for frame in range(3):
		await host.get_tree().process_frame


static func _append_mesh_contract_errors(errors: Array[String]) -> void:
	var atlas := ImageTexture.create_from_image(Image.create(16, 32, false, Image.FORMAT_RGBA8))
	var edge := {"destination": Rect2(10, 10, 4, 6), "source": Rect2(0, 0, 4, 8)}
	var base := {"destination": Rect2(11, 10, 4, 6), "source": Rect2(4, 8, 4, 8)}
	var overlay := {"destination": Rect2(12, 10, 4, 6), "source": Rect2(8, 16, 4, 8)}
	var legacy := {"destination": Rect2(13, 10, 4, 6), "source": Rect2(12, 24, 4, 8)}
	var prepared := {"active": true, "atlasTexture": atlas, "groundRenderMode": "layered_semantic_overlay",
		"edgeGroundDraws": [null, edge], "baseGroundDraws": [base, {"source": "invalid"}],
		"overlayGroundDraws": [overlay], "groundDraws": [legacy]}
	var original := prepared.duplicate(true)
	var mesh := GroundMesh.build(prepared)
	if mesh == null or mesh.get_surface_count() != 1:
		errors.append("地面几何没有保留有效分层命令")
		return
	var arrays := mesh.surface_get_arrays(0)
	var vertices: PackedVector2Array = arrays[Mesh.ARRAY_VERTEX]
	var uvs: PackedVector2Array = arrays[Mesh.ARRAY_TEX_UV]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	if vertices.size() != 12 or indices.size() != 18:
		errors.append("地面几何重复绘制 legacy 层或未跳过无效类型")
	elif vertices[0] != Vector2(10, 10) or vertices[4] != Vector2(11, 10) or vertices[8] != Vector2(12, 10):
		errors.append("地面边缘／基础／覆盖层叠放顺序改变")
	elif uvs[4] != Vector2(0.25, 0.25) or uvs[8] != Vector2(0.5, 0.5) or uvs[10] != Vector2(0.75, 0.75):
		errors.append("非正方形图集的地面 UV 区域改变")
	prepared["groundRenderMode"] = ""
	var flat := GroundMesh.build(prepared)
	if flat == null or flat.surface_get_array_len(0) != 8:
		errors.append("普通地面模式没有保留边缘与 groundDraws")
	else:
		var flat_vertices: PackedVector2Array = flat.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		if flat_vertices[4] != Vector2(13, 10):
			errors.append("普通地面模式错误使用了分层地块")
	prepared["groundRenderMode"] = "layered_semantic_overlay"
	if prepared != original:
		errors.append("地面几何构建修改了输入命令")
	var layer := GroundLayer.new()
	layer.configure(prepared, 1, Rect2(0, 0, 100, 100))
	for patch in [{"destination": Rect2(0, 0, -4, 6)}, {"source": Rect2(-1, 0, 4, 8)},
		{"source": Rect2(0, 0, 17, 32)}, {"destination": Rect2(INF, 0, 4, 6)}]:
		var unusual := original.duplicate(true)
		unusual.baseGroundDraws[0].merge(patch, true)
		if GroundMesh.build(unusual) != null:
			errors.append("特殊裁切／翻转矩形未交回原绘制器")
		layer.configure(unusual, int(layer.get("_revision")) + 1, Rect2(0, 0, 100, 100))
		if not layer.has_ground() or layer.get("_ground_mesh") != null:
			errors.append("特殊矩形的兼容绘制回退失效")
	layer.free()
	var disabled := original.duplicate(true)
	disabled["active"] = false
	if GroundMesh.build(disabled) != null or GroundMesh.build({}) != null:
		errors.append("未启用地面错误创建了几何资源")
	var sub_texture := AtlasTexture.new()
	sub_texture.atlas = atlas
	sub_texture.region = Rect2(4, 8, 4, 8)
	if GroundMesh.build({"active": true, "atlasTexture": sub_texture,
		"groundDraws": [{"destination": Rect2(0, 0, 4, 8), "source": Rect2(0, 0, 4, 8)}]}) != null:
		errors.append("AtlasTexture 子区域未保留原绘制器的偏移语义")
