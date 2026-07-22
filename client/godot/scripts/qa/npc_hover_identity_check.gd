extends SceneTree

const IsoMapModel := preload("res://scripts/world/isometric_map_model.gd")
const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const NpcArtCatalog := preload("res://scripts/world/npc_art_catalog.gd")
const NpcHoverIdentityPresenter := preload("res://scripts/ui/npc_hover_identity_presenter.gd")

const MAP_PATH := "res://data/firebud_village_gate_map.json"


func _initialize() -> void:
	var failures: Array[String] = []
	var map_data := IsoMapModel.load_map(MAP_PATH)
	if map_data.is_empty():
		failures.append("火芽村地图加载失败")
		_finish(failures)
		return

	var bank := InteractionModel.find_by_id(map_data, "firebud_bank_keeper")
	var guard := InteractionModel.find_by_id(map_data, "village_guard")
	var record_point := InteractionModel.find_by_id(map_data, "firebud_record_pillar")
	if NpcHoverIdentityPresenter.identity_text_for(bank) != "银行管理员：阿衡":
		failures.append("银行管理员身份文字不正确")
	if NpcHoverIdentityPresenter.identity_text_for(guard) != "村口守望者":
		failures.append("无个人名 NPC 未回退完整姓名")
	if InteractionModel.world_marker_label_for(bank) != "":
		failures.append("NPC 头顶常驻设施标签未关闭")
	if InteractionModel.world_marker_label_for(record_point) != "记录":
		failures.append("非 NPC 记录点标签被误关")

	NpcArtCatalog.initialize()
	NpcArtCatalog.warm_appearance(str(bank.get("appearanceId", "")))
	var bank_marker := InteractionModel.marker_world_position(map_data, bank)
	var bank_texture := NpcArtCatalog.world_texture_for_instance(bank)
	var bank_face_point := bank_marker
	var bank_draw_rect := Rect2()
	if bank_texture != null:
		bank_draw_rect = NpcArtCatalog.world_draw_rect_for_instance(bank, bank_marker, bank_texture)
		bank_face_point = Vector2(bank_draw_rect.get_center().x, bank_draw_rect.position.y + bank_draw_rect.size.y * 0.32)
	var root_control := Control.new()
	get_root().add_child(root_control)
	var presenter := NpcHoverIdentityPresenter.new()
	presenter.build(root_control)
	presenter.configure_map(map_data)
	if presenter.cached_npc_count() != 14:
		failures.append("NPC 悬停命中缓存数量不正确")
	var hovered_bank := presenter.npc_at_world_point(bank_face_point)
	if str(hovered_bank.get("id", "")) != "firebud_bank_keeper":
		failures.append("正式 NPC 脸部悬停未命中银行管理员")
	var transparent_canvas_ignored := false
	if bank_texture != null and bank_draw_rect.size.x > 0.0:
		var image := bank_texture.get_image()
		if image != null and not image.is_empty():
			var image_size := image.get_size()
			var candidates: Array[Vector2i] = [
				Vector2i(1, 1),
				Vector2i(image_size.x - 2, 1),
				Vector2i(1, image_size.y - 2),
				Vector2i(image_size.x - 2, image_size.y - 2),
			]
			for pixel in candidates:
				if image.get_pixel(pixel.x, pixel.y).a > 0.08:
					continue
				var canvas_point := bank_draw_rect.position + Vector2(
					(float(pixel.x) + 0.5) / float(image_size.x) * bank_draw_rect.size.x,
					(float(pixel.y) + 0.5) / float(image_size.y) * bank_draw_rect.size.y
				)
				if presenter.npc_at_world_point(canvas_point).is_empty():
					transparent_canvas_ignored = true
					break
	if not transparent_canvas_ignored:
		failures.append("正式 NPC 透明画布仍会吞掉空地命中")
	var marker_slop_point := Vector2.ZERO
	var marker_slop_found := false
	for offset_y in range(-32, 17, 4):
		for offset_x in range(-32, 33, 4):
			var offset := Vector2(float(offset_x), float(offset_y))
			if offset.length() > 32.0:
				continue
			var candidate: Vector2 = bank_marker + offset
			if presenter.npc_at_world_point(candidate).is_empty():
				marker_slop_point = candidate
				marker_slop_found = true
				break
		if marker_slop_found:
			break
	if not marker_slop_found:
		failures.append("银行管理员 34px 旧圆形范围内没有释放可移动空地")
	else:
		var marker_slop_fallback := InteractionModel.find_at_world_point(map_data, marker_slop_point, 34.0, false)
		if str(marker_slop_fallback.get("kind", "")) == "npc":
			failures.append("非 NPC 回退解析仍会重新命中 NPC")
	presenter.layout(Vector2(1280, 720), Rect2(18, 18, 520, 56))
	if not presenter.show_item(bank) or not presenter.is_visible():
		failures.append("悬停身份条未显示")
	if presenter.label == null or presenter.label.text != "银行管理员：阿衡":
		failures.append("悬停身份条文字未绑定")
	if presenter.panel == null or presenter.panel.position != Vector2(430, 82):
		failures.append("悬停身份条未位于顶部中央")
	presenter.clear()
	if presenter.is_visible() or presenter.current_identity_text != "":
		failures.append("鼠标移出后身份条未隐藏")
	if presenter.clear():
		failures.append("重复清理隐藏身份条仍触发 UI 写入")

	_finish(failures)


func _finish(failures: Array[String]) -> void:
	if failures.is_empty():
		print("npc hover identity check ready: status=ok text=银行管理员：阿衡 top_center=true leave_hidden=true")
		quit(0)
		return
	for failure in failures:
		push_error(failure)
	print("npc hover identity check ready: status=failed errors=%s" % "；".join(failures))
	quit(1)
