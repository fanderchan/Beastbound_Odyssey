extends RefCounted

const AUDIO_DRAIN_FRAMES_BEFORE_FREE := 8
const AUDIO_DRAIN_FRAMES_AFTER_FREE := 8
const AUDIO_DRAIN_SECONDS_BEFORE_FREE := 0.75
const AUDIO_DRAIN_SECONDS_AFTER_FREE := 0.75


static func drain_audio(host) -> Dictionary:
	if host == null or not is_instance_valid(host):
		return {"status": "failed", "reason": "main_host_missing"}
	var timeline = host.get("battle_audio_timeline_controller")
	if timeline != null and timeline.has_method("end_event"):
		timeline.call("end_event")
	host.battle_audio_timeline_controller = null
	var manager := host.get("game_audio_manager") as Node
	if manager == null or not is_instance_valid(manager):
		return {"status": "failed", "reason": "audio_manager_missing"}
	if not manager.has_method("stop_all"):
		return {"status": "failed", "reason": "audio_stop_contract_missing"}
	var audio_playback_disabled := false
	if manager.has_method("debug_snapshot"):
		var audio_snapshot = manager.call("debug_snapshot")
		if audio_snapshot is Dictionary:
			audio_playback_disabled = not bool(
				(audio_snapshot as Dictionary).get("playbackEnabled", true)
			)
	manager.call("stop_all")
	var audio_players := manager.find_children(
		"*",
		"AudioStreamPlayer",
		true,
		false
	)
	var detached_player_count := 0
	for value in audio_players:
		if not (value is AudioStreamPlayer):
			continue
		var player := value as AudioStreamPlayer
		player.stop()
		player.stream = null
		detached_player_count += 1
	var audio_streams_detached := true
	for value in audio_players:
		if (
			value is AudioStreamPlayer
			and is_instance_valid(value)
			and (value as AudioStreamPlayer).stream != null
		):
			audio_streams_detached = false
	for _frame_index in range(AUDIO_DRAIN_FRAMES_BEFORE_FREE):
		await host.get_tree().process_frame
	await host.get_tree().create_timer(
		AUDIO_DRAIN_SECONDS_BEFORE_FREE,
		true,
		false,
		true
	).timeout
	manager.queue_free()
	host.game_audio_manager = null
	for _frame_index in range(AUDIO_DRAIN_FRAMES_AFTER_FREE):
		await host.get_tree().process_frame
	await host.get_tree().create_timer(
		AUDIO_DRAIN_SECONDS_AFTER_FREE,
		true,
		false,
		true
	).timeout
	if is_instance_valid(manager):
		return {"status": "failed", "reason": "audio_manager_not_released"}
	if not audio_streams_detached:
		return {"status": "failed", "reason": "audio_stream_not_detached"}
	if not audio_playback_disabled:
		return {"status": "failed", "reason": "audio_playback_not_disabled"}
	return {
		"status": "passed",
		"audioPlaybackDisabled": true,
		"audioStopped": true,
		"audioStreamsDetached": true,
		"detachedAudioPlayerCount": detached_player_count,
		"audioManagerReleased": true,
		"drainSeconds": (
			AUDIO_DRAIN_SECONDS_BEFORE_FREE
			+ AUDIO_DRAIN_SECONDS_AFTER_FREE
		),
		"drainFrames": (
			AUDIO_DRAIN_FRAMES_BEFORE_FREE
			+ AUDIO_DRAIN_FRAMES_AFTER_FREE
		),
	}
