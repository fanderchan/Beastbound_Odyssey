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
	"combat.hit_heavy",
	"combat.hit_skill",
	"combat.combo_start",
	"combat.hit_combo",
	"combat.guard_ready",
	"combat.block",
	"combat.evade",
	"combat.critical",
	"combat.cast_skill",
	"combat.counter",
	"combat.launch",
	"combat.bounce_edge",
	"combat.knockback",
	"combat.down",
	"combat.revive",
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

	var battle_state_before: Dictionary = host.battle_state.duplicate(true)
	host.battle_state = {
		"actors": [{
			"id": "audio_qa_down_target",
			"hp": 0,
			"actionState": "down",
		}],
		"lastTargetId": "audio_qa_down_target",
		"lastTargetIds": ["audio_qa_down_target"],
		"lastLaunch": false,
	}
	var down_timeline: Dictionary = host._battle_event_timeline_for_applied_event({
		"type": "attack",
		"targetId": "audio_qa_down_target",
		"timeline": {
			"durationSeconds": 0.62,
			"damageRevealProgress": 0.50,
			"delaysResult": true,
		},
	})
	host.battle_state = battle_state_before
	if (
		float(down_timeline.get("downSoundProgress", 0.0))
		- float(down_timeline.get("damageRevealProgress", 0.0))
		< 0.20
	):
		errors.append("Main 倒地声仍挤在命中／受伤声附近")

	var launch_timeline: Dictionary = host._battle_event_timeline_for_applied_event({
		"type": "attack",
		"launch": true,
		"launchMode": "bounce",
		"timeline": {
			"durationSeconds": 1.95,
			"damageRevealProgress": 0.30,
			"delaysResult": true,
		},
	})
	var launch_contact := float(
		launch_timeline.get("damageRevealProgress", 0.0)
	)
	var launch_progress := float(
		launch_timeline.get("launchSoundProgress", 0.0)
	)
	var bounce_progress := float(
		launch_timeline.get("bounceImpactProgress", 0.0)
	)
	if not (launch_contact < launch_progress and launch_progress < bounce_progress):
		errors.append("Main 没有保持命中 < 离地破空 < 撞边的正式时序")

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
