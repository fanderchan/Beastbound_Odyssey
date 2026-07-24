extends RefCounted

## One-process, one-movie owner review for every combat-impact cue family.
##
## Real combat segments are fed into Main's normal event queue, so BattleModel,
## ledger creation, presentation timing and the runtime audio controller remain
## the only path that decides what is heard and when. Explicitly unavailable
## gameplay is labelled as a reserved cue rather than faked as a shipped rule.

const AudioImpactReviewModel := preload(
	"res://scripts/audio/audio_impact_review_model.gd"
)
const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetActionAssetCatalog := preload(
	"res://scripts/pet/pet_action_asset_catalog.gd"
)

const SECTION_LEAD_SECONDS := 0.90
const STEP_LABEL_LEAD_SECONDS := 0.38
const EVENT_TIMEOUT_SECONDS := 12.0
const LOW_BGM_VOLUME := 0.18
const REVIEW_SFX_VOLUME := 0.86

var host
var _overlay_root: PanelContainer
var _title_label: Label
var _note_label: Label
var _baseline_state: Dictionary = {}
var _original_audio_settings: Dictionary = {}
var _original_profile_save_enabled: bool = true
var _profile_save_setting_captured: bool = false
var _review_clock_msec: int = 0
var _review_clock_configured: bool = false
var _qa_preview_forms_enabled_by_review: Array[String] = []
var _finishing: bool = false


func _init(host_node) -> void:
	host = host_node


func run() -> void:
	var contract_errors := AudioImpactReviewModel.validation_errors()
	if not contract_errors.is_empty():
		push_error(
			"战斗音效集中验收合同无效：%s"
			% "；".join(contract_errors)
		)
		await _finish(1)
		return
	if (
		host == null
		or not is_instance_valid(host)
		or host.game_audio_manager == null
		or not is_instance_valid(host.game_audio_manager)
	):
		push_error("战斗音效集中验收缺少有效的 Main 或 GameAudioManager")
		await _finish(1)
		return

	var art_errors := _enable_and_warm_review_art()
	if not art_errors.is_empty():
		push_error(
			"战斗音效集中验收美术不可用：%s"
			% "；".join(art_errors)
		)
		await _finish(1)
		return
	_original_audio_settings = host.game_audio_manager.settings_snapshot()
	_original_profile_save_enabled = bool(host.profile_save_enabled)
	_profile_save_setting_captured = true
	host.profile_save_enabled = false
	_review_clock_msec = 0
	host.game_audio_manager.configure_clock_msec(
		Callable(self, "_review_clock_value")
	)
	_review_clock_configured = true
	_apply_review_audio_settings(0.0)
	_build_overlay()

	var state := AudioImpactReviewModel.build_review_state()
	host._start_battle(state)
	await host.get_tree().process_frame
	_baseline_state = host.battle_state.duplicate(true)

	_show_section(
		"第一部分｜无背景音乐",
		"01—18：逐段试听正式动作链中的动作、接触、反应与结果音。"
	)
	await _wait(SECTION_LEAD_SECONDS)
	for step in AudioImpactReviewModel.isolated_steps():
		if not await _play_step(step):
			push_error("战斗音效集中验收失败：%s" % str(step.get("id", "")))
			await _finish(1)
			return

	await _wait(0.85)
	_apply_review_audio_settings(LOW_BGM_VOLUME)
	_show_section(
		"第二部分｜低音量战斗音乐",
		"A—F：复测普通命中、技能、合击、撞边、直线击飞与倒地在实战混音中的可读性。"
	)
	await _wait(SECTION_LEAD_SECONDS)
	for step in AudioImpactReviewModel.low_bgm_steps():
		if not await _play_step(step):
			push_error("低背景音乐复测失败：%s" % str(step.get("id", "")))
			await _finish(1)
			return

	_show_section("试听完成", "请按 01—18 或 A—F 反馈需要返工的声音。")
	await _wait(1.10)
	await _finish(0)


func _play_step(step: Dictionary) -> bool:
	var source_step := AudioImpactReviewModel.source_step_for_mix(step)
	var effective_step := source_step if not source_step.is_empty() else step
	_reset_runtime_for_step(step)
	_show_step(step)
	print(
		"audio impact review step: id=%s number=%s label=%s section=%s frame=%d"
		% [
			str(step.get("id", "")),
			str(step.get("number", "")),
			str(step.get("label", "")),
			str(step.get("section", "")),
			Engine.get_process_frames(),
		]
	)
	await _wait(STEP_LABEL_LEAD_SECONDS)

	var execution := str(effective_step.get("execution", ""))
	var ok := false
	match execution:
		AudioImpactReviewModel.EXECUTION_BATTLE_EVENTS:
			ok = await _play_battle_events(step.get("events", []))
		AudioImpactReviewModel.EXECUTION_CUE_ONLY:
			ok = host._audio_play_cue(
				str(effective_step.get("cueId", "")),
				{"priority": 90}
			)
		AudioImpactReviewModel.EXECUTION_REVIVE_PREVIEW:
			ok = await _play_revive_preview(effective_step)
		AudioImpactReviewModel.EXECUTION_OUTCOME:
			var result_key := str(effective_step.get("result", ""))
			ok = result_key == "victory" or result_key == "defeat"
			if ok:
				host._audio_play_battle_result(result_key)
		_:
			ok = false
	if not ok:
		return false

	await _wait(float(step.get(
		"settleSeconds",
		effective_step.get("settleSeconds", 0.62)
	)))
	return true


func _play_battle_events(raw_events) -> bool:
	var events: Array[Dictionary] = []
	if raw_events is Array:
		for value in raw_events as Array:
			if value is Dictionary:
				events.append((value as Dictionary).duplicate(true))
	if events.is_empty():
		return false

	var guarding_ids: Array[String] = []
	for actor_id_value in host.battle_state.get("guardingActorIds", []):
		var actor_id := str(actor_id_value)
		if actor_id != "" and not guarding_ids.has(actor_id):
			guarding_ids.append(actor_id)
	for event in events:
		if str(event.get("type", "")) != "defend":
			continue
		var defender_id := str(event.get("attackerId", ""))
		if defender_id != "" and not guarding_ids.has(defender_id):
			guarding_ids.append(defender_id)
	host.battle_state["guardingActorIds"] = guarding_ids
	host.battle_enemy_response_pending = false
	host.battle_round_end_status_processed = true
	host.battle_event_queue = events
	host.battle_state["phase"] = "round_events"
	host._play_next_battle_event()
	return await _wait_until_events_finish()


func _wait_until_events_finish() -> bool:
	var elapsed := 0.0
	while elapsed < EVENT_TIMEOUT_SECONDS:
		var busy: bool = (
			not host.battle_current_event.is_empty()
			or not host.battle_event_queue.is_empty()
			or str(host.battle_state.get("phase", "")) == "round_events"
		)
		if not busy:
			return true
		await host.get_tree().process_frame
		var frame_delta := maxf(
			host.get_process_delta_time(),
			1.0 / 120.0
		)
		elapsed += frame_delta
		_review_clock_msec += int(round(frame_delta * 1000.0))
	return false


func _play_revive_preview(step: Dictionary) -> bool:
	var cue_id := str(step.get("cueId", "combat.revive"))
	if not host._audio_play_cue(cue_id, {"priority": 90}):
		return false

	var actor_id := AudioImpactReviewModel.ENEMY_FOCUS_ID
	var actor := BattleModel.actor_by_id(host.battle_state, actor_id)
	if actor.is_empty():
		return false
	var form_id := str(
		actor.get("formId", actor.get("templateId", ""))
	).strip_edges()
	var catalog_action := PetActionAssetCatalog.action_for_battle_state(
		"revive",
		form_id
	)
	var frame_count := PetActionAssetCatalog.frame_count_for_action(
		form_id,
		catalog_action
	)
	var action_fps := PetActionAssetCatalog.action_fps(
		catalog_action,
		form_id
	)
	host.battle_state["reviewVisualOnly"] = true
	host.battle_state["reviewVisualActorId"] = actor_id
	host.battle_state["reviewVisualAction"] = "revive"
	host.battle_state["reviewVisualPhase"] = "revive"
	_set_review_actor_fields(actor_id, {
		"hp": 0,
		"actionState": "revive",
		"reviewActionProgress": 0.0,
		"reviewActionFrameIndex": 1,
	})
	host.queue_redraw()

	if catalog_action == "revive" and frame_count > 0 and action_fps > 0.0:
		for frame_index in range(frame_count):
			var progress := float(frame_index) / float(frame_count)
			_set_review_actor_fields(actor_id, {
				"reviewActionProgress": progress,
				"reviewActionFrameIndex": frame_index + 1,
			})
			host.queue_redraw()
			await _wait(1.0 / action_fps)
	else:
		# The cue remains honestly marked as reserved. A missing optional visual
		# action must not be converted into a fake authoritative revive event.
		await _wait(0.62)

	actor = BattleModel.actor_by_id(host.battle_state, actor_id)
	var restored_hp := maxi(
		1,
		int(ceil(float(actor.get("maxHp", 1)) * 0.25))
	)
	_set_review_actor_fields(
		actor_id,
		{
			"hp": restored_hp,
			"actionState": "idle",
		},
		["reviewActionProgress", "reviewActionFrameIndex"]
	)
	host.battle_state["reviewVisualPhase"] = "idle"
	host.queue_redraw()
	return true


func _reset_runtime_for_step(step: Dictionary) -> void:
	host._audio_end_battle_event()
	host.battle_state = AudioImpactReviewModel.prepared_state_for_step(
		_baseline_state,
		step
	)
	host.battle_active = true
	host.battle_action_timer = 0.0
	host.battle_current_event_duration = 0.0
	host.battle_end_pending = false
	host.battle_enemy_response_pending = false
	host.battle_event_advance_pending = false
	host.battle_round_end_status_processed = true
	host.battle_current_event.clear()
	host.battle_event_queue.clear()
	host.battle_current_event_actor_snapshots.clear()
	host.battle_float_texts.clear()
	host.battle_last_event_type = ""
	host.battle_last_event_target_id = ""
	host.battle_last_event_target_ids.clear()
	host.battle_last_event_damage = 0
	host.battle_last_event_heal = 0
	host.battle_last_event_launch = false
	host.battle_last_event_launch_mode = ""
	host.battle_last_event_ledger.clear()
	host._set_battle_message(
		"%s：%s。"
		% [str(step.get("number", "")), str(step.get("label", ""))]
	)
	host.queue_redraw()


func _set_review_actor_fields(
	actor_id: String,
	fields: Dictionary,
	erase_fields: Array[String] = []
) -> void:
	var actors: Array = host.battle_state.get("actors", [])
	var actor_index := BattleModel.actor_index(host.battle_state, actor_id)
	if actor_index < 0:
		return
	var actor := (actors[actor_index] as Dictionary).duplicate(true)
	for key in fields.keys():
		actor[str(key)] = fields[key]
	for key in erase_fields:
		actor.erase(key)
	actors[actor_index] = actor
	host.battle_state["actors"] = actors


func _apply_review_audio_settings(music_volume: float) -> void:
	if (
		host == null
		or not is_instance_valid(host)
		or host.game_audio_manager == null
		or not is_instance_valid(host.game_audio_manager)
	):
		return
	host.game_audio_manager.set_muted(false, false)
	host.game_audio_manager.set_sfx_volume(REVIEW_SFX_VOLUME, false)
	host.game_audio_manager.set_music_volume(
		clampf(music_volume, 0.0, 1.0),
		false
	)


func _restore_original_audio_settings() -> void:
	if (
		_original_audio_settings.is_empty()
		or host == null
		or not is_instance_valid(host)
		or host.game_audio_manager == null
		or not is_instance_valid(host.game_audio_manager)
	):
		return
	host.game_audio_manager.set_music_volume(
		float(_original_audio_settings.get("musicVolume", 0.72)),
		false
	)
	host.game_audio_manager.set_sfx_volume(
		float(_original_audio_settings.get("sfxVolume", 0.86)),
		false
	)
	host.game_audio_manager.set_muted(
		bool(_original_audio_settings.get("muted", false)),
		false
	)


func _build_overlay() -> void:
	if host.hud_root == null:
		return
	_overlay_root = PanelContainer.new()
	_overlay_root.name = "AudioImpactReviewOverlay"
	_overlay_root.z_index = 80
	_overlay_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay_root.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_overlay_root.offset_left = 176.0
	_overlay_root.offset_top = 12.0
	_overlay_root.offset_right = -176.0
	_overlay_root.offset_bottom = 94.0

	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.025, 0.055, 0.055, 0.94)
	panel_style.border_color = Color(0.92, 0.69, 0.24, 0.95)
	panel_style.set_border_width_all(2)
	panel_style.set_corner_radius_all(10)
	panel_style.content_margin_left = 18.0
	panel_style.content_margin_right = 18.0
	panel_style.content_margin_top = 8.0
	panel_style.content_margin_bottom = 8.0
	_overlay_root.add_theme_stylebox_override("panel", panel_style)

	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 2)
	_overlay_root.add_child(column)

	_title_label = Label.new()
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_font_size_override("font_size", 23)
	_title_label.add_theme_color_override(
		"font_color",
		Color(1.0, 0.86, 0.46, 1.0)
	)
	column.add_child(_title_label)

	_note_label = Label.new()
	_note_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_note_label.add_theme_font_size_override("font_size", 14)
	_note_label.add_theme_color_override(
		"font_color",
		Color(0.80, 0.88, 0.84, 0.96)
	)
	_note_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_note_label)
	host.hud_root.add_child(_overlay_root)


func _show_section(title: String, note: String) -> void:
	if _title_label != null:
		_title_label.text = title
	if _note_label != null:
		_note_label.text = note


func _show_step(step: Dictionary) -> void:
	var section_text := (
		"无背景音乐"
		if str(step.get("section", "")) == AudioImpactReviewModel.SECTION_ISOLATED
		else "低音量战斗音乐"
	)
	var note := str(step.get("note", "")).strip_edges()
	if note == "":
		note = "动作、接触与反应均使用正式战斗播放链。"
	_show_section(
		"%s｜%s  %s"
		% [
			section_text,
			str(step.get("number", "")),
			str(step.get("label", "")),
		],
		note
	)


func _wait(seconds: float) -> void:
	if (
		host == null
		or not is_instance_valid(host)
		or host.get_tree() == null
	):
		return
	var duration := maxf(0.0, seconds)
	await host.get_tree().create_timer(duration).timeout
	_review_clock_msec += int(round(duration * 1000.0))


func _review_clock_value() -> int:
	return _review_clock_msec


func _enable_and_warm_review_art() -> Array[String]:
	var errors: Array[String] = []
	for form_id in [
		AudioImpactReviewModel.ALLY_FORM_ID,
		AudioImpactReviewModel.ENEMY_FORM_ID,
	]:
		if not PetActionAssetCatalog.is_qa_preview_enabled(form_id):
			if not PetActionAssetCatalog.enable_qa_preview_form(form_id):
				errors.append("无法启用待审动作：%s" % form_id)
				continue
			_qa_preview_forms_enabled_by_review.append(form_id)
		if not PetActionAssetCatalog.supports_form(form_id):
			errors.append("动作目录不支持形态：%s" % form_id)
			continue
		for action in PetActionAssetCatalog.FULL_BATTLE_ACTIONS:
			if not PetActionAssetCatalog.battle_actions_for_form(form_id).has(action):
				errors.append("%s 缺少动作 %s" % [form_id, action])
		if not PetActionAssetCatalog.warm_battle_form(form_id):
			errors.append("动作资源预热失败：%s" % form_id)
	return errors


func _finish(exit_code: int) -> void:
	if _finishing:
		return
	_finishing = true
	if host != null and is_instance_valid(host):
		host._audio_end_battle_event()
		_restore_original_audio_settings()
		if (
			_review_clock_configured
			and host.game_audio_manager != null
			and is_instance_valid(host.game_audio_manager)
		):
			host.game_audio_manager.configure_clock_msec(Callable())
			_review_clock_configured = false
		if _profile_save_setting_captured:
			host.profile_save_enabled = _original_profile_save_enabled
		if (
			host.game_audio_manager != null
			and is_instance_valid(host.game_audio_manager)
		):
			host.game_audio_manager.stop_all()
		if _overlay_root != null and is_instance_valid(_overlay_root):
			_overlay_root.queue_free()
		if host.get_tree() != null:
			# AudioServer releases active playback objects asynchronously.
			await host.get_tree().process_frame
			await host.get_tree().process_frame
			# MovieWriter may still draw the frame in which process_frame
			# resumes. Wait until that final frame is submitted before removing
			# review-only art, otherwise a disabled form flashes as a runtime
			# placeholder in the last encoded frame.
			await RenderingServer.frame_post_draw
		# Keep review-only battle art alive through the two recorded drain
		# frames. Disabling it earlier exposes runtime placeholders at the tail
		# of an otherwise valid owner-review movie.
		for form_id in _qa_preview_forms_enabled_by_review:
			PetActionAssetCatalog.disable_qa_preview_form(form_id)
		_qa_preview_forms_enabled_by_review.clear()
		if host.get_tree() != null:
			host.get_tree().quit(exit_code)
