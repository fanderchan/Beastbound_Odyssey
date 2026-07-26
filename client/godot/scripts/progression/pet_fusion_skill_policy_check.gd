extends RefCounted

const PetFusionSkillPolicyModel := preload(
	"res://scripts/progression/pet_fusion_skill_policy_model.gd"
)
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")

const FORM_ID := "bui_normal_red_fire10"
const FUSION_TARGET_FORM_ID := "emberhorn_fusion_solar_crown_fire7_wind3"
const INHERITED_SKILL_ID := "pet_focus_bite"
const TRAINED_SKILL_ID := "pet_sleep_powder"


static func run() -> Dictionary:
	var errors: Array[String] = []
	var case_count := 0
	var public_success_skill_ids: Array[String] = [
		INHERITED_SKILL_ID,
		"pet_confuse_cry",
		"pet_stone_gaze",
	]
	for success_count in range(4):
		var expected_success_skill_ids := public_success_skill_ids.duplicate()
		expected_success_skill_ids.resize(success_count)
		var public_contract := PetFusionSkillPolicyModel.active_inheritance_contract(
			_fusion_pet(
				"fusion_policy_public_%d" % success_count,
				_public_lineage(success_count)
			)
		)
		case_count += 1
		_expect(
			bool(public_contract.get("ok", false))
				and public_contract.get("inheritedActiveSkillIds", [])
					== expected_success_skill_ids,
			"公开融合血脉未接受%d条成功遗传记录" % success_count,
			errors
		)

	var fusion_profile := _profile_with_pet(_fusion_pet("fusion_policy_pet", _valid_lineage()))
	var fusion_pet := PlayerProgressModel.pet_instance_by_id(fusion_profile, "fusion_policy_pet")
	case_count += 1
	_expect(
		fusion_pet.get("activeSkillIds", []) == ["pet_attack", "pet_defend", INHERITED_SKILL_ID]
			and not (fusion_pet.get("forgottenSkillIds", []) as Array).has("pet_attack")
			and not (fusion_pet.get("forgottenSkillIds", []) as Array).has("pet_defend"),
		"融合实例错误合并了亚种额外默认主动",
		errors
	)

	var empty_slot_result := PlayerProgressModel.learn_pet_skill_to_slot(
		fusion_profile,
		"fusion_policy_pet",
		TRAINED_SKILL_ID,
		3
	)
	case_count += 1
	_expect(
		bool(empty_slot_result.get("ok", false))
			and (PlayerProgressModel.pet_instance_by_id(
				empty_slot_result.get("profile", {}) as Dictionary,
				"fusion_policy_pet"
			).get("activeSkillIds", []) as Array).has(TRAINED_SKILL_ID),
		"融合宠不能在空技能位学习训练技能",
		errors
	)

	var occupied_before := JSON.stringify(fusion_profile)
	var occupied_result := PlayerProgressModel.learn_pet_skill_to_slot(
		fusion_profile,
		"fusion_policy_pet",
		TRAINED_SKILL_ID,
		7
	)
	case_count += 1
	_expect(
		not bool(occupied_result.get("ok", false))
			and str(occupied_result.get("code", "")) == PetFusionSkillPolicyModel.CODE_FUSION_SLOT_OCCUPIED
			and JSON.stringify(occupied_result.get("profile", {})) == occupied_before,
		"融合宠可通过训练覆盖已占用技能位",
		errors
	)

	for base_case in [
		{"skillId": "", "slot": 1},
		{"skillId": TRAINED_SKILL_ID, "slot": 2},
	]:
		var base_result := PlayerProgressModel.learn_pet_skill_to_slot(
			fusion_profile,
			"fusion_policy_pet",
			str(base_case.get("skillId", "")),
			int(base_case.get("slot", 1))
		)
		case_count += 1
		_expect(
			not bool(base_result.get("ok", false))
				and str(base_result.get("code", "")) == PetFusionSkillPolicyModel.CODE_BASE_SKILL
				and JSON.stringify(base_result.get("profile", {})) == occupied_before,
			"基础攻击或防御可被覆盖/清空",
			errors
		)

	var base_forget := PlayerProgressModel.forget_pet_skill(
		fusion_profile,
		"fusion_policy_pet",
		"pet_attack",
		PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
	)
	case_count += 1
	_expect(
		not bool(base_forget.get("ok", false))
			and str(base_forget.get("code", "")) == PetFusionSkillPolicyModel.CODE_BASE_SKILL,
		"基础攻击可通过忘技移除",
		errors
	)

	for acknowledgement in ["", "double_confirm_irreversible_v0"]:
		var denied_forget := PlayerProgressModel.forget_pet_skill(
			fusion_profile,
			"fusion_policy_pet",
			INHERITED_SKILL_ID,
			acknowledgement
		)
		case_count += 1
		_expect(
			not bool(denied_forget.get("ok", false))
				and str(denied_forget.get("code", ""))
					== PetFusionSkillPolicyModel.CODE_FUSION_FORGET_CONFIRMATION_REQUIRED
				and str(denied_forget.get("acknowledgement", ""))
					== PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
				and JSON.stringify(denied_forget.get("profile", {})) == occupied_before,
			"遗传主动缺少精确双确认仍被遗忘",
			errors
		)

	var confirmed_forget := PlayerProgressModel.forget_pet_skill(
		fusion_profile,
		"fusion_policy_pet",
		INHERITED_SKILL_ID,
		PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
	)
	var confirmed_pet := PlayerProgressModel.pet_instance_by_id(
		confirmed_forget.get("profile", {}) as Dictionary,
		"fusion_policy_pet"
	)
	case_count += 1
	_expect(
		bool(confirmed_forget.get("ok", false))
			and not (confirmed_pet.get("activeSkillIds", []) as Array).has(INHERITED_SKILL_ID)
			and (confirmed_pet.get("forgottenSkillIds", []) as Array).has(INHERITED_SKILL_ID)
			and not (confirmed_pet.get("petSkillSlots", []) as Array).has(INHERITED_SKILL_ID),
		"精确双确认后遗传主动没有被完整遗忘",
		errors
	)
	var confirmed_profile := confirmed_forget.get("profile", {}) as Dictionary
	var retrain_to_slot := PlayerProgressModel.learn_pet_skill_to_slot(
		confirmed_profile,
		"fusion_policy_pet",
		INHERITED_SKILL_ID,
		7
	)
	var retrain_first_empty := PlayerProgressModel.learn_pet_skill(
		confirmed_profile,
		"fusion_policy_pet",
		INHERITED_SKILL_ID
	)
	case_count += 2
	for retrain_result in [retrain_to_slot, retrain_first_empty]:
		_expect(
			not bool(retrain_result.get("ok", false))
				and str(retrain_result.get("code", ""))
					== PetFusionSkillPolicyModel.CODE_FUSION_INHERITED_RETRAIN_FORBIDDEN
				and JSON.stringify(retrain_result.get("profile", {}))
					== JSON.stringify(confirmed_profile),
			"已遗忘的融合遗传主动可被训练接口重新学回",
			errors
		)

	var public_like_pet := _fusion_pet(
		"fusion_policy_public_like",
		_public_lineage(2)
	)
	public_like_pet["activeSkillIds"] = [
		"pet_attack",
		"pet_defend",
		INHERITED_SKILL_ID,
		"pet_confuse_cry",
	]
	public_like_pet["forgottenSkillIds"] = ["pet_confuse_cry"]
	public_like_pet["petSkillSlots"] = [
		"pet_attack",
		"pet_defend",
		INHERITED_SKILL_ID,
		"",
		"",
		"",
		"",
	]
	var public_like_profile := _profile_with_pet(public_like_pet)
	var normalized_public_like := PlayerProgressModel.pet_instance_by_id(
		public_like_profile,
		"fusion_policy_public_like"
	)
	var public_like_contract := PetFusionSkillPolicyModel.active_inheritance_contract(
		normalized_public_like
	)
	var public_like_retrain := PlayerProgressModel.learn_pet_skill_to_slot(
		public_like_profile,
		"fusion_policy_public_like",
		"pet_confuse_cry",
		4
	)
	case_count += 2
	_expect(
		bool(public_like_contract.get("ok", false))
			and public_like_contract.get("inheritedActiveSkillIds", [])
				== [INHERITED_SKILL_ID, "pet_confuse_cry"]
			and normalized_public_like.get("activeSkillIds", [])
				== ["pet_attack", "pet_defend", INHERITED_SKILL_ID]
			and (normalized_public_like.get("forgottenSkillIds", []) as Array)
				.has("pet_confuse_cry"),
		"公开成功项投影没有保留已遗忘遗传技的永久身份",
		errors
	)
	_expect(
		not bool(public_like_retrain.get("ok", false))
			and str(public_like_retrain.get("code", ""))
				== PetFusionSkillPolicyModel.CODE_FUSION_INHERITED_RETRAIN_FORBIDDEN,
		"公开成功项中的已遗忘遗传技可被重新训练",
		errors
	)

	var damaged_profile := _profile_with_pet(_fusion_pet("fusion_policy_damaged", {
		"schemaVersion": 1,
		"mode": "fusion",
		"activeInheritance": "damaged",
	}))
	var damaged_before := JSON.stringify(damaged_profile)
	var damaged_forget := PlayerProgressModel.forget_pet_skill(
		damaged_profile,
		"fusion_policy_damaged",
		INHERITED_SKILL_ID,
		PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
	)
	var damaged_overwrite := PlayerProgressModel.learn_pet_skill_to_slot(
		damaged_profile,
		"fusion_policy_damaged",
		TRAINED_SKILL_ID,
		7
	)
	case_count += 2
	for damaged_result in [damaged_forget, damaged_overwrite]:
		_expect(
			not bool(damaged_result.get("ok", false))
				and str(damaged_result.get("code", ""))
					== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID
				and JSON.stringify(damaged_result.get("profile", {})) == damaged_before,
			"损坏融合血脉未对破坏性技能操作失败关闭",
			errors
		)

	var damaged_empty_slot := PlayerProgressModel.learn_pet_skill_to_slot(
		damaged_profile,
		"fusion_policy_damaged",
		TRAINED_SKILL_ID,
		3
	)
	case_count += 1
	_expect(
		not bool(damaged_empty_slot.get("ok", false))
			and str(damaged_empty_slot.get("code", ""))
				== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID
			and JSON.stringify(damaged_empty_slot.get("profile", {})) == damaged_before,
		"损坏血脉可通过空槽训练绕过失败关闭",
		errors
	)

	var false_entry_lineage := _valid_lineage()
	(false_entry_lineage.get("activeInheritance", []) as Array)[0]["inherited"] = false
	var duplicate_role_lineage := _public_lineage(2)
	(duplicate_role_lineage.get("activeInheritance", []) as Array)[1]["roleId"] = "core"
	var unknown_role_lineage := _valid_lineage()
	(unknown_role_lineage.get("activeInheritance", []) as Array)[0]["roleId"] = "unknown"
	var oversized_lineage := _public_lineage(3)
	(oversized_lineage.get("activeInheritance", []) as Array).append({
		"roleId": "core",
		"skillId": "pet_sleep_powder",
		"inherited": true,
	})
	for invalid_case in [
		{"name": "false", "lineage": false_entry_lineage},
		{"name": "duplicate role", "lineage": duplicate_role_lineage},
		{"name": "unknown role", "lineage": unknown_role_lineage},
		{"name": "more than three", "lineage": oversized_lineage},
	]:
		var invalid_contract := PetFusionSkillPolicyModel.active_inheritance_contract(
			_fusion_pet(
				"fusion_policy_invalid_%s" % str(invalid_case.get("name", "")),
				invalid_case.get("lineage", {}) as Dictionary
			)
		)
		case_count += 1
		_expect(
			not bool(invalid_contract.get("ok", false))
				and str(invalid_contract.get("code", ""))
					== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID,
			"公开融合血脉错误接受%s遗传项" % str(invalid_case.get("name", "")),
			errors
		)
	var wrong_schema_lineage := _valid_lineage()
	wrong_schema_lineage["schemaVersion"] = "1"
	var wrong_schema_profile := _profile_with_pet(
		_fusion_pet("fusion_policy_wrong_schema", wrong_schema_lineage)
	)
	var wrong_schema_forget := PlayerProgressModel.forget_pet_skill(
		wrong_schema_profile,
		"fusion_policy_wrong_schema",
		INHERITED_SKILL_ID,
		PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
	)
	case_count += 1
	_expect(
		not bool(wrong_schema_forget.get("ok", false))
			and str(wrong_schema_forget.get("code", ""))
				== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID,
		"字符串 schemaVersion 被错误当作合法融合血脉",
		errors
	)
	for base_gene_id in ["pet_attack", "pet_defend"]:
		var base_gene_lineage := _valid_lineage()
		(base_gene_lineage.get("activeInheritance", []) as Array)[0]["skillId"] = base_gene_id
		var base_gene_contract := PetFusionSkillPolicyModel.active_inheritance_contract(
			_fusion_pet("fusion_policy_base_gene_%s" % base_gene_id, base_gene_lineage)
		)
		case_count += 1
		_expect(
			not bool(base_gene_contract.get("ok", false))
				and str(base_gene_contract.get("code", ""))
					== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID,
			"基础攻击或防御被伪装成融合遗传主动",
			errors
		)

	var target_without_lineage := PlayerProgressModel.create_pet_instance_from_form(
		"fusion_policy_missing_lineage",
		"缺损融合目标",
		FUSION_TARGET_FORM_ID,
		PlayerProgressModel.PET_STATE_BATTLE,
		20
	)
	target_without_lineage["activeSkillIds"] = [
		"pet_attack",
		"pet_defend",
		INHERITED_SKILL_ID,
	]
	target_without_lineage["petSkillSlots"] = [
		"pet_attack",
		"pet_defend",
		"",
		"",
		"",
		"",
		INHERITED_SKILL_ID,
	]
	target_without_lineage["speciesId"] = null
	var target_without_lineage_profile := _profile_with_pet(target_without_lineage)
	var normalized_target_without_lineage := PlayerProgressModel.pet_instance_by_id(
		target_without_lineage_profile,
		"fusion_policy_missing_lineage"
	)
	var missing_lineage_skills := PetFusionSkillPolicyModel.effective_active_skill_ids(
		normalized_target_without_lineage,
		["pet_attack", "pet_defend", "pet_bui_charge", "pet_stone_gaze"],
		normalized_target_without_lineage.get("activeSkillIds", []),
		normalized_target_without_lineage.get("forgottenSkillIds", []),
		[FUSION_TARGET_FORM_ID]
	)
	var missing_lineage_forget := PlayerProgressModel.forget_pet_skill(
		target_without_lineage_profile,
		"fusion_policy_missing_lineage",
		INHERITED_SKILL_ID,
		PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
	)
	var missing_lineage_overwrite := PlayerProgressModel.learn_pet_skill_to_slot(
		target_without_lineage_profile,
		"fusion_policy_missing_lineage",
		TRAINED_SKILL_ID,
		7
	)
	var missing_lineage_policy := PetFusionSkillPolicyModel.slot_assignment_policy(
		normalized_target_without_lineage,
		INHERITED_SKILL_ID,
		TRAINED_SKILL_ID,
		[FUSION_TARGET_FORM_ID]
	)
	case_count += 4
	_expect(
		normalized_target_without_lineage.get("activeSkillIds", [])
				== ["pet_attack", "pet_defend", INHERITED_SKILL_ID]
			and missing_lineage_skills
				== ["pet_attack", "pet_defend", INHERITED_SKILL_ID],
		"缺失血脉字段的融合目标形态错误回灌了亚种默认主动",
		errors
	)
	for missing_lineage_result in [
		missing_lineage_forget,
		missing_lineage_overwrite,
		missing_lineage_policy,
	]:
		_expect(
			not bool(missing_lineage_result.get("ok", false))
				and str(missing_lineage_result.get("code", ""))
					== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID,
			"缺失血脉字段的融合目标形态绕过了破坏性操作保护",
			errors
		)

	var conflicting_alias_pet := target_without_lineage.duplicate(true)
	conflicting_alias_pet["instanceId"] = "fusion_policy_conflicting_alias"
	conflicting_alias_pet["petId"] = "fusion_policy_conflicting_alias"
	conflicting_alias_pet["formId"] = FORM_ID
	conflicting_alias_pet["templateId"] = FUSION_TARGET_FORM_ID
	var conflicting_alias_profile := _profile_with_pet(conflicting_alias_pet)
	var normalized_conflicting_alias := PlayerProgressModel.pet_instance_by_id(
		conflicting_alias_profile,
		"fusion_policy_conflicting_alias"
	)
	var conflicting_alias_forget := PlayerProgressModel.forget_pet_skill(
		conflicting_alias_profile,
		"fusion_policy_conflicting_alias",
		INHERITED_SKILL_ID,
		PetFusionSkillPolicyModel.FORGET_ACKNOWLEDGEMENT
	)
	case_count += 2
	_expect(
		normalized_conflicting_alias.has("fusionLineage")
			and normalized_conflicting_alias.get("fusionLineage", {}) == null
			and normalized_conflicting_alias.get("activeSkillIds", [])
				== ["pet_attack", "pet_defend", INHERITED_SKILL_ID],
		"不一致形态别名使融合宠降级并回灌普通亚种技能",
		errors
	)
	_expect(
		not bool(conflicting_alias_forget.get("ok", false))
			and str(conflicting_alias_forget.get("code", ""))
				== PetFusionSkillPolicyModel.CODE_FUSION_LINEAGE_INVALID,
		"不一致形态别名绕过了融合宠破坏性操作保护",
		errors
	)

	var ordinary_profile := _profile_with_pet(PlayerProgressModel.create_pet_instance_from_form(
		"fusion_policy_ordinary",
		"普通宠回归",
		FORM_ID,
		PlayerProgressModel.PET_STATE_STANDBY,
		20
	))
	var ordinary_pet := PlayerProgressModel.pet_instance_by_id(
		ordinary_profile,
		"fusion_policy_ordinary"
	)
	var ordinary_template_skills = ordinary_pet.get("activeSkillIds", [])
	var ordinary_replace := PlayerProgressModel.learn_pet_skill_to_slot(
		ordinary_profile,
		"fusion_policy_ordinary",
		INHERITED_SKILL_ID,
		6
	)
	var ordinary_forget := PlayerProgressModel.forget_pet_skill(
		ordinary_profile,
		"fusion_policy_ordinary",
		"pet_bui_charge"
	)
	var ordinary_base_clear := PlayerProgressModel.learn_pet_skill_to_slot(
		ordinary_profile,
		"fusion_policy_ordinary",
		"",
		1
	)
	case_count += 4
	_expect(
		ordinary_template_skills is Array
			and (ordinary_template_skills as Array).has("pet_bui_charge")
			and (ordinary_template_skills as Array).has("pet_stone_gaze"),
		"普通宠丢失亚种默认主动",
		errors
	)
	_expect(
		bool(ordinary_replace.get("ok", false)),
		"普通宠不能继续覆盖非基础技能位",
		errors
	)
	_expect(
		bool(ordinary_forget.get("ok", false)),
		"普通宠非基础技能错误要求融合双确认",
		errors
	)
	_expect(
		not bool(ordinary_base_clear.get("ok", false))
			and str(ordinary_base_clear.get("code", ""))
				== PetFusionSkillPolicyModel.CODE_BASE_SKILL,
		"普通宠基础攻击可被训练接口清空",
		errors
	)
	return {
		"ok": errors.is_empty(),
		"cases": case_count,
		"errors": errors,
	}


static func _fusion_pet(instance_id: String, lineage: Dictionary) -> Dictionary:
	var pet := PlayerProgressModel.create_pet_instance_from_form(
		instance_id,
		"融合技能验证",
		FORM_ID,
		PlayerProgressModel.PET_STATE_BATTLE,
		20
	)
	pet["activeSkillIds"] = ["pet_attack", "pet_defend", INHERITED_SKILL_ID]
	pet["forgottenSkillIds"] = ["pet_attack", "pet_defend"]
	pet["petSkillSlots"] = [
		"pet_attack",
		"pet_defend",
		"",
		"",
		"",
		"",
		INHERITED_SKILL_ID,
	]
	pet["fusionLineage"] = lineage.duplicate(true)
	return pet


static func _valid_lineage() -> Dictionary:
	return _public_lineage(1)


static func _public_lineage(success_count: int) -> Dictionary:
	var entries: Array[Dictionary] = [
		{
			"roleId": "core",
			"skillId": INHERITED_SKILL_ID,
			"inherited": true,
		},
		{
			"roleId": "resonance_one",
			"skillId": "pet_confuse_cry",
			"inherited": true,
		},
		{
			"roleId": "resonance_two",
			"skillId": "pet_stone_gaze",
			"inherited": true,
		},
	]
	entries.resize(clampi(success_count, 0, entries.size()))
	return {
		"schemaVersion": 1,
		"mode": "fusion",
		"activeInheritance": entries,
	}


static func _profile_with_pet(pet: Dictionary) -> Dictionary:
	var profile := PlayerProgressModel.default_profile()
	profile["stoneCoins"] = 1000
	profile["activePetInstanceId"] = str(pet.get("instanceId", ""))
	profile["petInstances"] = [pet]
	return PlayerProgressModel.normalize_profile(profile)


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
