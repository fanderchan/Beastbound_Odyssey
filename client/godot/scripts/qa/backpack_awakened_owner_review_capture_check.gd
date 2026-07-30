extends SceneTree

const BackpackAwakenedOwnerReviewCapture := preload(
	"res://scripts/qa/backpack_awakened_owner_review_capture.gd"
)
const BackpackAwakenedPresenter := preload(
	"res://scripts/ui/backpack_awakened_presenter.gd"
)
const BackpackModel := preload(
	"res://scripts/progression/backpack_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)


func _initialize() -> void:
	var errors: Array[String] = []
	var capture = BackpackAwakenedOwnerReviewCapture.new(null)
	var profile: Dictionary = capture._review_profile()
	_expect(
		PlayerProgressModel.backpack_unlocked_slot_count(profile)
			== BackpackModel.BASE_SLOT_LIMIT
			and BackpackModel.SLOT_LIMIT
				- PlayerProgressModel.backpack_unlocked_slot_count(profile)
				== BackpackModel.EXTRA_SLOT_LIMIT,
		"验收档案必须提供 15 个可用格和 5 个锁定扩展格",
		errors
	)
	_expect(
		PlayerProgressModel.backpack_slots(profile).size()
			== BackpackModel.BASE_SLOT_LIMIT,
		"验收档案的可用背包位数量不是 15",
		errors
	)
	var instance_ids := PlayerProgressModel.backpack_equipment_instance_ids(
		profile,
		capture.WOODEN_CLUB_ID
	)
	_expect(
		instance_ids.size() == 2,
		"验收档案必须包含两件独立木棒",
		errors
	)
	if instance_ids.size() == 2:
		profile = capture._with_instance_enhancement(
			profile,
			str(instance_ids[0]),
			capture.CURRENT_CLUB_LEVEL
		)
		profile = capture._with_instance_enhancement(
			profile,
			str(instance_ids[1]),
			capture.CANDIDATE_CLUB_LEVEL
		)
		var equip_result := PlayerProgressModel.equip_item(
			profile,
			capture.WOODEN_CLUB_ID,
			str(instance_ids[0])
		)
		_expect(
			bool(equip_result.get("ok", false)),
			"验收档案无法装备当前木棒",
			errors
		)
		profile = equip_result.get("profile", profile)
		var all_state := BackpackAwakenedPresenter.view_state(
			profile,
			"all"
		)
		_expect(
			(all_state.get("backpackRows", []) as Array).size()
				== BackpackModel.BASE_SLOT_LIMIT,
			"新背包展示没有保留全部 15 个可用格",
			errors
		)
		var view_state := BackpackAwakenedPresenter.view_state(
			profile,
			"equipment"
		)
		var candidate_key := ""
		for row_value in view_state.get("backpackRows", []):
			if not (row_value is Dictionary):
				continue
			var row := row_value as Dictionary
			if str(row.get("instanceId", "")) == str(instance_ids[1]):
				candidate_key = str(row.get("selectionKey", ""))
				break
		_expect(
			candidate_key != "",
			"装备页找不到指定候选木棒实例",
			errors
		)
		if candidate_key != "":
			var comparison := (
				BackpackAwakenedPresenter.comparison_for_selection(
					profile,
					candidate_key
				)
			)
			_expect(
				bool(comparison.get("visible", false))
					and str(comparison.get(
						"candidateInstanceId",
						""
					)) == str(instance_ids[1]),
				"双栏对比没有保持候选实例编号",
				errors
			)

	for item_id in [
		capture.NORMAL_ITEM_ID,
		capture.PET_HEAL_ITEM_ID,
		capture.PET_EGG_ID,
		capture.RIDE_PERMIT_ID,
		capture.STONE_AXE_ID,
	]:
		_expect(
			PlayerProgressModel.backpack_item_count(profile, item_id) > 0,
			"验收档案缺少真实目录物品：%s" % item_id,
			errors
		)

	_expect(
		PlayerProgressModel.backpack_item_count(
			profile,
			capture.NORMAL_ITEM_ID
		) > 1,
		"拆分演示物品没有形成真实堆叠",
		errors
	)
	_expect(
		PlayerProgressModel.backpack_item_count(
			profile,
			capture.PET_HEAL_ITEM_ID
		) == 2
			and BackpackModel.item_can_world_pet_heal(
				capture.PET_HEAL_ITEM_ID
			),
		"宠物定向使用物品没有满足目标选择前置条件",
		errors
	)
	var target_pet := PlayerProgressModel.pet_instance_by_id(
		profile,
		capture.REVIEW_PET_INSTANCE_ID
	)
	var party_target_found := false
	for pet in PlayerProgressModel.party_pet_instances(profile):
		if (
			str(pet.get("instanceId", ""))
				== capture.REVIEW_PET_INSTANCE_ID
		):
			party_target_found = true
			break
	_expect(
		not target_pet.is_empty()
			and party_target_found
			and str(target_pet.get("state", ""))
				== PlayerProgressModel.PET_STATE_BATTLE
			and int(target_pet.get("hp", 0)) > 0
			and int(target_pet.get("hp", 0))
				< int(target_pet.get("maxHp", 1)),
		"目标选择演示缺少可用且受伤的队伍宠物",
		errors
	)
	var heal_item_count_before := PlayerProgressModel.backpack_item_count(
		profile,
		capture.PET_HEAL_ITEM_ID
	)
	var target_hp_before := int(target_pet.get("hp", -1))
	var heal_result := PlayerProgressModel.use_world_pet_heal_item(
		profile,
		capture.PET_HEAL_ITEM_ID,
		capture.REVIEW_PET_INSTANCE_ID
	)
	var healed_profile = heal_result.get("profile", profile) as Dictionary
	var healed_target := PlayerProgressModel.pet_instance_by_id(
		healed_profile,
		capture.REVIEW_PET_INSTANCE_ID
	)
	var target_hp_after := int(healed_target.get("hp", -1))
	_expect(
		bool(heal_result.get("ok", false))
			and int(heal_result.get("heal", 0))
				== target_hp_after - target_hp_before
			and target_hp_after > target_hp_before
			and PlayerProgressModel.backpack_item_count(
				healed_profile,
				capture.PET_HEAL_ITEM_ID
			) == heal_item_count_before - 1,
		"隔离档案无法完成一次真实宠物治疗结算",
		errors
	)

	if errors.is_empty():
		print(
			"backpack awakened owner review capture check ready: "
			+ "status=ok exact_instances=2 slots=15+5 "
			+ "split=true pet_target=true pet_heal=true"
		)
		quit(0)
		return
	for error in errors:
		push_error(error)
	print(
		"backpack awakened owner review capture check ready: "
		+ "status=failed errors=%s" % "；".join(errors)
	)
	quit(1)


func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
