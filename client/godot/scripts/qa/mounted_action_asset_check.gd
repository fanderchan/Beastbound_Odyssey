extends RefCounted

const MountedCharacterAssetCatalog := preload("res://scripts/player/mounted_character_asset_catalog.gd")
const MountVisualProfileCatalog := preload("res://scripts/player/mount_visual_profile_catalog.gd")
const PetActionAssetCatalog := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const DEFAULT_FORM_ID := "bui_novice_sprout_earth5_wind5"


static func run(requested_form_id: String, require_battle: bool = true) -> Dictionary:
	var form_id := requested_form_id.strip_edges()
	var effective_require_battle := require_battle
	if form_id == "":
		# Auto-check discovery invokes the flag without parameters. Keep that
		# compatibility gate on the released Bui world canary; explicit form checks
		# enforce the complete mounted battle contract unless world-only is asked.
		form_id = DEFAULT_FORM_ID
		effective_require_battle = false
	var character_id := MountedCharacterAssetCatalog.DEFAULT_CHARACTER_ID
	var errors: Array[String] = []
	var preview_enabled_here := false
	if not MountedCharacterAssetCatalog.supports_combination(character_id, form_id):
		preview_enabled_here = MountedCharacterAssetCatalog.enable_qa_preview_combination(character_id, form_id)
	if not MountedCharacterAssetCatalog.supports_combination(character_id, form_id):
		errors.append("骑宠整图组合没有获得运行或 QA 访问权限：%s/%s" % [character_id, form_id])
		return _finish(form_id, character_id, effective_require_battle, preview_enabled_here, [], 0, {}, errors)
	MountVisualProfileCatalog.enable_qa_preview_form(form_id)
	errors.append_array(MountedCharacterAssetCatalog.validation_errors(character_id, form_id, effective_require_battle))
	if not MountedCharacterAssetCatalog.warm_world_bundle(character_id, form_id):
		errors.append("骑宠真八向世界动作未能预热")
	var world_texture := MountedCharacterAssetCatalog.world_texture_for_elapsed(
		character_id,
		form_id,
		"southwest",
		"walk",
		0.36
	)
	if world_texture == null:
		errors.append("骑宠世界行走帧未能加载")
	if (
		MountVisualProfileCatalog.runtime_presentation_mode_for_form(form_id)
		!= MountVisualProfileCatalog.PRESENTATION_MODE_INTEGRATED_MOUNTED_BODY
	):
		errors.append("QA 骑宠没有进入单张整帧呈现路径")
	var battle_actions := MountedCharacterAssetCatalog.battle_actions_for_combination(character_id, form_id)
	var battle_frame_count := _battle_frame_count_while_authorized(
		character_id,
		form_id,
		battle_actions
	)
	var battle_facing := _battle_facing_while_authorized(character_id, form_id, errors)
	if effective_require_battle:
		if battle_actions != PetActionAssetCatalog.FULL_BATTLE_ACTIONS:
			errors.append("骑宠战斗动作必须精确覆盖十二动作")
		if battle_frame_count != 180:
			errors.append("骑宠战斗整图帧必须精确为 180，实际 %d" % battle_frame_count)
		if not MountedCharacterAssetCatalog.warm_battle_bundle(character_id, form_id):
			errors.append("骑宠十二动作战斗整帧未能预热")
		if not MountedCharacterAssetCatalog.warm_battle_state({
			"actors": [{
				"kind": "player",
				"ridePetFormId": form_id,
			}],
		}):
			errors.append("骑宠战斗状态没有进入整包预热路径")
		for state in [
			"idle", "attack", "skill", "hit", "defend", "dodge",
			"counter_attack", "wounded_return", "launched", "down", "revive",
		]:
			var action := MountedCharacterAssetCatalog.battle_action_for_state(character_id, form_id, state)
			var texture := MountedCharacterAssetCatalog.battle_texture_for_progress(
				character_id,
				form_id,
				MountedCharacterAssetCatalog.battle_view_for_side("enemy"),
				action,
				0.55
			)
			if texture == null:
				errors.append("骑宠战斗状态未能加载：%s -> %s" % [state, action])
	return _finish(
		form_id,
		character_id,
		effective_require_battle,
		preview_enabled_here,
		battle_actions,
		battle_frame_count,
		battle_facing,
		errors
	)


static func _finish(
	form_id: String,
	character_id: String,
	require_battle: bool,
	preview_enabled_here: bool,
	battle_actions: Array[String],
	battle_frame_count: int,
	battle_facing: Dictionary,
	errors: Array[String]
) -> Dictionary:
	MountVisualProfileCatalog.disable_qa_preview_form(form_id)
	if preview_enabled_here:
		MountedCharacterAssetCatalog.disable_qa_preview_combination(character_id, form_id)
		var record := PetArtCatalog.form_record(form_id)
		if not bool(record.get("runtimeEnabled", false)) and MountedCharacterAssetCatalog.supports_combination(character_id, form_id):
			errors.append("QA 结束后 owner pending 骑宠仍可进入普通运行路径：%s" % form_id)
	return _result(
		form_id,
		character_id,
		require_battle,
		battle_actions,
		battle_frame_count,
		battle_facing,
		errors
	)


static func _result(
	form_id: String,
	character_id: String,
	require_battle: bool,
	battle_actions: Array[String],
	battle_frame_count: int,
	battle_facing: Dictionary,
	errors: Array[String]
) -> Dictionary:
	return {
		"ok": errors.is_empty(),
		"formId": form_id,
		"characterId": character_id,
		"requireBattle": require_battle,
		"worldDirections": 8,
		"worldFrameCount": 40,
		"worldUsesRuntimeMirroring": false,
		"runtimeBodyLayerCount": MountedCharacterAssetCatalog.RUNTIME_BODY_LAYER_COUNT,
		"runtimeLayeredComposition": MountedCharacterAssetCatalog.USES_LAYERED_COMPOSITION,
		"battleViews": MountedCharacterAssetCatalog.VIEWS.size(),
		"battleActions": battle_actions.size(),
		"battleFrameCount": battle_frame_count,
		"battleFacing": battle_facing,
		"errors": errors,
	}


static func _battle_frame_count_while_authorized(
	character_id: String,
	form_id: String,
	battle_actions: Array[String]
) -> int:
	var result := 0
	for action in battle_actions:
		result += (
			MountedCharacterAssetCatalog.battle_frame_count(character_id, form_id, action)
			* MountedCharacterAssetCatalog.VIEWS.size()
		)
	return result


static func _battle_facing_while_authorized(
	character_id: String,
	form_id: String,
	errors: Array[String]
) -> Dictionary:
	var result := {}
	for side in ["enemy", "ally"]:
		var mounted_view := MountedCharacterAssetCatalog.battle_view_for_side(side)
		var mounted_flip := MountedCharacterAssetCatalog.battle_flip_h_for_side(
			character_id,
			form_id,
			side
		)
		var pet_view := PetActionAssetCatalog.battle_view_for_side(side)
		var pet_flip := PetActionAssetCatalog.battle_flip_h_for_side(side, form_id)
		result[side] = {
			"view": mounted_view,
			"flipH": mounted_flip,
			"matchesBattlePet": mounted_view == pet_view and mounted_flip == pet_flip,
		}
		if mounted_view != pet_view or mounted_flip != pet_flip:
			errors.append("%s 侧骑宠与同队战宠的最终朝向映射不一致" % side)
		if not mounted_flip:
			errors.append("%s 侧骑宠没有朝向战场中心" % side)
	return result
