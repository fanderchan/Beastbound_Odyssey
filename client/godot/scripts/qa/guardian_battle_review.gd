extends SceneTree

const Art := preload("res://scripts/pet/pet_action_asset_catalog.gd")
const Arena := preload("res://scripts/battle/battle_arena_visual_catalog.gd")
const ExitCleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")
const Progress := preload("res://scripts/progression/player_progress_model.gd")
const Iso := preload("res://scripts/world/isometric_map_model.gd")
var host
var out := OS.get_environment("BEASTBOUND_GUARDIAN_REVIEW_DIR")
var last_signature := ""
var sequence := 0
var stop_requested := false
var started_msec := 0
var autoplay_running := false
var expected_world_players: Array = []

func _initialize() -> void:
	if not OS.has_feature("beastbound_qa_automation") or not OS.get_cmdline_user_args().has("--beastbound-qa-user-data-lane=automation") or OS.get_user_data_dir().get_file() != "BeastboundOdysseyQA_Automation" or out.is_empty():
		push_error("Guardian review requires the official isolated QA launcher")
		quit(2)
		return
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
	host.game_audio_manager.configure_playback_enabled(false)
	host.game_audio_manager.stop_all()
	host.profile_save_enabled = false
	host.profile_save_pending = false
	host.account_authenticated = false
	host.current_account_session = {}
	host.auth_auto_bypass = true
	host.map_visual_review_capture = true
	host.map_art_review_preview = true
	host._stop_server_event_stream()
	host._stop_online_position_sync()
	host._close_auth_panel(false)
	host._close_account_panel(false)
	if not Arena.enable_earth_guardian_review_from_cli():
		push_error("Guardian arena preview gate refused isolated entry")
		quit(2)
		return
	for form_id in ["bui_normal_red_fire10", "wuli_normal_tough_earth10", "wuli_normal_orange_fire10", "wuli_normal_fast_wind10"]:
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
	host._start_server_event_stream_if_needed()
	host._start_online_position_sync_if_needed()
	_write("fixture.json", {"scope": "isolated memory backend; one real Main client and four headless QA account drivers; authentic server encounter, rules and settlement; not human multiplayer or balance acceptance", "level": profile["player"]["level"], "profile": profile, "pid": OS.get_process_id(), "viewport": [1280, 720], "userData": OS.get_user_data_dir()})
	print("GUARDIAN_REVIEW_READY")
	if OS.get_environment("BEASTBOUND_GUARDIAN_AUTOPLAY") == "1":
		autoplay_running = true
		call_deferred("_run_autoplay")
	while not stop_requested and not FileAccess.file_exists(out.path_join("stop")) and Time.get_ticks_msec() - started_msec < int(OS.get_environment("BEASTBOUND_GUARDIAN_REVIEW_SECONDS")) * 1000:
		if FileAccess.file_exists(out.path_join("encounters-on")):
			host.map_art_review_preview = false
			DirAccess.remove_absolute(out.path_join("encounters-on"))
			print("GUARDIAN_REVIEW natural encounters enabled; existing visual cache preserved")
		if FileAccess.file_exists(out.path_join("encounters-off")):
			host.map_art_review_preview = true
			DirAccess.remove_absolute(out.path_join("encounters-off"))
			print("GUARDIAN_REVIEW art preview resumed")
		var state := _state()
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
	host._stop_server_event_stream()
	host._stop_online_position_sync()
	Arena.disable_earth_guardian_review()
	for form_id in ["bui_normal_red_fire10", "wuli_normal_tough_earth10", "wuli_normal_orange_fire10", "wuli_normal_fast_wind10"]:
		Art.disable_qa_preview_form(form_id)
	var cleanup: Dictionary = await ExitCleanup.drain_audio(host)
	_write("audio-cleanup.json", cleanup)
	print("GUARDIAN_REVIEW_COMPLETED")
	quit(0)


func _run_autoplay() -> void:
	var result: Dictionary = await preload("res://scripts/qa/guardian_battle_playthrough.gd").run(host, out, expected_world_players)
	_write("autoplay.json", result)
	print("GUARDIAN_AUTOPLAY " + JSON.stringify(result))
	autoplay_running = false
	stop_requested = true

func _state() -> Dictionary:
	var cell: Vector2i = Iso.world_to_grid(host.map_data, host.player.global_position)
	var battle: Dictionary = host.battle_state
	var room: Dictionary = battle.get("serverRoom", {})
	return {"unixTime": Time.get_unix_time_from_system(), "frame": Engine.get_process_frames(), "map": host.current_map_id, "cell": [cell.x, cell.y], "battle": host.battle_active, "dialog": host._dialog_is_open(), "artPreview": host.map_art_review_preview, "serverSession": host._is_server_account_session(), "saving": host.profile_save_enabled, "round": battle.get("round", 0), "phase": battle.get("phase", ""), "actorCount": (battle.get("actors", []) as Array).size(), "participantCount": (room.get("participants", []) as Array).size(), "serverAuthority": battle.get("serverAuthority", false), "arenaEvidence": Arena.evidence_for_state(battle), "scene": host.scene_file_path, "worldLog": host.world_log_message, "playerHp": (host.player_profile.get("player", {}) as Dictionary).get("hp"), "profileRevision": host.server_profile_sync_expected_revision, "perf": host._perf_probe_frame_snapshot_for_qa()}

func _write(name: String, value: Dictionary) -> void:
	var file := FileAccess.open(out.path_join(name), FileAccess.WRITE)
	file.store_string(JSON.stringify(value, "\t"))
