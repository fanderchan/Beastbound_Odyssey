extends RefCounted

const PlayerAppearanceCatalog := preload(
	"res://scripts/player/player_appearance_catalog.gd"
)

const CAPTURE_FLAG := "--character-entry-owner-review-capture"
const REVIEW_FPS := 30
const REVIEW_CHARACTER_NAME := "林岚"
const CREATED_PLAYER_ID := "character_review_created"
const FINAL_APPEARANCE_ID := "ember_spark_v1"
const APPEARANCE_SEQUENCE := [
	"novice_hunter_v1",
	"obsidian_scout_v1",
	"frost_whisper_v1",
	"ember_spark_v1",
]
const FINAL_ELEMENTS := {
	"earth": 6,
	"water": 4,
	"fire": 0,
	"wind": 0,
}

var host
var _started_msec: int = 0
var _failed := false
var _created_payload: Dictionary = {}
var _network_create_handler_disconnected := false


func _init(host_node = null) -> void:
	host = host_node


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	await _configure_isolated_character_entry()
	if _failed:
		return
	print(
		(
			"CHARACTER_ENTRY_OWNER_REVIEW_START scene=Main.tscn "
			+ "viewport=1280x720 speed=1.00x roster=four_empty "
			+ "backend=false profile_save=false"
		)
	)
	await _hold("four_empty_slots", 2.0)
	await _open_creation_configuration()
	if _failed:
		return
	await _hold("creation_configuration_open", 1.4)

	for appearance_id_value in APPEARANCE_SEQUENCE:
		var appearance_id := str(appearance_id_value)
		await _select_appearance(appearance_id)
		if _failed:
			return
		await _hold("appearance_%s" % appearance_id, 1.0)

	await _allocate_remaining_point_preview()
	if _failed:
		return
	await _choose_random_name()
	if _failed:
		return
	await _enter_character_name()
	if _failed:
		return
	await _submit_and_present_authoritative_result()
	if _failed:
		return

	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"CHARACTER_ENTRY_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "scene=Main.tscn speed=1.00x roster=isolated "
			+ "backend=false payload=captured profile_save=false "
			+ "selected=%s appearance=%s elements=earth6_water4"
		) % [elapsed, CREATED_PLAYER_ID, FINAL_APPEARANCE_ID]
	)
	host.get_tree().quit(0)


func _configure_isolated_character_entry() -> void:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return
	if host.character_entry_panel == null:
		_fail_capture("Main 尚未构建 character_entry_panel")
		return
	var panel = _panel()
	if panel == null:
		return
	if host.hud_root == null or panel.get_parent() != host.hud_root:
		_fail_capture("角色入口不是 Main.tscn 的真实 HUD 节点")
		return
	var catalog_ids := PlayerAppearanceCatalog.appearance_ids()
	if catalog_ids.size() != APPEARANCE_SEQUENCE.size():
		_fail_capture("人物形象目录不是本阶段确认的四个形象")
		return
	for index in range(APPEARANCE_SEQUENCE.size()):
		if str(catalog_ids[index]) != str(APPEARANCE_SEQUENCE[index]):
			_fail_capture("人物形象目录顺序与创建页契约不一致")
			return

	host.profile_save_enabled = false
	host.account_authenticated = false
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
	]:
		var request_value = host.get(request_name)
		if request_value is HTTPRequest:
			(request_value as HTTPRequest).cancel_request()

	if host.character_entry_coordinator != null:
		host.character_entry_coordinator.reset()
		var network_handler := Callable(
			host.character_entry_coordinator,
			"_on_create_character_requested"
		)
		if panel.create_character_requested.is_connected(network_handler):
			panel.create_character_requested.disconnect(network_handler)
		_network_create_handler_disconnected = not (
			panel.create_character_requested.is_connected(network_handler)
		)
	else:
		_network_create_handler_disconnected = true
	if not _network_create_handler_disconnected:
		_fail_capture("无法隔离角色创建网络处理器")
		return
	var capture_handler := Callable(self, "_capture_created_payload")
	if not panel.create_character_requested.is_connected(capture_handler):
		panel.create_character_requested.connect(capture_handler)

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

	panel.configure_visual_sources({})
	panel.open_with_roster(_empty_review_roster(), "", "")
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(5)
	var snapshot := panel.snapshot() as Dictionary
	var roster := panel.roster_snapshot() as Dictionary
	if (
		host.profile_save_enabled
		or not host.current_account_session.is_empty()
		or host.account_authenticated
		or str(host.server_profile_sync_state) != "off"
		or not panel.visible
		or int(snapshot.get("slotCount", 0)) != 4
		or str(snapshot.get("selectedPlayerId", "")) != ""
		or bool(snapshot.get("creationOpen", true))
		or int(roster.get("occupiedCount", -1)) != 0
		or not _network_create_handler_disconnected
	):
		_fail_capture("Main HUD 没有稳定进入四空槽离线状态")
		return
	if (
		host.character_entry_coordinator != null
		and host.character_entry_coordinator.has_pending_session()
	):
		_fail_capture("离线录制仍残留角色服务会话")
		return
	print(
		"CHARACTER_ENTRY_OWNER_REVIEW_ISOLATION "
		+ "scene=Main.tscn hud=production backend=false "
		+ "network_create_handler=false profile_save=false"
	)


func _empty_review_roster() -> Dictionary:
	var characters: Array[Dictionary] = []
	for slot_index in range(4):
		characters.append({
			"occupied": false,
			"slotIndex": slot_index,
		})
	return {
		"schemaVersion": 1,
		"selectionRequired": true,
		"selectedPlayerId": "",
		"characters": characters,
	}


func _open_creation_configuration() -> void:
	var panel = _panel()
	if panel == null:
		return
	var empty_card = panel.slot_card(0)
	if not (empty_card is Button):
		_fail_capture("找不到第一个空角色槽")
		return
	for attempt in range(2):
		await _left_click(empty_card as Button, "第一个空角色槽")
		if _failed:
			return
		await _settle_frames(3)
		var snapshot := panel.snapshot() as Dictionary
		var creation := snapshot.get("creation", {}) as Dictionary
		if (
			bool(snapshot.get("creationOpen", false))
			and int(snapshot.get("creationSlotIndex", -1)) == 0
			and str(creation.get("mode", "")) == "create"
			and int(creation.get("slotIndex", -1)) == 0
			and int(creation.get("remainingPoints", -1)) == 10
		):
			return
		if attempt == 0:
			print(
				"CHARACTER_ENTRY_OWNER_REVIEW_INPUT_RETRY "
				+ "target=first_empty_slot backend=false"
			)
			await _settle_frames(3)
	_fail_capture("点击空槽后没有打开完整角色创建配置页")


func _select_appearance(appearance_id: String) -> void:
	var creation = _creation_panel()
	if creation == null:
		return
	var button = creation.call("appearance_button", appearance_id)
	if not (button is Button) or (button as Button).disabled:
		_fail_capture("人物形象不可选：%s" % appearance_id)
		return
	for attempt in range(2):
		await _left_click(button as Button, "人物形象%s" % appearance_id)
		if _failed:
			return
		await _settle_frames(2)
		var creation_snapshot := creation.call("snapshot") as Dictionary
		if (
			str(creation_snapshot.get("appearanceId", "")) == appearance_id
			and bool(creation_snapshot.get("showcaseVisible", false))
		):
			return
		if attempt == 0:
			await _settle_frames(2)
	_fail_capture("人物形象切换没有刷新正式展示：%s" % appearance_id)


func _allocate_remaining_point_preview() -> void:
	var creation = _creation_panel()
	if creation == null:
		return
	var earth_plus = creation.call("element_button", "earth", true)
	var water_plus = creation.call("element_button", "water", true)
	if not (earth_plus is Button) or not (water_plus is Button):
		_fail_capture("创建配置页缺少地／水元素按钮")
		return
	await _click_element_until(creation, "earth", earth_plus as Button, 6)
	if _failed:
		return
	await _click_element_until(creation, "water", water_plus as Button, 3)
	if _failed:
		return
	await _settle_frames(2)
	var incomplete := creation.call("snapshot") as Dictionary
	if (
		int(incomplete.get("remainingPoints", -1)) != 1
		or not bool(incomplete.get("submitDisabled", false))
		or not _elements_equal(
			incomplete.get("elements", {}),
			{"earth": 6, "water": 3, "fire": 0, "wind": 0}
		)
	):
		_fail_capture("剩余1点时没有阻止创建")
		return
	await _hold("remaining_point_blocks_creation", 1.2)

	await _click_element_until(creation, "water", water_plus as Button, 4)
	if _failed:
		return
	await _settle_frames(2)
	var complete := creation.call("snapshot") as Dictionary
	if (
		int(complete.get("remainingPoints", -1)) != 0
		or not _elements_equal(complete.get("elements", {}), FINAL_ELEMENTS)
	):
		_fail_capture("合法地6水4元素配置没有完成")
		return
	await _hold("legal_dual_elements_complete", 1.2)


func _click_element_until(
	creation,
	element_key: String,
	button: Button,
	target_value: int
) -> void:
	for _attempt in range(target_value + 4):
		var snapshot := creation.call("snapshot") as Dictionary
		var elements := snapshot.get("elements", {}) as Dictionary
		var current := int(elements.get(element_key, 0))
		if current == target_value:
			return
		if current > target_value:
			_fail_capture("元素按钮点击超过预期：%s" % element_key)
			return
		await _left_click(button, "%s元素加点" % element_key)
		if _failed:
			return
		await _settle_frames(1)
	_fail_capture("元素按钮没有达到预期点数：%s" % element_key)


func _choose_random_name() -> void:
	var creation = _creation_panel()
	if creation == null:
		return
	var random_button = creation.get_node_or_null(
		"CreationBoard/RandomNameButton"
	)
	if not (random_button is Button) or (random_button as Button).disabled:
		_fail_capture("随机名字按钮不可用")
		return
	await _left_click(random_button as Button, "随机名字")
	if _failed:
		return
	await _settle_frames(2)
	var snapshot := creation.call("snapshot") as Dictionary
	if str(snapshot.get("name", "")).strip_edges() == "":
		_fail_capture("随机名字按钮没有生成名字")
		return
	await _hold("random_name_selected", 1.0)


func _enter_character_name() -> void:
	var creation = _creation_panel()
	if creation == null:
		return
	var input = creation.get_node_or_null("CreationBoard/NameInput")
	if not (input is LineEdit):
		_fail_capture("创建配置页缺少角色名输入框")
		return
	var line_edit := input as LineEdit
	await _left_click(line_edit, "角色名输入框")
	if _failed:
		return
	await _send_key(KEY_END)
	var previous_length := line_edit.text.length()
	for _index in range(previous_length):
		await _send_key(KEY_BACKSPACE)
		if not line_edit.has_focus():
			_fail_capture("清空随机名字时输入焦点丢失")
			return
	if line_edit.text != "":
		_fail_capture("真实退格键没有清空随机名字")
		return
	await _type_text(line_edit, REVIEW_CHARACTER_NAME)
	if _failed:
		return
	await _settle_frames(2)
	var snapshot := creation.call("snapshot") as Dictionary
	if (
		line_edit.text != REVIEW_CHARACTER_NAME
		or str(snapshot.get("name", "")) != REVIEW_CHARACTER_NAME
		or bool(snapshot.get("submitDisabled", true))
	):
		_fail_capture("真实键盘输入后创建配置仍未就绪")
		return
	await _hold("typed_name_ready", 1.4)


func _submit_and_present_authoritative_result() -> void:
	var panel = _panel()
	var creation = _creation_panel()
	if panel == null or creation == null:
		return
	_created_payload.clear()
	var submit = creation.get_node_or_null(
		"CreationBoard/ConfirmCreationButton"
	)
	if not (submit is Button) or (submit as Button).disabled:
		_fail_capture("完整配置后创建角色按钮仍不可用")
		return
	await _left_click(submit as Button, "创建角色")
	if _failed:
		return
	await _settle_frames(3)
	if not _payload_matches_expected(_created_payload):
		_fail_capture("创建按钮没有输出预期的一次性角色配置payload")
		return
	if (
		not host.current_account_session.is_empty()
		or host.account_authenticated
		or not _network_create_handler_disconnected
	):
		_fail_capture("捕获创建payload时离线隔离失效")
		return
	print(
		(
			"CHARACTER_ENTRY_OWNER_REVIEW_PAYLOAD slot=0 name=%s "
			+ "appearance=%s earth=6 water=4 fire=0 wind=0 "
			+ "scene=Main.tscn backend=false"
		) % [REVIEW_CHARACTER_NAME, FINAL_APPEARANCE_ID]
	)
	await _hold("create_payload_captured", 0.9)

	panel.present_roster(
		_created_review_roster(_created_payload),
		CREATED_PLAYER_ID
	)
	panel.show_notice("角色创建成功，请选择角色进入游戏")
	if host.has_method("_layout_hud"):
		host._layout_hud()
	await _settle_frames(4)
	var snapshot := panel.snapshot() as Dictionary
	var roster := panel.roster_snapshot() as Dictionary
	var selected := panel.selected_character() as Dictionary
	if (
		bool(snapshot.get("creationOpen", true))
		or str(snapshot.get("selectedPlayerId", "")) != CREATED_PLAYER_ID
		or int(roster.get("occupiedCount", 0)) != 1
		or str(selected.get("appearanceId", "")) != FINAL_APPEARANCE_ID
		or not _elements_equal(selected.get("elements", {}), FINAL_ELEMENTS)
	):
		_fail_capture("本地模拟权威返回后没有展示新建角色槽")
		return
	await _hold("authoritative_created_slot", 3.0)


func _created_review_roster(payload: Dictionary) -> Dictionary:
	return {
		"schemaVersion": 1,
		"selectionRequired": true,
		"selectedPlayerId": CREATED_PLAYER_ID,
		"characters": [
			{
				"occupied": true,
				"playerId": CREATED_PLAYER_ID,
				"slotIndex": int(payload.get("slotIndex", 0)),
				"name": str(payload.get("displayName", REVIEW_CHARACTER_NAME)),
				"level": 1,
				"rebirthCount": 0,
				"mapId": "firebud_village",
				"mapName": "火芽村",
				"appearanceId": str(
					payload.get("appearanceId", FINAL_APPEARANCE_ID)
				),
				"elements": (
					(payload.get("elements", {}) as Dictionary).duplicate(true)
					if payload.get("elements", {}) is Dictionary
					else {}
				),
				"needsElementAllocation": false,
			},
		],
	}


func _capture_created_payload(payload: Dictionary) -> void:
	_created_payload = payload.duplicate(true)


func _payload_matches_expected(payload: Dictionary) -> bool:
	return (
		int(payload.get("slotIndex", -1)) == 0
		and str(payload.get("displayName", "")) == REVIEW_CHARACTER_NAME
		and str(payload.get("appearanceId", "")) == FINAL_APPEARANCE_ID
		and _elements_equal(payload.get("elements", {}), FINAL_ELEMENTS)
	)


func _elements_equal(value, expected: Dictionary) -> bool:
	if not (value is Dictionary):
		return false
	var elements := value as Dictionary
	for key in ["earth", "water", "fire", "wind"]:
		if int(elements.get(key, -1)) != int(expected.get(key, -2)):
			return false
	return true


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


func _send_key(keycode: int) -> void:
	var press := InputEventKey.new()
	press.pressed = true
	press.keycode = keycode
	press.physical_keycode = keycode
	Input.parse_input_event(press)
	await host.get_tree().process_frame
	var release := InputEventKey.new()
	release.pressed = false
	release.keycode = keycode
	release.physical_keycode = keycode
	Input.parse_input_event(release)
	await host.get_tree().process_frame


func _panel():
	if host == null or host.character_entry_panel == null:
		_fail_capture("角色入口面板不可用")
		return null
	return host.character_entry_panel


func _creation_panel():
	var panel = _panel()
	if panel == null:
		return null
	var creation = panel.get_node_or_null("CharacterCreationPanel")
	if creation == null:
		_fail_capture("Main HUD 缺少角色创建配置页")
		return null
	return creation


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
