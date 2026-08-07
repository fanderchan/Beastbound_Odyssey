extends SceneTree

const MarketAwakenedPanel := preload(
	"res://scripts/ui/market_awakened_panel.gd"
)

const VIEWPORT_SIZE := Vector2i(1280, 720)
const PANEL_SCRIPT_PATH := "res://scripts/ui/market_awakened_panel.gd"
const FORBIDDEN_PLAYER_TOKENS: Array[String] = [
	"listingid",
	"instanceid",
	"envelopeid",
	"statefingerprint",
	"sellerusername",
	"equipmentenvelope",
	"requestid",
	"traceid",
	"schemaversion",
	"debug",
	"/market/",
	"http://",
	"https://",
]

var _errors: Array[String] = []
var _mode_events: Array[String] = []
var _category_events: Array[String] = []
var _search_events: Array[String] = []
var _sort_events: Array[String] = []
var _listing_events: Array[String] = []
var _sell_source_events: Array[String] = []
var _sell_count_events: Array[int] = []
var _sell_currency_events: Array[String] = []
var _sell_price_events: Array[int] = []
var _buy_count := 0
var _sell_count := 0
var _cancel_count := 0
var _refresh_count := 0
var _close_count := 0
var _capture_dir := ""
var _panel: MarketAwakenedPanel


func _initialize() -> void:
	call_deferred("_run")


# A synchronous, side-effect-free contract probe for thin future wrappers.
# The executable check below adds real input, filtering and confirmation coverage.
static func run_check() -> Dictionary:
	var errors: Array[String] = []
	var panel := MarketAwakenedPanel.new()
	panel.prepare()
	if not panel.is_awakened_market_panel():
		errors.append("交易所没有声明觉醒式全屏视图")
	if panel.custom_minimum_size != Vector2(VIEWPORT_SIZE):
		errors.append("交易所最小画布不是 1280×720")
	var canvas := panel.get_node_or_null("MarketAwakenedCanvas") as Control
	if canvas == null or canvas.custom_minimum_size != Vector2(VIEWPORT_SIZE):
		errors.append("交易所缺少固定 1280×720 主画布")
	var backdrop := panel.get_node_or_null(
		"MarketAwakenedCanvas/MarketAwakenedBackdrop"
	) as TextureRect
	if backdrop == null or backdrop.texture == null:
		errors.append("交易所没有加载原创卷轴底板")
	if (
		panel.buy_tab_button == null
		or panel.sell_tab_button == null
		or panel.mine_tab_button == null
		or panel.http_request == null
	):
		errors.append("交易所缺少三态页签或权威请求节点")
	panel.free()
	return {
		"schemaVersion": 1,
		"reportType": "beastbound.market_awakened_panel_static_check",
		"result": "PASS" if errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"errors": errors,
	}


func _run() -> void:
	_capture_dir = _capture_directory_argument()
	root.size = VIEWPORT_SIZE
	root.content_scale_size = VIEWPORT_SIZE
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var static_report := run_check()
	for raw_error in static_report.get("errors", []):
		_errors.append(str(raw_error))

	_panel = MarketAwakenedPanel.new()
	_panel.name = "MarketAwakenedPanelCheckSubject"
	_panel.position = Vector2.ZERO
	_panel.size = Vector2(VIEWPORT_SIZE)
	_connect_panel_signals()
	root.add_child(_panel)
	_panel.apply_view_state(_buy_state())
	await _settle()
	if OS.get_cmdline_user_args().has("--capture-only"):
		await _run_capture_only(static_report)
		return

	_append_layout_errors()
	_append_visible_text_errors("购买页")
	await _check_buy_projection_and_confirmation()
	await _capture("market-buy-1280x720.png")

	await _real_left_click(_panel.sell_tab_button)
	_expect(_panel.current_mode() == "sell", "出售页签没有切换到 sell 模式")
	await _check_sell_controls_and_confirmation()
	_append_visible_text_errors("出售页")
	await _capture("market-sell-1280x720.png")

	await _real_left_click(_panel.mine_tab_button)
	_expect(_panel.current_mode() == "mine", "我的挂单页签没有切换到 mine 模式")
	await _check_mine_confirmation()
	_append_visible_text_errors("我的挂单页")
	await _capture("market-mine-1280x720.png")

	await _real_left_click(_panel.buy_tab_button)
	_expect(
		_mode_events == ["sell", "mine", "buy"],
		"三态页签真实左键事件不正确：%s" % str(_mode_events)
	)
	await _check_pending_lock()
	_panel.apply_view_state(_buy_state())
	await _settle()
	await _real_left_click(_panel.refresh_button)
	await _real_left_click(_panel.close_button)
	_expect(_refresh_count == 1, "刷新按钮没有发出一次刷新事件")
	_expect(_close_count == 1, "关闭按钮没有发出一次关闭事件")

	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.market_awakened_panel_check",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"staticResult": str(static_report.get("result", "FAIL")),
		"modeEvents": _mode_events,
		"categoryEvents": _category_events,
		"searchEvents": _search_events,
		"sortEvents": _sort_events,
		"listingEvents": _listing_events,
		"sellSourceEvents": _sell_source_events,
		"sellCountEvents": _sell_count_events,
		"sellCurrencyEvents": _sell_currency_events,
		"sellPriceEvents": _sell_price_events,
		"confirmedActions": {
			"buy": _buy_count,
			"sell": _sell_count,
			"cancel": _cancel_count,
		},
		"captureDirectory": _capture_dir,
		"errors": _errors,
	}
	print("market awakened panel check: %s" % JSON.stringify(report))
	_panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _run_capture_only(static_report: Dictionary) -> void:
	_panel.apply_view_state(_buy_state())
	await _capture("market-buy-1280x720.png")
	_panel.apply_view_state(_sell_state("equipment_club"))
	await _capture("market-sell-1280x720.png")
	_panel.apply_view_state(_mine_state())
	await _capture("market-mine-1280x720.png")
	var report := {
		"schemaVersion": 1,
		"reportType": "beastbound.market_awakened_panel_capture",
		"result": "PASS" if _errors.is_empty() else "FAIL",
		"staticResult": str(static_report.get("result", "FAIL")),
		"viewport": {"width": VIEWPORT_SIZE.x, "height": VIEWPORT_SIZE.y},
		"captureDirectory": _capture_dir,
		"errors": _errors,
	}
	print("market awakened panel capture: %s" % JSON.stringify(report))
	_panel.queue_free()
	await process_frame
	quit(0 if _errors.is_empty() else 1)


func _connect_panel_signals() -> void:
	_panel.mode_requested.connect(_on_mode_requested)
	_panel.category_requested.connect(func(category_id: String) -> void:
		_category_events.append(category_id)
	)
	_panel.search_changed.connect(func(value: String) -> void:
		_search_events.append(value)
	)
	_panel.sort_requested.connect(func(sort_id: String) -> void:
		_sort_events.append(sort_id)
	)
	_panel.listing_selected.connect(func(listing_id: String) -> void:
		_listing_events.append(listing_id)
	)
	_panel.sell_source_selected.connect(_on_sell_source_selected)
	_panel.sell_count_changed.connect(func(value: int) -> void:
		_sell_count_events.append(value)
	)
	_panel.sell_currency_changed.connect(func(value: String) -> void:
		_sell_currency_events.append(value)
	)
	_panel.sell_unit_price_changed.connect(func(value: int) -> void:
		_sell_price_events.append(value)
	)
	_panel.buy_requested.connect(func() -> void: _buy_count += 1)
	_panel.sell_requested.connect(func() -> void: _sell_count += 1)
	_panel.cancel_requested.connect(func() -> void: _cancel_count += 1)
	_panel.refresh_requested.connect(func() -> void: _refresh_count += 1)
	_panel.close_requested.connect(func() -> void: _close_count += 1)


func _on_mode_requested(mode: String) -> void:
	_mode_events.append(mode)
	match mode:
		"sell":
			_panel.apply_view_state(_sell_state("stack_meat"))
		"mine":
			_panel.apply_view_state(_mine_state())
		_:
			_panel.apply_view_state(_buy_state())


func _on_sell_source_selected(selection_key: String) -> void:
	_sell_source_events.append(selection_key)
	_panel.apply_view_state(_sell_state(selection_key))


func _append_layout_errors() -> void:
	_expect(root.size == VIEWPORT_SIZE, "交易所检查没有运行在 1280×720 画布")
	_expect(
		_panel.is_awakened_market_panel(),
		"交易所没有启用觉醒式全屏标识"
	)
	_expect(
		_close_vec(_panel.size, Vector2(VIEWPORT_SIZE)),
		"交易所面板没有完整覆盖 1280×720"
	)
	var canvas := _panel.get_node_or_null("MarketAwakenedCanvas") as Control
	_expect(canvas != null, "交易所缺少固定主画布")
	if canvas != null:
		_expect(
			_close_vec(canvas.size, Vector2(VIEWPORT_SIZE))
				and _close_vec(canvas.global_position, Vector2.ZERO),
			"交易所主画布没有完整覆盖 1280×720"
		)
	var backdrop := _panel.get_node_or_null(
		"MarketAwakenedCanvas/MarketAwakenedBackdrop"
	) as TextureRect
	_expect(
		backdrop != null and backdrop.texture != null,
		"交易所没有显示原创卷轴底板"
	)
	for node_name in [
		"MarketBuyTabButton",
		"MarketSellTabButton",
		"MarketMineTabButton",
		"MarketLeftHeading",
		"MarketListingScroll",
		"MarketListingDetailShell",
		"MarketStatusLabel",
		"MarketServerSign",
	]:
		var control := _panel.find_child(node_name, true, false) as Control
		_expect(
			control != null and _within_viewport(control),
			"交易所关键控件超出 1280×720：%s" % node_name
		)
	_expect(_panel.http_request != null, "交易所没有保留权威请求节点")
	_expect(_panel.category_buttons.size() == 3, "购买页不是全部/装备/道具三类")
	_expect(_panel.listing_buttons.size() == 4, "购买页没有显示四条夹具挂单")
	for button_value in _panel.listing_buttons.values():
		var button := button_value as Button
		_expect(button != null and button.icon != null, "购买卡片没有正式物品图标")


func _check_buy_projection_and_confirmation() -> void:
	var equipment_button := _panel.category_buttons.get("equipment") as Button
	_expect(equipment_button != null, "购买页缺少装备分类")
	if equipment_button != null:
		await _real_left_click(equipment_button)
	_expect(
		int(_panel.ui_snapshot().get("listingCount", -1)) == 2,
		"装备分类没有把本地投影收窄为两条"
	)
	_expect(_category_events == ["equipment"], "装备分类没有发出一次分类事件")

	_panel.search_edit.text = "硬木棒"
	_panel.search_edit.text_changed.emit("硬木棒")
	await _settle()
	_expect(
		int(_panel.ui_snapshot().get("listingCount", -1)) == 1
			and _panel.listing_buttons.has("buy_club"),
		"名称搜索没有仅保留硬木棒挂单"
	)
	_expect(_search_events.has("硬木棒"), "名称搜索没有发出本地搜索事件")

	_panel.search_edit.text = ""
	_panel.search_edit.text_changed.emit("")
	await _settle()
	var all_button := _panel.category_buttons.get("all") as Button
	_expect(all_button != null, "购买页缺少全部分类")
	if all_button != null:
		await _real_left_click(all_button)
	_expect(
		int(_panel.ui_snapshot().get("listingCount", -1)) == 4,
		"清空搜索并返回全部后没有恢复四条挂单"
	)

	_panel.sort_option.select(1)
	_panel.sort_option.item_selected.emit(1)
	await _settle()
	_expect(
		str(_panel.ui_snapshot().get("sortId", "")) == "total_asc"
			and _first_listing_card_id() == "buy_potion",
		"总价升序没有把最低总价挂单排在首位"
	)
	_panel.sort_option.select(2)
	_panel.sort_option.item_selected.emit(2)
	await _settle()
	_expect(
		str(_panel.ui_snapshot().get("sortId", "")) == "total_desc"
			and _first_listing_card_id() == "buy_club",
		"总价降序没有把最高总价挂单排在首位"
	)
	_expect(
		_sort_events == ["total_asc", "total_desc"],
		"排序事件不正确：%s" % str(_sort_events)
	)

	await _real_left_click(_panel.buy_button)
	_expect(_panel.confirmation_visible(), "购买没有打开内嵌确认页")
	_expect(_buy_count == 0, "购买预览阶段已经错误提交")
	var confirm_button := _confirmation_button()
	_expect(confirm_button != null, "购买确认页缺少确认按钮")
	if confirm_button != null:
		await _real_left_click(confirm_button)
	_expect(_buy_count == 1, "购买确认没有恰好发出一次 buy_requested")
	_expect(not _panel.confirmation_visible(), "购买提交后确认页没有关闭")


func _check_sell_controls_and_confirmation() -> void:
	_expect(_panel.sell_source_buttons.size() == 2, "出售页没有展示普通物品和装备实例")
	_expect(_panel.selected_sell_source_key() == "stack_meat", "出售页没有默认选中普通物品")
	_expect(
		int(_panel.sell_count_spinbox.max_value) == 8
			and int(_panel.sell_count_spinbox.value) == 3
			and _panel.sell_count_spinbox.editable,
		"普通物品没有保留 1..持有量 的出售数量控制"
	)
	_expect(
		_panel.sell_currency_option.item_count == 2
			and _panel.selected_sell_currency() == "stoneCoins",
		"普通物品没有只提供石币/钻石两种真实结算货币"
	)
	_expect(
		int(_panel.sell_unit_price_spinbox.min_value) == 1
			and int(_panel.sell_unit_price_spinbox.max_value) == 999999,
		"出售单价没有保持现有客户端 1..999999 边界"
	)

	_panel.sell_count_spinbox.value = 4.0
	_panel.sell_currency_option.select(1)
	_panel.sell_currency_option.item_selected.emit(1)
	_panel.sell_unit_price_spinbox.value = 55.0
	await _settle()
	_expect(_sell_count_events.has(4), "普通物品数量修改没有发出事件")
	_expect(_sell_currency_events.has("diamonds"), "结算货币修改没有发出钻石事件")
	_expect(_sell_price_events.has(55), "出售单价修改没有发出事件")

	await _real_left_click(_panel.sell_button)
	_expect(_panel.confirmation_visible(), "普通物品上架没有打开内嵌确认页")
	_expect(_sell_count == 0, "普通物品上架预览阶段已经错误提交")
	var confirm_button := _confirmation_button()
	if confirm_button != null:
		await _real_left_click(confirm_button)
	_expect(_sell_count == 1, "普通物品确认上架没有发出一次 sell_requested")

	var equipment_button := _panel.sell_source_buttons.get("equipment_club") as Button
	_expect(equipment_button != null, "出售页缺少具体装备实例")
	if equipment_button != null:
		await _real_left_click(equipment_button)
	_expect(
		_panel.selected_sell_source_key() == "equipment_club"
			and int(_panel.sell_count_spinbox.max_value) == 1
			and int(_panel.sell_count_spinbox.value) == 1
			and not _panel.sell_count_spinbox.editable,
		"具体装备实例没有强制数量为 1 且禁止编辑"
	)
	_expect(
		_sell_source_events == ["equipment_club"],
		"具体装备选择事件不正确：%s" % str(_sell_source_events)
	)
	await _real_left_click(_panel.sell_button)
	_expect(_panel.confirmation_visible(), "装备上架没有打开内嵌确认页")
	confirm_button = _confirmation_button()
	if confirm_button != null:
		await _real_left_click(confirm_button)
	_expect(_sell_count == 2, "装备确认上架没有发出第二次 sell_requested")


func _check_mine_confirmation() -> void:
	_expect(_panel.listing_buttons.size() == 1, "我的挂单页没有只展示自己的挂单")
	_expect(
		_panel.cancel_button.visible and not _panel.cancel_button.disabled,
		"我的挂单页没有提供可用的下架按钮"
	)
	await _real_left_click(_panel.cancel_button)
	_expect(_panel.confirmation_visible(), "下架没有打开内嵌确认页")
	_expect(_cancel_count == 0, "下架预览阶段已经错误提交")
	var confirm_button := _confirmation_button()
	if confirm_button != null:
		await _real_left_click(confirm_button)
	_expect(_cancel_count == 1, "确认下架没有恰好发出一次 cancel_requested")


func _check_pending_lock() -> void:
	await _real_left_click(_panel.buy_button)
	_expect(_panel.confirmation_visible(), "pending 检查前无法打开购买确认页")
	var pending_state := _buy_state()
	pending_state["pending"] = true
	pending_state["statusText"] = "正在购买，请稍候"
	_panel.apply_view_state(pending_state)
	await _settle()
	_expect(not _panel.confirmation_visible(), "进入 pending 后没有关闭旧确认页")
	_expect(
		_panel.buy_tab_button.disabled
			and _panel.sell_tab_button.disabled
			and _panel.mine_tab_button.disabled,
		"pending 时没有锁定三态页签"
	)
	_expect(
		_panel.refresh_button.disabled
			and _panel.close_button.disabled
			and _panel.buy_button.disabled,
		"pending 时没有锁定刷新、关闭和交易动作"
	)
	_expect(
		not _panel.search_edit.editable and _panel.sort_option.disabled,
		"pending 时没有锁定本地搜索与排序"
	)
	var mode_event_count := _mode_events.size()
	await _real_left_click(_panel.sell_tab_button)
	_expect(
		_mode_events.size() == mode_event_count,
		"pending 时禁用页签仍发出了模式事件"
	)


func _buy_state() -> Dictionary:
	var listings: Array[Dictionary] = [
		{
			"listingId": "buy_meat",
			"itemId": "item_meat_small",
			"itemLabel": "小块烤肉",
			"rowKind": "item_stack",
			"categoryId": "item",
			"categoryLabel": "道具",
			"count": 3,
			"unitPrice": 100,
			"totalPrice": 300,
			"currency": "stoneCoins",
			"currencyLabel": "石币",
			"sellerLabel": "火芽村猎人",
			"stateSummary": "补给品",
			"detailLines": ["战斗外恢复少量体力"],
			"valid": true,
		},
		{
			"listingId": "buy_club",
			"itemId": "weapon_wooden_club",
			"itemLabel": "硬木棒",
			"rowKind": "equipment_instance",
			"categoryId": "equipment",
			"categoryLabel": "装备",
			"count": 1,
			"unitPrice": 900,
			"totalPrice": 900,
			"currency": "stoneCoins",
			"currencyLabel": "石币",
			"sellerLabel": "山风",
			"stateSummary": "武器 · 强化 +2",
			"detailLines": ["攻击 +8", "耐久 55/60"],
			"valid": true,
		},
		{
			"listingId": "buy_potion",
			"itemId": "equip_frag_hide_basic",
			"itemLabel": "初级兽皮碎片",
			"rowKind": "item_stack",
			"categoryId": "item",
			"categoryLabel": "道具",
			"count": 2,
			"unitPrice": 120,
			"totalPrice": 240,
			"currency": "stoneCoins",
			"currencyLabel": "石币",
			"sellerLabel": "药师学徒",
			"stateSummary": "合成材料",
			"detailLines": ["用于打造兽皮类装备"],
			"valid": true,
		},
		{
			"listingId": "buy_vest",
			"itemId": "armor_hide_vest",
			"itemLabel": "硬皮背心",
			"rowKind": "equipment_instance",
			"categoryId": "equipment",
			"categoryLabel": "装备",
			"count": 1,
			"unitPrice": 600,
			"totalPrice": 600,
			"currency": "diamonds",
			"currencyLabel": "钻石",
			"sellerLabel": "青苔",
			"stateSummary": "防具 · 强化 +1",
			"detailLines": ["防御 +6", "耐久 48/50"],
			"valid": true,
		},
	]
	return {
		"mode": "buy",
		"pending": false,
		"hasServer": true,
		"canRefresh": true,
		"canBuy": true,
		"walletText": "石币 12,480    钻石 86",
		"statusText": "选择商品查看详情；购买整条挂单后由服务器结算",
		"categories": [
			{"id": "all", "label": "全部"},
			{"id": "equipment", "label": "装备"},
			{"id": "item", "label": "道具"},
		],
		"buyListings": listings,
		"selectedListingId": "buy_meat",
		"selectedCategoryId": "all",
		"searchText": "",
		"sortId": "latest",
	}


func _sell_state(selection_key: String) -> Dictionary:
	var ordinary := {
		"selectionKey": "stack_meat",
		"itemId": "item_meat_small",
		"itemLabel": "小块烤肉",
		"rowKind": "item_stack",
		"count": 8,
		"stateSummary": "背包可用 x8",
		"detailLines": ["普通物品可按数量上架"],
		"valid": true,
	}
	var equipment := {
		"selectionKey": "equipment_club",
		"itemId": "weapon_wooden_club",
		"itemLabel": "硬木棒 +2",
		"rowKind": "equipment_instance",
		"count": 1,
		"stateSummary": "具体装备 · 强化 +2",
		"detailLines": ["攻击 +8", "耐久 55/60", "装备上架数量固定为 1"],
		"valid": true,
	}
	var selected_key := (
		"equipment_club" if selection_key == "equipment_club" else "stack_meat"
	)
	var equipment_selected := selected_key == "equipment_club"
	return {
		"mode": "sell",
		"pending": false,
		"hasServer": true,
		"canRefresh": true,
		"canSell": true,
		"walletText": "石币 12,480    钻石 86",
		"statusText": "成交后扣除交易税，实收货款通过邮箱附件发放",
		"sellSources": [ordinary, equipment],
		"selectedSellKey": selected_key,
		"sellCount": 1 if equipment_selected else 3,
		"sellCountMax": 1 if equipment_selected else 8,
		"sellCountEditable": not equipment_selected,
		"sellCurrency": "stoneCoins",
		"sellCurrencies": [
			{"id": "stoneCoins", "label": "石币"},
			{"id": "diamonds", "label": "钻石"},
		],
		"sellUnitPrice": 320 if equipment_selected else 20,
		"sellUnitPriceMin": 1,
		"sellUnitPriceMax": 999999,
		"sellUnitPriceEditable": true,
		"sellSummaryText": (
			"合计 320石币\n预计税费 4石币 · 预计到手 316石币\n成交后货款通过邮箱附件发放"
			if equipment_selected
			else "合计 60石币\n预计税费 1石币 · 预计到手 59石币\n成交后货款通过邮箱附件发放"
		),
	}


func _mine_state() -> Dictionary:
	return {
		"mode": "mine",
		"pending": false,
		"hasServer": true,
		"canRefresh": true,
		"canCancel": true,
		"walletText": "石币 12,480    钻石 86",
		"statusText": "下架后物品按服务器规则退回背包",
		"mineListings": [{
			"listingId": "mine_meat",
			"itemId": "item_meat_small",
			"itemLabel": "小块烤肉",
			"rowKind": "item_stack",
			"categoryId": "item",
			"categoryLabel": "道具",
			"count": 4,
			"unitPrice": 25,
			"totalPrice": 100,
			"currency": "stoneCoins",
			"currencyLabel": "石币",
			"stateSummary": "我的在售",
			"detailLines": ["创建时间：今天 15:18"],
			"valid": true,
		}],
		"selectedListingId": "mine_meat",
		"selectedCategoryId": "all",
	}


func _first_listing_card_id() -> String:
	var grid := _panel.find_child("MarketListingGrid", true, false) as GridContainer
	if grid == null:
		return ""
	for child in grid.get_children():
		if child is Button:
			var row_value = (child as Button).get_meta("listing", {})
			if row_value is Dictionary:
				return str((row_value as Dictionary).get("listingId", ""))
	return ""


func _confirmation_button() -> Button:
	return _panel.find_child(
		"MarketConfirmationConfirmButton", true, false
	) as Button


func _append_visible_text_errors(context: String) -> void:
	var texts: Array[String] = []
	_collect_visible_player_text(_panel, texts)
	for value in texts:
		var lowered := value.to_lower()
		for token in FORBIDDEN_PLAYER_TOKENS:
			_expect(
				not lowered.contains(token),
				"%s暴露了原始服务端/调试字段：%s" % [context, token]
			)
		_expect(
			not _contains_emoji(value),
			"%s使用了 emoji 代替正式图标：%s" % [context, value]
		)


func _collect_visible_player_text(node: Node, output: Array[String]) -> void:
	if node is CanvasItem and not (node as CanvasItem).is_visible_in_tree():
		return
	if node is Label:
		_append_non_empty(output, (node as Label).text)
	elif node is RichTextLabel:
		_append_non_empty(output, (node as RichTextLabel).text)
	elif node is Button:
		var button := node as Button
		_append_non_empty(output, button.text)
		_append_non_empty(output, button.tooltip_text)
		if button is OptionButton:
			var option := button as OptionButton
			for index in range(option.item_count):
				_append_non_empty(output, option.get_item_text(index))
	elif node is LineEdit:
		var edit := node as LineEdit
		_append_non_empty(output, edit.text)
		_append_non_empty(output, edit.placeholder_text)
	for child in node.get_children():
		_collect_visible_player_text(child, output)


func _append_non_empty(output: Array[String], value: String) -> void:
	var normalized := value.strip_edges()
	if normalized != "" and not output.has(normalized):
		output.append(normalized)


func _contains_emoji(value: String) -> bool:
	for index in range(value.length()):
		var code := value.unicode_at(index)
		if (
			(code >= 0x1F000 and code <= 0x1FAFF)
			or (code >= 0x2600 and code <= 0x27BF)
		):
			return true
	return false


func _real_left_click(control: Control) -> void:
	if control == null:
		return
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
	if image.get_size() != VIEWPORT_SIZE:
		_errors.append(
			"截图不是 1280×720：%s 为 %s" % [file_name, str(image.get_size())]
		)
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


func _within_viewport(control: Control) -> bool:
	var rect := control.get_global_rect()
	return (
		rect.position.x >= -0.5
		and rect.position.y >= -0.5
		and rect.end.x <= float(VIEWPORT_SIZE.x) + 0.5
		and rect.end.y <= float(VIEWPORT_SIZE.y) + 0.5
	)


func _close_vec(left: Vector2, right: Vector2) -> bool:
	return left.distance_to(right) <= 0.5


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_errors.append(message)
