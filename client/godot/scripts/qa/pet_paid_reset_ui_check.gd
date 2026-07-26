extends RefCounted

const PetPaidResetClientModel := preload("res://scripts/progression/pet_paid_reset_client_model.gd")
const PetTerminalPathModel := preload("res://scripts/progression/pet_terminal_path_model.gd")
const PetPaidResetPanel := preload("res://scripts/ui/pet_paid_reset_panel.gd")
const GmPetPaidResetQaClientModel := preload("res://scripts/progression/gm_pet_paid_reset_qa_client_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")


static func run(host) -> void:
	host.profile_save_enabled = false
	var contract := PetPaidResetClientModel.contract_check()
	var gm_contract := GmPetPaidResetQaClientModel.contract_check()
	var quote := contract.get("fixture", {}) as Dictionary
	var instance_id := str((quote.get("pet", {}) as Dictionary).get("instanceId", ""))
	var instance := PlayerProgressModel.create_pet_instance_from_form(
		instance_id,
		"重置验收·一转四灵",
		"rebirth_starter_four_spirit_cub",
		PlayerProgressModel.PET_STATE_STANDBY,
		88,
		{"binding": "bound"}
	)
	instance["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": 1,
		"enhanceLevel": 3,
		"rebirthGrowthBonus": {"maxHp": 0.8, "attack": 0.2, "defense": 0.1, "quick": 0.1},
		"history": [],
		"lastPreview": {},
		"lastResult": {},
	}
	instance["paidResetCount"] = 0
	instance["growthModelVersion"] = PetPaidResetClientModel.AUTHORITY_MODEL
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
	var normal_stage_one := selected.duplicate(true)
	normal_stage_one["growthModelVersion"] = PetPaidResetClientModel.AUTHORITY_MODEL
	var normal_stage_one_cultivation := (normal_stage_one.get("petCultivation", {}) as Dictionary).duplicate(true)
	normal_stage_one_cultivation["rebirthCount"] = 1
	normal_stage_one["petCultivation"] = normal_stage_one_cultivation
	var normal_stage_two := selected.duplicate(true)
	normal_stage_two["growthModelVersion"] = PetPaidResetClientModel.AUTHORITY_MODEL
	var normal_stage_two_cultivation := (normal_stage_two.get("petCultivation", {}) as Dictionary).duplicate(true)
	normal_stage_two_cultivation["rebirthCount"] = 2
	normal_stage_two["petCultivation"] = normal_stage_two_cultivation
	var normal_stage_one_quote := _quote_for_instance(quote, normal_stage_one)
	var normal_stage_two_quote := _quote_for_instance(quote, normal_stage_two)
	var stage_candidates_ok := (
		not PetTerminalPathModel.is_terminal(normal_stage_one)
		and PetPaidResetClientModel.is_local_candidate(normal_stage_one)
		and PetPaidResetClientModel.quote_matches_instance(normal_stage_one_quote, normal_stage_one)
		and PetTerminalPathModel.is_terminal(normal_stage_two)
		and not PetPaidResetClientModel.is_local_candidate(normal_stage_two)
		and not PetPaidResetClientModel.quote_matches_instance(normal_stage_two_quote, normal_stage_two)
	)
	var lineage_terminals_ok := true
	for lineage_value in [
		{"schemaVersion": 1, "mode": "evolution"},
		{},
		"damaged-lineage",
		null,
	]:
		var lineage_terminal := normal_stage_one.duplicate(true)
		lineage_terminal["evolutionLineage"] = lineage_value
		var lineage_quote := _quote_for_instance(quote, lineage_terminal)
		lineage_terminals_ok = (
			lineage_terminals_ok
			and PetTerminalPathModel.is_evolution_terminal(lineage_terminal)
			and not PetPaidResetClientModel.is_local_candidate(lineage_terminal)
			and not PetPaidResetClientModel.quote_matches_instance(lineage_quote, lineage_terminal)
		)
	var evolution_target_form_ids := PetTerminalPathModel.evolution_target_form_ids()
	var target_without_lineage: Dictionary = {}
	var target_without_lineage_ok := not evolution_target_form_ids.is_empty()
	for target_form_id in evolution_target_form_ids:
		for alias_key in ["formId", "templateId", "speciesId"]:
			var target_terminal := normal_stage_one.duplicate(true)
			target_terminal.erase("evolutionLineage")
			target_terminal["formId"] = ""
			target_terminal["templateId"] = ""
			target_terminal["speciesId"] = ""
			target_terminal[alias_key] = target_form_id
			var target_quote := _quote_for_instance(quote, target_terminal)
			target_without_lineage_ok = (
				target_without_lineage_ok
				and PetTerminalPathModel.is_evolution_terminal(target_terminal)
				and not PetPaidResetClientModel.is_local_candidate(target_terminal)
				and not PetPaidResetClientModel.quote_matches_instance(target_quote, target_terminal)
			)
			if target_without_lineage.is_empty() and alias_key == "formId":
				target_without_lineage = target_terminal
	if target_without_lineage.is_empty():
		target_without_lineage = normal_stage_one.duplicate(true)
		target_without_lineage["evolutionLineage"] = {}
	var stale_target_quote := _quote_for_instance(quote, target_without_lineage)
	var fusion_terminal := normal_stage_one.duplicate(true)
	fusion_terminal["fusionLineage"] = {}
	var fusion_terminal_ok := (
		PetTerminalPathModel.is_terminal(fusion_terminal)
		and not PetPaidResetClientModel.is_local_candidate(fusion_terminal)
		and not PetPaidResetClientModel.quote_matches_instance(
			_quote_for_instance(quote, fusion_terminal),
			fusion_terminal
		)
	)
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
	test_panel.refresh(
		normal_stage_two,
		normal_stage_two_quote,
		PetPaidResetClientModel.is_local_candidate(normal_stage_two),
		false,
		false
	)
	var hidden_stage_two_snapshot: Dictionary = test_panel.snapshot()
	await test_panel._confirm_pressed()
	var hidden_stage_two_did_not_submit := (
		not bool(hidden_stage_two_snapshot.get("visible", true))
		and not bool(hidden_stage_two_snapshot.get("quoteValid", true))
		and callback_quotes.size() == 1
	)
	test_panel.refresh(target_without_lineage, stale_target_quote, false, false, false)
	var hidden_terminal_snapshot: Dictionary = test_panel.snapshot()
	await test_panel._confirm_pressed()
	var hidden_terminal_did_not_submit := (
		not bool(hidden_terminal_snapshot.get("visible", true))
		and not bool(hidden_terminal_snapshot.get("quoteValid", true))
		and callback_quotes.size() == 1
	)
	hidden_parent.queue_free()

	var original_profile: Dictionary = host.player_profile
	var original_session: Dictionary = host.current_account_session
	var original_selected_instance_id: String = host.pet_selected_instance_id
	var original_detail_mode: String = host.pet_detail_mode
	var terminal_profile := PlayerProgressModel.default_profile()
	terminal_profile["petInstances"] = [target_without_lineage]
	terminal_profile["activePetInstanceId"] = str(target_without_lineage.get("instanceId", ""))
	host.player_profile = PlayerProgressModel.normalize_profile(terminal_profile)
	host.pet_selected_instance_id = str(target_without_lineage.get("instanceId", ""))
	host.pet_detail_mode = host.PET_DETAIL_MODE_GROWTH
	host.current_account_session = {
		"authSource": ServerAuthClientModel.SOURCE_SERVER,
		"serverSessionToken": "pet-paid-reset-terminal-check-token",
	}
	panel_flow._pet_paid_reset_quote = stale_target_quote
	panel_flow._pet_paid_reset_quote_pending = false
	var quote_generation_before: int = panel_flow._pet_paid_reset_quote_generation
	panel_flow._refresh_pet_paid_reset_panel()
	var coordinator_terminal_snapshot: Dictionary = panel_flow._pet_paid_reset_panel.snapshot()
	panel_flow._request_pet_paid_reset_quote()
	var terminal_request_blocked: bool = (
		not bool(coordinator_terminal_snapshot.get("visible", true))
		and panel_flow._pet_paid_reset_quote.is_empty()
		and not panel_flow._pet_paid_reset_quote_pending
		and panel_flow._pet_paid_reset_quote_generation == quote_generation_before
	)
	host.player_profile = original_profile
	host.current_account_session = original_session
	host.pet_selected_instance_id = original_selected_instance_id
	host.pet_detail_mode = original_detail_mode
	panel_flow._pet_paid_reset_quote = quote
	panel_flow._pet_paid_reset_quote_pending = false
	panel_flow._refresh_pet_paid_reset_panel()

	var private_quote := quote.duplicate(true)
	private_quote["privateSeed"] = "must-not-render"
	var altered_consequences := quote.duplicate(true)
	(altered_consequences.get("consequences", {}) as Dictionary)["clears"] = ["level_and_exp"]
	var duplicate_evolution_lineage_quote := quote.duplicate(true)
	(duplicate_evolution_lineage_quote.get("consequences", {}) as Dictionary)["preserves"] = (
		(duplicate_evolution_lineage_quote.get("consequences", {}) as Dictionary).get("preserves", []) as Array
	).duplicate()
	((duplicate_evolution_lineage_quote.get("consequences", {}) as Dictionary).get("preserves", []) as Array).append("evolution_lineage")
	var strict_contract_ok := (
		bool(contract.get("ok", false))
		and bool(gm_contract.get("ok", false))
		and stage_candidates_ok
		and lineage_terminals_ok
		and target_without_lineage_ok
		and fusion_terminal_ok
		and ServerAuthClientModel.player_message_from_parsed({
			"ok": false,
			"code": "pet_paid_reset_terminal_stage",
			"message": "pet_paid_reset_terminal_stage",
		}) == "宠物已进入2转、进化或融合终局，不能付费重置。"
		and ServerAuthClientModel.player_message_from_parsed({
			"ok": false,
			"code": "pet_rebirth_terminal_stage",
			"message": "pet_rebirth_terminal_stage",
		}) == "宠物已进入2转、进化或融合终局，不能再进行普通转生。"
		and ((quote.get("consequences", {}) as Dictionary).get("preserves", []) as Array).has("evolution_lineage")
		and not PetPaidResetClientModel.normalized_quote(quote).is_empty()
		and PetPaidResetClientModel.normalized_quote(duplicate_evolution_lineage_quote).is_empty()
		and PetPaidResetClientModel.normalized_quote(private_quote).is_empty()
		and PetPaidResetClientModel.normalized_quote(altered_consequences).is_empty()
	)
	var ui_ok := (
		bool(initial_snapshot.get("visible", false))
		and bool(initial_snapshot.get("quoteValid", false))
		and not bool(initial_snapshot.get("armed", false))
		and str(initial_snapshot.get("summary", "")).find("Lv88・1转 → Lv1・0转") >= 0
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
		and hidden_stage_two_did_not_submit
		and hidden_terminal_did_not_submit
		and terminal_request_blocked
		and initial_screenshot_ok
		and armed_screenshot_ok
	) else "failed"
	print("pet paid reset UI check ready: status=%s contract=%s gm_contract=%s ui=%s stage_contract=%s lineage_terminal=%s target_terminal=%s fusion_terminal=%s hidden_stage2=%s hidden_terminal=%s request_blocked=%s first_click=%s second_click=%s initial_shot=%s confirm_shot=%s initial_button=%s armed_button=%s" % [
		status,
		str(strict_contract_ok),
		str(bool(gm_contract.get("ok", false))),
		str(ui_ok),
		str(stage_candidates_ok),
		str(lineage_terminals_ok),
		str(target_without_lineage_ok),
		str(fusion_terminal_ok),
		str(hidden_stage_two_did_not_submit),
		str(hidden_terminal_did_not_submit),
		str(terminal_request_blocked),
		str(first_click_did_not_submit),
		str(second_click_submitted_once),
		str(initial_screenshot_ok),
		str(armed_screenshot_ok),
		str(initial_snapshot.get("buttonText", "")),
		str(armed_snapshot.get("buttonText", "")),
	])
	host.get_tree().quit(0 if status == "ok" else 1)


static func _quote_for_instance(quote_value: Dictionary, instance: Dictionary) -> Dictionary:
	var result := quote_value.duplicate(true)
	var pet := result.get("pet", {}) as Dictionary
	var cultivation := instance.get("petCultivation", {}) as Dictionary if instance.get("petCultivation", {}) is Dictionary else {}
	pet["instanceId"] = str(instance.get("instanceId", ""))
	pet["formId"] = str(instance.get("formId", instance.get("templateId", "")))
	pet["formName"] = str(instance.get("formName", instance.get("name", "宠物")))
	pet["level"] = maxi(1, int(instance.get("level", 1)))
	pet["rebirthCount"] = int(cultivation.get("rebirthCount", 0))
	pet["enhanceLevel"] = maxi(0, int(cultivation.get("enhanceLevel", 0)))
	pet["binding"] = str(instance.get("binding", "unbound"))
	pet["paidResetCount"] = maxi(0, int(instance.get("paidResetCount", 0)))
	result["pet"] = pet
	return result


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
