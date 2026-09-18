extends RefCounted

const MAPS: Array[String] = ["earth_vein_cave", "earth_vein_cave_f2", "earth_vein_cave_f3", "earth_vein_cave_f4"]


static func run(host: Node) -> Dictionary:
	var errors: Array[String] = []
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
		map_rows.append({"mapId": map_id, "active": active})
		if not active:
			errors.append("切图后地面未重建：%s" % map_id)
		if layer.get_instance_id() != layer_id or not layer.show_behind_parent or layer.get_parent() != host:
			errors.append("地面必须复用图层并位于 Main 动态反馈下方")
	var ground_before: int = counts.ground
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
	if int(counts.ground) != ground_before:
		errors.append("同一地图修订重复重建地面")
	var original_rect: Rect2 = layer.get("_background_rect")
	layer.set_background_rect(original_rect.grow(1.0))
	await _settle(host)
	var resized := int(counts.ground) == ground_before + 1
	layer.set_background_rect(original_rect)
	await _settle(host)
	if not resized:
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
	host._load_map("earth_vein_cave_f2")
	await _settle(host)
	var fallback: bool = not layer.has_ground() and not layer.visible
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
