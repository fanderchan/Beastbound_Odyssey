extends RefCounted

const CAPTURE_FLAG := "--market-awakened-owner-review-capture"
const EquipmentInstancePresenter := preload(
	"res://scripts/ui/equipment_instance_presenter.gd"
)
const PlayerProgressModel := preload(
	"res://scripts/progression/player_progress_model.gd"
)

const REVIEW_FPS := 30
const EXPECTED_VIEWPORT := Vector2i(1280, 720)
const REVIEW_ACCOUNT_ID := "market_owner_review_self"
const ORDINARY_LISTING_ID := "market_owner_review_meat"
const EQUIPMENT_LISTING_ID := "market_owner_review_equipment"
const OWN_LISTING_ID := "market_owner_review_own"
const MEAT_ITEM_ID := "item_meat_small"
const EQUIPMENT_INSTANCE_ID := "equip_000002"

var host
var _started_msec := 0
var _failed := false
var _real_left_click_count := 0


func _init(host_node = null) -> void:
	host = host_node


static func is_flag(argument: String) -> bool:
	return argument.strip_edges() == CAPTURE_FLAG


static func request_from_args(arguments: PackedStringArray) -> bool:
	for argument in arguments:
		if is_flag(str(argument)):
			return true
	return false


func run() -> void:
	_started_msec = Time.get_ticks_msec()
	_configure_isolated_review_profile()
	if _failed:
		return
	print(
		(
			"MARKET_AWAKENED_OWNER_REVIEW_START scene=Main.tscn "
			+ "viewport=1280x720 fps=30 speed=1.00x "
			+ "profile=isolated backend=false profile_save=false"
		)
	)
	await _hold("world_context", 2.0)
	await _open_market_with_real_left_click()
	if _failed:
		return
	await _hold("market_buy_overview", 2.5)
	await _select_listing(ORDINARY_LISTING_ID, "普通物品挂单")
	if _failed:
		return
	await _hold("market_ordinary_detail", 2.0)
	await _select_listing(EQUIPMENT_LISTING_ID, "装备实例挂单")
	if _failed:
		return
	await _hold("market_equipment_detail", 3.0)
	await _open_sell_mode_and_select_stack()
	if _failed:
		return
	await _hold("market_sell_stack", 2.5)
	await _select_sell_equipment()
	if _failed:
		return
	await _hold("market_sell_equipment", 3.0)
	await _open_my_listings()
	if _failed:
		return
	await _hold("market_my_listings", 2.5)
	_show_empty_my_listings_guidance()
	if _failed:
		return
	await _hold("market_empty_guidance", 2.0)
	await _return_to_world()
	if _failed:
		return
	await _hold("return_world", 2.0)
	var elapsed := float(Time.get_ticks_msec() - _started_msec) / 1000.0
	print(
		(
			"MARKET_AWAKENED_OWNER_REVIEW_END elapsed_wall=%.3f "
			+ "speed=1.00x profile=isolated backend=false clicks=%d"
		) % [elapsed, _real_left_click_count]
	)
	host.get_tree().quit(0)


func _configure_isolated_review_profile() -> void:
	if host == null or not is_instance_valid(host):
		_fail_capture("Main host 不存在")
		return
	var current_scene := host.get_tree().current_scene as Node
	if (
		current_scene != host
		or current_scene.scene_file_path != "res://scenes/Main.tscn"
	):
		_fail_capture("交易所验收必须运行真实 Main.tscn")
		return
	var viewport_size: Vector2 = host.get_viewport().get_visible_rect().size
	if Vector2i(roundi(viewport_size.x), roundi(viewport_size.y)) != EXPECTED_VIEWPORT:
		_fail_capture("交易所验收视口必须为 1280×720")
		return

	host.profile_save_enabled = false
	host.account_authenticated = true
	host.current_account_session = {}
	host.server_profile_sync_state = "off"
	host.server_profile_sync_pending_kind = ""
	host.server_profile_sync_dirty = false
	host.server_profile_sync_pull_queued = false
	host.market_request_pending = false
	_cancel_market_request()
	if host.has_method("_stop_server_event_stream"):
		host._stop_server_event_stream()
	if host.has_method("_stop_online_position_sync"):
		host._stop_online_position_sync()
	if host.has_method("_close_auth_panel"):
		host._close_auth_panel(false)
	if host.has_method("_close_account_panel"):
		host._close_account_panel(false)
	if host.has_method("_close_market_panel"):
		host._close_market_panel(false)
	var character_entry_value = host.get("character_entry_panel")
	if character_entry_value is CanvasItem:
		(character_entry_value as CanvasItem).visible = false

	var equipment_fixture := EquipmentInstancePresenter.schema3_fixture_for_check()
	var profile := PlayerProgressModel.default_profile()
	for key in equipment_fixture.keys():
		profile[key] = equipment_fixture.get(key)
	profile["stoneCoins"] = 16800
	profile["diamonds"] = 680
	var player := (profile.get("player", {}) as Dictionary).duplicate(true)
	player["name"] = "赤芽行商"
	player["level"] = 98
	profile["player"] = player
	var backpack_slots_value = profile.get("backpackSlots", [])
	if not (backpack_slots_value is Array):
		_fail_capture("装备实例夹具缺少背包格")
		return
	var backpack_slots := (backpack_slots_value as Array).duplicate(true)
	backpack_slots.append({"itemId": MEAT_ITEM_ID, "count": 5})
	backpack_slots.append({"itemId": MEAT_ITEM_ID, "count": 3})
	profile["backpackSlots"] = backpack_slots
	host.player_profile = profile
	host.market_listings.clear()
	host.market_my_listings.clear()
	host.market_mode = "buy"
	host.market_selected_listing_id = ""

	if not host._load_map("firebud_village_gate", "from_training_yard"):
		_fail_capture("无法载入交易所验收地图")
		return
	host._set_world_log_message("火芽村交易所今天也很热闹。")
	host._update_hud_text(true)
	host._layout_hud()


func _open_market_with_real_left_click() -> void:
	var entry_button := _visible_world_market_button()
	if entry_button == null:
		var direct_value = host.get("market_menu_button")
		var scroll_value = host.get("action_bar_scroll")
		if direct_value is Button and scroll_value is ScrollContainer:
			(scroll_value as ScrollContainer).ensure_control_visible(direct_value as Control)
			await _settle()
			entry_button = _visible_world_market_button()
	if entry_button == null:
		_fail_capture("世界 HUD 缺少可见的交易所入口")
		return
	await _left_click(entry_button, "世界 HUD 交易所入口")
	await _settle()
	var panel := _market_panel()
	if panel == null or not panel.visible:
		_fail_capture("真实左键没有通过 PanelFlowCoordinator 打开交易所")
		return
	if (
		not panel.has_method("is_awakened_market_panel")
		or not bool(panel.call("is_awakened_market_panel"))
	):
		_fail_capture("交易所仍不是觉醒全屏面板")
		return
	if bool(host.market_request_pending):
		_fail_capture("离线打开交易所时意外发起了请求")
		return

	var fixtures := _market_fixture_rows()
	if _failed:
		return
	for listing in fixtures.get("public", []):
		host.market_listings.append((listing as Dictionary).duplicate(true))
	for listing in fixtures.get("mine", []):
		host.market_my_listings.append((listing as Dictionary).duplicate(true))
	host.current_account_session = {
		"authSource": "server",
		"serverSessionToken": "isolated_market_owner_review_token",
		"serverBaseUrl": "http://127.0.0.1:1",
		"accountId": REVIEW_ACCOUNT_ID,
		"displayName": "赤芽行商",
	}
	host.market_mode = "buy"
	host.market_selected_listing_id = ""
	host.market_status_label.text = "交易所商品已更新。"
	host._refresh_market_panel()
	await _settle()
	_expect_mode("buy")
	if _failed:
		return
	if not host.market_listing_buttons.has(ORDINARY_LISTING_ID):
		_fail_capture("购买页没有生成普通物品卡")
		return
	if not host.market_listing_buttons.has(EQUIPMENT_LISTING_ID):
		_fail_capture("购买页没有生成装备实例卡")
		return
	_assert_no_market_request("购买总览")


func _select_listing(listing_id: String, label: String) -> void:
	var button_value = host.market_listing_buttons.get(listing_id, null)
	if not (button_value is Button):
		_fail_capture("%s按钮不存在" % label)
		return
	await _left_click(button_value as Button, label)
	await _settle()
	var panel := _market_panel()
	if panel == null or str(panel.call("selected_listing_id")) != listing_id:
		_fail_capture("真实左键没有选中%s" % label)
		return
	_assert_no_market_request(label)


func _open_sell_mode_and_select_stack() -> void:
	var panel := _market_panel()
	if panel == null:
		_fail_capture("出售页切换前交易所不存在")
		return
	var sell_tab_value = panel.get("sell_tab_button")
	if not (sell_tab_value is Button):
		_fail_capture("交易所缺少出售页签")
		return
	await _left_click(sell_tab_value as Button, "出售页签")
	await _settle()
	_expect_mode("sell")
	if _failed:
		return
	var stack_button := _sell_source_button(false)
	if stack_button == null:
		_fail_capture("出售页没有聚合为 8 个的小块肉候选")
		return
	await _left_click(stack_button, "普通物品出售候选")
	await _settle()
	var selected_value = panel.call("selected_sell_row")
	var selected := selected_value as Dictionary if selected_value is Dictionary else {}
	if (
		str(selected.get("itemId", "")) != MEAT_ITEM_ID
		or int(selected.get("count", 0)) != 8
		or str(selected.get("instanceId", "")) != ""
	):
		_fail_capture("普通物品卡没有展示聚合后的安全上架候选")
		return
	_assert_no_market_request("普通物品出售候选")


func _select_sell_equipment() -> void:
	var panel := _market_panel()
	if panel == null:
		_fail_capture("装备出售切换前交易所不存在")
		return
	var equipment_button := _sell_source_button(true)
	if equipment_button == null:
		_fail_capture("出售页缺少指定 +4 装备实例")
		return
	await _left_click(equipment_button, "装备实例出售候选")
	await _settle()
	var selected_value = panel.call("selected_sell_row")
	var selected := selected_value as Dictionary if selected_value is Dictionary else {}
	if (
		str(selected.get("instanceId", "")) != EQUIPMENT_INSTANCE_ID
		or int(selected.get("count", 0)) != 1
	):
		_fail_capture("装备出售没有锁定到单一安全实例")
		return
	var count_spinbox_value = panel.get("sell_count_spinbox")
	if (
		not (count_spinbox_value is SpinBox)
		or int((count_spinbox_value as SpinBox).value) != 1
		or (count_spinbox_value as SpinBox).editable
	):
		_fail_capture("装备出售数量没有固定为 1")
		return
	_assert_no_market_request("装备实例出售候选")


func _open_my_listings() -> void:
	var panel := _market_panel()
	if panel == null:
		_fail_capture("我的挂单切换前交易所不存在")
		return
	var mine_tab_value = panel.get("mine_tab_button")
	if not (mine_tab_value is Button):
		_fail_capture("交易所缺少我的挂单页签")
		return
	await _left_click(mine_tab_value as Button, "我的挂单页签")
	await _settle()
	_expect_mode("mine")
	if _failed:
		return
	var own_button_value = host.market_listing_buttons.get(OWN_LISTING_ID, null)
	if not (own_button_value is Button):
		_fail_capture("我的挂单页没有生成自己的商品卡")
		return
	await _left_click(own_button_value as Button, "自己的挂单卡")
	await _settle()
	if str(panel.call("selected_listing_id")) != OWN_LISTING_ID:
		_fail_capture("真实左键没有选中自己的挂单")
		return
	_assert_no_market_request("我的挂单")


func _show_empty_my_listings_guidance() -> void:
	host.market_my_listings.clear()
	host.market_selected_listing_id = ""
	host.market_status_label.text = "当前没有自己的在售商品。"
	host._refresh_market_panel()
	var panel := _market_panel()
	if panel == null:
		_fail_capture("空态刷新后交易所不存在")
		return
	var snapshot_value = panel.call("ui_snapshot")
	var snapshot := snapshot_value as Dictionary if snapshot_value is Dictionary else {}
	if int(snapshot.get("listingCount", -1)) != 0:
		_fail_capture("我的挂单空态仍然生成了商品卡")
		return
	if not _tree_has_visible_text(panel, "暂无自己的在售商品"):
		_fail_capture("我的挂单空态缺少玩家指引")
		return
	_assert_no_market_request("我的挂单空态")


func _return_to_world() -> void:
	var panel := _market_panel()
	if panel == null or not panel.visible:
		_fail_capture("关闭交易所前面板不可见")
		return
	var close_value = panel.get("close_button")
	if not (close_value is Button):
		_fail_capture("交易所缺少关闭按钮")
		return
	await _left_click(close_value as Button, "关闭交易所")
	await _settle()
	if panel.visible:
		_fail_capture("真实左键关闭后没有返回世界")
		return
	host.current_account_session = {}
	host.market_request_pending = false
	_cancel_market_request()
	host._set_world_log_message("交易所浏览完毕，继续踏上旅程吧。")
	host._update_hud_text(true)
	_assert_no_market_request("返回世界")


func _market_fixture_rows() -> Dictionary:
	var profile_value = host.player_profile
	var profile := profile_value as Dictionary if profile_value is Dictionary else {}
	var bank_value = profile.get("bank", {})
	var bank := bank_value as Dictionary if bank_value is Dictionary else {}
	var bank_slots_value = bank.get("slots", [])
	var bank_slots := bank_slots_value as Array if bank_slots_value is Array else []
	if bank_slots.is_empty() or not (bank_slots[0] is Dictionary):
		_fail_capture("装备实例夹具缺少银行装备信封")
		return {}
	var envelopes_value = (bank_slots[0] as Dictionary).get("equipmentEnvelopes", [])
	var envelopes := envelopes_value as Array if envelopes_value is Array else []
	if envelopes.is_empty() or not (envelopes[0] is Dictionary):
		_fail_capture("装备实例夹具缺少公开装备信封")
		return {}
	var envelope := (envelopes[0] as Dictionary).duplicate(true)
	return {
		"public": [
			{
				"listingId": ORDINARY_LISTING_ID,
				"sellerAccountId": "market_owner_review_vendor_meat",
				"sellerDisplayName": "森林行商",
				"itemId": MEAT_ITEM_ID,
				"itemLabel": "小块肉",
				"count": 6,
				"unitPrice": 28,
				"totalPrice": 168,
				"currency": "stoneCoins",
				"taxBps": 100,
				"estimatedTax": 2,
				"sellerReceives": 166,
				"createdAt": "2026-08-07T09:00:00.000Z",
			},
			{
				"listingId": EQUIPMENT_LISTING_ID,
				"sellerAccountId": "market_owner_review_vendor_equipment",
				"sellerDisplayName": "装备匠人",
				"itemId": "weapon_wooden_club",
				"itemLabel": "木棒",
				"count": 1,
				"unitPrice": 77,
				"totalPrice": 77,
				"currency": "stoneCoins",
				"taxBps": 100,
				"estimatedTax": 1,
				"sellerReceives": 76,
				"createdAt": "2026-08-07T09:05:00.000Z",
				"equipmentEnvelope": envelope,
			},
		],
		"mine": [
			{
				"listingId": OWN_LISTING_ID,
				"sellerAccountId": REVIEW_ACCOUNT_ID,
				"sellerDisplayName": "赤芽行商",
				"itemId": MEAT_ITEM_ID,
				"itemLabel": "小块肉",
				"count": 4,
				"unitPrice": 40,
				"totalPrice": 160,
				"currency": "stoneCoins",
				"taxBps": 100,
				"estimatedTax": 2,
				"sellerReceives": 158,
				"createdAt": "2026-08-07T08:40:00.000Z",
			},
		],
	}


func _visible_world_market_button() -> Button:
	var world_hud_value = host.get("world_hud_awakened_view")
	if world_hud_value is Node:
		for node in (world_hud_value as Node).find_children(
			"WorldHudProxyMarket*", "Button", true, false
		):
			if node is Button and _control_center_is_in_viewport(node as Button):
				return node as Button
	var direct_value = host.get("market_menu_button")
	if direct_value is Button and _control_center_is_in_viewport(direct_value as Button):
		return direct_value as Button
	return null


func _market_panel() -> Control:
	var panel_value = host.get("market_panel")
	return panel_value as Control if panel_value is Control else null


func _sell_source_button(equipment: bool) -> Button:
	var panel := _market_panel()
	if panel == null:
		return null
	var buttons_value = panel.get("sell_source_buttons")
	var buttons := buttons_value as Dictionary if buttons_value is Dictionary else {}
	for button_value in buttons.values():
		if not (button_value is Button):
			continue
		var row_value = (button_value as Button).get_meta("sell_source", {})
		var row := row_value as Dictionary if row_value is Dictionary else {}
		var is_equipment := str(row.get("instanceId", "")) != ""
		if equipment:
			if is_equipment and str(row.get("instanceId", "")) == EQUIPMENT_INSTANCE_ID:
				return button_value as Button
		elif (
			not is_equipment
			and str(row.get("itemId", "")) == MEAT_ITEM_ID
			and int(row.get("count", 0)) == 8
		):
			return button_value as Button
	return null


func _expect_mode(expected: String) -> void:
	var panel := _market_panel()
	if panel == null or not panel.has_method("current_mode"):
		_fail_capture("交易所缺少模式查询合同")
		return
	if str(panel.call("current_mode")) != expected or str(host.market_mode) != expected:
		_fail_capture("真实页签没有切换到 %s 模式" % expected)


func _assert_no_market_request(context: String) -> void:
	if bool(host.market_request_pending):
		_fail_capture("%s时意外发起交易所请求" % context)


func _cancel_market_request() -> void:
	var request_value = host.get("market_http_request")
	if request_value is HTTPRequest:
		(request_value as HTTPRequest).cancel_request()
	var panel := _market_panel()
	if panel != null:
		var panel_request_value = panel.get("http_request")
		if panel_request_value is HTTPRequest:
			(panel_request_value as HTTPRequest).cancel_request()


func _tree_has_visible_text(root: Node, needle: String) -> bool:
	for node in root.find_children("*", "Label", true, false):
		if (
			node is Label
			and (node as Label).is_visible_in_tree()
			and str((node as Label).text).find(needle) >= 0
		):
			return true
	return false


func _control_center_is_in_viewport(control: Control) -> bool:
	if (
		control == null
		or not control.is_inside_tree()
		or not control.is_visible_in_tree()
		or (control is BaseButton and (control as BaseButton).disabled)
	):
		return false
	var point := control.get_global_rect().get_center()
	return host.get_viewport().get_visible_rect().has_point(point)


func _ensure_control_visible(control: Control) -> void:
	var ancestor := control.get_parent()
	while ancestor != null:
		if ancestor is ScrollContainer:
			(ancestor as ScrollContainer).ensure_control_visible(control)
			await host.get_tree().process_frame
		ancestor = ancestor.get_parent()


func _left_click(control: Control, label: String) -> void:
	if control == null or not control.is_inside_tree() or not control.is_visible_in_tree():
		_fail_capture("%s不可见，无法执行真实左键" % label)
		return
	if control is BaseButton and (control as BaseButton).disabled:
		_fail_capture("%s已禁用，无法执行真实左键" % label)
		return
	await _ensure_control_visible(control)
	var viewport_point := control.get_global_rect().get_center()
	if not host.get_viewport().get_visible_rect().has_point(viewport_point):
		_fail_capture("%s不在可点击视口内" % label)
		return
	var input_position: Vector2 = (
		host.get_viewport().get_screen_transform() * viewport_point
	)
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.button_mask = MOUSE_BUTTON_MASK_LEFT
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
	_real_left_click_count += 1
	await host.get_tree().process_frame


func _settle() -> void:
	await host.get_tree().process_frame
	await host.get_tree().process_frame
	await host.get_tree().process_frame


func _hold(chapter: String, seconds: float) -> void:
	print(
		(
			"MARKET_AWAKENED_OWNER_REVIEW_CHAPTER chapter=%s "
			+ "frame=%d seconds=%.3f speed=1.00x"
		) % [chapter, int(round(seconds * REVIEW_FPS)), seconds]
	)
	await host.get_tree().create_timer(seconds).timeout


func _fail_capture(message: String) -> void:
	if _failed:
		return
	_failed = true
	push_error("MARKET_AWAKENED_OWNER_REVIEW_FAILED %s" % message)
	if host != null and is_instance_valid(host):
		host.get_tree().quit(1)
