extends Control
class_name BackpackAwakenedPanel

const BackpackAwakenedVisualSkin := preload(
	"res://scripts/ui/backpack_awakened_visual_skin.gd"
)
const BackpackAwakenedItemCard := preload(
	"res://scripts/ui/backpack_awakened_item_card.gd"
)
const PLAYER_TEXTURE := preload(
	"res://assets/ui/backpack_awakened_v1/runtime/character/novice_hunter_inventory.png"
)

signal close_requested
signal filter_requested(filter_id: String)
signal entry_selected(selection_key: String)
signal equipment_slot_selected(slot_id: String)
signal equip_requested(item_id: String, instance_id: String)
signal use_requested(slot_index: int)
signal discard_requested(slot_index: int, item_id: String, instance_id: String)
signal unequip_requested(slot_id: String)
signal unlock_requested(slot_index: int)
signal split_requested(slot_index: int, item_id: String, count: int)
signal use_target_requested(
	item_id: String,
	target_type: String,
	target_id: String
)
signal use_target_cancel_requested
signal slot_dropped(source_data: Dictionary, target_data: Dictionary)
signal slot_context_requested(slot_data: Dictionary, screen_position: Vector2)
signal slot_drag_started(source_data: Dictionary)
signal slot_drag_ended(
	source_data: Dictionary,
	successful: bool,
	screen_position: Vector2
)
signal synthesis_requested
signal repair_requested

const FILTERS := [
	{"id": "all", "label": "全部"},
	{"id": "world", "label": "世界"},
	{"id": "battle", "label": "战斗"},
	{"id": "capture", "label": "捕捉"},
	{"id": "equipment", "label": "装备"},
]
const EQUIPMENT_SLOT_RECTS := [
	Rect2(34, 142, 88, 90),
	Rect2(34, 244, 88, 90),
	Rect2(34, 346, 88, 90),
	Rect2(34, 448, 88, 90),
	Rect2(620, 142, 88, 90),
	Rect2(620, 244, 88, 90),
	Rect2(620, 346, 88, 90),
	Rect2(620, 448, 88, 90),
	Rect2(620, 550, 88, 90),
]
const EQUIPMENT_SLOT_FALLBACKS := [
	{"id": "accessory_left", "label": "左饰品"},
	{"id": "accessory_right", "label": "右饰品"},
	{"id": "head", "label": "头盔"},
	{"id": "left_hand_weapon", "label": "左手武器"},
	{"id": "body", "label": "衣服"},
	{"id": "right_hand_weapon", "label": "右手武器"},
	{"id": "hands", "label": "手套"},
	{"id": "feet", "label": "鞋子"},
	{"id": "exp_pill", "label": "经验丹"},
]

var _built: bool = false
var _canvas: Control
var _currency_stone_label: Label
var _currency_diamond_label: Label
var _player_name_label: Label
var _power_label: Label
var _capacity_label: Label
var _synthesis_button: Button
var _repair_button: Button
var _inventory_grid: GridContainer
var _inventory_scroll: ScrollContainer
var _equipment_layer: Control
var _filter_buttons: Dictionary = {}
var _overlay_layer: Control
var _overlay_content: PanelContainer
var _active_filter: String = "all"
var _selected_key: String = ""
var _selected_inventory_entry: Dictionary = {}
var _overlay_mode: String = ""
var _target_buttons_by_pet: Dictionary = {}
var _view_state: Dictionary = {}


func _ready() -> void:
	_ensure_built()


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	_active_filter = str(state.get("activeCategory", state.get("activeFilter", "all")))
	if not _known_filter(_active_filter):
		_active_filter = "all"
	_refresh_header(state)
	_refresh_filter_buttons()
	_refresh_footer_actions(state)
	_refresh_equipment_slots(_dictionary_array(state.get("equipmentSlots", [])))
	_refresh_inventory(_dictionary_array(state.get("backpackRows", [])))
	var pending_use_value = state.get("pendingUse", {})
	var pending_use := (
		pending_use_value as Dictionary
		if pending_use_value is Dictionary
		else {}
	)
	var compare_value = state.get("comparison", state.get("compare", {}))
	var comparison := compare_value as Dictionary if compare_value is Dictionary else {}
	if bool(pending_use.get("visible", false)):
		_show_use_target_selection(pending_use)
	elif bool(comparison.get("visible", false)):
		_show_comparison(comparison)
	elif bool(state.get("closeOverlay", false)):
		_hide_overlay(false)


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "BackpackAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = Vector2(1280.0, 720.0)
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL

	_canvas = Control.new()
	_canvas.name = "BackpackCanvas"
	_canvas.anchor_left = 0.5
	_canvas.anchor_top = 0.5
	_canvas.anchor_right = 0.5
	_canvas.anchor_bottom = 0.5
	_canvas.offset_left = -640.0
	_canvas.offset_top = -360.0
	_canvas.offset_right = 640.0
	_canvas.offset_bottom = 360.0
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_canvas)
	BackpackAwakenedVisualSkin.add_backdrop(_canvas)
	_build_header()
	_build_character_and_equipment()
	_build_inventory()
	_build_overlay()


func _build_header() -> void:
	var title := Label.new()
	title.text = "背包"
	title.position = Vector2(72.0, 15.0)
	title.size = Vector2(190.0, 46.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_title(title, 30)
	_canvas.add_child(title)

	var currencies := HBoxContainer.new()
	currencies.position = Vector2(666.0, 13.0)
	currencies.size = Vector2(430.0, 46.0)
	currencies.add_theme_constant_override("separation", 12)
	_canvas.add_child(currencies)
	_currency_stone_label = _make_currency_chip("stoneCoins", "石币", "0")
	currencies.add_child(_currency_stone_label.get_parent().get_parent())
	_currency_diamond_label = _make_currency_chip("diamonds", "钻石", "0")
	currencies.add_child(_currency_diamond_label.get_parent().get_parent())

	var close_button := Button.new()
	close_button.name = "CloseButton"
	close_button.position = Vector2(1194.0, 10.0)
	close_button.size = Vector2(58.0, 52.0)
	BackpackAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(_on_close_pressed)
	_canvas.add_child(close_button)


func _make_currency_chip(currency_id: String, currency_name: String, amount: String) -> Label:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(194.0, 42.0)
	panel.add_theme_stylebox_override("panel", BackpackAwakenedVisualSkin.currency_chip_style())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 9)
	panel.add_child(row)
	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(28.0, 28.0)
	icon.texture = BackpackAwakenedVisualSkin.currency_texture_for(currency_id)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	var label := Label.new()
	label.text = "%s  %s" % [currency_name, amount]
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_body(label, 16)
	row.add_child(label)
	return label


func _build_character_and_equipment() -> void:
	var section_title := Label.new()
	section_title.text = "装备栏"
	section_title.position = Vector2(34.0, 86.0)
	section_title.size = Vector2(190.0, 38.0)
	BackpackAwakenedVisualSkin.apply_title(section_title, 22)
	_canvas.add_child(section_title)

	_player_name_label = Label.new()
	_player_name_label.text = "冒险者"
	_player_name_label.position = Vector2(246.0, 89.0)
	_player_name_label.size = Vector2(250.0, 38.0)
	_player_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_title(_player_name_label, 20)
	_canvas.add_child(_player_name_label)

	var character_shadow := Panel.new()
	character_shadow.position = Vector2(230.0, 537.0)
	character_shadow.size = Vector2(278.0, 32.0)
	character_shadow.add_theme_stylebox_override("panel", _character_shadow_style())
	character_shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(character_shadow)

	var character := TextureRect.new()
	character.name = "PlayerArtwork"
	character.position = Vector2(181.0, 116.0)
	character.size = Vector2(380.0, 444.0)
	character.texture = PLAYER_TEXTURE
	character.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	character.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	character.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	character.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(character)

	_equipment_layer = Control.new()
	_equipment_layer.name = "EquipmentSlots"
	_equipment_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_equipment_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_canvas.add_child(_equipment_layer)

	_power_label = Label.new()
	_power_label.text = "Lv1 · 0转"
	_power_label.position = Vector2(242.0, 649.0)
	_power_label.size = Vector2(258.0, 43.0)
	_power_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_power_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_power(_power_label)
	_canvas.add_child(_power_label)


func _build_inventory() -> void:
	var inventory_title := Label.new()
	inventory_title.text = "随身物品"
	inventory_title.position = Vector2(765.0, 81.0)
	inventory_title.size = Vector2(160.0, 35.0)
	BackpackAwakenedVisualSkin.apply_title(inventory_title, 20)
	_canvas.add_child(inventory_title)

	var tabs := HBoxContainer.new()
	tabs.name = "InventoryFilters"
	tabs.position = Vector2(844.0, 78.0)
	tabs.size = Vector2(386.0, 44.0)
	tabs.add_theme_constant_override("separation", 2)
	_canvas.add_child(tabs)
	for option in FILTERS:
		var filter_id := str(option.get("id", "all"))
		var button := Button.new()
		button.text = str(option.get("label", "全部"))
		button.custom_minimum_size = Vector2(74.0, 42.0)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		BackpackAwakenedVisualSkin.apply_tab_button(button, filter_id == _active_filter)
		button.pressed.connect(_on_filter_pressed.bind(filter_id))
		tabs.add_child(button)
		_filter_buttons[filter_id] = button

	_inventory_scroll = ScrollContainer.new()
	_inventory_scroll.name = "InventoryScroll"
	_inventory_scroll.position = Vector2(771.0, 143.0)
	_inventory_scroll.size = Vector2(443.0, 472.0)
	_inventory_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_inventory_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_inventory_scroll.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.add_child(_inventory_scroll)

	_inventory_grid = GridContainer.new()
	_inventory_grid.name = "InventoryGrid"
	_inventory_grid.columns = 5
	_inventory_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_inventory_grid.add_theme_constant_override("h_separation", 4)
	_inventory_grid.add_theme_constant_override("v_separation", 7)
	_inventory_scroll.add_child(_inventory_grid)

	var footer := HBoxContainer.new()
	footer.position = Vector2(775.0, 625.0)
	footer.size = Vector2(431.0, 44.0)
	footer.add_theme_constant_override("separation", 10)
	_canvas.add_child(footer)
	_capacity_label = Label.new()
	_capacity_label.text = "0/20"
	_capacity_label.custom_minimum_size = Vector2(115.0, 42.0)
	_capacity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_body(_capacity_label, 14, true)
	footer.add_child(_capacity_label)
	_synthesis_button = Button.new()
	_synthesis_button.text = "装备合成"
	_synthesis_button.custom_minimum_size = Vector2(140.0, 42.0)
	_synthesis_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(_synthesis_button)
	_synthesis_button.pressed.connect(_on_synthesis_pressed)
	footer.add_child(_synthesis_button)
	_repair_button = Button.new()
	_repair_button.text = "修理全部"
	_repair_button.custom_minimum_size = Vector2(140.0, 42.0)
	_repair_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(_repair_button)
	_repair_button.pressed.connect(_on_repair_pressed)
	footer.add_child(_repair_button)


func _build_overlay() -> void:
	_overlay_layer = Control.new()
	_overlay_layer.name = "ItemDetailOverlay"
	_overlay_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	_overlay_layer.z_as_relative = false
	_overlay_layer.z_index = 200
	_overlay_layer.visible = false
	_canvas.add_child(_overlay_layer)

	var shade := ColorRect.new()
	shade.name = "ModalShade"
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.015, 0.010, 0.008, 0.70)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	shade.gui_input.connect(_on_overlay_shade_input)
	_overlay_layer.add_child(shade)

	_overlay_content = PanelContainer.new()
	_overlay_content.name = "DetailWindow"
	_overlay_content.position = Vector2(201.0, 101.0)
	_overlay_content.size = Vector2(878.0, 526.0)
	_overlay_content.mouse_filter = Control.MOUSE_FILTER_STOP
	_overlay_content.add_theme_stylebox_override(
		"panel",
		BackpackAwakenedVisualSkin.dark_panel_style()
	)
	_overlay_layer.add_child(_overlay_content)


func _refresh_header(state: Dictionary) -> void:
	var currencies_value = state.get("currencies", {})
	var currencies := currencies_value as Dictionary if currencies_value is Dictionary else {}
	var stone := _first_int(
		currencies,
		["stoneCoins", "stone", "coins"],
		int(state.get("stoneCoins", state.get("coins", 0)))
	)
	var diamonds := _first_int(
		currencies,
		["diamonds", "diamond", "gems", "premium"],
		int(state.get("diamonds", state.get("gems", 0)))
	)
	_currency_stone_label.text = "石币  %s" % _compact_number(stone)
	_currency_diamond_label.text = "钻石  %s" % _compact_number(diamonds)
	_player_name_label.text = str(state.get("playerName", "冒险者"))
	var player_level := maxi(1, int(state.get("playerLevel", 1)))
	var rebirth_count := maxi(0, int(state.get("rebirthCount", 0)))
	_power_label.text = "Lv%d · %d转" % [player_level, rebirth_count]


func _refresh_footer_actions(state: Dictionary) -> void:
	if _synthesis_button != null:
		_synthesis_button.visible = bool(state.get("synthesisAvailable", true))
	if _repair_button != null:
		_repair_button.visible = bool(state.get("repairAvailable", false))


func _refresh_filter_buttons() -> void:
	for filter_id_value in _filter_buttons.keys():
		var filter_id := str(filter_id_value)
		var button = _filter_buttons.get(filter_id)
		if button is Button:
			var typed_button := button as Button
			typed_button.button_pressed = filter_id == _active_filter
			BackpackAwakenedVisualSkin.apply_tab_button(
				typed_button,
				filter_id == _active_filter
			)


func _refresh_equipment_slots(rows: Array[Dictionary]) -> void:
	for child in _equipment_layer.get_children():
		_equipment_layer.remove_child(child)
		child.queue_free()
	var normalized := rows.duplicate(true)
	while normalized.size() < EQUIPMENT_SLOT_RECTS.size():
		normalized.append(_missing_equipment_slot(normalized.size()))
	for index in range(EQUIPMENT_SLOT_RECTS.size()):
		var row: Dictionary = (
			normalized[index]
			if index < normalized.size()
			else _missing_equipment_slot(index)
		)
		var card := BackpackAwakenedItemCard.new()
		card.name = "EquipmentSlot%d" % (index + 1)
		card.position = EQUIPMENT_SLOT_RECTS[index].position
		card.size = EQUIPMENT_SLOT_RECTS[index].size
		card.mouse_filter = Control.MOUSE_FILTER_STOP
		card.entry_activated.connect(_on_equipment_slot_pressed)
		_equipment_layer.add_child(card)
		card.configure(row, false, true)


func _refresh_inventory(rows: Array[Dictionary]) -> void:
	for child in _inventory_grid.get_children():
		_inventory_grid.remove_child(child)
		child.queue_free()
	var visible_count := 0
	for row in rows:
		if str(row.get("kind", "")) != "empty":
			visible_count += 1
		var card := BackpackAwakenedItemCard.new()
		card.custom_minimum_size = Vector2(84.0, 107.0)
		card.entry_activated.connect(_on_inventory_entry_pressed)
		card.slot_double_clicked.connect(_on_inventory_slot_double_clicked)
		card.slot_dropped.connect(_on_inventory_slot_dropped)
		card.slot_context_requested.connect(_on_inventory_slot_context_requested)
		card.slot_drag_started.connect(_on_inventory_slot_drag_started)
		card.slot_drag_ended.connect(_on_inventory_slot_drag_ended)
		_inventory_grid.add_child(card)
		card.configure(row, str(row.get("selectionKey", "")) == _selected_key, false)
	var target_count := maxi(
		int(_view_state.get("slotLimit", 20)),
		maxi(rows.size(), int(_view_state.get("capacityTotal", rows.size())))
	)
	for index in range(rows.size(), target_count):
		var empty_card := BackpackAwakenedItemCard.new()
		empty_card.custom_minimum_size = Vector2(84.0, 107.0)
		empty_card.slot_dropped.connect(_on_inventory_slot_dropped)
		_inventory_grid.add_child(empty_card)
		empty_card.configure(
			{
				"kind": "empty",
				"itemLabel": "空格",
				"canSelect": false,
				"context": "backpack",
				"dragEnabled": false,
				"dropEnabled": false,
				"accepts": ["backpack", "shop_buy", "bank_storage"],
				"slotIndex": index,
			},
			false,
			false
		)
	_capacity_label.text = "%d/%d" % [
		maxi(0, int(_view_state.get("capacityUsed", visible_count))),
		maxi(1, int(_view_state.get("capacityTotal", target_count))),
	]


func _on_inventory_entry_pressed(row: Dictionary) -> void:
	if not bool(row.get("canSelect", true)):
		return
	if bool(row.get("locked", false)) or str(row.get("kind", "")) == "locked":
		unlock_requested.emit(int(row.get("slotIndex", -1)))
		return
	if str(row.get("kind", "")) == "empty":
		return
	_selected_inventory_entry = row.duplicate(true)
	_selected_key = str(row.get("selectionKey", ""))
	if _selected_key != "":
		entry_selected.emit(_selected_key)
	_refresh_inventory(_dictionary_array(_view_state.get("backpackRows", [])))
	if bool(row.get("isEquipment", false)) or str(row.get("kind", "")) == "equipment_instance":
		var comparison := _comparison_for_row(row)
		if not comparison.is_empty():
			_show_comparison(comparison)
			return
	_show_stack_detail(row)


func _on_inventory_slot_double_clicked(row: Dictionary) -> void:
	if bool(row.get("locked", false)) or str(row.get("kind", "")) == "locked":
		unlock_requested.emit(int(row.get("slotIndex", -1)))
		return
	var item_id := str(row.get("itemId", ""))
	if item_id == "":
		return
	if bool(row.get("isEquipment", false)):
		equip_requested.emit(item_id, str(row.get("instanceId", "")))
		return
	if bool(row.get("canUse", false)):
		use_requested.emit(int(row.get("slotIndex", -1)))


func _on_inventory_slot_dropped(
	source_data: Dictionary,
	target_data: Dictionary
) -> void:
	slot_dropped.emit(source_data, target_data)


func _on_inventory_slot_context_requested(
	slot_data: Dictionary,
	screen_position: Vector2
) -> void:
	if bool(slot_data.get("isEquipment", false)):
		_on_inventory_entry_pressed(slot_data)
		return
	slot_context_requested.emit(slot_data, screen_position)


func _on_inventory_slot_drag_started(source_data: Dictionary) -> void:
	slot_drag_started.emit(source_data)


func _on_inventory_slot_drag_ended(
	source_data: Dictionary,
	successful: bool,
	screen_position: Vector2
) -> void:
	slot_drag_ended.emit(source_data, successful, screen_position)


func _on_equipment_slot_pressed(row: Dictionary) -> void:
	var slot_id := str(row.get("slotId", ""))
	if slot_id == "":
		return
	equipment_slot_selected.emit(slot_id)
	if not bool(row.get("occupied", false)):
		return
	_show_equipped_detail(row)


func _comparison_for_row(row: Dictionary) -> Dictionary:
	var comparison_value = _view_state.get("comparison", _view_state.get("compare", {}))
	if comparison_value is Dictionary:
		var provided := comparison_value as Dictionary
		var provided_key := str(provided.get("candidateSelectionKey", ""))
		if bool(provided.get("visible", false)) and (
			provided_key == ""
			or provided_key == str(row.get("selectionKey", ""))
		):
			return provided.duplicate(true)
	# Equipability belongs to the presenter, which evaluates requirements,
	# durability, and the exact instance. Never guess it in the view.
	return {}


func _show_comparison(comparison: Dictionary) -> void:
	_clear_overlay_content()
	_overlay_mode = "comparison"
	_overlay_content.position = Vector2(201.0, 101.0)
	_overlay_content.size = Vector2(878.0, 526.0)
	var outer := VBoxContainer.new()
	outer.add_theme_constant_override("separation", 8)
	_overlay_content.add_child(outer)
	var title := Label.new()
	title.text = "%s · 装备对比" % str(comparison.get("slotLabel", "装备"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.custom_minimum_size.y = 36.0
	BackpackAwakenedVisualSkin.apply_title(title, 23)
	outer.add_child(title)
	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	outer.add_child(body)
	var current_value = comparison.get("current", {})
	var candidate_value = comparison.get("candidate", {})
	var current := current_value as Dictionary if current_value is Dictionary else {}
	var candidate := candidate_value as Dictionary if candidate_value is Dictionary else {}
	body.add_child(_make_equipment_detail_panel("当前装备", current, comparison, false))
	body.add_child(_make_equipment_detail_panel("候选装备", candidate, comparison, true))
	body.add_child(_make_comparison_actions(comparison, candidate))
	_overlay_layer.visible = true


func _make_equipment_detail_panel(
	heading: String,
	detail: Dictionary,
	comparison: Dictionary,
	candidate_side: bool
) -> Control:
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(316.0, 454.0)
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override(
		"panel",
		BackpackAwakenedVisualSkin.detail_panel_style(
			Color(0.89, 0.62, 0.26, 1.0) if candidate_side else Color(0.42, 0.63, 0.78, 1.0)
		)
	)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 7)
	panel.add_child(column)
	var heading_label := Label.new()
	heading_label.text = heading
	heading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_title(heading_label, 18)
	column.add_child(heading_label)
	column.add_child(_make_item_identity_block(
		str(detail.get("itemId", "")),
		str(detail.get("itemLabel", "未装备")),
		"类型：%s" % str(detail.get("slotLabel", comparison.get("slotLabel", "装备"))),
		48.0,
		19
	))
	column.add_child(_divider())

	var stats := VBoxContainer.new()
	stats.add_theme_constant_override("separation", 4)
	column.add_child(stats)
	var comparison_rows := _dictionary_array(comparison.get("statRows", []))
	if comparison_rows.is_empty():
		comparison_rows = _detail_stat_rows(detail)
	for stat in comparison_rows:
		var stat_row := HBoxContainer.new()
		var stat_name := Label.new()
		stat_name.text = str(stat.get("label", "属性"))
		stat_name.custom_minimum_size.x = 100.0
		BackpackAwakenedVisualSkin.apply_body(stat_name, 14)
		stat_row.add_child(stat_name)
		var value_label := Label.new()
		var base_value := int(stat.get("candidate" if candidate_side else "current", stat.get("total", 0)))
		value_label.text = str(base_value)
		value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		BackpackAwakenedVisualSkin.apply_body(value_label, 15)
		stat_row.add_child(value_label)
		if candidate_side:
			var delta := int(stat.get("delta", 0))
			var delta_label := Label.new()
			delta_label.custom_minimum_size.x = 55.0
			delta_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			delta_label.text = "%+d" % delta if delta != 0 else "—"
			BackpackAwakenedVisualSkin.apply_body(delta_label, 14)
			delta_label.add_theme_color_override(
				"font_color",
				BackpackAwakenedVisualSkin.GAIN_TEXT if delta > 0 else (
					BackpackAwakenedVisualSkin.LOSS_TEXT if delta < 0 else BackpackAwakenedVisualSkin.MUTED_TEXT
				)
			)
			stat_row.add_child(delta_label)
		stats.add_child(stat_row)
	column.add_child(_divider())
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	var detail_text := RichTextLabel.new()
	detail_text.bbcode_enabled = true
	detail_text.fit_content = false
	detail_text.custom_minimum_size = Vector2(276.0, 148.0)
	detail_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_text.add_theme_font_override("normal_font", BackpackAwakenedVisualSkin.body_font())
	detail_text.add_theme_font_override("bold_font", BackpackAwakenedVisualSkin.display_font())
	detail_text.add_theme_font_size_override("normal_font_size", 13)
	detail_text.add_theme_color_override("default_color", BackpackAwakenedVisualSkin.CREAM_TEXT)
	detail_text.text = _equipment_detail_text(detail)
	scroll.add_child(detail_text)
	return panel


func _make_comparison_actions(comparison: Dictionary, candidate: Dictionary) -> Control:
	var column := VBoxContainer.new()
	column.custom_minimum_size = Vector2(168.0, 454.0)
	column.add_theme_constant_override("separation", 10)
	var spacer_top := Control.new()
	spacer_top.custom_minimum_size.y = 46.0
	column.add_child(spacer_top)
	var warning := Label.new()
	warning.text = str(comparison.get("warningText", ""))
	warning.custom_minimum_size = Vector2(162.0, 82.0)
	warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warning.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	warning.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_body(warning, 13, warning.text == "")
	warning.add_theme_color_override(
		"font_color",
		BackpackAwakenedVisualSkin.LOSS_TEXT if warning.text != "" else BackpackAwakenedVisualSkin.MUTED_TEXT
	)
	column.add_child(warning)
	var flex := Control.new()
	flex.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(flex)
	var equip_button := Button.new()
	equip_button.text = "装备"
	equip_button.custom_minimum_size = Vector2(162.0, 48.0)
	BackpackAwakenedVisualSkin.apply_action_button(
		equip_button,
		false,
		not bool(comparison.get("canEquip", false))
	)
	equip_button.pressed.connect(_on_equip_pressed.bind(comparison, candidate))
	column.add_child(equip_button)
	var discard_button := Button.new()
	discard_button.text = "丢弃"
	discard_button.custom_minimum_size = Vector2(162.0, 48.0)
	BackpackAwakenedVisualSkin.apply_action_button(discard_button, true)
	discard_button.pressed.connect(_on_discard_candidate_pressed.bind(comparison, candidate))
	column.add_child(discard_button)
	var cancel_button := Button.new()
	cancel_button.text = "取消"
	cancel_button.custom_minimum_size = Vector2(162.0, 48.0)
	BackpackAwakenedVisualSkin.apply_action_button(cancel_button)
	cancel_button.pressed.connect(_hide_overlay)
	column.add_child(cancel_button)
	return column


func _show_stack_detail(row: Dictionary) -> void:
	_clear_overlay_content()
	_overlay_mode = "stack_detail"
	_overlay_content.position = Vector2(398.0, 132.0)
	_overlay_content.size = Vector2(484.0, 456.0)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	_overlay_content.add_child(column)
	column.add_child(_make_item_identity_block(
		str(row.get("itemId", "")),
		str(row.get("itemLabel", "物品")),
		str(row.get("stateSummary", "")),
		66.0,
		23
	))
	column.add_child(_divider())
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	var detail_label := RichTextLabel.new()
	detail_label.bbcode_enabled = true
	detail_label.custom_minimum_size = Vector2(430.0, 250.0)
	detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_label.add_theme_font_override("normal_font", BackpackAwakenedVisualSkin.body_font())
	detail_label.add_theme_font_size_override("normal_font_size", 15)
	detail_label.add_theme_color_override("default_color", BackpackAwakenedVisualSkin.CREAM_TEXT)
	var detail_value = row.get("detail", {})
	var detail := detail_value as Dictionary if detail_value is Dictionary else {}
	detail_label.text = "\n".join(_string_array(detail.get("detailLines", ["暂无更多说明"])))
	scroll.add_child(detail_label)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	column.add_child(actions)
	var use_button := Button.new()
	use_button.text = str(row.get("useLabel", "使用"))
	use_button.custom_minimum_size = Vector2(96.0, 46.0)
	use_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	use_button.visible = bool(row.get("canUse", false))
	BackpackAwakenedVisualSkin.apply_action_button(use_button)
	use_button.pressed.connect(_on_use_pressed.bind(row))
	actions.add_child(use_button)
	if int(row.get("count", 0)) > 1:
		var split_button := Button.new()
		split_button.text = "拆分"
		split_button.custom_minimum_size = Vector2(96.0, 46.0)
		split_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		BackpackAwakenedVisualSkin.apply_action_button(split_button)
		split_button.pressed.connect(_on_split_pressed.bind(row))
		actions.add_child(split_button)
	var discard_button := Button.new()
	discard_button.text = "丢弃"
	discard_button.custom_minimum_size = Vector2(96.0, 46.0)
	discard_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(discard_button, true)
	discard_button.pressed.connect(_on_discard_row_pressed.bind(row))
	actions.add_child(discard_button)
	var cancel_button := Button.new()
	cancel_button.text = "取消"
	cancel_button.custom_minimum_size = Vector2(96.0, 46.0)
	cancel_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(cancel_button)
	cancel_button.pressed.connect(_hide_overlay)
	actions.add_child(cancel_button)
	_overlay_layer.visible = true


func _show_use_target_selection(pending_use: Dictionary) -> void:
	_clear_overlay_content()
	_overlay_mode = "pending_use"
	var target_rows := _dictionary_array(pending_use.get("targets", []))
	var panel_height := clampf(
		264.0 + float(maxi(1, target_rows.size())) * 72.0,
		336.0,
		512.0
	)
	_overlay_content.position = Vector2(
		398.0,
		(720.0 - panel_height) * 0.5
	)
	_overlay_content.size = Vector2(484.0, panel_height)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	_overlay_content.add_child(column)
	var heading := Label.new()
	heading.text = "选择使用目标"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_title(heading, 23)
	column.add_child(heading)
	column.add_child(_make_item_identity_block(
		str(pending_use.get("itemId", "")),
		str(pending_use.get("itemLabel", "物品")),
		str(pending_use.get("summary", "")),
		58.0,
		21
	))
	column.add_child(_divider())
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	var targets := VBoxContainer.new()
	targets.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	targets.add_theme_constant_override("separation", 8)
	scroll.add_child(targets)
	if target_rows.is_empty():
		var empty_label := Label.new()
		empty_label.text = "当前没有可用目标"
		empty_label.custom_minimum_size = Vector2(430.0, 90.0)
		empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		BackpackAwakenedVisualSkin.apply_body(empty_label, 16, true)
		targets.add_child(empty_label)
	else:
		for target in target_rows:
			var button := Button.new()
			button.text = "%s\n%s" % [
				str(target.get("label", "目标")),
				str(target.get("summary", "")),
			]
			button.custom_minimum_size = Vector2(430.0, 64.0)
			button.disabled = bool(target.get("disabled", false))
			button.set_meta(
				"backpack_target_type",
				str(target.get("targetType", ""))
			)
			button.set_meta(
				"backpack_target_id",
				str(target.get("targetId", ""))
			)
			if str(target.get("targetType", "")) == "pet":
				var pet_instance_id := str(target.get("targetId", ""))
				if pet_instance_id != "":
					_target_buttons_by_pet[pet_instance_id] = button
			BackpackAwakenedVisualSkin.apply_action_button(
				button,
				false,
				button.disabled
			)
			button.pressed.connect(
				_on_use_target_pressed.bind(
					str(pending_use.get("itemId", "")),
					target
				)
			)
			targets.add_child(button)
	var cancel_button := Button.new()
	cancel_button.text = "取消"
	cancel_button.custom_minimum_size = Vector2(0.0, 46.0)
	cancel_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(cancel_button)
	cancel_button.pressed.connect(_on_use_target_cancel_pressed)
	column.add_child(cancel_button)
	_overlay_layer.visible = true


func _show_equipped_detail(row: Dictionary) -> void:
	_clear_overlay_content()
	_overlay_mode = "equipped_detail"
	_overlay_content.position = Vector2(398.0, 132.0)
	_overlay_content.size = Vector2(484.0, 456.0)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 9)
	_overlay_content.add_child(column)
	var title := Label.new()
	title.text = "已装备 · %s" % str(row.get("slotLabel", "装备"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	BackpackAwakenedVisualSkin.apply_title(title, 22)
	column.add_child(title)
	var detail_value = row.get("detail", {})
	var detail := detail_value as Dictionary if detail_value is Dictionary else {}
	column.add_child(_make_item_identity_block(
		str(row.get("itemId", detail.get("itemId", ""))),
		str(row.get("itemLabel", detail.get("itemLabel", "装备"))),
		str(row.get("stateSummary", "")),
		62.0,
		23
	))
	column.add_child(_divider())
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	var detail_label := RichTextLabel.new()
	detail_label.bbcode_enabled = true
	detail_label.custom_minimum_size = Vector2(430.0, 264.0)
	detail_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_label.add_theme_font_override("normal_font", BackpackAwakenedVisualSkin.body_font())
	detail_label.add_theme_font_size_override("normal_font_size", 15)
	detail_label.add_theme_color_override("default_color", BackpackAwakenedVisualSkin.CREAM_TEXT)
	detail_label.text = _equipment_detail_text(detail)
	scroll.add_child(detail_label)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 12)
	column.add_child(actions)
	var unequip_button := Button.new()
	unequip_button.text = "卸下"
	unequip_button.custom_minimum_size = Vector2(205.0, 48.0)
	unequip_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(unequip_button)
	unequip_button.pressed.connect(_on_unequip_pressed.bind(str(row.get("slotId", ""))))
	actions.add_child(unequip_button)
	var cancel_button := Button.new()
	cancel_button.text = "取消"
	cancel_button.custom_minimum_size = Vector2(205.0, 48.0)
	cancel_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	BackpackAwakenedVisualSkin.apply_action_button(cancel_button)
	cancel_button.pressed.connect(_hide_overlay)
	actions.add_child(cancel_button)
	_overlay_layer.visible = true


func _equipment_detail_text(detail: Dictionary) -> String:
	var lines: Array[String] = []
	for line in _string_array(detail.get("detailLines", [])):
		if (
			line == str(detail.get("itemLabel", ""))
			or line.begins_with("类型：")
		):
			continue
		if line.begins_with("耐久：") or line.begins_with("精灵技能："):
			lines.append("[color=#d7ba68]%s[/color]" % line)
		elif line.begins_with("战斗招式："):
			lines.append("[color=#8ec9ee]%s[/color]" % line)
		elif line.find("未满足") >= 0 or line.find("损坏") >= 0:
			lines.append("[color=#ff5a52]%s[/color]" % line)
		elif line == "属性生效":
			lines.append("[color=#a1e857]%s[/color]" % line)
		else:
			lines.append(line)
	if lines.is_empty():
		lines.append("暂无更多说明")
	return "\n\n".join(lines)


func _detail_stat_rows(detail: Dictionary) -> Array[Dictionary]:
	var rows := _dictionary_array(detail.get("statRows", []))
	if not rows.is_empty():
		return rows
	var stats_value = detail.get("displayedStats", detail.get("effectiveStats", {}))
	var stats := stats_value as Dictionary if stats_value is Dictionary else {}
	var labels := [
		["maxHp", "生命"],
		["attack", "攻击"],
		["defense", "防御"],
		["quick", "敏捷"],
	]
	for stat_spec in labels:
		var key := str(stat_spec[0])
		rows.append({
			"key": key,
			"label": str(stat_spec[1]),
			"total": _stat_value(stats, key),
			"current": _stat_value(stats, key),
			"candidate": _stat_value(stats, key),
		})
	return rows


func _action_ref_for(row: Dictionary) -> Dictionary:
	var action_value = row.get("actionRef", {})
	if action_value is Dictionary:
		return (action_value as Dictionary).duplicate(true)
	return {
		"slotIndex": int(row.get("slotIndex", -1)),
		"itemId": str(row.get("itemId", "")),
		"instanceId": str(row.get("instanceId", "")),
	}


func _candidate_action_ref(comparison: Dictionary, candidate: Dictionary) -> Dictionary:
	var action_value = comparison.get("candidateActionRef", {})
	if action_value is Dictionary and not (action_value as Dictionary).is_empty():
		return (action_value as Dictionary).duplicate(true)
	var selection_key := str(comparison.get("candidateSelectionKey", ""))
	for row in _dictionary_array(_view_state.get("backpackRows", [])):
		if selection_key != "" and str(row.get("selectionKey", "")) == selection_key:
			return _action_ref_for(row)
	if not _selected_inventory_entry.is_empty():
		return _action_ref_for(_selected_inventory_entry)
	return {
		"slotIndex": int(candidate.get("slotIndex", -1)),
		"itemId": str(candidate.get("itemId", "")),
		"instanceId": str(comparison.get("candidateInstanceId", candidate.get("instanceId", ""))),
	}


func _on_equip_pressed(comparison: Dictionary, candidate: Dictionary) -> void:
	var action_ref := _candidate_action_ref(comparison, candidate)
	var item_id := str(action_ref.get("itemId", candidate.get("itemId", "")))
	var instance_id := str(
		action_ref.get(
			"instanceId",
			comparison.get("candidateInstanceId", candidate.get("instanceId", ""))
		)
	)
	if item_id == "":
		return
	equip_requested.emit(item_id, instance_id)
	_hide_overlay()


func _on_discard_candidate_pressed(comparison: Dictionary, candidate: Dictionary) -> void:
	var action_ref := _candidate_action_ref(comparison, candidate)
	var slot_index := int(action_ref.get("slotIndex", -1))
	var item_id := str(action_ref.get("itemId", candidate.get("itemId", "")))
	var instance_id := str(
		action_ref.get(
			"instanceId",
			comparison.get("candidateInstanceId", candidate.get("instanceId", ""))
		)
	)
	if slot_index < 0 or item_id == "":
		return
	discard_requested.emit(slot_index, item_id, instance_id)
	_hide_overlay()


func _on_use_pressed(row: Dictionary) -> void:
	var slot_index := int(row.get("slotIndex", -1))
	if slot_index < 0:
		return
	_hide_overlay()
	use_requested.emit(slot_index)


func _on_split_pressed(row: Dictionary) -> void:
	var slot_index := int(row.get("slotIndex", -1))
	var item_id := str(row.get("itemId", ""))
	var count := maxi(0, int(row.get("count", 0)))
	if slot_index < 0 or item_id == "" or count <= 1:
		return
	split_requested.emit(slot_index, item_id, count)
	_hide_overlay()


func _on_use_target_pressed(item_id: String, target: Dictionary) -> void:
	var target_type := str(target.get("targetType", ""))
	var target_id := str(target.get("targetId", ""))
	if item_id == "" or target_type == "":
		return
	_hide_overlay(false)
	use_target_requested.emit(item_id, target_type, target_id)


func _on_use_target_cancel_pressed() -> void:
	_hide_overlay(false)
	use_target_cancel_requested.emit()


func _on_discard_row_pressed(row: Dictionary) -> void:
	var action_ref := _action_ref_for(row)
	var slot_index := int(action_ref.get("slotIndex", row.get("slotIndex", -1)))
	var item_id := str(action_ref.get("itemId", row.get("itemId", "")))
	var instance_id := str(action_ref.get("instanceId", row.get("instanceId", "")))
	if slot_index < 0 or item_id == "":
		return
	discard_requested.emit(slot_index, item_id, instance_id)
	_hide_overlay()


func _on_unequip_pressed(slot_id: String) -> void:
	if slot_id == "":
		return
	unequip_requested.emit(slot_id)
	_hide_overlay()


func _on_filter_pressed(filter_id: String) -> void:
	if not _known_filter(filter_id):
		return
	_active_filter = filter_id
	_refresh_filter_buttons()
	filter_requested.emit(filter_id)


func _on_close_pressed() -> void:
	if _overlay_layer.visible:
		_hide_overlay()
		return
	close_requested.emit()


func _on_synthesis_pressed() -> void:
	synthesis_requested.emit()


func _on_repair_pressed() -> void:
	repair_requested.emit()


func _on_overlay_shade_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.pressed:
			_hide_overlay()
			accept_event()


func _unhandled_key_input(event: InputEvent) -> void:
	if not visible or not (event is InputEventKey):
		return
	var key_event := event as InputEventKey
	if key_event.pressed and not key_event.echo and key_event.keycode == KEY_ESCAPE:
		if _overlay_layer.visible:
			_hide_overlay()
		else:
			close_requested.emit()
		get_viewport().set_input_as_handled()


func _hide_overlay(cancel_pending_use: bool = true) -> void:
	var should_cancel_pending := (
		cancel_pending_use
		and _overlay_layer.visible
		and _overlay_mode == "pending_use"
	)
	_overlay_layer.visible = false
	_selected_key = ""
	_overlay_mode = ""
	_target_buttons_by_pet.clear()
	if should_cancel_pending:
		use_target_cancel_requested.emit()


func _clear_overlay_content() -> void:
	_target_buttons_by_pet.clear()
	for child in _overlay_content.get_children():
		_overlay_content.remove_child(child)
		child.queue_free()


func target_button_for_pet(instance_id: String):
	var normalized_id := instance_id.strip_edges()
	if normalized_id == "":
		return null
	var button = _target_buttons_by_pet.get(normalized_id, null)
	if (
		button is Button
		and is_instance_valid(button)
		and (button as Button).is_visible_in_tree()
	):
		return button
	return null


func _divider() -> Control:
	var divider := Panel.new()
	divider.custom_minimum_size = Vector2(0.0, 1.0)
	divider.add_theme_stylebox_override("panel", BackpackAwakenedVisualSkin.divider_style())
	return divider


func _make_item_identity_block(
	item_id: String,
	item_name: String,
	subtitle: String,
	icon_size: float,
	title_size: int
) -> Control:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	if item_id != "":
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(icon_size, icon_size)
		icon.texture = BackpackAwakenedVisualSkin.item_texture_for(item_id)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(icon)
	var labels := VBoxContainer.new()
	labels.custom_minimum_size.x = 210.0
	labels.add_theme_constant_override("separation", 2)
	row.add_child(labels)
	var name_label := Label.new()
	name_label.text = item_name
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	BackpackAwakenedVisualSkin.apply_title(name_label, title_size)
	labels.add_child(name_label)
	if subtitle.strip_edges() != "":
		var subtitle_label := Label.new()
		subtitle_label.text = subtitle
		subtitle_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		BackpackAwakenedVisualSkin.apply_body(subtitle_label, 13, true)
		labels.add_child(subtitle_label)
	return row


func _missing_equipment_slot(index: int) -> Dictionary:
	var fallback: Dictionary = (
		EQUIPMENT_SLOT_FALLBACKS[index]
		if index >= 0 and index < EQUIPMENT_SLOT_FALLBACKS.size()
		else {"id": "", "label": "装备"}
	)
	return {
		"kind": "empty",
		"slotId": str(fallback.get("id", "")),
		"slotLabel": str(fallback.get("label", "装备")),
		"itemLabel": "未装备",
		"occupied": false,
		"canSelect": true,
	}


func _character_shadow_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.34)
	style.set_corner_radius_all(16)
	style.skew = Vector2(0.45, 0.0)
	return style


func _known_filter(filter_id: String) -> bool:
	for option in FILTERS:
		if str(option.get("id", "")) == filter_id:
			return true
	return false


func _dictionary_array(value) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not (value is Array):
		return result
	for entry_value in value as Array:
		if entry_value is Dictionary:
			result.append((entry_value as Dictionary).duplicate(true))
	return result


func _string_array(value) -> Array[String]:
	var result: Array[String] = []
	if value is Array:
		for line in value as Array:
			var text := str(line).strip_edges()
			if text != "":
				result.append(text)
	elif str(value).strip_edges() != "":
		result.append(str(value).strip_edges())
	return result


func _first_int(source: Dictionary, keys: Array, fallback: int) -> int:
	for key_value in keys:
		if source.has(key_value):
			return int(source.get(key_value, fallback))
	return fallback


func _stat_value(stats: Dictionary, key: String) -> int:
	if stats.has(key):
		return int(stats.get(key, 0))
	if key == "maxHp":
		return int(stats.get("health", 0))
	if key == "quick":
		return int(stats.get("agility", 0))
	return 0


func _compact_number(value: int) -> String:
	var absolute := absi(value)
	if absolute >= 100000000:
		return "%.1f亿" % (float(value) / 100000000.0)
	if absolute >= 10000:
		return "%.1f万" % (float(value) / 10000.0)
	return str(value)
