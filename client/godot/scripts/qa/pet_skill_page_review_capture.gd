extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetSkillTrainingModel := preload(
	"res://scripts/progression/pet_skill_training_model.gd"
)
const PetManagementReviewCapture := preload(
	"res://scripts/qa/pet_management_review_capture.gd"
)

const REVIEW_FPS := 30
const EVOLVED_INSTANCE_ID := "owner_review_crystal_wuli"
const BUI_INSTANCE_ID := "owner_review_sprout_bui"

var host
var _started_msec := 0
var _failed := false


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	_configure_isolated_review_profile()
	await _hold("world", 2.0)
	await _review_complete_skill_page()
	await _review_second_pet()
	await _review_training_flow()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PET_SKILL_PAGE_OWNER_REVIEW_END elapsed_wall=%.3f speed=1.00x "
			+ "profile=isolated backend=false"
		) % elapsed
	)
	host.get_tree().quit(0)


func _configure_isolated_review_profile() -> void:
	host.profile_save_enabled = false
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	var fixture = PetManagementReviewCapture.new(host)
	var profile: Dictionary = fixture.review_profile_fixture()
	var instances: Array = profile.get("petInstances", [])
	for index in range(instances.size()):
		if not (instances[index] is Dictionary):
			continue
		var instance := (instances[index] as Dictionary).duplicate(true)
		var instance_id := str(instance.get("instanceId", ""))
		if instance_id == EVOLVED_INSTANCE_ID:
			instance["activeSkillIds"] = [
				"pet_attack",
				"pet_defend",
				"pet_bui_charge",
				"pet_sleep_powder",
				"pet_confuse_cry",
				"pet_stone_gaze",
				"pet_focus_bite",
			]
			instance["petSkillSlots"] = (
				instance["activeSkillIds"] as Array
			).duplicate()
			instance["passiveSkillIds"] = [
				"stone_immunity",
				"poison_resistance",
			]
		elif instance_id == BUI_INSTANCE_ID:
			instance["activeSkillIds"] = [
				"pet_attack",
				"pet_defend",
				"pet_bui_charge",
			]
			instance["petSkillSlots"] = [
				"pet_attack",
				"pet_defend",
				"pet_bui_charge",
				"",
				"",
				"",
				"",
			]
			instance["passiveSkillIds"] = ["bui_resistant_skin"]
		instances[index] = instance
	profile["petInstances"] = instances
	profile = PlayerProgressModel.with_stone_coins(profile, 5000)
	host.player_profile = PlayerProgressModel.normalize_profile(profile)
	host.pet_selected_instance_id = EVOLVED_INSTANCE_ID
	host.pet_detail_mode = host.PET_DETAIL_MODE_INSTANCE
	host.pet_skill_selected_slot = 1
	host.backpack_selected_slot_index = 0
	host._update_hud_text(true)
	host._set_world_log_message("技能图鉴正在接受实机检阅。")


func _review_complete_skill_page() -> void:
	host._open_pet_panel(false)
	await host._select_pet_instance(EVOLVED_INSTANCE_ID)
	host._open_pet_skill_panel(false)
	await _hold("complete_skill_page_top", 7.0)
	host._select_pet_skill_slot(6)
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	_scroll_skill_page(0.74)
	await _hold("complete_skill_page_special", 6.0)


func _review_second_pet() -> void:
	await host._select_pet_instance(BUI_INSTANCE_ID)
	host._select_pet_skill_slot(1)
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	_scroll_skill_page(0.0)
	await _hold("second_pet_skill_page", 6.0)
	host._select_pet_skill_slot(3)
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	_scroll_skill_page(0.36)
	await _hold("second_pet_skill_detail", 5.0)


func _review_training_flow() -> void:
	host._open_pet_skill_panel(true)
	host._select_pet_skill_slot(3)
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	_scroll_skill_page(1.0)
	await _hold("trainer_candidates", 7.0)
	var overview = host._panel_flow()._pet_skill_overview_panel
	var candidate_found := false
	if overview != null:
		for card in overview._cards:
			if (
				card != null
				and card.has_method("snapshot")
				and bool(card.call("snapshot").get(
					"isTrainingCandidate",
					false
				))
				and str(card.call("snapshot").get("skillId", "")) == (
					"pet_sleep_powder"
				)
			):
				card.emit_signal("pressed")
				candidate_found = true
				break
	if not candidate_found:
		_fail_capture("未找到训练候选 pet_sleep_powder")
		return
	await host.get_tree().process_frame
	if (
		not host._dialog_is_open()
		or str(host.active_dialog_interaction.get("actionType", "")) != (
			"pet_skill_overwrite"
		)
	):
		_fail_capture("训练候选未打开覆盖确认")
		return
	await _hold("trainer_overwrite_confirmation", 6.0)
	var coins_before := PlayerProgressModel.stone_coins(host.player_profile)
	host._confirm_dialog_action()
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	var selected := PlayerProgressModel.pet_instance_by_id(
		host.player_profile,
		BUI_INSTANCE_ID
	)
	var slots := PlayerProgressModel.pet_skill_slots_for_instance(selected)
	var learned_skill := str(slots[2]) if slots.size() >= 3 else ""
	var expected_coins := coins_before - PetSkillTrainingModel.skill_cost(
		"pet_sleep_powder"
	)
	if (
		learned_skill != "pet_sleep_powder"
		or PlayerProgressModel.stone_coins(host.player_profile) != (
			expected_coins
		)
	):
		_fail_capture("训练确认后技能槽或石币没有按规则更新")
		return
	_scroll_skill_page(1.0)
	await _hold("trainer_learning_result", 5.0)
	overview = host._panel_flow()._pet_skill_overview_panel
	var clear_action_found := false
	if overview != null:
		for card in overview._cards:
			if (
				card != null
				and card.has_method("snapshot")
				and bool(card.call("snapshot").get("isClearAction", false))
			):
				card.emit_signal("pressed")
				clear_action_found = true
				break
	if not clear_action_found:
		_fail_capture("学习后没有显示清空技能槽操作")
		return
	await host.get_tree().process_frame
	if (
		not host._dialog_is_open()
		or host.dialog_option_button == null
		or str(host.dialog_option_button.text) != "清空"
	):
		_fail_capture("清空技能槽没有打开确认")
		return
	await _hold("trainer_clear_confirmation", 4.0)
	var coins_before_clear := PlayerProgressModel.stone_coins(
		host.player_profile
	)
	host._confirm_dialog_action()
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	selected = PlayerProgressModel.pet_instance_by_id(
		host.player_profile,
		BUI_INSTANCE_ID
	)
	slots = PlayerProgressModel.pet_skill_slots_for_instance(selected)
	if (
		str(slots[2]) != ""
		or PlayerProgressModel.stone_coins(host.player_profile) != (
			coins_before_clear
		)
	):
		_fail_capture("清空技能槽后配置或石币不正确")
		return
	_scroll_skill_page(0.28)
	await _hold("trainer_clear_result", 5.0)


func _scroll_skill_page(ratio: float) -> void:
	var scroll = host.pet_detail_scroll
	if not (scroll is ScrollContainer):
		return
	var scroll_bar := (scroll as ScrollContainer).get_v_scroll_bar()
	var max_scroll := maxi(
		0,
		int(ceil(scroll_bar.max_value - scroll_bar.page))
	)
	(scroll as ScrollContainer).scroll_vertical = int(
		round(float(max_scroll) * clampf(ratio, 0.0, 1.0))
	)


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"PET_SKILL_PAGE_OWNER_REVIEW_CHAPTER chapter=%s frame=%d "
			+ "seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	_failed = true
	push_error("PET_SKILL_PAGE_OWNER_REVIEW_FAILED %s" % message)
	host.get_tree().quit(1)
