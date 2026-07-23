class_name GameAudioManager
extends Node

signal music_context_changed(context: String, cue_id: String)
signal settings_changed(settings: Dictionary)

const DEFAULT_CATALOG_PATH := "res://assets/audio/beastbound_audio_v1/audio-cues.json"
const DEFAULT_SETTINGS_PATH := "user://beastbound_audio_settings.json"
const MUSIC_CROSSFADE_SECONDS := 0.75
const SFX_VOICE_COUNT := 12
const MASTER_LIMITER_CEILING_DB := -2.0
const SILENCE_DB := -80.0

const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"
const BUS_COMBAT := "Combat"
const BUS_PET := "Pet"
const BUS_UI := "UI"

const DEFAULT_SETTINGS := {
	"schemaVersion": 1,
	"musicVolume": 0.72,
	"sfxVolume": 0.86,
	"muted": false,
}

var _catalog_path := DEFAULT_CATALOG_PATH
var _settings_path := DEFAULT_SETTINGS_PATH
var _catalog: Dictionary = {}
var _contexts: Dictionary = {}
var _cues: Dictionary = {}
var _catalog_loaded := false
var _catalog_error := ""

var _settings: Dictionary = DEFAULT_SETTINGS.duplicate(true)
var _stream_cache: Dictionary = {}
var _missing_stream_paths: Dictionary = {}
var _stream_loader: Callable
var _clock_msec: Callable
var _playback_enabled := true
var _playback_mode_configured := false

var _music_players: Array[AudioStreamPlayer] = []
var _active_music_player_index := -1
var _active_music_cue := ""
var _active_music_context := ""
var _music_tween: Tween
var _music_transition_serial := 0

var _sfx_voices: Array[Dictionary] = []
var _voice_serial := 0
var _last_cue_played_msec: Dictionary = {}

var _world_context := "town"
var _battle_active := false
var _boss_battle_active := false


func configure_catalog_path(path: String) -> void:
	_catalog_path = path.strip_edges() if path.strip_edges() != "" else DEFAULT_CATALOG_PATH
	_catalog_loaded = false
	_catalog_error = ""
	_catalog.clear()
	_contexts.clear()
	_cues.clear()
	_stream_cache.clear()
	_missing_stream_paths.clear()
	if is_inside_tree():
		_load_catalog_once()
		_sync_effective_music()


func configure_settings_path(path: String) -> void:
	_settings_path = path.strip_edges() if path.strip_edges() != "" else DEFAULT_SETTINGS_PATH
	if is_inside_tree():
		_load_settings()
		_apply_settings_to_buses()


func configure_stream_loader(loader: Callable) -> void:
	_stream_loader = loader
	_stream_cache.clear()
	_missing_stream_paths.clear()


func configure_clock_msec(clock: Callable) -> void:
	_clock_msec = clock


func configure_playback_enabled(value: bool) -> void:
	var changed := _playback_enabled != value
	_playback_enabled = value
	_playback_mode_configured = true
	if not is_inside_tree() or not changed:
		return
	if not _playback_enabled:
		stop_all()
	else:
		_sync_effective_music()


func _ready() -> void:
	if not _playback_mode_configured:
		# Headless checks still exercise catalog, routing, cooldown and state
		# transitions, but must not leave AudioStreamPlayback objects behind when
		# SceneTree.quit() tears the process down immediately.
		_playback_enabled = DisplayServer.get_name() != "headless"
	_ensure_audio_buses()
	_build_music_players()
	_build_sfx_voice_pool()
	_load_settings()
	_load_catalog_once()
	_apply_settings_to_buses()


func _exit_tree() -> void:
	if _music_tween != null and _music_tween.is_valid():
		_music_tween.kill()
	_music_tween = null
	_release_player_streams()
	_stream_cache.clear()
	_missing_stream_paths.clear()


func _release_player_streams() -> void:
	for player in _music_players:
		player.stop()
		player.stream = null
	for record in _sfx_voices:
		var player := record.get("player") as AudioStreamPlayer
		if player != null:
			player.stop()
			player.stream = null


func sync_map_context(map_id: String, context_hint: String = "") -> bool:
	var next_context := _normalize_world_context(context_hint)
	if next_context == "":
		next_context = context_for_map_id(map_id)
	_world_context = next_context
	if _battle_active:
		return true
	return _switch_music_context(_world_context)


func sync_music_context(context: String) -> bool:
	var next_context := _normalize_world_context(context)
	if next_context == "":
		return false
	_world_context = next_context
	if _battle_active:
		return true
	return _switch_music_context(_world_context)


func enter_battle(is_boss: bool = false) -> bool:
	_battle_active = true
	_boss_battle_active = is_boss
	return _switch_music_context(_battle_music_context())


func exit_battle() -> bool:
	_battle_active = false
	_boss_battle_active = false
	if _world_context == "":
		_silence_music_players()
		return true
	return _switch_music_context(_world_context)


func sync_battle_context(active: bool, is_boss: bool = false) -> bool:
	return enter_battle(is_boss) if active else exit_battle()


func silence_world_context() -> void:
	_world_context = ""
	if not _battle_active:
		_silence_music_players()


func play_cue(cue_id: String, options: Dictionary = {}) -> bool:
	var info := cue_info(cue_id)
	if info.is_empty():
		return false
	var role := str(info.get("role", "")).strip_edges().to_lower()
	if role == "music":
		return _switch_music_cue(cue_id, _context_for_music_cue(cue_id))
	var path := str(info.get("path", "")).strip_edges()
	if not _source_path_exists(path):
		return false
	var now_msec := _now_msec()
	var cooldown_msec := maxi(0, int(info.get("cooldownMs", 0)))
	if _last_cue_played_msec.has(cue_id):
		var elapsed := now_msec - int(_last_cue_played_msec[cue_id])
		if elapsed >= 0 and elapsed < cooldown_msec:
			return false
	if not _playback_enabled:
		_last_cue_played_msec[cue_id] = now_msec
		return true
	var stream := _stream_for_path(path)
	if stream == null:
		return false
	var priority := int(options.get("priority", info.get("priority", 0)))
	var voice_index := _voice_index_for(priority)
	if voice_index < 0:
		return false
	var record := _sfx_voices[voice_index]
	var player := record.get("player") as AudioStreamPlayer
	if player == null:
		return false
	if player.playing:
		player.stop()
	player.stream = stream
	player.bus = _normalized_sfx_bus(str(info.get("bus", BUS_SFX)))
	player.volume_db = float(info.get("gainDb", 0.0)) + float(options.get("gainDbOffset", 0.0))
	player.pitch_scale = clampf(float(options.get("pitchScale", 1.0)), 0.5, 2.0)
	player.play()
	_voice_serial += 1
	record["cueId"] = cue_id
	record["priority"] = priority
	record["startedMsec"] = now_msec
	record["serial"] = _voice_serial
	_sfx_voices[voice_index] = record
	_last_cue_played_msec[cue_id] = now_msec
	return true


func play_sfx(cue_id: String, options: Dictionary = {}) -> bool:
	return play_cue(cue_id, options)


func set_music_volume(value: float, persist: bool = true) -> void:
	_settings["musicVolume"] = clampf(value, 0.0, 1.0)
	_apply_settings_to_buses()
	if persist:
		save_settings()
	settings_changed.emit(settings_snapshot())


func set_sfx_volume(value: float, persist: bool = true) -> void:
	_settings["sfxVolume"] = clampf(value, 0.0, 1.0)
	_apply_settings_to_buses()
	if persist:
		save_settings()
	settings_changed.emit(settings_snapshot())


func set_muted(value: bool, persist: bool = true) -> void:
	_settings["muted"] = value
	_apply_settings_to_buses()
	if persist:
		save_settings()
	settings_changed.emit(settings_snapshot())


func is_muted() -> bool:
	return bool(_settings.get("muted", false))


func music_volume() -> float:
	return float(_settings.get("musicVolume", DEFAULT_SETTINGS.musicVolume))


func sfx_volume() -> float:
	return float(_settings.get("sfxVolume", DEFAULT_SETTINGS.sfxVolume))


func settings_snapshot() -> Dictionary:
	return _normalized_settings(_settings)


func save_settings() -> bool:
	var normalized := _normalized_settings(_settings)
	var absolute_dir := ProjectSettings.globalize_path(_settings_path.get_base_dir())
	if absolute_dir != "" and DirAccess.make_dir_recursive_absolute(absolute_dir) != OK:
		return false
	var temp_path := "%s.tmp" % _settings_path
	var file := FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(normalized, "\t") + "\n")
	file.close()
	var absolute_path := ProjectSettings.globalize_path(_settings_path)
	var absolute_temp_path := ProjectSettings.globalize_path(temp_path)
	if FileAccess.file_exists(_settings_path):
		var remove_error := DirAccess.remove_absolute(absolute_path)
		if remove_error != OK:
			DirAccess.remove_absolute(absolute_temp_path)
			return false
	return DirAccess.rename_absolute(absolute_temp_path, absolute_path) == OK


func cue_info(cue_id: String) -> Dictionary:
	var value = _cues.get(cue_id, {})
	return (value as Dictionary).duplicate(true) if value is Dictionary else {}


func context_cue(context: String) -> String:
	var value = _contexts.get(context, "")
	if value is Dictionary:
		return str((value as Dictionary).get("cueId", ""))
	return str(value)


func catalog_loaded() -> bool:
	return _catalog_loaded


func catalog_error() -> String:
	return _catalog_error


func current_music_cue() -> String:
	return _active_music_cue


func current_music_context() -> String:
	return _active_music_context


func world_context() -> String:
	return _world_context


func is_battle_active() -> bool:
	return _battle_active


func stop_all() -> void:
	if _music_tween != null and _music_tween.is_valid():
		_music_tween.kill()
	_music_tween = null
	_release_player_streams()
	_active_music_player_index = -1
	_active_music_cue = ""
	_active_music_context = ""


func _silence_music_players() -> void:
	if _music_tween != null and _music_tween.is_valid():
		_music_tween.kill()
	_music_tween = null
	for player in _music_players:
		player.stop()
		player.stream = null
	_active_music_player_index = -1
	_active_music_cue = ""
	_active_music_context = ""


func debug_snapshot() -> Dictionary:
	var active_voice_count := 0
	for record in _sfx_voices:
		var player := record.get("player") as AudioStreamPlayer
		if player != null and player.playing:
			active_voice_count += 1
	return {
		"catalogLoaded": _catalog_loaded,
		"catalogError": _catalog_error,
		"catalogPath": _catalog_path,
		"cueCount": _cues.size(),
		"worldContext": _world_context,
		"battleActive": _battle_active,
		"bossBattleActive": _boss_battle_active,
		"activeMusicContext": _active_music_context,
		"activeMusicCue": _active_music_cue,
		"musicTransitionSerial": _music_transition_serial,
		"playbackEnabled": _playback_enabled,
		"streamCacheCount": _stream_cache.size(),
		"missingStreamCount": _missing_stream_paths.size(),
		"voicePoolSize": _sfx_voices.size(),
		"activeVoiceCount": active_voice_count,
		"settings": settings_snapshot(),
	}


static func context_for_map_id(map_id: String) -> String:
	var normalized := map_id.strip_edges().to_lower()
	for cave_token in ["cave", "cavern", "mine", "dungeon", "underground", "grotto"]:
		if normalized.contains(cave_token):
			return "cave"
	for town_token in ["village", "town", "manor", "training", "settlement"]:
		if normalized.contains(town_token):
			return "town"
	return "wilderness"


func _load_catalog_once() -> void:
	if _catalog_loaded:
		return
	_catalog_error = ""
	if not FileAccess.file_exists(_catalog_path):
		_catalog_error = "catalog_missing"
		return
	var file := FileAccess.open(_catalog_path, FileAccess.READ)
	if file == null:
		_catalog_error = "catalog_unreadable"
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		_catalog_error = "catalog_invalid_json"
		return
	var raw := parsed as Dictionary
	var raw_contexts = raw.get("contexts", {})
	var raw_cues = raw.get("cues", {})
	if not raw_contexts is Dictionary or not raw_cues is Dictionary:
		_catalog_error = "catalog_invalid_shape"
		return
	_catalog = raw.duplicate(true)
	_contexts = (raw_contexts as Dictionary).duplicate(true)
	_cues = (raw_cues as Dictionary).duplicate(true)
	_catalog_loaded = true


func _load_settings() -> void:
	_settings = DEFAULT_SETTINGS.duplicate(true)
	if not FileAccess.file_exists(_settings_path):
		return
	var file := FileAccess.open(_settings_path, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		_settings = _normalized_settings(parsed as Dictionary)


func _normalized_settings(value: Dictionary) -> Dictionary:
	return {
		"schemaVersion": 1,
		"musicVolume": clampf(float(value.get("musicVolume", DEFAULT_SETTINGS.musicVolume)), 0.0, 1.0),
		"sfxVolume": clampf(float(value.get("sfxVolume", DEFAULT_SETTINGS.sfxVolume)), 0.0, 1.0),
		"muted": bool(value.get("muted", DEFAULT_SETTINGS.muted)),
	}


func _ensure_audio_buses() -> void:
	_ensure_bus(BUS_MUSIC, "Master")
	_ensure_bus(BUS_SFX, "Master")
	_ensure_bus(BUS_COMBAT, BUS_SFX)
	_ensure_bus(BUS_PET, BUS_SFX)
	_ensure_bus(BUS_UI, BUS_SFX)
	_ensure_master_limiter()


func _ensure_bus(bus_name: String, send_name: String) -> void:
	var index := AudioServer.get_bus_index(bus_name)
	if index < 0:
		AudioServer.add_bus()
		index = AudioServer.bus_count - 1
		AudioServer.set_bus_name(index, bus_name)
	if send_name != "" and AudioServer.get_bus_index(send_name) >= 0:
		AudioServer.set_bus_send(index, send_name)


func _ensure_master_limiter() -> void:
	var master_index := AudioServer.get_bus_index("Master")
	if master_index < 0:
		return
	for effect_index in AudioServer.get_bus_effect_count(master_index):
		var effect = AudioServer.get_bus_effect(master_index, effect_index)
		if effect is AudioEffectHardLimiter:
			(effect as AudioEffectHardLimiter).ceiling_db = MASTER_LIMITER_CEILING_DB
			return
	var limiter := AudioEffectHardLimiter.new()
	limiter.ceiling_db = MASTER_LIMITER_CEILING_DB
	AudioServer.add_bus_effect(master_index, limiter)


func _apply_settings_to_buses() -> void:
	var music_index := AudioServer.get_bus_index(BUS_MUSIC)
	var sfx_index := AudioServer.get_bus_index(BUS_SFX)
	if music_index >= 0:
		AudioServer.set_bus_volume_db(music_index, _linear_volume_to_db(float(_settings.musicVolume)))
		AudioServer.set_bus_mute(music_index, bool(_settings.muted))
	if sfx_index >= 0:
		AudioServer.set_bus_volume_db(sfx_index, _linear_volume_to_db(float(_settings.sfxVolume)))
		AudioServer.set_bus_mute(sfx_index, bool(_settings.muted))


func _build_music_players() -> void:
	if not _music_players.is_empty():
		return
	for index in 2:
		var player := AudioStreamPlayer.new()
		player.name = "MusicPlayer%d" % (index + 1)
		player.bus = BUS_MUSIC
		player.volume_db = SILENCE_DB
		add_child(player)
		_music_players.append(player)


func _build_sfx_voice_pool() -> void:
	if not _sfx_voices.is_empty():
		return
	for index in SFX_VOICE_COUNT:
		var player := AudioStreamPlayer.new()
		player.name = "SfxVoice%02d" % (index + 1)
		player.bus = BUS_SFX
		add_child(player)
		_sfx_voices.append({
			"player": player,
			"cueId": "",
			"priority": -2147483648,
			"startedMsec": 0,
			"serial": 0,
		})


func _sync_effective_music() -> bool:
	return _switch_music_context(_battle_music_context() if _battle_active else _world_context)


func _switch_music_context(context: String) -> bool:
	var cue_id := context_cue(context)
	if cue_id == "":
		return false
	return _switch_music_cue(cue_id, context)


func _switch_music_cue(cue_id: String, context: String) -> bool:
	if cue_id == _active_music_cue:
		_active_music_context = context
		return true
	var info := cue_info(cue_id)
	if info.is_empty():
		_silence_music_players()
		return false
	var path := str(info.get("path", "")).strip_edges()
	if not _source_path_exists(path):
		_silence_music_players()
		return false
	if not _playback_enabled:
		_music_transition_serial += 1
		_active_music_player_index = -1
		_active_music_cue = cue_id
		_active_music_context = context
		music_context_changed.emit(context, cue_id)
		return true
	var stream := _stream_for_path(path)
	if stream == null:
		_silence_music_players()
		return false
	_configure_music_loop(stream, bool(info.get("loop", true)))
	if _music_players.size() < 2:
		return false
	var previous: AudioStreamPlayer = null
	if _active_music_player_index >= 0:
		previous = _music_players[_active_music_player_index]
	var target_index := 0 if _active_music_player_index != 0 else 1
	var target := _music_players[target_index]
	if _music_tween != null and _music_tween.is_valid():
		_music_tween.kill()
	target.stop()
	target.stream = stream
	target.bus = BUS_MUSIC
	target.volume_db = SILENCE_DB
	target.play()
	var target_gain_db := float(info.get("gainDb", 0.0))
	_music_transition_serial += 1
	var transition_serial := _music_transition_serial
	_music_tween = create_tween().set_parallel(true)
	_music_tween.tween_property(target, "volume_db", target_gain_db, MUSIC_CROSSFADE_SECONDS)
	if previous != null and previous != target:
		_music_tween.tween_property(previous, "volume_db", SILENCE_DB, MUSIC_CROSSFADE_SECONDS)
	_music_tween.chain().tween_callback(
		_finish_music_crossfade.bind(previous, transition_serial)
	)
	_active_music_player_index = target_index
	_active_music_cue = cue_id
	_active_music_context = context
	music_context_changed.emit(context, cue_id)
	return true


func _finish_music_crossfade(previous: AudioStreamPlayer, transition_serial: int) -> void:
	if transition_serial != _music_transition_serial:
		return
	if previous != null and previous != _music_players[_active_music_player_index]:
		previous.stop()
		previous.stream = null


func _stream_for_path(path: String) -> AudioStream:
	if path == "":
		return null
	if _stream_cache.has(path):
		return _stream_cache[path] as AudioStream
	if _missing_stream_paths.has(path):
		return null
	var resource: Resource
	if _stream_loader.is_valid():
		var loaded = _stream_loader.call(path)
		resource = loaded as Resource
	elif ResourceLoader.exists(path):
		resource = ResourceLoader.load(path)
	if resource is AudioStream:
		_stream_cache[path] = resource
		return resource as AudioStream
	_missing_stream_paths[path] = true
	return null


func _source_path_exists(path: String) -> bool:
	if path == "":
		return false
	if _stream_loader.is_valid():
		return true
	return FileAccess.file_exists(path) or ResourceLoader.exists(path)


func _configure_music_loop(stream: AudioStream, should_loop: bool) -> void:
	if stream is AudioStreamWAV:
		(stream as AudioStreamWAV).loop_mode = (
			AudioStreamWAV.LOOP_FORWARD if should_loop else AudioStreamWAV.LOOP_DISABLED
		)
	elif stream is AudioStreamOggVorbis:
		(stream as AudioStreamOggVorbis).loop = should_loop


func _voice_index_for(request_priority: int) -> int:
	for index in _sfx_voices.size():
		var record := _sfx_voices[index]
		var player := record.get("player") as AudioStreamPlayer
		if player == null or not player.playing:
			return index
	var candidate_index := -1
	var candidate_priority := 2147483647
	var candidate_serial := 2147483647
	for index in _sfx_voices.size():
		var record := _sfx_voices[index]
		var priority := int(record.get("priority", 0))
		var serial := int(record.get("serial", 0))
		if priority < candidate_priority or (priority == candidate_priority and serial < candidate_serial):
			candidate_index = index
			candidate_priority = priority
			candidate_serial = serial
	if candidate_index < 0 or candidate_priority > request_priority:
		return -1
	return candidate_index


func _normalized_sfx_bus(value: String) -> String:
	var requested := value.strip_edges()
	if [BUS_SFX, BUS_COMBAT, BUS_PET, BUS_UI].has(requested):
		return requested
	return BUS_SFX


func _normalize_world_context(value: String) -> String:
	var normalized := value.strip_edges().to_lower()
	return normalized if ["town", "wilderness", "cave"].has(normalized) else ""


func _battle_music_context() -> String:
	if _boss_battle_active and context_cue("battle_boss") != "":
		return "battle_boss"
	return "battle_normal"


func _context_for_music_cue(cue_id: String) -> String:
	for context_value in _contexts.keys():
		var context := str(context_value)
		if context_cue(context) == cue_id:
			return context
	return ""


func _now_msec() -> int:
	if _clock_msec.is_valid():
		return int(_clock_msec.call())
	return Time.get_ticks_msec()


func _linear_volume_to_db(value: float) -> float:
	return SILENCE_DB if value <= 0.0001 else linear_to_db(value)
