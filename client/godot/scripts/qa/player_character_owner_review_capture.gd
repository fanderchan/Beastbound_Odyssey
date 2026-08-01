extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const PetRidePermitModel := preload(
	"res://scripts/progression/pet_ride_permit_model.gd"
)

const CAPTURE_FLAG := "--player-character-owner-review-capture"
const REVIEW_FPS := 30
const REVIEW_PLAYER_NAME := "焰芽斗士"
const REVIEW_BATTLE_PET_ID := "character_review_battle_pet"
const REVIEW_RIDE_PET_ID := "character_review_ride_pet"
const REVIEW_RESERVE_PET_ID := "character_review_reserve_pet"
const REVIEW_RIDE_FORMS := [
	"bui_novice_sprout_earth5_wind5",
	"novice_tiger_mount",
	"thunder_dragon_mount",
]

var host
var _started_msec: int = 0
var _failed := false


func _init(host_node = null) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	await _configure_isolated_world_profile()
	if _failed:
		return
	print(
		(
			"PLAYER_CHARACTER_OWNER_REVIEW_START scene=Main.tscn "
			+ "viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false"
		)
	)
	await _hold("world", 2.0)
	await _open_character_from_real_world_entry()
	if _failed:
		return
	await _hold("attributes", 3.5)
	await _review_stat_draft_undo_reset_and_confirm()
	if _failed:
		return
	await _review_ride_permit_all_and_species()
	if _failed:
		return
	await _return_to_world()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"PLAYER_CHARACTER_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "scene=Main.tscn viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false "
			+ "entry=right_bottom stats_confirmed=true "
			+ "real_ride_forms=3 species_filter=true return_world=true"
		) % elapsed
	)
	host.get_tree().quit(0)


func _configure_isolated_world_profile() -> void:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return
	host.profile_save_enabled = false
	host.account_authenticated = true
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	if host.has_method("_stop_server_event_stream"):
		host._stop_server_event_stream()
	if host.has_method("_stop_online_position_sync"):
		host._stop_online_position_sync()
	for request_name in ["auth_http_request", "online_position_http_request"]:
		var request_value = host.get(request_name)
		if request_value is HTTPRequest:
			(request_value as HTTPRequest).cancel_request()

	host.player_profile = _review_profile()
	if host.has_method("_load_map"):
		host._load_map("firebud_village_gate", "from_training_yard")
	if host.has_method("_close_auth_panel"):
		host._close_auth_panel(false)
	if host.has_method("_close_account_panel"):
		host._close_account_panel(false)
	if host.character_entry_panel is CanvasItem:
		(host.character_entry_panel as CanvasItem).visible = false
	if host.has_method("_close_player_status_panel"):
		host._close_player_status_panel()
	if host.has_method("_update_hud_text"):
		host._update_hud_text(true)
	if host.has_method("_set_world_log_message"):
		host._set_world_log_message("角色资料已整理好，点击右下角“角色”查看。")
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(6)
	for control_name in ["top_panel", "side_panel", "action_bar"]:
		var value = host.get(control_name)
		if value is CanvasItem:
			(value as CanvasItem).visible = true
	await _settle_frames(3)

	var panel = _management_panel()
	var entry = host.player_status_menu_button
	if panel == null or not (entry is Button):
		_fail_capture("Main HUD 尚未构建角色入口或角色管理页")
		return
	if host.profile_save_enabled or not host.current_account_session.is_empty():
		_fail_capture("隔离角色录像仍连接正常档案或服务端会话")
		return
	if host.player_status_panel == null or host.player_status_panel.visible:
		_fail_capture("隔离世界初始态错误：角色页不应提前打开")
		return
	var entry_rect := (entry as Button).get_global_rect()
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if (
		entry_rect.get_center().x <= viewport_size.x * 0.5
		or entry_rect.get_center().y <= viewport_size.y * 0.5
	):
		_fail_capture("角色入口没有位于世界 HUD 右下区域")
		return
	print(
		(
			"PLAYER_CHARACTER_OWNER_REVIEW_ISOLATION scene=Main.tscn "
			+ "profile=isolated backend=false profile_save=false "
			+ "entry=right_bottom x=%.1f y=%.1f"
		) % [entry_rect.get_center().x, entry_rect.get_center().y]
	)


func _review_profile() -> Dictionary:
	var profile := PlayerProgressModel.with_starter_equipment(
		PlayerProgressModel.default_profile()
	)
	var player_value = profile.get("player", {})
	var player := (
		(player_value as Dictionary).duplicate(true)
		if player_value is Dictionary
		else {}
	)
	player["name"] = REVIEW_PLAYER_NAME
	player["level"] = 80
	player["exp"] = 91703
	player["nextExp"] = 119635
	player["statPoints"] = 4
	player["appearanceId"] = "ember_spark_v1"
	player["elements"] = {"earth": 6, "water": 3, "fire": 0, "wind": 1}
	profile["player"] = player
	profile["rebirthCount"] = 2
	profile[PetRidePermitModel.PROFILE_KEY] = {
		"schemaVersion": PetRidePermitModel.SCHEMA_VERSION,
		"permitIds": [],
	}
	var battle_pet := PlayerProgressModel.create_pet_instance_from_form(
		REVIEW_BATTLE_PET_ID,
		"芽耳布伊",
		"bui_novice_sprout_earth5_wind5",
		PlayerProgressModel.PET_STATE_BATTLE,
		40
	)
	var ride_pet := PlayerProgressModel.create_pet_instance_from_form(
		REVIEW_RIDE_PET_ID,
		"新手老虎",
		"novice_tiger_mount",
		PlayerProgressModel.PET_STATE_RIDING,
		40
	)
	var reserve_pet := PlayerProgressModel.create_pet_instance_from_form(
		REVIEW_RESERVE_PET_ID,
		"雷龙",
		"thunder_dragon_mount",
		PlayerProgressModel.PET_STATE_STORAGE,
		120
	)
	profile["petInstances"] = [battle_pet, ride_pet, reserve_pet]
	profile["activePetInstanceId"] = REVIEW_BATTLE_PET_ID
	profile["ridePetInstanceId"] = REVIEW_RIDE_PET_ID
	profile["unlockedAbilities"] = [PlayerProgressModel.ABILITY_RIDING]
	return PlayerProgressModel.normalize_profile(profile)


func _open_character_from_real_world_entry() -> void:
	var entry = host.player_status_menu_button
	if not (entry is Button):
		_fail_capture("世界 HUD 缺少角色按钮")
		return
	await _left_click(entry as Button, "右下角角色入口")
	if _failed:
		return
	await _settle_frames(4)
	var panel = _management_panel()
	if (
		panel == null
		or host.player_status_panel == null
		or not host.player_status_panel.visible
		or str(panel.call("active_tab")) != "attributes"
	):
		_fail_capture("真实左键点击角色入口后没有打开属性页")
		return
	var equipment_grid = panel.call("get_named_control", "EquipmentGrid")
	if not (equipment_grid is GridContainer) or equipment_grid.get_child_count() != 9:
		_fail_capture("属性页没有完整展示九个装备槽")
		return
	print(
		"PLAYER_CHARACTER_OWNER_REVIEW_ATTRIBUTES "
		+ "opened=true equipment_slots=9 player=%s" % REVIEW_PLAYER_NAME
	)


func _review_stat_draft_undo_reset_and_confirm() -> void:
	var panel = _management_panel()
	if panel == null:
		return
	var tab = panel.call("get_tab_button", "stat_points")
	if not (tab is Button):
		_fail_capture("角色页缺少加点标签")
		return
	await _left_click(tab as Button, "加点标签")
	await _settle_frames(3)
	if str(panel.call("active_tab")) != "stat_points":
		_fail_capture("点击加点标签后没有切换页面")
		return
	await _hold("stat_page", 2.0)

	await _click_stat(panel, "maxHp", 1)
	await _click_stat(panel, "attack", 1)
	await _click_stat(panel, "quick", 1)
	if _failed:
		return
	var flow = _panel_flow()
	var draft := flow.character_management_pending_allocation as Dictionary
	if (
		int(draft.get("maxHp", 0)) != 1
		or int(draft.get("attack", 0)) != 1
		or int(draft.get("quick", 0)) != 1
		or PlayerProgressModel.player_stat_points(host.player_profile) != 4
	):
		_fail_capture("加点草稿没有保持未提交状态")
		return
	await _hold("stat_draft", 2.0)

	await _click_stat(panel, "quick", -1)
	if _failed:
		return
	var undone := flow.character_management_pending_allocation as Dictionary
	if int(undone.get("quick", -1)) != 0:
		_fail_capture("减号没有撤回敏捷草稿点")
		return
	await _hold("stat_undo", 1.8)

	var reset = panel.call("get_named_control", "ResetPendingStatsButton")
	if not (reset is Button):
		_fail_capture("加点页缺少清空本次按钮")
		return
	await _left_click(reset as Button, "清空本次")
	await _settle_frames(3)
	var reset_state := flow.character_management_pending_allocation as Dictionary
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		if int(reset_state.get(stat_key, 0)) != 0:
			_fail_capture("清空本次没有撤销全部草稿")
			return
	await _hold("stat_reset", 1.5)

	var before_summary := PlayerProgressModel.player_stat_summary(host.player_profile)
	var before_base := (before_summary.get("base", {}) as Dictionary).duplicate(true)
	await _click_stat(panel, "maxHp", 1)
	await _click_stat(panel, "attack", 1)
	await _click_stat(panel, "defense", 1)
	if _failed:
		return
	await _hold("stat_final_draft", 1.8)
	var confirm = panel.call("get_named_control", "ConfirmStatsButton")
	if not (confirm is Button) or (confirm as Button).disabled:
		_fail_capture("有效草稿下确认加点按钮不可用")
		return
	await _left_click(confirm as Button, "确认加点")
	await _settle_frames(6)
	var after_summary := PlayerProgressModel.player_stat_summary(host.player_profile)
	var after_base := after_summary.get("base", {}) as Dictionary
	var pending_after := flow.character_management_pending_allocation as Dictionary
	if (
		PlayerProgressModel.player_stat_points(host.player_profile) != 1
		or int(after_base.get("maxHp", 0)) != int(before_base.get("maxHp", 0)) + 4
		or int(after_base.get("attack", 0)) != int(before_base.get("attack", 0)) + 1
		or int(after_base.get("defense", 0)) != int(before_base.get("defense", 0)) + 1
		or not _pending_is_zero(pending_after)
		or host.profile_save_enabled
		or not host.current_account_session.is_empty()
	):
		_fail_capture("本地隔离确认加点没有一次性提交正确三点")
		return
	print(
		(
			"PLAYER_CHARACTER_OWNER_REVIEW_STATS draft=true undo=true "
			+ "reset=true confirmed=true points_before=4 points_after=1 "
			+ "hp_gain=4 attack_gain=1 defense_gain=1 profile_save=false"
		)
	)
	await _hold("stat_confirmed", 3.5)


func _review_ride_permit_all_and_species() -> void:
	var panel = _management_panel()
	if panel == null:
		return
	var tab = panel.call("get_tab_button", "ride_permits")
	if not (tab is Button):
		_fail_capture("角色页缺少骑证标签")
		return
	await _left_click(tab as Button, "骑证标签")
	await _settle_frames(4)
	if str(panel.call("active_tab")) != "ride_permits":
		_fail_capture("点击骑证标签后没有切换页面")
		return
	var all_button = panel.call("get_named_control", "RideFilter_all")
	if not (all_button is Button):
		_fail_capture("骑证页缺少全部筛选")
		return
	await _left_click(all_button as Button, "全部骑证")
	await _settle_frames(3)
	for form_id in REVIEW_RIDE_FORMS:
		var entry = panel.call("get_ride_entry_button", form_id)
		if not (entry is Button):
			_fail_capture("全部骑证没有严格展示真实形态：%s" % form_id)
			return
	var locked_bui = panel.call(
		"get_ride_entry_button", "bui_novice_sprout_earth5_wind5"
	)
	if (
		not (locked_bui is Button)
		or (locked_bui as Button).get_node_or_null("AvailabilityOverlay/LockIcon") == null
	):
		_fail_capture("需证未获骑宠没有显示正式锁定遮罩")
		return
	print(
		"PLAYER_CHARACTER_OWNER_REVIEW_RIDES "
		+ "filter=all real_forms=3 fake_forms=0 locked_cards=1"
	)
	await _hold("ride_all", 3.5)

	var species_button = panel.call("get_named_control", "RideFilter_species")
	if not (species_button is Button):
		_fail_capture("骑证页缺少种族筛选")
		return
	await _left_click(species_button as Button, "种族筛选")
	await _settle_frames(4)
	var dynamic = panel.call("get_named_control", "RideDynamicFilters")
	if not (dynamic is VBoxContainer) or not dynamic.visible:
		_fail_capture("点击种族后没有展开真实种族列表")
		return
	await _hold("ride_species_menu", 3.0)

	var tiger_filter = panel.call("get_named_control", "RideFilter_line_tiger")
	if not (tiger_filter is Button):
		_fail_capture("种族列表缺少老虎系")
		return
	await _left_click(tiger_filter as Button, "老虎系")
	await _settle_frames(4)
	var flow = _panel_flow()
	var tiger_entry = panel.call(
		"get_ride_entry_button", "novice_tiger_mount"
	)
	if (
		str(flow.character_management_ride_filter_id) != "line:tiger"
		or not (tiger_entry is Button)
		or panel.call(
			"get_ride_entry_button", "thunder_dragon_mount"
		) != null
	):
		_fail_capture("老虎系筛选没有只保留真实老虎骑宠")
		return
	print(
		"PLAYER_CHARACTER_OWNER_REVIEW_RIDES "
		+ "filter=line:tiger species_menu=true visible_forms=1"
	)
	await _hold("ride_species_filtered", 3.5)


func _return_to_world() -> void:
	var panel = _management_panel()
	if panel == null:
		return
	var close = panel.call("get_named_control", "CloseButton")
	if not (close is Button):
		_fail_capture("角色页缺少关闭按钮")
		return
	await _left_click(close as Button, "角色页关闭按钮")
	await _settle_frames(5)
	if (
		host.player_status_panel != null
		and host.player_status_panel.visible
	):
		_fail_capture("关闭角色页后没有返回世界")
		return
	if host.action_bar == null or not host.action_bar.visible:
		_fail_capture("返回世界后右下操作栏没有恢复")
		return
	await _hold("return_world", 2.5)


func _click_stat(panel, stat_key: String, delta: int) -> void:
	var button = panel.call("get_stat_adjust_button", stat_key, delta)
	if not (button is Button):
		_fail_capture("加点行缺少按钮：%s/%d" % [stat_key, delta])
		return
	await _left_click(button as Button, "%s%s" % [stat_key, "+" if delta > 0 else "-"])
	await _settle_frames(2)


func _pending_is_zero(value: Dictionary) -> bool:
	for stat_key in PlayerProgressModel.PLAYER_STAT_KEYS:
		if int(value.get(stat_key, 0)) != 0:
			return false
	return true


func _management_panel():
	var flow = _panel_flow()
	if flow == null or flow.character_management_panel == null:
		_fail_capture("角色管理视图不可用")
		return null
	return flow.character_management_panel


func _panel_flow():
	if host == null or not host.has_method("_panel_flow"):
		_fail_capture("Main 缺少面板协调器")
		return null
	return host._panel_flow()


func _left_click(control: Control, label: String) -> void:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		_fail_capture("%s不可用，无法执行真实左键" % label)
		return
	var viewport_point := control.get_global_rect().get_center()
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	await host.get_tree().process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = input_position
	press.global_position = input_position
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	Input.parse_input_event(release)
	await host.get_tree().process_frame


func _settle_frames(frame_count: int) -> void:
	for _frame in range(maxi(0, frame_count)):
		await host.get_tree().process_frame


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"PLAYER_CHARACTER_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("PLAYER_CHARACTER_OWNER_REVIEW_FAILED %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().quit(1)
