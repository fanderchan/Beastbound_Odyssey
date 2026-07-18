extends RefCounted

const CharacterActionAssetCatalog := preload("res://scripts/player/character_action_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetTemplateCatalog := preload("res://scripts/battle/pet_template_catalog.gd")

const FORM_ID := "bui_novice_sprout_earth5_wind5"
const ASSET_MANIFEST_PATH := "res://assets/asset-manifest.json"
const BUNDLE_META_PATH := "res://assets/characters/novice_hunter/action-bundle-meta.json"
const OWNERSHIP_PATH := "res://assets/characters/novice_hunter/identity/source-and-ownership.md"
const WORLD_DIRECTIONS: Array[String] = [
	"south", "southwest", "west", "northwest", "north", "northeast", "east", "southeast",
]


static func run() -> Dictionary:
	var errors := CharacterActionAssetCatalog.validation_errors()
	errors.append_array(MountVisualProfileCatalog.validation_errors())
	if not CharacterActionAssetCatalog.warm():
		errors.append("人物动作包无法预热")
	if not PetActionAssetCatalog.warm_world_form(FORM_ID):
		errors.append("芽耳布伊世界动作包无法预热")
	var direction_signatures: Dictionary = {}
	for direction in WORLD_DIRECTIONS:
		var character_view := CharacterActionAssetCatalog.world_view_for_direction(direction)
		var character_flip := CharacterActionAssetCatalog.world_flip_h_for_direction(direction)
		var mount_view := PetActionAssetCatalog.world_view_for_direction(direction)
		var mount_flip := PetActionAssetCatalog.world_flip_h_for_direction(direction)
		if character_view != mount_view or character_flip != mount_flip:
			errors.append("人物与坐骑八方向映射不一致：%s" % direction)
		var signature := "%s:%s" % [character_view, str(character_flip)]
		direction_signatures[signature] = true
	for view in MountVisualProfileCatalog.REQUIRED_VIEWS:
		for action in MountVisualProfileCatalog.REQUIRED_ACTIONS:
			var count := int(PetActionAssetCatalog.FRAME_COUNTS[action])
			for frame_index in range(count):
				var plan := MountVisualProfileCatalog.composition_plan(FORM_ID, view, action, frame_index)
				if plan.is_empty():
					errors.append("组合计划缺失：%s/%s/%d" % [view, action, frame_index + 1])
					continue
				var rider_action := MountVisualProfileCatalog.rider_action_for(action)
				if CharacterActionAssetCatalog.texture_for_frame(view, rider_action, frame_index + 1) == null:
					errors.append("骑手帧无法加载：%s/%s/%d" % [view, rider_action, frame_index + 1])
	var template := PetTemplateCatalog.runtime_template_for_form(FORM_ID)
	var riding = template.get("riding", {})
	if not (riding is Dictionary) or not bool((riding as Dictionary).get("rideable", false)):
		errors.append("芽耳布伊尚未进入服务端共享骑乘资格数据")
	_append_bundle_errors(errors)
	_append_manifest_errors(errors)
	return {
		"ok": errors.is_empty(),
		"characterFrames": 56,
		"mountFramesReused": 28,
		"bakedCombinationSheets": 0,
		"runtimeDirections": WORLD_DIRECTIONS.size(),
		"uniquePresentedFacings": direction_signatures.size(),
		"independentSourceViews": CharacterActionAssetCatalog.VIEWS.size(),
		"rigClass": MountVisualProfileCatalog.RUNTIME_RIG_CLASS,
		"errors": errors,
	}


static func _append_bundle_errors(errors: Array[String]) -> void:
	if not FileAccess.file_exists(BUNDLE_META_PATH):
		errors.append("缺少人物动作合同")
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(BUNDLE_META_PATH))
	if not (parsed is Dictionary):
		errors.append("人物动作合同不是有效 JSON")
		return
	var bundle := parsed as Dictionary
	if str(bundle.get("characterId", "")) != CharacterActionAssetCatalog.CHARACTER_ID:
		errors.append("人物动作合同 characterId 不一致")
	var runtime_size = bundle.get("runtimeFrameSize", [])
	if not (runtime_size is Array) or (runtime_size as Array).size() != 2 or int((runtime_size as Array)[0]) != 256 or int((runtime_size as Array)[1]) != 256:
		errors.append("人物运行帧合同不是 256x256")
	var quality = bundle.get("quality", {})
	if not (quality is Dictionary) or str((quality as Dictionary).get("ownerReviewStatus", "")) != "pending":
		errors.append("用户未评审前 ownerReviewStatus 必须保持 pending")
	if not FileAccess.file_exists(OWNERSHIP_PATH):
		errors.append("缺少人物来源与权属记录")


static func _append_manifest_errors(errors: Array[String]) -> void:
	if not FileAccess.file_exists(ASSET_MANIFEST_PATH):
		errors.append("缺少资产 manifest")
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(ASSET_MANIFEST_PATH))
	if not (parsed is Dictionary):
		errors.append("资产 manifest 不是有效 JSON")
		return
	var assets = (parsed as Dictionary).get("assets", [])
	if not (assets is Array):
		errors.append("资产 manifest 的 assets 不是数组")
		return
	var character_matches: Array = []
	var mount_contract_matches: Array = []
	for value in assets as Array:
		if not (value is Dictionary):
			continue
		var asset := value as Dictionary
		if str(asset.get("assetId", "")) == "character_action_novice_hunter_v1":
			character_matches.append(asset)
		if str(asset.get("assetId", "")) == "mount_visual_profiles_v1":
			mount_contract_matches.append(asset)
		if str(asset.get("type", "")) == "baked_character_mount_sheet":
			errors.append("禁止登记人物×宠物烘焙组合图")
	if character_matches.size() != 1:
		errors.append("人物动作包在 manifest 中应恰好一项")
	else:
		var character_asset := character_matches[0] as Dictionary
		if str(character_asset.get("path", "")) != BUNDLE_META_PATH:
			errors.append("人物动作包 manifest 路径不正确")
		if str(character_asset.get("source", "")) != "project_original_ai_assisted":
			errors.append("人物动作包 manifest 未记录原创 AI 辅助来源")
	if mount_contract_matches.size() != 1:
		errors.append("骑乘组合合同在 manifest 中应恰好一项")
	else:
		var mount_asset := mount_contract_matches[0] as Dictionary
		if str(mount_asset.get("path", "")) != MountVisualProfileCatalog.DATA_PATH:
			errors.append("骑乘组合合同 manifest 路径不正确")
