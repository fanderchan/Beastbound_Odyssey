extends RefCounted

const CAPTURE_FLAG := "--backpack-awakened-owner-review-capture"
const BackpackModel := preload(
	"res://scripts/progression/backpack_model.gd"
)
const EquipmentModel := preload(
	"res://scripts/progression/equipment_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetGrowthObservationModel := preload(
	"res://scripts/progression/pet_growth_observation_model.gd"
)

const REVIEW_FPS := 30
const CURRENT_CLUB_LEVEL := 1
const CANDIDATE_CLUB_LEVEL := 4
const CURRENT_WEAPON_SLOT := "right_hand_weapon"
const WOODEN_CLUB_ID := "weapon_wooden_club"
const STONE_AXE_ID := "weapon_stone_axe"
const NORMAL_ITEM_ID := "item_meat_small"
const PET_HEAL_ITEM_ID := "item_pet_salve_mid"
const PET_EGG_ID := "novice_tiger_egg"
const RIDE_PERMIT_ID := "bui_novice_sprout_riding_certificate"
const REVIEW_PET_INSTANCE_ID := "backpack_review_sprout_bui"

var host
var _started_msec: int = 0
var _failed: bool = false
var _current_club_instance_id: String = ""
var _candidate_club_instance_id: String = ""


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	_configure_isolated_review_profile()
	if _failed:
		return
	await _hold("world", 2.5)
	await _open_backpack_with_real_left_click()
	if _failed:
		return
	await _hold("backpack_overview", 2.5)
	await _review_slot_capacity_and_locked_cancel()
	if _failed:
		return
	await _review_stack_split_cancel()
	if _failed:
		return
	await _review_pet_target_selection_cancel()
	if _failed:
		return
	await _review_pet_target_use_feedback()
	if _failed:
		return
	await _review_all_filters()
	if _failed:
		return
	await _review_exact_instance_comparison_and_equip()
	if _failed:
		return
	await _review_gain_and_loss_comparison()
	if _failed:
		return
	await _review_equipped_detail_and_unequip()
	if _failed:
		return
	await _review_pet_related_items()
	if _failed:
		return
	await _return_to_world()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"BACKPACK_AWAKENED_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "speed=1.00x profile=isolated backend=false "
			+ "exact_instance=%s"
		) % [elapsed, _candidate_club_instance_id]
	)
	host.get_tree().quit(0)


func _configure_isolated_review_profile() -> void:
	host.profile_save_enabled = false
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	var profile := _review_profile()
	var target_pet := PlayerProgressModel.pet_instance_by_id(
		profile,
		REVIEW_PET_INSTANCE_ID
	)
	if (
		target_pet.is_empty()
		or int(target_pet.get("hp", 0)) >= int(target_pet.get("maxHp", 1))
	):
		_fail_capture("隔离档案没有生成可治疗的队伍宠物")
		return
	var club_instances := PlayerProgressModel.backpack_equipment_instance_ids(
		profile,
		WOODEN_CLUB_ID
	)
	if club_instances.size() != 2:
		_fail_capture("隔离档案没有生成两件独立木棒实例")
		return
	_current_club_instance_id = str(club_instances[0])
	_candidate_club_instance_id = str(club_instances[1])
	profile = _with_instance_enhancement(
		profile,
		_current_club_instance_id,
		CURRENT_CLUB_LEVEL
	)
	profile = _with_instance_enhancement(
		profile,
		_candidate_club_instance_id,
		CANDIDATE_CLUB_LEVEL
	)
	var equip_result := PlayerProgressModel.equip_item(
		profile,
		WOODEN_CLUB_ID,
		_current_club_instance_id
	)
	if not bool(equip_result.get("ok", false)):
		_fail_capture("隔离档案无法装备当前 +1 木棒")
		return
	host.player_profile = equip_result.get("profile", profile)
	host.backpack_filter = host.BACKPACK_FILTER_ALL
	host.backpack_selected_slot_index = 0
	host.equipment_selected_slot_id = CURRENT_WEAPON_SLOT
	host._update_hud_text(true)
	host._set_world_log_message("火芽村的补给已经整理好了。")


func _review_profile() -> Dictionary:
	var profile := PlayerProgressModel.without_equipment(
		PlayerProgressModel.default_profile()
	)
	var player_value = profile.get("player", {})
	var player := (
		(player_value as Dictionary).duplicate(true)
		if player_value is Dictionary
		else {}
	)
	player["name"] = "赤芽猎人"
	player["level"] = 140
	player["exp"] = 0
	player["nextExp"] = 1
	profile["player"] = player
	profile["rebirthCount"] = 1
	profile = PlayerProgressModel.with_stone_coins(profile, 109000)
	profile = PlayerProgressModel.with_diamonds(profile, 3388)
	var target_pet := PetGrowthObservationModel.create_pet_instance(
		"bui_novice_sprout_earth5_wind5_v1",
		REVIEW_PET_INSTANCE_ID,
		"bui_novice_sprout_earth5_wind5",
		"芽耳布伊",
		PlayerProgressModel.PET_STATE_BATTLE,
		40,
		"backpack-awakened-owner-review-target",
		1
	)
	if not target_pet.is_empty():
		target_pet["hp"] = maxi(
			1,
			int(target_pet.get("maxHp", 1)) - 70
		)
		profile["petInstances"] = [target_pet]
		profile["activePetInstanceId"] = REVIEW_PET_INSTANCE_ID
	var slots: Array[Dictionary] = [
		{"itemId": WOODEN_CLUB_ID, "count": 1},
		{"itemId": WOODEN_CLUB_ID, "count": 1},
		{"itemId": STONE_AXE_ID, "count": 1},
		{"itemId": "armor_moist_cloth", "count": 1},
		{"itemId": NORMAL_ITEM_ID, "count": 18},
		{"itemId": "item_heal_single_5", "count": 6},
		{"itemId": "capture_rope_basic", "count": 5},
		{"itemId": "capture_net_reinforced", "count": 2},
		{"itemId": "encounter_stone_low", "count": 3},
		{"itemId": PET_EGG_ID, "count": 1},
		{"itemId": RIDE_PERMIT_ID, "count": 1},
		{"itemId": "equip_frag_wood_basic", "count": 9},
		{"itemId": PET_HEAL_ITEM_ID, "count": 2},
		{"itemId": "pet_rebirth_mm1_egg", "count": 1},
		{"itemId": "item_cleanse_single_5", "count": 3},
	]
	return PlayerProgressModel.with_backpack_slots(profile, slots)


func _with_instance_enhancement(
	profile: Dictionary,
	instance_id: String,
	level: int
) -> Dictionary:
	var next_profile := profile.duplicate(true)
	var instances := PlayerProgressModel.equipment_instances(next_profile)
	var record_value = instances.get(instance_id, {})
	var record := (
		(record_value as Dictionary).duplicate(true)
		if record_value is Dictionary
		else {}
	)
	var item_id := str(record.get("itemId", ""))
	if item_id == "":
		return next_profile
	record["enhancement"] = {
		"itemId": item_id,
		"level": level,
		"history": [],
	}
	instances[instance_id] = record
	next_profile["equipmentInstances"] = instances
	return PlayerProgressModel.normalize_profile(next_profile)


func _open_backpack_with_real_left_click() -> void:
	var button = host.bag_menu_button
	if not (button is Button):
		_fail_capture("世界 HUD 没有背包按钮")
		return
	await _left_click(button as Button, "世界 HUD 背包按钮")
	if _failed:
		return
	if host.backpack_panel == null or not host.backpack_panel.visible:
		_fail_capture("左键点击后背包界面没有打开")


func _review_slot_capacity_and_locked_cancel() -> void:
	var panel = _awakened_panel()
	if panel == null:
		return
	var unlocked_rows := 0
	var locked_rows := 0
	for row_value in panel._view_state.get("backpackRows", []):
		if not (row_value is Dictionary):
			continue
		var row := row_value as Dictionary
		if bool(row.get("locked", false)):
			locked_rows += 1
		elif int(row.get("slotIndex", -1)) < BackpackModel.BASE_SLOT_LIMIT:
			unlocked_rows += 1
	if (
		int(panel._view_state.get("capacityTotal", -1))
			!= BackpackModel.BASE_SLOT_LIMIT
		or int(panel._view_state.get("slotLimit", -1))
			!= BackpackModel.SLOT_LIMIT
		or unlocked_rows != BackpackModel.BASE_SLOT_LIMIT
		or locked_rows != BackpackModel.EXTRA_SLOT_LIMIT
	):
		_fail_capture(
			"背包没有展示 15 个可用格和 5 个锁定扩展格"
		)
		return
	await _hold("slot_capacity", 2.0)
	var extra_before := PlayerProgressModel.backpack_extra_slots(
		host.player_profile
	)
	var diamonds_before := PlayerProgressModel.diamonds(host.player_profile)
	var locked_card := _inventory_card_for_slot(
		BackpackModel.BASE_SLOT_LIMIT
	)
	if locked_card == null:
		_fail_capture("找不到第一个锁定扩展格")
		return
	await _left_click(locked_card, "第一个锁定扩展格")
	if _failed:
		return
	if (
		host.dialog_panel == null
		or not host.dialog_panel.visible
		or str(host.active_dialog_interaction.get("actionType", ""))
			!= host.DIALOG_ACTION_BACKPACK_UNLOCK
	):
		_fail_capture("点击锁定格后没有打开真实扩容确认框")
		return
	await _hold("locked_slot_dialog", 2.5)
	if not (host.dialog_close_button is Button):
		_fail_capture("扩容确认框没有取消入口")
		return
	await _left_click(host.dialog_close_button as Button, "取消背包扩容")
	if _failed:
		return
	await host.get_tree().process_frame
	if (
		host.dialog_panel.visible
		or not host.active_dialog_interaction.is_empty()
		or PlayerProgressModel.backpack_extra_slots(host.player_profile)
			!= extra_before
		or PlayerProgressModel.diamonds(host.player_profile)
			!= diamonds_before
	):
		_fail_capture("取消扩容后档案或确认框状态发生了变化")


func _review_stack_split_cancel() -> void:
	await _choose_filter(host.BACKPACK_FILTER_ALL)
	if _failed:
		return
	var count_before := PlayerProgressModel.backpack_item_count(
		host.player_profile,
		NORMAL_ITEM_ID
	)
	var card := _inventory_card(NORMAL_ITEM_ID)
	if card == null:
		_fail_capture("找不到用于拆分演示的堆叠物品")
		return
	await _left_click(card, "堆叠物品详情")
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("点击堆叠物品后没有打开详情")
		return
	var split_button := _button_with_text(panel._overlay_layer, "拆分")
	if split_button == null:
		_fail_capture("堆叠物品详情没有拆分按钮")
		return
	await _hold("stack_detail", 1.5)
	await _left_click(split_button, "拆分堆叠物品")
	if _failed:
		return
	var flow = host._panel_flow()
	var request_value = flow.item_stack_split_request
	var request := (
		request_value as Dictionary
		if request_value is Dictionary
		else {}
	)
	if (
		flow.item_stack_split_panel == null
		or not flow.item_stack_split_panel.visible
		or str(request.get("kind", "")) != "backpack_split"
		or int(request.get("sourceSlotIndex", -1)) < 0
		or str(request.get("itemId", "")) != NORMAL_ITEM_ID
		or int(request.get("maxQuantity", 0)) != count_before - 1
	):
		_fail_capture("拆分按钮没有打开真实数量选择面板")
		return
	_report_stack_split_layout(flow.item_stack_split_panel)
	await _hold("stack_split_panel", 2.5)
	var cancel_button := _button_with_text(
		flow.item_stack_split_panel,
		"取消"
	)
	if cancel_button == null:
		_fail_capture("数量选择面板没有取消按钮")
		return
	await _left_click(cancel_button, "取消拆分")
	if _failed:
		return
	await host.get_tree().process_frame
	if (
		flow.item_stack_split_panel.visible
		or not flow.item_stack_split_request.is_empty()
		or PlayerProgressModel.backpack_item_count(
			host.player_profile,
			NORMAL_ITEM_ID
		) != count_before
	):
		_fail_capture("取消拆分后物品数量或面板状态发生了变化")


func _report_stack_split_layout(split_panel: Control) -> void:
	print(
		(
			"BACKPACK_AWAKENED_SPLIT_LAYOUT panel "
			+ "position=%s size=%s custom_min=%s combined_min=%s"
		) % [
			str(split_panel.position),
			str(split_panel.size),
			str(split_panel.custom_minimum_size),
			str(split_panel.get_combined_minimum_size()),
		]
	)
	if split_panel.get_child_count() <= 0:
		print("BACKPACK_AWAKENED_SPLIT_LAYOUT content=missing")
		return
	var content = split_panel.get_child(0)
	if not (content is Control):
		print(
			"BACKPACK_AWAKENED_SPLIT_LAYOUT content_class=%s"
			% content.get_class()
		)
		return
	var content_control := content as Control
	print(
		(
			"BACKPACK_AWAKENED_SPLIT_LAYOUT content "
			+ "class=%s size=%s custom_min=%s combined_min=%s"
		) % [
			content_control.get_class(),
			str(content_control.size),
			str(content_control.custom_minimum_size),
			str(content_control.get_combined_minimum_size()),
		]
	)
	for index in range(content_control.get_child_count()):
		var child = content_control.get_child(index)
		if not (child is Control):
			continue
		var child_control := child as Control
		print(
			(
				"BACKPACK_AWAKENED_SPLIT_LAYOUT child "
				+ "index=%d name=%s class=%s size=%s "
				+ "custom_min=%s combined_min=%s"
			) % [
				index,
				child_control.name,
				child_control.get_class(),
				str(child_control.size),
				str(child_control.custom_minimum_size),
				str(child_control.get_combined_minimum_size()),
			]
		)


func _review_pet_target_selection_cancel() -> void:
	await _choose_filter(host.BACKPACK_FILTER_WORLD)
	if _failed:
		return
	var item_count_before := PlayerProgressModel.backpack_item_count(
		host.player_profile,
		PET_HEAL_ITEM_ID
	)
	var pet_before := PlayerProgressModel.pet_instance_by_id(
		host.player_profile,
		REVIEW_PET_INSTANCE_ID
	)
	var hp_before := int(pet_before.get("hp", -1))
	var card := _inventory_card(PET_HEAL_ITEM_ID)
	if card == null:
		_fail_capture("找不到宠物定向使用物品")
		return
	await _left_click(card, "宠物药膏详情")
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("点击宠物药膏后没有打开详情")
		return
	var use_button := _button_with_text(panel._overlay_layer, "使用")
	if use_button == null:
		_fail_capture("宠物药膏详情没有使用按钮")
		return
	await _hold("target_item_detail", 1.5)
	await _left_click(use_button, "使用宠物药膏")
	if _failed:
		return
	var pending_value = panel._view_state.get("pendingUse", {})
	var pending := (
		pending_value as Dictionary
		if pending_value is Dictionary
		else {}
	)
	var has_target := false
	for target_value in pending.get("targets", []):
		if not (target_value is Dictionary):
			continue
		var target := target_value as Dictionary
		if (
			str(target.get("targetType", "")) == "pet"
			and str(target.get("targetId", ""))
				== REVIEW_PET_INSTANCE_ID
			and not bool(target.get("disabled", true))
		):
			has_target = true
			break
	if (
		not panel._overlay_layer.visible
		or not bool(pending.get("visible", false))
		or str(pending.get("itemId", "")) != PET_HEAL_ITEM_ID
		or not has_target
	):
		_fail_capture("使用按钮没有打开真实宠物目标选择层")
		return
	await _hold("pet_target_selection", 3.0)
	var cancel_button := _button_with_text(panel._overlay_layer, "取消")
	if cancel_button == null:
		_fail_capture("宠物目标选择层没有取消按钮")
		return
	await _left_click(cancel_button, "取消宠物目标选择")
	if _failed:
		return
	await host.get_tree().process_frame
	var pet_after := PlayerProgressModel.pet_instance_by_id(
		host.player_profile,
		REVIEW_PET_INSTANCE_ID
	)
	if (
		host.backpack_pending_use_item_id != ""
		or panel._overlay_layer.visible
		or PlayerProgressModel.backpack_item_count(
			host.player_profile,
			PET_HEAL_ITEM_ID
		) != item_count_before
		or int(pet_after.get("hp", -2)) != hp_before
	):
		_fail_capture("取消目标选择后物品或宠物生命发生了变化")


func _review_pet_target_use_feedback() -> void:
	var item_count_before := PlayerProgressModel.backpack_item_count(
		host.player_profile,
		PET_HEAL_ITEM_ID
	)
	var pet_before := PlayerProgressModel.pet_instance_by_id(
		host.player_profile,
		REVIEW_PET_INSTANCE_ID
	)
	var hp_before := int(pet_before.get("hp", -1))
	var card := _inventory_card(PET_HEAL_ITEM_ID)
	if card == null:
		_fail_capture("取消后找不到再次使用的宠物药膏")
		return
	await _left_click(card, "再次打开宠物药膏")
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("再次点击宠物药膏后没有打开详情")
		return
	var use_button := _button_with_text(panel._overlay_layer, "使用")
	if use_button == null:
		_fail_capture("再次打开宠物药膏后没有使用按钮")
		return
	await _left_click(use_button, "再次使用宠物药膏")
	if _failed:
		return
	var target_button = panel.target_button_for_pet(
		REVIEW_PET_INSTANCE_ID
	)
	if not (target_button is Button):
		_fail_capture("真实目标层没有芽耳布伊按钮")
		return
	await _left_click(target_button as Button, "对芽耳布伊使用药膏")
	if _failed:
		return
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	var item_count_after := PlayerProgressModel.backpack_item_count(
		host.player_profile,
		PET_HEAL_ITEM_ID
	)
	var pet_after := PlayerProgressModel.pet_instance_by_id(
		host.player_profile,
		REVIEW_PET_INSTANCE_ID
	)
	var hp_after := int(pet_after.get("hp", -1))
	var healed := hp_after - hp_before
	var flow = host._panel_flow()
	var popup_text: String = str(
		flow._backpack_heal_popup_text_for_pet(
			REVIEW_PET_INSTANCE_ID
		)
	)
	if (
		item_count_after != item_count_before - 1
		or healed <= 0
		or hp_after > int(pet_after.get("maxHp", hp_after))
		or not panel._overlay_layer.visible
		or popup_text != "+%d" % healed
	):
		_fail_capture(
			"真实宠物使用没有同时扣除药膏、恢复生命并显示 +数值"
		)
		return
	await _hold("pet_target_heal_feedback", 2.0)
	var cancel_button := _button_with_text(panel._overlay_layer, "取消")
	if cancel_button == null:
		_fail_capture("治疗反馈结束后目标层没有取消按钮")
		return
	await _left_click(cancel_button, "结束宠物目标演示")
	if _failed:
		return
	await host.get_tree().process_frame
	if (
		host.backpack_pending_use_item_id != ""
		or panel._overlay_layer.visible
	):
		_fail_capture("治疗反馈结束后目标选择层没有关闭")


func _review_all_filters() -> void:
	for filter_id in [
		host.BACKPACK_FILTER_ALL,
		host.BACKPACK_FILTER_WORLD,
		host.BACKPACK_FILTER_BATTLE,
		host.BACKPACK_FILTER_CAPTURE,
		host.BACKPACK_FILTER_EQUIPMENT,
	]:
		var panel = _awakened_panel()
		if panel == null:
			return
		var button_value = panel._filter_buttons.get(filter_id, null)
		if not (button_value is Button):
			_fail_capture("缺少背包分类按钮：%s" % filter_id)
			return
		await _left_click(button_value as Button, "背包分类 %s" % filter_id)
		if _failed:
			return
		if str(panel._active_filter) != str(filter_id):
			_fail_capture("分类点击后没有切换到：%s" % filter_id)
			return
		await _hold("filter_%s" % filter_id, 0.7)


func _review_exact_instance_comparison_and_equip() -> void:
	await _choose_filter(host.BACKPACK_FILTER_EQUIPMENT)
	var candidate := _inventory_card(
		WOODEN_CLUB_ID,
		_candidate_club_instance_id
	)
	if candidate == null:
		_fail_capture("装备分类中找不到指定 +4 木棒实例")
		return
	await _left_click(candidate, "候选 +4 木棒")
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("点击候选木棒后没有打开双栏装备对比")
		return
	await _hold("exact_instance_comparison", 4.0)
	var equip_button := _button_with_text(panel._overlay_layer, "装备")
	if equip_button == null:
		_fail_capture("装备对比没有装备按钮")
		return
	await _left_click(equip_button, "装备指定 +4 木棒")
	if _failed:
		return
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	var equipped_id := PlayerProgressModel.equipped_instance_id(
		host.player_profile,
		CURRENT_WEAPON_SLOT
	)
	var equipped_level := PlayerProgressModel.equipment_enhance_level(
		host.player_profile,
		CURRENT_WEAPON_SLOT
	)
	if (
		equipped_id != _candidate_club_instance_id
		or equipped_level != CANDIDATE_CLUB_LEVEL
	):
		_fail_capture(
			"装备按钮没有把指定 +4 实例换到右手（actual=%s +%d）"
			% [equipped_id, equipped_level]
		)
		return
	await _hold("exact_instance_equipped", 3.0)


func _review_gain_and_loss_comparison() -> void:
	await _choose_filter(host.BACKPACK_FILTER_EQUIPMENT)
	var axe_card := _inventory_card(STONE_AXE_ID)
	if axe_card == null:
		_fail_capture("装备分类中找不到石斧")
		return
	await _left_click(axe_card, "石斧属性取舍")
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("点击石斧后没有打开属性取舍对比")
		return
	var comparison_value = panel._view_state.get("comparison", {})
	var comparison := (
		comparison_value as Dictionary
		if comparison_value is Dictionary
		else {}
	)
	var has_gain := false
	var has_loss := false
	for row_value in comparison.get("statRows", []):
		if not (row_value is Dictionary):
			continue
		var delta := int((row_value as Dictionary).get("delta", 0))
		has_gain = has_gain or delta > 0
		has_loss = has_loss or delta < 0
	if not has_gain or not has_loss:
		_fail_capture("石斧对比没有同时产生绿色提升和红色下降")
		return
	await _hold("gain_loss_comparison", 3.5)
	await _close_overlay()


func _review_equipped_detail_and_unequip() -> void:
	var card := _equipment_card(CURRENT_WEAPON_SLOT)
	if card == null:
		_fail_capture("左栏找不到已装备右手武器")
		return
	await _left_click(card, "左栏已装备详情")
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("点击已装备武器后没有打开详情")
		return
	var unequip_button := _button_with_text(panel._overlay_layer, "卸下")
	if unequip_button == null:
		_fail_capture("已装备详情没有卸下按钮")
		return
	await _hold("equipped_detail", 2.5)
	await _left_click(unequip_button, "卸下当前武器")
	if _failed:
		return
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	if PlayerProgressModel.equipped_instance_id(
		host.player_profile,
		CURRENT_WEAPON_SLOT
	) != "":
		_fail_capture("卸下按钮没有清空右手武器槽")
		return
	await _hold("unequip_result", 2.5)


func _review_pet_related_items() -> void:
	await _choose_filter(host.BACKPACK_FILTER_WORLD)
	await _open_item_detail(PET_EGG_ID, "pet_egg_headshot", 3.0)
	if _failed:
		return
	await _close_overlay()
	await _open_item_detail(RIDE_PERMIT_ID, "ride_permit_headshot", 3.0)
	if _failed:
		return
	await _close_overlay()


func _open_item_detail(
	item_id: String,
	chapter: String,
	seconds: float
) -> void:
	var card := _inventory_card(item_id)
	if card == null:
		_fail_capture("背包中找不到物品：%s" % item_id)
		return
	await _left_click(card, "物品详情 %s" % item_id)
	if _failed:
		return
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		_fail_capture("点击物品后没有打开详情：%s" % item_id)
		return
	await _hold(chapter, seconds)


func _return_to_world() -> void:
	var panel = _awakened_panel()
	if panel == null:
		return
	var close_button = panel.find_child("CloseButton", true, false)
	if not (close_button is Button):
		_fail_capture("背包界面没有关闭按钮")
		return
	await _left_click(close_button as Button, "关闭背包")
	if _failed:
		return
	if host.backpack_panel != null and host.backpack_panel.visible:
		_fail_capture("点击关闭后背包仍然可见")
		return
	await _hold("return_world", 3.0)


func _choose_filter(filter_id: String) -> void:
	var panel = _awakened_panel()
	if panel == null:
		return
	if str(panel._active_filter) == filter_id:
		return
	var button_value = panel._filter_buttons.get(filter_id, null)
	if not (button_value is Button):
		_fail_capture("缺少背包分类按钮：%s" % filter_id)
		return
	await _left_click(button_value as Button, "背包分类 %s" % filter_id)
	if _failed:
		return
	if str(panel._active_filter) != filter_id:
		_fail_capture("背包分类没有切换到：%s" % filter_id)


func _inventory_card(
	item_id: String,
	instance_id: String = ""
) -> Button:
	var panel = _awakened_panel()
	if panel == null or panel._inventory_grid == null:
		return null
	for child in panel._inventory_grid.get_children():
		if not (child is Button):
			continue
		var entry_value = child.get("entry")
		if not (entry_value is Dictionary):
			continue
		var entry := entry_value as Dictionary
		if str(entry.get("itemId", "")) != item_id:
			continue
		if (
			instance_id != ""
			and str(entry.get("instanceId", "")) != instance_id
		):
			continue
		return child as Button
	return null


func _inventory_card_for_slot(slot_index: int) -> Button:
	var panel = _awakened_panel()
	if panel == null or panel._inventory_grid == null:
		return null
	for child in panel._inventory_grid.get_children():
		if not (child is Button):
			continue
		var entry_value = child.get("entry")
		if (
			entry_value is Dictionary
			and int((entry_value as Dictionary).get("slotIndex", -1))
				== slot_index
		):
			return child as Button
	return null


func _equipment_card(slot_id: String) -> Button:
	var panel = _awakened_panel()
	if panel == null or panel._equipment_layer == null:
		return null
	for child in panel._equipment_layer.get_children():
		if not (child is Button):
			continue
		var entry_value = child.get("entry")
		if (
			entry_value is Dictionary
			and str((entry_value as Dictionary).get("slotId", "")) == slot_id
		):
			return child as Button
	return null


func _button_with_text(root: Node, expected_text: String) -> Button:
	for node in root.find_children("*", "Button", true, false):
		if node is Button and str((node as Button).text) == expected_text:
			return node as Button
	return null


func _close_overlay() -> void:
	var panel = _awakened_panel()
	if panel == null or not panel._overlay_layer.visible:
		return
	var cancel_button := _button_with_text(panel._overlay_layer, "取消")
	if cancel_button == null:
		_fail_capture("详情浮层没有取消按钮")
		return
	await _left_click(cancel_button, "关闭详情浮层")


func _awakened_panel():
	var flow = host._panel_flow()
	if flow == null or flow.backpack_awakened_panel == null:
		_fail_capture("新背包界面尚未接入 Main.tscn")
		return null
	return flow.backpack_awakened_panel


func _left_click(control: Control, label: String) -> void:
	if control == null or not control.is_inside_tree() or not control.is_visible_in_tree():
		_fail_capture("%s 不可见，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = input_position
	press.global_position = input_position
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	Input.parse_input_event(release)
	await host.get_tree().process_frame


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"BACKPACK_AWAKENED_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("BACKPACK_AWAKENED_OWNER_REVIEW_FAILED %s" % message)
	host.get_tree().quit(1)
