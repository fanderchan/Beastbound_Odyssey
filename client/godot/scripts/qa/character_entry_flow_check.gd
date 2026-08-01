extends SceneTree

const CharacterRosterModelCheck := preload(
	"res://scripts/progression/character_roster_model_check.gd"
)
const CharacterRosterModel := preload(
	"res://scripts/progression/character_roster_model.gd"
)
const CharacterCreationModelCheck := preload(
	"res://scripts/progression/character_creation_model_check.gd"
)
const ServerAuthClientModel := preload(
	"res://scripts/progression/server_auth_client_model.gd"
)
const CharacterEntryFlowController := preload(
	"res://scripts/ui/character_entry_flow_controller.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)

var _errors: Array[String] = []
var _created_payloads: Array[Dictionary] = []
var _allocation_payloads: Array[Dictionary] = []
var _selected_player_ids: Array[String] = []
var _return_request_count := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var model_report := CharacterRosterModelCheck.run()
	for error_value in model_report.get("errors", []):
		_errors.append("角色列表模型：%s" % str(error_value))
	var creation_model_report := CharacterCreationModelCheck.run()
	for error_value in creation_model_report.get("errors", []):
		_errors.append("角色创建模型：%s" % str(error_value))
	_expect_request_contracts()

	var panel := CharacterEntryFlowController.new()
	panel.create_character_requested.connect(
		func(payload: Dictionary) -> void:
			_created_payloads.append(payload.duplicate(true))
	)
	panel.allocate_character_elements_requested.connect(
		func(payload: Dictionary) -> void:
			_allocation_payloads.append(payload.duplicate(true))
	)
	panel.select_character_requested.connect(
		func(player_id: String) -> void:
			_selected_player_ids.append(player_id)
	)
	panel.return_to_login_requested.connect(
		func() -> void:
			_return_request_count += 1
	)
	root.add_child(panel)
	var injected_texture := GradientTexture1D.new()
	var injected_appearances: Dictionary = {}
	for appearance_id in [
		"novice_hunter_v1",
		"obsidian_scout_v1",
		"frost_whisper_v1",
		"ember_spark_v1",
	]:
		injected_appearances[appearance_id] = {
			"portraitTexture": injected_texture,
			"showcaseTexture": injected_texture,
		}
	panel.configure_visual_sources({
		"backgroundTexture": injected_texture,
		"appearances": injected_appearances,
	})
	panel.open_with_roster({}, "", "fander")
	await process_frame
	await process_frame

	var empty_snapshot := panel.snapshot()
	_expect(
		int(empty_snapshot.get("slotCount", 0)) == 4
			and str(empty_snapshot.get("selectedPlayerId", "")) == ""
			and bool(empty_snapshot.get("enterDisabled", false)),
		"空账号没有展示四个空槽并禁止直接进入",
		_errors
	)
	_expect_layout(panel)

	var first_card := panel.slot_card(0)
	_expect(first_card != null, "缺少第一个角色槽按钮", _errors)
	if first_card != null:
		first_card.emit_signal("pressed")
	var create_open_snapshot := panel.snapshot()
	_expect(
		bool(create_open_snapshot.get("creationOpen", false))
			and int(create_open_snapshot.get("creationSlotIndex", -1)) == 0,
		"点击空槽没有打开对应建角表单",
		_errors
	)

	var creation_snapshot := (
		create_open_snapshot.get("creation", {}) as Dictionary
	)
	_expect(
		str(creation_snapshot.get("mode", "")) == "create"
			and int(creation_snapshot.get("remainingPoints", -1)) == 10
			and (creation_snapshot.get("availableAppearanceIds", []) as Array).size() == 4,
		"全屏建角页没有提供四形象、元素或创建模式",
		_errors
	)
	_expect_creation_layout(panel, creation_snapshot)
	_expect_earth_green(panel, false)

	var name_input := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/NameInput"
	) as LineEdit
	var create_button := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ConfirmCreationButton"
	) as Button
	var random_name_button := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/RandomNameButton"
	) as Button
	_expect(
		name_input != null
		and create_button != null
		and random_name_button != null,
		"建角表单缺少姓名输入、随机名或提交按钮",
		_errors
	)
	if name_input != null and random_name_button != null:
		random_name_button.emit_signal("pressed")
		var first_random_name := name_input.text
		random_name_button.emit_signal("pressed")
		var second_random_name := name_input.text
		_expect(
			first_random_name != ""
			and second_random_name != ""
			and first_random_name != second_random_name
			and CharacterRosterModel.character_name_errors(
				first_random_name
			).is_empty()
			and CharacterRosterModel.character_name_errors(
				second_random_name
			).is_empty(),
			"换一个按钮没有连续生成两个不同的安全名字",
			_errors
		)
	var appearance_button := panel.get_node_or_null(
		"CharacterCreationPanel/Appearance1"
	) as Button
	var earth_plus := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementEarthPlus"
	) as Button
	var water_plus := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementWaterPlus"
	) as Button
	_expect(
		appearance_button != null and earth_plus != null and water_plus != null,
		"建角页缺少形象切换或元素加点按钮",
		_errors
	)
	if (
		name_input != null
		and create_button != null
		and appearance_button != null
		and earth_plus != null
		and water_plus != null
	):
		appearance_button.emit_signal("pressed")
		for _index in range(6):
			earth_plus.emit_signal("pressed")
		for _index in range(4):
			water_plus.emit_signal("pressed")
		_expect_earth_green(panel, true)
		name_input.text = "管·理 员"
		name_input.emit_signal("text_changed", name_input.text)
		var restricted_snapshot := panel.snapshot()
		_expect(
			create_button.disabled
			and str(
				(restricted_snapshot.get("creation", {}) as Dictionary).get(
					"errorText",
					""
				)
			) == "这个名字不能使用，请换一个。",
			"敏感角色名没有即时禁止创建并显示安全提示",
			_errors
		)
		create_button.emit_signal("pressed")
		_expect(
			_created_payloads.is_empty(),
			"敏感角色名仍发出了创建请求",
			_errors
		)
		name_input.text = ""
		name_input.emit_signal("text_changed", name_input.text)
		create_button.emit_signal("pressed")
		var invalid_snapshot := panel.snapshot()
		_expect(
			_created_payloads.is_empty()
				and bool(
					(invalid_snapshot.get("creation", {}) as Dictionary).get(
						"submitDisabled",
						false
					)
				)
				and not bool(invalid_snapshot.get("loading", false)),
			"非法角色名仍允许提交",
			_errors
		)

		name_input.text = "  山岚  "
		name_input.emit_signal("text_changed", name_input.text)
		create_button.emit_signal("pressed")
		var creating_snapshot := panel.snapshot()
		_expect(
			_created_payloads.size() == 1
				and bool(creating_snapshot.get("loading", false))
				and str(creating_snapshot.get("pendingAction", ""))
					== "create",
			"有效建角没有进入单请求 loading 状态",
			_errors
		)
		if not _created_payloads.is_empty():
			_expect(
				_created_payloads[0] == {
						"slotIndex": 0,
						"displayName": "山岚",
						"appearanceId": "obsidian_scout_v1",
						"elements": {
							"earth": 6,
							"water": 4,
							"fire": 0,
							"wind": 0,
						},
				},
				"建角信号没有输出槽位、姓名、形象和元素",
				_errors
			)

	panel.show_error("这个名字已经被使用")
	var create_error_snapshot := panel.snapshot()
	_expect(
		not bool(create_error_snapshot.get("loading", true))
			and bool(create_error_snapshot.get("creationOpen", false))
			and str(create_error_snapshot.get("errorText", ""))
				== "这个名字已经被使用",
		"建角失败后没有保留表单并恢复交互",
		_errors
	)
	var creation_return := panel.get_node_or_null(
		"CharacterCreationPanel/CreationReturnButton"
	) as Button
	if creation_return != null:
		creation_return.emit_signal("pressed")
	_expect(
		not bool(panel.snapshot().get("creationOpen", true)),
		"建角页返回按钮没有做到不创建并回到角色槽",
		_errors
	)

	panel.present_roster({
		"characters": [{
			"playerId": "legacy_player",
			"slotIndex": 0,
			"name": "旧日猎人",
			"appearanceId": "novice_hunter_v1",
			"elements": null,
			"needsElementAllocation": true,
		}],
	}, "legacy_player")
	await process_frame
	var legacy_creation := (
		panel.snapshot().get("creation", {}) as Dictionary
	)
	_expect(
		str(legacy_creation.get("mode", "")) == "legacy_allocation"
			and not bool(legacy_creation.get("nameEditable", true))
			and str(legacy_creation.get("appearanceId", "")) == "novice_hunter_v1",
		"旧角色没有自动进入锁定姓名和形象的补元素页面",
		_errors
	)
	var fire_plus := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementFirePlus"
	) as Button
	var legacy_confirm := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ConfirmCreationButton"
	) as Button
	if fire_plus != null and legacy_confirm != null:
		for _index in range(10):
			fire_plus.emit_signal("pressed")
		legacy_confirm.emit_signal("pressed")
	_expect(
		_allocation_payloads == [{
			"playerId": "legacy_player",
			"elements": {
				"earth": 0,
				"water": 0,
				"fire": 10,
				"wind": 0,
			},
		}],
		"旧角色补元素没有输出精确的独立请求",
		_errors
	)
	panel.show_error("元素保存失败，请稍后重试")

	var fixture := {
		"selectionRequired": true,
		"characters": [
			{
				"playerId": "player_fire",
				"slotIndex": 0,
				"name": "山岚",
				"level": 12,
				"mapName": "火芽村",
				"appearanceId": "novice_hunter_v1",
				"elements": {"earth": 10, "water": 0, "fire": 0, "wind": 0},
				"needsElementAllocation": false,
			},
			{
				"playerId": "player_moss",
				"slotIndex": 1,
				"name": "苔羽",
				"level": 8,
				"mapName": "苔冠沼泽",
				"appearanceId": "novice_hunter_v1",
				"elements": {"earth": 0, "water": 10, "fire": 0, "wind": 0},
				"needsElementAllocation": false,
			},
			{
				"slotIndex": 2,
				"occupied": false,
				"schemaVersion": 1,
			},
			{
				"slotIndex": 3,
				"occupied": false,
				"schemaVersion": 1,
			},
		],
	}
	panel.present_roster(fixture, "player_fire")
	await process_frame
	var default_art_snapshot := panel.snapshot()
	var default_art_cards := default_art_snapshot.get("cards", []) as Array
	_expect(
		bool(default_art_snapshot.get("backgroundInjected", false))
			and bool(default_art_snapshot.get("showcaseInjected", false))
			and default_art_cards.size() == 4
			and bool(
				(default_art_cards[0] as Dictionary).get(
					"portraitVisible",
					false
				)
			),
		"正式营地背景、全身像或独立头像没有作为默认可见美术载入",
		_errors
	)
	panel.configure_visual_sources({
		"backgroundTexture": injected_texture,
		"appearances": injected_appearances,
	})
	panel.present_roster(fixture, "player_fire")
	await process_frame
	var roster_snapshot := panel.snapshot()
	_expect(
		str(roster_snapshot.get("selectedPlayerId", ""))
			== "player_fire"
			and str(roster_snapshot.get("selectedName", "")) == "山岚"
			and not bool(roster_snapshot.get("enterDisabled", true)),
		"角色列表没有选中指定的playerId或展示摘要",
		_errors
	)
	_expect(
		bool(roster_snapshot.get("backgroundInjected", false))
			and bool(roster_snapshot.get("showcaseInjected", false)),
		"可注入背景或人物全身贴图没有生效",
		_errors
	)
	var cards := roster_snapshot.get("cards", []) as Array
	_expect(
		cards.size() == 4
			and bool((cards[0] as Dictionary).get("occupied", false))
			and bool((cards[1] as Dictionary).get("occupied", false))
			and not bool((cards[2] as Dictionary).get("occupied", true))
			and not bool((cards[3] as Dictionary).get("occupied", true)),
		"两个真实角色和两个空槽没有稳定映射到四卡",
		_errors
	)

	var second_card := panel.slot_card(1)
	if second_card != null:
		second_card.emit_signal("pressed")
	var selected_snapshot := panel.snapshot()
	_expect(
		str(selected_snapshot.get("selectedPlayerId", ""))
			== "player_moss"
			and str(selected_snapshot.get("selectedName", "")) == "苔羽",
		"点击角色卡没有只更新本地选择和左侧预览",
		_errors
	)
	_expect(
		_selected_player_ids.is_empty(),
		"点击角色卡时过早发出了服务端选择请求",
		_errors
	)

	var enter_button := panel.get_node_or_null(
		"RightPanel/EnterGameButton"
	) as Button
	_expect(enter_button != null, "缺少进入游戏按钮", _errors)
	if enter_button != null:
		enter_button.emit_signal("pressed")
	var entering_snapshot := panel.snapshot()
	_expect(
		_selected_player_ids == ["player_moss"]
			and bool(entering_snapshot.get("loading", false))
			and str(entering_snapshot.get("pendingAction", ""))
				== "select",
		"进入游戏没有用playerId发出一次选择请求",
		_errors
	)

	panel.show_error("暂时无法进入，请稍后再试")
	var return_button := panel.get_node_or_null(
		"ReturnToLoginButton"
	) as Button
	if return_button != null:
		return_button.emit_signal("pressed")
	_expect(
		_return_request_count == 1,
		"返回登录按钮没有在非loading状态发出请求",
		_errors
	)

	var visible_text := panel.visible_text()
	_expect(
		visible_text.contains("山岚")
			and visible_text.contains("创建角色")
			and visible_text.contains("进入游戏")
			and visible_text.contains("返回"),
		"角色入口缺少核心玩家文案",
		_errors
	)
	_expect(
		not visible_text.contains("+"),
		"空角色卡仍使用文本加号代替正式图标美术",
		_errors
	)
	for forbidden in [
		"selectionEpoch",
		"selectionRequired",
		"player_fire",
		"player_moss",
		"QA",
		"debug",
	]:
		_expect(
			not visible_text.contains(forbidden),
			"玩家界面泄露内部字段或检查文案：%s" % forbidden,
			_errors
		)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.character_entry_flow_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {
			"width": VIEWPORT_SIZE.x,
			"height": VIEWPORT_SIZE.y,
		},
		"slotCount": int(panel.snapshot().get("slotCount", 0)),
		"createSignalCount": _created_payloads.size(),
		"allocationSignalCount": _allocation_payloads.size(),
		"selectSignalCount": _selected_player_ids.size(),
		"returnSignalCount": _return_request_count,
		"modelResult": str(model_report.get("result", "FAIL")),
		"creationModelResult": str(creation_model_report.get("result", "FAIL")),
		"errors": _errors,
	}
	print("character entry flow check: %s" % JSON.stringify(report))
	panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _expect_layout(panel: Control) -> void:
	var viewport_rect := Rect2(Vector2.ZERO, Vector2(VIEWPORT_SIZE))
	var panel_snapshot := panel.call("snapshot") as Dictionary
	var layout_rects := panel_snapshot.get("layoutRects", {}) as Dictionary
	for key in [
		"showcase",
		"rightPanel",
		"enterButton",
		"returnButton",
		"createPanel",
	]:
		var value = layout_rects.get(key, {})
		if not (value is Dictionary):
			_errors.append("布局缺少%s矩形" % key)
			continue
		var rect := _dictionary_rect(value as Dictionary)
		_expect(
			rect.size.x > 0.0
				and rect.size.y > 0.0
				and viewport_rect.encloses(rect),
			"%s超出1280×720安全区域" % key,
			_errors
		)
	var right_panel := panel.get_node_or_null("RightPanel") as Control
	if right_panel == null:
		_errors.append("布局缺少右侧角色面板")
		return
	_expect(
		right_panel.position.x >= 800.0,
		"四角色栏没有固定在画面右侧",
		_errors
	)
	var occupied_rects: Array[Rect2] = []
	var previous_y := -1.0
	var first_x := -1.0
	for slot_index in range(4):
		var card := panel.call("slot_card", slot_index) as Control
		if card == null:
			_errors.append("布局缺少角色卡%d" % (slot_index + 1))
			continue
		var rect := Rect2(
			right_panel.position + card.position,
			card.size
		)
		_expect(
			viewport_rect.encloses(rect),
			"角色卡%d超出1280×720安全区域" % (slot_index + 1),
			_errors
		)
		_expect(
			is_equal_approx(card.size.x, 420.0)
				and is_equal_approx(card.size.y, 132.0),
			"角色卡%d没有使用420×132正式卡框" % (slot_index + 1),
			_errors
		)
		_expect(
			previous_y < 0.0 or card.position.y > previous_y,
			"四个角色卡没有按从上到下纵向排列",
			_errors
		)
		_expect(
			first_x < 0.0 or is_equal_approx(card.position.x, first_x),
			"四个角色卡没有对齐为同一纵列",
			_errors
		)
		if first_x < 0.0:
			first_x = card.position.x
		previous_y = card.position.y
		for previous_rect in occupied_rects:
			_expect(
				not previous_rect.intersects(rect),
				"角色卡发生重叠",
				_errors
			)
		occupied_rects.append(rect)


func _expect_creation_layout(
	_panel: Control,
	creation_snapshot: Dictionary
) -> void:
	var layout_rects := creation_snapshot.get("layoutRects", {}) as Dictionary
	var board_rect := _dictionary_rect(
		layout_rects.get("board", {}) as Dictionary
	)
	var name_rect := _dictionary_rect(
		layout_rects.get("nameInput", {}) as Dictionary
	)
	var random_rect := _dictionary_rect(
		layout_rects.get("randomNameButton", {}) as Dictionary
	)
	var board_local := Rect2(Vector2.ZERO, board_rect.size)
	_expect(
		board_rect.size.x > 0.0
		and board_rect.size.y > 0.0
		and name_rect.size.x > 0.0
		and random_rect.size.x > 0.0
		and board_local.encloses(name_rect)
		and board_local.encloses(random_rect),
		"角色名输入框或换一个按钮越出建角面板",
		_errors
	)
	_expect(
		not name_rect.intersects(random_rect)
		and name_rect.end.x <= random_rect.position.x,
		"角色名输入框与换一个按钮发生重叠",
		_errors
	)


func _expect_earth_green(panel: Control, require_active_segment: bool) -> void:
	var earth_label := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementEarthLabel"
	) as Label
	_expect(earth_label != null, "建角页缺少地属性标签", _errors)
	if earth_label != null:
		var label_color := earth_label.get_theme_color("font_color")
		_expect(
			label_color.g > label_color.r and label_color.g > label_color.b,
			"地属性标签没有统一使用绿色",
			_errors
		)
	if not require_active_segment:
		return
	var segment := panel.get_node_or_null(
		"CharacterCreationPanel/CreationBoard/ElementEarthSegment0"
	) as Panel
	_expect(segment != null, "建角页缺少地属性点格", _errors)
	if segment != null:
		var style := segment.get_theme_stylebox("panel") as StyleBoxFlat
		_expect(style != null, "地属性点格缺少样式", _errors)
		if style != null:
			var segment_color := style.bg_color
			_expect(
				segment_color.g > segment_color.r
				and segment_color.g > segment_color.b,
				"地属性已分配点格没有统一使用绿色",
				_errors
			)


func _expect_request_contracts() -> void:
	_expect(
		ServerAuthClientModel.player_message_for_code(
			"character_name_restricted",
			"internal"
		) == "这个名字不能使用，请换一个。",
		"角色名限制错误码没有映射为安全玩家文案",
		_errors
	)
	_expect(
		ServerAuthClientModel.player_message_for_code(
			"invalid_display_name",
			"internal"
		) == "角色名最多24个字，且不能包含不能使用的字符。",
		"角色名格式错误码没有映射为稳定玩家文案",
		_errors
	)
	var elements := {
		"earth": 6,
		"water": 4,
		"fire": 0,
		"wind": 0,
	}
	var create_spec := ServerAuthClientModel.character_create_request(
		"http://127.0.0.1:8787/",
		"token_test",
		1,
		"  山岚  ",
		"obsidian_scout_v1",
		elements
	)
	var create_body_value = JSON.parse_string(str(create_spec.get("body", "")))
	var create_body := (
		create_body_value as Dictionary
		if create_body_value is Dictionary
		else {}
	)
	var create_elements := (
		create_body.get("elements", {}) as Dictionary
		if create_body.get("elements", {}) is Dictionary
		else {}
	)
	_expect(
		str(create_spec.get("url", "")) == "http://127.0.0.1:8787/characters"
			and bool(create_spec.get("durableMutation", false))
			and ServerAuthClientModel.request_is_idempotent(create_spec)
			and int(create_body.get("slotIndex", -1)) == 1
			and str(create_body.get("displayName", "")) == "山岚"
			and str(create_body.get("appearanceId", "")) == "obsidian_scout_v1"
			and int(create_elements.get("earth", -1)) == 6
			and int(create_elements.get("water", -1)) == 4
			and int(create_elements.get("fire", -1)) == 0
			and int(create_elements.get("wind", -1)) == 0,
		"创建角色HTTP请求没有携带完整权威合同或幂等键",
		_errors
	)
	var allocation_spec := ServerAuthClientModel.character_allocate_elements_request(
		"http://127.0.0.1:8787/",
		"token_test",
		elements
	)
	var allocation_body_value = JSON.parse_string(
		str(allocation_spec.get("body", ""))
	)
	var allocation_body := (
		allocation_body_value as Dictionary
		if allocation_body_value is Dictionary
		else {}
	)
	var allocated_elements := (
		allocation_body.get("elements", {}) as Dictionary
		if allocation_body.get("elements", {}) is Dictionary
		else {}
	)
	_expect(
		str(allocation_spec.get("url", ""))
			== "http://127.0.0.1:8787/characters/allocate-elements"
			and bool(allocation_spec.get("durableMutation", false))
			and ServerAuthClientModel.request_is_idempotent(allocation_spec)
			and int(allocated_elements.get("earth", -1)) == 6
			and int(allocated_elements.get("water", -1)) == 4
			and int(allocated_elements.get("fire", -1)) == 0
			and int(allocated_elements.get("wind", -1)) == 0,
		"旧角色补元素HTTP请求合同或幂等键错误",
		_errors
	)


func _dictionary_rect(value: Dictionary) -> Rect2:
	return Rect2(
		float(value.get("x", 0.0)),
		float(value.get("y", 0.0)),
		float(value.get("width", 0.0)),
		float(value.get("height", 0.0))
	)


func _expect(
	condition: bool,
	message: String,
	errors: Array[String]
) -> void:
	if not condition:
		errors.append(message)
