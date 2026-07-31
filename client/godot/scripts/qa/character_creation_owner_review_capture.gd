extends SceneTree

const CharacterEntryFlowController := preload(
	"res://scripts/ui/character_entry_flow_controller.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const REVIEW_NAME := "山岚"

var _panel: Control
var _created_payload: Dictionary = {}
var _failed := false
var _started_msec := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_started_msec = Time.get_ticks_msec()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP
	_panel = CharacterEntryFlowController.new()
	_panel.create_character_requested.connect(
		func(payload: Dictionary) -> void:
			_created_payload = payload.duplicate(true)
	)
	root.add_child(_panel)
	_panel.open_with_roster({}, "", "")
	await _settle_frames(4)
	print("CHARACTER_CREATION_OWNER_REVIEW_START viewport=1280x720 speed=1.00x backend=false")
	await _hold(1.8)

	var empty_card = _panel.call("slot_card", 0)
	if not (empty_card is Button):
		_fail("找不到第一个空角色槽")
		return
	await _left_click(empty_card as Button)
	await _hold(2.0)

	for index in [1, 2, 3, 0]:
		var appearance := _panel.get_node_or_null(
			"CharacterCreationPanel/Appearance%d" % index
		) as Button
		if appearance == null or appearance.disabled:
			_fail("第%d个人物形象不可用" % (index + 1))
			return
		await _left_click(appearance)
		await _hold(1.4)

	var earth_plus := _panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementEarthPlus"
	) as Button
	var water_plus := _panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementWaterPlus"
	) as Button
	if earth_plus == null or water_plus == null:
		_fail("缺少元素加点按钮")
		return
	for _index in range(6):
		await _left_click(earth_plus)
		await _hold(0.10)
	for _index in range(4):
		await _left_click(water_plus)
		await _hold(0.10)
	await _hold(1.2)

	var name_input := _panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/NameInput"
	) as LineEdit
	if name_input == null:
		_fail("缺少角色名输入框")
		return
	await _left_click(name_input)
	await _type_text(name_input, REVIEW_NAME)
	await _hold(1.4)

	var confirm := _panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ConfirmCreationButton"
	) as Button
	if confirm == null or confirm.disabled:
		_fail("完整配置后创建按钮仍不可用")
		return
	await _left_click(confirm)
	await _hold(0.8)
	if _created_payload.is_empty():
		_fail("创建按钮没有输出角色配置")
		return
	_panel.call("present_roster", {
		"selectionRequired": true,
		"characters": [{
			"playerId": "review_created_player",
			"slotIndex": 0,
			"name": str(_created_payload.get("displayName", REVIEW_NAME)),
			"level": 1,
			"mapName": "火芽村",
			"appearanceId": str(
				_created_payload.get("appearanceId", "novice_hunter_v1")
			),
			"elements": (
				(_created_payload.get("elements", {}) as Dictionary).duplicate(true)
				if _created_payload.get("elements", {}) is Dictionary
				else {}
			),
			"needsElementAllocation": false,
		}],
	}, "review_created_player")
	_panel.call("show_notice", "角色创建成功，请选择角色进入游戏")
	await _hold(3.0)

	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		"CHARACTER_CREATION_OWNER_REVIEW_END elapsed_wall=%.3f speed=1.00x backend=false"
		% elapsed
	)
	quit(0)


func _left_click(control: Control) -> void:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		_fail("目标按钮不可用")
		return
	var viewport_center := control.get_global_rect().get_center()
	var center: Vector2 = root.get_screen_transform() * viewport_center
	var motion := InputEventMouseMotion.new()
	motion.position = center
	motion.global_position = center
	Input.parse_input_event(motion)
	await process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = center
	press.global_position = center
	Input.parse_input_event(press)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.position = center
	release.global_position = center
	Input.parse_input_event(release)
	await process_frame


func _type_text(line_edit: LineEdit, value: String) -> void:
	line_edit.text = ""
	line_edit.grab_focus()
	await process_frame
	for index in range(value.length()):
		var unicode_value := value.unicode_at(index)
		var press := InputEventKey.new()
		press.pressed = true
		press.unicode = unicode_value
		Input.parse_input_event(press)
		await process_frame
		var release := InputEventKey.new()
		release.pressed = false
		release.unicode = unicode_value
		Input.parse_input_event(release)
		await process_frame
		await _hold(0.16)


func _settle_frames(count: int) -> void:
	for _index in range(maxi(1, count)):
		await process_frame


func _hold(seconds: float) -> void:
	await create_timer(maxf(0.01, seconds), true, false, true).timeout


func _fail(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("character creation owner review failed: %s" % message)
	quit(1)
