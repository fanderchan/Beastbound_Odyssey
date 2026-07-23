extends RefCounted

const REQUIRED_CONTEXTS: Array[String] = [
	"town",
	"wilderness",
	"cave",
	"battle_normal",
]
const REQUIRED_ACTION_CUES: Array[String] = [
	"combat.motion_character",
	"combat.motion_pet",
	"combat.hit_light",
	"combat.block",
	"combat.evade",
	"combat.counter",
	"combat.launch",
	"combat.knockback",
	"combat.down",
	"creature.pet_effort",
	"creature.pet_hurt",
	"outcome.victory",
	"outcome.defeat",
]


static func run(host) -> Dictionary:
	var errors: Array[String] = []
	var manager = host.game_audio_manager
	if manager == null or not is_instance_valid(manager):
		errors.append("Main 没有创建 GameAudioManager")
		return _report(host, errors, {})
	if not manager.catalog_loaded():
		errors.append("Main 音频目录未加载：%s" % manager.catalog_error())
	for context in REQUIRED_CONTEXTS:
		if manager.context_cue(context) == "":
			errors.append("Main 音频目录缺少语境：%s" % context)
	for cue_id in REQUIRED_ACTION_CUES:
		if manager.cue_info(cue_id).is_empty():
			errors.append("Main 音频目录缺少动作 cue：%s" % cue_id)

	var before: Dictionary = manager.debug_snapshot()
	var world_context := str(before.get("worldContext", ""))
	var expected_world_cue: String = manager.context_cue(world_context)
	if world_context == "" or expected_world_cue == "":
		errors.append("当前地图没有稳定音频语境")
	elif manager.current_music_cue() != expected_world_cue:
		errors.append("当前地图音乐与语境不一致")

	host._audio_enter_battle({})
	if manager.current_music_cue() != "music.battle_normal":
		errors.append("Main 进入战斗后未切换普通战斗音乐")
	for cue_id in REQUIRED_ACTION_CUES:
		if not host._audio_play_cue(cue_id):
			errors.append("Main 无法分发动作 cue：%s" % cue_id)
	host._audio_exit_battle()
	if expected_world_cue != "" and manager.current_music_cue() != expected_world_cue:
		errors.append("Main 退出战斗后未恢复当前地图音乐")

	if host.audio_settings_panel == null:
		errors.append("账号面板没有挂载声音设置")
	else:
		var panel_snapshot: Dictionary = host.audio_settings_panel.snapshot()
		if str(panel_snapshot.get("title", "")) != "声音设置":
			errors.append("声音设置缺少中文标题")
		if not panel_snapshot.has("musicPercent") or not panel_snapshot.has("sfxPercent"):
			errors.append("声音设置缺少音乐或音效滑杆")
		if not panel_snapshot.has("muted"):
			errors.append("声音设置缺少静音控制")

	var after: Dictionary = manager.debug_snapshot()
	if DisplayServer.get_name() == "headless" and bool(after.get("playbackEnabled", true)):
		errors.append("headless Main 不应创建真实音频播放实例")
	manager.stop_all()
	return _report(host, errors, after)


static func _report(host, errors: Array[String], snapshot: Dictionary) -> Dictionary:
	return {
		"schemaVersion": 1,
		"reportType": "beastbound.audio_main_runtime_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"mapId": str(host.current_map_id),
		"catalogCueCount": int(snapshot.get("cueCount", 0)),
		"worldContext": str(snapshot.get("worldContext", "")),
		"restoredMusicCue": str(snapshot.get("activeMusicCue", "")),
		"voicePoolSize": int(snapshot.get("voicePoolSize", 0)),
		"playbackEnabled": bool(snapshot.get("playbackEnabled", false)),
		"errors": errors,
	}
