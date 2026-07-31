extends RefCounted

const CAPTURE_FLAG := "--character-entry-owner-review-capture"
const REVIEW_FPS := 30
const PRIMARY_PLAYER_ID := "character_review_primary"
const SECONDARY_PLAYER_ID := "character_review_secondary"
const REVIEW_CHARACTER_NAME := "林岚"

var host
var _started_msec: int = 0
var _failed := false


func _init(host_node = null) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	await _configure_isolated_character_entry()
	if _failed:
		return
	await _hold("primary_character_home", 3.2)
	await _select_slot(1, SECONDARY_PLAYER_ID, "副角色卡")
	if _failed:
		return
	await _hold("alternate_character_selected", 2.8)
	await _open_creation_dialog()
	if _failed:
		return
	await _hold("creation_dialog_open", 2.5)
	await _enter_character_name()
	if _failed:
		return
	await _hold("creation_name_entered", 3.0)
	await _cancel_creation_dialog()
	if _failed:
		return
	await _hold("creation_cancelled", 2.2)
	await _select_slot(0, PRIMARY_PLAYER_ID, "主角色卡")
	if _failed:
		return
	await _hold("primary_character_restored", 3.5)
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"CHARACTER_ENTRY_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "speed=1.00x roster=isolated backend=false selected=%s"
		) % [elapsed, PRIMARY_PLAYER_ID]
	)
	host.get_tree().quit(0)


func _configure_isolated_character_entry() -> void:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return
	if host.character_entry_panel == null:
		_fail_capture("Main 尚未构建 character_entry_panel")
		return
	host.profile_save_enabled = false
	host.account_authenticated = false
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	# The capture never owns a server session.  Stop every normal-runtime poller
	# before showing the local roster, and cancel a request that might still be
	# draining from startup.  This is deliberately redundant with the fresh
	# user-data directory enforced by the Python recorder.
	if host.has_method("_stop_server_event_stream"):
		host._stop_server_event_stream()
	if host.has_method("_stop_online_position_sync"):
		host._stop_online_position_sync()
	for request_name in [
		"auth_http_request",
		"online_position_http_request",
	]:
		var request_value = host.get(request_name)
		if request_value is HTTPRequest:
			(request_value as HTTPRequest).cancel_request()
	if host.character_entry_coordinator != null:
		host.character_entry_coordinator.reset()
	for panel_name in [
		"auth_panel",
		"account_panel",
		"top_panel",
		"side_panel",
		"action_bar",
		"battle_message_panel",
	]:
		var panel_value = host.get(panel_name)
		if panel_value is CanvasItem:
			(panel_value as CanvasItem).visible = false
	var panel = _panel()
	if panel == null:
		return
	panel.configure_visual_sources({})
	panel.open_with_roster(
		_review_roster(),
		PRIMARY_PLAYER_ID,
		""
	)
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(4)
	var snapshot := panel.snapshot() as Dictionary
	if (
		not host.current_account_session.is_empty()
		or host.account_authenticated
		or str(host.server_profile_sync_state) != "off"
		or not panel.visible
		or int(snapshot.get("slotCount", 0)) != 4
		or str(snapshot.get("selectedPlayerId", ""))
			!= PRIMARY_PLAYER_ID
		or bool(snapshot.get("creationOpen", true))
	):
		_fail_capture("隔离角色主页没有稳定展示四槽和主角色")


func _review_roster() -> Dictionary:
	return {
		"schemaVersion": 1,
		"selectionRequired": true,
		"selectedPlayerId": PRIMARY_PLAYER_ID,
		"characters": [
			{
				"occupied": true,
				"playerId": PRIMARY_PLAYER_ID,
				"slotIndex": 0,
				"name": "赤芽猎人",
				"level": 80,
				"rebirthCount": 0,
				"mapId": "firebud_training_ground",
				"mapName": "火芽训练场",
				"appearanceId": "novice_hunter_v1",
			},
			{
				"occupied": true,
				"playerId": SECONDARY_PLAYER_ID,
				"slotIndex": 1,
				"name": "岚岸猎手",
				"level": 46,
				"rebirthCount": 1,
				"mapId": "tidefin_feed",
				"mapName": "雾潮海岸",
				"appearanceId": "novice_hunter_v1",
			},
			{
				"occupied": false,
				"slotIndex": 2,
			},
			{
				"occupied": false,
				"slotIndex": 3,
			},
		],
	}


func _select_slot(
	slot_index: int,
	expected_player_id: String,
	label: String
) -> void:
	var panel = _panel()
	if panel == null:
		return
	var card = panel.slot_card(slot_index)
	if not (card is Button):
		_fail_capture("找不到%s" % label)
		return
	await _left_click(card as Button, label)
	if _failed:
		return
	await _settle_frames(2)
	if str(panel.selected_player_id()) != expected_player_id:
		_fail_capture("点击%s后没有切换本地角色预览" % label)


func _open_creation_dialog() -> void:
	var panel = _panel()
	if panel == null:
		return
	var empty_card = panel.slot_card(2)
	if not (empty_card is Button):
		_fail_capture("找不到第三个空角色槽")
		return
	await _left_click(empty_card as Button, "第三个空角色槽")
	if _failed:
		return
	await _settle_frames(2)
	var snapshot := panel.snapshot() as Dictionary
	if (
		not bool(snapshot.get("creationOpen", false))
		or int(snapshot.get("creationSlotIndex", -1)) != 2
	):
		_fail_capture("点击空角色槽后没有打开对应建角弹窗")


func _enter_character_name() -> void:
	var panel = _panel()
	if panel == null:
		return
	var input = panel.get_node_or_null(
		"CreateModalShade/CreatePanel/NameInput"
	)
	if not (input is LineEdit):
		_fail_capture("建角弹窗缺少角色名输入框")
		return
	var line_edit := input as LineEdit
	line_edit.grab_focus()
	await _settle_frames(2)
	await _type_text(line_edit, REVIEW_CHARACTER_NAME)
	if _failed:
		return
	if line_edit.text != REVIEW_CHARACTER_NAME:
		_fail_capture(
			"真实按键输入失败：expected=%s actual=%s"
			% [REVIEW_CHARACTER_NAME, line_edit.text]
		)


func _cancel_creation_dialog() -> void:
	var panel = _panel()
	if panel == null:
		return
	var cancel = panel.get_node_or_null(
		"CreateModalShade/CreatePanel/CancelCreateButton"
	)
	if not (cancel is Button):
		_fail_capture("建角弹窗缺少取消按钮")
		return
	await _left_click(cancel as Button, "取消创建角色")
	if _failed:
		return
	await _settle_frames(2)
	var snapshot := panel.snapshot() as Dictionary
	if (
		bool(snapshot.get("creationOpen", true))
		or str(snapshot.get("selectedPlayerId", ""))
			!= SECONDARY_PLAYER_ID
	):
		_fail_capture("取消建角后没有返回副角色选择页")


func _type_text(line_edit: LineEdit, value: String) -> void:
	for index in range(value.length()):
		var unicode_value := value.unicode_at(index)
		var press := InputEventKey.new()
		press.pressed = true
		press.unicode = unicode_value
		Input.parse_input_event(press)
		await host.get_tree().process_frame
		var release := InputEventKey.new()
		release.pressed = false
		release.unicode = unicode_value
		Input.parse_input_event(release)
		await host.get_tree().process_frame
		if not line_edit.has_focus():
			_fail_capture("角色名输入过程中焦点丢失")
			return


func _panel():
	if host == null or host.character_entry_panel == null:
		_fail_capture("角色入口面板不可用")
		return null
	return host.character_entry_panel


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
			"CHARACTER_ENTRY_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("CHARACTER_ENTRY_OWNER_REVIEW_FAILED %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().quit(1)
