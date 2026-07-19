extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const PetBattleReviewModel := preload("res://scripts/battle/pet_battle_review_model.gd")

const SPEED_STEPS: Array[float] = [0.25, 0.5, 1.0, 2.0]
const DEFAULT_SEED := 309001

var host
var root: PanelContainer
var body: VBoxContainer
var focus_option: OptionButton
var placement_option: OptionButton
var pool_option: OptionButton
var mode_label: Label
var seed_label: Label
var coverage_label: Label
var pause_button: Button
var speed_button: Button
var collapse_button: Button

var active: bool = false
var mode: String = PetBattleReviewModel.MODE_BRAWL
var focus_form_id: String = ""
var mount_form_id: String = ""
var placement: String = PetBattleReviewModel.PLACEMENT_BOTH_ALL
var pool_id: String = PetBattleReviewModel.POOL_FORMAL
var seed_value: int = DEFAULT_SEED
var speed_scale: float = 1.0
var paused: bool = false
var collapsed: bool = false
var completed_brawls: int = 0
var completed_director_loops: int = 0
var director_step_id: String = ""
var coverage: Dictionary = {}
var quit_after_director_loop: bool = false
var director_step_filter: Array[String] = []

var _generation: int = 0
var _observed_event_sequence: int = 0
var _option_refreshing: bool = false
var _step_frames: int = 0
var _scaled_delta_frame: int = -1
var _scaled_delta_cache: float = 0.0


func _init(host_node) -> void:
	host = host_node


func open(
	requested_form_id: String = "",
	requested_mode: String = PetBattleReviewModel.MODE_BRAWL,
	requested_seed: int = DEFAULT_SEED,
	start_collapsed: bool = false,
	requested_mount_form_id: String = "",
	quit_after_one_director_loop: bool = false,
	requested_director_step_ids: Array[String] = []
) -> void:
	if active:
		close(false)
	active = true
	mode = requested_mode if [PetBattleReviewModel.MODE_BRAWL, PetBattleReviewModel.MODE_DIRECTOR].has(requested_mode) else PetBattleReviewModel.MODE_BRAWL
	focus_form_id = PetBattleReviewModel.normalized_form_id(requested_form_id)
	mount_form_id = PetBattleReviewModel.normalized_mount_form_id(requested_mount_form_id)
	seed_value = PetBattleReviewModel.normalized_seed(requested_seed)
	placement = PetBattleReviewModel.PLACEMENT_BOTH_ALL
	pool_id = PetBattleReviewModel.POOL_FORMAL
	speed_scale = 1.0
	paused = false
	collapsed = start_collapsed
	completed_brawls = 0
	completed_director_loops = 0
	director_step_id = ""
	quit_after_director_loop = quit_after_one_director_loop
	director_step_filter = PetBattleReviewModel.normalized_director_step_ids(
		requested_director_step_ids,
		focus_form_id,
		mount_form_id
	)
	coverage.clear()
	for coverage_id in PetBattleReviewModel.REQUIRED_COVERAGE:
		coverage[coverage_id] = 0
	host._close_qa_panel(false)
	host._set_gm_speed_multiplier(1)
	_build_ui()
	_refresh_option_controls()
	_apply_collapsed_state()
	if mode == PetBattleReviewModel.MODE_DIRECTOR:
		start_director()
	else:
		start_brawl(seed_value)


func close(restore_world: bool = true) -> void:
	if not active and root == null:
		return
	active = false
	_generation += 1
	director_step_id = ""
	paused = false
	_step_frames = 0
	if host.battle_auto_attack_enabled:
		host._set_battle_auto_attack_enabled(false, false)
	if root != null:
		if host.panel_registry != null:
			host.panel_registry.remove_input_blocker(root)
		root.queue_free()
		root = null
	if host.battle_active and bool(host.battle_state.get("reviewLab", false)):
		host._end_battle(restore_world)
	host._set_gm_speed_multiplier(1)
	host._layout_hud()


func is_active() -> bool:
	return active


func is_root_visible() -> bool:
	return root != null and root.visible


func form_option_count() -> int:
	return focus_option.get_item_count() if focus_option != null else 0


func current_seed() -> int:
	return seed_value


func current_mode() -> String:
	return mode


func current_mount_form_id() -> String:
	return mount_form_id


func current_director_step_ids() -> Array[String]:
	return director_step_filter.duplicate()


func coverage_counts() -> Dictionary:
	return coverage.duplicate(true)


func missing_coverage_ids() -> Array[String]:
	var result: Array[String] = []
	for coverage_id in PetBattleReviewModel.REQUIRED_COVERAGE:
		if int(coverage.get(coverage_id, 0)) <= 0:
			result.append(coverage_id)
	return result


func required_coverage_complete() -> bool:
	return missing_coverage_ids().is_empty()


func scaled_battle_delta(delta: float) -> float:
	if not active:
		return delta
	var frame := Engine.get_process_frames()
	if frame == _scaled_delta_frame:
		return _scaled_delta_cache
	_scaled_delta_frame = frame
	if paused:
		if _step_frames > 0:
			_step_frames -= 1
			_scaled_delta_cache = 1.0 / 60.0
		else:
			_scaled_delta_cache = 0.0
	else:
		_scaled_delta_cache = maxf(0.0, delta) * speed_scale
	return _scaled_delta_cache


func update(_delta: float) -> void:
	if not active or not host.battle_active or not bool(host.battle_state.get("reviewLab", false)):
		return
	var sequence := int(host.battle_recorded_event_sequence)
	if sequence < _observed_event_sequence:
		_observed_event_sequence = 0
	if sequence > _observed_event_sequence:
		_observed_event_sequence = sequence
		_record_latest_event()


func handle_key_event(event: InputEvent) -> bool:
	if not active or not (event is InputEventKey):
		return false
	var key_event := event as InputEventKey
	if not key_event.pressed or key_event.echo:
		return false
	match key_event.keycode:
		KEY_SPACE:
			toggle_pause()
		KEY_PERIOD:
			step_one_frame()
		KEY_R:
			replay()
		KEY_N:
			new_random_brawl()
		KEY_D:
			start_director()
		KEY_H:
			toggle_collapsed()
		KEY_ESCAPE:
			close(true)
		_:
			return false
	return true


func start_brawl(requested_seed: int = 0) -> void:
	if not active:
		return
	_generation += 1
	mode = PetBattleReviewModel.MODE_BRAWL
	director_step_id = ""
	paused = false
	_step_frames = 0
	seed_value = PetBattleReviewModel.normalized_seed(requested_seed if requested_seed != 0 else seed_value)
	_observed_event_sequence = 0
	var state := PetBattleReviewModel.build_brawl_state(focus_form_id, seed_value, placement, pool_id, mount_form_id)
	state["reviewTopInset"] = _review_top_inset()
	host._start_battle(state)
	host._set_battle_auto_attack_enabled(true, false)
	_refresh_status()


func start_director() -> void:
	if not active:
		return
	_generation += 1
	mode = PetBattleReviewModel.MODE_DIRECTOR
	paused = false
	_step_frames = 0
	if host.battle_auto_attack_enabled:
		host._set_battle_auto_attack_enabled(false, false)
	var token := _generation
	_run_director(token)
	_refresh_status()


func replay() -> void:
	if mode == PetBattleReviewModel.MODE_DIRECTOR:
		start_director()
	else:
		start_brawl(seed_value)


func new_random_brawl() -> void:
	var next_seed := int(Time.get_ticks_usec() % 2147483647)
	if next_seed <= 0 or next_seed == seed_value:
		next_seed = seed_value + 7919
	start_brawl(next_seed)


func toggle_pause() -> void:
	paused = not paused
	_step_frames = 0
	_scaled_delta_frame = -1
	_refresh_status()


func set_paused(value: bool) -> void:
	paused = value
	_step_frames = 0
	_scaled_delta_frame = -1
	_refresh_status()


func step_one_frame() -> void:
	paused = true
	_step_frames = 1
	_scaled_delta_frame = -1
	_refresh_status()


func cycle_speed() -> void:
	var current_index := SPEED_STEPS.find(speed_scale)
	var next_index := 0 if current_index < 0 or current_index >= SPEED_STEPS.size() - 1 else current_index + 1
	speed_scale = SPEED_STEPS[next_index]
	_scaled_delta_frame = -1
	_refresh_status()


func clear_coverage() -> void:
	for coverage_id in PetBattleReviewModel.REQUIRED_COVERAGE:
		coverage[coverage_id] = 0
	completed_brawls = 0
	completed_director_loops = 0
	_refresh_status()


func toggle_collapsed() -> void:
	collapsed = not collapsed
	_apply_collapsed_state()


func handle_battle_finished() -> bool:
	if not active or not bool(host.battle_state.get("reviewLab", false)):
		return false
	if mode == PetBattleReviewModel.MODE_BRAWL:
		completed_brawls += 1
		start_brawl(seed_value + 1)
	else:
		start_director()
	return true


func return_to_real_grass() -> void:
	close(true)
	host._qa_route_to_gm_zone("gm_10v10_grass")


func _run_director(token: int) -> void:
	while _director_is_current(token):
		for step in PetBattleReviewModel.director_steps_for_ids(focus_form_id, mount_form_id, director_step_filter):
			if not _director_is_current(token):
				return
			director_step_id = str(step.get("id", ""))
			_observed_event_sequence = 0
			var state := PetBattleReviewModel.build_director_state(focus_form_id, seed_value, director_step_id, mount_form_id)
			state["reviewTopInset"] = _review_top_inset()
			host._start_battle(state)
			host._set_battle_auto_attack_enabled(false, false)
			host._set_battle_message("动作必现：%s。" % str(step.get("label", director_step_id)))
			_refresh_status()
			if not await _wait_scaled(0.55, token):
				return
			_queue_director_events(step.get("events", []))
			if not await _wait_until_director_events_finish(token):
				return
			if not await _wait_scaled(float(step.get("settle", 0.75)), token):
				return
		if _director_is_current(token):
			completed_director_loops += 1
			_refresh_status()
			if quit_after_director_loop:
				if not await _wait_scaled(0.85, token):
					return
				host.get_tree().quit()
				return


func _director_is_current(token: int) -> bool:
	return active and mode == PetBattleReviewModel.MODE_DIRECTOR and token == _generation


func _queue_director_events(raw_events) -> void:
	var events: Array[Dictionary] = []
	var guarding_ids: Array[String] = []
	if raw_events is Array:
		for value in raw_events as Array:
			if not (value is Dictionary):
				continue
			var event := (value as Dictionary).duplicate(true)
			events.append(event)
			if str(event.get("type", "")) == "defend":
				var defender_id := str(event.get("attackerId", ""))
				if defender_id != "" and not guarding_ids.has(defender_id):
					guarding_ids.append(defender_id)
	if not guarding_ids.is_empty():
		host.battle_state["guardingActorIds"] = guarding_ids
	host.battle_enemy_response_pending = false
	host.battle_round_end_status_processed = true
	host.battle_event_queue = events
	host.battle_state["phase"] = "round_events"
	host._play_next_battle_event()


func _wait_until_director_events_finish(token: int) -> bool:
	var elapsed := 0.0
	while _director_is_current(token):
		var busy: bool = (
			not host.battle_current_event.is_empty()
			or not host.battle_event_queue.is_empty()
			or str(host.battle_state.get("phase", "")) == "round_events"
		)
		if not busy:
			return true
		await host.get_tree().process_frame
		var step_delta := scaled_battle_delta(host.get_process_delta_time())
		elapsed += step_delta
		if elapsed > 12.0:
			return false
	return false


func _wait_scaled(seconds: float, token: int) -> bool:
	var elapsed := 0.0
	while elapsed < seconds and _director_is_current(token):
		await host.get_tree().process_frame
		elapsed += scaled_battle_delta(host.get_process_delta_time())
	return _director_is_current(token)


func _record_latest_event() -> void:
	var ledger := host.battle_last_event_ledger as Dictionary if host.battle_last_event_ledger is Dictionary else {}
	if ledger.is_empty():
		return
	var event_type := str(ledger.get("type", host.battle_last_event_type))
	var target_id := str(ledger.get("resolvedTargetId", host.battle_last_event_target_id))
	var target := BattleModel.actor_by_id(host.battle_state, target_id)
	var target_hp_after := _ledger_target_hp_after(ledger, target_id, target)
	var launched := bool(ledger.get("launch", host.battle_last_event_launch))
	var launch_mode := str(ledger.get("launchMode", host.battle_last_event_launch_mode))
	match event_type:
		"attack":
			_increment_coverage("attack")
		"skill_attack":
			_increment_coverage("skill")
		"defend":
			_increment_coverage("defend")
		"counter_attack":
			_increment_coverage("counter")
			if launched:
				_increment_coverage("counter_launch")
			elif target_hp_after <= 0:
				_increment_coverage("counter_ko")
		"combo_attack":
			_increment_coverage("combo")
	if bool(ledger.get("blocked", false)):
		_increment_coverage("guard_hit")
	if bool(ledger.get("dodged", false)):
		_increment_coverage("dodge")
	if launched and event_type != "counter_attack":
		_increment_coverage("knockaway_bounce" if launch_mode == "bounce" else "knockaway_straight")
	if not launched and target_hp_after <= 0:
		_increment_coverage("down")
	_refresh_status()


func _ledger_target_hp_after(ledger: Dictionary, target_id: String, fallback: Dictionary) -> int:
	var targets = ledger.get("targets", [])
	if targets is Array:
		for value in targets as Array:
			if not (value is Dictionary):
				continue
			var result := value as Dictionary
			if str(result.get("targetId", "")) == target_id:
				return int(result.get("hpAfter", 1))
	if not fallback.is_empty():
		return int(fallback.get("hp", 1))
	return 1


func _increment_coverage(coverage_id: String) -> void:
	if coverage.has(coverage_id):
		coverage[coverage_id] = int(coverage.get(coverage_id, 0)) + 1


func _build_ui() -> void:
	root = PanelContainer.new()
	root.name = "PetBattleReviewLab"
	root.z_index = 60
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	root.set_anchors_preset(Control.PRESET_TOP_WIDE)
	root.offset_left = 18.0
	root.offset_top = 10.0
	root.offset_right = -18.0
	root.offset_bottom = 154.0
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.035, 0.075, 0.075, 0.94)
	panel_style.border_color = Color(0.78, 0.58, 0.22, 0.92)
	panel_style.set_border_width_all(2)
	panel_style.set_corner_radius_all(10)
	panel_style.content_margin_left = 14.0
	panel_style.content_margin_right = 14.0
	panel_style.content_margin_top = 9.0
	panel_style.content_margin_bottom = 9.0
	root.add_theme_stylebox_override("panel", panel_style)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 6)
	root.add_child(column)

	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 8)
	column.add_child(header)
	var title := Label.new()
	title.text = "10骑乘人物＋10战宠验收场" if mount_form_id != "" else "宠物战斗动作验收场"
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color(1.0, 0.84, 0.38, 1.0))
	header.add_child(title)
	mode_label = Label.new()
	mode_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mode_label.add_theme_font_size_override("font_size", 14)
	mode_label.add_theme_color_override("font_color", Color(0.72, 0.88, 0.82, 1.0))
	header.add_child(mode_label)
	seed_label = Label.new()
	seed_label.add_theme_font_size_override("font_size", 14)
	header.add_child(seed_label)
	collapse_button = _button("收起", 68.0, toggle_collapsed)
	header.add_child(collapse_button)
	header.add_child(_button("退出", 68.0, func() -> void: close(true)))

	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 6)
	column.add_child(body)

	var option_row := HBoxContainer.new()
	option_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	option_row.add_theme_constant_override("separation", 8)
	body.add_child(option_row)
	focus_option = OptionButton.new()
	focus_option.custom_minimum_size = Vector2(260, 34)
	focus_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	focus_option.item_selected.connect(_on_focus_selected)
	option_row.add_child(focus_option)
	placement_option = OptionButton.new()
	placement_option.custom_minimum_size = Vector2(190, 34)
	placement_option.item_selected.connect(_on_placement_selected)
	option_row.add_child(placement_option)
	pool_option = OptionButton.new()
	pool_option.custom_minimum_size = Vector2(190, 34)
	pool_option.item_selected.connect(_on_pool_selected)
	option_row.add_child(pool_option)
	option_row.add_child(_button("新随机", 88.0, new_random_brawl))
	option_row.add_child(_button("重播", 76.0, replay))
	option_row.add_child(_button("动作必现", 96.0, start_director))

	var control_row := HBoxContainer.new()
	control_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	control_row.add_theme_constant_override("separation", 8)
	body.add_child(control_row)
	pause_button = _button("暂停", 76.0, toggle_pause)
	control_row.add_child(pause_button)
	control_row.add_child(_button("单帧 .", 76.0, step_one_frame))
	speed_button = _button("速度 x1", 86.0, cycle_speed)
	control_row.add_child(speed_button)
	control_row.add_child(_button("清零覆盖", 88.0, clear_coverage))
	control_row.add_child(_button("真实10V10草丛", 132.0, return_to_real_grass))
	var hint := Label.new()
	hint.text = "快捷键：空格暂停  .单帧  N新随机  R重播  D必现  H收起"
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", Color(0.68, 0.73, 0.70, 0.92))
	control_row.add_child(hint)

	coverage_label = Label.new()
	coverage_label.clip_text = true
	coverage_label.add_theme_font_size_override("font_size", 13)
	coverage_label.add_theme_color_override("font_color", Color(0.78, 0.94, 0.76, 1.0))
	body.add_child(coverage_label)

	host.hud_root.add_child(root)
	if host.panel_registry != null:
		host.panel_registry.add_input_blocker(root)


func _button(text: String, minimum_width: float, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(minimum_width, 34)
	button.add_theme_font_size_override("font_size", 14)
	button.pressed.connect(callback)
	return button


func _refresh_option_controls() -> void:
	_option_refreshing = true
	_populate_option(focus_option, PetBattleReviewModel.pet_options(), focus_form_id, "formId")
	_populate_option(placement_option, PetBattleReviewModel.placement_options(), placement, "id")
	_populate_option(pool_option, PetBattleReviewModel.pool_options(), pool_id, "id")
	_option_refreshing = false
	_refresh_status()


func _populate_option(option: OptionButton, values: Array[Dictionary], selected_id: String, id_key: String) -> void:
	option.clear()
	var selected_index := 0
	for value in values:
		var value_id := str(value.get(id_key, ""))
		option.add_item(str(value.get("label", value_id)))
		var index := option.get_item_count() - 1
		option.set_item_metadata(index, value_id)
		if value_id == selected_id:
			selected_index = index
	if option.get_item_count() > 0:
		option.select(selected_index)


func _on_focus_selected(index: int) -> void:
	if _option_refreshing:
		return
	focus_form_id = PetBattleReviewModel.normalized_form_id(str(focus_option.get_item_metadata(index)))
	replay()


func _on_placement_selected(index: int) -> void:
	if _option_refreshing:
		return
	placement = str(placement_option.get_item_metadata(index))
	start_brawl(seed_value)


func _on_pool_selected(index: int) -> void:
	if _option_refreshing:
		return
	pool_id = str(pool_option.get_item_metadata(index))
	start_brawl(seed_value)


func _refresh_status() -> void:
	if root == null:
		return
	var mode_text := "自由乱斗" if mode == PetBattleReviewModel.MODE_BRAWL else "动作必现"
	if mount_form_id != "":
		mode_text = "全员骑乘 · %s" % mode_text
	if director_step_id != "":
		mode_text += " · %s" % PetBattleReviewModel.director_step_name(director_step_id)
	if paused:
		mode_text += " · 已暂停"
	mode_label.text = mode_text
	seed_label.text = "种子 %d" % seed_value
	if pause_button != null:
		pause_button.text = "继续" if paused else "暂停"
	if speed_button != null:
		speed_button.text = "速度 x%s" % ("%.2f" % speed_scale).trim_suffix("0").trim_suffix("0").trim_suffix(".")
	if coverage_label != null:
		var labels := PetBattleReviewModel.coverage_labels()
		var parts: Array[String] = []
		for coverage_id in PetBattleReviewModel.REQUIRED_COVERAGE:
			var count := int(coverage.get(coverage_id, 0))
			parts.append("%s%s%d" % ["✓" if count > 0 else "·", str(labels.get(coverage_id, coverage_id)), count])
		coverage_label.text = "覆盖（乱斗%d局/必现%d轮）：%s" % [completed_brawls, completed_director_loops, "  ".join(parts)]


func _apply_collapsed_state() -> void:
	if root == null:
		return
	if body != null:
		body.visible = not collapsed
	if collapse_button != null:
		collapse_button.text = "展开" if collapsed else "收起"
	root.offset_bottom = 60.0 if collapsed else 154.0
	if host.battle_active and bool(host.battle_state.get("reviewLab", false)):
		host.battle_state["reviewTopInset"] = _review_top_inset()
		host.queue_redraw()
	_refresh_status()


func _review_top_inset() -> float:
	return 64.0 if collapsed else 164.0
