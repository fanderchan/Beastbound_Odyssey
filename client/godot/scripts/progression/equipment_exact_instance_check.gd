extends SceneTree

const BackpackModel := preload("res://scripts/progression/backpack_model.gd")
const EquipmentModel := preload("res://scripts/progression/equipment_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")

const CLUB_ID := "weapon_wooden_club"
const DAGGER_ID := "weapon_stone_dagger"
const EXP_PILL_ID := "item_exp_pill_lv1"


func _initialize() -> void:
	var errors: Array[String] = []
	_check_request_body(errors)
	_check_exact_same_template_swap(errors)
	_check_full_backpack_rule(errors)
	_check_exp_pill_lock(errors)
	if errors.is_empty():
		print("equipment exact instance check ready: status=ok")
		quit(0)
		return
	for error in errors:
		push_error(error)
	print("equipment exact instance check ready: status=failed errors=%s" % "；".join(errors))
	quit(1)


func _check_request_body(errors: Array[String]) -> void:
	var legacy_spec := ServerAuthClientModel.equipment_equip_request(
		"http://127.0.0.1:8787/",
		"legacy-token",
		CLUB_ID
	)
	var legacy_body = JSON.parse_string(str(legacy_spec.get("body", "")))
	_expect(
		legacy_body is Dictionary
			and str((legacy_body as Dictionary).get("itemId", "")) == CLUB_ID
			and not (legacy_body as Dictionary).has("equipmentInstanceId"),
		"旧装备请求不应携带空实例编号",
		errors
	)

	var exact_spec := ServerAuthClientModel.equipment_equip_request(
		"http://127.0.0.1:8787/",
		"exact-token",
		CLUB_ID,
		"  equip_000099  "
	)
	var exact_body = JSON.parse_string(str(exact_spec.get("body", "")))
	_expect(
		exact_body is Dictionary
			and str((exact_body as Dictionary).get("itemId", "")) == CLUB_ID
			and str((exact_body as Dictionary).get("equipmentInstanceId", ""))
				== "equip_000099",
		"精确装备请求没有只发送规范化实例编号",
		errors
	)


func _check_exact_same_template_swap(errors: Array[String]) -> void:
	var profile := _profile_with_backpack_items([
		{"itemId": CLUB_ID, "count": 1},
		{"itemId": CLUB_ID, "count": 1},
	])
	var instance_ids := PlayerProgressModel.backpack_equipment_instance_ids(profile, CLUB_ID)
	_expect(instance_ids.size() == 2, "同名木棒没有生成两个独立实例", errors)
	if instance_ids.size() != 2:
		return
	profile = _with_instance_enhance_level(profile, instance_ids[0], 1)
	profile = _with_instance_enhance_level(profile, instance_ids[1], 3)

	var first_result := PlayerProgressModel.equip_item(profile, CLUB_ID, instance_ids[0])
	var first_profile := first_result.get("profile", {}) as Dictionary
	_expect(
		bool(first_result.get("ok", false))
			and PlayerProgressModel.equipped_instance_id(
				first_profile,
				EquipmentModel.SLOT_RIGHT_HAND_WEAPON
			) == instance_ids[0]
			and PlayerProgressModel.equipment_enhance_level(
				first_profile,
				EquipmentModel.SLOT_RIGHT_HAND_WEAPON
			) == 1,
		"首次精确装备没有选择指定的 +1 木棒",
		errors
	)

	var legacy_result := PlayerProgressModel.equip_item(first_profile, CLUB_ID)
	_expect(
		not bool(legacy_result.get("ok", true))
			and str(legacy_result.get("message", "")).find("已经装备") >= 0,
		"旧调用在同模板已装备时不再保持拒绝语义",
		errors
	)

	var swap_result := PlayerProgressModel.equip_item(
		first_profile,
		CLUB_ID,
		instance_ids[1]
	)
	var swap_profile := swap_result.get("profile", {}) as Dictionary
	var returned_record := PlayerProgressModel.equipment_instance_by_id(
		swap_profile,
		instance_ids[0]
	)
	_expect(
		bool(swap_result.get("ok", false))
			and PlayerProgressModel.equipped_instance_id(
				swap_profile,
				EquipmentModel.SLOT_RIGHT_HAND_WEAPON
			) == instance_ids[1]
			and PlayerProgressModel.equipment_enhance_level(
				swap_profile,
				EquipmentModel.SLOT_RIGHT_HAND_WEAPON
			) == 3
			and str(returned_record.get("location", "")) == "backpack"
			and int((returned_record.get("enhancement", {}) as Dictionary).get("level", 0))
				== 1,
		"同模板不同强化实例没有完成精确交换",
		errors
	)

	var same_result := PlayerProgressModel.equip_item(
		swap_profile,
		CLUB_ID,
		instance_ids[1]
	)
	_expect(
		not bool(same_result.get("ok", true))
			and str(same_result.get("message", "")).find("已经装备") >= 0
			and PlayerProgressModel.equipped_instance_id(
				same_result.get("profile", {}) as Dictionary,
				EquipmentModel.SLOT_RIGHT_HAND_WEAPON
			) == instance_ids[1],
		"重复选择当前同一装备实例没有被拒绝",
		errors
	)


func _check_full_backpack_rule(errors: Array[String]) -> void:
	var entries: Array[Dictionary] = [
		{"itemId": DAGGER_ID, "count": 1},
	]
	for _index in range(BackpackModel.BASE_SLOT_LIMIT - entries.size()):
		entries.append({
			"itemId": "item_meat_small",
			"count": BackpackModel.stack_limit_for("item_meat_small"),
		})
	var profile := _profile_with_backpack_items(entries)
	var dagger_ids := PlayerProgressModel.backpack_equipment_instance_ids(profile, DAGGER_ID)
	if dagger_ids.is_empty():
		_expect(false, "背包满回归夹具缺少装备实例", errors)
		return
	var dagger_result := PlayerProgressModel.equip_item(profile, DAGGER_ID, dagger_ids[0])
	var equipped_profile := dagger_result.get("profile", {}) as Dictionary
	var full_slots := PlayerProgressModel.backpack_slots(equipped_profile)
	var empty_index := _first_empty_slot(full_slots)
	if empty_index >= 0:
		full_slots[empty_index] = {
			"itemId": "item_meat_small",
			"count": BackpackModel.stack_limit_for("item_meat_small"),
		}
	equipped_profile = PlayerProgressModel.with_backpack_slots(
		equipped_profile,
		full_slots
	)
	var full_result := PlayerProgressModel.unequip_slot(
		equipped_profile,
		EquipmentModel.SLOT_RIGHT_HAND_WEAPON
	)
	_expect(
		bool(dagger_result.get("ok", false))
			and not bool(full_result.get("ok", true))
			and str(full_result.get("message", "")).find("背包已满") >= 0
			and PlayerProgressModel.equipped_instance_id(
				full_result.get("profile", {}) as Dictionary,
				EquipmentModel.SLOT_RIGHT_HAND_WEAPON
			) == dagger_ids[0],
		"精确实例链路破坏了背包满时禁止卸下装备的规则",
		errors
	)


func _check_exp_pill_lock(errors: Array[String]) -> void:
	var profile := _profile_with_backpack_items([
		{"itemId": EXP_PILL_ID, "count": 1},
		{"itemId": EXP_PILL_ID, "count": 1},
	])
	var instance_ids := PlayerProgressModel.backpack_equipment_instance_ids(
		profile,
		EXP_PILL_ID
	)
	if instance_ids.size() != 2:
		_expect(false, "经验丹锁定夹具缺少两个独立实例", errors)
		return
	var equip_result := PlayerProgressModel.equip_item(
		profile,
		EXP_PILL_ID,
		instance_ids[0]
	)
	var charged_profile := equip_result.get("profile", {}) as Dictionary
	var charge := PlayerProgressModel.equipped_exp_pill_charge(charged_profile)
	charge["exp"] = 1
	charged_profile["equipmentExpPillCharge"] = charge
	var instances := PlayerProgressModel.equipment_instances(charged_profile)
	var equipped_record := (instances.get(instance_ids[0], {}) as Dictionary).duplicate(true)
	equipped_record["expPillCharge"] = charge.duplicate(true)
	instances[instance_ids[0]] = equipped_record
	charged_profile["equipmentInstances"] = instances
	charged_profile = PlayerProgressModel.normalize_profile(charged_profile)

	var locked_result := PlayerProgressModel.equip_item(
		charged_profile,
		EXP_PILL_ID,
		instance_ids[1]
	)
	_expect(
		bool(equip_result.get("ok", false))
			and not bool(locked_result.get("ok", true))
			and str(locked_result.get("message", "")).find("已储存经验") >= 0
			and PlayerProgressModel.equipped_instance_id(
				locked_result.get("profile", {}) as Dictionary,
				EquipmentModel.SLOT_EXP_PILL
			) == instance_ids[0],
		"精确实例交换绕过了经验丹储存进度锁",
		errors
	)


func _profile_with_backpack_items(entries: Array[Dictionary]) -> Dictionary:
	var slots: Array[Dictionary] = []
	for entry in entries:
		slots.append(entry.duplicate(true))
	while slots.size() < BackpackModel.BASE_SLOT_LIMIT:
		slots.append({})
	var profile := PlayerProgressModel.without_equipment(
		PlayerProgressModel.default_profile()
	)
	return PlayerProgressModel.with_backpack_slots(profile, slots)


func _with_instance_enhance_level(
	profile: Dictionary,
	instance_id: String,
	level: int
) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances := PlayerProgressModel.equipment_instances(next_profile)
	var record := (instances.get(instance_id, {}) as Dictionary).duplicate(true)
	record["enhancement"] = {
		"itemId": str(record.get("itemId", "")),
		"level": level,
		"history": [],
	}
	instances[instance_id] = record
	next_profile["equipmentInstances"] = instances
	return PlayerProgressModel.normalize_profile(next_profile)


func _first_empty_slot(slots: Array[Dictionary]) -> int:
	for index in range(slots.size()):
		if str(slots[index].get("itemId", "")) == "":
			return index
	return -1


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
