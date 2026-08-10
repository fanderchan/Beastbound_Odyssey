extends PanelContainer
class_name BankAwakenedPanel

const CommerceAwakenedVisualSkin := preload(
	"res://scripts/ui/commerce_awakened_visual_skin.gd"
)
const HEADER_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/backpack.png"
)
const ItemSlotButton := preload("res://scripts/ui/item_slot_button.gd")

signal close_requested
signal item_quantity_requested(quantity: int)
signal coin_quantity_requested(quantity: int)
signal deposit_requested
signal withdraw_requested
signal coin_deposit_requested
signal coin_withdraw_requested
signal unlock_requested

const CANVAS_SIZE := Vector2(1280.0, 720.0)

var list_container: VBoxContainer
var detail_label: RichTextLabel
var quantity_spinbox: SpinBox
var coin_quantity_spinbox: SpinBox
var deposit_button: ItemSlotButton
var withdraw_button: ItemSlotButton
var coin_deposit_button: Button
var coin_withdraw_button: Button
var unlock_tab_button: Button
var status_label: Label
var close_button: Button
var http_request: HTTPRequest
var banker_name_label: Label
var banker_role_label: Label
var banker_duty_label: Label

var _built := false
var _canvas: Control
var _selected_icon: TextureRect
var _banker_portrait: TextureRect


func _ready() -> void:
	_ensure_built()


func prepare() -> void:
	_ensure_built()


func is_awakened_bank_panel() -> bool:
	return true


func apply_service_identity(identity: Dictionary, portrait_texture: Texture2D) -> void:
	_ensure_built()
	banker_name_label.text = str(identity.get("displayName", "银行服务")).strip_edges()
	banker_role_label.text = str(identity.get("roleLabel", "资产保管")).strip_edges()
	banker_duty_label.text = str(identity.get("dutyLabel", "石币与物品保管")).strip_edges()
	_banker_portrait.texture = portrait_texture
	_banker_portrait.visible = portrait_texture != null


func clear_service_identity() -> void:
	_ensure_built()
	banker_name_label.text = "银行服务"
	banker_role_label.text = "资产保管"
	banker_duty_label.text = "石币与物品保管"
	_banker_portrait.texture = null
	_banker_portrait.visible = false


func service_identity_snapshot() -> Dictionary:
	_ensure_built()
	return {
		"displayName": banker_name_label.text,
		"roleLabel": banker_role_label.text,
		"dutyLabel": banker_duty_label.text,
		"portraitVisible": _banker_portrait.visible and _banker_portrait.texture != null,
	}


func apply_selection(item_id: String) -> void:
	_ensure_built()
	_selected_icon.texture = CommerceAwakenedVisualSkin.item_texture_for(item_id)
	_selected_icon.visible = _selected_icon.texture != null


func decorate_dynamic_content(item_buttons: Dictionary, tab_buttons: Array) -> void:
	for key_value in item_buttons.keys():
		var button_value = item_buttons.get(key_value)
		if not (button_value is Button):
			continue
		var button := button_value as Button
		var item_id := ""
		var selected := false
		if button is ItemSlotButton:
			item_id = str((button as ItemSlotButton).slot_data.get("itemId", ""))
			selected = button.button_pressed
		CommerceAwakenedVisualSkin.apply_item_button(button, item_id, selected)
		button.custom_minimum_size = Vector2(92.0, 76.0)
		button.add_theme_constant_override("icon_max_width", 34)
		button.add_theme_font_size_override("font_size", 12)
	for button_value in tab_buttons:
		if button_value is Button:
			var button := button_value as Button
			CommerceAwakenedVisualSkin.apply_tab_button(button, button.button_pressed)
			button.custom_minimum_size = Vector2(54.0, 42.0)
	_decorate_sections(list_container)
	CommerceAwakenedVisualSkin.apply_action_button(deposit_button)
	CommerceAwakenedVisualSkin.apply_action_button(withdraw_button)
	CommerceAwakenedVisualSkin.apply_action_button(coin_deposit_button)
	CommerceAwakenedVisualSkin.apply_action_button(coin_withdraw_button)
	CommerceAwakenedVisualSkin.apply_action_button(unlock_tab_button)


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "BankAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override("panel", CommerceAwakenedVisualSkin.transparent_panel_style())

	_canvas = Control.new()
	_canvas.name = "BankAwakenedCanvas"
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
	_build_account_column()
	_build_storage_area()


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
	var title := Label.new()
	title.text = "银行"
	title.position = Vector2(112.0, 10.0)
	title.size = Vector2(300.0, 48.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(title, 29)
	_canvas.add_child(title)
	close_button = Button.new()
	close_button.name = "BankCloseButton"
	close_button.position = Vector2(1194.0, 9.0)
	close_button.size = Vector2(58.0, 52.0)
	CommerceAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void: close_requested.emit())
	_canvas.add_child(close_button)


func _build_account_column() -> void:
	var selected_panel := PanelContainer.new()
	selected_panel.position = Vector2(92.0, 108.0)
	selected_panel.size = Vector2(250.0, 116.0)
	selected_panel.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.slot_style(true, false)
	)
	_canvas.add_child(selected_panel)
	_selected_icon = TextureRect.new()
	_selected_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_selected_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_selected_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_selected_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	selected_panel.add_child(_selected_icon)

	var detail_shell := PanelContainer.new()
	detail_shell.position = Vector2(92.0, 235.0)
	detail_shell.size = Vector2(250.0, 178.0)
	detail_shell.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.soft_panel_style(0.74, 8)
	)
	_canvas.add_child(detail_shell)
	detail_label = RichTextLabel.new()
	detail_label.name = "BankDetailLabel"
	detail_label.bbcode_enabled = false
	detail_label.fit_content = false
	detail_label.scroll_active = true
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_rich_text(detail_label, 13)
	detail_shell.add_child(detail_label)

	var item_label := _label("物品数量", Vector2(92.0, 422.0), Vector2(250.0, 24.0), 13, true)
	_canvas.add_child(item_label)
	quantity_spinbox = _spinbox(Vector2(92.0, 449.0), Vector2(250.0, 40.0), 1, 999, 1)
	quantity_spinbox.value_changed.connect(func(value: float) -> void:
		item_quantity_requested.emit(int(value))
	)
	deposit_button = _slot_action_button("存入物品", Vector2(92.0, 498.0), Vector2(121.0, 43.0))
	deposit_button.pressed.connect(func() -> void: deposit_requested.emit())
	withdraw_button = _slot_action_button("取出物品", Vector2(221.0, 498.0), Vector2(121.0, 43.0))
	withdraw_button.pressed.connect(func() -> void: withdraw_requested.emit())

	var coin_label := _label("石币数量", Vector2(92.0, 550.0), Vector2(250.0, 24.0), 13, true)
	_canvas.add_child(coin_label)
	coin_quantity_spinbox = _spinbox(Vector2(92.0, 577.0), Vector2(250.0, 40.0), 1, 100000000, 1000)
	coin_quantity_spinbox.value_changed.connect(func(value: float) -> void:
		coin_quantity_requested.emit(int(value))
	)
	coin_deposit_button = _button("存石币", Vector2(92.0, 626.0), Vector2(121.0, 42.0))
	coin_deposit_button.pressed.connect(func() -> void: coin_deposit_requested.emit())
	coin_withdraw_button = _button("取石币", Vector2(221.0, 626.0), Vector2(121.0, 42.0))
	coin_withdraw_button.pressed.connect(func() -> void: coin_withdraw_requested.emit())


func _build_storage_area() -> void:
	var identity_shell := PanelContainer.new()
	identity_shell.position = Vector2(401.0, 90.0)
	identity_shell.size = Vector2(514.0, 78.0)
	identity_shell.add_theme_stylebox_override(
		"panel",
		CommerceAwakenedVisualSkin.soft_panel_style(0.72, 8)
	)
	identity_shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(identity_shell)

	_banker_portrait = TextureRect.new()
	_banker_portrait.name = "BankerPortrait"
	_banker_portrait.position = Vector2(406.0, 95.0)
	_banker_portrait.size = Vector2(68.0, 68.0)
	_banker_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_banker_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_banker_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_banker_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_banker_portrait)

	banker_name_label = Label.new()
	banker_name_label.name = "BankerNameLabel"
	banker_name_label.text = "银行服务"
	banker_name_label.position = Vector2(482.0, 94.0)
	banker_name_label.size = Vector2(200.0, 24.0)
	banker_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(banker_name_label, 16)
	_canvas.add_child(banker_name_label)

	banker_role_label = Label.new()
	banker_role_label.name = "BankerRoleLabel"
	banker_role_label.text = "资产保管"
	banker_role_label.position = Vector2(482.0, 118.0)
	banker_role_label.size = Vector2(200.0, 22.0)
	banker_role_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_body(banker_role_label, 12, true)
	_canvas.add_child(banker_role_label)

	banker_duty_label = Label.new()
	banker_duty_label.name = "BankerDutyLabel"
	banker_duty_label.text = "石币与物品保管"
	banker_duty_label.position = Vector2(482.0, 140.0)
	banker_duty_label.size = Vector2(200.0, 22.0)
	banker_duty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_body(banker_duty_label, 11, true)
	_canvas.add_child(banker_duty_label)

	var section_title := Label.new()
	section_title.text = "随身背包 / 银行仓库"
	section_title.position = Vector2(688.0, 108.0)
	section_title.size = Vector2(227.0, 42.0)
	section_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(section_title, 21)
	_canvas.add_child(section_title)

	unlock_tab_button = _button("已解锁当前页", Vector2(925.0, 108.0), Vector2(228.0, 42.0))
	unlock_tab_button.pressed.connect(func() -> void: unlock_requested.emit())

	var scroll := ScrollContainer.new()
	scroll.name = "BankStorageScroll"
	scroll.position = Vector2(401.0, 174.0)
	scroll.size = Vector2(762.0, 436.0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_canvas.add_child(scroll)
	list_container = VBoxContainer.new()
	list_container.name = "BankStorageContent"
	list_container.custom_minimum_size = Vector2(744.0, 440.0)
	list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_container.add_theme_constant_override("separation", 8)
	scroll.add_child(list_container)

	status_label = _label("", Vector2(401.0, 621.0), Vector2(762.0, 48.0), 14, false)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.add_theme_stylebox_override(
		"normal",
		CommerceAwakenedVisualSkin.soft_panel_style(0.66, 8)
	)
	_canvas.add_child(status_label)

	http_request = HTTPRequest.new()
	http_request.timeout = 8.0
	add_child(http_request)


func _spinbox(
	position_value: Vector2,
	size_value: Vector2,
	min_value: int,
	max_value: int,
	initial_value: int
) -> SpinBox:
	var spinbox := SpinBox.new()
	spinbox.position = position_value
	spinbox.size = size_value
	spinbox.min_value = min_value
	spinbox.max_value = max_value
	spinbox.step = 1
	spinbox.value = initial_value
	spinbox.rounded = true
	CommerceAwakenedVisualSkin.apply_spinbox(spinbox)
	_canvas.add_child(spinbox)
	return spinbox


func _slot_action_button(text_value: String, position_value: Vector2, size_value: Vector2) -> ItemSlotButton:
	var button := ItemSlotButton.new()
	button.text = text_value
	button.position = position_value
	button.size = size_value
	CommerceAwakenedVisualSkin.apply_action_button(button)
	_canvas.add_child(button)
	return button


func _button(text_value: String, position_value: Vector2, size_value: Vector2) -> Button:
	var button := Button.new()
	button.text = text_value
	button.position = position_value
	button.size = size_value
	CommerceAwakenedVisualSkin.apply_action_button(button)
	_canvas.add_child(button)
	return button


func _label(
	text_value: String,
	position_value: Vector2,
	size_value: Vector2,
	font_size: int,
	muted: bool
) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.size = size_value
	CommerceAwakenedVisualSkin.apply_body(label, font_size, muted)
	return label


func _decorate_sections(node: Node) -> void:
	if node == null:
		return
	for child in node.get_children():
		if child is PanelContainer:
			(child as PanelContainer).add_theme_stylebox_override(
				"panel",
				CommerceAwakenedVisualSkin.soft_panel_style(0.68, 8)
			)
		elif child is Label:
			CommerceAwakenedVisualSkin.apply_body(child as Label, 13)
		_decorate_sections(child)
