extends PanelContainer
class_name MarketAwakenedPanel

const MarketAwakenedVisualSkin := preload(
	"res://scripts/ui/market_awakened_visual_skin.gd"
)
const HEADER_ICON_TEXTURE := preload(
	"res://assets/ui/market_awakened_v1/runtime/market_header_icon.png"
)
const MARKET_BACKDROP_TEXTURE := preload(
	"res://assets/ui/market_awakened_v1/runtime/market_backdrop_1280x720.png"
)

signal close_requested
signal refresh_requested
signal mode_requested(mode: String)
signal category_requested(category_id: String)
signal search_changed(text: String)
signal sort_requested(sort_id: String)
signal listing_selected(listing_id: String)
signal sell_source_selected(selection_key: String)
signal sell_count_changed(count: int)
signal sell_currency_changed(currency: String)
signal sell_unit_price_changed(price: int)
signal buy_requested
signal sell_requested
signal cancel_requested

const CANVAS_SIZE := Vector2(1280.0, 720.0)
const MODE_BUY := "buy"
const MODE_SELL := "sell"
const MODE_MINE := "mine"
const DEFAULT_CATEGORY_ID := "all"

# Public controls form the deliberately small coordinator/QA surface.
var wallet_label: Label
var status_label: Label
var refresh_button: Button
var close_button: Button
var buy_tab_button: Button
var sell_tab_button: Button
var mine_tab_button: Button
var buy_button: Button
var cancel_button: Button
var sell_button: Button
var sell_count_spinbox: SpinBox
var sell_currency_option: OptionButton
var sell_unit_price_spinbox: SpinBox
var http_request: HTTPRequest
var search_edit: LineEdit
var sort_option: OptionButton

var listing_buttons: Dictionary = {}
var sell_source_buttons: Dictionary = {}
var category_buttons: Dictionary = {}

var _built := false
var _canvas: Control
var _mode := MODE_BUY
var _pending := false
var _has_server := false
var _view_state: Dictionary = {}
var _listing_rows: Array[Dictionary] = []
var _sell_source_rows: Array[Dictionary] = []
var _selected_listing_id := ""
var _selected_sell_key := ""
var _selected_category_id := DEFAULT_CATEGORY_ID
var _search_text := ""
var _sort_id := "latest"

var _left_heading: Label
var _category_scroll: ScrollContainer
var _category_container: VBoxContainer
var _sell_source_scroll: ScrollContainer
var _sell_source_grid: GridContainer
var _sell_empty_label: Label

var _listing_group: Control
var _listing_heading: Label
var _listing_count_label: Label
var _listing_scroll: ScrollContainer
var _listing_grid: GridContainer
var _listing_empty_label: Label

var _detail_group: Control
var _detail_title_label: Label
var _detail_icon: TextureRect
var _detail_price_label: Label
var _detail_seller_label: Label
var _detail_text_label: RichTextLabel
var _detail_hint_label: Label

var _sell_group: Control
var _sell_preview_icon: TextureRect
var _sell_preview_name: Label
var _sell_preview_state: Label
var _sell_preview_detail: RichTextLabel
var _sell_summary_label: Label

var _confirmation_scrim: ColorRect
var _confirmation_title: Label
var _confirmation_summary: Label
var _confirmation_confirm_button: Button
var _confirmation_kind := ""


func _ready() -> void:
	_ensure_built()


func prepare() -> void:
	_ensure_built()


func is_awakened_market_panel() -> bool:
	return true


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	_mode = _normalized_mode(str(state.get("mode", _mode)))
	_pending = bool(state.get("pending", state.get("requestPending", false)))
	_has_server = bool(state.get("hasServer", state.get("hasServerSession", false)))

	wallet_label.text = str(
		state.get("walletText", state.get("walletLabel", "资产同步中"))
	).strip_edges()
	if wallet_label.text == "":
		wallet_label.text = "资产同步中"
	status_label.text = str(state.get("statusText", ""))

	_listing_rows = _listing_rows_for_state(state, _mode)
	_sell_source_rows = _dictionary_array(
		state.get("sellSources", state.get("sellRows", []))
	)
	_selected_listing_id = str(
		state.get("selectedListingId", _selected_listing_id)
	).strip_edges()
	_selected_sell_key = str(
		state.get("selectedSellKey", state.get("selectedSellSourceKey", _selected_sell_key))
	).strip_edges()
	_selected_category_id = str(
		state.get("selectedCategoryId", _selected_category_id)
	).strip_edges()
	if _selected_category_id == "":
		_selected_category_id = DEFAULT_CATEGORY_ID
	_search_text = str(state.get("searchText", _search_text))
	_sort_id = _normalized_sort(str(state.get("sortId", _sort_id)))
	_apply_search_and_sort_controls()

	_apply_sell_controls(state)
	_render_mode()
	if _pending:
		hide_confirmation()


func selected_listing_id() -> String:
	return _selected_listing_id


func selected_listing() -> Dictionary:
	return _row_by_key(_listing_rows, "listingId", _selected_listing_id)


func selected_sell_row() -> Dictionary:
	return _row_by_key(_sell_source_rows, "selectionKey", _selected_sell_key)


func selected_sell_source_key() -> String:
	return _selected_sell_key


func selected_sell_currency() -> String:
	if sell_currency_option == null:
		return "stoneCoins"
	var selected_index := int(sell_currency_option.selected)
	if selected_index < 0 or selected_index >= sell_currency_option.item_count:
		return "stoneCoins"
	var metadata = sell_currency_option.get_item_metadata(selected_index)
	var currency := str(metadata).strip_edges()
	return currency if currency != "" else "stoneCoins"


func current_mode() -> String:
	return _mode


func confirmation_visible() -> bool:
	return _confirmation_scrim != null and _confirmation_scrim.visible


func hide_confirmation() -> void:
	if _confirmation_scrim != null:
		_confirmation_scrim.visible = false
	_confirmation_kind = ""


func ui_snapshot() -> Dictionary:
	return {
		"mode": _mode,
		"pending": _pending,
		"listingCount": listing_buttons.size(),
		"sellSourceCount": sell_source_buttons.size(),
		"selectedListingId": _selected_listing_id,
		"selectedSellKey": _selected_sell_key,
		"selectedCategoryId": _selected_category_id,
		"searchText": _search_text,
		"sortId": _sort_id,
		"confirmationVisible": confirmation_visible(),
	}


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "MarketAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.transparent_panel_style()
	)

	_canvas = Control.new()
	_canvas.name = "MarketAwakenedCanvas"
	_canvas.anchor_left = 0.5
	_canvas.anchor_top = 0.5
	_canvas.anchor_right = 0.5
	_canvas.anchor_bottom = 0.5
	_canvas.offset_left = -640.0
	_canvas.offset_top = -360.0
	_canvas.offset_right = 640.0
	_canvas.offset_bottom = 360.0
	_canvas.custom_minimum_size = CANVAS_SIZE
	_canvas.clip_contents = true
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_canvas)
	_add_market_backdrop()
	_build_header()
	_build_tabs()
	_build_left_column()
	_build_listing_group()
	_build_detail_group()
	_build_sell_group()
	_build_status_bar()
	_build_confirmation()

	http_request = HTTPRequest.new()
	http_request.name = "MarketHttpRequest"
	http_request.timeout = 8.0
	add_child(http_request)


func _add_market_backdrop() -> void:
	var backdrop := TextureRect.new()
	backdrop.name = "MarketAwakenedBackdrop"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.texture = MARKET_BACKDROP_TEXTURE
	backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	backdrop.stretch_mode = TextureRect.STRETCH_SCALE
	backdrop.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(backdrop)


func _build_header() -> void:
	var icon := TextureRect.new()
	icon.name = "MarketHeaderIcon"
	icon.position = Vector2(68.0, 12.0)
	icon.size = Vector2(42.0, 42.0)
	icon.texture = HEADER_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(icon)

	var title := Label.new()
	title.name = "MarketTitle"
	title.text = "交易所"
	title.position = Vector2(112.0, 10.0)
	title.size = Vector2(260.0, 48.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	MarketAwakenedVisualSkin.apply_title(title, 29)
	_canvas.add_child(title)

	wallet_label = Label.new()
	wallet_label.name = "MarketWalletLabel"
	wallet_label.text = "资产同步中"
	wallet_label.position = Vector2(660.0, 12.0)
	wallet_label.size = Vector2(350.0, 42.0)
	wallet_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wallet_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	wallet_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	wallet_label.add_theme_stylebox_override(
		"normal", MarketAwakenedVisualSkin.currency_chip_style()
	)
	MarketAwakenedVisualSkin.apply_body(wallet_label, 16)
	_canvas.add_child(wallet_label)

	refresh_button = Button.new()
	refresh_button.name = "MarketRefreshButton"
	refresh_button.text = "刷新货架"
	refresh_button.position = Vector2(1020.0, 11.0)
	refresh_button.size = Vector2(158.0, 44.0)
	MarketAwakenedVisualSkin.apply_action_button(refresh_button)
	refresh_button.pressed.connect(func() -> void:
		if not _pending:
			refresh_requested.emit()
	)
	_canvas.add_child(refresh_button)

	close_button = Button.new()
	close_button.name = "MarketCloseButton"
	close_button.position = Vector2(1194.0, 9.0)
	close_button.size = Vector2(58.0, 52.0)
	MarketAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void:
		if not _pending:
			close_requested.emit()
	)
	_canvas.add_child(close_button)

	var server_sign := Label.new()
	server_sign.name = "MarketServerSign"
	server_sign.text = "本服"
	server_sign.position = Vector2(1127.0, 238.0)
	server_sign.size = Vector2(130.0, 82.0)
	server_sign.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	server_sign.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	MarketAwakenedVisualSkin.apply_title(server_sign, 23)
	_canvas.add_child(server_sign)


func _build_tabs() -> void:
	buy_tab_button = _tab_button(
		"MarketBuyTabButton", "购买", Vector2(198.0, 136.0), MODE_BUY
	)
	sell_tab_button = _tab_button(
		"MarketSellTabButton", "出售", Vector2(493.0, 136.0), MODE_SELL
	)
	mine_tab_button = _tab_button(
		"MarketMineTabButton", "我的挂单", Vector2(788.0, 136.0), MODE_MINE
	)


func _build_left_column() -> void:
	_left_heading = Label.new()
	_left_heading.name = "MarketLeftHeading"
	_left_heading.text = "商品分类"
	_left_heading.position = Vector2(190.0, 210.0)
	_left_heading.size = Vector2(205.0, 40.0)
	_left_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_left_heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_left_heading.add_theme_stylebox_override(
		"normal", MarketAwakenedVisualSkin.soft_panel_style(0.72, 8)
	)
	MarketAwakenedVisualSkin.apply_title(_left_heading, 20)
	_canvas.add_child(_left_heading)

	_category_scroll = ScrollContainer.new()
	_category_scroll.name = "MarketCategoryScroll"
	_category_scroll.position = Vector2(190.0, 257.0)
	_category_scroll.size = Vector2(205.0, 319.0)
	_category_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_category_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_category_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.add_child(_category_scroll)
	_category_container = VBoxContainer.new()
	_category_container.name = "MarketCategoryList"
	_category_container.custom_minimum_size = Vector2(188.0, 0.0)
	_category_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_category_container.add_theme_constant_override("separation", 7)
	_category_scroll.add_child(_category_container)

	_sell_source_scroll = ScrollContainer.new()
	_sell_source_scroll.name = "MarketSellSourceScroll"
	_sell_source_scroll.position = Vector2(190.0, 257.0)
	_sell_source_scroll.size = Vector2(205.0, 319.0)
	_sell_source_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_sell_source_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_sell_source_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_sell_source_scroll.visible = false
	_canvas.add_child(_sell_source_scroll)
	var sell_content := Control.new()
	sell_content.name = "MarketSellSourceContent"
	sell_content.custom_minimum_size = Vector2(188.0, 319.0)
	_sell_source_scroll.add_child(sell_content)
	_sell_source_grid = GridContainer.new()
	_sell_source_grid.name = "MarketSellSourceGrid"
	_sell_source_grid.columns = 2
	_sell_source_grid.position = Vector2.ZERO
	_sell_source_grid.custom_minimum_size = Vector2(188.0, 0.0)
	_sell_source_grid.add_theme_constant_override("h_separation", 7)
	_sell_source_grid.add_theme_constant_override("v_separation", 7)
	sell_content.add_child(_sell_source_grid)
	_sell_empty_label = _body_label("背包没有可上架物品", 14, true)
	_sell_empty_label.position = Vector2(8.0, 104.0)
	_sell_empty_label.size = Vector2(172.0, 82.0)
	_sell_empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sell_empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_sell_empty_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sell_content.add_child(_sell_empty_label)


func _build_listing_group() -> void:
	_listing_group = Control.new()
	_listing_group.name = "MarketListingGroup"
	_listing_group.position = Vector2.ZERO
	_listing_group.size = CANVAS_SIZE
	# This is a layout-only full-canvas group. Ignoring pointer hits here keeps
	# the header tabs and left filters reachable while the nested cards and
	# scroll containers continue to own their real input regions.
	_listing_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_listing_group)

	var heading_shell := PanelContainer.new()
	heading_shell.position = Vector2(410.0, 210.0)
	heading_shell.size = Vector2(405.0, 40.0)
	heading_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.soft_panel_style(0.66, 7)
	)
	_listing_group.add_child(heading_shell)
	var heading_row := HBoxContainer.new()
	heading_row.add_theme_constant_override("separation", 8)
	heading_shell.add_child(heading_row)
	_listing_heading = _body_label("本服在售", 17, false)
	_listing_heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_listing_heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	heading_row.add_child(_listing_heading)
	search_edit = LineEdit.new()
	search_edit.name = "MarketSearchEdit"
	search_edit.placeholder_text = "搜索名称"
	search_edit.custom_minimum_size = Vector2(112.0, 0.0)
	search_edit.add_theme_font_override(
		"font", MarketAwakenedVisualSkin.body_font()
	)
	search_edit.add_theme_font_size_override("font_size", 13)
	search_edit.add_theme_color_override(
		"font_color", MarketAwakenedVisualSkin.CREAM_TEXT
	)
	search_edit.add_theme_color_override(
		"font_placeholder_color", MarketAwakenedVisualSkin.MUTED_TEXT
	)
	search_edit.add_theme_stylebox_override(
		"normal", MarketAwakenedVisualSkin.soft_panel_style(0.86, 6)
	)
	search_edit.add_theme_stylebox_override(
		"focus", MarketAwakenedVisualSkin.dark_panel_style(0.94, 6)
	)
	search_edit.text_changed.connect(_on_search_text_changed)
	heading_row.add_child(search_edit)
	sort_option = OptionButton.new()
	sort_option.name = "MarketSortOption"
	sort_option.custom_minimum_size = Vector2(102.0, 0.0)
	sort_option.add_item("最新")
	sort_option.set_item_metadata(0, "latest")
	sort_option.add_item("总价升序")
	sort_option.set_item_metadata(1, "total_asc")
	sort_option.add_item("总价降序")
	sort_option.set_item_metadata(2, "total_desc")
	sort_option.add_theme_font_override(
		"font", MarketAwakenedVisualSkin.body_font()
	)
	sort_option.add_theme_font_size_override("font_size", 13)
	sort_option.item_selected.connect(_on_sort_selected)
	heading_row.add_child(sort_option)
	_listing_count_label = _body_label("0 件", 13, true)
	_listing_count_label.custom_minimum_size = Vector2(48.0, 0.0)
	_listing_count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_listing_count_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	heading_row.add_child(_listing_count_label)

	_listing_scroll = ScrollContainer.new()
	_listing_scroll.name = "MarketListingScroll"
	_listing_scroll.position = Vector2(410.0, 257.0)
	_listing_scroll.size = Vector2(405.0, 319.0)
	_listing_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_listing_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_listing_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_listing_group.add_child(_listing_scroll)
	var listing_content := Control.new()
	listing_content.name = "MarketListingContent"
	listing_content.custom_minimum_size = Vector2(388.0, 319.0)
	_listing_scroll.add_child(listing_content)
	_listing_grid = GridContainer.new()
	_listing_grid.name = "MarketListingGrid"
	_listing_grid.columns = 2
	_listing_grid.position = Vector2.ZERO
	_listing_grid.custom_minimum_size = Vector2(388.0, 0.0)
	_listing_grid.add_theme_constant_override("h_separation", 8)
	_listing_grid.add_theme_constant_override("v_separation", 8)
	listing_content.add_child(_listing_grid)
	_listing_empty_label = _body_label("暂无可购买商品", 15, true)
	_listing_empty_label.position = Vector2(18.0, 105.0)
	_listing_empty_label.size = Vector2(352.0, 86.0)
	_listing_empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_listing_empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_listing_empty_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	listing_content.add_child(_listing_empty_label)


func _build_detail_group() -> void:
	_detail_group = Control.new()
	_detail_group.name = "MarketListingDetailGroup"
	_detail_group.position = Vector2.ZERO
	_detail_group.size = CANVAS_SIZE
	_detail_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_detail_group)

	var detail_shell := PanelContainer.new()
	detail_shell.name = "MarketListingDetailShell"
	detail_shell.position = Vector2(825.0, 210.0)
	detail_shell.size = Vector2(260.0, 366.0)
	detail_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.dark_panel_style(0.86, 9)
	)
	_detail_group.add_child(detail_shell)
	var content := Control.new()
	content.mouse_filter = Control.MOUSE_FILTER_PASS
	detail_shell.add_child(content)

	_detail_title_label = Label.new()
	_detail_title_label.name = "MarketDetailTitle"
	_detail_title_label.position = Vector2(5.0, 2.0)
	_detail_title_label.size = Vector2(226.0, 34.0)
	_detail_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_detail_title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	MarketAwakenedVisualSkin.apply_title(_detail_title_label, 19)
	content.add_child(_detail_title_label)

	var icon_shell := PanelContainer.new()
	icon_shell.position = Vector2(67.0, 39.0)
	icon_shell.size = Vector2(92.0, 88.0)
	icon_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.slot_style(true, false)
	)
	content.add_child(icon_shell)
	_detail_icon = TextureRect.new()
	_detail_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_detail_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_detail_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_detail_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_shell.add_child(_detail_icon)

	_detail_price_label = _body_label("", 17, false)
	_detail_price_label.position = Vector2(5.0, 133.0)
	_detail_price_label.size = Vector2(226.0, 27.0)
	_detail_price_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_price_label.add_theme_color_override(
		"font_color", MarketAwakenedVisualSkin.GOLD_TEXT
	)
	content.add_child(_detail_price_label)
	_detail_seller_label = _body_label("", 12, true)
	_detail_seller_label.position = Vector2(5.0, 160.0)
	_detail_seller_label.size = Vector2(226.0, 24.0)
	_detail_seller_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_detail_seller_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	content.add_child(_detail_seller_label)

	var text_shell := PanelContainer.new()
	text_shell.position = Vector2(3.0, 187.0)
	text_shell.size = Vector2(230.0, 92.0)
	text_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.soft_panel_style(0.70, 7)
	)
	content.add_child(text_shell)
	_detail_text_label = RichTextLabel.new()
	_detail_text_label.name = "MarketDetailText"
	_detail_text_label.bbcode_enabled = true
	_detail_text_label.fit_content = false
	_detail_text_label.scroll_active = true
	_detail_text_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	MarketAwakenedVisualSkin.apply_rich_text(_detail_text_label, 13)
	text_shell.add_child(_detail_text_label)

	_detail_hint_label = _body_label("选择商品查看详情", 12, true)
	_detail_hint_label.position = Vector2(5.0, 284.0)
	_detail_hint_label.size = Vector2(226.0, 24.0)
	_detail_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	content.add_child(_detail_hint_label)

	buy_button = _action_button(
		"MarketBuyButton", "确认购买", Vector2(13.0, 313.0), Vector2(204.0, 38.0)
	)
	buy_button.pressed.connect(func() -> void: _show_confirmation("buy"))
	content.add_child(buy_button)
	cancel_button = _action_button(
		"MarketCancelButton", "下架挂单", Vector2(13.0, 313.0), Vector2(204.0, 38.0), true
	)
	cancel_button.pressed.connect(func() -> void: _show_confirmation("cancel"))
	content.add_child(cancel_button)


func _build_sell_group() -> void:
	_sell_group = Control.new()
	_sell_group.name = "MarketSellGroup"
	_sell_group.position = Vector2.ZERO
	_sell_group.size = CANVAS_SIZE
	_sell_group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sell_group.visible = false
	_canvas.add_child(_sell_group)

	var preview_shell := PanelContainer.new()
	preview_shell.name = "MarketSellPreviewShell"
	preview_shell.position = Vector2(410.0, 210.0)
	preview_shell.size = Vector2(245.0, 366.0)
	preview_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.dark_panel_style(0.86, 9)
	)
	_sell_group.add_child(preview_shell)
	var preview_content := Control.new()
	preview_content.mouse_filter = Control.MOUSE_FILTER_PASS
	preview_shell.add_child(preview_content)
	var preview_heading := _title_label("上架预览", 19)
	preview_heading.position = Vector2(5.0, 2.0)
	preview_heading.size = Vector2(211.0, 34.0)
	preview_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	preview_heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	preview_content.add_child(preview_heading)
	var preview_icon_shell := PanelContainer.new()
	preview_icon_shell.position = Vector2(60.0, 39.0)
	preview_icon_shell.size = Vector2(92.0, 88.0)
	preview_icon_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.slot_style(true, false)
	)
	preview_content.add_child(preview_icon_shell)
	_sell_preview_icon = TextureRect.new()
	_sell_preview_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sell_preview_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_sell_preview_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_sell_preview_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview_icon_shell.add_child(_sell_preview_icon)
	_sell_preview_name = _title_label("请选择物品", 18)
	_sell_preview_name.position = Vector2(5.0, 133.0)
	_sell_preview_name.size = Vector2(211.0, 31.0)
	_sell_preview_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sell_preview_name.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_sell_preview_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	preview_content.add_child(_sell_preview_name)
	_sell_preview_state = _body_label("", 12, true)
	_sell_preview_state.position = Vector2(5.0, 165.0)
	_sell_preview_state.size = Vector2(211.0, 24.0)
	_sell_preview_state.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sell_preview_state.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	preview_content.add_child(_sell_preview_state)
	var preview_text_shell := PanelContainer.new()
	preview_text_shell.position = Vector2(3.0, 194.0)
	preview_text_shell.size = Vector2(215.0, 146.0)
	preview_text_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.soft_panel_style(0.70, 7)
	)
	preview_content.add_child(preview_text_shell)
	_sell_preview_detail = RichTextLabel.new()
	_sell_preview_detail.name = "MarketSellPreviewDetail"
	_sell_preview_detail.bbcode_enabled = true
	_sell_preview_detail.fit_content = false
	_sell_preview_detail.scroll_active = true
	_sell_preview_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	MarketAwakenedVisualSkin.apply_rich_text(_sell_preview_detail, 13)
	preview_text_shell.add_child(_sell_preview_detail)

	var form_shell := PanelContainer.new()
	form_shell.name = "MarketSellFormShell"
	form_shell.position = Vector2(666.0, 210.0)
	form_shell.size = Vector2(419.0, 366.0)
	form_shell.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.dark_panel_style(0.84, 9)
	)
	_sell_group.add_child(form_shell)
	var form_content := Control.new()
	form_content.mouse_filter = Control.MOUSE_FILTER_PASS
	form_shell.add_child(form_content)
	var form_heading := _title_label("填写上架信息", 20)
	form_heading.position = Vector2(5.0, 2.0)
	form_heading.size = Vector2(385.0, 34.0)
	form_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	form_heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	form_content.add_child(form_heading)

	var quantity_label := _body_label("出售数量", 15, false)
	quantity_label.position = Vector2(13.0, 46.0)
	quantity_label.size = Vector2(92.0, 37.0)
	quantity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	form_content.add_child(quantity_label)
	sell_count_spinbox = SpinBox.new()
	sell_count_spinbox.name = "MarketSellCountSpinBox"
	sell_count_spinbox.position = Vector2(109.0, 46.0)
	sell_count_spinbox.size = Vector2(264.0, 37.0)
	sell_count_spinbox.min_value = 1.0
	sell_count_spinbox.max_value = 1.0
	sell_count_spinbox.step = 1.0
	sell_count_spinbox.value = 1.0
	sell_count_spinbox.rounded = true
	MarketAwakenedVisualSkin.apply_spinbox(sell_count_spinbox)
	sell_count_spinbox.value_changed.connect(func(value: float) -> void:
		if not sell_count_spinbox.is_blocking_signals():
			sell_count_changed.emit(int(value))
		_update_confirmation_summary()
	)
	form_content.add_child(sell_count_spinbox)

	var currency_label := _body_label("结算货币", 15, false)
	currency_label.position = Vector2(13.0, 91.0)
	currency_label.size = Vector2(92.0, 37.0)
	currency_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	form_content.add_child(currency_label)
	sell_currency_option = OptionButton.new()
	sell_currency_option.name = "MarketSellCurrencyOption"
	sell_currency_option.position = Vector2(109.0, 91.0)
	sell_currency_option.size = Vector2(264.0, 37.0)
	sell_currency_option.add_theme_font_override(
		"font", MarketAwakenedVisualSkin.body_font()
	)
	sell_currency_option.add_theme_font_size_override("font_size", 15)
	sell_currency_option.add_theme_color_override(
		"font_color", MarketAwakenedVisualSkin.CREAM_TEXT
	)
	sell_currency_option.item_selected.connect(func(index: int) -> void:
		if sell_currency_option.is_blocking_signals():
			return
		if index >= 0 and index < sell_currency_option.item_count:
			var currency := str(sell_currency_option.get_item_metadata(index))
			sell_currency_changed.emit(currency)
		_update_confirmation_summary()
	)
	form_content.add_child(sell_currency_option)

	var price_label := _body_label("每件单价", 15, false)
	price_label.position = Vector2(13.0, 136.0)
	price_label.size = Vector2(92.0, 37.0)
	price_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	form_content.add_child(price_label)
	sell_unit_price_spinbox = SpinBox.new()
	sell_unit_price_spinbox.name = "MarketSellUnitPriceSpinBox"
	sell_unit_price_spinbox.position = Vector2(109.0, 136.0)
	sell_unit_price_spinbox.size = Vector2(264.0, 37.0)
	sell_unit_price_spinbox.min_value = 1.0
	sell_unit_price_spinbox.max_value = 999999.0
	sell_unit_price_spinbox.step = 1.0
	sell_unit_price_spinbox.value = 20.0
	sell_unit_price_spinbox.rounded = true
	MarketAwakenedVisualSkin.apply_spinbox(sell_unit_price_spinbox)
	sell_unit_price_spinbox.value_changed.connect(func(value: float) -> void:
		if not sell_unit_price_spinbox.is_blocking_signals():
			sell_unit_price_changed.emit(int(value))
		_update_confirmation_summary()
	)
	form_content.add_child(sell_unit_price_spinbox)

	var settlement_heading := _body_label("结算预览", 15, true)
	settlement_heading.position = Vector2(13.0, 184.0)
	settlement_heading.size = Vector2(360.0, 26.0)
	settlement_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	form_content.add_child(settlement_heading)
	_sell_summary_label = _body_label("选择物品后显示税费与预计到手", 14, true)
	_sell_summary_label.name = "MarketSellSummaryLabel"
	_sell_summary_label.position = Vector2(13.0, 212.0)
	_sell_summary_label.size = Vector2(360.0, 77.0)
	_sell_summary_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sell_summary_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_sell_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sell_summary_label.add_theme_stylebox_override(
		"normal", MarketAwakenedVisualSkin.soft_panel_style(0.70, 7)
	)
	form_content.add_child(_sell_summary_label)

	sell_button = _action_button(
		"MarketSellButton", "确认上架", Vector2(67.0, 302.0), Vector2(252.0, 42.0)
	)
	sell_button.pressed.connect(func() -> void: _show_confirmation("sell"))
	form_content.add_child(sell_button)


func _build_status_bar() -> void:
	status_label = Label.new()
	status_label.name = "MarketStatusLabel"
	status_label.position = Vector2(410.0, 580.0)
	status_label.size = Vector2(675.0, 27.0)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	status_label.add_theme_stylebox_override(
		"normal", MarketAwakenedVisualSkin.soft_panel_style(0.66, 8)
	)
	MarketAwakenedVisualSkin.apply_body(status_label, 14)
	status_label.add_theme_color_override(
		"font_color", MarketAwakenedVisualSkin.GOLD_TEXT
	)
	_canvas.add_child(status_label)


func _build_confirmation() -> void:
	_confirmation_scrim = ColorRect.new()
	_confirmation_scrim.name = "MarketConfirmation"
	_confirmation_scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_confirmation_scrim.color = Color(0.015, 0.011, 0.008, 0.78)
	_confirmation_scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	_confirmation_scrim.visible = false
	_confirmation_scrim.z_index = 20
	_canvas.add_child(_confirmation_scrim)
	var confirmation_panel := PanelContainer.new()
	confirmation_panel.position = Vector2(400.0, 205.0)
	confirmation_panel.size = Vector2(480.0, 310.0)
	confirmation_panel.add_theme_stylebox_override(
		"panel", MarketAwakenedVisualSkin.dark_panel_style(0.98, 12)
	)
	_confirmation_scrim.add_child(confirmation_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 13)
	confirmation_panel.add_child(column)
	_confirmation_title = Label.new()
	_confirmation_title.text = "确认操作"
	_confirmation_title.custom_minimum_size = Vector2(0.0, 48.0)
	_confirmation_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_confirmation_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	MarketAwakenedVisualSkin.apply_title(_confirmation_title, 24)
	column.add_child(_confirmation_title)
	_confirmation_summary = Label.new()
	_confirmation_summary.custom_minimum_size = Vector2(0.0, 148.0)
	_confirmation_summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_confirmation_summary.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_confirmation_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	MarketAwakenedVisualSkin.apply_body(_confirmation_summary, 15)
	column.add_child(_confirmation_summary)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	column.add_child(row)
	var back_button := Button.new()
	back_button.name = "MarketConfirmationBackButton"
	back_button.text = "再看看"
	back_button.custom_minimum_size = Vector2(0.0, 50.0)
	back_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	MarketAwakenedVisualSkin.apply_tab_button(back_button, false)
	back_button.pressed.connect(hide_confirmation)
	row.add_child(back_button)
	_confirmation_confirm_button = Button.new()
	_confirmation_confirm_button.name = "MarketConfirmationConfirmButton"
	_confirmation_confirm_button.text = "确认"
	_confirmation_confirm_button.custom_minimum_size = Vector2(0.0, 50.0)
	_confirmation_confirm_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	MarketAwakenedVisualSkin.apply_action_button(_confirmation_confirm_button)
	_confirmation_confirm_button.pressed.connect(_confirm_action)
	row.add_child(_confirmation_confirm_button)


func _render_mode() -> void:
	_decorate_tabs()
	_left_heading.text = "可上架物品" if _mode == MODE_SELL else (
		"我的挂单" if _mode == MODE_MINE else "商品分类"
	)
	_category_scroll.visible = _mode != MODE_SELL
	_sell_source_scroll.visible = _mode == MODE_SELL
	_listing_group.visible = _mode != MODE_SELL
	_detail_group.visible = _mode != MODE_SELL
	_sell_group.visible = _mode == MODE_SELL
	search_edit.visible = _mode == MODE_BUY
	sort_option.visible = _mode == MODE_BUY

	if _mode == MODE_SELL:
		_rebuild_sell_source_cards()
		_apply_sell_preview()
	else:
		_rebuild_categories()
		_rebuild_listing_cards()
		_apply_listing_detail()
	_update_interaction_state()


func _decorate_tabs() -> void:
	var mapping := {
		MODE_BUY: buy_tab_button,
		MODE_SELL: sell_tab_button,
		MODE_MINE: mine_tab_button,
	}
	for mode_value in mapping.keys():
		var button := mapping.get(mode_value) as Button
		var selected := str(mode_value) == _mode
		button.set_pressed_no_signal(selected)
		button.disabled = _pending
		MarketAwakenedVisualSkin.apply_tab_button(button, selected)


func _rebuild_categories() -> void:
	_clear_children(_category_container)
	category_buttons.clear()
	var categories := _categories_for_rows(_listing_rows)
	var valid_ids: Array[String] = []
	for category in categories:
		var category_id := str(category.get("id", "")).strip_edges()
		if category_id != "":
			valid_ids.append(category_id)
	if not valid_ids.has(_selected_category_id):
		_selected_category_id = DEFAULT_CATEGORY_ID
	for category in categories:
		var category_id := str(category.get("id", "")).strip_edges()
		if category_id == "":
			continue
		var label := str(category.get("label", "全部")).strip_edges()
		var count := int(category.get("count", _count_rows_in_category(category_id)))
		var button := Button.new()
		button.name = "MarketCategory_%s" % _safe_node_token(category_id)
		button.text = "%s  %d" % [label, count]
		button.custom_minimum_size = Vector2(0.0, 52.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.toggle_mode = true
		button.set_pressed_no_signal(category_id == _selected_category_id)
		button.disabled = _pending
		MarketAwakenedVisualSkin.apply_tab_button(
			button, category_id == _selected_category_id
		)
		var captured_id := category_id
		button.pressed.connect(func() -> void: _select_category(captured_id))
		_category_container.add_child(button)
		category_buttons[category_id] = button


func _rebuild_listing_cards() -> void:
	_clear_children(_listing_grid)
	listing_buttons.clear()
	var visible_rows := _filtered_listing_rows()
	_listing_heading.text = "我的在售" if _mode == MODE_MINE else "本服在售"
	_listing_count_label.text = "%d 件" % visible_rows.size()
	_listing_empty_label.text = (
		"暂无自己的在售商品\n从「出售」页选择背包物品上架"
		if _mode == MODE_MINE
		else "暂无可购买商品\n稍后刷新货架再看看"
	)
	_listing_empty_label.visible = visible_rows.is_empty()
	if not _row_array_has_key(visible_rows, "listingId", _selected_listing_id):
		_selected_listing_id = (
			str(visible_rows[0].get("listingId", "")) if not visible_rows.is_empty() else ""
		)
	for row in visible_rows:
		var listing_id := str(row.get("listingId", "")).strip_edges()
		var item_id := str(row.get("itemId", "")).strip_edges()
		var button := Button.new()
		button.name = "MarketListing_%s" % _safe_node_token(listing_id)
		button.text = _listing_card_text(row)
		button.tooltip_text = str(row.get("error", row.get("tooltip", "")))
		button.toggle_mode = true
		button.set_pressed_no_signal(listing_id == _selected_listing_id)
		button.custom_minimum_size = Vector2(190.0, 78.0)
		button.disabled = (
			_pending or listing_id == "" or not bool(row.get("valid", true))
		)
		button.set_meta("listing", row.duplicate(true))
		MarketAwakenedVisualSkin.apply_item_button(
			button, item_id, listing_id == _selected_listing_id
		)
		button.custom_minimum_size = Vector2(190.0, 78.0)
		button.add_theme_constant_override("icon_max_width", 45)
		button.add_theme_font_size_override("font_size", 13)
		_apply_row_icon(button, row, item_id)
		var captured_id := listing_id
		button.pressed.connect(func() -> void: _select_listing(captured_id))
		_listing_grid.add_child(button)
		if listing_id != "":
			listing_buttons[listing_id] = button


func _rebuild_sell_source_cards() -> void:
	_clear_children(_sell_source_grid)
	sell_source_buttons.clear()
	_sell_empty_label.visible = _sell_source_rows.is_empty()
	if not _row_array_has_key(_sell_source_rows, "selectionKey", _selected_sell_key):
		_selected_sell_key = _first_valid_key(_sell_source_rows, "selectionKey")
	for row in _sell_source_rows:
		var selection_key := str(row.get("selectionKey", "")).strip_edges()
		var item_id := str(row.get("itemId", "")).strip_edges()
		var button := Button.new()
		button.name = "MarketSellSource_%s" % _safe_node_token(selection_key)
		button.text = _sell_source_card_text(row)
		button.tooltip_text = str(row.get("error", row.get("tooltip", "")))
		button.toggle_mode = true
		button.set_pressed_no_signal(selection_key == _selected_sell_key)
		button.custom_minimum_size = Vector2(90.0, 82.0)
		button.disabled = (
			_pending or selection_key == "" or not bool(row.get("valid", true))
		)
		button.set_meta("sell_source", row.duplicate(true))
		MarketAwakenedVisualSkin.apply_item_button(
			button, item_id, selection_key == _selected_sell_key
		)
		button.custom_minimum_size = Vector2(90.0, 82.0)
		button.add_theme_constant_override("icon_max_width", 34)
		button.add_theme_font_size_override("font_size", 11)
		_apply_row_icon(button, row, item_id)
		var captured_key := selection_key
		button.pressed.connect(func() -> void: _select_sell_source(captured_key))
		_sell_source_grid.add_child(button)
		if selection_key != "":
			sell_source_buttons[selection_key] = button


func _apply_listing_detail() -> void:
	var row := selected_listing()
	var has_row := not row.is_empty()
	_detail_title_label.text = str(row.get("itemLabel", "请选择商品"))
	var item_id := str(row.get("itemId", ""))
	_detail_icon.texture = _texture_for_row(row, item_id)
	_detail_icon.visible = has_row and _detail_icon.texture != null
	var count := maxi(1, int(row.get("count", 1)))
	var total := _listing_total(row)
	var currency_label := _currency_label_for_row(row)
	_detail_price_label.text = (
		"%d%s" % [total, currency_label] if has_row else ""
	)
	var seller := str(
		row.get("sellerLabel", row.get("sellerDisplayName", row.get("sellerUsername", "")))
	).strip_edges()
	_detail_seller_label.text = "卖家：%s" % seller if seller != "" else ""
	_detail_text_label.text = _listing_detail_text(row)
	_detail_hint_label.text = (
		"共 %d 件，确认后由服务器结算" % count
		if has_row and _mode == MODE_BUY
		else (
			"下架后按服务器规则退回物品" if has_row else "选择商品查看详情"
		)
	)
	buy_button.visible = _mode == MODE_BUY
	cancel_button.visible = _mode == MODE_MINE
	_update_interaction_state()


func _apply_sell_preview() -> void:
	var row := selected_sell_row()
	var has_row := not row.is_empty()
	var item_id := str(row.get("itemId", ""))
	_sell_preview_icon.texture = _texture_for_row(row, item_id)
	_sell_preview_icon.visible = has_row and _sell_preview_icon.texture != null
	_sell_preview_name.text = str(row.get("itemLabel", "请选择物品"))
	_sell_preview_state.text = str(
		row.get("stateSummary", "背包可用数量 %d" % int(row.get("count", 0)))
	) if has_row else ""
	_sell_preview_detail.text = _sell_source_detail_text(row)
	var summary := str(
		_view_state.get("sellSummaryText", _view_state.get("sellSummary", ""))
	).strip_edges()
	if summary == "":
		summary = "选择物品后显示税费与预计到手" if not has_row else _local_sell_summary(row)
	_sell_summary_label.text = summary
	_update_interaction_state()


func _apply_sell_controls(state: Dictionary) -> void:
	var selected_row := _row_by_key(
		_dictionary_array(state.get("sellSources", state.get("sellRows", []))),
		"selectionKey",
		str(state.get("selectedSellKey", state.get("selectedSellSourceKey", _selected_sell_key)))
	)
	var is_equipment := str(selected_row.get("rowKind", "")).contains("equipment")
	var max_count := maxi(1, int(state.get("sellCountMax", selected_row.get("count", 1))))
	var count := clampi(int(state.get("sellCount", 1)), 1, max_count)
	sell_count_spinbox.set_block_signals(true)
	sell_count_spinbox.min_value = 1.0
	sell_count_spinbox.max_value = 1.0 if is_equipment else float(max_count)
	sell_count_spinbox.value = 1.0 if is_equipment else float(count)
	sell_count_spinbox.editable = (
		bool(state.get("sellCountEditable", not is_equipment))
		and not _pending
		and not selected_row.is_empty()
	)
	sell_count_spinbox.set_block_signals(false)

	var currencies := _dictionary_array(state.get("sellCurrencies", []))
	if currencies.is_empty():
		currencies = [
			{"id": "stoneCoins", "label": "石币"},
			{"id": "diamonds", "label": "钻石"},
		]
	var selected_currency := str(state.get("sellCurrency", "stoneCoins"))
	sell_currency_option.set_block_signals(true)
	sell_currency_option.clear()
	var selected_currency_index := 0
	for index in range(currencies.size()):
		var currency := currencies[index]
		var currency_id := str(currency.get("id", "stoneCoins")).strip_edges()
		var currency_label := str(currency.get("label", _currency_label(currency_id)))
		sell_currency_option.add_item(currency_label)
		sell_currency_option.set_item_metadata(index, currency_id)
		if currency_id == selected_currency:
			selected_currency_index = index
	if sell_currency_option.item_count > 0:
		sell_currency_option.select(selected_currency_index)
	sell_currency_option.disabled = (
		_pending or selected_row.is_empty() or not bool(selected_row.get("valid", true))
	)
	sell_currency_option.set_block_signals(false)

	var unit_price := maxi(1, int(state.get("sellUnitPrice", 20)))
	sell_unit_price_spinbox.set_block_signals(true)
	sell_unit_price_spinbox.min_value = float(maxi(1, int(state.get("sellUnitPriceMin", 1))))
	sell_unit_price_spinbox.max_value = float(maxi(
		int(sell_unit_price_spinbox.min_value),
		int(state.get("sellUnitPriceMax", 999999))
	))
	sell_unit_price_spinbox.value = clampf(
		float(unit_price),
		sell_unit_price_spinbox.min_value,
		sell_unit_price_spinbox.max_value
	)
	sell_unit_price_spinbox.editable = (
		bool(state.get("sellUnitPriceEditable", true))
		and not _pending
		and not selected_row.is_empty()
		and bool(selected_row.get("valid", true))
	)
	sell_unit_price_spinbox.set_block_signals(false)


func _apply_search_and_sort_controls() -> void:
	search_edit.set_block_signals(true)
	search_edit.text = _search_text
	search_edit.set_block_signals(false)
	sort_option.set_block_signals(true)
	var selected_index := 0
	for index in range(sort_option.item_count):
		if str(sort_option.get_item_metadata(index)) == _sort_id:
			selected_index = index
			break
	sort_option.select(selected_index)
	sort_option.set_block_signals(false)


func _update_interaction_state() -> void:
	var listing := selected_listing()
	var sell_row := selected_sell_row()
	var selected_listing_valid := (
		not listing.is_empty() and bool(listing.get("valid", true))
	)
	var selected_sell_valid := (
		not sell_row.is_empty() and bool(sell_row.get("valid", true))
	)
	refresh_button.disabled = _pending or not bool(
		_view_state.get("canRefresh", _has_server)
	)
	close_button.disabled = _pending
	buy_button.disabled = (
		_pending
		or not selected_listing_valid
		or not bool(_view_state.get("canBuy", false))
	)
	cancel_button.disabled = (
		_pending
		or not selected_listing_valid
		or not bool(_view_state.get("canCancel", false))
	)
	sell_button.disabled = (
		_pending
		or not selected_sell_valid
		or not bool(_view_state.get("canSell", false))
		or int(sell_count_spinbox.value) <= 0
		or int(sell_unit_price_spinbox.value) <= 0
	)
	sell_count_spinbox.editable = sell_count_spinbox.editable and not _pending
	sell_currency_option.disabled = sell_currency_option.disabled or _pending
	sell_unit_price_spinbox.editable = sell_unit_price_spinbox.editable and not _pending
	search_edit.editable = not _pending
	sort_option.disabled = _pending
	_confirmation_confirm_button.disabled = _pending
	MarketAwakenedVisualSkin.apply_action_button(buy_button)
	MarketAwakenedVisualSkin.apply_action_button(cancel_button, true)
	MarketAwakenedVisualSkin.apply_action_button(sell_button)
	MarketAwakenedVisualSkin.apply_action_button(refresh_button)


func _select_category(category_id: String) -> void:
	if _pending or category_id == "":
		return
	_selected_category_id = category_id
	var previous_listing_id := _selected_listing_id
	_rebuild_categories()
	_rebuild_listing_cards()
	_apply_listing_detail()
	category_requested.emit(category_id)
	if _selected_listing_id != "" and _selected_listing_id != previous_listing_id:
		listing_selected.emit(_selected_listing_id)


func _on_search_text_changed(value: String) -> void:
	if search_edit.is_blocking_signals():
		return
	_search_text = value
	_rebuild_listing_cards()
	_apply_listing_detail()
	search_changed.emit(value)


func _on_sort_selected(index: int) -> void:
	if sort_option.is_blocking_signals():
		return
	if index < 0 or index >= sort_option.item_count:
		return
	_sort_id = _normalized_sort(str(sort_option.get_item_metadata(index)))
	_rebuild_listing_cards()
	_apply_listing_detail()
	sort_requested.emit(_sort_id)


func _select_listing(listing_id: String) -> void:
	if _pending or listing_id == "":
		return
	_selected_listing_id = listing_id
	for key_value in listing_buttons.keys():
		var button := listing_buttons.get(key_value) as Button
		var selected := str(key_value) == listing_id
		button.set_pressed_no_signal(selected)
		MarketAwakenedVisualSkin.apply_item_button(
			button, str((button.get_meta("listing", {}) as Dictionary).get("itemId", "")), selected
		)
		button.custom_minimum_size = Vector2(190.0, 78.0)
		button.add_theme_constant_override("icon_max_width", 45)
	_apply_listing_detail()
	hide_confirmation()
	listing_selected.emit(listing_id)


func _select_sell_source(selection_key: String) -> void:
	if _pending or selection_key == "":
		return
	_selected_sell_key = selection_key
	for key_value in sell_source_buttons.keys():
		var button := sell_source_buttons.get(key_value) as Button
		var selected := str(key_value) == selection_key
		button.set_pressed_no_signal(selected)
		MarketAwakenedVisualSkin.apply_item_button(
			button, str((button.get_meta("sell_source", {}) as Dictionary).get("itemId", "")), selected
		)
		button.custom_minimum_size = Vector2(90.0, 82.0)
		button.add_theme_constant_override("icon_max_width", 34)
	_apply_sell_preview()
	hide_confirmation()
	sell_source_selected.emit(selection_key)


func _show_confirmation(kind: String) -> void:
	if _pending:
		return
	match kind:
		"buy":
			if buy_button.disabled or selected_listing().is_empty():
				return
		"sell":
			if sell_button.disabled or selected_sell_row().is_empty():
				return
		"cancel":
			if cancel_button.disabled or selected_listing().is_empty():
				return
		_:
			return
	_confirmation_kind = kind
	_update_confirmation_summary()
	_confirmation_scrim.visible = true


func _update_confirmation_summary() -> void:
	if _confirmation_summary == null:
		return
	match _confirmation_kind:
		"buy":
			var listing := selected_listing()
			var item_label := str(listing.get("itemLabel", "商品"))
			var count := maxi(1, int(listing.get("count", 1)))
			var total := _listing_total(listing)
			var currency_label := _currency_label_for_row(listing)
			_confirmation_title.text = "确认购买"
			_confirmation_confirm_button.text = "确认购买"
			_confirmation_summary.text = (
				"购买「%s」x%d\n合计 %d%s。\n确认后由服务器完成交易。"
				% [item_label, count, total, currency_label]
			)
		"sell":
			var sell_row := selected_sell_row()
			var item_label := str(sell_row.get("itemLabel", "物品"))
			var count := int(sell_count_spinbox.value)
			var unit_price := int(sell_unit_price_spinbox.value)
			var currency_label := _currency_label(selected_sell_currency())
			_confirmation_title.text = "确认上架"
			_confirmation_confirm_button.text = "确认上架"
			_confirmation_summary.text = (
				"上架「%s」x%d\n单价 %d%s，合计 %d%s。\n%s"
				% [
					item_label,
					count,
					unit_price,
					currency_label,
					count * unit_price,
					currency_label,
					_sell_summary_label.text,
				]
			)
		"cancel":
			var listing := selected_listing()
			var item_label := str(listing.get("itemLabel", "商品"))
			_confirmation_title.text = "确认下架"
			_confirmation_confirm_button.text = "确认下架"
			_confirmation_summary.text = (
				"下架「%s」？\n下架后物品将按服务器规则退回。\n该操作不会直接修改本地背包。"
				% item_label
			)
		_:
			_confirmation_title.text = "确认操作"
			_confirmation_confirm_button.text = "确认"
			_confirmation_summary.text = ""


func _confirm_action() -> void:
	if _pending:
		return
	var kind := _confirmation_kind
	hide_confirmation()
	match kind:
		"buy":
			buy_requested.emit()
		"sell":
			sell_requested.emit()
		"cancel":
			cancel_requested.emit()


func _tab_button(
	node_name: String,
	text_value: String,
	position_value: Vector2,
	mode_value: String
) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text_value
	button.position = position_value
	button.size = Vector2(288.0, 56.0)
	button.toggle_mode = true
	MarketAwakenedVisualSkin.apply_tab_button(button, mode_value == _mode)
	button.pressed.connect(func() -> void:
		if not _pending:
			hide_confirmation()
			mode_requested.emit(mode_value)
	)
	_canvas.add_child(button)
	return button


func _action_button(
	node_name: String,
	text_value: String,
	position_value: Vector2,
	size_value: Vector2,
	destructive: bool = false
) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text_value
	button.position = position_value
	button.size = size_value
	MarketAwakenedVisualSkin.apply_action_button(button, destructive)
	return button


func _title_label(text_value: String, font_size: int) -> Label:
	var label := Label.new()
	label.text = text_value
	MarketAwakenedVisualSkin.apply_title(label, font_size)
	return label


func _body_label(text_value: String, font_size: int, muted: bool) -> Label:
	var label := Label.new()
	label.text = text_value
	MarketAwakenedVisualSkin.apply_body(label, font_size, muted)
	return label


func _listing_rows_for_state(state: Dictionary, mode: String) -> Array[Dictionary]:
	if mode == MODE_MINE:
		if state.has("mineListings"):
			return _dictionary_array(state.get("mineListings", []))
		if state.has("myListings"):
			return _dictionary_array(state.get("myListings", []))
	if mode == MODE_BUY and state.has("buyListings"):
		return _dictionary_array(state.get("buyListings", []))
	return _dictionary_array(
		state.get("listings", state.get("visibleListings", []))
	)


func _categories_for_rows(rows: Array[Dictionary]) -> Array[Dictionary]:
	var provided_categories := _dictionary_array(_view_state.get("categories", []))
	var counts: Dictionary = {DEFAULT_CATEGORY_ID: rows.size()}
	var labels: Dictionary = {DEFAULT_CATEGORY_ID: "全部"}
	for row in rows:
		var category := _category_for_row(row)
		var category_id := str(category.get("id", "item"))
		counts[category_id] = int(counts.get(category_id, 0)) + 1
		labels[category_id] = str(category.get("label", "道具"))
	var result: Array[Dictionary] = [
		{
			"id": DEFAULT_CATEGORY_ID,
			"label": "全部",
			"count": rows.size(),
		}
	]
	for provided in provided_categories:
		var provided_id := str(provided.get("id", "")).strip_edges()
		if provided_id == "" or provided_id == DEFAULT_CATEGORY_ID:
			continue
		result.append({
			"id": provided_id,
			"label": str(provided.get("label", labels.get(provided_id, provided_id))),
			"count": int(counts.get(provided_id, provided.get("count", 0))),
		})
	for category_id_value in counts.keys():
		var category_id := str(category_id_value)
		if category_id == DEFAULT_CATEGORY_ID or _category_array_has_id(result, category_id):
			continue
		result.append({
			"id": category_id,
			"label": str(labels.get(category_id, "道具")),
			"count": int(counts.get(category_id, 0)),
		})
	return result


func _category_for_row(row: Dictionary) -> Dictionary:
	var category_id := str(row.get("categoryId", "")).strip_edges()
	var category_label := str(row.get("categoryLabel", "")).strip_edges()
	if category_id != "":
		return {
			"id": category_id,
			"label": category_label if category_label != "" else category_id,
		}
	var row_kind := str(row.get("rowKind", "")).to_lower()
	if row_kind.contains("equipment"):
		return {"id": "equipment", "label": "装备"}
	return {"id": "item", "label": "道具"}


func _filtered_listing_rows() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for row in _listing_rows:
		if (
			_selected_category_id != DEFAULT_CATEGORY_ID
			and str(_category_for_row(row).get("id", "")) != _selected_category_id
		):
			continue
		if (
			_search_text != ""
			and not str(row.get("itemLabel", "")).to_lower().contains(
				_search_text.to_lower()
			)
		):
			continue
		result.append(row.duplicate(true))
	match _sort_id:
		"total_asc":
			result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
				return _listing_total(a) < _listing_total(b)
			)
		"total_desc":
			result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
				return _listing_total(a) > _listing_total(b)
			)
	return result


func _count_rows_in_category(category_id: String) -> int:
	if category_id == DEFAULT_CATEGORY_ID:
		return _listing_rows.size()
	var count := 0
	for row in _listing_rows:
		if str(_category_for_row(row).get("id", "")) == category_id:
			count += 1
	return count


func _listing_card_text(row: Dictionary) -> String:
	var item_label := str(row.get("itemLabel", "商品"))
	var count := maxi(1, int(row.get("count", 1)))
	if not bool(row.get("valid", true)):
		return "%s\n资料异常" % item_label
	var state_summary := str(row.get("stateSummary", "")).strip_edges()
	var price_text := "%d%s" % [_listing_total(row), _currency_label_for_row(row)]
	return "%s x%d\n%s%s" % [
		item_label,
		count,
		price_text,
		"  ·  %s" % state_summary if state_summary != "" else "",
	]


func _sell_source_card_text(row: Dictionary) -> String:
	var item_label := str(row.get("itemLabel", "物品"))
	if not bool(row.get("valid", true)):
		return "%s\n不可上架" % item_label
	var count := maxi(0, int(row.get("count", 0)))
	var state_summary := str(row.get("stateSummary", "")).strip_edges()
	return "%s\n%s" % [
		item_label,
		state_summary if state_summary != "" else "可用 x%d" % count,
	]


func _listing_detail_text(row: Dictionary) -> String:
	if row.is_empty():
		return ""
	var explicit_text := str(row.get("detailText", "")).strip_edges()
	if explicit_text != "":
		return explicit_text
	if not bool(row.get("valid", true)):
		return "[color=#ff6b60]%s[/color]" % str(
			row.get("error", "该挂单资料异常，暂不可操作。")
		)
	var lines: Array[String] = []
	var state_summary := str(row.get("stateSummary", "")).strip_edges()
	if state_summary != "":
		lines.append("[color=#ffba3d]%s[/color]" % state_summary)
	var detail_lines = row.get("detailLines", [])
	if detail_lines is Array:
		for value in detail_lines as Array:
			var line := str(value).strip_edges()
			if line != "" and not lines.has(line):
				lines.append(line)
	var count := maxi(1, int(row.get("count", 1)))
	var unit_price := maxi(0, int(row.get("unitPrice", 0)))
	lines.append("数量：%d" % count)
	lines.append("单价：%d%s" % [unit_price, _currency_label_for_row(row)])
	return "\n".join(lines)


func _sell_source_detail_text(row: Dictionary) -> String:
	if row.is_empty():
		return "从左侧背包中选择要上架的物品。"
	var explicit_text := str(row.get("detailText", "")).strip_edges()
	if explicit_text != "":
		return explicit_text
	if not bool(row.get("valid", true)):
		return "[color=#ff6b60]%s[/color]" % str(
			row.get("error", "该物品暂不可上架。")
		)
	var lines: Array[String] = []
	var detail_lines = row.get("detailLines", [])
	if detail_lines is Array:
		for value in detail_lines as Array:
			var line := str(value).strip_edges()
			if line != "":
				lines.append(line)
	if lines.is_empty():
		lines.append("背包可用数量：%d" % int(row.get("count", 0)))
	lines.append("确认上架后，物品将由服务器托管。")
	return "\n".join(lines)


func _local_sell_summary(row: Dictionary) -> String:
	var count := int(sell_count_spinbox.value)
	var unit_price := int(sell_unit_price_spinbox.value)
	var total := count * unit_price
	var currency_label := _currency_label(selected_sell_currency())
	var tax_text := str(_view_state.get("sellTaxText", "")).strip_edges()
	if tax_text == "":
		return "合计 %d%s\n税费与预计到手由服务器规则计算" % [total, currency_label]
	return "合计 %d%s\n%s" % [total, currency_label, tax_text]


func _listing_total(row: Dictionary) -> int:
	var count := maxi(1, int(row.get("count", 1)))
	var unit_price := maxi(0, int(row.get("unitPrice", 0)))
	return maxi(0, int(row.get("totalPrice", unit_price * count)))


func _currency_label_for_row(row: Dictionary) -> String:
	var explicit_label := str(row.get("currencyLabel", "")).strip_edges()
	if explicit_label != "":
		return explicit_label
	return _currency_label(str(row.get("currency", "stoneCoins")))


func _currency_label(currency: String) -> String:
	return "钻石" if currency == "diamonds" else "石币"


func _texture_for_row(row: Dictionary, item_id: String) -> Texture2D:
	var texture_value = row.get("iconTexture", null)
	if texture_value is Texture2D:
		return texture_value as Texture2D
	return MarketAwakenedVisualSkin.item_texture_for(item_id)


func _apply_row_icon(button: Button, row: Dictionary, item_id: String) -> void:
	button.icon = _texture_for_row(row, item_id)


func _row_by_key(rows: Array[Dictionary], key: String, value: String) -> Dictionary:
	if value == "":
		return {}
	for row in rows:
		if str(row.get(key, "")) == value:
			return row.duplicate(true)
	return {}


func _row_array_has_key(rows: Array[Dictionary], key: String, value: String) -> bool:
	if value == "":
		return false
	for row in rows:
		if str(row.get(key, "")) == value:
			return true
	return false


func _first_valid_key(rows: Array[Dictionary], key: String) -> String:
	for row in rows:
		var value := str(row.get(key, "")).strip_edges()
		if value != "" and bool(row.get("valid", true)):
			return value
	return ""


func _category_array_has_id(rows: Array[Dictionary], category_id: String) -> bool:
	for row in rows:
		if str(row.get("id", "")) == category_id:
			return true
	return false


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for raw_value in value as Array:
		if raw_value is Dictionary:
			result.append((raw_value as Dictionary).duplicate(true))
	return result


func _clear_children(container: Node) -> void:
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()


func _safe_node_token(value: String) -> String:
	var result := value.strip_edges()
	if result == "":
		return "empty"
	for character in ["/", "\\", ":", "@", "#", " ", "."]:
		result = result.replace(character, "_")
	return result


func _normalized_mode(value: String) -> String:
	return value if [MODE_BUY, MODE_SELL, MODE_MINE].has(value) else MODE_BUY


func _normalized_sort(value: String) -> String:
	return value if ["latest", "total_asc", "total_desc"].has(value) else "latest"
