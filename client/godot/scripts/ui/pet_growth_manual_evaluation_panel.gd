extends RefCounted

const PetGrowthManualEvaluationModel := preload("res://scripts/progression/pet_growth_manual_evaluation_model.gd")
const PetGrowthManualEvaluationPresenter := preload("res://scripts/ui/pet_growth_manual_evaluation_presenter.gd")

var root: VBoxContainer
var _toggle_button: Button
var _result_label: Label
var _settings_box: VBoxContainer
var _save_button: Button
var _status_label: Label
var _controls: Dictionary = {}
var _policy: Dictionary = {}
var _instance: Dictionary = {}
var _on_policy_changed: Callable
var _on_save: Callable
var _refreshing: bool = false
var _settings_expanded: bool = false


func mount(parent: VBoxContainer, on_policy_changed: Callable, on_save: Callable) -> void:
	_on_policy_changed = on_policy_changed
	_on_save = on_save
	root = VBoxContainer.new()
	root.visible = false
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 6)
	parent.add_child(root)

	var header := HBoxContainer.new()
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_theme_constant_override("separation", 8)
	root.add_child(header)
	var title := Label.new()
	title.text = "人工成长判断"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.95, 0.86, 0.48, 1.0))
	header.add_child(title)
	_toggle_button = Button.new()
	_toggle_button.text = "设置参考线"
	_toggle_button.custom_minimum_size = Vector2(110, 34)
	_toggle_button.pressed.connect(_toggle_settings)
	header.add_child(_toggle_button)

	_result_label = Label.new()
	_result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_result_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_result_label.add_theme_font_size_override("font_size", 14)
	_result_label.add_theme_color_override("font_color", Color(0.84, 0.91, 0.86, 1.0))
	root.add_child(_result_label)

	_settings_box = VBoxContainer.new()
	_settings_box.visible = false
	_settings_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_settings_box.add_theme_constant_override("separation", 5)
	root.add_child(_settings_box)
	var guidance := Label.new()
	guidance.text = PetGrowthManualEvaluationPresenter.guidance_text()
	guidance.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	guidance.add_theme_font_size_override("font_size", 13)
	guidance.add_theme_color_override("font_color", Color(0.72, 0.88, 0.78, 1.0))
	_settings_box.add_child(guidance)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 4)
	_settings_box.add_child(grid)
	for key in PetGrowthManualEvaluationModel.REFERENCE_KEYS:
		var label := Label.new()
		label.text = "%s参考线" % str(PetGrowthManualEvaluationModel.STAT_LABELS.get(key, key))
		label.custom_minimum_size = Vector2(110, 34)
		grid.add_child(label)
		var spinbox := SpinBox.new()
		spinbox.min_value = 0
		spinbox.max_value = 100
		spinbox.step = 1
		spinbox.rounded = true
		spinbox.suffix = "%分位"
		spinbox.custom_minimum_size = Vector2(180, 34)
		spinbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		spinbox.value_changed.connect(_reference_changed.bind(key))
		grid.add_child(spinbox)
		_controls[key] = spinbox

	_save_button = Button.new()
	_save_button.text = "保存人工评估参考线"
	_save_button.custom_minimum_size = Vector2(0, 40)
	_save_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_save_button.pressed.connect(_save_pressed)
	_settings_box.add_child(_save_button)
	_status_label = Label.new()
	_status_label.text = "0表示该项不限；修改后请保存。"
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.add_theme_font_size_override("font_size", 13)
	_status_label.add_theme_color_override("font_color", Color(0.72, 0.76, 0.74, 1.0))
	_settings_box.add_child(_status_label)


func refresh(instance: Dictionary, policy_value, visible: bool, request_pending: bool) -> void:
	_instance = instance.duplicate(true)
	_policy = PetGrowthManualEvaluationModel.normalize_policy(policy_value)
	if root == null:
		return
	root.visible = visible
	if not visible:
		return
	_refreshing = true
	for key in PetGrowthManualEvaluationModel.REFERENCE_KEYS:
		var spinbox := _controls.get(key, null) as SpinBox
		if spinbox != null:
			spinbox.value = PetGrowthManualEvaluationModel.reference_value(_policy, key)
			spinbox.editable = not request_pending
	_refreshing = false
	_save_button.disabled = request_pending
	_result_label.text = PetGrowthManualEvaluationPresenter.evaluation_text(
		PetGrowthManualEvaluationModel.evaluate_pet(_instance, _policy)
	)
	_apply_expanded_state()


func set_save_status(message: String, success: bool = false) -> void:
	if _status_label == null:
		return
	_status_label.text = message
	_status_label.add_theme_color_override(
		"font_color",
		Color(0.55, 0.95, 0.66, 1.0) if success else Color(0.95, 0.82, 0.42, 1.0)
	)


func set_settings_expanded(expanded: bool) -> void:
	_settings_expanded = expanded
	_apply_expanded_state()


func snapshot() -> Dictionary:
	var values := {}
	for key in PetGrowthManualEvaluationModel.REFERENCE_KEYS:
		var spinbox := _controls.get(key, null) as SpinBox
		values[key] = int(spinbox.value) if spinbox != null else -1
	return {
		"visible": root != null and root.visible,
		"settingsExpanded": _settings_expanded,
		"values": values,
		"resultText": _result_label.text if _result_label != null else "",
		"statusText": _status_label.text if _status_label != null else "",
		"rootY": root.position.y if root != null else 0.0,
	}


static func contract_check() -> Dictionary:
	return {
		"ok": (
			PetGrowthManualEvaluationModel.REFERENCE_KEYS.size() == 5
			and PetGrowthManualEvaluationPresenter.guidance_text().find("仅供人工判断") >= 0
			and PetGrowthManualEvaluationPresenter.guidance_text().find("不会自动训练、移动或删除宠物") >= 0
		),
	}


func _toggle_settings() -> void:
	set_settings_expanded(not _settings_expanded)


func _apply_expanded_state() -> void:
	if _settings_box != null:
		_settings_box.visible = _settings_expanded
	if _toggle_button != null:
		_toggle_button.text = "收起参考线" if _settings_expanded else "设置参考线"


func _reference_changed(next_value: float, key: String) -> void:
	if _refreshing:
		return
	_policy = PetGrowthManualEvaluationModel.with_reference_value(_policy, key, int(next_value))
	_result_label.text = PetGrowthManualEvaluationPresenter.evaluation_text(
		PetGrowthManualEvaluationModel.evaluate_pet(_instance, _policy)
	)
	set_save_status("修改后请保存人工评估参考线。")
	if _on_policy_changed.is_valid():
		_on_policy_changed.call(_policy.duplicate(true))


func _save_pressed() -> void:
	if not _on_save.is_valid():
		return
	_save_button.disabled = true
	set_save_status("正在保存人工评估参考线……")
	await _on_save.call(_policy.duplicate(true))
