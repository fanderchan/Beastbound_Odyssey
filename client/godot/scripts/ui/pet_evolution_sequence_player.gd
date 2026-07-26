extends RefCounted

const PetEvolutionVisualCatalog := preload("res://scripts/pet/pet_evolution_visual_catalog.gd")
const BACKGROUND_TEXTURE := preload("res://assets/battle/review_arenas_v1/runtime/moonlit_slate.png")

const COLOR_GOLD := Color(1.0, 0.84, 0.42, 1.0)
const COLOR_CYAN := Color(0.40, 0.91, 1.0, 1.0)
const COLOR_MUTED := Color(0.76, 0.83, 0.91, 0.92)

var _root: Control
var _sprite: TextureRect
var _source_label: Label
var _target_label: Label
var _stage_label: Label
var _level_label: Label
var _progress_segments: Array[ColorRect] = []
var _audio_cue: Callable = Callable()
var _played_ids: Dictionary = {}
var _active: bool = false
var _completed_count: int = 0
var _last_presentation_id: String = ""
var _frame_history: Array[int] = []
var _stage_history: Array[String] = []


func mount(parent: Control, audio_cue: Callable = Callable()) -> void:
	if parent == null or _root != null:
		return
	_audio_cue = audio_cue
	_root = Control.new()
	_root.name = "PetEvolutionSequence"
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.z_index = 4090
	_root.visible = false
	parent.add_child(_root)
	_build_ui()


func warm_target_form(target_form_id: String) -> bool:
	return PetEvolutionVisualCatalog.warm_target_form(target_form_id)


func play_request(request_value, timing_scale: float = 1.0) -> Dictionary:
	if _active or _root == null or not (request_value is Dictionary):
		return {"ok": false, "reason": "unavailable"}
	var request := request_value as Dictionary
	var presentation_id := str(request.get("presentationId", "")).strip_edges()
	var target_form_id := str(request.get("targetFormId", "")).strip_edges()
	if presentation_id == "" or target_form_id == "":
		return {"ok": false, "reason": "invalid_request"}
	if bool(_played_ids.get(presentation_id, false)):
		return {"ok": false, "reason": "duplicate"}
	var descriptor := PetEvolutionVisualCatalog.descriptor_for_target(target_form_id)
	if descriptor.is_empty() or not PetEvolutionVisualCatalog.warm_target_form(target_form_id):
		return {"ok": false, "reason": "visual_unavailable"}
	if (
		str(descriptor.get("sourceFormId", "")) != str(request.get("sourceFormId", ""))
		or int(descriptor.get("frameCount", 0)) != PetEvolutionVisualCatalog.REQUIRED_FRAME_COUNT
		or not is_equal_approx(float(descriptor.get("fps", 0.0)), PetEvolutionVisualCatalog.REQUIRED_FPS)
	):
		return {"ok": false, "reason": "visual_mismatch"}
	var presentation_copy := descriptor.get("presentationCopy", {}) as Dictionary
	var stages := presentation_copy.get("stages", []) as Array

	_played_ids[presentation_id] = true
	_active = true
	_last_presentation_id = presentation_id
	_frame_history.clear()
	_stage_history.clear()
	_source_label.text = "%s · 1转 Lv%d" % [
		str(request.get("sourceFormName", "宠物")),
		int(request.get("beforeLevel", 140)),
	]
	_target_label.text = str(request.get("targetFormName", "进化形态"))
	_level_label.text = ""
	_stage_label.text = str(presentation_copy.get("intro", "进化能量正在回应……"))
	_set_progress(0)
	_root.modulate = Color(1, 1, 1, 0)
	_root.visible = true
	_play_audio("combat.cast_skill")
	await _fade_to(1.0, 0.22, timing_scale)
	await _wait(0.34, timing_scale)

	var frame_count := int(descriptor.get("frameCount", 0))
	var seconds_per_frame := 1.0 / float(descriptor.get("fps", 1.0))
	for frame_index in range(frame_count):
		_sprite.texture = PetEvolutionVisualCatalog.texture_for_frame(target_form_id, frame_index)
		_frame_history.append(frame_index)
		var stage_index := _stage_index_for_frame(frame_index + 1, stages)
		var stage := stages[stage_index] as Dictionary
		var stage_text := str(stage.get("label", "进化中"))
		_stage_label.text = stage_text
		if _stage_history.is_empty() or _stage_history.back() != stage_text:
			_stage_history.append(stage_text)
		_set_progress(stage_index + 1)
		if frame_index == 4:
			_play_audio("combat.hit_skill")
		elif frame_index == 8:
			_play_audio("combat.critical")
		await _hold_animation_frame(seconds_per_frame, timing_scale)

	_stage_label.text = "进化完成"
	_level_label.text = "%s · Lv%d" % [
		str(request.get("targetFormName", "进化形态")),
		int(request.get("afterLevel", 1)),
	]
	_play_audio("outcome.victory")
	await _wait(1.05, timing_scale)
	await _fade_to(0.0, 0.26, timing_scale)
	_root.visible = false
	_root.modulate = Color.WHITE
	_active = false
	_completed_count += 1
	return {
		"ok": true,
		"presentationId": presentation_id,
		"frameCount": _frame_history.size(),
		"fps": float(descriptor.get("fps", 0.0)),
	}


func snapshot() -> Dictionary:
	return {
		"mounted": _root != null,
		"visible": _root != null and _root.visible,
		"active": _active,
		"completedCount": _completed_count,
		"playedCount": _played_ids.size(),
		"lastPresentationId": _last_presentation_id,
		"frameHistory": _frame_history.duplicate(),
		"stageHistory": _stage_history.duplicate(),
		"stage": _stage_label.text if _stage_label != null else "",
		"level": _level_label.text if _level_label != null else "",
	}


func _build_ui() -> void:
	var background := TextureRect.new()
	background.name = "MoonlitSlateBackground"
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.texture = BACKGROUND_TEXTURE
	background.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	background.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(background)

	var shade := ColorRect.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.015, 0.025, 0.065, 0.64)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(shade)

	var top_glow := ColorRect.new()
	top_glow.set_anchors_preset(Control.PRESET_CENTER_TOP)
	top_glow.position = Vector2(-340, 0)
	top_glow.size = Vector2(680, 4)
	top_glow.color = Color(0.32, 0.86, 1.0, 0.84)
	top_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(top_glow)

	var title := Label.new()
	title.text = "宠物进化"
	title.set_anchors_preset(Control.PRESET_CENTER_TOP)
	title.position = Vector2(-220, 34)
	title.size = Vector2(440, 52)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 32)
	title.add_theme_color_override("font_color", COLOR_GOLD)
	title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	title.add_theme_constant_override("shadow_offset_x", 2)
	title.add_theme_constant_override("shadow_offset_y", 2)
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(title)

	_source_label = Label.new()
	_source_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_source_label.position = Vector2(-270, 88)
	_source_label.size = Vector2(540, 32)
	_source_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_source_label.add_theme_font_size_override("font_size", 18)
	_source_label.add_theme_color_override("font_color", COLOR_MUTED)
	_source_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_source_label)

	var sprite_frame := PanelContainer.new()
	sprite_frame.set_anchors_preset(Control.PRESET_CENTER)
	sprite_frame.position = Vector2(-214, -190)
	sprite_frame.size = Vector2(428, 428)
	sprite_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var frame_style := StyleBoxFlat.new()
	frame_style.bg_color = Color(0.025, 0.07, 0.13, 0.48)
	frame_style.border_color = Color(0.35, 0.86, 1.0, 0.66)
	frame_style.set_border_width_all(2)
	frame_style.corner_radius_top_left = 30
	frame_style.corner_radius_top_right = 30
	frame_style.corner_radius_bottom_left = 30
	frame_style.corner_radius_bottom_right = 30
	frame_style.shadow_color = Color(0.0, 0.6, 1.0, 0.18)
	frame_style.shadow_size = 18
	sprite_frame.add_theme_stylebox_override("panel", frame_style)
	_root.add_child(sprite_frame)

	_sprite = TextureRect.new()
	_sprite.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sprite_frame.add_child(_sprite)

	_stage_label = Label.new()
	_stage_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_stage_label.position = Vector2(-220, -128)
	_stage_label.size = Vector2(440, 34)
	_stage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stage_label.add_theme_font_size_override("font_size", 22)
	_stage_label.add_theme_color_override("font_color", COLOR_CYAN)
	_stage_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_stage_label)

	var progress_row := HBoxContainer.new()
	progress_row.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	progress_row.position = Vector2(-180, -86)
	progress_row.size = Vector2(360, 7)
	progress_row.add_theme_constant_override("separation", 8)
	progress_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(progress_row)
	for _index in range(3):
		var segment := ColorRect.new()
		segment.custom_minimum_size = Vector2(114, 7)
		segment.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		segment.color = Color(0.35, 0.43, 0.55, 0.52)
		segment.mouse_filter = Control.MOUSE_FILTER_IGNORE
		progress_row.add_child(segment)
		_progress_segments.append(segment)

	_target_label = Label.new()
	_target_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_target_label.position = Vector2(-260, -68)
	_target_label.size = Vector2(520, 30)
	_target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_target_label.add_theme_font_size_override("font_size", 19)
	_target_label.add_theme_color_override("font_color", COLOR_MUTED)
	_target_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_target_label)

	_level_label = Label.new()
	_level_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_level_label.position = Vector2(-260, -40)
	_level_label.size = Vector2(520, 34)
	_level_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_label.add_theme_font_size_override("font_size", 24)
	_level_label.add_theme_color_override("font_color", COLOR_GOLD)
	_level_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_level_label)


func _set_progress(completed_segments: int) -> void:
	for index in range(_progress_segments.size()):
		_progress_segments[index].color = (
			Color(0.33, 0.90, 1.0, 0.95)
			if index < completed_segments
			else Color(0.35, 0.43, 0.55, 0.52)
		)


func _stage_index_for_frame(frame_number: int, stages: Array) -> int:
	for index in range(stages.size()):
		var stage := stages[index] as Dictionary
		if frame_number <= int(stage.get("endFrame", PetEvolutionVisualCatalog.REQUIRED_FRAME_COUNT)):
			return index
	return maxi(0, stages.size() - 1)


func _fade_to(target_alpha: float, duration: float, timing_scale: float) -> void:
	var start_alpha := _root.modulate.a
	var steps := 8
	for step in range(1, steps + 1):
		var ratio := float(step) / float(steps)
		_root.modulate.a = lerpf(start_alpha, target_alpha, ratio)
		await _wait(duration / float(steps), timing_scale)


func _wait(seconds: float, timing_scale: float) -> void:
	var duration := maxf(0.0, seconds * maxf(0.0, timing_scale))
	if duration <= 0.0001:
		await _root.get_tree().process_frame
		return
	await _root.get_tree().create_timer(duration).timeout


func _hold_animation_frame(seconds: float, timing_scale: float) -> void:
	var duration := maxf(0.0, seconds * maxf(0.0, timing_scale))
	if duration <= 0.0001:
		await _root.get_tree().process_frame
		return
	var process_delta := _root.get_process_delta_time()
	if process_delta <= 0.0001:
		process_delta = 1.0 / 60.0
	var display_frame_count := maxi(1, roundi(duration / process_delta))
	for _index in range(display_frame_count):
		await _root.get_tree().process_frame


func _play_audio(cue_id: String) -> void:
	if _audio_cue.is_valid():
		_audio_cue.call(cue_id)
