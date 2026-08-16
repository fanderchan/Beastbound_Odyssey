extends RefCounted

const CharacterActionAssetCatalog := preload(
	"res://scripts/player/character_action_asset_catalog.gd"
)
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const WorldVisualDirectionContract := preload(
	"res://scripts/world/world_visual_direction_contract.gd"
)

const EXPECTED_APPEARANCE_IDS: Array[String] = [
	"novice_hunter_v1",
	"obsidian_scout_v1",
	"frost_whisper_v1",
	"ember_spark_v1",
]
const LEGACY_MOUNT_FORM_ID := "bui_novice_sprout_earth5_wind5"


static func run(host: Node) -> Dictionary:
	var errors := CharacterActionAssetCatalog.appearance_catalog_errors()
	var actual_ids := CharacterActionAssetCatalog.appearance_ids()
	if actual_ids != EXPECTED_APPEARANCE_IDS:
		errors.append("人物运行目录必须按创建顺序提供四套形象")
	if CharacterActionAssetCatalog.resolve_appearance_id("") != CharacterActionAssetCatalog.CHARACTER_ID:
		errors.append("旧档案空 appearanceId 没有回退见习猎人")
	if CharacterActionAssetCatalog.resolve_appearance_id("unknown_runtime_appearance") != CharacterActionAssetCatalog.CHARACTER_ID:
		errors.append("未知 appearanceId 没有安全回退见习猎人")
	var roots: Dictionary = {}
	var appearance_idle_signatures: Dictionary = {}
	for appearance_id in EXPECTED_APPEARANCE_IDS:
		var root := CharacterActionAssetCatalog.asset_root_for_appearance(appearance_id)
		if root == "" or roots.has(root):
			errors.append("人物形象素材根缺失或复用：%s" % appearance_id)
		else:
			roots[root] = appearance_id
		errors.append_array(
			CharacterActionAssetCatalog.validation_errors_for_appearance(
				appearance_id,
				true
			)
		)
		if not CharacterActionAssetCatalog.warm(appearance_id):
			errors.append("人物世界/战斗动作包无法预热：%s" % appearance_id)
		_append_direction_contract_errors(errors, appearance_id)
		var south_idle := CharacterActionAssetCatalog.world_texture_for_frame(
			"south",
			"idle",
			1,
			appearance_id
		)
		if south_idle != null:
			var signature := _texture_signature(south_idle)
			if appearance_idle_signatures.has(signature):
				errors.append("两套人物形象错误复用了同一世界本体：%s" % appearance_id)
			appearance_idle_signatures[signature] = appearance_id
	_append_mount_fallback_errors(errors)
	_append_live_player_errors(errors, host)
	_append_battle_host_errors(errors, host)
	return {
		"ok": errors.is_empty(),
		"appearanceIds": actual_ids,
		"appearanceCount": actual_ids.size(),
		"worldFramesPerAppearance": 40,
		"battleFramesPerAppearance": 180,
		"worldRuntimeMirroring": false,
		"battlePresentationFlip": {"ally": true, "enemy": false},
		"legacyFallbackAppearanceId": CharacterActionAssetCatalog.resolve_appearance_id(""),
		"newAppearanceMountedFallback": "on_foot",
		"errors": errors,
	}


static func _append_mount_fallback_errors(errors: Array[String]) -> void:
	if not CharacterActionAssetCatalog.appearance_supports_mounted_character(
		"novice_hunter_v1",
		"novice_hunter_v1"
	):
		errors.append("见习猎人不再兼容已发布整体骑乘组合")
	for appearance_id in EXPECTED_APPEARANCE_IDS:
		if appearance_id == "novice_hunter_v1":
			continue
		if CharacterActionAssetCatalog.appearance_supports_mounted_character(
			appearance_id,
			"novice_hunter_v1"
		):
			errors.append("新人物错误复用了见习猎人骑乘整图：%s" % appearance_id)


static func _append_live_player_errors(errors: Array[String], host: Node) -> void:
	var player = host.get("player")
	if not (player is Node) or not (player as Node).has_method("set_appearance_id"):
		errors.append("运行时玩家节点缺少人物形象切换入口")
		return
	var player_node := player as Node
	var previous_appearance := str(player_node.call("get_appearance_id"))
	var previous_ride_form := str(player_node.call("get_riding_form_id"))
	if not bool(player_node.call("set_appearance_id", "obsidian_scout_v1")):
		errors.append("运行时玩家无法加载所选曜石斥候世界本体")
	if str(player_node.call("get_appearance_id")) != "obsidian_scout_v1":
		errors.append("运行时玩家没有保留显式选择的 appearanceId")
	if bool(player_node.call("set_riding_form", LEGACY_MOUNT_FORM_ID)):
		errors.append("曜石斥候错误显示了见习猎人骑乘整图")
	if str(player_node.call("get_riding_form_id")) != "":
		errors.append("缺少人物专属骑乘组合时没有安全降级徒步")
	player_node.call("set_appearance_id", "novice_hunter_v1")
	if not bool(player_node.call("set_riding_form", LEGACY_MOUNT_FORM_ID)):
		errors.append("见习猎人已发布骑乘组合不再可用")
	player_node.call("set_appearance_id", previous_appearance)
	player_node.call("set_riding_form", previous_ride_form)


static func _append_battle_host_errors(errors: Array[String], host: Node) -> void:
	if not host.has_method("_battle_actor_appearance_id"):
		errors.append("战斗运行时缺少人物形象解析入口")
		return
	var selected := str(host.call("_battle_actor_appearance_id", {
		"id": "remote_character",
		"kind": "player",
		"appearanceId": "frost_whisper_v1",
	}))
	if selected != "frost_whisper_v1":
		errors.append("战斗人物没有读取 actor appearanceId")
	var new_appearance_ride_actor := {
		"id": BattleModel.PLAYER_ACTOR_ID,
		"kind": "player",
		"appearanceId": "ember_spark_v1",
		"ridePetInstanceId": "qa_ride",
		"ridePetFormId": LEGACY_MOUNT_FORM_ID,
		"ridePetHp": 10,
		"ridePetMaxHp": 10,
	}
	if bool(host.call("_battle_actor_uses_integrated_mount_visual", new_appearance_ride_actor)):
		errors.append("战斗中新人物错误显示见习猎人骑乘整图")
	var legacy_ride_actor := new_appearance_ride_actor.duplicate(true)
	legacy_ride_actor["appearanceId"] = "novice_hunter_v1"
	if not bool(host.call("_battle_actor_uses_integrated_mount_visual", legacy_ride_actor)):
		errors.append("战斗中见习猎人已发布骑乘组合不再可用")


static func _append_direction_contract_errors(
	errors: Array[String],
	appearance_id: String
) -> void:
	var world_signatures: Dictionary = {}
	var world_mirrored_signatures: Dictionary = {}
	for direction in WorldVisualDirectionContract.DIRECTIONS:
		if CharacterActionAssetCatalog.world_view_for_direction(direction) != direction:
			errors.append("人物世界方向没有直取独立源图：%s/%s" % [appearance_id, direction])
		if CharacterActionAssetCatalog.world_flip_h_for_direction(direction):
			errors.append("人物世界方向启用了运行时镜像：%s/%s" % [appearance_id, direction])
		var texture := CharacterActionAssetCatalog.world_texture_for_frame(
			direction,
			"idle",
			1,
			appearance_id
		)
		if texture == null:
			continue
		world_signatures[direction] = _texture_signature(texture)
		world_mirrored_signatures[direction] = _mirrored_texture_signature(texture)
	for first_index in range(WorldVisualDirectionContract.DIRECTIONS.size()):
		var first := WorldVisualDirectionContract.DIRECTIONS[first_index]
		for second_index in range(first_index + 1, WorldVisualDirectionContract.DIRECTIONS.size()):
			var second := WorldVisualDirectionContract.DIRECTIONS[second_index]
			var first_signature := str(world_signatures.get(first, ""))
			var second_mirrored_signature := str(world_mirrored_signatures.get(second, ""))
			if (
				first_signature != ""
				and second_mirrored_signature != ""
				and first_signature == second_mirrored_signature
			):
				errors.append("人物世界方向是另一方向的像素镜像：%s/%s/%s" % [
					appearance_id, first, second,
				])
	if (
		CharacterActionAssetCatalog.battle_view_for_side("ally")
		!= CharacterActionAssetCatalog.VIEW_BACK
		or CharacterActionAssetCatalog.battle_view_for_side("enemy")
		!= CharacterActionAssetCatalog.VIEW_FRONT
	):
		errors.append("人物战斗前后视角与阵营映射不一致：%s" % appearance_id)
	if not CharacterActionAssetCatalog.battle_flip_h_for_side("ally", appearance_id):
		errors.append("人物我方背视角没有朝向战场左上：%s" % appearance_id)
	if not CharacterActionAssetCatalog.battle_flip_h_for_side("enemy", appearance_id):
		errors.append("人物敌方正视角没有朝向战场右下：%s" % appearance_id)
	if CharacterActionAssetCatalog.battle_flip_h_for_side("unknown", appearance_id):
		errors.append("人物未知战斗阵营错误启用了展示翻转：%s" % appearance_id)
	var available_actions := CharacterActionAssetCatalog.battle_actions_for_appearance(
		appearance_id
	)
	for action in CharacterActionAssetCatalog.FULL_BATTLE_ACTIONS:
		if not available_actions.has(action):
			continue
		var count := CharacterActionAssetCatalog.frame_count_for_action(action, appearance_id)
		for frame_index in range(1, count + 1):
			var front := CharacterActionAssetCatalog.texture_for_frame(
				CharacterActionAssetCatalog.VIEW_FRONT,
				action,
				frame_index,
				appearance_id
			)
			var back := CharacterActionAssetCatalog.texture_for_frame(
				CharacterActionAssetCatalog.VIEW_BACK,
				action,
				frame_index,
				appearance_id
			)
			if front != null and back != null and _texture_signature(front) == _mirrored_texture_signature(back):
				errors.append("人物战斗两视角存在像素镜像帧：%s/%s/%d" % [
					appearance_id, action, frame_index,
				])


static func _texture_signature(texture: Texture2D) -> String:
	return _image_signature(texture.get_image())


static func _mirrored_texture_signature(texture: Texture2D) -> String:
	var image := texture.get_image()
	image.flip_x()
	return _image_signature(image)


static func _image_signature(image: Image) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(image.get_data())
	return context.finish().hex_encode()
