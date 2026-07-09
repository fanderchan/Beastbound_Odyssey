extends RefCounted

const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const PetSkillTrainingModel := preload("res://scripts/progression/pet_skill_training_model.gd")
const PlayerProgressModel := preload("res://scripts/progression/player_progress_model.gd")
const QuestModel := preload("res://scripts/progression/quest_model.gd")
const ServerAuthClientModel := preload("res://scripts/progression/server_auth_client_model.gd")

const DIALOG_ACTION_ACK := "ack"
const DIALOG_ACTION_CLAIM_QUEST := "claim_quest"
const DIALOG_ACTION_TALK_QUEST := "talk_quest"
const DIALOG_ACTION_CLAIM_OPTIONAL_QUEST := "claim_optional_quest"
const DIALOG_ACTION_TALK_OPTIONAL_QUEST := "talk_optional_quest"
const DIALOG_ACTION_HEAL := "heal"
const DIALOG_ACTION_RECORD_POINT := "record_point"
const DIALOG_ACTION_PET_SKILL_TRAIN := "pet_skill_train"
const DIALOG_ACTION_PET_SKILL_OVERWRITE := "pet_skill_overwrite"
const DIALOG_ACTION_STABLE := "stable"
const DIALOG_ACTION_SHOP := "shop"
const DIALOG_ACTION_OPEN_QUEST := "open_quest"
const DIALOG_ACTION_REBIRTH := "rebirth"
const DIALOG_ACTION_BACKPACK_UNLOCK := "backpack_unlock"
const DIALOG_ACTION_GUARDIAN_BATTLE := "guardian_battle"
const DIALOG_ACTION_CLAIM_MM_STAGE2 := "claim_mm_stage2"
const DIALOG_ACTION_START_MM_GUIDE := "start_mm_guide"
const DIALOG_ACTION_FAMILY_MANOR := "family_manor"
const DIALOG_ACTION_BANK := "bank"

var host


func _init(host_ref) -> void:
	host = host_ref

func _open_quest_panel() -> void:
	if not host.battle_active:
		host._set_hang_mode(false)
	_close_dialog()
	host._close_encounter()
	host._close_player_status_panel()
	host._close_backpack_panel()
	host._close_equipment_panel()
	host._close_shop_panel()
	host._close_pet_panel()
	host._close_pet_skill_panel()
	host._close_codex_panel()
	host._close_map_panel()
	host._close_chat_panel()
	host._close_mailbox_panel()
	host._close_training_partner_panel()
	host._close_auto_settings_panel()
	host.quest_panel.visible = true
	host.player_profile = PlayerProgressModel.normalize_profile(host.player_profile)
	_refresh_quest_panel()
	host._sync_battle_buttons()
	host._layout_hud()

func _close_quest_panel() -> void:
	host._hide_control(host.quest_panel)

func _refresh_quest_panel() -> void:
	if host.quest_panel == null or host.quest_title_label == null or host.quest_detail_label == null:
		return
	var quest = PlayerProgressModel.active_quest(host.player_profile)
	if quest.is_empty():
		var available_quest = host._first_available_unfinished_quest_for_tracker()
		if not available_quest.is_empty():
			var route_hint = host._quest_route_hint(available_quest, QuestModel.objective_for(available_quest))
			var lines: Array[String] = [
				"可接任务：%s" % QuestModel.title_for(available_quest),
				"目标：%s" % QuestModel.objective_text_for(available_quest),
			]
			var summary := str(available_quest.get("summary", ""))
			if summary != "":
				lines.append("说明：%s" % summary)
			var reward_text := QuestModel.reward_text(available_quest)
			if reward_text != "":
				lines.append("奖励：%s" % reward_text)
			if route_hint != "":
				lines.append("地点：%s" % route_hint)
			host.quest_title_label.text = "可接任务"
			host.quest_detail_label.text = "\n".join(lines)
			_set_quest_reward_controls({}, "")
			if host.quest_route_button != null:
				host.quest_route_button.text = "前往接取"
				host.quest_route_button.disabled = host.battle_active or host._current_task_navigation_target().is_empty()
			return
		var mm_guide = host._pet_rebirth_mm_guide_task_info(true)
		if not mm_guide.is_empty():
			var mm_lines: Array[String] = []
			for line in mm_guide.get("detailLines", []):
				mm_lines.append(str(line))
			var mm_target_value = mm_guide.get("target", {})
			var mm_target := mm_target_value as Dictionary if mm_target_value is Dictionary else {}
			var mm_map_id := str(mm_target.get("mapId", ""))
			var mm_label = host._navigation_target_display_label(mm_target) if not mm_target.is_empty() else ""
			if mm_label != "":
				var mm_map_prefix = "%s / " % host._map_name_for_id(mm_map_id) if mm_map_id != "" else ""
				mm_lines.append("地点：%s%s" % [mm_map_prefix, mm_label])
			host.quest_title_label.text = str(mm_guide.get("title", "宠物转生教学"))
			host.quest_detail_label.text = "\n".join(mm_lines)
			_set_quest_reward_controls({}, "")
			if host.quest_route_button != null:
				host.quest_route_button.text = "自动寻路"
				host.quest_route_button.disabled = host.battle_active or mm_target.is_empty()
			return
		var trial = host._rebirth_trial_task_info(true)
		if not trial.is_empty():
			var trial_lines: Array[String] = []
			for line in trial.get("detailLines", []):
				trial_lines.append(str(line))
			var target_value = trial.get("target", {})
			var target := target_value as Dictionary if target_value is Dictionary else {}
			var map_id := str(target.get("mapId", ""))
			var label = host._navigation_target_display_label(target) if not target.is_empty() else ""
			if label != "":
				var map_prefix = "%s / " % host._map_name_for_id(map_id) if map_id != "" else ""
				trial_lines.append("地点：%s%s" % [map_prefix, label])
			host.quest_title_label.text = str(trial.get("title", "转生试炼"))
			host.quest_detail_label.text = "\n".join(trial_lines)
			_set_quest_reward_controls({}, "")
			if host.quest_route_button != null:
				host.quest_route_button.text = "自动寻路"
				host.quest_route_button.disabled = host.battle_active or target.is_empty()
			return
		host.quest_title_label.text = "任务"
		host.quest_detail_label.text = "当前没有任务。\n可以继续探索、捕捉宠物，或等待新的任务链开放。"
		_set_quest_reward_controls({}, "")
		if host.quest_route_button != null:
			host.quest_route_button.text = "自动寻路"
			host.quest_route_button.disabled = true
		return
	host.quest_title_label.text = QuestModel.title_for(quest)
	var objective := QuestModel.objective_for(quest)
	var state = PlayerProgressModel.active_quest_state(host.player_profile)
	var reward_text = PlayerProgressModel.quest_reward_text(host.player_profile)
	var progress := int(state.get("progress", 0))
	var required := QuestModel.objective_required_count(quest)
	var status := str(state.get("status", QuestModel.STATUS_ACTIVE))
	var status_text := "进行中"
	if status == QuestModel.STATUS_READY:
		status_text = "可领取"
	elif status == QuestModel.STATUS_CLAIMED:
		status_text = "已完成"
	var lines: Array[String] = [
		"任务：%s" % QuestModel.title_for(quest),
		"状态：%s" % status_text,
		"目标：%s" % QuestModel.objective_text_for(quest),
		"进度：%d/%d" % [progress, required],
	]
	if reward_text != "":
		lines.append("奖励：%s" % reward_text)
	var reward_equipment_lines := QuestModel.reward_equipment_detail_lines(quest)
	if not reward_equipment_lines.is_empty():
		lines.append("奖励装备：")
		for reward_equipment_line in reward_equipment_lines:
			lines.append("- %s" % reward_equipment_line)
	var route_hint = host._quest_route_hint(quest, objective)
	if route_hint != "":
		lines.append("地点：%s" % route_hint)
	host.quest_detail_label.text = "\n".join(lines)
	_set_quest_reward_controls(quest, status)
	if host.quest_route_button != null:
		host.quest_route_button.text = "自动寻路"
		host.quest_route_button.disabled = host.battle_active or host._navigation_target_for_quest(quest).is_empty()

func _set_quest_reward_controls(quest: Dictionary, status: String) -> void:
	var can_claim = status == QuestModel.STATUS_READY and PlayerProgressModel.can_claim_active_quest(host.player_profile)
	var choices: Array[Dictionary] = []
	if not quest.is_empty():
		choices = QuestModel.reward_choices(quest)
	if host.quest_reward_choice_option != null:
		host.quest_reward_choice_option.visible = can_claim and not choices.is_empty()
		host.quest_reward_choice_option.clear()
		var selected_index := 0
		if not choices.is_empty():
			var selected_id = host.quest_selected_reward_choice_id
			var valid_selected := false
			for index in range(choices.size()):
				var choice := choices[index]
				var choice_id := str(choice.get("id", ""))
				host.quest_reward_choice_option.add_item(str(choice.get("label", QuestModel.reward_bundle_text(choice))))
				host.quest_reward_choice_option.set_item_metadata(index, choice_id)
				if choice_id == selected_id:
					selected_index = index
					valid_selected = true
			if not valid_selected:
				selected_id = str(choices[0].get("id", ""))
				selected_index = 0
				host.quest_selected_reward_choice_id = selected_id
			host.quest_reward_choice_option.select(selected_index)
		else:
			host.quest_selected_reward_choice_id = ""
	if host.quest_claim_button != null:
		host.quest_claim_button.visible = can_claim
		host.quest_claim_button.disabled = host.battle_active or host.quest_action_request_pending or not can_claim or (not choices.is_empty() and host.quest_selected_reward_choice_id == "")
		host.quest_claim_button.text = "领取中" if host.quest_action_request_pending else "领取奖励"

func _on_quest_reward_choice_selected(index: int) -> void:
	if host.quest_reward_choice_option == null or index < 0 or index >= host.quest_reward_choice_option.item_count:
		return
	host.quest_selected_reward_choice_id = str(host.quest_reward_choice_option.get_item_metadata(index))
	if host.quest_claim_button != null:
		host.quest_claim_button.disabled = host.battle_active or host.quest_selected_reward_choice_id == ""

func _on_quest_claim_pressed() -> void:
	if host.battle_active:
		_refresh_quest_panel()
		return
	if host.quest_action_request_pending:
		return
	var quest = PlayerProgressModel.active_quest(host.player_profile)
	var choice_id = host.quest_selected_reward_choice_id if QuestModel.has_reward_choices(quest) else ""
	if host._is_server_account_session():
		var parsed = await host._submit_server_quest_claim(str(quest.get("id", "")), choice_id)
		host._set_world_log_message("\n".join(host._string_array_values(parsed.get("logLines", []))))
		if bool(parsed.get("ok", false)):
			host.quest_selected_reward_choice_id = ""
		_refresh_quest_panel()
		if host.status_label != null:
			host._update_hud_text()
		return
	if host._local_profile_mutation_blocked_for_server_only("领取任务奖励"):
		return
	var claim_result = PlayerProgressModel.claim_active_quest(host.player_profile, choice_id)
	host.player_profile = claim_result.get("profile", host.player_profile)
	if bool(claim_result.get("ok", false)):
		host._mark_progress_ui_caches_dirty()
	if bool(claim_result.get("ok", false)) and host.profile_save_enabled:
		host._save_player_profile_now()
	host._set_world_log_message(str(claim_result.get("message", "")))
	if bool(claim_result.get("ok", false)):
		host.quest_selected_reward_choice_id = ""
	_refresh_quest_panel()
	if host.status_label != null:
		host._update_hud_text()

func _on_quest_route_pressed() -> void:
	if host.battle_active:
		_refresh_quest_panel()
		return
	var target = host._current_task_navigation_target()
	if target.is_empty():
		host._set_world_log_message("当前任务没有可寻路目标。")
		return
	_close_quest_panel()
	host._route_to_quest_target(target)

func _on_task_tracker_route_pressed() -> void:
	var target = host._current_task_navigation_target()
	if target.is_empty():
		host._set_world_log_message("当前任务没有可寻路目标。")
		_refresh_task_route_button()
		return
	host._route_to_quest_target(target)
	_refresh_task_route_button()

func _refresh_task_route_button() -> void:
	if host.task_route_button == null:
		return
	var has_target = host._task_tracker_has_navigation_target_cached()
	host.task_route_button.disabled = host.battle_active or host.encounter_active or host.has_pending_interaction or _dialog_is_open() or host._world_menu_is_open() or not has_target
	host.task_route_button.visible = not host.battle_active
	host.task_route_button.text = "自动寻路"

func _open_interaction_dialog(item: Dictionary) -> void:
	host.active_dialog_interaction = item.duplicate(true)
	if host.player != null:
		host.player.face_direction(InteractionModel.marker_world_position(host.map_data, item) - host.player.global_position)
	_update_dialog_text()
	host.dialog_panel.move_to_front()
	host.dialog_panel.visible = true
	host._layout_hud()
	if _dialog_item_is_healer(item) and host._hang_pending_healer_resume():
		host.call_deferred("_auto_apply_hang_healer_if_open")

func _close_dialog() -> void:
	if host.dialog_panel != null:
		host.dialog_panel.visible = false
	host.active_dialog_interaction.clear()

func _dialog_is_open() -> bool:
	return host.dialog_panel != null and host.dialog_panel.visible

func _confirm_dialog_action() -> void:
	if host.active_dialog_interaction.is_empty():
		return
	_perform_dialog_action(_dialog_primary_action_id(host.active_dialog_interaction))

func _perform_dialog_action(action_id: String) -> void:
	if host.active_dialog_interaction.is_empty():
		return
	match action_id:
		DIALOG_ACTION_CLAIM_QUEST:
			_claim_dialog_quest_reward()
		DIALOG_ACTION_TALK_QUEST:
			_complete_dialog_talk_quest()
		DIALOG_ACTION_CLAIM_OPTIONAL_QUEST:
			_claim_dialog_optional_quest_reward()
		DIALOG_ACTION_TALK_OPTIONAL_QUEST:
			_complete_dialog_optional_talk_quest()
		DIALOG_ACTION_HEAL:
			host._apply_dialog_healer()
		DIALOG_ACTION_RECORD_POINT:
			host._save_record_point_from_dialog()
		DIALOG_ACTION_PET_SKILL_TRAIN:
			var trainer_id = str(host.active_dialog_interaction.get("trainerId", PetSkillTrainingModel.DEFAULT_TRAINER_ID))
			_close_dialog()
			host._open_pet_skill_panel(true, trainer_id)
		DIALOG_ACTION_PET_SKILL_OVERWRITE:
			host._apply_pet_skill_overwrite_from_dialog()
		DIALOG_ACTION_STABLE:
			_close_dialog()
			host._open_pet_panel(true)
		DIALOG_ACTION_SHOP:
			var next_shop_id = str(host.active_dialog_interaction.get("shopId", ""))
			_close_dialog()
			host._open_shop_panel(next_shop_id)
		DIALOG_ACTION_OPEN_QUEST:
			_close_dialog()
			_open_quest_panel()
		DIALOG_ACTION_REBIRTH:
			_close_dialog()
			host._open_player_rebirth_preview_panel()
		DIALOG_ACTION_BACKPACK_UNLOCK:
			host._unlock_backpack_slot_from_dialog()
		DIALOG_ACTION_GUARDIAN_BATTLE:
			host._start_guardian_battle_from_dialog()
		DIALOG_ACTION_CLAIM_MM_STAGE2:
			host._claim_pet_rebirth_mm_stage2_from_dialog()
		DIALOG_ACTION_START_MM_GUIDE:
			host._start_pet_rebirth_mm_guide_from_dialog()
		DIALOG_ACTION_FAMILY_MANOR:
			var manor_id = str(host.active_dialog_interaction.get("manorId", ""))
			_close_dialog()
			host._open_family_panel_for_manor(manor_id)
		DIALOG_ACTION_BANK:
			_close_dialog()
			host._open_bank_panel()
		_:
			_close_dialog()

func _run_server_dialog_quest_claim(quest_id: String = "") -> void:
	var parsed = await host._submit_server_quest_claim(quest_id)
	host._set_world_log_message("\n".join(host._string_array_values(parsed.get("logLines", []))))
	if bool(parsed.get("ok", false)):
		_close_dialog()
	else:
		_update_dialog_text()
	if host.status_label != null:
		host._update_hud_text()

func _run_server_dialog_quest_record(event: Dictionary, quest_id: String = "") -> void:
	var position_sync := await _sync_server_position_for_dialog_quest()
	if not bool(position_sync.get("ok", false)):
		host._set_world_log_message(str(position_sync.get("message", "位置同步失败，请稍后再试。")))
		_update_dialog_text()
		if host.status_label != null:
			host._update_hud_text()
		return
	var parsed = await host._submit_server_quest_record(event, quest_id)
	var log_lines = host._string_array_values(parsed.get("logLines", []))
	if not log_lines.is_empty():
		host._set_world_log_message("\n".join(log_lines))
	if bool(parsed.get("ok", false)) and server_quest_record_should_close_dialog(parsed):
		_close_dialog()
		if host.status_label != null:
			host._update_hud_text()
		return
	_update_dialog_text()

func _sync_server_position_for_dialog_quest() -> Dictionary:
	if not host._is_server_account_session():
		return {"ok": true}
	var payload: Dictionary = host._current_online_map_payload()
	var spec = ServerAuthClientModel.player_position_update_request(
		host._server_profile_base_url(),
		host._server_profile_token(),
		payload
	)
	var response = await host._auto_http_request_spec(spec)
	var parsed = ServerAuthClientModel.parse_player_position_update_response(
		int(response.get("responseCode", 0)),
		response.get("body", PackedByteArray()) as PackedByteArray
	)
	if not bool(parsed.get("ok", false)):
		if ServerAuthClientModel.is_session_invalid_response(parsed):
			var session_message := str(parsed.get("message", "登录已过期，请重新登录。"))
			host._handle_server_session_expired(session_message)
			return {"ok": false, "message": session_message}
		if host._apply_server_step_move_authority_position(parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}, true, true):
			return await _sync_server_position_for_dialog_quest_after_correction()
		return {"ok": false, "message": str(parsed.get("message", "位置同步失败，请稍后再试。"))}
	var own_position = parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
	if host._should_apply_online_self_position(own_position):
		host._apply_server_step_move_authority_position(own_position, true)
	elif host._server_step_move_should_report_authority_cell():
		host._apply_server_step_move_authority_position(own_position)
	if parsed.has("players"):
		host._apply_online_position_players(parsed.get("players", []))
	return {"ok": true}

func _sync_server_position_for_dialog_quest_after_correction() -> Dictionary:
	var payload: Dictionary = host._current_online_map_payload()
	var spec = ServerAuthClientModel.player_position_update_request(
		host._server_profile_base_url(),
		host._server_profile_token(),
		payload
	)
	var response = await host._auto_http_request_spec(spec)
	var parsed = ServerAuthClientModel.parse_player_position_update_response(
		int(response.get("responseCode", 0)),
		response.get("body", PackedByteArray()) as PackedByteArray
	)
	if bool(parsed.get("ok", false)):
		var own_position = parsed.get("position", {}) as Dictionary if parsed.get("position", {}) is Dictionary else {}
		if host._should_apply_online_self_position(own_position):
			host._apply_server_step_move_authority_position(own_position, true)
		elif host._server_step_move_should_report_authority_cell():
			host._apply_server_step_move_authority_position(own_position)
		if parsed.has("players"):
			host._apply_online_position_players(parsed.get("players", []))
		return {"ok": true}
	return {"ok": false, "message": str(parsed.get("message", "位置已按服务器纠正，请走近后再试。"))}

static func server_quest_record_should_close_dialog(parsed: Dictionary) -> bool:
	if not bool(parsed.get("ok", false)):
		return false
	if parsed.get("profile", null) is Dictionary:
		return true
	var progress = parsed.get("progress", {}) as Dictionary if parsed.get("progress", {}) is Dictionary else {}
	if bool(progress.get("changed", false)) or bool(progress.get("ready", false)):
		return true
	var quest_messages = parsed.get("questMessages", [])
	return quest_messages is Array and not (quest_messages as Array).is_empty()

func _claim_dialog_quest_reward() -> void:
	if host.active_dialog_interaction.is_empty():
		return
	if host.quest_action_request_pending:
		return
	if not _active_dialog_can_claim_quest():
		_update_dialog_text()
		return
	if PlayerProgressModel.active_quest_has_reward_choices(host.player_profile):
		_close_dialog()
		_open_quest_panel()
		host._set_world_log_message("请选择任务奖励。")
		return
	if host._is_server_account_session():
		_run_server_dialog_quest_claim()
		return
	if host._local_profile_mutation_blocked_for_server_only("领取任务奖励"):
		return
	var claim_result = PlayerProgressModel.claim_active_quest(host.player_profile)
	host.player_profile = claim_result.get("profile", host.player_profile)
	if bool(claim_result.get("ok", false)):
		host._mark_progress_ui_caches_dirty()
	if bool(claim_result.get("ok", false)) and host.profile_save_enabled:
		host._save_player_profile_now()
	host._set_world_log_message(str(claim_result.get("message", "")))
	if bool(claim_result.get("ok", false)):
		_close_dialog()
	else:
		_update_dialog_text()
	if host.status_label != null:
		host._update_hud_text()

func _claim_dialog_optional_quest_reward() -> void:
	if host.active_dialog_interaction.is_empty():
		return
	if host.quest_action_request_pending:
		return
	var quest = _optional_dialog_quest(host.active_dialog_interaction)
	var quest_id := str(quest.get("id", ""))
	if quest_id == "" or not PlayerProgressModel.can_claim_optional_quest(host.player_profile, quest_id):
		_update_dialog_text()
		return
	if host._is_server_account_session():
		_run_server_dialog_quest_claim(quest_id)
		return
	if host._local_profile_mutation_blocked_for_server_only("领取任务奖励"):
		return
	var claim_result = PlayerProgressModel.claim_optional_quest(host.player_profile, quest_id)
	host.player_profile = claim_result.get("profile", host.player_profile)
	if bool(claim_result.get("ok", false)):
		host._mark_progress_ui_caches_dirty()
	if bool(claim_result.get("ok", false)) and host.profile_save_enabled:
		host._save_player_profile_now()
	host._set_world_log_message(str(claim_result.get("message", "")))
	if bool(claim_result.get("ok", false)):
		_close_dialog()
	else:
		_update_dialog_text()
	if host.status_label != null:
		host._update_hud_text()

func _complete_dialog_talk_quest() -> void:
	if host.active_dialog_interaction.is_empty():
		return
	if host.quest_action_request_pending:
		return
	if host._is_server_account_session():
		_run_server_dialog_quest_record({
			"type": "talk",
			"targetId": str(host.active_dialog_interaction.get("id", "")),
		})
		return
	if host._local_profile_mutation_blocked_for_server_only("任务进度"):
		return
	var quest_messages = host._record_quest_event_and_maybe_claim({
		"type": "talk",
		"targetId": str(host.active_dialog_interaction.get("id", "")),
	})
	if not quest_messages.is_empty():
		if host.profile_save_enabled:
			host._save_player_profile_now()
		host._set_world_log_message("\n".join(quest_messages))
		_close_dialog()
		if host.status_label != null:
			host._update_hud_text()
		return
	_update_dialog_text()

func _complete_dialog_optional_talk_quest() -> void:
	if host.active_dialog_interaction.is_empty():
		return
	if host.quest_action_request_pending:
		return
	var quest = _optional_dialog_quest(host.active_dialog_interaction)
	var quest_id := str(quest.get("id", ""))
	if quest_id == "":
		_update_dialog_text()
		return
	if host._is_server_account_session():
		_run_server_dialog_quest_record({
			"type": "talk",
			"targetId": str(host.active_dialog_interaction.get("id", "")),
		}, quest_id)
		return
	if host._local_profile_mutation_blocked_for_server_only("任务进度"):
		return
	var messages: Array[String] = []
	var progress_result = PlayerProgressModel.record_optional_quest_event(host.player_profile, quest_id, {
		"type": "talk",
		"targetId": str(host.active_dialog_interaction.get("id", "")),
	})
	host.player_profile = progress_result.get("profile", host.player_profile)
	if bool(progress_result.get("changed", false)):
		host._mark_progress_ui_caches_dirty()
		if bool(progress_result.get("ready", false)) and QuestModel.auto_claim_on_ready(quest) and not QuestModel.has_reward_choices(quest):
			var claim_result = PlayerProgressModel.claim_optional_quest(host.player_profile, quest_id)
			host.player_profile = claim_result.get("profile", host.player_profile)
			host._mark_progress_ui_caches_dirty()
			messages.append(str(claim_result.get("message", "")))
		else:
			messages.append(str(progress_result.get("message", "")))
	var filtered: Array[String] = []
	for message in messages:
		var text := message.strip_edges()
		if text != "":
			filtered.append(text)
	if not filtered.is_empty():
		if host.profile_save_enabled:
			host._save_player_profile_now()
		host._set_world_log_message("\n".join(filtered))
		_close_dialog()
		if host.status_label != null:
			host._update_hud_text()
		return
	_update_dialog_text()

func _dialog_primary_action_id(item: Dictionary) -> String:
	if _active_dialog_can_claim_quest():
		return DIALOG_ACTION_CLAIM_QUEST
	if _active_dialog_matches_talk_quest(item):
		return DIALOG_ACTION_TALK_QUEST
	if _optional_dialog_can_claim_quest(item):
		return DIALOG_ACTION_CLAIM_OPTIONAL_QUEST
	if _optional_dialog_matches_talk_quest(item):
		return DIALOG_ACTION_TALK_OPTIONAL_QUEST
	if _dialog_item_is_healer(item):
		return DIALOG_ACTION_HEAL
	if _dialog_item_is_record_point(item):
		return DIALOG_ACTION_RECORD_POINT
	if _dialog_item_is_pet_skill_trainer(item):
		return DIALOG_ACTION_PET_SKILL_TRAIN
	if _dialog_item_is_pet_skill_overwrite(item):
		return DIALOG_ACTION_PET_SKILL_OVERWRITE
	if _dialog_item_is_stable(item):
		return DIALOG_ACTION_STABLE
	if _dialog_item_is_bank(item):
		return DIALOG_ACTION_BANK
	if _dialog_item_is_rebirth(item):
		return DIALOG_ACTION_REBIRTH
	if _dialog_item_is_family_manor(item):
		return DIALOG_ACTION_FAMILY_MANOR
	if _dialog_item_is_backpack_unlock(item):
		return DIALOG_ACTION_BACKPACK_UNLOCK
	if _dialog_item_is_pet_rebirth_mm_trial(item):
		var mm_guide = PlayerProgressModel.pet_rebirth_mm_guide_info(host.player_profile)
		var mm_status := str(mm_guide.get("status", ""))
		var mm_step := str(mm_guide.get("step", ""))
		if mm_status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_AVAILABLE:
			return DIALOG_ACTION_START_MM_GUIDE
		if mm_status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_ACTIVE and mm_step == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STEP_CLAIM_MM:
			return DIALOG_ACTION_GUARDIAN_BATTLE
		if mm_status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED:
			return DIALOG_ACTION_GUARDIAN_BATTLE
		return DIALOG_ACTION_ACK
	if _dialog_item_is_guardian_battle(item):
		return DIALOG_ACTION_GUARDIAN_BATTLE
	if _dialog_item_is_pet_rebirth_mm_stage2_claim(item):
		return DIALOG_ACTION_CLAIM_MM_STAGE2
	if str(item.get("shopId", "")) != "":
		return DIALOG_ACTION_SHOP
	return DIALOG_ACTION_ACK

func _dialog_action_label(item: Dictionary, action_id: String) -> String:
	match action_id:
		DIALOG_ACTION_CLAIM_QUEST:
			return "选择奖励" if PlayerProgressModel.active_quest_has_reward_choices(host.player_profile) else "领取奖励"
		DIALOG_ACTION_TALK_QUEST:
			return "完成"
		DIALOG_ACTION_CLAIM_OPTIONAL_QUEST:
			return "领取奖励"
		DIALOG_ACTION_TALK_OPTIONAL_QUEST:
			return "完成"
		DIALOG_ACTION_HEAL:
			return str(item.get("option", "治疗队伍"))
		DIALOG_ACTION_RECORD_POINT:
			return str(item.get("option", "保存"))
		DIALOG_ACTION_PET_SKILL_TRAIN:
			return str(item.get("option", "训练"))
		DIALOG_ACTION_PET_SKILL_OVERWRITE:
			return str(item.get("option", "覆盖"))
		DIALOG_ACTION_STABLE:
			return str(item.get("option", "兽栏"))
		DIALOG_ACTION_BANK:
			return str(item.get("option", "银行"))
		DIALOG_ACTION_SHOP:
			return str(item.get("option", "买卖"))
		DIALOG_ACTION_OPEN_QUEST:
			return "查看任务"
		DIALOG_ACTION_REBIRTH:
			return str(item.get("option", "转生"))
		DIALOG_ACTION_BACKPACK_UNLOCK:
			return str(item.get("option", "同意"))
		DIALOG_ACTION_GUARDIAN_BATTLE:
			return str(item.get("option", "挑战"))
		DIALOG_ACTION_CLAIM_MM_STAGE2:
			return "已领取" if PlayerProgressModel.pet_rebirth_mm_stage2_claimed(host.player_profile) else str(item.get("option", "领取"))
		DIALOG_ACTION_START_MM_GUIDE:
			return "开始教学"
		DIALOG_ACTION_FAMILY_MANOR:
			return str(item.get("option", "庄园战"))
	return str(item.get("option", "知道了"))

func _dialog_action_options(item: Dictionary) -> Array[Dictionary]:
	var primary_action := _dialog_primary_action_id(item)
	var options: Array[Dictionary] = [{
		"id": primary_action,
		"label": _dialog_action_label(item, primary_action),
	}]
	if _dialog_item_is_bank(item) and primary_action != DIALOG_ACTION_BANK:
		options.append({
			"id": DIALOG_ACTION_BANK,
			"label": _dialog_action_label(item, DIALOG_ACTION_BANK),
		})
	if _dialog_should_offer_quest_button(item):
		options.append({
			"id": DIALOG_ACTION_OPEN_QUEST,
			"label": _dialog_action_label(item, DIALOG_ACTION_OPEN_QUEST),
		})
	return options

func _dialog_should_offer_quest_button(item: Dictionary) -> bool:
	if PlayerProgressModel.active_quest(host.player_profile).is_empty():
		return false
	if _active_dialog_can_claim_quest() or _active_dialog_matches_talk_quest(item):
		return false
	return _dialog_quest_hint_for(item) != ""

func _refresh_dialog_action_buttons(item: Dictionary) -> void:
	if host.dialog_option_button == null:
		return
	for button in host.dialog_secondary_buttons:
		if button == null:
			continue
		if host.dialog_button_row != null and button.get_parent() == host.dialog_button_row:
			host.dialog_button_row.remove_child(button)
		button.queue_free()
	host.dialog_secondary_buttons.clear()
	var options := _dialog_action_options(item)
	var primary := options[0] if not options.is_empty() else {"id": DIALOG_ACTION_ACK, "label": "知道了"}
	host.dialog_option_button.text = str(primary.get("label", "知道了"))
	host.dialog_option_button.visible = true
	host.dialog_option_button.disabled = false
	if host.dialog_close_button != null:
		host.dialog_close_button.text = "取消" if str(item.get("actionType", "")) == DIALOG_ACTION_PET_SKILL_OVERWRITE else "离开"
	if host.dialog_button_row == null:
		return
	for index in range(1, options.size()):
		var option := options[index] as Dictionary
		var action_id := str(option.get("id", DIALOG_ACTION_ACK))
		var button := Button.new()
		button.text = str(option.get("label", "操作"))
		button.custom_minimum_size = Vector2(112, 48)
		button.add_theme_font_size_override("font_size", 16)
		button.pressed.connect(_perform_dialog_action.bind(action_id))
		host.dialog_button_row.add_child(button)
		host.dialog_secondary_buttons.append(button)
	if host.dialog_close_button != null and host.dialog_close_button.get_parent() == host.dialog_button_row:
		host.dialog_button_row.move_child(host.dialog_close_button, host.dialog_button_row.get_child_count() - 1)

func _dialog_secondary_button_texts() -> Array[String]:
	var result: Array[String] = []
	for button in host.dialog_secondary_buttons:
		if button != null:
			result.append(button.text)
	return result

func _update_dialog_text() -> void:
	if host.active_dialog_interaction.is_empty():
		return
	host.dialog_name_label.text = str(host.active_dialog_interaction.get("name", "交互"))
	host.dialog_body_label.text = _dialog_body_for(host.active_dialog_interaction)
	_refresh_dialog_action_buttons(host.active_dialog_interaction)

func _dialog_body_for(item: Dictionary) -> String:
	var lines: Array = item.get("dialog", [])
	if lines.is_empty():
		return "%s：暂时没有更多内容。" % str(item.get("name", "这里"))
	var text_parts: Array[String] = []
	for line in lines:
		text_parts.append(str(line))
	var healer_hint := _dialog_healer_hint_for(item)
	if healer_hint != "":
		text_parts.append("")
		text_parts.append(healer_hint)
	var record_hint := _dialog_record_point_hint_for(item)
	if record_hint != "":
		text_parts.append("")
		text_parts.append(record_hint)
	var mm_stage2_hint := _dialog_pet_rebirth_mm_stage2_hint_for(item)
	if mm_stage2_hint != "":
		text_parts.append("")
		text_parts.append(mm_stage2_hint)
	var mm_guide_hint := _dialog_pet_rebirth_mm_guide_hint_for(item)
	if mm_guide_hint != "":
		text_parts.append("")
		text_parts.append(mm_guide_hint)
	var quest_hint := _dialog_quest_hint_for(item)
	if quest_hint == "":
		quest_hint = _dialog_optional_quest_hint_for(item)
	if quest_hint != "":
		text_parts.append("")
		text_parts.append(quest_hint)
	return "\n".join(text_parts)

func _dialog_option_text(item: Dictionary) -> String:
	return _dialog_action_label(item, _dialog_primary_action_id(item))

func _active_dialog_is_healer() -> bool:
	return _dialog_item_is_healer(host.active_dialog_interaction)

func _dialog_item_is_healer(item: Dictionary) -> bool:
	return bool(item.get("healer", false)) or str(item.get("actionType", "")) == "healer"

func _active_dialog_is_record_point() -> bool:
	return _dialog_item_is_record_point(host.active_dialog_interaction)

func _dialog_item_is_record_point(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == "record_point" or str(item.get("kind", "")) == "record_point"

func _active_dialog_is_pet_skill_trainer() -> bool:
	return _dialog_item_is_pet_skill_trainer(host.active_dialog_interaction)

func _dialog_item_is_pet_skill_trainer(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == "pet_skill_trainer"

func _dialog_item_is_pet_skill_overwrite(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == DIALOG_ACTION_PET_SKILL_OVERWRITE

func _active_dialog_is_stable() -> bool:
	return _dialog_item_is_stable(host.active_dialog_interaction)

func _dialog_item_is_stable(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == InteractionModel.FACILITY_STABLE or str(item.get("kind", "")) == InteractionModel.FACILITY_STABLE

func _dialog_item_is_bank(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == DIALOG_ACTION_BANK or str(item.get("kind", "")) == InteractionModel.FACILITY_BANK or str(item.get("facilityType", "")) == InteractionModel.FACILITY_BANK


func _dialog_item_is_rebirth(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == InteractionModel.FACILITY_REBIRTH or str(item.get("kind", "")) == InteractionModel.FACILITY_REBIRTH

func _dialog_item_is_family_manor(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == DIALOG_ACTION_FAMILY_MANOR or str(item.get("kind", "")) == DIALOG_ACTION_FAMILY_MANOR

func _dialog_item_is_backpack_unlock(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == DIALOG_ACTION_BACKPACK_UNLOCK

func _dialog_item_is_guardian_battle(item: Dictionary) -> bool:
	return (
		str(item.get("actionType", "")) == DIALOG_ACTION_GUARDIAN_BATTLE
		or str(item.get("kind", "")) == InteractionModel.FACILITY_GUARDIAN
		or str(item.get("encounterGroupId", "")) != "" and str(item.get("encounterZoneId", "")) != ""
	)

func _dialog_item_is_pet_rebirth_mm_trial(item: Dictionary) -> bool:
	return str(item.get("id", "")) == "firebud_pet_mm_trial_mentor"

func _dialog_item_is_pet_rebirth_mm_stage2_claim(item: Dictionary) -> bool:
	return str(item.get("actionType", "")) == DIALOG_ACTION_CLAIM_MM_STAGE2

func _dialog_pet_rebirth_mm_stage2_hint_for(item: Dictionary) -> String:
	if not _dialog_item_is_pet_rebirth_mm_stage2_claim(item):
		return ""
	return "领取状态：已领取。之后可在钻石铺购买2转MM蛋。" if PlayerProgressModel.pet_rebirth_mm_stage2_claimed(host.player_profile) else "领取状态：可领取一次。"

func _dialog_pet_rebirth_mm_guide_hint_for(item: Dictionary) -> String:
	if not _dialog_item_is_pet_rebirth_mm_trial(item):
		return ""
	var info = PlayerProgressModel.pet_rebirth_mm_guide_info(host.player_profile)
	var status := str(info.get("status", ""))
	if status == PlayerProgressModel.PET_REBIRTH_MM_GUIDE_STATUS_COMPLETED:
		return "循环任务：挑战成功后领取 Lv1 1转小MM。"
	var lines: Array[String] = []
	lines.append("任务：%s" % str(info.get("title", "宠物转生教学")))
	for line in info.get("detailLines", []):
		lines.append(str(line))
	return "\n".join(lines)
func _dialog_record_point_hint_for(item: Dictionary) -> String:
	if not _dialog_item_is_record_point(item):
		return ""
	var current_point = PlayerProgressModel.record_point(host.player_profile)
	var current_label := str(current_point.get("label", PlayerProgressModel.DEFAULT_RECORD_POINT_LABEL))
	var next_point := _record_point_data_for_dialog(item)
	var next_label := str(next_point.get("label", "记录点"))
	return "当前记录点：%s\n保存为：%s" % [current_label, next_label]

func _record_point_data_for_dialog(item: Dictionary) -> Dictionary:
	var data = item.get("recordPoint", {})
	if data is Dictionary:
		var value := data as Dictionary
		return {
			"mapId": str(value.get("mapId", host.current_map_id)),
			"spawnName": str(value.get("spawnName", "default")),
			"label": str(value.get("label", item.get("name", "记录点"))),
		}
	return {
		"mapId": host.current_map_id,
		"spawnName": "default",
		"label": str(item.get("name", "记录点")),
	}

func _dialog_healer_hint_for(item: Dictionary) -> String:
	if not _dialog_item_is_healer(item):
		return ""
	var quote = PlayerProgressModel.village_healer_quote(host.player_profile)
	var missing := int(quote.get("missingHp", 0))
	var cost := int(quote.get("cost", 0))
	var coins := int(quote.get("stoneCoins", 0))
	if missing <= 0:
		return "队伍生命已满。\n石币 %d" % coins
	if coins < cost:
		return "需恢复 %d 生命。\n预计费用 %d 石币\n石币不足" % [missing, cost]
	return "需恢复 %d 生命。\n预计费用 %d 石币\n石币 %d" % [missing, cost, coins]

func _active_dialog_can_claim_quest() -> bool:
	if host.active_dialog_interaction.is_empty():
		return false
	if not PlayerProgressModel.can_claim_active_quest(host.player_profile):
		return false
	return PlayerProgressModel.active_quest_turn_in_id(host.player_profile) == str(host.active_dialog_interaction.get("id", ""))

func _active_dialog_matches_talk_quest(item: Dictionary) -> bool:
	var quest = PlayerProgressModel.active_quest(host.player_profile)
	if quest.is_empty():
		return false
	var state = PlayerProgressModel.active_quest_state(host.player_profile)
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_ACTIVE:
		return false
	return QuestModel.progress_amount_for_event(quest, {
		"type": "talk",
		"targetId": str(item.get("id", "")),
	}) > 0

func _optional_dialog_quest(item: Dictionary) -> Dictionary:
	return PlayerProgressModel.optional_quest_for_interaction(host.player_profile, str(item.get("id", "")))

func _optional_dialog_can_claim_quest(item: Dictionary) -> bool:
	var quest := _optional_dialog_quest(item)
	if quest.is_empty():
		return false
	return PlayerProgressModel.can_claim_optional_quest(host.player_profile, str(quest.get("id", ""))) and QuestModel.turn_in_id_for(quest) == str(item.get("id", ""))

func _optional_dialog_matches_talk_quest(item: Dictionary) -> bool:
	var quest := _optional_dialog_quest(item)
	if quest.is_empty():
		return false
	var state = PlayerProgressModel.quest_state_for_id(host.player_profile, str(quest.get("id", "")))
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) != QuestModel.STATUS_ACTIVE:
		return false
	return QuestModel.progress_amount_for_event(quest, {
		"type": "talk",
		"targetId": str(item.get("id", "")),
	}) > 0

func _dialog_quest_hint_for(item: Dictionary) -> String:
	var quest = PlayerProgressModel.active_quest(host.player_profile)
	if quest.is_empty():
		return ""
	var item_id := str(item.get("id", ""))
	var objective := QuestModel.objective_for(quest)
	var relevant := false
	if item_id == QuestModel.giver_id_for(quest) or item_id == QuestModel.turn_in_id_for(quest):
		relevant = true
	if str(objective.get("targetId", "")) == item_id:
		relevant = true
	if str(item.get("shopId", "")) != "" and str(objective.get("shopId", "")) == str(item.get("shopId", "")):
		relevant = true
	if not relevant:
		return ""
	var lines: Array[String] = []
	if PlayerProgressModel.can_claim_active_quest(host.player_profile) and item_id == QuestModel.turn_in_id_for(quest):
		lines.append("任务完成：%s" % QuestModel.title_for(quest))
		if QuestModel.has_reward_choices(quest):
			lines.append("请在任务面板选择奖励。")
	else:
		lines.append("任务：%s" % QuestModel.title_for(quest))
		lines.append(QuestModel.objective_text_for(quest))
	var reward_text = PlayerProgressModel.quest_reward_text(host.player_profile)
	if reward_text != "":
		lines.append("奖励：%s" % reward_text)
	var reward_equipment_lines := QuestModel.reward_equipment_detail_lines(quest)
	if not reward_equipment_lines.is_empty():
		lines.append("奖励装备：")
		for reward_equipment_line in reward_equipment_lines:
			lines.append("- %s" % reward_equipment_line)
	return "\n".join(lines)

func _dialog_optional_quest_hint_for(item: Dictionary) -> String:
	var quest := _optional_dialog_quest(item)
	if quest.is_empty():
		return ""
	var item_id := str(item.get("id", ""))
	var state = PlayerProgressModel.quest_state_for_id(host.player_profile, str(quest.get("id", "")))
	var lines: Array[String] = []
	if str(state.get("status", QuestModel.STATUS_ACTIVE)) == QuestModel.STATUS_READY and item_id == QuestModel.turn_in_id_for(quest):
		lines.append("任务完成：%s" % QuestModel.title_for(quest))
	else:
		lines.append("任务：%s" % QuestModel.title_for(quest))
		lines.append(QuestModel.objective_text_for(quest))
	var reward_text := QuestModel.reward_text(quest)
	if reward_text != "":
		lines.append("奖励：%s" % reward_text)
	var reward_equipment_lines := QuestModel.reward_equipment_detail_lines(quest)
	if not reward_equipment_lines.is_empty():
		lines.append("奖励装备：")
		for reward_equipment_line in reward_equipment_lines:
			lines.append("- %s" % reward_equipment_line)
	return "\n".join(lines)
