extends PanelContainer
class_name ShopAwakenedPanel

const CommerceAwakenedVisualSkin := preload(
	"res://scripts/ui/commerce_awakened_visual_skin.gd"
)
const HEADER_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/market.png"
)
const ItemSlotButton := preload("res://scripts/ui/item_slot_button.gd")

signal close_requested
signal mode_requested(mode: String)
signal quantity_requested(quantity: int)
signal maximum_requested
signal equip_after_buy_requested(enabled: bool)
signal repair_requested
signal action_requested

const CANVAS_SIZE := Vector2(1280.0, 720.0)

var title_label: Label
var currency_label: Label
var buy_button: Button
var sell_button: Button
var list_container: VBoxContainer
var detail_label: RichTextLabel
var quantity_minus_button: Button
var quantity_spinbox: SpinBox
var quantity_plus_button: Button
var quantity_max_button: Button
var equip_after_buy_button: Button
var action_button: ItemSlotButton
var repair_button: Button
var close_button: Button
var merchant_name_label: Label
var merchant_role_label: Label
var merchant_duty_label: Label

var _built := false
var _canvas: Control
var _selected_icon: TextureRect
var _selection_hint: Label
var _merchant_portrait: TextureRect


func _ready() -> void:
	_ensure_built()


func prepare() -> void:
	_ensure_built()


func is_awakened_shop_panel() -> bool:
	return true


func apply_service_identity(identity: Dictionary, portrait_texture: Texture2D) -> void:
	_ensure_built()
	merchant_name_label.text = str(identity.get("displayName", "商店服务")).strip_edges()
	merchant_role_label.text = str(identity.get("roleLabel", "商品买卖")).strip_edges()
	merchant_duty_label.text = str(identity.get("dutyLabel", "旅途物资供应")).strip_edges()
	_merchant_portrait.texture = portrait_texture
	_merchant_portrait.visible = portrait_texture != null


func clear_service_identity() -> void:
	_ensure_built()
	merchant_name_label.text = "商店服务"
	merchant_role_label.text = "商品买卖"
	merchant_duty_label.text = "旅途物资供应"
	_merchant_portrait.texture = null
	_merchant_portrait.visible = false


func service_identity_snapshot() -> Dictionary:
	_ensure_built()
	return {
		"displayName": merchant_name_label.text,
		"roleLabel": merchant_role_label.text,
		"dutyLabel": merchant_duty_label.text,
		"portraitVisible": _merchant_portrait.visible and _merchant_portrait.texture != null,
	}


func apply_selection(item_id: String, mode: String) -> void:
	_ensure_built()
	_selected_icon.texture = CommerceAwakenedVisualSkin.item_texture_for(item_id)
	_selected_icon.visible = _selected_icon.texture != null
	_selection_hint.text = (
		"从左侧选择要出售的物品"
		if mode == "sell"
		else "从左侧选择要购买的物品"
	) if item_id == "" else "双击列表可快速%s" % ("出售" if mode == "sell" else "购买")
	_decorate_tabs(mode)


func decorate_item_buttons(buttons: Dictionary, selected_item_id: String) -> void:
	for key_value in buttons.keys():
		var item_id := str(key_value)
		var button_value = buttons.get(key_value)
		if not (button_value is Button):
			continue
		CommerceAwakenedVisualSkin.apply_item_button(
			button_value as Button,
			item_id,
			item_id == selected_item_id
		)
	if action_button != null:
		CommerceAwakenedVisualSkin.apply_action_button(action_button)
	if repair_button != null:
		CommerceAwakenedVisualSkin.apply_action_button(repair_button)
	if equip_after_buy_button != null:
		CommerceAwakenedVisualSkin.apply_action_button(equip_after_buy_button)


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "ShopAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override("panel", CommerceAwakenedVisualSkin.transparent_panel_style())

	_canvas = Control.new()
	_canvas.name = "ShopAwakenedCanvas"
	_canvas.anchor_left = 0.5
	_canvas.anchor_top = 0.5
	_canvas.anchor_right = 0.5
	_canvas.anchor_bottom = 0.5
	_canvas.offset_left = -640.0
	_canvas.offset_top = -360.0
	_canvas.offset_right = 640.0
	_canvas.offset_bottom = 360.0
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.clip_contents = true
	add_child(_canvas)
	CommerceAwakenedVisualSkin.add_backdrop(_canvas)
	_build_header()
	_build_catalog()
	_build_detail()


func _build_header() -> void:
	var icon := TextureRect.new()
	icon.position = Vector2(68.0, 12.0)
	icon.size = Vector2(42.0, 42.0)
	icon.texture = HEADER_ICON_TEXTURE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(icon)

	title_label = Label.new()
	title_label.text = "道具店"
	title_label.position = Vector2(112.0, 10.0)
	title_label.size = Vector2(370.0, 48.0)
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(title_label, 29)
	_canvas.add_child(title_label)

	close_button = Button.new()
	close_button.name = "ShopCloseButton"
	close_button.position = Vector2(1194.0, 9.0)
	close_button.size = Vector2(58.0, 52.0)
	CommerceAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void: close_requested.emit())
	_canvas.add_child(close_button)


func _build_catalog() -> void:
	var identity_shell := PanelContainer.new()
	identity_shell.position = Vector2(90.0, 98.0)
	identity_shell.size = Vector2(256.0, 132.0)
	identity_shell.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.soft_panel_style(0.76, 9)
	)
	identity_shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(identity_shell)

	_merchant_portrait = TextureRect.new()
	_merchant_portrait.name = "ShopMerchantPortrait"
	_merchant_portrait.position = Vector2(97.0, 103.0)
	_merchant_portrait.size = Vector2(94.0, 122.0)
	_merchant_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_merchant_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_merchant_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_merchant_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_merchant_portrait)

	merchant_name_label = Label.new()
	merchant_name_label.name = "ShopMerchantNameLabel"
	merchant_name_label.text = "商店服务"
	merchant_name_label.position = Vector2(196.0, 119.0)
	merchant_name_label.size = Vector2(140.0, 36.0)
	merchant_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	merchant_name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_title(merchant_name_label, 17)
	_canvas.add_child(merchant_name_label)

	merchant_role_label = Label.new()
	merchant_role_label.name = "ShopMerchantRoleLabel"
	merchant_role_label.text = "商品买卖"
	merchant_role_label.position = Vector2(196.0, 155.0)
	merchant_role_label.size = Vector2(140.0, 24.0)
	merchant_role_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	merchant_role_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_body(merchant_role_label, 13, true)
	_canvas.add_child(merchant_role_label)

	merchant_duty_label = Label.new()
	merchant_duty_label.name = "ShopMerchantDutyLabel"
	merchant_duty_label.text = "旅途物资供应"
	merchant_duty_label.position = Vector2(196.0, 180.0)
	merchant_duty_label.size = Vector2(140.0, 42.0)
	merchant_duty_label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	merchant_duty_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_body(merchant_duty_label, 12, true)
	_canvas.add_child(merchant_duty_label)

	buy_button = Button.new()
	buy_button.name = "ShopBuyButton"
	buy_button.text = "购买"
	buy_button.position = Vector2(91.0, 239.0)
	buy_button.size = Vector2(124.0, 48.0)
	buy_button.toggle_mode = true
	CommerceAwakenedVisualSkin.apply_tab_button(buy_button, true)
	buy_button.pressed.connect(func() -> void: mode_requested.emit("buy"))
	_canvas.add_child(buy_button)

	sell_button = Button.new()
	sell_button.name = "ShopSellButton"
	sell_button.text = "出售"
	sell_button.position = Vector2(220.0, 239.0)
	sell_button.size = Vector2(124.0, 48.0)
	sell_button.toggle_mode = true
	CommerceAwakenedVisualSkin.apply_tab_button(sell_button, false)
	sell_button.pressed.connect(func() -> void: mode_requested.emit("sell"))
	_canvas.add_child(sell_button)

	var scroll := ScrollContainer.new()
	scroll.name = "ShopCatalogScroll"
	scroll.position = Vector2(90.0, 294.0)
	scroll.size = Vector2(256.0, 355.0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_canvas.add_child(scroll)
	list_container = VBoxContainer.new()
	list_container.name = "ShopCatalogList"
	list_container.custom_minimum_size = Vector2(239.0, 0.0)
	list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_container.add_theme_constant_override("separation", 7)
	scroll.add_child(list_container)


func _build_detail() -> void:
	var detail_header := PanelContainer.new()
	detail_header.position = Vector2(404.0, 103.0)
	detail_header.size = Vector2(750.0, 56.0)
	detail_header.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.soft_panel_style(0.62, 8)
	)
	_canvas.add_child(detail_header)
	var header_row := HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 12)
	detail_header.add_child(header_row)
	var detail_title := Label.new()
	detail_title.text = "商品详情"
	detail_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	CommerceAwakenedVisualSkin.apply_title(detail_title, 21)
	header_row.add_child(detail_title)
	currency_label = Label.new()
	currency_label.text = "石币 0"
	currency_label.custom_minimum_size = Vector2(230.0, 36.0)
	currency_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	currency_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	currency_label.add_theme_stylebox_override(
		"normal",
		CommerceAwakenedVisualSkin.currency_chip_style()
	)
	CommerceAwakenedVisualSkin.apply_body(currency_label, 17)
	header_row.add_child(currency_label)

	var icon_panel := PanelContainer.new()
	icon_panel.position = Vector2(430.0, 181.0)
	icon_panel.size = Vector2(170.0, 170.0)
	icon_panel.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.slot_style(true, false)
	)
	_canvas.add_child(icon_panel)
	_selected_icon = TextureRect.new()
	_selected_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_selected_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_selected_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_selected_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon_panel.add_child(_selected_icon)

	var detail_shell := PanelContainer.new()
	detail_shell.position = Vector2(620.0, 181.0)
	detail_shell.size = Vector2(510.0, 256.0)
	detail_shell.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.dark_panel_style(0.84, 9)
	)
	_canvas.add_child(detail_shell)
	detail_label = RichTextLabel.new()
	detail_label.name = "ShopDetailLabel"
	detail_label.bbcode_enabled = true
	detail_label.fit_content = false
	detail_label.scroll_active = true
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_rich_text(detail_label, 16)
	detail_shell.add_child(detail_label)

	_selection_hint = Label.new()
	_selection_hint.position = Vector2(430.0, 359.0)
	_selection_hint.size = Vector2(170.0, 58.0)
	_selection_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_selection_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_selection_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_body(_selection_hint, 13, true)
	_canvas.add_child(_selection_hint)

	var quantity_label := Label.new()
	quantity_label.text = "数量"
	quantity_label.position = Vector2(620.0, 455.0)
	quantity_label.size = Vector2(70.0, 44.0)
	quantity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_body(quantity_label, 16)
	_canvas.add_child(quantity_label)

	quantity_minus_button = _action_button("−", Vector2(690.0, 455.0), Vector2(54.0, 44.0))
	quantity_minus_button.pressed.connect(func() -> void:
		quantity_requested.emit(int(quantity_spinbox.value) - 1)
	)
	quantity_spinbox = SpinBox.new()
	quantity_spinbox.position = Vector2(751.0, 455.0)
	quantity_spinbox.size = Vector2(174.0, 44.0)
	quantity_spinbox.min_value = 1
	quantity_spinbox.max_value = 999
	quantity_spinbox.step = 1
	quantity_spinbox.value = 1
	quantity_spinbox.rounded = true
	CommerceAwakenedVisualSkin.apply_spinbox(quantity_spinbox)
	quantity_spinbox.value_changed.connect(func(value: float) -> void:
		quantity_requested.emit(int(value))
	)
	_canvas.add_child(quantity_spinbox)
	quantity_plus_button = _action_button("+", Vector2(932.0, 455.0), Vector2(54.0, 44.0))
	quantity_plus_button.pressed.connect(func() -> void:
		quantity_requested.emit(int(quantity_spinbox.value) + 1)
	)
	quantity_max_button = _action_button("最大", Vector2(993.0, 455.0), Vector2(137.0, 44.0))
	quantity_max_button.pressed.connect(func() -> void: maximum_requested.emit())

	equip_after_buy_button = _action_button(
		"购买后装备",
		Vector2(620.0, 517.0),
		Vector2(246.0, 44.0)
	)
	equip_after_buy_button.toggle_mode = true
	equip_after_buy_button.pressed.connect(func() -> void:
		equip_after_buy_requested.emit(equip_after_buy_button.button_pressed)
	)
	repair_button = _action_button("修理", Vector2(878.0, 517.0), Vector2(252.0, 44.0))
	repair_button.pressed.connect(func() -> void: repair_requested.emit())

	action_button = ItemSlotButton.new()
	action_button.name = "ShopActionButton"
	action_button.position = Vector2(786.0, 591.0)
	action_button.size = Vector2(344.0, 54.0)
	action_button.text = "购买"
	action_button.pressed.connect(func() -> void: action_requested.emit())
	CommerceAwakenedVisualSkin.apply_action_button(action_button)
	_canvas.add_child(action_button)


func _action_button(text_value: String, position_value: Vector2, size_value: Vector2) -> Button:
	var button := Button.new()
	button.text = text_value
	button.position = position_value
	button.size = size_value
	CommerceAwakenedVisualSkin.apply_action_button(button)
	_canvas.add_child(button)
	return button


func _decorate_tabs(mode: String) -> void:
	buy_button.set_pressed_no_signal(mode != "sell")
	sell_button.set_pressed_no_signal(mode == "sell")
	CommerceAwakenedVisualSkin.apply_tab_button(buy_button, mode != "sell")
	CommerceAwakenedVisualSkin.apply_tab_button(sell_button, mode == "sell")
