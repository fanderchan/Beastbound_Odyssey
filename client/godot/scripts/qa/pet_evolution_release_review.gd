extends SceneTree

const MAIN_SCENE := preload("res://scenes/Main.tscn")
const PetEvolutionClientModel := preload(
	"res://scripts/progression/pet_evolution_client_model.gd"
)
const PetEvolutionPresentationModel := preload(
	"res://scripts/progression/pet_evolution_presentation_model.gd"
)
const PetEvolutionVisualCatalog := preload(
	"res://scripts/pet/pet_evolution_visual_catalog.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const FPS := 60
const ROUTE_CASES := [
	{
		"routeId": "wuli_crystal_evolution_v1",
		"sourceFormId": "wuli_normal_tough_earth10",
		"sourceProfileId": "wuli_normal_tough_earth10_v1",
		"sourceName": "高防乌力",
		"targetFormId": "wuli_evolved_crystal_earth8_water2",
		"targetProfileId": "wuli_evolved_crystal_earth8_water2_v1",
		"targetName": "晶甲乌力",
	},
	{
		"routeId": "driftfox_moon_gale_evolution_v1",
		"sourceFormId": "driftfox_highland_wind9_earth1",
		"sourceProfileId": "driftfox_highland_wind9_earth1_v1",
		"sourceName": "高地风狐",
		"targetFormId": "driftfox_evolved_moon_gale_wind7_water3",
		"targetProfileId": "driftfox_evolved_moon_gale_wind7_water3_v1",
		"targetName": "月岚风狐",
	},
]

var _host
var _overlay_layer: CanvasLayer
var _overlay_label: Label
var _cover: ColorRect
var _recorded_frames := 0
var _rejected_routes := 0
var _completed_routes := 0


func _initialize() -> void:
	process_frame.connect(_count_recorded_frame)
	call_deferred("_run_review")


func _run_review() -> void:
	if not PetEvolutionClientModel.runtime_enabled():
		push_error("EVOLUTION_RELEASE_REVIEW_ERROR production runtime is closed")
		quit(1)
		return
	var presentation_contract := PetEvolutionPresentationModel.contract_check()
	if not bool(presentation_contract.get("ok", false)):
		push_error("EVOLUTION_RELEASE_REVIEW_ERROR presentation contract failed")
		quit(2)
		return

	_host = MAIN_SCENE.instantiate()
	root.add_child(_host)
	_build_overlay()
	for _index in range(18):
		await _next_frame()
	_configure_audio()
	await _fade_from_black()

	var fixtures := presentation_contract.get("routeFixtures", {}) as Dictionary
	for route_case_value in ROUTE_CASES:
		var route_case := route_case_value as Dictionary
		var route_id := str(route_case.get("routeId", ""))
		var fixture := fixtures.get(route_id, {}) as Dictionary
		if not await _review_route(route_case, fixture):
			await _clean_exit(3)
			return

	_overlay_label.text = (
		"正式进化发布验收完成｜2 条路线｜2 次拒绝零演出、2 次成功 1× 演出"
	)
	await _hold_frames(72)
	await _fade_to_black()
	print(
		(
			"EVOLUTION_RELEASE_REVIEW_END frames=%d seconds=%.3f speed=1.00x "
			+ "runtime=true rejected=%d/2 completed=%d/2 qa_preview=false"
		) % [
			_recorded_frames,
			float(_recorded_frames) / float(FPS),
			_rejected_routes,
			_completed_routes,
		]
	)
	await _clean_exit()


func _review_route(route_case: Dictionary, fixture: Dictionary) -> bool:
	var route_id := str(route_case.get("routeId", ""))
	var target_form_id := str(route_case.get("targetFormId", ""))
	var target_name := str(route_case.get("targetName", ""))
	var quote := (fixture.get("quote", {}) as Dictionary).duplicate(true)
	var outcome := (fixture.get("outcome", {}) as Dictionary).duplicate(true)
	var operation_id := "bbo_release_review_%s_success_0001" % route_id
	var visual_summary := PetEvolutionVisualCatalog.contract_summary(target_form_id)
	if (
		quote.is_empty()
		or outcome.is_empty()
		or str(quote.get("routeId", "")) != route_id
		or not bool(visual_summary.get("ok", false))
		or not bool(visual_summary.get("runtimeEnabled", false))
		or bool(visual_summary.get("qaPreviewEnabled", true))
		or not PetEvolutionVisualCatalog.warm_target_form(target_form_id)
	):
		push_error(
			"EVOLUTION_RELEASE_REVIEW_ERROR normal runtime visual unavailable: %s"
			% route_id
		)
		return false

	var instance_id := str((quote.get("pet", {}) as Dictionary).get("instanceId", ""))
	_install_profile(route_case, instance_id, false)
	_host.pet_selected_instance_id = instance_id
	_host.pet_detail_mode = _host.PET_DETAIL_MODE_GROWTH
	_host._open_pet_panel()
	await _hold_frames(8)
	var panel_flow = _host._panel_flow()
	var source_instance := PlayerProgressModel.pet_instance_by_id(
		_host.player_profile,
		instance_id
	)
	panel_flow._pet_evolution_panel.refresh(
		source_instance,
		quote,
		true,
		false,
		false
	)
	await _scroll_evolution_into_view(panel_flow._pet_evolution_panel.root)
	_overlay_label.text = (
		"%s｜P90 不足样本：服务器拒绝、零扣除、零进化演出｜速度 1×"
		% target_name
	)
	await _hold_frames(66)

	var played_before := int(
		panel_flow._pet_evolution_sequence_player.snapshot().get("playedCount", 0)
	)
	var rejected: Dictionary = await panel_flow._present_pet_evolution_outcome(
		{"ok": false, "code": "pet_evolution_power_below_p90"},
		quote,
		"bbo_release_review_%s_rejected_p90" % route_id,
		true,
		1.0
	)
	var played_after_rejection := int(
		panel_flow._pet_evolution_sequence_player.snapshot().get("playedCount", 0)
	)
	if bool(rejected.get("ok", false)) or played_after_rejection != played_before:
		push_error(
			"EVOLUTION_RELEASE_REVIEW_ERROR rejected route played animation: %s"
			% route_id
		)
		return false
	_rejected_routes += 1
	await _hold_frames(36)

	_install_profile(route_case, instance_id, true)
	outcome["profile"] = _host.player_profile.duplicate(true)
	_overlay_label.text = (
		"%s｜达标样本：权威档案已应用，播放正式 12 FPS 演出｜速度 1×"
		% target_name
	)
	print(
		(
			"EVOLUTION_RELEASE_REVIEW_PLAYBACK_START route=%s target=%s "
			+ "frame=%d speed=1.00x qa_preview=false"
		) % [route_id, target_form_id, _recorded_frames]
	)
	var result: Dictionary = await panel_flow._present_pet_evolution_outcome(
		outcome,
		quote,
		operation_id,
		true,
		1.0
	)
	var snapshot: Dictionary = (
		panel_flow._pet_evolution_sequence_player.snapshot()
	)
	if (
		not bool(result.get("ok", false))
		or int(result.get("frameCount", 0)) != 12
		or not is_equal_approx(float(result.get("fps", 0.0)), 12.0)
		or str(snapshot.get("level", "")) != "%s · Lv1" % target_name
	):
		push_error(
			"EVOLUTION_RELEASE_REVIEW_ERROR successful route failed: %s / %s"
			% [route_id, str(result)]
		)
		return false
	_completed_routes += 1
	print(
		(
			"EVOLUTION_RELEASE_REVIEW_PLAYBACK_END route=%s target=%s "
			+ "frame=%d frames=12 seconds=1.000 speed=1.00x"
		) % [route_id, target_form_id, _recorded_frames]
	)

	_host.pet_selected_instance_id = instance_id
	_host.pet_detail_mode = _host.PET_DETAIL_MODE_GROWTH
	_host._refresh_pet_panel()
	await _scroll_detail_to_top()
	_overlay_label.text = (
		"%s｜已成为 Lv1 终局形态｜不能普通二转、融合或付费重置"
		% target_name
	)
	await _hold_frames(72)
	_host._close_pet_panel()
	await _hold_frames(18)
	return true


func _install_profile(
	route_case: Dictionary,
	instance_id: String,
	target: bool
) -> void:
	_host.profile_save_enabled = false
	var form_id := str(
		route_case.get("targetFormId" if target else "sourceFormId", "")
	)
	var profile_id := str(
		route_case.get("targetProfileId" if target else "sourceProfileId", "")
	)
	var display_name := str(
		route_case.get("targetName" if target else "sourceName", "")
	)
	var instance := PlayerProgressModel.create_pet_instance_from_form(
		instance_id,
		display_name,
		form_id,
		PlayerProgressModel.PET_STATE_STANDBY,
		1 if target else 140,
		{"binding": "bound"}
	)
	instance["growthModelVersion"] = PetEvolutionClientModel.AUTHORITY_MODEL
	instance["growthSpeciesProfileId"] = profile_id
	instance["petCultivation"] = {
		"schemaVersion": 1,
		"rebirthCount": 1,
		"enhanceLevel": 3,
		"rebirthGrowthBonus": {
			"maxHp": 1.8,
			"attack": 0.4,
			"defense": 0.4,
			"quick": 0.4,
		},
		"history": [],
		"lastPreview": {},
		"lastResult": {},
	}
	var profile := PlayerProgressModel.default_profile()
	profile["petInstances"] = [instance]
	profile["activePetInstanceId"] = instance_id
	_host.player_profile = PlayerProgressModel.normalize_profile(profile)


func _build_overlay() -> void:
	_overlay_layer = CanvasLayer.new()
	_overlay_layer.layer = 500
	root.add_child(_overlay_layer)
	_overlay_label = Label.new()
	_overlay_label.position = Vector2(90, 20)
	_overlay_label.size = Vector2(1100, 50)
	_overlay_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_overlay_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_overlay_label.add_theme_font_size_override("font_size", 21)
	_overlay_label.add_theme_color_override(
		"font_color",
		Color(1.0, 0.94, 0.78)
	)
	_overlay_label.add_theme_color_override(
		"font_shadow_color",
		Color(0.0, 0.0, 0.0, 0.88)
	)
	_overlay_label.add_theme_constant_override("shadow_offset_x", 2)
	_overlay_label.add_theme_constant_override("shadow_offset_y", 2)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.045, 0.032, 0.88)
	style.border_color = Color(0.82, 0.63, 0.30, 0.72)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	_overlay_label.add_theme_stylebox_override("normal", style)
	_overlay_layer.add_child(_overlay_label)

	_cover = ColorRect.new()
	_cover.color = Color.BLACK
	_cover.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cover.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_cover.z_index = 4096
	_overlay_layer.add_child(_cover)


func _configure_audio() -> void:
	if not is_instance_valid(_host) or _host.game_audio_manager == null:
		return
	_host.game_audio_manager.set_muted(false, false)
	_host.game_audio_manager.set_music_volume(0.48, false)
	_host.game_audio_manager.set_sfx_volume(0.92, false)
	_host.game_audio_manager.enter_battle(false)


func _scroll_evolution_into_view(panel_root: Control) -> void:
	if _host.pet_detail_scroll == null or panel_root == null:
		return
	await process_frame
	_host.pet_detail_scroll.scroll_vertical = maxi(
		0,
		roundi(panel_root.position.y) + 8
	)
	await _hold_frames(3)


func _scroll_detail_to_top() -> void:
	if _host.pet_detail_scroll != null:
		_host.pet_detail_scroll.scroll_vertical = 0
	await _hold_frames(3)


func _fade_from_black() -> void:
	for step in range(20):
		_cover.color.a = 1.0 - float(step + 1) / 20.0
		await _next_frame()
	_cover.visible = false


func _fade_to_black() -> void:
	_cover.visible = true
	for step in range(20):
		_cover.color.a = float(step + 1) / 20.0
		await _next_frame()


func _hold_frames(frame_count: int) -> void:
	for _index in range(frame_count):
		await _next_frame()


func _next_frame() -> void:
	await process_frame
	_hide_non_review_panels()


func _hide_non_review_panels() -> void:
	if not is_instance_valid(_host):
		return
	if _host.auth_panel != null and _host.auth_panel.visible:
		_host._close_auth_panel(false)
	if _host.account_panel != null and _host.account_panel.visible:
		_host._close_account_panel(false)
	if _host.qa_panel != null and _host.qa_panel.visible:
		_host._close_qa_panel(false)


func _count_recorded_frame() -> void:
	_recorded_frames += 1
	# The production client intentionally avoids repainting a completely static
	# frame. Movie Maker still needs one rendered frame per fixed simulation
	# tick so that 1× hold durations are preserved instead of being collapsed.
	if is_instance_valid(_host):
		_host.queue_redraw()
	if is_instance_valid(_overlay_label):
		_overlay_label.queue_redraw()


func _clean_exit(exit_code: int = 0) -> void:
	for route_case_value in ROUTE_CASES:
		PetEvolutionVisualCatalog.disable_qa_preview_form(
			str((route_case_value as Dictionary).get("targetFormId", ""))
		)
	if is_instance_valid(_host) and _host.game_audio_manager != null:
		_host.game_audio_manager.stop_all()
	if is_instance_valid(_host):
		_host.free()
	_host = null
	await process_frame
	quit(exit_code)
