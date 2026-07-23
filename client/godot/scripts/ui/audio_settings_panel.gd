extends RefCounted

signal volume_changed(channel: String, linear_value: float)

const DEFAULT_MUSIC_VOLUME := 0.72
const DEFAULT_SFX_VOLUME := 0.86
const SETTINGS_SAVE_DEBOUNCE_SECONDS := 0.35

var root: VBoxContainer
var _manager: Object
var _music_slider: HSlider
var _music_value_label: Label
var _sfx_slider: HSlider
var _sfx_value_label: Label
var _mute_checkbox: CheckBox
var _settings_save_timer: Timer
var _refreshing: bool = false


func mount(parent: Node, manager: Object) -> void:
	if root != null:
		return
	_manager = manager
	root = VBoxContainer.new()
	root.name = "AudioSettingsPanel"
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 8)
	parent.add_child(root)
	root.tree_exiting.connect(_persist_settings)

	_settings_save_timer = Timer.new()
	_settings_save_timer.name = "SettingsSaveDebounce"
	_settings_save_timer.one_shot = true
	_settings_save_timer.wait_time = SETTINGS_SAVE_DEBOUNCE_SECONDS
	_settings_save_timer.timeout.connect(_persist_settings)
	root.add_child(_settings_save_timer)

	var divider := HSeparator.new()
	divider.modulate = Color(0.78, 0.62, 0.32, 0.55)
	root.add_child(divider)

	var title := Label.new()
	title.name = "Title"
	title.text = "声音设置"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color(0.96, 0.85, 0.60, 1.0))
	root.add_child(title)

	var hint := Label.new()
	hint.name = "Hint"
	hint.text = "音乐与动作音效可独立调整"
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", Color(0.75, 0.79, 0.75, 1.0))
	root.add_child(hint)

	var music_row := _build_volume_row(
		"MusicRow",
		"音乐",
		"调整地图与战斗背景音乐音量"
	)
	root.add_child(music_row)
	_music_slider = music_row.get_node("MusicSlider") as HSlider
	_music_value_label = music_row.get_node("Value") as Label
	_music_slider.value_changed.connect(_on_music_value_changed)
	_music_slider.drag_ended.connect(_on_volume_drag_ended)

	var sfx_row := _build_volume_row(
		"SfxRow",
		"音效",
		"调整人物、宠物与战斗动作音效音量"
	)
	root.add_child(sfx_row)
	_sfx_slider = sfx_row.get_node("SfxSlider") as HSlider
	_sfx_value_label = sfx_row.get_node("Value") as Label
	_sfx_slider.value_changed.connect(_on_sfx_value_changed)
	_sfx_slider.drag_ended.connect(_on_volume_drag_ended)

	_mute_checkbox = CheckBox.new()
	_mute_checkbox.name = "Mute"
	_mute_checkbox.text = "全部静音"
	_mute_checkbox.tooltip_text = "关闭背景音乐和所有动作音效"
	_mute_checkbox.add_theme_font_size_override("font_size", 15)
	_mute_checkbox.toggled.connect(_on_muted_toggled)
	root.add_child(_mute_checkbox)

	refresh()


func refresh() -> void:
	if root == null:
		return
	var settings := _manager_settings_snapshot()
	_refreshing = true
	_music_slider.value = _level_percent(
		settings,
		["musicVolume", "music_volume", "music"],
		DEFAULT_MUSIC_VOLUME
	)
	_sfx_slider.value = _level_percent(
		settings,
		["sfxVolume", "sfx_volume", "effectsVolume", "effects_volume", "sfx"],
		DEFAULT_SFX_VOLUME
	)
	_mute_checkbox.button_pressed = bool(settings.get("muted", false))
	_refreshing = false
	_update_value_labels()


func set_visible(value: bool) -> void:
	if root != null:
		root.visible = value


func snapshot() -> Dictionary:
	return {
		"mounted": root != null,
		"visible": root != null and root.visible,
		"title": (
			str((root.get_node("Title") as Label).text)
			if root != null and root.has_node("Title")
			else ""
		),
		"musicPercent": int(round(_music_slider.value)) if _music_slider != null else 0,
		"sfxPercent": int(round(_sfx_slider.value)) if _sfx_slider != null else 0,
		"muted": _mute_checkbox.button_pressed if _mute_checkbox != null else false,
		"musicText": _music_value_label.text if _music_value_label != null else "",
		"sfxText": _sfx_value_label.text if _sfx_value_label != null else "",
	}


func _build_volume_row(node_name: String, label_text: String, tooltip: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.name = node_name
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", 8)

	var label := Label.new()
	label.name = "Label"
	label.text = label_text
	label.custom_minimum_size = Vector2(54, 0)
	label.add_theme_font_size_override("font_size", 15)
	row.add_child(label)

	var slider := HSlider.new()
	slider.name = "MusicSlider" if node_name == "MusicRow" else "SfxSlider"
	slider.min_value = 0.0
	slider.max_value = 100.0
	slider.step = 1.0
	slider.value = 0.0
	slider.custom_minimum_size = Vector2(210, 30)
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.tooltip_text = tooltip
	row.add_child(slider)

	var value_label := Label.new()
	value_label.name = "Value"
	value_label.text = "0%"
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value_label.custom_minimum_size = Vector2(48, 0)
	value_label.add_theme_font_size_override("font_size", 14)
	row.add_child(value_label)
	return row


func _on_music_value_changed(value: float) -> void:
	_update_value_labels()
	if _refreshing:
		return
	var linear_value := clampf(value / 100.0, 0.0, 1.0)
	_call_manager_setter(
		["set_music_volume", "set_music_volume_linear", "set_music_level"],
		linear_value,
		false
	)
	_queue_settings_persist()
	volume_changed.emit("music", linear_value)


func _on_sfx_value_changed(value: float) -> void:
	_update_value_labels()
	if _refreshing:
		return
	var linear_value := clampf(value / 100.0, 0.0, 1.0)
	_call_manager_setter(
		["set_sfx_volume", "set_sfx_volume_linear", "set_effects_volume", "set_sfx_level"],
		linear_value,
		false
	)
	_queue_settings_persist()
	volume_changed.emit("sfx", linear_value)


func _on_muted_toggled(value: bool) -> void:
	if _refreshing:
		return
	_call_manager_bool_setter(["set_muted", "set_audio_muted"], value)


func _update_value_labels() -> void:
	if _music_slider != null and _music_value_label != null:
		_music_value_label.text = "%d%%" % int(round(_music_slider.value))
	if _sfx_slider != null and _sfx_value_label != null:
		_sfx_value_label.text = "%d%%" % int(round(_sfx_slider.value))


func _manager_settings_snapshot() -> Dictionary:
	if _manager == null or not is_instance_valid(_manager):
		return {}
	for method_name in ["settings_snapshot", "audio_settings_snapshot", "snapshot"]:
		if _manager.has_method(method_name):
			var value = _manager.call(method_name)
			if value is Dictionary:
				var snapshot_value: Dictionary = value
				if snapshot_value.get("settings") is Dictionary:
					return Dictionary(snapshot_value.get("settings"))
				return snapshot_value
	return {}


func _call_manager_setter(
	method_names: Array[String],
	value: float,
	persist: bool = true
) -> bool:
	if _manager == null or not is_instance_valid(_manager):
		return false
	for method_name in method_names:
		if _manager.has_method(method_name):
			_manager.call(method_name, value, persist)
			return true
	return false


func _queue_settings_persist() -> void:
	if _settings_save_timer != null:
		_settings_save_timer.start()


func _on_volume_drag_ended(value_changed: bool) -> void:
	if not value_changed:
		return
	if _settings_save_timer != null:
		_settings_save_timer.stop()
	_persist_settings()


func _persist_settings() -> void:
	if _manager != null and is_instance_valid(_manager) and _manager.has_method("save_settings"):
		_manager.call("save_settings")


func _call_manager_bool_setter(method_names: Array[String], value: bool) -> bool:
	if _manager == null or not is_instance_valid(_manager):
		return false
	for method_name in method_names:
		if _manager.has_method(method_name):
			_manager.call(method_name, value)
			return true
	return false


func _level_percent(
	settings: Dictionary,
	keys: Array[String],
	fallback_linear: float
) -> float:
	var raw_value: float = fallback_linear
	for key in keys:
		if settings.has(key):
			raw_value = float(settings.get(key))
			break
	if raw_value > 1.0:
		return clampf(raw_value, 0.0, 100.0)
	return clampf(raw_value, 0.0, 1.0) * 100.0
