extends SceneTree

const GameAudioManagerScript := preload("res://scripts/audio/game_audio_manager.gd")


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var failures: Array[String] = []
	var nonce := "%d_%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	var temp_root := "res://.run/qa/game_audio_manager_check"
	var temp_root_error := DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path(temp_root)
	)
	if temp_root_error != OK:
		failures.append("无法创建隔离的音频检查临时目录")
		_finish(failures, [])
		return
	var catalog_path := "%s/catalog_%s.json" % [temp_root, nonce]
	var settings_path := "%s/settings_%s.json" % [temp_root, nonce]
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
	_expect_music_crossfade_envelope(failures)
	var prewarm_snapshot := manager.debug_snapshot()
	_expect(
		int(prewarm_snapshot.get("warmedMusicStreamCount", 0)) == 4,
		"四个音乐语境没有在 catalog 加载后全部预热",
		failures
	)
	_expect(
		int(prewarm_snapshot.get("warmedAmbienceStreamCount", 0)) == 3,
		"三个地图环境语境没有在 catalog 加载后全部预热",
		failures
	)
	_expect(
		int(prewarm_snapshot.get("streamCacheCount", 0)) == 7,
		"长音频预热没有填充七个唯一 stream cache",
		failures
	)
	for music_path in _music_paths():
		_expect(
			int(loader_calls.get(music_path, 0)) == 1,
			"音乐预热没有且仅加载一次：%s" % music_path,
			failures
		)
	for ambience_path in _ambience_paths():
		_expect(
			int(loader_calls.get(ambience_path, 0)) == 1,
			"环境声预热没有且仅加载一次：%s" % ambience_path,
			failures
		)
	for bus_name in ["Music", "SFX", "Ambience", "Combat", "Pet", "UI"]:
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
	_expect(
		AudioServer.get_bus_send(AudioServer.get_bus_index("Ambience")) == "SFX",
		"Ambience 总线未汇入 SFX",
		failures
	)

	_expect(manager.sync_map_context("firebud_village_gate"), "城镇音乐未切入", failures)
	_expect(manager.current_music_context() == "town", "村庄地图未归类 town", failures)
	_expect(manager.current_music_cue() == "music.town", "城镇 cue 错误", failures)
	_expect(manager.current_ambience_context() == "town", "村庄环境声未归类 town", failures)
	_expect(manager.current_ambience_cue() == "ambience.town", "城镇环境 cue 错误", failures)
	var town_transition_serial := int(manager.debug_snapshot().get("musicTransitionSerial", -1))
	var town_ambience_transition_serial := int(
		manager.debug_snapshot().get("ambienceTransitionSerial", -1)
	)
	_expect(manager.sync_map_context("firebud_village_gate"), "重复同步同一城镇 cue 失败", failures)
	_expect(
		int(manager.debug_snapshot().get("musicTransitionSerial", -1)) == town_transition_serial,
		"同一音乐上下文被重复重启",
		failures
	)
	_expect(
		int(manager.debug_snapshot().get("ambienceTransitionSerial", -1))
		== town_ambience_transition_serial,
		"同一环境上下文被重复重启",
		failures
	)
	_expect(int(loader_calls.get("res://fake/music_town.wav", 0)) == 1, "城镇资源未单次缓存", failures)
	_expect(int(loader_calls.get("res://fake/ambience_town.wav", 0)) == 1, "城镇环境资源未单次缓存", failures)
	manager.silence_world_context()
	_expect(manager.current_music_cue() == "", "未知地图静音没有停止旧地图音乐", failures)
	_expect(manager.current_ambience_cue() == "", "未知地图静音没有停止旧地图环境声", failures)
	_expect(manager.sync_map_context("firebud_village_gate"), "静音后未恢复城镇音乐", failures)

	_expect(manager.enter_battle(), "战斗音乐未切入", failures)
	_expect(manager.current_music_cue() == "music.battle_normal", "战斗未覆盖地图音乐", failures)
	_expect(manager.current_ambience_cue() == "ambience.town", "战斗错误移除了当前地图环境声", failures)
	_expect(manager.is_ambience_ducked(), "战斗没有标记环境声 duck", failures)
	await create_timer(GameAudioManager.AMBIENCE_DUCK_SECONDS + 0.05).timeout
	_expect(
		is_equal_approx(
			float(manager.debug_snapshot().get("ambienceBusGainDb", 0.0)),
			GameAudioManager.AMBIENCE_BATTLE_DUCK_DB
		),
		"战斗环境声没有平滑压到目标电平",
		failures
	)
	_expect(manager.sync_map_context("mistcap_marsh"), "战斗中地图上下文同步失败", failures)
	_expect(manager.world_context() == "wilderness", "战斗中未记录新地图上下文", failures)
	_expect(manager.current_music_cue() == "music.battle_normal", "战斗中错误切回地图音乐", failures)
	_expect(manager.current_ambience_cue() == "ambience.town", "战斗中错误切换环境床", failures)
	_expect(manager.exit_battle(), "退出战斗未恢复地图音乐", failures)
	_expect(manager.current_music_cue() == "music.wilderness", "退出战斗未恢复当前野外音乐", failures)
	_expect(manager.current_ambience_cue() == "ambience.wilderness", "退出战斗未恢复当前野外环境声", failures)
	_expect(not manager.is_ambience_ducked(), "退出战斗后环境声仍标记为 duck", failures)
	await create_timer(GameAudioManager.AMBIENCE_DUCK_SECONDS + 0.05).timeout
	_expect(
		is_equal_approx(
			float(manager.debug_snapshot().get("ambienceBusGainDb", -99.0)),
			0.0
		),
		"退出战斗后环境声电平没有恢复",
		failures
	)
	_expect(manager.sync_music_context("cave"), "快速切换准备未进入洞窟音乐", failures)
	await create_timer(GameAudioManager.MUSIC_CROSSFADE_SECONDS + 0.10).timeout
	await process_frame
	await process_frame
	_expect(manager.current_music_cue() == "music.cave", "快速切换准备后的音乐不是洞窟", failures)

	_expect(manager.sync_music_context("town"), "快速切换未进入城镇过渡", failures)
	await create_timer(GameAudioManager.MUSIC_CROSSFADE_SECONDS * 0.25).timeout
	await process_frame
	var interrupted_snapshot := manager.debug_snapshot()
	var power_before_interrupt := float(
		interrupted_snapshot.get("combinedMusicPowerLinear", 0.0)
	)
	var louder_player_index := _loudest_music_player_index(manager)
	_expect(
		_playing_music_player_count(manager) == 2,
		"中途包络测试没有形成双轨交叉淡化",
		failures
	)
	_expect(louder_player_index >= 0, "中途包络测试找不到当前更响播放器", failures)
	_expect(manager.enter_battle(), "中途快速切换未进入战斗音乐", failures)
	var continued_snapshot := manager.debug_snapshot()
	var power_after_interrupt := float(
		continued_snapshot.get("combinedMusicPowerLinear", 0.0)
	)
	_expect(
		int(continued_snapshot.get("activeMusicPlayerIndex", -1)) != louder_player_index,
		"中途快速切换没有保留当前更响播放器作为 previous",
		failures
	)
	_expect(
		absf(power_after_interrupt - power_before_interrupt) <= 0.002,
		"中途快速切换总功率不连续：before=%.6f after=%.6f"
		% [power_before_interrupt, power_after_interrupt],
		failures
	)
	_expect(
		manager.current_music_cue() == "music.battle_normal",
		"中途快速切换后的活动音乐不是普通战斗",
		failures
	)
	await create_timer(GameAudioManager.MUSIC_CROSSFADE_SECONDS + 0.10).timeout
	await process_frame
	await process_frame
	var assigned_music_stream_count := _assigned_music_stream_count(manager)
	var playing_music_count := _playing_music_player_count(manager)
	_expect(
		assigned_music_stream_count == 1,
		"快速切换完成后没有收敛为单个音乐 stream：%d"
		% assigned_music_stream_count,
		failures
	)
	_expect(
		playing_music_count <= 1,
		"快速切换完成后仍有多个音乐播放器同时播放：%d" % playing_music_count,
		failures
	)
	_expect(manager.exit_battle(), "快速切换后无法退出战斗音乐", failures)
	_expect(manager.current_music_cue() == "music.town", "快速切换退出战斗未恢复城镇音乐", failures)
	for music_path in _music_paths():
		_expect(
			int(loader_calls.get(music_path, 0)) == 1,
			"快速切换重新同步加载了已预热音乐：%s" % music_path,
			failures
		)
	for ambience_path in _ambience_paths():
		_expect(
			int(loader_calls.get(ambience_path, 0)) == 1,
			"地图往返重新加载了已预热环境声：%s" % ambience_path,
			failures
		)

	for cue_index in 12:
		var cue_id := "combat.pool_%02d" % cue_index
		_expect(manager.play_cue(cue_id), "voice pool 第 %d 路未播放" % cue_index, failures)
	_expect(int(manager.debug_snapshot().get("activeVoiceCount", 0)) == 12, "SFX 并发未达到 12 路", failures)
	_expect(not manager.play_cue("combat.low_priority"), "低优先级 cue 错误抢占高优先级 voice", failures)
	_expect(manager.play_cue("outcome.high_priority"), "高优先级 cue 未抢占最低优先级 voice", failures)
	_expect(int(manager.debug_snapshot().get("activeVoiceCount", 0)) == 12, "voice 抢占后并发上限变化", failures)

	_expect(manager.play_cue("ui.cooldown"), "冷却 cue 首次播放失败", failures)
	_expect(not manager.play_cue("ui.cooldown"), "同 cue 冷却未去重", failures)
	_expect(
		manager.play_cue("ui.cooldown", {"cooldownKey": "combo.contact.0"}),
		"同 cue 的独立排程冷却键被错误吞掉",
		failures
	)
	_expect(
		manager.play_cue("ui.cooldown", {"cooldownKey": "combo.contact.1"}),
		"同帧第二个独立排程冷却键被错误吞掉",
		failures
	)
	_expect(
		not manager.play_cue("ui.cooldown", {"cooldownKey": "combo.contact.1"}),
		"相同排程冷却键没有去重",
		failures
	)
	now[0] = 1201
	_expect(manager.play_cue("ui.cooldown"), "冷却结束后 cue 未恢复", failures)

	manager.set_music_volume(0.31)
	manager.set_sfx_volume(0.64)
	manager.set_muted(true)
	_expect(FileAccess.file_exists(settings_path), "音量设置未持久化", failures)
	await _stop_drain_and_free(manager)

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
	_expect(restored.current_ambience_cue() == "", "关闭真实播放后未清理活动环境声", failures)
	restored.configure_playback_enabled(true)
	_expect(restored.current_music_cue() == "music.town", "重新开启真实播放后未恢复音乐", failures)
	_expect(restored.current_ambience_cue() == "ambience.town", "重新开启真实播放后未恢复环境声", failures)
	await _stop_drain_and_free(restored)

	var deferred_loader_calls := [0]
	var deferred_manager := GameAudioManagerScript.new()
	deferred_manager.configure_playback_enabled(false)
	deferred_manager.configure_catalog_path(catalog_path)
	deferred_manager.configure_settings_path(settings_path)
	deferred_manager.configure_stream_loader(func(_path: String):
		deferred_loader_calls[0] += 1
		return shared_stream
	)
	get_root().add_child(deferred_manager)
	await process_frame
	_expect(
		int(deferred_manager.debug_snapshot().get("warmedMusicStreamCount", -1)) == 0,
		"关闭真实播放的 headless manager 不应预热音乐",
		failures
	)
	_expect(
		int(deferred_manager.debug_snapshot().get("warmedAmbienceStreamCount", -1)) == 0,
		"关闭真实播放的 headless manager 不应预热环境声",
		failures
	)
	_expect(deferred_loader_calls[0] == 0, "关闭真实播放时仍同步加载了音乐", failures)
	_expect(
		deferred_manager.sync_music_context("town"),
		"关闭真实播放时未记录城镇音乐语境",
		failures
	)
	_expect(
		deferred_manager.current_music_cue() == "music.town",
		"关闭真实播放时没有保留城镇音乐路由",
		failures
	)
	_expect(deferred_loader_calls[0] == 0, "关闭真实播放时路由音乐触发了同步加载", failures)
	deferred_manager.configure_playback_enabled(true)
	_expect(
		int(deferred_manager.debug_snapshot().get("warmedMusicStreamCount", 0)) == 4,
		"重新开启真实播放后没有补齐四首音乐预热",
		failures
	)
	_expect(
		int(deferred_manager.debug_snapshot().get("warmedAmbienceStreamCount", 0)) == 3,
		"重新开启真实播放后没有补齐三条环境声预热",
		failures
	)
	_expect(deferred_loader_calls[0] == 7, "重新开启真实播放没有且仅预热七条长音频", failures)
	_expect(
		deferred_manager.current_music_cue() == "music.town",
		"重新开启真实播放后没有恢复已记录的城镇 cue",
		failures
	)
	_expect(
		deferred_manager.current_ambience_cue() == "ambience.town",
		"重新开启真实播放后没有恢复已记录的城镇环境 cue",
		failures
	)
	_expect(
		_assigned_music_stream_count(deferred_manager) == 1
		and _playing_music_player_count(deferred_manager) == 1,
		"重新开启真实播放后已记录的城镇 cue 没有实际加载并播放",
		failures
	)
	_expect(
		_assigned_ambience_stream_count(deferred_manager) == 1
		and _playing_ambience_player_count(deferred_manager) == 1,
		"重新开启真实播放后已记录的城镇环境 cue 没有实际加载并播放",
		failures
	)
	await _stop_drain_and_free(deferred_manager)

	var silent_manager := GameAudioManagerScript.new()
	silent_manager.configure_playback_enabled(true)
	silent_manager.configure_catalog_path(catalog_path)
	silent_manager.configure_settings_path(settings_path)
	get_root().add_child(silent_manager)
	await process_frame
	_expect(not silent_manager.sync_music_context("town"), "缺失资源时未安全静音", failures)
	_expect(not silent_manager.sync_ambience_context("town"), "缺失环境资源时未安全静音", failures)
	_expect(not silent_manager.play_cue("combat.pool_00"), "缺失 SFX 资源时未安全静音", failures)
	await _stop_drain_and_free(silent_manager)

	_finish(failures, [catalog_path, settings_path])


func _write_catalog(path: String) -> bool:
	var cues := {
		"music.town": _cue("res://fake/music_town.wav", "Music", "music", 0, 0),
		"music.wilderness": _cue("res://fake/music_wilderness.wav", "Music", "music", 0, 0),
		"music.cave": _cue("res://fake/music_cave.wav", "Music", "music", 0, 0),
		"music.battle_normal": _cue("res://fake/music_battle.wav", "Music", "music", 0, 0),
		"ambience.town": _cue("res://fake/ambience_town.wav", "Ambience", "ambience", 0, 0),
		"ambience.wilderness": _cue("res://fake/ambience_wilderness.wav", "Ambience", "ambience", 0, 0),
		"ambience.cave": _cue("res://fake/ambience_cave.wav", "Ambience", "ambience", 0, 0),
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
		"ambienceContexts": {
			"town": "ambience.town",
			"wilderness": "ambience.wilderness",
			"cave": "ambience.cave",
		},
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
		"loop": role in ["music", "ambience"],
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
	stream.loop_begin = 0
	stream.loop_end = 48000 * 5
	return stream


func _expect_music_crossfade_envelope(failures: Array[String]) -> void:
	var previous_incoming := -1.0
	var previous_outgoing := 2.0
	for progress in [0.0, 0.25, 0.5, 0.75, 1.0]:
		var gains := GameAudioManagerScript.music_crossfade_linear_gains(
			progress,
			1.0,
			1.0
		)
		var combined_power := gains.x * gains.x + gains.y * gains.y
		_expect(
			is_equal_approx(combined_power, 1.0),
			"等功率转场在 %.2f 进度出现能量凹洞：%.6f" % [progress, combined_power],
			failures
		)
		_expect(
			gains.x + 0.000001 >= previous_incoming,
			"转场进入声部没有单调上升",
			failures
		)
		_expect(
			gains.y <= previous_outgoing + 0.000001,
			"转场退出声部没有单调下降",
			failures
		)
		previous_incoming = gains.x
		previous_outgoing = gains.y
	var midpoint := GameAudioManagerScript.music_crossfade_linear_gains(0.5, 1.0, 1.0)
	_expect(
		is_equal_approx(midpoint.x, sqrt(0.5))
		and is_equal_approx(midpoint.y, sqrt(0.5)),
		"等功率转场中点不是 -3 dB / -3 dB",
		failures
	)


func _music_paths() -> Array[String]:
	return [
		"res://fake/music_town.wav",
		"res://fake/music_wilderness.wav",
		"res://fake/music_cave.wav",
		"res://fake/music_battle.wav",
	]


func _ambience_paths() -> Array[String]:
	return [
		"res://fake/ambience_town.wav",
		"res://fake/ambience_wilderness.wav",
		"res://fake/ambience_cave.wav",
	]


func _playing_music_player_count(manager: Node) -> int:
	var count := 0
	for child in manager.get_children():
		if (
			child is AudioStreamPlayer
			and str(child.name).begins_with("MusicPlayer")
			and (child as AudioStreamPlayer).playing
		):
			count += 1
	return count


func _assigned_music_stream_count(manager: Node) -> int:
	var count := 0
	for child in manager.get_children():
		if (
			child is AudioStreamPlayer
			and str(child.name).begins_with("MusicPlayer")
			and (child as AudioStreamPlayer).stream != null
		):
			count += 1
	return count


func _playing_ambience_player_count(manager: Node) -> int:
	var count := 0
	for child in manager.get_children():
		if (
			child is AudioStreamPlayer
			and str(child.name).begins_with("AmbiencePlayer")
			and (child as AudioStreamPlayer).playing
		):
			count += 1
	return count


func _assigned_ambience_stream_count(manager: Node) -> int:
	var count := 0
	for child in manager.get_children():
		if (
			child is AudioStreamPlayer
			and str(child.name).begins_with("AmbiencePlayer")
			and (child as AudioStreamPlayer).stream != null
		):
			count += 1
	return count


func _loudest_music_player_index(manager: Node) -> int:
	var result := -1
	var loudest_linear := -1.0
	var music_index := 0
	for child in manager.get_children():
		if not (
			child is AudioStreamPlayer
			and str(child.name).begins_with("MusicPlayer")
		):
			continue
		var player := child as AudioStreamPlayer
		if player.stream != null and player.playing:
			var linear_gain := db_to_linear(player.volume_db)
			if linear_gain > loudest_linear:
				result = music_index
				loudest_linear = linear_gain
		music_index += 1
	return result


func _stop_drain_and_free(manager: Node) -> void:
	if manager == null or not is_instance_valid(manager):
		return
	if manager.has_method("stop_all"):
		manager.call("stop_all")
	await process_frame
	await process_frame
	manager.queue_free()
	await process_frame
	await process_frame


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
		print("game audio manager check ready: status=ok buses=6 music_crossfade=equal_power_0.75 ambience_crossfade=equal_power_0.75 ambience_prewarm=3 battle_duck_db=-12 voices=12 persistence=true")
		quit(0)
		return
	for failure in failures:
		push_error(failure)
	print("game audio manager check ready: status=failed errors=%s" % "；".join(failures))
	quit(1)
