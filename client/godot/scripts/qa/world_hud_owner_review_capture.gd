extends RefCounted

const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)
const IsoMapModel := preload(
	"res://scripts/world/isometric_map_model.gd"
)

const CAPTURE_FLAG := "--world-hud-owner-review-capture"
const REVIEW_FPS := 30
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const REVIEW_PLAYER_NAME := "焰芽斗士"
const REVIEW_BATTLE_PET_ID := "world_hud_review_battle_pet"
const REVIEW_RIDE_PET_ID := "world_hud_review_ride_pet"
const MOVE_FRAME_LIMIT := 240

var host
var _started_msec: int = 0
var _failed := false
var _real_left_click_count := 0


func _init(host_node = null) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	await _configure_isolated_world_profile()
	if _failed:
		return
	print(
		(
			"WORLD_HUD_OWNER_REVIEW_START scene=Main.tscn "
			+ "viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false"
		)
	)
	await _hold("world_hud_complete", 3.0)
	await _review_top_and_map()
	if _failed:
		return
	await _review_primary_entries()
	if _failed:
		return
	await _review_task_and_party_tabs()
	if _failed:
		return
	await _review_chat()
	if _failed:
		return
	await _review_more_collapse_and_restore()
	if _failed:
		return
	await _review_real_world_move()
	if _failed:
		return
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"WORLD_HUD_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "scene=Main.tscn viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false "
			+ "complete_hud=true map=true entries=true task_party=true chat=true "
			+ "more=true restore_only=true expanded=true moved=true clicks=%d"
		) % [elapsed, _real_left_click_count]
	)
	host.get_tree().quit(0)


func _configure_isolated_world_profile() -> void:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return
	var current_scene: Node = host.get_tree().current_scene as Node
	if (
		current_scene != host
		or current_scene.scene_file_path != "res://scenes/Main.tscn"
	):
		_fail_capture("世界 HUD 验收必须运行真实 Main.tscn")
		return
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if Vector2i(roundi(viewport_size.x), roundi(viewport_size.y)) != EXPECTED_VIEWPORT:
		_fail_capture("世界 HUD 验收视口必须为 1280×720")
		return

	host.profile_save_enabled = false
	host.account_authenticated = true
	host.auth_auto_bypass = false
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	if host.has_method("_stop_server_event_stream"):
		host._stop_server_event_stream()
	if host.has_method("_stop_online_position_sync"):
		host._stop_online_position_sync()
	for request_name in [
		"auth_http_request",
		"online_position_http_request",
		"chat_http_request",
		"party_http_request",
	]:
		var request_value = host.get(request_name)
		if request_value is HTTPRequest:
			(request_value as HTTPRequest).cancel_request()

	host.player_profile = _review_profile()
	if host.has_method("_load_map"):
		if not bool(host._load_map("firebud_village_gate", "from_training_yard")):
			_fail_capture("隔离世界地图加载失败")
			return
	if host.has_method("_set_hang_mode"):
		host._set_hang_mode(false)
	if host.has_method("_close_auth_panel"):
		host._close_auth_panel(false)
	if host.has_method("_close_account_panel"):
		host._close_account_panel(false)
	if host.character_entry_panel is CanvasItem:
		(host.character_entry_panel as CanvasItem).visible = false
	_close_all_review_panels()
	host.chat_messages.clear()
	host._append_chat_message("system", "欢迎回到火芽村，今天也要照顾好伙伴。")
	host._append_chat_message("nearby", "训练场集合，一起完成今日委托！", "见习猎人")
	host._append_chat_message("team", "补给已整理完毕，随时可以出发。", "焰芽斗士")
	if host.has_method("_update_hud_text"):
		host._update_hud_text(true)
	if host.has_method("_set_world_log_message"):
		host._set_world_log_message("火芽村的冒险菜单已经准备好了。")
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(8)

	var view = _world_hud_view()
	if view == null:
		return
	view.call("set_collapsed", false)
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(5)
	if bool(view.call("is_collapsed")):
		_fail_capture("隔离世界初始态错误：HUD 不应已收起")
		return
	if host.profile_save_enabled or not host.current_account_session.is_empty():
		_fail_capture("隔离世界 HUD 录像仍连接正常档案或服务端会话")
		return
	if host.auth_panel != null and host.auth_panel.visible:
		_fail_capture("隔离世界 HUD 仍被登录面板遮挡")
		return
	for entry_id in [
		"character",
		"backpack",
		"pet",
		"map",
		"quest",
		"party",
		"chat",
	]:
		var entry := _entry_button(entry_id)
		if entry == null or not entry.is_visible_in_tree():
			_fail_capture("完整世界 HUD 缺少真实入口：%s" % entry_id)
			return
	var more_button := _named_button("WorldHudMoreButton")
	var collapse_button := _named_button("WorldHudCollapseButton")
	var restore_button := _named_button("WorldHudRestoreButton")
	if more_button == null or collapse_button == null or restore_button == null:
		_fail_capture("完整世界 HUD 缺少更多、收起或恢复按钮")
		return
	if restore_button.is_visible_in_tree():
		_fail_capture("展开态不应显示恢复按钮")
		return
	if (
		host.top_panel == null
		or not host.top_panel.is_visible_in_tree()
		or host.side_panel == null
		or not host.side_panel.is_visible_in_tree()
		or host.action_bar == null
		or not host.action_bar.is_visible_in_tree()
	):
		_fail_capture("完整世界 HUD 的顶部、地图/任务或操作层没有同时显示")
		return
	print(
		"WORLD_HUD_OWNER_REVIEW_ISOLATION scene=Main.tscn "
		+ "profile=isolated backend=false profile_save=false fresh_user_dir=true"
	)
	print(
		"WORLD_HUD_OWNER_REVIEW_LAYERS complete=true top=true "
		+ "map=true action=true"
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
	player["statPoints"] = 3
	player["appearanceId"] = "ember_spark_v1"
	player["elements"] = {"earth": 6, "water": 3, "fire": 0, "wind": 1}
	profile["player"] = player
	profile["rebirthCount"] = 1
	profile = PlayerProgressModel.with_training_partner_count(profile, 2)
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
		56
	)
	profile["petInstances"] = [battle_pet, ride_pet]
	profile["activePetInstanceId"] = REVIEW_BATTLE_PET_ID
	profile["ridePetInstanceId"] = REVIEW_RIDE_PET_ID
	profile["unlockedAbilities"] = [PlayerProgressModel.ABILITY_RIDING]
	return PlayerProgressModel.normalize_profile(profile)


func _review_top_and_map() -> void:
	await _hold("top_map_hud", 2.0)
	var map_entry := _entry_button("map")
	if map_entry == null:
		return
	await _left_click(map_entry, "世界 HUD 地图入口")
	if _failed:
		return
	await _settle_frames(4)
	if host.map_panel == null or not host.map_panel.visible:
		_fail_capture("真实左键点击地图入口后没有打开地图页")
		return
	await _hold("map_panel", 3.0)
	if not (host.map_close_button is Button):
		_fail_capture("地图页缺少关闭按钮")
		return
	await _left_click(host.map_close_button as Button, "关闭地图页")
	await _settle_frames(3)
	if host.map_panel.visible:
		_fail_capture("点击地图关闭按钮后没有返回世界")
		return
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(3)
	var character_entry := _entry_button("character")
	print(
		(
			"WORLD_HUD_OWNER_REVIEW_RETURN map_visible=%s world_menu_open=%s "
			+ "hud_visible=%s character_entry_ready=%s"
		)
		% [
			str(host.map_panel.visible),
			str(host._world_menu_is_open()),
			str(host.side_panel != null and host.side_panel.is_visible_in_tree()),
			str(
				character_entry != null
				and character_entry.is_visible_in_tree()
				and not character_entry.disabled
			),
		]
	)


func _review_primary_entries() -> void:
	await _review_single_primary_entry("character", "character_entry")
	if _failed:
		return
	await _review_single_primary_entry("backpack", "backpack_entry")
	if _failed:
		return
	await _review_single_primary_entry("pet", "pet_entry")
	if _failed:
		return
	print(
		"WORLD_HUD_OWNER_REVIEW_ENTRIES character=true backpack=true "
		+ "pet=true real_clicks=true"
	)


func _review_single_primary_entry(entry_id: String, chapter: String) -> void:
	var entry := _entry_button(entry_id)
	if entry == null:
		return
	await _left_click(entry, "世界 HUD %s 入口" % entry_id)
	if _failed:
		return
	await _settle_frames(5)
	var opened := false
	match entry_id:
		"character":
			opened = host.player_status_panel != null and host.player_status_panel.visible
		"backpack":
			opened = host.backpack_panel != null and host.backpack_panel.visible
		"pet":
			opened = host.pet_panel != null and host.pet_panel.visible
	if not opened:
		_fail_capture("真实左键点击 %s 后没有打开对应页面" % entry_id)
		return
	await _hold(chapter, 2.2)
	await _close_primary_panel(entry_id)
	await _settle_frames(4)
	match entry_id:
		"character":
			opened = host.player_status_panel != null and host.player_status_panel.visible
		"backpack":
			opened = host.backpack_panel != null and host.backpack_panel.visible
		"pet":
			opened = host.pet_panel != null and host.pet_panel.visible
	if opened:
		_fail_capture("关闭 %s 页面后没有返回世界" % entry_id)


func _close_primary_panel(entry_id: String) -> void:
	var close_button: Button = null
	var flow = host._panel_flow()
	match entry_id:
		"character":
			if flow != null and flow.character_management_panel != null:
				var value = flow.character_management_panel.call(
					"get_named_control", "CloseButton"
				)
				if value is Button:
					close_button = value as Button
			if close_button == null and host.player_status_close_button is Button:
				close_button = host.player_status_close_button as Button
		"backpack":
			if flow != null and flow.backpack_awakened_panel != null:
				var value = flow.backpack_awakened_panel.find_child(
					"CloseButton", true, false
				)
				if value is Button:
					close_button = value as Button
			if close_button == null and host.backpack_close_button is Button:
				close_button = host.backpack_close_button as Button
		"pet":
			if host.pet_close_button is Button:
				close_button = host.pet_close_button as Button
			if close_button == null and host.pet_panel is Node:
				var value = host.pet_panel.find_child("CloseButton", true, false)
				if value is Button:
					close_button = value as Button
	if close_button == null:
		_fail_capture("%s 页面缺少真实关闭按钮" % entry_id)
		return
	await _left_click(close_button, "关闭 %s 页面" % entry_id)


func _review_task_and_party_tabs() -> void:
	var task_tab := _named_button("WorldHudTaskTab")
	if task_tab == null:
		task_tab = _entry_button("quest")
	if task_tab == null:
		return
	await _left_click(task_tab, "世界 HUD 任务页签")
	if _failed:
		return
	await _settle_frames(4)
	var task_open: bool = (
		host.quest_panel != null and host.quest_panel.visible
	)
	if not task_open and not _active_side_tab_is("task"):
		_fail_capture("点击任务页签后没有显示真实任务内容")
		return
	await _hold("task_tab", 3.0)
	if task_open:
		if not (host.quest_close_button is Button):
			_fail_capture("任务页缺少关闭按钮")
			return
		await _left_click(host.quest_close_button as Button, "关闭任务页")
		await _settle_frames(3)

	var party_tab := _named_button("WorldHudPartyTab")
	if party_tab == null:
		party_tab = _entry_button("party")
	if party_tab == null:
		return
	await _left_click(party_tab, "世界 HUD 队伍页签")
	if _failed:
		return
	await _settle_frames(4)
	var party_open: bool = (
		host.party_panel != null and host.party_panel.visible
	)
	if not party_open and not _active_side_tab_is("party"):
		_fail_capture("点击队伍页签后没有显示真实队伍内容")
		return
	await _hold("party_tab", 3.0)
	if party_open:
		if not (host.party_close_button is Button):
			_fail_capture("队伍页缺少关闭按钮")
			return
		await _left_click(host.party_close_button as Button, "关闭队伍页")
		await _settle_frames(3)
	print(
		"WORLD_HUD_OWNER_REVIEW_TASK_PARTY reviewed=true task=true "
		+ "party=true"
	)


func _review_chat() -> void:
	var chat_entry := _entry_button("chat")
	if chat_entry == null:
		return
	await _left_click(chat_entry, "世界 HUD 聊天入口")
	if _failed:
		return
	await _settle_frames(4)
	if host.chat_panel == null or not host.chat_panel.visible:
		_fail_capture("点击聊天入口后没有打开聊天页")
		return
	if not host.current_account_session.is_empty():
		_fail_capture("聊天验收错误连接了服务端会话")
		return
	if host.chat_nearby_button is Button:
		await _left_click(host.chat_nearby_button as Button, "附近聊天页签")
		await _settle_frames(3)
	await _hold("chat_open", 3.5)
	if not (host.chat_close_button is Button):
		_fail_capture("聊天页缺少关闭按钮")
		return
	await _left_click(host.chat_close_button as Button, "关闭聊天页")
	await _settle_frames(3)
	if host.chat_panel.visible:
		_fail_capture("关闭聊天后没有返回世界")
		return
	await _hold("chat_closed", 1.8)
	print(
		"WORLD_HUD_OWNER_REVIEW_CHAT opened=true closed=true offline=true"
	)


func _review_more_collapse_and_restore() -> void:
	var view = _world_hud_view()
	if view == null:
		return
	var more_button := _named_button("WorldHudMoreButton")
	var drawer := _named_control("WorldHudMoreDrawer")
	if more_button == null or drawer == null:
		_fail_capture("世界 HUD 缺少更多按钮或更多抽屉")
		return
	await _left_click(more_button, "更多按钮")
	if _failed:
		return
	await _settle_frames(4)
	var contract := _layout_contract()
	if (
		not drawer.is_visible_in_tree()
		or not bool(contract.get("moreDrawerOpen", false))
	):
		_fail_capture("真实左键点击更多后抽屉没有展开")
		return
	await _hold("more_drawer", 3.5)
	print(
		"WORLD_HUD_OWNER_REVIEW_MORE opened=true drawer_visible=true"
	)

	var collapse_button := _named_button("WorldHudCollapseButton")
	if collapse_button == null:
		return
	await _left_click(collapse_button, "收起 HUD")
	if _failed:
		return
	await _settle_frames(5)
	var restore_button := _named_button("WorldHudRestoreButton")
	if restore_button == null:
		return
	if not bool(view.call("is_collapsed")):
		_fail_capture("点击收起后 HUD 状态仍是展开")
		return
	if not restore_button.is_visible_in_tree():
		_fail_capture("HUD 收起后没有显示唯一恢复按钮")
		return
	if drawer.is_visible_in_tree():
		_fail_capture("HUD 收起后更多抽屉仍可见")
		return
	if host.action_bar == null or not host.action_bar.is_visible_in_tree():
		_fail_capture("HUD 收起后承载恢复按钮的操作层不可见")
		return
	for control in [host.top_panel, host.side_panel, host.battle_message_panel, more_button]:
		if control is CanvasItem and (control as CanvasItem).is_visible_in_tree():
			_fail_capture("HUD 收起后仍有恢复按钮以外的主层可见")
			return
	for entry_id in [
		"character",
		"backpack",
		"pet",
		"map",
		"quest",
		"party",
		"chat",
	]:
		var entry := _entry_button(entry_id)
		if entry != null and entry.is_visible_in_tree():
			_fail_capture("HUD 收起后仍显示入口：%s" % entry_id)
			return
	await _hold("hud_collapsed_restore_only", 3.5)

	await _left_click(restore_button, "恢复 HUD")
	if _failed:
		return
	await _settle_frames(5)
	if bool(view.call("is_collapsed")):
		_fail_capture("点击恢复后 HUD 仍处于收起状态")
		return
	if restore_button.is_visible_in_tree():
		_fail_capture("HUD 展开后恢复按钮没有隐藏")
		return
	if (
		host.top_panel == null
		or not host.top_panel.is_visible_in_tree()
		or host.side_panel == null
		or not host.side_panel.is_visible_in_tree()
		or host.action_bar == null
		or not host.action_bar.is_visible_in_tree()
	):
		_fail_capture("点击恢复后完整 HUD 没有重新显示")
		return
	await _hold("hud_expanded", 3.0)
	print(
		"WORLD_HUD_OWNER_REVIEW_COLLAPSE restore_only=true expanded=true"
	)


func _review_real_world_move() -> void:
	_close_all_review_panels()
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(4)
	if host.player == null or not is_instance_valid(host.player):
		_fail_capture("世界移动验收缺少玩家角色")
		return
	var start_position: Vector2 = host.player.global_position
	var start_cell := IsoMapModel.world_to_grid(host.map_data, start_position)
	var target := _find_reachable_visible_target(start_cell)
	if target.is_empty():
		_fail_capture("完整 HUD 展开后找不到可见、可达且不被 UI 覆盖的移动目标")
		return
	var click_result := await _send_real_world_click(
		target.get("screenPoint", Vector2.ZERO) as Vector2
	)
	if not bool(click_result.get("frameSeparated", false)):
		_fail_capture("世界移动左键的按下与释放没有跨帧")
		return
	await _hold("world_move", 4.0)
	var moved: bool = (
		host.player.global_position.distance_to(start_position) > 2.0
	)
	if not moved:
		for _frame in range(MOVE_FRAME_LIMIT):
			await host.get_tree().physics_frame
			if host.player.global_position.distance_to(start_position) > 2.0:
				moved = true
				break
	if not moved:
		_fail_capture("真实跨帧左键后玩家没有在世界中移动")
		return
	print(
		"WORLD_HUD_OWNER_REVIEW_MOVE real_click=true moved=true "
		+ "frame_separated=true"
	)


func _find_reachable_visible_target(start_cell: Vector2i) -> Dictionary:
	var offsets: Array[Vector2i] = [
		Vector2i(3, -3),
		Vector2i(4, -2),
		Vector2i(2, -4),
		Vector2i(3, 0),
		Vector2i(0, 3),
		Vector2i(-3, 3),
		Vector2i(-4, 2),
		Vector2i(-2, 4),
		Vector2i(2, 2),
		Vector2i(-2, -2),
		Vector2i(1, 0),
		Vector2i(0, 1),
		Vector2i(-1, 0),
		Vector2i(0, -1),
	]
	var viewport_rect := Rect2(
		Vector2(48, 72),
		Vector2(EXPECTED_VIEWPORT - Vector2i(96, 144))
	)
	for offset in offsets:
		var candidate := start_cell + offset
		if not IsoMapModel.is_walkable(host.map_data, candidate):
			continue
		if _near_interaction_source(candidate):
			continue
		var path: Array[Vector2i] = IsoMapModel.find_path(
			host.map_data, start_cell, candidate
		)
		if (
			path.size() < 2
			or path[0] != start_cell
			or path[path.size() - 1] != candidate
		):
			continue
		var screen_point: Vector2 = host._world_to_screen(
			IsoMapModel.grid_to_world(host.map_data, candidate)
		)
		if (
			not viewport_rect.has_point(screen_point)
			or host._is_ui_point(screen_point)
		):
			continue
		return {
			"cell": candidate,
			"screenPoint": screen_point,
			"pathLength": path.size(),
		}
	return {}


func _near_interaction_source(candidate: Vector2i) -> bool:
	for value in host.map_data.get("interactionPoints", []):
		if not (value is Dictionary):
			continue
		var cell_value = (value as Dictionary).get("cell", [0, 0])
		if not (cell_value is Array) or (cell_value as Array).size() < 2:
			continue
		var source := Vector2i(
			int((cell_value as Array)[0]),
			int((cell_value as Array)[1])
		)
		if maxi(absi(candidate.x - source.x), absi(candidate.y - source.y)) <= 2:
			return true
	return false


func _send_real_world_click(screen_point: Vector2) -> Dictionary:
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = screen_point
	press.global_position = screen_point
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = screen_point
	release.global_position = screen_point
	var release_frame := Engine.get_process_frames()
	Input.parse_input_event(release)
	await host.get_tree().process_frame
	_real_left_click_count += 1
	return {
		"pressProcessFrame": press_frame,
		"releaseProcessFrame": release_frame,
		"frameSeparated": release_frame > press_frame,
	}


func _close_all_review_panels() -> void:
	if host.has_method("_close_player_status_panel"):
		host._close_player_status_panel()
	if host.has_method("_close_backpack_panel"):
		host._close_backpack_panel()
	if host.has_method("_close_pet_panel"):
		host._close_pet_panel()
	if host.has_method("_close_quest_panel"):
		host._close_quest_panel()
	if host.has_method("_close_map_panel"):
		host._close_map_panel()
	if host.has_method("_close_chat_panel"):
		host._close_chat_panel()
	if host.has_method("_close_party_panel"):
		host._close_party_panel(false)


func _world_hud_view():
	if host.world_hud_awakened_view == null:
		_fail_capture("觉醒式世界 HUD 视图尚未接入 Main.tscn")
		return null
	var view = host.world_hud_awakened_view
	for method_name in [
		"entry_button",
		"layout_contract",
		"set_collapsed",
		"is_collapsed",
	]:
		if not view.has_method(method_name):
			_fail_capture("世界 HUD 视图缺少稳定验收 API：%s" % method_name)
			return null
	return view


func _entry_button(entry_id: String) -> Button:
	var view = _world_hud_view()
	if view == null:
		return null
	var value = view.call("entry_button", entry_id)
	if not (value is Button):
		_fail_capture("世界 HUD 入口不是按钮：%s" % entry_id)
		return null
	return value as Button


func _layout_contract() -> Dictionary:
	var view = _world_hud_view()
	if view == null:
		return {}
	var value = view.call("layout_contract")
	if not (value is Dictionary):
		_fail_capture("世界 HUD layout_contract 返回值无效")
		return {}
	return (value as Dictionary).duplicate(true)


func _active_side_tab_is(expected: String) -> bool:
	var active := str(_layout_contract().get("activeSideTab", "")).to_lower()
	if expected == "task":
		return active == "task" or active == "quest"
	return active == expected.to_lower()


func _named_button(node_name: String) -> Button:
	var value := _named_control(node_name)
	if value == null:
		_fail_capture("世界 HUD 缺少按钮：%s" % node_name)
		return null
	if not (value is Button):
		_fail_capture("世界 HUD 节点不是按钮：%s" % node_name)
		return null
	return value as Button


func _named_control(node_name: String) -> Control:
	var view = host.world_hud_awakened_view
	if view is Node:
		var value = (view as Node).find_child(node_name, true, false)
		if value is Control:
			return value as Control
	if host.hud_root is Node:
		var value = (host.hud_root as Node).find_child(node_name, true, false)
		if value is Control:
			return value as Control
	return null


func _left_click(control: Control, label: String) -> Dictionary:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		_fail_capture("%s不可用，无法执行真实左键" % label)
		return {}
	var viewport_point := control.get_global_rect().get_center()
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
	var motion := InputEventMouseMotion.new()
	motion.position = input_position
	motion.global_position = input_position
	Input.parse_input_event(motion)
	await host.get_tree().process_frame
	var hovered: Control = host.get_viewport().gui_get_hovered_control()
	print(
		(
			"WORLD_HUD_OWNER_REVIEW_CLICK label=%s target=%s hovered=%s "
			+ "center=%s rect=%s"
		)
		% [
			label,
			str(control.get_path()),
			str(hovered.get_path()) if hovered != null else "<none>",
			str(viewport_point),
			str(control.get_global_rect()),
		]
	)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = input_position
	press.global_position = input_position
	var press_frame := Engine.get_process_frames()
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	await host.get_tree().physics_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = input_position
	release.global_position = input_position
	var release_frame := Engine.get_process_frames()
	Input.parse_input_event(release)
	await host.get_tree().process_frame
	_real_left_click_count += 1
	if release_frame <= press_frame:
		_fail_capture("%s的左键按下与释放没有跨帧" % label)
		return {}
	return {
		"pressProcessFrame": press_frame,
		"releaseProcessFrame": release_frame,
		"frameSeparated": true,
	}


func _settle_frames(frame_count: int) -> void:
	for _frame in range(maxi(0, frame_count)):
		await host.get_tree().process_frame


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"WORLD_HUD_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("WORLD_HUD_OWNER_REVIEW_FAILED %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().quit(1)
