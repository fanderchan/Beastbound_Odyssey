extends RefCounted

const WorldDepthLayer := preload("res://scripts/world/world_depth_layer.gd")
const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const OnlinePresenceCacheModel := preload("res://scripts/net/online_presence_cache_model.gd")
const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")


static func run(host: Node) -> Array[String]:
	var errors: Array[String] = []
	var layer := WorldDepthLayer.new()
	host.add_child(layer)
	var local := PLAYER_SCENE.instantiate()
	host.add_child(local)
	local.set_physics_process(false)
	var command := {"stableId": "remote:visual_test", "kind": "remote_actor",
		"position": Vector2(160, 200), "depthY": 224.0, "label": "同行猎人",
		"appearanceId": "novice_hunter_v1", "facing": "south", "moving": false}
	layer.replace_group("remote_actors", [command])
	var remote: Node2D = layer.get_child(0)
	var actor := remote.get_node("Presentation")
	var actor_id := actor.get_instance_id()
	var sprite := actor.get_node("FormalSprite") as Sprite2D
	var local_sprite := local.get_node("FormalSprite") as Sprite2D
	_expect(sprite.scale == local_sprite.scale and sprite.position == local_sprite.position, "远端与本人比例/锚点不一致", errors)
	_expect(not actor.is_processing(), "单帧待机仍进行逐帧动画工作", errors)
	_expect(not actor.is_physics_processing() and not actor.controls_enabled and not actor.keyboard_movement_enabled, "远端仍可处理移动/键盘", errors)
	_expect(actor.collision_layer == 0 and actor.collision_mask == 0 and actor.get_node("CollisionShape2D").disabled, "远端仍参与碰撞", errors)
	for appearance in CharacterActionAssetCatalog.appearance_ids():
		command.appearanceId = appearance
		for facing in actor.FACING_KEYS:
			command.facing = facing
			for moving in [false, true]:
				command.moving = moving
				layer.replace_group("remote_actors", [command])
				var action := "walk" if moving else "idle"
				_expect(actor.get_instance_id() == actor_id, "位置回包重建人物节点", errors)
				_expect(sprite.texture == CharacterActionAssetCatalog.world_texture_for_elapsed(facing, action, actor.animation_time, appearance), "远端外观/动作/朝向资源不匹配", errors)
				_expect(not sprite.flip_h and not sprite.flip_v, "世界人物错误镜像", errors)
				_expect(layer.remote_actor_contains_point("remote:visual_test", actor.get_visual_world_rect().get_center()), "角色点击范围不覆盖实际素材", errors)
				_expect(not layer.remote_actor_contains_point("remote:visual_test", Vector2(-1000, -1000)), "角色点击范围侵入远处", errors)
	command.moving = true
	layer.replace_group("remote_actors", [command])
	_expect(actor.is_processing(), "行走没有恢复动画处理", errors)
	actor._process(0.22)
	var elapsed: float = actor.animation_time
	command.position += Vector2(32, 16)
	command.depthY += 16.0
	layer.replace_group("remote_actors", [command, command])
	_expect(layer.group_count("remote_actors") == 1 and is_equal_approx(actor.animation_time, elapsed), "重复包重建节点或重置行走时钟", errors)
	_expect(is_equal_approx(layer.debug_depth_snapshot()[0].depthY, 240.0), "远端深度没有随位置更新", errors)
	command.ridingFormId = "bui_novice_sprout_earth5_wind5"
	layer.replace_group("remote_actors", [command])
	_expect(actor.get_riding_form_id() == "", "新人物错误使用见习猎人整体骑乘", errors)
	command.appearanceId = "novice_hunter_v1"
	layer.replace_group("remote_actors", [command])
	local.set_riding_form(command.ridingFormId)
	_expect(actor.get_riding_form_id() == local.get_riding_form_id(), "远端骑乘绕过或偏离本机运行开关", errors)
	command.ridingFormId = "unknown_unreleased_mount"
	layer.replace_group("remote_actors", [command])
	_expect(actor.get_riding_form_id() == "" and sprite.visible, "未知骑乘没有保留徒步人物", errors)
	command.appearanceId = "unknown_appearance"
	command.facing = "invalid"
	layer.replace_group("remote_actors", [command])
	_expect(actor.get_appearance_id() == "novice_hunter_v1" and actor.get_facing_key() == "south", "旧包/未知外观未安全回退", errors)
	layer.hide()
	_expect(not actor.is_processing() and not layer.remote_actor_contains_point("remote:visual_test", remote.global_position), "隐藏世界仍播放动画或拦截点击", errors)
	layer.show()
	_expect(actor.is_processing(), "返回世界后动画未恢复", errors)
	layer.replace_group("remote_actors", [])
	_expect(layer.get_child_count() == 0 and not layer.has_depth_member("remote:visual_test"), "AOI 离开残留角色", errors)
	_validate_presence_fields(host, errors)
	layer.free()
	local.free()
	return errors


static func _validate_presence_fields(host: Node, errors: Array[String]) -> void:
	var cache := OnlinePresenceCacheModel.new()
	var row := {"accountId": "remote_visual", "displayName": "同行者", "appearanceId": "frost_whisper_v1", "ridingFormId": "",
		"presenceRevision": 1, "position": {"mapId": "earth_vein_cave", "cellX": 5, "cellY": 20, "hasCell": true}}
	cache.apply_snapshot([row])
	_expect(cache.players()[0].appearanceId == row.appearanceId, "在线缓存丢失外观", errors)
	var old_signature: String = host._online_position_draw_signature(cache.players())
	for field in ["appearanceId", "ridingFormId", "displayName"]:
		row[field] = "changed_" + field
		row.presenceRevision += 1
		cache.apply_position_event({"change": "upsert", "accountId": row.accountId, "presenceRevision": row.presenceRevision, "player": row})
		var signature: String = host._online_position_draw_signature(cache.players())
		_expect(signature != old_signature, "静止时更换 %s 未触发重绘" % field, errors)
		old_signature = signature


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
