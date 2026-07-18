extends RefCounted

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")
const WorldVisualDirectionContract := preload("res://scripts/world/world_visual_direction_contract.gd")

const CHARACTER_ID := "novice_hunter_v1"
const FORM_ID := "bui_novice_sprout_earth5_wind5"
const MOUNTED_BUNDLE_ID := "mounted_action_novice_hunter_v1_bui_novice_sprout_v1"
const ASSET_MANIFEST_PATH := "res://assets/asset-manifest.json"
const CHARACTER_BUNDLE_META_PATH := "res://assets/characters/novice_hunter/action-bundle-meta.json"
const CHARACTER_OWNERSHIP_PATH := "res://assets/characters/novice_hunter/identity/source-and-ownership.md"
const MOUNTED_BUNDLE_META_PATH := "res://assets/mounted/novice_hunter_v1/bui_novice_sprout_earth5_wind5/action-bundle-meta.json"
const MOUNTED_OWNERSHIP_PATH := "res://assets/mounted/novice_hunter_v1/bui_novice_sprout_earth5_wind5/source-and-ownership.md"
const MAIN_SCRIPT_PATH := "res://scripts/main.gd"
const FRAME_EDGE_MARGIN := 4
const WORLD_DIRECTIONS: Array[String] = WorldVisualDirectionContract.DIRECTIONS
const RIDEABLE_FORMS_AWAITING_INTEGRATED_ART: Array[String] = [
	"novice_tiger_mount",
	"thunder_dragon_mount",
]
const FORBIDDEN_LAYERED_BATTLE_SYMBOLS: Array[String] = [
	"_draw_battle_rider_actor",
	"_draw_battle_mount_actor",
	"_draw_battle_tiger_mount",
	"_draw_battle_dragon_mount",
]


static func run() -> Dictionary:
	var errors := CharacterActionAssetCatalog.validation_errors()
	errors.append_array(PetActionAssetCatalog.validation_errors())
	errors.append_array(MountVisualProfileCatalog.validation_errors())
	if not CharacterActionAssetCatalog.warm():
		errors.append("人物动作包无法预热")
	if not PetActionAssetCatalog.warm_world_form(FORM_ID):
		errors.append("芽耳布伊世界动作包无法预热")
	if not PetActionAssetCatalog.warm_battle_form(FORM_ID):
		errors.append("芽耳布伊战斗动作包无法预热")
	if not MountedCharacterAssetCatalog.warm_world_bundle(CHARACTER_ID, FORM_ID):
		errors.append("人物与芽耳布伊的整体骑乘动作包无法预热")
	if not MountVisualProfileCatalog.warm_world_form(FORM_ID):
		errors.append("骑乘视觉档案无法预热整体动作包")
	var world_summary := _append_world_direction_errors(errors)
	var template := PetTemplateCatalog.runtime_template_for_form(FORM_ID)
	var riding = template.get("riding", {})
	if not (riding is Dictionary) or not bool((riding as Dictionary).get("rideable", false)):
		errors.append("芽耳布伊尚未进入服务端共享骑乘资格数据")
	_append_bundle_errors(errors)
	_append_manifest_errors(errors)
	_append_battle_runtime_fallback_errors(errors)
	if MountedCharacterAssetCatalog.RUNTIME_BODY_LAYER_COUNT != 1:
		errors.append("整体骑乘运行时主体层必须恰好为 1")
	if MountedCharacterAssetCatalog.USES_LAYERED_COMPOSITION:
		errors.append("整体骑乘禁止运行时人物/宠物分层拼接")
	if MountedCharacterAssetCatalog.USES_RUNTIME_MIRRORING:
		errors.append("整体骑乘真八方向禁止运行时镜像")
	return {
		"ok": errors.is_empty(),
		"characterBattleCompatibilityFrames": 56,
		"characterWorldFrames": 40,
		"petBattleFramesPreserved": 100,
		"petWorldFrames": 40,
		"mountedWorldFrames": 40,
		"mountedBattlePresentationFrames": 40,
		"runtimeDirections": WORLD_DIRECTIONS.size(),
		"uniqueCharacterFacings": int(world_summary.get("character", 0)),
		"uniquePetFacings": int(world_summary.get("pet", 0)),
		"uniqueMountedFacings": int(world_summary.get("mounted", 0)),
		"runtimeBodyLayerCount": MountedCharacterAssetCatalog.RUNTIME_BODY_LAYER_COUNT,
		"runtimeLayeredComposition": MountedCharacterAssetCatalog.USES_LAYERED_COMPOSITION,
		"runtimeMirroring": MountedCharacterAssetCatalog.USES_RUNTIME_MIRRORING,
		"safeOnFootFallbackRideableForms": RIDEABLE_FORMS_AWAITING_INTEGRATED_ART.size(),
		"worldVisualStrategy": MountedCharacterAssetCatalog.WORLD_VISUAL_STRATEGY,
		"errors": errors,
	}


static func _append_battle_runtime_fallback_errors(errors: Array[String]) -> void:
	if (
		MountVisualProfileCatalog.runtime_presentation_mode_for_form(FORM_ID)
		!= MountVisualProfileCatalog.PRESENTATION_MODE_INTEGRATED_MOUNTED_BODY
	):
		errors.append("芽耳布伊战斗骑乘没有选择 AI 整体本体")
	for form_id in RIDEABLE_FORMS_AWAITING_INTEGRATED_ART:
		var template := PetTemplateCatalog.runtime_template_for_form(form_id)
		var riding = template.get("riding", {})
		if not (riding is Dictionary) or not bool((riding as Dictionary).get("rideable", false)):
			errors.append("待制作整图的坐骑不再是合法可骑宠：%s" % form_id)
		if MountedCharacterAssetCatalog.supports_combination(CHARACTER_ID, form_id):
			errors.append("待制作整图的坐骑已登记组合却未更新门禁：%s" % form_id)
		if (
			MountVisualProfileCatalog.runtime_presentation_mode_for_form(form_id)
			!= MountVisualProfileCatalog.PRESENTATION_MODE_ON_FOOT_CHARACTER_FALLBACK
		):
			errors.append("缺少专属整图的坐骑没有安全降级为徒步人物：%s" % form_id)
	if not FileAccess.file_exists(MAIN_SCRIPT_PATH):
		errors.append("无法读取战斗运行时源码")
		return
	var main_source := FileAccess.get_file_as_string(MAIN_SCRIPT_PATH)
	for symbol in FORBIDDEN_LAYERED_BATTLE_SYMBOLS:
		if main_source.contains(symbol):
			errors.append("战斗运行时仍保留旧分层骑乘入口：%s" % symbol)
	if not main_source.contains("_draw_battle_on_foot_player_actor"):
		errors.append("战斗运行时缺少无整图组合的徒步人物安全降级")


static func _append_world_direction_errors(errors: Array[String]) -> Dictionary:
	var signature_sets := {
		"character": {},
		"pet": {},
		"mounted": {},
	}
	var mirrored_signature_sets := {
		"character": {},
		"pet": {},
		"mounted": {},
	}
	for direction in WORLD_DIRECTIONS:
		if CharacterActionAssetCatalog.world_view_for_direction(direction) != direction:
			errors.append("人物世界方向没有直取独立源图：%s" % direction)
		if PetActionAssetCatalog.world_view_for_direction(direction) != direction:
			errors.append("宠物世界方向没有直取独立源图：%s" % direction)
		if CharacterActionAssetCatalog.world_flip_h_for_direction(direction):
			errors.append("人物真八方向禁止运行时镜像：%s" % direction)
		if PetActionAssetCatalog.world_flip_h_for_direction(direction):
			errors.append("宠物真八方向禁止运行时镜像：%s" % direction)
		var character_idle := CharacterActionAssetCatalog.world_texture_for_frame(direction, "idle", 1)
		var pet_idle := PetActionAssetCatalog.world_texture_for_frame(FORM_ID, direction, "idle", 1)
		var mounted_idle := MountedCharacterAssetCatalog.world_texture_for_frame(CHARACTER_ID, FORM_ID, direction, "idle", 1)
		_append_signature(signature_sets, mirrored_signature_sets, "character", direction, character_idle, errors)
		_append_signature(signature_sets, mirrored_signature_sets, "pet", direction, pet_idle, errors)
		_append_signature(signature_sets, mirrored_signature_sets, "mounted", direction, mounted_idle, errors)
		var walk_signatures := {
			"character": {},
			"pet": {},
			"mounted": {},
		}
		for action_value in MountedCharacterAssetCatalog.WORLD_FRAME_COUNTS.keys():
			var action := str(action_value)
			var count := int(MountedCharacterAssetCatalog.WORLD_FRAME_COUNTS[action])
			for frame_index in range(count):
				var character_texture := CharacterActionAssetCatalog.world_texture_for_frame(direction, action, frame_index + 1)
				var pet_texture := PetActionAssetCatalog.world_texture_for_frame(FORM_ID, direction, action, frame_index + 1)
				var mounted_texture := MountedCharacterAssetCatalog.world_texture_for_frame(
					CHARACTER_ID,
					FORM_ID,
					direction,
					action,
					frame_index + 1
				)
				_append_frame_errors(errors, character_texture, "人物", direction, action, frame_index + 1)
				_append_frame_errors(errors, pet_texture, "宠物", direction, action, frame_index + 1)
				_append_frame_errors(errors, mounted_texture, "整体骑乘", direction, action, frame_index + 1)
				if action == "walk":
					_append_cycle_signature(walk_signatures, "character", character_texture)
					_append_cycle_signature(walk_signatures, "pet", pet_texture)
					_append_cycle_signature(walk_signatures, "mounted", mounted_texture)
				var plan := MountVisualProfileCatalog.world_frame_plan(FORM_ID, direction, action, frame_index)
				if plan.is_empty():
					errors.append("整体骑乘单帧计划缺失：%s/%s/%d" % [direction, action, frame_index + 1])
					continue
				if int(plan.get("runtimeBodyLayers", 0)) != 1:
					errors.append("整体骑乘单帧计划主体层不是 1：%s/%s/%d" % [direction, action, frame_index + 1])
				if bool(plan.get("runtimeLayeredComposition", true)):
					errors.append("整体骑乘单帧计划仍启用分层拼接：%s/%s/%d" % [direction, action, frame_index + 1])
				if bool(plan.get("runtimeMirroring", true)):
					errors.append("整体骑乘单帧计划仍启用镜像：%s/%s/%d" % [direction, action, frame_index + 1])
				for forbidden_key in ["seatAnchor", "riderAnchor", "saddleBackTexture", "nearForegroundTexture"]:
					if plan.has(forbidden_key):
						errors.append("整体骑乘单帧计划仍暴露旧分层字段：%s/%s/%d/%s" % [direction, action, frame_index + 1, forbidden_key])
		if int((walk_signatures["character"] as Dictionary).size()) != 4:
			errors.append("人物行走四帧不唯一：%s" % direction)
		if int((walk_signatures["pet"] as Dictionary).size()) != 4:
			errors.append("宠物行走四帧不唯一：%s" % direction)
		if int((walk_signatures["mounted"] as Dictionary).size()) != 4:
			errors.append("整体骑乘行走四帧不唯一：%s" % direction)
	for label in signature_sets.keys():
		_append_signature_set_errors(
			errors,
			str(label),
			signature_sets[label] as Dictionary,
			mirrored_signature_sets[label] as Dictionary
		)
	return {
		"character": (signature_sets["character"] as Dictionary).size(),
		"pet": (signature_sets["pet"] as Dictionary).size(),
		"mounted": (signature_sets["mounted"] as Dictionary).size(),
	}


static func _append_signature(
	signature_sets: Dictionary,
	mirrored_signature_sets: Dictionary,
	label: String,
	direction: String,
	texture: Texture2D,
	errors: Array[String]
) -> void:
	if texture == null:
		errors.append("八方向签名缺少素材：%s/%s" % [label, direction])
		return
	var image := texture.get_image()
	(signature_sets[label] as Dictionary)[direction] = _image_signature(image)
	image.flip_x()
	(mirrored_signature_sets[label] as Dictionary)[direction] = _image_signature(image)


static func _append_cycle_signature(signature_sets: Dictionary, label: String, texture: Texture2D) -> void:
	if texture == null:
		return
	var signature := _image_signature(texture.get_image())
	(signature_sets[label] as Dictionary)[signature] = true


static func _image_signature(image: Image) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(image.get_data())
	return context.finish().hex_encode()


static func _append_signature_set_errors(
	errors: Array[String],
	label: String,
	signatures: Dictionary,
	mirrored_signatures: Dictionary
) -> void:
	var unique: Dictionary = {}
	for signature in signatures.values():
		unique[str(signature)] = true
	if unique.size() != WORLD_DIRECTIONS.size():
		errors.append("%s 不是 8 张唯一方向源图，实际 %d" % [label, unique.size()])
	for first_index in range(WORLD_DIRECTIONS.size()):
		var first := WORLD_DIRECTIONS[first_index]
		for second_index in range(first_index + 1, WORLD_DIRECTIONS.size()):
			var second := WORLD_DIRECTIONS[second_index]
			if str(signatures.get(first, "")) == str(mirrored_signatures.get(second, "")):
				errors.append("%s 方向是另一方向的像素镜像：%s/%s" % [label, first, second])


static func _append_frame_errors(
	errors: Array[String],
	texture: Texture2D,
	label: String,
	direction: String,
	action: String,
	frame_index: int
) -> void:
	if texture == null:
		errors.append("%s世界帧无法加载：%s/%s/%d" % [label, direction, action, frame_index])
		return
	if texture.get_width() != 256 or texture.get_height() != 256:
		errors.append("%s世界帧不是 256x256：%s/%s/%d" % [label, direction, action, frame_index])
		return
	var used := texture.get_image().get_used_rect()
	if (
		used.position.x < FRAME_EDGE_MARGIN
		or used.position.y < FRAME_EDGE_MARGIN
		or used.position.x + used.size.x > texture.get_width() - FRAME_EDGE_MARGIN
		or used.position.y + used.size.y > texture.get_height() - FRAME_EDGE_MARGIN
	):
		errors.append("%s世界帧触碰安全边：%s/%s/%d" % [label, direction, action, frame_index])


static func _append_bundle_errors(errors: Array[String]) -> void:
	var character_bundle := _read_json(CHARACTER_BUNDLE_META_PATH, "人物动作合同", errors)
	if not character_bundle.is_empty():
		if str(character_bundle.get("characterId", "")) != CHARACTER_ID:
			errors.append("人物动作合同 characterId 不一致")
		_append_runtime_size_error(errors, character_bundle, "人物")
		var world_visual = character_bundle.get("worldVisual", {})
		var on_foot = (world_visual as Dictionary).get("onFoot", {}) if world_visual is Dictionary else {}
		if not (on_foot is Dictionary) or int((on_foot as Dictionary).get("totalFrameCount", 0)) != 40:
			errors.append("人物世界动作合同必须声明 40 帧")
		_append_pending_owner_review_error(errors, character_bundle, "人物")
	var mounted_bundle := _read_json(MOUNTED_BUNDLE_META_PATH, "整体骑乘动作合同", errors)
	if not mounted_bundle.is_empty():
		if str(mounted_bundle.get("bundleId", "")) != MOUNTED_BUNDLE_ID:
			errors.append("整体骑乘动作合同 bundleId 不一致")
		if str(mounted_bundle.get("characterId", "")) != CHARACTER_ID:
			errors.append("整体骑乘动作合同 characterId 不一致")
		if str(mounted_bundle.get("mountFormId", "")) != FORM_ID:
			errors.append("整体骑乘动作合同 mountFormId 不一致")
		_append_runtime_size_error(errors, mounted_bundle, "整体骑乘")
		var world_visual = mounted_bundle.get("worldVisual", {})
		if not (world_visual is Dictionary):
			errors.append("整体骑乘动作合同缺少 worldVisual")
		else:
			var world := world_visual as Dictionary
			if str(world.get("strategy", "")) != MountedCharacterAssetCatalog.WORLD_VISUAL_STRATEGY:
				errors.append("整体骑乘动作合同策略不一致")
			if int(world.get("directions", []).size()) != 8:
				errors.append("整体骑乘动作合同必须声明 8 个方向")
			if int(world.get("totalFrameCount", 0)) != 40:
				errors.append("整体骑乘动作合同必须声明 40 帧")
			if bool(world.get("runtimeMirroring", true)):
				errors.append("整体骑乘动作合同禁止运行时镜像")
			if bool(world.get("runtimeLayeredComposition", true)):
				errors.append("整体骑乘动作合同禁止运行时分层拼接")
			if int(world.get("runtimeBodyLayerCount", 0)) != 1:
				errors.append("整体骑乘动作合同主体层必须为 1")
		_append_pending_owner_review_error(errors, mounted_bundle, "整体骑乘")
	if not FileAccess.file_exists(CHARACTER_OWNERSHIP_PATH):
		errors.append("缺少人物来源与权属记录")
	if not FileAccess.file_exists(MOUNTED_OWNERSHIP_PATH):
		errors.append("缺少整体骑乘来源与权属记录")
	if MountVisualProfileCatalog.mounted_bundle_id_for_form(FORM_ID) != MOUNTED_BUNDLE_ID:
		errors.append("骑乘视觉档案没有选择正式整体动作包")
	if MountVisualProfileCatalog.battle_direction_for_side(FORM_ID, "ally") != "northwest":
		errors.append("己方骑乘战场朝向必须为 northwest")
	if MountVisualProfileCatalog.battle_direction_for_side(FORM_ID, "enemy") != "southeast":
		errors.append("敌方骑乘战场朝向必须为 southeast")


static func _append_runtime_size_error(errors: Array[String], bundle: Dictionary, label: String) -> void:
	var runtime_size = bundle.get("runtimeFrameSize", [])
	if (
		not (runtime_size is Array)
		or (runtime_size as Array).size() != 2
		or int((runtime_size as Array)[0]) != 256
		or int((runtime_size as Array)[1]) != 256
	):
		errors.append("%s运行帧合同不是 256x256" % label)


static func _append_pending_owner_review_error(errors: Array[String], bundle: Dictionary, label: String) -> void:
	var quality = bundle.get("quality", {})
	if not (quality is Dictionary) or str((quality as Dictionary).get("ownerReviewStatus", "")) != "pending":
		errors.append("%s用户未评审前 ownerReviewStatus 必须保持 pending" % label)


static func _read_json(path: String, label: String, errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(path):
		errors.append("缺少%s" % label)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("%s不是有效 JSON" % label)
		return {}
	return parsed as Dictionary


static func _append_manifest_errors(errors: Array[String]) -> void:
	var manifest := _read_json(ASSET_MANIFEST_PATH, "资产 manifest", errors)
	if manifest.is_empty():
		return
	var assets = manifest.get("assets", [])
	if not (assets is Array):
		errors.append("资产 manifest 的 assets 不是数组")
		return
	var character_matches: Array = []
	var mounted_matches: Array = []
	var profile_matches: Array = []
	for value in assets as Array:
		if not (value is Dictionary):
			continue
		var asset := value as Dictionary
		match str(asset.get("assetId", "")):
			"character_action_novice_hunter_v1":
				character_matches.append(asset)
			MOUNTED_BUNDLE_ID:
				mounted_matches.append(asset)
			"mount_visual_profiles_v1":
				profile_matches.append(asset)
		if str(asset.get("type", "")) == "legacy_mount_interface_bundle" and bool(asset.get("runtimeEnabled", false)):
			errors.append("旧骑乘接口层不得继续启用运行时")
	_append_manifest_match_errors(errors, character_matches, CHARACTER_BUNDLE_META_PATH, "人物动作包")
	_append_manifest_match_errors(errors, mounted_matches, MOUNTED_BUNDLE_META_PATH, "整体骑乘动作包")
	_append_manifest_match_errors(errors, profile_matches, MountVisualProfileCatalog.DATA_PATH, "骑乘选择合同")
	if mounted_matches.size() == 1:
		var mounted := mounted_matches[0] as Dictionary
		if str(mounted.get("type", "")) != "mounted_character_action_bundle":
			errors.append("整体骑乘 manifest 类型错误")
		if str(mounted.get("source", "")) != "project_original_ai_assisted":
			errors.append("整体骑乘 manifest 未记录原创 AI 辅助来源")
		if str(mounted.get("ownerReviewStatus", "")) != "pending":
			errors.append("整体骑乘 manifest 用户验收状态必须保持 pending")
		var world_visual = mounted.get("worldVisual", {})
		if not (world_visual is Dictionary):
			errors.append("整体骑乘 manifest 缺少 worldVisual")
		else:
			var world := world_visual as Dictionary
			if str(world.get("strategy", "")) != MountedCharacterAssetCatalog.WORLD_VISUAL_STRATEGY:
				errors.append("整体骑乘 manifest 策略不一致")
			if int(world.get("directions", 0)) != 8 or int(world.get("frameCount", 0)) != 40:
				errors.append("整体骑乘 manifest 八方向帧数不一致")
			if bool(world.get("runtimeMirroring", true)) or bool(world.get("runtimeLayeredComposition", true)):
				errors.append("整体骑乘 manifest 仍允许镜像或分层拼接")
			if int(world.get("runtimeBodyLayerCount", 0)) != 1:
				errors.append("整体骑乘 manifest 主体层不是 1")


static func _append_manifest_match_errors(errors: Array[String], matches: Array, expected_path: String, label: String) -> void:
	if matches.size() != 1:
		errors.append("%s在 manifest 中应恰好一项" % label)
		return
	var asset := matches[0] as Dictionary
	if str(asset.get("path", "")) != expected_path:
		errors.append("%s manifest 路径不正确" % label)
