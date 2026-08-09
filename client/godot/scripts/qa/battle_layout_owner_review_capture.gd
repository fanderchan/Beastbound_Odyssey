extends RefCounted

const BattleModel := preload("res://scripts/battle/battle_model.gd")
const BattleLayoutConstants := preload(
	"res://scripts/battle/battle_layout_constants.gd"
)
const BattleLayoutSafeAreaModel := preload(
	"res://scripts/battle/battle_layout_safe_area_model.gd"
)
const EncounterModel := preload("res://scripts/world/encounter_model.gd")
const CharacterRosterModel := preload(
	"res://scripts/progression/character_roster_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const CharacterActionAssetCatalog := preload(
	"res://scripts/player/character_action_asset_catalog.gd"
)
const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)
const PetActionAssetCatalog := preload(
	"res://scripts/pet/pet_action_asset_catalog.gd"
)
const PetArtCatalog := preload("res://scripts/pet/pet_art_catalog.gd")
const MountVisualProfileCatalog := preload(
	"res://scripts/player/mount_visual_profile_catalog.gd"
)
const MountedCharacterAssetCatalog := preload(
	"res://scripts/player/mounted_character_asset_catalog.gd"
)

const CAPTURE_FLAG := "--phase403-battle-layout-owner-review-capture"
const PERF_CAPTURE_FLAG := "--phase403-battle-layout-perf"
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const INVALID_FRAME_SIZE := Vector2i(-1, -1)
const REVIEW_FPS := 30
const PERF_STATE_SECONDS := 7.2
const PERF_CLICK_PAUSE_SECONDS := 0.14
const PERF_TARGET_SWITCH_COUNT := 8
const PERF_FRAME_SAMPLE_LIMIT := 600
const READY_FRAME_LIMIT := 120
const FORMATION_TEMPLATE := "10v10"
const LAYOUT_IDENTITY := (
	"phase403_grid1280_o94x340p4_l152x52_r64xm48_e132x164"
)
const ATTACK_INPUT_BEFORE_MARKER := "PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_BEFORE"
const ATTACK_INPUT_AFTER_MARKER := "PHASE403_BATTLE_LAYOUT_ATTACK_INPUT_AFTER"
const PERF_ENVIRONMENT_MARKER := "PHASE403_BATTLE_LAYOUT_PERF_ENVIRONMENT"
const PERF_RAW_FRAME_MARKER := "PHASE403_BATTLE_LAYOUT_PERF_RAW_FRAMES"
const PERF_SEGMENTS_MARKER := "PHASE403_BATTLE_LAYOUT_PERF_SEGMENTS"
const PERF_INVARIANT_MARKER := "PHASE403_BATTLE_LAYOUT_PERF_INVARIANT"

# Both selected production bundles use the largest formal 256px runtime frame,
# derived from preserved 512px source frames, accepted by Main's 156px battle
# draw canvas. Lifecycle metadata is asserted but never changed here: the
# character stays owner-review-pending and the pet stays approved.
const FORMAL_CHARACTER_APPEARANCE_ID := "ember_spark_v1"
const FORMAL_CHARACTER_META_PATH := (
	"res://assets/characters/ember_spark_v1/action-bundle-meta.json"
)
const FORMAL_PET_FORM_ID := "wuli_evolved_crystal_earth8_water2"
const FORMAL_PET_INSTANCE_ID := "phase403_formal_battle_pet"
const FORMAL_PET_META_PATH := (
	"res://assets/pets/wuli_evolved_crystal_earth8_water2/action-bundle-meta.json"
)
const MAX_CHARACTER_NAME := "晨星远征守望猎团首席先锋队长苍岚逐月行者踏风归来"
const MAX_PET_NAME := "晶甲苍穹守望乌力"
const EXPECTED_PLAYER_COMMAND_LABELS: Array[String] = [
	"咒术",
	"攻击",
	"道具",
	"托管",
	"逃跑",
	"援助",
	"抓捕",
	"召唤",
	"防御",
	"自动",
]

# The only mounted combination used below is an already-registered integrated
# bundle.  It is deliberately geometry-only evidence: it is never inserted
# into battle_state and never shown as an ordinary player-visible battle.
const REVIEW_ONLY_MOUNT_CHARACTER_ID := "novice_hunter_v1"
const REVIEW_ONLY_MOUNT_FORM_ID := "bui_novice_sprout_earth5_wind5"

const TARGET_FIXTURES := [
	{"actorId": "enemy_front_4", "slotId": "enemy.front.4"},
	{"actorId": "enemy_front_5", "slotId": "enemy.front.5"},
]
const CHAPTERS := {
	"formal_idle": 2.5,
	"command_selection_a": 2.2,
	"adjacent_target_a": 2.5,
	"command_selection_b": 2.2,
	"adjacent_target_b": 3.0,
}

var host
var _view
var _failed := false
var _started_msec := 0
var _actual_left_clicks := 0
var _cross_frame_presses := 0
var _exact_target_hits := 0
var _world_click_accept_start := 0
var _player_attack_attempts := 0
var _host_property_names: Dictionary = {}
var _host_property_cache_ready := false
var _perf_sample_state := ""
var _perf_sample_started_usec := 0
var _perf_sample_started_frame := -1
var _perf_sample_count := 0
var _perf_sample_previous_frame := -1
var _perf_sample_previous_usec := -1
var _perf_sample_dropped := 0
var _perf_sample_monotonic := true
var _perf_frame_pairs := PackedInt64Array()
var _perf_sampler_connected := false
var _perf_qa_sync_wall_usec := 0
var _perf_qa_sample_count := 0
var _perf_input_dispatch_wall_usec: Dictionary = {}
var _perf_input_dispatch_counts: Dictionary = {}
var _perf_operation_boundary_usec: Dictionary = {}
var _perf_operation_sample_counts: Dictionary = {}
var _perf_target_marker_lines: Array[String] = []


func _init(host_node) -> void:
	host = host_node


static func is_flag(value: String) -> bool:
	return value == CAPTURE_FLAG or value == PERF_CAPTURE_FLAG


func run() -> void:
	if PERF_CAPTURE_FLAG in OS.get_cmdline_user_args():
		await _run_perf_capture()
	else:
		await _run_owner_review_capture()


func _run_owner_review_capture() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_battle():
		return
	if not _assert_live_layout_contract():
		return
	if not _assert_review_only_mount_width_contract():
		return
	print(
		"PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_START scene=Main.tscn "
		+ "entry=MainSceneFlag viewport=1280x720 fps=30 speed=1.00x "
		+ "formation=10v10 actors=20 profile=isolated backend=false "
		+ "profile_save=false input=real_cross_frame_left_click"
	)
	_print_fixture_marker()
	_print_layout_marker()
	await _hold_chapter("formal_idle")
	if _failed:
		return

	await _click_player_attack("人物攻击A")
	if _failed:
		return
	await _hold_chapter("command_selection_a")
	await _click_exact_target(TARGET_FIXTURES[0] as Dictionary, 1)
	if _failed:
		return
	await _hold_chapter("adjacent_target_a")

	await _click_pet_recall("宠物撤回A")
	await _click_player_attack("人物攻击B")
	if _failed:
		return
	await _hold_chapter("command_selection_b")
	await _click_exact_target(TARGET_FIXTURES[1] as Dictionary, 2)
	if _failed:
		return
	await _hold_chapter("adjacent_target_b")

	if not _assert_final_interaction_contract(5, 2):
		return
	if _visible_tree_has_forbidden_review_text():
		_fail_capture("玩家画面出现QA、调试或验收文字")
		return
	if not _assert_isolated_transport_idle():
		return
	await _release_capture_audio_runtime()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_END status=passed "
			+ "elapsed_wall=%.3f scene=Main.tscn entry=MainSceneFlag "
			+ "viewport=1280x720 formation=10v10 actors=20 "
			+ "layout_identity=%s layout_exact=true hud_collisions=0 "
			+ "viewport_violations=0 hud_passthrough=0 exact_targets=2 "
			+ "target_slots=enemy.front.4,enemy.front.5 "
			+ "mounted_player_actors=0 review_only_mount=true "
			+ "backend=false profile_save=false actual_left_clicks=%d "
			+ "cross_frame_presses=%d"
		) % [
			elapsed,
			LAYOUT_IDENTITY,
			_actual_left_clicks,
			_cross_frame_presses,
		]
	)
	host.get_tree().call_deferred("quit", 0)


func _run_perf_capture() -> void:
	_started_msec = Time.get_ticks_msec()
	if not await _prepare_real_main_battle():
		return
	if not bool(_host_property("perf_probe_enabled")):
		_fail_capture("性能验收必须同时启用--perf-probe")
		return
	if not _assert_live_layout_contract():
		return
	if not _assert_review_only_mount_width_contract():
		return
	if not _print_perf_environment("start"):
		return
	print(
		(
			"PHASE403_BATTLE_LAYOUT_PERF_START scene=Main.tscn "
			+ "entry=MainSceneFlag viewport=1280x720 environment=runtime_markers "
			+ "formation=10v10 actors=20 layout_identity=%s profile=isolated "
			+ "backend_started=false profile_save=false host_property_cache=true"
		) % LAYOUT_IDENTITY
	)
	print(
		(
			PERF_INVARIANT_MARKER
			+ " stage=pre_windows actors=20 slots=20 ally=10 enemy=10 "
			+ "full_formation=true hud_exact=true hud_collisions=0 "
			+ "viewport_violations=0 layout_identity=%s"
		) % LAYOUT_IDENTITY
	)

	host.call("_reset_perf_probe_counters")
	if not _begin_perf_frame_sampling("idle"):
		return
	print("PHASE403_BATTLE_LAYOUT_PERF_STATE state=idle_begin")
	await host.get_tree().create_timer(PERF_STATE_SECONDS).timeout
	if not _end_perf_frame_sampling("idle"):
		return
	print("PHASE403_BATTLE_LAYOUT_PERF_STATE state=idle_end")

	await _click_player_attack("性能指令选择")
	if _failed:
		return
	host.call("_reset_perf_probe_counters")
	if not _begin_perf_frame_sampling("command_selection"):
		return
	print(
		"PHASE403_BATTLE_LAYOUT_PERF_STATE "
		+ "state=command_selection_begin target_mode=player_attack_target"
	)
	await host.get_tree().create_timer(PERF_STATE_SECONDS).timeout
	if not _end_perf_frame_sampling("command_selection"):
		return
	print(
		"PHASE403_BATTLE_LAYOUT_PERF_STATE "
		+ "state=command_selection_end target_mode=player_attack_target"
	)

	var switch_click_start := _actual_left_clicks
	var target_hit_start := _exact_target_hits
	var completed_switches := 0
	_reset_perf_segments()
	host.call("_reset_perf_probe_counters")
	if not _begin_perf_frame_sampling("target_switch"):
		return
	print(
		"PHASE403_BATTLE_LAYOUT_PERF_STATE state=target_switch_begin "
		+ "slots=enemy.front.4,enemy.front.5 switches=8 clicks=24"
	)
	var switch_started_usec := Time.get_ticks_usec()
	for switch_index in range(PERF_TARGET_SWITCH_COUNT):
		var scheduled_usec := (
			switch_started_usec
			+ int(
				float(switch_index)
				* PERF_STATE_SECONDS
				* 1000000.0
				/ float(PERF_TARGET_SWITCH_COUNT)
			)
		)
		var schedule_wait_usec := scheduled_usec - Time.get_ticks_usec()
		if schedule_wait_usec > 0:
			await host.get_tree().create_timer(
				float(schedule_wait_usec) / 1000000.0
			).timeout
		var fixture := TARGET_FIXTURES[completed_switches % TARGET_FIXTURES.size()] as Dictionary
		var operation_started_usec := Time.get_ticks_usec()
		await _click_exact_target(fixture, completed_switches + 1)
		_record_perf_operation_wall("target", operation_started_usec)
		if _failed:
			return
		await _perf_click_pause()
		operation_started_usec = Time.get_ticks_usec()
		await _click_pet_recall("性能目标切换撤回")
		_record_perf_operation_wall("recall", operation_started_usec)
		if _failed:
			return
		await _perf_click_pause()
		operation_started_usec = Time.get_ticks_usec()
		await _click_player_attack("性能目标切换攻击")
		_record_perf_operation_wall("attack", operation_started_usec)
		if _failed:
			return
		await _perf_click_pause()
		completed_switches += 1
	var target_window_end_usec := (
		switch_started_usec + int(PERF_STATE_SECONDS * 1000000.0)
	)
	var target_window_wait_usec := target_window_end_usec - Time.get_ticks_usec()
	if target_window_wait_usec > 0:
		await host.get_tree().create_timer(
			float(target_window_wait_usec) / 1000000.0
		).timeout
	if not _end_perf_frame_sampling("target_switch"):
		return
	if not _print_perf_target_markers(completed_switches):
		return
	if not _print_perf_segments(completed_switches):
		return
	var switch_clicks := _actual_left_clicks - switch_click_start
	var switch_target_hits := _exact_target_hits - target_hit_start
	var hud_passthrough := (
		int(_host_property("click_move_input_accept_count"))
		- _world_click_accept_start
	)
	print(
		(
			"PHASE403_BATTLE_LAYOUT_PERF_STATE state=target_switch_end "
			+ "switches=%d target_hits=%d switch_clicks=%d "
			+ "exact_slots=true hud_passthrough=%d raw_frames=true segments=true"
		) % [
			completed_switches,
			switch_target_hits,
			switch_clicks,
			hud_passthrough,
		]
	)
	if (
		completed_switches != PERF_TARGET_SWITCH_COUNT
		or switch_target_hits != completed_switches
		or switch_clicks != completed_switches * 3
		or hud_passthrough != 0
		or _actual_left_clicks != _cross_frame_presses
	):
		_fail_capture(
			"目标切换性能交互不完整：switches=%d hits=%d clicks=%d leaks=%d"
			% [
				completed_switches,
				switch_target_hits,
				switch_clicks,
				hud_passthrough,
			]
		)
		return
	if not _assert_post_start_formation_contract():
		return
	if not _assert_live_layout_contract():
		return
	print(
		(
			PERF_INVARIANT_MARKER
			+ " stage=post_windows actors=20 slots=20 ally=10 enemy=10 "
			+ "full_formation=true hud_exact=true hud_collisions=0 "
			+ "viewport_violations=0 layout_identity=%s"
		) % LAYOUT_IDENTITY
	)
	if not _print_perf_environment("end"):
		return
	if not _assert_isolated_transport_idle():
		return
	await _release_capture_audio_runtime()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PHASE403_BATTLE_LAYOUT_PERF_END status=passed elapsed_wall=%.3f "
			+ "scene=Main.tscn entry=MainSceneFlag viewport=1280x720 "
			+ "formation=10v10 actors=20 layout_identity=%s "
			+ "idle=true command_selection=true target_switch=true "
			+ "switches=%d target_hits=%d exact_slots=true "
			+ "hud_collisions=0 hud_passthrough=0 backend_started=false "
			+ "profile_save=false actual_left_clicks=%d "
			+ "cross_frame_presses=%d raw_frames=true segments=true "
			+ "runtime_environment=true pre_invariant=true post_invariant=true"
		) % [
			elapsed,
			LAYOUT_IDENTITY,
			completed_switches,
			switch_target_hits,
			_actual_left_clicks,
			_cross_frame_presses,
		]
	)
	host.get_tree().call_deferred("quit", 0)


func _prepare_real_main_battle() -> bool:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host不存在")
		return false
	if not _cache_host_property_names():
		return false
	var current_scene := host.get_tree().current_scene as Node
	if current_scene != host or current_scene.scene_file_path != "res://scenes/Main.tscn":
		_fail_capture("验收必须由真实Main.tscn flag启动")
		return false
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if Vector2i(roundi(viewport_size.x), roundi(viewport_size.y)) != EXPECTED_VIEWPORT:
		_fail_capture("验收视口必须为1280×720")
		return false
	if not _assert_formal_fixture_assets():
		return false

	_set_host_property("profile_save_enabled", false)
	_set_host_property("account_authenticated", true)
	_set_host_property("auth_auto_bypass", false)
	_set_host_property("current_account_session", {
		"accountId": "phase403_battle_layout",
		"displayName": MAX_CHARACTER_NAME,
		"authSource": "isolated_owner_review",
	})
	_set_host_property("server_profile_sync_state", "off")
	_set_host_property("server_profile_sync_pending_kind", "")
	_set_host_property("server_profile_sync_dirty", false)
	_set_host_property("server_profile_sync_pull_queued", false)
	var profile := PlayerProgressModel.default_profile()
	var profile_player := (profile.get("player", {}) as Dictionary).duplicate(true)
	profile_player["name"] = MAX_CHARACTER_NAME
	profile_player["level"] = 140
	profile_player["appearanceId"] = FORMAL_CHARACTER_APPEARANCE_ID
	profile["player"] = profile_player
	var fixture_pet := PlayerProgressModel.create_pet_instance_from_form(
		FORMAL_PET_INSTANCE_ID,
		MAX_PET_NAME,
		FORMAL_PET_FORM_ID,
		PlayerProgressModel.PET_STATE_BATTLE,
		140
	)
	if fixture_pet.is_empty():
		_fail_capture("正式最大宠物无法建立隔离战斗档案")
		return false
	profile["petInstances"] = [fixture_pet]
	profile["activePetInstanceId"] = FORMAL_PET_INSTANCE_ID
	profile = PlayerProgressModel.normalize_profile(profile)
	_set_host_property("player_profile", profile)
	if host.has_method("_stop_server_event_stream"):
		host.call("_stop_server_event_stream")
	if host.has_method("_stop_online_position_sync"):
		host.call("_stop_online_position_sync")
	for value in host.find_children("*", "HTTPRequest", true, false):
		if value is HTTPRequest:
			(value as HTTPRequest).cancel_request()

	var loaded = host.call("_load_map", "firebud_village_gate", "from_training_yard")
	if loaded is bool and not bool(loaded):
		_fail_capture("无法载入确定性战斗地图")
		return false
	var map_value = _host_property("map_data")
	if not (map_value is Dictionary):
		_fail_capture("确定性战斗地图数据缺失")
		return false
	var zones := EncounterModel.encounter_zones(map_value as Dictionary)
	if zones.is_empty() or not (zones[0] is Dictionary):
		_fail_capture("确定性遭遇区不可用")
		return false
	var state := BattleModel.create_formation_preview_battle(
		(zones[0] as Dictionary).duplicate(true)
	)
	state.erase("reviewLab")
	state.erase("reviewTopInset")
	state.erase("reviewVisualActorId")
	state["message"] = "双方正式十人阵型展开。"
	var actors: Array = state.get("actors", [])
	for index in range(actors.size()):
		if not (actors[index] is Dictionary):
			_fail_capture("20人阵型存在非字典actor")
			return false
		var actor := (actors[index] as Dictionary).duplicate(true)
		actor["level"] = 140
		actor["actionState"] = "idle"
		actor.erase("ridePetInstanceId")
		actor.erase("ridePetFormId")
		actor.erase("ridePetHp")
		actor.erase("ridePetMaxHp")
		if str(actor.get("kind", "")) == "player":
			actor["name"] = MAX_CHARACTER_NAME
			actor["appearanceId"] = FORMAL_CHARACTER_APPEARANCE_ID
		else:
			actor["name"] = MAX_PET_NAME
			actor["formId"] = FORMAL_PET_FORM_ID
		actors[index] = actor
	state["actors"] = actors
	if str(state.get("formationTemplate", "")) != FORMATION_TEMPLATE:
		_fail_capture("确定性战斗未绑定10v10模板")
		return false
	if bool(state.get("reviewLab", false)):
		_fail_capture("普通正式战斗不能进入reviewLab")
		return false
	if _mounted_player_actor_count(state) != 0:
		_fail_capture("普通正式战斗fixture不得混入整体骑乘")
		return false
	if not CharacterActionAssetCatalog.warm_battle(FORMAL_CHARACTER_APPEARANCE_ID):
		_fail_capture("正式最大人物动作包无法预热")
		return false
	if not PetActionAssetCatalog.warm_battle_form(FORMAL_PET_FORM_ID):
		_fail_capture("正式最大宠物动作包无法预热")
		return false
	host.call("_start_battle", state)
	await host.get_tree().process_frame
	if not _assert_post_start_formation_contract():
		return false
	var readiness := _battle_readiness_snapshot()
	for _frame in range(READY_FRAME_LIMIT):
		_view = _host_property("battle_command_awakened_view")
		if (
			bool(readiness.get("battleActive", false))
			and bool(readiness.get("viewMounted", false))
			and bool(readiness.get("viewVisible", false))
			and bool(readiness.get("layoutOk", false))
		):
			await _settle_frames(8)
			_world_click_accept_start = int(
				_host_property("click_move_input_accept_count")
			)
			return true
		await host.get_tree().process_frame
		readiness = _battle_readiness_snapshot()
	_fail_capture(
		"真实Main正式20人战斗HUD未在限定帧内就绪 readiness=%s"
		% JSON.stringify(readiness)
	)
	return false


func _battle_readiness_snapshot() -> Dictionary:
	var state_value = _host_property("battle_state")
	var battle_state := state_value as Dictionary if state_value is Dictionary else {}
	var actors_value = battle_state.get("actors", [])
	var actors: Array = actors_value as Array if actors_value is Array else []
	var slot_ids := {}
	var invalid_actor_count := 0
	var duplicate_slot_count := 0
	var ally_count := 0
	var enemy_count := 0
	var ally_pet: Dictionary = {}
	for value in actors:
		if not (value is Dictionary):
			invalid_actor_count += 1
			continue
		var actor := value as Dictionary
		var side := str(actor.get("side", ""))
		if side == "ally":
			ally_count += 1
		elif side == "enemy":
			enemy_count += 1
		if str(actor.get("id", "")) == "ally_pet":
			ally_pet = actor
		var slot_id := str(actor.get("slotId", ""))
		if not BattleLayoutSafeAreaModel.is_valid_slot_id(slot_id):
			invalid_actor_count += 1
			continue
		if slot_ids.has(slot_id):
			duplicate_slot_count += 1
			continue
		slot_ids[slot_id] = true
	var full_formation := (
		invalid_actor_count == 0
		and duplicate_slot_count == 0
		and BattleModel.fills_full_formation(battle_state)
	)
	var view_value = _host_property("battle_command_awakened_view")
	var view_mounted := view_value is CanvasItem
	var battle_active := bool(_host_property("battle_active"))
	var layout_ok := (
		battle_active
		and full_formation
		and bool(host.call("_battle_full_formation_screen_layout_ok"))
	)
	return {
		"battleActive": battle_active,
		"viewMounted": view_mounted,
		"viewVisible": (
			(view_value as CanvasItem).is_visible_in_tree()
			if view_mounted
			else false
		),
		"actorCount": actors.size(),
		"slotCount": slot_ids.size(),
		"invalidActorCount": invalid_actor_count,
		"duplicateSlotCount": duplicate_slot_count,
		"allyCount": ally_count,
		"enemyCount": enemy_count,
		"formationTemplate": str(battle_state.get("formationTemplate", "")),
		"fullFormation": full_formation,
		"allyPetInstanceId": str(ally_pet.get("instanceId", "")),
		"allyPetFormId": str(ally_pet.get("formId", "")),
		"allyPetName": str(ally_pet.get("name", "")),
		"layoutOk": layout_ok,
	}


func _assert_post_start_formation_contract() -> bool:
	var readiness := _battle_readiness_snapshot()
	if (
		int(readiness.get("actorCount", 0)) != 20
		or int(readiness.get("slotCount", 0)) != 20
		or int(readiness.get("invalidActorCount", 0)) != 0
		or int(readiness.get("duplicateSlotCount", 0)) != 0
		or int(readiness.get("allyCount", 0)) != 10
		or int(readiness.get("enemyCount", 0)) != 10
		or str(readiness.get("formationTemplate", "")) != FORMATION_TEMPLATE
		or not bool(readiness.get("fullFormation", false))
		or str(readiness.get("allyPetInstanceId", "")) != FORMAL_PET_INSTANCE_ID
		or str(readiness.get("allyPetFormId", "")) != FORMAL_PET_FORM_ID
		or str(readiness.get("allyPetName", "")) != MAX_PET_NAME
	):
		_fail_capture(
			"真实Main归一化后不是精确正式20人阵型 readiness=%s"
			% JSON.stringify(readiness)
		)
		return false
	return true


func _assert_formal_fixture_assets() -> bool:
	if MAX_CHARACTER_NAME.length() != CharacterRosterModel.NAME_MAX_LENGTH:
		_fail_capture("人物最长名字fixture不是精确24字")
		return false
	if not CharacterRosterModel.character_name_errors(MAX_CHARACTER_NAME).is_empty():
		_fail_capture("人物最长名字fixture不符合正式命名合同")
		return false
	if MAX_PET_NAME.length() != PlayerProgressModel.PET_NAME_MAX_LENGTH:
		_fail_capture("宠物最长名字fixture不是精确8字")
		return false
	if not PlayerAppearanceCatalog.appearance_ids().has(FORMAL_CHARACTER_APPEARANCE_ID):
		_fail_capture("最大正式人物形象不是可选择运行形象")
		return false
	if not CharacterActionAssetCatalog.supports_battle_appearance(
		FORMAL_CHARACTER_APPEARANCE_ID
	):
		_fail_capture("最大正式人物形象不能进入战斗运行路径")
		return false
	if (
		not PetArtCatalog.supports_form(FORMAL_PET_FORM_ID)
		or PetArtCatalog.status_for_form(FORMAL_PET_FORM_ID)
		!= PetArtCatalog.STATUS_APPROVED
		or not PetActionAssetCatalog.supports_form(FORMAL_PET_FORM_ID)
	):
		_fail_capture("最大正式宠物形象不是approved运行战斗形象")
		return false
	var character_meta := _read_json_dictionary(FORMAL_CHARACTER_META_PATH)
	var pet_meta := _read_json_dictionary(FORMAL_PET_META_PATH)
	if (
		not bool(character_meta.get("runtimeEnabled", false))
		or str(character_meta.get("ownerReviewStatus", ""))
		!= "owner_review_pending"
		or _normalized_frame_size(character_meta.get("sourceFrameSize", []))
		!= Vector2i(512, 512)
		or _normalized_frame_size(character_meta.get("runtimeFrameSize", []))
		!= Vector2i(256, 256)
	):
		_fail_capture("人物正式动作包元数据与冻结生命周期不符")
		return false
	var pet_identity = pet_meta.get("identity", {})
	if (
		not bool(pet_meta.get("runtimeEnabled", false))
		or str(pet_meta.get("ownerReviewStatus", "")) != "approved"
		or not (pet_identity is Dictionary)
		or _normalized_frame_size(
			(pet_identity as Dictionary).get("sourceFrameSize", [])
		) != Vector2i(512, 512)
		or _normalized_frame_size(pet_meta.get("runtimeFrameSize", []))
		!= Vector2i(256, 256)
	):
		_fail_capture("宠物正式动作包元数据与冻结生命周期不符")
		return false
	return true


func _assert_live_layout_contract() -> bool:
	var state = _host_property("battle_state")
	if not (state is Dictionary):
		_fail_capture("真实Main战斗状态缺失")
		return false
	var battle_state := state as Dictionary
	var actors: Array = battle_state.get("actors", [])
	var report := BattleLayoutSafeAreaModel.layout_report(Vector2(EXPECTED_VIEWPORT))
	if (
		not bool(report.get("supported", false))
		or not bool(report.get("ok", false))
		or int(report.get("slotCount", 0)) != 20
		or not (report.get("collisions", []) as Array).is_empty()
		or not (report.get("viewportViolations", []) as Array).is_empty()
		or actors.size() != 20
		or not BattleModel.fills_full_formation(battle_state)
		or str(battle_state.get("formationTemplate", "")) != FORMATION_TEMPLATE
	):
		_fail_capture("正式20人安全区报告不通过：%s" % str(report))
		return false
	if (
		not BattleLayoutConstants.GRID_TEMPLATE_ORIGIN.is_equal_approx(
			Vector2(94.0, 340.4)
		)
		or not BattleLayoutConstants.GRID_TEMPLATE_LANE_STEP.is_equal_approx(
			Vector2(152.0, 52.0)
		)
		or not BattleLayoutConstants.GRID_TEMPLATE_RANK_STEP.is_equal_approx(
			Vector2(64.0, -48.0)
		)
		or not BattleLayoutSafeAreaModel.FORMAL_MAX_VISIBLE_ENVELOPE_SIZE.is_equal_approx(
			Vector2(132.0, 164.0)
		)
	):
		_fail_capture("战斗布局identity常量漂移")
		return false
	if not _assert_actual_hud_rects():
		return false
	var expected_anchors := report.get("anchors", {}) as Dictionary
	var viewport_rect := Rect2(Vector2.ZERO, Vector2(EXPECTED_VIEWPORT))
	var seen_slots := {}
	for value in actors:
		var actor := value as Dictionary
		var slot_id := str(actor.get("slotId", ""))
		if (
			seen_slots.has(slot_id)
			or not BattleLayoutSafeAreaModel.is_valid_slot_id(slot_id)
			or not expected_anchors.has(slot_id)
		):
			_fail_capture("20人阵型slot无效或重复：%s" % slot_id)
			return false
		seen_slots[slot_id] = true
		var screen_point = host.call(
			"_world_to_screen",
			host.call("_battle_slot_world_position", slot_id)
		)
		if not (screen_point is Vector2):
			_fail_capture("真实Main无法取得slot屏幕锚点：%s" % slot_id)
			return false
		var actual_anchor := screen_point as Vector2
		if not actual_anchor.is_equal_approx(expected_anchors.get(slot_id, Vector2.INF)):
			_fail_capture(
				"真实Main锚点不等于Phase403 identity：%s actual=%s expected=%s"
				% [slot_id, str(actual_anchor), str(expected_anchors.get(slot_id))]
			)
			return false
		var envelope := (
			BattleLayoutSafeAreaModel.reference_actor_envelope_for_anchor(
				actual_anchor
			)
		)
		if (
			not viewport_rect.encloses(envelope)
			or not BattleLayoutSafeAreaModel.reference_persistent_hud_intersections_for_rect(
				envelope
			).is_empty()
			or bool((_view as Object).call("active_controls_overlap_rect", envelope))
			or _actual_top_or_message_rect_overlaps(envelope)
			or bool(host.call("_battle_point_overlaps_panel", actual_anchor))
		):
			_fail_capture("真实actor包络与正式HUD相交：%s %s" % [slot_id, str(envelope)])
			return false
	if seen_slots.size() != 20:
		_fail_capture("真实20人slot没有完整覆盖")
		return false
	if not bool(host.call("_battle_full_formation_screen_layout_ok")):
		_fail_capture("Main正式全阵型布局门禁没有通过")
		return false
	var focus_actor := BattleModel.actor_by_id(battle_state, "ally_player")
	var label_plan = host.call(
		"_battle_actor_label_draw_plan",
		focus_actor,
		0.74,
		true
	)
	if (
		not (label_plan is Dictionary)
		or not bool((label_plan as Dictionary).get("fits", false))
		or bool((label_plan as Dictionary).get("fullLabel", true))
		or float((label_plan as Dictionary).get("width", 999.0)) > 132.0
	):
		_fail_capture("最长人物焦点名没有约束在正式actor包络内")
		return false
	return true


func _assert_actual_hud_rects() -> bool:
	var round_panel = _host_property("battle_round_panel")
	var timer_panel = _host_property("battle_timer_panel")
	var message_panel = _host_property("battle_message_panel")
	if not (round_panel is Control and timer_panel is Control and message_panel is Control):
		_fail_capture("正式回合、计时或消息HUD未挂载")
		return false
	if (
		not (round_panel as Control).is_visible_in_tree()
		or not (timer_panel as Control).is_visible_in_tree()
		or not (message_panel as Control).is_visible_in_tree()
		or not _rect_equal(
			(round_panel as Control).get_global_rect(),
			BattleLayoutSafeAreaModel.ROUND_PANEL_RECT
		)
		or not _rect_equal(
			(timer_panel as Control).get_global_rect(),
			BattleLayoutSafeAreaModel.TIMER_PANEL_RECT
		)
		or not _rect_equal(
			(message_panel as Control).get_global_rect(),
			BattleLayoutSafeAreaModel.MESSAGE_PANEL_RECT
		)
		or bool(_host_property("battle_message_expanded"))
	):
		_fail_capture("正式顶部/消息HUD几何或展开状态漂移")
		return false
	var world_hud = _host_property("world_hud_awakened_view")
	if not (world_hud is Control):
		_fail_capture("正式WorldHud视图未挂载")
		return false
	var clock := (world_hud as Node).find_child("WorldHudClock", true, false) as Control
	var experience := (
		(world_hud as Node).find_child("WorldHudExperience", true, false)
		as Control
	)
	if clock == null or experience == null:
		_fail_capture("正式消息页脚时钟/经验未挂载")
		return false
	var footer_union := clock.get_global_rect().merge(experience.get_global_rect())
	if not _rect_equal(footer_union, BattleLayoutSafeAreaModel.MESSAGE_FOOTER_RECT):
		_fail_capture("正式消息页脚几何漂移：%s" % str(footer_union))
		return false
	var command_buttons_value = (_view as Object).call("command_buttons")
	var input_blockers_value = (_view as Object).call("input_blockers")
	var snapshot_value = (_view as Object).call("snapshot")
	if (
		not (command_buttons_value is Dictionary)
		or not (input_blockers_value is Array)
		or not (snapshot_value is Dictionary)
	):
		_fail_capture(
			"正式人物指令公开快照合同缺失 "
			+ "actual_count=0 raw_count=0 active_count=-1 labels=[] rects=[]"
		)
		return false
	var visible_controls: Array[Control] = []
	var raw_visible_count := 0
	var control_sources := [
		(command_buttons_value as Dictionary).values(),
		input_blockers_value as Array,
	]
	for source_value in control_sources:
		for control_value in source_value as Array:
			if not (control_value is Control):
				continue
			var control := control_value as Control
			if not control.is_visible_in_tree():
				continue
			raw_visible_count += 1
			if visible_controls.has(control):
				continue
			visible_controls.append(control)
	var snapshot := snapshot_value as Dictionary
	var actual_labels: Array[String] = []
	for value in snapshot.get("visibleLabels", []):
		actual_labels.append(str(value))
	var sorted_actual_labels := actual_labels.duplicate()
	var sorted_expected_labels := EXPECTED_PLAYER_COMMAND_LABELS.duplicate()
	sorted_actual_labels.sort()
	sorted_expected_labels.sort()
	var actual_rects: Array[String] = []
	var control_rects: Array[Rect2] = []
	for control in visible_controls:
		var rect := control.get_global_rect()
		control_rects.append(rect)
		actual_rects.append(str(rect))
	var diagnostic := (
		"actual_count=%d raw_count=%d active_count=%d labels=%s rects=%s"
		% [
			visible_controls.size(),
			raw_visible_count,
			int(snapshot.get("activeButtonCount", -1)),
			str(actual_labels),
			str(actual_rects),
		]
	)
	if (
		visible_controls.size() != 10
		or int(snapshot.get("activeButtonCount", -1)) != 10
		or actual_labels.size() != 10
		or sorted_actual_labels != sorted_expected_labels
	):
		_fail_capture("正式人物十指令数量或标签异常 %s" % diagnostic)
		return false
	var actual_hud_rects := {
		"round": (round_panel as Control).get_global_rect(),
		"timer": (timer_panel as Control).get_global_rect(),
		"message": (message_panel as Control).get_global_rect(),
		"footer": footer_union,
	}
	for index in range(visible_controls.size()):
		var rect := control_rects[index]
		if (
			not BattleLayoutSafeAreaModel.COMMAND_RIGHT_COLUMN_RECT.grow(0.5).encloses(rect)
			and not BattleLayoutSafeAreaModel.COMMAND_BOTTOM_ROW_RECT.grow(0.5).encloses(rect)
		):
			_fail_capture("正式指令控件越出右/底安全区 %s" % diagnostic)
			return false
		for hud_name in actual_hud_rects.keys():
			var hud_rect := actual_hud_rects.get(hud_name, Rect2()) as Rect2
			if hud_rect.intersects(rect):
				_fail_capture(
					"正式指令控件与%s HUD相交 %s" % [str(hud_name), diagnostic]
				)
				return false
		for previous_index in range(index):
			var previous_rect := control_rects[previous_index]
			if previous_rect.intersects(rect):
				_fail_capture("正式人物指令控件相互重叠 %s" % diagnostic)
				return false
	return true


func _assert_review_only_mount_width_contract() -> bool:
	var bundle := MountedCharacterAssetCatalog.bundle_for_combination(
		REVIEW_ONLY_MOUNT_CHARACTER_ID,
		REVIEW_ONLY_MOUNT_FORM_ID
	)
	var presentation_scale := (
		MountVisualProfileCatalog.battle_presentation_scale_for_form(
			REVIEW_ONLY_MOUNT_FORM_ID
		)
	)
	var integrated := (
		MountVisualProfileCatalog.runtime_presentation_mode_for_form(
			REVIEW_ONLY_MOUNT_FORM_ID
		)
		== MountVisualProfileCatalog.PRESENTATION_MODE_INTEGRATED_MOUNTED_BODY
	)
	var frame_size = bundle.get("frameSize", [])
	var max_visible_px := 256.0 * presentation_scale * 0.74 * 0.72
	if (
		bundle.is_empty()
		or not integrated
		or not MountVisualProfileCatalog.warm_world_form(
			REVIEW_ONLY_MOUNT_FORM_ID
		)
		or frame_size != [256, 256]
		or not is_equal_approx(presentation_scale, 0.88)
		or max_visible_px > BattleLayoutSafeAreaModel.FORMAL_MAX_VISIBLE_ENVELOPE_SIZE.x
	):
		_fail_capture("review-only整体骑乘实际bundle无法绑定正式最大包络")
		return false
	print(
		(
			"PHASE403_BATTLE_LAYOUT_REVIEW_ONLY kind=integrated_mount "
			+ "bundle=%s character=%s form=%s geometry_only=true "
			+ "player_visible=false ordinary_battle=false "
			+ "inserted_into_battle_state=false actual_bundle_warmed=true "
			+ "runtime_frame=256x256 source_image_frame=not_asserted "
			+ "mount_scale=0.88 visual_scale=0.74 opaque_ratio=0.72 "
			+ "max_visible_px=%.2f horizontal_envelope_px=132.00 "
			+ "width_covered=true vertical_recomputed=false "
			+ "anchor_recomputed=false slot_collisions_recomputed=false"
		) % [
			str(bundle.get("bundleId", "")),
			REVIEW_ONLY_MOUNT_CHARACTER_ID,
			REVIEW_ONLY_MOUNT_FORM_ID,
			max_visible_px,
		]
	)
	return true


func _print_fixture_marker() -> void:
	print(
		"PHASE403_BATTLE_LAYOUT_FIXTURE character=ember_spark_v1 "
		+ "character_runtime=true character_lifecycle=owner_review_pending "
		+ "pet=wuli_evolved_crystal_earth8_water2 pet_runtime=true "
		+ "pet_lifecycle=approved runtime_frame=256x256 "
		+ "source_image_frame=512x512 "
		+ "draw_canvas=156x156 visual_scale=0.74 character_name_chars=24 "
		+ "pet_name_chars=8 mounted_player_actors=0 lifecycle_unchanged=true"
	)


func _print_layout_marker() -> void:
	print(
		(
			"PHASE403_BATTLE_LAYOUT_IDENTITY id=%s formation=10v10 actors=20 "
			+ "origin=94x340.4 lane=152x52 rank=64x-48 envelope=132x164 "
			+ "round=576,18,128,40 timer=584,62,112,44 "
			+ "message=57,469,348,233 footer=57,703,204,17 "
			+ "hud_collisions=0 viewport_violations=0 exact=true"
		) % LAYOUT_IDENTITY
	)


func _click_player_attack(label: String) -> void:
	var perf_qa_started_usec := Time.get_ticks_usec()
	if str(_host_property("battle_command_owner")) != "player":
		_fail_capture("%s前不是人物回合" % label)
		return
	var button = (_view as Object).call("visible_button_with_label", "攻击")
	if not (button is BaseButton):
		_fail_capture("%s缺少正式攻击按钮" % label)
		return
	var attack_button := button as BaseButton
	var first_attack := _player_attack_attempts == 0
	_player_attack_attempts += 1
	var probe := {}
	var before := {}
	if first_attack:
		probe = _install_attack_input_probe(attack_button)
		before = _attack_input_state_snapshot_with_point_classification(
			attack_button,
			"before"
		)
		before.merge(_attack_input_probe_context(probe), true)
		print(
			"%s %s"
			% [ATTACK_INPUT_BEFORE_MARKER, JSON.stringify(before)]
		)
		if not _attack_input_precondition_ok(before):
			var pre_cleanup_ok := _disconnect_attack_input_probe(
				attack_button,
				probe
			)
			var pre_after := _attack_input_state_snapshot_with_point_classification(
				attack_button,
				"deferred"
			)
			pre_after.merge(
				_attack_input_probe_result(
					probe,
					"precondition_failed",
					pre_cleanup_ok
				),
				true
			)
			print(
				"%s %s"
				% [ATTACK_INPUT_AFTER_MARKER, JSON.stringify(pre_after)]
			)
			_fail_capture(
				"%s点击前状态不满足真实攻击输入合同 actual=%s"
				% [label, JSON.stringify(before)]
			)
			return
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	await _left_click_control(attack_button, label, probe)
	perf_qa_started_usec = Time.get_ticks_usec()
	if first_attack:
		_capture_attack_input_post_draw_states(probe, attack_button)
		var after := _attack_input_state_snapshot_with_point_classification(
			attack_button,
			"deferred"
		)
		var cleanup_ok := _disconnect_attack_input_probe(
			attack_button,
			probe
		)
		var classification := _attack_input_classification(probe, after)
		after.merge(
			_attack_input_probe_result(probe, classification, cleanup_ok),
			true
		)
		print(
			"%s %s"
			% [ATTACK_INPUT_AFTER_MARKER, JSON.stringify(after)]
		)
		if not cleanup_ok:
			_fail_capture("%s输入spy没有完整断开 actual=%s" % [label, JSON.stringify(after)])
		if classification != "ok":
			_fail_capture(
				"%s真实左键诊断=%s actual=%s"
				% [label, classification, JSON.stringify(after)]
			)
	if _failed:
		_record_perf_qa_sync_wall(perf_qa_started_usec)
		return
	var actual := _attack_input_state_snapshot_with_point_classification(
		attack_button,
		"post"
	)
	if not _attack_input_postcondition_ok(actual):
		_fail_capture(
			"%s真实左键没有进入无预选目标的攻击选择 actual=%s"
			% [label, JSON.stringify(actual)]
		)
	_record_perf_qa_sync_wall(perf_qa_started_usec)


func _click_pet_recall(label: String) -> void:
	var perf_qa_started_usec := Time.get_ticks_usec()
	if str(_host_property("battle_command_owner")) != "pet":
		_fail_capture("%s前不是宠物回合" % label)
		return
	var button = (_view as Object).call("visible_button_with_label", "撤回")
	if not (button is Control):
		_fail_capture("%s缺少正式撤回按钮" % label)
		return
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	await _left_click_control(button as Control, label)
	perf_qa_started_usec = Time.get_ticks_usec()
	if _failed:
		_record_perf_qa_sync_wall(perf_qa_started_usec)
		return
	if (
		str(_host_property("battle_command_owner")) != "player"
		or str(_host_property("battle_selected_target_id")) != ""
		or not (_host_property("battle_pending_player_command") as Dictionary).is_empty()
	):
		_fail_capture("%s真实左键没有清空目标并回到人物回合" % label)
	_record_perf_qa_sync_wall(perf_qa_started_usec)


func _click_exact_target(fixture: Dictionary, index: int) -> void:
	var perf_qa_started_usec := Time.get_ticks_usec()
	var actor_id := str(fixture.get("actorId", ""))
	var slot_id := str(fixture.get("slotId", ""))
	var state := _host_property("battle_state") as Dictionary
	var actor := BattleModel.actor_by_id(state, actor_id)
	if actor.is_empty() or str(actor.get("slotId", "")) != slot_id:
		_fail_capture("目标fixture actor/slot不一致：%s/%s" % [actor_id, slot_id])
		return
	var anchor = host.call(
		"_world_to_screen",
		host.call("_battle_slot_world_position", slot_id)
	)
	if not (anchor is Vector2):
		_fail_capture("目标slot没有真实Main屏幕锚点：%s" % slot_id)
		return
	var target_point := (anchor as Vector2) + Vector2(0.0, -18.0 * 0.74)
	var pre_resolved = host.call(
		"_battle_actor_id_at_screen_point",
		target_point,
		BattleModel.SIDE_ENEMY
	)
	if str(pre_resolved) != actor_id:
		_fail_capture(
			"相邻目标命中预解析错误：expected=%s resolved=%s"
			% [actor_id, str(pre_resolved)]
		)
		return
	if bool(host.call("_battle_point_overlaps_panel", target_point)):
		_fail_capture("相邻目标点被HUD覆盖：%s" % slot_id)
		return
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	await _left_click_point(target_point, "目标%s" % slot_id, false)
	perf_qa_started_usec = Time.get_ticks_usec()
	if _failed:
		_record_perf_qa_sync_wall(perf_qa_started_usec)
		return
	var pending := _host_property("battle_pending_player_command") as Dictionary
	if (
		str(_host_property("battle_selected_target_id")) != actor_id
		or str(pending.get("command", "")) != "attack"
		or str(pending.get("targetId", "")) != actor_id
		or str(_host_property("battle_command_owner")) != "pet"
	):
		_fail_capture("真实相邻actor左键未精确落到%s/%s" % [actor_id, slot_id])
		return
	var label_plan = host.call(
		"_battle_actor_label_draw_plan",
		actor,
		0.74,
		true
	)
	if (
		not (label_plan is Dictionary)
		or not bool((label_plan as Dictionary).get("fits", false))
		or float((label_plan as Dictionary).get("width", 999.0)) > 132.0
	):
		_fail_capture("最长宠物焦点名越出正式actor包络")
		return
	_exact_target_hits += 1
	var adjacent_distance := _target_anchor_distance()
	var marker_line := (
		"PHASE403_BATTLE_LAYOUT_TARGET index=%d actor=%s slot=%s "
		+ "expected=%s resolved=%s exact=true adjacent_distance=%.2f "
		+ "focus_name_chars=8 focus_label_fits=true hud_overlap=false"
	) % [
		index,
		actor_id,
		slot_id,
		actor_id,
		str(pre_resolved),
		adjacent_distance,
	]
	if _perf_sample_state == "target_switch":
		if index < 1 or index > _perf_target_marker_lines.size():
			_fail_capture("性能目标marker index越界：%d" % index)
			return
		_perf_target_marker_lines[index - 1] = marker_line
	else:
		print(marker_line)
	_record_perf_qa_sync_wall(perf_qa_started_usec)


func _target_anchor_distance() -> float:
	var first = host.call(
		"_world_to_screen",
		host.call("_battle_slot_world_position", "enemy.front.4")
	)
	var second = host.call(
		"_world_to_screen",
		host.call("_battle_slot_world_position", "enemy.front.5")
	)
	if first is Vector2 and second is Vector2:
		return (first as Vector2).distance_to(second as Vector2)
	return -1.0


func _vector_payload(value: Vector2) -> Array[float]:
	return [value.x, value.y]


func _rect_payload(value: Rect2) -> Array[float]:
	return [value.position.x, value.position.y, value.size.x, value.size.y]


func _transform_payload(value: Transform2D) -> Array[float]:
	return [
		value.x.x,
		value.x.y,
		value.y.x,
		value.y.y,
		value.origin.x,
		value.origin.y,
	]


func _control_path(control: Control) -> String:
	if control == null or not is_instance_valid(control):
		return ""
	return str(control.get_path()) if control.is_inside_tree() else str(control.name)


func _control_instance_id(control: Control) -> int:
	if control == null or not is_instance_valid(control):
		return 0
	return int(control.get_instance_id())


func _hovered_control_matches_target(
	hovered: Control,
	target_control: Control
) -> bool:
	if (
		hovered == null
		or target_control == null
		or not is_instance_valid(hovered)
		or not is_instance_valid(target_control)
	):
		return false
	var cursor: Node = hovered
	while cursor != null:
		if cursor == target_control:
			return true
		cursor = cursor.get_parent()
	return false


func _attack_input_route_stage_snapshot(
	button: BaseButton,
	stage: String
) -> Dictionary:
	var parent: Node = button.get_parent()
	var viewport: Viewport = button.get_viewport() as Viewport
	var hovered: Control = (
		viewport.gui_get_hovered_control() as Control
		if viewport != null
		else null
	)
	return {
		"stage": stage,
		"buttonPath": _control_path(button),
		"buttonInstanceId": _control_instance_id(button),
		"buttonParentPath": (
			str(parent.get_path())
			if parent != null and parent.is_inside_tree()
			else ""
		),
		"buttonParentInstanceId": (
			int(parent.get_instance_id()) if parent != null else 0
		),
		"buttonGlobalRect": _rect_payload(button.get_global_rect()),
		"buttonVisible": button.is_visible_in_tree(),
		"buttonDisabled": button.disabled,
		"buttonMouseFilter": int(button.mouse_filter),
		"buttonActionMode": int(button.action_mode),
		"buttonKeepPressedOutside": button.keep_pressed_outside,
		"buttonPressed": button.button_pressed,
		"buttonIsHovered": button.is_hovered(),
		"viewportHoveredPath": _control_path(hovered),
		"viewportHoveredInstanceId": _control_instance_id(hovered),
		"viewportHoveredMatchesButton": _hovered_control_matches_target(
			hovered,
			button
		),
		"inputLeftPressed": Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT),
	}


func _capture_attack_input_route_stage(
	probe: Dictionary,
	target_control: Control,
	stage: String
) -> void:
	if probe.is_empty():
		return
	var stages := probe.get("routeStages", []) as Array
	if target_control is BaseButton:
		var stage_snapshot := _attack_input_route_stage_snapshot(
			target_control as BaseButton,
			stage
		)
		var gui_events := probe.get("guiLeftButtonEvents", []) as Array
		stage_snapshot.merge(
			{
				"processFrame": Engine.get_process_frames(),
				"downCount": int(probe.get("downCount", 0)),
				"upCount": int(probe.get("upCount", 0)),
				"pressedCount": int(probe.get("pressedCount", 0)),
				"viewAttackCount": int(probe.get("viewAttackCount", 0)),
				"guiLeftButtonEventCount": gui_events.size(),
				"guiLeftButtonPressCount": (
					_attack_input_gui_left_button_count(probe, true)
				),
				"guiLeftButtonReleaseCount": (
					_attack_input_gui_left_button_count(probe, false)
				),
			},
			true
		)
		stages.append(stage_snapshot)
		if stage == "release_post_draw":
			_capture_attack_input_delivery_boundary(
				probe,
				stage_snapshot,
				"sameLoop"
			)
		elif stage == "release_next_loop_post_draw":
			_capture_attack_input_delivery_boundary(
				probe,
				stage_snapshot,
				"nextLoop"
			)
	else:
		stages.append({"stage": stage, "invalidTarget": true})
	probe["routeStages"] = stages


func _attack_input_gui_left_button_count(
	probe: Dictionary,
	pressed_value: bool
) -> int:
	var count := 0
	for raw_event in probe.get("guiLeftButtonEvents", []):
		if not (raw_event is Dictionary):
			continue
		var event := raw_event as Dictionary
		if (
			int(event.get("buttonIndex", 0)) == MOUSE_BUTTON_LEFT
			and bool(event.get("pressed", false)) == pressed_value
		):
			count += 1
	return count


func _attack_input_route_stage_delivered(stage: Dictionary) -> bool:
	return (
		not bool(stage.get("inputLeftPressed", true))
		and not bool(stage.get("buttonPressed", true))
		and int(stage.get("downCount", 0)) == 1
		and int(stage.get("upCount", 0)) == 1
		and int(stage.get("pressedCount", 0)) == 1
		and int(stage.get("viewAttackCount", 0)) == 1
		and int(stage.get("guiLeftButtonEventCount", 0)) == 2
		and int(stage.get("guiLeftButtonPressCount", 0)) == 1
		and int(stage.get("guiLeftButtonReleaseCount", 0)) == 1
	)


func _capture_attack_input_delivery_boundary(
	probe: Dictionary,
	stage: Dictionary,
	prefix: String
) -> void:
	probe[prefix + "Delivered"] = _attack_input_route_stage_delivered(stage)
	probe[prefix + "ProcessFrame"] = int(stage.get("processFrame", -1))
	probe[prefix + "GuiLeftButtonEventCount"] = int(
		stage.get("guiLeftButtonEventCount", -1)
	)
	probe[prefix + "GuiLeftButtonPressCount"] = int(
		stage.get("guiLeftButtonPressCount", -1)
	)
	probe[prefix + "GuiLeftButtonReleaseCount"] = int(
		stage.get("guiLeftButtonReleaseCount", -1)
	)


func _matching_connection_count(
	connections: Array,
	target: Object,
	method_name: String
) -> int:
	return _matching_connection_flags(
		connections,
		target,
		method_name
	).size()


func _matching_connection_flags(
	connections: Array,
	target: Object,
	method_name: String
) -> Array[int]:
	var flags: Array[int] = []
	for raw_connection in connections:
		if not (raw_connection is Dictionary):
			continue
		var connection := raw_connection as Dictionary
		var callback := (
			connection.get("callable", Callable())
			as Callable
		)
		if (
			callback.is_valid()
			and callback.get_object() == target
			and str(callback.get_method()) == method_name
		):
			flags.append(int(connection.get("flags", -1)))
	return flags


func _attack_product_connection_snapshot(button: BaseButton) -> Dictionary:
	var button_connections := button.pressed.get_connections()
	var view_connections := (
		(_view as Object).get_signal_connection_list("command_pressed")
	)
	var product_button_count := _matching_connection_count(
		button_connections,
		_view as Object,
		"_emit_command"
	)
	var product_view_count := _matching_connection_count(
		view_connections,
		host,
		"_on_battle_command_pressed"
	)
	var product_button_flags := _matching_connection_flags(
		button_connections,
		_view as Object,
		"_emit_command"
	)
	var product_view_flags := _matching_connection_flags(
		view_connections,
		host,
		"_on_battle_command_pressed"
	)
	var product_connections_non_deferred := (
		product_button_flags.size() == 1
		and product_view_flags.size() == 1
		and (product_button_flags[0] & CONNECT_DEFERRED) == 0
		and (product_view_flags[0] & CONNECT_DEFERRED) == 0
	)
	return {
		"productButtonConnectionCount": product_button_count,
		"productButtonTotalConnectionCount": button_connections.size(),
		"productViewConnectionCount": product_view_count,
		"productViewTotalConnectionCount": view_connections.size(),
		"productButtonConnectionFlags": product_button_flags.duplicate(),
		"productViewConnectionFlags": product_view_flags.duplicate(),
		"productConnectionsNonDeferred": product_connections_non_deferred,
		"productChainExact": (
			product_button_count == 1
			and button_connections.size() == 1
			and product_view_count == 1
			and view_connections.size() == 1
			and product_connections_non_deferred
		),
	}


func _install_attack_input_probe(button: BaseButton) -> Dictionary:
	var product_connections := _attack_product_connection_snapshot(button)
	var probe := {
		"productButtonConnectionCount": int(
			product_connections.get("productButtonConnectionCount", 0)
		),
		"productButtonTotalConnectionCount": int(
			product_connections.get("productButtonTotalConnectionCount", 0)
		),
		"productViewConnectionCount": int(
			product_connections.get("productViewConnectionCount", 0)
		),
		"productViewTotalConnectionCount": int(
			product_connections.get("productViewTotalConnectionCount", 0)
		),
		"productButtonConnectionFlags": (
			product_connections.get("productButtonConnectionFlags", [])
			as Array
		).duplicate(),
		"productViewConnectionFlags": (
			product_connections.get("productViewConnectionFlags", [])
			as Array
		).duplicate(),
		"productConnectionsNonDeferred": bool(
			product_connections.get("productConnectionsNonDeferred", false)
		),
		"productChainExactBefore": bool(
			product_connections.get("productChainExact", false)
		),
		"viewObserverMode": "synchronous_after_preexisting_host",
		"spiesInstalled": false,
		"downCount": 0,
		"upCount": 0,
		"pressedCount": 0,
		"viewAttackCount": 0,
		"guiLeftButtonEvents": [],
		"mouseEnteredCount": 0,
		"mouseExitedCount": 0,
		"routeStages": [],
		"sameLoopDelivered": false,
		"nextLoopDelivered": false,
		"sameLoopProcessFrame": -1,
		"nextLoopProcessFrame": -1,
		"sameLoopGuiLeftButtonEventCount": -1,
		"sameLoopGuiLeftButtonPressCount": -1,
		"sameLoopGuiLeftButtonReleaseCount": -1,
		"nextLoopGuiLeftButtonEventCount": -1,
		"nextLoopGuiLeftButtonPressCount": -1,
		"nextLoopGuiLeftButtonReleaseCount": -1,
	}
	if not bool(probe.get("productChainExactBefore", false)):
		return probe
	var down_callable := Callable(
		self,
		"_on_attack_probe_button_down"
	).bind(probe, button)
	var up_callable := Callable(
		self,
		"_on_attack_probe_button_up"
	).bind(probe, button)
	var pressed_callable := Callable(
		self,
		"_on_attack_probe_pressed"
	).bind(probe, button)
	var view_callable := Callable(
		self,
		"_on_attack_probe_view_command"
	).bind(probe, button)
	var gui_input_callable := Callable(
		self,
		"_on_attack_probe_gui_input"
	).bind(probe)
	var mouse_entered_callable := Callable(
		self,
		"_on_attack_probe_mouse_entered"
	).bind(probe)
	var mouse_exited_callable := Callable(
		self,
		"_on_attack_probe_mouse_exited"
	).bind(probe)
	probe["_downCallable"] = down_callable
	probe["_upCallable"] = up_callable
	probe["_pressedCallable"] = pressed_callable
	probe["_viewCallable"] = view_callable
	probe["_guiInputCallable"] = gui_input_callable
	probe["_mouseEnteredCallable"] = mouse_entered_callable
	probe["_mouseExitedCallable"] = mouse_exited_callable
	button.button_down.connect(down_callable, CONNECT_ONE_SHOT)
	button.button_up.connect(up_callable, CONNECT_ONE_SHOT)
	button.pressed.connect(pressed_callable, CONNECT_ONE_SHOT)
	button.gui_input.connect(gui_input_callable)
	button.mouse_entered.connect(mouse_entered_callable)
	button.mouse_exited.connect(mouse_exited_callable)
	(_view as Object).connect(
		"command_pressed",
		view_callable,
		CONNECT_ONE_SHOT
	)
	probe["spiesInstalled"] = true
	return probe


func _on_attack_probe_button_down(
	probe: Dictionary,
	button: BaseButton
) -> void:
	probe["downCount"] = int(probe.get("downCount", 0)) + 1
	probe["downState"] = _attack_input_state_snapshot(button, "down")


func _on_attack_probe_button_up(
	probe: Dictionary,
	_button: BaseButton
) -> void:
	probe["upCount"] = int(probe.get("upCount", 0)) + 1


func _on_attack_probe_pressed(
	probe: Dictionary,
	_button: BaseButton
) -> void:
	probe["pressedCount"] = int(probe.get("pressedCount", 0)) + 1


func _on_attack_probe_view_command(
	command_id: String,
	probe: Dictionary,
	_button: BaseButton
) -> void:
	if command_id != "attack":
		probe["unexpectedViewCommand"] = command_id
		return
	probe["viewAttackCount"] = int(probe.get("viewAttackCount", 0)) + 1


func _on_attack_probe_gui_input(
	event: InputEvent,
	probe: Dictionary
) -> void:
	if not (event is InputEventMouseButton):
		return
	var mouse_event := event as InputEventMouseButton
	if mouse_event.button_index != MOUSE_BUTTON_LEFT:
		return
	var events := probe.get("guiLeftButtonEvents", []) as Array
	events.append(
		{
			"pressed": mouse_event.pressed,
			"buttonIndex": int(mouse_event.button_index),
			"buttonMask": int(mouse_event.button_mask),
			"position": _vector_payload(mouse_event.position),
			"globalPosition": _vector_payload(mouse_event.global_position),
		}
	)
	probe["guiLeftButtonEvents"] = events


func _on_attack_probe_mouse_entered(probe: Dictionary) -> void:
	probe["mouseEnteredCount"] = int(probe.get("mouseEnteredCount", 0)) + 1


func _on_attack_probe_mouse_exited(probe: Dictionary) -> void:
	probe["mouseExitedCount"] = int(probe.get("mouseExitedCount", 0)) + 1


func _capture_attack_input_post_draw_states(
	probe: Dictionary,
	button: BaseButton
) -> void:
	var post_draw_boundary_reached: bool = bool(
		probe.get("postDrawBoundaryReached", false)
	)
	var next_loop_post_draw_boundary_reached: bool = bool(
		probe.get("nextLoopPostDrawBoundaryReached", false)
	)
	probe["postDrawStateCaptured"] = (
		post_draw_boundary_reached
		and next_loop_post_draw_boundary_reached
	)
	if not bool(probe.get("postDrawStateCaptured", false)):
		return
	if int(probe.get("upCount", 0)) > 0:
		probe["releaseState"] = _attack_input_state_snapshot(button, "release")
	if int(probe.get("pressedCount", 0)) > 0:
		probe["pressedState"] = _attack_input_state_snapshot(button, "pressed")
	if int(probe.get("viewAttackCount", 0)) > 0:
		probe["viewState"] = _attack_input_state_snapshot(button, "view")


func _disconnect_probe_signal(
	source: Object,
	signal_name: StringName,
	callback: Callable
) -> bool:
	if callback.is_valid() and source.is_connected(signal_name, callback):
		source.disconnect(signal_name, callback)
	return not callback.is_valid() or not source.is_connected(signal_name, callback)


func _disconnect_attack_input_probe(
	button: BaseButton,
	probe: Dictionary
) -> bool:
	var cleanup_ok := true
	cleanup_ok = _disconnect_probe_signal(
		button,
		&"button_down",
		probe.get("_downCallable", Callable()) as Callable
	) and cleanup_ok
	cleanup_ok = _disconnect_probe_signal(
		button,
		&"button_up",
		probe.get("_upCallable", Callable()) as Callable
	) and cleanup_ok
	cleanup_ok = _disconnect_probe_signal(
		button,
		&"pressed",
		probe.get("_pressedCallable", Callable()) as Callable
	) and cleanup_ok
	cleanup_ok = _disconnect_probe_signal(
		_view as Object,
		&"command_pressed",
		probe.get("_viewCallable", Callable()) as Callable
	) and cleanup_ok
	cleanup_ok = _disconnect_probe_signal(
		button,
		&"gui_input",
		probe.get("_guiInputCallable", Callable()) as Callable
	) and cleanup_ok
	cleanup_ok = _disconnect_probe_signal(
		button,
		&"mouse_entered",
		probe.get("_mouseEnteredCallable", Callable()) as Callable
	) and cleanup_ok
	cleanup_ok = _disconnect_probe_signal(
		button,
		&"mouse_exited",
		probe.get("_mouseExitedCallable", Callable()) as Callable
	) and cleanup_ok
	probe["observerSignalsDisconnected"] = cleanup_ok
	var product_after := _attack_product_connection_snapshot(button)
	probe["productChainExactAfterCleanup"] = bool(
		product_after.get("productChainExact", false)
	)
	probe["cleanupOk"] = (
		cleanup_ok
		and bool(probe.get("productChainExactAfterCleanup", false))
	)
	return bool(probe.get("cleanupOk", false))


func _attack_input_probe_context(probe: Dictionary) -> Dictionary:
	return {
		"productButtonConnectionCount": int(
			probe.get("productButtonConnectionCount", 0)
		),
		"productButtonTotalConnectionCount": int(
			probe.get("productButtonTotalConnectionCount", 0)
		),
		"productViewConnectionCount": int(
			probe.get("productViewConnectionCount", 0)
		),
		"productViewTotalConnectionCount": int(
			probe.get("productViewTotalConnectionCount", 0)
		),
		"productButtonConnectionFlags": (
			probe.get("productButtonConnectionFlags", []) as Array
		).duplicate(),
		"productViewConnectionFlags": (
			probe.get("productViewConnectionFlags", []) as Array
		).duplicate(),
		"productConnectionsNonDeferred": bool(
			probe.get("productConnectionsNonDeferred", false)
		),
		"productChainExactBefore": bool(
			probe.get("productChainExactBefore", false)
		),
		"viewObserverMode": str(probe.get("viewObserverMode", "")),
		"spiesInstalled": bool(probe.get("spiesInstalled", false)),
	}


func _attack_input_probe_result(
	probe: Dictionary,
	classification: String,
	cleanup_ok: bool
) -> Dictionary:
	var result := _attack_input_probe_context(probe)
	result.merge(
		{
			"classification": classification,
			"cleanupOk": cleanup_ok,
			"productChainExactAfterCleanup": bool(
				probe.get("productChainExactAfterCleanup", false)
			),
			"downCount": int(probe.get("downCount", 0)),
			"upCount": int(probe.get("upCount", 0)),
			"pressedCount": int(probe.get("pressedCount", 0)),
			"viewAttackCount": int(probe.get("viewAttackCount", 0)),
			"postDrawBoundaryReached": bool(
				probe.get("postDrawBoundaryReached", false)
			),
			"nextLoopPostDrawBoundaryReached": bool(
				probe.get("nextLoopPostDrawBoundaryReached", false)
			),
			"postDrawStateCaptured": bool(
				probe.get("postDrawStateCaptured", false)
			),
			"sameLoopDelivered": bool(
				probe.get("sameLoopDelivered", false)
			),
			"nextLoopDelivered": bool(
				probe.get("nextLoopDelivered", false)
			),
			"sameLoopProcessFrame": int(
				probe.get("sameLoopProcessFrame", -1)
			),
			"nextLoopProcessFrame": int(
				probe.get("nextLoopProcessFrame", -1)
			),
			"sameLoopGuiLeftButtonEventCount": int(
				probe.get("sameLoopGuiLeftButtonEventCount", -1)
			),
			"sameLoopGuiLeftButtonPressCount": int(
				probe.get("sameLoopGuiLeftButtonPressCount", -1)
			),
			"sameLoopGuiLeftButtonReleaseCount": int(
				probe.get("sameLoopGuiLeftButtonReleaseCount", -1)
			),
			"nextLoopGuiLeftButtonEventCount": int(
				probe.get("nextLoopGuiLeftButtonEventCount", -1)
			),
			"nextLoopGuiLeftButtonPressCount": int(
				probe.get("nextLoopGuiLeftButtonPressCount", -1)
			),
			"nextLoopGuiLeftButtonReleaseCount": int(
				probe.get("nextLoopGuiLeftButtonReleaseCount", -1)
			),
			"guiLeftButtonEvents": (
				probe.get("guiLeftButtonEvents", []) as Array
			).duplicate(true),
			"mouseEnteredCount": int(probe.get("mouseEnteredCount", 0)),
			"mouseExitedCount": int(probe.get("mouseExitedCount", 0)),
			"routeStages": (
				probe.get("routeStages", []) as Array
			).duplicate(true),
			"observerSignalsDisconnected": bool(
				probe.get("observerSignalsDisconnected", false)
			),
			"releaseRoutingClassification": (
				_attack_input_release_routing_classification(probe)
			),
			"unexpectedViewCommand": str(
				probe.get("unexpectedViewCommand", "")
			),
			"downState": probe.get("downState", {}),
			"releaseState": probe.get("releaseState", {}),
			"pressedState": probe.get("pressedState", {}),
			"viewState": probe.get("viewState", {}),
			"clickViewportPoint": probe.get("viewportPoint", []),
			"clickScreenTransform": probe.get("screenTransform", []),
			"clickInputPosition": probe.get("inputPosition", []),
			"targetPath": str(probe.get("targetPath", "")),
			"targetInstanceId": int(probe.get("targetInstanceId", 0)),
			"hoveredPath": str(probe.get("hoveredPath", "")),
			"hoveredInstanceId": int(probe.get("hoveredInstanceId", 0)),
			"hoveredMouseFilter": int(probe.get("hoveredMouseFilter", -1)),
			"hoveredZIndex": int(probe.get("hoveredZIndex", 0)),
			"hoverMatchesTarget": bool(
				probe.get("hoverMatchesTarget", false)
			),
			"clickUiPoint": bool(probe.get("uiPoint", false)),
			"clickBattlePanelPoint": bool(
				probe.get("battlePanelPoint", false)
			),
		},
		true
	)
	return result


func _attack_input_state_snapshot(
	button: Control,
	stage: String
) -> Dictionary:
	var battle_state_value = _host_property("battle_state")
	var state := (
		battle_state_value as Dictionary
		if battle_state_value is Dictionary
		else {}
	)
	var pending_value = _host_property("battle_pending_player_command")
	var pending := (
		(pending_value as Dictionary).duplicate(true)
		if pending_value is Dictionary
		else {}
	)
	var event_queue_value = _host_property("battle_event_queue")
	var event_queue_count := (
		(event_queue_value as Array).size()
		if event_queue_value is Array
		else -1
	)
	var action_timer := float(_host_property("battle_action_timer"))
	var active := bool(_host_property("battle_active"))
	var enemy_pending := bool(
		_host_property("battle_enemy_response_pending")
	)
	var end_pending := bool(_host_property("battle_end_pending"))
	var phase := str(state.get("phase", ""))
	var locked := (
		not active
		or action_timer > 0.0
		or event_queue_count != 0
		or enemy_pending
		or end_pending
		or phase != "command"
	)
	var view_buttons_value = (_view as Object).call("command_buttons")
	var view_buttons := (
		view_buttons_value as Dictionary
		if view_buttons_value is Dictionary
		else {}
	)
	var host_buttons_value = _host_property("battle_command_buttons")
	var host_buttons := (
		host_buttons_value as Dictionary
		if host_buttons_value is Dictionary
		else {}
	)
	var view_attack = view_buttons.get("attack", null)
	var host_attack = host_buttons.get("attack", null)
	var visible_attack = (_view as Object).call(
		"visible_button_with_label",
		"攻击"
	)
	var button_identity_exact: bool = (
		button != null
		and is_instance_valid(button)
		and visible_attack == button
		and view_attack == button
		and host_attack == button
	)
	var button_rect := (
		button.get_global_rect()
		if button != null and is_instance_valid(button)
		else Rect2()
	)
	var viewport_point := button_rect.get_center()
	var viewport: Viewport = host.get_viewport() as Viewport
	if viewport == null:
		_fail_capture("攻击点击状态无法取得Viewport")
		return {}
	var screen_transform: Transform2D = viewport.get_screen_transform()
	var living_enemy_count := 0
	for actor_value in state.get("actors", []):
		if not (actor_value is Dictionary):
			continue
		var actor := actor_value as Dictionary
		if (
			str(actor.get("side", "")) == BattleModel.SIDE_ENEMY
			and int(actor.get("hp", 0)) > 0
		):
			living_enemy_count += 1
	return {
		"stage": stage,
		"active": active,
		"owner": str(_host_property("battle_command_owner")),
		"mode": str(_host_property("battle_target_mode")),
		"selected": str(_host_property("battle_selected_target_id")),
		"pending": pending,
		"phase": phase,
		"locked": locked,
		"actionTimer": action_timer,
		"eventQueueCount": event_queue_count,
		"enemyPending": enemy_pending,
		"endPending": end_pending,
		"livingEnemyId": BattleModel.living_enemy_id(state),
		"livingEnemyCount": living_enemy_count,
		"buttonPath": _control_path(button),
		"buttonInstanceId": _control_instance_id(button),
		"buttonGlobalRect": _rect_payload(button_rect),
		"buttonDisabled": (
			(button as BaseButton).disabled if button is BaseButton else true
		),
		"buttonVisible": (
			button.is_visible_in_tree()
			if button != null and is_instance_valid(button)
			else false
		),
		"buttonInsideTree": (
			button.is_inside_tree()
			if button != null and is_instance_valid(button)
			else false
		),
		"viewAttackInstanceId": (
			int((view_attack as Object).get_instance_id())
			if view_attack is Object and is_instance_valid(view_attack)
			else 0
		),
		"visibleAttackInstanceId": (
			int((visible_attack as Object).get_instance_id())
			if visible_attack is Object and is_instance_valid(visible_attack)
			else 0
		),
		"hostAttackInstanceId": (
			int((host_attack as Object).get_instance_id())
			if host_attack is Object and is_instance_valid(host_attack)
			else 0
		),
		"buttonIdentityExact": button_identity_exact,
		"viewportPoint": _vector_payload(viewport_point),
		"screenTransform": _transform_payload(screen_transform),
		"inputPosition": _vector_payload(screen_transform * viewport_point),
	}


func _attack_input_state_snapshot_with_point_classification(
	button: Control,
	stage: String
) -> Dictionary:
	var snapshot := _attack_input_state_snapshot(button, stage)
	var viewport_values := snapshot.get("viewportPoint", []) as Array
	var viewport_point := Vector2(
		float(viewport_values[0]),
		float(viewport_values[1])
	) if viewport_values.size() == 2 else Vector2(-1.0, -1.0)
	snapshot["uiPoint"] = bool(host.call("_is_ui_point", viewport_point))
	snapshot["battlePanelPoint"] = bool(
		host.call("_battle_point_overlaps_panel", viewport_point)
	)
	return snapshot


func _attack_input_common_state_ok(snapshot: Dictionary) -> bool:
	return (
		bool(snapshot.get("active", false))
		and str(snapshot.get("owner", "")) == "player"
		and str(snapshot.get("selected", "")) == ""
		and snapshot.get("pending", null) is Dictionary
		and (snapshot.get("pending", {}) as Dictionary).is_empty()
		and str(snapshot.get("phase", "")) == "command"
		and not bool(snapshot.get("locked", true))
		and is_zero_approx(float(snapshot.get("actionTimer", -1.0)))
		and int(snapshot.get("eventQueueCount", -1)) == 0
		and not bool(snapshot.get("enemyPending", true))
		and not bool(snapshot.get("endPending", true))
		and str(snapshot.get("livingEnemyId", "")) != ""
		and int(snapshot.get("livingEnemyCount", 0)) > 0
		and bool(snapshot.get("buttonIdentityExact", false))
		and bool(snapshot.get("buttonInsideTree", false))
		and bool(snapshot.get("buttonVisible", false))
		and not bool(snapshot.get("buttonDisabled", true))
		and int(snapshot.get("buttonInstanceId", 0)) > 0
		and int(snapshot.get("buttonInstanceId", 0))
		== int(snapshot.get("visibleAttackInstanceId", -1))
		and int(snapshot.get("buttonInstanceId", 0))
		== int(snapshot.get("viewAttackInstanceId", -1))
		and int(snapshot.get("buttonInstanceId", 0))
		== int(snapshot.get("hostAttackInstanceId", -1))
	)


func _attack_input_precondition_ok(snapshot: Dictionary) -> bool:
	return (
		_attack_input_common_state_ok(snapshot)
		and str(snapshot.get("mode", "")) == "enemy"
		and bool(snapshot.get("battlePanelPoint", false))
		and bool(snapshot.get("productChainExactBefore", false))
		and bool(snapshot.get("productConnectionsNonDeferred", false))
		and bool(snapshot.get("spiesInstalled", false))
	)


func _attack_input_postcondition_ok(snapshot: Dictionary) -> bool:
	return (
		_attack_input_common_state_ok(snapshot)
		and str(snapshot.get("mode", "")) == "player_attack_target"
	)


func _attack_input_release_routing_classification(probe: Dictionary) -> String:
	var gui_events := probe.get("guiLeftButtonEvents", []) as Array
	var routed_press := false
	var routed_release := false
	for raw_event in gui_events:
		if not (raw_event is Dictionary):
			continue
		var event := raw_event as Dictionary
		if int(event.get("buttonIndex", 0)) != MOUSE_BUTTON_LEFT:
			continue
		if bool(event.get("pressed", false)):
			routed_press = true
		else:
			routed_release = true
	var press_stage := {}
	var pre_release_stage := {}
	for raw_stage in probe.get("routeStages", []):
		if not (raw_stage is Dictionary):
			continue
		var stage := raw_stage as Dictionary
		match str(stage.get("stage", "")):
			"press_sync":
				press_stage = stage
			"pre_release":
				pre_release_stage = stage
	var capture_lost: bool = (
		press_stage.is_empty()
		or pre_release_stage.is_empty()
		or int(pre_release_stage.get("buttonInstanceId", 0))
		!= int(press_stage.get("buttonInstanceId", -1))
		or str(pre_release_stage.get("buttonPath", ""))
		!= str(press_stage.get("buttonPath", ""))
		or int(pre_release_stage.get("buttonParentInstanceId", 0))
		!= int(press_stage.get("buttonParentInstanceId", -1))
		or str(pre_release_stage.get("buttonParentPath", ""))
		!= str(press_stage.get("buttonParentPath", ""))
		or pre_release_stage.get("buttonGlobalRect", [])
		!= press_stage.get("buttonGlobalRect", [])
		or not bool(pre_release_stage.get("buttonVisible", false))
		or bool(pre_release_stage.get("buttonDisabled", true))
		or not bool(pre_release_stage.get("buttonIsHovered", false))
		or not bool(
			pre_release_stage.get("viewportHoveredMatchesButton", false)
		)
		or not bool(pre_release_stage.get("inputLeftPressed", false))
	)
	if capture_lost:
		return "capture_lost_before_release"
	if not routed_press:
		return "press_not_routed"
	if not routed_release:
		return "release_not_routed"
	if int(probe.get("upCount", 0)) == 0:
		return "release_routed_but_basebutton_not_up"
	return "release_routed_and_button_up"


func _attack_input_classification(
	probe: Dictionary,
	after: Dictionary
) -> String:
	if not bool(probe.get("productChainExactBefore", false)):
		return "product_chain_invalid"
	if not bool(probe.get("hoverMatchesTarget", false)):
		return "hover_miss"
	var down_count := int(probe.get("downCount", 0))
	var up_count := int(probe.get("upCount", 0))
	var pressed_count := int(probe.get("pressedCount", 0))
	var view_count := int(probe.get("viewAttackCount", 0))
	if down_count == 0:
		return "no_down"
	if up_count == 0:
		return "down_without_up"
	if pressed_count == 0:
		return "up_without_pressed"
	if view_count == 0:
		return "pressed_without_view"
	if (
		down_count != 1
		or up_count != 1
		or pressed_count != 1
		or view_count != 1
	):
		return "signal_count_invalid"
	if (
		not bool(probe.get("postDrawBoundaryReached", false))
		or not bool(probe.get("nextLoopPostDrawBoundaryReached", false))
		or not bool(probe.get("postDrawStateCaptured", false))
	):
		return "post_draw_boundary_missing"
	if not bool(probe.get("nextLoopDelivered", false)):
		return "next_loop_delivery_incomplete"
	if not _attack_input_postcondition_ok(
		probe.get("viewState", {}) as Dictionary
	):
		return "view_without_mode"
	if not _attack_input_postcondition_ok(after):
		return "mode_then_polluted"
	return "ok"


func _left_click_control(
	control: Control,
	label: String,
	input_probe: Dictionary = {}
) -> void:
	var perf_qa_started_usec := Time.get_ticks_usec()
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		_fail_capture("%s不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	if not bool(host.call("_battle_point_overlaps_panel", viewport_point)):
		_fail_capture("%s没有落在正式HUD输入阻挡区" % label)
		return
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	await _left_click_point(viewport_point, label, true, input_probe, control)


func _left_click_point(
	viewport_point: Vector2,
	label: String,
	expect_hud: bool,
	input_probe: Dictionary = {},
	target_control: Control = null
) -> void:
	var perf_qa_started_usec := Time.get_ticks_usec()
	var viewport: Viewport = host.get_viewport() as Viewport
	if viewport == null:
		_fail_capture("%s无法取得Viewport" % label)
		return
	if not viewport.get_visible_rect().has_point(viewport_point):
		_fail_capture("%s不在1280×720可点击区域内" % label)
		return
	if bool(host.call("_battle_point_overlaps_panel", viewport_point)) != expect_hud:
		_fail_capture("%s的HUD命中分类不符合预期" % label)
		return
	var screen_transform: Transform2D = viewport.get_screen_transform()
	var input_position: Vector2 = screen_transform * viewport_point
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	var input_parse_started_usec := Time.get_ticks_usec()
	Input.parse_input_event(motion)
	_record_perf_input_dispatch_wall("motion", input_parse_started_usec)
	await host.get_tree().process_frame
	perf_qa_started_usec = Time.get_ticks_usec()
	if not input_probe.is_empty():
		var hovered := viewport.gui_get_hovered_control() as Control
		var hover_matches := _hovered_control_matches_target(
			hovered,
			target_control
		)
		input_probe["viewportPoint"] = _vector_payload(viewport_point)
		input_probe["screenTransform"] = _transform_payload(screen_transform)
		input_probe["inputPosition"] = _vector_payload(input_position)
		input_probe["targetPath"] = _control_path(target_control)
		input_probe["targetInstanceId"] = _control_instance_id(target_control)
		input_probe["hoveredPath"] = _control_path(hovered)
		input_probe["hoveredInstanceId"] = _control_instance_id(hovered)
		input_probe["hoveredMouseFilter"] = (
			hovered.mouse_filter if hovered != null else -1
		)
		input_probe["hoveredZIndex"] = hovered.z_index if hovered != null else 0
		input_probe["hoverMatchesTarget"] = hover_matches
		input_probe["uiPoint"] = bool(host.call("_is_ui_point", viewport_point))
		input_probe["battlePanelPoint"] = bool(
			host.call("_battle_point_overlaps_panel", viewport_point)
		)
		if not hover_matches:
			_fail_capture(
				"%s hover_miss target=%s hovered=%s viewport=%s input=%s"
				% [
					label,
					_control_path(target_control),
					_control_path(hovered),
					str(viewport_point),
					str(input_position),
				]
			)
			return
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
	press.position = input_position
	press.global_position = input_position
	var press_frame := Engine.get_process_frames()
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	input_parse_started_usec = Time.get_ticks_usec()
	Input.parse_input_event(press)
	_record_perf_input_dispatch_wall("press", input_parse_started_usec)
	_capture_attack_input_route_stage(
		input_probe,
		target_control,
		"press_sync"
	)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame
	perf_qa_started_usec = Time.get_ticks_usec()
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	_capture_attack_input_route_stage(
		input_probe,
		target_control,
		"pre_release"
	)
	_record_perf_qa_sync_wall(perf_qa_started_usec)
	input_parse_started_usec = Time.get_ticks_usec()
	Input.parse_input_event(release)
	_record_perf_input_dispatch_wall("release", input_parse_started_usec)
	_capture_attack_input_route_stage(
		input_probe,
		target_control,
		"release_sync"
	)
	await host.get_tree().process_frame
	_capture_attack_input_route_stage(
		input_probe,
		target_control,
		"release_process"
	)
	await RenderingServer.frame_post_draw
	if not input_probe.is_empty():
		input_probe["postDrawBoundaryReached"] = true
	_capture_attack_input_route_stage(
		input_probe,
		target_control,
		"release_post_draw"
	)
	await host.get_tree().process_frame
	await RenderingServer.frame_post_draw
	if not input_probe.is_empty():
		input_probe["nextLoopPostDrawBoundaryReached"] = true
	_capture_attack_input_route_stage(
		input_probe,
		target_control,
		"release_next_loop_post_draw"
	)
	perf_qa_started_usec = Time.get_ticks_usec()
	_actual_left_clicks += 1
	if release_frame <= press_frame:
		_fail_capture("%s的左键按下与释放没有跨帧" % label)
		return
	_cross_frame_presses += 1
	if int(_host_property("click_move_input_accept_count")) != _world_click_accept_start:
		_fail_capture("%s穿透战斗HUD/actor并触发世界移动" % label)
	_record_perf_qa_sync_wall(perf_qa_started_usec)


func _assert_final_interaction_contract(expected_clicks: int, expected_targets: int) -> bool:
	var leaks := (
		int(_host_property("click_move_input_accept_count"))
		- _world_click_accept_start
	)
	if (
		_actual_left_clicks != expected_clicks
		or _cross_frame_presses != expected_clicks
		or _exact_target_hits != expected_targets
		or leaks != 0
		or not is_equal_approx(_target_anchor_distance(), 80.0)
	):
		_fail_capture(
			"真实输入闭包失败：clicks=%d cross=%d targets=%d leaks=%d distance=%.2f"
			% [
				_actual_left_clicks,
				_cross_frame_presses,
				_exact_target_hits,
				leaks,
				_target_anchor_distance(),
			]
		)
		return false
	return true


func _actual_top_or_message_rect_overlaps(envelope: Rect2) -> bool:
	for property_name in [
		"battle_round_panel",
		"battle_timer_panel",
		"battle_message_panel",
	]:
		var control = _host_property(property_name)
		if (
			control is Control
			and (control as Control).is_visible_in_tree()
			and (control as Control).get_global_rect().grow(8.0).intersects(envelope)
		):
			return true
	return false


func _mounted_player_actor_count(state: Dictionary) -> int:
	var count := 0
	for value in state.get("actors", []):
		if not (value is Dictionary):
			continue
		var actor := value as Dictionary
		if (
			str(actor.get("kind", "")) == "player"
			and str(actor.get("ridePetFormId", "")).strip_edges() != ""
		):
			count += 1
	return count


func _assert_isolated_transport_idle() -> bool:
	if bool(_host_property("profile_save_enabled")):
		_fail_capture("隔离验收意外恢复档案写入")
		return false
	var session = _host_property("current_account_session")
	if (
		not (session is Dictionary)
		or str((session as Dictionary).get("authSource", "")) == "server"
	):
		_fail_capture("隔离验收意外使用服务器登录态")
		return false
	for value in host.find_children("*", "HTTPRequest", true, false):
		if (
			value is HTTPRequest
			and (value as HTTPRequest).get_http_client_status()
			!= HTTPClient.STATUS_DISCONNECTED
		):
			_fail_capture("隔离验收结束时仍存在HTTP请求")
			return false
	return true


func _release_capture_audio_runtime() -> void:
	var audio_manager = _host_property("game_audio_manager")
	if audio_manager == null or not is_instance_valid(audio_manager):
		_fail_capture("真实Main缺少音频管理器")
		return
	if not audio_manager.has_method("stop_all"):
		_fail_capture("音频管理器缺少停止全部播放API")
		return
	audio_manager.call("stop_all")
	for value in (audio_manager as Node).find_children(
		"*", "AudioStreamPlayer", true, false
	):
		if value is AudioStreamPlayer:
			(value as AudioStreamPlayer).stop()
			(value as AudioStreamPlayer).stream = null
	await _settle_frames(8)


func _read_json_dictionary(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}


func _normalized_frame_size(value) -> Vector2i:
	if not (value is Array):
		return INVALID_FRAME_SIZE
	var values := value as Array
	if values.size() != 2:
		return INVALID_FRAME_SIZE
	var normalized: Array[int] = []
	for raw_value in values:
		if not (raw_value is int or raw_value is float):
			return INVALID_FRAME_SIZE
		var numeric_value := float(raw_value)
		if (
			not is_finite(numeric_value)
			or numeric_value <= 0.0
			or not is_equal_approx(numeric_value, roundf(numeric_value))
		):
			return INVALID_FRAME_SIZE
		normalized.append(int(numeric_value))
	return Vector2i(normalized[0], normalized[1])


func _rect_equal(left: Rect2, right: Rect2, tolerance: float = 0.5) -> bool:
	return (
		left.position.distance_to(right.position) <= tolerance
		and left.size.distance_to(right.size) <= tolerance
	)


func _visible_tree_has_forbidden_review_text() -> bool:
	var needles := ["qa", "调试", "验收", "phase403", "owner review"]
	for type_name in ["Label", "RichTextLabel", "Button"]:
		for value in host.find_children("*", type_name, true, false):
			if not (value is CanvasItem) or not (value as CanvasItem).is_visible_in_tree():
				continue
			var text_value := ""
			if value is Label:
				text_value = (value as Label).text.to_lower()
			elif value is RichTextLabel:
				text_value = (value as RichTextLabel).get_parsed_text().to_lower()
			elif value is Button:
				text_value = (value as Button).text.to_lower()
			for needle in needles:
				if text_value.contains(needle):
					return true
	return false


func _cache_host_property_names() -> bool:
	if host == null or not is_instance_valid(host):
		_fail_capture("无法为无效Main建立属性缓存")
		return false
	if _host_property_cache_ready:
		return true
	var property_names: Dictionary = {}
	for raw_property in host.get_property_list():
		if not (raw_property is Dictionary):
			continue
		var property_name := str((raw_property as Dictionary).get("name", ""))
		if property_name != "":
			property_names[property_name] = true
	if property_names.is_empty():
		_fail_capture("真实Main属性缓存为空")
		return false
	_host_property_names = property_names
	_host_property_cache_ready = true
	return true


func _perf_environment_snapshot(stage: String) -> Dictionary:
	var screen_index: int = DisplayServer.window_get_current_screen()
	var window_size: Vector2i = DisplayServer.window_get_size()
	var screen_refresh_hz: float = DisplayServer.screen_get_refresh_rate(
		screen_index
	)
	return {
		"stage": stage,
		"snapshotScope": "start_end_only",
		"displayServer": DisplayServer.get_name(),
		"vsyncMode": int(DisplayServer.window_get_vsync_mode()),
		"windowFocused": DisplayServer.window_is_focused(),
		"windowMode": int(DisplayServer.window_get_mode()),
		"windowSize": [window_size.x, window_size.y],
		"screenIndex": screen_index,
		"screenRefreshHz": screen_refresh_hz,
		"screenRefreshKnown": screen_refresh_hz > 0.0,
		"maxFps": Engine.max_fps,
		"physicsTicksPerSecond": Engine.physics_ticks_per_second,
		"timeScale": Engine.time_scale,
		"renderingMethod": RenderingServer.get_current_rendering_method(),
		"renderingDriver": RenderingServer.get_current_rendering_driver_name(),
		"videoAdapter": RenderingServer.get_video_adapter_name(),
		"hostPropertyCacheReady": _host_property_cache_ready,
	}


func _print_perf_environment(stage: String) -> bool:
	var snapshot := _perf_environment_snapshot(stage)
	print("%s %s" % [PERF_ENVIRONMENT_MARKER, JSON.stringify(snapshot)])
	var window_size_value = snapshot.get("windowSize", [])
	var window_size := Vector2i(-1, -1)
	if window_size_value is Array and (window_size_value as Array).size() == 2:
		window_size = Vector2i(
			int((window_size_value as Array)[0]),
			int((window_size_value as Array)[1])
		)
	var refresh_hz := float(snapshot.get("screenRefreshHz", -1.0))
	if (
		str(snapshot.get("displayServer", "")).to_lower() != "macos"
		or int(snapshot.get("vsyncMode", -1)) != DisplayServer.VSYNC_ENABLED
		or not bool(snapshot.get("windowFocused", false))
		or int(snapshot.get("windowMode", -1))
		!= DisplayServer.WINDOW_MODE_WINDOWED
		or window_size != EXPECTED_VIEWPORT
		or not is_finite(refresh_hz)
		or bool(snapshot.get("screenRefreshKnown", false))
		!= (refresh_hz > 0.0)
		or int(snapshot.get("maxFps", 0)) != 60
		or int(snapshot.get("physicsTicksPerSecond", 0)) != 60
		or not is_equal_approx(float(snapshot.get("timeScale", 0.0)), 1.0)
		or str(snapshot.get("renderingMethod", "")) != "mobile"
		or str(snapshot.get("renderingDriver", "")).to_lower() != "metal"
		or str(snapshot.get("videoAdapter", "")).strip_edges() == ""
		or not bool(snapshot.get("hostPropertyCacheReady", false))
	):
		_fail_capture(
			"性能窗口运行环境不是聚焦macOS/Metal Mobile/VSync/60FPS：%s"
			% JSON.stringify(snapshot)
		)
		return false
	return true


func _begin_perf_frame_sampling(state: String) -> bool:
	if _perf_sample_state != "" or _perf_sampler_connected:
		_fail_capture("逐帧性能采样窗口发生嵌套：%s" % state)
		return false
	_perf_sample_state = state
	_perf_sample_started_usec = Time.get_ticks_usec()
	_perf_sample_started_frame = Engine.get_process_frames()
	_perf_sample_count = 0
	_perf_sample_previous_frame = -1
	_perf_sample_previous_usec = -1
	_perf_sample_dropped = 0
	_perf_sample_monotonic = true
	_perf_frame_pairs = PackedInt64Array()
	_perf_frame_pairs.resize(PERF_FRAME_SAMPLE_LIMIT * 2)
	var sampler := Callable(self, "_capture_perf_process_frame")
	if host.get_tree().process_frame.is_connected(sampler):
		_fail_capture("逐帧性能采样回调在窗口前已连接")
		return false
	host.get_tree().process_frame.connect(sampler)
	_perf_sampler_connected = true
	return true


func _capture_perf_process_frame() -> void:
	if _perf_sample_state == "":
		return
	var process_frame: int = Engine.get_process_frames()
	var ticks_usec: int = Time.get_ticks_usec()
	if (
		_perf_sample_previous_frame >= 0
		and (
			process_frame <= _perf_sample_previous_frame
			or ticks_usec <= _perf_sample_previous_usec
		)
	):
		_perf_sample_monotonic = false
	if _perf_sample_count < PERF_FRAME_SAMPLE_LIMIT:
		var pair_index: int = _perf_sample_count * 2
		_perf_frame_pairs[pair_index] = process_frame
		_perf_frame_pairs[pair_index + 1] = ticks_usec
		_perf_sample_count += 1
	else:
		_perf_sample_dropped += 1
	_perf_sample_previous_frame = process_frame
	_perf_sample_previous_usec = ticks_usec


func _disconnect_perf_frame_sampler() -> bool:
	var sampler := Callable(self, "_capture_perf_process_frame")
	var disconnected := true
	if host != null and is_instance_valid(host):
		var tree := host.get_tree()
		if tree != null and tree.process_frame.is_connected(sampler):
			tree.process_frame.disconnect(sampler)
		if tree != null and tree.process_frame.is_connected(sampler):
			disconnected = false
	_perf_sampler_connected = false
	return disconnected


func _end_perf_frame_sampling(state: String) -> bool:
	var disconnected := _disconnect_perf_frame_sampler()
	var ended_usec: int = Time.get_ticks_usec()
	var ended_frame: int = Engine.get_process_frames()
	var pair_values: Array[int] = []
	for pair_index in range(_perf_sample_count * 2):
		pair_values.append(int(_perf_frame_pairs[pair_index]))
	var sample_count: int = _perf_sample_count
	var duration_usec := ended_usec - _perf_sample_started_usec
	var payload := {
		"state": state,
		"clock": "Time.get_ticks_usec",
		"sampleLimit": PERF_FRAME_SAMPLE_LIMIT,
		"sampleCount": sample_count,
		"droppedCount": _perf_sample_dropped,
		"startedUsec": _perf_sample_started_usec,
		"endedUsec": ended_usec,
		"durationUsec": duration_usec,
		"startedFrame": _perf_sample_started_frame,
		"endedFrame": ended_frame,
		"monotonic": _perf_sample_monotonic,
		"samplerDisconnected": disconnected,
		"pairs": pair_values,
	}
	print("%s %s" % [PERF_RAW_FRAME_MARKER, JSON.stringify(payload)])
	var state_matches := _perf_sample_state == state
	_perf_sample_state = ""
	if (
		not state_matches
		or not disconnected
		or not _perf_sample_monotonic
		or _perf_sample_dropped != 0
		or sample_count < 2
		or duration_usec < int((PERF_STATE_SECONDS - 0.05) * 1000000.0)
		or duration_usec > int((PERF_STATE_SECONDS + 1.8) * 1000000.0)
	):
		_fail_capture("逐帧性能采样不完整：%s" % JSON.stringify(payload))
		return false
	return true


func _reset_perf_segments() -> void:
	_perf_qa_sync_wall_usec = 0
	_perf_qa_sample_count = 0
	_perf_input_dispatch_wall_usec = {"motion": 0, "press": 0, "release": 0}
	_perf_input_dispatch_counts = {"motion": 0, "press": 0, "release": 0}
	_perf_operation_boundary_usec = {}
	_perf_operation_sample_counts = {"target": 0, "recall": 0, "attack": 0}
	for kind in ["target", "recall", "attack"]:
		var boundaries := PackedInt64Array()
		boundaries.resize(PERF_TARGET_SWITCH_COUNT * 2)
		_perf_operation_boundary_usec[kind] = boundaries
	_perf_target_marker_lines.clear()
	_perf_target_marker_lines.resize(PERF_TARGET_SWITCH_COUNT)


func _record_perf_qa_sync_wall(started_usec: int) -> void:
	if _perf_sample_state != "target_switch":
		return
	_perf_qa_sync_wall_usec += maxi(0, Time.get_ticks_usec() - started_usec)
	_perf_qa_sample_count += 1


func _record_perf_input_dispatch_wall(kind: String, started_usec: int) -> void:
	if _perf_sample_state != "target_switch":
		return
	_perf_input_dispatch_wall_usec[kind] = (
		int(_perf_input_dispatch_wall_usec.get(kind, 0))
		+ maxi(0, Time.get_ticks_usec() - started_usec)
	)
	_perf_input_dispatch_counts[kind] = int(
		_perf_input_dispatch_counts.get(kind, 0)
	) + 1


func _record_perf_operation_wall(kind: String, started_usec: int) -> void:
	if _perf_sample_state != "target_switch":
		return
	var ended_usec: int = Time.get_ticks_usec()
	var sample_index := int(_perf_operation_sample_counts.get(kind, -1))
	if sample_index < 0 or sample_index >= PERF_TARGET_SWITCH_COUNT:
		_fail_capture("性能分段边界数量越界：%s/%d" % [kind, sample_index])
		return
	var boundaries := (
		_perf_operation_boundary_usec.get(kind, PackedInt64Array())
		as PackedInt64Array
	)
	boundaries[sample_index * 2] = started_usec
	boundaries[sample_index * 2 + 1] = ended_usec
	_perf_operation_boundary_usec[kind] = boundaries
	_perf_operation_sample_counts[kind] = sample_index + 1


func _packed_ints_as_array(value) -> Array[int]:
	var result: Array[int] = []
	if value is PackedInt64Array:
		for raw_value in (value as PackedInt64Array):
			result.append(int(raw_value))
	return result


func _operation_wall_samples(boundaries: Array[int]) -> Array[int]:
	var result: Array[int] = []
	for pair_index in range(0, boundaries.size(), 2):
		result.append(boundaries[pair_index + 1] - boundaries[pair_index])
	return result


func _print_perf_target_markers(completed_switches: int) -> bool:
	if (
		completed_switches != PERF_TARGET_SWITCH_COUNT
		or _perf_target_marker_lines.size() != PERF_TARGET_SWITCH_COUNT
	):
		_fail_capture("性能目标marker缓存数量不完整")
		return false
	for marker_line in _perf_target_marker_lines:
		if marker_line == "":
			_fail_capture("性能目标marker缓存存在空项")
			return false
		print(marker_line)
	return true


func _print_perf_segments(completed_switches: int) -> bool:
	var target_boundaries := _packed_ints_as_array(
		_perf_operation_boundary_usec.get("target", PackedInt64Array())
	)
	var recall_boundaries := _packed_ints_as_array(
		_perf_operation_boundary_usec.get("recall", PackedInt64Array())
	)
	var attack_boundaries := _packed_ints_as_array(
		_perf_operation_boundary_usec.get("attack", PackedInt64Array())
	)
	var target_wall := _operation_wall_samples(target_boundaries)
	var recall_wall := _operation_wall_samples(recall_boundaries)
	var attack_wall := _operation_wall_samples(attack_boundaries)
	var input_event_count := 0
	for raw_count in _perf_input_dispatch_counts.values():
		input_event_count += int(raw_count)
	var payload := {
		"state": "target_switch",
		"clock": "Time.get_ticks_usec",
		"switchCount": completed_switches,
		"realLeftClickCount": completed_switches * 3,
		"qaSyncWallUsec": _perf_qa_sync_wall_usec,
		"qaSyncSampleCount": _perf_qa_sample_count,
		"qaCoverage": "instrumented_sync_sections_only",
		"inputDispatchWallUsec": _perf_input_dispatch_wall_usec.duplicate(true),
		"inputDispatchEventCounts": _perf_input_dispatch_counts.duplicate(true),
		"inputDispatchEventCount": input_event_count,
		"operationWallUsec": {
			"target": target_wall,
			"recall": recall_wall,
			"attack": attack_wall,
		},
		"operationBoundaryUsec": {
			"target": target_boundaries,
			"recall": recall_boundaries,
			"attack": attack_boundaries,
		},
		"operationBoundaryClockAbsolute": true,
		"operationWallIncludesFrameWaits": true,
		"targetMarkersBufferedUntilAfterRaw": true,
		"layoutTimingAvailable": false,
		"layoutTimingUnavailableReason": "product_not_instrumented",
	}
	print("%s %s" % [PERF_SEGMENTS_MARKER, JSON.stringify(payload)])
	var expected_clicks := completed_switches * 3
	if (
		completed_switches != PERF_TARGET_SWITCH_COUNT
		or target_wall.size() != completed_switches
		or recall_wall.size() != completed_switches
		or attack_wall.size() != completed_switches
		or int(_perf_operation_sample_counts.get("target", 0))
		!= completed_switches
		or int(_perf_operation_sample_counts.get("recall", 0))
		!= completed_switches
		or int(_perf_operation_sample_counts.get("attack", 0))
		!= completed_switches
		or target_boundaries.size() != completed_switches * 2
		or recall_boundaries.size() != completed_switches * 2
		or attack_boundaries.size() != completed_switches * 2
		or int(_perf_input_dispatch_counts.get("motion", 0)) != expected_clicks
		or int(_perf_input_dispatch_counts.get("press", 0)) != expected_clicks
		or int(_perf_input_dispatch_counts.get("release", 0)) != expected_clicks
		or input_event_count != expected_clicks * 3
		or _perf_qa_sample_count != PERF_TARGET_SWITCH_COUNT * 20
	):
		_fail_capture("性能分段观测不完整：%s" % JSON.stringify(payload))
		return false
	return true


func _host_property(property_name: String):
	if host == null or not _host_property_cache_ready:
		return null
	return host.get(property_name) if _host_property_names.has(property_name) else null


func _set_host_property(property_name: String, value) -> void:
	if host == null or not _host_property_cache_ready:
		return
	if _host_property_names.has(property_name):
		host.set(property_name, value)


func _settle_frames(frame_count: int) -> void:
	for _frame in range(maxi(0, frame_count)):
		await host.get_tree().process_frame


func _hold_chapter(chapter_id: String) -> void:
	var seconds := float(CHAPTERS.get(chapter_id, 0.0))
	if seconds <= 0.0:
		_fail_capture("未知录像章节：%s" % chapter_id)
		return
	print(
		(
			"PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x movie_frame=%d"
		) % [
			chapter_id,
			int(round(seconds * REVIEW_FPS)),
			seconds,
			Engine.get_process_frames(),
		]
	)
	await host.get_tree().create_timer(seconds).timeout


func _perf_click_pause() -> void:
	await host.get_tree().create_timer(PERF_CLICK_PAUSE_SECONDS).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	_disconnect_perf_frame_sampler()
	var marker := (
		"PHASE403_BATTLE_LAYOUT_PERF_FAILED"
		if PERF_CAPTURE_FLAG in OS.get_cmdline_user_args()
		else "PHASE403_BATTLE_LAYOUT_OWNER_REVIEW_FAILED"
	)
	print("%s reason=%s" % [marker, message])
	push_error("Phase403 battle layout evidence failed: %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().call_deferred("quit", 1)
