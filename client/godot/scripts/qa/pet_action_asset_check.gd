extends RefCounted

const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const BattleVisualPresentationModel := preload("res://scripts/battle/battle_visual_presentation_model.gd")
const ASSET_MANIFEST_PATH := "res://assets/asset-manifest.json"
const BUNDLE_META_PATH := "res://assets/pets/novice_sprout_bui/action-bundle-meta.json"
const OWNERSHIP_RECORD_PATH := "res://assets/pets/novice_sprout_bui/identity/source-and-ownership.md"


static func run(requested_form_id: String = "") -> Dictionary:
	var form_id := requested_form_id.strip_edges()
	var explicit_form_requested := form_id != ""
	if form_id == "":
		form_id = PetActionAssetCatalog.FORM_ID
	var was_runtime_supported := PetArtCatalog.supports_form(form_id)
	var preview_enabled_here := false
	if explicit_form_requested or not was_runtime_supported:
		preview_enabled_here = PetActionAssetCatalog.enable_qa_preview_form(form_id)
	var require_full_battle := explicit_form_requested or form_id != PetActionAssetCatalog.FORM_ID
	var errors := PetActionAssetCatalog.validation_errors_for_form(form_id, require_full_battle)
	errors.append_array(PetArtCatalog.validation_errors())
	errors.append_array(BattleVisualPresentationModel.validation_errors())
	if form_id == PetActionAssetCatalog.FORM_ID:
		_append_contract_errors(errors)
	var warmed_world := PetActionAssetCatalog.warm_world_form(form_id)
	var world_texture := PetActionAssetCatalog.world_texture_for_elapsed(
		form_id,
		"southwest",
		"walk",
		0.36
	)
	var warmed_battle := PetActionAssetCatalog.warm_battle_form(form_id)
	var battle_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("ally"),
		PetActionAssetCatalog.action_for_battle_state("attack", form_id),
		0.62
	)
	var down_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("enemy"),
		PetActionAssetCatalog.action_for_battle_state("down", form_id),
		1.0
	)
	var stagger_texture := PetActionAssetCatalog.texture_for_progress(
		form_id,
		PetActionAssetCatalog.battle_view_for_side("ally"),
		PetActionAssetCatalog.action_for_battle_state("wounded_return", form_id),
		0.55
	)
	if not warmed_world or world_texture == null:
		errors.append("世界跟随动作未能预热或取帧")
	if not warmed_battle or battle_texture == null:
		errors.append("战斗动作未能预热或取帧")
	if down_texture == null:
		errors.append("战斗昏迷末帧未能加载")
	if stagger_texture == null:
		errors.append("致死反击负伤退行帧未能加载")
	if require_full_battle:
		for state in ["skill", "dodge", "counter_attack", "launched", "revive"]:
			var action := PetActionAssetCatalog.action_for_battle_state(state, form_id)
			var texture := PetActionAssetCatalog.texture_for_progress(
				form_id,
				PetActionAssetCatalog.battle_view_for_side("enemy"),
				action,
				0.5
			)
			if texture == null:
				errors.append("十二动作状态未能加载：%s -> %s" % [state, action])
	var battle_actions := PetActionAssetCatalog.battle_actions_for_form(form_id)
	var battle_frame_count := 0
	for action in battle_actions:
		battle_frame_count += PetActionAssetCatalog.frame_count_for_action(form_id, action) * PetActionAssetCatalog.VIEWS.size()
	if preview_enabled_here:
		PetActionAssetCatalog.disable_qa_preview_form(form_id)
		if not was_runtime_supported and PetActionAssetCatalog.supports_form(form_id):
			errors.append("QA 结束后 owner pending 宠物仍可进入普通运行路径：%s" % form_id)
	return {
		"ok": errors.is_empty(),
		"formId": form_id,
		"artCatalogForms": PetArtCatalog.all_form_records().size(),
		"artCatalogRuntimeForms": PetArtCatalog.runtime_form_records().size(),
		"battleFrameCount": battle_frame_count,
		"battleViews": PetActionAssetCatalog.VIEWS.size(),
		"battleActions": battle_actions.size(),
		"worldFrameCount": 40,
		"worldDirections": 8,
		"worldUsesRuntimeMirroring": false,
		"errors": errors,
	}


static func _append_contract_errors(errors: Array[String]) -> void:
	var manifest := _read_json_dictionary(ASSET_MANIFEST_PATH, errors)
	var bundle := _read_json_dictionary(BUNDLE_META_PATH, errors)
	if manifest.is_empty() or bundle.is_empty():
		return
	var matching_assets: Array = []
	for value in manifest.get("assets", []):
		if (
			value is Dictionary
			and str(value.get("type", "")) == "pet_action_bundle"
			and str(value.get("formId", "")) == PetActionAssetCatalog.FORM_ID
		):
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
	if bool(quality.get("formalReleaseActionPackComplete", false)):
		var action_specs := bundle.get("actions", {}) as Dictionary
		for action in PetActionAssetCatalog.FULL_BATTLE_ACTIONS:
			var spec_value = action_specs.get(action, {})
			if not (spec_value is Dictionary) or int((spec_value as Dictionary).get("frameCount", 0)) <= 0:
				errors.append("正式十二动作完成标记缺少动作事实：%s" % action)
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
