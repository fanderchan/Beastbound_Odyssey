extends RefCounted

const PetPaidResetClientModel := preload("res://scripts/progression/pet_paid_reset_client_model.gd")
const PetPaidResetPanel := preload("res://scripts/ui/pet_paid_reset_panel.gd")
const GmPetPaidResetQaClientModel := preload("res://scripts/progression/gm_pet_paid_reset_qa_client_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")


static func run(host) -> void:
	host.profile_save_enabled = false
	var contract := PetPaidResetClientModel.contract_check()
	var gm_contract := GmPetPaidResetQaClientModel.contract_check()
	var quote := contract.get("fixture", {}) as Dictionary
	var instance_id := str((quote.get("pet", {}) as Dictionary).get("instanceId", ""))
	var instance := PlayerProgressModel.create_pet_instance_from_form(
		instance_id,
		"重置验收·二转四灵",
		"rebirth_starter_four_spirit_cub",
		PlayerProgressModel.PET_STATE_STANDBY,
		88,
		{"binding": "bound"}
	)
	instance["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": 2,
		"enhanceLevel": 3,
		"rebirthGrowthBonus": {"maxHp": 0.8, "attack": 0.2, "defense": 0.1, "quick": 0.1},
		"history": [],
		"lastPreview": {},
		"lastResult": {},
	}
	instance["paidResetCount"] = 0
	var profile := PlayerProgressModel.default_profile()
	profile["petInstances"] = [instance]
	profile["activePetInstanceId"] = instance_id
	host.player_profile = PlayerProgressModel.normalize_profile(profile)
	host.pet_selected_instance_id = instance_id
	host.pet_detail_mode = host.PET_DETAIL_MODE_GROWTH
	host._open_pet_panel()
	await host.get_tree().process_frame
	await host.get_tree().process_frame

	var panel_flow = host._panel_flow()
	var selected := PlayerProgressModel.pet_instance_by_id(host.player_profile, instance_id)
	panel_flow._pet_paid_reset_panel.refresh(selected, quote, true, false, false)
	await _scroll_reset_panel_into_view(host)
	var initial_snapshot: Dictionary = panel_flow._pet_paid_reset_panel.snapshot()
	var initial_screenshot_ok := await _save_viewport(host, OS.get_environment("BEASTBOUND_SCREENSHOT_PATH"))
	await _save_recording_frames(host, OS.get_environment("BEASTBOUND_RECORDING_FRAMES_DIR"), 0, 8)

	await panel_flow._pet_paid_reset_panel._confirm_pressed()
	await host.get_tree().process_frame
	var armed_snapshot: Dictionary = panel_flow._pet_paid_reset_panel.snapshot()
	var armed_screenshot_ok := await _save_viewport(host, OS.get_environment("BEASTBOUND_CONFIRM_SCREENSHOT_PATH"))
	await _save_recording_frames(host, OS.get_environment("BEASTBOUND_RECORDING_FRAMES_DIR"), 8, 12)

	var callback_quotes: Array[Dictionary] = []
	var hidden_parent := VBoxContainer.new()
	hidden_parent.visible = false
	host.add_child(hidden_parent)
	var test_panel = PetPaidResetPanel.new()
	test_panel.mount(
		hidden_parent,
		Callable(),
		func(value: Dictionary) -> void: callback_quotes.append(value.duplicate(true))
	)
	test_panel.refresh(selected, quote, true, false, false)
	await test_panel._confirm_pressed()
	var first_click_did_not_submit := callback_quotes.is_empty() and bool(test_panel.snapshot().get("armed", false))
	await test_panel._confirm_pressed()
	var second_click_submitted_once := (
		callback_quotes.size() == 1
		and PetPaidResetClientModel.confirmation_fingerprint(callback_quotes[0])
			== PetPaidResetClientModel.confirmation_fingerprint(quote)
	)
	hidden_parent.queue_free()

	var private_quote := quote.duplicate(true)
	private_quote["privateSeed"] = "must-not-render"
	var altered_consequences := quote.duplicate(true)
	(altered_consequences.get("consequences", {}) as Dictionary)["clears"] = ["level_and_exp"]
	var strict_contract_ok := (
		bool(contract.get("ok", false))
		and bool(gm_contract.get("ok", false))
		and PetPaidResetClientModel.normalized_quote(private_quote).is_empty()
		and PetPaidResetClientModel.normalized_quote(altered_consequences).is_empty()
	)
	var ui_ok := (
		bool(initial_snapshot.get("visible", false))
		and bool(initial_snapshot.get("quoteValid", false))
		and not bool(initial_snapshot.get("armed", false))
		and str(initial_snapshot.get("summary", "")).find("Lv88・2转 → Lv1・0转") >= 0
		and str(initial_snapshot.get("price", "")).find("300钻石") >= 0
		and str(initial_snapshot.get("wallet", "")).find("绑定 250钻石 + 非绑定 50钻石") >= 0
		and str(initial_snapshot.get("preserves", "")).find("天生隐藏成长") >= 0
		and str(initial_snapshot.get("nonRefunded", "")).find("不会返还") < 0
		and str(initial_snapshot.get("buttonText", "")) == "重置回 Lv1・0转"
		and bool(armed_snapshot.get("armed", false))
		and str(armed_snapshot.get("buttonText", "")).find("再次确认支付 300钻石") >= 0
		and str(armed_snapshot.get("status", "")).find("立即扣款") >= 0
	)
	var status := "ok" if (
		strict_contract_ok
		and ui_ok
		and first_click_did_not_submit
		and second_click_submitted_once
		and initial_screenshot_ok
		and armed_screenshot_ok
	) else "failed"
	print("pet paid reset UI check ready: status=%s contract=%s gm_contract=%s ui=%s first_click=%s second_click=%s initial_shot=%s confirm_shot=%s initial_button=%s armed_button=%s" % [
		status,
		str(strict_contract_ok),
		str(bool(gm_contract.get("ok", false))),
		str(ui_ok),
		str(first_click_did_not_submit),
		str(second_click_submitted_once),
		str(initial_screenshot_ok),
		str(armed_screenshot_ok),
		str(initial_snapshot.get("buttonText", "")),
		str(armed_snapshot.get("buttonText", "")),
	])
	host.get_tree().quit(0 if status == "ok" else 1)


static func _scroll_reset_panel_into_view(host) -> void:
	if host.pet_detail_scroll == null:
		return
	await host.get_tree().process_frame
	var scroll_bar: VScrollBar = host.pet_detail_scroll.get_v_scroll_bar()
	host.pet_detail_scroll.scroll_vertical = roundi(scroll_bar.max_value)
	await host.get_tree().process_frame
	await host.get_tree().process_frame


static func _save_viewport(host, path: String) -> bool:
	var normalized_path := path.strip_edges()
	if normalized_path == "":
		return true
	DirAccess.make_dir_recursive_absolute(normalized_path.get_base_dir())
	var image: Image = await _capture_complete_image(host)
	return image != null and image.save_png(normalized_path) == OK


static func _save_recording_frames(host, directory: String, start_index: int, count: int) -> bool:
	var normalized_directory := directory.strip_edges()
	if normalized_directory == "":
		return true
	DirAccess.make_dir_recursive_absolute(normalized_directory)
	for offset in range(count):
		await host.get_tree().create_timer(0.08).timeout
		var image: Image = await _capture_complete_image(host)
		if image == null or image.save_png(normalized_directory.path_join("frame_%03d.png" % (start_index + offset))) != OK:
			return false
	return true


static func _capture_complete_image(host) -> Image:
	# Metal's presentation texture may expose the incomplete half of a swap while
	# the normal window is still drawing. Wait for a complete frame instead of
	# accepting a technically valid but mostly black evidence image.
	for _attempt in range(8):
		await host.get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image: Image = host.get_viewport().get_texture().get_image()
		if image == null or image.get_width() < 64 or image.get_height() < 64:
			continue
		var sample_points := [
			Vector2i(image.get_width() / 10, image.get_height() / 7),
			Vector2i(image.get_width() / 2, image.get_height() / 7),
			Vector2i(image.get_width() * 9 / 10, image.get_height() / 7),
			Vector2i(image.get_width() / 10, image.get_height() * 6 / 7),
			Vector2i(image.get_width() / 2, image.get_height() / 2),
			Vector2i(image.get_width() * 9 / 10, image.get_height() * 6 / 7),
		]
		var complete_samples := 0
		for point in sample_points:
			var sample := image.get_pixel(point.x, point.y)
			if sample.r + sample.g + sample.b > 0.05:
				complete_samples += 1
		if complete_samples >= 5:
			return image
	return null
