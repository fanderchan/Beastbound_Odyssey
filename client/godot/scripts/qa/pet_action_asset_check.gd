extends RefCounted

const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const ASSET_MANIFEST_PATH := "res://assets/asset-manifest.json"
const BUNDLE_META_PATH := "res://assets/pets/novice_sprout_bui/action-bundle-meta.json"
const OWNERSHIP_RECORD_PATH := "res://assets/pets/novice_sprout_bui/identity/source-and-ownership.md"


static func run() -> Dictionary:
	var errors := PetActionAssetCatalog.validation_errors()
	_append_contract_errors(errors)
	var warmed_world := PetActionAssetCatalog.warm_world_form(PetActionAssetCatalog.FORM_ID)
	var world_texture := PetActionAssetCatalog.texture_for_elapsed(
		PetActionAssetCatalog.FORM_ID,
		PetActionAssetCatalog.world_view_for_direction("southwest"),
		"walk",
		0.36
	)
	var warmed_battle := PetActionAssetCatalog.warm_battle_form(PetActionAssetCatalog.FORM_ID)
	var battle_texture := PetActionAssetCatalog.texture_for_progress(
		PetActionAssetCatalog.FORM_ID,
		PetActionAssetCatalog.battle_view_for_side("ally"),
		PetActionAssetCatalog.action_for_battle_state("attack"),
		0.62
	)
	if not warmed_world or world_texture == null:
		errors.append("世界跟随动作未能预热或取帧")
	if not warmed_battle or battle_texture == null:
		errors.append("战斗动作未能预热或取帧")
	return {
		"ok": errors.is_empty(),
		"frameCount": 68,
		"views": PetActionAssetCatalog.VIEWS.size(),
		"actions": PetActionAssetCatalog.BATTLE_ACTIONS.size(),
		"errors": errors,
	}


static func _append_contract_errors(errors: Array[String]) -> void:
	var manifest := _read_json_dictionary(ASSET_MANIFEST_PATH, errors)
	var bundle := _read_json_dictionary(BUNDLE_META_PATH, errors)
	if manifest.is_empty() or bundle.is_empty():
		return
	var matching_assets: Array = []
	for value in manifest.get("assets", []):
		if value is Dictionary and str(value.get("formId", "")) == PetActionAssetCatalog.FORM_ID:
			matching_assets.append(value)
	if matching_assets.size() != 1:
		errors.append("资产 manifest 中芽耳布伊动作包应恰好一项，实际 %d" % matching_assets.size())
	else:
		var asset := matching_assets[0] as Dictionary
		if str(asset.get("path", "")) != BUNDLE_META_PATH:
			errors.append("资产 manifest 的动作合同路径不正确")
		if str(asset.get("source", "")) != "project_original_ai_assisted":
			errors.append("资产 manifest 未记录原创 AI 辅助来源")
	if str(bundle.get("formId", "")) != PetActionAssetCatalog.FORM_ID:
		errors.append("动作合同 formId 与目录不一致")
	var battle_mapping := bundle.get("battleViewMapping", {}) as Dictionary
	var ally_mapping := battle_mapping.get("ally", {}) as Dictionary
	var enemy_mapping := battle_mapping.get("enemy", {}) as Dictionary
	if (
		str(ally_mapping.get("view", "")) != PetActionAssetCatalog.VIEW_BACK
		or not bool(ally_mapping.get("flipH", false))
		or str(ally_mapping.get("facing", "")) != "northwest"
		or str(enemy_mapping.get("view", "")) != PetActionAssetCatalog.VIEW_FRONT
		or not bool(enemy_mapping.get("flipH", false))
		or str(enemy_mapping.get("facing", "")) != "southeast"
	):
		errors.append("战斗双方没有按敌左己右布局面对面")
	var runtime_frame_size := bundle.get("runtimeFrameSize", []) as Array
	if runtime_frame_size.size() != 2 or int(runtime_frame_size[0]) != 256 or int(runtime_frame_size[1]) != 256:
		errors.append("动作合同运行帧尺寸不是 256x256")
	var source := bundle.get("source", {}) as Dictionary
	if str(source.get("ownershipRecord", "")) != "identity/source-and-ownership.md":
		errors.append("动作合同未指向来源与归属记录")
	if not FileAccess.file_exists(OWNERSHIP_RECORD_PATH):
		errors.append("缺少来源与归属记录：%s" % OWNERSHIP_RECORD_PATH)
	var quality := bundle.get("quality", {}) as Dictionary
	if bool(quality.get("formalReleaseActionPackComplete", true)):
		errors.append("五动作试产不能误标为正式发行完整动作包")
	if str(quality.get("ownerReviewStatus", "")) != "pending":
		errors.append("用户尚未评审，ownerReviewStatus 必须保持 pending")


static func _read_json_dictionary(path: String, errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(path):
		errors.append("缺少资产合同：%s" % path)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary):
		errors.append("资产合同不是有效 JSON 对象：%s" % path)
		return {}
	return parsed as Dictionary
