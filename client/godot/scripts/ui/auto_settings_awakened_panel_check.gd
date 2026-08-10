extends SceneTree

const AutoBattleSettingsModel := preload(
	"res://scripts/progression/auto_battle_settings_model.gd"
)
const AutoSettingsAwakenedPanel := preload(
	"res://scripts/ui/auto_settings_awakened_panel.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)

var _errors: Array[String] = []
var _tab_events: Array[String] = []
var _setting_events: Array[Dictionary] = []
var _close_count := 0
var _capture_dir := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_capture_dir = _capture_directory_argument()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var panel := AutoSettingsAwakenedPanel.new()
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.tab_requested.connect(func(tab_id: String) -> void:
		_tab_events.append(tab_id)
		panel.set_active_tab(tab_id)
	)
	panel.setting_requested.connect(func(key: String, value) -> void:
		_setting_events.append({"key": key, "value": value})
	)
	panel.close_requested.connect(func() -> void:
		_close_count += 1
	)
	root.add_child(panel)
	panel.apply_battle_state(_fixture_state())
	await _settle()

	var controls := panel.semantic_controls()
	_expect(panel.is_awakened_auto_settings_panel(), "设置页没有启用觉醒式全屏视图", _errors)
	_expect(panel.active_tab() == "battle", "默认页签不是自动战斗", _errors)
	_expect(panel.active_round() == "normal", "默认没有展示一般回合策略", _errors)
	_expect(
		panel.direct_auto_hint_text().find("右下角「自动」") >= 0,
		"页面没有说明战斗内一键自动入口",
		_errors
	)
	for key in [
		AutoBattleSettingsModel.PLAYER_FIRST_ROUND_ACTION_KEY,
		AutoBattleSettingsModel.PLAYER_NORMAL_ACTION_KEY,
		AutoBattleSettingsModel.PET_FIRST_ROUND_SLOT_KEY,
		AutoBattleSettingsModel.PET_NORMAL_SLOT_KEY,
		AutoBattleSettingsModel.TARGET_MODE_KEY,
		AutoBattleSettingsModel.HEALING_ENABLED_KEY,
		AutoBattleSettingsModel.PLAYER_HP_PERCENT_KEY,
		AutoBattleSettingsModel.PET_HP_PERCENT_KEY,
		"healPriority0",
		"healPriority4",
	]:
		_expect(controls.has(key), "缺少语义设置控件：%s" % key, _errors)
	_expect(_find_text(panel, "内挂设置") == null, "玩家页仍显示程序式的“内挂设置”标题", _errors)
	await _capture("auto-settings-default-1280x720.png")

	var first_round := panel.find_child("FirstRoundTab", true, false) as Button
	_expect(first_round != null, "缺少首回合页签", _errors)
	if first_round != null:
		await _real_left_click(first_round)
	_expect(panel.active_round() == "first", "真实左键没有切到首回合", _errors)

	var priority_button := panel.find_child("HealPriorityButton", true, false) as Button
	_expect(priority_button != null, "缺少恢复顺序入口", _errors)
	if priority_button != null:
		await _real_left_click(priority_button)
	_expect(panel.heal_overlay_visible(), "真实左键没有打开恢复顺序内嵌页", _errors)
	await _capture("auto-settings-heal-priority-1280x720.png")
	var priority_close := panel.find_child("HealPriorityCloseButton", true, false) as Button
	_expect(priority_close != null, "恢复顺序内嵌页缺少完成按钮", _errors)
	if priority_close != null:
		await _real_left_click(priority_close)
	_expect(not panel.heal_overlay_visible(), "完成按钮没有关闭恢复顺序内嵌页", _errors)

	var healing_disabled := panel.find_child("HealingDisabledCheck", true, false) as CheckBox
	_expect(healing_disabled != null, "缺少自动恢复关闭选项", _errors)
	if healing_disabled != null:
		panel.set_active_tab("battle")
		await _real_left_click(healing_disabled)
	_expect(
		_has_setting_event(AutoBattleSettingsModel.HEALING_ENABLED_KEY, false),
		"真实左键没有发出关闭自动恢复事件",
		_errors
	)

	await _real_left_click(panel.capture_tab_button)
	await _real_left_click(panel.hang_tab_button)
	await _real_left_click(panel.battle_tab_button)
	_expect(
		_tab_events == ["capture", "hang", "battle"],
		"左侧木牌页签事件不正确：%s" % str(_tab_events),
		_errors
	)
	await _real_left_click(panel.close_button)
	_expect(_close_count == 1, "关闭按钮没有发出一次关闭事件", _errors)

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.auto_settings_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"tabEvents": _tab_events,
		"settingEvents": _setting_events,
		"closeCount": _close_count,
		"captureDirectory": _capture_dir,
		"errors": _errors,
	}
	print("auto settings awakened panel check: %s" % JSON.stringify(report))
	panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _fixture_state() -> Dictionary:
	var player_options: Array[Dictionary] = [
		{"id": AutoBattleSettingsModel.ACTION_ATTACK, "label": "攻击"},
		{"id": AutoBattleSettingsModel.ACTION_DEFEND, "label": "防御"},
	]
	var pet_options: Array[Dictionary] = [
		{"id": "1", "label": "技1 攻击"},
		{"id": "2", "label": "技2 回旋击"},
	]
	var heal_options: Array[Dictionary] = [
		{"id": AutoBattleSettingsModel.HEAL_ITEM_MEAT, "label": "肉"},
		{"id": AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE, "label": "单体恢复药"},
	]
	return {
		"player": {
			"available": true,
			"name": "见习猎人",
			"levelText": "Lv.18",
			"portraitTexturePath": "res://assets/characters/novice_hunter/ui/portrait.png",
		},
		"pet": {
			"available": true,
			"name": "蓝人龙",
			"levelText": "Lv.18",
			"portraitTexturePath": "res://assets/pets/blue_man_dragon_water10/portrait/default.png",
		},
		"playerActionOptions": player_options,
		"petSlotOptions": pet_options,
		"targetOptions": AutoBattleSettingsModel.target_mode_options(),
		"healSourceOptions": heal_options,
		"playerFirstAction": AutoBattleSettingsModel.ACTION_ATTACK,
		"playerNormalAction": AutoBattleSettingsModel.ACTION_ATTACK,
		"petFirstSlot": "1",
		"petNormalSlot": "1",
		"targetMode": AutoBattleSettingsModel.TARGET_FIRST_LIVING,
		"healingEnabled": true,
		"playerHpPercent": 45,
		"petHpPercent": 45,
		"healPriority": [
			AutoBattleSettingsModel.HEAL_ITEM_MEAT,
			AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE,
			AutoBattleSettingsModel.HEAL_ITEM_MEAT,
			AutoBattleSettingsModel.HEAL_ITEM_HEAL_SINGLE,
			AutoBattleSettingsModel.HEAL_ITEM_MEAT,
		],
	}


func _has_setting_event(key: String, expected_value) -> bool:
	for event in _setting_events:
		if str(event.get("key", "")) == key and event.get("value") == expected_value:
			return true
	return false


func _real_left_click(control: Control) -> void:
	var click_position := control.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = click_position
	motion.global_position = click_position
	root.push_input(motion, true)
	await process_frame
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = click_position
	press.global_position = click_position
	press.pressed = true
	root.push_input(press, true)
	await process_frame
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = click_position
	release.global_position = click_position
	release.pressed = false
	root.push_input(release, true)
	await process_frame


func _capture(file_name: String) -> void:
	if _capture_dir == "":
		return
	await _settle()
	RenderingServer.force_draw(true)
	await process_frame
	var error := DirAccess.make_dir_recursive_absolute(_capture_dir)
	if error != OK and error != ERR_ALREADY_EXISTS:
		_errors.append("无法创建截图目录：%s" % _capture_dir)
		return
	var viewport_texture := root.get_texture()
	if viewport_texture == null:
		_errors.append("当前渲染后端无法生成截图：%s" % file_name)
		return
	var image := viewport_texture.get_image()
	if image == null or image.is_empty():
		_errors.append("截图画面为空：%s" % file_name)
		return
	if image.save_png(_capture_dir.path_join(file_name)) != OK:
		_errors.append("无法保存截图：%s" % file_name)


func _capture_directory_argument() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			return arg.trim_prefix("--capture-dir=").strip_edges()
	return ""


func _settle() -> void:
	await process_frame
	await process_frame
	await process_frame


func _find_text(node: Node, text_fragment: String) -> Control:
	if node is Label and text_fragment in (node as Label).text:
		return node as Control
	if node is Button and text_fragment in (node as Button).text:
		return node as Control
	for child in node.get_children():
		var found := _find_text(child, text_fragment)
		if found != null:
			return found
	return null


func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
