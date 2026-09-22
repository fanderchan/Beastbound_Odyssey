extends SceneTree

const Art := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const Arena := preload("res://scripts/battle/battle_arena_visual_catalog.gd")
const ExitCleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")
const ReviewCaptureRenderPump := preload("res://scripts/qa/review_capture_render_pump.gd")
const ReviewRealtimeFramePacer := preload("res://scripts/qa/review_realtime_frame_pacer.gd")
const Progress := preload("res://scripts/progression/player_progress_model.gd")
const Iso := preload("res://scripts/world/isometric_map_model.gd")
var host
var out := OS.get_environment("BEASTBOUND_GUARDIAN_REVIEW_DIR")
var last_signature := ""
var sequence := 0
var stop_requested := false
var started_msec := 0
var autoplay_running := false
var frame_pacer: ReviewRealtimeFramePacer
var expected_world_players: Array = []
var preview_forms: Array[String] = [
	"bui_normal_red_fire10", "wuli_normal_tough_earth10",
	"wuli_normal_orange_fire10", "wuli_normal_fast_wind10",
]

func _initialize() -> void:
	if not OS.has_feature("beastbound_qa_automation") or not OS.get_cmdline_user_args().has("--beastbound-qa-user-data-lane=automation") or OS.get_user_data_dir().get_file() != "BeastboundOdysseyQA_Automation" or out.is_empty():
		push_error("Guardian review requires the official isolated QA launcher")
		quit(2)
		return
	if OS.get_environment("BEASTBOUND_GUARDIAN_REALTIME_RECORDING") == "1":
		frame_pacer = ReviewRealtimeFramePacer.new()
		frame_pacer.start(self)
	call_deferred("_run")

func _run() -> void:
	auto_accept_quit = false
	root.close_requested.connect(func() -> void: stop_requested = true)
	started_msec = Time.get_ticks_msec()
	root.size = Vector2i(1280, 720)
	root.content_scale_size = Vector2i(1280, 720)
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	change_scene_to_file("res://scenes/Main.tscn")
	await process_frame
	await process_frame
	host = current_scene
	if host == null or host.player == null:
		push_error("Manual journey Main scene failed to initialize")
		quit(2)
		return
	host._server_battle().turn_playback_started.connect(func(turn: Dictionary) -> void: _record_turn_playback("started", turn))
	host._server_battle().turn_playback_finished.connect(func(turn: Dictionary) -> void: _record_turn_playback("finished", turn))
	host.game_audio_manager.configure_playback_enabled(false)
	host.game_audio_manager.stop_all()
	host.profile_save_enabled = false
	host.profile_save_pending = false
	host.account_authenticated = false
	host.current_account_session = {}
	host.auth_auto_bypass = true
	host.map_visual_review_capture = true
	host.map_art_review_preview = not OS.get_cmdline_user_args().has("--normal-map-visuals")
	host._stop_server_event_stream()
	host._stop_online_position_sync()
	host._close_auth_panel(false)
	host._close_account_panel(false)
	if not Arena.enable_earth_guardian_review_from_cli():
		push_error("Guardian arena preview gate refused isolated entry")
		quit(2)
		return
	var cave_journey := OS.get_cmdline_user_args().has(Arena.EARTH_CAVE_REVIEW_FLAG)
	if cave_journey:
		if not Arena.enable_earth_cave_review_from_cli():
			push_error("Cave journey preview gate refused isolated entry")
			quit(2)
			return
		preview_forms.append("mossback_sunbaked_earth6_fire4")
	for form_id in preview_forms:
		if not Art.enable_qa_preview_form(form_id):
			push_error("Guardian exact-form preview refused: " + form_id)
			quit(2)
			return
	var online := JSON.parse_string(FileAccess.get_file_as_string(OS.get_environment("BEASTBOUND_GUARDIAN_ONLINE_FIXTURE"))) as Dictionary
	expected_world_players = online.get("expectedWorldPlayers", [])
	var profile := online.get("profile", {}) as Dictionary
	host.current_account_session = online.get("session", {}) as Dictionary
	host.account_authenticated = true
	host.auth_auto_bypass = false
	host.server_profile_sync_state = "ready"
	host.server_profile_sync_expected_revision = int(online.get("profileRevision", 0))
	host.party_current_state = online.get("partyState", {}) as Dictionary
	host.player_profile = profile
	host._load_map("earth_vein_cave_f4", "guardian_floor")
	host._sync_player_mount_visual_if_needed(true)
	host._mark_progress_ui_caches_dirty()
	host._refresh_gm_visibility()
	host._update_hud_text(true)
	host._layout_hud()
	host.perf_probe_enabled = true
	host._begin_perf_probe_measurement()
	# Offline review captures must keep drawing when the OS occludes the window.
	# This helper does not focus it and its receipts cannot prove performance.
	var capture_frame_start := Engine.get_process_frames()
	var render_pump := ReviewCaptureRenderPump.new()
	render_pump.start(root)
	host._start_server_event_stream_if_needed()
	host._start_online_position_sync_if_needed()
	_write("fixture.json", {"scope": "isolated memory backend; one real Main client and four headless QA account drivers; authentic server encounter, rules and settlement; not human multiplayer or balance acceptance", "caveJourneyReview": cave_journey, "previewForms": preview_forms, "level": profile["player"]["level"], "profile": profile, "pid": OS.get_process_id(), "viewport": [1280, 720], "userData": OS.get_user_data_dir()})
	# Match native performance preparation: request activation once for the
	# explicitly launched interactive review, never during play or autoplay.
	if OS.get_environment("BEASTBOUND_GUARDIAN_AUTOPLAY") != "1" and DisplayServer.get_name() != "headless":
		DisplayServer.window_move_to_foreground()
	print("GUARDIAN_REVIEW_READY")
	if OS.get_environment("BEASTBOUND_GUARDIAN_AUTOPLAY") == "1":
		autoplay_running = true
		call_deferred("_run_autoplay")
	# Online movement already consumes authoritative encounter permits while
	# candidate art is previewed. Never toggle the visual flag to enable battles:
	# doing so reloads later floors as the fallback grid and changes camera scale.
	while not stop_requested and not FileAccess.file_exists(out.path_join("stop")) and Time.get_ticks_msec() - started_msec < int(OS.get_environment("BEASTBOUND_GUARDIAN_REVIEW_SECONDS")) * 1000:
		var state := _state()
		var reconnect = host._panel_flow().server_event_reconnect_model
		state["eventStream"] = {"state": host.server_event_state, "phase": reconnect.phase(), "attempt": reconnect.attempt(), "retrySeconds": host.server_event_reconnect_remaining, "stableSeconds": reconnect.stable_open_seconds(), "waitingReadySeconds": reconnect.waiting_ready_seconds(), "cursor": host.server_event_last_seq}
		var stream := FileAccess.open(out.path_join("states.ndjson"), FileAccess.READ_WRITE if FileAccess.file_exists(out.path_join("states.ndjson")) else FileAccess.WRITE)
		stream.seek_end()
		stream.store_line(JSON.stringify(state))
		stream.close()
		_write("state.json", state)
		var signature := str(state.get("map")) + str(state.get("battle")) + str(state.get("dialog"))
		var requested := FileAccess.file_exists(out.path_join("capture"))
		if signature != last_signature or requested:
			if requested:
				DirAccess.remove_absolute(out.path_join("capture"))
			last_signature = signature
			sequence += 1
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(out.path_join("%03d.png" % sequence))
			_write("%03d.json" % sequence, state)
		await create_timer(0.5).timeout
	if autoplay_running:
		FileAccess.open(out.path_join("stop"), FileAccess.WRITE).close()
		var drain_deadline := Time.get_ticks_msec() + 10000
		while autoplay_running and Time.get_ticks_msec() < drain_deadline:
			await process_frame
		if autoplay_running:
			push_error("Guardian autoplay failed to drain")
	_write("completed.json", _state())
	var continuity := render_pump.stop()
	_write("render-continuity.json", {"captureFrameStartInclusive": capture_frame_start,
		"processFrameEndExclusive": Engine.get_process_frames(), "renderContinuity": continuity})
	if continuity.get("result") != "PASS":
		push_error("Guardian review had missing drawn frames")
	# Cleanup yields frames; keep Main from reconnecting after its stream is stopped.
	host.set_process(false)
	host._stop_server_event_stream()
	host._stop_online_position_sync()
	Arena.disable_earth_guardian_review()
	Arena.disable_earth_cave_review()
	for form_id in preview_forms:
		Art.disable_qa_preview_form(form_id)
	var cleanup: Dictionary = await ExitCleanup.drain_audio(host)
	_write("audio-cleanup.json", cleanup)
	if frame_pacer != null:
		_write("frame-pacing.json", frame_pacer.stop())
		frame_pacer = null
	print("GUARDIAN_REVIEW_COMPLETED")
	quit(0)


func _run_autoplay() -> void:
	var result: Dictionary
	if OS.get_cmdline_user_args().has(Arena.EARTH_CAVE_REVIEW_FLAG):
		var deadline_ms := started_msec + int(OS.get_environment("BEASTBOUND_GUARDIAN_REVIEW_SECONDS")) * 1000
		result = await preload("res://scripts/qa/cave_journey_playthrough.gd").run(host, out, expected_world_players, deadline_ms)
	else:
		result = await preload("res://scripts/qa/guardian_battle_playthrough.gd").run(host, out, expected_world_players)
	_write("autoplay.json", result)
	print("GUARDIAN_AUTOPLAY " + JSON.stringify(result))
	autoplay_running = false
	stop_requested = true

func _state() -> Dictionary:
	var cell: Vector2i = Iso.world_to_grid(host.map_data, host.player.global_position)
	var battle: Dictionary = host.battle_state
	var room: Dictionary = battle.get("serverRoom", {})
	var arena_texture_ready := Arena.texture_for_state(battle) != null
	var zoom: Vector2 = host.game_camera.zoom
	# Sampled by the review loop, outside the player's runtime hot paths.
	# Drawn frames include offline fallback draws, so they do not prove that
	# the OS is presenting the window or Computer Use is receiving fresh images.
	var native_window := {
		"focused": DisplayServer.window_is_focused(),
		"canDraw": root.can_draw(),
		"renderLoopEnabled": RenderingServer.is_render_loop_enabled(),
		"drawnFrames": Engine.get_frames_drawn(),
	}
	var owned_actors: Array = []
	for actor in battle.get("actors", []):
		if actor is Dictionary and str(actor.get("serverAccountId", "")) == str(host.current_account_session.get("accountId", "")):
			owned_actors.append({"id": actor.get("id", ""), "hp": actor.get("hp", 0), "maxHp": actor.get("maxHp", 0), "launched": actor.get("launched", false)})
	return {"unixTime": Time.get_unix_time_from_system(), "frame": Engine.get_process_frames(), "nativeWindow": native_window, "map": host.current_map_id, "cell": [cell.x, cell.y], "battle": host.battle_active, "dialog": host._dialog_is_open(), "resultPanel": host.battle_result_panel.visible, "artPreview": host.map_art_review_preview, "mapVisualBundleId": host.map_visual_render_state.get("bundleId", ""), "mapVisualActive": host.map_visual_render_state.get("active", false), "mapVisualStatus": host.map_visual_render_state.get("status", ""), "mapVisualCatalogSource": host.map_visual_render_state.get("catalogSource", ""), "mapVisualQaPreview": host.map_visual_render_state.get("qaPreview", false), "cameraZoom": [zoom.x, zoom.y], "serverSession": host._is_server_account_session(), "saving": host.profile_save_enabled, "round": battle.get("round", 0), "phase": battle.get("phase", ""), "ownedActors": owned_actors, "actorCount": (battle.get("actors", []) as Array).size(), "participantCount": (room.get("participants", []) as Array).size(), "serverAuthority": battle.get("serverAuthority", false), "arenaEvidence": Arena.evidence_for_state(battle), "arenaTextureReady": arena_texture_ready, "serverRoomStatus": room.get("status", ""), "serverRoomEntry": room.get("entry", null), "scene": host.scene_file_path, "worldLog": host.world_log_message, "playerHp": (host.player_profile.get("player", {}) as Dictionary).get("hp"), "profileRevision": host.server_profile_sync_expected_revision, "perf": host._perf_probe_frame_snapshot_for_qa()}

func _write(name: String, value: Dictionary) -> void:
	var file := FileAccess.open(out.path_join(name), FileAccess.WRITE)
	file.store_string(JSON.stringify(value, "\t"))


func _record_turn_playback(stage: String, turn: Dictionary) -> void:
	var path := out.path_join("turn-playback.ndjson")
	var file := FileAccess.open(path, FileAccess.READ_WRITE if FileAccess.file_exists(path) else FileAccess.WRITE)
	file.seek_end()
	file.store_line(JSON.stringify({"stage": stage, "roomId": turn.get("roomId", ""),
		"round": turn.get("round", 0), "turnSeq": turn.get("turnSeq", 0),
		"frame": Engine.get_process_frames(), "unixTime": Time.get_unix_time_from_system(),
		"skippedTurns": host._server_battle().playback_queue.skipped_turns}))
