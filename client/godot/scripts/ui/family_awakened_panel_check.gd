extends SceneTree

const FamilyAwakenedPresenter := preload(
	"res://scripts/ui/family_awakened_presenter.gd"
)
const FamilyAwakenedPanel := preload(
	"res://scripts/ui/family_awakened_panel.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)

var _errors: Array[String] = []
var _join_events: Array[String] = []
var _shop_events: Array[String] = []
var _capture_dir := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_capture_dir = _capture_directory_argument()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var panel := FamilyAwakenedPanel.new()
	panel.position = Vector2.ZERO
	panel.size = Vector2(VIEWPORT_SIZE)
	panel.join_requested.connect(func(family_id: String) -> void:
		_join_events.append(family_id)
	)
	panel.shop_requested.connect(func(shop_id: String) -> void:
		_shop_events.append(shop_id)
	)
	root.add_child(panel)

	var lobby_state := FamilyAwakenedPresenter.build_view_state(
		null,
		_fixture_families(),
		_fixture_manors(),
		"account_leader",
		false,
		true,
		"选择一个家族加入，或创建自己的家族。"
	)
	panel.apply_view_state(lobby_state)
	await _settle()
	_expect(panel.active_tab() == "lobby", "未加入状态没有进入家族大厅", _errors)
	_expect(panel.family_list_container != null, "家族大厅缺少家族列表", _errors)
	if panel.family_list_container != null:
		_expect(
			panel.family_list_container.get_child_count() == 2,
			"家族大厅没有展示两条真实列表数据",
			_errors
		)
	_expect(panel.is_within_viewport(), "家族页没有完整落在1280×720画布内", _errors)
	_expect(
		_find_text(panel, "捐献") == null
			and _find_text(panel, "科技") == null
			and _find_text(panel, "福利") == null,
		"家族页展示了当前后端并不支持的伪造功能",
		_errors
	)
	await _capture(panel, "family-lobby-1280x720.png")

	var open_create := panel.get_node_or_null(
		"FamilyCanvas/OpenFamilyCreateButton"
	) as Button
	_expect(open_create != null, "家族大厅缺少创建家族入口", _errors)
	if open_create != null:
		await _real_left_click(open_create)
		_expect(panel.create_popup_visible(), "真实左键没有打开创建家族内嵌页", _errors)
		await _capture(panel, "family-create-1280x720.png")
	panel.hide_create_popup()
	await _settle()

	var join_button := _find_button(panel, "加入家族")
	_expect(join_button != null, "家族详情缺少加入按钮", _errors)
	if join_button != null:
		await _real_left_click(join_button)
	_expect(
		_join_events == ["family_ember"],
		"真实左键没有发出正确的加入家族事件：%s" % str(_join_events),
		_errors
	)

	var joined_state := FamilyAwakenedPresenter.build_view_state(
		_fixture_current_family(),
		_fixture_families(),
		_fixture_manors(),
		"account_leader",
		false,
		true,
		"我的家族：星火旅团。",
		"info"
	)
	panel.apply_view_state(joined_state)
	await _settle()
	_expect(panel.active_tab() == "info", "加入家族后没有进入信息页", _errors)
	_expect(
		panel.family_summary_container != null
			and panel.family_summary_container.get_child_count() == 4,
		"左侧家族资料没有展示四项真实摘要",
		_errors
	)
	_expect(
		_find_text(panel, "族长尚未发布") == null,
		"已有公告时仍显示空公告文案",
		_errors
	)
	await _capture(panel, "family-info-1280x720.png")

	var members_tab := panel.get_node_or_null(
		"FamilyCanvas/FamilyTabMembers"
	) as Button
	_expect(members_tab != null, "家族页缺少成员页签", _errors)
	if members_tab != null:
		await _real_left_click(members_tab)
	_expect(panel.active_tab() == "members", "真实左键没有切换到成员页", _errors)
	_expect(_find_text(panel, "赤牙") != null, "成员页没有展示真实族长姓名", _errors)

	var activities_tab := panel.get_node_or_null(
		"FamilyCanvas/FamilyTabActivities"
	) as Button
	_expect(activities_tab != null, "家族页缺少活动页签", _errors)
	if activities_tab != null:
		await _real_left_click(activities_tab)
	_expect(panel.active_tab() == "activities", "真实左键没有切换到活动页", _errors)
	_expect(_find_text(panel, "潮声庄园") != null, "活动页没有展示进行中的庄园战", _errors)

	var manors_tab := panel.get_node_or_null(
		"FamilyCanvas/FamilyTabManors"
	) as Button
	_expect(manors_tab != null, "家族页缺少庄园页签", _errors)
	if manors_tab != null:
		await _real_left_click(manors_tab)
	_expect(panel.active_tab() == "manors", "真实左键没有切换到庄园页", _errors)
	_expect(panel.manor_list_container != null, "庄园页缺少庄园列表", _errors)
	if panel.manor_list_container != null:
		_expect(
			panel.manor_list_container.get_child_count() == 3,
			"庄园页没有展示三条测试庄园数据",
			_errors
		)
	var shop_button := _find_button(panel, "道具场")
	_expect(shop_button != null, "已占领庄园没有道具场入口", _errors)
	if shop_button != null:
		await _real_left_click(shop_button)
	_expect(
		_shop_events == ["manor_firebud_shop"],
		"真实左键没有发出正确的庄园道具场事件：%s" % str(_shop_events),
		_errors
	)
	await _capture(panel, "family-manors-1280x720.png")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.family_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"lobbyFamilyCount": int(lobby_state.get("families", []).size()),
		"memberCount": int(joined_state.get("members", []).size()),
		"activeWarCount": int(joined_state.get("activeWarCount", 0)),
		"manorCount": int(joined_state.get("manors", []).size()),
		"joinEvents": _join_events,
		"shopEvents": _shop_events,
		"captureDirectory": _capture_dir,
		"errors": _errors,
	}
	print("family awakened panel check: %s" % JSON.stringify(report))
	panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _fixture_families() -> Array[Dictionary]:
	return [
		{
			"familyId": "family_ember",
			"name": "星火旅团",
			"leaderAccountId": "account_leader",
			"leaderDisplayName": "赤牙",
			"memberCount": 18,
			"maxMembers": 100,
			"fame": 1280,
			"manorIds": ["firebud_manor"],
		},
		{
			"familyId": "family_tide",
			"name": "潮汐同盟",
			"leaderDisplayName": "青鳞",
			"memberCount": 11,
			"maxMembers": 100,
			"fame": 760,
			"manorIds": [],
		},
	]


func _fixture_current_family() -> Dictionary:
	var family := _fixture_families()[0].duplicate(true)
	family["notice"] = "今晚八点集合，先确认庄园战参战名单。"
	family["members"] = [
		{
			"accountId": "account_leader",
			"displayName": "赤牙",
			"role": "leader",
			"online": true,
			"connectionState": "online",
		},
		{
			"accountId": "account_2",
			"displayName": "青石",
			"role": "member",
			"online": true,
			"connectionState": "online",
		},
		{
			"accountId": "account_3",
			"displayName": "风铃",
			"role": "member",
			"online": false,
			"connectionState": "offline",
		},
	]
	return family


func _fixture_manors() -> Array[Dictionary]:
	return [
		{
			"manorId": "firebud_manor",
			"name": "火芽庄园",
			"village": "火芽村",
			"neutralPower": 720,
			"ownerFamilyName": "星火旅团",
			"isOwnedByViewerFamily": true,
			"shopId": "manor_firebud_shop",
		},
		{
			"manorId": "earth_vein_manor",
			"name": "岩脉庄园",
			"village": "火芽村",
			"neutralPower": 860,
			"ownerFamilyName": "",
			"isOwnedByViewerFamily": false,
			"shopId": "manor_earth_shop",
		},
		{
			"manorId": "tide_echo_manor",
			"name": "潮声庄园",
			"village": "潮声村",
			"neutralPower": 920,
			"ownerFamilyName": "潮汐同盟",
			"isOwnedByViewerFamily": false,
			"shopId": "manor_tide_shop",
			"activeWar": {
				"warId": "war_tide_001",
				"challengerFamilyName": "星火旅团",
				"defenderFamilyName": "潮汐同盟",
				"startsAt": "2020-01-01T00:00:00.000Z",
				"challengerParticipantCount": 3,
				"defenderParticipantCount": 4,
				"maxParticipantsPerSide": 5,
				"canEnterByViewerFamily": true,
				"canLeaveByViewerFamily": false,
				"canStartBattleRoomByViewerFamily": true,
				"canResolveByViewerFamily": false,
				"battleRoomId": "",
			},
		},
	]


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


func _capture(panel: Control, file_name: String) -> void:
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
	var save_error := image.save_png(_capture_dir.path_join(file_name))
	if save_error != OK:
		_errors.append("无法保存截图：%s" % file_name)
	panel.grab_focus()


func _capture_directory_argument() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			return arg.trim_prefix("--capture-dir=").strip_edges()
	return ""


func _settle() -> void:
	await process_frame
	await process_frame
	await process_frame


func _find_button(node: Node, text_value: String) -> Button:
	if node is Button and (node as Button).text == text_value:
		return node as Button
	for child in node.get_children():
		var found := _find_button(child, text_value)
		if found != null:
			return found
	return null


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
