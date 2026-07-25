extends RefCounted

const PetEvolutionClientModel := preload("res://scripts/progression/pet_evolution_client_model.gd")
const PetEvolutionPresentationModel := preload("res://scripts/progression/pet_evolution_presentation_model.gd")
const PetEvolutionVisualCatalog := preload("res://scripts/pet/pet_evolution_visual_catalog.gd")
const PetEvolutionPanel := preload("res://scripts/ui/pet_evolution_panel.gd")
const GmPetEvolutionQaClientModel := preload("res://scripts/progression/gm_pet_evolution_qa_client_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")


static func run(host) -> void:
	host.profile_save_enabled = false
	var contract := PetEvolutionClientModel.contract_check()
	var presentation_contract := PetEvolutionPresentationModel.contract_check()
	var gm_contract := GmPetEvolutionQaClientModel.contract_check()
	var quote := contract.get("fixture", {}) as Dictionary
	var instance_id := str((quote.get("pet", {}) as Dictionary).get("instanceId", ""))
	var instance := PlayerProgressModel.create_pet_instance_from_form(
		instance_id,
		"高防乌力",
		"wuli_normal_tough_earth10",
		PlayerProgressModel.PET_STATE_STANDBY,
		140,
		{"binding": "bound"}
	)
	instance["growthModelVersion"] = PetEvolutionClientModel.AUTHORITY_MODEL
	instance["growthSpeciesProfileId"] = "wuli_normal_tough_earth10_v1"
	instance["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": 1,
		"enhanceLevel": 3,
		"rebirthGrowthBonus": {"maxHp": 1.8, "attack": 0.4, "defense": 0.4, "quick": 0.4},
		"history": [],
		"lastPreview": {},
		"lastResult": {},
	}
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
	panel_flow._pet_evolution_panel.refresh(selected, quote, true, false, false)
	await _scroll_evolution_panel_into_view(host, panel_flow._pet_evolution_panel.root)
	var initial_snapshot: Dictionary = panel_flow._pet_evolution_panel.snapshot()
	var initial_screenshot_ok := await _save_viewport(host, OS.get_environment("BEASTBOUND_SCREENSHOT_PATH"))
	await _save_recording_frames(host, OS.get_environment("BEASTBOUND_RECORDING_FRAMES_DIR"), 0, 8)

	await panel_flow._pet_evolution_panel._confirm_pressed()
	await host.get_tree().process_frame
	var armed_snapshot: Dictionary = panel_flow._pet_evolution_panel.snapshot()
	var armed_screenshot_ok := await _save_viewport(host, OS.get_environment("BEASTBOUND_CONFIRM_SCREENSHOT_PATH"))
	await _save_recording_frames(host, OS.get_environment("BEASTBOUND_RECORDING_FRAMES_DIR"), 8, 12)

	var callback_quotes: Array[Dictionary] = []
	var hidden_parent := VBoxContainer.new()
	hidden_parent.visible = false
	host.add_child(hidden_parent)
	var test_panel = PetEvolutionPanel.new()
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
		and PetEvolutionClientModel.confirmation_fingerprint(callback_quotes[0])
			== PetEvolutionClientModel.confirmation_fingerprint(quote)
	)
	hidden_parent.queue_free()

	var target_form_id := "wuli_evolved_crystal_earth8_water2"
	var normal_visual_access_blocked := PetEvolutionVisualCatalog.descriptor_for_target(target_form_id).is_empty()
	var visual_errors := PetEvolutionVisualCatalog.validation_errors_for_form(target_form_id)
	var qa_preview_enabled := PetEvolutionVisualCatalog.enable_qa_preview_form(target_form_id)
	var visual_descriptor := PetEvolutionVisualCatalog.descriptor_for_target(target_form_id)
	var visual_warmed := PetEvolutionVisualCatalog.warm_target_form(target_form_id)
	var visual_contract_ok := (
		normal_visual_access_blocked
		and visual_errors.is_empty()
		and qa_preview_enabled
		and not visual_descriptor.is_empty()
		and int(visual_descriptor.get("frameCount", 0)) == 12
		and is_equal_approx(float(visual_descriptor.get("fps", 0.0)), 12.0)
		and not bool(visual_descriptor.get("loop", true))
		and visual_warmed
	)

	var presentation_fixture := presentation_contract.get("fixture", {}) as Dictionary
	var presentation_operation_id := str(presentation_contract.get("operationId", ""))
	var sequence_before: Dictionary = panel_flow._pet_evolution_sequence_player.snapshot()
	var below_p90_result: Dictionary = await panel_flow._present_pet_evolution_outcome(
		{"ok": false, "code": "pet_evolution_power_below_p90"},
		quote,
		"bbo_contract_evolution_reject_p90",
		true,
		0.01
	)
	var insufficient_result: Dictionary = await panel_flow._present_pet_evolution_outcome(
		{"ok": false, "code": "pet_evolution_assets_insufficient"},
		quote,
		"bbo_contract_evolution_reject_assets",
		true,
		0.01
	)
	var unapplied_result: Dictionary = await panel_flow._present_pet_evolution_outcome(
		presentation_fixture,
		quote,
		"bbo_contract_evolution_unapplied",
		false,
		0.01
	)
	var sequence_after_rejections: Dictionary = panel_flow._pet_evolution_sequence_player.snapshot()
	var first_success: Dictionary = await panel_flow._present_pet_evolution_outcome(
		presentation_fixture,
		quote,
		presentation_operation_id,
		true,
		0.02
	)
	var first_success_snapshot: Dictionary = panel_flow._pet_evolution_sequence_player.snapshot()
	var duplicate_success: Dictionary = await panel_flow._present_pet_evolution_outcome(
		presentation_fixture,
		quote,
		presentation_operation_id,
		true,
		0.02
	)
	var second_success: Dictionary = await panel_flow._present_pet_evolution_outcome(
		presentation_fixture,
		quote,
		"bbo_contract_evolution_presentation_002",
		true,
		0.02
	)
	var sequence_after_successes: Dictionary = panel_flow._pet_evolution_sequence_player.snapshot()
	var expected_frames: Array[int] = []
	for frame_index in range(12):
		expected_frames.append(frame_index)
	var presentation_runtime_ok: bool = (
		not bool(below_p90_result.get("ok", false))
		and not bool(insufficient_result.get("ok", false))
		and not bool(unapplied_result.get("ok", false))
		and int(sequence_after_rejections.get("playedCount", -1)) == int(sequence_before.get("playedCount", -2))
		and bool(first_success.get("ok", false))
		and int(first_success.get("frameCount", 0)) == 12
		and is_equal_approx(float(first_success.get("fps", 0.0)), 12.0)
		and int(first_success_snapshot.get("completedCount", 0)) == int(sequence_before.get("completedCount", 0)) + 1
		and not bool(duplicate_success.get("ok", false))
		and str(duplicate_success.get("reason", "")) == "duplicate"
		and bool(second_success.get("ok", false))
		and int(sequence_after_successes.get("completedCount", 0)) == int(sequence_before.get("completedCount", 0)) + 2
		and int(sequence_after_successes.get("playedCount", 0)) == int(sequence_before.get("playedCount", 0)) + 2
		and sequence_after_successes.get("frameHistory", []) == expected_frames
		and str(sequence_after_successes.get("level", "")) == "晶甲乌力 · Lv1"
	)
	PetEvolutionVisualCatalog.disable_qa_preview_form(target_form_id)

	var private_quote := quote.duplicate(true)
	private_quote["privateSeed"] = "must-not-render"
	var altered_result := quote.duplicate(true)
	(altered_result.get("result", {}) as Dictionary)["preservedHistoryStages"] = [1]
	var strict_contract_ok: bool = (
		bool(contract.get("ok", false))
		and bool(presentation_contract.get("ok", false))
		and bool(gm_contract.get("ok", false))
		and visual_contract_ok
		and presentation_runtime_ok
		and not PetEvolutionClientModel.runtime_enabled()
		and not PetEvolutionClientModel.is_local_candidate(selected)
		and PetEvolutionClientModel.normalized_quote(private_quote).is_empty()
		and PetEvolutionClientModel.normalized_quote(altered_result).is_empty()
	)
	var ui_ok := (
		bool(initial_snapshot.get("visible", false))
		and bool(initial_snapshot.get("quoteValid", false))
		and not bool(initial_snapshot.get("armed", false))
		and str(initial_snapshot.get("summary", "")).find("高防乌力｜1转 Lv140 → 晶甲乌力｜1转 Lv1") >= 0
		and str(initial_snapshot.get("condition", "")).find("同形态前10%") >= 0
		and str(initial_snapshot.get("items", "")).find("共鸣兽核 ✓ 8/8") >= 0
		and str(initial_snapshot.get("stoneCoins", "")).find("绑定 250,000 + 非绑定 50,000") >= 0
		and str(initial_snapshot.get("changes", "")).find("二代 Lv1 血、攻、防、敏与天生成长") >= 0
		and str(initial_snapshot.get("preserves", "")).find("0转/1转成长履历") >= 0
		and str(initial_snapshot.get("terminal", "")).find("不能普通二转或作为融合材料") >= 0
		and str(initial_snapshot.get("buttonText", "")) == "进化为晶甲乌力"
		and bool(armed_snapshot.get("armed", false))
		and str(armed_snapshot.get("buttonText", "")).find("再次确认：消耗材料并重新抽取二代") >= 0
		and str(armed_snapshot.get("status", "")).find("二代4V与天生成长无法预知") >= 0
	)
	var status := "ok" if (
		strict_contract_ok
		and ui_ok
		and first_click_did_not_submit
		and second_click_submitted_once
		and initial_screenshot_ok
		and armed_screenshot_ok
	) else "failed"
	print("pet evolution UI check ready: status=%s contract=%s presentation_contract=%s gm_contract=%s visual=%s presentation_runtime=%s rejected_count=%d completed_count=%d played_count=%d ui=%s first_click=%s second_click=%s initial_shot=%s confirm_shot=%s initial_button=%s armed_button=%s" % [
		status,
		str(strict_contract_ok),
		str(bool(presentation_contract.get("ok", false))),
		str(bool(gm_contract.get("ok", false))),
		str(visual_contract_ok),
		str(presentation_runtime_ok),
		int(sequence_after_rejections.get("playedCount", -1)),
		int(sequence_after_successes.get("completedCount", -1)),
		int(sequence_after_successes.get("playedCount", -1)),
		str(ui_ok),
		str(first_click_did_not_submit),
		str(second_click_submitted_once),
		str(initial_screenshot_ok),
		str(armed_screenshot_ok),
		str(initial_snapshot.get("buttonText", "")),
		str(armed_snapshot.get("buttonText", "")),
	])
	host.get_tree().quit(0 if status == "ok" else 1)


static func _scroll_evolution_panel_into_view(host, panel_root: Control) -> void:
	if host.pet_detail_scroll == null or panel_root == null:
		return
	await host.get_tree().process_frame
	var target_top := panel_root.position.y
	host.pet_detail_scroll.scroll_vertical = maxi(0, roundi(target_top) + 8)
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
