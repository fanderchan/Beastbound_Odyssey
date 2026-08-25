extends SceneTree

const GameAudioManager := preload("res://scripts/audio/game_audio_manager.gd")
const WorldAudioContextModel := preload("res://scripts/audio/world_audio_context_model.gd")
const CATALOG_PATH := "res://assets/audio/beastbound_audio_v2/audio-cues.json"
const RELEASE_GATE_PATH := "res://data/audio_ambience_release_gate_v1.json"
const EXPECTED_CUE_COUNT := 34
const EXPECTED_AMBIENCE_HASHES := {
	"ambience.cave": "f30c8e32f517d0c2426aea75d569f2e943f213054212e526a31c22702208f283",
	"ambience.town": "755dc0e18b20d9be0b0bf2ebe6b6de9dad44cf99f1b00bbace6d6fa9de6ec8e3",
	"ambience.wilderness": "a3388bca77d9b620d48661fd363e72d2850dfc6909ff12f1dd0086bb6bd9f3f2",
}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var errors: Array[String] = []
	var temp_root := "res://.run/qa/audio_runtime_check"
	if (
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(temp_root))
		!= OK
	):
		push_error("无法创建隔离的音频运行检查临时目录")
		quit(1)
		return
	var settings_path := "%s/settings-%d.json" % [temp_root, OS.get_process_id()]
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
	var release_gate := _load_release_gate(errors)
	_validate_release_gate(catalog, release_gate, errors)
	var loaded_audio_count := _validate_runtime_files(catalog, errors)
	var contexts = catalog.get("contexts", {}) as Dictionary
	var ambience_contexts = catalog.get("ambienceContexts", {}) as Dictionary
	for context in ["town", "wilderness", "cave", "battle_normal"]:
		if str(contexts.get(context, "")) == "":
			errors.append("目录缺少音乐语境：%s" % context)
	for context in ["town", "wilderness", "cave"]:
		if str(ambience_contexts.get(context, "")) == "":
			errors.append("目录缺少环境语境：%s" % context)

	manager.sync_map_context(
		"firebud_village_gate",
		WorldAudioContextModel.context_for("firebud_village_gate")
	)
	if manager.current_music_cue() != "music.town":
		errors.append("村庄没有切到 music.town")
	if manager.current_ambience_cue() != "":
		errors.append("首发延期后村庄仍激活了 ambience.town")
	if not manager.ambience_release_gate_valid():
		errors.append("环境声延期发布门无效")
	if manager.ambience_runtime_enabled():
		errors.append("环境声延期发布门错误启用了普通运行时")
	if manager.ambience_playback_available():
		errors.append("普通运行检查错误获得环境声播放资格")
	if manager.play_cue("ambience.town"):
		errors.append("普通运行检查绕过发布门直接播放环境声")
	var stable_serial := int(manager.debug_snapshot().get("musicTransitionSerial", -1))
	var stable_ambience_serial := int(
		manager.debug_snapshot().get("ambienceTransitionSerial", -1)
	)
	manager.sync_map_context(
		"firebud_village_gate",
		WorldAudioContextModel.context_for("firebud_village_gate")
	)
	if int(manager.debug_snapshot().get("musicTransitionSerial", -2)) != stable_serial:
		errors.append("重复同步同一地图重启了音乐")
	if (
		int(manager.debug_snapshot().get("ambienceTransitionSerial", -2))
		!= stable_ambience_serial
	):
		errors.append("重复同步同一地图重启了环境声")
	manager.sync_map_context(
		"earth_vein_cave",
		WorldAudioContextModel.context_for("earth_vein_cave")
	)
	if manager.current_music_cue() != "music.cave":
		errors.append("洞窟没有切到 music.cave")
	if manager.current_ambience_cue() != "":
		errors.append("首发延期后洞窟仍激活了 ambience.cave")
	manager.enter_battle(false)
	if manager.current_music_cue() != "music.battle_normal":
		errors.append("战斗没有覆盖为 music.battle_normal")
	if manager.current_ambience_cue() != "":
		errors.append("战斗错误恢复了已延期的洞窟环境声")
	if manager.is_ambience_ducked():
		errors.append("无活动环境声时仍错误触发了战斗 duck")
	manager.exit_battle()
	if manager.current_music_cue() != "music.cave":
		errors.append("战斗结束没有恢复洞窟音乐")
	if manager.current_ambience_cue() != "":
		errors.append("战斗结束错误恢复了已延期的洞窟环境声")
	if manager.is_ambience_ducked():
		errors.append("战斗结束没有解除环境声 duck")

	var played_cues := 0
	var cues = catalog.get("cues", {}) as Dictionary
	if cues.size() != EXPECTED_CUE_COUNT:
		errors.append(
			"正式音频目录必须正好有%d个 cue，实际%d"
			% [EXPECTED_CUE_COUNT, cues.size()]
		)
	for cue_id_value in cues.keys():
		var cue_id := str(cue_id_value)
		var cue = cues.get(cue_id, {}) as Dictionary
		if str(cue.get("role", "")) in ["music", "ambience"]:
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
	var restored_snapshot := restored.debug_snapshot()
	if (
		bool(restored_snapshot.get("ambiencePlaybackAvailable", true))
		or int(restored_snapshot.get("warmedAmbienceStreamCount", -1)) != 0
		or str(restored_snapshot.get("activeAmbienceCue", "unexpected")) != ""
	):
		errors.append("设置恢复后的普通 manager 错误激活了环境声")

	var master_index := AudioServer.get_bus_index("Master")
	var limiter_count := 0
	if master_index >= 0:
		for effect_index in AudioServer.get_bus_effect_count(master_index):
			if AudioServer.get_bus_effect(master_index, effect_index) is AudioEffectHardLimiter:
				limiter_count += 1
	if limiter_count != 1:
		errors.append("Master HardLimiter 数量不是 1：%d" % limiter_count)
	for bus_name in ["Music", "SFX", "Ambience", "Combat", "Pet", "UI"]:
		if AudioServer.get_bus_index(bus_name) < 0:
			errors.append("缺少音频总线：%s" % bus_name)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_runtime_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"catalogReviewState": str(catalog.get("reviewState", "")),
		"ambienceReleaseDecision": str(release_gate.get("decision", "")),
		"ambienceReleaseGateValid": bool(
			manager.debug_snapshot().get("ambienceReleaseGateValid", false)
		),
		"ambienceRuntimeEnabled": bool(
			manager.debug_snapshot().get("ambienceRuntimeEnabled", true)
		),
		"ambiencePlaybackAvailable": bool(
			manager.debug_snapshot().get("ambiencePlaybackAvailable", true)
		),
		"warmedAmbienceStreamCount": int(
			manager.debug_snapshot().get("warmedAmbienceStreamCount", -1)
		),
		"catalogCueCount": cues.size(),
		"loadedAudioCount": loaded_audio_count,
		"ambienceContextCount": ambience_contexts.size(),
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


func _load_release_gate(errors: Array[String]) -> Dictionary:
	if not FileAccess.file_exists(RELEASE_GATE_PATH):
		errors.append("环境声发布门文件不存在")
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(RELEASE_GATE_PATH))
	if not (parsed is Dictionary):
		errors.append("环境声发布门 JSON 无法解析")
		return {}
	return (parsed as Dictionary).duplicate(true)


func _validate_release_gate(
	catalog: Dictionary,
	gate: Dictionary,
	errors: Array[String]
) -> void:
	if int(gate.get("schemaVersion", 0)) != 1:
		errors.append("环境声发布门 schemaVersion 必须为 1")
	if str(gate.get("bundleId", "")) != str(catalog.get("bundleId", "")):
		errors.append("环境声发布门没有绑定当前音频 bundle")
	if (
		str(gate.get("reviewOverride", ""))
		!= "dedicated_isolated_qa_scene_only"
	):
		errors.append("环境声发布门没有限制为隔离 QA 审查")
	if (
		str(gate.get("decision", "")) != "deferred"
		or str(gate.get("ownerReviewStatus", "")) != "owner_listening_pending"
		or bool(gate.get("releaseApproved", true))
		or bool(gate.get("runtimeEnabled", true))
	):
		errors.append("环境声发布门没有保持延期关闭态")
	if (
		gate.get("ownerAcceptance", null) != null
		or gate.get("ownerDecisionDigest", null) != null
		or gate.get("releaseAttestation", null) != null
	):
		errors.append("环境声延期门错误携带了 owner／发布产物")
	var cue_hashes = gate.get("cueRuntimeSha256", {})
	if not cue_hashes is Dictionary:
		errors.append("环境声发布门缺少 cueRuntimeSha256")
		return
	for cue_id_value in EXPECTED_AMBIENCE_HASHES.keys():
		var cue_id := str(cue_id_value)
		var cue = (catalog.get("cues", {}) as Dictionary).get(cue_id, {})
		if not cue is Dictionary:
			errors.append("环境声发布门引用的 cue 不存在：%s" % cue_id)
			continue
		var expected_hash := str(EXPECTED_AMBIENCE_HASHES.get(cue_id, ""))
		if str((cue_hashes as Dictionary).get(cue_id, "")) != expected_hash:
			errors.append("环境声发布门 hash 漂移：%s" % cue_id)
			continue
		var path := str((cue as Dictionary).get("path", ""))
		if not FileAccess.file_exists(path):
			errors.append("环境声发布门运行文件不存在：%s" % cue_id)
			continue
		if FileAccess.get_sha256(path) != expected_hash:
			errors.append("环境声发布门运行文件字节漂移：%s" % cue_id)


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
