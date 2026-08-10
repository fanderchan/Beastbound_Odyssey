extends PanelContainer
class_name EquipmentSynthesisAwakenedPanel

const CommerceAwakenedVisualSkin := preload(
	"res://scripts/ui/commerce_awakened_visual_skin.gd"
)
const HEADER_ICON_TEXTURE := preload(
	"res://assets/ui/world_hud_awakened_v1/runtime/icons/equipment.png"
)

signal close_requested
signal back_requested
signal synthesis_confirmed

const CANVAS_SIZE := Vector2(1280.0, 720.0)
const MATERIAL_SLOT_COUNT := 3

var list_container: VBoxContainer
var detail_label: RichTextLabel
var action_button: Button
var back_button: Button
var close_button: Button

var _built := false
var _canvas: Control
var _output_icon: TextureRect
var _output_name_label: Label
var _description_label: Label
var _success_label: Label
var _stone_label: Label
var _status_label: Label
var _material_panels: Array[PanelContainer] = []
var _material_icons: Array[TextureRect] = []
var _material_labels: Array[Label] = []
var _confirmation_scrim: ColorRect
var _confirmation_panel: PanelContainer
var _confirmation_summary: Label
var _view_state: Dictionary = {}


func _ready() -> void:
	_ensure_built()


func prepare() -> void:
	_ensure_built()


func is_awakened_equipment_synthesis_panel() -> bool:
	return true


func apply_view_state(state: Dictionary) -> void:
	_ensure_built()
	_view_state = state.duplicate(true)
	var output_item_id := str(state.get("outputItemId", ""))
	_output_icon.texture = CommerceAwakenedVisualSkin.item_texture_for(output_item_id)
	_output_icon.visible = _output_icon.texture != null
	_output_name_label.text = str(state.get("outputLabel", "请选择配方"))
	_description_label.text = str(state.get("description", ""))
	_success_label.text = "成功率 %d%%" % int(state.get("successPercent", 0))
	var stone_held := int(state.get("stoneHeld", 0))
	var stone_cost := int(state.get("stoneCost", 0))
	_stone_label.text = "石币 %d / %d" % [stone_held, stone_cost]
	_stone_label.add_theme_color_override(
		"font_color",
		CommerceAwakenedVisualSkin.SUCCESS_TEXT
		if bool(state.get("stoneEnough", false))
		else CommerceAwakenedVisualSkin.ERROR_TEXT
	)
	_status_label.text = str(state.get("statusText", ""))
	_status_label.add_theme_color_override(
		"font_color",
		CommerceAwakenedVisualSkin.SUCCESS_TEXT
		if bool(state.get("canSynthesize", false))
		else CommerceAwakenedVisualSkin.ERROR_TEXT
	)
	_apply_materials(state.get("materials", []))
	_update_confirmation_summary()


func decorate_recipe_buttons(buttons: Dictionary, selected_recipe_id: String) -> void:
	for key_value in buttons.keys():
		var button_value = buttons.get(key_value)
		if not (button_value is Button):
			continue
		var button := button_value as Button
		var recipe_id := str(key_value)
		var output_item_id := str(button.get_meta("output_item_id", ""))
		CommerceAwakenedVisualSkin.apply_item_button(
			button,
			output_item_id,
			recipe_id == selected_recipe_id
		)
		button.custom_minimum_size = Vector2(0.0, 86.0)
	CommerceAwakenedVisualSkin.apply_action_button(action_button)
	CommerceAwakenedVisualSkin.apply_tab_button(back_button, false)


func confirmation_visible() -> bool:
	return _confirmation_scrim != null and _confirmation_scrim.visible


func hide_confirmation() -> void:
	if _confirmation_scrim != null:
		_confirmation_scrim.visible = false


func _ensure_built() -> void:
	if _built:
		return
	_built = true
	name = "EquipmentSynthesisAwakenedPanel"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	custom_minimum_size = CANVAS_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	add_theme_stylebox_override("panel", CommerceAwakenedVisualSkin.transparent_panel_style())

	_canvas = Control.new()
	_canvas.name = "EquipmentSynthesisAwakenedCanvas"
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
	_build_recipe_list()
	_build_workbench()
	_build_navigation()
	_build_confirmation()


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
	title.text = "锻造"
	title.position = Vector2(112.0, 10.0)
	title.size = Vector2(300.0, 48.0)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(title, 29)
	_canvas.add_child(title)
	close_button = Button.new()
	close_button.name = "EquipmentSynthesisCloseButton"
	close_button.position = Vector2(1194.0, 9.0)
	close_button.size = Vector2(58.0, 52.0)
	CommerceAwakenedVisualSkin.apply_close_button(close_button)
	close_button.pressed.connect(func() -> void: close_requested.emit())
	_canvas.add_child(close_button)


func _build_recipe_list() -> void:
	var heading := Label.new()
	heading.text = "装备配方"
	heading.position = Vector2(92.0, 105.0)
	heading.size = Vector2(250.0, 42.0)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(heading, 20)
	_canvas.add_child(heading)
	var scroll := ScrollContainer.new()
	scroll.position = Vector2(90.0, 154.0)
	scroll.size = Vector2(256.0, 491.0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_canvas.add_child(scroll)
	list_container = VBoxContainer.new()
	list_container.custom_minimum_size = Vector2(239.0, 0.0)
	list_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_container.add_theme_constant_override("separation", 8)
	scroll.add_child(list_container)


func _build_workbench() -> void:
	_output_name_label = Label.new()
	_output_name_label.text = "请选择配方"
	_output_name_label.position = Vector2(405.0, 101.0)
	_output_name_label.size = Vector2(530.0, 42.0)
	_output_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_output_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(_output_name_label, 22)
	_canvas.add_child(_output_name_label)

	var output_panel := PanelContainer.new()
	output_panel.position = Vector2(591.0, 151.0)
	output_panel.size = Vector2(158.0, 136.0)
	output_panel.add_theme_stylebox_override(
		"panel", CommerceAwakenedVisualSkin.slot_style(true, false)
	)
	_canvas.add_child(output_panel)
	_output_icon = TextureRect.new()
	_output_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_output_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_output_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_output_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	output_panel.add_child(_output_icon)

	_description_label = Label.new()
	_description_label.position = Vector2(425.0, 294.0)
	_description_label.size = Vector2(490.0, 42.0)
	_description_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_description_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_body(_description_label, 13, true)
	_canvas.add_child(_description_label)

	_success_label = _label("成功率 0%", Vector2(424.0, 339.0), Vector2(235.0, 30.0), 15)
	_success_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_canvas.add_child(_success_label)
	_stone_label = _label("石币 0 / 0", Vector2(682.0, 339.0), Vector2(235.0, 30.0), 15)
	_stone_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_canvas.add_child(_stone_label)

	for index in range(MATERIAL_SLOT_COUNT):
		var panel := PanelContainer.new()
		panel.position = Vector2(426.0 + index * 168.0, 381.0)
		panel.size = Vector2(150.0, 112.0)
		panel.add_theme_stylebox_override(
			"panel", CommerceAwakenedVisualSkin.slot_style(false, false)
		)
		_canvas.add_child(panel)
		var column := VBoxContainer.new()
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		panel.add_child(column)
		var material_icon := TextureRect.new()
		material_icon.custom_minimum_size = Vector2(58.0, 58.0)
		material_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		material_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		material_icon.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		material_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(material_icon)
		var material_label := Label.new()
		material_label.text = "无需材料"
		material_label.custom_minimum_size = Vector2(132.0, 34.0)
		material_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		material_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		material_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		CommerceAwakenedVisualSkin.apply_body(material_label, 12, true)
		column.add_child(material_label)
		_material_panels.append(panel)
		_material_icons.append(material_icon)
		_material_labels.append(material_label)

	var attribute_heading := _label(
		"成品属性", Vector2(425.0, 508.0), Vector2(490.0, 30.0), 17
	)
	attribute_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_canvas.add_child(attribute_heading)
	var detail_shell := PanelContainer.new()
	detail_shell.position = Vector2(425.0, 541.0)
	detail_shell.size = Vector2(490.0, 101.0)
	detail_shell.add_theme_stylebox_override(
		"panel", CommerceAwakenedVisualSkin.dark_panel_style(0.76, 8)
	)
	_canvas.add_child(detail_shell)
	detail_label = RichTextLabel.new()
	detail_label.bbcode_enabled = true
	detail_label.fit_content = false
	detail_label.scroll_active = true
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_rich_text(detail_label, 13)
	detail_shell.add_child(detail_label)


func _build_navigation() -> void:
	var section := Label.new()
	section.text = "锻造功能"
	section.position = Vector2(982.0, 105.0)
	section.size = Vector2(176.0, 42.0)
	section.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	section.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(section, 20)
	_canvas.add_child(section)
	var selected_tab := Button.new()
	selected_tab.text = "装备合成"
	selected_tab.position = Vector2(982.0, 161.0)
	selected_tab.size = Vector2(176.0, 52.0)
	selected_tab.toggle_mode = true
	selected_tab.set_pressed_no_signal(true)
	selected_tab.mouse_filter = Control.MOUSE_FILTER_IGNORE
	selected_tab.focus_mode = Control.FOCUS_NONE
	CommerceAwakenedVisualSkin.apply_tab_button(selected_tab, true)
	_canvas.add_child(selected_tab)
	back_button = Button.new()
	back_button.text = "装备强化"
	back_button.position = Vector2(982.0, 221.0)
	back_button.size = Vector2(176.0, 52.0)
	CommerceAwakenedVisualSkin.apply_tab_button(back_button, false)
	back_button.pressed.connect(func() -> void: back_requested.emit())
	_canvas.add_child(back_button)

	_status_label = _label("", Vector2(973.0, 326.0), Vector2(194.0, 86.0), 13)
	_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_canvas.add_child(_status_label)
	action_button = Button.new()
	action_button.name = "EquipmentSynthesisActionButton"
	action_button.text = "开始合成"
	action_button.position = Vector2(982.0, 582.0)
	action_button.size = Vector2(176.0, 58.0)
	CommerceAwakenedVisualSkin.apply_action_button(action_button)
	action_button.pressed.connect(_show_confirmation)
	_canvas.add_child(action_button)


func _build_confirmation() -> void:
	_confirmation_scrim = ColorRect.new()
	_confirmation_scrim.name = "EquipmentSynthesisConfirmation"
	_confirmation_scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_confirmation_scrim.color = Color(0.015, 0.011, 0.008, 0.78)
	_confirmation_scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	_confirmation_scrim.visible = false
	_confirmation_scrim.z_index = 10
	_canvas.add_child(_confirmation_scrim)
	_confirmation_panel = PanelContainer.new()
	_confirmation_panel.position = Vector2(410.0, 211.0)
	_confirmation_panel.size = Vector2(460.0, 292.0)
	_confirmation_panel.add_theme_stylebox_override(
		"panel", CommerceAwakenedVisualSkin.dark_panel_style(0.98, 12)
	)
	_confirmation_scrim.add_child(_confirmation_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	_confirmation_panel.add_child(column)
	var title := Label.new()
	title.text = "确认合成"
	title.custom_minimum_size = Vector2(0.0, 48.0)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	CommerceAwakenedVisualSkin.apply_title(title, 24)
	column.add_child(title)
	_confirmation_summary = Label.new()
	_confirmation_summary.custom_minimum_size = Vector2(0.0, 124.0)
	_confirmation_summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_confirmation_summary.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_confirmation_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	CommerceAwakenedVisualSkin.apply_body(_confirmation_summary, 15)
	column.add_child(_confirmation_summary)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	column.add_child(row)
	var cancel_button := Button.new()
	cancel_button.name = "SynthesisConfirmationCancelButton"
	cancel_button.text = "再看看"
	cancel_button.custom_minimum_size = Vector2(0.0, 48.0)
	cancel_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	CommerceAwakenedVisualSkin.apply_tab_button(cancel_button, false)
	cancel_button.pressed.connect(hide_confirmation)
	row.add_child(cancel_button)
	var confirm_button := Button.new()
	confirm_button.name = "SynthesisConfirmationConfirmButton"
	confirm_button.text = "确认合成"
	confirm_button.custom_minimum_size = Vector2(0.0, 48.0)
	confirm_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	CommerceAwakenedVisualSkin.apply_action_button(confirm_button)
	confirm_button.pressed.connect(func() -> void:
		hide_confirmation()
		synthesis_confirmed.emit()
	)
	row.add_child(confirm_button)


func _show_confirmation() -> void:
	if action_button == null or action_button.disabled:
		return
	_update_confirmation_summary()
	_confirmation_scrim.visible = true


func _update_confirmation_summary() -> void:
	if _confirmation_summary == null:
		return
	var output_label := str(_view_state.get("outputLabel", "装备"))
	var material_parts: Array[String] = []
	var raw_materials = _view_state.get("materials", [])
	if raw_materials is Array:
		for value in raw_materials as Array:
			if value is Dictionary:
				var material := value as Dictionary
				material_parts.append("%s x%d" % [
					str(material.get("label", "材料")),
					int(material.get("required", 0)),
				])
	_confirmation_summary.text = "将消耗 %s 和 %d 石币\n合成 %s。\n确认后由服务器完成结算。" % [
		"、".join(material_parts),
		int(_view_state.get("stoneCost", 0)),
		output_label,
	]


func _apply_materials(raw_materials) -> void:
	var materials: Array = raw_materials as Array if raw_materials is Array else []
	var visible_count := mini(MATERIAL_SLOT_COUNT, materials.size())
	var total_width := float(visible_count * 150 + maxi(0, visible_count - 1) * 18)
	var start_x := 670.0 - total_width * 0.5
	for index in range(MATERIAL_SLOT_COUNT):
		var panel := _material_panels[index]
		var icon := _material_icons[index]
		var label := _material_labels[index]
		if index >= visible_count or not (materials[index] is Dictionary):
			panel.visible = false
			icon.texture = null
			icon.visible = false
			continue
		panel.visible = true
		panel.position.x = start_x + float(index) * 168.0
		var material := materials[index] as Dictionary
		var item_id := str(material.get("itemId", ""))
		icon.texture = CommerceAwakenedVisualSkin.item_texture_for(item_id)
		icon.visible = icon.texture != null
		label.text = "%s  %d/%d" % [
			str(material.get("label", "材料")),
			int(material.get("held", 0)),
			int(material.get("required", 0)),
		]
		var enough := bool(material.get("enough", false))
		label.add_theme_color_override(
			"font_color",
			CommerceAwakenedVisualSkin.SUCCESS_TEXT
			if enough else CommerceAwakenedVisualSkin.ERROR_TEXT
		)
		panel.add_theme_stylebox_override(
			"panel", CommerceAwakenedVisualSkin.slot_style(enough, false)
		)


func _label(text_value: String, position_value: Vector2, size_value: Vector2, font_size: int) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.size = size_value
	CommerceAwakenedVisualSkin.apply_body(label, font_size)
	return label
