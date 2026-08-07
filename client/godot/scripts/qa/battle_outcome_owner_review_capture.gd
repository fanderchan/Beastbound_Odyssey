extends SceneTree

const MAIN_SCENE := preload("res://scenes/Main.tscn")
const BattleOutcomePresentationModel := preload(
	"res://scripts/ui/battle_outcome_presentation_model.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const REVIEW_FPS := 30
const VIEWPORT_SIZE := Vector2i(1280, 720)
const ACCOUNT_ID := "phase393_battle_outcome_owner_review"
const OUTCOME_ID := (
	"phase393_battle_outcome_owner_review_record:"
	+ "phase393_battle_outcome_owner_review"
)
const WORLD_MAP_ID := "firebud_village_gate"
const WORLD_SPAWN_NAME := "from_training_yard"

const CHAPTER_WORLD_SECONDS := 2.0
const CHAPTER_INTRO_SECONDS := 1.0
const CHAPTER_QUEUE_SECONDS := 4.5
const CHAPTER_SETTLED_SECONDS := 2.0

var _host
var _panel_flow
var _failed := false
var _started_msec := 0
var _profile_before: Dictionary = {}
var _expected_row_count := 0
var _seen_row_texts: Dictionary = {}
var _row_min_y: Dictionary = {}
var _row_max_y: Dictionary = {}
var _overlay_visible_seen := false
var _fade_seen := false
var _level_pulse_seen := false
var _max_visible_rows := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_started_msec = Time.get_ticks_msec()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP

	_host = MAIN_SCENE.instantiate()
	root.add_child(_host)
	current_scene = _host
	if not await _wait_for_real_world():
		_fail("真实 Main.tscn 世界 HUD 没有在限定帧内就绪")
		return
	if not _configure_isolated_world():
		return

	print(
		(
			"BATTLE_OUTCOME_OWNER_REVIEW_START scene=Main.tscn "
			+ "entry=SceneTreeScript viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false structured=true"
		)
	)
	await _hold_chapter("world_context", CHAPTER_WORLD_SECONDS, false)
	if _failed:
		return

	var closed_room := _review_closed_room()
	var view := BattleOutcomePresentationModel.build_view(
		closed_room,
		ACCOUNT_ID,
		BattleOutcomePresentationModel.RESULT_VICTORY
	)
	var coverage := _view_coverage(view)
	if not _validate_review_view(view, coverage):
		return
	var reward_rows: Array = view.get("rewardRows", [])
	var warning_rows: Array = view.get("warningRows", [])
	_expected_row_count = reward_rows.size() + warning_rows.size()
	var entry_count := 1 + _expected_row_count
	print(
		(
			"BATTLE_OUTCOME_OWNER_REVIEW_VIEW result=victory entries=%d "
			+ "player_exp=%s ride_exp=%s battle_pet_exp=%s partner_exp=%s "
			+ "player_level_up=%s pet_level_up=%s stone_coins=%s "
			+ "item=%s mail=%s server_writes=0"
		) % [
			entry_count,
			_str_bool(bool(coverage.get("player_exp", false))),
			_str_bool(bool(coverage.get("ride_exp", false))),
			_str_bool(bool(coverage.get("battle_pet_exp", false))),
			_str_bool(bool(coverage.get("partner_exp", false))),
			_str_bool(bool(coverage.get("player_level_up", false))),
			_str_bool(bool(coverage.get("pet_level_up", false))),
			_str_bool(bool(coverage.get("stone_coins", false))),
			_str_bool(bool(coverage.get("item", false))),
			_str_bool(bool(coverage.get("mail", false))),
		]
	)
	_host._audio_play_battle_result("victory")
	if not bool(_panel_flow._present_battle_outcome_float(view, 1.0)):
		_fail("PFC 拒绝了首次结构化战斗结算 view")
		return

	await _hold_chapter("outcome_intro", CHAPTER_INTRO_SECONDS, true)
	await _hold_chapter("reward_float_queue", CHAPTER_QUEUE_SECONDS, true)
	if _failed:
		return
	var completed_snapshot: Dictionary = (
		_panel_flow._battle_outcome_overlay_snapshot()
	)
	if not _validate_completed_sequence(completed_snapshot):
		return
	if _host.player_profile != _profile_before:
		_fail("只读结算验收意外修改了隔离人物档案")
		return
	if bool(_host.server_profile_sync_pull_queued):
		_fail("只读结算验收意外排队了服务端档案拉取")
		return

	_panel_flow._dismiss_battle_outcome_float(false)
	await _hold_chapter("settled_world", CHAPTER_SETTLED_SECONDS, false)
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"BATTLE_OUTCOME_OWNER_REVIEW_END elapsed_wall=%.3f speed=1.00x "
			+ "profile=isolated backend=false entries=%d completed=true "
			+ "moved_up=true faded=true"
		) % [elapsed, entry_count]
	)
	quit(0)


func _wait_for_real_world() -> bool:
	for _frame_index in range(150):
		await process_frame
		if _host == null or not is_instance_valid(_host):
			return false
		var hud_value = _host.get("hud_root")
		var player_value = _host.get("player")
		if (
			hud_value is Control
			and (hud_value as Control).is_inside_tree()
			and player_value is CanvasItem
			and (player_value as CanvasItem).is_inside_tree()
			and str(_host.get("current_map_id")).strip_edges() != ""
		):
			var scene_path := str(_host.scene_file_path)
			return (
				current_scene == _host
				and scene_path == "res://scenes/Main.tscn"
			)
	return false


func _configure_isolated_world() -> bool:
	_host.profile_save_enabled = false
	_host.account_authenticated = true
	_host.current_account_session = {
		"accountId": ACCOUNT_ID,
		"displayName": "岚牙",
		"authSource": "isolated_owner_review",
	}
	_host.server_profile_sync_state = "off"
	_host.server_profile_sync_pending_kind = ""
	_host.server_profile_sync_dirty = false
	_host.server_profile_sync_pull_queued = false
	if _host.has_method("_stop_server_event_stream"):
		_host._stop_server_event_stream()
	if _host.has_method("_stop_online_position_sync"):
		_host._stop_online_position_sync()
	for method_name in [
		"_close_auth_panel",
		"_close_account_panel",
		"_close_market_panel",
		"_close_battle_result_panel",
	]:
		if _host.has_method(method_name):
			_host.call(method_name, false)
	var entry_panel_value = _host.get("character_entry_panel")
	if entry_panel_value is CanvasItem:
		(entry_panel_value as CanvasItem).visible = false

	var profile := PlayerProgressModel.default_profile()
	var player := (
		(profile.get("player", {}) as Dictionary).duplicate(true)
	)
	player["name"] = "岚牙"
	player["level"] = 98
	profile["player"] = player
	_host.player_profile = profile
	if not _host._load_map(WORLD_MAP_ID, WORLD_SPAWN_NAME):
		_fail("无法载入战斗结算验收世界地图")
		return false
	_host._set_world_log_message("荒野战斗结束，队伍已经安全返回。")
	_host._update_hud_text(true)
	_host._layout_hud()
	_panel_flow = _host._panel_flow()
	if _panel_flow == null:
		_fail("真实 Main.tscn 没有建立 PanelFlowCoordinator")
		return false
	var initial_snapshot: Dictionary = (
		_panel_flow._battle_outcome_overlay_snapshot()
	)
	if (
		initial_snapshot.is_empty()
		or not bool(initial_snapshot.get("mouseFilterIgnore", false))
	):
		_fail("PFC 战斗结算 overlay 没有挂载为鼠标穿透层")
		return false
	_panel_flow._dismiss_battle_outcome_float(true)
	_profile_before = _host.player_profile.duplicate(true)
	return true


func _review_closed_room() -> Dictionary:
	return {
		"roomId": "phase393_battle_outcome_owner_review_room",
		"mode": "party_pve",
		"status": "closed",
		"battleRecordId": "phase393_battle_outcome_owner_review_record",
		"battle": {
			"actors": [
				{"actorId": "review_player", "side": "ally", "hp": 816},
				{"actorId": "review_enemy", "side": "enemy", "hp": 0},
			],
			"result": {
				"battleRecordId": "phase393_battle_outcome_owner_review_record",
				"winnerAccountId": ACCOUNT_ID,
				"loserAccountIds": ["phase393_review_enemy"],
				"reason": "defeat",
			},
			"profileWriteback": {
				"profiles": [{
					"accountId": ACCOUNT_ID,
					"exp": {
						"player": {
							"name": "岚牙",
							"amount": 5120,
							"beforeLevel": 97,
							"level": 98,
							"levelsGained": 1,
						},
						"ridePets": [{
							"petInstanceId": "review_crystal_wuli_ride",
							"name": "晶甲乌力",
							"amount": 3072,
							"beforeLevel": 88,
							"level": 88,
							"levelsGained": 0,
						}],
						"pets": [{
							"petInstanceId": "review_moon_gale_battle_pet",
							"name": "月岚风狐",
							"amount": 4096,
							"beforeLevel": 79,
							"level": 80,
							"levelsGained": 1,
						}],
						"trainingPartners": [{
							"partnerId": "review_training_partner",
							"player": {
								"name": "火芽伙伴",
								"amount": 1600,
								"beforeLevel": 61,
								"level": 61,
								"levelsGained": 0,
							},
							"pet": {
								"petInstanceId": "review_partner_bui",
								"name": "芽耳布伊",
								"amount": 960,
								"beforeLevel": 54,
								"level": 54,
								"levelsGained": 0,
							},
						}],
					},
					"rewards": {
						"stoneCoins": 1680,
						"addedItems": [{
							"itemId": "item_meat_small",
							"count": 2,
						}],
						"mailedItems": [{
							"itemId": "capture_net_reinforced",
							"count": 1,
						}],
						"lostItems": [],
					},
				}],
				"skippedProfiles": [],
			},
		},
	}


func _view_coverage(view: Dictionary) -> Dictionary:
	var coverage := {
		"player_exp": false,
		"ride_exp": false,
		"battle_pet_exp": false,
		"partner_exp": false,
		"player_level_up": false,
		"pet_level_up": false,
		"stone_coins": false,
		"item": false,
		"mail": false,
	}
	var partner_player_exp := false
	var partner_pet_exp := false
	var rows: Array = view.get("rewardRows", [])
	for value in rows:
		if not (value is Dictionary):
			continue
		var row := value as Dictionary
		var kind := str(row.get("kind", ""))
		var role := str(row.get("role", ""))
		if kind == "exp":
			match role:
				"player":
					coverage["player_exp"] = true
				"ride_pet":
					coverage["ride_exp"] = true
				"battle_pet":
					coverage["battle_pet_exp"] = true
				"partner":
					partner_player_exp = true
				"partner_pet":
					partner_pet_exp = true
		elif kind == "level_up":
			if role == "player":
				coverage["player_level_up"] = true
			elif ["ride_pet", "battle_pet", "partner_pet"].has(role):
				coverage["pet_level_up"] = true
		elif kind == "currency" and int(row.get("amount", 0)) > 0:
			coverage["stone_coins"] = true
		elif kind == "item":
			coverage["item"] = true
		elif kind == "mail":
			coverage["mail"] = true
	coverage["partner_exp"] = partner_player_exp and partner_pet_exp
	return coverage


func _validate_review_view(view: Dictionary, coverage: Dictionary) -> bool:
	if str(view.get("outcomeId", "")) != OUTCOME_ID:
		_fail("结构化 view 没有稳定 battleRecordId 去重键")
		return false
	if (
		str(view.get("title", "")) != "战斗胜利"
		or str(view.get("resultKey", "")) != "victory"
	):
		_fail("结构化 view 没有呈现战斗胜利")
		return false
	for required_key in [
		"player_exp",
		"ride_exp",
		"battle_pet_exp",
		"partner_exp",
		"player_level_up",
		"pet_level_up",
		"stone_coins",
		"item",
		"mail",
	]:
		if not bool(coverage.get(required_key, false)):
			_fail("结构化 view 缺少验收类型：%s" % required_key)
			return false
	var reward_rows: Array = view.get("rewardRows", [])
	var warning_rows: Array = view.get("warningRows", [])
	if reward_rows.size() != 10 or not warning_rows.is_empty():
		_fail("结构化 view 奖励行不是预期的 10 行且零警告")
		return false
	for row_value in reward_rows:
		if (
			not (row_value is Dictionary)
			or str((row_value as Dictionary).get("text", "")).strip_edges() == ""
		):
			_fail("结构化 view 存在空白或非结构化奖励行")
			return false
	return true


func _hold_chapter(
	chapter: String,
	seconds: float,
	observe_overlay: bool
) -> void:
	var frames := maxi(1, roundi(seconds * REVIEW_FPS))
	print(
		(
			"BATTLE_OUTCOME_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, frames, seconds]
	)
	for _frame_index in range(frames):
		await process_frame
		if observe_overlay and not _failed:
			_observe_overlay_snapshot(
				_panel_flow._battle_outcome_overlay_snapshot()
			)


func _observe_overlay_snapshot(snapshot: Dictionary) -> void:
	_overlay_visible_seen = (
		_overlay_visible_seen
		or bool(snapshot.get("visible", false))
	)
	var rows: Array = snapshot.get("rows", [])
	_max_visible_rows = maxi(_max_visible_rows, rows.size())
	for value in rows:
		if not (value is Dictionary):
			continue
		var row := value as Dictionary
		var text := str(row.get("text", "")).strip_edges()
		if text == "":
			continue
		_seen_row_texts[text] = true
		var position_y := float(row.get("positionY", 0.0))
		if not _row_min_y.has(text):
			_row_min_y[text] = position_y
			_row_max_y[text] = position_y
		else:
			_row_min_y[text] = minf(float(_row_min_y[text]), position_y)
			_row_max_y[text] = maxf(float(_row_max_y[text]), position_y)
		var alpha := float(row.get("alpha", 1.0))
		if alpha > 0.01 and alpha < 0.99:
			_fade_seen = true
		if (
			str(row.get("kind", "")) == "level_up"
			and float(row.get("scale", 1.0)) > 1.01
		):
			_level_pulse_seen = true


func _validate_completed_sequence(snapshot: Dictionary) -> bool:
	var moved_up := false
	for text in _row_min_y.keys():
		if float(_row_max_y.get(text, 0.0)) - float(_row_min_y[text]) >= 20.0:
			moved_up = true
			break
	if (
		not _overlay_visible_seen
		or bool(snapshot.get("active", true))
		or bool(snapshot.get("visible", true))
		or int(snapshot.get("completedCount", 0)) != 1
		or str(snapshot.get("lastOutcomeId", "")) != OUTCOME_ID
		or not bool(snapshot.get("mouseFilterIgnore", false))
		or _seen_row_texts.size() != _expected_row_count
		or _max_visible_rows < 2
		or not moved_up
		or not _fade_seen
		or not _level_pulse_seen
	):
		_fail(
			(
				"上移淡出序列未完整收敛：visible_seen=%s active=%s "
				+ "visible=%s completed=%d seen_rows=%d/%d max_rows=%d "
				+ "moved=%s faded=%s level_pulse=%s"
			) % [
				_str_bool(_overlay_visible_seen),
				_str_bool(bool(snapshot.get("active", true))),
				_str_bool(bool(snapshot.get("visible", true))),
				int(snapshot.get("completedCount", 0)),
				_seen_row_texts.size(),
				_expected_row_count,
				_max_visible_rows,
				_str_bool(moved_up),
				_str_bool(_fade_seen),
				_str_bool(_level_pulse_seen),
			]
		)
		return false
	return true


func _str_bool(value: bool) -> String:
	return "true" if value else "false"


func _fail(message: String) -> void:
	if _failed:
		return
	_failed = true
	print("BATTLE_OUTCOME_OWNER_REVIEW_FAILED reason=%s" % message)
	push_error("battle outcome owner review failed: %s" % message)
	quit(1)
