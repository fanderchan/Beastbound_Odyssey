extends RefCounted

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")


static func run(host: Node) -> Array[String]:
	var errors: Array[String] = []
	var parent := Node2D.new()
	host.add_child(parent)
	var actor = PLAYER_SCENE.instantiate()
	parent.add_child(actor)
	actor.set_process(false)
	actor.set_physics_process(false)
	actor.position = Vector2(100, 200)
	var sprite := actor.get_node("FormalSprite") as Sprite2D
	sprite.transform = Transform2D.IDENTITY
	sprite.centered = false
	var image := Image.create(64, 128, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	var texture := ImageTexture.create_from_image(image)
	sprite.texture = texture
	var source := Rect2i(10, 20, 30, 40)
	var source_key := "%s|%s|%s" % [actor.appearance_id, actor.facing_key, actor.animation_state]
	actor.visual_source_bounds_cache.clear()
	_expect(actor, Rect2(100, 200, 64, 128), "未准备轮廓的保守范围", errors)
	if not actor.visual_source_bounds_cache.is_empty():
		errors.append("人物遮挡查询不得自行读取贴图准备轮廓")
	actor.visual_source_bounds_cache[source_key] = source
	_expect(actor, Rect2(110, 220, 30, 40), "同一动作稍后准备轮廓", errors)
	actor.position.x = 125
	_expect(actor, Rect2(135, 220, 30, 40), "水平移动", errors)
	actor.position.x = 100
	parent.position = Vector2(-10, 5)
	parent.scale = Vector2(2, 0.5)
	_expect(actor, Rect2(210, 115, 60, 20), "父节点位移与非均匀缩放", errors)
	parent.transform = Transform2D.IDENTITY
	actor.scale = Vector2(-1, 2)
	_expect(actor, Rect2(60, 240, 30, 80), "人物反射与缩放", errors)
	actor.scale = Vector2.ONE
	sprite.flip_h = true
	_expect(actor, Rect2(124, 220, 30, 40), "贴图水平翻转", errors)
	sprite.flip_v = true
	_expect(actor, Rect2(124, 268, 30, 40), "贴图垂直翻转", errors)
	sprite.flip_h = false
	sprite.flip_v = false
	sprite.centered = true
	_expect(actor, Rect2(78, 156, 30, 40), "切换居中", errors)
	sprite.centered = false
	sprite.offset = Vector2(7, -9)
	_expect(actor, Rect2(117, 211, 30, 40), "贴图偏移", errors)
	sprite.offset = Vector2.ZERO
	sprite.hframes = 2
	_expect(actor, Rect2(105, 220, 15, 40), "水平图集尺寸", errors)
	sprite.vframes = 2
	_expect(actor, Rect2(105, 210, 15, 20), "垂直图集尺寸", errors)
	sprite.hframes = 1
	sprite.vframes = 1
	sprite.region_rect = Rect2(3, 4, 32, 32)
	sprite.region_enabled = true
	_expect(actor, Rect2(105, 205, 15, 10), "启用贴图区域", errors)
	image.resize(128, 256)
	texture.set_image(image)
	_expect(actor, Rect2(102.5, 202.5, 7.5, 5), "原贴图对象改变尺寸", errors)
	sprite.region_enabled = false
	_expect(actor, Rect2(110, 220, 30, 40), "关闭贴图区域", errors)
	actor.visual_source_bounds_cache[source_key] = Rect2i(4, 6, 8, 10)
	_expect(actor, Rect2(104, 206, 8, 10), "同键轮廓更新", errors)
	actor.visual_source_bounds_cache.erase(source_key)
	_expect(actor, Rect2(100, 200, 128, 256), "轮廓清理后回退", errors)
	actor.visual_source_bounds_cache[source_key] = source
	sprite.texture = null
	_expect(actor, Rect2(78, 179, 44, 54), "贴图缺失回退", errors)
	sprite.texture = texture
	actor.formal_asset_enabled = false
	_expect(actor, Rect2(78, 179, 44, 54), "占位人物回退", errors)
	actor.formal_asset_enabled = true
	_expect(actor, Rect2(110, 220, 30, 40), "正式人物恢复", errors)
	var replacement_parent := Node2D.new()
	parent.add_child(replacement_parent)
	replacement_parent.position = Vector2(50, -30)
	actor.reparent(replacement_parent, false)
	_expect(actor, Rect2(160, 190, 30, 40), "重新挂接父节点", errors)
	actor.reparent(parent, false)
	_validate_signature_changes(actor, source, errors)
	actor.set_appearance_id("novice_hunter_v1")
	if not actor.set_riding_form("bui_novice_sprout_earth5_wind5"):
		errors.append("轮廓回归无法进入既有骑乘形态")
	else:
		_expect(actor, actor.get_visual_world_rect(), "骑乘范围", errors)
		actor.get_node("MountedCharacter").scale = Vector2(1.5, 0.8)
		_expect(actor, actor.get_visual_world_rect(), "骑乘节点缩放", errors)
	actor.set_riding_form("")
	_expect(actor, actor.get_visual_world_rect(), "下骑恢复人物范围", errors)
	parent.free()
	return errors


static func _validate_signature_changes(actor: Node, source: Rect2i, errors: Array[String]) -> void:
	# Alternate consumers: an occlusion query must not leave the camera using
	# the previous appearance/direction/action signature.
	for values in [
		["novice_hunter_v1", "north", "idle"],
		["novice_hunter_v1", "north", "walk"],
		["obsidian_scout_v1", "south", "idle"],
		["novice_hunter_v1", "south", "idle"],
	]:
		actor.set("appearance_id", values[0])
		actor.set("facing_key", values[1])
		actor.set("animation_state", values[2])
		var cache: Dictionary = actor.get("visual_source_bounds_cache")
		cache["%s|%s|%s" % values] = source
		actor.call("get_occlusion_world_rect")
		var expected := "%s||%s|%s" % values
		for repeat in range(2):
			if actor.call("get_visual_bounds_signature") != expected:
				errors.append("换装／转身／动作切换后轮廓签名过期")


static func _expect(actor: Node, expected: Rect2, label: String, errors: Array[String]) -> void:
	for repeat in range(2):
		var actual: Rect2 = actor.call("get_occlusion_world_rect")
		if not actual.is_equal_approx(expected):
			errors.append("人物遮挡范围错误：%s expected=%s actual=%s" % [label, expected, actual])
