extends Control

signal sequence_started(outcome_id: String)
signal sequence_completed(outcome_id: String)

const BASE_ROW_WIDTH := 470.0
const BASE_ROW_HEIGHT := 40.0
const ROW_STEP := 43.0
const MAX_VISIBLE_ROWS := 5

const TITLE_COLOR := Color("#ffd66b")
const TEXT_COLOR := Color("#f6e8c9")
const EXP_COLOR := Color("#ffe3a0")
const LEVEL_COLOR := Color("#fff09a")
const WARNING_COLOR := Color("#ffbf8c")
const PANEL_COLOR := Color("#211b15e8")
const PANEL_BORDER := Color("#b79353")

var _title_label: Label
var _queue: Array[Dictionary] = []
var _seen_outcome_ids: Dictionary = {}
var _active_rows: Array[Dictionary] = []
var _running := false
var _generation := 0
var _last_outcome_id := ""
var _last_view: Dictionary = {}
var _completed_count := 0
var _timing_scale := 1.0
var _active_tweens: Array[Tween] = []


func _ready() -> void:
	name = "BattleOutcomeFloatOverlay"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 42
	clip_contents = false
	visible = false
	_build_title()


func present(view_state: Dictionary, timing_scale: float = 1.0) -> bool:
	var normalized := _normalized_view(view_state)
	var outcome_id := str(normalized.get("outcomeId", "")).strip_edges()
	if outcome_id == "" or _seen_outcome_ids.has(outcome_id):
		return false
	_seen_outcome_ids[outcome_id] = true
	_last_view = normalized.duplicate(true)
	_queue.append(normalized)
	_timing_scale = clampf(timing_scale, 0.05, 4.0)
	if not _running:
		_running = true
		call_deferred("_play_queue", _generation)
	return true


func dismiss(clear_seen: bool = false) -> void:
	_generation += 1
	_queue.clear()
	_running = false
	for tween in _active_tweens:
		if tween != null and tween.is_valid():
			tween.kill()
	_active_tweens.clear()
	_clear_rows()
	if _title_label != null:
		_title_label.visible = false
	visible = false
	if clear_seen:
		_seen_outcome_ids.clear()


func snapshot() -> Dictionary:
	var rows: Array[Dictionary] = []
	for entry in _active_rows:
		var panel := entry.get("panel") as Control
		var label := entry.get("label") as Label
		if panel == null or not is_instance_valid(panel):
			continue
		rows.append({
			"text": label.text if label != null and is_instance_valid(label) else str(entry.get("text", "")),
			"kind": str(entry.get("kind", "reward")),
			"positionY": panel.position.y,
			"alpha": panel.modulate.a,
			"scale": panel.scale.x,
		})
	return {
		"visible": visible,
		"active": _running,
		"queuedCount": _queue.size(),
		"rowCount": rows.size(),
		"rows": rows,
		"title": _title_label.text if _title_label != null else "",
		"titleAlpha": _title_label.modulate.a if _title_label != null else 0.0,
		"lastOutcomeId": _last_outcome_id,
		"view": _last_view.duplicate(true),
		"seenCount": _seen_outcome_ids.size(),
		"completedCount": _completed_count,
		"mouseFilterIgnore": mouse_filter == Control.MOUSE_FILTER_IGNORE,
	}


func _play_queue(generation: int) -> void:
	while generation == _generation and not _queue.is_empty():
		var view: Dictionary = _queue.pop_front() as Dictionary
		await _play_view(view, generation)
	_running = false
	if generation == _generation:
		visible = false


func _play_view(view: Dictionary, generation: int) -> void:
	if generation != _generation:
		return
	visible = true
	_last_outcome_id = str(view.get("outcomeId", ""))
	_clear_rows()
	_title_label.text = "✦  %s  ✦" % str(view.get("title", "战斗胜利"))
	_title_label.visible = true
	_title_label.modulate = Color(1, 1, 1, 0)
	_title_label.scale = Vector2(0.9, 0.9)
	_title_label.pivot_offset = Vector2(260, 28)
	sequence_started.emit(_last_outcome_id)
	var title_tween := create_tween()
	_track_tween(title_tween)
	title_tween.set_parallel(true)
	title_tween.tween_property(_title_label, "modulate:a", 1.0, _seconds(0.20)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	title_tween.tween_property(_title_label, "scale", Vector2.ONE, _seconds(0.24)).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await get_tree().create_timer(_seconds(0.22)).timeout
	if generation != _generation:
		return

	var display_rows: Array[Dictionary] = []
	var rewards: Array = view.get("rewardRows", []) if view.get("rewardRows", []) is Array else []
	for value in rewards:
		if value is Dictionary:
			display_rows.append((value as Dictionary).duplicate(true))
	var warnings: Array = view.get("warningRows", []) if view.get("warningRows", []) is Array else []
	for value in warnings:
		if value is Dictionary:
			var warning := (value as Dictionary).duplicate(true)
			warning["kind"] = "warning"
			display_rows.append(warning)
		elif str(value).strip_edges() != "":
			display_rows.append({"text": str(value).strip_edges(), "kind": "warning"})
	if display_rows.is_empty():
		display_rows.append({"text": str(view.get("title", "战斗结束")), "kind": "result"})

	for row in display_rows:
		if generation != _generation:
			return
		_shift_existing_rows()
		_add_row(row)
		await get_tree().create_timer(_seconds(0.24)).timeout

	if generation != _generation:
		return
	await get_tree().create_timer(_seconds(0.65)).timeout
	if generation != _generation:
		return
	var finish_tween := create_tween()
	_track_tween(finish_tween)
	finish_tween.set_parallel(true)
	finish_tween.tween_property(_title_label, "position:y", _title_label.position.y - 24.0, _seconds(0.55)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	finish_tween.tween_property(_title_label, "modulate:a", 0.0, _seconds(0.45)).set_delay(_seconds(0.10))
	for entry in _active_rows:
		var panel := entry.get("panel") as Control
		if panel == null or not is_instance_valid(panel):
			continue
		finish_tween.tween_property(panel, "position:y", panel.position.y - 64.0, _seconds(0.55)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		finish_tween.tween_property(panel, "modulate:a", 0.0, _seconds(0.45)).set_delay(_seconds(0.10))
	await get_tree().create_timer(_seconds(0.58)).timeout
	if generation != _generation:
		return
	_completed_count += 1
	sequence_completed.emit(_last_outcome_id)
	_title_label.position.y = _title_base_y()
	_title_label.visible = false
	_clear_rows()


func _add_row(row: Dictionary) -> void:
	var panel := PanelContainer.new()
	panel.name = "RewardRow"
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.custom_minimum_size = Vector2(BASE_ROW_WIDTH, BASE_ROW_HEIGHT)
	panel.size = Vector2(BASE_ROW_WIDTH, BASE_ROW_HEIGHT)
	panel.position = Vector2(_center_x() - BASE_ROW_WIDTH * 0.5, _row_base_y())
	panel.pivot_offset = Vector2(BASE_ROW_WIDTH * 0.5, BASE_ROW_HEIGHT * 0.5)
	panel.scale = Vector2(0.90, 0.90)
	panel.modulate = Color(1, 1, 1, 0)
	panel.add_theme_stylebox_override("panel", _row_style(str(row.get("kind", "reward"))))
	add_child(panel)

	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text = str(row.get("text", row.get("label", row.get("message", "")))).strip_edges()
	label.add_theme_font_size_override("font_size", 22 if str(row.get("kind", "")) != "level_up" else 24)
	label.add_theme_color_override("font_color", _row_text_color(row))
	label.add_theme_color_override("font_outline_color", Color("#24140d"))
	label.add_theme_constant_override("outline_size", 3)
	panel.add_child(label)

	_active_rows.append({
		"panel": panel,
		"label": label,
		"text": label.text,
		"kind": str(row.get("kind", "reward")),
	})
	var tween := create_tween()
	_track_tween(tween)
	tween.set_parallel(true)
	tween.tween_property(panel, "modulate:a", 1.0, _seconds(0.16)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(panel, "scale", Vector2(1.05, 1.05), _seconds(0.12)).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.chain().tween_property(panel, "scale", Vector2.ONE, _seconds(0.09)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	while _active_rows.size() > MAX_VISIBLE_ROWS:
		var oldest: Dictionary = _active_rows.pop_front() as Dictionary
		var oldest_panel := oldest.get("panel") as Control
		if oldest_panel != null and is_instance_valid(oldest_panel):
			var remove_tween := create_tween()
			_track_tween(remove_tween)
			remove_tween.set_parallel(true)
			remove_tween.tween_property(oldest_panel, "position:y", oldest_panel.position.y - 28.0, _seconds(0.18))
			remove_tween.tween_property(oldest_panel, "modulate:a", 0.0, _seconds(0.16))
			remove_tween.chain().tween_callback(oldest_panel.queue_free)


func _shift_existing_rows() -> void:
	for entry in _active_rows:
		var panel := entry.get("panel") as Control
		if panel == null or not is_instance_valid(panel):
			continue
		var tween := create_tween()
		_track_tween(tween)
		tween.tween_property(panel, "position:y", panel.position.y - ROW_STEP, _seconds(0.20)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _build_title() -> void:
	_title_label = Label.new()
	_title_label.name = "OutcomeTitle"
	_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_title_label.position = Vector2(_center_x() - 260.0, _title_base_y())
	_title_label.size = Vector2(520, 56)
	_title_label.add_theme_font_size_override("font_size", 34)
	_title_label.add_theme_color_override("font_color", TITLE_COLOR)
	_title_label.add_theme_color_override("font_shadow_color", Color("#3c180caa"))
	_title_label.add_theme_constant_override("shadow_offset_x", 0)
	_title_label.add_theme_constant_override("shadow_offset_y", 3)
	_title_label.add_theme_color_override("font_outline_color", Color("#5b2d16"))
	_title_label.add_theme_constant_override("outline_size", 5)
	_title_label.visible = false
	add_child(_title_label)


func _normalized_view(view_state: Dictionary) -> Dictionary:
	var normalized := view_state.duplicate(true)
	var outcome_id := str(
		view_state.get(
			"outcomeId",
			view_state.get("presentationId", view_state.get("settlementId", view_state.get("dedupeKey", "")))
		)
	).strip_edges()
	var title := str(view_state.get("title", view_state.get("resultTitle", "战斗胜利"))).strip_edges()
	var rewards = view_state.get("rewardRows", view_state.get("rewards", view_state.get("rows", [])))
	normalized["outcomeId"] = outcome_id
	normalized["title"] = title if title != "" else "战斗胜利"
	normalized["rewardRows"] = rewards.duplicate(true) if rewards is Array else []
	normalized["warningRows"] = (view_state.get("warningRows", []) as Array).duplicate(true) if view_state.get("warningRows", []) is Array else []
	return normalized


func _clear_rows() -> void:
	for entry in _active_rows:
		var panel := entry.get("panel") as Control
		if panel != null and is_instance_valid(panel):
			panel.queue_free()
	_active_rows.clear()


func _row_style(kind: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL_COLOR
	style.border_color = WARNING_COLOR if kind == "warning" else PANEL_BORDER
	style.set_border_width_all(1 if kind != "level_up" else 2)
	style.set_corner_radius_all(8)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	style.shadow_color = Color("#0a0605aa")
	style.shadow_size = 6
	style.shadow_offset = Vector2(0, 3)
	return style


func _row_text_color(row: Dictionary) -> Color:
	var kind := str(row.get("kind", "reward"))
	if bool(row.get("isLevelUp", false)) or kind == "level_up":
		return LEVEL_COLOR
	if kind == "warning":
		return WARNING_COLOR
	if kind == "exp" or kind == "currency":
		return EXP_COLOR
	return TEXT_COLOR


func _track_tween(tween: Tween) -> void:
	_active_tweens.append(tween)
	tween.finished.connect(func():
		_active_tweens.erase(tween)
	)


func _center_x() -> float:
	return size.x * 0.5 if size.x > 0 else 640.0


func _title_base_y() -> float:
	return maxf(198.0, size.y * 0.31) if size.y > 0 else 224.0


func _row_base_y() -> float:
	return maxf(360.0, size.y * 0.58) if size.y > 0 else 418.0


func _seconds(base_seconds: float) -> float:
	return maxf(0.001, base_seconds * _timing_scale)
