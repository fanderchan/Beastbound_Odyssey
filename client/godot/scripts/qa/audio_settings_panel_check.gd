extends SceneTree

const AudioSettingsPanel := preload("res://scripts/ui/audio_settings_panel.gd")


class MockAudioManager:
	extends RefCounted

	var music_volume: float = 0.64
	var sfx_volume: float = 0.82
	var muted: bool = false
	var setter_calls: Array[Dictionary] = []

	func settings_snapshot() -> Dictionary:
		return {
			"musicVolume": music_volume,
			"sfxVolume": sfx_volume,
			"muted": muted,
		}

	func set_music_volume(value: float, _persist: bool = true) -> void:
		music_volume = value
		setter_calls.append({"channel": "music", "value": value})

	func set_sfx_volume(value: float, _persist: bool = true) -> void:
		sfx_volume = value
		setter_calls.append({"channel": "sfx", "value": value})

	func set_muted(value: bool) -> void:
		muted = value
		setter_calls.append({"channel": "muted", "value": value})


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var manager := MockAudioManager.new()
	var host := VBoxContainer.new()
	host.name = "AudioSettingsTestHost"
	root.add_child(host)

	var panel := AudioSettingsPanel.new()
	panel.mount(host, manager)
	var initial := panel.snapshot()
	_expect(initial.get("mounted") == true, "面板没有完成挂载", errors)
	_expect(initial.get("visible") == true, "面板默认不可见", errors)
	_expect(initial.get("title") == "声音设置", "中文标题不正确", errors)
	_expect(initial.get("musicPercent") == 64, "音乐初始值没有读取 manager", errors)
	_expect(initial.get("sfxPercent") == 82, "音效初始值没有读取 manager", errors)
	_expect(initial.get("muted") == false, "静音初始值没有读取 manager", errors)
	_expect(manager.setter_calls.is_empty(), "refresh 不应回写 manager", errors)

	var music_slider := panel.root.get_node("MusicRow/MusicSlider") as HSlider
	var sfx_slider := panel.root.get_node("SfxRow/SfxSlider") as HSlider
	var mute_checkbox := panel.root.get_node("Mute") as CheckBox
	music_slider.value = 37
	sfx_slider.value = 23
	mute_checkbox.button_pressed = true
	var edited := panel.snapshot()
	_expect(is_equal_approx(manager.music_volume, 0.37), "音乐滑杆没有调用 manager", errors)
	_expect(is_equal_approx(manager.sfx_volume, 0.23), "音效滑杆没有调用 manager", errors)
	_expect(edited.get("musicText") == "37%", "音乐百分比文本没有更新", errors)
	_expect(edited.get("sfxText") == "23%", "音效百分比文本没有更新", errors)
	_expect(edited.get("muted") == true, "静音勾选没有更新", errors)
	_expect(manager.muted, "静音勾选没有调用 manager", errors)
	_expect(manager.setter_calls.size() == 3, "两个滑杆和静音应各触发一次 manager 写入", errors)

	manager.music_volume = 0.91
	manager.sfx_volume = 0.12
	manager.muted = false
	manager.setter_calls.clear()
	panel.refresh()
	var refreshed := panel.snapshot()
	_expect(refreshed.get("musicPercent") == 91, "外部音乐值没有刷新到面板", errors)
	_expect(refreshed.get("sfxPercent") == 12, "外部音效值没有刷新到面板", errors)
	_expect(refreshed.get("muted") == false, "外部静音值没有刷新到面板", errors)
	_expect(manager.setter_calls.is_empty(), "外部刷新不应形成回写环", errors)

	panel.set_visible(false)
	_expect(panel.snapshot().get("visible") == false, "set_visible(false) 没有生效", errors)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_settings_panel_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"initial": initial,
		"edited": edited,
		"refreshed": refreshed,
		"setterCallsAfterRefresh": manager.setter_calls.size(),
		"errors": errors,
	}
	print("audio settings panel check: %s" % JSON.stringify(report))
	host.queue_free()
	quit(0 if errors.is_empty() else 1)


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
