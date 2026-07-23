extends SceneTree

const GameAudioManagerScript := preload("res://scripts/audio/game_audio_manager.gd")


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var failures: Array[String] = []
	var nonce := "%d_%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	var catalog_path := "user://audio_manager_check_%s.json" % nonce
	var settings_path := "user://audio_manager_settings_check_%s.json" % nonce
	if not _write_catalog(catalog_path):
		failures.append("无法写入临时音频 catalog")
		_finish(failures, [catalog_path, settings_path])
		return

	var shared_stream := _five_second_silence()
	var loader_calls: Dictionary = {}
	var now := [1000]
	var manager := GameAudioManagerScript.new()
	manager.configure_playback_enabled(true)
	manager.configure_catalog_path(catalog_path)
	manager.configure_settings_path(settings_path)
	manager.configure_stream_loader(func(path: String):
		loader_calls[path] = int(loader_calls.get(path, 0)) + 1
		return shared_stream
	)
	manager.configure_clock_msec(func():
		return now[0]
	)
	get_root().add_child(manager)
	await process_frame

	_expect(manager.catalog_loaded(), "音频 catalog 未加载", failures)
	_expect(int(manager.debug_snapshot().get("voicePoolSize", 0)) == 12, "SFX voice pool 不是 12 路", failures)
	for bus_name in ["Music", "SFX", "Combat", "Pet", "UI"]:
		_expect(AudioServer.get_bus_index(bus_name) >= 0, "缺少音频总线 %s" % bus_name, failures)
	var limiter_count := _master_limiter_count()
	_expect(limiter_count == 1, "Master 必须且只能有一个 HardLimiter", failures)
	_expect(
		is_equal_approx(
			_master_limiter_ceiling_db(),
			GameAudioManager.MASTER_LIMITER_CEILING_DB
		),
		"Master HardLimiter ceiling 必须保留真峰值安全余量",
		failures
	)
	_expect(
		AudioServer.get_bus_send(AudioServer.get_bus_index("Combat")) == "SFX",
		"Combat 总线未汇入 SFX",
		failures
	)

	_expect(manager.sync_map_context("firebud_village_gate"), "城镇音乐未切入", failures)
	_expect(manager.current_music_context() == "town", "村庄地图未归类 town", failures)
	_expect(manager.current_music_cue() == "music.town", "城镇 cue 错误", failures)
	var town_transition_serial := int(manager.debug_snapshot().get("musicTransitionSerial", -1))
	_expect(manager.sync_map_context("firebud_village_gate"), "重复同步同一城镇 cue 失败", failures)
	_expect(
		int(manager.debug_snapshot().get("musicTransitionSerial", -1)) == town_transition_serial,
		"同一音乐上下文被重复重启",
		failures
	)
	_expect(int(loader_calls.get("res://fake/music_town.wav", 0)) == 1, "城镇资源未单次缓存", failures)
	manager.silence_world_context()
	_expect(manager.current_music_cue() == "", "未知地图静音没有停止旧地图音乐", failures)
	_expect(manager.sync_map_context("firebud_village_gate"), "静音后未恢复城镇音乐", failures)

	_expect(manager.enter_battle(), "战斗音乐未切入", failures)
	_expect(manager.current_music_cue() == "music.battle_normal", "战斗未覆盖地图音乐", failures)
	_expect(manager.sync_map_context("mistcap_marsh"), "战斗中地图上下文同步失败", failures)
	_expect(manager.world_context() == "wilderness", "战斗中未记录新地图上下文", failures)
	_expect(manager.current_music_cue() == "music.battle_normal", "战斗中错误切回地图音乐", failures)
	_expect(manager.exit_battle(), "退出战斗未恢复地图音乐", failures)
	_expect(manager.current_music_cue() == "music.wilderness", "退出战斗未恢复当前野外音乐", failures)

	for cue_index in 12:
		var cue_id := "combat.pool_%02d" % cue_index
		_expect(manager.play_cue(cue_id), "voice pool 第 %d 路未播放" % cue_index, failures)
	_expect(int(manager.debug_snapshot().get("activeVoiceCount", 0)) == 12, "SFX 并发未达到 12 路", failures)
	_expect(not manager.play_cue("combat.low_priority"), "低优先级 cue 错误抢占高优先级 voice", failures)
	_expect(manager.play_cue("outcome.high_priority"), "高优先级 cue 未抢占最低优先级 voice", failures)
	_expect(int(manager.debug_snapshot().get("activeVoiceCount", 0)) == 12, "voice 抢占后并发上限变化", failures)

	_expect(manager.play_cue("ui.cooldown"), "冷却 cue 首次播放失败", failures)
	_expect(not manager.play_cue("ui.cooldown"), "同 cue 冷却未去重", failures)
	now[0] = 1201
	_expect(manager.play_cue("ui.cooldown"), "冷却结束后 cue 未恢复", failures)

	manager.set_music_volume(0.31)
	manager.set_sfx_volume(0.64)
	manager.set_muted(true)
	_expect(FileAccess.file_exists(settings_path), "音量设置未持久化", failures)
	manager.queue_free()
	await process_frame

	var restored := GameAudioManagerScript.new()
	restored.configure_playback_enabled(true)
	restored.configure_catalog_path(catalog_path)
	restored.configure_settings_path(settings_path)
	restored.configure_stream_loader(func(_path: String):
		return shared_stream
	)
	get_root().add_child(restored)
	await process_frame
	var restored_settings := restored.settings_snapshot()
	_expect(is_equal_approx(float(restored_settings.musicVolume), 0.31), "音乐音量未恢复", failures)
	_expect(is_equal_approx(float(restored_settings.sfxVolume), 0.64), "音效音量未恢复", failures)
	_expect(restored.is_muted(), "静音状态未恢复", failures)
	_expect(_master_limiter_count() == limiter_count, "重复 manager 添加了 HardLimiter", failures)
	_expect(restored.sync_music_context("town"), "播放开关测试未切入城镇音乐", failures)
	restored.configure_playback_enabled(false)
	_expect(restored.current_music_cue() == "", "关闭真实播放后未清理活动音乐", failures)
	restored.configure_playback_enabled(true)
	_expect(restored.current_music_cue() == "music.town", "重新开启真实播放后未恢复音乐", failures)
	restored.queue_free()
	await process_frame

	var silent_manager := GameAudioManagerScript.new()
	silent_manager.configure_playback_enabled(true)
	silent_manager.configure_catalog_path(catalog_path)
	silent_manager.configure_settings_path(settings_path)
	get_root().add_child(silent_manager)
	await process_frame
	_expect(not silent_manager.sync_music_context("town"), "缺失资源时未安全静音", failures)
	_expect(not silent_manager.play_cue("combat.pool_00"), "缺失 SFX 资源时未安全静音", failures)
	silent_manager.queue_free()
	await process_frame

	_finish(failures, [catalog_path, settings_path])


func _write_catalog(path: String) -> bool:
	var cues := {
		"music.town": _cue("res://fake/music_town.wav", "Music", "music", 0, 0),
		"music.wilderness": _cue("res://fake/music_wilderness.wav", "Music", "music", 0, 0),
		"music.cave": _cue("res://fake/music_cave.wav", "Music", "music", 0, 0),
		"music.battle_normal": _cue("res://fake/music_battle.wav", "Music", "music", 0, 0),
		"combat.low_priority": _cue("res://fake/shared_sfx.wav", "Combat", "contact", 0, 0),
		"outcome.high_priority": _cue("res://fake/shared_sfx.wav", "Combat", "outcome", 10, 0),
		"ui.cooldown": _cue("res://fake/shared_sfx.wav", "UI", "ui", 10, 200),
	}
	for cue_index in 12:
		cues["combat.pool_%02d" % cue_index] = _cue(
			"res://fake/shared_sfx.wav",
			"Combat",
			"contact",
			5,
			0
		)
	var catalog := {
		"schemaVersion": 1,
		"bundleId": "audio_manager_check",
		"reviewState": "qa_only",
		"contexts": {
			"town": "music.town",
			"wilderness": "music.wilderness",
			"cave": "music.cave",
			"battle_normal": "music.battle_normal",
		},
		"cues": cues,
	}
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(catalog))
	file.close()
	return true


func _cue(path: String, bus: String, role: String, priority: int, cooldown_msec: int) -> Dictionary:
	return {
		"path": path,
		"bus": bus,
		"role": role,
		"loop": role == "music",
		"gainDb": 0.0,
		"priority": priority,
		"cooldownMs": cooldown_msec,
	}


func _five_second_silence() -> AudioStreamWAV:
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 48000
	stream.stereo = false
	var data := PackedByteArray()
	data.resize(48000 * 2 * 5)
	stream.data = data
	return stream


func _expect(condition: bool, message: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(message)


func _master_limiter_count() -> int:
	var master_index := AudioServer.get_bus_index("Master")
	if master_index < 0:
		return 0
	var count := 0
	for effect_index in AudioServer.get_bus_effect_count(master_index):
		if AudioServer.get_bus_effect(master_index, effect_index) is AudioEffectHardLimiter:
			count += 1
	return count


func _master_limiter_ceiling_db() -> float:
	var master_index := AudioServer.get_bus_index("Master")
	if master_index < 0:
		return 999.0
	for effect_index in AudioServer.get_bus_effect_count(master_index):
		var effect = AudioServer.get_bus_effect(master_index, effect_index)
		if effect is AudioEffectHardLimiter:
			return (effect as AudioEffectHardLimiter).ceiling_db
	return 999.0


func _finish(failures: Array[String], cleanup_paths: Array[String]) -> void:
	for path in cleanup_paths:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
		var temp_path := "%s.tmp" % path
		if FileAccess.file_exists(temp_path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(temp_path))
	if failures.is_empty():
		print("game audio manager check ready: status=ok buses=5 music_crossfade=0.75 voices=12 persistence=true")
		quit(0)
		return
	for failure in failures:
		push_error(failure)
	print("game audio manager check ready: status=failed errors=%s" % "；".join(failures))
	quit(1)
