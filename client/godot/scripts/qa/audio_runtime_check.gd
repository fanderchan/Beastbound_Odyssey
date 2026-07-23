extends SceneTree

const GameAudioManager := preload("res://scripts/audio/game_audio_manager.gd")
const WorldAudioContextModel := preload("res://scripts/audio/world_audio_context_model.gd")
const CATALOG_PATH := "res://assets/audio/beastbound_audio_v1/audio-cues.json"


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var settings_path := "user://audio-runtime-check-%d.json" % OS.get_process_id()
	_remove_settings_file(settings_path)
	var manager := GameAudioManager.new()
	manager.configure_settings_path(settings_path)
	get_root().add_child(manager)
	await process_frame
	if bool(manager.debug_snapshot().get("playbackEnabled", true)):
		errors.append("headless 音频检查不应创建真实播放实例")
	if not manager.catalog_loaded():
		errors.append("真实音频目录未加载：%s" % manager.catalog_error())
	var catalog := _load_catalog(errors)
	var loaded_audio_count := _validate_runtime_files(catalog, errors)
	var contexts = catalog.get("contexts", {}) as Dictionary
	for context in ["town", "wilderness", "cave", "battle_normal"]:
		if str(contexts.get(context, "")) == "":
			errors.append("目录缺少音乐语境：%s" % context)

	manager.sync_map_context(
		"firebud_village_gate",
		WorldAudioContextModel.context_for("firebud_village_gate")
	)
	if manager.current_music_cue() != "music.town":
		errors.append("村庄没有切到 music.town")
	var stable_serial := int(manager.debug_snapshot().get("musicTransitionSerial", -1))
	manager.sync_map_context(
		"firebud_village_gate",
		WorldAudioContextModel.context_for("firebud_village_gate")
	)
	if int(manager.debug_snapshot().get("musicTransitionSerial", -2)) != stable_serial:
		errors.append("重复同步同一地图重启了音乐")
	manager.sync_map_context(
		"earth_vein_cave",
		WorldAudioContextModel.context_for("earth_vein_cave")
	)
	if manager.current_music_cue() != "music.cave":
		errors.append("洞窟没有切到 music.cave")
	manager.enter_battle(false)
	if manager.current_music_cue() != "music.battle_normal":
		errors.append("战斗没有覆盖为 music.battle_normal")
	manager.exit_battle()
	if manager.current_music_cue() != "music.cave":
		errors.append("战斗结束没有恢复洞窟音乐")

	var played_cues := 0
	var cues = catalog.get("cues", {}) as Dictionary
	for cue_id_value in cues.keys():
		var cue_id := str(cue_id_value)
		var cue = cues.get(cue_id, {}) as Dictionary
		if str(cue.get("role", "")) == "music":
			continue
		if manager.play_cue(cue_id):
			played_cues += 1
	var pool_snapshot := manager.debug_snapshot()
	if int(pool_snapshot.get("voicePoolSize", 0)) != 12:
		errors.append("音效池不是固定 12 路")
	if int(pool_snapshot.get("activeVoiceCount", 0)) > 12:
		errors.append("音效并发超过 12 路上限")
	if played_cues < 12:
		errors.append("真实音效可播放覆盖不足：%d" % played_cues)

	manager.set_music_volume(0.37)
	manager.set_sfx_volume(0.23)
	manager.set_muted(true)
	var restored := GameAudioManager.new()
	restored.configure_settings_path(settings_path)
	get_root().add_child(restored)
	await process_frame
	var restored_settings := restored.settings_snapshot()
	if (
		not is_equal_approx(float(restored_settings.get("musicVolume", -1.0)), 0.37)
		or not is_equal_approx(float(restored_settings.get("sfxVolume", -1.0)), 0.23)
		or not bool(restored_settings.get("muted", false))
	):
		errors.append("声音设置没有跨 manager 持久化")

	var master_index := AudioServer.get_bus_index("Master")
	var limiter_count := 0
	if master_index >= 0:
		for effect_index in AudioServer.get_bus_effect_count(master_index):
			if AudioServer.get_bus_effect(master_index, effect_index) is AudioEffectHardLimiter:
				limiter_count += 1
	if limiter_count != 1:
		errors.append("Master HardLimiter 数量不是 1：%d" % limiter_count)
	for bus_name in ["Music", "SFX", "Combat", "Pet", "UI"]:
		if AudioServer.get_bus_index(bus_name) < 0:
			errors.append("缺少音频总线：%s" % bus_name)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_runtime_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"catalogReviewState": str(catalog.get("reviewState", "")),
		"catalogCueCount": cues.size(),
		"loadedAudioCount": loaded_audio_count,
		"playedSfxCueCount": played_cues,
		"voicePoolSize": int(pool_snapshot.get("voicePoolSize", 0)),
		"limiterCount": limiter_count,
		"errors": errors,
	}
	print("audio runtime check: %s" % JSON.stringify(report))
	manager.stop_all()
	restored.stop_all()
	manager.queue_free()
	restored.queue_free()
	_remove_settings_file(settings_path)
	await process_frame
	await process_frame
	quit(0 if errors.is_empty() else 1)


func _load_catalog(errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(CATALOG_PATH):
		errors.append("目录文件不存在")
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_PATH))
	if not (parsed is Dictionary):
		errors.append("目录 JSON 无法解析")
		return {}
	return (parsed as Dictionary).duplicate(true)


func _validate_runtime_files(catalog: Dictionary, errors: Array[String]) -> int:
	var loaded := 0
	var seen_paths := {}
	var cues = catalog.get("cues", {}) as Dictionary
	for cue_id_value in cues.keys():
		var cue_id := str(cue_id_value)
		var cue = cues.get(cue_id, {}) as Dictionary
		var path := str(cue.get("path", ""))
		if path == "":
			errors.append("cue 缺少路径：%s" % cue_id)
			continue
		if seen_paths.has(path):
			continue
		seen_paths[path] = true
		if not ResourceLoader.exists(path):
			errors.append("Godot 无法识别音频：%s" % path)
			continue
		var stream = ResourceLoader.load(path)
		if not (stream is AudioStream):
			errors.append("资源不是 AudioStream：%s" % path)
			continue
		loaded += 1
	return loaded


func _remove_settings_file(settings_path: String) -> void:
	var absolute_path := ProjectSettings.globalize_path(settings_path)
	if FileAccess.file_exists(settings_path):
		DirAccess.remove_absolute(absolute_path)
	var temp_path := "%s.tmp" % settings_path
	if FileAccess.file_exists(temp_path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(temp_path))
